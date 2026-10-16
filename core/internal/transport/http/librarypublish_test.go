package http

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

type publishGuard struct{ reach authorization.Reach }

func (g publishGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.LibraryCreate, authorization.LibraryWrite, authorization.LibraryRead,
		authorization.LibraryDelete:
		return authorization.Decision{Allowed: true, Reach: g.reach, HasReach: true}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (publishGuard) Name() string { return "publish gate test guard" }

func libraryTeaches(section uuid.UUID) libraryOption {
	return func(fx *libraryFixture) {
		staff, teacher := uuid.New(), uuid.New()
		fx.server.guard = publishGuard{reach: authorization.ReachTeacherAssignment}
		fx.driver.tables["staff"] = []map[string]any{{"id": staff, "person_id": fx.person}}
		fx.driver.tables["teachers"] = []map[string]any{{"id": teacher, "staff_id": staff}}
		fx.driver.tables["teacher_assignments"] = []map[string]any{
			{"id": uuid.New(), "teacher_id": teacher, "section_id": section},
		}
	}
}

func libraryOwnerItem(item, person uuid.UUID) map[string]any {
	return map[string]any{
		"id":              item,
		"title":           "Atlas",
		"audience":        string(entcontentitem.AudienceOwner),
		"owner_person_id": person,
		"kind":            string(entcontentitem.KindDocument),
		"status":          string(entcontentitem.StatusDraft),
		"index_status":    string(entcontentitem.IndexStatusNone),
	}
}

func TestCreateLibraryItemRefusesAnAudienceOutsideTheWriteScope(t *testing.T) {
	own, other, offering := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		fields   map[string]any
		wantCode int
	}{
		{
			name:     "the whole school",
			fields:   map[string]any{"audience": "school"},
			wantCode: http.StatusForbidden,
		},
		{
			name:     "a section the caller does not teach",
			fields:   map[string]any{"audience": "section", "section_id": other},
			wantCode: http.StatusForbidden,
		},
		{
			name:     "an offering the caller does not teach",
			fields:   map[string]any{"audience": "offering", "subject_offering_id": offering},
			wantCode: http.StatusForbidden,
		},
		{
			name:     "the caller's own section",
			fields:   map[string]any{"audience": "section", "section_id": own},
			wantCode: http.StatusCreated,
		},
		{
			name:     "the caller alone",
			fields:   map[string]any{"audience": "owner"},
			wantCode: http.StatusCreated,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t, libraryTeaches(own))
			tc.fields["title"] = "Atlas"

			w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library",
				libraryBody(tc.fields), uuid.Nil)

			if tc.wantCode == http.StatusForbidden {
				wantLibraryRefusal(t, w, http.StatusForbidden, tc.fields["audience"].(string))
				fx.refusedBefore("content_items")
				return
			}
			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, w.Body.String())
			}
			fx.onlyWrite("content_items")
		})
	}
}

func TestUpdateLibraryItemRefusesAnAudienceOutsideTheWriteScope(t *testing.T) {
	item, own, other := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		fields   map[string]any
		wantCode int
	}{
		{
			name:     "owner to the whole school",
			fields:   map[string]any{"audience": "school"},
			wantCode: http.StatusForbidden,
		},
		{
			name:     "owner to a section the caller does not teach",
			fields:   map[string]any{"audience": "section", "section_id": other},
			wantCode: http.StatusForbidden,
		},
		{
			name:     "owner to the caller's own section",
			fields:   map[string]any{"audience": "section", "section_id": own},
			wantCode: http.StatusOK,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t, libraryTeaches(own))
			fx.driver.tables["content_items"] = []map[string]any{libraryOwnerItem(item, fx.person)}

			w := fx.call(fx.server.updateLibraryItem, "PATCH",
				"/api/v1/library/"+item.String(), libraryBody(tc.fields), item)

			if tc.wantCode == http.StatusForbidden {
				wantLibraryRefusal(t, w, http.StatusForbidden, tc.fields["audience"].(string))
				fx.refusedBefore("content_items")
				return
			}
			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, w.Body.String())
			}
			fx.onlyWrite("content_items")
		})
	}
}

