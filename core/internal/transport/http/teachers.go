package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/school"
	"github.com/Harbour-Emerge/emerge-core/internal/data/teacher"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entteacher "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacher"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type teacherPayload struct {
	StaffID        *uuid.UUID             `json:"staff_id"`
	TeacherCode    *string                `json:"teacher_code"`
	Qualifications []shared.Qualification `json:"qualification_json"`
	Specialization *string                `json:"specialization"`
	Status         *string                `json:"status"`
}

func (s *Server) listTeachers(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	sc, err := school.From(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := teacher.ParseFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TeachersRead, authorization.TeachersReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := sc.Teachers(ctx).
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
		"school":   sc.Tenant.Code,
		"teachers": projected,
		"count":    len(rows),
		"page":     pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getTeacher(w http.ResponseWriter, r *http.Request) {
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
		authorization.TeachersRead, authorization.TeachersReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := sc.Teachers(ctx).ByID(id).ForViewer(viewer, decision).Basic().Only()
	if err != nil {
		writeTenantEntErr(w, err, "teacher not found")
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createTeacher(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in teacherPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.TeachersCreate, authorization.TeachersCreate)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entteacher.Columns, sent) {
		return
	}

	if in.StaffID == nil {
		response.Error(w, http.StatusBadRequest, "staff_id is required: create the staff record first")
		return
	}

	create := client.Teacher.Create().
		SetStaffID(*in.StaffID).
		SetNillableTeacherCode(in.TeacherCode).
		SetNillableSpecialization(in.Specialization)

	if in.Qualifications != nil {
		create = create.SetQualificationJSON(in.Qualifications)
	}
	if in.Status != nil {
		if err := entteacher.StatusValidator(entteacher.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entteacher.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "teacher not found")
		return
	}
	w.Header().Set("Location", "/api/v1/teachers/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateTeacher(w http.ResponseWriter, r *http.Request) {
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

	var in teacherPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TeachersWrite, authorization.TeachersWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := reachTeacher(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "teacher not found") {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entteacher.Columns, sent) {
		return
	}

	update := client.Teacher.Update().
		Where(entteacher.ID(id), teacher.For(viewer, decision)).
		SetNillableTeacherCode(in.TeacherCode).
		SetNillableSpecialization(in.Specialization)

	if in.Qualifications != nil {
		update = update.SetQualificationJSON(in.Qualifications)
	}
	if in.Status != nil {
		if err := entteacher.StatusValidator(entteacher.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entteacher.Status(*in.Status))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "teacher not found") {
		return
	}

	row, err := client.Teacher.Query().Where(entteacher.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "teacher not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteTeacher(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "teacher not found",
		authorization.TeachersDelete, authorization.TeachersDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.Teacher.Delete().
				Where(entteacher.ID(id), teacher.For(v, d)).
				Exec(ctx)
		})
}
