package http

import (
	"context"
	"net/http"
	"net/url"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entdayschedule "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendardayschedule"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entsitting "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsitting"
	entexamsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsubject"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entroom "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/room"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entteacherassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	examNameRunes         = 200
	examInstructionsRunes = 4000
)

const (
	examNotFound        = "exam not found"
	examSubjectNotFound = "exam subject not found"
	examSittingNotFound = "exam sitting not found"
)

const examSittingRef = "proposed"

func (s *Server) mountExams(r chi.Router) {
	r.Route("/exams", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/", s.listExams)
		r.With(s.can(authorization.TimetableWrite)).Post("/", s.createExam)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getExam)
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updateExam)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deleteExam)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/subjects", s.listExamSubjects)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/subjects", s.createExamSubject)
	})

	r.Route("/exam-subjects", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getExamSubject)
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updateExamSubject)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deleteExamSubject)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/sittings", s.listExamSubjectSittings)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/sittings", s.createExamSitting)
	})

	r.Route("/exam-sittings", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/", s.listExamSittings)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getExamSitting)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deleteExamSitting)
	})
}

func examReachUnfiltered(v *access.Viewer, d authorization.Decision) bool {
	if v == nil {
		return false
	}
	if v.Unrestricted {
		return true
	}
	return d.HasReach && d.Reach == authorization.ReachTenant && len(d.Constraints) == 0
}

func examOfferingArms(v *access.Viewer) []predicate.SubjectOffering {
	offerings := append([]uuid.UUID{}, v.SubjectOfferingIDs...)
	offerings = append(offerings, v.EnrolledOfferingIDs...)
	offerings = append(offerings, v.WardOfferingIDs...)

	var arms []predicate.SubjectOffering
	if len(offerings) > 0 {
		arms = append(arms, entoffering.IDIn(offerings...))
	}
	if len(v.SectionIDs) > 0 {
		arms = append(arms, entoffering.SectionIDIn(v.SectionIDs...))
	}
	return arms
}

func examOfferingScope(v *access.Viewer) predicate.SubjectOffering {
	arms := examOfferingArms(v)
	if len(arms) == 0 {
		return entoffering.IDIn()
	}
	return entoffering.Or(arms...)
}

func examScope(v *access.Viewer, d authorization.Decision) []predicate.Exam {
	if v == nil {
		return []predicate.Exam{entexam.IDIn()}
	}
	if examReachUnfiltered(v, d) {
		return nil
	}
	return []predicate.Exam{
		entexam.HasExamSubjectsWith(entexamsubject.HasSubjectOfferingWith(examOfferingScope(v))),
	}
}

func examSubjectScope(v *access.Viewer, d authorization.Decision) []predicate.ExamSubject {
	if v == nil {
		return []predicate.ExamSubject{entexamsubject.IDIn()}
	}
	if examReachUnfiltered(v, d) {
		return nil
	}
	return []predicate.ExamSubject{entexamsubject.HasSubjectOfferingWith(examOfferingScope(v))}
}

func examSittingScope(v *access.Viewer, d authorization.Decision) []predicate.ExamSitting {
	if v == nil {
		return []predicate.ExamSitting{entsitting.IDIn()}
	}
	if examReachUnfiltered(v, d) {
		return nil
	}
	arms := []predicate.ExamSitting{
		entsitting.HasExamSubjectWith(entexamsubject.HasSubjectOfferingWith(examOfferingScope(v))),
	}
	if len(v.SectionIDs) > 0 {
		arms = append(arms, entsitting.SectionIDIn(v.SectionIDs...))
	}
	return []predicate.ExamSitting{entsitting.Or(arms...)}
}

type examPayload struct {
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	BranchID          *uuid.UUID `json:"branch_id"`
	Name              *string    `json:"name"`
	Code              *string    `json:"code"`
	ExamType          *string    `json:"exam_type"`
	StartAt           *string    `json:"start_at"`
	EndAt             *string    `json:"end_at"`
	Instructions      *string    `json:"instructions"`
	Status            *string    `json:"status"`
	AssessmentKind    *string    `json:"assessment_kind"`
}

