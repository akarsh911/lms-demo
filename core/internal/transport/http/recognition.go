package http

import (
	"context"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entachievement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/achievement"
	entpraise "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/praise"
	entreaction "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/praisereaction"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entaward "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentachievement"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	achievementNameRunes = 200
	achievementCodeRunes = 64
	achievementTextRunes = 4000
	praiseMessageRunes   = 2000

	achievementNotFound = "achievement not found"
	awardNotFound       = "student achievement not found"
	praiseNotFound      = "praise not found"
	reactionNotFound    = "praise reaction not found"

	achievementCategoryValues = "category must be academic, attendance, behavioral, co_curricular, leadership or other"
	achievementTierValues     = "tier must be bronze, silver, gold or platinum"
	achievementModeValues     = "award_mode must be manual or auto_rule"
	achievementStatusValues   = "status must be active or inactive"
	awardSourceTypeValues     = "source_type must be assessment_instance, attendance_record, assignment_submission, manual or rule_engine"
	awardStatusValues         = "status must be awarded or revoked"
	praiseRecipientValues     = "recipient_type must be student or staff"
	praiseCategoryValues      = "category must be effort, teamwork, helpfulness, leadership, kindness, improvement or other"
	praiseVisibilityValues    = "visibility must be public, class_only or private"
	praiseStatusValues        = "status must be active, hidden or removed"
	reactionTypeValues        = "reaction_type must be like, heart, clap, celebrate or insightful"

	notYoursToAward = "recognition is not handed to your own household; this award names a pupil you are, or are the guardian of"
)

type achievementPayload struct {
	Name         *string         `json:"name"`
	Code         *string         `json:"code"`
	Description  *string         `json:"description"`
	Category     *string         `json:"category"`
	Tier         *string         `json:"tier"`
	BadgeAssetID *uuid.UUID      `json:"badge_asset_id"`
	Points       *int            `json:"points"`
	AwardMode    *string         `json:"award_mode"`
	Criteria     shared.Metadata `json:"criteria_json"`
	Status       *string         `json:"status"`
}

type awardPayload struct {
	StudentID         *uuid.UUID      `json:"student_id"`
	AchievementID     *uuid.UUID      `json:"achievement_id"`
	AcademicSessionID *uuid.UUID      `json:"academic_session_id"`
	SourceType        *string         `json:"source_type"`
	SourceID          *uuid.UUID      `json:"source_id"`
	Evidence          shared.Metadata `json:"evidence_json"`
	Status            *string         `json:"status"`
}

type showcasePayload struct {
	IsFeatured   *bool `json:"is_featured"`
	DisplayOrder *int  `json:"display_order"`
}

type praisePayload struct {
	RecipientType        *string    `json:"recipient_type"`
	RecipientID          *uuid.UUID `json:"recipient_id"`
	AcademicSessionID    *uuid.UUID `json:"academic_session_id"`
	Category             *string    `json:"category"`
	Message              *string    `json:"message"`
	RelatedAchievementID *uuid.UUID `json:"related_achievement_id"`
	Visibility           *string    `json:"visibility"`
	Status               *string    `json:"status"`
}

type reactionPayload struct {
	ReactionType *string `json:"reaction_type"`
}

func achievementCategory(w http.ResponseWriter, raw string) (entachievement.Category, bool) {
	value := entachievement.Category(raw)
	if err := entachievement.CategoryValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, achievementCategoryValues)
		return "", false
	}
	return value, true
}

func achievementTier(w http.ResponseWriter, raw string) (entachievement.Tier, bool) {
	value := entachievement.Tier(raw)
	if err := entachievement.TierValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, achievementTierValues)
		return "", false
	}
	return value, true
}

func achievementAwardMode(w http.ResponseWriter, raw string) (entachievement.AwardMode, bool) {
	value := entachievement.AwardMode(raw)
	if err := entachievement.AwardModeValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, achievementModeValues)
		return "", false
	}
	return value, true
}

func achievementStatus(w http.ResponseWriter, raw string) (entachievement.Status, bool) {
	value := entachievement.Status(raw)
	if err := entachievement.StatusValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, achievementStatusValues)
		return "", false
	}
	return value, true
}

func awardSourceType(w http.ResponseWriter, raw string) (entaward.SourceType, bool) {
	value := entaward.SourceType(raw)
	if err := entaward.SourceTypeValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, awardSourceTypeValues)
		return "", false
	}
	return value, true
}

