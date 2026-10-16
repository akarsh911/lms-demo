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
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entcontentnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentnode"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	entcurriculum "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculum"
	entcurriculumnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const placementNotFound = "content placement not found"

type contentPlacementPayload struct {
	CurriculumID          *uuid.UUID `json:"curriculum_id"`
	CurriculumNodeID      *uuid.UUID `json:"curriculum_node_id"`
	ContentItemID         *uuid.UUID `json:"content_item_id"`
	ContentNodeID         *uuid.UUID `json:"content_node_id"`
	CopiedFromPlacementID *uuid.UUID `json:"copied_from_placement_id"`
	Grain                 *string    `json:"grain"`
	PageStart             *int       `json:"page_start"`
	PageEnd               *int       `json:"page_end"`
	Origin                *string    `json:"origin"`
	Confidence            *float64   `json:"confidence"`
	Status                *string    `json:"status"`
	CreatedBy             *uuid.UUID `json:"created_by"`
	ConfirmedBy           *uuid.UUID `json:"confirmed_by"`
	ConfirmedAt           *time.Time `json:"confirmed_at"`
}

type placementFilters struct {
	CurriculumID     *uuid.UUID
	CurriculumNodeID *uuid.UUID
	ContentItemID    *uuid.UUID
	ContentNodeID    *uuid.UUID
	Grain            *entplacement.Grain
	Origin           *entplacement.Origin
	Status           *entplacement.Status

	Limit  int
	Offset int
}

func parsePlacementFilters(values url.Values) (placementFilters, error) {
	p := filter.New(values)

	f := placementFilters{
		CurriculumID:     p.UUID(entplacement.FieldCurriculumID),
		CurriculumNodeID: p.UUID(entplacement.FieldCurriculumNodeID),
		ContentItemID:    p.UUID(entplacement.FieldContentItemID),
		ContentNodeID:    p.UUID(entplacement.FieldContentNodeID),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum(entplacement.FieldGrain, func(v string) error {
		return entplacement.GrainValidator(entplacement.Grain(v))
	}); raw != nil {
		grain := entplacement.Grain(*raw)
		f.Grain = &grain
	}
	if raw := p.Enum(entplacement.FieldOrigin, func(v string) error {
		return entplacement.OriginValidator(entplacement.Origin(v))
	}); raw != nil {
		origin := entplacement.Origin(*raw)
		f.Origin = &origin
	}
	if raw := p.Enum(entplacement.FieldStatus, func(v string) error {
		return entplacement.StatusValidator(entplacement.Status(v))
	}); raw != nil {
		status := entplacement.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return placementFilters{}, err
	}
	return f, nil
}

func (f placementFilters) apply(q *tenantent.ContentPlacementQuery) *tenantent.ContentPlacementQuery {
	if f.CurriculumID != nil {
		q = q.Where(entplacement.CurriculumID(*f.CurriculumID))
	}
	if f.CurriculumNodeID != nil {
		q = q.Where(entplacement.CurriculumNodeID(*f.CurriculumNodeID))
	}
	if f.ContentItemID != nil {
		q = q.Where(entplacement.ContentItemID(*f.ContentItemID))
	}
	if f.ContentNodeID != nil {
		q = q.Where(entplacement.ContentNodeID(*f.ContentNodeID))
	}
	if f.Grain != nil {
		q = q.Where(entplacement.GrainEQ(*f.Grain))
	}
	if f.Origin != nil {
		q = q.Where(entplacement.OriginEQ(*f.Origin))
	}
	if f.Status != nil {
		q = q.Where(entplacement.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func placementGrain(w http.ResponseWriter, raw *string) (entplacement.Grain, bool) {
	grain := entplacement.Grain(*raw)
	if err := entplacement.GrainValidator(grain); err != nil {
		response.Error(w, http.StatusBadRequest, "grain must be curriculum or node")
		return "", false
	}
	return grain, true
}

func placementOrigin(w http.ResponseWriter, raw *string) (entplacement.Origin, bool) {
	origin := entplacement.Origin(*raw)
	if err := entplacement.OriginValidator(origin); err != nil {
		response.Error(w, http.StatusBadRequest, "origin must be manual or inferred")
		return "", false
	}
	return origin, true
}

func placementStatus(w http.ResponseWriter, raw *string) (entplacement.Status, bool) {
	status := entplacement.Status(*raw)
	if err := entplacement.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, "status must be proposed, confirmed or rejected")
		return "", false
	}
	return status, true
}

func rejectServerSetPlacementFields(w http.ResponseWriter, sent []string) bool {
	for _, name := range []string{
		entplacement.FieldCreatedBy,
		entplacement.FieldConfirmedBy,
		entplacement.FieldConfirmedAt,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded by the server from the authenticated caller and must not be supplied")
			return false
		}
	}
	return true
}

func rejectImmutablePlacementFields(w http.ResponseWriter, sent []string) bool {
	for _, name := range []string{
		entplacement.FieldCurriculumID,
		entplacement.FieldCurriculumNodeID,
		entplacement.FieldContentItemID,
		entplacement.FieldContentNodeID,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is fixed when the placement is created and cannot be re-pointed; "+
					"reject this placement and create another")
			return false
		}
	}
	return true
}

