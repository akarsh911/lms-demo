package http

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	entpaper "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/paper"
	entrun "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/papergenerationrun"
	entpquestion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/paperquestion"
	entpsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/papersection"
	enttarget "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/papertargetsection"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entquestion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/question"
	entversion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/questionversion"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	paperNotFound         = "paper not found"
	paperSectionNotFound  = "paper section not found"
	paperQuestionNotFound = "paper question not found"
	runNotFound           = "paper generation run not found"

	paperCodeIndex        = "paper_academic_session_id_paper_code_version"
	paperSectionCodeIndex = "papersection_paper_id_code"
	paperSectionPosIndex  = "papersection_paper_id_position"
	paperQuestionPosIndex = "paperquestion_paper_section_id_position"
)

const (
	paperTitleRunes   = 200
	paperSettledError = "paper_is_published"

	paperSectionIDsKey     = "section_ids"
	paperDocumentIDBytes   = 128
	paperProvenanceRunes   = 128
	paperTargetSectionsCap = 60
)

type paperPayload struct {
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	ExamID            *uuid.UUID `json:"exam_id"`
	BlueprintID       *uuid.UUID `json:"blueprint_id"`
	GenerationRunID   *uuid.UUID `json:"generation_run_id"`
	GradeLevelID      *uuid.UUID `json:"grade_level_id"`
	SubjectID         *uuid.UUID `json:"subject_id"`
	PaperCode         *string    `json:"paper_code"`
	Title             *string    `json:"title"`
	Version           *int       `json:"version"`
	Status            *string    `json:"status"`
	TotalMarks        *float64   `json:"total_marks"`
	DurationMinutes   *int       `json:"duration_minutes"`
	ApprovedBy        *uuid.UUID `json:"approved_by"`
	ApprovedAt        *string    `json:"approved_at"`

	EngineDocumentID *string                 `json:"engine_document_id"`
	ProvenanceJSON   *shared.PaperProvenance `json:"provenance_json"`
	SectionIDs       []uuid.UUID             `json:"section_ids"`
}

type paperSectionPayload struct {
	Name         *string `json:"name"`
	Code         *string `json:"code"`
	Position     *int    `json:"position"`
	Instructions *string `json:"instructions"`
}

type paperQuestionPayload struct {
	QuestionID        *uuid.UUID `json:"question_id"`
	QuestionVersionID *uuid.UUID `json:"question_version_id"`
	QuestionNumber    *string    `json:"question_number"`
	Marks             *float64   `json:"marks"`
	Position          *int       `json:"position"`
	VariantGroup      *string    `json:"variant_group"`
}

type generationRunPayload struct {
	BlueprintID       *uuid.UUID `json:"blueprint_id"`
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	GenerationMethod  *string    `json:"generation_method"`
	Algorithm         *string    `json:"algorithm"`
	ModelVersion      *string    `json:"model_version"`
	Status            *string    `json:"status"`
	RequestedBy       *uuid.UUID `json:"requested_by"`
	StartedAt         *string    `json:"started_at"`
	CompletedAt       *string    `json:"completed_at"`
	Prompt            *string    `json:"prompt"`
	PromptHash        *string    `json:"prompt_hash"`
	InputTokens       *int       `json:"input_tokens"`
	OutputTokens      *int       `json:"output_tokens"`
	CostAmount        *float64   `json:"cost_amount"`
	CostCurrency      *string    `json:"cost_currency"`
	FailureReason     *string    `json:"failure_reason"`
}

func (s *Server) mountPapers(r chi.Router) {
	r.Route("/papers", func(r chi.Router) {
		r.With(s.can(authorization.PapersRead)).Get("/", s.listPapers)
		r.With(s.can(authorization.PapersCreate)).Post("/", s.createPaper)
		r.With(s.can(authorization.PapersRead)).Get("/{id}", s.getPaper)
		r.With(s.can(authorization.PapersWrite)).Patch("/{id}", s.updatePaper)
		r.With(s.can(authorization.PapersDelete)).Delete("/{id}", s.deletePaper)
		r.With(s.can(authorization.PapersRead)).Get("/{id}/sections", s.listPaperSections)
		r.With(s.can(authorization.PapersWrite)).Post("/{id}/sections", s.createPaperSection)
	})

	r.Route("/paper-sections", func(r chi.Router) {
		r.With(s.can(authorization.PapersRead)).Get("/{id}", s.getPaperSection)
		r.With(s.can(authorization.PapersDelete)).Delete("/{id}", s.deletePaperSection)
		r.With(s.can(authorization.PapersRead)).Get("/{id}/questions", s.listPaperQuestions)
		r.With(s.can(authorization.PapersWrite)).Post("/{id}/questions", s.createPaperQuestion)
	})

	r.Route("/paper-questions", func(r chi.Router) {
		r.With(s.can(authorization.PapersDelete)).Delete("/{id}", s.deletePaperQuestion)
	})

	r.Route("/paper-generation-runs", func(r chi.Router) {
		r.With(s.can(authorization.PaperGenerationRead)).Get("/", s.listGenerationRuns)
		r.With(s.can(authorization.PaperGenerationCreate)).Post("/", s.createGenerationRun)
		r.With(s.can(authorization.PaperGenerationRead)).Get("/{id}", s.getGenerationRun)
		r.With(s.can(authorization.PaperGenerationWrite)).Patch("/{id}", s.updateGenerationRun)
	})
}

