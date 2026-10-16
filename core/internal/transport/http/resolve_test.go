package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	resolveasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	resolveitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	resolveplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	resolvenode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type resolveGuard struct {
	placements authorization.Decision
	library    authorization.Decision
	remove     authorization.Decision
}

func (g resolveGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.ContentPlacementsRead:
		return g.placements, nil
	case authorization.LibraryRead:
		return g.library, nil
	case authorization.LibraryDelete:
		return g.remove, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (resolveGuard) Name() string { return "curriculum resolution test guard" }

func resolveTeachingGuard() resolveGuard {
	return resolveGuard{
		placements: authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTeacherAssignment,
			HasReach: true,
		},
		library: authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachSelf,
			HasReach: true,
		},
	}
}

type resolveWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	personID uuid.UUID
	stranger uuid.UUID

	curriculumID uuid.UUID

	unit       uuid.UUID
	chapter    uuid.UUID
	topic      uuid.UUID
	barren     uuid.UUID
	restricted uuid.UUID
	pending    uuid.UUID
	states     uuid.UUID
	unreached  uuid.UUID

	drafted   uuid.UUID
	invisible uuid.UUID
	retracted uuid.UUID
	mixed     uuid.UUID
	orphaned  uuid.UUID

	openCurrent    uuid.UUID
	openStale      uuid.UUID
	openNever      uuid.UUID
	openUningested uuid.UUID
	openHalf       uuid.UUID
	hidden         uuid.UUID

	ownDraft           uuid.UUID
	ownDraftOutOfArm   uuid.UUID
	ownArchivedIndexed uuid.UUID
	openOrphan         uuid.UUID
	orphanAsset        uuid.UUID
	uningestedAsset    uuid.UUID

	confirmedOnTopic uuid.UUID
	proposedOnTopic  uuid.UUID
	rejectedOnTopic  uuid.UUID
	onChapter        uuid.UUID
	onUnit           uuid.UUID
	onCurriculum     uuid.UUID
}

func resolveDigest(seed string) string {
	return strings.Repeat(seed, 64)[:64]
}

