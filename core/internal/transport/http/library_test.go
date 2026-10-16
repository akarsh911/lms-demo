package http

import (
	"bytes"
	"context"
	"crypto/sha256"
	dbsql "database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entcurriculum "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculum"
	entquestionpaper "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/questionpaper"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
)

type libraryStmt struct {
	kind  string
	query string
	args  []any
}

func (s libraryStmt) touches(table string) bool {
	return strings.Contains(s.query, `"`+table+`"`)
}

func (s libraryStmt) names(column string) bool {
	return strings.Contains(s.query, `"`+column+`"`)
}

func (s libraryStmt) carriesText(want string) bool {
	for _, arg := range s.args {
		if fmt.Sprint(arg) == want {
			return true
		}
	}
	return false
}

func (s libraryStmt) carries(want any) bool {
	for _, arg := range s.args {
		if arg == want {
			return true
		}
		if id, ok := want.(uuid.UUID); ok && fmt.Sprint(arg) == id.String() {
			return true
		}
	}
	return false
}

type libraryRows struct {
	cols []string
	rows []map[string]any
	at   int
}

func (r *libraryRows) Close() error                              { return nil }
func (r *libraryRows) ColumnTypes() ([]*dbsql.ColumnType, error) { return nil, nil }
func (r *libraryRows) Columns() ([]string, error)                { return r.cols, nil }
func (r *libraryRows) Err() error                                { return nil }
func (r *libraryRows) NextResultSet() bool                       { return false }

func (r *libraryRows) Next() bool {
	if r.at >= len(r.rows) {
		return false
	}
	r.at++
	return true
}

func (r *libraryRows) Scan(dest ...any) error {
	if len(dest) != len(r.cols) {
		return fmt.Errorf("stub: %d destinations for %d columns", len(dest), len(r.cols))
	}
	row := r.rows[r.at-1]
	for i, name := range r.cols {
		if err := libraryScanInto(dest[i], row[name]); err != nil {
			return fmt.Errorf("stub: column %s: %w", name, err)
		}
	}
	return nil
}

func libraryScanInto(dst, v any) error {
	switch d := dst.(type) {
	case *uuid.UUID:
		if v == nil {
			*d = uuid.Nil
			return nil
		}
		id, ok := v.(uuid.UUID)
		if !ok {
			return fmt.Errorf("%T is not a uuid", v)
		}
		*d = id
	case *int64:
		if v == nil {
			*d = 0
			return nil
		}
		n, ok := v.(int64)
		if !ok {
			return fmt.Errorf("%T is not an int64", v)
		}
		*d = n
	case *[]byte:
		*d = nil
	case *string:
		if v == nil {
			*d = ""
			return nil
		}
		*d = fmt.Sprint(v)
	default:
		scanner, ok := dst.(dbsql.Scanner)
		if !ok {
			return fmt.Errorf("unsupported destination %T", dst)
		}
		if v == nil {
			return scanner.Scan(nil)
		}
		if id, ok := v.(uuid.UUID); ok {
			return scanner.Scan(id.String())
		}
		return scanner.Scan(v)
	}
	return nil
}

type libraryResult struct{ affected int64 }

func (libraryResult) LastInsertId() (int64, error)   { return 0, nil }
func (r libraryResult) RowsAffected() (int64, error) { return r.affected, nil }

func libraryWrittenTable(query string) string {
	for _, marker := range []string{`DELETE FROM "`, `UPDATE "`} {
		if !strings.HasPrefix(query, marker) {
			continue
		}
		rest := query[len(marker):]
		end := strings.Index(rest, `"`)
		if end < 0 {
			continue
		}
		return rest[:end]
	}
	return ""
}

func (d *libraryDriver) affected(query string, args []any) int64 {
	table := libraryWrittenTable(query)
	if table == "" {
		return 1
	}
	rows := d.tables[table]
	if len(rows) == 0 {
		return 0
	}
	if kept, err := libraryReachable(query, args, rows); err == nil {
		return int64(len(kept))
	}
	return int64(len(rows))
}

type libraryDriver struct {
	stmts  []libraryStmt
	tables map[string][]map[string]any
}

func (d *libraryDriver) record(kind, query string, args any) {
	list, _ := args.([]any)
	d.stmts = append(d.stmts, libraryStmt{kind: kind, query: query, args: list})
}

func (d *libraryDriver) Query(_ context.Context, query string, args, v any) error {
	d.record("query", query, args)

	rows, ok := v.(*entsql.Rows)
	if !ok {
		return fmt.Errorf("stub: unexpected query target %T", v)
	}
	stored := d.tables[libraryQueriedTable(query)]
	if counted, ok := libraryCounted(query, stored); ok {
		*rows = entsql.Rows{ColumnScanner: counted}
		return nil
	}
	*rows = entsql.Rows{ColumnScanner: &libraryRows{
		cols: librarySelectedColumns(query),
		rows: stored,
	}}
	return nil
}

func libraryCounted(query string, stored []map[string]any) (*libraryRows, bool) {
	start := strings.Index(query, "SELECT ")
	end := strings.Index(query, " FROM ")
	if start < 0 || end <= start {
		return nil, false
	}
	list := strings.TrimSpace(query[start+len("SELECT ") : end])
	if !strings.HasPrefix(list, "COUNT(") || strings.Contains(list, ",") {
		return nil, false
	}
	return &libraryRows{
		cols: []string{"count"},
		rows: []map[string]any{{"count": int64(len(stored))}},
	}, true
}

func libraryQueriedTable(query string) string {
	from := strings.Index(query, `FROM "`)
	if from < 0 {
		return ""
	}
	rest := query[from+len(`FROM "`):]
	end := strings.Index(rest, `"`)
	if end < 0 {
		return ""
	}
	return rest[:end]
}

func (d *libraryDriver) Exec(_ context.Context, query string, args, v any) error {
	d.record("exec", query, args)
	list, _ := args.([]any)
	if res, ok := v.(*dbsql.Result); ok {
		*res = libraryResult{affected: d.affected(query, list)}
	}
	return nil
}

func (d *libraryDriver) Tx(context.Context) (dialect.Tx, error) { return dialect.NopTx(d), nil }
func (d *libraryDriver) Close() error                           { return nil }
func (d *libraryDriver) Dialect() string                        { return dialect.Postgres }

func librarySelectedColumns(query string) []string {
	start := strings.Index(query, "SELECT ")
	end := strings.Index(query, " FROM ")
	if start < 0 || end <= start {
		return nil
	}
	list := strings.TrimPrefix(query[start+len("SELECT "):end], "DISTINCT ")

	cols := make([]string, 0, strings.Count(list, ",")+1)
	for _, part := range strings.Split(list, ", ") {
		part = strings.TrimSpace(part)
		if i := strings.LastIndex(part, "."); i >= 0 {
			part = part[i+1:]
		}
		cols = append(cols, strings.Trim(part, `"`))
	}
	return cols
}

type libraryGuard struct {
	allow map[authorization.Entity]authorization.Decision
}

func (g libraryGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	return g.allow[entity], nil
}

func (libraryGuard) Name() string { return "library test guard" }

func libraryScopedGuard() authorization.Guard {
	narrow := authorization.Decision{
		Allowed:  true,
		Reach:    authorization.ReachSelf,
		HasReach: true,
	}
	return libraryGuard{allow: map[authorization.Entity]authorization.Decision{
		authorization.LibraryRead:   narrow,
		authorization.LibraryWrite:  narrow,
		authorization.LibraryDelete: narrow,
		authorization.LibraryCreate: narrow,
	}}
}

type libraryObjectStore struct {
	put        blob.PutRequest
	putLink    string
	putHeaders map[string]string
	putErr     error

	getKeys []string
	getFor  time.Duration
	getLink string
	getErr  error

	readKeys   []string
	readRanges []string
	object     []byte
	objectErr  error

	headKeys []string
	head     blob.ObjectInfo
	headErr  error

	written    []blob.PutStream
	stored     map[string]storedBlob
	writeErr   error
	deleteKeys []string
	deleteErr  error
}

type storedBlob struct {
	bytes  []byte
	length int64
	digest string
}

const keptBlobCeiling = 1 << 20

func (st *libraryObjectStore) PresignPut(_ context.Context, r blob.PutRequest) (blob.PutGrant, error) {
	st.put = r
	if st.putErr != nil {
		return blob.PutGrant{}, st.putErr
	}
	return blob.PutGrant{URL: st.putLink, Headers: st.putHeaders}, nil
}

func (st *libraryObjectStore) PresignGet(_ context.Context, key string, expires time.Duration) (string, error) {
	st.getKeys = append(st.getKeys, key)
	st.getFor = expires
	return st.getLink, st.getErr
}

func (st *libraryObjectStore) Get(_ context.Context, r blob.GetRequest) (blob.ObjectStream, error) {
	st.readKeys = append(st.readKeys, r.Key)
	st.readRanges = append(st.readRanges, r.Range)
	if st.objectErr != nil {
		return blob.ObjectStream{}, st.objectErr
	}

	whole := st.object
	if kept, ok := st.stored[r.Key]; ok {
		whole = kept.bytes
	}
	if whole == nil {
		return blob.ObjectStream{}, fmt.Errorf("%w: %q", blob.ErrNoObject, r.Key)
	}

	size := int64(len(whole))
	stream := blob.ObjectStream{ContentType: st.head.ContentType}
	body := whole

	if r.Range != "" {
		start, end, ok := splitFakeRange(r.Range)
		if !ok || start >= size || end < start {
			return blob.ObjectStream{}, fmt.Errorf("%w: %q", blob.ErrRangeRefused, r.Range)
		}
		if end >= size {
			end = size - 1
		}
		body = whole[start : end+1]
		stream.ContentRange = fmt.Sprintf("bytes %d-%d/%d", start, end, size)
		stream.Partial = true
	}

	stream.ContentLength = int64(len(body))
	stream.Body = io.NopCloser(bytes.NewReader(body))
	return stream, nil
}

func splitFakeRange(spec string) (int64, int64, bool) {
	rest, found := strings.CutPrefix(spec, "bytes=")
	if !found {
		return 0, 0, false
	}
	first, last, found := strings.Cut(rest, "-")
	if !found {
		return 0, 0, false
	}
	start, err := strconv.ParseInt(first, 10, 64)
	if err != nil {
		return 0, 0, false
	}
	end, err := strconv.ParseInt(last, 10, 64)
	if err != nil {
		return 0, 0, false
	}
	return start, end, true
}

func (st *libraryObjectStore) Put(_ context.Context, r blob.PutStream) error {
	st.written = append(st.written, r)
	if st.writeErr != nil {
		return st.writeErr
	}

	digest := sha256.New()
	kept := &bytes.Buffer{}
	landed, err := io.Copy(digest, io.TeeReader(r.Body, cappedWriter{to: kept}))
	if err != nil {
		return fmt.Errorf("store: reading the body after %d bytes: %w", landed, err)
	}

	if st.stored == nil {
		st.stored = map[string]storedBlob{}
	}
	st.stored[r.Key] = storedBlob{
		bytes:  kept.Bytes(),
		length: landed,
		digest: hex.EncodeToString(digest.Sum(nil)),
	}
	return nil
}

type cappedWriter struct{ to *bytes.Buffer }

func (c cappedWriter) Write(p []byte) (int, error) {
	if room := keptBlobCeiling - c.to.Len(); room > 0 {
		if room > len(p) {
			room = len(p)
		}
		c.to.Write(p[:room])
	}
	return len(p), nil
}

func (st *libraryObjectStore) Delete(_ context.Context, key string) error {
	st.deleteKeys = append(st.deleteKeys, key)
	delete(st.stored, key)
	return st.deleteErr
}

func (st *libraryObjectStore) Head(_ context.Context, key string) (blob.ObjectInfo, error) {
	st.headKeys = append(st.headKeys, key)
	return st.head, st.headErr
}

const (
	libraryUploadLink   = "https://store.example/library/put?X-Amz-Signature=upload-secret"
	libraryDownloadLink = "https://store.example/library/get?X-Amz-Signature=download-secret"
)

var libraryDigest = strings.Repeat("a", 64)

type libraryFixture struct {
	t      *testing.T
	server *Server
	driver *libraryDriver
	store  *libraryObjectStore
	logs   *bytes.Buffer
	ctx    context.Context
	person uuid.UUID
}

type libraryOption func(*libraryFixture)

func libraryNarrowed() libraryOption {
	return func(fx *libraryFixture) { fx.server.guard = libraryScopedGuard() }
}

func newLibraryFixture(t *testing.T, opts ...libraryOption) *libraryFixture {
	t.Helper()

	person := uuid.New()
	drv := &libraryDriver{tables: map[string][]map[string]any{
		"persons": {{"id": person}},
	}}
	client := tenantent.NewClient(tenantent.Driver(drv))

	store := &libraryObjectStore{
		putLink:    libraryUploadLink,
		putHeaders: map[string]string{blob.HeaderChecksum: libraryDigest},
		getLink:    libraryDownloadLink,
		head: blob.ObjectInfo{
			Exists:        true,
			ContentLength: 1024,
			ContentType:   "application/pdf",
			SHA256Hex:     libraryDigest,
		},
	}
	server := &Server{guard: authorization.AllowAll{}}
	previous := openObjectStore
	openObjectStore = func(ctx context.Context, s *Server) (objectStore, error) {
		if s == server {
			return store, nil
		}
		return previous(ctx, s)
	}
	t.Cleanup(func() { openObjectStore = previous })

	logs := &bytes.Buffer{}
	ctx := authorization.WithSubject(context.Background(),
		&authorization.Subject{CASUserID: uuid.New()})
	ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})
	ctx = observability.WithLogger(ctx, slog.New(slog.NewJSONHandler(logs,
		&slog.HandlerOptions{Level: slog.LevelDebug})))

	fx := &libraryFixture{
		t:      t,
		server: server,
		driver: drv,
		store:  store,
		logs:   logs,
		ctx:    ctx,
		person: person,
	}
	for _, opt := range opts {
		opt(fx)
	}
	return fx
}

func (fx *libraryFixture) call(handler http.HandlerFunc, method, target, body string,
	id uuid.UUID) *httptest.ResponseRecorder {
	fx.t.Helper()

	ctx := fx.ctx
	if id != uuid.Nil {
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	}

	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}

	w := httptest.NewRecorder()
	handler(w, httptest.NewRequest(method, target, reader).WithContext(ctx))
	return w
}

func (fx *libraryFixture) statements(table string) []libraryStmt {
	var out []libraryStmt
	for _, stmt := range fx.driver.stmts {
		if stmt.touches(table) {
			out = append(out, stmt)
		}
	}
	return out
}

