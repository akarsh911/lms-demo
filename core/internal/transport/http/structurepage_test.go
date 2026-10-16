package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type structureWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	branchID    uuid.UUID
	sectionID   uuid.UUID
	sectionIDs  []uuid.UUID
	offeringIDs []uuid.UUID
}

func newStructureWorld(t *testing.T) *structureWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	branch := client.Branch.Create().
		SetName("Page Branch " + tag).
		SetCode("PBR-" + tag).
		SaveX(ctx)

	today := time.Now().UTC()
	session := client.AcademicSession.Create().
		SetName("Page Session " + tag).
		SetCode("PSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("Page Grade " + tag).
		SetCode("PGR-" + tag).
		SetSequence(1).
		SaveX(ctx)

	client.SchoolHouse.Create().SetName("Page House " + tag).SaveX(ctx)
	client.SubjectGroup.Create().SetName("Page Group " + tag).SaveX(ctx)

	sections := make([]uuid.UUID, 0, 3)
	for _, name := range []string{"A", "B", "C"} {
		row := client.Section.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetGradeLevelID(grade.ID).
			SetName(name).
			SetCode("PSC-" + tag + "-" + name).
			SaveX(ctx)
		sections = append(sections, row.ID)
	}

	offerings := make([]uuid.UUID, 0, 3)
	for _, name := range []string{"Maths", "Physics", "History"} {
		subject := client.Subject.Create().
			SetName("Page " + name + " " + tag).
			SetCode("PSU-" + tag + "-" + name[:3]).
			SaveX(ctx)
		row := client.SubjectOffering.Create().
			SetAcademicSessionID(session.ID).
			SetSectionID(sections[0]).
			SetSubjectID(subject.ID).
			SaveX(ctx)
		offerings = append(offerings, row.ID)
	}

	world := &structureWorld{
		t:           t,
		db:          db,
		server:      &Server{},
		branchID:    branch.ID,
		sectionID:   sections[0],
		sectionIDs:  sections,
		offeringIDs: offerings,
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: uuid.New()})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	db.Forget()
	return world
}

type listed struct {
	count int
	page  page
	ids   []uuid.UUID
}

func (w *structureWorld) list(handler http.HandlerFunc, key, query string) listed {
	w.t.Helper()

	rec := httptest.NewRecorder()
	target := "/api/v1/" + strings.ReplaceAll(key, "_", "-")
	if query != "" {
		target += "?" + query
	}
	handler(rec, httptest.NewRequest(http.MethodGet, target, nil).WithContext(w.ctx))

	if rec.Code != http.StatusOK {
		w.t.Fatalf("%s?%s: want 200, got %d: %s", key, query, rec.Code,
			strings.TrimSpace(rec.Body.String()))
	}

	var body map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("%s?%s: decoding the envelope: %v", key, query, err)
	}

	raw, ok := body["page"]
	if !ok {
		w.t.Fatalf("%s?%s: the envelope carries no page object: %s", key, query,
			strings.TrimSpace(rec.Body.String()))
	}

	out := listed{}
	if err := json.Unmarshal(raw, &out.page); err != nil {
		w.t.Fatalf("%s?%s: decoding page: %v", key, query, err)
	}
	if err := json.Unmarshal(body["count"], &out.count); err != nil {
		w.t.Fatalf("%s?%s: decoding count: %v", key, query, err)
	}

	var rows []struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(body[key], &rows); err != nil {
		w.t.Fatalf("%s?%s: decoding rows: %v", key, query, err)
	}
	for _, row := range rows {
		out.ids = append(out.ids, row.ID)
	}
	if len(out.ids) != out.count {
		w.t.Fatalf("%s?%s: count says %d rows, the body carries %d",
			key, query, out.count, len(out.ids))
	}
	return out
}

func (w *structureWorld) listings() map[string]http.HandlerFunc {
	return map[string]http.HandlerFunc{
		"academic_sessions": w.server.listSessions,
		"branches":          w.server.listBranches,
		"grade_levels":      w.server.listGradeLevels,
		"school_houses":     w.server.listHouses,
		"subjects":          w.server.listSubjects,
		"subject_groups":    w.server.listSubjectGroups,
		"sections":          w.server.listSections,
		"subject_offerings": w.server.listOfferings,
	}
}

