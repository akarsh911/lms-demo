package http

import (
	"context"
	"encoding/json"
	"fmt"
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
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entsitting "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsitting"
	entexamsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsubject"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type examWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	branchID  uuid.UUID
	sessionID uuid.UUID

	sectionA uuid.UUID
	sectionB uuid.UUID

	physicsA uuid.UUID
	bioA     uuid.UUID
	chemA    uuid.UUID

	teacherT1 uuid.UUID

	roomR1 uuid.UUID
	roomR3 uuid.UUID
	roomR4 uuid.UUID

	periodP1 uuid.UUID
	periodP2 uuid.UUID
	periodP3 uuid.UUID
	periodP4 uuid.UUID
	periodP5 uuid.UUID

	timetableID uuid.UUID
	slotAP3     uuid.UUID

	examID         uuid.UUID
	examName       string
	physicsSubject uuid.UUID
	bioSubject     uuid.UUID

	callerPerson uuid.UUID

	studentS1 uuid.UUID

	monday  time.Time
	holiday time.Time
	sunday  time.Time
}

func newExamWorld(t *testing.T) *examWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	monday := time.Date(2026, time.April, 6, 0, 0, 0, 0, time.UTC)

	branch := client.Branch.Create().
		SetName("Exam Campus " + tag).
		SetCode("EXB-" + tag).
		SaveX(ctx)

	session := client.AcademicSession.Create().
		SetName("Exam Session " + tag).
		SetCode("EXS-" + tag).
		SetStartDate(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2027, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SetIsCurrent(true).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("X " + tag).
		SetCode("EXG-" + tag).
		SetSequence(10).
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
	sectionA := newSection("A", "EXA")
	sectionB := newSection("B", "EXZ")

	newTeacher := func(code string) uuid.UUID {
		person := client.Person.Create().
			SetCasUserID(uuid.New()).
			SetFirstName("Exam").
			SetDisplayName("Exam " + code + " " + tag).
			SaveX(ctx)
		staff := client.Staff.Create().
			SetPersonID(person.ID).
			SetEmployeeCode(code + "-" + tag).
			SaveX(ctx)
		return client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx).ID
	}

	casUser := uuid.New()
	callerPerson := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Exam").
		SetDisplayName("Exam Caller " + tag).
		SaveX(ctx)
	callerStaff := client.Staff.Create().
		SetPersonID(callerPerson.ID).
		SetEmployeeCode("EXT1-" + tag).
		SaveX(ctx)
	teacherT1 := client.Teacher.Create().SetStaffID(callerStaff.ID).SaveX(ctx).ID

	teacherT2 := newTeacher("EXT2")
	teacherT3 := newTeacher("EXT3")
	teacherT4 := newTeacher("EXT4")

	newSubject := func(name, code string) uuid.UUID {
		return client.Subject.Create().
			SetName(name + " " + tag).
			SetCode(code + "-" + tag).
			SaveX(ctx).ID
	}
	physics := newSubject("Physics", "EXP")
	biology := newSubject("Biology", "EXB")
	chemistry := newSubject("Chemistry", "EXC")
	mathematics := newSubject("Mathematics", "EXM")

	newOffering := func(section, subject uuid.UUID) uuid.UUID {
		return client.SubjectOffering.Create().
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetSubjectID(subject).
			SaveX(ctx).ID
	}
	physicsA := newOffering(sectionA, physics)
	bioA := newOffering(sectionA, biology)
	chemA := newOffering(sectionA, chemistry)
	physicsB := newOffering(sectionB, physics)
	mathsB := newOffering(sectionB, mathematics)

	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacherT1).
		SetSectionID(sectionA).
		SetRoleType("class_teacher").
		SaveX(ctx)

	newOfferingAssignment := func(who, section, offering uuid.UUID) {
		client.TeacherAssignment.Create().
			SetAcademicSessionID(session.ID).
			SetTeacherID(who).
			SetSectionID(section).
			SetSubjectOfferingID(offering).
			SetRoleType("subject_teacher").
			SetIsPrimary(true).
			SaveX(ctx)
	}
	newOfferingAssignment(teacherT1, sectionA, physicsA)
	newOfferingAssignment(teacherT4, sectionA, bioA)
	newOfferingAssignment(teacherT2, sectionA, chemA)

	newRoom := func(code string) uuid.UUID {
		return client.Room.Create().
			SetBranchID(branch.ID).
			SetName("Room " + code).
			SetCode(code + "-" + tag).
			SaveX(ctx).ID
	}
	roomR1 := newRoom("EXR1")
	roomR2 := newRoom("EXR2")
	roomR3 := newRoom("EXR3")
	roomR4 := newRoom("EXR4")

	scheme := client.PeriodScheme.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetName("Senior " + tag).
		SetCode("EXC-" + tag).
		SaveX(ctx)

	newPeriod := func(code string, sequence int) uuid.UUID {
		return client.Period.Create().
			SetPeriodSchemeID(scheme.ID).
			SetName("Period " + code).
			SetCode(code + "-" + tag).
			SetSequence(sequence).
			SaveX(ctx).ID
	}
	p1 := newPeriod("EP1", 1)
	p2 := newPeriod("EP2", 2)
	p3 := newPeriod("EP3", 3)
	p4 := newPeriod("EP4", 4)
	p5 := newPeriod("EP5", 5)

	bell := client.BellSchedule.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("Regular").
		SetCode("EXBS-" + tag).
		SetIsDefault(true).
		SaveX(ctx)
	spans := []struct {
		period uuid.UUID
		start  int
	}{{p1, 545}, {p2, 590}, {p3, 635}, {p4, 680}, {p5, 725}}
	for _, span := range spans {
		client.BellSchedulePeriod.Create().
			SetBellScheduleID(bell.ID).
			SetPeriodID(span.period).
			SetStartMinute(span.start).
			SetEndMinute(span.start + 40).
			SaveX(ctx)
	}

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
	holiday := client.CalendarDay.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetCalendarDate(monday.AddDate(0, 0, 5)).
		SetDayType(entcalendarday.DayTypeHoliday).
		SetForenoonOpen(false).
		SetAfternoonOpen(false).
		SaveX(ctx)
	client.CalendarDaySchedule.Create().
		SetCalendarDayID(holiday.ID).
		SetPeriodSchemeID(scheme.ID).
		SetBellScheduleID(bell.ID).
		SaveX(ctx)

	timetable := client.Timetable.Create().
		SetAcademicSessionID(session.ID).
		SetPeriodSchemeID(scheme.ID).
		SetName("Senior Timetable " + tag).
		SetEffectiveFrom(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)).
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
	newSlot(sectionA, p1, chemA, teacherT2, roomR1)
	newSlot(sectionA, p2, chemA, teacherT2, roomR1)
	slotAP3 := newSlot(sectionA, p3, chemA, teacherT2, roomR1)
	newSlot(sectionA, p4, chemA, teacherT2, roomR1)
	newSlot(sectionB, p1, physicsB, teacherT1, roomR2)
	newSlot(sectionB, p2, mathsB, teacherT3, roomR3)

	studentPerson := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Exam").
		SetDisplayName("Exam Pupil " + tag).
		SaveX(ctx)
	student := client.Student.Create().
		SetPersonID(studentPerson.ID).
		SetAdmissionNumber("EXADM-" + tag).
		SaveX(ctx)
	enrollment := client.StudentEnrollment.Create().
		SetStudentID(student.ID).
		SetAcademicSessionID(session.ID).
		SetSectionID(sectionA).
		SetEnrollmentDate(monday).
		SaveX(ctx)
	for _, offering := range []uuid.UUID{physicsA, chemA} {
		client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrollment.ID).
			SetSubjectOfferingID(offering).
			SetStudentID(student.ID).
			SetAcademicSessionID(session.ID).
			SaveX(ctx)
	}

	exam := client.Exam.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetName("Unit Test I " + tag).
		SetCode("EXU-" + tag).
		SaveX(ctx)

	newExamSubject := func(offering uuid.UUID) uuid.UUID {
		return client.ExamSubject.Create().
			SetExamID(exam.ID).
			SetSubjectOfferingID(offering).
			SetMaximumMarks(50).
			SetPassMarks(17).
			SaveX(ctx).ID
	}
	physicsSubject := newExamSubject(physicsA)
	bioSubject := newExamSubject(bioA)

	world := &examWorld{
		t:              t,
		db:             db,
		server:         &Server{guard: timetableGuard{}},
		branchID:       branch.ID,
		sessionID:      session.ID,
		sectionA:       sectionA,
		sectionB:       sectionB,
		physicsA:       physicsA,
		bioA:           bioA,
		chemA:          chemA,
		teacherT1:      teacherT1,
		roomR1:         roomR1,
		roomR3:         roomR3,
		roomR4:         roomR4,
		periodP1:       p1,
		periodP2:       p2,
		periodP3:       p3,
		periodP4:       p4,
		periodP5:       p5,
		timetableID:    timetable.ID,
		slotAP3:        slotAP3,
		examID:         exam.ID,
		examName:       exam.Name,
		physicsSubject: physicsSubject,
		bioSubject:     bioSubject,
		studentS1:      student.ID,
		callerPerson:   callerPerson.ID,
		monday:         monday,
		holiday:        monday.AddDate(0, 0, 5),
		sunday:         monday.AddDate(0, 0, 6),
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireGenuineScope()
	db.Forget()
	return world
}

