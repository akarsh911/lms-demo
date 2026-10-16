package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	controlschool "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/school"
	controlprofile "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/schoolprofile"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

func ask(h http.Handler, school string, sub *authorization.Subject) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/anything", nil)
	if school != "" {
		req.Header.Set(SchoolHeader, school)
	}
	if sub != nil {
		req = req.WithContext(authorization.WithSubject(req.Context(), sub))
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestRequireTenantRefusesARequestThatNamesNoSchool(t *testing.T) {
	next := &spy{}

	rec := ask(RequireTenant(nil)(next.handler()), "", nil)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a request with no %s got %d, wanted %d", SchoolHeader, rec.Code, http.StatusBadRequest)
	}
	next.mustNotReach(t)
	if !strings.Contains(rec.Body.String(), SchoolHeader) {
		t.Fatalf("the refusal did not name the header it wanted: %s", rec.Body.String())
	}
}

func TestOptionalTenantLetsAnUntenantedRequestThrough(t *testing.T) {
	next := &spy{}

	rec := ask(OptionalTenant(nil)(next.handler()), "", nil)

	if rec.Code != http.StatusTeapot {
		t.Fatalf("an untenanted request got %d, wanted the handler's %d", rec.Code, http.StatusTeapot)
	}
	ctx := next.mustReach(t)
	if _, err := tenancy.FromContext(ctx); !errors.Is(err, tenancy.ErrNoTenant) {
		t.Fatalf("an untenanted request arrived carrying a tenant: %v", err)
	}
	if _, err := postgres.ConnFromContext(ctx); err == nil {
		t.Fatal("an untenanted request arrived carrying a tenant connection")
	}
}

func TestOptionalTenantIgnoresASubjectTenantWhenNoSchoolIsNamed(t *testing.T) {
	next := &spy{}

	rec := ask(OptionalTenant(nil)(next.handler()), "", &authorization.Subject{TenantID: "some-other-school"})

	if rec.Code != http.StatusTeapot {
		t.Fatalf("a tenanted token on an untenanted route got %d, wanted %d", rec.Code, http.StatusTeapot)
	}
	next.mustReach(t)
}

func TestTenantFailuresAreReportedAsDistinctStatuses(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
		says   string
	}{
		{"a school nobody has heard of", tenancy.ErrUnknownSchool, http.StatusNotFound, "unknown school"},
		{"a school that exists but may not transact", tenancy.ErrSchoolInactive, http.StatusForbidden, "not active"},
		{"a school with no database behind it", tenancy.ErrNoProfile, http.StatusServiceUnavailable, "no database profile"},
		{"anything else at all", errors.New("connection reset by peer"), http.StatusInternalServerError, "something went wrong"},
		{"a wrapped unknown school", errors.New("x: " + tenancy.ErrUnknownSchool.Error()), http.StatusInternalServerError, "something went wrong"},
	}

	seen := map[int]string{}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			writeTenantErr(rec, tc.err)

			if rec.Code != tc.status {
				t.Fatalf("%v was reported as %d, wanted %d", tc.err, rec.Code, tc.status)
			}
			if !strings.Contains(rec.Body.String(), tc.says) {
				t.Fatalf("the body did not say %q: %s", tc.says, rec.Body.String())
			}
			if tc.status != http.StatusInternalServerError {
				if other, clash := seen[tc.status]; clash {
					t.Fatalf("%q is no longer distinguishable from %q: both are %d", tc.name, other, tc.status)
				}
				seen[tc.status] = tc.name
			}
		})
	}
	if !strings.Contains(func() string {
		rec := httptest.NewRecorder()
		writeTenantErr(rec, errors.New("password=hunter2 refused"))
		return rec.Body.String()
	}(), "something went wrong") {
		t.Fatal("an unclassified failure was passed through to the caller verbatim")
	}
}

type tenancyFixture struct {
	registry *postgres.Registry
	control  *postgres.Control
	creds    any
	code     string
	schoolID uuid.UUID
	casID    string
}