func (s *Server) paperScope(ctx context.Context, write bool) (
	*access.Viewer, authorization.Decision, error) {
	narrow, wide := authorization.PapersRead, authorization.PapersReadAll
	if write {
		narrow, wide = authorization.PapersWrite, authorization.PapersWriteAll
	}
	return s.scopeFor(ctx, narrow, wide)
}

func (s *Server) runScope(ctx context.Context, write bool) (
	*access.Viewer, authorization.Decision, error) {
	narrow, wide := authorization.PaperGenerationRead, authorization.PaperGenerationReadAll
	if write {
		narrow, wide = authorization.PaperGenerationWrite, authorization.PaperGenerationWriteAll
	}
	return s.scopeFor(ctx, narrow, wide)
}

func (s *Server) listPapers(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	viewer, decision, err := s.paperScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	sessionID := p.UUID("academic_session_id")
	examID := p.UUID("exam_id")
	blueprintID := p.UUID("blueprint_id")
	runID := p.UUID("generation_run_id")
	gradeLevelID := p.UUID("grade_level_id")
	subjectID := p.UUID("subject_id")
	sectionID := p.UUID("section_id")
	documentID := p.String("engine_document_id")
	code := p.String("paper_code")
	status := p.Enum("status", func(v string) error {
		return entpaper.StatusValidator(entpaper.Status(v))
	})
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := client.Paper.Query().Where(access.PapersFor(viewer, decision))
	if sessionID != nil {
		q = q.Where(entpaper.AcademicSessionID(*sessionID))
	}
	if examID != nil {
		q = q.Where(entpaper.ExamID(*examID))
	}
	if blueprintID != nil {
		q = q.Where(entpaper.BlueprintID(*blueprintID))
	}
	if runID != nil {
		q = q.Where(entpaper.GenerationRunID(*runID))
	}
	if gradeLevelID != nil {
		q = q.Where(entpaper.GradeLevelID(*gradeLevelID))
	}
	if subjectID != nil {
		q = q.Where(entpaper.SubjectID(*subjectID))
	}
	if sectionID != nil {
		q = q.Where(entpaper.HasTargetSectionsWith(enttarget.SectionID(*sectionID)))
	}
	if documentID != "" {
		q = q.Where(entpaper.EngineDocumentID(documentID))
	}
	if code != "" {
		q = q.Where(entpaper.PaperCode(code))
	}
	if status != nil {
		q = q.Where(entpaper.StatusEQ(entpaper.Status(*status)))
	}

	rows, err := q.
		Order(tenantent.Asc(entpaper.FieldPaperCode), tenantent.Asc(entpaper.FieldVersion)).
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

	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	index, err := paperTargetsOf(ctx, client, ids)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	targets := make([]response.Envelope, 0, len(index))
	for _, id := range ids {
		if sections := index[id]; len(sections) > 0 {
			targets = append(targets, response.Envelope{
				"paper_id":         id,
				paperSectionIDsKey: sections,
			})
		}
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"papers":        projected,
		"count":         len(rows),
		"page":          pageOf(limit, offset, len(rows)),
		"paper_targets": targets,
	})
}

func (s *Server) getPaper(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.paperScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Paper.Query().
		Where(entpaper.ID(id), access.PapersFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, paperNotFound)
		return
	}

	sections, err := client.PaperSection.Query().
		Where(entpsection.PaperID(id)).
		Order(tenantent.Asc(entpsection.FieldPosition)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	nested := make([]response.Envelope, 0, len(sections))
	for _, section := range sections {
		questions, err := client.PaperQuestion.Query().
			Where(entpquestion.PaperSectionID(section.ID)).
			Order(tenantent.Asc(entpquestion.FieldPosition)).
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
		projectedQuestions, err := projectAll(questions, decision.Fields)
		if err != nil {
			response.ServerError(w, err)
			return
		}
		nested = append(nested, response.Envelope{
			"section":   projectedSection,
			"questions": projectedQuestions,
		})
	}

	targets, err := paperTargetsFor(ctx, client, id)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, response.Envelope{
		"paper":            projected,
		"sections":         nested,
		paperSectionIDsKey: targets,
	})
}

