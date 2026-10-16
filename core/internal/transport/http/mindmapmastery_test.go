package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entmastery "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/conceptmastery"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mindmap"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type masteryGrants map[authorization.Entity]authorization.Decision

func (g masteryGrants) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	return g[entity], nil
}

func (masteryGrants) Name() string { return "mastery test grants" }

func granted() authorization.Decision { return authorization.Decision{Allowed: true} }

func reaching(reach authorization.Reach) authorization.Decision {
	return authorization.Decision{Allowed: true, Reach: reach, HasReach: true}
}

func (g masteryGrants) without(entities ...authorization.Entity) masteryGrants {
	out := masteryGrants{}
	for entity, decision := range g {
		out[entity] = decision
	}
	for _, entity := range entities {
		delete(out, entity)
	}
	return out
}

func pupilGrants() masteryGrants {
	return masteryGrants{
		authorization.MindmapsRead:        granted(),
		authorization.LibraryRead:         granted(),
		authorization.ConceptMasteryRead:  reaching(authorization.ReachSelf),
		authorization.ConceptMasteryWrite: reaching(authorization.ReachSelf),
	}
}

func readerGrants(reach authorization.Reach) masteryGrants {
	return masteryGrants{
		authorization.MindmapsRead:        granted(),
		authorization.LibraryRead:         granted(),
		authorization.ConceptMasteryRead:  reaching(reach),
		authorization.ConceptMasteryWrite: reaching(authorization.ReachSelf),
	}
}

func headGrants() masteryGrants {
	return masteryGrants{
		authorization.MindmapsRead:          granted(),
		authorization.LibraryRead:           granted(),
		authorization.LibraryReadAll:        granted(),
		authorization.ConceptMasteryRead:    granted(),
		authorization.ConceptMasteryReadAll: granted(),
	}
}

type masteryWorld struct {
	*mindmapWorld

	classmate    uuid.UUID
	classmateCAS uuid.UUID
	outsider     uuid.UUID
	guardianCAS  uuid.UUID
	strangerCAS  uuid.UUID
	teacherCAS   uuid.UUID
	headCAS      uuid.UUID

	callBegan atomic.Int64
}

func (w *masteryWorld) call(c mindmapCall, item uuid.UUID, section string) *httptest.ResponseRecorder {
	w.t.Helper()

	w.callBegan.Store(int64(len(w.db.Statements())))
	return w.mindmapWorld.call(c, item, section)
}

func newMasteryWorld(t *testing.T) *masteryWorld {
	t.Helper()

	base := newMindmapWorld(t)
	ctx := context.Background()
	client := base.db.Client
	tag := uuid.NewString()[:8]
	today := time.Now().UTC()

	person := func(name string) (uuid.UUID, uuid.UUID) {
		cas := uuid.New()
		row := client.Person.Create().
			SetCasUserID(cas).
			SetFirstName("Mastery").
			SetDisplayName("Mastery " + name + " " + tag).
			SaveX(ctx)
		return row.ID, cas
	}
	enrolled := func(name string, section, offering uuid.UUID) (uuid.UUID, uuid.UUID) {
		who, cas := person(name)
		student := client.Student.Create().
			SetPersonID(who).
			SetAdmissionNumber("MAS-" + name + "-" + tag).
			SaveX(ctx)
		enrollment := client.StudentEnrollment.Create().
			SetStudentID(student.ID).
			SetAcademicSessionID(base.session).
			SetSectionID(section).
			SetEnrollmentDate(today).
			SaveX(ctx)
		client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrollment.ID).
			SetSubjectOfferingID(offering).
			SetStudentID(student.ID).
			SetAcademicSessionID(base.session).
			SaveX(ctx)
		return student.ID, cas
	}

	branch := client.Branch.Create().
		SetName("Mastery Branch " + tag).
		SetCode("MAB-" + tag).
		SaveX(ctx)
	elsewhere := client.Section.Create().
		SetAcademicSessionID(base.session).
		SetBranchID(branch.ID).
		SetGradeLevelID(base.grade).
		SetName("Z").
		SetCode("MAZ-" + tag).
		SaveX(ctx)
	otherOffering := client.SubjectOffering.Create().
		SetAcademicSessionID(base.session).
		SetSectionID(elsewhere.ID).
		SetSubjectID(base.subject).
		SaveX(ctx)

	world := &masteryWorld{mindmapWorld: base}
	world.classmate, world.classmateCAS = enrolled("Classmate", base.sectionA, base.offeringA)
	world.outsider, _ = enrolled("Outsider", elsewhere.ID, otherOffering.ID)

	parent, guardianCAS := person("Guardian")
	guardian := client.Guardian.Create().SetPersonID(parent).SaveX(ctx)
	client.StudentGuardian.Create().
		SetStudentID(base.pupil).
		SetGuardianID(guardian.ID).
		SetRelationshipType("mother").
		SaveX(ctx)
	world.guardianCAS = guardianCAS

	blind, strangerCAS := person("Stranger")
	unseeing := client.Guardian.Create().SetPersonID(blind).SaveX(ctx)
	client.StudentGuardian.Create().
		SetStudentID(base.pupil).
		SetGuardianID(unseeing.ID).
		SetRelationshipType("uncle").
		SetCanViewAcademic(false).
		SaveX(ctx)
	world.strangerCAS = strangerCAS

	tutor, teacherCAS := person("Teacher")
	staff := client.Staff.Create().
		SetPersonID(tutor).
		SetEmployeeCode("MAE-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(base.session).
		SetTeacherID(teacher.ID).
		SetSectionID(base.sectionA).
		SetSubjectOfferingID(base.offeringA).
		SetRoleType("subject_teacher").
		SaveX(ctx)
	world.teacherCAS = teacherCAS

	_, world.headCAS = person("Head")

	world.as(base.pupilCAS, pupilGrants())
	base.db.Forget()
	return world
}

func (w *masteryWorld) as(cas uuid.UUID, grants masteryGrants) {
	w.asBearing(cas, grants, mindmapToken)
}

func (w *masteryWorld) asBearing(cas uuid.UUID, grants masteryGrants, token string) {
	w.ctx = authorization.WithSubject(w.ctx,
		&authorization.Subject{CASUserID: cas, RawToken: token})
	w.server.guard = grants
}

type masteryBody struct {
	SectionID     string            `json:"section_id"`
	ContentItemID string            `json:"content_item_id"`
	StudentID     *string           `json:"student_id"`
	Tracked       bool              `json:"tracked"`
	States        map[string]string `json:"states"`
}

func masteryGet(query string) mindmapCall {
	return mindmapCall{
		name:    "mastery",
		handler: func(s *Server) http.HandlerFunc { return s.getMindmapMastery },
		method:  http.MethodGet,
		suffix:  "/mastery" + query,
	}
}

func masteryPut(body string) mindmapCall {
	return mindmapCall{
		name:    "mark",
		handler: func(s *Server) http.HandlerFunc { return s.putMindmapMastery },
		method:  http.MethodPut,
		suffix:  "/mastery",
		body:    body,
	}
}

