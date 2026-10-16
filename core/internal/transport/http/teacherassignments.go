package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/studentrecord"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

func (s *Server) listTeacherAssignments(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := studentrecord.ParseTeacherAssignmentFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TeacherAssignmentsRead, authorization.TeacherAssignmentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.TeacherAssignment.Query().WithSection().WithSubjectOffering().
		Where(access.TeacherAssignmentsFor(viewer, decision))

	rows, err := filters.Apply(q).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"teacher_assignments": projected, "count": len(rows),
		"page": pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createTeacherAssignment(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in roleAssignmentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TeacherAssignmentsWrite, authorization.TeacherAssignmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entteacherassign.Columns, sent) {
		return
	}

	if in.AcademicSessionID == nil || in.TeacherID == nil || in.SectionID == nil {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id, teacher_id and section_id are required")
		return
	}
	if in.RoleType == nil || *in.RoleType == "" {
		response.Error(w, http.StatusBadRequest, "role_type is required")
		return
	}
	from, to, ok := roleAssignmentDates(w, in)
	if !ok {
		return
	}

	if viewer.Restricted() {
		response.Error(w, http.StatusForbidden,
			"creating a teaching assignment requires "+string(authorization.TeacherAssignmentsWriteAll))
		return
	}

	assigner, ok := attributedToOptional(w, viewer, in.AssignedBy, "assigned_by")
	if !ok {
		return
	}

	create := client.TeacherAssignment.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetTeacherID(*in.TeacherID).
		SetSectionID(*in.SectionID).
		SetRoleType(*in.RoleType)

	if in.SubjectOfferingID != nil {
		create = create.SetSubjectOfferingID(*in.SubjectOfferingID)
	}
	if in.IsPrimary != nil {
		create = create.SetIsPrimary(*in.IsPrimary)
	}
	if from != nil {
		create = create.SetValidFrom(*from)
	}
	if to != nil {
		create = create.SetValidTo(*to)
	}
	create = create.SetNillableAssignedBy(assigner)
	if in.Status != nil {
		if err := entteacherassign.StatusValidator(entteacherassign.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, revoked or completed")
			return
		}
		create = create.SetStatus(entteacherassign.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "teacher assignment not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateTeacherAssignment(w http.ResponseWriter, r *http.Request) {
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

	var in roleAssignmentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TeacherAssignmentsWrite, authorization.TeacherAssignmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := reachTeacherAssignment(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "teacher assignment not found") {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entteacherassign.Columns, sent) {
		return
	}

	from, to, ok := roleAssignmentDates(w, in)
	if !ok {
		return
	}

	update := client.TeacherAssignment.Update().
		Where(entteacherassign.ID(id), access.TeacherAssignmentsFor(viewer, decision)).
		SetNillableRoleType(in.RoleType)

	if in.SubjectOfferingID != nil {
		update = update.SetSubjectOfferingID(*in.SubjectOfferingID)
	}
	if in.IsPrimary != nil {
		update = update.SetIsPrimary(*in.IsPrimary)
	}
	if from != nil {
		update = update.SetValidFrom(*from)
	}
	if to != nil {
		update = update.SetValidTo(*to)
	}
	if in.Status != nil {
		if err := entteacherassign.StatusValidator(entteacherassign.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, revoked or completed")
			return
		}
		update = update.SetStatus(entteacherassign.Status(*in.Status))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "teacher assignment not found") {
		return
	}

	row, err := client.TeacherAssignment.Query().Where(entteacherassign.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "teacher assignment not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteTeacherAssignment(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "teacher assignment not found",
		authorization.TeacherAssignmentsDelete, authorization.TeacherAssignmentsDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.TeacherAssignment.Delete().
				Where(entteacherassign.ID(id), access.TeacherAssignmentsFor(v, d)).
				Exec(ctx)
		})
}
