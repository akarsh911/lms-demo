package http

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entattempt "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examattempt"
	entdelivery "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examonlinedelivery"
	entquestion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examquestion"
	entoption "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examquestionoption"
	entresponse "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examresponse"
	entexamsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsubject"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entexammark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentexammark"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	onlineTestNotFound     = "online test not found"
	onlineQuestionNotFound = "online test question not found"
	onlineAttemptNotFound  = "online test attempt not found"
	onlineResponseNotFound = "online test response not found"

	onlineTestNotOnline = "that exam is not delivered online; set its delivery to " +
		string(entexam.DeliveryOnline) + " before giving it questions"
	onlineTestNotPublished = "this online test has not been published yet"
	onlineTestClosed       = "this online test is closed"
	onlineTestNotOpenYet   = "this online test has not opened yet"
	onlineTestWindowGone   = "this online test closed at "

	onlineQuestionPromptRunes = 4000
	onlineOptionBodyRunes     = 1000
	onlineAnswerTextRunes     = 20000

	maxOnlineOptions   = 10
	maxOnlineResponses = 200

	onlineQuestionPositionIndex = "examquestion_exam_subject_id_position"
	onlineAttemptIndex          = "examattempt_exam_subject_id_student_id_attempt_no"
	onlineDeliveryIndex         = "examonlinedelivery_exam_subject_id"
)

type onlineDeliveryPayload struct {
	OpensAt             *string `json:"opens_at"`
	ClosesAt            *string `json:"closes_at"`
	DurationMinutes     *int    `json:"duration_minutes"`
	AttemptsAllowed     *int    `json:"attempts_allowed"`
	AllowLateSubmission *bool   `json:"allow_late_submission"`
}

type onlineOptionPayload struct {
	Body      *string `json:"body"`
	IsCorrect *bool   `json:"is_correct"`
}

type onlineQuestionPayload struct {
	Position *int                  `json:"position"`
	Kind     *string               `json:"kind"`
	Prompt   *string               `json:"prompt"`
	Marks    *float64              `json:"marks"`
	Options  []onlineOptionPayload `json:"options"`
}

type onlineAttemptPayload struct {
	StudentID *uuid.UUID `json:"student_id"`
}

type onlineResponsePayload struct {
	ExamQuestionID   *uuid.UUID `json:"exam_question_id"`
	SelectedOptionID *uuid.UUID `json:"selected_option_id"`
	AnswerText       *string    `json:"answer_text"`
}

type onlineResponsesPayload struct {
	Responses []onlineResponsePayload `json:"responses"`
}

type onlineAwardPayload struct {
	AwardedMarks *float64 `json:"awarded_marks"`
}

func (s *Server) mountOnlineTests(r chi.Router) {
	r.Route("/online-tests", func(r chi.Router) {
		r.With(s.can(authorization.TimetableWrite)).Get("/{id}", s.getOnlineTest)
		r.With(s.can(authorization.TimetableWrite)).Put("/{id}", s.setOnlineTestWindow)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/publish", s.publishOnlineTest)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/close", s.closeOnlineTest)
		r.With(s.can(authorization.TimetableWrite)).Get("/{id}/questions", s.listOnlineTestQuestions)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/questions", s.createOnlineTestQuestion)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/paper", s.getOnlineTestPaper)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/attempts", s.listOnlineTestAttempts)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/attempts", s.startOnlineTestAttempt)
	})

	r.Route("/online-test-questions", func(r chi.Router) {
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updateOnlineTestQuestion)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deleteOnlineTestQuestion)
	})

	r.Route("/online-test-attempts", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getOnlineTestAttempt)
		r.With(s.can(authorization.TimetableWrite)).Put("/{id}/responses", s.saveOnlineTestResponses)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/submit", s.submitOnlineTestAttempt)
	})

	r.Route("/online-test-responses", func(r chi.Router) {
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.awardOnlineTestResponse)
	})
}

type answerKeyOption struct {
	ID        uuid.UUID `json:"id"`
	Position  int       `json:"position"`
	Body      string    `json:"body"`
	IsCorrect bool      `json:"is_correct"`
}

type answerKeyQuestion struct {
	ID       uuid.UUID         `json:"id"`
	Position int               `json:"position"`
	Kind     string            `json:"kind"`
	Prompt   string            `json:"prompt"`
	Marks    float64           `json:"marks"`
	Options  []answerKeyOption `json:"options"`
}

type sittableOption struct {
	ID       uuid.UUID `json:"id"`
	Position int       `json:"position"`
	Body     string    `json:"body"`
}

type sittableQuestion struct {
	ID       uuid.UUID        `json:"id"`
	Position int              `json:"position"`
	Kind     string           `json:"kind"`
	Prompt   string           `json:"prompt"`
	Marks    float64          `json:"marks"`
	Options  []sittableOption `json:"options"`
}

func answerKeyOf(rows []*tenantent.ExamQuestion) []answerKeyQuestion {
	out := make([]answerKeyQuestion, 0, len(rows))
	for _, row := range rows {
		question := answerKeyQuestion{
			ID:       row.ID,
			Position: row.Position,
			Kind:     string(row.Kind),
			Prompt:   row.Prompt,
			Marks:    row.Marks,
			Options:  make([]answerKeyOption, 0, len(row.Edges.Options)),
		}
		for _, option := range row.Edges.Options {
			question.Options = append(question.Options, answerKeyOption{
				ID:        option.ID,
				Position:  option.Position,
				Body:      option.Body,
				IsCorrect: option.IsCorrect,
			})
		}
		out = append(out, question)
	}
	return out
}

