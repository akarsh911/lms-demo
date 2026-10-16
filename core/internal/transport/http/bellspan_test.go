package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbellperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellscheduleperiod"
)

type bellScheduleGuard struct{}

func (bellScheduleGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.TimetableRead, authorization.TimetableWrite, authorization.TimetableDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Rule:     "bell schedule test guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (bellScheduleGuard) Name() string { return "bell schedule database test guard" }

type bellSpanWorld struct {
	*timetableWorld
	ringer *Server

	bellID uuid.UUID
	spanP1 uuid.UUID
}

func newBellSpanWorld(t *testing.T) *bellSpanWorld {
	t.Helper()

	w := &bellSpanWorld{
		timetableWorld: newTimetableWorld(t),
		ringer:         &Server{guard: bellScheduleGuard{}},
	}

	row, err := w.db.Client.BellSchedulePeriod.Query().
		Where(entbellperiod.PeriodID(w.periodP1)).
		Only(context.Background())
	if err != nil {
		t.Fatalf("the seeded bell row for P1 could not be read: %v", err)
	}
	w.bellID = row.BellScheduleID
	w.spanP1 = row.ID

	w.requireGenuineBellScope()
	return w
}

func (w *bellSpanWorld) requireGenuineBellScope() {
	w.t.Helper()

	viewer, decision, err := w.ringer.scopeFor(w.ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		w.t.Fatalf("the ringer scope could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer would skip the scoped lookup and prove nothing")
	}
	if !decision.HasReach || decision.Reach != authorization.ReachTenant {
		w.t.Fatalf("writing a bell schedule needs a tenant reach, got %+v", decision)
	}
}

func (w *bellSpanWorld) patchSpan(id uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()

	return w.call(w.ringer.updateBellSchedulePeriod, http.MethodPatch,
		"/api/v1/bell-schedule-periods/"+id.String(), body, id)
}

func (w *bellSpanWorld) addPeriod(body string) *httptest.ResponseRecorder {
	w.t.Helper()

	return w.call(w.ringer.createBellSchedulePeriod, http.MethodPost,
		"/api/v1/bell-schedules/"+w.bellID.String()+"/periods", body, w.bellID)
}

func (w *bellSpanWorld) span(id uuid.UUID) *tenantent.BellSchedulePeriod {
	w.t.Helper()

	row, err := w.db.Client.BellSchedulePeriod.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("the bell row %s could not be read back: %v", id, err)
	}
	return row
}

func (w *bellSpanWorld) requireSpan(id uuid.UUID, start, end int) {
	w.t.Helper()

	row := w.span(id)
	if row.StartMinute != start || row.EndMinute != end {
		w.t.Fatalf("the span must be %d-%d, got %d-%d",
			start, end, row.StartMinute, row.EndMinute)
	}
}

func (w *bellSpanWorld) requireRefusal(rec *httptest.ResponseRecorder, want int, naming string) {
	w.t.Helper()

	if rec.Code != want {
		w.t.Fatalf("want %d, got %d: %s", want, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), naming) {
		w.t.Fatalf("the refusal must name %q, got %s", naming, strings.TrimSpace(rec.Body.String()))
	}
}

func (w *bellSpanWorld) sparePeriod() uuid.UUID {
	w.t.Helper()

	return w.db.Client.Period.Create().
		SetPeriodSchemeID(w.schemeID).
		SetName("Period P3").
		SetCode("P3-" + uuid.NewString()[:8]).
		SetSequence(3).
		SaveX(context.Background()).ID
}

