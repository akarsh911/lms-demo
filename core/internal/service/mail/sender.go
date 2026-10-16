package mail

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"mime"
	"net"
	netmail "net/mail"
	"net/smtp"
	"net/textproto"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/outboxmessage"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/schoolprofile"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
)

const ComponentMail = "mail"

const (
	DefaultInterval         = 5 * time.Second
	DefaultScanLimit        = 512
	DefaultBatchSize        = 128
	DefaultPerSchoolBurst   = 16
	DefaultQueueDepth       = 64
	DefaultLeaseTTL         = 2 * time.Minute
	DefaultSMTPTimeout      = 20 * time.Second
	DefaultBackoffBase      = 30 * time.Second
	DefaultBackoffCap       = 30 * time.Minute
	DefaultBreakerThreshold = 3
	DefaultBreakerCooldown  = 2 * time.Minute
	DefaultHeartbeatEvery   = time.Minute
	DefaultWriteTimeout     = 10 * time.Second
)

var (
	ErrNoPlatformSender       = errors.New("mail: no platform SMTP fallback is configured")
	ErrPlatformSenderUnusable = errors.New("mail: the platform SMTP fallback is configured but unusable")
	ErrNoReplyAddress         = errors.New("mail: fallback mail would have no reply path")
)

type Profiles interface {
	SMTPCredentials(ctx context.Context, schoolID uuid.UUID) (*tenancy.SMTPCredentials, error)
}

type Options struct {
	InstanceID       string
	Interval         time.Duration
	ScanLimit        int
	BatchSize        int
	PerSchoolBurst   int
	QueueDepth       int
	LeaseTTL         time.Duration
	SMTPTimeout      time.Duration
	BackoffBase      time.Duration
	BackoffCap       time.Duration
	BreakerThreshold int
	BreakerCooldown  time.Duration
	HeartbeatEvery   time.Duration
	Platform         tenancy.SMTPCredentials
	PlatformFromName string
	PlatformReplyTo  string
	Profiles         Profiles
	Now              func() time.Time
}

func FromConfig(cfg *config.Config) Options {
	return Options{
		Platform: tenancy.SMTPCredentials{
			Host:        cfg.PlatformSMTPHost,
			Port:        cfg.PlatformSMTPPort,
			Username:    cfg.PlatformSMTPUsername,
			Password:    cfg.PlatformSMTPPassword,
			Encryption:  cfg.PlatformSMTPEncryption,
			FromAddress: cfg.PlatformSMTPFrom,
			FromName:    cfg.PlatformSMTPFromName,
		},
		PlatformFromName: cfg.PlatformSMTPFromName,
		PlatformReplyTo:  cfg.PlatformSMTPReplyTo,
		InstanceID:       cfg.MailSenderInstance,
		Interval:         cfg.MailSenderInterval,
	}
}

func (o *Options) platformFault() error {
	host := strings.TrimSpace(o.Platform.Host)
	from := strings.TrimSpace(o.Platform.FromAddress)
	switch {
	case host == "" && from == "":
		return ErrNoPlatformSender
	case host == "":
		return fmt.Errorf("%w: PLATFORM_SMTP_FROM_ADDRESS is set but PLATFORM_SMTP_HOST is empty", ErrPlatformSenderUnusable)
	case from == "":
		return fmt.Errorf("%w: PLATFORM_SMTP_HOST is set but PLATFORM_SMTP_FROM_ADDRESS is empty, and the "+
			"fallback forces its own From", ErrPlatformSenderUnusable)
	}

	parsed, err := netmail.ParseAddress(from)
	if err != nil {
		return fmt.Errorf("%w: PLATFORM_SMTP_FROM_ADDRESS must be a single email address, got %q",
			ErrPlatformSenderUnusable, from)
	}
	if parsed.Name != "" {
		return fmt.Errorf("%w: PLATFORM_SMTP_FROM_ADDRESS must be a bare address, got %q; the display name "+
			"comes from PLATFORM_SMTP_FROM_NAME and the school", ErrPlatformSenderUnusable, from)
	}
	if o.Platform.Port < 0 || o.Platform.Port > 65535 {
		return fmt.Errorf("%w: PLATFORM_SMTP_PORT must be a port number, got %d",
			ErrPlatformSenderUnusable, o.Platform.Port)
	}
	if _, err := o.Platform.Security(); err != nil {
		return fmt.Errorf("%w: PLATFORM_SMTP_ENCRYPTION must be %s, %s or %s, got %q",
			ErrPlatformSenderUnusable, tenancy.SMTPStartTLS, tenancy.SMTPTLS, tenancy.SMTPNone, o.Platform.Encryption)
	}
	return nil
}

func (o *Options) withDefaults() {
	if strings.TrimSpace(o.InstanceID) == "" {
		o.InstanceID = defaultInstanceID()
	}
	if o.Interval <= 0 {
		o.Interval = DefaultInterval
	}
	if o.ScanLimit <= 0 {
		o.ScanLimit = DefaultScanLimit
	}
	if o.BatchSize <= 0 {
		o.BatchSize = DefaultBatchSize
	}
	if o.PerSchoolBurst <= 0 {
		o.PerSchoolBurst = DefaultPerSchoolBurst
	}
	if o.QueueDepth <= 0 {
		o.QueueDepth = DefaultQueueDepth
	}
	if o.LeaseTTL <= 0 {
		o.LeaseTTL = DefaultLeaseTTL
	}
	if o.SMTPTimeout <= 0 {
		o.SMTPTimeout = DefaultSMTPTimeout
	}
	if o.BackoffBase <= 0 {
		o.BackoffBase = DefaultBackoffBase
	}
	if o.BackoffCap < o.BackoffBase {
		o.BackoffCap = DefaultBackoffCap
	}
	if o.BreakerThreshold <= 0 {
		o.BreakerThreshold = DefaultBreakerThreshold
	}
	if o.BreakerCooldown <= 0 {
		o.BreakerCooldown = DefaultBreakerCooldown
	}
	if o.HeartbeatEvery <= 0 {
		o.HeartbeatEvery = DefaultHeartbeatEvery
	}
	if strings.TrimSpace(o.PlatformFromName) == "" {
		o.PlatformFromName = "Emerge"
	}
	if o.Now == nil {
		o.Now = time.Now
	}
}

