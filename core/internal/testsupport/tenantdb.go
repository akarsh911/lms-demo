package testsupport

import (
	"bufio"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"

	controlschool "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/school"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const (
	TenantDSNEnv      = "TEST_TENANT_DATABASE_URL"
	ControlDSNEnv     = "CONTROL_DATABASE_URL"
	MasterKeyEnv      = "SECRETS_MASTER_KEY"
	SchoolCodeEnv     = "TEST_SCHOOL_CODE"
	RequireEnv        = "TEST_REQUIRE_TENANT_DB"
	DefaultSchoolCode = "DPS-NGP"

	SkipMarker = "TENANT-DB-TEST-SKIPPED"
)

type Statement struct {
	Kind  string
	Query string
	Args  []any
}

func (s Statement) Touches(table string) bool {
	return strings.Contains(s.Query, `"`+table+`"`)
}

type recorder struct {
	inner dialect.Driver

	mu    sync.Mutex
	stmts []Statement
}

func (r *recorder) note(kind, query string, args any) {
	list, _ := args.([]any)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stmts = append(r.stmts, Statement{Kind: kind, Query: query, Args: list})
}

func (r *recorder) taken() []Statement {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Statement, len(r.stmts))
	copy(out, r.stmts)
	return out
}

func (r *recorder) forget() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stmts = nil
}

func (r *recorder) Query(ctx context.Context, query string, args, v any) error {
	r.note("query", query, args)
	return r.inner.Query(ctx, query, args, v)
}

func (r *recorder) Exec(ctx context.Context, query string, args, v any) error {
	r.note("exec", query, args)
	return r.inner.Exec(ctx, query, args, v)
}

func (r *recorder) Tx(ctx context.Context) (dialect.Tx, error) {
	tx, err := r.inner.Tx(ctx)
	if err != nil {
		return nil, err
	}
	return &recordedTx{inner: tx, on: r}, nil
}

func (r *recorder) Close() error    { return r.inner.Close() }
func (r *recorder) Dialect() string { return r.inner.Dialect() }

type recordedTx struct {
	inner dialect.Tx
	on    *recorder
}

func (t *recordedTx) Query(ctx context.Context, query string, args, v any) error {
	t.on.note("query", query, args)
	return t.inner.Query(ctx, query, args, v)
}

func (t *recordedTx) Exec(ctx context.Context, query string, args, v any) error {
	t.on.note("exec", query, args)
	return t.inner.Exec(ctx, query, args, v)
}

func (t *recordedTx) Commit() error   { return t.inner.Commit() }
func (t *recordedTx) Rollback() error { return t.inner.Rollback() }

type TenantDB struct {
	Client *tenantent.Client
	Tx     *tenantent.Tx

	rec *recorder
}

func (db *TenantDB) Statements() []Statement { return db.rec.taken() }

func (db *TenantDB) Forget() { db.rec.forget() }

func (db *TenantDB) QueriesOn(table string) []Statement {
	var out []Statement
	for _, stmt := range db.Statements() {
		if stmt.Kind == "query" && stmt.Touches(table) {
			out = append(out, stmt)
		}
	}
	return out
}

var (
	sourceOnce sync.Once
	sourceDrv  *entsql.Driver
	sourceErr  error
	sourceWhy  string

	dotenvOnce sync.Once
)

func TenantTx(ctx context.Context, t *testing.T) *TenantDB {
	t.Helper()

	drv := driverOrSkip(ctx, t)
	rec := &recorder{inner: drv}

	tx, err := tenantent.NewClient(tenantent.Driver(rec)).Tx(ctx)
	if err != nil {
		t.Fatalf("could not begin the rollback transaction: %v", err)
	}
	t.Cleanup(func() {
		if err := tx.Rollback(); err != nil {
			t.Errorf("the fixture was not rolled back and may have leaked into %s: %v",
				schoolCode(), err)
		}
	})
	rec.forget()

	return &TenantDB{Client: tx.Client(), Tx: tx, rec: rec}
}

