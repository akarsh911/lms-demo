package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entmark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceperiod"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type attendanceRouteCase struct {
	method  string
	path    string
	pattern string
	entity  authorization.Entity
}

func attendanceRouteTable() []attendanceRouteCase {
	return []attendanceRouteCase{
		{"GET", "/api/v1/attendance/register", "/api/v1/attendance/register", authorization.AttendanceRead},
		{"POST", "/api/v1/attendance/register", "/api/v1/attendance/register", authorization.AttendanceWrite},

		{"GET", "/api/v1/attendance/periods", "/api/v1/attendance/periods", authorization.AttendanceRead},
		{"GET", "/api/v1/attendance/periods/" + probeID, "/api/v1/attendance/periods/{id}", authorization.AttendanceRead},
		{"PATCH", "/api/v1/attendance/periods/" + probeID, "/api/v1/attendance/periods/{id}", authorization.AttendanceWrite},
		{"DELETE", "/api/v1/attendance/periods/" + probeID, "/api/v1/attendance/periods/{id}", authorization.AttendanceDelete},

		{"GET", "/api/v1/attendance/days", "/api/v1/attendance/days", authorization.AttendanceRead},
		{"POST", "/api/v1/attendance/days", "/api/v1/attendance/days", authorization.AttendanceWrite},
		{"GET", "/api/v1/attendance/days/" + probeID, "/api/v1/attendance/days/{id}", authorization.AttendanceRead},
		{"PATCH", "/api/v1/attendance/days/" + probeID, "/api/v1/attendance/days/{id}", authorization.AttendanceWrite},
		{"DELETE", "/api/v1/attendance/days/" + probeID, "/api/v1/attendance/days/{id}", authorization.AttendanceDelete},
	}
}

func TestEveryAttendanceRouteIsGatedByAnAttendanceEntity(t *testing.T) {
	guard := &recordingGuard{}
	server := &Server{guard: guard}

	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) { server.mountAttendance(r) })

	for _, tc := range attendanceRouteTable() {
		t.Run(tc.method+" "+tc.pattern, func(t *testing.T) {
			guard.forget()

			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(probeBody))
			req = req.WithContext(authorization.WithSubject(req.Context(),
				&authorization.Subject{CASUserID: uuid.New()}))

			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code == http.StatusNotFound || rec.Code == http.StatusMethodNotAllowed {
				t.Fatalf("no route is mounted for %s %s (got %d)", tc.method, tc.path, rec.Code)
			}

			probes := guard.taken()
			if len(probes) == 0 {
				t.Fatalf("%s %s reached a handler without consulting the guard", tc.method, tc.path)
			}
			if probes[0].entity != tc.entity {
				t.Fatalf("%s %s must be gated by %s, the guard was asked for %s",
					tc.method, tc.path, tc.entity, probes[0].entity)
			}
			if probes[0].pattern != tc.pattern {
				t.Fatalf("%s %s resolved to the pattern %q, want %q",
					tc.method, tc.path, probes[0].pattern, tc.pattern)
			}
		})
	}
}

type attendanceDBGuard struct{}

func (attendanceDBGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.AttendanceRead, authorization.AttendanceWrite, authorization.AttendanceDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTeacherAssignment,
			HasReach: true,
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (attendanceDBGuard) Name() string { return "attendance database test guard" }

type attendanceWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	personID  uuid.UUID
	teacherID uuid.UUID
	sectionID uuid.UUID
	sessionID uuid.UUID

	physicsID uuid.UUID
	historyID uuid.UUID

	firstPeriodID  uuid.UUID
	secondPeriodID uuid.UUID

	monday    time.Time
	tuesday   time.Time
	wednesday time.Time

	onlyPhysics uuid.UUID
	bothSubject uuid.UUID
	onlyHistory uuid.UUID

	historyMarkID uuid.UUID
}

