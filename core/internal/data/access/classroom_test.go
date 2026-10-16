package access

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entguardianlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

func streamPostRenders(p predicate.StreamPost) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("stream_posts"))
	p(sel)
	return sel.Query()
}

func assignmentRenders(p predicate.Assignment) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("assignments"))
	p(sel)
	return sel.Query()
}

func submissionRenders(p predicate.AssignmentSubmission) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("assignment_submissions"))
	p(sel)
	return sel.Query()
}

type classroomIDs struct {
	branch   uuid.UUID
	grade    uuid.UUID
	section  uuid.UUID
	other    uuid.UUID
	physics  uuid.UUID
	history  uuid.UUID
	pupil    uuid.UUID
	mate     uuid.UUID
	ward     uuid.UUID
	stranger uuid.UUID
}

func newClassroomIDs() classroomIDs {
	return classroomIDs{
		branch:   uuid.New(),
		grade:    uuid.New(),
		section:  uuid.New(),
		other:    uuid.New(),
		physics:  uuid.New(),
		history:  uuid.New(),
		pupil:    uuid.New(),
		mate:     uuid.New(),
		ward:     uuid.New(),
		stranger: uuid.New(),
	}
}

func (c classroomIDs) subjectTeacher() *Audience {
	return &Audience{
		Sections:  nil,
		Offerings: []uuid.UUID{c.physics},
		Students:  []uuid.UUID{c.pupil, c.mate},
	}
}

func (c classroomIDs) classTeacher() *Audience {
	return &Audience{
		Sections: []uuid.UUID{c.section},
		Students: []uuid.UUID{c.pupil, c.mate},
	}
}

func (c classroomIDs) reader() *Audience {
	return &Audience{
		School:       true,
		Branches:     []uuid.UUID{c.branch},
		Grades:       []uuid.UUID{c.grade},
		Sections:     []uuid.UUID{c.section},
		Offerings:    []uuid.UUID{c.physics},
		Students:     []uuid.UUID{c.pupil},
		SelfStudents: []uuid.UUID{c.pupil},
	}
}

func (c classroomIDs) head() *Audience {
	return &Audience{
		Grades:    []uuid.UUID{c.grade},
		Sections:  []uuid.UUID{c.section},
		Offerings: []uuid.UUID{c.physics, c.history},
		Students:  []uuid.UUID{c.pupil, c.mate},
	}
}

func TestStreamPostReadNarrowsToTheAudience(t *testing.T) {
	c := newClassroomIDs()
	nothing, _ := streamPostRenders(NoStreamPost())

	t.Run("a nil audience matches nothing", func(t *testing.T) {
		if got, _ := streamPostRenders(StreamPostsFor(nil)); got != nothing {
			t.Fatalf("expected the deny predicate, got %q", got)
		}
	})

	t.Run("an empty audience matches nothing", func(t *testing.T) {
		if got, _ := streamPostRenders(StreamPostsFor(DenyAudience())); got != nothing {
			t.Fatalf("expected the deny predicate, got %q", got)
		}
	})

	t.Run("a tenant audience matches every row", func(t *testing.T) {
		got, _ := streamPostRenders(StreamPostsFor(&Audience{All: true, School: true}))
		if strings.Contains(strings.ToUpper(got), "WHERE") {
			t.Fatalf("expected an unfiltered query, got %q", got)
		}
	})

	t.Run("a reader reaches every target kind it holds", func(t *testing.T) {
		got, args := streamPostRenders(StreamPostsFor(c.reader()))
		filtered(t, "stream read", got)

		for _, want := range []string{
			`"stream_targets"."target_type" = `,
			`"stream_targets"."target_id" IN`,
		} {
			if !strings.Contains(got, want) {
				t.Fatalf("expected %q in %q", want, got)
			}
		}
		for _, id := range []uuid.UUID{c.branch, c.grade, c.section, c.physics, c.pupil} {
			if !carries(args, id) {
				t.Fatalf("expected %s among the arguments %v", id, args)
			}
		}
		for _, id := range []uuid.UUID{c.history, c.other, c.stranger} {
			if carries(args, id) {
				t.Fatalf("did not expect %s among the arguments %v", id, args)
			}
		}
		if !carriesValue(args, "school") {
			t.Fatalf("a member must reach school-wide posts, arguments %v", args)
		}
	})

	t.Run("a subject teacher reaches the offering and never the section", func(t *testing.T) {
		got, args := streamPostRenders(StreamPostsFor(c.subjectTeacher()))
		filtered(t, "subject teacher stream read", got)
		if !carries(args, c.physics) {
			t.Fatalf("expected the taught offering among the arguments %v", args)
		}
		if carries(args, c.section) {
			t.Fatalf("a subject teacher holds no section, arguments %v", args)
		}
		if carriesValue(args, "school") {
			t.Fatalf("this audience is not a member audience, arguments %v", args)
		}
	})
}