func defaultInstanceID() string {
	host, err := os.Hostname()
	if err != nil || host == "" {
		host = "sender"
	}
	id := host + "/" + uuid.NewString()[:8]
	if len(id) > 128 {
		id = id[:128]
	}
	return id
}

type Stats struct {
	Ticks         int64
	LastTickAt    time.Time
	LastWorkAt    time.Time
	LastClaimedAt time.Time
	Scanned       int64
	Claimed       int64
	Released      int64
	Sent          int64
	Retried       int64
	Failed        int64
	Expired       int64
	InFlight      int64
	OpenBreakers  int
	Errors        int64
}

type TickReport struct {
	At       time.Time
	Duration time.Duration
	Expired  int
	Scanned  int
	Claimed  int
	Released int
	Deferred int
	Err      error
}

func (r TickReport) Idle() bool {
	return r.Expired == 0 && r.Claimed == 0 && r.Released == 0
}

type breaker struct {
	consecutive int
	openUntil   time.Time
}

type worker struct {
	in chan *controlent.OutboxMessage
}

type Sender struct {
	control  *controlent.Client
	keyring  *crypto.Keyring
	profiles Profiles
	opts     Options
	logger   *slog.Logger

	ctx    context.Context
	cancel context.CancelFunc

	mu       sync.Mutex
	workers  map[uuid.UUID]*worker
	breakers map[uuid.UUID]*breaker
	schools  map[uuid.UUID]schoolIdentity
	stats    Stats

	platformErr error
	replyTo     string

	inFlight  atomic.Int64
	heartbeat time.Time
	closeOnce sync.Once
	wg        sync.WaitGroup
}

type schoolIdentity struct {
	name  string
	email string
	at    time.Time
}

func NewSender(control *controlent.Client, keyring *crypto.Keyring, opts Options, logger *slog.Logger) (*Sender, error) {
	if control == nil {
		return nil, errors.New("mail: no control plane client")
	}
	if keyring == nil {
		return nil, ErrNoKeyring
	}
	opts.withDefaults()
	if logger == nil {
		logger = slog.Default()
	}
	if opts.Profiles == nil {
		opts.Profiles = &ControlProfiles{Control: control, Keyring: keyring}
	}

	fault := opts.platformFault()
	replyTo, replyErr := parseReplyTo(opts.PlatformReplyTo)
	ctx, cancel := context.WithCancel(context.Background())
	s := &Sender{
		control:  control,
		keyring:  keyring,
		profiles: opts.Profiles,
		opts:     opts,
		logger:   logger.With("component", ComponentMail, "sender", opts.InstanceID),
		ctx:      ctx,
		cancel:   cancel,
		workers:  make(map[uuid.UUID]*worker),
		breakers: make(map[uuid.UUID]*breaker),
		schools:  make(map[uuid.UUID]schoolIdentity),

		platformErr: fault,
		replyTo:     replyTo,
	}

	switch {
	case fault == nil:
	case errors.Is(fault, ErrNoPlatformSender):
		s.logger.Warn("mail outbox has no platform fallback; a school with no SMTP profile of its own " +
			"will not receive mail, and its messages will fail with sender_not_configured")
	default:
		s.logger.Error("mail outbox platform fallback is disabled because it is misconfigured; "+
			"schools sending through their own SMTP profile are unaffected",
			"error", fault.Error())
	}

	if replyErr != nil {
		s.logger.Error("mail outbox is ignoring PLATFORM_SMTP_REPLY_TO because it is not a usable address; "+
			"a school with no email of its own will now be refused rather than sent a reply that vanishes",
			"error", replyErr.Error())
	}
	return s, nil
}

func (s *Sender) InstanceID() string { return s.opts.InstanceID }

func (s *Sender) Stats() Stats {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.stats
	out.InFlight = s.inFlight.Load()
	out.OpenBreakers = 0
	now := s.opts.Now()
	for _, b := range s.breakers {
		if now.Before(b.openUntil) {
			out.OpenBreakers++
		}
	}
	return out
}

func (s *Sender) InFlight() int64 { return s.inFlight.Load() }

func (s *Sender) StaleAfter() time.Duration { return 3 * s.opts.Interval }

func (s *Sender) Healthy(now time.Time) bool {
	last := s.Stats().LastTickAt
	if last.IsZero() {
		return false
	}
	return now.Sub(last) <= s.StaleAfter()
}

