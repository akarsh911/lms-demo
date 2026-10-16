package academic

import (
	"net/url"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
)

func render[P ~func(*sql.Selector)](table string, p P) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table(table))
	p(sel)
	q, _ := sel.Query()
	return q
}

func parseValues(t *testing.T, raw string) url.Values {
	t.Helper()
	values, err := url.ParseQuery(raw)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	return values
}

func TestSectionMalformedUUIDIsRefusedAndNamed(t *testing.T) {
	for _, raw := range []string{
		"academic_session_id=not-a-uuid",
		"branch_id=123",
		"grade_level_id=abc",
		"class_teacher_id=xyz",
	} {
		f, err := ParseSectionFilters(parseValues(t, raw))
		if err == nil {
			t.Fatalf("%q must be refused, got %+v", raw, f)
		}
		param := strings.SplitN(raw, "=", 2)[0]
		if !strings.Contains(err.Error(), param) {
			t.Fatalf("%q: error should name the parameter, got %q", raw, err)
		}
	}
}

func TestSectionAbsentFiltersAreNil(t *testing.T) {
	f, err := ParseSectionFilters(parseValues(t, ""))
	if err != nil {
		t.Fatalf("an empty query is valid: %v", err)
	}
	if f.Session != nil || f.Branch != nil || f.GradeLevel != nil || f.ClassTeacher != nil {
		t.Fatalf("absent filters must be nil, got %+v", f)
	}
	if f.Active || f.AllSessions {
		t.Fatalf("absent bool filters must be false, got %+v", f)
	}
}

func TestSectionLimitIsClamped(t *testing.T) {
	for raw, want := range map[string]int{
		"":             DefaultLimit,
		"limit=0":      DefaultLimit,
		"limit=-5":     DefaultLimit,
		"limit=100000": DefaultLimit,
		"limit=25":     25,
	} {
		f, err := ParseSectionFilters(parseValues(t, raw))
		if err != nil {
			t.Fatalf("%q: %v", raw, err)
		}
		if f.Limit != want {
			t.Fatalf("%q: limit = %d, want %d", raw, f.Limit, want)
		}
	}
}

func TestSectionCurrentSessionDefaultIsPreserved(t *testing.T) {
	f, err := ParseSectionFilters(parseValues(t, ""))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got := render("sections", f.sessionPredicate())
	if !strings.Contains(got, "is_current") {
		t.Fatalf("default should narrow to the current session, got %q", got)
	}

	f, err = ParseSectionFilters(parseValues(t, "all_sessions=true"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if p := f.sessionPredicate(); p != nil {
		t.Fatalf("all_sessions=true must drop the session filter entirely, got %q", render("sections", p))
	}

	id := "11111111-1111-1111-1111-111111111111"
	f, err = ParseSectionFilters(parseValues(t, "academic_session_id="+id))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got = render("sections", f.sessionPredicate())
	if strings.Contains(got, "is_current") {
		t.Fatalf("an explicit session must not also filter on is_current, got %q", got)
	}
	if !strings.Contains(got, "academic_session_id") {
		t.Fatalf("an explicit session must filter on academic_session_id, got %q", got)
	}
}

func TestOfferingMalformedUUIDIsRefusedAndNamed(t *testing.T) {
	for _, raw := range []string{
		"academic_session_id=not-a-uuid",
		"section_id=123",
		"subject_id=abc",
	} {
		f, err := ParseOfferingFilters(parseValues(t, raw))
		if err == nil {
			t.Fatalf("%q must be refused, got %+v", raw, f)
		}
		param := strings.SplitN(raw, "=", 2)[0]
		if !strings.Contains(err.Error(), param) {
			t.Fatalf("%q: error should name the parameter, got %q", raw, err)
		}
	}
}

func TestOfferingAbsentFiltersAreNil(t *testing.T) {
	f, err := ParseOfferingFilters(parseValues(t, ""))
	if err != nil {
		t.Fatalf("an empty query is valid: %v", err)
	}
	if f.Session != nil || f.Section != nil || f.Subject != nil {
		t.Fatalf("absent filters must be nil, got %+v", f)
	}
	if f.Active || f.AllSessions {
		t.Fatalf("absent bool filters must be false, got %+v", f)
	}
}

func TestOfferingLimitIsClamped(t *testing.T) {
	for raw, want := range map[string]int{
		"":             DefaultLimit,
		"limit=0":      DefaultLimit,
		"limit=-5":     DefaultLimit,
		"limit=100000": DefaultLimit,
		"limit=25":     25,
	} {
		f, err := ParseOfferingFilters(parseValues(t, raw))
		if err != nil {
			t.Fatalf("%q: %v", raw, err)
		}
		if f.Limit != want {
			t.Fatalf("%q: limit = %d, want %d", raw, f.Limit, want)
		}
	}
}

func TestOfferingCurrentSessionDefaultIsPreserved(t *testing.T) {
	f, err := ParseOfferingFilters(parseValues(t, ""))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got := render("subject_offerings", f.sessionPredicate())
	if !strings.Contains(got, "is_current") {
		t.Fatalf("default should narrow to the current session, got %q", got)
	}

	f, err = ParseOfferingFilters(parseValues(t, "all_sessions=true"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if p := f.sessionPredicate(); p != nil {
		t.Fatalf("all_sessions=true must drop the session filter entirely, got %q", render("subject_offerings", p))
	}
}

func TestUnknownEnumIsRefused(t *testing.T) {
	if _, err := ParseSessionFilters(parseValues(t, "status=banana")); err == nil {
		t.Fatal("an unrecognised session status must be an error, not a dropped filter")
	}
	f, err := ParseSessionFilters(parseValues(t, "status=active"))
	if err != nil {
		t.Fatalf("active is valid: %v", err)
	}
	if f.Status == nil || string(*f.Status) != "active" {
		t.Fatalf("status = %v, want active", f.Status)
	}

	if _, err := ParseSubjectFilters(parseValues(t, "subject_type=")); err != nil {
		t.Fatalf("an absent subject_type is not an error: %v", err)
	}
	long := strings.Repeat("x", 65)
	if _, err := ParseSubjectFilters(parseValues(t, "subject_type="+long)); err == nil {
		t.Fatal("a subject_type over the schema's length limit must be refused")
	}
}
