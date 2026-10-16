package http

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	mw "github.com/Harbour-Emerge/emerge-core/internal/transport/http/middleware"
)

const sectionCalendarPattern = "/api/v1/sections/{id}/calendar"

type sectionCalendarLessonRow struct {
	SectionID                uuid.UUID  `json:"section_id"`
	PeriodID                 uuid.UUID  `json:"period_id"`
	SubjectOfferingID        *uuid.UUID `json:"subject_offering_id"`
	PlannedSubjectOfferingID *uuid.UUID `json:"planned_subject_offering_id"`
	State                    string     `json:"state"`
	Date                     string     `json:"date"`
	SlotID                   *uuid.UUID `json:"timetable_slot_id"`
	DeviationID              *uuid.UUID `json:"timetable_deviation_id"`
}

type sectionCalendarSittingRow struct {
	ID        uuid.UUID `json:"id"`
	SectionID uuid.UUID `json:"section_id"`
	PeriodID  uuid.UUID `json:"period_id"`
}

type sectionCalendarDayRow struct {
	Date          string                      `json:"date"`
	DayOfWeek     int                         `json:"day_of_week"`
	InSession     *bool                       `json:"in_session"`
	CalendarDayID *uuid.UUID                  `json:"calendar_day_id"`
	DayType       string                      `json:"day_type"`
	Schedules     []sectionCalendarSchedule   `json:"schedules"`
	Lessons       []sectionCalendarLessonRow  `json:"lessons"`
	Sittings      []sectionCalendarSittingRow `json:"exam_sittings"`
}

type sectionCalendarBody struct {
	SectionID    uuid.UUID               `json:"section_id"`
	BranchID     uuid.UUID               `json:"branch_id"`
	From         string                  `json:"from"`
	To           string                  `json:"to"`
	Days         []sectionCalendarDayRow `json:"days"`
	Count        int                     `json:"count"`
	LessonCount  int                     `json:"lesson_count"`
	SittingCount int                     `json:"exam_sitting_count"`
}

func (w *timetableWorld) sectionCalendarCall(section uuid.UUID, query string) *httptest.ResponseRecorder {
	w.t.Helper()

	return w.call(w.server.getSectionCalendar, "GET",
		"/api/v1/sections/"+section.String()+"/calendar?"+query, "", section)
}

