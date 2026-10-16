package access

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entdayrow "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceday"
	entmarkrow "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceperiod"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entguardianlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

func attendancePeriodRenders(p predicate.AttendancePeriod) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("attendance_periods"))
	p(sel)
	return sel.Query()
}

func attendanceDayRenders(p predicate.AttendanceDay) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("attendance_days"))
	p(sel)
	return sel.Query()
}

func attendancePeriodSQL(v *Viewer, d authorization.Decision) (string, []any) {
	return attendancePeriodRenders(AttendancePeriodsFor(v, d))
}

func attendancePeriodWriteSQL(v *Viewer, d authorization.Decision) (string, []any) {
	return attendancePeriodRenders(AttendancePeriodsWritableBy(v, d))
}

func attendanceDaySQL(v *Viewer, d authorization.Decision) (string, []any) {
	return attendanceDayRenders(AttendanceDaysFor(v, d))
}

func attendanceDayWriteSQL(v *Viewer, d authorization.Decision) (string, []any) {
	return attendanceDayRenders(AttendanceDaysWritableBy(v, d))
}

func attendancePinned(r authorization.Reach, groups ...[]authorization.Constraint) authorization.Decision {
	d := withScope(r)
	d.Constraints = groups
	return d
}

type attendanceCast struct {
	person    uuid.UUID
	teacher   uuid.UUID
	section   uuid.UUID
	physics   uuid.UUID
	history   uuid.UUID
	student   uuid.UUID
	classmate uuid.UUID
	guardian  uuid.UUID

	subjectTeacher *Viewer
	classTeacher   *Viewer
	pupil          *Viewer
	ward           *Viewer
}

func attendanceViewers() attendanceCast {
	c := attendanceCast{
		person:    uuid.New(),
		teacher:   uuid.New(),
		section:   uuid.New(),
		physics:   uuid.New(),
		history:   uuid.New(),
		student:   uuid.New(),
		classmate: uuid.New(),
		guardian:  uuid.New(),
	}

	c.subjectTeacher = &Viewer{
		PersonID:           &c.person,
		TeacherID:          &c.teacher,
		SubjectOfferingIDs: []uuid.UUID{c.physics},
	}
	c.classTeacher = &Viewer{
		PersonID:   &c.person,
		TeacherID:  &c.teacher,
		SectionIDs: []uuid.UUID{c.section},
	}
	c.pupil = &Viewer{
		PersonID:            &c.person,
		StudentIDs:          []uuid.UUID{c.student},
		EnrolledOfferingIDs: []uuid.UUID{c.physics},
	}
	c.ward = &Viewer{
		PersonID:        &c.person,
		GuardianID:      &c.guardian,
		WardOfferingIDs: []uuid.UUID{c.physics},
	}
	return c
}

type attendanceCase struct {
	name        string
	viewer      *Viewer
	decision    authorization.Decision
	unfiltered  bool
	matchesNone bool
	mustHave    []string
	mustNotHave []string
	wantArgs    []uuid.UUID
	denyArgs    []uuid.UUID
}

func runAttendanceCases(t *testing.T, nothing string, render func(*Viewer, authorization.Decision) (string, []any), cases []attendanceCase) {
	t.Helper()

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := render(tc.viewer, tc.decision)

			if tc.unfiltered {
				if strings.Contains(strings.ToUpper(got), "WHERE") {
					t.Fatalf("expected an unfiltered query, got %q", got)
				}
				return
			}

			filtered(t, tc.name, got)

			if tc.matchesNone {
				if got != nothing {
					t.Fatalf("expected the deny predicate %q, got %q", nothing, got)
				}
				return
			}

			for _, want := range tc.mustHave {
				if !strings.Contains(got, want) {
					t.Fatalf("expected %q in %q", want, got)
				}
			}
			for _, banned := range tc.mustNotHave {
				if strings.Contains(got, banned) {
					t.Fatalf("did not expect %q in %q", banned, got)
				}
			}
			for _, id := range tc.wantArgs {
				if !carries(args, id) {
					t.Fatalf("expected %s among the arguments %v of %q", id, args, got)
				}
			}
			for _, id := range tc.denyArgs {
				if carries(args, id) {
					t.Fatalf("did not expect %s among the arguments %v of %q", id, args, got)
				}
			}
		})
	}
}

