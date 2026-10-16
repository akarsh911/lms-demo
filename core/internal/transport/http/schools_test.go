package http

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/school"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/schoolprofile"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

const unreachablePostgres = `{"host":"127.0.0.1","port":1,"database":"nowhere","user":"nobody","password":"hunter2-sentinel","sslmode":"disable"}`

func decodeProfileBody(t *testing.T, kind schoolprofile.ProfileType, body string) (int, string, any) {
	t.Helper()

	r := httptest.NewRequest(http.MethodPut, "/api/v1/schools/x/profiles/"+string(kind), strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	creds, ok := decodeCredentials(w, r, kind)
	if ok {
		return http.StatusOK, "", creds
	}
	return w.Code, w.Body.String(), nil
}

func TestDecodeCredentialsRejectsUnknownFields(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypePostgres, `{"foo":"bar"}`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 for a credential body of the wrong shape: %s", code, body)
	}
	if !strings.Contains(body, "foo") {
		t.Fatalf("the refusal should name the field it refused, got %s", body)
	}
}

func TestDecodeCredentialsRejectsATypoedKey(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypePostgres,
		`{"host":"h","database":"d","user":"u","passwrod":"p"}`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 so a typo is refused rather than silently dropped: %s", code, body)
	}
}

func TestDecodeCredentialsRejectsAWrongType(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypePostgres,
		`{"host":"h","database":"d","user":"u","port":"5432"}`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 when port is not a number: %s", code, body)
	}
}

func TestDecodeCredentialsRejectsMalformedJSONWithBadRequest(t *testing.T) {
	for _, body := range []string{`{"host":`, ``} {
		code, got, _ := decodeProfileBody(t, schoolprofile.ProfileTypePostgres, body)
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d for %q, want 400 for a body that is not JSON at all: %s", code, body, got)
		}
	}
}

func TestDecodeCredentialsNamesTheMissingFields(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypePostgres, `{"password":"p"}`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 when nothing identifies the database: %s", code, body)
	}
	for _, field := range []string{"host", "database", "user"} {
		if !strings.Contains(body, field) {
			t.Fatalf("the refusal should name %s, got %s", field, body)
		}
	}
}

func TestDecodeCredentialsAcceptsADSNOnlyProfile(t *testing.T) {
	code, body, creds := decodeProfileBody(t, schoolprofile.ProfileTypePostgres,
		`{"dsn":"postgres://u:p@localhost:5432/db?sslmode=disable"}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want the shape cmd/seed writes to keep working: %s", code, body)
	}
	if got := creds.(tenancy.PostgresCredentials).DSN; got == "" {
		t.Fatal("the dsn was dropped")
	}
}

func TestDecodeCredentialsAcceptsTheShapeTheCollectionSends(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypePostgres,
		`{"host":"localhost","port":5434,"database":"emerge_tenant_demo","user":"emerge","password":"emerge","sslmode":"disable"}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want the api collection and scripts/e2e.sh body to stay valid: %s", code, body)
	}
}

func TestDecodeCredentialsChecksTheS3Shape(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypeS3,
		`{"region":"ap-south-1","access_key_id":"k","secret_access_key":"s"}`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 when the bucket is missing: %s", code, body)
	}

	code, body, _ = decodeProfileBody(t, schoolprofile.ProfileTypeS3,
		`{"region":"ap-south-1","bucket":"b","access_key_id":"k","secret_access_key":"s"}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want complete s3 credentials to be accepted: %s", code, body)
	}
}

func TestDecodeCredentialsRefusesAnEmptySMTPProfile(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypeSMTP, `{}`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 for empty smtp credentials: %s", code, body)
	}
}

func TestReachableRefusesCredentialsThatDoNotConnect(t *testing.T) {
	w := httptest.NewRecorder()
	creds := tenancy.PostgresCredentials{
		Host: "127.0.0.1", Port: 1, Database: "nowhere", User: "nobody",
		Password: "hunter2-sentinel", SSLMode: "disable",
	}
	if reachable(context.Background(), w, creds) {
		t.Fatal("a port nothing listens on must not pass as reachable")
	}
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", w.Code)
	}
	if strings.Contains(w.Body.String(), "hunter2-sentinel") {
		t.Fatalf("the password was echoed back: %s", w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "unchanged") {
		t.Fatalf("the refusal should say the stored profile survived, got %s", w.Body.String())
	}
}

func TestScrubHidesEveryPasswordForm(t *testing.T) {
	cases := []string{
		scrub(`failed to connect to postgres://emerge:s3cret@host:5432/db`, "s3cret"),
		scrub(`cannot parse host=h user=u password=s3cret sslmode=require`, ""),
		scrub(`postgres://emerge:s3cret@host:5432/db`, ""),
	}
	for _, got := range cases {
		if strings.Contains(got, "s3cret") {
			t.Fatalf("scrub left the password in place: %s", got)
		}
	}
}