func (fx *libraryFixture) writes(table string) []libraryStmt {
	var out []libraryStmt
	for _, stmt := range fx.statements(table) {
		if stmt.kind == "exec" {
			out = append(out, stmt)
		}
	}
	return out
}

func (fx *libraryFixture) onlyWrite(table string) libraryStmt {
	fx.t.Helper()
	writes := fx.writes(table)
	if len(writes) != 1 {
		fx.t.Fatalf("want exactly one write to %s, got %d: %v", table, len(writes), writes)
	}
	return writes[0]
}

func scopedBeyondID(query, table string) bool {
	where := libraryWhereOf(query)
	only := `"` + table + `"."id" = $1`
	return strings.HasPrefix(where, only) && len(strings.TrimSpace(where[len(only):])) > 0
}

func (fx *libraryFixture) changedNothing(table string) {
	fx.t.Helper()
	for _, stmt := range fx.writes(table) {
		if !strings.HasPrefix(stmt.query, `DELETE FROM "`+table+`"`) {
			fx.t.Fatalf("the request was refused but still wrote to %s: %v", table, stmt)
		}
		if !scopedBeyondID(stmt.query, table) {
			fx.t.Fatalf("the delete on %s narrows by id alone, so a row that left the "+
				"caller's scope would still be removed: %q", table, stmt.query)
		}
	}
}

func (fx *libraryFixture) refusedBefore(table string) {
	fx.t.Helper()
	if writes := fx.writes(table); len(writes) > 0 {
		fx.t.Fatalf("the request was refused but still wrote to %s: %v", table, writes)
	}
}

func libraryMessage(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v (%q)", err, w.Body.String())
	}
	msg, _ := body["message"].(string)
	return msg
}

func wantLibraryRefusal(t *testing.T, w *httptest.ResponseRecorder, code int, fragments ...string) {
	t.Helper()
	if w.Code != code {
		t.Fatalf("want %d, got %d: %s", code, w.Code, strings.TrimSpace(w.Body.String()))
	}
	msg := libraryMessage(t, w)
	if msg == "" {
		t.Fatal("the refusal carried no message")
	}
	for _, fragment := range fragments {
		if !strings.Contains(msg, fragment) {
			t.Fatalf("the message must name %q, got %q", fragment, msg)
		}
	}
}

func libraryBody(fields map[string]any) string {
	raw, err := json.Marshal(fields)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func TestLibraryFiltersRefuseWhatTheyDoNotUnderstand(t *testing.T) {
	id := uuid.New().String()

	cases := []struct {
		name   string
		values url.Values
		want   string
	}{
		{
			name:   "an unknown parameter",
			values: url.Values{"shelf": {"fiction"}},
			want:   "shelf",
		},
		{
			name:   "a misspelt parameter",
			values: url.Values{"subjectid": {id}},
			want:   "subjectid",
		},
		{
			name:   "a parameter that belongs to another surface",
			values: url.Values{"student_id": {id}},
			want:   "student_id",
		},
		{
			name:   "an identifier that is not a UUID",
			values: url.Values{"subject_id": {"seven"}},
			want:   "subject_id",
		},
		{
			name:   "an unknown kind",
			values: url.Values{"kind": {"scroll"}},
			want:   "kind",
		},
		{
			name:   "an unknown status",
			values: url.Values{"status": {"retired"}},
			want:   "status",
		},
		{
			name:   "an unknown audience",
			values: url.Values{"audience": {"everyone"}},
			want:   "audience",
		},
		{
			name:   "an exam year that is not a number",
			values: url.Values{"exam_year": {"nineteen"}},
			want:   "exam_year",
		},
		{
			name:   "an exam year of zero",
			values: url.Values{"exam_year": {"0"}},
			want:   "exam_year",
		},
		{
			name:   "an exam year before the common era",
			values: url.Values{"exam_year": {"-2019"}},
			want:   "exam_year",
		},
		{
			name:   "a misspelt paper filter",
			values: url.Values{"examtype": {"board"}},
			want:   "examtype",
		},
		{
			name:   "a limit that is not a number",
			values: url.Values{"limit": {"lots"}},
			want:   "limit",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseLibraryFilters(tc.values)
			if err == nil {
				t.Fatalf("%v must be refused, not silently dropped", tc.values)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("the error must name %q, got %v", tc.want, err)
			}
		})
	}
}

func TestLibraryFiltersAcceptEveryRecognisedParameter(t *testing.T) {
	id := uuid.New()
	values := url.Values{
		"kind":                {"book"},
		"status":              {"published"},
		"audience":            {"grade"},
		"subject_id":          {id.String()},
		"grade_level_id":      {id.String()},
		"section_id":          {id.String()},
		"subject_offering_id": {id.String()},
		"owner_person_id":     {id.String()},
		"exam_type":           {"board"},
		"board":               {"CBSE"},
		"exam_year":           {"2019"},
		"limit":               {"25"},
		"offset":              {"10"},
	}

	f, err := parseLibraryFilters(values)
	if err != nil {
		t.Fatalf("every parameter is recognised, got %v", err)
	}
	if f.Kind == nil || *f.Kind != entcontentitem.KindBook {
		t.Fatalf("kind was dropped, got %v", f.Kind)
	}
	if f.Status == nil || *f.Status != entcontentitem.StatusPublished {
		t.Fatalf("status was dropped, got %v", f.Status)
	}
	if f.Audience == nil || *f.Audience != entcontentitem.AudienceGrade {
		t.Fatalf("audience was dropped, got %v", f.Audience)
	}
	if f.ExamType == nil || *f.ExamType != "board" {
		t.Fatalf("exam_type was dropped, got %v", f.ExamType)
	}
	if f.Board == nil || *f.Board != "CBSE" {
		t.Fatalf("board was dropped, got %v", f.Board)
	}
	if f.ExamYear == nil || *f.ExamYear != 2019 {
		t.Fatalf("exam_year was dropped, got %v", f.ExamYear)
	}
	if f.Limit != 25 || f.Offset != 10 {
		t.Fatalf("want limit 25 offset 10, got %d/%d", f.Limit, f.Offset)
	}
}

func TestLibraryFiltersClampThePage(t *testing.T) {
	cases := []struct {
		name       string
		values     url.Values
		wantLimit  int
		wantOffset int
	}{
		{"no page at all", url.Values{}, DefaultPageSize, 0},
		{"zero", url.Values{"limit": {"0"}}, DefaultPageSize, 0},
		{"one", url.Values{"limit": {"1"}}, 1, 0},
		{"the maximum", url.Values{"limit": {"200"}}, MaxPageSize, 0},
		{"beyond the maximum", url.Values{"limit": {"5000"}}, DefaultPageSize, 0},
		{"negative", url.Values{"limit": {"-5"}, "offset": {"-5"}}, DefaultPageSize, 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f, err := parseLibraryFilters(tc.values)
			if err != nil {
				t.Fatalf("unexpected error %v", err)
			}
			if f.Limit != tc.wantLimit || f.Offset != tc.wantOffset {
				t.Fatalf("want %d/%d, got %d/%d", tc.wantLimit, tc.wantOffset, f.Limit, f.Offset)
			}
		})
	}
}

func TestListLibraryItemsRefusesAnUnknownQueryParameter(t *testing.T) {
	fx := newLibraryFixture(t)

	w := fx.call(fx.server.listLibraryItems, "GET", "/api/v1/library?shelf=fiction", "", uuid.Nil)

	wantLibraryRefusal(t, w, http.StatusBadRequest, "shelf")
	if stmts := fx.statements("content_items"); len(stmts) > 0 {
		t.Fatalf("the filter was refused but the table was still read: %v", stmts)
	}
}

func TestCreateLibraryItemRequiresAnAudience(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"no audience at all", `{"title":"Atlas"}`, "audience is required"},
		{"a null audience", `{"title":"Atlas","audience":null}`, "audience is required"},
		{"an empty audience", `{"title":"Atlas","audience":""}`, "audience is required"},
		{"an unknown audience", `{"title":"Atlas","audience":"everyone"}`, "audience must be"},
		{"an audience of the wrong case", `{"title":"Atlas","audience":"School"}`, "audience must be"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", tc.body, uuid.Nil)

			wantLibraryRefusal(t, w, http.StatusBadRequest, tc.want)
			fx.refusedBefore("content_items")
		})
	}
}

func TestCreateLibraryItemPairsTheAudienceWithItsAnchor(t *testing.T) {
	grade := uuid.New()
	section := uuid.New()
	offering := uuid.New()

	cases := []struct {
		name    string
		fields  map[string]any
		anchor  string
		refusal []string
	}{
		{
			name:   "school carries no anchor",
			fields: map[string]any{"audience": "school"},
		},
		{
			name:   "owner carries no anchor",
			fields: map[string]any{"audience": "owner"},
		},
		{
			name:   "grade carries its grade level",
			fields: map[string]any{"audience": "grade", "grade_level_id": grade},
			anchor: entcontentitem.FieldGradeLevelID,
		},
		{
			name:   "section carries its section",
			fields: map[string]any{"audience": "section", "section_id": section},
			anchor: entcontentitem.FieldSectionID,
		},
		{
			name:   "offering carries its offering",
			fields: map[string]any{"audience": "offering", "subject_offering_id": offering},
			anchor: entcontentitem.FieldSubjectOfferingID,
		},
		{
			name:    "grade without a grade level",
			fields:  map[string]any{"audience": "grade"},
			refusal: []string{"grade", "requires", entcontentitem.FieldGradeLevelID},
		},
		{
			name:    "section without a section",
			fields:  map[string]any{"audience": "section"},
			refusal: []string{"section", "requires", entcontentitem.FieldSectionID},
		},
		{
			name:    "offering without an offering",
			fields:  map[string]any{"audience": "offering"},
			refusal: []string{"offering", "requires", entcontentitem.FieldSubjectOfferingID},
		},
		{
			name:    "school with a grade level",
			fields:  map[string]any{"audience": "school", "grade_level_id": grade},
			refusal: []string{"school", "must not carry", entcontentitem.FieldGradeLevelID},
		},
		{
			name:    "owner with a section",
			fields:  map[string]any{"audience": "owner", "section_id": section},
			refusal: []string{"owner", "must not carry", entcontentitem.FieldSectionID},
		},
		{
			name: "section with an offering as well",
			fields: map[string]any{
				"audience": "section", "section_id": section, "subject_offering_id": offering,
			},
			refusal: []string{"section", "must not carry", entcontentitem.FieldSubjectOfferingID},
		},
		{
			name: "grade with a section as well",
			fields: map[string]any{
				"audience": "grade", "grade_level_id": grade, "section_id": section,
			},
			refusal: []string{"grade", "must not carry", entcontentitem.FieldSectionID},
		},
		{
			name: "offering with a grade level as well",
			fields: map[string]any{
				"audience": "offering", "subject_offering_id": offering, "grade_level_id": grade,
			},
			refusal: []string{"offering", "must not carry", entcontentitem.FieldGradeLevelID},
		},
	}

	anchors := []string{
		entcontentitem.FieldGradeLevelID,
		entcontentitem.FieldSectionID,
		entcontentitem.FieldSubjectOfferingID,
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			tc.fields["title"] = "Atlas"

			w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library",
				libraryBody(tc.fields), uuid.Nil)

			if len(tc.refusal) > 0 {
				wantLibraryRefusal(t, w, http.StatusBadRequest, tc.refusal...)
				fx.refusedBefore("content_items")
				return
			}

			if w.Code != http.StatusCreated {
				t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			insert := fx.onlyWrite("content_items")
			for _, name := range anchors {
				if name == tc.anchor {
					if !insert.names(name) {
						t.Fatalf("the row must carry %s, got %q", name, insert.query)
					}
					continue
				}
				if insert.names(name) {
					t.Fatalf("the row must not carry %s, got %q", name, insert.query)
				}
			}
		})
	}
}

func TestCreateLibraryItemTakesTheOwnerFromTheToken(t *testing.T) {
	t.Run("a supplied owner is refused", func(t *testing.T) {
		fx := newLibraryFixture(t)
		body := libraryBody(map[string]any{
			"title": "Atlas", "audience": "school", "owner_person_id": uuid.New(),
		})

		w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)

		wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, entcontentitem.FieldOwnerPersonID)
		fx.refusedBefore("content_items")
	})

	t.Run("the caller's own person id is refused too", func(t *testing.T) {
		fx := newLibraryFixture(t)
		body := libraryBody(map[string]any{
			"title": "Atlas", "audience": "school", "owner_person_id": fx.person,
		})

		w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)

		wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, entcontentitem.FieldOwnerPersonID)
		fx.refusedBefore("content_items")
	})

	t.Run("the stored owner is the caller", func(t *testing.T) {
		fx := newLibraryFixture(t)
		body := libraryBody(map[string]any{"title": "Atlas", "audience": "school"})

		w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)

		if w.Code != http.StatusCreated {
			t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
		}
		insert := fx.onlyWrite("content_items")
		if !insert.carries(fx.person) {
			t.Fatalf("the insert must store the caller %s, got %v", fx.person, insert.args)
		}
	})

	t.Run("a caller with no person record cannot create", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["persons"] = nil
		body := libraryBody(map[string]any{"title": "Atlas", "audience": "school"})

		w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)

		wantLibraryRefusal(t, w, http.StatusBadRequest, entcontentitem.FieldOwnerPersonID)
		fx.refusedBefore("content_items")
	})
}

func TestCreateLibraryItemRefusesAMalformedBody(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"no title", `{"audience":"school"}`, "title is required"},
		{"an empty title", `{"title":"","audience":"school"}`, "title is required"},
		{"an unknown field", `{"title":"Atlas","audience":"school","shelf":"fiction"}`, "shelf"},
		{"a body that is not JSON", `not json`, "invalid JSON body"},
		{"an empty body", ``, "invalid JSON body"},
		{"a kind that does not exist", `{"title":"Atlas","audience":"school","kind":"scroll"}`, "kind must be"},
		{"a status that does not exist", `{"title":"Atlas","audience":"school","status":"retired"}`, "status must be"},
		{"an identifier that is not a UUID", `{"title":"Atlas","audience":"grade","grade_level_id":"seven"}`, "grade_level_id"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", tc.body, uuid.Nil)

			wantLibraryRefusal(t, w, http.StatusBadRequest, tc.want)
			fx.refusedBefore("content_items")
		})
	}
}

