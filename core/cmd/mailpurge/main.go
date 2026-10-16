package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mail"

	_ "time/tzdata"
)

const usage = `emerge-core mailpurge

  mailpurge [-age ...] [-limit ...] [-destroy]

Purges the retention trail out of the control plane's outbox:

  sent     rows whose send finished longer than -age ago
  failed   rows whose send gave up longer than -age ago

A terminal row keeps no payload, but it keeps the recipient hash, the redacted
address with its full domain, the template and the school, and those together
are a per-recipient record of who was mailed and when. The operational value of
that record is about recent mail, so it is deleted once it stops being recent.

Nothing is ever removed without -destroy. Without it the command reports what it
would delete and exits. A row that is pending, retrying or sending is never
touched at any age: a message still in flight is not a retention question, and
deleting one loses mail.

Flags:
  -age      how long a row must have been terminal before it is purged
            (default %s, floor %s)
  -limit    rows to examine per run (default %d, ceiling %d)
  -destroy  actually delete the rows

Environment:
  CONTROL_DATABASE_URL   control-plane DSN

The outbox is a single control-plane table, so this command does not visit
tenant databases and needs no master key: terminal rows hold nothing encrypted.
`

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	config.LoadDotEnv()

	fs := flag.NewFlagSet("mailpurge", flag.ExitOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, usage, mail.DefaultRetention, mail.MinimumRetention, mail.DefaultPurgeLimit, mail.MaxPurgeLimit)
	}
	age := fs.Duration("age", mail.DefaultRetention, "how long a row must have been sent or failed to be purged")
	limit := fs.Int("limit", mail.DefaultPurgeLimit, "rows to examine per run")
	destroy := fs.Bool("destroy", false, "delete the rows instead of reporting")
	if err := fs.Parse(args); err != nil {
		return err
	}

	opts := mail.PurgeOptions{Retention: *age, Limit: *limit, Destroy: *destroy}
	settledAge, settledLimit, err := mail.ValidatePurge(opts)
	if err != nil {
		return err
	}

	ctx := context.Background()

	dsn := os.Getenv("CONTROL_DATABASE_URL")
	if dsn == "" {
		return errors.New("CONTROL_DATABASE_URL is required to reach the outbox")
	}

	control, err := postgres.NewControl(ctx, dsn, postgres.Options{})
	if err != nil {
		return err
	}
	defer control.Close()

	purger, err := mail.NewPurger(mail.NewEntOutbox(control.Client), opts)
	if err != nil {
		return err
	}

	mode := "DRY RUN, nothing will be changed, pass -destroy to act"
	if *destroy {
		mode = "DESTRUCTIVE, rows will be deleted"
	}
	fmt.Printf("%-8s %-12s %s, age %s, limit %d\n", "outbox", "-", mode, settledAge, settledLimit)

	result, err := purger.Run(ctx)
	if err != nil {
		return err
	}

	codes, err := schoolCodes(ctx, control.Client)
	if err != nil {
		return err
	}

	for _, f := range result.Findings {
		report(codes[owner(f.SchoolID)], verdict(f, result.DryRun), line(f))
	}
	report("-", "TOTAL", fmt.Sprintf(
		"scanned %d, kept %d, failed %d, rows %d/%d, idempotency keys freed %d, cutoff %s",
		result.Scanned, result.Kept, result.Failed,
		result.RowsRemoved, result.PlannedRemovals, result.KeysFreed,
		result.Cutoff.UTC().Format(time.RFC3339)))

	if result.Failed > 0 {
		return fmt.Errorf("%d outbox row%s could not be purged", result.Failed, plural(result.Failed))
	}
	return nil
}

func schoolCodes(ctx context.Context, client *controlent.Client) (map[uuid.UUID]string, error) {
	rows, err := client.School.Query().All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]string, len(rows)+1)
	out[uuid.Nil] = "platform"
	for _, row := range rows {
		out[row.ID] = row.Code
	}
	return out, nil
}

func owner(schoolID *uuid.UUID) uuid.UUID {
	if schoolID == nil {
		return uuid.Nil
	}
	return *schoolID
}

func verdict(f mail.PurgeFinding, dryRun bool) string {
	switch {
	case f.Err != nil:
		return "FAILED"
	case !f.Purge:
		return "KEEP"
	case dryRun:
		return "WOULD"
	case f.Applied:
		return "PURGED"
	default:
		return "FAILED"
	}
}

func line(f mail.PurgeFinding) string {
	work := "nothing"
	if f.Purge {
		work = "row"
		if f.FreesKey {
			work = "row+key"
		}
	}

	out := fmt.Sprintf("%s %-7s %-28s %-7s %s", f.MessageID, f.Status, f.TemplateKey, work, f.Reason)
	if f.Err != nil {
		out += ": " + f.Err.Error()
	}
	return out
}

func report(code, tag, detail string) {
	if code == "" {
		code = "unknown"
	}
	fmt.Printf("%-8s %-12s %-7s %s\n", "outbox", code, tag, detail)
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