func TestCreateLibraryItemLetsATenantWideWriterReachTheWholeSchool(t *testing.T) {
	fx := newLibraryFixture(t, libraryTeaches(uuid.New()))
	fx.server.guard = publishGuard{reach: authorization.ReachTenant}
	body := libraryBody(map[string]any{"title": "Atlas", "audience": "school"})

	w := fx.call(fx.server.createLibraryItem, "POST", "/api/v1/library", body, uuid.Nil)

	if w.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", w.Code, w.Body.String())
	}
	fx.onlyWrite("content_items")
}

type libraryTerm func(map[string]any) (bool, error)

type libraryClause struct {
	src  string
	at   int
	args []any
}

func libraryWhereOf(query string) string {
	const marker = " WHERE "
	i := strings.Index(query, marker)
	if i < 0 {
		return ""
	}
	clause := query[i+len(marker):]
	for _, tail := range []string{" ORDER BY ", " LIMIT ", " OFFSET "} {
		if j := strings.Index(clause, tail); j >= 0 {
			clause = clause[:j]
		}
	}
	return clause
}

func (c *libraryClause) skipSpace() {
	for c.at < len(c.src) && c.src[c.at] == ' ' {
		c.at++
	}
}

func (c *libraryClause) accept(token string) bool {
	c.skipSpace()
	if !strings.HasPrefix(c.src[c.at:], token) {
		return false
	}
	c.at += len(token)
	return true
}

func (c *libraryClause) skipToClose(depth int) error {
	for c.at < len(c.src) {
		switch c.src[c.at] {
		case '(':
			depth++
		case ')':
			depth--
		}
		c.at++
		if depth == 0 {
			return nil
		}
	}
	return fmt.Errorf("stub: unbalanced parentheses in %q", c.src)
}

func (c *libraryClause) identifier() (string, bool) {
	c.skipSpace()
	if c.at >= len(c.src) || c.src[c.at] != '"' {
		return "", false
	}
	end := strings.IndexByte(c.src[c.at+1:], '"')
	if end < 0 {
		return "", false
	}
	name := c.src[c.at+1 : c.at+1+end]
	c.at += end + 2
	return name, true
}

func (c *libraryClause) column() (string, bool) {
	name, ok := c.identifier()
	if !ok {
		return "", false
	}
	if c.at < len(c.src) && c.src[c.at] == '.' {
		c.at++
		return c.identifier()
	}
	return name, true
}

func (c *libraryClause) placeholder() (any, bool) {
	c.skipSpace()
	if c.at >= len(c.src) || c.src[c.at] != '$' {
		return nil, false
	}
	c.at++
	start := c.at
	for c.at < len(c.src) && c.src[c.at] >= '0' && c.src[c.at] <= '9' {
		c.at++
	}
	n, err := strconv.Atoi(c.src[start:c.at])
	if err != nil || n < 1 || n > len(c.args) {
		return nil, false
	}
	return c.args[n-1], true
}

func libraryMatches(cell, want any) bool {
	if cell == nil || want == nil {
		return false
	}
	return fmt.Sprint(cell) == fmt.Sprint(want)
}

func libraryBeyondTheStub(what string) libraryTerm {
	return func(map[string]any) (bool, error) {
		return false, fmt.Errorf("stub: cannot evaluate %s", what)
	}
}

func libraryBoth(left, right libraryTerm) libraryTerm {
	return func(row map[string]any) (bool, error) {
		ok, err := left(row)
		if err != nil || !ok {
			return false, err
		}
		return right(row)
	}
}

func libraryEither(left, right libraryTerm) libraryTerm {
	return func(row map[string]any) (bool, error) {
		ok, err := left(row)
		if err != nil || ok {
			return ok, err
		}
		return right(row)
	}
}