func masteryGrade() mindmapCall { return mindmapChapterCalls()[4] }

type gradedItem struct {
	node    string
	verdict string
	given   string
}

func answered(node string, score float64) gradedItem {
	verdict := "incorrect"
	switch {
	case score >= 1:
		verdict = "correct"
	case score > 0:
		verdict = "partial"
	}
	return gradedItem{node: node, verdict: verdict, given: "an answer the pupil typed"}
}

func skipped(node string) gradedItem {
	return gradedItem{node: node, verdict: "incorrect"}
}

type gradedCitation struct {
	Page       int      `json:"page"`
	BlockRefs  []string `json:"block_refs"`
	MatchRatio float64  `json:"match_ratio"`
	DocumentID string   `json:"document_id"`
	SectionID  string   `json:"section_id"`
}

type gradedLine struct {
	ItemID     string         `json:"item_id"`
	NodeID     string         `json:"node_id"`
	Verdict    string         `json:"verdict"`
	Similarity float64        `json:"similarity"`
	Given      string         `json:"given"`
	Expected   string         `json:"expected"`
	Citation   gradedCitation `json:"citation"`
	Evidence   string         `json:"evidence"`
}

type gradedDrill struct {
	SectionID    string             `json:"section_id"`
	Kind         string             `json:"kind"`
	Scored       int                `json:"scored"`
	Correct      int                `json:"correct"`
	Partial      int                `json:"partial"`
	Incorrect    int                `json:"incorrect"`
	Score        float64            `json:"score"`
	Results      []gradedLine       `json:"results"`
	NodeScores   map[string]float64 `json:"node_scores"`
	GradingBasis string             `json:"grading_basis"`
}

func gradedWith(items ...gradedItem) string {
	drill := gradedDrill{
		SectionID:    mindmapOwnSection,
		Kind:         "label",
		Scored:       len(items),
		Results:      []gradedLine{},
		NodeScores:   map[string]float64{},
		GradingBasis: "Deterministic string comparison, NO MODEL.",
	}
	worth := map[string]float64{"correct": 1, "partial": 0.5, "incorrect": 0}

	total := 0.0
	for i, item := range items {
		switch item.verdict {
		case "correct":
			drill.Correct++
		case "partial":
			drill.Partial++
		default:
			drill.Incorrect++
		}
		total += worth[item.verdict]
		drill.NodeScores[item.node] = worth[item.verdict]
		drill.Results = append(drill.Results, gradedLine{
			ItemID:     "itm_" + strconv.Itoa(i),
			NodeID:     item.node,
			Verdict:    item.verdict,
			Similarity: worth[item.verdict],
			Given:      item.given,
			Expected:   "Nephron",
			Citation: gradedCitation{
				Page:       4,
				BlockRefs:  []string{"doc_611325dd46a9_b4"},
				MatchRatio: 0.95,
				DocumentID: "doc_611325dd46a9",
				SectionID:  mindmapOwnSection,
			},
			Evidence: "The nephron is the filtration unit of the kidney.",
		})
	}
	if len(items) > 0 {
		drill.Score = total / float64(len(items))
	}

	raw, err := json.Marshal(drill)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func gradedAs(scores string) string {
	var byNode map[string]float64
	if err := json.Unmarshal([]byte(scores), &byNode); err != nil {
		panic(err)
	}
	nodes := make([]string, 0, len(byNode))
	for node := range byNode {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)

	items := make([]gradedItem, 0, len(nodes))
	for _, node := range nodes {
		items = append(items, answered(node, byNode[node]))
	}
	return gradedWith(items...)
}

func realGrade(t *testing.T, name string) []byte {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("testdata", "mindmap", name))
	if err != nil {
		t.Fatalf("the captured grade %s is missing: %v", name, err)
	}
	return raw
}

func (w *masteryWorld) mastery(t *testing.T, c mindmapCall) masteryBody {
	t.Helper()

	rec := w.call(c, w.mine, mindmapOwnSection)
	if rec.Code != http.StatusOK {
		t.Fatalf("%s: want 200, got %d: %s", c.name, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	var body masteryBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("%s: the answer is not the mastery shape: %v (%s)", c.name, err, rec.Body.String())
	}
	if body.States == nil {
		t.Fatalf("%s: states must be an object even when it is empty: %s", c.name, rec.Body.String())
	}
	if body.SectionID != mindmapOwnSection || body.ContentItemID != w.mine.String() {
		t.Fatalf("%s: the answer names the wrong chapter or book: %s", c.name, rec.Body.String())
	}
	return body
}

func (w *masteryWorld) grades(t *testing.T, scores string) *httptest.ResponseRecorder {
	t.Helper()

	return w.graded(t, gradedAs(scores))
}

func (w *masteryWorld) graded(t *testing.T, upstream string) *httptest.ResponseRecorder {
	t.Helper()

	w.probe.forces("map", http.StatusOK, upstream)
	rec := w.call(masteryGrade(), w.mine, mindmapOwnSection)
	if rec.Code != http.StatusOK {
		t.Fatalf("grade: want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if rec.Body.String() != upstream {
		t.Fatalf("the grade was re-modelled on the way through:\n got %s\nwant %s",
			rec.Body.String(), upstream)
	}
	return rec
}

func (w *masteryWorld) rowsOf(t *testing.T, student uuid.UUID) map[string]*tenantent.ConceptMastery {
	t.Helper()

	rows, err := w.db.Client.ConceptMastery.Query().
		Where(entmastery.StudentID(student)).
		All(context.Background())
	if err != nil {
		t.Fatalf("reading the mastery rows of %s: %v", student, err)
	}
	out := map[string]*tenantent.ConceptMastery{}
	for _, row := range rows {
		if _, twice := out[row.NodeID]; twice {
			t.Fatalf("%s holds two rows for node %s", student, row.NodeID)
		}
		out[row.NodeID] = row
	}
	return out
}

func (w *masteryWorld) seed(t *testing.T, student uuid.UUID, node string,
	state entmastery.State, attempts int) {
	t.Helper()

	w.db.Client.ConceptMastery.Create().
		SetStudentID(student).
		SetAcademicSessionID(w.session).
		SetContentItemID(w.mine).
		SetEngineSectionID(mindmapOwnSection).
		SetNodeID(node).
		SetState(state).
		SetAttempts(attempts).
		SaveX(context.Background())
}

func wantStates(t *testing.T, what string, got, want map[string]string) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("%s: got states %v, want %v", what, got, want)
	}
	for node, state := range want {
		if got[node] != state {
			t.Fatalf("%s: got states %v, want %v", what, got, want)
		}
	}
}

func (w *masteryWorld) writesOfThisCall() int {
	return len(mindmapWrites(w.db.Statements()[w.callBegan.Load():]))
}

