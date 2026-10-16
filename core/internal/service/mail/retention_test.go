package mail

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/outboxmessage"
)

var purgeMoment = time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)

func ago(d time.Duration) time.Time { return purgeMoment.Add(-d) }

func stopped() func() time.Time { return func() time.Time { return purgeMoment } }

type fakeOutbox struct {
	rows      []PurgeRow
	scanErr   error
	scans     int
	cutoff    time.Time
	limit     int
	forgotten []uuid.UUID
	cutoffs   []time.Time
	forgetErr error
	missing   bool
}

func (f *fakeOutbox) Expired(_ context.Context, cutoff time.Time, limit int) ([]PurgeRow, error) {
	f.scans++
	f.cutoff = cutoff
	f.limit = limit
	return f.rows, f.scanErr
}

func (f *fakeOutbox) Forget(_ context.Context, id uuid.UUID, cutoff time.Time) (int, error) {
	f.forgotten = append(f.forgotten, id)
	f.cutoffs = append(f.cutoffs, cutoff)
	if f.forgetErr != nil {
		return 0, f.forgetErr
	}
	if f.missing {
		return 0, nil
	}
	return 1, nil
}

func settled(status outboxmessage.Status, since time.Duration) PurgeRow {
	done := ago(since)
	return PurgeRow{
		ID:          uuid.New(),
		Status:      string(status),
		TemplateKey: "fees.reminder",
		CreatedAt:   ago(since + 2*time.Hour),
		CompletedAt: &done,
	}
}

func queued(status outboxmessage.Status, since time.Duration) PurgeRow {
	return PurgeRow{
		ID:          uuid.New(),
		Status:      string(status),
		TemplateKey: "fees.reminder",
		CreatedAt:   ago(since),
	}
}

func purge(t *testing.T, rows PurgeRows, opts PurgeOptions) PurgeResult {
	t.Helper()
	if opts.Now == nil {
		opts.Now = stopped()
	}
	p, err := NewPurger(rows, opts)
	if err != nil {
		t.Fatalf("NewPurger: %v", err)
	}
	out, err := p.Run(context.Background())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return out
}

func finding(t *testing.T, out PurgeResult, id uuid.UUID) PurgeFinding {
	t.Helper()
	for _, f := range out.Findings {
		if f.MessageID == id {
			return f
		}
	}
	t.Fatalf("no finding was reported for %s", id)
	return PurgeFinding{}
}

func TestTheDefaultPurgeIsADryRunThatDeletesNothing(t *testing.T) {
	rows := &fakeOutbox{rows: []PurgeRow{
		settled(outboxmessage.StatusSent, 90*24*time.Hour),
		settled(outboxmessage.StatusFailed, 90*24*time.Hour),
	}}

	out := purge(t, rows, PurgeOptions{})

	if !out.DryRun {
		t.Fatal("a purger built without Destroy reported itself as destructive")
	}
	if len(rows.forgotten) != 0 {
		t.Fatalf("the default run deleted rows: %v", rows.forgotten)
	}
	if out.RowsRemoved != 0 {
		t.Fatalf("the default run reported %d rows removed", out.RowsRemoved)
	}
	if out.PlannedRemovals != 2 {
		t.Fatalf("the default run planned %d removals, wanted 2", out.PlannedRemovals)
	}
}

func TestTheDefaultWindowIsThirtyDays(t *testing.T) {
	if DefaultRetention != 30*24*time.Hour {
		t.Fatalf("the default retention is %s, and the decision was 30 days", DefaultRetention)
	}

	rows := &fakeOutbox{}
	out := purge(t, rows, PurgeOptions{})

	want := purgeMoment.Add(-30 * 24 * time.Hour)
	if !out.Cutoff.Equal(want) {
		t.Fatalf("the cutoff was %s, wanted %s", out.Cutoff, want)
	}
	if !rows.cutoff.Equal(want) {
		t.Fatalf("the scan was given cutoff %s, wanted %s", rows.cutoff, want)
	}
}

