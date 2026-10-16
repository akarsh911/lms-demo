package http

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	entitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	resolveNodeNotFound   = "curriculum node not found"
	maxResolvedPlacements = 500
)

const ResolveUnboundedCode = "placements_unbounded"

const (
	IndexStateNone    = "not_indexed"
	IndexStateCurrent = "current"
	IndexStateStale   = "stale"
)

const (
	RetrievalCurrent       = IndexStateCurrent
	RetrievalStale         = IndexStateStale
	RetrievalNotIndexed    = IndexStateNone
	RetrievalUnpublished   = "unpublished"
	RetrievalSourceDeleted = "source_deleted"
)

const (
	ResolutionResolved      = "resolved"
	ResolutionUnmapped      = "unmapped"
	ResolutionUnindexed     = "unindexed"
	ResolutionUnpublished   = RetrievalUnpublished
	ResolutionSourceDeleted = RetrievalSourceDeleted
	ResolutionRestricted    = "restricted"
)

type resolveOptions struct {
	IncludeProposed  bool
	IncludeAncestors bool
}

type resolvedPlacement struct {
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
	ContentStatus    *string    `json:"content_status,omitempty"`
	EngineDocumentID *string    `json:"engine_document_id,omitempty"`
}

type resolvedCounts struct {
	Placements    int `json:"placements"`
	Readable      int `json:"readable"`
	Unreadable    int `json:"unreadable"`
	Exact         int `json:"exact"`
	Indexed       int `json:"indexed"`
	Stale         int `json:"stale"`
	NotIndexed    int `json:"not_indexed"`
	Unpublished   int `json:"unpublished"`
	SourceDeleted int `json:"source_deleted"`
}

type resolveView struct {
	node     uuid.UUID
	document bool
	status   bool
}

type placedAsset struct {
	digest  string
	deleted bool
}

var resolvedPlacementFields = []string{
	entplacement.FieldContentItemID,
	entplacement.FieldContentNodeID,
	entplacement.FieldPageStart,
	entplacement.FieldPageEnd,
	entplacement.FieldGrain,
	entplacement.FieldStatus,
	entplacement.FieldCurriculumNodeID,
}

func resolveFlag(p *filter.Params, name string) (bool, error) {
	switch raw := p.String(name); raw {
	case "":
		return false, nil
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, &filter.Error{Param: name, Reason: "must be true or false"}
	}
}

func parseResolveOptions(values url.Values) (resolveOptions, error) {
	p := filter.New(values)

	proposed, err := resolveFlag(p, "include_proposed")
	if err != nil {
		return resolveOptions{}, err
	}
	ancestors, err := resolveFlag(p, "include_ancestors")
	if err != nil {
		return resolveOptions{}, err
	}
	if err := p.Err(); err != nil {
		return resolveOptions{}, err
	}
	return resolveOptions{IncludeProposed: proposed, IncludeAncestors: ancestors}, nil
}

func resolvableStatuses(includeProposed bool) []entplacement.Status {
	if includeProposed {
		return []entplacement.Status{entplacement.StatusConfirmed, entplacement.StatusProposed}
	}
	return []entplacement.Status{entplacement.StatusConfirmed}
}

func placementsResolving(nodes []uuid.UUID, curriculum uuid.UUID,
	ancestors bool) predicate.ContentPlacement {
	placed := entplacement.CurriculumNodeIDIn(nodes...)
	if !ancestors {
		return placed
	}
	return entplacement.Or(placed, entplacement.And(
		entplacement.GrainEQ(entplacement.GrainCurriculum),
		entplacement.CurriculumID(curriculum),
	))
}

func curriculumNodeLineage(ctx context.Context, c *tenantent.Client,
	node *tenantent.CurriculumNode) ([]uuid.UUID, error) {
	ids := []uuid.UUID{node.ID}

	at := node.ParentID
	for depth := 0; at != nil && depth < maxCurriculumDepth; depth++ {
		row, err := c.CurriculumNode.Query().
			Where(entnode.ID(*at), entnode.CurriculumID(node.CurriculumID)).
			Only(ctx)
		if err != nil {
			if tenantent.IsNotFound(err) {
				return ids, nil
			}
			return nil, err
		}
		ids = append(ids, row.ID)
		at = row.ParentID
	}
	return ids, nil
}