func (w *masteryWorld) writesSeenByTheService() func() (int, int) {
	var mu sync.Mutex
	most, calls := 0, 0

	w.probe.mu.Lock()
	w.probe.onRequest = func() {
		seen := w.writesOfThisCall()
		mu.Lock()
		defer mu.Unlock()
		calls++
		if seen > most {
			most = seen
		}
	}
	w.probe.mu.Unlock()

	return func() (int, int) {
		mu.Lock()
		defer mu.Unlock()
		return most, calls
	}
}

func TestMasteryStatesFollowTheScoreTheServiceGave(t *testing.T) {
	cases := map[float64]entmastery.State{
		1:    entmastery.StateKnown,
		1.5:  entmastery.StateKnown,
		0.5:  entmastery.StateShaky,
		0.01: entmastery.StateShaky,
		0:    entmastery.StateMissed,
		-1:   entmastery.StateMissed,
	}
	for score, want := range cases {
		if got := masteryStateOf(score); got != want {
			t.Errorf("a score of %v is %q, want %q", score, got, want)
		}
	}
}

func wantScores(t *testing.T, what string, got []masteryScore, want ...masteryScore) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("%s: got %+v, want %+v", what, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s, score %d: got %+v, want %+v (the list must be sorted by node so two "+
				"grades lock rows in one order)", what, i, got[i], want[i])
		}
	}
}

func TestARealGradeRecordsWhatWasAnsweredAndNothingThatWasSkipped(t *testing.T) {
	wantScores(t, "three wrong answers and one left blank",
		masteryScoresOf(realGrade(t, "grade_label.json")),
		masteryScore{"atm_02248f128923", entmastery.StateMissed, 0},
		masteryScore{"atm_aac4f117389e", entmastery.StateMissed, 0},
		masteryScore{"atm_c5526fd1dd30", entmastery.StateMissed, 0},
	)

	wantScores(t, "a drill submitted with no answers at all",
		masteryScoresOf(realGrade(t, "grade_empty_answers.json")))

	wantScores(t, "one right and one wrong",
		masteryScoresOf(realGrade(t, "grade_relation.json")),
		masteryScore{"atm_aac4f117389e", entmastery.StateKnown, 1},
		masteryScore{"atm_c5526fd1dd30", entmastery.StateMissed, 0},
	)
}

func TestTheAnsweredItemDecidesANodeThatTwoItemsShare(t *testing.T) {
	blank := gradedItem{node: "atm_1", verdict: "incorrect", given: "  \t "}
	odd := gradedItem{node: "atm_1", verdict: "unsure", given: "an answer"}

	cases := []struct {
		name  string
		items []gradedItem
		want  []masteryScore
	}{
		{"answered right, then left blank", []gradedItem{answered("atm_1", 1), skipped("atm_1")},
			[]masteryScore{{"atm_1", entmastery.StateKnown, 1}}},
		{"left blank, then answered nearly", []gradedItem{skipped("atm_1"), answered("atm_1", 0.5)},
			[]masteryScore{{"atm_1", entmastery.StateShaky, 0.5}}},
		{"left blank, then answered wrong", []gradedItem{skipped("atm_1"), answered("atm_1", 0)},
			[]masteryScore{{"atm_1", entmastery.StateMissed, 0}}},
		{"both answered, the service's own number stands",
			[]gradedItem{answered("atm_1", 1), answered("atm_1", 0)},
			[]masteryScore{{"atm_1", entmastery.StateMissed, 0}}},
		{"both left blank", []gradedItem{skipped("atm_1"), skipped("atm_1")}, nil},
		{"an answer of nothing but spaces is a blank", []gradedItem{blank}, nil},
		{"a blank beside a verdict this server does not know", []gradedItem{odd, skipped("atm_1")}, nil},
		{"answered and blank nodes side by side",
			[]gradedItem{skipped("atm_b"), answered("atm_c", 0), answered("atm_a", 1)},
			[]masteryScore{{"atm_a", entmastery.StateKnown, 1}, {"atm_c", entmastery.StateMissed, 0}}},
	}
	for _, tc := range cases {
		wantScores(t, tc.name, masteryScoresOf([]byte(gradedWith(tc.items...))), tc.want...)
	}
}

func TestOnlyAnswersAndNodeScoresAreReadOutOfAGrade(t *testing.T) {
	results := `"results":[` +
		`{"node_id":"atm_over","given":"x","verdict":"correct"},` +
		`{"node_id":"atm_under","given":"x","verdict":"incorrect"},` +
		`{"node_id":"atm_null","given":"x","verdict":"correct"},` +
		`{"node_id":"atm_unscored","given":"x","verdict":"correct"},` +
		`{"node_id":"","given":"x","verdict":"correct"}]`

	wantScores(t, "scores outside the unit interval, null and absent",
		masteryScoresOf([]byte(`{`+results+`,"node_scores":`+
			`{"atm_over":7,"atm_under":-3,"atm_null":null,"":1,"atm_no_result":1}}`)),
		masteryScore{"atm_over", entmastery.StateKnown, 1},
		masteryScore{"atm_under", entmastery.StateMissed, 0},
	)

	for _, unreadable := range []string{
		`{"score":1}`,
		`{"node_scores":["atm_1"]}`,
		`{"node_scores":{"atm_1":1}}`,
		`{"node_scores":{"atm_1":1},"results":[]}`,
		`{"node_scores":{"atm_1":1},"results":[{"node_id":"atm_1","given":null}]}`,
		`{"results":[{"node_id":"atm_1","given":"x","verdict":"correct"}]}`,
		`not json`,
	} {
		if got := masteryScoresOf([]byte(unreadable)); len(got) != 0 {
			t.Errorf("%s shows no answered node with a score, yet %+v was read out of it", unreadable, got)
		}
	}
}

