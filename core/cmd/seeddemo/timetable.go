package main

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbellschedule "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellschedule"
	entbellperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellscheduleperiod"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entdayschedule "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendardayschedule"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entperiodscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	entschemegrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodschemegradelevel"
	entroom "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/room"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subject"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	svc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

const (
	schemeCode        = "PS-REG"
	bellRegularCode   = "BELL-REG"
	bellSaturdayCode  = "BELL-SAT"
	labScienceCode    = "RM-LAB-1"
	labLanguageCode   = "RM-LAB-2"
	electiveDayOfWeek = 3
	calendarLookback  = 56
	dateLayout        = "2006-01-02"
)

var gridPeriods = []struct {
	code, name       string
	kind             entperiod.Kind
	regStart, regEnd int
	satStart, satEnd int
}{
	{"ASM", "Assembly", entperiod.KindAssembly, 480, 495, 480, 490},
	{"P1", "Period 1", entperiod.KindTeaching, 495, 540, 490, 530},
	{"P2", "Period 2", entperiod.KindTeaching, 540, 585, 530, 570},
	{"BRK", "Short Break", entperiod.KindBreak, 585, 600, 570, 580},
	{"P3", "Period 3", entperiod.KindTeaching, 600, 645, 580, 620},
	{"P4", "Period 4", entperiod.KindTeaching, 645, 690, 620, 660},
	{"LUN", "Lunch", entperiod.KindBreak, 690, 720, 0, 0},
	{"P5", "Period 5", entperiod.KindTeaching, 720, 765, 0, 0},
	{"P6", "Period 6", entperiod.KindTeaching, 765, 810, 0, 0},
}

var electiveSubjects = []struct{ code, name string }{
	{"SAN", "Sanskrit"},
	{"FRE", "French"},
}

var fixedHolidays = []struct {
	month time.Month
	day   int
	name  string
}{
	{time.August, 15, "Independence Day"},
	{time.October, 2, "Gandhi Jayanti"},
	{time.October, 20, "Dussehra"},
	{time.November, 9, "Diwali"},
	{time.November, 10, "Diwali"},
	{time.December, 25, "Christmas"},
	{time.January, 26, "Republic Day"},
	{time.March, 2, "Holi"},
}

type academics struct {
	branch    *tenantent.Branch
	session   *tenantent.AcademicSession
	grades    []*tenantent.GradeLevel
	sections  []*tenantent.Section
	subjects  []*tenantent.Subject
	offerings []*tenantent.SubjectOffering
	teachers  []*tenantent.Teacher
}

type schemeBuild struct {
	scheme   *tenantent.PeriodScheme
	ordered  []*tenantent.Period
	byCode   map[string]*tenantent.Period
	teaching []*tenantent.Period
	saturday []*tenantent.Period
	regular  *tenantent.BellSchedule
	weekend  *tenantent.BellSchedule
}

type slotPlan struct {
	section   uuid.UUID
	dayOfWeek int
	period    uuid.UUID
	offering  *uuid.UUID
	teacher   *uuid.UUID
	room      *uuid.UUID
	label     *string
}

func (p slotPlan) key() string {
	tail := "label:" + derefString(p.label)
	if p.offering != nil {
		tail = p.offering.String()
	}
	return fmt.Sprintf("%s|%d|%s|%s", p.section, p.dayOfWeek, p.period, tail)
}

type busyKey struct {
	dayOfWeek int
	period    uuid.UUID
}

type busySets struct {
	teacher map[busyKey]map[uuid.UUID]bool
	room    map[busyKey]map[uuid.UUID]bool
}

func newBusySets() *busySets {
	return &busySets{
		teacher: map[busyKey]map[uuid.UUID]bool{},
		room:    map[busyKey]map[uuid.UUID]bool{},
	}
}

func (b *busySets) take(set map[busyKey]map[uuid.UUID]bool, key busyKey, id uuid.UUID) {
	held, ok := set[key]
	if !ok {
		held = map[uuid.UUID]bool{}
		set[key] = held
	}
	held[id] = true
}

