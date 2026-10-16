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
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

func timetableSlotRenders(p predicate.TimetableSlot) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("timetable_slots"))
	p(sel)
	return sel.Query()
}

func timetableRenders(p predicate.Timetable) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("timetables"))
	p(sel)
	return sel.Query()
}

func timetableDeviationRenders(p predicate.TimetableDeviation) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("timetable_deviations"))
	p(sel)
	return sel.Query()
}

func periodSchemeRenders(p predicate.PeriodScheme) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("period_schemes"))
	p(sel)
	return sel.Query()
}

func periodRenders(p predicate.Period) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("periods"))
	p(sel)
	return sel.Query()
}

func bellScheduleRenders(p predicate.BellSchedule) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("bell_schedules"))
	p(sel)
	return sel.Query()
}

func calendarDayRenders(p predicate.CalendarDay) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("calendar_days"))
	p(sel)
	return sel.Query()
}

func roomRenders(p predicate.Room) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("rooms"))
	p(sel)
	return sel.Query()
}

func timetableSlotSQL(v *Viewer, d authorization.Decision) (string, []any) {
	return timetableSlotRenders(TimetableSlotsFor(v, d))
}

func timetableSlotWriteSQL(v *Viewer, d authorization.Decision) (string, []any) {
	return timetableSlotRenders(TimetableSlotsWritableBy(v, d))
}

func timetablePinned(r authorization.Reach, groups ...[]authorization.Constraint) authorization.Decision {
	d := withScope(r)
	d.Constraints = groups
	return d
}

type timetableCast struct {
	person   uuid.UUID
	section  uuid.UUID
	offering uuid.UUID
	student  uuid.UUID
	guardian uuid.UUID
	teacher  uuid.UUID
	staff    *Viewer
	pupil    *Viewer
	ward     *Viewer
}

func timetableViewers() timetableCast {
	c := timetableCast{
		person:   uuid.New(),
		section:  uuid.New(),
		offering: uuid.New(),
		student:  uuid.New(),
		guardian: uuid.New(),
		teacher:  uuid.New(),
	}
	c.staff = &Viewer{
		PersonID:           &c.person,
		TeacherID:          &c.teacher,
		SectionIDs:         []uuid.UUID{c.section},
		SubjectOfferingIDs: []uuid.UUID{c.offering},
	}
	c.pupil = &Viewer{
		PersonID:            &c.person,
		StudentIDs:          []uuid.UUID{c.student},
		EnrolledOfferingIDs: []uuid.UUID{c.offering},
	}
	c.ward = &Viewer{
		PersonID:        &c.person,
		GuardianID:      &c.guardian,
		WardOfferingIDs: []uuid.UUID{c.offering},
	}
	return c
}

