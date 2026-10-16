package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type apiClient struct {
	base   string
	token  string
	school string
	group  string
	pass   string
	http   *http.Client
}

func newAPIClient(base, token, school, group, pass string) *apiClient {
	return &apiClient{
		base:   strings.TrimRight(base, "/"),
		token:  token,
		school: school,
		group:  group,
		pass:   pass,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

func (a *apiClient) enabled() bool {
	return a != nil && a.base != "" && a.token != "" && a.school != ""
}

func (a *apiClient) person(username, first, last, email, phone string) map[string]any {
	out := map[string]any{
		"username":   strings.ToLower(username),
		"email":      email,
		"phone":      phone,
		"first_name": first,
		"last_name":  last,
		"password":   a.pass,
	}
	if a.group != "" {
		out["group_keys"] = []string{a.group}
	}
	return out
}

func (a *apiClient) post(ctx context.Context, path string, payload map[string]any) (map[string]any, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.base+path, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+a.token)
	req.Header.Set("X-School-Id", a.school)
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("POST %s: %s: %s", path, resp.Status, strings.TrimSpace(string(body)))
	}

	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, nil
	}
	return out, nil
}
