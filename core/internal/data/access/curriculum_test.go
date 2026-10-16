package access

import (
	"strconv"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
)

func curriculumRenders(p predicate.Curriculum) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("curricula"))
	p(sel)
	return sel.Query()
}

func curriculumNodeRenders(p predicate.CurriculumNode) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("curriculum_nodes"))
	p(sel)
	return sel.Query()
}

func contentPlacementRenders(p predicate.ContentPlacement) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("content_placements"))
	p(sel)
	return sel.Query()
}

func curriculumSQL(v *Viewer, d authorization.Decision) (string, []any) {
	return curriculumRenders(CurriculaFor(v, d))
}

func curriculumWriteSQL(v *Viewer, d authorization.Decision) (string, []any) {
	return curriculumRenders(CurriculaWritableBy(v, d))
}

func curriculumPinned(r authorization.Reach, groups ...[]authorization.Constraint) authorization.Decision {
	d := withScope(r)
	d.Constraints = groups
	return d
}

type curriculumCast struct {
	person   uuid.UUID
	section  uuid.UUID
	offering uuid.UUID
	subject  uuid.UUID
	grade    uuid.UUID
	student  uuid.UUID
	guardian uuid.UUID
	teacher  *Viewer
	pupil    *Viewer
	ward     *Viewer
}

func curriculumViewers() curriculumCast {
	c := curriculumCast{
		person:   uuid.New(),
		section:  uuid.New(),
		offering: uuid.New(),
		subject:  uuid.New(),
		grade:    uuid.New(),
		student:  uuid.New(),
		guardian: uuid.New(),
	}
	taught := []SubjectGrade{{SubjectID: c.subject, GradeLevelID: c.grade}}

	c.teacher = &Viewer{
		PersonID:            &c.person,
		SectionIDs:          []uuid.UUID{c.section},
		SubjectOfferingIDs:  []uuid.UUID{c.offering},
		TaughtSubjectGrades: taught,
	}
	c.pupil = &Viewer{
		PersonID:             &c.person,
		StudentIDs:           []uuid.UUID{c.student},
		EnrolledOfferingIDs:  []uuid.UUID{c.offering},
		StudiedSubjectGrades: taught,
	}
	c.ward = &Viewer{
		PersonID:          &c.person,
		GuardianID:        &c.guardian,
		WardOfferingIDs:   []uuid.UUID{c.offering},
		WardSubjectGrades: taught,
	}
	return c
}

