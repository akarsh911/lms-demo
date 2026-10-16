package timetablegen

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbell "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellschedule"
	entbellperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellscheduleperiod"
	entbranch "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/branch"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entdayschedule "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendardayschedule"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	entroom "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/room"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entteacher "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacher"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

const dateLayout = "2006-01-02"

const halfDayBoundaryMinute = timetable.HalfDayBoundaryMinute

type Branch struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type Scheme struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type TimetableRef struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version int    `json:"version"`
	Status  string `json:"status"`
}

type Window struct {
	Lo string `json:"lo"`
	Hi string `json:"hi"`
}

type Period struct {
	ID       string `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	Sequence int    `json:"sequence"`
	Kind     string `json:"kind"`
}

type Cell struct {
	DayOfWeek       int    `json:"day_of_week"`
	PeriodID        string `json:"period_id"`
	BellCode        string `json:"bell_code"`
	StartMinute     int    `json:"start_minute"`
	DurationMinutes int    `json:"duration_minutes"`
	Occurrences     int    `json:"occurrences"`
}

type Section struct {
	ID         string  `json:"id"`
	Code       string  `json:"code"`
	Name       string  `json:"name"`
	GradeName  string  `json:"grade_name"`
	HomeRoomID *string `json:"home_room_id,omitempty"`
}

type Room struct {
	ID       string `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	RoomType string `json:"room_type"`
	Capacity *int   `json:"capacity,omitempty"`
}

type Teacher struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type Offering struct {
	ID             string   `json:"id"`
	SectionID      string   `json:"section_id"`
	SubjectID      string   `json:"subject_id"`
	SubjectCode    string   `json:"subject_code"`
	SubjectName    string   `json:"subject_name"`
	PeriodsPerWeek *int     `json:"periods_per_week,omitempty"`
	MinutesPerWeek *int     `json:"minutes_per_week,omitempty"`
	TeacherIDs     []string `json:"teacher_ids"`
	Enrolled       int      `json:"enrolled"`
	IsElective     bool     `json:"is_elective"`
	SubjectType    string   `json:"subject_type"`
}

type Cohort struct {
	Key         string   `json:"key"`
	Size        int      `json:"size"`
	OfferingIDs []string `json:"offering_ids"`
}

type Incumbent struct {
	OfferingID string  `json:"offering_id"`
	TeacherID  *string `json:"teacher_id,omitempty"`
	RoomID     *string `json:"room_id,omitempty"`
	Slots      int     `json:"slots"`
}

type FixedSlot struct {
	SectionID         string  `json:"section_id"`
	PeriodID          string  `json:"period_id"`
	DayOfWeek         int     `json:"day_of_week"`
	Label             *string `json:"label,omitempty"`
	SubjectOfferingID *string `json:"subject_offering_id,omitempty"`
	TeacherID         *string `json:"teacher_id,omitempty"`
	RoomID            *string `json:"room_id,omitempty"`
}

type CurrentSlot struct {
	OfferingID string  `json:"offering_id"`
	SectionID  string  `json:"section_id"`
	DayOfWeek  int     `json:"day_of_week"`
	PeriodID   string  `json:"period_id"`
	TeacherID  *string `json:"teacher_id,omitempty"`
	RoomID     *string `json:"room_id,omitempty"`
}

type School struct {
	Branch           Branch         `json:"branch"`
	PeriodScheme     Scheme         `json:"period_scheme"`
	Timetable        *TimetableRef  `json:"timetable,omitempty"`
	Window           Window         `json:"window"`
	Periods          []Period       `json:"periods"`
	Cells            []Cell         `json:"cells"`
	Sections         []Section      `json:"sections"`
	Rooms            []Room         `json:"rooms"`
	Teachers         []Teacher      `json:"teachers"`
	Offerings        []Offering     `json:"offerings"`
	Cohorts          []Cohort       `json:"cohorts"`
	Incumbents       []Incumbent    `json:"incumbents"`
	FixedSlots       []FixedSlot    `json:"fixed_slots"`
	CurrentSlots     []CurrentSlot  `json:"current_slots"`
	SectionRollCount map[string]int `json:"section_roll_counts"`
}

type Export struct {
	School   School
	BranchID uuid.UUID
	SchemeID uuid.UUID
	Warnings []string
}

func (e *Export) warn(message string) {
	if e == nil || message == "" {
		return
	}
	for _, held := range e.Warnings {
		if held == message {
			return
		}
	}
	e.Warnings = append(e.Warnings, message)
}

