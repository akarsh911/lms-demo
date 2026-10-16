package http

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entcomponent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponent"
	entcomponentassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentassignment"
	entcomponentexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentexam"
	entresultscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultscheme"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	resultSchemeNotFound    = "result scheme not found"
	resultComponentNotFound = "result component not found"
	resultComponentExamLink = "that exam is not linked to this result component"

	resultComponentAssignmentLink = "that assignment is not linked to this result component"

	assignmentHasNoMaximum = "assignment_has_no_maximum"
)

type resultSchemePayload struct {
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	Name              *string    `json:"name"`
	Code              *string    `json:"code"`
	Description       *string    `json:"description"`
	TotalMarks        *float64   `json:"total_marks"`
	Status            *string    `json:"status"`
}

type resultComponentPayload struct {
	Name         *string  `json:"name"`
	MaximumMarks *float64 `json:"maximum_marks"`
	Weight       *float64 `json:"weight"`
	Aggregation  *string  `json:"aggregation"`
	TakeBest     *int     `json:"take_best"`
	Position     *int     `json:"position"`
}

type resultComponentExamPayload struct {
	ExamID *uuid.UUID `json:"exam_id"`
}

type resultComponentAssignmentPayload struct {
	AssignmentID *uuid.UUID `json:"assignment_id"`
}

type carriedLink struct {
	component  *tenantent.ResultComponent
	assignment *tenantent.Assignment
}

const (
	resultSchemeCodeIndex    = "resultscheme_academic_session_id_code"
	resultComponentNameIndex = "resultcomponent_result_scheme_id_name"
	resultComponentExamIndex = "resultcomponentexam_result_component_id_exam_id"

	resultComponentAssignmentIndex = "resultcomponentassignment_result_component_id_assignment_id"
)

func violates(err error, index string) bool {
	return tenantent.IsConstraintError(err) && strings.Contains(err.Error(), index)
}

func marks(v float64) string { return fmt.Sprintf("%g", v) }

func sameMarks(a, b float64) bool {
	return math.Round(a*100) == math.Round(b*100)
}

func (s *Server) resultSchemeScope(ctx context.Context, write bool) (
	authorization.Decision, error) {
	narrow, wide := authorization.SubjectOfferingsRead, authorization.CurriculumReadAll
	if write {
		narrow, wide = authorization.SubjectOfferingsWrite, authorization.CurriculumWriteAll
	}
	_, decision, err := s.scopeFor(ctx, narrow, wide)
	return decision, err
}

func (s *Server) listResultSchemes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	decision, err := s.resultSchemeScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	sessionID := p.UUID("academic_session_id")
	status := p.Enum("status", func(v string) error {
		return entresultscheme.StatusValidator(entresultscheme.Status(v))
	})
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := client.ResultScheme.Query()
	if sessionID != nil {
		q = q.Where(entresultscheme.AcademicSessionID(*sessionID))
	}
	if status != nil {
		q = q.Where(entresultscheme.StatusEQ(entresultscheme.Status(*status)))
	}

	rows, err := q.
		Order(tenantent.Asc(entresultscheme.FieldCode), tenantent.Asc(entresultscheme.FieldID)).
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
		"result_schemes": projected,
		"count":          len(rows),
		"page":           pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) getResultScheme(w http.ResponseWriter, r *http.Request) {
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

	decision, err := s.resultSchemeScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.ResultScheme.Query().Where(entresultscheme.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"result_scheme": projected})
}

func (s *Server) createResultScheme(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in resultSchemePayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	decision, err := s.resultSchemeScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if in.AcademicSessionID == nil || in.Name == nil || *in.Name == "" ||
		in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id, name and code are required")
		return
	}
	if in.Status != nil && *in.Status != string(entresultscheme.StatusDraft) {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error": "result_scheme_starts_in_draft",
			"message": "a result scheme is created in draft and activated once its components " +
				"add up to what it is out of; there are no components yet",
		})
		return
	}
	if in.TotalMarks != nil && *in.TotalMarks <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entresultscheme.FieldTotalMarks+" must be greater than zero")
		return
	}

	create := client.ResultScheme.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetName(*in.Name).
		SetCode(*in.Code).
		SetNillableDescription(in.Description).
		SetNillableTotalMarks(in.TotalMarks)

	row, err := create.Save(ctx)
	if err != nil {
		if violates(err, resultSchemeCodeIndex) {
			response.Error(w, http.StatusConflict,
				"a result scheme with that code already exists in this session")
			return
		}
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/result-schemes/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"result_scheme": projected})
}

