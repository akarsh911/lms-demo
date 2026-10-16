package access

import (
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	entcurriculum "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculum"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
)

func NoCurriculum() predicate.Curriculum { return entcurriculum.IDIn() }

func AnyCurriculum() predicate.Curriculum { return func(*sql.Selector) {} }

func NoCurriculumNode() predicate.CurriculumNode { return entnode.IDIn() }

func AnyCurriculumNode() predicate.CurriculumNode { return func(*sql.Selector) {} }

func NoContentPlacement() predicate.ContentPlacement { return entplacement.IDIn() }

func AnyContentPlacement() predicate.ContentPlacement { return func(*sql.Selector) {} }

func curriculaOfSections(ids []uuid.UUID) predicate.Curriculum {
	return entcurriculum.HasGradeLevelWith(entgrade.HasSectionsWith(entsection.IDIn(ids...)))
}

func curriculaOfSubjectGrades(pairs []SubjectGrade) []predicate.Curriculum {
	ors := make([]predicate.Curriculum, 0, len(pairs))
	for _, pair := range pairs {
		ors = append(ors, entcurriculum.And(
			entcurriculum.SubjectIDEQ(pair.SubjectID),
			entcurriculum.GradeLevelIDEQ(pair.GradeLevelID),
		))
	}
	return ors
}

func curriculaOfEnrolledSections(where predicate.StudentEnrollment) predicate.Curriculum {
	return entcurriculum.HasGradeLevelWith(entgrade.HasSectionsWith(
		entsection.HasEnrollmentsWith(where, entenrollment.StatusEQ(entenrollment.StatusActive)),
	))
}

func curriculumTeachingArms(v *Viewer) []predicate.Curriculum {
	var ors []predicate.Curriculum
	if len(v.SectionIDs) > 0 {
		ors = append(ors, curriculaOfSections(v.SectionIDs))
	}
	return append(ors, curriculaOfSubjectGrades(v.TaughtSubjectGrades)...)
}

func curriculumStudiedArms(v *Viewer) []predicate.Curriculum {
	var ors []predicate.Curriculum
	if len(v.StudentIDs) > 0 {
		ors = append(ors, curriculaOfEnrolledSections(entenrollment.StudentIDIn(v.StudentIDs...)))
	}
	return append(ors, curriculaOfSubjectGrades(v.StudiedSubjectGrades)...)
}

func curriculumWardArms(v *Viewer) []predicate.Curriculum {
	if v.GuardianID == nil {
		return nil
	}
	ors := []predicate.Curriculum{
		curriculaOfEnrolledSections(entenrollment.HasStudentWith(StudentsOfGuardian(v))),
	}
	return append(ors, curriculaOfSubjectGrades(v.WardSubjectGrades)...)
}

func curriculumAnyRoleArms(v *Viewer) []predicate.Curriculum {
	ors := curriculumTeachingArms(v)
	ors = append(ors, curriculumStudiedArms(v)...)
	return append(ors, curriculumWardArms(v)...)
}

func curriculumReadArms(v *Viewer, d authorization.Decision) ([]predicate.Curriculum, bool) {
	if !d.HasReach {
		return curriculumAnyRoleArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachSelf:
		return curriculumStudiedArms(v), false
	case authorization.ReachGuardianWard:
		return curriculumWardArms(v), false
	case authorization.ReachTeacherAssignment:
		return curriculumTeachingArms(v), false
	default:
		return nil, false
	}
}

func curriculumWriteArms(v *Viewer, d authorization.Decision) ([]predicate.Curriculum, bool) {
	if !d.HasReach {
		return curriculumTeachingArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachTeacherAssignment:
		return curriculumTeachingArms(v), false
	case authorization.ReachSelf:
		return nil, false
	case authorization.ReachGuardianWard:
		return nil, false
	default:
		return nil, false
	}
}

func curriculumMatching(c authorization.Constraint) predicate.Curriculum {
	switch c.Field {
	case "section":
		return entcurriculum.HasGradeLevelWith(entgrade.HasSectionsWith(entsection.CodeIn(c.Values...)))
	case "grade_level":
		return entcurriculum.HasGradeLevelWith(entgrade.CodeIn(c.Values...))
	default:
		return NoCurriculum()
	}
}

