package mail

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/outboxmessage"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/school"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

const testMasterKey = "1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

type statement struct {
	kind  string
	query string
	args  []any
}

func (s statement) mentions(column string) bool {
	return strings.Contains(s.query, `"`+column+`"`)
}

func (s statement) carries(want any) bool {
	for _, arg := range s.args {
		if fmt.Sprint(arg) == fmt.Sprint(want) {
			return true
		}
	}
	return false
}

type recorder struct {
	inner dialect.Driver

	mu    sync.Mutex
	stmts []statement
	first string
}

func (r *recorder) note(kind, query string, args any) {
	list, _ := args.([]any)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stmts = append(r.stmts, statement{kind: kind, query: query, args: list})
}

func (r *recorder) blame(query string, err error) error {
	if err == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.first == "" {
		r.first = strings.Join(strings.Fields(query), " ") + " >>> failed with: " + err.Error()
	}
	return err
}

func (r *recorder) blamed() (string, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.first, r.first != ""
}

func (r *recorder) taken() []statement {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]statement, len(r.stmts))
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
	return r.blame(query, r.inner.Query(ctx, query, args, v))
}

func (r *recorder) Exec(ctx context.Context, query string, args, v any) error {
	r.note("exec", query, args)
	return r.blame(query, r.inner.Exec(ctx, query, args, v))
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
	return t.on.blame(query, t.inner.Query(ctx, query, args, v))
}

func (t *recordedTx) Exec(ctx context.Context, query string, args, v any) error {
	t.on.note("exec", query, args)
	return t.on.blame(query, t.inner.Exec(ctx, query, args, v))
}

func (t *recordedTx) Commit() error   { return t.inner.Commit() }
func (t *recordedTx) Rollback() error { return t.inner.Rollback() }

type fixture struct {
	Client  *controlent.Client
	Keyring *crypto.Keyring
	rec     *recorder
}

func (f *fixture) forget() { f.rec.forget() }

func (f *fixture) firstFault() (string, bool) { return f.rec.blamed() }

func (f *fixture) execsOn(table string) []statement {
	var out []statement
	for _, stmt := range f.rec.taken() {
		if stmt.kind == "exec" && strings.Contains(stmt.query, `"`+table+`"`) {
			out = append(out, stmt)
		}
	}
	return out
}

var (
	controlOnce sync.Once
	controlDrv  dialect.Driver
	controlWhy  string
	controlErr  error
)

const fixturePrefix = "MAILT-"

const fixtureLockKey int64 = 0x4d41494c54455354

func TestMain(m *testing.M) {
	os.Exit(runPackage(m))
}

func runPackage(m *testing.M) int {
	release := holdFixtureLock()
	defer release()

	sweepFixtures()
	defer sweepFixtures()

	return m.Run()
}

func holdFixtureLock() func() {
	repoEnv()

	dsn := strings.TrimSpace(os.Getenv(testsupport.ControlDSNEnv))
	if dsn == "" {
		return func() {}
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return func() {}
	}

	dial, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, err := db.Conn(dial)
	if err != nil {
		_ = db.Close()
		return func() {}
	}

	if _, err := conn.ExecContext(context.Background(),
		"SELECT pg_advisory_lock($1)", fixtureLockKey); err != nil {
		_ = conn.Close()
		_ = db.Close()
		return func() {}
	}

	var released bool
	return func() {
		if released {
			return
		}
		released = true
		if _, err := conn.ExecContext(context.Background(),
			"SELECT pg_advisory_unlock($1)", fixtureLockKey); err != nil {
			fmt.Fprintln(os.Stderr, "mail tests: could not release the fixture advisory lock: "+err.Error())
		}
		_ = conn.Close()
		_ = db.Close()
	}
}

func sweepFixtures() {
	ctx := context.Background()
	drv, _, err := openControl(ctx)
	if err != nil || drv == nil {
		return
	}
	client := controlent.NewClient(controlent.Driver(drv))
	rows, err := client.School.Query().Where(school.CodeHasPrefix(fixturePrefix)).All(ctx)
	if err != nil {
		return
	}
	for _, row := range rows {
		if err := client.School.DeleteOneID(row.ID).Exec(ctx); err != nil {
			fmt.Fprintln(os.Stderr, "mail tests: could not remove leftover fixture school "+
				row.Code+": "+err.Error())
		}
	}
}

func control(ctx context.Context, t *testing.T) *fixture {
	t.Helper()

	controlOnce.Do(func() { controlDrv, controlWhy, controlErr = openControl(ctx) })
	if controlErr != nil {
		t.Fatalf("the control plane was configured but unreachable: %v", controlErr)
	}
	if controlDrv == nil {
		t.Skip(testsupport.SkipMarker + ": " + controlWhy + ". The outbox lives in the control plane, " +
			"and nothing here can be settled without one: the payload purge, the lease and the retry " +
			"schedule are all enforced by Postgres. Set " + testsupport.ControlDSNEnv + " to a control DSN. " +
			"The repository .env is read automatically.")
	}

	keyring, err := crypto.ParseKeyring(testMasterKey)
	if err != nil {
		t.Fatalf("the test keyring is unusable: %v", err)
	}

	rec := &recorder{inner: controlDrv}
	f := &fixture{Client: controlent.NewClient(controlent.Driver(rec)), Keyring: keyring, rec: rec}

	t.Cleanup(func() {
		blamed, ok := rec.blamed()
		if !t.Failed() || !ok {
			return
		}
		t.Logf("the first statement that failed in this test was: %s -- anything after it inside a "+
			"transaction reports only that the transaction is aborted, with the cause absent", blamed)
	})
	return f
}

func (f *fixture) discard(ctx context.Context, t *testing.T, id uuid.UUID) {
	t.Helper()

	t.Cleanup(func() {
		if err := f.Client.OutboxMessage.DeleteOneID(id).Exec(ctx); err != nil && !controlent.IsNotFound(err) {
			t.Errorf("outbox row %s was left behind in the control plane: %v", id, err)
		}
	})
}

func openControl(ctx context.Context) (dialect.Driver, string, error) {
	repoEnv()

	dsn := strings.TrimSpace(os.Getenv(testsupport.ControlDSNEnv))
	if dsn == "" {
		return nil, testsupport.ControlDSNEnv + " is not set", nil
	}
	drv, _, err := postgres.Open(ctx, dsn, postgres.Options{})
	if err != nil {
		return nil, "", err
	}
	return drv, "", nil
}

func repoEnv() {
	dir, err := os.Getwd()
	if err != nil {
		return
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}

	f, err := os.Open(filepath.Join(dir, ".env"))
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
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

func newSchool(ctx context.Context, t *testing.T, f *fixture, label string) *controlent.School {
	t.Helper()

	suffix := strings.ToUpper(uuid.NewString()[:8])
	row, err := f.Client.School.Create().
		SetName(label + " " + suffix).
		SetCode(fixturePrefix + suffix).
		SetEmail("office@" + strings.ToLower(suffix) + ".example.edu").
		Save(ctx)
	if err != nil {
		t.Fatalf("could not create the fixture school: %v", err)
	}
	f.forgetSchool(ctx, t, row.ID)
	return row
}

func (f *fixture) forgetSchool(ctx context.Context, t *testing.T, id uuid.UUID) {
	t.Helper()

	t.Cleanup(func() {
		if err := f.Client.School.DeleteOneID(id).Exec(ctx); err != nil && !controlent.IsNotFound(err) {
			t.Errorf("fixture school %s was left behind in the control plane: %v", id, err)
		}
	})
}

type stubProfiles map[uuid.UUID]tenancy.SMTPCredentials

func (p stubProfiles) SMTPCredentials(_ context.Context, schoolID uuid.UUID) (*tenancy.SMTPCredentials, error) {
	creds, ok := p[schoolID]
	if !ok {
		return nil, fmt.Errorf("%w: smtp profile for %s", tenancy.ErrNoProfile, schoolID)
	}
	return &creds, nil
}

func discard() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError + 1}))
}

