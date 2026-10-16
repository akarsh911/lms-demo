package http

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/internal/retrieval"
	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	SearchDisabledCode    = "retrieval_disabled"
	SearchUnavailableCode = "retrieval_unavailable"
	SearchRefusedCode     = "retrieval_refused"
	SearchUnmappedCode    = "retrieval_tenant_unmapped"
	SearchUnboundedCode   = "search_scope_unbounded"
)

const (
	DefaultSearchTopK  = 10
	MaxSearchTopK      = 50
	MaxSearchDocuments = maxResolvedPlacements
)

var librarySearcher *indexing.Client

func UseSearcher(c *indexing.Client) { librarySearcher = c }

type searchOptions struct {
	Query string
	Node  *uuid.UUID
	TopK  int
	resolveOptions
}

func parseSearchOptions(values url.Values) (searchOptions, error) {
	p := filter.New(values)

	opts := searchOptions{
		Query: strings.TrimSpace(p.String("q")),
		Node:  p.UUID("curriculum_node_id"),
		TopK:  p.Int("top_k", DefaultSearchTopK),
	}

	proposed, err := resolveFlag(p, "include_proposed")
	if err != nil {
		return searchOptions{}, err
	}
	ancestors, err := resolveFlag(p, "include_ancestors")
	if err != nil {
		return searchOptions{}, err
	}
	opts.resolveOptions = resolveOptions{IncludeProposed: proposed, IncludeAncestors: ancestors}

	if err := p.Err(); err != nil {
		return searchOptions{}, err
	}
	if opts.Query == "" {
		return searchOptions{}, &filter.Error{Param: "q", Reason: "is required"}
	}
	if opts.TopK < 1 || opts.TopK > MaxSearchTopK {
		return searchOptions{}, &filter.Error{
			Param:  "top_k",
			Reason: "must be between 1 and " + strconv.Itoa(MaxSearchTopK),
		}
	}
	return opts, nil
}

type pageSpan struct {
	from int
	to   int
}

type documentPages struct {
	whole bool
	spans []pageSpan
}

func (d documentPages) admits(at *int) bool {
	if d.whole || len(d.spans) == 0 {
		return true
	}
	if at == nil {
		return true
	}
	for _, span := range d.spans {
		if *at >= span.from && *at <= span.to {
			return true
		}
	}
	return false
}

func (d documentPages) bounded() bool { return !d.whole && len(d.spans) > 0 }

type documentItems map[uuid.UUID]documentPages

type searchScope struct {
	documents   []string
	byDocument  map[string]documentItems
	wholeTenant bool
	stale       int
	resolution  string
}

func (sc *searchScope) add(document string, item uuid.UUID, from, to *int, stale bool) {
	items, known := sc.byDocument[document]
	if !known {
		items = documentItems{}
		sc.byDocument[document] = items
		sc.documents = append(sc.documents, document)
		if stale {
			sc.stale++
		}
	}
	pages := items[item]
	if from == nil || to == nil {
		pages.whole = true
	} else {
		pages.spans = append(pages.spans, pageSpan{from: *from, to: *to})
	}
	items[item] = pages
}

func (sc *searchScope) admit(document string, reachable []uuid.UUID, at *int) []uuid.UUID {
	items, known := sc.byDocument[document]
	if !known {
		return reachable
	}
	kept := make([]uuid.UUID, 0, len(reachable))
	for _, item := range reachable {
		pages, placed := items[item]
		if !placed || !pages.admits(at) {
			continue
		}
		kept = append(kept, item)
	}
	return kept
}

func (sc *searchScope) sole() *indexing.PageRange {
	var only *pageSpan
	for _, items := range sc.byDocument {
		for _, pages := range items {
			if !pages.bounded() || len(pages.spans) != 1 {
				return nil
			}
			span := pages.spans[0]
			if only == nil {
				only = &span
				continue
			}
			if *only != span {
				return nil
			}
		}
	}
	if only == nil {
		return nil
	}
	return &indexing.PageRange{From: only.from, To: only.to}
}