func TestCurriculumScopes(t *testing.T) {
	c := curriculumViewers()
	other := uuid.New()

	nothing, _ := curriculumRenders(NoCurriculum())

	cases := []struct {
		name        string
		viewer      *Viewer
		decision    authorization.Decision
		unfiltered  bool
		matchesNone bool
		mustHave    []string
		mustNotHave []string
		wantArgs    []uuid.UUID
		denyArgs    []uuid.UUID
	}{
		{
			name:        "a nil viewer matches nothing",
			viewer:      nil,
			decision:    withScope(authorization.ReachTenant),
			matchesNone: true,
		},
		{
			name:       "an unrestricted viewer matches every row",
			viewer:     &Viewer{Unrestricted: true},
			decision:   authorization.Decision{Allowed: true},
			unfiltered: true,
		},
		{
			name:        "a zero viewer matches nothing",
			viewer:      &Viewer{},
			decision:    authorization.Decision{Allowed: true},
			matchesNone: true,
		},
		{
			name:        "an unknown reach matches nothing",
			viewer:      c.teacher,
			decision:    withScope("whole_district"),
			matchesNone: true,
		},
		{
			name:        "an empty reach matches nothing",
			viewer:      c.teacher,
			decision:    withScope(""),
			matchesNone: true,
		},
		{
			name:       "tenant reach matches every row",
			viewer:     c.teacher,
			decision:   withScope(authorization.ReachTenant),
			unfiltered: true,
		},
		{
			name:     "teacher assignment reach takes the grades taught and the subjects offered",
			viewer:   c.teacher,
			decision: withScope(authorization.ReachTeacherAssignment),
			mustHave: []string{
				`"curricula"."grade_level_id" = "grade_levels"."id"`,
				`"sections"."id" IN`,
				`"curricula"."subject_id" = $`,
				`"curricula"."grade_level_id" = $`,
			},
			mustNotHave: []string{"student_enrollments", "student_guardians", "subject_offerings"},
			wantArgs:    []uuid.UUID{c.section, c.subject, c.grade},
			denyArgs:    []uuid.UUID{other, c.person, c.offering},
		},
		{
			name:     "self reach takes the grade the pupil is enrolled in",
			viewer:   c.pupil,
			decision: withScope(authorization.ReachSelf),
			mustHave: []string{
				`"student_enrollments"."student_id" IN`,
				`"curricula"."grade_level_id" = "grade_levels"."id"`,
				`"curricula"."subject_id" = $`,
			},
			mustNotHave: []string{"student_guardians", "subject_offerings"},
			wantArgs:    []uuid.UUID{c.student, c.subject, c.grade},
			denyArgs:    []uuid.UUID{other, c.person, c.guardian, c.offering},
		},
		{
			name:     "guardian ward reach takes the grade the ward is enrolled in",
			viewer:   c.ward,
			decision: withScope(authorization.ReachGuardianWard),
			mustHave: []string{
				`"student_guardians"."guardian_id" = `,
				`"curricula"."grade_level_id" = "grade_levels"."id"`,
				`"curricula"."subject_id" = $`,
			},
			mustNotHave: []string{"subject_offerings"},
			wantArgs:    []uuid.UUID{c.guardian, c.subject, c.grade},
			denyArgs:    []uuid.UUID{other, c.person, c.student, c.offering},
		},
		{
			name:        "a teacher at self reach reaches nothing it teaches",
			viewer:      c.teacher,
			decision:    withScope(authorization.ReachSelf),
			matchesNone: true,
		},
		{
			name:        "a pupil at teacher assignment reach reaches nothing",
			viewer:      c.pupil,
			decision:    withScope(authorization.ReachTeacherAssignment),
			matchesNone: true,
		},
		{
			name:        "a guardian at self reach reaches nothing",
			viewer:      &Viewer{PersonID: &c.person, GuardianID: &c.guardian},
			decision:    withScope(authorization.ReachSelf),
			matchesNone: true,
		},
		{
			name:     "no reach unions every role the viewer holds",
			viewer:   &Viewer{PersonID: &c.person, SectionIDs: []uuid.UUID{c.section}, StudentIDs: []uuid.UUID{c.student}, GuardianID: &c.guardian},
			decision: authorization.Decision{Allowed: true},
			mustHave: []string{`"sections"."id" IN`, "student_enrollments", "student_guardians"},
			wantArgs: []uuid.UUID{c.section, c.student, c.guardian},
			denyArgs: []uuid.UUID{other},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := curriculumSQL(tc.viewer, tc.decision)

			if tc.unfiltered {
				if strings.Contains(strings.ToUpper(got), "WHERE") {
					t.Fatalf("expected an unfiltered query, got %q", got)
				}
				return
			}

			filtered(t, tc.name, got)

			if tc.matchesNone {
				if got != nothing {
					t.Fatalf("expected the deny predicate %q, got %q", nothing, got)
				}
				return
			}

			for _, want := range tc.mustHave {
				if !strings.Contains(got, want) {
					t.Fatalf("expected %q in %q", want, got)
				}
			}
			for _, banned := range tc.mustNotHave {
				if strings.Contains(got, banned) {
					t.Fatalf("did not expect %q in %q", banned, got)
				}
			}
			for _, id := range tc.wantArgs {
				if !carries(args, id) {
					t.Fatalf("expected %s among the arguments %v of %q", id, args, got)
				}
			}
			for _, id := range tc.denyArgs {
				if carries(args, id) {
					t.Fatalf("did not expect %s among the arguments %v of %q", id, args, got)
				}
			}
		})
	}
}

