package http

import (
	"context"
	"fmt"
	"net/http"
	"sort"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entgrading "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradingscheme"
	entresultscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultscheme"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subject"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
	"github.com/Harbour-Emerge/emerge-core/internal/service/results"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	reportCardStudentNotFound = "student not found"
	reportCardSessionNotFound = "academic session not found"

	reportCardNoCurrentSession = "no academic session is marked current, so name the one this " +
		"report card is for with academic_session_id"

	reportCardNoSubjects = "this pupil is not actively enrolled in any subject you can read for " +
		"that session, so there is nothing to report"

	reportCardNarrowed = "your grant reaches some of the subjects this pupil takes and not the " +
		"rest, so these lines are what you may read rather than the whole card, and final above " +
		"is about the lines shown"

	reportCardNoAggregate = "a total across subjects is a school's policy, not arithmetic: a mean " +
		"of percentages, a weighting by subject and the best five of six are all in use and they " +
		"disagree, so none is computed here; the per-subject lines are what a school's own rule " +
		"would be applied to"
)

const (
	reportSubjectFinal          = "final"
	reportSubjectProvisional    = "provisional"
	reportSubjectPartlyComposed = "partly_composed"
	reportSubjectInProgress     = "in_progress"
	reportSubjectAwaiting       = "awaiting_marks"
	reportSubjectExempt         = "exempt"
	reportSubjectNotComposed    = "not_composed"
)

const (
	reportAwaitingMessage = "nothing this subject is composed of has been marked, missed or " +
		"excused yet, so the nought is the absence of marks and not a score"
	reportInProgressMessage = "some of what this subject is composed of has not been marked yet, " +
		"so the score counts only what has been decided and will move as the rest arrives"
	reportProvisionalMessage = "a mark this total is made of is auto-marked and still waiting " +
		"for a teacher, so the score is real but not settled"
	reportPartlyComposedMessage = "this subject is composed of less than its result scheme says; " +
		"composition names what is not set for it, and the weight consequently left out"
	reportExemptMessage = "this pupil is exempt from every part of this subject that would be " +
		"scored, so there is nothing to total and the nought is not a score"

	reportGradeNoScheme = "no grading scheme is attached to this subject, so there is nothing " +
		"to name the score with"
	reportGradeNoScale   = "this grading scheme carries no bands, so it names nothing"
	reportGradeNoBand    = "no band in this grading scheme covers that percentage"
	reportGradeUnsettled = "the percentage of a part-marked subject is a floor and not a score, " +
		"and a band named from it would read as a verdict on marks nobody has entered"
	reportGradeNotWhole = "the percentage is of what this subject is actually composed of rather " +
		"than of the scheme, so a band named from it would overstate what was assessed"
	reportGradeNothingAssessed = "nothing in this subject was assessed, so there is no " +
		"percentage to name"
)

const reportBandEpsilon = 1e-9

type reportGrade struct {
	GradingSchemeID uuid.UUID `json:"grading_scheme_id"`
	GradingScheme   string    `json:"grading_scheme"`
	Kind            string    `json:"kind"`
	Percentage      float64   `json:"percentage"`
	Label           string    `json:"label"`
	Points          *float64  `json:"points,omitempty"`
	MinPercent      float64   `json:"min_percent"`
	MaxPercent      float64   `json:"max_percent"`
	Description     *string   `json:"description,omitempty"`
	Provisional     bool      `json:"provisional"`
}

type reportGradeGap struct {
	GradingSchemeID *uuid.UUID `json:"grading_scheme_id"`
	GradingScheme   string     `json:"grading_scheme,omitempty"`
	Reason          string     `json:"reason"`
}

type reportSubject struct {
	SubjectOfferingID uuid.UUID          `json:"subject_offering_id"`
	SubjectID         uuid.UUID          `json:"subject_id"`
	Subject           string             `json:"subject"`
	SubjectCode       string             `json:"subject_code"`
	Status            string             `json:"status"`
	Reason            string             `json:"reason,omitempty"`
	Final             bool               `json:"final"`
	ResultSchemeID    *uuid.UUID         `json:"result_scheme_id"`
	ResultScheme      string             `json:"result_scheme,omitempty"`
	Result            *results.Result    `json:"result"`
	Composition       *resultComposition `json:"composition,omitempty"`
	Grade             *reportGrade       `json:"grade"`
	GradeNotNamed     *reportGradeGap    `json:"grade_not_named,omitempty"`
}