func checkPlacementGrain(w http.ResponseWriter, grain entplacement.Grain, node *uuid.UUID) bool {
	if grain == entplacement.GrainNode && node == nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"grain node requires "+entplacement.FieldCurriculumNodeID)
		return false
	}
	if grain == entplacement.GrainCurriculum && node != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"grain curriculum must not carry "+entplacement.FieldCurriculumNodeID)
		return false
	}
	return true
}

func checkPlacementReference(w http.ResponseWriter, found bool, err error, message string) bool {
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !found {
		response.Error(w, http.StatusUnprocessableEntity, message)
		return false
	}
	return true
}

func reachWritableCurriculum(ctx context.Context, c *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	return c.Curriculum.Query().
		Where(entcurriculum.ID(id), access.CurriculaWritableBy(v, d)).
		Exist(ctx)
}

func reachReadablePlacement(ctx context.Context, c *tenantent.Client, id uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	return c.ContentPlacement.Query().
		Where(entplacement.ID(id), access.ContentPlacementsFor(v, d)).
		Exist(ctx)
}

func curriculumNodeUnder(ctx context.Context, c *tenantent.Client, node, curriculum uuid.UUID) (bool, error) {
	return c.CurriculumNode.Query().
		Where(entcurriculumnode.ID(node), entcurriculumnode.CurriculumID(curriculum)).
		Exist(ctx)
}

func contentNodeUnder(ctx context.Context, c *tenantent.Client, node, item uuid.UUID) (bool, error) {
	return c.ContentNode.Query().
		Where(entcontentnode.ID(node), entcontentnode.ContentItemID(item)).
		Exist(ctx)
}

func readableContentItem(ctx context.Context, c *tenantent.Client, item uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	return c.ContentItem.Query().
		Where(entcontentitem.ID(item), access.LibraryItemsFor(v, d)).
		Exist(ctx)
}

func (s *Server) placementsOnReadableContent(ctx context.Context,
	w http.ResponseWriter) (predicate.ContentPlacement, bool) {
	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"a placement names the content item it maps, so reading one requires "+
				string(authorization.LibraryRead))
		return nil, false
	}
	return entplacement.HasContentItemWith(access.LibraryItemsFor(viewer, decision)), true
}

func (s *Server) checkPlacedContent(ctx context.Context, w http.ResponseWriter, c *tenantent.Client,
	item uuid.UUID, node *uuid.UUID) bool {
	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"placing content requires "+string(authorization.LibraryRead))
		return false
	}

	found, err := readableContentItem(ctx, c, item, viewer, decision)
	if !checkPlacementReference(w, found, err,
		entplacement.FieldContentItemID+" does not name a known content item") {
		return false
	}
	if node == nil {
		return true
	}
	found, err = contentNodeUnder(ctx, c, *node, item)
	return checkPlacementReference(w, found, err,
		entplacement.FieldContentNodeID+" does not name a node of that content item")
}