func (w *examWorld) requireGenuineScope() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer would reach every section and prove nothing about scoping")
	}
	if viewer.TeacherID == nil || *viewer.TeacherID != w.teacherT1 {
		w.t.Fatalf("the viewer must resolve to the seeded teacher %s, got %v",
			w.teacherT1, viewer.TeacherID)
	}
	if len(viewer.SectionIDs) != 1 || viewer.SectionIDs[0] != w.sectionA {
		w.t.Fatalf("the viewer must carry exactly section A %s, got %v",
			w.sectionA, viewer.SectionIDs)
	}
	if !decision.HasReach || decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the decision must carry a teacher-assignment reach, got %+v", decision)
	}
}

func (w *examWorld) createSitting(subject uuid.UUID, on time.Time,
	period uuid.UUID, room *uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	body := fmt.Sprintf(`{"date":%q,"period_id":%q`, on.Format(dateLayout), period)
	if room != nil {
		body += fmt.Sprintf(`,"room_id":%q`, *room)
	}
	body += "}"

	route := chi.NewRouteContext()
	route.URLParams.Add("id", subject.String())
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	rec := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost,
		"/api/v1/exam-subjects/"+subject.String()+"/sittings", strings.NewReader(body))
	w.server.createExamSitting(rec, request.WithContext(ctx))
	return rec
}

