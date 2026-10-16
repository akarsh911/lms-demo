package enrollment

import (
	"net/url"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
)

type Filters struct {
	Student         *uuid.UUID
	AcademicSession *uuid.UUID
	Section         *uuid.UUID
	Status          *entenrollment.Status
	AllSessions     bool

	Limit  int
	Offset int
}

func ParseFilters(values url.Values) (Filters, error) {
	p := filter.New(values)

	f := Filters{
		Student:         p.UUID("student_id"),
		AcademicSession: p.UUID("academic_session_id"),
		Section:         p.UUID("section_id"),
		AllSessions:     p.Bool("all_sessions"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entenrollment.StatusValidator(entenrollment.Status(v))
	}); raw != nil {
		status := entenrollment.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return Filters{}, err
	}
	return f, nil
}

func (q *Query) ApplyFilters(f Filters) *Query {
	switch {
	case f.AcademicSession != nil:
		q = q.where(entenrollment.AcademicSessionID(*f.AcademicSession))
	case !f.AllSessions:
		q = q.where(entenrollment.HasAcademicSessionWith(entsession.IsCurrent(true)))
	}
	if f.Section != nil {
		q = q.where(entenrollment.SectionID(*f.Section))
	}
	if f.Student != nil {
		q = q.where(entenrollment.StudentID(*f.Student))
	}
	if f.Status != nil {
		q = q.where(entenrollment.StatusEQ(*f.Status))
	}
	return q.Paginate(f.Limit, f.Offset)
}

type SubjectFilters struct {
	Student         *uuid.UUID
	SubjectOffering *uuid.UUID
	AcademicSession *uuid.UUID
	Status          *entsubjenroll.Status
	AllSessions     bool

	Limit  int
	Offset int
}

func ParseSubjectFilters(values url.Values) (SubjectFilters, error) {
	p := filter.New(values)

	f := SubjectFilters{
		Student:         p.UUID("student_id"),
		SubjectOffering: p.UUID("subject_offering_id"),
		AcademicSession: p.UUID("academic_session_id"),
		AllSessions:     p.Bool("all_sessions"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entsubjenroll.StatusValidator(entsubjenroll.Status(v))
	}); raw != nil {
		status := entsubjenroll.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return SubjectFilters{}, err
	}
	return f, nil
}

func (q *SubjectQuery) ApplyFilters(f SubjectFilters) *SubjectQuery {
	switch {
	case f.AcademicSession != nil:
		q = q.where(entsubjenroll.AcademicSessionID(*f.AcademicSession))
	case !f.AllSessions:
		q = q.where(entsubjenroll.HasAcademicSessionWith(entsession.IsCurrent(true)))
	}
	if f.Student != nil {
		q = q.where(entsubjenroll.StudentID(*f.Student))
	}
	if f.SubjectOffering != nil {
		q = q.where(entsubjenroll.SubjectOfferingID(*f.SubjectOffering))
	}
	if f.Status != nil {
		q = q.where(entsubjenroll.StatusEQ(*f.Status))
	}
	return q.Paginate(f.Limit, f.Offset)
}
