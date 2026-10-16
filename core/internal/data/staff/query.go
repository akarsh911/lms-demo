package staff

import (
	"context"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
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
	q   *tenantent.StaffQuery
	err error
}

func New(ctx context.Context) *Query {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return &Query{ctx: ctx, err: err}
	}
	return &Query{ctx: ctx, q: client.Staff.Query()}
}

func (q *Query) WithStatus(status entstaff.Status) *Query {
	return q.where(entstaff.StatusEQ(status))
}

func (q *Query) Active() *Query { return q.where(entstaff.StatusEQ(entstaff.StatusActive)) }

func (q *Query) InBranch(id uuid.UUID) *Query { return q.where(entstaff.BranchID(id)) }

func (q *Query) InDepartment(id uuid.UUID) *Query { return q.where(entstaff.DepartmentID(id)) }

func (q *Query) Teaching() *Query { return q.where(entstaff.HasTeacher()) }

func (q *Query) Search(term string) *Query {
	if term == "" {
		return q
	}
	return q.where(entstaff.Or(
		entstaff.EmployeeCodeContainsFold(term),
		entstaff.DesignationContainsFold(term),
		entstaff.HasPersonWith(entperson.Or(
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

func (q *Query) WithTeacher() *Query {
	if q.err == nil {
		q.q = q.q.WithTeacher()
	}
	return q
}

func (q *Query) WithBranch() *Query {
	if q.err == nil {
		q.q = q.q.WithBranch()
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
		q.q = q.q.Order(tenantent.Desc(entstaff.FieldCreatedAt))
	}
	return q
}

func (q *Query) All() ([]*tenantent.Staff, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.All(q.ctx)
}

func (q *Query) Only() (*tenantent.Staff, error) {
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

func (q *Query) where(ps ...predicate.Staff) *Query {
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

func anyStaff() predicate.Staff { return func(*sql.Selector) {} }

func For(v *access.Viewer, d authorization.Decision) predicate.Staff {
	if v == nil {
		return entstaff.IDIn()
	}
	if v.Unrestricted {
		return anyStaff()
	}

	if d.HasReach {
		switch d.Reach {
		case authorization.ReachTenant:
			return anyStaff()
		case authorization.ReachSelf:
			return selfPredicate(v)
		case authorization.ReachTeacherAssignment:
			return teacherAssignmentPredicate(v)
		case authorization.ReachGuardianWard:
			return entstaff.IDIn()
		default:
			return entstaff.IDIn()
		}
	}

	return selfPredicate(v)
}

func selfPredicate(v *access.Viewer) predicate.Staff {
	if v.StaffID == nil {
		return entstaff.IDIn()
	}
	return entstaff.ID(*v.StaffID)
}

func teacherAssignmentPredicate(v *access.Viewer) predicate.Staff {
	var ors []predicate.Staff
	if v.StaffID != nil {
		ors = append(ors, entstaff.ID(*v.StaffID))
	}
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entstaff.HasTeacherWith(entteacher.HasAssignmentsWith(
			entassignment.SectionIDIn(v.SectionIDs...),
			entassignment.StatusEQ(entassignment.StatusActive),
		)))
	}
	if len(ors) == 0 {
		return entstaff.IDIn()
	}
	return entstaff.Or(ors...)
}

func (q *Query) ByID(id uuid.UUID) *Query { return q.where(entstaff.ID(id)) }
