package guardian

import (
	"context"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entguardian "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/guardian"
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
	q   *tenantent.GuardianQuery
	err error
}

func New(ctx context.Context) *Query {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return &Query{ctx: ctx, err: err}
	}
	return &Query{ctx: ctx, q: client.Guardian.Query()}
}

func (q *Query) WithStatus(status entguardian.Status) *Query {
	return q.where(entguardian.StatusEQ(status))
}

func (q *Query) Active() *Query { return q.where(entguardian.StatusEQ(entguardian.StatusActive)) }

func (q *Query) OfStudent(studentID uuid.UUID) *Query {
	return q.where(entguardian.HasStudentLinksWith(
		entlink.StudentID(studentID),
		entlink.StatusEQ(entlink.StatusActive),
	))
}

func (q *Query) Primary() *Query {
	return q.where(entguardian.HasStudentLinksWith(entlink.IsPrimary(true)))
}

func (q *Query) Search(term string) *Query {
	if term == "" {
		return q
	}
	return q.where(entguardian.Or(
		entguardian.OccupationContainsFold(term),
		entguardian.EmployerContainsFold(term),
		entguardian.HasPersonWith(entperson.Or(
			entperson.DisplayNameContainsFold(term),
			entperson.FirstNameContainsFold(term),
			entperson.LastNameContainsFold(term),
		)),
	))
}

func (q *Query) WithPerson() *Query {
	if q.err == nil {
		q.q = q.q.WithPerson()
	}
	return q
}

func (q *Query) WithStudents() *Query {
	if q.err == nil {
		q.q = q.q.WithStudentLinks(func(lq *tenantent.StudentGuardianQuery) { lq.WithStudent() })
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
		q.q = q.q.Order(tenantent.Desc(entguardian.FieldCreatedAt))
	}
	return q
}

func (q *Query) All() ([]*tenantent.Guardian, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.All(q.ctx)
}

func (q *Query) Count() (int, error) {
	if q.err != nil {
		return 0, q.err
	}
	return q.q.Count(q.ctx)
}

func Get(ctx context.Context, id uuid.UUID) (*tenantent.Guardian, error) {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return client.Guardian.Query().Where(entguardian.ID(id)).WithPerson().Only(ctx)
}

func (q *Query) where(ps ...predicate.Guardian) *Query {
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

func anyGuardian() predicate.Guardian { return func(*sql.Selector) {} }

func For(v *access.Viewer, d authorization.Decision) predicate.Guardian {
	if v == nil {
		return entguardian.IDIn()
	}
	if v.Unrestricted {
		return anyGuardian()
	}

	if d.HasReach {
		switch d.Reach {
		case authorization.ReachTenant:
			return anyGuardian()
		case authorization.ReachSelf:
			return selfPredicate(v)
		case authorization.ReachGuardianWard:
			return selfPredicate(v)
		case authorization.ReachTeacherAssignment:
			return teacherAssignmentPredicate(v)
		default:
			return entguardian.IDIn()
		}
	}

	return anyRolePredicate(v)
}

func selfPredicate(v *access.Viewer) predicate.Guardian {
	if v.GuardianID == nil {
		return entguardian.IDIn()
	}
	return entguardian.ID(*v.GuardianID)
}

func teacherAssignmentPredicate(v *access.Viewer) predicate.Guardian {
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
		return entguardian.IDIn()
	}
	return entguardian.HasStudentLinksWith(
		entlink.StatusEQ(entlink.StatusActive),
		entlink.HasStudentWith(entstudent.Or(ors...)),
	)
}

func anyRolePredicate(v *access.Viewer) predicate.Guardian {
	var ors []predicate.Guardian
	if v.GuardianID != nil {
		ors = append(ors, selfPredicate(v))
	}
	if len(v.StudentIDs) > 0 {
		ors = append(ors, entguardian.HasStudentLinksWith(
			entlink.StudentIDIn(v.StudentIDs...),
			entlink.StatusEQ(entlink.StatusActive),
		))
	}
	if len(ors) == 0 {
		return entguardian.IDIn()
	}
	return entguardian.Or(ors...)
}

func (q *Query) ByID(id uuid.UUID) *Query { return q.where(entguardian.ID(id)) }

func (q *Query) Only() (*tenantent.Guardian, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.Only(q.ctx)
}