func (b *busySets) held(set map[busyKey]map[uuid.UUID]bool, key busyKey, id uuid.UUID) bool {
	return set[key][id]
}

func (b *busySets) freeTeacher(key busyKey, teachers []*tenantent.Teacher) *uuid.UUID {
	for _, t := range teachers {
		if b.held(b.teacher, key, t.ID) {
			continue
		}
		id := t.ID
		b.take(b.teacher, key, id)
		return &id
	}
	return nil
}

func (b *busySets) freeRoom(key busyKey, rooms []*tenantent.Room) *uuid.UUID {
	for _, r := range rooms {
		if b.held(b.room, key, r.ID) {
			continue
		}
		id := r.ID
		b.take(b.room, key, id)
		return &id
	}
	return nil
}

func derefString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (s *seeder) location() *time.Location {
	if s.tenant != nil && s.tenant.Timezone != "" {
		if loc, err := time.LoadLocation(s.tenant.Timezone); err == nil {
			return loc
		}
	}
	return time.UTC
}

func (s *seeder) today() time.Time {
	now := time.Now().In(s.location())
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func (s *seeder) timetable(ctx context.Context, a *academics) error {
	if s.o.dryRun {
		fmt.Println("dry run: the timetable is planned against real ids, so it is skipped")
		return nil
	}

	build, err := s.periodScheme(ctx, a)
	if err != nil {
		return fmt.Errorf("period scheme: %w", err)
	}
	home, labs, err := s.rooms(ctx, a)
	if err != nil {
		return fmt.Errorf("rooms: %w", err)
	}
	if err := s.calendarDays(ctx, a, build); err != nil {
		return fmt.Errorf("calendar: %w", err)
	}

	version, err := s.timetableVersion(ctx, a, build)
	if err != nil {
		return fmt.Errorf("timetable version: %w", err)
	}

	plans, busy, err := s.planWeek(ctx, a, build, home, labs)
	if err != nil {
		return fmt.Errorf("weekly pattern: %w", err)
	}
	written, err := s.writeSlots(ctx, version, plans)
	if err != nil {
		return fmt.Errorf("slots: %w", err)
	}
	if err := s.deviations(ctx, a, build, written, busy, labs); err != nil {
		return fmt.Errorf("deviations: %w", err)
	}
	return s.reportClashes(ctx, a, version)
}

func (s *seeder) periodScheme(ctx context.Context, a *academics) (*schemeBuild, error) {
	build := &schemeBuild{byCode: map[string]*tenantent.Period{}}

	scheme, err := s.client.PeriodScheme.Query().Where(
		entperiodscheme.AcademicSessionID(a.session.ID),
		entperiodscheme.BranchID(a.branch.ID),
		entperiodscheme.Code(schemeCode),
	).Only(ctx)
	if tenantent.IsNotFound(err) {
		scheme, err = s.client.PeriodScheme.Create().
			SetAcademicSessionID(a.session.ID).
			SetBranchID(a.branch.ID).
			SetName("Regular Day").
			SetCode(schemeCode).
			Save(ctx)
		if err != nil {
			return nil, err
		}
		s.note("period_scheme", 1)
	} else if err != nil {
		return nil, err
	}
	build.scheme = scheme

	for _, g := range a.grades {
		n, err := s.client.PeriodSchemeGradeLevel.Query().Where(
			entschemegrade.PeriodSchemeID(scheme.ID),
			entschemegrade.GradeLevelID(g.ID),
		).Count(ctx)
		if err != nil {
			return nil, err
		}
		if n > 0 {
			continue
		}
		if _, err := s.client.PeriodSchemeGradeLevel.Create().
			SetPeriodSchemeID(scheme.ID).
			SetGradeLevelID(g.ID).
			SetAcademicSessionID(a.session.ID).
			SetBranchID(a.branch.ID).
			Save(ctx); err != nil {
			return nil, err
		}
		s.note("scheme_grade", 1)
	}

	for i, spec := range gridPeriods {
		row, err := s.client.Period.Query().Where(
			entperiod.PeriodSchemeID(scheme.ID),
			entperiod.Code(spec.code),
		).Only(ctx)
		if tenantent.IsNotFound(err) {
			row, err = s.client.Period.Create().
				SetPeriodSchemeID(scheme.ID).
				SetName(spec.name).
				SetCode(spec.code).
				SetSequence(i + 1).
				SetKind(spec.kind).
				Save(ctx)
			if err != nil {
				return nil, err
			}
			s.note("period", 1)
		} else if err != nil {
			return nil, err
		}
		build.ordered = append(build.ordered, row)
		build.byCode[spec.code] = row
		if spec.kind == entperiod.KindTeaching {
			build.teaching = append(build.teaching, row)
			if spec.satEnd > spec.satStart {
				build.saturday = append(build.saturday, row)
			}
		}
	}

	build.regular, err = s.bellSchedule(ctx, scheme, bellRegularCode, "Regular", true)
	if err != nil {
		return nil, err
	}
	build.weekend, err = s.bellSchedule(ctx, scheme, bellSaturdayCode, "Saturday", false)
	if err != nil {
		return nil, err
	}

	for i, spec := range gridPeriods {
		period := build.ordered[i]
		if err := s.bellTime(ctx, build.regular, period, spec.regStart, spec.regEnd); err != nil {
			return nil, err
		}
		if spec.satEnd <= spec.satStart {
			continue
		}
		if err := s.bellTime(ctx, build.weekend, period, spec.satStart, spec.satEnd); err != nil {
			return nil, err
		}
	}
	return build, nil
}

func (s *seeder) bellSchedule(ctx context.Context, scheme *tenantent.PeriodScheme,
	code, name string, isDefault bool) (*tenantent.BellSchedule, error) {
	found, err := s.client.BellSchedule.Query().Where(
		entbellschedule.PeriodSchemeID(scheme.ID),
		entbellschedule.Code(code),
	).Only(ctx)
	if err == nil {
		return found, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}
	row, err := s.client.BellSchedule.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName(name).
		SetCode(code).
		SetIsDefault(isDefault).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	s.note("bell_schedule", 1)
	return row, nil
}

func (s *seeder) bellTime(ctx context.Context, schedule *tenantent.BellSchedule,
	period *tenantent.Period, start, end int) error {
	n, err := s.client.BellSchedulePeriod.Query().Where(
		entbellperiod.BellScheduleID(schedule.ID),
		entbellperiod.PeriodID(period.ID),
	).Count(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	if _, err := s.client.BellSchedulePeriod.Create().
		SetBellScheduleID(schedule.ID).
		SetPeriodID(period.ID).
		SetStartMinute(start).
		SetEndMinute(end).
		Save(ctx); err != nil {
		return err
	}
	s.note("bell_period", 1)
	return nil
}

func (s *seeder) rooms(ctx context.Context, a *academics) (map[uuid.UUID]*tenantent.Room, []*tenantent.Room, error) {
	gradeByID := map[uuid.UUID]*tenantent.GradeLevel{}
	for _, g := range a.grades {
		gradeByID[g.ID] = g
	}

	home := map[uuid.UUID]*tenantent.Room{}
	for _, sec := range a.sections {
		grade := gradeByID[sec.GradeLevelID]
		if grade == nil {
			continue
		}
		code := fmt.Sprintf("RM-%s-%s", grade.Code, sec.Name)
		room, err := s.room(ctx, a.branch, code,
			fmt.Sprintf("Classroom %s-%s", grade.Code, sec.Name), "classroom")
		if err != nil {
			return nil, nil, err
		}
		home[sec.ID] = room
		if sec.RoomID == nil {
			if _, err := s.client.Section.UpdateOneID(sec.ID).SetRoomID(room.ID).Save(ctx); err != nil {
				return nil, nil, err
			}
		}
	}

	science, err := s.room(ctx, a.branch, labScienceCode, "Science Laboratory", "laboratory")
	if err != nil {
		return nil, nil, err
	}
	language, err := s.room(ctx, a.branch, labLanguageCode, "Language Laboratory", "laboratory")
	if err != nil {
		return nil, nil, err
	}
	return home, []*tenantent.Room{science, language}, nil
}

func (s *seeder) room(ctx context.Context, branch *tenantent.Branch, code, name, kind string) (*tenantent.Room, error) {
	found, err := s.client.Room.Query().Where(
		entroom.BranchID(branch.ID),
		entroom.Code(code),
	).Only(ctx)
	if err == nil {
		return found, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}
	row, err := s.client.Room.Create().
		SetBranchID(branch.ID).
		SetName(name).
		SetCode(code).
		SetRoomType(kind).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	s.note("room", 1)
	return row, nil
}

func (s *seeder) calendarWindow(a *academics) (time.Time, time.Time, error) {
	from := s.today().AddDate(0, 0, -calendarLookback)
	for svc.ISODayOfWeek(from) != 1 {
		from = from.AddDate(0, 0, -1)
	}
	if s.o.calendarFrom != "" {
		parsed, err := time.Parse(dateLayout, s.o.calendarFrom)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("-calendar-from must be YYYY-MM-DD: %w", err)
		}
		from = svc.Day(parsed)
	}
	if s.o.calendarWeeks < 1 {
		return time.Time{}, time.Time{}, fmt.Errorf("-calendar-weeks must be at least 1, got %d", s.o.calendarWeeks)
	}
	to := from.AddDate(0, 0, s.o.calendarWeeks*7-1)

	if start := svc.Day(a.session.StartDate); from.Before(start) {
		from = start
	}
	if end := svc.Day(a.session.EndDate); to.After(end) {
		to = end
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, fmt.Errorf("the calendar window falls outside session %s", a.session.Code)
	}
	return from, to, nil
}

type dayPlan struct {
	date    time.Time
	dayType entcalendarday.DayType
	fore    bool
	after   bool
	bell    *tenantent.BellSchedule
	name    *string
}

func planCalendar(build *schemeBuild, from, to time.Time) []dayPlan {
	named := map[string]string{}
	for _, h := range fixedHolidays {
		for year := from.Year(); year <= to.Year(); year++ {
			named[time.Date(year, h.month, h.day, 0, 0, 0, 0, time.UTC).Format(dateLayout)] = h.name
		}
	}

	out := make([]dayPlan, 0, 32)
	holiday := false
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		dow := svc.ISODayOfWeek(d)
		if dow == 7 {
			continue
		}
		if name, ok := named[d.Format(dateLayout)]; ok {
			label := name
			out = append(out, dayPlan{date: d, dayType: entcalendarday.DayTypeHoliday, name: &label})
			holiday = true
			continue
		}
		if dow == 6 {
			out = append(out, dayPlan{
				date: d, dayType: entcalendarday.DayTypeInstructional,
				fore: true, bell: build.weekend,
			})
			continue
		}
		if dow == 5 && d.Day() <= 7 {
			label := "Parent-Teacher Meeting"
			out = append(out, dayPlan{
				date: d, dayType: entcalendarday.DayTypeEvent,
				fore: true, bell: build.regular, name: &label,
			})
			continue
		}
		out = append(out, dayPlan{
			date: d, dayType: entcalendarday.DayTypeInstructional,
			fore: true, after: true, bell: build.regular,
		})
	}

	if holiday {
		return out
	}
	for i := range out {
		if i < 10 || svc.ISODayOfWeek(out[i].date) != 3 {
			continue
		}
		label := "Local Holiday"
		out[i] = dayPlan{date: out[i].date, dayType: entcalendarday.DayTypeHoliday, name: &label}
		break
	}
	return out
}

