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
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

var (
	ErrProvisioningUnavailable = errors.New("cas: this service may not create users")

	ErrCallerRejected = errors.New("cas rejected the caller's token")

	ErrCallerForbidden = errors.New("cas refused the caller")

	ErrUserExists = errors.New("cas: that identity already exists")

	ErrUsernameTaken = errors.New("cas: that username is already taken")

	ErrEmailTaken = errors.New("cas: that email address is already registered")

	ErrLookupUnsupported = errors.New("cas: user lookup is not available")
)

type TokenSource interface {
	ServiceToken(ctx context.Context) (string, error)
}

type AdminClient struct {
	baseURL string
	http    *http.Client
}

func NewAdminClient(baseURL string) (*AdminClient, error) {
	if baseURL == "" {
		return nil, errors.New("cas: BaseURL is required")
	}
	return &AdminClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: 20 * time.Second},
	}, nil
}

func callerToken(ctx context.Context) (string, error) {
	sub, err := authorization.SubjectFrom(ctx)
	if err != nil || sub.RawToken == "" {
		return "", fmt.Errorf("%w: CAS admin routes read a session id from the token, "+
			"and a client_credentials token carries none, so this runs as the caller",
			ErrProvisioningUnavailable)
	}
	return sub.RawToken, nil
}

type NewUser struct {
	Username           string `json:"username"`
	Email              string `json:"email,omitempty"`
	Phone              string `json:"phone,omitempty"`
	FullName           string `json:"full_name,omitempty"`
	Password           string `json:"password"`
	PreferredTwoFactor string `json:"preferred_2fa_channel,omitempty"`
	GroupID            string `json:"group_id,omitempty"`

	GroupKeys []string `json:"-"`
}

type User struct {
	ID       uuid.UUID `json:"id"`
	Username string    `json:"username"`
	Email    string    `json:"email,omitempty"`
	Phone    string    `json:"phone,omitempty"`
	FullName string    `json:"full_name,omitempty"`
	Status   string    `json:"status,omitempty"`
}

func (c *AdminClient) CreateUser(ctx context.Context, in NewUser) (*User, error) {
	body, err := json.Marshal(in)
	if err != nil {
		return nil, err
	}

	status, raw, err := c.do(ctx, http.MethodPost, "/v1/admin/users", body)
	if err != nil {
		return nil, err
	}

	switch {
	case status == http.StatusConflict:
		return nil, conflictKind(raw)
	case status < 200 || status > 299:
		return nil, fmt.Errorf("cas: create user returned %d: %s", status, casMessage(raw))
	}

	return decodeUser(raw)
}

type Group struct {
	ID       uuid.UUID `json:"id"`
	Key      *string   `json:"key,omitempty"`
	Name     string    `json:"name"`
	TenantID *string   `json:"tenant_id,omitempty"`
}

func (g *Group) Tenant() string {
	if g == nil || g.TenantID == nil {
		return ""
	}
	return *g.TenantID
}

var ErrGroupNotFound = errors.New("cas: no group matches")

func (c *AdminClient) LookupGroup(ctx context.Context, key string) (*Group, error) {
	status, raw, err := c.do(ctx, http.MethodGet,
		"/v1/admin/groups?q="+url.QueryEscape(key), nil)
	if err != nil {
		return nil, err
	}
	if status < 200 || status > 299 {
		return nil, fmt.Errorf("cas: group lookup returned %d", status)
	}

	var groups []Group
	if err := json.Unmarshal(raw, &groups); err != nil {
		return nil, fmt.Errorf("cas: could not read groups: %w", err)
	}
	for i := range groups {
		g := &groups[i]
		if (g.Key != nil && strings.EqualFold(*g.Key, key)) || strings.EqualFold(g.Name, key) {
			return g, nil
		}
	}
	return nil, fmt.Errorf("%w %q", ErrGroupNotFound, key)
}

func (c *AdminClient) FindGroup(ctx context.Context, key string) (uuid.UUID, error) {
	g, err := c.LookupGroup(ctx, key)
	if err != nil {
		return uuid.Nil, err
	}
	return g.ID, nil
}

func (c *AdminClient) CreateGroup(ctx context.Context, key, name string) (*Group, error) {
	body, err := json.Marshal(map[string]any{"key": key, "name": name, "type": "organizational"})
	if err != nil {
		return nil, err
	}
	status, raw, err := c.do(ctx, http.MethodPost, "/v1/admin/groups", body)
	if err != nil {
		return nil, err
	}
	if status == http.StatusConflict {
		return c.LookupGroup(ctx, key)
	}
	if status < 200 || status > 299 {
		return nil, fmt.Errorf("cas: create group returned %d: %s", status, strings.TrimSpace(string(raw)))
	}

	var g Group
	if err := json.Unmarshal(raw, &g); err != nil || g.ID == uuid.Nil {
		return nil, fmt.Errorf("cas: create group returned no id")
	}
	return &g, nil
}