func (s *Server) reviseResultScheme(w http.ResponseWriter, r *http.Request) {
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

	var in resultSchemePayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	decision, err := s.resultSchemeScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.ResultScheme.Query().Where(entresultscheme.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}

	used, err := client.SubjectOffering.Query().
		Where(entoffering.ResultSchemeID(id)).Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if used {
		s.supersedeResultScheme(w, r, ctx, client, current, in, decision)
		return
	}

	status := current.Status
	if in.Status != nil {
		parsed, ok := timetableEnum(w, entresultscheme.FieldStatus, *in.Status,
			entresultscheme.StatusValidator)
		if !ok {
			return
		}
		status = parsed
	}

	total := current.TotalMarks
	if in.TotalMarks != nil {
		if *in.TotalMarks <= 0 {
			response.Error(w, http.StatusUnprocessableEntity,
				entresultscheme.FieldTotalMarks+" must be greater than zero")
			return
		}
		total = *in.TotalMarks
	}

	if status == entresultscheme.StatusActive {
		refusal, err := resultSchemeActivationRefusal(ctx, client, current.ID, total)
		if err != nil {
			writeTenancyErr(w, err)
			return
		}
		if refusal != "" {
			response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
				"error":   "result_scheme_does_not_compose",
				"message": refusal,
			})
			return
		}
	}

	row, err := client.ResultScheme.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableCode(in.Code).
		SetNillableDescription(in.Description).
		SetNillableTotalMarks(in.TotalMarks).
		SetStatus(status).
		Save(ctx)
	if err != nil {
		if violates(err, resultSchemeCodeIndex) {
			response.Error(w, http.StatusConflict,
				"a result scheme with that code already exists in this session")
			return
		}
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"result_scheme": projected})
}

func (s *Server) supersedeResultScheme(w http.ResponseWriter, _ *http.Request,
	ctx context.Context, client *tenantent.Client, current *tenantent.ResultScheme,
	in resultSchemePayload, decision authorization.Decision) {

	if in.Code == nil || *in.Code == "" || *in.Code == current.Code {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error": "result_scheme_in_use",
			"message": "this scheme already composes a subject offering's result, so editing it " +
				"would change what a mark already means; send a new code to supersede it instead",
		})
		return
	}

	unit, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	defer unit.rollback()

	successor, carried, err := copyResultScheme(ctx, unit.writer, current, in)
	if err != nil {
		if violates(err, resultSchemeCodeIndex) {
			response.Error(w, http.StatusConflict,
				"a result scheme with that code already exists in this session")
			return
		}
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}
	if err := unit.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := project(successor, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	body := response.Envelope{"result_scheme": projected}
	if len(carried) > 0 {
		body["warning"] = assignmentHasNoMaximum
		body["carried_without_maximum"] = carriedWithoutMaximum(carried)
		body["message"] = carriedWithoutMaximumMessage(carried)
	}

	w.Header().Set("Location", "/api/v1/result-schemes/"+successor.ID.String())
	response.JSON(w, http.StatusCreated, body)
}

func carriedWithoutMaximum(carried []carriedLink) []response.Envelope {
	listed := make([]response.Envelope, 0, len(carried))
	for _, link := range carried {
		listed = append(listed, response.Envelope{
			"result_component_id": link.component.ID,
			"result_component":    link.component.Name,
			"assignment_id":       link.assignment.ID,
			"assignment_title":    link.assignment.Title,
		})
	}
	return listed
}