type delivery struct {
	from string
	to   string
	data string
}

type behaviour struct {
	rcptCode   string
	hangAfter  string
	authOffers string
}

type stubSMTP struct {
	listener net.Listener
	how      behaviour

	mu   sync.Mutex
	got  []delivery
	done chan struct{}
}

func startSMTP(t *testing.T, how behaviour) *stubSMTP {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("%s: this test needs to bind a loopback port and could not: %v", testsupport.SkipMarker, err)
	}
	stub := &stubSMTP{listener: listener, how: how, done: make(chan struct{})}
	go stub.serve()
	t.Cleanup(func() {
		close(stub.done)
		_ = listener.Close()
	})
	return stub
}

func (s *stubSMTP) port() int { return s.listener.Addr().(*net.TCPAddr).Port }

func (s *stubSMTP) credentials() tenancy.SMTPCredentials {
	return tenancy.SMTPCredentials{
		Host:        "127.0.0.1",
		Port:        s.port(),
		Username:    "office@example.edu",
		Password:    "s3cret",
		Encryption:  tenancy.SMTPNone,
		FromAddress: "noreply@example.edu",
		FromName:    "Example School",
	}
}

func (s *stubSMTP) delivered() []delivery {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]delivery, len(s.got))
	copy(out, s.got)
	return out
}

func (s *stubSMTP) serve() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			return
		}
		go s.session(conn)
	}
}

func (s *stubSMTP) session(conn net.Conn) {
	defer conn.Close()

	reader := bufio.NewReader(conn)
	write := func(lines ...string) {
		for _, line := range lines {
			_, _ = conn.Write([]byte(line + "\r\n"))
		}
	}
	read := func() (string, bool) {
		line, err := reader.ReadString('\n')
		if err != nil {
			return "", false
		}
		return strings.TrimRight(line, "\r\n"), true
	}
	stall := func(phase string) bool {
		if s.how.hangAfter != phase {
			return false
		}
		<-s.done
		return true
	}

	if stall("connect") {
		return
	}
	write("220 stub.smtp.test ESMTP")

	offers := s.how.authOffers
	if offers == "" {
		offers = "PLAIN LOGIN"
	}

	var from, to string
	for {
		line, ok := read()
		if !ok {
			return
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		switch strings.ToUpper(fields[0]) {
		case "EHLO":
			if stall("ehlo") {
				return
			}
			write("250-stub.smtp.test", "250 AUTH "+offers)
		case "HELO":
			write("250 stub.smtp.test")
		case "AUTH":
			if len(fields) > 1 && strings.EqualFold(fields[1], "LOGIN") {
				write("334 " + base64.StdEncoding.EncodeToString([]byte("Username:")))
				read()
				write("334 " + base64.StdEncoding.EncodeToString([]byte("Password:")))
				read()
			}
			write("235 2.7.0 Authentication succeeded")
		case "MAIL":
			from = strings.TrimPrefix(strings.ToUpper(line), "MAIL FROM:")
			from = strings.Trim(strings.TrimSpace(from), "<>")
			write("250 2.1.0 Ok")
		case "RCPT":
			if stall("rcpt") {
				return
			}
			if s.how.rcptCode != "" {
				write(s.how.rcptCode)
				continue
			}
			to = strings.TrimPrefix(line, "RCPT TO:")
			to = strings.Trim(strings.TrimSpace(to), "<>")
			write("250 2.1.5 Ok")
		case "DATA":
			write("354 End data with <CR><LF>.<CR><LF>")
			var body strings.Builder
			for {
				chunk, ok := read()
				if !ok {
					return
				}
				if chunk == "." {
					break
				}
				body.WriteString(chunk)
				body.WriteString("\n")
			}
			s.mu.Lock()
			s.got = append(s.got, delivery{from: from, to: to, data: body.String()})
			s.mu.Unlock()
			write("250 2.0.0 Ok: queued")
		case "QUIT":
			write("221 2.0.0 Bye")
			return
		case "RSET", "NOOP":
			write("250 2.0.0 Ok")
		default:
			write("502 5.5.2 Command unrecognized")
		}
	}
}

func settle(t *testing.T, s *Sender, within time.Duration) {
	t.Helper()

	deadline := time.Now().Add(within)
	for time.Now().Before(deadline) {
		if s.InFlight() == 0 {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("the sender still had %d messages in flight after %s", s.InFlight(), within)
}

func reload(ctx context.Context, t *testing.T, f *fixture, id uuid.UUID) *controlent.OutboxMessage {
	t.Helper()

	row, err := f.Client.OutboxMessage.Get(ctx, id)
	if err != nil {
		t.Fatalf("could not reload outbox row %s: %v", id, err)
	}
	return row
}

func submitter(t *testing.T, f *fixture) *Submitter {
	t.Helper()

	sub, err := NewSubmitter(f.Client, f.Keyring, "test-pepper", 1)
	if err != nil {
		t.Fatalf("could not build the submitter: %v", err)
	}
	return sub
}

func sender(t *testing.T, f *fixture, opts Options) *Sender {
	t.Helper()

	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.SMTPTimeout == 0 {
		opts.SMTPTimeout = 5 * time.Second
	}
	s, err := NewSender(f.Client, f.Keyring, opts, discard())
	if err != nil {
		t.Fatalf("could not build the sender: %v", err)
	}
	t.Cleanup(s.Close)
	return s
}

func queue(ctx context.Context, t *testing.T, f *fixture, sub *Submitter, msg Message) *controlent.OutboxMessage {
	t.Helper()

	if msg.TemplateKey == "" {
		msg.TemplateKey = "otp.login"
	}
	if msg.Recipient == "" {
		msg.Recipient = "parent@example.com"
	}
	if msg.Subject == "" {
		msg.Subject = "Your one-time code"
	}
	if msg.Body == "" {
		msg.Body = "The code is 123456."
	}
	row, err := sub.Submit(ctx, msg)
	if err != nil {
		t.Fatalf("could not queue the fixture message: %v", err)
	}
	f.discard(ctx, t, row.ID)
	return row
}

func terminalStatements(f *fixture, wants ...any) []statement {
	var out []statement
	for _, stmt := range f.execsOn("outbox_messages") {
		matched := true
		for _, want := range wants {
			if !stmt.carries(want) {
				matched = false
				break
			}
		}
		if matched {
			out = append(out, stmt)
		}
	}
	return out
}

func TestASuccessfulSendPurgesThePayloadInTheSameStatement(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Purge")
	stub := startSMTP(t, behaviour{})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := sender(t, f, Options{
		InstanceID: "purge-sender",
		Profiles:   stubProfiles{school.ID: stub.credentials()},
	})
	f.forget()

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	got := reload(ctx, t, f, row.ID)
	if got.Status != outboxmessage.StatusSent {
		t.Fatalf("status = %s, want sent", got.Status)
	}
	if got.PayloadCiphertext != nil || got.PayloadNonce != nil || got.PayloadKeyVersion != nil {
		t.Fatalf("the payload survived the send: ciphertext=%v nonce=%v version=%v",
			got.PayloadCiphertext, got.PayloadNonce, got.PayloadKeyVersion)
	}
	if got.AttemptCount != 1 || got.CompletedAt == nil || got.SenderKind == nil ||
		*got.SenderKind != outboxmessage.SenderKindSchoolSMTP {
		t.Fatalf("the row does not record the attempt: %+v", got)
	}
	if got.ProviderMessageID == nil || *got.ProviderMessageID == "" {
		t.Fatal("nothing was recorded to correlate this send with the provider's logs")
	}
	if got.LeasedBy != nil || got.LeaseExpiresAt != nil {
		t.Fatalf("the lease outlived the send: %v %v", got.LeasedBy, got.LeaseExpiresAt)
	}

	sent := terminalStatements(f, string(outboxmessage.StatusSent), row.ID)
	if len(sent) != 1 {
		t.Fatalf("%d statements moved the row to sent, want exactly 1; a second one would meet a "+
			"CHECK that refuses a sent row still carrying a payload", len(sent))
	}
	for _, column := range []string{"payload_ciphertext", "payload_nonce", "payload_key_version"} {
		if !sent[0].mentions(column) {
			t.Fatalf("the statement that marked the row sent did not null %s: %s", column, sent[0].query)
		}
	}

	delivered := stub.delivered()
	if len(delivered) != 1 {
		t.Fatalf("the server received %d messages, want 1", len(delivered))
	}
	if !strings.Contains(delivered[0].data, "Message-ID: <"+*got.ProviderMessageID+">") {
		t.Fatalf("the recorded message id is not the one that went out:\n%s", delivered[0].data)
	}
}

func TestAPermanentRejectionRecordsACodeAndPurgesThePayload(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Rejected")
	stub := startSMTP(t, behaviour{rcptCode: "550 5.1.1 Recipient address rejected: User unknown"})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID, MaxAttempts: 5})

	s := sender(t, f, Options{
		InstanceID: "reject-sender",
		Profiles:   stubProfiles{school.ID: stub.credentials()},
	})
	f.forget()

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	got := reload(ctx, t, f, row.ID)
	if got.Status != outboxmessage.StatusFailed {
		t.Fatalf("status = %s, want failed for a 550 at RCPT", got.Status)
	}
	if got.FailureCode == nil || *got.FailureCode != outboxmessage.FailureCodeInvalidRecipient {
		t.Fatalf("failure_code = %v, want invalid_recipient", got.FailureCode)
	}
	if got.PayloadCiphertext != nil || got.PayloadNonce != nil || got.PayloadKeyVersion != nil {
		t.Fatal("a failed row is still carrying the payload it failed to deliver")
	}
	if got.AttemptCount != 1 {
		t.Fatalf("attempt_count = %d, want 1", got.AttemptCount)
	}

	failed := terminalStatements(f, string(outboxmessage.StatusFailed), row.ID)
	if len(failed) != 1 {
		t.Fatalf("%d statements moved the row to failed, want exactly 1", len(failed))
	}
	for _, column := range []string{"payload_ciphertext", "payload_nonce", "payload_key_version", "failure_code"} {
		if !failed[0].mentions(column) {
			t.Fatalf("the statement that failed the row did not set %s: %s", column, failed[0].query)
		}
	}
	for _, stmt := range f.execsOn("outbox_messages") {
		if stmt.carries("Recipient address rejected") || strings.Contains(stmt.query, "User unknown") {
			t.Fatalf("the provider's own rejection text was written back to the row: %v", stmt.args)
		}
	}
}

func TestARetryableRejectionKeepsThePayloadAndBacksOff(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Deferred")
	stub := startSMTP(t, behaviour{rcptCode: "451 4.3.0 Temporary lookup failure"})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID, MaxAttempts: 5})

	s := sender(t, f, Options{
		InstanceID:  "retry-sender",
		Profiles:    stubProfiles{school.ID: stub.credentials()},
		BackoffBase: 30 * time.Second,
		BackoffCap:  30 * time.Minute,
	})

	before := time.Now()
	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	got := reload(ctx, t, f, row.ID)
	if got.Status != outboxmessage.StatusRetrying {
		t.Fatalf("status = %s, want retrying for a 451", got.Status)
	}
	if got.PayloadCiphertext == nil || got.PayloadNonce == nil || got.PayloadKeyVersion == nil {
		t.Fatal("the payload was purged from a row that still has to be sent")
	}
	if got.AttemptCount != 1 {
		t.Fatalf("attempt_count = %d, want 1", got.AttemptCount)
	}
	if got.FailureCode == nil || *got.FailureCode != outboxmessage.FailureCodeMailboxUnavailable {
		t.Fatalf("failure_code = %v, want mailbox_unavailable", got.FailureCode)
	}
	if got.LeasedBy != nil {
		t.Fatalf("the lease was not given back: %v", *got.LeasedBy)
	}

	wait := got.NextAttemptAt.Sub(before)
	if wait < 10*time.Second || wait > 40*time.Second {
		t.Fatalf("next attempt is %s away, want a jittered first backoff inside [15s, 30s]", wait)
	}
	if !got.NextAttemptAt.After(row.NextAttemptAt) {
		t.Fatal("the row is immediately claimable again, which is a hot loop against a failing server")
	}
}

