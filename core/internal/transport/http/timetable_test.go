package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
	mw "github.com/Harbour-Emerge/emerge-core/internal/transport/http/middleware"
)

type timetableGuard struct{}

func (timetableGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.TimetableRead, authorization.TimetableWrite, authorization.TimetableDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTeacherAssignment,
			HasReach: true,
			Rule:     "timetable test guard",
		}, nil
	case authorization.RoomsRead, authorization.RoomsWrite, authorization.RoomsDelete,
		authorization.CalendarRead, authorization.CalendarWrite, authorization.CalendarDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Rule:     "timetable test guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (timetableGuard) Name() string { return "timetable database test guard" }

func timetableDate(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

type timetableWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	personID  uuid.UUID
	teacherID uuid.UUID

	branchID  uuid.UUID
	sessionID uuid.UUID

	taughtSectionID uuid.UUID
	otherSectionID  uuid.UUID

	taughtOfferingID uuid.UUID
	otherOfferingID  uuid.UUID

	schemeID uuid.UUID
	periodP1 uuid.UUID
	periodP2 uuid.UUID
	roomA    uuid.UUID
	roomB    uuid.UUID

	timetableID      uuid.UUID
	otherTimetableID uuid.UUID

	taughtSlotP1 uuid.UUID
	taughtSlotP2 uuid.UUID
	otherSlot    uuid.UUID

	monday time.Time
	friday time.Time
}

