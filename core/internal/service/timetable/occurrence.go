package timetable

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
)

var (
	NamespaceOccurrence      = uuid.MustParse("f9011ce3-5ad8-4c13-b605-54fa5642aa3f")
	NamespaceAddedOccurrence = uuid.MustParse("f84dfed2-e155-491f-a02b-233eef515d51")
)

func OccurrenceID(slotID uuid.UUID, date time.Time) uuid.UUID {
	return uuid.NewSHA1(NamespaceOccurrence, []byte(slotID.String()+"|"+Day(date).Format(dateLayout)))
}

func AddedOccurrenceID(deviationID uuid.UUID, date time.Time) uuid.UUID {
	return uuid.NewSHA1(NamespaceAddedOccurrence, []byte(deviationID.String()+"|"+Day(date).Format(dateLayout)))
}

type State string

const (
	StatePlanned     State = "planned"
	StateCancelled   State = "cancelled"
	StateSubstituted State = "substituted"
	StateRelocated   State = "relocated"
	StateRescheduled State = "rescheduled"
	StateAdded       State = "added"
)

func stateOf(kind entdeviation.Kind) State {
	switch kind {
	case entdeviation.KindCancelled:
		return StateCancelled
	case entdeviation.KindSubstitution:
		return StateSubstituted
	case entdeviation.KindRoomChange:
		return StateRelocated
	case entdeviation.KindTimeChange:
		return StateRescheduled
	case entdeviation.KindAdded:
		return StateAdded
	}
	return StatePlanned
}

type Occurrence struct {
	ID                uuid.UUID `json:"id"`
	Date              time.Time `json:"date"`
	DayOfWeek         int       `json:"day_of_week"`
	CalendarDayOfWeek int       `json:"calendar_day_of_week"`
	Half              Half      `json:"half,omitempty"`
	State             State     `json:"state"`

	BranchID       uuid.UUID  `json:"branch_id"`
	CalendarDayID  uuid.UUID  `json:"calendar_day_id"`
	DayType        string     `json:"day_type"`
	PeriodSchemeID uuid.UUID  `json:"period_scheme_id"`
	BellScheduleID uuid.UUID  `json:"bell_schedule_id"`
	TimetableID    *uuid.UUID `json:"timetable_id,omitempty"`
	SlotID         *uuid.UUID `json:"timetable_slot_id,omitempty"`
	DeviationID    *uuid.UUID `json:"timetable_deviation_id,omitempty"`
	DeviationKind  *string    `json:"deviation_kind,omitempty"`

	SectionID      uuid.UUID `json:"section_id"`
	PeriodID       uuid.UUID `json:"period_id"`
	PeriodCode     string    `json:"period_code,omitempty"`
	PeriodName     string    `json:"period_name,omitempty"`
	PeriodSequence int       `json:"period_sequence"`
	PeriodKind     string    `json:"period_kind,omitempty"`

	SubjectOfferingID        *uuid.UUID `json:"subject_offering_id,omitempty"`
	PlannedSubjectOfferingID *uuid.UUID `json:"planned_subject_offering_id,omitempty"`
	TeacherID                *uuid.UUID `json:"teacher_id,omitempty"`
	PlannedTeacherID         *uuid.UUID `json:"planned_teacher_id,omitempty"`
	RoomID                   *uuid.UUID `json:"room_id,omitempty"`
	PlannedRoomID            *uuid.UUID `json:"planned_room_id,omitempty"`
	Label                    *string    `json:"label,omitempty"`
	Reason                   *string    `json:"reason,omitempty"`

	StartMinute   int  `json:"start_minute"`
	EndMinute     int  `json:"end_minute"`
	TimesResolved bool `json:"times_resolved"`

	proposalRef string
}

func (o Occurrence) Cancelled() bool { return o.State == StateCancelled }

func (o Occurrence) DaySubstituted() bool {
	return o.CalendarDayOfWeek != 0 && o.DayOfWeek != o.CalendarDayOfWeek
}

func (o Occurrence) Added() bool { return o.State == StateAdded }

func (o Occurrence) SubjectDisplaced() bool {
	if o.PlannedSubjectOfferingID == nil {
		return false
	}
	return o.SubjectOfferingID == nil || *o.SubjectOfferingID != *o.PlannedSubjectOfferingID
}