func liveTenancy(t *testing.T) *tenancyFixture {
	t.Helper()

	ctx := context.Background()
	_ = testsupport.TenantTx(ctx, t)

	controlDSN := strings.TrimSpace(os.Getenv(testsupport.ControlDSNEnv))
	key := strings.TrimSpace(os.Getenv(testsupport.MasterKeyEnv))
	if controlDSN == "" || key == "" {
		t.Skip(testsupport.SkipMarker + ": resolving " + SchoolHeader + " and checking a token tenant " +
			"against a school needs a real control plane, so " + testsupport.ControlDSNEnv + " and " +
			testsupport.MasterKeyEnv + " must both be set")
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

	registry := postgres.NewRegistry(control, keyring, postgres.Options{}, postgres.Discard())
	t.Cleanup(func() { _ = registry.Close() })

	code := strings.TrimSpace(os.Getenv(testsupport.SchoolCodeEnv))
	if code == "" {
		code = testsupport.DefaultSchoolCode
	}

	conn, err := registry.GetByCode(ctx, code)
	if err != nil {
		t.Fatalf("the seed school %s did not resolve: %v", code, err)
	}
	creds, err := registry.PostgresCredentials(ctx, conn.Tenant.SchoolID)
	if err != nil {
		t.Fatalf("the seed school %s has no readable postgres profile: %v", code, err)
	}

	return &tenancyFixture{
		registry: registry,
		control:  control,
		creds:    creds,
		code:     conn.Tenant.Code,
		schoolID: conn.Tenant.SchoolID,
		casID:    conn.Tenant.CASTenantID,
	}
}

func (fx *tenancyFixture) makeSchool(t *testing.T, casTenantID string, status controlschool.Status, reachable bool) (uuid.UUID, string) {
	t.Helper()

	ctx := context.Background()
	suffix := strings.ToLower(uuid.NewString()[:8])
	code := "QA-TEN-" + strings.ToUpper(suffix)

	create := fx.control.Client.School.Create().
		SetName("middleware tenancy fixture " + suffix).
		SetCode(code).
		SetTimezone("Asia/Kolkata").
		SetCountry("IN").
		SetStatus(status)
	if casTenantID != "" {
		create = create.SetCasTenantID(casTenantID)
	}

	row, err := create.Save(ctx)
	if err != nil {
		t.Fatalf("the fixture school could not be created: %v", err)
	}
	t.Cleanup(func() {
		fx.registry.Evict(row.ID)
		if _, err := fx.control.Client.SchoolProfile.Delete().
			Where(controlprofile.SchoolID(row.ID)).Exec(ctx); err != nil {
			t.Errorf("the fixture profiles leaked: %v", err)
		}
		if err := fx.control.Client.School.DeleteOneID(row.ID).Exec(ctx); err != nil {
			t.Errorf("the fixture school leaked: %v", err)
		}
	})

	if !reachable {
		return row.ID, code
	}

	nonce, ciphertext, version, err := fx.registry.EncryptCredentials(row.ID, fx.creds)
	if err != nil {
		t.Fatalf("the fixture credentials would not encrypt: %v", err)
	}
	if _, err := fx.control.Client.SchoolProfile.Create().
		SetSchoolID(row.ID).
		SetProfileType(controlprofile.ProfileTypePostgres).
		SetName("primary").
		SetStatus(controlprofile.StatusActive).
		SetKeyVersion(version).
		SetNonce(nonce).
		SetCiphertext(ciphertext).
		Save(ctx); err != nil {
		t.Fatalf("the fixture postgres profile could not be created: %v", err)
	}
	return row.ID, code
}

func TestRequireTenantResolvesASchoolAndHandsOnItsConnection(t *testing.T) {
	fx := liveTenancy(t)

	for _, named := range []struct {
		how  string
		what string
	}{
		{"by code", fx.code},
		{"by identifier", fx.schoolID.String()},
	} {
		t.Run(named.how, func(t *testing.T) {
			next := &spy{}
			rec := ask(RequireTenant(fx.registry)(next.handler()), named.what, nil)

			if rec.Code != http.StatusTeapot {
				t.Fatalf("%s got %d: %s", named.how, rec.Code, rec.Body.String())
			}
			ctx := next.mustReach(t)
			tenant, err := tenancy.FromContext(ctx)
			if err != nil {
				t.Fatalf("the handler was reached with no tenant: %v", err)
			}
			if tenant.SchoolID != fx.schoolID {
				t.Fatalf("the handler was handed school %s, wanted %s", tenant.SchoolID, fx.schoolID)
			}
			conn, err := postgres.ConnFromContext(ctx)
			if err != nil {
				t.Fatalf("the handler was reached with no tenant connection: %v", err)
			}
			if conn.Tenant.SchoolID != fx.schoolID {
				t.Fatalf("the connection belongs to school %s", conn.Tenant.SchoolID)
			}
		})
	}
}

func TestRequireTenantRefusesASchoolHeaderItCannotResolve(t *testing.T) {
	fx := liveTenancy(t)

	cases := []struct {
		name   string
		header string
	}{
		{"a code nobody registered", "QA-NO-SUCH-SCHOOL"},
		{"an identifier nobody registered", uuid.NewString()},
		{"the seed code with surrounding whitespace", "  " + fx.code + "  "},
		{"the seed code in the wrong case", strings.ToLower(fx.code)},
		{"a header that is only whitespace", " "},
		{"a code with a unicode lookalike", strings.Replace(fx.code, "-", "‐", 1)},
		{"a cas tenant slug nobody registered", "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])},
		{"the seed slug in the wrong case", strings.ToUpper(fx.casID)},
		{"the seed slug with surrounding whitespace", "  " + fx.casID + "  "},
	}
	if fx.casID == "" || strings.ToUpper(fx.casID) == fx.casID {
		cases = cases[:len(cases)-2]
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			next := &spy{}
			rec := ask(RequireTenant(fx.registry)(next.handler()), tc.header, nil)

			if rec.Code != http.StatusNotFound {
				t.Fatalf("%q got %d, wanted %d: %s", tc.header, rec.Code, http.StatusNotFound, rec.Body.String())
			}
			next.mustNotReach(t)
		})
	}
}

