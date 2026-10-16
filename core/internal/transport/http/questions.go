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
	entquestion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/question"
	entversion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/questionversion"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	questionNotFound        = "question not found"
	questionVersionNotFound = "question version not found"

	questionCanonicalKeyIndex = "questions_canonical_key_key"
	questionVersionIndex      = "questionversion_question_id_version_number"
)

const (
	questionKeyRunes   = 200
	questionBloomRunes = 64
	questionLangRunes  = 32
)

type questionPayload struct {
	CanonicalKey     *string    `json:"canonical_key"`
	SubjectID        *uuid.UUID `json:"subject_id"`
	GradeLevelID     *uuid.UUID `json:"grade_level_id"`
	QuestionType     *string    `json:"question_type"`
	Status           *string    `json:"status"`
	DifficultyScore  *float64   `json:"difficulty_score"`
	DifficultyLabel  *string    `json:"difficulty_label"`
	BloomLevel       *string    `json:"bloom_level"`
	Language         *string    `json:"language"`
	EstimatedSeconds *int       `json:"estimated_seconds"`
	SourceType       *string    `json:"source_type"`
	CreatedBy        *uuid.UUID `json:"created_by"`
}

type questionVersionPayload struct {
	Stem           *string         `json:"stem"`
	Explanation    *string         `json:"explanation"`
	AnswerDataJSON shared.Metadata `json:"answer_data_json"`
	Status         *string         `json:"status"`
	CreatedBy      *uuid.UUID      `json:"created_by"`
	VersionNumber  *int            `json:"version_number"`
}

func (s *Server) mountQuestionBank(r chi.Router) {
	r.Route("/questions", func(r chi.Router) {
		r.With(s.can(authorization.QuestionBankRead)).Get("/", s.listQuestions)
		r.With(s.can(authorization.QuestionBankCreate)).Post("/", s.createQuestion)
		r.With(s.can(authorization.QuestionBankRead)).Get("/{id}", s.getQuestion)
		r.With(s.can(authorization.QuestionBankWrite)).Patch("/{id}", s.updateQuestion)
		r.With(s.can(authorization.QuestionBankDelete)).Delete("/{id}", s.deleteQuestion)
		r.With(s.can(authorization.QuestionBankRead)).Get("/{id}/versions", s.listQuestionVersions)
		r.With(s.can(authorization.QuestionBankWrite)).Post("/{id}/versions", s.createQuestionVersion)
	})

	r.Route("/question-versions", func(r chi.Router) {
		r.With(s.can(authorization.QuestionBankRead)).Get("/{id}", s.getQuestionVersion)
		r.With(s.can(authorization.QuestionBankWrite)).Patch("/{id}", s.updateQuestionVersionStatus)
	})
}

func (s *Server) questionScope(ctx context.Context, write bool) (
	*access.Viewer, authorization.Decision, error) {
	narrow, wide := authorization.QuestionBankRead, authorization.QuestionBankReadAll
	if write {
		narrow, wide = authorization.QuestionBankWrite, authorization.QuestionBankWriteAll
	}
	return s.scopeFor(ctx, narrow, wide)
}

func (s *Server) listQuestions(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	viewer, decision, err := s.questionScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	subjectID := p.UUID("subject_id")
	gradeID := p.UUID("grade_level_id")
	canonicalKey := p.String("canonical_key")
	status := p.Enum("status", func(v string) error {
		return entquestion.StatusValidator(entquestion.Status(v))
	})
	kind := p.Enum("question_type", func(v string) error {
		return entquestion.QuestionTypeValidator(entquestion.QuestionType(v))
	})
	source := p.Enum("source_type", func(v string) error {
		return entquestion.SourceTypeValidator(entquestion.SourceType(v))
	})
	label := p.Enum("difficulty_label", func(v string) error {
		return entquestion.DifficultyLabelValidator(entquestion.DifficultyLabel(v))
	})
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := client.Question.Query().Where(access.QuestionsFor(viewer, decision))
	if subjectID != nil {
		q = q.Where(entquestion.SubjectID(*subjectID))
	}
	if gradeID != nil {
		q = q.Where(entquestion.GradeLevelID(*gradeID))
	}
	if canonicalKey != "" {
		q = q.Where(entquestion.CanonicalKey(canonicalKey))
	}
	if status != nil {
		q = q.Where(entquestion.StatusEQ(entquestion.Status(*status)))
	}
	if kind != nil {
		q = q.Where(entquestion.QuestionTypeEQ(entquestion.QuestionType(*kind)))
	}
	if source != nil {
		q = q.Where(entquestion.SourceTypeEQ(entquestion.SourceType(*source)))
	}
	if label != nil {
		q = q.Where(entquestion.DifficultyLabelEQ(entquestion.DifficultyLabel(*label)))
	}

	rows, err := q.
		Order(tenantent.Asc(entquestion.FieldCanonicalKey), tenantent.Asc(entquestion.FieldID)).
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
		"questions": projected,
		"count":     len(rows),
		"page":      pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) readableQuestion(ctx context.Context, w http.ResponseWriter,
	id uuid.UUID, viewer *access.Viewer, decision authorization.Decision) (*tenantent.Question, bool) {
	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	row, err := client.Question.Query().
		Where(entquestion.ID(id), access.QuestionsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, questionNotFound)
		return nil, false
	}
	return row, true
}