func awardStatus(w http.ResponseWriter, raw string) (entaward.Status, bool) {
	value := entaward.Status(raw)
	if err := entaward.StatusValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, awardStatusValues)
		return "", false
	}
	return value, true
}

func praiseRecipientType(w http.ResponseWriter, raw string) (entpraise.RecipientType, bool) {
	value := entpraise.RecipientType(raw)
	if err := entpraise.RecipientTypeValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, praiseRecipientValues)
		return "", false
	}
	return value, true
}

func praiseCategory(w http.ResponseWriter, raw string) (entpraise.Category, bool) {
	value := entpraise.Category(raw)
	if err := entpraise.CategoryValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, praiseCategoryValues)
		return "", false
	}
	return value, true
}

func praiseVisibility(w http.ResponseWriter, raw string) (entpraise.Visibility, bool) {
	value := entpraise.Visibility(raw)
	if err := entpraise.VisibilityValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, praiseVisibilityValues)
		return "", false
	}
	return value, true
}

func praiseStatus(w http.ResponseWriter, raw string) (entpraise.Status, bool) {
	value := entpraise.Status(raw)
	if err := entpraise.StatusValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, praiseStatusValues)
		return "", false
	}
	return value, true
}

func reactionType(w http.ResponseWriter, raw string) (entreaction.ReactionType, bool) {
	value := entreaction.ReactionType(raw)
	if err := entreaction.ReactionTypeValidator(value); err != nil {
		response.Error(w, http.StatusBadRequest, reactionTypeValues)
		return "", false
	}
	return value, true
}

type achievementFilters struct {
	Category *entachievement.Category
	Tier     *entachievement.Tier
	Status   *entachievement.Status
	Mode     *entachievement.AwardMode

	Limit  int
	Offset int
}

func parseAchievementFilters(values url.Values) (achievementFilters, error) {
	p := filter.New(values)

	var f achievementFilters
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("category", func(v string) error {
		return entachievement.CategoryValidator(entachievement.Category(v))
	}); raw != nil {
		value := entachievement.Category(*raw)
		f.Category = &value
	}
	if raw := p.Enum("tier", func(v string) error {
		return entachievement.TierValidator(entachievement.Tier(v))
	}); raw != nil {
		value := entachievement.Tier(*raw)
		f.Tier = &value
	}
	if raw := p.Enum("status", func(v string) error {
		return entachievement.StatusValidator(entachievement.Status(v))
	}); raw != nil {
		value := entachievement.Status(*raw)
		f.Status = &value
	}
	if raw := p.Enum("award_mode", func(v string) error {
		return entachievement.AwardModeValidator(entachievement.AwardMode(v))
	}); raw != nil {
		value := entachievement.AwardMode(*raw)
		f.Mode = &value
	}

	if err := p.Err(); err != nil {
		return achievementFilters{}, err
	}
	return f, nil
}

