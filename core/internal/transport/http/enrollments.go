package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/enrollment"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type enrollmentPayload struct {
	StudentID            *uuid.UUID `json:"student_id"`
	AcademicSessionID    *uuid.UUID `json:"academic_session_id"`
	SectionID            *uuid.UUID `json:"section_id"`
	RollNumber           *string    `json:"roll_number"`
	EnrollmentNumber     *string    `json:"enrollment_number"`
	EnrollmentDate       *string    `json:"enrollment_date"`
	ExitDate             *string    `json:"exit_date"`
	PromotionStatus      *string    `json:"promotion_status"`
	Status               *string    `json:"status"`
	PreviousEnrollmentID *uuid.UUID `json:"previous_enrollment_id"`
}

func (s *Server) listEnrollments(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	filters, err := enrollment.ParseFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.EnrollmentsRead, authorization.EnrollmentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := enrollment.New(ctx).
		ForViewer(viewer, decision).
		ApplyFilters(filters).
		Basic().
		ByRollNumber().
		All()
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, ok := s.enrollmentProjection(w, r, rows, decision)
	if !ok {
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"enrollments": projected, "count": len(rows),
		"page": pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getEnrollment(w http.ResponseWriter, r *http.Request) {
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
		authorization.EnrollmentsRead, authorization.EnrollmentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.StudentEnrollment.Query().Where(entenrollment.ID(id))
	if viewer.Restricted() {
		q = q.Where(entenrollment.HasStudentWith(access.StudentsForAcademic(viewer, decision)))
	}

	row, err := q.WithSection().WithStudent().WithAcademicSession().Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "enrollment not found")
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createEnrollment(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in enrollmentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.EnrollmentsWrite, authorization.EnrollmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entenrollment.Columns, sent) {
		return
	}

	if in.StudentID == nil || in.AcademicSessionID == nil || in.SectionID == nil {
		response.Error(w, http.StatusBadRequest,
			"student_id, academic_session_id and section_id are required")
		return
	}

	enrolled, err := parseDate(in.EnrollmentDate)
	if err != nil || enrolled == nil {
		response.Error(w, http.StatusBadRequest, "enrollment_date is required, as YYYY-MM-DD")
		return
	}
	exit, err := parseDate(in.ExitDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "exit_date must be YYYY-MM-DD")
		return
	}

	create := client.StudentEnrollment.Create().
		SetStudentID(*in.StudentID).
		SetAcademicSessionID(*in.AcademicSessionID).
		SetSectionID(*in.SectionID).
		SetEnrollmentDate(*enrolled).
		SetNillableRollNumber(in.RollNumber).
		SetNillableEnrollmentNumber(in.EnrollmentNumber)

	if exit != nil {
		create = create.SetExitDate(*exit)
	}
	if in.PreviousEnrollmentID != nil {
		create = create.SetPreviousEnrollmentID(*in.PreviousEnrollmentID)
	}
	if in.PromotionStatus != nil {
		kind := entenrollment.PromotionStatus(*in.PromotionStatus)
		if err := entenrollment.PromotionStatusValidator(kind); err != nil {
			response.Error(w, http.StatusBadRequest,
				"promotion_status must be promoted, retained or withdrawn")
			return
		}
		create = create.SetPromotionStatus(kind)
	}
	if in.Status != nil {
		if err := entenrollment.StatusValidator(entenrollment.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, completed or withdrawn")
			return
		}
		create = create.SetStatus(entenrollment.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "enrollment not found")
		return
	}
	w.Header().Set("Location", "/api/v1/enrollments/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateEnrollment(w http.ResponseWriter, r *http.Request) {
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

	var in enrollmentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.EnrollmentsWrite, authorization.EnrollmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entenrollment.Columns, sent) {
		return
	}

	found, err := reachEnrollment(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "enrollment not found") {
		return
	}

	exit, err := parseDate(in.ExitDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "exit_date must be YYYY-MM-DD")
		return
	}

	update := client.StudentEnrollment.Update().
		Where(entenrollment.ID(id), access.EnrollmentsFor(viewer, decision)).
		SetNillableRollNumber(in.RollNumber).
		SetNillableEnrollmentNumber(in.EnrollmentNumber)

	if in.SectionID != nil {
		update = update.SetSectionID(*in.SectionID)
	}
	if exit != nil {
		update = update.SetExitDate(*exit)
	}
	if in.PromotionStatus != nil {
		kind := entenrollment.PromotionStatus(*in.PromotionStatus)
		if err := entenrollment.PromotionStatusValidator(kind); err != nil {
			response.Error(w, http.StatusBadRequest,
				"promotion_status must be promoted, retained or withdrawn")
			return
		}
		update = update.SetPromotionStatus(kind)
	}
	if in.Status != nil {
		if err := entenrollment.StatusValidator(entenrollment.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, completed or withdrawn")
			return
		}
		update = update.SetStatus(entenrollment.Status(*in.Status))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "enrollment not found") {
		return
	}

	row, err := client.StudentEnrollment.Query().Where(entenrollment.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "enrollment not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteEnrollment(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "enrollment not found",
		authorization.EnrollmentsDelete, authorization.EnrollmentsDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.StudentEnrollment.Delete().
				Where(entenrollment.ID(id), access.EnrollmentsFor(v, d)).
				Exec(ctx)
		})
}