func newTimetableWorld(t *testing.T) *timetableWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	monday := timetableDate(2026, time.April, 6)

	branch := client.Branch.Create().
		SetName("Timetable Campus " + tag).
		SetCode("TTB-" + tag).
		SaveX(ctx)

	session := client.AcademicSession.Create().
		SetName("Timetable Session " + tag).
		SetCode("TTS-" + tag).
		SetStartDate(timetableDate(2026, time.April, 1)).
		SetEndDate(timetableDate(2027, time.March, 31)).
		SetIsCurrent(true).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("XI " + tag).
		SetCode("TTG-" + tag).
		SetSequence(11).
		SaveX(ctx)

	newSection := func(name, code string) uuid.UUID {
		return client.Section.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetGradeLevelID(grade.ID).
			SetName(name).
			SetCode(code + "-" + tag).
			SaveX(ctx).ID
	}
	taughtSection := newSection("A", "TTA")
	otherSection := newSection("B", "TTZ")

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Timetable").
		SetDisplayName("Timetable Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("TTE-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().
		SetStaffID(staff.ID).
		SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(taughtSection).
		SetRoleType("class_teacher").
		SaveX(ctx)

	otherPerson := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Other").
		SetDisplayName("Other Teacher " + tag).
		SaveX(ctx)
	otherStaff := client.Staff.Create().
		SetPersonID(otherPerson.ID).
		SetEmployeeCode("TTO-" + tag).
		SaveX(ctx)
	otherTeacher := client.Teacher.Create().
		SetStaffID(otherStaff.ID).
		SaveX(ctx)

	subject := client.Subject.Create().
		SetName("Physics " + tag).
		SetCode("TTP-" + tag).
		SaveX(ctx)
	newOffering := func(section uuid.UUID) uuid.UUID {
		return client.SubjectOffering.Create().
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetSubjectID(subject.ID).
			SaveX(ctx).ID
	}
	taughtOffering := newOffering(taughtSection)
	otherOffering := newOffering(otherSection)

	newRoom := func(code string) uuid.UUID {
		return client.Room.Create().
			SetBranchID(branch.ID).
			SetName("Room " + code).
			SetCode(code + "-" + tag).
			SaveX(ctx).ID
	}
	roomA := newRoom("TRA")
	roomB := newRoom("TRB")

	scheme := client.PeriodScheme.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetName("Senior " + tag).
		SetCode("TTC-" + tag).
		SaveX(ctx)

	newPeriod := func(code string, sequence int) uuid.UUID {
		return client.Period.Create().
			SetPeriodSchemeID(scheme.ID).
			SetName("Period " + code).
			SetCode(code + "-" + tag).
			SetSequence(sequence).
			SaveX(ctx).ID
	}
	p1 := newPeriod("P1", 1)
	p2 := newPeriod("P2", 2)

	bell := client.BellSchedule.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("Regular").
		SetCode("TTR-" + tag).
		SetIsDefault(true).
		SaveX(ctx)
	client.BellSchedulePeriod.Create().
		SetBellScheduleID(bell.ID).SetPeriodID(p1).
		SetStartMinute(545).SetEndMinute(585).SaveX(ctx)
	client.BellSchedulePeriod.Create().
		SetBellScheduleID(bell.ID).SetPeriodID(p2).
		SetStartMinute(585).SetEndMinute(625).SaveX(ctx)

	for offset := 0; offset < 5; offset++ {
		day := client.CalendarDay.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetCalendarDate(monday.AddDate(0, 0, offset)).
			SetDayType(entcalendarday.DayTypeInstructional).
			SetForenoonOpen(true).
			SetAfternoonOpen(true).
			SaveX(ctx)
		client.CalendarDaySchedule.Create().
			SetCalendarDayID(day.ID).
			SetPeriodSchemeID(scheme.ID).
			SetBellScheduleID(bell.ID).
			SaveX(ctx)
	}
	client.CalendarDay.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetCalendarDate(monday.AddDate(0, 0, 5)).
		SetDayType(entcalendarday.DayTypeHoliday).
		SetForenoonOpen(false).
		SetAfternoonOpen(false).
		SaveX(ctx)

	timetable := client.Timetable.Create().
		SetAcademicSessionID(session.ID).
		SetPeriodSchemeID(scheme.ID).
		SetName("Senior Timetable " + tag).
		SetEffectiveFrom(timetableDate(2026, time.April, 1)).
		SetStatus(enttimetable.StatusPublished).
		SaveX(ctx)

	newSlot := func(section, period, offering, who, room uuid.UUID) uuid.UUID {
		return client.TimetableSlot.Create().
			SetTimetableID(timetable.ID).
			SetSectionID(section).
			SetPeriodID(period).
			SetDayOfWeek(1).
			SetSubjectOfferingID(offering).
			SetTeacherID(who).
			SetRoomID(room).
			SaveX(ctx).ID
	}
	taughtSlotP1 := newSlot(taughtSection, p1, taughtOffering, teacher.ID, roomA)
	taughtSlotP2 := newSlot(taughtSection, p2, taughtOffering, teacher.ID, roomB)
	otherSlot := newSlot(otherSection, p1, otherOffering, otherTeacher.ID, roomB)

	otherScheme := client.PeriodScheme.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetName("Junior " + tag).
		SetCode("TTJ-" + tag).
		SaveX(ctx)
	otherPeriod := client.Period.Create().
		SetPeriodSchemeID(otherScheme.ID).
		SetName("Period 1").
		SetCode("JP1-" + tag).
		SetSequence(1).
		SaveX(ctx)
	otherTimetable := client.Timetable.Create().
		SetAcademicSessionID(session.ID).
		SetPeriodSchemeID(otherScheme.ID).
		SetName("Junior Timetable " + tag).
		SetEffectiveFrom(timetableDate(2026, time.April, 1)).
		SetStatus(enttimetable.StatusPublished).
		SaveX(ctx)
	client.TimetableSlot.Create().
		SetTimetableID(otherTimetable.ID).
		SetSectionID(otherSection).
		SetPeriodID(otherPeriod.ID).
		SetDayOfWeek(1).
		SetSubjectOfferingID(otherOffering).
		SetTeacherID(otherTeacher.ID).
		SaveX(ctx)

	world := &timetableWorld{
		t:                t,
		db:               db,
		server:           &Server{guard: timetableGuard{}},
		personID:         person.ID,
		teacherID:        teacher.ID,
		branchID:         branch.ID,
		sessionID:        session.ID,
		taughtSectionID:  taughtSection,
		otherSectionID:   otherSection,
		taughtOfferingID: taughtOffering,
		otherOfferingID:  otherOffering,
		schemeID:         scheme.ID,
		periodP1:         p1,
		periodP2:         p2,
		roomA:            roomA,
		roomB:            roomB,
		timetableID:      timetable.ID,
		otherTimetableID: otherTimetable.ID,
		taughtSlotP1:     taughtSlotP1,
		taughtSlotP2:     taughtSlotP2,
		otherSlot:        otherSlot,
		monday:           monday,
		friday:           monday.AddDate(0, 0, 4),
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireGenuineScope()
	db.Forget()
	return world
}

func (w *timetableWorld) requireGenuineScope() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer would read every row and prove nothing about scoping")
	}
	if viewer.TeacherID == nil || *viewer.TeacherID != w.teacherID {
		w.t.Fatalf("the viewer must resolve to the seeded teacher %s, got %v",
			w.teacherID, viewer.TeacherID)
	}
	if len(viewer.SectionIDs) != 1 || viewer.SectionIDs[0] != w.taughtSectionID {
		w.t.Fatalf("the viewer must carry exactly the taught section %s, got %v",
			w.taughtSectionID, viewer.SectionIDs)
	}
	if !decision.HasReach || decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the decision must carry a teacher-assignment reach, got %+v", decision)
	}
}

