package guardian

import (
	"net/url"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	entguardian "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/guardian"
)

type Filters struct {
	Search  string
	Status  *entguardian.Status
	Student *uuid.UUID
	Primary bool

	Limit  int
	Offset int
}

func ParseFilters(values url.Values) (Filters, error) {
	p := filter.New(values)

	f := Filters{
		Search:  p.String("q"),
		Student: p.UUID("student_id"),
		Primary: p.Bool("primary"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entguardian.StatusValidator(entguardian.Status(v))
	}); raw != nil {
		status := entguardian.Status(*raw)
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
	if f.Student != nil {
		q = q.OfStudent(*f.Student)
	}
	if f.Primary {
		q = q.Primary()
	}
	return q.Paginate(f.Limit, f.Offset)
}