func BuildExport(ctx context.Context, client *tenantent.Client,
	target *tenantent.Timetable, supersedes *tenantent.Timetable) (*Export, error) {

	scheme, err := client.PeriodScheme.Query().
		Where(entscheme.ID(target.PeriodSchemeID)).Only(ctx)
	if err != nil {
		return nil, err
	}
	branch, err := client.Branch.Query().Where(entbranch.ID(scheme.BranchID)).Only(ctx)
	if err != nil {
		return nil, err
	}

	out := &Export{BranchID: scheme.BranchID, SchemeID: scheme.ID}
	out.School.Branch = Branch{ID: branch.ID.String(), Name: branch.Name, Code: branch.Code}
	out.School.PeriodScheme = Scheme{ID: scheme.ID.String(), Code: scheme.Code, Name: scheme.Name}
	out.School.Timetable = &TimetableRef{
		ID:      target.ID.String(),
		Name:    target.Name,
		Version: target.Version,
		Status:  string(target.Status),
	}

	if err := out.schemes(ctx, client, scheme); err != nil {
		return nil, err
	}
	if err := out.grid(ctx, client, target, scheme); err != nil {
		return nil, err
	}
	if err := out.people(ctx, client, scheme.BranchID); err != nil {
		return nil, err
	}
	if err := out.incumbency(ctx, client, target, supersedes); err != nil {
		return nil, err
	}
	out.School.settle()
	return out, nil
}

func (s *School) settle() {
	if s.Periods == nil {
		s.Periods = []Period{}
	}
	if s.Cells == nil {
		s.Cells = []Cell{}
	}
	if s.Sections == nil {
		s.Sections = []Section{}
	}
	if s.Rooms == nil {
		s.Rooms = []Room{}
	}
	if s.Teachers == nil {
		s.Teachers = []Teacher{}
	}
	if s.Offerings == nil {
		s.Offerings = []Offering{}
	}
	if s.Cohorts == nil {
		s.Cohorts = []Cohort{}
	}
	if s.Incumbents == nil {
		s.Incumbents = []Incumbent{}
	}
	if s.FixedSlots == nil {
		s.FixedSlots = []FixedSlot{}
	}
	if s.CurrentSlots == nil {
		s.CurrentSlots = []CurrentSlot{}
	}
	if s.SectionRollCount == nil {
		s.SectionRollCount = map[string]int{}
	}
	for i := range s.Offerings {
		if s.Offerings[i].TeacherIDs == nil {
			s.Offerings[i].TeacherIDs = []string{}
		}
	}
	for i := range s.Cohorts {
		if s.Cohorts[i].OfferingIDs == nil {
			s.Cohorts[i].OfferingIDs = []string{}
		}
	}
}

func (e *Export) schemes(ctx context.Context, client *tenantent.Client,
	scheme *tenantent.PeriodScheme) error {

	others, err := client.PeriodScheme.Query().
		Where(
			entscheme.BranchID(scheme.BranchID),
			entscheme.StatusEQ(entscheme.StatusActive),
			entscheme.IDNEQ(scheme.ID),
		).
		All(ctx)
	if err != nil {
		return err
	}
	if len(others) == 0 {
		return nil
	}
	codes := make([]string, 0, len(others))
	for _, other := range others {
		codes = append(codes, other.Code)
	}
	sort.Strings(codes)
	e.warn("this branch runs " + strings.Join(codes, ", ") + " beside " + scheme.Code +
		"; a teacher taking classes under two period schemes at the same time is not " +
		"expressible in the solver's model, so the generated week is arranged within " +
		scheme.Code + " alone and only the clash check can see across the two")
	return nil
}