func profileServer(t *testing.T) (*Server, http.Handler, string) {
	t.Helper()

	ctx := context.Background()
	_ = testsupport.TenantTx(ctx, t)

	controlDSN := strings.TrimSpace(os.Getenv(testsupport.ControlDSNEnv))
	key := strings.TrimSpace(os.Getenv(testsupport.MasterKeyEnv))
	if controlDSN == "" || key == "" {
		t.Skip(testsupport.SkipMarker + ": storing credentials needs " + testsupport.ControlDSNEnv +
			" and " + testsupport.MasterKeyEnv + ", because the row is written to the control plane " +
			"and the connectivity check needs a database that really answers")
	}

	keyring, err := crypto.ParseKeyring(key)
	if err != nil {
		t.Fatalf("the master key did not parse: %v", err)
	}
	control, err := postgres.NewControl(ctx, controlDSN, postgres.Options{})
	if err != nil {
		t.Fatalf("the control plane was configured but unreachable: %v", err)
	}
	t.Cleanup(func() { _ = control.Close() })

	server := &Server{
		cfg:      &config.Config{Env: "test"},
		logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		control:  control,
		registry: postgres.NewRegistry(control, keyring, postgres.Options{}, postgres.Discard()),
	}

	router := chi.NewRouter()
	router.Put("/api/v1/schools/{id}/profiles/{type}", server.putSchoolProfile)
	return server, router, controlDSN
}

func throwawaySchool(t *testing.T, s *Server) uuid.UUID {
	t.Helper()

	ctx := context.Background()
	code := "TEST-PROFILE-" + strings.ToUpper(uuid.NewString()[:8])
	row, err := s.control.Client.School.Create().
		SetName("profile fixture " + code).
		SetCode(code).
		SetTimezone("Asia/Kolkata").
		SetCountry("IN").
		Save(ctx)
	if err != nil {
		t.Fatalf("the fixture school could not be created: %v", err)
	}
	t.Cleanup(func() {
		if _, err := s.control.Client.SchoolProfile.Delete().
			Where(schoolprofile.SchoolID(row.ID)).Exec(ctx); err != nil {
			t.Errorf("the fixture profiles leaked: %v", err)
		}
		if err := s.control.Client.School.DeleteOneID(row.ID).Exec(ctx); err != nil {
			t.Errorf("the fixture school leaked: %v", err)
		}
	})
	return row.ID
}

func putProfile(t *testing.T, router http.Handler, id, kind, body string) *httptest.ResponseRecorder {
	t.Helper()

	r := httptest.NewRequest(http.MethodPut, "/api/v1/schools/"+id+"/profiles/"+kind, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, r)
	return rec
}

func storedProfile(t *testing.T, s *Server, id uuid.UUID) *controlent.SchoolProfile {
	t.Helper()

	return storedProfileOf(t, s, id, schoolprofile.ProfileTypePostgres)
}

