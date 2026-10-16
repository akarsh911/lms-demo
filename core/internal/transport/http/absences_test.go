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
	entabsence "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherabsence"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	mw "github.com/Harbour-Emerge/emerge-core/internal/transport/http/middleware"
)

const absencesPath = "/api/v1/teacher-absences"

type absenceBody struct {
	ID          uuid.UUID  `json:"id"`
	TeacherID   uuid.UUID  `json:"teacher_id"`
	FromDate    time.Time  `json:"from_date"`
	ToDate      time.Time  `json:"to_date"`
	FromHalf    string     `json:"from_half"`
	ToHalf      string     `json:"to_half"`
	Status      string     `json:"status"`
	Reason      *string    `json:"reason"`
	RecordedBy  *uuid.UUID `json:"recorded_by"`
	WithdrawnAt *time.Time `json:"withdrawn_at"`
	WithdrawnBy *uuid.UUID `json:"withdrawn_by"`
}

type absenceListBody struct {
	Absences []absenceBody `json:"teacher_absences"`
	Count    int           `json:"count"`
	Status   string        `json:"status"`
}

type absenceLessonRow struct {
	SlotID    *uuid.UUID `json:"timetable_slot_id"`
	PeriodID  uuid.UUID  `json:"period_id"`
	SectionID uuid.UUID  `json:"section_id"`
	Date      time.Time  `json:"date"`
	State     string     `json:"state"`
	Cover     string     `json:"cover"`
	TeacherID *uuid.UUID `json:"teacher_id"`
}

type absenceLessonsBody struct {
	AbsenceID uuid.UUID          `json:"teacher_absence_id"`
	TeacherID uuid.UUID          `json:"teacher_id"`
	Status    string             `json:"status"`
	Lessons   []absenceLessonRow `json:"lessons"`
	Count     int                `json:"count"`
	Covered   int                `json:"covered_count"`
	Uncovered int                `json:"uncovered_count"`
	Cancelled int                `json:"cancelled_count"`
}

type absenceWithdrawalBody struct {
	Absence absenceBody `json:"teacher_absence"`
	Cover   []struct {
		ID uuid.UUID `json:"id"`
	} `json:"cover_left_in_place"`
	CoverCount int `json:"cover_count"`
}

func (w *timetableWorld) absenceCover(slot uuid.UUID, on time.Time, substitute uuid.UUID) uuid.UUID {
	w.t.Helper()

	row := w.slot(slot)
	create := w.db.Client.TimetableDeviation.Create().
		SetTimetableSlotID(slot).
		SetDeviationDate(on).
		SetKind(entdeviation.KindSubstitution).
		SetSectionID(row.SectionID).
		SetPeriodID(row.PeriodID).
		SetSubstituteTeacherID(substitute).
		SetReason("cover arranged by hand")
	if row.SubjectOfferingID != nil {
		create = create.SetSubjectOfferingID(*row.SubjectOfferingID)
	}
	return create.SaveX(context.Background()).ID
}

func (w *timetableWorld) absenceSpareTeacher() uuid.UUID {
	w.t.Helper()

	ctx := context.Background()
	tag := uuid.NewString()[:8]

	person := w.db.Client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Cover").
		SetDisplayName("Cover Teacher " + tag).
		SaveX(ctx)
	staff := w.db.Client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("ABS-" + tag).
		SaveX(ctx)
	return w.db.Client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx).ID
}

func (w *timetableWorld) absenceOf(teacher uuid.UUID, from, to time.Time) uuid.UUID {
	w.t.Helper()

	return w.db.Client.TeacherAbsence.Create().
		SetTeacherID(teacher).
		SetFromDate(from).
		SetToDate(to).
		SetReason("recorded directly in the fixture").
		SaveX(context.Background()).ID
}

func (w *timetableWorld) recordAbsence(body string) *httptest.ResponseRecorder {
	w.t.Helper()

	return w.call(w.server.createTeacherAbsence, "POST", absencesPath, body, uuid.Nil)
}

