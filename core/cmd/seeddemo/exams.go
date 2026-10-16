package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	enttarget "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmenttarget"
	entday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entdaysched "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendardayschedule"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entsitting "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsitting"
	entexamsubj "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsubject"
	entprd "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entprdscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entcomponent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponent"
	entcompassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentassignment"
	entcompexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentexam"
	entresultscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultscheme"
	entoffer "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entteachassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	enttt "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	enttslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	svc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

const (
	examGapDays        = 4
	examDayAttempts    = 20
	examStartHour      = 8
	examEndHour        = 14
	examPeriodChoices  = 3
	schemeStandardCode = "RS-STD-100"
	schemeHomeworkCode = "RS-HW-100"
)

var examCoreSubjects = []string{"MATH", "SCI", "ENG", "SST", "HIN"}

var examTestSubjects = []string{"MATH", "SCI", "ENG"}

const classTestBlurb = "One period, ten marks, no choice. " +
	"The best two of the four class tests count toward the result."

type examPlan struct {
	code     string
	name     string
	examType entexam.ExamType
	kind     entexam.AssessmentKind
	subjects []string
	maximum  float64
	pass     *float64
	banded   bool
	blurb    string
}

var examPlans = []examPlan{
	{
		code: "CT-1", name: "Class Test I", examType: entexam.ExamTypeUnitTest,
		kind: entexam.AssessmentKindEvaluative, subjects: examTestSubjects,
		maximum: 10, pass: marksOf(4), blurb: classTestBlurb,
	},
	{
		code: "CT-2", name: "Class Test II", examType: entexam.ExamTypeUnitTest,
		kind: entexam.AssessmentKindEvaluative, subjects: examTestSubjects,
		maximum: 10, pass: marksOf(4), blurb: classTestBlurb,
	},
	{
		code: "CT-3", name: "Class Test III", examType: entexam.ExamTypeUnitTest,
		kind: entexam.AssessmentKindEvaluative, subjects: examTestSubjects,
		maximum: 10, pass: marksOf(4), blurb: classTestBlurb,
	},
	{
		code: "PRAC-1", name: "Half-Yearly Practice Test", examType: entexam.ExamTypePractice,
		kind: entexam.AssessmentKindPractice, subjects: examTestSubjects,
		maximum: 25, pass: nil,
		blurb: "A rehearsal for the half-yearly, out of twenty-five. Marked and returned, but it " +
			"counts for nothing: no result component may draw on a practice assessment.",
	},
	{
		code: "HY", name: "Half-Yearly Examination", examType: entexam.ExamTypeTerm,
		kind: entexam.AssessmentKindEvaluative, subjects: examCoreSubjects,
		maximum: 40, pass: marksOf(13), banded: true,
		blurb: "Ninety minutes, forty marks, the first half of the syllabus. " +
			"Carries twenty of the final hundred.",
	},
	{
		code: "CT-4", name: "Class Test IV", examType: entexam.ExamTypeUnitTest,
		kind: entexam.AssessmentKindEvaluative, subjects: examTestSubjects,
		maximum: 10, pass: marksOf(4), blurb: classTestBlurb,
	},
	{
		code: "ANN", name: "Annual Examination", examType: entexam.ExamTypeTerm,
		kind: entexam.AssessmentKindEvaluative, subjects: examCoreSubjects,
		maximum: 80, pass: marksOf(26), banded: true,
		blurb: "Three hours, eighty marks, the whole syllabus. " +
			"Carries the balance of the final hundred.",
	},
}

var homeworkPlans = []struct {
	code, title, description string
	maximum                  float64
	dueOffsetDays            int
}{
	{"HW-1", "Homework Portfolio I",
		"Work submitted between the first class test and the second.", 20, -42},
	{"HW-2", "Homework Portfolio II",
		"Work submitted between the second class test and the half-yearly.", 20, -21},
	{"HW-3", "Homework Portfolio III",
		"Work submitted between the half-yearly and the fourth class test.", 20, 7},
}

type componentPlan struct {
	name        string
	maximum     float64
	weight      float64
	aggregation entcomponent.Aggregation
	takeBest    *int
	exams       []string
	assignments []string
}

type schemePlan struct {
	code        string
	name        string
	description string
	total       float64
	components  []componentPlan
}

