package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	atlas "ariga.io/atlas/sql/migrate"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql/schema"
	"github.com/jackc/pgx/v5/stdlib"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	controlmigrate "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/migrate"
	tenantmigrate "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/migrate"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"

	_ "time/tzdata"
)

const usage = `emerge-core migrate

  make <name> [-plane control|tenant]    generate a migration from the ent schema (needs DEV_DATABASE_URL)
  apply        [-plane ...] [-school ...] apply pending migrations
  status       [-plane ...] [-school ...] list applied and pending migrations

Planes:
  control   the shared registry database (CONTROL_DATABASE_URL)
  tenant    every school's own database, resolved through school_profiles
  all       both (default for apply and status)

Environment:
  CONTROL_DATABASE_URL   control-plane DSN
  DEV_DATABASE_URL       scratch database used to compute a diff, e.g.
                         postgres://postgres:pass@localhost:5432/emerge_dev?sslmode=disable
  SECRETS_MASTER_KEY     master key, needed to reach tenant databases
`

type plane struct {
	name string
	dir  string
}

var (
	controlPlane = plane{name: "control", dir: filepath.Join("migrations", "control")}
	tenantPlane  = plane{name: "tenant", dir: filepath.Join("migrations", "tenant")}
)

func init() {
	for _, name := range sql.Drivers() {
		if name == "postgres" {
			return
		}
	}
	sql.Register("postgres", stdlib.GetDefaultDriver())
}

