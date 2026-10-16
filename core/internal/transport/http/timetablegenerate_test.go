package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/config"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entjob "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetablegenerationjob"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetablegen"
)

const generateProbeToken = "probe-token"

func (w *timetableWorld) draft(supersedes *uuid.UUID, from time.Time) *tenantent.Timetable {
	w.t.Helper()

	create := w.db.Client.Timetable.Create().
		SetAcademicSessionID(w.sessionID).
		SetPeriodSchemeID(w.schemeID).
		SetName("Draft " + uuid.NewString()[:8]).
		SetVersion(2).
		SetEffectiveFrom(from).
		SetStatus(enttimetable.StatusDraft)
	if supersedes != nil {
		create = create.SetSupersedesID(*supersedes)
	}
	return create.SaveX(context.Background())
}

func (w *timetableWorld) callJob(handler http.HandlerFunc,
	timetableID, jobID uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", timetableID.String())
	route.URLParams.Add("job", jobID.String())
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	target := "/api/v1/timetables/" + timetableID.String() + "/generate/" + jobID.String()
	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest("GET", target, strings.NewReader("")).WithContext(ctx))
	return rec
}

type generateGuard struct{}

func (generateGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.TimetableRead, authorization.TimetableReadAll,
		authorization.TimetableWrite, authorization.TimetableWriteAll,
		authorization.TimetableGenerate:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Rule:     "timetable generate test guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (generateGuard) Name() string { return "timetable generate test guard" }

func generatingServer(t *testing.T, w *timetableWorld) *Server {
	t.Helper()

	w.server.guard = generateGuard{}
	w.server.cfg = &config.Config{
		TimetableSolverEnabled:    true,
		TimetableSolverBaseURL:    "http://127.0.0.1:1",
		TimetableSolverToken:      generateProbeToken,
		TimetableSolverMaxSeconds: 30,
	}
	return w.server
}

func useProbeGenerator(t *testing.T, handler http.HandlerFunc) {
	t.Helper()

	solver := httptest.NewServer(handler)
	t.Cleanup(solver.Close)

	client, err := timetablegen.NewClient(timetablegen.ClientConfig{
		BaseURL: solver.URL, Token: generateProbeToken, Timeout: 10 * time.Second,
	})
	if err != nil {
		t.Fatalf("building the probe solver client: %v", err)
	}
	runner, err := timetablegen.NewRunner(client, nil)
	if err != nil {
		t.Fatalf("building the probe runner: %v", err)
	}
	dispatcher := timetablegen.NewDispatcher(runner, 1, 4, nil)
	UseTimetableSolver(dispatcher)
	t.Cleanup(func() {
		dispatcher.Drain()
		dispatcher.Close()
		UseTimetableSolver(nil)
	})
}

func TestGenerateRefusesWhereNoSolverIsDeployed(t *testing.T) {
	w := newTimetableWorld(t)
	draft := w.draft(nil, timetableDate(2030, time.April, 1))

	rec := w.call(w.server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate", "{}", draft.ID)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503 where nothing can solve, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "by hand") {
		t.Errorf("the refusal does not say a week can still be arranged by hand: %s",
			strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateRefusesAPublishedWeek(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(http.ResponseWriter, *http.Request) {
		t.Error("the solver was called for a published timetable")
	})

	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+w.timetableID.String()+"/generate", "{}", w.timetableID)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 for a published week, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateRefusesADraftThatRunsOverAVersionItDoesNotReplace(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(http.ResponseWriter, *http.Request) {
		t.Error("the solver was called for a draft that collides with a published week")
	})

	draft := w.draft(nil, timetableDate(2026, time.April, 1))
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate", "{}", draft.ID)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "supersedes_id") {
		t.Errorf("the refusal does not say how to fix it: %s",
			strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateRefusesAnUnknownWeight(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(http.ResponseWriter, *http.Request) {
		t.Error("the solver was called for a request that never validated")
	})

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate",
		`{"weights":{"teacher_gaps":30}}`, draft.ID)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 for a penalty that does not exist, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateRefusesASolveLongerThanTheServiceCeiling(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(http.ResponseWriter, *http.Request) {
		t.Error("the solver was called for a request that never validated")
	})

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate",
		`{"max_seconds":600}`, draft.ID)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateAcceptsAndHandsBackAJobToPollOn(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(rw http.ResponseWriter, _ *http.Request) {
		rw.WriteHeader(http.StatusUnauthorized)
	})

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate", `{"max_seconds":5}`, draft.ID)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("want 202, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		ID          uuid.UUID `json:"id"`
		TimetableID uuid.UUID `json:"timetable_id"`
		Status      string    `json:"status"`
		Terminal    bool      `json:"terminal"`
		MaxSeconds  int       `json:"max_seconds"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decoding the job: %v (%s)", err, rec.Body.String())
	}
	if body.TimetableID != draft.ID {
		t.Errorf("the job names timetable %s, not the draft", body.TimetableID)
	}
	if body.MaxSeconds != 5 {
		t.Errorf("the job records max_seconds %d, not the 5 asked for", body.MaxSeconds)
	}
	want := "/api/v1/timetables/" + draft.ID.String() + "/generate/" + body.ID.String()
	if got := rec.Header().Get("Location"); got != want {
		t.Errorf("Location is %q, want %q", got, want)
	}

	timetableGenerator.Drain()

	settled, err := w.db.Client.TimetableGenerationJob.Query().
		Where(entjob.ID(body.ID)).Only(context.Background())
	if err != nil {
		t.Fatalf("reading the job back: %v", err)
	}
	if settled.Status != entjob.StatusFailed {
		t.Fatalf("a solver that refuses the token left the job %s", settled.Status)
	}
	if settled.FailureReason == nil || *settled.FailureReason != entjob.FailureReasonRefused {
		t.Errorf("recorded as %v, not refused", settled.FailureReason)
	}

	read := w.callJob(server.getTimetableGeneration, draft.ID, body.ID)
	if read.Code != http.StatusOK {
		t.Fatalf("polling the job: %d %s", read.Code, strings.TrimSpace(read.Body.String()))
	}
	var polled struct {
		Status   string `json:"status"`
		Terminal bool   `json:"terminal"`
	}
	if err := json.Unmarshal(read.Body.Bytes(), &polled); err != nil {
		t.Fatalf("decoding the polled job: %v", err)
	}
	if polled.Status != string(entjob.StatusFailed) || !polled.Terminal {
		t.Errorf("the poll reports %q terminal=%v", polled.Status, polled.Terminal)
	}
}

func TestGenerateRefusesASecondRunWhileOneIsStillGoing(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(rw http.ResponseWriter, _ *http.Request) {
		rw.WriteHeader(http.StatusUnauthorized)
	})

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	if _, err := w.db.Client.TimetableGenerationJob.Create().
		SetTimetableID(draft.ID).
		SetMaxSeconds(10).
		Save(context.Background()); err != nil {
		t.Fatalf("placing the job that is already running: %v", err)
	}

	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate", "{}", draft.ID)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409 while a run is in flight, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateWarnsWhenTheBranchRunsASecondPeriodScheme(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(rw http.ResponseWriter, _ *http.Request) {
		rw.WriteHeader(http.StatusUnauthorized)
	})

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate", "{}", draft.ID)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("want 202, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	var body struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decoding the job: %v", err)
	}

	timetableGenerator.Drain()

	settled, err := w.db.Client.TimetableGenerationJob.Query().
		Where(entjob.ID(body.ID)).Only(context.Background())
	if err != nil {
		t.Fatalf("reading the job back: %v", err)
	}
	if len(settled.Warnings) == 0 {
		t.Fatal("this branch runs two active period schemes and a teacher can be in both; " +
			"the model cannot express that and the job said nothing about it")
	}
	joined := strings.Join(settled.Warnings, " ")
	if !strings.Contains(joined, "period scheme") {
		t.Errorf("the warning does not name what it is about: %q", joined)
	}
}