func CurriculaConstrainedBy(groups [][]authorization.Constraint) predicate.Curriculum {
	if len(groups) == 0 {
		return AnyCurriculum()
	}

	ors := make([]predicate.Curriculum, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.Curriculum, 0, len(group))
		for _, c := range group {
			ands = append(ands, curriculumMatching(c))
		}
		ors = append(ors, entcurriculum.And(ands...))
	}
	if len(ors) == 0 {
		return NoCurriculum()
	}
	return entcurriculum.Or(ors...)
}

func curriculumPinsUsable(groups [][]authorization.Constraint) bool {
	for _, group := range groups {
		if translatable(group) {
			return true
		}
	}
	return len(groups) == 0
}

func curriculumDenies(d authorization.Decision, arms []predicate.Curriculum, all bool) bool {
	if !curriculumPinsUsable(d.Constraints) {
		return true
	}
	return !all && len(arms) == 0
}

func curriculumUnfiltered(d authorization.Decision, all bool) bool {
	return all && len(d.Constraints) == 0
}

func curriculumNarrowed(d authorization.Decision, arms []predicate.Curriculum, all bool) predicate.Curriculum {
	if curriculumDenies(d, arms, all) {
		return NoCurriculum()
	}
	if curriculumUnfiltered(d, all) {
		return AnyCurriculum()
	}
	if len(d.Constraints) == 0 {
		return entcurriculum.Or(arms...)
	}
	pinned := CurriculaConstrainedBy(d.Constraints)
	if all {
		return pinned
	}
	return entcurriculum.And(entcurriculum.Or(arms...), pinned)
}

func CurriculaFor(v *Viewer, d authorization.Decision) predicate.Curriculum {
	if v == nil {
		return NoCurriculum()
	}
	if v.Unrestricted {
		return AnyCurriculum()
	}
	arms, all := curriculumReadArms(v, d)
	return curriculumNarrowed(d, arms, all)
}

func CurriculaWritableBy(v *Viewer, d authorization.Decision) predicate.Curriculum {
	if v == nil {
		return NoCurriculum()
	}
	if v.Unrestricted {
		return AnyCurriculum()
	}
	arms, all := curriculumWriteArms(v, d)
	return curriculumNarrowed(d, arms, all)
}

func curriculumNodesUnder(v *Viewer, d authorization.Decision, arms []predicate.Curriculum, all bool) predicate.CurriculumNode {
	if v.Unrestricted {
		return AnyCurriculumNode()
	}
	if curriculumDenies(d, arms, all) {
		return NoCurriculumNode()
	}
	if curriculumUnfiltered(d, all) {
		return AnyCurriculumNode()
	}
	return entnode.HasCurriculumWith(curriculumNarrowed(d, arms, all))
}

func CurriculumNodesFor(v *Viewer, d authorization.Decision) predicate.CurriculumNode {
	if v == nil {
		return NoCurriculumNode()
	}
	arms, all := curriculumReadArms(v, d)
	return curriculumNodesUnder(v, d, arms, all)
}

func CurriculumNodesWritableBy(v *Viewer, d authorization.Decision) predicate.CurriculumNode {
	if v == nil {
		return NoCurriculumNode()
	}
	arms, all := curriculumWriteArms(v, d)
	return curriculumNodesUnder(v, d, arms, all)
}

func contentPlacementsUnder(v *Viewer, d authorization.Decision, arms []predicate.Curriculum, all bool) predicate.ContentPlacement {
	if v.Unrestricted {
		return AnyContentPlacement()
	}
	if curriculumDenies(d, arms, all) {
		return NoContentPlacement()
	}
	if curriculumUnfiltered(d, all) {
		return AnyContentPlacement()
	}
	return entplacement.HasCurriculumWith(curriculumNarrowed(d, arms, all))
}

func ContentPlacementsFor(v *Viewer, d authorization.Decision) predicate.ContentPlacement {
	if v == nil {
		return NoContentPlacement()
	}
	arms, all := curriculumReadArms(v, d)
	return contentPlacementsUnder(v, d, arms, all)
}

func ContentPlacementsWritableBy(v *Viewer, d authorization.Decision) predicate.ContentPlacement {
	if v == nil {
		return NoContentPlacement()
	}
	arms, all := curriculumWriteArms(v, d)
	return contentPlacementsUnder(v, d, arms, all)
}
