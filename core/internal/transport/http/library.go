package http

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entquestionpaper "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/questionpaper"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type contentItemPayload struct {
	Kind              *string         `json:"kind"`
	Title             *string         `json:"title"`
	Description       *string         `json:"description"`
	SubjectID         *uuid.UUID      `json:"subject_id"`
	GradeLevelID      *uuid.UUID      `json:"grade_level_id"`
	SectionID         *uuid.UUID      `json:"section_id"`
	SubjectOfferingID *uuid.UUID      `json:"subject_offering_id"`
	Language          *string         `json:"language"`
	Author            *string         `json:"author"`
	Publisher         *string         `json:"publisher"`
	Isbn              *string         `json:"isbn"`
	AssetID           *uuid.UUID      `json:"asset_id"`
	OwnerPersonID     *uuid.UUID      `json:"owner_person_id"`
	Audience          *string         `json:"audience"`
	SupersedesID      *uuid.UUID      `json:"supersedes_id"`
	Status            *string         `json:"status"`
	IngestMode        *string         `json:"ingest_mode"`
	Metadata          shared.Metadata `json:"metadata_json"`
	Paper             json.RawMessage `json:"paper"`
}

const paperKey = "paper"

type questionPaperPayload struct {
	ContentItemID   *uuid.UUID      `json:"content_item_id"`
	ExamType        *string         `json:"exam_type"`
	Board           *string         `json:"board"`
	ExamYear        *int            `json:"exam_year"`
	TotalMarks      *int            `json:"total_marks"`
	DurationMinutes *int            `json:"duration_minutes"`
	PaperSet        *string         `json:"paper_set"`
	Attempt         *string         `json:"attempt"`
	Metadata        shared.Metadata `json:"metadata_json"`
}

func withoutPaper(sent []string) []string {
	out := make([]string, 0, len(sent))
	for _, field := range sent {
		if field != paperKey {
			out = append(out, field)
		}
	}
	return out
}

func paperSupplied(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) > 0 && !bytes.Equal(trimmed, []byte("null"))
}

func paperKeysSent(raw json.RawMessage) []string {
	dec := json.NewDecoder(bytes.NewReader(raw))
	tok, err := dec.Token()
	if err != nil || tok != json.Delim('{') {
		return nil
	}

	var present []string
	seen := map[string]bool{}
	for dec.More() {
		name, err := dec.Token()
		if err != nil {
			break
		}
		key, ok := name.(string)
		if !ok {
			break
		}
		if !seen[key] {
			seen[key] = true
			present = append(present, key)
		}
		var skip json.RawMessage
		if err := dec.Decode(&skip); err != nil {
			break
		}
	}
	return present
}

func decodePaper(w http.ResponseWriter, raw json.RawMessage) (*questionPaperPayload, []string, bool) {
	if !paperSupplied(raw) {
		return nil, nil, true
	}

	var in questionPaperPayload
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid paper object: "+err.Error())
		return nil, nil, false
	}
	in.Board = normalizedBoard(in.Board)
	return &in, paperKeysSent(raw), true
}

func normalizedBoard(raw *string) *string {
	if raw == nil {
		return nil
	}
	board := strings.Join(strings.Fields(*raw), " ")
	return &board
}

func checkPaperPairing(w http.ResponseWriter, kind entcontentitem.Kind,
	in *questionPaperPayload, existing *tenantent.QuestionPaper) bool {
	if kind == entcontentitem.KindPaper {
		if in == nil && existing == nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"kind "+string(entcontentitem.KindPaper)+" requires a "+paperKey+
					" object; without its exam metadata a paper cannot be found by exam, year or board")
			return false
		}
		return true
	}
	if in != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"a "+paperKey+" object may only be sent with kind "+
				string(entcontentitem.KindPaper)+", not "+string(kind))
		return false
	}
	if existing != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"this item carries exam metadata and cannot become a "+string(kind)+
				"; delete it instead of leaving its "+paperKey+" behind")
		return false
	}
	return true
}

func checkPaperFields(w http.ResponseWriter, in *questionPaperPayload, sent []string, creating bool) bool {
	if in == nil {
		return true
	}
	if wasSent(sent, entquestionpaper.FieldContentItemID) {
		response.Error(w, http.StatusUnprocessableEntity,
			paperKey+"."+entquestionpaper.FieldContentItemID+
				" names the item the paper belongs to and is chosen by the server")
		return false
	}

	if in.Board != nil && !withinRunes(w, paperKey+"."+entquestionpaper.FieldBoard,
		*in.Board, boardRunes) {
		return false
	}

	blank := in.ExamType == nil || *in.ExamType == ""
	if creating && blank {
		response.Error(w, http.StatusBadRequest,
			paperKey+"."+entquestionpaper.FieldExamType+" is required")
		return false
	}
	if !creating && wasSent(sent, entquestionpaper.FieldExamType) && blank {
		response.Error(w, http.StatusBadRequest,
			paperKey+"."+entquestionpaper.FieldExamType+" must not be empty")
		return false
	}

	for _, counted := range []struct {
		name  string
		value *int
	}{
		{entquestionpaper.FieldExamYear, in.ExamYear},
		{entquestionpaper.FieldTotalMarks, in.TotalMarks},
		{entquestionpaper.FieldDurationMinutes, in.DurationMinutes},
	} {
		if counted.value != nil && *counted.value <= 0 {
			response.Error(w, http.StatusBadRequest,
				paperKey+"."+counted.name+" must be positive")
			return false
		}
	}
	return true
}

func (in *questionPaperPayload) create(c *tenantent.Client, item uuid.UUID) *tenantent.QuestionPaperCreate {
	create := c.QuestionPaper.Create().
		SetContentItemID(item).
		SetExamType(*in.ExamType).
		SetNillableBoard(in.Board).
		SetNillableExamYear(in.ExamYear).
		SetNillableTotalMarks(in.TotalMarks).
		SetNillableDurationMinutes(in.DurationMinutes).
		SetNillablePaperSet(in.PaperSet).
		SetNillableAttempt(in.Attempt)

	if in.Metadata != nil {
		create = create.SetMetadataJSON(in.Metadata)
	}
	return create
}

