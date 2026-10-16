package access

import (
	"context"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entpraise "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/praise"
	entreaction "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/praisereaction"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entaward "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentachievement"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

func NoStudentAchievement() predicate.StudentAchievement { return entaward.IDIn() }

func AnyStudentAchievement() predicate.StudentAchievement { return func(*sql.Selector) {} }

func NoPraise() predicate.Praise { return entpraise.IDIn() }

func AnyPraise() predicate.Praise { return func(*sql.Selector) {} }

func NoPraiseReaction() predicate.PraiseReaction { return entreaction.IDIn() }

func AnyPraiseReaction() predicate.PraiseReaction { return func(*sql.Selector) {} }

func StudentAchievementsFor(v *Viewer, d authorization.Decision) predicate.StudentAchievement {
	if v == nil {
		return NoStudentAchievement()
	}
	if v.Unrestricted {
		return AnyStudentAchievement()
	}
	return entaward.HasStudentWith(StudentsForAcademic(v, d))
}

func StudentAchievementsAwardableBy(v *Viewer, d authorization.Decision) predicate.StudentAchievement {
	if v == nil {
		return NoStudentAchievement()
	}
	return entaward.HasStudentWith(StudentsForAwarding(v, d))
}

func StudentsForAwarding(v *Viewer, d authorization.Decision) predicate.Student {
	if v == nil {
		return NoStudent()
	}
	kin := kinStudents(v)
	if kin == nil {
		return awardableStudents(v, d)
	}
	return entstudent.And(awardableStudents(v, d), entstudent.Not(kin))
}

func kinStudents(v *Viewer) predicate.Student {
	var ors []predicate.Student
	if len(v.StudentIDs) > 0 {
		ors = append(ors, entstudent.IDIn(v.StudentIDs...))
	}
	if v.GuardianID != nil {
		ors = append(ors, StudentsOfGuardian(v))
	}
	if len(ors) == 0 {
		return nil
	}
	return entstudent.Or(ors...)
}

func StudentAchievementsShowcasableBy(v *Viewer, d authorization.Decision) predicate.StudentAchievement {
	if v == nil {
		return NoStudentAchievement()
	}
	if len(v.StudentIDs) == 0 {
		return StudentAchievementsAwardableBy(v, d)
	}
	return entaward.Or(
		StudentAchievementsAwardableBy(v, d),
		entaward.StudentIDIn(v.StudentIDs...),
	)
}

func awardableStudents(v *Viewer, d authorization.Decision) predicate.Student {
	if v.Unrestricted {
		return AnyStudent()
	}
	if !d.HasReach {
		return entstudent.And(StudentsTaughtBy(v), StudentsConstrainedBy(d.Constraints))
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return StudentsConstrainedBy(d.Constraints)
	case authorization.ReachTeacherAssignment:
		return entstudent.And(StudentsTaughtBy(v), StudentsConstrainedBy(d.Constraints))
	default:
		return NoStudent()
	}
}

type Recognition struct {
	AllStudents bool
	AllStaff    bool

	Students []uuid.UUID

	SelfStudents []uuid.UUID
	WardStudents []uuid.UUID
	SelfStaff    *uuid.UUID
	PersonID     *uuid.UUID

	Moderator bool
}

func DenyRecognition() *Recognition { return &Recognition{} }

func (r *Recognition) Kin() []uuid.UUID {
	if r == nil {
		return nil
	}
	return append(append([]uuid.UUID{}, r.SelfStudents...), r.WardStudents...)
}

func (r *Recognition) ReachesStudent(id uuid.UUID) bool {
	if r == nil || carriesID(r.Kin(), id) {
		return false
	}
	return r.AllStudents || carriesID(r.Students, id)
}

func (r *Recognition) ReachesStaff(id uuid.UUID) bool {
	if r == nil || !r.AllStaff {
		return false
	}
	return r.SelfStaff == nil || *r.SelfStaff != id
}

func ReadableRecognition(ctx context.Context, v *Viewer, d authorization.Decision) (*Recognition, error) {
	return resolveRecognition(ctx, v, d, false)
}

func WritableRecognition(ctx context.Context, v *Viewer, d authorization.Decision) (*Recognition, error) {
	return resolveRecognition(ctx, v, d, true)
}

func resolveRecognition(ctx context.Context, v *Viewer, d authorization.Decision,
	write bool) (*Recognition, error) {
	if v == nil {
		return DenyRecognition(), nil
	}

	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return nil, err
	}

	kin, err := kinOf(ctx, client, v)
	if err != nil {
		return nil, err
	}

	out := &Recognition{
		SelfStudents: kin.self,
		WardStudents: kin.ward,
		SelfStaff:    v.StaffID,
		PersonID:     v.PersonID,
	}
	if v.Unrestricted {
		out.AllStudents, out.AllStaff = true, true
		return out, nil
	}
	if !audiencePinsUsable(d.Constraints) {
		return out, nil
	}

	taught, mates, all := recognitionRoles(v, d, write)
	out.Moderator = taught || all
	if all {
		if len(d.Constraints) == 0 {
			out.AllStudents, out.AllStaff = true, true
			return out, nil
		}
		pinned, err := pinnedAudience(ctx, client, d.Constraints)
		if err != nil {
			return nil, err
		}
		out.Students = pinned.Students
		return out, nil
	}

	if taught {
		roster, err := studentsTaughtBy(ctx, client, v)
		if err != nil {
			return nil, err
		}
		out.Students = append(out.Students, roster...)
	}
	if mates {
		classmates, err := studentsOfSections(ctx, client, kin.sections)
		if err != nil {
			return nil, err
		}
		out.Students = append(out.Students, classmates...)
	}
	if !write {
		out.Students = append(out.Students, out.Kin()...)
	}
	out.Students = dedupe(out.Students)

	if len(d.Constraints) > 0 {
		pinned, err := pinnedAudience(ctx, client, d.Constraints)
		if err != nil {
			return nil, err
		}
		out.Students = intersect(out.Students, pinned.Students)
	}
	return out, nil
}