func (s *seeder) calendarDays(ctx context.Context, a *academics, build *schemeBuild) error {
	from, to, err := s.calendarWindow(a)
	if err != nil {
		return err
	}

	rows, err := s.client.CalendarDay.Query().Where(
		entcalendarday.BranchID(a.branch.ID),
		entcalendarday.CalendarDateGTE(from),
		entcalendarday.CalendarDateLTE(to),
	).All(ctx)
	if err != nil {
		return err
	}
	known := map[string]*tenantent.CalendarDay{}
	for _, row := range rows {
		known[svc.Day(row.CalendarDate).Format(dateLayout)] = row
	}

	for _, plan := range planCalendar(build, from, to) {
		key := plan.date.Format(dateLayout)
		row, ok := known[key]
		if !ok {
			create := s.client.CalendarDay.Create().
				SetAcademicSessionID(a.session.ID).
				SetBranchID(a.branch.ID).
				SetCalendarDate(plan.date).
				SetDayType(plan.dayType).
				SetForenoonOpen(plan.fore).
				SetAfternoonOpen(plan.after)
			if plan.name != nil {
				create = create.SetName(*plan.name)
			}
			row, err = create.Save(ctx)
			if err != nil {
				return fmt.Errorf("%s: %w", key, err)
			}
			s.note("calendar_day", 1)
		}
		if plan.bell == nil {
			continue
		}
		n, err := s.client.CalendarDaySchedule.Query().Where(
			entdayschedule.CalendarDayID(row.ID),
			entdayschedule.PeriodSchemeID(build.scheme.ID),
		).Count(ctx)
		if err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		if _, err := s.client.CalendarDaySchedule.Create().
			SetCalendarDayID(row.ID).
			SetPeriodSchemeID(build.scheme.ID).
			SetBellScheduleID(plan.bell.ID).
			Save(ctx); err != nil {
			return err
		}
		s.note("day_schedule", 1)
	}
	return nil
}