func TestJitterSpreadsRetriesAcrossSchools(t *testing.T) {
	s := &Sender{opts: Options{BackoffBase: 30 * time.Second, BackoffCap: 30 * time.Minute}}

	seen := map[time.Duration]bool{}
	for i := 0; i < 64; i++ {
		d := s.backoff(1)
		if d < 15*time.Second || d > 30*time.Second {
			t.Fatalf("backoff(1) = %s, want it inside [15s, 30s]", d)
		}
		seen[d] = true
	}
	if len(seen) < 32 {
		t.Fatalf("64 draws produced %d distinct delays; a shared outage would retry in lockstep", len(seen))
	}
	if got := s.backoff(20); got > 30*time.Minute {
		t.Fatalf("backoff(20) = %s, want it capped at 30m", got)
	}
}

func TestMaxAttemptsOfOneNeverRetries(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "OneShot")
	stub := startSMTP(t, behaviour{rcptCode: "451 4.3.0 Temporary lookup failure"})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID, MaxAttempts: 1})

	s := sender(t, f, Options{
		InstanceID: "otp-sender",
		Profiles:   stubProfiles{school.ID: stub.credentials()},
	})

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	got := reload(ctx, t, f, row.ID)
	if got.Status != outboxmessage.StatusFailed {
		t.Fatalf("status = %s, want failed: a code worth one attempt must not be delivered late", got.Status)
	}
	if got.AttemptCount != 1 {
		t.Fatalf("attempt_count = %d, want 1", got.AttemptCount)
	}
	if got.FailureCode == nil {
		t.Fatal("a failed row carries no failure code")
	}
	if got.PayloadCiphertext != nil {
		t.Fatal("the payload survived a terminal failure")
	}
}

func TestAnExpiredMessageIsFailedWithoutBeingSent(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Expired")
	stub := startSMTP(t, behaviour{})
	past := time.Now().Add(-time.Minute)
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID, ExpiresAt: &past})

	s := sender(t, f, Options{
		InstanceID: "expiry-sender",
		Profiles:   stubProfiles{school.ID: stub.credentials()},
	})
	f.forget()

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	got := reload(ctx, t, f, row.ID)
	if got.Status != outboxmessage.StatusFailed {
		t.Fatalf("status = %s, want failed", got.Status)
	}
	if got.FailureCode == nil || *got.FailureCode != outboxmessage.FailureCodeExpired {
		t.Fatalf("failure_code = %v, want expired", got.FailureCode)
	}
	if got.PayloadCiphertext != nil || got.PayloadNonce != nil || got.PayloadKeyVersion != nil {
		t.Fatal("an expired row is still carrying the payload it will never send")
	}
	if n := len(stub.delivered()); n != 0 {
		t.Fatalf("the server received %d messages; a late one-time code is worse than none", n)
	}

	failed := terminalStatements(f, string(outboxmessage.StatusFailed))
	if len(failed) != 1 {
		t.Fatalf("%d statements expired the row, want exactly 1 carrying both the code and the purge", len(failed))
	}
	for _, column := range []string{"failure_code", "payload_ciphertext", "payload_nonce", "payload_key_version"} {
		if !failed[0].mentions(column) {
			t.Fatalf("the expiry statement did not set %s: %s", column, failed[0].query)
		}
	}
}

