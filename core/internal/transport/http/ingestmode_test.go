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
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type ingestModeGuard struct{}

func (ingestModeGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.LibraryCreate,
		authorization.LibraryRead,
		authorization.LibraryReadAll,
		authorization.LibraryWrite,
		authorization.LibraryWriteAll,
		authorization.ContentPlacementsCreate,
		authorization.ContentPlacementsRead,
		authorization.ContentPlacementsReadAll,
		authorization.ContentPlacementsWrite,
		authorization.ContentPlacementsWriteAll:
		return authorization.Decision{Allowed: true}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (ingestModeGuard) Name() string { return "ingest mode test guard" }

type ingestModeWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	personID     uuid.UUID
	pdfAssetID   uuid.UUID
	imageAssetID uuid.UUID
	curriculumID uuid.UUID
	chapterID    uuid.UUID
}

func newIngestModeWorld(t *testing.T) *ingestModeWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Mode").
		SetDisplayName("Mode Owner " + tag).
		SaveX(ctx)

	newAsset := func(name, mime string) uuid.UUID {
		return client.Asset.Create().
			SetStorageKey("library/mode/" + name + "/" + tag).
			SetFileName(name).
			SetMimeType(mime).
			SetSizeBytes(2048).
			SetSha256(strings.Repeat("a", 64)).
			SetStatus("ready").
			SaveX(ctx).ID
	}

	today := time.Now().UTC()
	session := client.AcademicSession.Create().
		SetName("Mode Session " + tag).
		SetCode("MSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)
	grade := client.GradeLevel.Create().
		SetName("Mode Grade " + tag).
		SetCode("MGR-" + tag).
		SetSequence(1).
		SaveX(ctx)
	subject := client.Subject.Create().
		SetName("Mode Subject " + tag).
		SetCode("MSU-" + tag).
		SaveX(ctx)
	curriculum := client.Curriculum.Create().
		SetName("Mode Curriculum " + tag).
		SetCode("MCU-" + tag).
		SetAcademicSessionID(session.ID).
		SetSubjectID(subject.ID).
		SetGradeLevelID(grade.ID).
		SaveX(ctx)
	chapter := client.CurriculumNode.Create().
		SetCurriculumID(curriculum.ID).
		SetKind(entnode.KindChapter).
		SetTitle("Mode Chapter " + tag).
		SetSequence(1).
		SaveX(ctx)

	world := &ingestModeWorld{
		t:            t,
		db:           db,
		server:       &Server{guard: ingestModeGuard{}},
		personID:     person.ID,
		pdfAssetID:   newAsset("textbook.pdf", "application/pdf"),
		imageAssetID: newAsset("whiteboard.jpg", "image/jpeg"),
		curriculumID: curriculum.ID,
		chapterID:    chapter.ID,
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})
	db.Forget()
	return world
}

func (w *ingestModeWorld) call(handler http.HandlerFunc, method, target, body string,
	id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	ctx := w.ctx
	if id != uuid.Nil {
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	}

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest(method, target, strings.NewReader(body)).WithContext(ctx))
	return rec
}

func (w *ingestModeWorld) createItem(body string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)
}

func (w *ingestModeWorld) patchItem(id uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.server.updateLibraryItem, "PATCH", "/api/v1/library/"+id.String(), body, id)
}

func (w *ingestModeWorld) patchPlacement(id uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.server.updatePlacement, "PATCH", "/api/v1/placements/"+id.String(), body, id)
}

func (w *ingestModeWorld) item(mode entcontentitem.IngestMode, asset uuid.UUID) uuid.UUID {
	w.t.Helper()

	return w.db.Client.ContentItem.Create().
		SetTitle("Mode Atlas " + uuid.NewString()[:8]).
		SetKind(entcontentitem.KindBook).
		SetAudience(entcontentitem.AudienceSchool).
		SetOwnerPersonID(w.personID).
		SetAssetID(asset).
		SetIngestMode(mode).
		SaveX(context.Background()).ID
}

func (w *ingestModeWorld) placement(item uuid.UUID, node *uuid.UUID,
	status entplacement.Status) uuid.UUID {
	w.t.Helper()

	create := w.db.Client.ContentPlacement.Create().
		SetCurriculumID(w.curriculumID).
		SetContentItemID(item).
		SetStatus(status).
		SetGrain(entplacement.GrainCurriculum)
	if node != nil {
		create = create.SetCurriculumNodeID(*node).SetGrain(entplacement.GrainNode)
	}
	return create.SaveX(context.Background()).ID
}

func (w *ingestModeWorld) reload(id uuid.UUID) *tenantent.ContentItem {
	w.t.Helper()

	row, err := w.db.Client.ContentItem.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("content item %s could not be read back: %v", id, err)
	}
	return row
}

func (w *ingestModeWorld) reloadPlacement(id uuid.UUID) *tenantent.ContentPlacement {
	w.t.Helper()

	row, err := w.db.Client.ContentPlacement.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("placement %s could not be read back: %v", id, err)
	}
	return row
}

