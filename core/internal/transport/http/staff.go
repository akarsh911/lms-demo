package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/school"
	"github.com/Harbour-Emerge/emerge-core/internal/data/staff"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type staffPayload struct {
	PersonID       *uuid.UUID        `json:"person_id"`
	Person         *newPersonPayload `json:"person"`
	EmployeeCode   *string           `json:"employee_code"`
	DepartmentID   *uuid.UUID        `json:"department_id"`
	BranchID       *uuid.UUID        `json:"branch_id"`
	Designation    *string           `json:"designation"`
	EmploymentType *string           `json:"employment_type"`
	JoiningDate    *string           `json:"joining_date"`
	LeavingDate    *string           `json:"leaving_date"`
	Status         *string           `json:"status"`
}

func (s *Server) listStaff(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	sc, err := school.From(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := staff.ParseFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StaffRead, authorization.StaffReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := sc.Staff(ctx).
		ForViewer(viewer, decision).
		ApplyFilters(filters).
		Basic().
		Newest().
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
		"school": sc.Tenant.Code,
		"staff":  projected,
		"count":  len(rows),
		"page":   pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getStaff(w http.ResponseWriter, r *http.Request) {
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
		authorization.StaffRead, authorization.StaffReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := sc.Staff(ctx).ByID(id).ForViewer(viewer, decision).Basic().WithTeacher().Only()
	if err != nil {
		writeTenantEntErr(w, err, "staff member not found")
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createStaff(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in staffPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx, authorization.StaffWrite, authorization.StaffWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entstaff.Columns, withoutPerson(sent)) {
		return
	}

	personID, ok := s.personIDFor(w, r, client, in.PersonID, in.Person)
	if !ok {
		return
	}
	if in.EmployeeCode == nil || *in.EmployeeCode == "" {
		response.Error(w, http.StatusBadRequest, "employee_code is required")
		return
	}

	joining, err := parseDate(in.JoiningDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "joining_date must be YYYY-MM-DD")
		return
	}
	leaving, err := parseDate(in.LeavingDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "leaving_date must be YYYY-MM-DD")
		return
	}

	create := client.Staff.Create().
		SetPersonID(personID).
		SetEmployeeCode(*in.EmployeeCode).
		SetNillableDesignation(in.Designation)

	if in.DepartmentID != nil {
		create = create.SetDepartmentID(*in.DepartmentID)
	}
	if in.BranchID != nil {
		create = create.SetBranchID(*in.BranchID)
	}
	if joining != nil {
		create = create.SetJoiningDate(*joining)
	}
	if leaving != nil {
		create = create.SetLeavingDate(*leaving)
	}
	if in.EmploymentType != nil {
		kind := entstaff.EmploymentType(*in.EmploymentType)
		if err := entstaff.EmploymentTypeValidator(kind); err != nil {
			response.Error(w, http.StatusBadRequest,
				"employment_type must be full_time, part_time, contract, visiting or intern")
			return
		}
		create = create.SetEmploymentType(kind)
	}
	if in.Status != nil {
		if err := entstaff.StatusValidator(entstaff.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entstaff.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "staff member not found")
		return
	}
	w.Header().Set("Location", "/api/v1/staff/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateStaff(w http.ResponseWriter, r *http.Request) {
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

	var in staffPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StaffWrite, authorization.StaffWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := reachStaff(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "staff member not found") {
		return
	}
	if !rejectInlinePerson(w, in.Person) {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entstaff.Columns, withoutPerson(sent)) {
		return
	}

	joining, err := parseDate(in.JoiningDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "joining_date must be YYYY-MM-DD")
		return
	}
	leaving, err := parseDate(in.LeavingDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "leaving_date must be YYYY-MM-DD")
		return
	}

	update := client.Staff.Update().
		Where(entstaff.ID(id), staff.For(viewer, decision)).
		SetNillableDesignation(in.Designation)

	if in.DepartmentID != nil {
		update = update.SetDepartmentID(*in.DepartmentID)
	}
	if in.BranchID != nil {
		update = update.SetBranchID(*in.BranchID)
	}
	if joining != nil {
		update = update.SetJoiningDate(*joining)
	}
	if leaving != nil {
		update = update.SetLeavingDate(*leaving)
	}
	if in.EmploymentType != nil {
		kind := entstaff.EmploymentType(*in.EmploymentType)
		if err := entstaff.EmploymentTypeValidator(kind); err != nil {
			response.Error(w, http.StatusBadRequest,
				"employment_type must be full_time, part_time, contract, visiting or intern")
			return
		}
		update = update.SetEmploymentType(kind)
	}
	if in.Status != nil {
		if err := entstaff.StatusValidator(entstaff.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entstaff.Status(*in.Status))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "staff member not found") {
		return
	}

	row, err := client.Staff.Query().Where(entstaff.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "staff member not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteStaff(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "staff member not found",
		authorization.StaffDelete, authorization.StaffDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.Staff.Delete().
				Where(entstaff.ID(id), staff.For(v, d)).
				Exec(ctx)
		})
}
