package http

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mindmap"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	MaxLinkedMindmapBooks = 8

	MindmapLinkUnboundedCode = "mindmap_link_unbounded"
)

const (
	MatchPageOverlap = "page_overlap"
	MatchWholeItem   = "whole_item"
	MatchNone        = "none"
)

var linkedPlacementFields = []string{
	entplacement.FieldContentItemID,
	entplacement.FieldCurriculumNodeID,
	entplacement.FieldPageStart,
	entplacement.FieldPageEnd,
	entplacement.FieldStatus,
}

type linkedSection struct {
	SectionID    string `json:"section_id"`
	Display      string `json:"display"`
	PageStart    *int   `json:"page_start"`
	PageEnd      *int   `json:"page_end"`
	OverlapPages *int   `json:"overlap_pages"`
}

type linkedMindmap struct {
	ContentItemID uuid.UUID       `json:"content_item_id"`
	Title         *string         `json:"title,omitempty"`
	PlacementID   uuid.UUID       `json:"placement_id"`
	Inherited     bool            `json:"inherited"`
	PageStart     *int            `json:"page_start"`
	PageEnd       *int            `json:"page_end"`
	MindmapState  string          `json:"mindmap_state"`
	MatchBasis    string          `json:"match_basis"`
	Sections      []linkedSection `json:"sections"`
}

type linkedPlacement struct {
	placement *tenantent.ContentPlacement
	item      *tenantent.ContentItem
	inherited bool
}

type mindmapLink struct {
	node   *tenantent.CurriculumNode
	placed []linkedPlacement
	caller mindmap.Caller
	titled bool
}

func requireLinkedFields(w http.ResponseWriter, r *http.Request, d authorization.Decision) bool {
	denied := d.Fields.Denied(entplacement.Columns, linkedPlacementFields)
	if len(denied) == 0 {
		return true
	}

	observability.Decision(r.Context(), false, "mind map link refused on fields",
		"denied", denied, "rule", d.Rule)
	response.Error(w, http.StatusForbidden,
		"a chapter is chosen by the placement's book and pages together, so a partial placement "+
			"would open the wrong chapter; your field policy denies "+strings.Join(denied, ", "))
	return false
}

func refuseUnboundedLink(w http.ResponseWriter, node uuid.UUID, books int) {
	refuseMindmap(w, http.StatusConflict, MindmapLinkUnboundedCode,
		"curriculum node "+node.String()+" resolves to "+strconv.Itoa(books)+" indexed books and "+
			"one request asks the mind-map service about at most "+strconv.Itoa(MaxLinkedMindmapBooks)+
			"; a list that named chapters for some books and none for the rest would read as "+
			"books with no matching chapter, so nothing is linked")
}

func nearestPlacements(rows []*tenantent.ContentPlacement, items map[uuid.UUID]*tenantent.ContentItem,
	lineage []uuid.UUID) []linkedPlacement {

	distance := make(map[uuid.UUID]int, len(lineage))
	for hops, id := range lineage {
		distance[id] = hops
	}
	hopsTo := func(row *tenantent.ContentPlacement) int {
		if row.CurriculumNodeID == nil {
			return len(lineage)
		}
		if hops, known := distance[*row.CurriculumNodeID]; known {
			return hops
		}
		return len(lineage)
	}

	nearest := -1
	for _, row := range rows {
		if _, readable := items[row.ContentItemID]; !readable {
			continue
		}
		if hops := hopsTo(row); nearest < 0 || hops < nearest {
			nearest = hops
		}
	}

	var out []linkedPlacement
	for _, row := range rows {
		item, readable := items[row.ContentItemID]
		if !readable || hopsTo(row) != nearest {
			continue
		}
		out = append(out, linkedPlacement{placement: row, item: item, inherited: nearest > 0})
	}
	return out
}

func linkedDocuments(placed []linkedPlacement) []string {
	seen := map[string]bool{}
	var documents []string
	for _, row := range placed {
		document := mindmapDocumentOf(row.item)
		if document == "" || seen[document] {
			continue
		}
		seen[document] = true
		documents = append(documents, document)
	}
	return documents
}

