package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entpraise "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/praise"
	entreaction "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/praisereaction"
	entaward "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentachievement"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

func recognitionRouteTable() []classroomRouteCase {
	return []classroomRouteCase{
		{"GET", "/api/v1/achievements", "/api/v1/achievements", authorization.AchievementsRead},
		{"POST", "/api/v1/achievements", "/api/v1/achievements", authorization.AchievementsWrite},
		{"GET", "/api/v1/achievements/" + probeID, "/api/v1/achievements/{id}", authorization.AchievementsRead},
		{"PATCH", "/api/v1/achievements/" + probeID, "/api/v1/achievements/{id}", authorization.AchievementsWrite},
		{"DELETE", "/api/v1/achievements/" + probeID, "/api/v1/achievements/{id}", authorization.AchievementsDelete},

		{"GET", "/api/v1/student-achievements", "/api/v1/student-achievements",
			authorization.StudentAchievementsRead},
		{"POST", "/api/v1/student-achievements", "/api/v1/student-achievements",
			authorization.StudentAchievementsWrite},
		{"GET", "/api/v1/student-achievements/" + probeID, "/api/v1/student-achievements/{id}",
			authorization.StudentAchievementsRead},
		{"PATCH", "/api/v1/student-achievements/" + probeID, "/api/v1/student-achievements/{id}",
			authorization.StudentAchievementsWrite},
		{"PUT", "/api/v1/student-achievements/" + probeID + "/showcase",
			"/api/v1/student-achievements/{id}/showcase", authorization.StudentAchievementsWrite},
		{"DELETE", "/api/v1/student-achievements/" + probeID, "/api/v1/student-achievements/{id}",
			authorization.StudentAchievementsDelete},

		{"GET", "/api/v1/praises", "/api/v1/praises", authorization.PraisesRead},
		{"POST", "/api/v1/praises", "/api/v1/praises", authorization.PraisesWrite},
		{"GET", "/api/v1/praises/" + probeID, "/api/v1/praises/{id}", authorization.PraisesRead},
		{"PATCH", "/api/v1/praises/" + probeID, "/api/v1/praises/{id}", authorization.PraisesWrite},
		{"DELETE", "/api/v1/praises/" + probeID, "/api/v1/praises/{id}", authorization.PraisesDelete},
		{"GET", "/api/v1/praises/" + probeID + "/reactions", "/api/v1/praises/{id}/reactions",
			authorization.PraiseReactionsRead},
		{"POST", "/api/v1/praises/" + probeID + "/reactions", "/api/v1/praises/{id}/reactions",
			authorization.PraiseReactionsWrite},

		{"DELETE", "/api/v1/praise-reactions/" + probeID, "/api/v1/praise-reactions/{id}",
			authorization.PraiseReactionsDelete},
	}
}

func TestEveryRecognitionRouteIsGatedByItsOwnEntity(t *testing.T) {
	guard := &recordingGuard{}
	server := &Server{guard: guard}

	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) { server.mountRecognition(r) })

	for _, tc := range recognitionRouteTable() {
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

func TestRecognitionRoutesAreMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	want := []string{
		"GET /api/v1/achievements",
		"POST /api/v1/achievements",
		"GET /api/v1/student-achievements",
		"POST /api/v1/student-achievements",
		"PUT /api/v1/student-achievements/{id}/showcase",
		"GET /api/v1/praises",
		"POST /api/v1/praises",
		"POST /api/v1/praises/{id}/reactions",
		"DELETE /api/v1/praise-reactions/{id}",
	}

	for _, pattern := range want {
		if !found[pattern] && !found[pattern+"/"] {
			t.Errorf("%s is not mounted on the real router, so the handler is unreachable however well it is tested",
				pattern)
		}
	}
}

type recognitionGuard struct {
	reach       authorization.Reach
	constraints [][]authorization.Constraint
}

