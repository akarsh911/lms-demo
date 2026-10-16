package timetable_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

func (f *fixture) substituteSubject(slotKey string, on time.Time, teacherID, offeringID uuid.UUID) uuid.UUID {
	f.t.Helper()
	return f.deviate(slotKey, on, entdeviation.KindSubstitution).
		SetSubstituteTeacherID(teacherID).
		SetSubjectOfferingID(offeringID).
		SetReason("covered as another subject").
		SaveX(f.ctx).ID
}

func resolveWeek(t *testing.T, f *fixture) []timetable.Occurrence {
	t.Helper()

	got, err := serviceFor(f).Resolve(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID,
		From:     f.Mon,
		To:       f.Sun,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	return got
}

func TestSubstitutionRecordsTheSubjectItDisplaced(t *testing.T) {
	f := newFixture(t)

	f.substituteSubject("xia-mon-p1", f.Mon, f.Teacher["t2"], f.OffCommerce)

	occ := find(t, resolveWeek(t, f), f.Slot["xia-mon-p1"], f.Mon)

	if occ.State != timetable.StateSubstituted {
		t.Fatalf("Monday P1 state %q, want substituted", occ.State)
	}
	if occ.SubjectOfferingID == nil || *occ.SubjectOfferingID != f.OffCommerce {
		t.Errorf("the occurrence must carry the subject actually taught (%s), got %v",
			f.OffCommerce, occ.SubjectOfferingID)
	}
	if occ.PlannedSubjectOfferingID == nil {
		t.Fatalf("a substituted lesson that changed subject records nothing about the subject it displaced; " +
			"a lesson planner reading this cannot tell it from a lesson that was always Commerce")
	}
	if *occ.PlannedSubjectOfferingID != f.OffPhysics {
		t.Errorf("the displaced subject must be the timetabled one (%s), got %s",
			f.OffPhysics, *occ.PlannedSubjectOfferingID)
	}
	if !occ.SubjectDisplaced() {
		t.Errorf("the occurrence does not read as displaced: it reports planned %v against taught %v",
			occ.PlannedSubjectOfferingID, occ.SubjectOfferingID)
	}
	if occ.PlannedTeacherID == nil || *occ.PlannedTeacherID != f.Teacher["t1"] {
		t.Errorf("the planned teacher must survive the substitution unchanged, got %v", occ.PlannedTeacherID)
	}
	if occ.TeacherID == nil || *occ.TeacherID != f.Teacher["t2"] {
		t.Errorf("the occurrence must carry the substitute teacher, got %v", occ.TeacherID)
	}
}

func TestSubstitutionKeepingTheSubjectDisplacesNothing(t *testing.T) {
	f := newFixture(t)

	f.substitute("xia-mon-p1", f.Mon, f.Teacher["t2"])

	occ := find(t, resolveWeek(t, f), f.Slot["xia-mon-p1"], f.Mon)

	if occ.State != timetable.StateSubstituted {
		t.Fatalf("Monday P1 state %q, want substituted", occ.State)
	}
	if occ.PlannedSubjectOfferingID == nil || *occ.PlannedSubjectOfferingID != f.OffPhysics {
		t.Fatalf("the planned subject must be reported even when it is unchanged, got %v",
			occ.PlannedSubjectOfferingID)
	}
	if occ.SubjectOfferingID == nil || *occ.SubjectOfferingID != f.OffPhysics {
		t.Fatalf("a teacher-only substitution must not move the subject, got %v", occ.SubjectOfferingID)
	}
	if occ.SubjectDisplaced() {
		t.Errorf("a teacher-only substitution displaces no subject yet the occurrence claims it did")
	}
}

func TestAnOrdinaryLessonReportsItsPlannedSubjectAlongsideTheTaughtOne(t *testing.T) {
	f := newFixture(t)

	f.moveRoom("xia-mon-p2", f.Mon, f.RoomC)

	got := resolveWeek(t, f)

	plain := find(t, got, f.Slot["xia-mon-p1"], f.Mon)
	if plain.PlannedSubjectOfferingID == nil {
		t.Fatalf("an untouched lesson must still say what was planned, the way it does for teacher %v and room %v",
			plain.PlannedTeacherID, plain.PlannedRoomID)
	}
	if *plain.PlannedSubjectOfferingID != *plain.SubjectOfferingID {
		t.Errorf("an untouched lesson planned %s and taught %s",
			*plain.PlannedSubjectOfferingID, *plain.SubjectOfferingID)
	}
	if plain.SubjectDisplaced() {
		t.Errorf("an untouched lesson displaces no subject")
	}

	moved := find(t, got, f.Slot["xia-mon-p2"], f.Mon)
	if moved.State != timetable.StateRelocated {
		t.Fatalf("Monday P2 state %q, want relocated", moved.State)
	}
	if moved.SubjectDisplaced() {
		t.Errorf("a room change displaces no subject, got planned %v against taught %v",
			moved.PlannedSubjectOfferingID, moved.SubjectOfferingID)
	}
	if moved.PlannedRoomID == nil || *moved.PlannedRoomID != f.RoomB {
		t.Errorf("a room change must keep the planned room %s, got %v", f.RoomB, moved.PlannedRoomID)
	}
}

func TestACancelledLessonKeepsThePeriodItLost(t *testing.T) {
	f := newFixture(t)

	f.cancel("xia-mon-p1", f.Mon)

	occ := find(t, resolveWeek(t, f), f.Slot["xia-mon-p1"], f.Mon)

	if !occ.Cancelled() {
		t.Fatalf("Monday P1 state %q, want cancelled", occ.State)
	}
	if occ.PlannedSubjectOfferingID == nil || *occ.PlannedSubjectOfferingID != f.OffPhysics {
		t.Fatalf("a cancelled lesson must still name the subject that lost the period, got %v",
			occ.PlannedSubjectOfferingID)
	}
	if occ.SubjectDisplaced() {
		t.Errorf("a cancellation replaces the subject with nothing, it does not displace it; " +
			"the loss is carried by the cancelled state")
	}
}

func TestAnAddedClassDisplacesNoSubjectAndSaysSo(t *testing.T) {
	f := newFixture(t)

	added := f.addClass(f.Thu, f.SectionXIA, f.P2, f.OffCommerce, f.Teacher["t2"], f.RoomB)

	got := occurrenceOn(t, resolveWeek(t, f), f.Thu)
	if len(got) != 1 {
		t.Fatalf("Thursday resolved %d occurrences, want the added class only", len(got))
	}
	occ := got[0]

	if occ.DeviationID == nil || *occ.DeviationID != added {
		t.Fatalf("the Thursday occurrence is not the added class: %+v", occ)
	}
	if !occ.Added() {
		t.Fatalf("Thursday state %q, want added", occ.State)
	}
	if occ.SubjectOfferingID == nil || *occ.SubjectOfferingID != f.OffCommerce {
		t.Errorf("an added class carries the subject it teaches, got %v", occ.SubjectOfferingID)
	}
	if occ.PlannedSubjectOfferingID != nil {
		t.Errorf("an added class stands on no slot, so nothing was displaced, yet it reports planned subject %s",
			*occ.PlannedSubjectOfferingID)
	}
	if occ.PlannedTeacherID != nil || occ.PlannedRoomID != nil {
		t.Errorf("the planned subject must be absent on an added class exactly as the planned teacher %v "+
			"and planned room %v are", occ.PlannedTeacherID, occ.PlannedRoomID)
	}
	if occ.SubjectDisplaced() {
		t.Errorf("an added class displaces nothing")
	}
}
