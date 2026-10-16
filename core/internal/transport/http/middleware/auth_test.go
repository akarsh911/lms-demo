package middleware

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
)

const (
	testIssuer   = "https://cas.test/issuer"
	testAudience = "emerge-core-test"
)

type spy struct {
	reached atomic.Bool
	ctx     context.Context
}

func (s *spy) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.reached.Store(true)
		s.ctx = r.Context()
		w.WriteHeader(http.StatusTeapot)
	})
}

func (s *spy) mustReach(t *testing.T) context.Context {
	t.Helper()
	if !s.reached.Load() {
		t.Fatal("the next handler was never reached")
	}
	return s.ctx
}

func (s *spy) mustNotReach(t *testing.T) {
	t.Helper()
	if s.reached.Load() {
		t.Fatal("the next handler ran even though the middleware should have refused")
	}
}

type stubGuard struct {
	decision authorization.Decision
	err      error

	calls   atomic.Int32
	entity  authorization.Entity
	subject *authorization.Subject
	attrs   authorization.Attributes
	asked   context.Context
}

func (g *stubGuard) Allow(ctx context.Context, sub *authorization.Subject, entity authorization.Entity, attrs authorization.Attributes) (authorization.Decision, error) {
	g.calls.Add(1)
	g.asked = ctx
	g.subject = sub
	g.entity = entity
	g.attrs = attrs
	return g.decision, g.err
}

func (g *stubGuard) Name() string { return "stub" }

func quiet() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

type fakeCAS struct {
	server  *httptest.Server
	key     *rsa.PrivateKey
	other   *rsa.PrivateKey
	kid     string
	broken  atomic.Bool
	fetches atomic.Int32
}

func newFakeCAS(t *testing.T) *fakeCAS {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("could not generate the signing key: %v", err)
	}
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("could not generate the impostor key: %v", err)
	}

	c := &fakeCAS{key: key, other: other, kid: "kid-" + uuid.NewString()[:8]}
	c.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c.fetches.Add(1)
		if r.URL.Path != "/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		if c.broken.Load() {
			http.Error(w, "jwks is down", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{{
				"kid": c.kid,
				"kty": "RSA",
				"alg": "RS256",
				"use": "sig",
				"n":   base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes()),
			}},
		})
	}))
	t.Cleanup(c.server.Close)
	return c
}

func (c *fakeCAS) verifier(t *testing.T) *cas.Verifier {
	t.Helper()

	v, err := cas.NewVerifier(cas.Config{
		BaseURL:    c.server.URL,
		Issuer:     testIssuer,
		Audience:   testAudience,
		JWKSTTL:    time.Minute,
		HTTPClient: c.server.Client(),
	})
	if err != nil {
		t.Fatalf("the verifier would not build: %v", err)
	}
	return v
}

func (c *fakeCAS) claims() jwt.MapClaims {
	return jwt.MapClaims{
		"sub":       uuid.NewString(),
		"iss":       testIssuer,
		"aud":       testAudience,
		"exp":       time.Now().Add(time.Hour).Unix(),
		"iat":       time.Now().Add(-time.Minute).Unix(),
		"sid":       "session-" + uuid.NewString()[:8],
		"tenant_id": "acme-school",
		"client_id": "emerge-web",
		"scope":     "core.read core.write",
	}
}

func (c *fakeCAS) sign(t *testing.T, claims jwt.MapClaims, opts ...func(*jwt.Token)) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = c.kid
	key := c.key
	for _, opt := range opts {
		opt(token)
	}
	if _, impostor := token.Header["impostor"]; impostor {
		key = c.other
		delete(token.Header, "impostor")
	}

	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("the token would not sign: %v", err)
	}
	return signed
}

