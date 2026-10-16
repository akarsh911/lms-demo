package http

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbell "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellschedule"
	entbellperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellscheduleperiod"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entschemegrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodschemegradelevel"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type schemeWorld struct {
	ctx    context.Context
	client *tenantent.Client
	tx     *tenantent.Tx

	session uuid.UUID
	branch  uuid.UUID
	scheme  *tenantent.PeriodScheme

	assembly uuid.UUID
	lesson   uuid.UUID
	bell     uuid.UUID

	gradeIX uuid.UUID
	gradeX  uuid.UUID
}

func newSchemeWorld(t *testing.T) *schemeWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	session := client.AcademicSession.Create().
		SetName("Clone Probe " + tag).
		SetCode("CLP-" + tag).
		SetStartDate(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2027, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SetStatus("active").
		SaveX(ctx).ID

	branch := client.Branch.Create().
		SetName("Clone Campus " + tag).
		SetCode("CLC-" + tag).
		SaveX(ctx).ID

	scheme := client.PeriodScheme.Create().
		SetAcademicSessionID(session).
		SetBranchID(branch).
		SetName("Junior Scheme " + tag).
		SetCode("JUN-" + tag).
		SaveX(ctx)

	assembly := client.Period.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("Assembly").
		SetCode("ASM-" + tag).
		SetSequence(1).
		SetKind(entperiod.KindAssembly).
		SaveX(ctx).ID
	lesson := client.Period.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("Period 1").
		SetCode("P1-" + tag).
		SetSequence(2).
		SaveX(ctx).ID

	bell := client.BellSchedule.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("Special, no assembly").
		SetCode("SPC-" + tag).
		SaveX(ctx).ID

	client.BellSchedulePeriod.Create().
		SetBellScheduleID(bell).
		SetPeriodID(assembly).
		SetStartMinute(480).
		SetEndMinute(495).
		SetRuns(false).
		SaveX(ctx)
	client.BellSchedulePeriod.Create().
		SetBellScheduleID(bell).
		SetPeriodID(lesson).
		SetStartMinute(495).
		SetEndMinute(535).
		SaveX(ctx)

	gradeIX := client.GradeLevel.Create().
		SetName("IX").SetCode("IX-" + tag).SetSequence(9).SaveX(ctx).ID
	gradeX := client.GradeLevel.Create().
		SetName("X").SetCode("X-" + tag).SetSequence(10).SaveX(ctx).ID

	return &schemeWorld{
		ctx: ctx, client: client, tx: db.Tx,
		session: session, branch: branch, scheme: scheme,
		assembly: assembly, lesson: lesson, bell: bell,
		gradeIX: gradeIX, gradeX: gradeX,
	}
}

func TestCloningASchemeCarriesTheSuppressedPeriodsWithIt(t *testing.T) {
	w := newSchemeWorld(t)

	clone, err := copySchemeInTx(w.ctx, w.tx, w.scheme, "Senior Scheme", "SEN-CLONE", nil)
	if err != nil {
		t.Fatalf("clone: %v", err)
	}
	if clone.ID == w.scheme.ID {
		t.Fatalf("the clone is the same row as the source")
	}

	periods, err := w.client.Period.Query().
		Where(entperiod.PeriodSchemeID(clone.ID)).All(w.ctx)
	if err != nil {
		t.Fatalf("periods: %v", err)
	}
	if len(periods) != 2 {
		t.Fatalf("the clone carries %d periods, not 2", len(periods))
	}

	bells, err := w.client.BellSchedule.Query().
		Where(entbell.PeriodSchemeID(clone.ID)).All(w.ctx)
	if err != nil {
		t.Fatalf("bells: %v", err)
	}
	if len(bells) != 1 {
		t.Fatalf("the clone carries %d bell schedules, not 1", len(bells))
	}

	spans, err := w.client.BellSchedulePeriod.Query().
		Where(entbellperiod.BellScheduleID(bells[0].ID)).All(w.ctx)
	if err != nil {
		t.Fatalf("spans: %v", err)
	}
	if len(spans) != 2 {
		t.Fatalf("the clone carries %d bell rows, not 2", len(spans))
	}

	suppressed := 0
	for _, span := range spans {
		if !span.Runs {
			suppressed++
		}
	}
	if suppressed != 1 {
		t.Fatalf("the clone carries %d suppressed periods, not 1; a copied week would ring an assembly the original had dropped", suppressed)
	}
}

func TestACloneNeverBorrowsTheSourcesOwnPeriodRows(t *testing.T) {
	w := newSchemeWorld(t)

	clone, err := copySchemeInTx(w.ctx, w.tx, w.scheme, "Senior Scheme", "SEN-CLONE2", nil)
	if err != nil {
		t.Fatalf("clone: %v", err)
	}

	bells, err := w.client.BellSchedule.Query().
		Where(entbell.PeriodSchemeID(clone.ID)).All(w.ctx)
	if err != nil {
		t.Fatalf("bells: %v", err)
	}
	spans, err := w.client.BellSchedulePeriod.Query().
		Where(entbellperiod.BellScheduleID(bells[0].ID)).All(w.ctx)
	if err != nil {
		t.Fatalf("spans: %v", err)
	}
	for _, span := range spans {
		if span.PeriodID == w.assembly || span.PeriodID == w.lesson {
			t.Fatalf("a cloned bell row still points at the source scheme's period; editing the copy would re-time the original")
		}
	}
}

func TestCloningAttachesTheGradesItWasGiven(t *testing.T) {
	w := newSchemeWorld(t)

	clone, err := copySchemeInTx(w.ctx, w.tx, w.scheme, "Senior Scheme", "SEN-CLONE3",
		[]uuid.UUID{w.gradeIX, w.gradeX})
	if err != nil {
		t.Fatalf("clone: %v", err)
	}

	n, err := w.client.PeriodSchemeGradeLevel.Query().
		Where(entschemegrade.PeriodSchemeID(clone.ID)).Count(w.ctx)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 2 {
		t.Fatalf("the clone serves %d grade levels, not 2", n)
	}
}

func TestAGradeLevelCannotRunTwoSchemesOnOneCampus(t *testing.T) {
	w := newSchemeWorld(t)

	if _, err := linkSchemeGrades(w.ctx, w.client, w.scheme, []uuid.UUID{w.gradeIX}); err != nil {
		t.Fatalf("first attach: %v", err)
	}

	other, err := copySchemeInTx(w.ctx, w.tx, w.scheme, "Rival Scheme", "RIV-CLONE", nil)
	if err != nil {
		t.Fatalf("clone: %v", err)
	}

	if _, err := linkSchemeGrades(w.ctx, w.client, other, []uuid.UUID{w.gradeIX}); err == nil {
		t.Fatalf("a grade level was attached to two period schemes on one campus, so a year group runs two bell schedules at once")
	}
}

func TestAttachingTheSameGradeTwiceIsNotAnError(t *testing.T) {
	w := newSchemeWorld(t)

	first, err := linkSchemeGrades(w.ctx, w.client, w.scheme, []uuid.UUID{w.gradeIX, w.gradeX})
	if err != nil {
		t.Fatalf("first attach: %v", err)
	}
	if first != 2 {
		t.Fatalf("attached %d grades, not 2", first)
	}

	again, err := linkSchemeGrades(w.ctx, w.client, w.scheme, []uuid.UUID{w.gradeIX, w.gradeX})
	if err != nil {
		t.Fatalf("second attach: %v", err)
	}
	if again != 0 {
		t.Fatalf("re-attaching the same grades created %d more rows", again)
	}
}
