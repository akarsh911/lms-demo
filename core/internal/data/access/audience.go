package access

import (
	"context"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

type Audience struct {
	All    bool
	School bool

	Branches  []uuid.UUID
	Grades    []uuid.UUID
	Sections  []uuid.UUID
	Offerings []uuid.UUID
	Students  []uuid.UUID

	SelfStudents []uuid.UUID
	WardStudents []uuid.UUID
}

func DenyAudience() *Audience { return &Audience{} }

func (a *Audience) Empty() bool {
	if a == nil {
		return true
	}
	return !a.All && !a.School &&
		len(a.Branches) == 0 && len(a.Grades) == 0 && len(a.Sections) == 0 &&
		len(a.Offerings) == 0 && len(a.Students) == 0
}

func (a *Audience) Kin() []uuid.UUID {
	if a == nil {
		return nil
	}
	return append(append([]uuid.UUID{}, a.SelfStudents...), a.WardStudents...)
}

func ReadableAudience(ctx context.Context, v *Viewer, d authorization.Decision) (*Audience, error) {
	return resolveAudience(ctx, v, d, false)
}

func WritableAudience(ctx context.Context, v *Viewer, d authorization.Decision) (*Audience, error) {
	return resolveAudience(ctx, v, d, true)
}

func resolveAudience(ctx context.Context, v *Viewer, d authorization.Decision, write bool) (*Audience, error) {
	if v == nil {
		return DenyAudience(), nil
	}
	if !audiencePinsUsable(d.Constraints) {
		return DenyAudience(), nil
	}

	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return nil, err
	}

	kin, err := kinOf(ctx, client, v)
	if err != nil {
		return nil, err
	}

	if v.Unrestricted {
		return withKin(&Audience{All: true, School: true}, kin), nil
	}

	all, roles := audienceRoles(v, d, write)
	if !all && len(roles) == 0 {
		return withKin(DenyAudience(), kin), nil
	}

	if len(d.Constraints) == 0 {
		if all {
			return withKin(&Audience{All: true, School: true}, kin), nil
		}
		out, err := audienceOfRoles(ctx, client, v, kin, roles, write)
		if err != nil {
			return nil, err
		}
		return withKin(out, kin), nil
	}

	pinned, err := pinnedAudience(ctx, client, d.Constraints)
	if err != nil {
		return nil, err
	}
	if all {
		return withKin(pinned, kin), nil
	}

	held, err := audienceOfRoles(ctx, client, v, kin, roles, write)
	if err != nil {
		return nil, err
	}
	return withKin(intersectAudience(held, pinned), kin), nil
}

type audienceRole int

const (
	roleTaught audienceRole = iota
	roleStudied
	roleWard
)

func audienceRoles(v *Viewer, d authorization.Decision, write bool) (all bool, roles []audienceRole) {
	if !d.HasReach {
		if write {
			return false, []audienceRole{roleTaught}
		}
		return false, []audienceRole{roleTaught, roleStudied, roleWard}
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return true, nil
	case authorization.ReachTeacherAssignment:
		return false, []audienceRole{roleTaught}
	case authorization.ReachSelf:
		if write {
			return false, nil
		}
		return false, []audienceRole{roleStudied}
	case authorization.ReachGuardianWard:
		if write {
			return false, nil
		}
		return false, []audienceRole{roleWard}
	default:
		return false, nil
	}
}

type kinship struct {
	self []uuid.UUID
	ward []uuid.UUID

	sections []uuid.UUID
}