func TestStreamPostWriteDemandsEveryTargetBeReachable(t *testing.T) {
	c := newClassroomIDs()
	nothing, _ := streamPostRenders(NoStreamPost())

	t.Run("an empty audience writes nothing", func(t *testing.T) {
		if got, _ := streamPostRenders(StreamPostsWritableBy(DenyAudience())); got != nothing {
			t.Fatalf("expected the deny predicate, got %q", got)
		}
	})

	t.Run("a post with one unreachable target is excluded", func(t *testing.T) {
		got, _ := streamPostRenders(StreamPostsWritableBy(c.subjectTeacher()))
		filtered(t, "stream write", got)

		if !strings.Contains(got, "NOT (EXISTS") {
			t.Fatalf("the write predicate must exclude posts carrying a target outside reach, got %q", got)
		}
		if strings.Count(got, "EXISTS") < 2 {
			t.Fatalf("the write predicate must also require at least one target, got %q", got)
		}
	})

	t.Run("a pupil audience never writes school-wide", func(t *testing.T) {
		pupil := &Audience{Offerings: []uuid.UUID{c.physics}, SelfStudents: []uuid.UUID{c.pupil}}
		got, args := streamPostRenders(StreamPostsWritableBy(pupil))
		filtered(t, "pupil stream write", got)
		if carriesValue(args, "school") {
			t.Fatalf("a pupil audience must not admit a school target, arguments %v", args)
		}
	})

	t.Run("a grade head writes to the grade and the sections under it", func(t *testing.T) {
		got, args := streamPostRenders(StreamPostsWritableBy(c.head()))
		filtered(t, "head stream write", got)
		for _, id := range []uuid.UUID{c.grade, c.section, c.physics, c.history} {
			if !carries(args, id) {
				t.Fatalf("expected %s among the arguments %v", id, args)
			}
		}
		if carriesValue(args, "school") {
			t.Fatalf("a pinned head must not reach school-wide, arguments %v", args)
		}
		if carries(args, c.other) {
			t.Fatalf("the head reached a section outside the pin, arguments %v", args)
		}
	})
}

func TestAssignmentWriteDemandsEveryTargetBeReachable(t *testing.T) {
	c := newClassroomIDs()
	nothing, _ := assignmentRenders(NoAssignment())

	t.Run("an empty audience writes nothing", func(t *testing.T) {
		if got, _ := assignmentRenders(AssignmentsWritableBy(DenyAudience())); got != nothing {
			t.Fatalf("expected the deny predicate, got %q", got)
		}
	})

	t.Run("a subject teacher is held to the offerings taught", func(t *testing.T) {
		got, args := assignmentRenders(AssignmentsWritableBy(c.subjectTeacher()))
		filtered(t, "assignment write", got)

		if !strings.Contains(got, "NOT (EXISTS") {
			t.Fatalf("the write predicate must exclude work carrying a target outside reach, got %q", got)
		}
		if !strings.Contains(got, `"assignments"."subject_offering_id" IS NULL`) {
			t.Fatalf("the write predicate must allow work filed against no offering, got %q", got)
		}
		if !carries(args, c.physics) {
			t.Fatalf("expected the taught offering among the arguments %v", args)
		}
		if carries(args, c.history) {
			t.Fatalf("the teacher reached an offering they do not teach, arguments %v", args)
		}
	})

	t.Run("a class teacher who teaches no offering may only file work against none", func(t *testing.T) {
		got, _ := assignmentRenders(AssignmentsWritableBy(c.classTeacher()))
		filtered(t, "class teacher assignment write", got)
		if !strings.Contains(got, `"assignments"."subject_offering_id" IS NULL`) {
			t.Fatalf("expected the null-offering term in %q", got)
		}
		if strings.Contains(got, `"assignments"."subject_offering_id" IN`) {
			t.Fatalf("a class teacher holds no offering, got %q", got)
		}
	})
}

