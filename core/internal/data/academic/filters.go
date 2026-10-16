package academic

import (
	"net/url"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entbranch "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/branch"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	enthouse "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/schoolhouse"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subject"
	entgroup "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectgroup"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
)

const (
	DefaultLimit = 50
	MaxLimit     = 200
)

type SessionFilters struct {
	Status  *entsession.Status
	Current bool

	Limit  int
	Offset int
}

func ParseSessionFilters(values url.Values) (SessionFilters, error) {
	p := filter.New(values)

	f := SessionFilters{Current: p.Bool("current")}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entsession.StatusValidator(entsession.Status(v))
	}); raw != nil {
		status := entsession.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return SessionFilters{}, err
	}
	return f, nil
}

func (f SessionFilters) Apply(q *tenantent.AcademicSessionQuery) *tenantent.AcademicSessionQuery {
	if f.Current {
		q = q.Where(entsession.IsCurrent(true))
	}
	if f.Status != nil {
		q = q.Where(entsession.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type GradeLevelFilters struct {
	Active bool

	Limit  int
	Offset int
}

func ParseGradeLevelFilters(values url.Values) (GradeLevelFilters, error) {
	p := filter.New(values)
	f := GradeLevelFilters{Active: p.Bool("active")}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if err := p.Err(); err != nil {
		return GradeLevelFilters{}, err
	}
	return f, nil
}

func (f GradeLevelFilters) Apply(q *tenantent.GradeLevelQuery) *tenantent.GradeLevelQuery {
	if f.Active {
		q = q.Where(entgrade.StatusEQ(entgrade.StatusActive))
	}
	q = q.Limit(f.Limit).Offset(f.Offset)
	return q
}

type HouseFilters struct {
	Active bool

	Limit  int
	Offset int
}

func ParseHouseFilters(values url.Values) (HouseFilters, error) {
	p := filter.New(values)
	f := HouseFilters{Active: p.Bool("active")}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if err := p.Err(); err != nil {
		return HouseFilters{}, err
	}
	return f, nil
}

func (f HouseFilters) Apply(q *tenantent.SchoolHouseQuery) *tenantent.SchoolHouseQuery {
	if f.Active {
		q = q.Where(enthouse.StatusEQ(enthouse.StatusActive))
	}
	q = q.Limit(f.Limit).Offset(f.Offset)
	return q
}

type BranchFilters struct {
	Active bool

	Limit  int
	Offset int
}

func ParseBranchFilters(values url.Values) (BranchFilters, error) {
	p := filter.New(values)
	f := BranchFilters{Active: p.Bool("active")}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if err := p.Err(); err != nil {
		return BranchFilters{}, err
	}
	return f, nil
}

func (f BranchFilters) Apply(q *tenantent.BranchQuery) *tenantent.BranchQuery {
	if f.Active {
		q = q.Where(entbranch.StatusEQ(entbranch.StatusActive))
	}
	q = q.Limit(f.Limit).Offset(f.Offset)
	return q
}

type SectionFilters struct {
	Session      *uuid.UUID
	Branch       *uuid.UUID
	GradeLevel   *uuid.UUID
	ClassTeacher *uuid.UUID
	Active       bool
	AllSessions  bool

	Limit  int
	Offset int
}

func ParseSectionFilters(values url.Values) (SectionFilters, error) {
	p := filter.New(values)

	f := SectionFilters{
		Session:      p.UUID("academic_session_id"),
		Branch:       p.UUID("branch_id"),
		GradeLevel:   p.UUID("grade_level_id"),
		ClassTeacher: p.UUID("class_teacher_id"),
		Active:       p.Bool("active"),
		AllSessions:  p.Bool("all_sessions"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if err := p.Err(); err != nil {
		return SectionFilters{}, err
	}
	return f, nil
}

func (f SectionFilters) sessionPredicate() predicate.Section {
	switch {
	case f.Session != nil:
		return entsection.AcademicSessionID(*f.Session)
	case !f.AllSessions:
		return entsection.HasAcademicSessionWith(entsession.IsCurrent(true))
	default:
		return nil
	}
}

func (f SectionFilters) Apply(q *tenantent.SectionQuery) *tenantent.SectionQuery {
	if p := f.sessionPredicate(); p != nil {
		q = q.Where(p)
	}

	if f.Branch != nil {
		q = q.Where(entsection.BranchID(*f.Branch))
	}
	if f.GradeLevel != nil {
		q = q.Where(entsection.GradeLevelID(*f.GradeLevel))
	}
	if f.ClassTeacher != nil {
		q = q.Where(entsection.ClassTeacherID(*f.ClassTeacher))
	}
	if f.Active {
		q = q.Where(entsection.StatusEQ(entsection.StatusActive))
	}

	return q.Limit(f.Limit).Offset(f.Offset)
}

type SubjectFilters struct {
	Active      bool
	Elective    bool
	SubjectType *string

	Limit  int
	Offset int
}

func ParseSubjectFilters(values url.Values) (SubjectFilters, error) {
	p := filter.New(values)

	f := SubjectFilters{
		Active:      p.Bool("active"),
		Elective:    p.Bool("elective"),
		SubjectType: p.Enum("subject_type", entsubject.SubjectTypeValidator),
	}

	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if err := p.Err(); err != nil {
		return SubjectFilters{}, err
	}
	return f, nil
}

func (f SubjectFilters) Apply(q *tenantent.SubjectQuery) *tenantent.SubjectQuery {
	if f.Active {
		q = q.Where(entsubject.StatusEQ(entsubject.StatusActive))
	}
	if f.Elective {
		q = q.Where(entsubject.IsElective(true))
	}
	if f.SubjectType != nil {
		q = q.Where(entsubject.SubjectType(*f.SubjectType))
	}
	q = q.Limit(f.Limit).Offset(f.Offset)
	return q
}

type SubjectGroupFilters struct {
	Active bool

	Limit  int
	Offset int
}

func ParseSubjectGroupFilters(values url.Values) (SubjectGroupFilters, error) {
	p := filter.New(values)
	f := SubjectGroupFilters{Active: p.Bool("active")}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if err := p.Err(); err != nil {
		return SubjectGroupFilters{}, err
	}
	return f, nil
}

func (f SubjectGroupFilters) Apply(q *tenantent.SubjectGroupQuery) *tenantent.SubjectGroupQuery {
	if f.Active {
		q = q.Where(entgroup.StatusEQ(entgroup.StatusActive))
	}
	q = q.Limit(f.Limit).Offset(f.Offset)
	return q
}

type OfferingFilters struct {
	Session     *uuid.UUID
	Section     *uuid.UUID
	Subject     *uuid.UUID
	Active      bool
	AllSessions bool

	Limit  int
	Offset int
}

func ParseOfferingFilters(values url.Values) (OfferingFilters, error) {
	p := filter.New(values)

	f := OfferingFilters{
		Session:     p.UUID("academic_session_id"),
		Section:     p.UUID("section_id"),
		Subject:     p.UUID("subject_id"),
		Active:      p.Bool("active"),
		AllSessions: p.Bool("all_sessions"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if err := p.Err(); err != nil {
		return OfferingFilters{}, err
	}
	return f, nil
}

func (f OfferingFilters) sessionPredicate() predicate.SubjectOffering {
	switch {
	case f.Session != nil:
		return entoffering.AcademicSessionID(*f.Session)
	case !f.AllSessions:
		return entoffering.HasAcademicSessionWith(entsession.IsCurrent(true))
	default:
		return nil
	}
}

func (f OfferingFilters) Apply(q *tenantent.SubjectOfferingQuery) *tenantent.SubjectOfferingQuery {
	if p := f.sessionPredicate(); p != nil {
		q = q.Where(p)
	}

	if f.Section != nil {
		q = q.Where(entoffering.SectionID(*f.Section))
	}
	if f.Subject != nil {
		q = q.Where(entoffering.SubjectID(*f.Subject))
	}
	if f.Active {
		q = q.Where(entoffering.StatusEQ(entoffering.StatusActive))
	}

	return q.Limit(f.Limit).Offset(f.Offset)
}
