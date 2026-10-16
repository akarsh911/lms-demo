package http

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"entgo.io/ent/dialect/sql"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsitting "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsitting"
	entexamsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsubject"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entexammark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentexammark"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	examMarkNotFound    = "exam mark not found"
	examMarkStudentGone = "student not found"

	examMarkRemarksRunes = 1000
	maxExamMarkEntries   = 200

	examMarkIndex = "studentexammark_exam_subject_id_student_id"

	examMarkStatusValues = "status must be one of marked, absent or exempt"
	examMarkSittingElse  = "that exam sitting belongs to a different exam subject"
	examMarkTaken        = "a mark for that pupil on that paper already exists; amend it instead"
	examMarkNotEnrolled  = "exam_marks_not_enrolled: those pupils are not actively enrolled in " +
		"the subject offering this paper belongs to"
	examMarkUnreachable = "exam_marks_unreachable: your grant of " +
		string(authorization.TimetableWrite) + " does not reach those pupils"
)

type examMarkPayload struct {
	ExamSubjectID *uuid.UUID `json:"exam_subject_id"`
	StudentID     *uuid.UUID `json:"student_id"`
	ExamSittingID *uuid.UUID `json:"exam_sitting_id"`
	Status        *string    `json:"status"`
	MarksObtained *float64   `json:"marks_obtained"`
	Remarks       *string    `json:"remarks"`
}

type examMarkEntryPayload struct {
	StudentID     *uuid.UUID `json:"student_id"`
	Status        *string    `json:"status"`
	MarksObtained *float64   `json:"marks_obtained"`
	Remarks       *string    `json:"remarks"`
}

type examMarkBatchPayload struct {
	ExamSubjectID *uuid.UUID             `json:"exam_subject_id"`
	ExamSittingID *uuid.UUID             `json:"exam_sitting_id"`
	Marks         []examMarkEntryPayload `json:"marks"`
}

func (s *Server) mountExamMarks(r chi.Router) {
	r.Route("/exam-marks", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/", s.listExamMarks)
		r.With(s.can(authorization.TimetableWrite)).Post("/", s.createExamMark)
		r.With(s.can(authorization.TimetableWrite)).Post("/batch", s.recordExamMarks)
		r.With(s.can(authorization.TimetableRead)).Get(uuidParam, s.getExamMark)
		r.With(s.can(authorization.TimetableWrite)).Patch(uuidParam, s.updateExamMark)
		r.With(s.can(authorization.TimetableDelete)).Delete(uuidParam, s.deleteExamMark)
	})
}

func noExamSubject() predicate.ExamSubject { return entexamsubject.IDIn() }

func anyExamSubject() predicate.ExamSubject { return func(*sql.Selector) {} }

func markableExamSubjects(v *access.Viewer, d authorization.Decision) predicate.ExamSubject {
	if v == nil {
		return noExamSubject()
	}
	if v.Unrestricted {
		return anyExamSubject()
	}
	if d.HasReach && d.Reach != authorization.ReachTeacherAssignment {
		if d.Reach == authorization.ReachTenant {
			return anyExamSubject()
		}
		return noExamSubject()
	}
	if len(v.SubjectOfferingIDs) == 0 {
		return noExamSubject()
	}
	return entexamsubject.SubjectOfferingIDIn(v.SubjectOfferingIDs...)
}

func examMarksFor(v *access.Viewer, d authorization.Decision) []predicate.StudentExamMark {
	if v == nil {
		return []predicate.StudentExamMark{entexammark.IDIn()}
	}
	arms := []predicate.StudentExamMark{
		entexammark.HasStudentWith(access.StudentsForAcademic(v, d)),
	}
	if subjects := examSubjectScope(v, d); len(subjects) > 0 {
		arms = append(arms, entexammark.HasExamSubjectWith(subjects...))
	}
	return arms
}