func storedProfileOf(t *testing.T, s *Server, id uuid.UUID, kind schoolprofile.ProfileType) *controlent.SchoolProfile {
	t.Helper()

	row, err := s.control.Client.SchoolProfile.Query().
		Where(schoolprofile.SchoolID(id), schoolprofile.ProfileTypeEQ(kind)).
		Only(context.Background())
	if err != nil {
		t.Fatalf("the profile could not be read back: %v", err)
	}
	return row
}

func TestPutSchoolProfileUnknownSchoolIsNotFound(t *testing.T) {
	_, router, dsn := profileServer(t)

	rec := putProfile(t, router, uuid.NewString(), "postgres", `{"dsn":`+quote(dsn)+`}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; an unknown school used to surface as a foreign key 500: %s",
			rec.Code, rec.Body.String())
	}
}

func TestPutSchoolProfileMalformedJSONIsBadRequest(t *testing.T) {
	s, router, _ := profileServer(t)
	id := throwawaySchool(t, s)

	rec := putProfile(t, router, id.String(), "postgres", `{"host":`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400: %s", rec.Code, rec.Body.String())
	}
	if n, err := s.control.Client.SchoolProfile.Query().
		Where(schoolprofile.SchoolID(id)).Count(context.Background()); err != nil || n != 0 {
		t.Fatalf("rows = %d (err %v), want nothing written for a malformed body", n, err)
	}
}

func TestPutSchoolProfileWrongShapeWritesNothing(t *testing.T) {
	s, router, _ := profileServer(t)
	id := throwawaySchool(t, s)

	rec := putProfile(t, router, id.String(), "postgres", `{"foo":"bar"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", rec.Code, rec.Body.String())
	}
	if n, err := s.control.Client.SchoolProfile.Query().
		Where(schoolprofile.SchoolID(id)).Count(context.Background()); err != nil || n != 0 {
		t.Fatalf("rows = %d (err %v), want arbitrary JSON to store nothing", n, err)
	}
}

func TestPutSchoolProfileKeepsTheWorkingProfileWhenTheNewOneCannotConnect(t *testing.T) {
	s, router, dsn := profileServer(t)
	id := throwawaySchool(t, s)

	if rec := putProfile(t, router, id.String(), "postgres", `{"dsn":`+quote(dsn)+`}`); rec.Code != http.StatusOK {
		t.Fatalf("the working credentials were refused: %d %s", rec.Code, rec.Body.String())
	}
	before := storedProfile(t, s, id)

	rec := putProfile(t, router, id.String(), "postgres", unreachablePostgres)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 for credentials that parse but do not connect: %s",
			rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "hunter2-sentinel") {
		t.Fatalf("the password came back in the refusal: %s", rec.Body.String())
	}

	after := storedProfile(t, s, id)
	if !bytes.Equal(before.Ciphertext, after.Ciphertext) || !bytes.Equal(before.Nonce, after.Nonce) {
		t.Fatal("the refused write replaced the credentials that were working")
	}
	if _, err := s.registry.PostgresCredentials(context.Background(), id); err != nil {
		t.Fatalf("the stored credentials no longer decode: %v", err)
	}
}

func TestPutSchoolProfileRotatesCredentials(t *testing.T) {
	s, router, dsn := profileServer(t)
	id := throwawaySchool(t, s)

	if rec := putProfile(t, router, id.String(), "postgres", `{"dsn":`+quote(dsn)+`}`); rec.Code != http.StatusOK {
		t.Fatalf("the first write was refused: %d %s", rec.Code, rec.Body.String())
	}
	before := storedProfile(t, s, id)

	rec := putProfile(t, router, id.String(), "postgres", `{"dsn":`+quote(dsn)+`,"sslmode":"disable"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("rotation was refused: %d %s", rec.Code, rec.Body.String())
	}

	after := storedProfile(t, s, id)
	if bytes.Equal(before.Ciphertext, after.Ciphertext) {
		t.Fatal("rotation left the old ciphertext in place")
	}
	creds, err := s.registry.PostgresCredentials(context.Background(), id)
	if err != nil {
		t.Fatalf("the rotated credentials do not decode: %v", err)
	}
	if creds.SSLMode != "disable" {
		t.Fatalf("sslmode = %q, want the rotated value", creds.SSLMode)
	}
}

func TestPutSchoolProfileNeverEchoesThePassword(t *testing.T) {
	s, router, _ := profileServer(t)
	id := throwawaySchool(t, s)

	bodies := []string{
		unreachablePostgres,
		`{"host":"127.0.0.1","port":1,"database":"d","user":"u","password":"hunter2-sentinel","nope":1}`,
		`{"password":"hunter2-sentinel"}`,
	}
	for _, body := range bodies {
		rec := putProfile(t, router, id.String(), "postgres", body)
		if rec.Code < 400 {
			t.Fatalf("status = %d, want a refusal for %s", rec.Code, body)
		}
		if strings.Contains(rec.Body.String(), "hunter2-sentinel") {
			t.Fatalf("the password leaked into the response: %s", rec.Body.String())
		}
	}
}

func quote(v string) string {
	out, err := json.Marshal(v)
	if err != nil {
		return `""`
	}
	return string(out)
}

const smtpSentinel = "smtp-sentinel-pw"

type smtpStub struct {
	listener   net.Listener
	mechanisms string
	accept     bool
}

func startSMTPStub(t *testing.T, mechanisms string, accept bool) *smtpStub {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("%s: this test needs to bind a loopback port and could not: %v", testsupport.SkipMarker, err)
	}
	stub := &smtpStub{listener: listener, mechanisms: mechanisms, accept: accept}
	go stub.serve()
	t.Cleanup(func() { _ = listener.Close() })
	return stub
}

func (s *smtpStub) port() int {
	return s.listener.Addr().(*net.TCPAddr).Port
}

func (s *smtpStub) serve() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			return
		}
		go s.session(conn)
	}
}

func (s *smtpStub) session(conn net.Conn) {
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
	challenge := func(prompt string) string {
		write("334 " + base64.StdEncoding.EncodeToString([]byte(prompt)))
		answer, _ := read()
		return answer
	}

	write("220 stub.smtp.test ESMTP")
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
			if s.mechanisms == "" {
				write("250-stub.smtp.test", "250 SIZE 10240000")
				continue
			}
			write("250-stub.smtp.test", "250 AUTH "+s.mechanisms)
		case "HELO":
			write("250 stub.smtp.test")
		case "AUTH":
			payload := ""
			if len(fields) > 2 {
				payload = fields[2]
			}
			if len(fields) > 1 && strings.EqualFold(fields[1], "LOGIN") {
				challenge("Username:")
				payload = challenge("Password:")
			}
			if s.accept {
				write("235 2.7.0 Authentication succeeded")
				continue
			}
			write("535 5.7.8 authentication failed, the server read back " + payload)
		case "QUIT":
			write("221 2.0.0 Bye")
			return
		default:
			write("502 5.5.2 Command unrecognized: " + line)
		}
	}
}

func (s *smtpStub) credentials() tenancy.SMTPCredentials {
	return tenancy.SMTPCredentials{
		Host:        "127.0.0.1",
		Port:        s.port(),
		Username:    "office@example.edu",
		Password:    smtpSentinel,
		Encryption:  tenancy.SMTPNone,
		FromAddress: "noreply@example.edu",
		FromName:    "Example School",
	}
}

func (s *smtpStub) body(password string) string {
	creds := s.credentials()
	creds.Password = password
	out, err := json.Marshal(creds)
	if err != nil {
		return "{}"
	}
	return string(out)
}

func TestDecodeCredentialsNamesTheMissingSMTPFields(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypeSMTP, `{"port":587}`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 when nothing identifies the mail server: %s", code, body)
	}
	for _, field := range []string{"host", "username", "password", "from_address"} {
		if !strings.Contains(body, field) {
			t.Fatalf("the refusal should name %s, got %s", field, body)
		}
	}
}

func TestDecodeCredentialsRejectsUnknownSMTPFields(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypeSMTP,
		`{"host":"mail.example.edu","username":"u","password":"p","from_address":"a@example.edu","tls":true}`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 so a stray key is refused rather than stored: %s", code, body)
	}
	if !strings.Contains(body, "tls") {
		t.Fatalf("the refusal should name the field it refused, got %s", body)
	}
}

func TestDecodeCredentialsRejectsAnUnknownSMTPEncryption(t *testing.T) {
	code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypeSMTP,
		`{"host":"mail.example.edu","username":"u","password":"p","from_address":"a@example.edu","encryption":"ssl"}`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 for an encryption mode nothing implements: %s", code, body)
	}
	for _, mode := range []string{"starttls", "tls", "none"} {
		if !strings.Contains(body, mode) {
			t.Fatalf("the refusal should list %s, got %s", mode, body)
		}
	}
}

func TestDecodeCredentialsChecksTheSMTPSenderIdentity(t *testing.T) {
	cases := []string{
		`{"host":"mail.example.edu","username":"u","password":"p","from_address":"not an address"}`,
		`{"host":"mail.example.edu","username":"u","password":"p","from_address":"Example School <a@example.edu>"}`,
		`{"host":"mail.example.edu","username":"u","password":"p","from_address":"a@example.edu","envelope_from":"nope"}`,
	}
	for _, sent := range cases {
		code, body, _ := decodeProfileBody(t, schoolprofile.ProfileTypeSMTP, sent)
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d for %s, want 422 so mail cannot be sent from an unusable address: %s",
				code, sent, body)
		}
	}
}

func TestDecodeCredentialsAcceptsACompleteSMTPProfile(t *testing.T) {
	code, body, creds := decodeProfileBody(t, schoolprofile.ProfileTypeSMTP,
		`{"host":"mail.example.edu","port":587,"username":"office@example.edu","password":"p",`+
			`"encryption":"starttls","from_address":"noreply@example.edu","from_name":"Example School"}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want a complete smtp profile to be accepted: %s", code, body)
	}
	got := creds.(tenancy.SMTPCredentials)
	if got.FromName != "Example School" || got.FromAddress != "noreply@example.edu" {
		t.Fatalf("the sender identity was dropped: %+v", got)
	}
	if mode, err := got.Security(); err != nil || mode != tenancy.SMTPStartTLS {
		t.Fatalf("security = %q (err %v), want starttls", mode, err)
	}
	if got.Sender() != "noreply@example.edu" {
		t.Fatalf("sender = %q, want the from address when no envelope sender is set", got.Sender())
	}
}

func TestSMTPCredentialsStringRedactsThePassword(t *testing.T) {
	creds := tenancy.SMTPCredentials{
		Host: "mail.example.edu", Username: "office@example.edu",
		Password: smtpSentinel, FromAddress: "noreply@example.edu",
	}
	got := creds.String()
	if strings.Contains(got, smtpSentinel) {
		t.Fatalf("String() printed the password: %s", got)
	}
	if !strings.Contains(got, "587") {
		t.Fatalf("String() should name the port it would really use, got %s", got)
	}
}

func TestReachableAcceptsSMTPCredentialsThatAuthenticate(t *testing.T) {
	for _, mechanisms := range []string{"PLAIN LOGIN", "LOGIN"} {
		stub := startSMTPStub(t, mechanisms, true)
		w := httptest.NewRecorder()
		if !reachable(context.Background(), w, stub.credentials()) {
			t.Fatalf("credentials the server accepted over %s were refused: %s", mechanisms, w.Body.String())
		}
	}
}

func TestReachableRefusesSMTPCredentialsThatDoNotAuthenticate(t *testing.T) {
	for _, mechanisms := range []string{"PLAIN LOGIN", "LOGIN"} {
		stub := startSMTPStub(t, mechanisms, false)
		w := httptest.NewRecorder()
		if reachable(context.Background(), w, stub.credentials()) {
			t.Fatalf("a password the server rejected over %s passed the check", mechanisms)
		}
		if w.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422", w.Code)
		}
		body := w.Body.String()
		if strings.Contains(body, smtpSentinel) {
			t.Fatalf("the password was echoed back: %s", body)
		}
		for _, encoded := range []string{
			base64.StdEncoding.EncodeToString([]byte(smtpSentinel)),
			base64.StdEncoding.EncodeToString([]byte("\x00office@example.edu\x00" + smtpSentinel)),
		} {
			if strings.Contains(body, encoded) {
				t.Fatalf("the password came back base64 encoded: %s", body)
			}
		}
		if !strings.Contains(body, "unchanged") {
			t.Fatalf("the refusal should say the stored profile survived, got %s", body)
		}
	}
}

