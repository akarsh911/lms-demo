package http

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbell "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellschedule"
	entbellperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellscheduleperiod"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entdayschedule "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendardayschedule"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entroom "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/room"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	timetableNameRunes  = 120
	timetableLabelRunes = 120
	timetableCodeRunes  = 32
	roomNameRunes       = 120
	roomTypeRunes       = 64
	roomBuildingRunes   = 120
	roomFloorRunes      = 32
	periodNameRunes     = 64
	calendarNameRunes   = 200

	minutesInDay      = 1440
	maxClashProposals = 100
)

const (
	timetableNotFound        = "timetable not found"
	timetableSlotNotFound    = "timetable slot not found"
	timetableDevNotFound     = "timetable deviation not found"
	timetableRoomNotFound    = "room not found"
	timetableSchemeNotFound  = "period scheme not found"
	timetablePeriodNotFound  = "period not found"
	timetableBellNotFound    = "bell schedule not found"
	timetableBellSpanMissing = "bell schedule period not found"
	timetableDayNotFound     = "calendar day not found"
	timetableDayScheduleGone = "calendar day schedule not found"
)

const TimetableClashCode = "timetable_clash"

const slotProposalRef = "proposed"

func (s *Server) mountTimetable(r chi.Router) {
	r.Route("/timetables", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/", s.listTimetables)
		r.With(s.can(authorization.TimetableWrite)).Post("/", s.createTimetable)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getTimetable)
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updateTimetable)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deleteTimetable)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/slots", s.listTimetableSlots)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/slots", s.createTimetableSlot)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/publish", s.publishTimetable)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/sections", s.listTimetableSections)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/sections", s.attachTimetableSections)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/clash-check", s.checkTimetableClashes)
		r.With(s.can(authorization.TimetableGenerate)).Post("/{id}/generate", s.generateTimetable)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/generate/{job}", s.getTimetableGeneration)
	})

	r.Route("/timetable-sections", func(r chi.Router) {
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.detachTimetableSection)
	})

	r.Route("/timetable-slots", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getTimetableSlot)
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updateTimetableSlot)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deleteTimetableSlot)
	})

	r.Route("/timetable-deviations", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/", s.listTimetableDeviations)
		r.With(s.can(authorization.TimetableWrite)).Post("/", s.createTimetableDeviation)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getTimetableDeviation)
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updateTimetableDeviation)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deleteTimetableDeviation)
	})

	r.With(s.can(authorization.TimetableRead)).
		Get("/timetable-occurrences", s.resolveTimetableOccurrences)

	r.With(s.can(authorization.TimetableRead)).
		Get("/timetable-export.xlsx", s.exportTimetableWorkbook)

	r.Route("/timetable-calendar", func(r chi.Router) {
		r.With(s.can(authorization.CalendarRead)).Get("/", s.listSessionDays)
		r.With(s.can(authorization.CalendarRead)).Get("/in-session", s.getInSession)
	})

	r.Route("/rooms", func(r chi.Router) {
		r.With(s.can(authorization.RoomsRead)).Get("/", s.listRooms)
		r.With(s.can(authorization.RoomsWrite)).Post("/", s.createRoom)
		r.With(s.can(authorization.RoomsRead)).Get("/{id}", s.getRoom)
		r.With(s.can(authorization.RoomsWrite)).Patch("/{id}", s.updateRoom)
		r.With(s.can(authorization.RoomsDelete)).Delete("/{id}", s.deleteRoom)
	})

	r.Route("/period-schemes", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/", s.listPeriodSchemes)
		r.With(s.can(authorization.TimetableWrite)).Post("/", s.createPeriodScheme)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getPeriodScheme)
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updatePeriodScheme)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deletePeriodScheme)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/periods", s.listPeriods)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/periods", s.createPeriod)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/bell-schedules", s.listBellSchedules)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/bell-schedules", s.createBellSchedule)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/grade-levels", s.listSchemeGradeLevels)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/grade-levels", s.attachSchemeGradeLevels)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/clone", s.clonePeriodScheme)
	})

	r.Route("/period-scheme-grade-levels", func(r chi.Router) {
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.detachSchemeGradeLevel)
	})

	r.Route("/periods", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getPeriod)
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updatePeriod)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deletePeriod)
	})

	r.Route("/bell-schedules", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getBellSchedule)
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updateBellSchedule)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deleteBellSchedule)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/periods", s.listBellSchedulePeriods)
		r.With(s.can(authorization.TimetableWrite)).Post("/{id}/periods", s.createBellSchedulePeriod)
	})

	r.Route("/bell-schedule-periods", func(r chi.Router) {
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updateBellSchedulePeriod)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.deleteBellSchedulePeriod)
	})

	r.Route("/calendar-days", func(r chi.Router) {
		r.With(s.can(authorization.CalendarRead)).Get("/", s.listCalendarDays)
		r.With(s.can(authorization.CalendarWrite)).Post("/", s.createCalendarDay)
		r.With(s.can(authorization.CalendarRead)).Get("/{id}", s.getCalendarDay)
		r.With(s.can(authorization.CalendarWrite)).Patch("/{id}", s.updateCalendarDay)
		r.With(s.can(authorization.CalendarDelete)).Delete("/{id}", s.deleteCalendarDay)
		r.With(s.can(authorization.CalendarRead)).Get("/{id}/schedules", s.listCalendarDaySchedules)
		r.With(s.can(authorization.CalendarWrite)).Post("/{id}/schedules", s.createCalendarDaySchedule)
		r.With(s.can(authorization.CalendarRead)).
			Get("/{id}/section-patterns", s.listCalendarDaySectionPatterns)
		r.With(s.can(authorization.CalendarWrite)).
			Post("/{id}/section-patterns", s.createCalendarDaySectionPattern)
	})

	r.Route("/calendar-day-schedules", func(r chi.Router) {
		r.With(s.can(authorization.CalendarWrite)).Patch("/{id}", s.updateCalendarDaySchedule)
		r.With(s.can(authorization.CalendarDelete)).Delete("/{id}", s.deleteCalendarDaySchedule)
	})

	r.Route("/calendar-day-section-patterns", func(r chi.Router) {
		r.With(s.can(authorization.CalendarWrite)).Patch("/{id}", s.updateCalendarDaySectionPattern)
		r.With(s.can(authorization.CalendarDelete)).Delete("/{id}", s.deleteCalendarDaySectionPattern)
	})
}

func timetableEnum[T ~string](w http.ResponseWriter, name, raw string, validate func(T) error) (T, bool) {
	value := T(raw)
	if err := validate(value); err != nil {
		var zero T
		response.Error(w, http.StatusBadRequest, name+" is not a recognised value: "+err.Error())
		return zero, false
	}
	return value, true
}

func timetableQueryDate(p *filter.Params, name string, failed *error) *time.Time {
	raw := p.String(name)
	if raw == "" {
		return nil
	}
	parsed, err := time.Parse(dateLayout, raw)
	if err != nil {
		if *failed == nil {
			*failed = &filter.Error{Param: name, Reason: "must be a date as " + dateLayout}
		}
		return nil
	}
	return &parsed
}

func timetableHalf(p *filter.Params, failed *error) timetablesvc.Half {
	half := timetablesvc.Half(p.String("half"))
	if !half.Known() && *failed == nil {
		*failed = &filter.Error{Param: "half", Reason: "must be forenoon or afternoon"}
	}
	return half
}

func rejectImmutable(w http.ResponseWriter, sent []string, subject string, names ...string) bool {
	for _, name := range names {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded when the "+subject+" is created and cannot be changed")
			return false
		}
	}
	return true
}

func rejectFromPath(w http.ResponseWriter, sent []string, name string) bool {
	if wasSent(sent, name) {
		response.Error(w, http.StatusUnprocessableEntity,
			name+" is taken from the path and must not be supplied")
		return false
	}
	return true
}

func writeTimetableServiceErr(w http.ResponseWriter, err error, notFound string) {
	switch {
	case errors.Is(err, timetablesvc.ErrNotFound):
		response.Error(w, http.StatusNotFound, notFound)
	case errors.Is(err, timetablesvc.ErrBranchRequired),
		errors.Is(err, timetablesvc.ErrRangeInverted),
		errors.Is(err, timetablesvc.ErrRangeTooWide),
		errors.Is(err, timetablesvc.ErrHalfUnknown),
		errors.Is(err, timetablesvc.ErrRuleUnknown),
		errors.Is(err, timetablesvc.ErrDayOfWeekInvalid),
		errors.Is(err, timetablesvc.ErrSectionRequired),
		errors.Is(err, timetablesvc.ErrPeriodRequired):
		response.Error(w, http.StatusBadRequest, err.Error())
	default:
		writeTenantEntErr(w, err, notFound)
	}
}

func timetableWriteUnfiltered(v *access.Viewer, d authorization.Decision) bool {
	if v == nil {
		return false
	}
	if v.Unrestricted {
		return true
	}
	return d.HasReach && d.Reach == authorization.ReachTenant && len(d.Constraints) == 0
}

func sectionWritableBy(ctx context.Context, client *tenantent.Client, section uuid.UUID,
	offering *uuid.UUID, v *access.Viewer, d authorization.Decision) (bool, error) {
	if timetableWriteUnfiltered(v, d) {
		return true, nil
	}

	reach := []predicate.TimetableSlot{entslot.SectionIDEQ(section)}
	if offering != nil {
		reach = append(reach, entslot.SubjectOfferingIDEQ(*offering))
	}
	return client.TimetableSlot.Query().
		Where(entslot.Or(reach...), access.TimetableSlotsWritableBy(v, d)).
		Exist(ctx)
}

func checkSectionWritable(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	section uuid.UUID, offering *uuid.UUID, v *access.Viewer, d authorization.Decision) bool {
	within, err := sectionWritableBy(ctx, client, section, offering, v, d)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !within {
		response.Error(w, http.StatusForbidden,
			"your grant of "+string(authorization.TimetableWrite)+
				" does not reach "+entslot.FieldSectionID+" "+section.String())
		return false
	}
	return true
}

