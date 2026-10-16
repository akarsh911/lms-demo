package http

import (
	"context"
	"net/http"
	"strings"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	entsubmission "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentsubmission"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entexamsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsubject"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entcomponent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponent"
	entcomponentassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentassignment"
	entcomponentexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentexam"
	entresultscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultscheme"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entexammark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentexammark"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/internal/service/results"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	resultOfferingNotFound = "subject offering not found"
	resultStudentNotFound  = "student not found"

	resultNotComposed = "no result scheme is attached to this subject offering, so what its " +
		"marks are composed of has not been decided and there is no result to compute"

	resultSourceNoPaper   = "no paper is set for this subject in that exam"
	resultSourceNoMaximum = "that assignment is not marked out of anything, so the fraction it " +
		"would contribute is undefined"

	resultComponentEmpty = "nothing this component draws on is set for this subject, so its " +
		"weight is left out of the total rather than scored as a zero the pupil did not earn"
	resultComponentShort = "fewer sources are set for this subject than this component takes " +
		"the best of, so its weight is left out of the total"

	resultNothingScorable = "result_scheme_unfilled_for_offering"
	resultNotComputable   = "result_not_computable"
)

var resultMarkFields = []string{
	entexammark.FieldStatus,
	entexammark.FieldMarksObtained,
	entexammark.FieldProvisional,
}

type resultSourceGap struct {
	ComponentID   uuid.UUID         `json:"result_component_id"`
	ComponentName string            `json:"component"`
	Ref           results.SourceRef `json:"ref"`
	Label         string            `json:"label,omitempty"`
	Reason        string            `json:"reason"`
}

type resultComponentGap struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Weight float64   `json:"weight"`
	Reason string    `json:"reason"`
}

type resultComposition struct {
	SourcesNotSet     []resultSourceGap    `json:"sources_not_set"`
	ComponentsDropped []resultComponentGap `json:"components_not_scored"`
}

func (c resultComposition) whole() bool {
	return len(c.SourcesNotSet) == 0 && len(c.ComponentsDropped) == 0
}

type pupilResult struct {
	StudentID uuid.UUID      `json:"student_id"`
	Final     bool           `json:"final"`
	Result    results.Result `json:"result"`
}

type resultPlan struct {
	scheme      results.Scheme
	examOf      map[uuid.UUID]uuid.UUID
	paperOf     map[uuid.UUID]uuid.UUID
	assignments []uuid.UUID
	composition resultComposition
}

type sourceMark struct {
	student uuid.UUID
	source  uuid.UUID
}

func resultOfferingScope(v *access.Viewer, d authorization.Decision) predicate.SubjectOffering {
	if v == nil {
		return entoffering.IDIn()
	}
	if examReachUnfiltered(v, d) {
		return func(*sql.Selector) {}
	}
	return examOfferingScope(v)
}

func requireResultFields(w http.ResponseWriter, r *http.Request,
	d authorization.Decision) bool {
	denied := d.Fields.Denied(entexammark.Columns, resultMarkFields)
	if len(denied) == 0 {
		return true
	}

	observability.Decision(r.Context(), false, "result refused on fields",
		"denied", denied, "rule", d.Rule)

	response.Error(w, http.StatusForbidden,
		"a result is the arithmetic of the marks it is made of, so one computed from marks you "+
			"may not read would be a number nobody could check; your field policy denies "+
			strings.Join(denied, ", "))
	return false
}