func TestReachableRefusesSMTPWhenTheServerOffersNoAuth(t *testing.T) {
	stub := startSMTPStub(t, "", true)
	w := httptest.NewRecorder()
	if reachable(context.Background(), w, stub.credentials()) {
		t.Fatal("a server that never checked the password must not pass as verified")
	}
	if !strings.Contains(w.Body.String(), "AUTH") {
		t.Fatalf("the refusal should say why it could not verify, got %s", w.Body.String())
	}
}

func TestReachableRefusesSMTPWhenNothingListens(t *testing.T) {
	stub := startSMTPStub(t, "PLAIN", true)
	creds := stub.credentials()
	_ = stub.listener.Close()

	w := httptest.NewRecorder()
	if reachable(context.Background(), w, creds) {
		t.Fatal("a port nothing listens on must not pass as reachable")
	}
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", w.Code, w.Body.String())
	}
}

func TestReachableRefusesUnencryptedSMTPOffHost(t *testing.T) {
	creds := tenancy.SMTPCredentials{
		Host: "mail.example.invalid", Port: 25, Username: "u", Password: smtpSentinel,
		Encryption: tenancy.SMTPNone, FromAddress: "a@example.edu",
	}
	w := httptest.NewRecorder()
	if reachable(context.Background(), w, creds) {
		t.Fatal("a password may not be sent across the network in the clear")
	}
	if !strings.Contains(w.Body.String(), "starttls") {
		t.Fatalf("the refusal should say what to set instead, got %s", w.Body.String())
	}
}