func branchOfScheme(ctx context.Context, client *tenantent.Client, scheme uuid.UUID) (uuid.UUID, error) {
	row, err := client.PeriodScheme.Query().Where(entscheme.ID(scheme)).Only(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	return row.BranchID, nil
}

type timetablePayload struct {
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	PeriodSchemeID    *uuid.UUID `json:"period_scheme_id"`
	Name              *string    `json:"name"`
	Version           *int       `json:"version"`
	EffectiveFrom     *string    `json:"effective_from"`
	EffectiveTo       *string    `json:"effective_to"`
	Status            *string    `json:"status"`
	SupersedesID      *uuid.UUID `json:"supersedes_id"`
	PublishedAt       *string    `json:"published_at"`
	PublishedBy       *uuid.UUID `json:"published_by"`
}

type timetableFilters struct {
	AcademicSessionID *uuid.UUID
	PeriodSchemeID    *uuid.UUID
	SupersedesID      *uuid.UUID
	Status            *enttimetable.Status
	EffectiveOn       *time.Time

	Limit  int
	Offset int
}

func parseTimetableFilters(values url.Values) (timetableFilters, error) {
	p := filter.New(values)

	var failed error
	f := timetableFilters{
		AcademicSessionID: p.UUID("academic_session_id"),
		PeriodSchemeID:    p.UUID("period_scheme_id"),
		SupersedesID:      p.UUID("supersedes_id"),
		EffectiveOn:       timetableQueryDate(p, "effective_on", &failed),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("status", func(v string) error {
		return enttimetable.StatusValidator(enttimetable.Status(v))
	}); raw != nil {
		status := enttimetable.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return timetableFilters{}, err
	}
	if failed != nil {
		return timetableFilters{}, failed
	}
	return f, nil
}

func (f timetableFilters) apply(q *tenantent.TimetableQuery) *tenantent.TimetableQuery {
	if f.AcademicSessionID != nil {
		q = q.Where(enttimetable.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.PeriodSchemeID != nil {
		q = q.Where(enttimetable.PeriodSchemeID(*f.PeriodSchemeID))
	}
	if f.SupersedesID != nil {
		q = q.Where(enttimetable.SupersedesID(*f.SupersedesID))
	}
	if f.Status != nil {
		q = q.Where(enttimetable.StatusEQ(*f.Status))
	}
	if f.EffectiveOn != nil {
		q = q.Where(
			enttimetable.EffectiveFromLTE(*f.EffectiveOn),
			enttimetable.Or(
				enttimetable.EffectiveToIsNil(),
				enttimetable.EffectiveToGTE(*f.EffectiveOn),
			),
		)
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) listTimetables(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseTimetableFilters(r.URL.Query())
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

	rows, err := filters.apply(client.Timetable.Query().
		Where(access.TimetablesFor(viewer, decision))).
		Order(
			tenantent.Desc(enttimetable.FieldEffectiveFrom),
			tenantent.Desc(enttimetable.FieldVersion),
			tenantent.Asc(enttimetable.FieldID),
		).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"timetables": projected,
		"count":      len(rows),
		"page":       pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getTimetable(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Timetable.Query().
		Where(enttimetable.ID(id), access.TimetablesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createTimetable(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in timetablePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, enttimetable.Columns, sent) {
		return
	}
	if !timetableWriteUnfiltered(viewer, decision) {
		response.Error(w, http.StatusForbidden,
			"a new timetable covers sections your grant of "+
				string(authorization.TimetableWrite)+" does not reach")
		return
	}

	if in.Name == nil || *in.Name == "" {
		response.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if !withinRunes(w, enttimetable.FieldName, *in.Name, timetableNameRunes) {
		return
	}
	if in.AcademicSessionID == nil || in.PeriodSchemeID == nil {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id and period_scheme_id are required")
		return
	}
	if in.Version != nil && *in.Version <= 0 {
		response.Error(w, http.StatusBadRequest, "version must be positive")
		return
	}

	from, to, ok := timetableWindow(w, in.EffectiveFrom, in.EffectiveTo)
	if !ok {
		return
	}
	if from == nil {
		response.Error(w, http.StatusBadRequest, "effective_from is required")
		return
	}

	status := enttimetable.DefaultStatus
	if in.Status != nil {
		parsed, ok := timetableEnum(w, enttimetable.FieldStatus, *in.Status, enttimetable.StatusValidator)
		if !ok {
			return
		}
		status = parsed
	}
	if wasSent(sent, enttimetable.FieldPublishedAt) {
		response.Error(w, http.StatusUnprocessableEntity,
			enttimetable.FieldPublishedAt+" is recorded when the timetable is published "+
				"and must not be supplied")
		return
	}
	publisher, ok := attributedToOptional(w, viewer, in.PublishedBy, enttimetable.FieldPublishedBy)
	if !ok {
		return
	}

	create := client.Timetable.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetPeriodSchemeID(*in.PeriodSchemeID).
		SetName(*in.Name).
		SetEffectiveFrom(*from).
		SetStatus(status).
		SetNillableVersion(in.Version).
		SetNillableEffectiveTo(to).
		SetNillableSupersedesID(in.SupersedesID)

	if status == enttimetable.StatusPublished {
		create = create.SetPublishedAt(nowUTC()).SetNillablePublishedBy(publisher)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/timetables/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func timetableWindow(w http.ResponseWriter, from, to *string) (*time.Time, *time.Time, bool) {
	start, err := parseDate(from)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "effective_from must be a date as "+dateLayout)
		return nil, nil, false
	}
	end, err := parseDate(to)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "effective_to must be a date as "+dateLayout)
		return nil, nil, false
	}
	if start != nil && end != nil && end.Before(*start) {
		response.Error(w, http.StatusUnprocessableEntity,
			"effective_to must not precede effective_from")
		return nil, nil, false
	}
	return start, end, true
}

func (s *Server) updateTimetable(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in timetablePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, enttimetable.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "timetable",
		enttimetable.FieldAcademicSessionID, enttimetable.FieldPeriodSchemeID,
		enttimetable.FieldPublishedAt) {
		return
	}

	if in.Name != nil {
		if *in.Name == "" {
			response.Error(w, http.StatusBadRequest, "name must not be empty")
			return
		}
		if !withinRunes(w, enttimetable.FieldName, *in.Name, timetableNameRunes) {
			return
		}
	}
	if in.Version != nil && *in.Version <= 0 {
		response.Error(w, http.StatusBadRequest, "version must be positive")
		return
	}
	from, to, ok := timetableWindow(w, in.EffectiveFrom, in.EffectiveTo)
	if !ok {
		return
	}
	publisher, ok := attributedToOptional(w, viewer, in.PublishedBy, enttimetable.FieldPublishedBy)
	if !ok {
		return
	}
	if !rejectNull(w, sent, enttimetable.FieldName, in.Name) {
		return
	}
	if !rejectNull(w, sent, enttimetable.FieldVersion, in.Version) {
		return
	}
	if !rejectNull(w, sent, enttimetable.FieldEffectiveFrom, in.EffectiveFrom) {
		return
	}
	if !rejectNull(w, sent, enttimetable.FieldStatus, in.Status) {
		return
	}

	update := client.Timetable.Update().
		Where(enttimetable.ID(id), access.TimetablesWritableBy(viewer, decision)).
		SetNillableName(in.Name).
		SetNillableVersion(in.Version).
		SetNillableEffectiveFrom(from).
		SetNillableEffectiveTo(to).
		SetNillableSupersedesID(in.SupersedesID)

	if wasCleared(sent, enttimetable.FieldEffectiveTo, in.EffectiveTo) {
		update = update.ClearEffectiveTo()
	}
	if wasCleared(sent, enttimetable.FieldSupersedesID, in.SupersedesID) {
		update = update.ClearSupersedesID()
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, enttimetable.FieldStatus, *in.Status, enttimetable.StatusValidator)
		if !ok {
			return
		}
		update = update.SetStatus(status)
		if status == enttimetable.StatusPublished {
			update = update.SetPublishedAt(nowUTC()).SetNillablePublishedBy(publisher)
		}
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, timetableNotFound) {
		return
	}

	row, err := client.Timetable.Query().Where(enttimetable.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteTimetable(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.Timetable.Delete().
				Where(enttimetable.ID(id), access.TimetablesWritableBy(v, d)).
				Exec(ctx)
		})
}

type timetableSlotPayload struct {
	SectionID         *uuid.UUID `json:"section_id"`
	PeriodID          *uuid.UUID `json:"period_id"`
	DayOfWeek         *int       `json:"day_of_week"`
	SubjectOfferingID *uuid.UUID `json:"subject_offering_id"`
	TeacherID         *uuid.UUID `json:"teacher_id"`
	RoomID            *uuid.UUID `json:"room_id"`
	Label             *string    `json:"label"`
	TimetableID       *uuid.UUID `json:"timetable_id"`

	ClashOverride       *bool   `json:"clash_override"`
	ClashOverrideReason *string `json:"clash_override_reason"`
}

type timetableSlotFilters struct {
	SectionID         *uuid.UUID
	PeriodID          *uuid.UUID
	TeacherID         *uuid.UUID
	RoomID            *uuid.UUID
	SubjectOfferingID *uuid.UUID
	DayOfWeek         *int

	Limit  int
	Offset int
}

func parseTimetableSlotFilters(values url.Values) (timetableSlotFilters, error) {
	p := filter.New(values)

	f := timetableSlotFilters{
		SectionID:         p.UUID("section_id"),
		PeriodID:          p.UUID("period_id"),
		TeacherID:         p.UUID("teacher_id"),
		RoomID:            p.UUID("room_id"),
		SubjectOfferingID: p.UUID("subject_offering_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Int("day_of_week", 0); raw != 0 {
		if raw < 1 || raw > 7 {
			return timetableSlotFilters{},
				&filter.Error{Param: "day_of_week", Reason: "must be 1 (Monday) through 7 (Sunday)"}
		}
		f.DayOfWeek = &raw
	}

	if err := p.Err(); err != nil {
		return timetableSlotFilters{}, err
	}
	return f, nil
}

func (f timetableSlotFilters) apply(q *tenantent.TimetableSlotQuery) *tenantent.TimetableSlotQuery {
	if f.SectionID != nil {
		q = q.Where(entslot.SectionID(*f.SectionID))
	}
	if f.PeriodID != nil {
		q = q.Where(entslot.PeriodID(*f.PeriodID))
	}
	if f.TeacherID != nil {
		q = q.Where(entslot.TeacherIDEQ(*f.TeacherID))
	}
	if f.RoomID != nil {
		q = q.Where(entslot.RoomIDEQ(*f.RoomID))
	}
	if f.SubjectOfferingID != nil {
		q = q.Where(entslot.SubjectOfferingIDEQ(*f.SubjectOfferingID))
	}
	if f.DayOfWeek != nil {
		q = q.Where(entslot.DayOfWeek(*f.DayOfWeek))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) listTimetableSlots(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	filters, err := parseTimetableSlotFilters(r.URL.Query())
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

	found, err := client.Timetable.Query().
		Where(enttimetable.ID(id), access.TimetablesFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableNotFound) {
		return
	}

	rows, err := filters.apply(client.TimetableSlot.Query().Where(
		entslot.TimetableID(id),
		access.TimetableSlotsFor(viewer, decision),
	)).
		Order(
			tenantent.Asc(entslot.FieldDayOfWeek),
			tenantent.Asc(entslot.FieldPeriodID),
			tenantent.Asc(entslot.FieldID),
		).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"timetable_slots": projected,
		"count":           len(rows),
		"page":            pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getTimetableSlot(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.TimetableSlot.Query().
		Where(entslot.ID(id), access.TimetableSlotsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableSlotNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func slotDescribes(w http.ResponseWriter, offering *uuid.UUID, label *string) bool {
	if offering == nil && (label == nil || *label == "") {
		response.Error(w, http.StatusUnprocessableEntity,
			"a slot needs either "+entslot.FieldSubjectOfferingID+" or "+entslot.FieldLabel)
		return false
	}
	return true
}

func dayOfWeekValid(w http.ResponseWriter, day int) bool {
	if day < 1 || day > 7 {
		response.Error(w, http.StatusBadRequest,
			entslot.FieldDayOfWeek+" must be 1 (Monday) through 7 (Sunday)")
		return false
	}
	return true
}

func (s *Server) createTimetableSlot(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in timetableSlotPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entslot.Columns, sent) {
		return
	}
	if !rejectFromPath(w, sent, entslot.FieldTimetableID) {
		return
	}
	fresh, ok := readSlotOverride(w, in, sent)
	if !ok {
		return
	}
	if fresh != nil && !s.mayOverrideClash(ctx, w) {
		return
	}

	timetable, err := client.Timetable.Query().
		Where(enttimetable.ID(id), access.TimetablesWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}

	if in.SectionID == nil || in.PeriodID == nil || in.DayOfWeek == nil {
		response.Error(w, http.StatusBadRequest,
			"section_id, period_id and day_of_week are required")
		return
	}
	if !dayOfWeekValid(w, *in.DayOfWeek) {
		return
	}
	if !slotDescribes(w, in.SubjectOfferingID, in.Label) {
		return
	}
	if in.Label != nil && !withinRunes(w, entslot.FieldLabel, *in.Label, timetableLabelRunes) {
		return
	}
	if !checkSectionWritable(ctx, w, client, *in.SectionID, in.SubjectOfferingID, viewer, decision) {
		return
	}
	override, ok := s.settleSlotClash(ctx, w, client, timetable, timetablesvc.Proposal{
		Ref:               slotProposalRef,
		SectionID:         *in.SectionID,
		PeriodID:          *in.PeriodID,
		DayOfWeek:         *in.DayOfWeek,
		SubjectOfferingID: in.SubjectOfferingID,
		TeacherID:         in.TeacherID,
		RoomID:            in.RoomID,
	}, viewer, fresh)
	if !ok {
		return
	}

	row, err := applySlotOverride(client.TimetableSlot.Create().
		SetTimetableID(timetable.ID).
		SetSectionID(*in.SectionID).
		SetPeriodID(*in.PeriodID).
		SetDayOfWeek(*in.DayOfWeek).
		SetNillableSubjectOfferingID(in.SubjectOfferingID).
		SetNillableTeacherID(in.TeacherID).
		SetNillableRoomID(in.RoomID).
		SetNillableLabel(in.Label), override).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/timetable-slots/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateTimetableSlot(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in timetableSlotPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entslot.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "slot", entslot.FieldTimetableID) {
		return
	}
	fresh, ok := readSlotOverride(w, in, sent)
	if !ok {
		return
	}
	if fresh != nil && !s.mayOverrideClash(ctx, w) {
		return
	}

	current, err := client.TimetableSlot.Query().
		Where(entslot.ID(id), access.TimetableSlotsWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableSlotNotFound)
		return
	}

	if in.DayOfWeek != nil && !dayOfWeekValid(w, *in.DayOfWeek) {
		return
	}
	if in.Label != nil && !withinRunes(w, entslot.FieldLabel, *in.Label, timetableLabelRunes) {
		return
	}

	proposal := slotProposal(current, in, sent)
	label := current.Label
	if in.Label != nil || wasSent(sent, entslot.FieldLabel) {
		label = in.Label
	}
	if !slotDescribes(w, proposal.SubjectOfferingID, label) {
		return
	}
	if in.SectionID != nil &&
		!checkSectionWritable(ctx, w, client, *in.SectionID, proposal.SubjectOfferingID, viewer, decision) {
		return
	}

	timetable, err := client.Timetable.Query().
		Where(enttimetable.ID(current.TimetableID)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}
	override, ok := s.settleSlotClash(ctx, w, client, timetable, proposal, viewer, fresh)
	if !ok {
		return
	}

	update := client.TimetableSlot.Update().
		Where(entslot.ID(id), access.TimetableSlotsWritableBy(viewer, decision)).
		SetNillableSectionID(in.SectionID).
		SetNillablePeriodID(in.PeriodID).
		SetNillableDayOfWeek(in.DayOfWeek).
		SetNillableSubjectOfferingID(in.SubjectOfferingID).
		SetNillableTeacherID(in.TeacherID).
		SetNillableRoomID(in.RoomID).
		SetNillableLabel(in.Label)

	if in.TeacherID == nil && wasSent(sent, entslot.FieldTeacherID) {
		update = update.ClearTeacherID()
	}
	if in.RoomID == nil && wasSent(sent, entslot.FieldRoomID) {
		update = update.ClearRoomID()
	}
	if in.SubjectOfferingID == nil && wasSent(sent, entslot.FieldSubjectOfferingID) {
		update = update.ClearSubjectOfferingID()
	}
	if in.Label == nil && wasSent(sent, entslot.FieldLabel) {
		update = update.ClearLabel()
	}
	update = updateSlotOverride(update, override)

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, timetableSlotNotFound) {
		return
	}

	row, err := client.TimetableSlot.Query().Where(entslot.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableSlotNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func slotProposal(current *tenantent.TimetableSlot, in timetableSlotPayload,
	sent []string) timetablesvc.Proposal {
	replaces := current.ID
	proposal := timetablesvc.Proposal{
		Ref:               slotProposalRef,
		ReplacesSlotID:    &replaces,
		SectionID:         current.SectionID,
		PeriodID:          current.PeriodID,
		DayOfWeek:         current.DayOfWeek,
		SubjectOfferingID: current.SubjectOfferingID,
		TeacherID:         current.TeacherID,
		RoomID:            current.RoomID,
	}
	if in.ClashOverride == nil || *in.ClashOverride {
		proposal.Override = carriedOverride(current)
	}

	if in.SectionID != nil {
		proposal.SectionID = *in.SectionID
	}
	if in.PeriodID != nil {
		proposal.PeriodID = *in.PeriodID
	}
	if in.DayOfWeek != nil {
		proposal.DayOfWeek = *in.DayOfWeek
	}
	if in.SubjectOfferingID != nil || wasSent(sent, entslot.FieldSubjectOfferingID) {
		proposal.SubjectOfferingID = in.SubjectOfferingID
	}
	if in.TeacherID != nil || wasSent(sent, entslot.FieldTeacherID) {
		proposal.TeacherID = in.TeacherID
	}
	if in.RoomID != nil || wasSent(sent, entslot.FieldRoomID) {
		proposal.RoomID = in.RoomID
	}
	return proposal
}

func (s *Server) deleteTimetableSlot(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableSlotNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.TimetableSlot.Delete().
				Where(entslot.ID(id), access.TimetableSlotsWritableBy(v, d)).
				Exec(ctx)
		})
}

func writeClashReport(w http.ResponseWriter, report *timetablesvc.ClashReport, message string) {
	response.JSON(w, http.StatusConflict, response.Envelope{
		"error":         http.StatusText(http.StatusConflict),
		"message":       message,
		"code":          TimetableClashCode,
		"clashes":       report.Clashes,
		"count":         len(report.Clashes),
		"dates_checked": report.DatesChecked,
	})
}

type clashRequest struct {
	From           *string                `json:"from"`
	To             *string                `json:"to"`
	Rules          []string               `json:"rules"`
	MaxStudents    *int                   `json:"max_students"`
	ExcludeSlotIDs []uuid.UUID            `json:"exclude_timetable_slot_ids"`
	Proposed       []clashProposalRequest `json:"proposed"`
}

type clashProposalRequest struct {
	Ref               string     `json:"ref"`
	ReplacesSlotID    *uuid.UUID `json:"replaces_timetable_slot_id"`
	SectionID         uuid.UUID  `json:"section_id"`
	PeriodID          uuid.UUID  `json:"period_id"`
	DayOfWeek         int        `json:"day_of_week"`
	SubjectOfferingID *uuid.UUID `json:"subject_offering_id"`
	TeacherID         *uuid.UUID `json:"teacher_id"`
	RoomID            *uuid.UUID `json:"room_id"`
}

func (s *Server) checkTimetableClashes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in clashRequest
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if len(in.Proposed) > maxClashProposals {
		response.Error(w, http.StatusUnprocessableEntity,
			"a clash check carries at most 100 proposed slots")
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	timetable, err := client.Timetable.Query().
		Where(enttimetable.ID(id), access.TimetablesWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}

	from, to, ok := clashWindow(w, in)
	if !ok {
		return
	}

	proposed := make([]timetablesvc.Proposal, 0, len(in.Proposed))
	for _, raw := range in.Proposed {
		if !checkSectionWritable(ctx, w, client, raw.SectionID, raw.SubjectOfferingID, viewer, decision) {
			return
		}
		proposed = append(proposed, timetablesvc.Proposal{
			Ref:               raw.Ref,
			ReplacesSlotID:    raw.ReplacesSlotID,
			SectionID:         raw.SectionID,
			PeriodID:          raw.PeriodID,
			DayOfWeek:         raw.DayOfWeek,
			SubjectOfferingID: raw.SubjectOfferingID,
			TeacherID:         raw.TeacherID,
			RoomID:            raw.RoomID,
		})
	}

	rules := make([]timetablesvc.Rule, 0, len(in.Rules))
	for _, rule := range in.Rules {
		rules = append(rules, timetablesvc.Rule(rule))
	}

	branch, err := branchOfScheme(ctx, client, timetable.PeriodSchemeID)
	if err != nil {
		writeTenantEntErr(w, err, timetableSchemeNotFound)
		return
	}

	service, err := timetablesvc.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	query := timetablesvc.ClashQuery{
		BranchID:       branch,
		TimetableID:    timetable.ID,
		Proposed:       proposed,
		ExcludeSlotIDs: in.ExcludeSlotIDs,
		Rules:          rules,
	}
	if from != nil && to != nil {
		query.From, query.To = *from, *to
	}
	if in.MaxStudents != nil {
		query.MaxStudents = *in.MaxStudents
	}

	report, err := service.Check(ctx, query)
	if err != nil {
		writeTimetableServiceErr(w, err, timetableNotFound)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"clashes":       report.Clashes,
		"count":         len(report.Clashes),
		"clear":         report.Clear(),
		"blocking":      len(report.Blocking()),
		"overridden":    len(report.Overridden()),
		"dates_checked": report.DatesChecked,
	})
}

func clashWindow(w http.ResponseWriter, in clashRequest) (*time.Time, *time.Time, bool) {
	from, err := parseDate(in.From)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "from must be a date as "+dateLayout)
		return nil, nil, false
	}
	to, err := parseDate(in.To)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "to must be a date as "+dateLayout)
		return nil, nil, false
	}
	if (from == nil) != (to == nil) {
		response.Error(w, http.StatusBadRequest, "from and to must be given together")
		return nil, nil, false
	}
	return from, to, true
}

type timetableDeviationPayload struct {
	TimetableSlotID     *uuid.UUID `json:"timetable_slot_id"`
	DeviationDate       *string    `json:"deviation_date"`
	Kind                *string    `json:"kind"`
	SectionID           *uuid.UUID `json:"section_id"`
	PeriodID            *uuid.UUID `json:"period_id"`
	SubjectOfferingID   *uuid.UUID `json:"subject_offering_id"`
	SubstituteTeacherID *uuid.UUID `json:"substitute_teacher_id"`
	RoomID              *uuid.UUID `json:"room_id"`
	StartMinute         *int       `json:"start_minute"`
	EndMinute           *int       `json:"end_minute"`
	Reason              *string    `json:"reason"`
	CreatedBy           *uuid.UUID `json:"created_by"`
}

type timetableDeviationFilters struct {
	TimetableSlotID     *uuid.UUID
	SectionID           *uuid.UUID
	PeriodID            *uuid.UUID
	SubjectOfferingID   *uuid.UUID
	SubstituteTeacherID *uuid.UUID
	RoomID              *uuid.UUID
	Kind                *entdeviation.Kind
	From                *time.Time
	To                  *time.Time

	Limit  int
	Offset int
}

func parseTimetableDeviationFilters(values url.Values) (timetableDeviationFilters, error) {
	p := filter.New(values)

	var failed error
	f := timetableDeviationFilters{
		TimetableSlotID:     p.UUID("timetable_slot_id"),
		SectionID:           p.UUID("section_id"),
		PeriodID:            p.UUID("period_id"),
		SubjectOfferingID:   p.UUID("subject_offering_id"),
		SubstituteTeacherID: p.UUID("substitute_teacher_id"),
		RoomID:              p.UUID("room_id"),
		From:                timetableQueryDate(p, "from", &failed),
		To:                  timetableQueryDate(p, "to", &failed),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("kind", func(v string) error {
		return entdeviation.KindValidator(entdeviation.Kind(v))
	}); raw != nil {
		kind := entdeviation.Kind(*raw)
		f.Kind = &kind
	}

	if err := p.Err(); err != nil {
		return timetableDeviationFilters{}, err
	}
	if failed != nil {
		return timetableDeviationFilters{}, failed
	}
	if f.From != nil && f.To != nil && f.To.Before(*f.From) {
		return timetableDeviationFilters{},
			&filter.Error{Param: "to", Reason: "must not precede from"}
	}
	return f, nil
}

func (f timetableDeviationFilters) apply(
	q *tenantent.TimetableDeviationQuery) *tenantent.TimetableDeviationQuery {
	if f.TimetableSlotID != nil {
		q = q.Where(entdeviation.TimetableSlotIDEQ(*f.TimetableSlotID))
	}
	if f.SectionID != nil {
		q = q.Where(entdeviation.SectionID(*f.SectionID))
	}
	if f.PeriodID != nil {
		q = q.Where(entdeviation.PeriodID(*f.PeriodID))
	}
	if f.SubjectOfferingID != nil {
		q = q.Where(entdeviation.SubjectOfferingIDEQ(*f.SubjectOfferingID))
	}
	if f.SubstituteTeacherID != nil {
		q = q.Where(entdeviation.SubstituteTeacherIDEQ(*f.SubstituteTeacherID))
	}
	if f.RoomID != nil {
		q = q.Where(entdeviation.RoomIDEQ(*f.RoomID))
	}
	if f.Kind != nil {
		q = q.Where(entdeviation.KindEQ(*f.Kind))
	}
	if f.From != nil {
		q = q.Where(entdeviation.DeviationDateGTE(*f.From))
	}
	if f.To != nil {
		q = q.Where(entdeviation.DeviationDateLTE(*f.To))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) listTimetableDeviations(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseTimetableDeviationFilters(r.URL.Query())
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

	rows, err := filters.apply(client.TimetableDeviation.Query().
		Where(access.TimetableDeviationsFor(viewer, decision))).
		Order(
			tenantent.Asc(entdeviation.FieldDeviationDate),
			tenantent.Asc(entdeviation.FieldID),
		).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"timetable_deviations": projected,
		"count":                len(rows),
		"page":                 pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getTimetableDeviation(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.TimetableDeviation.Query().
		Where(entdeviation.ID(id), access.TimetableDeviationsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDevNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func deviationMinutes(w http.ResponseWriter, start, end *int) bool {
	if start == nil && end == nil {
		return true
	}
	if start == nil || end == nil {
		response.Error(w, http.StatusUnprocessableEntity,
			"start_minute and end_minute must be given together")
		return false
	}
	if *start < 0 || *end > minutesInDay || *end <= *start {
		response.Error(w, http.StatusUnprocessableEntity,
			"start_minute and end_minute must describe a span inside the day")
		return false
	}
	return true
}

func deviationShapeValid(w http.ResponseWriter, kind entdeviation.Kind,
	in timetableDeviationPayload) bool {
	switch kind {
	case entdeviation.KindAdded:
		if in.TimetableSlotID != nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"an added class has no timetable_slot_id: it is not a change to a planned class")
			return false
		}
		if in.SectionID == nil || in.PeriodID == nil || in.SubjectOfferingID == nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"an added class needs section_id, period_id and subject_offering_id")
			return false
		}
	default:
		if in.TimetableSlotID == nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"timetable_slot_id is required: this deviation changes a planned class")
			return false
		}
	}

	switch kind {
	case entdeviation.KindSubstitution:
		if in.SubstituteTeacherID == nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"a substitution needs substitute_teacher_id")
			return false
		}
	case entdeviation.KindRoomChange:
		if in.RoomID == nil {
			response.Error(w, http.StatusUnprocessableEntity, "a room change needs room_id")
			return false
		}
	case entdeviation.KindTimeChange:
		if in.StartMinute == nil || in.EndMinute == nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"a time change needs start_minute and end_minute")
			return false
		}
	}
	return true
}

