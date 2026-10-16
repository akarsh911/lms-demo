package access

import (
	"entgo.io/ent/dialect/sql"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entstudentassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentassignment"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
)

func NoStudent() predicate.Student { return entstudent.IDIn() }

func StudentsSelf(v *Viewer) predicate.Student {
	if v == nil || len(v.StudentIDs) == 0 {
		return NoStudent()
	}
	return entstudent.IDIn(v.StudentIDs...)
}

func StudentsOfGuardian(v *Viewer) predicate.Student { return studentsOfGuardian(v, false) }

func StudentsOfGuardianAcademic(v *Viewer) predicate.Student { return studentsOfGuardian(v, true) }

func studentsOfGuardian(v *Viewer, academic bool) predicate.Student {
	if v == nil || v.GuardianID == nil {
		return NoStudent()
	}
	link := []predicate.StudentGuardian{
		entlink.GuardianID(*v.GuardianID),
		entlink.StatusEQ(entlink.StatusActive),
	}
	if academic {
		link = append(link, entlink.CanViewAcademic(true))
	}
	return entstudent.HasGuardianLinksWith(link...)
}

func StudentsTaughtBy(v *Viewer) predicate.Student {
	if v == nil {
		return NoStudent()
	}

	var ors []predicate.Student
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entstudent.HasEnrollmentsWith(
			entenrollment.SectionIDIn(v.SectionIDs...),
			entenrollment.StatusEQ(entenrollment.StatusActive),
		))
	}
	if len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, entstudent.HasSubjectEnrollmentsWith(
			entsubjenroll.SubjectOfferingIDIn(v.SubjectOfferingIDs...),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		))
	}
	if len(ors) == 0 {
		return NoStudent()
	}
	return entstudent.Or(ors...)
}

func StudentsAnyRole(v *Viewer) predicate.Student { return studentsAnyRole(v, false) }

func studentsAnyRole(v *Viewer, academic bool) predicate.Student {
	if v == nil {
		return NoStudent()
	}

	var ors []predicate.Student
	if v.GuardianID != nil {
		ors = append(ors, studentsOfGuardian(v, academic))
	}
	if len(v.SectionIDs) > 0 || len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, StudentsTaughtBy(v))
	}
	if len(v.StudentIDs) > 0 {
		ors = append(ors, StudentsSelf(v))
	}
	if len(ors) == 0 {
		return NoStudent()
	}
	return entstudent.Or(ors...)
}

func AnyStudent() predicate.Student { return func(*sql.Selector) {} }

func StudentsFor(v *Viewer, d authorization.Decision) predicate.Student {
	return studentsFor(v, d, false)
}

func StudentsForAcademic(v *Viewer, d authorization.Decision) predicate.Student {
	return studentsFor(v, d, true)
}

func studentsFor(v *Viewer, d authorization.Decision, academic bool) predicate.Student {
	if v == nil {
		return NoStudent()
	}
	if v.Unrestricted {
		return AnyStudent()
	}

	return entstudent.And(scopedStudents(v, d, academic), StudentsConstrainedBy(d.Constraints))
}

func scopedStudents(v *Viewer, d authorization.Decision, academic bool) predicate.Student {
	if !d.HasReach {
		return studentsAnyRole(v, academic)
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return AnyStudent()
	case authorization.ReachSelf:
		return StudentsSelf(v)
	case authorization.ReachGuardianWard:
		return studentsOfGuardian(v, academic)
	case authorization.ReachTeacherAssignment:
		return StudentsTaughtBy(v)
	default:
		return NoStudent()
	}
}

func NoEnrollment() predicate.StudentEnrollment { return entenrollment.IDIn() }

func AnyEnrollment() predicate.StudentEnrollment { return func(*sql.Selector) {} }

func enrollmentsTaughtBy(v *Viewer) predicate.StudentEnrollment {
	var ors []predicate.StudentEnrollment
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entenrollment.And(
			entenrollment.SectionIDIn(v.SectionIDs...),
			entenrollment.StatusEQ(entenrollment.StatusActive),
		))
	}
	if len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, entenrollment.HasSubjectEnrollmentsWith(
			entsubjenroll.SubjectOfferingIDIn(v.SubjectOfferingIDs...),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		))
	}
	if len(ors) == 0 {
		return NoEnrollment()
	}
	return entenrollment.Or(ors...)
}

func enrollmentsAnyRole(v *Viewer) predicate.StudentEnrollment {
	var ors []predicate.StudentEnrollment
	if len(v.StudentIDs) > 0 {
		ors = append(ors, entenrollment.StudentIDIn(v.StudentIDs...))
	}
	if len(v.SectionIDs) > 0 || len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, enrollmentsTaughtBy(v))
	}
	if v.GuardianID != nil {
		ors = append(ors, entenrollment.HasStudentWith(StudentsOfGuardianAcademic(v)))
	}
	if len(ors) == 0 {
		return NoEnrollment()
	}
	return entenrollment.Or(ors...)
}

func EnrollmentsFor(v *Viewer, d authorization.Decision) predicate.StudentEnrollment {
	if v == nil {
		return NoEnrollment()
	}
	if v.Unrestricted {
		return AnyEnrollment()
	}
	return entenrollment.And(scopedEnrollments(v, d), EnrollmentsConstrainedBy(d.Constraints))
}

