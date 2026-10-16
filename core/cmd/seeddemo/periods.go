package main

import (
	"context"
	"fmt"
	"sort"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entdayschedule "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendardayschedule"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	entschemegrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodschemegradelevel"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	svc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

const (
	periodsPerWeekDefault         = 4
	periodsPerWeekElectiveDefault = 3
	nominalPeriodMinutes          = 45
	electiveSubjectType           = "elective"
)

var periodsPerWeekBySubject = map[string]int{
	"MATH": 6,
	"ENG":  6,
	"SCI":  6,
	"SST":  5,
	"HIN":  5,
	"SAN":  3,
	"FRE":  3,
}

func periodsPerWeekFor(subject *tenantent.Subject) int {
	if subject == nil {
		return periodsPerWeekDefault
	}
	if n, named := periodsPerWeekBySubject[subject.Code]; named {
		return n
	}
	if isElective(subject) {
		return periodsPerWeekElectiveDefault
	}
	return periodsPerWeekDefault
}

func isElective(subject *tenantent.Subject) bool {
	return subject != nil && (subject.IsElective || subject.SubjectType == electiveSubjectType)
}

type schemeDay struct {
	scheme uuid.UUID
	dow    int
}

type bellPeriod struct {
	bell   uuid.UUID
	period uuid.UUID
}

type weekGrid struct {
	bellOfDay map[schemeDay]uuid.UUID
	span      map[bellPeriod]int
	teaching  map[uuid.UUID]bool
	days      map[uuid.UUID][]int
}

func (g *weekGrid) periodsAWeek(scheme uuid.UUID) int {
	total := 0
	for _, dow := range g.days[scheme] {
		bell, known := g.bellOfDay[schemeDay{scheme: scheme, dow: dow}]
		if !known {
			continue
		}
		for key := range g.span {
			if key.bell == bell && g.teaching[key.period] {
				total++
			}
		}
	}
	return total
}

func (g *weekGrid) minutesAWeek(scheme uuid.UUID) int {
	total := 0
	for _, dow := range g.days[scheme] {
		bell, known := g.bellOfDay[schemeDay{scheme: scheme, dow: dow}]
		if !known {
			continue
		}
		for key, minutes := range g.span {
			if key.bell == bell && g.teaching[key.period] {
				total += minutes
			}
		}
	}
	return total
}

func (g *weekGrid) slotMinutes(scheme uuid.UUID, dow int, period uuid.UUID) int {
	bell, known := g.bellOfDay[schemeDay{scheme: scheme, dow: dow}]
	if !known {
		return 0
	}
	return g.span[bellPeriod{bell: bell, period: period}]
}

func (g *weekGrid) nominalMinutes(scheme uuid.UUID) int {
	counts := map[int]int{}
	for _, dow := range g.days[scheme] {
		bell, known := g.bellOfDay[schemeDay{scheme: scheme, dow: dow}]
		if !known {
			continue
		}
		for key, minutes := range g.span {
			if key.bell == bell && g.teaching[key.period] {
				counts[minutes]++
			}
		}
	}
	best, seen := nominalPeriodMinutes, 0
	for minutes, n := range counts {
		if n > seen || (n == seen && minutes > best) {
			best, seen = minutes, n
		}
	}
	return best
}

type sectionLoad struct {
	name            string
	offerings       int
	periods         int
	electivePeriods int
	minutes         int
	electiveMinutes int
	placedPeriods   int
	placedMinutes   int
	availPeriods    int
	availMinutes    int
}

func (l sectionLoad) requiredPeriods() int { return l.periods + l.electivePeriods }
func (l sectionLoad) requiredMinutes() int { return l.minutes + l.electiveMinutes }

func (s *seeder) periodsPerWeek(ctx context.Context, a *academics) error {
	if !s.o.withPeriods {
		return nil
	}
	if s.o.dryRun {
		fmt.Println("dry run: periods per week are planned against real offerings, so they are skipped")
		return nil
	}

	subjects, err := s.subjectsByID(ctx)
	if err != nil {
		return err
	}
	grid, err := s.weekGrid(ctx, a)
	if err != nil {
		return err
	}
	scheme, err := s.schemeOfGrade(ctx, a)
	if err != nil {
		return err
	}
	gradeOfSection := map[uuid.UUID]uuid.UUID{}
	for _, section := range a.sections {
		gradeOfSection[section.ID] = section.GradeLevelID
	}

	rows, err := s.client.SubjectOffering.Query().
		Where(entoffering.AcademicSessionID(a.session.ID)).All(ctx)
	if err != nil {
		return err
	}

	filledPeriods, filledMinutes := 0, 0
	for _, offering := range rows {
		periods := offering.PeriodsPerWeek
		if periods == nil {
			want := periodsPerWeekFor(subjects[offering.SubjectID])
			periods = &want
			if _, err := s.client.SubjectOffering.UpdateOneID(offering.ID).
				SetPeriodsPerWeek(want).Save(ctx); err != nil {
				return err
			}
			filledPeriods++
			s.note("periods_per_week", 1)
		}
		if offering.MinutesPerWeek != nil {
			continue
		}
		nominal := grid.nominalMinutes(scheme[gradeOfSection[offering.SectionID]])
		if _, err := s.client.SubjectOffering.UpdateOneID(offering.ID).
			SetMinutesPerWeek(*periods * nominal).Save(ctx); err != nil {
			return err
		}
		filledMinutes++
		s.note("minutes_per_week", 1)
	}

	fmt.Printf("periods per week: %d of %d offerings filled in, %d already carried a value\n",
		filledPeriods, len(rows), len(rows)-filledPeriods)
	fmt.Printf("minutes per week: %d of %d offerings filled in, %d already carried a value\n",
		filledMinutes, len(rows), len(rows)-filledMinutes)

	return s.reportPeriodLoad(ctx, a, subjects, grid, scheme, gradeOfSection)
}

func (s *seeder) subjectsByID(ctx context.Context) (map[uuid.UUID]*tenantent.Subject, error) {
	rows, err := s.client.Subject.Query().All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]*tenantent.Subject, len(rows))
	for _, row := range rows {
		out[row.ID] = row
	}
	return out, nil
}

