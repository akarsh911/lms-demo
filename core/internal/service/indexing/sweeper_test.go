package indexing

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
)

type countingTenants struct {
	asked atomic.Int64
	list  []Tenant
}

func (c *countingTenants) Sweepable(context.Context) ([]Tenant, error) {
	c.asked.Add(1)
	return c.list, nil
}

type refusingQueue struct {
	submitted atomic.Int64
	err       error
}

func (q *refusingQueue) Submit(*tenantent.Client, Request) error {
	q.submitted.Add(1)
	return q.err
}

var errNoTenantDatabase = errors.New("this school's database is unreachable")

type unreachableDriver struct{}

func (unreachableDriver) Query(context.Context, string, any, any) error { return errNoTenantDatabase }
func (unreachableDriver) Exec(context.Context, string, any, any) error  { return errNoTenantDatabase }
func (unreachableDriver) Tx(context.Context) (dialect.Tx, error)        { return nil, errNoTenantDatabase }
func (unreachableDriver) Close() error                                  { return nil }
func (unreachableDriver) Dialect() string                               { return dialect.Postgres }

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError}))
}

type sweepFixture struct {
	*indexFixture

	sweeper    *Sweeper
	dispatcher *Dispatcher
	tenants    *countingTenants
}

func newSweepFixture(t *testing.T, terminal map[string]any) *sweepFixture {
	t.Helper()

	fx := newIndexFixture(t, terminal)
	dispatcher := NewDispatcher(fx.indexer, 1, quietLogger())
	t.Cleanup(dispatcher.Close)

	tenants := &countingTenants{list: []Tenant{{
		SchoolID:    fx.school,
		Code:        "DPS-NGP",
		CASTenantID: "demo-school",
		Client:      fx.client,
		Store:       fx.store,
	}}}

	sweeper, err := NewSweeper(tenants, dispatcher, sweepTestOptions(), quietLogger())
	if err != nil {
		t.Fatalf("could not build a sweeper: %v", err)
	}

	return &sweepFixture{indexFixture: fx, sweeper: sweeper, dispatcher: dispatcher, tenants: tenants}
}

func sweepTestOptions() SweepOptions {
	return SweepOptions{
		Interval:   time.Minute,
		PendingAge: 30 * time.Minute,
		RetryBase:  5 * time.Minute,
		RetryCap:   time.Hour,
	}
}

func (fx *sweepFixture) strand(t *testing.T, status entcontentitem.IndexStatus, idle time.Duration) {
	t.Helper()

	err := fx.client.ContentItem.UpdateOneID(fx.item).
		SetIndexStatus(status).
		SetUpdatedAt(time.Now().UTC().Add(-idle)).
		Exec(fx.ctx)
	if err != nil {
		t.Fatalf("could not strand the item as %s: %v", status, err)
	}
}

func (fx *sweepFixture) strandAfter(t *testing.T, status entcontentitem.IndexStatus,
	idle time.Duration, attempts int) {

	t.Helper()

	err := fx.client.ContentItem.UpdateOneID(fx.item).
		SetIndexStatus(status).
		SetIndexAttempts(attempts).
		SetUpdatedAt(time.Now().UTC().Add(-idle)).
		Exec(fx.ctx)
	if err != nil {
		t.Fatalf("could not strand the item as %s after %d attempts: %v", status, attempts, err)
	}
}

func (fx *sweepFixture) restart(t *testing.T) {
	t.Helper()

	sweeper, err := NewSweeper(fx.tenants, fx.dispatcher, sweepTestOptions(), quietLogger())
	if err != nil {
		t.Fatalf("could not restart the sweeper: %v", err)
	}
	fx.sweeper = sweeper
}

func (fx *sweepFixture) tick(t *testing.T) SweepReport {
	t.Helper()

	report := fx.sweeper.Tick(fx.ctx)
	fx.dispatcher.Drain()
	return report
}

