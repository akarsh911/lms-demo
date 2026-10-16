package cas

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const MaxAuthBody = 256 << 10

var ErrProxyDisabled = errors.New("cas: the login relay is not enabled")

type AuthProxy struct {
	baseURL string
	http    *http.Client
	routes  map[string]route
}

type route struct {
	method string
	path   string
}

type ProxyConfig struct {
	BaseURL    string
	Timeout    time.Duration
	HTTPClient *http.Client
}

func NewAuthProxy(cfg ProxyConfig) (*AuthProxy, error) {
	if cfg.BaseURL == "" {
		return nil, errors.New("cas: BaseURL is required for the login relay")
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 15 * time.Second
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: cfg.Timeout}
	}

	return &AuthProxy{
		baseURL: strings.TrimRight(cfg.BaseURL, "/"),
		http:    cfg.HTTPClient,
		routes: map[string]route{
			"login":           {http.MethodPost, "/v1/auth/login"},
			"login-verify":    {http.MethodPost, "/v1/auth/login/verify"},
			"otp-start":       {http.MethodPost, "/v1/auth/otp/start"},
			"refresh":         {http.MethodPost, "/v1/auth/refresh"},
			"logout":          {http.MethodPost, "/v1/auth/logout"},
			"password-change": {http.MethodPost, "/v1/auth/password/change"},
			"password-reset":  {http.MethodPost, "/v1/auth/password/reset"},
			"me":              {http.MethodGet, "/v1/me"},
		},
	}, nil
}

type Response struct {
	Status int
	Body   []byte
	Header http.Header
}

func (r *Response) ContentType() string {
	if ct := r.Header.Get("Content-Type"); ct != "" {
		return ct
	}
	return "application/json; charset=utf-8"
}

var relayedRequestHeaders = []string{
	"Content-Type",
	"Accept",
	"Accept-Language",
	"User-Agent",
	"Authorization",
	"X-Forwarded-For",
	"X-Request-Id",
}

var relayedResponseHeaders = []string{
	"Content-Type",
	"WWW-Authenticate",
	"Retry-After",
	"X-Request-Id",
}

func (p *AuthProxy) Do(ctx context.Context, name string, in *http.Request) (*Response, error) {
	if p == nil {
		return nil, ErrProxyDisabled
	}
	target, ok := p.routes[name]
	if !ok {
		return nil, fmt.Errorf("cas: no relay route named %q", name)
	}

	var body io.Reader
	if in.Body != nil && target.method != http.MethodGet {
		raw, err := io.ReadAll(io.LimitReader(in.Body, MaxAuthBody))
		if err != nil {
			return nil, fmt.Errorf("cas: read request: %w", err)
		}
		body = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, target.method, p.baseURL+target.path, body)
	if err != nil {
		return nil, err
	}
	for _, h := range relayedRequestHeaders {
		if v := in.Header.Get(h); v != "" {
			req.Header.Set(h, v)
		}
	}

	if clientIP := clientAddr(in); clientIP != "" {
		req.Header.Set("X-Forwarded-For", clientIP)
	}
	if req.Header.Get("Content-Type") == "" && body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := p.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("cas: relay %s: %w", name, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, MaxAuthBody))
	if err != nil {
		return nil, fmt.Errorf("cas: read response: %w", err)
	}

	out := &Response{Status: resp.StatusCode, Body: raw, Header: http.Header{}}
	for _, h := range relayedResponseHeaders {
		if v := resp.Header.Get(h); v != "" {
			out.Header.Set(h, v)
		}
	}
	return out, nil
}

func clientAddr(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if first, _, ok := strings.Cut(xff, ","); ok {
			return strings.TrimSpace(first)
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return strings.TrimSpace(r.RemoteAddr)
	}
	return host
}