func TestCreateLibraryItemMeasuresTheTitleInRunesNotBytes(t *testing.T) {
	cases := []struct {
		name     string
		title    string
		wantCode int
	}{
		{"a single character", "A", http.StatusCreated},
		{"an emoji", "📚", http.StatusCreated},
		{"a devanagari title", "गणित की पाठ्यपुस्तक", http.StatusCreated},
		{"255 ascii characters", strings.Repeat("a", 255), http.StatusCreated},
		{"256 ascii characters", strings.Repeat("a", 256), http.StatusBadRequest},
		{"255 devanagari characters", strings.Repeat("अ", 255), http.StatusCreated},
		{"256 devanagari characters", strings.Repeat("अ", 256), http.StatusBadRequest},
		{"255 four byte emoji", strings.Repeat("📚", 255), http.StatusCreated},
		{"256 four byte emoji", strings.Repeat("📚", 256), http.StatusBadRequest},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			body := libraryBody(map[string]any{"title": tc.title, "audience": "school"})

			w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if tc.wantCode != http.StatusCreated {
				fx.refusedBefore("content_items")
				return
			}
			if !fx.onlyWrite("content_items").carries(tc.title) {
				t.Fatalf("the title %q was not stored verbatim", tc.title)
			}
		})
	}
}

func libraryGradeItem(item, person, grade uuid.UUID) map[string]any {
	return map[string]any{
		"id":              item,
		"title":           "Atlas",
		"audience":        string(entcontentitem.AudienceGrade),
		"grade_level_id":  grade,
		"owner_person_id": person,
		"kind":            string(entcontentitem.KindDocument),
		"status":          string(entcontentitem.StatusDraft),
		"index_status":    string(entcontentitem.IndexStatusNone),
	}
}

func TestUpdateLibraryItemRefusesTheFieldsRecordedAtCreation(t *testing.T) {
	item, grade := uuid.New(), uuid.New()

	cases := []struct {
		name  string
		field string
	}{
		{"asset_id", entcontentitem.FieldAssetID},
		{"owner_person_id", entcontentitem.FieldOwnerPersonID},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			fx.driver.tables["content_items"] = []map[string]any{
				libraryGradeItem(item, fx.person, grade),
			}
			body := libraryBody(map[string]any{tc.field: uuid.New()})

			w := fx.call(fx.server.updateLibraryItem, "PATCH",
				"/api/v1/library/"+item.String(), body, item)

			wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, tc.field, "cannot be changed")
			fx.refusedBefore("content_items")
		})
	}
}

func TestUpdateLibraryItemMovesTheAudienceWithItsAnchor(t *testing.T) {
	item, grade, section := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name    string
		fields  map[string]any
		cleared []string
		set     map[string]uuid.UUID
		refusal []string
	}{
		{
			name:    "grade to school clears the grade level",
			fields:  map[string]any{"audience": "school", "grade_level_id": nil},
			cleared: []string{entcontentitem.FieldGradeLevelID},
		},
		{
			name:    "grade to owner clears the grade level",
			fields:  map[string]any{"audience": "owner", "grade_level_id": nil},
			cleared: []string{entcontentitem.FieldGradeLevelID},
		},
		{
			name:    "grade to section swaps the anchor",
			fields:  map[string]any{"audience": "section", "grade_level_id": nil, "section_id": section},
			cleared: []string{entcontentitem.FieldGradeLevelID},
			set:     map[string]uuid.UUID{entcontentitem.FieldSectionID: section},
		},
		{
			name:    "a grade item may not drop its grade level",
			fields:  map[string]any{"grade_level_id": nil},
			refusal: []string{"grade", "requires", entcontentitem.FieldGradeLevelID},
		},
		{
			name:    "a grade item may not gain a section",
			fields:  map[string]any{"section_id": section},
			refusal: []string{"grade", "must not carry", entcontentitem.FieldSectionID},
		},
		{
			name:    "an empty audience is not a way to clear it",
			fields:  map[string]any{"audience": ""},
			refusal: []string{"audience must not be empty"},
		},
		{
			name:    "an unknown audience is refused",
			fields:  map[string]any{"audience": "everyone"},
			refusal: []string{"audience must be"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			fx.driver.tables["content_items"] = []map[string]any{
				libraryGradeItem(item, fx.person, grade),
			}

			w := fx.call(fx.server.updateLibraryItem, "PATCH",
				"/api/v1/library/"+item.String(), libraryBody(tc.fields), item)

			if len(tc.refusal) > 0 {
				wantLibraryRefusal(t, w, http.StatusBadRequest, tc.refusal...)
				fx.refusedBefore("content_items")
				return
			}

			if w.Code != http.StatusOK {
				t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			update := fx.onlyWrite("content_items")
			for _, name := range tc.cleared {
				if !strings.Contains(update.query, `"`+name+`" = NULL`) {
					t.Fatalf("the update must clear %s, got %q", name, update.query)
				}
			}
			for name, want := range tc.set {
				if !update.names(name) || !update.carries(want) {
					t.Fatalf("the update must set %s to %s, got %q %v", name, want, update.query, update.args)
				}
			}
			if update.carries(grade) {
				t.Fatalf("the old anchor must not survive, got %v", update.args)
			}
		})
	}
}

func TestUpdateLibraryItemMovesTheAudienceWithoutBeingToldToDropTheAnchor(t *testing.T) {
	item, grade, section := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name   string
		fields map[string]any
		set    map[string]uuid.UUID
	}{
		{
			name:   "to school",
			fields: map[string]any{"audience": "school"},
		},
		{
			name:   "to owner",
			fields: map[string]any{"audience": "owner"},
		},
		{
			name:   "to a section",
			fields: map[string]any{"audience": "section", "section_id": section},
			set:    map[string]uuid.UUID{entcontentitem.FieldSectionID: section},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			fx.driver.tables["content_items"] = []map[string]any{
				libraryGradeItem(item, fx.person, grade),
			}

			w := fx.call(fx.server.updateLibraryItem, "PATCH",
				"/api/v1/library/"+item.String(), libraryBody(tc.fields), item)

			if w.Code != http.StatusOK {
				t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			update := fx.onlyWrite("content_items")
			if !strings.Contains(update.query, `"`+entcontentitem.FieldGradeLevelID+`" = NULL`) {
				t.Fatalf("the move must clear the anchor it left behind, got %q", update.query)
			}
			if update.carries(grade) {
				t.Fatalf("the old anchor must not survive the move, got %q %v", update.query, update.args)
			}
			for name, want := range tc.set {
				if !update.names(name) || !update.carries(want) {
					t.Fatalf("the move must set %s to %s, got %q %v", name, want, update.query, update.args)
				}
			}
		})
	}
}

func TestUpdateLibraryItemLeavesTheRestOfTheRowAlone(t *testing.T) {
	item, grade := uuid.New(), uuid.New()
	fx := newLibraryFixture(t)
	fx.driver.tables["content_items"] = []map[string]any{
		libraryGradeItem(item, fx.person, grade),
	}

	w := fx.call(fx.server.updateLibraryItem, "PATCH",
		"/api/v1/library/"+item.String(), `{"title":"A better atlas"}`, item)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	update := fx.onlyWrite("content_items")
	if !update.carries("A better atlas") {
		t.Fatalf("the new title was not written, got %v", update.args)
	}
	if !update.carries(grade) {
		t.Fatalf("an unrelated patch must keep the grade level, got %q %v", update.query, update.args)
	}
	if strings.Contains(update.query, `"grade_level_id" = NULL`) {
		t.Fatalf("an unrelated patch must not clear the anchor, got %q", update.query)
	}
}

func TestUpdateLibraryItemDropsAnExplicitNullOnAPlainFieldPinningAKnownLimitation(t *testing.T) {
	item, grade := uuid.New(), uuid.New()
	fx := newLibraryFixture(t)
	fx.driver.tables["content_items"] = []map[string]any{
		libraryGradeItem(item, fx.person, grade),
	}

	w := fx.call(fx.server.updateLibraryItem, "PATCH",
		"/api/v1/library/"+item.String(), `{"description":null,"isbn":null}`, item)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	update := fx.onlyWrite("content_items")
	if update.names(entcontentitem.FieldDescription) || update.names(entcontentitem.FieldIsbn) {
		t.Fatalf("this test pins the known limitation that a plain field cannot be cleared with null; "+
			"if null now means clear across the whole API, flip this test on purpose, got %q", update.query)
	}
}

func TestLibraryReadPathsNarrowThroughTheViewer(t *testing.T) {
	item := uuid.New()

	cases := []struct {
		name string
		call func(fx *libraryFixture) *httptest.ResponseRecorder
	}{
		{
			name: "list",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.listLibraryItems, "GET", "/api/v1/library", "", uuid.Nil)
			},
		},
		{
			name: "get",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.getLibraryItem, "GET",
					"/api/v1/library/"+item.String(), "", item)
			},
		},
		{
			name: "update",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updateLibraryItem, "PATCH",
					"/api/v1/library/"+item.String(), `{"title":"Atlas"}`, item)
			},
		},
		{
			name: "delete",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deleteLibraryItem, "DELETE",
					"/api/v1/library/"+item.String(), "", item)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t, libraryNarrowed())

			tc.call(fx)

			reads := fx.statements("content_items")
			if len(reads) == 0 {
				t.Fatal("the path never read content_items")
			}
			first := reads[0]
			if !first.names(entcontentitem.FieldAudience) {
				t.Fatalf("the read must be narrowed by audience, got %q", first.query)
			}
			if !first.carries(fx.person) {
				t.Fatalf("the read must be narrowed to the caller %s, got %q %v",
					fx.person, first.query, first.args)
			}
		})
	}
}

func TestLibraryReadPathsAreWideOpenOnlyForAnUnrestrictedViewer(t *testing.T) {
	fx := newLibraryFixture(t)

	fx.call(fx.server.listLibraryItems, "GET", "/api/v1/library", "", uuid.Nil)

	reads := fx.statements("content_items")
	if len(reads) == 0 {
		t.Fatal("the list never read content_items")
	}
	if reads[0].carries(fx.person) {
		t.Fatalf("an unrestricted viewer needs no narrowing, got %q %v", reads[0].query, reads[0].args)
	}
}

func TestLibraryItemThatTheViewerCannotReachIsNotFound(t *testing.T) {
	item := uuid.New()

	cases := []struct {
		name string
		call func(fx *libraryFixture) *httptest.ResponseRecorder
	}{
		{
			name: "get",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.getLibraryItem, "GET",
					"/api/v1/library/"+item.String(), "", item)
			},
		},
		{
			name: "update",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updateLibraryItem, "PATCH",
					"/api/v1/library/"+item.String(), `{"title":"Atlas"}`, item)
			},
		},
		{
			name: "delete",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deleteLibraryItem, "DELETE",
					"/api/v1/library/"+item.String(), "", item)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stranger := newGatedFixture(t, libraryNarrowed())
			stranger.driver.tables["content_items"] = []map[string]any{
				libraryOwnerItem(item, uuid.New()),
			}

			w := tc.call(stranger)

			if w.Code != http.StatusNotFound {
				t.Fatalf("want 404, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			stranger.changedNothing("content_items")

			own := newGatedFixture(t, libraryNarrowed())
			own.driver.tables["content_items"] = []map[string]any{
				libraryOwnerItem(item, own.person),
			}

			if w := tc.call(own); w.Code == http.StatusNotFound {
				t.Fatalf("the same row owned by the caller must be reachable, got 404: %s",
					strings.TrimSpace(w.Body.String()))
			}
		})
	}
}

func TestLibraryItemIDMustBeAUUID(t *testing.T) {
	cases := []struct {
		name string
		call func(fx *libraryFixture) *httptest.ResponseRecorder
	}{
		{
			name: "get",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.getLibraryItem, "GET", "/api/v1/library/seven", "", uuid.Nil)
			},
		},
		{
			name: "update",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updateLibraryItem, "PATCH",
					"/api/v1/library/seven", `{"title":"Atlas"}`, uuid.Nil)
			},
		},
		{
			name: "delete",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deleteLibraryItem, "DELETE", "/api/v1/library/seven", "", uuid.Nil)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			w := tc.call(fx)

			wantLibraryRefusal(t, w, http.StatusBadRequest, "id must be a UUID")
			fx.refusedBefore("content_items")
		})
	}
}

func assetUpload(extra map[string]any) map[string]any {
	body := map[string]any{
		"file_name":  "atlas.pdf",
		"mime_type":  "application/pdf",
		"size_bytes": 1024,
		"sha256":     strings.Repeat("a", 64),
	}
	for name, value := range extra {
		body[name] = value
	}
	return body
}

func assetField(t *testing.T, w *httptest.ResponseRecorder, name string) string {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v (%q)", err, w.Body.String())
	}
	value, ok := body[name].(string)
	if !ok || value == "" {
		t.Fatalf("the response carried no %s: %q", name, w.Body.String())
	}
	return value
}

func createdAsset(t *testing.T, fx *libraryFixture, fields map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	w := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
		libraryBody(fields), uuid.Nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	return w
}

func TestCreateAssetRefusesAnIncompleteUpload(t *testing.T) {
	without := func(field string) map[string]any {
		body := map[string]any{}
		for name, value := range assetUpload(nil) {
			if name != field {
				body[name] = value
			}
		}
		return body
	}

	cases := []struct {
		name   string
		fields map[string]any
		status int
		want   string
	}{
		{"no file name", without("file_name"), http.StatusBadRequest, "file_name is required"},
		{"an empty file name", assetUpload(map[string]any{"file_name": ""}), http.StatusBadRequest, "file_name is required"},
		{"no mime type", without("mime_type"), http.StatusBadRequest, "mime_type is required"},
		{"no digest", without("sha256"), http.StatusBadRequest, "sha256 is required"},
		{"no size", without("size_bytes"), http.StatusBadRequest, "size_bytes is required"},
		{"a negative size", assetUpload(map[string]any{"size_bytes": -1}), http.StatusBadRequest, "size_bytes must not be negative"},
		{"a supplied uploader", assetUpload(map[string]any{"uploaded_by": uuid.New()}), http.StatusUnprocessableEntity, "uploaded_by"},
		{"an unknown field", assetUpload(map[string]any{"bucket": "cold"}), http.StatusBadRequest, "bucket"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			w := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
				libraryBody(tc.fields), uuid.Nil)

			wantLibraryRefusal(t, w, tc.status, tc.want)
			fx.refusedBefore("assets")
		})
	}
}

func TestCreateAssetRefusesAStorageKeyThatNamesAnotherCallersObject(t *testing.T) {
	owner := newLibraryFixture(t)
	squatted := assetField(t, createdAsset(t, owner, assetUpload(nil)), "storage_key")

	squatter := newLibraryFixture(t)

	w := squatter.call(squatter.server.createAsset, "POST", "/api/v1/library/assets",
		libraryBody(assetUpload(map[string]any{"storage_key": squatted})), uuid.Nil)

	wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, "storage_key", "must not be supplied")
	squatter.refusedBefore("assets")
}