func TestAttendancePeriodReadScopes(t *testing.T) {
	c := attendanceViewers()
	nothing, _ := attendancePeriodRenders(NoAttendancePeriod())

	runAttendanceCases(t, nothing, attendancePeriodSQL, []attendanceCase{
		{
			name:        "a nil viewer matches nothing",
			viewer:      nil,
			decision:    withScope(authorization.ReachTenant),
			matchesNone: true,
		},
		{
			name:       "an unrestricted viewer matches every row",
			viewer:     &Viewer{Unrestricted: true},
			decision:   authorization.Decision{Allowed: true},
			unfiltered: true,
		},
		{
			name:        "a zero viewer matches nothing",
			viewer:      &Viewer{},
			decision:    authorization.Decision{Allowed: true},
			matchesNone: true,
		},
		{
			name:        "an unknown reach matches nothing",
			viewer:      c.subjectTeacher,
			decision:    withScope("whole_district"),
			matchesNone: true,
		},
		{
			name:        "an empty reach matches nothing",
			viewer:      c.subjectTeacher,
			decision:    withScope(""),
			matchesNone: true,
		},
		{
			name:       "tenant reach matches every row",
			viewer:     c.subjectTeacher,
			decision:   withScope(authorization.ReachTenant),
			unfiltered: true,
		},
		{
			name:        "self reach takes the pupil's own marks and nothing else",
			viewer:      c.pupil,
			decision:    withScope(authorization.ReachSelf),
			mustHave:    []string{`"attendance_periods"."student_id" IN`},
			mustNotHave: []string{"student_guardians", "subject_offerings", "subject_offering_id"},
			wantArgs:    []uuid.UUID{c.student},
			denyArgs:    []uuid.UUID{c.classmate, c.physics, c.history, c.section},
		},
		{
			name:        "self reach on a viewer with no student identity matches nothing",
			viewer:      c.subjectTeacher,
			decision:    withScope(authorization.ReachSelf),
			matchesNone: true,
		},
		{
			name:        "guardian ward reach passes through the academic flag on the link",
			viewer:      c.ward,
			decision:    withScope(authorization.ReachGuardianWard),
			mustHave:    []string{`"student_guardians"."guardian_id" = `, `"student_guardians"."can_view_academic"`},
			mustNotHave: []string{`"attendance_periods"."student_id" IN`},
			wantArgs:    []uuid.UUID{c.guardian},
			denyArgs:    []uuid.UUID{c.student, c.classmate},
		},
		{
			name:        "guardian ward reach without a guardian identity matches nothing",
			viewer:      &Viewer{PersonID: &c.person, StudentIDs: []uuid.UUID{c.student}},
			decision:    withScope(authorization.ReachGuardianWard),
			matchesNone: true,
		},
		{
			name:        "teacher assignment reach takes the offerings taught",
			viewer:      c.subjectTeacher,
			decision:    withScope(authorization.ReachTeacherAssignment),
			mustHave:    []string{`"attendance_periods"."subject_offering_id" IN`},
			mustNotHave: []string{"student_guardians", `"attendance_periods"."student_id"`},
			wantArgs:    []uuid.UUID{c.physics},
			denyArgs:    []uuid.UUID{c.history, c.student, c.section},
		},
		{
			name:     "a section assignment reaches the offerings of that section",
			viewer:   c.classTeacher,
			decision: withScope(authorization.ReachTeacherAssignment),
			mustHave: []string{`"subject_offerings"."section_id" IN`},
			wantArgs: []uuid.UUID{c.section},
			denyArgs: []uuid.UUID{c.physics, c.history, c.student},
		},
		{
			name:        "a pupil at teacher assignment reach matches nothing",
			viewer:      c.pupil,
			decision:    withScope(authorization.ReachTeacherAssignment),
			matchesNone: true,
		},
		{
			name:     "no reach unions every role the viewer holds",
			viewer:   &Viewer{PersonID: &c.person, SubjectOfferingIDs: []uuid.UUID{c.physics}, StudentIDs: []uuid.UUID{c.student}, GuardianID: &c.guardian},
			decision: authorization.Decision{Allowed: true},
			mustHave: []string{`"attendance_periods"."subject_offering_id" IN`, `"attendance_periods"."student_id" IN`, "student_guardians"},
			wantArgs: []uuid.UUID{c.physics, c.student, c.guardian},
			denyArgs: []uuid.UUID{c.history, c.classmate},
		},
	})
}

