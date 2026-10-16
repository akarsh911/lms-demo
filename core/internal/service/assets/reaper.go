package assets

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const Component = "assetreap"

const (
	DefaultAge   = 24 * time.Hour
	MinimumAge   = time.Hour
	DefaultLimit = 500
	MaxLimit     = 10000
)

const (
	StatusPending = "pending"
	StatusReady   = "ready"
	StatusDeleted = "deleted"
)

var (
	ErrNoRows      = errors.New("assets: the reaper needs a row source")
	ErrNoObjects   = errors.New("assets: the reaper needs an object store")
	ErrAgeTooShort = errors.New("assets: the age threshold is below the floor this reaper will accept")
	ErrLimit       = errors.New("assets: the scan limit must be positive and within the ceiling")
)

type Row struct {
	ID         uuid.UUID
	StorageKey string
	Status     string
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Referenced bool
}

type Rows interface {
	Sweepable(ctx context.Context, cutoff time.Time, limit int) ([]Row, error)
	Retire(ctx context.Context, id uuid.UUID) error
}

type Objects interface {
	Head(ctx context.Context, key string) (bool, error)
	Delete(ctx context.Context, key string) error
}

type Options struct {
	Age     time.Duration
	Limit   int
	Destroy bool
	Now     func() time.Time
}

type Finding struct {
	AssetID      uuid.UUID
	StorageKey   string
	Status       string
	Age          time.Duration
	Referenced   bool
	HasObject    bool
	RemoveObject bool
	RetireRow    bool
	Reason       string
	Applied      bool
	Err          error
}

type Result struct {
	DryRun                bool
	Cutoff                time.Time
	Scanned               int
	Kept                  int
	Failed                int
	PlannedObjectRemovals int
	PlannedRowRetirements int
	ObjectsRemoved        int
	RowsRetired           int
	Findings              []Finding
}

type Reaper struct {
	rows    Rows
	objects Objects
	age     time.Duration
	limit   int
	destroy bool
	now     func() time.Time
}

func Validate(opts Options) (time.Duration, int, error) {
	age := opts.Age
	if age == 0 {
		age = DefaultAge
	}
	if age < MinimumAge {
		return 0, 0, fmt.Errorf("%w: got %s, the floor is %s", ErrAgeTooShort, age, MinimumAge)
	}

	limit := opts.Limit
	if limit == 0 {
		limit = DefaultLimit
	}
	if limit < 0 || limit > MaxLimit {
		return 0, 0, fmt.Errorf("%w: got %d, the ceiling is %d", ErrLimit, limit, MaxLimit)
	}
	return age, limit, nil
}

func New(rows Rows, objects Objects, opts Options) (*Reaper, error) {
	if rows == nil {
		return nil, ErrNoRows
	}
	if objects == nil {
		return nil, ErrNoObjects
	}

	age, limit, err := Validate(opts)
	if err != nil {
		return nil, err
	}

	now := opts.Now
	if now == nil {
		now = time.Now
	}

	return &Reaper{
		rows:    rows,
		objects: objects,
		age:     age,
		limit:   limit,
		destroy: opts.Destroy,
		now:     now,
	}, nil
}

func (r *Reaper) Age() time.Duration { return r.age }

func (r *Reaper) Destroys() bool { return r.destroy }

func (r *Reaper) Run(ctx context.Context) (Result, error) {
	now := r.now()
	cutoff := now.Add(-r.age)

	rows, err := r.rows.Sweepable(ctx, cutoff, r.limit)
	if err != nil {
		return Result{}, fmt.Errorf("assets: scan: %w", err)
	}

	out := Result{DryRun: !r.destroy, Cutoff: cutoff, Scanned: len(rows)}
	for _, row := range rows {
		f := r.judge(ctx, row, now)
		if f.RemoveObject {
			out.PlannedObjectRemovals++
		}
		if f.RetireRow {
			out.PlannedRowRetirements++
		}
		if !f.RemoveObject && !f.RetireRow && f.Err == nil {
			out.Kept++
		}

		if r.destroy && f.Err == nil && (f.RemoveObject || f.RetireRow) {
			r.apply(ctx, &f)
			if f.Applied {
				if f.RemoveObject {
					out.ObjectsRemoved++
				}
				if f.RetireRow {
					out.RowsRetired++
				}
			}
		}
		if f.Err != nil {
			out.Failed++
		}
		out.Findings = append(out.Findings, f)
	}
	return out, nil
}

func (r *Reaper) judge(ctx context.Context, row Row, now time.Time) Finding {
	f := Finding{
		AssetID:    row.ID,
		StorageKey: row.StorageKey,
		Status:     row.Status,
		Age:        age(row, now),
		Referenced: row.Referenced,
	}

	switch row.Status {
	case StatusPending, StatusDeleted:
	default:
		f.Reason = fmt.Sprintf("its status is %q, and only %q or %q is ever swept", row.Status, StatusPending, StatusDeleted)
		return f
	}

	if row.Referenced {
		f.Reason = "a content item still points at it"
		return f
	}

	if f.Age < r.age {
		f.Reason = fmt.Sprintf("it has been %s in %q, under the %s threshold", f.Age, row.Status, r.age)
		return f
	}

	if row.StorageKey == "" {
		f.Reason = "it carries no storage key"
		if row.Status == StatusPending {
			f.RetireRow = true
			f.Reason = fmt.Sprintf("it has been %s in %q and carries no storage key", f.Age, row.Status)
		}
		return f
	}

	exists, err := r.objects.Head(ctx, row.StorageKey)
	if err != nil {
		f.Err = fmt.Errorf("assets: head %s: %w", row.ID, err)
		f.Reason = "the store would not say whether the object is there"
		return f
	}
	f.HasObject = exists

	switch {
	case row.Status == StatusPending && exists:
		f.RemoveObject = true
		f.RetireRow = true
		f.Reason = fmt.Sprintf("it has been %s in %q with an abandoned object", f.Age, row.Status)
	case row.Status == StatusPending:
		f.RetireRow = true
		f.Reason = fmt.Sprintf("it has been %s in %q and never became an object", f.Age, row.Status)
	case exists:
		f.RemoveObject = true
		f.Reason = fmt.Sprintf("it has been %s in %q while its object survived", f.Age, row.Status)
	default:
		f.Reason = "its object is already gone"
	}
	return f
}

func (r *Reaper) apply(ctx context.Context, f *Finding) {
	if f.RemoveObject {
		if err := r.objects.Delete(ctx, f.StorageKey); err != nil {
			f.Err = fmt.Errorf("assets: delete %s: %w", f.AssetID, err)
			return
		}
	}
	if f.RetireRow {
		if err := r.rows.Retire(ctx, f.AssetID); err != nil {
			f.Err = fmt.Errorf("assets: retire %s: %w", f.AssetID, err)
			return
		}
	}
	f.Applied = true
}

func age(row Row, now time.Time) time.Duration {
	stamp := row.CreatedAt
	if row.Status == StatusDeleted && row.UpdatedAt.After(stamp) {
		stamp = row.UpdatedAt
	}
	return now.Sub(stamp)
}
