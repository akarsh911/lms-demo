package timetablegen

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type contactFixture struct {
	ctx       context.Context
	db        *tenantent.Client
	export    *Export
	sectionID uuid.UUID
	teacherID uuid.UUID
	offering  uuid.UUID
}

func aSectionWhoseTeacherHoldsASubject(t *testing.T) *contactFixture {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t).Client

	held, err := db.TeacherAssignment.Query().
		Where(
			entteacherassign.SubjectOfferingIDNotNil(),
			entteacherassign.StatusEQ(entteacherassign.StatusActive),
		).
		Order(tenantent.Asc(entteacherassign.FieldID)).
		First(ctx)
	if err != nil {
		t.Skip("this tenant has no teacher holding a named subject offering, so there " +
			"is no class teacher to resolve; run cmd/seeddemo first")
	}

	if err := db.Section.UpdateOneID(held.SectionID).
		SetClassTeacherID(held.TeacherID).Exec(ctx); err != nil {
		t.Fatalf("making that teacher the class teacher: %v", err)
	}

	offerings, err := db.SubjectOffering.Query().
		Where(
			entoffering.SectionID(held.SectionID),
			entoffering.StatusEQ(entoffering.StatusActive),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("loading the section's offerings: %v", err)
	}

	export := &Export{}
	export.School.Sections = []Section{{ID: held.SectionID.String(), Code: "probe"}}
	for _, offering := range offerings {
		export.School.Offerings = append(export.School.Offerings, Offering{
			ID: offering.ID.String(), SectionID: held.SectionID.String(),
		})
	}

	return &contactFixture{
		ctx: ctx, db: db, export: export,
		sectionID: held.SectionID, teacherID: held.TeacherID,
		offering: *held.SubjectOfferingID,
	}
}

func (f *contactFixture) resolve(t *testing.T) []DailyContact {
	t.Helper()

	rules := []shared.DailyContactRule{{SectionID: f.sectionID.String(), ClassTeacher: true}}
	out, err := resolveDailyContact(f.ctx, f.db, f.export, rules)
	if err != nil {
		t.Fatalf("resolving the class teacher's subjects: %v", err)
	}
	return out
}

func TestTheClassTeacherIsReadFromTheSectionAndTurnedIntoOfferings(t *testing.T) {
	fixture := aSectionWhoseTeacherHoldsASubject(t)

	resolved := fixture.resolve(t)
	if len(resolved) != 1 {
		t.Fatalf("wanted one rule, got %d; warnings %v",
			len(resolved), fixture.export.Warnings)
	}
	if !contains(resolved[0].OfferingIDs, fixture.offering.String()) {
		t.Fatalf("the subject the class teacher actually holds is missing from %v",
			resolved[0].OfferingIDs)
	}

	for _, id := range resolved[0].OfferingIDs {
		offering := uuid.MustParse(id)
		count, err := fixture.db.TeacherAssignment.Query().
			Where(
				entteacherassign.SubjectOfferingID(offering),
				entteacherassign.TeacherID(fixture.teacherID),
				entteacherassign.StatusEQ(entteacherassign.StatusActive),
			).
			Count(fixture.ctx)
		if err != nil {
			t.Fatalf("checking %s back against the table: %v", id, err)
		}
		if count == 0 {
			t.Fatalf("%s is in the rule but this teacher does not hold it", id)
		}
	}
}