func attendanceDate(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func newAttendanceWorld(t *testing.T) *attendanceWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	w := &attendanceWorld{
		t:         t,
		db:        db,
		monday:    attendanceDate(2026, time.April, 6),
		tuesday:   attendanceDate(2026, time.April, 7),
		wednesday: attendanceDate(2026, time.April, 8),
	}

	session := client.AcademicSession.Create().
		SetName("Attendance Probe " + tag).
		SetCode("ATP-" + tag).
		SetStartDate(attendanceDate(2026, time.April, 1)).
		SetEndDate(attendanceDate(2027, time.March, 31)).
		SetIsCurrent(true).
		SaveX(ctx)
	w.sessionID = session.ID

	branch := client.Branch.Create().
		SetName("Attendance Campus " + tag).
		SetCode("ATB-" + tag).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("XI").SetCode("ATG-" + tag).SetSequence(11).
		SaveX(ctx)

	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").
		SetCode("ATS-" + tag).
		SaveX(ctx)
	w.sectionID = section.ID

	scheme := client.PeriodScheme.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetName("Attendance Scheme " + tag).
		SetCode("ATC-" + tag).
		SaveX(ctx)

	first := client.Period.Create().
		SetPeriodSchemeID(scheme.ID).SetName("Period 1").SetCode("AP1-" + tag).SetSequence(1).
		SaveX(ctx)
	second := client.Period.Create().
		SetPeriodSchemeID(scheme.ID).SetName("Period 2").SetCode("AP2-" + tag).SetSequence(2).
		SaveX(ctx)
	w.firstPeriodID, w.secondPeriodID = first.ID, second.ID

	bell := client.BellSchedule.Create().
		SetPeriodSchemeID(scheme.ID).SetName("Regular").SetCode("ABR-" + tag).SetIsDefault(true).
		SaveX(ctx)
	client.BellSchedulePeriod.Create().
		SetBellScheduleID(bell.ID).SetPeriodID(first.ID).SetStartMinute(545).SetEndMinute(585).
		SaveX(ctx)
	client.BellSchedulePeriod.Create().
		SetBellScheduleID(bell.ID).SetPeriodID(second.ID).SetStartMinute(585).SetEndMinute(625).
		SaveX(ctx)

	openDay := func(on time.Time, kind entcalendarday.DayType, forenoon, afternoon bool) {
		day := client.CalendarDay.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetCalendarDate(on).
			SetDayType(kind).
			SetForenoonOpen(forenoon).
			SetAfternoonOpen(afternoon).
			SaveX(ctx)
		client.CalendarDaySchedule.Create().
			SetCalendarDayID(day.ID).
			SetPeriodSchemeID(scheme.ID).
			SetBellScheduleID(bell.ID).
			SaveX(ctx)
	}
	openDay(w.monday, entcalendarday.DayTypeInstructional, true, true)
	openDay(w.tuesday, entcalendarday.DayTypeInstructional, true, true)
	openDay(w.wednesday, entcalendarday.DayTypeHoliday, false, false)

	physicsSubject := client.Subject.Create().
		SetName("Physics " + tag).SetCode("APH-" + tag).SaveX(ctx)
	historySubject := client.Subject.Create().
		SetName("History " + tag).SetCode("AHI-" + tag).SaveX(ctx)

	physics := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).SetSectionID(section.ID).SetSubjectID(physicsSubject.ID).
		SaveX(ctx)
	history := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).SetSectionID(section.ID).SetSubjectID(historySubject.ID).
		SaveX(ctx)
	w.physicsID, w.historyID = physics.ID, history.ID

	person, teacher := w.makeTeacher(client, branch.ID, tag)
	w.personID, w.teacherID = person.ID, teacher.ID

	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(section.ID).
		SetSubjectOfferingID(physics.ID).
		SetRoleType("subject_teacher").
		SaveX(ctx)

	table := client.Timetable.Create().
		SetAcademicSessionID(session.ID).
		SetPeriodSchemeID(scheme.ID).
		SetName("Attendance Timetable " + tag).
		SetVersion(1).
		SetEffectiveFrom(attendanceDate(2026, time.April, 1)).
		SetStatus(enttimetable.StatusPublished).
		SaveX(ctx)

	slot := func(dayOfWeek int, periodID, offeringID uuid.UUID) *tenantent.TimetableSlot {
		return client.TimetableSlot.Create().
			SetTimetableID(table.ID).
			SetSectionID(section.ID).
			SetPeriodID(periodID).
			SetDayOfWeek(dayOfWeek).
			SetSubjectOfferingID(offeringID).
			SetTeacherID(teacher.ID).
			SaveX(ctx)
	}
	slot(1, first.ID, physics.ID)
	slot(1, second.ID, history.ID)
	tuesdayPhysics := slot(2, first.ID, physics.ID)

	client.TimetableDeviation.Create().
		SetTimetableSlotID(tuesdayPhysics.ID).
		SetDeviationDate(w.tuesday).
		SetKind(entdeviation.KindCancelled).
		SetSectionID(section.ID).
		SetPeriodID(first.ID).
		SetSubjectOfferingID(physics.ID).
		SetReason("teacher on leave").
		SaveX(ctx)

	w.onlyPhysics = w.enrol(client, tag+"-a", session.ID, section.ID, physics.ID)
	w.bothSubject = w.enrol(client, tag+"-b", session.ID, section.ID, physics.ID, history.ID)
	w.onlyHistory = w.enrol(client, tag+"-c", session.ID, section.ID, history.ID)

	w.historyMarkID = client.AttendancePeriod.Create().
		SetStudentID(w.bothSubject).
		SetAcademicSessionID(session.ID).
		SetSubjectOfferingID(history.ID).
		SetPeriodID(first.ID).
		SetAttendanceDate(w.monday).
		SetStatus(entmark.StatusPresent).
		SetRemarks("marked by the history teacher").
		SaveX(ctx).ID

	w.server = &Server{guard: attendanceDBGuard{}}
	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: person.CasUserID})
	w.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	w.requireGenuineScope()
	db.Forget()
	return w
}

