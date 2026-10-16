package http

import (
	"context"
	"testing"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

type alwaysAllow struct{ asked []authorization.Entity }

func (g *alwaysAllow) Allow(_ context.Context, _ *authorization.Subject,
	e authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	g.asked = append(g.asked, e)
	return authorization.Decision{Allowed: true}, nil
}

func (g *alwaysAllow) Name() string { return "always-allow" }

func TestSameEntityTwiceIsNotAWideGrant(t *testing.T) {
	guard := &alwaysAllow{}
	s := &Server{guard: guard}

	ctx := authorization.WithSubject(context.Background(), &authorization.Subject{})

	_, _, _ = s.scopeFor(ctx, authorization.StaffRead, authorization.StaffRead)
	if len(guard.asked) != 1 {
		t.Fatalf("the wide check should be skipped entirely, guard was asked %v", guard.asked)
	}

	guard.asked = nil
	_, _, _ = s.scopeFor(ctx, authorization.StaffRead, authorization.StaffReadAll)
	if len(guard.asked) != 2 {
		t.Fatalf("a distinct wide entity must still be checked, guard was asked %v", guard.asked)
	}
}