func placedItemIDs(rows []*tenantent.ContentPlacement) []uuid.UUID {
	seen := make(map[uuid.UUID]bool, len(rows))
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		if seen[row.ContentItemID] {
			continue
		}
		seen[row.ContentItemID] = true
		ids = append(ids, row.ContentItemID)
	}
	return ids
}

func readablePlacedItems(ctx context.Context, c *tenantent.Client, rows []*tenantent.ContentPlacement,
	v *access.Viewer, d authorization.Decision) (map[uuid.UUID]*tenantent.ContentItem, error) {
	out := map[uuid.UUID]*tenantent.ContentItem{}

	ids := placedItemIDs(rows)
	if len(ids) == 0 {
		return out, nil
	}

	items, err := c.ContentItem.Query().
		Where(entitem.IDIn(ids...), access.LibraryItemsFor(v, d)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		out[item.ID] = item
	}
	return out, nil
}

func placedAssetIDs(items map[uuid.UUID]*tenantent.ContentItem) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		if item.AssetID == nil {
			continue
		}
		ids = append(ids, *item.AssetID)
	}
	return ids
}

func placedAssets(ctx context.Context, c *tenantent.Client,
	items map[uuid.UUID]*tenantent.ContentItem,
	v *access.Viewer, d authorization.Decision) (map[uuid.UUID]placedAsset, error) {
	out := map[uuid.UUID]placedAsset{}

	ids := placedAssetIDs(items)
	if len(ids) == 0 {
		return out, nil
	}

	rows, err := c.Asset.Query().
		Where(
			entasset.IDIn(ids...),
			entasset.HasContentItemsWith(access.LibraryItemsFor(v, d)),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.ID] = placedAsset{
			digest:  row.Sha256,
			deleted: row.Status == entasset.StatusDeleted,
		}
	}
	return out, nil
}

func indexStateOf(item *tenantent.ContentItem, assets map[uuid.UUID]placedAsset) string {
	if item.IndexedSha256 == nil || item.EngineDocumentID == nil {
		return IndexStateNone
	}
	if item.AssetID == nil {
		return IndexStateCurrent
	}
	if asset, ok := assets[*item.AssetID]; ok && asset.digest == *item.IndexedSha256 {
		return IndexStateCurrent
	}
	return IndexStateStale
}

func sourceDeleted(item *tenantent.ContentItem, assets map[uuid.UUID]placedAsset) bool {
	if item.AssetID == nil {
		return false
	}
	asset, ok := assets[*item.AssetID]
	return ok && asset.deleted
}

func retrievalStateOf(item *tenantent.ContentItem, assets map[uuid.UUID]placedAsset,
	index string) string {
	if sourceDeleted(item, assets) {
		return RetrievalSourceDeleted
	}
	if item.Status != entitem.StatusPublished {
		return RetrievalUnpublished
	}
	return index
}

func resolveOne(row *tenantent.ContentPlacement, item *tenantent.ContentItem,
	assets map[uuid.UUID]placedAsset, view resolveView) resolvedPlacement {
	index := indexStateOf(item, assets)
	out := resolvedPlacement{
		PlacementID:      row.ID,
		PlacementStatus:  string(row.Status),
		ContentItemID:    row.ContentItemID,
		ContentNodeID:    row.ContentNodeID,
		PageStart:        row.PageStart,
		PageEnd:          row.PageEnd,
		Grain:            string(row.Grain),
		CurriculumNodeID: row.CurriculumNodeID,
		Exact:            row.CurriculumNodeID != nil && *row.CurriculumNodeID == view.node,
		RetrievalState:   retrievalStateOf(item, assets, index),
		IndexState:       index,
	}
	if view.status {
		status := string(item.Status)
		out.ContentStatus = &status
	}
	if view.document {
		out.EngineDocumentID = item.EngineDocumentID
	}
	return out
}

func countResolved(counts *resolvedCounts, resolved resolvedPlacement) {
	counts.Readable++
	if resolved.Exact {
		counts.Exact++
	}
	switch resolved.RetrievalState {
	case RetrievalSourceDeleted:
		counts.SourceDeleted++
	case RetrievalUnpublished:
		counts.Unpublished++
	case RetrievalCurrent:
		counts.Indexed++
	case RetrievalStale:
		counts.Stale++
	default:
		counts.NotIndexed++
	}
}