func (s *seeder) reportPeriodLoad(ctx context.Context, a *academics,
	subjects map[uuid.UUID]*tenantent.Subject, grid *weekGrid,
	scheme map[uuid.UUID]uuid.UUID, gradeOfSection map[uuid.UUID]uuid.UUID) error {
	placedPeriods, placedMinutes, err := s.placedLoad(ctx, grid, scheme, gradeOfSection)
	if err != nil {
		return err
	}

	gradeByID := map[uuid.UUID]*tenantent.GradeLevel{}
	for _, grade := range a.grades {
		gradeByID[grade.ID] = grade
	}

	loads := make([]sectionLoad, 0, len(a.sections))
	for _, section := range a.sections {
		rows, err := s.client.SubjectOffering.Query().Where(
			entoffering.SectionID(section.ID),
			entoffering.AcademicSessionID(a.session.ID),
			entoffering.StatusEQ(entoffering.StatusActive),
		).All(ctx)
		if err != nil {
			return err
		}

		name := section.Name
		if grade := gradeByID[section.GradeLevelID]; grade != nil {
			name = grade.Code + "-" + section.Name
		}
		id := scheme[section.GradeLevelID]
		load := sectionLoad{
			name:          name,
			offerings:     len(rows),
			placedPeriods: placedPeriods[section.ID],
			placedMinutes: placedMinutes[section.ID],
			availPeriods:  grid.periodsAWeek(id),
			availMinutes:  grid.minutesAWeek(id),
		}

		for _, offering := range rows {
			periods, minutes := 0, 0
			if offering.PeriodsPerWeek != nil {
				periods = *offering.PeriodsPerWeek
			}
			if offering.MinutesPerWeek != nil {
				minutes = *offering.MinutesPerWeek
			}
			if isElective(subjects[offering.SubjectID]) {
				if periods > load.electivePeriods {
					load.electivePeriods = periods
				}
				if minutes > load.electiveMinutes {
					load.electiveMinutes = minutes
				}
				continue
			}
			load.periods += periods
			load.minutes += minutes
		}
		loads = append(loads, load)
	}

	sort.Slice(loads, func(i, j int) bool { return loads[i].name < loads[j].name })

	fmt.Println("feasibility in periods, against the teaching periods a week holds:")
	fmt.Printf("  %-10s %9s %9s %9s %9s %9s %s\n",
		"section", "offerings", "required", "available", "spare", "placed", "verdict")
	unmeasured := 0
	for _, load := range loads {
		if load.availPeriods == 0 {
			unmeasured++
			fmt.Printf("  %-10s %9d %9d %9s %9s %9d %s\n",
				load.name, load.offerings, load.requiredPeriods(), "?", "?", load.placedPeriods,
				"unmeasured: no instructional calendar for this grade")
			continue
		}
		fmt.Printf("  %-10s %9d %9d %9d %9d %9d %s\n",
			load.name, load.offerings, load.requiredPeriods(), load.availPeriods,
			load.availPeriods-load.requiredPeriods(), load.placedPeriods,
			verdictOf(load.requiredPeriods(), load.availPeriods))
	}

	fmt.Println("feasibility in minutes, against the teaching minutes a week holds:")
	fmt.Printf("  %-10s %9s %9s %9s %9s %9s %s\n",
		"section", "offerings", "required", "available", "spare", "placed", "verdict")
	for _, load := range loads {
		if load.availMinutes == 0 {
			fmt.Printf("  %-10s %9d %9d %9s %9s %9d %s\n",
				load.name, load.offerings, load.requiredMinutes(), "?", "?", load.placedMinutes,
				"unmeasured: no instructional calendar for this grade")
			continue
		}
		fmt.Printf("  %-10s %9d %9d %9d %9d %9d %s\n",
			load.name, load.offerings, load.requiredMinutes(), load.availMinutes,
			load.availMinutes-load.requiredMinutes(), load.placedMinutes,
			verdictOf(load.requiredMinutes(), load.availMinutes))
	}

	if unmeasured > 0 {
		fmt.Printf("  %d section(s) could not be measured; run with -timetable to build the calendar\n",
			unmeasured)
	}
	return s.reportOfferingShortfall(ctx, a, grid, scheme, gradeOfSection)
}