func sittablePaperOf(rows []*tenantent.ExamQuestion) []sittableQuestion {
	out := make([]sittableQuestion, 0, len(rows))
	for _, row := range rows {
		question := sittableQuestion{
			ID:       row.ID,
			Position: row.Position,
			Kind:     string(row.Kind),
			Prompt:   row.Prompt,
			Marks:    row.Marks,
			Options:  make([]sittableOption, 0, len(row.Edges.Options)),
		}
		for _, option := range row.Edges.Options {
			question.Options = append(question.Options, sittableOption{
				ID:       option.ID,
				Position: option.Position,
				Body:     option.Body,
			})
		}
		out = append(out, question)
	}
	return out
}

func onlineQuestionsOf(ctx context.Context, client *tenantent.Client,
	subjectID uuid.UUID) ([]*tenantent.ExamQuestion, error) {
	return client.ExamQuestion.Query().
		Where(entquestion.ExamSubjectID(subjectID)).
		WithOptions(func(q *tenantent.ExamQuestionOptionQuery) {
			q.Order(tenantent.Asc(entoption.FieldPosition))
		}).
		Order(tenantent.Asc(entquestion.FieldPosition)).
		All(ctx)
}

func (s *Server) authoredSubject(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, r *http.Request) (*tenantent.ExamSubject, bool) {
	id, ok := idParam(w, r, "id")
	if !ok {
		return nil, false
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	return markableSubject(ctx, w, client, id, viewer, decision)
}

func onlineDeliveryOf(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	subjectID uuid.UUID) (*tenantent.ExamOnlineDelivery, bool) {
	row, err := client.ExamOnlineDelivery.Query().
		Where(entdelivery.ExamSubjectID(subjectID)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, onlineTestNotFound)
		return nil, false
	}
	return row, true
}

func deliveredOnline(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	subject *tenantent.ExamSubject) bool {
	online, err := client.Exam.Query().
		Where(entexam.ID(subject.ExamID), entexam.DeliveryEQ(entexam.DeliveryOnline)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !online {
		response.Error(w, http.StatusUnprocessableEntity, onlineTestNotOnline)
		return false
	}
	return true
}

func (s *Server) getOnlineTest(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	subject, ok := s.authoredSubject(ctx, w, client, r)
	if !ok {
		return
	}
	delivery, ok := onlineDeliveryOf(ctx, w, client, subject.ID)
	if !ok {
		return
	}

	questions, err := onlineQuestionsOf(ctx, client, subject.ID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"online_test":   delivery,
		"questions":     answerKeyOf(questions),
		"maximum_marks": subject.MaximumMarks,
		"question_sum":  onlineQuestionSum(questions),
	})
}

func onlineQuestionSum(questions []*tenantent.ExamQuestion) float64 {
	sum := 0.0
	for _, question := range questions {
		sum += question.Marks
	}
	return sum
}

func onlineWindowValid(w http.ResponseWriter, opens, closes *time.Time) bool {
	if opens == nil || closes == nil {
		response.Error(w, http.StatusBadRequest,
			"opens_at and closes_at are both required: an online test that never closes is not a test")
		return false
	}
	if !closes.After(*opens) {
		response.Error(w, http.StatusUnprocessableEntity, "closes_at must come after opens_at")
		return false
	}
	return true
}

func (s *Server) setOnlineTestWindow(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in onlineDeliveryPayload
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	subject, ok := s.authoredSubject(ctx, w, client, r)
	if !ok {
		return
	}
	if !deliveredOnline(ctx, w, client, subject) {
		return
	}

	opens, err := parseInstant("opens_at", in.OpensAt)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	closes, err := parseInstant("closes_at", in.ClosesAt)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if !onlineWindowValid(w, opens, closes) {
		return
	}
	if in.DurationMinutes != nil && *in.DurationMinutes <= 0 {
		response.Error(w, http.StatusBadRequest,
			"duration_minutes must be greater than zero; omit it to give the whole window")
		return
	}
	if in.AttemptsAllowed != nil && *in.AttemptsAllowed <= 0 {
		response.Error(w, http.StatusBadRequest,
			"attempts_allowed must be at least one; close the test instead of allowing none")
		return
	}

	attempts := 1
	if in.AttemptsAllowed != nil {
		attempts = *in.AttemptsAllowed
	}
	late := false
	if in.AllowLateSubmission != nil {
		late = *in.AllowLateSubmission
	}

	current, err := client.ExamOnlineDelivery.Query().
		Where(entdelivery.ExamSubjectID(subject.ID)).
		Only(ctx)
	if err != nil && !tenantent.IsNotFound(err) {
		writeTenancyErr(w, err)
		return
	}

	if current == nil {
		row, err := client.ExamOnlineDelivery.Create().
			SetExamSubjectID(subject.ID).
			SetOpensAt(*opens).
			SetClosesAt(*closes).
			SetNillableDurationMinutes(in.DurationMinutes).
			SetAttemptsAllowed(attempts).
			SetAllowLateSubmission(late).
			Save(ctx)
		if err != nil {
			if violates(err, onlineDeliveryIndex) {
				response.Error(w, http.StatusConflict,
					"this exam subject already has an online test; amend it instead")
				return
			}
			writeTenantEntErr(w, err, onlineTestNotFound)
			return
		}
		w.Header().Set("Location", "/api/v1/online-tests/"+subject.ID.String())
		response.JSON(w, http.StatusCreated, response.Envelope{"online_test": row})
		return
	}

	if current.Status == entdelivery.StatusClosed {
		response.Error(w, http.StatusConflict,
			"this online test is closed; its window can no longer be moved")
		return
	}

	update := client.ExamOnlineDelivery.UpdateOne(current).
		SetOpensAt(*opens).
		SetClosesAt(*closes).
		SetAttemptsAllowed(attempts).
		SetAllowLateSubmission(late)
	if in.DurationMinutes != nil {
		update = update.SetDurationMinutes(*in.DurationMinutes)
	} else {
		update = update.ClearDurationMinutes()
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, onlineTestNotFound)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"online_test": row})
}