func resolvePlacements(rows []*tenantent.ContentPlacement, items map[uuid.UUID]*tenantent.ContentItem,
	assets map[uuid.UUID]placedAsset, view resolveView) ([]resolvedPlacement, resolvedCounts) {
	counts := resolvedCounts{Placements: len(rows)}
	out := make([]resolvedPlacement, 0, len(rows))

	for _, row := range rows {
		item, ok := items[row.ContentItemID]
		if !ok {
			counts.Unreadable++
			continue
		}
		resolved := resolveOne(row, item, assets, view)
		countResolved(&counts, resolved)
		out = append(out, resolved)
	}
	return out, counts
}

func resolutionOf(counts resolvedCounts) string {
	switch {
	case counts.Placements == 0:
		return ResolutionUnmapped
	case counts.Readable == 0:
		return ResolutionRestricted
	case counts.Indexed+counts.Stale > 0:
		return ResolutionResolved
	case counts.NotIndexed > 0:
		return ResolutionUnindexed
	case counts.SourceDeleted > 0:
		return ResolutionSourceDeleted
	default:
		return ResolutionUnpublished
	}
}

func requireResolvedFields(w http.ResponseWriter, r *http.Request,
	d authorization.Decision) bool {
	denied := d.Fields.Denied(entplacement.Columns, resolvedPlacementFields)
	if len(denied) == 0 {
		return true
	}

	observability.Decision(r.Context(), false, "content resolution refused on fields",
		"denied", denied, "rule", d.Rule)

	response.Error(w, http.StatusForbidden,
		"a resolved placement is the whole tuple, so a partial one would be a filter that "+
			"silently searches the wrong pages; your field policy denies "+strings.Join(denied, ", "))
	return false
}

func refuseUnboundedResolution(w http.ResponseWriter, node uuid.UUID) {
	response.JSON(w, http.StatusConflict, response.Envelope{
		"error": http.StatusText(http.StatusConflict),
		"message": "curriculum node " + node.String() + " carries more than " +
			strconv.Itoa(maxResolvedPlacements) + " placements; a truncated filter would " +
			"search a subset of the mapped content without saying so, so nothing is resolved",
		"code": ResolveUnboundedCode,
	})
}

func (s *Server) resolveCurriculumNodeContent(w http.ResponseWriter, r *http.Request) {
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

	opts, err := parseResolveOptions(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.ContentPlacementsRead, authorization.ContentPlacementsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"resolving content requires "+string(authorization.ContentPlacementsRead))
		return
	}
	if !requireResolvedFields(w, r, decision) {
		return
	}

	libraryViewer, libraryDecision, err := s.scopeFor(ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !libraryDecision.Allowed {
		response.Error(w, http.StatusForbidden,
			"resolving content requires "+string(authorization.LibraryRead))
		return
	}

	node, err := client.CurriculumNode.Query().
		Where(entnode.ID(id), access.CurriculumNodesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resolveNodeNotFound)
		return
	}

	nodes := []uuid.UUID{node.ID}
	if opts.IncludeAncestors {
		if nodes, err = curriculumNodeLineage(ctx, client, node); err != nil {
			writeTenancyErr(w, err)
			return
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
		return
	}
	if len(rows) > maxResolvedPlacements {
		refuseUnboundedResolution(w, node.ID)
		return
	}

	items, err := readablePlacedItems(ctx, client, rows, libraryViewer, libraryDecision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	assets, err := placedAssets(ctx, client, items, libraryViewer, libraryDecision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	content, counts := resolvePlacements(rows, items, assets, resolveView{
		node:     node.ID,
		document: libraryDecision.Fields.Permits(entitem.FieldEngineDocumentID),
		status:   libraryDecision.Fields.Permits(entitem.FieldStatus),
	})
	resolution := resolutionOf(counts)

	observability.Step(ctx, observability.ComponentData, "curriculum node content resolved",
		"curriculum_node_id", node.ID, "resolution", resolution,
		"placements", counts.Placements, "readable", counts.Readable,
		"unreadable", counts.Unreadable, "indexed", counts.Indexed,
		"stale", counts.Stale, "not_indexed", counts.NotIndexed,
		"unpublished", counts.Unpublished, "source_deleted", counts.SourceDeleted,
		"include_proposed", opts.IncludeProposed, "include_ancestors", opts.IncludeAncestors)

	response.JSON(w, http.StatusOK, response.Envelope{
		"curriculum_node_id": node.ID,
		"curriculum_id":      node.CurriculumID,
		"resolution":         resolution,
		"content":            content,
		"count":              len(content),
		"counts":             counts,
		"include_proposed":   opts.IncludeProposed,
		"include_ancestors":  opts.IncludeAncestors,
	})
}