func TestPutSchoolProfileKeepsTheWorkingSMTPProfileWhenTheNewOneCannotAuthenticate(t *testing.T) {
	s, router, _ := profileServer(t)
	id := throwawaySchool(t, s)
	stub := startSMTPStub(t, "PLAIN LOGIN", true)

	if rec := putProfile(t, router, id.String(), "smtp", stub.body(smtpSentinel)); rec.Code != http.StatusOK {
		t.Fatalf("the working smtp credentials were refused: %d %s", rec.Code, rec.Body.String())
	}
	before := storedProfileOf(t, s, id, schoolprofile.ProfileTypeSMTP)

	stub.accept = false
	rec := putProfile(t, router, id.String(), "smtp", stub.body(smtpSentinel))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 for credentials that parse but do not authenticate: %s",
			rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), smtpSentinel) {
		t.Fatalf("the password came back in the refusal: %s", rec.Body.String())
	}

	after := storedProfileOf(t, s, id, schoolprofile.ProfileTypeSMTP)
	if !bytes.Equal(before.Ciphertext, after.Ciphertext) || !bytes.Equal(before.Nonce, after.Nonce) {
		t.Fatal("the refused write replaced the mail credentials that were working")
	}
}

func addressingServer(t *testing.T) (*Server, http.Handler) {
	t.Helper()

	server, _, _ := profileServer(t)
	router := chi.NewRouter()
	router.Post("/api/v1/schools", server.createSchool)
	router.Patch("/api/v1/schools/{id}", server.updateSchool)
	return server, router
}

