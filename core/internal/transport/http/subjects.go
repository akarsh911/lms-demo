package http

import (
	"context"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/academic"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entgradingscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradingscheme"
	entresultscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultscheme"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subject"
	entgroup "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectgroup"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type subjectPayload struct {
	Name        *string `json:"name"`
	ShortName   *string `json:"short_name"`
	Code        *string `json:"code"`
	Description *string `json:"description"`
	SubjectType *string `json:"subject_type"`
	IsElective  *bool   `json:"is_elective"`
	Status      *string `json:"status"`
}

func (s *Server) listSubjects(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := academic.ParseSubjectFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := filters.Apply(client.Subject.Query())
	rows, err := q.Order(tenantent.Asc(entsubject.FieldName)).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"subjects": rows,
		"count":    len(rows),
		"page":     pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createSubject(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in subjectPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsubject.Columns, sent) {
		return
	}
	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}

	create := client.Subject.Create().
		SetName(*in.Name).
		SetCode(*in.Code).
		SetNillableShortName(in.ShortName).
		SetNillableDescription(in.Description)

	if in.SubjectType != nil && *in.SubjectType != "" {
		create = create.SetSubjectType(*in.SubjectType)
	}
	if in.IsElective != nil {
		create = create.SetIsElective(*in.IsElective)
	}
	if in.Status != nil {
		if err := entsubject.StatusValidator(entsubject.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entsubject.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "subject not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateSubject(w http.ResponseWriter, r *http.Request) {
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

	var in subjectPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsubject.Columns, sent) {
		return
	}

	update := client.Subject.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableShortName(in.ShortName).
		SetNillableDescription(in.Description)

	if in.SubjectType != nil && *in.SubjectType != "" {
		update = update.SetSubjectType(*in.SubjectType)
	}
	if in.IsElective != nil {
		update = update.SetIsElective(*in.IsElective)
	}
	if in.Status != nil {
		if err := entsubject.StatusValidator(entsubject.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entsubject.Status(*in.Status))
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "subject not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteSubject(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, "subject not found",
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.Subject.DeleteOneID(id).Exec(ctx)
		})
}

type subjectGroupPayload struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
}