func (w *examWorld) refusal(rec *httptest.ResponseRecorder) clashBody {
	w.t.Helper()

	var body clashBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("the refusal was not JSON: %v (%s)", err, rec.Body.String())
	}
	return body
}

func (w *examWorld) rules(rec *httptest.ResponseRecorder) []string {
	w.t.Helper()

	body := w.refusal(rec)
	out := make([]string, 0, len(body.Clashes))
	for _, clash := range body.Clashes {
		out = append(out, clash.Rule)
	}
	return out
}

func namesRule(list []string, want string) bool {
	for _, item := range list {
		if item == want {
			return true
		}
	}
	return false
}

func (w *examWorld) sittings() []*tenantent.ExamSitting {
	w.t.Helper()

	rows, err := w.db.Client.ExamSitting.Query().
		Where(entsitting.HasExamSubjectWith(
			entexamsubject.HasExamWith(entexam.AcademicSessionID(w.sessionID)))).
		Order(tenantent.Asc(entsitting.FieldPeriodID)).
		All(context.Background())
	if err != nil {
		w.t.Fatalf("the sittings could not be read back: %v", err)
	}
	return rows
}

func TestExamSittingIsRefusedWhenTheRoomIsAlreadyBooked(t *testing.T) {
	w := newExamWorld(t)

	rec := w.createSitting(w.physicsSubject, w.monday, w.periodP2, &w.roomR3)
	if rec.Code != http.StatusConflict {
		t.Fatalf("a test booked into a room another section already occupies must be refused, "+
			"got %d: %s", rec.Code, rec.Body.String())
	}
	if body := w.refusal(rec); body.Code != TimetableClashCode {
		t.Fatalf("the refusal must carry the %s code, got %q", TimetableClashCode, body.Code)
	}
	if rules := w.rules(rec); !namesRule(rules, "room") {
		t.Fatalf("the report must name a room clash, got %v", rules)
	}
	if rows := w.sittings(); len(rows) != 0 {
		t.Fatalf("a refused sitting must not be written, found %d rows", len(rows))
	}
}