type ResolveQuery struct {
	BranchID      uuid.UUID
	From          time.Time
	To            time.Time
	Half          Half
	Slots         []predicate.TimetableSlot
	Deviations    []predicate.TimetableDeviation
	Statuses      []enttimetable.Status
	OmitCancelled bool
}

type Uncovered struct {
	Date           time.Time `json:"date"`
	PeriodSchemeID uuid.UUID `json:"period_scheme_id"`
}

type Resolution struct {
	Occurrences []Occurrence
	Uncovered   []Uncovered
}

func (s *Service) Resolve(ctx context.Context, q ResolveQuery) ([]Occurrence, error) {
	resolved, err := s.ResolveCoverage(ctx, q)
	if err != nil {
		return nil, err
	}
	return resolved.Occurrences, nil
}

func (s *Service) ResolveCoverage(ctx context.Context, q ResolveQuery) (Resolution, error) {
	p, err := s.buildPlan(ctx, planQuery{
		branchID:  q.BranchID,
		from:      q.From,
		to:        q.To,
		half:      q.Half,
		statuses:  q.Statuses,
		slotPreds: q.Slots,
		devPreds:  q.Deviations,
	})
	if err != nil {
		return Resolution{}, err
	}

	out := make([]Occurrence, 0)
	for _, day := range p.days {
		out = append(out, p.occurrencesOn(day.Date, q.Half, q.OmitCancelled)...)
	}
	sortOccurrences(out)

	uncovered := p.uncovered
	if uncovered == nil {
		uncovered = []Uncovered{}
	}
	return Resolution{Occurrences: out, Uncovered: uncovered}, nil
}

func (s *Service) ResolveDay(
	ctx context.Context,
	branchID uuid.UUID,
	date time.Time,
	half Half,
	slots []predicate.TimetableSlot,
	deviations []predicate.TimetableDeviation,
) ([]Occurrence, error) {
	return s.Resolve(ctx, ResolveQuery{
		BranchID:   branchID,
		From:       date,
		To:         date,
		Half:       half,
		Slots:      slots,
		Deviations: deviations,
	})
}

func (p *plan) occurrencesOn(date time.Time, half Half, omitCancelled bool) []Occurrence {
	key := dayKey(date)
	day, ok := p.dayByKey[key]
	if !ok || !day.Open(HalfAny) {
		return nil
	}

	var out []Occurrence

	for _, sched := range p.schedules[key] {
		version := p.inForce[schemeDateKey(sched.PeriodSchemeID, date)]
		if version != nil {
			for _, slot := range p.slots[version.ID] {
				if slot.DayOfWeek != p.dayOfWeekFor(date, slot.SectionID) {
					continue
				}
				if p.suppressed(sched.BellScheduleID, slot.PeriodID) {
					continue
				}
				occ := p.fromSlot(day, sched, version, slot, date)
				if occ.Cancelled() && omitCancelled {
					continue
				}
				if !keepForHalf(occ, day, half) {
					continue
				}
				out = append(out, occ)
			}
		}

		for _, dev := range p.additions[key] {
			period, known := p.periods[dev.PeriodID]
			if !known || period.PeriodSchemeID != sched.PeriodSchemeID {
				continue
			}
			occ := p.fromAddition(day, sched, dev, date)
			if !keepForHalf(occ, day, half) {
				continue
			}
			out = append(out, occ)
		}
	}
	return out
}

func keepForHalf(occ Occurrence, day SessionDay, want Half) bool {
	if occ.Half == HalfAny {
		return true
	}
	if !day.Open(occ.Half) {
		return false
	}
	if want == HalfAny {
		return true
	}
	return occ.Half == want
}

func (p *plan) fromSlot(day SessionDay, sched scheduleRef, version *tenantent.Timetable, slot *tenantent.TimetableSlot, date time.Time) Occurrence {
	timetableID := version.ID
	slotID := slot.ID

	occ := Occurrence{
		ID:                       OccurrenceID(slot.ID, date),
		Date:                     Day(date),
		DayOfWeek:                slot.DayOfWeek,
		CalendarDayOfWeek:        ISODayOfWeek(date),
		State:                    StatePlanned,
		BranchID:                 p.branchID,
		CalendarDayID:            day.ID,
		DayType:                  day.DayType,
		PeriodSchemeID:           sched.PeriodSchemeID,
		BellScheduleID:           sched.BellScheduleID,
		TimetableID:              &timetableID,
		SlotID:                   &slotID,
		SectionID:                slot.SectionID,
		PeriodID:                 slot.PeriodID,
		SubjectOfferingID:        slot.SubjectOfferingID,
		PlannedSubjectOfferingID: slot.SubjectOfferingID,
		TeacherID:                slot.TeacherID,
		PlannedTeacherID:         slot.TeacherID,
		RoomID:                   slot.RoomID,
		PlannedRoomID:            slot.RoomID,
		Label:                    slot.Label,
	}
	p.describePeriod(&occ)

	if span, ok := p.span(sched.BellScheduleID, slot.PeriodID); ok {
		occ.StartMinute, occ.EndMinute, occ.TimesResolved = span.Start, span.End, true
	}

	if dev, ok := p.devBySlot[slotDateKey(slot.ID, date)]; ok {
		p.applyDeviation(&occ, dev)
	}
	occ.Half = halfOf(occ)
	return occ
}

