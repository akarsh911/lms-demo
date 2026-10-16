package cas

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRelayPassesBackRetryAfter(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "120")
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Set-Cookie", "session=leaky")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"too_many_attempts"}`))
	}))
	defer upstream.Close()

	proxy, err := NewAuthProxy(ProxyConfig{BaseURL: upstream.URL})
	if err != nil {
		t.Fatalf("proxy: %v", err)
	}

	in := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login",
		strings.NewReader(`{"identifier":"a","password":"b"}`))
	out, err := proxy.Do(context.Background(), "login", in)
	if err != nil {
		t.Fatalf("relay: %v", err)
	}

	if out.Status != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", out.Status)
	}
	if got := out.Header.Get("Retry-After"); got != "120" {
		t.Fatalf("Retry-After = %q, want 120", got)
	}
	if out.Header.Get("Set-Cookie") != "" {
		t.Fatal("Set-Cookie must not be relayed back")
	}
}

func TestRelayForwardsTheRealClientAddress(t *testing.T) {
	var seen string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("X-Forwarded-For")
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	proxy, _ := NewAuthProxy(ProxyConfig{BaseURL: upstream.URL})
	in := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(`{}`))
	in.Header.Set("X-Forwarded-For", "203.0.113.7, 10.0.0.1")

	if _, err := proxy.Do(context.Background(), "login", in); err != nil {
		t.Fatalf("relay: %v", err)
	}
	if seen != "203.0.113.7" {
		t.Fatalf("forwarded %q, want the leftmost client address", seen)
	}
}

func TestRelayRefusesAnUnknownRoute(t *testing.T) {
	proxy, _ := NewAuthProxy(ProxyConfig{BaseURL: "https://cas.example"})
	in := httptest.NewRequest(http.MethodPost, "/x", nil)

	if _, err := proxy.Do(context.Background(), "../../admin/users", in); err == nil {
		t.Fatal("an unlisted route name must be refused")
	}
}
