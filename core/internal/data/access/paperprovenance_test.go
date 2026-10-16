package access

import (
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
)

func paperSQL(p predicate.Paper) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("papers"))
	p(sel)
	q, _ := sel.Query()
	return q
}

func sectionSQL(p predicate.Section) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("sections"))
	p(sel)
	q, _ := sel.Query()
	return q
}

func gradeSQL(p predicate.GradeLevel) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("grade_levels"))
	p(sel)
	q, _ := sel.Query()
	return q
}

func reaching(reach authorization.Reach) authorization.Decision {
	return authorization.Decision{Allowed: true, Reach: reach, HasReach: true}
}

func TestATaughtSectionReachesAPaperTargetedAtIt(t *testing.T) {
	offering := uuid.New()
	teacher := &Viewer{SubjectOfferingIDs: []uuid.UUID{offering}}

	got := paperSQL(PapersFor(teacher, reaching(authorization.ReachTeacherAssignment)))
	if !strings.Contains(got, "paper_target_sections") {
		t.Fatalf("a teacher must reach a paper through its target sections, got %s", got)
	}
}

func TestAPupilDoesNotReachAPaperMerelyTargetedAtTheirSection(t *testing.T) {
	offering := uuid.New()
	pupil := &Viewer{EnrolledOfferingIDs: []uuid.UUID{offering}}

	got := paperSQL(PapersFor(pupil, reaching(authorization.ReachSelf)))
	if strings.Contains(got, "paper_target_sections") {
		t.Fatalf("targeting is a teaching reach only; a pupil must not borrow it, got %s", got)
	}
	if !strings.Contains(strings.ToUpper(got), "WHERE") {
		t.Fatalf("a pupil's reach must still be narrowed, got %s", got)
	}
}

func TestAGuardianDoesNotReachAPaperMerelyTargetedAtAWardsSection(t *testing.T) {
	guardian := uuid.New()
	offering := uuid.New()
	viewer := &Viewer{GuardianID: &guardian, WardOfferingIDs: []uuid.UUID{offering}}

	got := paperSQL(PapersFor(viewer, reaching(authorization.ReachGuardianWard)))
	if strings.Contains(got, "paper_target_sections") {
		t.Fatalf("a guardian must not reach a paper through targeting, got %s", got)
	}
}

func TestAPinnedGradeNarrowsAClassAnchoredPaper(t *testing.T) {
	decision := reaching(authorization.ReachTenant)
	decision.Constraints = [][]authorization.Constraint{{
		{Field: "grade_level", Values: []string{"G8"}},
	}}

	got := paperSQL(PapersFor(&Viewer{}, decision))
	if !strings.Contains(got, "grade_levels") {
		t.Fatalf("a grade pin must translate onto the paper's own class, got %s", got)
	}
	if !strings.Contains(got, "paper_target_sections") {
		t.Fatalf("a grade pin must also translate onto the paper's target sections, got %s", got)
	}
}

func TestAViewerWithNoTeachingReachWritesNoSectionOrClass(t *testing.T) {
	pupil := &Viewer{EnrolledOfferingIDs: []uuid.UUID{uuid.New()}}
	decision := reaching(authorization.ReachSelf)

	if got := sectionSQL(SectionsWritableForPapers(pupil, decision)); !strings.Contains(got, "FALSE") {
		t.Fatalf("a pupil may target no section, got %s", got)
	}
	if got := gradeSQL(GradeLevelsWritableForPapers(pupil, decision)); !strings.Contains(got, "FALSE") {
		t.Fatalf("a pupil may target no class, got %s", got)
	}
}

func TestNoViewerWritesNoSectionOrClass(t *testing.T) {
	decision := reaching(authorization.ReachTenant)

	if got := sectionSQL(SectionsWritableForPapers(nil, decision)); !strings.Contains(got, "FALSE") {
		t.Fatalf("an unresolved viewer may target no section, got %s", got)
	}
	if got := gradeSQL(GradeLevelsWritableForPapers(nil, decision)); !strings.Contains(got, "FALSE") {
		t.Fatalf("an unresolved viewer may target no class, got %s", got)
	}
}
