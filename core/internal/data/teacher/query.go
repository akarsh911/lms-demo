package teacher

import (
	"context"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
	entteacher "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacher"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const (
	DefaultLimit = 50
	MaxLimit     = 200
)

type Query struct {
	ctx context.Context
	q   *tenantent.TeacherQuery
	err error
}

func New(ctx context.Context) *Query {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return &Query{ctx: ctx, err: err}
	}
	return &Query{ctx: ctx, q: client.Teacher.Query()}
}

func (q *Query) WithStatus(status entteacher.Status) *Query {
	return q.where(entteacher.StatusEQ(status))
}

func (q *Query) Active() *Query { return q.where(entteacher.StatusEQ(entteacher.StatusActive)) }

func (q *Query) InBranch(id uuid.UUID) *Query {
	return q.where(entteacher.HasStaffWith(entstaff.BranchID(id)))
}

func (q *Query) Specializing(subject string) *Query {
	if subject == "" {
		return q
	}
	return q.where(entteacher.SpecializationContainsFold(subject))
}

func (q *Query) WithStaff() *Query {
	if q.err == nil {
		q.q = q.q.WithStaff(func(sq *tenantent.StaffQuery) { sq.WithPerson() })
	}
	return q
}

func (q *Query) Basic() *Query { return q.WithStaff() }

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
		q.q = q.q.Order(tenantent.Desc(entteacher.FieldCreatedAt))
	}
	return q
}

func (q *Query) All() ([]*tenantent.Teacher, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.All(q.ctx)
}

func (q *Query) Only() (*tenantent.Teacher, error) {
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

func (q *Query) where(ps ...predicate.Teacher) *Query {
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

func anyTeacher() predicate.Teacher { return func(*sql.Selector) {} }

func For(v *access.Viewer, d authorization.Decision) predicate.Teacher {
	if v == nil {
		return entteacher.IDIn()
	}
	if v.Unrestricted {
		return anyTeacher()
	}

	if d.HasReach {
		switch d.Reach {
		case authorization.ReachTenant:
			return anyTeacher()
		case authorization.ReachSelf:
			return selfPredicate(v)
		case authorization.ReachTeacherAssignment:
			return teacherAssignmentPredicate(v)
		case authorization.ReachGuardianWard:
			return entteacher.IDIn()
		default:
			return entteacher.IDIn()
		}
	}

	return selfPredicate(v)
}

func selfPredicate(v *access.Viewer) predicate.Teacher {
	if v.TeacherID == nil {
		return entteacher.IDIn()
	}
	return entteacher.ID(*v.TeacherID)
}

func teacherAssignmentPredicate(v *access.Viewer) predicate.Teacher {
	var ors []predicate.Teacher
	if v.TeacherID != nil {
		ors = append(ors, entteacher.ID(*v.TeacherID))
	}
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entteacher.HasAssignmentsWith(
			entassignment.SectionIDIn(v.SectionIDs...),
			entassignment.StatusEQ(entassignment.StatusActive),
		))
	}
	if len(ors) == 0 {
		return entteacher.IDIn()
	}
	return entteacher.Or(ors...)
}

func (q *Query) ByID(id uuid.UUID) *Query { return q.where(entteacher.ID(id)) }