func onlinePublishRefusal(ctx context.Context, client *tenantent.Client,
	subject *tenantent.ExamSubject, delivery *tenantent.ExamOnlineDelivery,
	now time.Time) (string, error) {

	if !delivery.ClosesAt.After(now) {
		return "this test closes at " + delivery.ClosesAt.Format(time.RFC3339) +
			", which has already passed; move the window before publishing it", nil
	}

	questions, err := onlineQuestionsOf(ctx, client, subject.ID)
	if err != nil {
		return "", err
	}
	if len(questions) == 0 {
		return "this test has no questions, so there is nothing for its " +
			marks(subject.MaximumMarks) + " marks to be earned from", nil
	}

	sum := onlineQuestionSum(questions)
	if !sameMarks(sum, subject.MaximumMarks) {
		return "the questions add up to " + marks(sum) + ", not the " +
			marks(subject.MaximumMarks) + " this paper is out of; a paper that cannot reach its " +
			"own maximum is not a paper", nil
	}

	for _, question := range questions {
		switch question.Kind {
		case entquestion.KindSingleChoice:
			if len(question.Edges.Options) < 2 {
				return fmt.Sprintf("question %d offers %d option(s); a choice with fewer than two "+
					"is not a choice", question.Position, len(question.Edges.Options)), nil
			}
			correct := 0
			for _, option := range question.Edges.Options {
				if option.IsCorrect {
					correct++
				}
			}
			if correct != 1 {
				return fmt.Sprintf("question %d has %d correct options; a single-choice question "+
					"marks itself against exactly one", question.Position, correct), nil
			}
		case entquestion.KindFreeText:
			if len(question.Edges.Options) > 0 {
				return fmt.Sprintf("question %d is free text yet carries options; nothing would "+
					"ever show them", question.Position), nil
			}
		}
	}

	return "", nil
}

func (s *Server) publishOnlineTest(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	subject, ok := s.authoredSubject(ctx, w, client, r)
	if !ok {
		return
	}
	if !deliveredOnline(ctx, w, client, subject) {
		return
	}
	delivery, ok := onlineDeliveryOf(ctx, w, client, subject.ID)
	if !ok {
		return
	}
	if delivery.Status == entdelivery.StatusClosed {
		response.Error(w, http.StatusConflict, onlineTestClosed)
		return
	}

	why, err := onlinePublishRefusal(ctx, client, subject, delivery, nowUTC())
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if why != "" {
		response.Error(w, http.StatusUnprocessableEntity, why)
		return
	}

	row, err := client.ExamOnlineDelivery.UpdateOne(delivery).
		SetStatus(entdelivery.StatusPublished).
		SetPublishedAt(nowUTC()).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, onlineTestNotFound)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"online_test": row})
}

func (s *Server) closeOnlineTest(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	subject, ok := s.authoredSubject(ctx, w, client, r)
	if !ok {
		return
	}
	delivery, ok := onlineDeliveryOf(ctx, w, client, subject.ID)
	if !ok {
		return
	}

	row, err := client.ExamOnlineDelivery.UpdateOne(delivery).
		SetStatus(entdelivery.StatusClosed).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, onlineTestNotFound)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"online_test": row})
}

func (s *Server) listOnlineTestQuestions(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	subject, ok := s.authoredSubject(ctx, w, client, r)
	if !ok {
		return
	}

	questions, err := onlineQuestionsOf(ctx, client, subject.ID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"questions":     answerKeyOf(questions),
		"count":         len(questions),
		"question_sum":  onlineQuestionSum(questions),
		"maximum_marks": subject.MaximumMarks,
	})
}

func onlineQuestionShape(w http.ResponseWriter, kind entquestion.Kind,
	options []onlineOptionPayload) bool {

	if kind == entquestion.KindFreeText {
		if len(options) > 0 {
			response.Error(w, http.StatusUnprocessableEntity,
				"a free_text question carries no options; nothing would ever show them")
			return false
		}
		return true
	}

	if len(options) < 2 {
		response.Error(w, http.StatusUnprocessableEntity,
			"a single_choice question needs at least two options; a choice of one is not a choice")
		return false
	}
	if len(options) > maxOnlineOptions {
		response.Error(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("a question may offer at most %d options", maxOnlineOptions))
		return false
	}

	correct := 0
	for i, option := range options {
		if option.Body == nil || *option.Body == "" {
			response.Error(w, http.StatusBadRequest,
				fmt.Sprintf("option %d has no body", i+1))
			return false
		}
		if !withinRunes(w, "options", *option.Body, onlineOptionBodyRunes) {
			return false
		}
		if option.IsCorrect != nil && *option.IsCorrect {
			correct++
		}
	}
	if correct != 1 {
		response.Error(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("a single_choice question is marked against exactly one correct option, "+
				"and this one names %d", correct))
		return false
	}
	return true
}

