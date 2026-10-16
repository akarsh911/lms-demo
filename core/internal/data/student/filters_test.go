package student

import (
	"net/url"
	"strings"
	"testing"
)

func parse(t *testing.T, raw string) (Filters, error) {
	t.Helper()
	values, err := url.ParseQuery(raw)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	return ParseFilters(values)
}

func TestMalformedFilterIsRefusedNotIgnored(t *testing.T) {
	for _, raw := range []string{
		"guardian_id=not-a-uuid",
		"house_id=123",
		"section_id=",
		"academic_session_id=abc",
	} {
		if raw == "section_id=" {
			if _, err := parse(t, raw); err != nil {
				t.Fatalf("%q: empty should mean absent, got %v", raw, err)
			}
			continue
		}
		f, err := parse(t, raw)
		if err == nil {
			t.Fatalf("%q must be refused, got %+v", raw, f)
		}
		if !strings.Contains(err.Error(), strings.SplitN(raw, "=", 2)[0]) {
			t.Fatalf("the error should name the parameter, got %q", err)
		}
	}
}

func TestUnknownStatusIsRefused(t *testing.T) {
	if _, err := parse(t, "status=banana"); err == nil {
		t.Fatal("an unrecognised status must be an error, not a dropped filter")
	}
	f, err := parse(t, "status=alumni")
	if err != nil {
		t.Fatalf("alumni is valid: %v", err)
	}
	if f.Status == nil || string(*f.Status) != "alumni" {
		t.Fatalf("status = %v, want alumni", f.Status)
	}
}

func TestAbsentFiltersAreNil(t *testing.T) {
	f, err := parse(t, "")
	if err != nil {
		t.Fatalf("an empty query is valid: %v", err)
	}
	if f.Status != nil || f.Guardian != nil || f.House != nil ||
		f.Section != nil || f.Session != nil || f.Offering != nil {
		t.Fatalf("absent filters must be nil, got %+v", f)
	}
	if f.Search != "" {
		t.Fatal("absent search must be empty")
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
		f, err := parse(t, raw)
		if err != nil {
			t.Fatalf("%q: %v", raw, err)
		}
		if f.Limit != want {
			t.Fatalf("%q: limit = %d, want %d", raw, f.Limit, want)
		}
	}

	f, _ := parse(t, "offset=-10")
	if f.Offset != 0 {
		t.Fatalf("a negative offset must clamp to 0, got %d", f.Offset)
	}
}

func TestFiltersAreParsedTogether(t *testing.T) {
	f, err := parse(t, "q=sharma&status=active&limit=10&offset=20")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if f.Search != "sharma" || f.Status == nil || f.Limit != 10 || f.Offset != 20 {
		t.Fatalf("unexpected filters: %+v", f)
	}
}