var schemePlans = []schemePlan{
	{
		code: schemeStandardCode,
		name: "Standard 100 (half-yearly, class tests, annual)",
		description: "The half-yearly out of forty carries twenty, the best two of four class " +
			"tests of ten carry ten, and the annual out of eighty carries the remaining seventy.",
		total: 100,
		components: []componentPlan{
			{name: "Half-Yearly Examination", maximum: 40, weight: 20,
				aggregation: entcomponent.AggregationSingle, exams: []string{"HY"}},
			{name: "Class Tests (best two of four)", maximum: 20, weight: 10,
				aggregation: entcomponent.AggregationBestOf, takeBest: countOf(2),
				exams: []string{"CT-1", "CT-2", "CT-3", "CT-4"}},
			{name: "Annual Examination", maximum: 80, weight: 70,
				aggregation: entcomponent.AggregationSingle, exams: []string{"ANN"}},
		},
	},
	{
		code: schemeHomeworkCode,
		name: "Standard 100 with homework",
		description: "The same shape, with ten of the hundred taken off the annual and given to " +
			"the average of three homework portfolios.",
		total: 100,
		components: []componentPlan{
			{name: "Half-Yearly Examination", maximum: 40, weight: 20,
				aggregation: entcomponent.AggregationSingle, exams: []string{"HY"}},
			{name: "Class Tests (best two of four)", maximum: 20, weight: 10,
				aggregation: entcomponent.AggregationBestOf, takeBest: countOf(2),
				exams: []string{"CT-1", "CT-2", "CT-3", "CT-4"}},
			{name: "Homework", maximum: 20, weight: 10,
				aggregation: entcomponent.AggregationAverage,
				assignments: []string{"HW-1", "HW-2", "HW-3"}},
			{name: "Annual Examination", maximum: 80, weight: 60,
				aggregation: entcomponent.AggregationSingle, exams: []string{"ANN"}},
		},
	},
}

func marksOf(v float64) *float64 { return &v }

func countOf(v int) *int { return &v }

type examIndex struct {
	offering map[uuid.UUID]map[uuid.UUID]*tenantent.SubjectOffering
	subject  map[string]uuid.UUID
	teacher  map[uuid.UUID]*uuid.UUID
	gradeAt  map[uuid.UUID]int
}

func (x *examIndex) offeringOf(section uuid.UUID, code string) *tenantent.SubjectOffering {
	subject, known := x.subject[code]
	if !known {
		return nil
	}
	return x.offering[section][subject]
}

type examPaper struct {
	section  *tenantent.Section
	offering *tenantent.SubjectOffering
	teacher  *uuid.UUID
	subject  string
}

type examCell struct {
	day    *tenantent.CalendarDay
	period *tenantent.Period
	papers []examPaper
}

type examDay struct {
	row    *tenantent.CalendarDay
	on     time.Time
	target uuid.UUID
}

type sittingKey struct {
	section uuid.UUID
	period  uuid.UUID
}

func (s *seeder) exams(ctx context.Context, a *academics) error {
	if s.o.dryRun {
		fmt.Println("dry run: exams are placed against real calendar days and periods, so they are skipped")
		return nil
	}

	index, err := s.examIndex(ctx, a)
	if err != nil {
		return fmt.Errorf("index: %w", err)
	}
	periods, err := s.examPeriods(ctx, a)
	if err != nil {
		return fmt.Errorf("periods: %w", err)
	}
	if len(periods) == 0 {
		fmt.Println("exams: no teaching period is defined for this branch, so nothing is placed")
		return nil
	}
	days, err := s.examDays(ctx, a)
	if err != nil {
		return fmt.Errorf("calendar: %w", err)
	}
	if len(days) == 0 {
		fmt.Println("exams: no weekday is both in session and covered by a published timetable")
		return nil
	}

	cursor := 0
	for _, plan := range examPlans {
		cells, err := s.examCells(ctx, a, index, plan, periods, days, &cursor)
		if err != nil {
			return fmt.Errorf("%s: %w", plan.code, err)
		}
		if err := s.writeExam(ctx, a, plan, cells); err != nil {
			return fmt.Errorf("%s: %w", plan.code, err)
		}
		cursor += examGapDays
	}

	if err := s.homework(ctx, a); err != nil {
		return fmt.Errorf("homework: %w", err)
	}
	if err := s.resultSchemes(ctx, a); err != nil {
		return fmt.Errorf("result schemes: %w", err)
	}
	return s.reportSittingClashes(ctx, a)
}

func (s *seeder) examIndex(ctx context.Context, a *academics) (*examIndex, error) {
	index := &examIndex{
		offering: map[uuid.UUID]map[uuid.UUID]*tenantent.SubjectOffering{},
		subject:  map[string]uuid.UUID{},
		teacher:  map[uuid.UUID]*uuid.UUID{},
		gradeAt:  map[uuid.UUID]int{},
	}
	for at, grade := range a.grades {
		index.gradeAt[grade.ID] = at
	}
	for _, subject := range a.subjects {
		index.subject[subject.Code] = subject.ID
	}
	for _, offering := range a.offerings {
		bySubject, known := index.offering[offering.SectionID]
		if !known {
			bySubject = map[uuid.UUID]*tenantent.SubjectOffering{}
			index.offering[offering.SectionID] = bySubject
		}
		bySubject[offering.SubjectID] = offering
	}

	rows, err := s.client.TeacherAssignment.Query().
		Where(entteachassign.StatusEQ(entteachassign.StatusActive)).
		Order(
			tenantent.Desc(entteachassign.FieldIsPrimary),
			tenantent.Asc(entteachassign.FieldCreatedAt),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.SubjectOfferingID == nil {
			continue
		}
		if _, taken := index.teacher[*row.SubjectOfferingID]; taken {
			continue
		}
		teacher := row.TeacherID
		index.teacher[*row.SubjectOfferingID] = &teacher
	}
	return index, nil
}