func TestAttendancePeriodWriteScopes(t *testing.T) {
	c := attendanceViewers()
	nothing, _ := attendancePeriodRenders(NoAttendancePeriod())

	runAttendanceCases(t, nothing, attendancePeriodWriteSQL, []attendanceCase{
		{
			name:        "a nil viewer writes nothing",
			viewer:      nil,
			decision:    withScope(authorization.ReachTenant),
			matchesNone: true,
		},
		{
			name:       "tenant reach writes every row",
			viewer:     c.subjectTeacher,
			decision:   withScope(authorization.ReachTenant),
			unfiltered: true,
		},
		{
			name:        "a teacher writes the offerings taught, never a student",
			viewer:      c.subjectTeacher,
			decision:    withScope(authorization.ReachTeacherAssignment),
			mustHave:    []string{`"attendance_periods"."subject_offering_id" IN`},
			mustNotHave: []string{"students", `"attendance_periods"."student_id"`, "student_subject_enrollments"},
			wantArgs:    []uuid.UUID{c.physics},
			denyArgs:    []uuid.UUID{c.history, c.student, c.classmate, c.section},
		},
		{
			name:        "a section assignment alone writes no period mark",
			viewer:      c.classTeacher,
			decision:    withScope(authorization.ReachTeacherAssignment),
			matchesNone: true,
		},
		{
			name:        "a pupil writes nothing at self reach",
			viewer:      c.pupil,
			decision:    withScope(authorization.ReachSelf),
			matchesNone: true,
		},
		{
			name:        "a guardian writes nothing at ward reach",
			viewer:      c.ward,
			decision:    withScope(authorization.ReachGuardianWard),
			matchesNone: true,
		},
		{
			name:        "an unknown reach writes nothing",
			viewer:      c.subjectTeacher,
			decision:    withScope("whole_district"),
			matchesNone: true,
		},
		{
			name:        "no reach falls back to the offerings taught",
			viewer:      &Viewer{PersonID: &c.person, SubjectOfferingIDs: []uuid.UUID{c.physics}, StudentIDs: []uuid.UUID{c.student}, GuardianID: &c.guardian},
			decision:    authorization.Decision{Allowed: true},
			mustHave:    []string{`"attendance_periods"."subject_offering_id" IN`},
			mustNotHave: []string{"student_guardians", `"attendance_periods"."student_id"`},
			wantArgs:    []uuid.UUID{c.physics},
			denyArgs:    []uuid.UUID{c.student, c.guardian},
		},
	})
}