func (w *timetableWorld) mustRecordAbsence(body string) absenceBody {
	w.t.Helper()

	rec := w.recordAbsence(body)
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("want 201 when recording an absence, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var row absenceBody
	timetableBody(w.t, rec, &row)
	return row
}

func (w *timetableWorld) absenceLessons(id uuid.UUID) absenceLessonsBody {
	w.t.Helper()

	rec := w.call(w.server.getTeacherAbsenceLessons, "GET",
		absencesPath+"/"+id.String()+"/lessons", "", id)
	if rec.Code != http.StatusOK {
		w.t.Fatalf("want 200 from the lessons an absence affects, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body absenceLessonsBody
	timetableBody(w.t, rec, &body)
	if body.Count != len(body.Lessons) {
		w.t.Fatalf("count %d does not match the %d lessons returned", body.Count, len(body.Lessons))
	}
	return body
}

func (b absenceLessonsBody) coverOfPeriod(t *testing.T, period uuid.UUID) absenceLessonRow {
	t.Helper()

	for _, lesson := range b.Lessons {
		if lesson.PeriodID == period {
			return lesson
		}
	}
	t.Fatalf("no lesson in period %s among the %d the absence affects", period, len(b.Lessons))
	return absenceLessonRow{}
}

func (w *timetableWorld) wholeDay(on time.Time) string {
	return `{"teacher_id":"` + w.teacherID.String() + `","from_date":"` +
		on.Format(dateLayout) + `","reason":"flu"}`
}

func TestAnAbsenceRecordsTheFactAndArrangesNoCoverByItself(t *testing.T) {
	w := newTimetableWorld(t)

	row := w.mustRecordAbsence(w.wholeDay(w.monday))
	if row.Status != string(entabsence.StatusRecorded) {
		t.Fatalf("a new absence must be recorded, got %q", row.Status)
	}
	if row.FromDate.Format(dateLayout) != w.monday.Format(dateLayout) ||
		row.ToDate.Format(dateLayout) != w.monday.Format(dateLayout) {
		t.Fatalf("a one-day absence must end on the day it starts, got %s to %s",
			row.FromDate.Format(dateLayout), row.ToDate.Format(dateLayout))
	}
	if row.FromHalf != string(entabsence.FromHalfForenoon) ||
		row.ToHalf != string(entabsence.ToHalfAfternoon) {
		t.Fatalf("a day with no halves named runs forenoon to afternoon, got %s to %s",
			row.FromHalf, row.ToHalf)
	}
	if row.RecordedBy == nil || *row.RecordedBy != w.personID {
		t.Fatalf("recorded_by must name the caller %s, got %v", w.personID, row.RecordedBy)
	}

	deviations, err := w.db.Client.TimetableDeviation.Query().
		Where(
			entdeviation.DeviationDate(w.monday),
			entdeviation.HasTimetableSlotWith(entslot.TeacherIDEQ(w.teacherID)),
		).
		All(context.Background())
	if err != nil {
		t.Fatalf("reading the deviations back: %v", err)
	}
	if len(deviations) != 0 {
		t.Fatalf("recording an absence must not write cover by itself; it wrote %d deviations",
			len(deviations))
	}

	lessons := w.absenceLessons(row.ID)
	if lessons.Count != 2 || lessons.Uncovered != 2 || lessons.Covered != 0 {
		t.Fatalf("both of the day's lessons must show as uncovered, got %d lessons, %d covered, %d uncovered",
			lessons.Count, lessons.Covered, lessons.Uncovered)
	}
	for _, lesson := range lessons.Lessons {
		if lesson.State != string(timetablesvc.StatePlanned) {
			t.Fatalf("an absence must leave the lesson planned, got state %q", lesson.State)
		}
	}
}

func TestTheLessonsAnAbsenceAffectsSeparateCoveredFromUncovered(t *testing.T) {
	w := newTimetableWorld(t)

	substitute := w.absenceSpareTeacher()
	w.absenceCover(w.taughtSlotP1, w.monday, substitute)

	row := w.mustRecordAbsence(w.wholeDay(w.monday))
	lessons := w.absenceLessons(row.ID)

	if lessons.Count != 2 || lessons.Covered != 1 || lessons.Uncovered != 1 {
		t.Fatalf("one covered and one uncovered lesson expected, got %d lessons, %d covered, %d uncovered",
			lessons.Count, lessons.Covered, lessons.Uncovered)
	}

	covered := lessons.coverOfPeriod(t, w.periodP1)
	if covered.Cover != coverArranged {
		t.Fatalf("the lesson with a substitution must read as %q, got %q", coverArranged, covered.Cover)
	}
	if covered.TeacherID == nil || *covered.TeacherID != substitute {
		t.Fatalf("the covered lesson must name the substitute %s, got %v", substitute, covered.TeacherID)
	}

	uncovered := lessons.coverOfPeriod(t, w.periodP2)
	if uncovered.Cover != coverMissing {
		t.Fatalf("the lesson nobody is covering must read as %q, got %q", coverMissing, uncovered.Cover)
	}
	if uncovered.TeacherID == nil || *uncovered.TeacherID != w.teacherID {
		t.Fatalf("the uncovered lesson still names the absent teacher %s, got %v",
			w.teacherID, uncovered.TeacherID)
	}
}

func TestACancelledLessonInAnAbsenceIsNeitherCoveredNorUncovered(t *testing.T) {
	w := newTimetableWorld(t)

	w.cancel(w.taughtSlotP2, w.monday)

	row := w.mustRecordAbsence(w.wholeDay(w.monday))
	lessons := w.absenceLessons(row.ID)

	if lessons.Cancelled != 1 || lessons.Uncovered != 1 || lessons.Covered != 0 {
		t.Fatalf("one cancelled and one uncovered lesson expected, got %d cancelled, %d uncovered, %d covered",
			lessons.Cancelled, lessons.Uncovered, lessons.Covered)
	}
	if got := lessons.coverOfPeriod(t, w.periodP2).Cover; got != coverDropped {
		t.Fatalf("a cancelled lesson needs no cover and must read as %q, got %q", coverDropped, got)
	}
}

func TestWithdrawingAnAbsenceKeepsTheCoverAHumanArranged(t *testing.T) {
	w := newTimetableWorld(t)

	substitute := w.absenceSpareTeacher()
	deviation := w.absenceCover(w.taughtSlotP1, w.monday, substitute)
	row := w.mustRecordAbsence(w.wholeDay(w.monday))

	rec := w.call(w.server.withdrawTeacherAbsence, "DELETE",
		absencesPath+"/"+row.ID.String()+"?reason=she+came+in+after+all", "", row.ID)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 when withdrawing an absence, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body absenceWithdrawalBody
	timetableBody(t, rec, &body)
	if body.Absence.Status != string(entabsence.StatusWithdrawn) {
		t.Fatalf("the withdrawn absence must say so, got %q", body.Absence.Status)
	}
	if body.Absence.WithdrawnAt == nil || body.Absence.WithdrawnBy == nil {
		t.Fatalf("a withdrawal records when and by whom, got %+v", body.Absence)
	}
	if body.CoverCount != 1 || len(body.Cover) != 1 || body.Cover[0].ID != deviation {
		t.Fatalf("the withdrawal must report the cover it left in place (%s), got %+v",
			deviation, body)
	}

	still, err := w.db.Client.TimetableDeviation.Query().
		Where(entdeviation.ID(deviation)).
		Exist(context.Background())
	if err != nil {
		t.Fatalf("reading the deviation back: %v", err)
	}
	if !still {
		t.Fatal("withdrawing an absence deleted cover a human arranged")
	}

	again := w.call(w.server.withdrawTeacherAbsence, "DELETE",
		absencesPath+"/"+row.ID.String(), "", row.ID)
	if again.Code != http.StatusConflict {
		t.Fatalf("want 409 when withdrawing an absence twice, got %d: %s",
			again.Code, strings.TrimSpace(again.Body.String()))
	}

	read := w.call(w.server.getTeacherAbsence, "GET",
		absencesPath+"/"+row.ID.String(), "", row.ID)
	if read.Code != http.StatusOK {
		t.Fatalf("a withdrawn absence is still a record and must read back, got %d: %s",
			read.Code, strings.TrimSpace(read.Body.String()))
	}
}

func TestAnOverlappingAbsenceIsRefusedAndATouchingOneIsNot(t *testing.T) {
	w := newTimetableWorld(t)

	tuesday := w.monday.AddDate(0, 0, 1)
	wednesday := w.monday.AddDate(0, 0, 2)

	first := w.mustRecordAbsence(`{"teacher_id":"` + w.teacherID.String() +
		`","from_date":"` + w.monday.Format(dateLayout) +
		`","to_date":"` + tuesday.Format(dateLayout) + `","to_half":"forenoon"}`)

	clash := w.recordAbsence(`{"teacher_id":"` + w.teacherID.String() +
		`","from_date":"` + tuesday.Format(dateLayout) +
		`","to_date":"` + wednesday.Format(dateLayout) + `"}`)
	if clash.Code != http.StatusConflict {
		t.Fatalf("want 409 for an absence overlapping tuesday forenoon, got %d: %s",
			clash.Code, strings.TrimSpace(clash.Body.String()))
	}
	if !strings.Contains(clash.Body.String(), first.ID.String()) {
		t.Fatalf("the refusal must name the absence it clashes with (%s), got %s",
			first.ID, strings.TrimSpace(clash.Body.String()))
	}

	touching := w.recordAbsence(`{"teacher_id":"` + w.teacherID.String() +
		`","from_date":"` + tuesday.Format(dateLayout) + `","from_half":"afternoon"` +
		`,"to_date":"` + wednesday.Format(dateLayout) + `"}`)
	if touching.Code != http.StatusCreated {
		t.Fatalf("an absence starting the half-day after another ends does not overlap it; got %d: %s",
			touching.Code, strings.TrimSpace(touching.Body.String()))
	}

	withdraw := w.call(w.server.withdrawTeacherAbsence, "DELETE",
		absencesPath+"/"+first.ID.String(), "", first.ID)
	if withdraw.Code != http.StatusOK {
		t.Fatalf("want 200 withdrawing the first absence, got %d: %s",
			withdraw.Code, strings.TrimSpace(withdraw.Body.String()))
	}

	again := w.recordAbsence(`{"teacher_id":"` + w.teacherID.String() +
		`","from_date":"` + w.monday.Format(dateLayout) +
		`","to_date":"` + tuesday.Format(dateLayout) + `","to_half":"forenoon"}`)
	if again.Code != http.StatusCreated {
		t.Fatalf("a withdrawn absence must not block the window it used to hold; got %d: %s",
			again.Code, strings.TrimSpace(again.Body.String()))
	}
}

func TestAnAmendedAbsenceMovesAndAWithdrawnOneDoesNot(t *testing.T) {
	w := newTimetableWorld(t)

	tuesday := w.monday.AddDate(0, 0, 1)
	row := w.mustRecordAbsence(w.wholeDay(w.monday))

	rec := w.call(w.server.updateTeacherAbsence, "PATCH",
		absencesPath+"/"+row.ID.String(),
		`{"to_date":"`+tuesday.Format(dateLayout)+`","reason":"still unwell"}`, row.ID)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 amending an absence, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var amended absenceBody
	timetableBody(t, rec, &amended)
	if amended.ToDate.Format(dateLayout) != tuesday.Format(dateLayout) {
		t.Fatalf("the amendment must extend the absence to %s, got %s",
			tuesday.Format(dateLayout), amended.ToDate.Format(dateLayout))
	}
	if amended.FromDate.Format(dateLayout) != w.monday.Format(dateLayout) {
		t.Fatalf("the amendment must leave from_date alone, got %s",
			amended.FromDate.Format(dateLayout))
	}

	owned := w.call(w.server.updateTeacherAbsence, "PATCH",
		absencesPath+"/"+row.ID.String(), `{"status":"withdrawn"}`, row.ID)
	if owned.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 when a caller supplies the withdrawal itself, got %d: %s",
			owned.Code, strings.TrimSpace(owned.Body.String()))
	}

	moved := w.call(w.server.updateTeacherAbsence, "PATCH",
		absencesPath+"/"+row.ID.String(),
		`{"teacher_id":"`+w.absenceSpareTeacher().String()+`"}`, row.ID)
	if moved.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 when an absence is moved to another teacher, got %d: %s",
			moved.Code, strings.TrimSpace(moved.Body.String()))
	}

	withdraw := w.call(w.server.withdrawTeacherAbsence, "DELETE",
		absencesPath+"/"+row.ID.String(), "", row.ID)
	if withdraw.Code != http.StatusOK {
		t.Fatalf("want 200 withdrawing the absence, got %d: %s",
			withdraw.Code, strings.TrimSpace(withdraw.Body.String()))
	}

	late := w.call(w.server.updateTeacherAbsence, "PATCH",
		absencesPath+"/"+row.ID.String(), `{"reason":"changed my mind"}`, row.ID)
	if late.Code != http.StatusConflict {
		t.Fatalf("want 409 amending a withdrawn absence, got %d: %s",
			late.Code, strings.TrimSpace(late.Body.String()))
	}
}