func (s *Server) listSubjectGroups(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := academic.ParseSubjectGroupFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := filters.Apply(client.SubjectGroup.Query())
	rows, err := q.Order(tenantent.Asc(entgroup.FieldName)).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"subject_groups": rows,
		"count":          len(rows),
		"page":           pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createSubjectGroup(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in subjectGroupPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entgroup.Columns, sent) {
		return
	}
	if in.Name == nil || *in.Name == "" {
		response.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	create := client.SubjectGroup.Create().
		SetName(*in.Name).
		SetNillableDescription(in.Description)
	if in.Status != nil {
		if err := entgroup.StatusValidator(entgroup.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entgroup.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "subject group not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateSubjectGroup(w http.ResponseWriter, r *http.Request) {
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

	var in subjectGroupPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entgroup.Columns, sent) {
		return
	}

	update := client.SubjectGroup.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableDescription(in.Description)
	if in.Status != nil {
		if err := entgroup.StatusValidator(entgroup.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entgroup.Status(*in.Status))
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "subject group not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteSubjectGroup(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, "subject group not found",
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.SubjectGroup.DeleteOneID(id).Exec(ctx)
		})
}

type offeringPayload struct {
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	SectionID         *uuid.UUID `json:"section_id"`
	SubjectID         *uuid.UUID `json:"subject_id"`
	SubjectGroupID    *uuid.UUID `json:"subject_group_id"`
	PeriodsPerWeek    *int       `json:"periods_per_week"`
	MinutesPerWeek    *int       `json:"minutes_per_week"`
	MaximumMarks      *float64   `json:"maximum_marks"`
	PassMarks         *float64   `json:"pass_marks"`
	GradingSchemeID   *uuid.UUID `json:"grading_scheme_id"`
	ResultSchemeID    *uuid.UUID `json:"result_scheme_id"`
	Status            *string    `json:"status"`
}

func (s *Server) listOfferings(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := academic.ParseOfferingFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := filters.Apply(client.SubjectOffering.Query().WithSubject().WithSection())
	rows, err := q.All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"subject_offerings": rows,
		"count":             len(rows),
		"page":              pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getOffering(w http.ResponseWriter, r *http.Request) {
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

	row, err := client.SubjectOffering.Query().
		Where(entoffering.ID(id)).
		WithSubject().WithSection().WithSubjectGroup().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "subject offering not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) createOffering(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in offeringPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entoffering.Columns, sent) {
		return
	}
	if in.AcademicSessionID == nil || in.SectionID == nil || in.SubjectID == nil {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id, section_id and subject_id are required")
		return
	}
	if !marksValid(w, in) {
		return
	}
	if !minutesValid(w, in) {
		return
	}

	create := client.SubjectOffering.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetSectionID(*in.SectionID).
		SetSubjectID(*in.SubjectID)

	if in.SubjectGroupID != nil {
		create = create.SetSubjectGroupID(*in.SubjectGroupID)
	}
	if in.PeriodsPerWeek != nil {
		create = create.SetPeriodsPerWeek(*in.PeriodsPerWeek)
	}
	if in.MinutesPerWeek != nil {
		create = create.SetMinutesPerWeek(*in.MinutesPerWeek)
	}
	if in.MaximumMarks != nil {
		create = create.SetMaximumMarks(*in.MaximumMarks)
	}
	if in.PassMarks != nil {
		create = create.SetPassMarks(*in.PassMarks)
	}
	if in.GradingSchemeID != nil {
		if !gradingSchemeAttachable(w, ctx, client, *in.GradingSchemeID, *in.AcademicSessionID) {
			return
		}
		create = create.SetGradingSchemeID(*in.GradingSchemeID)
	}
	if in.ResultSchemeID != nil {
		if !resultSchemeAttachable(w, ctx, client, *in.ResultSchemeID, *in.AcademicSessionID) {
			return
		}
		create = create.SetResultSchemeID(*in.ResultSchemeID)
	}
	if in.Status != nil {
		if err := entoffering.StatusValidator(entoffering.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entoffering.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "subject offering not found")
		return
	}
	w.Header().Set("Location", "/api/v1/subject-offerings/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateOffering(w http.ResponseWriter, r *http.Request) {
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

	var in offeringPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entoffering.Columns, sent) {
		return
	}
	if !marksValid(w, in) {
		return
	}
	if !minutesValid(w, in) {
		return
	}
	if !rejectNull(w, sent, entoffering.FieldStatus, in.Status) {
		return
	}

	var current *tenantent.SubjectOffering
	if in.GradingSchemeID != nil || in.ResultSchemeID != nil {
		current, err = client.SubjectOffering.Query().Where(entoffering.ID(id)).Only(ctx)
		if err != nil {
			writeTenantEntErr(w, err, "subject offering not found")
			return
		}
	}

	update := client.SubjectOffering.UpdateOneID(id)

	if in.SubjectGroupID != nil {
		update = update.SetSubjectGroupID(*in.SubjectGroupID)
	}
	if wasCleared(sent, entoffering.FieldSubjectGroupID, in.SubjectGroupID) {
		update = update.ClearSubjectGroupID()
	}
	if in.PeriodsPerWeek != nil {
		update = update.SetPeriodsPerWeek(*in.PeriodsPerWeek)
	}
	if wasCleared(sent, entoffering.FieldPeriodsPerWeek, in.PeriodsPerWeek) {
		update = update.ClearPeriodsPerWeek()
	}
	if in.MinutesPerWeek != nil {
		update = update.SetMinutesPerWeek(*in.MinutesPerWeek)
	}
	if wasCleared(sent, entoffering.FieldMinutesPerWeek, in.MinutesPerWeek) {
		update = update.ClearMinutesPerWeek()
	}
	if in.MaximumMarks != nil {
		update = update.SetMaximumMarks(*in.MaximumMarks)
	}
	if wasCleared(sent, entoffering.FieldMaximumMarks, in.MaximumMarks) {
		update = update.ClearMaximumMarks()
	}
	if in.PassMarks != nil {
		update = update.SetPassMarks(*in.PassMarks)
	}
	if wasCleared(sent, entoffering.FieldPassMarks, in.PassMarks) {
		update = update.ClearPassMarks()
	}
	if in.GradingSchemeID != nil {
		if !gradingSchemeAttachable(w, ctx, client, *in.GradingSchemeID, current.AcademicSessionID) {
			return
		}
		update = update.SetGradingSchemeID(*in.GradingSchemeID)
	}
	if wasCleared(sent, entoffering.FieldGradingSchemeID, in.GradingSchemeID) {
		update = update.ClearGradingSchemeID()
	}
	if in.ResultSchemeID != nil {
		if !resultSchemeAttachable(w, ctx, client, *in.ResultSchemeID, current.AcademicSessionID) {
			return
		}
		update = update.SetResultSchemeID(*in.ResultSchemeID)
	}
	if wasCleared(sent, entoffering.FieldResultSchemeID, in.ResultSchemeID) {
		update = update.ClearResultSchemeID()
	}
	if in.Status != nil {
		if err := entoffering.StatusValidator(entoffering.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entoffering.Status(*in.Status))
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "subject offering not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteOffering(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, "subject offering not found",
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.SubjectOffering.DeleteOneID(id).Exec(ctx)
		})
}