func TestTimetableSlotScopes(t *testing.T) {
	c := timetableViewers()
	other := uuid.New()

	nothing, _ := timetableSlotRenders(NoTimetableSlot())

	cases := []struct {
		name        string
		viewer      *Viewer
		decision    authorization.Decision
		unfiltered  bool
		matchesNone bool
		mustHave    []string
		mustNotHave []string
		wantArgs    []uuid.UUID
		denyArgs    []uuid.UUID
	}{
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
			viewer:      c.staff,
			decision:    withScope("whole_district"),
			matchesNone: true,
		},
		{
			name:        "an empty reach matches nothing",
			viewer:      c.staff,
			decision:    withScope(""),
			matchesNone: true,
		},
		{
			name:       "tenant reach matches every row",
			viewer:     c.staff,
			decision:   withScope(authorization.ReachTenant),
			unfiltered: true,
		},
		{
			name:     "teacher assignment reach takes the offerings taught, the sections held and the slots pinned to the teacher",
			viewer:   c.staff,
			decision: withScope(authorization.ReachTeacherAssignment),
			mustHave: []string{
				`"timetable_slots"."subject_offering_id" IN`,
				`"timetable_slots"."section_id" IN`,
				`"timetable_slots"."teacher_id" = $`,
				`"timetables"."status" <> $`,
			},
			mustNotHave: []string{"student_enrollments", "student_guardians"},
			wantArgs:    []uuid.UUID{c.section, c.offering, c.teacher},
			denyArgs:    []uuid.UUID{other, c.student, c.guardian},
		},
		{
			name:     "self reach takes the offerings studied and the section rows that carry no offering",
			viewer:   c.pupil,
			decision: withScope(authorization.ReachSelf),
			mustHave: []string{
				`"timetable_slots"."subject_offering_id" IN`,
				`"timetable_slots"."subject_offering_id" IS NULL`,
				`"student_enrollments"."student_id" IN`,
			},
			mustNotHave: []string{
				`"timetable_slots"."section_id" IN`,
				"student_guardians",
			},
			wantArgs: []uuid.UUID{c.offering, c.student},
			denyArgs: []uuid.UUID{other, c.section, c.guardian, c.teacher},
		},
		{
			name:     "guardian ward reach takes the ward's offerings and the ward's section rows that carry no offering",
			viewer:   c.ward,
			decision: withScope(authorization.ReachGuardianWard),
			mustHave: []string{
				`"timetable_slots"."subject_offering_id" IN`,
				`"timetable_slots"."subject_offering_id" IS NULL`,
				`"student_guardians"."guardian_id" = `,
			},
			mustNotHave: []string{`"timetable_slots"."section_id" IN`},
			wantArgs:    []uuid.UUID{c.offering, c.guardian},
			denyArgs:    []uuid.UUID{other, c.section, c.student, c.teacher},
		},
		{
			name:        "a teacher at self reach reaches nothing it teaches",
			viewer:      c.staff,
			decision:    withScope(authorization.ReachSelf),
			matchesNone: true,
		},
		{
			name:        "a pupil at teacher assignment reach reaches nothing",
			viewer:      c.pupil,
			decision:    withScope(authorization.ReachTeacherAssignment),
			matchesNone: true,
		},
		{
			name:        "a guardian at self reach reaches nothing",
			viewer:      &Viewer{PersonID: &c.person, GuardianID: &c.guardian},
			decision:    withScope(authorization.ReachSelf),
			matchesNone: true,
		},
		{
			name:        "a person with no role at all reaches nothing without a reach",
			viewer:      &Viewer{PersonID: &c.person},
			decision:    authorization.Decision{Allowed: true},
			matchesNone: true,
		},
		{
			name:     "no reach unions every role the viewer holds",
			viewer:   &Viewer{PersonID: &c.person, SectionIDs: []uuid.UUID{c.section}, StudentIDs: []uuid.UUID{c.student}, GuardianID: &c.guardian},
			decision: authorization.Decision{Allowed: true},
			mustHave: []string{`"timetable_slots"."section_id" IN`, "student_enrollments", "student_guardians"},
			wantArgs: []uuid.UUID{c.section, c.student, c.guardian},
			denyArgs: []uuid.UUID{other},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := timetableSlotSQL(tc.viewer, tc.decision)

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

func TestTimetableSlotNeverGivesAPupilTheWholeSection(t *testing.T) {
	c := timetableViewers()

	personal := map[string]struct {
		viewer *Viewer
		reach  authorization.Reach
	}{
		"pupil": {c.pupil, authorization.ReachSelf},
		"ward":  {c.ward, authorization.ReachGuardianWard},
	}

	for label, tc := range personal {
		got, _ := timetableSlotSQL(tc.viewer, withScope(tc.reach))

		if strings.Contains(got, `"timetable_slots"."section_id" IN`) {
			t.Fatalf("%s/%s narrows by section id: grade XI runs Physics, History and Commerce in the "+
				"same period and a section-wide arm hands the pupil another stream's class. %q", label, tc.reach, got)
		}
		if !strings.Contains(got, `"timetable_slots"."subject_offering_id" IS NULL`) {
			t.Fatalf("%s/%s carries no offering-is-null arm, so assembly and games rows vanish "+
				"from the pupil's own day: %q", label, tc.reach, got)
		}

		offering := strings.Index(got, `"timetable_slots"."subject_offering_id" IS NULL`)
		enrolments := strings.Index(got, "student_enrollments")
		if offering < 0 || enrolments < 0 || enrolments < offering {
			t.Fatalf("%s/%s must reach student_enrollments only underneath the offering-is-null arm: %q",
				label, tc.reach, got)
		}
	}

	if got, _ := timetableSlotSQL(c.pupil, withScope(authorization.ReachGuardianWard)); !strings.Contains(got, "WHERE FALSE") {
		t.Fatalf("a pupil holding no guardian row must reach nothing at ward reach, got %q", got)
	}
	if got, _ := timetableSlotSQL(c.ward, withScope(authorization.ReachSelf)); !strings.Contains(got, "WHERE FALSE") {
		t.Fatalf("a guardian holding no student row must reach nothing at self reach, got %q", got)
	}
}

func TestTimetableSlotSelfReachWithoutAStudentIdentityMatchesNothing(t *testing.T) {
	person := uuid.New()
	guardian := uuid.New()
	offering := uuid.New()

	nothing, _ := timetableSlotRenders(NoTimetableSlot())

	viewers := map[string]*Viewer{
		"a person with no student row":            {PersonID: &person},
		"a guardian holding ward offerings":       {PersonID: &person, GuardianID: &guardian, WardOfferingIDs: []uuid.UUID{offering}},
		"offerings with no student row behind it": {PersonID: &person, EnrolledOfferingIDs: []uuid.UUID{offering}},
	}

	for name, v := range viewers {
		got, _ := timetableSlotSQL(v, withScope(authorization.ReachSelf))
		if got != nothing {
			t.Fatalf("%s at self reach must match nothing, got %q", name, got)
		}
		dev, _ := timetableDeviationRenders(TimetableDeviationsFor(v, withScope(authorization.ReachSelf)))
		deny, _ := timetableDeviationRenders(NoTimetableDeviation())
		if dev != deny {
			t.Fatalf("%s at self reach must reach no deviation, got %q", name, dev)
		}
	}
}

func TestTimetableNeverFallsThroughUnfiltered(t *testing.T) {
	person := uuid.New()
	viewers := map[string]*Viewer{
		"nil":      nil,
		"empty":    {},
		"person":   {PersonID: &person},
		"teacher":  {PersonID: &person, SectionIDs: []uuid.UUID{uuid.New()}},
		"pupil":    {PersonID: &person, StudentIDs: []uuid.UUID{uuid.New()}},
		"guardian": {PersonID: &person, GuardianID: &person},
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
				d := withScope(r)
				if group != nil {
					d = timetablePinned(r, group)
				}
				where := name + "/" + string(r) + "/" + label
				wide := r == authorization.ReachTenant && group == nil

				slot, _ := timetableSlotSQL(v, d)
				table, _ := timetableRenders(TimetablesFor(v, d))
				deviation, _ := timetableDeviationRenders(TimetableDeviationsFor(v, d))
				scheme, _ := periodSchemeRenders(PeriodSchemesFor(v, d))
				period, _ := periodRenders(PeriodsFor(v, d))
				bell, _ := bellScheduleRenders(BellSchedulesFor(v, d))
				day, _ := calendarDayRenders(CalendarDaysFor(v, d))
				room, _ := roomRenders(RoomsFor(v, d))

				if !wide {
					filtered(t, "slot "+where, slot)
					filtered(t, "timetable "+where, table)
					filtered(t, "deviation "+where, deviation)
				}

				slotWrite, _ := timetableSlotWriteSQL(v, d)
				tableWrite, _ := timetableRenders(TimetablesWritableBy(v, d))
				deviationWrite, _ := timetableDeviationRenders(TimetableDeviationsWritableBy(v, d))
				schemeWrite, _ := periodSchemeRenders(PeriodSchemesWritableBy(v, d))
				periodWrite, _ := periodRenders(PeriodsWritableBy(v, d))
				bellWrite, _ := bellScheduleRenders(BellSchedulesWritableBy(v, d))
				dayWrite, _ := calendarDayRenders(CalendarDaysWritableBy(v, d))
				roomWrite, _ := roomRenders(RoomsWritableBy(v, d))

				if !wide {
					filtered(t, "slot write "+where, slotWrite)
					filtered(t, "timetable write "+where, tableWrite)
					filtered(t, "deviation write "+where, deviationWrite)
					filtered(t, "scheme write "+where, schemeWrite)
					filtered(t, "period write "+where, periodWrite)
					filtered(t, "bell write "+where, bellWrite)
					filtered(t, "calendar write "+where, dayWrite)
					filtered(t, "room write "+where, roomWrite)
				}

				if v == nil {
					for what, q := range map[string]string{
						"scheme": scheme, "period": period, "bell": bell, "calendar": day, "room": room,
					} {
						filtered(t, what+" "+where, q)
					}
				}
			}
		}
	}
}