func TestExamSittingIsRefusedWhenTheTeacherIsAlreadyTeaching(t *testing.T) {
	w := newExamWorld(t)

	rec := w.createSitting(w.physicsSubject, w.monday, w.periodP1, &w.roomR4)
	if rec.Code != http.StatusConflict {
		t.Fatalf("a test set in a period where the subject teacher is teaching another section "+
			"must be refused, got %d: %s", rec.Code, rec.Body.String())
	}
	if rules := w.rules(rec); !namesRule(rules, "teacher") {
		t.Fatalf("the report must name a teacher clash, got %v", rules)
	}
	if rows := w.sittings(); len(rows) != 0 {
		t.Fatalf("a refused sitting must not be written, found %d rows", len(rows))
	}
}

func TestTwoExamSittingsInDifferentPeriodsBothSucceed(t *testing.T) {
	w := newExamWorld(t)

	first := w.createSitting(w.physicsSubject, w.monday, w.periodP3, &w.roomR4)
	if first.Code != http.StatusCreated {
		t.Fatalf("a free period must accept a sitting, got %d: %s", first.Code, first.Body.String())
	}

	second := w.createSitting(w.bioSubject, w.monday, w.periodP4, &w.roomR4)
	if second.Code != http.StatusCreated {
		t.Fatalf("a second sitting one period later must also be accepted, got %d: %s",
			second.Code, second.Body.String())
	}

	rows := w.sittings()
	if len(rows) != 2 {
		t.Fatalf("both sittings must be written, found %d", len(rows))
	}
	if rows[0].PeriodID == rows[1].PeriodID {
		t.Fatalf("the two sittings must occupy different periods, both are %s", rows[0].PeriodID)
	}
	for _, row := range rows {
		if row.SectionID != w.sectionA {
			t.Fatalf("a sitting belongs to the section that studies the offering, got %s", row.SectionID)
		}
	}
}

