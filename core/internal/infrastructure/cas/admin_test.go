package cas

import (
	"context"
	"testing"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

func TestGuardIsATokenSource(t *testing.T) {
	var _ TokenSource = (*Guard)(nil)
	var _ TokenSource = (*PolicyClient)(nil)
}

func TestAdminClientRequiresConfiguration(t *testing.T) {
	if _, err := NewAdminClient(""); err == nil {
		t.Fatal("an empty base URL must be refused")
	}
}

func TestAdminCallsWithoutASubjectFailClosed(t *testing.T) {
	if _, err := callerToken(context.Background()); err == nil {
		t.Fatal("an admin call with no caller in context must be refused")
	}
}

func TestAdminCallsCarryTheCallersToken(t *testing.T) {
	ctx := authorization.WithSubject(context.Background(),
		&authorization.Subject{RawToken: "caller-token"})
	got, err := callerToken(ctx)
	if err != nil {
		t.Fatalf("a caller with a token is admitted: %v", err)
	}
	if got != "caller-token" {
		t.Fatalf("token = %q, want the caller's own", got)
	}
}

func TestNilGuardTokenSourceFailsClosed(t *testing.T) {
	var g *Guard
	if _, err := g.ServiceToken(context.Background()); err == nil {
		t.Fatal("a nil guard must not hand out a token")
	}
}
