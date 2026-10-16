package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/school"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/schoolprofile"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
)

type TenantConn struct {
	Tenant *tenancy.Tenant
	Client *tenantent.Client
	db     *sql.DB
}

func (t *TenantConn) Ping(ctx context.Context) error { return t.db.PingContext(ctx) }

type Registry struct {
	control *Control
	keyring *crypto.Keyring
	opts    Options
	logger  *slog.Logger

	mu    sync.RWMutex
	conns map[uuid.UUID]*TenantConn
}

func NewRegistry(control *Control, keyring *crypto.Keyring, opts Options, logger *slog.Logger) *Registry {
	return &Registry{
		control: control,
		keyring: keyring,
		opts:    opts,
		logger:  logger,
		conns:   make(map[uuid.UUID]*TenantConn),
	}
}

func (r *Registry) Get(ctx context.Context, schoolID uuid.UUID) (*TenantConn, error) {
	r.mu.RLock()
	conn, ok := r.conns[schoolID]
	r.mu.RUnlock()
	if ok {
		observability.Step(ctx, observability.ComponentTenancy, "tenant pool reused",
			"school_id", schoolID)
		return conn, nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if conn, ok := r.conns[schoolID]; ok {
		return conn, nil
	}

	conn, err := r.open(ctx, schoolID)
	if err != nil {
		return nil, err
	}
	r.conns[schoolID] = conn
	return conn, nil
}

func (r *Registry) GetByCode(ctx context.Context, code string) (*TenantConn, error) {
	row, err := r.control.Client.School.Query().Where(school.Code(code)).Only(ctx)
	if err != nil {
		if controlent.IsNotFound(err) {
			return nil, fmt.Errorf("%w: code %q", tenancy.ErrUnknownSchool, code)
		}
		return nil, err
	}
	return r.Get(ctx, row.ID)
}

func (r *Registry) GetByCASTenant(ctx context.Context, slug string) (*TenantConn, error) {
	row, err := r.control.Client.School.Query().Where(school.CasTenantID(slug)).Only(ctx)
	if err != nil {
		if controlent.IsNotFound(err) {
			return nil, fmt.Errorf("%w: cas tenant %q", tenancy.ErrUnknownSchool, slug)
		}
		return nil, err
	}
	return r.Get(ctx, row.ID)
}

func (r *Registry) open(ctx context.Context, schoolID uuid.UUID) (*TenantConn, error) {
	row, err := r.control.Client.School.Get(ctx, schoolID)
	if err != nil {
		if controlent.IsNotFound(err) {
			return nil, fmt.Errorf("%w: %s", tenancy.ErrUnknownSchool, schoolID)
		}
		return nil, err
	}
	if row.Status != school.StatusActive {
		return nil, fmt.Errorf("%w: %s is %s", tenancy.ErrSchoolInactive, row.Code, row.Status)
	}

	creds, err := r.PostgresCredentials(ctx, schoolID)
	if err != nil {
		return nil, err
	}
	dsn, err := creds.ConnString()
	if err != nil {
		return nil, err
	}

	drv, db, err := Open(ctx, dsn, r.opts)
	if err != nil {
		return nil, fmt.Errorf("tenant %s: %w", row.Code, err)
	}

	t := &tenancy.Tenant{
		SchoolID: row.ID,
		Code:     row.Code,
		Name:     row.Name,
		Timezone: row.Timezone,
	}
	if row.CasTenantID != nil {
		t.CASTenantID = *row.CasTenantID
	}

	r.logger.Info("tenant database connected", "school_id", row.ID, "code", row.Code, "target", creds.String())
	observability.Step(ctx, observability.ComponentTenancy, "tenant pool opened",
		"school_id", row.ID, "code", row.Code)
	return &TenantConn{Tenant: t, Client: tenantent.NewClient(tenantent.Driver(drv)), db: db}, nil
}

func (r *Registry) PostgresCredentials(ctx context.Context, schoolID uuid.UUID) (*tenancy.PostgresCredentials, error) {
	var creds tenancy.PostgresCredentials
	if err := r.decodeProfile(ctx, schoolID, schoolprofile.ProfileTypePostgres, &creds); err != nil {
		return nil, err
	}
	return &creds, nil
}

func (r *Registry) S3Credentials(ctx context.Context, schoolID uuid.UUID) (*tenancy.S3Credentials, error) {
	var creds tenancy.S3Credentials
	if err := r.decodeProfile(ctx, schoolID, schoolprofile.ProfileTypeS3, &creds); err != nil {
		return nil, err
	}
	return &creds, nil
}

func (r *Registry) MySQLCredentials(ctx context.Context, schoolID uuid.UUID) (*tenancy.MySQLCredentials, error) {
	var creds tenancy.MySQLCredentials
	if err := r.decodeProfile(ctx, schoolID, schoolprofile.ProfileTypeMysql, &creds); err != nil {
		return nil, err
	}
	return &creds, nil
}

func (r *Registry) decodeProfile(ctx context.Context, schoolID uuid.UUID, kind schoolprofile.ProfileType, dst any) error {
	row, err := r.control.Client.SchoolProfile.Query().
		Where(
			schoolprofile.SchoolID(schoolID),
			schoolprofile.ProfileTypeEQ(kind),
			schoolprofile.StatusEQ(schoolprofile.StatusActive),
			schoolprofile.Name("primary"),
		).
		Only(ctx)
	if err != nil {
		if controlent.IsNotFound(err) {
			return fmt.Errorf("%w: %s profile for %s", tenancy.ErrNoProfile, kind, schoolID)
		}
		return err
	}

	plaintext, err := r.keyring.Decrypt(row.KeyVersion, row.Nonce, row.Ciphertext, schoolID[:])
	if err != nil {
		return fmt.Errorf("school %s: %w", schoolID, err)
	}
	defer zero(plaintext)

	if err := json.Unmarshal(plaintext, dst); err != nil {
		return errors.New("tenancy: credential blob is not valid JSON")
	}
	return nil
}

func (r *Registry) EncryptCredentials(schoolID uuid.UUID, creds any) (nonce, ciphertext []byte, version int, err error) {
	plaintext, err := json.Marshal(creds)
	if err != nil {
		return nil, nil, 0, err
	}
	defer zero(plaintext)
	return r.keyring.Encrypt(plaintext, schoolID[:])
}

func (r *Registry) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	var firstErr error
	for id, conn := range r.conns {
		if err := conn.Client.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
		delete(r.conns, id)
	}
	return firstErr
}

func (r *Registry) Evict(schoolID uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if conn, ok := r.conns[schoolID]; ok {
		_ = conn.Client.Close()
		delete(r.conns, schoolID)
	}
}

func zero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