func verdictOf(required, available int) string {
	if required > available {
		return "INFEASIBLE"
	}
	return "fits"
}

func (s *seeder) placedLoad(ctx context.Context, grid *weekGrid,
	scheme map[uuid.UUID]uuid.UUID,
	gradeOfSection map[uuid.UUID]uuid.UUID) (map[uuid.UUID]int, map[uuid.UUID]int, error) {
	slots, err := s.publishedSlots(ctx)
	if err != nil {
		return nil, nil, err
	}
	type sectionSlot struct {
		section uuid.UUID
		dow     int
		period  uuid.UUID
	}

	periods := map[uuid.UUID]int{}
	minutes := map[uuid.UUID]int{}
	occupied := map[sectionSlot]bool{}
	for _, slot := range slots {
		if slot.SubjectOfferingID == nil {
			continue
		}
		key := sectionSlot{section: slot.SectionID, dow: slot.DayOfWeek, period: slot.PeriodID}
		if occupied[key] {
			continue
		}
		occupied[key] = true

		id := scheme[gradeOfSection[slot.SectionID]]
		periods[slot.SectionID]++
		minutes[slot.SectionID] += grid.slotMinutes(id, slot.DayOfWeek, slot.PeriodID)
	}
	return periods, minutes, nil
}

func (s *seeder) publishedSlots(ctx context.Context) ([]*tenantent.TimetableSlot, error) {
	return s.client.TimetableSlot.Query().Where(
		entslot.HasTimetableWith(enttimetable.StatusEQ(enttimetable.StatusPublished)),
	).All(ctx)
}