func (s *Sender) Run(ctx context.Context) error {
	s.logger.Info("mail outbox sender started",
		"interval", s.opts.Interval.String(),
		"lease_ttl", s.opts.LeaseTTL.String(),
		"smtp_timeout", s.opts.SMTPTimeout.String(),
		"batch", s.opts.BatchSize,
		"per_school_burst", s.opts.PerSchoolBurst,
		"platform_fallback", s.PlatformConfigured())

	ticker := time.NewTicker(s.opts.Interval)
	defer ticker.Stop()
	defer s.Close()

	for {
		s.Tick(ctx)
		select {
		case <-ctx.Done():
			s.logger.Info("mail outbox sender stopping", "reason", ctx.Err().Error())
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (s *Sender) Close() {
	s.closeOnce.Do(func() {
		s.cancel()
		s.wg.Wait()
	})
}

func (s *Sender) Tick(ctx context.Context) TickReport {
	started := s.opts.Now()
	report := TickReport{At: started}

	expired, err := s.expire(ctx, started)
	report.Expired = expired
	if err != nil {
		report.Err = err
	}

	rows, err := s.scan(ctx, started)
	report.Scanned = len(rows)
	if err != nil && report.Err == nil {
		report.Err = err
	}

	for _, row := range s.apportion(rows, started) {
		claimed, err := s.claim(ctx, row, started)
		if err != nil {
			if report.Err == nil {
				report.Err = err
			}
			continue
		}
		if !claimed {
			report.Deferred++
			continue
		}
		report.Claimed++
		if !s.dispatch(row) {
			report.Released++
			s.release(row)
		}
	}

	report.Duration = time.Since(started)
	s.record(report)
	s.announce(report)
	return report
}

func (s *Sender) record(report TickReport) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stats.Ticks++
	s.stats.LastTickAt = report.At
	s.stats.Scanned += int64(report.Scanned)
	s.stats.Claimed += int64(report.Claimed)
	s.stats.Released += int64(report.Released)
	s.stats.Expired += int64(report.Expired)
	if report.Err != nil {
		s.stats.Errors++
	}
	if !report.Idle() {
		s.stats.LastWorkAt = report.At
	}
	if report.Claimed > 0 {
		s.stats.LastClaimedAt = report.At
	}
}

func (s *Sender) announce(report TickReport) {
	outcome := "worked"
	if report.Idle() {
		outcome = "idle"
	}

	args := []any{
		"outcome", outcome,
		"scanned", report.Scanned,
		"claimed", report.Claimed,
		"deferred", report.Deferred,
		"released", report.Released,
		"expired", report.Expired,
		"in_flight", s.inFlight.Load(),
		"open_breakers", s.Stats().OpenBreakers,
		"took_ms", report.Duration.Milliseconds(),
	}
	if report.Err != nil {
		args = append(args, "error", report.Err.Error())
		s.logger.Error("mail outbox tick", args...)
		return
	}

	s.mu.Lock()
	due := s.heartbeat.IsZero() || report.At.Sub(s.heartbeat) >= s.opts.HeartbeatEvery
	if due || !report.Idle() {
		s.heartbeat = report.At
	}
	s.mu.Unlock()

	if due || !report.Idle() {
		s.logger.Info("mail outbox tick", args...)
		return
	}
	s.logger.Debug("mail outbox tick", args...)
}

func (s *Sender) expire(ctx context.Context, now time.Time) (int, error) {
	n, err := s.control.OutboxMessage.Update().
		Where(
			outboxmessage.StatusIn(
				outboxmessage.StatusPending,
				outboxmessage.StatusRetrying,
				outboxmessage.StatusSending,
			),
			outboxmessage.ExpiresAtNotNil(),
			outboxmessage.ExpiresAtLTE(now),
			outboxmessage.Or(
				outboxmessage.LeaseExpiresAtIsNil(),
				outboxmessage.LeaseExpiresAtLTE(now),
			),
		).
		SetStatus(outboxmessage.StatusFailed).
		SetFailureCode(outboxmessage.FailureCodeExpired).
		SetCompletedAt(now).
		ClearPayloadCiphertext().
		ClearPayloadNonce().
		ClearPayloadKeyVersion().
		ClearLeasedBy().
		ClearLeaseExpiresAt().
		Save(ctx)
	if err != nil {
		return 0, fmt.Errorf("mail: expiring stale outbox rows: %w", err)
	}
	if n > 0 {
		s.logger.Warn("mail outbox messages expired unsent", "count", n)
	}
	return n, nil
}

func (s *Sender) scan(ctx context.Context, now time.Time) ([]*controlent.OutboxMessage, error) {
	waiting, err := s.due(now).
		Where(
			outboxmessage.StatusIn(outboxmessage.StatusPending, outboxmessage.StatusRetrying),
			outboxmessage.Or(
				outboxmessage.LeaseExpiresAtIsNil(),
				outboxmessage.LeaseExpiresAtLTE(now),
			),
		).
		All(ctx)
	if err != nil {
		return nil, fmt.Errorf("mail: scanning the outbox: %w", err)
	}

	abandoned, err := s.due(now).
		Where(
			outboxmessage.StatusEQ(outboxmessage.StatusSending),
			outboxmessage.Or(
				outboxmessage.LeaseExpiresAtIsNil(),
				outboxmessage.LeaseExpiresAtLTE(now),
			),
		).
		All(ctx)
	if err != nil {
		return nil, fmt.Errorf("mail: scanning for lapsed leases: %w", err)
	}

	return oldestFirst(waiting, abandoned, s.opts.ScanLimit), nil
}

func (s *Sender) due(now time.Time) *controlent.OutboxMessageQuery {
	query := s.control.OutboxMessage.Query().
		Where(
			outboxmessage.ChannelEQ(outboxmessage.ChannelEmail),
			outboxmessage.NextAttemptAtLTE(now),
		)
	if muted := s.mutedSchools(now); len(muted) > 0 {
		query = query.Where(outboxmessage.Or(
			outboxmessage.SchoolIDIsNil(),
			outboxmessage.SchoolIDNotIn(muted...),
		))
	}
	return query.
		Order(controlent.Asc(outboxmessage.FieldNextAttemptAt), controlent.Asc(outboxmessage.FieldCreatedAt)).
		Limit(s.opts.ScanLimit)
}

func oldestFirst(waiting, abandoned []*controlent.OutboxMessage, limit int) []*controlent.OutboxMessage {
	out := make([]*controlent.OutboxMessage, 0, min(len(waiting)+len(abandoned), limit))
	i, j := 0, 0
	for len(out) < limit && (i < len(waiting) || j < len(abandoned)) {
		switch {
		case j >= len(abandoned):
			out, i = append(out, waiting[i]), i+1
		case i >= len(waiting):
			out, j = append(out, abandoned[j]), j+1
		case queuedEarlier(waiting[i], abandoned[j]):
			out, i = append(out, waiting[i]), i+1
		default:
			out, j = append(out, abandoned[j]), j+1
		}
	}
	return out
}

func queuedEarlier(a, b *controlent.OutboxMessage) bool {
	if a.NextAttemptAt.Equal(b.NextAttemptAt) {
		return a.CreatedAt.Before(b.CreatedAt)
	}
	return a.NextAttemptAt.Before(b.NextAttemptAt)
}

func (s *Sender) mutedSchools(now time.Time) []uuid.UUID {
	s.mu.Lock()
	defer s.mu.Unlock()
	var muted []uuid.UUID
	for id, b := range s.breakers {
		if id != uuid.Nil && now.Before(b.openUntil) {
			muted = append(muted, id)
		}
	}
	return muted
}

func (s *Sender) apportion(rows []*controlent.OutboxMessage, now time.Time) []*controlent.OutboxMessage {
	taken := make(map[uuid.UUID]int, len(rows))
	out := make([]*controlent.OutboxMessage, 0, min(len(rows), s.opts.BatchSize))
	for _, row := range rows {
		if len(out) >= s.opts.BatchSize {
			break
		}
		key := senderKey(row)
		if key == uuid.Nil && s.muted(key, now) {
			continue
		}
		if taken[key] >= s.opts.PerSchoolBurst {
			continue
		}
		taken[key]++
		out = append(out, row)
	}
	return out
}

func (s *Sender) muted(key uuid.UUID, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.breakers[key]
	return ok && now.Before(b.openUntil)
}

func senderKey(row *controlent.OutboxMessage) uuid.UUID {
	if row.SchoolID == nil {
		return uuid.Nil
	}
	return *row.SchoolID
}

func (s *Sender) claim(ctx context.Context, row *controlent.OutboxMessage, now time.Time) (bool, error) {
	n, err := s.control.OutboxMessage.Update().
		Where(
			outboxmessage.ID(row.ID),
			outboxmessage.StatusIn(
				outboxmessage.StatusPending,
				outboxmessage.StatusRetrying,
				outboxmessage.StatusSending,
			),
			outboxmessage.NextAttemptAtLTE(now),
			outboxmessage.Or(
				outboxmessage.LeaseExpiresAtIsNil(),
				outboxmessage.LeaseExpiresAtLTE(now),
			),
		).
		SetStatus(outboxmessage.StatusSending).
		SetLeasedBy(s.opts.InstanceID).
		SetLeaseExpiresAt(now.Add(s.opts.LeaseTTL)).
		Save(ctx)
	if err != nil {
		return false, fmt.Errorf("mail: claiming %s: %w", row.ID, err)
	}
	return n == 1, nil
}

func (s *Sender) dispatch(row *controlent.OutboxMessage) bool {
	w := s.workerFor(senderKey(row))
	s.inFlight.Add(1)
	select {
	case w.in <- row:
		return true
	default:
		s.inFlight.Add(-1)
		return false
	}
}

func (s *Sender) workerFor(key uuid.UUID) *worker {
	s.mu.Lock()
	defer s.mu.Unlock()
	if w, ok := s.workers[key]; ok {
		return w
	}
	w := &worker{in: make(chan *controlent.OutboxMessage, s.opts.QueueDepth)}
	s.workers[key] = w
	s.wg.Add(1)
	go s.serve(w)
	return w
}

func (s *Sender) serve(w *worker) {
	defer s.wg.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case row := <-w.in:
			s.deliver(row)
			s.inFlight.Add(-1)
		}
	}
}

