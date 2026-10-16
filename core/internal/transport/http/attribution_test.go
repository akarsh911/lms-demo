package http

import (
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
)

func TestAttributionRefusesASuppliedValue(t *testing.T) {
	person := uuid.New()
	other := uuid.New()

	w := httptest.NewRecorder()
	if _, ok := attributedTo(w, &access.Viewer{PersonID: &person}, &other, "verified_by"); ok {
		t.Fatal("a supplied attribution must be refused, not overridden silently")
	}
	if w.Code != 422 {
		t.Fatalf("want 422, got %d", w.Code)
	}
}

func TestAttributionRefusesACallerWithNoPersonRow(t *testing.T) {
	w := httptest.NewRecorder()
	if _, ok := attributedTo(w, &access.Viewer{}, nil, "author_person_id"); ok {
		t.Fatal("an attribution that cannot be established must fail, not fall back")
	}
	if w.Code != 400 {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestAttributionUsesTheCaller(t *testing.T) {
	person := uuid.New()

	got, ok := attributedTo(httptest.NewRecorder(), &access.Viewer{PersonID: &person}, nil, "assigned_by")
	if !ok || got != person {
		t.Fatalf("want the caller's person id, got %v ok=%v", got, ok)
	}
}