func run(h http.Handler, header string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/anything", nil)
	if header != "" {
		req.Header.Set("Authorization", header)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestAuthenticateRefusesAMissingAuthorizationHeader(t *testing.T) {
	c := newFakeCAS(t)
	next := &spy{}

	rec := run(Authenticate(c.verifier(t), quiet())(next.handler()), "")

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("a request with no Authorization header got %d, wanted %d", rec.Code, http.StatusUnauthorized)
	}
	next.mustNotReach(t)
	if !strings.Contains(rec.Body.String(), "Authorization bearer token is required") {
		t.Fatalf("the refusal did not say what was missing: %s", rec.Body.String())
	}
	if c.fetches.Load() != 0 {
		t.Fatal("the verifier reached for JWKS on a request that carried no token at all")
	}
}

func TestAuthenticateRefusesEveryTokenTheVerifierWillNotAccept(t *testing.T) {
	c := newFakeCAS(t)

	cases := []struct {
		name   string
		header func(t *testing.T) string
	}{
		{"the scheme with no token behind it", func(*testing.T) string { return "Bearer " }},
		{"the bare scheme", func(*testing.T) string { return "Bearer" }},
		{"a value that is not a JWT at all", func(*testing.T) string { return "Bearer not-a-jwt" }},
		{"three dot separated segments of rubbish", func(*testing.T) string { return "Bearer aaa.bbb.ccc" }},
		{"a token signed by a key CAS never published", func(t *testing.T) string {
			return "Bearer " + c.sign(t, c.claims(), func(tok *jwt.Token) { tok.Header["impostor"] = true })
		}},
		{"a token whose kid is in no key set", func(t *testing.T) string {
			return "Bearer " + c.sign(t, c.claims(), func(tok *jwt.Token) { tok.Header["kid"] = "kid-nobody-has" })
		}},
		{"a token with no kid header", func(t *testing.T) string {
			return "Bearer " + c.sign(t, c.claims(), func(tok *jwt.Token) { delete(tok.Header, "kid") })
		}},
		{"an expired token", func(t *testing.T) string {
			claims := c.claims()
			claims["exp"] = time.Now().Add(-time.Minute).Unix()
			return "Bearer " + c.sign(t, claims)
		}},
		{"a token with no expiry", func(t *testing.T) string {
			claims := c.claims()
			delete(claims, "exp")
			return "Bearer " + c.sign(t, claims)
		}},
		{"a token minted by another issuer", func(t *testing.T) string {
			claims := c.claims()
			claims["iss"] = "https://cas.evil/issuer"
			return "Bearer " + c.sign(t, claims)
		}},
		{"a token minted for another audience", func(t *testing.T) string {
			claims := c.claims()
			claims["aud"] = "some-other-service"
			return "Bearer " + c.sign(t, claims)
		}},
		{"a token whose subject is not a UUID", func(t *testing.T) string {
			claims := c.claims()
			claims["sub"] = "alice"
			return "Bearer " + c.sign(t, claims)
		}},
		{"a token with no subject", func(t *testing.T) string {
			claims := c.claims()
			delete(claims, "sub")
			return "Bearer " + c.sign(t, claims)
		}},
		{"an unsigned token that claims alg none", func(t *testing.T) string {
			claims := c.claims()
			tok := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
			tok.Header["kid"] = c.kid
			signed, err := tok.SignedString(jwt.UnsafeAllowNoneSignatureType)
			if err != nil {
				t.Fatalf("the alg=none token would not encode: %v", err)
			}
			return "Bearer " + signed
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			next := &spy{}
			rec := run(Authenticate(c.verifier(t), quiet())(next.handler()), tc.header(t))

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("got %d, wanted %d: %s", rec.Code, http.StatusUnauthorized, rec.Body.String())
			}
			next.mustNotReach(t)
		})
	}
}