func TestAPupilNeverGradesTheirOwnSubmission(t *testing.T) {
	c := newClassroomIDs()
	nothing, _ := submissionRenders(NoAssignmentSubmission())

	own := `NOT ("assignment_submissions"."student_id" IN`

	t.Run("a pupil audience grades nothing at all", func(t *testing.T) {
		pupil := &Audience{SelfStudents: []uuid.UUID{c.pupil}}
		if got, _ := submissionRenders(AssignmentSubmissionsGradableBy(pupil)); got != nothing {
			t.Fatalf("a pupil must grade nothing, got %q", got)
		}
	})

	t.Run("a mis-issued tenant audience still excludes the pupil's own rows", func(t *testing.T) {
		pupil := &Audience{All: true, School: true, SelfStudents: []uuid.UUID{c.pupil}}
		got, args := submissionRenders(AssignmentSubmissionsGradableBy(pupil))
		filtered(t, "pupil grading at tenant reach", got)
		if !strings.Contains(got, own) {
			t.Fatalf("a pupil at tenant reach must be excluded from their own rows, got %q", got)
		}
		if !carries(args, c.pupil) {
			t.Fatalf("expected the pupil's own student id among the arguments %v", args)
		}
	})

	t.Run("a teacher who is also a pupil cannot grade their own work", func(t *testing.T) {
		a := c.subjectTeacher()
		a.SelfStudents = []uuid.UUID{c.pupil}
		got, _ := submissionRenders(AssignmentSubmissionsGradableBy(a))
		if !strings.Contains(got, own) {
			t.Fatalf("a teacher who is also a pupil must be excluded from their own rows, got %q", got)
		}
	})

	t.Run("a teacher who is also a parent cannot grade their own child", func(t *testing.T) {
		a := c.subjectTeacher()
		a.WardStudents = []uuid.UUID{c.ward}
		got, args := submissionRenders(AssignmentSubmissionsGradableBy(a))
		if !strings.Contains(got, own) {
			t.Fatalf("a teacher who is also a parent must be excluded from their ward's rows, got %q", got)
		}
		if !carries(args, c.ward) {
			t.Fatalf("expected the ward's student id among the arguments %v", args)
		}
	})

	t.Run("a teacher with no children of their own grades unencumbered", func(t *testing.T) {
		got, _ := submissionRenders(AssignmentSubmissionsGradableBy(c.subjectTeacher()))
		filtered(t, "teacher grading", got)
		if strings.Contains(got, own) {
			t.Fatalf("the exclusion fired with nobody to exclude, got %q", got)
		}
	})
}

func TestSubmittingIsSelfOnly(t *testing.T) {
	c := newClassroomIDs()
	nothing, _ := submissionRenders(NoAssignmentSubmission())

	t.Run("a pupil submits their own work", func(t *testing.T) {
		pupil := &Audience{Offerings: []uuid.UUID{c.physics}, SelfStudents: []uuid.UUID{c.pupil}}
		got, args := submissionRenders(AssignmentSubmissionsSubmittableBy(pupil))
		filtered(t, "pupil submit", got)
		if !strings.Contains(got, `"assignment_submissions"."student_id" IN`) {
			t.Fatalf("expected a student term in %q", got)
		}
		if !carries(args, c.pupil) {
			t.Fatalf("expected the pupil among the arguments %v", args)
		}
		if carries(args, c.mate) {
			t.Fatalf("the pupil reached a classmate, arguments %v", args)
		}
	})

	t.Run("a guardian submits nothing for their ward", func(t *testing.T) {
		guardian := &Audience{Offerings: []uuid.UUID{c.physics}, WardStudents: []uuid.UUID{c.ward}}
		if got, _ := submissionRenders(AssignmentSubmissionsSubmittableBy(guardian)); got != nothing {
			t.Fatalf("a guardian must not record work for their ward, got %q", got)
		}
	})

	t.Run("a teacher submits nothing on a pupil's behalf", func(t *testing.T) {
		if got, _ := submissionRenders(AssignmentSubmissionsSubmittableBy(c.subjectTeacher())); got != nothing {
			t.Fatalf("a teacher must not record a pupil's work, got %q", got)
		}
	})
}