func TestAHalfDayAbsenceOnlyReachesThatHalfOfTheDay(t *testing.T) {
	w := newTimetableWorld(t)

	afternoon := w.mustRecordAbsence(`{"teacher_id":"` + w.teacherID.String() +
		`","from_date":"` + w.monday.Format(dateLayout) + `","from_half":"afternoon"}`)
	if got := w.absenceLessons(afternoon.ID); got.Count != 0 {
		t.Fatalf("both of the day's lessons run before noon, so an afternoon absence reaches none of them; got %d",
			got.Count)
	}

	withdraw := w.call(w.server.withdrawTeacherAbsence, "DELETE",
		absencesPath+"/"+afternoon.ID.String(), "", afternoon.ID)
	if withdraw.Code != http.StatusOK {
		t.Fatalf("want 200 withdrawing the afternoon absence, got %d: %s",
			withdraw.Code, strings.TrimSpace(withdraw.Body.String()))
	}

	forenoon := w.mustRecordAbsence(`{"teacher_id":"` + w.teacherID.String() +
		`","from_date":"` + w.monday.Format(dateLayout) + `","to_half":"forenoon"}`)
	if got := w.absenceLessons(forenoon.ID); got.Count != 2 {
		t.Fatalf("a forenoon absence reaches both morning lessons, got %d", got.Count)
	}
}