func TestCreateAssetRefusesEveryClientChosenStorageKey(t *testing.T) {
	cases := []struct {
		name string
		key  string
	}{
		{"a key in the shape the server mints", "library/" + uuid.New().String()},
		{"a key belonging to another tenant", "tenants/other-school/objects/1"},
		{"a key that climbs out of its prefix", "library/../../other-school/secrets.pdf"},
		{"an empty key", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			w := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
				libraryBody(assetUpload(map[string]any{"storage_key": tc.key})), uuid.Nil)

			wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, "storage_key", "must not be supplied")
			fx.refusedBefore("assets")
		})
	}
}

func TestCreateAssetMintsTheStorageKeyItself(t *testing.T) {
	fx := newLibraryFixture(t)

	w := createdAsset(t, fx, assetUpload(nil))

	id := assetField(t, w, "id")
	key := assetField(t, w, "storage_key")
	if key != mintedStorageKey(uuid.MustParse(id)) {
		t.Fatalf("the key must be minted from the row's own id %s, got %q", id, key)
	}
	if insert := fx.onlyWrite("assets"); !insert.carries(key) {
		t.Fatalf("the minted key %q was not the one stored, got %v", key, insert.args)
	}

	other := newLibraryFixture(t)
	if second := assetField(t, createdAsset(t, other, assetUpload(nil)), "storage_key"); second == key {
		t.Fatalf("two uploads must not mint the same key, got %q twice", key)
	}
}

func TestCreateAssetPointsAtWhatItMade(t *testing.T) {
	fx := newLibraryFixture(t)

	w := createdAsset(t, fx, assetUpload(nil))

	want := "/api/v1/library/assets/" + assetField(t, w, "id")
	if got := w.Header().Get("Location"); got != want {
		t.Fatalf("want Location %q, got %q", want, got)
	}
}

func TestCreateAssetStoresTheUploaderFromTheToken(t *testing.T) {
	fx := newLibraryFixture(t)

	createdAsset(t, fx, assetUpload(map[string]any{"size_bytes": 0}))

	insert := fx.onlyWrite("assets")
	if !insert.carries(fx.person) {
		t.Fatalf("the upload must be attributed to the caller %s, got %v", fx.person, insert.args)
	}
	if !insert.carries(int64(0)) {
		t.Fatalf("a zero byte upload must keep its size, got %v", insert.args)
	}
}

func libraryAssetRow(id, uploader uuid.UUID) map[string]any {
	return map[string]any{
		"id":          id,
		"storage_key": mintedStorageKey(id),
		"file_name":   "atlas.pdf",
		"mime_type":   "application/pdf",
		"size_bytes":  int64(1024),
		"sha256":      strings.Repeat("a", 64),
		"uploaded_by": uploader,
		"status":      string(entasset.StatusReady),
	}
}

func TestGetAssetReturnsTheRow(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t)
	fx.driver.tables["assets"] = []map[string]any{libraryAssetRow(stored, fx.person)}

	w := fx.call(fx.server.getAsset, "GET", "/api/v1/library/assets/"+stored.String(), "", stored)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := assetField(t, w, "storage_key"); got != mintedStorageKey(stored) {
		t.Fatalf("want the stored key, got %q", got)
	}
}

func TestGetAssetNarrowsThroughTheViewer(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t, libraryNarrowed())

	fx.call(fx.server.getAsset, "GET", "/api/v1/library/assets/"+stored.String(), "", stored)

	reads := fx.statements("assets")
	if len(reads) == 0 {
		t.Fatal("the read never touched assets")
	}
	read := reads[0]
	if !read.names("content_items") {
		t.Fatalf("the read must be narrowed to items the caller may read, got %q", read.query)
	}
	if !read.names(entasset.FieldUploadedBy) {
		t.Fatalf("the read must also reach the caller's own uploads, got %q", read.query)
	}
	if !read.carries(fx.person) {
		t.Fatalf("the read must be narrowed to the caller %s, got %q %v",
			fx.person, read.query, read.args)
	}
}

func TestGetAssetIsWideOpenOnlyForAnUnrestrictedViewer(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t)

	fx.call(fx.server.getAsset, "GET", "/api/v1/library/assets/"+stored.String(), "", stored)

	reads := fx.statements("assets")
	if len(reads) == 0 {
		t.Fatal("the read never touched assets")
	}
	if reads[0].names("content_items") || reads[0].carries(fx.person) {
		t.Fatalf("an unrestricted viewer needs no narrowing, got %q %v", reads[0].query, reads[0].args)
	}
}

func TestGetAssetTheViewerCannotReachIsNotFound(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t, libraryNarrowed())

	w := fx.call(fx.server.getAsset, "GET", "/api/v1/library/assets/"+stored.String(), "", stored)

	if w.Code == http.StatusForbidden {
		t.Fatalf("an unreachable asset must not admit that it exists, got %d", w.Code)
	}
	wantLibraryRefusal(t, w, http.StatusNotFound, "asset not found")
	wantAssetReadNarrowed(t, fx)
}

func TestGetAssetRefusesAnIdThatIsNotAUUID(t *testing.T) {
	fx := newLibraryFixture(t)

	w := fx.call(fx.server.getAsset, "GET", "/api/v1/library/assets/seven", "", uuid.Nil)

	wantLibraryRefusal(t, w, http.StatusBadRequest, "id must be a UUID")
	if stmts := fx.statements("assets"); len(stmts) > 0 {
		t.Fatalf("the request was refused but assets was still read: %v", stmts)
	}
}

func libraryAssetRowIn(id, uploader uuid.UUID, status entasset.Status) map[string]any {
	row := libraryAssetRow(id, uploader)
	row["status"] = string(status)
	return row
}

func (fx *libraryFixture) holds(id uuid.UUID, status entasset.Status) uuid.UUID {
	fx.driver.tables["assets"] = []map[string]any{libraryAssetRowIn(id, fx.person, status)}
	return id
}

func (fx *libraryFixture) markReady(id uuid.UUID) *httptest.ResponseRecorder {
	return fx.call(fx.server.markAssetReady, "POST",
		"/api/v1/library/assets/"+id.String()+"/ready", "", id)
}

func (fx *libraryFixture) assetLink(id uuid.UUID) *httptest.ResponseRecorder {
	return fx.call(fx.server.getAssetLink, "GET",
		"/api/v1/library/assets/"+id.String()+"/link", "", id)
}

func TestCreateAssetHandsBackAnUploadLinkBoundToTheRow(t *testing.T) {
	fx := newLibraryFixture(t)

	w := createdAsset(t, fx, assetUpload(nil))

	key := assetField(t, w, "storage_key")
	if got := assetField(t, w, "upload_url"); got != libraryUploadLink {
		t.Fatalf("want the presigned upload link, got %q", got)
	}
	if got := fx.store.put.Key; got != key {
		t.Fatalf("the link must be minted for the row's own key %q, got %q", key, got)
	}
	if got := fx.store.put.ContentLength; got != 1024 {
		t.Fatalf("the link must be bound to the recorded size, got %d", got)
	}
	if got := fx.store.put.SHA256Hex; got != strings.Repeat("a", 64) {
		t.Fatalf("the link must be bound to the recorded digest, got %q", got)
	}
	if got := fx.store.put.ContentType; got != "application/pdf" {
		t.Fatalf("the link must be bound to the recorded mime type, got %q", got)
	}
	if got := fx.store.put.Expires; got != 15*time.Minute {
		t.Fatalf("an upload link lasts fifteen minutes, got %s", got)
	}
}

func TestCreateAssetDatesTheUploadLinkAndLeavesTheRowPending(t *testing.T) {
	fx := newLibraryFixture(t)

	w := createdAsset(t, fx, assetUpload(nil))

	expires, err := time.Parse(time.RFC3339Nano, assetField(t, w, "upload_expires_at"))
	if err != nil {
		t.Fatalf("upload_expires_at is not a timestamp: %v", err)
	}
	if left := time.Until(expires); left <= 14*time.Minute || left > 15*time.Minute {
		t.Fatalf("the stated expiry must match the link, %s left", left)
	}

	insert := fx.onlyWrite("assets")
	if !insert.carriesText(string(entasset.StatusPending)) {
		t.Fatalf("a row with nothing uploaded must stay pending, got %v", insert.args)
	}
	if insert.carriesText(string(entasset.StatusReady)) {
		t.Fatalf("minting a link must not make the row ready, got %v", insert.args)
	}
}

func TestCreateAssetNeverLogsTheUploadLink(t *testing.T) {
	fx := newLibraryFixture(t)

	createdAsset(t, fx, assetUpload(nil))

	wantNoLinkLogged(t, fx, libraryUploadLink)
}

func wantNoLinkLogged(t *testing.T, fx *libraryFixture, link string) {
	t.Helper()
	logged := fx.logs.String()
	if logged == "" {
		t.Fatal("the handler logged nothing at all, so the check proves nothing")
	}
	for _, secret := range []string{link, "X-Amz-Signature", "upload-secret", "download-secret"} {
		if strings.Contains(logged, secret) {
			t.Fatalf("a presigned link is a credential and must never be logged, found %q in %s",
				secret, logged)
		}
	}
}

func TestMarkAssetReadyRefusesAnObjectThatIsNotThere(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusPending)
	fx.store.head = blob.ObjectInfo{Exists: false}

	w := fx.markReady(stored)

	wantLibraryRefusal(t, w, http.StatusConflict, "nothing has been uploaded")
	fx.refusedBefore("assets")
	if len(fx.store.headKeys) != 1 || fx.store.headKeys[0] != mintedStorageKey(stored) {
		t.Fatalf("the row must be checked against its own key, got %v", fx.store.headKeys)
	}
}

func TestMarkAssetReadyRefusesAnObjectOfTheWrongSize(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusPending)
	fx.store.head = blob.ObjectInfo{Exists: true, ContentLength: 17}

	w := fx.markReady(stored)

	wantLibraryRefusal(t, w, http.StatusConflict, "17", "1024")
	fx.refusedBefore("assets")
}

func TestMarkAssetReadyPromotesAnObjectItHasVerified(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusPending)

	w := fx.markReady(stored)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if len(fx.store.headKeys) != 1 {
		t.Fatalf("the transition must verify the object exactly once, got %v", fx.store.headKeys)
	}
	update := fx.onlyWrite("assets")
	if !update.carriesText(string(entasset.StatusReady)) {
		t.Fatalf("the row was never promoted to ready, got %v", update.args)
	}
}

func TestMarkAssetReadyIsIdempotentOnAnAssetAlreadyReady(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusReady)

	w := fx.markReady(stored)

	if w.Code != http.StatusOK {
		t.Fatalf("a retried transition must succeed, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}
	fx.refusedBefore("assets")
	if len(fx.store.headKeys) != 0 {
		t.Fatalf("an asset already ready needs no second check, got %v", fx.store.headKeys)
	}
}

func TestMarkAssetReadyRefusesToResurrectADeletedAsset(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusDeleted)

	w := fx.markReady(stored)

	wantLibraryRefusal(t, w, http.StatusConflict, "deleted")
	fx.refusedBefore("assets")
	if len(fx.store.headKeys) != 0 {
		t.Fatalf("a deleted asset is terminal and must not be looked up, got %v", fx.store.headKeys)
	}
}

func TestMarkAssetReadyOnAnAssetTheViewerCannotReachIsNotFound(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t, libraryNarrowed())

	w := fx.markReady(stored)

	if w.Code == http.StatusForbidden {
		t.Fatalf("an unreachable asset must not admit that it exists, got %d", w.Code)
	}
	wantLibraryRefusal(t, w, http.StatusNotFound, "asset not found")
	wantAssetReadNarrowed(t, fx)
	fx.refusedBefore("assets")
	if len(fx.store.headKeys) != 0 {
		t.Fatalf("an unreachable asset must never reach the store, got %v", fx.store.headKeys)
	}
}

func wantAssetReadNarrowed(t *testing.T, fx *libraryFixture) {
	t.Helper()
	reads := fx.statements("assets")
	if len(reads) == 0 {
		t.Fatal("the request never touched assets")
	}
	read := reads[0]
	if !read.names("content_items") {
		t.Fatalf("the read must be narrowed to items the caller may read, got %q", read.query)
	}
	if !read.names(entasset.FieldUploadedBy) {
		t.Fatalf("the read must also reach the caller's own uploads, got %q", read.query)
	}
	if !read.carries(fx.person) {
		t.Fatalf("the read must be narrowed to the caller %s, got %q %v",
			fx.person, read.query, read.args)
	}
}

func TestGetAssetLinkRefusesAnAssetWithNothingBehindIt(t *testing.T) {
	cases := []struct {
		name   string
		status entasset.Status
		want   string
	}{
		{"still pending", entasset.StatusPending, "no uploaded object yet"},
		{"already deleted", entasset.StatusDeleted, "has been deleted"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			stored := fx.holds(uuid.New(), tc.status)

			w := fx.assetLink(stored)

			wantLibraryRefusal(t, w, http.StatusConflict, tc.want)
			if len(fx.store.getKeys) != 0 {
				t.Fatalf("a link to nothing must never be minted, got %v", fx.store.getKeys)
			}
		})
	}
}

func TestGetAssetLinkPresignsTheRowsOwnKey(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusReady)

	w := fx.assetLink(stored)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := assetField(t, w, "download_url"); got != libraryDownloadLink {
		t.Fatalf("want the presigned download link, got %q", got)
	}
	if len(fx.store.getKeys) != 1 || fx.store.getKeys[0] != mintedStorageKey(stored) {
		t.Fatalf("the link must name the row's own object, got %v", fx.store.getKeys)
	}
	if fx.store.getFor != 5*time.Minute {
		t.Fatalf("a download link lasts five minutes, got %s", fx.store.getFor)
	}

	expires, err := time.Parse(time.RFC3339Nano, assetField(t, w, "download_expires_at"))
	if err != nil {
		t.Fatalf("download_expires_at is not a timestamp: %v", err)
	}
	if left := time.Until(expires); left <= 4*time.Minute || left > 5*time.Minute {
		t.Fatalf("the stated expiry must match the link, %s left", left)
	}
}

func TestGetAssetLinkOnAnAssetTheViewerCannotReachIsNotFound(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t, libraryNarrowed())

	w := fx.assetLink(stored)

	if w.Code == http.StatusForbidden {
		t.Fatalf("an unreachable asset must not admit that it exists, got %d", w.Code)
	}
	wantLibraryRefusal(t, w, http.StatusNotFound, "asset not found")
	wantAssetReadNarrowed(t, fx)
	if len(fx.store.getKeys) != 0 {
		t.Fatalf("an unreachable asset must never reach the store, got %v", fx.store.getKeys)
	}
}

func TestGetAssetLinkNeverLogsTheDownloadLink(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusReady)

	if w := fx.assetLink(stored); w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}

	wantNoLinkLogged(t, fx, libraryDownloadLink)
}

