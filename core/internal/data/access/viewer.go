package access

import (
	"context"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entguardian "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/guardian"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

type SubjectGrade struct {
	SubjectID    uuid.UUID
	GradeLevelID uuid.UUID
}

type Viewer struct {
	PersonID               *uuid.UUID
	GuardianID             *uuid.UUID
	StaffID                *uuid.UUID
	TeacherID              *uuid.UUID
	SectionIDs             []uuid.UUID
	SectionGradeIDs        map[uuid.UUID]uuid.UUID
	SubjectOfferingIDs     []uuid.UUID
	StudentIDs             []uuid.UUID
	EnrolledOfferingIDs    []uuid.UUID
	WardOfferingIDs        []uuid.UUID
	TaughtSubjectGrades    []SubjectGrade
	StudiedSubjectGrades   []SubjectGrade
	WardSubjectGrades      []SubjectGrade
	SubjectGradeByOffering map[uuid.UUID]SubjectGrade
	Unrestricted           bool
}

func (v *Viewer) Restricted() bool { return v != nil && !v.Unrestricted }

func Resolve(ctx context.Context, sub *authorization.Subject, unrestricted bool) (*Viewer, error) {
	v := &Viewer{Unrestricted: unrestricted}
	if sub == nil {
		return v, nil
	}

	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return nil, err
	}

	p, err := client.Person.Query().
		Where(entperson.CasUserID(sub.CASUserID)).
		Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			return v, nil
		}
		return nil, err
	}
	v.PersonID = &p.ID

	if g, err := client.Guardian.Query().
		Where(entguardian.PersonID(p.ID)).
		Only(ctx); err == nil {
		v.GuardianID = &g.ID
	} else if !tenantent.IsNotFound(err) {
		return nil, err
	}

	staffRows, err := client.Staff.Query().Where(entstaff.PersonID(p.ID)).WithTeacher().All(ctx)
	if err != nil {
		return nil, err
	}
	for _, st := range staffRows {
		id := st.ID
		v.StaffID = &id
		if st.Edges.Teacher != nil {
			tid := st.Edges.Teacher.ID
			v.TeacherID = &tid
		}
		break
	}

	if v.TeacherID != nil {
		sections, offerings, err := teachingScope(ctx, client, *v.TeacherID)
		if err != nil {
			return nil, err
		}
		v.SectionIDs = sections
		v.SubjectOfferingIDs = offerings

		grades, err := sectionGradeIndex(ctx, client, sections)
		if err != nil {
			return nil, err
		}
		v.SectionGradeIDs = grades
	}

	studentIDs, err := client.Student.Query().Where(entstudent.PersonID(p.ID)).IDs(ctx)
	if err != nil {
		return nil, err
	}
	v.StudentIDs = studentIDs

	own, ward, err := enrolledScope(ctx, client, v)
	if err != nil {
		return nil, err
	}
	v.EnrolledOfferingIDs = own
	v.WardOfferingIDs = ward

	every := append([]uuid.UUID{}, v.SubjectOfferingIDs...)
	every = append(every, own...)
	every = append(every, ward...)

	index, err := subjectGradeIndex(ctx, client, every)
	if err != nil {
		return nil, err
	}
	v.SubjectGradeByOffering = index
	v.TaughtSubjectGrades = subjectGradesOf(index, v.SubjectOfferingIDs)
	v.StudiedSubjectGrades = subjectGradesOf(index, own)
	v.WardSubjectGrades = subjectGradesOf(index, ward)

	return v, nil
}

