package assets

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

const liveKeyPrefix = "assetreap-live-test/"

func liveTenant(t *testing.T) *tenantent.Client {
	t.Helper()
	return testsupport.TenantTx(context.Background(), t).Client
}

func plant(t *testing.T, client *tenantent.Client, name string, status asset.Status, created, updated time.Time) uuid.UUID {
	t.Helper()

	row, err := client.Asset.Create().
		SetStorageKey(liveKeyPrefix + name).
		SetFileName(name).
		SetMimeType("application/pdf").
		SetSizeBytes(1024).
		SetSha256("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855").
		SetStatus(status).
		SetCreatedAt(created).
		SetUpdatedAt(updated).
		Save(context.Background())
	if err != nil {
		t.Fatalf("planting %s: %v", name, err)
	}
	return row.ID
}

func plantOwner(t *testing.T, client *tenantent.Client) uuid.UUID {
	t.Helper()

	row, err := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Assetreap").
		SetDisplayName("Assetreap Live Test").
		Save(context.Background())
	if err != nil {
		t.Fatalf("planting the content item owner: %v", err)
	}
	return row.ID
}

func statusOf(t *testing.T, client *tenantent.Client, id uuid.UUID) string {
	t.Helper()
	row, err := client.Asset.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("reading %s back: %v", id, err)
	}
	return string(row.Status)
}

func TestTheLiveDryRunReportsAndChangesNothing(t *testing.T) {
	client := liveTenant(t)
	now := time.Now()

	old := plant(t, client, "old-pending.pdf", asset.StatusPending, now.Add(-40*time.Hour), now.Add(-40*time.Hour))
	young := plant(t, client, "young-pending.pdf", asset.StatusPending, now.Add(-20*time.Hour), now.Add(-20*time.Hour))
	live := plant(t, client, "ready.pdf", asset.StatusReady, now.Add(-400*time.Hour), now.Add(-400*time.Hour))
	gone := plant(t, client, "soft-deleted.pdf", asset.StatusDeleted, now.Add(-400*time.Hour), now.Add(-40*time.Hour))

	objects := &fakeObjects{present: map[string]bool{
		liveKeyPrefix + "old-pending.pdf":   true,
		liveKeyPrefix + "young-pending.pdf": true,
		liveKeyPrefix + "ready.pdf":         true,
		liveKeyPrefix + "soft-deleted.pdf":  true,
	}}

	reaper, err := New(NewEntRows(client), objects, Options{Age: 24 * time.Hour})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	out, err := reaper.Run(context.Background())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if !out.DryRun {
		t.Fatal("the default run was destructive")
	}
	if len(objects.deleted) != 0 {
		t.Fatalf("the dry run deleted objects: %v", objects.deleted)
	}
	for id, want := range map[uuid.UUID]string{
		old:   "pending",
		young: "pending",
		live:  "ready",
		gone:  "deleted",
	} {
		if got := statusOf(t, client, id); got != want {
			t.Fatalf("asset %s is %q after a dry run, want %q", id, got, want)
		}
	}

	planned := map[uuid.UUID]bool{}
	for _, f := range out.Findings {
		if f.RemoveObject || f.RetireRow {
			planned[f.AssetID] = true
		}
	}
	if !planned[old] {
		t.Fatal("the 40 hour old pending row was not even planned for")
	}
	if !planned[gone] {
		t.Fatal("the soft deleted row was not even planned for")
	}
	if planned[young] {
		t.Fatal("a 20 hour old pending row was planned against a 24 hour threshold")
	}
	if planned[live] {
		t.Fatal("a ready row was planned for reaping")
	}
	t.Logf("scanned %d, planned %d object removals and %d retirements, kept %d, failed %d, cutoff %s",
		out.Scanned, out.PlannedObjectRemovals, out.PlannedRowRetirements, out.Kept, out.Failed,
		out.Cutoff.UTC().Format(time.RFC3339))
}

