package timetablegen

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entjob "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetablegenerationjob"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

const Component = "timetable-generate"

var (
	ErrNoSolver = errors.New("timetablegen: no timetable solver is configured")

	ErrNotDraft = errors.New("timetablegen: a generated week is written as a draft, so the target must be a draft")

	ErrAlreadyFilled = errors.New("timetablegen: this draft already carries lessons")

	ErrWeekClashes = errors.New("timetablegen: the solver returned a week the clash checker refuses")
)

type clashError struct {
	report *timetable.ClashReport
}

func (e *clashError) Error() string {
	blocking := e.report.Blocking()
	counted := map[timetable.Rule]int{}
	for _, clash := range blocking {
		counted[clash.Rule]++
	}
	parts := make([]string, 0, len(counted))
	for _, rule := range timetable.AllRules() {
		if counted[rule] > 0 {
			parts = append(parts, strconv.Itoa(counted[rule])+" "+string(rule))
		}
	}
	return ErrWeekClashes.Error() + ": " + strconv.Itoa(len(blocking)) +
		" blocking (" + strings.Join(parts, ", ") + ")"
}

func (e *clashError) Unwrap() error { return ErrWeekClashes }

func (e *clashError) Report() *timetable.ClashReport { return e.report }

type Runner struct {
	solver *Client
	logger *slog.Logger
	now    func() time.Time
}