func TestAClaimedMessageThatExpiredIsNotSentEither(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "RaceExpired")
	stub := startSMTP(t, behaviour{})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := sender(t, f, Options{
		InstanceID: "race-sender",
		Profiles:   stubProfiles{school.ID: stub.credentials()},
	})

	claimed, err := s.claim(ctx, row, time.Now())
	if err != nil || !claimed {
		t.Fatalf("claim = %v, %v; want the row claimed", claimed, err)
	}
	row.ExpiresAt = ptr(time.Now().Add(-time.Second))
	s.deliver(row)

	got := reload(ctx, t, f, row.ID)
	if got.Status != outboxmessage.StatusFailed ||
		got.FailureCode == nil || *got.FailureCode != outboxmessage.FailureCodeExpired {
		t.Fatalf("status = %s, failure_code = %v; want failed/expired", got.Status, got.FailureCode)
	}
	if n := len(stub.delivered()); n != 0 {
		t.Fatalf("the server received %d messages from an expired row", n)
	}
}

func TestTwoSendersCannotClaimTheSameRow(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Contended")
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	first := sender(t, f, Options{InstanceID: "sender-one", Profiles: stubProfiles{}})
	second := sender(t, f, Options{InstanceID: "sender-two", Profiles: stubProfiles{}})

	now := time.Now()
	won, err := first.claim(ctx, row, now)
	if err != nil || !won {
		t.Fatalf("the first claim returned %v, %v; want it to win", won, err)
	}
	lost, err := second.claim(ctx, row, now)
	if err != nil {
		t.Fatalf("the second claim errored: %v", err)
	}
	if lost {
		t.Fatal("both senders claimed the same row; the message would be delivered twice")
	}

	got := reload(ctx, t, f, row.ID)
	if got.LeasedBy == nil || *got.LeasedBy != "sender-one" {
		t.Fatalf("leased_by = %v, want sender-one", got.LeasedBy)
	}
	if got.Status != outboxmessage.StatusSending {
		t.Fatalf("status = %s, want sending", got.Status)
	}
}

func TestALapsedLeaseIsReclaimedWithoutCountingAnAttempt(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Crashed")
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	crashed := sender(t, f, Options{InstanceID: "sender-that-died", Profiles: stubProfiles{}})
	if won, err := crashed.claim(ctx, row, time.Now()); err != nil || !won {
		t.Fatalf("the first claim returned %v, %v; want it to win", won, err)
	}

	lapsed := time.Now().Add(-time.Second)
	if _, err := f.Client.OutboxMessage.UpdateOneID(row.ID).SetLeaseExpiresAt(lapsed).Save(ctx); err != nil {
		t.Fatalf("could not lapse the lease: %v", err)
	}

	successor := sender(t, f, Options{InstanceID: "sender-that-took-over", Profiles: stubProfiles{}})
	found, err := successor.scan(ctx, time.Now())
	if err != nil {
		t.Fatalf("the scan failed: %v", err)
	}
	if !containsRow(found, row.ID) {
		t.Fatal("a crashed sender's row was invisible to the next scan; it would need an operator to move")
	}

	stale := reload(ctx, t, f, row.ID)
	won, err := successor.claim(ctx, stale, time.Now())
	if err != nil || !won {
		t.Fatalf("the successor claim returned %v, %v; want it to reclaim the lapsed lease", won, err)
	}

	got := reload(ctx, t, f, row.ID)
	if got.AttemptCount != 0 {
		t.Fatalf("attempt_count = %d after a reclaim, want 0: a lapsed lease is not a failed attempt", got.AttemptCount)
	}
	if got.LeasedBy == nil || *got.LeasedBy != "sender-that-took-over" {
		t.Fatalf("leased_by = %v, want sender-that-took-over", got.LeasedBy)
	}
}

func TestThePlatformFallbackIsUsedRecordedAndForcesItsOwnFrom(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "No Profile School")
	stub := startSMTP(t, behaviour{})

	platform := stub.credentials()
	platform.FromAddress = "noreply@platform.example"
	platform.FromName = "Emerge"
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := sender(t, f, Options{
		InstanceID:       "fallback-sender",
		Profiles:         stubProfiles{},
		Platform:         platform,
		PlatformFromName: "Emerge",
	})

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	got := reload(ctx, t, f, row.ID)
	if got.Status != outboxmessage.StatusSent {
		t.Fatalf("status = %s, want sent", got.Status)
	}
	if got.SenderKind == nil || *got.SenderKind != outboxmessage.SenderKindPlatformFallback {
		t.Fatalf("sender_kind = %v, want platform_fallback: a school living on the fallback has to be queryable",
			got.SenderKind)
	}

	delivered := stub.delivered()
	if len(delivered) != 1 {
		t.Fatalf("the server received %d messages, want 1", len(delivered))
	}
	head := delivered[0].data
	from := headerOf(head, "From")
	if !strings.Contains(from, school.Name+" (via Emerge)") {
		t.Fatalf("From = %q, want the school name and the via marker", from)
	}
	if !strings.Contains(from, "<noreply@platform.example>") {
		t.Fatalf("From = %q, want the platform address: sending as the school fails SPF and DKIM alignment", from)
	}
	if strings.Contains(from, *school.Email) {
		t.Fatalf("From = %q, want the school's own address kept out of it", from)
	}
	if replyTo := headerOf(head, "Reply-To"); !strings.Contains(replyTo, *school.Email) {
		t.Fatalf("Reply-To = %q, want the school's own address %q", replyTo, *school.Email)
	}
	if !strings.EqualFold(delivered[0].from, "noreply@platform.example") {
		t.Fatalf("the envelope sender was %q, want the platform address", delivered[0].from)
	}
}

func TestASchoolWithItsOwnProfileSendsAsItself(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Own Profile School")
	stub := startSMTP(t, behaviour{})

	own := stub.credentials()
	own.FromAddress = "office@ownprofile.example.edu"
	own.FromName = "Own Profile School"

	platform := stub.credentials()
	platform.FromAddress = "noreply@platform.example"
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := sender(t, f, Options{
		InstanceID:       "own-sender",
		Profiles:         stubProfiles{school.ID: own},
		Platform:         platform,
		PlatformFromName: "Emerge",
	})

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	got := reload(ctx, t, f, row.ID)
	if got.SenderKind == nil || *got.SenderKind != outboxmessage.SenderKindSchoolSMTP {
		t.Fatalf("sender_kind = %v, want school_smtp", got.SenderKind)
	}
	head := stub.delivered()[0].data
	if from := headerOf(head, "From"); !strings.Contains(from, "office@ownprofile.example.edu") {
		t.Fatalf("From = %q, want the school's own address", from)
	}
	if strings.Contains(head, "(via Emerge)") {
		t.Fatalf("a school sending through its own server was rewritten as a fallback:\n%s", head)
	}
	if headerOf(head, "Reply-To") != "" {
		t.Fatalf("a school sending as itself does not need a Reply-To:\n%s", head)
	}
}

