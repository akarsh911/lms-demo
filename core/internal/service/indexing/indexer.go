package indexing

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	"github.com/Harbour-Emerge/emerge-core/internal/retrieval"
)

var (
	ErrNoAsset = errors.New("indexing: the content item carries no asset, so there are no bytes to index")

	ErrAssetUnreadable = errors.New("indexing: the asset object could not be read")

	ErrPollTimeout = errors.New("indexing: the ingest job did not finish in time")

	ErrDeferredNotPDF = errors.New("indexing: a held upload is only defined for a PDF")

	ErrDeferredPlacements = errors.New("indexing: a held upload cannot carry its confirmed chapter placements")
)

type SignedSource interface {
	PresignGet(ctx context.Context, key string, expires time.Duration) (string, error)
}

type Engine interface {
	IngestFile(ctx context.Context, in FileIngest) (*Job, error)
	Job(ctx context.Context, tenant, jobID string) (*Job, error)
}

type Options struct {
	PollInterval time.Duration
	PollTimeout  time.Duration
	FetchTimeout time.Duration
}

const (
	defaultPollInterval = 2 * time.Second
	defaultPollTimeout  = 15 * time.Minute
	defaultFetchTimeout = 10 * time.Minute
	downloadTTL         = 15 * time.Minute
)

func (o Options) withDefaults() Options {
	if o.PollInterval <= 0 {
		o.PollInterval = defaultPollInterval
	}
	if o.PollTimeout <= 0 {
		o.PollTimeout = defaultPollTimeout
	}
	if o.FetchTimeout <= 0 {
		o.FetchTimeout = defaultFetchTimeout
	}
	return o
}

type Indexer struct {
	engine Engine
	opts   Options
	fetch  *http.Client
}

func NewIndexer(engine Engine, opts Options) (*Indexer, error) {
	if engine == nil {
		return nil, errors.New("indexing: an engine client is required")
	}
	resolved := opts.withDefaults()
	return &Indexer{
		engine: engine,
		opts:   resolved,
		fetch:  &http.Client{Timeout: resolved.FetchTimeout},
	}, nil
}

type Request struct {
	Tenant   string
	SchoolID uuid.UUID
	ItemID   uuid.UUID
	Store    SignedSource
}

type Outcome struct {
	Status         entcontentitem.IndexStatus
	DocumentID     string
	HeldDocumentID string
	Sha256         string
	JobID          string
	JobStatus      string
	Reason         string
}

func LabelsForItem(item *tenantent.ContentItem, schoolID uuid.UUID) ([]string, error) {
	return retrieval.LabelsFor(retrieval.Item{
		SchoolID:          schoolID,
		Audience:          item.Audience,
		Status:            item.Status,
		GradeLevelID:      item.GradeLevelID,
		SectionID:         item.SectionID,
		SubjectOfferingID: item.SubjectOfferingID,
		OwnerPersonID:     item.OwnerPersonID,
	})
}

func (ix *Indexer) Index(ctx context.Context, client *tenantent.Client, req Request) (Outcome, error) {
	outcome, err := ix.attempt(ctx, client, req)
	if err != nil {
		if recordErr := ix.markFailed(ctx, client, req.ItemID); recordErr != nil {
			return outcome, errors.Join(err, recordErr)
		}
		return outcome, err
	}
	if err := ix.record(ctx, client, req.ItemID, outcome); err != nil {
		return outcome, err
	}
	return outcome, nil
}

func (ix *Indexer) attempt(ctx context.Context, client *tenantent.Client, req Request) (Outcome, error) {
	item, err := client.ContentItem.Query().
		Where(entcontentitem.ID(req.ItemID)).
		WithAsset().
		Only(ctx)
	if err != nil {
		return Outcome{}, err
	}

	labels, err := LabelsForItem(item, req.SchoolID)
	if err != nil {
		return Outcome{}, err
	}

	asset := item.Edges.Asset
	if asset == nil {
		return Outcome{}, ErrNoAsset
	}
	if asset.Status != "ready" {
		return Outcome{}, fmt.Errorf("%w: the asset is %s, not ready", ErrAssetUnreadable, asset.Status)
	}

	nodes, err := confirmedNodesForItem(ctx, client, req.ItemID)
	if err != nil {
		return Outcome{}, err
	}

	mode := ResolvedMode(string(item.IngestMode))
	if err := checkDeferrable(mode, asset.FileName, nodes); err != nil {
		return Outcome{}, err
	}

	return ix.push(ctx, req, item, asset, labels, nodes, mode)
}