func TestMasteryMarksAreRefusedBeforeAnyLookup(t *testing.T) {
	probe := newMindmapProbe(t)
	router, server := mindmapRouter(authorization.AllowAll{})
	mindmapsSwitchedOn(t, server, probe)

	path := "/api/v1/learning/mindmaps/" + probeID + "/chapters/sec_1/mastery"
	long := strings.Repeat("n", maxMasteryNodeLength+1)

	many := make([]string, 0, MaxMasteryMarks+1)
	for i := 0; i <= MaxMasteryMarks; i++ {
		many = append(many, `"atm_`+strconv.Itoa(i)+`":"read"`)
	}

	cases := []struct {
		name   string
		method string
		path   string
		body   string
		want   int
		names  string
	}{
		{"a graded state from the client", "PUT", path, `{"states":{"atm_1":"known"}}`,
			http.StatusUnprocessableEntity, "may set only read"},
		{"one graded state among read marks", "PUT", path,
			`{"states":{"atm_1":"read","atm_2":"shaky"}}`, http.StatusUnprocessableEntity, "atm_2"},
		{"a state that does not exist", "PUT", path, `{"states":{"atm_1":"mastered"}}`,
			http.StatusUnprocessableEntity, "mastered"},
		{"no states at all", "PUT", path, `{}`, http.StatusBadRequest, "states is required"},
		{"a body that is not JSON", "PUT", path, `states=read`, http.StatusBadRequest, "invalid JSON body"},
		{"a field the contract does not name", "PUT", path,
			`{"states":{},"student_id":"` + probeID + `"}`, http.StatusBadRequest, "student_id"},
		{"an empty node id", "PUT", path, `{"states":{"  ":"read"}}`, http.StatusBadRequest, "node id"},
		{"a node id longer than the column", "PUT", path, `{"states":{"` + long + `":"read"}}`,
			http.StatusBadRequest, "node id"},
		{"more marks than one request may carry", "PUT", path,
			`{"states":{` + strings.Join(many, ",") + `}}`, http.StatusBadRequest, "at most"},
		{"a student named on a write", "PUT", path + "?student_id=" + probeID, `{"states":{}}`,
			http.StatusBadRequest, "student_id"},
		{"a student id that is not one", "GET", path + "?student_id=me", ``,
			http.StatusBadRequest, "student_id"},
		{"a parameter the read does not know", "GET", path + "?session=now", ``,
			http.StatusBadRequest, "session"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := sendMindmap(router, mindmapRoute{method: tc.method, path: tc.path, body: tc.body})

			if rec.Code != tc.want {
				t.Fatalf("want %d, got %d: %s", tc.want, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if !strings.Contains(rec.Body.String(), tc.names) {
				t.Fatalf("the refusal must say %q: %s", tc.names, rec.Body.String())
			}
		})
	}
	if got := probe.taken(); len(got) != 0 {
		t.Fatalf("a malformed mastery request reached the mind-map service: %+v", got)
	}
}

func TestAMasteryRouteIsRefusedWithoutItsOwnKeyAndNamesIt(t *testing.T) {
	probe := newMindmapProbe(t)
	path := "/api/v1/learning/mindmaps/" + probeID + "/chapters/sec_1/mastery"

	cases := []struct {
		route   mindmapRoute
		missing authorization.Entity
	}{
		{mindmapRoute{method: "GET", path: path}, authorization.ConceptMasteryRead},
		{mindmapRoute{method: "PUT", path: path, body: `{"states":{}}`}, authorization.ConceptMasteryWrite},
		{mindmapRoute{method: "GET", path: path}, authorization.MindmapsRead},
		{mindmapRoute{method: "PUT", path: path, body: `{"states":{}}`}, authorization.MindmapsRead},
	}

	for _, tc := range cases {
		t.Run(tc.route.method+" without "+string(tc.missing), func(t *testing.T) {
			router, server := mindmapRouter(pupilGrants().without(tc.missing))
			mindmapsSwitchedOn(t, server, probe)

			rec := sendMindmap(router, tc.route)
			if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), string(tc.missing)) {
				t.Fatalf("want 403 naming %s, got %d: %s", tc.missing, rec.Code,
					strings.TrimSpace(rec.Body.String()))
			}
		})
	}
	if got := probe.taken(); len(got) != 0 {
		t.Fatalf("a caller without the key reached the mind-map service: %+v", got)
	}
}

func TestMasteryFromPostgresIsReadAndRaisedOnlyByItsOwnPupil(t *testing.T) {
	world := newMasteryWorld(t)

	world.seed(t, world.classmate, "atm_1", entmastery.StateKnown, 4)
	world.seed(t, world.classmate, "atm_9", entmastery.StateShaky, 2)

	marked := world.mastery(t, masteryPut(`{"states":{"atm_1":"read","atm_2":"read"}}`))
	if !marked.Tracked || marked.StudentID == nil || *marked.StudentID != world.pupil.String() {
		t.Fatalf("an enrolled pupil is tracked under their own student record, got %+v", marked)
	}
	wantStates(t, "the pupil's own marks", marked.States,
		map[string]string{"atm_1": "read", "atm_2": "read"})

	read := world.mastery(t, masteryGet(""))
	wantStates(t, "the pupil's own mastery", read.States,
		map[string]string{"atm_1": "read", "atm_2": "read"})
	if read.StudentID == nil || *read.StudentID != world.pupil.String() {
		t.Fatalf("without student_id the answer is the caller's own record, got %+v", read)
	}

	hidden := world.call(masteryGet("?student_id="+world.classmate.String()), world.mine, mindmapOwnSection)
	if hidden.Code != http.StatusNotFound {
		t.Fatalf("a pupil asked for a classmate's mastery: want 404, got %d: %s",
			hidden.Code, strings.TrimSpace(hidden.Body.String()))
	}
	absent := world.call(masteryGet("?student_id="+uuid.NewString()), world.mine, mindmapOwnSection)
	if absent.Code != http.StatusNotFound || absent.Body.String() != hidden.Body.String() {
		t.Fatalf("a classmate and a pupil who does not exist must be indistinguishable:\nhidden %s\nabsent %s",
			hidden.Body.String(), absent.Body.String())
	}

	world.grades(t, `{"atm_1":1,"atm_9":0}`)

	theirs := world.rowsOf(t, world.classmate)
	if len(theirs) != 2 || theirs["atm_1"].State != entmastery.StateKnown || theirs["atm_1"].Attempts != 4 ||
		theirs["atm_9"].State != entmastery.StateShaky || theirs["atm_9"].Attempts != 2 {
		t.Fatalf("a pupil's marks and grade changed a classmate's rows: %+v", theirs)
	}
	mine := world.rowsOf(t, world.pupil)
	if len(mine) != 3 || mine["atm_1"].State != entmastery.StateKnown ||
		mine["atm_2"].State != entmastery.StateRead || mine["atm_9"].State != entmastery.StateMissed {
		t.Fatalf("the pupil's own rows are not what they marked and were graded: %+v", mine)
	}
}

func TestConceptMasteryForAdmitsOnlyTheRowsOfPupilsTheViewerReaches(t *testing.T) {
	world := newMasteryWorld(t)

	world.seed(t, world.pupil, "atm_1", entmastery.StateRead, 0)
	world.seed(t, world.classmate, "atm_1", entmastery.StateKnown, 1)
	world.seed(t, world.outsider, "atm_1", entmastery.StateShaky, 1)

	cases := []struct {
		name   string
		cas    uuid.UUID
		grants masteryGrants
		want   []uuid.UUID
	}{
		{"a pupil", world.pupilCAS, pupilGrants(), []uuid.UUID{world.pupil}},
		{"a guardian", world.guardianCAS, readerGrants(authorization.ReachGuardianWard),
			[]uuid.UUID{world.pupil}},
		{"a guardian who may not see academics", world.strangerCAS,
			readerGrants(authorization.ReachGuardianWard), nil},
		{"a teacher", world.teacherCAS, readerGrants(authorization.ReachTeacherAssignment),
			[]uuid.UUID{world.pupil, world.classmate}},
		{"a head under read_all", world.headCAS, headGrants(),
			[]uuid.UUID{world.pupil, world.classmate, world.outsider}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			world.as(tc.cas, tc.grants)

			viewer, decision, err := world.server.scopeFor(world.ctx,
				authorization.ConceptMasteryRead, authorization.ConceptMasteryReadAll)
			if err != nil {
				t.Fatalf("the viewer could not be resolved: %v", err)
			}
			rows, err := world.db.Client.ConceptMastery.Query().
				Where(access.ConceptMasteryFor(viewer, decision), entmastery.ContentItemID(world.mine)).
				All(context.Background())
			if err != nil {
				t.Fatalf("the predicate did not run: %v", err)
			}

			seen := map[uuid.UUID]bool{}
			for _, row := range rows {
				seen[row.StudentID] = true
			}
			if len(seen) != len(tc.want) {
				t.Fatalf("the predicate admitted the rows of %v, want exactly %v", seen, tc.want)
			}
			for _, student := range tc.want {
				if !seen[student] {
					t.Fatalf("the predicate hid the rows of %s, which this viewer reaches", student)
				}
			}
		})
	}
}

