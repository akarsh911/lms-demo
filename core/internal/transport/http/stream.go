package http

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbranch "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/branch"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entcomment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/streamcomment"
	entpost "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/streampost"
	enttarget "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/streamtarget"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	streamTitleRunes   = 200
	streamBodyRunes    = 20000
	streamCommentRunes = 4000
	maxStreamTargets   = 50

	postNotFound    = "stream post not found"
	commentNotFound = "stream comment not found"

	streamPostTypeValues   = "post_type must be announcement, resource, poll or question"
	streamStatusValues     = "status must be draft, published or archived"
	streamTargetTypeValues = "target_type must be school, branch, grade, section, offering or student"
	commentStatusValues    = "status must be visible or hidden"
)

type streamTargetPayload struct {
	TargetType *string    `json:"target_type"`
	TargetID   *uuid.UUID `json:"target_id"`
}

type streamPostPayload struct {
	AcademicSessionID *uuid.UUID            `json:"academic_session_id"`
	PostType          *string               `json:"post_type"`
	Title             *string               `json:"title"`
	Body              *string               `json:"body"`
	Pinned            *bool                 `json:"pinned"`
	PublishedAt       *string               `json:"published_at"`
	ExpiresAt         *string               `json:"expires_at"`
	Status            *string               `json:"status"`
	Targets           []streamTargetPayload `json:"targets"`
}

type streamCommentPayload struct {
	Body   *string `json:"body"`
	Status *string `json:"status"`
}

func parseInstant(name string, raw *string) (*time.Time, error) {
	if raw == nil || *raw == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, *raw)
	if err != nil {
		return nil, &filter.Error{
			Param:  name,
			Reason: "must be a timestamp as RFC3339, e.g. 2026-04-01T09:00:00Z",
		}
	}
	utc := t.UTC()
	return &utc, nil
}

func columnsSent(sent []string, valid func(string) bool) []string {
	out := make([]string, 0, len(sent))
	for _, name := range sent {
		if valid(name) {
			out = append(out, name)
		}
	}
	return out
}

const maxTargetIDFilter = 200

func targetIDList(raw string) ([]uuid.UUID, error) {
	if raw == "" {
		return nil, nil
	}

	parts := strings.Split(raw, ",")
	if len(parts) > maxTargetIDFilter {
		return nil, &filter.Error{Param: "target_id", Reason: "names too many targets"}
	}

	out := make([]uuid.UUID, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		id, err := uuid.Parse(trimmed)
		if err != nil {
			return nil, &filter.Error{Param: "target_id", Reason: "must be a UUID, or a comma-separated list of them"}
		}
		out = append(out, id)
	}
	return out, nil
}

func instantField(w http.ResponseWriter, name string, raw *string) (*time.Time, bool) {
	at, err := parseInstant(name, raw)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return nil, false
	}
	return at, true
}

func streamPostType(w http.ResponseWriter, raw *string) (entpost.PostType, bool) {
	kind := entpost.PostType(*raw)
	if err := entpost.PostTypeValidator(kind); err != nil {
		response.Error(w, http.StatusBadRequest, streamPostTypeValues)
		return "", false
	}
	return kind, true
}

func streamPostStatus(w http.ResponseWriter, raw *string) (entpost.Status, bool) {
	status := entpost.Status(*raw)
	if err := entpost.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, streamStatusValues)
		return "", false
	}
	return status, true
}

func streamCommentStatus(w http.ResponseWriter, raw *string) (entcomment.Status, bool) {
	status := entcomment.Status(*raw)
	if err := entcomment.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, commentStatusValues)
		return "", false
	}
	return status, true
}

type streamPostFilters struct {
	AcademicSessionID *uuid.UUID
	PostType          *entpost.PostType
	Status            *entpost.Status
	Pinned            bool
	Live              bool

	TargetType *enttarget.TargetType
	TargetIDs  []uuid.UUID

	Limit  int
	Offset int
}