type examSubjectPayload struct {
	SubjectOfferingID *uuid.UUID `json:"subject_offering_id"`
	MaximumMarks      *float64   `json:"maximum_marks"`
	PassMarks         *float64   `json:"pass_marks"`
	GradingSchemeID   *uuid.UUID `json:"grading_scheme_id"`
}

type examSittingPayload struct {
	Date      *string    `json:"date"`
	PeriodID  *uuid.UUID `json:"period_id"`
	SectionID *uuid.UUID `json:"section_id"`
	RoomID    *uuid.UUID `json:"room_id"`
}

type examFilters struct {
	AcademicSessionID *uuid.UUID
	BranchID          *uuid.UUID
	ExamType          *entexam.ExamType
	Status            *entexam.Status

	Limit  int
	Offset int
}

func parseExamFilters(values url.Values) (examFilters, error) {
	p := filter.New(values)

	f := examFilters{
		AcademicSessionID: p.UUID("academic_session_id"),
		BranchID:          p.UUID("branch_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("exam_type", func(v string) error {
		return entexam.ExamTypeValidator(entexam.ExamType(v))
	}); raw != nil {
		kind := entexam.ExamType(*raw)
		f.ExamType = &kind
	}
	if raw := p.Enum("status", func(v string) error {
		return entexam.StatusValidator(entexam.Status(v))
	}); raw != nil {
		status := entexam.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return examFilters{}, err
	}
	return f, nil
}