func (w *timetableWorld) call(handler http.HandlerFunc, method, target, body string,
	id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	ctx := w.ctx
	if id != uuid.Nil {
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	}

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest(method, target, strings.NewReader(body)).WithContext(ctx))
	return rec
}

func (w *timetableWorld) slot(id uuid.UUID) *tenantent.TimetableSlot {
	w.t.Helper()

	row, err := w.db.Client.TimetableSlot.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("slot %s could not be read back inside the transaction: %v", id, err)
	}
	return row
}

func (w *timetableWorld) cancel(slot uuid.UUID, on time.Time) uuid.UUID {
	w.t.Helper()

	row := w.slot(slot)
	create := w.db.Client.TimetableDeviation.Create().
		SetTimetableSlotID(slot).
		SetDeviationDate(on).
		SetKind(entdeviation.KindCancelled).
		SetSectionID(row.SectionID).
		SetPeriodID(row.PeriodID).
		SetReason("teacher on leave")
	if row.SubjectOfferingID != nil {
		create = create.SetSubjectOfferingID(*row.SubjectOfferingID)
	}
	return create.SaveX(context.Background()).ID
}

func (w *timetableWorld) addClass(section, period, offering uuid.UUID, on time.Time) uuid.UUID {
	w.t.Helper()

	return w.db.Client.TimetableDeviation.Create().
		SetDeviationDate(on).
		SetKind(entdeviation.KindAdded).
		SetSectionID(section).
		SetPeriodID(period).
		SetSubjectOfferingID(offering).
		SetReason("make-up class").
		SaveX(context.Background()).ID
}

func timetableBody(t *testing.T, rec *httptest.ResponseRecorder, dst any) {
	t.Helper()

	if err := json.Unmarshal(rec.Body.Bytes(), dst); err != nil {
		t.Fatalf("the response is not JSON: %v (%q)", err, rec.Body.String())
	}
}

type occurrenceRow struct {
	SectionID   uuid.UUID  `json:"section_id"`
	SlotID      *uuid.UUID `json:"timetable_slot_id"`
	DeviationID *uuid.UUID `json:"timetable_deviation_id"`
	State       string     `json:"state"`
	Date        string     `json:"date"`
	PeriodID    uuid.UUID  `json:"period_id"`
}