func (fx *libraryFixture) deleteAsset(id uuid.UUID) *httptest.ResponseRecorder {
	return fx.call(fx.server.deleteAsset, "DELETE",
		"/api/v1/library/assets/"+id.String(), "", id)
}

func (fx *libraryFixture) forget() {
	fx.driver.stmts = nil
	fx.store.headKeys = nil
	fx.store.getKeys = nil
}

func (fx *libraryFixture) settleAsset(id uuid.UUID) {
	fx.t.Helper()
	fx.holds(id, assetStatusWritten(fx.t, fx.onlyWrite("assets")))
	fx.forget()
}

func assetStatusWritten(t *testing.T, stmt libraryStmt) entasset.Status {
	t.Helper()
	for _, arg := range stmt.args {
		status := entasset.Status(fmt.Sprint(arg))
		if entasset.StatusValidator(status) == nil {
			return status
		}
	}
	t.Fatalf("the write carried no asset status: %q %v", stmt.query, stmt.args)
	return ""
}

func libraryTopLevelTerms(query string) []string {
	const marker = " WHERE "
	at := strings.Index(query, marker)
	if at < 0 {
		return nil
	}
	where := query[at+len(marker):]
	for _, tail := range []string{" ORDER BY ", " LIMIT ", " OFFSET "} {
		if cut := strings.Index(where, tail); cut >= 0 {
			where = where[:cut]
		}
	}
	return libraryRequiredTerms(where)
}

func librarySplitOn(where, op string) []string {
	var terms []string
	depth, start := 0, 0
	for i := 0; i < len(where); i++ {
		switch where[i] {
		case '(':
			depth++
		case ')':
			depth--
		}
		if depth != 0 || !strings.HasPrefix(where[i:], op) {
			continue
		}
		terms = append(terms, strings.TrimSpace(where[start:i]))
		i += len(op) - 1
		start = i + 1
	}
	return append(terms, strings.TrimSpace(where[start:]))
}

func libraryUnwrapped(term string) (string, bool) {
	if !strings.HasPrefix(term, "(") || !strings.HasSuffix(term, ")") {
		return term, false
	}
	depth := 0
	for i := 0; i < len(term); i++ {
		switch term[i] {
		case '(':
			depth++
		case ')':
			depth--
		}
		if depth == 0 && i < len(term)-1 {
			return term, false
		}
	}
	return term[1 : len(term)-1], true
}

func libraryRequiredTerms(where string) []string {
	var out []string
	for _, term := range librarySplitOn(where, " AND ") {
		inner, wrapped := libraryUnwrapped(term)
		if wrapped && len(librarySplitOn(inner, " OR ")) == 1 {
			out = append(out, libraryRequiredTerms(inner)...)
			continue
		}
		out = append(out, term)
	}
	return out
}

func libraryOwnershipDemanded(stmt libraryStmt, person uuid.UUID) bool {
	term := `"assets"."` + entasset.FieldUploadedBy + `" = $`
	for _, conjunct := range libraryTopLevelTerms(stmt.query) {
		if !strings.HasPrefix(conjunct, term) {
			continue
		}
		at, err := strconv.Atoi(strings.TrimPrefix(conjunct, term))
		if err != nil || at < 1 || at > len(stmt.args) {
			return false
		}
		if fmt.Sprint(stmt.args[at-1]) == person.String() {
			return true
		}
	}
	return false
}

func libraryDenying(entity authorization.Entity) libraryOption {
	return func(fx *libraryFixture) {
		guard := libraryScopedGuard().(libraryGuard)
		delete(guard.allow, entity)
		fx.server.guard = guard
	}
}

func TestDeleteAssetSoftDeletesEveryStatusItCanLeave(t *testing.T) {
	cases := []struct {
		name string
		from entasset.Status
	}{
		{"nothing was ever uploaded", entasset.StatusPending},
		{"the bytes are there and verified", entasset.StatusReady},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			stored := fx.holds(uuid.New(), tc.from)

			w := fx.deleteAsset(stored)

			if w.Code != http.StatusNoContent {
				t.Fatalf("want 204, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			write := fx.onlyWrite("assets")
			if strings.Contains(write.query, "DELETE FROM") {
				t.Fatalf("the row must survive so its references stay explicable, got %q", write.query)
			}
			if !strings.HasPrefix(write.query, "UPDATE ") {
				t.Fatalf("a soft delete is an update, got %q", write.query)
			}
			if got := assetStatusWritten(t, write); got != entasset.StatusDeleted {
				t.Fatalf("want the row left deleted, got %q", got)
			}
			if len(fx.store.headKeys) != 0 || len(fx.store.getKeys) != 0 || fx.store.put.Key != "" {
				t.Fatalf("a soft delete must not touch the object, got head %v get %v put %q",
					fx.store.headKeys, fx.store.getKeys, fx.store.put.Key)
			}
		})
	}
}

func TestDeleteAssetIsIdempotentOnAnAssetAlreadyDeleted(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusDeleted)

	w := fx.deleteAsset(stored)

	if w.Code != http.StatusNoContent {
		t.Fatalf("a retried delete must answer as the first one did, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}
	fx.refusedBefore("assets")
	if len(fx.store.headKeys) != 0 || len(fx.store.getKeys) != 0 {
		t.Fatalf("an asset already deleted needs no second look, got head %v get %v",
			fx.store.headKeys, fx.store.getKeys)
	}
}

func TestDeleteAssetDemandsOwnershipNotMereReachability(t *testing.T) {
	stored := uuid.New()

	t.Run("deleting requires the caller to have uploaded it", func(t *testing.T) {
		fx := newLibraryFixture(t, libraryNarrowed())
		fx.holds(stored, entasset.StatusReady)

		fx.deleteAsset(stored)

		reads := fx.statements("assets")
		if len(reads) == 0 {
			t.Fatal("the delete never read assets")
		}
		if !libraryOwnershipDemanded(reads[0], fx.person) {
			t.Fatalf("deleting must require %s = the caller %s, not merely a readable item, got %q %v",
				entasset.FieldUploadedBy, fx.person, reads[0].query, reads[0].args)
		}
	})

	t.Run("reading does not, so a reader is not a deleter", func(t *testing.T) {
		fx := newLibraryFixture(t, libraryNarrowed())
		fx.holds(stored, entasset.StatusReady)

		fx.call(fx.server.getAsset, "GET", "/api/v1/library/assets/"+stored.String(), "", stored)

		reads := fx.statements("assets")
		if len(reads) == 0 {
			t.Fatal("the read never touched assets")
		}
		if libraryOwnershipDemanded(reads[0], fx.person) {
			t.Fatalf("reading reaches an item's asset without owning it; "+
				"if that changed on purpose, flip this test, got %q", reads[0].query)
		}
	})
}

func TestDeleteAssetIsRefusedToACallerWithNoPersonRecord(t *testing.T) {
	fx := newLibraryFixture(t, libraryNarrowed())
	stored := fx.holds(uuid.New(), entasset.StatusReady)
	fx.driver.tables["persons"] = nil

	fx.deleteAsset(stored)

	reads := fx.statements("assets")
	if len(reads) == 0 {
		t.Fatal("the delete never read assets")
	}
	impossible := false
	for _, term := range libraryTopLevelTerms(reads[0].query) {
		if term == "FALSE" {
			impossible = true
		}
	}
	if !impossible {
		t.Fatalf("nobody owns an upload when the caller has no person record, got %q", reads[0].query)
	}
}

func TestDeleteAssetOnAnAssetTheViewerCannotReachIsNotFound(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t, libraryNarrowed())

	w := fx.deleteAsset(stored)

	if w.Code == http.StatusForbidden {
		t.Fatalf("an unreachable asset must not admit that it exists, got %d", w.Code)
	}
	wantLibraryRefusal(t, w, http.StatusNotFound, "asset not found")
	fx.refusedBefore("assets")
	wantAssetDeleteNarrowed(t, fx)
}

func wantAssetDeleteNarrowed(t *testing.T, fx *libraryFixture) {
	t.Helper()
	reads := fx.statements("assets")
	if len(reads) == 0 {
		t.Fatal("the request never touched assets")
	}
	read := reads[0]
	if !read.names("content_items") {
		t.Fatalf("the read must be narrowed to items the caller may read, got %q", read.query)
	}
	if strings.Count(read.query, `"`+entasset.FieldUploadedBy+`"`) < 2 {
		t.Fatalf("deleting must demand the caller's own upload on top of reachability, got %q",
			read.query)
	}
	if !read.carries(fx.person) {
		t.Fatalf("the read must be narrowed to the caller %s, got %q %v",
			fx.person, read.query, read.args)
	}
}

func TestDeleteAssetRefusesADeniedDecisionRatherThanWideningToTheDefaultScope(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t, libraryDenying(authorization.LibraryDelete))
	fx.holds(stored, entasset.StatusReady)

	w := fx.deleteAsset(stored)

	wantLibraryRefusal(t, w, http.StatusForbidden, string(authorization.LibraryDelete))
	if stmts := fx.statements("assets"); len(stmts) > 0 {
		t.Fatalf("a denial with no error must not fall through to the caller's own scope, got %v", stmts)
	}
}

func TestDeleteAssetRefusesAnIdThatIsNotAUUID(t *testing.T) {
	fx := newLibraryFixture(t)

	w := fx.call(fx.server.deleteAsset, "DELETE", "/api/v1/library/assets/seven", "", uuid.Nil)

	wantLibraryRefusal(t, w, http.StatusBadRequest, "id must be a UUID")
	if stmts := fx.statements("assets"); len(stmts) > 0 {
		t.Fatalf("the request was refused but assets was still read: %v", stmts)
	}
}

func TestAnAssetDeletedThroughTheAPIIsTerminal(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusPending)

	if w := fx.deleteAsset(stored); w.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	fx.settleAsset(stored)

	ready := fx.markReady(stored)

	wantLibraryRefusal(t, ready, http.StatusConflict, "deleted")
	if got := libraryCode(t, ready); got != AssetDeletedCode {
		t.Fatalf("want %s, got %q", AssetDeletedCode, got)
	}
	fx.refusedBefore("assets")
	if len(fx.store.headKeys) != 0 {
		t.Fatalf("a deleted asset is terminal and must not be looked up, got %v", fx.store.headKeys)
	}

	fx.forget()
	link := fx.assetLink(stored)

	wantLibraryRefusal(t, link, http.StatusConflict, "has been deleted")
	fx.refusedBefore("assets")
	if len(fx.store.getKeys) != 0 {
		t.Fatalf("no link may be minted for a deleted asset, got %v", fx.store.getKeys)
	}
}

func TestCreateAssetRefusesAClientChosenStatus(t *testing.T) {
	cases := []struct {
		name   string
		status string
	}{
		{"the one that skips verification", string(entasset.StatusReady)},
		{"the one the server would have chosen", string(entasset.StatusPending)},
		{"the terminal one", string(entasset.StatusDeleted)},
		{"one the enum does not know", "sideways"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			w := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
				libraryBody(assetUpload(map[string]any{"status": tc.status})), uuid.Nil)

			wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, "status", "must not be supplied")
			fx.refusedBefore("assets")
		})
	}
}

func TestTheOnlyRouteFromAFreshAssetToReadyGoesPastTheStore(t *testing.T) {
	fx := newLibraryFixture(t)

	claimed := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
		libraryBody(assetUpload(map[string]any{"status": string(entasset.StatusReady)})), uuid.Nil)
	wantLibraryRefusal(t, claimed, http.StatusUnprocessableEntity, "status", "must not be supplied")
	fx.refusedBefore("assets")

	created := createdAsset(t, fx, assetUpload(nil))
	id := uuid.MustParse(assetField(t, created, "id"))
	if got := assetField(t, created, "status"); got != string(entasset.StatusPending) {
		t.Fatalf("a fresh asset is pending whatever the body asked for, got %q", got)
	}

	fx.holds(id, entasset.StatusPending)
	fx.store.head = blob.ObjectInfo{Exists: false}

	w := fx.markReady(id)

	wantLibraryRefusal(t, w, http.StatusConflict, "nothing has been uploaded")
	if len(fx.store.headKeys) != 1 || fx.store.headKeys[0] != mintedStorageKey(id) {
		t.Fatalf("the only road to ready must ask the store about the row's own key, got %v",
			fx.store.headKeys)
	}
	for _, write := range fx.writes("assets") {
		if write.carriesText(string(entasset.StatusReady)) {
			t.Fatalf("no row may reach ready without a verified object, got %v", write.args)
		}
	}
}

func libraryDefaultLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	logs := &bytes.Buffer{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(logs,
		&slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return logs
}

func TestAFailedUploadLinkLeaksNoSignature(t *testing.T) {
	fx := newLibraryFixture(t)
	fallback := libraryDefaultLog(t)
	fx.store.putErr = errors.New("blob: presign put: " + libraryUploadLink + ": token expired")

	w := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
		libraryBody(assetUpload(nil)), uuid.Nil)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	for _, where := range []string{w.Body.String(), fx.logs.String(), fallback.String()} {
		for _, secret := range []string{"X-Amz-Signature", "upload-secret"} {
			if strings.Contains(where, secret) {
				t.Fatalf("the failure path leaked %q: %s", secret, where)
			}
		}
	}
	if !strings.Contains(fallback.String(), "presign put") {
		t.Fatalf("a redacted failure must still be diagnosable, got %s", fallback.String())
	}
}

func TestCreateAssetHandsBackTheHeadersTheUploadMustCarry(t *testing.T) {
	fx := newLibraryFixture(t)

	w := createdAsset(t, fx, assetUpload(nil))

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	headers, ok := body["upload_headers"].(map[string]any)
	if !ok {
		t.Fatalf("a signed upload is unusable without its headers, got %q", w.Body.String())
	}
	if got := headers[blob.HeaderChecksum]; got != libraryDigest {
		t.Fatalf("the caller must be told which digest header to send, got %v", got)
	}
}

func TestMarkAssetReadyRefusesADifferentFileOfTheSameLength(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusPending)
	fx.store.head = blob.ObjectInfo{
		Exists:        true,
		ContentLength: 1024,
		SHA256Hex:     strings.Repeat("b", 64),
	}

	w := fx.markReady(stored)

	wantLibraryRefusal(t, w, http.StatusConflict, "sha256")
	if msg := libraryMessage(t, w); strings.Contains(msg, "bytes") {
		t.Fatalf("the size agreed, so only the digest can have caught this, got %q", msg)
	}
	fx.refusedBefore("assets")
}

