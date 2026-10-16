package indexing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

var (
	ErrNoBaseURL = errors.New("indexing: a retrieval engine base URL is required")

	ErrNoTenant = errors.New("indexing: a CAS tenant slug is required")

	ErrEngineUnreachable = errors.New("indexing: the retrieval engine is unreachable")

	ErrEngineRejected = errors.New("indexing: the retrieval engine refused the document")

	ErrGateUnenforceable = errors.New("indexing: the retrieval engine cannot enforce scope labels")

	ErrUnsupportedMedia = errors.New("indexing: the retrieval engine does not accept this file type")

	ErrNoQuery = errors.New("indexing: a search needs a query")

	ErrUnscopedSearch = errors.New("indexing: a search carrying no document ids would search every document in the tenant")

	ErrScopeContradiction = errors.New("indexing: a whole-tenant search cannot also carry document ids")

	ErrEngineRefusedScope = errors.New("indexing: the retrieval engine refused the scope this search asserted")

	ErrDocumentUnpublished = errors.New("indexing: the retrieval engine has published no document under this id")
)

const (
	StatusQueued              = "queued"
	StatusRunning             = "running"
	StatusIndexed             = "indexed"
	StatusDuplicate           = "duplicate"
	StatusPendingConfirmation = "pending_confirmation"
	StatusHeld                = "held"
	StatusFailed              = "failed"
)

const scopeSchool = "school"

const modeSearch = "SEARCH"

const tenantHeader = "X-School-Id"

const adminTokenHeader = "X-Admin-Token"

const curriculumNodesParam = "curriculum_node_ids"

const modeParam = "mode"

const (
	ModeNow   = "now"
	ModeDefer = "defer"
)

func ResolvedMode(mode string) string {
	if strings.TrimSpace(mode) == ModeDefer {
		return ModeDefer
	}
	return ModeNow
}

func IsPDF(filename string) bool {
	name := strings.TrimSpace(filename)
	dot := strings.LastIndex(name, ".")
	if dot < 0 {
		return false
	}
	return strings.ToLower(name[dot+1:]) == "pdf"
}

const emptyJSONArray = "[]"

func Terminal(status string) bool {
	switch status {
	case StatusIndexed, StatusDuplicate, StatusPendingConfirmation, StatusHeld, StatusFailed:
		return true
	}
	return false
}

type ClientConfig struct {
	BaseURL    string
	AdminToken string
	Timeout    time.Duration
}

type Client struct {
	baseURL    string
	adminToken string
	http       *http.Client
}

