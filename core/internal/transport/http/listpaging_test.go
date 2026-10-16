package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

func recordsGuard() authorization.Guard {
	narrow := authorization.Decision{Allowed: true, Reach: authorization.ReachSelf, HasReach: true}
	allow := map[authorization.Entity]authorization.Decision{}
	for _, entity := range []authorization.Entity{
		authorization.EnrollmentsRead,
		authorization.SubjectEnrollmentsRead,
		authorization.StudentAddressesRead,
		authorization.StudentDocumentsRead,
		authorization.StudentNotesRead,
	} {
		allow[entity] = narrow
	}
	return libraryGuard{allow: allow}
}

type recordsFixture struct {
	*libraryFixture
	student uuid.UUID
}

func newRecordsFixture(t *testing.T) *recordsFixture {
	t.Helper()

	fx := newLibraryFixture(t)
	fx.server.guard = recordsGuard()

	student := uuid.New()
	fx.driver.tables["students"] = []map[string]any{{"id": student, "person_id": fx.person}}
	return &recordsFixture{libraryFixture: fx, student: student}
}

func (fx *recordsFixture) read(table string) libraryStmt {
	fx.t.Helper()

	var found *libraryStmt
	for i, stmt := range fx.driver.stmts {
		if stmt.kind == "query" && libraryQueriedTable(stmt.query) == table {
			found = &fx.driver.stmts[i]
		}
	}
	if found == nil {
		fx.t.Fatalf("nothing ever read %s", table)
	}
	return *found
}

type recordListing struct {
	name        string
	list        func(*Server) http.HandlerFunc
	path        string
	table       string
	scope       string
	filter      string
	filterValue string
	seed        func(*recordsFixture, int)
}

func seedRows(fx *recordsFixture, table string, n int, fields func() map[string]any) {
	rows := make([]map[string]any, 0, n)
	for i := 0; i < n; i++ {
		row := fields()
		row["id"] = uuid.New()
		rows = append(rows, row)
	}
	fx.driver.tables[table] = rows
}

func seedStudentRows(table string) func(*recordsFixture, int) {
	return func(fx *recordsFixture, n int) {
		seedRows(fx, table, n, func() map[string]any {
			return map[string]any{"student_id": fx.student}
		})
	}
}

func recordListings() []recordListing {
	return []recordListing{
		{
			name:        "enrollments",
			list:        func(s *Server) http.HandlerFunc { return s.listEnrollments },
			path:        "/api/v1/enrollments",
			table:       "student_enrollments",
			scope:       `"student_enrollments"."student_id" IN (`,
			filter:      "status=active",
			filterValue: "active",
			seed: func(fx *recordsFixture, n int) {
				section := uuid.New()
				fx.driver.tables["sections"] = []map[string]any{{"id": section}}
				seedRows(fx, "student_enrollments", n, func() map[string]any {
					return map[string]any{"student_id": fx.student, "section_id": section}
				})
			},
		},
		{
			name:        "subject enrollments",
			list:        func(s *Server) http.HandlerFunc { return s.listSubjectEnrollments },
			path:        "/api/v1/subject-enrollments",
			table:       "student_subject_enrollments",
			scope:       `"student_subject_enrollments"."student_id" IN (`,
			filter:      "status=active",
			filterValue: "active",
			seed: func(fx *recordsFixture, n int) {
				offering := uuid.New()
				fx.driver.tables["subject_offerings"] = []map[string]any{{"id": offering}}
				seedRows(fx, "student_subject_enrollments", n, func() map[string]any {
					return map[string]any{"student_id": fx.student, "subject_offering_id": offering}
				})
			},
		},
		{
			name:  "addresses",
			list:  func(s *Server) http.HandlerFunc { return s.listAddresses },
			path:  "/api/v1/student-addresses",
			table: "student_addresses",
			scope: `EXISTS (SELECT "students"."id" FROM "students" WHERE ` +
				`"student_addresses"."student_id" = "students"."id" AND "students"."id" IN (`,
			filter:      "address_type=home",
			filterValue: "home",
			seed:        seedStudentRows("student_addresses"),
		},
		{
			name:  "documents",
			list:  func(s *Server) http.HandlerFunc { return s.listDocuments },
			path:  "/api/v1/student-documents",
			table: "student_documents",
			scope: `EXISTS (SELECT "students"."id" FROM "students" WHERE ` +
				`"student_documents"."student_id" = "students"."id" AND "students"."id" IN (`,
			filter:      "verification_status=verified",
			filterValue: "verified",
			seed:        seedStudentRows("student_documents"),
		},
		{
			name:        "notes",
			list:        func(s *Server) http.HandlerFunc { return s.listNotes },
			path:        "/api/v1/student-notes",
			table:       "student_notes",
			scope:       `"student_notes"."author_person_id" = `,
			filter:      "category=conduct",
			filterValue: "conduct",
			seed:        seedStudentRows("student_notes"),
		},
	}
}