func TestAuthenticateAcceptsAValidTokenAndCarriesTheSubjectForward(t *testing.T) {
	c := newFakeCAS(t)
	next := &spy{}
	claims := c.claims()
	raw := c.sign(t, claims)

	rec := run(Authenticate(c.verifier(t), quiet())(next.handler()), "Bearer "+raw)

	if rec.Code != http.StatusTeapot {
		t.Fatalf("a valid token got %d, wanted the handler's %d: %s", rec.Code, http.StatusTeapot, rec.Body.String())
	}
	subject, err := authorization.SubjectFrom(next.mustReach(t))
	if err != nil {
		t.Fatalf("a valid token left no subject in the context: %v", err)
	}
	if subject.CASUserID.String() != claims["sub"] {
		t.Fatalf("the subject carried cas user %s, wanted %s", subject.CASUserID, claims["sub"])
	}
	if subject.SessionID != claims["sid"] {
		t.Fatalf("the subject carried session %q, wanted %q", subject.SessionID, claims["sid"])
	}
	if subject.TenantID != "acme-school" {
		t.Fatalf("the subject carried tenant %q, wanted %q", subject.TenantID, "acme-school")
	}
	if subject.ClientID != "emerge-web" {
		t.Fatalf("the subject carried client %q, wanted %q", subject.ClientID, "emerge-web")
	}
	if strings.Join(subject.Scopes, " ") != "core.read core.write" {
		t.Fatalf("the subject carried scopes %v", subject.Scopes)
	}
	if subject.RawToken != raw {
		t.Fatal("the subject did not carry the raw token forward for downstream CAS calls")
	}
}

func TestAuthenticateAcceptsATokenSentWithNoBearerScheme(t *testing.T) {
	c := newFakeCAS(t)
	next := &spy{}

	rec := run(Authenticate(c.verifier(t), quiet())(next.handler()), c.sign(t, c.claims()))

	if rec.Code != http.StatusTeapot {
		t.Fatalf("a schemeless Authorization value got %d; if it is now refused that is a "+
			"deliberate behaviour change and this test should be updated: %s", rec.Code, rec.Body.String())
	}
	next.mustReach(t)
}

func TestAuthenticateRefusesALowercaseBearerScheme(t *testing.T) {
	c := newFakeCAS(t)
	next := &spy{}

	rec := run(Authenticate(c.verifier(t), quiet())(next.handler()), "bearer "+c.sign(t, c.claims()))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("a lowercase scheme got %d, wanted %d", rec.Code, http.StatusUnauthorized)
	}
	next.mustNotReach(t)
}

func TestAuthenticateNeverReportsAJWKSOutageAsAnInvalidToken(t *testing.T) {
	c := newFakeCAS(t)
	next := &spy{}
	raw := c.sign(t, c.claims())
	c.broken.Store(true)

	rec := run(Authenticate(c.verifier(t), quiet())(next.handler()), "Bearer "+raw)

	if rec.Code == http.StatusUnauthorized {
		t.Fatalf("a perfectly good token got %d because CAS was down; a verification that could "+
			"not be COMPLETED is not a verification that FAILED, and the client's correct answer "+
			"to a 401 is to discard the token and re-authenticate, so a CAS blip would log every "+
			"user out: %s", rec.Code, rec.Body.String())
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("a JWKS outage got %d, wanted %d: %s",
			rec.Code, http.StatusServiceUnavailable, rec.Body.String())
	}
	next.mustNotReach(t)
	if !strings.Contains(rec.Body.String(), "identity service unavailable") {
		t.Fatalf("the outage did not say so: %s", rec.Body.String())
	}
}