func examMarksWritableBy(v *access.Viewer, d authorization.Decision) []predicate.StudentExamMark {
	if v == nil {
		return []predicate.StudentExamMark{entexammark.IDIn()}
	}
	return []predicate.StudentExamMark{
		entexammark.HasStudentWith(access.StudentsForAcademic(v, d)),
		entexammark.HasExamSubjectWith(markableExamSubjects(v, d)),
	}
}

func examMarkStatus(w http.ResponseWriter, raw *string) (entexammark.Status, bool) {
	if raw == nil {
		return entexammark.DefaultStatus, true
	}
	status := entexammark.Status(*raw)
	if err := entexammark.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, examMarkStatusValues)
		return "", false
	}
	return status, true
}

func examMarkRefusal(status entexammark.Status, value *float64, maximum float64) (int, string) {
	if status != entexammark.StatusMarked {
		if value != nil {
			return http.StatusUnprocessableEntity,
				"a pupil recorded as " + string(status) + " has no " +
					entexammark.FieldMarksObtained + "; clear it, or record them as marked"
		}
		return 0, ""
	}
	if value == nil {
		return http.StatusBadRequest,
			entexammark.FieldMarksObtained + " is required when the status is marked; " +
				"record absent or exempt if the pupil did not sit the paper"
	}
	if *value < 0 {
		return http.StatusBadRequest, entexammark.FieldMarksObtained + " must not be negative"
	}
	if *value > maximum {
		return http.StatusUnprocessableEntity,
			entexammark.FieldMarksObtained + " must not exceed the " +
				entexamsubject.FieldMaximumMarks + " the paper carries, which is " + marks(maximum)
	}
	return 0, ""
}

func markableSubject(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	id uuid.UUID, v *access.Viewer, d authorization.Decision) (*tenantent.ExamSubject, bool) {
	row, err := client.ExamSubject.Query().
		Where(entexamsubject.ID(id), markableExamSubjects(v, d)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return nil, false
	}
	return row, true
}

func sittingBelongsToSubject(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	subjectID uuid.UUID, sittingID *uuid.UUID) bool {
	if sittingID == nil {
		return true
	}
	found, err := client.ExamSitting.Query().
		Where(entsitting.ID(*sittingID), entsitting.ExamSubjectID(subjectID)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !found {
		response.Error(w, http.StatusUnprocessableEntity, examMarkSittingElse)
		return false
	}
	return true
}

func unreachableStudents(ctx context.Context, client *tenantent.Client, students []uuid.UUID,
	v *access.Viewer, d authorization.Decision) ([]uuid.UUID, error) {
	reachable, err := client.Student.Query().
		Where(entstudent.IDIn(students...), access.StudentsForAcademic(v, d)).
		IDs(ctx)
	if err != nil {
		return nil, err
	}

	known := make(map[uuid.UUID]struct{}, len(reachable))
	for _, id := range reachable {
		known[id] = struct{}{}
	}

	var out []uuid.UUID
	for _, id := range students {
		if _, ok := known[id]; !ok {
			out = append(out, id)
		}
	}
	return out, nil
}

func (s *Server) listExamMarks(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	examSubjectID := p.UUID("exam_subject_id")
	examID := p.UUID("exam_id")
	studentID := p.UUID("student_id")
	status := p.Enum("status", func(v string) error {
		return entexammark.StatusValidator(entexammark.Status(v))
	})
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := client.StudentExamMark.Query().Where(examMarksFor(viewer, decision)...)
	if examSubjectID != nil {
		q = q.Where(entexammark.ExamSubjectID(*examSubjectID))
	}
	if examID != nil {
		q = q.Where(entexammark.HasExamSubjectWith(entexamsubject.ExamID(*examID)))
	}
	if studentID != nil {
		q = q.Where(entexammark.StudentID(*studentID))
	}
	if status != nil {
		q = q.Where(entexammark.StatusEQ(entexammark.Status(*status)))
	}

	rows, err := q.
		Order(
			tenantent.Asc(entexammark.FieldExamSubjectID),
			tenantent.Asc(entexammark.FieldStudentID),
			tenantent.Asc(entexammark.FieldID),
		).
		Limit(limit).Offset(offset).
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
		"exam_marks": projected,
		"count":      len(rows),
		"page":       pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) getExamMark(w http.ResponseWriter, r *http.Request) {
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

	row, err := client.StudentExamMark.Query().
		Where(append(examMarksFor(viewer, decision), entexammark.ID(id))...).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examMarkNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, response.Envelope{"exam_mark": projected})
}