func (s *Server) checkPlacedCurriculum(ctx context.Context, w http.ResponseWriter, c *tenantent.Client,
	v *access.Viewer, d authorization.Decision, curriculum uuid.UUID, node *uuid.UUID) bool {
	found, err := reachWritableCurriculum(ctx, c, curriculum, v, d)
	if !checkPlacementReference(w, found, err,
		entplacement.FieldCurriculumID+" does not name a known curriculum") {
		return false
	}
	if node == nil {
		return true
	}
	found, err = curriculumNodeUnder(ctx, c, *node, curriculum)
	return checkPlacementReference(w, found, err,
		entplacement.FieldCurriculumNodeID+" does not name a node of that curriculum")
}

func checkPlacementSource(ctx context.Context, w http.ResponseWriter, c *tenantent.Client,
	v *access.Viewer, d authorization.Decision, source *uuid.UUID) bool {
	if source == nil {
		return true
	}
	found, err := reachReadablePlacement(ctx, c, *source, v, d)
	return checkPlacementReference(w, found, err,
		entplacement.FieldCopiedFromPlacementID+" does not name a known content placement")
}

func placementConfirmation(w http.ResponseWriter, u *tenantent.ContentPlacementUpdate,
	v *access.Viewer, status entplacement.Status,
	current *tenantent.ContentPlacement) (*tenantent.ContentPlacementUpdate, bool) {
	u = u.SetStatus(status)

	if status == entplacement.StatusConfirmed {
		who, ok := attributedTo(w, v, nil, entplacement.FieldConfirmedBy)
		if !ok {
			return nil, false
		}
		return u.SetConfirmedBy(who).SetConfirmedAt(nowUTC()), true
	}
	if current.Status == entplacement.StatusConfirmed {
		return u.ClearConfirmedBy().ClearConfirmedAt(), true
	}
	return u, true
}

