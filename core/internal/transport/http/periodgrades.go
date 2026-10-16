package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbell "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellschedule"
	entbellperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellscheduleperiod"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	entschemegrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodschemegradelevel"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	schemeGradeNotFound = "period scheme grade level not found"
	schemeGradeTaken    = "grade_level_taken"
)

type schemeGradePayload struct {
	GradeLevelIDs []uuid.UUID `json:"grade_level_ids"`
}

type clonePayload struct {
	Name          *string     `json:"name"`
	Code          *string     `json:"code"`
	GradeLevelIDs []uuid.UUID `json:"grade_level_ids"`
}

func (s *Server) listSchemeGradeLevels(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.PeriodScheme.Query().
		Where(entscheme.ID(id), access.PeriodSchemesFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableSchemeNotFound) {
		return
	}

	rows, err := client.PeriodSchemeGradeLevel.Query().
		Where(entschemegrade.PeriodSchemeID(id)).
		WithGradeLevel().
		Order(tenantent.Asc(entschemegrade.FieldGradeLevelID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"grade_levels": projected,
		"count":        len(rows),
	})
}

func (s *Server) attachSchemeGradeLevels(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in schemeGradePayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if len(in.GradeLevelIDs) == 0 {
		response.Error(w, http.StatusBadRequest, "grade_level_ids is required")
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	scheme, err := client.PeriodScheme.Query().
		Where(entscheme.ID(id), access.PeriodSchemesWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			response.Error(w, http.StatusNotFound, timetableSchemeNotFound)
			return
		}
		writeTenancyErr(w, err)
		return
	}

	wanted := dedupeIDs(in.GradeLevelIDs)
	known, err := client.GradeLevel.Query().Where(entgrade.IDIn(wanted...)).IDs(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if len(known) != len(wanted) {
		response.Error(w, http.StatusUnprocessableEntity,
			"one of the grade levels named does not exist")
		return
	}

	taken, err := client.PeriodSchemeGradeLevel.Query().
		Where(
			entschemegrade.AcademicSessionID(scheme.AcademicSessionID),
			entschemegrade.BranchID(scheme.BranchID),
			entschemegrade.GradeLevelIDIn(wanted...),
			entschemegrade.PeriodSchemeIDNEQ(scheme.ID),
		).
		WithGradeLevel().
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if len(taken) > 0 {
		names := make([]string, 0, len(taken))
		for _, row := range taken {
			if row.Edges.GradeLevel != nil {
				names = append(names, row.Edges.GradeLevel.Name)
			}
		}
		response.JSON(w, http.StatusConflict, response.Envelope{
			"error":   schemeGradeTaken,
			"message": "these grade levels already run another period scheme on this campus; detach them first",
			"grades":  names,
		})
		return
	}

	created, err := linkSchemeGrades(ctx, client, scheme, wanted)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	response.JSON(w, http.StatusCreated, response.Envelope{
		"attached": created,
		"count":    created,
	})
}

func linkSchemeGrades(ctx context.Context, client *tenantent.Client,
	scheme *tenantent.PeriodScheme, grades []uuid.UUID) (int, error) {

	rows, err := client.PeriodSchemeGradeLevel.Query().
		Where(entschemegrade.PeriodSchemeID(scheme.ID), entschemegrade.GradeLevelIDIn(grades...)).
		All(ctx)
	if err != nil {
		return 0, err
	}
	held := make(map[uuid.UUID]bool, len(rows))
	for _, row := range rows {
		held[row.GradeLevelID] = true
	}

	builders := make([]*tenantent.PeriodSchemeGradeLevelCreate, 0, len(grades))
	for _, grade := range grades {
		if held[grade] {
			continue
		}
		builders = append(builders, client.PeriodSchemeGradeLevel.Create().
			SetPeriodSchemeID(scheme.ID).
			SetGradeLevelID(grade).
			SetAcademicSessionID(scheme.AcademicSessionID).
			SetBranchID(scheme.BranchID))
	}
	if len(builders) == 0 {
		return 0, nil
	}
	if err := client.PeriodSchemeGradeLevel.CreateBulk(builders...).Exec(ctx); err != nil {
		return 0, err
	}
	return len(builders), nil
}

func (s *Server) detachSchemeGradeLevel(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableDelete, authorization.TimetableDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	n, err := client.PeriodSchemeGradeLevel.Delete().
		Where(
			entschemegrade.ID(id),
			entschemegrade.HasPeriodSchemeWith(access.PeriodSchemesWritableBy(viewer, decision)),
		).
		Exec(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, schemeGradeNotFound)
		return
	}
	response.JSON(w, http.StatusNoContent, nil)
}

