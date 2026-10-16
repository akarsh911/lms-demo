package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entdaypattern "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendardaysectionpattern"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entcover "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetablesection"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	timetableCoverNotFound   = "timetable section not found"
	timetableDayPatternGone  = "calendar day section pattern not found"
	timetablePublishConflict = "timetable_publish_conflict"
	timetableCoverConflict   = "timetable_cover_conflict"
)

type timetablePublishPayload struct {
	SupersedesID *uuid.UUID `json:"supersedes_id"`
	PublishedBy  *uuid.UUID `json:"published_by"`
}

func (s *Server) publishTimetable(w http.ResponseWriter, r *http.Request) {
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

	var in timetablePublishPayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.Timetable.Query().
		Where(enttimetable.ID(id), access.TimetablesWritableBy(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableNotFound) {
		return
	}
	if !timetableWriteUnfiltered(viewer, decision) {
		response.Error(w, http.StatusForbidden,
			"publishing puts every section this timetable covers in force, and your grant of "+
				string(authorization.TimetableWrite)+" does not reach all of them")
		return
	}

	publisher, ok := attributedToOptional(w, viewer, in.PublishedBy, enttimetable.FieldPublishedBy)
	if !ok {
		return
	}

	uow, err := begin(ctx, client)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	defer uow.rollback()

	row, err := timetablesvc.New(uow.writer).Publish(ctx, timetablesvc.PublishRequest{
		TimetableID:  id,
		SupersedesID: in.SupersedesID,
		PublishedBy:  publisher,
		Now:          nowUTC(),
	})
	if err != nil {
		writeTimetablePublishErr(w, err)
		return
	}
	if err := uow.commit(); err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func writeTimetablePublishErr(w http.ResponseWriter, err error) {
	var clash *timetablesvc.PublishConflictError
	if errors.As(err, &clash) {
		writePublishConflict(w, timetablePublishConflict, clash.Error(), clash.Conflicts)
		return
	}

	switch {
	case errors.Is(err, timetablesvc.ErrNotFound):
		response.Error(w, http.StatusNotFound, timetableNotFound)
	case errors.Is(err, timetablesvc.ErrSupersedesUnknown):
		response.Error(w, http.StatusNotFound, err.Error())
	case errors.Is(err, timetablesvc.ErrAlreadyPublished):
		response.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, timetablesvc.ErrPublishRetired),
		errors.Is(err, timetablesvc.ErrPublishCoversNothing),
		errors.Is(err, timetablesvc.ErrSupersedesSelf),
		errors.Is(err, timetablesvc.ErrSupersedesScheme),
		errors.Is(err, timetablesvc.ErrSupersedesUnpublished),
		errors.Is(err, timetablesvc.ErrSupersedesNotEarlier):
		response.Error(w, http.StatusUnprocessableEntity, err.Error())
	default:
		writeTimetableServiceErr(w, err, timetableNotFound)
	}
}

func writePublishConflict(w http.ResponseWriter, code, message string,
	conflicts []timetablesvc.PublishConflict) {

	response.JSON(w, http.StatusConflict, response.Envelope{
		"error":     http.StatusText(http.StatusConflict),
		"message":   message,
		"code":      code,
		"conflicts": conflicts,
		"count":     len(conflicts),
	})
}

type timetableCoverPayload struct {
	SectionIDs []uuid.UUID `json:"section_ids"`
}

func (s *Server) listTimetableSections(w http.ResponseWriter, r *http.Request) {
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

	found, err := client.Timetable.Query().
		Where(enttimetable.ID(id), access.TimetablesFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, timetableNotFound) {
		return
	}

	rows, err := client.TimetableSection.Query().
		Where(entcover.TimetableID(id)).
		Limit(limit).Offset(offset).
		Order(tenantent.Asc(entcover.FieldSectionID)).
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
		"timetable_sections": projected,
		"count":              len(rows),
		"page":               pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) attachTimetableSections(w http.ResponseWriter, r *http.Request) {
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

	var in timetableCoverPayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if len(in.SectionIDs) == 0 {
		response.Error(w, http.StatusBadRequest, "section_ids is required")
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !timetableWriteUnfiltered(viewer, decision) {
		response.Error(w, http.StatusForbidden,
			"widening what a timetable covers needs a grant of "+
				string(authorization.TimetableWrite)+" that reaches the whole school")
		return
	}

	target, err := client.Timetable.Query().
		Where(enttimetable.ID(id), access.TimetablesWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}

	wanted := dedupeIDs(in.SectionIDs)
	if !s.sectionsBelongToScheme(ctx, w, client, target, wanted) {
		return
	}
	if !s.coverStaysExclusive(ctx, w, client, target, wanted) {
		return
	}

	created, err := linkTimetableSections(ctx, client, target.ID, wanted)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}

	response.JSON(w, http.StatusCreated, response.Envelope{
		"attached": created,
		"count":    created,
	})
}

func (s *Server) sectionsBelongToScheme(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, target *tenantent.Timetable, sections []uuid.UUID) bool {

	scheme, err := client.PeriodScheme.Get(ctx, target.PeriodSchemeID)
	if err != nil {
		writeTenantEntErr(w, err, timetableSchemeNotFound)
		return false
	}

	reachable, err := client.Section.Query().
		Where(
			entsection.IDIn(sections...),
			entsection.BranchID(scheme.BranchID),
			entsection.AcademicSessionID(target.AcademicSessionID),
		).
		IDs(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if len(reachable) != len(sections) {
		response.Error(w, http.StatusUnprocessableEntity,
			"a timetable may only cover sections of its own campus and academic session")
		return false
	}
	return true
}

func (s *Server) coverStaysExclusive(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, target *tenantent.Timetable, sections []uuid.UUID) bool {

	if target.Status != enttimetable.StatusPublished {
		return true
	}

	conflicts, err := timetablesvc.New(client).CoverConflicts(ctx, target.ID, sections)
	if err != nil {
		writeTimetableServiceErr(w, err, timetableNotFound)
		return false
	}
	if len(conflicts) == 0 {
		return true
	}

	writePublishConflict(w, timetableCoverConflict,
		"these sections already sit under another published timetable over the same dates",
		conflicts)
	return false
}

func linkTimetableSections(ctx context.Context, client *tenantent.Client,
	timetableID uuid.UUID, sections []uuid.UUID) (int, error) {

	rows, err := client.TimetableSection.Query().
		Where(entcover.TimetableID(timetableID), entcover.SectionIDIn(sections...)).
		All(ctx)
	if err != nil {
		return 0, err
	}
	held := make(map[uuid.UUID]bool, len(rows))
	for _, row := range rows {
		held[row.SectionID] = true
	}

	builders := make([]*tenantent.TimetableSectionCreate, 0, len(sections))
	for _, section := range sections {
		if held[section] {
			continue
		}
		builders = append(builders, client.TimetableSection.Create().
			SetTimetableID(timetableID).
			SetSectionID(section))
	}
	if len(builders) == 0 {
		return 0, nil
	}
	if err := client.TimetableSection.CreateBulk(builders...).Exec(ctx); err != nil {
		return 0, err
	}
	return len(builders), nil
}

func (s *Server) detachTimetableSection(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableCoverNotFound,
		authorization.TimetableDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.TimetableSection.Delete().
				Where(
					entcover.ID(id),
					entcover.HasTimetableWith(access.TimetablesWritableBy(v, d)),
				).
				Exec(ctx)
		})
}