func NewRunner(solver *Client, logger *slog.Logger) (*Runner, error) {
	if solver == nil {
		return nil, ErrNoSolver
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Runner{
		solver: solver,
		logger: logger.With("component", Component),
		now:    func() time.Time { return time.Now().UTC() },
	}, nil
}

func (r *Runner) Execute(ctx context.Context, client *tenantent.Client, jobID uuid.UUID) error {
	job, err := client.TimetableGenerationJob.Query().Where(entjob.ID(jobID)).Only(ctx)
	if err != nil {
		return err
	}
	if job.Status != entjob.StatusQueued {
		return nil
	}

	job, err = client.TimetableGenerationJob.UpdateOne(job).
		SetStatus(entjob.StatusRunning).
		SetStartedAt(r.now()).
		Save(ctx)
	if err != nil {
		return err
	}

	outcome, runErr := r.run(ctx, client, job)
	if runErr != nil {
		outcome = failureOf(runErr, outcome)
	}
	return r.settle(ctx, client, job, outcome)
}

type outcome struct {
	status         entjob.Status
	reason         *entjob.FailureReason
	detail         string
	solverStatus   string
	verdict        string
	objective      *float64
	wallTimeMS     int
	slotsWritten   int
	coreKeys       []string
	warnings       []string
	softViolations []shared.SolverViolation
}

func (r *Runner) run(ctx context.Context, client *tenantent.Client,
	job *tenantent.TimetableGenerationJob) (*outcome, error) {

	out := &outcome{}

	target, err := client.Timetable.Get(ctx, job.TimetableID)
	if err != nil {
		return out, err
	}
	if target.Status != enttimetable.StatusDraft {
		return out, ErrNotDraft
	}

	var supersedes *tenantent.Timetable
	if target.SupersedesID != nil {
		supersedes, err = client.Timetable.Get(ctx, *target.SupersedesID)
		if err != nil && !tenantent.IsNotFound(err) {
			return out, err
		}
	}

	export, err := BuildExport(ctx, client, target, supersedes)
	if err != nil {
		return out, err
	}
	contact, err := resolveDailyContact(ctx, client, export, job.Options.DailyContact)
	if err != nil {
		return out, err
	}
	out.warnings = export.Warnings

	existing, err := client.TimetableSlot.Query().
		Where(entslot.TimetableID(target.ID)).
		All(ctx)
	if err != nil {
		return out, err
	}
	var replaced []uuid.UUID
	for _, slot := range existing {
		if slot.SubjectOfferingID == nil {
			continue
		}
		if !job.Options.ReplaceExisting {
			return out, fmt.Errorf("%w: %d lessons are already placed; ask again with "+
				"replace_existing so the generated week may take their place",
				ErrAlreadyFilled, len(existing))
		}
		replaced = append(replaced, slot.ID)
	}

	request := buildRequest(job, export, supersedes != nil, contact)

	if verdict, err := r.solver.Feasibility(ctx, request); err == nil && !verdict.Feasible {
		out.solverStatus = StatusInfeasible
		out.verdict = "infeasible"
		out.coreKeys = verdict.InfeasibilityCore
		out.status = entjob.StatusInfeasible
		out.detail = verdict.CoreExplanation
		if out.detail == "" {
			out.detail = "this school cannot be timetabled as it stands, and the preflight " +
				"could not say which requirement is to blame"
		}
		return out, nil
	}

	answer, err := r.solver.Solve(ctx, request)
	if err != nil {
		return out, err
	}

	out.solverStatus = answer.Status
	out.verdict = answer.Verdict
	out.objective = answer.Objective
	out.wallTimeMS = int(answer.WallTimeS * 1000)
	out.coreKeys = answer.InfeasibilityCore
	out.softViolations = answer.SoftViolations

	if !answer.Solved() {
		if answer.Status == StatusInfeasible {
			out.status = entjob.StatusInfeasible
			out.detail = answer.CoreExplanation
			if out.detail == "" {
				out.detail = "the solver proved that no week meets these requirements, " +
					"and could not say which requirements are to blame"
			}
			return out, nil
		}
		reason := entjob.FailureReasonTimeout
		out.status = entjob.StatusFailed
		out.reason = &reason
		out.detail = "the solver ran for " + strconv.Itoa(out.wallTimeMS/1000) +
			"s without finding a week and without proving there is none; " +
			"ask again with a larger max_seconds"
		return out, nil
	}

	proposals, err := proposalsOf(answer.Slots)
	if err != nil {
		return out, err
	}

	exclude := append(replaced, supersededSlots(ctx, client, supersedes)...)
	written, err := r.applyWeek(ctx, client, export.BranchID, target, proposals, exclude, replaced)
	if err != nil {
		return out, err
	}

	out.status = entjob.StatusSucceeded
	out.slotsWritten = written
	out.detail = "wrote " + strconv.Itoa(written) + " lessons into draft version " +
		strconv.Itoa(target.Version) + "; publish it to put the week in force"
	return out, nil
}

func (r *Runner) applyWeek(ctx context.Context, client *tenantent.Client, branchID uuid.UUID,
	target *tenantent.Timetable, proposals []timetable.Proposal,
	exclude []uuid.UUID, replaced []uuid.UUID) (int, error) {

	report, err := timetable.New(client).Check(ctx, timetable.ClashQuery{
		BranchID:       branchID,
		TimetableID:    target.ID,
		Proposed:       proposals,
		ExcludeSlotIDs: exclude,
		Rules:          timetable.AllRules(),
	})
	if err != nil {
		return 0, err
	}
	if blocking := report.Blocking(); len(blocking) > 0 {
		return 0, &clashError{report: report}
	}

	unit, err := begin(ctx, client)
	if err != nil {
		return 0, err
	}
	if len(replaced) > 0 {
		if _, err := unit.writer.TimetableSlot.Delete().
			Where(entslot.IDIn(replaced...), entslot.TimetableID(target.ID)).
			Exec(ctx); err != nil {
			unit.rollback()
			return 0, err
		}
	}

	builders := make([]*tenantent.TimetableSlotCreate, 0, len(proposals))
	for _, proposal := range proposals {
		builders = append(builders, unit.writer.TimetableSlot.Create().
			SetTimetableID(target.ID).
			SetSectionID(proposal.SectionID).
			SetPeriodID(proposal.PeriodID).
			SetDayOfWeek(proposal.DayOfWeek).
			SetNillableSubjectOfferingID(proposal.SubjectOfferingID).
			SetNillableTeacherID(proposal.TeacherID).
			SetNillableRoomID(proposal.RoomID))
	}
	rows, err := unit.writer.TimetableSlot.CreateBulk(builders...).Save(ctx)
	if err != nil {
		unit.rollback()
		return 0, err
	}
	if err := unit.commit(); err != nil {
		return 0, err
	}
	return len(rows), nil
}

type unitOfWork struct {
	writer *tenantent.Client
	tx     *tenantent.Tx
}

func begin(ctx context.Context, client *tenantent.Client) (unitOfWork, error) {
	tx, err := client.Tx(ctx)
	if errors.Is(err, tenantent.ErrTxStarted) {
		return unitOfWork{writer: client}, nil
	}
	if err != nil {
		return unitOfWork{}, err
	}
	return unitOfWork{writer: tx.Client(), tx: tx}, nil
}

func (u unitOfWork) rollback() {
	if u.tx != nil {
		_ = u.tx.Rollback()
	}
}

func (u unitOfWork) commit() error {
	if u.tx == nil {
		return nil
	}
	return u.tx.Commit()
}

func supersededSlots(ctx context.Context, client *tenantent.Client,
	supersedes *tenantent.Timetable) []uuid.UUID {

	if supersedes == nil {
		return nil
	}
	ids, err := client.TimetableSlot.Query().
		Where(entslot.TimetableID(supersedes.ID)).
		IDs(ctx)
	if err != nil {
		return nil
	}
	return ids
}

func proposalsOf(slots []Slot) ([]timetable.Proposal, error) {
	out := make([]timetable.Proposal, 0, len(slots))
	for index, slot := range slots {
		ref := slot.Ref
		if ref == "" {
			ref = "s" + strconv.Itoa(index+1)
		}
		section, err := uuid.Parse(slot.SectionID)
		if err != nil {
			return nil, fmt.Errorf("%w: slot %s names section %q", ErrSolverUnreadable, ref, slot.SectionID)
		}
		period, err := uuid.Parse(slot.PeriodID)
		if err != nil {
			return nil, fmt.Errorf("%w: slot %s names period %q", ErrSolverUnreadable, ref, slot.PeriodID)
		}
		offering, err := uuid.Parse(slot.SubjectOfferingID)
		if err != nil {
			return nil, fmt.Errorf("%w: slot %s names subject offering %q", ErrSolverUnreadable, ref, slot.SubjectOfferingID)
		}
		if slot.DayOfWeek < 1 || slot.DayOfWeek > 7 {
			return nil, fmt.Errorf("%w: slot %s names day of week %d", ErrSolverUnreadable, ref, slot.DayOfWeek)
		}
		proposal := timetable.Proposal{
			Ref:               ref,
			SectionID:         section,
			PeriodID:          period,
			DayOfWeek:         slot.DayOfWeek,
			SubjectOfferingID: &offering,
		}
		if proposal.TeacherID, err = optionalID(slot.TeacherID); err != nil {
			return nil, fmt.Errorf("%w: slot %s names teacher %q", ErrSolverUnreadable, ref, *slot.TeacherID)
		}
		if proposal.RoomID, err = optionalID(slot.RoomID); err != nil {
			return nil, fmt.Errorf("%w: slot %s names room %q", ErrSolverUnreadable, ref, *slot.RoomID)
		}
		out = append(out, proposal)
	}
	return out, nil
}

func optionalID(raw *string) (*uuid.UUID, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	parsed, err := uuid.Parse(*raw)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func buildRequest(job *tenantent.TimetableGenerationJob, export *Export, hint bool,
	contact []DailyContact) Request {

	options := job.Options
	config := Config{
		MaxSeconds:       float64(job.MaxSeconds),
		Demand:           options.Demand,
		Pins:             options.Pins,
		RequiredRoomType: options.RequiredRoomType,
		HeavySubjects:    options.HeavySubjects,
		MinutesBasis:     options.MinutesBasis,
		Weights:          options.Weights,
		DailyContact:     contact,
	}
	if len(options.Unavailable) > 0 {
		config.Unavailable = map[string][]BlockedCell{}
		for teacher, cells := range options.Unavailable {
			blocked := make([]BlockedCell, 0, len(cells))
			for _, cell := range cells {
				blocked = append(blocked, BlockedCell{
					DayOfWeek: cell.DayOfWeek,
					PeriodID:  cell.PeriodID.String(),
				})
			}
			sort.Slice(blocked, func(i, j int) bool {
				if blocked[i].DayOfWeek != blocked[j].DayOfWeek {
					return blocked[i].DayOfWeek < blocked[j].DayOfWeek
				}
				return blocked[i].PeriodID < blocked[j].PeriodID
			})
			config.Unavailable[teacher] = blocked
		}
	}

	request := Request{
		RequestID: job.ID.String(),
		School:    export.School,
		Config:    config,
	}
	if hint && options.Hint {
		request.Hint = make([]Slot, 0, len(export.School.CurrentSlots))
		for _, slot := range export.School.CurrentSlots {
			request.Hint = append(request.Hint, Slot{
				SectionID:         slot.SectionID,
				DayOfWeek:         slot.DayOfWeek,
				PeriodID:          slot.PeriodID,
				SubjectOfferingID: slot.OfferingID,
				TeacherID:         slot.TeacherID,
				RoomID:            slot.RoomID,
			})
		}
	}
	return request
}

func failureOf(err error, held *outcome) *outcome {
	out := held
	if out == nil {
		out = &outcome{}
	}
	reason := entjob.FailureReasonInternal
	switch {
	case errors.Is(err, ErrNotDraft), errors.Is(err, ErrAlreadyFilled):
		reason = entjob.FailureReasonInvalid
	case errors.Is(err, ErrSolverUnreachable):
		reason = entjob.FailureReasonUnreachable
	case errors.Is(err, ErrSolverRejected), errors.Is(err, ErrSolverUnreadable):
		reason = entjob.FailureReasonRefused
	case errors.Is(err, ErrWeekClashes):
		reason = entjob.FailureReasonClash
	}
	out.status = entjob.StatusFailed
	out.reason = &reason
	out.detail = err.Error()
	return out
}

func (r *Runner) settle(ctx context.Context, client *tenantent.Client,
	job *tenantent.TimetableGenerationJob, out *outcome) error {

	if out == nil {
		out = &outcome{}
	}
	if out.status == "" {
		reason := entjob.FailureReasonInternal
		out.status = entjob.StatusFailed
		out.reason = &reason
		out.detail = "the generation ended without recording an outcome"
	}

	update := client.TimetableGenerationJob.UpdateOne(job).
		SetStatus(out.status).
		SetFinishedAt(r.now()).
		SetSlotsWritten(out.slotsWritten).
		SetWallTimeMs(out.wallTimeMS).
		SetNillableObjective(out.objective).
		SetCoreKeys(out.coreKeys).
		SetWarnings(out.warnings).
		SetSoftViolations(out.softViolations)

	if out.reason != nil {
		update = update.SetFailureReason(*out.reason)
	} else {
		update = update.ClearFailureReason()
	}
	if out.detail != "" {
		update = update.SetDetail(trim(out.detail, 2000))
	}
	if out.solverStatus != "" {
		update = update.SetSolverStatus(trim(out.solverStatus, 32))
	}
	if out.verdict != "" {
		update = update.SetVerdict(trim(out.verdict, 64))
	}

	if _, err := update.Save(ctx); err != nil {
		r.logger.Error("could not record the outcome of a timetable generation",
			"job", job.ID, "timetable", job.TimetableID, "status", out.status, "error", err)
		return err
	}

	r.logger.Info("timetable generation settled",
		"job", job.ID,
		"timetable", job.TimetableID,
		"status", string(out.status),
		"solver_status", out.solverStatus,
		"verdict", out.verdict,
		"slots", out.slotsWritten,
		"wall_ms", out.wallTimeMS,
		"warnings", len(out.warnings))
	return nil
}

func trim(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}