func newSearchScope() *searchScope {
	return &searchScope{byDocument: map[string]documentItems{}, resolution: ResolutionResolved}
}

func (s *Server) searchLibrary(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	if s.cfg == nil || !s.cfg.RetrievalSearching() || librarySearcher == nil {
		refuseSearch(w, http.StatusServiceUnavailable, SearchDisabledCode,
			"retrieval search is switched off on this deployment, so no passage can be "+
				"returned; an empty result would read as an empty library. Set "+
				"RETRIEVAL_SEARCH_ENABLED and RETRIEVAL_ENGINE_BASE_URL to turn it on")
		return
	}

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	tenant, err := tenancy.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if strings.TrimSpace(tenant.CASTenantID) == "" {
		refuseSearch(w, http.StatusConflict, SearchUnmappedCode,
			"this school carries no CAS tenant slug and the retrieval engine partitions on "+
				"one, so there is no corpus to ask; an operator must map the school first")
		return
	}

	opts, err := parseSearchOptions(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"searching the library requires "+string(authorization.LibraryRead))
		return
	}

	scopes, err := retrieval.ScopesFor(viewer, decision, tenant.SchoolID)
	if err != nil {
		writeScopesErr(ctx, w, err)
		return
	}

	scope, ok := s.searchScopeFor(ctx, w, r, client, opts, viewer, decision, scopes)
	if !ok {
		return
	}
	if !scope.wholeTenant && len(scope.documents) == 0 {
		writeSearchAnswer(ctx, w, opts, scope, nil, searchDrops{}, true)
		return
	}

	result, err := librarySearcher.Search(ctx, indexing.SearchRequest{
		Tenant:      tenant.CASTenantID,
		Query:       opts.Query,
		DocumentIDs: scope.documents,
		WholeTenant: scope.wholeTenant,
		PageRange:   scope.sole(),
		TopK:        opts.TopK,
	})
	if err != nil {
		writeSearchErr(ctx, w, err)
		return
	}

	kept, drops, err := s.recheckPassages(ctx, client, result.Passages, scope, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	writeSearchAnswer(ctx, w, opts, scope, kept, drops, result.NoGoodMatch)
}

func (s *Server) searchScopeFor(ctx context.Context, w http.ResponseWriter, r *http.Request,
	client *tenantent.Client, opts searchOptions, viewer *access.Viewer,
	decision authorization.Decision, scopes retrieval.Scopes) (*searchScope, bool) {

	if opts.Node != nil {
		return s.curriculumSearchScope(ctx, w, r, client, opts, viewer, decision)
	}
	if scopes.Unrestricted() {
		scope := newSearchScope()
		scope.wholeTenant = true
		return scope, true
	}
	return s.reachableSearchScope(ctx, w, client, viewer, decision)
}

func (s *Server) reachableSearchScope(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, viewer *access.Viewer,
	decision authorization.Decision) (*searchScope, bool) {

	rows, err := client.ContentItem.Query().
		Where(
			access.LibraryItemsFor(viewer, decision),
			entitem.EngineDocumentIDNotNil(),
			entitem.IndexedSha256NotNil(),
		).
		Order(tenantent.Asc(entitem.FieldID)).
		Limit(MaxSearchDocuments + 1).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	if len(rows) > MaxSearchDocuments {
		refuseSearch(w, http.StatusConflict, SearchUnboundedCode,
			"more than "+strconv.Itoa(MaxSearchDocuments)+" documents are readable by you, "+
				"and a truncated document filter would search a subset of your library "+
				"without saying so; narrow the search with curriculum_node_id")
		return nil, false
	}

	scope := newSearchScope()
	for _, row := range rows {
		scope.add(*row.EngineDocumentID, row.ID, nil, nil, false)
	}
	if len(scope.documents) == 0 {
		scope.resolution = ResolutionRestricted
	}
	return scope, true
}

