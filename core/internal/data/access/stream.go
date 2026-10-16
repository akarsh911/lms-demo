package access

import (
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entcomment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/streamcomment"
	entpost "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/streampost"
	enttarget "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/streamtarget"
)

func NoStreamPost() predicate.StreamPost { return entpost.IDIn() }

func AnyStreamPost() predicate.StreamPost { return func(*sql.Selector) {} }

func NoStreamComment() predicate.StreamComment { return entcomment.IDIn() }

func AnyStreamComment() predicate.StreamComment { return func(*sql.Selector) {} }

func streamTargetArm(kind enttarget.TargetType, ids []uuid.UUID) []predicate.StreamTarget {
	if len(ids) == 0 {
		return nil
	}
	return []predicate.StreamTarget{
		enttarget.And(enttarget.TargetTypeEQ(kind), enttarget.TargetIDIn(ids...)),
	}
}

func streamTargetArms(a *Audience) []predicate.StreamTarget {
	var ors []predicate.StreamTarget
	if a.School {
		ors = append(ors, enttarget.TargetTypeEQ(enttarget.TargetTypeSchool))
	}
	ors = append(ors, streamTargetArm(enttarget.TargetTypeBranch, a.Branches)...)
	ors = append(ors, streamTargetArm(enttarget.TargetTypeGrade, a.Grades)...)
	ors = append(ors, streamTargetArm(enttarget.TargetTypeSection, a.Sections)...)
	ors = append(ors, streamTargetArm(enttarget.TargetTypeOffering, a.Offerings)...)
	return append(ors, streamTargetArm(enttarget.TargetTypeStudent, a.Students)...)
}

func StreamPostsFor(a *Audience) predicate.StreamPost {
	if a == nil {
		return NoStreamPost()
	}
	if a.All {
		return AnyStreamPost()
	}
	arms := streamTargetArms(a)
	if len(arms) == 0 {
		return NoStreamPost()
	}
	return entpost.HasTargetsWith(enttarget.Or(arms...))
}

func StreamPostsWritableBy(a *Audience) predicate.StreamPost {
	if a == nil {
		return NoStreamPost()
	}
	if a.All {
		return AnyStreamPost()
	}
	arms := streamTargetArms(a)
	if len(arms) == 0 {
		return NoStreamPost()
	}
	return entpost.And(
		entpost.HasTargets(),
		entpost.Not(entpost.HasTargetsWith(enttarget.Not(enttarget.Or(arms...)))),
	)
}

func StreamCommentsFor(a *Audience) predicate.StreamComment {
	if a == nil {
		return NoStreamComment()
	}
	if a.All {
		return AnyStreamComment()
	}
	arms := streamTargetArms(a)
	if len(arms) == 0 {
		return NoStreamComment()
	}
	return entcomment.HasPostWith(StreamPostsFor(a))
}

func StreamCommentsWritableBy(a *Audience, v *Viewer) predicate.StreamComment {
	if a == nil || v == nil {
		return NoStreamComment()
	}
	if a.All {
		return AnyStreamComment()
	}
	if v.PersonID == nil {
		return NoStreamComment()
	}
	return entcomment.And(
		entcomment.AuthorPersonID(*v.PersonID),
		entcomment.HasPostWith(StreamPostsFor(a)),
	)
}

func StreamCommentsModeratableBy(a *Audience) predicate.StreamComment {
	if a == nil {
		return NoStreamComment()
	}
	if a.All {
		return AnyStreamComment()
	}
	arms := streamTargetArms(a)
	if len(arms) == 0 {
		return NoStreamComment()
	}
	return entcomment.HasPostWith(StreamPostsWritableBy(a))
}