func (in *questionPaperPayload) update(u *tenantent.QuestionPaperUpdateOne,
	sent []string) *tenantent.QuestionPaperUpdateOne {
	u = u.SetNillableExamType(in.ExamType).
		SetNillableBoard(in.Board).
		SetNillableExamYear(in.ExamYear).
		SetNillableTotalMarks(in.TotalMarks).
		SetNillableDurationMinutes(in.DurationMinutes).
		SetNillablePaperSet(in.PaperSet).
		SetNillableAttempt(in.Attempt)

	if in.Metadata != nil {
		u = u.SetMetadataJSON(in.Metadata)
	}
	if wasSent(sent, entquestionpaper.FieldBoard) && in.Board == nil {
		u = u.ClearBoard()
	}
	if wasSent(sent, entquestionpaper.FieldExamYear) && in.ExamYear == nil {
		u = u.ClearExamYear()
	}
	if wasSent(sent, entquestionpaper.FieldTotalMarks) && in.TotalMarks == nil {
		u = u.ClearTotalMarks()
	}
	if wasSent(sent, entquestionpaper.FieldDurationMinutes) && in.DurationMinutes == nil {
		u = u.ClearDurationMinutes()
	}
	if wasSent(sent, entquestionpaper.FieldPaperSet) && in.PaperSet == nil {
		u = u.ClearPaperSet()
	}
	if wasSent(sent, entquestionpaper.FieldAttempt) && in.Attempt == nil {
		u = u.ClearAttempt()
	}
	return u
}

func rollbackLibraryTx(tx *tenantent.Tx) {
	if tx != nil {
		_ = tx.Rollback()
	}
}

func withPaper(projected any, paper *tenantent.QuestionPaper,
	policy *authorization.FieldPolicy) (any, error) {
	if paper == nil {
		return projected, nil
	}

	sidecar, err := project(paper, policy)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(sidecar)
	if err != nil {
		return nil, err
	}

	raw, err := json.Marshal(projected)
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}

	delete(fields, edgesKey)
	fields[paperKey] = encoded
	return fields, nil
}

func projectLibraryItem(row *tenantent.ContentItem, policy *authorization.FieldPolicy) (any, error) {
	projected, err := project(row, policy)
	if err != nil {
		return nil, err
	}
	return withPaper(projected, row.Edges.QuestionPaper, policy)
}

func projectLibraryItems(rows []*tenantent.ContentItem, policy *authorization.FieldPolicy) (any, error) {
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		projected, err := projectLibraryItem(row, policy)
		if err != nil {
			return nil, err
		}
		out = append(out, projected)
	}
	return out, nil
}

type assetPayload struct {
	StorageKey *string         `json:"storage_key"`
	FileName   *string         `json:"file_name"`
	MimeType   *string         `json:"mime_type"`
	SizeBytes  *int64          `json:"size_bytes"`
	Sha256     *string         `json:"sha256"`
	UploadedBy *uuid.UUID      `json:"uploaded_by"`
	Status     *string         `json:"status"`
	Metadata   shared.Metadata `json:"metadata_json"`
}

type assetFilters struct {
	Status     *entasset.Status
	MimeType   *string
	UploadedBy *uuid.UUID

	Limit  int
	Offset int
}

