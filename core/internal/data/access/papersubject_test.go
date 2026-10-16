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

func blueprintSQL(p predicate.Blueprint) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("blueprints"))
	p(sel)
	q, _ := sel.Query()
	return q
}

func questionSQL(p predicate.Question) string {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("questions"))
	p(sel)
	q, _ := sel.Query()
	return q
}

func subjectTeacher() (*Viewer, uuid.UUID, uuid.UUID) {
	subject, grade, offering := uuid.New(), uuid.New(), uuid.New()
	v := &Viewer{
		SubjectOfferingIDs:  []uuid.UUID{offering},
		TaughtSubjectGrades: []SubjectGrade{{SubjectID: subject, GradeLevelID: grade}},
		SubjectGradeByOffering: map[uuid.UUID]SubjectGrade{
			offering: {SubjectID: subject, GradeLevelID: grade},
		},
	}
	return v, subject, offering
}

func TestAPaperCarryingASubjectIsReachedOnlyThroughThatSubject(t *testing.T) {
	teacher, _, _ := subjectTeacher()

	got := paperSQL(PapersFor(teacher, reaching(authorization.ReachTeacherAssignment)))
	if !strings.Contains(got, `"papers"."subject_id" IS NULL`) {
		t.Fatalf("a paper naming no subject must keep the section reach it already had, got %s", got)
	}
	if !strings.Contains(got, `"papers"."subject_id" = `) {
		t.Fatalf("a paper naming a subject must be matched against the subject taught, got %s", got)
	}
}

func TestASectionWideAssignmentReachesNoSubjectAtAll(t *testing.T) {
	section := uuid.New()
	classTeacher := &Viewer{SectionIDs: []uuid.UUID{section}}

	got := paperSQL(PapersFor(classTeacher, reaching(authorization.ReachTeacherAssignment)))
	if !strings.Contains(got, `"papers"."subject_id" IS NULL`) {
		t.Fatalf("a section-wide assignment must still reach an untagged paper, got %s", got)
	}
	if strings.Contains(got, `"papers"."subject_id" = `) {
		t.Fatalf("an assignment carrying no subject_offering_id says nothing about subject "+
			"and must not stand in for every subject, got %s", got)
	}
}

func TestAPupilReachesATaggedPaperOnlyForASubjectTheyTake(t *testing.T) {
	subject, grade, offering := uuid.New(), uuid.New(), uuid.New()
	pupil := &Viewer{
		EnrolledOfferingIDs:  []uuid.UUID{offering},
		StudiedSubjectGrades: []SubjectGrade{{SubjectID: subject, GradeLevelID: grade}},
		SubjectGradeByOffering: map[uuid.UUID]SubjectGrade{
			offering: {SubjectID: subject, GradeLevelID: grade},
		},
	}

	got := paperSQL(PapersFor(pupil, reaching(authorization.ReachSelf)))
	if !strings.Contains(got, `"papers"."subject_id" = `) {
		t.Fatalf("a pupil must reach a tagged paper for a subject they take, got %s", got)
	}
	if strings.Contains(got, "paper_target_sections") {
		t.Fatalf("narrowing by subject must not hand a pupil the targeting reach, got %s", got)
	}
}

func TestASubjectPinTranslatesOntoThePapersOwnSubject(t *testing.T) {
	decision := reaching(authorization.ReachTenant)
	decision.Constraints = [][]authorization.Constraint{{
		{Field: "subject", Values: []string{"PHY"}},
	}}

	got := paperSQL(PapersFor(&Viewer{}, decision))
	if !strings.Contains(got, `"subjects"."code" IN`) {
		t.Fatalf("a pin carries a code, the way grade_level and section do, not an id; "+
			"a translator written against uuids matches nothing, got %s", got)
	}
	if strings.Contains(got, `"subjects"."id" IN`) {
		t.Fatalf("the pin value must never be compared against the subject's id, got %s", got)
	}
	if !strings.Contains(got, `"papers"."subject_id" = "subjects"."id"`) {
		t.Fatalf("the code must be resolved to the paper's own subject id through the edge, "+
			"not stored on papers, got %s", got)
	}
	if strings.Contains(got, "grade_levels") {
		t.Fatalf("a subject pin is not a class pin and must not widen into one, got %s", got)
	}
}

func TestASubjectPinWithNoValueYieldsNoRows(t *testing.T) {
	decision := reaching(authorization.ReachTenant)
	decision.Constraints = [][]authorization.Constraint{{{Field: "subject"}}}

	if got := paperSQL(PapersFor(&Viewer{}, decision)); !strings.Contains(got, "FALSE") {
		t.Fatalf("a pin this service cannot translate yields no rows, never every row, got %s", got)
	}
}

func TestASubjectPinNarrowsABlueprintAndAQuestion(t *testing.T) {
	decision := reaching(authorization.ReachTenant)
	decision.Constraints = [][]authorization.Constraint{{
		{Field: "subject", Values: []string{"PHY"}},
	}}

	blueprints := blueprintSQL(BlueprintsFor(&Viewer{}, decision))
	if !strings.Contains(blueprints, `"blueprints"."subject_id"`) {
		t.Fatalf("a subject pin must narrow a blueprint by its own subject, got %s", blueprints)
	}
	questions := questionSQL(QuestionsFor(&Viewer{}, decision))
	if !strings.Contains(questions, `"questions"."subject_id"`) {
		t.Fatalf("a subject pin must narrow a question by its own subject, got %s", questions)
	}
}

func TestASubjectAndGradePinNarrowBothAtOnce(t *testing.T) {
	decision := reaching(authorization.ReachTenant)
	decision.Constraints = [][]authorization.Constraint{{
		{Field: "subject", Values: []string{"PHY"}},
		{Field: "grade_level", Values: []string{"G8"}},
	}}

	got := paperSQL(PapersFor(&Viewer{}, decision))
	if !strings.Contains(got, `"papers"."subject_id"`) {
		t.Fatalf("the subject half of the pin must survive, got %s", got)
	}
	if !strings.Contains(got, "grade_levels") {
		t.Fatalf("the class half of the pin must survive, got %s", got)
	}
}