func (s *Server) curriculumSearchScope(ctx context.Context, w http.ResponseWriter, r *http.Request,
	client *tenantent.Client, opts searchOptions, libraryViewer *access.Viewer,
	libraryDecision authorization.Decision) (*searchScope, bool) {

	viewer, decision, err := s.scopeFor(ctx,
		authorization.ContentPlacementsRead, authorization.ContentPlacementsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"searching a curriculum node requires "+string(authorization.ContentPlacementsRead))
		return nil, false
	}
	if !requireResolvedFields(w, r, decision) {
		return nil, false
	}

	node, err := client.CurriculumNode.Query().
		Where(entnode.ID(*opts.Node), access.CurriculumNodesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resolveNodeNotFound)
		return nil, false
	}

	nodes := []uuid.UUID{node.ID}
	if opts.IncludeAncestors {
		if nodes, err = curriculumNodeLineage(ctx, client, node); err != nil {
			writeTenancyErr(w, err)
			return nil, false
		}
	}

	rows, err := client.ContentPlacement.Query().
		Where(
			access.ContentPlacementsFor(viewer, decision),
			entplacement.StatusIn(resolvableStatuses(opts.IncludeProposed)...),
			placementsResolving(nodes, node.CurriculumID, opts.IncludeAncestors),
		).
		Order(tenantent.Asc(entplacement.FieldCreatedAt), tenantent.Asc(entplacement.FieldID)).
		Limit(maxResolvedPlacements + 1).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	if len(rows) > maxResolvedPlacements {
		refuseUnboundedResolution(w, node.ID)
		return nil, false
	}

	items, err := readablePlacedItems(ctx, client, rows, libraryViewer, libraryDecision)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	assets, err := placedAssets(ctx, client, items, libraryViewer, libraryDecision)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	scope := newSearchScope()
	counts := resolvedCounts{Placements: len(rows)}
	for _, row := range rows {
		item, readable := items[row.ContentItemID]
		if !readable {
			counts.Unreadable++
			continue
		}
		index := indexStateOf(item, assets)
		countResolved(&counts, resolvedPlacement{
			Exact:          row.CurriculumNodeID != nil && *row.CurriculumNodeID == node.ID,
			RetrievalState: retrievalStateOf(item, assets, index),
			IndexState:     index,
		})
		if item.EngineDocumentID == nil || index == IndexStateNone {
			continue
		}
		if sourceDeleted(item, assets) {
			continue
		}
		scope.add(*item.EngineDocumentID, item.ID, row.PageStart, row.PageEnd,
			index == IndexStateStale)
	}
	scope.resolution = resolutionOf(counts)
	return scope, true
}

type searchDrops struct {
	Unreachable  int `json:"unreachable"`
	Unidentified int `json:"unidentified"`
	OutOfScope   int `json:"out_of_scope"`
}

type searchPassage struct {
	indexing.Passage
	ContentItemID  uuid.UUID   `json:"content_item_id"`
	ContentItemIDs []uuid.UUID `json:"content_item_ids"`
}

func (s *Server) recheckPassages(ctx context.Context, client *tenantent.Client,
	passages []indexing.Passage, scope *searchScope, viewer *access.Viewer,
	decision authorization.Decision) ([]searchPassage, searchDrops, error) {

	drops := searchDrops{}
	named := make([]string, 0, len(passages))
	for _, passage := range passages {
		if id := passage.DocumentID(); id != "" {
			named = append(named, id)
		}
	}

	reachable, err := reachableDocuments(ctx, client, named, viewer, decision)
	if err != nil {
		return nil, searchDrops{}, err
	}

	kept := make([]searchPassage, 0, len(passages))
	for _, passage := range passages {
		document := passage.DocumentID()
		if document == "" {
			drops.Unidentified++
			continue
		}
		items := reachable[document]
		if len(items) == 0 {
			drops.Unreachable++
			continue
		}
		items = scope.admit(document, items, passage.At())
		if len(items) == 0 {
			drops.OutOfScope++
			continue
		}
		kept = append(kept, searchPassage{
			Passage:        passage,
			ContentItemID:  items[0],
			ContentItemIDs: items,
		})
	}

	if drops.Unreachable > 0 || drops.Unidentified > 0 {
		observability.Decision(ctx, false,
			"the retrieval engine returned passages this caller cannot reach",
			"unreachable", drops.Unreachable, "unidentified", drops.Unidentified,
			"returned", len(passages), "kept", len(kept),
			"whole_tenant", scope.wholeTenant, "documents", len(scope.documents))
	}
	return kept, drops, nil
}