func paperTargetIDs(w http.ResponseWriter, in []uuid.UUID) ([]uuid.UUID, bool) {
	seen := make(map[uuid.UUID]struct{}, len(in))
	out := make([]uuid.UUID, 0, len(in))
	for _, id := range in {
		if id == uuid.Nil {
			response.Error(w, http.StatusUnprocessableEntity,
				paperSectionIDsKey+" must name sections, not the empty UUID")
			return nil, false
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	if len(out) > paperTargetSectionsCap {
		response.Error(w, http.StatusUnprocessableEntity,
			paperSectionIDsKey+" names more sections than a paper may target")
		return nil, false
	}
	return out, true
}

func paperDocumentIDOK(w http.ResponseWriter, value *string) bool {
	if value == nil {
		return true
	}
	if *value == "" {
		response.Error(w, http.StatusUnprocessableEntity,
			entpaper.FieldEngineDocumentID+" must name a document or be omitted")
		return false
	}
	if len(*value) > paperDocumentIDBytes {
		response.Error(w, http.StatusBadRequest,
			entpaper.FieldEngineDocumentID+" must be at most "+
				strconv.Itoa(paperDocumentIDBytes)+" characters")
		return false
	}
	return true
}

func paperProvenanceOK(w http.ResponseWriter, value *shared.PaperProvenance) bool {
	if value == nil {
		return true
	}
	return withinRunes(w, "provenance_json.persona_id", value.PersonaID, paperProvenanceRunes) &&
		withinRunes(w, "provenance_json.seed", value.Seed, paperProvenanceRunes)
}

func paperTargetsOf(ctx context.Context, client *tenantent.Client,
	papers []uuid.UUID) (map[uuid.UUID][]uuid.UUID, error) {
	if len(papers) == 0 {
		return map[uuid.UUID][]uuid.UUID{}, nil
	}

	rows, err := client.PaperTargetSection.Query().
		Where(enttarget.PaperIDIn(papers...)).
		Order(tenantent.Asc(enttarget.FieldSectionID)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make(map[uuid.UUID][]uuid.UUID, len(papers))
	for _, row := range rows {
		out[row.PaperID] = append(out[row.PaperID], row.SectionID)
	}
	return out, nil
}

func paperTargetsFor(ctx context.Context, client *tenantent.Client,
	paper uuid.UUID) ([]uuid.UUID, error) {
	index, err := paperTargetsOf(ctx, client, []uuid.UUID{paper})
	if err != nil {
		return nil, err
	}
	if ids := index[paper]; ids != nil {
		return ids, nil
	}
	return []uuid.UUID{}, nil
}

func writePaperTargets(ctx context.Context, client *tenantent.Client,
	paper uuid.UUID, sections []uuid.UUID) error {
	if _, err := client.PaperTargetSection.Delete().
		Where(enttarget.PaperID(paper)).Exec(ctx); err != nil {
		return err
	}
	if len(sections) == 0 {
		return nil
	}

	builders := make([]*tenantent.PaperTargetSectionCreate, 0, len(sections))
	for _, section := range sections {
		builders = append(builders, client.PaperTargetSection.Create().
			SetPaperID(paper).SetSectionID(section))
	}
	return client.PaperTargetSection.CreateBulk(builders...).Exec(ctx)
}

func (s *Server) paperGradeReaches(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, viewer *access.Viewer, decision authorization.Decision,
	gradeLevelID *uuid.UUID) bool {
	if gradeLevelID == nil {
		return true
	}

	found, err := client.GradeLevel.Query().
		Where(entgrade.ID(*gradeLevelID),
			access.GradeLevelsWritableForPapers(viewer, decision)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !found {
		response.Error(w, http.StatusUnprocessableEntity,
			"grade_level_id does not name a class you may write a paper for")
		return false
	}
	return true
}

func (s *Server) paperTargetsReach(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, viewer *access.Viewer, decision authorization.Decision,
	sessionID uuid.UUID, gradeLevelID *uuid.UUID, sections []uuid.UUID) bool {
	if len(sections) == 0 {
		return true
	}

	rows, err := client.Section.Query().
		Where(entsection.IDIn(sections...),
			access.SectionsWritableForPapers(viewer, decision)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if len(rows) != len(sections) {
		response.Error(w, http.StatusUnprocessableEntity,
			paperSectionIDsKey+" names a section you may not write a paper for")
		return false
	}

	for _, row := range rows {
		if row.AcademicSessionID != sessionID {
			response.Error(w, http.StatusUnprocessableEntity,
				"every section in "+paperSectionIDsKey+
					" must belong to the paper's academic session")
			return false
		}
		if gradeLevelID != nil && row.GradeLevelID != *gradeLevelID {
			response.Error(w, http.StatusUnprocessableEntity,
				"every section in "+paperSectionIDsKey+" must belong to grade_level_id")
			return false
		}
	}
	return true
}

func (s *Server) paperTargetFieldsAllowed(w http.ResponseWriter, r *http.Request,
	decision authorization.Decision, sent []string) bool {
	if !wasSent(sent, paperSectionIDsKey) {
		return true
	}
	return rejectFields(w, r, decision.Fields, decision.Rule,
		enttarget.Columns, []string{enttarget.FieldSectionID})
}

func (s *Server) paperSubjectReaches(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, viewer *access.Viewer, decision authorization.Decision,
	subjectID, blueprintID, examID *uuid.UUID, sections []uuid.UUID) bool {
	if subjectID == nil {
		return true
	}

	if len(sections) > 0 {
		reached, err := client.Section.Query().
			Where(entsection.IDIn(sections...),
				access.SectionsWritableForPaperSubject(viewer, decision, *subjectID)).
			Count(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return false
		}
		if reached == len(sections) {
			return true
		}
	}
	if blueprintID != nil {
		found, err := client.Blueprint.Query().
			Where(entblueprint.ID(*blueprintID),
				access.BlueprintsWritableForPaperSubject(viewer, decision, *subjectID)).
			Exist(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return false
		}
		if found {
			return true
		}
	}
	if examID != nil {
		reachable, _ := access.ExamsWritableForPaperSubject(viewer, decision, *subjectID)
		found, err := client.Exam.Query().Where(entexam.ID(*examID), reachable).Exist(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return false
		}
		if found {
			return true
		}
	}

	response.Error(w, http.StatusUnprocessableEntity,
		entpaper.FieldSubjectID+" names a subject you do not teach where this paper reaches; "+
			"a paper carrying a subject is reached through that subject and no other")
	return false
}

func (s *Server) paperAnchorsReach(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, viewer *access.Viewer, decision authorization.Decision,
	blueprintID, examID *uuid.UUID, classAnchored bool) bool {
	if blueprintID != nil {
		found, err := client.Blueprint.Query().
			Where(entblueprint.ID(*blueprintID), access.BlueprintsWritableBy(viewer, decision)).
			Exist(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return false
		}
		if !found {
			response.Error(w, http.StatusUnprocessableEntity,
				"blueprint_id does not name a blueprint you may write")
			return false
		}
		return true
	}

	if examID != nil {
		reachable, _ := access.ExamsWritableForPapers(viewer, decision)
		found, err := client.Exam.Query().
			Where(entexam.ID(*examID), reachable).
			Exist(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return false
		}
		if !found {
			response.Error(w, http.StatusUnprocessableEntity,
				"exam_id does not name an exam you may write")
			return false
		}
		return true
	}

	if classAnchored {
		return true
	}

	if _, all := access.BankWriteReaches(viewer, decision, uuid.Nil, uuid.Nil); all {
		return true
	}
	response.Error(w, http.StatusUnprocessableEntity,
		"a paper carrying no blueprint_id, exam_id or "+paperSectionIDsKey+
			" is reachable school-wide only; name one of them, "+
			"or hold the school-wide write key")
	return false
}

func (s *Server) createPaper(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in paperPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.paperScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entpaper.Columns,
		columnsSent(sent, entpaper.ValidColumn)) {
		return
	}

	if in.AcademicSessionID == nil || in.PaperCode == nil || *in.PaperCode == "" ||
		in.Title == nil || *in.Title == "" || in.TotalMarks == nil {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id, paper_code, title and total_marks are required")
		return
	}
	if !withinRunes(w, entpaper.FieldTitle, *in.Title, paperTitleRunes) {
		return
	}
	if *in.TotalMarks <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entpaper.FieldTotalMarks+" must be greater than zero")
		return
	}
	if in.DurationMinutes != nil && *in.DurationMinutes <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entpaper.FieldDurationMinutes+" must be greater than zero")
		return
	}
	if wasSent(sent, entpaper.FieldApprovedBy) || wasSent(sent, entpaper.FieldApprovedAt) {
		response.Error(w, http.StatusUnprocessableEntity,
			"approval is recorded by approving the paper, not by creating one already approved")
		return
	}
	if !paperDocumentIDOK(w, in.EngineDocumentID) || !paperProvenanceOK(w, in.ProvenanceJSON) {
		return
	}
	if !s.paperTargetFieldsAllowed(w, r, decision, sent) {
		return
	}
	targets, ok := paperTargetIDs(w, in.SectionIDs)
	if !ok {
		return
	}
	if !s.paperGradeReaches(ctx, w, client, viewer, decision, in.GradeLevelID) {
		return
	}
	if !s.paperTargetsReach(ctx, w, client, viewer, decision,
		*in.AcademicSessionID, in.GradeLevelID, targets) {
		return
	}
	if !s.paperAnchorsReach(ctx, w, client, viewer, decision,
		in.BlueprintID, in.ExamID, len(targets) > 0) {
		return
	}
	if !s.paperSubjectReaches(ctx, w, client, viewer, decision,
		in.SubjectID, in.BlueprintID, in.ExamID, targets) {
		return
	}

	status := entpaper.StatusDraft
	if in.Status != nil {
		parsed, ok := timetableEnum(w, entpaper.FieldStatus, *in.Status, entpaper.StatusValidator)
		if !ok {
			return
		}
		status = parsed
	}

	unit, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	defer unit.rollback()

	create := unit.writer.Paper.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetNillableExamID(in.ExamID).
		SetNillableBlueprintID(in.BlueprintID).
		SetNillableGenerationRunID(in.GenerationRunID).
		SetNillableGradeLevelID(in.GradeLevelID).
		SetNillableSubjectID(in.SubjectID).
		SetPaperCode(*in.PaperCode).
		SetTitle(*in.Title).
		SetNillableVersion(in.Version).
		SetTotalMarks(*in.TotalMarks).
		SetNillableDurationMinutes(in.DurationMinutes).
		SetNillableEngineDocumentID(in.EngineDocumentID).
		SetStatus(status)

	if in.ProvenanceJSON != nil {
		create = create.SetProvenanceJSON(in.ProvenanceJSON)
	}

	row, err := create.Save(ctx)
	if err != nil {
		if violates(err, paperCodeIndex) {
			response.Error(w, http.StatusConflict,
				"a paper with that paper_code and version already exists in this session")
			return
		}
		writeTenantEntErr(w, err, paperNotFound)
		return
	}
	if err := writePaperTargets(ctx, unit.writer, row.ID, targets); err != nil {
		writeTenantEntErr(w, err, paperNotFound)
		return
	}
	if err := unit.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/papers/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{
		"paper":            projected,
		paperSectionIDsKey: targets,
	})
}

