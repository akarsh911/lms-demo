package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	mw "github.com/Harbour-Emerge/emerge-core/internal/transport/http/middleware"
)

type tenantReachGuard struct{}

func (tenantReachGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.TimetableRead, authorization.TimetableWrite, authorization.TimetableDelete,
		authorization.CalendarRead, authorization.CalendarWrite, authorization.CalendarDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Rule:     "publish test guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (tenantReachGuard) Name() string { return "publish test guard" }

func TestPublishAndCoverRoutesAreMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	want := []string{
		"POST /api/v1/timetables/{id}/publish",
		"GET /api/v1/timetables/{id}/sections",
		"POST /api/v1/timetables/{id}/sections",
		"DELETE /api/v1/timetable-sections/{id}",
		"GET /api/v1/calendar-days/{id}/section-patterns",
		"POST /api/v1/calendar-days/{id}/section-patterns",
		"PATCH /api/v1/calendar-day-section-patterns/{id}",
		"DELETE /api/v1/calendar-day-section-patterns/{id}",
	}
	for _, pattern := range want {
		if !found[pattern] {
			t.Errorf("%s is not mounted on the real router, so the handler is unreachable however well it is tested",
				pattern)
		}
	}
}

func TestPublishAndCoverRoutesGuardTheEntityTheContractNames(t *testing.T) {
	guard := &recordingGuard{}
	server := quietServer(guard)

	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) {
		r.Use(mw.DevSubject(slog.Default()))
		server.mountTimetable(r)
	})

	id := probeID
	cases := []routeCase{
		{"POST", "/api/v1/timetables/" + id + "/publish", "/api/v1/timetables/{id}/publish",
			authorization.TimetableWrite, false},
		{"GET", "/api/v1/timetables/" + id + "/sections", "/api/v1/timetables/{id}/sections",
			authorization.TimetableRead, false},
		{"POST", "/api/v1/timetables/" + id + "/sections", "/api/v1/timetables/{id}/sections",
			authorization.TimetableWrite, false},
		{"DELETE", "/api/v1/timetable-sections/" + id, "/api/v1/timetable-sections/{id}",
			authorization.TimetableDelete, false},
		{"GET", "/api/v1/calendar-days/" + id + "/section-patterns",
			"/api/v1/calendar-days/{id}/section-patterns", authorization.CalendarRead, false},
		{"POST", "/api/v1/calendar-days/" + id + "/section-patterns",
			"/api/v1/calendar-days/{id}/section-patterns", authorization.CalendarWrite, false},
		{"PATCH", "/api/v1/calendar-day-section-patterns/" + id,
			"/api/v1/calendar-day-section-patterns/{id}", authorization.CalendarWrite, false},
		{"DELETE", "/api/v1/calendar-day-section-patterns/" + id,
			"/api/v1/calendar-day-section-patterns/{id}", authorization.CalendarDelete, false},
	}

	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			guard.forget()

			rec := send(router, tc.method, tc.path, "")
			if why := routerRefused(rec); why != "" {
				t.Fatalf("%s %s: %s (status %d, body %s)",
					tc.method, tc.path, why, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			checkProbe(t, tc, guard.taken(), rec)
		})
	}
}

func TestPublishingAnUnreachableTimetableIsNotFoundRatherThanForbidden(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.publishTimetable, "POST",
		"/api/v1/timetables/"+w.otherTimetableID.String()+"/publish", "{}", w.otherTimetableID)

	if rec.Code == http.StatusForbidden {
		t.Fatalf("403 confirms the row exists; the reply must not distinguish it from a missing row: %s",
			strings.TrimSpace(rec.Body.String()))
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 publishing another section's timetable, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestPublishingNeedsAGrantThatReachesTheWholeSchool(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.publishTimetable, "POST",
		"/api/v1/timetables/"+w.timetableID.String()+"/publish", "{}", w.timetableID)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("a teacher-assignment grant reaches one section and must not publish a whole timetable; "+
			"want 403, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func (w *timetableWorld) asTenant() *Server {
	return &Server{guard: tenantReachGuard{}}
}

func (w *timetableWorld) draftCovering(name string, from time.Time, sections ...uuid.UUID) uuid.UUID {
	w.t.Helper()

	id := w.db.Client.Timetable.Create().
		SetAcademicSessionID(w.sessionID).
		SetPeriodSchemeID(w.schemeID).
		SetName(name).
		SetEffectiveFrom(from).
		SetStatus(enttimetable.StatusDraft).
		SaveX(context.Background()).ID
	for _, section := range sections {
		w.db.Client.TimetableSection.Create().
			SetTimetableID(id).
			SetSectionID(section).
			SaveX(context.Background())
	}
	return id
}