func TestSweeperIsNotBuiltWhenIndexingIsOff(t *testing.T) {
	cases := []struct {
		name string
		cfg  *config.Config
	}{
		{
			name: "the whole bridge is off",
			cfg: &config.Config{
				RetrievalIndexEnabled: false,
				RetrievalSweepEnabled: true,
			},
		},
		{
			name: "the flag is on but no engine is named",
			cfg: &config.Config{
				RetrievalIndexEnabled: true,
				RetrievalSweepEnabled: true,
			},
		},
		{
			name: "indexing is on but the sweep is turned off by itself",
			cfg: &config.Config{
				RetrievalIndexEnabled:  true,
				RetrievalEngineBaseURL: "http://engine.invalid",
				RetrievalSweepEnabled:  false,
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tenants := &countingTenants{}
			queue := &refusingQueue{}

			ctx, cancel := context.WithCancel(context.Background())
			cancel()

			sweeper := SweeperFor(tc.cfg, tenants, queue, nil, quietLogger())
			if sweeper != nil {
				t.Error("a sweeper was built while indexing was not fully enabled")
			}

			report := sweeper.Tick(ctx)
			if err := sweeper.Run(ctx); err != nil {
				t.Errorf("running a disabled sweeper returned %v", err)
			}

			if tenants.asked.Load() != 0 {
				t.Fatalf("a disabled sweeper opened %d tenants", tenants.asked.Load())
			}
			if queue.submitted.Load() != 0 {
				t.Fatalf("a disabled sweeper queued %d items", queue.submitted.Load())
			}
			if report.Tenants != 0 || report.Scanned != 0 || report.Claimed != 0 {
				t.Fatalf("a disabled sweeper reported work: %+v", report)
			}
			if stats := sweeper.Stats(); stats.Ticks != 0 {
				t.Fatalf("a disabled sweeper recorded %d ticks", stats.Ticks)
			}
		})
	}
}

func TestSweeperIsBuiltWhenIndexingIsOn(t *testing.T) {
	cfg := &config.Config{
		RetrievalIndexEnabled:  true,
		RetrievalEngineBaseURL: "http://engine.invalid",
		RetrievalSweepEnabled:  true,
	}

	sweeper := SweeperFor(cfg, &countingTenants{}, &refusingQueue{}, nil, quietLogger())
	if sweeper == nil {
		t.Fatal("no sweeper was built while indexing was enabled, so nothing re-drives a failed row")
	}
}

func TestSweeperRetriesAFailedRowOnceTheEngineIsBack(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strand(t, entcontentitem.IndexStatusFailed, time.Hour)

	before := fx.reload(t)
	report := fx.tick(t)

	if report.Scanned != 1 || report.Claimed != 1 {
		t.Fatalf("the sweep scanned %d and claimed %d, want one of each", report.Scanned, report.Claimed)
	}
	if fx.engine.seen.ingests != 1 {
		t.Fatalf("the engine saw %d ingests, want the one the sweeper re-drove", fx.engine.seen.ingests)
	}
	if fx.engine.seen.tenant != "demo-school" {
		t.Fatalf("the re-drive was stamped with tenant %q, want the school's CAS slug", fx.engine.seen.tenant)
	}

	row := fx.reload(t)
	if row.IndexStatus != entcontentitem.IndexStatusIndexed {
		t.Fatalf("index_status is %q after the sweep, want indexed", row.IndexStatus)
	}
	if row.EngineDocumentID == nil || *row.EngineDocumentID != "doc_4f21aa90bc31" {
		t.Fatalf("the swept row carries document id %v, want the engine's", row.EngineDocumentID)
	}
	if row.IndexedSha256 == nil || *row.IndexedSha256 != indexDigest {
		t.Fatalf("the swept row carries digest %v, want the asset's", row.IndexedSha256)
	}
	if !row.UpdatedAt.After(before.UpdatedAt) {
		t.Fatal("the sweep never touched updated_at, so nothing spaces out the next attempt")
	}
}

func TestSweeperPicksUpAPendingRowAnOldProcessOrphaned(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strand(t, entcontentitem.IndexStatusPending, 2*time.Hour)

	report := fx.tick(t)

	if report.Claimed != 1 {
		t.Fatalf("the sweep claimed %d orphaned pending rows, want 1", report.Claimed)
	}
	if fx.engine.seen.ingests != 1 {
		t.Fatalf("an orphaned pending row was pushed %d times, want once", fx.engine.seen.ingests)
	}
	if row := fx.reload(t); row.IndexStatus != entcontentitem.IndexStatusIndexed {
		t.Fatalf("index_status is %q after the sweep, want indexed", row.IndexStatus)
	}
}