func (s *Sender) release(row *controlent.OutboxMessage) {
	ctx, cancel := context.WithTimeout(s.ctx, DefaultWriteTimeout)
	defer cancel()

	_, err := s.control.OutboxMessage.Update().
		Where(outboxmessage.ID(row.ID), outboxmessage.LeasedByEQ(s.opts.InstanceID)).
		SetStatus(previousStatus(row)).
		ClearLeasedBy().
		ClearLeaseExpiresAt().
		Save(ctx)
	if err != nil {
		s.logger.Error("mail outbox lease could not be released",
			"outbox_id", row.ID, "error", err.Error())
	}
}

func previousStatus(row *controlent.OutboxMessage) outboxmessage.Status {
	if row.AttemptCount > 0 {
		return outboxmessage.StatusRetrying
	}
	return outboxmessage.StatusPending
}

func (s *Sender) deliver(row *controlent.OutboxMessage) {
	started := s.opts.Now()
	log := s.logger.With(
		"outbox_id", row.ID,
		"template", row.TemplateKey,
		"recipient", row.RecipientRedacted,
		"attempt", row.AttemptCount+1,
		"max_attempts", row.MaxAttempts,
	)
	if row.SchoolID != nil {
		log = log.With("school_id", *row.SchoolID)
	}

	if row.ExpiresAt != nil && !started.Before(*row.ExpiresAt) {
		log.Warn("mail outbox message expired before it could be sent")
		s.finish(row, started, nil, outboxmessage.FailureCodeExpired, "")
		return
	}

	creds, kind, err := s.resolve(row)
	if err != nil {
		log.Error("mail outbox message has no usable sender",
			"error", err.Error())
		s.settle(row, started, nil, &sendError{
			phase:       "resolve",
			code:        outboxmessage.FailureCodeSenderNotConfigured,
			retryable:   true,
			senderFault: true,
		}, log)
		return
	}
	log = log.With("sender_kind", string(kind))

	body, err := s.decrypt(row)
	if err != nil {
		log.Error("mail outbox payload could not be read", "error", err.Error())
		s.settle(row, started, &kind, &sendError{
			phase:     "payload",
			code:      outboxmessage.FailureCodeInternalError,
			retryable: false,
		}, log)
		return
	}
	defer wipe(body.raw)

	letter, err := s.compose(row, kind, creds, body.decoded)
	if err != nil {
		failure := &sendError{
			phase:     "compose",
			code:      outboxmessage.FailureCodeInvalidRecipient,
			retryable: false,
			detail:    err.Error(),
			err:       err,
		}
		var typed *sendError
		if errors.As(err, &typed) {
			failure = typed
		}
		log.Error("mail outbox message could not be composed",
			"phase", failure.phase,
			"failure_code", string(failure.code),
			"error", failure.Error())
		s.settle(row, started, &kind, failure, log)
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, s.opts.SMTPTimeout)
	err = send(ctx, *creds, letter)
	cancel()

	if err == nil {
		s.note(senderKey(row), true, started)
		log.Info("mail outbox message sent",
			"message_id", letter.messageID,
			"took_ms", time.Since(started).Milliseconds())
		s.finish(row, started, &kind, "", letter.messageID)
		return
	}

	var failure *sendError
	if !errors.As(err, &failure) {
		failure = &sendError{phase: "send", code: outboxmessage.FailureCodeInternalError, retryable: true}
	}
	s.note(senderKey(row), false, started, failure.senderFault)
	log.Warn("mail outbox delivery failed",
		"phase", failure.phase,
		"failure_code", string(failure.code),
		"smtp_code", failure.smtpCode,
		"retryable", failure.retryable,
		"took_ms", time.Since(started).Milliseconds())
	s.settle(row, started, &kind, failure, log)
}