func (w *timetableWorld) occurrences(query string) []occurrenceRow {
	w.t.Helper()

	rec := w.call(w.server.resolveTimetableOccurrences, "GET",
		"/api/v1/timetable-occurrences?"+query, "", uuid.Nil)
	if rec.Code != http.StatusOK {
		w.t.Fatalf("want 200 from the occurrence read, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Occurrences []occurrenceRow `json:"occurrences"`
		Count       int             `json:"count"`
	}
	timetableBody(w.t, rec, &body)
	if body.Count != len(body.Occurrences) {
		w.t.Fatalf("count %d does not match the %d occurrences returned",
			body.Count, len(body.Occurrences))
	}
	return body.Occurrences
}

func (w *timetableWorld) week() string {
	return "branch_id=" + w.branchID.String() +
		"&from=" + w.monday.Format(dateLayout) +
		"&to=" + w.friday.Format(dateLayout)
}

func TestTimetableRoutesGuardTheEntityTheContractNames(t *testing.T) {
	guard := &recordingGuard{}
	server := quietServer(guard)

	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) {
		r.Use(mw.DevSubject(slog.Default()))
		server.mountTimetable(r)
	})

	id := probeID
	cases := []routeCase{
		{"GET", "/api/v1/timetables", "/api/v1/timetables", authorization.TimetableRead, false},
		{"POST", "/api/v1/timetables", "/api/v1/timetables", authorization.TimetableWrite, false},
		{"GET", "/api/v1/timetables/" + id, "/api/v1/timetables/{id}",
			authorization.TimetableRead, false},
		{"PATCH", "/api/v1/timetables/" + id, "/api/v1/timetables/{id}",
			authorization.TimetableWrite, false},
		{"DELETE", "/api/v1/timetables/" + id, "/api/v1/timetables/{id}",
			authorization.TimetableDelete, false},
		{"GET", "/api/v1/timetables/" + id + "/slots", "/api/v1/timetables/{id}/slots",
			authorization.TimetableRead, false},
		{"POST", "/api/v1/timetables/" + id + "/slots", "/api/v1/timetables/{id}/slots",
			authorization.TimetableWrite, false},
		{"POST", "/api/v1/timetables/" + id + "/clash-check", "/api/v1/timetables/{id}/clash-check",
			authorization.TimetableWrite, false},
		{"POST", "/api/v1/timetables/" + id + "/generate", "/api/v1/timetables/{id}/generate",
			authorization.TimetableGenerate, false},
		{"GET", "/api/v1/timetables/" + id + "/generate/" + id,
			"/api/v1/timetables/{id}/generate/{job}", authorization.TimetableRead, false},

		{"GET", "/api/v1/timetable-slots/" + id, "/api/v1/timetable-slots/{id}",
			authorization.TimetableRead, false},
		{"PATCH", "/api/v1/timetable-slots/" + id, "/api/v1/timetable-slots/{id}",
			authorization.TimetableWrite, false},
		{"DELETE", "/api/v1/timetable-slots/" + id, "/api/v1/timetable-slots/{id}",
			authorization.TimetableDelete, false},

		{"GET", "/api/v1/timetable-deviations", "/api/v1/timetable-deviations",
			authorization.TimetableRead, false},
		{"POST", "/api/v1/timetable-deviations", "/api/v1/timetable-deviations",
			authorization.TimetableWrite, false},
		{"GET", "/api/v1/timetable-deviations/" + id, "/api/v1/timetable-deviations/{id}",
			authorization.TimetableRead, false},
		{"PATCH", "/api/v1/timetable-deviations/" + id, "/api/v1/timetable-deviations/{id}",
			authorization.TimetableWrite, false},
		{"DELETE", "/api/v1/timetable-deviations/" + id, "/api/v1/timetable-deviations/{id}",
			authorization.TimetableDelete, false},

		{"GET", "/api/v1/timetable-occurrences", "/api/v1/timetable-occurrences",
			authorization.TimetableRead, false},
		{"GET", "/api/v1/timetable-calendar", "/api/v1/timetable-calendar",
			authorization.CalendarRead, false},
		{"GET", "/api/v1/timetable-calendar/in-session", "/api/v1/timetable-calendar/in-session",
			authorization.CalendarRead, false},

		{"GET", "/api/v1/rooms", "/api/v1/rooms", authorization.RoomsRead, false},
		{"POST", "/api/v1/rooms", "/api/v1/rooms", authorization.RoomsWrite, false},
		{"GET", "/api/v1/rooms/" + id, "/api/v1/rooms/{id}", authorization.RoomsRead, false},
		{"PATCH", "/api/v1/rooms/" + id, "/api/v1/rooms/{id}", authorization.RoomsWrite, false},
		{"DELETE", "/api/v1/rooms/" + id, "/api/v1/rooms/{id}", authorization.RoomsDelete, false},

		{"GET", "/api/v1/period-schemes", "/api/v1/period-schemes",
			authorization.TimetableRead, false},
		{"POST", "/api/v1/period-schemes", "/api/v1/period-schemes",
			authorization.TimetableWrite, false},
		{"GET", "/api/v1/period-schemes/" + id, "/api/v1/period-schemes/{id}",
			authorization.TimetableRead, false},
		{"PATCH", "/api/v1/period-schemes/" + id, "/api/v1/period-schemes/{id}",
			authorization.TimetableWrite, false},
		{"DELETE", "/api/v1/period-schemes/" + id, "/api/v1/period-schemes/{id}",
			authorization.TimetableDelete, false},
		{"GET", "/api/v1/period-schemes/" + id + "/periods",
			"/api/v1/period-schemes/{id}/periods", authorization.TimetableRead, false},
		{"POST", "/api/v1/period-schemes/" + id + "/periods",
			"/api/v1/period-schemes/{id}/periods", authorization.TimetableWrite, false},
		{"GET", "/api/v1/period-schemes/" + id + "/bell-schedules",
			"/api/v1/period-schemes/{id}/bell-schedules", authorization.TimetableRead, false},
		{"POST", "/api/v1/period-schemes/" + id + "/bell-schedules",
			"/api/v1/period-schemes/{id}/bell-schedules", authorization.TimetableWrite, false},

		{"GET", "/api/v1/periods/" + id, "/api/v1/periods/{id}", authorization.TimetableRead, false},
		{"PATCH", "/api/v1/periods/" + id, "/api/v1/periods/{id}", authorization.TimetableWrite, false},
		{"DELETE", "/api/v1/periods/" + id, "/api/v1/periods/{id}",
			authorization.TimetableDelete, false},

		{"GET", "/api/v1/bell-schedules/" + id, "/api/v1/bell-schedules/{id}",
			authorization.TimetableRead, false},
		{"PATCH", "/api/v1/bell-schedules/" + id, "/api/v1/bell-schedules/{id}",
			authorization.TimetableWrite, false},
		{"DELETE", "/api/v1/bell-schedules/" + id, "/api/v1/bell-schedules/{id}",
			authorization.TimetableDelete, false},
		{"GET", "/api/v1/bell-schedules/" + id + "/periods",
			"/api/v1/bell-schedules/{id}/periods", authorization.TimetableRead, false},
		{"POST", "/api/v1/bell-schedules/" + id + "/periods",
			"/api/v1/bell-schedules/{id}/periods", authorization.TimetableWrite, false},

		{"PATCH", "/api/v1/bell-schedule-periods/" + id, "/api/v1/bell-schedule-periods/{id}",
			authorization.TimetableWrite, false},
		{"DELETE", "/api/v1/bell-schedule-periods/" + id, "/api/v1/bell-schedule-periods/{id}",
			authorization.TimetableDelete, false},

		{"GET", "/api/v1/calendar-days", "/api/v1/calendar-days", authorization.CalendarRead, false},
		{"POST", "/api/v1/calendar-days", "/api/v1/calendar-days", authorization.CalendarWrite, false},
		{"GET", "/api/v1/calendar-days/" + id, "/api/v1/calendar-days/{id}",
			authorization.CalendarRead, false},
		{"PATCH", "/api/v1/calendar-days/" + id, "/api/v1/calendar-days/{id}",
			authorization.CalendarWrite, false},
		{"DELETE", "/api/v1/calendar-days/" + id, "/api/v1/calendar-days/{id}",
			authorization.CalendarDelete, false},
		{"GET", "/api/v1/calendar-days/" + id + "/schedules",
			"/api/v1/calendar-days/{id}/schedules", authorization.CalendarRead, false},
		{"POST", "/api/v1/calendar-days/" + id + "/schedules",
			"/api/v1/calendar-days/{id}/schedules", authorization.CalendarWrite, false},

		{"PATCH", "/api/v1/calendar-day-schedules/" + id, "/api/v1/calendar-day-schedules/{id}",
			authorization.CalendarWrite, false},
		{"DELETE", "/api/v1/calendar-day-schedules/" + id, "/api/v1/calendar-day-schedules/{id}",
			authorization.CalendarDelete, false},
	}

	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			guard.forget()

			rec := send(router, tc.method, tc.path, "")
			if why := routerRefused(rec); why != "" {
				t.Fatalf("%s %s: %s (status %d, body %s)",
					tc.method, tc.path, why, rec.Code, strings.TrimSpace(rec.Body.String()))
			}

			checkProbe(t, tc, guard.taken(), rec)
		})
	}
}

