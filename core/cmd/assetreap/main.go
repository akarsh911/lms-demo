package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/service/assets"

	_ "time/tzdata"
)

const usage = `emerge-core assetreap

  assetreap [-school ...] [-age ...] [-limit ...] [-destroy]

Sweeps two kinds of dead weight out of every tenant's library:

  pending   asset rows that never became an upload, older than -age
  deleted   asset rows already soft deleted, whose object still sits in the bucket

Nothing is ever removed without -destroy. Without it the command reports what it
would do and exits. A row a content item still points at is never touched, and no
row is ever hard deleted: the object goes, the row stays as the audit record.

Flags:
  -school   school code, or all (default all)
  -age      how long a row must have sat in pending, or in deleted, before it is
            eligible (default %s, floor %s)
  -limit    rows to examine per school (default %d, ceiling %d)
  -destroy  actually remove objects and retire rows

Environment:
  CONTROL_DATABASE_URL   control-plane DSN
  SECRETS_MASTER_KEY     master key, needed to reach tenant databases and buckets
`

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	config.LoadDotEnv()

	fs := flag.NewFlagSet("assetreap", flag.ExitOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, usage, assets.DefaultAge, assets.MinimumAge, assets.DefaultLimit, assets.MaxLimit)
	}
	schoolFilter := fs.String("school", "all", "school code, or all")
	age := fs.Duration("age", assets.DefaultAge, "how long a row must have been pending or deleted to be eligible")
	limit := fs.Int("limit", assets.DefaultLimit, "rows to examine per school")
	destroy := fs.Bool("destroy", false, "remove objects and retire rows instead of reporting")
	if err := fs.Parse(args); err != nil {
		return err
	}

	opts := assets.Options{Age: *age, Limit: *limit, Destroy: *destroy}
	settledAge, settledLimit, err := assets.Validate(opts)
	if err != nil {
		return err
	}

	ctx := context.Background()

	dsn := os.Getenv("CONTROL_DATABASE_URL")
	if dsn == "" {
		return errors.New("CONTROL_DATABASE_URL is required to find tenant databases")
	}
	keyring, err := crypto.ParseKeyring(os.Getenv("SECRETS_MASTER_KEY"))
	if err != nil {
		return fmt.Errorf("SECRETS_MASTER_KEY: %w", err)
	}

	control, err := postgres.NewControl(ctx, dsn, postgres.Options{})
	if err != nil {
		return err
	}
	defer control.Close()

	registry := postgres.NewRegistry(control, keyring, postgres.Options{}, postgres.Discard())
	defer registry.Close()

	schools, err := control.Client.School.Query().All(ctx)
	if err != nil {
		return err
	}

	mode := "DRY RUN, nothing will be changed, pass -destroy to act"
	if *destroy {
		mode = "DESTRUCTIVE, objects will be removed"
	}
	fmt.Printf("%-8s %-12s %s, age %s, limit %d\n", "assets", "-", mode, settledAge, settledLimit)

	var swept, failed int
	for _, row := range schools {
		if *schoolFilter != "all" && !strings.EqualFold(*schoolFilter, row.Code) {
			continue
		}
		if _, err := registry.PostgresCredentials(ctx, row.ID); err != nil {
			report(row.Code, "SKIPPED", "no tenant database: "+err.Error())
			continue
		}
		if _, err := registry.S3Credentials(ctx, row.ID); err != nil {
			report(row.Code, "SKIPPED", "no bucket: "+err.Error())
			continue
		}

		hits, err := sweep(ctx, registry, row.ID, row.Code, opts)
		if err != nil {
			report(row.Code, "SKIPPED", err.Error())
			continue
		}
		swept++
		failed += hits
	}

	if swept == 0 {
		fmt.Printf("%-8s %-12s no school was reachable\n", "assets", "-")
	}
	if failed > 0 {
		return fmt.Errorf("%d asset%s could not be swept", failed, plural(failed))
	}
	return nil
}

func sweep(ctx context.Context, registry *postgres.Registry, schoolID uuid.UUID, code string, opts assets.Options) (int, error) {
	creds, err := registry.S3Credentials(ctx, schoolID)
	if err != nil {
		return 0, err
	}
	store, err := blob.New(*creds)
	if err != nil {
		return 0, err
	}
	conn, err := registry.Get(ctx, schoolID)
	if err != nil {
		return 0, err
	}

	reaper, err := assets.New(assets.NewEntRows(conn.Client), assets.NewBlobObjects(store), opts)
	if err != nil {
		return 0, err
	}

	result, err := reaper.Run(ctx)
	if err != nil {
		return 0, err
	}

	for _, f := range result.Findings {
		report(code, verdict(f, result.DryRun), line(f))
	}
	report(code, "TOTAL", fmt.Sprintf(
		"scanned %d, kept %d, failed %d, objects %d/%d, rows %d/%d, cutoff %s",
		result.Scanned, result.Kept, result.Failed,
		result.ObjectsRemoved, result.PlannedObjectRemovals,
		result.RowsRetired, result.PlannedRowRetirements,
		result.Cutoff.UTC().Format(time.RFC3339)))
	return result.Failed, nil
}

func verdict(f assets.Finding, dryRun bool) string {
	switch {
	case f.Err != nil:
		return "FAILED"
	case !f.RemoveObject && !f.RetireRow:
		return "KEEP"
	case dryRun:
		return "WOULD"
	case f.Applied:
		return "REAPED"
	default:
		return "FAILED"
	}
}

func line(f assets.Finding) string {
	var work []string
	if f.RemoveObject {
		work = append(work, "object")
	}
	if f.RetireRow {
		work = append(work, "row")
	}
	if len(work) == 0 {
		work = append(work, "nothing")
	}

	out := fmt.Sprintf("%s %-7s %-13s %s", f.AssetID, f.Status, strings.Join(work, "+"), f.Reason)
	if f.Err != nil {
		out += ": " + f.Err.Error()
	}
	return out
}

func report(code, tag, detail string) {
	fmt.Printf("%-8s %-12s %-7s %s\n", "assets", code, tag, detail)
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