func (w *attendanceWorld) makeTeacher(client *tenantent.Client, branchID uuid.UUID,
	tag string) (*tenantent.Person, *tenantent.Teacher) {
	w.t.Helper()

	ctx := context.Background()
	person := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Physics").
		SetDisplayName("Physics Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(person.ID).
		SetBranchID(branchID).
		SetEmployeeCode("AEM-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().
		SetStaffID(staff.ID).
		SetTeacherCode("ATC-" + tag).
		SaveX(ctx)
	return person, teacher
}

func (w *attendanceWorld) enrol(client *tenantent.Client, label string,
	sessionID, sectionID uuid.UUID, offerings ...uuid.UUID) uuid.UUID {
	w.t.Helper()

	ctx := context.Background()
	person := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Student").
		SetDisplayName("Student " + label).
		SaveX(ctx)
	student := client.Student.Create().
		SetPersonID(person.ID).
		SetAdmissionNumber("ADM-" + label).
		SaveX(ctx)
	enrollment := client.StudentEnrollment.Create().
		SetStudentID(student.ID).
		SetAcademicSessionID(sessionID).
		SetSectionID(sectionID).
		SetEnrollmentDate(attendanceDate(2026, time.April, 1)).
		SaveX(ctx)

	for _, offering := range offerings {
		client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrollment.ID).
			SetSubjectOfferingID(offering).
			SetStudentID(student.ID).
			SetAcademicSessionID(sessionID).
			SaveX(ctx)
	}
	return student.ID
}

func (w *attendanceWorld) requireGenuineScope() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.AttendanceWrite, authorization.AttendanceWriteAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer would write every row and prove nothing about scoping")
	}
	if viewer.TeacherID == nil || *viewer.TeacherID != w.teacherID {
		w.t.Fatalf("the viewer must resolve to the seeded teacher %s, got %v", w.teacherID, viewer.TeacherID)
	}
	if len(viewer.SubjectOfferingIDs) != 1 || viewer.SubjectOfferingIDs[0] != w.physicsID {
		w.t.Fatalf("the viewer must carry exactly the physics offering, got %v", viewer.SubjectOfferingIDs)
	}
	if len(viewer.SectionIDs) != 0 {
		w.t.Fatalf("a subject teacher must carry no section, otherwise the day-write arm is not empty: %v",
			viewer.SectionIDs)
	}
	if !decision.HasReach || decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the decision must carry a teacher-assignment reach, got %+v", decision)
	}
}

