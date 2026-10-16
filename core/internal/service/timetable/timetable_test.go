package timetable_test

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

func serviceFor(f *fixture) *timetable.Service { return timetable.New(f.db) }

func occurrenceOn(t *testing.T, all []timetable.Occurrence, on time.Time) []timetable.Occurrence {
	t.Helper()
	var out []timetable.Occurrence
	for _, occ := range all {
		if occ.Date.Equal(on) {
			out = append(out, occ)
		}
	}
	return out
}

func find(t *testing.T, all []timetable.Occurrence, slotID uuid.UUID, on time.Time) timetable.Occurrence {
	t.Helper()
	for _, occ := range all {
		if occ.SlotID != nil && *occ.SlotID == slotID && occ.Date.Equal(on) {
			return occ
		}
	}
	t.Fatalf("no occurrence for slot %s on %s", slotID, on.Format("2006-01-02"))
	return timetable.Occurrence{}
}

func TestResolveWeek(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	f.cancel("xia-tue-p1", f.Tue)
	added := f.addClass(f.Thu, f.SectionXIA, f.P2, f.OffCommerce, f.Teacher["t2"], f.RoomB)

	got, err := svc.Resolve(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID,
		From:     f.Mon,
		To:       f.Sun,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	counts := map[string]int{}
	for _, occ := range got {
		counts[occ.Date.Format("2006-01-02")]++
	}
	t.Logf("occurrences per day: %v", counts)

	want := map[string]int{
		"2026-04-06": 8,
		"2026-04-07": 1,
		"2026-04-09": 1,
		"2026-04-11": 1,
	}
	if len(counts) != len(want) {
		t.Fatalf("resolved %d distinct days, want %d: %v", len(counts), len(want), counts)
	}
	for day, n := range want {
		if counts[day] != n {
			t.Errorf("%s resolved %d occurrences, want %d", day, counts[day], n)
		}
	}

	monday := find(t, got, f.Slot["xia-mon-p1"], f.Mon)
	if monday.StartMinute != 545 || monday.EndMinute != 585 || !monday.TimesResolved {
		t.Errorf("Monday P1 resolved %d-%d (resolved=%v), want 545-585",
			monday.StartMinute, monday.EndMinute, monday.TimesResolved)
	}
	if monday.State != timetable.StatePlanned {
		t.Errorf("Monday P1 state %q, want planned", monday.State)
	}
	if monday.Half != timetable.HalfForenoon {
		t.Errorf("Monday P1 half %q, want forenoon", monday.Half)
	}

	mondayP4 := find(t, got, f.Slot["xia-mon-p4-phy"], f.Mon)
	if mondayP4.StartMinute != 725 || mondayP4.Half != timetable.HalfAfternoon {
		t.Errorf("Monday P4 resolved %d (%s), want 725 afternoon", mondayP4.StartMinute, mondayP4.Half)
	}

	saturday := occurrenceOn(t, got, f.Sat)
	if len(saturday) != 1 {
		t.Fatalf("Saturday resolved %d occurrences, want 1", len(saturday))
	}
	if saturday[0].StartMinute != 500 || saturday[0].EndMinute != 535 {
		t.Errorf("Saturday P1 resolved %d-%d, want 500-535 from the Saturday bell schedule",
			saturday[0].StartMinute, saturday[0].EndMinute)
	}
	if saturday[0].SlotID == nil || *saturday[0].SlotID != f.Slot["xia-sat-p1"] {
		t.Errorf("Saturday resolved the wrong slot: %v", saturday[0].SlotID)
	}

	cancelled := find(t, got, f.Slot["xia-tue-p1"], f.Tue)
	if cancelled.State != timetable.StateCancelled || !cancelled.Cancelled() {
		t.Errorf("Tuesday P1 state %q, want cancelled", cancelled.State)
	}
	if cancelled.SubjectOfferingID == nil || *cancelled.SubjectOfferingID != f.OffPhysics {
		t.Errorf("a cancelled occurrence must still carry its subject so the UI can render it")
	}

	thursday := occurrenceOn(t, got, f.Thu)
	if len(thursday) != 1 {
		t.Fatalf("Thursday resolved %d occurrences, want the added class only", len(thursday))
	}
	if thursday[0].State != timetable.StateAdded {
		t.Errorf("Thursday state %q, want added", thursday[0].State)
	}
	if thursday[0].SlotID != nil {
		t.Errorf("an added class has no slot, got %v", thursday[0].SlotID)
	}
	if thursday[0].DeviationID == nil || *thursday[0].DeviationID != added {
		t.Errorf("added occurrence points at %v, want deviation %s", thursday[0].DeviationID, added)
	}
	if thursday[0].ID != timetable.AddedOccurrenceID(added, f.Thu) {
		t.Errorf("added occurrence id is not the deviation-keyed UUIDv5")
	}
	if thursday[0].StartMinute != 585 {
		t.Errorf("added class start %d, want 585 from the regular bell schedule", thursday[0].StartMinute)
	}

	for _, occ := range got {
		if occ.Date.Equal(f.Wed) {
			t.Errorf("Wednesday is a closed holiday yet resolved %v", occ.ID)
		}
		if occ.Date.Equal(f.Sun) {
			t.Errorf("Sunday has no calendar row yet resolved %v", occ.ID)
		}
	}
}

func TestResolveOmitCancelled(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)
	f.cancel("xia-tue-p1", f.Tue)

	got, err := svc.Resolve(f.ctx, timetable.ResolveQuery{
		BranchID:      f.BranchID,
		From:          f.Tue,
		To:            f.Tue,
		OmitCancelled: true,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("OmitCancelled still returned %d occurrences", len(got))
	}
}

func TestOccurrenceIDIsStableDistinctV5(t *testing.T) {
	slot := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	other := uuid.MustParse("11111111-2222-3333-4444-555555555556")
	day := date(2026, time.April, 6)

	a := timetable.OccurrenceID(slot, day)
	b := timetable.OccurrenceID(slot, day.Add(9*time.Hour))
	if a != b {
		t.Errorf("the occurrence id must ignore the time of day: %s vs %s", a, b)
	}
	if a.Version() != 5 {
		t.Errorf("occurrence id version %d, want 5", a.Version())
	}
	if a == timetable.OccurrenceID(slot, date(2026, time.April, 7)) {
		t.Errorf("the same slot on two dates must not share an id")
	}
	if a == timetable.OccurrenceID(other, day) {
		t.Errorf("two slots on the same date must not share an id")
	}
	if a == timetable.AddedOccurrenceID(slot, day) {
		t.Errorf("the added-class namespace must not collide with the slot namespace")
	}
	if timetable.AddedOccurrenceID(slot, day).Version() != 5 {
		t.Errorf("added occurrence id is not version 5")
	}
	t.Logf("slot-keyed=%s added-keyed=%s", a, timetable.AddedOccurrenceID(slot, day))
}

func TestIsInSession(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	cases := []struct {
		name string
		on   time.Time
		half timetable.Half
		want bool
	}{
		{"monday any", f.Mon, timetable.HalfAny, true},
		{"monday forenoon", f.Mon, timetable.HalfForenoon, true},
		{"monday afternoon", f.Mon, timetable.HalfAfternoon, true},
		{"holiday any", f.Wed, timetable.HalfAny, false},
		{"holiday forenoon", f.Wed, timetable.HalfForenoon, false},
		{"saturday forenoon", f.Sat, timetable.HalfForenoon, true},
		{"saturday afternoon", f.Sat, timetable.HalfAfternoon, false},
		{"saturday any", f.Sat, timetable.HalfAny, true},
		{"undeclared sunday", f.Sun, timetable.HalfAny, false},
		{"undeclared sunday forenoon", f.Sun, timetable.HalfForenoon, false},
	}

	for _, tc := range cases {
		got, err := svc.IsInSession(f.ctx, f.BranchID, tc.on, tc.half)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if got != tc.want {
			t.Errorf("%s (%s): got %v want %v", tc.name, tc.on.Format("2006-01-02"), got, tc.want)
		}
	}

	dates, err := svc.SessionDates(f.ctx, f.BranchID, f.Mon, f.Sun, timetable.HalfAfternoon)
	if err != nil {
		t.Fatalf("session dates: %v", err)
	}
	if len(dates) != 4 {
		t.Fatalf("afternoon session dates %d, want 4 (Mon Tue Thu Fri): %v", len(dates), dates)
	}
	for _, on := range dates {
		if on.Equal(f.Sat) || on.Equal(f.Wed) {
			t.Errorf("%s must not be an afternoon session date", on.Format("2006-01-02"))
		}
	}
}

func TestClashBaselineIsClean(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	report, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    f.BranchID,
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !report.Clear() {
		for _, clash := range report.Clashes {
			t.Errorf("unexpected %s clash at %s scope: %+v", clash.Rule, clash.Scope, clash)
		}
		t.Fatalf("the baseline timetable must be clash free")
	}
	t.Logf("baseline clean; dates checked=%d", len(report.DatesChecked))
}

func TestTeacherClashFires(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	report, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    f.BranchID,
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
		Proposed: []timetable.Proposal{{
			Ref:               "new-maths",
			SectionID:         f.SectionXIIA,
			PeriodID:          f.P1,
			DayOfWeek:         1,
			SubjectOfferingID: &f.OffMathsA,
			TeacherID:         ptr(f.Teacher["t1"]),
			RoomID:            &f.RoomC,
		}},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if len(report.Clashes) != 1 {
		t.Fatalf("got %d clashes, want exactly one teacher clash: %+v", len(report.Clashes), report.Clashes)
	}
	clash := report.Clashes[0]
	if clash.Rule != timetable.RuleTeacher {
		t.Fatalf("rule %q, want teacher", clash.Rule)
	}
	if clash.TeacherID == nil || *clash.TeacherID != f.Teacher["t1"] {
		t.Errorf("clash names teacher %v, want t1", clash.TeacherID)
	}
	t.Logf("teacher clash: scope=%s dow=%d left.slot=%v right.ref=%q",
		clash.Scope, clash.DayOfWeek, clash.Left.SlotID, clash.Right.Ref)
}

func TestTeacherClashDoesNotFireOnFreeTeacher(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	report, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    f.BranchID,
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
		Proposed: []timetable.Proposal{{
			Ref:               "new-maths",
			SectionID:         f.SectionXIIA,
			PeriodID:          f.P1,
			DayOfWeek:         1,
			SubjectOfferingID: &f.OffMathsA,
			TeacherID:         ptr(f.Teacher["t4"]),
			RoomID:            &f.RoomC,
		}},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !report.Clear() {
		t.Fatalf("a free teacher in a free room must not clash: %+v", report.Clashes)
	}
}

func TestRoomClashFires(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	report, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    f.BranchID,
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
		Proposed: []timetable.Proposal{{
			Ref:               "new-maths",
			SectionID:         f.SectionXIIA,
			PeriodID:          f.P1,
			DayOfWeek:         1,
			SubjectOfferingID: &f.OffMathsA,
			TeacherID:         ptr(f.Teacher["t4"]),
			RoomID:            &f.RoomA,
		}},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if len(report.Clashes) != 1 {
		t.Fatalf("got %d clashes, want exactly one room clash: %+v", len(report.Clashes), report.Clashes)
	}
	if report.Clashes[0].Rule != timetable.RuleRoom {
		t.Fatalf("rule %q, want room", report.Clashes[0].Rule)
	}
	if report.Clashes[0].RoomID == nil || *report.Clashes[0].RoomID != f.RoomA {
		t.Errorf("clash names room %v, want room A", report.Clashes[0].RoomID)
	}
}

func TestRoomClashDoesNotFireOnTwoNullRooms(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	report, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    f.BranchID,
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
		Rules:       []timetable.Rule{timetable.RuleRoom},
		Proposed: []timetable.Proposal{{
			Ref:               "roomless",
			SectionID:         f.SectionXIIA,
			PeriodID:          f.P3,
			DayOfWeek:         1,
			SubjectOfferingID: &f.OffMathsA,
			TeacherID:         ptr(f.Teacher["t4"]),
		}},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !report.Clear() {
		t.Fatalf("two roomless slots in the same period are not a room clash: %+v", report.Clashes)
	}
}

func TestConcurrentElectivesAreNotAStudentClash(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	report, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    f.BranchID,
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
		Rules:       []timetable.Rule{timetable.RuleStudentSet},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !report.Clear() {
		for _, clash := range report.Clashes {
			t.Errorf("Monday P4 runs Physics and History concurrently for the same section; "+
				"disjoint student sets are not a clash. got: %+v", clash)
		}
		t.Fatalf("the clash unit is the student set, not the section")
	}
	t.Logf("XI-A Monday P4 offers Physics (t5, room A) and History (t6, room B) to disjoint student sets: no clash")
}

func TestSharedStudentMakesConcurrentElectivesClash(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	f.enrolSubject("s1", f.OffHistory)

	report, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    f.BranchID,
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
		Rules:       []timetable.Rule{timetable.RuleStudentSet},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if len(report.Clashes) != 1 {
		t.Fatalf("got %d clashes, want exactly one student-set clash: %+v", len(report.Clashes), report.Clashes)
	}
	clash := report.Clashes[0]
	if clash.Rule != timetable.RuleStudentSet {
		t.Fatalf("rule %q, want student_set", clash.Rule)
	}
	if clash.StudentCount != 1 || len(clash.StudentIDs) != 1 || clash.StudentIDs[0] != f.Student["s1"] {
		t.Fatalf("clash must name s1 only, got count=%d ids=%v", clash.StudentCount, clash.StudentIDs)
	}
	if clash.PeriodID == nil || *clash.PeriodID != f.P4 {
		t.Errorf("clash period %v, want P4", clash.PeriodID)
	}
	t.Logf("s1 now sits in both Monday P4 electives: %s clash on student %s", clash.Rule, clash.StudentIDs[0])
}

func TestSubstituteTeacherClashesOnlyOnItsDate(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	f.substitute("xia-mon-p2", f.Mon, f.Teacher["t1"])

	report, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    f.BranchID,
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if len(report.Clashes) != 1 {
		t.Fatalf("got %d clashes, want exactly one: %+v", len(report.Clashes), report.Clashes)
	}
	clash := report.Clashes[0]
	if clash.Scope != timetable.ScopeDate {
		t.Fatalf("scope %q, want date: the pattern has t2 here, only 6 April has t1", clash.Scope)
	}
	if clash.Rule != timetable.RuleTeacher {
		t.Fatalf("rule %q, want teacher", clash.Rule)
	}
	if clash.Date == nil || !clash.Date.Equal(f.Mon) {
		t.Fatalf("clash date %v, want 2026-04-06", clash.Date)
	}
	if clash.TeacherID == nil || *clash.TeacherID != f.Teacher["t1"] {
		t.Errorf("clash names teacher %v, want the substitute t1", clash.TeacherID)
	}
	t.Logf("substitution on %s puts t1 in two rooms at once; the pattern alone is clean",
		clash.Date.Format("2006-01-02"))
}

func TestRoomChangeDeviationClashesOnItsDate(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	f.moveRoom("xiia-mon-p3", f.Mon, f.RoomA)

	report, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    f.BranchID,
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
		Rules:       []timetable.Rule{timetable.RuleRoom},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if len(report.Clashes) != 1 {
		t.Fatalf("got %d clashes, want exactly one room clash: %+v", len(report.Clashes), report.Clashes)
	}
	clash := report.Clashes[0]
	if clash.Scope != timetable.ScopeDate || clash.Rule != timetable.RuleRoom {
		t.Fatalf("got %s/%s, want date/room", clash.Scope, clash.Rule)
	}
	if clash.RoomID == nil || *clash.RoomID != f.RoomA {
		t.Errorf("clash names room %v, want room A", clash.RoomID)
	}
}

func TestCheckUnreachableTimetableIsNotFound(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	_, err := svc.Check(f.ctx, timetable.ClashQuery{
		BranchID:    uuid.New(),
		TimetableID: f.TimetableID,
		From:        f.Mon,
		To:          f.Sun,
	})
	if err != timetable.ErrNotFound {
		t.Fatalf("a timetable outside the branch must read as not found, got %v", err)
	}
}

func ptr[T any](v T) *T { return &v }

func TestResolveRefusesSlotScopeWithoutDeviationScope(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	mine := f.addClass(f.Thu, f.SectionXIA, f.P2, f.OffCommerce, f.Teacher["t2"], f.RoomB)
	foreign := f.addClass(f.Thu, f.SectionXIIA, f.P2, f.OffMathsA, f.Teacher["t3"], f.RoomC)

	got, err := svc.Resolve(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID,
		From:     f.Mon,
		To:       f.Sun,
		Slots:    []predicate.TimetableSlot{entslot.SectionID(f.SectionXIA)},
	})
	if errors.Is(err, timetable.ErrScopeIncomplete) {
		return
	}

	for _, occ := range got {
		if occ.DeviationID != nil && *occ.DeviationID == foreign {
			t.Errorf("an added class in section XII-A leaked into a read scoped to XI-A: "+
				"occurrence %s deviation %s section %s", occ.ID, foreign, occ.SectionID)
		}
	}
	t.Fatalf("Resolve narrowed slots but not deviations and returned err=%v with %d occurrences "+
		"(own added class %s); it must refuse instead of widening", err, len(got), mine)
}

