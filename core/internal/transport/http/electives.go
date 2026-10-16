package http

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entgroup "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/electivegroup"
	entarm "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/electivegroupoffering"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	electiveGroupNotFound  = "elective group not found"
	electiveArmNotLinked   = "that subject offering is not an arm of this elective group"
	electiveNoArms         = "this elective group has no arms yet, so there is nothing to choose"
	electiveEnrollNotFound = "student enrollment not found"
)

const (
	electiveArmOfferingIndex = "electivegroupoffering_subject_offering_id"
	electiveGroupCodeIndex   = "electivegroup_section_id_code"
	electiveGroupCodeTaken   = "that section already has an elective group with this code"
)

var electiveChoiceWrites = []string{
	entsubjenroll.FieldStudentEnrollmentID,
	entsubjenroll.FieldSubjectOfferingID,
	entsubjenroll.FieldStudentID,
	entsubjenroll.FieldAcademicSessionID,
	entsubjenroll.FieldIsElectiveChoice,
	entsubjenroll.FieldEnrolledOn,
	entsubjenroll.FieldStatus,
}

var electiveChangeWrites = append(
	append([]string{}, electiveChoiceWrites...), entsubjenroll.FieldDroppedOn)

func (s *Server) electiveScope(ctx context.Context, write bool) (authorization.Decision, error) {
	narrow, wide := authorization.SubjectOfferingsRead, authorization.CurriculumReadAll
	if write {
		narrow, wide = authorization.SubjectOfferingsWrite, authorization.CurriculumWriteAll
	}
	_, decision, err := s.scopeFor(ctx, narrow, wide)
	return decision, err
}

type electiveGroupPayload struct {
	SectionID   *uuid.UUID `json:"section_id"`
	Name        *string    `json:"name"`
	Code        *string    `json:"code"`
	Description *string    `json:"description"`
	Position    *int       `json:"position"`
	Status      *string    `json:"status"`
}

type electiveArmPayload struct {
	SubjectOfferingID *uuid.UUID `json:"subject_offering_id"`
	Position          *int       `json:"position"`
}

type electiveChoicePayload struct {
	StudentEnrollmentID *uuid.UUID `json:"student_enrollment_id"`
	SubjectOfferingID   *uuid.UUID `json:"subject_offering_id"`
	EnrolledOn          *string    `json:"enrolled_on"`
}

type electiveChangePayload struct {
	SubjectOfferingID *uuid.UUID `json:"subject_offering_id"`
	EffectiveFrom     *string    `json:"effective_from"`
}

func (s *Server) listElectiveGroups(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	decision, err := s.electiveScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	sessionID := p.UUID("academic_session_id")
	sectionID := p.UUID("section_id")
	status := p.Enum("status", func(v string) error {
		return entgroup.StatusValidator(entgroup.Status(v))
	})
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := client.ElectiveGroup.Query()
	if sessionID != nil {
		q = q.Where(entgroup.AcademicSessionID(*sessionID))
	}
	if sectionID != nil {
		q = q.Where(entgroup.SectionID(*sectionID))
	}
	if status != nil {
		q = q.Where(entgroup.StatusEQ(entgroup.Status(*status)))
	}

	rows, err := q.
		Order(tenantent.Asc(entgroup.FieldPosition), tenantent.Asc(entgroup.FieldCode)).
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
		"elective_groups": projected,
		"count":           len(rows),
		"page":            pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) getElectiveGroup(w http.ResponseWriter, r *http.Request) {
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
	decision, err := s.electiveScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.ElectiveGroup.Query().Where(entgroup.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, electiveGroupNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"elective_group": projected})
}