func (s *Server) updatePaper(w http.ResponseWriter, r *http.Request) {
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

	var in paperPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.paperScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entpaper.Columns,
		columnsSent(sent, entpaper.ValidColumn)) {
		return
	}
	for _, name := range []string{
		entpaper.FieldPaperCode, entpaper.FieldVersion,
		entpaper.FieldAcademicSessionID, entpaper.FieldGenerationRunID,
		entpaper.FieldApprovedAt,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded when the paper is created or approved and cannot be patched")
			return
		}
	}
	if !rejectNull(w, sent, entpaper.FieldTitle, in.Title) ||
		!rejectNull(w, sent, entpaper.FieldStatus, in.Status) ||
		!rejectNull(w, sent, entpaper.FieldTotalMarks, in.TotalMarks) {
		return
	}
	if !paperDocumentIDOK(w, in.EngineDocumentID) || !paperProvenanceOK(w, in.ProvenanceJSON) {
		return
	}
	if !s.paperTargetFieldsAllowed(w, r, decision, sent) {
		return
	}
	if in.Title != nil && !withinRunes(w, entpaper.FieldTitle, *in.Title, paperTitleRunes) {
		return
	}
	if in.TotalMarks != nil && *in.TotalMarks <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entpaper.FieldTotalMarks+" must be greater than zero")
		return
	}
	if in.DurationMinutes != nil && *in.DurationMinutes <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entpaper.FieldDurationMinutes+" must be greater than zero")
		return
	}

	current, err := client.Paper.Query().
		Where(entpaper.ID(id), access.PapersWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, paperNotFound)
		return
	}
	if current.Status == entpaper.StatusPublished {
		refusePublishedPaper(w, "a published paper is what candidates sat; it is superseded, not edited")
		return
	}

	blueprintID := patchedAnchor(sent, entpaper.FieldBlueprintID, in.BlueprintID, current.BlueprintID, false)
	examID := patchedAnchor(sent, entpaper.FieldExamID, in.ExamID, current.ExamID, false)
	gradeLevelID := patchedAnchor(sent, entpaper.FieldGradeLevelID, in.GradeLevelID,
		current.GradeLevelID, false)
	subjectID := patchedAnchor(sent, entpaper.FieldSubjectID, in.SubjectID,
		current.SubjectID, false)

	targets, err := paperTargetsFor(ctx, client, id)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	retargeted := wasSent(sent, paperSectionIDsKey)
	if retargeted {
		if targets, ok = paperTargetIDs(w, in.SectionIDs); !ok {
			return
		}
	}

	if wasSent(sent, entpaper.FieldBlueprintID) || wasSent(sent, entpaper.FieldExamID) ||
		wasSent(sent, entpaper.FieldGradeLevelID) || wasSent(sent, entpaper.FieldSubjectID) ||
		retargeted {
		if !s.paperGradeReaches(ctx, w, client, viewer, decision, gradeLevelID) {
			return
		}
		if !s.paperTargetsReach(ctx, w, client, viewer, decision,
			current.AcademicSessionID, gradeLevelID, targets) {
			return
		}
		if !s.paperAnchorsReach(ctx, w, client, viewer, decision,
			blueprintID, examID, len(targets) > 0) {
			return
		}
		if !s.paperSubjectReaches(ctx, w, client, viewer, decision,
			subjectID, blueprintID, examID, targets) {
			return
		}
	}

	unit, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	defer unit.rollback()

	update := unit.writer.Paper.UpdateOneID(id).
		SetNillableTitle(in.Title).
		SetNillableTotalMarks(in.TotalMarks).
		SetNillableDurationMinutes(in.DurationMinutes).
		SetNillableEngineDocumentID(in.EngineDocumentID)

	if blueprintID == nil {
		update = update.ClearBlueprintID()
	} else {
		update = update.SetBlueprintID(*blueprintID)
	}
	if examID == nil {
		update = update.ClearExamID()
	} else {
		update = update.SetExamID(*examID)
	}
	if gradeLevelID == nil {
		update = update.ClearGradeLevelID()
	} else {
		update = update.SetGradeLevelID(*gradeLevelID)
	}
	if subjectID == nil {
		update = update.ClearSubjectID()
	} else {
		update = update.SetSubjectID(*subjectID)
	}
	if wasCleared(sent, entpaper.FieldDurationMinutes, in.DurationMinutes) {
		update = update.ClearDurationMinutes()
	}
	if wasCleared(sent, entpaper.FieldEngineDocumentID, in.EngineDocumentID) {
		update = update.ClearEngineDocumentID()
	}
	if wasSent(sent, entpaper.FieldProvenanceJSON) {
		if in.ProvenanceJSON == nil {
			update = update.ClearProvenanceJSON()
		} else {
			update = update.SetProvenanceJSON(in.ProvenanceJSON)
		}
	}

	if in.Status != nil {
		status, ok := timetableEnum(w, entpaper.FieldStatus, *in.Status, entpaper.StatusValidator)
		if !ok {
			return
		}
		if status == entpaper.StatusApproved && current.ApprovedBy == nil {
			approver, ok := attributedTo(w, viewer, in.ApprovedBy, entpaper.FieldApprovedBy)
			if !ok {
				return
			}
			update = update.SetApprovedBy(approver).SetApprovedAt(nowUTC())
		}
		update = update.SetStatus(status)
	} else if wasSent(sent, entpaper.FieldApprovedBy) {
		response.Error(w, http.StatusUnprocessableEntity,
			"approved_by is recorded from the authenticated caller when the paper is approved")
		return
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, paperNotFound)
		return
	}
	if retargeted {
		if err := writePaperTargets(ctx, unit.writer, id, targets); err != nil {
			writeTenantEntErr(w, err, paperNotFound)
			return
		}
	}
	if err := unit.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"paper":            projected,
		paperSectionIDsKey: targets,
	})
}