func TestAttendanceDayReadScopes(t *testing.T) {
	c := attendanceViewers()
	nothing, _ := attendanceDayRenders(NoAttendanceDay())

	runAttendanceCases(t, nothing, attendanceDaySQL, []attendanceCase{
		{
			name:        "a nil viewer matches nothing",
			viewer:      nil,
			decision:    withScope(authorization.ReachTenant),
			matchesNone: true,
		},
		{
			name:       "tenant reach matches every row",
			viewer:     c.classTeacher,
			decision:   withScope(authorization.ReachTenant),
			unfiltered: true,
		},
		{
			name:        "self reach takes the pupil's own day rows",
			viewer:      c.pupil,
			decision:    withScope(authorization.ReachSelf),
			mustHave:    []string{`"attendance_days"."student_id" IN`},
			mustNotHave: []string{"student_guardians", `"attendance_days"."section_id"`},
			wantArgs:    []uuid.UUID{c.student},
			denyArgs:    []uuid.UUID{c.classmate, c.section},
		},
		{
			name:        "self reach on a viewer with no student identity matches nothing",
			viewer:      c.classTeacher,
			decision:    withScope(authorization.ReachSelf),
			matchesNone: true,
		},
		{
			name:     "guardian ward reach passes through the academic flag on the link",
			viewer:   c.ward,
			decision: withScope(authorization.ReachGuardianWard),
			mustHave: []string{`"student_guardians"."guardian_id" = `, `"student_guardians"."can_view_academic"`},
			wantArgs: []uuid.UUID{c.guardian},
			denyArgs: []uuid.UUID{c.student, c.classmate},
		},
		{
			name:        "a class teacher reads the day rows of the section",
			viewer:      c.classTeacher,
			decision:    withScope(authorization.ReachTeacherAssignment),
			mustHave:    []string{`"attendance_days"."section_id" IN`},
			mustNotHave: []string{"student_guardians"},
			wantArgs:    []uuid.UUID{c.section},
			denyArgs:    []uuid.UUID{c.physics, c.student},
		},
		{
			name:        "a subject teacher reads the day rows of the students taught",
			viewer:      c.subjectTeacher,
			decision:    withScope(authorization.ReachTeacherAssignment),
			mustHave:    []string{"student_subject_enrollments"},
			mustNotHave: []string{`"attendance_days"."section_id"`, "student_guardians"},
			wantArgs:    []uuid.UUID{c.physics},
			denyArgs:    []uuid.UUID{c.history, c.section},
		},
		{
			name:        "an unknown reach matches nothing",
			viewer:      c.classTeacher,
			decision:    withScope("whole_district"),
			matchesNone: true,
		},
	})
}

func TestAttendanceDayWriteScopes(t *testing.T) {
	c := attendanceViewers()
	nothing, _ := attendanceDayRenders(NoAttendanceDay())

	runAttendanceCases(t, nothing, attendanceDayWriteSQL, []attendanceCase{
		{
			name:        "a nil viewer writes nothing",
			viewer:      nil,
			decision:    withScope(authorization.ReachTenant),
			matchesNone: true,
		},
		{
			name:       "tenant reach writes every row",
			viewer:     c.classTeacher,
			decision:   withScope(authorization.ReachTenant),
			unfiltered: true,
		},
		{
			name:        "a class teacher writes the day rows of the section",
			viewer:      c.classTeacher,
			decision:    withScope(authorization.ReachTeacherAssignment),
			mustHave:    []string{`"attendance_days"."section_id" IN`},
			mustNotHave: []string{"students", "student_subject_enrollments"},
			wantArgs:    []uuid.UUID{c.section},
			denyArgs:    []uuid.UUID{c.physics, c.student},
		},
		{
			name:        "a subject teacher writes no day row at all",
			viewer:      c.subjectTeacher,
			decision:    withScope(authorization.ReachTeacherAssignment),
			matchesNone: true,
		},
		{
			name:        "a pupil writes nothing at self reach",
			viewer:      c.pupil,
			decision:    withScope(authorization.ReachSelf),
			matchesNone: true,
		},
		{
			name:        "a guardian writes nothing at ward reach",
			viewer:      c.ward,
			decision:    withScope(authorization.ReachGuardianWard),
			matchesNone: true,
		},
		{
			name:        "an unknown reach writes nothing",
			viewer:      c.classTeacher,
			decision:    withScope("whole_district"),
			matchesNone: true,
		},
	})
}