func parseAssetFilters(values url.Values) (assetFilters, error) {
	p := filter.New(values)

	f := assetFilters{
		MimeType:   optionalFilterString(p, entasset.FieldMimeType),
		UploadedBy: p.UUID(entasset.FieldUploadedBy),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum(entasset.FieldStatus, func(v string) error {
		return entasset.StatusValidator(entasset.Status(v))
	}); raw != nil {
		status := entasset.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return assetFilters{}, err
	}
	return f, nil
}

func (f assetFilters) apply(q *tenantent.AssetQuery) *tenantent.AssetQuery {
	if f.Status != nil {
		q = q.Where(entasset.StatusEQ(*f.Status))
	}
	if f.MimeType != nil {
		q = q.Where(entasset.MimeType(*f.MimeType))
	}
	if f.UploadedBy != nil {
		q = q.Where(entasset.UploadedBy(*f.UploadedBy))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type libraryFilters struct {
	Kind              *entcontentitem.Kind
	Status            *entcontentitem.Status
	Audience          *entcontentitem.Audience
	SubjectID         *uuid.UUID
	GradeLevelID      *uuid.UUID
	SectionID         *uuid.UUID
	SubjectOfferingID *uuid.UUID
	OwnerPersonID     *uuid.UUID

	ExamType *string
	Board    *string
	ExamYear *int

	Limit  int
	Offset int
}

func optionalFilterString(p *filter.Params, name string) *string {
	raw := p.String(name)
	if raw == "" {
		return nil
	}
	return &raw
}

func parseLibraryFilters(values url.Values) (libraryFilters, error) {
	p := filter.New(values)

	f := libraryFilters{
		SubjectID:         p.UUID("subject_id"),
		GradeLevelID:      p.UUID("grade_level_id"),
		SectionID:         p.UUID("section_id"),
		SubjectOfferingID: p.UUID("subject_offering_id"),
		OwnerPersonID:     p.UUID("owner_person_id"),
		ExamType:          optionalFilterString(p, entquestionpaper.FieldExamType),
		Board:             normalizedBoard(optionalFilterString(p, entquestionpaper.FieldBoard)),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)
	year := p.Int(entquestionpaper.FieldExamYear, 0)

	if raw := p.Enum("kind", func(v string) error {
		return entcontentitem.KindValidator(entcontentitem.Kind(v))
	}); raw != nil {
		kind := entcontentitem.Kind(*raw)
		f.Kind = &kind
	}
	if raw := p.Enum("status", func(v string) error {
		return entcontentitem.StatusValidator(entcontentitem.Status(v))
	}); raw != nil {
		status := entcontentitem.Status(*raw)
		f.Status = &status
	}
	if raw := p.Enum("audience", func(v string) error {
		return entcontentitem.AudienceValidator(entcontentitem.Audience(v))
	}); raw != nil {
		audience := entcontentitem.Audience(*raw)
		f.Audience = &audience
	}

	if err := p.Err(); err != nil {
		return libraryFilters{}, err
	}
	if values.Has(entquestionpaper.FieldExamYear) {
		if year <= 0 {
			return libraryFilters{}, &filter.Error{
				Param:  entquestionpaper.FieldExamYear,
				Reason: "must be a positive year",
			}
		}
		f.ExamYear = &year
	}
	return f, nil
}

func (f libraryFilters) paperPredicates() []predicate.QuestionPaper {
	var preds []predicate.QuestionPaper
	if f.ExamType != nil {
		preds = append(preds, entquestionpaper.ExamTypeEQ(*f.ExamType))
	}
	if f.Board != nil {
		preds = append(preds, entquestionpaper.BoardEqualFold(*f.Board))
	}
	if f.ExamYear != nil {
		preds = append(preds, entquestionpaper.ExamYearEQ(*f.ExamYear))
	}
	return preds
}

func (f libraryFilters) apply(q *tenantent.ContentItemQuery) *tenantent.ContentItemQuery {
	if f.Kind != nil {
		q = q.Where(entcontentitem.KindEQ(*f.Kind))
	}
	if f.Status != nil {
		q = q.Where(entcontentitem.StatusEQ(*f.Status))
	}
	if f.Audience != nil {
		q = q.Where(entcontentitem.AudienceEQ(*f.Audience))
	}
	if f.SubjectID != nil {
		q = q.Where(entcontentitem.SubjectID(*f.SubjectID))
	}
	if f.GradeLevelID != nil {
		q = q.Where(entcontentitem.GradeLevelID(*f.GradeLevelID))
	}
	if f.SectionID != nil {
		q = q.Where(entcontentitem.SectionID(*f.SectionID))
	}
	if f.SubjectOfferingID != nil {
		q = q.Where(entcontentitem.SubjectOfferingID(*f.SubjectOfferingID))
	}
	if f.OwnerPersonID != nil {
		q = q.Where(entcontentitem.OwnerPersonID(*f.OwnerPersonID))
	}
	if preds := f.paperPredicates(); len(preds) > 0 {
		q = q.Where(entcontentitem.HasQuestionPaperWith(preds...))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type audienceScope struct {
	audience entcontentitem.Audience
	grade    *uuid.UUID
	section  *uuid.UUID
	offering *uuid.UUID
}

func audienceAnchor(a entcontentitem.Audience) string {
	switch a {
	case entcontentitem.AudienceGrade:
		return entcontentitem.FieldGradeLevelID
	case entcontentitem.AudienceSection:
		return entcontentitem.FieldSectionID
	case entcontentitem.AudienceOffering:
		return entcontentitem.FieldSubjectOfferingID
	default:
		return ""
	}
}

func (sc audienceScope) named(name string) *uuid.UUID {
	switch name {
	case entcontentitem.FieldGradeLevelID:
		return sc.grade
	case entcontentitem.FieldSectionID:
		return sc.section
	case entcontentitem.FieldSubjectOfferingID:
		return sc.offering
	default:
		return nil
	}
}

func checkAudienceScope(w http.ResponseWriter, sc audienceScope) bool {
	anchor := audienceAnchor(sc.audience)
	if anchor != "" && sc.named(anchor) == nil {
		response.Error(w, http.StatusBadRequest,
			"audience "+string(sc.audience)+" requires "+anchor)
		return false
	}
	for _, name := range []string{
		entcontentitem.FieldGradeLevelID,
		entcontentitem.FieldSectionID,
		entcontentitem.FieldSubjectOfferingID,
	} {
		if name != anchor && sc.named(name) != nil {
			response.Error(w, http.StatusBadRequest,
				"audience "+string(sc.audience)+" must not carry "+name)
			return false
		}
	}
	return true
}

func holdsID(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func teachesGrade(ctx context.Context, c *tenantent.Client, v *access.Viewer, grade uuid.UUID) (bool, error) {
	if len(v.SectionIDs) == 0 {
		return false, nil
	}
	return c.Section.Query().
		Where(entsection.IDIn(v.SectionIDs...), entsection.GradeLevelID(grade)).
		Exist(ctx)
}

func audienceWithinWriteScope(ctx context.Context, c *tenantent.Client, v *access.Viewer,
	d authorization.Decision, sc audienceScope) (bool, error) {
	if v == nil {
		return false, nil
	}
	if v.Unrestricted || (d.HasReach && d.Reach == authorization.ReachTenant) {
		return true, nil
	}

	switch sc.audience {
	case entcontentitem.AudienceOwner:
		return true, nil
	case entcontentitem.AudienceSection:
		return sc.section != nil && holdsID(v.SectionIDs, *sc.section), nil
	case entcontentitem.AudienceOffering:
		return sc.offering != nil && holdsID(v.SubjectOfferingIDs, *sc.offering), nil
	case entcontentitem.AudienceGrade:
		if sc.grade == nil {
			return false, nil
		}
		return teachesGrade(ctx, c, v, *sc.grade)
	default:
		return false, nil
	}
}

func checkPublishScope(ctx context.Context, w http.ResponseWriter, c *tenantent.Client,
	v *access.Viewer, d authorization.Decision, sc audienceScope) bool {
	within, err := audienceWithinWriteScope(ctx, c, v, d, sc)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !within {
		response.Error(w, http.StatusForbidden,
			"audience "+string(sc.audience)+" is outside what you may publish to")
		return false
	}
	return true
}

func applyAudienceScope(u *tenantent.ContentItemUpdate, sc audienceScope) *tenantent.ContentItemUpdate {
	if sc.grade != nil {
		u = u.SetGradeLevelID(*sc.grade)
	} else {
		u = u.ClearGradeLevelID()
	}
	if sc.section != nil {
		u = u.SetSectionID(*sc.section)
	} else {
		u = u.ClearSectionID()
	}
	if sc.offering != nil {
		u = u.SetSubjectOfferingID(*sc.offering)
	} else {
		u = u.ClearSubjectOfferingID()
	}
	return u
}

func wasSent(sent []string, name string) bool {
	for _, key := range sent {
		if key == name {
			return true
		}
	}
	return false
}

func patchedAnchor(sent []string, name string, supplied, current *uuid.UUID, moved bool) *uuid.UUID {
	if wasSent(sent, name) {
		return supplied
	}
	if moved {
		return nil
	}
	return current
}

func rejectImmutableLibraryFields(w http.ResponseWriter, sent []string) bool {
	for _, name := range []string{entcontentitem.FieldAssetID, entcontentitem.FieldOwnerPersonID} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded when the item is created and cannot be changed")
			return false
		}
	}
	return true
}

func libraryKind(w http.ResponseWriter, raw *string) (entcontentitem.Kind, bool) {
	kind := entcontentitem.Kind(*raw)
	if err := entcontentitem.KindValidator(kind); err != nil {
		response.Error(w, http.StatusBadRequest, "kind must be book, note, document or paper")
		return "", false
	}
	return kind, true
}

func libraryStatus(w http.ResponseWriter, raw *string) (entcontentitem.Status, bool) {
	status := entcontentitem.Status(*raw)
	if err := entcontentitem.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, "status must be draft, published or archived")
		return "", false
	}
	return status, true
}

func libraryAudience(w http.ResponseWriter, raw *string) (entcontentitem.Audience, bool) {
	audience := entcontentitem.Audience(*raw)
	if err := entcontentitem.AudienceValidator(audience); err != nil {
		response.Error(w, http.StatusBadRequest,
			"audience must be school, grade, section, offering or owner")
		return "", false
	}
	return audience, true
}

func (s *Server) listLibraryItems(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

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

	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.ContentItem.Query().
		Where(access.LibraryItemsFor(viewer, decision)).
		WithQuestionPaper()

	rows, err := filters.apply(q).
		Order(tenantent.Desc(entcontentitem.FieldCreatedAt)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectLibraryItems(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"content_items": projected,
		"count":         len(rows),
		"page":          pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getLibraryItem(w http.ResponseWriter, r *http.Request) {
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
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.ContentItem.Query().
		Where(entcontentitem.ID(id), access.LibraryItemsFor(viewer, decision)).
		WithQuestionPaper().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "library item not found")
		return
	}

	projected, err := projectLibraryItem(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createLibraryItem(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in contentItemPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	paper, paperSent, ok := decodePaper(w, in.Paper)
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryCreate, authorization.LibraryWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entcontentitem.Columns, withoutPaper(sent)) {
		return
	}
	if paper != nil && !rejectUnauthorizedFields(w, r, decision, entquestionpaper.Columns, paperSent) {
		return
	}

	if in.Title == nil || *in.Title == "" {
		response.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	if in.Audience == nil || *in.Audience == "" {
		response.Error(w, http.StatusBadRequest, "audience is required")
		return
	}
	audience, ok := libraryAudience(w, in.Audience)
	if !ok {
		return
	}

	kind := entcontentitem.DefaultKind
	if in.Kind != nil {
		if kind, ok = libraryKind(w, in.Kind); !ok {
			return
		}
	}
	if !checkPaperPairing(w, kind, paper, nil) {
		return
	}
	if !checkPaperFields(w, paper, paperSent, true) {
		return
	}

	scope := audienceScope{
		audience: audience,
		grade:    in.GradeLevelID,
		section:  in.SectionID,
		offering: in.SubjectOfferingID,
	}
	if !checkAudienceScope(w, scope) {
		return
	}
	if !checkPublishScope(ctx, w, client, viewer, decision, scope) {
		return
	}

	owner, ok := attributedTo(w, viewer, in.OwnerPersonID, "owner_person_id")
	if !ok {
		return
	}

	var mode entcontentitem.IngestMode
	if in.IngestMode != nil {
		if mode, ok = explicitIngestMode(ctx, w, client, in.IngestMode, in.AssetID); !ok {
			return
		}
	} else {
		mode = inferredIngestMode(ctx, client, in.AssetID)
	}

	writer := client
	var tx *tenantent.Tx
	if paper != nil {
		if tx, err = client.Tx(ctx); err != nil {
			response.ServerError(w, err)
			return
		}
		writer = tx.Client()
	}

	create := writer.ContentItem.Create().
		SetTitle(*in.Title).
		SetKind(kind).
		SetAudience(audience).
		SetOwnerPersonID(owner).
		SetNillableDescription(in.Description).
		SetNillableSubjectID(in.SubjectID).
		SetNillableGradeLevelID(scope.grade).
		SetNillableSectionID(scope.section).
		SetNillableSubjectOfferingID(scope.offering).
		SetNillableLanguage(in.Language).
		SetNillableAuthor(in.Author).
		SetNillablePublisher(in.Publisher).
		SetNillableIsbn(in.Isbn).
		SetNillableAssetID(in.AssetID).
		SetNillableSupersedesID(in.SupersedesID).
		SetIngestMode(mode)

	if in.Metadata != nil {
		create = create.SetMetadataJSON(in.Metadata)
	}
	if in.Status != nil {
		status, ok := libraryStatus(w, in.Status)
		if !ok {
			rollbackLibraryTx(tx)
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		rollbackLibraryTx(tx)
		writeTenantEntErr(w, err, "library item not found")
		return
	}

	var sidecar *tenantent.QuestionPaper
	if paper != nil {
		if sidecar, err = paper.create(writer, row.ID).Save(ctx); err != nil {
			rollbackLibraryTx(tx)
			writeTenantEntErr(w, err, "library item not found")
			return
		}
		if err := tx.Commit(); err != nil {
			response.ServerError(w, err)
			return
		}
	}

	s.indexOnPublish(ctx, client, row, "", row.Status)

	body, err := withPaper(row, sidecar, nil)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/library/"+row.ID.String())
	response.JSON(w, http.StatusCreated, body)
}

func (s *Server) updateLibraryItem(w http.ResponseWriter, r *http.Request) {
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

	var in contentItemPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	paper, paperSent, ok := decodePaper(w, in.Paper)
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryWrite, authorization.LibraryWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.ContentItem.Query().
		Where(entcontentitem.ID(id), access.LibraryItemsWritableBy(viewer, decision)).
		WithQuestionPaper().
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "library item not found")
		return
	}

	if !rejectUnauthorizedFields(w, r, decision, entcontentitem.Columns, withoutPaper(sent)) {
		return
	}
	if paper != nil && !rejectUnauthorizedFields(w, r, decision, entquestionpaper.Columns, paperSent) {
		return
	}
	if !rejectImmutableLibraryFields(w, sent) {
		return
	}

	kind := current.Kind
	if in.Kind != nil {
		if kind, ok = libraryKind(w, in.Kind); !ok {
			return
		}
	}
	if !checkPaperPairing(w, kind, paper, current.Edges.QuestionPaper) {
		return
	}
	if !checkPaperFields(w, paper, paperSent, current.Edges.QuestionPaper == nil) {
		return
	}

	audience := current.Audience
	if in.Audience != nil {
		if *in.Audience == "" {
			response.Error(w, http.StatusBadRequest, "audience must not be empty")
			return
		}
		audience, ok = libraryAudience(w, in.Audience)
		if !ok {
			return
		}
	}

	moved := audience != current.Audience
	scope := audienceScope{
		audience: audience,
		grade:    patchedAnchor(sent, entcontentitem.FieldGradeLevelID, in.GradeLevelID, current.GradeLevelID, moved),
		section:  patchedAnchor(sent, entcontentitem.FieldSectionID, in.SectionID, current.SectionID, moved),
		offering: patchedAnchor(sent, entcontentitem.FieldSubjectOfferingID, in.SubjectOfferingID, current.SubjectOfferingID, moved),
	}
	if !checkAudienceScope(w, scope) {
		return
	}
	if !checkPublishScope(ctx, w, client, viewer, decision, scope) {
		return
	}

	var mode *entcontentitem.IngestMode
	if in.IngestMode != nil {
		wanted, ok := libraryIngestMode(w, in.IngestMode)
		if !ok {
			return
		}
		if !checkDeferrableAsset(ctx, w, client, wanted, current.AssetID) {
			return
		}
		if !checkDeferrablePlacements(ctx, w, client, wanted, id) {
			return
		}
		mode = &wanted
	}

	writer := client
	var tx *tenantent.Tx
	if paper != nil {
		if tx, err = client.Tx(ctx); err != nil {
			response.ServerError(w, err)
			return
		}
		writer = tx.Client()
	}

	update := writer.ContentItem.Update().
		Where(entcontentitem.ID(id), access.LibraryItemsWritableBy(viewer, decision)).
		SetKind(kind).
		SetAudience(audience).
		SetNillableTitle(in.Title).
		SetNillableDescription(in.Description).
		SetNillableSubjectID(in.SubjectID).
		SetNillableLanguage(in.Language).
		SetNillableAuthor(in.Author).
		SetNillablePublisher(in.Publisher).
		SetNillableIsbn(in.Isbn).
		SetNillableSupersedesID(in.SupersedesID)

	update = applyAudienceScope(update, scope)
	if mode != nil {
		update = update.SetIngestMode(*mode)
	}

	next := current.Status
	if in.Metadata != nil {
		update = update.SetMetadataJSON(in.Metadata)
	}
	if in.Status != nil {
		status, ok := libraryStatus(w, in.Status)
		if !ok {
			rollbackLibraryTx(tx)
			return
		}
		next = status
		update = update.SetStatus(status)
	}

	if n, err := update.Save(ctx); err != nil || n == 0 {
		rollbackLibraryTx(tx)
		wroteScopedRow(w, n, err, "library item not found")
		return
	}

	row, err := writer.ContentItem.Query().Where(entcontentitem.ID(id)).Only(ctx)
	if err != nil {
		rollbackLibraryTx(tx)
		writeTenantEntErr(w, err, "library item not found")
		return
	}

	sidecar := current.Edges.QuestionPaper
	if paper != nil {
		if sidecar == nil {
			sidecar, err = paper.create(writer, row.ID).Save(ctx)
		} else {
			sidecar, err = paper.update(writer.QuestionPaper.UpdateOneID(sidecar.ID), paperSent).Save(ctx)
		}
		if err != nil {
			rollbackLibraryTx(tx)
			writeTenantEntErr(w, err, "library item not found")
			return
		}
		if err := tx.Commit(); err != nil {
			response.ServerError(w, err)
			return
		}
	}

	s.indexOnPublish(ctx, client, row, current.Status, next)

	body, err := withPaper(row, sidecar, nil)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, body)
}

var libraryIndexer *indexing.Dispatcher

func UseIndexer(d *indexing.Dispatcher) { libraryIndexer = d }

var openIndexerStore = func(ctx context.Context, s *Server) (indexing.SignedSource, error) {
	return openObjectStore(ctx, s)
}

func publishedNow(previous, next entcontentitem.Status) bool {
	return next == entcontentitem.StatusPublished && previous != entcontentitem.StatusPublished
}

func (s *Server) indexOnPublish(ctx context.Context, client *tenantent.Client,
	row *tenantent.ContentItem, previous, next entcontentitem.Status) {

	if s.cfg == nil || !s.cfg.RetrievalIndexing() || libraryIndexer == nil {
		return
	}
	if !publishedNow(previous, next) || row.AssetID == nil {
		return
	}

	tenant, err := tenancy.FromContext(ctx)
	if err != nil {
		return
	}
	if strings.TrimSpace(tenant.CASTenantID) == "" {
		observability.Step(ctx, observability.ComponentData,
			"not indexing a published item: this school has no CAS tenant slug and the "+
				"engine partitions on one", "content_item", row.ID)
		return
	}

	store, err := openIndexerStore(ctx, s)
	if err != nil {
		observability.Problem(ctx, observability.ComponentData,
			"not indexing a published item: no object store", withoutSignedURLs(err),
			"content_item", row.ID)
		return
	}

	if err := indexing.MarkPending(ctx, client, row.ID); err != nil {
		observability.Problem(ctx, observability.ComponentData,
			"could not mark a published item for indexing", err, "content_item", row.ID)
		return
	}

	err = libraryIndexer.Submit(client, indexing.Request{
		Tenant:   tenant.CASTenantID,
		SchoolID: tenant.SchoolID,
		ItemID:   row.ID,
		Store:    store,
	})
	if err != nil {
		observability.Problem(ctx, observability.ComponentData,
			"could not queue a published item for indexing", err, "content_item", row.ID)
		indexing.Abandon(ctx, client, row.ID, observability.From(ctx))
	}
}

func (s *Server) deleteLibraryItem(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "library item not found",
		authorization.LibraryDelete, authorization.LibraryDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.ContentItem.Delete().
				Where(entcontentitem.ID(id), access.LibraryItemsWritableBy(v, d)).
				Exec(ctx)
		})
}

func anyAsset() predicate.Asset { return func(*sql.Selector) {} }

func assetsVisibleTo(v *access.Viewer, d authorization.Decision) predicate.Asset {
	if v == nil {
		return entasset.IDIn()
	}
	if v.Unrestricted {
		return anyAsset()
	}

	reachable := entasset.HasContentItemsWith(access.LibraryItemsFor(v, d))
	if v.PersonID == nil {
		return reachable
	}
	return entasset.Or(reachable, entasset.UploadedBy(*v.PersonID))
}

func assetsDeletableBy(v *access.Viewer, d authorization.Decision) predicate.Asset {
	visible := assetsVisibleTo(v, d)
	if v == nil || v.Unrestricted {
		return visible
	}
	if d.HasReach && d.Reach == authorization.ReachTenant {
		return visible
	}
	if v.PersonID == nil {
		return entasset.IDIn()
	}
	return entasset.And(visible, entasset.UploadedBy(*v.PersonID))
}

func scopedAssets(q *tenantent.AssetQuery, v *access.Viewer,
	d authorization.Decision) *tenantent.AssetQuery {
	return q.Where(assetsVisibleTo(v, d))
}

func scopedAsset(c *tenantent.Client, id uuid.UUID, v *access.Viewer,
	d authorization.Decision) *tenantent.AssetQuery {
	return scopedAssets(c.Asset.Query().Where(entasset.ID(id)), v, d)
}

func deletableAsset(c *tenantent.Client, id uuid.UUID, v *access.Viewer,
	d authorization.Decision) *tenantent.AssetQuery {
	return c.Asset.Query().Where(entasset.ID(id), assetsDeletableBy(v, d))
}

const (
	uploadLinkTTL     = 15 * time.Minute
	downloadLinkTTL   = 5 * time.Minute
	assetUploadWindow = 30 * time.Minute
	discardWindow     = 10 * time.Second
)

const MaxAssetBytes int64 = 200 << 20

func humanBytes(n int64) string {
	const unit = 1024
	if n < unit {
		return fmt.Sprintf("%d bytes", n)
	}

	names := [...]string{"KB", "MB", "GB", "TB"}
	div, exp := int64(unit), 0
	for n/div >= unit && exp < len(names)-1 {
		div *= unit
		exp++
	}

	whole, tenths := n/div, (n%div)*10/div
	if tenths == 0 {
		return fmt.Sprintf("%d %s", whole, names[exp])
	}
	return fmt.Sprintf("%d.%d %s", whole, tenths, names[exp])
}

func assetTooLarge(size int64) string {
	return fmt.Sprintf("an asset may be at most %s; this one declares %s (%d bytes), so "+
		"compress it or split it into parts under %s and create the asset again",
		humanBytes(MaxAssetBytes), humanBytes(size), size, humanBytes(MaxAssetBytes))
}

const (
	AssetZeroLengthCode        = "asset_zero_length"
	AssetTooLargeCode          = "asset_too_large"
	AssetAlreadyUploadedCode   = "asset_already_uploaded"
	AssetDeletedCode           = "asset_deleted"
	AssetObjectMissingCode     = "asset_object_missing"
	AssetSizeMismatchCode      = "asset_size_mismatch"
	AssetDigestMismatchCode    = "asset_digest_mismatch"
	AssetDigestUnavailableCode = "asset_digest_unavailable"
)

func writeAssetRefusal(w http.ResponseWriter, status int, code, message string) {
	response.JSON(w, status, response.Envelope{
		"error":   http.StatusText(status),
		"message": message,
		"code":    code,
	})
}

type objectStore interface {
	PresignPut(ctx context.Context, r blob.PutRequest) (blob.PutGrant, error)
	PresignGet(ctx context.Context, key string, expires time.Duration) (string, error)
	Get(ctx context.Context, r blob.GetRequest) (blob.ObjectStream, error)
	Put(ctx context.Context, r blob.PutStream) error
	Head(ctx context.Context, key string) (blob.ObjectInfo, error)
	Delete(ctx context.Context, key string) error
}

var openObjectStore = func(ctx context.Context, s *Server) (objectStore, error) {
	tenant, err := tenancy.FromContext(ctx)
	if err != nil {
		return nil, err
	}
	if s.registry == nil {
		return nil, tenancy.ErrNoProfile
	}
	creds, err := s.registry.S3Credentials(ctx, tenant.SchoolID)
	if err != nil {
		return nil, err
	}
	return blob.New(*creds)
}

func (s *Server) objectStore(ctx context.Context, w http.ResponseWriter) (objectStore, bool) {
	store, err := openObjectStore(ctx, s)
	if err != nil {
		writeObjectStoreErr(w, err)
		return nil, false
	}
	return store, true
}

func writeObjectStoreErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, blob.ErrZeroLength):
		writeAssetRefusal(w, http.StatusBadRequest, AssetZeroLengthCode,
			"a zero byte upload cannot be signed, because its length cannot be bound into "+
				"the signature; no asset was recorded, so there is nothing to retry against")
	case errors.Is(err, tenancy.ErrNoProfile):
		response.Error(w, http.StatusServiceUnavailable,
			"this school has no object store configured")
	case err == tenancy.ErrNoTenant:
		writeTenancyErr(w, err)
	default:
		response.ServerError(w, withoutSignedURLs(err))
	}
}