func carriedWithoutMaximumMessage(carried []carriedLink) string {
	titles := make([]string, 0, len(carried))
	for _, link := range carried {
		titles = append(titles, "\""+link.assignment.Title+"\"")
	}
	held := strings.Join(titles, ", ")
	if len(titles) > 1 {
		held = strings.Join(titles[:len(titles)-1], ", ") + " and " + titles[len(titles)-1]
	}

	carries, which := "carries a link to ", ", which is not marked out of anything"
	if len(titles) > 1 {
		carries, which = "carries links to ", ", which are not marked out of anything"
	}

	return "this successor " + carries + held + which + "; a link like that could not be made " +
		"today, and the successor will not activate until each is given a " +
		entassignment.FieldMaximumMarks + " above zero or unlinked from this draft"
}

func copyResultScheme(ctx context.Context, client *tenantent.Client,
	current *tenantent.ResultScheme, in resultSchemePayload) (
	*tenantent.ResultScheme, []carriedLink, error) {

	create := client.ResultScheme.Create().
		SetAcademicSessionID(current.AcademicSessionID).
		SetSupersedesID(current.ID).
		SetName(current.Name).
		SetCode(*in.Code).
		SetTotalMarks(current.TotalMarks)

	if in.Name != nil {
		create = create.SetName(*in.Name)
	}
	if in.Description != nil {
		create = create.SetDescription(*in.Description)
	} else if current.Description != nil {
		create = create.SetDescription(*current.Description)
	}
	if in.TotalMarks != nil {
		create = create.SetTotalMarks(*in.TotalMarks)
	}

	successor, err := create.Save(ctx)
	if err != nil {
		return nil, nil, err
	}

	components, err := client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(current.ID)).
		Order(tenantent.Asc(entcomponent.FieldPosition)).
		All(ctx)
	if err != nil {
		return nil, nil, err
	}

	var carried []carriedLink

	for _, component := range components {
		copied, err := client.ResultComponent.Create().
			SetResultSchemeID(successor.ID).
			SetName(component.Name).
			SetMaximumMarks(component.MaximumMarks).
			SetWeight(component.Weight).
			SetAggregation(component.Aggregation).
			SetNillableTakeBest(component.TakeBest).
			SetPosition(component.Position).
			Save(ctx)
		if err != nil {
			return nil, nil, err
		}

		links, err := client.ResultComponentExam.Query().
			Where(entcomponentexam.ResultComponentID(component.ID)).
			All(ctx)
		if err != nil {
			return nil, nil, err
		}
		for _, link := range links {
			if _, err := client.ResultComponentExam.Create().
				SetResultComponentID(copied.ID).
				SetExamID(link.ExamID).
				Save(ctx); err != nil {
				return nil, nil, err
			}
		}

		homework, err := client.ResultComponentAssignment.Query().
			Where(entcomponentassignment.ResultComponentID(component.ID)).
			All(ctx)
		if err != nil {
			return nil, nil, err
		}
		for _, link := range homework {
			if _, err := client.ResultComponentAssignment.Create().
				SetResultComponentID(copied.ID).
				SetAssignmentID(link.AssignmentID).
				Save(ctx); err != nil {
				return nil, nil, err
			}
		}

		unusable, err := resultComponentUnmarkedAssignments(ctx, client, copied.ID, 0)
		if err != nil {
			return nil, nil, err
		}
		for _, assignment := range unusable {
			carried = append(carried, carriedLink{component: copied, assignment: assignment})
		}
	}

	return successor, carried, nil
}

func (s *Server) deleteResultScheme(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, resultSchemeNotFound,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.ResultScheme.DeleteOneID(id).Exec(ctx)
		})
}