func TestResolveDayScopesAddedClasses(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	mine := f.addClass(f.Thu, f.SectionXIA, f.P2, f.OffCommerce, f.Teacher["t2"], f.RoomB)
	foreign := f.addClass(f.Thu, f.SectionXIIA, f.P2, f.OffMathsA, f.Teacher["t3"], f.RoomC)

	got, err := svc.ResolveDay(f.ctx, f.BranchID, f.Thu, timetable.HalfAny,
		[]predicate.TimetableSlot{entslot.SectionID(f.SectionXIA)},
		[]predicate.TimetableDeviation{entdeviation.SectionID(f.SectionXIA)},
	)
	if err != nil {
		t.Fatalf("resolve day: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d occurrences, want only the XI-A added class: %+v", len(got), got)
	}
	if got[0].DeviationID == nil || *got[0].DeviationID != mine {
		t.Fatalf("resolved deviation %v, want %s", got[0].DeviationID, mine)
	}
	for _, occ := range got {
		if occ.DeviationID != nil && *occ.DeviationID == foreign {
			t.Errorf("the XII-A added class %s leaked through a scoped ResolveDay", foreign)
		}
	}
}

func TestResolveUnrestrictedStillSeesEverything(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	f.addClass(f.Thu, f.SectionXIA, f.P2, f.OffCommerce, f.Teacher["t2"], f.RoomB)
	f.addClass(f.Thu, f.SectionXIIA, f.P2, f.OffMathsA, f.Teacher["t3"], f.RoomC)

	got, err := svc.Resolve(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID,
		From:     f.Thu,
		To:       f.Thu,
	})
	if err != nil {
		t.Fatalf("an unrestricted caller passes neither predicate set and must still work: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d occurrences, want both added classes: %+v", len(got), got)
	}
}

