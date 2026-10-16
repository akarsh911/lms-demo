package access

import (
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	entitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentitem"
	entsubmission "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentsubmission"
	entresponse "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentsubmissionitem"
	enttarget "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmenttarget"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
)

func NoAssignment() predicate.Assignment { return entassignment.IDIn() }

func AnyAssignment() predicate.Assignment { return func(*sql.Selector) {} }

func NoAssignmentItem() predicate.AssignmentItem { return entitem.IDIn() }

func AnyAssignmentItem() predicate.AssignmentItem { return func(*sql.Selector) {} }

func NoAssignmentSubmission() predicate.AssignmentSubmission { return entsubmission.IDIn() }

func AnyAssignmentSubmission() predicate.AssignmentSubmission { return func(*sql.Selector) {} }

func NoAssignmentSubmissionItem() predicate.AssignmentSubmissionItem { return entresponse.IDIn() }

func AnyAssignmentSubmissionItem() predicate.AssignmentSubmissionItem {
	return func(*sql.Selector) {}
}

func assignmentTargetArm(kind enttarget.TargetType, ids []uuid.UUID) []predicate.AssignmentTarget {
	if len(ids) == 0 {
		return nil
	}
	return []predicate.AssignmentTarget{
		enttarget.And(enttarget.TargetTypeEQ(kind), enttarget.TargetIDIn(ids...)),
	}
}

func assignmentTargetArms(a *Audience) []predicate.AssignmentTarget {
	ors := assignmentTargetArm(enttarget.TargetTypeSection, a.Sections)
	ors = append(ors, assignmentTargetArm(enttarget.TargetTypeOffering, a.Offerings)...)
	return append(ors, assignmentTargetArm(enttarget.TargetTypeStudent, a.Students)...)
}

func AssignmentsFor(a *Audience) predicate.Assignment {
	if a == nil {
		return NoAssignment()
	}
	if a.All {
		return AnyAssignment()
	}

	var ors []predicate.Assignment
	if arms := assignmentTargetArms(a); len(arms) > 0 {
		ors = append(ors, entassignment.HasTargetsWith(enttarget.Or(arms...)))
	}
	if len(a.Offerings) > 0 {
		ors = append(ors, entassignment.SubjectOfferingIDIn(a.Offerings...))
	}
	if len(ors) == 0 {
		return NoAssignment()
	}
	return entassignment.Or(ors...)
}

func AssignmentsWritableBy(a *Audience) predicate.Assignment {
	if a == nil {
		return NoAssignment()
	}
	if a.All {
		return AnyAssignment()
	}
	arms := assignmentTargetArms(a)
	if len(arms) == 0 {
		return NoAssignment()
	}

	within := entassignment.And(
		entassignment.HasTargets(),
		entassignment.Not(entassignment.HasTargetsWith(enttarget.Not(enttarget.Or(arms...)))),
	)
	if len(a.Offerings) == 0 {
		return entassignment.And(within, entassignment.SubjectOfferingIDIsNil())
	}
	return entassignment.And(within, entassignment.Or(
		entassignment.SubjectOfferingIDIsNil(),
		entassignment.SubjectOfferingIDIn(a.Offerings...),
	))
}

func AssignmentItemsFor(a *Audience) predicate.AssignmentItem {
	if a == nil {
		return NoAssignmentItem()
	}
	if a.All {
		return AnyAssignmentItem()
	}
	return entitem.HasAssignmentWith(AssignmentsFor(a))
}

func AssignmentItemsWritableBy(a *Audience) predicate.AssignmentItem {
	if a == nil {
		return NoAssignmentItem()
	}
	if a.All {
		return AnyAssignmentItem()
	}
	return entitem.HasAssignmentWith(AssignmentsWritableBy(a))
}

func AssignmentSubmissionsFor(a *Audience) predicate.AssignmentSubmission {
	if a == nil {
		return NoAssignmentSubmission()
	}
	if a.All {
		return AnyAssignmentSubmission()
	}

	var ors []predicate.AssignmentSubmission
	if kin := a.Kin(); len(kin) > 0 {
		ors = append(ors, entsubmission.StudentIDIn(kin...))
	}
	if len(assignmentTargetArms(a)) > 0 {
		ors = append(ors, entsubmission.HasAssignmentWith(AssignmentsWritableBy(a)))
	}
	if len(ors) == 0 {
		return NoAssignmentSubmission()
	}
	return entsubmission.Or(ors...)
}

func AssignmentSubmissionsGradableBy(a *Audience) predicate.AssignmentSubmission {
	if a == nil {
		return NoAssignmentSubmission()
	}

	var base predicate.AssignmentSubmission
	switch {
	case a.All:
		base = AnyAssignmentSubmission()
	case len(assignmentTargetArms(a)) == 0:
		return NoAssignmentSubmission()
	default:
		base = entsubmission.HasAssignmentWith(AssignmentsWritableBy(a))
	}
	return exceptKinSubmissions(a, base)
}

func AssignmentSubmissionsSubmittableBy(a *Audience) predicate.AssignmentSubmission {
	if a == nil {
		return NoAssignmentSubmission()
	}
	if a.All {
		return AnyAssignmentSubmission()
	}
	if len(a.SelfStudents) == 0 {
		return NoAssignmentSubmission()
	}
	return entsubmission.StudentIDIn(a.SelfStudents...)
}

func exceptKinSubmissions(a *Audience, p predicate.AssignmentSubmission) predicate.AssignmentSubmission {
	kin := a.Kin()
	if len(kin) == 0 {
		return p
	}
	return entsubmission.And(p, entsubmission.Not(entsubmission.StudentIDIn(kin...)))
}

func AssignmentSubmissionItemsFor(a *Audience) predicate.AssignmentSubmissionItem {
	if a == nil {
		return NoAssignmentSubmissionItem()
	}
	if a.All {
		return AnyAssignmentSubmissionItem()
	}
	return entresponse.HasSubmissionWith(AssignmentSubmissionsFor(a))
}

func AssignmentSubmissionItemsGradableBy(a *Audience) predicate.AssignmentSubmissionItem {
	if a == nil {
		return NoAssignmentSubmissionItem()
	}
	return entresponse.HasSubmissionWith(AssignmentSubmissionsGradableBy(a))
}

func AssignmentSubmissionItemsAnswerableBy(a *Audience) predicate.AssignmentSubmissionItem {
	if a == nil {
		return NoAssignmentSubmissionItem()
	}
	return entresponse.HasSubmissionWith(AssignmentSubmissionsSubmittableBy(a))
}