func TestTheLiveDestructiveRunRetiresOnlyWhatItPlanned(t *testing.T) {
	client := liveTenant(t)
	now := time.Now()

	old := plant(t, client, "destroy-old-pending.pdf", asset.StatusPending, now.Add(-40*time.Hour), now.Add(-40*time.Hour))
	young := plant(t, client, "destroy-young-pending.pdf", asset.StatusPending, now.Add(-20*time.Hour), now.Add(-20*time.Hour))
	live := plant(t, client, "destroy-ready.pdf", asset.StatusReady, now.Add(-400*time.Hour), now.Add(-400*time.Hour))
	gone := plant(t, client, "destroy-soft-deleted.pdf", asset.StatusDeleted, now.Add(-400*time.Hour), now.Add(-40*time.Hour))

	objects := &fakeObjects{present: map[string]bool{
		liveKeyPrefix + "destroy-old-pending.pdf":   true,
		liveKeyPrefix + "destroy-young-pending.pdf": true,
		liveKeyPrefix + "destroy-ready.pdf":         true,
		liveKeyPrefix + "destroy-soft-deleted.pdf":  true,
	}}

	reaper, err := New(NewEntRows(client), objects, Options{Age: 24 * time.Hour, Destroy: true})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	out, err := reaper.Run(context.Background())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if out.Failed != 0 {
		t.Fatalf("Failed = %d: %+v", out.Failed, out.Findings)
	}

	removed := map[string]bool{}
	for _, key := range objects.deleted {
		removed[key] = true
	}
	if !removed[liveKeyPrefix+"destroy-old-pending.pdf"] || !removed[liveKeyPrefix+"destroy-soft-deleted.pdf"] {
		t.Fatalf("deleted = %v, the two eligible objects were not both removed", objects.deleted)
	}
	if removed[liveKeyPrefix+"destroy-young-pending.pdf"] || removed[liveKeyPrefix+"destroy-ready.pdf"] {
		t.Fatalf("deleted = %v, an ineligible object was removed", objects.deleted)
	}

	for id, want := range map[uuid.UUID]string{
		old:   "deleted",
		young: "pending",
		live:  "ready",
		gone:  "deleted",
	} {
		if got := statusOf(t, client, id); got != want {
			t.Fatalf("asset %s is %q after the run, want %q", id, got, want)
		}
	}
	t.Logf("scanned %d, removed %d objects, retired %d rows, kept %d",
		out.Scanned, out.ObjectsRemoved, out.RowsRetired, out.Kept)
}

func TestTheLiveSweepLeavesAnAssetAContentItemPointsAt(t *testing.T) {
	client := liveTenant(t)
	ctx := context.Background()
	now := time.Now()

	cited := plant(t, client, "cited.pdf", asset.StatusDeleted, now.Add(-400*time.Hour), now.Add(-400*time.Hour))
	if _, err := client.ContentItem.Create().
		SetTitle("assetreap live test").
		SetAssetID(cited).
		SetOwnerPersonID(plantOwner(t, client)).
		SetAudience(contentitem.AudienceOwner).
		Save(ctx); err != nil {
		t.Fatalf("planting the content item: %v", err)
	}

	objects := &fakeObjects{present: map[string]bool{liveKeyPrefix + "cited.pdf": true}}
	reaper, err := New(NewEntRows(client), objects, Options{Age: 24 * time.Hour, Destroy: true})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	out, err := reaper.Run(ctx)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if len(objects.deleted) != 0 {
		t.Fatalf("a cited asset lost its bytes: %v", objects.deleted)
	}

	var seen bool
	for _, f := range out.Findings {
		if f.AssetID != cited {
			continue
		}
		seen = true
		if !f.Referenced {
			t.Fatal("the scan did not notice the content item")
		}
		if f.RemoveObject || f.RetireRow {
			t.Fatalf("the cited asset was planned for reaping: %+v", f)
		}
	}
	if !seen {
		t.Fatalf("the cited asset was not scanned at all: %d rows", out.Scanned)
	}
}

func TestAnOrphanedPendingRowIsNotStarvedByTheSoftDeletedBacklog(t *testing.T) {
	client := liveTenant(t)
	ctx := context.Background()
	now := time.Now()

	const backlog = 8
	for i := range backlog {
		name := fmt.Sprintf("backlog-%02d.pdf", i)
		plant(t, client, name, asset.StatusDeleted,
			now.Add(-time.Duration(1000+i)*time.Hour), now.Add(-time.Duration(500+i)*time.Hour))
	}
	orphan := plant(t, client, "starved-pending.pdf", asset.StatusPending,
		now.Add(-40*time.Hour), now.Add(-40*time.Hour))

	rows, err := NewEntRows(client).Sweepable(ctx, now.Add(-24*time.Hour), backlog)
	if err != nil {
		t.Fatalf("Sweepable: %v", err)
	}

	for _, row := range rows {
		if row.ID == orphan {
			return
		}
	}
	t.Fatalf("a %d row scan behind a backlog of %d already-reaped soft deletes never reached the "+
		"orphaned pending row; the sweep that is supposed to find it can never run", backlog, backlog)
}

func TestTheScanItselfRefusesToHandOverAYoungPendingRow(t *testing.T) {
	client := liveTenant(t)
	ctx := context.Background()
	now := time.Now()

	young := plant(t, client, "scan-young-pending.pdf", asset.StatusPending,
		now.Add(-20*time.Hour), now.Add(-20*time.Hour))
	old := plant(t, client, "scan-old-pending.pdf", asset.StatusPending,
		now.Add(-40*time.Hour), now.Add(-40*time.Hour))

	rows, err := NewEntRows(client).Sweepable(ctx, now.Add(-24*time.Hour), DefaultLimit)
	if err != nil {
		t.Fatalf("Sweepable: %v", err)
	}

	var sawOld bool
	for _, row := range rows {
		if row.ID == young {
			t.Fatal("the scan handed over a pending row younger than the cutoff; the age " +
				"predicate is not in the query, and only the in-memory guard is holding")
		}
		if row.ID == old {
			sawOld = true
		}
	}
	if !sawOld {
		t.Fatal("the scan missed a pending row older than the cutoff, so the assertion above " +
			"would pass against a query that returns nothing")
	}
}