func (e *Export) grid(ctx context.Context, client *tenantent.Client,
	target *tenantent.Timetable, scheme *tenantent.PeriodScheme) error {

	periods, err := client.Period.Query().
		Where(entperiod.PeriodSchemeID(scheme.ID), entperiod.StatusEQ(entperiod.StatusActive)).
		Order(tenantent.Asc(entperiod.FieldSequence)).
		All(ctx)
	if err != nil {
		return err
	}
	teaching := map[uuid.UUID]*tenantent.Period{}
	for _, period := range periods {
		e.School.Periods = append(e.School.Periods, Period{
			ID:       period.ID.String(),
			Code:     period.Code,
			Name:     period.Name,
			Sequence: period.Sequence,
			Kind:     string(period.Kind),
		})
		if period.Kind == entperiod.KindTeaching {
			teaching[period.ID] = period
		}
	}

	days, err := client.CalendarDay.Query().
		Where(entcalendarday.BranchID(scheme.BranchID)).
		Order(tenantent.Asc(entcalendarday.FieldCalendarDate)).
		All(ctx)
	if err != nil {
		return err
	}
	if len(days) == 0 {
		e.School.Window = Window{Lo: target.EffectiveFrom.Format(dateLayout),
			Hi: target.EffectiveFrom.Format(dateLayout)}
		e.warn("this branch has no calendar days at all, so no date in the timetable's " +
			"window is in session and there is nothing to place a lesson in")
		return nil
	}

	lo, hi := windowOf(target, days)
	e.School.Window = Window{Lo: lo.Format(dateLayout), Hi: hi.Format(dateLayout)}
	if hi.Before(lo) {
		e.warn("the timetable is effective from " + target.EffectiveFrom.Format(dateLayout) +
			" and the branch calendar runs " + timetable.Day(days[0].CalendarDate).Format(dateLayout) +
			" to " + timetable.Day(days[len(days)-1].CalendarDate).Format(dateLayout) +
			"; the two do not overlap, so there is no week to arrange")
		return nil
	}

	inWindow := make([]*tenantent.CalendarDay, 0, len(days))
	dayIDs := make([]uuid.UUID, 0, len(days))
	for _, day := range days {
		when := timetable.Day(day.CalendarDate)
		if when.Before(lo) || when.After(hi) {
			continue
		}
		inWindow = append(inWindow, day)
		dayIDs = append(dayIDs, day.ID)
	}
	if len(dayIDs) == 0 {
		return nil
	}

	schedules, err := client.CalendarDaySchedule.Query().
		Where(
			entdayschedule.CalendarDayIDIn(dayIDs...),
			entdayschedule.PeriodSchemeID(scheme.ID),
		).
		All(ctx)
	if err != nil {
		return err
	}
	bellOfDay := make(map[uuid.UUID]uuid.UUID, len(schedules))
	bellIDs := make([]uuid.UUID, 0, len(schedules))
	for _, schedule := range schedules {
		bellOfDay[schedule.CalendarDayID] = schedule.BellScheduleID
		bellIDs = append(bellIDs, schedule.BellScheduleID)
	}
	if len(bellIDs) == 0 {
		e.warn("no day in the timetable's window is scheduled against period scheme " +
			scheme.Code + ", so the week has no cells to place a lesson in")
		return nil
	}

	bells, err := client.BellSchedule.Query().Where(entbell.IDIn(bellIDs...)).All(ctx)
	if err != nil {
		return err
	}
	bellCode := make(map[uuid.UUID]string, len(bells))
	for _, bell := range bells {
		bellCode[bell.ID] = bell.Code
	}

	spans, err := client.BellSchedulePeriod.Query().
		Where(entbellperiod.BellScheduleIDIn(bellIDs...)).
		All(ctx)
	if err != nil {
		return err
	}
	spansOfBell := map[uuid.UUID][]*tenantent.BellSchedulePeriod{}
	for _, span := range spans {
		if _, ok := teaching[span.PeriodID]; !ok {
			continue
		}
		spansOfBell[span.BellScheduleID] = append(spansOfBell[span.BellScheduleID], span)
	}

	type key struct {
		day    int
		period uuid.UUID
	}
	gathered := map[key]*Cell{}
	for _, day := range inWindow {
		bellID, ok := bellOfDay[day.ID]
		if !ok {
			continue
		}
		dow := timetable.ISODayOfWeek(day.CalendarDate)
		for _, span := range spansOfBell[bellID] {
			if span.StartMinute < halfDayBoundaryMinute && !day.ForenoonOpen {
				continue
			}
			if span.StartMinute >= halfDayBoundaryMinute && !day.AfternoonOpen {
				continue
			}
			at := key{day: dow, period: span.PeriodID}
			cell, held := gathered[at]
			if !held {
				gathered[at] = &Cell{
					DayOfWeek:       dow,
					PeriodID:        span.PeriodID.String(),
					BellCode:        bellCode[bellID],
					StartMinute:     span.StartMinute,
					DurationMinutes: span.EndMinute - span.StartMinute,
					Occurrences:     1,
				}
				continue
			}
			cell.Occurrences++
			if code := bellCode[bellID]; code < cell.BellCode {
				cell.BellCode = code
			}
			if span.StartMinute < cell.StartMinute {
				cell.StartMinute = span.StartMinute
			}
			if length := span.EndMinute - span.StartMinute; length < cell.DurationMinutes {
				cell.DurationMinutes = length
			}
		}
	}

	e.School.Cells = make([]Cell, 0, len(gathered))
	for _, cell := range gathered {
		e.School.Cells = append(e.School.Cells, *cell)
	}
	sort.Slice(e.School.Cells, func(i, j int) bool {
		a, b := e.School.Cells[i], e.School.Cells[j]
		if a.DayOfWeek != b.DayOfWeek {
			return a.DayOfWeek < b.DayOfWeek
		}
		if a.StartMinute != b.StartMinute {
			return a.StartMinute < b.StartMinute
		}
		return a.PeriodID < b.PeriodID
	})
	return nil
}

