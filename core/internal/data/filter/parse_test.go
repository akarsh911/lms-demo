package filter

import (
	"net/url"
	"testing"
)

func TestUnknownParameterIsRefused(t *testing.T) {
	p := New(url.Values{"studentid": {"x"}})
	p.UUID("student_id")

	err := p.Err()
	if err == nil {
		t.Fatal("a misspelt filter must be refused, not silently dropped")
	}
	if e, ok := err.(*Error); !ok || e.Param != "studentid" {
		t.Fatalf("the error must name the parameter, got %v", err)
	}
}

func TestConsumedParametersAreAccepted(t *testing.T) {
	p := New(url.Values{
		"student_id": {"3f1d2c4e-0000-4000-8000-000000000000"},
		"limit":      {"10"},
		"offset":     {"5"},
		"active":     {"true"},
	})
	p.UUID("student_id")
	p.Bool("active")
	p.Page(50, 200)

	if err := p.Err(); err != nil {
		t.Fatalf("every parameter was read, got %v", err)
	}
}

func TestAllowedParameterIsNotUnknown(t *testing.T) {
	p := New(url.Values{"include": {"person"}})
	if err := p.Allow("include").Err(); err != nil {
		t.Fatalf("an allowed parameter must pass, got %v", err)
	}
}

func TestMalformedValueIsReportedBeforeUnknownKeys(t *testing.T) {
	p := New(url.Values{"student_id": {"not-a-uuid"}, "bogus": {"1"}})
	p.UUID("student_id")

	e, ok := p.Err().(*Error)
	if !ok || e.Param != "student_id" {
		t.Fatalf("want the malformed parameter, got %v", p.Err())
	}
}