func (s *Server) getQuestion(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}
	viewer, decision, err := s.questionScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	row, ok := s.readableQuestion(ctx, w, id, viewer, decision)
	if !ok {
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)
	response.JSON(w, http.StatusOK, response.Envelope{"question": projected})
}

func questionText(w http.ResponseWriter, in questionPayload) bool {
	if in.CanonicalKey != nil &&
		!withinRunes(w, entquestion.FieldCanonicalKey, *in.CanonicalKey, questionKeyRunes) {
		return false
	}
	if in.BloomLevel != nil &&
		!withinRunes(w, entquestion.FieldBloomLevel, *in.BloomLevel, questionBloomRunes) {
		return false
	}
	if in.Language != nil &&
		!withinRunes(w, entquestion.FieldLanguage, *in.Language, questionLangRunes) {
		return false
	}
	if in.DifficultyScore != nil && (*in.DifficultyScore < 0 || *in.DifficultyScore > 100) {
		response.Error(w, http.StatusUnprocessableEntity,
			entquestion.FieldDifficultyScore+" is a 0 to 100 estimate")
		return false
	}
	if in.EstimatedSeconds != nil && *in.EstimatedSeconds <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entquestion.FieldEstimatedSeconds+" must be greater than zero")
		return false
	}
	return true
}

func (s *Server) createQuestion(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in questionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.questionScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entquestion.Columns,
		columnsSent(sent, entquestion.ValidColumn)) {
		return
	}

	if in.CanonicalKey == nil || *in.CanonicalKey == "" {
		response.Error(w, http.StatusBadRequest, "canonical_key is required")
		return
	}
	if !questionText(w, in) {
		return
	}
	if !bankWriteReaches(w, viewer, decision, in.SubjectID, in.GradeLevelID,
		"a question") {
		return
	}

	author, ok := attributedTo(w, viewer, in.CreatedBy, entquestion.FieldCreatedBy)
	if !ok {
		return
	}

	create := client.Question.Create().
		SetCanonicalKey(*in.CanonicalKey).
		SetNillableSubjectID(in.SubjectID).
		SetNillableGradeLevelID(in.GradeLevelID).
		SetNillableDifficultyScore(in.DifficultyScore).
		SetNillableBloomLevel(in.BloomLevel).
		SetNillableLanguage(in.Language).
		SetNillableEstimatedSeconds(in.EstimatedSeconds).
		SetCreatedBy(author)

	if in.QuestionType != nil {
		kind, ok := timetableEnum(w, entquestion.FieldQuestionType, *in.QuestionType,
			entquestion.QuestionTypeValidator)
		if !ok {
			return
		}
		create = create.SetQuestionType(kind)
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entquestion.FieldStatus, *in.Status,
			entquestion.StatusValidator)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}
	if in.SourceType != nil {
		source, ok := timetableEnum(w, entquestion.FieldSourceType, *in.SourceType,
			entquestion.SourceTypeValidator)
		if !ok {
			return
		}
		create = create.SetSourceType(source)
	}
	if in.DifficultyLabel != nil {
		label, ok := timetableEnum(w, entquestion.FieldDifficultyLabel, *in.DifficultyLabel,
			entquestion.DifficultyLabelValidator)
		if !ok {
			return
		}
		create = create.SetDifficultyLabel(label)
	}

	row, err := create.Save(ctx)
	if err != nil {
		if violates(err, questionCanonicalKeyIndex) {
			response.Error(w, http.StatusConflict,
				"a question with that canonical_key already exists")
			return
		}
		writeTenantEntErr(w, err, questionNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/questions/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"question": projected})
}

