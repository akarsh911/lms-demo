package teacher

import (
	"net/url"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	entteacher "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacher"
)

type Filters struct {
	Specialization string
	Status         *entteacher.Status
	Branch         *uuid.UUID

	Limit  int
	Offset int
}

func ParseFilters(values url.Values) (Filters, error) {
	p := filter.New(values)

	f := Filters{
		Specialization: p.String("specialization"),
		Branch:         p.UUID("branch_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entteacher.StatusValidator(entteacher.Status(v))
	}); raw != nil {
		status := entteacher.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return Filters{}, err
	}
	return f, nil
}

func (q *Query) ApplyFilters(f Filters) *Query {
	q = q.Specializing(f.Specialization)

	if f.Status != nil {
		q = q.WithStatus(*f.Status)
	}
	if f.Branch != nil {
		q = q.InBranch(*f.Branch)
	}
	return q.Paginate(f.Limit, f.Offset)
}
