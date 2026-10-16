package enrollment

import (
	"net/url"
	"strings"
	"testing"
)

func parseEnrollment(t *testing.T, raw string) (Filters, error) {
	t.Helper()
	values, err := url.ParseQuery(raw)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	return ParseFilters(values)
}

func parseSubject(t *testing.T, raw string) (SubjectFilters, error) {
	t.Helper()
	values, err := url.ParseQuery(raw)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	return ParseSubjectFilters(values)
}

func TestMalformedFilterIsRefusedNotIgnored(t *testing.T) {
	for _, raw := range []string{
		"student_id=not-a-uuid",
		"academic_session_id=123",
		"section_id=abc",
	} {
		f, err := parseEnrollment(t, raw)
		if err == nil {
			t.Fatalf("%q must be refused, got %+v", raw, f)
		}
		if !strings.Contains(err.Error(), strings.SplitN(raw, "=", 2)[0]) {
			t.Fatalf("the error should name the parameter, got %q", err)
		}
	}

	if f, err := parseSubject(t, "subject_offering_id=not-a-uuid"); err == nil {
		t.Fatalf("subject_offering_id must be refused, got %+v", f)
	} else if !strings.Contains(err.Error(), "subject_offering_id") {
		t.Fatalf("the error should name the parameter, got %q", err)
	}
}

func TestUnknownStatusIsRefused(t *testing.T) {
	if _, err := parseEnrollment(t, "status=banana"); err == nil {
		t.Fatal("an unrecognised status must be an error, not a dropped filter")
	}
	f, err := parseEnrollment(t, "status=completed")
	if err != nil {
		t.Fatalf("completed is valid: %v", err)
	}
	if f.Status == nil || string(*f.Status) != "completed" {
		t.Fatalf("status = %v, want completed", f.Status)
	}

	if _, err := parseSubject(t, "status=banana"); err == nil {
		t.Fatal("an unrecognised subject status must be an error, not a dropped filter")
	}
	sf, err := parseSubject(t, "status=dropped")
	if err != nil {
		t.Fatalf("dropped is valid: %v", err)
	}
	if sf.Status == nil || string(*sf.Status) != "dropped" {
		t.Fatalf("status = %v, want dropped", sf.Status)
	}
}

func TestAbsentFiltersAreNil(t *testing.T) {
	f, err := parseEnrollment(t, "")
	if err != nil {
		t.Fatalf("an empty query is valid: %v", err)
	}
	if f.Student != nil || f.AcademicSession != nil || f.Section != nil || f.Status != nil {
		t.Fatalf("absent filters must be nil, got %+v", f)
	}
	if f.AllSessions {
		t.Fatal("all_sessions must default to false")
	}

	sf, err := parseSubject(t, "")
	if err != nil {
		t.Fatalf("an empty query is valid: %v", err)
	}
	if sf.Student != nil || sf.SubjectOffering != nil || sf.AcademicSession != nil || sf.Status != nil {
		t.Fatalf("absent filters must be nil, got %+v", sf)
	}
}

func TestPagingIsClamped(t *testing.T) {
	for raw, want := range map[string]int{
		"":             DefaultLimit,
		"limit=0":      DefaultLimit,
		"limit=-5":     DefaultLimit,
		"limit=100000": DefaultLimit,
		"limit=25":     25,
	} {
		f, err := parseEnrollment(t, raw)
		if err != nil {
			t.Fatalf("%q: %v", raw, err)
		}
		if f.Limit != want {
			t.Fatalf("%q: limit = %d, want %d", raw, f.Limit, want)
		}
	}

	f, _ := parseEnrollment(t, "offset=-10")
	if f.Offset != 0 {
		t.Fatalf("a negative offset must clamp to 0, got %d", f.Offset)
	}
}

func TestCurrentSessionDefaultIsPreserved(t *testing.T) {
	f, err := parseEnrollment(t, "")
	if err != nil {
		t.Fatalf("an empty query is valid: %v", err)
	}
	if f.AcademicSession != nil || f.AllSessions {
		t.Fatalf("default must be no explicit session and all_sessions=false, got %+v", f)
	}

	f, err = parseEnrollment(t, "all_sessions=true")
	if err != nil {
		t.Fatalf("all_sessions=true: %v", err)
	}
	if !f.AllSessions {
		t.Fatal("all_sessions=true must opt out of the current-session default")
	}

	sf, err := parseSubject(t, "")
	if err != nil {
		t.Fatalf("an empty query is valid: %v", err)
	}
	if sf.AcademicSession != nil || sf.AllSessions {
		t.Fatalf("default must be no explicit session and all_sessions=false, got %+v", sf)
	}
}

func TestFiltersAreParsedTogether(t *testing.T) {
	f, err := parseEnrollment(t, "status=active&limit=10&offset=20")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if f.Status == nil || f.Limit != 10 || f.Offset != 20 {
		t.Fatalf("unexpected filters: %+v", f)
	}
}