func TestMarkAssetReadyRefusesAStoreThatCannotVouchForTheBytes(t *testing.T) {
	fx := newLibraryFixture(t)
	stored := fx.holds(uuid.New(), entasset.StatusPending)
	fx.store.head = blob.ObjectInfo{Exists: true, ContentLength: 1024}

	w := fx.markReady(stored)

	wantLibraryRefusal(t, w, http.StatusServiceUnavailable, "no sha256", "an operator must")
	if got := libraryCode(t, w); got != AssetDigestUnavailableCode {
		t.Fatalf("want %q, got %q", AssetDigestUnavailableCode, got)
	}
	fx.refusedBefore("assets")
}

func libraryCode(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v (%q)", err, w.Body.String())
	}
	code, _ := body["code"].(string)
	if code == "" {
		t.Fatalf("the refusal carried no machine readable code: %s", w.Body.String())
	}
	return code
}

func TestMarkAssetReadySeparatesABadUploadFromAStoreThatCannotCheckIt(t *testing.T) {
	mismatched := newLibraryFixture(t)
	mismatched.store.head = blob.ObjectInfo{
		Exists:        true,
		ContentLength: 1024,
		SHA256Hex:     strings.Repeat("b", 64),
	}
	blind := newLibraryFixture(t)
	blind.store.head = blob.ObjectInfo{Exists: true, ContentLength: 1024}

	bad := mismatched.markReady(mismatched.holds(uuid.New(), entasset.StatusPending))
	unverifiable := blind.markReady(blind.holds(uuid.New(), entasset.StatusPending))

	if bad.Code == unverifiable.Code {
		t.Fatalf("a wrong upload and a store that cannot check one must not answer alike, both %d",
			bad.Code)
	}
	if libraryCode(t, bad) == libraryCode(t, unverifiable) {
		t.Fatalf("the two refusals must stay tellable apart by code, both %q", libraryCode(t, bad))
	}
	if bad.Code != http.StatusConflict || libraryCode(t, bad) != AssetDigestMismatchCode {
		t.Fatalf("a wrong upload is the caller's conflict, got %d %q",
			bad.Code, libraryCode(t, bad))
	}
	if unverifiable.Code != http.StatusServiceUnavailable ||
		libraryCode(t, unverifiable) != AssetDigestUnavailableCode {
		t.Fatalf("a store that cannot check is the operator's problem, got %d %q",
			unverifiable.Code, libraryCode(t, unverifiable))
	}
}

func TestMarkAssetReadyNamesEveryRefusalItCanGive(t *testing.T) {
	cases := []struct {
		name   string
		status entasset.Status
		head   blob.ObjectInfo
		want   int
		code   string
	}{
		{"nothing uploaded", entasset.StatusPending,
			blob.ObjectInfo{Exists: false}, http.StatusConflict, AssetObjectMissingCode},
		{"a different length", entasset.StatusPending,
			blob.ObjectInfo{Exists: true, ContentLength: 17, SHA256Hex: libraryDigest},
			http.StatusConflict, AssetSizeMismatchCode},
		{"a different file of the same length", entasset.StatusPending,
			blob.ObjectInfo{Exists: true, ContentLength: 1024, SHA256Hex: strings.Repeat("b", 64)},
			http.StatusConflict, AssetDigestMismatchCode},
		{"a store that reports no digest", entasset.StatusPending,
			blob.ObjectInfo{Exists: true, ContentLength: 1024},
			http.StatusServiceUnavailable, AssetDigestUnavailableCode},
		{"a composite digest from some other upload path", entasset.StatusPending,
			blob.ObjectInfo{Exists: true, ContentLength: 1024},
			http.StatusServiceUnavailable, AssetDigestUnavailableCode},
		{"an asset already deleted", entasset.StatusDeleted,
			blob.ObjectInfo{Exists: true, ContentLength: 1024, SHA256Hex: libraryDigest},
			http.StatusConflict, AssetDeletedCode},
	}

	seen := map[string]bool{}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			stored := fx.holds(uuid.New(), tc.status)
			fx.store.head = tc.head

			w := fx.markReady(stored)

			if w.Code != tc.want {
				t.Fatalf("want %d, got %d: %s", tc.want, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if got := libraryCode(t, w); got != tc.code {
				t.Fatalf("want code %q, got %q", tc.code, got)
			}
			if libraryMessage(t, w) == "" {
				t.Fatal("a code without a message tells an operator nothing")
			}
			fx.refusedBefore("assets")
		})
		seen[tc.code] = true
	}

	if len(seen) != 5 {
		t.Fatalf("every refusal on this route must be tellable apart, got %d distinct codes", len(seen))
	}
}

func TestCreateAssetRefusesAZeroByteUploadWithoutBlamingTheServer(t *testing.T) {
	fx := newLibraryFixture(t)
	fx.store.putErr = fmt.Errorf("%w: %w", blob.ErrUnbound, blob.ErrZeroLength)

	w := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
		libraryBody(assetUpload(map[string]any{"size_bytes": 0})), uuid.Nil)

	if w.Code == http.StatusInternalServerError {
		t.Fatalf("a body the caller can send must not read as our fault: %s",
			strings.TrimSpace(w.Body.String()))
	}
	wantLibraryRefusal(t, w, http.StatusBadRequest, "zero byte", "no asset was recorded")
	if got := libraryCode(t, w); got != AssetZeroLengthCode {
		t.Fatalf("want %q, got %q", AssetZeroLengthCode, got)
	}

	fx.refusedBefore("assets")
}

func TestAssetRefusalCodesAreAllDistinct(t *testing.T) {
	codes := []string{
		AssetZeroLengthCode,
		AssetDeletedCode,
		AssetObjectMissingCode,
		AssetSizeMismatchCode,
		AssetDigestMismatchCode,
		AssetDigestUnavailableCode,
	}

	seen := map[string]bool{}
	for _, code := range codes {
		if code == "" {
			t.Fatal("a refusal code must not be empty")
		}
		if seen[code] {
			t.Fatalf("two refusals share the code %q, so they cannot be told apart", code)
		}
		seen[code] = true
	}
	if len(seen) != len(codes) {
		t.Fatalf("want %d distinct codes, got %d", len(codes), len(seen))
	}
}

func TestCreateAssetKeepsOtherStoreFailuresAsOurFault(t *testing.T) {
	fx := newLibraryFixture(t)
	fx.store.putErr = errors.New("blob: presign put: the bucket is on fire")

	w := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
		libraryBody(assetUpload(nil)), uuid.Nil)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("a store that broke is ours to own, not the caller's, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}
}

func libraryPaperItem(item, person uuid.UUID) map[string]any {
	return map[string]any{
		"id":              item,
		"title":           "Physics 2019",
		"audience":        string(entcontentitem.AudienceSchool),
		"owner_person_id": person,
		"kind":            string(entcontentitem.KindPaper),
		"status":          string(entcontentitem.StatusDraft),
		"index_status":    string(entcontentitem.IndexStatusNone),
	}
}

func librarySidecar(paper, item uuid.UUID) map[string]any {
	return map[string]any{
		"id":              paper,
		"content_item_id": item,
		"exam_type":       "board",
		"board":           "CBSE",
		"exam_year":       2019,
	}
}

func libraryPaperFields() map[string]any {
	return map[string]any{
		"exam_type":        "board",
		"board":            "CBSE",
		"exam_year":        2019,
		"total_marks":      70,
		"duration_minutes": 180,
		"paper_set":        "A",
		"attempt":          "main",
	}
}

func TestCreateLibraryItemPairsThePaperWithItsKind(t *testing.T) {
	cases := []struct {
		name    string
		fields  map[string]any
		refusal string
	}{
		{
			name:    "a paper with no metadata cannot be catalogued",
			fields:  map[string]any{"title": "Physics 2019", "audience": "school", "kind": "paper"},
			refusal: "requires a paper object",
		},
		{
			name: "a null paper is no paper at all",
			fields: map[string]any{
				"title": "Physics 2019", "audience": "school", "kind": "paper", "paper": nil,
			},
			refusal: "requires a paper object",
		},
		{
			name: "a book must not carry exam metadata",
			fields: map[string]any{
				"title": "Atlas", "audience": "school", "kind": "book",
				"paper": libraryPaperFields(),
			},
			refusal: "may only be sent with kind paper",
		},
		{
			name: "neither may the default kind",
			fields: map[string]any{
				"title": "Atlas", "audience": "school", "paper": libraryPaperFields(),
			},
			refusal: "may only be sent with kind paper",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library",
				libraryBody(tc.fields), uuid.Nil)

			wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, tc.refusal)
			fx.refusedBefore("content_items")
			fx.refusedBefore("question_papers")
		})
	}
}

func TestCreateLibraryItemWritesThePaperWithItsItem(t *testing.T) {
	fx := newLibraryFixture(t)
	body := libraryBody(map[string]any{
		"title": "Physics 2019", "audience": "school", "kind": "paper",
		"paper": libraryPaperFields(),
	})

	w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)

	if w.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	item := fx.onlyWrite("content_items")
	if !item.carriesText(string(entcontentitem.KindPaper)) {
		t.Fatalf("the item must be stored as a paper, got %v", item.args)
	}

	sidecar := fx.onlyWrite("question_papers")
	for _, want := range []any{"board", "CBSE", 2019, 70, 180, "A", "main"} {
		if !sidecar.carriesText(fmt.Sprint(want)) {
			t.Fatalf("the sidecar must store %v, got %v", want, sidecar.args)
		}
	}
	if !sidecar.names(entquestionpaper.FieldContentItemID) {
		t.Fatalf("the sidecar must name its item, got %q", sidecar.query)
	}

	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if _, has := out["paper"]; !has {
		t.Fatalf("the created paper must travel back inline, got %v", out)
	}
	if _, has := out["edges"]; has {
		t.Fatalf("the sidecar must not leak as an edge, got %v", out)
	}
}

func TestCreateLibraryItemRefusesAPaperItCannotCatalogue(t *testing.T) {
	cases := []struct {
		name    string
		paper   map[string]any
		code    int
		refusal string
	}{
		{
			name:    "no exam type",
			paper:   map[string]any{"exam_year": 2019},
			code:    http.StatusBadRequest,
			refusal: "exam_type is required",
		},
		{
			name:    "an empty exam type",
			paper:   map[string]any{"exam_type": ""},
			code:    http.StatusBadRequest,
			refusal: "exam_type is required",
		},
		{
			name:    "a year that is not a year",
			paper:   map[string]any{"exam_type": "board", "exam_year": 0},
			code:    http.StatusBadRequest,
			refusal: "exam_year must be positive",
		},
		{
			name:    "marks that cannot be scored",
			paper:   map[string]any{"exam_type": "board", "total_marks": -70},
			code:    http.StatusBadRequest,
			refusal: "total_marks must be positive",
		},
		{
			name:    "a duration nobody can sit",
			paper:   map[string]any{"exam_type": "board", "duration_minutes": 0},
			code:    http.StatusBadRequest,
			refusal: "duration_minutes must be positive",
		},
		{
			name:    "an item chosen by the caller",
			paper:   map[string]any{"exam_type": "board", "content_item_id": uuid.New()},
			code:    http.StatusUnprocessableEntity,
			refusal: "content_item_id",
		},
		{
			name:    "a field the sidecar does not have",
			paper:   map[string]any{"exam_type": "board", "shelf": "fiction"},
			code:    http.StatusBadRequest,
			refusal: "shelf",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			body := libraryBody(map[string]any{
				"title": "Physics 2019", "audience": "school", "kind": "paper", "paper": tc.paper,
			})

			w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)

			wantLibraryRefusal(t, w, tc.code, tc.refusal)
			fx.refusedBefore("content_items")
			fx.refusedBefore("question_papers")
		})
	}
}

func TestUpdateLibraryItemCorrectsThePaperWithoutTouchingItsIdentity(t *testing.T) {
	item, paper := uuid.New(), uuid.New()

	t.Run("a correction reaches the sidecar", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
		fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}
		body := libraryBody(map[string]any{"paper": map[string]any{"exam_year": 2020}})

		w := fx.call(fx.server.updateLibraryItem, "PATCH",
			"/api/v1/library/"+item.String(), body, item)

		if w.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
		}
		write := fx.onlyWrite("question_papers")
		if !write.carries(2020) {
			t.Fatalf("the correction must reach the sidecar, got %v", write.args)
		}
	})

	t.Run("the item it belongs to cannot be re-pointed", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
		fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}
		body := libraryBody(map[string]any{
			"paper": map[string]any{"content_item_id": uuid.New()},
		})

		w := fx.call(fx.server.updateLibraryItem, "PATCH",
			"/api/v1/library/"+item.String(), body, item)

		wantLibraryRefusal(t, w, http.StatusUnprocessableEntity,
			entquestionpaper.FieldContentItemID)
		fx.refusedBefore("question_papers")
		fx.refusedBefore("content_items")
	})

	t.Run("an exam type cannot be emptied", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
		fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}
		body := libraryBody(map[string]any{"paper": map[string]any{"exam_type": ""}})

		w := fx.call(fx.server.updateLibraryItem, "PATCH",
			"/api/v1/library/"+item.String(), body, item)

		wantLibraryRefusal(t, w, http.StatusBadRequest, "exam_type must not be empty")
		fx.refusedBefore("question_papers")
	})

	t.Run("an optional field sent as null is cleared, deliberately unlike the item", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
		fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}
		body := libraryBody(map[string]any{"paper": map[string]any{"board": nil}})

		w := fx.call(fx.server.updateLibraryItem, "PATCH",
			"/api/v1/library/"+item.String(), body, item)

		if w.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
		}
		write := fx.onlyWrite("question_papers")
		if !write.names(entquestionpaper.FieldBoard) {
			t.Fatalf("a wrong board on a fixed historical record must be removable, not merely "+
				"overwritable with another wrong value, got %q. "+
				"This diverges on purpose from %s, which pins the "+
				"item's own null handling. That test records a wart; this one records the "+
				"behaviour to move toward when the repo-wide null convention is settled. "+
				"Do not reconcile them by making the sidecar drop nulls.",
				write.query, "TestUpdateLibraryItemDropsAnExplicitNullOnAPlainFieldPinningAKnownLimitation")
		}
	})

	t.Run("a paper left unmentioned is left alone", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
		fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}
		body := libraryBody(map[string]any{"title": "Physics 2019 revised"})

		w := fx.call(fx.server.updateLibraryItem, "PATCH",
			"/api/v1/library/"+item.String(), body, item)

		if w.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
		}
		if writes := fx.writes("question_papers"); len(writes) > 0 {
			t.Fatalf("the sidecar was not mentioned but was written: %v", writes)
		}
	})
}