func (s *Server) listOfferingResults(w http.ResponseWriter, r *http.Request) {
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

	p := filter.New(r.URL.Query())
	studentID := p.UUID("student_id")
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !requireResultFields(w, r, decision) {
		return
	}

	offering, err := client.SubjectOffering.Query().
		Where(entoffering.ID(id), resultOfferingScope(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultOfferingNotFound)
		return
	}
	if offering.ResultSchemeID == nil {
		response.JSON(w, http.StatusOK, response.Envelope{
			"subject_offering_id": offering.ID,
			"result_scheme_id":    nil,
			"composed":            false,
			"reason":              resultNotComposed,
			"results":             []pupilResult{},
			"count":               0,
		})
		return
	}

	scheme, err := client.ResultScheme.Query().
		Where(entresultscheme.ID(*offering.ResultSchemeID)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return
	}

	roster, err := offeringRoster(ctx, client, offering.ID, studentID, viewer, decision, limit, offset)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if studentID != nil && len(roster) == 0 {
		response.Error(w, http.StatusNotFound, resultStudentNotFound)
		return
	}

	plan, err := planOfferingResult(ctx, client, scheme, offering.ID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if len(plan.scheme.Components) == 0 {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error":       resultNothingScorable,
			"message":     resultUnfilledMessage(scheme.Name),
			"composition": plan.composition,
		})
		return
	}

	marks, err := gatherResultMarks(ctx, client, plan, roster)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	computed := make([]pupilResult, 0, len(roster))
	for _, student := range roster {
		out, err := results.Compute(plan.scheme, marks[student])
		if err != nil {
			response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
				"error":       resultNotComputable,
				"message":     err.Error(),
				"student_id":  student,
				"composition": plan.composition,
			})
			return
		}
		computed = append(computed, pupilResult{
			StudentID: student,
			Final:     out.Final() && plan.composition.whole(),
			Result:    out,
		})
	}

	body := response.Envelope{
		"subject_offering_id": offering.ID,
		"result_scheme_id":    scheme.ID,
		"composed":            true,
		"composition":         plan.composition,
		"results":             computed,
		"count":               len(computed),
	}
	if studentID == nil {
		body["page"] = pageOf(limit, offset, len(computed))
	}
	response.JSON(w, http.StatusOK, body)
}

func resultUnfilledMessage(scheme string) string {
	return "nothing \"" + scheme + "\" composes is set for this subject, so there is no " +
		"arithmetic to do; the marks it draws on have to exist before a result can"
}

func offeringRoster(ctx context.Context, client *tenantent.Client, offering uuid.UUID,
	student *uuid.UUID, v *access.Viewer, d authorization.Decision,
	limit, offset int) ([]uuid.UUID, error) {

	q := client.Student.Query().
		Where(
			access.StudentsForAcademic(v, d),
			entstudent.HasSubjectEnrollmentsWith(
				entsubjenroll.SubjectOfferingID(offering),
				entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
			),
		)
	if student != nil {
		return q.Where(entstudent.ID(*student)).IDs(ctx)
	}
	return q.
		Order(
			tenantent.Asc(entstudent.FieldAdmissionNumber),
			tenantent.Asc(entstudent.FieldID),
		).
		Limit(limit).Offset(offset).
		IDs(ctx)
}

