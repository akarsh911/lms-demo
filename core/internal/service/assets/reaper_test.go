package assets

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

var theMoment = time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)

func at(d time.Duration) time.Time { return theMoment.Add(-d) }

func frozen() func() time.Time { return func() time.Time { return theMoment } }

type fakeRows struct {
	rows      []Row
	err       error
	cutoff    time.Time
	limit     int
	scans     int
	retired   []uuid.UUID
	retireErr error
}

func (f *fakeRows) Sweepable(_ context.Context, cutoff time.Time, limit int) ([]Row, error) {
	f.scans++
	f.cutoff = cutoff
	f.limit = limit
	return f.rows, f.err
}

func (f *fakeRows) Retire(_ context.Context, id uuid.UUID) error {
	if f.retireErr != nil {
		return f.retireErr
	}
	f.retired = append(f.retired, id)
	return nil
}

type fakeObjects struct {
	present   map[string]bool
	headErr   error
	deleteErr error
	heads     []string
	deleted   []string
}

func (f *fakeObjects) Head(_ context.Context, key string) (bool, error) {
	f.heads = append(f.heads, key)
	if f.headErr != nil {
		return false, f.headErr
	}
	return f.present[key], nil
}

func (f *fakeObjects) Delete(_ context.Context, key string) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}
	f.deleted = append(f.deleted, key)
	return nil
}

func stores(rows ...Row) (*fakeRows, *fakeObjects) {
	objects := &fakeObjects{present: map[string]bool{}}
	for _, row := range rows {
		if row.StorageKey != "" {
			objects.present[row.StorageKey] = true
		}
	}
	return &fakeRows{rows: rows}, objects
}

func pending(key string, age time.Duration) Row {
	return Row{ID: uuid.New(), StorageKey: key, Status: StatusPending, CreatedAt: at(age), UpdatedAt: at(age)}
}

func softDeleted(key string, since time.Duration) Row {
	return Row{
		ID:         uuid.New(),
		StorageKey: key,
		Status:     StatusDeleted,
		CreatedAt:  at(since + 90*24*time.Hour),
		UpdatedAt:  at(since),
	}
}

func reap(t *testing.T, rows Rows, objects Objects, opts Options) Result {
	t.Helper()
	if opts.Now == nil {
		opts.Now = frozen()
	}
	r, err := New(rows, objects, opts)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	out, err := r.Run(context.Background())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return out
}

func TestTheDefaultIsADryRunThatTouchesNothing(t *testing.T) {
	rows, objects := stores(
		pending("schools/hp/assets/abandoned.pdf", 40*time.Hour),
		softDeleted("schools/hp/assets/retired.pdf", 40*time.Hour),
	)

	out := reap(t, rows, objects, Options{})

	if !out.DryRun {
		t.Fatal("a reaper built without Destroy reported itself as destructive")
	}
	if len(objects.deleted) != 0 {
		t.Fatalf("the default run deleted objects: %v", objects.deleted)
	}
	if len(rows.retired) != 0 {
		t.Fatalf("the default run wrote to rows: %v", rows.retired)
	}
	if out.ObjectsRemoved != 0 || out.RowsRetired != 0 {
		t.Fatalf("the default run claimed %d removals and %d retirements", out.ObjectsRemoved, out.RowsRetired)
	}
	if out.PlannedObjectRemovals != 2 {
		t.Fatalf("PlannedObjectRemovals = %d, want 2", out.PlannedObjectRemovals)
	}
	if out.PlannedRowRetirements != 1 {
		t.Fatalf("PlannedRowRetirements = %d, want 1, only the pending row is retired", out.PlannedRowRetirements)
	}
	if out.Scanned != 2 {
		t.Fatalf("Scanned = %d, want 2", out.Scanned)
	}
	for _, f := range out.Findings {
		if f.Applied {
			t.Fatalf("a dry run marked %s applied", f.AssetID)
		}
	}
}