func (s *Sender) resolve(row *controlent.OutboxMessage) (*tenancy.SMTPCredentials, outboxmessage.SenderKind, error) {
	ctx, cancel := context.WithTimeout(s.ctx, DefaultWriteTimeout)
	defer cancel()

	if row.SchoolID != nil {
		creds, err := s.profiles.SMTPCredentials(ctx, *row.SchoolID)
		switch {
		case err == nil:
			return creds, outboxmessage.SenderKindSchoolSMTP, nil
		case errors.Is(err, tenancy.ErrNoProfile):
		default:
			return nil, "", err
		}
	}

	if s.platformErr != nil {
		return nil, "", s.platformErr
	}
	creds := s.opts.Platform
	return &creds, outboxmessage.SenderKindPlatformFallback, nil
}

func (s *Sender) PlatformConfigured() bool { return s.platformErr == nil }

func (s *Sender) PlatformFault() error { return s.platformErr }

func parseReplyTo(address string) (string, error) {
	address = strings.TrimSpace(address)
	if address == "" {
		return "", nil
	}
	parsed, err := netmail.ParseAddress(address)
	if err != nil {
		return "", fmt.Errorf("PLATFORM_SMTP_REPLY_TO must be a single email address, got %q", address)
	}
	return parsed.String(), nil
}

type decrypted struct {
	raw     []byte
	decoded payload
}

func (s *Sender) decrypt(row *controlent.OutboxMessage) (*decrypted, error) {
	if row.PayloadKeyVersion == nil || len(row.PayloadNonce) == 0 || len(row.PayloadCiphertext) == 0 {
		return nil, errors.New("mail: the payload was already purged")
	}
	raw, err := s.keyring.Decrypt(*row.PayloadKeyVersion, row.PayloadNonce, row.PayloadCiphertext, payloadAAD(row.ID))
	if err != nil {
		return nil, err
	}
	var decoded payload
	if err := json.Unmarshal(raw, &decoded); err != nil {
		wipe(raw)
		return nil, errors.New("mail: the payload is not valid JSON")
	}
	return &decrypted{raw: raw, decoded: decoded}, nil
}

type letter struct {
	envelopeFrom string
	recipient    string
	messageID    string
	data         []byte
}

