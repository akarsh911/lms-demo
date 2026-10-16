package indexing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
)

const ComponentSweep = "index-sweep"

const (
	DefaultSweepInterval   = 5 * time.Minute
	DefaultSweepPendingAge = 30 * time.Minute
	DefaultSweepRetryBase  = 5 * time.Minute
	DefaultSweepRetryCap   = 6 * time.Hour
	DefaultSweepBatch      = 32
	DefaultSweepPerTenant  = 8

	MinimumSweepInterval   = 10 * time.Second
	MinimumSweepPendingAge = 5 * time.Minute

	sweepHeartbeatEvery = time.Hour
)

type Tenant struct {
	SchoolID    uuid.UUID
	Code        string
	CASTenantID string
	Client      *tenantent.Client
	Store       SignedSource
}

type Tenants interface {
	Sweepable(ctx context.Context) ([]Tenant, error)
}

type Submitter interface {
	Submit(client *tenantent.Client, req Request) error
}

type SweepOptions struct {
	Interval    time.Duration
	PendingAge  time.Duration
	PollTimeout time.Duration
	RetryBase   time.Duration
	RetryCap    time.Duration
	Batch       int
	PerTenant   int
	Now         func() time.Time
}

func SweepFromConfig(cfg *config.Config) SweepOptions {
	return SweepOptions{
		Interval:    cfg.RetrievalSweepInterval,
		PendingAge:  cfg.RetrievalSweepPendingAge,
		PollTimeout: cfg.RetrievalIndexPollTimeout,
		RetryBase:   cfg.RetrievalSweepRetryBase,
		RetryCap:    cfg.RetrievalSweepRetryCap,
		Batch:       cfg.RetrievalSweepBatch,
		PerTenant:   cfg.RetrievalSweepPerTenant,
	}
}

func (o *SweepOptions) withDefaults() {
	if o.Interval <= 0 {
		o.Interval = DefaultSweepInterval
	}
	if o.Interval < MinimumSweepInterval {
		o.Interval = MinimumSweepInterval
	}
	if o.PendingAge <= 0 {
		o.PendingAge = DefaultSweepPendingAge
	}
	if o.PendingAge < MinimumSweepPendingAge {
		o.PendingAge = MinimumSweepPendingAge
	}
	if inFlight := 2 * o.PollTimeout; o.PendingAge < inFlight {
		o.PendingAge = inFlight
	}
	if o.RetryBase <= 0 {
		o.RetryBase = DefaultSweepRetryBase
	}
	if o.RetryCap <= 0 {
		o.RetryCap = DefaultSweepRetryCap
	}
	if o.RetryCap < o.RetryBase {
		o.RetryCap = o.RetryBase
	}
	if o.Batch <= 0 {
		o.Batch = DefaultSweepBatch
	}
	if o.PerTenant <= 0 {
		o.PerTenant = DefaultSweepPerTenant
	}
	if o.PerTenant > o.Batch {
		o.PerTenant = o.Batch
	}
	if o.Now == nil {
		o.Now = time.Now
	}
}

type SweepReport struct {
	At        time.Time
	Duration  time.Duration
	Tenants   int
	Scanned   int
	Claimed   int
	Deferred  int
	Released  int
	Held      int
	Promoted  int
	Recovered int
	Err       error
}

func (r SweepReport) Idle() bool {
	return r.Claimed == 0 && r.Released == 0 && r.Promoted == 0 && r.Recovered == 0
}

type SweepStats struct {
	Ticks      int64
	Scanned    int64
	Claimed    int64
	Deferred   int64
	Released   int64
	Held       int64
	Promoted   int64
	Recovered  int64
	Errors     int64
	Tracked    int
	LastTickAt time.Time
	LastWorkAt time.Time
}

type Sweeper struct {
	tenants Tenants
	queue   Submitter
	held    HeldEngine
	opts    SweepOptions
	logger  *slog.Logger

	mu           sync.Mutex
	attempts     map[uuid.UUID]time.Time
	heldCursor   map[uuid.UUID]uuid.UUID
	heldRecovery map[uuid.UUID]time.Time
	heldReminded map[uuid.UUID]time.Time
	stats        SweepStats
	heartbeat    time.Time
}

func NewSweeper(tenants Tenants, queue Submitter, opts SweepOptions, logger *slog.Logger) (*Sweeper, error) {
	if tenants == nil {
		return nil, errors.New("indexing: the sweeper needs a source of tenants")
	}
	if queue == nil {
		return nil, errors.New("indexing: the sweeper needs the dispatcher that already does the pushing")
	}
	opts.withDefaults()
	if logger == nil {
		logger = slog.Default()
	}
	return &Sweeper{
		tenants:      tenants,
		queue:        queue,
		opts:         opts,
		logger:       logger.With("component", ComponentSweep),
		attempts:     make(map[uuid.UUID]time.Time),
		heldCursor:   make(map[uuid.UUID]uuid.UUID),
		heldRecovery: make(map[uuid.UUID]time.Time),
		heldReminded: make(map[uuid.UUID]time.Time),
	}, nil
}

