package access

import (
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
)

func renders(p predicate.Student) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("students"))
	p(sel)
	q, _ := sel.Query()
	return q
}

func scoped(v *Viewer, scope authorization.Reach) string {
	return renders(StudentsFor(v, authorization.Decision{
		Allowed: true, Reach: scope, HasReach: true,
	}))
}

func filtered(t *testing.T, name, sql string) {
	t.Helper()
	if !strings.Contains(strings.ToUpper(sql), "WHERE") {
		t.Fatalf("%s must be narrowed, got %q", name, sql)
	}
}

func TestEachScopeNarrowsDifferently(t *testing.T) {
	id := uuid.New()
	full := &Viewer{
		GuardianID:         &id,
		StudentIDs:         []uuid.UUID{id},
		SectionIDs:         []uuid.UUID{id},
		SubjectOfferingIDs: []uuid.UUID{id},
	}

	self := scoped(full, authorization.ReachSelf)
	ward := scoped(full, authorization.ReachGuardianWard)
	teach := scoped(full, authorization.ReachTeacherAssignment)

	if self == ward || ward == teach || self == teach {
		t.Fatalf("scopes must differ:\nself=%s\nward=%s\nteach=%s", self, ward, teach)
	}
	filtered(t, "self", self)
	filtered(t, "guardian_ward", ward)
	filtered(t, "teacher_assignment", teach)

	if !strings.Contains(ward, "student_guardians") {
		t.Fatalf("guardian_ward must go through student_guardians, got %s", ward)
	}
	if !strings.Contains(teach, "student_enrollments") &&
		!strings.Contains(teach, "student_subject_enrollments") {
		t.Fatalf("teacher_assignment must go through enrolments, got %s", teach)
	}
}

func TestScopeWithoutTheMatchingRoleMatchesNothing(t *testing.T) {
	id := uuid.New()
	teacherOnly := &Viewer{SectionIDs: []uuid.UUID{id}}

	got := scoped(teacherOnly, authorization.ReachGuardianWard)
	if strings.Contains(got, "student_enrollments") {
		t.Fatalf("must not fall back to the teaching scope, got %s", got)
	}
	filtered(t, "guardian_ward without a guardian record", got)
}

func TestSubjectTeacherIsNotDroppedFromTheFallback(t *testing.T) {
	id := uuid.New()
	subjectTeacher := &Viewer{SubjectOfferingIDs: []uuid.UUID{id}}

	got := renders(StudentsAnyRole(subjectTeacher))
	if !strings.Contains(got, "student_subject_enrollments") {
		t.Fatalf("the fallback must include the subject-teacher branch, got %s", got)
	}
}

func TestFallbackUnionsEveryRole(t *testing.T) {
	id := uuid.New()
	v := &Viewer{GuardianID: &id, StudentIDs: []uuid.UUID{id}}

	got := renders(StudentsAnyRole(v))
	if !strings.Contains(got, "student_guardians") {
		t.Fatalf("fallback must include the guardian route, got %s", got)
	}
	if !strings.Contains(strings.ToUpper(got), " OR ") {
		t.Fatalf("fallback must union the roles, got %s", got)
	}
}

func TestNothingFallsThroughUnfiltered(t *testing.T) {
	none := authorization.Decision{}

	filtered(t, "no role", renders(StudentsFor(&Viewer{}, none)))
	filtered(t, "nil viewer", renders(StudentsFor(nil, none)))

	unknown := authorization.Decision{Allowed: true, Reach: "whole_district", HasReach: true}
	filtered(t, "unknown scope", renders(StudentsFor(&Viewer{}, unknown)))
}

func TestOnlyAWideGrantIsUnfiltered(t *testing.T) {
	if got := renders(StudentsFor(&Viewer{Unrestricted: true}, authorization.Decision{})); strings.Contains(strings.ToUpper(got), "WHERE") {
		t.Fatalf("an unrestricted viewer should be unfiltered, got %q", got)
	}

	tenant := authorization.Decision{Allowed: true, Reach: authorization.ReachTenant, HasReach: true}
	if got := renders(StudentsFor(&Viewer{}, tenant)); strings.Contains(strings.ToUpper(got), "WHERE") {
		t.Fatalf("tenant scope adds nothing, got %q", got)
	}
}

func TestDeclaredButUnresolvableScopeDenies(t *testing.T) {
	id := uuid.New()
	v := &Viewer{GuardianID: &id, StudentIDs: []uuid.UUID{id}}

	unknown := authorization.Decision{
		Allowed: true, Reach: "whole_district", HasReach: true,
	}
	got := renders(StudentsFor(v, unknown))
	if strings.Contains(got, "student_guardians") {
		t.Fatalf("an unresolvable scope must not fall back to a role the caller holds, got %s", got)
	}
	filtered(t, "unresolvable scope", got)
}
