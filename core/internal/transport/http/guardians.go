package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/guardian"
	"github.com/Harbour-Emerge/emerge-core/internal/data/school"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entguardian "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/guardian"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type guardianPayload struct {
	PersonID   *uuid.UUID        `json:"person_id"`
	Person     *newPersonPayload `json:"person"`
	Occupation *string           `json:"occupation"`
	Employer   *string           `json:"employer"`
	Status     *string           `json:"status"`
}

type linkPayload struct {
	StudentID          *uuid.UUID `json:"student_id"`
	RelationshipType   *string    `json:"relationship_type"`
	IsPrimary          *bool      `json:"is_primary"`
	IsEmergencyContact *bool      `json:"is_emergency_contact"`
	CanPickup          *bool      `json:"can_pickup"`
	CanViewAcademic    *bool      `json:"can_view_academic"`
	CanViewFinance     *bool      `json:"can_view_finance"`
	Status             *string    `json:"status"`
}

const (
	linkFieldRule = "student_guardians: link fields fixed by construction"
	linkNotFound  = "guardian link not found"
)

var linkFields = &authorization.FieldPolicy{
	Mode: authorization.FieldModeInclude,
	Keys: []string{
		entlink.FieldStudentID,
		entlink.FieldRelationshipType,
		entlink.FieldIsPrimary,
		entlink.FieldIsEmergencyContact,
		entlink.FieldCanPickup,
		entlink.FieldCanViewAcademic,
		entlink.FieldCanViewFinance,
	},
}