func (g recognitionGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.AchievementsRead, authorization.AchievementsWrite, authorization.AchievementsDelete,
		authorization.StudentAchievementsRead, authorization.StudentAchievementsWrite,
		authorization.StudentAchievementsDelete,
		authorization.PraisesRead, authorization.PraisesWrite, authorization.PraisesDelete,
		authorization.PraiseReactionsRead, authorization.PraiseReactionsWrite,
		authorization.PraiseReactionsDelete:
		return authorization.Decision{
			Allowed:     true,
			Reach:       g.reach,
			HasReach:    true,
			Constraints: g.constraints,
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (g recognitionGuard) Name() string { return "recognition database test guard" }

type recognitionWorld struct {
	t  *testing.T
	db *testsupport.TenantDB

	teacher      *classroomActor
	parent       *classroomActor
	pupil        *classroomActor
	pupilAtLarge *classroomActor
	mate         *classroomActor
	head         *classroomActor

	sessionID uuid.UUID
	sectionID uuid.UUID
	physicsID uuid.UUID

	teacherStaffID uuid.UUID
	pupilID        uuid.UUID
	mateID         uuid.UUID

	badgeID  uuid.UUID
	spare    []uuid.UUID
	spareNth int

	pupilAward uuid.UUID
	mateAward  uuid.UUID
}

func newRecognitionWorld(t *testing.T) *recognitionWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	w := &recognitionWorld{t: t, db: db}

	session := client.AcademicSession.Create().
		SetName("Recognition Probe " + tag).
		SetCode("RCP-" + tag).
		SetStartDate(classroomDate(2026, time.April, 1)).
		SetEndDate(classroomDate(2027, time.March, 31)).
		SetIsCurrent(true).
		SaveX(ctx)
	w.sessionID = session.ID

	branch := client.Branch.Create().
		SetName("Recognition Campus " + tag).SetCode("RCB-" + tag).SaveX(ctx)
	grade := client.GradeLevel.Create().
		SetName("XI").SetCode("RCG-" + tag).SetSequence(11).SaveX(ctx)
	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").SetCode("RCS-" + tag).
		SaveX(ctx)
	w.sectionID = section.ID

	subject := client.Subject.Create().SetName("Physics " + tag).SetCode("RPH-" + tag).SaveX(ctx)
	physics := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).SetSectionID(section.ID).
		SetSubjectID(subject.ID).SaveX(ctx)
	w.physicsID = physics.ID

	teacherPerson := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Physics").SetDisplayName("Physics Teacher " + tag).
		SaveX(ctx)
	teacherStaff := client.Staff.Create().
		SetPersonID(teacherPerson.ID).SetBranchID(branch.ID).
		SetEmployeeCode("REM-" + tag).SaveX(ctx)
	teacher := client.Teacher.Create().
		SetStaffID(teacherStaff.ID).SetTeacherCode("RTC-" + tag).SaveX(ctx)
	w.teacherStaffID = teacherStaff.ID

	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(section.ID).
		SetSubjectOfferingID(physics.ID).
		SetRoleType("subject_teacher").
		SaveX(ctx)

	headPerson := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Science").SetDisplayName("Science Head " + tag).
		SaveX(ctx)
	client.Staff.Create().
		SetPersonID(headPerson.ID).SetBranchID(branch.ID).
		SetEmployeeCode("RHM-" + tag).SaveX(ctx)

	pupilPerson, pupil := w.enrol(client, tag+"-a", session.ID, section.ID, physics.ID)
	matePerson, mate := w.enrol(client, tag+"-b", session.ID, section.ID, physics.ID)
	w.pupilID, w.mateID = pupil, mate

	parentPerson := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Maths").SetDisplayName("Maths Teacher and Parent " + tag).
		SaveX(ctx)
	parentStaff := client.Staff.Create().
		SetPersonID(parentPerson.ID).SetBranchID(branch.ID).
		SetEmployeeCode("RPM-" + tag).SaveX(ctx)
	parentTeacher := client.Teacher.Create().
		SetStaffID(parentStaff.ID).SetTeacherCode("RPT-" + tag).SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(parentTeacher.ID).
		SetSectionID(section.ID).
		SetSubjectOfferingID(physics.ID).
		SetRoleType("subject_teacher").
		SaveX(ctx)
	parentGuardian := client.Guardian.Create().SetPersonID(parentPerson.ID).SaveX(ctx)
	client.StudentGuardian.Create().
		SetStudentID(mate).
		SetGuardianID(parentGuardian.ID).
		SetRelationshipType("mother").
		SetCanViewAcademic(true).
		SaveX(ctx)

	badge := client.Achievement.Create().
		SetName("Star of the Week " + tag).
		SetCode("RBC-" + tag).
		SaveX(ctx)
	w.badgeID = badge.ID

	award := func(student uuid.UUID) uuid.UUID {
		return client.StudentAchievement.Create().
			SetStudentID(student).
			SetAchievementID(badge.ID).
			SetAcademicSessionID(session.ID).
			SetAwardedBy(teacherPerson.ID).
			SaveX(ctx).ID
	}
	w.pupilAward = award(pupil)
	w.mateAward = award(mate)

	for i := 0; i < 6; i++ {
		spare := client.Achievement.Create().
			SetName("Unawarded badge " + tag + "-" + uuid.NewString()[:4]).
			SetCode("RSB-" + uuid.NewString()[:12]).
			SaveX(ctx)
		w.spare = append(w.spare, spare.ID)
	}

	conn := &postgres.TenantConn{Client: client}
	actor := func(person *tenantent.Person, guard recognitionGuard) *classroomActor {
		return &classroomActor{
			server: &Server{guard: guard},
			ctx: postgres.WithConn(
				authorization.WithSubject(ctx, &authorization.Subject{CASUserID: person.CasUserID}),
				conn),
		}
	}

	w.teacher = actor(teacherPerson, recognitionGuard{reach: authorization.ReachTeacherAssignment})
	w.parent = actor(parentPerson, recognitionGuard{reach: authorization.ReachTenant})
	w.pupil = actor(pupilPerson, recognitionGuard{reach: authorization.ReachSelf})
	w.pupilAtLarge = actor(pupilPerson, recognitionGuard{reach: authorization.ReachTenant})
	w.mate = actor(matePerson, recognitionGuard{reach: authorization.ReachSelf})
	w.head = actor(headPerson, recognitionGuard{reach: authorization.ReachTenant})

	w.requireGenuineScopes()
	db.Forget()
	return w
}