func (w *attendanceWorld) call(handler http.HandlerFunc, method, target, body string,
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

func (w *attendanceWorld) markRegister(offering, period uuid.UUID, on time.Time,
	entries string) *httptest.ResponseRecorder {
	w.t.Helper()

	body := `{"subject_offering_id":"` + offering.String() + `",` +
		`"period_id":"` + period.String() + `",` +
		`"attendance_date":"` + on.Format(dateLayout) + `",` +
		`"entries":[` + entries + `]}`

	return w.call(w.server.markAttendanceRegister, "POST", "/api/v1/attendance/register", body, uuid.Nil)
}

func markedPresent(student uuid.UUID) string {
	return `{"student_id":"` + student.String() + `","status":"present"}`
}

func markedAbsent(student uuid.UUID) string {
	return `{"student_id":"` + student.String() + `","status":"absent"}`
}

func (w *attendanceWorld) mark(id uuid.UUID) *tenantent.AttendancePeriod {
	w.t.Helper()

	row, err := w.db.Client.AttendancePeriod.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("attendance mark %s could not be read back inside the transaction: %v", id, err)
	}
	return row
}

func (w *attendanceWorld) marksFor(student uuid.UUID, on time.Time,
	period uuid.UUID) []*tenantent.AttendancePeriod {
	w.t.Helper()

	rows, err := w.db.Client.AttendancePeriod.Query().
		Where(
			entmark.StudentID(student),
			entmark.AttendanceDate(on),
			entmark.PeriodID(period),
		).
		All(context.Background())
	if err != nil {
		w.t.Fatalf("the marks for student %s could not be read back: %v", student, err)
	}
	return rows
}

type registerBody struct {
	Created     int         `json:"created"`
	Updated     int         `json:"updated"`
	Count       int         `json:"count"`
	Message     string      `json:"message"`
	Unreachable []uuid.UUID `json:"unreachable"`
	NotEnrolled []uuid.UUID `json:"not_enrolled"`
	Marks       []struct {
		ID        uuid.UUID `json:"id"`
		StudentID uuid.UUID `json:"student_id"`
		Status    string    `json:"status"`
	} `json:"marks"`
}

func decodeRegister(t *testing.T, rec *httptest.ResponseRecorder) registerBody {
	t.Helper()

	var body registerBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the register response is not JSON: %v (%q)", err, rec.Body.String())
	}
	return body
}

