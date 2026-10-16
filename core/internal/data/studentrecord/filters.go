package studentrecord

import (
	"net/url"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entaddress "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentaddress"
	entstudentassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentassignment"
	entdocument "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentdocument"
	entnote "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentnote"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
)

const (
	DefaultLimit = 50
	MaxLimit     = 200
)

type AddressFilters struct {
	StudentID   *uuid.UUID
	AddressType *entaddress.AddressType

	Limit  int
	Offset int
}

func ParseAddressFilters(values url.Values) (AddressFilters, error) {
	p := filter.New(values)

	f := AddressFilters{StudentID: p.UUID("student_id")}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("address_type", func(v string) error {
		return entaddress.AddressTypeValidator(entaddress.AddressType(v))
	}); raw != nil {
		kind := entaddress.AddressType(*raw)
		f.AddressType = &kind
	}

	if err := p.Err(); err != nil {
		return AddressFilters{}, err
	}
	return f, nil
}

func (f AddressFilters) Apply(q *tenantent.StudentAddressQuery) *tenantent.StudentAddressQuery {
	if f.StudentID != nil {
		q = q.Where(entaddress.StudentID(*f.StudentID))
	}
	if f.AddressType != nil {
		q = q.Where(entaddress.AddressTypeEQ(*f.AddressType))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type DocumentFilters struct {
	StudentID          *uuid.UUID
	VerificationStatus *entdocument.VerificationStatus

	Limit  int
	Offset int
}

func ParseDocumentFilters(values url.Values) (DocumentFilters, error) {
	p := filter.New(values)

	f := DocumentFilters{StudentID: p.UUID("student_id")}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("verification_status", func(v string) error {
		return entdocument.VerificationStatusValidator(entdocument.VerificationStatus(v))
	}); raw != nil {
		status := entdocument.VerificationStatus(*raw)
		f.VerificationStatus = &status
	}

	if err := p.Err(); err != nil {
		return DocumentFilters{}, err
	}
	return f, nil
}

func (f DocumentFilters) Apply(q *tenantent.StudentDocumentQuery) *tenantent.StudentDocumentQuery {
	if f.StudentID != nil {
		q = q.Where(entdocument.StudentID(*f.StudentID))
	}
	if f.VerificationStatus != nil {
		q = q.Where(entdocument.VerificationStatusEQ(*f.VerificationStatus))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type NoteFilters struct {
	StudentID *uuid.UUID
	Session   *uuid.UUID
	Category  string

	Limit  int
	Offset int
}

func ParseNoteFilters(values url.Values) (NoteFilters, error) {
	p := filter.New(values)

	f := NoteFilters{
		StudentID: p.UUID("student_id"),
		Session:   p.UUID("academic_session_id"),
		Category:  p.String("category"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if err := p.Err(); err != nil {
		return NoteFilters{}, err
	}
	return f, nil
}

func (f NoteFilters) Apply(q *tenantent.StudentNoteQuery) *tenantent.StudentNoteQuery {
	if f.StudentID != nil {
		q = q.Where(entnote.StudentID(*f.StudentID))
	}
	if f.Session != nil {
		q = q.Where(entnote.AcademicSessionID(*f.Session))
	}
	if f.Category != "" {
		q = q.Where(entnote.Category(f.Category))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type TeacherAssignmentFilters struct {
	Session     *uuid.UUID
	AllSessions bool
	TeacherID   *uuid.UUID
	SectionID   *uuid.UUID
	Status      *entteacherassign.Status

	Limit  int
	Offset int
}

func ParseTeacherAssignmentFilters(values url.Values) (TeacherAssignmentFilters, error) {
	p := filter.New(values)

	f := TeacherAssignmentFilters{
		Session:     p.UUID("academic_session_id"),
		AllSessions: p.Bool("all_sessions"),
		TeacherID:   p.UUID("teacher_id"),
		SectionID:   p.UUID("section_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entteacherassign.StatusValidator(entteacherassign.Status(v))
	}); raw != nil {
		status := entteacherassign.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return TeacherAssignmentFilters{}, err
	}
	return f, nil
}

func (f TeacherAssignmentFilters) Apply(q *tenantent.TeacherAssignmentQuery) *tenantent.TeacherAssignmentQuery {
	switch {
	case f.Session != nil:
		q = q.Where(entteacherassign.AcademicSessionID(*f.Session))
	case !f.AllSessions:
		q = q.Where(entteacherassign.HasAcademicSessionWith(entsession.IsCurrent(true)))
	}

	if f.TeacherID != nil {
		q = q.Where(entteacherassign.TeacherID(*f.TeacherID))
	}
	if f.SectionID != nil {
		q = q.Where(entteacherassign.SectionID(*f.SectionID))
	}
	if f.Status != nil {
		q = q.Where(entteacherassign.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type StudentAssignmentFilters struct {
	Session     *uuid.UUID
	AllSessions bool
	StudentID   *uuid.UUID
	SectionID   *uuid.UUID
	RoleType    string
	SchoolWide  bool
	Status      *entstudentassign.Status

	Limit  int
	Offset int
}

func ParseStudentAssignmentFilters(values url.Values) (StudentAssignmentFilters, error) {
	p := filter.New(values)

	f := StudentAssignmentFilters{
		Session:     p.UUID("academic_session_id"),
		AllSessions: p.Bool("all_sessions"),
		StudentID:   p.UUID("student_id"),
		SectionID:   p.UUID("section_id"),
		RoleType:    p.String("role_type"),
		SchoolWide:  p.Bool("school_wide"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entstudentassign.StatusValidator(entstudentassign.Status(v))
	}); raw != nil {
		status := entstudentassign.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return StudentAssignmentFilters{}, err
	}
	return f, nil
}

func (f StudentAssignmentFilters) Apply(q *tenantent.StudentAssignmentQuery) *tenantent.StudentAssignmentQuery {
	switch {
	case f.Session != nil:
		q = q.Where(entstudentassign.AcademicSessionID(*f.Session))
	case !f.AllSessions:
		q = q.Where(entstudentassign.HasAcademicSessionWith(entsession.IsCurrent(true)))
	}

	if f.StudentID != nil {
		q = q.Where(entstudentassign.StudentID(*f.StudentID))
	}
	if f.SectionID != nil {
		q = q.Where(entstudentassign.SectionID(*f.SectionID))
	}
	if f.RoleType != "" {
		q = q.Where(entstudentassign.RoleType(f.RoleType))
	}
	if f.SchoolWide {
		q = q.Where(entstudentassign.SectionIDIsNil())
	}
	if f.Status != nil {
		q = q.Where(entstudentassign.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}
