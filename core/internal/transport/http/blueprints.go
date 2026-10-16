package http

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entconstraint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprintconstraint"
	entbpsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprintsection"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	blueprintNotFound           = "blueprint not found"
	blueprintSectionNotFound    = "blueprint section not found"
	blueprintConstraintNotFound = "blueprint constraint not found"

	blueprintCodeIndex        = "blueprint_code_version"
	blueprintSectionCodeIndex = "blueprintsection_blueprint_id_section_code"
	blueprintSectionPosIndex  = "blueprintsection_blueprint_id_position"
)

const blueprintNameRunes = 200

type blueprintPayload struct {
	AcademicSessionID *uuid.UUID              `json:"academic_session_id"`
	GradeLevelID      *uuid.UUID              `json:"grade_level_id"`
	SubjectID         *uuid.UUID              `json:"subject_id"`
	Code              *string                 `json:"code"`
	Name              *string                 `json:"name"`
	Description       *string                 `json:"description"`
	TotalMarks        *float64                `json:"total_marks"`
	DurationMinutes   *int                    `json:"duration_minutes"`
	Version           *int                    `json:"version"`
	Status            *string                 `json:"status"`
	CognitiveScheme   *schema.CognitiveScheme `json:"cognitive_scheme"`
	UnitWeightage     *schema.UnitWeightage   `json:"unit_weightage"`
}

type blueprintSectionPayload struct {
	Name             *string  `json:"name"`
	SectionCode      *string  `json:"section_code"`
	Position         *int     `json:"position"`
	QuestionCount    *int     `json:"question_count"`
	MarksPerQuestion *float64 `json:"marks_per_question"`
	TotalMarks       *float64 `json:"total_marks"`
	DurationMinutes  *int     `json:"duration_minutes"`
}

type blueprintConstraintPayload struct {
	ConstraintType *string         `json:"constraint_type"`
	ValueJSON      shared.Metadata `json:"value_json"`
	MinValue       *float64        `json:"min_value"`
	MaxValue       *float64        `json:"max_value"`
}

func (s *Server) mountBlueprints(r chi.Router) {
	r.Route("/blueprints", func(r chi.Router) {
		r.With(s.can(authorization.BlueprintsRead)).Get("/", s.listBlueprints)
		r.With(s.can(authorization.BlueprintsCreate)).Post("/", s.createBlueprint)
		r.With(s.can(authorization.BlueprintsRead)).Get("/{id}", s.getBlueprint)
		r.With(s.can(authorization.BlueprintsWrite)).Patch("/{id}", s.updateBlueprint)
		r.With(s.can(authorization.BlueprintsDelete)).Delete("/{id}", s.deleteBlueprint)
		r.With(s.can(authorization.BlueprintsRead)).Get("/{id}/sections", s.listBlueprintSections)
		r.With(s.can(authorization.BlueprintsWrite)).Post("/{id}/sections", s.createBlueprintSection)
	})

	r.Route("/blueprint-sections", func(r chi.Router) {
		r.With(s.can(authorization.BlueprintsRead)).Get("/{id}", s.getBlueprintSection)
		r.With(s.can(authorization.BlueprintsRead)).Get("/{id}/constraints", s.listBlueprintConstraints)
		r.With(s.can(authorization.BlueprintsWrite)).Post("/{id}/constraints", s.createBlueprintConstraint)
	})
}

func (s *Server) blueprintScope(ctx context.Context, write bool) (
	*access.Viewer, authorization.Decision, error) {
	narrow, wide := authorization.BlueprintsRead, authorization.BlueprintsReadAll
	if write {
		narrow, wide = authorization.BlueprintsWrite, authorization.BlueprintsWriteAll
	}
	return s.scopeFor(ctx, narrow, wide)
}