func TestOneSchoolsBlackHoledServerDoesNotHoldUpAnother(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	slow := newSchool(ctx, t, f, "Black Hole")
	quick := newSchool(ctx, t, f, "Unrelated")

	hanging := startSMTP(t, behaviour{hangAfter: "connect"})
	working := startSMTP(t, behaviour{})

	sub := submitter(t, f)
	earlier := time.Now().Add(-time.Hour)
	stuck := queue(ctx, t, f, sub, Message{SchoolID: &slow.ID, NotBefore: earlier})
	other := queue(ctx, t, f, sub, Message{SchoolID: &quick.ID, NotBefore: earlier.Add(time.Minute)})

	s := sender(t, f, Options{
		InstanceID:  "isolation-sender",
		Profiles:    stubProfiles{slow.ID: hanging.credentials(), quick.ID: working.credentials()},
		SMTPTimeout: 8 * time.Second,
	})

	report := s.Tick(ctx)
	if report.Claimed != 2 {
		t.Fatalf("the tick claimed %d rows, want both", report.Claimed)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if len(working.delivered()) == 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if n := len(working.delivered()); n != 1 {
		t.Fatalf("the unrelated school's mail had not gone out %s after the tick (%d delivered); "+
			"it is queued behind a server that accepted the connection and never answered",
			time.Since(report.At), n)
	}

	if got := reload(ctx, t, f, other.ID); got.Status != outboxmessage.StatusSent {
		t.Fatalf("the unrelated school's row is %s, want sent while the other school is still hanging", got.Status)
	}
	if held := reload(ctx, t, f, stuck.ID); held.Status != outboxmessage.StatusSending {
		t.Fatalf("the black-holed row is %s, want it still in flight; the test is not exercising the hang", held.Status)
	}

	settle(t, s, 20*time.Second)
	after := reload(ctx, t, f, stuck.ID)
	if after.Status != outboxmessage.StatusRetrying {
		t.Fatalf("the black-holed row ended as %s, want retrying after the hard timeout", after.Status)
	}
	if after.FailureCode == nil || *after.FailureCode != outboxmessage.FailureCodeTimeout {
		t.Fatalf("failure_code = %v, want timeout", after.FailureCode)
	}
}

func TestARepeatedlyFailingSchoolIsStoodDownRatherThanRetriedEveryTick(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Standoff")
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := sender(t, f, Options{
		InstanceID:       "standoff-sender",
		Profiles:         stubProfiles{},
		BreakerThreshold: 2,
		BreakerCooldown:  time.Minute,
	})

	now := time.Now()
	s.note(school.ID, false, now, true)
	if found, err := s.scan(ctx, now); err != nil || !containsRow(found, row.ID) {
		t.Fatalf("one failure already hid the school's mail: %v", err)
	}
	s.note(school.ID, false, now, true)

	found, err := s.scan(ctx, now)
	if err != nil {
		t.Fatalf("the scan failed: %v", err)
	}
	if containsRow(found, row.ID) {
		t.Fatal("a school that failed repeatedly is still first in the queue on every tick")
	}
	if open := s.Stats().OpenBreakers; open != 1 {
		t.Fatalf("open breakers = %d, want 1", open)
	}

	s.note(school.ID, true, now)
	if recovered, err := s.scan(ctx, now); err != nil || !containsRow(recovered, row.ID) {
		t.Fatalf("the school was not let back in after a success: %v", err)
	}
}

func TestAnIdleTickIsStillAnnounced(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	var lines strings.Builder
	logger := slog.New(slog.NewTextHandler(&lines, &slog.HandlerOptions{Level: slog.LevelInfo}))
	s, err := NewSender(f.Client, f.Keyring, Options{
		InstanceID:     "heartbeat-sender",
		Profiles:       stubProfiles{},
		Interval:       time.Second,
		HeartbeatEvery: time.Nanosecond,
	}, logger)
	if err != nil {
		t.Fatalf("could not build the sender: %v", err)
	}
	t.Cleanup(s.Close)

	if s.Healthy(time.Now()) {
		t.Fatal("a sender that has never ticked reported itself healthy")
	}

	report := s.Tick(ctx)
	if !report.Idle() {
		t.Skip(testsupport.SkipMarker + ": the shared control plane had claimable mail, " +
			"so this run cannot observe an idle tick")
	}

	out := lines.String()
	if !strings.Contains(out, "mail outbox tick") {
		t.Fatalf("an idle tick logged nothing, so a dead sender is indistinguishable from an empty queue:\n%s", out)
	}
	if !strings.Contains(out, "outcome=idle") {
		t.Fatalf("the tick did not say it had nothing to do:\n%s", out)
	}
	if !strings.Contains(out, "claimed=0") {
		t.Fatalf("the tick did not report what it claimed:\n%s", out)
	}

	stats := s.Stats()
	if stats.Ticks != 1 || stats.LastTickAt.IsZero() {
		t.Fatalf("the tick left nothing an operator could alert on: %+v", stats)
	}
	if !s.Healthy(time.Now()) {
		t.Fatal("a sender that just ticked reported itself unhealthy")
	}
	if s.Healthy(time.Now().Add(time.Hour)) {
		t.Fatal("a sender that stopped ticking an hour ago still reports itself healthy")
	}
}

func TestFailureCodesNeverCarryTheProvidersOwnWords(t *testing.T) {
	cases := []struct {
		phase     string
		code      int
		sender    bool
		want      outboxmessage.FailureCode
		retryable bool
	}{
		{"rcpt_to", 550, false, outboxmessage.FailureCodeInvalidRecipient, false},
		{"rcpt_to", 452, false, outboxmessage.FailureCodeMailboxUnavailable, true},
		{"rcpt_to", 421, false, outboxmessage.FailureCodeRateLimited, true},
		{"mail_from", 553, true, outboxmessage.FailureCodeInvalidRecipient, false},
		{"data", 554, true, outboxmessage.FailureCodeRejectedByProvider, false},
		{"data", 451, true, outboxmessage.FailureCodeMailboxUnavailable, true},
	}
	for _, tc := range cases {
		got := classify(tc.phase, tc.code, tc.sender)
		if got.code != tc.want {
			t.Fatalf("%s/%d mapped to %s, want %s", tc.phase, tc.code, got.code, tc.want)
		}
		if got.retryable != tc.retryable {
			t.Fatalf("%s/%d retryable = %v, want %v", tc.phase, tc.code, got.retryable, tc.retryable)
		}
		if strings.Contains(got.Error(), "5.1.1") {
			t.Fatalf("the classified error quotes the provider: %s", got.Error())
		}
	}
}

func containsRow(rows []*controlent.OutboxMessage, id uuid.UUID) bool {
	for _, row := range rows {
		if row.ID == id {
			return true
		}
	}
	return false
}

func headerOf(message, name string) string {
	for _, line := range strings.Split(message, "\n") {
		if strings.HasPrefix(line, name+": ") {
			return strings.TrimSpace(strings.TrimPrefix(line, name+": "))
		}
	}
	return ""
}

func ptr[T any](v T) *T { return &v }

func TestMailSettingsNeverPreventTheProcessFromBooting(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	for _, tc := range []struct {
		name string
		cfg  config.Config
	}{
		{"nothing set at all", config.Config{}},
		{"a from address with no host", config.Config{PlatformSMTPFrom: "noreply@platform.example"}},
		{"a host with no from address", config.Config{PlatformSMTPHost: "smtp.platform.example"}},
		{"an unparseable from address", config.Config{
			PlatformSMTPHost: "smtp.platform.example", PlatformSMTPFrom: "not an address"}},
		{"a from address carrying a display name", config.Config{
			PlatformSMTPHost: "smtp.platform.example", PlatformSMTPFrom: "Emerge <noreply@platform.example>"}},
		{"an encryption mode nothing implements", config.Config{
			PlatformSMTPHost: "smtp.platform.example", PlatformSMTPFrom: "noreply@platform.example",
			PlatformSMTPEncryption: "ssl"}},
		{"a port that is not a port", config.Config{
			PlatformSMTPHost: "smtp.platform.example", PlatformSMTPFrom: "noreply@platform.example",
			PlatformSMTPPort: 70000}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			opts := FromConfig(&tc.cfg)
			opts.Profiles = stubProfiles{}
			s, err := NewSender(f.Client, f.Keyring, opts, discard())
			if err != nil {
				t.Fatalf("the sender refused to build over mail configuration: %v; "+
					"a deployment that sends no mail would not boot", err)
			}
			t.Cleanup(s.Close)

			if s.PlatformConfigured() {
				t.Fatal("a fallback this broken reported itself usable")
			}
			if s.PlatformFault() == nil {
				t.Fatal("the sender disabled the fallback without saying why")
			}
			if report := s.Tick(ctx); report.Err != nil {
				t.Fatalf("the loop would not run without mail configuration: %v", report.Err)
			}
		})
	}
}