func (s *Server) createElectiveGroup(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in electiveGroupPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, err := s.electiveScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entgroup.Columns, sent) {
		return
	}
	if in.SectionID == nil || in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "section_id, name and code are required")
		return
	}

	section, err := client.Section.Get(ctx, *in.SectionID)
	if err != nil {
		writeTenantEntErr(w, err, "section not found")
		return
	}

	create := client.ElectiveGroup.Create().
		SetSectionID(section.ID).
		SetAcademicSessionID(section.AcademicSessionID).
		SetName(*in.Name).
		SetCode(*in.Code).
		SetNillableDescription(in.Description)
	if in.Position != nil {
		create = create.SetPosition(*in.Position)
	}
	if in.Status != nil {
		if err := entgroup.StatusValidator(entgroup.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entgroup.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		if violates(err, electiveGroupCodeIndex) {
			response.Error(w, http.StatusConflict, electiveGroupCodeTaken)
			return
		}
		writeTenantEntErr(w, err, electiveGroupNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/elective-groups/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"elective_group": row})
}

func (s *Server) updateElectiveGroup(w http.ResponseWriter, r *http.Request) {
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

	var in electiveGroupPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, err := s.electiveScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entgroup.Columns, sent) {
		return
	}
	if in.SectionID != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"section_id is fixed when the group is created; make a group in the other section instead")
		return
	}
	if !rejectNull(w, sent, "name", in.Name) || !rejectNull(w, sent, "code", in.Code) {
		return
	}

	update := client.ElectiveGroup.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableCode(in.Code).
		SetNillablePosition(in.Position)
	if wasCleared(sent, "description", in.Description) {
		update = update.ClearDescription()
	} else if in.Description != nil {
		update = update.SetDescription(*in.Description)
	}
	if in.Status != nil {
		if err := entgroup.StatusValidator(entgroup.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entgroup.Status(*in.Status))
	}

	row, err := update.Save(ctx)
	if err != nil {
		if violates(err, electiveGroupCodeIndex) {
			response.Error(w, http.StatusConflict, electiveGroupCodeTaken)
			return
		}
		writeTenantEntErr(w, err, electiveGroupNotFound)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"elective_group": row})
}

func (s *Server) deleteElectiveGroup(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, electiveGroupNotFound,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.ElectiveGroup.DeleteOneID(id).Exec(ctx)
		})
}

func (s *Server) listElectiveGroupOfferings(w http.ResponseWriter, r *http.Request) {
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
	decision, err := s.electiveScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if _, ok := electiveGroupOf(w, ctx, client, id); !ok {
		return
	}

	rows, err := client.ElectiveGroupOffering.Query().
		Where(entarm.ElectiveGroupID(id)).
		WithSubjectOffering().
		Order(tenantent.Asc(entarm.FieldPosition), tenantent.Asc(entarm.FieldID)).
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
		"elective_group_offerings": projected,
		"count":                    len(rows),
	})
}

func (s *Server) addElectiveGroupOffering(w http.ResponseWriter, r *http.Request) {
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

	var in electiveArmPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, err := s.electiveScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entarm.Columns, sent) {
		return
	}
	if in.SubjectOfferingID == nil {
		response.Error(w, http.StatusBadRequest, "subject_offering_id is required")
		return
	}

	group, ok := electiveGroupOf(w, ctx, client, id)
	if !ok {
		return
	}

	offering, err := client.SubjectOffering.Get(ctx, *in.SubjectOfferingID)
	if err != nil {
		writeTenantEntErr(w, err, "subject offering not found")
		return
	}
	if offering.SectionID != group.SectionID {
		response.Error(w, http.StatusUnprocessableEntity,
			"that subject offering belongs to a different section than this elective group")
		return
	}
	if offering.AcademicSessionID != group.AcademicSessionID {
		response.Error(w, http.StatusUnprocessableEntity,
			"that subject offering belongs to a different academic session than this elective group")
		return
	}

	if held, err := client.ElectiveGroupOffering.Query().
		Where(entarm.SubjectOfferingID(offering.ID)).
		Only(ctx); err == nil {
		if held.ElectiveGroupID == group.ID {
			response.Error(w, http.StatusConflict,
				"that subject offering is already an arm of this elective group")
			return
		}
		response.Error(w, http.StatusConflict,
			"that subject offering is already an arm of elective group "+held.ElectiveGroupID.String())
		return
	} else if !tenantent.IsNotFound(err) {
		writeTenancyErr(w, err)
		return
	}

	create := client.ElectiveGroupOffering.Create().
		SetElectiveGroupID(group.ID).
		SetSubjectOfferingID(offering.ID)
	if in.Position != nil {
		create = create.SetPosition(*in.Position)
	}

	row, err := create.Save(ctx)
	if err != nil {
		if violates(err, electiveArmOfferingIndex) {
			response.Error(w, http.StatusConflict,
				"that subject offering is already an arm of an elective group")
			return
		}
		writeTenantEntErr(w, err, electiveGroupNotFound)
		return
	}
	response.JSON(w, http.StatusCreated, response.Envelope{"elective_group_offering": row})
}