func (s *seeder) examPeriods(ctx context.Context, a *academics) ([]*tenantent.Period, error) {
	rows, err := s.client.Period.Query().
		Where(
			entprd.KindEQ(entprd.KindTeaching),
			entprd.StatusEQ(entprd.StatusActive),
			entprd.HasPeriodSchemeWith(
				entprdscheme.BranchID(a.branch.ID),
				entprdscheme.AcademicSessionID(a.session.ID),
				entprdscheme.Code(schemeCode),
			),
		).
		Order(entprd.BySequence()).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(rows) > examPeriodChoices {
		rows = rows[:examPeriodChoices]
	}
	return rows, nil
}

func (s *seeder) examScheme(ctx context.Context, a *academics) (*tenantent.PeriodScheme, error) {
	return s.client.PeriodScheme.Query().
		Where(
			entprdscheme.BranchID(a.branch.ID),
			entprdscheme.AcademicSessionID(a.session.ID),
			entprdscheme.Code(schemeCode),
		).
		Only(ctx)
}

func (s *seeder) examDays(ctx context.Context, a *academics) ([]examDay, error) {
	scheme, err := s.examScheme(ctx, a)
	if err != nil {
		if tenantent.IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	rows, err := s.client.CalendarDay.Query().
		Where(
			entday.BranchID(a.branch.ID),
			entday.AcademicSessionID(a.session.ID),
			entday.DayTypeEQ(entday.DayTypeInstructional),
		).
		Order(entday.ByCalendarDate()).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make([]examDay, 0, len(rows))
	for _, row := range rows {
		if !row.ForenoonOpen || !row.AfternoonOpen {
			continue
		}
		on := svc.Day(row.CalendarDate)
		if svc.ISODayOfWeek(on) > 5 {
			continue
		}
		runs, err := s.client.CalendarDaySchedule.Query().
			Where(
				entdaysched.CalendarDayID(row.ID),
				entdaysched.PeriodSchemeID(scheme.ID),
			).
			Exist(ctx)
		if err != nil {
			return nil, err
		}
		if !runs {
			continue
		}
		target, err := s.examTimetable(ctx, scheme.ID, on)
		if err != nil {
			if tenantent.IsNotFound(err) {
				continue
			}
			return nil, err
		}
		out = append(out, examDay{row: row, on: on, target: target})
	}
	return out, nil
}

func (s *seeder) examTimetable(ctx context.Context, scheme uuid.UUID,
	on time.Time) (uuid.UUID, error) {

	row, err := s.client.Timetable.Query().
		Where(
			enttt.PeriodSchemeID(scheme),
			enttt.StatusEQ(enttt.StatusPublished),
			enttt.EffectiveFromLTE(on),
			enttt.Or(enttt.EffectiveToIsNil(), enttt.EffectiveToGTE(on)),
		).
		Order(
			tenantent.Desc(enttt.FieldEffectiveFrom),
			tenantent.Desc(enttt.FieldVersion),
			tenantent.Desc(enttt.FieldCreatedAt),
		).
		First(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	return row.ID, nil
}

func (s *seeder) examCells(ctx context.Context, a *academics, index *examIndex, plan examPlan,
	periods []*tenantent.Period, days []examDay, cursor *int) ([]examCell, error) {

	rounds, err := examRounds(a, index, plan)
	if err != nil {
		return nil, err
	}

	cells := make([]examCell, 0, len(rounds))
	for at, papers := range rounds {
		day, period, err := s.placeCell(ctx, a, days, cursor, periods, at%len(periods), papers)
		if err != nil {
			return nil, err
		}
		cells = append(cells, examCell{day: day.row, period: period, papers: papers})
	}
	return cells, nil
}

func examRounds(a *academics, index *examIndex, plan examPlan) ([][]examPaper, error) {
	left := map[uuid.UUID][]string{}
	total := 0
	for _, section := range a.sections {
		for _, code := range plan.subjects {
			if index.offeringOf(section.ID, code) == nil {
				continue
			}
			left[section.ID] = append(left[section.ID], code)
			total++
		}
	}
	if total == 0 {
		return nil, errors.New("no section studies any of the subjects this exam covers")
	}

	limit := len(plan.subjects) * 3
	rounds := make([][]examPaper, 0, len(plan.subjects))
	for round := 0; total > 0; round++ {
		if round >= limit {
			return nil, fmt.Errorf("%d papers are still unplaced after %d rounds: "+
				"they cannot be spread without sitting one teacher in two rooms at once",
				total, limit)
		}
		choices := matchRound(a, index, left, round)
		papers := make([]examPaper, 0, len(choices))
		for _, section := range a.sections {
			at, matched := choices[section.ID]
			if !matched {
				continue
			}
			pending := left[section.ID]
			offering := index.offeringOf(section.ID, pending[at])
			papers = append(papers, examPaper{
				section:  section,
				offering: offering,
				teacher:  index.teacher[offering.ID],
				subject:  pending[at],
			})
			left[section.ID] = append(pending[:at:at], pending[at+1:]...)
			total--
		}
		if len(papers) == 0 {
			return nil, errors.New("a whole round came out empty, so the papers cannot be spread")
		}
		rounds = append(rounds, papers)
	}
	return rounds, nil
}

func matchRound(a *academics, index *examIndex, left map[uuid.UUID][]string,
	round int) map[uuid.UUID]int {

	chosen := map[uuid.UUID]int{}
	holder := map[uuid.UUID]uuid.UUID{}

	var seat func(section *tenantent.Section, seen map[uuid.UUID]bool) bool
	seat = func(section *tenantent.Section, seen map[uuid.UUID]bool) bool {
		pending := left[section.ID]
		if len(pending) == 0 {
			return false
		}
		start := (index.gradeAt[section.GradeLevelID] + round) % len(pending)
		for step := 0; step < len(pending); step++ {
			at := (start + step) % len(pending)
			offering := index.offeringOf(section.ID, pending[at])
			teacher := index.teacher[offering.ID]
			if teacher == nil {
				chosen[section.ID] = at
				return true
			}
			if seen[*teacher] {
				continue
			}
			seen[*teacher] = true
			held, busy := holder[*teacher]
			if busy && !seat(sectionOf(a, held), seen) {
				continue
			}
			holder[*teacher] = section.ID
			chosen[section.ID] = at
			return true
		}
		return false
	}

	for _, section := range a.sections {
		if len(left[section.ID]) == 0 {
			continue
		}
		seat(section, map[uuid.UUID]bool{})
	}
	return chosen
}

func sectionOf(a *academics, id uuid.UUID) *tenantent.Section {
	for _, section := range a.sections {
		if section.ID == id {
			return section
		}
	}
	return nil
}

func (s *seeder) placeCell(ctx context.Context, a *academics, days []examDay, cursor *int,
	periods []*tenantent.Period, preferred int,
	papers []examPaper) (examDay, *tenantent.Period, error) {

	for tried := 0; tried < examDayAttempts; tried++ {
		if *cursor >= len(days) {
			return examDay{}, nil, errors.New("the calendar runs out before every paper has a day")
		}
		day := days[*cursor]
		*cursor++

		var refused svc.Clash
		for offset := 0; offset < len(periods); offset++ {
			period := periods[(preferred+offset)%len(periods)]
			blocking, err := s.cellClashes(ctx, a, day, period, papers)
			if err != nil {
				return examDay{}, nil, err
			}
			if len(blocking) == 0 {
				return day, period, nil
			}
			if offset == 0 {
				refused = blocking[0]
			}
		}
		fmt.Printf("exams: no period on %s is free of the timetable (%s), trying the next day\n",
			day.on.Format(dateLayout), refused.Rule)
	}
	return examDay{}, nil, errors.New("no day within reach takes this paper without a clash")
}

func (s *seeder) cellClashes(ctx context.Context, a *academics, day examDay,
	period *tenantent.Period, papers []examPaper) ([]svc.Clash, error) {

	dayOfWeek := svc.ISODayOfWeek(day.on)
	keys := make([]sittingKey, 0, len(papers))
	proposals := make([]svc.Proposal, 0, len(papers))
	for at, paper := range papers {
		offering := paper.offering.ID
		proposals = append(proposals, svc.Proposal{
			Ref:               fmt.Sprintf("proposed:%d", at),
			SectionID:         paper.section.ID,
			PeriodID:          period.ID,
			DayOfWeek:         dayOfWeek,
			SubjectOfferingID: &offering,
			TeacherID:         paper.teacher,
		})
		keys = append(keys, sittingKey{section: paper.section.ID, period: period.ID})
	}
	return s.sittingClashes(ctx, a, day.target, day.on, proposals, keys)
}

func (s *seeder) sittingClashes(ctx context.Context, a *academics, timetable uuid.UUID,
	on time.Time, proposals []svc.Proposal, keys []sittingKey) ([]svc.Clash, error) {

	displaced, err := s.displacedSlots(ctx, timetable, svc.ISODayOfWeek(on), keys)
	if err != nil {
		return nil, err
	}
	report, err := svc.New(s.client).Check(ctx, svc.ClashQuery{
		BranchID:       a.branch.ID,
		TimetableID:    timetable,
		Proposed:       proposals,
		ExcludeSlotIDs: displaced,
		From:           on,
		To:             on,
		Rules:          svc.AllRules(),
	})
	if err != nil {
		return nil, err
	}
	return report.Blocking(), nil
}

func (s *seeder) displacedSlots(ctx context.Context, timetable uuid.UUID, dayOfWeek int,
	keys []sittingKey) ([]uuid.UUID, error) {

	if len(keys) == 0 {
		return nil, nil
	}
	arms := make([]predicate.TimetableSlot, 0, len(keys))
	for _, key := range keys {
		arms = append(arms, enttslot.And(
			enttslot.SectionID(key.section),
			enttslot.PeriodID(key.period),
		))
	}
	return s.client.TimetableSlot.Query().
		Where(
			enttslot.TimetableID(timetable),
			enttslot.DayOfWeek(dayOfWeek),
			enttslot.Or(arms...),
		).
		IDs(ctx)
}

func (s *seeder) writeExam(ctx context.Context, a *academics, plan examPlan,
	cells []examCell) error {

	exam, err := s.examRow(ctx, a, plan, cells)
	if err != nil {
		return err
	}
	for _, cell := range cells {
		for _, paper := range cell.papers {
			subject, err := s.examSubjectRow(ctx, plan, exam, paper)
			if err != nil {
				return fmt.Errorf("%s %s: %w", paper.section.Code, paper.subject, err)
			}
			if err := s.examSittingRow(ctx, subject, cell, paper); err != nil {
				return fmt.Errorf("%s %s: %w", paper.section.Code, paper.subject, err)
			}
		}
	}
	return nil
}

func (s *seeder) examRow(ctx context.Context, a *academics, plan examPlan,
	cells []examCell) (*tenantent.Exam, error) {

	found, err := s.client.Exam.Query().
		Where(
			entexam.AcademicSessionID(a.session.ID),
			entexam.BranchID(a.branch.ID),
			entexam.Code(plan.code),
		).
		Only(ctx)
	if err == nil {
		return found, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}

	from, to := examWindowOf(cells, s.location())
	row, err := s.client.Exam.Create().
		SetAcademicSessionID(a.session.ID).
		SetBranchID(a.branch.ID).
		SetName(plan.name).
		SetCode(plan.code).
		SetExamType(plan.examType).
		SetAssessmentKind(plan.kind).
		SetStatus(entexam.StatusPublished).
		SetInstructions(plan.blurb).
		SetNillableStartAt(from).
		SetNillableEndAt(to).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	s.note("exam", 1)
	return row, nil
}

func examWindowOf(cells []examCell, loc *time.Location) (*time.Time, *time.Time) {
	if len(cells) == 0 {
		return nil, nil
	}
	dates := make([]time.Time, 0, len(cells))
	for _, cell := range cells {
		dates = append(dates, svc.Day(cell.day.CalendarDate))
	}
	sort.Slice(dates, func(i, j int) bool { return dates[i].Before(dates[j]) })

	first, last := dates[0], dates[len(dates)-1]
	from := time.Date(first.Year(), first.Month(), first.Day(), examStartHour, 0, 0, 0, loc)
	to := time.Date(last.Year(), last.Month(), last.Day(), examEndHour, 0, 0, 0, loc)
	return &from, &to
}

func (s *seeder) examSubjectRow(ctx context.Context, plan examPlan, exam *tenantent.Exam,
	paper examPaper) (*tenantent.ExamSubject, error) {

	found, err := s.client.ExamSubject.Query().
		Where(
			entexamsubj.ExamID(exam.ID),
			entexamsubj.SubjectOfferingID(paper.offering.ID),
		).
		Only(ctx)
	if err == nil {
		return found, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}

	if plan.maximum <= 0 {
		return nil, fmt.Errorf("maximum_marks must be above zero, not %g", plan.maximum)
	}
	if plan.pass != nil && (*plan.pass < 0 || *plan.pass > plan.maximum) {
		return nil, fmt.Errorf("pass_marks %g does not sit between zero and %g",
			*plan.pass, plan.maximum)
	}

	create := s.client.ExamSubject.Create().
		SetExamID(exam.ID).
		SetSubjectOfferingID(paper.offering.ID).
		SetMaximumMarks(plan.maximum).
		SetNillablePassMarks(plan.pass)
	if plan.banded {
		create = create.SetNillableGradingSchemeID(paper.offering.GradingSchemeID)
	}
	row, err := create.Save(ctx)
	if err != nil {
		return nil, err
	}
	s.note("exam_subject", 1)
	return row, nil
}

func (s *seeder) examSittingRow(ctx context.Context, subject *tenantent.ExamSubject,
	cell examCell, paper examPaper) error {

	seated, err := s.client.ExamSitting.Query().
		Where(entsitting.ExamSubjectID(subject.ID)).
		Exist(ctx)
	if err != nil {
		return err
	}
	if seated {
		return nil
	}
	if err := s.client.ExamSitting.Create().
		SetExamSubjectID(subject.ID).
		SetCalendarDayID(cell.day.ID).
		SetPeriodID(cell.period.ID).
		SetSectionID(paper.offering.SectionID).
		Exec(ctx); err != nil {
		return err
	}
	s.note("exam_sitting", 1)
	return nil
}

func (s *seeder) homework(ctx context.Context, a *academics) error {
	if len(a.teachers) == 0 {
		return errors.New("homework needs a teacher to have set it")
	}
	loc := s.location()
	today := s.today()

	for _, plan := range homeworkPlans {
		row, err := s.client.Assignment.Query().
			Where(
				entassign.AcademicSessionID(a.session.ID),
				entassign.Title(plan.title),
			).
			First(ctx)
		if err != nil && !tenantent.IsNotFound(err) {
			return err
		}
		if err != nil {
			if plan.maximum <= 0 {
				return fmt.Errorf("%q: an assignment a result draws on has to be marked out of "+
					"something, and this one is out of %g", plan.title, plan.maximum)
			}
			due := today.AddDate(0, 0, plan.dueOffsetDays)
			from := due.AddDate(0, 0, -14)
			row, err = s.client.Assignment.Create().
				SetAcademicSessionID(a.session.ID).
				SetTeacherID(a.teachers[0].ID).
				SetTitle(plan.title).
				SetDescription(plan.description).
				SetAssignmentType(entassign.AssignmentTypeWorksheet).
				SetMaximumMarks(plan.maximum).
				SetAvailableFrom(time.Date(from.Year(), from.Month(), from.Day(), 9, 0, 0, 0, loc)).
				SetDueAt(time.Date(due.Year(), due.Month(), due.Day(), 17, 0, 0, 0, loc)).
				SetStatus(entassign.StatusPublished).
				Save(ctx)
			if err != nil {
				return err
			}
			s.note("homework", 1)
		}
		if err := s.homeworkTargets(ctx, a, row); err != nil {
			return fmt.Errorf("%q: %w", plan.title, err)
		}
	}
	return nil
}

func (s *seeder) homeworkTargets(ctx context.Context, a *academics,
	assignment *tenantent.Assignment) error {

	for _, section := range a.sections {
		aimed, err := s.client.AssignmentTarget.Query().
			Where(
				enttarget.AssignmentID(assignment.ID),
				enttarget.TargetTypeEQ(enttarget.TargetTypeSection),
				enttarget.TargetID(section.ID),
			).
			Exist(ctx)
		if err != nil {
			return err
		}
		if aimed {
			continue
		}
		if err := s.client.AssignmentTarget.Create().
			SetAssignmentID(assignment.ID).
			SetTargetType(enttarget.TargetTypeSection).
			SetTargetID(section.ID).
			Exec(ctx); err != nil {
			return err
		}
		s.note("homework_target", 1)
	}
	return nil
}

func (s *seeder) resultSchemes(ctx context.Context, a *academics) error {
	exams, err := s.examsByCode(ctx, a)
	if err != nil {
		return err
	}
	assignments, err := s.assignmentsByCode(ctx, a)
	if err != nil {
		return err
	}

	var standard *tenantent.ResultScheme
	for _, plan := range schemePlans {
		scheme, err := s.resultScheme(ctx, a, plan, exams, assignments)
		if err != nil {
			return fmt.Errorf("%s: %w", plan.code, err)
		}
		if plan.code == schemeStandardCode {
			standard = scheme
		}
	}
	if standard == nil {
		return nil
	}
	return s.attachResultScheme(ctx, a, standard)
}

func (s *seeder) examsByCode(ctx context.Context,
	a *academics) (map[string]*tenantent.Exam, error) {

	rows, err := s.client.Exam.Query().
		Where(entexam.AcademicSessionID(a.session.ID), entexam.BranchID(a.branch.ID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]*tenantent.Exam, len(rows))
	for _, row := range rows {
		out[row.Code] = row
	}
	return out, nil
}

func (s *seeder) assignmentsByCode(ctx context.Context,
	a *academics) (map[string]*tenantent.Assignment, error) {

	titles := make([]string, 0, len(homeworkPlans))
	for _, plan := range homeworkPlans {
		titles = append(titles, plan.title)
	}

	rows, err := s.client.Assignment.Query().
		Where(
			entassign.AcademicSessionID(a.session.ID),
			entassign.TitleIn(titles...),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	byTitle := make(map[string]*tenantent.Assignment, len(rows))
	for _, row := range rows {
		byTitle[row.Title] = row
	}

	out := make(map[string]*tenantent.Assignment, len(homeworkPlans))
	for _, plan := range homeworkPlans {
		if row, known := byTitle[plan.title]; known {
			out[plan.code] = row
		}
	}
	return out, nil
}

func (s *seeder) resultScheme(ctx context.Context, a *academics, plan schemePlan,
	exams map[string]*tenantent.Exam,
	assignments map[string]*tenantent.Assignment) (*tenantent.ResultScheme, error) {

	scheme, err := s.client.ResultScheme.Query().
		Where(
			entresultscheme.AcademicSessionID(a.session.ID),
			entresultscheme.Code(plan.code),
		).
		Only(ctx)
	if err != nil && !tenantent.IsNotFound(err) {
		return nil, err
	}
	if err != nil {
		scheme, err = s.client.ResultScheme.Create().
			SetAcademicSessionID(a.session.ID).
			SetName(plan.name).
			SetCode(plan.code).
			SetDescription(plan.description).
			SetTotalMarks(plan.total).
			SetStatus(entresultscheme.StatusDraft).
			Save(ctx)
		if err != nil {
			return nil, err
		}
		s.note("result_scheme", 1)
	}

	if scheme.Status == entresultscheme.StatusDraft {
		for at, component := range plan.components {
			if err := s.resultComponent(ctx, scheme, component, at, exams, assignments); err != nil {
				return nil, fmt.Errorf("%q: %w", component.name, err)
			}
		}
	}

	refusal, err := s.activationRefusal(ctx, scheme)
	if err != nil {
		return nil, err
	}
	if refusal != "" {
		return nil, errors.New(refusal)
	}
	if scheme.Status == entresultscheme.StatusActive {
		return scheme, nil
	}

	scheme, err = s.client.ResultScheme.UpdateOne(scheme).
		SetStatus(entresultscheme.StatusActive).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	s.note("result_scheme_activated", 1)
	return scheme, nil
}

func (s *seeder) resultComponent(ctx context.Context, scheme *tenantent.ResultScheme,
	plan componentPlan, position int, exams map[string]*tenantent.Exam,
	assignments map[string]*tenantent.Assignment) error {

	if plan.maximum <= 0 || plan.weight <= 0 {
		return fmt.Errorf("maximum_marks %g and weight %g must both be above zero",
			plan.maximum, plan.weight)
	}
	if (plan.aggregation == entcomponent.AggregationBestOf) != (plan.takeBest != nil) {
		return errors.New("take_best belongs to best_of and to nothing else")
	}

	component, err := s.client.ResultComponent.Query().
		Where(
			entcomponent.ResultSchemeID(scheme.ID),
			entcomponent.Name(plan.name),
		).
		Only(ctx)
	if err != nil && !tenantent.IsNotFound(err) {
		return err
	}
	if err != nil {
		create := s.client.ResultComponent.Create().
			SetResultSchemeID(scheme.ID).
			SetName(plan.name).
			SetMaximumMarks(plan.maximum).
			SetWeight(plan.weight).
			SetAggregation(plan.aggregation).
			SetPosition(position)
		if plan.takeBest != nil {
			create = create.SetTakeBest(*plan.takeBest)
		}
		component, err = create.Save(ctx)
		if err != nil {
			return err
		}
		s.note("result_component", 1)
	}

	if err := s.componentExams(ctx, scheme, component, plan, exams); err != nil {
		return err
	}
	return s.componentAssignments(ctx, scheme, component, plan, assignments)
}

func (s *seeder) componentExams(ctx context.Context, scheme *tenantent.ResultScheme,
	component *tenantent.ResultComponent, plan componentPlan,
	exams map[string]*tenantent.Exam) error {

	for _, code := range plan.exams {
		exam, known := exams[code]
		if !known {
			return fmt.Errorf("no exam is coded %s", code)
		}
		if exam.AssessmentKind == entexam.AssessmentKindPractice {
			return fmt.Errorf("%q says it does not count toward the result, so no component "+
				"may draw on it", exam.Name)
		}
		if exam.AcademicSessionID != scheme.AcademicSessionID {
			return fmt.Errorf("%q belongs to another academic session than this scheme", exam.Name)
		}
		linked, err := s.client.ResultComponentExam.Query().
			Where(
				entcompexam.ResultComponentID(component.ID),
				entcompexam.ExamID(exam.ID),
			).
			Exist(ctx)
		if err != nil {
			return err
		}
		if linked {
			continue
		}
		if err := s.client.ResultComponentExam.Create().
			SetResultComponentID(component.ID).
			SetExamID(exam.ID).
			Exec(ctx); err != nil {
			return err
		}
		s.note("result_component_exam", 1)
	}
	return nil
}

func (s *seeder) componentAssignments(ctx context.Context, scheme *tenantent.ResultScheme,
	component *tenantent.ResultComponent, plan componentPlan,
	assignments map[string]*tenantent.Assignment) error {

	for _, code := range plan.assignments {
		assignment, known := assignments[code]
		if !known {
			return fmt.Errorf("no assignment is coded %s", code)
		}
		if assignment.MaximumMarks == nil || *assignment.MaximumMarks <= 0 {
			return fmt.Errorf("%q is not marked out of anything, so the fraction it would "+
				"contribute is undefined", assignment.Title)
		}
		if assignment.AcademicSessionID != scheme.AcademicSessionID {
			return fmt.Errorf("%q belongs to another academic session than this scheme",
				assignment.Title)
		}
		linked, err := s.client.ResultComponentAssignment.Query().
			Where(
				entcompassign.ResultComponentID(component.ID),
				entcompassign.AssignmentID(assignment.ID),
			).
			Exist(ctx)
		if err != nil {
			return err
		}
		if linked {
			continue
		}
		if err := s.client.ResultComponentAssignment.Create().
			SetResultComponentID(component.ID).
			SetAssignmentID(assignment.ID).
			Exec(ctx); err != nil {
			return err
		}
		s.note("result_component_assignment", 1)
	}
	return nil
}

func (s *seeder) activationRefusal(ctx context.Context,
	scheme *tenantent.ResultScheme) (string, error) {

	components, err := s.client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(scheme.ID)).
		Order(tenantent.Asc(entcomponent.FieldPosition)).
		All(ctx)
	if err != nil {
		return "", err
	}
	if len(components) == 0 {
		return scheme.Code + " has no components, so there is nothing for its marks to be " +
			"composed of", nil
	}

	sum := 0.0
	for _, component := range components {
		sum += component.Weight
	}
	if math.Round(sum*100) != math.Round(scheme.TotalMarks*100) {
		return fmt.Sprintf("%s: the component weights add up to %g, not the %g it is out of",
			scheme.Code, sum, scheme.TotalMarks), nil
	}

	for _, component := range components {
		fromExams, err := s.client.ResultComponentExam.Query().
			Where(entcompexam.ResultComponentID(component.ID)).Count(ctx)
		if err != nil {
			return "", err
		}
		fromWork, err := s.client.ResultComponentAssignment.Query().
			Where(entcompassign.ResultComponentID(component.ID)).Count(ctx)
		if err != nil {
			return "", err
		}
		linked := fromExams + fromWork
		if linked == 0 {
			return fmt.Sprintf("%s: %q carries %g of the %g but nothing can fill it",
				scheme.Code, component.Name, component.Weight, scheme.TotalMarks), nil
		}
		if component.Aggregation != entcomponent.AggregationBestOf {
			continue
		}
		if component.TakeBest == nil {
			return fmt.Sprintf("%s: %q aggregates best_of without saying how many count",
				scheme.Code, component.Name), nil
		}
		if linked < *component.TakeBest {
			return fmt.Sprintf("%s: %q takes the best %d of only %d sources",
				scheme.Code, component.Name, *component.TakeBest, linked), nil
		}
	}
	return "", nil
}

func (s *seeder) attachResultScheme(ctx context.Context, a *academics,
	scheme *tenantent.ResultScheme) error {

	ids := make([]uuid.UUID, 0, len(a.offerings))
	for _, offering := range a.offerings {
		ids = append(ids, offering.ID)
	}
	unset, err := s.client.SubjectOffering.Query().
		Where(entoffer.IDIn(ids...), entoffer.ResultSchemeIDIsNil()).
		IDs(ctx)
	if err != nil {
		return err
	}
	if len(unset) == 0 {
		return nil
	}
	n, err := s.client.SubjectOffering.Update().
		Where(entoffer.IDIn(unset...)).
		SetResultSchemeID(scheme.ID).
		Save(ctx)
	if err != nil {
		return err
	}
	s.note("offering_result_scheme", n)
	return nil
}

func (s *seeder) reportSittingClashes(ctx context.Context, a *academics) error {
	rows, err := s.client.ExamSitting.Query().
		WithExamSubject().
		WithCalendarDay().
		Order(tenantent.Asc(entsitting.FieldID)).
		All(ctx)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	byDay := map[uuid.UUID][]*tenantent.ExamSitting{}
	days := map[uuid.UUID]*tenantent.CalendarDay{}
	for _, row := range rows {
		if row.Edges.CalendarDay == nil || row.Edges.ExamSubject == nil {
			continue
		}
		if row.Edges.CalendarDay.BranchID != a.branch.ID {
			continue
		}
		byDay[row.CalendarDayID] = append(byDay[row.CalendarDayID], row)
		days[row.CalendarDayID] = row.Edges.CalendarDay
	}
	if len(byDay) == 0 {
		return nil
	}

	index, err := s.examIndex(ctx, a)
	if err != nil {
		return err
	}
	scheme, err := s.examScheme(ctx, a)
	if err != nil {
		return err
	}

	ordered := make([]uuid.UUID, 0, len(byDay))
	for id := range byDay {
		ordered = append(ordered, id)
	}
	sort.Slice(ordered, func(i, j int) bool {
		return days[ordered[i]].CalendarDate.Before(days[ordered[j]].CalendarDate)
	})

	seated, found := 0, 0
	for _, id := range ordered {
		on := svc.Day(days[id].CalendarDate)
		dayOfWeek := svc.ISODayOfWeek(on)
		target, err := s.examTimetable(ctx, scheme.ID, on)
		if err != nil {
			return err
		}

		proposals := make([]svc.Proposal, 0, len(byDay[id]))
		keys := make([]sittingKey, 0, len(byDay[id]))
		for _, sitting := range byDay[id] {
			offering := sitting.Edges.ExamSubject.SubjectOfferingID
			proposals = append(proposals, svc.Proposal{
				Ref:               "sitting:" + sitting.ID.String(),
				SectionID:         sitting.SectionID,
				PeriodID:          sitting.PeriodID,
				DayOfWeek:         dayOfWeek,
				SubjectOfferingID: &offering,
				TeacherID:         index.teacher[offering],
				RoomID:            sitting.RoomID,
			})
			keys = append(keys, sittingKey{section: sitting.SectionID, period: sitting.PeriodID})
		}
		seated += len(proposals)

		blocking, err := s.sittingClashes(ctx, a, target, on, proposals, keys)
		if err != nil {
			return err
		}
		found += len(blocking)
		for _, clash := range blocking {
			fmt.Printf("  sitting clash %-12s %s period %s students %d\n",
				clash.Rule, on.Format(dateLayout), clash.PeriodID, clash.StudentCount)
		}
	}

	if found > 0 {
		return fmt.Errorf("%d of the seeded exam sittings clash with the timetable, which is a "+
			"placement the API would have refused", found)
	}
	fmt.Printf("exam sittings: %d over %d days, checked against %s, clash check clear\n",
		seated, len(ordered), "timetable_slots and timetable_deviations")
	return nil
}
