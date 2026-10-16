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

func notesSQL(t *testing.T, v *access.Viewer, d authorization.Decision) (string, bool) {
	t.Helper()
	p, ok := visibleNotes(v, d)
	if !ok {
		return "", false
	}
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("student_notes"))
	p(sel)
	q, _ := sel.Query()
	return q, true
}

func TestNotesHonourTheGrantedScope(t *testing.T) {
	id := uuid.New()
	v := &access.Viewer{
		PersonID: &id, StaffID: &id, GuardianID: &id,
		SectionIDs: []uuid.UUID{id},
	}

	got, ok := notesSQL(t, v, authorization.Decision{Allowed: true, Reach: authorization.ReachSelf, HasReach: true})
	if !ok {
		t.Fatal("an author scoped to self still sees their own notes")
	}
	if strings.Contains(got, "student_guardians") {
		t.Fatalf("scope=self must not reach the caller's wards, got %q", got)
	}
	if strings.Contains(got, "student_enrollments") {
		t.Fatalf("scope=self must not reach the caller's sections, got %q", got)
	}

	got, ok = notesSQL(t, v, authorization.Decision{Allowed: true, Reach: authorization.ReachGuardianWard, HasReach: true})
	if !ok {
		t.Fatal("a guardian scoped to their wards sees their notes")
	}
	if strings.Contains(got, "'staff'") {
		t.Fatalf("a guardian must not read staff-only notes, got %q", got)
	}
	if strings.Contains(got, "author_person_id") {
		t.Fatalf("the guardian scope is not the author scope, got %q", got)
	}
}

func TestNotesDenyAnUnresolvableScope(t *testing.T) {
	id := uuid.New()
	v := &access.Viewer{PersonID: &id, StaffID: &id, GuardianID: &id}

	if _, ok := notesSQL(t, v, authorization.Decision{
		Allowed: true, Reach: authorization.Reach("whole_district"), HasReach: true,
	}); ok {
		t.Fatal("an unresolvable scope must deny, not fall back to the union")
	}
}

func TestNotesWithNoRoleSeeNothing(t *testing.T) {
	if _, ok := notesSQL(t, &access.Viewer{}, authorization.Decision{}); ok {
		t.Fatal("a viewer with no roles must match nothing")
	}
	if _, ok := notesSQL(t, nil, authorization.Decision{}); ok {
		t.Fatal("a nil viewer must match nothing")
	}
}

func TestNotesWithoutAScopeKeepTheirBreadth(t *testing.T) {
	id := uuid.New()
	v := &access.Viewer{PersonID: &id, StaffID: &id, GuardianID: &id, SectionIDs: []uuid.UUID{id}}

	got, ok := notesSQL(t, v, authorization.Decision{})
	if !ok {
		t.Fatal("an unscoped grant keeps its roles")
	}
	for _, want := range []string{"author_person_id", "student_guardians", "student_enrollments"} {
		if !strings.Contains(got, want) {
			t.Fatalf("the pre-scope union must still include %s, got %q", want, got)
		}
	}
}