func TestCurriculumNeverFallsThroughUnfiltered(t *testing.T) {
	person := uuid.New()
	viewers := map[string]*Viewer{
		"nil":      nil,
		"empty":    {},
		"person":   {PersonID: &person},
		"teacher":  {PersonID: &person, SectionIDs: []uuid.UUID{uuid.New()}},
		"pupil":    {PersonID: &person, StudentIDs: []uuid.UUID{uuid.New()}},
		"guardian": {PersonID: &person, GuardianID: &person},
	}
	groups := map[string][]authorization.Constraint{
		"none":         nil,
		"section":      pin("section", "9A"),
		"grade":        pin("grade_level", "9"),
		"untranslated": pin("campus", "north"),
	}

	reaches := append([]authorization.Reach{}, authorization.AllReaches...)
	reaches = append(reaches, "whole_district", "")

	for name, v := range viewers {
		for _, r := range reaches {
			for label, group := range groups {
				if r == authorization.ReachTenant && group == nil {
					continue
				}
				d := withScope(r)
				if group != nil {
					d = curriculumPinned(r, group)
				}
				where := name + "/" + string(r) + "/" + label

				read, _ := curriculumSQL(v, d)
				filtered(t, "read "+where, read)

				write, _ := curriculumWriteSQL(v, d)
				filtered(t, "write "+where, write)

				node, _ := curriculumNodeRenders(CurriculumNodesFor(v, d))
				filtered(t, "node "+where, node)

				placement, _ := contentPlacementRenders(ContentPlacementsFor(v, d))
				filtered(t, "placement "+where, placement)
			}
		}
	}
}

func TestCurriculumPinsNarrowTheQuery(t *testing.T) {
	c := curriculumViewers()

	nothing, _ := curriculumRenders(NoCurriculum())
	unpinned, _ := curriculumSQL(c.teacher, withScope(authorization.ReachTeacherAssignment))
	tenant, _ := curriculumSQL(c.teacher, withScope(authorization.ReachTenant))

	cases := []struct {
		name        string
		decision    authorization.Decision
		matchesNone bool
		differs     string
		mustHave    []string
		wantValues  []string
		denyValues  []string
		wantArgs    []uuid.UUID
		denyArgs    []uuid.UUID
	}{
		{
			name:       "a grade pin adds a grade code term the unpinned query does not carry",
			decision:   curriculumPinned(authorization.ReachTeacherAssignment, pin("grade_level", "9")),
			differs:    unpinned,
			mustHave:   []string{`"grade_levels"."code" IN`},
			wantValues: []string{"9"},
			wantArgs:   []uuid.UUID{c.section, c.subject, c.grade},
		},
		{
			name:       "a section pin reaches the grade that section belongs to",
			decision:   curriculumPinned(authorization.ReachTeacherAssignment, pin("section", "9A")),
			differs:    unpinned,
			mustHave:   []string{`"sections"."code" IN`},
			wantValues: []string{"9A"},
			wantArgs:   []uuid.UUID{c.section, c.subject, c.grade},
		},
		{
			name:       "tenant reach keeps only the pin",
			decision:   curriculumPinned(authorization.ReachTenant, pin("grade_level", "9")),
			differs:    tenant,
			mustHave:   []string{`"grade_levels"."code" IN`},
			wantValues: []string{"9"},
			denyArgs:   []uuid.UUID{c.section, c.subject, c.grade, c.person},
		},
		{
			name:        "an untranslatable pin denies",
			decision:    curriculumPinned(authorization.ReachTeacherAssignment, pin("campus", "north")),
			matchesNone: true,
		},
		{
			name:        "an untranslatable pin denies at tenant reach too",
			decision:    curriculumPinned(authorization.ReachTenant, pin("campus", "north")),
			matchesNone: true,
		},
		{
			name:        "an empty pin denies",
			decision:    curriculumPinned(authorization.ReachTeacherAssignment, pin("section")),
			matchesNone: true,
		},
		{
			name:       "one untranslatable group among translatable ones is dropped, not fatal",
			decision:   curriculumPinned(authorization.ReachTeacherAssignment, pin("grade_level", "9"), pin("campus", "north")),
			differs:    unpinned,
			wantValues: []string{"9"},
			denyValues: []string{"north"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := curriculumSQL(c.teacher, tc.decision)

			filtered(t, tc.name, got)

			if tc.matchesNone {
				if got != nothing {
					t.Fatalf("expected the deny predicate %q, got %q", nothing, got)
				}
				return
			}
			if tc.differs != "" && got == tc.differs {
				t.Fatalf("the pinned query is byte-identical to %q", tc.differs)
			}
			for _, want := range tc.mustHave {
				if !strings.Contains(got, want) {
					t.Fatalf("expected %q in %q", want, got)
				}
			}
			for _, want := range tc.wantValues {
				if !carriesValue(args, want) {
					t.Fatalf("expected %q among the arguments %v of %q", want, args, got)
				}
			}
			for _, banned := range tc.denyValues {
				if carriesValue(args, banned) {
					t.Fatalf("did not expect %q among the arguments %v of %q", banned, args, got)
				}
			}
			for _, id := range tc.wantArgs {
				if !carries(args, id) {
					t.Fatalf("expected %s among the arguments %v of %q", id, args, got)
				}
			}
			for _, id := range tc.denyArgs {
				if carries(args, id) {
					t.Fatalf("did not expect %s among the arguments %v of %q", id, args, got)
				}
			}
		})
	}
}

