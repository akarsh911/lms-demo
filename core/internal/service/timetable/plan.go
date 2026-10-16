package timetable

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbellperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellscheduleperiod"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entdaypattern "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendardaysectionpattern"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
)

type scheduleRef struct {
	PeriodSchemeID uuid.UUID
	BellScheduleID uuid.UUID
}

type bellKey struct {
	BellScheduleID uuid.UUID
	PeriodID       uuid.UUID
}

type minuteSpan struct {
	Start int
	End   int
	Runs  bool
}

type planQuery struct {
	branchID  uuid.UUID
	from, to  time.Time
	half      Half
	statuses  []enttimetable.Status
	slotPreds []predicate.TimetableSlot
	devPreds  []predicate.TimetableDeviation
	skipSlots map[uuid.UUID]struct{}
	wholeDay  bool
}

type plan struct {
	branchID uuid.UUID
	from, to time.Time
	half     Half

	days      []SessionDay
	dayByKey  map[string]SessionDay
	schedules map[string][]scheduleRef

	periods    map[uuid.UUID]*tenantent.Period
	bell       map[bellKey]minuteSpan
	timetables map[uuid.UUID][]*tenantent.Timetable
	inForce    map[string]*tenantent.Timetable
	slots      map[uuid.UUID][]*tenantent.TimetableSlot
	slotByID   map[uuid.UUID]*tenantent.TimetableSlot
	devBySlot  map[string]*tenantent.TimetableDeviation
	additions  map[string][]*tenantent.TimetableDeviation

	dayPattern     map[string]int
	sectionPattern map[string]int
	uncovered      []Uncovered
}

func schemeDateKey(scheme uuid.UUID, date time.Time) string {
	return scheme.String() + "|" + dayKey(date)
}

func slotDateKey(slot uuid.UUID, date time.Time) string {
	return slot.String() + "|" + dayKey(date)
}

func sectionDateKey(section uuid.UUID, date time.Time) string {
	return section.String() + "|" + dayKey(date)
}

