package http

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mindmap"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	MindmapDisabledCode    = "mindmap_disabled"
	MindmapUnmappedCode    = "mindmap_tenant_unmapped"
	MindmapNotIndexedCode  = "mindmap_not_indexed"
	MindmapRefusedCode     = "mindmap_upstream_refused"
	MindmapEngineDownCode  = "mindmap_engine_unavailable"
	MindmapServiceDownCode = "mindmap_service_unavailable"
)

const (
	MindmapAvailable  = "available"
	MindmapHeld       = "held"
	MindmapParked     = "parked"
	MindmapPending    = "pending"
	MindmapFailed     = "failed"
	MindmapNotIndexed = "not_indexed"
)

const (
	mindmapItemParam    = "item_id"
	mindmapSectionParam = "section_id"
	mindmapNodeParam    = "node_id"

	mindmapChapterNotFound = "chapter not found in this book"
)

const mindmapsUnavailable = "mind maps are switched off on this deployment, so no book can be " +
	"listed and no map drawn; an empty list would read as a school with no books. Set " +
	"MINDMAP_ENABLED and MINDMAP_ENGINE_BASE_URL to turn them on"

var mindmapService *mindmap.Client

func UseMindmaps(c *mindmap.Client) { mindmapService = c }

func (s *Server) mountLearning(r chi.Router) {
	r.Route("/learning/mindmaps", func(r chi.Router) {
		read := s.can(authorization.MindmapsRead)
		chapter := "/{" + mindmapItemParam + "}/chapters/{" + mindmapSectionParam + "}"

		r.With(read).Get("/", s.listMindmapBooks)
		r.With(read).Get("/{"+mindmapItemParam+"}/chapters", s.listMindmapChapters)
		r.With(read).Get(chapter, s.getMindmap)
		r.With(read).Get(chapter+"/nodes/{"+mindmapNodeParam+"}", s.getMindmapNode)
		r.With(read).Get(chapter+"/trace", s.traceMindmap)
		r.With(read).Get(chapter+"/drill", s.getMindmapDrill)
		r.With(read).Post(chapter+"/drill/grade", s.gradeMindmapDrill)
		r.With(s.can(authorization.ConceptMasteryRead), read).Get(chapter+"/mastery", s.getMindmapMastery)
		r.With(s.can(authorization.ConceptMasteryWrite), read).Put(chapter+"/mastery", s.putMindmapMastery)
	})
}

func refuseMindmap(w http.ResponseWriter, status int, code, message string) {
	response.JSON(w, status, response.Envelope{
		"error":   http.StatusText(status),
		"message": message,
		"code":    code,
	})
}

func (s *Server) mindmapsOn(w http.ResponseWriter) bool {
	if s.cfg != nil && s.cfg.Mindmapping() && mindmapService != nil {
		return true
	}
	refuseMindmap(w, http.StatusServiceUnavailable, MindmapDisabledCode, mindmapsUnavailable)
	return false
}

func mindmapStateOf(row *tenantent.ContentItem) string {
	if mindmapDocumentOf(row) != "" {
		return MindmapAvailable
	}
	switch row.IndexStatus {
	case entcontentitem.IndexStatusHeld:
		return MindmapHeld
	case entcontentitem.IndexStatusParked:
		return MindmapParked
	case entcontentitem.IndexStatusPending:
		return MindmapPending
	case entcontentitem.IndexStatusFailed:
		return MindmapFailed
	default:
		return MindmapNotIndexed
	}
}

func mindmapDocumentOf(row *tenantent.ContentItem) string {
	if row.EngineDocumentID == nil {
		return ""
	}
	return strings.TrimSpace(*row.EngineDocumentID)
}

func mindmapStateReason(state string) string {
	switch state {
	case MindmapHeld:
		return "this item's material has been uploaded and is held for a GPU build that has " +
			"not been published yet; the material exists and its map can be drawn once that " +
			"build is published"
	case MindmapParked:
		return "the retrieval engine parked this item's upload until its chapters are " +
			"confirmed, so there is no map to draw until they are"
	case MindmapPending:
		return "this item is queued for indexing, so there is no map to draw until that finishes"
	case MindmapFailed:
		return "indexing this item failed, so there is no map to draw until it is indexed again"
	default:
		return "this item has not been indexed by the retrieval engine, so there is no map to draw"
	}
}

