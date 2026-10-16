package timetablegen

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entjob "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetablegenerationjob"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

const fakeToken = "solver-token-for-tests"

type seeded struct {
	db        *tenantent.Client
	ctx       context.Context
	published *tenantent.Timetable
	scheme    *tenantent.PeriodScheme
	draft     *tenantent.Timetable
}

func seededSchool(t *testing.T) *seeded {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t).Client

	published, err := db.Timetable.Query().
		Where(enttimetable.StatusEQ(enttimetable.StatusPublished)).
		Order(tenantent.Asc(enttimetable.FieldEffectiveFrom)).
		First(ctx)
	if err != nil {
		t.Skip("this tenant has no published timetable, so there is no week to generate " +
			"against; run cmd/seeddemo first")
	}

	filled, err := db.TimetableSlot.Query().
		Where(entslot.TimetableID(published.ID), entslot.SubjectOfferingIDNotNil()).
		Count(ctx)
	if err != nil {
		t.Fatalf("counting the published week: %v", err)
	}
	if filled == 0 {
		t.Skip("the published timetable carries no lessons, so echoing it would prove nothing")
	}

	scheme, err := db.PeriodScheme.Query().
		Where(entscheme.ID(published.PeriodSchemeID)).Only(ctx)
	if err != nil {
		t.Fatalf("loading the period scheme: %v", err)
	}

	rival, err := db.Timetable.Query().
		Where(
			enttimetable.PeriodSchemeID(published.PeriodSchemeID),
			enttimetable.StatusEQ(enttimetable.StatusDraft),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("looking for drafts already in the tenant: %v", err)
	}
	if rival > 0 {
		t.Fatalf("this tenant already carries %d draft timetable(s) on the same period "+
			"scheme; the clash checker compares a draft against every other draft, so the "+
			"week this test proposes would collide with one left behind rather than with "+
			"anything this test did. Clear them before running.", rival)
	}

	return &seeded{ctx: ctx, db: db, published: published, scheme: scheme}
}

func (s *seeded) newDraft(t *testing.T) *tenantent.Timetable {
	t.Helper()

	create := s.db.Timetable.Create().
		SetAcademicSessionID(s.published.AcademicSessionID).
		SetPeriodSchemeID(s.published.PeriodSchemeID).
		SetName("Auto-fill probe " + uuid.NewString()[:8]).
		SetVersion(s.published.Version + 1).
		SetEffectiveFrom(s.published.EffectiveFrom).
		SetStatus(enttimetable.StatusDraft).
		SetSupersedesID(s.published.ID)
	if s.published.EffectiveTo != nil {
		create = create.SetEffectiveTo(*s.published.EffectiveTo)
	}
	draft, err := create.Save(s.ctx)
	if err != nil {
		t.Fatalf("creating the draft the week is generated into: %v", err)
	}
	s.draft = draft
	return draft
}

func (s *seeded) job(t *testing.T, draft *tenantent.Timetable,
	options shared.GenerationOptions) *tenantent.TimetableGenerationJob {
	t.Helper()

	if options.MaxSeconds == 0 {
		options.MaxSeconds = 10
	}
	job, err := s.db.TimetableGenerationJob.Create().
		SetTimetableID(draft.ID).
		SetMaxSeconds(options.MaxSeconds).
		SetOptions(options).
		Save(s.ctx)
	if err != nil {
		t.Fatalf("creating the job row: %v", err)
	}
	return job
}

func (s *seeded) reload(t *testing.T, job *tenantent.TimetableGenerationJob) *tenantent.TimetableGenerationJob {
	t.Helper()

	fresh, err := s.db.TimetableGenerationJob.Query().Where(entjob.ID(job.ID)).Only(s.ctx)
	if err != nil {
		t.Fatalf("reloading the job row: %v", err)
	}
	return fresh
}

func (s *seeded) draftSlots(t *testing.T, draft *tenantent.Timetable) []*tenantent.TimetableSlot {
	t.Helper()

	rows, err := s.db.TimetableSlot.Query().Where(entslot.TimetableID(draft.ID)).All(s.ctx)
	if err != nil {
		t.Fatalf("reading the draft's slots: %v", err)
	}
	return rows
}

type fakeSolver struct {
	server   *httptest.Server
	answer   func(Request) (int, Answer)
	feasible func(Request) Feasibility
	seen     []Request
	asked    []string
}