func writeOnlineOptions(ctx context.Context, writer *tenantent.Client, questionID uuid.UUID,
	options []onlineOptionPayload) error {
	for i, option := range options {
		correct := option.IsCorrect != nil && *option.IsCorrect
		if _, err := writer.ExamQuestionOption.Create().
			SetExamQuestionID(questionID).
			SetPosition(i + 1).
			SetBody(*option.Body).
			SetIsCorrect(correct).
			Save(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) createOnlineTestQuestion(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in onlineQuestionPayload
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	subject, ok := s.authoredSubject(ctx, w, client, r)
	if !ok {
		return
	}
	if !deliveredOnline(ctx, w, client, subject) {
		return
	}
	if !onlineTestUnsat(ctx, w, client, subject.ID) {
		return
	}

	if in.Prompt == nil || *in.Prompt == "" || in.Marks == nil {
		response.Error(w, http.StatusBadRequest, "prompt and marks are required")
		return
	}
	if !withinRunes(w, entquestion.FieldPrompt, *in.Prompt, onlineQuestionPromptRunes) {
		return
	}
	if *in.Marks <= 0 {
		response.Error(w, http.StatusBadRequest,
			"marks must be greater than zero; a question worth nothing is not a question")
		return
	}
	if !onlinePositionValid(w, in.Position) {
		return
	}

	kind := entquestion.DefaultKind
	if in.Kind != nil {
		kind, ok = timetableEnum(w, entquestion.FieldKind, *in.Kind, entquestion.KindValidator)
		if !ok {
			return
		}
	}
	if !onlineQuestionShape(w, kind, in.Options) {
		return
	}

	position, err := nextOnlinePosition(ctx, client, subject.ID, in.Position)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	unit, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	question, err := unit.writer.ExamQuestion.Create().
		SetExamSubjectID(subject.ID).
		SetPosition(position).
		SetKind(kind).
		SetPrompt(*in.Prompt).
		SetMarks(*in.Marks).
		Save(ctx)
	if err == nil {
		err = writeOnlineOptions(ctx, unit.writer, question.ID, in.Options)
	}
	if err != nil {
		unit.rollback()
		if violates(err, onlineQuestionPositionIndex) {
			response.Error(w, http.StatusConflict,
				"another question already sits at that position")
			return
		}
		writeTenantEntErr(w, err, onlineQuestionNotFound)
		return
	}
	if err := unit.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := onlineQuestionsOf(ctx, client, subject.ID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	w.Header().Set("Location", "/api/v1/online-test-questions/"+question.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{
		"question":     onlineQuestionByID(answerKeyOf(rows), question.ID),
		"question_sum": onlineQuestionSum(rows),
	})
}

func onlinePositionValid(w http.ResponseWriter, position *int) bool {
	if position != nil && *position <= 0 {
		response.Error(w, http.StatusBadRequest,
			entquestion.FieldPosition+" starts at one")
		return false
	}
	return true
}

func onlineQuestionByID(rows []answerKeyQuestion, id uuid.UUID) *answerKeyQuestion {
	for i := range rows {
		if rows[i].ID == id {
			return &rows[i]
		}
	}
	return nil
}

func nextOnlinePosition(ctx context.Context, client *tenantent.Client,
	subjectID uuid.UUID, asked *int) (int, error) {
	if asked != nil {
		return *asked, nil
	}
	count, err := client.ExamQuestion.Query().
		Where(entquestion.ExamSubjectID(subjectID)).Count(ctx)
	if err != nil {
		return 0, err
	}
	return count + 1, nil
}

func onlineTestUnsat(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, subjectID uuid.UUID) bool {
	sat, err := client.ExamAttempt.Query().
		Where(entattempt.ExamSubjectID(subjectID)).Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if sat {
		response.Error(w, http.StatusConflict,
			"pupils have already attempted this test; its questions can no longer be changed")
		return false
	}
	return true
}

func (s *Server) authoredQuestion(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, r *http.Request) (*tenantent.ExamQuestion, bool) {
	id, ok := idParam(w, r, "id")
	if !ok {
		return nil, false
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	row, err := client.ExamQuestion.Query().
		Where(entquestion.ID(id),
			entquestion.HasExamSubjectWith(markableExamSubjects(viewer, decision))).
		WithOptions(func(q *tenantent.ExamQuestionOptionQuery) {
			q.Order(tenantent.Asc(entoption.FieldPosition))
		}).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, onlineQuestionNotFound)
		return nil, false
	}
	return row, true
}

func (s *Server) updateOnlineTestQuestion(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in onlineQuestionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	current, ok := s.authoredQuestion(ctx, w, client, r)
	if !ok {
		return
	}
	if !onlineTestUnsat(ctx, w, client, current.ExamSubjectID) {
		return
	}

	kind := current.Kind
	if in.Kind != nil {
		kind, ok = timetableEnum(w, entquestion.FieldKind, *in.Kind, entquestion.KindValidator)
		if !ok {
			return
		}
	}
	if in.Prompt != nil &&
		!withinRunes(w, entquestion.FieldPrompt, *in.Prompt, onlineQuestionPromptRunes) {
		return
	}
	if in.Marks != nil && *in.Marks <= 0 {
		response.Error(w, http.StatusBadRequest,
			"marks must be greater than zero; a question worth nothing is not a question")
		return
	}
	if !onlinePositionValid(w, in.Position) {
		return
	}

	replacing := wasSent(sent, "options") || kind != current.Kind
	if replacing && !onlineQuestionShape(w, kind, in.Options) {
		return
	}

	unit, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	update := unit.writer.ExamQuestion.UpdateOneID(current.ID).SetKind(kind)
	if in.Prompt != nil {
		update = update.SetPrompt(*in.Prompt)
	}
	if in.Marks != nil {
		update = update.SetMarks(*in.Marks)
	}
	if in.Position != nil {
		update = update.SetPosition(*in.Position)
	}

	_, err = update.Save(ctx)
	if err == nil && replacing {
		if _, err = unit.writer.ExamQuestionOption.Delete().
			Where(entoption.ExamQuestionID(current.ID)).Exec(ctx); err == nil {
			err = writeOnlineOptions(ctx, unit.writer, current.ID, in.Options)
		}
	}
	if err != nil {
		unit.rollback()
		if violates(err, onlineQuestionPositionIndex) {
			response.Error(w, http.StatusConflict,
				"another question already sits at that position")
			return
		}
		writeTenantEntErr(w, err, onlineQuestionNotFound)
		return
	}
	if err := unit.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := onlineQuestionsOf(ctx, client, current.ExamSubjectID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"question":     onlineQuestionByID(answerKeyOf(rows), current.ID),
		"question_sum": onlineQuestionSum(rows),
	})
}

func (s *Server) deleteOnlineTestQuestion(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	current, ok := s.authoredQuestion(ctx, w, client, r)
	if !ok {
		return
	}
	if !onlineTestUnsat(ctx, w, client, current.ExamSubjectID) {
		return
	}

	if err := client.ExamQuestion.DeleteOneID(current.ID).Exec(ctx); err != nil {
		writeTenantEntErr(w, err, onlineQuestionNotFound)
		return
	}
	response.NoContent(w)
}

func (s *Server) sittableSubject(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, r *http.Request) (*tenantent.ExamSubject,
	*access.Viewer, authorization.Decision, bool) {

	id, ok := idParam(w, r, "id")
	if !ok {
		return nil, nil, authorization.Decision{}, false
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, nil, authorization.Decision{}, false
	}

	row, err := client.ExamSubject.Query().
		Where(append(examSubjectScope(viewer, decision), entexamsubject.ID(id))...).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return nil, nil, authorization.Decision{}, false
	}
	return row, viewer, decision, true
}

