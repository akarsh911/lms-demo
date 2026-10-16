package timetable_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbellperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellscheduleperiod"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

func date(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

type fixture struct {
	t   *testing.T
	ctx context.Context
	db  *tenantent.Client

	SessionID uuid.UUID
	BranchID  uuid.UUID

	SectionXIA  uuid.UUID
	SectionXIIA uuid.UUID
	SectionXIIB uuid.UUID

	SchemeID     uuid.UUID
	P1           uuid.UUID
	P2           uuid.UUID
	P3           uuid.UUID
	P4           uuid.UUID
	BellRegular  uuid.UUID
	BellSaturday uuid.UUID

	RoomA uuid.UUID
	RoomB uuid.UUID
	RoomC uuid.UUID

	Teacher map[string]uuid.UUID
	Student map[string]uuid.UUID
	Enrolls map[string]uuid.UUID

	OffPhysics  uuid.UUID
	OffHistory  uuid.UUID
	OffCommerce uuid.UUID
	OffMathsA   uuid.UUID
	OffMathsB   uuid.UUID

	TimetableID uuid.UUID
	Slot        map[string]uuid.UUID

	Mon time.Time
	Tue time.Time
	Wed time.Time
	Thu time.Time
	Fri time.Time
	Sat time.Time
	Sun time.Time
}

func newFixture(t *testing.T) *fixture {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)

	f := &fixture{
		t:       t,
		ctx:     ctx,
		db:      db.Client,
		Teacher: map[string]uuid.UUID{},
		Student: map[string]uuid.UUID{},
		Enrolls: map[string]uuid.UUID{},
		Slot:    map[string]uuid.UUID{},

		Mon: date(2026, time.April, 6),
		Tue: date(2026, time.April, 7),
		Wed: date(2026, time.April, 8),
		Thu: date(2026, time.April, 9),
		Fri: date(2026, time.April, 10),
		Sat: date(2026, time.April, 11),
		Sun: date(2026, time.April, 12),
	}

	tag := uuid.NewString()[:8]

	f.SessionID = f.db.AcademicSession.Create().
		SetName("Timetable Probe " + tag).
		SetCode("TTP-" + tag).
		SetStartDate(date(2026, time.April, 1)).
		SetEndDate(date(2027, time.March, 31)).
		SetStatus("active").
		SaveX(ctx).ID

	f.BranchID = f.db.Branch.Create().
		SetName("Probe Campus " + tag).
		SetCode("PRB-" + tag).
		SaveX(ctx).ID

	gradeXI := f.db.GradeLevel.Create().
		SetName("XI").SetCode("XI-" + tag).SetSequence(11).SaveX(ctx).ID
	gradeXII := f.db.GradeLevel.Create().
		SetName("XII").SetCode("XII-" + tag).SetSequence(12).SaveX(ctx).ID

	f.SectionXIA = f.section(gradeXI, "A", "XI-A-"+tag)
	f.SectionXIIA = f.section(gradeXII, "A", "XII-A-"+tag)
	f.SectionXIIB = f.section(gradeXII, "B", "XII-B-"+tag)

	f.RoomA = f.room("Room A "+tag, "RA-"+tag)
	f.RoomB = f.room("Room B "+tag, "RB-"+tag)
	f.RoomC = f.room("Room C "+tag, "RC-"+tag)

	for _, name := range []string{"t1", "t2", "t3", "t4", "t5", "t6"} {
		f.Teacher[name] = f.teacher(name + "-" + tag)
	}

	f.SchemeID = f.db.PeriodScheme.Create().
		SetAcademicSessionID(f.SessionID).
		SetBranchID(f.BranchID).
		SetName("Senior Scheme " + tag).
		SetCode("SEN-" + tag).
		SaveX(ctx).ID

	f.P1 = f.period("Period 1", "P1-"+tag, 1)
	f.P2 = f.period("Period 2", "P2-"+tag, 2)
	f.P3 = f.period("Period 3", "P3-"+tag, 3)
	f.P4 = f.period("Period 4", "P4-"+tag, 4)

	f.BellRegular = f.db.BellSchedule.Create().
		SetPeriodSchemeID(f.SchemeID).
		SetName("Regular").
		SetCode("REG-" + tag).
		SetIsDefault(true).
		SaveX(ctx).ID
	f.BellSaturday = f.db.BellSchedule.Create().
		SetPeriodSchemeID(f.SchemeID).
		SetName("Saturday").
		SetCode("SAT-" + tag).
		SaveX(ctx).ID

	f.bell(f.BellRegular, f.P1, 545, 585)
	f.bell(f.BellRegular, f.P2, 585, 625)
	f.bell(f.BellRegular, f.P3, 625, 665)
	f.bell(f.BellRegular, f.P4, 725, 765)

	f.bell(f.BellSaturday, f.P1, 500, 535)
	f.bell(f.BellSaturday, f.P2, 535, 570)
	f.bell(f.BellSaturday, f.P3, 570, 605)
	f.bell(f.BellSaturday, f.P4, 780, 820)

	f.calendar(f.Mon, entcalendarday.DayTypeInstructional, true, true, f.BellRegular, nil)
	f.calendar(f.Tue, entcalendarday.DayTypeInstructional, true, true, f.BellRegular, nil)
	holiday := "Founder Day"
	f.calendar(f.Wed, entcalendarday.DayTypeHoliday, false, false, f.BellRegular, &holiday)
	f.calendar(f.Thu, entcalendarday.DayTypeInstructional, true, true, f.BellRegular, nil)
	f.calendar(f.Fri, entcalendarday.DayTypeInstructional, true, true, f.BellRegular, nil)
	f.calendar(f.Sat, entcalendarday.DayTypeInstructional, true, false, f.BellSaturday, nil)

	physics := f.subject("Physics "+tag, "PHY-"+tag)
	history := f.subject("History "+tag, "HIS-"+tag)
	commerce := f.subject("Commerce "+tag, "COM-"+tag)
	maths := f.subject("Mathematics "+tag, "MTH-"+tag)

	f.OffPhysics = f.offering(f.SectionXIA, physics)
	f.OffHistory = f.offering(f.SectionXIA, history)
	f.OffCommerce = f.offering(f.SectionXIA, commerce)
	f.OffMathsA = f.offering(f.SectionXIIA, maths)
	f.OffMathsB = f.offering(f.SectionXIIB, maths)

	f.enrol("s1", f.SectionXIA, f.OffPhysics)
	f.enrol("s2", f.SectionXIA, f.OffPhysics)
	f.enrol("s3", f.SectionXIA, f.OffHistory)
	f.enrol("s4", f.SectionXIA, f.OffHistory)
	f.enrol("s5", f.SectionXIA, f.OffCommerce)
	f.enrol("s6", f.SectionXIA, f.OffCommerce)
	f.enrol("s7", f.SectionXIIA, f.OffMathsA)
	f.enrol("s8", f.SectionXIIA, f.OffMathsA)
	f.enrol("s9", f.SectionXIIB, f.OffMathsB)
	f.enrol("s10", f.SectionXIIB, f.OffMathsB)

	f.TimetableID = f.db.Timetable.Create().
		SetAcademicSessionID(f.SessionID).
		SetPeriodSchemeID(f.SchemeID).
		SetName("Senior Timetable " + tag).
		SetVersion(1).
		SetEffectiveFrom(date(2026, time.April, 1)).
		SetStatus(enttimetable.StatusPublished).
		SaveX(ctx).ID

	f.slot("xia-mon-p1", f.SectionXIA, 1, f.P1, f.OffPhysics, f.Teacher["t1"], &f.RoomA)
	f.slot("xia-mon-p2", f.SectionXIA, 1, f.P2, f.OffHistory, f.Teacher["t2"], &f.RoomB)
	f.slot("xia-mon-p3", f.SectionXIA, 1, f.P3, f.OffCommerce, f.Teacher["t5"], &f.RoomA)
	f.slot("xia-mon-p4-phy", f.SectionXIA, 1, f.P4, f.OffPhysics, f.Teacher["t5"], &f.RoomA)
	f.slot("xia-mon-p4-his", f.SectionXIA, 1, f.P4, f.OffHistory, f.Teacher["t6"], &f.RoomB)
	f.slot("xia-tue-p1", f.SectionXIA, 2, f.P1, f.OffPhysics, f.Teacher["t1"], &f.RoomA)
	f.slot("xia-wed-p1", f.SectionXIA, 3, f.P1, f.OffPhysics, f.Teacher["t1"], &f.RoomA)
	f.slot("xia-sat-p1", f.SectionXIA, 6, f.P1, f.OffPhysics, f.Teacher["t1"], &f.RoomA)
	f.slot("xia-sat-p4", f.SectionXIA, 6, f.P4, f.OffHistory, f.Teacher["t6"], &f.RoomB)

	f.slot("xiia-mon-p2", f.SectionXIIA, 1, f.P2, f.OffMathsA, f.Teacher["t1"], &f.RoomC)
	f.slot("xiia-mon-p3", f.SectionXIIA, 1, f.P3, f.OffMathsA, f.Teacher["t4"], nil)
	f.slot("xiib-mon-p3", f.SectionXIIB, 1, f.P3, f.OffMathsB, f.Teacher["t3"], nil)

	return f
}

