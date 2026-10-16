package timetablegen

import (
	"context"
	"errors"
	"log/slog"
	"sync"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
)

var ErrDispatcherClosed = errors.New("timetablegen: the generator is shutting down")

var ErrQueueFull = errors.New("timetablegen: every solver slot and the queue behind it are full")

const defaultQueueDepth = 16

type work struct {
	client *tenantent.Client
	jobID  uuid.UUID
}

type Dispatcher struct {
	runner *Runner
	logger *slog.Logger

	queue    chan work
	wg       sync.WaitGroup
	inflight sync.WaitGroup

	ctx    context.Context
	cancel context.CancelFunc
	once   sync.Once
}

func NewDispatcher(runner *Runner, workers, depth int, logger *slog.Logger) *Dispatcher {
	if workers < 1 {
		workers = 1
	}
	if depth < 1 {
		depth = defaultQueueDepth
	}
	if logger == nil {
		logger = slog.Default()
	}
	ctx, cancel := context.WithCancel(context.Background())

	d := &Dispatcher{
		runner: runner,
		logger: logger.With("component", Component),
		queue:  make(chan work, depth),
		ctx:    ctx,
		cancel: cancel,
	}
	d.wg.Add(workers)
	for i := 0; i < workers; i++ {
		go d.work()
	}
	return d
}

func DispatcherFor(cfg *config.Config, logger *slog.Logger) *Dispatcher {
	if logger == nil {
		logger = slog.Default()
	}
	if cfg == nil || !cfg.TimetableGenerating() {
		return nil
	}
	client, err := NewClient(ClientConfig{
		BaseURL: cfg.TimetableSolverBaseURL,
		Token:   cfg.TimetableSolverToken,
		Timeout: cfg.TimetableSolverTimeout,
	})
	if err != nil {
		logger.Error("timetable generation unavailable; POST /timetables/{id}/generate will "+
			"refuse and a week can still be arranged by hand", "error", err)
		return nil
	}
	runner, err := NewRunner(client, logger)
	if err != nil {
		logger.Error("timetable generation unavailable; POST /timetables/{id}/generate will "+
			"refuse and a week can still be arranged by hand", "error", err)
		return nil
	}
	logger.Info("timetable generation enabled",
		"solver", client.String(),
		"workers", cfg.TimetableSolverWorkers,
		"queue", cfg.TimetableSolverQueue,
		"max_seconds", cfg.TimetableSolverMaxSeconds)
	return NewDispatcher(runner, cfg.TimetableSolverWorkers, cfg.TimetableSolverQueue, logger)
}

func (d *Dispatcher) Submit(client *tenantent.Client, jobID uuid.UUID) error {
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
	case d.queue <- work{client: client, jobID: jobID}:
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

func (d *Dispatcher) run(next work) {
	defer d.inflight.Done()

	if err := d.runner.Execute(d.ctx, next.client, next.jobID); err != nil {
		d.logger.Error("a timetable generation could not be carried out",
			"job", next.jobID, "error", err)
	}
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