func TestSweeperLeavesAFreshPendingRowToTheProcessThatOwnsIt(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strand(t, entcontentitem.IndexStatusPending, time.Minute)

	report := fx.tick(t)

	if report.Scanned != 0 || report.Claimed != 0 {
		t.Fatalf("a pending row a minute old was scanned %d and claimed %d; it may still be in "+
			"flight in another process", report.Scanned, report.Claimed)
	}
	if fx.engine.seen.ingests != 0 {
		t.Fatalf("a fresh pending row was pushed %d times, duplicating work in flight",
			fx.engine.seen.ingests)
	}
	if row := fx.reload(t); row.IndexStatus != entcontentitem.IndexStatusPending {
		t.Fatalf("index_status is %q, want the pending row left alone", row.IndexStatus)
	}
}

func TestSweeperLeavesAFreshFailedRowAlone(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strand(t, entcontentitem.IndexStatusFailed, time.Minute)

	report := fx.tick(t)

	if report.Scanned != 0 {
		t.Fatalf("a row that failed a minute ago was scanned %d times; RetryBase is five minutes",
			report.Scanned)
	}
	if fx.engine.seen.ingests != 0 {
		t.Fatalf("a row that just failed was retried immediately %d times", fx.engine.seen.ingests)
	}
}

func TestSweeperSendsAnItemNothingEverEnqueued(t *testing.T) {
	fx := newSweepFixture(t, refusedResult())
	fx.strand(t, entcontentitem.IndexStatusNone, time.Hour)

	report := fx.tick(t)

	if report.Scanned != 1 || report.Claimed != 1 {
		t.Fatalf("the sweep scanned %d and claimed %d published rows that were never enqueued, "+
			"want one of each; nothing else will ever send them", report.Scanned, report.Claimed)
	}
	if fx.engine.seen.ingests != 1 {
		t.Fatalf("the engine saw %d ingests, want the one the sweeper re-drove", fx.engine.seen.ingests)
	}

	row := fx.reload(t)
	if row.IndexStatus != entcontentitem.IndexStatusFailed {
		t.Fatalf("index_status is %q after the engine refused it, want failed", row.IndexStatus)
	}
	if row.IndexAttempts != 1 {
		t.Fatalf("a first-ever attempt on a never-enqueued row was recorded as %d attempts, want 1; "+
			"anything else either replays it every tick or backs it off as though it had failed "+
			"before", row.IndexAttempts)
	}
}

func TestSweeperWaitsOutTheEnqueueWindowBeforeTakingANeverSentRow(t *testing.T) {
	cases := []struct {
		name    string
		idle    time.Duration
		claimed int
		settled entcontentitem.IndexStatus
	}{
		{
			name:    "a row published a minute ago whose enqueue may still be in flight",
			idle:    time.Minute,
			claimed: 0,
			settled: entcontentitem.IndexStatusNone,
		},
		{
			name:    "a row published long enough ago that no enqueue is coming",
			idle:    10 * time.Minute,
			claimed: 1,
			settled: entcontentitem.IndexStatusIndexed,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newSweepFixture(t, indexedResult())
			fx.strand(t, entcontentitem.IndexStatusNone, tc.idle)

			report := fx.tick(t)

			if report.Scanned != tc.claimed || report.Claimed != tc.claimed {
				t.Fatalf("a never-enqueued row idle for %s was scanned %d and claimed %d, want %d "+
					"of each; RetryBase is %s", tc.idle, report.Scanned, report.Claimed,
					tc.claimed, sweepTestOptions().RetryBase)
			}
			if fx.engine.seen.ingests != tc.claimed {
				t.Fatalf("the engine was handed a row idle for %s %d times, want %d; the publish "+
					"that wrote it marks it pending itself and would be pushing it too", tc.idle,
					fx.engine.seen.ingests, tc.claimed)
			}
			if row := fx.reload(t); row.IndexStatus != tc.settled {
				t.Fatalf("index_status is %q after the sweep, want %q", row.IndexStatus, tc.settled)
			}
		})
	}
}