func TestCurriculumPinsNeverWiden(t *testing.T) {
	c := curriculumViewers()

	viewers := map[string]*Viewer{"teacher": c.teacher, "pupil": c.pupil, "ward": c.ward}
	groups := map[string][]authorization.Constraint{
		"section": pin("section", "9A"),
		"grade":   pin("grade_level", "9"),
	}

	nothing, _ := curriculumRenders(NoCurriculum())

	reaches := append([]authorization.Reach{}, authorization.AllReaches...)
	reaches = append(reaches, "whole_district", "")

	for name, v := range viewers {
		for _, r := range reaches {
			for label, group := range groups {
				where := name + "/" + string(r) + "/" + label
				plain, _ := curriculumSQL(v, withScope(r))
				got, _ := curriculumSQL(v, curriculumPinned(r, group))

				filtered(t, where, got)

				if plain == nothing {
					if got != nothing {
						t.Fatalf("%s: a pin widened a denied scope to %q", where, got)
					}
					continue
				}
				if got == plain {
					t.Fatalf("%s: the pinned query is byte-identical to the unpinned one %q", where, got)
				}
				if len(got) < len(plain) && got != nothing {
					t.Fatalf("%s: the pin dropped a term without denying: %q", where, got)
				}
			}
		}
	}
}

func TestCurriculumWriteRefusesPupilsAndGuardians(t *testing.T) {
	c := curriculumViewers()

	nothing, _ := curriculumRenders(NoCurriculum())

	cases := []struct {
		name        string
		viewer      *Viewer
		decision    authorization.Decision
		matchesNone bool
		sameAsRead  bool
		unfiltered  bool
	}{
		{
			name:        "a pupil that may read its own grade may not write it",
			viewer:      c.pupil,
			decision:    withScope(authorization.ReachSelf),
			matchesNone: true,
		},
		{
			name:        "a guardian that may read the grade of its ward may not write it",
			viewer:      c.ward,
			decision:    withScope(authorization.ReachGuardianWard),
			matchesNone: true,
		},
		{
			name:        "an unknown reach may not write",
			viewer:      c.teacher,
			decision:    withScope("whole_district"),
			matchesNone: true,
		},
		{
			name:        "a nil viewer may not write",
			viewer:      nil,
			decision:    withScope(authorization.ReachTenant),
			matchesNone: true,
		},
		{
			name:        "an untranslatable pin denies the write",
			viewer:      c.teacher,
			decision:    curriculumPinned(authorization.ReachTeacherAssignment, pin("campus", "north")),
			matchesNone: true,
		},
		{
			name:       "a teacher writes exactly what it reads at assignment reach",
			viewer:     c.teacher,
			decision:   withScope(authorization.ReachTeacherAssignment),
			sameAsRead: true,
		},
		{
			name:       "tenant reach writes as widely as it reads",
			viewer:     c.teacher,
			decision:   withScope(authorization.ReachTenant),
			sameAsRead: true,
			unfiltered: true,
		},
		{
			name:       "an unrestricted viewer writes as widely as it reads",
			viewer:     &Viewer{Unrestricted: true},
			decision:   authorization.Decision{Allowed: true},
			sameAsRead: true,
			unfiltered: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			read, _ := curriculumSQL(tc.viewer, tc.decision)
			got, args := curriculumWriteSQL(tc.viewer, tc.decision)

			if tc.matchesNone {
				if got != nothing {
					t.Fatalf("expected the deny predicate %q, got %q", nothing, got)
				}
				return
			}
			if tc.sameAsRead && got != read {
				t.Fatalf("expected the read predicate %q, got %q", read, got)
			}
			if tc.unfiltered {
				if strings.Contains(strings.ToUpper(got), "WHERE") {
					t.Fatalf("expected an unfiltered query, got %q", got)
				}
				return
			}
			filtered(t, tc.name, got)
			if carries(args, c.person) {
				t.Fatalf("the write predicate must not bind the caller person, got %v", args)
			}
			if !carries(args, c.section) || !carries(args, c.subject) || !carries(args, c.grade) {
				t.Fatalf("expected the teaching scope among the arguments %v of %q", args, got)
			}
		})
	}
}