func TestRequireTenantRefusesASchoolThatMayNotTransact(t *testing.T) {
	fx := liveTenancy(t)
	_, code := fx.makeSchool(t, "", controlschool.StatusSuspended, true)
	next := &spy{}

	rec := ask(RequireTenant(fx.registry)(next.handler()), code, nil)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("a suspended school got %d, wanted %d: %s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
	next.mustNotReach(t)
}

func TestRequireTenantRefusesASchoolWithNoDatabaseBehindIt(t *testing.T) {
	fx := liveTenancy(t)
	_, code := fx.makeSchool(t, "", controlschool.StatusActive, false)
	next := &spy{}

	rec := ask(RequireTenant(fx.registry)(next.handler()), code, nil)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("a school with no postgres profile got %d, wanted %d: %s",
			rec.Code, http.StatusServiceUnavailable, rec.Body.String())
	}
	next.mustNotReach(t)
}

func TestRequireTenantRefusesATokenMintedForAnotherSchool(t *testing.T) {
	fx := liveTenancy(t)
	slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
	_, code := fx.makeSchool(t, slug, controlschool.StatusActive, true)
	next := &spy{}

	rec := ask(RequireTenant(fx.registry)(next.handler()), code,
		&authorization.Subject{TenantID: "qa-tenant-somewhere-else"})

	if rec.Code != http.StatusForbidden {
		t.Fatalf("a token for another tenant got %d, wanted %d: %s",
			rec.Code, http.StatusForbidden, rec.Body.String())
	}
	next.mustNotReach(t)
	if !strings.Contains(rec.Body.String(), "does not match") {
		t.Fatalf("the refusal did not say why: %s", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), slug) {
		t.Fatalf("the refusal disclosed the CAS tenant slug of the school: %s", rec.Body.String())
	}
}

func TestRequireTenantAcceptsATokenMintedForTheSameSchool(t *testing.T) {
	fx := liveTenancy(t)
	slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
	_, code := fx.makeSchool(t, slug, controlschool.StatusActive, true)
	next := &spy{}

	rec := ask(RequireTenant(fx.registry)(next.handler()), code, &authorization.Subject{TenantID: slug})

	if rec.Code != http.StatusTeapot {
		t.Fatalf("a token for this very school got %d: %s", rec.Code, rec.Body.String())
	}
	next.mustReach(t)
}