func TestUpdateLibraryItemKeepsThePaperPairedWithItsKind(t *testing.T) {
	item, paper := uuid.New(), uuid.New()

	t.Run("a plain item cannot grow exam metadata as a book", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{
			libraryGradeItem(item, fx.person, uuid.New()),
		}
		body := libraryBody(map[string]any{"paper": libraryPaperFields()})

		w := fx.call(fx.server.updateLibraryItem, "PATCH",
			"/api/v1/library/"+item.String(), body, item)

		wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, "may only be sent with kind paper")
		fx.refusedBefore("question_papers")
		fx.refusedBefore("content_items")
	})

	t.Run("becoming a paper requires the metadata", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{
			libraryGradeItem(item, fx.person, uuid.New()),
		}
		body := libraryBody(map[string]any{"kind": "paper"})

		w := fx.call(fx.server.updateLibraryItem, "PATCH",
			"/api/v1/library/"+item.String(), body, item)

		wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, "requires a paper object")
		fx.refusedBefore("content_items")
	})

	t.Run("a paper cannot quietly become a book", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
		fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}
		body := libraryBody(map[string]any{"kind": "book"})

		w := fx.call(fx.server.updateLibraryItem, "PATCH",
			"/api/v1/library/"+item.String(), body, item)

		wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, "cannot become a book")
		fx.refusedBefore("content_items")
		fx.refusedBefore("question_papers")
	})
}

func TestReadLibraryItemCarriesThePaperInline(t *testing.T) {
	item, paper := uuid.New(), uuid.New()

	t.Run("one item", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
		fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}

		w := fx.call(fx.server.getLibraryItem, "GET",
			"/api/v1/library/"+item.String(), "", item)

		if w.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
		}
		var out map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("response is not JSON: %v", err)
		}
		sidecar, has := out["paper"].(map[string]any)
		if !has {
			t.Fatalf("the paper must travel with its item, got %v", out)
		}
		if sidecar["exam_type"] != "board" {
			t.Fatalf("the sidecar must carry its exam type, got %v", sidecar)
		}
		if _, leaked := out["edges"]; leaked {
			t.Fatalf("the sidecar must not also arrive as an edge, got %v", out)
		}
	})

	t.Run("a list reads the sidecar in one pass", func(t *testing.T) {
		fx := newLibraryFixture(t)
		fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
		fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}

		w := fx.call(fx.server.listLibraryItems, "GET", "/api/v1/library", "", uuid.Nil)

		if w.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
		}
		var out struct {
			ContentItems []map[string]any `json:"content_items"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("response is not JSON: %v", err)
		}
		if len(out.ContentItems) != 1 {
			t.Fatalf("want one item, got %v", out.ContentItems)
		}
		if _, has := out.ContentItems[0]["paper"]; !has {
			t.Fatalf("the listed paper must carry its metadata, got %v", out.ContentItems[0])
		}

		reads := 0
		for _, stmt := range fx.statements("question_papers") {
			if stmt.kind == "query" {
				reads++
			}
		}
		if reads != 1 {
			t.Fatalf("the list must read the sidecar once, not once per row, got %d", reads)
		}
	})
}

func TestListLibraryItemsFindsAPaperByItsExam(t *testing.T) {
	fx := newLibraryFixture(t)

	w := fx.call(fx.server.listLibraryItems, "GET",
		"/api/v1/library?exam_type=board&board=CBSE&exam_year=2019", "", uuid.Nil)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	stmts := fx.statements("content_items")
	if len(stmts) == 0 {
		t.Fatal("the list never read the table")
	}
	first := stmts[0]
	if !strings.Contains(first.query, `"question_papers"`) {
		t.Fatalf("the filter must reach the sidecar, got %q", first.query)
	}
	for _, want := range []any{"board", "cbse", 2019} {
		if !first.carriesText(fmt.Sprint(want)) {
			t.Fatalf("the query must carry %v, got %v", want, first.args)
		}
	}
	if !strings.Contains(first.query, `"board" ILIKE`) {
		t.Fatalf("a board must be matched however it was capitalised, got %q", first.query)
	}
}

func TestPaperOnAnItemTheViewerCannotReachIsNotFound(t *testing.T) {
	item, paper := uuid.New(), uuid.New()
	body := libraryBody(map[string]any{"paper": map[string]any{"exam_year": 2020}})

	patch := func(fx *libraryFixture) *httptest.ResponseRecorder {
		return fx.call(fx.server.updateLibraryItem, "PATCH",
			"/api/v1/library/"+item.String(), body, item)
	}
	ownerPaper := func(owner uuid.UUID) map[string]any {
		row := libraryPaperItem(item, owner)
		row["audience"] = string(entcontentitem.AudienceOwner)
		return row
	}

	stranger := newGatedFixture(t, libraryNarrowed())
	stranger.driver.tables["content_items"] = []map[string]any{ownerPaper(uuid.New())}
	stranger.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}

	w := patch(stranger)

	if w.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	stranger.refusedBefore("content_items")
	stranger.refusedBefore("question_papers")

	own := newGatedFixture(t, libraryNarrowed())
	own.driver.tables["content_items"] = []map[string]any{ownerPaper(own.person)}
	own.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}

	if w := patch(own); w.Code == http.StatusNotFound {
		t.Fatalf("the same paper owned by the caller must be reachable, got 404: %s",
			strings.TrimSpace(w.Body.String()))
	}
}

func libraryFieldLimited(keys ...string) libraryOption {
	return func(fx *libraryFixture) {
		allowed := authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Fields: &authorization.FieldPolicy{
				Mode: authorization.FieldModeInclude,
				Keys: keys,
			},
		}
		open := authorization.Decision{Allowed: true, Reach: authorization.ReachTenant, HasReach: true}

		fx.server.guard = libraryGuard{allow: map[authorization.Entity]authorization.Decision{
			authorization.LibraryRead:      allowed,
			authorization.LibraryWrite:     allowed,
			authorization.LibraryCreate:    allowed,
			authorization.LibraryDelete:    allowed,
			authorization.LibraryReadAll:   open,
			authorization.LibraryWriteAll:  open,
			authorization.LibraryDeleteAll: open,
		}}
	}
}

func TestThePaperIsNoHoleInTheFieldPolicy(t *testing.T) {
	item, paper := uuid.New(), uuid.New()

	t.Run("a sidecar field the caller may not write is refused", func(t *testing.T) {
		fx := newLibraryFixture(t, libraryFieldLimited(
			entcontentitem.FieldTitle, entcontentitem.FieldAudience, entcontentitem.FieldKind,
			entquestionpaper.FieldExamType))
		body := libraryBody(map[string]any{
			"title": "Physics 2019", "audience": "school", "kind": "paper",
			"paper": map[string]any{"exam_type": "board", "exam_year": 2019},
		})

		w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)

		wantLibraryRefusal(t, w, http.StatusForbidden, entquestionpaper.FieldExamYear)
		fx.refusedBefore("content_items")
		fx.refusedBefore("question_papers")
	})

	t.Run("a sidecar field the caller may not read is projected away", func(t *testing.T) {
		fx := newLibraryFixture(t, libraryFieldLimited(
			entcontentitem.FieldTitle, entcontentitem.FieldKind, entcontentitem.FieldAudience,
			entquestionpaper.FieldExamType))
		fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
		fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}

		w := fx.call(fx.server.getLibraryItem, "GET",
			"/api/v1/library/"+item.String(), "", item)

		if w.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
		}
		var out map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("response is not JSON: %v", err)
		}
		sidecar, has := out["paper"].(map[string]any)
		if !has {
			t.Fatalf("the permitted paper fields must still arrive, got %v", out)
		}
		if sidecar["exam_type"] != "board" {
			t.Fatalf("exam_type is permitted and must arrive, got %v", sidecar)
		}
		for _, denied := range []string{
			entquestionpaper.FieldBoard,
			entquestionpaper.FieldExamYear,
			entquestionpaper.FieldContentItemID,
		} {
			if _, leaked := sidecar[denied]; leaked {
				t.Fatalf("%s is not permitted but arrived, got %v", denied, sidecar)
			}
		}
	})
}

func TestAssetFiltersRefuseWhatTheyDoNotUnderstand(t *testing.T) {
	cases := []struct {
		name   string
		values url.Values
		want   string
	}{
		{"an unknown parameter", url.Values{"bucket": {"cold"}}, "bucket"},
		{"a misspelt parameter", url.Values{"mimetype": {"application/pdf"}}, "mimetype"},
		{"a parameter that belongs to the items", url.Values{"kind": {"book"}}, "kind"},
		{"an uploader that is not a UUID", url.Values{"uploaded_by": {"seven"}}, "uploaded_by"},
		{"an unknown status", url.Values{"status": {"cold"}}, "status"},
		{"a limit that is not a number", url.Values{"limit": {"lots"}}, "limit"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseAssetFilters(tc.values)
			if err == nil {
				t.Fatalf("%v must be refused, not silently dropped", tc.values)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("the error must name %q, got %v", tc.want, err)
			}
		})
	}
}

func TestAssetFiltersAcceptEveryRecognisedParameter(t *testing.T) {
	uploader := uuid.New()
	values := url.Values{
		"status":      {string(entasset.StatusReady)},
		"mime_type":   {"application/pdf"},
		"uploaded_by": {uploader.String()},
		"limit":       {"25"},
		"offset":      {"10"},
	}

	f, err := parseAssetFilters(values)
	if err != nil {
		t.Fatalf("every parameter is recognised, got %v", err)
	}
	if f.Status == nil || *f.Status != entasset.StatusReady {
		t.Fatalf("status was dropped, got %v", f.Status)
	}
	if f.MimeType == nil || *f.MimeType != "application/pdf" {
		t.Fatalf("mime_type was dropped, got %v", f.MimeType)
	}
	if f.UploadedBy == nil || *f.UploadedBy != uploader {
		t.Fatalf("uploaded_by was dropped, got %v", f.UploadedBy)
	}
	if f.Limit != 25 || f.Offset != 10 {
		t.Fatalf("want limit 25 offset 10, got %d/%d", f.Limit, f.Offset)
	}
}

func TestListAssetsRefusesAnUnknownQueryParameter(t *testing.T) {
	fx := newLibraryFixture(t)

	w := fx.call(fx.server.listAssets, "GET", "/api/v1/library/assets?bucket=cold", "", uuid.Nil)

	wantLibraryRefusal(t, w, http.StatusBadRequest, "bucket")
	if stmts := fx.statements("assets"); len(stmts) > 0 {
		t.Fatalf("the filter was refused but the table was still read: %v", stmts)
	}
}

func placeholdersErased(query string) string {
	var out strings.Builder
	for i := 0; i < len(query); i++ {
		out.WriteByte(query[i])
		if query[i] != '$' {
			continue
		}
		for i+1 < len(query) && query[i+1] >= '0' && query[i+1] <= '9' {
			i++
		}
	}
	return out.String()
}

func assetScopeOf(t *testing.T, query string) string {
	t.Helper()

	open := strings.Index(query, "EXISTS (")
	if open < 0 {
		t.Fatalf("the read is not narrowed to the items the caller may reach: %q", query)
	}
	rest := query[open:]

	const own = `"assets"."uploaded_by" = `
	close := strings.Index(rest, own)
	if close < 0 {
		t.Fatalf("the read does not reach the caller's own uploads: %q", query)
	}
	return placeholdersErased(rest[:close+len(own)])
}

func TestListAssetsIsScopedByTheSamePredicateAsGetAsset(t *testing.T) {
	stored := uuid.New()

	fx := newLibraryFixture(t, libraryNarrowed())
	fx.call(fx.server.listAssets, "GET", "/api/v1/library/assets", "", uuid.Nil)
	listed := fx.statements("assets")
	if len(listed) == 0 {
		t.Fatal("the list never read assets")
	}

	gx := newLibraryFixture(t, libraryNarrowed())
	gx.call(gx.server.getAsset, "GET", "/api/v1/library/assets/"+stored.String(), "", stored)
	got := gx.statements("assets")
	if len(got) == 0 {
		t.Fatal("the read never touched assets")
	}

	if want, have := assetScopeOf(t, got[0].query), assetScopeOf(t, listed[0].query); want != have {
		t.Fatalf("an asset the viewer may not see by id must not arrive in the list either;\n"+
			"get scopes with  %s\nlist scopes with %s", want, have)
	}
	if !listed[0].carries(fx.person) {
		t.Fatalf("the list must be narrowed to the caller %s, got %q %v",
			fx.person, listed[0].query, listed[0].args)
	}
}

func TestListAssetsIsWideOpenOnlyForAnUnrestrictedViewer(t *testing.T) {
	fx := newLibraryFixture(t)

	fx.call(fx.server.listAssets, "GET", "/api/v1/library/assets", "", uuid.Nil)

	reads := fx.statements("assets")
	if len(reads) == 0 {
		t.Fatal("the list never read assets")
	}
	if reads[0].names("content_items") || reads[0].carries(fx.person) {
		t.Fatalf("an unrestricted viewer needs no narrowing, got %q %v", reads[0].query, reads[0].args)
	}
}

func TestListAssetsNarrowsOnEveryFilterItAccepts(t *testing.T) {
	uploader := uuid.New()
	fx := newLibraryFixture(t)

	fx.call(fx.server.listAssets, "GET",
		"/api/v1/library/assets?status=ready&mime_type=application/pdf&uploaded_by="+uploader.String(),
		"", uuid.Nil)

	reads := fx.statements("assets")
	if len(reads) == 0 {
		t.Fatal("the list never read assets")
	}
	read := reads[0]
	for _, want := range []any{string(entasset.StatusReady), "application/pdf", uploader} {
		if !read.carriesText(fmt.Sprint(want)) {
			t.Fatalf("the query must carry %v, got %q %v", want, read.query, read.args)
		}
	}
}

func TestListAssetsOrdersNewestFirstAndPages(t *testing.T) {
	fx := newLibraryFixture(t)

	fx.call(fx.server.listAssets, "GET", "/api/v1/library/assets?limit=1&offset=2", "", uuid.Nil)

	reads := fx.statements("assets")
	if len(reads) == 0 {
		t.Fatal("the list never read assets")
	}
	query := reads[0].query
	if !strings.Contains(query, `ORDER BY "assets"."created_at" DESC`) {
		t.Fatalf("a list nobody can order is a list nobody can page, got %q", query)
	}
	if !strings.Contains(query, "LIMIT 1") || !strings.Contains(query, "OFFSET 2") {
		t.Fatalf("the page must reach the query, got %q", query)
	}
}

func TestListAssetsAnswersTheAssetsItFound(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t)
	fx.driver.tables["assets"] = []map[string]any{libraryAssetRow(stored, fx.person)}

	w := fx.call(fx.server.listAssets, "GET", "/api/v1/library/assets?limit=1", "", uuid.Nil)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	var out struct {
		Assets []map[string]any `json:"assets"`
		Count  int              `json:"count"`
		Page   page             `json:"page"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("response is not JSON: %v (%q)", err, w.Body.String())
	}
	if len(out.Assets) != 1 || out.Count != 1 {
		t.Fatalf("want one asset and a count of one, got %v", out)
	}
	if out.Assets[0]["storage_key"] != mintedStorageKey(stored) {
		t.Fatalf("the listed asset must be the stored one, got %v", out.Assets[0])
	}
	if out.Page.Limit != 1 || !out.Page.HasMore {
		t.Fatalf("a full page must say there may be more, got %+v", out.Page)
	}
}