func TestDestroyRemovesTheObjectAndRetiresThePendingRow(t *testing.T) {
	row := pending("schools/hp/assets/abandoned.pdf", 40*time.Hour)
	rows, objects := stores(row)

	out := reap(t, rows, objects, Options{Destroy: true})

	if out.DryRun {
		t.Fatal("an explicit Destroy still reported a dry run")
	}
	if len(objects.deleted) != 1 || objects.deleted[0] != row.StorageKey {
		t.Fatalf("deleted = %v, want %q", objects.deleted, row.StorageKey)
	}
	if len(rows.retired) != 1 || rows.retired[0] != row.ID {
		t.Fatalf("retired = %v, want %v", rows.retired, row.ID)
	}
	if out.ObjectsRemoved != 1 || out.RowsRetired != 1 {
		t.Fatalf("ObjectsRemoved = %d, RowsRetired = %d, want 1 and 1", out.ObjectsRemoved, out.RowsRetired)
	}
	if out.Failed != 0 {
		t.Fatalf("Failed = %d, want 0", out.Failed)
	}
}

func TestAPendingRowYoungerThanTheThresholdIsNeverTouched(t *testing.T) {
	row := pending("schools/hp/assets/still-uploading.pdf", 20*time.Hour)
	rows, objects := stores(row)

	out := reap(t, rows, objects, Options{Age: 24 * time.Hour, Destroy: true})

	if len(objects.deleted) != 0 {
		t.Fatalf("a slow upload lost its bytes: %v", objects.deleted)
	}
	if len(rows.retired) != 0 {
		t.Fatalf("a slow upload lost its row: %v", rows.retired)
	}
	if out.Kept != 1 || out.PlannedObjectRemovals != 0 || out.PlannedRowRetirements != 0 {
		t.Fatalf("result = %+v, want it kept and nothing planned", out)
	}
	if len(out.Findings) != 1 || out.Findings[0].Reason == "" {
		t.Fatalf("findings = %+v, want one with a reason", out.Findings)
	}
}

func TestTheThresholdHoldsRightUpToItsEdge(t *testing.T) {
	const threshold = 24 * time.Hour

	for _, tc := range []struct {
		name string
		age  time.Duration
		reap bool
	}{
		{"one second short", threshold - time.Second, false},
		{"exactly at the threshold", threshold, true},
		{"one second past", threshold + time.Second, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows, objects := stores(pending("schools/hp/assets/edge.pdf", tc.age))
			out := reap(t, rows, objects, Options{Age: threshold, Destroy: true})

			if got := len(objects.deleted) == 1; got != tc.reap {
				t.Fatalf("deleted = %v at age %s, want reaped = %v", objects.deleted, tc.age, tc.reap)
			}
			if got := out.RowsRetired == 1; got != tc.reap {
				t.Fatalf("RowsRetired = %d at age %s, want reaped = %v", out.RowsRetired, tc.age, tc.reap)
			}
		})
	}
}

func TestAReadyRowIsNeverTouchedEvenWhenTheScanHandsItOver(t *testing.T) {
	row := Row{
		ID:         uuid.New(),
		StorageKey: "schools/hp/assets/live.pdf",
		Status:     StatusReady,
		CreatedAt:  at(400 * time.Hour),
		UpdatedAt:  at(400 * time.Hour),
	}
	rows, objects := stores(row)

	out := reap(t, rows, objects, Options{Destroy: true})

	if len(objects.deleted) != 0 {
		t.Fatalf("a ready asset lost its bytes: %v", objects.deleted)
	}
	if len(rows.retired) != 0 {
		t.Fatalf("a ready asset lost its row: %v", rows.retired)
	}
	if len(objects.heads) != 0 {
		t.Fatalf("a ready asset was even looked up: %v", objects.heads)
	}
	if out.Kept != 1 {
		t.Fatalf("Kept = %d, want 1", out.Kept)
	}
}

func TestAnAssetAContentItemStillPointsAtKeepsItsBytes(t *testing.T) {
	row := softDeleted("schools/hp/assets/cited.pdf", 400*time.Hour)
	row.Referenced = true
	rows, objects := stores(row)

	out := reap(t, rows, objects, Options{Destroy: true})

	if len(objects.deleted) != 0 {
		t.Fatalf("a referenced asset lost its bytes: %v", objects.deleted)
	}
	if out.PlannedObjectRemovals != 0 {
		t.Fatalf("PlannedObjectRemovals = %d, want 0", out.PlannedObjectRemovals)
	}
	if out.Kept != 1 {
		t.Fatalf("Kept = %d, want 1", out.Kept)
	}
	if out.Findings[0].Reason != "a content item still points at it" {
		t.Fatalf("reason = %q", out.Findings[0].Reason)
	}
}