func withoutSignedURLs(err error) error {
	fields := strings.Fields(err.Error())
	signed := false
	for i, field := range fields {
		if !strings.Contains(field, "://") {
			continue
		}
		if cut := strings.IndexByte(field, '?'); cut >= 0 {
			fields[i] = field[:cut] + "?[redacted]"
			signed = true
		}
	}
	if !signed {
		return err
	}
	return errors.New(strings.Join(fields, " "))
}

func traceObjectGrant(ctx context.Context, op string, id uuid.UUID, key string, ttl time.Duration) {
	observability.Step(ctx, observability.ComponentData, op,
		"asset_id", id, "storage_key", key, "expires_in_s", int64(ttl.Seconds()))
}

type assetUploadGrant struct {
	*tenantent.Asset
	UploadURL       string            `json:"upload_url"`
	UploadHeaders   map[string]string `json:"upload_headers"`
	UploadExpiresAt time.Time         `json:"upload_expires_at"`
}

func mintedStorageKey(id uuid.UUID) string { return "library/" + id.String() }

func (s *Server) listAssets(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseAssetFilters(r.URL.Query())
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

	rows, err := filters.apply(scopedAssets(client.Asset.Query(), viewer, decision)).
		Order(tenantent.Desc(entasset.FieldCreatedAt)).
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
		"assets": projected,
		"count":  len(rows),
		"page":   pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getAsset(w http.ResponseWriter, r *http.Request) {
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
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := scopedAsset(client, id, viewer, decision).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
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

func (s *Server) createAsset(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in assetPayload
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
	if !rejectUnauthorizedFields(w, r, decision, entasset.Columns, sent) {
		return
	}

	if in.StorageKey != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"storage_key is chosen by the server and must not be supplied")
		return
	}
	if in.Status != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"status is chosen by the server and must not be supplied")
		return
	}
	if in.FileName == nil || *in.FileName == "" {
		response.Error(w, http.StatusBadRequest, "file_name is required")
		return
	}
	if in.MimeType == nil || *in.MimeType == "" {
		response.Error(w, http.StatusBadRequest, "mime_type is required")
		return
	}
	if in.Sha256 == nil || *in.Sha256 == "" {
		response.Error(w, http.StatusBadRequest, "sha256 is required")
		return
	}
	if in.SizeBytes == nil {
		response.Error(w, http.StatusBadRequest, "size_bytes is required")
		return
	}
	if *in.SizeBytes < 0 {
		response.Error(w, http.StatusBadRequest, "size_bytes must not be negative")
		return
	}
	if *in.SizeBytes > MaxAssetBytes {
		writeAssetRefusal(w, http.StatusUnprocessableEntity, AssetTooLargeCode,
			assetTooLarge(*in.SizeBytes))
		return
	}

	uploader, ok := attributedToOptional(w, viewer, in.UploadedBy, "uploaded_by")
	if !ok {
		return
	}

	id := uuid.New()
	key := mintedStorageKey(id)

	store, ok := s.objectStore(ctx, w)
	if !ok {
		return
	}
	grant, err := store.PresignPut(ctx, blob.PutRequest{
		Key:           key,
		ContentType:   *in.MimeType,
		ContentLength: *in.SizeBytes,
		SHA256Hex:     *in.Sha256,
		Expires:       uploadLinkTTL,
	})
	if err != nil {
		writeObjectStoreErr(w, err)
		return
	}

	create := client.Asset.Create().
		SetID(id).
		SetStorageKey(key).
		SetFileName(*in.FileName).
		SetMimeType(*in.MimeType).
		SetSizeBytes(*in.SizeBytes).
		SetSha256(*in.Sha256).
		SetNillableUploadedBy(uploader)

	if in.Metadata != nil {
		create = create.SetMetadataJSON(in.Metadata)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}
	traceObjectGrant(ctx, "upload link issued", row.ID, row.StorageKey, uploadLinkTTL)

	w.Header().Set("Location", "/api/v1/library/assets/"+row.ID.String())
	response.JSON(w, http.StatusCreated, assetUploadGrant{
		Asset:           row,
		UploadURL:       grant.URL,
		UploadHeaders:   grant.Headers,
		UploadExpiresAt: nowUTC().Add(uploadLinkTTL),
	})
}