func (s *seeder) timetableVersion(ctx context.Context, a *academics, build *schemeBuild) (*tenantent.Timetable, error) {
	found, err := s.client.Timetable.Query().Where(
		enttimetable.PeriodSchemeID(build.scheme.ID),
		enttimetable.Version(1),
	).Only(ctx)
	if err == nil {
		return found, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}
	row, err := s.client.Timetable.Create().
		SetAcademicSessionID(a.session.ID).
		SetPeriodSchemeID(build.scheme.ID).
		SetName(a.session.Code + " Regular Timetable").
		SetVersion(1).
		SetEffectiveFrom(svc.Day(a.session.StartDate)).
		SetEffectiveTo(svc.Day(a.session.EndDate)).
		SetStatus(enttimetable.StatusPublished).
		SetPublishedAt(time.Now().UTC()).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	s.note("timetable", 1)
	return row, nil
}

func (s *seeder) planWeek(ctx context.Context, a *academics, build *schemeBuild,
	home map[uuid.UUID]*tenantent.Room, labs []*tenantent.Room) ([]slotPlan, *busySets, error) {
	if len(build.teaching) == 0 || len(a.subjects) == 0 {
		return nil, nil, fmt.Errorf("a scheme with no teaching periods cannot carry a timetable")
	}

	offeringOf := map[string]*tenantent.SubjectOffering{}
	for _, off := range a.offerings {
		offeringOf[off.SectionID.String()+"|"+off.SubjectID.String()] = off
	}

	assigned, err := s.subjectTeachers(ctx, a)
	if err != nil {
		return nil, nil, err
	}
	electives, err := s.electives(ctx, a)
	if err != nil {
		return nil, nil, err
	}

	busy := newBusySets()
	var plans []slotPlan

	assembly := build.byCode["ASM"]
	if assembly != nil {
		for _, sec := range a.sections {
			for dow := 1; dow <= 6; dow++ {
				label := "Assembly"
				plans = append(plans, slotPlan{
					section: sec.ID, dayOfWeek: dow, period: assembly.ID, label: &label,
				})
			}
		}
	}

	for index, sec := range a.sections {
		electiveAt := index % len(build.teaching)
		for dow := 1; dow <= 6; dow++ {
			periods := build.teaching
			if dow == 6 {
				periods = build.saturday
			}
			for slot, period := range periods {
				if dow == electiveDayOfWeek && slot == electiveAt && len(electives[sec.ID]) > 0 {
					continue
				}
				subject := a.subjects[(index+dow-1+slot)%len(a.subjects)]
				offering := offeringOf[sec.ID.String()+"|"+subject.ID.String()]
				if offering == nil {
					continue
				}

				key := busyKey{dayOfWeek: dow, period: period.ID}
				teacher := assigned[offering.ID]
				if teacher != nil && !busy.held(busy.teacher, key, *teacher) {
					busy.take(busy.teacher, key, *teacher)
				} else {
					teacher = busy.freeTeacher(key, a.teachers)
					if teacher != nil {
						if err := s.assign(ctx, a.session.ID, *teacher, sec.ID, &offering.ID, "subject_teacher"); err != nil {
							return nil, nil, err
						}
					}
				}

				var room *uuid.UUID
				if r, ok := home[sec.ID]; ok && !busy.held(busy.room, key, r.ID) {
					id := r.ID
					busy.take(busy.room, key, id)
					room = &id
				}

				offeringID := offering.ID
				plans = append(plans, slotPlan{
					section: sec.ID, dayOfWeek: dow, period: period.ID,
					offering: &offeringID, teacher: teacher, room: room,
				})
			}
		}
	}

	for index, sec := range a.sections {
		choices := electives[sec.ID]
		if len(choices) == 0 {
			continue
		}
		period := build.teaching[index%len(build.teaching)]
		key := busyKey{dayOfWeek: electiveDayOfWeek, period: period.ID}
		for pick, offering := range choices {
			teacher := busy.freeTeacher(key, a.teachers)
			if teacher != nil {
				if err := s.assign(ctx, a.session.ID, *teacher, sec.ID, &offering.ID, "subject_teacher"); err != nil {
					return nil, nil, err
				}
			}
			var room *uuid.UUID
			if pick == 0 {
				if r, ok := home[sec.ID]; ok && !busy.held(busy.room, key, r.ID) {
					id := r.ID
					busy.take(busy.room, key, id)
					room = &id
				}
			} else if len(labs) > 1 {
				room = busy.freeRoom(key, labs[1:])
			}
			offeringID := offering.ID
			plans = append(plans, slotPlan{
				section: sec.ID, dayOfWeek: electiveDayOfWeek, period: period.ID,
				offering: &offeringID, teacher: teacher, room: room,
			})
		}
	}
	return plans, busy, nil
}

