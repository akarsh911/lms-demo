package http

import (
	"bytes"
	"log/slog"
	"mime"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	mw "github.com/Harbour-Emerge/emerge-core/internal/transport/http/middleware"
)

func (w *timetableWorld) exportWorkbook(query string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.server.exportTimetableWorkbook, "GET",
		"/api/v1/timetable-export.xlsx?"+query, "", uuid.Nil)
}

func refusalOf(rec *httptest.ResponseRecorder) string {
	body := strings.TrimSpace(rec.Body.String())
	if strings.HasPrefix(body, "PK") {
		return "a workbook of " + strconv.Itoa(rec.Body.Len()) + " bytes"
	}
	if len(body) > 200 {
		return body[:200]
	}
	return body
}

func openExported(t *testing.T, rec *httptest.ResponseRecorder) *excelize.File {
	t.Helper()

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, refusalOf(rec))
	}
	if got := rec.Header().Get("Content-Type"); got != timetablesvc.WorkbookMediaType {
		t.Fatalf("Content-Type = %q, want the xlsx media type", got)
	}

	file, err := excelize.OpenReader(bytes.NewReader(rec.Body.Bytes()))
	if err != nil {
		t.Fatalf("the response body is not an openable xlsx workbook: %v", err)
	}
	t.Cleanup(func() { _ = file.Close() })
	return file
}

func TestExportedWorkbookHoldsOnlyTheClassesTheViewerMayRead(t *testing.T) {
	w := newTimetableWorld(t)

	file := openExported(t, w.exportWorkbook(
		"branch_id="+w.branchID.String()+"&on="+w.monday.Format(dateLayout)))

	sheets := file.GetSheetList()
	if len(sheets) != 1 {
		t.Fatalf("the viewer teaches one section, so want one sheet, got %v", sheets)
	}
	if !strings.HasSuffix(sheets[0], " A") {
		t.Fatalf("the only sheet is %q, want the taught section A", sheets[0])
	}

	rows, err := file.GetRows(sheets[0])
	if err != nil {
		t.Fatalf("the sheet could not be read back: %v", err)
	}
	flat := ""
	for _, row := range rows {
		flat += strings.Join(row, "|") + "\n"
	}
	if !strings.Contains(flat, "Physics") {
		t.Fatalf("the sheet never names the taught subject:\n%s", flat)
	}
	if strings.Contains(flat, "Other Teacher") {
		t.Fatalf("the sheet names a teacher of a section the viewer may not read:\n%s", flat)
	}
}

func TestExportOfAnUnreachableClassIsNotFoundRatherThanForbidden(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.exportWorkbook("branch_id=" + w.branchID.String() +
		"&on=" + w.monday.Format(dateLayout) +
		"&section_id=" + w.otherSectionID.String())

	if rec.Code == http.StatusForbidden {
		t.Fatalf("an unreachable class must never be answered with 403: %s",
			refusalOf(rec))
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 for a class the viewer cannot reach, got %d: %s",
			rec.Code, refusalOf(rec))
	}
}

func TestExportOffersTheWorkbookAsANamedDownload(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.exportWorkbook(
		"branch_id=" + w.branchID.String() + "&on=" + w.monday.Format(dateLayout))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, refusalOf(rec))
	}

	header := rec.Header().Get("Content-Disposition")
	kind, params, err := mime.ParseMediaType(header)
	if err != nil {
		t.Fatalf("Content-Disposition %q does not parse: %v", header, err)
	}
	if kind != "attachment" {
		t.Fatalf("Content-Disposition is %q, want an attachment", kind)
	}
	if !strings.HasSuffix(params["filename"], ".xlsx") {
		t.Fatalf("the download is named %q, which no spreadsheet will open by double click",
			params["filename"])
	}
	if got := rec.Header().Get("Content-Length"); got != strconv.Itoa(rec.Body.Len()) {
		t.Fatalf("Content-Length is %q but %d bytes were written", got, rec.Body.Len())
	}
}

func TestExportRangeModeResolvesAgainstTheCalendar(t *testing.T) {
	w := newTimetableWorld(t)

	file := openExported(t, w.exportWorkbook(
		"branch_id="+w.branchID.String()+
			"&mode=range"+
			"&from="+w.monday.Format(dateLayout)+
			"&to="+w.friday.Format(dateLayout)))

	sheets := file.GetSheetList()
	if len(sheets) != 1 {
		t.Fatalf("want one sheet for the taught section, got %v", sheets)
	}

	rows, err := file.GetRows(sheets[0])
	if err != nil {
		t.Fatalf("the sheet could not be read back: %v", err)
	}
	if len(rows) < 5 {
		t.Fatalf("the sheet carries no header: %v", rows)
	}
	header := strings.Join(rows[4], "|")
	if !strings.Contains(header, "Mon 06 Apr") || !strings.Contains(header, "Fri 10 Apr") {
		t.Fatalf("a range export must head its columns with dates, got %q", header)
	}
}

func TestExportRefusesARangeWithoutDates(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.exportWorkbook("branch_id=" + w.branchID.String() + "&mode=range")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 when a range names no dates, got %d: %s",
			rec.Code, refusalOf(rec))
	}
}

func TestExportRefusesADateRangeOnAPatternRead(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.exportWorkbook("branch_id=" + w.branchID.String() +
		"&from=" + w.monday.Format(dateLayout) +
		"&to=" + w.friday.Format(dateLayout))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 when from and to are sent without mode=range, got %d: %s",
			rec.Code, refusalOf(rec))
	}
}

func TestExportRefusesAMissingBranch(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.exportWorkbook("on=" + w.monday.Format(dateLayout))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 without a branch, got %d: %s",
			rec.Code, refusalOf(rec))
	}
}

func TestTimetableExportIsMountedAndGuardedByTimetableRead(t *testing.T) {
	if found := mountedPatterns(t); !found["GET /api/v1/timetable-export.xlsx"] {
		t.Fatal("GET /api/v1/timetable-export.xlsx is not mounted on the real router, " +
			"so the handler is unreachable however well it is tested")
	}

	guard := &recordingGuard{}
	server := quietServer(guard)

	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) {
		r.Use(mw.DevSubject(slog.Default()))
		server.mountTimetable(r)
	})

	tc := routeCase{"GET", "/api/v1/timetable-export.xlsx", "/api/v1/timetable-export.xlsx",
		authorization.TimetableRead, false}

	rec := send(router, tc.method, tc.path, "")
	if why := routerRefused(rec); why != "" {
		t.Fatalf("%s %s: %s (status %d)", tc.method, tc.path, why, rec.Code)
	}
	checkProbe(t, tc, guard.taken(), rec)
}