func TestAWindowUnderTheFloorIsRefusedBeforeAnythingIsScanned(t *testing.T) {
	rows := &fakeOutbox{rows: []PurgeRow{settled(outboxmessage.StatusSent, 90*24*time.Hour)}}

	_, err := NewPurger(rows, PurgeOptions{Retention: time.Hour, Destroy: true, Now: stopped()})
	if !errors.Is(err, ErrRetentionTooShort) {
		t.Fatalf("a one hour window was accepted, or refused for the wrong reason: %v", err)
	}
	if rows.scans != 0 {
		t.Fatalf("the refused purger still scanned %d times", rows.scans)
	}
	if len(rows.forgotten) != 0 {
		t.Fatalf("the refused purger still deleted rows: %v", rows.forgotten)
	}

	if _, _, err := ValidatePurge(PurgeOptions{Retention: MinimumRetention}); err != nil {
		t.Fatalf("the floor itself was refused: %v", err)
	}
	if _, _, err := ValidatePurge(PurgeOptions{Retention: MinimumRetention - time.Second}); !errors.Is(err, ErrRetentionTooShort) {
		t.Fatalf("a window one second under the floor was accepted: %v", err)
	}
}

func TestALimitOutsideTheCeilingIsRefused(t *testing.T) {
	if _, _, err := ValidatePurge(PurgeOptions{Limit: MaxPurgeLimit + 1}); !errors.Is(err, ErrPurgeLimit) {
		t.Fatal("a limit over the ceiling was accepted")
	}
	if _, _, err := ValidatePurge(PurgeOptions{Limit: -1}); !errors.Is(err, ErrPurgeLimit) {
		t.Fatal("a negative limit was accepted")
	}
	_, limit, err := ValidatePurge(PurgeOptions{})
	if err != nil || limit != DefaultPurgeLimit {
		t.Fatalf("the zero limit settled to %d (%v), wanted %d", limit, err, DefaultPurgeLimit)
	}
}

func TestNoPurgerWithoutARowSource(t *testing.T) {
	if _, err := NewPurger(nil, PurgeOptions{}); !errors.Is(err, ErrNoPurgeRows) {
		t.Fatal("a purger was built with no row source")
	}
}

func TestAMessageStillInFlightIsNeverPurgedAtAnyAge(t *testing.T) {
	pending := queued(outboxmessage.StatusPending, 400*24*time.Hour)
	retrying := queued(outboxmessage.StatusRetrying, 400*24*time.Hour)
	sending := queued(outboxmessage.StatusSending, 400*24*time.Hour)
	rows := &fakeOutbox{rows: []PurgeRow{pending, retrying, sending}}

	out := purge(t, rows, PurgeOptions{Destroy: true})

	if len(rows.forgotten) != 0 {
		t.Fatalf("mail still in flight was deleted: %v", rows.forgotten)
	}
	if out.Kept != 3 || out.PlannedRemovals != 0 {
		t.Fatalf("kept %d and planned %d removals, wanted 3 and 0", out.Kept, out.PlannedRemovals)
	}
	for _, row := range rows.rows {
		f := finding(t, out, row.ID)
		if f.Purge {
			t.Fatalf("a %s row was marked for purging", row.Status)
		}
		if !strings.Contains(f.Reason, row.Status) {
			t.Fatalf("the reason for keeping a %s row does not name its status: %s", row.Status, f.Reason)
		}
	}
}

func TestATerminalRowThatStillCarriesAPayloadIsKept(t *testing.T) {
	row := settled(outboxmessage.StatusSent, 90*24*time.Hour)
	row.HasPayload = true
	rows := &fakeOutbox{rows: []PurgeRow{row}}

	out := purge(t, rows, PurgeOptions{Destroy: true})

	if len(rows.forgotten) != 0 {
		t.Fatalf("a row holding a payload was deleted: %v", rows.forgotten)
	}
	if f := finding(t, out, row.ID); !strings.Contains(f.Reason, "payload") {
		t.Fatalf("the reason for keeping it does not mention the payload: %s", f.Reason)
	}
}