func sectionGradeIndex(ctx context.Context, client *tenantent.Client, sections []uuid.UUID) (map[uuid.UUID]uuid.UUID, error) {
	if len(sections) == 0 {
		return nil, nil
	}

	rows, err := client.Section.Query().
		Where(entsection.IDIn(sections...)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	index := make(map[uuid.UUID]uuid.UUID, len(rows))
	for _, row := range rows {
		if row.GradeLevelID == uuid.Nil {
			continue
		}
		index[row.ID] = row.GradeLevelID
	}

	return index, nil
}

func subjectGradeIndex(ctx context.Context, client *tenantent.Client, offerings []uuid.UUID) (map[uuid.UUID]SubjectGrade, error) {
	if len(offerings) == 0 {
		return nil, nil
	}

	rows, err := client.SubjectOffering.Query().
		Where(entoffering.IDIn(offerings...)).
		WithSection().
		All(ctx)
	if err != nil {
		return nil, err
	}

	index := make(map[uuid.UUID]SubjectGrade, len(rows))
	for _, row := range rows {
		if row.Edges.Section == nil {
			continue
		}
		index[row.ID] = SubjectGrade{
			SubjectID:    row.SubjectID,
			GradeLevelID: row.Edges.Section.GradeLevelID,
		}
	}

	return index, nil
}

func subjectGradesOf(index map[uuid.UUID]SubjectGrade, offerings []uuid.UUID) []SubjectGrade {
	seen := map[SubjectGrade]struct{}{}
	var pairs []SubjectGrade
	for _, id := range offerings {
		pair, ok := index[id]
		if !ok {
			continue
		}
		if _, dup := seen[pair]; dup {
			continue
		}
		seen[pair] = struct{}{}
		pairs = append(pairs, pair)
	}
	return pairs
}

func enrolledScope(ctx context.Context, client *tenantent.Client, v *Viewer) (own, ward []uuid.UUID, err error) {
	var ors []predicate.StudentSubjectEnrollment
	if len(v.StudentIDs) > 0 {
		ors = append(ors, entsubjenroll.StudentIDIn(v.StudentIDs...))
	}
	if v.GuardianID != nil {
		ors = append(ors, entsubjenroll.HasStudentWith(StudentsOfGuardianAcademic(v)))
	}
	if len(ors) == 0 {
		return nil, nil, nil
	}

	rows, err := client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.Or(ors...),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
			entsubjenroll.HasAcademicSessionWith(entsession.IsCurrent(true)),
		).
		All(ctx)
	if err != nil {
		return nil, nil, err
	}

	mine := make(map[uuid.UUID]struct{}, len(v.StudentIDs))
	for _, id := range v.StudentIDs {
		mine[id] = struct{}{}
	}

	seenOwn := map[uuid.UUID]struct{}{}
	seenWard := map[uuid.UUID]struct{}{}
	for _, row := range rows {
		if _, self := mine[row.StudentID]; self {
			if _, dup := seenOwn[row.SubjectOfferingID]; !dup {
				seenOwn[row.SubjectOfferingID] = struct{}{}
				own = append(own, row.SubjectOfferingID)
			}
			continue
		}
		if _, dup := seenWard[row.SubjectOfferingID]; !dup {
			seenWard[row.SubjectOfferingID] = struct{}{}
			ward = append(ward, row.SubjectOfferingID)
		}
	}

	return own, ward, nil
}

func teachingScope(ctx context.Context, client *tenantent.Client, teacherID uuid.UUID) (sections, offerings []uuid.UUID, err error) {
	rows, err := client.TeacherAssignment.Query().
		Where(
			entassignment.TeacherID(teacherID),
			entassignment.StatusEQ(entassignment.StatusActive),
			entassignment.HasAcademicSessionWith(entsession.IsCurrent(true)),
		).
		All(ctx)
	if err != nil {
		return nil, nil, err
	}

	seenSection := map[uuid.UUID]struct{}{}
	seenOffering := map[uuid.UUID]struct{}{}

	for _, row := range rows {
		if row.SubjectOfferingID == nil {
			if _, ok := seenSection[row.SectionID]; !ok {
				seenSection[row.SectionID] = struct{}{}
				sections = append(sections, row.SectionID)
			}
			continue
		}
		if _, ok := seenOffering[*row.SubjectOfferingID]; !ok {
			seenOffering[*row.SubjectOfferingID] = struct{}{}
			offerings = append(offerings, *row.SubjectOfferingID)
		}
	}

	classSections, err := client.Section.Query().
		Where(
			entsection.ClassTeacherID(teacherID),
			entsection.HasAcademicSessionWith(entsession.IsCurrent(true)),
		).
		IDs(ctx)
	if err != nil {
		return nil, nil, err
	}
	for _, id := range classSections {
		if _, ok := seenSection[id]; !ok {
			seenSection[id] = struct{}{}
			sections = append(sections, id)
		}
	}

	return sections, offerings, nil
}