func (s *seeder) subjectTeachers(ctx context.Context, a *academics) (map[uuid.UUID]*uuid.UUID, error) {
	rows, err := s.client.TeacherAssignment.Query().Where(
		entassignment.AcademicSessionID(a.session.ID),
		entassignment.RoleType("subject_teacher"),
		entassignment.SubjectOfferingIDNotNil(),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	out := map[uuid.UUID]*uuid.UUID{}
	for _, row := range rows {
		if row.SubjectOfferingID == nil {
			continue
		}
		if _, taken := out[*row.SubjectOfferingID]; taken {
			continue
		}
		id := row.TeacherID
		out[*row.SubjectOfferingID] = &id
	}
	return out, nil
}

func (s *seeder) electives(ctx context.Context, a *academics) (map[uuid.UUID][]*tenantent.SubjectOffering, error) {
	subjects := make([]*tenantent.Subject, 0, len(electiveSubjects))
	for _, spec := range electiveSubjects {
		found, err := s.client.Subject.Query().Where(entsubject.Code(spec.code)).Only(ctx)
		if tenantent.IsNotFound(err) {
			found, err = s.client.Subject.Create().
				SetName(spec.name).
				SetCode(spec.code).
				SetSubjectType("elective").
				Save(ctx)
			if err != nil {
				return nil, err
			}
			s.note("subject", 1)
		} else if err != nil {
			return nil, err
		}
		subjects = append(subjects, found)
	}

	out := map[uuid.UUID][]*tenantent.SubjectOffering{}
	for _, sec := range a.sections {
		for _, sub := range subjects {
			offering, err := s.client.SubjectOffering.Query().Where(
				entoffering.SectionID(sec.ID),
				entoffering.SubjectID(sub.ID),
			).Only(ctx)
			if tenantent.IsNotFound(err) {
				offering, err = s.client.SubjectOffering.Create().
					SetAcademicSessionID(a.session.ID).
					SetSectionID(sec.ID).
					SetSubjectID(sub.ID).
					Save(ctx)
				if err != nil {
					return nil, err
				}
				s.note("offering", 1)
			} else if err != nil {
				return nil, err
			}
			out[sec.ID] = append(out[sec.ID], offering)
		}
	}

	if err := s.electiveChoices(ctx, a, out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *seeder) electiveChoices(ctx context.Context, a *academics,
	offerings map[uuid.UUID][]*tenantent.SubjectOffering) error {
	for _, sec := range a.sections {
		choices := offerings[sec.ID]
		if len(choices) == 0 {
			continue
		}
		rows, err := s.client.StudentEnrollment.Query().Where(
			entenrollment.SectionID(sec.ID),
			entenrollment.AcademicSessionID(a.session.ID),
			entenrollment.StatusEQ(entenrollment.StatusActive),
		).All(ctx)
		if err != nil {
			return err
		}
		sort.Slice(rows, func(i, j int) bool {
			left, right := derefString(rows[i].EnrollmentNumber), derefString(rows[j].EnrollmentNumber)
			if left != right {
				return left < right
			}
			return rows[i].ID.String() < rows[j].ID.String()
		})

		for i, e := range rows {
			offering := choices[i%len(choices)]
			n, err := s.client.StudentSubjectEnrollment.Query().Where(
				entsubjenroll.StudentEnrollmentID(e.ID),
				entsubjenroll.SubjectOfferingID(offering.ID),
			).Count(ctx)
			if err != nil {
				return err
			}
			if n > 0 {
				continue
			}
			if _, err := s.client.StudentSubjectEnrollment.Create().
				SetStudentEnrollmentID(e.ID).
				SetSubjectOfferingID(offering.ID).
				SetStudentID(e.StudentID).
				SetAcademicSessionID(a.session.ID).
				SetIsElectiveChoice(true).
				Save(ctx); err != nil {
				return err
			}
			s.note("elective_choice", 1)
		}
	}
	return nil
}

func (s *seeder) writeSlots(ctx context.Context, version *tenantent.Timetable,
	plans []slotPlan) (map[string]*tenantent.TimetableSlot, error) {
	rows, err := s.client.TimetableSlot.Query().
		Where(entslot.TimetableID(version.ID)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	written := map[string]*tenantent.TimetableSlot{}
	for _, row := range rows {
		seen := slotPlan{
			section: row.SectionID, dayOfWeek: row.DayOfWeek, period: row.PeriodID,
			offering: row.SubjectOfferingID, label: row.Label,
		}
		written[seen.key()] = row
	}

	for _, plan := range plans {
		if _, ok := written[plan.key()]; ok {
			continue
		}
		create := s.client.TimetableSlot.Create().
			SetTimetableID(version.ID).
			SetSectionID(plan.section).
			SetPeriodID(plan.period).
			SetDayOfWeek(plan.dayOfWeek)
		if plan.offering != nil {
			create = create.SetSubjectOfferingID(*plan.offering)
		}
		if plan.teacher != nil {
			create = create.SetTeacherID(*plan.teacher)
		}
		if plan.room != nil {
			create = create.SetRoomID(*plan.room)
		}
		if plan.label != nil {
			create = create.SetLabel(*plan.label)
		}
		row, err := create.Save(ctx)
		if err != nil {
			return nil, err
		}
		s.note("slot", 1)
		written[plan.key()] = row
	}
	return written, nil
}

func (s *seeder) deviations(ctx context.Context, a *academics, build *schemeBuild,
	written map[string]*tenantent.TimetableSlot, busy *busySets, labs []*tenantent.Room) error {
	if len(a.sections) == 0 || len(build.teaching) < 2 {
		return nil
	}

	dates, err := s.openDates(ctx, a)
	if err != nil {
		return err
	}
	today := s.today()
	past := make([]time.Time, 0, len(dates))
	for _, d := range dates {
		if d.Before(today) {
			past = append(past, d)
		}
	}
	if len(past) < 3 {
		return nil
	}

	section := a.sections[0]
	period := build.teaching[1]
	kinds := []entdeviation.Kind{
		entdeviation.KindCancelled,
		entdeviation.KindSubstitution,
		entdeviation.KindRoomChange,
	}
	reasons := []string{
		"Teacher on medical leave",
		"Class teacher at the district meeting",
		"Practical demonstration in the science laboratory",
	}

	for i, kind := range kinds {
		date := past[len(past)-3+i]
		dow := svc.ISODayOfWeek(date)

		var slot *tenantent.TimetableSlot
		for _, candidate := range written {
			if candidate.SectionID != section.ID || candidate.DayOfWeek != dow {
				continue
			}
			if candidate.PeriodID != period.ID || candidate.SubjectOfferingID == nil {
				continue
			}
			slot = candidate
			break
		}
		if slot == nil {
			continue
		}

		n, err := s.client.TimetableDeviation.Query().Where(
			entdeviation.TimetableSlotID(slot.ID),
			entdeviation.DeviationDateEQ(date),
		).Count(ctx)
		if err != nil {
			return err
		}
		if n > 0 {
			continue
		}

		create := s.client.TimetableDeviation.Create().
			SetTimetableSlotID(slot.ID).
			SetDeviationDate(date).
			SetKind(kind).
			SetSectionID(slot.SectionID).
			SetPeriodID(slot.PeriodID).
			SetSubjectOfferingID(*slot.SubjectOfferingID).
			SetReason(reasons[i])

		switch kind {
		case entdeviation.KindSubstitution:
			substitute := busy.freeTeacher(busyKey{dayOfWeek: dow, period: period.ID}, a.teachers)
			if substitute == nil {
				continue
			}
			create = create.SetSubstituteTeacherID(*substitute)
		case entdeviation.KindRoomChange:
			if len(labs) == 0 {
				continue
			}
			create = create.SetRoomID(labs[0].ID)
		}

		if _, err := create.Save(ctx); err != nil {
			return err
		}
		s.note("deviation", 1)
	}
	return nil
}

func (s *seeder) openDates(ctx context.Context, a *academics) ([]time.Time, error) {
	rows, err := s.client.CalendarDay.Query().Where(
		entcalendarday.BranchID(a.branch.ID),
		entcalendarday.AcademicSessionID(a.session.ID),
	).Order(entcalendarday.ByCalendarDate()).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]time.Time, 0, len(rows))
	for _, row := range rows {
		if !row.ForenoonOpen && !row.AfternoonOpen {
			continue
		}
		out = append(out, svc.Day(row.CalendarDate))
	}
	return out, nil
}

func (s *seeder) reportClashes(ctx context.Context, a *academics, version *tenantent.Timetable) error {
	report, err := svc.New(s.client).Check(ctx, svc.ClashQuery{
		BranchID:    a.branch.ID,
		TimetableID: version.ID,
	})
	if err != nil {
		return fmt.Errorf("clash check: %w", err)
	}
	if report.Clear() {
		fmt.Println("clash check: clear")
		return nil
	}
	fmt.Printf("clash check: %d found\n", len(report.Clashes))
	for _, clash := range report.Clashes {
		when := "pattern"
		if clash.Date != nil {
			when = clash.Date.Format(dateLayout)
		}
		fmt.Printf("  %-12s %-10s day %d period %s students %d\n",
			clash.Rule, when, clash.DayOfWeek, clash.PeriodID, clash.StudentCount)
	}
	return nil
}
