package studentrecord

import (
	"net/url"
	"strings"
	"testing"
)

func values(t *testing.T, raw string) url.Values {
	t.Helper()
	v, err := url.ParseQuery(raw)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	return v
}

func TestMalformedUUIDIsRefusedNotIgnored(t *testing.T) {
	if _, err := ParseAddressFilters(values(t, "student_id=not-a-uuid")); err == nil {
		t.Fatal("a malformed student_id must be refused")
	} else if !strings.Contains(err.Error(), "student_id") {
		t.Fatalf("the error should name the parameter, got %q", err)
	}

	if _, err := ParseNoteFilters(values(t, "academic_session_id=123")); err == nil {
		t.Fatal("a malformed academic_session_id must be refused")
	} else if !strings.Contains(err.Error(), "academic_session_id") {
		t.Fatalf("the error should name the parameter, got %q", err)
	}

	if _, err := ParseTeacherAssignmentFilters(values(t, "teacher_id=abc")); err == nil {
		t.Fatal("a malformed teacher_id must be refused")
	} else if !strings.Contains(err.Error(), "teacher_id") {
		t.Fatalf("the error should name the parameter, got %q", err)
	}

	if _, err := ParseStudentAssignmentFilters(values(t, "section_id=xyz")); err == nil {
		t.Fatal("a malformed section_id must be refused")
	} else if !strings.Contains(err.Error(), "section_id") {
		t.Fatalf("the error should name the parameter, got %q", err)
	}
}

func TestUnknownEnumIsRefused(t *testing.T) {
	if _, err := ParseAddressFilters(values(t, "address_type=banana")); err == nil {
		t.Fatal("an unrecognised address_type must be refused, not dropped")
	}
	if _, err := ParseDocumentFilters(values(t, "verification_status=banana")); err == nil {
		t.Fatal("an unrecognised verification_status must be refused, not dropped")
	}
	if _, err := ParseTeacherAssignmentFilters(values(t, "status=banana")); err == nil {
		t.Fatal("an unrecognised teacher assignment status must be refused, not dropped")
	}
	if _, err := ParseStudentAssignmentFilters(values(t, "status=banana")); err == nil {
		t.Fatal("an unrecognised student assignment status must be refused, not dropped")
	}

	f, err := ParseDocumentFilters(values(t, "verification_status=verified"))
	if err != nil {
		t.Fatalf("verified is valid: %v", err)
	}
	if f.VerificationStatus == nil || string(*f.VerificationStatus) != "verified" {
		t.Fatalf("verification_status = %v, want verified", f.VerificationStatus)
	}
}

func TestLimitIsClamped(t *testing.T) {
	for raw, want := range map[string]int{
		"":             DefaultLimit,
		"limit=0":      DefaultLimit,
		"limit=-5":     DefaultLimit,
		"limit=100000": DefaultLimit,
		"limit=25":     25,
	} {
		f, err := ParseAddressFilters(values(t, raw))
		if err != nil {
			t.Fatalf("%q: %v", raw, err)
		}
		if f.Limit != want {
			t.Fatalf("%q: limit = %d, want %d", raw, f.Limit, want)
		}
	}
}

func TestSchoolWideIsPreserved(t *testing.T) {
	f, err := ParseStudentAssignmentFilters(values(t, "school_wide=true"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !f.SchoolWide {
		t.Fatal("school_wide=true must set SchoolWide")
	}

	f, err = ParseStudentAssignmentFilters(values(t, ""))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if f.SchoolWide {
		t.Fatal("school_wide must default to false")
	}
}

func TestCurrentSessionDefaultIsPreserved(t *testing.T) {
	sf, err := ParseStudentAssignmentFilters(values(t, ""))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if sf.Session != nil || sf.AllSessions {
		t.Fatalf("default student assignment filters must leave session unset, got %+v", sf)
	}

	tf, err := ParseTeacherAssignmentFilters(values(t, "all_sessions=true"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !tf.AllSessions {
		t.Fatal("all_sessions=true must be preserved so Apply skips the current-session filter")
	}

	id := "b3b6e6a0-7f2a-4c1a-9c3e-1a2b3c4d5e6f"
	sf2, err := ParseStudentAssignmentFilters(values(t, "academic_session_id="+id))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if sf2.Session == nil || sf2.Session.String() != id {
		t.Fatalf("explicit academic_session_id must be preserved, got %+v", sf2.Session)
	}
}