func (f examFilters) apply(q *tenantent.ExamQuery) *tenantent.ExamQuery {
	if f.AcademicSessionID != nil {
		q = q.Where(entexam.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.BranchID != nil {
		q = q.Where(entexam.BranchID(*f.BranchID))
	}
	if f.ExamType != nil {
		q = q.Where(entexam.ExamTypeEQ(*f.ExamType))
	}
	if f.Status != nil {
		q = q.Where(entexam.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) listExams(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseExamFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := filters.apply(client.Exam.Query().Where(examScope(viewer, decision)...)).
		Order(tenantent.Asc(entexam.FieldCode), tenantent.Asc(entexam.FieldID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"exams": projected,
		"count": len(rows),
		"page":  pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getExam(w http.ResponseWriter, r *http.Request) {
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
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Exam.Query().
		Where(append(examScope(viewer, decision), entexam.ID(id))...).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func examWindow(w http.ResponseWriter, in examPayload) (*time.Time, *time.Time, bool) {
	from, err := parseInstant(entexam.FieldStartAt, in.StartAt)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return nil, nil, false
	}
	to, err := parseInstant(entexam.FieldEndAt, in.EndAt)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return nil, nil, false
	}
	if from != nil && to != nil && to.Before(*from) {
		response.Error(w, http.StatusUnprocessableEntity,
			entexam.FieldEndAt+" precedes "+entexam.FieldStartAt)
		return nil, nil, false
	}
	return from, to, true
}

func examTextValid(w http.ResponseWriter, in examPayload) bool {
	if in.Name != nil && !withinRunes(w, entexam.FieldName, *in.Name, examNameRunes) {
		return false
	}
	if in.Code != nil && !withinRunes(w, entexam.FieldCode, *in.Code, timetableCodeRunes) {
		return false
	}
	if in.Instructions != nil &&
		!withinRunes(w, entexam.FieldInstructions, *in.Instructions, examInstructionsRunes) {
		return false
	}
	return true
}

func examAssessment(w http.ResponseWriter, raw *string,
	current entexam.AssessmentKind) (entexam.AssessmentKind, bool) {
	if raw == nil {
		return current, true
	}
	return timetableEnum(w, entexam.FieldAssessmentKind, *raw, entexam.AssessmentKindValidator)
}

func (s *Server) createExam(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in examPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entexam.Columns, sent) {
		return
	}
	if !timetableWriteUnfiltered(viewer, decision) {
		response.Error(w, http.StatusForbidden,
			"an exam campaign covers sections your grant of "+
				string(authorization.TimetableWrite)+" does not reach")
		return
	}

	if in.AcademicSessionID == nil || in.BranchID == nil {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id and branch_id are required")
		return
	}
	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}
	if !examTextValid(w, in) {
		return
	}

	from, to, ok := examWindow(w, in)
	if !ok {
		return
	}

	kind := entexam.DefaultExamType
	if in.ExamType != nil {
		parsed, ok := timetableEnum(w, entexam.FieldExamType, *in.ExamType, entexam.ExamTypeValidator)
		if !ok {
			return
		}
		kind = parsed
	}

	status := entexam.DefaultStatus
	if in.Status != nil {
		parsed, ok := timetableEnum(w, entexam.FieldStatus, *in.Status, entexam.StatusValidator)
		if !ok {
			return
		}
		status = parsed
	}

	assessment, ok := examAssessment(w, in.AssessmentKind, entexam.DefaultAssessmentKind)
	if !ok {
		return
	}

	row, err := client.Exam.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetBranchID(*in.BranchID).
		SetName(*in.Name).
		SetCode(*in.Code).
		SetExamType(kind).
		SetStatus(status).
		SetAssessmentKind(assessment).
		SetNillableStartAt(from).
		SetNillableEndAt(to).
		SetNillableInstructions(in.Instructions).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/exams/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateExam(w http.ResponseWriter, r *http.Request) {
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

	var in examPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entexam.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "exam",
		entexam.FieldAcademicSessionID, entexam.FieldBranchID) {
		return
	}
	if !timetableWriteUnfiltered(viewer, decision) {
		response.Error(w, http.StatusForbidden,
			"an exam campaign covers sections your grant of "+
				string(authorization.TimetableWrite)+" does not reach")
		return
	}
	if !examTextValid(w, in) {
		return
	}

	current, err := client.Exam.Query().Where(entexam.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examNotFound)
		return
	}

	merged := in
	if merged.StartAt == nil && current.StartAt != nil {
		formatted := current.StartAt.UTC().Format(time.RFC3339)
		merged.StartAt = &formatted
	}
	if merged.EndAt == nil && current.EndAt != nil {
		formatted := current.EndAt.UTC().Format(time.RFC3339)
		merged.EndAt = &formatted
	}
	from, to, ok := examWindow(w, merged)
	if !ok {
		return
	}

	update := client.Exam.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableCode(in.Code).
		SetNillableInstructions(in.Instructions).
		SetNillableStartAt(from).
		SetNillableEndAt(to)

	if in.ExamType != nil {
		parsed, ok := timetableEnum(w, entexam.FieldExamType, *in.ExamType, entexam.ExamTypeValidator)
		if !ok {
			return
		}
		update = update.SetExamType(parsed)
	}
	if in.Status != nil {
		parsed, ok := timetableEnum(w, entexam.FieldStatus, *in.Status, entexam.StatusValidator)
		if !ok {
			return
		}
		update = update.SetStatus(parsed)
	}

	assessment, ok := examAssessment(w, in.AssessmentKind, current.AssessmentKind)
	if !ok {
		return
	}
	update = update.SetAssessmentKind(assessment)

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteExam(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, examNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			if !examReachUnfiltered(v, d) {
				return 0, nil
			}
			return c.Exam.Delete().Where(entexam.ID(id)).Exec(ctx)
		})
}

func (s *Server) listExamSubjects(w http.ResponseWriter, r *http.Request) {
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
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if _, err := client.Exam.Query().
		Where(append(examScope(viewer, decision), entexam.ID(id))...).
		Only(ctx); err != nil {
		writeTenantEntErr(w, err, examNotFound)
		return
	}

	rows, err := client.ExamSubject.Query().
		Where(append(examSubjectScope(viewer, decision), entexamsubject.ExamID(id))...).
		Order(tenantent.Asc(entexamsubject.FieldID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"exam_subjects": projected,
		"count":         len(rows),
	})
}

func (s *Server) getExamSubject(w http.ResponseWriter, r *http.Request) {
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
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.ExamSubject.Query().
		Where(append(examSubjectScope(viewer, decision), entexamsubject.ID(id))...).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func examMarksValid(w http.ResponseWriter, maximum float64, pass *float64) bool {
	if maximum <= 0 {
		response.Error(w, http.StatusBadRequest, entexamsubject.FieldMaximumMarks+" must be positive")
		return false
	}
	if pass == nil {
		return true
	}
	if *pass < 0 {
		response.Error(w, http.StatusBadRequest, entexamsubject.FieldPassMarks+" may not be negative")
		return false
	}
	if *pass > maximum {
		response.Error(w, http.StatusUnprocessableEntity,
			entexamsubject.FieldPassMarks+" exceeds "+entexamsubject.FieldMaximumMarks)
		return false
	}
	return true
}

func (s *Server) createExamSubject(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	examID, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in examSubjectPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entexamsubject.Columns, sent) {
		return
	}
	if !rejectFromPath(w, sent, entexamsubject.FieldExamID) {
		return
	}

	if in.SubjectOfferingID == nil {
		response.Error(w, http.StatusBadRequest, "subject_offering_id is required")
		return
	}
	if in.MaximumMarks == nil {
		response.Error(w, http.StatusBadRequest, "maximum_marks is required")
		return
	}
	if !examMarksValid(w, *in.MaximumMarks, in.PassMarks) {
		return
	}

	exam, err := client.Exam.Query().Where(entexam.ID(examID)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examNotFound)
		return
	}

	offering, ok := s.examOffering(ctx, w, client, exam, *in.SubjectOfferingID)
	if !ok {
		return
	}
	if !checkSectionWritable(ctx, w, client, offering.SectionID, &offering.ID, viewer, decision) {
		return
	}

	scheme := in.GradingSchemeID
	if scheme == nil {
		scheme = offering.GradingSchemeID
	}

	row, err := client.ExamSubject.Create().
		SetExamID(examID).
		SetSubjectOfferingID(offering.ID).
		SetMaximumMarks(*in.MaximumMarks).
		SetNillablePassMarks(in.PassMarks).
		SetNillableGradingSchemeID(scheme).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/exam-subjects/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) examOffering(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	exam *tenantent.Exam, id uuid.UUID) (*tenantent.SubjectOffering, bool) {
	offering, err := client.SubjectOffering.Query().
		Where(
			entoffering.ID(id),
			entoffering.AcademicSessionID(exam.AcademicSessionID),
			entoffering.HasSectionWith(entsection.BranchID(exam.BranchID)),
		).
		Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			response.Error(w, http.StatusUnprocessableEntity,
				"that subject offering belongs to another branch or academic session than the exam")
			return nil, false
		}
		writeTenancyErr(w, err)
		return nil, false
	}
	return offering, true
}

