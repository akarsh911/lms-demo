package indexing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"github.com/google/uuid"

	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/school"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

type ControlTenants struct {
	control  *controlent.Client
	registry *postgres.Registry
	logger   *slog.Logger

	mu     sync.Mutex
	stores map[uuid.UUID]SignedSource
}

func NewControlTenants(control *controlent.Client, registry *postgres.Registry,
	logger *slog.Logger) (*ControlTenants, error) {

	if control == nil {
		return nil, errors.New("indexing: no control plane client, so no school can be found")
	}
	if registry == nil {
		return nil, errors.New("indexing: no tenant registry, so no school's database can be opened")
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &ControlTenants{
		control:  control,
		registry: registry,
		logger:   logger.With("component", ComponentSweep),
		stores:   make(map[uuid.UUID]SignedSource),
	}, nil
}

func (c *ControlTenants) Sweepable(ctx context.Context) ([]Tenant, error) {
	rows, err := c.control.School.Query().
		Where(school.StatusEQ(school.StatusActive)).
		Order(controlent.Asc(school.FieldCode)).
		All(ctx)
	if err != nil {
		return nil, fmt.Errorf("indexing: listing schools to sweep: %w", err)
	}

	out := make([]Tenant, 0, len(rows))
	for _, row := range rows {
		slug := ""
		if row.CasTenantID != nil {
			slug = strings.TrimSpace(*row.CasTenantID)
		}
		if slug == "" {
			c.skip(row.Code, "no CAS tenant slug, and the engine partitions on one")
			continue
		}
		if _, err := c.registry.PostgresCredentials(ctx, row.ID); err != nil {
			c.skip(row.Code, "no tenant database: "+err.Error())
			continue
		}
		store, err := c.store(ctx, row.ID)
		if err != nil {
			c.skip(row.Code, "no object store: "+err.Error())
			continue
		}
		conn, err := c.registry.Get(ctx, row.ID)
		if err != nil {
			c.skip(row.Code, err.Error())
			continue
		}
		out = append(out, Tenant{
			SchoolID:    row.ID,
			Code:        row.Code,
			CASTenantID: slug,
			Client:      conn.Client,
			Store:       store,
		})
	}
	return out, nil
}

func (c *ControlTenants) store(ctx context.Context, schoolID uuid.UUID) (SignedSource, error) {
	c.mu.Lock()
	cached, ok := c.stores[schoolID]
	c.mu.Unlock()
	if ok {
		return cached, nil
	}

	creds, err := c.registry.S3Credentials(ctx, schoolID)
	if err != nil {
		return nil, err
	}
	client, err := blob.New(*creds)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if cached, ok := c.stores[schoolID]; ok {
		return cached, nil
	}
	c.stores[schoolID] = client
	return client, nil
}

func (c *ControlTenants) skip(code, why string) {
	c.logger.Debug("index sweep is skipping a school", "school", code, "reason", why)
}