func (w *recognitionWorld) enrol(client *tenantent.Client, label string,
	sessionID, sectionID uuid.UUID, offerings ...uuid.UUID) (*tenantent.Person, uuid.UUID) {
	w.t.Helper()

	ctx := context.Background()
	person := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Pupil").SetDisplayName("Pupil " + label).
		SaveX(ctx)
	student := client.Student.Create().
		SetPersonID(person.ID).SetAdmissionNumber("RADM-" + label).SaveX(ctx)
	enrollment := client.StudentEnrollment.Create().
		SetStudentID(student.ID).
		SetAcademicSessionID(sessionID).
		SetSectionID(sectionID).
		SetEnrollmentDate(classroomDate(2026, time.April, 1)).
		SaveX(ctx)

	for _, offering := range offerings {
		client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrollment.ID).
			SetSubjectOfferingID(offering).
			SetStudentID(student.ID).
			SetAcademicSessionID(sessionID).
			SaveX(ctx)
	}
	return person, student.ID
}

func (w *recognitionWorld) requireGenuineScopes() {
	w.t.Helper()

	viewer, decision, err := w.pupilAtLarge.server.scopeFor(w.pupilAtLarge.ctx,
		authorization.StudentAchievementsWrite, authorization.StudentAchievementsWriteAll)
	if err != nil {
		w.t.Fatalf("the over-issued pupil scope could not be resolved: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted pupil would make the kin subtraction the only thing under test twice over")
	}
	if decision.Reach != authorization.ReachTenant {
		w.t.Fatalf("the over-issued pupil must carry tenant reach, got %+v", decision)
	}
	if len(viewer.StudentIDs) != 1 || viewer.StudentIDs[0] != w.pupilID {
		w.t.Fatalf("the pupil must resolve to the seeded student %s, got %v", w.pupilID, viewer.StudentIDs)
	}

	parent, _, err := w.parent.server.scopeFor(w.parent.ctx,
		authorization.StudentAchievementsWrite, authorization.StudentAchievementsWriteAll)
	if err != nil {
		w.t.Fatalf("the parent-teacher scope could not be resolved: %v", err)
	}
	if parent.GuardianID == nil {
		w.t.Fatal("the parent-teacher must resolve a guardian record or the ward case is vacuous")
	}
	if parent.TeacherID == nil {
		w.t.Fatal("the parent-teacher must also be a teacher or the ward case proves nothing")
	}

	teacher, teacherDecision, err := w.teacher.server.scopeFor(w.teacher.ctx,
		authorization.StudentAchievementsWrite, authorization.StudentAchievementsWriteAll)
	if err != nil {
		w.t.Fatalf("the teacher scope could not be resolved: %v", err)
	}
	if teacher.Unrestricted || teacherDecision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the teacher must be narrowed to their assignments, got %+v", teacherDecision)
	}
	if !carriesID(teacher.SubjectOfferingIDs, w.physicsID) {
		w.t.Fatalf("the teacher must reach the physics offering, got %v", teacher.SubjectOfferingIDs)
	}
}

