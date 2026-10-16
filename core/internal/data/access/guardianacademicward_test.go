package access

import (
	"context"
	"testing"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entsubjenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type wardGateFixture struct {
	client   *tenantent.Client
	guardian uuid.UUID
	link     uuid.UUID
	offering uuid.UUID
}

func wardGateSeed(ctx context.Context, t *testing.T) wardGateFixture {
	t.Helper()

	db := testsupport.TenantTx(ctx, t)

	enrolment, err := db.Client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenrollment.StatusEQ(entsubjenrollment.StatusActive),
			entsubjenrollment.HasAcademicSessionWith(entsession.IsCurrent(true)),
		).
		First(ctx)
	if err != nil {
		viewerWithoutFixture(t, "active subject enrolment in the current academic session")
	}

	tag := uuid.NewString()[:8]
	person, err := db.Client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Ward").
		SetDisplayName("Ward Gate Guardian " + tag).
		Save(ctx)
	if err != nil {
		t.Fatalf("guardian person: %v", err)
	}
	guardian, err := db.Client.Guardian.Create().
		SetPersonID(person.ID).
		Save(ctx)
	if err != nil {
		t.Fatalf("guardian: %v", err)
	}

	link, err := db.Client.StudentGuardian.Create().
		SetStudentID(enrolment.StudentID).
		SetGuardianID(guardian.ID).
		SetRelationshipType("ward gate test").
		Save(ctx)
	if err != nil {
		t.Fatalf("guardian link: %v", err)
	}

	return wardGateFixture{
		client:   db.Client,
		guardian: guardian.ID,
		link:     link.ID,
		offering: enrolment.SubjectOfferingID,
	}
}

func (f wardGateFixture) wardOfferings(ctx context.Context, t *testing.T, academic bool) []uuid.UUID {
	t.Helper()

	if err := f.client.StudentGuardian.UpdateOneID(f.link).
		SetCanViewAcademic(academic).
		Exec(ctx); err != nil {
		t.Fatalf("set can_view_academic=%v: %v", academic, err)
	}

	guardian := f.guardian
	_, ward, err := enrolledScope(ctx, f.client, &Viewer{GuardianID: &guardian})
	if err != nil {
		t.Fatalf("enrolledScope: %v", err)
	}
	return ward
}

func containsOffering(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func TestWardOfferingsVanishWhenAcademicAccessIsWithdrawn(t *testing.T) {
	ctx := context.Background()
	f := wardGateSeed(ctx, t)

	permitted := f.wardOfferings(ctx, t, true)
	if len(permitted) == 0 {
		t.Fatalf("the guardian carries no ward offerings even with can_view_academic=true, so this test proves nothing")
	}
	if !containsOffering(permitted, f.offering) {
		t.Fatalf("the guardian carries %v, which lacks the ward's offering %s", permitted, f.offering)
	}

	withdrawn := f.wardOfferings(ctx, t, false)
	if len(withdrawn) != 0 {
		t.Fatalf("a guardian barred from academic records still carries %d ward offerings %v; "+
			"the elective set stays readable through every consumer of WardOfferingIDs, "+
			"which is library listing, retrieval labels and the timetable",
			len(withdrawn), withdrawn)
	}
}
