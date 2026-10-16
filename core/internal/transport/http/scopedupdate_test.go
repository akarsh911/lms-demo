package http

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entcurriculum "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculum"
)

type scopedUpdateCase struct {
	name     string
	table    string
	method   string
	body     string
	collapse bool
	seed     func(*libraryFixture, uuid.UUID)
	handler  func(*Server) http.HandlerFunc
}

func rowOf(id uuid.UUID) []map[string]any { return []map[string]any{{"id": id}} }

func seeds(table string) func(*libraryFixture, uuid.UUID) {
	return func(fx *libraryFixture, id uuid.UUID) { fx.driver.tables[table] = rowOf(id) }
}

func scopedUpdateCases() []scopedUpdateCase {
	return []scopedUpdateCase{
		{"student", "students", "PATCH", "{}", false, seeds("students"),
			func(s *Server) http.HandlerFunc { return s.updateStudent }},
		{"person", "persons", "PATCH", "{}", false, func(*libraryFixture, uuid.UUID) {},
			func(s *Server) http.HandlerFunc { return s.updatePerson }},
		{"staff", "staff", "PATCH", "{}", false, seeds("staff"),
			func(s *Server) http.HandlerFunc { return s.updateStaff }},
		{"teacher", "teachers", "PATCH", "{}", true, seeds("teachers"),
			func(s *Server) http.HandlerFunc { return s.updateTeacher }},
		{"guardian", "guardians", "PATCH", "{}", false, seeds("guardians"),
			func(s *Server) http.HandlerFunc { return s.updateGuardian }},
		{"enrollment", "student_enrollments", "PATCH", "{}", true, seeds("student_enrollments"),
			func(s *Server) http.HandlerFunc { return s.updateEnrollment }},
		{"subject enrollment", "student_subject_enrollments", "PATCH", "{}", true,
			seeds("student_subject_enrollments"),
			func(s *Server) http.HandlerFunc { return s.updateSubjectEnrollment }},
		{"teacher assignment", "teacher_assignments", "PATCH", "{}", true, seeds("teacher_assignments"),
			func(s *Server) http.HandlerFunc { return s.updateTeacherAssignment }},
		{"student assignment", "student_assignments", "PATCH", "{}", true, seeds("student_assignments"),
			func(s *Server) http.HandlerFunc { return s.updateStudentAssignment }},
		{"note", "student_notes", "PATCH", "{}", false, func(fx *libraryFixture, id uuid.UUID) {
			fx.driver.tables["student_notes"] = []map[string]any{
				{"id": id, "author_person_id": fx.person},
			}
		},
			func(s *Server) http.HandlerFunc { return s.updateNote }},
		{"document", "student_documents", "PATCH", `{"verification_status":"verified"}`, true,
			seeds("student_documents"),
			func(s *Server) http.HandlerFunc { return s.verifyDocument }},
		{"curriculum", "curricula", "PATCH", "{}", true, func(fx *libraryFixture, id uuid.UUID) {
			fx.driver.tables["curricula"] = []map[string]any{
				curriculumRow(id, uuid.New(), uuid.New(), uuid.New(), entcurriculum.StatusDraft),
			}
		},
			func(s *Server) http.HandlerFunc { return s.updateCurriculum }},
		{"curriculum node", "curriculum_nodes", "PATCH", "{}", true, func(fx *libraryFixture, id uuid.UUID) {
			fx.driver.tables["curriculum_nodes"] = []map[string]any{
				curriculumNodeRow(id, uuid.New(), nil),
			}
		},
			func(s *Server) http.HandlerFunc { return s.updateCurriculumNode }},
		{"placement", "content_placements", "PATCH", "{}", true, func(fx *libraryFixture, id uuid.UUID) {
			fx.driver.tables["content_placements"] = []map[string]any{
				placementRow(id, uuid.New(), uuid.New()),
			}
		},
			func(s *Server) http.HandlerFunc { return s.updatePlacement }},
		{"library item", "content_items", "PATCH", "{}", false, func(fx *libraryFixture, id uuid.UUID) {
			row := libraryGradeItem(id, fx.person, uuid.New())
			row["audience"] = string(entcontentitem.AudienceOwner)
			delete(row, "grade_level_id")
			fx.driver.tables["content_items"] = []map[string]any{row}
		},
			func(s *Server) http.HandlerFunc { return s.updateLibraryItem }},
		{"asset", "assets", "POST", "", false, func(fx *libraryFixture, id uuid.UUID) {
			fx.holds(id, entasset.StatusPending)
		}, func(s *Server) http.HandlerFunc { return s.markAssetReady }},
	}
}