func (f achievementFilters) apply(q *tenantent.AchievementQuery) *tenantent.AchievementQuery {
	if f.Category != nil {
		q = q.Where(entachievement.CategoryEQ(*f.Category))
	}
	if f.Tier != nil {
		q = q.Where(entachievement.TierEQ(*f.Tier))
	}
	if f.Status != nil {
		q = q.Where(entachievement.StatusEQ(*f.Status))
	}
	if f.Mode != nil {
		q = q.Where(entachievement.AwardModeEQ(*f.Mode))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type awardFilters struct {
	StudentID         *uuid.UUID
	AchievementID     *uuid.UUID
	AcademicSessionID *uuid.UUID
	Status            *entaward.Status
	Featured          bool

	Limit  int
	Offset int
}

func parseAwardFilters(values url.Values) (awardFilters, error) {
	p := filter.New(values)

	f := awardFilters{
		StudentID:         p.UUID("student_id"),
		AchievementID:     p.UUID("achievement_id"),
		AcademicSessionID: p.UUID("academic_session_id"),
		Featured:          p.Bool("is_featured"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("status", func(v string) error {
		return entaward.StatusValidator(entaward.Status(v))
	}); raw != nil {
		value := entaward.Status(*raw)
		f.Status = &value
	}

	if err := p.Err(); err != nil {
		return awardFilters{}, err
	}
	return f, nil
}

func (f awardFilters) apply(q *tenantent.StudentAchievementQuery) *tenantent.StudentAchievementQuery {
	if f.StudentID != nil {
		q = q.Where(entaward.StudentID(*f.StudentID))
	}
	if f.AchievementID != nil {
		q = q.Where(entaward.AchievementID(*f.AchievementID))
	}
	if f.AcademicSessionID != nil {
		q = q.Where(entaward.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.Status != nil {
		q = q.Where(entaward.StatusEQ(*f.Status))
	}
	if f.Featured {
		q = q.Where(entaward.IsFeatured(true))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type praiseFilters struct {
	RecipientType     *entpraise.RecipientType
	RecipientID       *uuid.UUID
	GivenBy           *uuid.UUID
	AcademicSessionID *uuid.UUID
	Category          *entpraise.Category
	Visibility        *entpraise.Visibility
	Status            *entpraise.Status

	Limit  int
	Offset int
}

func parsePraiseFilters(values url.Values) (praiseFilters, error) {
	p := filter.New(values)

	f := praiseFilters{
		RecipientID:       p.UUID("recipient_id"),
		GivenBy:           p.UUID("given_by_person_id"),
		AcademicSessionID: p.UUID("academic_session_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("recipient_type", func(v string) error {
		return entpraise.RecipientTypeValidator(entpraise.RecipientType(v))
	}); raw != nil {
		value := entpraise.RecipientType(*raw)
		f.RecipientType = &value
	}
	if raw := p.Enum("category", func(v string) error {
		return entpraise.CategoryValidator(entpraise.Category(v))
	}); raw != nil {
		value := entpraise.Category(*raw)
		f.Category = &value
	}
	if raw := p.Enum("visibility", func(v string) error {
		return entpraise.VisibilityValidator(entpraise.Visibility(v))
	}); raw != nil {
		value := entpraise.Visibility(*raw)
		f.Visibility = &value
	}
	if raw := p.Enum("status", func(v string) error {
		return entpraise.StatusValidator(entpraise.Status(v))
	}); raw != nil {
		value := entpraise.Status(*raw)
		f.Status = &value
	}

	if err := p.Err(); err != nil {
		return praiseFilters{}, err
	}
	return f, nil
}

func (f praiseFilters) apply(q *tenantent.PraiseQuery) *tenantent.PraiseQuery {
	if f.RecipientType != nil {
		q = q.Where(entpraise.RecipientTypeEQ(*f.RecipientType))
	}
	if f.RecipientID != nil {
		q = q.Where(entpraise.RecipientID(*f.RecipientID))
	}
	if f.GivenBy != nil {
		q = q.Where(entpraise.GivenByPersonID(*f.GivenBy))
	}
	if f.AcademicSessionID != nil {
		q = q.Where(entpraise.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.Category != nil {
		q = q.Where(entpraise.CategoryEQ(*f.Category))
	}
	if f.Visibility != nil {
		q = q.Where(entpraise.VisibilityEQ(*f.Visibility))
	}
	if f.Status != nil {
		q = q.Where(entpraise.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) recognitionRead(ctx context.Context, narrow, wide authorization.Entity) (
	*access.Viewer, authorization.Decision, *access.Recognition, error) {
	viewer, decision, err := s.scopeFor(ctx, narrow, wide)
	if err != nil {
		return nil, decision, nil, err
	}
	reach, err := access.ReadableRecognition(ctx, viewer, decision)
	if err != nil {
		return nil, decision, nil, err
	}
	return viewer, decision, reach, nil
}

func (s *Server) recognitionWrite(ctx context.Context, narrow, wide authorization.Entity) (
	*access.Viewer, authorization.Decision, *access.Recognition, error) {
	viewer, decision, err := s.scopeFor(ctx, narrow, wide)
	if err != nil {
		return nil, decision, nil, err
	}
	reach, err := access.WritableRecognition(ctx, viewer, decision)
	if err != nil {
		return nil, decision, nil, err
	}
	return viewer, decision, reach, nil
}

func (s *Server) listAchievements(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseAchievementFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx, authorization.AchievementsRead, authorization.StudentAchievementsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := filters.apply(client.Achievement.Query()).
		Order(tenantent.Asc(entachievement.FieldCode)).
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
		"achievements": projected,
		"count":        len(rows),
		"page":         pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getAchievement(w http.ResponseWriter, r *http.Request) {
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

	_, decision, err := s.scopeFor(ctx, authorization.AchievementsRead, authorization.StudentAchievementsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Achievement.Query().Where(entachievement.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, achievementNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, response.Envelope{"achievement": projected})
}

func catalogWritable(w http.ResponseWriter, v *access.Viewer, d authorization.Decision,
	entity authorization.Entity) bool {
	if timetableWriteUnfiltered(v, d) {
		return true
	}
	response.Error(w, http.StatusForbidden,
		"a badge definition belongs to the whole school, so "+string(entity)+" must reach the tenant")
	return false
}

func achievementText(w http.ResponseWriter, in achievementPayload) bool {
	if in.Name != nil && !withinRunes(w, entachievement.FieldName, *in.Name, achievementNameRunes) {
		return false
	}
	if in.Code != nil && !withinRunes(w, entachievement.FieldCode, *in.Code, achievementCodeRunes) {
		return false
	}
	if in.Description != nil &&
		!withinRunes(w, entachievement.FieldDescription, *in.Description, achievementTextRunes) {
		return false
	}
	if in.Points != nil && *in.Points < 0 {
		response.Error(w, http.StatusBadRequest, entachievement.FieldPoints+" must not be negative")
		return false
	}
	return true
}

func (s *Server) createAchievement(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in achievementPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AchievementsWrite, authorization.StudentAchievementsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entachievement.Columns,
		columnsSent(sent, entachievement.ValidColumn)) {
		return
	}
	if !catalogWritable(w, viewer, decision, authorization.AchievementsWrite) {
		return
	}

	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}
	if !achievementText(w, in) {
		return
	}

	create := client.Achievement.Create().
		SetName(*in.Name).
		SetCode(*in.Code).
		SetNillableDescription(in.Description).
		SetNillableBadgeAssetID(in.BadgeAssetID).
		SetNillablePoints(in.Points)

	if in.Criteria != nil {
		create = create.SetCriteriaJSON(in.Criteria)
	}
	if in.Category != nil {
		value, ok := achievementCategory(w, *in.Category)
		if !ok {
			return
		}
		create = create.SetCategory(value)
	}
	if in.Tier != nil {
		value, ok := achievementTier(w, *in.Tier)
		if !ok {
			return
		}
		create = create.SetTier(value)
	}
	if in.AwardMode != nil {
		value, ok := achievementAwardMode(w, *in.AwardMode)
		if !ok {
			return
		}
		if value == entachievement.AwardModeAutoRule && in.Criteria == nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"an auto_rule badge needs "+entachievement.FieldCriteriaJSON+" saying what earns it")
			return
		}
		create = create.SetAwardMode(value)
	}
	if in.Status != nil {
		value, ok := achievementStatus(w, *in.Status)
		if !ok {
			return
		}
		create = create.SetStatus(value)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, achievementNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/achievements/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"achievement": row})
}

func (s *Server) updateAchievement(w http.ResponseWriter, r *http.Request) {
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

	var in achievementPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AchievementsWrite, authorization.StudentAchievementsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entachievement.Columns,
		columnsSent(sent, entachievement.ValidColumn)) {
		return
	}
	if !catalogWritable(w, viewer, decision, authorization.AchievementsWrite) {
		return
	}
	if in.Name != nil && *in.Name == "" {
		response.Error(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	if in.Code != nil && *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "code must not be empty")
		return
	}
	if !achievementText(w, in) {
		return
	}

	update := client.Achievement.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableCode(in.Code).
		SetNillableDescription(in.Description).
		SetNillableBadgeAssetID(in.BadgeAssetID).
		SetNillablePoints(in.Points)

	if in.Criteria != nil {
		update = update.SetCriteriaJSON(in.Criteria)
	}
	if in.Category != nil {
		value, ok := achievementCategory(w, *in.Category)
		if !ok {
			return
		}
		update = update.SetCategory(value)
	}
	if in.Tier != nil {
		value, ok := achievementTier(w, *in.Tier)
		if !ok {
			return
		}
		update = update.SetTier(value)
	}
	if in.AwardMode != nil {
		value, ok := achievementAwardMode(w, *in.AwardMode)
		if !ok {
			return
		}
		update = update.SetAwardMode(value)
	}
	if in.Status != nil {
		value, ok := achievementStatus(w, *in.Status)
		if !ok {
			return
		}
		update = update.SetStatus(value)
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, achievementNotFound)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"achievement": row})
}

func (s *Server) deleteAchievement(w http.ResponseWriter, r *http.Request) {
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

	viewer, decision, err := s.scopeFor(ctx, authorization.AchievementsDelete, authorization.StudentAchievementsDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !catalogWritable(w, viewer, decision, authorization.AchievementsDelete) {
		return
	}

	n, err := client.Achievement.Delete().Where(entachievement.ID(id)).Exec(ctx)
	if err != nil {
		writeTenantEntErr(w, err, achievementNotFound)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, achievementNotFound)
		return
	}
	response.NoContent(w)
}

func (s *Server) listStudentAchievements(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseAwardFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentAchievementsRead, authorization.StudentAchievementsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := filters.apply(client.StudentAchievement.Query().
		Where(access.StudentAchievementsFor(viewer, decision))).
		Order(tenantent.Desc(entaward.FieldAwardedAt)).
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
		"student_achievements": projected,
		"count":                len(rows),
		"page":                 pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getStudentAchievement(w http.ResponseWriter, r *http.Request) {
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
		authorization.StudentAchievementsRead, authorization.StudentAchievementsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.StudentAchievement.Query().
		Where(entaward.ID(id), access.StudentAchievementsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, awardNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, response.Envelope{"student_achievement": projected})
}

func awardableStudent(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	viewer *access.Viewer, decision authorization.Decision, student uuid.UUID) bool {
	found, err := client.Student.Query().Where(entstudent.ID(student)).Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !found {
		response.Error(w, http.StatusUnprocessableEntity,
			"the student "+student.String()+" does not name a row that exists")
		return false
	}

	reachable, err := client.Student.Query().
		Where(entstudent.ID(student), access.StudentsForAwarding(viewer, decision)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !reachable {
		response.Error(w, http.StatusForbidden, notYoursToAward)
		return false
	}
	return true
}

func (s *Server) awardAchievement(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in awardPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentAchievementsWrite, authorization.StudentAchievementsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entaward.Columns, columnsSent(sent, entaward.ValidColumn)) {
		return
	}
	if in.StudentID == nil || in.AchievementID == nil || in.AcademicSessionID == nil {
		response.Error(w, http.StatusBadRequest,
			"student_id, achievement_id and academic_session_id are required")
		return
	}
	if (in.SourceType == nil) != (in.SourceID == nil) {
		response.Error(w, http.StatusUnprocessableEntity,
			"source_type and source_id are evidence and must be given together or not at all")
		return
	}
	if !awardableStudent(ctx, w, client, viewer, decision, *in.StudentID) {
		return
	}

	create := client.StudentAchievement.Create().
		SetStudentID(*in.StudentID).
		SetAchievementID(*in.AchievementID).
		SetAcademicSessionID(*in.AcademicSessionID).
		SetNillableAwardedBy(viewer.PersonID).
		SetNillableSourceID(in.SourceID)

	if in.Evidence != nil {
		create = create.SetEvidenceJSON(in.Evidence)
	}
	if in.SourceType != nil {
		value, ok := awardSourceType(w, *in.SourceType)
		if !ok {
			return
		}
		create = create.SetSourceType(value)
	}
	if in.Status != nil {
		value, ok := awardStatus(w, *in.Status)
		if !ok {
			return
		}
		create = create.SetStatus(value)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, awardNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/student-achievements/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"student_achievement": row})
}

func (s *Server) updateStudentAchievement(w http.ResponseWriter, r *http.Request) {
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

	var in awardPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentAchievementsWrite, authorization.StudentAchievementsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entaward.Columns, columnsSent(sent, entaward.ValidColumn)) {
		return
	}
	for _, name := range []string{
		entaward.FieldStudentID,
		entaward.FieldAchievementID,
		entaward.FieldAcademicSessionID,
		entaward.FieldSourceType,
		entaward.FieldSourceID,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded when the badge is awarded and cannot be changed")
			return
		}
	}

	update := client.StudentAchievement.Update().
		Where(entaward.ID(id), access.StudentAchievementsAwardableBy(viewer, decision))

	if in.Evidence != nil {
		update = update.SetEvidenceJSON(in.Evidence)
	}
	if in.Status != nil {
		value, ok := awardStatus(w, *in.Status)
		if !ok {
			return
		}
		update = update.SetStatus(value)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, awardNotFound) {
		return
	}

	row, err := client.StudentAchievement.Query().Where(entaward.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, awardNotFound)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"student_achievement": row})
}

func (s *Server) showcaseStudentAchievement(w http.ResponseWriter, r *http.Request) {
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

	var in showcasePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentAchievementsWrite, authorization.StudentAchievementsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entaward.Columns, columnsSent(sent, entaward.ValidColumn)) {
		return
	}
	if in.IsFeatured == nil {
		response.Error(w, http.StatusBadRequest, entaward.FieldIsFeatured+" is required")
		return
	}
	if in.DisplayOrder != nil {
		if *in.DisplayOrder < 0 {
			response.Error(w, http.StatusBadRequest,
				entaward.FieldDisplayOrder+" must not be negative")
			return
		}
		if !*in.IsFeatured {
			response.Error(w, http.StatusUnprocessableEntity,
				entaward.FieldDisplayOrder+" orders featured badges, so it cannot be set while "+
					entaward.FieldIsFeatured+" is false")
			return
		}
	}

	update := client.StudentAchievement.Update().
		Where(
			entaward.ID(id),
			entaward.StatusEQ(entaward.StatusAwarded),
			access.StudentAchievementsShowcasableBy(viewer, decision),
		).
		SetIsFeatured(*in.IsFeatured)

	if *in.IsFeatured {
		update = update.SetNillableDisplayOrder(in.DisplayOrder)
	} else {
		update = update.ClearDisplayOrder()
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, awardNotFound) {
		return
	}

	row, err := client.StudentAchievement.Query().Where(entaward.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, awardNotFound)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"student_achievement": row})
}