func TestClassroomPredicatesNeverFallThroughUnfiltered(t *testing.T) {
	c := newClassroomIDs()

	audiences := map[string]*Audience{
		"nil":            nil,
		"empty":          DenyAudience(),
		"subjectTeacher": c.subjectTeacher(),
		"classTeacher":   c.classTeacher(),
		"reader":         c.reader(),
		"head":           c.head(),
		"pupil":          {Offerings: []uuid.UUID{c.physics}, SelfStudents: []uuid.UUID{c.pupil}},
		"guardian":       {Offerings: []uuid.UUID{c.physics}, WardStudents: []uuid.UUID{c.ward}},
		"schoolOnly":     {School: true},
	}

	for name, a := range audiences {
		read, _ := streamPostRenders(StreamPostsFor(a))
		filtered(t, "stream read "+name, read)

		write, _ := streamPostRenders(StreamPostsWritableBy(a))
		filtered(t, "stream write "+name, write)

		work, _ := assignmentRenders(AssignmentsFor(a))
		filtered(t, "assignment read "+name, work)

		set, _ := assignmentRenders(AssignmentsWritableBy(a))
		filtered(t, "assignment write "+name, set)

		subs, _ := submissionRenders(AssignmentSubmissionsFor(a))
		filtered(t, "submission read "+name, subs)

		grade, _ := submissionRenders(AssignmentSubmissionsGradableBy(a))
		filtered(t, "submission grade "+name, grade)

		submit, _ := submissionRenders(AssignmentSubmissionsSubmittableBy(a))
		filtered(t, "submission submit "+name, submit)
	}
}

func TestKinHonoursTheAcademicFlagOnTheGuardianLink(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)

	link, err := db.Client.StudentGuardian.Query().
		Where(entguardianlink.StatusEQ(entguardianlink.StatusActive)).
		First(ctx)
	if err != nil {
		t.Skipf("the tenant holds no active guardian link, so nothing here was checked: %v", err)
	}
	if !link.CanViewAcademic {
		if _, err := db.Client.StudentGuardian.UpdateOneID(link.ID).
			SetCanViewAcademic(true).Save(ctx); err != nil {
			t.Fatalf("could not set can_view_academic on %s: %v", link.ID, err)
		}
	}

	person := uuid.New()
	guardian := &Viewer{PersonID: &person, GuardianID: &link.GuardianID}
	scoped := authorization.Decision{Allowed: true, Reach: authorization.ReachGuardianWard, HasReach: true}

	conn := postgres.WithConn(ctx, &postgres.TenantConn{Client: db.Client})

	allowed, err := ReadableAudience(conn, guardian, scoped)
	if err != nil {
		t.Fatalf("readable audience: %v", err)
	}
	if !carriesUUID(allowed.WardStudents, link.StudentID) {
		t.Fatalf("a guardian with academic access does not reach their ward %s, so the flip below "+
			"would prove nothing: %v", link.StudentID, allowed.WardStudents)
	}

	if _, err := db.Client.StudentGuardian.UpdateOneID(link.ID).
		SetCanViewAcademic(false).Save(ctx); err != nil {
		t.Fatalf("could not clear can_view_academic on %s: %v", link.ID, err)
	}

	denied, err := ReadableAudience(conn, guardian, scoped)
	if err != nil {
		t.Fatalf("readable audience: %v", err)
	}
	if len(denied.WardStudents) != 0 {
		t.Fatalf("a guardian with can_view_academic=false still resolved %d ward pupils; kinOf must "+
			"use StudentsOfGuardianAcademic, not StudentsOfGuardian", len(denied.WardStudents))
	}
	if len(denied.Kin()) != 0 {
		t.Fatalf("Kin() still carries %d pupils after the flag was withdrawn", len(denied.Kin()))
	}

	nothing, _ := submissionRenders(NoAssignmentSubmission())
	got, _ := submissionRenders(AssignmentSubmissionsFor(denied))
	if got != nothing {
		t.Fatalf("a barred guardian still reaches submissions: %q", got)
	}
}

func carriesUUID(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}