func (s *Sender) compose(
	row *controlent.OutboxMessage,
	kind outboxmessage.SenderKind,
	creds *tenancy.SMTPCredentials,
	body payload,
) (*letter, error) {
	to, err := netmail.ParseAddress(body.Address)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrBadRecipient, row.RecipientRedacted)
	}

	from := netmail.Address{Name: creds.FromName, Address: creds.FromAddress}
	replyTo := ""
	if kind == outboxmessage.SenderKindPlatformFallback {
		identity := s.identify(row.SchoolID)
		from.Address = s.opts.Platform.FromAddress
		from.Name = s.opts.PlatformFromName
		if identity.name != "" {
			from.Name = identity.name + " (via " + s.opts.PlatformFromName + ")"
		}

		if identity.email != "" {
			if parsed, err := netmail.ParseAddress(identity.email); err == nil {
				replyTo = parsed.String()
			}
		}
		if replyTo == "" {
			replyTo = s.replyTo
		}
		if replyTo == "" {
			cause := fmt.Errorf("%w: this school has no email address of its own and PLATFORM_SMTP_REPLY_TO "+
				"is not set, so a reply would go to %s and be lost; set the school's email or "+
				"PLATFORM_SMTP_REPLY_TO and this message goes out on the next attempt",
				ErrNoReplyAddress, s.opts.Platform.FromAddress)
			return nil, &sendError{
				phase:     "reply_path",
				code:      outboxmessage.FailureCodeNoReplyAddress,
				retryable: true,
				detail:    cause.Error(),
				err:       cause,
			}
		}
	}

	messageID := row.ID.String() + "@" + domainOf(from.Address)
	subject := body.Subject
	if strings.TrimSpace(subject) == "" {
		subject = row.TemplateKey
	}

	var head strings.Builder
	head.WriteString("From: " + from.String() + "\r\n")
	head.WriteString("To: " + to.String() + "\r\n")
	if replyTo != "" {
		head.WriteString("Reply-To: " + replyTo + "\r\n")
	}
	head.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\n")
	head.WriteString("Date: " + s.opts.Now().Format(time.RFC1123Z) + "\r\n")
	head.WriteString("Message-ID: <" + messageID + ">\r\n")
	head.WriteString("Auto-Submitted: auto-generated\r\n")
	head.WriteString("MIME-Version: 1.0\r\n")
	head.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	head.WriteString("Content-Transfer-Encoding: base64\r\n")
	head.WriteString("\r\n")
	head.WriteString(wrap(base64.StdEncoding.EncodeToString([]byte(body.Body))))

	envelope := creds.Sender()
	if kind == outboxmessage.SenderKindPlatformFallback {
		envelope = s.opts.Platform.Sender()
	}

	return &letter{
		envelopeFrom: envelope,
		recipient:    to.Address,
		messageID:    messageID,
		data:         []byte(head.String()),
	}, nil
}

func (s *Sender) identify(schoolID *uuid.UUID) schoolIdentity {
	if schoolID == nil {
		return schoolIdentity{}
	}

	s.mu.Lock()
	cached, ok := s.schools[*schoolID]
	s.mu.Unlock()
	if ok && time.Since(cached.at) < 5*time.Minute {
		return cached
	}

	ctx, cancel := context.WithTimeout(s.ctx, DefaultWriteTimeout)
	defer cancel()

	row, err := s.control.School.Get(ctx, *schoolID)
	if err != nil {
		s.logger.Warn("mail outbox could not read the school behind a fallback message",
			"school_id", *schoolID, "error", err.Error())
		return schoolIdentity{}
	}
	identity := schoolIdentity{name: row.Name, at: time.Now()}
	if row.Email != nil {
		identity.email = *row.Email
	}

	s.mu.Lock()
	s.schools[*schoolID] = identity
	s.mu.Unlock()
	return identity
}

func domainOf(address string) string {
	if _, domain, ok := strings.Cut(address, "@"); ok && domain != "" {
		return domain
	}
	return "localhost"
}

func wrap(encoded string) string {
	var out strings.Builder
	for len(encoded) > 76 {
		out.WriteString(encoded[:76])
		out.WriteString("\r\n")
		encoded = encoded[76:]
	}
	out.WriteString(encoded)
	out.WriteString("\r\n")
	return out.String()
}

func (s *Sender) finish(
	row *controlent.OutboxMessage,
	started time.Time,
	kind *outboxmessage.SenderKind,
	code outboxmessage.FailureCode,
	messageID string,
) {
	ctx, cancel := context.WithTimeout(s.ctx, DefaultWriteTimeout)
	defer cancel()

	now := s.opts.Now()
	status := outboxmessage.StatusSent
	if code != "" {
		status = outboxmessage.StatusFailed
	}

	update := s.control.OutboxMessage.Update().
		Where(outboxmessage.ID(row.ID), outboxmessage.LeasedByEQ(s.opts.InstanceID)).
		SetStatus(status).
		AddAttemptCount(1).
		SetLastAttemptAt(started).
		SetCompletedAt(now).
		ClearPayloadCiphertext().
		ClearPayloadNonce().
		ClearPayloadKeyVersion().
		ClearLeasedBy().
		ClearLeaseExpiresAt()
	if kind != nil {
		update = update.SetSenderKind(*kind)
	}
	if code != "" {
		update = update.SetFailureCode(code)
	}
	if messageID != "" {
		update = update.SetProviderMessageID(messageID)
	}

	n, err := update.Save(ctx)
	if err != nil {
		s.logger.Error("mail outbox terminal update failed; the payload is still on the row",
			"outbox_id", row.ID, "status", string(status), "error", err.Error())
		s.bump(func(st *Stats) { st.Errors++ })
		return
	}
	if n == 0 {
		s.logger.Warn("mail outbox row was no longer ours at the terminal update",
			"outbox_id", row.ID, "status", string(status))
		return
	}

	s.bump(func(st *Stats) {
		if status == outboxmessage.StatusSent {
			st.Sent++
			return
		}
		st.Failed++
		if code == outboxmessage.FailureCodeExpired {
			st.Expired++
		}
	})
}