func onlineTestOpen(w http.ResponseWriter, delivery *tenantent.ExamOnlineDelivery,
	now time.Time) bool {
	switch {
	case delivery.Status == entdelivery.StatusDraft:
		response.Error(w, http.StatusForbidden, onlineTestNotPublished)
		return false
	case delivery.Status == entdelivery.StatusClosed:
		response.Error(w, http.StatusForbidden, onlineTestClosed)
		return false
	case now.Before(delivery.OpensAt):
		response.Error(w, http.StatusForbidden,
			onlineTestNotOpenYet+"; it opens at "+delivery.OpensAt.Format(time.RFC3339))
		return false
	case now.After(delivery.ClosesAt):
		response.Error(w, http.StatusForbidden,
			onlineTestWindowGone+delivery.ClosesAt.Format(time.RFC3339))
		return false
	}
	return true
}

func (s *Server) getOnlineTestPaper(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	subject, _, _, ok := s.sittableSubject(ctx, w, client, r)
	if !ok {
		return
	}
	delivery, ok := onlineDeliveryOf(ctx, w, client, subject.ID)
	if !ok {
		return
	}
	if !onlineTestOpen(w, delivery, nowUTC()) {
		return
	}

	questions, err := onlineQuestionsOf(ctx, client, subject.ID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"online_test": response.Envelope{
			"exam_subject_id":       subject.ID,
			"opens_at":              delivery.OpensAt,
			"closes_at":             delivery.ClosesAt,
			"duration_minutes":      delivery.DurationMinutes,
			"attempts_allowed":      delivery.AttemptsAllowed,
			"allow_late_submission": delivery.AllowLateSubmission,
		},
		"questions":     sittablePaperOf(questions),
		"maximum_marks": subject.MaximumMarks,
	})
}

func onlineAttemptsFor(v *access.Viewer, d authorization.Decision) []predicate.ExamAttempt {
	if v == nil {
		return []predicate.ExamAttempt{entattempt.IDIn()}
	}
	return []predicate.ExamAttempt{
		entattempt.HasStudentWith(access.StudentsForAcademic(v, d)),
	}
}

func (s *Server) listOnlineTestAttempts(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	subject, viewer, decision, ok := s.sittableSubject(ctx, w, client, r)
	if !ok {
		return
	}

	p := filter.New(r.URL.Query())
	studentID := p.UUID("student_id")
	status := p.Enum("status", func(v string) error {
		return entattempt.StatusValidator(entattempt.Status(v))
	})
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := client.ExamAttempt.Query().
		Where(append(onlineAttemptsFor(viewer, decision),
			entattempt.ExamSubjectID(subject.ID))...)
	if studentID != nil {
		q = q.Where(entattempt.StudentID(*studentID))
	}
	if status != nil {
		q = q.Where(entattempt.StatusEQ(entattempt.Status(*status)))
	}

	rows, err := q.
		Order(
			tenantent.Asc(entattempt.FieldStudentID),
			tenantent.Asc(entattempt.FieldAttemptNo),
		).
		Limit(limit).Offset(offset).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"attempts": rows,
		"count":    len(rows),
		"page":     pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) sittingStudent(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, subject *tenantent.ExamSubject, asked *uuid.UUID,
	v *access.Viewer, d authorization.Decision) (uuid.UUID, bool) {

	student := uuid.Nil
	switch {
	case asked != nil:
		student = *asked
	case len(v.StudentIDs) == 1:
		student = v.StudentIDs[0]
	case len(v.StudentIDs) > 1:
		response.Error(w, http.StatusBadRequest,
			"you hold more than one pupil record; name the student_id that is sitting this test")
		return uuid.Nil, false
	default:
		response.Error(w, http.StatusBadRequest,
			"student_id is required: you are not yourself a pupil of this school")
		return uuid.Nil, false
	}

	beyond, err := unreachableStudents(ctx, client, []uuid.UUID{student}, v, d)
	if err != nil {
		writeTenancyErr(w, err)
		return uuid.Nil, false
	}
	if len(beyond) > 0 {
		response.Error(w, http.StatusNotFound, examMarkStudentGone)
		return uuid.Nil, false
	}

	outside, err := notEnrolledInOffering(ctx, client, subject.SubjectOfferingID,
		[]uuid.UUID{student})
	if err != nil {
		writeTenancyErr(w, err)
		return uuid.Nil, false
	}
	if len(outside) > 0 {
		response.Error(w, http.StatusUnprocessableEntity,
			"that pupil is not actively enrolled in the subject this test belongs to")
		return uuid.Nil, false
	}
	return student, true
}