func (s *Server) updateExamSubject(w http.ResponseWriter, r *http.Request) {
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

	var in examSubjectPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entexamsubject.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "exam subject",
		entexamsubject.FieldExamID, entexamsubject.FieldSubjectOfferingID) {
		return
	}

	current, err := client.ExamSubject.Query().
		Where(append(examSubjectScope(viewer, decision), entexamsubject.ID(id))...).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return
	}

	offering, err := client.SubjectOffering.Get(ctx, current.SubjectOfferingID)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return
	}
	if !checkSectionWritable(ctx, w, client, offering.SectionID, &offering.ID, viewer, decision) {
		return
	}

	maximum := current.MaximumMarks
	if in.MaximumMarks != nil {
		maximum = *in.MaximumMarks
	}
	pass := current.PassMarks
	if wasSent(sent, entexamsubject.FieldPassMarks) {
		pass = in.PassMarks
	}
	if !examMarksValid(w, maximum, pass) {
		return
	}

	update := client.ExamSubject.UpdateOneID(id).SetMaximumMarks(maximum)
	if pass == nil {
		update = update.ClearPassMarks()
	} else {
		update = update.SetPassMarks(*pass)
	}
	if wasSent(sent, entexamsubject.FieldGradingSchemeID) {
		if in.GradingSchemeID == nil {
			update = update.ClearGradingScheme()
		} else {
			update = update.SetGradingSchemeID(*in.GradingSchemeID)
		}
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteExamSubject(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, examSubjectNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.ExamSubject.Delete().
				Where(append(examSubjectScope(v, d), entexamsubject.ID(id))...).
				Exec(ctx)
		})
}