func TestStructureListingsReportTheWindowTheyApplied(t *testing.T) {
	w := newStructureWorld(t)

	for key, handler := range w.listings() {
		full := w.list(handler, key, "limit=1")
		if full.page.Limit != 1 || full.page.Offset != 0 {
			t.Fatalf("%s: page must echo the window applied, got %+v", key, full.page)
		}
		if full.count != 1 {
			t.Fatalf("%s: limit=1 must return one row, got %d", key, full.count)
		}
		if !full.page.HasMore {
			t.Fatalf("%s: a page that came back full must report has_more, got %+v", key, full.page)
		}

		past := w.list(handler, key, "limit=1&offset=100000")
		if past.page.Limit != 1 || past.page.Offset != 100000 {
			t.Fatalf("%s: page must echo the window applied, got %+v", key, past.page)
		}
		if past.count != 0 {
			t.Fatalf("%s: an offset past the end must return nothing, got %d", key, past.count)
		}
		if past.page.HasMore {
			t.Fatalf("%s: a short page must not report has_more, got %+v", key, past.page)
		}
	}
}

func TestSectionListingPagesThroughTheRealWindow(t *testing.T) {
	w := newStructureWorld(t)
	scope := "branch_id=" + w.branchID.String()

	first := w.list(w.server.listSections, "sections", scope+"&limit=2")
	if first.count != 2 || !first.page.HasMore {
		t.Fatalf("the first of three rows in a window of two must be full and say so, got %+v", first)
	}

	second := w.list(w.server.listSections, "sections", scope+"&limit=2&offset=2")
	if second.count != 1 || second.page.HasMore {
		t.Fatalf("the last row of three must come back short and say so, got %+v", second)
	}
	if second.page.Offset != 2 {
		t.Fatalf("page must echo the offset applied, got %+v", second.page)
	}

	seen := map[uuid.UUID]bool{}
	for _, id := range append(append([]uuid.UUID{}, first.ids...), second.ids...) {
		if seen[id] {
			t.Fatalf("%s was returned by two consecutive windows", id)
		}
		seen[id] = true
	}
	for _, id := range w.sectionIDs {
		if !seen[id] {
			t.Fatalf("paging the whole window lost section %s", id)
		}
	}
}

func TestOfferingListingPagesThroughTheRealWindow(t *testing.T) {
	w := newStructureWorld(t)
	scope := "section_id=" + w.sectionID.String()

	first := w.list(w.server.listOfferings, "subject_offerings", scope+"&limit=2")
	if first.count != 2 || !first.page.HasMore {
		t.Fatalf("the first of three rows in a window of two must be full and say so, got %+v", first)
	}

	second := w.list(w.server.listOfferings, "subject_offerings", scope+"&limit=2&offset=2")
	if second.count != 1 || second.page.HasMore {
		t.Fatalf("the last row of three must come back short and say so, got %+v", second)
	}

	seen := map[uuid.UUID]bool{}
	for _, id := range append(append([]uuid.UUID{}, first.ids...), second.ids...) {
		seen[id] = true
	}
	for _, id := range w.offeringIDs {
		if !seen[id] {
			t.Fatalf("paging the whole window lost offering %s", id)
		}
	}
}

func TestStructureFiltersNarrowAndOnlyNarrow(t *testing.T) {
	w := newStructureWorld(t)

	wide := w.list(w.server.listSections, "sections", "limit=200")
	narrow := w.list(w.server.listSections, "sections",
		"branch_id="+w.branchID.String()+"&limit=200")

	if narrow.count > wide.count {
		t.Fatalf("a filter returned more than the unfiltered listing: %d filtered, %d unfiltered",
			narrow.count, wide.count)
	}
	if narrow.count != len(w.sectionIDs) {
		t.Fatalf("the branch filter must return exactly its own rows, got %d want %d",
			narrow.count, len(w.sectionIDs))
	}

	inWide := map[uuid.UUID]bool{}
	for _, id := range wide.ids {
		inWide[id] = true
	}
	for _, id := range narrow.ids {
		if !inWide[id] {
			t.Fatalf("the filter surfaced %s, which the unfiltered listing did not return", id)
		}
	}

	stranger := w.list(w.server.listSections, "sections",
		"branch_id="+uuid.New().String()+"&limit=200")
	if stranger.count != 0 {
		t.Fatalf("a branch nothing belongs to must return nothing, got %d rows", stranger.count)
	}
}

func TestUnrecognisedStructureFilterIsRefused(t *testing.T) {
	w := newStructureWorld(t)

	for _, query := range []string{"branchid=" + w.branchID.String(), "sectionid=x", "activ=true"} {
		rec := httptest.NewRecorder()
		w.server.listSections(rec,
			httptest.NewRequest(http.MethodGet, "/api/v1/sections?"+query, nil).WithContext(w.ctx))

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%q must be refused with 400, got %d: %s",
				query, rec.Code, strings.TrimSpace(rec.Body.String()))
		}
		name := strings.SplitN(query, "=", 2)[0]
		if !strings.Contains(rec.Body.String(), name) {
			t.Fatalf("%q: the refusal must name the parameter, got %s",
				query, strings.TrimSpace(rec.Body.String()))
		}
	}
}