func postSchool(t *testing.T, router http.Handler, body string) *httptest.ResponseRecorder {
	t.Helper()

	r := httptest.NewRequest(http.MethodPost, "/api/v1/schools", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, r)
	return rec
}

func patchSchool(t *testing.T, router http.Handler, id, body string) *httptest.ResponseRecorder {
	t.Helper()

	r := httptest.NewRequest(http.MethodPatch, "/api/v1/schools/"+id, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, r)
	return rec
}

func createdSchool(t *testing.T, s *Server, rec *httptest.ResponseRecorder) uuid.UUID {
	t.Helper()

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		School struct {
			ID uuid.UUID `json:"id"`
		} `json:"school"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the create response did not decode: %v (%s)", err, rec.Body.String())
	}
	dropSchool(t, s, body.School.ID)
	return body.School.ID
}

func dropSchool(t *testing.T, s *Server, id uuid.UUID) {
	t.Helper()

	t.Cleanup(func() {
		ctx := context.Background()
		if _, err := s.control.Client.SchoolProfile.Delete().
			Where(schoolprofile.SchoolID(id)).Exec(ctx); err != nil {
			t.Errorf("the fixture profiles leaked: %v", err)
		}
		if err := s.control.Client.School.DeleteOneID(id).Exec(ctx); err != nil && !controlent.IsNotFound(err) {
			t.Errorf("the fixture school leaked: %v", err)
		}
	})
}

func addressingTag(t *testing.T) string {
	t.Helper()

	return strings.ToLower(uuid.NewString()[:8])
}

func TestCreateSchoolRefusesASlugThatIsAlreadyAnotherSchoolsCode(t *testing.T) {
	s, router := addressingServer(t)
	tag := addressingTag(t)
	code := "COLL-" + strings.ToUpper(tag)

	createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing first `+tag+`","code":`+quote(code)+`}`))

	rec := postSchool(t, router,
		`{"name":"addressing second `+tag+`","code":"OTHER-`+strings.ToUpper(tag)+`","cas_tenant_id":`+
			quote(strings.ToLower(code))+`}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; a slug equal to a live school code is addressed by X-School-Id as that code: %s",
			rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "cas_tenant_id") {
		t.Fatalf("the refusal should name the field it refused, got %s", rec.Body.String())
	}
	if n, err := s.control.Client.School.Query().
		Where(school.CodeEQ("OTHER-" + strings.ToUpper(tag))).Count(context.Background()); err != nil || n != 0 {
		t.Fatalf("rows = %d (err %v), want the refused school never written", n, err)
	}
}

func TestCreateSchoolRefusesACodeThatIsAlreadyAnotherSchoolsSlug(t *testing.T) {
	s, router := addressingServer(t)
	tag := addressingTag(t)
	slug := "coll-" + tag

	createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing holder `+tag+`","code":"HOLD-`+strings.ToUpper(tag)+`","cas_tenant_id":`+quote(slug)+`}`))

	rec := postSchool(t, router,
		`{"name":"addressing taker `+tag+`","code":`+quote(slug)+`}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; a code equal to a live slug would shadow that slug: %s",
			rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "code") {
		t.Fatalf("the refusal should name the field it refused, got %s", rec.Body.String())
	}
}

func TestCreateSchoolRefusesACaseFoldedCollision(t *testing.T) {
	s, router := addressingServer(t)
	tag := addressingTag(t)
	code := "12345" + tag

	createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing digits `+tag+`","code":`+quote(code)+`}`))

	rec := postSchool(t, router,
		`{"name":"addressing digits two `+tag+`","code":"D2-`+strings.ToUpper(tag)+`","cas_tenant_id":`+
			quote(code)+`}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; a letter-free code equals its own uppercase, so it is a valid slug too: %s",
			rec.Code, rec.Body.String())
	}
}

func TestCreateSchoolTreatsAnUnderscoreAsALetterNotAWildcard(t *testing.T) {
	s, router := addressingServer(t)
	tag := addressingTag(t)

	createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing wildcard `+tag+`","code":"AXB`+strings.ToUpper(tag)+`"}`))

	createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing wildcard two `+tag+`","code":"WC-`+strings.ToUpper(tag)+`","cas_tenant_id":`+
			quote("a_b"+tag)+`}`))
}