func (f *fixture) section(gradeID uuid.UUID, name, code string) uuid.UUID {
	f.t.Helper()
	return f.db.Section.Create().
		SetAcademicSessionID(f.SessionID).
		SetBranchID(f.BranchID).
		SetGradeLevelID(gradeID).
		SetName(name).
		SetCode(code).
		SaveX(f.ctx).ID
}

func (f *fixture) room(name, code string) uuid.UUID {
	f.t.Helper()
	return f.db.Room.Create().
		SetBranchID(f.BranchID).
		SetName(name).
		SetCode(code).
		SaveX(f.ctx).ID
}

func (f *fixture) person(label string) uuid.UUID {
	f.t.Helper()
	return f.db.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName(label).
		SetDisplayName(label).
		SaveX(f.ctx).ID
}

func (f *fixture) teacher(label string) uuid.UUID {
	f.t.Helper()
	personID := f.person(label)
	staffID := f.db.Staff.Create().
		SetPersonID(personID).
		SetEmployeeCode("EMP-" + label).
		SetBranchID(f.BranchID).
		SaveX(f.ctx).ID
	return f.db.Teacher.Create().
		SetStaffID(staffID).
		SetTeacherCode("TCH-" + label).
		SaveX(f.ctx).ID
}

func (f *fixture) period(name, code string, sequence int) uuid.UUID {
	f.t.Helper()
	return f.db.Period.Create().
		SetPeriodSchemeID(f.SchemeID).
		SetName(name).
		SetCode(code).
		SetSequence(sequence).
		SaveX(f.ctx).ID
}

