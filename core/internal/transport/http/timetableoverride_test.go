package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
)

type overridingGuard struct{ timetableGuard }

func (g overridingGuard) Allow(ctx context.Context, subject *authorization.Subject,
	entity authorization.Entity, attrs authorization.Attributes) (authorization.Decision, error) {
	if entity == authorization.TimetableOverride {
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Rule:     "timetable override test guard",
		}, nil
	}
	return g.timetableGuard.Allow(ctx, subject, entity, attrs)
}

func (overridingGuard) Name() string { return "timetable override database test guard" }

type clashBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Clashes []struct {
		Rule        string `json:"rule"`
		Overridable bool   `json:"overridable"`
		Overridden  bool   `json:"overridden"`
		Override    *struct {
			Reason string     `json:"reason"`
			By     *uuid.UUID `json:"overridden_by"`
		} `json:"override"`
	} `json:"clashes"`
	Count      int  `json:"count"`
	Clear      bool `json:"clear"`
	Blocking   int  `json:"blocking"`
	Overridden int  `json:"overridden"`
}

func (w *timetableWorld) mayOverride() *timetableWorld {
	w.server = &Server{guard: overridingGuard{}}
	return w
}

func (w *timetableWorld) createSlot(body string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.server.createTimetableSlot, "POST",
		"/api/v1/timetables/"+w.timetableID.String()+"/slots", body, w.timetableID)
}

func (w *timetableWorld) doubleBooking(extra string) string {
	return `{"section_id":"` + w.taughtSectionID.String() +
		`","period_id":"` + w.periodP1.String() +
		`","day_of_week":1,"label":"Extra drill","teacher_id":"` + w.teacherID.String() +
		`","room_id":"` + w.roomA.String() + `"` + extra + `}`
}

func (w *timetableWorld) createdSlotID(rec *httptest.ResponseRecorder) uuid.UUID {
	w.t.Helper()
	var row struct {
		ID uuid.UUID `json:"id"`
	}
	timetableBody(w.t, rec, &row)
	if row.ID == uuid.Nil {
		w.t.Fatalf("the reply carries no slot id: %s", strings.TrimSpace(rec.Body.String()))
	}
	return row.ID
}

func TestOverrideWithoutAReasonIsRefused(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	rec := w.createSlot(w.doubleBooking(`,"clash_override":true`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 for an override that explains nothing, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), entslot.FieldClashOverrideReason) {
		t.Fatalf("the refusal must name the missing field, got %s",
			strings.TrimSpace(rec.Body.String()))
	}

	n := w.db.Client.TimetableSlot.Query().
		Where(entslot.TimetableID(w.timetableID)).
		CountX(context.Background())
	if n != 3 {
		t.Fatalf("a reasonless override wrote the slot anyway: the timetable holds %d slots", n)
	}
}

func TestOverrideWithABlankReasonIsRefused(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	rec := w.createSlot(w.doubleBooking(`,"clash_override":true,"clash_override_reason":"   \t  "`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 for a whitespace reason, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	n := w.db.Client.TimetableSlot.Query().
		Where(entslot.TimetableID(w.timetableID)).
		CountX(context.Background())
	if n != 3 {
		t.Fatalf("a whitespace reason wrote the slot anyway: the timetable holds %d slots", n)
	}
}

func TestAClashingSlotWithNoOverrideIsStillRefusedUnchanged(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	rec := w.createSlot(w.doubleBooking(""))
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409 when nobody asked to override, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body clashBody
	timetableBody(t, rec, &body)
	if body.Code != TimetableClashCode {
		t.Fatalf("the refusal must keep the %q code, got %q", TimetableClashCode, body.Code)
	}
	if len(body.Clashes) == 0 {
		t.Fatal("the refusal must still name the clashing parties")
	}
}

func TestOverridingWithoutTheOverrideKeyIsForbidden(t *testing.T) {
	w := newTimetableWorld(t)

	rec := w.createSlot(w.doubleBooking(
		`,"clash_override":true,"clash_override_reason":"the head asked for a split class"`))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403 for a caller holding only %s, got %d: %s",
			authorization.TimetableWrite, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), string(authorization.TimetableOverride)) {
		t.Fatalf("the refusal must name the key that is missing, got %s",
			strings.TrimSpace(rec.Body.String()))
	}
}