func (s *seeder) reportOfferingShortfall(ctx context.Context, a *academics, grid *weekGrid,
	scheme map[uuid.UUID]uuid.UUID, gradeOfSection map[uuid.UUID]uuid.UUID) error {
	slots, err := s.publishedSlots(ctx)
	if err != nil {
		return err
	}
	if len(slots) == 0 {
		return nil
	}

	placed := map[uuid.UUID]int{}
	minutes := map[uuid.UUID]int{}
	for _, slot := range slots {
		if slot.SubjectOfferingID == nil {
			continue
		}
		id := scheme[gradeOfSection[slot.SectionID]]
		placed[*slot.SubjectOfferingID]++
		minutes[*slot.SubjectOfferingID] += grid.slotMinutes(id, slot.DayOfWeek, slot.PeriodID)
	}

	rows, err := s.client.SubjectOffering.Query().Where(
		entoffering.AcademicSessionID(a.session.ID),
		entoffering.StatusEQ(entoffering.StatusActive),
	).All(ctx)
	if err != nil {
		return err
	}

	short := 0
	for _, offering := range rows {
		if offering.MinutesPerWeek == nil || *offering.MinutesPerWeek == 0 {
			continue
		}
		if minutes[offering.ID] < *offering.MinutesPerWeek {
			short++
		}
	}
	fmt.Printf("placement against the stated obligation: %d of %d offerings currently deliver "+
		"fewer minutes than minutes_per_week asks for\n", short, len(rows))
	return nil
}

func (s *seeder) schemeOfGrade(ctx context.Context, a *academics) (map[uuid.UUID]uuid.UUID, error) {
	rows, err := s.client.PeriodSchemeGradeLevel.Query().Where(
		entschemegrade.AcademicSessionID(a.session.ID),
		entschemegrade.BranchID(a.branch.ID),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]uuid.UUID, len(rows))
	for _, row := range rows {
		out[row.GradeLevelID] = row.PeriodSchemeID
	}
	return out, nil
}

func (s *seeder) weekGrid(ctx context.Context, a *academics) (*weekGrid, error) {
	grid := &weekGrid{
		bellOfDay: map[schemeDay]uuid.UUID{},
		span:      map[bellPeriod]int{},
		teaching:  map[uuid.UUID]bool{},
		days:      map[uuid.UUID][]int{},
	}

	periods, err := s.client.Period.Query().
		Where(entperiod.HasPeriodSchemeWith(entscheme.BranchID(a.branch.ID))).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, period := range periods {
		grid.teaching[period.ID] = period.Kind == entperiod.KindTeaching
	}

	spans, err := s.client.BellSchedulePeriod.Query().All(ctx)
	if err != nil {
		return nil, err
	}
	for _, span := range spans {
		grid.span[bellPeriod{bell: span.BellScheduleID, period: span.PeriodID}] =
			span.EndMinute - span.StartMinute
	}

	days, err := s.client.CalendarDay.Query().Where(
		entcalendarday.BranchID(a.branch.ID),
		entcalendarday.AcademicSessionID(a.session.ID),
		entcalendarday.DayTypeEQ(entcalendarday.DayTypeInstructional),
	).Order(entcalendarday.ByCalendarDate()).All(ctx)
	if err != nil {
		return nil, err
	}

	for _, day := range days {
		if !day.ForenoonOpen && !day.AfternoonOpen {
			continue
		}
		dow := svc.ISODayOfWeek(day.CalendarDate)

		schedules, err := s.client.CalendarDaySchedule.Query().
			Where(entdayschedule.CalendarDayID(day.ID)).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, schedule := range schedules {
			key := schemeDay{scheme: schedule.PeriodSchemeID, dow: dow}
			if _, known := grid.bellOfDay[key]; known {
				continue
			}
			grid.bellOfDay[key] = schedule.BellScheduleID
			grid.days[schedule.PeriodSchemeID] = append(grid.days[schedule.PeriodSchemeID], dow)
		}
	}
	for scheme := range grid.days {
		sort.Ints(grid.days[scheme])
	}
	return grid, nil
}