func TestTimetableWritesRefusePupilsAndGuardians(t *testing.T) {
	c := timetableViewers()

	deny, _ := timetableSlotRenders(NoTimetableSlot())
	denyTable, _ := timetableRenders(NoTimetable())
	denyDeviation, _ := timetableDeviationRenders(NoTimetableDeviation())

	cases := map[string]struct {
		viewer *Viewer
		reach  authorization.Reach
	}{
		"a pupil at self reach":              {c.pupil, authorization.ReachSelf},
		"a guardian at ward reach":           {c.ward, authorization.ReachGuardianWard},
		"a pupil with no reach at all":       {c.pupil, ""},
		"a teacher at an unresolvable reach": {c.staff, "whole_district"},
	}

	for name, tc := range cases {
		d := withScope(tc.reach)
		if tc.reach == "" {
			d = authorization.Decision{Allowed: true}
		}

		if got, _ := timetableSlotWriteSQL(tc.viewer, d); got != deny {
			t.Fatalf("%s must write no slot, got %q", name, got)
		}
		if got, _ := timetableRenders(TimetablesWritableBy(tc.viewer, d)); got != denyTable {
			t.Fatalf("%s must write no timetable, got %q", name, got)
		}
		if got, _ := timetableDeviationRenders(TimetableDeviationsWritableBy(tc.viewer, d)); got != denyDeviation {
			t.Fatalf("%s must write no deviation, got %q", name, got)
		}
	}
}

