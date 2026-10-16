package http

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/academic"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	enthouse "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/schoolhouse"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type sessionPayload struct {
	Name              *string         `json:"name"`
	Code              *string         `json:"code"`
	StartDate         *string         `json:"start_date"`
	EndDate           *string         `json:"end_date"`
	Status            *string         `json:"status"`
	IsCurrent         *bool           `json:"is_current"`
	PreviousSessionID *uuid.UUID      `json:"previous_session_id"`
	Settings          shared.Metadata `json:"settings_json"`
}

func (s *Server) listSessions(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := academic.ParseSessionFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := filters.Apply(client.AcademicSession.Query())
	rows, err := q.Order(tenantent.Desc(entsession.FieldStartDate)).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"academic_sessions": rows,
		"count":             len(rows),
		"page":              pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getSession(w http.ResponseWriter, r *http.Request) {
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

	row, err := client.AcademicSession.Get(ctx, id)
	if err != nil {
		writeTenantEntErr(w, err, "academic session not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in sessionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsession.Columns, sent) {
		return
	}
	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}
	start, end, ok := sessionDates(w, in)
	if !ok {
		return
	}

	create := client.AcademicSession.Create().
		SetName(*in.Name).
		SetCode(*in.Code).
		SetStartDate(*start).
		SetEndDate(*end)

	if in.PreviousSessionID != nil {
		create = create.SetPreviousSessionID(*in.PreviousSessionID)
	}
	if in.Settings != nil {
		create = create.SetSettingsJSON(in.Settings)
	}
	if in.Status != nil {
		if err := entsession.StatusValidator(entsession.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be upcoming, active or closed")
			return
		}
		create = create.SetStatus(entsession.Status(*in.Status))
	}
	if in.IsCurrent != nil {
		create = create.SetIsCurrent(*in.IsCurrent)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "academic session not found")
		return
	}
	if in.IsCurrent != nil && *in.IsCurrent {
		if err := demoteOtherSessions(ctx, client, row.ID); err != nil {
			response.ServerError(w, err)
			return
		}
	}

	w.Header().Set("Location", "/api/v1/academic-sessions/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateSession(w http.ResponseWriter, r *http.Request) {
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

	var in sessionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsession.Columns, sent) {
		return
	}

	start, err := parseDate(in.StartDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "start_date must be YYYY-MM-DD")
		return
	}
	end, err := parseDate(in.EndDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "end_date must be YYYY-MM-DD")
		return
	}

	update := client.AcademicSession.UpdateOneID(id).SetNillableName(in.Name)
	if start != nil {
		update = update.SetStartDate(*start)
	}
	if end != nil {
		update = update.SetEndDate(*end)
	}
	if in.PreviousSessionID != nil {
		update = update.SetPreviousSessionID(*in.PreviousSessionID)
	}
	if in.Settings != nil {
		update = update.SetSettingsJSON(in.Settings)
	}
	if in.Status != nil {
		if err := entsession.StatusValidator(entsession.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be upcoming, active or closed")
			return
		}
		update = update.SetStatus(entsession.Status(*in.Status))
	}
	if in.IsCurrent != nil {
		update = update.SetIsCurrent(*in.IsCurrent)
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "academic session not found")
		return
	}
	if in.IsCurrent != nil && *in.IsCurrent {
		if err := demoteOtherSessions(ctx, client, row.ID); err != nil {
			response.ServerError(w, err)
			return
		}
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, "academic session not found",
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.AcademicSession.DeleteOneID(id).Exec(ctx)
		})
}

func sessionDates(w http.ResponseWriter, in sessionPayload) (*time.Time, *time.Time, bool) {
	start, err := parseDate(in.StartDate)
	if err != nil || start == nil {
		response.Error(w, http.StatusBadRequest, "start_date is required, as YYYY-MM-DD")
		return nil, nil, false
	}
	end, err := parseDate(in.EndDate)
	if err != nil || end == nil {
		response.Error(w, http.StatusBadRequest, "end_date is required, as YYYY-MM-DD")
		return nil, nil, false
	}
	if !end.After(*start) {
		response.Error(w, http.StatusUnprocessableEntity, "end_date must be after start_date")
		return nil, nil, false
	}
	return start, end, true
}

func demoteOtherSessions(ctx context.Context, client *tenantent.Client, id uuid.UUID) error {
	_, err := client.AcademicSession.Update().
		Where(entsession.IDNEQ(id), entsession.IsCurrent(true)).
		SetIsCurrent(false).
		Save(ctx)
	return err
}

type gradeLevelPayload struct {
	Name           *string `json:"name"`
	Code           *string `json:"code"`
	Sequence       *int    `json:"sequence"`
	EducationStage *string `json:"education_stage"`
	Status         *string `json:"status"`
}

func (s *Server) listGradeLevels(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := academic.ParseGradeLevelFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := filters.Apply(client.GradeLevel.Query())
	rows, err := q.Order(tenantent.Asc(entgrade.FieldSequence)).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"grade_levels": rows,
		"count":        len(rows),
		"page":         pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createGradeLevel(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in gradeLevelPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entgrade.Columns, sent) {
		return
	}
	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}
	if in.Sequence == nil {
		response.Error(w, http.StatusBadRequest, "sequence is required: it drives promotion order")
		return
	}

	create := client.GradeLevel.Create().
		SetName(*in.Name).
		SetCode(*in.Code).
		SetSequence(*in.Sequence).
		SetNillableEducationStage(in.EducationStage)

	if in.Status != nil {
		if err := entgrade.StatusValidator(entgrade.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entgrade.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "grade level not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateGradeLevel(w http.ResponseWriter, r *http.Request) {
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

	var in gradeLevelPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entgrade.Columns, sent) {
		return
	}

	update := client.GradeLevel.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableEducationStage(in.EducationStage)
	if in.Sequence != nil {
		update = update.SetSequence(*in.Sequence)
	}
	if in.Status != nil {
		if err := entgrade.StatusValidator(entgrade.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entgrade.Status(*in.Status))
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "grade level not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteGradeLevel(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, "grade level not found",
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.GradeLevel.DeleteOneID(id).Exec(ctx)
		})
}

type housePayload struct {
	Name          *string         `json:"name"`
	Code          *string         `json:"code"`
	DisplayConfig shared.Metadata `json:"display_config_json"`
	Status        *string         `json:"status"`
}

func (s *Server) listHouses(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := academic.ParseHouseFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := filters.Apply(client.SchoolHouse.Query())
	rows, err := q.Order(tenantent.Asc(enthouse.FieldName)).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"school_houses": rows,
		"count":         len(rows),
		"page":          pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createHouse(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in housePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, enthouse.Columns, sent) {
		return
	}
	if in.Name == nil || *in.Name == "" {
		response.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	create := client.SchoolHouse.Create().
		SetName(*in.Name).
		SetNillableCode(in.Code)
	if in.DisplayConfig != nil {
		create = create.SetDisplayConfigJSON(in.DisplayConfig)
	}
	if in.Status != nil {
		if err := enthouse.StatusValidator(enthouse.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(enthouse.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "house not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateHouse(w http.ResponseWriter, r *http.Request) {
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

	var in housePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, enthouse.Columns, sent) {
		return
	}

	update := client.SchoolHouse.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableCode(in.Code)
	if in.DisplayConfig != nil {
		update = update.SetDisplayConfigJSON(in.DisplayConfig)
	}
	if in.Status != nil {
		if err := enthouse.StatusValidator(enthouse.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(enthouse.Status(*in.Status))
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "house not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteHouse(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, "house not found",
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.SchoolHouse.DeleteOneID(id).Exec(ctx)
		})
}