func resultSchemeActivationRefusal(ctx context.Context, client *tenantent.Client,
	schemeID uuid.UUID, totalMarks float64) (string, error) {

	components, err := client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(schemeID)).
		Order(tenantent.Asc(entcomponent.FieldPosition)).
		All(ctx)
	if err != nil {
		return "", err
	}
	if len(components) == 0 {
		return "this scheme has no components, so there is nothing for its " +
			marks(totalMarks) + " marks to be composed of", nil
	}

	sum := 0.0
	for _, component := range components {
		sum += component.Weight
	}
	if !sameMarks(sum, totalMarks) {
		return "the component weights add up to " + marks(sum) + ", not the " +
			marks(totalMarks) + " this scheme is out of; a result that does not account for " +
			"every mark is not a result", nil
	}

	for _, component := range components {
		exams, assignments, err := resultComponentSources(ctx, client, component.ID)
		if err != nil {
			return "", err
		}
		linked := exams + assignments

		if linked == 0 {
			return fmt.Sprintf("\"%s\" has no exam and no assignment linked to it, so it can never "+
				"be scored, yet it carries %s of the %s this scheme is out of; a weight that nothing "+
				"can fill is a hole in the result",
				component.Name, marks(component.Weight), marks(totalMarks)), nil
		}

		unmarked, err := resultComponentUnmarkedAssignment(ctx, client, component.ID)
		if err != nil {
			return "", err
		}
		if unmarked != nil {
			return fmt.Sprintf("\"%s\" draws from the assignment \"%s\", which is not marked out of "+
				"anything; the fraction it would contribute is undefined",
				component.Name, unmarked.Title), nil
		}

		if component.Aggregation != entcomponent.AggregationBestOf {
			continue
		}
		if component.TakeBest == nil {
			return "\"" + component.Name + "\" aggregates best_of without saying how many count", nil
		}
		if linked < *component.TakeBest {
			return fmt.Sprintf("\"%s\" takes the best %d but only %d sources are linked to it "+
				"(%d exams, %d assignments); best %d of %d is a mistake, not a rule",
				component.Name, *component.TakeBest, linked, exams, assignments,
				*component.TakeBest, linked), nil
		}
	}

	return "", nil
}

func resultComponentSources(ctx context.Context, client *tenantent.Client,
	componentID uuid.UUID) (int, int, error) {

	exams, err := client.ResultComponentExam.Query().
		Where(entcomponentexam.ResultComponentID(componentID)).Count(ctx)
	if err != nil {
		return 0, 0, err
	}
	assignments, err := client.ResultComponentAssignment.Query().
		Where(entcomponentassignment.ResultComponentID(componentID)).Count(ctx)
	if err != nil {
		return 0, 0, err
	}
	return exams, assignments, nil
}

func resultComponentUnmarkedAssignment(ctx context.Context, client *tenantent.Client,
	componentID uuid.UUID) (*tenantent.Assignment, error) {

	rows, err := resultComponentUnmarkedAssignments(ctx, client, componentID, 1)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return rows[0], nil
}

func resultComponentUnmarkedAssignments(ctx context.Context, client *tenantent.Client,
	componentID uuid.UUID, most int) ([]*tenantent.Assignment, error) {

	links, err := client.ResultComponentAssignment.Query().
		Where(entcomponentassignment.ResultComponentID(componentID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(links) == 0 {
		return nil, nil
	}

	ids := make([]uuid.UUID, 0, len(links))
	for _, link := range links {
		ids = append(ids, link.AssignmentID)
	}

	q := client.Assignment.Query().
		Where(
			entassignment.IDIn(ids...),
			entassignment.Or(
				entassignment.MaximumMarksIsNil(),
				entassignment.MaximumMarksLTE(0),
			),
		).
		Order(tenantent.Asc(entassignment.FieldTitle))
	if most > 0 {
		q = q.Limit(most)
	}
	return q.All(ctx)
}

func resultSchemeOfComponent(ctx context.Context, client *tenantent.Client,
	component *tenantent.ResultComponent) (*tenantent.ResultScheme, error) {
	return client.ResultScheme.Query().
		Where(entresultscheme.ID(component.ResultSchemeID)).Only(ctx)
}

func resultSchemeIsDraft(w http.ResponseWriter, scheme *tenantent.ResultScheme) bool {
	if scheme.Status == entresultscheme.StatusDraft {
		return true
	}
	response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
		"error": "result_scheme_not_draft",
		"message": "this scheme is " + string(scheme.Status) + ", so what its parts are worth is " +
			"settled; return it to draft, or supersede it, before changing the composition",
	})
	return false
}

