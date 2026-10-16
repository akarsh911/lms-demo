package http

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entdayschedule "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendardayschedule"
	entsitting "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsitting"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const sectionCalendarNotFound = "section not found"

type sectionCalendarQuery struct {
	From time.Time
	To   time.Time
}

func parseSectionCalendarQuery(values url.Values) (sectionCalendarQuery, error) {
	p := filter.New(values)

	var failed error
	from := timetableQueryDate(p, "from", &failed)
	to := timetableQueryDate(p, "to", &failed)

	if err := p.Err(); err != nil {
		return sectionCalendarQuery{}, err
	}
	if failed != nil {
		return sectionCalendarQuery{}, failed
	}
	if from == nil || to == nil {
		return sectionCalendarQuery{}, &filter.Error{Param: "from", Reason: "and to are required"}
	}

	lo, hi := timetablesvc.Day(*from), timetablesvc.Day(*to)
	if hi.Before(lo) {
		return sectionCalendarQuery{}, &filter.Error{Param: "to", Reason: "precedes from"}
	}
	if spanDays(lo, hi) > timetablesvc.MaxRangeDays {
		return sectionCalendarQuery{}, &filter.Error{
			Param:  "to",
			Reason: "may not be more than " + strconv.Itoa(timetablesvc.MaxRangeDays) + " days after from",
		}
	}
	return sectionCalendarQuery{From: lo, To: hi}, nil
}

func spanDays(lo, hi time.Time) int {
	return int(hi.Sub(lo).Hours()/24) + 1
}

func sectionCalendarUnfiltered(v *access.Viewer, d authorization.Decision) bool {
	if v == nil {
		return false
	}
	if v.Unrestricted {
		return true
	}
	return d.HasReach && d.Reach == authorization.ReachTenant && len(d.Constraints) == 0
}

func sectionCalendarReachable(ctx context.Context, client *tenantent.Client, section uuid.UUID,
	v *access.Viewer, d authorization.Decision) (bool, error) {
	if sectionCalendarUnfiltered(v, d) {
		return true, nil
	}

	lesson, err := client.TimetableSlot.Query().
		Where(entslot.SectionIDEQ(section), access.TimetableSlotsFor(v, d)).
		Exist(ctx)
	if err != nil || lesson {
		return lesson, err
	}

	return client.TimetableDeviation.Query().
		Where(
			entdeviation.Or(
				entdeviation.SectionIDEQ(section),
				entdeviation.HasTimetableSlotWith(entslot.SectionIDEQ(section)),
			),
			access.TimetableDeviationsFor(v, d),
		).
		Exist(ctx)
}

type sectionCalendarSchedule struct {
	PeriodSchemeID uuid.UUID `json:"period_scheme_id"`
	BellScheduleID uuid.UUID `json:"bell_schedule_id"`
}

type sectionCalendarDay struct {
	Date          string                    `json:"date"`
	DayOfWeek     int                       `json:"day_of_week"`
	InSession     *bool                     `json:"in_session"`
	CalendarDayID *uuid.UUID                `json:"calendar_day_id"`
	DayType       string                    `json:"day_type,omitempty"`
	Name          *string                   `json:"name,omitempty"`
	ForenoonOpen  *bool                     `json:"forenoon_open"`
	AfternoonOpen *bool                     `json:"afternoon_open"`
	Schedules     []sectionCalendarSchedule `json:"schedules"`
	Lessons       any                       `json:"lessons"`
	Sittings      any                       `json:"exam_sittings"`
}