func TestAttendancePinsNarrowTheQuery(t *testing.T) {
	c := attendanceViewers()

	noMark, _ := attendancePeriodRenders(NoAttendancePeriod())
	noDay, _ := attendanceDayRenders(NoAttendanceDay())

	unpinnedMark, _ := attendancePeriodSQL(c.subjectTeacher, withScope(authorization.ReachTeacherAssignment))
	unpinnedDay, _ := attendanceDaySQL(c.classTeacher, withScope(authorization.ReachTeacherAssignment))

	t.Run("a section pin on a period reaches the section through the offering", func(t *testing.T) {
		got, args := attendancePeriodSQL(c.subjectTeacher, attendancePinned(authorization.ReachTeacherAssignment, pin("section", "9A")))
		filtered(t, "pinned period", got)
		if got == unpinnedMark {
			t.Fatalf("the pinned query is byte-identical to the unpinned one %q", unpinnedMark)
		}
		for _, want := range []string{"subject_offerings", `"sections"."code" IN`} {
			if !strings.Contains(got, want) {
				t.Fatalf("expected %q in %q", want, got)
			}
		}
		if !carriesValue(args, "9A") {
			t.Fatalf("expected the pin value among the arguments %v", args)
		}
		if !carries(args, c.physics) {
			t.Fatalf("the pin replaced the scope instead of narrowing it: %q", got)
		}
	})

	t.Run("a grade pin on a day row reaches the grade through the section", func(t *testing.T) {
		got, args := attendanceDaySQL(c.classTeacher, attendancePinned(authorization.ReachTeacherAssignment, pin("grade_level", "9")))
		filtered(t, "pinned day", got)
		if got == unpinnedDay {
			t.Fatalf("the pinned query is byte-identical to the unpinned one %q", unpinnedDay)
		}
		if !strings.Contains(got, `"grade_levels"."code" IN`) {
			t.Fatalf("expected a grade code term in %q", got)
		}
		if !carriesValue(args, "9") {
			t.Fatalf("expected the pin value among the arguments %v", args)
		}
	})

	t.Run("tenant reach keeps only the pin", func(t *testing.T) {
		got, args := attendanceDaySQL(c.classTeacher, attendancePinned(authorization.ReachTenant, pin("section", "9A")))
		filtered(t, "pinned tenant day", got)
		if carries(args, c.section) {
			t.Fatalf("tenant reach must not carry the viewer's own sections: %v", args)
		}
		if !carriesValue(args, "9A") {
			t.Fatalf("expected the pin value among the arguments %v", args)
		}
	})

	t.Run("an untranslatable pin denies rather than widens", func(t *testing.T) {
		for _, r := range []authorization.Reach{authorization.ReachTenant, authorization.ReachTeacherAssignment, authorization.ReachSelf, authorization.ReachGuardianWard} {
			d := attendancePinned(r, pin("campus", "north"))

			if got, _ := attendancePeriodSQL(c.subjectTeacher, d); got != noMark {
				t.Fatalf("reach %q: period read must deny, got %q", r, got)
			}
			if got, _ := attendancePeriodWriteSQL(c.subjectTeacher, d); got != noMark {
				t.Fatalf("reach %q: period write must deny, got %q", r, got)
			}
			if got, _ := attendanceDaySQL(c.classTeacher, d); got != noDay {
				t.Fatalf("reach %q: day read must deny, got %q", r, got)
			}
			if got, _ := attendanceDayWriteSQL(c.classTeacher, d); got != noDay {
				t.Fatalf("reach %q: day write must deny, got %q", r, got)
			}
		}
	})

	t.Run("an empty pin denies", func(t *testing.T) {
		d := attendancePinned(authorization.ReachTeacherAssignment, pin("section"))
		if got, _ := attendancePeriodSQL(c.subjectTeacher, d); got != noMark {
			t.Fatalf("an unsatisfied pin must deny, got %q", got)
		}
		if got, _ := attendanceDaySQL(c.classTeacher, d); got != noDay {
			t.Fatalf("an unsatisfied pin must deny, got %q", got)
		}
	})

	t.Run("one untranslatable group among translatable ones is dropped, not fatal", func(t *testing.T) {
		d := attendancePinned(authorization.ReachTeacherAssignment, pin("section", "9A"), pin("campus", "north"))
		got, args := attendancePeriodSQL(c.subjectTeacher, d)
		filtered(t, "mixed pins", got)
		if got == noMark {
			t.Fatalf("a translatable group was present, the query must not deny")
		}
		if !carriesValue(args, "9A") {
			t.Fatalf("expected the translatable pin among the arguments %v", args)
		}
		if carriesValue(args, "north") {
			t.Fatalf("the untranslatable pin leaked into the arguments %v", args)
		}
	})
}

