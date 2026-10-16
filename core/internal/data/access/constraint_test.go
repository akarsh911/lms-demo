package access

import (
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

func pinnedTo(field string, values ...string) authorization.Decision {
	return authorization.Decision{
		Allowed:     true,
		Constraints: [][]authorization.Constraint{{{Field: field, Values: values}}},
	}
}

func studentSQL(v *Viewer, d authorization.Decision) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("students"))
	StudentsFor(v, d)(sel)
	q, _ := sel.Query()
	return q
}

func TestAPinnedSectionNarrowsStudents(t *testing.T) {
	id := uuid.New()
	v := &Viewer{SectionIDs: []uuid.UUID{id}}

	got := studentSQL(v, pinnedTo("section", "9A"))
	if !strings.Contains(got, "sections") {
		t.Fatalf("a section pin must reach the sections table, got %q", got)
	}
	if !strings.Contains(got, "student_enrollments") {
		t.Fatalf("the pin is ANDed onto the scope, not substituted for it, got %q", got)
	}
}

func TestAnUntranslatablePinMatchesNothing(t *testing.T) {
	v := &Viewer{Unrestricted: false, SectionIDs: []uuid.UUID{uuid.New()}}

	for name, d := range map[string]authorization.Decision{
		"unknown field": pinnedTo("staffroom", "west"),
		"no values":     pinnedTo("section"),
	} {
		got := studentSQL(v, d)
		if strings.Contains(got, "sections\".\"code") {
			t.Fatalf("%s: must not translate to a code match, got %q", name, got)
		}
		if !strings.Contains(strings.ToUpper(got), "WHERE") {
			t.Fatalf("%s: must be filtered, got %q", name, got)
		}
	}
}

func TestNoPinChangesNothing(t *testing.T) {
	v := &Viewer{Unrestricted: true}
	if got := studentSQL(v, authorization.Decision{Allowed: true}); strings.Contains(strings.ToUpper(got), "WHERE") {
		t.Fatalf("an unpinned unrestricted viewer stays unfiltered, got %q", got)
	}
}

func TestGradeLevelPinReadsThroughTheSection(t *testing.T) {
	got := studentSQL(&Viewer{SectionIDs: []uuid.UUID{uuid.New()}}, pinnedTo("grade_level", "9"))
	if !strings.Contains(got, "grade_levels") {
		t.Fatalf("a grade_level pin must reach the grade_levels table, got %q", got)
	}
}

func TestSeveralPinsAllApply(t *testing.T) {
	d := authorization.Decision{Allowed: true, Constraints: [][]authorization.Constraint{{
		{Field: "section", Values: []string{"9A"}},
		{Field: "grade_level", Values: []string{"9"}},
	}}}
	got := studentSQL(&Viewer{SectionIDs: []uuid.UUID{uuid.New()}}, d)
	if !strings.Contains(got, "sections") || !strings.Contains(got, "grade_levels") {
		t.Fatalf("both pins must apply, got %q", got)
	}
}

func TestTwoPoliciesGrantBothSections(t *testing.T) {
	d := authorization.Decision{Allowed: true, Constraints: [][]authorization.Constraint{
		{{Field: "section", Values: []string{"9A"}}},
		{{Field: "section", Values: []string{"10B"}}},
	}}

	got := studentSQL(&Viewer{SectionIDs: []uuid.UUID{uuid.New()}}, d)
	if strings.Count(got, "sections") < 2 {
		t.Fatalf("both pins must reach the query, got %q", got)
	}
	if !strings.Contains(got, " OR ") {
		t.Fatalf("separate grants are ORed: ANDing them gives neither, got %q", got)
	}
}

func TestOneUnreadablePinDoesNotCancelTheOthers(t *testing.T) {
	d := authorization.Decision{Allowed: true, Constraints: [][]authorization.Constraint{
		{{Field: "section", Values: []string{"9A"}}},
		{{Field: "staffroom", Values: []string{"west"}}},
	}}

	got := studentSQL(&Viewer{SectionIDs: []uuid.UUID{uuid.New()}}, d)
	if !strings.Contains(got, "sections") {
		t.Fatalf("the readable pin must still apply, got %q", got)
	}
	if strings.Contains(got, "staffroom") {
		t.Fatalf("the unreadable pin must contribute nothing, got %q", got)
	}
}

func TestAPinNarrowsTheTeachingScopeRatherThanReplacingIt(t *testing.T) {
	section := uuid.New()
	v := &Viewer{SectionIDs: []uuid.UUID{section}}

	d := pinnedTo("section", "9A")
	d.Reach, d.HasReach = authorization.ReachTeacherAssignment, true

	got := studentSQL(v, d)
	if !strings.Contains(got, "student_enrollments") {
		t.Fatalf("the teaching scope must still apply, got %q", got)
	}
	if !strings.Contains(got, "sections") {
		t.Fatalf("the pin must apply too, got %q", got)
	}
}

func TestTheTeachingScopeIsUnchangedWithoutAPin(t *testing.T) {
	section := uuid.New()
	v := &Viewer{SectionIDs: []uuid.UUID{section}}

	d := authorization.Decision{
		Allowed: true, Reach: authorization.ReachTeacherAssignment, HasReach: true,
	}
	got := studentSQL(v, d)
	if strings.Contains(got, "sections\".\"code") {
		t.Fatalf("an unpinned grant must not touch section codes, got %q", got)
	}
	if !strings.Contains(got, "student_enrollments") {
		t.Fatalf("the teaching scope must still apply, got %q", got)
	}
}

func TestTeacherAssignmentsTakeThePinToo(t *testing.T) {
	teacher := uuid.New()
	v := &Viewer{TeacherID: &teacher, SectionIDs: []uuid.UUID{uuid.New()}}

	d := pinnedTo("section", "9A")
	d.Reach, d.HasReach = authorization.ReachTeacherAssignment, true

	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("teacher_assignments"))
	TeacherAssignmentsFor(v, d)(sel)
	got, _ := sel.Query()

	if !strings.Contains(got, "teacher_id") {
		t.Fatalf("the caller's own assignments must still apply, got %q", got)
	}
	if !strings.Contains(got, "sections") {
		t.Fatalf("the pin must apply to assignments too, got %q", got)
	}
}