func TestNothingIsSetIsAWarningAndATypoIsAnError(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	absent := FromConfig(&config.Config{})
	absent.Profiles = stubProfiles{}
	quiet, err := NewSender(f.Client, f.Keyring, absent, discard())
	if err != nil {
		t.Fatalf("could not build the sender: %v", err)
	}
	t.Cleanup(quiet.Close)
	if !errors.Is(quiet.PlatformFault(), ErrNoPlatformSender) {
		t.Fatalf("fault = %v, want ErrNoPlatformSender when nothing is set", quiet.PlatformFault())
	}

	broken := FromConfig(&config.Config{PlatformSMTPHost: "smtp.platform.example"})
	broken.Profiles = stubProfiles{}
	loud, err := NewSender(f.Client, f.Keyring, broken, discard())
	if err != nil {
		t.Fatalf("could not build the sender: %v", err)
	}
	t.Cleanup(loud.Close)
	if !errors.Is(loud.PlatformFault(), ErrPlatformSenderUnusable) {
		t.Fatalf("fault = %v, want ErrPlatformSenderUnusable when it is half configured", loud.PlatformFault())
	}
	if errors.Is(loud.PlatformFault(), ErrNoPlatformSender) {
		t.Fatal("a typo is indistinguishable from a deployment that deliberately has no fallback")
	}
	if !strings.Contains(loud.PlatformFault().Error(), "PLATFORM_SMTP_FROM_ADDRESS") {
		t.Fatalf("the fault does not name the setting to fix: %v", loud.PlatformFault())
	}
}

func TestABrokenFallbackDoesNotStopASchoolSendingThroughItsOwnServer(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	owns := newSchool(ctx, t, f, "Has Own Server")
	needs := newSchool(ctx, t, f, "Needs Fallback")
	stub := startSMTP(t, behaviour{})

	sub := submitter(t, f)
	fine := queue(ctx, t, f, sub, Message{SchoolID: &owns.ID})
	stranded := queue(ctx, t, f, sub, Message{SchoolID: &needs.ID})

	opts := FromConfig(&config.Config{PlatformSMTPHost: "smtp.platform.example"})
	opts.InstanceID = "broken-fallback-sender"
	opts.Profiles = stubProfiles{owns.ID: stub.credentials()}
	s, err := NewSender(f.Client, f.Keyring, opts, discard())
	if err != nil {
		t.Fatalf("could not build the sender: %v", err)
	}
	t.Cleanup(s.Close)

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	if got := reload(ctx, t, f, fine.ID); got.Status != outboxmessage.StatusSent {
		t.Fatalf("the school with its own server is %s, want sent; a broken fallback took down "+
			"mail it has nothing to do with", got.Status)
	}
	if n := len(stub.delivered()); n != 1 {
		t.Fatalf("the school's own server received %d messages, want 1", n)
	}

	blocked := reload(ctx, t, f, stranded.ID)
	if blocked.Status != outboxmessage.StatusRetrying {
		t.Fatalf("the fallback message is %s, want retrying so a config fix still delivers it", blocked.Status)
	}
	if blocked.FailureCode == nil || *blocked.FailureCode != outboxmessage.FailureCodeSenderNotConfigured {
		t.Fatalf("failure_code = %v, want sender_not_configured", blocked.FailureCode)
	}
	if blocked.PayloadCiphertext == nil {
		t.Fatal("the payload was purged from a message a config fix could still deliver")
	}
}

func TestAMissingPepperStopsMailWithoutStoppingTheSender(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	if _, err := SubmitterFromConfig(f.Client, f.Keyring, &config.Config{}); !errors.Is(err, ErrNoPepper) {
		t.Fatalf("err = %v, want ErrNoPepper: nothing may be enqueued under an unkeyed hash", err)
	}

	opts := FromConfig(&config.Config{})
	opts.Profiles = stubProfiles{}
	s, err := NewSender(f.Client, f.Keyring, opts, discard())
	if err != nil {
		t.Fatalf("a missing pepper stopped the sender from building: %v", err)
	}
	t.Cleanup(s.Close)
	if report := s.Tick(ctx); report.Err != nil {
		t.Fatalf("a missing pepper stopped the loop: %v", report.Err)
	}

	sub, err := SubmitterFromConfig(f.Client, f.Keyring, &config.Config{RecipientHashPepper: "a real pepper"})
	if err != nil {
		t.Fatalf("could not build the submitter: %v", err)
	}
	if sub.HashVersion() != 1 {
		t.Fatalf("hash version = %d, want 1 when RECIPIENT_HASH_VERSION is unset", sub.HashVersion())
	}
	if sub.Hash("parent@example.com") == "" {
		t.Fatal("the submitter produced no hash")
	}
}

func newSchoolWithoutEmail(ctx context.Context, t *testing.T, f *fixture, label string) *controlent.School {
	t.Helper()

	suffix := strings.ToUpper(uuid.NewString()[:8])
	row, err := f.Client.School.Create().
		SetName(label + " " + suffix).
		SetCode(fixturePrefix + suffix).
		Save(ctx)
	if err != nil {
		t.Fatalf("could not create the fixture school: %v", err)
	}
	if row.Email != nil {
		t.Fatalf("the fixture school was given an email after all: %v", *row.Email)
	}
	f.forgetSchool(ctx, t, row.ID)
	return row
}

func fallbackSender(t *testing.T, f *fixture, stub *stubSMTP, replyTo string) *Sender {
	t.Helper()

	platform := stub.credentials()
	platform.FromAddress = "noreply@platform.example"
	platform.FromName = "Emerge"

	return sender(t, f, Options{
		InstanceID:       "reply-path-sender",
		Profiles:         stubProfiles{},
		Platform:         platform,
		PlatformFromName: "Emerge",
		PlatformReplyTo:  replyTo,
	})
}

func TestAFallbackMessageWithNoReplyPathIsRefusedRatherThanSent(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchoolWithoutEmail(ctx, t, f, "No Reply Path")
	stub := startSMTP(t, behaviour{})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := fallbackSender(t, f, stub, "")
	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	if n := len(stub.delivered()); n != 0 {
		t.Fatalf("the server received %d messages; a reply to them would go to noreply@ and vanish, "+
			"and the parent would believe they had replied", n)
	}

	got := reload(ctx, t, f, row.ID)
	if got.Status != outboxmessage.StatusRetrying {
		t.Fatalf("status = %s, want retrying so setting either address still delivers it", got.Status)
	}
	if got.FailureCode == nil || *got.FailureCode != outboxmessage.FailureCodeNoReplyAddress {
		t.Fatalf("failure_code = %v, want no_reply_address", got.FailureCode)
	}
	if *got.FailureCode == outboxmessage.FailureCodeSenderNotConfigured {
		t.Fatal("a missing reply path is indistinguishable from a missing fallback in a SELECT")
	}
	if got.PayloadCiphertext == nil || got.PayloadNonce == nil || got.PayloadKeyVersion == nil {
		t.Fatal("the payload was purged from a message a config fix could still deliver")
	}
	if got.AttemptCount != 1 {
		t.Fatalf("attempt_count = %d, want 1", got.AttemptCount)
	}
}