type assetRefusal struct {
	code    string
	message string
}

var errUploadRefused = errors.New("the uploaded bytes are not the bytes this asset records")

type uploadCheck struct {
	src     io.Reader
	digest  hash.Hash
	want    string
	size    int64
	read    int64
	settled bool
	refused *assetRefusal
}

func newUploadCheck(src io.Reader, size int64, sha256Hex string) *uploadCheck {
	return &uploadCheck{src: src, digest: sha256.New(), want: sha256Hex, size: size}
}

func (u *uploadCheck) Read(p []byte) (int, error) {
	if u.refused != nil {
		return 0, errUploadRefused
	}

	n, err := u.src.Read(p)
	if n > 0 {
		u.read += int64(n)
		if u.read > u.size {
			u.refuse(AssetSizeMismatchCode, fmt.Sprintf(
				"the body carries more than the %d bytes this asset records", u.size))
			return n, errUploadRefused
		}
		u.digest.Write(p[:n])
	}
	if errors.Is(err, io.EOF) && u.settle() != nil {
		return n, errUploadRefused
	}
	return n, err
}

func (u *uploadCheck) settle() *assetRefusal {
	if u.settled {
		return u.refused
	}
	u.settled = true

	switch {
	case u.read != u.size:
		u.refuse(AssetSizeMismatchCode, fmt.Sprintf(
			"the body carries %d bytes but this asset records %d", u.read, u.size))
	case !strings.EqualFold(hex.EncodeToString(u.digest.Sum(nil)), u.want):
		u.refuse(AssetDigestMismatchCode,
			"the uploaded bytes do not hash to the sha256 this asset records")
	}
	return u.refused
}