func windowOf(target *tenantent.Timetable, days []*tenantent.CalendarDay) (time.Time, time.Time) {
	first := timetable.Day(days[0].CalendarDate)
	last := timetable.Day(days[len(days)-1].CalendarDate)

	lo := timetable.Day(target.EffectiveFrom)
	if lo.Before(first) {
		lo = first
	}
	hi := last
	if target.EffectiveTo != nil {
		if to := timetable.Day(*target.EffectiveTo); to.Before(hi) {
			hi = to
		}
	}
	return lo, hi
}

func (e *Export) people(ctx context.Context, client *tenantent.Client, branchID uuid.UUID) error {
	sections, err := client.Section.Query().
		Where(entsection.BranchID(branchID), entsection.StatusEQ(entsection.StatusActive)).
		WithGradeLevel().
		Order(tenantent.Asc(entsection.FieldCode)).
		All(ctx)
	if err != nil {
		return err
	}
	sectionIDs := make([]uuid.UUID, 0, len(sections))
	for _, section := range sections {
		record := Section{
			ID:   section.ID.String(),
			Code: section.Code,
			Name: section.Name,
		}
		if section.Edges.GradeLevel != nil {
			record.GradeName = section.Edges.GradeLevel.Name
		}
		if section.RoomID != nil {
			home := section.RoomID.String()
			record.HomeRoomID = &home
		}
		e.School.Sections = append(e.School.Sections, record)
		sectionIDs = append(sectionIDs, section.ID)
	}

	rooms, err := client.Room.Query().
		Where(entroom.BranchID(branchID), entroom.StatusEQ(entroom.StatusActive)).
		Order(tenantent.Asc(entroom.FieldCode)).
		All(ctx)
	if err != nil {
		return err
	}
	for _, room := range rooms {
		e.School.Rooms = append(e.School.Rooms, Room{
			ID:       room.ID.String(),
			Code:     room.Code,
			Name:     room.Name,
			RoomType: room.RoomType,
			Capacity: room.Capacity,
		})
	}

	teachers, err := client.Teacher.Query().
		Where(entteacher.StatusEQ(entteacher.StatusActive)).
		All(ctx)
	if err != nil {
		return err
	}
	staffIDs := make([]uuid.UUID, 0, len(teachers))
	for _, teacher := range teachers {
		staffIDs = append(staffIDs, teacher.StaffID)
	}
	names, err := displayNames(ctx, client, staffIDs)
	if err != nil {
		return err
	}
	for _, teacher := range teachers {
		code := ""
		if teacher.TeacherCode != nil {
			code = *teacher.TeacherCode
		}
		name := names[teacher.StaffID]
		if name == "" {
			name = teacher.ID.String()
		}
		e.School.Teachers = append(e.School.Teachers, Teacher{
			ID: teacher.ID.String(), Code: code, Name: name,
		})
	}
	sort.Slice(e.School.Teachers, func(i, j int) bool {
		return e.School.Teachers[i].Name < e.School.Teachers[j].Name
	})

	if len(sectionIDs) == 0 {
		e.School.SectionRollCount = map[string]int{}
		return nil
	}

	offerings, err := client.SubjectOffering.Query().
		Where(
			entoffering.SectionIDIn(sectionIDs...),
			entoffering.StatusEQ(entoffering.StatusActive),
		).
		WithSubject().
		All(ctx)
	if err != nil {
		return err
	}
	offeringIDs := make([]uuid.UUID, 0, len(offerings))
	for _, offering := range offerings {
		offeringIDs = append(offeringIDs, offering.ID)
	}

	assignments, err := client.TeacherAssignment.Query().
		Where(
			entteacherassign.SubjectOfferingIDIn(offeringIDs...),
			entteacherassign.StatusEQ(entteacherassign.StatusActive),
		).
		All(ctx)
	if err != nil {
		return err
	}
	teacherIDs := map[uuid.UUID][]string{}
	for _, assignment := range assignments {
		if assignment.SubjectOfferingID == nil {
			continue
		}
		id := assignment.TeacherID.String()
		held := teacherIDs[*assignment.SubjectOfferingID]
		if !contains(held, id) {
			teacherIDs[*assignment.SubjectOfferingID] = append(held, id)
		}
	}

	enrolments, err := client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.SubjectOfferingIDIn(offeringIDs...),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		).
		All(ctx)
	if err != nil {
		return err
	}
	baskets := map[uuid.UUID][]string{}
	enrolled := map[uuid.UUID]int{}
	for _, row := range enrolments {
		id := row.SubjectOfferingID.String()
		if contains(baskets[row.StudentID], id) {
			continue
		}
		baskets[row.StudentID] = append(baskets[row.StudentID], id)
		enrolled[row.SubjectOfferingID]++
	}

	for _, offering := range offerings {
		record := Offering{
			ID:             offering.ID.String(),
			SectionID:      offering.SectionID.String(),
			SubjectID:      offering.SubjectID.String(),
			PeriodsPerWeek: offering.PeriodsPerWeek,
			MinutesPerWeek: offering.MinutesPerWeek,
			TeacherIDs:     sorted(teacherIDs[offering.ID]),
			Enrolled:       enrolled[offering.ID],
		}
		if offering.Edges.Subject != nil {
			record.SubjectCode = offering.Edges.Subject.Code
			record.SubjectName = offering.Edges.Subject.Name
			record.IsElective = offering.Edges.Subject.IsElective
			record.SubjectType = offering.Edges.Subject.SubjectType
		}
		e.School.Offerings = append(e.School.Offerings, record)
	}
	sort.Slice(e.School.Offerings, func(i, j int) bool {
		if e.School.Offerings[i].SubjectCode != e.School.Offerings[j].SubjectCode {
			return e.School.Offerings[i].SubjectCode < e.School.Offerings[j].SubjectCode
		}
		return e.School.Offerings[i].ID < e.School.Offerings[j].ID
	})

	e.School.Cohorts = cohortsOf(baskets)

	rolls, err := client.StudentEnrollment.Query().
		Where(
			entenrollment.SectionIDIn(sectionIDs...),
			entenrollment.StatusEQ(entenrollment.StatusActive),
		).
		All(ctx)
	if err != nil {
		return err
	}
	e.School.SectionRollCount = map[string]int{}
	for _, roll := range rolls {
		e.School.SectionRollCount[roll.SectionID.String()]++
	}
	return nil
}