func (s *Server) deleteStudentAchievement(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, awardNotFound,
		authorization.StudentAchievementsDelete, authorization.StudentAchievementsDeleteAll,
		func(ctx context.Context, client *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return client.StudentAchievement.Delete().
				Where(entaward.ID(id), access.StudentAchievementsAwardableBy(v, d)).
				Exec(ctx)
		})
}

func (s *Server) listPraises(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parsePraiseFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	_, decision, reach, err := s.recognitionRead(ctx,
		authorization.PraisesRead, authorization.PraisesReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := filters.apply(client.Praise.Query().Where(access.PraisesFor(reach))).
		Order(tenantent.Desc(entpraise.FieldCreatedAt)).
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
		"praises": projected,
		"count":   len(rows),
		"page":    pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getPraise(w http.ResponseWriter, r *http.Request) {
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

	_, decision, reach, err := s.recognitionRead(ctx,
		authorization.PraisesRead, authorization.PraisesReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Praise.Query().
		Where(entpraise.ID(id), access.PraisesFor(reach)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, praiseNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, response.Envelope{"praise": projected})
}

func praiseRecipientExists(ctx context.Context, client *tenantent.Client,
	kind entpraise.RecipientType, id uuid.UUID) (bool, error) {
	switch kind {
	case entpraise.RecipientTypeStudent:
		return client.Student.Query().Where(entstudent.ID(id)).Exist(ctx)
	case entpraise.RecipientTypeStaff:
		return client.Staff.Query().Where(entstaff.ID(id)).Exist(ctx)
	default:
		return false, nil
	}
}

func checkPraiseRecipient(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	reach *access.Recognition, kind entpraise.RecipientType, id uuid.UUID) bool {
	found, err := praiseRecipientExists(ctx, client, kind, id)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !found {
		response.Error(w, http.StatusUnprocessableEntity,
			"the "+string(kind)+" "+id.String()+" does not name a row that exists")
		return false
	}

	reached := reach.ReachesStudent(id)
	if kind == entpraise.RecipientTypeStaff {
		reached = reach.ReachesStaff(id)
	}
	if !reached {
		response.Error(w, http.StatusForbidden,
			"your grant of "+string(authorization.PraisesWrite)+" does not reach the "+
				string(kind)+" "+id.String()+", or that is you or your own household")
		return false
	}
	return true
}

func (s *Server) createPraise(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in praisePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, reach, err := s.recognitionWrite(ctx,
		authorization.PraisesWrite, authorization.PraisesWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entpraise.Columns, columnsSent(sent, entpraise.ValidColumn)) {
		return
	}
	if viewer.PersonID == nil {
		response.Error(w, http.StatusForbidden,
			"a praise records who gave it, and this caller has no person record in the school")
		return
	}

	if in.RecipientType == nil || in.RecipientID == nil {
		response.Error(w, http.StatusBadRequest, "recipient_type and recipient_id are required")
		return
	}
	if in.AcademicSessionID == nil {
		response.Error(w, http.StatusBadRequest, entpraise.FieldAcademicSessionID+" is required")
		return
	}
	if in.Message == nil || *in.Message == "" {
		response.Error(w, http.StatusBadRequest, "message is required")
		return
	}
	if !withinRunes(w, entpraise.FieldMessage, *in.Message, praiseMessageRunes) {
		return
	}

	kind, ok := praiseRecipientType(w, *in.RecipientType)
	if !ok {
		return
	}
	if !checkPraiseRecipient(ctx, w, client, reach, kind, *in.RecipientID) {
		return
	}

	create := client.Praise.Create().
		SetRecipientType(kind).
		SetRecipientID(*in.RecipientID).
		SetGivenByPersonID(*viewer.PersonID).
		SetAcademicSessionID(*in.AcademicSessionID).
		SetMessage(*in.Message).
		SetNillableRelatedAchievementID(in.RelatedAchievementID)

	if in.Category != nil {
		value, ok := praiseCategory(w, *in.Category)
		if !ok {
			return
		}
		create = create.SetCategory(value)
	}
	if in.Visibility != nil {
		value, ok := praiseVisibility(w, *in.Visibility)
		if !ok {
			return
		}
		create = create.SetVisibility(value)
	}
	if in.Status != nil {
		value, ok := praiseStatus(w, *in.Status)
		if !ok {
			return
		}
		create = create.SetStatus(value)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, praiseNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/praises/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"praise": row})
}

func (s *Server) updatePraise(w http.ResponseWriter, r *http.Request) {
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

	var in praisePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, reach, err := s.recognitionWrite(ctx,
		authorization.PraisesWrite, authorization.PraisesWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entpraise.Columns, columnsSent(sent, entpraise.ValidColumn)) {
		return
	}
	for _, name := range []string{
		entpraise.FieldRecipientType,
		entpraise.FieldRecipientID,
		entpraise.FieldAcademicSessionID,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded when the praise is given and cannot be changed")
			return
		}
	}
	if in.Message != nil {
		if *in.Message == "" {
			response.Error(w, http.StatusBadRequest, "message must not be empty")
			return
		}
		if !withinRunes(w, entpraise.FieldMessage, *in.Message, praiseMessageRunes) {
			return
		}
	}

	gates := []predicate.Praise{}
	if in.Message != nil || in.Visibility != nil || in.RelatedAchievementID != nil {
		gates = append(gates, access.PraisesEditableBy(reach))
	}
	if in.Status != nil {
		gates = append(gates, access.PraisesModeratableBy(reach))
	}
	if len(gates) == 0 {
		response.Error(w, http.StatusBadRequest,
			"send message, visibility, related_achievement_id or status")
		return
	}

	update := client.Praise.Update().
		Where(append([]predicate.Praise{entpraise.ID(id)}, gates...)...).
		SetNillableMessage(in.Message).
		SetNillableRelatedAchievementID(in.RelatedAchievementID)

	if in.Category != nil {
		value, ok := praiseCategory(w, *in.Category)
		if !ok {
			return
		}
		update = update.SetCategory(value)
	}
	if in.Visibility != nil {
		value, ok := praiseVisibility(w, *in.Visibility)
		if !ok {
			return
		}
		update = update.SetVisibility(value)
	}
	if in.Status != nil {
		value, ok := praiseStatus(w, *in.Status)
		if !ok {
			return
		}
		update = update.SetStatus(value)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, praiseNotFound) {
		return
	}

	row, err := client.Praise.Query().Where(entpraise.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, praiseNotFound)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"praise": row})
}