func envelopePage(t *testing.T, w *httptest.ResponseRecorder) (int, page) {
	t.Helper()

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	var out struct {
		Count int  `json:"count"`
		Page  page `json:"page"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("response is not JSON: %v (%q)", err, w.Body.String())
	}
	return out.Count, out.Page
}

func TestRecordListingsReportTheWindowTheyRead(t *testing.T) {
	windows := []struct {
		name    string
		stored  int
		limit   int
		offset  int
		hasMore bool
	}{
		{"a full page may have more behind it", 3, 3, 6, true},
		{"a short page is the last one", 2, 3, 6, false},
		{"an empty page is the last one", 0, 3, 9, false},
	}

	for _, lc := range recordListings() {
		for _, tc := range windows {
			t.Run(lc.name+"/"+tc.name, func(t *testing.T) {
				fx := newRecordsFixture(t)
				lc.seed(fx, tc.stored)

				w := fx.call(lc.list(fx.server), "GET",
					fmt.Sprintf("%s?limit=%d&offset=%d", lc.path, tc.limit, tc.offset), "", uuid.Nil)

				count, got := envelopePage(t, w)
				if count != tc.stored {
					t.Fatalf("want %d rows counted, got %d", tc.stored, count)
				}
				if got.Limit != tc.limit || got.Offset != tc.offset {
					t.Fatalf("the page must repeat the window it was asked for, got %+v", got)
				}
				if got.HasMore != tc.hasMore {
					t.Fatalf("%d rows of a %d-row page: want has_more=%v, got %+v",
						tc.stored, tc.limit, tc.hasMore, got)
				}

				query := fx.read(lc.table).query
				if !strings.Contains(query, fmt.Sprintf("LIMIT %d", tc.limit)) ||
					!strings.Contains(query, fmt.Sprintf("OFFSET %d", tc.offset)) {
					t.Fatalf("the page the caller is told about must be the page that was read, got %q", query)
				}
			})
		}
	}
}

func TestRecordListingFiltersReachTheQuery(t *testing.T) {
	for _, lc := range recordListings() {
		t.Run(lc.name, func(t *testing.T) {
			fx := newRecordsFixture(t)

			fx.call(lc.list(fx.server), "GET", lc.path+"?"+lc.filter, "", uuid.Nil)

			if stmt := fx.read(lc.table); !stmt.carriesText(lc.filterValue) {
				t.Fatalf("%s never narrowed the read, got %q %v", lc.filter, stmt.query, stmt.args)
			}
		})
	}
}

func TestRecordListingFiltersRefuseWhatTheyDoNotUnderstand(t *testing.T) {
	for _, lc := range recordListings() {
		t.Run(lc.name, func(t *testing.T) {
			fx := newRecordsFixture(t)

			w := fx.call(lc.list(fx.server), "GET", lc.path+"?shelf=fiction", "", uuid.Nil)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("an unknown parameter must be refused, got %d: %s",
					w.Code, strings.TrimSpace(w.Body.String()))
			}
			if msg := libraryMessage(t, w); !strings.Contains(msg, "shelf") {
				t.Fatalf("the refusal must name the parameter, got %q", msg)
			}
			if stmts := fx.statements(lc.table); len(stmts) > 0 {
				t.Fatalf("a refused filter must not read %s, got %v", lc.table, stmts)
			}
		})
	}
}

func TestRecordListingsNeverWidenForAFilter(t *testing.T) {
	stranger := uuid.New()

	queries := []struct {
		name string
		raw  string
	}{
		{"no filter but its own", ""},
		{"another pupil's identifier", "student_id=" + stranger.String()},
		{"the widest window it will accept", "limit=200&offset=0&student_id=" + stranger.String()},
	}

	for _, lc := range recordListings() {
		for _, q := range queries {
			t.Run(lc.name+"/"+q.name, func(t *testing.T) {
				fx := newRecordsFixture(t)

				raw := lc.filter
				if q.raw != "" {
					raw = q.raw + "&" + lc.filter
				}

				w := fx.call(lc.list(fx.server), "GET", lc.path+"?"+raw, "", uuid.Nil)
				if w.Code != http.StatusOK {
					t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
				}

				stmt := fx.read(lc.table)
				if !strings.Contains(stmt.query, lc.scope) {
					t.Fatalf("the filter displaced the scope; %q is missing from %q", lc.scope, stmt.query)
				}
				if !stmt.carries(fx.student) {
					t.Fatalf("the read stopped being bound to the pupils the caller may see, got %v: %q",
						stmt.args, stmt.query)
				}
				if strings.Contains(raw, stranger.String()) && !stmt.carries(stranger) {
					t.Fatalf("the filter was dropped instead of ANDed onto the scope, got %v", stmt.args)
				}
			})
		}
	}
}

func TestNotesWithNothingVisibleStillReportItsPage(t *testing.T) {
	fx := newRecordsFixture(t)
	fx.driver.tables["persons"] = nil
	fx.driver.tables["students"] = nil

	w := fx.call(fx.server.listNotes, "GET", "/api/v1/student-notes?limit=7&offset=14", "", uuid.Nil)

	count, got := envelopePage(t, w)
	if count != 0 {
		t.Fatalf("a caller who may see no note must be told of none, got %d", count)
	}
	if got.Limit != 7 || got.Offset != 14 || got.HasMore {
		t.Fatalf("the empty answer must carry the same window as any other, got %+v", got)
	}
	if stmts := fx.statements("student_notes"); len(stmts) > 0 {
		t.Fatalf("nothing was visible, so nothing should have been read: %v", stmts)
	}
}