func planOfferingResult(ctx context.Context, client *tenantent.Client,
	scheme *tenantent.ResultScheme, offering uuid.UUID) (*resultPlan, error) {

	components, err := client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(scheme.ID)).
		Order(tenantent.Asc(entcomponent.FieldPosition), tenantent.Asc(entcomponent.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, 0, len(components))
	for _, component := range components {
		ids = append(ids, component.ID)
	}

	examLinks, err := client.ResultComponentExam.Query().
		Where(entcomponentexam.ResultComponentIDIn(ids...)).
		Order(
			tenantent.Asc(entcomponentexam.FieldCreatedAt),
			tenantent.Asc(entcomponentexam.FieldID),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	homeworkLinks, err := client.ResultComponentAssignment.Query().
		Where(entcomponentassignment.ResultComponentIDIn(ids...)).
		Order(
			tenantent.Asc(entcomponentassignment.FieldCreatedAt),
			tenantent.Asc(entcomponentassignment.FieldID),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	papers, err := offeringPapers(ctx, client, offering, examLinks)
	if err != nil {
		return nil, err
	}
	titles, err := examTitles(ctx, client, examLinks)
	if err != nil {
		return nil, err
	}
	homework, err := homeworkTitles(ctx, client, homeworkLinks)
	if err != nil {
		return nil, err
	}

	plan := &resultPlan{
		scheme:  results.Scheme{ID: scheme.ID, Name: scheme.Name, TotalMarks: scheme.TotalMarks},
		examOf:  map[uuid.UUID]uuid.UUID{},
		paperOf: map[uuid.UUID]uuid.UUID{},
	}

	for _, component := range components {
		sources := plan.examSources(component, examLinks, papers, titles)
		sources = append(sources, plan.homeworkSources(component, homeworkLinks, homework)...)

		if reason := componentShortfall(component, len(sources)); reason != "" {
			plan.composition.ComponentsDropped = append(plan.composition.ComponentsDropped,
				resultComponentGap{
					ID:     component.ID,
					Name:   component.Name,
					Weight: component.Weight,
					Reason: reason,
				})
			continue
		}

		plan.scheme.Components = append(plan.scheme.Components, results.Component{
			ID:           component.ID,
			Name:         component.Name,
			Position:     component.Position,
			MaximumMarks: component.MaximumMarks,
			Weight:       component.Weight,
			Aggregation:  results.Aggregation(component.Aggregation),
			TakeBest:     takeBestOf(component),
			Sources:      sources,
		})
	}
	return plan, nil
}

func takeBestOf(component *tenantent.ResultComponent) int {
	if component.TakeBest == nil {
		return 0
	}
	return *component.TakeBest
}

func componentShortfall(component *tenantent.ResultComponent, sources int) string {
	needed := 1
	if component.Aggregation == entcomponent.AggregationBestOf {
		needed = takeBestOf(component)
	}
	if sources >= needed && sources > 0 {
		return ""
	}
	if sources == 0 {
		return resultComponentEmpty
	}
	return resultComponentShort
}

func (p *resultPlan) examSources(component *tenantent.ResultComponent,
	links []*tenantent.ResultComponentExam, papers map[uuid.UUID]*tenantent.ExamSubject,
	titles map[uuid.UUID]string) []results.Source {

	var sources []results.Source
	for _, link := range links {
		if link.ResultComponentID != component.ID {
			continue
		}
		ref := results.ExamSource(link.ExamID)
		paper, set := papers[link.ExamID]
		if !set {
			p.composition.SourcesNotSet = append(p.composition.SourcesNotSet, resultSourceGap{
				ComponentID:   component.ID,
				ComponentName: component.Name,
				Ref:           ref,
				Label:         titles[link.ExamID],
				Reason:        resultSourceNoPaper,
			})
			continue
		}
		p.examOf[paper.ID] = link.ExamID
		p.paperOf[link.ExamID] = paper.ID
		sources = append(sources, results.Source{
			Ref:          ref,
			Label:        titles[link.ExamID],
			MaximumMarks: paper.MaximumMarks,
		})
	}
	return sources
}

func (p *resultPlan) homeworkSources(component *tenantent.ResultComponent,
	links []*tenantent.ResultComponentAssignment,
	homework map[uuid.UUID]*tenantent.Assignment) []results.Source {

	var sources []results.Source
	for _, link := range links {
		if link.ResultComponentID != component.ID {
			continue
		}
		ref := results.AssignmentSource(link.AssignmentID)
		row, known := homework[link.AssignmentID]
		if !known || row.MaximumMarks == nil || *row.MaximumMarks <= 0 {
			p.composition.SourcesNotSet = append(p.composition.SourcesNotSet, resultSourceGap{
				ComponentID:   component.ID,
				ComponentName: component.Name,
				Ref:           ref,
				Label:         homeworkLabel(row),
				Reason:        resultSourceNoMaximum,
			})
			continue
		}
		p.assignments = append(p.assignments, link.AssignmentID)
		sources = append(sources, results.Source{
			Ref:          ref,
			Label:        row.Title,
			MaximumMarks: *row.MaximumMarks,
		})
	}
	return sources
}

func homeworkLabel(row *tenantent.Assignment) string {
	if row == nil {
		return ""
	}
	return row.Title
}

func offeringPapers(ctx context.Context, client *tenantent.Client, offering uuid.UUID,
	links []*tenantent.ResultComponentExam) (map[uuid.UUID]*tenantent.ExamSubject, error) {

	ids := linkedExams(links)
	if len(ids) == 0 {
		return map[uuid.UUID]*tenantent.ExamSubject{}, nil
	}

	rows, err := client.ExamSubject.Query().
		Where(
			entexamsubject.ExamIDIn(ids...),
			entexamsubject.SubjectOfferingID(offering),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make(map[uuid.UUID]*tenantent.ExamSubject, len(rows))
	for _, row := range rows {
		out[row.ExamID] = row
	}
	return out, nil
}

func examTitles(ctx context.Context, client *tenantent.Client,
	links []*tenantent.ResultComponentExam) (map[uuid.UUID]string, error) {

	ids := linkedExams(links)
	if len(ids) == 0 {
		return map[uuid.UUID]string{}, nil
	}

	rows, err := client.Exam.Query().Where(entexam.IDIn(ids...)).All(ctx)
	if err != nil {
		return nil, err
	}

	out := make(map[uuid.UUID]string, len(rows))
	for _, row := range rows {
		out[row.ID] = row.Name
	}
	return out, nil
}

func homeworkTitles(ctx context.Context, client *tenantent.Client,
	links []*tenantent.ResultComponentAssignment) (map[uuid.UUID]*tenantent.Assignment, error) {

	ids := linkedAssignments(links)
	if len(ids) == 0 {
		return map[uuid.UUID]*tenantent.Assignment{}, nil
	}

	rows, err := client.Assignment.Query().Where(entassignment.IDIn(ids...)).All(ctx)
	if err != nil {
		return nil, err
	}

	out := make(map[uuid.UUID]*tenantent.Assignment, len(rows))
	for _, row := range rows {
		out[row.ID] = row
	}
	return out, nil
}

func linkedExams(links []*tenantent.ResultComponentExam) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(links))
	out := make([]uuid.UUID, 0, len(links))
	for _, link := range links {
		if _, dup := seen[link.ExamID]; dup {
			continue
		}
		seen[link.ExamID] = struct{}{}
		out = append(out, link.ExamID)
	}
	return out
}

func linkedAssignments(links []*tenantent.ResultComponentAssignment) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(links))
	out := make([]uuid.UUID, 0, len(links))
	for _, link := range links {
		if _, dup := seen[link.AssignmentID]; dup {
			continue
		}
		seen[link.AssignmentID] = struct{}{}
		out = append(out, link.AssignmentID)
	}
	return out
}