func TestAttendanceNeverFallsThroughUnfiltered(t *testing.T) {
	person := uuid.New()
	viewers := map[string]*Viewer{
		"nil":            nil,
		"empty":          {},
		"person":         {PersonID: &person},
		"subjectTeacher": {PersonID: &person, SubjectOfferingIDs: []uuid.UUID{uuid.New()}},
		"classTeacher":   {PersonID: &person, SectionIDs: []uuid.UUID{uuid.New()}},
		"pupil":          {PersonID: &person, StudentIDs: []uuid.UUID{uuid.New()}},
		"guardian":       {PersonID: &person, GuardianID: &person},
	}
	groups := map[string][]authorization.Constraint{
		"none":         nil,
		"section":      pin("section", "9A"),
		"grade":        pin("grade_level", "9"),
		"untranslated": pin("campus", "north"),
	}

	reaches := append([]authorization.Reach{}, authorization.AllReaches...)
	reaches = append(reaches, "whole_district", "")

	for name, v := range viewers {
		for _, r := range reaches {
			for label, group := range groups {
				if r == authorization.ReachTenant && group == nil {
					continue
				}
				d := withScope(r)
				if group != nil {
					d = attendancePinned(r, group)
				}
				where := name + "/" + string(r) + "/" + label

				read, _ := attendancePeriodSQL(v, d)
				filtered(t, "period read "+where, read)

				write, _ := attendancePeriodWriteSQL(v, d)
				filtered(t, "period write "+where, write)

				dayRead, _ := attendanceDaySQL(v, d)
				filtered(t, "day read "+where, dayRead)

				dayWrite, _ := attendanceDayWriteSQL(v, d)
				filtered(t, "day write "+where, dayWrite)
			}
		}
	}
}

func attendanceWithoutFixture(t *testing.T, missing string) {
	t.Helper()

	message := "the tenant database holds no " + missing + ", so nothing here checked that attendance " +
		"scoping filters rows. Seed the tenant, or set " + testsupport.RequireEnv + "=1 to make this a failure."

	switch strings.ToLower(strings.TrimSpace(os.Getenv(testsupport.RequireEnv))) {
	case "1", "true", "yes", "on":
		t.Fatal(message)
	}
	t.Skip(message)
}

type attendanceFixture struct {
	db *testsupport.TenantDB

	session   uuid.UUID
	student   uuid.UUID
	classmate uuid.UUID
	guardian  uuid.UUID
	link      uuid.UUID
	section   uuid.UUID
	physics   uuid.UUID
	history   uuid.UUID

	ownPhysics uuid.UUID
	ownHistory uuid.UUID
	matePhysic uuid.UUID
	ownDay     uuid.UUID
	mateDay    uuid.UUID
}