func TestListTimetablesReturnsOnlyTheReachableVersions(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.listTimetables, "GET", "/api/v1/timetables", "", uuid.Nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Timetables []struct {
			ID uuid.UUID `json:"id"`
		} `json:"timetables"`
	}
	timetableBody(t, rec, &body)

	seen := map[uuid.UUID]bool{}
	for _, row := range body.Timetables {
		seen[row.ID] = true
	}
	if !seen[w.timetableID] {
		t.Fatalf("the timetable carrying the viewer's own section %s must be listed, got %v",
			w.timetableID, body.Timetables)
	}
	if seen[w.otherTimetableID] {
		t.Fatalf("the timetable %s holds only another section's classes and must not be listed",
			w.otherTimetableID)
	}
}

func TestUnreachableSlotIsNotFoundRatherThanForbidden(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.getTimetableSlot, "GET",
		"/api/v1/timetable-slots/"+w.otherSlot.String(), "", w.otherSlot)

	if rec.Code == http.StatusForbidden {
		t.Fatalf("403 confirms the row exists; the reply must not distinguish it from a missing row: %s",
			strings.TrimSpace(rec.Body.String()))
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 for another section's slot, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), timetableSlotNotFound) {
		t.Fatalf("want the not-found body, got %s", strings.TrimSpace(rec.Body.String()))
	}

	own := w.call(w.server.getTimetableSlot, "GET",
		"/api/v1/timetable-slots/"+w.taughtSlotP1.String(), "", w.taughtSlotP1)
	if own.Code != http.StatusOK {
		t.Fatalf("the viewer's own slot must still be readable, got %d: %s",
			own.Code, strings.TrimSpace(own.Body.String()))
	}
}