func (s *Server) startOnlineTestAttempt(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in onlineAttemptPayload
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}
	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	subject, err := client.ExamSubject.Query().
		Where(append(examSubjectScope(viewer, decision), entexamsubject.ID(id))...).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, examSubjectNotFound)
		return
	}

	delivery, ok := onlineDeliveryOf(ctx, w, client, subject.ID)
	if !ok {
		return
	}
	now := nowUTC()
	if !onlineTestOpen(w, delivery, now) {
		return
	}

	student, ok := s.sittingStudent(ctx, w, client, subject, in.StudentID, viewer, decision)
	if !ok {
		return
	}

	existing, err := client.ExamAttempt.Query().
		Where(entattempt.ExamSubjectID(subject.ID), entattempt.StudentID(student)).
		Order(tenantent.Desc(entattempt.FieldAttemptNo)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	for _, attempt := range existing {
		if attempt.Status == entattempt.StatusInProgress {
			response.JSON(w, http.StatusOK, response.Envelope{"attempt": attempt})
			return
		}
	}
	if len(existing) >= delivery.AttemptsAllowed {
		response.Error(w, http.StatusConflict,
			fmt.Sprintf("this test allows %d attempt(s) and that pupil has used %d",
				delivery.AttemptsAllowed, len(existing)))
		return
	}

	deadline := delivery.ClosesAt
	if delivery.DurationMinutes != nil {
		timed := now.Add(time.Duration(*delivery.DurationMinutes) * time.Minute)
		if timed.Before(deadline) {
			deadline = timed
		}
	}

	row, err := client.ExamAttempt.Create().
		SetExamSubjectID(subject.ID).
		SetStudentID(student).
		SetAttemptNo(len(existing) + 1).
		SetStartedAt(now).
		SetDeadlineAt(deadline).
		Save(ctx)
	if err != nil {
		if violates(err, onlineAttemptIndex) {
			response.Error(w, http.StatusConflict,
				"that pupil already started this attempt; reload it instead of starting another")
			return
		}
		writeTenantEntErr(w, err, onlineAttemptNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/online-test-attempts/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"attempt": row})
}

type sittableResponse struct {
	ID               uuid.UUID  `json:"id"`
	ExamQuestionID   uuid.UUID  `json:"exam_question_id"`
	SelectedOptionID *uuid.UUID `json:"selected_option_id"`
	AnswerText       *string    `json:"answer_text"`
	Marking          string     `json:"marking"`
	AwardedMarks     *float64   `json:"awarded_marks"`
}

func sittableResponsesOf(rows []*tenantent.ExamResponse) []sittableResponse {
	out := make([]sittableResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, sittableResponse{
			ID:               row.ID,
			ExamQuestionID:   row.ExamQuestionID,
			SelectedOptionID: row.SelectedOptionID,
			AnswerText:       row.AnswerText,
			Marking:          string(row.Marking),
			AwardedMarks:     row.AwardedMarks,
		})
	}
	return out
}

func (s *Server) reachableAttempt(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, r *http.Request, write bool) (*tenantent.ExamAttempt, bool) {

	id, ok := idParam(w, r, "id")
	if !ok {
		return nil, false
	}

	narrow, wide := authorization.TimetableRead, authorization.TimetableReadAll
	if write {
		narrow, wide = authorization.TimetableWrite, authorization.TimetableWriteAll
	}
	viewer, decision, err := s.scopeFor(ctx, narrow, wide)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	row, err := client.ExamAttempt.Query().
		Where(append(onlineAttemptsFor(viewer, decision), entattempt.ID(id))...).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, onlineAttemptNotFound)
		return nil, false
	}
	return row, true
}

func (s *Server) getOnlineTestAttempt(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	attempt, ok := s.reachableAttempt(ctx, w, client, r, false)
	if !ok {
		return
	}

	rows, err := client.ExamResponse.Query().
		Where(entresponse.ExamAttemptID(attempt.ID)).
		Order(tenantent.Asc(entresponse.FieldExamQuestionID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"attempt":   attempt,
		"responses": sittableResponsesOf(rows),
	})
}

func onlineAnswerShape(w http.ResponseWriter, question *tenantent.ExamQuestion,
	in onlineResponsePayload) bool {

	switch question.Kind {
	case entquestion.KindSingleChoice:
		if in.AnswerText != nil && *in.AnswerText != "" {
			response.Error(w, http.StatusUnprocessableEntity,
				fmt.Sprintf("question %d is answered by choosing an option, not by writing text",
					question.Position))
			return false
		}
		if in.SelectedOptionID == nil {
			response.Error(w, http.StatusBadRequest,
				fmt.Sprintf("question %d needs a selected_option_id", question.Position))
			return false
		}
		found := false
		for _, option := range question.Edges.Options {
			if option.ID == *in.SelectedOptionID {
				found = true
				break
			}
		}
		if !found {
			response.Error(w, http.StatusUnprocessableEntity,
				fmt.Sprintf("that option is not offered by question %d", question.Position))
			return false
		}
	case entquestion.KindFreeText:
		if in.SelectedOptionID != nil {
			response.Error(w, http.StatusUnprocessableEntity,
				fmt.Sprintf("question %d is answered in writing, not by choosing an option",
					question.Position))
			return false
		}
		if in.AnswerText == nil {
			response.Error(w, http.StatusBadRequest,
				fmt.Sprintf("question %d needs an answer_text", question.Position))
			return false
		}
		if !withinRunes(w, entresponse.FieldAnswerText, *in.AnswerText, onlineAnswerTextRunes) {
			return false
		}
	}
	return true
}

