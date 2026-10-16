package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/school"
	"github.com/Harbour-Emerge/emerge-core/internal/data/student"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type studentPayload struct {
	PersonID         *uuid.UUID        `json:"person_id"`
	Person           *newPersonPayload `json:"person"`
	AdmissionNumber  *string           `json:"admission_number"`
	StudentCode      *string           `json:"student_code"`
	AdmissionDate    *string           `json:"admission_date"`
	Status           *string           `json:"status"`
	WithdrawalDate   *string           `json:"withdrawal_date"`
	WithdrawalReason *string           `json:"withdrawal_reason"`
	HouseID          *uuid.UUID        `json:"house_id"`
}

func (s *Server) listStudents(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	sc, err := school.From(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := student.ParseFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentsRead, authorization.StudentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := sc.Students(ctx).
		ForViewer(viewer, decision).
		ApplyFilters(filters).
		Basic().
		Newest().
		All()
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, ok := s.studentProjection(w, r, rows, decision)
	if !ok {
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"school":   sc.Tenant.Code,
		"students": projected,
		"count":    len(rows),
		"page":     pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getStudent(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	sc, err := school.From(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentsRead, authorization.StudentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := sc.Students(ctx).ByID(id).ForViewer(viewer, decision).Basic().Only()
	if err != nil {
		writeTenantEntErr(w, err, "student not found")
		return
	}

	projected, ok := s.studentProjection(w, r, []*tenantent.Student{row}, decision)
	if !ok {
		return
	}
	if rows, is := projected.([]any); is {
		if len(rows) == 0 {
			response.Error(w, http.StatusNotFound, "student not found")
			return
		}
		response.JSON(w, http.StatusOK, rows[0])
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) createStudent(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in studentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.StudentsCreate, authorization.StudentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entstudent.Columns, withoutPerson(sent)) {
		return
	}

	personID, ok := s.personIDFor(w, r, client, in.PersonID, in.Person)
	if !ok {
		return
	}
	if in.AdmissionNumber == nil || *in.AdmissionNumber == "" {
		response.Error(w, http.StatusBadRequest, "admission_number is required")
		return
	}

	admission, err := parseDate(in.AdmissionDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "admission_date must be YYYY-MM-DD")
		return
	}
	withdrawal, err := parseDate(in.WithdrawalDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "withdrawal_date must be YYYY-MM-DD")
		return
	}

	create := client.Student.Create().
		SetPersonID(personID).
		SetAdmissionNumber(*in.AdmissionNumber).
		SetNillableStudentCode(in.StudentCode).
		SetNillableWithdrawalReason(in.WithdrawalReason)

	if admission != nil {
		create = create.SetAdmissionDate(*admission)
	}
	if withdrawal != nil {
		create = create.SetWithdrawalDate(*withdrawal)
	}
	if in.HouseID != nil {
		create = create.SetHouseID(*in.HouseID)
	}
	if in.Status != nil {
		if err := entstudent.StatusValidator(entstudent.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, alumni or withdrawn")
			return
		}
		create = create.SetStatus(entstudent.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "student not found")
		return
	}
	w.Header().Set("Location", "/api/v1/students/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateStudent(w http.ResponseWriter, r *http.Request) {
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

	var in studentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentsWrite, authorization.StudentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := reachStudent(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "student not found") {
		return
	}
	writable, ok := s.studentWriteFields(w, r, id, decision)
	if !ok {
		return
	}
	if !rejectInlinePerson(w, in.Person) {
		return
	}
	if !rejectFields(w, r, writable, decision.Rule, entstudent.Columns, withoutPerson(sent)) {
		return
	}

	admission, err := parseDate(in.AdmissionDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "admission_date must be YYYY-MM-DD")
		return
	}
	withdrawal, err := parseDate(in.WithdrawalDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "withdrawal_date must be YYYY-MM-DD")
		return
	}
	if !rejectNull(w, sent, entstudent.FieldStatus, in.Status) {
		return
	}

	update := client.Student.Update().
		Where(entstudent.ID(id), access.StudentsFor(viewer, decision)).
		SetNillableStudentCode(in.StudentCode).
		SetNillableWithdrawalReason(in.WithdrawalReason)

	if wasCleared(sent, entstudent.FieldStudentCode, in.StudentCode) {
		update = update.ClearStudentCode()
	}
	if wasCleared(sent, entstudent.FieldWithdrawalReason, in.WithdrawalReason) {
		update = update.ClearWithdrawalReason()
	}
	if admission != nil {
		update = update.SetAdmissionDate(*admission)
	}
	if wasCleared(sent, entstudent.FieldAdmissionDate, in.AdmissionDate) {
		update = update.ClearAdmissionDate()
	}
	if withdrawal != nil {
		update = update.SetWithdrawalDate(*withdrawal)
	}
	if wasCleared(sent, entstudent.FieldWithdrawalDate, in.WithdrawalDate) {
		update = update.ClearWithdrawalDate()
	}
	if in.HouseID != nil {
		update = update.SetHouseID(*in.HouseID)
	}
	if wasCleared(sent, entstudent.FieldHouseID, in.HouseID) {
		update = update.ClearHouseID()
	}
	if in.Status != nil {
		if err := entstudent.StatusValidator(entstudent.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, alumni or withdrawn")
			return
		}
		update = update.SetStatus(entstudent.Status(*in.Status))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "student not found") {
		return
	}

	row, err := client.Student.Query().Where(entstudent.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "student not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteStudent(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "student not found",
		authorization.StudentsDelete, authorization.StudentsDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.Student.Delete().
				Where(entstudent.ID(id), access.StudentsFor(v, d)).
				Exec(ctx)
		})
}