func TestOneTeachersAbsenceIsNotReadableByAnother(t *testing.T) {
	w := newTimetableWorld(t)

	stranger := w.absenceSpareTeacher()
	theirs := w.absenceOf(stranger, w.monday, w.monday)
	mine := w.mustRecordAbsence(w.wholeDay(w.monday))

	rec := w.call(w.server.listTeacherAbsences, "GET", absencesPath, "", uuid.Nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 listing absences, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var list absenceListBody
	timetableBody(t, rec, &list)

	seen := map[uuid.UUID]bool{}
	for _, row := range list.Absences {
		seen[row.ID] = true
	}
	if !seen[mine.ID] {
		t.Fatalf("the viewer's own absence %s must be listed, got %+v", mine.ID, list.Absences)
	}
	if seen[theirs] {
		t.Fatalf("absence %s belongs to another teacher and is personal data; it must not be listed",
			theirs)
	}

}

func TestAnotherTeachersAbsenceIsNotFoundRatherThanForbidden(t *testing.T) {
	w := newTimetableWorld(t)

	theirs := w.absenceOf(w.absenceSpareTeacher(), w.monday, w.monday)

	read := w.call(w.server.getTeacherAbsence, "GET", absencesPath+"/"+theirs.String(), "", theirs)
	if read.Code == http.StatusForbidden {
		t.Fatalf("403 confirms the absence exists; the reply must not distinguish it from a missing row: %s",
			strings.TrimSpace(read.Body.String()))
	}
	if read.Code != http.StatusNotFound {
		t.Fatalf("want 404 for another teacher's absence, got %d: %s",
			read.Code, strings.TrimSpace(read.Body.String()))
	}

	lessons := w.call(w.server.getTeacherAbsenceLessons, "GET",
		absencesPath+"/"+theirs.String()+"/lessons", "", theirs)
	if lessons.Code != http.StatusNotFound {
		t.Fatalf("want 404 for the lessons of another teacher's absence, got %d: %s",
			lessons.Code, strings.TrimSpace(lessons.Body.String()))
	}
}

func TestRecordingAnAbsenceForAnotherTeacherIsRefused(t *testing.T) {
	w := newTimetableWorld(t)

	stranger := w.absenceSpareTeacher()
	rec := w.recordAbsence(`{"teacher_id":"` + stranger.String() +
		`","from_date":"` + w.monday.Format(dateLayout) + `"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403 recording an absence for a teacher the grant does not reach, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	count, err := w.db.Client.TeacherAbsence.Query().
		Where(entabsence.TeacherIDEQ(stranger)).
		Count(context.Background())
	if err != nil {
		t.Fatalf("counting the absences back: %v", err)
	}
	if count != 0 {
		t.Fatalf("the refused absence must not have been written, found %d", count)
	}
}

func TestTeacherAbsenceRoutesGuardTheEntityTheContractNames(t *testing.T) {
	guard := &recordingGuard{}
	server := quietServer(guard)

	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) {
		r.Use(mw.DevSubject(slog.Default()))
		server.mountTeacherAbsences(r)
	})

	id := probeID
	cases := []routeCase{
		{"GET", absencesPath, absencesPath, authorization.TimetableRead, false},
		{"POST", absencesPath, absencesPath, authorization.TimetableWrite, false},
		{"GET", absencesPath + "/" + id, absencesPath + "/{id}", authorization.TimetableRead, false},
		{"PATCH", absencesPath + "/" + id, absencesPath + "/{id}", authorization.TimetableWrite, false},
		{"DELETE", absencesPath + "/" + id, absencesPath + "/{id}", authorization.TimetableDelete, false},
		{"GET", absencesPath + "/" + id + "/lessons", absencesPath + "/{id}/lessons",
			authorization.TimetableRead, false},
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

func TestTeacherAbsencesAreMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	for _, pattern := range []string{
		"GET " + absencesPath,
		"POST " + absencesPath,
		"GET " + absencesPath + "/{id}",
		"PATCH " + absencesPath + "/{id}",
		"DELETE " + absencesPath + "/{id}",
		"GET " + absencesPath + "/{id}/lessons",
	} {
		if !found[pattern] && !found[pattern+"/"] {
			t.Errorf("%s is not mounted on the real router, so the handler is unreachable however well it is tested",
				pattern)
		}
	}
}
