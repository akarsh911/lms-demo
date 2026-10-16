package http

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
)

type narrowEverything struct{}

func (narrowEverything) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if strings.HasSuffix(string(entity), "_all") {
		return authorization.Decision{}, nil
	}
	return authorization.Decision{
		Allowed:  true,
		Reach:    authorization.ReachSelf,
		HasReach: true,
	}, nil
}

func (narrowEverything) Name() string { return "narrow on everything (scoped delete test)" }

func libraryNarrowedOnEverything() libraryOption {
	return func(fx *libraryFixture) { fx.server.guard = narrowEverything{} }
}

type scopedDeleteCase struct {
	name     string
	table    string
	collapse bool
	handler  func(*Server) http.HandlerFunc
}

func scopedDeleteCases() []scopedDeleteCase {
	return []scopedDeleteCase{
		{"student", "students", true, func(s *Server) http.HandlerFunc { return s.deleteStudent }},
		{"enrollment", "student_enrollments", true, func(s *Server) http.HandlerFunc { return s.deleteEnrollment }},
		{"subject enrollment", "student_subject_enrollments", true,
			func(s *Server) http.HandlerFunc { return s.deleteSubjectEnrollment }},
		{"teacher assignment", "teacher_assignments", true,
			func(s *Server) http.HandlerFunc { return s.deleteTeacherAssignment }},
		{"student assignment", "student_assignments", true,
			func(s *Server) http.HandlerFunc { return s.deleteStudentAssignment }},
		{"address", "student_addresses", true, func(s *Server) http.HandlerFunc { return s.deleteAddress }},
		{"document", "student_documents", true, func(s *Server) http.HandlerFunc { return s.deleteDocument }},
		{"note", "student_notes", false, func(s *Server) http.HandlerFunc { return s.deleteNote }},
		{"curriculum", "curricula", true, func(s *Server) http.HandlerFunc { return s.deleteCurriculum }},
		{"curriculum node", "curriculum_nodes", true,
			func(s *Server) http.HandlerFunc { return s.deleteCurriculumNode }},
		{"placement", "content_placements", true, func(s *Server) http.HandlerFunc { return s.deletePlacement }},
		{"library item", "content_items", false, func(s *Server) http.HandlerFunc { return s.deleteLibraryItem }},
		{"person", "persons", false, func(s *Server) http.HandlerFunc { return s.deletePerson }},
		{"staff", "staff", true, func(s *Server) http.HandlerFunc { return s.deleteStaff }},
		{"teacher", "teachers", true, func(s *Server) http.HandlerFunc { return s.deleteTeacher }},
		{"guardian", "guardians", true, func(s *Server) http.HandlerFunc { return s.deleteGuardian }},
	}
}

func TestEveryScopedDeleteCarriesItsScopeInTheDeleteItself(t *testing.T) {
	for _, tc := range scopedDeleteCases() {
		t.Run(tc.name, func(t *testing.T) {
			id := uuid.New()
			fx := newLibraryFixture(t, libraryNarrowedOnEverything())

			w := fx.call(tc.handler(fx.server), "DELETE", "/api/v1/"+tc.table+"/"+id.String(), "", id)

			if w.Code != http.StatusNotFound {
				t.Fatalf("a delete that matched no row must answer 404, got %d: %s",
					w.Code, strings.TrimSpace(w.Body.String()))
			}

			for _, stmt := range fx.statements(tc.table) {
				if stmt.kind == "query" && stmt.carries(id) {
					t.Fatalf("the delete asked %s about this row before deleting it, so the row "+
						"can leave scope between the check and the delete: %q", tc.table, stmt.query)
				}
			}

			writes := fx.writes(tc.table)
			if len(writes) != 1 {
				t.Fatalf("want exactly one statement on %s, got %d: %v", tc.table, len(writes), writes)
			}
			stmt := writes[0]
			if !strings.HasPrefix(stmt.query, `DELETE FROM "`+tc.table+`"`) {
				t.Fatalf("want a DELETE on %s, got %q", tc.table, stmt.query)
			}
			if !scopedBeyondID(stmt.query, tc.table) {
				t.Fatalf("the delete narrows by id alone, so a row that left the caller's scope "+
					"is still removed: %q", stmt.query)
			}
			if refusal := scopeRefusesEverything(stmt.query); refusal != tc.collapse {
				t.Fatalf("the case is recorded as collapse=%t but the scope %s admits nothing: %q",
					tc.collapse, map[bool]string{true: "now", false: "no longer"}[refusal], stmt.query)
			}
		})
	}
}

func TestDeleteAssetCarriesItsScopeInTheUpdateThatDeletesIt(t *testing.T) {
	stored := uuid.New()
	fx := newLibraryFixture(t, libraryNarrowed())
	fx.holds(stored, entasset.StatusReady)

	w := fx.deleteAsset(stored)

	if w.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	writes := fx.writes("assets")
	if len(writes) != 1 {
		t.Fatalf("want exactly one write to assets, got %d: %v", len(writes), writes)
	}
	stmt := writes[0]
	if !strings.HasPrefix(stmt.query, `UPDATE "assets"`) {
		t.Fatalf("want an UPDATE on assets, got %q", stmt.query)
	}
	if !libraryOwnershipDemanded(stmt, fx.person) {
		t.Fatalf("the update that deletes must carry the same ownership rule as the read that "+
			"admitted it, got %q %v", stmt.query, stmt.args)
	}
}

func TestAnUnrestrictedCallerStillReachesEveryScopedDelete(t *testing.T) {
	for _, tc := range scopedDeleteCases() {
		t.Run(tc.name, func(t *testing.T) {
			id := uuid.New()
			fx := newLibraryFixture(t)
			fx.driver.tables[tc.table] = []map[string]any{{"id": id}}

			w := fx.call(tc.handler(fx.server), "DELETE", "/api/v1/"+tc.table+"/"+id.String(), "", id)

			if w.Code != http.StatusNoContent {
				t.Fatalf("a caller the guard does not narrow must still delete; a scope that admits "+
					"nothing looks exactly like this. want 204, got %d: %s",
					w.Code, strings.TrimSpace(w.Body.String()))
			}
			stmt := fx.onlyWrite(tc.table)
			if len(stmt.args) != 1 {
				t.Fatalf("an unrestricted caller is narrowed by nothing but the id, so the delete "+
					"binds one argument; got %d in %q %v", len(stmt.args), stmt.query, stmt.args)
			}
		})
	}
}