func TestTheRefusalNamesBothSettingsThatWouldFixIt(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchoolWithoutEmail(ctx, t, f, "Names The Fix")
	stub := startSMTP(t, behaviour{})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := fallbackSender(t, f, stub, "")
	claimed, err := s.claim(ctx, row, time.Now())
	if err != nil || !claimed {
		t.Fatalf("claim = %v, %v; want the row claimed", claimed, err)
	}

	creds := s.opts.Platform
	_, composeErr := s.compose(row, outboxmessage.SenderKindPlatformFallback, &creds, payload{
		Address: "parent@example.com", Subject: "s", Body: "b",
	})
	if composeErr == nil {
		t.Fatal("a fallback message with no reply path was composed rather than refused")
	}
	if !errors.Is(composeErr, ErrNoReplyAddress) {
		t.Fatalf("err = %v, want ErrNoReplyAddress", composeErr)
	}
	for _, fix := range []string{"PLATFORM_SMTP_REPLY_TO", "email"} {
		if !strings.Contains(composeErr.Error(), fix) {
			t.Fatalf("the refusal does not name %s as a fix: %v", fix, composeErr)
		}
	}
	if strings.Contains(composeErr.Error(), "parent@example.com") {
		t.Fatalf("the refusal quotes the recipient: %v", composeErr)
	}
}

func TestThePlatformReplyAddressCarriesTheReplyPathWhenTheSchoolHasNone(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchoolWithoutEmail(ctx, t, f, "Platform Reply")
	stub := startSMTP(t, behaviour{})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := fallbackSender(t, f, stub, "support@platform.example")
	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	if got := reload(ctx, t, f, row.ID); got.Status != outboxmessage.StatusSent {
		t.Fatalf("status = %s, want sent once a monitored reply address exists", got.Status)
	}
	delivered := stub.delivered()
	if len(delivered) != 1 {
		t.Fatalf("the server received %d messages, want 1", len(delivered))
	}
	if replyTo := headerOf(delivered[0].data, "Reply-To"); !strings.Contains(replyTo, "support@platform.example") {
		t.Fatalf("Reply-To = %q, want the platform reply address", replyTo)
	}
}

func TestTheSchoolsOwnAddressWinsOverThePlatformReplyAddress(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Prefers Its Own")
	stub := startSMTP(t, behaviour{})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := fallbackSender(t, f, stub, "support@platform.example")
	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	if got := reload(ctx, t, f, row.ID); got.Status != outboxmessage.StatusSent {
		t.Fatalf("status = %s, want sent", got.Status)
	}
	replyTo := headerOf(stub.delivered()[0].data, "Reply-To")
	if !strings.Contains(replyTo, *school.Email) {
		t.Fatalf("Reply-To = %q, want the school's own address %q", replyTo, *school.Email)
	}
	if strings.Contains(replyTo, "support@platform.example") {
		t.Fatalf("Reply-To = %q, want the school ahead of the platform catch-all", replyTo)
	}
}

func TestThePlatformReplyAddressIsNeverDefaultedToTheFrom(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchoolWithoutEmail(ctx, t, f, "No Silent Default")
	stub := startSMTP(t, behaviour{})
	queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := fallbackSender(t, f, stub, "")
	if s.replyTo != "" {
		t.Fatalf("reply address = %q, want empty; defaulting it to the From recreates the silent loss "+
			"with an extra step", s.replyTo)
	}

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	for _, sent := range stub.delivered() {
		reply := headerOf(sent.data, "Reply-To")
		if reply == "" || strings.Contains(reply, "noreply@platform.example") {
			t.Fatalf("a message went out whose reply path is the platform From: Reply-To = %q", reply)
		}
	}
}

func TestAnUnusablePlatformReplyAddressIsIgnoredRatherThanTrusted(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchoolWithoutEmail(ctx, t, f, "Typo Reply")
	stub := startSMTP(t, behaviour{})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	s := fallbackSender(t, f, stub, "not an address")
	if s.replyTo != "" {
		t.Fatalf("reply address = %q, want empty when it does not parse", s.replyTo)
	}

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	if n := len(stub.delivered()); n != 0 {
		t.Fatalf("the server received %d messages carrying an unusable reply path", n)
	}
	got := reload(ctx, t, f, row.ID)
	if got.Status != outboxmessage.StatusRetrying {
		t.Fatalf("status = %s, want retrying", got.Status)
	}
	if got.FailureCode == nil || *got.FailureCode != outboxmessage.FailureCodeNoReplyAddress {
		t.Fatalf("failure_code = %v, want no_reply_address", got.FailureCode)
	}
}

func TestASchoolSendingAsItselfNeedsNoReplyAddress(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchoolWithoutEmail(ctx, t, f, "Own Server No Email")
	stub := startSMTP(t, behaviour{})
	row := queue(ctx, t, f, submitter(t, f), Message{SchoolID: &school.ID})

	own := stub.credentials()
	own.FromAddress = "office@ownserver.example.edu"
	s := sender(t, f, Options{
		InstanceID:       "own-server-sender",
		Profiles:         stubProfiles{school.ID: own},
		PlatformFromName: "Emerge",
	})

	s.Tick(ctx)
	settle(t, s, 15*time.Second)

	if got := reload(ctx, t, f, row.ID); got.Status != outboxmessage.StatusSent {
		t.Fatalf("status = %s, want sent: a school sending as itself already is the reply path", got.Status)
	}
	if replyTo := headerOf(stub.delivered()[0].data, "Reply-To"); replyTo != "" {
		t.Fatalf("Reply-To = %q, want none; the From is already the school", replyTo)
	}
}

func TestTheScanInterleavesWaitingAndAbandonedRowsOldestFirst(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Ordering")
	sub := submitter(t, f)

	base := time.Now().Add(-time.Hour)
	oldest := queue(ctx, t, f, sub, Message{SchoolID: &school.ID, NotBefore: base})
	middle := queue(ctx, t, f, sub, Message{SchoolID: &school.ID, NotBefore: base.Add(time.Minute)})
	newest := queue(ctx, t, f, sub, Message{SchoolID: &school.ID, NotBefore: base.Add(2 * time.Minute)})

	crashed := sender(t, f, Options{InstanceID: "crashed-sender", Profiles: stubProfiles{}})
	if won, err := crashed.claim(ctx, middle, time.Now()); err != nil || !won {
		t.Fatalf("claim = %v, %v; want the middle row leased", won, err)
	}
	if _, err := f.Client.OutboxMessage.UpdateOneID(middle.ID).
		SetLeaseExpiresAt(time.Now().Add(-time.Second)).Save(ctx); err != nil {
		t.Fatalf("could not lapse the lease: %v", err)
	}

	s := sender(t, f, Options{InstanceID: "ordering-sender", Profiles: stubProfiles{}})
	found, err := s.scan(ctx, time.Now())
	if err != nil {
		t.Fatalf("the scan failed: %v", err)
	}

	var got []uuid.UUID
	for _, row := range found {
		if row.ID == oldest.ID || row.ID == middle.ID || row.ID == newest.ID {
			got = append(got, row.ID)
		}
	}
	want := []uuid.UUID{oldest.ID, middle.ID, newest.ID}
	if len(got) != len(want) {
		t.Fatalf("the scan returned %d of the 3 fixture rows; a reclaimed row was dropped", len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("scan order = %v, want %v: a row abandoned by a crashed sender must queue by age, "+
				"not behind everything already waiting", got, want)
		}
	}
}