func parseStreamPostFilters(values url.Values) (streamPostFilters, error) {
	p := filter.New(values)

	f := streamPostFilters{
		AcademicSessionID: p.UUID("academic_session_id"),
		Pinned:            p.Bool("pinned"),
		Live:              p.Bool("live"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	ids, err := targetIDList(p.String("target_id"))
	if err != nil {
		return streamPostFilters{}, err
	}
	f.TargetIDs = ids

	if raw := p.Enum("post_type", func(v string) error {
		return entpost.PostTypeValidator(entpost.PostType(v))
	}); raw != nil {
		kind := entpost.PostType(*raw)
		f.PostType = &kind
	}
	if raw := p.Enum("status", func(v string) error {
		return entpost.StatusValidator(entpost.Status(v))
	}); raw != nil {
		status := entpost.Status(*raw)
		f.Status = &status
	}
	if raw := p.Enum("target_type", func(v string) error {
		return enttarget.TargetTypeValidator(enttarget.TargetType(v))
	}); raw != nil {
		kind := enttarget.TargetType(*raw)
		f.TargetType = &kind
	}

	if err := p.Err(); err != nil {
		return streamPostFilters{}, err
	}
	return f, nil
}

func (f streamPostFilters) apply(q *tenantent.StreamPostQuery) *tenantent.StreamPostQuery {
	if f.AcademicSessionID != nil {
		q = q.Where(entpost.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.PostType != nil {
		q = q.Where(entpost.PostTypeEQ(*f.PostType))
	}
	if f.Status != nil {
		q = q.Where(entpost.StatusEQ(*f.Status))
	}
	if f.Pinned {
		q = q.Where(entpost.Pinned(true))
	}
	if f.Live {
		q = q.Where(streamPostLive(nowUTC()))
	}

	var narrow []predicate.StreamTarget
	if f.TargetType != nil {
		narrow = append(narrow, enttarget.TargetTypeEQ(*f.TargetType))
	}
	if len(f.TargetIDs) > 0 {
		narrow = append(narrow, enttarget.TargetIDIn(f.TargetIDs...))
	}
	if len(narrow) > 0 {
		q = q.Where(entpost.HasTargetsWith(narrow...))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func streamPostLive(at time.Time) predicate.StreamPost {
	return entpost.And(
		entpost.StatusEQ(entpost.StatusPublished),
		entpost.Or(entpost.PublishedAtIsNil(), entpost.PublishedAtLTE(at)),
		entpost.Or(entpost.ExpiresAtIsNil(), entpost.ExpiresAtGT(at)),
	)
}

func streamWindow(w http.ResponseWriter, publishedAt, expiresAt *time.Time) bool {
	if publishedAt == nil || expiresAt == nil {
		return true
	}
	if !expiresAt.After(*publishedAt) {
		response.Error(w, http.StatusUnprocessableEntity,
			entpost.FieldExpiresAt+" must fall after "+entpost.FieldPublishedAt)
		return false
	}
	return true
}

type resolvedTarget struct {
	kind enttarget.TargetType
	id   uuid.UUID
}

func decodeStreamTargets(w http.ResponseWriter, in []streamTargetPayload) ([]resolvedTarget, bool) {
	if len(in) == 0 {
		response.Error(w, http.StatusBadRequest,
			"targets is required: a post with no audience reaches nobody")
		return nil, false
	}
	if len(in) > maxStreamTargets {
		response.Error(w, http.StatusUnprocessableEntity,
			"a post may name at most 50 targets")
		return nil, false
	}

	seen := map[resolvedTarget]struct{}{}
	out := make([]resolvedTarget, 0, len(in))
	for _, raw := range in {
		if raw.TargetType == nil || raw.TargetID == nil {
			response.Error(w, http.StatusBadRequest,
				"each target needs a target_type and a target_id")
			return nil, false
		}
		kind := enttarget.TargetType(*raw.TargetType)
		if err := enttarget.TargetTypeValidator(kind); err != nil {
			response.Error(w, http.StatusBadRequest, streamTargetTypeValues)
			return nil, false
		}
		target := resolvedTarget{kind: kind, id: *raw.TargetID}
		if _, dup := seen[target]; dup {
			response.Error(w, http.StatusUnprocessableEntity,
				"the same target is named twice; each audience row must be distinct")
			return nil, false
		}
		seen[target] = struct{}{}
		out = append(out, target)
	}
	return out, true
}

func streamTargetExists(ctx context.Context, client *tenantent.Client, t resolvedTarget) (bool, error) {
	switch t.kind {
	case enttarget.TargetTypeSchool:
		return true, nil
	case enttarget.TargetTypeBranch:
		return client.Branch.Query().Where(entbranch.ID(t.id)).Exist(ctx)
	case enttarget.TargetTypeGrade:
		return client.GradeLevel.Query().Where(entgrade.ID(t.id)).Exist(ctx)
	case enttarget.TargetTypeSection:
		return client.Section.Query().Where(entsection.ID(t.id)).Exist(ctx)
	case enttarget.TargetTypeOffering:
		return client.SubjectOffering.Query().Where(entoffering.ID(t.id)).Exist(ctx)
	case enttarget.TargetTypeStudent:
		return client.Student.Query().Where(entstudent.ID(t.id)).Exist(ctx)
	default:
		return false, nil
	}
}

func checkStreamTargets(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	audience *access.Audience, targets []resolvedTarget) bool {
	for _, t := range targets {
		found, err := streamTargetExists(ctx, client, t)
		if err != nil {
			writeTenancyErr(w, err)
			return false
		}
		if !found {
			response.Error(w, http.StatusUnprocessableEntity,
				"the "+string(t.kind)+" target "+t.id.String()+" does not name a row that exists")
			return false
		}
		if !streamTargetWithin(audience, t) {
			response.Error(w, http.StatusForbidden,
				"your grant of "+string(authorization.StreamPostsWrite)+" does not reach the "+
					string(t.kind)+" target "+t.id.String())
			return false
		}
	}
	return true
}

func streamTargetWithin(a *access.Audience, t resolvedTarget) bool {
	if a == nil {
		return false
	}
	if a.All {
		return true
	}

	switch t.kind {
	case enttarget.TargetTypeSchool:
		return a.School
	case enttarget.TargetTypeBranch:
		return carriesID(a.Branches, t.id)
	case enttarget.TargetTypeGrade:
		return carriesID(a.Grades, t.id)
	case enttarget.TargetTypeSection:
		return carriesID(a.Sections, t.id)
	case enttarget.TargetTypeOffering:
		return carriesID(a.Offerings, t.id)
	case enttarget.TargetTypeStudent:
		return carriesID(a.Students, t.id)
	default:
		return false
	}
}

func carriesID(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func (s *Server) streamRead(ctx context.Context, narrow, wide authorization.Entity) (
	*access.Viewer, authorization.Decision, *access.Audience, error) {
	viewer, decision, err := s.scopeFor(ctx, narrow, wide)
	if err != nil {
		return nil, decision, nil, err
	}
	audience, err := access.ReadableAudience(ctx, viewer, decision)
	if err != nil {
		return nil, decision, nil, err
	}
	return viewer, decision, audience, nil
}

func (s *Server) streamWrite(ctx context.Context, narrow, wide authorization.Entity) (
	*access.Viewer, authorization.Decision, *access.Audience, error) {
	viewer, decision, err := s.scopeFor(ctx, narrow, wide)
	if err != nil {
		return nil, decision, nil, err
	}
	audience, err := access.WritableAudience(ctx, viewer, decision)
	if err != nil {
		return nil, decision, nil, err
	}
	return viewer, decision, audience, nil
}

func (s *Server) listStreamPosts(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseStreamPostFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	_, decision, audience, err := s.streamRead(ctx,
		authorization.StreamPostsRead, authorization.StreamPostsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.StreamPost.Query().Where(access.StreamPostsFor(audience))

	rows, err := filters.apply(q).
		Order(
			tenantent.Desc(entpost.FieldPinned),
			tenantent.Desc(entpost.FieldPublishedAt),
			tenantent.Desc(entpost.FieldCreatedAt),
		).
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
		"stream_posts": projected,
		"count":        len(rows),
		"page":         pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getStreamPost(w http.ResponseWriter, r *http.Request) {
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

	_, decision, audience, err := s.streamRead(ctx,
		authorization.StreamPostsRead, authorization.StreamPostsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.StreamPost.Query().
		Where(entpost.ID(id), access.StreamPostsFor(audience)).
		WithTargets().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, postNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, response.Envelope{
		"stream_post": projected,
		"targets":     row.Edges.Targets,
	})
}

func (s *Server) createStreamPost(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in streamPostPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, audience, err := s.streamWrite(ctx,
		authorization.StreamPostsWrite, authorization.StreamPostsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entpost.Columns, columnsSent(sent, entpost.ValidColumn)) {
		return
	}
	if viewer.PersonID == nil {
		response.Error(w, http.StatusForbidden,
			"a stream post records its author, and this caller has no person record in the school")
		return
	}

	if in.Body == nil || *in.Body == "" {
		response.Error(w, http.StatusBadRequest, "body is required")
		return
	}
	if !withinRunes(w, entpost.FieldBody, *in.Body, streamBodyRunes) {
		return
	}
	if in.Title != nil && !withinRunes(w, entpost.FieldTitle, *in.Title, streamTitleRunes) {
		return
	}

	targets, ok := decodeStreamTargets(w, in.Targets)
	if !ok {
		return
	}
	if !checkStreamTargets(ctx, w, client, audience, targets) {
		return
	}

	publishedAt, ok := instantField(w, entpost.FieldPublishedAt, in.PublishedAt)
	if !ok {
		return
	}
	expiresAt, ok := instantField(w, entpost.FieldExpiresAt, in.ExpiresAt)
	if !ok {
		return
	}
	if !streamWindow(w, publishedAt, expiresAt) {
		return
	}

	create := client.StreamPost.Create().
		SetAuthorPersonID(*viewer.PersonID).
		SetNillableAcademicSessionID(in.AcademicSessionID).
		SetBody(*in.Body).
		SetNillableTitle(in.Title).
		SetNillablePinned(in.Pinned).
		SetNillablePublishedAt(publishedAt).
		SetNillableExpiresAt(expiresAt)

	if in.PostType != nil {
		kind, ok := streamPostType(w, in.PostType)
		if !ok {
			return
		}
		create = create.SetPostType(kind)
	}
	if in.Status != nil {
		status, ok := streamPostStatus(w, in.Status)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, postNotFound)
		return
	}

	builders := make([]*tenantent.StreamTargetCreate, 0, len(targets))
	for _, t := range targets {
		builders = append(builders, client.StreamTarget.Create().
			SetPostID(row.ID).
			SetTargetType(t.kind).
			SetTargetID(t.id))
	}
	saved, err := client.StreamTarget.CreateBulk(builders...).Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, postNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/stream-posts/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{
		"stream_post": row,
		"targets":     saved,
	})
}

func (s *Server) updateStreamPost(w http.ResponseWriter, r *http.Request) {
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

	var in streamPostPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, audience, err := s.streamWrite(ctx,
		authorization.StreamPostsWrite, authorization.StreamPostsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entpost.Columns, columnsSent(sent, entpost.ValidColumn)) {
		return
	}
	if in.Targets != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"targets fix the audience when the post is created and cannot be changed; "+
				"withdraw this post and make another")
		return
	}
	if wasSent(sent, entpost.FieldAcademicSessionID) {
		response.Error(w, http.StatusUnprocessableEntity,
			entpost.FieldAcademicSessionID+" is recorded when the post is created and cannot be changed")
		return
	}

	current, err := client.StreamPost.Query().
		Where(entpost.ID(id), access.StreamPostsWritableBy(audience)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, postNotFound)
		return
	}

	if in.Body != nil {
		if *in.Body == "" {
			response.Error(w, http.StatusBadRequest, "body must not be empty")
			return
		}
		if !withinRunes(w, entpost.FieldBody, *in.Body, streamBodyRunes) {
			return
		}
	}
	if in.Title != nil && !withinRunes(w, entpost.FieldTitle, *in.Title, streamTitleRunes) {
		return
	}

	publishedAt, ok := instantField(w, entpost.FieldPublishedAt, in.PublishedAt)
	if !ok {
		return
	}
	expiresAt, ok := instantField(w, entpost.FieldExpiresAt, in.ExpiresAt)
	if !ok {
		return
	}
	if !streamWindow(w, pick(publishedAt, current.PublishedAt), pick(expiresAt, current.ExpiresAt)) {
		return
	}

	update := client.StreamPost.Update().
		Where(entpost.ID(id), access.StreamPostsWritableBy(audience)).
		SetNillableBody(in.Body).
		SetNillableTitle(in.Title).
		SetNillablePinned(in.Pinned).
		SetNillablePublishedAt(publishedAt).
		SetNillableExpiresAt(expiresAt)

	if wasSent(sent, entpost.FieldPublishedAt) && publishedAt == nil {
		update = update.ClearPublishedAt()
	}
	if wasSent(sent, entpost.FieldExpiresAt) && expiresAt == nil {
		update = update.ClearExpiresAt()
	}
	if in.PostType != nil {
		kind, ok := streamPostType(w, in.PostType)
		if !ok {
			return
		}
		update = update.SetPostType(kind)
	}
	if in.Status != nil {
		status, ok := streamPostStatus(w, in.Status)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, postNotFound) {
		return
	}

	row, err := client.StreamPost.Query().Where(entpost.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, postNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func pick(sent, current *time.Time) *time.Time {
	if sent != nil {
		return sent
	}
	return current
}

func (s *Server) deleteStreamPost(w http.ResponseWriter, r *http.Request) {
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

	_, _, audience, err := s.streamWrite(ctx,
		authorization.StreamPostsDelete, authorization.StreamPostsDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	n, err := client.StreamPost.Delete().
		Where(entpost.ID(id), access.StreamPostsWritableBy(audience)).
		Exec(ctx)
	if err != nil {
		writeTenantEntErr(w, err, postNotFound)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, postNotFound)
		return
	}
	response.NoContent(w)
}

func (s *Server) listStreamComments(w http.ResponseWriter, r *http.Request) {
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

	p := filter.New(r.URL.Query())
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	_, decision, audience, err := s.streamRead(ctx,
		authorization.StreamCommentsRead, authorization.StreamCommentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := client.StreamComment.Query().
		Where(
			entcomment.PostID(id),
			entcomment.StatusEQ(entcomment.StatusVisible),
			access.StreamCommentsFor(audience),
		).
		Order(tenantent.Asc(entcomment.FieldCreatedAt)).
		Limit(limit).Offset(offset).
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
		"stream_comments": projected,
		"count":           len(rows),
		"page":            pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) createStreamComment(w http.ResponseWriter, r *http.Request) {
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

	var in streamCommentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StreamCommentsWrite, authorization.StreamCommentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entcomment.Columns, columnsSent(sent, entcomment.ValidColumn)) {
		return
	}
	if viewer.PersonID == nil {
		response.Error(w, http.StatusForbidden,
			"a comment records its author, and this caller has no person record in the school")
		return
	}

	audience, err := access.ReadableAudience(ctx, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if in.Body == nil || *in.Body == "" {
		response.Error(w, http.StatusBadRequest, "body is required")
		return
	}
	if !withinRunes(w, entcomment.FieldBody, *in.Body, streamCommentRunes) {
		return
	}

	found, err := client.StreamPost.Query().
		Where(entpost.ID(id), access.StreamPostsFor(audience)).
		Exist(ctx)
	if !mustReach(w, found, err, postNotFound) {
		return
	}

	row, err := client.StreamComment.Create().
		SetPostID(id).
		SetAuthorPersonID(*viewer.PersonID).
		SetBody(*in.Body).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, commentNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/stream-comments/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) moderateStreamComment(w http.ResponseWriter, r *http.Request) {
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

	var in streamCommentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StreamCommentsWrite, authorization.StreamCommentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entcomment.Columns, columnsSent(sent, entcomment.ValidColumn)) {
		return
	}

	readable, err := access.ReadableAudience(ctx, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	writable, err := access.WritableAudience(ctx, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if in.Body != nil {
		if *in.Body == "" {
			response.Error(w, http.StatusBadRequest, "body must not be empty")
			return
		}
		if !withinRunes(w, entcomment.FieldBody, *in.Body, streamCommentRunes) {
			return
		}
	}

	update := client.StreamComment.Update().SetNillableBody(in.Body)

	switch {
	case in.Status != nil:
		status, ok := streamCommentStatus(w, in.Status)
		if !ok {
			return
		}
		if in.Body != nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"moderating a comment hides it; it does not rewrite what somebody else said")
			return
		}
		update = update.SetStatus(status).
			Where(entcomment.ID(id), access.StreamCommentsModeratableBy(writable))
	default:
		update = update.Where(entcomment.ID(id),
			access.StreamCommentsWritableBy(readable, viewer))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, commentNotFound) {
		return
	}

	row, err := client.StreamComment.Query().Where(entcomment.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, commentNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteStreamComment(w http.ResponseWriter, r *http.Request) {
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
		authorization.StreamCommentsDelete, authorization.StreamCommentsDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	readable, err := access.ReadableAudience(ctx, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	writable, err := access.WritableAudience(ctx, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	n, err := client.StreamComment.Delete().
		Where(entcomment.ID(id), entcomment.Or(
			access.StreamCommentsWritableBy(readable, viewer),
			access.StreamCommentsModeratableBy(writable),
		)).
		Exec(ctx)
	if err != nil {
		writeTenantEntErr(w, err, commentNotFound)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, commentNotFound)
		return
	}
	response.NoContent(w)
}

func (s *Server) mountStream(r chi.Router) {
	r.Route("/stream-posts", func(r chi.Router) {
		r.With(s.can(authorization.StreamPostsRead)).Get("/", s.listStreamPosts)
		r.With(s.can(authorization.StreamPostsWrite)).Post("/", s.createStreamPost)
		r.With(s.can(authorization.StreamPostsRead)).Get("/{id}", s.getStreamPost)
		r.With(s.can(authorization.StreamPostsWrite)).Patch("/{id}", s.updateStreamPost)
		r.With(s.can(authorization.StreamPostsDelete)).Delete("/{id}", s.deleteStreamPost)

		r.With(s.can(authorization.StreamCommentsRead)).Get("/{id}/comments", s.listStreamComments)
		r.With(s.can(authorization.StreamCommentsWrite)).Post("/{id}/comments", s.createStreamComment)
	})

	r.Route("/stream-comments", func(r chi.Router) {
		r.With(s.can(authorization.StreamCommentsWrite)).Patch("/{id}", s.moderateStreamComment)
		r.With(s.can(authorization.StreamCommentsDelete)).Delete("/{id}", s.deleteStreamComment)
	})
}