func (s *Server) createExamMark(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in examMarkPayload
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
	if !rejectUnauthorizedFields(w, r, decision,
		entexammark.Columns, columnsSent(sent, entexammark.ValidColumn)) {
		return
	}

	if in.ExamSubjectID == nil || in.StudentID == nil {
		response.Error(w, http.StatusBadRequest, "exam_subject_id and student_id are required")
		return
	}
	if in.Remarks != nil &&
		!withinRunes(w, entexammark.FieldRemarks, *in.Remarks, examMarkRemarksRunes) {
		return
	}

	status, ok := examMarkStatus(w, in.Status)
	if !ok {
		return
	}

	subject, ok := markableSubject(ctx, w, client, *in.ExamSubjectID, viewer, decision)
	if !ok {
		return
	}
	if code, why := examMarkRefusal(status, in.MarksObtained, subject.MaximumMarks); code != 0 {
		response.Error(w, code, why)
		return
	}
	if !sittingBelongsToSubject(ctx, w, client, subject.ID, in.ExamSittingID) {
		return
	}
	if !s.markableRoster(ctx, w, client, subject, []uuid.UUID{*in.StudentID}, viewer, decision) {
		return
	}

	row, err := client.StudentExamMark.Create().
		SetExamSubjectID(subject.ID).
		SetStudentID(*in.StudentID).
		SetNillableExamSittingID(in.ExamSittingID).
		SetStatus(status).
		SetNillableMarksObtained(in.MarksObtained).
		SetNillableRemarks(in.Remarks).
		SetNillableMarkedBy(viewer.PersonID).
		SetMarkedAt(nowUTC()).
		Save(ctx)
	if err != nil {
		if violates(err, examMarkIndex) {
			response.Error(w, http.StatusConflict, examMarkTaken)
			return
		}
		writeTenantEntErr(w, err, examMarkNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/exam-marks/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"exam_mark": row})
}

func (s *Server) markableRoster(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	subject *tenantent.ExamSubject, students []uuid.UUID,
	v *access.Viewer, d authorization.Decision) bool {
	beyond, err := unreachableStudents(ctx, client, students, v, d)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if len(beyond) > 0 {
		if len(students) == 1 {
			response.Error(w, http.StatusNotFound, examMarkStudentGone)
			return false
		}
		refuseStudents(w, "unreachable", examMarkUnreachable, beyond)
		return false
	}

	outside, err := notEnrolledInOffering(ctx, client, subject.SubjectOfferingID, students)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if len(outside) > 0 {
		refuseStudents(w, "not_enrolled", examMarkNotEnrolled, outside)
		return false
	}
	return true
}