func newResolveWorld(t *testing.T) *resolveWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	branch := client.Branch.Create().
		SetName("Resolve Branch " + tag).
		SetCode("RBR-" + tag).
		SaveX(ctx)

	today := time.Now().UTC()
	session := client.AcademicSession.Create().
		SetName("Resolve Session " + tag).
		SetCode("RSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)

	taughtGrade := client.GradeLevel.Create().
		SetName("Resolve Taught Grade " + tag).
		SetCode("RGT-" + tag).
		SetSequence(1).
		SaveX(ctx)
	otherGrade := client.GradeLevel.Create().
		SetName("Resolve Other Grade " + tag).
		SetCode("RGO-" + tag).
		SetSequence(2).
		SaveX(ctx)

	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(taughtGrade.ID).
		SetName("A").
		SetCode("RSC-" + tag).
		SaveX(ctx)

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Resolve").
		SetDisplayName("Resolve Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("REM-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().
		SetStaffID(staff.ID).
		SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(section.ID).
		SetRoleType("class_teacher").
		SaveX(ctx)

	stranger := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Resolve").
		SetDisplayName("Resolve Stranger " + tag).
		SaveX(ctx)

	subject := client.Subject.Create().
		SetName("Resolve Maths " + tag).
		SetCode("RSA-" + tag).
		SaveX(ctx)

	taught := client.Curriculum.Create().
		SetName("Resolve Curriculum " + tag).
		SetCode("RCA-" + tag).
		SetAcademicSessionID(session.ID).
		SetSubjectID(subject.ID).
		SetGradeLevelID(taughtGrade.ID).
		SaveX(ctx)
	unreachable := client.Curriculum.Create().
		SetName("Resolve Unreachable " + tag).
		SetCode("RCB-" + tag).
		SetAcademicSessionID(session.ID).
		SetSubjectID(subject.ID).
		SetGradeLevelID(otherGrade.ID).
		SaveX(ctx)

	newNode := func(curriculum uuid.UUID, parent *uuid.UUID, kind resolvenode.Kind,
		title string, sequence int) uuid.UUID {
		return client.CurriculumNode.Create().
			SetCurriculumID(curriculum).
			SetNillableParentID(parent).
			SetKind(kind).
			SetTitle(title).
			SetSequence(sequence).
			SaveX(ctx).ID
	}

	unit := newNode(taught.ID, nil, resolvenode.KindUnit, "Algebra", 1)
	chapter := newNode(taught.ID, &unit, resolvenode.KindChapter, "Quadratics", 1)
	topic := newNode(taught.ID, &chapter, resolvenode.KindTopic, "Completing the square", 1)
	barren := newNode(taught.ID, &chapter, resolvenode.KindTopic, "Nothing mapped here", 2)
	restricted := newNode(taught.ID, &chapter, resolvenode.KindTopic, "Mapped but private", 3)
	pending := newNode(taught.ID, &chapter, resolvenode.KindTopic, "Mapped but unindexed", 4)
	states := newNode(taught.ID, &chapter, resolvenode.KindTopic, "Every index state", 5)
	drafted := newNode(taught.ID, &chapter, resolvenode.KindTopic, "Mapped to my own draft", 6)
	invisible := newNode(taught.ID, &chapter, resolvenode.KindTopic, "Mine but out of arm", 7)
	retracted := newNode(taught.ID, &chapter, resolvenode.KindTopic, "Indexed then unpublished", 8)
	mixed := newNode(taught.ID, &chapter, resolvenode.KindTopic, "A draft and an ingestion", 9)
	orphaned := newNode(taught.ID, &chapter, resolvenode.KindTopic, "Source deleted underneath", 10)
	unreached := newNode(unreachable.ID, nil, resolvenode.KindChapter, "Out of reach", 1)

	newAsset := func(name, digest string) uuid.UUID {
		return client.Asset.Create().
			SetStorageKey("resolve/" + tag + "/" + name).
			SetFileName(name + ".pdf").
			SetMimeType("application/pdf").
			SetSizeBytes(4096).
			SetSha256(digest).
			SetUploadedBy(person.ID).
			SaveX(ctx).ID
	}

	currentAsset := newAsset("current", resolveDigest("a"))
	staleAsset := newAsset("stale", resolveDigest("b"))
	halfAsset := newAsset("half", resolveDigest("c"))
	uningestedAsset := newAsset("uningested", resolveDigest("e"))
	retractedAsset := newAsset("retracted", resolveDigest("f"))
	orphanAsset := newAsset("orphan", resolveDigest("g"))

	openItem := func(title string) *tenantent.ContentItemCreate {
		return client.ContentItem.Create().
			SetTitle(title + " " + tag).
			SetAudience(resolveitem.AudienceSchool).
			SetStatus(resolveitem.StatusPublished).
			SetOwnerPersonID(stranger.ID)
	}

	openCurrent := openItem("Resolve Current").
		SetAssetID(currentAsset).
		SetIndexedSha256(resolveDigest("a")).
		SetEngineDocumentID("engine-current-" + tag).
		SaveX(ctx)
	openStale := openItem("Resolve Stale").
		SetAssetID(staleAsset).
		SetIndexedSha256(resolveDigest("d")).
		SetEngineDocumentID("engine-stale-" + tag).
		SaveX(ctx)
	openNever := openItem("Resolve Never").
		SaveX(ctx)
	openUningested := openItem("Resolve Uningested").
		SetAssetID(uningestedAsset).
		SaveX(ctx)
	openOrphan := openItem("Resolve Orphan").
		SetAssetID(orphanAsset).
		SetIndexedSha256(resolveDigest("g")).
		SetEngineDocumentID("engine-orphan-" + tag).
		SaveX(ctx)
	openHalf := openItem("Resolve Half").
		SetAssetID(halfAsset).
		SetIndexedSha256(resolveDigest("c")).
		SaveX(ctx)
	hidden := client.ContentItem.Create().
		SetTitle("Resolve Hidden " + tag).
		SetAudience(resolveitem.AudienceOwner).
		SetStatus(resolveitem.StatusPublished).
		SetOwnerPersonID(stranger.ID).
		SaveX(ctx)

	ownItem := func(title string, status resolveitem.Status) *tenantent.ContentItemCreate {
		return client.ContentItem.Create().
			SetTitle(title + " " + tag).
			SetAudience(resolveitem.AudienceSchool).
			SetStatus(status).
			SetOwnerPersonID(person.ID)
	}

	ownDraft := ownItem("Resolve Own Draft", resolveitem.StatusDraft).
		SaveX(ctx)
	ownArchivedIndexed := ownItem("Resolve Own Archived", resolveitem.StatusArchived).
		SetAssetID(retractedAsset).
		SetIndexedSha256(resolveDigest("f")).
		SetEngineDocumentID("engine-retracted-" + tag).
		SaveX(ctx)
	ownDraftOutOfArm := client.ContentItem.Create().
		SetTitle("Resolve Own Draft Off Arm " + tag).
		SetAudience(resolveitem.AudienceSection).
		SetSectionID(section.ID).
		SetStatus(resolveitem.StatusDraft).
		SetOwnerPersonID(person.ID).
		SaveX(ctx)

	newPlacement := func(node *uuid.UUID, item uuid.UUID, status resolveplacement.Status,
		curriculum uuid.UUID) uuid.UUID {
		grain := resolveplacement.GrainNode
		if node == nil {
			grain = resolveplacement.GrainCurriculum
		}
		return client.ContentPlacement.Create().
			SetCurriculumID(curriculum).
			SetNillableCurriculumNodeID(node).
			SetContentItemID(item).
			SetGrain(grain).
			SetStatus(status).
			SaveX(ctx).ID
	}

	confirmedOnTopic := client.ContentPlacement.Create().
		SetCurriculumID(taught.ID).
		SetCurriculumNodeID(topic).
		SetContentItemID(openCurrent.ID).
		SetGrain(resolveplacement.GrainNode).
		SetStatus(resolveplacement.StatusConfirmed).
		SetPageStart(12).
		SetPageEnd(40).
		SaveX(ctx).ID

	world := &resolveWorld{
		t:                  t,
		db:                 db,
		server:             &Server{guard: resolveTeachingGuard()},
		personID:           person.ID,
		stranger:           stranger.ID,
		curriculumID:       taught.ID,
		unit:               unit,
		chapter:            chapter,
		topic:              topic,
		barren:             barren,
		restricted:         restricted,
		pending:            pending,
		states:             states,
		drafted:            drafted,
		invisible:          invisible,
		retracted:          retracted,
		mixed:              mixed,
		orphaned:           orphaned,
		unreached:          unreached,
		openCurrent:        openCurrent.ID,
		openStale:          openStale.ID,
		openNever:          openNever.ID,
		openUningested:     openUningested.ID,
		openHalf:           openHalf.ID,
		hidden:             hidden.ID,
		ownDraft:           ownDraft.ID,
		ownDraftOutOfArm:   ownDraftOutOfArm.ID,
		ownArchivedIndexed: ownArchivedIndexed.ID,
		openOrphan:         openOrphan.ID,
		orphanAsset:        orphanAsset,
		uningestedAsset:    uningestedAsset,
		confirmedOnTopic:   confirmedOnTopic,
		proposedOnTopic: newPlacement(&topic, openStale.ID,
			resolveplacement.StatusProposed, taught.ID),
		rejectedOnTopic: newPlacement(&topic, openNever.ID,
			resolveplacement.StatusRejected, taught.ID),
		onChapter: newPlacement(&chapter, openHalf.ID,
			resolveplacement.StatusConfirmed, taught.ID),
		onUnit: newPlacement(&unit, openCurrent.ID,
			resolveplacement.StatusConfirmed, taught.ID),
		onCurriculum: newPlacement(nil, openStale.ID,
			resolveplacement.StatusConfirmed, taught.ID),
	}

	newPlacement(&restricted, hidden.ID, resolveplacement.StatusConfirmed, taught.ID)
	newPlacement(&pending, openNever.ID, resolveplacement.StatusConfirmed, taught.ID)
	for _, item := range []uuid.UUID{openCurrent.ID, openStale.ID, openNever.ID, openHalf.ID,
		openUningested.ID} {
		newPlacement(&states, item, resolveplacement.StatusConfirmed, taught.ID)
	}
	newPlacement(&drafted, ownDraft.ID, resolveplacement.StatusConfirmed, taught.ID)
	newPlacement(&invisible, ownDraftOutOfArm.ID, resolveplacement.StatusConfirmed, taught.ID)
	newPlacement(&retracted, ownArchivedIndexed.ID, resolveplacement.StatusConfirmed, taught.ID)
	newPlacement(&mixed, ownDraft.ID, resolveplacement.StatusConfirmed, taught.ID)
	newPlacement(&mixed, openNever.ID, resolveplacement.StatusConfirmed, taught.ID)
	newPlacement(&orphaned, openOrphan.ID, resolveplacement.StatusConfirmed, taught.ID)
	newPlacement(&unreached, openCurrent.ID, resolveplacement.StatusConfirmed, unreachable.ID)

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireGenuineScope()
	db.Forget()
	return world
}

func (w *resolveWorld) requireGenuineScope() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.ContentPlacementsRead, authorization.ContentPlacementsReadAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer reads every row and would prove nothing about either gate")
	}
	if viewer.PersonID == nil || *viewer.PersonID != w.personID {
		w.t.Fatalf("the viewer must resolve to the seeded person %s, got %v", w.personID, viewer.PersonID)
	}
	if len(viewer.SectionIDs) == 0 {
		w.t.Fatal("the viewer carries no section, so the placement predicate renders WHERE FALSE " +
			"and every empty result below would pass for the wrong reason")
	}
	if !decision.HasReach || decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the placement decision must carry a teacher-assignment reach, got %+v", decision)
	}

	_, library, err := w.server.scopeFor(w.ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		w.t.Fatalf("the library decision could not be resolved: %v", err)
	}
	if !library.Allowed || library.Reach != authorization.ReachSelf {
		w.t.Fatalf("the library decision must be a genuine narrow grant, got %+v", library)
	}
}