func refusePublishedPaper(w http.ResponseWriter, message string) {
	response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
		"error":   paperSettledError,
		"message": message,
	})
}

func (s *Server) deletePaper(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, paperNotFound,
		authorization.PapersDelete, authorization.PapersDeleteAll,
		func(ctx context.Context, client *tenantent.Client, id uuid.UUID,
			viewer *access.Viewer, decision authorization.Decision) (int, error) {
			return client.Paper.Delete().
				Where(entpaper.ID(id),
					entpaper.StatusNEQ(entpaper.StatusPublished),
					access.PapersWritableBy(viewer, decision)).
				Exec(ctx)
		})
}

func (s *Server) listPaperSections(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.paperScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.Paper.Query().
		Where(entpaper.ID(id), access.PapersFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, paperNotFound) {
		return
	}

	rows, err := client.PaperSection.Query().
		Where(entpsection.PaperID(id)).
		Order(tenantent.Asc(entpsection.FieldPosition)).
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
		"paper_sections": projected,
		"count":          len(rows),
	})
}

func (s *Server) getPaperSection(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.paperScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.PaperSection.Query().
		Where(entpsection.ID(id), entpsection.HasPaperWith(access.PapersFor(viewer, decision))).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, paperSectionNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"paper_section": projected})
}