func SweeperFor(cfg *config.Config, tenants Tenants, queue Submitter, held HeldEngine,
	logger *slog.Logger) *Sweeper {

	if logger == nil {
		logger = slog.Default()
	}
	if cfg == nil || !cfg.RetrievalSweeping() {
		return nil
	}
	sweeper, err := NewSweeper(tenants, queue, SweepFromConfig(cfg), logger)
	if err != nil {
		logger.Error("index sweeper unavailable; a failed or orphaned library item stays out of "+
			"retrieval until someone republishes it", "error", err)
		return nil
	}
	if held == nil {
		logger.Warn("index sweeper has no engine to ask about held uploads; a library item the " +
			"engine is holding stays held after the engine publishes it")
	}
	sweeper.held = held
	return sweeper
}

func (s *Sweeper) Run(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.logger.Info("index sweeper started",
		"interval", s.opts.Interval.String(),
		"pending_age", s.opts.PendingAge.String(),
		"retry_base", s.opts.RetryBase.String(),
		"retry_cap", s.opts.RetryCap.String(),
		"batch", s.opts.Batch,
		"per_tenant", s.opts.PerTenant,
		"reconciles_held", s.held != nil)

	ticker := time.NewTicker(s.opts.Interval)
	defer ticker.Stop()

	for {
		s.Tick(ctx)
		select {
		case <-ctx.Done():
			s.logger.Info("index sweeper stopping", "reason", ctx.Err().Error())
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (s *Sweeper) Tick(ctx context.Context) SweepReport {
	if s == nil {
		return SweepReport{}
	}
	started := s.opts.Now()
	report := SweepReport{At: started}

	tenants, err := s.tenants.Sweepable(ctx)
	report.Tenants = len(tenants)
	if err != nil {
		report.Err = err
	}

	budget := s.opts.Batch
	checks := s.heldChecks()
	for _, tenant := range tenants {
		if (budget <= 0 && checks <= 0) || ctx.Err() != nil {
			break
		}

		checked, err := s.reconcile(ctx, tenant, started, min(checks, s.opts.PerTenant), &report)
		checks -= checked
		switch {
		case err == nil:
		case errors.Is(err, ErrEngineUnreachable):
			if ctx.Err() == nil {
				s.logger.Warn("held uploads were not reconciled this tick; nothing was changed",
					"school", tenant.Code, "reason", err.Error())
			}
			checks = 0
		default:
			if report.Err == nil {
				report.Err = err
			}
		}

		if budget <= 0 || ctx.Err() != nil {
			continue
		}
		take := min(budget, s.opts.PerTenant)

		claimed, err := s.sweep(ctx, tenant, started, take, &report)
		budget -= claimed

		switch {
		case err == nil:
		case errors.Is(err, ErrQueueFull), errors.Is(err, ErrDispatcherClosed):
			s.logger.Warn("index sweep stopped early",
				"school", tenant.Code, "reason", err.Error())
			budget = 0
		default:
			if report.Err == nil {
				report.Err = err
			}
		}
	}

	s.prune(started)
	report.Duration = time.Since(started)
	s.record(report)
	s.announce(report)
	return report
}

func (s *Sweeper) sweep(ctx context.Context, tenant Tenant, now time.Time,
	limit int, report *SweepReport) (int, error) {

	rows, err := s.due(ctx, tenant, now, limit)
	if err != nil {
		return 0, fmt.Errorf("indexing: scanning %s for stranded items: %w", tenant.Code, err)
	}
	report.Scanned += len(rows)

	claimed := 0
	for _, row := range rows {
		if !s.ready(row, now) {
			report.Deferred++
			continue
		}

		attempts := nextAttempt(row)
		taken, err := s.claim(ctx, tenant, row, now, attempts)
		if err != nil {
			return claimed, err
		}
		if !taken {
			report.Deferred++
			continue
		}
		claimed++
		report.Claimed++
		s.noteAttempt(row.ID, attempts, now)

		err = s.queue.Submit(tenant.Client, Request{
			Tenant:   tenant.CASTenantID,
			SchoolID: tenant.SchoolID,
			ItemID:   row.ID,
			Store:    tenant.Store,
		})
		if err != nil {
			report.Released++
			Abandon(ctx, tenant.Client, row.ID, s.logger)
			return claimed, err
		}

		s.logger.Info("index sweep re-drove a stranded library item",
			"school", tenant.Code,
			"school_id", tenant.SchoolID,
			"content_item", row.ID,
			"was", string(row.IndexStatus),
			"idle_for_ms", now.Sub(row.UpdatedAt).Milliseconds(),
			"attempt", attempts)
	}
	return claimed, nil
}

func (s *Sweeper) due(ctx context.Context, tenant Tenant, now time.Time,
	limit int) ([]*tenantent.ContentItem, error) {

	return tenant.Client.ContentItem.Query().
		Where(
			entcontentitem.StatusEQ(entcontentitem.StatusPublished),
			entcontentitem.AssetIDNotNil(),
			entcontentitem.Or(
				entcontentitem.And(
					entcontentitem.IndexStatusEQ(entcontentitem.IndexStatusFailed),
					entcontentitem.UpdatedAtLTE(now.Add(-s.opts.RetryBase)),
				),
				entcontentitem.And(
					entcontentitem.IndexStatusEQ(entcontentitem.IndexStatusPending),
					entcontentitem.UpdatedAtLTE(now.Add(-s.opts.PendingAge)),
				),
				entcontentitem.And(
					entcontentitem.IndexStatusEQ(entcontentitem.IndexStatusNone),
					entcontentitem.UpdatedAtLTE(now.Add(-s.opts.RetryBase)),
				),
			),
		).
		Order(tenantent.Asc(entcontentitem.FieldUpdatedAt)).
		Limit(limit).
		All(ctx)
}

func (s *Sweeper) claim(ctx context.Context, tenant Tenant, row *tenantent.ContentItem,
	now time.Time, attempts int) (bool, error) {

	n, err := tenant.Client.ContentItem.Update().
		Where(
			entcontentitem.ID(row.ID),
			entcontentitem.StatusEQ(entcontentitem.StatusPublished),
			entcontentitem.IndexStatusEQ(row.IndexStatus),
			entcontentitem.UpdatedAt(row.UpdatedAt),
		).
		SetIndexStatus(entcontentitem.IndexStatusPending).
		SetIndexAttempts(attempts).
		SetUpdatedAt(now).
		Save(ctx)
	if err != nil {
		return false, fmt.Errorf("indexing: claiming %s in %s: %w", row.ID, tenant.Code, err)
	}
	return n == 1, nil
}

func (s *Sweeper) ready(row *tenantent.ContentItem, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if next, ok := s.attempts[row.ID]; ok {
		return !now.Before(next)
	}
	if row.IndexAttempts < 1 {
		return true
	}
	return !now.Before(row.UpdatedAt.Add(s.earliest(row.IndexAttempts)))
}

func nextAttempt(row *tenantent.ContentItem) int {
	if row.IndexAttempts < 0 {
		return 1
	}
	return row.IndexAttempts + 1
}

func (s *Sweeper) noteAttempt(id uuid.UUID, count int, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.attempts[id] = now.Add(s.backoff(count))
}

func (s *Sweeper) window(count int) time.Duration {
	if count < 1 {
		count = 1
	}
	window := s.opts.RetryBase
	for i := 1; i < count && window < s.opts.RetryCap; i++ {
		window *= 2
	}
	if window > s.opts.RetryCap {
		window = s.opts.RetryCap
	}
	return window
}

func (s *Sweeper) earliest(count int) time.Duration {
	window := s.window(count)
	if half := window / 2; half > 0 {
		return half
	}
	return window
}

func (s *Sweeper) backoff(count int) time.Duration {
	window := s.window(count)
	half := window / 2
	if half <= 0 {
		return window
	}
	return half + time.Duration(rand.Int64N(int64(half)))
}

func (s *Sweeper) prune(now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, next := range s.attempts {
		if now.After(next.Add(s.opts.RetryCap)) {
			delete(s.attempts, id)
		}
	}
	for id, last := range s.heldReminded {
		if now.Sub(last) >= 2*sweepHeartbeatEvery {
			delete(s.heldReminded, id)
		}
	}
}

func (s *Sweeper) Stats() SweepStats {
	if s == nil {
		return SweepStats{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.stats
	out.Tracked = len(s.attempts)
	return out
}

func (s *Sweeper) record(report SweepReport) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stats.Ticks++
	s.stats.LastTickAt = report.At
	s.stats.Scanned += int64(report.Scanned)
	s.stats.Claimed += int64(report.Claimed)
	s.stats.Deferred += int64(report.Deferred)
	s.stats.Released += int64(report.Released)
	s.stats.Held += int64(report.Held)
	s.stats.Promoted += int64(report.Promoted)
	s.stats.Recovered += int64(report.Recovered)
	if report.Err != nil {
		s.stats.Errors++
	}
	if !report.Idle() {
		s.stats.LastWorkAt = report.At
	}
}

func (s *Sweeper) announce(report SweepReport) {
	args := []any{
		"schools", report.Tenants,
		"scanned", report.Scanned,
		"claimed", report.Claimed,
		"deferred", report.Deferred,
		"released", report.Released,
		"held", report.Held,
		"promoted", report.Promoted,
		"recovered", report.Recovered,
		"took_ms", report.Duration.Milliseconds(),
	}
	if report.Err != nil {
		args = append(args, "error", report.Err.Error())
		s.logger.Error("index sweep tick", args...)
		return
	}

	s.mu.Lock()
	due := s.heartbeat.IsZero() || report.At.Sub(s.heartbeat) >= sweepHeartbeatEvery
	if due || !report.Idle() {
		s.heartbeat = report.At
	}
	s.mu.Unlock()

	if due || !report.Idle() {
		s.logger.Info("index sweep tick", args...)
		return
	}
	s.logger.Debug("index sweep tick", args...)
}
