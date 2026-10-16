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

func awardRenders(p predicate.StudentAchievement) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("student_achievements"))
	p(sel)
	return sel.Query()
}

func praiseRenders(p predicate.Praise) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("praises"))
	p(sel)
	return sel.Query()
}

func reactionRenders(p predicate.PraiseReaction) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("praise_reactions"))
	p(sel)
	return sel.Query()
}

func teachingViewer(section, offering uuid.UUID) *Viewer {
	teacher := uuid.New()
	person := uuid.New()
	return &Viewer{
		PersonID:           &person,
		TeacherID:          &teacher,
		SectionIDs:         []uuid.UUID{section},
		SubjectOfferingIDs: []uuid.UUID{offering},
	}
}

func pupilViewer(student uuid.UUID) *Viewer {
	person := uuid.New()
	return &Viewer{PersonID: &person, StudentIDs: []uuid.UUID{student}}
}

func tenantDecision() authorization.Decision {
	return authorization.Decision{Allowed: true, HasReach: true, Reach: authorization.ReachTenant}
}

func teacherDecision() authorization.Decision {
	return authorization.Decision{
		Allowed:  true,
		HasReach: true,
		Reach:    authorization.ReachTeacherAssignment,
	}
}

func selfDecision() authorization.Decision {
	return authorization.Decision{Allowed: true, HasReach: true, Reach: authorization.ReachSelf}
}

func TestStudentAchievementReadFollowsTheStudentEdge(t *testing.T) {
	nothing, _ := awardRenders(NoStudentAchievement())

	t.Run("a nil viewer matches nothing", func(t *testing.T) {
		if got, _ := awardRenders(StudentAchievementsFor(nil, tenantDecision())); got != nothing {
			t.Fatalf("expected the deny predicate, got %q", got)
		}
	})

	t.Run("an unrestricted viewer matches every row", func(t *testing.T) {
		v := &Viewer{Unrestricted: true}
		got, _ := awardRenders(StudentAchievementsFor(v, authorization.Decision{}))
		if strings.Contains(strings.ToUpper(got), "WHERE") {
			t.Fatalf("expected an unfiltered query, got %q", got)
		}
	})

	t.Run("a pupil at self reach is narrowed to their own id", func(t *testing.T) {
		student := uuid.New()
		got, args := awardRenders(StudentAchievementsFor(pupilViewer(student), selfDecision()))
		if !strings.Contains(got, "students") {
			t.Fatalf("expected a join through students, got %q", got)
		}
		if !carriesArg(args, student) {
			t.Fatalf("the pupil's own id is not bound: %v", args)
		}
	})

	t.Run("an unknown reach matches nothing", func(t *testing.T) {
		v := pupilViewer(uuid.New())
		d := authorization.Decision{Allowed: true, HasReach: true, Reach: authorization.Reach("wat")}
		got, args := awardRenders(StudentAchievementsFor(v, d))
		if !strings.Contains(got, "FALSE") || len(args) != 0 {
			t.Fatalf("an unresolvable reach must fail closed, got %q with %v", got, args)
		}
	})
}

func TestAPupilCannotAwardThemselves(t *testing.T) {
	student := uuid.New()
	v := pupilViewer(student)

	t.Run("at self reach the awardable set is empty", func(t *testing.T) {
		got, _ := awardRenders(StudentAchievementsAwardableBy(v, selfDecision()))
		if !strings.Contains(got, "FALSE") {
			t.Fatalf("a pupil at self reach must reach no awardable row, got %q", got)
		}
	})

	t.Run("at tenant reach their own id is still subtracted", func(t *testing.T) {
		got, args := awardRenders(StudentAchievementsAwardableBy(v, tenantDecision()))
		if !strings.Contains(strings.ToUpper(got), "NOT") {
			t.Fatalf("the kin subtraction is missing from %q", got)
		}
		if !carriesArg(args, student) {
			t.Fatalf("the pupil's own id is not subtracted: %v", args)
		}
	})

	t.Run("an unrestricted pupil is still subtracted", func(t *testing.T) {
		wide := pupilViewer(student)
		wide.Unrestricted = true
		got, args := awardRenders(StudentAchievementsAwardableBy(wide, authorization.Decision{}))
		if !strings.Contains(strings.ToUpper(got), "NOT") {
			t.Fatalf("an unrestricted grant must not remove the kin subtraction, got %q", got)
		}
		if !carriesArg(args, student) {
			t.Fatalf("the pupil's own id is not subtracted: %v", args)
		}
	})

	t.Run("a guardian's ward is subtracted too", func(t *testing.T) {
		guardian := uuid.New()
		v := &Viewer{GuardianID: &guardian, Unrestricted: true}
		got, _ := awardRenders(StudentAchievementsAwardableBy(v, authorization.Decision{}))
		if !strings.Contains(strings.ToUpper(got), "NOT") {
			t.Fatalf("a guardian's wards must be subtracted, got %q", got)
		}
		if !strings.Contains(got, "student_guardians") {
			t.Fatalf("the subtraction must walk the guardian link, got %q", got)
		}
	})
}