func (u *uploadCheck) refusal() *assetRefusal { return u.refused }

func (u *uploadCheck) refuse(code, message string) {
	u.settled = true
	if u.refused == nil {
		u.refused = &assetRefusal{code: code, message: message}
	}
}

func discardHalfObject(ctx context.Context, store objectStore, key string) {
	clean, cancel := context.WithTimeout(context.WithoutCancel(ctx), discardWindow)
	defer cancel()

	if err := store.Delete(clean, key); err != nil {
		observability.Step(clean, observability.ComponentData, "half written object left behind",
			"storage_key", key, "why", withoutSignedURLs(err).Error())
		return
	}
	observability.Step(clean, observability.ComponentData, "half written object discarded",
		"storage_key", key)
}

func holdOpenForUpload(w http.ResponseWriter) {
	until := nowUTC().Add(assetUploadWindow)
	control := http.NewResponseController(w)
	_ = control.SetReadDeadline(until)
	_ = control.SetWriteDeadline(until)
}

func (s *Server) uploadAssetContent(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), assetUploadWindow)
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
		authorization.LibraryCreate, authorization.LibraryWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := scopedAsset(client, id, viewer, decision).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}

	switch row.Status {
	case entasset.StatusReady:
		writeAssetRefusal(w, http.StatusConflict, AssetAlreadyUploadedCode,
			"this asset already carries its bytes; create a new asset rather than overwriting one")
		return
	case entasset.StatusDeleted:
		writeAssetRefusal(w, http.StatusConflict, AssetDeletedCode,
			"a deleted asset cannot be uploaded to")
		return
	}

	if row.SizeBytes > MaxAssetBytes {
		writeAssetRefusal(w, http.StatusUnprocessableEntity, AssetTooLargeCode,
			assetTooLarge(row.SizeBytes))
		return
	}

	if r.ContentLength >= 0 && r.ContentLength != row.SizeBytes {
		writeAssetRefusal(w, http.StatusUnprocessableEntity, AssetSizeMismatchCode, fmt.Sprintf(
			"the body declares %d bytes but this asset records %d", r.ContentLength, row.SizeBytes))
		return
	}

	store, ok := s.objectStore(ctx, w)
	if !ok {
		return
	}
	holdOpenForUpload(w)

	body := newUploadCheck(r.Body, row.SizeBytes, row.Sha256)
	putErr := store.Put(ctx, blob.PutStream{
		Key:           row.StorageKey,
		ContentType:   row.MimeType,
		ContentLength: row.SizeBytes,
		SHA256Hex:     row.Sha256,
		Body:          body,
	})
	if putErr != nil {
		refusal := body.refusal()
		discardHalfObject(ctx, store, row.StorageKey)
		if refusal == nil {
			writeObjectStoreErr(w, putErr)
			return
		}
		writeAssetRefusal(w, http.StatusUnprocessableEntity, refusal.code, refusal.message)
		return
	}
	if refusal := body.settle(); refusal != nil {
		discardHalfObject(ctx, store, row.StorageKey)
		writeAssetRefusal(w, http.StatusUnprocessableEntity, refusal.code, refusal.message)
		return
	}

	n, err := client.Asset.Update().
		Where(entasset.ID(id), entasset.StatusEQ(entasset.StatusPending),
			assetsVisibleTo(viewer, decision)).
		SetStatus(entasset.StatusReady).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}
	if n == 0 {
		writeAssetRefusal(w, http.StatusConflict, AssetAlreadyUploadedCode,
			"another upload claimed this asset while these bytes were still in flight")
		return
	}

	ready, err := client.Asset.Query().Where(entasset.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}
	observability.Step(ctx, observability.ComponentData, "asset content uploaded",
		"asset_id", id, "storage_key", row.StorageKey, "size_bytes", row.SizeBytes)

	response.JSON(w, http.StatusOK, ready)
}