type examSittingFilters struct {
	ExamID        *uuid.UUID
	ExamSubjectID *uuid.UUID
	SectionID     *uuid.UUID
	CalendarDayID *uuid.UUID
	PeriodID      *uuid.UUID
	From          *time.Time
	To            *time.Time

	Limit  int
	Offset int
}

func parseExamSittingFilters(values url.Values) (examSittingFilters, error) {
	p := filter.New(values)

	var failed error
	f := examSittingFilters{
		ExamID:        p.UUID("exam_id"),
		ExamSubjectID: p.UUID("exam_subject_id"),
		SectionID:     p.UUID("section_id"),
		CalendarDayID: p.UUID("calendar_day_id"),
		PeriodID:      p.UUID("period_id"),
		From:          timetableQueryDate(p, "from", &failed),
		To:            timetableQueryDate(p, "to", &failed),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if err := p.Err(); err != nil {
		return examSittingFilters{}, err
	}
	if failed != nil {
		return examSittingFilters{}, failed
	}
	if f.From != nil && f.To != nil && f.To.Before(*f.From) {
		return examSittingFilters{}, &filter.Error{Param: "to", Reason: "precedes from"}
	}
	return f, nil
}

func (f examSittingFilters) apply(q *tenantent.ExamSittingQuery) *tenantent.ExamSittingQuery {
	if f.ExamID != nil {
		q = q.Where(entsitting.HasExamSubjectWith(entexamsubject.ExamID(*f.ExamID)))
	}
	if f.ExamSubjectID != nil {
		q = q.Where(entsitting.ExamSubjectID(*f.ExamSubjectID))
	}
	if f.SectionID != nil {
		q = q.Where(entsitting.SectionID(*f.SectionID))
	}
	if f.CalendarDayID != nil {
		q = q.Where(entsitting.CalendarDayID(*f.CalendarDayID))
	}
	if f.PeriodID != nil {
		q = q.Where(entsitting.PeriodID(*f.PeriodID))
	}

	var window []predicate.CalendarDay
	if f.From != nil {
		window = append(window, entcalendarday.CalendarDateGTE(*f.From))
	}
	if f.To != nil {
		window = append(window, entcalendarday.CalendarDateLTE(*f.To))
	}
	if len(window) > 0 {
		q = q.Where(entsitting.HasCalendarDayWith(window...))
	}

	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) listExamSittings(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseExamSittingFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := filters.apply(client.ExamSitting.Query().Where(examSittingScope(viewer, decision)...)).
		Order(tenantent.Asc(entsitting.FieldCalendarDayID), tenantent.Asc(entsitting.FieldID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"exam_sittings": projected,
		"count":         len(rows),
		"page":          pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) listExamSubjectSittings(w http.ResponseWriter, r *http.Request) {
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
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if _, err := client.ExamSubject.Query().
		Where(append(examSubjectScope(viewer, decision), entexamsubject.ID(id))...).
		Only(ctx); err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return
	}

	rows, err := client.ExamSitting.Query().
		Where(append(examSittingScope(viewer, decision), entsitting.ExamSubjectID(id))...).
		Order(tenantent.Asc(entsitting.FieldCalendarDayID), tenantent.Asc(entsitting.FieldID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"exam_sittings": projected,
		"count":         len(rows),
	})
}

func (s *Server) getExamSitting(w http.ResponseWriter, r *http.Request) {
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
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.ExamSitting.Query().
		Where(append(examSittingScope(viewer, decision), entsitting.ID(id))...).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examSittingNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) deleteExamSitting(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, examSittingNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.ExamSitting.Delete().
				Where(append(examSittingScope(v, d), entsitting.ID(id))...).
				Exec(ctx)
		})
}

type sittingPlacement struct {
	ref       string
	sectionID uuid.UUID
	periodID  uuid.UUID
	offering  uuid.UUID
	teacherID *uuid.UUID
	roomID    *uuid.UUID
}

func (p sittingPlacement) proposal(dayOfWeek int) timetablesvc.Proposal {
	offering := p.offering
	return timetablesvc.Proposal{
		Ref:               p.ref,
		SectionID:         p.sectionID,
		PeriodID:          p.periodID,
		DayOfWeek:         dayOfWeek,
		SubjectOfferingID: &offering,
		TeacherID:         p.teacherID,
		RoomID:            p.roomID,
	}
}