func TestSweeperIgnoresRowsItHasNoBusinessTouching(t *testing.T) {
	cases := []struct {
		name  string
		setup func(*sweepFixture)
	}{
		{
			name: "an item already in the engine",
			setup: func(fx *sweepFixture) {
				fx.client.ContentItem.UpdateOneID(fx.item).
					SetIndexStatus(entcontentitem.IndexStatusIndexed).
					SetUpdatedAt(time.Now().UTC().Add(-time.Hour)).
					ExecX(fx.ctx)
			},
		},
		{
			name: "an item that failed and was then withdrawn from the catalogue",
			setup: func(fx *sweepFixture) {
				fx.client.ContentItem.UpdateOneID(fx.item).
					SetIndexStatus(entcontentitem.IndexStatusFailed).
					SetStatus(entcontentitem.StatusArchived).
					SetUpdatedAt(time.Now().UTC().Add(-time.Hour)).
					ExecX(fx.ctx)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newSweepFixture(t, indexedResult())
			tc.setup(fx)

			report := fx.tick(t)

			if report.Scanned != 0 || report.Claimed != 0 {
				t.Fatalf("the sweep scanned %d and claimed %d, want neither", report.Scanned, report.Claimed)
			}
			if fx.engine.seen.ingests != 0 {
				t.Fatalf("the engine was sent %d items it should never see", fx.engine.seen.ingests)
			}
		})
	}
}

func TestSweeperClaimIsWonByExactlyOneInstance(t *testing.T) {
	cases := []struct {
		name string
		was  entcontentitem.IndexStatus
	}{
		{name: "a row the engine refused", was: entcontentitem.IndexStatusFailed},
		{name: "a row another process orphaned in pending", was: entcontentitem.IndexStatusPending},
		{name: "a row nothing ever enqueued", was: entcontentitem.IndexStatusNone},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newSweepFixture(t, indexedResult())
			fx.strand(t, tc.was, 2*time.Hour)

			other, err := NewSweeper(fx.tenants, fx.dispatcher, SweepOptions{}, quietLogger())
			if err != nil {
				t.Fatalf("could not build the second instance: %v", err)
			}

			row := fx.reload(t)
			tenant := fx.tenants.list[0]
			now := time.Now().UTC()

			first, err := fx.sweeper.claim(fx.ctx, tenant, row, now, 1)
			if err != nil {
				t.Fatalf("the first claim failed: %v", err)
			}
			second, err := other.claim(fx.ctx, tenant, row, now.Add(time.Second), 1)
			if err != nil {
				t.Fatalf("the second claim failed: %v", err)
			}

			if !first {
				t.Fatal("the first instance did not claim a row nothing else held")
			}
			if second {
				t.Fatal("two instances claimed the same row from the same read, so both would push it")
			}

			after := fx.reload(t)
			if after.IndexStatus != entcontentitem.IndexStatusPending {
				t.Fatalf("index_status is %q after a claim, want pending", after.IndexStatus)
			}
			if !after.UpdatedAt.Equal(now.Truncate(time.Microsecond)) {
				t.Fatalf("updated_at is %s after the claim, want the claiming instant %s; it is the "+
					"only thing holding the row against a second sweep",
					after.UpdatedAt.UTC(), now.Truncate(time.Microsecond))
			}
		})
	}
}

func TestSweeperBacksOffARowItJustClaimed(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strand(t, entcontentitem.IndexStatusFailed, time.Hour)

	if report := fx.tick(t); report.Claimed != 1 {
		t.Fatalf("the first sweep claimed %d, want 1", report.Claimed)
	}

	fx.strand(t, entcontentitem.IndexStatusFailed, time.Hour)
	report := fx.tick(t)

	if report.Scanned != 1 {
		t.Fatalf("the second sweep scanned %d rows, want the failed row it is holding off",
			report.Scanned)
	}
	if report.Claimed != 0 || report.Deferred != 1 {
		t.Fatalf("the second sweep claimed %d and deferred %d; a repeatedly failing row must not be "+
			"retried every tick", report.Claimed, report.Deferred)
	}
	if fx.engine.seen.ingests != 1 {
		t.Fatalf("the engine saw %d pushes across two ticks, want the one", fx.engine.seen.ingests)
	}
}