func (s *Server) mindmapLinkFor(w http.ResponseWriter, r *http.Request) (mindmapLink, bool) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return mindmapLink{}, false
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return mindmapLink{}, false
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.ContentPlacementsRead, authorization.ContentPlacementsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return mindmapLink{}, false
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"a curriculum node reaches its mind maps through its placements, so linking one "+
				"also requires "+string(authorization.ContentPlacementsRead))
		return mindmapLink{}, false
	}
	if !requireLinkedFields(w, r, decision) {
		return mindmapLink{}, false
	}

	libraryViewer, libraryDecision, ok := s.mindmapLibraryScope(ctx, w)
	if !ok {
		return mindmapLink{}, false
	}

	node, err := client.CurriculumNode.Query().
		Where(entnode.ID(id), access.CurriculumNodesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, resolveNodeNotFound)
		return mindmapLink{}, false
	}
	lineage, err := curriculumNodeLineage(ctx, client, node)
	if err != nil {
		writeTenancyErr(w, err)
		return mindmapLink{}, false
	}

	rows, err := client.ContentPlacement.Query().
		Where(
			access.ContentPlacementsFor(viewer, decision),
			entplacement.StatusEQ(entplacement.StatusConfirmed),
			placementsResolving(lineage, node.CurriculumID, true),
		).
		Order(tenantent.Asc(entplacement.FieldCreatedAt), tenantent.Asc(entplacement.FieldID)).
		Limit(maxResolvedPlacements + 1).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return mindmapLink{}, false
	}
	if len(rows) > maxResolvedPlacements {
		refuseUnboundedResolution(w, node.ID)
		return mindmapLink{}, false
	}

	items, err := readablePlacedItems(ctx, client, rows, libraryViewer, libraryDecision)
	if err != nil {
		writeTenancyErr(w, err)
		return mindmapLink{}, false
	}

	link := mindmapLink{
		node:   node,
		placed: nearestPlacements(rows, items, lineage),
		titled: libraryDecision.Fields.Permits(entitem.FieldTitle),
	}

	documents := linkedDocuments(link.placed)
	if len(documents) > MaxLinkedMindmapBooks {
		refuseUnboundedLink(w, node.ID, len(documents))
		return mindmapLink{}, false
	}
	if len(documents) > 0 {
		if link.caller, ok = mindmapCallerFor(ctx, w); !ok {
			return mindmapLink{}, false
		}
	}

	observability.Step(ctx, observability.ComponentData, "curriculum node linked to its mind maps",
		"curriculum_node_id", node.ID, "kind", string(node.Kind),
		"placements", len(rows), "readable_books", len(items),
		"linked", len(link.placed), "indexed_books", len(documents))
	return link, true
}

func linkedChapters(ctx context.Context, w http.ResponseWriter,
	link mindmapLink) (map[string][]mindmap.Section, bool) {

	chapters := map[string][]mindmap.Section{}
	for _, document := range linkedDocuments(link.placed) {
		sections, refusal, err := mindmapService.Sections(ctx, link.caller, document)
		if err != nil {
			writeMindmapErr(ctx, w, err)
			return nil, false
		}
		if refusal != nil && refusal.Status != http.StatusNotFound {
			relayMindmapRefusal(ctx, w, *refusal)
			return nil, false
		}
		if refusal != nil {
			observability.Step(ctx, observability.ComponentData,
				"the mind-map service lists no chapters for a placed book, so it links to none",
				"document", document)
		}
		chapters[document] = sections
	}
	return chapters, true
}

func placementPages(row *tenantent.ContentPlacement) (int, int, bool) {
	switch {
	case row.PageStart == nil && row.PageEnd == nil:
		return 0, 0, false
	case row.PageStart == nil:
		return *row.PageEnd, *row.PageEnd, true
	case row.PageEnd == nil:
		return *row.PageStart, *row.PageStart, true
	}
	return min(*row.PageStart, *row.PageEnd), max(*row.PageStart, *row.PageEnd), true
}