func (p *plan) fromAddition(day SessionDay, sched scheduleRef, dev *tenantent.TimetableDeviation, date time.Time) Occurrence {
	deviationID := dev.ID

	occ := Occurrence{
		ID:                AddedOccurrenceID(dev.ID, date),
		Date:              Day(date),
		DayOfWeek:         ISODayOfWeek(date),
		CalendarDayOfWeek: ISODayOfWeek(date),
		State:             StateAdded,
		BranchID:          p.branchID,
		CalendarDayID:     day.ID,
		DayType:           day.DayType,
		PeriodSchemeID:    sched.PeriodSchemeID,
		BellScheduleID:    sched.BellScheduleID,
		DeviationID:       &deviationID,
		SectionID:         dev.SectionID,
		PeriodID:          dev.PeriodID,
		SubjectOfferingID: dev.SubjectOfferingID,
		TeacherID:         dev.SubstituteTeacherID,
		RoomID:            dev.RoomID,
		Reason:            dev.Reason,
	}
	kind := string(dev.Kind)
	occ.DeviationKind = &kind
	p.describePeriod(&occ)

	if span, ok := p.span(sched.BellScheduleID, dev.PeriodID); ok {
		occ.StartMinute, occ.EndMinute, occ.TimesResolved = span.Start, span.End, true
	}
	if dev.StartMinute != nil && dev.EndMinute != nil {
		occ.StartMinute, occ.EndMinute, occ.TimesResolved = *dev.StartMinute, *dev.EndMinute, true
	}
	occ.Half = halfOf(occ)
	return occ
}

func (p *plan) applyDeviation(occ *Occurrence, dev *tenantent.TimetableDeviation) {
	deviationID := dev.ID
	kind := string(dev.Kind)
	occ.DeviationID = &deviationID
	occ.DeviationKind = &kind
	occ.State = stateOf(dev.Kind)

	if dev.SubstituteTeacherID != nil {
		occ.TeacherID = dev.SubstituteTeacherID
	}
	if dev.RoomID != nil {
		occ.RoomID = dev.RoomID
	}
	if dev.SubjectOfferingID != nil {
		occ.SubjectOfferingID = dev.SubjectOfferingID
	}
	if dev.StartMinute != nil && dev.EndMinute != nil {
		occ.StartMinute, occ.EndMinute, occ.TimesResolved = *dev.StartMinute, *dev.EndMinute, true
	}
	if dev.Reason != nil {
		occ.Reason = dev.Reason
	}
}

func (p *plan) describePeriod(occ *Occurrence) {
	period, ok := p.periods[occ.PeriodID]
	if !ok {
		return
	}
	occ.PeriodCode = period.Code
	occ.PeriodName = period.Name
	occ.PeriodSequence = period.Sequence
	occ.PeriodKind = string(period.Kind)
}

func halfOf(occ Occurrence) Half {
	if !occ.TimesResolved {
		return HalfAny
	}
	return HalfOfMinute(occ.StartMinute)
}

func sortOccurrences(in []Occurrence) {
	sort.SliceStable(in, func(i, j int) bool {
		a, b := in[i], in[j]
		if !a.Date.Equal(b.Date) {
			return a.Date.Before(b.Date)
		}
		if a.StartMinute != b.StartMinute {
			return a.StartMinute < b.StartMinute
		}
		if a.PeriodSequence != b.PeriodSequence {
			return a.PeriodSequence < b.PeriodSequence
		}
		if a.SectionID != b.SectionID {
			return a.SectionID.String() < b.SectionID.String()
		}
		return a.ID.String() < b.ID.String()
	})
}