func (s *Server) saveOnlineTestResponses(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in onlineResponsesPayload
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if len(in.Responses) == 0 {
		response.Error(w, http.StatusBadRequest, "responses must carry at least one answer")
		return
	}
	if len(in.Responses) > maxOnlineResponses {
		response.Error(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("at most %d answers may be saved at once", maxOnlineResponses))
		return
	}

	attempt, ok := s.reachableAttempt(ctx, w, client, r, true)
	if !ok {
		return
	}
	if attempt.Status != entattempt.StatusInProgress {
		response.Error(w, http.StatusConflict,
			"this attempt was already handed in; its answers can no longer be changed")
		return
	}

	delivery, ok := onlineDeliveryOf(ctx, w, client, attempt.ExamSubjectID)
	if !ok {
		return
	}
	now := nowUTC()
	if now.After(attempt.DeadlineAt) && !delivery.AllowLateSubmission {
		response.Error(w, http.StatusForbidden,
			"the time on this attempt ran out at "+attempt.DeadlineAt.Format(time.RFC3339))
		return
	}

	questions, err := onlineQuestionsOf(ctx, client, attempt.ExamSubjectID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	byID := make(map[uuid.UUID]*tenantent.ExamQuestion, len(questions))
	for _, question := range questions {
		byID[question.ID] = question
	}

	seen := make(map[uuid.UUID]struct{}, len(in.Responses))
	for _, answer := range in.Responses {
		if answer.ExamQuestionID == nil {
			response.Error(w, http.StatusBadRequest, "every answer names an exam_question_id")
			return
		}
		question, known := byID[*answer.ExamQuestionID]
		if !known {
			response.Error(w, http.StatusUnprocessableEntity,
				"question "+answer.ExamQuestionID.String()+" does not belong to this test")
			return
		}
		if _, twice := seen[question.ID]; twice {
			response.Error(w, http.StatusUnprocessableEntity,
				fmt.Sprintf("question %d is answered twice in the same body", question.Position))
			return
		}
		seen[question.ID] = struct{}{}

		if !onlineAnswerShape(w, question, answer) {
			return
		}
	}

	unit, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	for _, answer := range in.Responses {
		err = unit.writer.ExamResponse.Create().
			SetExamAttemptID(attempt.ID).
			SetExamQuestionID(*answer.ExamQuestionID).
			SetNillableSelectedOptionID(answer.SelectedOptionID).
			SetNillableAnswerText(answer.AnswerText).
			OnConflictColumns(entresponse.FieldExamAttemptID, entresponse.FieldExamQuestionID).
			UpdateNewValues().
			Exec(ctx)
		if err != nil {
			break
		}
	}
	if err != nil {
		unit.rollback()
		writeTenantEntErr(w, err, onlineResponseNotFound)
		return
	}
	if err := unit.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := client.ExamResponse.Query().
		Where(entresponse.ExamAttemptID(attempt.ID)).
		Order(tenantent.Asc(entresponse.FieldExamQuestionID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"attempt":   attempt,
		"responses": sittableResponsesOf(rows),
	})
}

func autoMarkAttempt(ctx context.Context, client *tenantent.Client,
	attempt *tenantent.ExamAttempt, now time.Time) error {

	questions, err := onlineQuestionsOf(ctx, client, attempt.ExamSubjectID)
	if err != nil {
		return err
	}
	correct := make(map[uuid.UUID]uuid.UUID, len(questions))
	kinds := make(map[uuid.UUID]*tenantent.ExamQuestion, len(questions))
	for _, question := range questions {
		kinds[question.ID] = question
		for _, option := range question.Edges.Options {
			if option.IsCorrect {
				correct[question.ID] = option.ID
			}
		}
	}

	rows, err := client.ExamResponse.Query().
		Where(entresponse.ExamAttemptID(attempt.ID)).
		All(ctx)
	if err != nil {
		return err
	}

	for _, row := range rows {
		question, known := kinds[row.ExamQuestionID]
		if !known {
			continue
		}

		update := client.ExamResponse.UpdateOne(row)
		switch question.Kind {
		case entquestion.KindSingleChoice:
			award := 0.0
			if row.SelectedOptionID != nil && *row.SelectedOptionID == correct[question.ID] {
				award = question.Marks
			}
			update = update.
				SetMarking(entresponse.MarkingAutomatic).
				SetAwardedMarks(award).
				ClearMarkedBy().
				SetMarkedAt(now)
		case entquestion.KindFreeText:
			if row.AnswerText != nil && *row.AnswerText != "" {
				continue
			}
			update = update.
				SetMarking(entresponse.MarkingAutomatic).
				SetAwardedMarks(0).
				ClearMarkedBy().
				SetMarkedAt(now)
		}

		if _, err := update.Save(ctx); err != nil {
			return err
		}
	}
	return nil
}

func tallyAttempt(ctx context.Context, client *tenantent.Client,
	attempt *tenantent.ExamAttempt) (float64, int, error) {

	rows, err := client.ExamResponse.Query().
		Where(entresponse.ExamAttemptID(attempt.ID)).
		All(ctx)
	if err != nil {
		return 0, 0, err
	}

	total, pending := 0.0, 0
	for _, row := range rows {
		if row.Marking == entresponse.MarkingUnmarked {
			pending++
			continue
		}
		if row.AwardedMarks != nil {
			total += *row.AwardedMarks
		}
	}
	return total, pending, nil
}

func (s *Server) submitOnlineTestAttempt(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	attempt, ok := s.reachableAttempt(ctx, w, client, r, true)
	if !ok {
		return
	}
	if attempt.Status != entattempt.StatusInProgress {
		response.Error(w, http.StatusConflict, "this attempt was already handed in")
		return
	}

	delivery, ok := onlineDeliveryOf(ctx, w, client, attempt.ExamSubjectID)
	if !ok {
		return
	}

	now := nowUTC()
	late := now.After(attempt.DeadlineAt)
	if late && !delivery.AllowLateSubmission {
		response.Error(w, http.StatusUnprocessableEntity,
			"this attempt ran out of time at "+attempt.DeadlineAt.Format(time.RFC3339)+
				" and late submission is not allowed; the answers already saved will still be marked")
		return
	}

	if err := autoMarkAttempt(ctx, client, attempt, now); err != nil {
		writeTenantEntErr(w, err, onlineAttemptNotFound)
		return
	}
	total, pending, err := tallyAttempt(ctx, client, attempt)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	status := entattempt.StatusSubmitted
	if late {
		status = entattempt.StatusExpired
	}

	row, err := client.ExamAttempt.UpdateOne(attempt).
		SetStatus(status).
		SetSubmittedAt(now).
		SetSubmittedLate(late).
		SetAwaitingReview(pending > 0).
		SetAwardedMarks(total).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, onlineAttemptNotFound)
		return
	}

	mark, err := settleOnlineExamMark(ctx, client, attempt.ExamSubjectID, attempt.StudentID, now)
	if err != nil {
		writeTenantEntErr(w, err, examMarkNotFound)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"attempt":         row,
		"awaiting_review": pending,
		"exam_mark":       mark,
	})
}