func TestASoftDeletedRowSurvivesTheObjectItLoses(t *testing.T) {
	row := softDeleted("schools/hp/assets/retired.pdf", 40*time.Hour)
	rows, objects := stores(row)

	out := reap(t, rows, objects, Options{Destroy: true})

	if len(objects.deleted) != 1 {
		t.Fatalf("deleted = %v, want the one object", objects.deleted)
	}
	if len(rows.retired) != 0 {
		t.Fatalf("the audit row was written to: %v", rows.retired)
	}
	if out.RowsRetired != 0 || out.PlannedRowRetirements != 0 {
		t.Fatalf("result = %+v, want no row work at all", out)
	}
}

func TestASoftDeleteAgesFromWhenItWasDeletedNotWhenItWasCreated(t *testing.T) {
	row := Row{
		ID:         uuid.New(),
		StorageKey: "schools/hp/assets/just-deleted.pdf",
		Status:     StatusDeleted,
		CreatedAt:  at(400 * time.Hour),
		UpdatedAt:  at(time.Minute),
	}
	rows, objects := stores(row)

	out := reap(t, rows, objects, Options{Age: 24 * time.Hour, Destroy: true})

	if len(objects.deleted) != 0 {
		t.Fatalf("a delete a minute old was reaped on the strength of an old created_at: %v", objects.deleted)
	}
	if out.Kept != 1 {
		t.Fatalf("Kept = %d, want 1", out.Kept)
	}
}

func TestAPendingRowWithNoObjectIsRetiredWithoutAStoreCall(t *testing.T) {
	row := pending("schools/hp/assets/never-arrived.pdf", 40*time.Hour)
	rows, objects := stores(row)
	objects.present = map[string]bool{}

	out := reap(t, rows, objects, Options{Destroy: true})

	if len(objects.deleted) != 0 {
		t.Fatalf("deleted = %v, want nothing, there was no object", objects.deleted)
	}
	if out.RowsRetired != 1 {
		t.Fatalf("RowsRetired = %d, want 1", out.RowsRetired)
	}
}

func TestAStoreThatWillNotAnswerLeavesEverythingAlone(t *testing.T) {
	rows, objects := stores(pending("schools/hp/assets/unknown.pdf", 40*time.Hour))
	objects.headErr = errors.New("blob: the store is unreachable")

	out := reap(t, rows, objects, Options{Destroy: true})

	if len(objects.deleted) != 0 || len(rows.retired) != 0 {
		t.Fatalf("an unreadable store still led to a write: %v %v", objects.deleted, rows.retired)
	}
	if out.Failed != 1 {
		t.Fatalf("Failed = %d, want 1", out.Failed)
	}
	if out.Findings[0].Err == nil {
		t.Fatal("the finding carries no error")
	}
}

func TestAFailedObjectDeleteLeavesTheRowStanding(t *testing.T) {
	rows, objects := stores(pending("schools/hp/assets/stuck.pdf", 40*time.Hour))
	objects.deleteErr = errors.New("blob: access denied")

	out := reap(t, rows, objects, Options{Destroy: true})

	if len(rows.retired) != 0 {
		t.Fatalf("the row was retired while its bytes survived: %v", rows.retired)
	}
	if out.Failed != 1 || out.ObjectsRemoved != 0 || out.RowsRetired != 0 {
		t.Fatalf("result = %+v", out)
	}
}

func TestARowThatWillNotRetireIsReportedNotSwallowed(t *testing.T) {
	rows, objects := stores(pending("schools/hp/assets/racing.pdf", 40*time.Hour))
	rows.retireErr = errors.New("ent: asset not found")

	out := reap(t, rows, objects, Options{Destroy: true})

	if out.Failed != 1 {
		t.Fatalf("Failed = %d, want 1", out.Failed)
	}
	if out.RowsRetired != 0 || out.ObjectsRemoved != 0 {
		t.Fatalf("result = %+v, want nothing counted as done", out)
	}
	if out.Findings[0].Applied {
		t.Fatal("a finding whose write failed was marked applied")
	}
}