func (s *Server) listPlacements(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parsePlacementFilters(r.URL.Query())
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

	readable, ok := s.placementsOnReadableContent(ctx, w)
	if !ok {
		return
	}

	q := client.ContentPlacement.Query().
		Where(access.ContentPlacementsFor(viewer, decision), readable)

	rows, err := filters.apply(q).
		Order(tenantent.Desc(entplacement.FieldCreatedAt)).
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
		"content_placements": projected,
		"count":              len(rows),
		"page":               pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getPlacement(w http.ResponseWriter, r *http.Request) {
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

	viewer, decision, err := s.scopeFor(ctx,
		authorization.ContentPlacementsRead, authorization.ContentPlacementsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	readable, ok := s.placementsOnReadableContent(ctx, w)
	if !ok {
		return
	}

	row, err := client.ContentPlacement.Query().
		Where(entplacement.ID(id), access.ContentPlacementsFor(viewer, decision), readable).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, placementNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createPlacement(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in contentPlacementPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.ContentPlacementsCreate, authorization.ContentPlacementsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entplacement.Columns, sent) {
		return
	}
	if !rejectServerSetPlacementFields(w, sent) {
		return
	}

	if in.CurriculumID == nil {
		response.Error(w, http.StatusBadRequest, entplacement.FieldCurriculumID+" is required")
		return
	}
	if in.ContentItemID == nil {
		response.Error(w, http.StatusBadRequest, entplacement.FieldContentItemID+" is required")
		return
	}
	if in.Grain == nil || *in.Grain == "" {
		response.Error(w, http.StatusBadRequest, "grain is required")
		return
	}

	grain, ok := placementGrain(w, in.Grain)
	if !ok {
		return
	}
	if !checkPlacementGrain(w, grain, in.CurriculumNodeID) {
		return
	}

	origin := entplacement.DefaultOrigin
	if in.Origin != nil {
		if origin, ok = placementOrigin(w, in.Origin); !ok {
			return
		}
	}
	if in.Status != nil {
		status, ok := placementStatus(w, in.Status)
		if !ok {
			return
		}
		if status != entplacement.StatusProposed {
			response.Error(w, http.StatusUnprocessableEntity,
				"a placement is created proposed; confirming or rejecting it is a separate request")
			return
		}
	}

	if !s.checkPlacedCurriculum(ctx, w, client, viewer, decision, *in.CurriculumID, in.CurriculumNodeID) {
		return
	}
	if !s.checkPlacedContent(ctx, w, client, *in.ContentItemID, in.ContentNodeID) {
		return
	}
	if !checkPlacementSource(ctx, w, client, viewer, decision, in.CopiedFromPlacementID) {
		return
	}

	creator, ok := attributedToOptional(w, viewer, in.CreatedBy, entplacement.FieldCreatedBy)
	if !ok {
		return
	}

	row, err := client.ContentPlacement.Create().
		SetCurriculumID(*in.CurriculumID).
		SetContentItemID(*in.ContentItemID).
		SetGrain(grain).
		SetOrigin(origin).
		SetStatus(entplacement.StatusProposed).
		SetNillableCurriculumNodeID(in.CurriculumNodeID).
		SetNillableContentNodeID(in.ContentNodeID).
		SetNillableCopiedFromPlacementID(in.CopiedFromPlacementID).
		SetNillablePageStart(in.PageStart).
		SetNillablePageEnd(in.PageEnd).
		SetNillableConfidence(in.Confidence).
		SetNillableCreatedBy(creator).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, placementNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/placements/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updatePlacement(w http.ResponseWriter, r *http.Request) {
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

	var in contentPlacementPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.ContentPlacementsWrite, authorization.ContentPlacementsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.ContentPlacement.Query().
		Where(entplacement.ID(id), access.ContentPlacementsWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, placementNotFound)
		return
	}

	if !rejectUnauthorizedFields(w, r, decision, entplacement.Columns, sent) {
		return
	}
	if !rejectImmutablePlacementFields(w, sent) {
		return
	}
	if !rejectServerSetPlacementFields(w, sent) {
		return
	}

	grain := current.Grain
	if in.Grain != nil {
		if *in.Grain == "" {
			response.Error(w, http.StatusBadRequest, "grain must not be empty")
			return
		}
		if grain, ok = placementGrain(w, in.Grain); !ok {
			return
		}
	}
	if !checkPlacementGrain(w, grain, current.CurriculumNodeID) {
		return
	}
	if !checkPlacementSource(ctx, w, client, viewer, decision, in.CopiedFromPlacementID) {
		return
	}

	update := client.ContentPlacement.Update().
		Where(entplacement.ID(id), access.ContentPlacementsWritableBy(viewer, decision)).
		SetGrain(grain).
		SetNillableCopiedFromPlacementID(in.CopiedFromPlacementID).
		SetNillablePageStart(in.PageStart).
		SetNillablePageEnd(in.PageEnd).
		SetNillableConfidence(in.Confidence)

	if in.Origin != nil {
		origin, ok := placementOrigin(w, in.Origin)
		if !ok {
			return
		}
		update = update.SetOrigin(origin)
	}
	if in.Status != nil {
		status, ok := placementStatus(w, in.Status)
		if !ok {
			return
		}
		if status == entplacement.StatusConfirmed &&
			!checkConfirmableAgainstIngestMode(ctx, w, client, current) {
			return
		}
		if update, ok = placementConfirmation(w, update, viewer, status, current); !ok {
			return
		}
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, placementNotFound) {
		return
	}

	row, err := client.ContentPlacement.Query().Where(entplacement.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, placementNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deletePlacement(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, placementNotFound,
		authorization.ContentPlacementsDelete, authorization.ContentPlacementsDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.ContentPlacement.Delete().
				Where(entplacement.ID(id), access.ContentPlacementsWritableBy(v, d)).
				Exec(ctx)
		})
}
