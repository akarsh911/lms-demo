package http

import (
	"context"
	nethttp "net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/enrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/data/guardian"
	"github.com/Harbour-Emerge/emerge-core/internal/data/person"
	"github.com/Harbour-Emerge/emerge-core/internal/data/staff"
	"github.com/Harbour-Emerge/emerge-core/internal/data/student"
	"github.com/Harbour-Emerge/emerge-core/internal/data/teacher"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entnote "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentnote"

	entstudentassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentassignment"
	entdocument "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentdocument"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

func reachStudent(ctx context.Context, _ *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	n, err := student.New(ctx).ByID(id).ForViewer(v, d).Count()
	return n > 0, err
}

func reachPerson(ctx context.Context, _ *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	n, err := person.New(ctx).ByID(id).ForViewer(v, d).Count()
	return n > 0, err
}

func reachStaff(ctx context.Context, _ *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	n, err := staff.New(ctx).ByID(id).ForViewer(v, d).Count()
	return n > 0, err
}

func reachTeacher(ctx context.Context, _ *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	n, err := teacher.New(ctx).ByID(id).ForViewer(v, d).Count()
	return n > 0, err
}

func reachGuardian(ctx context.Context, _ *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	n, err := guardian.New(ctx).ByID(id).ForViewer(v, d).Count()
	return n > 0, err
}

func reachEnrollment(ctx context.Context, _ *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	n, err := enrollment.New(ctx).ByID(id).ForViewer(v, d).Count()
	return n > 0, err
}

func reachSubjectEnrollment(ctx context.Context, _ *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	n, err := enrollment.NewSubject(ctx).ByID(id).ForViewer(v, d).Count()
	return n > 0, err
}

func documentsVisibleTo(v *access.Viewer, d authorization.Decision) predicate.StudentDocument {
	return entdocument.HasStudentWith(access.StudentsForAcademic(v, d))
}

func reachDocument(ctx context.Context, c *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	return c.StudentDocument.Query().Where(
		entdocument.ID(id),
		documentsVisibleTo(v, d),
	).Exist(ctx)
}

func reachNote(ctx context.Context, c *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	q := c.StudentNote.Query().Where(entnote.ID(id))
	if v.Restricted() {
		p, ok := visibleNotes(v, d)
		if !ok {
			return false, nil
		}
		q = q.Where(p)
	}
	return q.Exist(ctx)
}

func reachStudentAssignment(ctx context.Context, c *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	return c.StudentAssignment.Query().Where(
		entstudentassign.ID(id),
		access.StudentAssignmentsFor(v, d),
	).Exist(ctx)
}

func reachTeacherAssignment(ctx context.Context, c *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	return c.TeacherAssignment.Query().Where(
		entteacherassign.ID(id),
		access.TeacherAssignmentsFor(v, d),
	).Exist(ctx)
}

func attributedTo(w nethttp.ResponseWriter, v *access.Viewer,
	supplied *uuid.UUID, field string) (uuid.UUID, bool) {
	who, ok := attribution(w, v, supplied, field)
	if !ok {
		return uuid.Nil, false
	}
	if who == nil {
		response.Error(w, nethttp.StatusBadRequest,
			"cannot record "+field+": the caller has no person record at this school")
		return uuid.Nil, false
	}
	return *who, true
}

func attributedToOptional(w nethttp.ResponseWriter, v *access.Viewer,
	supplied *uuid.UUID, field string) (*uuid.UUID, bool) {
	return attribution(w, v, supplied, field)
}

func attribution(w nethttp.ResponseWriter, v *access.Viewer,
	supplied *uuid.UUID, field string) (*uuid.UUID, bool) {
	if supplied != nil {
		response.Error(w, nethttp.StatusUnprocessableEntity,
			field+" is recorded from the authenticated caller and must not be supplied")
		return nil, false
	}
	if v == nil || v.PersonID == nil {
		return nil, true
	}
	return v.PersonID, true
}

func (s *Server) studentProjection(w nethttp.ResponseWriter, r *nethttp.Request,
	rows []*tenantent.Student, decision authorization.Decision) (any, bool) {
	if !decision.PerRow() {
		projected, err := projectAll(rows, decision.Fields)
		if err != nil {
			response.ServerError(w, err)
			return nil, false
		}
		traceProjection(r, decision.Fields, len(rows))
		return projected, true
	}

	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	values, err := access.StudentRowValues(r.Context(), ids)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	projected, dropped, err := projectPerRow(rows, decision,
		func(row *tenantent.Student) uuid.UUID { return row.ID }, values)
	if err != nil {
		response.ServerError(w, err)
		return nil, false
	}
	tracePerRow(r, decision, len(rows), dropped)
	return projected, true
}

func (s *Server) studentWriteFields(w nethttp.ResponseWriter, r *nethttp.Request,
	id uuid.UUID, decision authorization.Decision) (*authorization.FieldPolicy, bool) {
	if !decision.PerRow() {
		return decision.Fields, true
	}

	values, err := access.StudentRowValues(r.Context(), []uuid.UUID{id})
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	policy, covered := decision.FieldsForRow(values[id])
	if !covered {
		response.Error(w, nethttp.StatusForbidden,
			"cannot establish which policy covers this row")
		return nil, false
	}
	return policy, true
}

func (s *Server) enrollmentProjection(w nethttp.ResponseWriter, r *nethttp.Request,
	rows []*tenantent.StudentEnrollment, decision authorization.Decision) (any, bool) {
	if !decision.PerRow() {
		projected, err := projectAll(rows, decision.Fields)
		if err != nil {
			response.ServerError(w, err)
			return nil, false
		}
		traceProjection(r, decision.Fields, len(rows))
		return projected, true
	}

	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	values, err := access.EnrollmentRowValues(r.Context(), ids)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	projected, dropped, err := projectPerRow(rows, decision,
		func(row *tenantent.StudentEnrollment) uuid.UUID { return row.ID }, values)
	if err != nil {
		response.ServerError(w, err)
		return nil, false
	}
	tracePerRow(r, decision, len(rows), dropped)
	return projected, true
}