func TestAnExamSittingDisplacesTheSectionsOwnLessonInThatPeriod(t *testing.T) {
	w := newExamWorld(t)

	slot, err := w.db.Client.TimetableSlot.Get(context.Background(), w.slotAP3)
	if err != nil {
		t.Fatalf("the displaced slot could not be read: %v", err)
	}
	if slot.SubjectOfferingID == nil || *slot.SubjectOfferingID != w.chemA {
		t.Fatalf("the fixture must timetable chemistry for section A in that period, got %v",
			slot.SubjectOfferingID)
	}

	pupils, err := w.db.Client.StudentSubjectEnrollment.Query().
		Where(entsubjenroll.SubjectOfferingIDIn(w.physicsA, w.chemA)).
		Count(context.Background())
	if err != nil {
		t.Fatalf("the shared enrolments could not be counted: %v", err)
	}
	if pupils != 2 {
		t.Fatalf("the fixture must put the same pupil in both offerings so that the "+
			"student-set rule would bite without displacement, got %d enrolments", pupils)
	}

	rec := w.createSitting(w.physicsSubject, w.monday, w.periodP3, &w.roomR4)
	if rec.Code != http.StatusCreated {
		t.Fatalf("the sitting takes the period the section would otherwise have spent in "+
			"chemistry, so the section's own lesson is not a clash; got %d: %s",
			rec.Code, rec.Body.String())
	}
}

func TestTwoExamSittingsCannotShareARoomInTheSamePeriod(t *testing.T) {
	w := newExamWorld(t)

	first := w.createSitting(w.physicsSubject, w.monday, w.periodP3, &w.roomR4)
	if first.Code != http.StatusCreated {
		t.Fatalf("the first sitting must be accepted, got %d: %s", first.Code, first.Body.String())
	}

	second := w.createSitting(w.bioSubject, w.monday, w.periodP3, &w.roomR4)
	if second.Code != http.StatusConflict {
		t.Fatalf("a second sitting in the same room and period must be refused, got %d: %s",
			second.Code, second.Body.String())
	}
	if rules := w.rules(second); !namesRule(rules, "room") {
		t.Fatalf("the report must name a room clash between the two sittings, got %v", rules)
	}
	if rows := w.sittings(); len(rows) != 1 {
		t.Fatalf("only the first sitting must survive, found %d", len(rows))
	}
}

func TestExamSittingIsRefusedOnADateWithNoCalendarDay(t *testing.T) {
	w := newExamWorld(t)

	rec := w.createSitting(w.physicsSubject, w.sunday, w.periodP3, &w.roomR4)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a date with no calendar_days row is not in session and must be refused, "+
			"got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "not in session") {
		t.Fatalf("the refusal must say the school is not in session, got %s", rec.Body.String())
	}
	if rows := w.sittings(); len(rows) != 0 {
		t.Fatalf("a refused sitting must not be written, found %d rows", len(rows))
	}
}

func TestExamSittingIsRefusedOnAClosedCalendarDay(t *testing.T) {
	w := newExamWorld(t)

	rec := w.createSitting(w.physicsSubject, w.holiday, w.periodP3, &w.roomR4)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a day with both halves shut must be refused, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "the school is closed") {
		t.Fatalf("the refusal must be about the day being shut rather than about the period "+
			"scheme, got %s", rec.Body.String())
	}
	if rows := w.sittings(); len(rows) != 0 {
		t.Fatalf("a refused sitting must not be written, found %d rows", len(rows))
	}
}

func (w *examWorld) createdSitting(rec *httptest.ResponseRecorder) uuid.UUID {
	w.t.Helper()

	var row struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &row); err != nil {
		w.t.Fatalf("the created sitting was not JSON: %v (%s)", err, rec.Body.String())
	}
	if row.ID == uuid.Nil {
		w.t.Fatalf("the created sitting carried no id: %s", rec.Body.String())
	}
	return row.ID
}

func (w *examWorld) deleteSitting(id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", id.String())
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	rec := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodDelete, "/api/v1/exam-sittings/"+id.String(), nil)
	w.server.deleteExamSitting(rec, request.WithContext(ctx))
	return rec
}

func (w *examWorld) deviations() []*tenantent.TimetableDeviation {
	w.t.Helper()

	rows, err := w.db.Client.TimetableDeviation.Query().
		Where(entdeviation.SectionID(w.sectionA)).
		Order(tenantent.Asc(entdeviation.FieldPeriodID)).
		All(context.Background())
	if err != nil {
		w.t.Fatalf("the deviations could not be read back: %v", err)
	}
	return rows
}