func (s *Server) createTimetableDeviation(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in timetableDeviationPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entdeviation.Columns, sent) {
		return
	}

	if in.Kind == nil {
		response.Error(w, http.StatusBadRequest, "kind is required")
		return
	}
	kind, ok := timetableEnum(w, entdeviation.FieldKind, *in.Kind, entdeviation.KindValidator)
	if !ok {
		return
	}
	on, err := parseDate(in.DeviationDate)
	if err != nil || on == nil {
		response.Error(w, http.StatusBadRequest, "deviation_date is required as "+dateLayout)
		return
	}
	if !deviationShapeValid(w, kind, in) {
		return
	}
	if !deviationMinutes(w, in.StartMinute, in.EndMinute) {
		return
	}
	if in.Reason != nil && !withinRunes(w, entdeviation.FieldReason, *in.Reason, calendarNameRunes) {
		return
	}
	author, ok := attributedToOptional(w, viewer, in.CreatedBy, entdeviation.FieldCreatedBy)
	if !ok {
		return
	}

	section, period, offering := in.SectionID, in.PeriodID, in.SubjectOfferingID
	if in.TimetableSlotID != nil {
		slot, err := client.TimetableSlot.Query().
			Where(entslot.ID(*in.TimetableSlotID), access.TimetableSlotsWritableBy(viewer, decision)).
			Only(ctx)
		if err != nil {
			writeTenantEntErr(w, err, timetableSlotNotFound)
			return
		}
		if !rejectFromPath(w, sent, entdeviation.FieldSectionID) ||
			!rejectFromPath(w, sent, entdeviation.FieldPeriodID) {
			return
		}
		section, period = &slot.SectionID, &slot.PeriodID
		if offering == nil {
			offering = slot.SubjectOfferingID
		}
	} else if !checkSectionWritable(ctx, w, client, *section, offering, viewer, decision) {
		return
	}

	row, err := client.TimetableDeviation.Create().
		SetNillableTimetableSlotID(in.TimetableSlotID).
		SetDeviationDate(*on).
		SetKind(kind).
		SetSectionID(*section).
		SetPeriodID(*period).
		SetNillableSubjectOfferingID(offering).
		SetNillableSubstituteTeacherID(in.SubstituteTeacherID).
		SetNillableRoomID(in.RoomID).
		SetNillableStartMinute(in.StartMinute).
		SetNillableEndMinute(in.EndMinute).
		SetNillableReason(in.Reason).
		SetNillableCreatedBy(author).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDevNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/timetable-deviations/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateTimetableDeviation(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in timetableDeviationPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entdeviation.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "deviation",
		entdeviation.FieldDeviationDate, entdeviation.FieldTimetableSlotID,
		entdeviation.FieldSectionID, entdeviation.FieldPeriodID) {
		return
	}

	current, err := client.TimetableDeviation.Query().
		Where(entdeviation.ID(id), access.TimetableDeviationsWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDevNotFound)
		return
	}

	kind := current.Kind
	if in.Kind != nil {
		parsed, ok := timetableEnum(w, entdeviation.FieldKind, *in.Kind, entdeviation.KindValidator)
		if !ok {
			return
		}
		kind = parsed
	}
	if kind != current.Kind && (kind == entdeviation.KindAdded) != (current.Kind == entdeviation.KindAdded) {
		response.Error(w, http.StatusUnprocessableEntity,
			"an added class and a change to a planned class are not interchangeable; "+
				"delete this deviation and record the other kind")
		return
	}
	if !deviationMinutes(w, in.StartMinute, in.EndMinute) {
		return
	}
	if in.Reason != nil && !withinRunes(w, entdeviation.FieldReason, *in.Reason, calendarNameRunes) {
		return
	}

	update := client.TimetableDeviation.Update().
		Where(entdeviation.ID(id), access.TimetableDeviationsWritableBy(viewer, decision)).
		SetKind(kind).
		SetNillableSubjectOfferingID(in.SubjectOfferingID).
		SetNillableSubstituteTeacherID(in.SubstituteTeacherID).
		SetNillableRoomID(in.RoomID).
		SetNillableStartMinute(in.StartMinute).
		SetNillableEndMinute(in.EndMinute).
		SetNillableReason(in.Reason)

	if in.SubstituteTeacherID == nil && wasSent(sent, entdeviation.FieldSubstituteTeacherID) {
		update = update.ClearSubstituteTeacherID()
	}
	if in.RoomID == nil && wasSent(sent, entdeviation.FieldRoomID) {
		update = update.ClearRoomID()
	}
	if in.StartMinute == nil && wasSent(sent, entdeviation.FieldStartMinute) {
		update = update.ClearStartMinute()
	}
	if in.EndMinute == nil && wasSent(sent, entdeviation.FieldEndMinute) {
		update = update.ClearEndMinute()
	}
	if in.Reason == nil && wasSent(sent, entdeviation.FieldReason) {
		update = update.ClearReason()
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, timetableDevNotFound) {
		return
	}

	row, err := client.TimetableDeviation.Query().Where(entdeviation.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDevNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteTimetableDeviation(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableDevNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.TimetableDeviation.Delete().
				Where(entdeviation.ID(id), access.TimetableDeviationsWritableBy(v, d)).
				Exec(ctx)
		})
}