func TestSweeperStrandsNothingWhenTheQueueWillNotTakeIt(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strand(t, entcontentitem.IndexStatusFailed, time.Hour)

	queue := &refusingQueue{err: ErrQueueFull}
	sweeper, err := NewSweeper(fx.tenants, queue, SweepOptions{
		PendingAge: 30 * time.Minute,
		RetryBase:  5 * time.Minute,
	}, quietLogger())
	if err != nil {
		t.Fatalf("could not build a sweeper: %v", err)
	}

	report := sweeper.Tick(fx.ctx)

	if report.Claimed != 1 || report.Released != 1 {
		t.Fatalf("the sweep claimed %d and released %d, want one of each", report.Claimed, report.Released)
	}
	if queue.submitted.Load() != 1 {
		t.Fatalf("the queue was offered %d items, want 1", queue.submitted.Load())
	}
	if got := fx.reload(t).IndexStatus; got != entcontentitem.IndexStatusFailed {
		t.Fatalf("index_status is %q; a row the queue refused must go back to failed, not sit in "+
			"pending that nothing re-drives", got)
	}
}

func TestSweeperKeepsSweepingAfterOneSchoolFails(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strand(t, entcontentitem.IndexStatusFailed, time.Hour)

	broken := Tenant{
		SchoolID:    uuid.New(),
		Code:        "BROKEN",
		CASTenantID: "broken-school",
		Client:      tenantent.NewClient(tenantent.Driver(unreachableDriver{})),
		Store:       fx.store,
	}
	fx.tenants.list = append([]Tenant{broken}, fx.tenants.list...)

	report := fx.tick(t)

	if report.Err == nil {
		t.Fatal("a school whose database could not be read was reported as a clean tick")
	}
	if report.Claimed != 1 {
		t.Fatalf("the sweep claimed %d after one school failed; the reachable school must still "+
			"be swept", report.Claimed)
	}
	if row := fx.reload(t); row.IndexStatus != entcontentitem.IndexStatusIndexed {
		t.Fatalf("index_status is %q, want the reachable school's row indexed", row.IndexStatus)
	}
}

func TestSweepOptionsRefuseAPendingWindowShorterThanAJobCanRun(t *testing.T) {
	opts := SweepOptions{PendingAge: time.Minute, PollTimeout: 15 * time.Minute}
	opts.withDefaults()

	if opts.PendingAge != 30*time.Minute {
		t.Fatalf("PendingAge settled at %s; a job may legitimately poll for %s, so anything shorter "+
			"calls a live push orphaned", opts.PendingAge, 15*time.Minute)
	}

	bare := SweepOptions{}
	bare.withDefaults()
	if bare.PendingAge != DefaultSweepPendingAge {
		t.Fatalf("PendingAge defaulted to %s, want %s", bare.PendingAge, DefaultSweepPendingAge)
	}
	if bare.RetryCap < bare.RetryBase {
		t.Fatalf("the backoff cap %s is below the base %s", bare.RetryCap, bare.RetryBase)
	}
	if bare.PerTenant > bare.Batch {
		t.Fatalf("a single school may take %d of a %d row budget", bare.PerTenant, bare.Batch)
	}
}

func TestSweeperBackoffGrowsAndIsCapped(t *testing.T) {
	sweeper, err := NewSweeper(&countingTenants{}, &refusingQueue{}, SweepOptions{
		RetryBase: time.Minute,
		RetryCap:  10 * time.Minute,
	}, quietLogger())
	if err != nil {
		t.Fatalf("could not build a sweeper: %v", err)
	}

	previous := time.Duration(0)
	for count := 1; count <= 4; count++ {
		got := sweeper.backoff(count)
		floor := min(time.Duration(1<<(count-1))*time.Minute, 10*time.Minute) / 2
		if got < floor {
			t.Fatalf("attempt %d backed off %s, below its floor %s", count, got, floor)
		}
		if got > 10*time.Minute {
			t.Fatalf("attempt %d backed off %s, past the cap", count, got)
		}
		previous = got
	}
	if previous <= 0 {
		t.Fatal("the backoff collapsed to nothing")
	}

	if got := sweeper.backoff(64); got > 10*time.Minute {
		t.Fatalf("a long-failing row backed off %s, past the cap", got)
	}
}

func TestSweeperForgetsRowsItNoLongerSees(t *testing.T) {
	sweeper, err := NewSweeper(&countingTenants{}, &refusingQueue{}, SweepOptions{
		RetryBase: time.Minute,
		RetryCap:  10 * time.Minute,
	}, quietLogger())
	if err != nil {
		t.Fatalf("could not build a sweeper: %v", err)
	}

	id := uuid.New()
	now := time.Now().UTC()
	sweeper.noteAttempt(id, 1, now)
	if sweeper.Stats().Tracked != 1 {
		t.Fatal("an attempt was not remembered, so backoff cannot grow")
	}

	sweeper.prune(now.Add(time.Minute))
	if sweeper.Stats().Tracked != 1 {
		t.Fatal("a row still inside its backoff window was forgotten")
	}

	sweeper.prune(now.Add(2 * time.Hour))
	if sweeper.Stats().Tracked != 0 {
		t.Fatal("a row nothing has re-claimed for a full cap was kept, so the map grows forever")
	}
}

