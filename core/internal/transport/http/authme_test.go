package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type authMeGuard struct {
	granted bool
	fields  *authorization.FieldPolicy
}

func (g authMeGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if entity != authorization.PersonsRead || !g.granted {
		return authorization.Decision{}, nil
	}
	return authorization.Decision{
		Allowed:  true,
		Rule:     "core.persons.read reach=self",
		Reach:    authorization.ReachSelf,
		HasReach: true,
		Fields:   g.fields,
	}, nil
}

func (authMeGuard) Name() string { return "auth/me agreement test guard" }

type authMeWorld struct {
	t        *testing.T
	server   *Server
	ctx      context.Context
	personID uuid.UUID
}

func newAuthMeWorld(t *testing.T, guard authorization.Guard) *authMeWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Harness").
		SetMiddleName("Own").
		SetLastName("Selfsame").
		SetDisplayName("Harness Selfsame " + tag).
		SetEmail("harness-" + tag + "@example.test").
		SetPhone("99" + tag).
		SetGender("unspecified").
		SetDateOfBirth(time.Date(2001, time.February, 3, 0, 0, 0, 0, time.UTC)).
		SetProfilePhotoAssetID(uuid.New()).
		SetMetadataJSON(shared.Metadata{"house": "blue"}).
		SaveX(ctx)

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	ctx = postgres.WithConn(ctx, &postgres.TenantConn{
		Tenant: &tenancy.Tenant{SchoolID: uuid.New(), Code: "HME-" + tag},
		Client: client,
	})

	return &authMeWorld{
		t:        t,
		server:   &Server{guard: guard},
		ctx:      ctx,
		personID: person.ID,
	}
}

func (w *authMeWorld) requireSelfReach() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.PersonsRead, authorization.PersonsReadAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer is never projected, so no redaction would be compared")
	}
	if viewer.PersonID == nil || *viewer.PersonID != w.personID {
		w.t.Fatalf("the viewer must resolve to the seeded person %s, got %v",
			w.personID, viewer.PersonID)
	}
	if !decision.HasReach || decision.Reach != authorization.ReachSelf {
		w.t.Fatalf("GET /persons/{id} must be able to reach the caller's own row, "+
			"otherwise it answers 404 and the comparison proves nothing: %+v", decision)
	}
}

func (w *authMeWorld) call(handler http.HandlerFunc, target string,
	id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	ctx := w.ctx
	if id != uuid.Nil {
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	}

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest(http.MethodGet, target, nil).WithContext(ctx))
	return rec
}

func (w *authMeWorld) decode(rec *httptest.ResponseRecorder, what string) map[string]json.RawMessage {
	w.t.Helper()

	if rec.Code != http.StatusOK {
		w.t.Fatalf("%s answered %d: %s", what, rec.Code, rec.Body.String())
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("%s returned a body that is not a JSON object: %v: %s",
			what, err, rec.Body.String())
	}
	return body
}

func (w *authMeWorld) meBody() map[string]json.RawMessage {
	w.t.Helper()
	return w.decode(w.call(w.server.me, "/api/v1/auth/me", uuid.Nil), "GET /auth/me")
}

func (w *authMeWorld) mePerson() map[string]json.RawMessage {
	w.t.Helper()

	body := w.meBody()
	raw, ok := body["person"]
	if !ok {
		w.t.Fatalf("GET /auth/me returned no person for a caller who has one: %v", body)
	}
	var person map[string]json.RawMessage
	if err := json.Unmarshal(raw, &person); err != nil {
		w.t.Fatalf("the person on GET /auth/me is not a JSON object: %v: %s", err, raw)
	}
	return person
}

func (w *authMeWorld) directPerson() map[string]json.RawMessage {
	w.t.Helper()

	rec := w.call(w.server.getPerson, "/api/v1/persons/"+w.personID.String(), w.personID)
	return w.decode(rec, "GET /persons/{id}")
}

func requireAgreement(t *testing.T, self, direct map[string]json.RawMessage) {
	t.Helper()

	for _, key := range keysIn(self) {
		full, ok := direct[key]
		if !ok {
			t.Fatalf("GET /auth/me exposed %q on the caller's own row and "+
				"GET /persons/{id} withheld it under the same policy: "+
				"the two endpoints disagree about what this caller may see", key)
		}
		if !bytes.Equal(self[key], full) {
			t.Fatalf("the two endpoints returned different values for %q on the same row: "+
				"/auth/me said %s, /persons/{id} said %s", key, self[key], full)
		}
	}
}