func (s *Server) listBlueprints(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	viewer, decision, err := s.blueprintScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	sessionID := p.UUID("academic_session_id")
	subjectID := p.UUID("subject_id")
	gradeID := p.UUID("grade_level_id")
	code := p.String("code")
	reusable := p.Bool("reusable")
	status := p.Enum("status", func(v string) error {
		return entblueprint.StatusValidator(entblueprint.Status(v))
	})
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := client.Blueprint.Query().Where(access.BlueprintsFor(viewer, decision))
	if sessionID != nil {
		q = q.Where(entblueprint.AcademicSessionID(*sessionID))
	}
	if reusable {
		q = q.Where(entblueprint.AcademicSessionIDIsNil())
	}
	if subjectID != nil {
		q = q.Where(entblueprint.SubjectID(*subjectID))
	}
	if gradeID != nil {
		q = q.Where(entblueprint.GradeLevelID(*gradeID))
	}
	if code != "" {
		q = q.Where(entblueprint.Code(code))
	}
	if status != nil {
		q = q.Where(entblueprint.StatusEQ(entblueprint.Status(*status)))
	}

	rows, err := q.
		Order(tenantent.Asc(entblueprint.FieldCode), tenantent.Asc(entblueprint.FieldVersion)).
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
		"blueprints": projected,
		"count":      len(rows),
		"page":       pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) getBlueprint(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.blueprintScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Blueprint.Query().
		Where(entblueprint.ID(id), access.BlueprintsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, blueprintNotFound)
		return
	}

	sections, err := client.BlueprintSection.Query().
		Where(entbpsection.BlueprintID(id)).
		Order(tenantent.Asc(entbpsection.FieldPosition)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	nested := make([]response.Envelope, 0, len(sections))
	for _, section := range sections {
		constraints, err := client.BlueprintConstraint.Query().
			Where(entconstraint.BlueprintSectionID(section.ID)).
			Order(tenantent.Asc(entconstraint.FieldConstraintType),
				tenantent.Asc(entconstraint.FieldID)).
			All(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return
		}
		projectedSection, err := project(section, decision.Fields)
		if err != nil {
			response.ServerError(w, err)
			return
		}
		projectedConstraints, err := projectAll(constraints, decision.Fields)
		if err != nil {
			response.ServerError(w, err)
			return
		}
		nested = append(nested, response.Envelope{
			"section":     projectedSection,
			"constraints": projectedConstraints,
		})
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, response.Envelope{
		"blueprint": projected,
		"sections":  nested,
	})
}

func cognitiveSchemeValid(w http.ResponseWriter, scheme *schema.CognitiveScheme) bool {
	if scheme == nil || scheme.Name == "" {
		response.Error(w, http.StatusUnprocessableEntity,
			"cognitive_scheme names the scheme it bands by, because a board ships more than one "+
				"and they are not interchangeable")
		return false
	}
	if len(scheme.Bands) == 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			"cognitive_scheme carries at least one band; a scheme with no bands constrains nothing")
		return false
	}

	seen := map[string]bool{}
	for _, band := range scheme.Bands {
		if band.Key == "" {
			response.Error(w, http.StatusUnprocessableEntity, "every cognitive band needs a key")
			return false
		}
		if seen[band.Key] {
			response.Error(w, http.StatusUnprocessableEntity,
				"cognitive band "+band.Key+" appears twice")
			return false
		}
		seen[band.Key] = true

		for name, value := range map[string]*float64{
			"weight_percent": band.WeightPercent,
			"min_percent":    band.MinPercent,
			"max_percent":    band.MaxPercent,
		} {
			if value != nil && (*value < 0 || *value > 100) {
				response.Error(w, http.StatusUnprocessableEntity,
					"cognitive band "+band.Key+" has a "+name+" outside 0 to 100")
				return false
			}
		}
		if band.MinPercent != nil && band.MaxPercent != nil && *band.MaxPercent < *band.MinPercent {
			response.Error(w, http.StatusUnprocessableEntity,
				"cognitive band "+band.Key+" has a max_percent below its min_percent")
			return false
		}
	}
	return true
}

