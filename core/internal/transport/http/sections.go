package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/academic"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

func routeDecision(w http.ResponseWriter, r *http.Request) (authorization.Decision, bool) {
	decision, ok := authorization.DecisionFrom(r.Context())
	if !ok {
		observability.Decision(r.Context(), false, "write refused with no decision in context",
			"path", r.URL.Path)
		response.Error(w, http.StatusForbidden, "not permitted: no authorization decision was reached")
		return authorization.Decision{}, false
	}
	return decision, true
}

type sectionPayload struct {
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	BranchID          *uuid.UUID `json:"branch_id"`
	GradeLevelID      *uuid.UUID `json:"grade_level_id"`
	Name              *string    `json:"name"`
	Code              *string    `json:"code"`
	Capacity          *int       `json:"capacity"`
	RoomID            *uuid.UUID `json:"room_id"`
	ClassTeacherID    *uuid.UUID `json:"class_teacher_id"`
	Status            *string    `json:"status"`
}

func (s *Server) listSections(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := academic.ParseSectionFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := filters.Apply(client.Section.Query().WithGradeLevel().WithBranch())
	rows, err := q.Order(tenantent.Asc(entsection.FieldCode)).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"sections": rows,
		"count":    len(rows),
		"page":     pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getSection(w http.ResponseWriter, r *http.Request) {
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

	row, err := client.Section.Query().
		Where(entsection.ID(id)).
		WithGradeLevel().WithBranch().WithAcademicSession().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "section not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) createSection(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in sectionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsection.Columns, sent) {
		return
	}
	if in.AcademicSessionID == nil || in.BranchID == nil || in.GradeLevelID == nil {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id, branch_id and grade_level_id are required")
		return
	}
	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}

	create := client.Section.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetBranchID(*in.BranchID).
		SetGradeLevelID(*in.GradeLevelID).
		SetName(*in.Name).
		SetCode(*in.Code)

	if in.Capacity != nil {
		create = create.SetCapacity(*in.Capacity)
	}
	if in.RoomID != nil {
		create = create.SetRoomID(*in.RoomID)
	}
	if in.ClassTeacherID != nil {
		create = create.SetClassTeacherID(*in.ClassTeacherID)
	}
	if in.Status != nil {
		if err := entsection.StatusValidator(entsection.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entsection.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "section not found")
		return
	}
	w.Header().Set("Location", "/api/v1/sections/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateSection(w http.ResponseWriter, r *http.Request) {
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

	var in sectionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsection.Columns, sent) {
		return
	}
	if !rejectNull(w, sent, entsection.FieldName, in.Name) ||
		!rejectNull(w, sent, entsection.FieldCode, in.Code) ||
		!rejectNull(w, sent, entsection.FieldStatus, in.Status) {
		return
	}

	update := client.Section.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableCode(in.Code)

	if in.Capacity != nil {
		update = update.SetCapacity(*in.Capacity)
	}
	if wasCleared(sent, entsection.FieldCapacity, in.Capacity) {
		update = update.ClearCapacity()
	}
	if in.RoomID != nil {
		update = update.SetRoomID(*in.RoomID)
	}
	if wasCleared(sent, entsection.FieldRoomID, in.RoomID) {
		update = update.ClearRoomID()
	}
	if in.ClassTeacherID != nil {
		update = update.SetClassTeacherID(*in.ClassTeacherID)
	}
	if wasCleared(sent, entsection.FieldClassTeacherID, in.ClassTeacherID) {
		update = update.ClearClassTeacherID()
	}
	if in.Status != nil {
		if err := entsection.StatusValidator(entsection.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entsection.Status(*in.Status))
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "section not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteSection(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, "section not found",
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.Section.DeleteOneID(id).Exec(ctx)
		})
}