type reportOffering struct {
	offering *tenantent.SubjectOffering
	subject  *tenantent.Subject
}

func (s *Server) getStudentReportCard(w http.ResponseWriter, r *http.Request) {
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
	askedSession := p.UUID("academic_session_id")
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

	reachable, err := client.Student.Query().
		Where(entstudent.ID(id), access.StudentsForAcademic(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, reachable, err, reportCardStudentNotFound) {
		return
	}

	session, ok := reportCardSession(ctx, w, client, askedSession)
	if !ok {
		return
	}

	offerings, err := reportCardOfferings(ctx, client, id, session, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	subjects, err := reportCardSubjects(ctx, client, id, offerings)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	taken, err := reportCardSubjectsTaken(ctx, client, id, session)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	body := response.Envelope{
		"student_id":           id,
		"academic_session_id":  session,
		"subjects":             subjects,
		"count":                len(subjects),
		"covers_every_subject": taken == len(subjects),
		"final":                reportCardSettled(subjects),
		"provisional":          reportCardProvisional(subjects),
		"subjects_by_status":   reportCardTally(subjects),
		"aggregate":            nil,
		"aggregate_reason":     reportCardNoAggregate,
	}
	if taken != len(subjects) {
		body["coverage_reason"] = reportCardNarrowed
	}
	if len(subjects) == 0 {
		body["reason"] = reportCardNoSubjects
	}
	response.JSON(w, http.StatusOK, body)
}

func reportCardSubjectsTaken(ctx context.Context, client *tenantent.Client,
	student, session uuid.UUID) (int, error) {

	offerings, err := client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.StudentID(student),
			entsubjenroll.AcademicSessionID(session),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		).
		GroupBy(entsubjenroll.FieldSubjectOfferingID).
		Strings(ctx)
	if err != nil {
		return 0, err
	}
	return len(offerings), nil
}

func reportCardSession(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	asked *uuid.UUID) (uuid.UUID, bool) {

	if asked != nil {
		found, err := client.AcademicSession.Query().Where(entsession.ID(*asked)).Exist(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return uuid.Nil, false
		}
		if !found {
			response.Error(w, http.StatusNotFound, reportCardSessionNotFound)
			return uuid.Nil, false
		}
		return *asked, true
	}

	current, err := client.AcademicSession.Query().
		Where(entsession.IsCurrent(true)).
		Order(tenantent.Asc(entsession.FieldStartDate), tenantent.Asc(entsession.FieldID)).
		First(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			response.Error(w, http.StatusBadRequest, reportCardNoCurrentSession)
			return uuid.Nil, false
		}
		writeTenancyErr(w, err)
		return uuid.Nil, false
	}
	return current.ID, true
}

func reportCardOfferings(ctx context.Context, client *tenantent.Client,
	student, session uuid.UUID, v *access.Viewer,
	d authorization.Decision) ([]reportOffering, error) {

	rows, err := client.SubjectOffering.Query().
		Where(
			resultOfferingScope(v, d),
			entoffering.AcademicSessionID(session),
			entoffering.HasStudentEnrollmentsWith(
				entsubjenroll.StudentID(student),
				entsubjenroll.AcademicSessionID(session),
				entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
			),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.SubjectID)
	}
	named, err := client.Subject.Query().Where(entsubject.IDIn(ids...)).All(ctx)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]*tenantent.Subject, len(named))
	for _, row := range named {
		byID[row.ID] = row
	}

	out := make([]reportOffering, 0, len(rows))
	for _, row := range rows {
		subject, known := byID[row.SubjectID]
		if !known {
			return nil, fmt.Errorf("subject offering %s names subject %s, which is not there",
				row.ID, row.SubjectID)
		}
		out = append(out, reportOffering{offering: row, subject: subject})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].subject.Name != out[j].subject.Name {
			return out[i].subject.Name < out[j].subject.Name
		}
		return out[i].offering.ID.String() < out[j].offering.ID.String()
	})
	return out, nil
}