func main() {
	if len(os.Args) < 2 {
		fmt.Print(usage)
		os.Exit(2)
	}

	if err := run(os.Args[1], os.Args[2:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(command string, args []string) error {
	config.LoadDotEnv()

	ctx := context.Background()

	switch command {
	case "make", "makemigrations":
		return cmdMake(ctx, args)
	case "apply", "migrate":
		return cmdApply(ctx, args)
	case "status":
		return cmdStatus(ctx, args)
	case "help", "-h", "--help":
		fmt.Print(usage)
		return nil
	default:
		fmt.Print(usage)
		return fmt.Errorf("unknown command %q", command)
	}
}

func cmdMake(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("make", flag.ExitOnError)
	which := fs.String("plane", "", "control, tenant or all")
	if err := fs.Parse(args); err != nil {
		return err
	}

	name := strings.Join(fs.Args(), "_")
	if name == "" {
		return errors.New("a migration name is required, e.g. migrate make add_student_house")
	}
	name = sanitize(name)

	devURL := os.Getenv("DEV_DATABASE_URL")
	if devURL == "" {
		return errors.New("DEV_DATABASE_URL is required: a scratch database Atlas uses to compute the diff")
	}

	planes, err := selectPlanes(*which, "all")
	if err != nil {
		return err
	}

	for _, p := range planes {
		if err := os.MkdirAll(p.dir, 0o755); err != nil {
			return err
		}
		dir, err := atlas.NewLocalDir(p.dir)
		if err != nil {
			return err
		}

		opts := []schema.MigrateOption{
			schema.WithDir(dir),
			schema.WithMigrationMode(schema.ModeReplay),
			schema.WithDialect(dialect.Postgres),
			schema.WithFormatter(atlas.DefaultFormatter),
			schema.WithDropColumn(true),
			schema.WithDropIndex(true),
		}

		before := countFiles(p.dir)
		switch p.name {
		case "control":
			err = controlmigrate.NamedDiff(ctx, devURL, name, opts...)
		case "tenant":
			err = tenantmigrate.NamedDiff(ctx, devURL, name, opts...)
		}
		if err != nil {
			return fmt.Errorf("%s plane: %w", p.name, err)
		}

		if countFiles(p.dir) == before {
			fmt.Printf("%-8s no changes\n", p.name)
			continue
		}
		fmt.Printf("%-8s wrote migration %s\n", p.name, name)
	}
	return nil
}

func cmdApply(ctx context.Context, args []string) error {
	return walkTargets(ctx, args, func(t target) error {
		return applyDir(ctx, t, false)
	})
}

func cmdStatus(ctx context.Context, args []string) error {
	return walkTargets(ctx, args, func(t target) error {
		return applyDir(ctx, t, true)
	})
}

type target struct {
	plane plane
	label string
	dsn   string
}

func walkTargets(ctx context.Context, args []string, fn func(target) error) error {
	fs := flag.NewFlagSet("targets", flag.ExitOnError)
	which := fs.String("plane", "", "control, tenant or all")
	schoolFilter := fs.String("school", "all", "school code, or all")
	if err := fs.Parse(args); err != nil {
		return err
	}

	planes, err := selectPlanes(*which, "all")
	if err != nil {
		return err
	}

	for _, p := range planes {
		switch p.name {
		case "control":
			dsn := os.Getenv("CONTROL_DATABASE_URL")
			if dsn == "" {
				return errors.New("CONTROL_DATABASE_URL is required")
			}
			if err := fn(target{plane: p, label: "control", dsn: dsn}); err != nil {
				return err
			}
		case "tenant":
			targets, err := tenantTargets(ctx, p, *schoolFilter)
			if err != nil {
				return err
			}
			if len(targets) == 0 {
				fmt.Println("tenant   no schools registered")
			}
			for _, t := range targets {
				if err := fn(t); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func tenantTargets(ctx context.Context, p plane, filter string) ([]target, error) {
	dsn := os.Getenv("CONTROL_DATABASE_URL")
	if dsn == "" {
		return nil, errors.New("CONTROL_DATABASE_URL is required to find tenant databases")
	}
	keyring, err := crypto.ParseKeyring(os.Getenv("SECRETS_MASTER_KEY"))
	if err != nil {
		return nil, fmt.Errorf("SECRETS_MASTER_KEY: %w", err)
	}

	control, err := postgres.NewControl(ctx, dsn, postgres.Options{})
	if err != nil {
		return nil, err
	}
	defer control.Close()

	registry := postgres.NewRegistry(control, keyring, postgres.Options{}, postgres.Discard())
	rows, err := control.Client.School.Query().All(ctx)
	if err != nil {
		return nil, err
	}

	var targets []target
	for _, row := range rows {
		if filter != "all" && !strings.EqualFold(filter, row.Code) {
			continue
		}
		creds, err := registry.PostgresCredentials(ctx, row.ID)
		if err != nil {
			fmt.Printf("tenant   %-12s SKIPPED: %v\n", row.Code, err)
			continue
		}
		conn, err := creds.ConnString()
		if err != nil {
			fmt.Printf("tenant   %-12s SKIPPED: %v\n", row.Code, err)
			continue
		}
		targets = append(targets, target{plane: p, label: row.Code, dsn: conn})
	}
	return targets, nil
}

func applyDir(ctx context.Context, t target, dryRun bool) error {
	files, err := migrationFiles(t.plane.dir)
	if err != nil {
		return err
	}

	db, err := sql.Open("pgx", simpleProtocol(t.dsn))
	if err != nil {
		return err
	}
	defer db.Close()

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		return fmt.Errorf("%s/%s: %w", t.plane.name, t.label, err)
	}

	if err := ensureLedger(ctx, db); err != nil {
		return err
	}

	applied, err := appliedVersions(ctx, db)
	if err != nil {
		return err
	}

	var pending int
	for _, f := range files {
		version := strings.TrimSuffix(filepath.Base(f), ".sql")
		body, err := os.ReadFile(f)
		if err != nil {
			return err
		}
		sum := checksum(body)

		if recorded, ok := applied[version]; ok {
			if recorded != "" && recorded != sum {
				return fmt.Errorf("%s/%s: migration %s was modified after being applied", t.plane.name, t.label, version)
			}
			continue
		}

		pending++
		if dryRun {
			fmt.Printf("%-8s %-12s PENDING  %s\n", t.plane.name, t.label, version)
			continue
		}

		if err := applyOne(ctx, db, version, string(body), sum); err != nil {
			return fmt.Errorf("%s/%s: %s: %w", t.plane.name, t.label, version, err)
		}
		fmt.Printf("%-8s %-12s APPLIED  %s\n", t.plane.name, t.label, version)
	}

	if pending == 0 {
		fmt.Printf("%-8s %-12s up to date (%d applied)\n", t.plane.name, t.label, len(applied))
	}
	return nil
}

func applyOne(ctx context.Context, db *sql.DB, version, body, sum string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, body); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)`, version, sum); err != nil {
		return err
	}
	return tx.Commit()
}

func ensureLedger(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT        PRIMARY KEY,
			checksum   TEXT,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	return err
}

func appliedVersions(ctx context.Context, db *sql.DB) (map[string]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT version, coalesce(checksum, '') FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]string)
	for rows.Next() {
		var version, sum string
		if err := rows.Scan(&version, &sum); err != nil {
			return nil, err
		}
		out[version] = sum
	}
	return out, rows.Err()
}

func migrationFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var files []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		files = append(files, filepath.Join(dir, e.Name()))
	}
	sort.Strings(files)
	return files, nil
}

func countFiles(dir string) int {
	files, _ := migrationFiles(dir)
	return len(files)
}

func checksum(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func simpleProtocol(dsn string) string {
	if strings.Contains(dsn, "default_query_exec_mode") {
		return dsn
	}
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	return dsn + sep + "default_query_exec_mode=simple_protocol"
}

func selectPlanes(which, fallback string) ([]plane, error) {
	if which == "" {
		which = fallback
	}
	switch which {
	case "control":
		return []plane{controlPlane}, nil
	case "tenant":
		return []plane{tenantPlane}, nil
	case "all":
		return []plane{controlPlane, tenantPlane}, nil
	default:
		return nil, fmt.Errorf("unknown plane %q: use control, tenant or all", which)
	}
}

func sanitize(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ', r == '-', r == '_':
			b.WriteRune('_')
		}
	}
	return strings.Trim(b.String(), "_")
}