func checkDeferrable(mode, filename string, nodes []string) error {
	if mode != ModeDefer {
		return nil
	}
	if !IsPDF(filename) {
		return fmt.Errorf("%w: %s is not one", ErrDeferredNotPDF, filename)
	}
	if len(nodes) > 0 {
		return fmt.Errorf("%w: %d confirmed placements would be dropped", ErrDeferredPlacements, len(nodes))
	}
	return nil
}

func confirmedNodesForItem(ctx context.Context, client *tenantent.Client,
	itemID uuid.UUID) ([]string, error) {

	rows, err := client.ContentPlacement.Query().
		Where(
			entplacement.ContentItemID(itemID),
			entplacement.StatusEQ(entplacement.StatusConfirmed),
			entplacement.CurriculumNodeIDNotNil(),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	nodes := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.CurriculumNodeID == nil {
			continue
		}
		nodes = append(nodes, row.CurriculumNodeID.String())
	}
	return nodes, nil
}

func (ix *Indexer) push(ctx context.Context, req Request, item *tenantent.ContentItem,
	asset *tenantent.Asset, labels, nodes []string, mode string) (Outcome, error) {

	body, err := ix.open(ctx, req.Store, asset.StorageKey)
	if err != nil {
		return Outcome{}, err
	}
	defer body.Close()

	job, err := ix.engine.IngestFile(ctx, FileIngest{
		Tenant:            req.Tenant,
		Filename:          asset.FileName,
		Title:             item.Title,
		SourceType:        sourceTypeFor(item.Kind),
		Mode:              mode,
		RestrictedTo:      labels,
		CurriculumNodeIDs: nodes,
		ContentType:       asset.MimeType,
		Body:              body,
	})
	if err != nil {
		return Outcome{}, err
	}

	final, err := ix.await(ctx, req.Tenant, job)
	if err != nil {
		return Outcome{JobID: job.Identifier()}, err
	}
	return outcomeOf(final, asset.Sha256), nil
}

func (ix *Indexer) open(ctx context.Context, store SignedSource, key string) (io.ReadCloser, error) {
	if store == nil {
		return nil, fmt.Errorf("%w: no object store is configured for this school", ErrAssetUnreadable)
	}
	signed, err := store.PresignGet(ctx, key, downloadTTL)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrAssetUnreadable, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, signed, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrAssetUnreadable, err)
	}
	resp, err := ix.fetch.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrAssetUnreadable, withoutSignedURL(err, signed))
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		resp.Body.Close()
		return nil, fmt.Errorf("%w: the object store returned %d", ErrAssetUnreadable, resp.StatusCode)
	}
	return resp.Body, nil
}

func (ix *Indexer) await(ctx context.Context, tenant string, job *Job) (*Job, error) {
	if Terminal(job.Status) {
		return job, nil
	}

	deadline := time.Now().Add(ix.opts.PollTimeout)
	ticker := time.NewTicker(ix.opts.PollInterval)
	defer ticker.Stop()

	id := job.Identifier()
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}

		latest, err := ix.engine.Job(ctx, tenant, id)
		if err != nil {
			return nil, err
		}
		if Terminal(latest.Status) {
			return latest, nil
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("%w: job %s is still %q after %s",
				ErrPollTimeout, id, latest.Status, ix.opts.PollTimeout)
		}
	}
}