func namedStudent(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func TestBulkRegisterMarksTheClassTheTeacherActuallyTeaches(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.markRegister(w.physicsID, w.firstPeriodID, w.monday, markedPresent(w.onlyPhysics))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	body := decodeRegister(t, rec)
	if body.Created != 1 || body.Updated != 0 {
		t.Fatalf("one mark should have been created and none updated, got created=%d updated=%d",
			body.Created, body.Updated)
	}
	if body.Count != 1 || len(body.Marks) != 1 {
		t.Fatalf("the response must carry the one mark it wrote, got %+v", body)
	}
	if body.Marks[0].StudentID != w.onlyPhysics || body.Marks[0].Status != "present" {
		t.Fatalf("the mark does not describe the student that was marked: %+v", body.Marks[0])
	}

	rows := w.marksFor(w.onlyPhysics, w.monday, w.firstPeriodID)
	if len(rows) != 1 {
		t.Fatalf("exactly one row must exist for that student, date and period, got %d", len(rows))
	}
	if rows[0].SubjectOfferingID != w.physicsID {
		t.Fatalf("the row must belong to the physics offering, got %s", rows[0].SubjectOfferingID)
	}
	if rows[0].MarkedBy == nil || *rows[0].MarkedBy != w.personID {
		t.Fatalf("the row must record who marked it, got %v", rows[0].MarkedBy)
	}
	if rows[0].TimetableSlotID == nil {
		t.Fatal("the row must be tied to the timetable slot the register resolved to")
	}
}

func TestBulkRegisterWillNotReachAMarkThatBelongsToAnotherOffering(t *testing.T) {
	w := newAttendanceWorld(t)

	before := w.mark(w.historyMarkID)
	if before.SubjectOfferingID != w.historyID || before.Status != entmark.StatusPresent {
		t.Fatalf("the fixture must start with a present history mark, got %+v", before)
	}

	rec := w.markRegister(w.physicsID, w.firstPeriodID, w.monday,
		markedPresent(w.onlyPhysics)+","+markedAbsent(w.bothSubject))

	if rec.Code == http.StatusOK {
		t.Fatalf("a physics teacher must not be able to write a mark that belongs to history, "+
			"the register was accepted with %s", strings.TrimSpace(rec.Body.String()))
	}
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	body := decodeRegister(t, rec)
	if !namedStudent(body.Unreachable, w.bothSubject) {
		t.Fatalf("the refusal must name the student it could not reach, got %+v", body)
	}
	if namedStudent(body.Unreachable, w.onlyPhysics) {
		t.Fatalf("the student the teacher can reach must not be reported as unreachable: %+v", body)
	}

	after := w.mark(w.historyMarkID)
	if after.Status != entmark.StatusPresent {
		t.Fatalf("the history mark was overwritten: the status moved from present to %s", after.Status)
	}
	if after.SubjectOfferingID != w.historyID {
		t.Fatalf("the history mark was re-pointed at %s, it must still belong to history %s",
			after.SubjectOfferingID, w.historyID)
	}
	if after.Remarks == nil || *after.Remarks != "marked by the history teacher" {
		t.Fatalf("the history mark's remarks were rewritten, got %v", after.Remarks)
	}
	if after.UpdatedAt.After(before.UpdatedAt) {
		t.Fatalf("the history mark was touched: updated_at moved from %s to %s",
			before.UpdatedAt, after.UpdatedAt)
	}
}

func TestBulkRegisterIsIdempotentOnTheNaturalKey(t *testing.T) {
	w := newAttendanceWorld(t)

	first := w.markRegister(w.physicsID, w.firstPeriodID, w.monday, markedPresent(w.onlyPhysics))
	if first.Code != http.StatusOK {
		t.Fatalf("the first register must be accepted, got %d: %s",
			first.Code, strings.TrimSpace(first.Body.String()))
	}

	second := w.markRegister(w.physicsID, w.firstPeriodID, w.monday, markedAbsent(w.onlyPhysics))
	if second.Code != http.StatusOK {
		t.Fatalf("resubmitting the register must be accepted, got %d: %s",
			second.Code, strings.TrimSpace(second.Body.String()))
	}

	body := decodeRegister(t, second)
	if body.Created != 0 || body.Updated != 1 {
		t.Fatalf("the second submission must update in place, got created=%d updated=%d",
			body.Created, body.Updated)
	}

	rows := w.marksFor(w.onlyPhysics, w.monday, w.firstPeriodID)
	if len(rows) != 1 {
		t.Fatalf("resubmitting a register must not duplicate rows, got %d", len(rows))
	}
	if rows[0].Status != entmark.StatusAbsent {
		t.Fatalf("the correction did not land, the status is %s", rows[0].Status)
	}
}

func TestBulkRegisterRefusesADayThatIsNotInSession(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.markRegister(w.physicsID, w.firstPeriodID, w.wednesday, markedPresent(w.onlyPhysics))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 on a holiday, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "attendance_not_in_session") {
		t.Fatalf("the refusal must say the day is not in session, got %q", strings.TrimSpace(rec.Body.String()))
	}
	if rows := w.marksFor(w.onlyPhysics, w.wednesday, w.firstPeriodID); len(rows) != 0 {
		t.Fatalf("no mark may be written on a day that is not in session, got %d", len(rows))
	}
}

func TestBulkRegisterRefusesADateWithNoCalendarDayAtAll(t *testing.T) {
	w := newAttendanceWorld(t)

	unknown := attendanceDate(2026, time.April, 13)
	rec := w.markRegister(w.physicsID, w.firstPeriodID, unknown, markedPresent(w.onlyPhysics))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an absent calendar row must fail closed, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "attendance_not_in_session") {
		t.Fatalf("the refusal must say the day is not in session, got %q", strings.TrimSpace(rec.Body.String()))
	}
}

func TestBulkRegisterRefusesACancelledClass(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.markRegister(w.physicsID, w.firstPeriodID, w.tuesday, markedPresent(w.onlyPhysics))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 on a cancelled class, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "attendance_class_cancelled") {
		t.Fatalf("the refusal must say the class was cancelled, got %q", strings.TrimSpace(rec.Body.String()))
	}
	if rows := w.marksFor(w.onlyPhysics, w.tuesday, w.firstPeriodID); len(rows) != 0 {
		t.Fatalf("no mark may be written for a cancelled class, got %d", len(rows))
	}
}