func (s *Server) removeElectiveGroupOffering(w http.ResponseWriter, r *http.Request) {
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
	offeringID, ok := idParam(w, r, "offeringID")
	if !ok {
		return
	}
	if _, ok := electiveGroupOf(w, ctx, client, id); !ok {
		return
	}

	n, err := client.ElectiveGroupOffering.Delete().
		Where(entarm.ElectiveGroupID(id), entarm.SubjectOfferingID(offeringID)).
		Exec(ctx)
	if err != nil {
		writeTenantEntErr(w, err, electiveArmNotLinked)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, electiveArmNotLinked)
		return
	}
	response.NoContent(w)
}

func (s *Server) listElectiveChoices(w http.ResponseWriter, r *http.Request) {
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
		authorization.SubjectEnrollmentsRead, authorization.SubjectEnrollmentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	group, ok := electiveGroupOf(w, ctx, client, id)
	if !ok {
		return
	}
	arms, err := electiveArms(ctx, client, group.ID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	enrollments, err := client.StudentEnrollment.Query().
		Where(
			entenrollment.SectionID(group.SectionID),
			entenrollment.StatusEQ(entenrollment.StatusActive),
			access.EnrollmentsFor(viewer, decision),
		).
		Order(tenantent.Asc(entenrollment.FieldRollNumber), tenantent.Asc(entenrollment.FieldID)).
		Limit(limit).Offset(offset).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	chosen := map[uuid.UUID]*tenantent.StudentSubjectEnrollment{}
	if len(arms) > 0 && len(enrollments) > 0 {
		ids := make([]uuid.UUID, 0, len(enrollments))
		for _, row := range enrollments {
			ids = append(ids, row.ID)
		}
		rows, err := client.StudentSubjectEnrollment.Query().
			Where(
				entsubjenroll.StudentEnrollmentIDIn(ids...),
				entsubjenroll.SubjectOfferingIDIn(arms...),
				entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
				access.SubjectEnrollmentsFor(viewer, decision),
			).
			All(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return
		}
		for _, row := range rows {
			chosen[row.StudentEnrollmentID] = row
		}
	}

	choices := make([]response.Envelope, 0, len(enrollments))
	undecided := 0
	for _, enrolled := range enrollments {
		entry := response.Envelope{"student_enrollment_id": enrolled.ID}
		if decision.Fields.Permits(entsubjenroll.FieldStudentID) {
			entry["student_id"] = enrolled.StudentID
		}
		pick, ok := chosen[enrolled.ID]
		if !ok {
			undecided++
			entry["chosen"] = nil
			choices = append(choices, entry)
			continue
		}
		projected, err := project(pick, decision.Fields)
		if err != nil {
			response.ServerError(w, err)
			return
		}
		entry["chosen"] = projected
		choices = append(choices, entry)
	}
	traceProjection(r, decision.Fields, len(choices))

	response.JSON(w, http.StatusOK, response.Envelope{
		"elective_group_id": group.ID,
		"arms":              arms,
		"choices":           choices,
		"without_choice":    undecided,
		"count":             len(choices),
		"page":              pageOf(limit, offset, len(choices)),
	})
}

func (s *Server) chooseElective(w http.ResponseWriter, r *http.Request) {
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

	var in electiveChoicePayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.SubjectEnrollmentsWrite, authorization.SubjectEnrollmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsubjenroll.Columns, electiveChoiceWrites) {
		return
	}
	if in.StudentEnrollmentID == nil || in.SubjectOfferingID == nil {
		response.Error(w, http.StatusBadRequest,
			"student_enrollment_id and subject_offering_id are required")
		return
	}
	enrolledOn, err := parseDate(in.EnrolledOn)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "enrolled_on must be YYYY-MM-DD")
		return
	}

	group, arms, ok := electiveArmsOf(w, ctx, client, id)
	if !ok {
		return
	}
	if !armOfGroup(w, arms, *in.SubjectOfferingID) {
		return
	}

	enrolled, ok := reachableEnrollment(w, ctx, client, *in.StudentEnrollmentID, viewer, decision)
	if !ok {
		return
	}
	if enrolled.SectionID != group.SectionID {
		response.Error(w, http.StatusUnprocessableEntity,
			"that pupil is enrolled in a different section than this elective group")
		return
	}

	unit, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	defer unit.rollback()

	held, err := activeArm(ctx, unit.writer, enrolled.ID, arms)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if held != nil {
		if held.SubjectOfferingID == *in.SubjectOfferingID {
			response.Error(w, http.StatusConflict,
				"that pupil has already chosen this arm of the elective group")
			return
		}
		response.Error(w, http.StatusConflict,
			"that pupil already holds arm "+held.SubjectOfferingID.String()+
				" of this elective group; move them with PATCH rather than adding a second arm")
		return
	}

	row, err := takeArm(ctx, unit.writer, enrolled, *in.SubjectOfferingID, enrolledOn)
	if err != nil {
		writeTenantEntErr(w, err, electiveEnrollNotFound)
		return
	}
	if err := unit.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, response.Envelope{"subject_enrollment": row})
}

