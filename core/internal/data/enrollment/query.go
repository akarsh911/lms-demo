package enrollment

import (
	"context"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const (
	DefaultLimit = 50
	MaxLimit     = 200
)

type Query struct {
	ctx context.Context
	q   *tenantent.StudentEnrollmentQuery
	err error
}

func New(ctx context.Context) *Query {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return &Query{ctx: ctx, err: err}
	}
	return &Query{ctx: ctx, q: client.StudentEnrollment.Query()}
}

func (q *Query) where(ps ...predicate.StudentEnrollment) *Query {
	if q.err == nil {
		q.q = q.q.Where(ps...)
	}
	return q
}

func (q *Query) WithSection() *Query {
	if q.err == nil {
		q.q = q.q.WithSection()
	}
	return q
}

func (q *Query) WithStudent() *Query {
	if q.err == nil {
		q.q = q.q.WithStudent()
	}
	return q
}

func (q *Query) WithAcademicSession() *Query {
	if q.err == nil {
		q.q = q.q.WithAcademicSession()
	}
	return q
}

func (q *Query) Basic() *Query { return q.WithSection().WithStudent() }

func (q *Query) ForViewer(v *access.Viewer, d authorization.Decision) *Query {
	if q.err != nil {
		return q
	}
	return q.where(access.EnrollmentsFor(v, d))
}

func (q *Query) ByID(id uuid.UUID) *Query { return q.where(entenrollment.ID(id)) }

func (q *Query) Count() (int, error) {
	if q.err != nil {
		return 0, q.err
	}
	return q.q.Count(q.ctx)
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

func (q *Query) ByRollNumber() *Query {
	if q.err == nil {
		q.q = q.q.Order(tenantent.Asc(entenrollment.FieldRollNumber))
	}
	return q
}

func (q *Query) All() ([]*tenantent.StudentEnrollment, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.All(q.ctx)
}

type SubjectQuery struct {
	ctx context.Context
	q   *tenantent.StudentSubjectEnrollmentQuery
	err error
}

func NewSubject(ctx context.Context) *SubjectQuery {
	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return &SubjectQuery{ctx: ctx, err: err}
	}
	return &SubjectQuery{ctx: ctx, q: client.StudentSubjectEnrollment.Query()}
}

func (q *SubjectQuery) where(ps ...predicate.StudentSubjectEnrollment) *SubjectQuery {
	if q.err == nil {
		q.q = q.q.Where(ps...)
	}
	return q
}

func (q *SubjectQuery) WithSubjectOffering() *SubjectQuery {
	if q.err == nil {
		q.q = q.q.WithSubjectOffering()
	}
	return q
}

func (q *SubjectQuery) WithStudent() *SubjectQuery {
	if q.err == nil {
		q.q = q.q.WithStudent()
	}
	return q
}

func (q *SubjectQuery) Basic() *SubjectQuery { return q.WithSubjectOffering().WithStudent() }

func (q *SubjectQuery) ForViewer(v *access.Viewer, d authorization.Decision) *SubjectQuery {
	if q.err != nil {
		return q
	}
	return q.where(access.SubjectEnrollmentsFor(v, d))
}

func (q *SubjectQuery) ByID(id uuid.UUID) *SubjectQuery {
	return q.where(entsubjenroll.ID(id))
}

func (q *SubjectQuery) Count() (int, error) {
	if q.err != nil {
		return 0, q.err
	}
	return q.q.Count(q.ctx)
}

func (q *SubjectQuery) Paginate(limit, offset int) *SubjectQuery {
	if limit <= 0 || limit > MaxLimit {
		limit = DefaultLimit
	}
	if offset < 0 {
		offset = 0
	}
	if q.err == nil {
		q.q = q.q.Limit(limit).Offset(offset)
	}
	return q
}

func (q *SubjectQuery) All() ([]*tenantent.StudentSubjectEnrollment, error) {
	if q.err != nil {
		return nil, q.err
	}
	return q.q.All(q.ctx)
}