func TestBulkRegisterRefusesAStudentWhoIsNotEnrolledInTheOffering(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.markRegister(w.physicsID, w.firstPeriodID, w.monday, markedPresent(w.onlyHistory))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	body := decodeRegister(t, rec)
	if !namedStudent(body.NotEnrolled, w.onlyHistory) {
		t.Fatalf("the refusal must name the student who is not enrolled, got %+v", body)
	}
	if rows := w.marksFor(w.onlyHistory, w.monday, w.firstPeriodID); len(rows) != 0 {
		t.Fatalf("a student outside the offering must not be marked, got %d rows", len(rows))
	}
}

func TestBulkRegisterRefusesAnOfferingTheTeacherDoesNotTeach(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.markRegister(w.historyID, w.secondPeriodID, w.monday,
		markedPresent(w.onlyHistory)+","+markedAbsent(w.bothSubject))
	if rec.Code == http.StatusOK {
		t.Fatalf("a physics teacher must not open the history register, it was accepted with %s",
			strings.TrimSpace(rec.Body.String()))
	}
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	body := decodeRegister(t, rec)
	for _, student := range []uuid.UUID{w.onlyHistory, w.bothSubject} {
		if !namedStudent(body.Unreachable, student) {
			t.Fatalf("the refusal must name every student it could not reach, %s is missing from %+v",
				student, body)
		}
	}
	for _, student := range []uuid.UUID{w.onlyHistory, w.bothSubject} {
		if rows := w.marksFor(student, w.monday, w.secondPeriodID); len(rows) != 0 {
			t.Fatalf("a refused register left %d row(s) behind for student %s", len(rows), student)
		}
	}
}