func TestUpdatingAnUnreachableSlotIs404AndChangesNothing(t *testing.T) {
	w := newTimetableWorld(t)
	before := w.slot(w.otherSlot)

	rec := w.call(w.server.updateTimetableSlot, "PATCH",
		"/api/v1/timetable-slots/"+w.otherSlot.String(),
		`{"label":"taken over"}`, w.otherSlot)

	if rec.Code == http.StatusForbidden {
		t.Fatalf("403 confirms the row exists; the write must answer 404: %s",
			strings.TrimSpace(rec.Body.String()))
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 writing another section's slot, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	after := w.slot(w.otherSlot)
	if after.Label != nil {
		t.Fatalf("the refused write still reached the row: label is now %q", *after.Label)
	}
	if after.UpdatedAt != before.UpdatedAt {
		t.Fatal("the refused write still touched the row: updated_at moved")
	}
}

func TestDeletingAnUnreachableSlotIs404AndLeavesTheRow(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.deleteTimetableSlot, "DELETE",
		"/api/v1/timetable-slots/"+w.otherSlot.String(), "", w.otherSlot)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 deleting another section's slot, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	if w.slot(w.otherSlot) == nil {
		t.Fatal("the slot of the other section was deleted by a caller who cannot reach it")
	}
}

func TestOccurrencesCarryOnlyTheViewersOwnClasses(t *testing.T) {
	w := newTimetableWorld(t)
	w.cancel(w.taughtSlotP1, w.monday)

	rows := w.occurrences(w.week())
	if len(rows) == 0 {
		t.Fatal("the resolved week is empty, so nothing below proves anything about scoping")
	}

	cancelled := 0
	for _, row := range rows {
		if row.SectionID != w.taughtSectionID {
			t.Fatalf("an occurrence of section %s reached a viewer who only teaches %s",
				row.SectionID, w.taughtSectionID)
		}
		if row.SlotID != nil && *row.SlotID == w.otherSlot {
			t.Fatalf("the other section's slot %s was resolved into the reply", w.otherSlot)
		}
		if row.State == "cancelled" {
			cancelled++
		}
	}
	if cancelled != 1 {
		t.Fatalf("the cancellation on %s must show as one cancelled occurrence, got %d",
			w.monday.Format(dateLayout), cancelled)
	}
}

