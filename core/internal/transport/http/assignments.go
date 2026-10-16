package http

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	entitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentitem"
	entsubmission "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentsubmission"
	entresponse "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentsubmissionitem"
	enttarget "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmenttarget"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entcomponent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponent"
	entcomponentassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentassignment"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	assignmentTitleRunes       = 200
	assignmentTextRunes        = 20000
	submissionResponseRunes    = 20000
	submissionFeedbackRunes    = 5000
	maxAssignmentTargets       = 50
	assignmentNotFound         = "assignment not found"
	assignmentItemNotFound     = "assignment item not found"
	submissionNotFound         = "assignment submission not found"
	responseNotFound           = "assignment submission item not found"
	notYoursToSubmit           = "you may only record your own work"
	assignmentNotOpen          = "that assignment is not open for submissions"
	assignmentStatusValues     = "status must be draft, published or closed"
	assignmentTypeValues       = "assignment_type must be worksheet, project, reading, practice or test"
	assignmentTargetTypeValues = "target_type must be section, student or offering"
	submissionStatusValues     = "status must be draft, submitted, graded or returned"
)

type assignmentTargetPayload struct {
	TargetType *string    `json:"target_type"`
	TargetID   *uuid.UUID `json:"target_id"`
}

type assignmentPayload struct {
	AcademicSessionID    *uuid.UUID                `json:"academic_session_id"`
	SubjectOfferingID    *uuid.UUID                `json:"subject_offering_id"`
	Title                *string                   `json:"title"`
	Description          *string                   `json:"description"`
	Instructions         *string                   `json:"instructions"`
	AssignmentType       *string                   `json:"assignment_type"`
	ContentID            *uuid.UUID                `json:"content_id"`
	AvailableFrom        *string                   `json:"available_from"`
	DueAt                *string                   `json:"due_at"`
	LateSubmissionAllowe *bool                     `json:"late_submission_allowed"`
	MaxAttempts          *int                      `json:"max_attempts"`
	MaximumMarks         *float64                  `json:"maximum_marks"`
	Status               *string                   `json:"status"`
	Targets              []assignmentTargetPayload `json:"targets"`
}

type assignmentItemPayload struct {
	ContentItemID *uuid.UUID `json:"content_item_id"`
	QuestionID    *uuid.UUID `json:"question_id"`
	Position      *int       `json:"position"`
	Marks         *float64   `json:"marks"`
	Required      *bool      `json:"required"`
}

type submissionPayload struct {
	StudentID *uuid.UUID `json:"student_id"`
}

type responsePayload struct {
	AssignmentItemID   *uuid.UUID `json:"assignment_item_id"`
	ResponseText       *string    `json:"response_text"`
	AssetID            *uuid.UUID `json:"asset_id"`
	QuestionResponseID *uuid.UUID `json:"question_response_id"`
}

type gradePayload struct {
	Status        *string  `json:"status"`
	MarksObtained *float64 `json:"marks_obtained"`
	TotalMarks    *float64 `json:"total_marks"`
}

type gradeItemPayload struct {
	MarksObtained *float64 `json:"marks_obtained"`
	Feedback      *string  `json:"feedback"`
}

func assignmentStatus(w http.ResponseWriter, raw *string) (entassignment.Status, bool) {
	status := entassignment.Status(*raw)
	if err := entassignment.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, assignmentStatusValues)
		return "", false
	}
	return status, true
}

func assignmentType(w http.ResponseWriter, raw *string) (entassignment.AssignmentType, bool) {
	kind := entassignment.AssignmentType(*raw)
	if err := entassignment.AssignmentTypeValidator(kind); err != nil {
		response.Error(w, http.StatusBadRequest, assignmentTypeValues)
		return "", false
	}
	return kind, true
}

func submissionStatus(w http.ResponseWriter, raw *string) (entsubmission.Status, bool) {
	status := entsubmission.Status(*raw)
	if err := entsubmission.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, submissionStatusValues)
		return "", false
	}
	return status, true
}

type assignmentFilters struct {
	AcademicSessionID *uuid.UUID
	SubjectOfferingID *uuid.UUID
	TeacherID         *uuid.UUID
	Status            *entassignment.Status
	DueFrom           *time.Time
	DueTo             *time.Time

	TargetType *enttarget.TargetType
	TargetIDs  []uuid.UUID

	Limit  int
	Offset int
}