func reachableDocuments(ctx context.Context, client *tenantent.Client, documents []string,
	viewer *access.Viewer, decision authorization.Decision) (map[string][]uuid.UUID, error) {

	out := map[string][]uuid.UUID{}
	if len(documents) == 0 {
		return out, nil
	}

	rows, err := client.ContentItem.Query().
		Where(
			entitem.EngineDocumentIDIn(documents...),
			access.LibraryItemsFor(viewer, decision),
		).
		Order(tenantent.Asc(entitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.EngineDocumentID == nil {
			continue
		}
		out[*row.EngineDocumentID] = append(out[*row.EngineDocumentID], row.ID)
	}
	return out, nil
}

func writeSearchAnswer(ctx context.Context, w http.ResponseWriter, opts searchOptions,
	scope *searchScope, kept []searchPassage, drops searchDrops, noGoodMatch bool) {

	if kept == nil {
		kept = []searchPassage{}
	}

	observability.Step(ctx, observability.ComponentData, "library search answered",
		"documents", len(scope.documents), "whole_tenant", scope.wholeTenant,
		"stale_documents", scope.stale, "resolution", scope.resolution,
		"passages", len(kept), "unreachable", drops.Unreachable,
		"unidentified", drops.Unidentified, "out_of_scope", drops.OutOfScope)

	body := response.Envelope{
		"query":         opts.Query,
		"passages":      kept,
		"count":         len(kept),
		"no_good_match": noGoodMatch && len(kept) == 0,
		"scope": response.Envelope{
			"documents":       len(scope.documents),
			"whole_tenant":    scope.wholeTenant,
			"stale_documents": scope.stale,
			"resolution":      scope.resolution,
		},
		"dropped": drops,
	}
	if opts.Node != nil {
		body["curriculum_node_id"] = *opts.Node
	}
	response.JSON(w, http.StatusOK, body)
}

func refuseSearch(w http.ResponseWriter, status int, code, message string) {
	response.JSON(w, status, response.Envelope{
		"error":   http.StatusText(status),
		"message": message,
		"code":    code,
	})
}

func writeSearchErr(ctx context.Context, w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, indexing.ErrEngineUnreachable):
		observability.Problem(ctx, observability.ComponentData,
			"the retrieval engine could not be reached", err)
		refuseSearch(w, http.StatusServiceUnavailable, SearchUnavailableCode,
			"the retrieval engine could not be reached, so nothing was searched; "+
				"an empty result would read as an empty library")
	case errors.Is(err, indexing.ErrEngineRefusedScope):
		observability.Problem(ctx, observability.ComponentAuthz,
			"the retrieval engine refused the scope this search asserted", err)
		refuseSearch(w, http.StatusBadGateway, SearchRefusedCode,
			"the retrieval engine refused the scope this search asserted and it was not "+
				"retried without it, because a retry would widen the answer: "+err.Error())
	case errors.Is(err, indexing.ErrEngineRejected),
		errors.Is(err, indexing.ErrUnscopedSearch),
		errors.Is(err, indexing.ErrScopeContradiction),
		errors.Is(err, indexing.ErrNoQuery):
		observability.Problem(ctx, observability.ComponentData,
			"the retrieval engine refused the search", err)
		refuseSearch(w, http.StatusBadGateway, SearchRefusedCode,
			"the retrieval engine refused the search: "+err.Error())
	default:
		response.ServerError(w, err)
	}
}