func TestARowInsideTheWindowIsKeptAndOneOutsideItIsNot(t *testing.T) {
	inside := settled(outboxmessage.StatusSent, 29*24*time.Hour)
	edge := settled(outboxmessage.StatusSent, 30*24*time.Hour)
	outside := settled(outboxmessage.StatusFailed, 31*24*time.Hour)
	rows := &fakeOutbox{rows: []PurgeRow{inside, edge, outside}}

	out := purge(t, rows, PurgeOptions{Destroy: true})

	if f := finding(t, out, inside.ID); f.Purge {
		t.Fatalf("a row 29 days old was purged under a 30 day window: %s", f.Reason)
	}
	if f := finding(t, out, edge.ID); !f.Purge {
		t.Fatalf("a row exactly 30 days old was kept: %s", f.Reason)
	}
	if f := finding(t, out, outside.ID); !f.Purge {
		t.Fatalf("a row 31 days old was kept: %s", f.Reason)
	}
	if out.RowsRemoved != 2 {
		t.Fatalf("removed %d rows, wanted 2", out.RowsRemoved)
	}
}

func TestAgeIsMeasuredFromCompletionNotFromCreation(t *testing.T) {
	late := ago(10 * 24 * time.Hour)
	slow := PurgeRow{
		ID:          uuid.New(),
		Status:      string(outboxmessage.StatusFailed),
		TemplateKey: "fees.reminder",
		CreatedAt:   ago(40 * 24 * time.Hour),
		CompletedAt: &late,
	}
	never := PurgeRow{
		ID:          uuid.New(),
		Status:      string(outboxmessage.StatusSent),
		TemplateKey: "fees.reminder",
		CreatedAt:   ago(40 * 24 * time.Hour),
	}
	rows := &fakeOutbox{rows: []PurgeRow{slow, never}}

	out := purge(t, rows, PurgeOptions{Destroy: true})

	if f := finding(t, out, slow.ID); f.Purge {
		t.Fatalf("a row created 40 days ago but only settled 10 days ago was purged: %s", f.Reason)
	}
	if f := finding(t, out, never.ID); !f.Purge {
		t.Fatalf("a terminal row with no completion stamp was not aged from creation: %s", f.Reason)
	}
}

func TestThePurgeCountsTheIdempotencyKeysItFrees(t *testing.T) {
	keyed := settled(outboxmessage.StatusSent, 90*24*time.Hour)
	keyed.HasKey = true
	bare := settled(outboxmessage.StatusSent, 90*24*time.Hour)
	rows := &fakeOutbox{rows: []PurgeRow{keyed, bare}}

	out := purge(t, rows, PurgeOptions{Destroy: true})

	if out.KeysFreed != 1 {
		t.Fatalf("freed %d idempotency keys, wanted 1", out.KeysFreed)
	}
	if f := finding(t, out, keyed.ID); !f.FreesKey {
		t.Fatal("the finding for a keyed row does not say its key is released")
	}
	if f := finding(t, out, bare.ID); f.FreesKey {
		t.Fatal("the finding for an unkeyed row claims to release a key")
	}
}

func TestTheDeleteIsGivenTheSameCutoffTheScanWas(t *testing.T) {
	rows := &fakeOutbox{rows: []PurgeRow{settled(outboxmessage.StatusSent, 90*24*time.Hour)}}

	out := purge(t, rows, PurgeOptions{Destroy: true})

	if len(rows.cutoffs) != 1 {
		t.Fatalf("the delete ran %d times, wanted once", len(rows.cutoffs))
	}
	if !rows.cutoffs[0].Equal(out.Cutoff) {
		t.Fatalf("the delete used cutoff %s, the scan used %s", rows.cutoffs[0], out.Cutoff)
	}
}

func TestADeleteThatMatchedNothingIsReportedRatherThanCountedAsDone(t *testing.T) {
	row := settled(outboxmessage.StatusSent, 90*24*time.Hour)
	rows := &fakeOutbox{rows: []PurgeRow{row}, missing: true}

	out := purge(t, rows, PurgeOptions{Destroy: true})

	if out.RowsRemoved != 0 {
		t.Fatalf("a delete that matched nothing counted %d rows removed", out.RowsRemoved)
	}
	if out.Failed != 1 {
		t.Fatalf("reported %d failures, wanted 1", out.Failed)
	}
	f := finding(t, out, row.ID)
	if !errors.Is(f.Err, ErrRowMoved) {
		t.Fatalf("the failure was %v, wanted it to name the row moving underneath", f.Err)
	}
	if f.Applied {
		t.Fatal("a delete that matched nothing was reported as applied")
	}
}