func (s *Sender) settle(
	row *controlent.OutboxMessage,
	started time.Time,
	kind *outboxmessage.SenderKind,
	failure *sendError,
	log *slog.Logger,
) {
	attempts := row.AttemptCount + 1
	if !failure.retryable || attempts >= row.MaxAttempts {
		log.Warn("mail outbox message given up on",
			"failure_code", string(failure.code),
			"attempts", attempts,
			"retryable", failure.retryable)
		s.finish(row, started, kind, failure.code, "")
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, DefaultWriteTimeout)
	defer cancel()

	next := s.opts.Now().Add(s.backoff(attempts))
	update := s.control.OutboxMessage.Update().
		Where(outboxmessage.ID(row.ID), outboxmessage.LeasedByEQ(s.opts.InstanceID)).
		SetStatus(outboxmessage.StatusRetrying).
		AddAttemptCount(1).
		SetLastAttemptAt(started).
		SetNextAttemptAt(next).
		SetFailureCode(failure.code).
		ClearLeasedBy().
		ClearLeaseExpiresAt()
	if kind != nil {
		update = update.SetSenderKind(*kind)
	}

	n, err := update.Save(ctx)
	if err != nil {
		s.logger.Error("mail outbox retry could not be scheduled",
			"outbox_id", row.ID, "error", err.Error())
		s.bump(func(st *Stats) { st.Errors++ })
		return
	}
	if n == 0 {
		s.logger.Warn("mail outbox row was no longer ours at the retry update", "outbox_id", row.ID)
		return
	}

	log.Info("mail outbox message scheduled for another attempt",
		"failure_code", string(failure.code),
		"attempts", attempts,
		"next_attempt_in_ms", time.Until(next).Milliseconds())
	s.bump(func(st *Stats) { st.Retried++ })
}

func (s *Sender) backoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	window := s.opts.BackoffBase
	for i := 1; i < attempt && window < s.opts.BackoffCap; i++ {
		window *= 2
	}
	if window > s.opts.BackoffCap {
		window = s.opts.BackoffCap
	}
	half := window / 2
	if half <= 0 {
		return window
	}
	return half + time.Duration(rand.Int64N(int64(half)))
}

func (s *Sender) note(key uuid.UUID, ok bool, now time.Time, senderFault ...bool) {
	fault := len(senderFault) > 0 && senderFault[0]

	s.mu.Lock()
	defer s.mu.Unlock()
	b, exists := s.breakers[key]
	if !exists {
		b = &breaker{}
		s.breakers[key] = b
	}
	if ok {
		b.consecutive = 0
		b.openUntil = time.Time{}
		return
	}
	if !fault {
		return
	}
	b.consecutive++
	if b.consecutive >= s.opts.BreakerThreshold {
		b.openUntil = now.Add(s.opts.BreakerCooldown)
		s.logger.Warn("mail outbox is standing off a failing sender",
			"school_id", key,
			"consecutive_failures", b.consecutive,
			"until", b.openUntil.Format(time.RFC3339))
	}
}

func (s *Sender) bump(f func(*Stats)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f(&s.stats)
}

type sendError struct {
	phase       string
	code        outboxmessage.FailureCode
	smtpCode    int
	retryable   bool
	senderFault bool
	detail      string
	err         error
}

func (e *sendError) Error() string {
	out := "mail: " + e.phase + " failed (" + string(e.code) + ")"
	if e.detail != "" {
		out += ": " + e.detail
	}
	return out
}

func (e *sendError) Unwrap() error { return e.err }

func send(ctx context.Context, creds tenancy.SMTPCredentials, msg *letter) error {
	mode, err := creds.Security()
	if err != nil {
		return &sendError{phase: "security", code: outboxmessage.FailureCodeSenderNotConfigured, err: err}
	}
	if mode == tenancy.SMTPNone && !loopback(creds.Host) {
		return &sendError{
			phase: "security",
			code:  outboxmessage.FailureCodeSenderNotConfigured,
			err:   errors.New("mail: the profile asks for no encryption on a remote host"),
		}
	}

	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", creds.Address())
	if err != nil {
		return transport("dial", err)
	}
	defer conn.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}

	if mode == tenancy.SMTPTLS {
		secure := tls.Client(conn, &tls.Config{ServerName: creds.Host})
		if err := secure.HandshakeContext(ctx); err != nil {
			return transport("tls", err)
		}
		conn = secure
	}

	client, err := smtp.NewClient(conn, creds.Host)
	if err != nil {
		return transport("greeting", err)
	}
	defer client.Close()

	helo := creds.HeloName
	if helo == "" {
		helo = domainOf(creds.FromAddress)
	}
	if err := client.Hello(helo); err != nil {
		return transport("helo", err)
	}

	if mode == tenancy.SMTPStartTLS {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return &sendError{
				phase: "starttls",
				code:  outboxmessage.FailureCodeSenderNotConfigured,
				err:   errors.New("mail: the server does not offer STARTTLS"),
			}
		}
		if err := client.StartTLS(&tls.Config{ServerName: creds.Host}); err != nil {
			return transport("starttls", err)
		}
	}

	if creds.Password != "" {
		auth, err := mechanism(client, creds)
		if err != nil {
			return &sendError{phase: "auth", code: outboxmessage.FailureCodeSenderAuthFailed, err: err}
		}
		if err := client.Auth(auth); err != nil {
			return authFailure(err)
		}
	}

	if err := client.Mail(msg.envelopeFrom); err != nil {
		return rejection("mail_from", err, true)
	}
	if err := client.Rcpt(msg.recipient); err != nil {
		return rejection("rcpt_to", err, false)
	}

	writer, err := client.Data()
	if err != nil {
		return rejection("data", err, true)
	}
	if _, err := writer.Write(msg.data); err != nil {
		return transport("body", err)
	}
	if err := writer.Close(); err != nil {
		return rejection("body_close", err, true)
	}
	_ = client.Quit()
	return nil
}

