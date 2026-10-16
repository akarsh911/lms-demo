package indexing

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
)

const heldRecoveryLimit = 256

type HeldEngine interface {
	PublishedDocument(ctx context.Context, tenant, documentID string) (*PublishedDocument, error)
	HeldUploads(ctx context.Context, tenant string) ([]HeldUpload, error)
}

func (s *Sweeper) heldChecks() int {
	if s.held == nil {
		return 0
	}
	return s.opts.Batch
}

func (s *Sweeper) reconcile(ctx context.Context, tenant Tenant, now time.Time,
	limit int, report *SweepReport) (int, error) {

	if s.held == nil || limit <= 0 {
		return 0, nil
	}

	if err := s.recoverPromised(ctx, tenant, now, report); err != nil {
		return 0, err
	}

	rows, err := s.heldDue(ctx, tenant, limit)
	if err != nil {
		return 0, fmt.Errorf("indexing: scanning %s for held items: %w", tenant.Code, err)
	}

	checked := 0
	for _, row := range rows {
		if ctx.Err() != nil {
			return checked, nil
		}
		checked++
		report.Held++

		promoted, err := s.settleHeld(ctx, tenant, row, now)
		if err != nil {
			return checked, err
		}
		if promoted {
			report.Promoted++
		}
	}

	s.advanceHeld(tenant.SchoolID, rows, limit)
	return checked, nil
}

func (s *Sweeper) settleHeld(ctx context.Context, tenant Tenant,
	row *tenantent.ContentItem, now time.Time) (bool, error) {

	promised := promisedID(row)
	asset := row.Edges.Asset
	if promised == "" || asset == nil {
		return false, nil
	}

	published, err := s.held.PublishedDocument(ctx, tenant.CASTenantID, promised)
	switch {
	case errors.Is(err, ErrDocumentUnpublished):
		return false, nil
	case errors.Is(err, ErrEngineUnreachable):
		return false, err
	case err != nil:
		s.heldProblem(row.ID, now, "the engine would not say whether a held library item is published; "+
			"nothing was changed", tenant, promised, "error", err.Error())
		return false, nil
	}

	if published.NothingRetrievable() {
		s.heldProblem(row.ID, now, "the engine published a held library item with nothing retrievable in "+
			"it, so it stays held; it needs rebuilding on the engine", tenant, promised)
		return false, nil
	}

	promoted, err := s.promote(ctx, tenant, row, promised, asset.Sha256, now)
	if err != nil {
		return false, err
	}
	if promoted {
		s.logger.Info("a held library item was published by the engine and is now indexed",
			"school", tenant.Code,
			"school_id", tenant.SchoolID,
			"content_item", row.ID,
			"document", promised,
			"idle_for_ms", now.Sub(row.UpdatedAt).Milliseconds())
	}
	return promoted, nil
}

func (s *Sweeper) promote(ctx context.Context, tenant Tenant, row *tenantent.ContentItem,
	promised, digest string, now time.Time) (bool, error) {

	n, err := tenant.Client.ContentItem.Update().
		Where(
			entcontentitem.ID(row.ID),
			entcontentitem.StatusEQ(entcontentitem.StatusPublished),
			entcontentitem.IndexStatusEQ(entcontentitem.IndexStatusHeld),
			entcontentitem.HeldEngineDocumentID(promised),
			entcontentitem.UpdatedAt(row.UpdatedAt),
		).
		SetIndexStatus(entcontentitem.IndexStatusIndexed).
		SetEngineDocumentID(promised).
		SetIndexedSha256(digest).
		SetIndexedAt(now).
		SetIndexAttempts(0).
		ClearHeldEngineDocumentID().
		SetUpdatedAt(now).
		Save(ctx)
	if err != nil {
		return false, fmt.Errorf("indexing: promoting %s in %s: %w", row.ID, tenant.Code, err)
	}
	return n == 1, nil
}

func (s *Sweeper) heldDue(ctx context.Context, tenant Tenant, limit int) ([]*tenantent.ContentItem, error) {
	after := s.heldAfter(tenant.SchoolID)

	rows, err := heldPage(ctx, tenant, after, uuid.Nil, limit)
	if err != nil || after == uuid.Nil || len(rows) == limit {
		return rows, err
	}

	wrapped, err := heldPage(ctx, tenant, uuid.Nil, after, limit-len(rows))
	if err != nil {
		return nil, err
	}
	return append(rows, wrapped...), nil
}