func unitWeightageValid(w http.ResponseWriter, weightage *schema.UnitWeightage) bool {
	if weightage == nil {
		return true
	}

	seen := map[string]bool{}
	for _, unit := range weightage.Units {
		if unit.Key == "" {
			response.Error(w, http.StatusUnprocessableEntity, "every unit weight needs a key")
			return false
		}
		if seen[unit.Key] {
			response.Error(w, http.StatusUnprocessableEntity,
				"unit "+unit.Key+" appears twice in unit_weightage")
			return false
		}
		seen[unit.Key] = true

		if unit.WeightPercent != nil && (*unit.WeightPercent < 0 || *unit.WeightPercent > 100) {
			response.Error(w, http.StatusUnprocessableEntity,
				"unit "+unit.Key+" has a weight_percent outside 0 to 100")
			return false
		}
		if unit.Marks != nil && *unit.Marks < 0 {
			response.Error(w, http.StatusUnprocessableEntity,
				"unit "+unit.Key+" has negative marks")
			return false
		}
	}
	return true
}

func blueprintNumbersValid(w http.ResponseWriter, total *float64, duration *int) bool {
	if total != nil && *total <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entblueprint.FieldTotalMarks+" must be greater than zero")
		return false
	}
	if duration != nil && *duration <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entblueprint.FieldDurationMinutes+" must be greater than zero")
		return false
	}
	return true
}

func (s *Server) createBlueprint(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in blueprintPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.blueprintScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entblueprint.Columns,
		columnsSent(sent, entblueprint.ValidColumn)) {
		return
	}

	if in.GradeLevelID == nil || in.SubjectID == nil ||
		in.Code == nil || *in.Code == "" || in.Name == nil || *in.Name == "" ||
		in.TotalMarks == nil || in.DurationMinutes == nil {
		response.Error(w, http.StatusBadRequest,
			"grade_level_id, subject_id, code, name, total_marks and duration_minutes are required")
		return
	}
	if !withinRunes(w, entblueprint.FieldName, *in.Name, blueprintNameRunes) {
		return
	}
	if !blueprintNumbersValid(w, in.TotalMarks, in.DurationMinutes) {
		return
	}
	if !cognitiveSchemeValid(w, in.CognitiveScheme) || !unitWeightageValid(w, in.UnitWeightage) {
		return
	}
	if !bankWriteReaches(w, viewer, decision, in.SubjectID, in.GradeLevelID, "a blueprint") {
		return
	}

	create := client.Blueprint.Create().
		SetNillableAcademicSessionID(in.AcademicSessionID).
		SetGradeLevelID(*in.GradeLevelID).
		SetSubjectID(*in.SubjectID).
		SetCode(*in.Code).
		SetName(*in.Name).
		SetNillableDescription(in.Description).
		SetTotalMarks(*in.TotalMarks).
		SetDurationMinutes(*in.DurationMinutes).
		SetNillableVersion(in.Version).
		SetCognitiveScheme(*in.CognitiveScheme)

	if in.UnitWeightage != nil {
		create = create.SetUnitWeightage(in.UnitWeightage)
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entblueprint.FieldStatus, *in.Status,
			entblueprint.StatusValidator)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		if violates(err, blueprintCodeIndex) {
			response.Error(w, http.StatusConflict,
				"a blueprint with that code and version already exists")
			return
		}
		writeTenantEntErr(w, err, blueprintNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/blueprints/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"blueprint": projected})
}