func (s *Server) markAssetReady(w http.ResponseWriter, r *http.Request) {
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
		authorization.LibraryCreate, authorization.LibraryWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := scopedAsset(client, id, viewer, decision).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}

	switch row.Status {
	case entasset.StatusReady:
		response.JSON(w, http.StatusOK, row)
		return
	case entasset.StatusDeleted:
		writeAssetRefusal(w, http.StatusConflict, AssetDeletedCode,
			"a deleted asset cannot be made ready again")
		return
	}

	store, ok := s.objectStore(ctx, w)
	if !ok {
		return
	}
	object, err := store.Head(ctx, row.StorageKey)
	if err != nil {
		writeObjectStoreErr(w, err)
		return
	}
	if !object.Exists {
		writeAssetRefusal(w, http.StatusConflict, AssetObjectMissingCode,
			"nothing has been uploaded for this asset yet")
		return
	}
	if object.ContentLength != row.SizeBytes {
		writeAssetRefusal(w, http.StatusConflict, AssetSizeMismatchCode, fmt.Sprintf(
			"the uploaded object is %d bytes but the asset records %d",
			object.ContentLength, row.SizeBytes))
		return
	}
	if object.SHA256Hex == "" {
		writeAssetRefusal(w, http.StatusServiceUnavailable, AssetDigestUnavailableCode,
			"the object store reported no sha256 for this object, so the bytes cannot be "+
				"verified; an operator must enable sha256 checksums on the bucket")
		return
	}
	if !strings.EqualFold(object.SHA256Hex, row.Sha256) {
		writeAssetRefusal(w, http.StatusConflict, AssetDigestMismatchCode,
			"the uploaded object does not carry the sha256 the asset records")
		return
	}

	n, err := client.Asset.Update().
		Where(entasset.ID(id), assetsVisibleTo(viewer, decision)).
		SetStatus(entasset.StatusReady).
		Save(ctx)
	if !wroteScopedRow(w, n, err, "asset not found") {
		return
	}

	ready, err := client.Asset.Query().Where(entasset.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}
	observability.Step(ctx, observability.ComponentData, "asset marked ready",
		"asset_id", id, "storage_key", row.StorageKey, "size_bytes", object.ContentLength)

	response.JSON(w, http.StatusOK, ready)
}