func (s *Server) clonePeriodScheme(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in clonePayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	source, err := client.PeriodScheme.Query().
		Where(entscheme.ID(id), access.PeriodSchemesWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			response.Error(w, http.StatusNotFound, timetableSchemeNotFound)
			return
		}
		writeTenancyErr(w, err)
		return
	}

	wanted := dedupeIDs(in.GradeLevelIDs)
	if len(wanted) > 0 {
		taken, err := client.PeriodSchemeGradeLevel.Query().
			Where(
				entschemegrade.AcademicSessionID(source.AcademicSessionID),
				entschemegrade.BranchID(source.BranchID),
				entschemegrade.GradeLevelIDIn(wanted...),
			).
			Exist(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return
		}
		if taken {
			response.JSON(w, http.StatusConflict, response.Envelope{
				"error":   schemeGradeTaken,
				"message": "one of these grade levels already runs a period scheme on this campus; detach it first",
			})
			return
		}
	}

	clone, err := copyScheme(ctx, client, source, *in.Name, *in.Code, wanted)
	if err != nil {
		if tenantent.IsConstraintError(err) {
			response.Error(w, http.StatusConflict,
				"a period scheme with that code already exists on this campus")
			return
		}
		writeTenancyErr(w, err)
		return
	}

	projected, err := project(clone, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, response.Envelope{"period_scheme": projected})
}

func copyScheme(ctx context.Context, client *tenantent.Client,
	source *tenantent.PeriodScheme, name, code string,
	grades []uuid.UUID) (*tenantent.PeriodScheme, error) {

	tx, err := client.Tx(ctx)
	if err != nil {
		return nil, err
	}

	clone, err := copySchemeInTx(ctx, tx, source, name, code, grades)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return clone, nil
}

func copySchemeInTx(ctx context.Context, tx *tenantent.Tx, source *tenantent.PeriodScheme,
	name, code string, grades []uuid.UUID) (*tenantent.PeriodScheme, error) {

	create := tx.PeriodScheme.Create().
		SetAcademicSessionID(source.AcademicSessionID).
		SetBranchID(source.BranchID).
		SetName(name).
		SetCode(code).
		SetStatus(source.Status)
	if source.Description != nil {
		create = create.SetDescription(*source.Description)
	}
	clone, err := create.Save(ctx)
	if err != nil {
		return nil, err
	}

	periods, err := tx.Period.Query().
		Where(entperiod.PeriodSchemeID(source.ID)).
		Order(tenantent.Asc(entperiod.FieldSequence)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	periodMap := make(map[uuid.UUID]uuid.UUID, len(periods))
	for _, period := range periods {
		made, err := tx.Period.Create().
			SetPeriodSchemeID(clone.ID).
			SetName(period.Name).
			SetCode(period.Code).
			SetSequence(period.Sequence).
			SetKind(period.Kind).
			SetStatus(period.Status).
			Save(ctx)
		if err != nil {
			return nil, err
		}
		periodMap[period.ID] = made.ID
	}

	bells, err := tx.BellSchedule.Query().
		Where(entbell.PeriodSchemeID(source.ID)).
		Order(tenantent.Asc(entbell.FieldCode)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	for _, bell := range bells {
		madeBell, err := tx.BellSchedule.Create().
			SetPeriodSchemeID(clone.ID).
			SetName(bell.Name).
			SetCode(bell.Code).
			SetIsDefault(bell.IsDefault).
			SetStatus(bell.Status).
			Save(ctx)
		if err != nil {
			return nil, err
		}

		spans, err := tx.BellSchedulePeriod.Query().
			Where(entbellperiod.BellScheduleID(bell.ID)).
			All(ctx)
		if err != nil {
			return nil, err
		}

		builders := make([]*tenantent.BellSchedulePeriodCreate, 0, len(spans))
		for _, span := range spans {
			target, known := periodMap[span.PeriodID]
			if !known {
				continue
			}
			builders = append(builders, tx.BellSchedulePeriod.Create().
				SetBellScheduleID(madeBell.ID).
				SetPeriodID(target).
				SetStartMinute(span.StartMinute).
				SetEndMinute(span.EndMinute).
				SetRuns(span.Runs))
		}
		if len(builders) > 0 {
			if err := tx.BellSchedulePeriod.CreateBulk(builders...).Exec(ctx); err != nil {
				return nil, err
			}
		}
	}

	for _, grade := range grades {
		if _, err := tx.PeriodSchemeGradeLevel.Create().
			SetPeriodSchemeID(clone.ID).
			SetGradeLevelID(grade).
			SetAcademicSessionID(clone.AcademicSessionID).
			SetBranchID(clone.BranchID).
			Save(ctx); err != nil {
			return nil, err
		}
	}

	return clone, nil
}

func dedupeIDs(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]bool, len(ids))
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}