func (w *timetableWorld) sectionCalendar(section uuid.UUID, query string) sectionCalendarBody {
	w.t.Helper()

	rec := w.sectionCalendarCall(section, query)
	if rec.Code != http.StatusOK {
		w.t.Fatalf("want 200 from the section calendar, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body sectionCalendarBody
	timetableBody(w.t, rec, &body)
	if body.Count != len(body.Days) {
		w.t.Fatalf("count %d does not match the %d days returned", body.Count, len(body.Days))
	}
	return body
}

func (w *timetableWorld) calendarWeek() string {
	return "from=" + w.monday.Format(dateLayout) +
		"&to=" + w.monday.AddDate(0, 0, 6).Format(dateLayout)
}

func (b sectionCalendarBody) on(t *testing.T, date time.Time) sectionCalendarDayRow {
	t.Helper()

	want := date.Format(dateLayout)
	for _, day := range b.Days {
		if day.Date == want {
			return day
		}
	}
	t.Fatalf("the calendar carries no entry for %s; it covers %s to %s", want, b.From, b.To)
	return sectionCalendarDayRow{}
}

func (d sectionCalendarDayRow) states(period uuid.UUID) []string {
	var out []string
	for _, lesson := range d.Lessons {
		if lesson.PeriodID == period {
			out = append(out, lesson.State)
		}
	}
	return out
}

func (w *timetableWorld) mondayCalendarDayID() uuid.UUID {
	w.t.Helper()

	return w.db.Client.CalendarDay.Query().
		Where(
			entcalendarday.BranchID(w.branchID),
			entcalendarday.CalendarDate(w.monday),
		).
		OnlyIDX(context.Background())
}

func (w *timetableWorld) seatExam(section, offering, period, day uuid.UUID) uuid.UUID {
	w.t.Helper()

	ctx := context.Background()
	exam := w.db.Client.Exam.Create().
		SetAcademicSessionID(w.sessionID).
		SetBranchID(w.branchID).
		SetName("Unit Test 1").
		SetCode("UT1-" + uuid.NewString()[:8]).
		SaveX(ctx)
	subject := w.db.Client.ExamSubject.Create().
		SetExamID(exam.ID).
		SetSubjectOfferingID(offering).
		SetMaximumMarks(50).
		SaveX(ctx)
	return w.db.Client.ExamSitting.Create().
		SetExamSubjectID(subject.ID).
		SetCalendarDayID(day).
		SetPeriodID(period).
		SetSectionID(section).
		SaveX(ctx).ID
}

func TestSectionCalendarIsMountedOnTheRealRouter(t *testing.T) {
	router, _ := offlineRouter(t)
	routes, ok := router.(chi.Routes)
	if !ok {
		t.Fatal("the router is no longer a chi.Routes, so its shape cannot be walked")
	}

	found := false
	err := chi.Walk(routes, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method == "GET" && strings.TrimSuffix(route, "/") == sectionCalendarPattern {
			found = true
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walking the router: %v", err)
	}
	if !found {
		t.Fatalf("GET %s is not mounted, so the handler is unreachable however well it is tested",
			sectionCalendarPattern)
	}
}

func TestSectionCalendarGuardsTheEntityTheContractNames(t *testing.T) {
	guard := &recordingGuard{}
	server := quietServer(guard)

	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) {
		r.Use(mw.DevSubject(slog.Default()))
		server.mountAcademic(r)
	})

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/sections/"+probeID+"/calendar", nil))

	probes := guard.taken()
	if len(probes) == 0 {
		t.Fatalf("the guard was never consulted, so no authorization ran here (status %d, body %s)",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if probes[0].entity != authorization.TimetableRead {
		t.Fatalf("the section calendar authorized %q, not %q",
			probes[0].entity, authorization.TimetableRead)
	}
	if probes[0].pattern != sectionCalendarPattern {
		t.Fatalf("chi matched %q, not %q, so another route shadows this one",
			probes[0].pattern, sectionCalendarPattern)
	}
}

func TestSectionCalendarSeparatesInSessionFromClosedFromUnscheduled(t *testing.T) {
	w := newTimetableWorld(t)

	body := w.sectionCalendar(w.taughtSectionID, w.calendarWeek())
	if body.Count != 7 {
		t.Fatalf("a seven-day window must answer with seven dates, got %d", body.Count)
	}
	if body.BranchID != w.branchID {
		t.Fatalf("the calendar reports branch %s, not the section branch %s", body.BranchID, w.branchID)
	}

	inSession := body.on(t, w.monday)
	if inSession.InSession == nil || !*inSession.InSession {
		t.Fatalf("Monday is an open instructional day and must read as in session: %+v", inSession)
	}
	if inSession.CalendarDayID == nil {
		t.Fatal("an in-session date must name the calendar day it came from")
	}
	if len(inSession.Schedules) != 1 || inSession.Schedules[0].PeriodSchemeID != w.schemeID {
		t.Fatalf("Monday must carry the period scheme that governs it, got %+v", inSession.Schedules)
	}
	if len(inSession.Lessons) != 2 {
		t.Fatalf("Monday carries two slots for this section, got %d: %+v",
			len(inSession.Lessons), inSession.Lessons)
	}
	for _, lesson := range inSession.Lessons {
		if lesson.SectionID != w.taughtSectionID {
			t.Fatalf("a section calendar returned a lesson for section %s", lesson.SectionID)
		}
	}

	closed := body.on(t, w.monday.AddDate(0, 0, 5))
	if closed.InSession == nil || *closed.InSession {
		t.Fatalf("the Saturday holiday must read as not in session: %+v", closed)
	}
	if closed.CalendarDayID == nil {
		t.Fatal("a closed date has a calendar row and must name it, otherwise it cannot be told from an unscheduled date")
	}
	if closed.DayType != string(entcalendarday.DayTypeHoliday) {
		t.Fatalf("the closed date must carry its day type, got %q", closed.DayType)
	}
	if len(closed.Lessons) != 0 {
		t.Fatalf("a closed date carries no lessons, got %+v", closed.Lessons)
	}

	unscheduled := body.on(t, w.monday.AddDate(0, 0, 6))
	if unscheduled.InSession == nil || *unscheduled.InSession {
		t.Fatalf("a date with no calendar row must read as not in session: %+v", unscheduled)
	}
	if unscheduled.CalendarDayID != nil {
		t.Fatalf("a date the branch calendar never mentions must carry no calendar day id, got %s",
			unscheduled.CalendarDayID)
	}
}

func TestSectionCalendarShowsACancelledLessonRatherThanDroppingIt(t *testing.T) {
	w := newTimetableWorld(t)

	before := w.sectionCalendar(w.taughtSectionID, w.calendarWeek()).on(t, w.monday)
	if got := before.states(w.periodP1); len(got) != 1 || got[0] != "planned" {
		t.Fatalf("before the cancellation P1 must read as planned, got %v", got)
	}

	w.cancel(w.taughtSlotP1, w.monday)

	after := w.sectionCalendar(w.taughtSectionID, w.calendarWeek()).on(t, w.monday)
	if got := after.states(w.periodP1); len(got) != 1 || got[0] != "cancelled" {
		t.Fatalf("a cancelled lesson must still be reported, marked cancelled, got %v", got)
	}
	if got := after.states(w.periodP2); len(got) != 1 || got[0] != "planned" {
		t.Fatalf("cancelling P1 must leave P2 alone, got %v", got)
	}
}

func TestSectionCalendarCarriesALessonADeviationAdded(t *testing.T) {
	w := newTimetableWorld(t)

	tuesday := w.monday.AddDate(0, 0, 1)
	if got := w.sectionCalendar(w.taughtSectionID, w.calendarWeek()).on(t, tuesday); len(got.Lessons) != 0 {
		t.Fatalf("Tuesday carries no slots before the addition, got %+v", got.Lessons)
	}

	deviation := w.addClass(w.taughtSectionID, w.periodP1, w.taughtOfferingID, tuesday)

	added := w.sectionCalendar(w.taughtSectionID, w.calendarWeek()).on(t, tuesday)
	if len(added.Lessons) != 1 {
		t.Fatalf("the added class must appear on Tuesday, got %+v", added.Lessons)
	}
	if added.Lessons[0].State != "added" {
		t.Fatalf("an added class must read as added, got %q", added.Lessons[0].State)
	}
	if added.Lessons[0].DeviationID == nil || *added.Lessons[0].DeviationID != deviation {
		t.Fatalf("the added class must name deviation %s, got %v", deviation, added.Lessons[0].DeviationID)
	}
}

func TestSectionCalendarCarriesAnExamSittingAlongsideTheLessonItDisplaces(t *testing.T) {
	w := newTimetableWorld(t)

	sitting := w.seatExam(w.taughtSectionID, w.taughtOfferingID, w.periodP1, w.mondayCalendarDayID())

	body := w.sectionCalendar(w.taughtSectionID, w.calendarWeek())
	if body.SittingCount != 1 {
		t.Fatalf("the window holds one sitting, the calendar reports %d", body.SittingCount)
	}

	monday := body.on(t, w.monday)
	if len(monday.Sittings) != 1 || monday.Sittings[0].ID != sitting {
		t.Fatalf("the sitting must land on its own date, got %+v", monday.Sittings)
	}
	if monday.Sittings[0].PeriodID != w.periodP1 {
		t.Fatalf("the sitting must keep its period, got %s", monday.Sittings[0].PeriodID)
	}

	if got := monday.states(w.periodP1); len(got) != 1 || got[0] != "planned" {
		t.Fatalf("today a sitting writes no deviation, so the lesson it displaces still reads as planned; got %v", got)
	}
}

func TestSectionCalendarRequiresAWindowAndCapsIt(t *testing.T) {
	w := newTimetableWorld(t)

	missing := w.sectionCalendarCall(w.taughtSectionID, "")
	if missing.Code != http.StatusBadRequest {
		t.Fatalf("an unbounded calendar read must be refused, got %d: %s",
			missing.Code, strings.TrimSpace(missing.Body.String()))
	}

	half := w.sectionCalendarCall(w.taughtSectionID, "from="+w.monday.Format(dateLayout))
	if half.Code != http.StatusBadRequest {
		t.Fatalf("from without to must be refused, got %d: %s",
			half.Code, strings.TrimSpace(half.Body.String()))
	}

	wide := w.sectionCalendarCall(w.taughtSectionID,
		"from="+w.monday.Format(dateLayout)+
			"&to="+w.monday.AddDate(0, 0, 500).Format(dateLayout))
	if wide.Code != http.StatusBadRequest {
		t.Fatalf("a window wider than %d days must be refused, got %d: %s",
			timetablesvc.MaxRangeDays, wide.Code, strings.TrimSpace(wide.Body.String()))
	}

	edge := w.sectionCalendarCall(w.taughtSectionID,
		"from="+w.monday.Format(dateLayout)+
			"&to="+w.monday.AddDate(0, 0, timetablesvc.MaxRangeDays-1).Format(dateLayout))
	if edge.Code != http.StatusOK {
		t.Fatalf("a window of exactly %d days must be accepted, got %d: %s",
			timetablesvc.MaxRangeDays, edge.Code, strings.TrimSpace(edge.Body.String()))
	}
}

func TestSectionCalendarAnswersNotFoundForASectionOutOfReach(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.sectionCalendarCall(w.otherSectionID, w.calendarWeek())
	if rec.Code != http.StatusNotFound {
		t.Fatalf("a section this teacher does not reach must answer 404, not %d: %s; "+
			"a 403 would confirm the section exists and the body would leak its year",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if strings.Contains(rec.Body.String(), w.otherSectionID.String()) {
		t.Fatalf("the refusal echoes the section id back: %s", strings.TrimSpace(rec.Body.String()))
	}
}

func TestSectionCalendarNeverHandsOverAnotherSectionsYear(t *testing.T) {
	w := newTimetableWorld(t)

	w.seatExam(w.otherSectionID, w.otherOfferingID, w.periodP1, w.mondayCalendarDayID())

	rec := w.sectionCalendarCall(w.otherSectionID, w.calendarWeek())
	if rec.Code == http.StatusOK {
		var body sectionCalendarBody
		timetableBody(t, rec, &body)

		var leaked []sectionCalendarLessonRow
		var seated []sectionCalendarSittingRow
		for _, day := range body.Days {
			leaked = append(leaked, day.Lessons...)
			seated = append(seated, day.Sittings...)
		}
		t.Fatalf("the calendar of section %s was served to a teacher who does not teach it: "+
			"%d lessons and %d sittings crossed the section boundary (%+v)",
			w.otherSectionID, len(leaked), len(seated), leaked)
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable section must answer 404, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func (w *timetableWorld) substituteTeacher(label string) uuid.UUID {
	w.t.Helper()

	ctx := context.Background()
	tag := uuid.NewString()[:8]
	person := w.db.Client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName(label).
		SetDisplayName(label + " " + tag).
		SaveX(ctx)
	staff := w.db.Client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("TTS-" + tag).
		SaveX(ctx)
	return w.db.Client.Teacher.Create().
		SetStaffID(staff.ID).
		SaveX(ctx).ID
}

func (w *timetableWorld) offeringOfAnotherSubject(section uuid.UUID) uuid.UUID {
	w.t.Helper()

	ctx := context.Background()
	tag := uuid.NewString()[:8]
	subject := w.db.Client.Subject.Create().
		SetName("Mathematics " + tag).
		SetCode("TTM-" + tag).
		SaveX(ctx)
	return w.db.Client.SubjectOffering.Create().
		SetAcademicSessionID(w.sessionID).
		SetSectionID(section).
		SetSubjectID(subject.ID).
		SaveX(ctx).ID
}

func (w *timetableWorld) substitute(slot, offering, who uuid.UUID, on time.Time) uuid.UUID {
	w.t.Helper()

	row := w.slot(slot)
	return w.db.Client.TimetableDeviation.Create().
		SetTimetableSlotID(slot).
		SetDeviationDate(on).
		SetKind(entdeviation.KindSubstitution).
		SetSectionID(row.SectionID).
		SetPeriodID(row.PeriodID).
		SetSubjectOfferingID(offering).
		SetSubstituteTeacherID(who).
		SetReason("covered as another subject").
		SaveX(context.Background()).ID
}

func (w *timetableWorld) rawCalendarLessons(section uuid.UUID, query string, on time.Time) []map[string]any {
	w.t.Helper()

	rec := w.sectionCalendarCall(section, query)
	if rec.Code != http.StatusOK {
		w.t.Fatalf("want 200 from the section calendar, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Days []struct {
			Date    string           `json:"date"`
			Lessons []map[string]any `json:"lessons"`
		} `json:"days"`
	}
	timetableBody(w.t, rec, &body)

	want := on.Format(dateLayout)
	for _, day := range body.Days {
		if day.Date == want {
			return day.Lessons
		}
	}
	w.t.Fatalf("the calendar carries no entry for %s", want)
	return nil
}

func TestSectionCalendarHandsOverTheSubjectASubstitutionDisplaced(t *testing.T) {
	w := newTimetableWorld(t)

	maths := w.offeringOfAnotherSubject(w.taughtSectionID)
	cover := w.substituteTeacher("Cover")
	w.substitute(w.taughtSlotP1, maths, cover, w.monday)

	monday := w.sectionCalendar(w.taughtSectionID, w.calendarWeek()).on(t, w.monday)

	var lesson sectionCalendarLessonRow
	found := false
	for _, row := range monday.Lessons {
		if row.PeriodID == w.periodP1 {
			lesson, found = row, true
		}
	}
	if !found {
		t.Fatalf("the substituted lesson is missing from the calendar: %+v", monday.Lessons)
	}
	if lesson.State != "substituted" {
		t.Fatalf("P1 reads as %q, want substituted", lesson.State)
	}
	if lesson.SubjectOfferingID == nil || *lesson.SubjectOfferingID != maths {
		t.Errorf("the calendar must report the subject actually taught (%s), got %v",
			maths, lesson.SubjectOfferingID)
	}
	if lesson.PlannedSubjectOfferingID == nil {
		t.Fatalf("the displaced subject stops at the service boundary: the calendar a planner reads "+
			"reports only %v, so Physics losing a period is invisible", lesson.SubjectOfferingID)
	}
	if *lesson.PlannedSubjectOfferingID != w.taughtOfferingID {
		t.Errorf("the calendar must name the displaced subject %s, got %s",
			w.taughtOfferingID, *lesson.PlannedSubjectOfferingID)
	}

	untouched := false
	for _, row := range monday.Lessons {
		if row.PeriodID != w.periodP2 {
			continue
		}
		untouched = true
		if row.PlannedSubjectOfferingID == nil || row.SubjectOfferingID == nil ||
			*row.PlannedSubjectOfferingID != *row.SubjectOfferingID {
			t.Errorf("P2 was not touched and must report the same planned and taught subject, got %+v", row)
		}
	}
	if !untouched {
		t.Fatalf("Monday must still carry P2: %+v", monday.Lessons)
	}
}

func TestSectionCalendarLeavesThePlannedSubjectOffAnAddedClass(t *testing.T) {
	w := newTimetableWorld(t)

	tuesday := w.monday.AddDate(0, 0, 1)
	w.addClass(w.taughtSectionID, w.periodP1, w.taughtOfferingID, tuesday)

	lessons := w.rawCalendarLessons(w.taughtSectionID, w.calendarWeek(), tuesday)
	if len(lessons) != 1 {
		t.Fatalf("Tuesday must carry the added class alone, got %+v", lessons)
	}
	if lessons[0]["state"] != "added" {
		t.Fatalf("the Tuesday lesson reads as %v, want added", lessons[0]["state"])
	}
	if lessons[0]["subject_offering_id"] != w.taughtOfferingID.String() {
		t.Errorf("an added class must carry the subject it teaches, got %v", lessons[0]["subject_offering_id"])
	}
	if planned, present := lessons[0]["planned_subject_offering_id"]; present {
		t.Errorf("an added class stands on no slot and displaces nothing, "+
			"yet the calendar reports a planned subject %v", planned)
	}
	for _, absent := range []string{"planned_teacher_id", "planned_room_id"} {
		if value, present := lessons[0][absent]; present {
			t.Errorf("%s is reported as %v on an added class, so the planned trio is no longer consistent",
				absent, value)
		}
	}
}
