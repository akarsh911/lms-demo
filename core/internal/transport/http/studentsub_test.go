package http

import (
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
)

func whereFor(v *access.Viewer, d authorization.Decision) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("students"))
	access.StudentsFor(v, d)(sel)
	query, _ := sel.Query()
	return query
}

func scoped(s authorization.Reach) authorization.Decision {
	return authorization.Decision{Allowed: true, Reach: s, HasReach: true}
}

func TestStudentScopeNeverFallsThroughUnfiltered(t *testing.T) {
	if !strings.Contains(strings.ToUpper(whereFor(&access.Viewer{}, authorization.Decision{})), "WHERE") {
		t.Fatal("a viewer with no roles must be filtered")
	}
	if !strings.Contains(strings.ToUpper(whereFor(nil, authorization.Decision{})), "WHERE") {
		t.Fatal("a nil viewer must match nothing, not everything")
	}
}

func TestStudentScopeUnrestrictedAddsNoCondition(t *testing.T) {
	got := whereFor(&access.Viewer{Unrestricted: true}, authorization.Decision{})
	if strings.Contains(strings.ToUpper(got), "WHERE") {
		t.Fatalf("an unrestricted viewer should be unfiltered, got %q", got)
	}
}

func TestStudentScopeNarrowsForEachRole(t *testing.T) {
	id := uuid.New()

	for name, v := range map[string]*access.Viewer{
		"guardian":        {GuardianID: &id},
		"class teacher":   {SectionIDs: []uuid.UUID{id}},
		"subject teacher": {SubjectOfferingIDs: []uuid.UUID{id}},
		"pupil":           {StudentIDs: []uuid.UUID{id}},
	} {
		if !strings.Contains(strings.ToUpper(whereFor(v, authorization.Decision{})), "WHERE") {
			t.Fatalf("%s must be narrowed", name)
		}
	}
}

func TestStudentScopeHonoursTheGrantedScope(t *testing.T) {
	id := uuid.New()
	both := &access.Viewer{StudentIDs: []uuid.UUID{id}, SectionIDs: []uuid.UUID{id}}

	if got := whereFor(both, scoped(authorization.ReachSelf)); strings.Contains(got, "student_enrollments") {
		t.Fatalf("scope=self must not reach the sections the caller teaches, got %q", got)
	}
	if got := whereFor(both, authorization.Decision{}); !strings.Contains(got, "student_enrollments") {
		t.Fatalf("an unscoped grant keeps its existing breadth, got %q", got)
	}
}

func TestStudentScopeDeniesAnUnknownScope(t *testing.T) {
	id := uuid.New()
	v := &access.Viewer{StudentIDs: []uuid.UUID{id}, SectionIDs: []uuid.UUID{id}, GuardianID: &id}

	got := whereFor(v, scoped(authorization.Reach("whole_district")))
	if strings.Contains(got, "student_enrollments") || strings.Contains(got, "student_guardians") {
		t.Fatalf("an unresolvable scope must match nothing, got %q", got)
	}
	if !strings.Contains(strings.ToUpper(got), "WHERE") {
		t.Fatalf("an unresolvable scope must be filtered, got %q", got)
	}
}