func attendanceSeed(ctx context.Context, t *testing.T) attendanceFixture {
	t.Helper()

	db := testsupport.TenantTx(ctx, t)

	links, err := db.Client.StudentGuardian.Query().
		Where(entguardianlink.StatusEQ(entguardianlink.StatusActive)).
		Limit(40).All(ctx)
	if err != nil {
		t.Fatalf("guardian links: %v", err)
	}

	f := attendanceFixture{db: db}

	for _, link := range links {
		rows, err := db.Client.StudentSubjectEnrollment.Query().
			Where(
				entsubject.StudentID(link.StudentID),
				entsubject.StatusEQ(entsubject.StatusActive),
			).
			WithSubjectOffering().
			All(ctx)
		if err != nil {
			t.Fatalf("subject enrolments of %s: %v", link.StudentID, err)
		}

		var offerings []uuid.UUID
		var sections []uuid.UUID
		var sessions []uuid.UUID
		for _, row := range rows {
			if row.Edges.SubjectOffering == nil {
				continue
			}
			if len(sessions) > 0 && row.AcademicSessionID != sessions[0] {
				continue
			}
			offerings = append(offerings, row.SubjectOfferingID)
			sections = append(sections, row.Edges.SubjectOffering.SectionID)
			sessions = append(sessions, row.AcademicSessionID)
		}
		if len(offerings) < 2 {
			continue
		}

		f.student = link.StudentID
		f.guardian = link.GuardianID
		f.link = link.ID
		f.physics = offerings[0]
		f.history = offerings[1]
		f.section = sections[0]
		f.session = sessions[0]
		break
	}

	if f.student == uuid.Nil {
		attendanceWithoutFixture(t, "student with a guardian link and two active subject enrolments")
	}

	mates, err := db.Client.StudentSubjectEnrollment.Query().
		Where(
			entsubject.SubjectOfferingID(f.physics),
			entsubject.StatusEQ(entsubject.StatusActive),
			entsubject.StudentIDNEQ(f.student),
		).
		First(ctx)
	if err != nil {
		attendanceWithoutFixture(t, "second student on the same subject offering")
	}
	f.classmate = mates.StudentID

	branch, err := db.Client.Branch.Query().First(ctx)
	if err != nil {
		attendanceWithoutFixture(t, "branch")
	}

	tag := uuid.NewString()[:8]
	scheme, err := db.Client.PeriodScheme.Create().
		SetAcademicSessionID(f.session).
		SetBranchID(branch.ID).
		SetName("attendance access " + tag).
		SetCode("ACC-" + tag).
		Save(ctx)
	if err != nil {
		t.Fatalf("period scheme: %v", err)
	}

	first, err := db.Client.Period.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("first").SetCode("P1-" + tag).SetSequence(1).
		Save(ctx)
	if err != nil {
		t.Fatalf("period: %v", err)
	}
	second, err := db.Client.Period.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("second").SetCode("P2-" + tag).SetSequence(2).
		Save(ctx)
	if err != nil {
		t.Fatalf("period: %v", err)
	}

	day := time.Date(2026, time.March, 3, 0, 0, 0, 0, time.UTC)

	mark := func(student, offering, period uuid.UUID) uuid.UUID {
		row, err := db.Client.AttendancePeriod.Create().
			SetStudentID(student).
			SetAcademicSessionID(f.session).
			SetSubjectOfferingID(offering).
			SetPeriodID(period).
			SetAttendanceDate(day).
			SetStatus(entmarkrow.StatusPresent).
			Save(ctx)
		if err != nil {
			t.Fatalf("attendance period: %v", err)
		}
		return row.ID
	}

	f.ownPhysics = mark(f.student, f.physics, first.ID)
	f.ownHistory = mark(f.student, f.history, second.ID)
	f.matePhysic = mark(f.classmate, f.physics, first.ID)

	dayRow := func(student uuid.UUID) uuid.UUID {
		row, err := db.Client.AttendanceDay.Create().
			SetStudentID(student).
			SetAcademicSessionID(f.session).
			SetSectionID(f.section).
			SetAttendanceDate(day).
			SetForenoonStatus(entdayrow.ForenoonStatusPresent).
			Save(ctx)
		if err != nil {
			t.Fatalf("attendance day: %v", err)
		}
		return row.ID
	}

	f.ownDay = dayRow(f.student)
	f.mateDay = dayRow(f.classmate)

	return f
}

func (f attendanceFixture) marks(ctx context.Context, t *testing.T, p predicate.AttendancePeriod) map[uuid.UUID]bool {
	t.Helper()

	ids, err := f.db.Client.AttendancePeriod.Query().
		Where(p, entmarkrow.IDIn(f.ownPhysics, f.ownHistory, f.matePhysic)).
		IDs(ctx)
	if err != nil {
		t.Fatalf("attendance periods: %v", err)
	}
	out := map[uuid.UUID]bool{}
	for _, id := range ids {
		out[id] = true
	}
	return out
}