func TestAFailedDeleteDoesNotStopTheRest(t *testing.T) {
	rows := &fakeOutbox{
		rows:      []PurgeRow{settled(outboxmessage.StatusSent, 90*24*time.Hour)},
		forgetErr: errors.New("connection reset"),
	}

	out := purge(t, rows, PurgeOptions{Destroy: true})

	if out.Failed != 1 || out.RowsRemoved != 0 {
		t.Fatalf("failed %d and removed %d, wanted 1 and 0", out.Failed, out.RowsRemoved)
	}
}

func TestAScanFailureIsAnErrorNotAnEmptyPurge(t *testing.T) {
	rows := &fakeOutbox{scanErr: errors.New("connection reset")}
	p, err := NewPurger(rows, PurgeOptions{Destroy: true, Now: stopped()})
	if err != nil {
		t.Fatalf("NewPurger: %v", err)
	}
	if _, err := p.Run(context.Background()); err == nil {
		t.Fatal("a scan failure was reported as a clean run")
	}
}

type onlyMine struct {
	inner *EntOutbox
	mine  map[uuid.UUID]bool
}

func (o *onlyMine) Expired(ctx context.Context, cutoff time.Time, limit int) ([]PurgeRow, error) {
	rows, err := o.inner.Expired(ctx, cutoff, limit)
	if err != nil {
		return nil, err
	}
	out := make([]PurgeRow, 0, len(rows))
	for _, row := range rows {
		if o.mine[row.ID] {
			out = append(out, row)
		}
	}
	return out, nil
}

func (o *onlyMine) Forget(ctx context.Context, id uuid.UUID, cutoff time.Time) (int, error) {
	return o.inner.Forget(ctx, id, cutoff)
}

func plant(ctx context.Context, t *testing.T, f *fixture, schoolID uuid.UUID, status outboxmessage.Status, since time.Duration) uuid.UUID {
	t.Helper()

	created := time.Now().Add(-since - 2*time.Hour)
	create := f.Client.OutboxMessage.Create().
		SetSchoolID(schoolID).
		SetTemplateKey("mailpurge.live").
		SetRecipientHash(strings.Repeat("a", 64)).
		SetRecipientRedacted("p***@example.edu").
		SetStatus(status).
		SetCreatedAt(created).
		SetUpdatedAt(created).
		SetNextAttemptAt(created)
	if status == outboxmessage.StatusSent || status == outboxmessage.StatusFailed {
		create = create.SetCompletedAt(time.Now().Add(-since))
	}
	if status == outboxmessage.StatusFailed {
		create = create.SetFailureCode(outboxmessage.FailureCodeMailboxUnavailable)
	}

	row, err := create.Save(ctx)
	if err != nil {
		t.Fatalf("planting a %s row: %v", status, err)
	}
	f.discard(ctx, t, row.ID)
	return row.ID
}

func alive(ctx context.Context, t *testing.T, f *fixture, id uuid.UUID) bool {
	t.Helper()
	found, err := f.Client.OutboxMessage.Query().Where(outboxmessage.IDEQ(id)).Exist(ctx)
	if err != nil {
		t.Fatalf("looking for %s: %v", id, err)
	}
	return found
}

func liveRows(f *fixture, ids ...uuid.UUID) *onlyMine {
	mine := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		mine[id] = true
	}
	return &onlyMine{inner: NewEntOutbox(f.Client), mine: mine}
}

func TestTheLivePurgeDeletesSettledMailAndLeavesEverythingElse(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Mailpurge Live")

	sent := plant(ctx, t, f, school.ID, outboxmessage.StatusSent, 60*24*time.Hour)
	failed := plant(ctx, t, f, school.ID, outboxmessage.StatusFailed, 60*24*time.Hour)
	recent := plant(ctx, t, f, school.ID, outboxmessage.StatusSent, 2*24*time.Hour)
	pending := plant(ctx, t, f, school.ID, outboxmessage.StatusPending, 60*24*time.Hour)
	retrying := plant(ctx, t, f, school.ID, outboxmessage.StatusRetrying, 60*24*time.Hour)
	sending := plant(ctx, t, f, school.ID, outboxmessage.StatusSending, 60*24*time.Hour)

	rows := liveRows(f, sent, failed, recent, pending, retrying, sending)
	p, err := NewPurger(rows, PurgeOptions{Destroy: true})
	if err != nil {
		t.Fatalf("NewPurger: %v", err)
	}
	out, err := p.Run(ctx)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if blamed, ok := f.firstFault(); ok {
		t.Fatalf("a statement failed during the live purge: %s", blamed)
	}

	if out.Scanned != 2 {
		t.Fatalf("the scan returned %d of my rows, wanted only the two settled ones", out.Scanned)
	}
	if out.RowsRemoved != 2 || out.Failed != 0 {
		t.Fatalf("removed %d rows with %d failures, wanted 2 and 0", out.RowsRemoved, out.Failed)
	}

	for _, gone := range []uuid.UUID{sent, failed} {
		if alive(ctx, t, f, gone) {
			t.Fatalf("settled row %s survived the purge", gone)
		}
	}
	for name, id := range map[string]uuid.UUID{
		"a sent row inside the window": recent,
		"a pending row":                pending,
		"a retrying row":               retrying,
		"a leased sending row":         sending,
	} {
		if !alive(ctx, t, f, id) {
			t.Fatalf("%s was deleted", name)
		}
	}
}

