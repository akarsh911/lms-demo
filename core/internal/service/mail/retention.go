package mail

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/outboxmessage"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/predicate"
)

const ComponentPurge = "mailpurge"

const (
	DefaultRetention  = 30 * 24 * time.Hour
	MinimumRetention  = 7 * 24 * time.Hour
	DefaultPurgeLimit = 1000
	MaxPurgeLimit     = 50000
)

var (
	ErrNoPurgeRows       = errors.New("mail: the purge needs a row source")
	ErrRetentionTooShort = errors.New("mail: the retention window is below the floor this purge will accept")
	ErrPurgeLimit        = errors.New("mail: the scan limit must be positive and within the ceiling")
	ErrRowMoved          = errors.New("mail: the row no longer matched the purge conditions when the delete ran")
)

type PurgeRow struct {
	ID          uuid.UUID
	SchoolID    *uuid.UUID
	Status      string
	TemplateKey string
	CreatedAt   time.Time
	CompletedAt *time.Time
	HasPayload  bool
	HasKey      bool
}

type PurgeRows interface {
	Expired(ctx context.Context, cutoff time.Time, limit int) ([]PurgeRow, error)
	Forget(ctx context.Context, id uuid.UUID, cutoff time.Time) (int, error)
}

type PurgeOptions struct {
	Retention time.Duration
	Limit     int
	Destroy   bool
	Now       func() time.Time
}

type PurgeFinding struct {
	MessageID   uuid.UUID
	SchoolID    *uuid.UUID
	Status      string
	TemplateKey string
	Age         time.Duration
	Purge       bool
	FreesKey    bool
	Reason      string
	Applied     bool
	Err         error
}

type PurgeResult struct {
	DryRun          bool
	Cutoff          time.Time
	Scanned         int
	Kept            int
	Failed          int
	PlannedRemovals int
	RowsRemoved     int
	KeysFreed       int
	Findings        []PurgeFinding
}

type Purger struct {
	rows      PurgeRows
	retention time.Duration
	limit     int
	destroy   bool
	now       func() time.Time
}

func ValidatePurge(opts PurgeOptions) (time.Duration, int, error) {
	retention := opts.Retention
	if retention == 0 {
		retention = DefaultRetention
	}
	if retention < MinimumRetention {
		return 0, 0, fmt.Errorf("%w: got %s, the floor is %s", ErrRetentionTooShort, retention, MinimumRetention)
	}

	limit := opts.Limit
	if limit == 0 {
		limit = DefaultPurgeLimit
	}
	if limit < 0 || limit > MaxPurgeLimit {
		return 0, 0, fmt.Errorf("%w: got %d, the ceiling is %d", ErrPurgeLimit, limit, MaxPurgeLimit)
	}
	return retention, limit, nil
}

func NewPurger(rows PurgeRows, opts PurgeOptions) (*Purger, error) {
	if rows == nil {
		return nil, ErrNoPurgeRows
	}

	retention, limit, err := ValidatePurge(opts)
	if err != nil {
		return nil, err
	}

	now := opts.Now
	if now == nil {
		now = time.Now
	}

	return &Purger{
		rows:      rows,
		retention: retention,
		limit:     limit,
		destroy:   opts.Destroy,
		now:       now,
	}, nil
}

func (p *Purger) Retention() time.Duration { return p.retention }

func (p *Purger) Destroys() bool { return p.destroy }