func TestATokenThatNamesNoTenantIsLeftToTheSchoolScopedPolicyCall(t *testing.T) {
	fx := liveTenancy(t)
	slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
	_, code := fx.makeSchool(t, slug, controlschool.StatusActive, true)
	next := &spy{}

	rec := ask(RequireTenant(fx.registry)(next.handler()), code, &authorization.Subject{TenantID: ""})

	if rec.Code != http.StatusTeapot {
		t.Fatalf("a subject with an empty tenant got %d, wanted %d. This looks like a fail-open "+
			"and is not one, so read this before you tighten it. CAS omits tenant_id DELIBERATELY "+
			"when a user reaches more than one school -- see the Claims doc comment in the CAS "+
			"repo, internal/service/token.go: \"Omitted when a user reaches two tenants, because "+
			"a partition key that is sometimes ambiguous is worse than one a service must always "+
			"ask for.\" An absent claim therefore means \"multi-tenant caller, you must ask\", not "+
			"\"token forgot something\". Refusing here would lock every superadmin and every "+
			"cross-school admin out of every school. The boundary is one layer down: "+
			"policies.go:145 sends THIS school's slug as the tenant, so CAS answers scoped to it "+
			"and a caller with no grant here gets an empty set and is refused by Authorize: %s",
			rec.Code, http.StatusTeapot, rec.Body.String())
	}
	next.mustReach(t)
}

func TestASchoolWithNoCASTenantIsLeftToTheEstateWideGrantsCASReturns(t *testing.T) {
	fx := liveTenancy(t)
	_, code := fx.makeSchool(t, "", controlschool.StatusActive, true)
	next := &spy{}

	rec := ask(RequireTenant(fx.registry)(next.handler()), code,
		&authorization.Subject{TenantID: "qa-tenant-somewhere-else"})

	if rec.Code != http.StatusTeapot {
		t.Fatalf("a school with no cas_tenant_id refused a token for another tenant with %d, "+
			"wanted %d. This too looks like a fail-open and is not one. A NULL cas_tenant_id is "+
			"the documented normal state of a school until it is registered with CAS, so there is "+
			"nothing here to compare a token against -- and the comparison is not what makes this "+
			"safe. tenantFor (policies.go:52) reads the SCHOOL's slug, so an unregistered school "+
			"makes the policy call carry no tenant at all, and CAS answers with estate-wide grants "+
			"only. policies.go:231 says so in its own hint. That is the conservative set by "+
			"construction, not the permissive one: %s", rec.Code, http.StatusTeapot, rec.Body.String())
	}
	next.mustReach(t)
}

func TestTheCrossSchoolCheckFiresOnlyForASingleTenantTokenSentElsewhere(t *testing.T) {
	fx := liveTenancy(t)
	slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
	_, code := fx.makeSchool(t, slug, controlschool.StatusActive, true)

	cases := []struct {
		name   string
		tenant string
		status int
	}{
		{"a single tenant token sent to its own school", slug, http.StatusTeapot},
		{"a single tenant token sent to another school", "qa-tenant-somewhere-else", http.StatusForbidden},
		{"a multi tenant token, which CAS mints with no tenant_id", "", http.StatusTeapot},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			next := &spy{}
			rec := ask(RequireTenant(fx.registry)(next.handler()), code,
				&authorization.Subject{TenantID: tc.tenant})

			if rec.Code != tc.status {
				t.Fatalf("%s got %d, wanted %d. Taken together these three cases are the point: "+
					"because CAS omits tenant_id for anyone who reaches more than one school, the "+
					"comparison can only ever fire for a SINGLE-tenant caller whose token names a "+
					"different school than the request -- which is exactly the case worth refusing "+
					"cheaply and early. The two emptiness guards are not the control being turned "+
					"off; they are the only correct behaviour given what an absent claim means: %s",
					tc.name, rec.Code, tc.status, rec.Body.String())
			}
			if tc.status == http.StatusTeapot {
				next.mustReach(t)
			} else {
				next.mustNotReach(t)
			}
		})
	}
}

func TestOptionalTenantRefusesASchoolHeaderItCannotResolve(t *testing.T) {
	fx := liveTenancy(t)
	next := &spy{}

	rec := ask(OptionalTenant(fx.registry)(next.handler()), "QA-NO-SUCH-SCHOOL", nil)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("OptionalTenant with an unresolvable header got %d, wanted %d: a caller that "+
			"supplies rubbish must be refused, not quietly treated as untenanted",
			rec.Code, http.StatusNotFound)
	}
	next.mustNotReach(t)
}