func (c *AdminClient) TagGroupTenant(ctx context.Context, groupID uuid.UUID, tenant string) error {
	body, err := json.Marshal(map[string]any{"tenant_id": tenant})
	if err != nil {
		return err
	}
	status, raw, err := c.do(ctx, http.MethodPut,
		fmt.Sprintf("/v1/admin/groups/%s/tenant", groupID), body)
	if err != nil {
		return err
	}
	if status < 200 || status > 299 {
		return fmt.Errorf("cas: tagging %s with tenant %q returned %d: %s",
			groupID, tenant, status, strings.TrimSpace(string(raw)))
	}
	return nil
}

func (c *AdminClient) AddUserToGroup(ctx context.Context, groupKey string, userID uuid.UUID) error {
	groupID, err := c.FindGroup(ctx, groupKey)
	if err != nil {
		return err
	}
	status, _, err := c.do(ctx, http.MethodPost,
		fmt.Sprintf("/v1/admin/groups/%s/users/%s", groupID, userID), nil)
	if err != nil {
		return err
	}
	if status < 200 || status > 299 {
		return fmt.Errorf("cas: adding %s to %s returned %d", userID, groupKey, status)
	}
	return nil
}

func (c *AdminClient) FindUser(ctx context.Context, identifier string) (*User, error) {
	if identifier == "" {
		return nil, errors.New("cas: an identifier is required")
	}

	status, raw, err := c.do(ctx, http.MethodGet,
		"/v1/admin/users?q="+url.QueryEscape(identifier), nil)
	if err != nil {
		return nil, err
	}
	if status < 200 || status > 299 {
		return nil, ErrLookupUnsupported
	}
	if user := matchUser(raw, identifier); user != nil {
		return user, nil
	}
	return nil, ErrLookupUnsupported
}

func (c *AdminClient) do(ctx context.Context, method, path string, body []byte) (int, []byte, error) {
	token, err := callerToken(ctx)
	if err != nil {
		return 0, nil, err
	}

	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("cas: admin request: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, nil, err
	}

	switch resp.StatusCode {
	case http.StatusUnauthorized:
		return resp.StatusCode, raw, fmt.Errorf("%w: %s", ErrCallerRejected, casMessage(raw))
	case http.StatusForbidden:
		return resp.StatusCode, raw, fmt.Errorf("%w: %s", ErrCallerForbidden, casMessage(raw))
	}
	return resp.StatusCode, raw, nil
}

func matchUser(raw []byte, identifier string) *User {
	for _, u := range candidates(raw) {
		if u == nil || u.ID == uuid.Nil {
			continue
		}
		if strings.EqualFold(u.Username, identifier) || strings.EqualFold(u.Email, identifier) {
			return u
		}
	}
	return nil
}

func candidates(raw []byte) []*User {
	var list []*User
	if err := json.Unmarshal(raw, &list); err == nil && len(list) > 0 {
		return list
	}
	var wrapped struct {
		Users []*User `json:"users"`
		Data  []*User `json:"data"`
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil {
		if len(wrapped.Users) > 0 {
			return wrapped.Users
		}
		return wrapped.Data
	}
	return nil
}

func conflictKind(raw []byte) error {
	var body struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(raw, &body); err == nil {
		switch body.Code {
		case "username_taken":
			return ErrUsernameTaken
		case "email_taken":
			return ErrEmailTaken
		}
	}
	return ErrUserExists
}

func casMessage(raw []byte) string {
	var body struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	}
	if err := json.Unmarshal(raw, &body); err != nil || body.Message == "" {
		return strings.TrimSpace(string(raw))
	}
	if body.Code != "" {
		return body.Message + " (" + body.Code + ")"
	}
	return body.Message
}

func decodeUser(raw []byte) (*User, error) {
	var direct User
	if err := json.Unmarshal(raw, &direct); err == nil && direct.ID != uuid.Nil {
		return &direct, nil
	}

	var wrapped struct {
		User  *User   `json:"user"`
		Data  *User   `json:"data"`
		Users []*User `json:"users"`
	}
	if err := json.Unmarshal(raw, &wrapped); err != nil {
		return nil, errors.New("cas: could not read the user from the response")
	}
	switch {
	case wrapped.User != nil && wrapped.User.ID != uuid.Nil:
		return wrapped.User, nil
	case wrapped.Data != nil && wrapped.Data.ID != uuid.Nil:
		return wrapped.Data, nil
	case len(wrapped.Users) == 1 && wrapped.Users[0].ID != uuid.Nil:
		return wrapped.Users[0], nil
	}
	return nil, errors.New("cas: the response carried no user id")
}