func heldPage(ctx context.Context, tenant Tenant, after, through uuid.UUID,
	limit int) ([]*tenantent.ContentItem, error) {

	query := tenant.Client.ContentItem.Query().
		Where(
			entcontentitem.StatusEQ(entcontentitem.StatusPublished),
			entcontentitem.AssetIDNotNil(),
			entcontentitem.IndexStatusEQ(entcontentitem.IndexStatusHeld),
			entcontentitem.HeldEngineDocumentIDNotNil(),
		)
	if after != uuid.Nil {
		query = query.Where(entcontentitem.IDGT(after))
	}
	if through != uuid.Nil {
		query = query.Where(entcontentitem.IDLTE(through))
	}
	return query.
		WithAsset().
		Order(tenantent.Asc(entcontentitem.FieldID)).
		Limit(limit).
		All(ctx)
}

func (s *Sweeper) heldAfter(school uuid.UUID) uuid.UUID {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.heldCursor[school]
}

func (s *Sweeper) advanceHeld(school uuid.UUID, rows []*tenantent.ContentItem, limit int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(rows) < limit {
		delete(s.heldCursor, school)
		return
	}
	s.heldCursor[school] = rows[len(rows)-1].ID
}

func (s *Sweeper) recoverPromised(ctx context.Context, tenant Tenant, now time.Time,
	report *SweepReport) error {

	if !s.recoveryDue(tenant.SchoolID, now) {
		return nil
	}

	rows, err := tenant.Client.ContentItem.Query().
		Where(
			entcontentitem.StatusEQ(entcontentitem.StatusPublished),
			entcontentitem.AssetIDNotNil(),
			entcontentitem.IndexStatusEQ(entcontentitem.IndexStatusHeld),
			entcontentitem.HeldEngineDocumentIDIsNil(),
		).
		WithAsset().
		Order(tenantent.Asc(entcontentitem.FieldID)).
		Limit(heldRecoveryLimit).
		All(ctx)
	if err != nil {
		return fmt.Errorf("indexing: scanning %s for held items with no promised document: %w",
			tenant.Code, err)
	}
	if len(rows) == 0 {
		s.recoveryAsked(tenant.SchoolID, now)
		return nil
	}

	uploads, err := s.held.HeldUploads(ctx, tenant.CASTenantID)
	if errors.Is(err, ErrEngineUnreachable) {
		return err
	}
	s.recoveryAsked(tenant.SchoolID, now)
	if err != nil {
		s.logger.Warn("the engine would not list what it is holding, so held library items that "+
			"predate the promised document id stay unreconciled",
			"school", tenant.Code, "error", err.Error())
		return nil
	}

	promisedBy := make(map[string]string, len(uploads))
	for _, upload := range uploads {
		promisedBy[strings.ToLower(upload.Checksum)] = upload.DocumentID
	}

	for _, row := range rows {
		asset := row.Edges.Asset
		if asset == nil {
			continue
		}
		promised, held := promisedBy[strings.ToLower(asset.Sha256)]
		if !held {
			continue
		}
		recovered, err := s.rememberPromised(ctx, tenant, row, promised)
		if err != nil {
			return err
		}
		if recovered {
			report.Recovered++
			s.logger.Info("recovered the document id the engine promised a held library item",
				"school", tenant.Code,
				"school_id", tenant.SchoolID,
				"content_item", row.ID,
				"document", promised)
		}
	}
	return nil
}

func (s *Sweeper) rememberPromised(ctx context.Context, tenant Tenant,
	row *tenantent.ContentItem, promised string) (bool, error) {

	n, err := tenant.Client.ContentItem.Update().
		Where(
			entcontentitem.ID(row.ID),
			entcontentitem.IndexStatusEQ(entcontentitem.IndexStatusHeld),
			entcontentitem.HeldEngineDocumentIDIsNil(),
		).
		SetHeldEngineDocumentID(promised).
		Save(ctx)
	if err != nil {
		return false, fmt.Errorf("indexing: recording the promised document of %s in %s: %w",
			row.ID, tenant.Code, err)
	}
	return n == 1, nil
}

func (s *Sweeper) recoveryDue(school uuid.UUID, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	last, asked := s.heldRecovery[school]
	return !asked || now.Sub(last) >= sweepHeartbeatEvery
}

func (s *Sweeper) recoveryAsked(school uuid.UUID, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.heldRecovery[school] = now
}

func (s *Sweeper) heldProblem(item uuid.UUID, now time.Time, message string,
	tenant Tenant, promised string, extra ...any) {

	args := append([]any{
		"school", tenant.Code,
		"school_id", tenant.SchoolID,
		"content_item", item,
		"document", promised,
	}, extra...)

	if s.remind(item, now) {
		s.logger.Warn(message, args...)
		return
	}
	s.logger.Debug(message, args...)
}

func (s *Sweeper) remind(item uuid.UUID, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if last, said := s.heldReminded[item]; said && now.Sub(last) < sweepHeartbeatEvery {
		return false
	}
	s.heldReminded[item] = now
	return true
}

func promisedID(row *tenantent.ContentItem) string {
	if row == nil || row.HeldEngineDocumentID == nil {
		return ""
	}
	return *row.HeldEngineDocumentID
}