func (s *Server) getSectionCalendar(w http.ResponseWriter, r *http.Request) {
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
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	q, err := parseSectionCalendarQuery(r.URL.Query())
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

	section, err := client.Section.Query().Where(entsection.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, sectionCalendarNotFound)
		return
	}

	reachable, err := sectionCalendarReachable(ctx, client, id, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !reachable {
		response.Error(w, http.StatusNotFound, sectionCalendarNotFound)
		return
	}

	days, err := service.Calendar(ctx, section.BranchID, q.From, q.To, timetablesvc.HalfAny)
	if err != nil {
		writeTimetableServiceErr(w, err, timetableDayNotFound)
		return
	}
	readable, err := readableCalendarDayIDs(ctx, client, section.BranchID, q.From, q.To, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	lens := occurrenceThrough(entslot.SectionIDEQ(id), entdeviation.SectionIDEQ(id))
	lessons, err := service.Resolve(ctx, timetablesvc.ResolveQuery{
		BranchID: section.BranchID,
		From:     q.From,
		To:       q.To,
		Half:     timetablesvc.HalfAny,
		Slots: []predicate.TimetableSlot{
			access.TimetableSlotsFor(viewer, decision), lens.slot,
		},
		Deviations: []predicate.TimetableDeviation{
			access.TimetableDeviationsFor(viewer, decision), lens.dev,
		},
	})
	if err != nil {
		writeTimetableServiceErr(w, err, timetableNotFound)
		return
	}

	readableIDs := make([]uuid.UUID, 0, len(days))
	for _, day := range days {
		if readable[day.ID] {
			readableIDs = append(readableIDs, day.ID)
		}
	}

	sittings, err := sectionCalendarSittings(ctx, client, id, readableIDs, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	schedules, err := sectionCalendarSchedules(ctx, client, readableIDs)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	out, err := sectionCalendarDays(q, days, readable, lessons, sittings, schedules, decision)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(lessons)+len(sittings))

	response.JSON(w, http.StatusOK, response.Envelope{
		"section_id":         id,
		"branch_id":          section.BranchID,
		"from":               q.From.Format(dateLayout),
		"to":                 q.To.Format(dateLayout),
		"days":               out,
		"count":              len(out),
		"lesson_count":       len(lessons),
		"exam_sitting_count": len(sittings),
	})
}

func sectionCalendarSittings(ctx context.Context, client *tenantent.Client, section uuid.UUID,
	dayIDs []uuid.UUID, v *access.Viewer, d authorization.Decision) ([]*tenantent.ExamSitting, error) {
	if len(dayIDs) == 0 {
		return nil, nil
	}
	return client.ExamSitting.Query().
		Where(append(examSittingScope(v, d),
			entsitting.SectionIDEQ(section),
			entsitting.CalendarDayIDIn(dayIDs...))...).
		Order(tenantent.Asc(entsitting.FieldCalendarDayID), tenantent.Asc(entsitting.FieldID)).
		All(ctx)
}

func sectionCalendarSchedules(ctx context.Context, client *tenantent.Client,
	dayIDs []uuid.UUID) ([]*tenantent.CalendarDaySchedule, error) {
	if len(dayIDs) == 0 {
		return nil, nil
	}
	return client.CalendarDaySchedule.Query().
		Where(entdayschedule.CalendarDayIDIn(dayIDs...)).
		All(ctx)
}

func sectionCalendarDays(q sectionCalendarQuery, days []timetablesvc.SessionDay,
	readable map[uuid.UUID]bool, lessons []timetablesvc.Occurrence,
	sittings []*tenantent.ExamSitting, schedules []*tenantent.CalendarDaySchedule,
	decision authorization.Decision) ([]sectionCalendarDay, error) {
	dayByDate := make(map[string]timetablesvc.SessionDay, len(days))
	dateOfDay := make(map[uuid.UUID]string, len(days))
	for _, day := range days {
		key := day.Date.Format(dateLayout)
		dayByDate[key] = day
		dateOfDay[day.ID] = key
	}

	lessonsByDate := map[string][]timetablesvc.Occurrence{}
	for _, lesson := range lessons {
		key := lesson.Date.Format(dateLayout)
		lessonsByDate[key] = append(lessonsByDate[key], lesson)
	}

	sittingsByDate := map[string][]*tenantent.ExamSitting{}
	for _, sitting := range sittings {
		key := dateOfDay[sitting.CalendarDayID]
		sittingsByDate[key] = append(sittingsByDate[key], sitting)
	}

	schedulesByDate := map[string][]sectionCalendarSchedule{}
	for _, sched := range schedules {
		key := dateOfDay[sched.CalendarDayID]
		schedulesByDate[key] = append(schedulesByDate[key], sectionCalendarSchedule{
			PeriodSchemeID: sched.PeriodSchemeID,
			BellScheduleID: sched.BellScheduleID,
		})
	}

	out := make([]sectionCalendarDay, 0, spanDays(q.From, q.To))
	for date := q.From; !date.After(q.To); date = date.AddDate(0, 0, 1) {
		key := date.Format(dateLayout)

		entry := sectionCalendarDay{
			Date:      key,
			DayOfWeek: timetablesvc.ISODayOfWeek(date),
			Schedules: schedulesByDate[key],
		}
		if entry.Schedules == nil {
			entry.Schedules = []sectionCalendarSchedule{}
		}

		if day, known := dayByDate[key]; !known {
			closed := false
			entry.InSession = &closed
		} else if readable[day.ID] {
			open := day.Open(timetablesvc.HalfAny)
			forenoon, afternoon := day.ForenoonOpen, day.AfternoonOpen
			dayID := day.ID
			entry.InSession = &open
			entry.CalendarDayID = &dayID
			entry.DayType = day.DayType
			entry.Name = day.Name
			entry.ForenoonOpen = &forenoon
			entry.AfternoonOpen = &afternoon
		}

		onDate := lessonsByDate[key]
		if onDate == nil {
			onDate = []timetablesvc.Occurrence{}
		}
		sat := sittingsByDate[key]
		if sat == nil {
			sat = []*tenantent.ExamSitting{}
		}

		projectedLessons, err := projectAll(onDate, decision.Fields)
		if err != nil {
			return nil, err
		}
		projectedSittings, err := projectAll(sat, decision.Fields)
		if err != nil {
			return nil, err
		}
		entry.Lessons = projectedLessons
		entry.Sittings = projectedSittings

		out = append(out, entry)
	}
	return out, nil
}