func (w *recognitionWorld) awardBody(student uuid.UUID) string {
	w.t.Helper()

	if w.spareNth >= len(w.spare) {
		w.t.Fatal("the world ran out of unawarded badges; a repeat award would 409 on the unique " +
			"index and hide whether the rule under test did the refusing")
	}
	badge := w.spare[w.spareNth]
	w.spareNth++

	return `{"student_id":"` + student.String() +
		`","achievement_id":"` + badge.String() +
		`","academic_session_id":"` + w.sessionID.String() + `"}`
}

func TestAPupilCannotAwardThemselvesAnAchievementOverHTTP(t *testing.T) {
	w := newRecognitionWorld(t)
	ctx := context.Background()

	before := w.db.Client.StudentAchievement.Query().
		Where(entaward.StudentID(w.pupilID)).CountX(ctx)

	t.Run("a pupil holding tenant reach is still refused", func(t *testing.T) {
		rec := w.pupilAtLarge.call(t, w.pupilAtLarge.server.awardAchievement, "POST",
			"/api/v1/student-achievements", w.awardBody(w.pupilID), uuid.Nil)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("a pupil awarding themselves must be refused with 403, got %d: %s",
				rec.Code, rec.Body.String())
		}
		if got := w.db.Client.StudentAchievement.Query().
			Where(entaward.StudentID(w.pupilID)).CountX(ctx); got != before {
			t.Fatalf("the pupil wrote themselves an award: %d rows, was %d", got, before)
		}
	})

	t.Run("a pupil at self reach is refused too", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.awardAchievement, "POST",
			"/api/v1/student-achievements", w.awardBody(w.pupilID), uuid.Nil)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("a pupil at self reach must be refused with 403, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("a pupil cannot award a classmate either", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.awardAchievement, "POST",
			"/api/v1/student-achievements", w.awardBody(w.mateID), uuid.Nil)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("a pupil awarding a classmate must be refused, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("a teacher who is also the parent cannot award their own child", func(t *testing.T) {
		rec := w.parent.call(t, w.parent.server.awardAchievement, "POST",
			"/api/v1/student-achievements", w.awardBody(w.mateID), uuid.Nil)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("a teacher must not award their own ward, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("the teacher of that class awards it", func(t *testing.T) {
		rec := w.teacher.call(t, w.teacher.server.awardAchievement, "POST",
			"/api/v1/student-achievements", w.awardBody(w.pupilID), uuid.Nil)

		if rec.Code != http.StatusCreated {
			t.Fatalf("the physics teacher must be able to award, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestAPupilFeaturesTheirOwnAwardButRevokesNothing(t *testing.T) {
	w := newRecognitionWorld(t)
	ctx := context.Background()

	t.Run("the pupil pins their own badge to their profile", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.showcaseStudentAchievement, "PUT",
			"/api/v1/student-achievements/"+w.pupilAward.String()+"/showcase",
			`{"is_featured":true,"display_order":1}`, w.pupilAward)

		if rec.Code != http.StatusOK {
			t.Fatalf("a pupil must be able to showcase their own badge, got %d: %s",
				rec.Code, rec.Body.String())
		}
		row := w.db.Client.StudentAchievement.GetX(ctx, w.pupilAward)
		if !row.IsFeatured || row.DisplayOrder == nil || *row.DisplayOrder != 1 {
			t.Fatalf("the showcase was not recorded: %+v", row)
		}
	})

	t.Run("the pupil cannot showcase a classmate's badge", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.showcaseStudentAchievement, "PUT",
			"/api/v1/student-achievements/"+w.mateAward.String()+"/showcase",
			`{"is_featured":true}`, w.mateAward)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("showcasing a classmate's badge must be a 404 that admits nothing, got %d: %s",
				rec.Code, rec.Body.String())
		}
		if w.db.Client.StudentAchievement.GetX(ctx, w.mateAward).IsFeatured {
			t.Fatalf("the classmate's badge was featured by somebody else")
		}
	})

	t.Run("the pupil cannot revoke their own award", func(t *testing.T) {
		rec := w.pupilAtLarge.call(t, w.pupilAtLarge.server.updateStudentAchievement, "PATCH",
			"/api/v1/student-achievements/"+w.pupilAward.String(),
			`{"status":"revoked"}`, w.pupilAward)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("a pupil revoking their own award must get 404, got %d: %s",
				rec.Code, rec.Body.String())
		}
		if got := w.db.Client.StudentAchievement.GetX(ctx, w.pupilAward).Status; got != entaward.StatusAwarded {
			t.Fatalf("the pupil changed the status of their own award to %s", got)
		}
	})

	t.Run("an is_featured flag on the award route is refused at the door", func(t *testing.T) {
		rec := w.pupilAtLarge.call(t, w.pupilAtLarge.server.awardAchievement, "POST",
			"/api/v1/student-achievements",
			`{"student_id":"`+w.pupilID.String()+`","is_featured":true}`, uuid.Nil)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("the award route must not accept is_featured, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("the teacher revokes the award they made", func(t *testing.T) {
		rec := w.teacher.call(t, w.teacher.server.updateStudentAchievement, "PATCH",
			"/api/v1/student-achievements/"+w.pupilAward.String(),
			`{"status":"revoked"}`, w.pupilAward)

		if rec.Code != http.StatusOK {
			t.Fatalf("the teacher must be able to revoke, got %d: %s", rec.Code, rec.Body.String())
		}
		if got := w.db.Client.StudentAchievement.GetX(ctx, w.pupilAward).Status; got != entaward.StatusRevoked {
			t.Fatalf("the award was not revoked, status is %s", got)
		}
	})
}