func TestTheLiveDeleteRefusesARowThatIsNotTerminal(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Mailpurge Guard")

	store := NewEntOutbox(f.Client)
	cutoff := time.Now().Add(-DefaultRetention)

	for _, status := range []outboxmessage.Status{
		outboxmessage.StatusPending,
		outboxmessage.StatusRetrying,
		outboxmessage.StatusSending,
	} {
		id := plant(ctx, t, f, school.ID, status, 400*24*time.Hour)

		removed, err := store.Forget(ctx, id, cutoff)
		if err != nil {
			t.Fatalf("the delete of a %s row errored rather than matching nothing: %v", status, err)
		}
		if removed != 0 {
			t.Fatalf("the delete removed %d %s rows; mail in flight was lost", removed, status)
		}
		if !alive(ctx, t, f, id) {
			t.Fatalf("a %s row was deleted by a purge delete", status)
		}
	}
}

func TestTheLiveDeleteRefusesARowInsideTheWindow(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Mailpurge Window")

	id := plant(ctx, t, f, school.ID, outboxmessage.StatusSent, 2*24*time.Hour)

	removed, err := NewEntOutbox(f.Client).Forget(ctx, id, time.Now().Add(-DefaultRetention))
	if err != nil {
		t.Fatalf("the delete errored: %v", err)
	}
	if removed != 0 || !alive(ctx, t, f, id) {
		t.Fatalf("a row two days old was deleted under a 30 day window (removed %d)", removed)
	}
}

func TestTheLiveDryRunDeletesNothing(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Mailpurge Dry")

	sent := plant(ctx, t, f, school.ID, outboxmessage.StatusSent, 60*24*time.Hour)

	rows := liveRows(f, sent)
	p, err := NewPurger(rows, PurgeOptions{})
	if err != nil {
		t.Fatalf("NewPurger: %v", err)
	}
	f.forget()
	out, err := p.Run(ctx)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if !out.DryRun || out.PlannedRemovals != 1 || out.RowsRemoved != 0 {
		t.Fatalf("dry run %v planned %d removed %d", out.DryRun, out.PlannedRemovals, out.RowsRemoved)
	}
	if writes := f.execsOn("outbox_messages"); len(writes) != 0 {
		t.Fatalf("the dry run issued %d write statements against the outbox: %v", len(writes), writes)
	}
	if !alive(ctx, t, f, sent) {
		t.Fatal("the dry run deleted the row")
	}
}

func TestTheScanNeverCarriesRecipientDataIntoTheReport(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Mailpurge Quiet")

	sent := plant(ctx, t, f, school.ID, outboxmessage.StatusSent, 60*24*time.Hour)

	rows, err := liveRows(f, sent).Expired(ctx, time.Now().Add(-DefaultRetention), DefaultPurgeLimit)
	if err != nil {
		t.Fatalf("Expired: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("the scan returned %d rows, wanted 1", len(rows))
	}

	out := purge(t, &fakeOutbox{rows: rows}, PurgeOptions{Now: time.Now})

	printed := fmt.Sprintf("%+v", out.Findings)
	for _, secret := range []string{"p***@example.edu", strings.Repeat("a", 64)} {
		if strings.Contains(printed, secret) {
			t.Fatalf("a finding carries %q, and the purge report is the one place that must not repeat the trail", secret)
		}
	}
}