func TestResolveRefusesDeviationScopeWithoutSlotScope(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	_, err := svc.Resolve(f.ctx, timetable.ResolveQuery{
		BranchID:   f.BranchID,
		From:       f.Mon,
		To:         f.Sun,
		Deviations: []predicate.TimetableDeviation{entdeviation.SectionID(f.SectionXIA)},
	})
	if !errors.Is(err, timetable.ErrScopeIncomplete) {
		t.Fatalf("narrowing deviations alone leaves every slot in the branch visible; "+
			"want ErrScopeIncomplete, got %v", err)
	}
}

func TestASuppressedPeriodDoesNotRunOnThatBellSchedule(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	before, err := svc.Resolve(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID, From: f.Mon, To: f.Mon,
	})
	if err != nil {
		t.Fatalf("resolve before: %v", err)
	}
	if countPeriod(before, f.P1) == 0 {
		t.Fatalf("the fixture has no period-1 lesson on Monday, so suppressing it would prove nothing")
	}

	f.suppress(f.BellRegular, f.P1)

	after, err := svc.Resolve(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID, From: f.Mon, To: f.Mon,
	})
	if err != nil {
		t.Fatalf("resolve after: %v", err)
	}
	if got := countPeriod(after, f.P1); got != 0 {
		t.Fatalf("a suppressed period still produced %d occurrences", got)
	}
	if countPeriod(after, f.P2) != countPeriod(before, f.P2) {
		t.Fatalf("suppressing period 1 changed how many period-2 lessons run")
	}
}

func TestAPeriodWithNoBellRowStillRunsWithoutATime(t *testing.T) {
	f := newFixture(t)
	svc := serviceFor(f)

	f.unbell(f.BellRegular, f.P2)

	got, err := svc.Resolve(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID, From: f.Mon, To: f.Mon,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if countPeriod(got, f.P2) == 0 {
		t.Fatalf("a period with no bell row vanished; absence means the time is unknown, not that the period was dropped")
	}
	for _, occ := range got {
		if occ.PeriodID == f.P2 && occ.TimesResolved {
			t.Fatalf("a period with no bell row reported a resolved time")
		}
	}
}

func countPeriod(occurrences []timetable.Occurrence, periodID uuid.UUID) int {
	n := 0
	for _, occ := range occurrences {
		if occ.PeriodID == periodID {
			n++
		}
	}
	return n
}