func (s *Server) updateQuestion(w http.ResponseWriter, r *http.Request) {
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

	var in questionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.questionScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entquestion.Columns,
		columnsSent(sent, entquestion.ValidColumn)) {
		return
	}
	if in.CanonicalKey != nil || wasSent(sent, entquestion.FieldCanonicalKey) {
		response.Error(w, http.StatusUnprocessableEntity,
			"canonical_key is the question's stable identity and cannot be changed")
		return
	}
	if in.CreatedBy != nil || wasSent(sent, entquestion.FieldCreatedBy) {
		response.Error(w, http.StatusUnprocessableEntity,
			"created_by is recorded from the authenticated caller and cannot be changed")
		return
	}
	if !questionText(w, in) {
		return
	}

	current, err := client.Question.Query().
		Where(entquestion.ID(id), access.QuestionsWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, questionNotFound)
		return
	}

	subject := patchedAnchor(sent, entquestion.FieldSubjectID, in.SubjectID, current.SubjectID, false)
	grade := patchedAnchor(sent, entquestion.FieldGradeLevelID, in.GradeLevelID, current.GradeLevelID, false)
	if !bankWriteReaches(w, viewer, decision, subject, grade, "a question") {
		return
	}

	update := client.Question.UpdateOneID(id).
		SetNillableBloomLevel(in.BloomLevel).
		SetNillableLanguage(in.Language).
		SetNillableDifficultyScore(in.DifficultyScore).
		SetNillableEstimatedSeconds(in.EstimatedSeconds)

	if subject == nil {
		update = update.ClearSubjectID()
	} else {
		update = update.SetSubjectID(*subject)
	}
	if grade == nil {
		update = update.ClearGradeLevelID()
	} else {
		update = update.SetGradeLevelID(*grade)
	}
	if wasCleared(sent, entquestion.FieldBloomLevel, in.BloomLevel) {
		update = update.ClearBloomLevel()
	}
	if wasCleared(sent, entquestion.FieldLanguage, in.Language) {
		update = update.ClearLanguage()
	}
	if wasCleared(sent, entquestion.FieldDifficultyScore, in.DifficultyScore) {
		update = update.ClearDifficultyScore()
	}
	if wasCleared(sent, entquestion.FieldEstimatedSeconds, in.EstimatedSeconds) {
		update = update.ClearEstimatedSeconds()
	}
	if wasCleared(sent, entquestion.FieldDifficultyLabel, in.DifficultyLabel) {
		update = update.ClearDifficultyLabel()
	} else if in.DifficultyLabel != nil {
		label, ok := timetableEnum(w, entquestion.FieldDifficultyLabel, *in.DifficultyLabel,
			entquestion.DifficultyLabelValidator)
		if !ok {
			return
		}
		update = update.SetDifficultyLabel(label)
	}
	if in.QuestionType != nil {
		kind, ok := timetableEnum(w, entquestion.FieldQuestionType, *in.QuestionType,
			entquestion.QuestionTypeValidator)
		if !ok {
			return
		}
		update = update.SetQuestionType(kind)
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entquestion.FieldStatus, *in.Status,
			entquestion.StatusValidator)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}
	if in.SourceType != nil {
		source, ok := timetableEnum(w, entquestion.FieldSourceType, *in.SourceType,
			entquestion.SourceTypeValidator)
		if !ok {
			return
		}
		update = update.SetSourceType(source)
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, questionNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"question": projected})
}

func (s *Server) deleteQuestion(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, questionNotFound,
		authorization.QuestionBankDelete, authorization.QuestionBankDeleteAll,
		func(ctx context.Context, client *tenantent.Client, id uuid.UUID,
			viewer *access.Viewer, decision authorization.Decision) (int, error) {
			return client.Question.Delete().
				Where(entquestion.ID(id), access.QuestionsWritableBy(viewer, decision)).
				Exec(ctx)
		})
}

func (s *Server) listQuestionVersions(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.questionScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if _, ok := s.readableQuestion(ctx, w, id, viewer, decision); !ok {
		return
	}

	p := filter.New(r.URL.Query())
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	rows, err := client.QuestionVersion.Query().
		Where(entversion.QuestionID(id)).
		Order(tenantent.Asc(entversion.FieldVersionNumber)).
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
	response.JSON(w, http.StatusOK, response.Envelope{
		"question_versions": projected,
		"count":             len(rows),
		"page":              pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) getQuestionVersion(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.questionScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.QuestionVersion.Query().
		Where(entversion.ID(id),
			entversion.HasQuestionWith(access.QuestionsFor(viewer, decision))).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, questionVersionNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"question_version": projected})
}

