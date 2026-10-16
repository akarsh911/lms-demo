package http

import (
	"context"
	"net/http"
	"net/url"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entcontentnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentnode"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	contentNodeNotFound  = "content node not found"
	contentNodeItemGone  = "library item not found"
	contentNodeRunes     = 255
	engineSectionIDRunes = 128
)

type contentNodePayload struct {
	ContentItemID   *uuid.UUID      `json:"content_item_id"`
	ParentID        *uuid.UUID      `json:"parent_id"`
	Kind            *string         `json:"kind"`
	Title           *string         `json:"title"`
	Sequence        *int            `json:"sequence"`
	PageStart       *int            `json:"page_start"`
	PageEnd         *int            `json:"page_end"`
	EngineSectionID *string         `json:"engine_section_id"`
	ResolvedAt      *time.Time      `json:"resolved_at"`
	Origin          *string         `json:"origin"`
	Locator         shared.Metadata `json:"locator_json"`
	Metadata        shared.Metadata `json:"metadata_json"`
}

type contentNodeFilters struct {
	ParentID        *uuid.UUID
	Kind            *entcontentnode.Kind
	Origin          *entcontentnode.Origin
	EngineSectionID *string

	Limit  int
	Offset int
}

func parseContentNodeFilters(values url.Values) (contentNodeFilters, error) {
	p := filter.New(values)

	f := contentNodeFilters{ParentID: p.UUID(entcontentnode.FieldParentID)}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.String(entcontentnode.FieldEngineSectionID); raw != "" {
		f.EngineSectionID = &raw
	}
	if raw := p.Enum(entcontentnode.FieldKind, func(v string) error {
		return entcontentnode.KindValidator(entcontentnode.Kind(v))
	}); raw != nil {
		kind := entcontentnode.Kind(*raw)
		f.Kind = &kind
	}
	if raw := p.Enum(entcontentnode.FieldOrigin, func(v string) error {
		return entcontentnode.OriginValidator(entcontentnode.Origin(v))
	}); raw != nil {
		origin := entcontentnode.Origin(*raw)
		f.Origin = &origin
	}

	if err := p.Err(); err != nil {
		return contentNodeFilters{}, err
	}
	return f, nil
}