func (c *libraryClause) term() (libraryTerm, error) {
	switch {
	case c.accept("FALSE"):
		return func(map[string]any) (bool, error) { return false, nil }, nil
	case c.accept("TRUE"):
		return func(map[string]any) (bool, error) { return true, nil }, nil
	case c.accept("EXISTS ("):
		if err := c.skipToClose(1); err != nil {
			return nil, err
		}
		return libraryBeyondTheStub("a correlated subquery"), nil
	case c.accept("("):
		inner, err := c.disjunction()
		if err != nil {
			return nil, err
		}
		if !c.accept(")") {
			return nil, fmt.Errorf("stub: expected ) at %q", c.src[c.at:])
		}
		return inner, nil
	}

	col, ok := c.column()
	if !ok {
		return nil, fmt.Errorf("stub: expected a column at %q", c.src[c.at:])
	}

	switch {
	case c.accept("IS NOT NULL"):
		return func(row map[string]any) (bool, error) { return row[col] != nil, nil }, nil
	case c.accept("IS NULL"):
		return func(row map[string]any) (bool, error) { return row[col] == nil, nil }, nil
	case c.accept("= "):
		want, ok := c.placeholder()
		if !ok {
			return nil, fmt.Errorf("stub: expected a placeholder at %q", c.src[c.at:])
		}
		return func(row map[string]any) (bool, error) { return libraryMatches(row[col], want), nil }, nil
	case c.accept("IN (SELECT"):
		if err := c.skipToClose(1); err != nil {
			return nil, err
		}
		return libraryBeyondTheStub("a subquery"), nil
	case c.accept("IN ("):
		var wants []any
		for {
			want, ok := c.placeholder()
			if !ok {
				return nil, fmt.Errorf("stub: expected a placeholder at %q", c.src[c.at:])
			}
			wants = append(wants, want)
			if !c.accept(",") {
				break
			}
		}
		if !c.accept(")") {
			return nil, fmt.Errorf("stub: expected ) at %q", c.src[c.at:])
		}
		return func(row map[string]any) (bool, error) {
			for _, want := range wants {
				if libraryMatches(row[col], want) {
					return true, nil
				}
			}
			return false, nil
		}, nil
	}
	return nil, fmt.Errorf("stub: unsupported operator at %q", c.src[c.at:])
}

func (c *libraryClause) conjunction() (libraryTerm, error) {
	left, err := c.term()
	if err != nil {
		return nil, err
	}
	for c.accept("AND ") {
		right, err := c.term()
		if err != nil {
			return nil, err
		}
		left = libraryBoth(left, right)
	}
	return left, nil
}

func (c *libraryClause) disjunction() (libraryTerm, error) {
	left, err := c.conjunction()
	if err != nil {
		return nil, err
	}
	for c.accept("OR ") {
		right, err := c.conjunction()
		if err != nil {
			return nil, err
		}
		left = libraryEither(left, right)
	}
	return left, nil
}

func libraryReachable(query string, args []any, rows []map[string]any) ([]map[string]any, error) {
	where := libraryWhereOf(query)
	if where == "" {
		return rows, nil
	}
	clause := &libraryClause{src: where, args: args}
	match, err := clause.disjunction()
	if err != nil {
		return nil, err
	}
	clause.skipSpace()
	if clause.at != len(clause.src) {
		return nil, fmt.Errorf("stub: trailing SQL at %q", clause.src[clause.at:])
	}

	kept := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		ok, err := match(row)
		if err != nil {
			return nil, err
		}
		if ok {
			kept = append(kept, row)
		}
	}
	return kept, nil
}

type gatedDriver struct{ inner *libraryDriver }

