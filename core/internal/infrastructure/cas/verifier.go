package cas

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

var (
	ErrNoToken      = errors.New("cas: no bearer token")
	ErrInvalidToken = errors.New("cas: token is not valid")
	ErrUnknownKey   = errors.New("cas: no JWKS key for that kid")
)

type Config struct {
	BaseURL    string
	Issuer     string
	Audience   string
	JWKSTTL    time.Duration
	HTTPClient *http.Client
}

type Verifier struct {
	cfg  Config
	http *http.Client

	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

func NewVerifier(cfg Config) (*Verifier, error) {
	if cfg.BaseURL == "" {
		return nil, errors.New("cas: BaseURL is required")
	}
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	if cfg.JWKSTTL == 0 {
		cfg.JWKSTTL = 15 * time.Minute
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &Verifier{cfg: cfg, http: cfg.HTTPClient, keys: map[string]*rsa.PublicKey{}}, nil
}

func (v *Verifier) Warm(ctx context.Context) error { return v.refresh(ctx) }

func (v *Verifier) VerifyAccessToken(ctx context.Context, raw string) (*authorization.Subject, error) {
	raw = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(raw), "Bearer "))
	if raw == "" {
		return nil, ErrNoToken
	}

	parserOpts := []jwt.ParserOption{
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithExpirationRequired(),
	}
	if v.cfg.Issuer != "" {
		parserOpts = append(parserOpts, jwt.WithIssuer(v.cfg.Issuer))
	}
	if v.cfg.Audience != "" {
		parserOpts = append(parserOpts, jwt.WithAudience(v.cfg.Audience))
	}

	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		return v.keyFor(ctx, kid)
	}, parserOpts...)
	if err != nil {
		if errors.Is(err, authorization.ErrUpstream) {
			return nil, err
		}
		return nil, fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}

	sub, _ := claims["sub"].(string)
	userID, err := uuid.Parse(sub)
	if err != nil {
		return nil, fmt.Errorf("%w: sub is not a UUID", ErrInvalidToken)
	}

	subject := &authorization.Subject{
		CASUserID: userID,
		RawToken:  raw,
	}
	if sid, ok := claims["sid"].(string); ok {
		subject.SessionID = sid
	}
	if tid, ok := claims["tenant_id"].(string); ok {
		subject.TenantID = tid
	}
	if cid, ok := claims["client_id"].(string); ok {
		subject.ClientID = cid
	}
	if scope, ok := claims["scope"].(string); ok && scope != "" {
		subject.Scopes = strings.Fields(scope)
	}
	return subject, nil
}

func (v *Verifier) keyFor(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	if kid == "" {
		return nil, ErrUnknownKey
	}

	v.mu.RLock()
	key, ok := v.keys[kid]
	fresh := time.Since(v.fetchedAt) < v.cfg.JWKSTTL
	v.mu.RUnlock()
	if ok && fresh {
		return key, nil
	}

	if err := v.refresh(ctx); err != nil {
		if ok {
			return key, nil
		}
		return nil, fmt.Errorf("%w: %w", authorization.ErrUpstream, err)
	}

	v.mu.RLock()
	defer v.mu.RUnlock()
	if key, ok := v.keys[kid]; ok {
		return key, nil
	}
	return nil, fmt.Errorf("%w: %s", ErrUnknownKey, kid)
}

type jwks struct {
	Keys []struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		Alg string `json:"alg"`
		Use string `json:"use"`
		N   string `json:"n"`
		E   string `json:"e"`
	} `json:"keys"`
}

func (v *Verifier) refresh(ctx context.Context) error {
	url := v.cfg.BaseURL + "/.well-known/jwks.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	resp, err := v.http.Do(req)
	if err != nil {
		return fmt.Errorf("cas: fetch jwks: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("cas: jwks returned %s", resp.Status)
	}

	var set jwks
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return fmt.Errorf("cas: decode jwks: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(set.Keys))
	for _, k := range set.Keys {
		if k.Kty != "RSA" || k.Kid == "" {
			continue
		}
		pub, err := rsaKey(k.N, k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = pub
	}
	if len(keys) == 0 {
		return errors.New("cas: jwks contained no usable RSA keys")
	}

	v.mu.Lock()
	v.keys = keys
	v.fetchedAt = time.Now()
	v.mu.Unlock()
	return nil
}

func rsaKey(nB64, eB64 string) (*rsa.PublicKey, error) {
	n, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(nB64, "="))
	if err != nil {
		return nil, err
	}
	e, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(eB64, "="))
	if err != nil {
		return nil, err
	}
	if len(e) == 0 {
		return nil, errors.New("cas: empty exponent")
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(n),
		E: int(new(big.Int).SetBytes(e).Int64()),
	}, nil
}