func (s *Server) writablePaper(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, id uuid.UUID, viewer *access.Viewer,
	decision authorization.Decision, notFound string, where ...func(*tenantent.PaperQuery) *tenantent.PaperQuery) (*tenantent.Paper, bool) {
	q := client.Paper.Query().Where(access.PapersWritableBy(viewer, decision), entpaper.ID(id))
	for _, narrow := range where {
		q = narrow(q)
	}
	row, err := q.Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, notFound)
		return nil, false
	}
	if row.Status == entpaper.StatusPublished {
		refusePublishedPaper(w,
			"a published paper renders as it was sat; add to a draft and publish a new version instead")
		return nil, false
	}
	return row, true
}

func (s *Server) createPaperSection(w http.ResponseWriter, r *http.Request) {
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

	var in paperSectionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.paperScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entpsection.Columns,
		columnsSent(sent, entpsection.ValidColumn)) {
		return
	}

	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" || in.Position == nil {
		response.Error(w, http.StatusBadRequest, "name, code and position are required")
		return
	}
	if !withinRunes(w, entpsection.FieldName, *in.Name, paperTitleRunes) {
		return
	}
	if *in.Position <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entpsection.FieldPosition+" must be greater than zero")
		return
	}

	if _, ok := s.writablePaper(ctx, w, client, id, viewer, decision, paperNotFound); !ok {
		return
	}

	row, err := client.PaperSection.Create().
		SetPaperID(id).
		SetName(*in.Name).
		SetCode(*in.Code).
		SetPosition(*in.Position).
		SetNillableInstructions(in.Instructions).
		Save(ctx)
	if err != nil {
		switch {
		case violates(err, paperSectionCodeIndex):
			response.Error(w, http.StatusConflict, "this paper already has a section with that code")
		case violates(err, paperSectionPosIndex):
			response.Error(w, http.StatusConflict, "this paper already has a section at that position")
		default:
			writeTenantEntErr(w, err, paperNotFound)
		}
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/paper-sections/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"paper_section": projected})
}

func paperOfSection(id uuid.UUID) predicate.Paper {
	return entpaper.HasSectionsWith(entpsection.ID(id))
}

func paperOfQuestion(id uuid.UUID) predicate.Paper {
	return entpaper.HasSectionsWith(entpsection.HasQuestionsWith(entpquestion.ID(id)))
}

type paperPartDelete func(context.Context, *tenantent.Client, uuid.UUID,
	predicate.Paper) (int, error)

func (s *Server) deletePaperPart(w http.ResponseWriter, r *http.Request, notFound string,
	owner func(uuid.UUID) predicate.Paper, del paperPartDelete) {
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
		authorization.PapersDelete, authorization.PapersDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	writable := access.PapersWritableBy(viewer, decision)
	n, err := del(ctx, client, id,
		entpaper.And(writable, entpaper.StatusNEQ(entpaper.StatusPublished)))
	if err != nil {
		writeTenantEntErr(w, err, notFound)
		return
	}
	if n > 0 {
		response.NoContent(w)
		return
	}

	settled, err := client.Paper.Query().
		Where(owner(id), writable, entpaper.StatusEQ(entpaper.StatusPublished)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if settled {
		refusePublishedPaper(w,
			"a published paper is what candidates sat; supersede it with a new version "+
				"instead of taking a part out of it")
		return
	}
	response.Error(w, http.StatusNotFound, notFound)
}

func (s *Server) deletePaperSection(w http.ResponseWriter, r *http.Request) {
	s.deletePaperPart(w, r, paperSectionNotFound, paperOfSection,
		func(ctx context.Context, client *tenantent.Client, id uuid.UUID,
			paper predicate.Paper) (int, error) {
			return client.PaperSection.Delete().
				Where(entpsection.ID(id), entpsection.HasPaperWith(paper)).
				Exec(ctx)
		})
}

func (s *Server) listPaperQuestions(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.paperScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.PaperSection.Query().
		Where(entpsection.ID(id), entpsection.HasPaperWith(access.PapersFor(viewer, decision))).
		Exist(ctx)
	if !mustReach(w, found, err, paperSectionNotFound) {
		return
	}

	rows, err := client.PaperQuestion.Query().
		Where(entpquestion.PaperSectionID(id)).
		Order(tenantent.Asc(entpquestion.FieldPosition)).
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
		"paper_questions": projected,
		"count":           len(rows),
	})
}