type occurrenceLens struct {
	slot predicate.TimetableSlot
	dev  predicate.TimetableDeviation
}

func occurrenceThrough(slot predicate.TimetableSlot, direct predicate.TimetableDeviation) occurrenceLens {
	return occurrenceLens{
		slot: slot,
		dev:  entdeviation.Or(entdeviation.HasTimetableSlotWith(slot), direct),
	}
}

type occurrenceQuery struct {
	BranchID      uuid.UUID
	From          time.Time
	To            time.Time
	Half          timetablesvc.Half
	Statuses      []enttimetable.Status
	OmitCancelled bool

	lenses []occurrenceLens
}

func parseOccurrenceQuery(values url.Values) (occurrenceQuery, error) {
	p := filter.New(values)

	var failed error
	q := occurrenceQuery{OmitCancelled: p.Bool("omit_cancelled")}
	q.Half = timetableHalf(p, &failed)

	if branch := p.UUID("branch_id"); branch != nil {
		q.BranchID = *branch
	}

	date := timetableQueryDate(p, "date", &failed)
	from := timetableQueryDate(p, "from", &failed)
	to := timetableQueryDate(p, "to", &failed)

	switch {
	case date != nil && (from != nil || to != nil):
		return occurrenceQuery{}, &filter.Error{
			Param:  "date",
			Reason: "names a single day and cannot be combined with from and to",
		}
	case date != nil:
		q.From, q.To = *date, *date
	case from != nil && to != nil:
		q.From, q.To = *from, *to
	case from != nil || to != nil:
		return occurrenceQuery{}, &filter.Error{Param: "from", Reason: "and to must be given together"}
	case failed == nil:
		return occurrenceQuery{}, &filter.Error{
			Param:  "date",
			Reason: "is required, or give from and to",
		}
	}

	if raw := p.Enum("status", func(v string) error {
		return enttimetable.StatusValidator(enttimetable.Status(v))
	}); raw != nil {
		q.Statuses = []enttimetable.Status{enttimetable.Status(*raw)}
	}

	if id := p.UUID("section_id"); id != nil {
		q.lenses = append(q.lenses, occurrenceThrough(
			entslot.SectionIDEQ(*id), entdeviation.SectionIDEQ(*id)))
	}
	if id := p.UUID("period_id"); id != nil {
		q.lenses = append(q.lenses, occurrenceThrough(
			entslot.PeriodIDEQ(*id), entdeviation.PeriodIDEQ(*id)))
	}
	if id := p.UUID("teacher_id"); id != nil {
		q.lenses = append(q.lenses, occurrenceThrough(
			entslot.TeacherIDEQ(*id), entdeviation.SubstituteTeacherIDEQ(*id)))
	}
	if id := p.UUID("room_id"); id != nil {
		q.lenses = append(q.lenses, occurrenceThrough(
			entslot.RoomIDEQ(*id), entdeviation.RoomIDEQ(*id)))
	}
	if id := p.UUID("subject_offering_id"); id != nil {
		q.lenses = append(q.lenses, occurrenceThrough(
			entslot.SubjectOfferingIDEQ(*id), entdeviation.SubjectOfferingIDEQ(*id)))
	}

	if err := p.Err(); err != nil {
		return occurrenceQuery{}, err
	}
	if failed != nil {
		return occurrenceQuery{}, failed
	}
	return q, nil
}