func mechanism(client *smtp.Client, creds tenancy.SMTPCredentials) (smtp.Auth, error) {
	ok, mechanisms := client.Extension("AUTH")
	if !ok {
		return nil, errors.New("mail: the server does not offer AUTH")
	}
	switch mechanisms = strings.ToUpper(mechanisms); {
	case strings.Contains(mechanisms, "PLAIN"):
		return smtp.PlainAuth("", creds.Username, creds.Password, creds.Host), nil
	case strings.Contains(mechanisms, "LOGIN"):
		return loginAuth{username: creds.Username, password: creds.Password, host: creds.Host}, nil
	case strings.Contains(mechanisms, "CRAM-MD5"):
		return smtp.CRAMMD5Auth(creds.Username, creds.Password), nil
	}
	return nil, errors.New("mail: the server offers no mechanism this sender can use")
}

type loginAuth struct {
	username string
	password string
	host     string
}

func (a loginAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	if !server.TLS && !loopback(server.Name) {
		return "", nil, errors.New("mail: unencrypted connection")
	}
	if server.Name != a.host {
		return "", nil, errors.New("mail: wrong host name")
	}
	return "LOGIN", nil, nil
}

func (a loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(strings.TrimSuffix(string(fromServer), ":"))) {
	case "username":
		return []byte(a.username), nil
	case "password":
		return []byte(a.password), nil
	}
	return nil, errors.New("mail: unexpected LOGIN challenge")
}

func loopback(host string) bool {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "localhost" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback()
	}
	return false
}

func transport(phase string, err error) *sendError {
	if timedOut(err) {
		return &sendError{
			phase:       phase,
			code:        outboxmessage.FailureCodeTimeout,
			retryable:   true,
			senderFault: true,
			err:         err,
		}
	}
	if code, ok := statusOf(err); ok {
		return classify(phase, code, true)
	}
	return &sendError{
		phase:       phase,
		code:        outboxmessage.FailureCodeSenderUnavailable,
		retryable:   true,
		senderFault: true,
		err:         err,
	}
}

func authFailure(err error) *sendError {
	code, ok := statusOf(err)
	failure := &sendError{
		phase:       "auth",
		code:        outboxmessage.FailureCodeSenderAuthFailed,
		smtpCode:    code,
		senderFault: true,
		err:         err,
	}
	if timedOut(err) {
		failure.code = outboxmessage.FailureCodeTimeout
		failure.retryable = true
		return failure
	}
	failure.retryable = ok && code < 500
	return failure
}

func rejection(phase string, err error, senderSide bool) *sendError {
	if timedOut(err) {
		return &sendError{
			phase:       phase,
			code:        outboxmessage.FailureCodeTimeout,
			retryable:   true,
			senderFault: true,
			err:         err,
		}
	}
	code, ok := statusOf(err)
	if !ok {
		return transport(phase, err)
	}
	failure := classify(phase, code, senderSide)
	failure.err = err
	return failure
}

func classify(phase string, code int, senderSide bool) *sendError {
	failure := &sendError{phase: phase, smtpCode: code, senderFault: senderSide}
	switch {
	case code == 421:
		failure.code = outboxmessage.FailureCodeRateLimited
		failure.retryable = true
		failure.senderFault = true
	case code == 450 || code == 451 || code == 452:
		failure.code = outboxmessage.FailureCodeMailboxUnavailable
		failure.retryable = true
	case code == 550 || code == 551 || code == 553 || code == 501:
		failure.code = outboxmessage.FailureCodeInvalidRecipient
		failure.senderFault = false
	case code == 552:
		failure.code = outboxmessage.FailureCodeMailboxUnavailable
	case code == 535 || code == 530:
		failure.code = outboxmessage.FailureCodeSenderAuthFailed
		failure.senderFault = true
	case code >= 500:
		failure.code = outboxmessage.FailureCodeRejectedByProvider
	case code >= 400:
		failure.code = outboxmessage.FailureCodeRejectedByProvider
		failure.retryable = true
	default:
		failure.code = outboxmessage.FailureCodeInternalError
		failure.retryable = true
	}
	if phase == "rcpt_to" && failure.code == outboxmessage.FailureCodeRejectedByProvider && code >= 500 {
		failure.code = outboxmessage.FailureCodeInvalidRecipient
		failure.senderFault = false
	}
	return failure
}

func statusOf(err error) (int, bool) {
	var protocol *textproto.Error
	if errors.As(err, &protocol) {
		return protocol.Code, true
	}
	return 0, false
}

func timedOut(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, os.ErrDeadlineExceeded) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

type ControlProfiles struct {
	Control *controlent.Client
	Keyring *crypto.Keyring
}

func (p *ControlProfiles) SMTPCredentials(ctx context.Context, schoolID uuid.UUID) (*tenancy.SMTPCredentials, error) {
	row, err := p.Control.SchoolProfile.Query().
		Where(
			schoolprofile.SchoolID(schoolID),
			schoolprofile.ProfileTypeEQ(schoolprofile.ProfileTypeSMTP),
			schoolprofile.StatusEQ(schoolprofile.StatusActive),
			schoolprofile.Name("primary"),
		).
		Only(ctx)
	if err != nil {
		if controlent.IsNotFound(err) {
			return nil, fmt.Errorf("%w: smtp profile for %s", tenancy.ErrNoProfile, schoolID)
		}
		return nil, err
	}

	plaintext, err := p.Keyring.Decrypt(row.KeyVersion, row.Nonce, row.Ciphertext, schoolID[:])
	if err != nil {
		return nil, fmt.Errorf("school %s: %w", schoolID, err)
	}
	defer wipe(plaintext)

	var creds tenancy.SMTPCredentials
	if err := json.Unmarshal(plaintext, &creds); err != nil {
		return nil, errors.New("mail: the smtp credential blob is not valid JSON")
	}
	return &creds, nil
}