func (f attendanceFixture) days(ctx context.Context, t *testing.T, p predicate.AttendanceDay) map[uuid.UUID]bool {
	t.Helper()

	ids, err := f.db.Client.AttendanceDay.Query().
		Where(p, entdayrow.IDIn(f.ownDay, f.mateDay)).
		IDs(ctx)
	if err != nil {
		t.Fatalf("attendance days: %v", err)
	}
	out := map[uuid.UUID]bool{}
	for _, id := range ids {
		out[id] = true
	}
	return out
}

func TestAttendanceAgainstPostgres(t *testing.T) {
	ctx := context.Background()
	f := attendanceSeed(ctx, t)

	teacher := uuid.New()
	person := uuid.New()

	subjectTeacher := &Viewer{PersonID: &person, TeacherID: &teacher, SubjectOfferingIDs: []uuid.UUID{f.physics}}
	classTeacher := &Viewer{PersonID: &person, TeacherID: &teacher, SectionIDs: []uuid.UUID{f.section}}
	pupil := &Viewer{PersonID: &person, StudentIDs: []uuid.UUID{f.student}}
	ward := &Viewer{PersonID: &person, GuardianID: &f.guardian}

	t.Run("a teacher of one subject cannot write another subject's mark for the same student", func(t *testing.T) {
		got := f.marks(ctx, t, AttendancePeriodsWritableBy(subjectTeacher, withScope(authorization.ReachTeacherAssignment)))

		if !got[f.ownPhysics] {
			t.Fatalf("the teacher cannot write the mark on the offering they teach, so the scope is useless")
		}
		if !got[f.matePhysic] {
			t.Fatalf("the teacher cannot write a classmate's mark on the offering they teach")
		}
		if got[f.ownHistory] {
			t.Fatalf("the teacher of one offering reached the same student's mark on another offering %s; "+
				"the write is scoped to the class, never to the student", f.history)
		}
	})

	t.Run("a student cannot see a classmate's mark", func(t *testing.T) {
		got := f.marks(ctx, t, AttendancePeriodsFor(pupil, withScope(authorization.ReachSelf)))

		if !got[f.ownPhysics] || !got[f.ownHistory] {
			t.Fatalf("the pupil cannot see their own marks: %v", got)
		}
		if got[f.matePhysic] {
			t.Fatalf("the pupil reached a classmate's mark %s", f.matePhysic)
		}
	})

	t.Run("a subject teacher cannot write a day row the class teacher owns", func(t *testing.T) {
		byClass := f.days(ctx, t, AttendanceDaysWritableBy(classTeacher, withScope(authorization.ReachTeacherAssignment)))
		if !byClass[f.ownDay] || !byClass[f.mateDay] {
			t.Fatalf("the class teacher cannot write the day rows of their own section: %v", byClass)
		}

		bySubject := f.days(ctx, t, AttendanceDaysWritableBy(subjectTeacher, withScope(authorization.ReachTeacherAssignment)))
		if len(bySubject) != 0 {
			t.Fatalf("a subject teacher rewrote %d whole-day rows; the day row is not theirs to mark", len(bySubject))
		}
	})

	t.Run("a guardian without academic access is denied", func(t *testing.T) {
		allowed := f.marks(ctx, t, AttendancePeriodsFor(ward, withScope(authorization.ReachGuardianWard)))
		if !allowed[f.ownPhysics] {
			t.Fatalf("a guardian with academic access cannot see the ward's mark, so the flip below proves nothing")
		}

		if _, err := f.db.Client.StudentGuardian.UpdateOneID(f.link).SetCanViewAcademic(false).Save(ctx); err != nil {
			t.Fatalf("could not clear can_view_academic on %s: %v", f.link, err)
		}

		denied := f.marks(ctx, t, AttendancePeriodsFor(ward, withScope(authorization.ReachGuardianWard)))
		if len(denied) != 0 {
			t.Fatalf("a guardian with can_view_academic=false still reached %d attendance rows", len(denied))
		}

		deniedDays := f.days(ctx, t, AttendanceDaysFor(ward, withScope(authorization.ReachGuardianWard)))
		if len(deniedDays) != 0 {
			t.Fatalf("a guardian with can_view_academic=false still reached %d day rows", len(deniedDays))
		}
	})
}
