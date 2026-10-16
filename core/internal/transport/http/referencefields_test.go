package http

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
	"github.com/Harbour-Emerge/emerge-core/internal/service"
)

type referenceRows struct {
	branch  uuid.UUID
	grade   uuid.UUID
	house   uuid.UUID
	subject uuid.UUID
	group   uuid.UUID
}

func seedReferenceRows(w *writeFieldsWorld) referenceRows {
	w.t.Helper()

	tag := uuid.NewString()[:8]
	c := w.db.Client
	return referenceRows{
		branch: c.Branch.Create().
			SetName("Policy Branch " + tag).SetCode("PBR-" + tag).SaveX(w.ctx).ID,
		grade: c.GradeLevel.Create().
			SetName("Policy Grade " + tag).SetCode("PGR-" + tag).SetSequence(91).SaveX(w.ctx).ID,
		house: c.SchoolHouse.Create().
			SetName("Policy House " + tag).SetCode("PHO-" + tag).SaveX(w.ctx).ID,
		subject: c.Subject.Create().
			SetName("Policy Subject " + tag).SetCode("PSU-" + tag).SaveX(w.ctx).ID,
		group: c.SubjectGroup.Create().
			SetName("Policy Group " + tag).SaveX(w.ctx).ID,
	}
}

type referenceUpdateCase struct {
	name    string
	route   string
	allowed []string
	refused string
	body    string
	clean   string
	id      func(referenceRows) uuid.UUID
	handler func(*Server) http.HandlerFunc
}

func referenceUpdateCases() []referenceUpdateCase {
	return []referenceUpdateCase{
		{
			name: "branch", route: "/api/v1/branches/",
			allowed: []string{"name"}, refused: "phone",
			body:    `{"name":"Renamed","phone":"+91 22 0000 0000"}`,
			clean:   `{"name":"Renamed"}`,
			id:      func(r referenceRows) uuid.UUID { return r.branch },
			handler: func(s *Server) http.HandlerFunc { return s.updateBranch },
		},
		{
			name: "grade level", route: "/api/v1/grade-levels/",
			allowed: []string{"name"}, refused: "sequence",
			body:    `{"name":"Renamed","sequence":7}`,
			clean:   `{"name":"Renamed"}`,
			id:      func(r referenceRows) uuid.UUID { return r.grade },
			handler: func(s *Server) http.HandlerFunc { return s.updateGradeLevel },
		},
		{
			name: "school house", route: "/api/v1/school-houses/",
			allowed: []string{"name"}, refused: "status",
			body:    `{"name":"Renamed","status":"inactive"}`,
			clean:   `{"name":"Renamed"}`,
			id:      func(r referenceRows) uuid.UUID { return r.house },
			handler: func(s *Server) http.HandlerFunc { return s.updateHouse },
		},
		{
			name: "subject", route: "/api/v1/subjects/",
			allowed: []string{"name"}, refused: "is_elective",
			body:    `{"name":"Renamed","is_elective":true}`,
			clean:   `{"name":"Renamed"}`,
			id:      func(r referenceRows) uuid.UUID { return r.subject },
			handler: func(s *Server) http.HandlerFunc { return s.updateSubject },
		},
		{
			name: "subject group", route: "/api/v1/subject-groups/",
			allowed: []string{"name"}, refused: "description",
			body:    `{"name":"Renamed","description":"widened"}`,
			clean:   `{"name":"Renamed"}`,
			id:      func(r referenceRows) uuid.UUID { return r.group },
			handler: func(s *Server) http.HandlerFunc { return s.updateSubjectGroup },
		},
	}
}

func TestReferenceUpdatesRefuseAFieldTheCallerMayNotWrite(t *testing.T) {
	for _, tc := range referenceUpdateCases() {
		t.Run(tc.name, func(t *testing.T) {
			w := newWriteFieldsWorld(t, writeFieldsGuard{})
			rows := seedReferenceRows(w)
			id := tc.id(rows)
			policy := restrictedTo(tc.allowed...)

			w.refused(routed(w, policy, tc.handler(w.server), "PATCH",
				tc.route+id.String(), tc.body, id), tc.refused)

			wantOK(t, routed(w, policy, tc.handler(w.server), "PATCH",
				tc.route+id.String(), tc.clean, id))
		})
	}
}