func (w *examWorld) cancelAsHuman(slot uuid.UUID, on time.Time, period uuid.UUID) uuid.UUID {
	w.t.Helper()

	row, err := w.db.Client.TimetableDeviation.Create().
		SetTimetableSlotID(slot).
		SetDeviationDate(on).
		SetKind(entdeviation.KindCancelled).
		SetSectionID(w.sectionA).
		SetPeriodID(period).
		SetSubjectOfferingID(w.chemA).
		SetReason("the teacher is at a funeral").
		SetCreatedBy(w.callerPerson).
		Save(context.Background())
	if err != nil {
		w.t.Fatalf("the cancellation a teacher decided on could not be written: %v", err)
	}
	return row.ID
}

func (w *examWorld) lessonStates(on time.Time) map[uuid.UUID]string {
	w.t.Helper()

	service, err := timetablesvc.FromContext(w.ctx)
	if err != nil {
		w.t.Fatalf("the timetable service could not be resolved: %v", err)
	}
	lens := occurrenceThrough(entslot.SectionIDEQ(w.sectionA), entdeviation.SectionIDEQ(w.sectionA))
	occurrences, err := service.Resolve(w.ctx, timetablesvc.ResolveQuery{
		BranchID:   w.branchID,
		From:       on,
		To:         on,
		Half:       timetablesvc.HalfAny,
		Slots:      []predicate.TimetableSlot{lens.slot},
		Deviations: []predicate.TimetableDeviation{lens.dev},
	})
	if err != nil {
		w.t.Fatalf("the section's day could not be resolved: %v", err)
	}

	out := make(map[uuid.UUID]string, len(occurrences))
	for _, occurrence := range occurrences {
		out[occurrence.PeriodID] = string(occurrence.State)
	}
	return out
}

func TestAnExamSittingCancelsTheLessonItDisplaces(t *testing.T) {
	w := newExamWorld(t)

	if state := w.lessonStates(w.monday)[w.periodP3]; state != "planned" {
		t.Fatalf("the chemistry lesson must start out planned, got %q", state)
	}

	rec := w.createSitting(w.physicsSubject, w.monday, w.periodP3, &w.roomR4)
	if rec.Code != http.StatusCreated {
		t.Fatalf("the sitting must be accepted, got %d: %s", rec.Code, rec.Body.String())
	}
	sitting := w.createdSitting(rec)

	rows := w.deviations()
	if len(rows) != 1 {
		t.Fatalf("the sitting must write exactly one deviation for the lesson it displaces, "+
			"found %d", len(rows))
	}
	row := rows[0]
	if row.Kind != entdeviation.KindCancelled {
		t.Fatalf("the displaced lesson must be cancelled, got %q", row.Kind)
	}
	if row.TimetableSlotID == nil || *row.TimetableSlotID != w.slotAP3 {
		t.Fatalf("the deviation must name the displaced slot %s, got %v",
			w.slotAP3, row.TimetableSlotID)
	}
	if row.ExamSittingID == nil || *row.ExamSittingID != sitting {
		t.Fatalf("the deviation must name the sitting that wrote it (%s), got %v",
			sitting, row.ExamSittingID)
	}
	if row.CreatedBy != nil {
		t.Fatalf("a deviation the system wrote must carry no author, got %s", row.CreatedBy)
	}
	if row.SubjectOfferingID == nil || *row.SubjectOfferingID != w.chemA {
		t.Fatalf("the deviation must carry the offering the slot planned, got %v",
			row.SubjectOfferingID)
	}
	if !row.DeviationDate.Equal(w.monday) {
		t.Fatalf("the deviation must fall on the date of the sitting, got %s", row.DeviationDate)
	}
	if row.Reason == nil || !strings.Contains(*row.Reason, w.examName) {
		t.Fatalf("the reason must name the exam that displaced the lesson, got %v", row.Reason)
	}

	if state := w.lessonStates(w.monday)[w.periodP3]; state != "cancelled" {
		t.Fatalf("the displaced lesson must now resolve as cancelled everywhere a teacher "+
			"looks, got %q", state)
	}
	if state := w.lessonStates(w.monday)[w.periodP4]; state != "planned" {
		t.Fatalf("only the displaced period is cancelled; the next one is still planned, "+
			"got %q", state)
	}
}