func (s *Server) changeElectiveChoice(w http.ResponseWriter, r *http.Request) {
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
	enrollmentID, ok := idParam(w, r, "enrollmentID")
	if !ok {
		return
	}

	var in electiveChangePayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.SubjectEnrollmentsWrite, authorization.SubjectEnrollmentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entsubjenroll.Columns, electiveChangeWrites) {
		return
	}
	if in.SubjectOfferingID == nil {
		response.Error(w, http.StatusBadRequest, "subject_offering_id is required")
		return
	}
	moved, err := parseDate(in.EffectiveFrom)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "effective_from must be YYYY-MM-DD")
		return
	}
	if moved == nil {
		today := nowUTC().Truncate(24 * time.Hour)
		moved = &today
	}

	group, arms, ok := electiveArmsOf(w, ctx, client, id)
	if !ok {
		return
	}
	if !armOfGroup(w, arms, *in.SubjectOfferingID) {
		return
	}

	enrolled, ok := reachableEnrollment(w, ctx, client, enrollmentID, viewer, decision)
	if !ok {
		return
	}
	if enrolled.SectionID != group.SectionID {
		response.Error(w, http.StatusUnprocessableEntity,
			"that pupil is enrolled in a different section than this elective group")
		return
	}

	unit, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	defer unit.rollback()

	held, err := activeArm(ctx, unit.writer, enrolled.ID, arms)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if held == nil {
		response.Error(w, http.StatusConflict,
			"that pupil holds no arm of this elective group; post a choice rather than changing one")
		return
	}
	if held.SubjectOfferingID == *in.SubjectOfferingID {
		response.JSON(w, http.StatusOK, response.Envelope{
			"dropped": nil,
			"chosen":  held,
		})
		return
	}

	dropped, err := unit.writer.StudentSubjectEnrollment.UpdateOneID(held.ID).
		SetStatus(entsubjenroll.StatusDropped).
		SetDroppedOn(*moved).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, electiveEnrollNotFound)
		return
	}

	row, err := takeArm(ctx, unit.writer, enrolled, *in.SubjectOfferingID, moved)
	if err != nil {
		writeTenantEntErr(w, err, electiveEnrollNotFound)
		return
	}
	if err := unit.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"dropped": dropped,
		"chosen":  row,
	})
}