func TestTimetableDayShapeReadsOpenButWritesStayWithTheTenant(t *testing.T) {
	c := timetableViewers()

	for _, v := range []*Viewer{c.staff, c.pupil, c.ward} {
		for _, r := range authorization.AllReaches {
			if r == authorization.ReachSelf && len(v.StudentIDs) == 0 {
				continue
			}
			if r == authorization.ReachGuardianWard && v.GuardianID == nil {
				continue
			}
			if r == authorization.ReachTeacherAssignment && v.TeacherID == nil {
				continue
			}

			d := withScope(r)
			for what, q := range map[string]string{
				"bell schedule":  first(bellScheduleRenders(BellSchedulesFor(v, d))),
				"period":         first(periodRenders(PeriodsFor(v, d))),
				"period scheme":  first(periodSchemeRenders(PeriodSchemesFor(v, d))),
				"calendar day":   first(calendarDayRenders(CalendarDaysFor(v, d))),
				"room":           first(roomRenders(RoomsFor(v, d))),
				"slot for shape": "",
			} {
				if what == "slot for shape" {
					continue
				}
				if strings.Contains(strings.ToUpper(q), "WHERE") {
					t.Fatalf("%s at %s must be readable without narrowing, a pupil cannot render a day "+
						"without the bell: %q", what, r, q)
				}
			}

			if r == authorization.ReachTenant {
				continue
			}
			for what, q := range map[string]string{
				"bell schedule": first(bellScheduleRenders(BellSchedulesWritableBy(v, d))),
				"period":        first(periodRenders(PeriodsWritableBy(v, d))),
				"period scheme": first(periodSchemeRenders(PeriodSchemesWritableBy(v, d))),
				"calendar day":  first(calendarDayRenders(CalendarDaysWritableBy(v, d))),
				"room":          first(roomRenders(RoomsWritableBy(v, d))),
			} {
				filtered(t, what+" write at "+string(r), q)
			}
		}
	}
}