func TestDeletingAnExamSittingRestoresTheLessonItCancelled(t *testing.T) {
	w := newExamWorld(t)

	rec := w.createSitting(w.physicsSubject, w.monday, w.periodP3, &w.roomR4)
	if rec.Code != http.StatusCreated {
		t.Fatalf("the sitting must be accepted, got %d: %s", rec.Code, rec.Body.String())
	}
	sitting := w.createdSitting(rec)
	if rows := w.deviations(); len(rows) != 1 {
		t.Fatalf("the sitting must cancel the lesson before it is deleted, found %d", len(rows))
	}

	if got := w.deleteSitting(sitting); got.Code != http.StatusNoContent {
		t.Fatalf("the sitting must be deletable, got %d: %s", got.Code, got.Body.String())
	}

	if rows := w.deviations(); len(rows) != 0 {
		t.Fatalf("deleting the sitting must remove the cancellation it wrote, found %d", len(rows))
	}
	if state := w.lessonStates(w.monday)[w.periodP3]; state != "planned" {
		t.Fatalf("the lesson must be back in the section's year, got %q", state)
	}
}

func TestAnExamSittingOverAFreePeriodCancelsNothing(t *testing.T) {
	w := newExamWorld(t)

	if _, planned := w.lessonStates(w.monday)[w.periodP5]; planned {
		t.Fatal("the fixture must leave the fifth period free for section A")
	}

	rec := w.createSitting(w.physicsSubject, w.monday, w.periodP5, &w.roomR4)
	if rec.Code != http.StatusCreated {
		t.Fatalf("a free period must accept a sitting, got %d: %s", rec.Code, rec.Body.String())
	}
	if rows := w.deviations(); len(rows) != 0 {
		t.Fatalf("a sitting that displaces no lesson must write no deviation, found %d", len(rows))
	}
}

func TestACancellationATeacherDecidedOnSurvivesTheSittingAndItsDeletion(t *testing.T) {
	w := newExamWorld(t)

	theirs := w.cancelAsHuman(w.slotAP3, w.monday, w.periodP3)

	rec := w.createSitting(w.physicsSubject, w.monday, w.periodP3, &w.roomR4)
	if rec.Code != http.StatusCreated {
		t.Fatalf("a lesson already cancelled is the state the sitting wanted, so the sitting "+
			"still stands; got %d: %s", rec.Code, rec.Body.String())
	}
	sitting := w.createdSitting(rec)

	rows := w.deviations()
	if len(rows) != 1 || rows[0].ID != theirs {
		t.Fatalf("the sitting must write nothing over a cancellation it did not make, "+
			"found %d rows", len(rows))
	}
	if rows[0].ExamSittingID != nil {
		t.Fatalf("a deviation the sitting did not write must not be claimed by it, got %v",
			rows[0].ExamSittingID)
	}

	if got := w.deleteSitting(sitting); got.Code != http.StatusNoContent {
		t.Fatalf("the sitting must be deletable, got %d: %s", got.Code, got.Body.String())
	}

	rows = w.deviations()
	if len(rows) != 1 || rows[0].ID != theirs {
		t.Fatalf("deleting the exam must not delete a cancellation a teacher decided on, "+
			"found %d rows", len(rows))
	}
	if state := w.lessonStates(w.monday)[w.periodP3]; state != "cancelled" {
		t.Fatalf("that cancellation must still hold after the exam is gone, got %q", state)
	}
}