func refuseUnindexedMindmap(w http.ResponseWriter, row *tenantent.ContentItem) {
	state := mindmapStateOf(row)
	response.JSON(w, http.StatusConflict, response.Envelope{
		"error":         http.StatusText(http.StatusConflict),
		"message":       mindmapStateReason(state),
		"code":          MindmapNotIndexedCode,
		"index_status":  string(row.IndexStatus),
		"mindmap_state": state,
	})
}

func (s *Server) mindmapLibraryScope(ctx context.Context,
	w http.ResponseWriter) (*access.Viewer, authorization.Decision, bool) {

	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, authorization.Decision{}, false
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"a mind map is drawn from a library item, so reading one also requires "+
				string(authorization.LibraryRead))
		return nil, authorization.Decision{}, false
	}
	return viewer, decision, true
}

func mindmapBookOf(row *tenantent.ContentItem, policy *authorization.FieldPolicy) response.Envelope {
	book := response.Envelope{
		entcontentitem.FieldID: row.ID,
		"mindmap_state":        mindmapStateOf(row),
	}
	for name, value := range map[string]any{
		entcontentitem.FieldTitle:        row.Title,
		entcontentitem.FieldKind:         row.Kind,
		entcontentitem.FieldSubjectID:    row.SubjectID,
		entcontentitem.FieldGradeLevelID: row.GradeLevelID,
		entcontentitem.FieldIndexStatus:  row.IndexStatus,
	} {
		if policy.Permits(name) {
			book[name] = value
		}
	}
	return book
}

func (s *Server) listMindmapBooks(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	if !s.mindmapsOn(w) {
		return
	}

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseLibraryFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, ok := s.mindmapLibraryScope(ctx, w)
	if !ok {
		return
	}

	rows, err := filters.apply(client.ContentItem.Query().
		Where(access.LibraryItemsFor(viewer, decision))).
		Order(tenantent.Desc(entcontentitem.FieldCreatedAt)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	books := make([]response.Envelope, 0, len(rows))
	for _, row := range rows {
		books = append(books, mindmapBookOf(row, decision.Fields))
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"mindmaps": books,
		"count":    len(rows),
		"page":     pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

type mindmapBook struct {
	item     uuid.UUID
	document string
	caller   mindmap.Caller
}

func (s *Server) mindmapBookFor(w http.ResponseWriter, r *http.Request) (mindmapBook, bool) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return mindmapBook{}, false
	}
	id, ok := idParam(w, r, mindmapItemParam)
	if !ok {
		return mindmapBook{}, false
	}

	viewer, decision, ok := s.mindmapLibraryScope(ctx, w)
	if !ok {
		return mindmapBook{}, false
	}

	row, err := client.ContentItem.Query().
		Where(entcontentitem.ID(id), access.LibraryItemsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "library item not found")
		return mindmapBook{}, false
	}

	document := mindmapDocumentOf(row)
	if document == "" {
		refuseUnindexedMindmap(w, row)
		return mindmapBook{}, false
	}

	caller, ok := mindmapCallerFor(ctx, w)
	if !ok {
		return mindmapBook{}, false
	}
	return mindmapBook{item: row.ID, document: document, caller: caller}, true
}

func mindmapCallerFor(ctx context.Context, w http.ResponseWriter) (mindmap.Caller, bool) {
	tenant, err := tenancy.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return mindmap.Caller{}, false
	}
	slug := strings.TrimSpace(tenant.CASTenantID)
	if slug == "" {
		observability.Step(ctx, observability.ComponentTenancy,
			"no mind map drawn: this school has no CAS tenant slug and the engine partitions on one",
			"school_id", tenant.SchoolID)
		refuseMindmap(w, http.StatusServiceUnavailable, MindmapUnmappedCode,
			"this school carries no CAS tenant slug and the retrieval engine partitions on one, "+
				"so there is no corpus to draw a map from; an operator must map the school first")
		return mindmap.Caller{}, false
	}

	subject, err := authorization.SubjectFrom(ctx)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "authentication is required")
		return mindmap.Caller{}, false
	}
	return mindmap.Caller{Tenant: slug, Bearer: subject.RawToken}, true
}
