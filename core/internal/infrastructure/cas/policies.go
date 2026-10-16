package cas

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
)

type PolicyConfig struct {
	BaseURL         string
	ClientID        string
	ClientSecret    string
	Audience        string
	SubjectAudience string
	CacheTTL        time.Duration
	HTTPClient      *http.Client
}

type PolicyClient struct {
	cfg  PolicyConfig
	http *http.Client

	mu    sync.RWMutex
	cache map[policyKey]cachedPolicies

	tokenMu     sync.Mutex
	serviceTok  string
	serviceExp  time.Time
	lastEpoch   int64
	lastFetched time.Time
}

type policyKey struct {
	user   uuid.UUID
	tenant string
}

func tenantFor(ctx context.Context) string {
	t, err := tenancy.FromContext(ctx)
	if err != nil || t == nil {
		return ""
	}
	return t.CASTenantID
}

type cachedPolicies struct {
	set       *authorization.PolicySet
	fetchedAt time.Time
}

func NewPolicyClient(cfg PolicyConfig) (*PolicyClient, error) {
	if cfg.BaseURL == "" {
		return nil, errors.New("cas: BaseURL is required")
	}
	if cfg.ClientID == "" || cfg.ClientSecret == "" {
		return nil, errors.New("cas: client credentials are required to call /v1/policies")
	}
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	if cfg.CacheTTL == 0 {
		cfg.CacheTTL = 60 * time.Second
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &PolicyClient{cfg: cfg, http: cfg.HTTPClient, cache: map[policyKey]cachedPolicies{}}, nil
}

func (c *PolicyClient) Policies(ctx context.Context, sub *authorization.Subject) (*authorization.PolicySet, error) {
	key := policyKey{user: sub.CASUserID, tenant: tenantFor(ctx)}

	c.mu.RLock()
	entry, ok := c.cache[key]
	c.mu.RUnlock()
	if ok && time.Since(entry.fetchedAt) < c.cfg.CacheTTL {
		observability.Step(ctx, observability.ComponentCAS, "policy cache hit",
			"policy_epoch", entry.set.PolicyEpoch,
			"age_ms", time.Since(entry.fetchedAt).Milliseconds(),
			"entities", len(entry.set.Entities))
		return entry.set, nil
	}

	started := time.Now()
	set, err := c.fetch(ctx, sub)
	if err != nil {
		if ok && time.Since(entry.fetchedAt) < 2*c.cfg.CacheTTL {
			observability.Problem(ctx, observability.ComponentCAS,
				"policy fetch failed, serving stale", err,
				"age_ms", time.Since(entry.fetchedAt).Milliseconds())
			return entry.set, nil
		}
		observability.Problem(ctx, observability.ComponentCAS, "policy fetch failed", err)
		return nil, err
	}
	observability.Step(ctx, observability.ComponentCAS, "policy fetched",
		"policy_epoch", set.PolicyEpoch, "entities", len(set.Entities),
		"tenant", key.tenant, "took_ms", time.Since(started).Milliseconds())

	c.mu.Lock()
	c.cache[key] = cachedPolicies{set: set, fetchedAt: time.Now()}
	if set.PolicyEpoch > c.lastEpoch {
		if c.lastEpoch != 0 {
			for k := range c.cache {
				if k != key {
					delete(c.cache, k)
				}
			}
			observability.Step(ctx, observability.ComponentCAS, "policy epoch advanced",
				"from", c.lastEpoch, "to", set.PolicyEpoch)
		}
		c.lastEpoch = set.PolicyEpoch
	}
	c.lastFetched = time.Now()
	c.mu.Unlock()

	return set, nil
}

func (c *PolicyClient) fetch(ctx context.Context, sub *authorization.Subject) (*authorization.PolicySet, error) {
	serviceToken, err := c.serviceToken(ctx)
	if err != nil {
		return nil, err
	}

	payload := map[string]any{"token": sub.RawToken}
	if c.cfg.Audience != "" {
		payload["services"] = []string{c.cfg.Audience}
	}
	if c.cfg.SubjectAudience != "" {
		payload["audience"] = c.cfg.SubjectAudience
	}
	if tenant := tenantFor(ctx); tenant != "" {
		payload["tenant"] = tenant
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+"/v1/policies", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Service-Authorization", "Bearer "+serviceToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", authorization.ErrUpstream, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: /v1/policies returned %s", authorization.ErrUpstream, resp.Status)
	}
	return authorization.ParsePolicySet(raw)
}

func (c *PolicyClient) serviceToken(ctx context.Context) (string, error) {
	c.tokenMu.Lock()
	defer c.tokenMu.Unlock()

	if c.serviceTok != "" && time.Until(c.serviceExp) > 30*time.Second {
		return c.serviceTok, nil
	}

	form := url.Values{"grant_type": {"client_credentials"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.cfg.BaseURL+"/oauth/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(c.cfg.ClientID, c.cfg.ClientSecret)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %v", authorization.ErrUpstream, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%w: /oauth/token returned %s", authorization.ErrUpstream, resp.Status)
	}

	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.AccessToken == "" {
		return "", errors.New("cas: /oauth/token returned no access_token")
	}

	c.serviceTok = out.AccessToken
	if out.ExpiresIn > 0 {
		c.serviceExp = time.Now().Add(time.Duration(out.ExpiresIn) * time.Second)
	} else {
		c.serviceExp = time.Now().Add(5 * time.Minute)
	}
	return c.serviceTok, nil
}

type Guard struct {
	policies *PolicyClient
}

func NewGuard(p *PolicyClient) *Guard { return &Guard{policies: p} }

func emptySetHint(tenant string) string {
	if tenant == "" {
		return "this school has no cas_tenant_id, so CAS was asked without a tenant and answered with estate-wide grants only"
	}
	return "CAS returned nothing for tenant " + tenant + ": either no grant is scoped to it, or a grant is scoped to a group CAS has not tagged with a tenant"
}

func (g *Guard) Allow(ctx context.Context, sub *authorization.Subject, entity authorization.Entity, attrs authorization.Attributes) (authorization.Decision, error) {
	if sub == nil {
		return authorization.Decision{Reason: "no subject"}, authorization.ErrNoSubject
	}

	set, err := g.policies.Policies(ctx, sub)
	if err != nil {
		return authorization.Decision{Reason: "policy source unavailable"}, err
	}

	decision, _ := set.Allows(entity, attrs)
	if !decision.Allowed && len(set.Entities) == 0 {
		observability.Decision(ctx, false, "no grants at all for this caller in this school",
			"entity", string(entity), "tenant", tenantFor(ctx),
			"hint", emptySetHint(tenantFor(ctx)))
	}
	observability.Step(ctx, observability.ComponentAuthz, "policy evaluated",
		"entity", string(entity), "allowed", decision.Allowed,
		"rule", decision.Rule, "reason", decision.Reason,
		"reach", string(decision.Reach),
		"granted_entities", len(set.Entities),
		"field_mode", fieldMode(decision.Fields))
	return decision, nil
}

func (g *Guard) Name() string { return "cas" }

func (c *PolicyClient) Forget(userID uuid.UUID) {
	if c == nil {
		return
	}
	c.mu.Lock()
	for k := range c.cache {
		if k.user == userID {
			delete(c.cache, k)
		}
	}
	c.mu.Unlock()
}

func (g *Guard) Forget(userID uuid.UUID) {
	if g == nil {
		return
	}
	g.policies.Forget(userID)
}

func (c *PolicyClient) ServiceToken(ctx context.Context) (string, error) {
	return c.serviceToken(ctx)
}

func (g *Guard) ServiceToken(ctx context.Context) (string, error) {
	if g == nil || g.policies == nil {
		return "", errors.New("cas: no policy client")
	}
	return g.policies.ServiceToken(ctx)
}

func fieldMode(f *authorization.FieldPolicy) string {
	if f == nil || f.Mode == "" {
		return "unrestricted"
	}
	return string(f.Mode)
}
