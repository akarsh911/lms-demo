package http

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

var libraryPlaceholder = regexp.MustCompile(`\$\d+`)

func documentScopeOf(t *testing.T, stmt libraryStmt) string {
	t.Helper()

	where := libraryWhereOf(stmt.query)
	if where == "" {
		t.Fatalf("the statement carries no WHERE clause at all: %q", stmt.query)
	}
	head := `"student_documents"."id" = $`
	if strings.HasPrefix(where, head) {
		rest := where[len(head):]
		digits := 0
		for digits < len(rest) && rest[digits] >= '0' && rest[digits] <= '9' {
			digits++
		}
		where = strings.TrimPrefix(rest[digits:], " AND ")
	}
	return libraryPlaceholder.ReplaceAllString(strings.TrimSpace(where), "$?")
}

func TestEveryDocumentRouteCarriesTheSameScopePredicate(t *testing.T) {
	doc, ward := uuid.New(), uuid.New()

	seeded := func() *libraryFixture {
		fx := newLibraryFixture(t, libraryWardOnEverything())
		fx.driver.tables["guardians"] = []map[string]any{{"id": ward}}
		fx.driver.tables["student_documents"] = []map[string]any{{"id": doc}}
		return fx
	}

	listing := seeded()
	if w := listing.call(listing.server.listDocuments, "GET",
		"/api/v1/student-documents", "", uuid.Nil); w.Code != http.StatusOK {
		t.Fatalf("the listing must reach its query, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}

	verify := seeded()
	if w := verify.call(verify.server.verifyDocument, "PATCH",
		"/api/v1/student-documents/"+doc.String(),
		`{"verification_status":"verified"}`, doc); w.Code != http.StatusOK {
		t.Fatalf("the verify must reach its write, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}

	remove := seeded()
	if w := remove.call(remove.server.deleteDocument, "DELETE",
		"/api/v1/student-documents/"+doc.String(), "", doc); w.Code != http.StatusNoContent {
		t.Fatalf("the delete must reach its write, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}

	spellings := []struct {
		name string
		stmt libraryStmt
	}{
		{"the listing", listing.statements("student_documents")[0]},
		{"the reach that precedes the verify", verify.statements("student_documents")[0]},
		{"the verify itself", verify.writes("student_documents")[0]},
		{"the delete", remove.writes("student_documents")[0]},
	}

	first := documentScopeOf(t, spellings[0].stmt)
	for _, one := range spellings {
		scope := documentScopeOf(t, one.stmt)
		if !strings.Contains(scope, "EXISTS (") || strings.Contains(scope, "FALSE") {
			t.Fatalf("%s carries no reachable student scope, so matching the others proves "+
				"nothing: %q", one.name, scope)
		}
		if !one.stmt.carries(ward) {
			t.Fatalf("%s does not bind the guardian whose wards the viewer may reach: %q %v",
				one.name, one.stmt.query, one.stmt.args)
		}
		if !strings.Contains(scope, `"can_view_academic"`) {
			t.Fatalf("%s does not demand the academic gate a guardian's ward documents sit "+
				"behind, so the scope is the wider one: %q", one.name, scope)
		}
		if scope != first {
			t.Fatalf("%s spells the document scope differently from %s, so the read rule and "+
				"the write rule can drift apart while each looks correct alone:\n  %s\n  %s",
				one.name, spellings[0].name, first, scope)
		}
	}
}

type wardEverything struct{}

func (wardEverything) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if strings.HasSuffix(string(entity), "_all") {
		return authorization.Decision{}, nil
	}
	return authorization.Decision{
		Allowed:  true,
		Reach:    authorization.ReachGuardianWard,
		HasReach: true,
	}, nil
}

func (wardEverything) Name() string { return "guardian ward on everything (document scope test)" }

func libraryWardOnEverything() libraryOption {
	return func(fx *libraryFixture) { fx.server.guard = wardEverything{} }
}
