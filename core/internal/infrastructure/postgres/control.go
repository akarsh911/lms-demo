package postgres

import (
	"context"
	"database/sql"
	"fmt"

	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
)

type Control struct {
	Client *controlent.Client
	db     *sql.DB
}

func NewControl(ctx context.Context, dsn string, opts Options) (*Control, error) {
	drv, db, err := Open(ctx, dsn, opts)
	if err != nil {
		return nil, fmt.Errorf("control plane: %w", err)
	}
	return &Control{Client: controlent.NewClient(controlent.Driver(drv)), db: db}, nil
}

func (c *Control) Ping(ctx context.Context) error {
	if c == nil || c.db == nil {
		return fmt.Errorf("control plane: not configured")
	}
	return c.db.PingContext(ctx)
}

func (c *Control) Close() error {
	if c == nil || c.Client == nil {
		return nil
	}
	return c.Client.Close()
}
