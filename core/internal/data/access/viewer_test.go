package access

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

func viewerWithoutFixture(t *testing.T, missing string) {
	t.Helper()

	message := "the tenant database holds no " + missing + ", so nothing here checked that a teacher's " +
		"sections carry their grades. Seed the tenant, or set " + testsupport.RequireEnv +
		"=1 to make this a failure."

	switch strings.ToLower(strings.TrimSpace(os.Getenv(testsupport.RequireEnv))) {
	case "1", "true", "yes", "on":
		t.Fatal(message)
	}
	t.Skip(message)
}

func viewerCarriesID(args []any, id uuid.UUID) bool {
	for _, a := range args {
		switch v := a.(type) {
		case uuid.UUID:
			if v == id {
				return true
			}
		case string:
			if v == id.String() {
				return true
			}
		case []byte:
			if string(v) == id.String() {
				return true
			}
		}
	}
	return false
}

func TestSectionGradeIndexAsksPostgresOnceForEverySection(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)

	rows, err := db.Client.Section.Query().Limit(3).All(ctx)
	if err != nil {
		t.Fatalf("sections: %v", err)
	}
	if len(rows) == 0 {
		viewerWithoutFixture(t, "sections")
	}

	wanted := make([]uuid.UUID, 0, len(rows)+1)
	for _, row := range rows {
		wanted = append(wanted, row.ID)
	}
	absent := uuid.New()
	wanted = append(wanted, absent)

	db.Forget()
	index, err := sectionGradeIndex(ctx, db.Client, wanted)
	if err != nil {
		t.Fatalf("sectionGradeIndex: %v", err)
	}

	queries := db.QueriesOn("sections")
	if len(queries) != 1 {
		t.Fatalf("sectionGradeIndex issued %d queries on sections, want exactly 1; a per-section lookup "+
			"turns one round trip into one per section and every correctness assertion still passes", len(queries))
	}
	for _, id := range wanted {
		if !viewerCarriesID(queries[0].Args, id) {
			t.Fatalf("the single query does not carry %s; every section must be resolved by the same IN list", id)
		}
	}

	for _, row := range rows {
		grade, known := index[row.ID]
		if !known {
			t.Fatalf("section %s is absent from the index", row.ID)
		}
		if grade != row.GradeLevelID {
			t.Fatalf("section %s maps to %s, its own row carries %s", row.ID, grade, row.GradeLevelID)
		}
	}

	if grade, present := index[absent]; present {
		t.Fatalf("a section with no row is present in the index as %s; it must be absent, because absence "+
			"is what keeps the resolver refusing instead of emitting a partial scope set", grade)
	}
	if len(index) != len(rows) {
		t.Fatalf("the index holds %d entries for %d real sections: %v", len(index), len(rows), index)
	}
}

func TestResolveCarriesTheGradeOfEverySectionATeacherHolds(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)

	section, err := db.Client.Section.Query().
		Where(entsection.HasAcademicSessionWith(entsession.IsCurrent(true))).
		First(ctx)
	if err != nil {
		viewerWithoutFixture(t, "section in the current session")
	}

	teacher, err := db.Client.Teacher.Query().First(ctx)
	if err != nil {
		viewerWithoutFixture(t, "teacher")
	}
	staff, err := db.Client.Staff.Query().Where(entstaff.ID(teacher.StaffID)).Only(ctx)
	if err != nil {
		t.Fatalf("staff %s: %v", teacher.StaffID, err)
	}
	person, err := db.Client.Person.Query().Where(entperson.ID(staff.PersonID)).Only(ctx)
	if err != nil {
		t.Fatalf("person %s: %v", staff.PersonID, err)
	}
	if person.CasUserID == uuid.Nil {
		viewerWithoutFixture(t, "teacher whose person carries a CAS user id")
	}

	if _, err := db.Client.Section.UpdateOneID(section.ID).SetClassTeacherID(teacher.ID).Save(ctx); err != nil {
		t.Fatalf("could not make the teacher a class teacher of %s: %v", section.ID, err)
	}

	ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: db.Client})
	v, err := Resolve(ctx, &authorization.Subject{CASUserID: person.CasUserID}, false)
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	if len(v.SectionIDs) == 0 {
		t.Fatalf("the resolved viewer holds no sections, so the fixture proved nothing")
	}
	var holdsFixture bool
	for _, id := range v.SectionIDs {
		if id == section.ID {
			holdsFixture = true
		}
		grade, known := v.SectionGradeIDs[id]
		if !known {
			t.Fatalf("section %s has no grade on the resolved viewer; the resolver would refuse to build a "+
				"scope set for this teacher", id)
		}
		row, err := db.Client.Section.Get(ctx, id)
		if err != nil {
			t.Fatalf("section %s: %v", id, err)
		}
		if grade != row.GradeLevelID {
			t.Fatalf("section %s: the viewer says %s, the row says %s", id, grade, row.GradeLevelID)
		}
	}
	if !holdsFixture {
		t.Fatalf("the class-teacher section %s is not among the viewer's sections %v", section.ID, v.SectionIDs)
	}
	if len(v.SectionGradeIDs) != len(v.SectionIDs) {
		t.Fatalf("the viewer holds %d sections but %d grades: %v", len(v.SectionIDs), len(v.SectionGradeIDs), v.SectionGradeIDs)
	}
}
