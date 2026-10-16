package student

import (
	"context"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const (
	DefaultLimit = 50
	MaxLimit     = 200
)

type Query struct {
	ctx context.Context
	q   *tenantent.StudentQuery
	err error
}

func New(ctx context.Context) *Query {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return &Query{ctx: ctx, err: err}
	}
	return &Query{ctx: ctx, q: client.Student.Query()}
}

func (q *Query) WithStatus(status entstudent.Status) *Query {
	return q.where(entstudent.StatusEQ(status))
}

func (q *Query) Active() *Query { return q.where(entstudent.StatusEQ(entstudent.StatusActive)) }

func (q *Query) Alumni() *Query { return q.where(entstudent.StatusEQ(entstudent.StatusAlumni)) }

func (q *Query) Withdrawn() *Query {
	return q.where(entstudent.StatusEQ(entstudent.StatusWithdrawn))
}

func (q *Query) InHouse(houseID uuid.UUID) *Query { return q.where(entstudent.HouseID(houseID)) }

func (q *Query) WithAdmissionNumber(number string) *Query {
	return q.where(entstudent.AdmissionNumber(number))
}

func (q *Query) Search(term string) *Query {
	if term == "" {
		return q
	}
	return q.where(entstudent.Or(
		entstudent.AdmissionNumberContainsFold(term),
		entstudent.StudentCodeContainsFold(term),
		entstudent.HasPersonWith(entperson.Or(
			entperson.DisplayNameContainsFold(term),
			entperson.FirstNameContainsFold(term),
			entperson.LastNameContainsFold(term),
		)),
	))
}

func (q *Query) GuardedBy(guardianID uuid.UUID) *Query {
	return q.where(entstudent.HasGuardianLinksWith(
		entlink.GuardianID(guardianID),
		entlink.StatusEQ(entlink.StatusActive),
	))
}

func (q *Query) WithPerson() *Query {
	if q.err == nil {
		q.q = q.q.WithPerson()
	}
	return q
}

func (q *Query) WithGuardians() *Query {
	if q.err == nil {
		q.q = q.q.WithGuardianLinks(func(lq *tenantent.StudentGuardianQuery) {
			lq.WithGuardian()
		})
	}
	return q
}

func (q *Query) WithAddresses() *Query {
	if q.err == nil {
		q.q = q.q.WithAddresses()
	}
	return q
}

func (q *Query) WithDocuments() *Query {
	if q.err == nil {
		q.q = q.q.WithDocuments()
	}
	return q
}

func (q *Query) Basic() *Query { return q.WithPerson() }

func (q *Query) Paginate(limit, offset int) *Query {
	if limit <= 0 {
		limit = DefaultLimit
	}
	if limit > MaxLimit {
		limit = MaxLimit
	}
	if offset < 0 {
		offset = 0
	}
	if q.err == nil {
		q.q = q.q.Limit(limit).Offset(offset)
	}
	return q
}

func (q *Query) Newest() *Query {
	if q.err == nil {
		q.q = q.q.Order(tenantent.Desc(entstudent.FieldCreatedAt))
	}
	return q
}

func (q *Query) All() ([]*tenantent.Student, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.All(q.ctx)
}

func (q *Query) First() (*tenantent.Student, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.First(q.ctx)
}

func (q *Query) Only() (*tenantent.Student, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.Only(q.ctx)
}

func (q *Query) Count() (int, error) {
	if q.err != nil {
		return 0, q.err
	}
	return q.q.Count(q.ctx)
}

func (q *Query) IDs() ([]uuid.UUID, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.IDs(q.ctx)
}

func Get(ctx context.Context, id uuid.UUID) (*tenantent.Student, error) {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return client.Student.Query().Where(entstudent.ID(id)).WithPerson().Only(ctx)
}

func (q *Query) where(ps ...predicate.Student) *Query {
	if q.err == nil {
		q.q = q.q.Where(ps...)
	}
	return q
}

func (q *Query) ForViewer(v *access.Viewer, d authorization.Decision) *Query {
	if q.err != nil {
		return q
	}
	return q.where(access.StudentsFor(v, d))
}

func (q *Query) InSection(sectionID uuid.UUID) *Query {
	return q.where(entstudent.HasEnrollmentsWith(
		entenrollment.SectionID(sectionID),
		entenrollment.StatusEQ(entenrollment.StatusActive),
	))
}

func (q *Query) InSession(sessionID uuid.UUID) *Query {
	return q.where(entstudent.HasEnrollmentsWith(
		entenrollment.AcademicSessionID(sessionID),
	))
}

func (q *Query) InCurrentSession() *Query {
	return q.where(entstudent.HasEnrollmentsWith(
		entenrollment.HasAcademicSessionWith(entsession.IsCurrent(true)),
	))
}

func (q *Query) TaughtBy(teacherID uuid.UUID) *Query {
	return q.where(entstudent.HasEnrollmentsWith(
		entenrollment.StatusEQ(entenrollment.StatusActive),
		entenrollment.HasSectionWith(
			entsection.HasTeacherAssignmentsWith(
				entassignment.TeacherID(teacherID),
				entassignment.StatusEQ(entassignment.StatusActive),
			),
		),
	))
}

func (q *Query) WithCurrentEnrollment() *Query {
	if q.err == nil {
		q.q = q.q.WithEnrollments(func(eq *tenantent.StudentEnrollmentQuery) {
			eq.Where(entenrollment.HasAcademicSessionWith(entsession.IsCurrent(true))).
				WithSection()
		})
	}
	return q
}

func (q *Query) TakingOffering(offeringID uuid.UUID) *Query {
	return q.where(entstudent.HasSubjectEnrollmentsWith(
		entsubjenroll.SubjectOfferingID(offeringID),
		entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
	))
}

func (q *Query) WithSubjects() *Query {
	if q.err == nil {
		q.q = q.q.WithSubjectEnrollments(func(sq *tenantent.StudentSubjectEnrollmentQuery) {
			sq.Where(entsubjenroll.StatusEQ(entsubjenroll.StatusActive)).
				WithSubjectOffering()
		})
	}
	return q
}

func (q *Query) ByID(id uuid.UUID) *Query { return q.where(entstudent.ID(id)) }