func (s *Server) resolveTimetableOccurrences(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	service, err := timetablesvc.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q, err := parseOccurrenceQuery(r.URL.Query())
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

	slots := []predicate.TimetableSlot{access.TimetableSlotsFor(viewer, decision)}
	deviations := []predicate.TimetableDeviation{access.TimetableDeviationsFor(viewer, decision)}
	for _, lens := range q.lenses {
		slots = append(slots, lens.slot)
		deviations = append(deviations, lens.dev)
	}

	resolved, err := service.ResolveCoverage(ctx, timetablesvc.ResolveQuery{
		BranchID:      q.BranchID,
		From:          q.From,
		To:            q.To,
		Half:          q.Half,
		Slots:         slots,
		Deviations:    deviations,
		Statuses:      q.Statuses,
		OmitCancelled: q.OmitCancelled,
	})
	if err != nil {
		writeTimetableServiceErr(w, err, timetableNotFound)
		return
	}
	occurrences := resolved.Occurrences

	projected, err := projectAll(occurrences, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(occurrences))

	response.JSON(w, http.StatusOK, response.Envelope{
		"occurrences":     projected,
		"count":           len(occurrences),
		"branch_id":       q.BranchID,
		"from":            q.From.Format(dateLayout),
		"to":              q.To.Format(dateLayout),
		"half":            q.Half,
		"uncovered_days":  uncoveredDays(resolved.Uncovered),
		"uncovered_count": len(resolved.Uncovered),
	})
}

type uncoveredDay struct {
	Date           string    `json:"date"`
	PeriodSchemeID uuid.UUID `json:"period_scheme_id"`
}

func uncoveredDays(in []timetablesvc.Uncovered) []uncoveredDay {
	out := make([]uncoveredDay, 0, len(in))
	for _, gap := range in {
		out = append(out, uncoveredDay{
			Date:           gap.Date.Format(dateLayout),
			PeriodSchemeID: gap.PeriodSchemeID,
		})
	}
	return out
}

func readableCalendarDayIDs(ctx context.Context, client *tenantent.Client, branch uuid.UUID,
	from, to time.Time, v *access.Viewer, d authorization.Decision) (map[uuid.UUID]bool, error) {
	ids, err := client.CalendarDay.Query().
		Where(
			entcalendarday.BranchID(branch),
			entcalendarday.CalendarDateGTE(from),
			entcalendarday.CalendarDateLTE(to),
			access.CalendarDaysFor(v, d),
		).
		IDs(ctx)
	if err != nil {
		return nil, err
	}

	readable := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		readable[id] = true
	}
	return readable, nil
}

type sessionDayQuery struct {
	BranchID uuid.UUID
	From     time.Time
	To       time.Time
	Half     timetablesvc.Half
	OpenOnly bool
}

func parseSessionDayQuery(values url.Values) (sessionDayQuery, error) {
	p := filter.New(values)

	var failed error
	q := sessionDayQuery{OpenOnly: p.Bool("open_only")}
	q.Half = timetableHalf(p, &failed)

	if branch := p.UUID("branch_id"); branch != nil {
		q.BranchID = *branch
	}

	from := timetableQueryDate(p, "from", &failed)
	to := timetableQueryDate(p, "to", &failed)
	if from != nil && to != nil {
		q.From, q.To = *from, *to
	} else if failed == nil {
		return sessionDayQuery{}, &filter.Error{Param: "from", Reason: "and to are required"}
	}

	if err := p.Err(); err != nil {
		return sessionDayQuery{}, err
	}
	if failed != nil {
		return sessionDayQuery{}, failed
	}
	return q, nil
}

