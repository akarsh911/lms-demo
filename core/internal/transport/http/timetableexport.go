package http

import (
	"errors"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const maxExportSections = 200

const timetableExportEmpty = "no timetable here is readable"

type timetableExportQuery struct {
	BranchID   uuid.UUID
	Mode       timetablesvc.ExportMode
	On         time.Time
	From       time.Time
	To         time.Time
	Statuses   []enttimetable.Status
	SectionIDs []uuid.UUID
}

func parseTimetableExportQuery(values url.Values, today time.Time) (timetableExportQuery, error) {
	p := filter.New(values)

	var failed error
	q := timetableExportQuery{Mode: timetablesvc.ExportPattern}

	if raw := p.String("mode"); raw != "" {
		mode := timetablesvc.ExportMode(raw)
		if !mode.Known() {
			return timetableExportQuery{},
				&filter.Error{Param: "mode", Reason: "must be pattern or range"}
		}
		q.Mode = mode
	}

	if branch := p.UUID("branch_id"); branch != nil {
		q.BranchID = *branch
	}

	on := timetableQueryDate(p, "on", &failed)
	from := timetableQueryDate(p, "from", &failed)
	to := timetableQueryDate(p, "to", &failed)

	switch q.Mode {
	case timetablesvc.ExportRange:
		switch {
		case on != nil:
			return timetableExportQuery{}, &filter.Error{
				Param:  "on",
				Reason: "names the day a pattern is read on and cannot be combined with mode=range",
			}
		case from != nil && to != nil:
			q.From, q.To = *from, *to
		case failed == nil:
			return timetableExportQuery{},
				&filter.Error{Param: "from", Reason: "and to are required when mode is range"}
		}
	default:
		if from != nil || to != nil {
			return timetableExportQuery{}, &filter.Error{
				Param:  "from",
				Reason: "and to describe a range of dates and need mode=range",
			}
		}
		q.On = today
		if on != nil {
			q.On = *on
		}
	}

	if raw := p.Enum("status", func(v string) error {
		return enttimetable.StatusValidator(enttimetable.Status(v))
	}); raw != nil {
		q.Statuses = []enttimetable.Status{enttimetable.Status(*raw)}
	}

	sections, err := exportSectionList(p.String("section_id"))
	if err != nil {
		return timetableExportQuery{}, err
	}
	q.SectionIDs = sections

	if err := p.Err(); err != nil {
		return timetableExportQuery{}, err
	}
	if failed != nil {
		return timetableExportQuery{}, failed
	}
	if q.BranchID == uuid.Nil {
		return timetableExportQuery{}, &filter.Error{Param: "branch_id", Reason: "is required"}
	}
	return q, nil
}

func exportSectionList(raw string) ([]uuid.UUID, error) {
	if raw == "" {
		return nil, nil
	}

	parts := strings.Split(raw, ",")
	if len(parts) > maxExportSections {
		return nil, &filter.Error{Param: "section_id", Reason: "names too many classes"}
	}

	out := make([]uuid.UUID, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		id, err := uuid.Parse(trimmed)
		if err != nil {
			return nil, &filter.Error{
				Param:  "section_id",
				Reason: "must be a UUID, or a comma-separated list of them",
			}
		}
		out = append(out, id)
	}
	return out, nil
}

func (s *Server) exportTimetableWorkbook(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	service, err := timetablesvc.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q, err := parseTimetableExportQuery(r.URL.Query(), timetablesvc.Day(nowUTC()))
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	export, err := service.Export(ctx, timetablesvc.ExportQuery{
		BranchID:   q.BranchID,
		Mode:       q.Mode,
		On:         q.On,
		From:       q.From,
		To:         q.To,
		Statuses:   q.Statuses,
		SectionIDs: q.SectionIDs,
		Slots:      []predicate.TimetableSlot{access.TimetableSlotsFor(viewer, decision)},
		Deviations: []predicate.TimetableDeviation{access.TimetableDeviationsFor(viewer, decision)},
		Show: timetablesvc.ExportVisibility{
			Subject: decision.Fields.Permits("subject_offering_id"),
			Teacher: decision.Fields.Permits("teacher_id"),
			Room:    decision.Fields.Permits("room_id"),
		},
	})
	if err != nil {
		writeTimetableExportErr(w, err)
		return
	}

	book, err := export.Workbook()
	if err != nil {
		writeTimetableExportErr(w, err)
		return
	}

	traceProjection(r, decision.Fields, len(export.Sheets))
	holdOpenForDownload(w)

	head := w.Header()
	head.Set("Content-Type", timetablesvc.WorkbookMediaType)
	head.Set("Content-Disposition", workbookDisposition(q))
	head.Set("Content-Length", strconv.Itoa(book.Len()))
	head.Set("Cache-Control", "private, no-store")
	head.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)

	if _, err := w.Write(book.Bytes()); err != nil {
		return
	}
}

func workbookDisposition(q timetableExportQuery) string {
	name := "timetable-" + string(q.Mode) + "-"
	if q.Mode == timetablesvc.ExportRange {
		name += q.From.Format(dateLayout) + "-to-" + q.To.Format(dateLayout)
	} else {
		name += q.On.Format(dateLayout)
	}
	name += ".xlsx"

	formatted := mime.FormatMediaType("attachment", map[string]string{"filename": name})
	if formatted == "" {
		return "attachment"
	}
	return formatted
}

func writeTimetableExportErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, timetablesvc.ErrExportEmpty):
		response.Error(w, http.StatusNotFound, timetableExportEmpty)
	case errors.Is(err, timetablesvc.ErrExportModeUnknown),
		errors.Is(err, timetablesvc.ErrExportRangeTooWide):
		response.Error(w, http.StatusBadRequest, err.Error())
	default:
		writeTimetableServiceErr(w, err, timetableNotFound)
	}
}