func newFakeSolver(t *testing.T, answer func(Request) (int, Answer)) *fakeSolver {
	t.Helper()

	fake := &fakeSolver{
		answer:   answer,
		feasible: func(Request) Feasibility { return Feasibility{Feasible: true} },
	}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+fakeToken {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		var in Request
		if err := json.Unmarshal(raw, &in); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		fake.asked = append(fake.asked, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")

		if r.URL.Path == "/v1/feasibility" {
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(fake.feasible(in))
			return
		}
		fake.seen = append(fake.seen, in)

		code, out := fake.answer(in)
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(out)
	}))
	t.Cleanup(fake.server.Close)
	return fake
}

func (f *fakeSolver) runner(t *testing.T) *Runner {
	t.Helper()

	client, err := NewClient(ClientConfig{BaseURL: f.server.URL, Token: fakeToken,
		Timeout: 60 * time.Second})
	if err != nil {
		t.Fatalf("building the solver client: %v", err)
	}
	runner, err := NewRunner(client, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("building the runner: %v", err)
	}
	return runner
}

func echoed(in Request) []Slot {
	out := make([]Slot, 0, len(in.School.CurrentSlots))
	for index, slot := range in.School.CurrentSlots {
		out = append(out, Slot{
			Ref:               "s" + strconv.Itoa(index+1),
			SectionID:         slot.SectionID,
			DayOfWeek:         slot.DayOfWeek,
			PeriodID:          slot.PeriodID,
			SubjectOfferingID: slot.OfferingID,
			TeacherID:         slot.TeacherID,
			RoomID:            slot.RoomID,
		})
	}
	return out
}

func detailOf(job *tenantent.TimetableGenerationJob) string {
	if job.Detail == nil {
		return ""
	}
	return *job.Detail
}

func solved(slots []Slot) Answer {
	return Answer{
		Status:        StatusOptimal,
		Verdict:       "optimal_clean",
		ProvenOptimal: true,
		WallTimeS:     1.5,
		Slots:         slots,
	}
}

func TestAWeekThatPassesTheCheckIsWrittenAsDraftLessons(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		return http.StatusOK, solved(echoed(in))
	})
	job := school.job(t, draft, shared.GenerationOptions{})

	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.Status != entjob.StatusSucceeded {
		t.Fatalf("the job settled as %s, not succeeded: %s", settled.Status, detailOf(settled))
	}
	if settled.SlotsWritten == 0 {
		t.Fatal("the job says it succeeded and wrote nothing")
	}
	if settled.FinishedAt == nil || settled.StartedAt == nil {
		t.Error("a terminal job must carry both timestamps")
	}
	if settled.FailureReason != nil {
		t.Errorf("a successful job names a failure reason: %v", *settled.FailureReason)
	}

	written := school.draftSlots(t, draft)
	if len(written) != settled.SlotsWritten {
		t.Errorf("the job claims %d lessons and the draft carries %d",
			settled.SlotsWritten, len(written))
	}
	proposed := len(fake.seen[0].School.CurrentSlots)
	if settled.SlotsWritten != proposed {
		t.Errorf("the solver returned %d lessons and %d were written",
			proposed, settled.SlotsWritten)
	}
	t.Logf("%d lessons proposed, checked against the tenant and written into draft %s",
		proposed, draft.ID)

	fresh, err := school.db.Timetable.Get(school.ctx, draft.ID)
	if err != nil {
		t.Fatalf("reloading the draft: %v", err)
	}
	if fresh.Status != enttimetable.StatusDraft {
		t.Errorf("auto-fill left the timetable %s; it proposes, a person publishes", fresh.Status)
	}
}

func TestAutoFillNeverRecordsAClashOverride(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		return http.StatusOK, solved(echoed(in))
	})
	job := school.job(t, draft, shared.GenerationOptions{})
	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	for _, slot := range school.draftSlots(t, draft) {
		if slot.ClashOverride {
			t.Fatalf("slot %s carries a clash override; auto-fill proposes a week and "+
				"never forces one", slot.ID)
		}
		if slot.ClashOverrideReason != nil || len(slot.ClashOverrideJSON) > 0 {
			t.Fatalf("slot %s carries override bookkeeping without the flag", slot.ID)
		}
	}
}

func TestAWeekThatFailsTheCheckIsNeverWritten(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		slots := echoed(in)
		moved, ok := doubleBookATeacher(slots)
		if !ok {
			t.Skip("this tenant has no teacher holding two lessons, so no teacher clash " +
				"can be constructed from its own week")
		}
		return http.StatusOK, solved(moved)
	})
	job := school.job(t, draft, shared.GenerationOptions{})

	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.Status != entjob.StatusFailed {
		t.Fatalf("a week with a teacher in two rooms at once settled as %s, not failed; "+
			"the clash checker is the precondition for the write, not a report afterwards",
			settled.Status)
	}
	if settled.FailureReason == nil || *settled.FailureReason != entjob.FailureReasonClash {
		t.Fatalf("the failure is recorded as %v, not clash", settled.FailureReason)
	}
	if settled.Detail == nil || !strings.Contains(*settled.Detail, "teacher") {
		t.Errorf("the detail does not name the rule that refused the week: %v", settled.Detail)
	}
	if written := school.draftSlots(t, draft); len(written) != 0 {
		t.Fatalf("%d lessons were written despite a blocking clash", len(written))
	}
	if settled.SlotsWritten != 0 {
		t.Errorf("the job records %d lessons written", settled.SlotsWritten)
	}
}