type onlineStanding struct {
	best    *tenantent.ExamAttempt
	pending *tenantent.ExamAttempt
}

func onlineStandingOf(ctx context.Context, client *tenantent.Client,
	subjectID, studentID uuid.UUID) (onlineStanding, error) {

	rows, err := client.ExamAttempt.Query().
		Where(
			entattempt.ExamSubjectID(subjectID),
			entattempt.StudentID(studentID),
			entattempt.StatusNEQ(entattempt.StatusInProgress),
		).
		Order(tenantent.Asc(entattempt.FieldAttemptNo)).
		All(ctx)
	if err != nil {
		return onlineStanding{}, err
	}

	var standing onlineStanding
	for _, row := range rows {
		if row.AwaitingReview && standing.pending == nil {
			standing.pending = row
		}
		if standing.best == nil || onlineAttemptMarks(row) > onlineAttemptMarks(standing.best) {
			standing.best = row
		}
	}
	return standing, nil
}

func onlineAttemptMarks(row *tenantent.ExamAttempt) float64 {
	if row == nil || row.AwardedMarks == nil {
		return 0
	}
	return *row.AwardedMarks
}

func onlineMarkRemark(ctx context.Context, client *tenantent.Client,
	standing onlineStanding) (*string, error) {

	if standing.pending == nil {
		return nil, nil
	}
	_, pending, err := tallyAttempt(ctx, client, standing.pending)
	if err != nil {
		return nil, err
	}
	text := fmt.Sprintf("taken from online attempt %d; %d answer(s) of attempt %d still await a "+
		"teacher, so this mark is provisional",
		standing.best.AttemptNo, pending, standing.pending.AttemptNo)
	return &text, nil
}

func settleOnlineExamMark(ctx context.Context, client *tenantent.Client,
	subjectID, studentID uuid.UUID, now time.Time) (*tenantent.StudentExamMark, error) {

	standing, err := onlineStandingOf(ctx, client, subjectID, studentID)
	if err != nil {
		return nil, err
	}
	if standing.best == nil {
		return nil, nil
	}

	remark, err := onlineMarkRemark(ctx, client, standing)
	if err != nil {
		return nil, err
	}
	provisional := standing.pending != nil

	current, err := client.StudentExamMark.Query().
		Where(entexammark.ExamSubjectID(subjectID), entexammark.StudentID(studentID)).
		Only(ctx)
	if err != nil && !tenantent.IsNotFound(err) {
		return nil, err
	}

	if current == nil {
		return client.StudentExamMark.Create().
			SetExamSubjectID(subjectID).
			SetStudentID(studentID).
			SetStatus(entexammark.StatusMarked).
			SetMarksObtained(onlineAttemptMarks(standing.best)).
			SetProvisional(provisional).
			SetNillableRemarks(remark).
			SetMarkedAt(now).
			Save(ctx)
	}

	update := client.StudentExamMark.UpdateOne(current).
		SetStatus(entexammark.StatusMarked).
		SetMarksObtained(onlineAttemptMarks(standing.best)).
		SetProvisional(provisional).
		ClearMarkedBy().
		SetMarkedAt(now)
	if remark == nil {
		update = update.ClearRemarks()
	} else {
		update = update.SetRemarks(*remark)
	}
	return update.Save(ctx)
}

func (s *Server) awardOnlineTestResponse(w http.ResponseWriter, r *http.Request) {
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

	var in onlineAwardPayload
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if in.AwardedMarks == nil {
		response.Error(w, http.StatusBadRequest, "awarded_marks is required")
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.ExamResponse.Query().
		Where(entresponse.ID(id),
			entresponse.HasQuestionWith(
				entquestion.HasExamSubjectWith(markableExamSubjects(viewer, decision)))).
		WithQuestion().
		WithAttempt().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, onlineResponseNotFound)
		return
	}
	if current.Edges.Question == nil || current.Edges.Attempt == nil {
		response.Error(w, http.StatusNotFound, onlineResponseNotFound)
		return
	}
	if current.Edges.Attempt.Status == entattempt.StatusInProgress {
		response.Error(w, http.StatusConflict,
			"this attempt has not been handed in yet; there is nothing settled to mark")
		return
	}

	if *in.AwardedMarks < 0 {
		response.Error(w, http.StatusBadRequest, "awarded_marks must not be negative")
		return
	}
	if *in.AwardedMarks > current.Edges.Question.Marks {
		response.Error(w, http.StatusUnprocessableEntity,
			"awarded_marks must not exceed the "+marks(current.Edges.Question.Marks)+
				" this question carries")
		return
	}

	now := nowUTC()
	if _, err := client.ExamResponse.UpdateOne(current).
		SetMarking(entresponse.MarkingManual).
		SetAwardedMarks(*in.AwardedMarks).
		SetNillableMarkedBy(viewer.PersonID).
		SetMarkedAt(now).
		Save(ctx); err != nil {
		writeTenantEntErr(w, err, onlineResponseNotFound)
		return
	}

	attempt := current.Edges.Attempt
	total, pending, err := tallyAttempt(ctx, client, attempt)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.ExamAttempt.UpdateOne(attempt).
		SetAwardedMarks(total).
		SetAwaitingReview(pending > 0).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, onlineAttemptNotFound)
		return
	}

	mark, err := settleOnlineExamMark(ctx, client, attempt.ExamSubjectID, attempt.StudentID, now)
	if err != nil {
		writeTenantEntErr(w, err, examMarkNotFound)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"attempt":         row,
		"awaiting_review": pending,
		"exam_mark":       mark,
	})
}