func TestSweeperStopsWhenTheContextIsDone(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strand(t, entcontentitem.IndexStatusFailed, time.Hour)

	ctx, cancel := context.WithCancel(fx.ctx)
	cancel()

	report := fx.sweeper.Tick(ctx)
	fx.dispatcher.Drain()

	if report.Claimed != 0 {
		t.Fatalf("a cancelled sweep still claimed %d rows", report.Claimed)
	}
	if fx.engine.seen.ingests != 0 {
		t.Fatalf("a cancelled sweep pushed %d items", fx.engine.seen.ingests)
	}
	if report.Err != nil {
		t.Fatalf("a cancelled sweep reported %v; shutdown is not a fault", report.Err)
	}
}

func TestSweeperSkipsAnItemWithNoBytesToIndex(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strand(t, entcontentitem.IndexStatusIndexed, time.Hour)

	bare := fx.client.ContentItem.Create().
		SetTitle("A reading list with no file " + uuid.New().String()[:8]).
		SetKind(entcontentitem.KindNote).
		SetAudience(entcontentitem.AudienceSchool).
		SetStatus(entcontentitem.StatusPublished).
		SetOwnerPersonID(fx.owner).
		SaveX(fx.ctx)
	fx.client.ContentItem.UpdateOneID(bare.ID).
		SetIndexStatus(entcontentitem.IndexStatusFailed).
		SetUpdatedAt(time.Now().UTC().Add(-time.Hour)).
		ExecX(fx.ctx)

	report := fx.tick(t)

	if report.Scanned != 0 || report.Claimed != 0 {
		t.Fatalf("an item with no asset was scanned %d and claimed %d; it can only ever fail again",
			report.Scanned, report.Claimed)
	}
	if fx.engine.seen.ingests != 0 {
		t.Fatalf("an item with no bytes was pushed %d times", fx.engine.seen.ingests)
	}
}

func TestSweeperRunReturnsWhenTheContextIsDone(t *testing.T) {
	sweeper, err := NewSweeper(&countingTenants{}, &refusingQueue{}, SweepOptions{
		Interval: time.Minute,
	}, quietLogger())
	if err != nil {
		t.Fatalf("could not build a sweeper: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if err := sweeper.Run(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("Run returned %v, want context.Canceled", err)
	}
}

func refusedResult() map[string]any {
	return map[string]any{
		"id": "job_abc123", "status": StatusFailed, "phase": "failed",
		"error": "the PDF could not be parsed",
	}
}

func parkedResult() map[string]any {
	return map[string]any{
		"id": "job_abc123", "status": StatusPendingConfirmation, "phase": "done",
		"result": map[string]any{"pending_id": "doc_parked00001", "title": "Indexable Atlas"},
	}
}

func TestSweeperCarriesTheAttemptCountThroughARestart(t *testing.T) {
	fx := newSweepFixture(t, refusedResult())
	fx.strand(t, entcontentitem.IndexStatusFailed, time.Hour)

	if report := fx.tick(t); report.Claimed != 1 {
		t.Fatalf("the first sweep claimed %d, want 1", report.Claimed)
	}
	if got := fx.reload(t).IndexAttempts; got != 1 {
		t.Fatalf("the row records %d attempts after one sweep, want 1; nothing outlives this "+
			"process to space out the next one", got)
	}

	fx.restart(t)
	fx.strand(t, entcontentitem.IndexStatusFailed, time.Hour)

	if report := fx.tick(t); report.Claimed != 1 {
		t.Fatalf("the sweep after the restart claimed %d, want 1", report.Claimed)
	}
	if got := fx.reload(t).IndexAttempts; got != 2 {
		t.Fatalf("the row records %d attempts after a restart, want 2; the count was read from "+
			"memory the restart threw away, so backoff begins again at the base window", got)
	}
}

func TestSweeperHoldsOffALongFailingRowAcrossARestart(t *testing.T) {
	cases := []struct {
		name     string
		attempts int
		claimed  int
		deferred int
	}{
		{name: "a row whose first attempt failed", attempts: 0, claimed: 1, deferred: 0},
		{name: "a row that has failed four times", attempts: 4, claimed: 0, deferred: 1},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newSweepFixture(t, indexedResult())
			fx.strandAfter(t, entcontentitem.IndexStatusFailed, 10*time.Minute, tc.attempts)

			report := fx.tick(t)

			if report.Scanned != 1 {
				t.Fatalf("the sweep scanned %d rows, want the one; both cases must be equally "+
					"visible to the query or they are not being told apart by the attempt count",
					report.Scanned)
			}
			if report.Claimed != tc.claimed || report.Deferred != tc.deferred {
				t.Fatalf("a freshly started sweeper claimed %d and deferred %d after %d recorded "+
					"attempts, want %d and %d", report.Claimed, report.Deferred, tc.attempts,
					tc.claimed, tc.deferred)
			}
			if fx.engine.seen.ingests != tc.claimed {
				t.Fatalf("the engine saw %d pushes, want %d", fx.engine.seen.ingests, tc.claimed)
			}
		})
	}
}