func TestShowcaseAdmitsTheCallersOwnAwardsAndNothingElse(t *testing.T) {
	student := uuid.New()
	v := pupilViewer(student)

	t.Run("a pupil may feature their own award at self reach", func(t *testing.T) {
		got, args := awardRenders(StudentAchievementsShowcasableBy(v, selfDecision()))
		if !strings.Contains(got, "student_id") {
			t.Fatalf("the pupil's own rows must be admitted by student_id, got %q", got)
		}
		if !carriesArg(args, student) {
			t.Fatalf("the pupil's own id is not bound: %v", args)
		}
	})

	t.Run("a teacher may feature an award they could have made", func(t *testing.T) {
		section, offering := uuid.New(), uuid.New()
		got, args := awardRenders(
			StudentAchievementsShowcasableBy(teachingViewer(section, offering), teacherDecision()))
		if !strings.Contains(got, "students") {
			t.Fatalf("expected a join through students, got %q", got)
		}
		if !carriesArg(args, section) && !carriesArg(args, offering) {
			t.Fatalf("the teacher's reach is not bound: %v", args)
		}
	})

	t.Run("a stranger reaches nothing", func(t *testing.T) {
		person := uuid.New()
		stranger := &Viewer{PersonID: &person}
		got, args := awardRenders(StudentAchievementsShowcasableBy(stranger, selfDecision()))
		if !strings.Contains(got, "FALSE") || len(args) != 0 {
			t.Fatalf("a viewer with no role must fail closed, got %q with %v", got, args)
		}
	})
}

func TestPraiseReadNarrowsToTheResolvedReach(t *testing.T) {
	nothing, _ := praiseRenders(NoPraise())

	t.Run("a nil reach matches nothing", func(t *testing.T) {
		if got, _ := praiseRenders(PraisesFor(nil)); got != nothing {
			t.Fatalf("expected the deny predicate, got %q", got)
		}
	})

	t.Run("an empty reach matches nothing", func(t *testing.T) {
		if got, _ := praiseRenders(PraisesFor(DenyRecognition())); got != nothing {
			t.Fatalf("expected the deny predicate, got %q", got)
		}
	})

	t.Run("a tenant reach matches every row", func(t *testing.T) {
		got, _ := praiseRenders(PraisesFor(&Recognition{AllStudents: true, AllStaff: true}))
		if strings.Contains(strings.ToUpper(got), "WHERE") {
			t.Fatalf("expected an unfiltered query, got %q", got)
		}
	})

	t.Run("a removed praise is hidden from a narrowed reader", func(t *testing.T) {
		pupil := uuid.New()
		got, args := praiseRenders(PraisesFor(&Recognition{SelfStudents: []uuid.UUID{pupil}}))
		if !strings.Contains(got, "status") {
			t.Fatalf("the removed status must be filtered out, got %q", got)
		}
		if !carriesValue(args, "removed") {
			t.Fatalf("the removed status is not bound: %v", args)
		}
	})

	t.Run("a private praise about a classmate is not readable", func(t *testing.T) {
		mate := uuid.New()
		got, args := praiseRenders(PraisesFor(&Recognition{Students: []uuid.UUID{mate}}))
		if !carriesValue(args, "private") {
			t.Fatalf("the private visibility is not excluded: %v (%s)", args, got)
		}
	})

	t.Run("a staff member reads praise about themselves", func(t *testing.T) {
		staff := uuid.New()
		got, args := praiseRenders(PraisesFor(&Recognition{SelfStaff: &staff}))
		if !carriesValue(args, "staff") {
			t.Fatalf("the staff arm is missing: %v (%s)", args, got)
		}
		if !carriesArg(args, staff) {
			t.Fatalf("the staff id is not bound: %v", args)
		}
	})
}