func TestCurriculumWriteDropsThePersonalReadArms(t *testing.T) {
	c := curriculumViewers()

	nothing, _ := curriculumRenders(NoCurriculum())

	viewers := map[string]*Viewer{"pupil": c.pupil, "guardian": c.ward}
	reaches := append([]authorization.Reach{}, authorization.AllReaches...)
	reaches = append(reaches, "whole_district", "")

	for name, v := range viewers {
		for _, r := range reaches {
			if r == authorization.ReachTenant {
				continue
			}
			where := name + "/" + string(r)
			got, _ := curriculumWriteSQL(v, withScope(r))
			if got != nothing {
				t.Fatalf("%s: expected the deny predicate %q, got %q", where, nothing, got)
			}
		}
	}
}

func TestCurriculumNodesFollowTheCurriculum(t *testing.T) {
	c := curriculumViewers()

	noNode, _ := curriculumNodeRenders(NoCurriculumNode())
	noPlacement, _ := contentPlacementRenders(NoContentPlacement())

	if got, _ := curriculumNodeRenders(CurriculumNodesFor(nil, withScope(authorization.ReachTenant))); got != noNode {
		t.Fatalf("a nil viewer must match no node, got %q", got)
	}
	if got, _ := contentPlacementRenders(ContentPlacementsFor(nil, withScope(authorization.ReachTenant))); got != noPlacement {
		t.Fatalf("a nil viewer must match no placement, got %q", got)
	}
	if got, _ := curriculumNodeRenders(CurriculumNodesFor(c.teacher, withScope("whole_district"))); got != noNode {
		t.Fatalf("an unknown reach must match no node, got %q", got)
	}
	if got, _ := contentPlacementRenders(ContentPlacementsFor(c.teacher, withScope("whole_district"))); got != noPlacement {
		t.Fatalf("an unknown reach must match no placement, got %q", got)
	}

	if got, _ := curriculumNodeRenders(CurriculumNodesFor(c.teacher, withScope(authorization.ReachTenant))); strings.Contains(strings.ToUpper(got), "WHERE") {
		t.Fatalf("tenant reach must not narrow the nodes, got %q", got)
	}
	if got, _ := contentPlacementRenders(ContentPlacementsFor(c.teacher, withScope(authorization.ReachTenant))); strings.Contains(strings.ToUpper(got), "WHERE") {
		t.Fatalf("tenant reach must not narrow the placements, got %q", got)
	}

	d := withScope(authorization.ReachTeacherAssignment)
	scope, scopeArgs := curriculumSQL(c.teacher, d)
	node, nodeArgs := curriculumNodeRenders(CurriculumNodesFor(c.teacher, d))
	placement, placementArgs := contentPlacementRenders(ContentPlacementsFor(c.teacher, d))

	for label, got := range map[string]string{"node": node, "placement": placement} {
		filtered(t, label, got)
		if !strings.Contains(got, `FROM "curricula"`) {
			t.Fatalf("the %s predicate must join through the curriculum, got %q", label, got)
		}
		if !strings.Contains(got, `"curricula"."grade_level_id" = "grade_levels"."id"`) {
			t.Fatalf("the %s predicate lost the curriculum scope, got %q", label, got)
		}
	}
	if len(nodeArgs) != len(scopeArgs) || len(placementArgs) != len(scopeArgs) {
		t.Fatalf("expected the curriculum arguments %v, got %v and %v", scopeArgs, nodeArgs, placementArgs)
	}
	for _, id := range []uuid.UUID{c.section, c.subject, c.grade} {
		if !carries(nodeArgs, id) || !carries(placementArgs, id) {
			t.Fatalf("expected %s among %v and %v, the curriculum scope is %q", id, nodeArgs, placementArgs, scope)
		}
	}

	if !strings.Contains(node, `"curriculum_nodes"."curriculum_id" = "curricula"."id"`) {
		t.Fatalf("expected the node to be bound to its curriculum, got %q", node)
	}
	if !strings.Contains(placement, `"content_placements"."curriculum_id" = "curricula"."id"`) {
		t.Fatalf("expected the placement to be bound to its curriculum, got %q", placement)
	}
}