func TestAddedClassOfAnotherSectionStaysOutOfTheResolvedWeek(t *testing.T) {
	w := newTimetableWorld(t)
	hidden := w.addClass(w.otherSectionID, w.periodP2, w.otherOfferingID, w.monday)
	mine := w.addClass(w.taughtSectionID, w.periodP2, w.taughtOfferingID, w.monday.AddDate(0, 0, 1))

	rows := w.occurrences(w.week())

	sawMine := false
	for _, row := range rows {
		if row.DeviationID == nil {
			continue
		}
		if *row.DeviationID == hidden {
			t.Fatalf("the added class %s belongs to section %s and must stay hidden",
				hidden, w.otherSectionID)
		}
		if *row.DeviationID == mine {
			sawMine = true
		}
	}
	if !sawMine {
		t.Fatalf("the viewer's own added class %s never reached the reply, "+
			"so the hidden one above proves nothing", mine)
	}
}

func TestCreatingAClashingSlotIsRefusedAndNamesTheParties(t *testing.T) {
	w := newTimetableWorld(t)

	body := `{"section_id":"` + w.taughtSectionID.String() +
		`","period_id":"` + w.periodP1.String() +
		`","day_of_week":1,"label":"Extra drill","teacher_id":"` + w.teacherID.String() +
		`","room_id":"` + w.roomA.String() + `"}`

	rec := w.call(w.server.createTimetableSlot, "POST",
		"/api/v1/timetables/"+w.timetableID.String()+"/slots", body, w.timetableID)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409 for a slot that double-books the teacher, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var refusal struct {
		Code    string `json:"code"`
		Clashes []struct {
			Rule      string     `json:"rule"`
			TeacherID *uuid.UUID `json:"teacher_id"`
			RoomID    *uuid.UUID `json:"room_id"`
			Left      struct {
				SlotID *uuid.UUID `json:"timetable_slot_id"`
				Ref    string     `json:"ref"`
			} `json:"left"`
			Right struct {
				SlotID *uuid.UUID `json:"timetable_slot_id"`
				Ref    string     `json:"ref"`
			} `json:"right"`
		} `json:"clashes"`
	}
	timetableBody(t, rec, &refusal)

	if refusal.Code != TimetableClashCode {
		t.Fatalf("the refusal must carry the clash code, got %q", refusal.Code)
	}
	if len(refusal.Clashes) == 0 {
		t.Fatal("a bare 409 names nobody: the body must carry the clashing parties")
	}

	named := false
	for _, clash := range refusal.Clashes {
		if clash.Rule != "teacher" {
			continue
		}
		if clash.TeacherID == nil || *clash.TeacherID != w.teacherID {
			t.Fatalf("the teacher clash must name teacher %s, got %v", w.teacherID, clash.TeacherID)
		}
		for _, side := range []*uuid.UUID{clash.Left.SlotID, clash.Right.SlotID} {
			if side != nil && *side == w.taughtSlotP1 {
				named = true
			}
		}
	}
	if !named {
		t.Fatalf("the refusal must name the slot %s that is already timetabled, got %+v",
			w.taughtSlotP1, refusal.Clashes)
	}

	n := w.db.Client.TimetableSlot.Query().
		Where(entslot.TimetableID(w.timetableID)).
		CountX(context.Background())
	if n != 3 {
		t.Fatalf("the refused slot was written anyway: the timetable now holds %d slots", n)
	}
}