func reportCardSubjects(ctx context.Context, client *tenantent.Client, student uuid.UUID,
	offerings []reportOffering) ([]reportSubject, error) {

	composed, err := reportResultSchemes(ctx, client, offerings)
	if err != nil {
		return nil, err
	}
	named, err := reportGradingSchemes(ctx, client, offerings)
	if err != nil {
		return nil, err
	}

	out := make([]reportSubject, 0, len(offerings))
	for _, row := range offerings {
		line, err := reportCardSubject(ctx, client, student, row, composed, named)
		if err != nil {
			return nil, err
		}
		out = append(out, line)
	}
	return out, nil
}

func reportCardSubject(ctx context.Context, client *tenantent.Client, student uuid.UUID,
	row reportOffering, composed map[uuid.UUID]*tenantent.ResultScheme,
	named map[uuid.UUID]*tenantent.GradingScheme) (reportSubject, error) {

	line := reportSubject{
		SubjectOfferingID: row.offering.ID,
		SubjectID:         row.offering.SubjectID,
		Subject:           row.subject.Name,
		SubjectCode:       row.subject.Code,
		ResultSchemeID:    row.offering.ResultSchemeID,
	}
	grading := reportGradingSchemeOf(row, named)

	if row.offering.ResultSchemeID == nil {
		line.Status = reportSubjectNotComposed
		line.Reason = resultNotComposed
		line.GradeNotNamed = reportGradeWithheld(grading, reportGradeNothingAssessed)
		return line, nil
	}

	scheme, known := composed[*row.offering.ResultSchemeID]
	if !known {
		return reportSubject{}, fmt.Errorf("subject offering %s names result scheme %s, "+
			"which is not there", row.offering.ID, *row.offering.ResultSchemeID)
	}
	line.ResultScheme = scheme.Name

	plan, err := planOfferingResult(ctx, client, scheme, row.offering.ID)
	if err != nil {
		return reportSubject{}, err
	}
	composition := plan.composition
	line.Composition = &composition

	if len(plan.scheme.Components) == 0 {
		line.Status = resultNothingScorable
		line.Reason = resultUnfilledMessage(scheme.Name)
		line.GradeNotNamed = reportGradeWithheld(grading, reportGradeNothingAssessed)
		return line, nil
	}

	marks, err := gatherResultMarks(ctx, client, plan, []uuid.UUID{student})
	if err != nil {
		return reportSubject{}, err
	}
	computed, err := results.Compute(plan.scheme, marks[student])
	if err != nil {
		line.Status = resultNotComputable
		line.Reason = err.Error()
		line.GradeNotNamed = reportGradeWithheld(grading, reportGradeNothingAssessed)
		return line, nil
	}

	whole := composition.whole()
	line.Result = &computed
	line.Final = computed.Final() && whole
	line.Status, line.Reason = reportSubjectStatus(computed, whole)
	line.Grade, line.GradeNotNamed = reportSubjectGrade(computed, whole, grading)
	return line, nil
}

func reportSubjectStatus(out results.Result, whole bool) (string, string) {
	switch {
	case out.AssessedTotal <= 0:
		return reportSubjectExempt, reportExemptMessage
	case !out.Complete && reportDecided(out) == 0:
		return reportSubjectAwaiting, reportAwaitingMessage
	case !out.Complete:
		return reportSubjectInProgress, reportInProgressMessage
	case out.Provisional:
		return reportSubjectProvisional, reportProvisionalMessage
	case !whole:
		return reportSubjectPartlyComposed, reportPartlyComposedMessage
	default:
		return reportSubjectFinal, ""
	}
}

func reportDecided(out results.Result) int {
	decided := 0
	for _, component := range out.Components {
		for _, source := range component.Sources {
			if source.Outcome != results.OutcomeNotEntered {
				decided++
			}
		}
	}
	return decided
}