func TestCurriculumNodeAndPlacementWritesRefusePupils(t *testing.T) {
	c := curriculumViewers()

	noNode, _ := curriculumNodeRenders(NoCurriculumNode())
	noPlacement, _ := contentPlacementRenders(NoContentPlacement())

	for name, v := range map[string]*Viewer{"pupil": c.pupil, "guardian": c.ward} {
		for _, r := range []authorization.Reach{authorization.ReachSelf, authorization.ReachGuardianWard} {
			where := name + "/" + string(r)
			if got, _ := curriculumNodeRenders(CurriculumNodesWritableBy(v, withScope(r))); got != noNode {
				t.Fatalf("%s: expected the deny predicate %q, got %q", where, noNode, got)
			}
			if got, _ := contentPlacementRenders(ContentPlacementsWritableBy(v, withScope(r))); got != noPlacement {
				t.Fatalf("%s: expected the deny predicate %q, got %q", where, noPlacement, got)
			}
		}
	}

	d := withScope(authorization.ReachTeacherAssignment)
	readNode, _ := curriculumNodeRenders(CurriculumNodesFor(c.teacher, d))
	writeNode, _ := curriculumNodeRenders(CurriculumNodesWritableBy(c.teacher, d))
	if readNode != writeNode {
		t.Fatalf("a teacher at assignment reach writes what it reads, got %q and %q", readNode, writeNode)
	}
}

func curriculumBoundPairs(t *testing.T, query string, args []any) []SubjectGrade {
	t.Helper()

	const subjectMark = `"curricula"."subject_id" = $`
	const gradeMark = ` AND "curricula"."grade_level_id" = $`

	at := func(placeholder string) uuid.UUID {
		n, err := strconv.Atoi(placeholder)
		if err != nil || n < 1 || n > len(args) {
			t.Fatalf("placeholder $%s is not bound by %v in %q", placeholder, args, query)
		}
		id, ok := args[n-1].(uuid.UUID)
		if !ok {
			t.Fatalf("argument $%s is %T, not a uuid, in %q", placeholder, args[n-1], query)
		}
		return id
	}
	digits := func(s string) string {
		i := 0
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			i++
		}
		return s[:i]
	}

	var pairs []SubjectGrade
	rest := query
	for {
		i := strings.Index(rest, subjectMark)
		if i < 0 {
			return pairs
		}
		rest = rest[i+len(subjectMark):]
		subject := digits(rest)
		if !strings.HasPrefix(rest[len(subject):], gradeMark) {
			t.Fatalf("a subject term is not immediately paired with a grade term in %q", query)
		}
		rest = rest[len(subject)+len(gradeMark):]
		grade := digits(rest)
		pairs = append(pairs, SubjectGrade{SubjectID: at(subject), GradeLevelID: at(grade)})
	}
}