func TestTheScanUsesThePartialIndexesRatherThanReadingEveryRow(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	s := sender(t, f, Options{InstanceID: "plan-sender", Profiles: stubProfiles{}})
	f.forget()
	if _, err := s.scan(ctx, time.Now()); err != nil {
		t.Fatalf("the scan failed: %v", err)
	}

	var scans []statement
	for _, stmt := range f.rec.taken() {
		if stmt.kind == "query" && strings.Contains(stmt.query, `"outbox_messages"`) {
			scans = append(scans, stmt)
		}
	}
	if len(scans) != 2 {
		t.Fatalf("the scan issued %d statements, want 2: one aligned to each partial index", len(scans))
	}

	db := rawControl(t)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("could not begin the plan transaction: %v", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "SET LOCAL enable_seqscan = off"); err != nil {
		t.Fatalf("could not disable sequential scans: %v", err)
	}

	wants := []string{"outboxmessage_next_attempt_at", "outboxmessage_lease_expires_at"}
	for i, stmt := range scans {
		plan := explain(ctx, t, tx, stmt)
		if !strings.Contains(plan, wants[i]) {
			t.Fatalf("query %d does not use %s, so the outbox is read in full on every tick as it grows:\n%s",
				i+1, wants[i], plan)
		}
	}
}

func rawControl(t *testing.T) *sql.DB {
	t.Helper()

	repoEnv()
	dsn := strings.TrimSpace(os.Getenv(testsupport.ControlDSNEnv))
	if dsn == "" {
		t.Skip(testsupport.SkipMarker + ": " + testsupport.ControlDSNEnv + " is not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("could not open a second control connection: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func explain(ctx context.Context, t *testing.T, tx *sql.Tx, stmt statement) string {
	t.Helper()

	rows, err := tx.QueryContext(ctx, "EXPLAIN "+stmt.query, stmt.args...)
	if err != nil {
		t.Fatalf("could not explain the scan: %v", err)
	}
	defer rows.Close()

	var plan strings.Builder
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			t.Fatalf("could not read the plan: %v", err)
		}
		plan.WriteString(strings.TrimSpace(line))
		plan.WriteString("\n")
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("could not read the plan: %v", err)
	}
	return plan.String()
}

func TestStaleAfterIsTheWindowHealthyActuallyEnforces(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	for _, interval := range []time.Duration{time.Second, 10 * time.Second, time.Minute, time.Hour} {
		t.Run(interval.String(), func(t *testing.T) {
			at := time.Now()
			s := sender(t, f, Options{
				InstanceID: "stale-sender",
				Profiles:   stubProfiles{},
				Interval:   interval,
				Now:        func() time.Time { return at },
			})

			if got := s.StaleAfter(); got != 3*interval {
				t.Fatalf("StaleAfter() = %s, want %s for a %s tick", got, 3*interval, interval)
			}
			if s.Healthy(at) {
				t.Fatal("a sender that has never ticked reported itself healthy")
			}

			s.Tick(ctx)
			window := s.StaleAfter()

			if !s.Healthy(at.Add(window)) {
				t.Fatalf("a sender %s past its last tick is unhealthy, but StaleAfter() advertises %s; "+
					"the published window and the enforced one have drifted apart", window, window)
			}
			if s.Healthy(at.Add(window + time.Nanosecond)) {
				t.Fatalf("a sender past the %s it advertises still reports itself healthy; "+
					"the published window and the enforced one have drifted apart", window)
			}
		})
	}
}

func TestAnHourlySenderIsNotUnhealthyForTickingAnHourAgo(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	at := time.Now()
	s := sender(t, f, Options{
		InstanceID: "hourly-sender",
		Profiles:   stubProfiles{},
		Interval:   time.Hour,
		Now:        func() time.Time { return at },
	})
	s.Tick(ctx)

	if !s.Healthy(at.Add(4 * time.Minute)) {
		t.Fatal("an hourly sender was unhealthy four minutes after ticking; a health check that is " +
			"always red is one nobody reads")
	}
	if s.Healthy(at.Add(4 * time.Hour)) {
		t.Fatal("an hourly sender that has not ticked for four hours still reports itself healthy")
	}

	brisk := sender(t, f, Options{
		InstanceID: "brisk-sender",
		Profiles:   stubProfiles{},
		Interval:   10 * time.Second,
		Now:        func() time.Time { return at },
	})
	brisk.Tick(ctx)

	if brisk.Healthy(at.Add(4 * time.Minute)) {
		t.Fatal("a ten-second sender silent for four minutes reported itself healthy; the window " +
			"is not tracking the cadence")
	}
	if brisk.StaleAfter() >= s.StaleAfter() {
		t.Fatalf("a %s sender advertises a wider staleness window (%s) than an hourly one (%s)",
			brisk.opts.Interval, brisk.StaleAfter(), s.StaleAfter())
	}
}

func TestTheFixtureNamesTheStatementThatFailedNotTheOnesAfterIt(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	if _, ok := f.firstFault(); ok {
		t.Fatal("the fixture reported a failed statement before anything ran")
	}

	school := newSchool(ctx, t, f, "Blamed")
	_, err := f.Client.School.Create().
		SetName("A Different Name " + strings.ToUpper(uuid.NewString()[:8])).
		SetCode(school.Code).
		Save(ctx)
	if err == nil {
		t.Fatal("a duplicate school code was accepted, so nothing here failed to be blamed")
	}

	blamed, ok := f.firstFault()
	if !ok {
		t.Fatal("a statement failed and the fixture recorded nothing; a later transaction-aborted " +
			"error would be all anybody sees")
	}
	if !strings.Contains(blamed, "INSERT INTO") || !strings.Contains(blamed, "schools") {
		t.Fatalf("the blame does not name the statement: %s", blamed)
	}
	if !strings.Contains(blamed, "duplicate key value") {
		t.Fatalf("the blame does not carry the cause: %s", blamed)
	}
	if strings.Contains(blamed, "\n") {
		t.Fatalf("the blame spans lines and will be hard to grep out of a suite run: %q", blamed)
	}
}

func TestTwoSchoolsOnTheFallbackResolveTheirIdentitiesConcurrently(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	stub := startSMTP(t, behaviour{})
	sub := submitter(t, f)

	const schools = 6
	ids := make([]uuid.UUID, 0, schools)
	for i := 0; i < schools; i++ {
		school := newSchool(ctx, t, f, "Concurrent Fallback")
		ids = append(ids, school.ID)
		queue(ctx, t, f, sub, Message{SchoolID: &school.ID, NotBefore: time.Now().Add(-time.Hour)})
		queue(ctx, t, f, sub, Message{SchoolID: &school.ID, NotBefore: time.Now().Add(-time.Hour)})
	}

	platform := stub.credentials()
	platform.FromAddress = "noreply@platform.example"
	s := sender(t, f, Options{
		InstanceID:       "concurrent-identity-sender",
		Profiles:         stubProfiles{},
		Platform:         platform,
		PlatformFromName: "Emerge",
	})

	report := s.Tick(ctx)
	if report.Claimed != schools*2 {
		t.Fatalf("the tick claimed %d rows, want %d", report.Claimed, schools*2)
	}
	settle(t, s, 30*time.Second)

	if n := len(stub.delivered()); n != schools*2 {
		t.Fatalf("the server received %d messages, want %d", n, schools*2)
	}
	for _, id := range ids {
		n, err := f.Client.OutboxMessage.Query().
			Where(outboxmessage.SchoolID(id), outboxmessage.StatusEQ(outboxmessage.StatusSent)).
			Count(ctx)
		if err != nil {
			t.Fatalf("could not count sent rows for %s: %v", id, err)
		}
		if n != 2 {
			t.Fatalf("school %s has %d sent rows, want 2", id, n)
		}
	}
}