func parseAssignmentFilters(values url.Values) (assignmentFilters, error) {
	p := filter.New(values)

	f := assignmentFilters{
		AcademicSessionID: p.UUID("academic_session_id"),
		SubjectOfferingID: p.UUID("subject_offering_id"),
		TeacherID:         p.UUID("teacher_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	ids, err := targetIDList(p.String("target_id"))
	if err != nil {
		return assignmentFilters{}, err
	}
	f.TargetIDs = ids

	if raw := p.Enum("status", func(v string) error {
		return entassignment.StatusValidator(entassignment.Status(v))
	}); raw != nil {
		status := entassignment.Status(*raw)
		f.Status = &status
	}
	if raw := p.Enum("target_type", func(v string) error {
		return enttarget.TargetTypeValidator(enttarget.TargetType(v))
	}); raw != nil {
		kind := enttarget.TargetType(*raw)
		f.TargetType = &kind
	}

	from, to, err := parseDateWindow(p)
	if err != nil {
		return assignmentFilters{}, err
	}
	f.DueFrom, f.DueTo = from, to

	if err := p.Err(); err != nil {
		return assignmentFilters{}, err
	}
	return f, nil
}

func (f assignmentFilters) apply(q *tenantent.AssignmentQuery) *tenantent.AssignmentQuery {
	if f.AcademicSessionID != nil {
		q = q.Where(entassignment.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.SubjectOfferingID != nil {
		q = q.Where(entassignment.SubjectOfferingID(*f.SubjectOfferingID))
	}
	if f.TeacherID != nil {
		q = q.Where(entassignment.TeacherID(*f.TeacherID))
	}
	if f.Status != nil {
		q = q.Where(entassignment.StatusEQ(*f.Status))
	}
	if f.DueFrom != nil {
		q = q.Where(entassignment.DueAtGTE(*f.DueFrom))
	}
	if f.DueTo != nil {
		q = q.Where(entassignment.DueAtLTE(f.DueTo.Add(24 * time.Hour)))
	}

	var narrow []predicate.AssignmentTarget
	if f.TargetType != nil {
		narrow = append(narrow, enttarget.TargetTypeEQ(*f.TargetType))
	}
	if len(f.TargetIDs) > 0 {
		narrow = append(narrow, enttarget.TargetIDIn(f.TargetIDs...))
	}
	if len(narrow) > 0 {
		q = q.Where(entassignment.HasTargetsWith(narrow...))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type submissionFilters struct {
	AssignmentID *uuid.UUID
	StudentID    *uuid.UUID
	Status       *entsubmission.Status
	Late         bool

	Limit  int
	Offset int
}

func parseSubmissionFilters(values url.Values) (submissionFilters, error) {
	p := filter.New(values)

	f := submissionFilters{
		AssignmentID: p.UUID("assignment_id"),
		StudentID:    p.UUID("student_id"),
		Late:         p.Bool("late"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("status", func(v string) error {
		return entsubmission.StatusValidator(entsubmission.Status(v))
	}); raw != nil {
		status := entsubmission.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return submissionFilters{}, err
	}
	return f, nil
}

func (f submissionFilters) apply(q *tenantent.AssignmentSubmissionQuery) *tenantent.AssignmentSubmissionQuery {
	if f.AssignmentID != nil {
		q = q.Where(entsubmission.AssignmentID(*f.AssignmentID))
	}
	if f.StudentID != nil {
		q = q.Where(entsubmission.StudentID(*f.StudentID))
	}
	if f.Status != nil {
		q = q.Where(entsubmission.StatusEQ(*f.Status))
	}
	if f.Late {
		q = q.Where(entsubmission.Late(true))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func decodeAssignmentTargets(w http.ResponseWriter, in []assignmentTargetPayload) ([]resolvedAssignmentTarget, bool) {
	if len(in) == 0 {
		response.Error(w, http.StatusBadRequest,
			"targets is required: work set to nobody is not work")
		return nil, false
	}
	if len(in) > maxAssignmentTargets {
		response.Error(w, http.StatusUnprocessableEntity,
			"an assignment may name at most 50 targets")
		return nil, false
	}

	seen := map[resolvedAssignmentTarget]struct{}{}
	out := make([]resolvedAssignmentTarget, 0, len(in))
	for _, raw := range in {
		if raw.TargetType == nil || raw.TargetID == nil {
			response.Error(w, http.StatusBadRequest,
				"each target needs a target_type and a target_id")
			return nil, false
		}
		kind := enttarget.TargetType(*raw.TargetType)
		if err := enttarget.TargetTypeValidator(kind); err != nil {
			response.Error(w, http.StatusBadRequest, assignmentTargetTypeValues)
			return nil, false
		}
		target := resolvedAssignmentTarget{kind: kind, id: *raw.TargetID}
		if _, dup := seen[target]; dup {
			response.Error(w, http.StatusUnprocessableEntity,
				"the same target is named twice; each target row must be distinct")
			return nil, false
		}
		seen[target] = struct{}{}
		out = append(out, target)
	}
	return out, true
}

type resolvedAssignmentTarget struct {
	kind enttarget.TargetType
	id   uuid.UUID
}

func assignmentTargetExists(ctx context.Context, client *tenantent.Client,
	t resolvedAssignmentTarget) (bool, error) {
	switch t.kind {
	case enttarget.TargetTypeSection:
		return client.Section.Query().Where(entsection.ID(t.id)).Exist(ctx)
	case enttarget.TargetTypeOffering:
		return client.SubjectOffering.Query().Where(entoffering.ID(t.id)).Exist(ctx)
	case enttarget.TargetTypeStudent:
		return client.Student.Query().Where(entstudent.ID(t.id)).Exist(ctx)
	default:
		return false, nil
	}
}

func assignmentTargetWithin(a *access.Audience, t resolvedAssignmentTarget) bool {
	if a == nil {
		return false
	}
	if a.All {
		return true
	}

	switch t.kind {
	case enttarget.TargetTypeSection:
		return carriesID(a.Sections, t.id)
	case enttarget.TargetTypeOffering:
		return carriesID(a.Offerings, t.id)
	case enttarget.TargetTypeStudent:
		return carriesID(a.Students, t.id)
	default:
		return false
	}
}

func checkAssignmentTargets(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	audience *access.Audience, targets []resolvedAssignmentTarget) bool {
	for _, t := range targets {
		found, err := assignmentTargetExists(ctx, client, t)
		if err != nil {
			writeTenancyErr(w, err)
			return false
		}
		if !found {
			response.Error(w, http.StatusUnprocessableEntity,
				"the "+string(t.kind)+" target "+t.id.String()+" does not name a row that exists")
			return false
		}
		if !assignmentTargetWithin(audience, t) {
			response.Error(w, http.StatusForbidden,
				"your grant of "+string(authorization.AssignmentsWrite)+" does not reach the "+
					string(t.kind)+" target "+t.id.String())
			return false
		}
	}
	return true
}

func (s *Server) assignmentRead(ctx context.Context, narrow, wide authorization.Entity) (
	*access.Viewer, authorization.Decision, *access.Audience, error) {
	return s.streamRead(ctx, narrow, wide)
}

func (s *Server) assignmentWrite(ctx context.Context, narrow, wide authorization.Entity) (
	*access.Viewer, authorization.Decision, *access.Audience, error) {
	return s.streamWrite(ctx, narrow, wide)
}

func (s *Server) listAssignments(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseAssignmentFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	_, decision, audience, err := s.assignmentRead(ctx,
		authorization.AssignmentsRead, authorization.AssignmentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.Assignment.Query().Where(access.AssignmentsFor(audience))

	rows, err := filters.apply(q).
		Order(tenantent.Asc(entassignment.FieldDueAt), tenantent.Desc(entassignment.FieldCreatedAt)).
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
		"assignments": projected,
		"count":       len(rows),
		"page":        pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getAssignment(w http.ResponseWriter, r *http.Request) {
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

	_, decision, audience, err := s.assignmentRead(ctx,
		authorization.AssignmentsRead, authorization.AssignmentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Assignment.Query().
		Where(entassignment.ID(id), access.AssignmentsFor(audience)).
		WithTargets().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, response.Envelope{
		"assignment": projected,
		"targets":    row.Edges.Targets,
	})
}

func assignmentMarks(w http.ResponseWriter, marks *float64, name string) bool {
	if marks == nil {
		return true
	}
	if *marks < 0 {
		response.Error(w, http.StatusBadRequest, name+" must not be negative")
		return false
	}
	return true
}

func (s *Server) createAssignment(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in assignmentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentsWrite, authorization.AssignmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entassignment.Columns, columnsSent(sent, entassignment.ValidColumn)) {
		return
	}
	if wasSent(sent, entassignment.FieldTeacherID) {
		response.Error(w, http.StatusUnprocessableEntity,
			entassignment.FieldTeacherID+" is taken from the caller and must not be supplied")
		return
	}
	if viewer.TeacherID == nil {
		response.Error(w, http.StatusForbidden,
			"an assignment records the teacher who set it, and this caller is not a teacher")
		return
	}

	if in.AcademicSessionID == nil {
		response.Error(w, http.StatusBadRequest,
			entassignment.FieldAcademicSessionID+" is required")
		return
	}
	if in.Title == nil || *in.Title == "" {
		response.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	if !withinRunes(w, entassignment.FieldTitle, *in.Title, assignmentTitleRunes) {
		return
	}
	if in.Description != nil &&
		!withinRunes(w, entassignment.FieldDescription, *in.Description, assignmentTextRunes) {
		return
	}
	if in.Instructions != nil &&
		!withinRunes(w, entassignment.FieldInstructions, *in.Instructions, assignmentTextRunes) {
		return
	}
	if !assignmentMarks(w, in.MaximumMarks, entassignment.FieldMaximumMarks) {
		return
	}
	if in.MaxAttempts != nil && *in.MaxAttempts < 1 {
		response.Error(w, http.StatusBadRequest,
			entassignment.FieldMaxAttempts+" must be at least one")
		return
	}

	targets, ok := decodeAssignmentTargets(w, in.Targets)
	if !ok {
		return
	}
	if !checkAssignmentTargets(ctx, w, client, audience, targets) {
		return
	}
	if in.SubjectOfferingID != nil && !audience.All &&
		!carriesID(audience.Offerings, *in.SubjectOfferingID) {
		response.Error(w, http.StatusForbidden,
			"your grant of "+string(authorization.AssignmentsWrite)+" does not reach the "+
				entassignment.FieldSubjectOfferingID+" you named")
		return
	}

	availableFrom, ok := instantField(w, entassignment.FieldAvailableFrom, in.AvailableFrom)
	if !ok {
		return
	}
	dueAt, ok := instantField(w, entassignment.FieldDueAt, in.DueAt)
	if !ok {
		return
	}
	if availableFrom != nil && dueAt != nil && dueAt.Before(*availableFrom) {
		response.Error(w, http.StatusUnprocessableEntity,
			entassignment.FieldDueAt+" must not fall before "+entassignment.FieldAvailableFrom)
		return
	}

	create := client.Assignment.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetTeacherID(*viewer.TeacherID).
		SetNillableSubjectOfferingID(in.SubjectOfferingID).
		SetTitle(*in.Title).
		SetNillableDescription(in.Description).
		SetNillableInstructions(in.Instructions).
		SetNillableContentID(in.ContentID).
		SetNillableAvailableFrom(availableFrom).
		SetNillableDueAt(dueAt).
		SetNillableLateSubmissionAllowed(in.LateSubmissionAllowe).
		SetNillableMaxAttempts(in.MaxAttempts).
		SetNillableMaximumMarks(in.MaximumMarks)

	if in.AssignmentType != nil {
		kind, ok := assignmentType(w, in.AssignmentType)
		if !ok {
			return
		}
		create = create.SetAssignmentType(kind)
	}
	if in.Status != nil {
		status, ok := assignmentStatus(w, in.Status)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentNotFound)
		return
	}

	builders := make([]*tenantent.AssignmentTargetCreate, 0, len(targets))
	for _, t := range targets {
		builders = append(builders, client.AssignmentTarget.Create().
			SetAssignmentID(row.ID).
			SetTargetType(t.kind).
			SetTargetID(t.id))
	}
	saved, err := client.AssignmentTarget.CreateBulk(builders...).Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/assignments/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{
		"assignment": row,
		"targets":    saved,
	})
}

func assignmentMaximumWithdrawn(sent []string, marks *float64) bool {
	if !wasSent(sent, entassignment.FieldMaximumMarks) {
		return false
	}
	return marks == nil || *marks <= 0
}

func assignmentComposedInto(ctx context.Context, client *tenantent.Client,
	assignment uuid.UUID) ([]*tenantent.ResultComponent, error) {
	return client.ResultComponent.Query().
		Where(entcomponent.HasAssignmentsWith(entcomponentassignment.AssignmentID(assignment))).
		WithResultScheme().
		Order(tenantent.Asc(entcomponent.FieldName)).
		All(ctx)
}

func composedIntoNamed(holders []*tenantent.ResultComponent) string {
	parts := make([]string, 0, len(holders))
	for _, holder := range holders {
		part := "the component \"" + holder.Name + "\""
		if holder.Edges.ResultScheme != nil {
			part += " of the result scheme \"" + holder.Edges.ResultScheme.Name + "\""
		}
		parts = append(parts, part)
	}
	if len(parts) < 2 {
		return strings.Join(parts, "")
	}
	return strings.Join(parts[:len(parts)-1], ", ") + " and " + parts[len(parts)-1]
}

func keepsAssignmentMaximum(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	audience *access.Audience, id uuid.UUID, sent []string, in assignmentPayload) bool {

	if !assignmentMaximumWithdrawn(sent, in.MaximumMarks) {
		return true
	}

	row, err := client.Assignment.Query().
		Where(entassignment.ID(id), access.AssignmentsWritableBy(audience)).
		Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			return true
		}
		writeTenantEntErr(w, err, assignmentNotFound)
		return false
	}

	holders, err := assignmentComposedInto(ctx, client, id)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if len(holders) == 0 {
		return true
	}

	response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
		"error": "assignment_feeds_a_result",
		"message": "\"" + row.Title + "\" is scored into " + composedIntoNamed(holders) +
			", which takes the fraction it contributes out of its " +
			entassignment.FieldMaximumMarks + "; marked out of nothing that fraction is undefined " +
			"and the scheme could never be activated. Unlink it there first, or leave it a " +
			entassignment.FieldMaximumMarks + " above zero.",
	})
	return false
}

func rejectImmutableAssignmentFields(w http.ResponseWriter, sent []string) bool {
	for _, name := range []string{
		entassignment.FieldAcademicSessionID,
		entassignment.FieldTeacherID,
		entassignment.FieldSubjectOfferingID,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded when the assignment is created and cannot be changed")
			return false
		}
	}
	return true
}

func (s *Server) updateAssignment(w http.ResponseWriter, r *http.Request) {
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

	var in assignmentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentsWrite, authorization.AssignmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entassignment.Columns, columnsSent(sent, entassignment.ValidColumn)) {
		return
	}
	if !rejectImmutableAssignmentFields(w, sent) {
		return
	}
	if in.Targets != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"targets fix who the work is set to and cannot be changed; close this one and set another")
		return
	}

	if in.Title != nil {
		if *in.Title == "" {
			response.Error(w, http.StatusBadRequest, "title must not be empty")
			return
		}
		if !withinRunes(w, entassignment.FieldTitle, *in.Title, assignmentTitleRunes) {
			return
		}
	}
	if in.Description != nil &&
		!withinRunes(w, entassignment.FieldDescription, *in.Description, assignmentTextRunes) {
		return
	}
	if in.Instructions != nil &&
		!withinRunes(w, entassignment.FieldInstructions, *in.Instructions, assignmentTextRunes) {
		return
	}
	if !assignmentMarks(w, in.MaximumMarks, entassignment.FieldMaximumMarks) {
		return
	}
	if !keepsAssignmentMaximum(ctx, w, client, audience, id, sent, in) {
		return
	}

	availableFrom, ok := instantField(w, entassignment.FieldAvailableFrom, in.AvailableFrom)
	if !ok {
		return
	}
	dueAt, ok := instantField(w, entassignment.FieldDueAt, in.DueAt)
	if !ok {
		return
	}

	update := client.Assignment.Update().
		Where(entassignment.ID(id), access.AssignmentsWritableBy(audience)).
		SetNillableTitle(in.Title).
		SetNillableDescription(in.Description).
		SetNillableInstructions(in.Instructions).
		SetNillableContentID(in.ContentID).
		SetNillableAvailableFrom(availableFrom).
		SetNillableDueAt(dueAt).
		SetNillableLateSubmissionAllowed(in.LateSubmissionAllowe).
		SetNillableMaxAttempts(in.MaxAttempts).
		SetNillableMaximumMarks(in.MaximumMarks)

	if wasSent(sent, entassignment.FieldDueAt) && dueAt == nil {
		update = update.ClearDueAt()
	}
	if wasCleared(sent, entassignment.FieldMaximumMarks, in.MaximumMarks) {
		update = update.ClearMaximumMarks()
	}
	if in.AssignmentType != nil {
		kind, ok := assignmentType(w, in.AssignmentType)
		if !ok {
			return
		}
		update = update.SetAssignmentType(kind)
	}
	if in.Status != nil {
		status, ok := assignmentStatus(w, in.Status)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, assignmentNotFound) {
		return
	}

	row, err := client.Assignment.Query().Where(entassignment.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteAssignment(w http.ResponseWriter, r *http.Request) {
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

	_, _, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentsDelete, authorization.AssignmentsDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	n, err := client.Assignment.Delete().
		Where(entassignment.ID(id), access.AssignmentsWritableBy(audience)).
		Exec(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentNotFound)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, assignmentNotFound)
		return
	}
	response.NoContent(w)
}

func (s *Server) listAssignmentItems(w http.ResponseWriter, r *http.Request) {
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

	_, decision, audience, err := s.assignmentRead(ctx,
		authorization.AssignmentsRead, authorization.AssignmentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := client.AssignmentItem.Query().
		Where(entitem.AssignmentID(id), access.AssignmentItemsFor(audience)).
		Order(tenantent.Asc(entitem.FieldPosition)).
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
		"assignment_items": projected,
		"count":            len(rows),
	})
}

func (s *Server) createAssignmentItem(w http.ResponseWriter, r *http.Request) {
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

	var in assignmentItemPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentsWrite, authorization.AssignmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entitem.Columns, columnsSent(sent, entitem.ValidColumn)) {
		return
	}

	if in.Position == nil {
		response.Error(w, http.StatusBadRequest, "position is required")
		return
	}
	if *in.Position < 0 {
		response.Error(w, http.StatusBadRequest, "position must not be negative")
		return
	}
	if !assignmentMarks(w, in.Marks, entitem.FieldMarks) {
		return
	}

	found, err := client.Assignment.Query().
		Where(entassignment.ID(id), access.AssignmentsWritableBy(audience)).
		Exist(ctx)
	if !mustReach(w, found, err, assignmentNotFound) {
		return
	}

	row, err := client.AssignmentItem.Create().
		SetAssignmentID(id).
		SetPosition(*in.Position).
		SetNillableContentItemID(in.ContentItemID).
		SetNillableQuestionID(in.QuestionID).
		SetNillableMarks(in.Marks).
		SetNillableRequired(in.Required).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentItemNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/assignment-items/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateAssignmentItem(w http.ResponseWriter, r *http.Request) {
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

	var in assignmentItemPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentsWrite, authorization.AssignmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entitem.Columns, columnsSent(sent, entitem.ValidColumn)) {
		return
	}
	if in.Position != nil && *in.Position < 0 {
		response.Error(w, http.StatusBadRequest, "position must not be negative")
		return
	}
	if !assignmentMarks(w, in.Marks, entitem.FieldMarks) {
		return
	}

	n, err := client.AssignmentItem.Update().
		Where(entitem.ID(id), access.AssignmentItemsWritableBy(audience)).
		SetNillablePosition(in.Position).
		SetNillableContentItemID(in.ContentItemID).
		SetNillableQuestionID(in.QuestionID).
		SetNillableMarks(in.Marks).
		SetNillableRequired(in.Required).
		Save(ctx)
	if !wroteScopedRow(w, n, err, assignmentItemNotFound) {
		return
	}

	row, err := client.AssignmentItem.Query().Where(entitem.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentItemNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteAssignmentItem(w http.ResponseWriter, r *http.Request) {
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

	_, _, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentsDelete, authorization.AssignmentsDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	n, err := client.AssignmentItem.Delete().
		Where(entitem.ID(id), access.AssignmentItemsWritableBy(audience)).
		Exec(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentItemNotFound)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, assignmentItemNotFound)
		return
	}
	response.NoContent(w)
}