func (w *ingestModeWorld) items() int {
	w.t.Helper()

	n, err := w.db.Client.ContentItem.Query().Count(context.Background())
	if err != nil {
		w.t.Fatalf("the content items could not be counted: %v", err)
	}
	return n
}

func createdItemID(t *testing.T, rec *httptest.ResponseRecorder) uuid.UUID {
	t.Helper()

	var body struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response is not JSON: %v (%q)", err, rec.Body.String())
	}
	return body.ID
}

func itemBody(fields map[string]any) string {
	raw, err := json.Marshal(fields)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func TestCreatingALibraryItemWithoutAModeDefersAPDF(t *testing.T) {
	w := newIngestModeWorld(t)

	rec := w.createItem(itemBody(map[string]any{
		"title":    "Atlas",
		"audience": string(entcontentitem.AudienceSchool),
		"asset_id": w.pdfAssetID,
	}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row := w.reload(createdItemID(t, rec))
	if row.IngestMode != entcontentitem.IngestModeDefer {
		t.Fatalf("a PDF uploaded without naming a mode stored %q; the immediate path "+
			"proposes no chapter split and crops no figures, so a PDF has to be held",
			row.IngestMode)
	}
	if !strings.Contains(rec.Body.String(), "\"ingest_mode\":\"defer\"") {
		t.Fatalf("the created item does not report its ingest_mode: %s", rec.Body.String())
	}
}

func TestCreatingALibraryItemWithoutAModeIngestsANonPDFNow(t *testing.T) {
	w := newIngestModeWorld(t)
	before := w.items()

	rec := w.createItem(itemBody(map[string]any{
		"title":    "Whiteboard",
		"audience": string(entcontentitem.AudienceSchool),
		"asset_id": w.imageAssetID,
	}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: a caller who never mentioned ingest_mode did not ask "+
			"to defer and must not be refused for it: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row := w.reload(createdItemID(t, rec))
	if row.IngestMode != entcontentitem.IngestModeNow {
		t.Fatalf("a non-PDF uploaded without naming a mode stored %q; there is no "+
			"chapter-shaped pipeline for an image to wait for", row.IngestMode)
	}
	if after := w.items(); after != before+1 {
		t.Fatalf("%d items were written, want 1", after-before)
	}
}

func TestCreatingALibraryItemWithoutAModeOrAnAssetIngestsNow(t *testing.T) {
	w := newIngestModeWorld(t)

	rec := w.createItem(itemBody(map[string]any{
		"title":    "A note with no bytes",
		"audience": string(entcontentitem.AudienceSchool),
	}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: a note names no asset, so there is nothing to hold "+
			"and nothing to refuse: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row := w.reload(createdItemID(t, rec))
	if row.IngestMode != entcontentitem.IngestModeNow {
		t.Fatalf("an item with no asset stored %q", row.IngestMode)
	}
}

func TestCreatingALibraryItemAcceptsDeferForAPDF(t *testing.T) {
	w := newIngestModeWorld(t)

	rec := w.createItem(itemBody(map[string]any{
		"title":       "Atlas",
		"audience":    string(entcontentitem.AudienceSchool),
		"asset_id":    w.pdfAssetID,
		"ingest_mode": "defer",
	}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row := w.reload(createdItemID(t, rec))
	if row.IngestMode != entcontentitem.IngestModeDefer {
		t.Fatalf("ingest_mode stored %q, want defer", row.IngestMode)
	}
}

func TestCreatingALibraryItemRefusesDeferForANonPDF(t *testing.T) {
	w := newIngestModeWorld(t)
	before := w.items()

	rec := w.createItem(itemBody(map[string]any{
		"title":       "Whiteboard",
		"audience":    string(entcontentitem.AudienceSchool),
		"asset_id":    w.imageAssetID,
		"ingest_mode": "defer",
	}))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "whiteboard.jpg") {
		t.Fatalf("the refusal does not name the file it refused: %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "OCR") {
		t.Fatalf("the refusal does not say that OCR runs immediately anyway, so the "+
			"caller is not told what to do instead: %s", rec.Body.String())
	}
	if after := w.items(); after != before {
		t.Fatalf("%d items were written despite the refusal", after-before)
	}
}

func TestCreatingALibraryItemRefusesDeferWithNoAsset(t *testing.T) {
	w := newIngestModeWorld(t)

	rec := w.createItem(itemBody(map[string]any{
		"title":       "Nothing to hold",
		"audience":    string(entcontentitem.AudienceSchool),
		"ingest_mode": "defer",
	}))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestCreatingALibraryItemRefusesAnUnknownIngestMode(t *testing.T) {
	w := newIngestModeWorld(t)

	rec := w.createItem(itemBody(map[string]any{
		"title":       "Atlas",
		"audience":    string(entcontentitem.AudienceSchool),
		"asset_id":    w.pdfAssetID,
		"ingest_mode": "later",
	}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestMovingAnItemToDeferIsRefusedWhenAChapterIsConfirmed(t *testing.T) {
	w := newIngestModeWorld(t)

	item := w.item(entcontentitem.IngestModeNow, w.pdfAssetID)
	w.placement(item, &w.chapterID, entplacement.StatusConfirmed)

	rec := w.patchItem(item, itemBody(map[string]any{"ingest_mode": "defer"}))
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if body := rec.Body.String(); !strings.Contains(body, "mints its document later") {
		t.Fatalf("the refusal does not explain that the document is minted later: %s", body)
	}
	if row := w.reload(item); row.IngestMode != entcontentitem.IngestModeNow {
		t.Fatalf("ingest_mode is %q after a refused move; the tags would be silently "+
			"dropped at ingest", row.IngestMode)
	}
}

func TestMovingAnItemToDeferIsAllowedWhenTheChapterIsOnlyProposed(t *testing.T) {
	w := newIngestModeWorld(t)

	item := w.item(entcontentitem.IngestModeNow, w.pdfAssetID)
	w.placement(item, &w.chapterID, entplacement.StatusProposed)

	rec := w.patchItem(item, itemBody(map[string]any{"ingest_mode": "defer"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if row := w.reload(item); row.IngestMode != entcontentitem.IngestModeDefer {
		t.Fatalf("ingest_mode is %q; a proposed placement is never sent to the engine, "+
			"so nothing could be dropped", row.IngestMode)
	}
}

func TestMovingAnItemToDeferIgnoresAWholeCurriculumPlacement(t *testing.T) {
	w := newIngestModeWorld(t)

	item := w.item(entcontentitem.IngestModeNow, w.pdfAssetID)
	w.placement(item, nil, entplacement.StatusConfirmed)

	rec := w.patchItem(item, itemBody(map[string]any{"ingest_mode": "defer"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: a whole-curriculum placement carries no node and is "+
			"never sent as a curriculum_node_id: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestMovingAnItemToDeferIsRefusedForANonPDF(t *testing.T) {
	w := newIngestModeWorld(t)

	item := w.item(entcontentitem.IngestModeNow, w.imageAssetID)

	rec := w.patchItem(item, itemBody(map[string]any{"ingest_mode": "defer"}))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if row := w.reload(item); row.IngestMode != entcontentitem.IngestModeNow {
		t.Fatalf("ingest_mode is %q after a refused move", row.IngestMode)
	}
}

func TestEditingADeferredItemWithoutNamingTheModeLeavesItAlone(t *testing.T) {
	w := newIngestModeWorld(t)

	item := w.item(entcontentitem.IngestModeDefer, w.pdfAssetID)

	rec := w.patchItem(item, itemBody(map[string]any{"title": "Renamed"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if row := w.reload(item); row.IngestMode != entcontentitem.IngestModeDefer {
		t.Fatalf("an edit that never mentioned ingest_mode reset it to %q", row.IngestMode)
	}
}

func TestConfirmingAChapterIsRefusedOnADeferredItem(t *testing.T) {
	w := newIngestModeWorld(t)

	item := w.item(entcontentitem.IngestModeDefer, w.pdfAssetID)
	placement := w.placement(item, &w.chapterID, entplacement.StatusProposed)

	rec := w.patchPlacement(placement, itemBody(map[string]any{"status": "confirmed"}))
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: the same conflict arriving from the other direction "+
			"must be refused the same way: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if body := rec.Body.String(); !strings.Contains(body, "mints its document later") {
		t.Fatalf("the refusal does not explain that the document is minted later: %s", body)
	}

	row := w.reloadPlacement(placement)
	if row.Status != entplacement.StatusProposed {
		t.Fatalf("the placement is %q after a refused confirmation", row.Status)
	}
	if row.ConfirmedBy != nil || row.ConfirmedAt != nil {
		t.Fatal("a refused confirmation stamped a confirmer, which reads as confirmed")
	}
}

func TestConfirmingAChapterIsAllowedWhenTheItemIngestsNow(t *testing.T) {
	w := newIngestModeWorld(t)

	item := w.item(entcontentitem.IngestModeNow, w.pdfAssetID)
	placement := w.placement(item, &w.chapterID, entplacement.StatusProposed)

	rec := w.patchPlacement(placement, itemBody(map[string]any{"status": "confirmed"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if row := w.reloadPlacement(placement); row.Status != entplacement.StatusConfirmed {
		t.Fatalf("the placement is %q, want confirmed", row.Status)
	}
}

func TestConfirmingAWholeCurriculumPlacementIsAllowedOnADeferredItem(t *testing.T) {
	w := newIngestModeWorld(t)

	item := w.item(entcontentitem.IngestModeDefer, w.pdfAssetID)
	placement := w.placement(item, nil, entplacement.StatusProposed)

	rec := w.patchPlacement(placement, itemBody(map[string]any{"status": "confirmed"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: a whole-curriculum placement carries no chapter tag "+
			"and is never sent to the engine: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestRejectingAPlacementIsAllowedOnADeferredItem(t *testing.T) {
	w := newIngestModeWorld(t)

	item := w.item(entcontentitem.IngestModeDefer, w.pdfAssetID)
	placement := w.placement(item, &w.chapterID, entplacement.StatusProposed)

	rec := w.patchPlacement(placement, itemBody(map[string]any{"status": "rejected"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: refusing a suggestion sends nothing anywhere: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}
