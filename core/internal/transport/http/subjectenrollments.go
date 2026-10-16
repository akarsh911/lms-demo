package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/enrollment"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entarm "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/electivegroupoffering"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type subjectEnrollmentPayload struct {
	StudentEnrollmentID *uuid.UUID `json:"student_enrollment_id"`
	SubjectOfferingID   *uuid.UUID `json:"subject_offering_id"`
	IsElectiveChoice    *bool      `json:"is_elective_choice"`
	EnrolledOn          *string    `json:"enrolled_on"`
	DroppedOn           *string    `json:"dropped_on"`
	Status              *string    `json:"status"`
}

func (s *Server) listSubjectEnrollments(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	filters, err := enrollment.ParseSubjectFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.SubjectEnrollmentsRead, authorization.SubjectEnrollmentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := enrollment.NewSubject(ctx).
		ForViewer(viewer, decision).
		ApplyFilters(filters).
		Basic().
		All()
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
		"subject_enrollments": projected, "count": len(rows),
		"page": pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createSubjectEnrollment(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in subjectEnrollmentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.SubjectEnrollmentsWrite, authorization.SubjectEnrollmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsubjenroll.Columns, sent) {
		return
	}

	if in.StudentEnrollmentID == nil || in.SubjectOfferingID == nil {
		response.Error(w, http.StatusBadRequest,
			"student_enrollment_id and subject_offering_id are required")
		return
	}

	enrollment, err := client.StudentEnrollment.Get(ctx, *in.StudentEnrollmentID)
	if err != nil {
		writeTenantEntErr(w, err, "student enrollment not found")
		return
	}

	offering, err := client.SubjectOffering.Get(ctx, *in.SubjectOfferingID)
	if err != nil {
		writeTenantEntErr(w, err, "subject offering not found")
		return
	}
	if offering.SectionID != enrollment.SectionID {
		response.Error(w, http.StatusBadRequest,
			"that subject offering belongs to a different section than the student's enrollment")
		return
	}
	if offering.AcademicSessionID != enrollment.AcademicSessionID {
		response.Error(w, http.StatusBadRequest,
			"that subject offering belongs to a different academic session")
		return
	}

	enrolled, err := parseDate(in.EnrolledOn)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "enrolled_on must be YYYY-MM-DD")
		return
	}
	dropped, err := parseDate(in.DroppedOn)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "dropped_on must be YYYY-MM-DD")
		return
	}

	status := entsubjenroll.DefaultStatus
	if in.Status != nil {
		if err := entsubjenroll.StatusValidator(entsubjenroll.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, dropped or completed")
			return
		}
		status = entsubjenroll.Status(*in.Status)
	}

	if status == entsubjenroll.StatusActive &&
		!holdsNoOtherArm(w, ctx, client, enrollment.ID, offering.ID, uuid.Nil) {
		return
	}

	create := client.StudentSubjectEnrollment.Create().
		SetStudentEnrollmentID(enrollment.ID).
		SetSubjectOfferingID(offering.ID).
		SetStudentID(enrollment.StudentID).
		SetAcademicSessionID(enrollment.AcademicSessionID).
		SetStatus(status)

	if in.IsElectiveChoice != nil {
		create = create.SetIsElectiveChoice(*in.IsElectiveChoice)
	}
	if enrolled != nil {
		create = create.SetEnrolledOn(*enrolled)
	}
	if dropped != nil {
		create = create.SetDroppedOn(*dropped)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "subject enrollment not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateSubjectEnrollment(w http.ResponseWriter, r *http.Request) {
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

	var in subjectEnrollmentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.SubjectEnrollmentsWrite, authorization.SubjectEnrollmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsubjenroll.Columns, sent) {
		return
	}

	found, err := reachSubjectEnrollment(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "subject enrollment not found") {
		return
	}

	dropped, err := parseDate(in.DroppedOn)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "dropped_on must be YYYY-MM-DD")
		return
	}

	if in.Status != nil && entsubjenroll.Status(*in.Status) == entsubjenroll.StatusActive {
		current, err := client.StudentSubjectEnrollment.Query().
			Where(entsubjenroll.ID(id), access.SubjectEnrollmentsFor(viewer, decision)).
			Only(ctx)
		if err != nil {
			writeTenantEntErr(w, err, "subject enrollment not found")
			return
		}
		if !holdsNoOtherArm(w, ctx, client,
			current.StudentEnrollmentID, current.SubjectOfferingID, current.ID) {
			return
		}
	}

	update := client.StudentSubjectEnrollment.Update().
		Where(entsubjenroll.ID(id), access.SubjectEnrollmentsFor(viewer, decision))

	if in.IsElectiveChoice != nil {
		update = update.SetIsElectiveChoice(*in.IsElectiveChoice)
	}
	if dropped != nil {
		update = update.SetDroppedOn(*dropped)
	}
	if in.Status != nil {
		if err := entsubjenroll.StatusValidator(entsubjenroll.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, dropped or completed")
			return
		}
		update = update.SetStatus(entsubjenroll.Status(*in.Status))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "subject enrollment not found") {
		return
	}

	row, err := client.StudentSubjectEnrollment.Query().Where(entsubjenroll.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "subject enrollment not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func holdsNoOtherArm(w http.ResponseWriter, ctx context.Context, client *tenantent.Client,
	enrollmentID, offeringID, excluding uuid.UUID) bool {

	arm, err := client.ElectiveGroupOffering.Query().
		Where(entarm.SubjectOfferingID(offeringID)).
		Only(ctx)
	if tenantent.IsNotFound(err) {
		return true
	}
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}

	arms, err := electiveArms(ctx, client, arm.ElectiveGroupID)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}

	held, err := activeArm(ctx, client, enrollmentID, arms)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if held == nil || held.ID == excluding || held.SubjectOfferingID == offeringID {
		return true
	}

	response.Error(w, http.StatusConflict,
		"that pupil already holds arm "+held.SubjectOfferingID.String()+" of elective group "+
			arm.ElectiveGroupID.String()+"; a pupil may hold one arm of an elective group, so "+
			"move them with PATCH /api/v1/elective-groups/"+arm.ElectiveGroupID.String()+
			"/choices/"+enrollmentID.String()+" rather than enrolling them in a second")
	return false
}

func (s *Server) deleteSubjectEnrollment(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "subject enrollment not found",
		authorization.SubjectEnrollmentsDelete, authorization.SubjectEnrollmentsDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.StudentSubjectEnrollment.Delete().
				Where(entsubjenroll.ID(id), access.SubjectEnrollmentsFor(v, d)).
				Exec(ctx)
		})
}
