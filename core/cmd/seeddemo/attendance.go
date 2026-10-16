package main

import (
	"context"
	"fmt"
	"hash/fnv"
	"sort"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entattendanceday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceday"
	entattendanceperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceperiod"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	svc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

const attendanceBatch = 500

type halfMark struct {
	student uuid.UUID
	date    time.Time
	half    svc.Half
}

func markFor(student uuid.UUID, date time.Time, half svc.Half) entattendanceperiod.Status {
	h := fnv.New32a()
	_, _ = h.Write(student[:])
	_, _ = h.Write([]byte(date.Format(dateLayout)))
	_, _ = h.Write([]byte(half))
	switch n := h.Sum32() % 100; {
	case n < 93:
		return entattendanceperiod.StatusPresent
	case n < 97:
		return entattendanceperiod.StatusAbsent
	case n < 99:
		return entattendanceperiod.StatusLate
	default:
		return entattendanceperiod.StatusExcused
	}
}

func dayStatus(status entattendanceperiod.Status) entattendanceday.ForenoonStatus {
	return entattendanceday.ForenoonStatus(status)
}

func (s *seeder) attendance(ctx context.Context, a *academics) error {
	if s.o.dryRun {
		fmt.Println("dry run: attendance is resolved from the timetable, so it is skipped")
		return nil
	}
	if s.o.attendanceDays < 1 {
		return nil
	}

	dates, err := s.openDates(ctx, a)
	if err != nil {
		return err
	}
	today := s.today()
	past := make([]time.Time, 0, len(dates))
	for _, d := range dates {
		if d.Before(today) {
			past = append(past, d)
		}
	}
	if len(past) == 0 {
		return nil
	}
	if len(past) > s.o.attendanceDays {
		past = past[len(past)-s.o.attendanceDays:]
	}
	from, to := past[0], past[len(past)-1]

	occurrences, err := svc.New(s.client).Resolve(ctx, svc.ResolveQuery{
		BranchID:      a.branch.ID,
		From:          from,
		To:            to,
		OmitCancelled: true,
	})
	if err != nil {
		return fmt.Errorf("resolve %s..%s: %w", from.Format(dateLayout), to.Format(dateLayout), err)
	}

	roster, err := s.offeringRoster(ctx, a, occurrences)
	if err != nil {
		return err
	}
	sectionOf, err := s.sectionOfStudent(ctx, a)
	if err != nil {
		return err
	}

	marked, err := s.markedPeriods(ctx, a, from, to)
	if err != nil {
		return err
	}
	registered, err := s.markedDays(ctx, a, from, to)
	if err != nil {
		return err
	}

	location := s.location()
	halves := map[halfMark]entattendanceperiod.Status{}
	builders := make([]*tenantent.AttendancePeriodCreate, 0, attendanceBatch)

	for _, occ := range occurrences {
		if occ.PeriodKind != "teaching" || occ.SubjectOfferingID == nil || !occ.TimesResolved {
			continue
		}
		half := svc.HalfOfMinute(occ.StartMinute)
		at := time.Date(occ.Date.Year(), occ.Date.Month(), occ.Date.Day(),
			occ.EndMinute/60, occ.EndMinute%60, 0, 0, location).UTC()

		for _, student := range roster[*occ.SubjectOfferingID] {
			status := markFor(student, occ.Date, half)
			halves[halfMark{student: student, date: occ.Date, half: half}] = status

			key := student.String() + "|" + occ.Date.Format(dateLayout) + "|" + occ.PeriodID.String()
			if marked[key] {
				continue
			}
			marked[key] = true

			create := s.client.AttendancePeriod.Create().
				SetStudentID(student).
				SetAcademicSessionID(a.session.ID).
				SetSubjectOfferingID(*occ.SubjectOfferingID).
				SetPeriodID(occ.PeriodID).
				SetAttendanceDate(occ.Date).
				SetStatus(status).
				SetSource(entattendanceperiod.SourceManual).
				SetMarkedAt(at)
			if occ.SlotID != nil {
				create = create.SetTimetableSlotID(*occ.SlotID)
			}
			if occ.TeacherID != nil {
				create = create.SetTeacherID(*occ.TeacherID)
			}
			if status == entattendanceperiod.StatusExcused {
				create = create.SetReasonCode("prior_leave")
			}
			builders = append(builders, create)

			if len(builders) == attendanceBatch {
				if err := s.flushPeriods(ctx, builders); err != nil {
					return err
				}
				builders = builders[:0]
			}
		}
	}
	if err := s.flushPeriods(ctx, builders); err != nil {
		return err
	}

	return s.registers(ctx, a, halves, sectionOf, registered, location)
}

func (s *seeder) flushPeriods(ctx context.Context, builders []*tenantent.AttendancePeriodCreate) error {
	if len(builders) == 0 {
		return nil
	}
	if _, err := s.client.AttendancePeriod.CreateBulk(builders...).Save(ctx); err != nil {
		return err
	}
	s.note("attendance_period", len(builders))
	return nil
}

func (s *seeder) registers(ctx context.Context, a *academics,
	halves map[halfMark]entattendanceperiod.Status, sectionOf map[uuid.UUID]uuid.UUID,
	registered map[string]bool, location *time.Location) error {
	type register struct {
		student uuid.UUID
		date    time.Time
		fore    *entattendanceperiod.Status
		after   *entattendanceperiod.Status
	}

	byStudentDate := map[string]*register{}
	order := make([]string, 0, len(halves))
	for mark, status := range halves {
		key := mark.student.String() + "|" + mark.date.Format(dateLayout)
		row, ok := byStudentDate[key]
		if !ok {
			row = &register{student: mark.student, date: mark.date}
			byStudentDate[key] = row
			order = append(order, key)
		}
		value := status
		if mark.half == svc.HalfForenoon {
			row.fore = &value
			continue
		}
		row.after = &value
	}
	sort.Strings(order)

	builders := make([]*tenantent.AttendanceDayCreate, 0, attendanceBatch)
	for _, key := range order {
		if registered[key] {
			continue
		}
		row := byStudentDate[key]
		section, ok := sectionOf[row.student]
		if !ok {
			continue
		}
		if row.fore == nil && row.after == nil {
			continue
		}

		create := s.client.AttendanceDay.Create().
			SetStudentID(row.student).
			SetAcademicSessionID(a.session.ID).
			SetSectionID(section).
			SetAttendanceDate(row.date).
			SetSource(entattendanceday.SourceManual).
			SetMarkedAt(time.Date(row.date.Year(), row.date.Month(), row.date.Day(), 16, 0, 0, 0, location).UTC())
		if row.fore != nil {
			create = create.SetForenoonStatus(dayStatus(*row.fore))
		}
		if row.after != nil {
			create = create.SetAfternoonStatus(entattendanceday.AfternoonStatus(*row.after))
		}
		builders = append(builders, create)

		if len(builders) == attendanceBatch {
			if err := s.flushDays(ctx, builders); err != nil {
				return err
			}
			builders = builders[:0]
		}
	}
	return s.flushDays(ctx, builders)
}

func (s *seeder) flushDays(ctx context.Context, builders []*tenantent.AttendanceDayCreate) error {
	if len(builders) == 0 {
		return nil
	}
	if _, err := s.client.AttendanceDay.CreateBulk(builders...).Save(ctx); err != nil {
		return err
	}
	s.note("attendance_day", len(builders))
	return nil
}

func (s *seeder) offeringRoster(ctx context.Context, a *academics,
	occurrences []svc.Occurrence) (map[uuid.UUID][]uuid.UUID, error) {
	wanted := map[uuid.UUID]bool{}
	for _, occ := range occurrences {
		if occ.SubjectOfferingID != nil {
			wanted[*occ.SubjectOfferingID] = true
		}
	}
	if len(wanted) == 0 {
		return map[uuid.UUID][]uuid.UUID{}, nil
	}
	ids := make([]uuid.UUID, 0, len(wanted))
	for id := range wanted {
		ids = append(ids, id)
	}

	rows, err := s.client.StudentSubjectEnrollment.Query().Where(
		entsubjenroll.SubjectOfferingIDIn(ids...),
		entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
	).All(ctx)
	if err != nil {
		return nil, err
	}

	out := map[uuid.UUID][]uuid.UUID{}
	for _, row := range rows {
		out[row.SubjectOfferingID] = append(out[row.SubjectOfferingID], row.StudentID)
	}
	for id := range out {
		students := out[id]
		sort.Slice(students, func(i, j int) bool { return students[i].String() < students[j].String() })
	}
	return out, nil
}

func (s *seeder) sectionOfStudent(ctx context.Context, a *academics) (map[uuid.UUID]uuid.UUID, error) {
	rows, err := s.client.StudentEnrollment.Query().Where(
		entenrollment.AcademicSessionID(a.session.ID),
		entenrollment.StatusEQ(entenrollment.StatusActive),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]uuid.UUID, len(rows))
	for _, row := range rows {
		out[row.StudentID] = row.SectionID
	}
	return out, nil
}

func (s *seeder) markedPeriods(ctx context.Context, a *academics, from, to time.Time) (map[string]bool, error) {
	rows, err := s.client.AttendancePeriod.Query().Where(
		entattendanceperiod.AcademicSessionID(a.session.ID),
		entattendanceperiod.AttendanceDateGTE(from),
		entattendanceperiod.AttendanceDateLTE(to),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(rows))
	for _, row := range rows {
		out[row.StudentID.String()+"|"+svc.Day(row.AttendanceDate).Format(dateLayout)+"|"+row.PeriodID.String()] = true
	}
	return out, nil
}

func (s *seeder) markedDays(ctx context.Context, a *academics, from, to time.Time) (map[string]bool, error) {
	rows, err := s.client.AttendanceDay.Query().Where(
		entattendanceday.AcademicSessionID(a.session.ID),
		entattendanceday.AttendanceDateGTE(from),
		entattendanceday.AttendanceDateLTE(to),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(rows))
	for _, row := range rows {
		out[row.StudentID.String()+"|"+svc.Day(row.AttendanceDate).Format(dateLayout)] = true
	}
	return out, nil
}
