package timetable

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const (
	MaxRangeDays          = 400
	HalfDayBoundaryMinute = 720

	dateLayout = "2006-01-02"
)

var (
	ErrNoClient         = errors.New("timetable: a tenant client is required")
	ErrBranchRequired   = errors.New("timetable: a branch is required")
	ErrRangeInverted    = errors.New("timetable: the end date precedes the start date")
	ErrRangeTooWide     = fmt.Errorf("timetable: a date range may not exceed %d days", MaxRangeDays)
	ErrHalfUnknown      = errors.New("timetable: unknown half of day")
	ErrNotFound         = errors.New("timetable: no such timetable")
	ErrDayOfWeekInvalid = errors.New("timetable: day of week must be 1 (Monday) through 7 (Sunday)")
	ErrSectionRequired  = errors.New("timetable: a proposed slot needs a section")
	ErrPeriodRequired   = errors.New("timetable: a proposed slot needs a period")
	ErrRuleUnknown      = errors.New("timetable: unknown clash rule")

	ErrScopeIncomplete = errors.New(
		"timetable: Slots and Deviations narrow different tables and must be supplied together; " +
			"narrowing one alone widens the read to the whole branch")
)

type Half string

const (
	HalfAny       Half = ""
	HalfForenoon  Half = "forenoon"
	HalfAfternoon Half = "afternoon"
)

func (h Half) Known() bool {
	switch h {
	case HalfAny, HalfForenoon, HalfAfternoon:
		return true
	}
	return false
}

func HalfOfMinute(minute int) Half {
	if minute < HalfDayBoundaryMinute {
		return HalfForenoon
	}
	return HalfAfternoon
}

type Service struct {
	client *tenantent.Client
}

func New(client *tenantent.Client) *Service { return &Service{client: client} }

func FromContext(ctx context.Context) (*Service, error) {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return New(client), nil
}

func (s *Service) Client() *tenantent.Client {
	if s == nil {
		return nil
	}
	return s.client
}

func (s *Service) ready() error {
	if s == nil || s.client == nil {
		return ErrNoClient
	}
	return nil
}

func Day(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func ISODayOfWeek(t time.Time) int {
	d := int(Day(t).Weekday())
	if d == 0 {
		return 7
	}
	return d
}

func dayKey(t time.Time) string { return Day(t).Format(dateLayout) }

func validRange(branchID uuid.UUID, from, to time.Time, half Half) (time.Time, time.Time, error) {
	if branchID == uuid.Nil {
		return time.Time{}, time.Time{}, ErrBranchRequired
	}
	if !half.Known() {
		return time.Time{}, time.Time{}, ErrHalfUnknown
	}
	lo, hi := Day(from), Day(to)
	if hi.Before(lo) {
		return time.Time{}, time.Time{}, ErrRangeInverted
	}
	if int(hi.Sub(lo).Hours()/24)+1 > MaxRangeDays {
		return time.Time{}, time.Time{}, ErrRangeTooWide
	}
	return lo, hi, nil
}

func eachDay(from, to time.Time) []time.Time {
	var out []time.Time
	for d := Day(from); !d.After(Day(to)); d = d.AddDate(0, 0, 1) {
		out = append(out, d)
	}
	return out
}

func firstDayOfWeekOnOrAfter(from time.Time, to *time.Time, dow int) *time.Time {
	d := Day(from)
	for i := 0; i < 7; i++ {
		if ISODayOfWeek(d) == dow {
			if to != nil && d.After(Day(*to)) {
				return nil
			}
			found := d
			return &found
		}
		d = d.AddDate(0, 0, 1)
	}
	return nil
}

func overlap(aFrom time.Time, aTo *time.Time, bFrom time.Time, bTo *time.Time) (time.Time, *time.Time, bool) {
	lo := Day(aFrom)
	if b := Day(bFrom); b.After(lo) {
		lo = b
	}
	var hi *time.Time
	switch {
	case aTo == nil && bTo == nil:
	case aTo == nil:
		h := Day(*bTo)
		hi = &h
	case bTo == nil:
		h := Day(*aTo)
		hi = &h
	default:
		h := Day(*aTo)
		if o := Day(*bTo); o.Before(h) {
			h = o
		}
		hi = &h
	}
	if hi != nil && hi.Before(lo) {
		return time.Time{}, nil, false
	}
	return lo, hi, true
}

func uniqueIDs(in []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(in))
	out := make([]uuid.UUID, 0, len(in))
	for _, id := range in {
		if id == uuid.Nil {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