func requireKeys(t *testing.T, where string, body map[string]json.RawMessage,
	present, absent []string) {
	t.Helper()

	for _, key := range present {
		if _, ok := body[key]; !ok {
			t.Fatalf("%s should carry %q under this policy and did not: %v", where, key, keysIn(body))
		}
	}
	for _, key := range absent {
		if _, ok := body[key]; ok {
			t.Fatalf("%s leaked %q, which this policy redacts", where, key)
		}
	}
}

func keysIn(body map[string]json.RawMessage) []string {
	out := make([]string, 0, len(body))
	for key := range body {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

func TestAuthMeExposesNoMoreThanGetPerson(t *testing.T) {
	cases := []struct {
		name    string
		fields  *authorization.FieldPolicy
		present []string
		absent  []string
	}{
		{
			name:    "an unrestricted policy redacts nothing from either endpoint",
			fields:  &authorization.FieldPolicy{Mode: authorization.FieldModeAll},
			present: []string{"id", "display_name", "email", "phone", "status"},
		},
		{
			name: "an include policy narrows both endpoints to the same fields",
			fields: &authorization.FieldPolicy{
				Mode: authorization.FieldModeInclude,
				Keys: []string{"display_name", "first_name"},
			},
			present: []string{"id", "display_name", "first_name"},
			absent:  []string{"email", "phone", "status", "middle_name", "last_name"},
		},
		{
			name: "an all_except policy hides the same fields on both endpoints",
			fields: &authorization.FieldPolicy{
				Mode: authorization.FieldModeAllExcept,
				Keys: []string{"email", "phone", "status", "metadata_json"},
			},
			present: []string{"id", "display_name", "first_name", "last_name"},
			absent:  []string{"email", "phone", "status"},
		},
		{
			name: "a policy that permits nothing leaves only the always-readable floor",
			fields: &authorization.FieldPolicy{
				Mode: authorization.FieldModeInclude,
			},
			present: []string{"id"},
			absent: []string{"display_name", "first_name", "middle_name", "last_name",
				"email", "phone", "status"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			world := newAuthMeWorld(t, authMeGuard{granted: true, fields: tc.fields})
			world.requireSelfReach()

			self, direct := world.mePerson(), world.directPerson()
			requireKeys(t, "GET /auth/me", self, tc.present, tc.absent)
			requireKeys(t, "GET /persons/{id}", direct, tc.present, tc.absent)
			requireAgreement(t, self, direct)
		})
	}
}

func TestAuthMePromisesAnIdentitySubsetNotTheRow(t *testing.T) {
	world := newAuthMeWorld(t, authMeGuard{
		granted: true,
		fields:  &authorization.FieldPolicy{Mode: authorization.FieldModeAll},
	})
	world.requireSelfReach()

	self, direct := world.mePerson(), world.directPerson()
	requireAgreement(t, self, direct)

	requireKeys(t, "GET /auth/me", self,
		[]string{"id", "first_name", "middle_name", "last_name", "display_name",
			"email", "phone", "profile_photo_asset_id", "status"},
		[]string{"date_of_birth", "gender", "metadata_json", "edges",
			"cas_user_id", "created_at", "updated_at"})

	requireKeys(t, "GET /persons/{id}", direct,
		[]string{"date_of_birth", "gender", "metadata_json", "cas_user_id",
			"created_at", "updated_at"}, nil)
}

func TestAuthMeAnswersWithoutAPersonsGrant(t *testing.T) {
	world := newAuthMeWorld(t, authMeGuard{granted: false})

	body := world.meBody()
	requireKeys(t, "GET /auth/me", body, []string{"cas_user_id", "school", "roles", "person"}, nil)

	var person map[string]json.RawMessage
	if err := json.Unmarshal(body["person"], &person); err != nil {
		t.Fatalf("the person on GET /auth/me is not a JSON object: %v: %s", err, body["person"])
	}
	requireKeys(t, "GET /auth/me without a core.persons.read grant", person,
		[]string{"id"},
		[]string{"first_name", "middle_name", "last_name", "display_name",
			"email", "phone", "profile_photo_asset_id", "status"})
}