func (s *Server) createPaperQuestion(w http.ResponseWriter, r *http.Request) {
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

	var in paperQuestionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.paperScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entpquestion.Columns,
		columnsSent(sent, entpquestion.ValidColumn)) {
		return
	}

	if in.QuestionID == nil || in.QuestionVersionID == nil ||
		in.QuestionNumber == nil || *in.QuestionNumber == "" ||
		in.Marks == nil || in.Position == nil {
		response.Error(w, http.StatusBadRequest,
			"question_id, question_version_id, question_number, marks and position are required; "+
				"a paper records both the question and the version it printed")
		return
	}
	if *in.Marks <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entpquestion.FieldMarks+" must be greater than zero")
		return
	}
	if *in.Position <= 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			entpquestion.FieldPosition+" must be greater than zero")
		return
	}

	section, err := client.PaperSection.Query().
		Where(entpsection.ID(id), entpsection.HasPaperWith(access.PapersWritableBy(viewer, decision))).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, paperSectionNotFound)
		return
	}
	if _, ok := s.writablePaper(ctx, w, client, section.PaperID, viewer, decision,
		paperSectionNotFound); !ok {
		return
	}

	version, err := client.QuestionVersion.Query().
		Where(entversion.ID(*in.QuestionVersionID)).
		Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			response.Error(w, http.StatusUnprocessableEntity,
				"question_version_id does not name a question version")
			return
		}
		writeTenancyErr(w, err)
		return
	}
	if version.QuestionID != *in.QuestionID {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error": "question_version_belongs_elsewhere",
			"message": "question_version_id is a version of another question; " +
				"a paper question records the version of the question it prints",
		})
		return
	}
	exists, err := client.Question.Query().Where(entquestion.ID(*in.QuestionID)).Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !exists {
		response.Error(w, http.StatusUnprocessableEntity,
			"question_id does not name a question")
		return
	}

	row, err := client.PaperQuestion.Create().
		SetPaperSectionID(id).
		SetQuestionID(*in.QuestionID).
		SetQuestionVersionID(*in.QuestionVersionID).
		SetQuestionNumber(*in.QuestionNumber).
		SetMarks(*in.Marks).
		SetPosition(*in.Position).
		SetNillableVariantGroup(in.VariantGroup).
		Save(ctx)
	if err != nil {
		if violates(err, paperQuestionPosIndex) {
			response.Error(w, http.StatusConflict,
				"this section already has a question at that position")
			return
		}
		writeTenantEntErr(w, err, paperSectionNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, response.Envelope{"paper_question": projected})
}

func (s *Server) deletePaperQuestion(w http.ResponseWriter, r *http.Request) {
	s.deletePaperPart(w, r, paperQuestionNotFound, paperOfQuestion,
		func(ctx context.Context, client *tenantent.Client, id uuid.UUID,
			paper predicate.Paper) (int, error) {
			return client.PaperQuestion.Delete().
				Where(entpquestion.ID(id),
					entpquestion.HasSectionWith(entpsection.HasPaperWith(paper))).
				Exec(ctx)
		})
}

func (s *Server) listGenerationRuns(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	viewer, decision, err := s.runScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	blueprintID := p.UUID("blueprint_id")
	sessionID := p.UUID("academic_session_id")
	status := p.Enum("status", func(v string) error {
		return entrun.StatusValidator(entrun.Status(v))
	})
	method := p.Enum("generation_method", func(v string) error {
		return entrun.GenerationMethodValidator(entrun.GenerationMethod(v))
	})
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := client.PaperGenerationRun.Query().Where(access.PaperGenerationRunsFor(viewer, decision))
	if blueprintID != nil {
		q = q.Where(entrun.BlueprintID(*blueprintID))
	}
	if sessionID != nil {
		q = q.Where(entrun.AcademicSessionID(*sessionID))
	}
	if status != nil {
		q = q.Where(entrun.StatusEQ(entrun.Status(*status)))
	}
	if method != nil {
		q = q.Where(entrun.GenerationMethodEQ(entrun.GenerationMethod(*method)))
	}

	rows, err := q.
		Order(tenantent.Desc(entrun.FieldCreatedAt), tenantent.Asc(entrun.FieldID)).
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
		"paper_generation_runs": projected,
		"count":                 len(rows),
		"page":                  pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) getGenerationRun(w http.ResponseWriter, r *http.Request) {
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
	viewer, decision, err := s.runScope(ctx, false)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.PaperGenerationRun.Query().
		Where(entrun.ID(id), access.PaperGenerationRunsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, runNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)
	response.JSON(w, http.StatusOK, response.Envelope{"paper_generation_run": projected})
}

func runCostValid(w http.ResponseWriter, amount *float64, currency *string) bool {
	if (amount == nil) != (currency == nil) {
		response.Error(w, http.StatusUnprocessableEntity,
			"cost_amount and cost_currency are recorded together; an amount without its currency "+
				"cannot be compared later")
		return false
	}
	if amount != nil && *amount < 0 {
		response.Error(w, http.StatusUnprocessableEntity, "cost_amount cannot be negative")
		return false
	}
	if currency != nil && len(*currency) != 3 {
		response.Error(w, http.StatusUnprocessableEntity,
			"cost_currency is a three-letter ISO 4217 code")
		return false
	}
	return true
}