func TestPublishingRefusesAnOverlapAndNamesTheConflict(t *testing.T) {
	w := newTimetableWorld(t)
	server := w.asTenant()

	w.db.Client.TimetableSection.Create().
		SetTimetableID(w.timetableID).
		SetSectionID(w.taughtSectionID).
		SaveX(context.Background())

	rival := w.draftCovering("Rival", timetableDate(2026, time.May, 1), w.taughtSectionID)

	rec := w.call(server.publishTimetable, "POST",
		"/api/v1/timetables/"+rival.String()+"/publish", "{}", rival)

	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409 publishing over a section already published, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Code      string `json:"code"`
		Conflicts []struct {
			TimetableID uuid.UUID   `json:"timetable_id"`
			SectionIDs  []uuid.UUID `json:"section_ids"`
		} `json:"conflicts"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the refusal body is not the expected JSON: %v (body %s)",
			err, strings.TrimSpace(rec.Body.String()))
	}
	if body.Code != timetablePublishConflict {
		t.Fatalf("the refusal must carry a code a caller can branch on, got %q", body.Code)
	}
	if len(body.Conflicts) != 1 {
		t.Fatalf("the refusal must name the conflicting timetable, got %v", body.Conflicts)
	}
	if body.Conflicts[0].TimetableID != w.timetableID {
		t.Fatalf("the refusal names %s, want the published timetable %s",
			body.Conflicts[0].TimetableID, w.timetableID)
	}
	if len(body.Conflicts[0].SectionIDs) != 1 ||
		body.Conflicts[0].SectionIDs[0] != w.taughtSectionID {
		t.Fatalf("the refusal must name the shared sections, got %v", body.Conflicts[0].SectionIDs)
	}
}

func (w *timetableWorld) spareSection() uuid.UUID {
	w.t.Helper()

	ctx := context.Background()
	grade := w.db.Client.Section.GetX(ctx, w.taughtSectionID).GradeLevelID
	return w.db.Client.Section.Create().
		SetAcademicSessionID(w.sessionID).
		SetBranchID(w.branchID).
		SetGradeLevelID(grade).
		SetName("C").
		SetCode("TTC-" + uuid.NewString()[:8]).
		SaveX(ctx).ID
}

func TestPublishingADisjointTimetableSucceeds(t *testing.T) {
	w := newTimetableWorld(t)
	server := w.asTenant()

	w.db.Client.TimetableSection.Create().
		SetTimetableID(w.timetableID).
		SetSectionID(w.taughtSectionID).
		SaveX(context.Background())

	other := w.draftCovering("Other", timetableDate(2026, time.May, 1), w.spareSection())

	rec := w.call(server.publishTimetable, "POST",
		"/api/v1/timetables/"+other.String()+"/publish", "{}", other)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 publishing a timetable sharing no section, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row := w.db.Client.Timetable.GetX(context.Background(), other)
	if row.Status != enttimetable.StatusPublished {
		t.Fatalf("want published, got %s", row.Status)
	}
	if row.PublishedBy == nil || *row.PublishedBy != w.personID {
		t.Fatalf("publishing must be attributed to the caller %s, got %v", w.personID, row.PublishedBy)
	}
}

func TestOccurrencesReportADateNoTimetableCovers(t *testing.T) {
	w := newTimetableWorld(t)

	w.db.Client.Timetable.UpdateOneID(w.timetableID).
		SetEffectiveTo(w.monday).
		SaveX(context.Background())

	tuesday := w.monday.AddDate(0, 0, 1)
	rec := w.call(w.server.resolveTimetableOccurrences, "GET",
		"/api/v1/timetable-occurrences?branch_id="+w.branchID.String()+
			"&date="+tuesday.Format(dateLayout), "", uuid.Nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("a gap is a fact about the week, not an error; want 200, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Count          int `json:"count"`
		UncoveredCount int `json:"uncovered_count"`
		UncoveredDays  []struct {
			Date           string    `json:"date"`
			PeriodSchemeID uuid.UUID `json:"period_scheme_id"`
		} `json:"uncovered_days"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the body is not the expected JSON: %v (body %s)",
			err, strings.TrimSpace(rec.Body.String()))
	}
	if body.Count != 0 {
		t.Fatalf("no timetable is in force on Tuesday, so nothing should resolve, got %d", body.Count)
	}
	if body.UncoveredCount != 1 || len(body.UncoveredDays) != 1 {
		t.Fatalf("a day with no timetable in force must be distinguishable from a holiday, got %+v", body)
	}
	if body.UncoveredDays[0].Date != tuesday.Format(dateLayout) {
		t.Fatalf("the gap must name Tuesday, got %s", body.UncoveredDays[0].Date)
	}
	if body.UncoveredDays[0].PeriodSchemeID != w.schemeID {
		t.Fatalf("the gap must name the scheme left uncovered, got %s",
			body.UncoveredDays[0].PeriodSchemeID)
	}
}

func TestOccurrencesReportNoGapOnACoveredDay(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.resolveTimetableOccurrences, "GET",
		"/api/v1/timetable-occurrences?branch_id="+w.branchID.String()+
			"&date="+w.monday.Format(dateLayout), "", uuid.Nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Count          int `json:"count"`
		UncoveredCount int `json:"uncovered_count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the body is not the expected JSON: %v", err)
	}
	if body.Count == 0 {
		t.Fatal("Monday teaches in this world, so the next assertion would pass vacuously")
	}
	if body.UncoveredCount != 0 {
		t.Fatalf("a covered day must report no gap, got %d", body.UncoveredCount)
	}
}
