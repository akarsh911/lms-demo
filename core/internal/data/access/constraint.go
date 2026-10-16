package access

import (
	"entgo.io/ent/dialect/sql"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entcontent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subject"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
)

func sectionsMatching(c authorization.Constraint) predicate.Section {
	switch c.Field {
	case "section":
		return entsection.CodeIn(c.Values...)
	case "grade_level":
		return entsection.HasGradeLevelWith(entgrade.CodeIn(c.Values...))
	default:
		return entsection.IDIn()
	}
}

func subjectsMatching(c authorization.Constraint) predicate.Subject {
	if c.Field == "subject" {
		return entsubject.CodeIn(c.Values...)
	}
	return entsubject.IDIn()
}

func translatable(group []authorization.Constraint) bool {
	for _, c := range group {
		if !c.Satisfied() || !authorization.RowField(c.Field) {
			return false
		}
	}
	return true
}

func StudentsConstrainedBy(groups [][]authorization.Constraint) predicate.Student {
	if len(groups) == 0 {
		return AnyStudent()
	}

	ors := make([]predicate.Student, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.Student, 0, len(group))
		for _, c := range group {
			ands = append(ands, entstudent.HasEnrollmentsWith(
				entenrollment.StatusEQ(entenrollment.StatusActive),
				entenrollment.HasSectionWith(sectionsMatching(c)),
			))
		}
		ors = append(ors, entstudent.And(ands...))
	}
	if len(ors) == 0 {
		return NoStudent()
	}
	return entstudent.Or(ors...)
}

func EnrollmentsConstrainedBy(groups [][]authorization.Constraint) predicate.StudentEnrollment {
	if len(groups) == 0 {
		return AnyEnrollment()
	}

	ors := make([]predicate.StudentEnrollment, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.StudentEnrollment, 0, len(group))
		for _, c := range group {
			ands = append(ands, entenrollment.HasSectionWith(sectionsMatching(c)))
		}
		ors = append(ors, entenrollment.And(ands...))
	}
	if len(ors) == 0 {
		return NoEnrollment()
	}
	return entenrollment.Or(ors...)
}

func TeacherAssignmentsConstrainedBy(groups [][]authorization.Constraint) predicate.TeacherAssignment {
	if len(groups) == 0 {
		return func(*sql.Selector) {}
	}

	ors := make([]predicate.TeacherAssignment, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.TeacherAssignment, 0, len(group))
		for _, c := range group {
			ands = append(ands, entteacherassign.HasSectionWith(sectionsMatching(c)))
		}
		ors = append(ors, entteacherassign.And(ands...))
	}
	if len(ors) == 0 {
		return entteacherassign.IDIn()
	}
	return entteacherassign.Or(ors...)
}

func contentMatching(c authorization.Constraint) predicate.ContentItem {
	switch c.Field {
	case "section":
		return entcontent.HasSectionWith(sectionsMatching(c))
	case "grade_level":
		return entcontent.Or(
			entcontent.HasSectionWith(sectionsMatching(c)),
			entcontent.HasGradeLevelWith(entgrade.CodeIn(c.Values...)),
		)
	default:
		return NoLibraryItem()
	}
}

func LibraryItemsConstrainedBy(groups [][]authorization.Constraint) predicate.ContentItem {
	if len(groups) == 0 {
		return AnyLibraryItem()
	}

	ors := make([]predicate.ContentItem, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.ContentItem, 0, len(group))
		for _, c := range group {
			ands = append(ands, contentMatching(c))
		}
		ors = append(ors, entcontent.And(ands...))
	}
	if len(ors) == 0 {
		return NoLibraryItem()
	}
	return entcontent.Or(ors...)
}