func TestPraiseGivingExcludesTheCallersOwnHousehold(t *testing.T) {
	self, ward, mate := uuid.New(), uuid.New(), uuid.New()
	r := &Recognition{
		Students:     []uuid.UUID{self, ward, mate},
		SelfStudents: []uuid.UUID{self},
		WardStudents: []uuid.UUID{ward},
	}

	if r.ReachesStudent(self) {
		t.Fatal("a caller must not be able to praise themselves")
	}
	if r.ReachesStudent(ward) {
		t.Fatal("a caller must not be able to praise their own ward")
	}
	if !r.ReachesStudent(mate) {
		t.Fatal("a classmate in reach must be praiseable")
	}

	wide := &Recognition{AllStudents: true, SelfStudents: []uuid.UUID{self}}
	if wide.ReachesStudent(self) {
		t.Fatal("tenant reach must not let a caller praise themselves")
	}
	if !wide.ReachesStudent(mate) {
		t.Fatal("tenant reach must reach anybody else")
	}
}

func TestPraiseStaffRecipientsNeedSchoolWideReach(t *testing.T) {
	staff, other := uuid.New(), uuid.New()

	narrow := &Recognition{Students: []uuid.UUID{uuid.New()}, SelfStaff: &staff}
	if narrow.ReachesStaff(other) {
		t.Fatal("a narrowed caller must not be able to praise a staff member")
	}

	wide := &Recognition{AllStudents: true, AllStaff: true, SelfStaff: &staff}
	if !wide.ReachesStaff(other) {
		t.Fatal("school-wide reach must admit a staff recipient")
	}
	if wide.ReachesStaff(staff) {
		t.Fatal("a staff member must not be able to praise themselves")
	}
}

func TestPraiseModerationAndReactionRemoval(t *testing.T) {
	nothing, _ := praiseRenders(NoPraise())
	noReaction, _ := reactionRenders(NoPraiseReaction())

	t.Run("a classmate set alone confers no moderation", func(t *testing.T) {
		person, mate := uuid.New(), uuid.New()
		peer := &Recognition{PersonID: &person, Students: []uuid.UUID{mate}}

		got, args := praiseRenders(PraisesModeratableBy(peer))
		if strings.Contains(got, "recipient_id") {
			t.Fatalf("a peer must not moderate by reach, only their own rows, got %q", got)
		}
		if !carriesArg(args, person) {
			t.Fatalf("the giver arm is missing: %v", args)
		}

		peer.Moderator = true
		if got, _ = praiseRenders(PraisesModeratableBy(peer)); !strings.Contains(got, "recipient_id") {
			t.Fatalf("a teacher must moderate by reach, got %q", got)
		}
	})

	t.Run("a reach with no person and no students moderates nothing", func(t *testing.T) {
		if got, _ := praiseRenders(PraisesModeratableBy(&Recognition{})); got != nothing {
			t.Fatalf("expected the deny predicate, got %q", got)
		}
		if got, _ := reactionRenders(PraiseReactionsRemovableBy(&Recognition{})); got != noReaction {
			t.Fatalf("expected the deny predicate, got %q", got)
		}
	})

	t.Run("editing is bound to the person who gave the praise", func(t *testing.T) {
		person := uuid.New()
		got, args := praiseRenders(PraisesEditableBy(&Recognition{PersonID: &person}))
		if !strings.Contains(got, "given_by_person_id") {
			t.Fatalf("editing must key off the giver, got %q", got)
		}
		if !carriesArg(args, person) {
			t.Fatalf("the caller's person id is not bound: %v", args)
		}
	})

	t.Run("a reactor may remove their own reaction", func(t *testing.T) {
		person := uuid.New()
		got, args := reactionRenders(PraiseReactionsRemovableBy(&Recognition{PersonID: &person}))
		if !strings.Contains(got, "reactor_person_id") {
			t.Fatalf("removal must key off the reactor, got %q", got)
		}
		if !carriesArg(args, person) {
			t.Fatalf("the caller's person id is not bound: %v", args)
		}
	})
}

func carriesArg(args []any, want uuid.UUID) bool {
	for _, a := range args {
		switch v := a.(type) {
		case uuid.UUID:
			if v == want {
				return true
			}
		case string:
			if v == want.String() {
				return true
			}
		case []byte:
			if string(v) == want.String() {
				return true
			}
		}
	}
	return false
}