func (s *Server) createQuestionVersion(w http.ResponseWriter, r *http.Request) {
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

	var in questionVersionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.questionScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entversion.Columns,
		columnsSent(sent, entversion.ValidColumn)) {
		return
	}
	if in.VersionNumber != nil || wasSent(sent, entversion.FieldVersionNumber) {
		response.Error(w, http.StatusUnprocessableEntity,
			"version_number follows from the versions already recorded and must not be supplied")
		return
	}
	if in.Stem == nil || *in.Stem == "" {
		response.Error(w, http.StatusBadRequest, "stem is required")
		return
	}

	found, err := client.Question.Query().
		Where(entquestion.ID(id), access.QuestionsWritableBy(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, questionNotFound) {
		return
	}

	editor, ok := attributedTo(w, viewer, in.CreatedBy, entversion.FieldCreatedBy)
	if !ok {
		return
	}

	latest, err := client.QuestionVersion.Query().
		Where(entversion.QuestionID(id)).
		Order(tenantent.Desc(entversion.FieldVersionNumber)).
		First(ctx)
	next := 1
	switch {
	case err == nil:
		next = latest.VersionNumber + 1
	case tenantent.IsNotFound(err):
	default:
		writeTenancyErr(w, err)
		return
	}

	create := client.QuestionVersion.Create().
		SetQuestionID(id).
		SetVersionNumber(next).
		SetStem(*in.Stem).
		SetNillableExplanation(in.Explanation).
		SetCreatedBy(editor)
	if in.AnswerDataJSON != nil {
		create = create.SetAnswerDataJSON(in.AnswerDataJSON)
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entversion.FieldStatus, *in.Status,
			entversion.StatusValidator)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		if violates(err, questionVersionIndex) {
			response.Error(w, http.StatusConflict,
				"another version was recorded at the same time; read the versions again and retry")
			return
		}
		writeTenantEntErr(w, err, questionNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/question-versions/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"question_version": projected})
}

func (s *Server) updateQuestionVersionStatus(w http.ResponseWriter, r *http.Request) {
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

	var in questionVersionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.questionScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entversion.Columns,
		columnsSent(sent, entversion.ValidColumn)) {
		return
	}
	for _, name := range []string{entversion.FieldStem, entversion.FieldExplanation,
		entversion.FieldAnswerDataJSON, entversion.FieldVersionNumber} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				"a question version is never edited in place; record a new version instead of changing "+name)
			return
		}
	}
	if !rejectNull(w, sent, entversion.FieldStatus, in.Status) {
		return
	}
	if in.Status == nil {
		response.Error(w, http.StatusBadRequest, "status is the only field a version accepts")
		return
	}

	status, ok := timetableEnum(w, entversion.FieldStatus, *in.Status, entversion.StatusValidator)
	if !ok {
		return
	}

	n, err := client.QuestionVersion.Update().
		Where(entversion.ID(id),
			entversion.HasQuestionWith(access.QuestionsWritableBy(viewer, decision))).
		SetStatus(status).
		Save(ctx)
	if !wroteScopedRow(w, n, err, questionVersionNotFound) {
		return
	}

	row, err := client.QuestionVersion.Get(ctx, id)
	if err != nil {
		writeTenantEntErr(w, err, questionVersionNotFound)
		return
	}
	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"question_version": projected})
}

func bankWriteReaches(w http.ResponseWriter, viewer *access.Viewer,
	decision authorization.Decision, subject, grade *uuid.UUID, what string) bool {
	if subject == nil || grade == nil {
		if _, all := access.BankWriteReaches(viewer, decision, uuid.Nil, uuid.Nil); all {
			return true
		}
		response.Error(w, http.StatusUnprocessableEntity,
			what+" without both subject_id and grade_level_id is reachable school-wide only; "+
				"name the subject and the grade, or hold the school-wide write key")
		return false
	}
	if within, _ := access.BankWriteReaches(viewer, decision, *subject, *grade); within {
		return true
	}
	response.Error(w, http.StatusUnprocessableEntity,
		"that subject and grade are outside what you may write")
	return false
}