func TestMasteryFromPostgresAnswersForAWardATaughtPupilAndUnderReadAll(t *testing.T) {
	world := newMasteryWorld(t)

	world.seed(t, world.pupil, "atm_1", entmastery.StateShaky, 1)
	world.seed(t, world.classmate, "atm_2", entmastery.StateKnown, 1)

	of := func(student uuid.UUID) mindmapCall { return masteryGet("?student_id=" + student.String()) }
	refused := func(t *testing.T, student uuid.UUID) {
		t.Helper()
		rec := world.call(of(student), world.mine, mindmapOwnSection)
		if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), masteryStudentNotFound) {
			t.Fatalf("want 404 %q, got %d: %s", masteryStudentNotFound, rec.Code,
				strings.TrimSpace(rec.Body.String()))
		}
	}

	t.Run("a guardian reads the ward and nobody else", func(t *testing.T) {
		world.as(world.guardianCAS, readerGrants(authorization.ReachGuardianWard))

		ward := world.mastery(t, of(world.pupil))
		if !ward.Tracked || ward.StudentID == nil || *ward.StudentID != world.pupil.String() {
			t.Fatalf("the ward's mastery must be answered as the ward's, got %+v", ward)
		}
		wantStates(t, "the ward", ward.States, map[string]string{"atm_1": "shaky"})

		refused(t, world.classmate)

		own := world.mastery(t, masteryGet(""))
		if own.Tracked || own.StudentID != nil || len(own.States) != 0 {
			t.Fatalf("a guardian is not a pupil, so without student_id nothing is tracked: %+v", own)
		}
	})

	t.Run("a guardian who may not see academics reads nothing", func(t *testing.T) {
		world.as(world.strangerCAS, readerGrants(authorization.ReachGuardianWard))
		refused(t, world.pupil)
	})

	t.Run("a teacher reads the pupils taught and nobody else", func(t *testing.T) {
		world.as(world.teacherCAS, readerGrants(authorization.ReachTeacherAssignment))

		wantStates(t, "a taught pupil", world.mastery(t, of(world.pupil)).States,
			map[string]string{"atm_1": "shaky"})
		wantStates(t, "another taught pupil", world.mastery(t, of(world.classmate)).States,
			map[string]string{"atm_2": "known"})
		refused(t, world.outsider)
	})

	t.Run("read_all reaches every pupil", func(t *testing.T) {
		world.as(world.headCAS, headGrants())

		wantStates(t, "a pupil under read_all", world.mastery(t, of(world.classmate)).States,
			map[string]string{"atm_2": "known"})

		blank := world.mastery(t, of(world.outsider))
		if !blank.Tracked || len(blank.States) != 0 {
			t.Fatalf("an enrolled pupil with nothing recorded is tracked and empty, got %+v", blank)
		}
		refused(t, uuid.New())
	})

	t.Run("a pupil's own reach does not widen to a classmate", func(t *testing.T) {
		world.as(world.classmateCAS, pupilGrants())

		wantStates(t, "the classmate's own", world.mastery(t, masteryGet("")).States,
			map[string]string{"atm_2": "known"})
		refused(t, world.pupil)
	})
}

func TestMasteryFromPostgresTellsAnUntrackedViewerSoAndStoresNothing(t *testing.T) {
	world := newMasteryWorld(t)
	world.as(world.teacherCAS, readerGrants(authorization.ReachTeacherAssignment))
	world.db.Forget()

	read := world.mastery(t, masteryGet(""))
	if read.Tracked || read.StudentID != nil || len(read.States) != 0 {
		t.Fatalf("a teacher has no student record, so nothing is tracked: %+v", read)
	}

	marked := world.mastery(t, masteryPut(`{"states":{"atm_1":"read"}}`))
	if marked.Tracked || marked.StudentID != nil || len(marked.States) != 0 {
		t.Fatalf("an untracked viewer's mark is answered and not stored: %+v", marked)
	}

	graded := world.grades(t, `{"atm_1":1}`)
	if header := graded.Header().Get(MasteryRecordedHeader); header != "" {
		t.Fatalf("nothing was attempted for an untracked viewer, yet %s is %q",
			MasteryRecordedHeader, header)
	}

	if writes := mindmapWrites(world.db.Statements()); len(writes) != 0 {
		t.Fatalf("an untracked viewer wrote %v", writes)
	}
	rows, err := world.db.Client.ConceptMastery.Query().
		Where(entmastery.ContentItemID(world.mine)).Count(context.Background())
	if err != nil || rows != 0 {
		t.Fatalf("an untracked viewer left %d mastery rows (%v)", rows, err)
	}
}

func TestMasteryFromPostgresStoresNothingForAStateOtherThanRead(t *testing.T) {
	world := newMasteryWorld(t)
	world.db.Forget()

	for _, body := range []string{
		`{"states":{"atm_1":"known"}}`,
		`{"states":{"atm_1":"read","atm_2":"missed"}}`,
	} {
		rec := world.call(masteryPut(body), world.mine, mindmapOwnSection)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s: want 422, got %d: %s", body, rec.Code, strings.TrimSpace(rec.Body.String()))
		}
	}

	if stmts := world.db.Statements(); len(stmts) != 0 {
		t.Fatalf("a refused mark reached the database: %+v", stmts)
	}
	if got := world.probe.taken(); len(got) != 0 {
		t.Fatalf("a refused mark reached the mind-map service: %+v", got)
	}
	if rows := world.rowsOf(t, world.pupil); len(rows) != 0 {
		t.Fatalf("a refused mark stored %+v", rows)
	}
}