func TestCurriculumNeverMatchesACrossedSubjectAndGrade(t *testing.T) {
	maths := uuid.New()
	science := uuid.New()
	grade9 := uuid.New()
	grade10 := uuid.New()

	taught := []SubjectGrade{
		{SubjectID: maths, GradeLevelID: grade9},
		{SubjectID: science, GradeLevelID: grade10},
	}
	crossed := []SubjectGrade{
		{SubjectID: science, GradeLevelID: grade9},
		{SubjectID: maths, GradeLevelID: grade10},
	}

	viewers := map[string]*Viewer{
		"teacher":  {TaughtSubjectGrades: taught},
		"pupil":    {StudiedSubjectGrades: taught},
		"guardian": {GuardianID: &grade9, WardSubjectGrades: taught},
	}
	reaches := map[string]authorization.Reach{
		"teacher":  authorization.ReachTeacherAssignment,
		"pupil":    authorization.ReachSelf,
		"guardian": authorization.ReachGuardianWard,
	}

	for name, v := range viewers {
		got, args := curriculumSQL(v, withScope(reaches[name]))

		filtered(t, name, got)

		bound := curriculumBoundPairs(t, got, args)
		if len(bound) != len(taught) {
			t.Fatalf("%s: expected %d subject and grade terms, got %d in %q", name, len(taught), len(bound), got)
		}
		for _, want := range taught {
			found := false
			for _, have := range bound {
				if have == want {
					found = true
				}
			}
			if !found {
				t.Fatalf("%s: the taught pair %v is not bound in %q with %v", name, want, got, args)
			}
		}
		for _, never := range crossed {
			for _, have := range bound {
				if have == never {
					t.Fatalf("%s: the crossed pair %v is reachable in %q with %v", name, never, got, args)
				}
			}
		}
	}
}

func TestCurriculumSubjectAndGradeAreBoundTogether(t *testing.T) {
	maths := uuid.New()
	science := uuid.New()
	grade9 := uuid.New()
	grade10 := uuid.New()

	v := &Viewer{TaughtSubjectGrades: []SubjectGrade{
		{SubjectID: maths, GradeLevelID: grade9},
		{SubjectID: science, GradeLevelID: grade10},
	}}

	got, args := curriculumSQL(v, withScope(authorization.ReachTeacherAssignment))

	want := `SELECT * FROM "curricula" WHERE ("curricula"."subject_id" = $1 AND "curricula"."grade_level_id" = $2) OR ("curricula"."subject_id" = $3 AND "curricula"."grade_level_id" = $4)`
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if len(args) != 4 || args[0] != any(maths) || args[1] != any(grade9) || args[2] != any(science) || args[3] != any(grade10) {
		t.Fatalf("expected the pairs bound in order, got %v", args)
	}
}

func TestCurriculumSelfAndGuardianWardResolveDifferently(t *testing.T) {
	person := uuid.New()
	guardian := uuid.New()
	student := uuid.New()
	ownSubject := uuid.New()
	ownGrade := uuid.New()
	wardSubject := uuid.New()
	wardGrade := uuid.New()

	own := SubjectGrade{SubjectID: ownSubject, GradeLevelID: ownGrade}
	ward := SubjectGrade{SubjectID: wardSubject, GradeLevelID: wardGrade}

	both := &Viewer{
		PersonID:             &person,
		GuardianID:           &guardian,
		StudentIDs:           []uuid.UUID{student},
		StudiedSubjectGrades: []SubjectGrade{own},
		WardSubjectGrades:    []SubjectGrade{ward},
	}

	selfSQL, selfArgs := curriculumSQL(both, withScope(authorization.ReachSelf))
	wardSQL, wardArgs := curriculumSQL(both, withScope(authorization.ReachGuardianWard))

	filtered(t, "self", selfSQL)
	filtered(t, "guardian_ward", wardSQL)

	if selfSQL == wardSQL {
		t.Fatalf("self and guardian_ward are indistinguishable: %q", selfSQL)
	}

	selfPairs := curriculumBoundPairs(t, selfSQL, selfArgs)
	wardPairs := curriculumBoundPairs(t, wardSQL, wardArgs)

	if len(selfPairs) != 1 || selfPairs[0] != own {
		t.Fatalf("self reach must bind only the viewer's own pair, got %v in %q", selfPairs, selfSQL)
	}
	if len(wardPairs) != 1 || wardPairs[0] != ward {
		t.Fatalf("guardian_ward reach must bind only the ward pair, got %v in %q", wardPairs, wardSQL)
	}
	if carries(selfArgs, wardSubject) || carries(selfArgs, wardGrade) {
		t.Fatalf("self reach leaked the ward subject or grade: %v of %q", selfArgs, selfSQL)
	}
	if carries(wardArgs, ownSubject) || carries(wardArgs, ownGrade) {
		t.Fatalf("guardian_ward reach leaked the viewer's own subject or grade: %v of %q", wardArgs, wardSQL)
	}
}