func TestOptionalTenantStillRefusesATokenMintedForAnotherSchool(t *testing.T) {
	fx := liveTenancy(t)
	slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
	_, code := fx.makeSchool(t, slug, controlschool.StatusActive, true)
	next := &spy{}

	rec := ask(OptionalTenant(fx.registry)(next.handler()), code,
		&authorization.Subject{TenantID: "qa-tenant-somewhere-else"})

	if rec.Code != http.StatusForbidden {
		t.Fatalf("OptionalTenant let a token for another tenant through with %d", rec.Code)
	}
	next.mustNotReach(t)
}

func TestOptionalTenantResolvesTheSchoolWhenOneIsNamed(t *testing.T) {
	fx := liveTenancy(t)
	next := &spy{}

	rec := ask(OptionalTenant(fx.registry)(next.handler()), fx.code, nil)

	if rec.Code != http.StatusTeapot {
		t.Fatalf("OptionalTenant with a good header got %d: %s", rec.Code, rec.Body.String())
	}
	if _, err := tenancy.FromContext(next.mustReach(t)); err != nil {
		t.Fatalf("OptionalTenant resolved the school but left no tenant behind: %v", err)
	}
}

func TestAMultiSchoolTokenIsCaughtByTheAuthorizerNotTheTenancyGuard(t *testing.T) {
	fx := liveTenancy(t)
	slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
	schoolID, code := fx.makeSchool(t, slug, controlschool.StatusActive, true)

	cases := []struct {
		name     string
		decision authorization.Decision
		status   int
		says     string
	}{
		{"holding no grant at this school", authorization.Decision{Allowed: false}, http.StatusForbidden,
			"not permitted: " + string(authorization.StudentsRead)},
		{"holding a grant at this school", authorization.Decision{Allowed: true}, http.StatusTeapot, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			guard := &stubGuard{decision: tc.decision}
			next := &spy{}
			handler := RequireTenant(fx.registry)(
				Authorize(guard, authorization.StudentsRead)(next.handler()))

			rec := ask(handler, code, &authorization.Subject{TenantID: ""})

			if rec.Code != tc.status {
				t.Fatalf("a multi-school caller %s got %d, wanted %d. tenant.go:51 fires ONLY for a "+
					"token that carries a tenant_id, and CAS deliberately mints none for a user who "+
					"reaches more than one school, so for this entire population Authorize is not a "+
					"backstop behind the tenancy guard -- it is the only stop. If this case stops "+
					"being decided by the guard, nothing else is deciding it: %s",
					tc.name, rec.Code, tc.status, rec.Body.String())
			}
			if guard.calls.Load() != 1 {
				t.Fatalf("the guard was consulted %d times; the tenancy guard skipping is only safe "+
					"because the request reaches the authorizer, so a skip that also fails to "+
					"consult anyone is the fail-open this deferral is assumed not to be",
					guard.calls.Load())
			}

			tenant, err := tenancy.FromContext(guard.asked)
			if err != nil {
				t.Fatalf("the guard was asked with no school in its context: %v. tenantFor "+
					"(policies.go:52) reads the school from exactly here, so without it the policy "+
					"call carries no tenant and CAS answers estate-wide instead of for this school", err)
			}
			if tenant.SchoolID != schoolID || tenant.CASTenantID != slug {
				t.Fatalf("the guard was asked about school %s / tenant %q, wanted %s / %q; the "+
					"deferral is only meaningful if the authorizer is asked about the school the "+
					"request addressed", tenant.SchoolID, tenant.CASTenantID, schoolID, slug)
			}
			if guard.subject == nil || guard.subject.TenantID != "" {
				t.Fatal("the subject reached the guard with a tenant on it; this case exists to " +
					"cover the caller CAS gives no tenant_id, and if one appears the test has " +
					"stopped covering it")
			}

			if tc.status == http.StatusTeapot {
				next.mustReach(t)
				return
			}
			next.mustNotReach(t)
			if !strings.Contains(rec.Body.String(), tc.says) {
				t.Fatalf("the refusal did not say %q: %s. Three different 403s live on this path -- "+
					"auth.go, tenant.go:51 for a single-school token sent elsewhere, and tenant.go:72 "+
					"for an inactive school -- and only this one answers \"may this caller do this "+
					"here\". A test that asserted the status alone would pass on the wrong one",
					tc.says, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "does not match") {
				t.Fatalf("this was refused by the TENANCY guard, not the authorizer: %s. That would "+
					"mean the cross-school comparison had started firing on an absent tenant_id, "+
					"which locks out every multi-school caller CAS mints a claimless token for",
					rec.Body.String())
			}
		})
	}
}