func (s *Server) updateExamMark(w http.ResponseWriter, r *http.Request) {
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

	var in examMarkPayload
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
	if !rejectUnauthorizedFields(w, r, decision,
		entexammark.Columns, columnsSent(sent, entexammark.ValidColumn)) {
		return
	}
	if in.Remarks != nil &&
		!withinRunes(w, entexammark.FieldRemarks, *in.Remarks, examMarkRemarksRunes) {
		return
	}

	current, err := client.StudentExamMark.Query().
		Where(append(examMarksWritableBy(viewer, decision), entexammark.ID(id))...).
		WithExamSubject().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examMarkNotFound)
		return
	}
	if current.Edges.ExamSubject == nil {
		response.Error(w, http.StatusNotFound, examSubjectNotFound)
		return
	}

	status := current.Status
	if in.Status != nil {
		status, ok = examMarkStatus(w, in.Status)
		if !ok {
			return
		}
	}

	value := current.MarksObtained
	if in.MarksObtained != nil {
		value = in.MarksObtained
	}
	if wasCleared(sent, "marks_obtained", in.MarksObtained) {
		value = nil
	}

	if code, why := examMarkRefusal(status, value, current.Edges.ExamSubject.MaximumMarks); code != 0 {
		response.Error(w, code, why)
		return
	}
	if !sittingBelongsToSubject(ctx, w, client, current.ExamSubjectID, in.ExamSittingID) {
		return
	}

	amend := client.StudentExamMark.Update().
		Where(append(examMarksWritableBy(viewer, decision), entexammark.ID(id))...).
		SetStatus(status).
		SetNillableMarkedBy(viewer.PersonID).
		SetMarkedAt(nowUTC())

	if value == nil {
		amend = amend.ClearMarksObtained()
	} else {
		amend = amend.SetMarksObtained(*value)
	}
	if status != entexammark.StatusMarked {
		amend = amend.SetProvisional(false)
	}
	if in.ExamSittingID != nil {
		amend = amend.SetExamSittingID(*in.ExamSittingID)
	} else if wasCleared(sent, "exam_sitting_id", in.ExamSittingID) {
		amend = amend.ClearExamSittingID()
	}
	if in.Remarks != nil {
		amend = amend.SetRemarks(*in.Remarks)
	} else if wasCleared(sent, "remarks", in.Remarks) {
		amend = amend.ClearRemarks()
	}

	n, err := amend.Save(ctx)
	if !wroteScopedRow(w, n, err, examMarkNotFound) {
		return
	}

	row, err := client.StudentExamMark.Query().Where(entexammark.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examMarkNotFound)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"exam_mark": row})
}

type examMarkEntry struct {
	studentID uuid.UUID
	status    entexammark.Status
	value     *float64
	remarks   *string
}

func examMarkFieldsSent(sent []string, in examMarkBatchPayload) []string {
	out := make([]string, 0, len(sent)+4)
	for _, name := range sent {
		if entexammark.ValidColumn(name) {
			out = append(out, name)
		}
	}
	out = append(out, entexammark.FieldStudentID, entexammark.FieldStatus)

	for _, entry := range in.Marks {
		if entry.MarksObtained != nil && !wasSent(out, entexammark.FieldMarksObtained) {
			out = append(out, entexammark.FieldMarksObtained)
		}
		if entry.Remarks != nil && !wasSent(out, entexammark.FieldRemarks) {
			out = append(out, entexammark.FieldRemarks)
		}
	}
	return out
}

func refuseExamMarkRow(w http.ResponseWriter, code, index int, student uuid.UUID, why string) {
	response.JSON(w, code, response.Envelope{
		"error":      http.StatusText(code),
		"message":    why,
		"index":      index,
		"student_id": student,
	})
}

