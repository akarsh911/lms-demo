package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entmastery "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/conceptmastery"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mindmap"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	MasteryRecordedHeader = "X-Mastery-Recorded"

	MaxMasteryMarks       = 500
	MaxMasterySectionRows = 5000

	maxMasteryNodeLength = 255
	masteryBatch         = 500

	masteryStudentParam    = "student_id"
	masteryStudentNotFound = "student not found"
)

var masteryRowFields = []string{entmastery.FieldNodeID, entmastery.FieldState}

var masteryKey = []string{
	entmastery.FieldStudentID,
	entmastery.FieldAcademicSessionID,
	entmastery.FieldContentItemID,
	entmastery.FieldNodeID,
}

var masteryStructures *mindmap.Structures

func UseMasteryStructures(s *mindmap.Structures) { masteryStructures = s }

type masterySeat struct {
	student uuid.UUID
	session uuid.UUID
}

type masteryAnswer struct {
	student *uuid.UUID
	tracked bool
	states  map[string]string
}

type masteryWriter struct {
	viewer   *access.Viewer
	decision authorization.Decision
	seat     *masterySeat
}

type masteryTarget struct {
	seat      masterySeat
	item      uuid.UUID
	section   string
	structure mindmap.Structure
}

type masteryScore struct {
	node  string
	state entmastery.State
	score float64
}

type masteryPayload struct {
	States map[string]string `json:"states"`
}

func writeMastery(w http.ResponseWriter, item uuid.UUID, section string, answer masteryAnswer) {
	states := answer.states
	if states == nil {
		states = map[string]string{}
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"section_id":      section,
		"content_item_id": item,
		"student_id":      answer.student,
		"tracked":         answer.tracked,
		"states":          states,
	})
}

func parseMasteryQuery(values url.Values) (*uuid.UUID, error) {
	p := filter.New(values)
	asked := p.UUID(masteryStudentParam)
	if err := p.Err(); err != nil {
		return nil, err
	}
	return asked, nil
}

func masterySeatOf(ctx context.Context, client *tenantent.Client,
	learners predicate.Student) (*masterySeat, error) {

	row, err := client.StudentEnrollment.Query().
		Where(
			entenrollment.HasStudentWith(learners),
			entenrollment.StatusEQ(entenrollment.StatusActive),
			entenrollment.HasAcademicSessionWith(entsession.IsCurrent(true)),
		).
		Order(tenantent.Asc(entenrollment.FieldCreatedAt), tenantent.Asc(entenrollment.FieldID)).
		First(ctx)
	if tenantent.IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &masterySeat{student: row.StudentID, session: row.AcademicSessionID}, nil
}

func masteryStatesOf(rows []*tenantent.ConceptMastery) map[string]string {
	states := make(map[string]string, len(rows))
	for _, row := range rows {
		states[row.NodeID] = string(row.State)
	}
	return states
}

func masteryRowsOf(seat masterySeat, item uuid.UUID, section string) predicate.ConceptMastery {
	return entmastery.And(
		entmastery.StudentID(seat.student),
		entmastery.AcademicSessionID(seat.session),
		entmastery.ContentItemID(item),
		entmastery.EngineSectionID(section),
	)
}

func requireMasteryFields(w http.ResponseWriter, r *http.Request, d authorization.Decision,
	entity authorization.Entity) bool {

	denied := d.Fields.Denied(entmastery.Columns, masteryRowFields)
	if len(denied) == 0 {
		return true
	}

	observability.Decision(r.Context(), false, "concept mastery refused on fields",
		"denied", denied, "rule", d.Rule)
	response.Error(w, http.StatusForbidden,
		"a mastery state is a node and its state together, so one without the other says nothing; "+
			"your field policy on "+string(entity)+" denies "+strings.Join(denied, ", "))
	return false
}

func masteryReaders(v *access.Viewer, d authorization.Decision, asked *uuid.UUID) predicate.Student {
	reachable := access.StudentsForAcademic(v, d)
	if asked == nil {
		return entstudent.And(access.StudentsSelf(v), reachable)
	}
	return entstudent.And(entstudent.ID(*asked), reachable)
}