func (w *resolveWorld) withGuard(g resolveGuard) *resolveWorld {
	w.server.guard = g
	return w
}

type resolveTuple struct {
	PlacementID      uuid.UUID  `json:"placement_id"`
	PlacementStatus  string     `json:"placement_status"`
	ContentItemID    uuid.UUID  `json:"content_item_id"`
	ContentNodeID    *uuid.UUID `json:"content_node_id"`
	PageStart        *int       `json:"page_start"`
	PageEnd          *int       `json:"page_end"`
	Grain            string     `json:"grain"`
	CurriculumNodeID *uuid.UUID `json:"curriculum_node_id"`
	Exact            bool       `json:"exact"`
	RetrievalState   string     `json:"retrieval_state"`
	IndexState       string     `json:"index_state"`
	ContentStatus    *string    `json:"content_status"`
	EngineDocumentID *string    `json:"engine_document_id"`
}

type resolveBody struct {
	CurriculumNodeID uuid.UUID      `json:"curriculum_node_id"`
	CurriculumID     uuid.UUID      `json:"curriculum_id"`
	Resolution       string         `json:"resolution"`
	Content          []resolveTuple `json:"content"`
	Count            int            `json:"count"`
	Counts           struct {
		Placements    int `json:"placements"`
		Readable      int `json:"readable"`
		Unreadable    int `json:"unreadable"`
		Exact         int `json:"exact"`
		Indexed       int `json:"indexed"`
		Stale         int `json:"stale"`
		NotIndexed    int `json:"not_indexed"`
		Unpublished   int `json:"unpublished"`
		SourceDeleted int `json:"source_deleted"`
	} `json:"counts"`
	IncludeProposed  bool `json:"include_proposed"`
	IncludeAncestors bool `json:"include_ancestors"`
}

func (w *resolveWorld) call(node uuid.UUID, query string) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", node.String())
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	target := "/api/v1/curriculum-nodes/" + node.String() + "/content" + query
	rec := httptest.NewRecorder()
	w.server.resolveCurriculumNodeContent(rec, httptest.NewRequest("GET", target, nil).WithContext(ctx))
	return rec
}

func (w *resolveWorld) resolve(node uuid.UUID, query string) resolveBody {
	w.t.Helper()

	rec := w.call(node, query)
	if rec.Code != http.StatusOK {
		w.t.Fatalf("want 200 resolving %s%s, got %d: %s",
			node, query, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body resolveBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("the resolution is not JSON: %v (%q)", err, rec.Body.String())
	}
	if body.Count != len(body.Content) {
		w.t.Fatalf("count %d does not match the %d tuples returned", body.Count, len(body.Content))
	}
	if body.Counts.Readable != len(body.Content) {
		w.t.Fatalf("counts.readable %d does not match the %d tuples returned",
			body.Counts.Readable, len(body.Content))
	}
	if body.Counts.Placements != body.Counts.Readable+body.Counts.Unreadable {
		w.t.Fatalf("counts do not add up: %d matched, %d readable, %d unreadable",
			body.Counts.Placements, body.Counts.Readable, body.Counts.Unreadable)
	}
	states := body.Counts.Indexed + body.Counts.Stale + body.Counts.NotIndexed +
		body.Counts.Unpublished + body.Counts.SourceDeleted
	if body.Counts.Readable != states {
		w.t.Fatalf("the retrieval states do not partition the %d readable tuples: %+v",
			body.Counts.Readable, body.Counts)
	}
	return body
}

func resolveItemIDs(rows []resolveTuple) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ContentItemID)
	}
	return ids
}

