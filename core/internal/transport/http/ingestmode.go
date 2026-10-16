package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const deferredPlacementRefusal = "a held upload stores the bytes and mints its document later, from a " +
	"bundle built elsewhere, so a confirmed curriculum placement cannot travel with it. Either ingest " +
	"this item now, or confirm the placement after the held upload has completed"

func libraryIngestMode(w http.ResponseWriter, raw *string) (entcontentitem.IngestMode, bool) {
	mode := entcontentitem.IngestMode(*raw)
	if err := entcontentitem.IngestModeValidator(mode); err != nil {
		response.Error(w, http.StatusBadRequest, entcontentitem.FieldIngestMode+" must be now or defer")
		return "", false
	}
	return mode, true
}

func explicitIngestMode(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	raw *string, assetID *uuid.UUID) (entcontentitem.IngestMode, bool) {

	mode, ok := libraryIngestMode(w, raw)
	if !ok {
		return "", false
	}
	if !checkDeferrableAsset(ctx, w, client, mode, assetID) {
		return "", false
	}
	return mode, true
}

func assetFileName(ctx context.Context, client *tenantent.Client, assetID uuid.UUID) (string, error) {
	return client.Asset.Query().Where(entasset.ID(assetID)).
		Select(entasset.FieldFileName).String(ctx)
}

func inferredIngestMode(ctx context.Context, client *tenantent.Client,
	assetID *uuid.UUID) entcontentitem.IngestMode {

	if assetID == nil {
		return entcontentitem.IngestModeNow
	}
	name, err := assetFileName(ctx, client, *assetID)
	if err != nil || !indexing.IsPDF(name) {
		return entcontentitem.IngestModeNow
	}
	return entcontentitem.IngestModeDefer
}

func checkDeferrableAsset(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	mode entcontentitem.IngestMode, assetID *uuid.UUID) bool {

	if mode != entcontentitem.IngestModeDefer {
		return true
	}
	if assetID == nil {
		response.Error(w, http.StatusUnprocessableEntity,
			entcontentitem.FieldIngestMode+"=defer holds an upload's bytes for a later run, and this "+
				"item names no asset, so there are no bytes to hold")
		return false
	}

	name, err := assetFileName(ctx, client, *assetID)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return false
	}
	if !indexing.IsPDF(name) {
		response.Error(w, http.StatusUnprocessableEntity,
			entcontentitem.FieldIngestMode+"=defer is only defined for a PDF, and this item's asset is "+
				name+". The pipeline a held upload waits for is chapter-shaped: it proposes a chapter "+
				"split, extracts topics per chapter and crops figures, and none of that exists for an "+
				"image or an A/V file. Ingest now instead, because OCR and transcription run immediately "+
				"anyway")
		return false
	}
	return true
}

func confirmedChapterPlacements(ctx context.Context, client *tenantent.Client,
	itemID uuid.UUID) (int, error) {

	return client.ContentPlacement.Query().
		Where(
			entplacement.ContentItemID(itemID),
			entplacement.StatusEQ(entplacement.StatusConfirmed),
			entplacement.CurriculumNodeIDNotNil(),
		).
		Count(ctx)
}

func checkDeferrablePlacements(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	mode entcontentitem.IngestMode, itemID uuid.UUID) bool {

	if mode != entcontentitem.IngestModeDefer {
		return true
	}

	placed, err := confirmedChapterPlacements(ctx, client, itemID)
	if err != nil {
		response.ServerError(w, err)
		return false
	}
	if placed > 0 {
		response.Error(w, http.StatusConflict,
			"this item is placed against a confirmed curriculum node, so it cannot move to "+
				entcontentitem.FieldIngestMode+"=defer: "+deferredPlacementRefusal)
		return false
	}
	return true
}

func checkConfirmableAgainstIngestMode(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, placement *tenantent.ContentPlacement) bool {

	if placement.CurriculumNodeID == nil {
		return true
	}

	deferred, err := client.ContentItem.Query().
		Where(
			entcontentitem.ID(placement.ContentItemID),
			entcontentitem.IngestModeEQ(entcontentitem.IngestModeDefer),
		).
		Exist(ctx)
	if err != nil {
		response.ServerError(w, err)
		return false
	}
	if deferred {
		response.Error(w, http.StatusConflict,
			"the content item this placement maps is "+entcontentitem.FieldIngestMode+
				"=defer, so this placement cannot be confirmed: "+deferredPlacementRefusal)
		return false
	}
	return true
}