func outcomeOf(job *Job, digest string) Outcome {
	out := Outcome{
		JobID:      job.Identifier(),
		JobStatus:  job.Status,
		DocumentID: job.DocumentID(),
		Sha256:     digest,
	}
	switch job.Status {
	case StatusIndexed:
		out.Status = entcontentitem.IndexStatusIndexed
	case StatusDuplicate:
		if job.CollisionState() == StatusHeld {
			out = heldOutcome(out, "the engine is already holding these exact bytes for the "+
				"chapter-shaped pipeline; no document exists until that run completes")
			break
		}
		out.Status = entcontentitem.IndexStatusIndexed
		out.Reason = "the engine already holds these exact bytes under this document id"
	case StatusPendingConfirmation:
		out.Status = entcontentitem.IndexStatusParked
		out.DocumentID = ""
		out.Reason = "the engine parked this upload for chapter confirmation; nothing is retrievable yet"
	case StatusHeld:
		out = heldOutcome(out, "the engine is holding these bytes for the chapter-shaped "+
			"pipeline; no document exists until that run completes")
	default:
		out.Status = entcontentitem.IndexStatusFailed
		out.DocumentID = ""
		out.Reason = job.Error
	}
	if out.Status == entcontentitem.IndexStatusIndexed && out.DocumentID == "" {
		out.Status = entcontentitem.IndexStatusFailed
		out.Reason = "the engine reported success but named no document id"
	}
	if out.Status == entcontentitem.IndexStatusIndexed && nothingRetrievable(job) {
		out.Status = entcontentitem.IndexStatusFailed
		out.DocumentID = ""
		out.Reason = emptyIndexReason(job)
	}
	return out
}

func heldOutcome(out Outcome, reason string) Outcome {
	out.Status = entcontentitem.IndexStatusHeld
	out.HeldDocumentID = out.DocumentID
	out.DocumentID = ""
	out.Reason = reason
	return out
}

func nothingRetrievable(job *Job) bool {
	chunks, counted := job.Chunks()
	return counted && chunks == 0
}

func emptyIndexReason(job *Job) string {
	if blocks, counted := job.Blocks(); counted && blocks > 0 {
		return fmt.Sprintf("the engine found %d blocks of layout in this file but could read no text "+
			"out of them, so it indexed nothing and no search will ever match this item; it needs a "+
			"copy whose text is selectable, or an OCR pass over this one", blocks)
	}
	return "the engine read no text at all out of this file, so it indexed nothing and no search will " +
		"ever match this item; it is most likely a scan or an image-only PDF and needs a text layer " +
		"before it can be indexed"
}

func (ix *Indexer) record(ctx context.Context, client *tenantent.Client,
	id uuid.UUID, out Outcome) error {

	update := client.ContentItem.UpdateOneID(id).SetIndexStatus(out.Status)
	switch out.Status {
	case entcontentitem.IndexStatusIndexed:
		update = update.
			SetEngineDocumentID(out.DocumentID).
			SetIndexedSha256(out.Sha256).
			SetIndexedAt(time.Now().UTC()).
			SetIndexAttempts(0).
			ClearHeldEngineDocumentID()
	case entcontentitem.IndexStatusFailed, entcontentitem.IndexStatusParked:
		update = update.ClearEngineDocumentID().ClearIndexedSha256().ClearIndexedAt().
			ClearHeldEngineDocumentID()
	case entcontentitem.IndexStatusHeld:
		update = update.ClearEngineDocumentID().ClearIndexedSha256().ClearIndexedAt()
		if out.HeldDocumentID == "" {
			update = update.ClearHeldEngineDocumentID()
		} else {
			update = update.SetHeldEngineDocumentID(out.HeldDocumentID)
		}
	default:
		update = update.ClearHeldEngineDocumentID()
	}
	return update.Exec(ctx)
}

func (ix *Indexer) markFailed(ctx context.Context, client *tenantent.Client, id uuid.UUID) error {
	return client.ContentItem.UpdateOneID(id).
		SetIndexStatus(entcontentitem.IndexStatusFailed).
		ClearEngineDocumentID().
		ClearIndexedSha256().
		ClearIndexedAt().
		ClearHeldEngineDocumentID().
		Exec(ctx)
}

func MarkPending(ctx context.Context, client *tenantent.Client, id uuid.UUID) error {
	return client.ContentItem.UpdateOneID(id).
		SetIndexStatus(entcontentitem.IndexStatusPending).
		ClearHeldEngineDocumentID().
		Exec(ctx)
}

func sourceTypeFor(kind entcontentitem.Kind) string {
	switch kind {
	case entcontentitem.KindBook:
		return "book"
	case entcontentitem.KindNote:
		return "notes"
	case entcontentitem.KindPaper:
		return "pyq"
	}
	return ""
}

func withoutSignedURL(err error, signed string) error {
	if err == nil {
		return nil
	}
	text := err.Error()
	if signed == "" || !strings.Contains(text, signed) {
		return err
	}
	return errors.New(strings.ReplaceAll(text, signed, "[signed url]"))
}