func (s *Server) listSubmissions(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseSubmissionFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	_, decision, audience, err := s.assignmentRead(ctx,
		authorization.AssignmentSubmissionsRead, authorization.AssignmentSubmissionsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.AssignmentSubmission.Query().Where(access.AssignmentSubmissionsFor(audience))

	rows, err := filters.apply(q).
		Order(tenantent.Desc(entsubmission.FieldCreatedAt)).
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
		"assignment_submissions": projected,
		"count":                  len(rows),
		"page":                   pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) listAssignmentSubmissions(w http.ResponseWriter, r *http.Request) {
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

	filters, err := parseSubmissionFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	_, decision, audience, err := s.assignmentRead(ctx,
		authorization.AssignmentSubmissionsRead, authorization.AssignmentSubmissionsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.AssignmentSubmission.Query().Where(
		entsubmission.AssignmentID(id),
		access.AssignmentSubmissionsFor(audience),
	)

	rows, err := filters.apply(q).
		Order(tenantent.Desc(entsubmission.FieldCreatedAt)).
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
		"assignment_submissions": projected,
		"count":                  len(rows),
		"page":                   pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getSubmission(w http.ResponseWriter, r *http.Request) {
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

	_, decision, audience, err := s.assignmentRead(ctx,
		authorization.AssignmentSubmissionsRead, authorization.AssignmentSubmissionsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.AssignmentSubmission.Query().
		Where(entsubmission.ID(id), access.AssignmentSubmissionsFor(audience)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, submissionNotFound)
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

func submissionStudentOf(w http.ResponseWriter, a *access.Audience,
	in submissionPayload) (uuid.UUID, bool) {
	if in.StudentID != nil {
		return *in.StudentID, true
	}
	if a != nil && len(a.SelfStudents) == 1 {
		return a.SelfStudents[0], true
	}
	response.Error(w, http.StatusBadRequest,
		entsubmission.FieldStudentID+" is required: this caller is not linked to exactly one pupil")
	return uuid.Nil, false
}

func studentReach(ctx context.Context, client *tenantent.Client,
	student uuid.UUID) (sections, offerings []uuid.UUID, err error) {
	rows, err := client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.StudentID(student),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		).
		WithSubjectOffering().
		All(ctx)
	if err != nil {
		return nil, nil, err
	}
	for _, row := range rows {
		offerings = append(offerings, row.SubjectOfferingID)
		if row.Edges.SubjectOffering != nil {
			sections = append(sections, row.Edges.SubjectOffering.SectionID)
		}
	}
	return sections, offerings, nil
}

func assignmentSetTo(student uuid.UUID, sections, offerings []uuid.UUID) predicate.Assignment {
	ors := []predicate.AssignmentTarget{
		enttarget.And(
			enttarget.TargetTypeEQ(enttarget.TargetTypeStudent),
			enttarget.TargetID(student),
		),
	}
	if len(sections) > 0 {
		ors = append(ors, enttarget.And(
			enttarget.TargetTypeEQ(enttarget.TargetTypeSection),
			enttarget.TargetIDIn(sections...),
		))
	}
	if len(offerings) > 0 {
		ors = append(ors, enttarget.And(
			enttarget.TargetTypeEQ(enttarget.TargetTypeOffering),
			enttarget.TargetIDIn(offerings...),
		))
	}
	return entassignment.HasTargetsWith(enttarget.Or(ors...))
}

func submittableAssignment(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	id, student uuid.UUID) (*tenantent.Assignment, bool) {
	sections, offerings, err := studentReach(ctx, client, student)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	row, err := client.Assignment.Query().
		Where(entassignment.ID(id), assignmentSetTo(student, sections, offerings)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentNotFound)
		return nil, false
	}
	if row.Status != entassignment.StatusPublished {
		response.Error(w, http.StatusConflict, assignmentNotOpen)
		return nil, false
	}
	if row.AvailableFrom != nil && nowUTC().Before(*row.AvailableFrom) {
		response.Error(w, http.StatusConflict, assignmentNotOpen)
		return nil, false
	}
	return row, true
}

func (s *Server) submitAssignment(w http.ResponseWriter, r *http.Request) {
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

	var in submissionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentSubmissionsWrite, authorization.AssignmentSubmissionsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsubmission.Columns, columnsSent(sent, entsubmission.ValidColumn)) {
		return
	}

	student, ok := submissionStudentOf(w, audience, in)
	if !ok {
		return
	}
	if !audience.All && !carriesID(audience.SelfStudents, student) {
		response.Error(w, http.StatusForbidden, notYoursToSubmit)
		return
	}

	assignment, ok := submittableAssignment(ctx, w, client, id, student)
	if !ok {
		return
	}

	at := nowUTC()
	late := assignment.DueAt != nil && at.After(*assignment.DueAt)
	if late && !assignment.LateSubmissionAllowed {
		response.Error(w, http.StatusConflict,
			"that assignment closed at "+assignment.DueAt.UTC().Format(time.RFC3339)+
				" and does not accept late work")
		return
	}

	n, err := client.AssignmentSubmission.Update().
		Where(
			entsubmission.AssignmentID(id),
			entsubmission.StudentID(student),
			access.AssignmentSubmissionsSubmittableBy(audience),
		).
		SetStatus(entsubmission.StatusSubmitted).
		SetSubmittedAt(at).
		SetLate(late).
		SetNillableTotalMarks(assignment.MaximumMarks).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, submissionNotFound)
		return
	}
	if n > 0 {
		s.respondWithSubmission(ctx, w, client, id, student, http.StatusOK)
		return
	}

	taken, err := client.AssignmentSubmission.Query().
		Where(entsubmission.AssignmentID(id), entsubmission.StudentID(student)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if taken {
		response.Error(w, http.StatusNotFound, submissionNotFound)
		return
	}

	row, err := client.AssignmentSubmission.Create().
		SetAssignmentID(id).
		SetStudentID(student).
		SetStatus(entsubmission.StatusSubmitted).
		SetSubmittedAt(at).
		SetLate(late).
		SetNillableTotalMarks(assignment.MaximumMarks).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, submissionNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/assignment-submissions/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) respondWithSubmission(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, assignment, student uuid.UUID, status int) {
	row, err := client.AssignmentSubmission.Query().
		Where(entsubmission.AssignmentID(assignment), entsubmission.StudentID(student)).
		First(ctx)
	if err != nil {
		writeTenantEntErr(w, err, submissionNotFound)
		return
	}
	response.JSON(w, status, row)
}

func (s *Server) gradeSubmission(w http.ResponseWriter, r *http.Request) {
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

	var in gradePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentSubmissionsWrite, authorization.AssignmentSubmissionsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsubmission.Columns, columnsSent(sent, entsubmission.ValidColumn)) {
		return
	}
	if !assignmentMarks(w, in.MarksObtained, entsubmission.FieldMarksObtained) {
		return
	}

	current, err := client.AssignmentSubmission.Query().
		Where(entsubmission.ID(id), access.AssignmentSubmissionsGradableBy(audience)).
		WithAssignment().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, submissionNotFound)
		return
	}

	if in.MarksObtained != nil && current.Edges.Assignment != nil &&
		current.Edges.Assignment.MaximumMarks != nil &&
		*in.MarksObtained > *current.Edges.Assignment.MaximumMarks {
		response.Error(w, http.StatusUnprocessableEntity,
			entsubmission.FieldMarksObtained+" must not exceed the "+
				entassignment.FieldMaximumMarks+" the assignment carries")
		return
	}

	status := entsubmission.StatusGraded
	if in.Status != nil {
		parsed, ok := submissionStatus(w, in.Status)
		if !ok {
			return
		}
		status = parsed
	}

	marks := in.MarksObtained
	if marks == nil {
		marks = current.MarksObtained
	}
	if status == entsubmission.StatusGraded && marks == nil {
		response.Error(w, http.StatusUnprocessableEntity,
			entsubmission.FieldMarksObtained+" is required to mark a submission graded")
		return
	}

	n, err := client.AssignmentSubmission.Update().
		Where(entsubmission.ID(id), access.AssignmentSubmissionsGradableBy(audience)).
		SetStatus(status).
		SetNillableMarksObtained(in.MarksObtained).
		SetNillableTotalMarks(in.TotalMarks).
		SetGradedAt(nowUTC()).
		SetNillableGradedBy(viewer.PersonID).
		Save(ctx)
	if !wroteScopedRow(w, n, err, submissionNotFound) {
		return
	}

	row, err := client.AssignmentSubmission.Query().Where(entsubmission.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, submissionNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteSubmission(w http.ResponseWriter, r *http.Request) {
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

	_, _, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentSubmissionsDelete, authorization.AssignmentSubmissionsDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	n, err := client.AssignmentSubmission.Delete().
		Where(entsubmission.ID(id), access.AssignmentSubmissionsGradableBy(audience)).
		Exec(ctx)
	if err != nil {
		writeTenantEntErr(w, err, submissionNotFound)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, submissionNotFound)
		return
	}
	response.NoContent(w)
}