func TestReferenceUpdatesRefuseWhenNoDecisionReachedTheHandler(t *testing.T) {
	for _, tc := range referenceUpdateCases() {
		t.Run(tc.name, func(t *testing.T) {
			w := newWriteFieldsWorld(t, writeFieldsGuard{})
			rows := seedReferenceRows(w)
			id := tc.id(rows)

			rec := routed(w, nil, tc.handler(w.server), "PATCH",
				tc.route+id.String(), tc.clean, id)
			if rec.Code != http.StatusForbidden {
				t.Fatalf("a handler reached with no decision must refuse with 403, got %d: %s",
					rec.Code, strings.TrimSpace(rec.Body.String()))
			}
		})
	}
}

type referenceCreateCase struct {
	name    string
	route   string
	allowed []string
	refused string
	body    func(string) string
	clean   func(string) string
	handler func(*Server) http.HandlerFunc
}

func referenceCreateCases() []referenceCreateCase {
	return []referenceCreateCase{
		{
			name: "branch", route: "/api/v1/branches",
			allowed: []string{"name", "code"}, refused: "status",
			body:    func(tag string) string { return `{"name":"B ` + tag + `","code":"NBR-` + tag + `","status":"active"}` },
			clean:   func(tag string) string { return `{"name":"B ` + tag + `","code":"NBR-` + tag + `"}` },
			handler: func(s *Server) http.HandlerFunc { return s.createBranch },
		},
		{
			name: "grade level", route: "/api/v1/grade-levels",
			allowed: []string{"name", "code", "sequence"}, refused: "education_stage",
			body: func(tag string) string {
				return `{"name":"G ` + tag + `","code":"NGR-` + tag + `","sequence":92,"education_stage":"primary"}`
			},
			clean: func(tag string) string {
				return `{"name":"G ` + tag + `","code":"NGR-` + tag + `","sequence":92}`
			},
			handler: func(s *Server) http.HandlerFunc { return s.createGradeLevel },
		},
		{
			name: "school house", route: "/api/v1/school-houses",
			allowed: []string{"name"}, refused: "code",
			body:    func(tag string) string { return `{"name":"H ` + tag + `","code":"NHO-` + tag + `"}` },
			clean:   func(tag string) string { return `{"name":"H ` + tag + `"}` },
			handler: func(s *Server) http.HandlerFunc { return s.createHouse },
		},
		{
			name: "subject", route: "/api/v1/subjects",
			allowed: []string{"name", "code"}, refused: "is_elective",
			body: func(tag string) string {
				return `{"name":"S ` + tag + `","code":"NSU-` + tag + `","is_elective":true}`
			},
			clean:   func(tag string) string { return `{"name":"S ` + tag + `","code":"NSU-` + tag + `"}` },
			handler: func(s *Server) http.HandlerFunc { return s.createSubject },
		},
		{
			name: "subject group", route: "/api/v1/subject-groups",
			allowed: []string{"name"}, refused: "description",
			body:    func(tag string) string { return `{"name":"SG ` + tag + `","description":"widened"}` },
			clean:   func(tag string) string { return `{"name":"SG ` + tag + `"}` },
			handler: func(s *Server) http.HandlerFunc { return s.createSubjectGroup },
		},
	}
}

func TestReferenceCreatesRefuseAFieldTheCallerMayNotWrite(t *testing.T) {
	for _, tc := range referenceCreateCases() {
		t.Run(tc.name, func(t *testing.T) {
			w := newWriteFieldsWorld(t, writeFieldsGuard{})
			policy := restrictedTo(tc.allowed...)
			tag := uuid.NewString()[:8]

			w.refused(routed(w, policy, tc.handler(w.server), "POST",
				tc.route, tc.body(tag), uuid.Nil), tc.refused)

			w.created(routed(w, policy, tc.handler(w.server), "POST",
				tc.route, tc.clean(tag), uuid.Nil))
		})
	}
}

type recordingIdentities struct {
	calls *int
	user  *cas.User
}

func (r recordingIdentities) CreateUser(context.Context, cas.NewUser) (*cas.User, error) {
	*r.calls++
	return r.user, nil
}

func (r recordingIdentities) FindUser(context.Context, string) (*cas.User, error) {
	*r.calls++
	return r.user, nil
}

func (recordingIdentities) FindGroup(context.Context, string) (uuid.UUID, error) {
	return uuid.Nil, nil
}

func (recordingIdentities) AddUserToGroup(context.Context, string, uuid.UUID) error { return nil }

