package http

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestStudentRoleAllowed(t *testing.T) {
	for _, role := range []string{
		"class_teacher", "subject_teacher", "SECTION_HEAD", "  Class_Teacher  ",
	} {
		w := httptest.NewRecorder()
		if studentRoleAllowed(w, role) {
			t.Fatalf("role %q must be rejected on a student assignment", role)
		}
		if w.Code != 400 {
			t.Fatalf("role %q returned %d, want 400", role, w.Code)
		}

		var body map[string]any
		if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
			t.Fatalf("role %q: response is not JSON: %v", role, err)
		}
		msg, _ := body["message"].(string)
		if msg == "" {
			t.Fatalf("role %q: rejection carried no message", role)
		}
	}

	for _, role := range []string{
		"class_monitor", "house_captain", "prefect", "sports_captain", "lab_assistant",
	} {
		w := httptest.NewRecorder()
		if !studentRoleAllowed(w, role) {
			t.Fatalf("role %q must be allowed on a student assignment", role)
		}
		if w.Code != 200 {
			t.Fatalf("role %q wrote a response when it should have written none", role)
		}
	}
}