func first(q string, _ []any) string { return q }

func TestTimetablePinsNarrowOrDeny(t *testing.T) {
	c := timetableViewers()

	nothing, _ := timetableSlotRenders(NoTimetableSlot())
	unpinned, _ := timetableSlotSQL(c.staff, withScope(authorization.ReachTeacherAssignment))

	cases := []struct {
		name        string
		decision    authorization.Decision
		matchesNone bool
		differs     string
		mustHave    []string
		wantValues  []string
		denyValues  []string
	}{
		{
			name:       "a section pin adds a section code term the unpinned query does not carry",
			decision:   timetablePinned(authorization.ReachTeacherAssignment, pin("section", "9A")),
			differs:    unpinned,
			mustHave:   []string{`"sections"."code" IN`},
			wantValues: []string{"9A"},
		},
		{
			name:       "a grade pin reaches the section's grade",
			decision:   timetablePinned(authorization.ReachTeacherAssignment, pin("grade_level", "9")),
			differs:    unpinned,
			mustHave:   []string{`"grade_levels"."code" IN`},
			wantValues: []string{"9"},
		},
		{
			name:        "an untranslatable pin denies",
			decision:    timetablePinned(authorization.ReachTeacherAssignment, pin("campus", "north")),
			matchesNone: true,
		},
		{
			name:        "an untranslatable pin denies at tenant reach too",
			decision:    timetablePinned(authorization.ReachTenant, pin("campus", "north")),
			matchesNone: true,
		},
		{
			name:        "an empty pin denies",
			decision:    timetablePinned(authorization.ReachTeacherAssignment, pin("section")),
			matchesNone: true,
		},
		{
			name:       "one untranslatable group among translatable ones is dropped, not fatal",
			decision:   timetablePinned(authorization.ReachTeacherAssignment, pin("section", "9A"), pin("campus", "north")),
			differs:    unpinned,
			wantValues: []string{"9A"},
			denyValues: []string{"north"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := timetableSlotSQL(c.staff, tc.decision)

			filtered(t, tc.name, got)

			if tc.matchesNone {
				if got != nothing {
					t.Fatalf("expected the deny predicate %q, got %q", nothing, got)
				}
				return
			}
			if tc.differs != "" && got == tc.differs {
				t.Fatalf("the pinned query is byte-identical to %q", tc.differs)
			}
			for _, want := range tc.mustHave {
				if !strings.Contains(got, want) {
					t.Fatalf("expected %q in %q", want, got)
				}
			}
			for _, want := range tc.wantValues {
				if !carriesValue(args, want) {
					t.Fatalf("expected %q among the arguments %v of %q", want, args, got)
				}
			}
			for _, banned := range tc.denyValues {
				if carriesValue(args, banned) {
					t.Fatalf("did not expect %q among the arguments %v of %q", banned, args, got)
				}
			}
		})
	}
}

