package http

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

type electiveGuard struct{ narrowEnrollments bool }

func (g electiveGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	tenant := authorization.Decision{
		Allowed:  true,
		Reach:    authorization.ReachTenant,
		HasReach: true,
		Rule:     "elective test guard",
	}
	taught := authorization.Decision{
		Allowed:  true,
		Reach:    authorization.ReachTeacherAssignment,
		HasReach: true,
		Rule:     "elective test guard",
	}

	switch entity {
	case authorization.SubjectOfferingsRead, authorization.SubjectOfferingsWrite,
		authorization.SubjectOfferingsDelete,
		authorization.CurriculumReadAll, authorization.CurriculumWriteAll:
		return tenant, nil
	case authorization.SubjectEnrollmentsRead, authorization.SubjectEnrollmentsWrite:
		if g.narrowEnrollments {
			return taught, nil
		}
		return tenant, nil
	case authorization.SubjectEnrollmentsReadAll, authorization.SubjectEnrollmentsWriteAll:
		if g.narrowEnrollments {
			return authorization.Decision{}, nil
		}
		return tenant, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (electiveGuard) Name() string { return "elective database test guard" }

type electiveWorld struct {
	*examWorld

	registrar *Server
	narrowed  *Server

	hindiA    uuid.UUID
	computerA uuid.UUID
	frenchB   uuid.UUID

	hindiTeacher    uuid.UUID
	computerTeacher uuid.UUID

	pupilP1 uuid.UUID
	enrolP1 uuid.UUID
	pupilP2 uuid.UUID
	enrolP2 uuid.UUID
	pupilB1 uuid.UUID
	enrolB1 uuid.UUID
}

func newElectiveWorld(t *testing.T) *electiveWorld {
	t.Helper()

	base := newExamWorld(t)
	client := base.db.Client
	ctx := base.ctx
	tag := uuid.NewString()[:8]

	newSubject := func(name, code string) uuid.UUID {
		return client.Subject.Create().
			SetName(name + " " + tag).
			SetCode(code + "-" + tag).
			SetIsElective(true).
			SaveX(ctx).ID
	}
	newOffering := func(section, subject uuid.UUID) uuid.UUID {
		return client.SubjectOffering.Create().
			SetAcademicSessionID(base.sessionID).
			SetSectionID(section).
			SetSubjectID(subject).
			SaveX(ctx).ID
	}

	hindiA := newOffering(base.sectionA, newSubject("Hindi", "ELH"))
	computerA := newOffering(base.sectionA, newSubject("Computer", "ELC"))
	frenchB := newOffering(base.sectionB, newSubject("French", "ELF"))

	newTeacher := func(code string) uuid.UUID {
		person := client.Person.Create().
			SetCasUserID(uuid.New()).
			SetFirstName("Elective").
			SetDisplayName("Elective " + code + " " + tag).
			SaveX(ctx)
		staff := client.Staff.Create().
			SetPersonID(person.ID).
			SetEmployeeCode(code + "-" + tag).
			SaveX(ctx)
		return client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx).ID
	}

	newPupil := func(code string, section uuid.UUID) (uuid.UUID, uuid.UUID) {
		person := client.Person.Create().
			SetCasUserID(uuid.New()).
			SetFirstName("Elective").
			SetDisplayName("Elective Pupil " + code + " " + tag).
			SaveX(ctx)
		student := client.Student.Create().
			SetPersonID(person.ID).
			SetAdmissionNumber(code + "-" + tag).
			SaveX(ctx)
		enrolled := client.StudentEnrollment.Create().
			SetStudentID(student.ID).
			SetAcademicSessionID(base.sessionID).
			SetSectionID(section).
			SetEnrollmentDate(base.monday).
			SetRollNumber(code).
			SaveX(ctx)
		return student.ID, enrolled.ID
	}

	p1, e1 := newPupil("ELP1", base.sectionA)
	p2, e2 := newPupil("ELP2", base.sectionA)
	b1, eb1 := newPupil("ELB1", base.sectionB)

	return &electiveWorld{
		examWorld:       base,
		registrar:       &Server{guard: electiveGuard{}},
		narrowed:        &Server{guard: electiveGuard{narrowEnrollments: true}},
		hindiA:          hindiA,
		computerA:       computerA,
		frenchB:         frenchB,
		hindiTeacher:    newTeacher("ELT1"),
		computerTeacher: newTeacher("ELT2"),
		pupilP1:         p1,
		enrolP1:         e1,
		pupilP2:         p2,
		enrolP2:         e2,
		pupilB1:         b1,
		enrolB1:         eb1,
	}
}

func (w *electiveWorld) call(handler http.HandlerFunc, method, target, body string,
	params map[string]string) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	for name, value := range params {
		route.URLParams.Add(name, value)
	}
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	rec := httptest.NewRecorder()
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	handler(rec, request.WithContext(ctx))
	return rec
}

