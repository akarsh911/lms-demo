package school

import (
	"context"

	"github.com/Harbour-Emerge/emerge-core/internal/data/guardian"
	"github.com/Harbour-Emerge/emerge-core/internal/data/person"
	"github.com/Harbour-Emerge/emerge-core/internal/data/staff"
	"github.com/Harbour-Emerge/emerge-core/internal/data/student"
	"github.com/Harbour-Emerge/emerge-core/internal/data/teacher"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

type School struct {
	Tenant *tenancy.Tenant
	Client *tenantent.Client
}

func From(ctx context.Context) (*School, error) {
	conn, err := postgres.ConnFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return &School{Tenant: conn.Tenant, Client: conn.Client}, nil
}

func (s *School) People(ctx context.Context) *person.Query { return person.New(ctx) }

func (s *School) Students(ctx context.Context) *student.Query { return student.New(ctx) }

func (s *School) Staff(ctx context.Context) *staff.Query { return staff.New(ctx) }

func (s *School) Teachers(ctx context.Context) *teacher.Query { return teacher.New(ctx) }

func (s *School) Guardians(ctx context.Context) *guardian.Query { return guardian.New(ctx) }