func scopedEnrollments(v *Viewer, d authorization.Decision) predicate.StudentEnrollment {
	if !d.HasReach {
		return enrollmentsAnyRole(v)
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return AnyEnrollment()
	case authorization.ReachSelf:
		if len(v.StudentIDs) == 0 {
			return NoEnrollment()
		}
		return entenrollment.StudentIDIn(v.StudentIDs...)
	case authorization.ReachGuardianWard:
		return entenrollment.HasStudentWith(StudentsOfGuardianAcademic(v))
	case authorization.ReachTeacherAssignment:
		return enrollmentsTaughtBy(v)
	default:
		return NoEnrollment()
	}
}

func NoSubjectEnrollment() predicate.StudentSubjectEnrollment { return entsubjenroll.IDIn() }

func AnySubjectEnrollment() predicate.StudentSubjectEnrollment { return func(*sql.Selector) {} }

func subjectEnrollmentsTaughtBy(v *Viewer) predicate.StudentSubjectEnrollment {
	var ors []predicate.StudentSubjectEnrollment
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entsubjenroll.HasStudentEnrollmentWith(
			entenrollment.SectionIDIn(v.SectionIDs...),
			entenrollment.StatusEQ(entenrollment.StatusActive),
		))
	}
	if len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, entsubjenroll.SubjectOfferingIDIn(v.SubjectOfferingIDs...))
	}
	if len(ors) == 0 {
		return NoSubjectEnrollment()
	}
	return entsubjenroll.Or(ors...)
}

func subjectEnrollmentsAnyRole(v *Viewer) predicate.StudentSubjectEnrollment {
	var ors []predicate.StudentSubjectEnrollment
	if len(v.StudentIDs) > 0 {
		ors = append(ors, entsubjenroll.StudentIDIn(v.StudentIDs...))
	}
	if len(v.SectionIDs) > 0 || len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, subjectEnrollmentsTaughtBy(v))
	}
	if v.GuardianID != nil {
		ors = append(ors, entsubjenroll.HasStudentWith(StudentsOfGuardianAcademic(v)))
	}
	if len(ors) == 0 {
		return NoSubjectEnrollment()
	}
	return entsubjenroll.Or(ors...)
}

func SubjectEnrollmentsFor(v *Viewer, d authorization.Decision) predicate.StudentSubjectEnrollment {
	if v == nil {
		return NoSubjectEnrollment()
	}
	if v.Unrestricted {
		return AnySubjectEnrollment()
	}
	if len(d.Constraints) == 0 {
		return scopedSubjectEnrollments(v, d)
	}
	return entsubjenroll.And(
		scopedSubjectEnrollments(v, d),
		entsubjenroll.HasStudentEnrollmentWith(EnrollmentsConstrainedBy(d.Constraints)),
	)
}

func scopedSubjectEnrollments(v *Viewer, d authorization.Decision) predicate.StudentSubjectEnrollment {
	if !d.HasReach {
		return subjectEnrollmentsAnyRole(v)
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return AnySubjectEnrollment()
	case authorization.ReachSelf:
		if len(v.StudentIDs) == 0 {
			return NoSubjectEnrollment()
		}
		return entsubjenroll.StudentIDIn(v.StudentIDs...)
	case authorization.ReachGuardianWard:
		return entsubjenroll.HasStudentWith(StudentsOfGuardianAcademic(v))
	case authorization.ReachTeacherAssignment:
		return subjectEnrollmentsTaughtBy(v)
	default:
		return NoSubjectEnrollment()
	}
}

func StudentAssignmentsFor(v *Viewer, d authorization.Decision) predicate.StudentAssignment {
	if v == nil {
		return entstudentassign.IDIn()
	}
	if v.Unrestricted {
		return func(*sql.Selector) {}
	}
	return entstudentassign.HasStudentWith(StudentsForAcademic(v, d))
}

func teacherAssignmentsAnyRole(v *Viewer) predicate.TeacherAssignment {
	var ors []predicate.TeacherAssignment
	if v.TeacherID != nil {
		ors = append(ors, entteacherassign.TeacherID(*v.TeacherID))
	}
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entteacherassign.SectionIDIn(v.SectionIDs...))
	}
	if len(ors) == 0 {
		return entteacherassign.IDIn()
	}
	return entteacherassign.Or(ors...)
}

func TeacherAssignmentsFor(v *Viewer, d authorization.Decision) predicate.TeacherAssignment {
	if v == nil {
		return entteacherassign.IDIn()
	}
	if v.Unrestricted {
		return func(*sql.Selector) {}
	}
	return entteacherassign.And(
		scopedTeacherAssignments(v, d),
		TeacherAssignmentsConstrainedBy(d.Constraints),
	)
}

func scopedTeacherAssignments(v *Viewer, d authorization.Decision) predicate.TeacherAssignment {
	if !d.HasReach {
		return teacherAssignmentsAnyRole(v)
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return func(*sql.Selector) {}
	case authorization.ReachSelf:
		if v.TeacherID == nil {
			return entteacherassign.IDIn()
		}
		return entteacherassign.TeacherID(*v.TeacherID)
	case authorization.ReachTeacherAssignment:
		return teacherAssignmentsAnyRole(v)
	case authorization.ReachGuardianWard:
		return entteacherassign.IDIn()
	default:
		return entteacherassign.IDIn()
	}
}