func TestPeerPraiseIsBoundedToTheSharedSection(t *testing.T) {
	w := newRecognitionWorld(t)
	ctx := context.Background()

	praiseBody := func(kind string, id uuid.UUID) string {
		return `{"recipient_type":"` + kind + `","recipient_id":"` + id.String() +
			`","academic_session_id":"` + w.sessionID.String() +
			`","message":"carried the group project"}`
	}

	t.Run("a pupil praises a classmate", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.createPraise, "POST",
			"/api/v1/praises", praiseBody("student", w.mateID), uuid.Nil)

		if rec.Code != http.StatusCreated {
			t.Fatalf("peer praise within the section must be allowed, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("a pupil cannot praise themselves", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.createPraise, "POST",
			"/api/v1/praises", praiseBody("student", w.pupilID), uuid.Nil)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("self praise must be refused, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("a pupil cannot praise a staff member", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.createPraise, "POST",
			"/api/v1/praises", praiseBody("staff", w.teacherStaffID), uuid.Nil)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("a pupil must not reach a staff recipient, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("a pupil outside the section is unreachable", func(t *testing.T) {
		outsider := w.db.Client.Student.Create().
			SetPersonID(w.db.Client.Person.Create().
				SetCasUserID(uuid.New()).SetFirstName("Outside").
				SetDisplayName("Outsider").SaveX(ctx).ID).
			SetAdmissionNumber("ROUT-" + uuid.NewString()[:8]).
			SaveX(ctx)

		rec := w.pupil.call(t, w.pupil.server.createPraise, "POST",
			"/api/v1/praises", praiseBody("student", outsider.ID), uuid.Nil)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("praise outside the caller's section must be refused, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("the head praises a staff member", func(t *testing.T) {
		rec := w.head.call(t, w.head.server.createPraise, "POST",
			"/api/v1/praises", praiseBody("staff", w.teacherStaffID), uuid.Nil)

		if rec.Code != http.StatusCreated {
			t.Fatalf("school-wide reach must admit a staff recipient, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("a private praise stays with its recipient and its giver", func(t *testing.T) {
		row := w.db.Client.Praise.Create().
			SetRecipientType(entpraise.RecipientTypeStudent).
			SetRecipientID(w.mateID).
			SetGivenByPersonID(w.db.Client.Person.Query().FirstX(ctx).ID).
			SetAcademicSessionID(w.sessionID).
			SetMessage("a quiet word").
			SetVisibility(entpraise.VisibilityPrivate).
			SaveX(ctx)

		rec := w.pupil.call(t, w.pupil.server.getPraise, "GET",
			"/api/v1/praises/"+row.ID.String(), "", row.ID)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("a classmate must not read a private praise, got %d: %s",
				rec.Code, rec.Body.String())
		}

		rec = w.mate.call(t, w.mate.server.getPraise, "GET",
			"/api/v1/praises/"+row.ID.String(), "", row.ID)
		if rec.Code != http.StatusOK {
			t.Fatalf("the recipient must read their own private praise, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})
}

func TestAPraiseIsEditedOnlyByItsGiverAndModeratedByReach(t *testing.T) {
	w := newRecognitionWorld(t)
	ctx := context.Background()

	rec := w.pupil.call(t, w.pupil.server.createPraise, "POST", "/api/v1/praises",
		`{"recipient_type":"student","recipient_id":"`+w.mateID.String()+
			`","academic_session_id":"`+w.sessionID.String()+
			`","message":"stayed behind to help"}`, uuid.Nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("the peer praise could not be seeded: %d %s", rec.Code, rec.Body.String())
	}
	given := w.db.Client.Praise.Query().
		Where(entpraise.MessageEQ("stayed behind to help")).OnlyX(ctx)

	t.Run("the recipient cannot rewrite the message", func(t *testing.T) {
		res := w.mate.call(t, w.mate.server.updatePraise, "PATCH",
			"/api/v1/praises/"+given.ID.String(), `{"message":"rewritten by me"}`, given.ID)

		if res.Code != http.StatusNotFound {
			t.Fatalf("only the giver edits a praise, got %d: %s", res.Code, res.Body.String())
		}
		if w.db.Client.Praise.GetX(ctx, given.ID).Message != "stayed behind to help" {
			t.Fatal("the recipient rewrote the praise about themselves")
		}
	})

	t.Run("the giver edits their own", func(t *testing.T) {
		res := w.pupil.call(t, w.pupil.server.updatePraise, "PATCH",
			"/api/v1/praises/"+given.ID.String(), `{"message":"stayed behind to help all week"}`, given.ID)

		if res.Code != http.StatusOK {
			t.Fatalf("the giver must be able to edit, got %d: %s", res.Code, res.Body.String())
		}
	})

	t.Run("a classmate is not a moderator of praise about a classmate", func(t *testing.T) {
		res := w.mate.call(t, w.mate.server.updatePraise, "PATCH",
			"/api/v1/praises/"+given.ID.String(), `{"status":"hidden"}`, given.ID)

		if res.Code != http.StatusNotFound {
			t.Fatalf("a pupil reaches classmates to praise them, not to moderate them, got %d: %s",
				res.Code, res.Body.String())
		}
		if w.db.Client.Praise.GetX(ctx, given.ID).Status != entpraise.StatusActive {
			t.Fatal("a pupil hid a praise they had no authority over")
		}
	})

	t.Run("the teacher moderates it out of sight", func(t *testing.T) {
		res := w.teacher.call(t, w.teacher.server.updatePraise, "PATCH",
			"/api/v1/praises/"+given.ID.String(), `{"status":"hidden"}`, given.ID)

		if res.Code != http.StatusOK {
			t.Fatalf("a teacher must be able to moderate praise about a pupil they teach, got %d: %s",
				res.Code, res.Body.String())
		}
		if w.db.Client.Praise.GetX(ctx, given.ID).Status != entpraise.StatusHidden {
			t.Fatal("the praise was not hidden")
		}
	})

	t.Run("deleting is a soft removal", func(t *testing.T) {
		res := w.teacher.call(t, w.teacher.server.deletePraise, "DELETE",
			"/api/v1/praises/"+given.ID.String(), "", given.ID)

		if res.Code != http.StatusNoContent {
			t.Fatalf("the teacher must be able to remove praise, got %d: %s", res.Code, res.Body.String())
		}
		row, err := w.db.Client.Praise.Get(ctx, given.ID)
		if err != nil {
			t.Fatalf("recognition history must survive moderation: %v", err)
		}
		if row.Status != entpraise.StatusRemoved {
			t.Fatalf("the praise status is %s, want removed", row.Status)
		}
	})
}

func TestABadgeDefinitionNeedsSchoolWideReach(t *testing.T) {
	w := newRecognitionWorld(t)

	body := `{"name":"Reader of the term","code":"RDT-` + uuid.NewString()[:8] + `"}`

	t.Run("a subject teacher cannot mint a badge", func(t *testing.T) {
		rec := w.teacher.call(t, w.teacher.server.createAchievement, "POST",
			"/api/v1/achievements", body, uuid.Nil)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("a narrowed caller must not define a school-wide badge, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("the head mints it", func(t *testing.T) {
		rec := w.head.call(t, w.head.server.createAchievement, "POST",
			"/api/v1/achievements", body, uuid.Nil)

		if rec.Code != http.StatusCreated {
			t.Fatalf("school-wide reach must be able to define a badge, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("an auto_rule badge without criteria is refused", func(t *testing.T) {
		rec := w.head.call(t, w.head.server.createAchievement, "POST", "/api/v1/achievements",
			`{"name":"Perfect attendance","code":"PAT-`+uuid.NewString()[:8]+`","award_mode":"auto_rule"}`,
			uuid.Nil)

		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("an auto_rule badge must name what earns it, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})
}

func (w *recognitionWorld) seedPraise(kind entpraise.RecipientType, id uuid.UUID,
	giver uuid.UUID, visibility entpraise.Visibility) uuid.UUID {
	w.t.Helper()

	return w.db.Client.Praise.Create().
		SetRecipientType(kind).
		SetRecipientID(id).
		SetGivenByPersonID(giver).
		SetAcademicSessionID(w.sessionID).
		SetMessage("seeded praise " + uuid.NewString()[:8]).
		SetVisibility(visibility).
		SaveX(context.Background()).ID
}

func TestAReactionFollowsTheVisibilityOfItsPraise(t *testing.T) {
	w := newRecognitionWorld(t)
	ctx := context.Background()

	teacherPerson := w.db.Client.Staff.GetX(ctx, w.teacherStaffID).PersonID
	open := w.seedPraise(entpraise.RecipientTypeStudent, w.mateID, teacherPerson,
		entpraise.VisibilityClassOnly)
	closed := w.seedPraise(entpraise.RecipientTypeStudent, w.mateID, teacherPerson,
		entpraise.VisibilityPrivate)

	var reaction uuid.UUID

	t.Run("a classmate reacts to a praise they can read", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.reactToPraise, "POST",
			"/api/v1/praises/"+open.String()+"/reactions", `{"reaction_type":"clap"}`, open)

		if rec.Code != http.StatusCreated {
			t.Fatalf("a readable praise must accept a reaction, got %d: %s", rec.Code, rec.Body.String())
		}
		reaction = w.db.Client.PraiseReaction.Query().
			Where(entreaction.PraiseID(open)).OnlyX(ctx).ID
	})

	t.Run("a praise the caller cannot read takes no reaction", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.reactToPraise, "POST",
			"/api/v1/praises/"+closed.String()+"/reactions", `{"reaction_type":"heart"}`, closed)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("an unreadable praise must be a 404 that admits nothing, got %d: %s",
				rec.Code, rec.Body.String())
		}
		if n := w.db.Client.PraiseReaction.Query().
			Where(entreaction.PraiseID(closed)).CountX(ctx); n != 0 {
			t.Fatalf("a reaction was written against a praise the caller cannot read: %d rows", n)
		}
	})

	t.Run("a reactor_person_id the caller invents is refused at the door", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.reactToPraise, "POST",
			"/api/v1/praises/"+open.String()+"/reactions",
			`{"reaction_type":"heart","reactor_person_id":"`+teacherPerson.String()+`"}`, open)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("the reaction payload must not carry a reactor, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("the reactions are listed under the praise", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.listPraiseReactions, "GET",
			"/api/v1/praises/"+open.String()+"/reactions", "", open)

		if rec.Code != http.StatusOK {
			t.Fatalf("the reactions must be listable, got %d: %s", rec.Code, rec.Body.String())
		}
		if got := classroomField(t, rec, "count"); got != float64(1) {
			t.Fatalf("expected one reaction, got %v", got)
		}
	})

	t.Run("a bystander cannot remove somebody else's reaction", func(t *testing.T) {
		rec := w.mate.call(t, w.mate.server.deletePraiseReaction, "DELETE",
			"/api/v1/praise-reactions/"+reaction.String(), "", reaction)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("removing another person's reaction must be a 404, got %d: %s",
				rec.Code, rec.Body.String())
		}
		if !w.db.Client.PraiseReaction.Query().Where(entreaction.ID(reaction)).ExistX(ctx) {
			t.Fatal("the reaction was removed by somebody who did not leave it")
		}
	})

	t.Run("the reactor takes their own back", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.deletePraiseReaction, "DELETE",
			"/api/v1/praise-reactions/"+reaction.String(), "", reaction)

		if rec.Code != http.StatusNoContent {
			t.Fatalf("the reactor must be able to remove their own, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("the same reaction twice is a conflict", func(t *testing.T) {
		if rec := w.pupil.call(t, w.pupil.server.reactToPraise, "POST",
			"/api/v1/praises/"+open.String()+"/reactions",
			`{"reaction_type":"clap"}`, open); rec.Code != http.StatusCreated {
			t.Fatalf("the reaction could not be re-seeded: %d %s", rec.Code, rec.Body.String())
		}

		rec := w.pupil.call(t, w.pupil.server.reactToPraise, "POST",
			"/api/v1/praises/"+open.String()+"/reactions", `{"reaction_type":"clap"}`, open)

		if rec.Code != http.StatusConflict {
			t.Fatalf("the unique index must surface as 409, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestAwardReadsNarrowToTheCallersOwnAndTheirWards(t *testing.T) {
	w := newRecognitionWorld(t)

	t.Run("a pupil lists only their own awards", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.listStudentAchievements, "GET",
			"/api/v1/student-achievements", "", uuid.Nil)

		if rec.Code != http.StatusOK {
			t.Fatalf("a pupil must be able to list their badges, got %d: %s", rec.Code, rec.Body.String())
		}
		if got := classroomField(t, rec, "count"); got != float64(1) {
			t.Fatalf("a pupil must see exactly their own award, got %v", got)
		}
	})

	t.Run("a pupil cannot fetch a classmate's award by id", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.getStudentAchievement, "GET",
			"/api/v1/student-achievements/"+w.mateAward.String(), "", w.mateAward)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("a classmate's award must be a 404, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("the teacher sees both pupils they teach", func(t *testing.T) {
		rec := w.teacher.call(t, w.teacher.server.listStudentAchievements, "GET",
			"/api/v1/student-achievements", "", uuid.Nil)

		if rec.Code != http.StatusOK {
			t.Fatalf("the teacher must be able to list, got %d: %s", rec.Code, rec.Body.String())
		}
		if got := classroomField(t, rec, "count"); got != float64(2) {
			t.Fatalf("the teacher must see both awards in their class, got %v", got)
		}
	})
}

func TestABadgeStillReferencedCannotBeDeleted(t *testing.T) {
	w := newRecognitionWorld(t)

	rec := w.head.call(t, w.head.server.deleteAchievement, "DELETE",
		"/api/v1/achievements/"+w.badgeID.String(), "", w.badgeID)

	if rec.Code != http.StatusConflict {
		t.Fatalf("a badge that has been awarded is a historical fact and must not be deletable, got %d: %s",
			rec.Code, rec.Body.String())
	}
}