type calendarDayPatternPayload struct {
	SectionID           *uuid.UUID `json:"section_id"`
	SubstituteDayOfWeek *int       `json:"substitute_day_of_week"`
	CalendarDayID       *uuid.UUID `json:"calendar_day_id"`
}

func (s *Server) listCalendarDaySectionPatterns(w http.ResponseWriter, r *http.Request) {
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

	rows, err := client.CalendarDaySectionPattern.Query().
		Where(entdaypattern.CalendarDayID(id)).
		Limit(limit).Offset(offset).
		Order(tenantent.Asc(entdaypattern.FieldSectionID)).
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
		"calendar_day_section_patterns": projected,
		"count":                         len(rows),
		"page":                          pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) createCalendarDaySectionPattern(w http.ResponseWriter, r *http.Request) {
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

	var in calendarDayPatternPayload
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
	if !rejectUnauthorizedFields(w, r, decision, entdaypattern.Columns, sent) {
		return
	}
	if !rejectFromPath(w, sent, entdaypattern.FieldCalendarDayID) {
		return
	}
	if in.SectionID == nil {
		response.Error(w, http.StatusBadRequest, "section_id is required")
		return
	}
	if !dayOfWeekWithinWeek(w, in.SubstituteDayOfWeek, true) {
		return
	}

	day, err := client.CalendarDay.Query().
		Where(entcalendarday.ID(id), access.CalendarDaysWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDayNotFound)
		return
	}

	within, err := client.Section.Query().
		Where(entsection.ID(*in.SectionID), entsection.BranchID(day.BranchID)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !within {
		response.Error(w, http.StatusUnprocessableEntity,
			"a calendar day runs on one campus, so only that campus's sections may take a pattern from it")
		return
	}

	row, err := client.CalendarDaySectionPattern.Create().
		SetCalendarDayID(id).
		SetSectionID(*in.SectionID).
		SetSubstituteDayOfWeek(*in.SubstituteDayOfWeek).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDayPatternGone)
		return
	}
	w.Header().Set("Location", "/api/v1/calendar-day-section-patterns/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateCalendarDaySectionPattern(w http.ResponseWriter, r *http.Request) {
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

	var in calendarDayPatternPayload
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
	if !rejectUnauthorizedFields(w, r, decision, entdaypattern.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "calendar day section pattern",
		entdaypattern.FieldCalendarDayID, entdaypattern.FieldSectionID) {
		return
	}
	if !dayOfWeekWithinWeek(w, in.SubstituteDayOfWeek, true) {
		return
	}

	n, err := client.CalendarDaySectionPattern.Update().
		Where(
			entdaypattern.ID(id),
			entdaypattern.HasCalendarDayWith(access.CalendarDaysWritableBy(viewer, decision)),
		).
		SetSubstituteDayOfWeek(*in.SubstituteDayOfWeek).
		Save(ctx)
	if !wroteScopedRow(w, n, err, timetableDayPatternGone) {
		return
	}

	row, err := client.CalendarDaySectionPattern.Query().Where(entdaypattern.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableDayPatternGone)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteCalendarDaySectionPattern(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, timetableDayPatternGone,
		authorization.CalendarDelete, authorization.TimetableDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.CalendarDaySectionPattern.Delete().
				Where(
					entdaypattern.ID(id),
					entdaypattern.HasCalendarDayWith(access.CalendarDaysWritableBy(v, d)),
				).
				Exec(ctx)
		})
}

func dayOfWeekWithinWeek(w http.ResponseWriter, value *int, required bool) bool {
	if value == nil {
		if required {
			response.Error(w, http.StatusBadRequest, "substitute_day_of_week is required")
			return false
		}
		return true
	}
	if *value < 1 || *value > 7 {
		response.Error(w, http.StatusUnprocessableEntity,
			"substitute_day_of_week must be 1 (Monday) through 7 (Sunday)")
		return false
	}
	return true
}