func TestTogglingRunsDoesNotCarryStaleTimesBackOverANewerEdit(t *testing.T) {
	w := newBellSpanWorld(t)

	w.requireSpan(w.spanP1, 545, 585)

	w.db.Client.BellSchedulePeriod.UpdateOneID(w.spanP1).
		SetStartMinute(600).SetEndMinute(640).
		ExecX(context.Background())

	rec := w.patchSpan(w.spanP1, `{"runs":false}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("suppressing a period must not need its times, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row := w.span(w.spanP1)
	if row.Runs {
		t.Fatalf("the toggle did not land: runs is still true")
	}
	if row.StartMinute != 600 || row.EndMinute != 640 {
		t.Fatalf("the toggle overwrote another person's retiming: the span is %d-%d, not 600-640",
			row.StartMinute, row.EndMinute)
	}

	back := w.patchSpan(w.spanP1, `{"runs":true}`)
	if back.Code != http.StatusOK {
		t.Fatalf("the toggle must go the other way too, got %d: %s",
			back.Code, strings.TrimSpace(back.Body.String()))
	}
	if !w.span(w.spanP1).Runs {
		t.Fatalf("runs did not come back on")
	}
	w.requireSpan(w.spanP1, 600, 640)
}

func TestAnEmptyPatchOfABellPeriodLeavesEverythingWhereItWas(t *testing.T) {
	w := newBellSpanWorld(t)

	rec := w.patchSpan(w.spanP1, `{}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("a patch that names nothing changes nothing and is not an error, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireSpan(w.spanP1, 545, 585)
	if !w.span(w.spanP1).Runs {
		t.Fatalf("an empty patch turned the period off")
	}
}

func TestASpanThatIsSentIsStillWritten(t *testing.T) {
	w := newBellSpanWorld(t)

	rec := w.patchSpan(w.spanP1, `{"start_minute":600,"end_minute":645}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("a whole span must still be writable, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireSpan(w.spanP1, 600, 645)

	both := w.patchSpan(w.spanP1, `{"start_minute":610,"end_minute":650,"runs":false}`)
	if both.Code != http.StatusOK {
		t.Fatalf("a span and the toggle together must be accepted, got %d: %s",
			both.Code, strings.TrimSpace(both.Body.String()))
	}
	w.requireSpan(w.spanP1, 610, 650)
	if w.span(w.spanP1).Runs {
		t.Fatalf("the toggle was ignored when it travelled with a span")
	}
}

func TestHalfASpanIsARefusalRatherThanAnEdit(t *testing.T) {
	w := newBellSpanWorld(t)

	for _, body := range []string{
		`{"start_minute":600}`,
		`{"end_minute":650}`,
		`{"start_minute":600,"runs":false}`,
	} {
		w.requireRefusal(w.patchSpan(w.spanP1, body), http.StatusBadRequest, "required")
		w.requireSpan(w.spanP1, 545, 585)
		if !w.span(w.spanP1).Runs {
			t.Fatalf("the refused patch %s still applied the rest of the body", body)
		}
	}
}

func TestABellPeriodCannotBeLeftWithNoTimesAtAll(t *testing.T) {
	w := newBellSpanWorld(t)

	w.requireRefusal(w.patchSpan(w.spanP1, `{"start_minute":null,"end_minute":null}`),
		http.StatusBadRequest, "cannot be set to null")
	w.requireRefusal(w.patchSpan(w.spanP1, `{"end_minute":null}`),
		http.StatusBadRequest, "end_minute")
	w.requireSpan(w.spanP1, 545, 585)
}

func TestASpanThatIsSentIsStillJudgedAgainstTheDay(t *testing.T) {
	w := newBellSpanWorld(t)

	for _, body := range []string{
		`{"start_minute":-1,"end_minute":600}`,
		`{"start_minute":600,"end_minute":1441}`,
		`{"start_minute":600,"end_minute":600}`,
		`{"start_minute":700,"end_minute":600}`,
	} {
		w.requireRefusal(w.patchSpan(w.spanP1, body),
			http.StatusUnprocessableEntity, "inside the day")
		w.requireSpan(w.spanP1, 545, 585)
	}
}

func TestCreatingABellPeriodStillDemandsASpan(t *testing.T) {
	w := newBellSpanWorld(t)

	period := w.sparePeriod()
	named := `"period_id":"` + period.String() + `"`

	w.requireRefusal(w.addPeriod(`{`+named+`}`), http.StatusBadRequest, "required")
	w.requireRefusal(w.addPeriod(`{`+named+`,"start_minute":660}`), http.StatusBadRequest, "required")
	w.requireRefusal(w.addPeriod(`{`+named+`,"runs":false}`), http.StatusBadRequest, "required")

	if n := w.db.Client.BellSchedulePeriod.Query().
		Where(entbellperiod.PeriodID(period)).CountX(context.Background()); n != 0 {
		t.Fatalf("a period with no times was created anyway: %d rows", n)
	}

	rec := w.addPeriod(`{` + named + `,"start_minute":660,"end_minute":700}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("a whole span must still create the row, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	row, err := w.db.Client.BellSchedulePeriod.Query().
		Where(entbellperiod.PeriodID(period)).Only(context.Background())
	if err != nil {
		t.Fatalf("the created row could not be read back: %v", err)
	}
	if row.StartMinute != 660 || row.EndMinute != 700 {
		t.Fatalf("the created span is %d-%d, not 660-700", row.StartMinute, row.EndMinute)
	}
}