func (s *Server) listGuardians(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	sc, err := school.From(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := guardian.ParseFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.GuardiansRead, authorization.GuardiansReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := sc.Guardians(ctx).ForViewer(viewer, decision).Basic().ApplyFilters(filters).Newest().All()
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
		"school":    sc.Tenant.Code,
		"guardians": projected,
		"count":     len(rows),
		"page":      pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getGuardian(w http.ResponseWriter, r *http.Request) {
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
		authorization.GuardiansRead, authorization.GuardiansReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := sc.Guardians(ctx).ByID(id).ForViewer(viewer, decision).Basic().Only()
	if err != nil {
		writeTenantEntErr(w, err, "guardian not found")
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createGuardian(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in guardianPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.GuardiansCreate, authorization.GuardiansWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entguardian.Columns, withoutPerson(sent)) {
		return
	}

	personID, ok := s.personIDFor(w, r, client, in.PersonID, in.Person)
	if !ok {
		return
	}

	create := client.Guardian.Create().
		SetPersonID(personID).
		SetNillableOccupation(in.Occupation).
		SetNillableEmployer(in.Employer)

	if in.Status != nil {
		if err := entguardian.StatusValidator(entguardian.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entguardian.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "guardian not found")
		return
	}
	w.Header().Set("Location", "/api/v1/guardians/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateGuardian(w http.ResponseWriter, r *http.Request) {
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

	var in guardianPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.GuardiansWrite, authorization.GuardiansWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := reachGuardian(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "guardian not found") {
		return
	}
	if !rejectInlinePerson(w, in.Person) {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entguardian.Columns, withoutPerson(sent)) {
		return
	}

	update := client.Guardian.Update().
		Where(entguardian.ID(id), guardian.For(viewer, decision)).
		SetNillableOccupation(in.Occupation).
		SetNillableEmployer(in.Employer)

	if in.Status != nil {
		if err := entguardian.StatusValidator(entguardian.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entguardian.Status(*in.Status))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "guardian not found") {
		return
	}

	row, err := client.Guardian.Query().Where(entguardian.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "guardian not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteGuardian(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "guardian not found",
		authorization.GuardiansDelete, authorization.GuardiansDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.Guardian.Delete().
				Where(entguardian.ID(id), guardian.For(v, d)).
				Exec(ctx)
		})
}

func (s *Server) linkGuardianToStudent(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	guardianID, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in linkPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if !rejectFields(w, r, linkFields, linkFieldRule, entlink.Columns, sent) {
		return
	}
	if in.StudentID == nil {
		response.Error(w, http.StatusBadRequest, "student_id is required")
		return
	}
	if in.RelationshipType == nil || *in.RelationshipType == "" {
		response.Error(w, http.StatusBadRequest, "relationship_type is required")
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.GuardiansWrite, authorization.GuardiansWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	found, err := reachGuardian(ctx, client, guardianID, viewer, decision)
	if !mustReach(w, found, err, "guardian not found") {
		return
	}

	student, studentDecision, err := s.scopeFor(ctx,
		authorization.StudentsRead, authorization.StudentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !studentDecision.Allowed {
		response.Error(w, http.StatusForbidden,
			"linking a guardian requires "+string(authorization.StudentsRead))
		return
	}
	found, err = reachStudent(ctx, client, *in.StudentID, student, studentDecision)
	if !mustReach(w, found, err, "student not found") {
		return
	}

	create := client.StudentGuardian.Create().
		SetGuardianID(guardianID).
		SetStudentID(*in.StudentID).
		SetRelationshipType(*in.RelationshipType)

	if in.IsPrimary != nil {
		create = create.SetIsPrimary(*in.IsPrimary)
	}
	if in.IsEmergencyContact != nil {
		create = create.SetIsEmergencyContact(*in.IsEmergencyContact)
	}
	if in.CanPickup != nil {
		create = create.SetCanPickup(*in.CanPickup)
	}
	if in.CanViewAcademic != nil {
		create = create.SetCanViewAcademic(*in.CanViewAcademic)
	}
	if in.CanViewFinance != nil {
		create = create.SetCanViewFinance(*in.CanViewFinance)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "guardian or student not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func linkWritableBy(guardianID, studentID uuid.UUID,
	gv *access.Viewer, gd authorization.Decision,
	sv *access.Viewer, sd authorization.Decision) predicate.StudentGuardian {
	return entlink.And(
		entlink.GuardianID(guardianID),
		entlink.StudentID(studentID),
		entlink.HasGuardianWith(guardian.For(gv, gd)),
		entlink.HasStudentWith(access.StudentsFor(sv, sd)),
	)
}

func (s *Server) updateGuardianLink(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	guardianID, ok := idParam(w, r, "id")
	if !ok {
		return
	}
	studentID, ok := idParam(w, r, "student_id")
	if !ok {
		return
	}

	var in linkPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if in.StudentID != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"student_id is taken from the path and cannot be moved")
		return
	}
	if !rejectFields(w, r, linkFields, linkFieldRule, entlink.Columns, sent) {
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entlink.Columns, sent) {
		return
	}

	viewer, guardianDecision, err := s.scopeFor(ctx,
		authorization.GuardiansWrite, authorization.GuardiansWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !guardianDecision.Allowed {
		response.Error(w, http.StatusForbidden,
			"editing a guardian link requires "+string(authorization.GuardiansWrite))
		return
	}

	student, studentDecision, err := s.scopeFor(ctx,
		authorization.StudentsRead, authorization.StudentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !studentDecision.Allowed {
		response.Error(w, http.StatusForbidden,
			"editing a guardian link requires "+string(authorization.StudentsRead))
		return
	}

	found, err := reachGuardian(ctx, client, guardianID, viewer, guardianDecision)
	if !mustReach(w, found, err, linkNotFound) {
		return
	}
	found, err = reachStudent(ctx, client, studentID, student, studentDecision)
	if !mustReach(w, found, err, linkNotFound) {
		return
	}

	scoped := linkWritableBy(guardianID, studentID, viewer, guardianDecision, student, studentDecision)

	n, err := client.StudentGuardian.Update().
		Where(scoped).
		SetNillableRelationshipType(in.RelationshipType).
		SetNillableIsPrimary(in.IsPrimary).
		SetNillableIsEmergencyContact(in.IsEmergencyContact).
		SetNillableCanPickup(in.CanPickup).
		SetNillableCanViewAcademic(in.CanViewAcademic).
		SetNillableCanViewFinance(in.CanViewFinance).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, linkNotFound)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, linkNotFound)
		return
	}

	row, err := client.StudentGuardian.Query().Where(scoped).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, linkNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}