func TestCreateAssetKeepsNoRowWhenItsUploadLinkCannotBeIssued(t *testing.T) {
	cases := []struct {
		name string
		err  error
	}{
		{"the store broke", errors.New("blob: presign put: the bucket is on fire")},
		{"the length could not be bound", fmt.Errorf("%w: %w", blob.ErrUnbound, blob.ErrZeroLength)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			fx.store.putErr = tc.err

			w := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
				libraryBody(assetUpload(nil)), uuid.Nil)

			if w.Code == http.StatusCreated {
				t.Fatalf("an asset with no upload link is not created, got %d: %s",
					w.Code, strings.TrimSpace(w.Body.String()))
			}
			if stmts := fx.statements("assets"); len(stmts) > 0 {
				t.Fatalf("a row with no object behind it stays pending forever; "+
					"the failed grant left %d statement(s) on assets: %v", len(stmts), stmts)
			}
		})
	}
}

func TestCreateAssetSignsTheSameKeyItStores(t *testing.T) {
	fx := newLibraryFixture(t)

	w := createdAsset(t, fx, assetUpload(nil))

	key := assetField(t, w, "storage_key")
	if fx.store.put.Key != key {
		t.Fatalf("the link was signed for %q but the row records %q", fx.store.put.Key, key)
	}
	if insert := fx.onlyWrite("assets"); !insert.carries(key) {
		t.Fatalf("the signed key %q never reached the row, got %v", key, insert.args)
	}
}

func libraryPaperWithBoard(board string) string {
	return libraryBody(map[string]any{
		"title": "Physics 2019", "audience": "school", "kind": "paper",
		"paper": map[string]any{"exam_type": "annual", "board": board},
	})
}

func boardWrittenFor(t *testing.T, spelling string) string {
	t.Helper()

	fx := newLibraryFixture(t)
	w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library",
		libraryPaperWithBoard(spelling), uuid.Nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}

	sidecar := fx.onlyWrite("question_papers")
	for _, arg := range sidecar.args {
		stored, ok := arg.(string)
		if ok && stored != "annual" && strings.EqualFold(strings.Join(strings.Fields(spelling), " "), stored) {
			return stored
		}
	}
	t.Fatalf("the insert carried no board for %q: %v", spelling, sidecar.args)
	return ""
}

func foldedArgFor(t *testing.T, stmt libraryStmt, column string) string {
	t.Helper()

	marker := `"` + column + `" ILIKE $`
	at := strings.Index(stmt.query, marker)
	if at < 0 {
		t.Fatalf("%s is matched exactly, so a filter misses every other spelling: %q", column, stmt.query)
	}

	nth := 0
	for _, digit := range stmt.query[at+len(marker):] {
		if digit < '0' || digit > '9' {
			break
		}
		nth = nth*10 + int(digit-'0')
	}
	if nth < 1 || nth > len(stmt.args) {
		t.Fatalf("the query names $%d but carries %d arguments: %q", nth, len(stmt.args), stmt.query)
	}
	folded, ok := stmt.args[nth-1].(string)
	if !ok {
		t.Fatalf("the %s argument is %T, not a string", column, stmt.args[nth-1])
	}
	return folded
}

func TestABoardIsStoredWithoutTheWhitespaceItWasSentWith(t *testing.T) {
	cases := []struct {
		name string
		sent string
		want string
	}{
		{"as it is", "CBSE", "CBSE"},
		{"padded", " CBSE ", "CBSE"},
		{"lower case", "cbse", "cbse"},
		{"split by a stray run", "Central   Board ", "Central Board"},
		{"padded with a tab", "\tCBSE\n", "CBSE"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library",
				libraryPaperWithBoard(tc.sent), uuid.Nil)

			if w.Code != http.StatusCreated {
				t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			sidecar := fx.onlyWrite("question_papers")
			if !sidecar.carriesText(tc.want) {
				t.Fatalf("%q must be stored as %q, got %v", tc.sent, tc.want, sidecar.args)
			}
			if tc.sent != tc.want && sidecar.carriesText(tc.sent) {
				t.Fatalf("%q was stored as it was sent, so it is a board of its own: %v",
					tc.sent, sidecar.args)
			}
		})
	}
}

func TestOneBoardFilterFindsEverySpellingOfThatBoard(t *testing.T) {
	spellings := []string{"CBSE", "cbse", " CBSE "}

	stored := make([]string, 0, len(spellings))
	for _, spelling := range spellings {
		stored = append(stored, boardWrittenFor(t, spelling))
	}
	if stored[0] != stored[2] {
		t.Fatalf("%q and %q are the same board and must be stored alike, got %q and %q",
			spellings[0], spellings[2], stored[0], stored[2])
	}

	fx := newLibraryFixture(t)
	fx.call(fx.server.listLibraryItems, "GET", "/api/v1/library?board=+CBSE+", "", uuid.Nil)

	reads := fx.statements("content_items")
	if len(reads) == 0 {
		t.Fatal("the list never read the table")
	}
	asked := foldedArgFor(t, reads[0], entquestionpaper.FieldBoard)
	for i, board := range stored {
		if !strings.EqualFold(board, asked) {
			t.Fatalf("the filter asks for %q, which does not find %q stored for %q",
				asked, board, spellings[i])
		}
	}
}

func TestAPaperBoardTooLongForTheColumnIsRefused(t *testing.T) {
	long := strings.Repeat("b", boardRunes+1)

	fx := newLibraryFixture(t)
	w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library",
		libraryPaperWithBoard(long), uuid.Nil)

	wantLibraryRefusal(t, w, http.StatusBadRequest, "board", "at most")
	fx.refusedBefore("question_papers")
}

func TestEveryImmutableFieldRefusalAnswersTheSameStatus(t *testing.T) {
	item := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name  string
		field string
		call  func(t *testing.T) *httptest.ResponseRecorder
	}{
		{
			name:  "a library item",
			field: entcontentitem.FieldAssetID,
			call: func(t *testing.T) *httptest.ResponseRecorder {
				fx := newLibraryFixture(t)
				fx.driver.tables["content_items"] = []map[string]any{
					libraryGradeItem(item, fx.person, grade),
				}
				return fx.call(fx.server.updateLibraryItem, "PATCH",
					"/api/v1/library/"+item.String(),
					libraryBody(map[string]any{entcontentitem.FieldAssetID: uuid.New()}), item)
			},
		},
		{
			name:  "a question paper",
			field: entquestionpaper.FieldContentItemID,
			call: func(t *testing.T) *httptest.ResponseRecorder {
				fx := newLibraryFixture(t)
				return fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library",
					libraryBody(map[string]any{
						"title": "Physics 2019", "audience": "school", "kind": "paper",
						"paper": map[string]any{
							"exam_type":                         "annual",
							entquestionpaper.FieldContentItemID: uuid.New(),
						},
					}), uuid.Nil)
			},
		},
		{
			name:  "a curriculum",
			field: entcurriculum.FieldCode,
			call: func(t *testing.T) *httptest.ResponseRecorder {
				fx := newCurriculumFixture(t)
				fx.driver.tables[curriculaTable] = []map[string]any{
					curriculumRow(item, session, subject, grade, entcurriculum.StatusDraft),
				}
				return fx.call(fx.server.updateCurriculum, "PATCH",
					"/api/v1/curricula/"+item.String(), `{"code":"MATH-9-2027"}`, item)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			wantLibraryRefusal(t, tc.call(t), http.StatusUnprocessableEntity, tc.field)
		})
	}
}

func TestUpdateLibraryItemNormalisesTheBoardItStores(t *testing.T) {
	item, paper := uuid.New(), uuid.New()
	fx := newLibraryFixture(t)
	fx.driver.tables["content_items"] = []map[string]any{libraryPaperItem(item, fx.person)}
	fx.driver.tables["question_papers"] = []map[string]any{librarySidecar(paper, item)}
	body := libraryBody(map[string]any{"paper": map[string]any{"board": "  CBSE "}})

	w := fx.call(fx.server.updateLibraryItem, "PATCH",
		"/api/v1/library/"+item.String(), body, item)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	write := fx.onlyWrite("question_papers")
	if !write.carriesText("CBSE") {
		t.Fatalf("the update must store the normalised board, got %v", write.args)
	}
	if write.carriesText("  CBSE ") {
		t.Fatalf("the update stored the board as it was sent, got %v", write.args)
	}
}

type assetReachDriver struct{ inner *libraryDriver }

func (d *assetReachDriver) Query(ctx context.Context, query string, args, v any) error {
	if libraryQueriedTable(query) != "assets" {
		return d.inner.Query(ctx, query, args, v)
	}
	list, _ := args.([]any)
	d.inner.record("query", query, list)

	where := libraryWhereOf(query)
	kept := make([]map[string]any, 0, len(d.inner.tables["assets"]))
	for _, row := range d.inner.tables["assets"] {
		if assetVisibleUnder(where, list, row) {
			kept = append(kept, row)
		}
	}

	rows, ok := v.(*entsql.Rows)
	if !ok {
		return fmt.Errorf("stub: unexpected query target %T", v)
	}
	*rows = entsql.Rows{ColumnScanner: &libraryRows{
		cols: librarySelectedColumns(query),
		rows: kept,
	}}
	return nil
}

func (d *assetReachDriver) Exec(ctx context.Context, query string, args, v any) error {
	return d.inner.Exec(ctx, query, args, v)
}

func (d *assetReachDriver) Tx(ctx context.Context) (dialect.Tx, error) { return d.inner.Tx(ctx) }
func (d *assetReachDriver) Close() error                               { return d.inner.Close() }
func (d *assetReachDriver) Dialect() string                            { return d.inner.Dialect() }

func argAfter(where, marker string, args []any) (any, bool) {
	at := strings.Index(where, marker)
	if at < 0 {
		return nil, false
	}
	clause := &libraryClause{src: where[at+len(marker):], args: args}
	return clause.placeholder()
}

func assetVisibleUnder(where string, args []any, row map[string]any) bool {
	if strings.Contains(where, "FALSE") {
		return false
	}
	if want, named := argAfter(where, `"assets"."id" = `, args); named && !libraryMatches(row["id"], want) {
		return false
	}

	scoped := strings.Contains(where, "EXISTS (")
	if want, named := argAfter(where, `"assets"."uploaded_by" = `, args); named {
		scoped = true
		if libraryMatches(row["uploaded_by"], want) {
			return true
		}
	}
	return !scoped
}

func TestTheAssetGateHonoursTheWhereClause(t *testing.T) {
	stored, stranger := uuid.New(), uuid.New()
	row := libraryAssetRowIn(stored, stranger, entasset.StatusReady)

	cases := []struct {
		name  string
		where string
		args  []any
		want  bool
	}{
		{"an unscoped read sees the row", `"assets"."id" = $1`, []any{stored}, true},
		{"another row's id is not this row", `"assets"."id" = $1`, []any{uuid.New()}, false},
		{"the uploader arm admits its own upload",
			`"assets"."id" = $1 AND "assets"."uploaded_by" = $2`, []any{stored, stranger}, true},
		{"the uploader arm refuses somebody else's upload",
			`"assets"."id" = $1 AND "assets"."uploaded_by" = $2`, []any{stored, uuid.New()}, false},
		{"a scope that admits nothing admits nothing",
			`"assets"."id" = $1 AND FALSE`, []any{stored}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := assetVisibleUnder(tc.where, tc.args, row); got != tc.want {
				t.Fatalf("want %t for %q %v, got %t", tc.want, tc.where, tc.args, got)
			}
		})
	}
}

func libraryGatesAssets() libraryOption {
	return func(fx *libraryFixture) {
		client := tenantent.NewClient(tenantent.Driver(&assetReachDriver{inner: fx.driver}))
		fx.ctx = postgres.WithConn(fx.ctx, &postgres.TenantConn{Client: client})
	}
}

func libraryBreadth() libraryOption {
	return func(fx *libraryFixture) {
		narrow := authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachSelf,
			HasReach: true,
		}
		fx.server.guard = libraryGuard{allow: map[authorization.Entity]authorization.Decision{
			authorization.LibraryRead:     narrow,
			authorization.LibraryWrite:    narrow,
			authorization.LibraryDelete:   narrow,
			authorization.LibraryCreate:   narrow,
			authorization.LibraryWriteAll: {Allowed: true},
		}}
	}
}

func libraryWithoutAPersonRecord() libraryOption {
	return func(fx *libraryFixture) { fx.driver.tables["persons"] = nil }
}

func TestMarkAssetReadyHonoursTheBreadthGrantOnSomebodyElsesUpload(t *testing.T) {
	stored, stranger := uuid.New(), uuid.New()

	cases := []struct {
		name  string
		grant libraryOption
		want  int
	}{
		{"the narrow grant alone reaches only its own uploads", libraryNarrowed(), http.StatusNotFound},
		{"the breadth grant reaches the upload it did not make", libraryBreadth(), http.StatusOK},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t, tc.grant, libraryGatesAssets())
			fx.driver.tables["assets"] = []map[string]any{
				libraryAssetRowIn(stored, stranger, entasset.StatusPending),
			}

			w := fx.markReady(stored)

			if w.Code != tc.want {
				t.Fatalf("want %d, got %d: %s", tc.want, w.Code,
					strings.TrimSpace(w.Body.String()))
			}
		})
	}
}

func TestMarkAssetReadyIsReachableByACallerWithNoPersonRecord(t *testing.T) {
	stored, stranger := uuid.New(), uuid.New()

	cases := []struct {
		name  string
		grant libraryOption
		want  int
	}{
		{"with the narrow grant it has no arm to reach by", libraryNarrowed(), http.StatusNotFound},
		{"with the breadth grant the upload can be completed", libraryBreadth(), http.StatusOK},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t, tc.grant, libraryWithoutAPersonRecord(), libraryGatesAssets())
			fx.driver.tables["assets"] = []map[string]any{
				libraryAssetRowIn(stored, stranger, entasset.StatusPending),
			}

			w := fx.markReady(stored)

			if w.Code != tc.want {
				t.Fatalf("a subject with no person record %s: want %d, got %d: %s",
					tc.name, tc.want, w.Code, strings.TrimSpace(w.Body.String()))
			}
		})
	}
}