func TestTimetableReferencePinsDenyRatherThanWiden(t *testing.T) {
	c := timetableViewers()

	denyRoom, _ := roomRenders(NoRoom())
	denyDay, _ := calendarDayRenders(NoCalendarDay())

	d := timetablePinned(authorization.ReachTenant, pin("section", "9A"))

	if got, _ := roomRenders(RoomsFor(c.staff, d)); got != denyRoom {
		t.Fatalf("rooms carry no section dimension, so a section pin must deny rather than hand back every "+
			"room in the school, got %q", got)
	}
	if got, _ := calendarDayRenders(CalendarDaysFor(c.staff, d)); got != denyDay {
		t.Fatalf("calendar days carry no section dimension, so a section pin must deny, got %q", got)
	}

	scheme, args := periodSchemeRenders(PeriodSchemesFor(c.staff, d))
	filtered(t, "period scheme under a section pin", scheme)
	if !strings.Contains(scheme, "period_scheme_grade_levels") {
		t.Fatalf("a period scheme pin must travel through period_scheme_grade_levels, got %q", scheme)
	}
	if !carriesValue(args, "9A") {
		t.Fatalf("the period scheme pin lost the section code: %v", args)
	}
}

func TestTimetableDeviationsFollowTheSlotNotTheSection(t *testing.T) {
	c := timetableViewers()

	got, args := timetableDeviationRenders(TimetableDeviationsFor(c.pupil, withScope(authorization.ReachSelf)))
	filtered(t, "pupil deviations", got)

	if strings.Contains(got, `"timetable_deviations"."section_id" IN`) {
		t.Fatalf("a pupil's deviations must not be taken section-wide; a cancellation recorded against "+
			"another stream's Commerce slot would leak: %q", got)
	}
	if !strings.Contains(got, "timetable_slots") {
		t.Fatalf("a deviation that carries a slot must be judged through that slot, got %q", got)
	}
	if !strings.Contains(got, `"timetable_deviations"."timetable_slot_id" IS NULL`) {
		t.Fatalf("an added deviation carries no slot and must be judged on its own offering, got %q", got)
	}
	if !carries(args, c.offering) {
		t.Fatalf("expected the studied offering %s among %v", c.offering, args)
	}
	if carries(args, c.section) {
		t.Fatalf("did not expect the section %s among %v", c.section, args)
	}
}

func TestTimetableReadHidesDrafts(t *testing.T) {
	c := timetableViewers()

	for name, v := range map[string]*Viewer{"teacher": c.staff, "pupil": c.pupil, "ward": c.ward} {
		reach := authorization.ReachTeacherAssignment
		switch name {
		case "pupil":
			reach = authorization.ReachSelf
		case "ward":
			reach = authorization.ReachGuardianWard
		}

		slot, args := timetableSlotSQL(v, withScope(reach))
		if !strings.Contains(slot, `"timetables"."status" <> $`) {
			t.Fatalf("%s must not read slots hanging off a draft timetable, got %q", name, slot)
		}
		if !carriesValue(args, string(enttimetable.StatusDraft)) {
			t.Fatalf("%s: the status gate does not carry the draft literal: %v", name, args)
		}
	}

	tenant, _ := timetableSlotSQL(c.staff, withScope(authorization.ReachTenant))
	if strings.Contains(strings.ToUpper(tenant), "WHERE") {
		t.Fatalf("tenant reach must stay unfiltered so an author can see their own draft, got %q", tenant)
	}
}

type timetableFixture struct {
	section         uuid.UUID
	studied         uuid.UUID
	concurrent      uuid.UUID
	student         uuid.UUID
	timetable       uuid.UUID
	studiedSlot     uuid.UUID
	concurrentSlot  uuid.UUID
	sectionWideSlot uuid.UUID
}

func timetableWithoutFixture(t *testing.T, missing string) {
	t.Helper()

	message := "the tenant database holds no " + missing + ", so nothing here checked that a pupil is kept " +
		"out of a concurrent stream. Seed the tenant, or set " + testsupport.RequireEnv +
		"=1 to make this a failure."

	switch strings.ToLower(strings.TrimSpace(os.Getenv(testsupport.RequireEnv))) {
	case "1", "true", "yes", "on":
		t.Fatal(message)
	}
	t.Skip(message)
}