func runTokensValid(w http.ResponseWriter, in generationRunPayload) bool {
	for _, count := range []struct {
		name  string
		value *int
	}{
		{entrun.FieldInputTokens, in.InputTokens},
		{entrun.FieldOutputTokens, in.OutputTokens},
	} {
		if count.value != nil && *count.value < 0 {
			response.Error(w, http.StatusUnprocessableEntity, count.name+" cannot be negative")
			return false
		}
	}
	return true
}

func (s *Server) createGenerationRun(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in generationRunPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.runScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entrun.Columns,
		columnsSent(sent, entrun.ValidColumn)) {
		return
	}

	if in.BlueprintID == nil {
		response.Error(w, http.StatusBadRequest,
			"blueprint_id is required: a run records the pattern it was asked to fill")
		return
	}
	if !runCostValid(w, in.CostAmount, in.CostCurrency) || !runTokensValid(w, in) {
		return
	}

	startedAt, ok := instantField(w, entrun.FieldStartedAt, in.StartedAt)
	if !ok {
		return
	}
	completedAt, ok := instantField(w, entrun.FieldCompletedAt, in.CompletedAt)
	if !ok {
		return
	}
	if !runWindow(w, startedAt, completedAt) {
		return
	}

	blueprintReadable, err := client.Blueprint.Query().
		Where(entblueprint.ID(*in.BlueprintID), access.BlueprintsFor(viewer, decision)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !blueprintReadable {
		response.Error(w, http.StatusUnprocessableEntity,
			"blueprint_id does not name a blueprint you can read")
		return
	}

	requester, ok := attributedTo(w, viewer, in.RequestedBy, entrun.FieldRequestedBy)
	if !ok {
		return
	}

	create := client.PaperGenerationRun.Create().
		SetBlueprintID(*in.BlueprintID).
		SetNillableAcademicSessionID(in.AcademicSessionID).
		SetNillableAlgorithm(in.Algorithm).
		SetNillableModelVersion(in.ModelVersion).
		SetRequestedBy(requester).
		SetNillableStartedAt(startedAt).
		SetNillableCompletedAt(completedAt).
		SetNillablePrompt(in.Prompt).
		SetNillablePromptHash(in.PromptHash).
		SetNillableInputTokens(in.InputTokens).
		SetNillableOutputTokens(in.OutputTokens).
		SetNillableCostAmount(in.CostAmount).
		SetNillableCostCurrency(in.CostCurrency).
		SetNillableFailureReason(in.FailureReason)

	if in.GenerationMethod != nil {
		method, ok := timetableEnum(w, entrun.FieldGenerationMethod, *in.GenerationMethod,
			entrun.GenerationMethodValidator)
		if !ok {
			return
		}
		create = create.SetGenerationMethod(method)
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entrun.FieldStatus, *in.Status, entrun.StatusValidator)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, runNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/paper-generation-runs/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"paper_generation_run": projected})
}

func runWindow(w http.ResponseWriter, from, to *time.Time) bool {
	if from != nil && to != nil && to.Before(*from) {
		response.Error(w, http.StatusUnprocessableEntity,
			entrun.FieldCompletedAt+" precedes "+entrun.FieldStartedAt)
		return false
	}
	return true
}

func (s *Server) updateGenerationRun(w http.ResponseWriter, r *http.Request) {
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

	var in generationRunPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.runScope(ctx, true)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entrun.Columns,
		columnsSent(sent, entrun.ValidColumn)) {
		return
	}
	for _, name := range []string{
		entrun.FieldBlueprintID, entrun.FieldAcademicSessionID,
		entrun.FieldGenerationMethod, entrun.FieldRequestedBy, entrun.FieldPrompt,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is what the run was asked to do and cannot be rewritten after the fact")
			return
		}
	}
	if !runTokensValid(w, in) {
		return
	}

	current, err := client.PaperGenerationRun.Query().
		Where(entrun.ID(id), access.PaperGenerationRunsWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, runNotFound)
		return
	}

	startedAt, ok := instantField(w, entrun.FieldStartedAt, in.StartedAt)
	if !ok {
		return
	}
	completedAt, ok := instantField(w, entrun.FieldCompletedAt, in.CompletedAt)
	if !ok {
		return
	}
	if startedAt == nil {
		startedAt = current.StartedAt
	}
	if completedAt == nil {
		completedAt = current.CompletedAt
	}
	if !runWindow(w, startedAt, completedAt) {
		return
	}

	amount, currency := in.CostAmount, in.CostCurrency
	if amount == nil && !wasSent(sent, entrun.FieldCostAmount) {
		amount = current.CostAmount
	}
	if currency == nil && !wasSent(sent, entrun.FieldCostCurrency) {
		currency = current.CostCurrency
	}
	if !runCostValid(w, amount, currency) {
		return
	}

	update := client.PaperGenerationRun.UpdateOneID(id).
		SetNillableAlgorithm(in.Algorithm).
		SetNillableModelVersion(in.ModelVersion).
		SetNillablePromptHash(in.PromptHash).
		SetNillableInputTokens(in.InputTokens).
		SetNillableOutputTokens(in.OutputTokens).
		SetNillableFailureReason(in.FailureReason).
		SetNillableStartedAt(startedAt).
		SetNillableCompletedAt(completedAt)

	if amount == nil {
		update = update.ClearCostAmount().ClearCostCurrency()
	} else {
		update = update.SetCostAmount(*amount).SetCostCurrency(*currency)
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entrun.FieldStatus, *in.Status, entrun.StatusValidator)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, runNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"paper_generation_run": projected})
}