func resultComponentValid(w http.ResponseWriter, maximumMarks, weight float64,
	aggregation entcomponent.Aggregation, takeBest *int) bool {

	if maximumMarks <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entcomponent.FieldMaximumMarks+" must be greater than zero: a component marked out "+
				"of nothing cannot contribute a fraction")
		return false
	}
	if weight <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entcomponent.FieldWeight+" must be greater than zero: a part that contributes nothing "+
				"is not a part of the result")
		return false
	}
	if aggregation == entcomponent.AggregationBestOf && takeBest == nil {
		response.Error(w, http.StatusUnprocessableEntity,
			entcomponent.FieldTakeBest+" is required when "+entcomponent.FieldAggregation+
				" is best_of: best of how many is the whole rule")
		return false
	}
	if aggregation != entcomponent.AggregationBestOf && takeBest != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			entcomponent.FieldTakeBest+" is meaningless unless "+entcomponent.FieldAggregation+
				" is best_of, and this component aggregates "+string(aggregation))
		return false
	}
	if takeBest != nil && *takeBest <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entcomponent.FieldTakeBest+" must be greater than zero")
		return false
	}
	return true
}

func (s *Server) listResultComponents(w http.ResponseWriter, r *http.Request) {
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

	decision, err := s.resultSchemeScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if _, err := client.ResultScheme.Query().Where(entresultscheme.ID(id)).Only(ctx); err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}

	rows, err := client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(id)).
		Order(tenantent.Asc(entcomponent.FieldPosition), tenantent.Asc(entcomponent.FieldID)).
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
		"result_components": projected,
		"count":             len(rows),
	})
}

func (s *Server) createResultComponent(w http.ResponseWriter, r *http.Request) {
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

	var in resultComponentPayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	decision, err := s.resultSchemeScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	scheme, err := client.ResultScheme.Query().Where(entresultscheme.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}
	if !resultSchemeIsDraft(w, scheme) {
		return
	}

	if in.Name == nil || *in.Name == "" || in.MaximumMarks == nil || in.Weight == nil {
		response.Error(w, http.StatusBadRequest,
			"name, maximum_marks and weight are required")
		return
	}

	aggregation := entcomponent.DefaultAggregation
	if in.Aggregation != nil {
		parsed, ok := timetableEnum(w, entcomponent.FieldAggregation, *in.Aggregation,
			entcomponent.AggregationValidator)
		if !ok {
			return
		}
		aggregation = parsed
	}
	if !resultComponentValid(w, *in.MaximumMarks, *in.Weight, aggregation, in.TakeBest) {
		return
	}

	row, err := client.ResultComponent.Create().
		SetResultSchemeID(scheme.ID).
		SetName(*in.Name).
		SetMaximumMarks(*in.MaximumMarks).
		SetWeight(*in.Weight).
		SetAggregation(aggregation).
		SetNillableTakeBest(in.TakeBest).
		SetNillablePosition(in.Position).
		Save(ctx)
	if err != nil {
		if violates(err, resultComponentNameIndex) {
			response.Error(w, http.StatusConflict,
				"this scheme already has a component with that name")
			return
		}
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/result-components/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"result_component": projected})
}