func TestBulkRegisterRefusesTheSameStudentTwice(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.markRegister(w.physicsID, w.firstPeriodID, w.monday,
		markedPresent(w.onlyPhysics)+","+markedAbsent(w.onlyPhysics))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 on a duplicated student, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestCorrectingAMarkOutsideTheTeachersOfferingIsNotFound(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.call(w.server.updateAttendancePeriod, "PATCH",
		"/api/v1/attendance/periods/"+w.historyMarkID.String(),
		`{"status":"absent"}`, w.historyMarkID)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable mark must be a 404, never a 403, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if row := w.mark(w.historyMarkID); row.Status != entmark.StatusPresent {
		t.Fatalf("the history mark was changed anyway, the status is %s", row.Status)
	}
}

func TestCorrectingAMarkInsideTheTeachersOfferingSucceeds(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.markRegister(w.physicsID, w.firstPeriodID, w.monday, markedPresent(w.onlyPhysics))
	if rec.Code != http.StatusOK {
		t.Fatalf("the register must be accepted, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	id := decodeRegister(t, rec).Marks[0].ID

	corrected := w.call(w.server.updateAttendancePeriod, "PATCH",
		"/api/v1/attendance/periods/"+id.String(),
		`{"status":"late","reason_code":"bus"}`, id)
	if corrected.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", corrected.Code, strings.TrimSpace(corrected.Body.String()))
	}

	row := w.mark(id)
	if row.Status != entmark.StatusLate {
		t.Fatalf("the correction did not land, the status is %s", row.Status)
	}
	if row.ReasonCode == nil || *row.ReasonCode != "bus" {
		t.Fatalf("the reason code did not land, got %v", row.ReasonCode)
	}
}

func TestDeletingAMarkOutsideTheTeachersOfferingIsNotFound(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.call(w.server.deleteAttendancePeriod, "DELETE",
		"/api/v1/attendance/periods/"+w.historyMarkID.String(), "", w.historyMarkID)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable mark must be a 404, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if w.mark(w.historyMarkID) == nil {
		t.Fatal("the history mark was deleted")
	}
}

func TestReadingOneStudentOverARangeStaysInsideTheTeachersOfferings(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.markRegister(w.physicsID, w.firstPeriodID, w.monday, markedPresent(w.bothSubject))
	if rec.Code == http.StatusOK {
		t.Fatalf("the fixture keeps a history mark on that key, the register cannot be accepted: %s",
			strings.TrimSpace(rec.Body.String()))
	}

	listing := w.call(w.server.listAttendancePeriods, "GET",
		"/api/v1/attendance/periods?student_id="+w.bothSubject.String()+
			"&from=2026-04-01&to=2026-04-30", "", uuid.Nil)
	if listing.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", listing.Code, strings.TrimSpace(listing.Body.String()))
	}

	var body struct {
		AttendancePeriods []struct {
			ID                uuid.UUID `json:"id"`
			SubjectOfferingID uuid.UUID `json:"subject_offering_id"`
		} `json:"attendance_periods"`
		Count int `json:"count"`
	}
	if err := json.Unmarshal(listing.Body.Bytes(), &body); err != nil {
		t.Fatalf("the list response is not JSON: %v (%q)", err, listing.Body.String())
	}

	for _, row := range body.AttendancePeriods {
		if row.SubjectOfferingID != w.physicsID {
			t.Fatalf("a physics teacher read a mark for offering %s: %s",
				row.SubjectOfferingID, row.ID)
		}
		if row.ID == w.historyMarkID {
			t.Fatalf("the history mark %s leaked into the physics teacher's listing", w.historyMarkID)
		}
	}
}

func TestReadingTheRegisterShowsTheSessionStateOfTheClass(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.call(w.server.getAttendanceRegister, "GET",
		"/api/v1/attendance/register?subject_offering_id="+w.physicsID.String()+
			"&period_id="+w.firstPeriodID.String()+
			"&attendance_date="+w.tuesday.Format(dateLayout), "", uuid.Nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		SectionID uuid.UUID `json:"section_id"`
		Class     struct {
			InSession bool   `json:"in_session"`
			Scheduled bool   `json:"scheduled"`
			Cancelled bool   `json:"cancelled"`
			State     string `json:"state"`
		} `json:"class"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the register response is not JSON: %v (%q)", err, rec.Body.String())
	}

	if body.SectionID != w.sectionID {
		t.Fatalf("the register must name the section it belongs to, got %s", body.SectionID)
	}
	if !body.Class.InSession || !body.Class.Scheduled {
		t.Fatalf("tuesday is an instructional day carrying that slot, got %+v", body.Class)
	}
	if !body.Class.Cancelled || body.Class.State != "cancelled" {
		t.Fatalf("the register must show the class as cancelled, got %+v", body.Class)
	}
}

func TestASubjectTeacherCannotRecordTheDayLevelRegister(t *testing.T) {
	w := newAttendanceWorld(t)

	body := `{"student_id":"` + w.onlyPhysics.String() + `",` +
		`"section_id":"` + w.sectionID.String() + `",` +
		`"attendance_date":"` + w.monday.Format(dateLayout) + `",` +
		`"forenoon_status":"present"}`

	rec := w.call(w.server.createAttendanceDay, "POST", "/api/v1/attendance/days", body, uuid.Nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a subject teacher holds no day-write arm, want 403, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rows, err := w.db.Client.AttendanceDay.Query().All(context.Background())
	if err != nil {
		t.Fatalf("the attendance days could not be read back: %v", err)
	}
	for _, row := range rows {
		if row.StudentID == w.onlyPhysics && row.AttendanceDate.Equal(w.monday) {
			t.Fatal("the day row survived a refused create")
		}
	}
}

func TestTheDayRegisterRefusesAHalfThatIsNotOpen(t *testing.T) {
	w := newAttendanceWorld(t)

	body := `{"student_id":"` + w.onlyPhysics.String() + `",` +
		`"section_id":"` + w.sectionID.String() + `",` +
		`"attendance_date":"` + w.wednesday.Format(dateLayout) + `",` +
		`"forenoon_status":"present"}`

	rec := w.call(w.server.createAttendanceDay, "POST", "/api/v1/attendance/days", body, uuid.Nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 on a closed half, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "attendance_not_in_session") {
		t.Fatalf("the refusal must say the half is not open, got %q", strings.TrimSpace(rec.Body.String()))
	}
}

func TestTheRegisterRefusesAnUnknownQueryParameter(t *testing.T) {
	w := newAttendanceWorld(t)

	rec := w.call(w.server.getAttendanceRegister, "GET",
		"/api/v1/attendance/register?subject_offering_id="+w.physicsID.String()+
			"&period_id="+w.firstPeriodID.String()+
			"&attendance_date=2026-04-06&subjectoffering=1", "", uuid.Nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a misspelt parameter must be refused, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}