func withRecordingCAS(w *writeFieldsWorld) *int {
	calls := 0
	w.server.provisioner = service.NewProvisioner(recordingIdentities{
		calls: &calls,
		user: &cas.User{
			ID:       uuid.New(),
			Username: "policy-" + uuid.NewString()[:8],
			Email:    "cas-supplied@example.test",
			Phone:    "+91 99999 00000",
		},
	})
	return &calls
}

func (w *writeFieldsWorld) peopleNamed(email string) int {
	w.t.Helper()

	n, err := w.db.Client.Person.Query().Where(entperson.Email(email)).Count(context.Background())
	if err != nil {
		w.t.Fatalf("the person count could not be read back: %v", err)
	}
	return n
}

func TestProvisionPersonRefusesAFieldTheCallerMayNotWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	calls := withRecordingCAS(w)
	policy := restrictedTo("cas_user_id", "first_name", "display_name")

	body := `{"username":"policy-user","password":"Eg#123456789012","first_name":"Policy",` +
		`"email":"smuggled@example.test"}`
	w.refused(routed(w, policy, w.server.provisionPerson, "POST",
		"/api/v1/persons/provision", body, uuid.Nil), "email")

	if *calls != 0 {
		t.Fatalf("the refusal must land before CAS is asked to mint an identity, got %d calls", *calls)
	}
	if n := w.peopleNamed("smuggled@example.test"); n != 0 {
		t.Fatalf("a refused provision still wrote a person carrying the refused field: %d rows", n)
	}
}

func TestProvisionPersonStillWritesWhatTheCallerMayWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	calls := withRecordingCAS(w)

	body := `{"username":"policy-user","password":"Eg#123456789012","first_name":"Policy"}`
	rec := routed(w, restrictedTo("cas_user_id", "first_name", "display_name"),
		w.server.provisionPerson, "POST", "/api/v1/persons/provision", body, uuid.Nil)

	if rec.Code != http.StatusCreated && rec.Code != http.StatusOK {
		t.Fatalf("a caller writing only permitted fields must still provision, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if *calls == 0 {
		t.Fatal("the permitted request never reached CAS, so the policy is refusing everything")
	}
}

func TestLinkPersonRefusesAFieldTheCallerMayNotWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	calls := withRecordingCAS(w)

	body := `{"identifier":"someone@example.test","first_name":"Policy","last_name":"Smuggled"}`
	w.refused(routed(w, restrictedTo("first_name", "display_name"),
		w.server.linkPerson, "POST", "/api/v1/persons/link", body, uuid.Nil), "last_name")

	if *calls != 0 {
		t.Fatalf("the refusal must land before CAS is asked to resolve the identity, got %d calls", *calls)
	}
}

func TestLinkPersonStillWritesWhatTheCallerMayWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	calls := withRecordingCAS(w)

	body := `{"identifier":"someone@example.test","first_name":"Policy"}`
	rec := routed(w, restrictedTo("first_name", "display_name"),
		w.server.linkPerson, "POST", "/api/v1/persons/link", body, uuid.Nil)

	if rec.Code != http.StatusCreated {
		t.Fatalf("a caller writing only permitted fields must still link, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if *calls == 0 {
		t.Fatal("the permitted request never reached CAS, so the policy is refusing everything")
	}
}

func TestReferenceWritesAreUnrestrictedWithoutAFieldPolicy(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	rows := seedReferenceRows(w)

	wantOK(t, routed(w, unrestricted(), w.server.updateBranch, "PATCH",
		"/api/v1/branches/"+rows.branch.String(),
		`{"name":"Wide","phone":"+91 22 1111 1111"}`, rows.branch))

	wantOK(t, routed(w, unrestricted(), w.server.updateSubject, "PATCH",
		"/api/v1/subjects/"+rows.subject.String(),
		`{"name":"Wide","is_elective":true}`, rows.subject))
}

func TestReferenceFieldPolicyNamesRealColumns(t *testing.T) {
	for _, tc := range referenceUpdateCases() {
		t.Run(tc.name, func(t *testing.T) {
			if !strings.Contains(tc.body, `"`+tc.refused+`"`) {
				t.Fatalf("the case does not send %q at all, so the refusal below proves nothing",
					tc.refused)
			}
			for _, name := range tc.allowed {
				if !strings.Contains(tc.clean, `"`+name+`"`) {
					t.Fatalf("the permitted body does not exercise %q", name)
				}
			}
		})
	}
}
