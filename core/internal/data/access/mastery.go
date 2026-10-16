package access

import (
	"entgo.io/ent/dialect/sql"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entmastery "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/conceptmastery"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
)

func NoConceptMastery() predicate.ConceptMastery { return entmastery.IDIn() }

func AnyConceptMastery() predicate.ConceptMastery { return func(*sql.Selector) {} }

func ConceptMasteryFor(v *Viewer, d authorization.Decision) predicate.ConceptMastery {
	if v == nil {
		return NoConceptMastery()
	}
	if v.Unrestricted {
		return AnyConceptMastery()
	}
	return entmastery.HasStudentWith(StudentsForAcademic(v, d))
}

func MasteryLearners(v *Viewer, d authorization.Decision) predicate.Student {
	if v == nil {
		return NoStudent()
	}
	return entstudent.And(StudentsSelf(v), StudentsConstrainedBy(d.Constraints))
}

func ConceptMasteryWritableBy(v *Viewer, d authorization.Decision) predicate.ConceptMastery {
	if v == nil {
		return NoConceptMastery()
	}
	return entmastery.HasStudentWith(MasteryLearners(v, d))
}