func (s *Server) deleteAsset(w http.ResponseWriter, r *http.Request) {
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
		authorization.LibraryDelete, authorization.LibraryDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"deleting an asset requires "+string(authorization.LibraryDelete))
		return
	}

	row, err := deletableAsset(client, id, viewer, decision).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}
	if row.Status == entasset.StatusDeleted {
		response.NoContent(w)
		return
	}

	n, err := client.Asset.Update().
		Where(entasset.ID(id), assetsDeletableBy(viewer, decision)).
		SetStatus(entasset.StatusDeleted).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, "asset not found")
		return
	}
	observability.Step(ctx, observability.ComponentData, "asset deleted",
		"asset_id", id, "storage_key", row.StorageKey, "was", string(row.Status))

	response.NoContent(w)
}

func (s *Server) getAssetLink(w http.ResponseWriter, r *http.Request) {
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
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := scopedAsset(client, id, viewer, decision).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}
	if row.Status != entasset.StatusReady {
		response.Error(w, http.StatusConflict, unreadableAsset(row.Status))
		return
	}

	store, ok := s.objectStore(ctx, w)
	if !ok {
		return
	}
	link, err := store.PresignGet(ctx, row.StorageKey, downloadLinkTTL)
	if err != nil {
		writeObjectStoreErr(w, err)
		return
	}
	traceObjectGrant(ctx, "download link issued", row.ID, row.StorageKey, downloadLinkTTL)

	response.JSON(w, http.StatusOK, response.Envelope{
		"asset_id":            row.ID,
		"download_url":        link,
		"download_expires_at": nowUTC().Add(downloadLinkTTL),
	})
}

func unreadableAsset(status entasset.Status) string {
	if status == entasset.StatusDeleted {
		return "this asset has been deleted"
	}
	return "this asset has no uploaded object yet"
}
