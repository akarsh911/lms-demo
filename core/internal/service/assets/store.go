package assets

import (
	"context"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
)

type EntRows struct {
	client *tenantent.Client
}

func NewEntRows(client *tenantent.Client) *EntRows {
	return &EntRows{client: client}
}

func (s *EntRows) candidates(ctx context.Context, where predicate.Asset, limit int) ([]*tenantent.Asset, error) {
	if limit <= 0 {
		return nil, nil
	}
	return s.client.Asset.Query().
		Where(where).
		Order(tenantent.Asc(asset.FieldCreatedAt)).
		Limit(limit).
		All(ctx)
}

func (s *EntRows) Sweepable(ctx context.Context, cutoff time.Time, limit int) ([]Row, error) {
	found, err := s.candidates(ctx,
		asset.And(asset.StatusEQ(asset.StatusPending), asset.CreatedAtLT(cutoff)), limit)
	if err != nil {
		return nil, err
	}
	retired, err := s.candidates(ctx,
		asset.And(asset.StatusEQ(asset.StatusDeleted), asset.UpdatedAtLT(cutoff)), limit-len(found))
	if err != nil {
		return nil, err
	}
	found = append(found, retired...)

	if len(found) == 0 {
		return nil, nil
	}

	ids := make([]uuid.UUID, 0, len(found))
	for _, row := range found {
		ids = append(ids, row.ID)
	}
	pinned, err := s.client.Asset.Query().
		Where(asset.IDIn(ids...), asset.HasContentItems()).
		IDs(ctx)
	if err != nil {
		return nil, err
	}
	referenced := make(map[uuid.UUID]bool, len(pinned))
	for _, id := range pinned {
		referenced[id] = true
	}

	out := make([]Row, 0, len(found))
	for _, row := range found {
		out = append(out, Row{
			ID:         row.ID,
			StorageKey: row.StorageKey,
			Status:     string(row.Status),
			CreatedAt:  row.CreatedAt,
			UpdatedAt:  row.UpdatedAt,
			Referenced: referenced[row.ID],
		})
	}
	return out, nil
}

func (s *EntRows) Retire(ctx context.Context, id uuid.UUID) error {
	return s.client.Asset.UpdateOneID(id).
		Where(asset.StatusEQ(asset.StatusPending)).
		SetStatus(asset.StatusDeleted).
		Exec(ctx)
}

type BlobObjects struct {
	client *blob.Client
}

func NewBlobObjects(client *blob.Client) *BlobObjects {
	return &BlobObjects{client: client}
}

func (o *BlobObjects) Head(ctx context.Context, key string) (bool, error) {
	info, err := o.client.Head(ctx, key)
	if err != nil {
		return false, err
	}
	return info.Exists, nil
}

func (o *BlobObjects) Delete(ctx context.Context, key string) error {
	return o.client.Delete(ctx, key)
}