func resultSchemeAttachable(w http.ResponseWriter, ctx context.Context,
	client *tenantent.Client, schemeID, sessionID uuid.UUID) bool {

	scheme, err := client.ResultScheme.Query().Where(entresultscheme.ID(schemeID)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resultSchemeNotFound)
		return false
	}
	if scheme.AcademicSessionID != sessionID {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error": "result_scheme_other_session",
			"message": "this scheme belongs to another academic session, and the exams and " +
				"assignments its components draw from are that session's, not this offering's",
		})
		return false
	}
	if scheme.Status != entresultscheme.StatusActive {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error": "result_scheme_not_active",
			"message": "this scheme is " + string(scheme.Status) + "; only an active scheme has been " +
				"checked to account for every mark it is out of, and attaching this one would freeze " +
				"it against the editing it still needs",
		})
		return false
	}
	return true
}

func gradingSchemeAttachable(w http.ResponseWriter, ctx context.Context,
	client *tenantent.Client, schemeID, sessionID uuid.UUID) bool {

	scheme, err := client.GradingScheme.Query().Where(entgradingscheme.ID(schemeID)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, gradingSchemeNotFound)
		return false
	}
	if scheme.AcademicSessionID != sessionID {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error": "grading_scheme_other_session",
			"message": "this scheme belongs to another academic session, and the bands a mark is " +
				"read against must be the ones this offering's session settled on, not another " +
				"year's",
		})
		return false
	}
	return true
}

const minutesInAWeek = 7 * 24 * 60

func minutesValid(w http.ResponseWriter, in offeringPayload) bool {
	if in.MinutesPerWeek == nil {
		return true
	}
	if *in.MinutesPerWeek < 0 {
		response.Error(w, http.StatusBadRequest, "minutes_per_week cannot be negative")
		return false
	}
	if *in.MinutesPerWeek > minutesInAWeek {
		response.Error(w, http.StatusUnprocessableEntity,
			"minutes_per_week cannot exceed the "+strconv.Itoa(minutesInAWeek)+" minutes a week holds")
		return false
	}
	return true
}

func marksValid(w http.ResponseWriter, in offeringPayload) bool {
	if in.MaximumMarks != nil && *in.MaximumMarks < 0 {
		response.Error(w, http.StatusBadRequest, "maximum_marks cannot be negative")
		return false
	}
	if in.PassMarks != nil && *in.PassMarks < 0 {
		response.Error(w, http.StatusBadRequest, "pass_marks cannot be negative")
		return false
	}
	if in.MaximumMarks != nil && in.PassMarks != nil && *in.PassMarks > *in.MaximumMarks {
		response.Error(w, http.StatusUnprocessableEntity, "pass_marks cannot exceed maximum_marks")
		return false
	}
	return true
}