func doubleBookATeacher(slots []Slot) ([]Slot, bool) {
	byTeacher := map[string][]int{}
	for index, slot := range slots {
		if slot.TeacherID == nil {
			continue
		}
		byTeacher[*slot.TeacherID] = append(byTeacher[*slot.TeacherID], index)
	}
	for _, indexes := range byTeacher {
		for _, left := range indexes {
			for _, right := range indexes {
				if left == right {
					continue
				}
				if slots[left].SectionID == slots[right].SectionID {
					continue
				}
				if slots[left].DayOfWeek == slots[right].DayOfWeek &&
					slots[left].PeriodID == slots[right].PeriodID {
					continue
				}
				moved := make([]Slot, len(slots))
				copy(moved, slots)
				moved[right].DayOfWeek = slots[left].DayOfWeek
				moved[right].PeriodID = slots[left].PeriodID
				return moved, true
			}
		}
	}
	return slots, false
}

func TestAnInfeasibleAnswerIsRecordedAsAnAnswerNotAFailure(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(Request) (int, Answer) {
		return http.StatusUnprocessableEntity, Answer{
			Status:            StatusInfeasible,
			Verdict:           "infeasible",
			WallTimeS:         0.4,
			InfeasibilityCore: []string{"teacher_capacity:abc"},
			CoreExplanation:   "Vihaan Reddy is required for 36 periods a week and has 34 available.",
		}
	})
	job := school.job(t, draft, shared.GenerationOptions{})

	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.Status != entjob.StatusInfeasible {
		t.Fatalf("settled as %s, not infeasible", settled.Status)
	}
	if settled.FailureReason != nil {
		t.Errorf("an infeasible school is an answer, not a fault: %v", *settled.FailureReason)
	}
	if settled.Detail == nil || !strings.Contains(*settled.Detail, "36 periods") {
		t.Errorf("the sentence the solver produced was not kept: %v", settled.Detail)
	}
	if len(settled.CoreKeys) != 1 {
		t.Errorf("the core keys were dropped: %v", settled.CoreKeys)
	}
	if len(school.draftSlots(t, draft)) != 0 {
		t.Error("an infeasible answer wrote lessons")
	}
}

func TestATimeoutIsDistinguishedFromAnImpossibleSchool(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(Request) (int, Answer) {
		return http.StatusUnprocessableEntity, Answer{
			Status:    StatusUnknown,
			Verdict:   "unknown",
			WallTimeS: 10,
		}
	})
	job := school.job(t, draft, shared.GenerationOptions{})

	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.Status != entjob.StatusFailed {
		t.Fatalf("settled as %s, not failed", settled.Status)
	}
	if settled.FailureReason == nil || *settled.FailureReason != entjob.FailureReasonTimeout {
		t.Fatalf("recorded as %v, not timeout; an unfinished search and a proof that no "+
			"week exists are different answers", settled.FailureReason)
	}
	if settled.SolverStatus == nil || *settled.SolverStatus != StatusUnknown {
		t.Errorf("the solver's own status was not kept: %v", settled.SolverStatus)
	}
}

func TestAnUnreachableSolverIsNamedAsSuch(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(Request) (int, Answer) { return http.StatusOK, Answer{} })
	runner := fake.runner(t)
	fake.server.Close()

	job := school.job(t, draft, shared.GenerationOptions{})
	if err := runner.Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.FailureReason == nil || *settled.FailureReason != entjob.FailureReasonUnreachable {
		t.Fatalf("a solver that is not there was recorded as %v", settled.FailureReason)
	}
}

func TestAnAnswerNamingSomethingThatIsNotAUUIDIsRefused(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		slots := echoed(in)
		if len(slots) == 0 {
			t.Skip("nothing to corrupt")
		}
		slots[0].PeriodID = "period-five"
		return http.StatusOK, solved(slots)
	})
	job := school.job(t, draft, shared.GenerationOptions{})

	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.FailureReason == nil || *settled.FailureReason != entjob.FailureReasonRefused {
		t.Fatalf("recorded as %v, not refused", settled.FailureReason)
	}
	if len(school.draftSlots(t, draft)) != 0 {
		t.Error("an unreadable answer wrote lessons")
	}
}