func TestCreateSchoolAllowsASchoolWhoseOwnCodeAndSlugAgree(t *testing.T) {
	s, router := addressingServer(t)
	tag := addressingTag(t)
	slug := "same-" + tag

	createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing self `+tag+`","code":`+quote(slug)+`,"cas_tenant_id":`+quote(slug)+`}`))
}

func TestCreateSchoolRefusesASlugThatIsNotASlug(t *testing.T) {
	_, router := addressingServer(t)
	tag := addressingTag(t)

	for _, bad := range []string{"DPS-NGP", "-leading", "with space", "", "hä", strings.Repeat("a", 64)} {
		rec := postSchool(t, router,
			`{"name":"addressing shape `+tag+`","code":"SHAPE-`+strings.ToUpper(tag)+`","cas_tenant_id":`+quote(bad)+`}`)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d for cas_tenant_id %q, want 400; the documented shape is the one CAS accepts: %s",
				rec.Code, bad, rec.Body.String())
		}
	}
}

func TestUpdateSchoolRefusesASlugThatIsAlreadyAnotherSchoolsCode(t *testing.T) {
	s, router := addressingServer(t)
	tag := addressingTag(t)
	code := "UCOLL-" + strings.ToUpper(tag)

	createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing update first `+tag+`","code":`+quote(code)+`}`))
	id := createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing update second `+tag+`","code":"UOTHER-`+strings.ToUpper(tag)+`"}`))

	rec := patchSchool(t, router, id.String(), `{"cas_tenant_id":`+quote(strings.ToLower(code))+`}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; PATCH is the other way this collision is created: %s",
			rec.Code, rec.Body.String())
	}

	row, err := s.control.Client.School.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("the school could not be read back: %v", err)
	}
	if row.CasTenantID != nil {
		t.Fatalf("cas_tenant_id = %q, want the refused value never written", *row.CasTenantID)
	}
}

func TestUpdateSchoolAllowsASchoolToKeepItsOwnSlug(t *testing.T) {
	s, router := addressingServer(t)
	tag := addressingTag(t)
	slug := "keep-" + tag

	id := createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing keep `+tag+`","code":"KEEP-`+strings.ToUpper(tag)+`","cas_tenant_id":`+quote(slug)+`}`))

	if rec := patchSchool(t, router, id.String(), `{"cas_tenant_id":`+quote(slug)+`}`); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; a school must stay saveable with the slug it already holds: %s",
			rec.Code, rec.Body.String())
	}
	if rec := patchSchool(t, router, id.String(), `{"city":"Nagpur"}`); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; an unrelated PATCH must not re-validate the stored slug: %s",
			rec.Code, rec.Body.String())
	}
}

func TestUpdateSchoolRefusesASlugThatIsNotASlug(t *testing.T) {
	s, router := addressingServer(t)
	tag := addressingTag(t)

	id := createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing update shape `+tag+`","code":"USHAPE-`+strings.ToUpper(tag)+`"}`))

	rec := patchSchool(t, router, id.String(), `{"cas_tenant_id":"NOT A SLUG"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateSchoolTrimsTheSlug(t *testing.T) {
	s, router := addressingServer(t)
	tag := addressingTag(t)
	slug := "trim-" + tag

	id := createdSchool(t, s, postSchool(t, router,
		`{"name":"addressing trim `+tag+`","code":"TRIM-`+strings.ToUpper(tag)+`","cas_tenant_id":`+
			quote("  "+slug+"  ")+`}`))

	row, err := s.control.Client.School.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("the school could not be read back: %v", err)
	}
	if row.CasTenantID == nil || *row.CasTenantID != slug {
		t.Fatalf("cas_tenant_id = %v, want %q stored without the surrounding blanks", row.CasTenantID, slug)
	}
}