func kinOf(ctx context.Context, client *tenantent.Client, v *Viewer) (kinship, error) {
	var k kinship
	if len(v.StudentIDs) == 0 && v.GuardianID == nil {
		return k, nil
	}

	var ors []predicate.StudentEnrollment
	if len(v.StudentIDs) > 0 {
		k.self = append(k.self, v.StudentIDs...)
		ors = append(ors, entenrollment.StudentIDIn(v.StudentIDs...))
	}
	if v.GuardianID != nil {
		ors = append(ors, entenrollment.HasStudentWith(StudentsOfGuardianAcademic(v)))
	}

	rows, err := client.StudentEnrollment.Query().
		Where(entenrollment.Or(ors...), entenrollment.StatusEQ(entenrollment.StatusActive)).
		All(ctx)
	if err != nil {
		return kinship{}, err
	}

	mine := indexOf(v.StudentIDs)
	seenWard := map[uuid.UUID]struct{}{}
	seenSection := map[uuid.UUID]struct{}{}
	for _, row := range rows {
		if _, dup := seenSection[row.SectionID]; !dup {
			seenSection[row.SectionID] = struct{}{}
			k.sections = append(k.sections, row.SectionID)
		}
		if _, self := mine[row.StudentID]; self {
			continue
		}
		if _, dup := seenWard[row.StudentID]; !dup {
			seenWard[row.StudentID] = struct{}{}
			k.ward = append(k.ward, row.StudentID)
		}
	}
	return k, nil
}

func withKin(a *Audience, k kinship) *Audience {
	a.SelfStudents = k.self
	a.WardStudents = k.ward
	return a
}

func audienceOfRoles(ctx context.Context, client *tenantent.Client, v *Viewer,
	k kinship, roles []audienceRole, write bool) (*Audience, error) {
	out := &Audience{School: !write}

	for _, role := range roles {
		switch role {
		case roleTaught:
			out.Sections = append(out.Sections, v.SectionIDs...)
			out.Offerings = append(out.Offerings, v.SubjectOfferingIDs...)
			for _, grade := range v.SectionGradeIDs {
				out.Grades = append(out.Grades, grade)
			}
		case roleStudied:
			out.Sections = append(out.Sections, k.sections...)
			out.Offerings = append(out.Offerings, v.EnrolledOfferingIDs...)
			out.Students = append(out.Students, k.self...)
		case roleWard:
			out.Sections = append(out.Sections, k.sections...)
			out.Offerings = append(out.Offerings, v.WardOfferingIDs...)
			out.Students = append(out.Students, k.ward...)
		}
	}

	if write {
		out.Grades = nil
		out.Students = nil
		roster, err := studentsTaughtBy(ctx, client, v)
		if err != nil {
			return nil, err
		}
		out.Students = roster
	}

	shape, err := shapeOfSections(ctx, client, out.Sections)
	if err != nil {
		return nil, err
	}
	if !write {
		out.Branches = shape.branches
		out.Grades = append(out.Grades, shape.grades...)
	}

	out.Branches = dedupe(out.Branches)
	out.Grades = dedupe(out.Grades)
	out.Sections = dedupe(out.Sections)
	out.Offerings = dedupe(out.Offerings)
	out.Students = dedupe(out.Students)
	return out, nil
}

func studentsTaughtBy(ctx context.Context, client *tenantent.Client, v *Viewer) ([]uuid.UUID, error) {
	if len(v.SectionIDs) == 0 && len(v.SubjectOfferingIDs) == 0 {
		return nil, nil
	}

	var ors []predicate.StudentEnrollment
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entenrollment.SectionIDIn(v.SectionIDs...))
	}
	if len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, entenrollment.HasSubjectEnrollmentsWith(
			entsubjenroll.SubjectOfferingIDIn(v.SubjectOfferingIDs...),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		))
	}

	rows, err := client.StudentEnrollment.Query().
		Where(entenrollment.Or(ors...), entenrollment.StatusEQ(entenrollment.StatusActive)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.StudentID)
	}
	return dedupe(out), nil
}

func studentsOfSections(ctx context.Context, client *tenantent.Client, sections []uuid.UUID) ([]uuid.UUID, error) {
	if len(sections) == 0 {
		return nil, nil
	}

	rows, err := client.StudentEnrollment.Query().
		Where(
			entenrollment.SectionIDIn(sections...),
			entenrollment.StatusEQ(entenrollment.StatusActive),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.StudentID)
	}
	return dedupe(out), nil
}

type sectionShape struct {
	grades   []uuid.UUID
	branches []uuid.UUID
}