type rankedSection struct {
	linkedSection
	overlap int
	span    int
	first   int
	paged   bool
}

func rankSection(section mindmap.Section) rankedSection {
	ranked := rankedSection{linkedSection: linkedSection{
		SectionID: section.ID,
		Display:   section.Display,
		PageStart: section.PageStart,
		PageEnd:   section.PageEnd,
	}}
	if first, last, paged := section.Pages(); paged {
		ranked.first, ranked.span, ranked.paged = first, last-first+1, true
	}
	return ranked
}

func plainSections(ranked []rankedSection) []linkedSection {
	out := make([]linkedSection, 0, len(ranked))
	for _, section := range ranked {
		pages := section.overlap
		if section.paged {
			section.OverlapPages = &pages
		}
		out = append(out, section.linkedSection)
	}
	return out
}

func wholeItemSections(sections []mindmap.Section) []linkedSection {
	ranked := make([]rankedSection, 0, len(sections))
	for _, section := range sections {
		one := rankSection(section)
		one.overlap = one.span
		ranked = append(ranked, one)
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		a, b := ranked[i], ranked[j]
		switch {
		case a.paged != b.paged:
			return a.paged
		case a.first != b.first:
			return a.first < b.first
		}
		return a.SectionID < b.SectionID
	})
	return plainSections(ranked)
}

func overlappingSections(sections []mindmap.Section, first, last int) []linkedSection {
	var ranked []rankedSection
	for _, section := range sections {
		from, to, paged := section.Pages()
		if !paged {
			continue
		}
		overlap := min(last, to) - max(first, from) + 1
		if overlap <= 0 {
			continue
		}
		one := rankSection(section)
		one.overlap = overlap
		ranked = append(ranked, one)
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		a, b := ranked[i], ranked[j]
		switch {
		case a.overlap != b.overlap:
			return a.overlap > b.overlap
		case a.span != b.span:
			return a.span < b.span
		case a.first != b.first:
			return a.first < b.first
		}
		return a.SectionID < b.SectionID
	})
	return plainSections(ranked)
}

func linkedMindmapOf(row linkedPlacement, chapters map[string][]mindmap.Section,
	titled bool) linkedMindmap {

	out := linkedMindmap{
		ContentItemID: row.item.ID,
		PlacementID:   row.placement.ID,
		Inherited:     row.inherited,
		PageStart:     row.placement.PageStart,
		PageEnd:       row.placement.PageEnd,
		MindmapState:  mindmapStateOf(row.item),
		MatchBasis:    MatchNone,
		Sections:      []linkedSection{},
	}
	if titled {
		out.Title = &row.item.Title
	}
	if out.MindmapState != MindmapAvailable {
		return out
	}

	sections := chapters[mindmapDocumentOf(row.item)]
	first, last, ranged := placementPages(row.placement)
	if !ranged {
		out.MatchBasis = MatchWholeItem
		out.Sections = wholeItemSections(sections)
		return out
	}
	if matched := overlappingSections(sections, first, last); len(matched) > 0 {
		out.MatchBasis = MatchPageOverlap
		out.Sections = matched
	}
	return out
}

func (s *Server) listCurriculumNodeMindmaps(w http.ResponseWriter, r *http.Request) {
	if !s.mindmapsOn(w) {
		return
	}
	if !refuseMindmapQuery(w, r.URL.Query()) {
		return
	}

	link, ok := s.mindmapLinkFor(w, r)
	if !ok {
		return
	}
	chapters, ok := linkedChapters(r.Context(), w, link)
	if !ok {
		return
	}

	mindmaps := make([]linkedMindmap, 0, len(link.placed))
	for _, row := range link.placed {
		mindmaps = append(mindmaps, linkedMindmapOf(row, chapters, link.titled))
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"curriculum_node_id": link.node.ID,
		"kind":               link.node.Kind,
		"mindmaps":           mindmaps,
		"count":              len(mindmaps),
	})
}