func NewClient(cfg ClientConfig) (*Client, error) {
	base := strings.TrimSpace(cfg.BaseURL)
	if base == "" {
		return nil, ErrNoBaseURL
	}
	if _, err := url.Parse(base); err != nil {
		return nil, fmt.Errorf("indexing: unusable base URL %q: %w", base, err)
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	return &Client{
		baseURL:    strings.TrimRight(base, "/"),
		adminToken: strings.TrimSpace(cfg.AdminToken),
		http:       &http.Client{Timeout: timeout},
	}, nil
}

func (c *Client) String() string { return "retrieval engine at " + c.baseURL }

type FileIngest struct {
	Tenant            string
	Filename          string
	Title             string
	Subject           string
	Grade             *int
	SourceType        string
	Mode              string
	RestrictedTo      []string
	CurriculumNodeIDs []string
	ContentType       string
	Body              io.Reader
}

type JobResult struct {
	DocumentID        string `json:"document_id"`
	PendingID         string `json:"pending_id"`
	Title             string `json:"title"`
	CollidesWithState string `json:"collides_with_state"`
	Reason            string `json:"reason"`
	Chunks            *int   `json:"chunks"`
	Blocks            *int   `json:"blocks"`
}

type Job struct {
	ID       string     `json:"id"`
	JobID    string     `json:"job_id"`
	Status   string     `json:"status"`
	Phase    string     `json:"phase"`
	Error    string     `json:"error"`
	Result   *JobResult `json:"result"`
	Tenant   string     `json:"tenant_id"`
	Scope    string     `json:"scope"`
	Message  string     `json:"detail"`
	Document string     `json:"document_id"`
	State    string     `json:"state"`
}

func (j *Job) Identifier() string {
	if j == nil {
		return ""
	}
	if j.ID != "" {
		return j.ID
	}
	return j.JobID
}

func (j *Job) DocumentID() string {
	if j == nil {
		return ""
	}
	if j.Result != nil && j.Result.DocumentID != "" {
		return j.Result.DocumentID
	}
	return j.Document
}

func (j *Job) CollisionState() string {
	if j == nil {
		return ""
	}
	if j.Result != nil && j.Result.CollidesWithState != "" {
		return j.Result.CollidesWithState
	}
	return j.State
}

func (j *Job) Chunks() (int, bool) {
	if j == nil || j.Result == nil || j.Result.Chunks == nil {
		return 0, false
	}
	return *j.Result.Chunks, true
}

func (j *Job) Blocks() (int, bool) {
	if j == nil || j.Result == nil || j.Result.Blocks == nil {
		return 0, false
	}
	return *j.Result.Blocks, true
}

func (c *Client) IngestFile(ctx context.Context, in FileIngest) (*Job, error) {
	tenant := strings.TrimSpace(in.Tenant)
	if tenant == "" {
		return nil, ErrNoTenant
	}
	if strings.TrimSpace(in.Filename) == "" {
		return nil, errors.New("indexing: the engine routes on the file extension, so a filename is required")
	}

	q := url.Values{}
	q.Set("filename", in.Filename)
	q.Set("scope", scopeSchool)
	if t := strings.TrimSpace(in.Title); t != "" {
		q.Set("title", t)
	}
	if s := strings.TrimSpace(in.Subject); s != "" {
		q.Set("subject", s)
	}
	if in.Grade != nil {
		q.Set("grade", strconv.Itoa(*in.Grade))
	}
	if s := strings.TrimSpace(in.SourceType); s != "" {
		q.Set("source_type", s)
	}
	for _, label := range in.RestrictedTo {
		if label = strings.TrimSpace(label); label != "" {
			q.Add("restricted_to", label)
		}
	}
	q.Set(curriculumNodesParam, curriculumNodesValue(in.CurriculumNodeIDs))
	q.Set(modeParam, ResolvedMode(in.Mode))

	body := in.Body
	if body == nil {
		body = strings.NewReader("")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/ingest/file?"+q.Encode(), body)
	if err != nil {
		return nil, err
	}
	contentType := strings.TrimSpace(in.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	req.Header.Set("Content-Type", contentType)
	c.stamp(req, tenant)

	status, raw, err := c.send(req)
	if err != nil {
		return nil, err
	}
	if err := ingestRefusal(status, raw); err != nil {
		return nil, err
	}
	return decodeJob(raw)
}

func curriculumNodesValue(ids []string) string {
	nodes := present(ids)
	if nodes == nil {
		nodes = []string{}
	}
	slices.Sort(nodes)
	encoded, err := json.Marshal(nodes)
	if err != nil {
		return emptyJSONArray
	}
	return string(encoded)
}

func (c *Client) Job(ctx context.Context, tenant, jobID string) (*Job, error) {
	tenant = strings.TrimSpace(tenant)
	if tenant == "" {
		return nil, ErrNoTenant
	}
	if strings.TrimSpace(jobID) == "" {
		return nil, errors.New("indexing: a job id is required")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/ingest/"+url.PathEscape(jobID), nil)
	if err != nil {
		return nil, err
	}
	c.stamp(req, tenant)

	status, raw, err := c.send(req)
	if err != nil {
		return nil, err
	}
	if status < 200 || status > 299 {
		return nil, fmt.Errorf("%w: job %s returned %d: %s",
			ErrEngineRejected, jobID, status, engineMessage(raw))
	}
	return decodeJob(raw)
}

type PublishedDocument struct {
	DocumentID      string
	Tenant          string
	Chunks          *int
	StructureDigest string
}

func (d *PublishedDocument) NothingRetrievable() bool {
	return d != nil && d.Chunks != nil && *d.Chunks == 0
}

type publishedBody struct {
	DocumentID string `json:"document_id"`
	Tenant     string `json:"tenant_id"`
	Counts     struct {
		Chunks *int `json:"chunks"`
	} `json:"counts"`
	StructureDigest string `json:"structure_digest"`
}

func (c *Client) PublishedDocument(ctx context.Context, tenant, documentID string) (*PublishedDocument, error) {
	tenant = strings.TrimSpace(tenant)
	if tenant == "" {
		return nil, ErrNoTenant
	}
	documentID = strings.TrimSpace(documentID)
	if documentID == "" {
		return nil, errors.New("indexing: a document id is required")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/documents/"+url.PathEscape(documentID)+"/digest", nil)
	if err != nil {
		return nil, err
	}
	c.stamp(req, tenant)

	status, raw, err := c.send(req)
	if err != nil {
		return nil, err
	}
	if err := publishedRefusal(status, documentID, raw); err != nil {
		return nil, err
	}

	var body publishedBody
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, fmt.Errorf("%w: unreadable digest of %s: %w", ErrEngineRejected, documentID, err)
	}
	if body.DocumentID != documentID {
		return nil, fmt.Errorf("%w: asked about %s and was answered about %q",
			ErrEngineRejected, documentID, body.DocumentID)
	}
	if body.Tenant != tenant {
		return nil, fmt.Errorf("%w: %s is published under tenant %q, not %q",
			ErrEngineRejected, documentID, body.Tenant, tenant)
	}
	return &PublishedDocument{
		DocumentID:      body.DocumentID,
		Tenant:          body.Tenant,
		Chunks:          body.Counts.Chunks,
		StructureDigest: strings.TrimSpace(body.StructureDigest),
	}, nil
}

func publishedRefusal(status int, documentID string, raw []byte) error {
	switch {
	case status == http.StatusNotFound:
		return fmt.Errorf("%w: %s", ErrDocumentUnpublished, documentID)
	case status >= 500:
		return fmt.Errorf("%w: the digest of %s returned %d: %s",
			ErrEngineUnreachable, documentID, status, engineMessage(raw))
	case status < 200 || status > 299:
		return fmt.Errorf("%w: the digest of %s returned %d: %s",
			ErrEngineRejected, documentID, status, engineMessage(raw))
	}
	return nil
}

type HeldUpload struct {
	DocumentID string `json:"document_id"`
	Tenant     string `json:"tenant_id"`
	Checksum   string `json:"checksum"`
}

func (c *Client) HeldUploads(ctx context.Context, tenant string) ([]HeldUpload, error) {
	tenant = strings.TrimSpace(tenant)
	if tenant == "" {
		return nil, ErrNoTenant
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/held", nil)
	if err != nil {
		return nil, err
	}
	c.stamp(req, tenant)

	status, raw, err := c.send(req)
	if err != nil {
		return nil, err
	}
	switch {
	case status >= 500:
		return nil, fmt.Errorf("%w: the held list returned %d: %s",
			ErrEngineUnreachable, status, engineMessage(raw))
	case status < 200 || status > 299:
		return nil, fmt.Errorf("%w: the held list returned %d: %s",
			ErrEngineRejected, status, engineMessage(raw))
	}

	var body struct {
		Held []HeldUpload `json:"held"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, fmt.Errorf("%w: unreadable held list: %w", ErrEngineRejected, err)
	}

	own := make([]HeldUpload, 0, len(body.Held))
	for _, upload := range body.Held {
		if upload.Tenant == tenant && upload.DocumentID != "" && upload.Checksum != "" {
			own = append(own, upload)
		}
	}
	return own, nil
}

func (c *Client) stamp(req *http.Request, tenant string) {
	req.Header.Set(tenantHeader, tenant)
	if c.adminToken != "" {
		req.Header.Set(adminTokenHeader, c.adminToken)
	}
}

func (c *Client) send(req *http.Request) (int, []byte, error) {
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("%w: %w", ErrEngineUnreachable, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return resp.StatusCode, nil, fmt.Errorf("%w: %w", ErrEngineUnreachable, err)
	}
	return resp.StatusCode, raw, nil
}

func ingestRefusal(status int, raw []byte) error {
	switch {
	case status == http.StatusConflict:
		return fmt.Errorf("%w: %s", ErrGateUnenforceable, engineMessage(raw))
	case status == http.StatusUnsupportedMediaType:
		return fmt.Errorf("%w: %s", ErrUnsupportedMedia, engineMessage(raw))
	case status >= 500:
		return fmt.Errorf("%w: ingest returned %d: %s", ErrEngineUnreachable, status, engineMessage(raw))
	case status < 200 || status > 299:
		return fmt.Errorf("%w: ingest returned %d: %s", ErrEngineRejected, status, engineMessage(raw))
	}
	return nil
}

func decodeJob(raw []byte) (*Job, error) {
	var job Job
	if err := json.Unmarshal(raw, &job); err != nil {
		return nil, fmt.Errorf("%w: unreadable job record: %w", ErrEngineRejected, err)
	}
	if job.Identifier() == "" {
		return nil, fmt.Errorf("%w: the response carried no job id", ErrEngineRejected)
	}
	if job.Status == "" {
		job.Status = StatusQueued
	}
	return &job, nil
}

func engineMessage(raw []byte) string {
	var body struct {
		Detail any `json:"detail"`
	}
	if err := json.Unmarshal(raw, &body); err == nil && body.Detail != nil {
		if text, ok := body.Detail.(string); ok && text != "" {
			return text
		}
		if encoded, err := json.Marshal(body.Detail); err == nil {
			return string(encoded)
		}
	}
	return strings.TrimSpace(string(raw))
}

type PageRange struct {
	From int
	To   int
}

type SearchRequest struct {
	Tenant      string
	Query       string
	DocumentIDs []string
	WholeTenant bool
	PageRange   *PageRange
	TopK        int
}

type searchBody struct {
	Mode        string   `json:"mode"`
	Query       string   `json:"query"`
	DocumentIDs []string `json:"document_ids,omitempty"`
	PageRange   []int    `json:"page_range,omitempty"`
	TopK        int      `json:"top_k"`
}

type Citation struct {
	DocumentID     string  `json:"document_id"`
	DocumentTitle  string  `json:"document_title"`
	PageRange      []int   `json:"page_range"`
	ParagraphRange []int   `json:"paragraph_range"`
	Confidence     float64 `json:"confidence"`
}

type Passage struct {
	ChunkID      string   `json:"chunk_id"`
	Text         string   `json:"text"`
	Score        float64  `json:"score"`
	SourceType   string   `json:"source_type"`
	SectionID    string   `json:"section_id"`
	SectionPath  []string `json:"section_path"`
	Page         *int     `json:"page"`
	Role         string   `json:"role"`
	VerbatimText string   `json:"verbatim_text"`
	Context      string   `json:"context"`
	Citation     Citation `json:"citation"`
}

func (p Passage) DocumentID() string { return strings.TrimSpace(p.Citation.DocumentID) }

func (p Passage) At() *int {
	if p.Page != nil {
		return p.Page
	}
	if len(p.Citation.PageRange) > 0 {
		at := p.Citation.PageRange[0]
		return &at
	}
	return nil
}

type SearchResult struct {
	Mode        string    `json:"mode"`
	Passages    []Passage `json:"passages"`
	NoGoodMatch bool      `json:"no_good_match"`
}

func (c *Client) Search(ctx context.Context, in SearchRequest) (*SearchResult, error) {
	tenant := strings.TrimSpace(in.Tenant)
	if tenant == "" {
		return nil, ErrNoTenant
	}
	query := strings.TrimSpace(in.Query)
	if query == "" {
		return nil, ErrNoQuery
	}

	documents := present(in.DocumentIDs)
	switch {
	case in.WholeTenant && len(documents) > 0:
		return nil, ErrScopeContradiction
	case !in.WholeTenant && len(documents) == 0:
		return nil, ErrUnscopedSearch
	}

	topK := in.TopK
	if topK <= 0 {
		topK = 10
	}
	body := searchBody{Mode: modeSearch, Query: query, DocumentIDs: documents, TopK: topK}
	if in.PageRange != nil {
		body.PageRange = []int{in.PageRange.From, in.PageRange.To}
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/retrieve", bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	c.stamp(req, tenant)

	status, raw, err := c.send(req)
	if err != nil {
		return nil, err
	}
	if err := searchRefusal(status, raw); err != nil {
		return nil, err
	}
	return decodeSearch(raw)
}

func present(ids []string) []string {
	out := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func searchRefusal(status int, raw []byte) error {
	switch {
	case status == http.StatusForbidden:
		return fmt.Errorf("%w: %s", ErrEngineRefusedScope, engineMessage(raw))
	case status >= 500:
		return fmt.Errorf("%w: retrieve returned %d: %s", ErrEngineUnreachable, status, engineMessage(raw))
	case status < 200 || status > 299:
		return fmt.Errorf("%w: retrieve returned %d: %s", ErrEngineRejected, status, engineMessage(raw))
	}
	return nil
}

func decodeSearch(raw []byte) (*SearchResult, error) {
	var out SearchResult
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("%w: unreadable search result: %w", ErrEngineRejected, err)
	}
	return &out, nil
}
