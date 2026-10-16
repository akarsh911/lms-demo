package access

import (
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entcontent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
)

func NoLibraryItem() predicate.ContentItem { return entcontent.IDIn() }

func AnyLibraryItem() predicate.ContentItem { return func(*sql.Selector) {} }

func libraryReadableStatus(v *Viewer) predicate.ContentItem {
	published := entcontent.StatusEQ(entcontent.StatusPublished)
	if v.PersonID == nil {
		return published
	}
	return entcontent.Or(published, entcontent.OwnerPersonID(*v.PersonID))
}

func libraryOneOf(v *Viewer, ors []predicate.ContentItem) predicate.ContentItem {
	if len(ors) == 0 {
		return NoLibraryItem()
	}
	return entcontent.And(entcontent.Or(ors...), libraryReadableStatus(v))
}

func libraryOfferingArms(ids []uuid.UUID) []predicate.ContentItem {
	if len(ids) == 0 {
		return nil
	}
	return []predicate.ContentItem{entcontent.And(
		entcontent.AudienceEQ(entcontent.AudienceOffering),
		entcontent.SubjectOfferingIDIn(ids...),
	)}
}

func libraryBaseArms(v *Viewer) []predicate.ContentItem {
	if v.PersonID == nil {
		return nil
	}
	return []predicate.ContentItem{
		entcontent.AudienceEQ(entcontent.AudienceSchool),
		entcontent.And(
			entcontent.AudienceEQ(entcontent.AudienceOwner),
			entcontent.OwnerPersonID(*v.PersonID),
		),
	}
}

func libraryOwnArms(v *Viewer) []predicate.ContentItem {
	base := libraryBaseArms(v)
	if base == nil {
		return nil
	}
	return append(base, libraryOfferingArms(v.EnrolledOfferingIDs)...)
}

func libraryWardArms(v *Viewer) []predicate.ContentItem {
	base := libraryBaseArms(v)
	if base == nil {
		return nil
	}
	return append(base, libraryOfferingArms(v.WardOfferingIDs)...)
}

func libraryPersonalArms(v *Viewer) []predicate.ContentItem {
	base := libraryBaseArms(v)
	if base == nil {
		return nil
	}
	base = append(base, libraryOfferingArms(v.EnrolledOfferingIDs)...)
	return append(base, libraryOfferingArms(v.WardOfferingIDs)...)
}

func libraryTeachingArms(v *Viewer) []predicate.ContentItem {
	var ors []predicate.ContentItem
	if len(v.SectionIDs) > 0 {
		ors = append(ors,
			entcontent.And(
				entcontent.AudienceEQ(entcontent.AudienceSection),
				entcontent.SectionIDIn(v.SectionIDs...),
			),
			entcontent.And(
				entcontent.AudienceEQ(entcontent.AudienceGrade),
				entcontent.HasGradeLevelWith(
					entgrade.HasSectionsWith(entsection.IDIn(v.SectionIDs...)),
				),
			),
		)
	}
	if len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, entcontent.And(
			entcontent.AudienceEQ(entcontent.AudienceOffering),
			entcontent.SubjectOfferingIDIn(v.SubjectOfferingIDs...),
		))
	}
	return ors
}

func LibraryItemsPersonal(v *Viewer) predicate.ContentItem {
	if v == nil {
		return NoLibraryItem()
	}
	return libraryOneOf(v, libraryPersonalArms(v))
}

func LibraryItemsAnyRole(v *Viewer) predicate.ContentItem {
	if v == nil {
		return NoLibraryItem()
	}
	return libraryOneOf(v, append(libraryPersonalArms(v), libraryTeachingArms(v)...))
}

func libraryPinsUsable(groups [][]authorization.Constraint) bool {
	for _, group := range groups {
		if translatable(group) {
			return true
		}
	}
	return len(groups) == 0
}

func LibraryItemsFor(v *Viewer, d authorization.Decision) predicate.ContentItem {
	if v == nil {
		return NoLibraryItem()
	}
	if v.Unrestricted {
		return AnyLibraryItem()
	}
	if !libraryPinsUsable(d.Constraints) {
		return NoLibraryItem()
	}
	return entcontent.And(scopedLibraryItems(v, d), LibraryItemsConstrainedBy(d.Constraints))
}

func LibraryItemsWritableBy(v *Viewer, d authorization.Decision) predicate.ContentItem {
	if v == nil {
		return NoLibraryItem()
	}
	if v.Unrestricted {
		return AnyLibraryItem()
	}
	if d.HasReach && d.Reach == authorization.ReachTenant {
		return LibraryItemsFor(v, d)
	}
	if v.PersonID == nil {
		return NoLibraryItem()
	}
	return entcontent.And(LibraryItemsFor(v, d), entcontent.OwnerPersonID(*v.PersonID))
}

func libraryPersonalScope(v *Viewer, arms []predicate.ContentItem, pinned bool) predicate.ContentItem {
	if pinned {
		return NoLibraryItem()
	}
	return libraryOneOf(v, arms)
}

func libraryRoleScope(v *Viewer, pinned bool) predicate.ContentItem {
	if pinned {
		return libraryOneOf(v, libraryTeachingArms(v))
	}
	return LibraryItemsAnyRole(v)
}

func scopedLibraryItems(v *Viewer, d authorization.Decision) predicate.ContentItem {
	pinned := len(d.Constraints) > 0

	if !d.HasReach {
		return libraryRoleScope(v, pinned)
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return AnyLibraryItem()
	case authorization.ReachSelf:
		return libraryPersonalScope(v, libraryOwnArms(v), pinned)
	case authorization.ReachGuardianWard:
		return libraryPersonalScope(v, libraryWardArms(v), pinned)
	case authorization.ReachTeacherAssignment:
		return libraryRoleScope(v, pinned)
	default:
		return NoLibraryItem()
	}
}