func (s *Service) buildPlan(ctx context.Context, q planQuery) (*plan, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	if (len(q.slotPreds) == 0) != (len(q.devPreds) == 0) {
		return nil, ErrScopeIncomplete
	}
	lo, hi, err := validRange(q.branchID, q.from, q.to, q.half)
	if err != nil {
		return nil, err
	}

	p := &plan{
		branchID:   q.branchID,
		from:       lo,
		to:         hi,
		half:       q.half,
		dayByKey:   map[string]SessionDay{},
		schedules:  map[string][]scheduleRef{},
		periods:    map[uuid.UUID]*tenantent.Period{},
		bell:       map[bellKey]minuteSpan{},
		timetables: map[uuid.UUID][]*tenantent.Timetable{},
		inForce:    map[string]*tenantent.Timetable{},
		slots:      map[uuid.UUID][]*tenantent.TimetableSlot{},
		slotByID:   map[uuid.UUID]*tenantent.TimetableSlot{},
		devBySlot:  map[string]*tenantent.TimetableDeviation{},
		additions:  map[string][]*tenantent.TimetableDeviation{},

		dayPattern:     map[string]int{},
		sectionPattern: map[string]int{},
	}

	rows, err := s.client.CalendarDay.Query().
		Where(
			entcalendarday.BranchID(q.branchID),
			entcalendarday.CalendarDateGTE(lo),
			entcalendarday.CalendarDateLTE(hi),
		).
		WithSchedules().
		Order(entcalendarday.ByCalendarDate()).
		All(ctx)
	if err != nil {
		return nil, err
	}

	var schemeIDs, bellIDs, dayIDs []uuid.UUID
	dayDates := map[uuid.UUID]time.Time{}
	for _, row := range rows {
		day := SessionDay{
			ID:                  row.ID,
			BranchID:            row.BranchID,
			Date:                Day(row.CalendarDate),
			DayType:             string(row.DayType),
			ForenoonOpen:        row.ForenoonOpen,
			AfternoonOpen:       row.AfternoonOpen,
			Name:                row.Name,
			SubstituteDayOfWeek: row.SubstituteDayOfWeek,
		}
		p.days = append(p.days, day)
		p.dayByKey[dayKey(day.Date)] = day
		dayIDs = append(dayIDs, row.ID)
		dayDates[row.ID] = day.Date
		if row.SubstituteDayOfWeek != nil {
			p.dayPattern[dayKey(day.Date)] = *row.SubstituteDayOfWeek
		}

		for _, sched := range row.Edges.Schedules {
			p.schedules[dayKey(day.Date)] = append(p.schedules[dayKey(day.Date)], scheduleRef{
				PeriodSchemeID: sched.PeriodSchemeID,
				BellScheduleID: sched.BellScheduleID,
			})
			schemeIDs = append(schemeIDs, sched.PeriodSchemeID)
			bellIDs = append(bellIDs, sched.BellScheduleID)
		}
	}
	schemeIDs = uniqueIDs(schemeIDs)
	bellIDs = uniqueIDs(bellIDs)

	if len(dayIDs) > 0 {
		patterns, err := s.client.CalendarDaySectionPattern.Query().
			Where(entdaypattern.CalendarDayIDIn(dayIDs...)).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, pattern := range patterns {
			date, known := dayDates[pattern.CalendarDayID]
			if !known {
				continue
			}
			p.sectionPattern[sectionDateKey(pattern.SectionID, date)] = pattern.SubstituteDayOfWeek
		}
	}

	if len(schemeIDs) > 0 {
		periods, err := s.client.Period.Query().
			Where(entperiod.PeriodSchemeIDIn(schemeIDs...)).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, period := range periods {
			p.periods[period.ID] = period
		}
	}

	if len(bellIDs) > 0 {
		spans, err := s.client.BellSchedulePeriod.Query().
			Where(entbellperiod.BellScheduleIDIn(bellIDs...)).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, span := range spans {
			p.bell[bellKey{BellScheduleID: span.BellScheduleID, PeriodID: span.PeriodID}] = minuteSpan{
				Start: span.StartMinute,
				End:   span.EndMinute,
				Runs:  span.Runs,
			}
		}
	}

	statuses := q.statuses
	if len(statuses) == 0 {
		statuses = []enttimetable.Status{enttimetable.StatusPublished}
	}

	var timetableIDs []uuid.UUID
	if len(schemeIDs) > 0 {
		versions, err := s.client.Timetable.Query().
			Where(
				enttimetable.PeriodSchemeIDIn(schemeIDs...),
				enttimetable.StatusIn(statuses...),
				enttimetable.EffectiveFromLTE(hi),
				enttimetable.Or(
					enttimetable.EffectiveToIsNil(),
					enttimetable.EffectiveToGTE(lo),
				),
			).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, version := range versions {
			p.timetables[version.PeriodSchemeID] = append(p.timetables[version.PeriodSchemeID], version)
		}
		for scheme := range p.timetables {
			sortTimetablesNewestFirst(p.timetables[scheme])
		}

		for _, day := range p.days {
			for _, sched := range p.schedules[dayKey(day.Date)] {
				chosen := pickTimetable(p.timetables[sched.PeriodSchemeID], day.Date)
				if chosen == nil {
					if day.Open(HalfAny) {
						p.uncovered = append(p.uncovered, Uncovered{
							Date:           Day(day.Date),
							PeriodSchemeID: sched.PeriodSchemeID,
						})
					}
					continue
				}
				p.inForce[schemeDateKey(sched.PeriodSchemeID, day.Date)] = chosen
				timetableIDs = append(timetableIDs, chosen.ID)
			}
		}
	}
	timetableIDs = uniqueIDs(timetableIDs)

	var slotIDs []uuid.UUID
	if len(timetableIDs) > 0 {
		preds := []predicate.TimetableSlot{entslot.TimetableIDIn(timetableIDs...)}
		preds = append(preds, q.slotPreds...)
		slots, err := s.client.TimetableSlot.Query().Where(preds...).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, slot := range slots {
			if _, skip := q.skipSlots[slot.ID]; skip {
				continue
			}
			p.slots[slot.TimetableID] = append(p.slots[slot.TimetableID], slot)
			p.slotByID[slot.ID] = slot
			slotIDs = append(slotIDs, slot.ID)
		}
	}

	devPreds := []predicate.TimetableDeviation{
		entdeviation.DeviationDateGTE(lo),
		entdeviation.DeviationDateLTE(hi),
		entdeviation.HasSectionWith(entsection.BranchID(q.branchID)),
	}
	if !q.wholeDay {
		reachable := []predicate.TimetableDeviation{
			entdeviation.TimetableSlotIDIsNil(),
		}
		if len(slotIDs) > 0 {
			reachable = append(reachable, entdeviation.TimetableSlotIDIn(slotIDs...))
		}
		devPreds = append(devPreds, entdeviation.Or(reachable...))
	}
	devPreds = append(devPreds, q.devPreds...)

	deviations, err := s.client.TimetableDeviation.Query().Where(devPreds...).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, dev := range deviations {
		if dev.TimetableSlotID != nil {
			p.devBySlot[slotDateKey(*dev.TimetableSlotID, dev.DeviationDate)] = dev
			continue
		}
		key := dayKey(dev.DeviationDate)
		p.additions[key] = append(p.additions[key], dev)
	}

	return p, nil
}

func sortTimetablesNewestFirst(versions []*tenantent.Timetable) {
	sort.SliceStable(versions, func(i, j int) bool {
		a, b := versions[i], versions[j]
		if !Day(a.EffectiveFrom).Equal(Day(b.EffectiveFrom)) {
			return Day(a.EffectiveFrom).After(Day(b.EffectiveFrom))
		}
		if a.Version != b.Version {
			return a.Version > b.Version
		}
		return a.CreatedAt.After(b.CreatedAt)
	})
}

func pickTimetable(versions []*tenantent.Timetable, date time.Time) *tenantent.Timetable {
	d := Day(date)
	for _, version := range versions {
		if Day(version.EffectiveFrom).After(d) {
			continue
		}
		if version.EffectiveTo != nil && Day(*version.EffectiveTo).Before(d) {
			continue
		}
		return version
	}
	return nil
}

func (p *plan) dayOfWeekFor(date time.Time, sectionID uuid.UUID) int {
	if dow, ok := p.sectionPattern[sectionDateKey(sectionID, date)]; ok {
		return dow
	}
	if dow, ok := p.dayPattern[dayKey(date)]; ok {
		return dow
	}
	return ISODayOfWeek(date)
}

func (p *plan) span(bellScheduleID, periodID uuid.UUID) (minuteSpan, bool) {
	span, ok := p.bell[bellKey{BellScheduleID: bellScheduleID, PeriodID: periodID}]
	return span, ok
}

func (p *plan) suppressed(bellScheduleID, periodID uuid.UUID) bool {
	span, ok := p.bell[bellKey{BellScheduleID: bellScheduleID, PeriodID: periodID}]
	return ok && !span.Runs
}