func TestAuthenticateStillRefusesABadTokenWhileJWKSIsReachable(t *testing.T) {
	c := newFakeCAS(t)
	next := &spy{}

	rec := run(Authenticate(c.verifier(t), quiet())(next.handler()),
		"Bearer "+c.sign(t, c.claims(), func(tok *jwt.Token) { tok.Header["kid"] = "kid-nobody-has" }))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("a token whose kid CAS never published got %d, wanted %d; only a failure to "+
			"REACH CAS may be reported as an outage, otherwise the outage status becomes the new "+
			"place bad tokens hide: %s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
	next.mustNotReach(t)
}

func TestAuthenticateAcceptsATokenThatNamesNoTenant(t *testing.T) {
	c := newFakeCAS(t)
	next := &spy{}
	claims := c.claims()
	delete(claims, "tenant_id")

	rec := run(Authenticate(c.verifier(t), quiet())(next.handler()), "Bearer "+c.sign(t, claims))

	if rec.Code != http.StatusTeapot {
		t.Fatalf("a token with no tenant_id claim got %d: %s", rec.Code, rec.Body.String())
	}
	subject, err := authorization.SubjectFrom(next.mustReach(t))
	if err != nil {
		t.Fatalf("no subject reached the handler: %v", err)
	}
	if subject.TenantID != "" {
		t.Fatalf("a token with no tenant_id claim produced tenant %q", subject.TenantID)
	}
}

func TestDevSubjectProducesASubjectThatNamesNoTenant(t *testing.T) {
	next := &spy{}

	rec := run(DevSubject(quiet())(next.handler()), "")

	if rec.Code != http.StatusTeapot {
		t.Fatalf("DevSubject refused a request: %d", rec.Code)
	}
	subject, err := authorization.SubjectFrom(next.mustReach(t))
	if err != nil {
		t.Fatalf("DevSubject left no subject behind: %v", err)
	}
	if subject.TenantID != "" {
		t.Fatalf("DevSubject now names a tenant (%q); the tenancy cross-check that relies on it "+
			"being empty must be revisited", subject.TenantID)
	}
	if subject.ClientID != "development" {
		t.Fatalf("DevSubject named client %q", subject.ClientID)
	}
}

func TestAuthorizeRefusesWhenNothingAuthenticatedTheCaller(t *testing.T) {
	guard := &stubGuard{decision: authorization.Decision{Allowed: true}}
	next := &spy{}

	rec := run(Authorize(guard, authorization.StudentsRead)(next.handler()), "")

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("an unauthenticated request got %d, wanted %d", rec.Code, http.StatusUnauthorized)
	}
	next.mustNotReach(t)
	if guard.calls.Load() != 0 {
		t.Fatal("the guard was consulted for a caller that was never authenticated")
	}
}

func withSubject(h http.Handler, sub *authorization.Subject) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(w, r.WithContext(authorization.WithSubject(r.Context(), sub)))
	})
}

func TestAuthorizeDeniedNeverReachesTheHandler(t *testing.T) {
	guard := &stubGuard{decision: authorization.Decision{Allowed: false, Rule: "none", Reason: "no grant"}}
	next := &spy{}
	handler := withSubject(Authorize(guard, authorization.StudentsRead)(next.handler()), &authorization.Subject{})

	rec := run(handler, "")

	if rec.Code != http.StatusForbidden {
		t.Fatalf("a denial got %d, wanted %d", rec.Code, http.StatusForbidden)
	}
	next.mustNotReach(t)
	if guard.calls.Load() != 1 {
		t.Fatalf("the guard was consulted %d times", guard.calls.Load())
	}
}

func TestAuthorizeTellsTheGuardExactlyWhichEntityIsAtStake(t *testing.T) {
	guard := &stubGuard{decision: authorization.Decision{Allowed: true}}
	next := &spy{}
	sub := &authorization.Subject{ClientID: "emerge-web"}
	handler := withSubject(Authorize(guard, authorization.GuardiansDeleteAll)(next.handler()), sub)

	run(handler, "")

	if guard.entity != authorization.GuardiansDeleteAll {
		t.Fatalf("the guard was asked about %q, wanted %q", guard.entity, authorization.GuardiansDeleteAll)
	}
	if guard.subject != sub {
		t.Fatal("the guard was handed a different subject from the authenticated one")
	}
	if guard.attrs != nil {
		t.Fatalf("the route level check now sends attributes (%v); per-row attributes belong to the "+
			"handlers, so this is a behaviour change worth noticing", guard.attrs)
	}
}

