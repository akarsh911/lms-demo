package person

import (
	"net/url"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
)

type Filters struct {
	Search    string
	Status    *entperson.Status
	CASUserID *uuid.UUID

	Limit  int
	Offset int
}

func ParseFilters(values url.Values) (Filters, error) {
	p := filter.New(values)

	f := Filters{
		Search:    p.String("q"),
		CASUserID: p.UUID("cas_user_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entperson.StatusValidator(entperson.Status(v))
	}); raw != nil {
		status := entperson.Status(*raw)
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
	if f.CASUserID != nil {
		q = q.ByCASUser(*f.CASUserID)
	}
	return q.Paginate(f.Limit, f.Offset)
}