func (f contentNodeFilters) apply(q *tenantent.ContentNodeQuery) *tenantent.ContentNodeQuery {
	if f.ParentID != nil {
		q = q.Where(entcontentnode.ParentID(*f.ParentID))
	}
	if f.Kind != nil {
		q = q.Where(entcontentnode.KindEQ(*f.Kind))
	}
	if f.Origin != nil {
		q = q.Where(entcontentnode.OriginEQ(*f.Origin))
	}
	if f.EngineSectionID != nil {
		q = q.Where(entcontentnode.EngineSectionID(*f.EngineSectionID))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func contentNodeKind(w http.ResponseWriter, raw *string) (entcontentnode.Kind, bool) {
	kind := entcontentnode.Kind(*raw)
	if err := entcontentnode.KindValidator(kind); err != nil {
		response.Error(w, http.StatusBadRequest,
			"kind must be part, chapter, section or topic: these are the book's own divisions, "+
				"not the curriculum's unit, chapter or topic")
		return "", false
	}
	return kind, true
}

func contentNodeOrigin(w http.ResponseWriter, raw *string) (entcontentnode.Origin, bool) {
	origin := entcontentnode.Origin(*raw)
	if err := entcontentnode.OriginValidator(origin); err != nil {
		response.Error(w, http.StatusBadRequest,
			"origin must be manual for a hand-authored table of contents or ingested for an importer")
		return "", false
	}
	return origin, true
}

func checkContentNodePage(w http.ResponseWriter, name string, page *int) bool {
	if page == nil || *page > 0 {
		return true
	}
	response.Error(w, http.StatusBadRequest, name+" must be 1 or more; omit it entirely when the "+
		"page range is not recorded, because 0 reads as page zero rather than as unrecorded")
	return false
}

func checkContentNodePages(w http.ResponseWriter, start, end *int) bool {
	if !checkContentNodePage(w, entcontentnode.FieldPageStart, start) {
		return false
	}
	if !checkContentNodePage(w, entcontentnode.FieldPageEnd, end) {
		return false
	}
	if start != nil && end != nil && *end < *start {
		response.Error(w, http.StatusUnprocessableEntity,
			entcontentnode.FieldPageEnd+" must not fall before "+entcontentnode.FieldPageStart)
		return false
	}
	return true
}

func checkEngineSectionIDShape(w http.ResponseWriter, raw *string) bool {
	if raw == nil {
		return true
	}
	if *raw == "" {
		response.Error(w, http.StatusBadRequest, entcontentnode.FieldEngineSectionID+
			" must not be empty; omit it until the node has been resolved against the engine")
		return false
	}
	return withinRunes(w, entcontentnode.FieldEngineSectionID, *raw, engineSectionIDRunes)
}

func rejectPathContentItem(w http.ResponseWriter, sent []string) bool {
	if wasSent(sent, entcontentnode.FieldContentItemID) {
		response.Error(w, http.StatusUnprocessableEntity,
			entcontentnode.FieldContentItemID+" is taken from the path and must not be supplied")
		return false
	}
	return true
}

func rejectServerSetContentNodeFields(w http.ResponseWriter, sent []string) bool {
	if wasSent(sent, entcontentnode.FieldResolvedAt) {
		response.Error(w, http.StatusUnprocessableEntity, entcontentnode.FieldResolvedAt+
			" records when the server bound "+entcontentnode.FieldEngineSectionID+
			" and must not be supplied")
		return false
	}
	return true
}

func contentNodeAt(item uuid.UUID, parent *uuid.UUID, sequence int) []predicate.ContentNode {
	where := []predicate.ContentNode{
		entcontentnode.ContentItemID(item),
		entcontentnode.Sequence(sequence),
	}
	if parent == nil {
		return append(where, entcontentnode.ParentIDIsNil())
	}
	return append(where, entcontentnode.ParentID(*parent))
}

func reachReadableContentItem(ctx context.Context, c *tenantent.Client, item uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	return c.ContentItem.Query().
		Where(entcontentitem.ID(item), access.LibraryItemsFor(v, d)).
		Exist(ctx)
}

func reachWritableContentItem(ctx context.Context, c *tenantent.Client, item uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	return c.ContentItem.Query().
		Where(entcontentitem.ID(item), access.LibraryItemsWritableBy(v, d)).
		Exist(ctx)
}

func checkEngineSectionFree(ctx context.Context, w http.ResponseWriter, c *tenantent.Client,
	item uuid.UUID, engine *string, self uuid.UUID) bool {
	if engine == nil {
		return true
	}

	q := c.ContentNode.Query().Where(
		entcontentnode.ContentItemID(item),
		entcontentnode.EngineSectionID(*engine),
	)
	if self != uuid.Nil {
		q = q.Where(entcontentnode.IDNEQ(self))
	}

	taken, err := q.Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if taken {
		response.Error(w, http.StatusConflict, entcontentnode.FieldEngineSectionID+
			" already names another node of this content item; a section cannot sit in two places, "+
			"so this is a drifted binding rather than a re-run")
		return false
	}
	return true
}

func checkContentNodeParent(ctx context.Context, w http.ResponseWriter, c *tenantent.Client,
	parent *uuid.UUID, item uuid.UUID) bool {
	if parent == nil {
		return true
	}

	found, err := contentNodeUnder(ctx, c, *parent, item)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !found {
		response.Error(w, http.StatusUnprocessableEntity,
			entcontentnode.FieldParentID+" does not name a node of that content item")
		return false
	}
	return true
}

func resolutionStamp(engine *string, current *tenantent.ContentNode) *time.Time {
	if engine == nil {
		return nil
	}
	if current != nil && current.EngineSectionID != nil &&
		*current.EngineSectionID == *engine && current.ResolvedAt != nil {
		return current.ResolvedAt
	}
	stamp := nowUTC()
	return &stamp
}

func (s *Server) listContentNodes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	item, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	filters, err := parseContentNodeFilters(r.URL.Query())
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
			"a content node is the structure of a library item, so reading one requires "+
				string(authorization.LibraryRead))
		return
	}

	found, err := reachReadableContentItem(ctx, client, item, viewer, decision)
	if !mustReach(w, found, err, contentNodeItemGone) {
		return
	}

	q := client.ContentNode.Query().Where(
		entcontentnode.ContentItemID(item),
		entcontentnode.HasContentItemWith(access.LibraryItemsFor(viewer, decision)),
	)

	rows, err := filters.apply(q).
		Order(tenantent.Asc(entcontentnode.FieldSequence),
			tenantent.Asc(entcontentnode.FieldCreatedAt)).
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
		"content_nodes": projected,
		"count":         len(rows),
		"page":          pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createContentNode(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	item, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in contentNodePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryCreate, authorization.LibraryWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"a content node is the structure of a library item, so writing one requires "+
				string(authorization.LibraryCreate))
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entcontentnode.Columns, sent) {
		return
	}
	if !rejectPathContentItem(w, sent) {
		return
	}
	if !rejectServerSetContentNodeFields(w, sent) {
		return
	}

	if in.Title == nil || *in.Title == "" {
		response.Error(w, http.StatusBadRequest, entcontentnode.FieldTitle+" is required")
		return
	}
	if !withinRunes(w, entcontentnode.FieldTitle, *in.Title, contentNodeRunes) {
		return
	}
	if in.Sequence == nil {
		response.Error(w, http.StatusBadRequest, entcontentnode.FieldSequence+" is required")
		return
	}
	if *in.Sequence < 0 {
		response.Error(w, http.StatusBadRequest, entcontentnode.FieldSequence+" must not be negative")
		return
	}
	if !checkContentNodePages(w, in.PageStart, in.PageEnd) {
		return
	}
	if !checkEngineSectionIDShape(w, in.EngineSectionID) {
		return
	}

	kind := entcontentnode.DefaultKind
	if in.Kind != nil {
		if kind, ok = contentNodeKind(w, in.Kind); !ok {
			return
		}
	}
	origin := entcontentnode.DefaultOrigin
	if in.Origin != nil {
		if origin, ok = contentNodeOrigin(w, in.Origin); !ok {
			return
		}
	}

	found, err := reachWritableContentItem(ctx, client, item, viewer, decision)
	if !mustReach(w, found, err, contentNodeItemGone) {
		return
	}
	if !checkContentNodeParent(ctx, w, client, in.ParentID, item) {
		return
	}

	current, ok := s.contentNodeOnKey(ctx, w, client, item, in, viewer, decision)
	if !ok {
		return
	}

	self := uuid.Nil
	if current != nil {
		self = current.ID
	}
	if !checkEngineSectionFree(ctx, w, client, item, in.EngineSectionID, self) {
		return
	}

	resolved := resolutionStamp(in.EngineSectionID, current)

	if current != nil {
		s.rewriteContentNode(ctx, w, client, item, in, kind, origin, resolved, viewer, decision)
		return
	}

	create := client.ContentNode.Create().
		SetContentItemID(item).
		SetKind(kind).
		SetOrigin(origin).
		SetTitle(*in.Title).
		SetSequence(*in.Sequence).
		SetNillableParentID(in.ParentID).
		SetNillablePageStart(in.PageStart).
		SetNillablePageEnd(in.PageEnd).
		SetNillableEngineSectionID(in.EngineSectionID).
		SetNillableResolvedAt(resolved)

	if in.Locator != nil {
		create = create.SetLocatorJSON(in.Locator)
	}
	if in.Metadata != nil {
		create = create.SetMetadataJSON(in.Metadata)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, contentNodeItemGone)
		return
	}

	w.Header().Set("Location", "/api/v1/library/"+item.String()+"/nodes")
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) contentNodeOnKey(ctx context.Context, w http.ResponseWriter, c *tenantent.Client,
	item uuid.UUID, in contentNodePayload,
	v *access.Viewer, d authorization.Decision) (*tenantent.ContentNode, bool) {
	where := append(contentNodeAt(item, in.ParentID, *in.Sequence),
		entcontentnode.HasContentItemWith(access.LibraryItemsWritableBy(v, d)))

	row, err := c.ContentNode.Query().Where(where...).Only(ctx)
	if err == nil {
		return row, true
	}
	if tenantent.IsNotFound(err) {
		return nil, true
	}
	if tenantent.IsNotSingular(err) {
		response.Error(w, http.StatusConflict, "this content item already holds more than one node at "+
			entcontentnode.FieldSequence+"; the table of contents must be repaired before a re-run")
		return nil, false
	}
	writeTenancyErr(w, err)
	return nil, false
}

