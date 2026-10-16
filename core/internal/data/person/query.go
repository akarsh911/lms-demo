package person

import (
	"context"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const (
	DefaultLimit = 50
	MaxLimit     = 200
)

type Query struct {
	ctx context.Context
	q   *tenantent.PersonQuery
	err error
}

func New(ctx context.Context) *Query {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return &Query{ctx: ctx, err: err}
	}
	return &Query{ctx: ctx, q: client.Person.Query()}
}

func (q *Query) WithStatus(status entperson.Status) *Query {
	return q.where(entperson.StatusEQ(status))
}

func (q *Query) Active() *Query { return q.where(entperson.StatusEQ(entperson.StatusActive)) }

func (q *Query) ByCASUser(id uuid.UUID) *Query { return q.where(entperson.CasUserID(id)) }

func (q *Query) Search(term string) *Query {
	if term == "" {
		return q
	}
	return q.where(entperson.Or(
		entperson.DisplayNameContainsFold(term),
		entperson.FirstNameContainsFold(term),
		entperson.LastNameContainsFold(term),
		entperson.EmailContainsFold(term),
	))
}

func (q *Query) WithStudents() *Query {
	if q.err == nil {
		q.q = q.q.WithStudents()
	}
	return q
}

func (q *Query) WithStaff() *Query {
	if q.err == nil {
		q.q = q.q.WithStaffRecords()
	}
	return q
}

func (q *Query) WithGuardian() *Query {
	if q.err == nil {
		q.q = q.q.WithGuardian()
	}
	return q
}

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
		q.q = q.q.Order(tenantent.Desc(entperson.FieldCreatedAt))
	}
	return q
}

func (q *Query) All() ([]*tenantent.Person, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.All(q.ctx)
}

func (q *Query) First() (*tenantent.Person, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.First(q.ctx)
}

func (q *Query) Count() (int, error) {
	if q.err != nil {
		return 0, q.err
	}
	return q.q.Count(q.ctx)
}

func Get(ctx context.Context, id uuid.UUID) (*tenantent.Person, error) {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return client.Person.Get(ctx, id)
}

func (q *Query) where(ps ...predicate.Person) *Query {
	if q.err == nil {
		q.q = q.q.Where(ps...)
	}
	return q
}

func (q *Query) ForViewer(v *access.Viewer, d authorization.Decision) *Query {
	if q.err != nil {
		return q
	}
	return q.where(For(v, d))
}

func anyPerson() predicate.Person { return func(*sql.Selector) {} }

func For(v *access.Viewer, d authorization.Decision) predicate.Person {
	if v == nil {
		return entperson.IDIn()
	}
	if v.Unrestricted {
		return anyPerson()
	}

	if d.HasReach {
		switch d.Reach {
		case authorization.ReachTenant:
			return anyPerson()
		case authorization.ReachSelf:
			return selfPredicate(v)
		case authorization.ReachGuardianWard:
			return guardianWardPredicate(v)
		case authorization.ReachTeacherAssignment:
			return teacherAssignmentPredicate(v)
		default:
			return entperson.IDIn()
		}
	}

	return anyRolePredicate(v)
}

func selfPredicate(v *access.Viewer) predicate.Person {
	if v.PersonID == nil {
		return entperson.IDIn()
	}
	return entperson.ID(*v.PersonID)
}

func guardianWardPredicate(v *access.Viewer) predicate.Person {
	if v.GuardianID == nil {
		return entperson.IDIn()
	}
	return entperson.HasStudentsWith(
		entstudent.HasGuardianLinksWith(
			entlink.GuardianID(*v.GuardianID),
			entlink.StatusEQ(entlink.StatusActive),
		),
	)
}

func teacherAssignmentPredicate(v *access.Viewer) predicate.Person {
	var ors []predicate.Student
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entstudent.HasEnrollmentsWith(
			entenrollment.SectionIDIn(v.SectionIDs...),
			entenrollment.StatusEQ(entenrollment.StatusActive),
		))
	}
	if len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, entstudent.HasSubjectEnrollmentsWith(
			entsubjenroll.SubjectOfferingIDIn(v.SubjectOfferingIDs...),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		))
	}
	if len(ors) == 0 {
		return entperson.IDIn()
	}
	return entperson.HasStudentsWith(entstudent.Or(ors...))
}

func anyRolePredicate(v *access.Viewer) predicate.Person {
	var ors []predicate.Person
	if v.PersonID != nil {
		ors = append(ors, selfPredicate(v))
	}
	if v.GuardianID != nil {
		ors = append(ors, guardianWardPredicate(v))
	}
	if len(ors) == 0 {
		return entperson.IDIn()
	}
	return entperson.Or(ors...)
}

func (q *Query) ByID(id uuid.UUID) *Query { return q.where(entperson.ID(id)) }

func (q *Query) Only() (*tenantent.Person, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.Only(q.ctx)
}