func TestMasteryFromPostgresRefusesAMarkOnABookOrChapterTheCallerCannotOpen(t *testing.T) {
	world := newMasteryWorld(t)

	hidden := world.call(masteryPut(`{"states":{"atm_1":"read"}}`), world.theirs, mindmapOtherSection)
	if hidden.Code != http.StatusNotFound {
		t.Fatalf("a mark against a book of another offering: want 404, got %d: %s",
			hidden.Code, strings.TrimSpace(hidden.Body.String()))
	}
	foreign := world.call(masteryPut(`{"states":{"atm_1":"read"}}`), world.mine, mindmapOtherSection)
	if foreign.Code != http.StatusNotFound || !strings.Contains(foreign.Body.String(), mindmapChapterNotFound) {
		t.Fatalf("a mark against a chapter of another book: want 404, got %d: %s",
			foreign.Code, strings.TrimSpace(foreign.Body.String()))
	}
	read := world.call(masteryGet(""), world.mine, mindmapOtherSection)
	if read.Code != http.StatusNotFound {
		t.Fatalf("mastery of a chapter that is not in the book: want 404, got %d", read.Code)
	}

	if rows := world.rowsOf(t, world.pupil); len(rows) != 0 {
		t.Fatalf("a row was filed against a book or chapter the caller cannot open: %+v", rows)
	}
}

func TestMasteryFromPostgresRecordsAGradeAndOnlyEverRaisesIt(t *testing.T) {
	world := newMasteryWorld(t)
	seen := world.writesSeenByTheService()
	started := time.Now().Add(-time.Second)

	first := world.grades(t, `{"atm_1":1,"atm_2":0.5,"atm_3":0}`)
	if header := first.Header().Get(MasteryRecordedHeader); header != "true" {
		t.Fatalf("a recorded grade must say so in %s, got %q", MasteryRecordedHeader, header)
	}

	rows := world.rowsOf(t, world.pupil)
	for node, want := range map[string]struct {
		state entmastery.State
		score float64
	}{
		"atm_1": {entmastery.StateKnown, 1},
		"atm_2": {entmastery.StateShaky, 0.5},
		"atm_3": {entmastery.StateMissed, 0},
	} {
		row, stored := rows[node]
		if !stored {
			t.Fatalf("%s was graded and not stored: %+v", node, rows)
		}
		if row.State != want.state || row.Score == nil || *row.Score != want.score || row.Attempts != 1 {
			t.Fatalf("%s: got state %s score %v attempts %d, want %s %v 1",
				node, row.State, row.Score, row.Attempts, want.state, want.score)
		}
		if row.LastAttemptAt == nil || row.LastAttemptAt.Before(started) {
			t.Fatalf("%s: the attempt carries no time: %v", node, row.LastAttemptAt)
		}
		if row.EngineSectionID != mindmapOwnSection || row.AcademicSessionID != world.session ||
			row.ContentItemID != world.mine {
			t.Fatalf("%s was filed against the wrong chapter, session or book: %+v", node, row)
		}
	}

	world.grades(t, `{"atm_1":0,"atm_2":1,"atm_3":0.5}`)
	rows = world.rowsOf(t, world.pupil)
	if rows["atm_1"].State != entmastery.StateKnown {
		t.Fatalf("a later, lower grade overwrote known with %s", rows["atm_1"].State)
	}
	if rows["atm_1"].Score == nil || *rows["atm_1"].Score != 0 || rows["atm_1"].Attempts != 2 {
		t.Fatalf("the latest attempt must still be counted and its score kept: score %v attempts %d",
			rows["atm_1"].Score, rows["atm_1"].Attempts)
	}
	if rows["atm_2"].State != entmastery.StateKnown || rows["atm_3"].State != entmastery.StateShaky {
		t.Fatalf("a higher grade must raise the state: atm_2 %s, atm_3 %s",
			rows["atm_2"].State, rows["atm_3"].State)
	}

	marked := world.mastery(t, masteryPut(`{"states":{"atm_1":"read","atm_4":"read"}}`))
	wantStates(t, "marks after grades", marked.States, map[string]string{
		"atm_1": "known", "atm_2": "known", "atm_3": "shaky", "atm_4": "read",
	})
	if after := world.rowsOf(t, world.pupil)["atm_1"]; after.Attempts != 2 || *after.Score != 0 {
		t.Fatalf("a read mark is not an attempt, yet the graded row changed: %+v", after)
	}

	world.grades(t, `{"atm_4":0}`)
	if got := world.rowsOf(t, world.pupil)["atm_4"]; got.State != entmastery.StateMissed || got.Attempts != 1 {
		t.Fatalf("a first grade must raise read to missed and count one attempt, got %s after %d",
			got.State, got.Attempts)
	}

	early, calls := seen()
	if calls == 0 {
		t.Fatal("the mind-map service was never called, so the order of writes was not observed")
	}
	if early != 0 {
		t.Fatalf("%d writes of a request had already run while the mind-map service was being "+
			"called; the engine calls back during that call, so every write belongs after it", early)
	}
	if total := len(mindmapWrites(world.db.Statements())); total == 0 {
		t.Fatal("no write was recorded at all, so the check above observed nothing")
	}
}

func TestMasteryFromPostgresStoresNothingForAGraderWithoutTheWriteKey(t *testing.T) {
	world := newMasteryWorld(t)
	world.as(world.pupilCAS, pupilGrants().without(authorization.ConceptMasteryWrite))
	world.db.Forget()

	graded := world.grades(t, `{"atm_1":1,"atm_2":0}`)
	if header := graded.Header().Get(MasteryRecordedHeader); header != "" {
		t.Fatalf("nothing was attempted without the write key, yet %s is %q",
			MasteryRecordedHeader, header)
	}
	if writes := mindmapWrites(world.db.Statements()); len(writes) != 0 {
		t.Fatalf("a grader without %s wrote %v", authorization.ConceptMasteryWrite, writes)
	}
	if rows := world.rowsOf(t, world.pupil); len(rows) != 0 {
		t.Fatalf("a grader without %s stored %+v", authorization.ConceptMasteryWrite, rows)
	}
}

func TestMasteryFromPostgresStillAnswersAGradeItCouldNotRecord(t *testing.T) {
	world := newMasteryWorld(t)

	world.probe.mu.Lock()
	world.probe.onRequest = func() {
		_, _ = world.db.Client.ContentItem.Delete().
			Where(entcontentitem.ID(world.mine)).
			Exec(context.Background())
	}
	world.probe.mu.Unlock()

	graded := world.grades(t, `{"atm_1":1}`)
	if header := graded.Header().Get(MasteryRecordedHeader); header != "false" {
		t.Fatalf("the book was deleted while the drill was graded, so the row could not be "+
			"filed and %s must say false, got %q", MasteryRecordedHeader, header)
	}
}

type fakeStructures struct {
	mu     sync.Mutex
	digest string
	chunks int
	err    error
	asked  []string
	onAsk  func()
}