func TestOneBadRowDoesNotStopTheSweep(t *testing.T) {
	good := softDeleted("schools/hp/assets/good.pdf", 40*time.Hour)
	rows, objects := stores(good)
	rows.rows = append([]Row{{
		ID:         uuid.New(),
		StorageKey: "",
		Status:     StatusDeleted,
		CreatedAt:  at(400 * time.Hour),
		UpdatedAt:  at(400 * time.Hour),
	}}, rows.rows...)

	out := reap(t, rows, objects, Options{Destroy: true})

	if out.Scanned != 2 {
		t.Fatalf("Scanned = %d, want 2", out.Scanned)
	}
	if out.ObjectsRemoved != 1 || objects.deleted[0] != good.StorageKey {
		t.Fatalf("the healthy row was not swept: %+v %v", out, objects.deleted)
	}
}

func TestTheScanIsAskedForRowsOlderThanTheThreshold(t *testing.T) {
	rows, objects := stores()

	out := reap(t, rows, objects, Options{Age: 72 * time.Hour, Limit: 7})

	want := theMoment.Add(-72 * time.Hour)
	if !rows.cutoff.Equal(want) {
		t.Fatalf("cutoff = %s, want %s", rows.cutoff, want)
	}
	if !out.Cutoff.Equal(want) {
		t.Fatalf("Result.Cutoff = %s, want %s", out.Cutoff, want)
	}
	if rows.limit != 7 {
		t.Fatalf("limit = %d, want 7", rows.limit)
	}
}

func TestTheDefaultsAreTheConservativeOnes(t *testing.T) {
	rows, objects := stores()
	r, err := New(rows, objects, Options{Now: frozen()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if r.Age() != DefaultAge {
		t.Fatalf("Age = %s, want %s", r.Age(), DefaultAge)
	}
	if r.Destroys() {
		t.Fatal("the zero Options produced a destructive reaper")
	}
	if DefaultAge < time.Hour {
		t.Fatalf("DefaultAge = %s, a threshold in minutes reaps live uploads", DefaultAge)
	}
	if _, err := r.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if rows.limit != DefaultLimit {
		t.Fatalf("limit = %d, want %d", rows.limit, DefaultLimit)
	}
	if rows.scans != 1 {
		t.Fatalf("scans = %d, want 1", rows.scans)
	}
}

func TestAThresholdBelowTheFloorIsRefusedOutright(t *testing.T) {
	rows, objects := stores()

	for _, age := range []time.Duration{time.Second, time.Minute, 10 * time.Minute, MinimumAge - time.Nanosecond, -time.Hour} {
		if _, err := New(rows, objects, Options{Age: age, Destroy: true}); !errors.Is(err, ErrAgeTooShort) {
			t.Fatalf("New(age=%s) err = %v, want %v", age, err, ErrAgeTooShort)
		}
	}
	if _, err := New(rows, objects, Options{Age: MinimumAge}); err != nil {
		t.Fatalf("New(age=%s): %v", MinimumAge, err)
	}
}

func TestAReaperWithNothingToTalkToIsRefused(t *testing.T) {
	rows, objects := stores()

	if _, err := New(nil, objects, Options{}); !errors.Is(err, ErrNoRows) {
		t.Fatalf("err = %v, want %v", err, ErrNoRows)
	}
	if _, err := New(rows, nil, Options{}); !errors.Is(err, ErrNoObjects) {
		t.Fatalf("err = %v, want %v", err, ErrNoObjects)
	}
	for _, limit := range []int{-1, MaxLimit + 1} {
		if _, err := New(rows, objects, Options{Limit: limit}); !errors.Is(err, ErrLimit) {
			t.Fatalf("New(limit=%d) err = %v, want %v", limit, err, ErrLimit)
		}
	}
}

func TestAFailedScanIsNotAnEmptySweep(t *testing.T) {
	rows, objects := stores()
	rows.err = errors.New("pq: connection reset")

	r, err := New(rows, objects, Options{Destroy: true, Now: frozen()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := r.Run(context.Background()); err == nil {
		t.Fatal("a broken scan read as a clean sweep")
	}
}