func (s *Server) deletePraise(w http.ResponseWriter, r *http.Request) {
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

	_, _, reach, err := s.recognitionWrite(ctx,
		authorization.PraisesDelete, authorization.PraisesDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	n, err := client.Praise.Update().
		Where(entpraise.ID(id), access.PraisesModeratableBy(reach)).
		SetStatus(entpraise.StatusRemoved).
		Save(ctx)
	if !wroteScopedRow(w, n, err, praiseNotFound) {
		return
	}
	response.NoContent(w)
}

func (s *Server) listPraiseReactions(w http.ResponseWriter, r *http.Request) {
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

	_, decision, reach, err := s.recognitionRead(ctx,
		authorization.PraiseReactionsRead, authorization.PraisesReadAll)
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

	rows, err := client.PraiseReaction.Query().
		Where(entreaction.PraiseID(id), access.PraiseReactionsFor(reach)).
		Order(tenantent.Asc(entreaction.FieldCreatedAt)).
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
		"praise_reactions": projected,
		"count":            len(rows),
		"page":             pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) reactToPraise(w http.ResponseWriter, r *http.Request) {
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

	var in reactionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, reach, err := s.recognitionRead(ctx,
		authorization.PraiseReactionsWrite, authorization.PraisesReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entreaction.Columns,
		columnsSent(sent, entreaction.ValidColumn)) {
		return
	}
	if viewer.PersonID == nil {
		response.Error(w, http.StatusForbidden,
			"a reaction records who left it, and this caller has no person record in the school")
		return
	}
	if in.ReactionType == nil {
		response.Error(w, http.StatusBadRequest, entreaction.FieldReactionType+" is required")
		return
	}
	kind, ok := reactionType(w, *in.ReactionType)
	if !ok {
		return
	}

	visible, err := client.Praise.Query().
		Where(entpraise.ID(id), access.PraisesFor(reach)).
		Exist(ctx)
	if !mustReach(w, visible, err, praiseNotFound) {
		return
	}

	row, err := client.PraiseReaction.Create().
		SetPraiseID(id).
		SetReactorPersonID(*viewer.PersonID).
		SetReactionType(kind).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, reactionNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/praise-reactions/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"praise_reaction": row})
}