func (f *fakeStructures) PublishedDocument(_ context.Context, tenant,
	documentID string) (*indexing.PublishedDocument, error) {

	f.mu.Lock()
	f.asked = append(f.asked, tenant+"/"+documentID)
	hook, err, digest, chunks := f.onAsk, f.err, f.digest, f.chunks
	f.mu.Unlock()

	if hook != nil {
		hook()
	}
	if err != nil {
		return nil, err
	}
	return &indexing.PublishedDocument{
		DocumentID:      documentID,
		Tenant:          tenant,
		Chunks:          &chunks,
		StructureDigest: digest,
	}, nil
}

func structuresFrom(t *testing.T, source mindmap.StructureSource) {
	t.Helper()

	UseMasteryStructures(mindmap.NewStructures(source))
	t.Cleanup(func() { UseMasteryStructures(nil) })
}

func TestMasteryFromPostgresRecordsTheStructureItWasLearnedAgainst(t *testing.T) {
	world := newMasteryWorld(t)

	writesWhenAsked := -1
	source := &fakeStructures{digest: "sha256:structure-one", chunks: 412}
	source.onAsk = func() { writesWhenAsked = world.writesOfThisCall() }
	structuresFrom(t, source)
	world.db.Forget()

	world.grades(t, `{"atm_1":1}`)
	world.mastery(t, masteryPut(`{"states":{"atm_2":"read"}}`))

	rows := world.rowsOf(t, world.pupil)
	for _, node := range []string{"atm_1", "atm_2"} {
		row := rows[node]
		if row == nil || row.StructureDigest == nil || *row.StructureDigest != "sha256:structure-one" ||
			row.StructureChunks == nil || *row.StructureChunks != 412 {
			t.Fatalf("%s must carry the digest and chunk count of the book as it stood: %+v", node, row)
		}
	}
	if len(source.asked) != 1 || source.asked[0] != mindmapSlug+"/"+world.document {
		t.Fatalf("the digest must be asked once, for this school's engine document, got %v", source.asked)
	}
	if writesWhenAsked != 0 {
		t.Fatalf("%d writes had run when the engine was asked for the digest; the engine is an "+
			"outbound call and every write belongs after it", writesWhenAsked)
	}
}

func TestMasteryFromPostgresIsStillRecordedWhenTheDigestCannotBeHad(t *testing.T) {
	cases := map[string]mindmap.StructureSource{
		"no engine client":         nil,
		"the engine is down":       &fakeStructures{err: indexing.ErrEngineUnreachable},
		"the engine hides it":      &fakeStructures{err: indexing.ErrDocumentUnpublished},
		"the engine has no digest": &fakeStructures{digest: "", chunks: 9},
		"an unexpected failure":    &fakeStructures{err: errors.New("boom")},
	}

	for name, source := range cases {
		t.Run(name, func(t *testing.T) {
			world := newMasteryWorld(t)
			if source != nil {
				structuresFrom(t, source)
			}

			graded := world.grades(t, `{"atm_1":0.5}`)
			if header := graded.Header().Get(MasteryRecordedHeader); header != "true" {
				t.Fatalf("mastery must be recorded without a digest, %s is %q",
					MasteryRecordedHeader, header)
			}
			row := world.rowsOf(t, world.pupil)["atm_1"]
			if row == nil || row.State != entmastery.StateShaky {
				t.Fatalf("the grade was not recorded: %+v", row)
			}
			if row.StructureDigest != nil || row.StructureChunks != nil {
				t.Fatalf("an unknown structure must be stored as NULL, got digest %v chunks %v",
					row.StructureDigest, row.StructureChunks)
			}
		})
	}
}

func TestAMasteryReadFinishesItsDatabaseWorkBeforeItCallsOut(t *testing.T) {
	world := newMasteryWorld(t)
	world.seed(t, world.pupil, "atm_1", entmastery.StateShaky, 1)
	world.db.Forget()

	var atFirstCall atomic.Int64
	atFirstCall.Store(-1)
	world.probe.mu.Lock()
	world.probe.onRequest = func() {
		atFirstCall.CompareAndSwap(-1, int64(len(world.db.Statements())))
	}
	world.probe.mu.Unlock()

	read := world.mastery(t, masteryGet(""))
	wantStates(t, "the read", read.States, map[string]string{"atm_1": "shaky"})

	total := int64(len(world.db.Statements()))
	if atFirstCall.Load() <= 0 || atFirstCall.Load() != total {
		t.Fatalf("%d statements had run when the outbound call began and %d by the end, so "+
			"database work straddles a call the engine answers by calling back",
			atFirstCall.Load(), total)
	}
	if writes := mindmapWrites(world.db.Statements()); len(writes) != 0 {
		t.Fatalf("a read wrote %v", writes)
	}
}

func TestConcurrentGradesKeepOneRowPerNode(t *testing.T) {
	ctx := context.Background()
	client := testsupport.TenantPool(ctx, t)
	tag := uuid.NewString()[:8]
	today := time.Now().UTC()

	person := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Race").
		SetDisplayName("Mastery Race " + tag).
		SaveX(ctx)
	student := client.Student.Create().
		SetPersonID(person.ID).
		SetAdmissionNumber("MRC-" + tag).
		SaveX(ctx)
	session := client.AcademicSession.Create().
		SetName("Mastery Race " + tag).
		SetCode("MRC-" + tag).
		SetStartDate(today.AddDate(-9, 0, 0)).
		SetEndDate(today.AddDate(-8, 0, 0)).
		SaveX(ctx)
	book := client.ContentItem.Create().
		SetTitle("Mastery Race " + tag).
		SetKind(entcontentitem.KindBook).
		SetAudience(entcontentitem.AudienceOwner).
		SetOwnerPersonID(person.ID).
		SaveX(ctx)
	t.Cleanup(func() {
		_, _ = client.ConceptMastery.Delete().Where(entmastery.StudentID(student.ID)).Exec(ctx)
		_ = client.ContentItem.DeleteOneID(book.ID).Exec(ctx)
		_ = client.AcademicSession.DeleteOneID(session.ID).Exec(ctx)
		_ = client.Student.DeleteOneID(student.ID).Exec(ctx)
		_ = client.Person.DeleteOneID(person.ID).Exec(ctx)
	})

	target := masteryTarget{
		seat:    masterySeat{student: student.ID, session: session.ID},
		item:    book.ID,
		section: "sec_race",
	}
	attempts := []masteryScore{
		{"atm_shared", entmastery.StateMissed, 0},
		{"atm_shared", entmastery.StateKnown, 1},
		{"atm_shared", entmastery.StateShaky, 0.5},
		{"atm_shared", entmastery.StateMissed, 0},
		{"atm_shared", entmastery.StateShaky, 0.5},
		{"atm_shared", entmastery.StateMissed, 0},
	}

	var wg sync.WaitGroup
	failures := make(chan error, len(attempts)+1)
	begin := make(chan struct{})
	for _, attempt := range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-begin
			scores := []masteryScore{attempt, {"atm_other", attempt.state, attempt.score}}
			if err := storeMasteryGrades(ctx, client, target, scores, time.Now()); err != nil {
				failures <- err
			}
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		<-begin
		if err := storeMasteryReads(ctx, client, target, []string{"atm_other", "atm_shared"}); err != nil {
			failures <- err
		}
	}()
	close(begin)
	wg.Wait()
	close(failures)
	for err := range failures {
		t.Fatalf("a concurrent grade failed instead of settling on the one row: %v", err)
	}

	rows, err := client.ConceptMastery.Query().Where(entmastery.StudentID(student.ID)).All(ctx)
	if err != nil {
		t.Fatalf("reading the rows back: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("%d concurrent grades of two nodes left %d rows, want 2", len(attempts), len(rows))
	}
	for _, row := range rows {
		if row.State != entmastery.StateKnown {
			t.Errorf("%s settled on %s, yet one of the grades was known and a state only rises",
				row.NodeID, row.State)
		}
		if row.Attempts != len(attempts) {
			t.Errorf("%s counts %d attempts, want %d: a grade was lost or counted twice",
				row.NodeID, row.Attempts, len(attempts))
		}
	}
}