func planExamMarks(w http.ResponseWriter, entries []examMarkEntryPayload,
	maximum float64) ([]examMarkEntry, bool) {
	if len(entries) == 0 {
		response.Error(w, http.StatusBadRequest, "marks must name at least one pupil")
		return nil, false
	}
	if len(entries) > maxExamMarkEntries {
		response.Error(w, http.StatusBadRequest,
			"marks must not exceed "+strconv.Itoa(maxExamMarkEntries)+" pupils in one request")
		return nil, false
	}

	seen := make(map[uuid.UUID]struct{}, len(entries))
	planned := make([]examMarkEntry, 0, len(entries))

	for i, entry := range entries {
		if entry.StudentID == nil {
			response.Error(w, http.StatusBadRequest, "every entry in marks needs a student_id")
			return nil, false
		}
		if _, dup := seen[*entry.StudentID]; dup {
			refuseExamMarkRow(w, http.StatusUnprocessableEntity, i, *entry.StudentID,
				"marks name that pupil more than once, so which number is theirs is not decidable")
			return nil, false
		}
		seen[*entry.StudentID] = struct{}{}

		status := entexammark.DefaultStatus
		if entry.Status != nil {
			status = entexammark.Status(*entry.Status)
			if err := entexammark.StatusValidator(status); err != nil {
				refuseExamMarkRow(w, http.StatusBadRequest, i, *entry.StudentID, examMarkStatusValues)
				return nil, false
			}
		}
		if code, why := examMarkRefusal(status, entry.MarksObtained, maximum); code != 0 {
			refuseExamMarkRow(w, code, i, *entry.StudentID, why)
			return nil, false
		}
		if entry.Remarks != nil &&
			!withinRunes(w, entexammark.FieldRemarks, *entry.Remarks, examMarkRemarksRunes) {
			return nil, false
		}

		planned = append(planned, examMarkEntry{
			studentID: *entry.StudentID,
			status:    status,
			value:     entry.MarksObtained,
			remarks:   entry.Remarks,
		})
	}
	return planned, true
}

func plannedStudents(planned []examMarkEntry) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(planned))
	for _, entry := range planned {
		out = append(out, entry.studentID)
	}
	return out
}