func TestAuthorizeSeparatesCouldNotAskFromMayNot(t *testing.T) {
	denied := &stubGuard{decision: authorization.Decision{Allowed: false}}
	upstream := &stubGuard{err: authorization.ErrUpstream}

	deniedNext, upstreamNext := &spy{}, &spy{}
	deniedRec := run(withSubject(Authorize(denied, authorization.StudentsRead)(deniedNext.handler()), &authorization.Subject{}), "")
	upstreamRec := run(withSubject(Authorize(upstream, authorization.StudentsRead)(upstreamNext.handler()), &authorization.Subject{}), "")

	if deniedRec.Code != http.StatusForbidden {
		t.Fatalf("a denial got %d, wanted %d", deniedRec.Code, http.StatusForbidden)
	}
	if upstreamRec.Code != http.StatusServiceUnavailable {
		t.Fatalf("an unreachable policy source got %d, wanted %d", upstreamRec.Code, http.StatusServiceUnavailable)
	}
	if deniedRec.Code == upstreamRec.Code {
		t.Fatal("a caller cannot tell being refused apart from the policy source being down")
	}
	deniedNext.mustNotReach(t)
	upstreamNext.mustNotReach(t)
	if !strings.Contains(upstreamRec.Body.String(), "authorization service unavailable") {
		t.Fatalf("the outage did not say so: %s", upstreamRec.Body.String())
	}
}

func TestAuthorizeReportsAWrappedUpstreamErrorAsAnOutage(t *testing.T) {
	guard := &stubGuard{err: errors.Join(errors.New("cas: fetch policies"), authorization.ErrUpstream)}
	next := &spy{}

	rec := run(withSubject(Authorize(guard, authorization.StudentsRead)(next.handler()), &authorization.Subject{}), "")

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("an error wrapping ErrUpstream got %d, wanted %d", rec.Code, http.StatusServiceUnavailable)
	}
	next.mustNotReach(t)
}

func TestAuthorizeNeverReportsAGuardFailureAsARefusal(t *testing.T) {
	guard := &stubGuard{err: errors.New("policy document did not parse")}
	next := &spy{}

	rec := run(withSubject(Authorize(guard, authorization.StudentsRead)(next.handler()), &authorization.Subject{}), "")

	if rec.Code == http.StatusForbidden {
		t.Fatalf("a guard that broke was reported to the caller as %d; \"I could not ask\" and "+
			"\"you may not\" are different answers, and a caller told it is forbidden will stop "+
			"asking about a fault that a retry would survive", rec.Code)
	}
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("a guard failure that is neither ErrUpstream nor a decision got %d, wanted %d: %s",
			rec.Code, http.StatusInternalServerError, rec.Body.String())
	}
	next.mustNotReach(t)
	if strings.Contains(rec.Body.String(), "did not parse") {
		t.Fatalf("the internal failure of the guard leaked to the caller: %s", rec.Body.String())
	}
}

func TestAuthorizeRefusalSaysNothingBeyondTheEntityName(t *testing.T) {
	guard := &stubGuard{decision: authorization.Decision{
		Allowed: false,
		Rule:    "students_read_own_section",
		Reason:  "subject holds no grant for section 9-B",
	}}
	next := &spy{}

	rec := run(withSubject(Authorize(guard, authorization.StudentsRead)(next.handler()), &authorization.Subject{}), "")

	body := rec.Body.String()
	for _, leak := range []string{"students_read_own_section", "9-B", "holds no grant"} {
		if strings.Contains(body, leak) {
			t.Fatalf("the refusal leaked the reasoning of the guard (%q): %s", leak, body)
		}
	}
	if !strings.Contains(body, string(authorization.StudentsRead)) {
		t.Fatalf("the refusal no longer names the entity; that is a behaviour change: %s", body)
	}
}

func TestAuthorizePutsTheDecisionInTheContextForTheHandler(t *testing.T) {
	want := authorization.Decision{
		Allowed:  true,
		Rule:     "students_read_all",
		Reason:   "granted",
		Reach:    authorization.ReachTenant,
		HasReach: true,
	}
	guard := &stubGuard{decision: want}
	next := &spy{}

	rec := run(withSubject(Authorize(guard, authorization.StudentsRead)(next.handler()), &authorization.Subject{}), "")

	if rec.Code != http.StatusTeapot {
		t.Fatalf("an allowed request got %d: %s", rec.Code, rec.Body.String())
	}
	got, ok := authorization.DecisionFrom(next.mustReach(t))
	if !ok {
		t.Fatal("the handler was reached with no decision in the context")
	}
	if got.Rule != want.Rule || got.Reach != want.Reach || !got.HasReach || !got.Allowed {
		t.Fatalf("the decision reached the handler as %+v, wanted %+v", got, want)
	}
}