func (s *Server) masteryRead(w http.ResponseWriter, r *http.Request,
	asked *uuid.UUID) (masteryAnswer, bool) {

	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return masteryAnswer{}, false
	}
	item, ok := idParam(w, r, mindmapItemParam)
	if !ok {
		return masteryAnswer{}, false
	}
	section, ok := mindmapPathParam(w, r, mindmapSectionParam)
	if !ok {
		return masteryAnswer{}, false
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.ConceptMasteryRead, authorization.ConceptMasteryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return masteryAnswer{}, false
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"reading mastery requires "+string(authorization.ConceptMasteryRead))
		return masteryAnswer{}, false
	}
	if !requireMasteryFields(w, r, decision, authorization.ConceptMasteryRead) {
		return masteryAnswer{}, false
	}

	learners := masteryReaders(viewer, decision, asked)
	if asked != nil {
		reachable, err := client.Student.Query().Where(learners).Exist(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return masteryAnswer{}, false
		}
		if !reachable {
			observability.Decision(ctx, false, "concept mastery refused: the pupil is beyond this caller",
				"student", *asked)
			response.Error(w, http.StatusNotFound, masteryStudentNotFound)
			return masteryAnswer{}, false
		}
	}

	seat, err := masterySeatOf(ctx, client, learners)
	if err != nil {
		writeTenancyErr(w, err)
		return masteryAnswer{}, false
	}
	if seat == nil {
		return masteryAnswer{student: asked}, true
	}

	rows, err := client.ConceptMastery.Query().
		Where(access.ConceptMasteryFor(viewer, decision), masteryRowsOf(*seat, item, section)).
		Limit(MaxMasterySectionRows).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return masteryAnswer{}, false
	}
	return masteryAnswer{student: &seat.student, tracked: true, states: masteryStatesOf(rows)}, true
}

func (s *Server) getMindmapMastery(w http.ResponseWriter, r *http.Request) {
	if !s.mindmapsOn(w) {
		return
	}
	asked, err := parseMasteryQuery(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	answer, ok := s.masteryRead(w, r, asked)
	if !ok {
		return
	}
	book, section, ok := s.mindmapChapterFor(w, r)
	if !ok {
		return
	}
	writeMastery(w, book.item, section, answer)
}

func (s *Server) masteryWriterFor(ctx context.Context) (*masteryWriter, error) {
	subject, err := authorization.SubjectFrom(ctx)
	if err != nil {
		return nil, err
	}
	decision, err := s.guard.Allow(ctx, subject, authorization.ConceptMasteryWrite, nil)
	if err != nil {
		return nil, err
	}
	if !decision.Allowed || len(decision.Fields.Denied(entmastery.Columns, masteryRowFields)) > 0 {
		return nil, nil
	}

	client, err := tenantClient(ctx)
	if err != nil {
		return nil, err
	}
	viewer, err := access.Resolve(ctx, subject, false)
	if err != nil {
		return nil, err
	}
	seat, err := masterySeatOf(ctx, client, access.MasteryLearners(viewer, decision))
	if err != nil {
		return nil, err
	}

	observability.Step(ctx, observability.ComponentAuthz, "mastery writer resolved",
		"entity", string(authorization.ConceptMasteryWrite),
		"own_student_records", len(viewer.StudentIDs), "tracked", seat != nil)
	return &masteryWriter{viewer: viewer, decision: decision, seat: seat}, nil
}

func decodeMasteryMarks(w http.ResponseWriter, r *http.Request) ([]string, bool) {
	var in masteryPayload
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return nil, false
	}
	if in.States == nil {
		response.Error(w, http.StatusBadRequest,
			`states is required: an object of node id to "read"`)
		return nil, false
	}
	if len(in.States) > MaxMasteryMarks {
		response.Error(w, http.StatusBadRequest,
			"states carries "+strconv.Itoa(len(in.States))+" nodes and one request may mark at most "+
				strconv.Itoa(MaxMasteryMarks))
		return nil, false
	}

	nodes := make([]string, 0, len(in.States))
	for node, state := range in.States {
		if strings.TrimSpace(node) == "" || len(node) > maxMasteryNodeLength {
			response.Error(w, http.StatusBadRequest,
				"states names a node id that is empty or longer than "+
					strconv.Itoa(maxMasteryNodeLength)+" characters")
			return nil, false
		}
		if state != string(entmastery.StateRead) {
			response.Error(w, http.StatusUnprocessableEntity,
				"a client may set only read; missed, shaky and known are recorded by the server "+
					"from a graded drill, and "+strconv.Quote(node)+" asked for "+strconv.Quote(state))
			return nil, false
		}
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)
	return nodes, true
}