func shapeOfSections(ctx context.Context, client *tenantent.Client, sections []uuid.UUID) (sectionShape, error) {
	if len(sections) == 0 {
		return sectionShape{}, nil
	}

	rows, err := client.Section.Query().Where(entsection.IDIn(sections...)).All(ctx)
	if err != nil {
		return sectionShape{}, err
	}

	var shape sectionShape
	for _, row := range rows {
		if row.GradeLevelID != uuid.Nil {
			shape.grades = append(shape.grades, row.GradeLevelID)
		}
		if row.BranchID != uuid.Nil {
			shape.branches = append(shape.branches, row.BranchID)
		}
	}
	shape.grades = dedupe(shape.grades)
	shape.branches = dedupe(shape.branches)
	return shape, nil
}

func audiencePinsUsable(groups [][]authorization.Constraint) bool {
	for _, group := range groups {
		if translatable(group) {
			return true
		}
	}
	return len(groups) == 0
}

func pinnedAudience(ctx context.Context, client *tenantent.Client,
	groups [][]authorization.Constraint) (*Audience, error) {
	ors := make([]predicate.Section, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.Section, 0, len(group))
		for _, c := range group {
			ands = append(ands, sectionsMatching(c))
		}
		ors = append(ors, entsection.And(ands...))
	}
	if len(ors) == 0 {
		return DenyAudience(), nil
	}

	rows, err := client.Section.Query().Where(entsection.Or(ors...)).All(ctx)
	if err != nil {
		return nil, err
	}

	out := &Audience{}
	for _, row := range rows {
		out.Sections = append(out.Sections, row.ID)
		if row.GradeLevelID != uuid.Nil {
			out.Grades = append(out.Grades, row.GradeLevelID)
		}
	}
	out.Sections = dedupe(out.Sections)
	out.Grades = dedupe(out.Grades)

	if len(out.Sections) > 0 {
		offerings, err := client.SubjectOffering.Query().
			Where(entoffering.SectionIDIn(out.Sections...)).
			IDs(ctx)
		if err != nil {
			return nil, err
		}
		out.Offerings = offerings
	}

	out.Grades, err = narrowPinnedGrades(ctx, client, groups, out.Grades)
	if err != nil {
		return nil, err
	}

	out.Students, err = studentsOfSections(ctx, client, out.Sections)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func narrowPinnedGrades(ctx context.Context, client *tenantent.Client,
	groups [][]authorization.Constraint, grades []uuid.UUID) ([]uuid.UUID, error) {
	if len(grades) == 0 {
		return nil, nil
	}
	if !everyGroupIsGradeWide(groups) {
		return nil, nil
	}

	codes := make([]string, 0, len(groups))
	for _, group := range groups {
		for _, c := range group {
			codes = append(codes, c.Values...)
		}
	}
	return client.GradeLevel.Query().
		Where(entgrade.IDIn(grades...), entgrade.CodeIn(codes...)).
		IDs(ctx)
}

func everyGroupIsGradeWide(groups [][]authorization.Constraint) bool {
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		for _, c := range group {
			if c.Field != "grade_level" {
				return false
			}
		}
	}
	return true
}

func intersectAudience(held, pinned *Audience) *Audience {
	return &Audience{
		Branches:  intersect(held.Branches, pinned.Branches),
		Grades:    intersect(held.Grades, pinned.Grades),
		Sections:  intersect(held.Sections, pinned.Sections),
		Offerings: intersect(held.Offerings, pinned.Offerings),
		Students:  intersect(held.Students, pinned.Students),
	}
}

func indexOf(ids []uuid.UUID) map[uuid.UUID]struct{} {
	out := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		out[id] = struct{}{}
	}
	return out
}

func dedupe(ids []uuid.UUID) []uuid.UUID {
	if len(ids) == 0 {
		return nil
	}
	seen := make(map[uuid.UUID]struct{}, len(ids))
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func intersect(held, pinned []uuid.UUID) []uuid.UUID {
	if len(held) == 0 || len(pinned) == 0 {
		return nil
	}
	allowed := indexOf(pinned)
	out := make([]uuid.UUID, 0, len(held))
	for _, id := range held {
		if _, ok := allowed[id]; ok {
			out = append(out, id)
		}
	}
	return dedupe(out)
}