func (s *Server) listSessionDays(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	service, err := timetablesvc.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q, err := parseSessionDayQuery(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.CalendarRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	days, err := service.Calendar(ctx, q.BranchID, q.From, q.To, q.Half)
	if err != nil {
		writeTimetableServiceErr(w, err, timetableDayNotFound)
		return
	}

	readable, err := readableCalendarDayIDs(ctx, client, q.BranchID, q.From, q.To, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	out := make([]timetablesvc.SessionDay, 0, len(days))
	dates := make([]string, 0, len(days))
	for _, day := range days {
		if !readable[day.ID] {
			continue
		}
		if q.OpenOnly && !day.Open(q.Half) {
			continue
		}
		out = append(out, day)
		if day.Open(q.Half) {
			dates = append(dates, day.Date.Format(dateLayout))
		}
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"calendar_days": out,
		"count":         len(out),
		"session_dates": dates,
		"branch_id":     q.BranchID,
		"half":          q.Half,
	})
}

func (s *Server) getInSession(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	service, err := timetablesvc.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	var failed error
	half := timetableHalf(p, &failed)
	branch := p.UUID("branch_id")
	date := timetableQueryDate(p, "date", &failed)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if failed != nil {
		response.Error(w, http.StatusBadRequest, failed.Error())
		return
	}
	if date == nil {
		response.Error(w, http.StatusBadRequest, "date is required as "+dateLayout)
		return
	}

	branchID := uuid.Nil
	if branch != nil {
		branchID = *branch
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.CalendarRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	readable, err := readableCalendarDayIDs(ctx, client, branchID, *date, *date, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	inSession := false
	if len(readable) > 0 {
		inSession, err = service.IsInSession(ctx, branchID, *date, half)
		if err != nil {
			writeTimetableServiceErr(w, err, timetableDayNotFound)
			return
		}
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"branch_id":  branchID,
		"date":       date.Format(dateLayout),
		"half":       half,
		"in_session": inSession,
	})
}

type roomPayload struct {
	BranchID *uuid.UUID `json:"branch_id"`
	Name     *string    `json:"name"`
	Code     *string    `json:"code"`
	RoomType *string    `json:"room_type"`
	Building *string    `json:"building"`
	Floor    *string    `json:"floor"`
	Capacity *int       `json:"capacity"`
	Status   *string    `json:"status"`
}

type roomFilters struct {
	BranchID *uuid.UUID
	RoomType string
	Status   *entroom.Status

	Limit  int
	Offset int
}

func parseRoomFilters(values url.Values) (roomFilters, error) {
	p := filter.New(values)

	f := roomFilters{
		BranchID: p.UUID("branch_id"),
		RoomType: p.String("room_type"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("status", func(v string) error {
		return entroom.StatusValidator(entroom.Status(v))
	}); raw != nil {
		status := entroom.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return roomFilters{}, err
	}
	return f, nil
}

func (f roomFilters) apply(q *tenantent.RoomQuery) *tenantent.RoomQuery {
	if f.BranchID != nil {
		q = q.Where(entroom.BranchID(*f.BranchID))
	}
	if f.RoomType != "" {
		q = q.Where(entroom.RoomType(f.RoomType))
	}
	if f.Status != nil {
		q = q.Where(entroom.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) listRooms(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseRoomFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.RoomsRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := filters.apply(client.Room.Query().Where(access.RoomsFor(viewer, decision))).
		Order(tenantent.Asc(entroom.FieldCode), tenantent.Asc(entroom.FieldID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"rooms": projected,
		"count": len(rows),
		"page":  pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getRoom(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.RoomsRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Room.Query().
		Where(entroom.ID(id), access.RoomsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableRoomNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func roomTextValid(w http.ResponseWriter, in roomPayload) bool {
	if in.Name != nil && !withinRunes(w, entroom.FieldName, *in.Name, roomNameRunes) {
		return false
	}
	if in.Code != nil && !withinRunes(w, entroom.FieldCode, *in.Code, timetableCodeRunes) {
		return false
	}
	if in.RoomType != nil && !withinRunes(w, entroom.FieldRoomType, *in.RoomType, roomTypeRunes) {
		return false
	}
	if in.Building != nil && !withinRunes(w, entroom.FieldBuilding, *in.Building, roomBuildingRunes) {
		return false
	}
	if in.Floor != nil && !withinRunes(w, entroom.FieldFloor, *in.Floor, roomFloorRunes) {
		return false
	}
	if in.Capacity != nil && *in.Capacity <= 0 {
		response.Error(w, http.StatusBadRequest, "capacity must be positive")
		return false
	}
	return true
}

func (s *Server) createRoom(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in roomPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.RoomsWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entroom.Columns, sent) {
		return
	}
	if !roomsWritable(w, viewer, decision) {
		return
	}

	if in.BranchID == nil || in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "branch_id, name and code are required")
		return
	}
	if !roomTextValid(w, in) {
		return
	}

	create := client.Room.Create().
		SetBranchID(*in.BranchID).
		SetName(*in.Name).
		SetCode(*in.Code).
		SetNillableRoomType(in.RoomType).
		SetNillableBuilding(in.Building).
		SetNillableFloor(in.Floor).
		SetNillableCapacity(in.Capacity)

	if in.Status != nil {
		status, ok := timetableEnum(w, entroom.FieldStatus, *in.Status, entroom.StatusValidator)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableRoomNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/rooms/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func roomsWritable(w http.ResponseWriter, v *access.Viewer, d authorization.Decision) bool {
	if timetableWriteUnfiltered(v, d) {
		return true
	}
	response.Error(w, http.StatusForbidden,
		"a room belongs to the whole school, so "+string(authorization.RoomsWrite)+
			" must reach the tenant")
	return false
}

func (s *Server) updateRoom(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in roomPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.RoomsWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entroom.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "room", entroom.FieldBranchID) {
		return
	}
	if !roomTextValid(w, in) {
		return
	}

	update := client.Room.Update().
		Where(entroom.ID(id), access.RoomsWritableBy(viewer, decision)).
		SetNillableName(in.Name).
		SetNillableCode(in.Code).
		SetNillableRoomType(in.RoomType).
		SetNillableBuilding(in.Building).
		SetNillableFloor(in.Floor).
		SetNillableCapacity(in.Capacity)

	if in.Building == nil && wasSent(sent, entroom.FieldBuilding) {
		update = update.ClearBuilding()
	}
	if in.Floor == nil && wasSent(sent, entroom.FieldFloor) {
		update = update.ClearFloor()
	}
	if in.Capacity == nil && wasSent(sent, entroom.FieldCapacity) {
		update = update.ClearCapacity()
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entroom.FieldStatus, *in.Status, entroom.StatusValidator)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, timetableRoomNotFound) {
		return
	}

	row, err := client.Room.Query().Where(entroom.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableRoomNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteRoom(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableRoomNotFound,
		authorization.RoomsDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.Room.Delete().
				Where(entroom.ID(id), access.RoomsWritableBy(v, d)).
				Exec(ctx)
		})
}

type periodSchemePayload struct {
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	BranchID          *uuid.UUID `json:"branch_id"`
	Name              *string    `json:"name"`
	Code              *string    `json:"code"`
	Description       *string    `json:"description"`
	Status            *string    `json:"status"`
}

type periodSchemeFilters struct {
	AcademicSessionID *uuid.UUID
	BranchID          *uuid.UUID
	Status            *entscheme.Status

	Limit  int
	Offset int
}

func parsePeriodSchemeFilters(values url.Values) (periodSchemeFilters, error) {
	p := filter.New(values)

	f := periodSchemeFilters{
		AcademicSessionID: p.UUID("academic_session_id"),
		BranchID:          p.UUID("branch_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("status", func(v string) error {
		return entscheme.StatusValidator(entscheme.Status(v))
	}); raw != nil {
		status := entscheme.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return periodSchemeFilters{}, err
	}
	return f, nil
}

func (f periodSchemeFilters) apply(q *tenantent.PeriodSchemeQuery) *tenantent.PeriodSchemeQuery {
	if f.AcademicSessionID != nil {
		q = q.Where(entscheme.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.BranchID != nil {
		q = q.Where(entscheme.BranchID(*f.BranchID))
	}
	if f.Status != nil {
		q = q.Where(entscheme.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) listPeriodSchemes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parsePeriodSchemeFilters(r.URL.Query())
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

	rows, err := filters.apply(client.PeriodScheme.Query().
		Where(access.PeriodSchemesFor(viewer, decision))).
		Order(tenantent.Asc(entscheme.FieldCode), tenantent.Asc(entscheme.FieldID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"period_schemes": projected,
		"count":          len(rows),
		"page":           pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getPeriodScheme(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.PeriodScheme.Query().
		Where(entscheme.ID(id), access.PeriodSchemesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableSchemeNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func dayShapeWritable(w http.ResponseWriter, v *access.Viewer, d authorization.Decision,
	subject string, entity authorization.Entity) bool {
	if timetableWriteUnfiltered(v, d) {
		return true
	}
	response.Error(w, http.StatusForbidden,
		"a "+subject+" shapes the day for the whole school, so "+string(entity)+
			" must reach the tenant")
	return false
}

func (s *Server) createPeriodScheme(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in periodSchemePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entscheme.Columns, sent) {
		return
	}
	if !dayShapeWritable(w, viewer, decision, "period scheme", authorization.TimetableWrite) {
		return
	}

	if in.AcademicSessionID == nil || in.BranchID == nil ||
		in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id, branch_id, name and code are required")
		return
	}
	if !withinRunes(w, entscheme.FieldName, *in.Name, timetableNameRunes) ||
		!withinRunes(w, entscheme.FieldCode, *in.Code, timetableCodeRunes) {
		return
	}

	create := client.PeriodScheme.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetBranchID(*in.BranchID).
		SetName(*in.Name).
		SetCode(*in.Code).
		SetNillableDescription(in.Description)

	if in.Status != nil {
		status, ok := timetableEnum(w, entscheme.FieldStatus, *in.Status, entscheme.StatusValidator)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableSchemeNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/period-schemes/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updatePeriodScheme(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in periodSchemePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entscheme.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "period scheme",
		entscheme.FieldAcademicSessionID, entscheme.FieldBranchID) {
		return
	}
	if in.Name != nil && !withinRunes(w, entscheme.FieldName, *in.Name, timetableNameRunes) {
		return
	}
	if in.Code != nil && !withinRunes(w, entscheme.FieldCode, *in.Code, timetableCodeRunes) {
		return
	}

	update := client.PeriodScheme.Update().
		Where(entscheme.ID(id), access.PeriodSchemesWritableBy(viewer, decision)).
		SetNillableName(in.Name).
		SetNillableCode(in.Code).
		SetNillableDescription(in.Description)

	if in.Description == nil && wasSent(sent, entscheme.FieldDescription) {
		update = update.ClearDescription()
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entscheme.FieldStatus, *in.Status, entscheme.StatusValidator)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, timetableSchemeNotFound) {
		return
	}

	row, err := client.PeriodScheme.Query().Where(entscheme.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableSchemeNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deletePeriodScheme(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableSchemeNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.PeriodScheme.Delete().
				Where(entscheme.ID(id), access.PeriodSchemesWritableBy(v, d)).
				Exec(ctx)
		})
}

type periodPayload struct {
	Name     *string `json:"name"`
	Code     *string `json:"code"`
	Sequence *int    `json:"sequence"`
	Kind     *string `json:"kind"`
	Status   *string `json:"status"`
}

func (s *Server) listPeriods(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	p := filter.New(r.URL.Query())
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	kind := p.Enum("kind", func(v string) error {
		return entperiod.KindValidator(entperiod.Kind(v))
	})
	status := p.Enum("status", func(v string) error {
		return entperiod.StatusValidator(entperiod.Status(v))
	})
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.PeriodScheme.Query().
		Where(entscheme.ID(id), access.PeriodSchemesFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableSchemeNotFound) {
		return
	}

	q := client.Period.Query().
		Where(entperiod.PeriodSchemeID(id), access.PeriodsFor(viewer, decision))
	if kind != nil {
		q = q.Where(entperiod.KindEQ(entperiod.Kind(*kind)))
	}
	if status != nil {
		q = q.Where(entperiod.StatusEQ(entperiod.Status(*status)))
	}

	rows, err := q.Limit(limit).Offset(offset).
		Order(tenantent.Asc(entperiod.FieldSequence), tenantent.Asc(entperiod.FieldID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"periods": projected,
		"count":   len(rows),
		"page":    pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) getPeriod(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Period.Query().
		Where(entperiod.ID(id), access.PeriodsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetablePeriodNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createPeriod(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in periodPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entperiod.Columns, sent) {
		return
	}
	if !rejectFromPath(w, sent, entperiod.FieldPeriodSchemeID) {
		return
	}

	found, err := client.PeriodScheme.Query().
		Where(entscheme.ID(id), access.PeriodSchemesWritableBy(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableSchemeNotFound) {
		return
	}

	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" || in.Sequence == nil {
		response.Error(w, http.StatusBadRequest, "name, code and sequence are required")
		return
	}
	if !withinRunes(w, entperiod.FieldName, *in.Name, periodNameRunes) ||
		!withinRunes(w, entperiod.FieldCode, *in.Code, timetableCodeRunes) {
		return
	}
	if *in.Sequence < 0 {
		response.Error(w, http.StatusBadRequest, "sequence must not be negative")
		return
	}

	create := client.Period.Create().
		SetPeriodSchemeID(id).
		SetName(*in.Name).
		SetCode(*in.Code).
		SetSequence(*in.Sequence)

	if in.Kind != nil {
		kind, ok := timetableEnum(w, entperiod.FieldKind, *in.Kind, entperiod.KindValidator)
		if !ok {
			return
		}
		create = create.SetKind(kind)
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entperiod.FieldStatus, *in.Status, entperiod.StatusValidator)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetablePeriodNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/periods/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updatePeriod(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in periodPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entperiod.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "period", entperiod.FieldPeriodSchemeID) {
		return
	}
	if in.Name != nil && !withinRunes(w, entperiod.FieldName, *in.Name, periodNameRunes) {
		return
	}
	if in.Code != nil && !withinRunes(w, entperiod.FieldCode, *in.Code, timetableCodeRunes) {
		return
	}
	if in.Sequence != nil && *in.Sequence < 0 {
		response.Error(w, http.StatusBadRequest, "sequence must not be negative")
		return
	}

	update := client.Period.Update().
		Where(entperiod.ID(id), access.PeriodsWritableBy(viewer, decision)).
		SetNillableName(in.Name).
		SetNillableCode(in.Code).
		SetNillableSequence(in.Sequence)

	if in.Kind != nil {
		kind, ok := timetableEnum(w, entperiod.FieldKind, *in.Kind, entperiod.KindValidator)
		if !ok {
			return
		}
		update = update.SetKind(kind)
	}
	if in.Status != nil {
		status, ok := timetableEnum(w, entperiod.FieldStatus, *in.Status, entperiod.StatusValidator)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, timetablePeriodNotFound) {
		return
	}

	row, err := client.Period.Query().Where(entperiod.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetablePeriodNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deletePeriod(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetablePeriodNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.Period.Delete().
				Where(entperiod.ID(id), access.PeriodsWritableBy(v, d)).
				Exec(ctx)
		})
}

type bellSchedulePayload struct {
	Name      *string `json:"name"`
	Code      *string `json:"code"`
	IsDefault *bool   `json:"is_default"`
	Status    *string `json:"status"`
}

func (s *Server) listBellSchedules(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	p := filter.New(r.URL.Query())
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	status := p.Enum("status", func(v string) error {
		return entbell.StatusValidator(entbell.Status(v))
	})
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.PeriodScheme.Query().
		Where(entscheme.ID(id), access.PeriodSchemesFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableSchemeNotFound) {
		return
	}

	q := client.BellSchedule.Query().
		Where(entbell.PeriodSchemeID(id), access.BellSchedulesFor(viewer, decision))
	if status != nil {
		q = q.Where(entbell.StatusEQ(entbell.Status(*status)))
	}

	rows, err := q.Limit(limit).Offset(offset).
		Order(tenantent.Asc(entbell.FieldCode), tenantent.Asc(entbell.FieldID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"bell_schedules": projected,
		"count":          len(rows),
		"page":           pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) getBellSchedule(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.BellSchedule.Query().
		Where(entbell.ID(id), access.BellSchedulesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableBellNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createBellSchedule(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in bellSchedulePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entbell.Columns, sent) {
		return
	}
	if !rejectFromPath(w, sent, entbell.FieldPeriodSchemeID) {
		return
	}

	found, err := client.PeriodScheme.Query().
		Where(entscheme.ID(id), access.PeriodSchemesWritableBy(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableSchemeNotFound) {
		return
	}

	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}
	if !withinRunes(w, entbell.FieldName, *in.Name, timetableNameRunes) ||
		!withinRunes(w, entbell.FieldCode, *in.Code, timetableCodeRunes) {
		return
	}

	create := client.BellSchedule.Create().
		SetPeriodSchemeID(id).
		SetName(*in.Name).
		SetCode(*in.Code).
		SetNillableIsDefault(in.IsDefault)

	if in.Status != nil {
		status, ok := timetableEnum(w, entbell.FieldStatus, *in.Status, entbell.StatusValidator)
		if !ok {
			return
		}
		create = create.SetStatus(status)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableBellNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/bell-schedules/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateBellSchedule(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in bellSchedulePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entbell.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "bell schedule", entbell.FieldPeriodSchemeID) {
		return
	}
	if in.Name != nil && !withinRunes(w, entbell.FieldName, *in.Name, timetableNameRunes) {
		return
	}
	if in.Code != nil && !withinRunes(w, entbell.FieldCode, *in.Code, timetableCodeRunes) {
		return
	}

	update := client.BellSchedule.Update().
		Where(entbell.ID(id), access.BellSchedulesWritableBy(viewer, decision)).
		SetNillableName(in.Name).
		SetNillableCode(in.Code).
		SetNillableIsDefault(in.IsDefault)

	if in.Status != nil {
		status, ok := timetableEnum(w, entbell.FieldStatus, *in.Status, entbell.StatusValidator)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, timetableBellNotFound) {
		return
	}

	row, err := client.BellSchedule.Query().Where(entbell.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableBellNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteBellSchedule(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableBellNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.BellSchedule.Delete().
				Where(entbell.ID(id), access.BellSchedulesWritableBy(v, d)).
				Exec(ctx)
		})
}

type bellSchedulePeriodPayload struct {
	PeriodID    *uuid.UUID `json:"period_id"`
	StartMinute *int       `json:"start_minute"`
	EndMinute   *int       `json:"end_minute"`
	Runs        *bool      `json:"runs"`
}

func bellSpanValid(w http.ResponseWriter, start, end *int) bool {
	if start == nil || end == nil {
		response.Error(w, http.StatusBadRequest, "start_minute and end_minute are required")
		return false
	}
	if *start < 0 || *end > minutesInDay || *end <= *start {
		response.Error(w, http.StatusUnprocessableEntity,
			"start_minute and end_minute must describe a span inside the day")
		return false
	}
	return true
}

func bellSpanChanged(w http.ResponseWriter, sent []string, start, end *int) (bool, bool) {
	if !rejectNull(w, sent, entbellperiod.FieldStartMinute, start) ||
		!rejectNull(w, sent, entbellperiod.FieldEndMinute, end) {
		return false, false
	}
	if start == nil && end == nil {
		return false, true
	}
	if !bellSpanValid(w, start, end) {
		return false, false
	}
	return true, true
}

func (s *Server) listBellSchedulePeriods(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	p := filter.New(r.URL.Query())
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.BellSchedule.Query().
		Where(entbell.ID(id), access.BellSchedulesFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableBellNotFound) {
		return
	}

	rows, err := client.BellSchedulePeriod.Query().
		Where(
			entbellperiod.BellScheduleID(id),
			entbellperiod.HasBellScheduleWith(access.BellSchedulesFor(viewer, decision)),
		).
		Limit(limit).Offset(offset).
		Order(
			tenantent.Asc(entbellperiod.FieldStartMinute),
			tenantent.Asc(entbellperiod.FieldID),
		).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"bell_schedule_periods": projected,
		"count":                 len(rows),
		"page":                  pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) createBellSchedulePeriod(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in bellSchedulePeriodPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entbellperiod.Columns, sent) {
		return
	}
	if !rejectFromPath(w, sent, entbellperiod.FieldBellScheduleID) {
		return
	}

	found, err := client.BellSchedule.Query().
		Where(entbell.ID(id), access.BellSchedulesWritableBy(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableBellNotFound) {
		return
	}

	if in.PeriodID == nil {
		response.Error(w, http.StatusBadRequest, "period_id is required")
		return
	}
	if !bellSpanValid(w, in.StartMinute, in.EndMinute) {
		return
	}

	create := client.BellSchedulePeriod.Create().
		SetBellScheduleID(id).
		SetPeriodID(*in.PeriodID).
		SetStartMinute(*in.StartMinute).
		SetEndMinute(*in.EndMinute)
	if in.Runs != nil {
		create = create.SetRuns(*in.Runs)
	}
	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableBellSpanMissing)
		return
	}
	w.Header().Set("Location", "/api/v1/bell-schedule-periods/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateBellSchedulePeriod(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in bellSchedulePeriodPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entbellperiod.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "bell schedule period",
		entbellperiod.FieldBellScheduleID, entbellperiod.FieldPeriodID) {
		return
	}
	respan, ok := bellSpanChanged(w, sent, in.StartMinute, in.EndMinute)
	if !ok {
		return
	}

	update := client.BellSchedulePeriod.Update().
		Where(
			entbellperiod.ID(id),
			entbellperiod.HasBellScheduleWith(access.BellSchedulesWritableBy(viewer, decision)),
		)
	if respan {
		update = update.SetStartMinute(*in.StartMinute).SetEndMinute(*in.EndMinute)
	}
	if in.Runs != nil {
		update = update.SetRuns(*in.Runs)
	}
	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, timetableBellSpanMissing) {
		return
	}

	row, err := client.BellSchedulePeriod.Query().Where(entbellperiod.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableBellSpanMissing)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteBellSchedulePeriod(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableBellSpanMissing,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.BellSchedulePeriod.Delete().
				Where(
					entbellperiod.ID(id),
					entbellperiod.HasBellScheduleWith(access.BellSchedulesWritableBy(v, d)),
				).
				Exec(ctx)
		})
}

type calendarDayPayload struct {
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	BranchID          *uuid.UUID `json:"branch_id"`
	CalendarDate      *string    `json:"calendar_date"`
	DayType           *string    `json:"day_type"`
	ForenoonOpen      *bool      `json:"forenoon_open"`
	AfternoonOpen     *bool      `json:"afternoon_open"`
	Name              *string    `json:"name"`
	Notes             *string    `json:"notes"`

	SubstituteDayOfWeek *int `json:"substitute_day_of_week"`
}

type calendarDayFilters struct {
	AcademicSessionID *uuid.UUID
	BranchID          *uuid.UUID
	DayType           *entcalendarday.DayType
	From              *time.Time
	To                *time.Time

	Limit  int
	Offset int
}

func parseCalendarDayFilters(values url.Values) (calendarDayFilters, error) {
	p := filter.New(values)

	var failed error
	f := calendarDayFilters{
		AcademicSessionID: p.UUID("academic_session_id"),
		BranchID:          p.UUID("branch_id"),
		From:              timetableQueryDate(p, "from", &failed),
		To:                timetableQueryDate(p, "to", &failed),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("day_type", func(v string) error {
		return entcalendarday.DayTypeValidator(entcalendarday.DayType(v))
	}); raw != nil {
		dayType := entcalendarday.DayType(*raw)
		f.DayType = &dayType
	}

	if err := p.Err(); err != nil {
		return calendarDayFilters{}, err
	}
	if failed != nil {
		return calendarDayFilters{}, failed
	}
	if f.From != nil && f.To != nil && f.To.Before(*f.From) {
		return calendarDayFilters{}, &filter.Error{Param: "to", Reason: "must not precede from"}
	}
	return f, nil
}

func (f calendarDayFilters) apply(q *tenantent.CalendarDayQuery) *tenantent.CalendarDayQuery {
	if f.AcademicSessionID != nil {
		q = q.Where(entcalendarday.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.BranchID != nil {
		q = q.Where(entcalendarday.BranchID(*f.BranchID))
	}
	if f.DayType != nil {
		q = q.Where(entcalendarday.DayTypeEQ(*f.DayType))
	}
	if f.From != nil {
		q = q.Where(entcalendarday.CalendarDateGTE(*f.From))
	}
	if f.To != nil {
		q = q.Where(entcalendarday.CalendarDateLTE(*f.To))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) listCalendarDays(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseCalendarDayFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.CalendarRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := filters.apply(client.CalendarDay.Query().
		Where(access.CalendarDaysFor(viewer, decision))).
		Order(
			tenantent.Asc(entcalendarday.FieldCalendarDate),
			tenantent.Asc(entcalendarday.FieldID),
		).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"calendar_days": projected,
		"count":         len(rows),
		"page":          pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getCalendarDay(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.CalendarRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.CalendarDay.Query().
		Where(entcalendarday.ID(id), access.CalendarDaysFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDayNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createCalendarDay(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in calendarDayPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.CalendarWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entcalendarday.Columns, sent) {
		return
	}
	if !dayShapeWritable(w, viewer, decision, "calendar day", authorization.CalendarWrite) {
		return
	}

	on, err := parseDate(in.CalendarDate)
	if err != nil || on == nil {
		response.Error(w, http.StatusBadRequest, "calendar_date is required as "+dateLayout)
		return
	}
	if in.AcademicSessionID == nil || in.BranchID == nil {
		response.Error(w, http.StatusBadRequest, "academic_session_id and branch_id are required")
		return
	}
	if in.Name != nil && !withinRunes(w, entcalendarday.FieldName, *in.Name, calendarNameRunes) {
		return
	}

	if !dayOfWeekWithinWeek(w, in.SubstituteDayOfWeek, false) {
		return
	}

	create := client.CalendarDay.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetBranchID(*in.BranchID).
		SetCalendarDate(*on).
		SetNillableForenoonOpen(in.ForenoonOpen).
		SetNillableAfternoonOpen(in.AfternoonOpen).
		SetNillableName(in.Name).
		SetNillableNotes(in.Notes).
		SetNillableSubstituteDayOfWeek(in.SubstituteDayOfWeek)

	if in.DayType != nil {
		dayType, ok := timetableEnum(w, entcalendarday.FieldDayType, *in.DayType,
			entcalendarday.DayTypeValidator)
		if !ok {
			return
		}
		create = create.SetDayType(dayType)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDayNotFound)
		return
	}
	w.Header().Set("Location", "/api/v1/calendar-days/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateCalendarDay(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in calendarDayPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.CalendarWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entcalendarday.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "calendar day",
		entcalendarday.FieldAcademicSessionID, entcalendarday.FieldBranchID,
		entcalendarday.FieldCalendarDate) {
		return
	}
	if in.Name != nil && !withinRunes(w, entcalendarday.FieldName, *in.Name, calendarNameRunes) {
		return
	}

	if !dayOfWeekWithinWeek(w, in.SubstituteDayOfWeek, false) {
		return
	}

	update := client.CalendarDay.Update().
		Where(entcalendarday.ID(id), access.CalendarDaysWritableBy(viewer, decision)).
		SetNillableForenoonOpen(in.ForenoonOpen).
		SetNillableAfternoonOpen(in.AfternoonOpen).
		SetNillableName(in.Name).
		SetNillableNotes(in.Notes).
		SetNillableSubstituteDayOfWeek(in.SubstituteDayOfWeek)

	if in.Name == nil && wasSent(sent, entcalendarday.FieldName) {
		update = update.ClearName()
	}
	if in.SubstituteDayOfWeek == nil && wasSent(sent, entcalendarday.FieldSubstituteDayOfWeek) {
		update = update.ClearSubstituteDayOfWeek()
	}
	if in.Notes == nil && wasSent(sent, entcalendarday.FieldNotes) {
		update = update.ClearNotes()
	}
	if in.DayType != nil {
		dayType, ok := timetableEnum(w, entcalendarday.FieldDayType, *in.DayType,
			entcalendarday.DayTypeValidator)
		if !ok {
			return
		}
		update = update.SetDayType(dayType)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, timetableDayNotFound) {
		return
	}

	row, err := client.CalendarDay.Query().Where(entcalendarday.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDayNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteCalendarDay(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableDayNotFound,
		authorization.CalendarDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.CalendarDay.Delete().
				Where(entcalendarday.ID(id), access.CalendarDaysWritableBy(v, d)).
				Exec(ctx)
		})
}

type calendarDaySchedulePayload struct {
	PeriodSchemeID *uuid.UUID `json:"period_scheme_id"`
	BellScheduleID *uuid.UUID `json:"bell_schedule_id"`
	CalendarDayID  *uuid.UUID `json:"calendar_day_id"`
}

func (s *Server) listCalendarDaySchedules(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	p := filter.New(r.URL.Query())
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.CalendarRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.CalendarDay.Query().
		Where(entcalendarday.ID(id), access.CalendarDaysFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableDayNotFound) {
		return
	}

	rows, err := client.CalendarDaySchedule.Query().
		Where(
			entdayschedule.CalendarDayID(id),
			entdayschedule.HasCalendarDayWith(access.CalendarDaysFor(viewer, decision)),
		).
		Limit(limit).Offset(offset).
		Order(tenantent.Asc(entdayschedule.FieldID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"calendar_day_schedules": projected,
		"count":                  len(rows),
		"page":                   pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) createCalendarDaySchedule(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in calendarDaySchedulePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.CalendarWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entdayschedule.Columns, sent) {
		return
	}
	if !rejectFromPath(w, sent, entdayschedule.FieldCalendarDayID) {
		return
	}

	found, err := client.CalendarDay.Query().
		Where(entcalendarday.ID(id), access.CalendarDaysWritableBy(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableDayNotFound) {
		return
	}

	if in.PeriodSchemeID == nil || in.BellScheduleID == nil {
		response.Error(w, http.StatusBadRequest,
			"period_scheme_id and bell_schedule_id are required")
		return
	}

	row, err := client.CalendarDaySchedule.Create().
		SetCalendarDayID(id).
		SetPeriodSchemeID(*in.PeriodSchemeID).
		SetBellScheduleID(*in.BellScheduleID).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDayScheduleGone)
		return
	}
	w.Header().Set("Location", "/api/v1/calendar-day-schedules/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateCalendarDaySchedule(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in calendarDaySchedulePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.CalendarWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entdayschedule.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "calendar day schedule",
		entdayschedule.FieldCalendarDayID, entdayschedule.FieldPeriodSchemeID) {
		return
	}
	if in.BellScheduleID == nil {
		response.Error(w, http.StatusBadRequest, "bell_schedule_id is required")
		return
	}

	n, err := client.CalendarDaySchedule.Update().
		Where(
			entdayschedule.ID(id),
			entdayschedule.HasCalendarDayWith(access.CalendarDaysWritableBy(viewer, decision)),
		).
		SetBellScheduleID(*in.BellScheduleID).
		Save(ctx)
	if !wroteScopedRow(w, n, err, timetableDayScheduleGone) {
		return
	}

	row, err := client.CalendarDaySchedule.Query().Where(entdayschedule.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDayScheduleGone)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteCalendarDaySchedule(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableDayScheduleGone,
		authorization.CalendarDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.CalendarDaySchedule.Delete().
				Where(
					entdayschedule.ID(id),
					entdayschedule.HasCalendarDayWith(access.CalendarDaysWritableBy(v, d)),
				).
				Exec(ctx)
		})
}
