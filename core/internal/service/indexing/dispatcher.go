package indexing

import (
	"context"
	"errors"
	"log/slog"
	"sync"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
)

var ErrDispatcherClosed = errors.New("indexing: the dispatcher is shutting down")

var ErrQueueFull = errors.New("indexing: the indexing queue is full")

const defaultQueueDepth = 64

type job struct {
	client *tenantent.Client
	req    Request
}

type Dispatcher struct {
	indexer *Indexer
	logger  *slog.Logger

	queue    chan job
	wg       sync.WaitGroup
	inflight sync.WaitGroup

	ctx    context.Context
	cancel context.CancelFunc
	once   sync.Once
}

func NewDispatcher(indexer *Indexer, workers int, logger *slog.Logger) *Dispatcher {
	if workers < 1 {
		workers = 1
	}
	if logger == nil {
		logger = slog.Default()
	}
	ctx, cancel := context.WithCancel(context.Background())

	d := &Dispatcher{
		indexer: indexer,
		logger:  logger,
		queue:   make(chan job, defaultQueueDepth),
		ctx:     ctx,
		cancel:  cancel,
	}
	d.wg.Add(workers)
	for i := 0; i < workers; i++ {
		go d.work()
	}
	return d
}

func (d *Dispatcher) Submit(client *tenantent.Client, req Request) error {
	if d == nil {
		return ErrDispatcherClosed
	}
	select {
	case <-d.ctx.Done():
		return ErrDispatcherClosed
	default:
	}

	d.inflight.Add(1)
	select {
	case d.queue <- job{client: client, req: req}:
		return nil
	default:
		d.inflight.Done()
		return ErrQueueFull
	}
}

func (d *Dispatcher) work() {
	defer d.wg.Done()
	for {
		select {
		case <-d.ctx.Done():
			return
		case next, open := <-d.queue:
			if !open {
				return
			}
			d.run(next)
		}
	}
}

func (d *Dispatcher) run(next job) {
	defer d.inflight.Done()

	out, err := d.indexer.Index(d.ctx, next.client, next.req)
	if err != nil {
		d.logger.Error("retrieval indexing failed",
			"content_item", next.req.ItemID,
			"tenant", next.req.Tenant,
			"job", out.JobID,
			"error", err)
		return
	}
	d.logger.Info("retrieval indexing settled",
		"content_item", next.req.ItemID,
		"tenant", next.req.Tenant,
		"job", out.JobID,
		"job_status", out.JobStatus,
		"index_status", string(out.Status),
		"document", out.DocumentID,
		"held_document", out.HeldDocumentID)
}

func (d *Dispatcher) Close() {
	if d == nil {
		return
	}
	d.once.Do(func() {
		close(d.queue)
		d.wg.Wait()
		d.cancel()
	})
}

func (d *Dispatcher) Drain() {
	if d == nil {
		return
	}
	d.inflight.Wait()
}

func Abandon(ctx context.Context, client *tenantent.Client, id uuid.UUID, logger *slog.Logger) {
	err := client.ContentItem.UpdateOneID(id).
		SetIndexStatus(entcontentitem.IndexStatusFailed).
		ClearHeldEngineDocumentID().
		Exec(ctx)
	if err != nil && logger != nil {
		logger.Error("could not mark a content item unindexed", "content_item", id, "error", err)
	}
}