func (s *Server) updateBlueprint(w http.ResponseWriter, r *http.Request) {
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

	var in blueprintPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.blueprintScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entblueprint.Columns,
		columnsSent(sent, entblueprint.ValidColumn)) {
		return
	}
	for _, name := range []string{
		entblueprint.FieldCode, entblueprint.FieldVersion,
		entblueprint.FieldSubjectID, entblueprint.FieldGradeLevelID,
		entblueprint.FieldAcademicSessionID,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" fixes what a blueprint is for; record a new version rather than changing it")
			return
		}
	}
	if !rejectNull(w, sent, entblueprint.FieldName, in.Name) ||
		!rejectNull(w, sent, entblueprint.FieldTotalMarks, in.TotalMarks) ||
		!rejectNull(w, sent, entblueprint.FieldDurationMinutes, in.DurationMinutes) ||
		!rejectNull(w, sent, entblueprint.FieldStatus, in.Status) ||
		!rejectNull(w, sent, entblueprint.FieldCognitiveScheme, in.CognitiveScheme) {
		return
	}
	if in.Name != nil && !withinRunes(w, entblueprint.FieldName, *in.Name, blueprintNameRunes) {
		return
	}
	if !blueprintNumbersValid(w, in.TotalMarks, in.DurationMinutes) {
		return
	}
	if in.CognitiveScheme != nil && !cognitiveSchemeValid(w, in.CognitiveScheme) {
		return
	}
	if !unitWeightageValid(w, in.UnitWeightage) {
		return
	}

	found, err := client.Blueprint.Query().
		Where(entblueprint.ID(id), access.BlueprintsWritableBy(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, blueprintNotFound) {
		return
	}

	update := client.Blueprint.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableDescription(in.Description).
		SetNillableTotalMarks(in.TotalMarks).
		SetNillableDurationMinutes(in.DurationMinutes)

	if wasCleared(sent, entblueprint.FieldDescription, in.Description) {
		update = update.ClearDescription()
	}
	if in.CognitiveScheme != nil {
		update = update.SetCognitiveScheme(*in.CognitiveScheme)
	}
	if wasCleared(sent, entblueprint.FieldUnitWeightage, in.UnitWeightage) {
		update = update.ClearUnitWeightage()
	} else if in.UnitWeightage != nil {
		update = update.SetUnitWeightage(in.UnitWeightage)
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entblueprint.FieldStatus, *in.Status,
			entblueprint.StatusValidator)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, blueprintNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"blueprint": projected})
}

func (s *Server) deleteBlueprint(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, blueprintNotFound,
		authorization.BlueprintsDelete, authorization.BlueprintsDeleteAll,
		func(ctx context.Context, client *tenantent.Client, id uuid.UUID,
			viewer *access.Viewer, decision authorization.Decision) (int, error) {
			return client.Blueprint.Delete().
				Where(entblueprint.ID(id), access.BlueprintsWritableBy(viewer, decision)).
				Exec(ctx)
		})
}

func (s *Server) listBlueprintSections(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.blueprintScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.Blueprint.Query().
		Where(entblueprint.ID(id), access.BlueprintsFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, blueprintNotFound) {
		return
	}

	rows, err := client.BlueprintSection.Query().
		Where(entbpsection.BlueprintID(id)).
		Order(tenantent.Asc(entbpsection.FieldPosition)).
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
	response.JSON(w, http.StatusOK, response.Envelope{
		"blueprint_sections": projected,
		"count":              len(rows),
	})
}

func (s *Server) getBlueprintSection(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.blueprintScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.BlueprintSection.Query().
		Where(entbpsection.ID(id),
			entbpsection.HasBlueprintWith(access.BlueprintsFor(viewer, decision))).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, blueprintSectionNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"blueprint_section": projected})
}