func (w *electiveWorld) idOf(rec *httptest.ResponseRecorder, key string, want int) uuid.UUID {
	w.t.Helper()

	if rec.Code != want {
		w.t.Fatalf("want %d, got %d: %s", want, rec.Code, rec.Body.String())
	}
	var body map[string]struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("the response was not the envelope shape: %v (%s)", err, rec.Body.String())
	}
	row, ok := body[key]
	if !ok {
		w.t.Fatalf("the response carries no %q: %s", key, rec.Body.String())
	}
	return row.ID
}

func (w *electiveWorld) newGroup(section uuid.UUID, code string) uuid.UUID {
	w.t.Helper()

	body := fmt.Sprintf(`{"section_id":%q,"name":"Third language","code":"%s-%s"}`,
		section, code, uuid.NewString()[:6])
	rec := w.call(w.registrar.createElectiveGroup, http.MethodPost, "/api/v1/elective-groups", body, nil)
	return w.idOf(rec, "elective_group", http.StatusCreated)
}

func (w *electiveWorld) addArm(group, offering uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	return w.call(w.registrar.addElectiveGroupOffering, http.MethodPost,
		"/api/v1/elective-groups/"+group.String()+"/offerings",
		fmt.Sprintf(`{"subject_offering_id":%q}`, offering),
		map[string]string{"id": group.String()})
}

func (w *electiveWorld) choose(server *Server, group, enrollment, offering uuid.UUID,
	extra string) *httptest.ResponseRecorder {
	w.t.Helper()

	body := fmt.Sprintf(`{"student_enrollment_id":%q,"subject_offering_id":%q%s}`,
		enrollment, offering, extra)
	return w.call(server.chooseElective, http.MethodPost,
		"/api/v1/elective-groups/"+group.String()+"/choices", body,
		map[string]string{"id": group.String()})
}

func (w *electiveWorld) change(group, enrollment, offering uuid.UUID,
	extra string) *httptest.ResponseRecorder {
	w.t.Helper()

	body := fmt.Sprintf(`{"subject_offering_id":%q%s}`, offering, extra)
	return w.call(w.registrar.changeElectiveChoice, http.MethodPatch,
		"/api/v1/elective-groups/"+group.String()+"/choices/"+enrollment.String(), body,
		map[string]string{"id": group.String(), "enrollmentID": enrollment.String()})
}

func (w *electiveWorld) groupWithBothArms() uuid.UUID {
	w.t.Helper()

	group := w.newGroup(w.sectionA, "TL")
	for _, arm := range []uuid.UUID{w.hindiA, w.computerA} {
		if rec := w.addArm(group, arm); rec.Code != http.StatusCreated {
			w.t.Fatalf("arm %s: want 201, got %d: %s", arm, rec.Code, rec.Body.String())
		}
	}
	return group
}

func (w *electiveWorld) enrollmentOf(enrollment, offering uuid.UUID) *tenantent.StudentSubjectEnrollment {
	w.t.Helper()

	row, err := w.db.Client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.StudentEnrollmentID(enrollment),
			entsubjenroll.SubjectOfferingID(offering),
		).
		Only(w.ctx)
	if err != nil {
		w.t.Fatalf("no subject enrollment for %s on %s: %v", enrollment, offering, err)
	}
	return row
}