func (s *Server) rewriteContentNode(ctx context.Context, w http.ResponseWriter, c *tenantent.Client,
	item uuid.UUID, in contentNodePayload,
	kind entcontentnode.Kind, origin entcontentnode.Origin, resolved *time.Time,
	v *access.Viewer, d authorization.Decision) {
	where := append(contentNodeAt(item, in.ParentID, *in.Sequence),
		entcontentnode.HasContentItemWith(access.LibraryItemsWritableBy(v, d)))

	update := c.ContentNode.Update().
		Where(where...).
		SetKind(kind).
		SetOrigin(origin).
		SetTitle(*in.Title)

	update = contentNodePageWrites(update, in)
	update = contentNodeEngineWrites(update, in, resolved)
	update = contentNodeJSONWrites(update, in)

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, contentNodeNotFound) {
		return
	}

	row, err := c.ContentNode.Query().
		Where(append(contentNodeAt(item, in.ParentID, *in.Sequence),
			entcontentnode.HasContentItemWith(access.LibraryItemsWritableBy(v, d)))...).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, contentNodeNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func contentNodePageWrites(u *tenantent.ContentNodeUpdate,
	in contentNodePayload) *tenantent.ContentNodeUpdate {
	if in.PageStart == nil {
		u = u.ClearPageStart()
	} else {
		u = u.SetPageStart(*in.PageStart)
	}
	if in.PageEnd == nil {
		return u.ClearPageEnd()
	}
	return u.SetPageEnd(*in.PageEnd)
}

func contentNodeEngineWrites(u *tenantent.ContentNodeUpdate, in contentNodePayload,
	resolved *time.Time) *tenantent.ContentNodeUpdate {
	if in.EngineSectionID == nil {
		return u.ClearEngineSectionID().ClearResolvedAt()
	}
	return u.SetEngineSectionID(*in.EngineSectionID).SetNillableResolvedAt(resolved)
}

func contentNodeJSONWrites(u *tenantent.ContentNodeUpdate,
	in contentNodePayload) *tenantent.ContentNodeUpdate {
	if in.Locator == nil {
		u = u.ClearLocatorJSON()
	} else {
		u = u.SetLocatorJSON(in.Locator)
	}
	if in.Metadata == nil {
		return u.ClearMetadataJSON()
	}
	return u.SetMetadataJSON(in.Metadata)
}
