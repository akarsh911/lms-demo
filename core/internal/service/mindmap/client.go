package mindmap

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var (
	ErrNoBaseURL = errors.New("mindmap: a mind-map service base URL is required")

	ErrNoTenant = errors.New("mindmap: a CAS tenant slug is required")

	ErrNoDocument = errors.New("mindmap: an engine document id is required")

	ErrNoSection = errors.New("mindmap: a section id is required")

	ErrUnreachable = errors.New("mindmap: the mind-map service is unreachable")

	ErrUnreadable = errors.New("mindmap: the mind-map service answered with a body that cannot be read")
)

const (
	tenantHeader = "X-School-Id"

	bearerHeader = "Authorization"

	bearerScheme = "Bearer "

	maxReplyBytes = 16 << 20

	DefaultTimeout = 30 * time.Second
)

type ClientConfig struct {
	BaseURL string
	Timeout time.Duration
}

type Client struct {
	baseURL  string
	http     *http.Client
	sections *sectionCache
}

func NewClient(cfg ClientConfig) (*Client, error) {
	base := strings.TrimSpace(cfg.BaseURL)
	if base == "" {
		return nil, ErrNoBaseURL
	}
	parsed, err := url.Parse(base)
	if err != nil {
		return nil, fmt.Errorf("mindmap: unusable base URL %q: %w", base, err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("mindmap: base URL %q names no scheme and host", base)
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	return &Client{
		baseURL: strings.TrimRight(base, "/"),
		http: &http.Client{
			Timeout:       timeout,
			CheckRedirect: refuseRedirect,
		},
		sections: newSectionCache(SectionCacheTTL, SectionCacheLimit, time.Now),
	}, nil
}

func refuseRedirect(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

func (c *Client) String() string { return "mind-map service at " + c.baseURL }

type Caller struct {
	Tenant string
	Bearer string
}

func (c Caller) authorization() string {
	token := strings.TrimSpace(c.Bearer)
	token = strings.TrimSpace(strings.TrimPrefix(token, bearerScheme))
	if token == "" {
		return ""
	}
	return bearerScheme + token
}

func (c Caller) digest() callerDigest {
	return sha256.Sum256([]byte(c.authorization()))
}

func (c Caller) holding(document string) sectionKey {
	return sectionKey{
		tenant:   strings.TrimSpace(c.Tenant),
		document: document,
		caller:   c.digest(),
	}
}

type Reply struct {
	Status int
	Body   []byte
}

func (r Reply) OK() bool { return r.Status == http.StatusOK }

func (r Reply) Detail() string {
	var body struct {
		Detail json.RawMessage `json:"detail"`
	}
	if err := json.Unmarshal(r.Body, &body); err != nil {
		return ""
	}

	var sentence string
	if err := json.Unmarshal(body.Detail, &sentence); err != nil {
		return ""
	}
	return strings.TrimSpace(sentence)
}

type TraceQuery struct {
	From    string
	To      string
	MaxHops *int
}

type DrillQuery struct {
	Kind    string
	N       *int
	Seed    *int
	TopicID string
}

type Attempt struct {
	Kind    *string           `json:"kind,omitempty"`
	N       *int              `json:"n,omitempty"`
	Seed    *int              `json:"seed,omitempty"`
	TopicID *string           `json:"topic_id,omitempty"`
	Answers map[string]string `json:"answers"`
}

func (c *Client) Chapters(ctx context.Context, caller Caller, documentID string) (Reply, error) {
	reply, _, err := c.chapters(ctx, caller, documentID)
	return reply, err
}

func (c *Client) chapters(ctx context.Context, caller Caller,
	documentID string) (Reply, []Section, error) {

	document := strings.TrimSpace(documentID)
	if document == "" {
		return Reply{}, nil, ErrNoDocument
	}

	reply, err := c.get(ctx, caller, "/chapters", url.Values{"document_id": {document}})
	if err != nil || !reply.OK() {
		return reply, nil, err
	}

	sections, err := SectionsOf(reply.Body, document)
	if err != nil {
		return Reply{}, nil, err
	}
	c.sections.store(caller.holding(document), sections)
	return reply, sections, nil
}

func (c *Client) Sections(ctx context.Context, caller Caller,
	documentID string) ([]Section, *Reply, error) {

	document := strings.TrimSpace(documentID)
	if document == "" {
		return nil, nil, ErrNoDocument
	}

	key := caller.holding(document)
	if listed, fresh := c.sections.list(key); fresh {
		return listed, nil, nil
	}

	reply, sections, err := c.chapters(ctx, caller, document)
	if err != nil {
		return nil, nil, err
	}
	if !reply.OK() {
		return nil, &reply, nil
	}
	return sections, nil, nil
}

func (c *Client) HasSection(ctx context.Context, caller Caller,
	documentID, sectionID string) (bool, *Reply, error) {

	document := strings.TrimSpace(documentID)
	if document == "" {
		return false, nil, ErrNoDocument
	}
	if strings.TrimSpace(sectionID) == "" {
		return false, nil, ErrNoSection
	}

	key := caller.holding(document)
	if c.sections.holds(key, sectionID) {
		return true, nil, nil
	}

	reply, err := c.Chapters(ctx, caller, document)
	if err != nil {
		return false, nil, err
	}
	if !reply.OK() {
		return false, &reply, nil
	}
	return c.sections.holds(key, sectionID), nil, nil
}

func (c *Client) Map(ctx context.Context, caller Caller, sectionID string) (Reply, error) {
	path, err := mapPath(sectionID)
	if err != nil {
		return Reply{}, err
	}
	return c.get(ctx, caller, path, nil)
}

func (c *Client) Node(ctx context.Context, caller Caller, sectionID, nodeID string) (Reply, error) {
	path, err := mapPath(sectionID)
	if err != nil {
		return Reply{}, err
	}
	return c.get(ctx, caller, path+"/node/"+url.PathEscape(nodeID), nil)
}

func (c *Client) Trace(ctx context.Context, caller Caller, sectionID string,
	q TraceQuery) (Reply, error) {

	path, err := mapPath(sectionID)
	if err != nil {
		return Reply{}, err
	}
	query := url.Values{"from": {q.From}, "to": {q.To}}
	if q.MaxHops != nil {
		query.Set("max_hops", strconv.Itoa(*q.MaxHops))
	}
	return c.get(ctx, caller, path+"/trace", query)
}

func (c *Client) Drill(ctx context.Context, caller Caller, sectionID string,
	q DrillQuery) (Reply, error) {

	path, err := mapPath(sectionID)
	if err != nil {
		return Reply{}, err
	}
	query := url.Values{"with_answers": {"false"}}
	if q.Kind != "" {
		query.Set("kind", q.Kind)
	}
	if q.N != nil {
		query.Set("n", strconv.Itoa(*q.N))
	}
	if q.Seed != nil {
		query.Set("seed", strconv.Itoa(*q.Seed))
	}
	if q.TopicID != "" {
		query.Set("topic_id", q.TopicID)
	}
	return c.get(ctx, caller, path+"/drill", query)
}

func (c *Client) Grade(ctx context.Context, caller Caller, sectionID string,
	attempt Attempt) (Reply, error) {

	path, err := mapPath(sectionID)
	if err != nil {
		return Reply{}, err
	}
	if attempt.Answers == nil {
		attempt.Answers = map[string]string{}
	}
	body, err := json.Marshal(attempt)
	if err != nil {
		return Reply{}, fmt.Errorf("mindmap: encoding the attempt: %w", err)
	}
	return c.send(ctx, caller, http.MethodPost, path+"/drill/grade", nil, body)
}

func mapPath(sectionID string) (string, error) {
	if strings.TrimSpace(sectionID) == "" {
		return "", ErrNoSection
	}
	return "/map/" + url.PathEscape(sectionID), nil
}

func (c *Client) get(ctx context.Context, caller Caller, path string,
	query url.Values) (Reply, error) {
	return c.send(ctx, caller, http.MethodGet, path, query, nil)
}

func (c *Client) send(ctx context.Context, caller Caller, method, path string,
	query url.Values, body []byte) (Reply, error) {

	tenant := strings.TrimSpace(caller.Tenant)
	if tenant == "" {
		return Reply{}, ErrNoTenant
	}

	target := c.baseURL + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}

	var payload io.Reader
	if body != nil {
		payload = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, payload)
	if err != nil {
		return Reply{}, fmt.Errorf("mindmap: building the request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set(tenantHeader, tenant)
	if authorization := caller.authorization(); authorization != "" {
		req.Header.Set(bearerHeader, authorization)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return Reply{}, fmt.Errorf("%w: %w", ErrUnreachable, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxReplyBytes+1))
	if err != nil {
		return Reply{}, fmt.Errorf("%w: %w", ErrUnreachable, err)
	}
	if len(raw) > maxReplyBytes {
		return Reply{}, fmt.Errorf("%w: more than %d bytes", ErrUnreadable, maxReplyBytes)
	}
	return Reply{Status: resp.StatusCode, Body: raw}, nil
}

type treePage int

func (p *treePage) UnmarshalJSON(raw []byte) error {
	var n float64
	if err := json.Unmarshal(raw, &n); err != nil || n < 1 {
		*p = 0
		return nil
	}
	*p = treePage(n)
	return nil
}

type treeSection struct {
	ID           string          `json:"id"`
	Number       string          `json:"number"`
	Title        string          `json:"title"`
	Display      string          `json:"display"`
	DisplayLabel string          `json:"display_label"`
	PageStart    treePage        `json:"page_start"`
	PageEnd      treePage        `json:"page_end"`
	PageRange    json.RawMessage `json:"page_range"`
	Children     json.RawMessage `json:"children"`
	Sections     json.RawMessage `json:"sections"`
}

type treeDocument struct {
	DocumentID string        `json:"document_id"`
	Sections   []treeSection `json:"sections"`
}

func SectionsOf(raw []byte, documentID string) ([]Section, error) {
	var tree struct {
		Documents *[]treeDocument `json:"documents"`
	}
	if err := json.Unmarshal(raw, &tree); err != nil {
		return nil, fmt.Errorf("%w: the chapter list is not JSON: %w", ErrUnreadable, err)
	}
	if tree.Documents == nil {
		return nil, fmt.Errorf("%w: the chapter list names no documents", ErrUnreadable)
	}

	var out []Section
	seen := map[string]struct{}{}
	for _, document := range *tree.Documents {
		if document.DocumentID != documentID {
			continue
		}
		out = collectSections(document.Sections, seen, out)
	}
	return out, nil
}

func collectSections(sections []treeSection, seen map[string]struct{}, into []Section) []Section {
	for _, section := range sections {
		if _, dup := seen[section.ID]; section.ID != "" && !dup {
			seen[section.ID] = struct{}{}
			into = append(into, sectionOf(section))
		}
		into = collectSections(nestedSections(section.Children), seen, into)
		into = collectSections(nestedSections(section.Sections), seen, into)
	}
	return into
}

func nestedSections(raw json.RawMessage) []treeSection {
	var nested []treeSection
	if err := json.Unmarshal(raw, &nested); err != nil {
		return nil
	}
	return nested
}

func sectionOf(section treeSection) Section {
	out := Section{ID: section.ID, Display: sectionDisplay(section)}

	first, last, known := sectionPages(section)
	if known {
		out.PageStart, out.PageEnd = &first, &last
	}
	return out
}

func sectionPages(section treeSection) (int, int, bool) {
	if first := int(section.PageStart); first > 0 {
		last := int(section.PageEnd)
		if last < first {
			last = first
		}
		return first, last, true
	}

	var landed []treePage
	if err := json.Unmarshal(section.PageRange, &landed); err != nil || len(landed) != 2 {
		return 0, 0, false
	}
	first, last := int(landed[0]), int(landed[1])
	if first < 1 || last < first {
		return 0, 0, false
	}
	return first, last, true
}

func sectionDisplay(section treeSection) string {
	for _, candidate := range []string{section.DisplayLabel, section.Display} {
		if text := strings.TrimSpace(candidate); text != "" {
			return text
		}
	}

	number, title := strings.TrimSpace(section.Number), strings.TrimSpace(section.Title)
	switch {
	case number != "" && title != "":
		return number + ". " + title
	case title != "":
		return title
	default:
		return section.ID
	}
}