func (s *Server) deletePraiseReaction(w http.ResponseWriter, r *http.Request) {
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

	_, _, reach, err := s.recognitionWrite(ctx,
		authorization.PraiseReactionsDelete, authorization.PraisesDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	n, err := client.PraiseReaction.Delete().
		Where(entreaction.ID(id), access.PraiseReactionsRemovableBy(reach)).
		Exec(ctx)
	if err != nil {
		writeTenantEntErr(w, err, reactionNotFound)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, reactionNotFound)
		return
	}
	response.NoContent(w)
}

func (s *Server) mountRecognition(r chi.Router) {
	r.Route("/achievements", func(r chi.Router) {
		r.With(s.can(authorization.AchievementsRead)).Get("/", s.listAchievements)
		r.With(s.can(authorization.AchievementsWrite)).Post("/", s.createAchievement)
		r.With(s.can(authorization.AchievementsRead)).Get("/{id}", s.getAchievement)
		r.With(s.can(authorization.AchievementsWrite)).Patch("/{id}", s.updateAchievement)
		r.With(s.can(authorization.AchievementsDelete)).Delete("/{id}", s.deleteAchievement)
	})

	r.Route("/student-achievements", func(r chi.Router) {
		r.With(s.can(authorization.StudentAchievementsRead)).Get("/", s.listStudentAchievements)
		r.With(s.can(authorization.StudentAchievementsWrite)).Post("/", s.awardAchievement)
		r.With(s.can(authorization.StudentAchievementsRead)).Get("/{id}", s.getStudentAchievement)
		r.With(s.can(authorization.StudentAchievementsWrite)).Patch("/{id}", s.updateStudentAchievement)
		r.With(s.can(authorization.StudentAchievementsWrite)).
			Put("/{id}/showcase", s.showcaseStudentAchievement)
		r.With(s.can(authorization.StudentAchievementsDelete)).Delete("/{id}", s.deleteStudentAchievement)
	})

	r.Route("/praises", func(r chi.Router) {
		r.With(s.can(authorization.PraisesRead)).Get("/", s.listPraises)
		r.With(s.can(authorization.PraisesWrite)).Post("/", s.createPraise)
		r.With(s.can(authorization.PraisesRead)).Get("/{id}", s.getPraise)
		r.With(s.can(authorization.PraisesWrite)).Patch("/{id}", s.updatePraise)
		r.With(s.can(authorization.PraisesDelete)).Delete("/{id}", s.deletePraise)

		r.With(s.can(authorization.PraiseReactionsRead)).Get("/{id}/reactions", s.listPraiseReactions)
		r.With(s.can(authorization.PraiseReactionsWrite)).Post("/{id}/reactions", s.reactToPraise)
	})

	r.Route("/praise-reactions", func(r chi.Router) {
		r.With(s.can(authorization.PraiseReactionsDelete)).Delete("/{id}", s.deletePraiseReaction)
	})
}
