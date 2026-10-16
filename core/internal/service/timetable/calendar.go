package timetable

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
)

type SessionDay struct {
	ID            uuid.UUID `json:"id"`
	BranchID      uuid.UUID `json:"branch_id"`
	Date          time.Time `json:"date"`
	DayType       string    `json:"day_type"`
	ForenoonOpen  bool      `json:"forenoon_open"`
	AfternoonOpen bool      `json:"afternoon_open"`
	Name          *string   `json:"name,omitempty"`

	SubstituteDayOfWeek *int `json:"substitute_day_of_week,omitempty"`
}

func (d SessionDay) Open(half Half) bool {
	switch half {
	case HalfForenoon:
		return d.ForenoonOpen
	case HalfAfternoon:
		return d.AfternoonOpen
	default:
		return d.ForenoonOpen || d.AfternoonOpen
	}
}

func (s *Service) IsInSession(ctx context.Context, branchID uuid.UUID, date time.Time, half Half) (bool, error) {
	days, err := s.Calendar(ctx, branchID, date, date, half)
	if err != nil {
		return false, err
	}
	for _, d := range days {
		if dayKey(d.Date) == dayKey(date) {
			return d.Open(half), nil
		}
	}
	return false, nil
}

func (s *Service) Calendar(ctx context.Context, branchID uuid.UUID, from, to time.Time, half Half) ([]SessionDay, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	lo, hi, err := validRange(branchID, from, to, half)
	if err != nil {
		return nil, err
	}

	rows, err := s.client.CalendarDay.Query().
		Where(
			entcalendarday.BranchID(branchID),
			entcalendarday.CalendarDateGTE(lo),
			entcalendarday.CalendarDateLTE(hi),
		).
		Order(entcalendarday.ByCalendarDate()).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make([]SessionDay, 0, len(rows))
	for _, row := range rows {
		out = append(out, SessionDay{
			ID:                  row.ID,
			BranchID:            row.BranchID,
			Date:                Day(row.CalendarDate),
			DayType:             string(row.DayType),
			ForenoonOpen:        row.ForenoonOpen,
			AfternoonOpen:       row.AfternoonOpen,
			Name:                row.Name,
			SubstituteDayOfWeek: row.SubstituteDayOfWeek,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date.Before(out[j].Date) })
	return out, nil
}

func (s *Service) SessionDays(ctx context.Context, branchID uuid.UUID, from, to time.Time, half Half) ([]SessionDay, error) {
	all, err := s.Calendar(ctx, branchID, from, to, half)
	if err != nil {
		return nil, err
	}
	out := make([]SessionDay, 0, len(all))
	for _, d := range all {
		if d.Open(half) {
			out = append(out, d)
		}
	}
	return out, nil
}

func (s *Service) SessionDates(ctx context.Context, branchID uuid.UUID, from, to time.Time, half Half) ([]time.Time, error) {
	days, err := s.SessionDays(ctx, branchID, from, to, half)
	if err != nil {
		return nil, err
	}
	out := make([]time.Time, 0, len(days))
	for _, d := range days {
		out = append(out, d.Date)
	}
	return out, nil
}