func cohortsOf(baskets map[uuid.UUID][]string) []Cohort {
	grouped := map[string][]string{}
	size := map[string]int{}
	for _, basket := range baskets {
		ids := sorted(basket)
		key := basketKey(ids)
		grouped[key] = ids
		size[key]++
	}
	out := make([]Cohort, 0, len(grouped))
	for key, ids := range grouped {
		out = append(out, Cohort{Key: key, Size: size[key], OfferingIDs: ids})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

func basketKey(ids []string) string {
	sum := sha256.Sum256([]byte(strings.Join(ids, ",")))
	return hex.EncodeToString(sum[:16])
}

func (e *Export) incumbency(ctx context.Context, client *tenantent.Client,
	target *tenantent.Timetable, supersedes *tenantent.Timetable) error {

	own, err := client.TimetableSlot.Query().
		Where(entslot.TimetableID(target.ID)).
		All(ctx)
	if err != nil {
		return err
	}
	for _, slot := range own {
		if slot.SubjectOfferingID != nil {
			continue
		}
		e.School.FixedSlots = append(e.School.FixedSlots, FixedSlot{
			SectionID: slot.SectionID.String(),
			PeriodID:  slot.PeriodID.String(),
			DayOfWeek: slot.DayOfWeek,
			Label:     slot.Label,
			TeacherID: idText(slot.TeacherID),
			RoomID:    idText(slot.RoomID),
		})
	}
	sort.Slice(e.School.FixedSlots, func(i, j int) bool {
		a, b := e.School.FixedSlots[i], e.School.FixedSlots[j]
		if a.DayOfWeek != b.DayOfWeek {
			return a.DayOfWeek < b.DayOfWeek
		}
		if a.SectionID != b.SectionID {
			return a.SectionID < b.SectionID
		}
		return a.PeriodID < b.PeriodID
	})

	if supersedes == nil {
		return nil
	}

	previous, err := client.TimetableSlot.Query().
		Where(entslot.TimetableID(supersedes.ID)).
		All(ctx)
	if err != nil {
		return err
	}

	labelled := 0
	counted := map[string]*Incumbent{}
	for _, slot := range previous {
		if slot.SubjectOfferingID == nil {
			labelled++
			continue
		}
		record := Incumbent{
			OfferingID: slot.SubjectOfferingID.String(),
			TeacherID:  idText(slot.TeacherID),
			RoomID:     idText(slot.RoomID),
		}
		at := record.OfferingID + "|" + text(record.TeacherID) + "|" + text(record.RoomID)
		if held, ok := counted[at]; ok {
			held.Slots++
		} else {
			record.Slots = 1
			counted[at] = &record
		}
		e.School.CurrentSlots = append(e.School.CurrentSlots, CurrentSlot{
			OfferingID: slot.SubjectOfferingID.String(),
			SectionID:  slot.SectionID.String(),
			DayOfWeek:  slot.DayOfWeek,
			PeriodID:   slot.PeriodID.String(),
			TeacherID:  idText(slot.TeacherID),
			RoomID:     idText(slot.RoomID),
		})
	}
	for _, record := range counted {
		e.School.Incumbents = append(e.School.Incumbents, *record)
	}
	sort.Slice(e.School.Incumbents, func(i, j int) bool {
		return e.School.Incumbents[i].OfferingID < e.School.Incumbents[j].OfferingID
	})
	sort.Slice(e.School.CurrentSlots, func(i, j int) bool {
		a, b := e.School.CurrentSlots[i], e.School.CurrentSlots[j]
		if a.DayOfWeek != b.DayOfWeek {
			return a.DayOfWeek < b.DayOfWeek
		}
		return a.OfferingID < b.OfferingID
	})

	if labelled > 0 && len(e.School.FixedSlots) == 0 {
		e.warn("the week this draft replaces carries " + strconv.Itoa(labelled) +
			" slots with a label and no subject, such as assembly; this draft carries none, " +
			"so the generated week will not have them and the solver will treat those " +
			"periods as free")
	}
	return nil
}

func displayNames(ctx context.Context, client *tenantent.Client,
	staffIDs []uuid.UUID) (map[uuid.UUID]string, error) {

	out := map[uuid.UUID]string{}
	if len(staffIDs) == 0 {
		return out, nil
	}
	rows, err := client.Staff.Query().
		Where(entstaff.IDIn(staffIDs...)).
		WithPerson().
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.Edges.Person != nil {
			out[row.ID] = row.Edges.Person.DisplayName
		}
	}
	return out, nil
}

func OverlappingVersions(ctx context.Context, client *tenantent.Client,
	target *tenantent.Timetable, ignore uuid.UUID) ([]*tenantent.Timetable, error) {

	versions, err := client.Timetable.Query().
		Where(
			enttimetable.PeriodSchemeID(target.PeriodSchemeID),
			enttimetable.IDNEQ(target.ID),
			enttimetable.StatusIn(enttimetable.StatusPublished, target.Status),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*tenantent.Timetable, 0, len(versions))
	for _, version := range versions {
		if ignore != uuid.Nil && version.ID == ignore {
			continue
		}
		if !overlaps(target, version) {
			continue
		}
		out = append(out, version)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	return out, nil
}

func overlaps(a, b *tenantent.Timetable) bool {
	lo := timetable.Day(a.EffectiveFrom)
	if other := timetable.Day(b.EffectiveFrom); other.After(lo) {
		lo = other
	}
	var hi *time.Time
	switch {
	case a.EffectiveTo == nil && b.EffectiveTo == nil:
	case a.EffectiveTo == nil:
		end := timetable.Day(*b.EffectiveTo)
		hi = &end
	case b.EffectiveTo == nil:
		end := timetable.Day(*a.EffectiveTo)
		hi = &end
	default:
		end := timetable.Day(*a.EffectiveTo)
		if other := timetable.Day(*b.EffectiveTo); other.Before(end) {
			end = other
		}
		hi = &end
	}
	return hi == nil || !hi.Before(lo)
}

func idText(id *uuid.UUID) *string {
	if id == nil {
		return nil
	}
	text := id.String()
	return &text
}

func text(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func contains(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func sorted(items []string) []string {
	out := make([]string, len(items))
	copy(out, items)
	sort.Strings(out)
	return out
}
