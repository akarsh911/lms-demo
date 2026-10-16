package timetablegen

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
)

var (
	sixA    = uuid.MustParse("11111111-1111-1111-1111-111111111111")
	sixB    = uuid.MustParse("22222222-2222-2222-2222-222222222222")
	mrsRao  = uuid.MustParse("33333333-3333-3333-3333-333333333333")
	mrSingh = uuid.MustParse("44444444-4444-4444-4444-444444444444")
	maths   = uuid.MustParse("55555555-5555-5555-5555-555555555555")
	hindi   = uuid.MustParse("66666666-6666-6666-6666-666666666666")
	science = uuid.MustParse("77777777-7777-7777-7777-777777777777")
	foreign = uuid.MustParse("88888888-8888-8888-8888-888888888888")
)

func twoSections() *Export {
	export := &Export{}
	export.School.Sections = []Section{
		{ID: sixA.String(), Code: "6A", Name: "A", GradeName: "Class VI"},
		{ID: sixB.String(), Code: "6B", Name: "B", GradeName: "Class VI"},
	}
	export.School.Offerings = []Offering{
		{ID: maths.String(), SectionID: sixA.String(), SubjectCode: "MATH"},
		{ID: hindi.String(), SectionID: sixA.String(), SubjectCode: "HIN"},
		{ID: science.String(), SectionID: sixA.String(), SubjectCode: "SCI"},
		{ID: foreign.String(), SectionID: sixB.String(), SubjectCode: "MATH"},
	}
	return export
}

func section(id, classTeacher uuid.UUID) *tenantent.Section {
	out := &tenantent.Section{ID: id}
	if classTeacher != uuid.Nil {
		held := classTeacher
		out.ClassTeacherID = &held
	}
	return out
}

func assignment(teacher, sectionID uuid.UUID, offering *uuid.UUID,
	status entteacherassign.Status) *tenantent.TeacherAssignment {

	return &tenantent.TeacherAssignment{
		TeacherID:         teacher,
		SectionID:         sectionID,
		SubjectOfferingID: offering,
		Status:            status,
		RoleType:          "subject_teacher",
	}
}

func warned(warnings []string, fragment string) bool {
	for _, warning := range warnings {
		if strings.Contains(warning, fragment) {
			return true
		}
	}
	return false
}

func TestAClassTeacherResolvesToEverySubjectTheyHoldInTheirOwnSection(t *testing.T) {
	held := classTeachingOf(
		[]*tenantent.Section{section(sixA, mrsRao)},
		[]*tenantent.TeacherAssignment{
			assignment(mrsRao, sixA, &maths, entteacherassign.StatusActive),
			assignment(mrsRao, sixA, &hindi, entteacherassign.StatusActive),
			assignment(mrSingh, sixA, &science, entteacherassign.StatusActive),
		},
	)

	rules := []shared.DailyContactRule{{SectionID: sixA.String(), ClassTeacher: true}}
	resolved, warnings := dailyContactOf(rules, twoSections(), held)

	if len(resolved) != 1 {
		t.Fatalf("wanted one rule, got %d with warnings %v", len(resolved), warnings)
	}
	want := []string{maths.String(), hindi.String()}
	if len(resolved[0].OfferingIDs) != 2 ||
		!contains(resolved[0].OfferingIDs, want[0]) ||
		!contains(resolved[0].OfferingIDs, want[1]) {
		t.Fatalf("wanted the class teacher's two subjects, got %v", resolved[0].OfferingIDs)
	}
	if contains(resolved[0].OfferingIDs, science.String()) {
		t.Fatal("science is another teacher's subject and must not answer this rule")
	}
	if resolved[0].MinPerDay != 1 {
		t.Fatalf("wanted a floor of one lesson a day, got %d", resolved[0].MinPerDay)
	}
}

func TestASectionWideAssignmentSaysNothingAboutWhichSubjectIsTaught(t *testing.T) {
	held := classTeachingOf(
		[]*tenantent.Section{section(sixA, mrsRao)},
		[]*tenantent.TeacherAssignment{
			assignment(mrsRao, sixA, nil, entteacherassign.StatusActive),
		},
	)
	if len(held.taught[sixA.String()]) != 0 {
		t.Fatalf("an assignment carrying no subject offering answered with %v",
			held.taught[sixA.String()])
	}

	rules := []shared.DailyContactRule{{SectionID: sixA.String(), ClassTeacher: true}}
	resolved, warnings := dailyContactOf(rules, twoSections(), held)
	if len(resolved) != 0 {
		t.Fatalf("a rule with no lessons behind it was sent anyway: %v", resolved)
	}
	if !warned(warnings, "holds no subject in it") {
		t.Fatalf("the reason was never said out loud: %v", warnings)
	}
}

func TestARevokedAssignmentIsNotASubjectTheClassTeacherStillHolds(t *testing.T) {
	held := classTeachingOf(
		[]*tenantent.Section{section(sixA, mrsRao)},
		[]*tenantent.TeacherAssignment{
			assignment(mrsRao, sixA, &maths, entteacherassign.StatusActive),
			assignment(mrsRao, sixA, &hindi, entteacherassign.StatusRevoked),
		},
	)
	if got := held.taught[sixA.String()]; len(got) != 1 || got[0] != maths.String() {
		t.Fatalf("wanted maths alone, got %v", got)
	}
}