func gatherResultMarks(ctx context.Context, client *tenantent.Client, plan *resultPlan,
	roster []uuid.UUID) (map[uuid.UUID][]results.Mark, error) {

	out := make(map[uuid.UUID][]results.Mark, len(roster))
	if len(roster) == 0 {
		return out, nil
	}

	papers := make([]uuid.UUID, 0, len(plan.examOf))
	for paper := range plan.examOf {
		papers = append(papers, paper)
	}

	if len(papers) > 0 {
		rows, err := client.StudentExamMark.Query().
			Where(
				entexammark.ExamSubjectIDIn(papers...),
				entexammark.StudentIDIn(roster...),
			).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			exam, known := plan.examOf[row.ExamSubjectID]
			if !known {
				continue
			}
			if mark, usable := examMarkOf(row, results.ExamSource(exam)); usable {
				out[row.StudentID] = append(out[row.StudentID], mark)
			}
		}
	}

	if len(plan.assignments) == 0 {
		return out, nil
	}

	graded, err := gradedSubmissions(ctx, client, plan.assignments, roster)
	if err != nil {
		return nil, err
	}
	for key, row := range graded {
		out[key.student] = append(out[key.student],
			results.Scored(results.AssignmentSource(key.source), *row.MarksObtained))
	}
	return out, nil
}

func examMarkOf(row *tenantent.StudentExamMark, ref results.SourceRef) (results.Mark, bool) {
	switch row.Status {
	case entexammark.StatusAbsent:
		return results.Absent(ref), true
	case entexammark.StatusExempt:
		return results.Exempt(ref), true
	}
	if row.MarksObtained == nil {
		return results.Mark{}, false
	}
	if row.Provisional {
		return results.ScoredProvisionally(ref, *row.MarksObtained), true
	}
	return results.Scored(ref, *row.MarksObtained), true
}

func gradedSubmissions(ctx context.Context, client *tenantent.Client,
	assignments, roster []uuid.UUID) (map[sourceMark]*tenantent.AssignmentSubmission, error) {

	rows, err := client.AssignmentSubmission.Query().
		Where(
			entsubmission.AssignmentIDIn(assignments...),
			entsubmission.StudentIDIn(roster...),
			entsubmission.MarksObtainedNotNil(),
		).
		Order(tenantent.Asc(entsubmission.FieldAttemptNumber)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make(map[sourceMark]*tenantent.AssignmentSubmission, len(rows))
	for _, row := range rows {
		key := sourceMark{student: row.StudentID, source: row.AssignmentID}
		if kept, seen := out[key]; seen && kept.AttemptNumber > row.AttemptNumber {
			continue
		}
		out[key] = row
	}
	return out, nil
}