func (p *Purger) Run(ctx context.Context) (PurgeResult, error) {
	now := p.now()
	cutoff := now.Add(-p.retention)

	rows, err := p.rows.Expired(ctx, cutoff, p.limit)
	if err != nil {
		return PurgeResult{}, fmt.Errorf("mail: purge scan: %w", err)
	}

	out := PurgeResult{DryRun: !p.destroy, Cutoff: cutoff, Scanned: len(rows)}
	for _, row := range rows {
		f := p.judge(row, now)
		if f.Purge {
			out.PlannedRemovals++
		} else {
			out.Kept++
		}

		if p.destroy && f.Purge {
			p.apply(ctx, &f, cutoff)
			if f.Applied {
				out.RowsRemoved++
				if f.FreesKey {
					out.KeysFreed++
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

func (p *Purger) judge(row PurgeRow, now time.Time) PurgeFinding {
	f := PurgeFinding{
		MessageID:   row.ID,
		SchoolID:    row.SchoolID,
		Status:      row.Status,
		TemplateKey: row.TemplateKey,
		Age:         purgeAge(row, now),
	}

	if !terminal(row.Status) {
		f.Reason = fmt.Sprintf("its status is %q, and only %q or %q is ever purged",
			row.Status, outboxmessage.StatusSent, outboxmessage.StatusFailed)
		return f
	}

	if row.HasPayload {
		f.Reason = "it still carries an encrypted payload, which no terminal row should"
		return f
	}

	if f.Age < p.retention {
		f.Reason = fmt.Sprintf("it has been %s in %q, under the %s window", f.Age, row.Status, p.retention)
		return f
	}

	f.Purge = true
	f.FreesKey = row.HasKey
	f.Reason = fmt.Sprintf("it has been %s in %q, past the %s window", f.Age, row.Status, p.retention)
	return f
}

func (p *Purger) apply(ctx context.Context, f *PurgeFinding, cutoff time.Time) {
	removed, err := p.rows.Forget(ctx, f.MessageID, cutoff)
	if err != nil {
		f.Err = fmt.Errorf("mail: purge %s: %w", f.MessageID, err)
		return
	}
	if removed == 0 {
		f.Err = fmt.Errorf("mail: purge %s: %w", f.MessageID, ErrRowMoved)
		return
	}
	f.Applied = true
}

func purgeAge(row PurgeRow, now time.Time) time.Duration {
	stamp := row.CreatedAt
	if row.CompletedAt != nil {
		stamp = *row.CompletedAt
	}
	return now.Sub(stamp)
}

func terminal(status string) bool {
	return status == string(outboxmessage.StatusSent) || status == string(outboxmessage.StatusFailed)
}

type EntOutbox struct {
	client *controlent.Client
}

func NewEntOutbox(client *controlent.Client) *EntOutbox {
	return &EntOutbox{client: client}
}

func purgeable(cutoff time.Time) []predicate.OutboxMessage {
	return []predicate.OutboxMessage{
		outboxmessage.StatusIn(outboxmessage.StatusSent, outboxmessage.StatusFailed),
		outboxmessage.PayloadCiphertextIsNil(),
		outboxmessage.Or(
			outboxmessage.CompletedAtLT(cutoff),
			outboxmessage.And(
				outboxmessage.CompletedAtIsNil(),
				outboxmessage.CreatedAtLT(cutoff),
			),
		),
	}
}

func (s *EntOutbox) Expired(ctx context.Context, cutoff time.Time, limit int) ([]PurgeRow, error) {
	found, err := s.client.OutboxMessage.Query().
		Where(purgeable(cutoff)...).
		Order(controlent.Asc(outboxmessage.FieldCreatedAt)).
		Limit(limit).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make([]PurgeRow, 0, len(found))
	for _, row := range found {
		out = append(out, PurgeRow{
			ID:          row.ID,
			SchoolID:    row.SchoolID,
			Status:      string(row.Status),
			TemplateKey: row.TemplateKey,
			CreatedAt:   row.CreatedAt,
			CompletedAt: row.CompletedAt,
			HasPayload:  len(row.PayloadCiphertext) > 0,
			HasKey:      row.IdempotencyKey != nil,
		})
	}
	return out, nil
}

func (s *EntOutbox) Forget(ctx context.Context, id uuid.UUID, cutoff time.Time) (int, error) {
	return s.client.OutboxMessage.Delete().
		Where(append(purgeable(cutoff), outboxmessage.IDEQ(id))...).
		Exec(ctx)
}