func TestClashCheckReportsAFreePeriodAsClear(t *testing.T) {
	w := newTimetableWorld(t)

	body := `{"proposed":[{"ref":"a","section_id":"` + w.taughtSectionID.String() +
		`","period_id":"` + w.periodP2.String() +
		`","day_of_week":2,"teacher_id":"` + w.teacherID.String() + `"}]}`

	rec := w.call(w.server.checkTimetableClashes, "POST",
		"/api/v1/timetables/"+w.timetableID.String()+"/clash-check", body, w.timetableID)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 from the clash check, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var report struct {
		Clear   bool `json:"clear"`
		Clashes []struct {
			Rule string `json:"rule"`
		} `json:"clashes"`
	}
	timetableBody(t, rec, &report)
	if !report.Clear || len(report.Clashes) != 0 {
		t.Fatalf("Tuesday period 2 is free for that teacher, got %+v", report)
	}
}

func TestClashCheckOnAnUnreachableTimetableIs404(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.checkTimetableClashes, "POST",
		"/api/v1/timetables/"+w.otherTimetableID.String()+"/clash-check",
		`{"proposed":[]}`, w.otherTimetableID)

	if rec.Code == http.StatusForbidden {
		t.Fatalf("403 confirms the timetable exists, got %s", strings.TrimSpace(rec.Body.String()))
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 for a timetable the viewer cannot write, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestSessionDaysReportOnlyTheOpenDays(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.listSessionDays, "GET",
		"/api/v1/timetable-calendar?"+w.week()+"&open_only=true", "", uuid.Nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Count        int      `json:"count"`
		SessionDates []string `json:"session_dates"`
	}
	timetableBody(t, rec, &body)
	if body.Count != 5 || len(body.SessionDates) != 5 {
		t.Fatalf("Monday to Friday are instructional days, got %d days and %v",
			body.Count, body.SessionDates)
	}

	saturday := w.monday.AddDate(0, 0, 5)
	rec = w.call(w.server.getInSession, "GET",
		"/api/v1/timetable-calendar/in-session?branch_id="+w.branchID.String()+
			"&date="+saturday.Format(dateLayout), "", uuid.Nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var session struct {
		InSession bool `json:"in_session"`
	}
	timetableBody(t, rec, &session)
	if session.InSession {
		t.Fatalf("%s is a holiday and must not report as in session", saturday.Format(dateLayout))
	}
}

func TestOccurrenceReadRefusesAnInvertedRange(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.resolveTimetableOccurrences, "GET",
		"/api/v1/timetable-occurrences?branch_id="+w.branchID.String()+
			"&from="+w.friday.Format(dateLayout)+"&to="+w.monday.Format(dateLayout), "", uuid.Nil)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for an inverted range, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "end date precedes") {
		t.Fatalf("the reply must repeat what the service said, got %s",
			strings.TrimSpace(rec.Body.String()))
	}
}

func TestOccurrenceReadRefusesAMissingBranch(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.call(w.server.resolveTimetableOccurrences, "GET",
		"/api/v1/timetable-occurrences?from="+w.monday.Format(dateLayout)+
			"&to="+w.friday.Format(dateLayout), "", uuid.Nil)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 without a branch, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "branch is required") {
		t.Fatalf("the reply must name the missing branch, got %s",
			strings.TrimSpace(rec.Body.String()))
	}
}
