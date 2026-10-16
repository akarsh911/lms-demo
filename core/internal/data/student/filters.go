package student

import (
	"net/url"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
)

type Filters struct {
	Search   string
	Status   *entstudent.Status
	Guardian *uuid.UUID
	House    *uuid.UUID
	Section  *uuid.UUID
	Session  *uuid.UUID
	Offering *uuid.UUID

	Limit  int
	Offset int
}

func ParseFilters(values url.Values) (Filters, error) {
	p := filter.New(values)

	f := Filters{
		Search:   p.String("q"),
		Guardian: p.UUID("guardian_id"),
		House:    p.UUID("house_id"),
		Section:  p.UUID("section_id"),
		Session:  p.UUID("academic_session_id"),
		Offering: p.UUID("subject_offering_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultLimit, MaxLimit)

	if raw := p.Enum("status", func(v string) error {
		return entstudent.StatusValidator(entstudent.Status(v))
	}); raw != nil {
		status := entstudent.Status(*raw)
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
	if f.Guardian != nil {
		q = q.GuardedBy(*f.Guardian)
	}
	if f.House != nil {
		q = q.InHouse(*f.House)
	}
	if f.Section != nil {
		q = q.InSection(*f.Section)
	}
	if f.Session != nil {
		q = q.InSession(*f.Session)
	}
	if f.Offering != nil {
		q = q.TakingOffering(*f.Offering)
	}

	return q.Paginate(f.Limit, f.Offset)
}