func (d *gatedDriver) Query(ctx context.Context, query string, args, v any) error {
	if libraryQueriedTable(query) != "content_items" {
		return d.inner.Query(ctx, query, args, v)
	}
	list, _ := args.([]any)
	d.inner.record("query", query, list)

	kept, err := libraryReachable(query, list, d.inner.tables["content_items"])
	if err != nil {
		return err
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

func (d *gatedDriver) Exec(ctx context.Context, query string, args, v any) error {
	return d.inner.Exec(ctx, query, args, v)
}

func (d *gatedDriver) Tx(context.Context) (dialect.Tx, error) { return dialect.NopTx(d), nil }
func (d *gatedDriver) Close() error                           { return d.inner.Close() }
func (d *gatedDriver) Dialect() string                        { return d.inner.Dialect() }

func newGatedFixture(t *testing.T, opts ...libraryOption) *libraryFixture {
	t.Helper()

	person := uuid.New()
	inner := &libraryDriver{tables: map[string][]map[string]any{
		"persons": {{"id": person}},
	}}
	client := tenantent.NewClient(tenantent.Driver(&gatedDriver{inner: inner}))

	ctx := authorization.WithSubject(context.Background(),
		&authorization.Subject{CASUserID: uuid.New()})
	ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	fx := &libraryFixture{
		t:      t,
		server: &Server{guard: authorization.AllowAll{}},
		driver: inner,
		ctx:    ctx,
		person: person,
	}
	for _, opt := range opts {
		opt(fx)
	}
	return fx
}

func librarySchoolItem(item, owner uuid.UUID) map[string]any {
	row := libraryOwnerItem(item, owner)
	row["audience"] = string(entcontentitem.AudienceSchool)
	row["status"] = string(entcontentitem.StatusPublished)
	return row
}

func libraryReaches(reach authorization.Reach) libraryOption {
	return func(fx *libraryFixture) { fx.server.guard = publishGuard{reach: reach} }
}

func TestDeleteLibraryItemRefusesAnItemTheCallerDoesNotOwn(t *testing.T) {
	item, stranger, section := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		option   libraryOption
		row      func(fx *libraryFixture) map[string]any
		wantCode int
	}{
		{
			name:     "a pupil may not delete a school document a teacher owns",
			option:   libraryNarrowed(),
			row:      func(*libraryFixture) map[string]any { return librarySchoolItem(item, stranger) },
			wantCode: http.StatusNotFound,
		},
		{
			name:     "a pupil may delete its own note",
			option:   libraryNarrowed(),
			row:      func(fx *libraryFixture) map[string]any { return libraryOwnerItem(item, fx.person) },
			wantCode: http.StatusNoContent,
		},
		{
			name:     "a teacher may not delete a school document another teacher owns",
			option:   libraryTeaches(section),
			row:      func(*libraryFixture) map[string]any { return librarySchoolItem(item, stranger) },
			wantCode: http.StatusNotFound,
		},
		{
			name:     "a teacher may delete its own note",
			option:   libraryTeaches(section),
			row:      func(fx *libraryFixture) map[string]any { return libraryOwnerItem(item, fx.person) },
			wantCode: http.StatusNoContent,
		},
		{
			name:     "a tenant wide deleter may delete a school document anyone owns",
			option:   libraryReaches(authorization.ReachTenant),
			row:      func(*libraryFixture) map[string]any { return librarySchoolItem(item, stranger) },
			wantCode: http.StatusNoContent,
		},
		{
			name:     "an unrestricted deleter may delete a school document anyone owns",
			option:   func(*libraryFixture) {},
			row:      func(*libraryFixture) map[string]any { return librarySchoolItem(item, stranger) },
			wantCode: http.StatusNoContent,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newGatedFixture(t, tc.option)
			fx.driver.tables["content_items"] = []map[string]any{tc.row(fx)}

			w := fx.call(fx.server.deleteLibraryItem, "DELETE",
				"/api/v1/library/"+item.String(), "", item)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, w.Body.String())
			}
			if tc.wantCode == http.StatusNoContent {
				fx.onlyWrite("content_items")
				return
			}
			fx.changedNothing("content_items")
		})
	}
}