func (s *Server) updateResultComponent(w http.ResponseWriter, r *http.Request) {
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

	var in resultComponentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	decision, err := s.resultSchemeScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.ResultComponent.Query().Where(entcomponent.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}
	scheme, err := resultSchemeOfComponent(ctx, client, current)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}
	if !resultSchemeIsDraft(w, scheme) {
		return
	}

	aggregation := current.Aggregation
	if in.Aggregation != nil {
		parsed, ok := timetableEnum(w, entcomponent.FieldAggregation, *in.Aggregation,
			entcomponent.AggregationValidator)
		if !ok {
			return
		}
		aggregation = parsed
	}

	maximumMarks := current.MaximumMarks
	if in.MaximumMarks != nil {
		maximumMarks = *in.MaximumMarks
	}
	weight := current.Weight
	if in.Weight != nil {
		weight = *in.Weight
	}

	cleared := wasCleared(sent, entcomponent.FieldTakeBest, in.TakeBest)
	takeBest := current.TakeBest
	if in.TakeBest != nil {
		takeBest = in.TakeBest
	}
	if cleared {
		takeBest = nil
	}

	if !resultComponentValid(w, maximumMarks, weight, aggregation, takeBest) {
		return
	}

	update := client.ResultComponent.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableMaximumMarks(in.MaximumMarks).
		SetNillableWeight(in.Weight).
		SetAggregation(aggregation).
		SetNillableTakeBest(in.TakeBest).
		SetNillablePosition(in.Position)
	if cleared {
		update = update.ClearTakeBest()
	}

	row, err := update.Save(ctx)
	if err != nil {
		if violates(err, resultComponentNameIndex) {
			response.Error(w, http.StatusConflict,
				"this scheme already has a component with that name")
			return
		}
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"result_component": projected})
}

func (s *Server) deleteResultComponent(w http.ResponseWriter, r *http.Request) {
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

	if _, _, err := s.scopeFor(ctx,
		authorization.SubjectOfferingsDelete, authorization.CurriculumDeleteAll); err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.ResultComponent.Query().Where(entcomponent.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}
	scheme, err := resultSchemeOfComponent(ctx, client, current)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}
	if !resultSchemeIsDraft(w, scheme) {
		return
	}

	if err := client.ResultComponent.DeleteOneID(id).Exec(ctx); err != nil {
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}
	response.NoContent(w)
}

func (s *Server) listResultComponentExams(w http.ResponseWriter, r *http.Request) {
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

	decision, err := s.resultSchemeScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if _, err := client.ResultComponent.Query().Where(entcomponent.ID(id)).Only(ctx); err != nil {
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}

	rows, err := client.ResultComponentExam.Query().
		Where(entcomponentexam.ResultComponentID(id)).
		Order(tenantent.Asc(entcomponentexam.FieldID)).
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
		"result_component_exams": projected,
		"count":                  len(rows),
	})
}

func (s *Server) linkResultComponentExam(w http.ResponseWriter, r *http.Request) {
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

	var in resultComponentExamPayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	decision, err := s.resultSchemeScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if in.ExamID == nil {
		response.Error(w, http.StatusBadRequest, "exam_id is required")
		return
	}

	component, err := client.ResultComponent.Query().Where(entcomponent.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}
	scheme, err := resultSchemeOfComponent(ctx, client, component)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}
	if !resultSchemeIsDraft(w, scheme) {
		return
	}

	exam, err := client.Exam.Query().Where(entexam.ID(*in.ExamID)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examNotFound)
		return
	}
	if exam.AssessmentKind == entexam.AssessmentKindPractice {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error": "practice_exam_cannot_be_composed",
			"message": "\"" + exam.Name + "\" is " + entexam.FieldAssessmentKind +
				" practice, which says it does not count toward the result; linking it to a " +
				"result component would say it does, and the two must not be able to disagree",
		})
		return
	}
	if exam.AcademicSessionID != scheme.AcademicSessionID {
		response.Error(w, http.StatusUnprocessableEntity,
			"\""+exam.Name+"\" belongs to a different academic session than this result scheme")
		return
	}

	row, err := client.ResultComponentExam.Create().
		SetResultComponentID(component.ID).
		SetExamID(exam.ID).
		Save(ctx)
	if err != nil {
		if violates(err, resultComponentExamIndex) {
			response.Error(w, http.StatusConflict,
				"that exam already feeds this result component")
			return
		}
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, response.Envelope{"result_component_exam": projected})
}