func recognitionRoles(v *Viewer, d authorization.Decision, write bool) (taught, mates, all bool) {
	pupil := len(v.StudentIDs) > 0

	if !d.HasReach {
		return true, !write && pupil, false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return false, false, true
	case authorization.ReachTeacherAssignment:
		return true, false, false
	case authorization.ReachSelf:
		return false, pupil, false
	default:
		return false, false, false
	}
}

func PraisesFor(r *Recognition) predicate.Praise {
	if r == nil {
		return NoPraise()
	}
	if r.AllStudents && r.AllStaff {
		return AnyPraise()
	}

	var ors []predicate.Praise
	if r.PersonID != nil {
		ors = append(ors, entpraise.GivenByPersonID(*r.PersonID))
	}
	if arm := praiseStudentArm(r.Kin()); arm != nil {
		ors = append(ors, arm)
	}
	if r.SelfStaff != nil {
		ors = append(ors, praiseStaffArm(*r.SelfStaff))
	}
	if arm := praiseStudentArm(r.Students); arm != nil {
		ors = append(ors, entpraise.And(arm, entpraise.VisibilityNEQ(entpraise.VisibilityPrivate)))
	}
	if len(ors) == 0 {
		return NoPraise()
	}
	return entpraise.And(entpraise.Or(ors...), entpraise.StatusNEQ(entpraise.StatusRemoved))
}

func praiseStudentArm(ids []uuid.UUID) predicate.Praise {
	if len(ids) == 0 {
		return nil
	}
	return entpraise.And(
		entpraise.RecipientTypeEQ(entpraise.RecipientTypeStudent),
		entpraise.RecipientIDIn(ids...),
	)
}

func praiseStaffArm(id uuid.UUID) predicate.Praise {
	return entpraise.And(
		entpraise.RecipientTypeEQ(entpraise.RecipientTypeStaff),
		entpraise.RecipientID(id),
	)
}

func PraisesEditableBy(r *Recognition) predicate.Praise {
	if r == nil || r.PersonID == nil {
		return NoPraise()
	}
	return entpraise.GivenByPersonID(*r.PersonID)
}

func PraisesModeratableBy(r *Recognition) predicate.Praise {
	if r == nil {
		return NoPraise()
	}
	if r.AllStudents && r.AllStaff {
		return AnyPraise()
	}

	var ors []predicate.Praise
	if r.PersonID != nil {
		ors = append(ors, entpraise.GivenByPersonID(*r.PersonID))
	}
	if r.Moderator {
		if arm := praiseStudentArm(r.Students); arm != nil {
			ors = append(ors, arm)
		}
	}
	if len(ors) == 0 {
		return NoPraise()
	}
	return entpraise.Or(ors...)
}

func PraiseReactionsFor(r *Recognition) predicate.PraiseReaction {
	if r == nil {
		return NoPraiseReaction()
	}
	return entreaction.HasPraiseWith(PraisesFor(r))
}

func PraiseReactionsRemovableBy(r *Recognition) predicate.PraiseReaction {
	if r == nil {
		return NoPraiseReaction()
	}

	if r.AllStudents && r.AllStaff {
		return AnyPraiseReaction()
	}

	var ors []predicate.PraiseReaction
	if r.PersonID != nil {
		ors = append(ors, entreaction.ReactorPersonID(*r.PersonID))
	}
	if r.Moderator {
		if arm := praiseStudentArm(r.Students); arm != nil {
			ors = append(ors, entreaction.HasPraiseWith(arm))
		}
	}
	if len(ors) == 0 {
		return NoPraiseReaction()
	}
	return entreaction.Or(ors...)
}

func carriesID(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}
