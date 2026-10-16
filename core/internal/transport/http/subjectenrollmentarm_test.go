package http

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
)

func (w *electiveWorld) enroll(enrollment, offering uuid.UUID, extra string) *httptest.ResponseRecorder {
	w.t.Helper()

	body := fmt.Sprintf(`{"student_enrollment_id":%q,"subject_offering_id":%q%s}`,
		enrollment, offering, extra)
	return w.call(w.registrar.createSubjectEnrollment, http.MethodPost,
		"/api/v1/subject-enrollments", body, nil)
}

func (w *electiveWorld) patchEnrollment(id uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()

	return w.call(w.registrar.updateSubjectEnrollment, http.MethodPatch,
		"/api/v1/subject-enrollments/"+id.String(), body,
		map[string]string{"id": id.String()})
}

func (w *electiveWorld) activeArms(enrollment uuid.UUID, arms ...uuid.UUID) int {
	w.t.Helper()

	count, err := w.db.Client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.StudentEnrollmentID(enrollment),
			entsubjenroll.SubjectOfferingIDIn(arms...),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		).
		Count(w.ctx)
	if err != nil {
		w.t.Fatalf("the arms held by %s could not be counted: %v", enrollment, err)
	}
	return count
}

func (w *electiveWorld) refusalSays(rec *httptest.ResponseRecorder, want int, fragments ...string) {
	w.t.Helper()

	if rec.Code != want {
		w.t.Fatalf("want %d, got %d: %s", want, rec.Code, rec.Body.String())
	}
	said := rec.Body.String()
	for _, fragment := range fragments {
		if !strings.Contains(said, fragment) {
			w.t.Fatalf("the refusal must name %q, got %s", fragment, said)
		}
	}
}

func TestTheOrdinaryEnrollmentRouteRefusesASecondArm(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()

	if rec := w.enroll(w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm may be reached by the ordinary door, got %d: %s",
			rec.Code, rec.Body.String())
	}

	w.refusalSays(w.enroll(w.enrolP1, w.computerA, ""), http.StatusConflict,
		w.hindiA.String(), group.String(), "one arm")

	if held := w.activeArms(w.enrolP1, w.hindiA, w.computerA); held != 1 {
		t.Fatalf("the pupil must still hold exactly one arm, got %d", held)
	}
	rows, err := w.db.Client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.StudentEnrollmentID(w.enrolP1),
			entsubjenroll.SubjectOfferingID(w.computerA),
		).
		Count(w.ctx)
	if err != nil {
		t.Fatalf("the refused row could not be counted: %v", err)
	}
	if rows != 0 {
		t.Fatalf("a refused enrolment must not be written, got %d rows", rows)
	}
}

func TestTheSecondArmIsRefusedWhicheverDoorTookTheFirst(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()

	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the elective route must take the first arm, got %d: %s",
			rec.Code, rec.Body.String())
	}

	w.refusalSays(w.enroll(w.enrolP1, w.computerA, ""), http.StatusConflict, "one arm")
	if held := w.activeArms(w.enrolP1, w.hindiA, w.computerA); held != 1 {
		t.Fatalf("the pupil must still hold exactly one arm, got %d", held)
	}
}

func TestEnrollingIntoASubjectNoGroupHoldsIsUnaffected(t *testing.T) {
	w := newElectiveWorld(t)

	w.groupWithBothArms()

	if rec := w.enroll(w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("an arm the pupil does not yet hold must land, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if rec := w.enroll(w.enrolP1, w.physicsA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("physics is nobody's elective arm and must land, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if rec := w.enroll(w.enrolP2, w.computerA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("another pupil's first arm must land, got %d: %s",
			rec.Code, rec.Body.String())
	}
}