func (s *Server) listSubmissionItems(w http.ResponseWriter, r *http.Request) {
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

	_, decision, audience, err := s.assignmentRead(ctx,
		authorization.AssignmentSubmissionsRead, authorization.AssignmentSubmissionsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := client.AssignmentSubmissionItem.Query().
		Where(entresponse.SubmissionID(id), access.AssignmentSubmissionItemsFor(audience)).
		Order(tenantent.Asc(entresponse.FieldCreatedAt)).
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
		"assignment_submission_items": projected,
		"count":                       len(rows),
	})
}

func (s *Server) answerSubmissionItem(w http.ResponseWriter, r *http.Request) {
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

	var in responsePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentSubmissionsWrite, authorization.AssignmentSubmissionsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entresponse.Columns, columnsSent(sent, entresponse.ValidColumn)) {
		return
	}

	if in.AssignmentItemID == nil {
		response.Error(w, http.StatusBadRequest,
			entresponse.FieldAssignmentItemID+" is required")
		return
	}
	if in.ResponseText != nil &&
		!withinRunes(w, entresponse.FieldResponseText, *in.ResponseText, submissionResponseRunes) {
		return
	}

	owned, err := client.AssignmentSubmission.Query().
		Where(entsubmission.ID(id), access.AssignmentSubmissionsSubmittableBy(audience)).
		Exist(ctx)
	if !mustReach(w, owned, err, submissionNotFound) {
		return
	}

	belongs, err := client.AssignmentItem.Query().
		Where(
			entitem.ID(*in.AssignmentItemID),
			entitem.HasAssignmentWith(entassignment.HasSubmissionsWith(entsubmission.ID(id))),
		).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !belongs {
		response.Error(w, http.StatusUnprocessableEntity,
			entresponse.FieldAssignmentItemID+" must name an item of the same assignment")
		return
	}

	n, err := client.AssignmentSubmissionItem.Update().
		Where(
			entresponse.SubmissionID(id),
			entresponse.AssignmentItemID(*in.AssignmentItemID),
			access.AssignmentSubmissionItemsAnswerableBy(audience),
		).
		SetNillableResponseText(in.ResponseText).
		SetNillableAssetID(in.AssetID).
		SetNillableQuestionResponseID(in.QuestionResponseID).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, responseNotFound)
		return
	}
	if n > 0 {
		s.respondWithSubmissionItem(ctx, w, client, id, *in.AssignmentItemID, http.StatusOK)
		return
	}

	row, err := client.AssignmentSubmissionItem.Create().
		SetSubmissionID(id).
		SetAssignmentItemID(*in.AssignmentItemID).
		SetNillableResponseText(in.ResponseText).
		SetNillableAssetID(in.AssetID).
		SetNillableQuestionResponseID(in.QuestionResponseID).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, responseNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/assignment-submission-items/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) respondWithSubmissionItem(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, submission, item uuid.UUID, status int) {
	row, err := client.AssignmentSubmissionItem.Query().
		Where(entresponse.SubmissionID(submission), entresponse.AssignmentItemID(item)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, responseNotFound)
		return
	}
	response.JSON(w, status, row)
}