func TestASectionWithNoClassTeacherIsSaidSoRatherThanSilentlySkipped(t *testing.T) {
	held := classTeachingOf([]*tenantent.Section{section(sixA, uuid.Nil)}, nil)

	rules := []shared.DailyContactRule{{SectionID: sixA.String(), ClassTeacher: true}}
	resolved, warnings := dailyContactOf(rules, twoSections(), held)
	if len(resolved) != 0 {
		t.Fatalf("wanted no rule, got %v", resolved)
	}
	if !warned(warnings, "no class teacher recorded") {
		t.Fatalf("wanted a warning naming the gap, got %v", warnings)
	}
}

func TestOfferingsNamedByHandAreKeptOnlyWhereTheyBelongToTheSection(t *testing.T) {
	rules := []shared.DailyContactRule{{
		SectionID:   sixA.String(),
		OfferingIDs: []string{maths.String(), foreign.String()},
		MinPerDay:   2,
	}}
	resolved, warnings := dailyContactOf(rules, twoSections(), classTeaching{})

	if len(resolved) != 1 {
		t.Fatalf("wanted the rule kept over what does belong, got %v", resolved)
	}
	if len(resolved[0].OfferingIDs) != 1 || resolved[0].OfferingIDs[0] != maths.String() {
		t.Fatalf("wanted maths alone, got %v", resolved[0].OfferingIDs)
	}
	if resolved[0].MinPerDay != 2 {
		t.Fatalf("the caller's floor of two was lost: %d", resolved[0].MinPerDay)
	}
	if !warned(warnings, "does not belong to it") {
		t.Fatalf("a dropped offering went unmentioned: %v", warnings)
	}
}

func TestARuleNamingOnlyOtherSectionsSubjectsIsDroppedWithAReason(t *testing.T) {
	rules := []shared.DailyContactRule{{
		SectionID:   sixA.String(),
		OfferingIDs: []string{foreign.String()},
	}}
	resolved, warnings := dailyContactOf(rules, twoSections(), classTeaching{})
	if len(resolved) != 0 {
		t.Fatalf("wanted no rule, got %v", resolved)
	}
	if !warned(warnings, "named no subject that belongs to it") {
		t.Fatalf("wanted a warning, got %v", warnings)
	}
}

func TestARuleForASectionThisWeekDoesNotCoverIsDroppedWithAReason(t *testing.T) {
	stranger := uuid.MustParse("99999999-9999-9999-9999-999999999999")
	rules := []shared.DailyContactRule{{SectionID: stranger.String(), ClassTeacher: true}}
	resolved, warnings := dailyContactOf(rules, twoSections(), classTeaching{})
	if len(resolved) != 0 {
		t.Fatalf("wanted no rule, got %v", resolved)
	}
	if !warned(warnings, "period scheme does not cover") {
		t.Fatalf("wanted a warning naming the section, got %v", warnings)
	}
}

func TestTheResolvedOfferingsAreOrderedSoTwoRunsSendTheSameRequest(t *testing.T) {
	held := classTeachingOf(
		[]*tenantent.Section{section(sixA, mrsRao)},
		[]*tenantent.TeacherAssignment{
			assignment(mrsRao, sixA, &hindi, entteacherassign.StatusActive),
			assignment(mrsRao, sixA, &maths, entteacherassign.StatusActive),
		},
	)
	rules := []shared.DailyContactRule{{SectionID: sixA.String(), ClassTeacher: true}}
	resolved, _ := dailyContactOf(rules, twoSections(), held)

	got := resolved[0].OfferingIDs
	if got[0] > got[1] {
		t.Fatalf("the offering set came back unsorted: %v", got)
	}
}

func TestTheRequestCarriesTheResolvedRuleAndNotTheUnresolvedOne(t *testing.T) {
	job := &tenantent.TimetableGenerationJob{
		ID:         uuid.New(),
		MaxSeconds: 30,
		Options: shared.GenerationOptions{
			DailyContact: []shared.DailyContactRule{
				{SectionID: sixA.String(), ClassTeacher: true},
			},
		},
	}
	contact := []DailyContact{{
		SectionID:   sixA.String(),
		OfferingIDs: []string{hindi.String(), maths.String()},
		MinPerDay:   1,
	}}

	request := buildRequest(job, twoSections(), false, contact)
	if len(request.Config.DailyContact) != 1 {
		t.Fatalf("the rule never reached the solver request: %+v", request.Config)
	}
	if len(request.Config.DailyContact[0].OfferingIDs) != 2 {
		t.Fatalf("the offering set was lost: %+v", request.Config.DailyContact[0])
	}
	if request.Config.DailyContact[0].SectionID != sixA.String() {
		t.Fatalf("wanted section 6A, got %s", request.Config.DailyContact[0].SectionID)
	}
}

func TestNoDailyContactRuleMeansTheKeyIsAbsentFromTheRequestBody(t *testing.T) {
	job := &tenantent.TimetableGenerationJob{ID: uuid.New(), MaxSeconds: 30}
	request := buildRequest(job, twoSections(), false, nil)
	if request.Config.DailyContact != nil {
		t.Fatalf("wanted nothing sent, got %v", request.Config.DailyContact)
	}
}
