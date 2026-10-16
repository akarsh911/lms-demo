package access

import (
	"fmt"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
)

func libraryRenders(p predicate.ContentItem) (string, []any) {
	sel := sql.Dialect(dialect.Postgres).Select("*").From(sql.Table("content_items"))
	p(sel)
	return sel.Query()
}

func librarySQL(v *Viewer, d authorization.Decision) (string, []any) {
	return libraryRenders(LibraryItemsFor(v, d))
}

func carries(args []any, id uuid.UUID) bool {
	for _, a := range args {
		if v, ok := a.(uuid.UUID); ok && v == id {
			return true
		}
		if v, ok := a.([]byte); ok && string(v) == id.String() {
			return true
		}
		if v, ok := a.(string); ok && v == id.String() {
			return true
		}
	}
	return false
}

func TestLibraryScopes(t *testing.T) {
	person := uuid.New()
	ownSection := uuid.New()
	otherSection := uuid.New()
	offering := uuid.New()
	guardian := uuid.New()
	student := uuid.New()

	nothing, _ := libraryRenders(NoLibraryItem())

	pupil := &Viewer{
		PersonID:   &person,
		StudentIDs: []uuid.UUID{student},
		SectionIDs: []uuid.UUID{ownSection},
	}
	ward := &Viewer{
		PersonID:   &person,
		GuardianID: &guardian,
		SectionIDs: []uuid.UUID{ownSection},
	}
	teacher := &Viewer{
		PersonID:           &person,
		SectionIDs:         []uuid.UUID{ownSection},
		SubjectOfferingIDs: []uuid.UUID{offering},
	}

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
			name:       "unrestricted matches every row",
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
			name:        "a nil decision reach unions the roles held",
			viewer:      teacher,
			decision:    authorization.Decision{Allowed: true},
			mustHave:    []string{"audience", "section_id", "subject_offering_id", "owner_person_id"},
			wantArgs:    []uuid.UUID{person, ownSection, offering},
			denyArgs:    []uuid.UUID{otherSection},
			mustNotHave: nil,
		},
		{
			name:        "tenant reach matches every row",
			viewer:      teacher,
			decision:    withScope(authorization.ReachTenant),
			unfiltered:  true,
			mustNotHave: nil,
		},
		{
			name:        "self reach never reaches the pupil's own section or grade",
			viewer:      pupil,
			decision:    withScope(authorization.ReachSelf),
			mustHave:    []string{"audience", "owner_person_id"},
			mustNotHave: []string{"section_id", "grade_level", "subject_offering_id"},
			wantArgs:    []uuid.UUID{person},
			denyArgs:    []uuid.UUID{ownSection},
		},
		{
			name:        "guardian ward reach never reaches the ward's section or grade",
			viewer:      ward,
			decision:    withScope(authorization.ReachGuardianWard),
			mustHave:    []string{"audience", "owner_person_id"},
			mustNotHave: []string{"section_id", "grade_level", "subject_offering_id"},
			wantArgs:    []uuid.UUID{person},
			denyArgs:    []uuid.UUID{ownSection},
		},
		{
			name:     "teacher assignment reach takes its own section only",
			viewer:   teacher,
			decision: withScope(authorization.ReachTeacherAssignment),
			mustHave: []string{"audience", "section_id", "grade_level", "subject_offering_id"},
			wantArgs: []uuid.UUID{person, ownSection, offering},
			denyArgs: []uuid.UUID{otherSection},
		},
		{
			name:        "a teacher without a person record still matches nothing",
			viewer:      &Viewer{},
			decision:    withScope(authorization.ReachTeacherAssignment),
			matchesNone: true,
		},
		{
			name:        "an unknown reach matches nothing",
			viewer:      teacher,
			decision:    withScope("whole_district"),
			matchesNone: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := librarySQL(tc.viewer, tc.decision)

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

func TestLibraryNeverFallsThroughUnfiltered(t *testing.T) {
	person := uuid.New()
	viewers := map[string]*Viewer{
		"nil":     nil,
		"empty":   {},
		"person":  {PersonID: &person},
		"teacher": {PersonID: &person, SectionIDs: []uuid.UUID{uuid.New()}},
	}

	reaches := append([]authorization.Reach{}, authorization.AllReaches...)
	reaches = append(reaches, "whole_district", "")

	for name, v := range viewers {
		for _, r := range reaches {
			if r == authorization.ReachTenant {
				continue
			}
			got, _ := librarySQL(v, withScope(r))
			filtered(t, name+"/"+string(r), got)
		}
		got, _ := librarySQL(v, authorization.Decision{Allowed: true})
		filtered(t, name+"/no reach", got)
	}
}

func audienceArms(q string) int {
	return strings.Count(q, `"content_items"."audience" = `)
}

func carriesValue(args []any, want string) bool {
	for _, a := range args {
		if fmt.Sprint(a) == want {
			return true
		}
	}
	return false
}

func libraryPinned(r authorization.Reach, groups ...[]authorization.Constraint) authorization.Decision {
	d := withScope(r)
	d.Constraints = groups
	return d
}

func pin(field string, values ...string) []authorization.Constraint {
	return []authorization.Constraint{{Field: field, Values: values}}
}

func TestLibraryPinsNarrowTheQuery(t *testing.T) {
	person := uuid.New()
	ownSection := uuid.New()
	offering := uuid.New()
	guardian := uuid.New()
	student := uuid.New()

	nothing, _ := libraryRenders(NoLibraryItem())

	teacher := &Viewer{
		PersonID:           &person,
		SectionIDs:         []uuid.UUID{ownSection},
		SubjectOfferingIDs: []uuid.UUID{offering},
	}
	pupil := &Viewer{
		PersonID:   &person,
		StudentIDs: []uuid.UUID{student},
		SectionIDs: []uuid.UUID{ownSection},
	}
	ward := &Viewer{
		PersonID:   &person,
		GuardianID: &guardian,
		SectionIDs: []uuid.UUID{ownSection},
	}

	unpinned, _ := librarySQL(teacher, withScope(authorization.ReachTeacherAssignment))

	cases := []struct {
		name        string
		viewer      *Viewer
		decision    authorization.Decision
		matchesNone bool
		narrower    bool
		mustHave    []string
		mustNotHave []string
		wantValues  []string
		denyValues  []string
		wantArgs    []uuid.UUID
		denyArgs    []uuid.UUID
	}{
		{
			name:       "a section pin narrows the teacher's query",
			viewer:     teacher,
			decision:   libraryPinned(authorization.ReachTeacherAssignment, pin("section", "9A")),
			narrower:   true,
			mustHave:   []string{"sections", "code"},
			wantValues: []string{"9A"},
			wantArgs:   []uuid.UUID{ownSection},
		},
		{
			name:       "a section pin drops the school and owner audience arms",
			viewer:     teacher,
			decision:   libraryPinned(authorization.ReachTeacherAssignment, pin("section", "9A")),
			narrower:   true,
			denyValues: []string{"school", "owner"},
		},
		{
			name:       "a grade pin reaches grade items and the sections of that grade",
			viewer:     teacher,
			decision:   libraryPinned(authorization.ReachTeacherAssignment, pin("grade_level", "9")),
			narrower:   true,
			mustHave:   []string{"grade_levels", "sections"},
			wantValues: []string{"9"},
			denyValues: []string{"school", "owner"},
		},
		{
			name:       "tenant reach keeps only the pin",
			viewer:     teacher,
			decision:   libraryPinned(authorization.ReachTenant, pin("section", "9A")),
			narrower:   true,
			mustHave:   []string{"sections", "code"},
			wantValues: []string{"9A"},
			denyValues: []string{"school", "owner"},
			denyArgs:   []uuid.UUID{person, ownSection, offering},
		},
		{
			name:        "an untranslatable pin denies",
			viewer:      teacher,
			decision:    libraryPinned(authorization.ReachTeacherAssignment, pin("campus", "north")),
			matchesNone: true,
		},
		{
			name:        "an empty pin denies",
			viewer:      teacher,
			decision:    libraryPinned(authorization.ReachTeacherAssignment, pin("section")),
			matchesNone: true,
		},
		{
			name:       "one untranslatable group among translatable ones is dropped, not fatal",
			viewer:     teacher,
			decision:   libraryPinned(authorization.ReachTeacherAssignment, pin("section", "9A"), pin("campus", "north")),
			narrower:   true,
			wantValues: []string{"9A"},
			denyValues: []string{"north"},
		},
		{
			name:        "a pinned pupil reaches nothing",
			viewer:      pupil,
			decision:    libraryPinned(authorization.ReachSelf, pin("section", "9A")),
			denyValues:  []string{"school", "owner"},
			denyArgs:    []uuid.UUID{person},
			mustNotHave: []string{"owner_person_id"},
		},
		{
			name:        "a pinned guardian reaches nothing",
			viewer:      ward,
			decision:    libraryPinned(authorization.ReachGuardianWard, pin("section", "9A")),
			denyValues:  []string{"school", "owner"},
			denyArgs:    []uuid.UUID{person},
			mustNotHave: []string{"owner_person_id"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := librarySQL(tc.viewer, tc.decision)

			filtered(t, tc.name, got)

			if tc.matchesNone {
				if got != nothing {
					t.Fatalf("expected the deny predicate %q, got %q", nothing, got)
				}
				return
			}
			if tc.narrower {
				if got == unpinned {
					t.Fatalf("the pinned query equals the unpinned one %q", got)
				}
				if audienceArms(got) >= audienceArms(unpinned) {
					t.Fatalf("expected fewer audience arms than %q, got %q", unpinned, got)
				}
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

func TestLibraryPinsNeverWiden(t *testing.T) {
	person := uuid.New()
	section := uuid.New()
	offering := uuid.New()
	guardian := uuid.New()
	student := uuid.New()

	viewers := map[string]*Viewer{
		"empty":    {},
		"person":   {PersonID: &person},
		"teacher":  {PersonID: &person, SectionIDs: []uuid.UUID{section}, SubjectOfferingIDs: []uuid.UUID{offering}},
		"pupil":    {PersonID: &person, StudentIDs: []uuid.UUID{student}, SectionIDs: []uuid.UUID{section}},
		"guardian": {PersonID: &person, GuardianID: &guardian},
	}
	groups := map[string][]authorization.Constraint{
		"section":      pin("section", "9A"),
		"grade":        pin("grade_level", "9"),
		"untranslated": pin("campus", "north"),
	}

	reaches := append([]authorization.Reach{}, authorization.AllReaches...)
	reaches = append(reaches, "whole_district", "")

	for name, v := range viewers {
		for _, r := range reaches {
			for label, group := range groups {
				got, args := librarySQL(v, libraryPinned(r, group))
				where := name + "/" + string(r) + "/" + label
				filtered(t, where, got)
				if carriesValue(args, "school") || carriesValue(args, "owner") {
					t.Fatalf("%s: a pinned grant kept a school or owner arm: %q %v", where, got, args)
				}
			}
		}
	}
}

func libraryWriteSQL(v *Viewer, d authorization.Decision) (string, []any) {
	return libraryRenders(LibraryItemsWritableBy(v, d))
}

func libraryWhereOf(query string) string {
	const marker = " WHERE "
	i := strings.Index(query, marker)
	if i < 0 {
		return ""
	}
	return query[i+len(marker):]
}

func libraryOwnershipTerm(position int) string {
	return fmt.Sprintf(`"content_items"."owner_person_id" = $%d`, position)
}

func TestLibraryWriteScopeAddsOwnershipToTheReadScope(t *testing.T) {
	person := uuid.New()
	ownSection := uuid.New()
	offering := uuid.New()
	guardian := uuid.New()
	student := uuid.New()

	nothing, _ := libraryRenders(NoLibraryItem())

	pupil := &Viewer{
		PersonID:   &person,
		StudentIDs: []uuid.UUID{student},
		SectionIDs: []uuid.UUID{ownSection},
	}
	ward := &Viewer{
		PersonID:   &person,
		GuardianID: &guardian,
		SectionIDs: []uuid.UUID{ownSection},
	}
	teacher := &Viewer{
		PersonID:           &person,
		SectionIDs:         []uuid.UUID{ownSection},
		SubjectOfferingIDs: []uuid.UUID{offering},
	}

	cases := []struct {
		name        string
		viewer      *Viewer
		decision    authorization.Decision
		sameAsRead  bool
		matchesNone bool
	}{
		{
			name:     "a pupil at self reach may only touch what it owns",
			viewer:   pupil,
			decision: withScope(authorization.ReachSelf),
		},
		{
			name:     "a guardian may only touch what it owns",
			viewer:   ward,
			decision: withScope(authorization.ReachGuardianWard),
		},
		{
			name:     "a teacher at assignment reach may only touch what it owns",
			viewer:   teacher,
			decision: withScope(authorization.ReachTeacherAssignment),
		},
		{
			name:     "a teacher without a reach may only touch what it owns",
			viewer:   teacher,
			decision: authorization.Decision{Allowed: true},
		},
		{
			name:     "a pinned teacher may only touch what it owns",
			viewer:   teacher,
			decision: libraryPinned(authorization.ReachTeacherAssignment, pin("section", "9A")),
		},
		{
			name:     "an untranslatable pin denies and still demands ownership",
			viewer:   teacher,
			decision: libraryPinned(authorization.ReachTeacherAssignment, pin("campus", "north")),
		},
		{
			name:     "an unknown reach denies and still demands ownership",
			viewer:   teacher,
			decision: withScope("whole_district"),
		},
		{
			name:       "tenant reach writes as widely as it reads",
			viewer:     teacher,
			decision:   withScope(authorization.ReachTenant),
			sameAsRead: true,
		},
		{
			name:       "an unrestricted viewer writes as widely as it reads",
			viewer:     &Viewer{Unrestricted: true},
			decision:   authorization.Decision{Allowed: true},
			sameAsRead: true,
		},
		{
			name:        "a nil viewer writes nothing",
			viewer:      nil,
			decision:    withScope(authorization.ReachTenant),
			matchesNone: true,
		},
		{
			name:        "a viewer without a person record writes nothing",
			viewer:      &Viewer{SectionIDs: []uuid.UUID{ownSection}},
			decision:    withScope(authorization.ReachTeacherAssignment),
			matchesNone: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			read, readArgs := librarySQL(tc.viewer, tc.decision)
			got, args := libraryWriteSQL(tc.viewer, tc.decision)

			if tc.matchesNone {
				if got != nothing {
					t.Fatalf("expected the deny predicate %q, got %q", nothing, got)
				}
				return
			}
			if tc.sameAsRead {
				if got != read {
					t.Fatalf("expected the read predicate %q, got %q", read, got)
				}
				return
			}

			ownership := " AND " + libraryOwnershipTerm(len(args))
			bare := libraryWhereOf(read) + ownership
			grouped := "(" + libraryWhereOf(read) + ")" + ownership
			if where := libraryWhereOf(got); where != bare && where != grouped {
				t.Fatalf("expected the read clause and %q, got %q", ownership, where)
			}
			if len(args) != len(readArgs)+1 {
				t.Fatalf("expected one argument more than the read %v, got %v", readArgs, args)
			}
			if !carries(args[len(args)-1:], person) {
				t.Fatalf("the ownership term must bind the caller %s, got %v", person, args)
			}
		})
	}
}

func TestLibraryWriteScopeAlwaysDemandsOwnershipBelowTenantReach(t *testing.T) {
	person := uuid.New()
	section := uuid.New()
	offering := uuid.New()
	guardian := uuid.New()
	student := uuid.New()

	nothing, _ := libraryRenders(NoLibraryItem())

	viewers := map[string]*Viewer{
		"nil":      nil,
		"empty":    {},
		"person":   {PersonID: &person},
		"teacher":  {PersonID: &person, SectionIDs: []uuid.UUID{section}, SubjectOfferingIDs: []uuid.UUID{offering}},
		"pupil":    {PersonID: &person, StudentIDs: []uuid.UUID{student}, SectionIDs: []uuid.UUID{section}},
		"guardian": {PersonID: &person, GuardianID: &guardian},
	}
	decisions := map[string]func(authorization.Reach) authorization.Decision{
		"plain":   withScope,
		"section": func(r authorization.Reach) authorization.Decision { return libraryPinned(r, pin("section", "9A")) },
		"campus":  func(r authorization.Reach) authorization.Decision { return libraryPinned(r, pin("campus", "north")) },
	}

	reaches := append([]authorization.Reach{}, authorization.AllReaches...)
	reaches = append(reaches, "whole_district", "")

	for name, v := range viewers {
		for _, r := range reaches {
			if r == authorization.ReachTenant {
				continue
			}
			for label, decide := range decisions {
				where := name + "/" + string(r) + "/" + label
				got, args := libraryWriteSQL(v, decide(r))

				filtered(t, where, got)

				if v == nil || v.PersonID == nil {
					if got != nothing {
						t.Fatalf("%s: expected the deny predicate %q, got %q", where, nothing, got)
					}
					continue
				}
				if !strings.HasSuffix(libraryWhereOf(got), libraryOwnershipTerm(len(args))) {
					t.Fatalf("%s: the write predicate lost its ownership term: %q", where, got)
				}
				if !carries(args[len(args)-1:], person) {
					t.Fatalf("%s: the ownership term must bind the caller %s, got %v", where, person, args)
				}
			}
		}
	}
}

func TestLibraryReachesTheOfferingsAPupilStudies(t *testing.T) {
	person := uuid.New()
	ownSection := uuid.New()
	studied := uuid.New()
	otherOffering := uuid.New()
	guardian := uuid.New()
	student := uuid.New()
	wardOffering := uuid.New()

	pupil := &Viewer{
		PersonID:            &person,
		StudentIDs:          []uuid.UUID{student},
		SectionIDs:          []uuid.UUID{ownSection},
		EnrolledOfferingIDs: []uuid.UUID{studied},
	}
	ward := &Viewer{
		PersonID:            &person,
		GuardianID:          &guardian,
		StudentIDs:          []uuid.UUID{student},
		SectionIDs:          []uuid.UUID{ownSection},
		EnrolledOfferingIDs: []uuid.UUID{studied},
		WardOfferingIDs:     []uuid.UUID{wardOffering},
	}

	cases := []struct {
		name        string
		viewer      *Viewer
		decision    authorization.Decision
		mustHave    []string
		mustNotHave []string
		wantValues  []string
		wantArgs    []uuid.UUID
		denyArgs    []uuid.UUID
	}{
		{
			name:       "self reach reaches an offering the pupil is enrolled in",
			viewer:     pupil,
			decision:   withScope(authorization.ReachSelf),
			mustHave:   []string{"audience", "owner_person_id", "subject_offering_id"},
			wantValues: []string{"offering"},
			wantArgs:   []uuid.UUID{person, studied},
		},
		{
			name:     "self reach never reaches an offering the pupil does not study",
			viewer:   pupil,
			decision: withScope(authorization.ReachSelf),
			denyArgs: []uuid.UUID{otherOffering},
		},
		{
			name:        "an enrolled pupil still never reaches its own section",
			viewer:      pupil,
			decision:    withScope(authorization.ReachSelf),
			mustNotHave: []string{"section_id", "sections"},
			denyArgs:    []uuid.UUID{ownSection},
		},
		{
			name:        "an enrolled pupil still never reaches its own grade",
			viewer:      pupil,
			decision:    withScope(authorization.ReachSelf),
			mustNotHave: []string{"grade_level"},
			wantValues:  []string{"school", "owner", "offering"},
		},
		{
			name:        "guardian ward reach takes the ward's offerings and none others",
			viewer:      ward,
			decision:    withScope(authorization.ReachGuardianWard),
			mustHave:    []string{"subject_offering_id"},
			mustNotHave: []string{"section_id", "grade_level"},
			wantArgs:    []uuid.UUID{person, wardOffering},
			denyArgs:    []uuid.UUID{studied, otherOffering, ownSection},
		},
		{
			name:        "self reach withholds the ward's offerings from a viewer who is also a guardian",
			viewer:      ward,
			decision:    withScope(authorization.ReachSelf),
			mustHave:    []string{"subject_offering_id"},
			mustNotHave: []string{"section_id", "grade_level"},
			wantArgs:    []uuid.UUID{person, studied},
			denyArgs:    []uuid.UUID{wardOffering, otherOffering, ownSection},
		},
		{
			name:        "a teacher who studies nothing keeps the arms it had",
			viewer:      &Viewer{PersonID: &person, SectionIDs: []uuid.UUID{ownSection}},
			decision:    withScope(authorization.ReachSelf),
			mustHave:    []string{"audience", "owner_person_id"},
			mustNotHave: []string{"subject_offering_id", "section_id", "grade_level"},
			wantArgs:    []uuid.UUID{person},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := librarySQL(tc.viewer, tc.decision)

			filtered(t, tc.name, got)

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
			for _, want := range tc.wantValues {
				if !carriesValue(args, want) {
					t.Fatalf("expected %q among the arguments %v of %q", want, args, got)
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

func TestLibraryOfferingArmAddsExactlyOneAudienceArm(t *testing.T) {
	person := uuid.New()
	student := uuid.New()
	studied := uuid.New()

	bare := &Viewer{PersonID: &person, StudentIDs: []uuid.UUID{student}}
	enrolled := &Viewer{PersonID: &person, StudentIDs: []uuid.UUID{student}, EnrolledOfferingIDs: []uuid.UUID{studied}}

	before, _ := librarySQL(bare, withScope(authorization.ReachSelf))
	after, _ := librarySQL(enrolled, withScope(authorization.ReachSelf))

	if audienceArms(after) != audienceArms(before)+1 {
		t.Fatalf("expected one arm more than %q, got %q", before, after)
	}
}

func TestLibraryPinnedEnrolledPupilStillReachesNothing(t *testing.T) {
	person := uuid.New()
	student := uuid.New()
	studied := uuid.New()

	pupil := &Viewer{PersonID: &person, StudentIDs: []uuid.UUID{student}, EnrolledOfferingIDs: []uuid.UUID{studied}}

	got, args := librarySQL(pupil, libraryPinned(authorization.ReachSelf, pin("section", "9A")))

	filtered(t, "pinned enrolled pupil", got)

	if strings.Contains(got, "subject_offering_id") {
		t.Fatalf("a pinned grant kept the offering arm: %q", got)
	}
	if carries(args, studied) || carriesValue(args, "school") || carriesValue(args, "owner") {
		t.Fatalf("a pinned grant kept a personal arm: %q %v", got, args)
	}
}

func TestLibraryWriteStillDemandsOwnershipFromAnEnrolledPupil(t *testing.T) {
	person := uuid.New()
	student := uuid.New()
	studied := uuid.New()
	guardian := uuid.New()
	wardOffering := uuid.New()

	both := &Viewer{
		PersonID:            &person,
		StudentIDs:          []uuid.UUID{student},
		GuardianID:          &guardian,
		EnrolledOfferingIDs: []uuid.UUID{studied},
		WardOfferingIDs:     []uuid.UUID{wardOffering},
	}

	cases := map[string]struct {
		reach   authorization.Reach
		reaches uuid.UUID
		hidden  uuid.UUID
	}{
		"self":          {authorization.ReachSelf, studied, wardOffering},
		"guardian_ward": {authorization.ReachGuardianWard, wardOffering, studied},
	}

	for name, tc := range cases {
		where := "both/" + name
		read, readArgs := librarySQL(both, withScope(tc.reach))
		got, args := libraryWriteSQL(both, withScope(tc.reach))

		filtered(t, where, got)

		if !strings.Contains(read, "subject_offering_id") {
			t.Fatalf("%s: expected the read predicate to carry the offering arm: %q", where, read)
		}
		if !strings.Contains(got, "subject_offering_id") {
			t.Fatalf("%s: expected the write predicate to carry the offering arm: %q", where, got)
		}
		if !carries(args, tc.reaches) {
			t.Fatalf("%s: expected the offering %s among %v of %q", where, tc.reaches, args, got)
		}
		if carries(args, tc.hidden) {
			t.Fatalf("%s: the offering %s belongs to the other reach, got %v of %q", where, tc.hidden, args, got)
		}
		if !strings.HasSuffix(libraryWhereOf(got), libraryOwnershipTerm(len(args))) {
			t.Fatalf("%s: the write predicate lost its ownership term: %q", where, got)
		}
		if len(args) != len(readArgs)+1 {
			t.Fatalf("%s: expected one argument more than the read %v, got %v", where, readArgs, args)
		}
		if !carries(args[len(args)-1:], person) {
			t.Fatalf("%s: the ownership term must bind the caller %s, got %v", where, person, args)
		}
	}
}

func TestLibrarySelfAndGuardianWardResolveDifferently(t *testing.T) {
	person := uuid.New()
	guardian := uuid.New()
	student := uuid.New()
	ownSection := uuid.New()
	studied := uuid.New()
	firstWard := uuid.New()
	secondWard := uuid.New()

	both := &Viewer{
		PersonID:            &person,
		GuardianID:          &guardian,
		StudentIDs:          []uuid.UUID{student},
		SectionIDs:          []uuid.UUID{ownSection},
		EnrolledOfferingIDs: []uuid.UUID{studied},
		WardOfferingIDs:     []uuid.UUID{firstWard, secondWard},
	}

	selfSQL, selfArgs := librarySQL(both, withScope(authorization.ReachSelf))
	wardSQL, wardArgs := librarySQL(both, withScope(authorization.ReachGuardianWard))

	filtered(t, "self", selfSQL)
	filtered(t, "guardian_ward", wardSQL)

	if selfSQL == wardSQL && fmt.Sprint(selfArgs) == fmt.Sprint(wardArgs) {
		t.Fatalf("self and guardian_ward are indistinguishable: %q with %v", selfSQL, selfArgs)
	}
	if selfSQL == wardSQL {
		t.Fatalf("expected a different offering arm width, got %q for both", selfSQL)
	}
	if !carries(selfArgs, studied) {
		t.Fatalf("self reach must take the viewer's own offerings, got %v of %q", selfArgs, selfSQL)
	}
	if carries(selfArgs, firstWard) || carries(selfArgs, secondWard) {
		t.Fatalf("self reach leaked a ward offering: %v of %q", selfArgs, selfSQL)
	}
	if !carries(wardArgs, firstWard) || !carries(wardArgs, secondWard) {
		t.Fatalf("guardian_ward reach must take every ward offering, got %v of %q", wardArgs, wardSQL)
	}
	if carries(wardArgs, studied) {
		t.Fatalf("guardian_ward reach leaked the viewer's own offering: %v of %q", wardArgs, wardSQL)
	}
	for _, banned := range []string{"section_id", "sections", "grade_level"} {
		if strings.Contains(selfSQL, banned) {
			t.Fatalf("self reach must carry no %q arm: %q", banned, selfSQL)
		}
		if strings.Contains(wardSQL, banned) {
			t.Fatalf("guardian_ward reach must carry no %q arm: %q", banned, wardSQL)
		}
	}
	if carries(selfArgs, ownSection) || carries(wardArgs, ownSection) {
		t.Fatalf("a personal reach bound a section: %v and %v", selfArgs, wardArgs)
	}
}

func libraryOwnerTerms(query string) int {
	return strings.Count(query, `"content_items"."owner_person_id"`)
}

func TestLibraryPinLeavesOnlyTheOwnershipTermTheStatusGateAdds(t *testing.T) {
	person := uuid.New()
	ownSection := uuid.New()
	offering := uuid.New()

	teacher := &Viewer{
		PersonID:           &person,
		SectionIDs:         []uuid.UUID{ownSection},
		SubjectOfferingIDs: []uuid.UUID{offering},
	}

	unpinned, _ := librarySQL(teacher, withScope(authorization.ReachTeacherAssignment))
	pinned, _ := librarySQL(teacher, libraryPinned(authorization.ReachTeacherAssignment, pin("section", "9A")))

	if got := libraryOwnerTerms(unpinned); got != 2 {
		t.Fatalf("an unpinned grant must name the owner twice, once for the owner audience arm and once "+
			"for the status gate; it names it %d times in %q", got, unpinned)
	}
	if got := libraryOwnerTerms(pinned); got != 1 {
		t.Fatalf("a pinned grant must name the owner once, for the status gate alone; it names it %d "+
			"times in %q. A second mention is the owner audience arm returning, and a school or owner "+
			"row cannot answer a section pin", got, pinned)
	}
}

func libraryStatusTerm(position int) string {
	return fmt.Sprintf(`("content_items"."status" = $%d OR "content_items"."owner_person_id" = $%d)`,
		position, position+1)
}

func TestLibraryReadScopeAdmitsOnlyPublishedRowsOrTheCallersOwn(t *testing.T) {
	person := uuid.New()
	ownSection := uuid.New()
	offering := uuid.New()
	guardian := uuid.New()
	student := uuid.New()

	viewers := map[string]*Viewer{
		"teacher":  {PersonID: &person, SectionIDs: []uuid.UUID{ownSection}, SubjectOfferingIDs: []uuid.UUID{offering}},
		"pupil":    {PersonID: &person, StudentIDs: []uuid.UUID{student}, EnrolledOfferingIDs: []uuid.UUID{offering}},
		"guardian": {PersonID: &person, GuardianID: &guardian, WardOfferingIDs: []uuid.UUID{offering}},
	}

	reaches := []authorization.Reach{
		authorization.ReachSelf,
		authorization.ReachGuardianWard,
		authorization.ReachTeacherAssignment,
	}

	for name, v := range viewers {
		for _, r := range reaches {
			where := name + "/" + string(r)
			got, args := librarySQL(v, withScope(r))

			filtered(t, where, got)

			if !strings.Contains(got, `"content_items"."status"`) {
				t.Fatalf("%s: the read predicate never mentions status, so a draft is as visible as a "+
					"published row: %q", where, got)
			}
			if !carriesValue(args, "published") {
				t.Fatalf("%s: the read predicate mentions status without binding %q: %q with %v",
					where, "published", got, args)
			}
			if !strings.Contains(got, libraryStatusTerm(indexOfValue(args, "published")+1)) {
				t.Fatalf("%s: expected the status clause to let the owner through their own row: %q",
					where, got)
			}
		}

		got, args := librarySQL(v, authorization.Decision{Allowed: true})
		filtered(t, name+"/no reach", got)
		if !carriesValue(args, "published") {
			t.Fatalf("%s: a decision carrying no reach skipped the status gate: %q with %v", name, got, args)
		}
	}
}

func indexOfValue(args []any, want string) int {
	for i, a := range args {
		if fmt.Sprint(a) == want {
			return i
		}
	}
	return -1
}

func TestLibraryStatusGateHasNoOwnerEscapeWithoutAPerson(t *testing.T) {
	section := uuid.New()
	v := &Viewer{SectionIDs: []uuid.UUID{section}}

	got, args := librarySQL(v, withScope(authorization.ReachTeacherAssignment))

	filtered(t, "no person", got)

	if !carriesValue(args, "published") {
		t.Fatalf("a viewer with no person record escaped the status gate: %q with %v", got, args)
	}
	if libraryOwnerTerms(got) != 0 {
		t.Fatalf("a viewer with no person record cannot own anything, so the escape must not be "+
			"emitted at all: %q", got)
	}
}

func TestLibraryStatusGateSpareTheWidestGrants(t *testing.T) {
	person := uuid.New()
	teacher := &Viewer{PersonID: &person, SectionIDs: []uuid.UUID{uuid.New()}}

	cases := map[string]struct {
		viewer   *Viewer
		decision authorization.Decision
	}{
		"tenant reach":        {teacher, withScope(authorization.ReachTenant)},
		"unrestricted viewer": {&Viewer{Unrestricted: true}, authorization.Decision{Allowed: true}},
	}

	for name, tc := range cases {
		got, _ := librarySQL(tc.viewer, tc.decision)
		if strings.Contains(strings.ToUpper(got), "WHERE") {
			t.Fatalf("%s: expected an unfiltered query, got %q", name, got)
		}
	}
}

func TestLibraryWriteScopeKeepsTheOwnerEscapeIntact(t *testing.T) {
	person := uuid.New()
	ownSection := uuid.New()

	teacher := &Viewer{PersonID: &person, SectionIDs: []uuid.UUID{ownSection}}

	got, args := libraryWriteSQL(teacher, withScope(authorization.ReachTeacherAssignment))

	filtered(t, "write", got)

	if !strings.Contains(got, libraryStatusTerm(indexOfValue(args, "published")+1)) {
		t.Fatalf("the write predicate narrowed the status gate to published alone, which stops an "+
			"author editing their own draft: %q", got)
	}
	if !strings.HasSuffix(libraryWhereOf(got), libraryOwnershipTerm(len(args))) {
		t.Fatalf("the write predicate lost its ownership term: %q", got)
	}
}
