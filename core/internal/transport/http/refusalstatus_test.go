package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

func refusalStatus(t *testing.T, refuse func(http.ResponseWriter) bool) int {
	t.Helper()
	w := httptest.NewRecorder()
	if refuse(w) {
		t.Fatal("the input under test must be refused, not accepted")
	}
	return w.Code
}

func ptr[T any](v T) *T { return &v }

func TestAFieldTheServerOrThePathOwnsIsAlwaysUnprocessable(t *testing.T) {
	person, other := uuid.New(), uuid.New()

	cases := []struct {
		name   string
		refuse func(http.ResponseWriter) bool
	}{
		{
			name: "an attribution taken from the caller",
			refuse: func(w http.ResponseWriter) bool {
				_, ok := attributedTo(w, &access.Viewer{PersonID: &person}, &other, "verified_by")
				return ok
			},
		},
		{
			name: "an optional attribution taken from the caller",
			refuse: func(w http.ResponseWriter) bool {
				_, ok := attributedToOptional(w, &access.Viewer{PersonID: &person}, &other, "assigned_by")
				return ok
			},
		},
		{
			name: "a field fixed when the row was created",
			refuse: func(w http.ResponseWriter) bool {
				return rejectImmutable(w, []string{"academic_session_id"}, "timetable", "academic_session_id")
			},
		},
		{
			name: "a field the path already names",
			refuse: func(w http.ResponseWriter) bool {
				return rejectFromPath(w, []string{"timetable_id"}, "timetable_id")
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := refusalStatus(t, tc.refuse); got != http.StatusUnprocessableEntity {
				t.Fatalf("want 422, got %d", got)
			}
		})
	}
}

func TestARuleBetweenTwoFieldsIsAlwaysUnprocessable(t *testing.T) {
	cases := []struct {
		name   string
		refuse func(http.ResponseWriter) bool
	}{
		{
			name: "a session that ends before it starts",
			refuse: func(w http.ResponseWriter) bool {
				_, _, ok := sessionDates(w, sessionPayload{
					StartDate: ptr("2026-04-01"),
					EndDate:   ptr("2026-03-01"),
				})
				return ok
			},
		},
		{
			name: "a role assignment that ends before it starts",
			refuse: func(w http.ResponseWriter) bool {
				_, _, ok := roleAssignmentDates(w, roleAssignmentPayload{
					ValidFrom: ptr("2026-04-01"),
					ValidTo:   ptr("2026-03-01"),
				})
				return ok
			},
		},
		{
			name: "a pass mark above the maximum",
			refuse: func(w http.ResponseWriter) bool {
				return marksValid(w, offeringPayload{
					MaximumMarks: ptr(100.0),
					PassMarks:    ptr(101.0),
				})
			},
		},
		{
			name: "an effective window that closes before it opens",
			refuse: func(w http.ResponseWriter) bool {
				_, _, ok := timetableWindow(w, ptr("2026-04-01"), ptr("2026-03-01"))
				return ok
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := refusalStatus(t, tc.refuse); got != http.StatusUnprocessableEntity {
				t.Fatalf("want 422, got %d", got)
			}
		})
	}
}

func TestOneFieldWithTheWrongShapeIsAlwaysABadRequest(t *testing.T) {
	cases := []struct {
		name   string
		refuse func(http.ResponseWriter) bool
	}{
		{
			name: "a capacity that is not positive",
			refuse: func(w http.ResponseWriter) bool {
				return roomTextValid(w, roomPayload{Capacity: ptr(0)})
			},
		},
		{
			name: "a mark below zero",
			refuse: func(w http.ResponseWriter) bool {
				return marksValid(w, offeringPayload{MaximumMarks: ptr(-1.0)})
			},
		},
		{
			name: "a start date that is not a date",
			refuse: func(w http.ResponseWriter) bool {
				_, _, ok := sessionDates(w, sessionPayload{
					StartDate: ptr("01-04-2026"),
					EndDate:   ptr("2026-03-01"),
				})
				return ok
			},
		},
		{
			name: "a string longer than the column",
			refuse: func(w http.ResponseWriter) bool {
				return withinRunes(w, "name", "abcdef", 5)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := refusalStatus(t, tc.refuse); got != http.StatusBadRequest {
				t.Fatalf("want 400, got %d", got)
			}
		})
	}
}

func TestTheClashServiceRefusalsSplitOnTheKindOfWrongNotTheLayer(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"a branch nobody named", timetablesvc.ErrBranchRequired, http.StatusBadRequest},
		{"a half nobody recognises", timetablesvc.ErrHalfUnknown, http.StatusBadRequest},
		{"a rule nobody recognises", timetablesvc.ErrRuleUnknown, http.StatusBadRequest},
		{"a day of week outside one to seven", timetablesvc.ErrDayOfWeekInvalid, http.StatusBadRequest},
		{"a proposed slot with no section", timetablesvc.ErrSectionRequired, http.StatusBadRequest},
		{"a proposed slot with no period", timetablesvc.ErrPeriodRequired, http.StatusBadRequest},
		{"a range the caller inverted", timetablesvc.ErrRangeInverted, http.StatusBadRequest},
		{"a timetable that is not there", timetablesvc.ErrNotFound, http.StatusNotFound},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			writeTimetableServiceErr(w, tc.err, "timetable not found")
			if w.Code != tc.want {
				t.Fatalf("want %d, got %d", tc.want, w.Code)
			}
		})
	}
}