func seedTimetable(ctx context.Context, t *testing.T, db *testsupport.TenantDB) timetableFixture {
	t.Helper()

	offerings, err := db.Client.SubjectOffering.Query().
		Where(entoffering.HasAcademicSessionWith(entsession.IsCurrent(true))).
		All(ctx)
	if err != nil {
		t.Fatalf("subject offerings: %v", err)
	}

	bySection := map[uuid.UUID][]uuid.UUID{}
	sessionOf := map[uuid.UUID]uuid.UUID{}
	for _, row := range offerings {
		bySection[row.SectionID] = append(bySection[row.SectionID], row.ID)
		sessionOf[row.SectionID] = row.AcademicSessionID
	}

	var f timetableFixture
	var session uuid.UUID
	for sectionID, ids := range bySection {
		if len(ids) < 2 {
			continue
		}
		enrolment, err := db.Client.StudentEnrollment.Query().
			Where(
				entenrollment.SectionIDIn(sectionID),
				entenrollment.StatusEQ(entenrollment.StatusActive),
			).
			First(ctx)
		if err != nil {
			continue
		}
		f.section = sectionID
		f.studied = ids[0]
		f.concurrent = ids[1]
		f.student = enrolment.StudentID
		session = sessionOf[sectionID]
		break
	}
	if f.section == uuid.Nil {
		timetableWithoutFixture(t, "section in the current session carrying two subject offerings and an active enrolment")
	}

	section, err := db.Client.Section.Get(ctx, f.section)
	if err != nil {
		t.Fatalf("section %s: %v", f.section, err)
	}

	code := uuid.NewString()[:12]
	scheme, err := db.Client.PeriodScheme.Create().
		SetAcademicSessionID(session).
		SetBranchID(section.BranchID).
		SetName("access test scheme " + code).
		SetCode(code).
		Save(ctx)
	if err != nil {
		t.Fatalf("period scheme: %v", err)
	}

	teaching, err := db.Client.Period.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("P1").
		SetCode("P1-" + code).
		SetSequence(1).
		Save(ctx)
	if err != nil {
		t.Fatalf("period: %v", err)
	}
	assembly, err := db.Client.Period.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("P2").
		SetCode("P2-" + code).
		SetSequence(2).
		Save(ctx)
	if err != nil {
		t.Fatalf("period: %v", err)
	}

	table, err := db.Client.Timetable.Create().
		SetAcademicSessionID(session).
		SetPeriodSchemeID(scheme.ID).
		SetName("access test timetable " + code).
		SetEffectiveFrom(time.Now()).
		SetStatus(enttimetable.StatusPublished).
		Save(ctx)
	if err != nil {
		t.Fatalf("timetable: %v", err)
	}
	f.timetable = table.ID

	studied, err := db.Client.TimetableSlot.Create().
		SetTimetableID(table.ID).
		SetSectionID(f.section).
		SetPeriodID(teaching.ID).
		SetDayOfWeek(1).
		SetSubjectOfferingID(f.studied).
		Save(ctx)
	if err != nil {
		t.Fatalf("studied slot: %v", err)
	}
	f.studiedSlot = studied.ID

	concurrent, err := db.Client.TimetableSlot.Create().
		SetTimetableID(table.ID).
		SetSectionID(f.section).
		SetPeriodID(teaching.ID).
		SetDayOfWeek(1).
		SetSubjectOfferingID(f.concurrent).
		Save(ctx)
	if err != nil {
		t.Fatalf("concurrent slot: %v", err)
	}
	f.concurrentSlot = concurrent.ID

	wide, err := db.Client.TimetableSlot.Create().
		SetTimetableID(table.ID).
		SetSectionID(f.section).
		SetPeriodID(assembly.ID).
		SetDayOfWeek(1).
		SetLabel("Assembly").
		Save(ctx)
	if err != nil {
		t.Fatalf("section wide slot: %v", err)
	}
	f.sectionWideSlot = wide.ID

	return f
}