func reportSubjectGrade(out results.Result, whole bool,
	scheme *tenantent.GradingScheme) (*reportGrade, *reportGradeGap) {

	switch {
	case scheme == nil:
		return nil, &reportGradeGap{Reason: reportGradeNoScheme}
	case out.AssessedTotal <= 0:
		return nil, reportGradeWithheld(scheme, reportGradeNothingAssessed)
	case !out.Complete:
		return nil, reportGradeWithheld(scheme, reportGradeUnsettled)
	case !whole:
		return nil, reportGradeWithheld(scheme, reportGradeNotWhole)
	case len(scheme.ScaleJSON) == 0:
		return nil, reportGradeWithheld(scheme, reportGradeNoScale)
	}

	percentage := out.Percentage()
	band := reportGradeBand(scheme.ScaleJSON, percentage)
	if band == nil {
		return nil, reportGradeWithheld(scheme, reportGradeNoBand)
	}

	return &reportGrade{
		GradingSchemeID: scheme.ID,
		GradingScheme:   scheme.Name,
		Kind:            string(scheme.Kind),
		Percentage:      percentage,
		Label:           band.Label,
		Points:          band.Points,
		MinPercent:      band.MinPercent,
		MaxPercent:      band.MaxPercent,
		Description:     band.Description,
		Provisional:     out.Provisional,
	}, nil
}

func reportGradeWithheld(scheme *tenantent.GradingScheme, reason string) *reportGradeGap {
	if scheme == nil {
		return &reportGradeGap{Reason: reportGradeNoScheme}
	}
	id := scheme.ID
	return &reportGradeGap{GradingSchemeID: &id, GradingScheme: scheme.Name, Reason: reason}
}

func reportGradeBand(scale []schema.GradeBand, percentage float64) *schema.GradeBand {
	for i := range scale {
		if percentage+reportBandEpsilon >= scale[i].MinPercent &&
			percentage <= scale[i].MaxPercent+reportBandEpsilon {
			return &scale[i]
		}
	}
	return nil
}

func reportResultSchemes(ctx context.Context, client *tenantent.Client,
	offerings []reportOffering) (map[uuid.UUID]*tenantent.ResultScheme, error) {

	ids := make([]uuid.UUID, 0, len(offerings))
	for _, row := range offerings {
		if row.offering.ResultSchemeID != nil {
			ids = append(ids, *row.offering.ResultSchemeID)
		}
	}
	out := map[uuid.UUID]*tenantent.ResultScheme{}
	if len(ids) == 0 {
		return out, nil
	}

	rows, err := client.ResultScheme.Query().Where(entresultscheme.IDIn(ids...)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.ID] = row
	}
	return out, nil
}

func reportGradingSchemes(ctx context.Context, client *tenantent.Client,
	offerings []reportOffering) (map[uuid.UUID]*tenantent.GradingScheme, error) {

	ids := make([]uuid.UUID, 0, len(offerings))
	for _, row := range offerings {
		if row.offering.GradingSchemeID != nil {
			ids = append(ids, *row.offering.GradingSchemeID)
		}
	}
	out := map[uuid.UUID]*tenantent.GradingScheme{}
	if len(ids) == 0 {
		return out, nil
	}

	rows, err := client.GradingScheme.Query().Where(entgrading.IDIn(ids...)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.ID] = row
	}
	return out, nil
}

func reportGradingSchemeOf(row reportOffering,
	named map[uuid.UUID]*tenantent.GradingScheme) *tenantent.GradingScheme {

	if row.offering.GradingSchemeID == nil {
		return nil
	}
	return named[*row.offering.GradingSchemeID]
}

func reportCardSettled(subjects []reportSubject) bool {
	if len(subjects) == 0 {
		return false
	}
	for _, line := range subjects {
		if !line.Final {
			return false
		}
	}
	return true
}

func reportCardProvisional(subjects []reportSubject) bool {
	for _, line := range subjects {
		if line.Result != nil && line.Result.Provisional {
			return true
		}
	}
	return false
}

func reportCardTally(subjects []reportSubject) map[string]int {
	tally := map[string]int{}
	for _, line := range subjects {
		tally[line.Status]++
	}
	return tally
}