func TestASectionWideAssignmentInTheTableAddsNoSubjectToTheRule(t *testing.T) {
	fixture := aSectionWhoseTeacherHoldsASubject(t)
	before := fixture.resolve(t)

	session, err := fixture.db.Section.Get(fixture.ctx, fixture.sectionID)
	if err != nil {
		t.Fatalf("loading the section: %v", err)
	}
	if err := fixture.db.TeacherAssignment.Create().
		SetAcademicSessionID(session.AcademicSessionID).
		SetTeacherID(fixture.teacherID).
		SetSectionID(fixture.sectionID).
		SetRoleType("class_teacher").
		SetStatus(entteacherassign.StatusActive).
		Exec(fixture.ctx); err != nil {
		t.Fatalf("recording a section-wide assignment: %v", err)
	}

	fixture.export.Warnings = nil
	after := fixture.resolve(t)

	if len(after) != len(before) {
		t.Fatalf("a section-wide row changed how many rules came back: %d then %d",
			len(before), len(after))
	}
	if len(after) == 1 && len(after[0].OfferingIDs) != len(before[0].OfferingIDs) {
		t.Fatalf("a row naming no subject offering was read as one: %v then %v",
			before[0].OfferingIDs, after[0].OfferingIDs)
	}
}

func TestASectionWithNoClassTeacherResolvesToNoRuleAndSaysWhy(t *testing.T) {
	fixture := aSectionWhoseTeacherHoldsASubject(t)

	if err := fixture.db.Section.UpdateOneID(fixture.sectionID).
		ClearClassTeacherID().Exec(fixture.ctx); err != nil {
		t.Fatalf("clearing the class teacher: %v", err)
	}

	if resolved := fixture.resolve(t); len(resolved) != 0 {
		t.Fatalf("wanted no rule, got %v", resolved)
	}
	if !warned(fixture.export.Warnings, "no class teacher recorded") {
		t.Fatalf("the run gave no reason: %v", fixture.export.Warnings)
	}
}

func TestARunResolvesTheClassTeacherBeforeTheSolverIsAsked(t *testing.T) {
	school := seededSchool(t)
	draft := school.newDraft(t)

	held, err := school.db.TeacherAssignment.Query().
		Where(
			entteacherassign.SubjectOfferingIDNotNil(),
			entteacherassign.StatusEQ(entteacherassign.StatusActive),
			entteacherassign.HasSectionWith(entsection.BranchID(school.scheme.BranchID)),
		).
		Order(tenantent.Asc(entteacherassign.FieldID)).
		First(school.ctx)
	if err != nil {
		t.Skip("this branch has no teacher holding a named subject offering; " +
			"run cmd/seeddemo first")
	}
	if err := school.db.Section.UpdateOneID(held.SectionID).
		SetClassTeacherID(held.TeacherID).Exec(school.ctx); err != nil {
		t.Fatalf("making that teacher the class teacher: %v", err)
	}

	fake := newFakeSolver(t, func(in Request) (int, Answer) {
		return http.StatusOK, solved(echoed(in))
	})
	job := school.job(t, draft, shared.GenerationOptions{
		DailyContact: []shared.DailyContactRule{
			{SectionID: held.SectionID.String(), ClassTeacher: true},
		},
	})
	if err := fake.runner(t).Execute(school.ctx, school.db, job.ID); err != nil {
		t.Fatalf("executing the job: %v", err)
	}
	if len(fake.seen) == 0 {
		t.Fatal("the solver was never called")
	}

	sent := fake.seen[0].Config.DailyContact
	if len(sent) != 1 {
		t.Fatalf("wanted one resolved rule in the request, got %d; job warnings %v",
			len(sent), school.reload(t, job).Warnings)
	}
	if sent[0].SectionID != held.SectionID.String() {
		t.Fatalf("the rule names section %s rather than %s",
			sent[0].SectionID, held.SectionID)
	}
	if sent[0].MinPerDay != 1 {
		t.Fatalf("wanted a floor of one lesson a day, got %d", sent[0].MinPerDay)
	}
	if !contains(sent[0].OfferingIDs, held.SubjectOfferingID.String()) {
		t.Fatalf("the class teacher's own subject %s never reached the solver: %v",
			held.SubjectOfferingID, sent[0].OfferingIDs)
	}
	for _, id := range sent[0].OfferingIDs {
		if _, err := uuid.Parse(id); err != nil {
			t.Fatalf("the request carries %q, which is not an offering id", id)
		}
	}
}