func (s *Server) unlinkResultComponentExam(w http.ResponseWriter, r *http.Request) {
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
	examID, ok := idParam(w, r, "examID")
	if !ok {
		return
	}

	if _, _, err := s.scopeFor(ctx,
		authorization.SubjectOfferingsDelete, authorization.CurriculumDeleteAll); err != nil {
		writeTenancyErr(w, err)
		return
	}

	component, err := client.ResultComponent.Query().Where(entcomponent.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}
	scheme, err := resultSchemeOfComponent(ctx, client, component)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}
	if !resultSchemeIsDraft(w, scheme) {
		return
	}

	removed, err := client.ResultComponentExam.Delete().
		Where(
			entcomponentexam.ResultComponentID(component.ID),
			entcomponentexam.ExamID(examID),
		).
		Exec(ctx)
	if !wroteScopedRow(w, removed, err, resultComponentExamLink) {
		return
	}
	response.NoContent(w)
}

func (s *Server) listResultComponentAssignments(w http.ResponseWriter, r *http.Request) {
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

	decision, err := s.resultSchemeScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if _, err := client.ResultComponent.Query().Where(entcomponent.ID(id)).Only(ctx); err != nil {
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}

	rows, err := client.ResultComponentAssignment.Query().
		Where(entcomponentassignment.ResultComponentID(id)).
		Order(tenantent.Asc(entcomponentassignment.FieldID)).
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
		"result_component_assignments": projected,
		"count":                        len(rows),
	})
}

func (s *Server) linkResultComponentAssignment(w http.ResponseWriter, r *http.Request) {
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

	var in resultComponentAssignmentPayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	decision, err := s.resultSchemeScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if in.AssignmentID == nil {
		response.Error(w, http.StatusBadRequest, "assignment_id is required")
		return
	}

	component, err := client.ResultComponent.Query().Where(entcomponent.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}
	scheme, err := resultSchemeOfComponent(ctx, client, component)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}
	if !resultSchemeIsDraft(w, scheme) {
		return
	}

	assignment, err := client.Assignment.Query().
		Where(entassignment.ID(*in.AssignmentID)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, assignmentNotFound)
		return
	}
	if assignment.MaximumMarks == nil || *assignment.MaximumMarks <= 0 {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error": assignmentHasNoMaximum,
			"message": "\"" + assignment.Title + "\" is not marked out of anything, so the fraction " +
				"it would contribute to this component is undefined; give it a " +
				entassignment.FieldMaximumMarks + " above zero before composing a result from it",
		})
		return
	}
	if assignment.AcademicSessionID != scheme.AcademicSessionID {
		response.Error(w, http.StatusUnprocessableEntity,
			"\""+assignment.Title+"\" belongs to a different academic session than this result scheme")
		return
	}

	row, err := client.ResultComponentAssignment.Create().
		SetResultComponentID(component.ID).
		SetAssignmentID(assignment.ID).
		Save(ctx)
	if err != nil {
		if violates(err, resultComponentAssignmentIndex) {
			response.Error(w, http.StatusConflict,
				"that assignment already feeds this result component")
			return
		}
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusCreated,
		response.Envelope{"result_component_assignment": projected})
}

func (s *Server) unlinkResultComponentAssignment(w http.ResponseWriter, r *http.Request) {
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
	assignmentID, ok := idParam(w, r, "assignmentID")
	if !ok {
		return
	}

	if _, _, err := s.scopeFor(ctx,
		authorization.SubjectOfferingsDelete, authorization.CurriculumDeleteAll); err != nil {
		writeTenancyErr(w, err)
		return
	}

	component, err := client.ResultComponent.Query().Where(entcomponent.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultComponentNotFound)
		return
	}
	scheme, err := resultSchemeOfComponent(ctx, client, component)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}
	if !resultSchemeIsDraft(w, scheme) {
		return
	}

	removed, err := client.ResultComponentAssignment.Delete().
		Where(
			entcomponentassignment.ResultComponentID(component.ID),
			entcomponentassignment.AssignmentID(assignmentID),
		).
		Exec(ctx)
	if !wroteScopedRow(w, removed, err, resultComponentAssignmentLink) {
		return
	}
	response.NoContent(w)
}