func (f *fixture) bell(bellID, periodID uuid.UUID, start, end int) {
	f.t.Helper()
	f.db.BellSchedulePeriod.Create().
		SetBellScheduleID(bellID).
		SetPeriodID(periodID).
		SetStartMinute(start).
		SetEndMinute(end).
		SaveX(f.ctx)
}

func (f *fixture) suppress(bellID, periodID uuid.UUID) {
	f.t.Helper()
	f.db.BellSchedulePeriod.Update().
		Where(entbellperiod.BellScheduleID(bellID), entbellperiod.PeriodID(periodID)).
		SetRuns(false).
		SaveX(f.ctx)
}

func (f *fixture) unbell(bellID, periodID uuid.UUID) {
	f.t.Helper()
	f.db.BellSchedulePeriod.Delete().
		Where(entbellperiod.BellScheduleID(bellID), entbellperiod.PeriodID(periodID)).
		ExecX(f.ctx)
}

func (f *fixture) calendar(
	on time.Time,
	dayType entcalendarday.DayType,
	forenoon, afternoon bool,
	bellID uuid.UUID,
	name *string,
) uuid.UUID {
	f.t.Helper()
	create := f.db.CalendarDay.Create().
		SetAcademicSessionID(f.SessionID).
		SetBranchID(f.BranchID).
		SetCalendarDate(on).
		SetDayType(dayType).
		SetForenoonOpen(forenoon).
		SetAfternoonOpen(afternoon)
	if name != nil {
		create = create.SetName(*name)
	}
	dayID := create.SaveX(f.ctx).ID

	f.db.CalendarDaySchedule.Create().
		SetCalendarDayID(dayID).
		SetPeriodSchemeID(f.SchemeID).
		SetBellScheduleID(bellID).
		SaveX(f.ctx)
	return dayID
}

func (f *fixture) subject(name, code string) uuid.UUID {
	f.t.Helper()
	return f.db.Subject.Create().
		SetName(name).
		SetCode(code).
		SaveX(f.ctx).ID
}