func TestAnElectiveGroupCarriesItsArms(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()

	rec := w.call(w.registrar.listElectiveGroupOfferings, http.MethodGet,
		"/api/v1/elective-groups/"+group.String()+"/offerings", "",
		map[string]string{"id": group.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Offerings []struct {
			SubjectOfferingID uuid.UUID `json:"subject_offering_id"`
		} `json:"elective_group_offerings"`
		Count int `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unreadable body: %v (%s)", err, rec.Body.String())
	}
	if body.Count != 2 {
		t.Fatalf("want two arms, got %d: %s", body.Count, rec.Body.String())
	}
	seen := map[uuid.UUID]bool{}
	for _, arm := range body.Offerings {
		seen[arm.SubjectOfferingID] = true
	}
	if !seen[w.hindiA] || !seen[w.computerA] {
		t.Fatalf("the arms must be Hindi and Computer, got %+v", body.Offerings)
	}
	t.Logf("one group in section A carries Hindi (%s) and Computer (%s)", w.hindiA, w.computerA)
}

func TestAnArmFromAnotherSectionIsRefused(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.newGroup(w.sectionA, "TL")
	rec := w.addArm(group, w.frenchB)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "different section") {
		t.Fatalf("the refusal must name the section, got %s", rec.Body.String())
	}
}

func TestAnOfferingIsAnArmOfOneGroupOnly(t *testing.T) {
	w := newElectiveWorld(t)

	first := w.newGroup(w.sectionA, "TL")
	if rec := w.addArm(first, w.hindiA); rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", rec.Code, rec.Body.String())
	}

	second := w.newGroup(w.sectionA, "TL2")
	rec := w.addArm(second, w.hindiA)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), first.String()) {
		t.Fatalf("the refusal must name the group that holds it (%s), got %s", first, rec.Body.String())
	}
}

func TestAPupilTakesOneArmOfTheGroup(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", rec.Code, rec.Body.String())
	}

	row := w.enrollmentOf(w.enrolP1, w.hindiA)
	if row.Status != entsubjenroll.StatusActive {
		t.Fatalf("the choice must be active, got %s", row.Status)
	}
	if !row.IsElectiveChoice {
		t.Fatal("a choice made through an elective group must be marked is_elective_choice")
	}
	if row.StudentID != w.pupilP1 || row.AcademicSessionID != w.sessionID {
		t.Fatalf("the row must carry the pupil and session from the enrollment, got %+v", row)
	}
}

func TestASecondArmIsRefusedAtEnrolment(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must be accepted, got %d: %s", rec.Code, rec.Body.String())
	}

	rec := w.choose(w.registrar, group, w.enrolP1, w.computerA, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("a pupil may hold one arm of a group; want 409, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), w.hindiA.String()) {
		t.Fatalf("the refusal must name the arm already held (%s), got %s", w.hindiA, rec.Body.String())
	}

	n, err := w.db.Client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.StudentEnrollmentID(w.enrolP1),
			entsubjenroll.SubjectOfferingIDIn(w.hindiA, w.computerA),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		).
		Count(w.ctx)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("the pupil must hold exactly one arm, found %d", n)
	}
}

func TestAnOfferingOutsideTheGroupIsNotAnArmToChoose(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	rec := w.choose(w.registrar, group, w.enrolP1, w.chemA, "")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "not an arm") {
		t.Fatalf("the refusal must say the offering is not an arm, got %s", rec.Body.String())
	}
}

func TestAGroupWithNoArmsRefusesAChoice(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.newGroup(w.sectionA, "TL")
	rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, "")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "no arms") {
		t.Fatalf("the refusal must say the group has no arms, got %s", rec.Body.String())
	}
}

func TestAChoiceIsRefusedForAPupilTheCallerCannotReach(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()

	reachable := w.choose(w.narrowed, group, w.enrolP1, w.hindiA, "")
	if reachable.Code != http.StatusCreated {
		t.Fatalf("the narrowed caller teaches section A and must be able to enrol P1; "+
			"got %d: %s", reachable.Code, reachable.Body.String())
	}

	outside := w.choose(w.narrowed, group, w.enrolB1, w.hindiA, "")
	if outside.Code != http.StatusNotFound {
		t.Fatalf("a pupil in section B is outside the caller's reach; want 404, got %d: %s",
			outside.Code, outside.Body.String())
	}

	n, err := w.db.Client.StudentSubjectEnrollment.Query().
		Where(entsubjenroll.StudentEnrollmentID(w.enrolB1)).
		Count(w.ctx)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("the refused choice must have written nothing, found %d rows", n)
	}
}

func TestAPupilOfAnotherSectionCannotTakeThisGroupsArm(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	rec := w.choose(w.registrar, group, w.enrolB1, w.hindiA, "")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "different section") {
		t.Fatalf("the refusal must name the section, got %s", rec.Body.String())
	}
}

func TestChangingArmMidSessionDropsTheOldAndOpensTheNew(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA,
		`,"enrolled_on":"2026-04-06"`); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must be accepted, got %d: %s", rec.Code, rec.Body.String())
	}

	rec := w.change(group, w.enrolP1, w.computerA, `,"effective_from":"2026-05-11"`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	old := w.enrollmentOf(w.enrolP1, w.hindiA)
	if old.Status != entsubjenroll.StatusDropped {
		t.Fatalf("the old arm must be dropped, got %s", old.Status)
	}
	if old.DroppedOn == nil || old.DroppedOn.Format(dateLayout) != "2026-05-11" {
		t.Fatalf("the old arm must carry the date the pupil left it, got %v", old.DroppedOn)
	}

	fresh := w.enrollmentOf(w.enrolP1, w.computerA)
	if fresh.Status != entsubjenroll.StatusActive {
		t.Fatalf("the new arm must be active, got %s", fresh.Status)
	}
	if fresh.EnrolledOn == nil || fresh.EnrolledOn.Format(dateLayout) != "2026-05-11" {
		t.Fatalf("the new arm must carry the date the pupil joined it, got %v", fresh.EnrolledOn)
	}
	t.Logf("the dropped Hindi row survives with its marks and attendance attached; "+
		"nothing is migrated to Computer (%s)", w.computerA)
}

func TestChangingBackReusesTheDroppedRow(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must be accepted, got %d: %s", rec.Code, rec.Body.String())
	}
	original := w.enrollmentOf(w.enrolP1, w.hindiA).ID

	if rec := w.change(group, w.enrolP1, w.computerA, ""); rec.Code != http.StatusOK {
		t.Fatalf("the move out must be accepted, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := w.change(group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusOK {
		t.Fatalf("the move back must be accepted, got %d: %s", rec.Code, rec.Body.String())
	}

	back := w.enrollmentOf(w.enrolP1, w.hindiA)
	if back.ID != original {
		t.Fatalf("the pupil's original Hindi row must be reused rather than duplicated: "+
			"%s became %s", original, back.ID)
	}
	if back.Status != entsubjenroll.StatusActive || back.DroppedOn != nil {
		t.Fatalf("the reused row must be active with no dropped_on, got status=%s dropped_on=%v",
			back.Status, back.DroppedOn)
	}
}

func TestChangingToTheArmAlreadyHeldChangesNothing(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must be accepted, got %d: %s", rec.Code, rec.Body.String())
	}
	before := w.enrollmentOf(w.enrolP1, w.hindiA)

	rec := w.change(group, w.enrolP1, w.hindiA, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	after := w.enrollmentOf(w.enrolP1, w.hindiA)
	if after.ID != before.ID || after.Status != before.Status || after.DroppedOn != nil {
		t.Fatalf("a move to the arm already held must leave the row alone, %+v became %+v",
			before, after)
	}
}

func TestAPupilWithNoChoiceIsReportedRatherThanRefused(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("the first arm must be accepted, got %d: %s", rec.Code, rec.Body.String())
	}

	rec := w.call(w.registrar.listElectiveChoices, http.MethodGet,
		"/api/v1/elective-groups/"+group.String()+"/choices", "",
		map[string]string{"id": group.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Choices []struct {
			StudentEnrollmentID uuid.UUID `json:"student_enrollment_id"`
			Chosen              *struct {
				SubjectOfferingID uuid.UUID `json:"subject_offering_id"`
			} `json:"chosen"`
		} `json:"choices"`
		WithoutChoice int `json:"without_choice"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unreadable body: %v (%s)", err, rec.Body.String())
	}

	decided := map[uuid.UUID]uuid.UUID{}
	undecided := map[uuid.UUID]bool{}
	for _, choice := range body.Choices {
		if choice.Chosen == nil {
			undecided[choice.StudentEnrollmentID] = true
			continue
		}
		decided[choice.StudentEnrollmentID] = choice.Chosen.SubjectOfferingID
	}
	if decided[w.enrolP1] != w.hindiA {
		t.Fatalf("P1 must be shown on Hindi, got %v", decided[w.enrolP1])
	}
	if !undecided[w.enrolP2] {
		t.Fatalf("P2 has not chosen and must be listed with a null choice: %s", rec.Body.String())
	}
	if body.WithoutChoice < 1 {
		t.Fatalf("without_choice must count the pupils still to choose, got %d", body.WithoutChoice)
	}
	t.Logf("choices are collected over time: %d pupils in section A have not chosen yet",
		body.WithoutChoice)
}

func (w *electiveWorld) scheduleBothArmsInOnePeriod() {
	w.t.Helper()

	newSlot := func(offering, who, room uuid.UUID) {
		w.db.Client.TimetableSlot.Create().
			SetTimetableID(w.timetableID).
			SetSectionID(w.sectionA).
			SetPeriodID(w.periodP5).
			SetDayOfWeek(1).
			SetSubjectOfferingID(offering).
			SetTeacherID(who).
			SetRoomID(room).
			SaveX(w.ctx)
	}
	newSlot(w.hindiA, w.hindiTeacher, w.roomR3)
	newSlot(w.computerA, w.computerTeacher, w.roomR4)
}

func (w *electiveWorld) clashReport() *timetablesvc.ClashReport {
	w.t.Helper()

	service, err := timetablesvc.FromContext(w.ctx)
	if err != nil {
		w.t.Fatalf("the timetable service could not be resolved: %v", err)
	}
	report, err := service.Check(w.ctx, timetablesvc.ClashQuery{
		BranchID:    w.branchID,
		TimetableID: w.timetableID,
		From:        w.monday,
		To:          w.sunday,
		Rules:       timetablesvc.AllRules(),
	})
	if err != nil {
		w.t.Fatalf("check: %v", err)
	}
	return report
}

func TestTwoArmsOfOneGroupInOnePeriodAreNotAClash(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("P1 on Hindi: want 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := w.choose(w.registrar, group, w.enrolP2, w.computerA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("P2 on Computer: want 201, got %d: %s", rec.Code, rec.Body.String())
	}
	w.scheduleBothArmsInOnePeriod()

	report := w.clashReport()
	if !report.Clear() {
		for _, clash := range report.Clashes {
			t.Errorf("section A period 5 runs Hindi and Computer for disjoint pupils; "+
				"that is not a clash. got: %+v", clash)
		}
		t.Fatal("the clash unit is the student set, not the section")
	}
	t.Logf("Hindi (%s) and Computer (%s) run together in section A period 5 with no clash",
		w.hindiA, w.computerA)
}

func TestAPupilInBothArmsIsTheClashTheEngineFinds(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("P1 on Hindi: want 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := w.choose(w.registrar, group, w.enrolP2, w.computerA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("P2 on Computer: want 201, got %d: %s", rec.Code, rec.Body.String())
	}
	w.scheduleBothArmsInOnePeriod()

	w.db.Client.StudentSubjectEnrollment.Create().
		SetStudentEnrollmentID(w.enrolP1).
		SetSubjectOfferingID(w.computerA).
		SetStudentID(w.pupilP1).
		SetAcademicSessionID(w.sessionID).
		SaveX(w.ctx)

	report := w.clashReport()
	var student []timetablesvc.Clash
	for _, clash := range report.Clashes {
		if clash.Rule == timetablesvc.RuleStudentSet {
			student = append(student, clash)
		}
	}
	if len(student) == 0 {
		t.Fatal("a pupil sitting in both arms at once is a student-set clash, and none was reported")
	}
	for _, clash := range student {
		if len(clash.StudentIDs) != 1 || clash.StudentIDs[0] != w.pupilP1 {
			t.Fatalf("the clash must name P1 (%s) alone, got %v", w.pupilP1, clash.StudentIDs)
		}
	}
	t.Logf("the engine catches at scheduling what the enrolment endpoint refuses outright: "+
		"%d student-set clash(es) naming %s", len(student), w.pupilP1)
}

func TestAnElectiveSlotWithNoOfferingClaimsTheWholeSection(t *testing.T) {
	w := newElectiveWorld(t)

	group := w.groupWithBothArms()
	if rec := w.choose(w.registrar, group, w.enrolP1, w.hindiA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("P1 on Hindi: want 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := w.choose(w.registrar, group, w.enrolP2, w.computerA, ""); rec.Code != http.StatusCreated {
		t.Fatalf("P2 on Computer: want 201, got %d: %s", rec.Code, rec.Body.String())
	}

	for _, who := range []uuid.UUID{w.hindiTeacher, w.computerTeacher} {
		w.db.Client.TimetableSlot.Create().
			SetTimetableID(w.timetableID).
			SetSectionID(w.sectionA).
			SetPeriodID(w.periodP5).
			SetDayOfWeek(1).
			SetLabel("Third language").
			SetTeacherID(who).
			SaveX(w.ctx)
	}

	report := w.clashReport()
	found := false
	for _, clash := range report.Clashes {
		if clash.Rule == timetablesvc.RuleStudentSet {
			found = true
		}
	}
	if !found {
		t.Fatal("two slots with a null subject_offering_id both fall back to the whole section " +
			"roster, so they must clash; if they no longer do, forEngagement has changed and " +
			"the invariant this test guards is no longer the one that matters")
	}
	t.Log("a slot generated for an elective arm must carry subject_offering_id: " +
		"left null it claims every pupil in the section and refuses a schedule that is fine")
}