func chained(fx *tenancyFixture, c *fakeCAS, t *testing.T, next http.Handler) http.Handler {
	return Authenticate(c.verifier(t), quiet())(RequireTenant(fx.registry)(next))
}

func TestARealTokenIsCheckedAgainstTheSchoolItAddresses(t *testing.T) {
	fx := liveTenancy(t)
	c := newFakeCAS(t)
	slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
	_, code := fx.makeSchool(t, slug, controlschool.StatusActive, true)

	cases := []struct {
		name   string
		tenant any
		status int
	}{
		{"a token for this school", slug, http.StatusTeapot},
		{"a token for another school", "qa-tenant-somewhere-else", http.StatusForbidden},
		{"a token that names no school at all", nil, http.StatusTeapot},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			claims := c.claims()
			if tc.tenant == nil {
				delete(claims, "tenant_id")
			} else {
				claims["tenant_id"] = tc.tenant
			}

			next := &spy{}
			req := httptest.NewRequest(http.MethodGet, "/anything", nil)
			req.Header.Set("Authorization", "Bearer "+c.sign(t, claims))
			req.Header.Set(SchoolHeader, code)
			rec := httptest.NewRecorder()
			chained(fx, c, t, next.handler()).ServeHTTP(rec, req)

			if rec.Code != tc.status {
				t.Fatalf("%s got %d, wanted %d: %s", tc.name, rec.Code, tc.status, rec.Body.String())
			}
			if tc.status == http.StatusTeapot {
				next.mustReach(t)
			} else {
				next.mustNotReach(t)
			}
		})
	}
}

func TestRequireTenantResolvesASchoolByItsCASTenantSlug(t *testing.T) {
	fx := liveTenancy(t)
	slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
	schoolID, code := fx.makeSchool(t, slug, controlschool.StatusActive, true)
	next := &spy{}

	rec := ask(RequireTenant(fx.registry)(next.handler()), slug, nil)

	if rec.Code != http.StatusTeapot {
		t.Fatalf("a school addressed by its CAS tenant slug got %d, wanted %d: %s. /auth/me hands a "+
			"caller the tenant SLUG and nothing else, so a caller holding only what CAS told it "+
			"cannot address its own school unless this resolves", rec.Code, http.StatusTeapot, rec.Body.String())
	}
	ctx := next.mustReach(t)
	tenant, err := tenancy.FromContext(ctx)
	if err != nil {
		t.Fatalf("the handler was reached with no tenant: %v", err)
	}
	if tenant.SchoolID != schoolID {
		t.Fatalf("the slug %q reached school %s, wanted %s", slug, tenant.SchoolID, schoolID)
	}
	if tenant.Code != code || tenant.CASTenantID != slug {
		t.Fatalf("the slug reached a school carrying code %q / slug %q, wanted %q / %q",
			tenant.Code, tenant.CASTenantID, code, slug)
	}
	conn, err := postgres.ConnFromContext(ctx)
	if err != nil {
		t.Fatalf("the slug resolved but left no tenant connection behind: %v", err)
	}
	if conn.Tenant.SchoolID != schoolID {
		t.Fatalf("the connection belongs to school %s, wanted %s", conn.Tenant.SchoolID, schoolID)
	}
}

func TestASlugAddressedRequestIsStillCheckedAgainstTheTokenTenant(t *testing.T) {
	fx := liveTenancy(t)
	slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
	_, _ = fx.makeSchool(t, slug, controlschool.StatusActive, true)

	cases := []struct {
		name   string
		tenant string
		status int
	}{
		{"a token minted for this very school", slug, http.StatusTeapot},
		{"a token minted for another school", "qa-tenant-somewhere-else", http.StatusForbidden},
		{"a multi tenant token, which CAS mints with no tenant_id", "", http.StatusTeapot},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			next := &spy{}
			rec := ask(RequireTenant(fx.registry)(next.handler()), slug,
				&authorization.Subject{TenantID: tc.tenant})

			if rec.Code != tc.status {
				t.Fatalf("%s addressed by slug got %d, wanted %d: %s. The cross-school comparison "+
					"skips when the school carries no cas_tenant_id -- but a school REACHED BY its "+
					"slug carries one by construction, so on this path only the absent-claim arm can "+
					"skip, and that arm is the multi-school caller CAS deliberately mints no "+
					"tenant_id for", tc.name, rec.Code, tc.status, rec.Body.String())
			}
			if tc.status == http.StatusTeapot {
				next.mustReach(t)
				return
			}
			next.mustNotReach(t)
			if strings.Contains(rec.Body.String(), slug) {
				t.Fatalf("the refusal echoed the slug the caller sent: %s", rec.Body.String())
			}
		})
	}
}