func (f *fixture) offering(sectionID, subjectID uuid.UUID) uuid.UUID {
	f.t.Helper()
	return f.db.SubjectOffering.Create().
		SetAcademicSessionID(f.SessionID).
		SetSectionID(sectionID).
		SetSubjectID(subjectID).
		SaveX(f.ctx).ID
}

func (f *fixture) enrol(label string, sectionID, offeringID uuid.UUID) {
	f.t.Helper()
	personID := f.person(label)
	studentID := f.db.Student.Create().
		SetPersonID(personID).
		SetAdmissionNumber("ADM-" + label + "-" + uuid.NewString()[:8]).
		SaveX(f.ctx).ID
	enrollmentID := f.db.StudentEnrollment.Create().
		SetStudentID(studentID).
		SetAcademicSessionID(f.SessionID).
		SetSectionID(sectionID).
		SetEnrollmentDate(date(2026, time.April, 1)).
		SaveX(f.ctx).ID

	f.Student[label] = studentID
	f.Enrolls[label] = enrollmentID
	f.enrolSubject(label, offeringID)
}

func (f *fixture) enrolSubject(label string, offeringID uuid.UUID) {
	f.t.Helper()
	f.db.StudentSubjectEnrollment.Create().
		SetStudentEnrollmentID(f.Enrolls[label]).
		SetSubjectOfferingID(offeringID).
		SetStudentID(f.Student[label]).
		SetAcademicSessionID(f.SessionID).
		SaveX(f.ctx)
}

func (f *fixture) slot(
	key string,
	sectionID uuid.UUID,
	dayOfWeek int,
	periodID, offeringID, teacherID uuid.UUID,
	roomID *uuid.UUID,
) uuid.UUID {
	f.t.Helper()
	create := f.db.TimetableSlot.Create().
		SetTimetableID(f.TimetableID).
		SetSectionID(sectionID).
		SetPeriodID(periodID).
		SetDayOfWeek(dayOfWeek).
		SetSubjectOfferingID(offeringID).
		SetTeacherID(teacherID)
	if roomID != nil {
		create = create.SetRoomID(*roomID)
	}
	id := create.SaveX(f.ctx).ID
	f.Slot[key] = id
	return id
}

func (f *fixture) deviate(slotKey string, on time.Time, kind entdeviation.Kind) *tenantent.TimetableDeviationCreate {
	f.t.Helper()
	slotID := f.Slot[slotKey]
	slot := f.db.TimetableSlot.GetX(f.ctx, slotID)
	create := f.db.TimetableDeviation.Create().
		SetTimetableSlotID(slotID).
		SetDeviationDate(on).
		SetKind(kind).
		SetSectionID(slot.SectionID).
		SetPeriodID(slot.PeriodID)
	if slot.SubjectOfferingID != nil {
		create = create.SetSubjectOfferingID(*slot.SubjectOfferingID)
	}
	return create
}

func (f *fixture) cancel(slotKey string, on time.Time) uuid.UUID {
	f.t.Helper()
	return f.deviate(slotKey, on, entdeviation.KindCancelled).
		SetReason("teacher on leave").
		SaveX(f.ctx).ID
}

func (f *fixture) substitute(slotKey string, on time.Time, teacherID uuid.UUID) uuid.UUID {
	f.t.Helper()
	return f.deviate(slotKey, on, entdeviation.KindSubstitution).
		SetSubstituteTeacherID(teacherID).
		SaveX(f.ctx).ID
}

func (f *fixture) moveRoom(slotKey string, on time.Time, roomID uuid.UUID) uuid.UUID {
	f.t.Helper()
	return f.deviate(slotKey, on, entdeviation.KindRoomChange).
		SetRoomID(roomID).
		SaveX(f.ctx).ID
}

func (f *fixture) addClass(
	on time.Time,
	sectionID, periodID, offeringID, teacherID, roomID uuid.UUID,
) uuid.UUID {
	f.t.Helper()
	return f.db.TimetableDeviation.Create().
		SetDeviationDate(on).
		SetKind(entdeviation.KindAdded).
		SetSectionID(sectionID).
		SetPeriodID(periodID).
		SetSubjectOfferingID(offeringID).
		SetSubstituteTeacherID(teacherID).
		SetRoomID(roomID).
		SetReason("make-up class").
		SaveX(f.ctx).ID
}