func TestSweeperClearsTheAttemptCountOnceARowIsIndexed(t *testing.T) {
	fx := newSweepFixture(t, indexedResult())
	fx.strandAfter(t, entcontentitem.IndexStatusFailed, time.Hour, 3)

	if report := fx.tick(t); report.Claimed != 1 {
		t.Fatalf("the sweep claimed %d, want 1", report.Claimed)
	}

	row := fx.reload(t)
	if row.IndexStatus != entcontentitem.IndexStatusIndexed {
		t.Fatalf("index_status is %q after the sweep, want indexed", row.IndexStatus)
	}
	if row.IndexAttempts != 0 {
		t.Fatalf("an indexed row still records %d attempts; the next time it fails it would back "+
			"off as though it had never succeeded", row.IndexAttempts)
	}
}

func TestSweeperTellsAParkedUploadFromAnOrphanedOne(t *testing.T) {
	cases := []struct {
		name  string
		was   entcontentitem.IndexStatus
		sweep bool
	}{
		{
			name:  "a row an old process left in pending",
			was:   entcontentitem.IndexStatusPending,
			sweep: true,
		},
		{
			name:  "an upload the engine parked for someone to confirm",
			was:   entcontentitem.IndexStatusParked,
			sweep: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newSweepFixture(t, indexedResult())
			fx.strand(t, tc.was, 2*time.Hour)

			report := fx.tick(t)

			want := 0
			if tc.sweep {
				want = 1
			}
			if report.Claimed != want {
				t.Fatalf("the sweep claimed %d rows that were %q, want %d", report.Claimed, tc.was, want)
			}
			if fx.engine.seen.ingests != want {
				t.Fatalf("the engine was handed %d rows that were %q, want %d; a parked upload is "+
					"waiting on a person, not on a retry", fx.engine.seen.ingests, tc.was, want)
			}
			if row := fx.reload(t); !tc.sweep && row.IndexStatus != entcontentitem.IndexStatusParked {
				t.Fatalf("index_status is %q, want the parked upload left where the engine put it",
					row.IndexStatus)
			}
		})
	}
}

func TestSweeperDoesNotRePushAnUploadTheEngineParked(t *testing.T) {
	fx := newSweepFixture(t, parkedResult())
	fx.strand(t, entcontentitem.IndexStatusFailed, time.Hour)

	if report := fx.tick(t); report.Claimed != 1 {
		t.Fatalf("the first sweep claimed %d, want 1", report.Claimed)
	}
	settled := fx.reload(t)
	if settled.IndexStatus != entcontentitem.IndexStatusParked {
		t.Fatalf("a parked upload settled as %q", settled.IndexStatus)
	}

	fx.restart(t)
	fx.strand(t, settled.IndexStatus, 2*time.Hour)

	report := fx.tick(t)

	if report.Scanned != 0 || report.Claimed != 0 {
		t.Fatalf("a parked upload was scanned %d and claimed %d once its window elapsed; the "+
			"engine would only park it again", report.Scanned, report.Claimed)
	}
	if fx.engine.seen.ingests != 1 {
		t.Fatalf("the engine was handed the same parked upload %d times", fx.engine.seen.ingests)
	}
}