func (s *Server) gradeSubmissionItem(w http.ResponseWriter, r *http.Request) {
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

	var in gradeItemPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, audience, err := s.assignmentWrite(ctx,
		authorization.AssignmentSubmissionsWrite, authorization.AssignmentSubmissionsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entresponse.Columns, columnsSent(sent, entresponse.ValidColumn)) {
		return
	}
	if !assignmentMarks(w, in.MarksObtained, entresponse.FieldMarksObtained) {
		return
	}
	if in.Feedback != nil &&
		!withinRunes(w, entresponse.FieldFeedback, *in.Feedback, submissionFeedbackRunes) {
		return
	}

	n, err := client.AssignmentSubmissionItem.Update().
		Where(entresponse.ID(id), access.AssignmentSubmissionItemsGradableBy(audience)).
		SetNillableMarksObtained(in.MarksObtained).
		SetNillableFeedback(in.Feedback).
		Save(ctx)
	if !wroteScopedRow(w, n, err, responseNotFound) {
		return
	}

	row, err := client.AssignmentSubmissionItem.Query().Where(entresponse.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, responseNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) mountAssignments(r chi.Router) {
	r.Route("/assignments", func(r chi.Router) {
		r.With(s.can(authorization.AssignmentsRead)).Get("/", s.listAssignments)
		r.With(s.can(authorization.AssignmentsWrite)).Post("/", s.createAssignment)
		r.With(s.can(authorization.AssignmentsRead)).Get("/{id}", s.getAssignment)
		r.With(s.can(authorization.AssignmentsWrite)).Patch("/{id}", s.updateAssignment)
		r.With(s.can(authorization.AssignmentsDelete)).Delete("/{id}", s.deleteAssignment)

		r.With(s.can(authorization.AssignmentsRead)).Get("/{id}/items", s.listAssignmentItems)
		r.With(s.can(authorization.AssignmentsWrite)).Post("/{id}/items", s.createAssignmentItem)

		r.With(s.can(authorization.AssignmentSubmissionsRead)).
			Get("/{id}/submissions", s.listAssignmentSubmissions)
		r.With(s.can(authorization.AssignmentSubmissionsWrite)).
			Post("/{id}/submissions", s.submitAssignment)
	})

	r.Route("/assignment-items", func(r chi.Router) {
		r.With(s.can(authorization.AssignmentsWrite)).Patch("/{id}", s.updateAssignmentItem)
		r.With(s.can(authorization.AssignmentsDelete)).Delete("/{id}", s.deleteAssignmentItem)
	})

	r.Route("/assignment-submissions", func(r chi.Router) {
		r.With(s.can(authorization.AssignmentSubmissionsRead)).Get("/", s.listSubmissions)
		r.With(s.can(authorization.AssignmentSubmissionsRead)).Get("/{id}", s.getSubmission)
		r.With(s.can(authorization.AssignmentSubmissionsWrite)).Patch("/{id}", s.gradeSubmission)
		r.With(s.can(authorization.AssignmentSubmissionsDelete)).Delete("/{id}", s.deleteSubmission)

		r.With(s.can(authorization.AssignmentSubmissionsRead)).Get("/{id}/items", s.listSubmissionItems)
		r.With(s.can(authorization.AssignmentSubmissionsWrite)).Put("/{id}/items", s.answerSubmissionItem)
	})

	r.Route("/assignment-submission-items", func(r chi.Router) {
		r.With(s.can(authorization.AssignmentSubmissionsWrite)).Patch("/{id}", s.gradeSubmissionItem)
	})
}