func TestAnOverriddenClashIsSavedAndRecordsWhoWhyAndWhichClash(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	rec := w.createSlot(w.doubleBooking(
		`,"clash_override":true,"clash_override_reason":"the head asked for a split class"`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201 for an explained override, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row := w.slot(w.createdSlotID(rec))
	if !row.ClashOverride {
		t.Fatal("the saved slot carries no override flag")
	}
	if row.ClashOverrideReason == nil || *row.ClashOverrideReason != "the head asked for a split class" {
		t.Fatalf("the reason was not recorded, got %v", row.ClashOverrideReason)
	}
	if row.ClashOverriddenBy == nil || *row.ClashOverriddenBy != w.personID {
		t.Fatalf("the override must name the person who made it (%s), got %v",
			w.personID, row.ClashOverriddenBy)
	}
	if row.ClashOverriddenAt == nil {
		t.Fatal("the override must record when it was made")
	}
	if len(row.ClashOverrideJSON) == 0 {
		t.Fatal("'this slot has an override' is weaker than naming the clash it accepts: " +
			"clash_override_json is empty")
	}

	named := false
	for _, accepted := range row.ClashOverrideJSON {
		if accepted.Rule != string("teacher") {
			continue
		}
		if accepted.TeacherID == nil || *accepted.TeacherID != w.teacherID {
			t.Fatalf("the accepted clash must name teacher %s, got %v",
				w.teacherID, accepted.TeacherID)
		}
		if accepted.CounterpartSlotID == nil || *accepted.CounterpartSlotID != w.taughtSlotP1 {
			t.Fatalf("the accepted clash must name the other party %s, got %v",
				w.taughtSlotP1, accepted.CounterpartSlotID)
		}
		if accepted.DayOfWeek != 1 {
			t.Fatalf("the accepted clash must name the day, got %d", accepted.DayOfWeek)
		}
		named = true
	}
	if !named {
		t.Fatalf("no teacher clash was recorded, got %+v", row.ClashOverrideJSON)
	}
}

func TestAnOverriddenClashIsStillReportedAsAClash(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	rec := w.createSlot(w.doubleBooking(
		`,"clash_override":true,"clash_override_reason":"the head asked for a split class"`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201 for an explained override, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	check := w.call(w.server.checkTimetableClashes, "POST",
		"/api/v1/timetables/"+w.timetableID.String()+"/clash-check", `{"proposed":[]}`, w.timetableID)
	if check.Code != http.StatusOK {
		t.Fatalf("want 200 from the clash check, got %d: %s",
			check.Code, strings.TrimSpace(check.Body.String()))
	}

	var body clashBody
	timetableBody(t, check, &body)
	if body.Clear || body.Count == 0 {
		t.Fatalf("an accepted exception is not a resolved one: the clash vanished, got %+v", body)
	}
	if body.Overridden == 0 {
		t.Fatalf("the clash is reported but never marked as overridden, got %+v", body)
	}
	if body.Blocking != 0 {
		t.Fatalf("every clash here is overridden, so none should block, got %d", body.Blocking)
	}

	for _, clash := range body.Clashes {
		if clash.Rule != "teacher" {
			continue
		}
		if !clash.Overridden || clash.Override == nil {
			t.Fatalf("the teacher clash must carry its override, got %+v", clash)
		}
		if clash.Override.Reason != "the head asked for a split class" {
			t.Fatalf("the reported override must carry the reason, got %q", clash.Override.Reason)
		}
		if clash.Override.By == nil || *clash.Override.By != w.personID {
			t.Fatalf("the reported override must name who accepted it, got %v", clash.Override.By)
		}
	}
}

func TestEditingAnOverriddenSlotDoesNotNeedTheReasonRepeated(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	rec := w.createSlot(w.doubleBooking(
		`,"clash_override":true,"clash_override_reason":"the head asked for a split class"`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201 for an explained override, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	id := w.createdSlotID(rec)

	edit := w.call(w.server.updateTimetableSlot, "PATCH",
		"/api/v1/timetable-slots/"+id.String(), `{"label":"Extra drill, renamed"}`, id)
	if edit.Code != http.StatusOK {
		t.Fatalf("an unrelated edit to an already-accepted slot must not be refused, got %d: %s",
			edit.Code, strings.TrimSpace(edit.Body.String()))
	}

	row := w.slot(id)
	if !row.ClashOverride || len(row.ClashOverrideJSON) == 0 {
		t.Fatal("the edit dropped the override that was already accepted")
	}
	if row.ClashOverrideReason == nil || *row.ClashOverrideReason != "the head asked for a split class" {
		t.Fatalf("the original reason must survive an unrelated edit, got %v", row.ClashOverrideReason)
	}
}

func TestWithdrawingTheOverrideBringsTheRefusalBack(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	rec := w.createSlot(w.doubleBooking(
		`,"clash_override":true,"clash_override_reason":"the head asked for a split class"`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201 for an explained override, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	id := w.createdSlotID(rec)

	edit := w.call(w.server.updateTimetableSlot, "PATCH",
		"/api/v1/timetable-slots/"+id.String(), `{"clash_override":false}`, id)
	if edit.Code != http.StatusConflict {
		t.Fatalf("withdrawing the override leaves a bare clash and must be refused, got %d: %s",
			edit.Code, strings.TrimSpace(edit.Body.String()))
	}

	row := w.slot(id)
	if !row.ClashOverride {
		t.Fatal("the refused withdrawal removed the override anyway")
	}
}

func TestTheOverrideIsDroppedWhenTheClashIsResolved(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	rec := w.createSlot(w.doubleBooking(
		`,"clash_override":true,"clash_override_reason":"the head asked for a split class"`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201 for an explained override, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	id := w.createdSlotID(rec)

	edit := w.call(w.server.updateTimetableSlot, "PATCH",
		"/api/v1/timetable-slots/"+id.String(),
		`{"day_of_week":4,"teacher_id":null,"room_id":null}`, id)
	if edit.Code != http.StatusOK {
		t.Fatalf("moving the slot out of the way must succeed, got %d: %s",
			edit.Code, strings.TrimSpace(edit.Body.String()))
	}

	row := w.slot(id)
	if row.ClashOverride || len(row.ClashOverrideJSON) != 0 || row.ClashOverrideReason != nil {
		t.Fatalf("an override must not outlive the clash it accepted, got %+v", row)
	}
}

func TestServerOwnedOverrideFieldsCannotBeSupplied(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	for _, field := range []string{
		entslot.FieldClashOverriddenBy,
		entslot.FieldClashOverriddenAt,
		entslot.FieldClashOverrideJSON,
	} {
		rec := w.createSlot(w.doubleBooking(
			`,"clash_override":true,"clash_override_reason":"split class","` +
				field + `":"` + uuid.NewString() + `"`))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s is the server's to write: want 400, got %d: %s",
				field, rec.Code, strings.TrimSpace(rec.Body.String()))
		}
		if !strings.Contains(rec.Body.String(), field) {
			t.Fatalf("the refusal must name %s, got %s", field, strings.TrimSpace(rec.Body.String()))
		}
	}
}

func TestAnOverrideOnASlotThatDoesNotClashIsNotRecorded(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()

	body := `{"section_id":"` + w.taughtSectionID.String() +
		`","period_id":"` + w.periodP2.String() +
		`","day_of_week":2,"label":"Free period drill",` +
		`"clash_override":true,"clash_override_reason":"asked for just in case"}`

	rec := w.createSlot(body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("Tuesday P2 is free, so the slot must save: got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row := w.slot(w.createdSlotID(rec))
	if row.ClashOverride || row.ClashOverrideReason != nil || len(row.ClashOverrideJSON) != 0 {
		t.Fatalf("an override that accepts nothing is a phantom audit record, got %+v", row)
	}
}

func TestAStudentSetClashIsNotOverridable(t *testing.T) {
	w := newTimetableWorld(t).mayOverride()
	ctx := context.Background()

	second := w.db.Client.SubjectOffering.Create().
		SetAcademicSessionID(w.sessionID).
		SetSectionID(w.taughtSectionID).
		SetSubjectID(w.db.Client.Subject.Create().
			SetName("History " + uuid.NewString()[:8]).
			SetCode("TTH-" + uuid.NewString()[:8]).
			SaveX(ctx).ID).
		SaveX(ctx)

	person := w.db.Client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Pupil").
		SetDisplayName("Pupil " + uuid.NewString()[:8]).
		SaveX(ctx)
	student := w.db.Client.Student.Create().
		SetPersonID(person.ID).
		SetAdmissionNumber("TTS-" + uuid.NewString()[:8]).
		SaveX(ctx)
	enrollment := w.db.Client.StudentEnrollment.Create().
		SetStudentID(student.ID).
		SetAcademicSessionID(w.sessionID).
		SetSectionID(w.taughtSectionID).
		SetEnrollmentDate(timetableDate(2026, time.April, 1)).
		SaveX(ctx)
	for _, offering := range []uuid.UUID{w.taughtOfferingID, second.ID} {
		w.db.Client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrollment.ID).
			SetSubjectOfferingID(offering).
			SetStudentID(student.ID).
			SetAcademicSessionID(w.sessionID).
			SaveX(ctx)
	}

	body := `{"section_id":"` + w.taughtSectionID.String() +
		`","period_id":"` + w.periodP1.String() +
		`","day_of_week":1,"subject_offering_id":"` + second.ID.String() +
		`","clash_override":true,"clash_override_reason":"the head asked for it"}`

	rec := w.createSlot(body)
	if rec.Code != http.StatusConflict {
		t.Fatalf("a pupil cannot be in two rooms at once: want 409 even with an override, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var refusal clashBody
	timetableBody(t, rec, &refusal)
	saw := false
	for _, clash := range refusal.Clashes {
		if clash.Rule != "student_set" {
			continue
		}
		saw = true
		if clash.Overridable {
			t.Fatal("a student-set clash must report itself as not overridable")
		}
	}
	if !saw {
		t.Fatalf("the fixture produced no student-set clash, so this proves nothing: %+v", refusal)
	}

	n := w.db.Client.TimetableSlot.Query().
		Where(entslot.TimetableID(w.timetableID)).
		CountX(ctx)
	if n != 3 {
		t.Fatalf("the unoverridable slot was written anyway: the timetable holds %d slots", n)
	}
}