func (s *Server) masteryMarker(w http.ResponseWriter, r *http.Request) (*masteryWriter, bool) {
	ctx, cancel := timeout(r)
	defer cancel()

	writer, err := s.masteryWriterFor(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	if writer == nil {
		response.Error(w, http.StatusForbidden,
			"recording mastery requires "+string(authorization.ConceptMasteryWrite)+
				" with "+strings.Join(masteryRowFields, " and ")+" permitted")
		return nil, false
	}
	if writer.seat == nil {
		return writer, true
	}

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	item, ok := idParam(w, r, mindmapItemParam)
	if !ok {
		return nil, false
	}
	section, ok := mindmapPathParam(w, r, mindmapSectionParam)
	if !ok {
		return nil, false
	}

	held, err := client.ConceptMastery.Query().
		Where(masteryRowsOf(*writer.seat, item, section)).
		Count(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	if held >= MaxMasterySectionRows {
		response.Error(w, http.StatusUnprocessableEntity,
			"this chapter already holds "+strconv.Itoa(held)+" mastery rows for this pupil, which "+
				"is more nodes than a chapter has; nothing was recorded")
		return nil, false
	}
	return writer, true
}

func (s *Server) putMindmapMastery(w http.ResponseWriter, r *http.Request) {
	if !s.mindmapsOn(w) {
		return
	}
	if !refuseMindmapQuery(w, r.URL.Query()) {
		return
	}
	nodes, ok := decodeMasteryMarks(w, r)
	if !ok {
		return
	}

	writer, ok := s.masteryMarker(w, r)
	if !ok {
		return
	}
	book, section, ok := s.mindmapChapterFor(w, r)
	if !ok {
		return
	}
	if writer.seat == nil {
		writeMastery(w, book.item, section, masteryAnswer{})
		return
	}

	target := masteryTarget{seat: *writer.seat, item: book.item, section: section}
	if len(nodes) > 0 {
		target.structure = masteryStructures.Of(r.Context(), book.caller.Tenant, book.document)
	}

	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if err := storeMasteryReads(ctx, client, target, nodes); err != nil {
		writeTenantEntErr(w, err, "library item not found")
		return
	}

	rows, err := client.ConceptMastery.Query().
		Where(
			access.ConceptMasteryWritableBy(writer.viewer, writer.decision),
			masteryRowsOf(target.seat, target.item, target.section),
		).
		Limit(MaxMasterySectionRows).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	writeMastery(w, book.item, section, masteryAnswer{
		student: &target.seat.student,
		tracked: true,
		states:  masteryStatesOf(rows),
	})
}

func (s *Server) masteryGrader(w http.ResponseWriter, r *http.Request) (*masterySeat, bool) {
	ctx, cancel := timeout(r)
	defer cancel()

	writer, err := s.masteryWriterFor(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	if writer == nil {
		return nil, true
	}
	return writer.seat, true
}

func masteryStateOf(score float64) entmastery.State {
	switch {
	case score >= 1:
		return entmastery.StateKnown
	case score > 0:
		return entmastery.StateShaky
	default:
		return entmastery.StateMissed
	}
}

type gradedAnswer struct {
	NodeID  string  `json:"node_id"`
	Verdict string  `json:"verdict"`
	Given   *string `json:"given"`
}

func (a gradedAnswer) answered() bool {
	return a.Given != nil && strings.TrimSpace(*a.Given) != ""
}

type masteryAttempt struct {
	verdict string
	skipped bool
}

func masteryAttemptsOf(answers []gradedAnswer) map[string]masteryAttempt {
	attempts := map[string]masteryAttempt{}
	blanks := map[string]bool{}
	for _, answer := range answers {
		if !answer.answered() {
			blanks[answer.NodeID] = true
			continue
		}
		attempts[answer.NodeID] = masteryAttempt{verdict: answer.Verdict}
	}
	for node, attempt := range attempts {
		attempt.skipped = blanks[node]
		attempts[node] = attempt
	}
	return attempts
}

func verdictScore(verdict string) (float64, bool) {
	switch verdict {
	case "correct":
		return 1, true
	case "partial":
		return 0.5, true
	case "incorrect":
		return 0, true
	}
	return 0, false
}

func (a masteryAttempt) scored(upstream float64) (float64, bool) {
	if !a.skipped {
		return upstream, true
	}
	return verdictScore(a.verdict)
}

func masteryScoresOf(graded []byte) []masteryScore {
	var body struct {
		NodeScores map[string]*float64 `json:"node_scores"`
		Results    []gradedAnswer      `json:"results"`
	}
	if err := json.Unmarshal(graded, &body); err != nil {
		return nil
	}
	attempts := masteryAttemptsOf(body.Results)

	scores := make([]masteryScore, 0, len(body.NodeScores))
	for node, upstream := range body.NodeScores {
		attempt, answered := attempts[node]
		if !answered || upstream == nil || strings.TrimSpace(node) == "" || len(node) > maxMasteryNodeLength {
			continue
		}
		score, known := attempt.scored(*upstream)
		if !known {
			continue
		}
		scores = append(scores, masteryScore{
			node:  node,
			state: masteryStateOf(score),
			score: min(max(score, 0), 1),
		})
	}
	sort.Slice(scores, func(i, j int) bool { return scores[i].node < scores[j].node })
	return scores
}

func (s *Server) recordMindmapGrade(w http.ResponseWriter, r *http.Request, book mindmapBook,
	section string, seat masterySeat, graded []byte) {

	scores := masteryScoresOf(graded)
	if len(scores) == 0 {
		return
	}

	target := masteryTarget{
		seat:      seat,
		item:      book.item,
		section:   section,
		structure: masteryStructures.Of(r.Context(), book.caller.Tenant, book.document),
	}

	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err == nil {
		err = storeMasteryGrades(ctx, client, target, scores, time.Now())
	}
	if err != nil {
		observability.Problem(ctx, observability.ComponentData,
			"a drill was graded and its result could not be recorded as mastery; the grade is "+
				"still answered, and grading the same attempt again records it", err,
			"content_item", book.item, "section", section, "nodes", len(scores))
		w.Header().Set(MasteryRecordedHeader, "false")
		return
	}

	observability.Step(ctx, observability.ComponentData, "drill result recorded as mastery",
		"content_item", book.item, "section", section, "nodes", len(scores),
		"structure_known", target.structure.Known())
	w.Header().Set(MasteryRecordedHeader, "true")
}

func (t masteryTarget) row(client *tenantent.Client, node string) *tenantent.ConceptMasteryCreate {
	row := client.ConceptMastery.Create().
		SetStudentID(t.seat.student).
		SetAcademicSessionID(t.seat.session).
		SetContentItemID(t.item).
		SetEngineSectionID(t.section).
		SetNodeID(node)
	if t.structure.Known() {
		row = row.
			SetStructureDigest(t.structure.Digest).
			SetNillableStructureChunks(t.structure.Chunks)
	}
	return row
}

func storeMasteryReads(ctx context.Context, client *tenantent.Client, target masteryTarget,
	nodes []string) error {

	for start := 0; start < len(nodes); start += masteryBatch {
		batch := nodes[start:min(start+masteryBatch, len(nodes))]

		rows := make([]*tenantent.ConceptMasteryCreate, 0, len(batch))
		for _, node := range batch {
			rows = append(rows, target.row(client, node).SetState(entmastery.StateRead))
		}
		err := client.ConceptMastery.CreateBulk(rows...).
			OnConflict(sql.ConflictColumns(masteryKey...), sql.DoNothing()).
			Exec(ctx)
		if err != nil {
			return err
		}
	}
	return nil
}

func storeMasteryGrades(ctx context.Context, client *tenantent.Client, target masteryTarget,
	scores []masteryScore, at time.Time) error {

	for start := 0; start < len(scores); start += masteryBatch {
		batch := scores[start:min(start+masteryBatch, len(scores))]

		rows := make([]*tenantent.ConceptMasteryCreate, 0, len(batch))
		for _, score := range batch {
			rows = append(rows, target.row(client, score.node).
				SetState(score.state).
				SetScore(score.score).
				SetAttempts(1).
				SetLastAttemptAt(at))
		}
		err := client.ConceptMastery.CreateBulk(rows...).
			OnConflict(sql.ConflictColumns(masteryKey...), sql.ResolveWith(raiseMastery)).
			Exec(ctx)
		if err != nil {
			return err
		}
	}
	return nil
}

func masteryRank(column string) string {
	return "CASE " + column +
		" WHEN 'read' THEN 0 WHEN 'missed' THEN 1 WHEN 'shaky' THEN 2 WHEN 'known' THEN 3 ELSE -1 END"
}

func raiseMastery(u *sql.UpdateSet) {
	stored := u.Table().C(entmastery.FieldState)
	offered := sql.Dialect(dialect.Postgres).Table("excluded").C(entmastery.FieldState)

	u.Set(entmastery.FieldState, sql.Expr(
		"CASE WHEN "+masteryRank(offered)+" > "+masteryRank(stored)+
			" THEN "+offered+" ELSE "+stored+" END"))
	u.Add(entmastery.FieldAttempts, 1)
	for _, column := range []string{
		entmastery.FieldScore,
		entmastery.FieldLastAttemptAt,
		entmastery.FieldEngineSectionID,
		entmastery.FieldStructureDigest,
		entmastery.FieldStructureChunks,
		entmastery.FieldUpdatedAt,
	} {
		u.SetExcluded(column)
	}
}
