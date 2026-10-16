package staff

import (
	"net/url"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
)

type Filters struct {
	Search     string
	Status     *entstaff.Status
	Branch     *uuid.UUID
	Department *uuid.UUID
	Teaching   bool

	Limit  int
	Offset int
}

func ParseFilters(values url.Values) (Filters, error) {
	p := filter.New(values)

	f := Filters{
		Search:     p.String("q"),
		Branch:     p.UUID("branch_id"),
		Department: p.UUID("department_id"),
		Teaching:   p.Bool("teaching"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entstaff.StatusValidator(entstaff.Status(v))
	}); raw != nil {
		status := entstaff.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return Filters{}, err
	}
	return f, nil
}

func (q *Query) ApplyFilters(f Filters) *Query {
	q = q.Search(f.Search)

	if f.Status != nil {
		q = q.WithStatus(*f.Status)
	}
	if f.Branch != nil {
		q = q.InBranch(*f.Branch)
	}
	if f.Department != nil {
		q = q.InDepartment(*f.Department)
	}
	if f.Teaching {
		q = q.Teaching()
	}
	return q.Paginate(f.Limit, f.Offset)
}