func resolveHolds(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func resolveRetrievalOf(t *testing.T, rows []resolveTuple, item uuid.UUID) string {
	t.Helper()

	for _, row := range rows {
		if row.ContentItemID == item {
			return row.RetrievalState
		}
	}
	t.Fatalf("content item %s is missing from the resolution %+v", item, resolveItemIDs(rows))
	return ""
}

func resolveStateOf(t *testing.T, rows []resolveTuple, item uuid.UUID) string {
	t.Helper()

	for _, row := range rows {
		if row.ContentItemID == item {
			return row.IndexState
		}
	}
	t.Fatalf("content item %s is missing from the resolution %+v", item, resolveItemIDs(rows))
	return ""
}

func TestResolveReturnsTheTupleForAConfirmedPlacement(t *testing.T) {
	w := newResolveWorld(t)

	body := w.resolve(w.topic, "")
	if body.Resolution != ResolutionResolved {
		t.Fatalf("want %q, got %q", ResolutionResolved, body.Resolution)
	}
	if body.CurriculumNodeID != w.topic || body.CurriculumID != w.curriculumID {
		t.Fatalf("the response must name the node and its curriculum, got %+v", body)
	}
	if len(body.Content) != 1 {
		t.Fatalf("only the confirmed placement resolves, got %+v", resolveItemIDs(body.Content))
	}

	got := body.Content[0]
	if got.PlacementID != w.confirmedOnTopic || got.ContentItemID != w.openCurrent {
		t.Fatalf("the tuple names the wrong placement or item: %+v", got)
	}
	if got.PageStart == nil || *got.PageStart != 12 || got.PageEnd == nil || *got.PageEnd != 40 {
		t.Fatalf("the page range must survive resolution, got %+v", got)
	}
	if !got.Exact || got.CurriculumNodeID == nil || *got.CurriculumNodeID != w.topic {
		t.Fatalf("a placement on the asked-for node must report itself exact, got %+v", got)
	}
	if got.IndexState != IndexStateCurrent {
		t.Fatalf("want index state %q, got %q", IndexStateCurrent, got.IndexState)
	}
	if got.EngineDocumentID == nil || *got.EngineDocumentID == "" {
		t.Fatal("an indexed item must carry the engine document id the engine filters on")
	}
	if body.Counts.Indexed != 1 || body.Counts.Exact != 1 {
		t.Fatalf("want one indexed exact tuple, got %+v", body.Counts)
	}
}

func TestResolveExcludesProposedUntilAskedAndRejectedAlways(t *testing.T) {
	w := newResolveWorld(t)

	body := w.resolve(w.topic, "")
	if ids := resolveItemIDs(body.Content); resolveHolds(ids, w.openStale) {
		t.Fatal("a proposed placement is an unverified auto-mapping and must not resolve by default")
	}

	w.db.Forget()
	body = w.resolve(w.topic, "?include_proposed=true")
	if !body.IncludeProposed {
		t.Fatal("the response must echo the flag it acted on")
	}
	if len(body.Content) != 2 {
		t.Fatalf("the review flag must add the proposed placement, got %+v", body.Content)
	}

	ids := resolveItemIDs(body.Content)
	if !resolveHolds(ids, w.openCurrent) || !resolveHolds(ids, w.openStale) {
		t.Fatalf("both the confirmed and the proposed placement must appear, got %v", ids)
	}
	if resolveHolds(ids, w.openNever) {
		t.Fatal("the rejected placement resolved under include_proposed; rejected must never resolve")
	}
	for _, row := range body.Content {
		if row.PlacementStatus == string(resolveplacement.StatusRejected) {
			t.Fatalf("a rejected placement was returned: %+v", row)
		}
		if row.PlacementID == w.rejectedOnTopic {
			t.Fatalf("the rejected placement %s was returned", w.rejectedOnTopic)
		}
	}
	if body.Counts.Indexed != 1 || body.Counts.Stale != 1 {
		t.Fatalf("want one current and one stale tuple, got %+v", body.Counts)
	}
}

func TestResolveRejectedPlacementsNeverResolveUnderAnyFlag(t *testing.T) {
	w := newResolveWorld(t)

	for _, query := range []string{
		"",
		"?include_proposed=true",
		"?include_ancestors=true",
		"?include_proposed=true&include_ancestors=true",
	} {
		w.db.Forget()
		body := w.resolve(w.topic, query)
		for _, row := range body.Content {
			if row.PlacementID == w.rejectedOnTopic {
				t.Fatalf("the rejected placement resolved under %q", query)
			}
			if row.PlacementStatus == string(resolveplacement.StatusRejected) {
				t.Fatalf("a rejected placement resolved under %q: %+v", query, row)
			}
		}
	}
}

func TestResolveIsExactUntilAncestorsAreAskedFor(t *testing.T) {
	w := newResolveWorld(t)

	body := w.resolve(w.topic, "")
	ids := resolveItemIDs(body.Content)
	if resolveHolds(ids, w.openHalf) {
		t.Fatal("the parent chapter's placement resolved on the topic, which makes an empty " +
			"topic look populated")
	}
	if len(ids) != 1 {
		t.Fatalf("only the topic's own placement resolves by default, got %v", ids)
	}

	w.db.Forget()
	body = w.resolve(w.topic, "?include_ancestors=true")
	if !body.IncludeAncestors {
		t.Fatal("the response must echo the flag it acted on")
	}
	if len(body.Content) != 4 {
		t.Fatalf("the topic, its chapter, its unit and the curriculum-grain placement must all "+
			"resolve, got %+v", body.Content)
	}

	seen := map[uuid.UUID]bool{}
	for _, row := range body.Content {
		seen[row.PlacementID] = true
	}
	for _, want := range []uuid.UUID{w.confirmedOnTopic, w.onChapter, w.onUnit, w.onCurriculum} {
		if !seen[want] {
			t.Fatalf("placement %s is missing from the ancestor walk", want)
		}
	}
	if body.Counts.Exact != 1 {
		t.Fatalf("exactly one of the four is placed on the topic itself, got %+v", body.Counts)
	}

	for _, row := range body.Content {
		switch row.PlacementID {
		case w.confirmedOnTopic:
			if !row.Exact {
				t.Fatalf("the topic's own placement must stay marked exact: %+v", row)
			}
		case w.onCurriculum:
			if row.Exact || row.Grain != string(resolveplacement.GrainCurriculum) ||
				row.CurriculumNodeID != nil {
				t.Fatalf("a curriculum-grain placement carries no node and is never exact: %+v", row)
			}
		default:
			if row.Exact {
				t.Fatalf("an ancestor placement must not claim to be exact: %+v", row)
			}
		}
	}
}

func TestResolveAncestorsDoNotDragInSiblingNodes(t *testing.T) {
	w := newResolveWorld(t)

	body := w.resolve(w.topic, "?include_ancestors=true")
	for _, row := range body.Content {
		if row.CurriculumNodeID == nil {
			continue
		}
		switch *row.CurriculumNodeID {
		case w.topic, w.chapter, w.unit:
		default:
			t.Fatalf("the walk climbed sideways into node %s: %+v", *row.CurriculumNodeID, row)
		}
	}
}

func TestResolveDropsPlacementsPointingAtContentTheCallerCannotRead(t *testing.T) {
	w := newResolveWorld(t)

	rec := w.call(w.restricted, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if strings.Contains(rec.Body.String(), w.hidden.String()) {
		t.Fatalf("the unreadable content item %s leaked into the resolution: %s",
			w.hidden, rec.Body.String())
	}

	var body resolveBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the resolution is not JSON: %v", err)
	}
	if len(body.Content) != 0 {
		t.Fatalf("nothing readable is mapped here, got %+v", body.Content)
	}
	if body.Counts.Placements != 1 || body.Counts.Unreadable != 1 {
		t.Fatalf("the caller must be told one placement was dropped by the library gate, got %+v",
			body.Counts)
	}
	if body.Resolution != ResolutionRestricted {
		t.Fatalf("want %q so refusal is not read as absence, got %q",
			ResolutionRestricted, body.Resolution)
	}
}

func TestResolveRefusesWhenTheLibraryDecisionIsDenied(t *testing.T) {
	w := newResolveWorld(t)

	guard := resolveTeachingGuard()
	guard.library = authorization.Decision{}
	w.withGuard(guard)

	rec := w.call(w.topic, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a denied library decision must refuse, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if strings.Contains(rec.Body.String(), w.openCurrent.String()) {
		t.Fatalf("the refusal leaked a content item id: %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), string(authorization.LibraryRead)) {
		t.Fatalf("the refusal must name the grant it needs, got %s", rec.Body.String())
	}
}

func TestResolveRefusesWhenThePlacementDecisionIsDenied(t *testing.T) {
	w := newResolveWorld(t)

	guard := resolveTeachingGuard()
	guard.placements = authorization.Decision{}
	w.withGuard(guard)

	rec := w.call(w.topic, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a denied placement decision must refuse, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if strings.Contains(rec.Body.String(), w.confirmedOnTopic.String()) {
		t.Fatalf("the refusal leaked a placement id: %s", rec.Body.String())
	}
}

func TestResolveReportsTheThreeIndexStatesApart(t *testing.T) {
	w := newResolveWorld(t)

	body := w.resolve(w.states, "")
	if len(body.Content) != 5 {
		t.Fatalf("all five readable items are mapped here, got %+v", resolveItemIDs(body.Content))
	}

	if got := resolveStateOf(t, body.Content, w.openCurrent); got != IndexStateCurrent {
		t.Fatalf("an item whose indexed digest matches its asset is current, got %q", got)
	}
	if got := resolveStateOf(t, body.Content, w.openStale); got != IndexStateStale {
		t.Fatalf("an item whose asset changed since indexing is stale, got %q", got)
	}
	if got := resolveStateOf(t, body.Content, w.openNever); got != IndexStateNone {
		t.Fatalf("an item with a NULL indexed digest was never indexed, got %q; reporting it "+
			"as stale would send an operator hunting a re-index that never happened", got)
	}
	if got := resolveStateOf(t, body.Content, w.openHalf); got != IndexStateNone {
		t.Fatalf("an item with a matching digest but no engine document is not searchable "+
			"and must read as never indexed, got %q", got)
	}
	if got := resolveStateOf(t, body.Content, w.openUningested); got != IndexStateNone {
		t.Fatalf("an item that has an asset and has never been indexed must read as never "+
			"indexed, got %q; a NULL digest compared against a real one is the comparison "+
			"that turns never-indexed into stale", got)
	}

	if body.Counts.Indexed != 1 || body.Counts.Stale != 1 || body.Counts.NotIndexed != 3 {
		t.Fatalf("want 1 current, 1 stale and 3 never-indexed, got %+v", body.Counts)
	}
	if body.Resolution != ResolutionResolved {
		t.Fatalf("something is searchable here, want %q, got %q",
			ResolutionResolved, body.Resolution)
	}
}

func TestResolveTellsUnmappedFromUnindexedFromRestricted(t *testing.T) {
	w := newResolveWorld(t)

	barren := w.resolve(w.barren, "")
	if barren.Resolution != ResolutionUnmapped {
		t.Fatalf("a node with no placements is unmapped, got %q", barren.Resolution)
	}
	if barren.Counts.Placements != 0 {
		t.Fatalf("nothing is mapped to the barren node, got %+v", barren.Counts)
	}

	w.db.Forget()
	pending := w.resolve(w.pending, "")
	if pending.Resolution != ResolutionUnindexed {
		t.Fatalf("a node mapped only to unindexed content is unindexed, got %q", pending.Resolution)
	}
	if pending.Counts.Placements != 1 || pending.Counts.Readable != 1 ||
		pending.Counts.NotIndexed != 1 {
		t.Fatalf("the mapping is fine and the ingestion is missing, got %+v", pending.Counts)
	}

	w.db.Forget()
	restricted := w.resolve(w.restricted, "")
	if restricted.Resolution != ResolutionRestricted {
		t.Fatalf("a node whose only content is unreadable is restricted, got %q",
			restricted.Resolution)
	}

	if barren.Resolution == pending.Resolution ||
		pending.Resolution == restricted.Resolution ||
		barren.Resolution == restricted.Resolution {
		t.Fatalf("three different situations collapsed into one answer: %q, %q, %q",
			barren.Resolution, pending.Resolution, restricted.Resolution)
	}
	for _, body := range []resolveBody{barren, restricted} {
		if len(body.Content) != 0 {
			t.Fatalf("%q resolves to nothing the engine can search, got %+v",
				body.Resolution, body.Content)
		}
	}
	if len(pending.Content) == 0 {
		t.Fatal("an unindexed mapping is still a mapping and its tuple must be returned, " +
			"otherwise a caller cannot tell it apart from nothing being mapped")
	}
	for _, row := range pending.Content {
		if row.IndexState != IndexStateNone {
			t.Fatalf("every tuple here is waiting on an ingestion, got %+v", row)
		}
	}
}

func TestResolveSaysAnOwnersDraftIsMappedReadableAndNotInTheCorpus(t *testing.T) {
	w := newResolveWorld(t)

	body := w.resolve(w.drafted, "")
	if len(body.Content) != 1 {
		t.Fatalf("the caller owns this draft and must still see it mapped, got %+v", body.Content)
	}

	got := body.Content[0]
	if got.ContentItemID != w.ownDraft {
		t.Fatalf("the wrong item resolved: %+v", got)
	}
	if got.RetrievalState != RetrievalUnpublished {
		t.Fatalf("an unpublished item is deliberately not in the corpus, want %q, got %q",
			RetrievalUnpublished, got.RetrievalState)
	}
	if got.ContentStatus == nil || *got.ContentStatus != string(resolveitem.StatusDraft) {
		t.Fatalf("the caller must be told it is a draft so they know to publish it, got %+v", got)
	}
	if body.Counts.Unpublished != 1 {
		t.Fatalf("the draft must be counted as unpublished, got %+v", body.Counts)
	}
	if body.Counts.Indexed != 0 {
		t.Fatalf("a draft is never retrievable and must not be counted as indexed, got %+v",
			body.Counts)
	}
	if body.Resolution != ResolutionUnpublished {
		t.Fatalf("want %q so nobody reports this as a retrieval bug and fixes it by stamping "+
			"drafts, got %q", ResolutionUnpublished, body.Resolution)
	}
}

func TestResolveNeverCountsAnIndexedButUnpublishedItemAsRetrievable(t *testing.T) {
	w := newResolveWorld(t)

	body := w.resolve(w.retracted, "")
	if len(body.Content) != 1 {
		t.Fatalf("the caller owns this item and must still see it mapped, got %+v", body.Content)
	}

	got := body.Content[0]
	if got.IndexState != IndexStateCurrent {
		t.Fatalf("the engine still holds this text, so the index axis reads current, got %q",
			got.IndexState)
	}
	if got.RetrievalState != RetrievalUnpublished {
		t.Fatalf("it left the corpus when it stopped being published, want %q, got %q",
			RetrievalUnpublished, got.RetrievalState)
	}
	if body.Counts.Indexed != 0 || body.Counts.Unpublished != 1 {
		t.Fatalf("an indexed row that is no longer published must not be counted retrievable, "+
			"got %+v", body.Counts)
	}
	if body.Resolution != ResolutionUnpublished {
		t.Fatalf("want %q, got %q", ResolutionUnpublished, body.Resolution)
	}
}

func TestResolveKeepsUnpublishedApartFromUnindexedWhenBothAreMapped(t *testing.T) {
	w := newResolveWorld(t)

	body := w.resolve(w.mixed, "")
	if len(body.Content) != 2 {
		t.Fatalf("both readable placements resolve, got %+v", body.Content)
	}
	if body.Counts.Unpublished != 1 || body.Counts.NotIndexed != 1 {
		t.Fatalf("one needs publishing and one needs an ingestion; they must not merge, got %+v",
			body.Counts)
	}
	if body.Resolution != ResolutionUnindexed {
		t.Fatalf("a mixed node still has an ingestion outstanding, want %q, got %q",
			ResolutionUnindexed, body.Resolution)
	}

	for _, row := range body.Content {
		switch row.ContentItemID {
		case w.ownDraft:
			if row.RetrievalState != RetrievalUnpublished {
				t.Fatalf("the draft must read unpublished: %+v", row)
			}
		case w.openNever:
			if row.RetrievalState != RetrievalNotIndexed {
				t.Fatalf("the published unindexed item must read not_indexed: %+v", row)
			}
		default:
			t.Fatalf("an unexpected item resolved: %+v", row)
		}
	}
}

func TestResolveDoesNotShowAnOwnedDraftOutsideAnAudienceArm(t *testing.T) {
	w := newResolveWorld(t)

	rec := w.call(w.invisible, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if strings.Contains(rec.Body.String(), w.ownDraftOutOfArm.String()) {
		t.Fatalf("owning a row does not make it readable; an audience arm must admit it first: %s",
			rec.Body.String())
	}

	var body resolveBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the resolution is not JSON: %v", err)
	}
	if len(body.Content) != 0 {
		t.Fatalf("the caller's own draft is audienced to a section their personal scope does "+
			"not reach, so it must not resolve, got %+v", body.Content)
	}
	if body.Counts.Unreadable != 1 {
		t.Fatalf("it must be dropped by the library gate, not counted as unpublished, got %+v",
			body.Counts)
	}
	if body.Resolution != ResolutionRestricted {
		t.Fatalf("want %q, got %q", ResolutionRestricted, body.Resolution)
	}
}

func (w *resolveWorld) deleteAssetThroughTheAPI(asset uuid.UUID) resolveasset.Status {
	w.t.Helper()

	previous := w.server.guard
	guard := resolveTeachingGuard()
	guard.remove = authorization.Decision{
		Allowed:  true,
		Reach:    authorization.ReachSelf,
		HasReach: true,
	}
	w.server.guard = guard
	defer func() { w.server.guard = previous }()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", asset.String())
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	target := "/api/v1/library/assets/" + asset.String()
	rec := httptest.NewRecorder()
	w.server.deleteAsset(rec, httptest.NewRequest("DELETE", target, nil).WithContext(ctx))
	if rec.Code != http.StatusNoContent {
		w.t.Fatalf("the delete handler refused, so nothing downstream is being proved: %d %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row, err := w.db.Client.Asset.Get(context.Background(), asset)
	if err != nil {
		w.t.Fatalf("the asset could not be read back after the delete: %v", err)
	}
	return row.Status
}

func TestResolveStopsCallingContentCurrentOnceItsAssetIsDeleted(t *testing.T) {
	w := newResolveWorld(t)

	before := w.resolve(w.orphaned, "")
	if len(before.Content) != 1 {
		t.Fatalf("the fixture must map exactly one item here, got %+v", before.Content)
	}
	if before.Content[0].RetrievalState != RetrievalCurrent {
		t.Fatalf("the fixture must start in the state that produced the lie, got %q",
			before.Content[0].RetrievalState)
	}
	if before.Resolution != ResolutionResolved || before.Counts.Indexed != 1 {
		t.Fatalf("want a resolved, indexed node before the delete, got %q %+v",
			before.Resolution, before.Counts)
	}

	produced := w.deleteAssetThroughTheAPI(w.orphanAsset)
	if produced == "" {
		t.Fatal("the delete handler wrote no status, so the chain below proves nothing")
	}

	w.db.Forget()
	after := w.resolve(w.orphaned, "")
	if len(after.Content) != 1 {
		t.Fatalf("the placement and the item both survive a soft delete, got %+v", after.Content)
	}

	got := after.Content[0]
	if got.RetrievalState == RetrievalCurrent {
		t.Fatalf("resolve still calls this current after the API set the asset to %q, "+
			"but getAssetLink would refuse the bytes with a 409", produced)
	}
	if got.RetrievalState != RetrievalSourceDeleted {
		t.Fatalf("want %q so the caller knows to retract rather than re-ingest, got %q",
			RetrievalSourceDeleted, got.RetrievalState)
	}
	if got.IndexState != IndexStateCurrent {
		t.Fatalf("the engine still holds text matching the recorded digest, so the raw index "+
			"axis must stay honest, got %q", got.IndexState)
	}
	if after.Counts.Indexed != 0 || after.Counts.SourceDeleted != 1 {
		t.Fatalf("a source-deleted item must not be counted retrievable, got %+v", after.Counts)
	}
	if after.Resolution != ResolutionSourceDeleted {
		t.Fatalf("want %q, got %q", ResolutionSourceDeleted, after.Resolution)
	}
}

func TestResolveDoesNotTellAnyoneToReIngestADeletedSource(t *testing.T) {
	w := newResolveWorld(t)

	w.deleteAssetThroughTheAPI(w.orphanAsset)
	w.db.Forget()

	body := w.resolve(w.orphaned, "")
	if body.Resolution == ResolutionUnindexed {
		t.Fatal("unindexed tells an operator to run an ingestion, which cannot succeed " +
			"against a deleted source")
	}
	if body.Counts.NotIndexed != 0 || body.Counts.Stale != 0 {
		t.Fatalf("neither not_indexed nor stale is the truth here; both invite a re-index, "+
			"got %+v", body.Counts)
	}
	for _, row := range body.Content {
		if row.RetrievalState == RetrievalNotIndexed || row.RetrievalState == RetrievalStale {
			t.Fatalf("the tuple invites a re-index of a deleted source: %+v", row)
		}
	}
}

func TestResolveMarksANeverIndexedItemWhoseSourceWasDeleted(t *testing.T) {
	w := newResolveWorld(t)

	before := w.resolve(w.states, "")
	if got := resolveRetrievalOf(t, before.Content, w.openUningested); got != RetrievalNotIndexed {
		t.Fatalf("this item starts out merely awaiting an ingestion, got %q", got)
	}

	w.deleteAssetThroughTheAPI(w.uningestedAsset)
	w.db.Forget()

	after := w.resolve(w.states, "")
	if got := resolveStateOf(t, after.Content, w.openUningested); got != IndexStateNone {
		t.Fatalf("the raw index axis is unchanged by a delete: it was never indexed, got %q", got)
	}

	got := resolveRetrievalOf(t, after.Content, w.openUningested)
	if got == RetrievalNotIndexed {
		t.Fatal("its source is gone, so telling an operator to run an ingestion sends them " +
			"after a job that cannot succeed")
	}
	if got != RetrievalSourceDeleted {
		t.Fatalf("want %q, got %q", RetrievalSourceDeleted, got)
	}
	if after.Counts.SourceDeleted != 1 {
		t.Fatalf("want one source-deleted tuple, got %+v", after.Counts)
	}
}

func TestResolveOnAnUnreachableCurriculumNodeIsNotFound(t *testing.T) {
	w := newResolveWorld(t)

	rec := w.call(w.unreached, "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable node must be 404, never 403, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if strings.Contains(rec.Body.String(), w.openCurrent.String()) {
		t.Fatalf("the refusal leaked the content mapped to it: %s", rec.Body.String())
	}

	w.db.Forget()
	rec = w.call(uuid.New(), "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unknown node must be 404, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestResolveRefusesUnrecognisedQueryParameters(t *testing.T) {
	w := newResolveWorld(t)

	for _, query := range []string{
		"?include_proposed=yes",
		"?include_ancestors=1",
		"?include_rejected=true",
		"?include_proposals=true",
	} {
		w.db.Forget()
		rec := w.call(w.topic, query)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%q must be refused rather than silently ignored, got %d: %s",
				query, rec.Code, strings.TrimSpace(rec.Body.String()))
		}
	}
}

func TestResolveRefusesAFieldPolicyThatBreaksTheTuple(t *testing.T) {
	w := newResolveWorld(t)

	guard := resolveTeachingGuard()
	guard.placements.Fields = &authorization.FieldPolicy{
		Mode: authorization.FieldModeAllExcept,
		Keys: []string{resolveplacement.FieldPageStart},
	}
	w.withGuard(guard)

	rec := w.call(w.topic, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a policy that hides part of the tuple must refuse the whole resolution, "+
			"got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), resolveplacement.FieldPageStart) {
		t.Fatalf("the refusal must name the denied field, got %s", rec.Body.String())
	}
}

func TestResolveWithholdsTheEngineDocumentIDTheLibraryPolicyDenies(t *testing.T) {
	w := newResolveWorld(t)

	guard := resolveTeachingGuard()
	guard.library.Fields = &authorization.FieldPolicy{
		Mode: authorization.FieldModeAllExcept,
		Keys: []string{resolveitem.FieldEngineDocumentID},
	}
	w.withGuard(guard)

	body := w.resolve(w.topic, "")
	if len(body.Content) != 1 {
		t.Fatalf("the tuple still resolves, got %+v", body.Content)
	}
	if body.Content[0].EngineDocumentID != nil {
		t.Fatalf("the denied field was returned anyway: %+v", body.Content[0])
	}
	if body.Content[0].IndexState != IndexStateCurrent {
		t.Fatalf("the index state is the mapping's own state and must survive, got %q",
			body.Content[0].IndexState)
	}
}

func TestResolveNarrowsBothGatesInSQL(t *testing.T) {
	w := newResolveWorld(t)

	w.db.Forget()
	w.resolve(w.topic, "")

	placements := w.db.QueriesOn("content_placements")
	if len(placements) == 0 {
		t.Fatal("no statement reached content_placements")
	}
	if !strings.Contains(placements[0].Query, "EXISTS (") {
		t.Fatalf("the placement read must be narrowed by the correlated subquery the stub cannot "+
			"evaluate, got %q", placements[0].Query)
	}

	items := w.db.QueriesOn("content_items")
	if len(items) == 0 {
		t.Fatal("the library gate never ran: no statement reached content_items")
	}
	for _, stmt := range items {
		if strings.Contains(stmt.Query, "FALSE") {
			t.Fatalf("the library scope collapsed to a refusal, so nothing was proved: %q",
				stmt.Query)
		}
	}
	if !strings.Contains(items[0].Query, `"audience"`) {
		t.Fatalf("the library gate must narrow by audience, got %q", items[0].Query)
	}
}

func TestResolveDoesNotWriteAnything(t *testing.T) {
	w := newResolveWorld(t)

	w.db.Forget()
	w.resolve(w.topic, "?include_proposed=true&include_ancestors=true")

	for _, stmt := range w.db.Statements() {
		if stmt.Kind != "query" {
			t.Fatalf("a resolution must read only, got a %s: %q", stmt.Kind, stmt.Query)
		}
	}

	row, err := w.db.Client.ContentPlacement.Get(context.Background(), w.rejectedOnTopic)
	if err != nil {
		t.Fatalf("the rejected placement could not be read back: %v", err)
	}
	if row.Status != resolveplacement.StatusRejected {
		t.Fatalf("the resolution changed a placement it refused to serve: %s", row.Status)
	}
}

func TestResolveCountsAreNotLimitedToTheReadablePlacements(t *testing.T) {
	w := newResolveWorld(t)

	body := w.resolve(w.restricted, "")
	if body.Counts.Placements <= body.Counts.Readable {
		t.Fatalf("a caller that gets zero tuples must still learn a placement matched, got %+v",
			body.Counts)
	}

	w.db.Forget()
	empty := w.resolve(w.barren, "")
	if empty.Counts.Placements != 0 {
		t.Fatalf("the unmapped node must report nothing matched, got %+v", empty.Counts)
	}
	if body.Counts.Placements == empty.Counts.Placements {
		t.Fatal("absence and refusal produced the same counts, which is the bug this endpoint " +
			"exists to prevent")
	}
}

func TestResolveIgnoresContentItemsScopedAwayEvenWhenAncestorsAreWalked(t *testing.T) {
	w := newResolveWorld(t)

	rec := w.call(w.restricted, "?include_ancestors=true")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if strings.Contains(rec.Body.String(), w.hidden.String()) {
		t.Fatalf("the ancestor walk leaked the unreadable item: %s", rec.Body.String())
	}

	var body resolveBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the resolution is not JSON: %v", err)
	}
	for _, row := range body.Content {
		if row.ContentItemID == w.hidden {
			t.Fatalf("the unreadable item resolved through an ancestor: %+v", row)
		}
	}
	if body.Counts.Unreadable != 1 {
		t.Fatalf("the hidden placement must still be counted as dropped, got %+v", body.Counts)
	}
}

func TestResolveNodeLineageStopsAtTheCurriculumRoot(t *testing.T) {
	w := newResolveWorld(t)

	client := w.db.Client
	node, err := client.CurriculumNode.Query().
		Where(resolvenode.ID(w.topic)).
		Only(context.Background())
	if err != nil {
		t.Fatalf("the topic could not be read back: %v", err)
	}

	ids, err := curriculumNodeLineage(context.Background(), client, node)
	if err != nil {
		t.Fatalf("the lineage walk failed: %v", err)
	}
	if len(ids) != 3 {
		t.Fatalf("the topic, its chapter and its unit make three, got %v", ids)
	}
	if ids[0] != w.topic || ids[1] != w.chapter || ids[2] != w.unit {
		t.Fatalf("the walk must climb topic, chapter, unit in order, got %v", ids)
	}
}