func electiveGroupOf(w http.ResponseWriter, ctx context.Context,
	client *tenantent.Client, id uuid.UUID) (*tenantent.ElectiveGroup, bool) {
	group, err := client.ElectiveGroup.Query().Where(entgroup.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, electiveGroupNotFound)
		return nil, false
	}
	return group, true
}

func electiveArmsOf(w http.ResponseWriter, ctx context.Context, client *tenantent.Client,
	id uuid.UUID) (*tenantent.ElectiveGroup, []uuid.UUID, bool) {
	group, ok := electiveGroupOf(w, ctx, client, id)
	if !ok {
		return nil, nil, false
	}
	arms, err := electiveArms(ctx, client, group.ID)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, nil, false
	}
	if len(arms) == 0 {
		response.Error(w, http.StatusUnprocessableEntity, electiveNoArms)
		return nil, nil, false
	}
	return group, arms, true
}

func electiveArms(ctx context.Context, client *tenantent.Client,
	groupID uuid.UUID) ([]uuid.UUID, error) {
	var arms []uuid.UUID
	err := client.ElectiveGroupOffering.Query().
		Where(entarm.ElectiveGroupID(groupID)).
		Order(tenantent.Asc(entarm.FieldPosition), tenantent.Asc(entarm.FieldID)).
		Select(entarm.FieldSubjectOfferingID).
		Scan(ctx, &arms)
	if err != nil {
		return nil, err
	}
	return arms, nil
}

func armOfGroup(w http.ResponseWriter, arms []uuid.UUID, offeringID uuid.UUID) bool {
	for _, arm := range arms {
		if arm == offeringID {
			return true
		}
	}
	response.Error(w, http.StatusUnprocessableEntity, electiveArmNotLinked)
	return false
}

func reachableEnrollment(w http.ResponseWriter, ctx context.Context, client *tenantent.Client,
	id uuid.UUID, viewer *access.Viewer, decision authorization.Decision) (
	*tenantent.StudentEnrollment, bool) {
	enrolled, err := client.StudentEnrollment.Query().
		Where(entenrollment.ID(id), access.EnrollmentsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, electiveEnrollNotFound)
		return nil, false
	}
	return enrolled, true
}

func activeArm(ctx context.Context, client *tenantent.Client, enrollmentID uuid.UUID,
	arms []uuid.UUID) (*tenantent.StudentSubjectEnrollment, error) {
	row, err := client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.StudentEnrollmentID(enrollmentID),
			entsubjenroll.SubjectOfferingIDIn(arms...),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		).
		First(ctx)
	if tenantent.IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return row, nil
}

func takeArm(ctx context.Context, client *tenantent.Client, enrolled *tenantent.StudentEnrollment,
	offeringID uuid.UUID, on *time.Time) (*tenantent.StudentSubjectEnrollment, error) {
	existing, err := client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.StudentEnrollmentID(enrolled.ID),
			entsubjenroll.SubjectOfferingID(offeringID),
		).
		Only(ctx)
	switch {
	case err == nil:
		update := client.StudentSubjectEnrollment.UpdateOneID(existing.ID).
			SetStatus(entsubjenroll.StatusActive).
			SetIsElectiveChoice(true).
			ClearDroppedOn()
		if on != nil {
			update = update.SetEnrolledOn(*on)
		}
		return update.Save(ctx)
	case tenantent.IsNotFound(err):
		create := client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrolled.ID).
			SetSubjectOfferingID(offeringID).
			SetStudentID(enrolled.StudentID).
			SetAcademicSessionID(enrolled.AcademicSessionID).
			SetIsElectiveChoice(true)
		if on != nil {
			create = create.SetEnrolledOn(*on)
		}
		return create.Save(ctx)
	default:
		return nil, err
	}
}