func existingExamMarks(ctx context.Context, client *tenantent.Client,
	subjectID uuid.UUID, students []uuid.UUID) (map[uuid.UUID]uuid.UUID, error) {
	rows, err := client.StudentExamMark.Query().
		Where(entexammark.ExamSubjectID(subjectID), entexammark.StudentIDIn(students...)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	index := make(map[uuid.UUID]uuid.UUID, len(rows))
	for _, row := range rows {
		index[row.StudentID] = row.ID
	}
	return index, nil
}

type examMarkPlan struct {
	subjectID uuid.UUID
	sittingID *uuid.UUID
	markedBy  *uuid.UUID
	markedAt  time.Time
}

func (p examMarkPlan) create(c *tenantent.Client, entry examMarkEntry) *tenantent.StudentExamMarkCreate {
	return c.StudentExamMark.Create().
		SetExamSubjectID(p.subjectID).
		SetStudentID(entry.studentID).
		SetNillableExamSittingID(p.sittingID).
		SetStatus(entry.status).
		SetNillableMarksObtained(entry.value).
		SetNillableRemarks(entry.remarks).
		SetNillableMarkedBy(p.markedBy).
		SetMarkedAt(p.markedAt)
}

func (p examMarkPlan) amend(c *tenantent.Client, id uuid.UUID, entry examMarkEntry,
	v *access.Viewer, d authorization.Decision) *tenantent.StudentExamMarkUpdate {
	amend := c.StudentExamMark.Update().
		Where(append(examMarksWritableBy(v, d), entexammark.ID(id))...).
		SetStatus(entry.status).
		SetNillableMarkedBy(p.markedBy).
		SetMarkedAt(p.markedAt)

	if entry.value == nil {
		amend = amend.ClearMarksObtained()
	} else {
		amend = amend.SetMarksObtained(*entry.value)
	}
	if entry.status != entexammark.StatusMarked {
		amend = amend.SetProvisional(false)
	}
	if p.sittingID == nil {
		amend = amend.ClearExamSittingID()
	} else {
		amend = amend.SetExamSittingID(*p.sittingID)
	}
	if entry.remarks == nil {
		amend = amend.ClearRemarks()
	} else {
		amend = amend.SetRemarks(*entry.remarks)
	}
	return amend
}

type examMarkOutcome struct {
	created     []uuid.UUID
	createdFor  []uuid.UUID
	updated     []uuid.UUID
	unreachable []uuid.UUID
}

func (o examMarkOutcome) touched() []uuid.UUID {
	return append(append([]uuid.UUID{}, o.created...), o.updated...)
}

func applyExamMarks(ctx context.Context, c *tenantent.Client, plan examMarkPlan,
	planned []examMarkEntry, existing map[uuid.UUID]uuid.UUID,
	v *access.Viewer, d authorization.Decision) (examMarkOutcome, error) {
	var outcome examMarkOutcome

	for _, entry := range planned {
		if id, known := existing[entry.studentID]; known {
			n, err := plan.amend(c, id, entry, v, d).Save(ctx)
			if err != nil {
				return outcome, err
			}
			if n == 0 {
				outcome.unreachable = append(outcome.unreachable, entry.studentID)
				continue
			}
			outcome.updated = append(outcome.updated, id)
			continue
		}

		row, err := plan.create(c, entry).Save(ctx)
		if err != nil {
			return outcome, err
		}
		outcome.created = append(outcome.created, row.ID)
		outcome.createdFor = append(outcome.createdFor, entry.studentID)
	}

	if len(outcome.created) == 0 {
		return outcome, nil
	}

	reachable, err := c.StudentExamMark.Query().
		Where(append(examMarksWritableBy(v, d), entexammark.IDIn(outcome.created...))...).
		IDs(ctx)
	if err != nil {
		return outcome, err
	}
	outcome.unreachable = append(outcome.unreachable,
		missingStudents(outcome.created, outcome.createdFor, reachable)...)
	return outcome, nil
}

func (s *Server) recordExamMarks(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in examMarkBatchPayload
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
	if !rejectUnauthorizedFields(w, r, decision,
		entexammark.Columns, examMarkFieldsSent(sent, in)) {
		return
	}
	if in.ExamSubjectID == nil {
		response.Error(w, http.StatusBadRequest, "exam_subject_id is required")
		return
	}

	subject, ok := markableSubject(ctx, w, client, *in.ExamSubjectID, viewer, decision)
	if !ok {
		return
	}
	planned, ok := planExamMarks(w, in.Marks, subject.MaximumMarks)
	if !ok {
		return
	}
	if !sittingBelongsToSubject(ctx, w, client, subject.ID, in.ExamSittingID) {
		return
	}

	students := plannedStudents(planned)
	if !s.markableRoster(ctx, w, client, subject, students, viewer, decision) {
		return
	}

	existing, err := existingExamMarks(ctx, client, subject.ID, students)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	work, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	plan := examMarkPlan{
		subjectID: subject.ID,
		sittingID: in.ExamSittingID,
		markedBy:  viewer.PersonID,
		markedAt:  nowUTC(),
	}

	outcome, err := applyExamMarks(ctx, work.writer, plan, planned, existing, viewer, decision)
	if err != nil {
		work.rollback()
		writeTenantEntErr(w, err, examMarkNotFound)
		return
	}
	if len(outcome.unreachable) > 0 {
		work.rollback()
		refuseStudents(w, "unreachable", examMarkUnreachable, outcome.unreachable)
		return
	}
	if err := work.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}

	s.writeExamMarkResult(ctx, w, r, client, outcome)
}

func (s *Server) writeExamMarkResult(ctx context.Context, w http.ResponseWriter, r *http.Request,
	client *tenantent.Client, outcome examMarkOutcome) {
	_, decision, err := s.scopeFor(ctx, authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := client.StudentExamMark.Query().
		Where(entexammark.IDIn(outcome.touched()...)).
		Order(tenantent.Asc(entexammark.FieldStudentID), tenantent.Asc(entexammark.FieldID)).
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
		"exam_marks": projected,
		"created":    len(outcome.created),
		"updated":    len(outcome.updated),
		"count":      len(rows),
	})
}

func (s *Server) deleteExamMark(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, examMarkNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, client *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return client.StudentExamMark.Delete().
				Where(append(examMarksWritableBy(v, d), entexammark.ID(id))...).
				Exec(ctx)
		})
}