func timetableSlotIDsFor(ctx context.Context, t *testing.T, db *testsupport.TenantDB, f timetableFixture, p predicate.TimetableSlot) map[uuid.UUID]bool {
	t.Helper()

	ids, err := db.Client.TimetableSlot.Query().
		Where(entslot.HasTimetableWith(enttimetable.ID(f.timetable)), p).
		IDs(ctx)
	if err != nil {
		t.Fatalf("timetable slots: %v", err)
	}
	seen := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		seen[id] = true
	}
	return seen
}

func TestTimetableSlotsHideAConcurrentStreamFromAPupil(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	f := seedTimetable(ctx, t, db)

	pupil := &Viewer{
		StudentIDs:          []uuid.UUID{f.student},
		EnrolledOfferingIDs: []uuid.UUID{f.studied},
	}

	seen := timetableSlotIDsFor(ctx, t, db, f,
		TimetableSlotsFor(pupil, withScope(authorization.ReachSelf)))

	if !seen[f.studiedSlot] {
		t.Fatalf("the pupil cannot see the slot for the offering they are enrolled in (%s)", f.studiedSlot)
	}
	if seen[f.concurrentSlot] {
		t.Fatalf("the pupil sees the concurrent slot %s for offering %s, which they are not enrolled in; "+
			"grade XI runs Physics, History and Commerce in the same period and the pupil attends exactly one",
			f.concurrentSlot, f.concurrent)
	}
	if !seen[f.sectionWideSlot] {
		t.Fatalf("the pupil cannot see the section-wide slot %s that carries no offering, so assembly and "+
			"games vanish from their own day", f.sectionWideSlot)
	}
}

func TestTimetableSlotsShowATeacherOnlyTheirOwnOfferings(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	f := seedTimetable(ctx, t, db)

	teacher := &Viewer{SubjectOfferingIDs: []uuid.UUID{f.concurrent}}

	seen := timetableSlotIDsFor(ctx, t, db, f,
		TimetableSlotsFor(teacher, withScope(authorization.ReachTeacherAssignment)))

	if !seen[f.concurrentSlot] {
		t.Fatalf("the teacher cannot see the slot for the offering they teach (%s)", f.concurrentSlot)
	}
	if seen[f.studiedSlot] {
		t.Fatalf("the teacher sees slot %s for offering %s, which they do not teach", f.studiedSlot, f.studied)
	}
	if seen[f.sectionWideSlot] {
		t.Fatalf("a subject teacher with no section assignment sees the section-wide slot %s", f.sectionWideSlot)
	}
}

func TestTimetableSlotsHideADraftTimetable(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	f := seedTimetable(ctx, t, db)

	if _, err := db.Client.Timetable.UpdateOneID(f.timetable).
		SetStatus(enttimetable.StatusDraft).
		Save(ctx); err != nil {
		t.Fatalf("could not put the timetable back into draft: %v", err)
	}

	pupil := &Viewer{
		StudentIDs:          []uuid.UUID{f.student},
		EnrolledOfferingIDs: []uuid.UUID{f.studied},
	}

	seen := timetableSlotIDsFor(ctx, t, db, f,
		TimetableSlotsFor(pupil, withScope(authorization.ReachSelf)))
	if len(seen) != 0 {
		t.Fatalf("a pupil reads %d slot(s) off an unpublished timetable: %v", len(seen), seen)
	}

	master := &Viewer{Unrestricted: true}
	all := timetableSlotIDsFor(ctx, t, db, f, TimetableSlotsFor(master, withScope(authorization.ReachTenant)))
	if !all[f.studiedSlot] {
		t.Fatalf("the draft is invisible to its own author too, so the gate is not a gate but a wall")
	}
}