func TestMasteryFromPostgresRefusesAMarkOnAChapterThatIsAlreadyFull(t *testing.T) {
	world := newMasteryWorld(t)
	ctx := context.Background()

	for start := 0; start < MaxMasterySectionRows; start += 1000 {
		rows := make([]*tenantent.ConceptMasteryCreate, 0, 1000)
		for i := start; i < start+1000 && i < MaxMasterySectionRows; i++ {
			rows = append(rows, world.db.Client.ConceptMastery.Create().
				SetStudentID(world.pupil).
				SetAcademicSessionID(world.session).
				SetContentItemID(world.mine).
				SetEngineSectionID(mindmapOwnSection).
				SetNodeID("atm_filler_"+strconv.Itoa(i)).
				SetState(entmastery.StateRead))
		}
		world.db.Client.ConceptMastery.CreateBulk(rows...).ExecX(ctx)
	}
	world.db.Forget()

	rec := world.call(masteryPut(`{"states":{"atm_one_more":"read"}}`), world.mine, mindmapOwnSection)
	if rec.Code != http.StatusUnprocessableEntity ||
		!strings.Contains(rec.Body.String(), strconv.Itoa(MaxMasterySectionRows)) {
		t.Fatalf("a chapter holding %d rows for one pupil: want 422 naming the count, got %d: %s",
			MaxMasterySectionRows, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if writes := mindmapWrites(world.db.Statements()); len(writes) != 0 {
		t.Fatalf("a refused mark wrote %v", writes)
	}
	if got := world.probe.taken(); len(got) != 0 {
		t.Fatalf("a refused mark reached the mind-map service: %+v", got)
	}
}

func TestMasteryFromPostgresDoesNotRecordASkippedAnswerAsMissed(t *testing.T) {
	world := newMasteryWorld(t)
	world.mastery(t, masteryPut(`{"states":{"atm_seen":"read"}}`))

	first := world.graded(t, gradedWith(
		answered("atm_tried", 0),
		skipped("atm_seen"),
		skipped("atm_unseen"),
		answered("atm_shared", 1),
		skipped("atm_shared"),
	))
	if header := first.Header().Get(MasteryRecordedHeader); header != "true" {
		t.Fatalf("two nodes were answered, so a write was attempted and %s must be true, got %q",
			MasteryRecordedHeader, header)
	}

	rows := world.rowsOf(t, world.pupil)
	if got := rows["atm_tried"]; got == nil || got.State != entmastery.StateMissed || got.Attempts != 1 {
		t.Fatalf("a wrong answer is a miss and one attempt, got %+v", got)
	}
	if got := rows["atm_seen"]; got == nil || got.State != entmastery.StateRead || got.Attempts != 0 ||
		got.Score != nil || got.LastAttemptAt != nil {
		t.Fatalf("a node the pupil had read and then left blank was raised or counted as an "+
			"attempt; a skip is not a mistake: %+v", got)
	}
	if got, stored := rows["atm_unseen"]; stored {
		t.Fatalf("a node the pupil never answered was given a row: %+v", got)
	}
	if got := rows["atm_shared"]; got == nil || got.State != entmastery.StateKnown ||
		got.Score == nil || *got.Score != 1 {
		t.Fatalf("a node answered right in one item and left blank in another is decided by "+
			"the answer, got %+v", got)
	}
	if len(rows) != 3 {
		t.Fatalf("want three rows, got %+v", rows)
	}

	world.db.Forget()
	blank := world.graded(t, gradedWith(skipped("atm_seen"), skipped("atm_tried"), skipped("atm_new")))
	if header := blank.Header().Get(MasteryRecordedHeader); header != "" {
		t.Fatalf("every item was left blank, so no write was attempted, yet %s is %q",
			MasteryRecordedHeader, header)
	}
	if writes := mindmapWrites(world.db.Statements()); len(writes) != 0 {
		t.Fatalf("a drill with nothing answered wrote %v", writes)
	}
	after := world.rowsOf(t, world.pupil)
	if len(after) != 3 || after["atm_tried"].Attempts != 1 || after["atm_tried"].State != entmastery.StateMissed {
		t.Fatalf("a drill with nothing answered changed the rows: %+v", after)
	}
}

func TestMasteryFromPostgresDoesNotLendOneCallersChapterListToAnother(t *testing.T) {
	world := newMasteryWorld(t)
	world.seed(t, world.pupil, "atm_1", entmastery.StateShaky, 1)
	world.probe.denies("Bearer "+mindmapUnlabelledToken, http.StatusNotFound, mindmapGatedRefusal)

	wantStates(t, "the caller the engine accepts", world.mastery(t, masteryGet("")).States,
		map[string]string{"atm_1": "shaky"})

	world.asBearing(world.pupilCAS, pupilGrants(), mindmapUnlabelledToken)
	for _, c := range []mindmapCall{
		masteryGet(""),
		masteryPut(`{"states":{"atm_lent":"read"}}`),
		masteryGrade(),
	} {
		rec := world.call(c, world.mine, mindmapOwnSection)
		if rec.Code != http.StatusNotFound || mindmapRefusalOf(t, rec)["code"] != MindmapRefusedCode {
			t.Fatalf("%s: the engine refuses this credential, and a chapter list another "+
				"credential earned must not answer for it: got %d: %s",
				c.name, rec.Code, strings.TrimSpace(rec.Body.String()))
		}
	}
	if rows := world.rowsOf(t, world.pupil); len(rows) != 1 {
		t.Fatalf("a credential the engine refuses still filed a row: %+v", rows)
	}

	world.as(world.pupilCAS, pupilGrants())
	wantStates(t, "the accepted caller again", world.mastery(t, masteryGet("")).States,
		map[string]string{"atm_1": "shaky"})
	if asked := world.probe.bearing("Bearer "+mindmapToken, "/chapters"); asked != 1 {
		t.Fatalf("the accepted caller's cached chapter list was dropped or poisoned by the "+
			"other caller's refusal: it was asked for %d times, want 1", asked)
	}
}