func TestACodeThatIsAlsoAnotherSchoolsCASSlugReachesTheCodeOwner(t *testing.T) {
	fx := liveTenancy(t)
	codeOwner, collided := fx.makeSchool(t, "", controlschool.StatusActive, true)
	slugOwner, _ := fx.makeSchool(t, collided, controlschool.StatusActive, true)

	next := &spy{}
	rec := ask(RequireTenant(fx.registry)(next.handler()), collided, &authorization.Subject{TenantID: ""})

	if rec.Code != http.StatusTeapot {
		t.Fatalf("a header that is one school's code and another's cas_tenant_id got %d, wanted %d: %s",
			rec.Code, http.StatusTeapot, rec.Body.String())
	}
	tenant, err := tenancy.FromContext(next.mustReach(t))
	if err != nil {
		t.Fatalf("the colliding header resolved but left no tenant behind: %v", err)
	}
	if tenant.SchoolID != codeOwner {
		t.Fatalf("the colliding header %q reached school %s, wanted the CODE owner %s (the slug "+
			"owner is %s). Nothing in the schema stops this collision: code and cas_tenant_id are "+
			"each unique on their own column and neither is checked against the other, code is "+
			"only ToUpper-normalised at its write sites while cas_tenant_id is stored verbatim and "+
			"never matched against its documented ^[a-z0-9][a-z0-9_-]{0,62}$ shape. So the "+
			"resolution ORDER is the only thing deciding which school a colliding value reaches, "+
			"and code-before-slug is the order that leaves every caller that resolved before this "+
			"fallback existed reaching the same school as before -- the slug path can only turn a "+
			"404 into a hit, never move an existing hit. Flip the order and this value silently "+
			"starts reaching a different tenant, which is a cross-tenant read",
			collided, tenant.SchoolID, codeOwner, slugOwner)
	}

	byID := &spy{}
	if rec := ask(RequireTenant(fx.registry)(byID.handler()), slugOwner.String(), nil); rec.Code != http.StatusTeapot {
		t.Fatalf("the shadowed slug owner could not be reached by its identifier either (%d): the "+
			"collision is meant to cost it one ADDRESS, not its reachability", rec.Code)
	}
}

func TestASchoolAddressedBySlugReportsItsOwnStateRatherThanFlatteningToNotFound(t *testing.T) {
	fx := liveTenancy(t)

	cases := []struct {
		name      string
		status    controlschool.Status
		reachable bool
		want      int
		says      string
	}{
		{"a suspended school", controlschool.StatusSuspended, true, http.StatusForbidden, "not active"},
		{"a school with no postgres profile", controlschool.StatusActive, false, http.StatusServiceUnavailable, "no database profile"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			slug := "qa-tenant-" + strings.ToLower(uuid.NewString()[:8])
			fx.makeSchool(t, slug, tc.status, tc.reachable)
			next := &spy{}

			rec := ask(RequireTenant(fx.registry)(next.handler()), slug, nil)

			if rec.Code != tc.want {
				t.Fatalf("%s addressed by slug got %d, wanted %d: %s. The fallback discards its own "+
					"answer ONLY when that answer is \"unknown school\", so that a value naming "+
					"nothing keeps the exact 404 it had before; a school that was found and is "+
					"merely unusable must still say which of the two it is",
					tc.name, rec.Code, tc.want, rec.Body.String())
			}
			if !strings.Contains(rec.Body.String(), tc.says) {
				t.Fatalf("the refusal did not say %q: %s", tc.says, rec.Body.String())
			}
			next.mustNotReach(t)
		})
	}
}