func offeringTeacher(ctx context.Context, client *tenantent.Client,
	offering uuid.UUID) (*uuid.UUID, error) {
	row, err := client.TeacherAssignment.Query().
		Where(
			entteacherassignment.SubjectOfferingID(offering),
			entteacherassignment.StatusEQ(entteacherassignment.StatusActive),
		).
		Order(
			tenantent.Desc(entteacherassignment.FieldIsPrimary),
			tenantent.Asc(entteacherassignment.FieldCreatedAt),
		).
		First(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}
	return &row.TeacherID, nil
}

func sittingsOfDay(ctx context.Context, client *tenantent.Client,
	day uuid.UUID) ([]sittingPlacement, error) {
	rows, err := client.ExamSitting.Query().
		Where(entsitting.CalendarDayID(day)).
		WithExamSubject().
		Order(tenantent.Asc(entsitting.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make([]sittingPlacement, 0, len(rows))
	for _, row := range rows {
		if row.Edges.ExamSubject == nil {
			continue
		}
		offering := row.Edges.ExamSubject.SubjectOfferingID
		teacher, err := offeringTeacher(ctx, client, offering)
		if err != nil {
			return nil, err
		}
		out = append(out, sittingPlacement{
			ref:       "sitting:" + row.ID.String(),
			sectionID: row.SectionID,
			periodID:  row.PeriodID,
			offering:  offering,
			teacherID: teacher,
			roomID:    row.RoomID,
		})
	}
	return out, nil
}

func timetableInForce(ctx context.Context, client *tenantent.Client,
	scheme uuid.UUID, on time.Time) (*tenantent.Timetable, error) {
	return client.Timetable.Query().
		Where(
			enttimetable.PeriodSchemeID(scheme),
			enttimetable.StatusEQ(enttimetable.StatusPublished),
			enttimetable.EffectiveFromLTE(on),
			enttimetable.Or(
				enttimetable.EffectiveToIsNil(),
				enttimetable.EffectiveToGTE(on),
			),
		).
		Order(
			tenantent.Desc(enttimetable.FieldEffectiveFrom),
			tenantent.Desc(enttimetable.FieldVersion),
			tenantent.Desc(enttimetable.FieldCreatedAt),
		).
		First(ctx)
}

func displacedSlots(ctx context.Context, client *tenantent.Client, timetable uuid.UUID,
	dayOfWeek int, placements []sittingPlacement) ([]*tenantent.TimetableSlot, error) {
	arms := make([]predicate.TimetableSlot, 0, len(placements))
	for _, placement := range placements {
		arms = append(arms, entslot.And(
			entslot.SectionID(placement.sectionID),
			entslot.PeriodID(placement.periodID),
		))
	}
	if len(arms) == 0 {
		return nil, nil
	}
	return client.TimetableSlot.Query().
		Where(
			entslot.TimetableID(timetable),
			entslot.DayOfWeek(dayOfWeek),
			entslot.Or(arms...),
		).
		Order(tenantent.Asc(entslot.FieldID)).
		All(ctx)
}

func slotIDs(slots []*tenantent.TimetableSlot) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(slots))
	for _, slot := range slots {
		out = append(out, slot.ID)
	}
	return out
}

func slotsUnder(slots []*tenantent.TimetableSlot, p sittingPlacement) []*tenantent.TimetableSlot {
	out := make([]*tenantent.TimetableSlot, 0, len(slots))
	for _, slot := range slots {
		if slot.SectionID == p.sectionID && slot.PeriodID == p.periodID {
			out = append(out, slot)
		}
	}
	return out
}

func (s *Server) sittingDay(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	exam *tenantent.Exam, raw *string) (*tenantent.CalendarDay, bool) {
	on, err := parseDate(raw)
	if err != nil || on == nil {
		response.Error(w, http.StatusBadRequest, "date is required as "+dateLayout)
		return nil, false
	}

	day, err := client.CalendarDay.Query().
		Where(
			entcalendarday.BranchID(exam.BranchID),
			entcalendarday.CalendarDate(*on),
		).
		Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			response.Error(w, http.StatusUnprocessableEntity,
				"the school is not in session on "+on.Format(dateLayout)+
					": no calendar day exists for that date, and absence means not in session")
			return nil, false
		}
		writeTenancyErr(w, err)
		return nil, false
	}
	if !day.ForenoonOpen && !day.AfternoonOpen {
		response.Error(w, http.StatusUnprocessableEntity,
			"the school is closed on "+on.Format(dateLayout)+
				": both halves of that calendar day are shut")
		return nil, false
	}
	return day, true
}