func TestUpdateLibraryItemRefusesAnItemTheCallerDoesNotOwn(t *testing.T) {
	item, stranger, section := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		option   libraryOption
		fields   map[string]any
		row      func(fx *libraryFixture) map[string]any
		wantCode int
	}{
		{
			name:     "a pupil may not hoard a school document by making it its own",
			option:   libraryNarrowed(),
			fields:   map[string]any{"audience": "owner", "title": "Hijacked"},
			row:      func(*libraryFixture) map[string]any { return librarySchoolItem(item, stranger) },
			wantCode: http.StatusNotFound,
		},
		{
			name:     "a pupil may not retitle a school document a teacher owns",
			option:   libraryNarrowed(),
			fields:   map[string]any{"title": "Hijacked"},
			row:      func(*libraryFixture) map[string]any { return librarySchoolItem(item, stranger) },
			wantCode: http.StatusNotFound,
		},
		{
			name:     "a teacher may not hoard a school document another teacher owns",
			option:   libraryTeaches(section),
			fields:   map[string]any{"audience": "owner", "title": "Hijacked"},
			row:      func(*libraryFixture) map[string]any { return librarySchoolItem(item, stranger) },
			wantCode: http.StatusNotFound,
		},
		{
			name:     "a teacher may retitle its own note",
			option:   libraryTeaches(section),
			fields:   map[string]any{"title": "Atlas of Bengal"},
			row:      func(fx *libraryFixture) map[string]any { return libraryOwnerItem(item, fx.person) },
			wantCode: http.StatusOK,
		},
		{
			name:     "a tenant wide writer may retitle a school document anyone owns",
			option:   libraryReaches(authorization.ReachTenant),
			fields:   map[string]any{"title": "Atlas of Bengal"},
			row:      func(*libraryFixture) map[string]any { return librarySchoolItem(item, stranger) },
			wantCode: http.StatusOK,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newGatedFixture(t, tc.option)
			fx.driver.tables["content_items"] = []map[string]any{tc.row(fx)}

			w := fx.call(fx.server.updateLibraryItem, "PATCH",
				"/api/v1/library/"+item.String(), libraryBody(tc.fields), item)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, w.Body.String())
			}
			if tc.wantCode == http.StatusOK {
				fx.onlyWrite("content_items")
				return
			}
			fx.refusedBefore("content_items")
		})
	}
}

func TestLibraryReadsStillReachTheSchoolDocumentsOfOthers(t *testing.T) {
	item, teacher := uuid.New(), uuid.New()

	t.Run("get", func(t *testing.T) {
		fx := newGatedFixture(t, libraryNarrowed())
		fx.driver.tables["content_items"] = []map[string]any{librarySchoolItem(item, teacher)}

		w := fx.call(fx.server.getLibraryItem, "GET",
			"/api/v1/library/"+item.String(), "", item)

		if w.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), item.String()) {
			t.Fatalf("the school document was not returned: %s", w.Body.String())
		}
	})

	t.Run("list", func(t *testing.T) {
		fx := newGatedFixture(t, libraryNarrowed())
		fx.driver.tables["content_items"] = []map[string]any{librarySchoolItem(item, teacher)}

		w := fx.call(fx.server.listLibraryItems, "GET", "/api/v1/library", "", uuid.Nil)

		if w.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `"count":1`) {
			t.Fatalf("the school document was not listed: %s", w.Body.String())
		}
	})
}

func TestTheGatedFixtureHonoursTheWhereClause(t *testing.T) {
	item, stranger := uuid.New(), uuid.New()

	fx := newGatedFixture(t, libraryNarrowed())
	fx.driver.tables["content_items"] = []map[string]any{librarySchoolItem(item, stranger)}

	w := fx.call(fx.server.getLibraryItem, "GET",
		"/api/v1/library/"+uuid.New().String(), "", uuid.New())

	if w.Code != http.StatusNotFound {
		t.Fatalf("the stub ignored the id in the WHERE clause: %d %s", w.Code, w.Body.String())
	}
}