func (s *Server) createBlueprintSection(w http.ResponseWriter, r *http.Request) {
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

	var in blueprintSectionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.blueprintScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entbpsection.Columns,
		columnsSent(sent, entbpsection.ValidColumn)) {
		return
	}

	if in.Name == nil || *in.Name == "" || in.SectionCode == nil || *in.SectionCode == "" ||
		in.Position == nil || in.QuestionCount == nil || in.TotalMarks == nil {
		response.Error(w, http.StatusBadRequest,
			"name, section_code, position, question_count and total_marks are required")
		return
	}
	if !withinRunes(w, entbpsection.FieldName, *in.Name, blueprintNameRunes) {
		return
	}
	for _, positive := range []struct {
		name  string
		value int
	}{
		{entbpsection.FieldPosition, *in.Position},
		{entbpsection.FieldQuestionCount, *in.QuestionCount},
	} {
		if positive.value <= 0 {
			response.Error(w, http.StatusUnprocessableEntity,
				positive.name+" must be greater than zero")
			return
		}
	}
	if *in.TotalMarks <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entbpsection.FieldTotalMarks+" must be greater than zero")
		return
	}
	if in.MarksPerQuestion != nil && *in.MarksPerQuestion <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entbpsection.FieldMarksPerQuestion+" must be greater than zero")
		return
	}
	if in.DurationMinutes != nil && *in.DurationMinutes <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entbpsection.FieldDurationMinutes+" must be greater than zero")
		return
	}

	found, err := client.Blueprint.Query().
		Where(entblueprint.ID(id), access.BlueprintsWritableBy(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, blueprintNotFound) {
		return
	}

	row, err := client.BlueprintSection.Create().
		SetBlueprintID(id).
		SetName(*in.Name).
		SetSectionCode(*in.SectionCode).
		SetPosition(*in.Position).
		SetQuestionCount(*in.QuestionCount).
		SetNillableMarksPerQuestion(in.MarksPerQuestion).
		SetTotalMarks(*in.TotalMarks).
		SetNillableDurationMinutes(in.DurationMinutes).
		Save(ctx)
	if err != nil {
		switch {
		case violates(err, blueprintSectionCodeIndex):
			response.Error(w, http.StatusConflict,
				"this blueprint already has a section with that section_code")
		case violates(err, blueprintSectionPosIndex):
			response.Error(w, http.StatusConflict,
				"this blueprint already has a section at that position")
		default:
			writeTenantEntErr(w, err, blueprintNotFound)
		}
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/blueprint-sections/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"blueprint_section": projected})
}

func (s *Server) listBlueprintConstraints(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.blueprintScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.BlueprintSection.Query().
		Where(entbpsection.ID(id),
			entbpsection.HasBlueprintWith(access.BlueprintsFor(viewer, decision))).
		Exist(ctx)
	if !mustReach(w, found, err, blueprintSectionNotFound) {
		return
	}

	rows, err := client.BlueprintConstraint.Query().
		Where(entconstraint.BlueprintSectionID(id)).
		Order(tenantent.Asc(entconstraint.FieldConstraintType), tenantent.Asc(entconstraint.FieldID)).
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
	response.JSON(w, http.StatusOK, response.Envelope{
		"blueprint_constraints": projected,
		"count":                 len(rows),
	})
}

func (s *Server) createBlueprintConstraint(w http.ResponseWriter, r *http.Request) {
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

	var in blueprintConstraintPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest,
			"invalid JSON body: "+err.Error()+
				"; value_json is a JSON object, so a bare list goes in as {\"values\": [...]}")
		return
	}

	viewer, decision, err := s.blueprintScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entconstraint.Columns,
		columnsSent(sent, entconstraint.ValidColumn)) {
		return
	}

	if in.ConstraintType == nil || in.ValueJSON == nil {
		response.Error(w, http.StatusBadRequest, "constraint_type and value_json are required")
		return
	}
	kind, ok := timetableEnum(w, entconstraint.FieldConstraintType, *in.ConstraintType,
		entconstraint.ConstraintTypeValidator)
	if !ok {
		return
	}
	if in.MinValue != nil && in.MaxValue != nil && *in.MaxValue < *in.MinValue {
		response.Error(w, http.StatusUnprocessableEntity,
			entconstraint.FieldMaxValue+" is below "+entconstraint.FieldMinValue)
		return
	}

	found, err := client.BlueprintSection.Query().
		Where(entbpsection.ID(id),
			entbpsection.HasBlueprintWith(access.BlueprintsWritableBy(viewer, decision))).
		Exist(ctx)
	if !mustReach(w, found, err, blueprintSectionNotFound) {
		return
	}

	row, err := client.BlueprintConstraint.Create().
		SetBlueprintSectionID(id).
		SetConstraintType(kind).
		SetValueJSON(in.ValueJSON).
		SetNillableMinValue(in.MinValue).
		SetNillableMaxValue(in.MaxValue).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, blueprintSectionNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, response.Envelope{"blueprint_constraint": projected})
}