func TestAWithdrawnArmFreesTheChoice(t *testing.T) {
	w := newElectiveWorld(t)

	w.groupWithBothArms()

	if rec := w.enroll(w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must land, got %d: %s", rec.Code, rec.Body.String())
	}
	hindi := w.enrollmentOf(w.enrolP1, w.hindiA)

	if rec := w.patchEnrollment(hindi.ID,
		`{"status":"dropped","dropped_on":"2026-07-01"}`); rec.Code != http.StatusOK {
		t.Fatalf("the pupil must be able to leave the arm, got %d: %s",
			rec.Code, rec.Body.String())
	}

	if rec := w.enroll(w.enrolP1, w.computerA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("a withdrawn arm is not a held arm and the other must be open, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if held := w.activeArms(w.enrolP1, w.hindiA, w.computerA); held != 1 {
		t.Fatalf("the pupil must hold exactly one arm, got %d", held)
	}
}

func TestAnEnrollmentThatIsNotActiveIsNotASecondChoice(t *testing.T) {
	w := newElectiveWorld(t)

	w.groupWithBothArms()

	if rec := w.enroll(w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must land, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := w.enroll(w.enrolP1, w.computerA,
		`,"status":"dropped","dropped_on":"2026-07-01"`); rec.Code != http.StatusCreated {
		t.Fatalf("a dropped row is not a choice and must be recordable, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if held := w.activeArms(w.enrolP1, w.hindiA, w.computerA); held != 1 {
		t.Fatalf("only the active arm counts, got %d", held)
	}
}

func TestReactivatingTheArmAPupilLeftIsRefusedWhileTheOtherIsHeld(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()

	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must land, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := w.change(group, w.enrolP1, w.computerA, ""); rec.Code != http.StatusOK {
		t.Fatalf("the pupil must be able to change arm, got %d: %s", rec.Code, rec.Body.String())
	}

	hindi := w.enrollmentOf(w.enrolP1, w.hindiA)
	if hindi.Status != entsubjenroll.StatusDropped {
		t.Fatalf("the arm the pupil left must be dropped, got %q", hindi.Status)
	}

	w.refusalSays(w.patchEnrollment(hindi.ID, `{"status":"active"}`), http.StatusConflict,
		w.computerA.String(), "one arm")

	again := w.enrollmentOf(w.enrolP1, w.hindiA)
	if again.Status != entsubjenroll.StatusDropped {
		t.Fatalf("a refused re-activation must leave the row dropped, got %q", again.Status)
	}
	if held := w.activeArms(w.enrolP1, w.hindiA, w.computerA); held != 1 {
		t.Fatalf("the pupil must still hold exactly one arm, got %d", held)
	}
}

func TestTheArmAPupilHoldsAloneMayBeReactivated(t *testing.T) {
	w := newElectiveWorld(t)

	w.groupWithBothArms()

	if rec := w.enroll(w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must land, got %d: %s", rec.Code, rec.Body.String())
	}
	hindi := w.enrollmentOf(w.enrolP1, w.hindiA)

	if rec := w.patchEnrollment(hindi.ID,
		`{"status":"dropped","dropped_on":"2026-07-01"}`); rec.Code != http.StatusOK {
		t.Fatalf("the arm must be droppable, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := w.patchEnrollment(hindi.ID, `{"status":"active"}`); rec.Code != http.StatusOK {
		t.Fatalf("a pupil who holds no other arm may return to this one, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if held := w.activeArms(w.enrolP1, w.hindiA, w.computerA); held != 1 {
		t.Fatalf("the pupil must hold exactly one arm, got %d", held)
	}
}

func TestAnUnreachableSubjectEnrollmentIsStillAFourOhFourOnReactivation(t *testing.T) {
	w := newElectiveWorld(t)

	w.groupWithBothArms()

	if rec := w.enroll(w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must land, got %d: %s", rec.Code, rec.Body.String())
	}
	rec := w.patchEnrollment(uuid.New(), `{"status":"active"}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("a subject enrolment that does not exist must answer 404, got %d: %s",
			rec.Code, rec.Body.String())
	}
}