func TestGeneratingIntoAPublishedWeekIsRefusedBeforeTheSolverIsCalled(t *testing.T) {
	school := seededSchool(t)

	fake := newFakeSolver(t, func(Request) (int, Answer) {
		t.Error("the solver was called for a timetable that is not a draft")
		return http.StatusOK, Answer{}
	})
	job := school.job(t, school.published, shared.GenerationOptions{ReplaceExisting: true})

	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.FailureReason == nil || *settled.FailureReason != entjob.FailureReasonInvalid {
		t.Fatalf("recorded as %v, not invalid", settled.FailureReason)
	}
	if settled.Detail == nil || *settled.Detail != ErrNotDraft.Error() {
		t.Fatalf("refused as %v, not for being a published week", settled.Detail)
	}
	if len(fake.seen) != 0 {
		t.Errorf("the solver was asked to solve %d times anyway", len(fake.seen))
	}
}

func TestADraftThatAlreadyCarriesLessonsIsRefusedUnlessReplaceIsAsked(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	seed, err := school.db.TimetableSlot.Query().
		Where(entslot.TimetableID(school.published.ID), entslot.SubjectOfferingIDNotNil()).
		First(school.ctx)
	if err != nil {
		t.Fatalf("reading a lesson to copy: %v", err)
	}
	if _, err := school.db.TimetableSlot.Create().
		SetTimetableID(draft.ID).
		SetSectionID(seed.SectionID).
		SetPeriodID(seed.PeriodID).
		SetDayOfWeek(seed.DayOfWeek).
		SetNillableSubjectOfferingID(seed.SubjectOfferingID).
		Save(school.ctx); err != nil {
		t.Fatalf("placing a lesson by hand: %v", err)
	}

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		return http.StatusOK, solved(echoed(in))
	})
	job := school.job(t, draft, shared.GenerationOptions{})
	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.FailureReason == nil || *settled.FailureReason != entjob.FailureReasonInvalid {
		t.Fatalf("recorded as %v, not invalid", settled.FailureReason)
	}
	if got := len(school.draftSlots(t, draft)); got != 1 {
		t.Errorf("the hand-placed lesson was disturbed: %d slots remain", got)
	}
}

func TestReplaceExistingClearsTheDraftsOwnLessonsInsideTheWrite(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	seed, err := school.db.TimetableSlot.Query().
		Where(entslot.TimetableID(school.published.ID), entslot.SubjectOfferingIDNotNil()).
		First(school.ctx)
	if err != nil {
		t.Fatalf("reading a lesson to copy: %v", err)
	}
	stale, err := school.db.TimetableSlot.Create().
		SetTimetableID(draft.ID).
		SetSectionID(seed.SectionID).
		SetPeriodID(seed.PeriodID).
		SetDayOfWeek(seed.DayOfWeek).
		SetNillableSubjectOfferingID(seed.SubjectOfferingID).
		Save(school.ctx)
	if err != nil {
		t.Fatalf("placing a lesson by hand: %v", err)
	}

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		return http.StatusOK, solved(echoed(in))
	})
	job := school.job(t, draft, shared.GenerationOptions{ReplaceExisting: true})
	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.Status != entjob.StatusSucceeded {
		t.Fatalf("settled as %s: %s", settled.Status, detailOf(settled))
	}
	for _, slot := range school.draftSlots(t, draft) {
		if slot.ID == stale.ID {
			t.Fatal("the lesson the generated week replaced is still there")
		}
	}
}

func TestTheRequestCarriesCohortsAndNoPupilIdentifiers(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		return http.StatusOK, solved(echoed(in))
	})
	job := school.job(t, draft, shared.GenerationOptions{})
	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}
	if len(fake.seen) != 1 {
		t.Fatalf("the solver was called %d times", len(fake.seen))
	}

	sent := fake.seen[0]
	if len(sent.School.Cohorts) == 0 {
		t.Error("no cohorts travelled, so the model has nothing keeping a pupil in one place")
	}
	if len(sent.School.Cells) == 0 {
		t.Error("no cells travelled, so there is nowhere to put a lesson")
	}

	encoded, err := json.Marshal(sent)
	if err != nil {
		t.Fatalf("re-encoding the request: %v", err)
	}
	students, err := school.db.Student.Query().Limit(20).IDs(school.ctx)
	if err != nil {
		t.Fatalf("reading pupil ids: %v", err)
	}
	for _, id := range students {
		if strings.Contains(string(encoded), id.String()) {
			t.Fatalf("pupil %s is in the request body; cohorts travel and pupils do not", id)
		}
	}
}