func TestEveryScopedUpdateCarriesItsScopeInTheUpdateItself(t *testing.T) {
	for _, tc := range scopedUpdateCases() {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t, libraryNarrowedOnEverything())
			id := fx.person
			if tc.table != "persons" {
				id = uuid.New()
			}
			tc.seed(fx, id)

			w := fx.call(tc.handler(fx.server), tc.method,
				"/api/v1/"+tc.table+"/"+id.String(), tc.body, id)

			writes := fx.writes(tc.table)
			if len(writes) != 1 {
				t.Fatalf("want exactly one statement on %s, got %d: %v", tc.table, len(writes), writes)
			}
			stmt := writes[0]
			if !strings.HasPrefix(stmt.query, `UPDATE "`+tc.table+`"`) {
				t.Fatalf("want an UPDATE on %s, got %q", tc.table, stmt.query)
			}
			if !narrowedBeyondTheID(stmt.query, tc.table) {
				t.Fatalf("the update narrows by id alone, so a row that left the caller's scope "+
					"between the check and the write is still written: %q", stmt.query)
			}

			if refusal := scopeRefusesEverything(stmt.query); refusal != tc.collapse {
				t.Fatalf("the case is recorded as collapse=%t but the scope %s admits nothing: %q",
					tc.collapse, map[bool]string{true: "now", false: "no longer"}[refusal], stmt.query)
			}
			if want := scopedUpdateStatus(tc.collapse, stmt.query); w.Code != want {
				t.Fatalf("want %d, got %d: %s", want, w.Code, strings.TrimSpace(w.Body.String()))
			}
		})
	}
}

func scopeRefusesEverything(query string) bool {
	return strings.Contains(libraryWhereOf(query), "FALSE")
}

func scopedUpdateStatus(collapse bool, query string) int {
	if collapse && !strings.Contains(query, "EXISTS (") {
		return http.StatusNotFound
	}
	return http.StatusOK
}

func narrowedBeyondTheID(query, table string) bool {
	where := libraryWhereOf(query)
	head := `"` + table + `"."id" = $`
	if !strings.HasPrefix(where, head) {
		return false
	}
	rest := where[len(head):]
	digits := 0
	for digits < len(rest) && rest[digits] >= '0' && rest[digits] <= '9' {
		digits++
	}
	if digits == 0 {
		return false
	}
	return strings.TrimSpace(rest[digits:]) != ""
}

func TestAnUnrestrictedCallerStillReachesEveryScopedUpdate(t *testing.T) {
	for _, tc := range scopedUpdateCases() {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			id := fx.person
			if tc.table != "persons" {
				id = uuid.New()
			}
			tc.seed(fx, id)

			w := fx.call(tc.handler(fx.server), tc.method,
				"/api/v1/"+tc.table+"/"+id.String(), tc.body, id)

			if w.Code != http.StatusOK {
				t.Fatalf("a caller the guard does not narrow must still write; a scope that admits "+
					"nothing looks exactly like this. want 200, got %d: %s",
					w.Code, strings.TrimSpace(w.Body.String()))
			}
			stmt := fx.onlyWrite(tc.table)
			if !strings.HasPrefix(stmt.query, `UPDATE "`+tc.table+`"`) {
				t.Fatalf("want an UPDATE on %s, got %q", tc.table, stmt.query)
			}
			if !stmt.carries(id) {
				t.Fatalf("the update must still bind the row's id, got %q %v", stmt.query, stmt.args)
			}
		})
	}
}
