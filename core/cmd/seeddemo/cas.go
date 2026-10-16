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

	"github.com/google/uuid"
)

type casClient struct {
	base     string
	token    string
	password string
	http     *http.Client
}

func newCASClient(base, token, password string) *casClient {
	return &casClient{
		base:     strings.TrimRight(base, "/"),
		token:    token,
		password: password,
		http:     &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *casClient) enabled() bool { return c != nil && c.base != "" && c.token != "" }

func (c *casClient) createUser(ctx context.Context, username, fullName, email string) (uuid.UUID, error) {
	if id, err := c.findUser(ctx, email); err == nil {
		return id, nil
	}

	payload := map[string]any{
		"username":  strings.ToLower(username),
		"full_name": fullName,
		"email":     email,
		"password":  c.password,
	}
	var out struct {
		ID uuid.UUID `json:"id"`
	}
	if err := c.do(ctx, http.MethodPost, "/v1/admin/users", payload, &out); err != nil {
		return uuid.Nil, err
	}
	if out.ID == uuid.Nil {
		return uuid.Nil, fmt.Errorf("cas returned no id for %s", email)
	}
	return out.ID, nil
}

func (c *casClient) findUser(ctx context.Context, email string) (uuid.UUID, error) {
	var out struct {
		Users []struct {
			ID    uuid.UUID `json:"id"`
			Email string    `json:"email"`
		} `json:"users"`
	}
	if err := c.do(ctx, http.MethodGet, "/v1/admin/users?q="+email, nil, &out); err != nil {
		return uuid.Nil, err
	}
	for _, u := range out.Users {
		if strings.EqualFold(u.Email, email) {
			return u.ID, nil
		}
	}
	return uuid.Nil, fmt.Errorf("not found")
}

func (c *casClient) do(ctx context.Context, method, path string, payload, out any) error {
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.base+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("cas %s %s: %s: %s", method, path, resp.Status, strings.TrimSpace(string(raw)))
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(raw, out)
}