func TestTheRequestEchoesTheJobIdSoALogLineCanBeJoinedUp(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		return http.StatusOK, solved(echoed(in))
	})
	job := school.job(t, draft, shared.GenerationOptions{})
	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}
	if fake.seen[0].RequestID != job.ID.String() {
		t.Errorf("the request names %q rather than the job", fake.seen[0].RequestID)
	}
}

func TestThePreflightIsAskedBeforeASolveSlotIsTaken(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		t.Error("a school the preflight had already refused was sent to be solved")
		return http.StatusOK, solved(echoed(in))
	})
	fake.feasible = func(Request) Feasibility {
		return Feasibility{
			Feasible:          false,
			InfeasibilityCore: []string{"teacher_capacity:abc"},
			CoreExplanation:   "Myra Rao is required for 40 periods a week and has 34 available.",
		}
	}
	job := school.job(t, draft, shared.GenerationOptions{})

	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}

	settled := school.reload(t, job)
	if settled.Status != entjob.StatusInfeasible {
		t.Fatalf("settled as %s, not infeasible", settled.Status)
	}
	if detailOf(settled) == "" || !strings.Contains(detailOf(settled), "40 periods") {
		t.Errorf("the preflight's sentence was not kept: %q", detailOf(settled))
	}
	if len(fake.asked) != 1 || fake.asked[0] != "/v1/feasibility" {
		t.Errorf("the solver was asked %v", fake.asked)
	}
}

func TestNoListInTheRequestIsEverSentAsNull(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	export, err := BuildExport(school.ctx, school.db, draft, school.published)
	if err != nil {
		t.Fatalf("building the export: %v", err)
	}
	encoded, err := json.Marshal(export.School)
	if err != nil {
		t.Fatalf("encoding the school: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("decoding the school: %v", err)
	}
	for _, key := range []string{"periods", "cells", "sections", "rooms", "teachers",
		"offerings", "cohorts", "incumbents", "fixed_slots", "current_slots",
		"section_roll_counts"} {
		value, held := decoded[key]
		if !held {
			t.Errorf("%q is missing from the request body", key)
			continue
		}
		if value == nil {
			t.Errorf("%q is null; the loader iterates it and a Go nil slice encodes as "+
				"null, which is not an empty list", key)
		}
	}
}

func TestTheDraftsOwnLessonsAreNeverSentAsFixedPlacements(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	seed, err := school.db.TimetableSlot.Query().
		Where(entslot.TimetableID(school.published.ID), entslot.SubjectOfferingIDNotNil()).
		First(school.ctx)
	if err != nil {
		t.Fatalf("reading a lesson to copy: %v", err)
	}
	if _, err := school.db.TimetableSlot.Create().
		SetTimetableID(draft.ID).
		SetSectionID(seed.SectionID).
		SetPeriodID(seed.PeriodID).
		SetDayOfWeek(seed.DayOfWeek).
		SetNillableSubjectOfferingID(seed.SubjectOfferingID).
		SetNillableTeacherID(seed.TeacherID).
		Save(school.ctx); err != nil {
		t.Fatalf("placing a lesson by hand: %v", err)
	}
	label := "Assembly"
	if _, err := school.db.TimetableSlot.Create().
		SetTimetableID(draft.ID).
		SetSectionID(seed.SectionID).
		SetPeriodID(seed.PeriodID).
		SetDayOfWeek(otherDay(seed.DayOfWeek)).
		SetLabel(label).
		Save(school.ctx); err != nil {
		t.Fatalf("placing an assembly by hand: %v", err)
	}

	export, err := BuildExport(school.ctx, school.db, draft, school.published)
	if err != nil {
		t.Fatalf("building the export: %v", err)
	}

	if len(export.School.FixedSlots) != 1 {
		t.Fatalf("the export carries %d fixed slots, want only the assembly: %+v",
			len(export.School.FixedSlots), export.School.FixedSlots)
	}
	fixed := export.School.FixedSlots[0]
	if fixed.SubjectOfferingID != nil {
		t.Errorf("a lesson was sent as an immovable placement; it is either refused or "+
			"replaced, and either way the solver would be scheduling around a lesson "+
			"that is about to go, while its demand was counted twice: %+v", fixed)
	}
	if fixed.Label == nil || *fixed.Label != label {
		t.Errorf("the assembly did not travel: %+v", fixed)
	}
}

func otherDay(day int) int {
	if day == 1 {
		return 2
	}
	return day - 1
}