func TenantPool(ctx context.Context, t *testing.T) *tenantent.Client {
	t.Helper()

	return tenantent.NewClient(tenantent.Driver(driverOrSkip(ctx, t)))
}

func driverOrSkip(ctx context.Context, t *testing.T) *entsql.Driver {
	t.Helper()

	sourceOnce.Do(func() { sourceDrv, sourceWhy, sourceErr = openTenant(ctx) })

	if sourceErr != nil {
		t.Fatalf("the tenant database was configured but unreachable: %v", sourceErr)
	}
	if sourceDrv == nil {
		unconfigured(t, sourceWhy)
	}
	return sourceDrv
}

func unconfigured(t *testing.T, why string) {
	t.Helper()

	message := SkipMarker + ": " + why + ". " +
		"Nothing here proved that placement scoping filters rows: the predicate is a correlated " +
		"EXISTS that the stub driver refuses to evaluate, so only a real Postgres can settle it. " +
		"Set " + TenantDSNEnv + " to a tenant DSN, or set " + ControlDSNEnv + " and " + MasterKeyEnv +
		" and the school will be resolved from " + SchoolCodeEnv + " (default " + DefaultSchoolCode + "). " +
		"The repository .env is read automatically. " +
		"Set " + RequireEnv + "=1 to make this a failure instead of a skip."

	if truthy(os.Getenv(RequireEnv)) {
		t.Fatal(message)
	}
	t.Skip(message)
}

func truthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

func schoolCode() string {
	if code := strings.TrimSpace(os.Getenv(SchoolCodeEnv)); code != "" {
		return code
	}
	return DefaultSchoolCode
}

func openTenant(ctx context.Context) (*entsql.Driver, string, error) {
	loadRepoDotEnv()

	if dsn := strings.TrimSpace(os.Getenv(TenantDSNEnv)); dsn != "" {
		drv, _, err := postgres.Open(ctx, dsn, postgres.Options{})
		if err != nil {
			return nil, "", err
		}
		return drv, "", nil
	}

	control := strings.TrimSpace(os.Getenv(ControlDSNEnv))
	key := strings.TrimSpace(os.Getenv(MasterKeyEnv))
	switch {
	case control == "" && key == "":
		return nil, "neither " + TenantDSNEnv + " nor " + ControlDSNEnv + " with " + MasterKeyEnv + " is set", nil
	case control == "":
		return nil, ControlDSNEnv + " is not set", nil
	case key == "":
		return nil, MasterKeyEnv + " is not set", nil
	}

	dsn, err := tenantDSNThroughControl(ctx, control, key)
	if err != nil {
		return nil, "", err
	}
	drv, _, err := postgres.Open(ctx, dsn, postgres.Options{})
	if err != nil {
		return nil, "", err
	}
	return drv, "", nil
}

func tenantDSNThroughControl(ctx context.Context, controlDSN, masterKey string) (string, error) {
	keyring, err := crypto.ParseKeyring(masterKey)
	if err != nil {
		return "", err
	}

	control, err := postgres.NewControl(ctx, controlDSN, postgres.Options{})
	if err != nil {
		return "", err
	}
	defer control.Close()

	code := schoolCode()
	row, err := control.Client.School.Query().Where(controlschool.Code(code)).Only(ctx)
	if err != nil {
		return "", errors.New("school " + code + ": " + err.Error())
	}

	registry := postgres.NewRegistry(control, keyring, postgres.Options{}, postgres.Discard())
	creds, err := registry.PostgresCredentials(ctx, row.ID)
	if err != nil {
		return "", err
	}
	return creds.ConnString()
}

func loadRepoDotEnv() {
	dotenvOnce.Do(func() {
		root, ok := repoRoot()
		if !ok {
			return
		}
		readDotEnv(filepath.Join(root, ".env"))
	})
}

func repoRoot() (string, bool) {
	dir, err := os.Getwd()
	if err != nil {
		return "", false
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

func readDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(strings.TrimPrefix(key, "export "))
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}
