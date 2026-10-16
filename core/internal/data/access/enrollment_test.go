package access

import (
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

func enrollmentSQL(v *Viewer, d authorization.Decision) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("student_enrollments"))
	EnrollmentsFor(v, d)(sel)
	q, _ := sel.Query()
	return q
}

func subjectSQL(v *Viewer, d authorization.Decision) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("student_subject_enrollments"))
	SubjectEnrollmentsFor(v, d)(sel)
	q, _ := sel.Query()
	return q
}

func withScope(s authorization.Reach) authorization.Decision {
	return authorization.Decision{Allowed: true, Reach: s, HasReach: true}
}

func TestEnrollmentsHonourTheGrantedScope(t *testing.T) {
	id := uuid.New()
	v := &Viewer{StudentIDs: []uuid.UUID{id}, SectionIDs: []uuid.UUID{id}}

	if got := enrollmentSQL(v, withScope(authorization.ReachSelf)); strings.Contains(got, "section_id") {
		t.Fatalf("scope=self must not reach taught sections, got %q", got)
	}
	if got := subjectSQL(v, withScope(authorization.ReachSelf)); strings.Contains(got, "student_enrollments") {
		t.Fatalf("scope=self must not reach taught sections, got %q", got)
	}
}

func TestEnrollmentsDenyAnUnresolvableScope(t *testing.T) {
	id := uuid.New()
	v := &Viewer{StudentIDs: []uuid.UUID{id}, SectionIDs: []uuid.UUID{id}, GuardianID: &id}

	for name, got := range map[string]string{
		"enrolments":         enrollmentSQL(v, withScope("whole_district")),
		"subject enrolments": subjectSQL(v, withScope("whole_district")),
	} {
		if strings.Contains(got, "section_id") || strings.Contains(got, "student_guardians") {
			t.Fatalf("%s: an unresolvable scope must match nothing, got %q", name, got)
		}
		if !strings.Contains(strings.ToUpper(got), "WHERE") {
			t.Fatalf("%s: an unresolvable scope must be filtered, got %q", name, got)
		}
	}
}

func TestTeacherSectionGrantExcludesInactiveRows(t *testing.T) {
	v := &Viewer{SectionIDs: []uuid.UUID{uuid.New()}}

	got := enrollmentSQL(v, withScope(authorization.ReachTeacherAssignment))
	if !strings.Contains(got, "status") {
		t.Fatalf("the section grant must exclude inactive enrolments, got %q", got)
	}
}

func TestEnrollmentsNeverFallThroughUnfiltered(t *testing.T) {
	for name, got := range map[string]string{
		"no roles": enrollmentSQL(&Viewer{}, authorization.Decision{}),
		"nil":      enrollmentSQL(nil, authorization.Decision{}),
		"subject":  subjectSQL(&Viewer{}, authorization.Decision{}),
		"subj nil": subjectSQL(nil, authorization.Decision{}),
	} {
		if !strings.Contains(strings.ToUpper(got), "WHERE") {
			t.Fatalf("%s must match nothing, got %q", name, got)
		}
	}
}

func teacherAssignmentSQL(v *Viewer, d authorization.Decision) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("teacher_assignments"))
	TeacherAssignmentsFor(v, d)(sel)
	q, _ := sel.Query()
	return q
}

func TestTeacherAssignmentsHonourTheGrantedScope(t *testing.T) {
	teacher, section := uuid.New(), uuid.New()
	v := &Viewer{TeacherID: &teacher, SectionIDs: []uuid.UUID{section}}

	got := teacherAssignmentSQL(v, withScope(authorization.ReachSelf))
	if strings.Contains(got, "section_id") {
		t.Fatalf("scope=self must not reach a colleague's row on the same section, got %q", got)
	}
	if !strings.Contains(got, "teacher_id") {
		t.Fatalf("scope=self must still reach the caller's own rows, got %q", got)
	}

	if got := teacherAssignmentSQL(v, withScope(authorization.ReachTeacherAssignment)); !strings.Contains(got, "section_id") {
		t.Fatalf("scope=teacher_assignment covers held sections, got %q", got)
	}
}

func TestTeacherAssignmentsDenyScopesThatMeanNothingHere(t *testing.T) {
	teacher, section := uuid.New(), uuid.New()
	v := &Viewer{TeacherID: &teacher, SectionIDs: []uuid.UUID{section}}

	for _, s := range []authorization.Reach{"whole_district", authorization.ReachGuardianWard} {
		got := teacherAssignmentSQL(v, withScope(s))
		if strings.Contains(got, "teacher_id") || strings.Contains(got, "section_id") {
			t.Fatalf("scope %q must match nothing here, got %q", s, got)
		}
	}
}