func (s *Server) sittingPeriod(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	exam *tenantent.Exam, day *tenantent.CalendarDay, id uuid.UUID) (*tenantent.Period, bool) {
	period, err := client.Period.Query().
		Where(
			entperiod.ID(id),
			entperiod.HasPeriodSchemeWith(entscheme.BranchID(exam.BranchID)),
		).
		Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			response.Error(w, http.StatusUnprocessableEntity,
				"that period belongs to another branch than the exam")
			return nil, false
		}
		writeTenancyErr(w, err)
		return nil, false
	}

	runs, err := client.CalendarDaySchedule.Query().
		Where(
			entdayschedule.CalendarDayID(day.ID),
			entdayschedule.PeriodSchemeID(period.PeriodSchemeID),
		).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	if !runs {
		response.Error(w, http.StatusUnprocessableEntity,
			"that calendar day does not run the period scheme this period belongs to, "+
				"so the sitting could not be clash-checked against the day's lessons")
		return nil, false
	}
	return period, true
}

func (s *Server) sittingRoom(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	exam *tenantent.Exam, id *uuid.UUID) bool {
	if id == nil {
		return true
	}
	found, err := client.Room.Query().
		Where(entroom.ID(*id), entroom.BranchID(exam.BranchID)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !found {
		response.Error(w, http.StatusUnprocessableEntity,
			"that room belongs to another branch than the exam")
		return false
	}
	return true
}

func (s *Server) settleSittingClash(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, exam *tenantent.Exam, day *tenantent.CalendarDay,
	scheme uuid.UUID, fresh sittingPlacement) ([]*tenantent.TimetableSlot, bool) {
	on := timetablesvc.Day(day.CalendarDate)
	dayOfWeek := timetablesvc.ISODayOfWeek(on)

	target, err := timetableInForce(ctx, client, scheme, on)
	if err != nil {
		if tenantent.IsNotFound(err) {
			response.Error(w, http.StatusUnprocessableEntity,
				"no published timetable is in force on "+on.Format(dateLayout)+
					" for that period scheme, so the sitting cannot be clash-checked; "+
					"publish the timetable first")
			return nil, false
		}
		writeTenancyErr(w, err)
		return nil, false
	}

	existing, err := sittingsOfDay(ctx, client, day.ID)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	placements := append([]sittingPlacement{fresh}, existing...)
	proposed := make([]timetablesvc.Proposal, 0, len(placements))
	for _, placement := range placements {
		proposed = append(proposed, placement.proposal(dayOfWeek))
	}

	displaced, err := displacedSlots(ctx, client, target.ID, dayOfWeek, placements)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	service, err := timetablesvc.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	report, err := service.Check(ctx, timetablesvc.ClashQuery{
		BranchID:       exam.BranchID,
		TimetableID:    target.ID,
		Proposed:       proposed,
		ExcludeSlotIDs: slotIDs(displaced),
		From:           on,
		To:             on,
		Rules:          timetablesvc.AllRules(),
	})
	if err != nil {
		writeTimetableServiceErr(w, err, timetableNotFound)
		return nil, false
	}

	if blocking := report.Blocking(); len(blocking) > 0 {
		writeClashReport(w, report,
			"that period is already spoken for: an exam sitting is checked against "+
				"the timetable like any other lesson, and a clash is never overridden")
		return nil, false
	}
	return slotsUnder(displaced, fresh), true
}

func (s *Server) createExamSitting(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	subjectID, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in examSittingPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	requested := columnsSent(sent, entsitting.ValidColumn)
	if wasSent(sent, "date") {
		requested = append(requested, entsitting.FieldCalendarDayID)
	}
	if !rejectUnauthorizedFields(w, r, decision, entsitting.Columns, requested) {
		return
	}
	if in.PeriodID == nil {
		response.Error(w, http.StatusBadRequest, "period_id is required")
		return
	}

	subject, err := client.ExamSubject.Query().
		Where(entexamsubject.ID(subjectID)).
		WithExam().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return
	}
	if subject.Edges.Exam == nil {
		response.Error(w, http.StatusNotFound, examNotFound)
		return
	}
	exam := subject.Edges.Exam

	offering, err := client.SubjectOffering.Get(ctx, subject.SubjectOfferingID)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return
	}
	if in.SectionID != nil && *in.SectionID != offering.SectionID {
		response.Error(w, http.StatusUnprocessableEntity,
			"a sitting belongs to the section that studies the offering: "+
				offering.SectionID.String())
		return
	}
	if !checkSectionWritable(ctx, w, client, offering.SectionID, &offering.ID, viewer, decision) {
		return
	}

	day, ok := s.sittingDay(ctx, w, client, exam, in.Date)
	if !ok {
		return
	}
	period, ok := s.sittingPeriod(ctx, w, client, exam, day, *in.PeriodID)
	if !ok {
		return
	}
	if !s.sittingRoom(ctx, w, client, exam, in.RoomID) {
		return
	}

	teacher, err := offeringTeacher(ctx, client, offering.ID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	fresh := sittingPlacement{
		ref:       examSittingRef,
		sectionID: offering.SectionID,
		periodID:  period.ID,
		offering:  offering.ID,
		teacherID: teacher,
		roomID:    in.RoomID,
	}
	displaced, ok := s.settleSittingClash(ctx, w, client, exam, day, period.PeriodSchemeID, fresh)
	if !ok {
		return
	}

	unit, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := unit.writer.ExamSitting.Create().
		SetExamSubjectID(subject.ID).
		SetCalendarDayID(day.ID).
		SetPeriodID(period.ID).
		SetSectionID(offering.SectionID).
		SetNillableRoomID(in.RoomID).
		Save(ctx)
	if err == nil {
		err = cancelDisplacedLessons(ctx, unit.writer, exam, day, row, displaced)
	}
	if err != nil {
		unit.rollback()
		writeTenantEntErr(w, err, examSittingNotFound)
		return
	}
	if err := unit.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}

	w.Header().Set("Location", "/api/v1/exam-sittings/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func cancelDisplacedLessons(ctx context.Context, client *tenantent.Client, exam *tenantent.Exam,
	day *tenantent.CalendarDay, sitting *tenantent.ExamSitting,
	slots []*tenantent.TimetableSlot) error {
	if len(slots) == 0 {
		return nil
	}
	on := timetablesvc.Day(day.CalendarDate)

	spoken, err := client.TimetableDeviation.Query().
		Where(
			entdeviation.TimetableSlotIDIn(slotIDs(slots)...),
			entdeviation.DeviationDate(on),
		).
		All(ctx)
	if err != nil {
		return err
	}
	already := make(map[uuid.UUID]bool, len(spoken))
	for _, deviation := range spoken {
		if deviation.TimetableSlotID != nil {
			already[*deviation.TimetableSlotID] = true
		}
	}

	reason := sittingCancellationReason(exam)
	builders := make([]*tenantent.TimetableDeviationCreate, 0, len(slots))
	for _, slot := range slots {
		if already[slot.ID] {
			continue
		}
		builders = append(builders, client.TimetableDeviation.Create().
			SetTimetableSlotID(slot.ID).
			SetDeviationDate(on).
			SetKind(entdeviation.KindCancelled).
			SetSectionID(slot.SectionID).
			SetPeriodID(slot.PeriodID).
			SetNillableSubjectOfferingID(slot.SubjectOfferingID).
			SetReason(reason).
			SetExamSittingID(sitting.ID))
	}
	if len(builders) == 0 {
		return nil
	}
	return client.TimetableDeviation.CreateBulk(builders...).Exec(ctx)
}

func sittingCancellationReason(exam *tenantent.Exam) string {
	return clampRunes("cancelled by the "+exam.Name+" sitting", calendarNameRunes)
}

func clampRunes(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	return string([]rune(value)[:limit])
}
