package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/studentrecord"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entstudentassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentassignment"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

func (s *Server) listStudentAssignments(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := studentrecord.ParseStudentAssignmentFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentAssignmentsRead, authorization.StudentAssignmentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.StudentAssignment.Query().WithSection().WithSubjectOffering().
		Where(access.StudentAssignmentsFor(viewer, decision))

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
		"student_assignments": projected, "count": len(rows),
		"page": pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createStudentAssignment(w http.ResponseWriter, r *http.Request) {
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
		authorization.StudentAssignmentsWrite, authorization.StudentAssignmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entstudentassign.Columns, sent) {
		return
	}

	if in.AcademicSessionID == nil || in.StudentID == nil {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id and student_id are required")
		return
	}
	if in.RoleType == nil || *in.RoleType == "" {
		response.Error(w, http.StatusBadRequest,
			"role_type is required, for example class_monitor or house_captain")
		return
	}
	if !studentRoleAllowed(w, *in.RoleType) {
		return
	}
	from, to, ok := roleAssignmentDates(w, in)
	if !ok {
		return
	}

	assigner, ok := attributedToOptional(w, viewer, in.AssignedBy, "assigned_by")
	if !ok {
		return
	}

	create := client.StudentAssignment.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetStudentID(*in.StudentID).
		SetRoleType(*in.RoleType)

	if in.SectionID != nil {
		create = create.SetSectionID(*in.SectionID)
	}
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
		if err := entstudentassign.StatusValidator(entstudentassign.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, revoked or completed")
			return
		}
		create = create.SetStatus(entstudentassign.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "student assignment not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateStudentAssignment(w http.ResponseWriter, r *http.Request) {
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
		authorization.StudentAssignmentsWrite, authorization.StudentAssignmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := reachStudentAssignment(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "student assignment not found") {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entstudentassign.Columns, sent) {
		return
	}

	from, to, ok := roleAssignmentDates(w, in)
	if !ok {
		return
	}

	if in.RoleType != nil && !studentRoleAllowed(w, *in.RoleType) {
		return
	}

	update := client.StudentAssignment.Update().
		Where(entstudentassign.ID(id), access.StudentAssignmentsFor(viewer, decision)).
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
		if err := entstudentassign.StatusValidator(entstudentassign.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, revoked or completed")
			return
		}
		update = update.SetStatus(entstudentassign.Status(*in.Status))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "student assignment not found") {
		return
	}

	row, err := client.StudentAssignment.Query().Where(entstudentassign.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "student assignment not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteStudentAssignment(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "student assignment not found",
		authorization.StudentAssignmentsDelete, authorization.StudentAssignmentsDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.StudentAssignment.Delete().
				Where(entstudentassign.ID(id), access.StudentAssignmentsFor(v, d)).
				Exec(ctx)
		})
}
