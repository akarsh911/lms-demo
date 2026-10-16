package timetable_test

import (
	"errors"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"

	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

func (f *fixture) dayOf(on time.Time) uuid.UUID {
	f.t.Helper()
	rows := f.db.CalendarDay.Query().AllX(f.ctx)
	for _, row := range rows {
		if row.BranchID == f.BranchID && timetable.Day(row.CalendarDate).Equal(timetable.Day(on)) {
			return row.ID
		}
	}
	f.t.Fatalf("no calendar day for %s", on.Format("2006-01-02"))
	return uuid.Nil
}

func (f *fixture) substituteDay(on time.Time, dayOfWeek int) {
	f.t.Helper()
	f.db.CalendarDay.UpdateOneID(f.dayOf(on)).SetSubstituteDayOfWeek(dayOfWeek).SaveX(f.ctx)
}

func (f *fixture) substituteSectionDay(on time.Time, sectionID uuid.UUID, dayOfWeek int) uuid.UUID {
	f.t.Helper()
	return f.db.CalendarDaySectionPattern.Create().
		SetCalendarDayID(f.dayOf(on)).
		SetSectionID(sectionID).
		SetSubstituteDayOfWeek(dayOfWeek).
		SaveX(f.ctx).ID
}

func (f *fixture) coverWith(timetableID uuid.UUID, sections ...uuid.UUID) {
	f.t.Helper()
	for _, section := range sections {
		f.db.TimetableSection.Create().
			SetTimetableID(timetableID).
			SetSectionID(section).
			SaveX(f.ctx)
	}
}

func (f *fixture) draft(name string, from time.Time, to *time.Time) uuid.UUID {
	f.t.Helper()
	create := f.db.Timetable.Create().
		SetAcademicSessionID(f.SessionID).
		SetPeriodSchemeID(f.SchemeID).
		SetName(name).
		SetEffectiveFrom(from).
		SetStatus(enttimetable.StatusDraft)
	if to != nil {
		create = create.SetEffectiveTo(*to)
	}
	return create.SaveX(f.ctx).ID
}

func resolveOn(t *testing.T, f *fixture, on time.Time) []timetable.Occurrence {
	t.Helper()
	got, err := serviceFor(f).Resolve(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID,
		From:     on,
		To:       on,
	})
	if err != nil {
		t.Fatalf("resolve %s: %v", on.Format("2006-01-02"), err)
	}
	return got
}

func periodsFor(occurrences []timetable.Occurrence, sectionID uuid.UUID) []string {
	var out []string
	for _, occ := range occurrences {
		if occ.SectionID != sectionID {
			continue
		}
		out = append(out, occ.PeriodCode)
	}
	sort.Strings(out)
	return out
}

func TestADayWideSubstitutionRunsTheOtherWeekdayForEverySection(t *testing.T) {
	f := newFixture(t)

	before := resolveOn(t, f, f.Sat)
	if len(periodsFor(before, f.SectionXIA)) == 0 {
		t.Fatal("the fixture Saturday must teach XI-A for this test to mean anything")
	}

	f.substituteDay(f.Sat, 1)
	after := resolveOn(t, f, f.Sat)

	slots := map[uuid.UUID]bool{}
	for _, occ := range after {
		if occ.SlotID != nil {
			slots[*occ.SlotID] = true
		}
		if occ.DayOfWeek != 1 {
			t.Fatalf("a Saturday running the Monday pattern must return Monday slots, got day %d",
				occ.DayOfWeek)
		}
		if occ.CalendarDayOfWeek != 6 {
			t.Fatalf("the occurrence must still say the date was a Saturday, got %d",
				occ.CalendarDayOfWeek)
		}
	}
	if slots[f.Slot["xia-sat-p1"]] || slots[f.Slot["xia-sat-p4"]] {
		t.Fatal("the real Saturday slots must not run on a day given over to the Monday pattern")
	}
	if !slots[f.Slot["xia-mon-p1"]] {
		t.Fatal("the Monday slots must run on a Saturday given over to the Monday pattern")
	}
	if !slots[f.Slot["xiia-mon-p2"]] {
		t.Fatal("a day-wide substitution must move every section, not only the first")
	}
}

func TestASectionPatternBeatsTheDayWideOneAndLeavesOtherSectionsAlone(t *testing.T) {
	f := newFixture(t)

	f.substituteDay(f.Sat, 1)
	f.substituteSectionDay(f.Sat, f.SectionXIA, 2)

	after := resolveOn(t, f, f.Sat)

	slots := map[uuid.UUID]bool{}
	for _, occ := range after {
		if occ.SlotID != nil {
			slots[*occ.SlotID] = true
		}
	}

	if !slots[f.Slot["xia-tue-p1"]] {
		t.Fatal("XI-A was overridden to Tuesday and must run its Tuesday slot")
	}
	if slots[f.Slot["xia-mon-p1"]] {
		t.Fatal("XI-A was overridden to Tuesday, so the day-wide Monday pattern must not reach it")
	}
	if slots[f.Slot["xia-sat-p1"]] {
		t.Fatal("XI-A must not run its real Saturday slot on a substituted day")
	}
	if !slots[f.Slot["xiia-mon-p2"]] {
		t.Fatal("XII-A had no override of its own and must keep the day-wide Monday pattern")
	}
}

func TestASectionPatternAloneMovesOnlyThatSection(t *testing.T) {
	f := newFixture(t)

	f.substituteSectionDay(f.Sat, f.SectionXIA, 1)
	after := resolveOn(t, f, f.Sat)

	slots := map[uuid.UUID]bool{}
	for _, occ := range after {
		if occ.SlotID != nil {
			slots[*occ.SlotID] = true
		}
	}

	if !slots[f.Slot["xia-mon-p1"]] {
		t.Fatal("the overridden section must run the Monday pattern")
	}
	if slots[f.Slot["xia-sat-p1"]] {
		t.Fatal("the overridden section must not also run its real Saturday")
	}
	for _, occ := range after {
		if occ.SectionID == f.SectionXIA {
			continue
		}
		if occ.DayOfWeek != 6 {
			t.Fatalf("section %s was not overridden and must stay on Saturday, got day %d",
				occ.SectionID, occ.DayOfWeek)
		}
	}
}

func TestADateNoTimetableCoversIsReportedAsUncovered(t *testing.T) {
	f := newFixture(t)

	f.db.Timetable.UpdateOneID(f.TimetableID).
		SetEffectiveTo(f.Mon).
		SaveX(f.ctx)

	resolved, err := serviceFor(f).ResolveCoverage(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID,
		From:     f.Tue,
		To:       f.Tue,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(resolved.Occurrences) != 0 {
		t.Fatalf("no timetable is in force on Tuesday, so nothing should resolve, got %d",
			len(resolved.Occurrences))
	}
	if len(resolved.Uncovered) != 1 {
		t.Fatalf("an open instructional day with no timetable in force must be reported as a gap, got %v",
			resolved.Uncovered)
	}
	if !resolved.Uncovered[0].Date.Equal(timetable.Day(f.Tue)) {
		t.Fatalf("the gap must name Tuesday, got %s", resolved.Uncovered[0].Date)
	}
	if resolved.Uncovered[0].PeriodSchemeID != f.SchemeID {
		t.Fatalf("the gap must name the period scheme left uncovered, got %s",
			resolved.Uncovered[0].PeriodSchemeID)
	}
}

func TestAHolidayIsNotReportedAsAnUncoveredDay(t *testing.T) {
	f := newFixture(t)

	f.db.Timetable.UpdateOneID(f.TimetableID).SetEffectiveTo(f.Mon).SaveX(f.ctx)

	resolved, err := serviceFor(f).ResolveCoverage(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID,
		From:     f.Wed,
		To:       f.Wed,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(resolved.Uncovered) != 0 {
		t.Fatalf("the fixture Wednesday is a closed holiday, not a hole in the timetable, "+
			"even with no timetable in force; got %v", resolved.Uncovered)
	}
}

func TestACoveredDayReportsNoGap(t *testing.T) {
	f := newFixture(t)

	resolved, err := serviceFor(f).ResolveCoverage(f.ctx, timetable.ResolveQuery{
		BranchID: f.BranchID,
		From:     f.Mon,
		To:       f.Mon,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(resolved.Occurrences) == 0 {
		t.Fatal("Monday teaches in the fixture, so this assertion would pass vacuously")
	}
	if len(resolved.Uncovered) != 0 {
		t.Fatalf("a day a published timetable covers must report no gap, got %v", resolved.Uncovered)
	}
}

func TestPublishRefusesAnOverlapOnASharedSection(t *testing.T) {
	f := newFixture(t)

	f.coverWith(f.TimetableID, f.SectionXIA, f.SectionXIIA)

	rival := f.draft("Rival", date(2026, time.May, 1), nil)
	f.coverWith(rival, f.SectionXIA)

	_, err := serviceFor(f).Publish(f.ctx, timetable.PublishRequest{TimetableID: rival})

	var clash *timetable.PublishConflictError
	if !errors.As(err, &clash) {
		t.Fatalf("publishing over a section already published elsewhere must be refused, got %v", err)
	}
	if len(clash.Conflicts) != 1 {
		t.Fatalf("exactly the one overlapping timetable must be named, got %v", clash.Conflicts)
	}
	if clash.Conflicts[0].TimetableID != f.TimetableID {
		t.Fatalf("the conflict must name the published timetable, got %s", clash.Conflicts[0].TimetableID)
	}
	if len(clash.Conflicts[0].SectionIDs) != 1 || clash.Conflicts[0].SectionIDs[0] != f.SectionXIA {
		t.Fatalf("the conflict must name only the shared section %s, got %v",
			f.SectionXIA, clash.Conflicts[0].SectionIDs)
	}

	row := f.db.Timetable.GetX(f.ctx, rival)
	if row.Status != enttimetable.StatusDraft {
		t.Fatalf("a refused publication must leave the draft alone, got %s", row.Status)
	}
}

func TestPublishAllowsAnOverlapOnDisjointSections(t *testing.T) {
	f := newFixture(t)

	f.coverWith(f.TimetableID, f.SectionXIA)

	other := f.draft("Junior", date(2026, time.May, 1), nil)
	f.coverWith(other, f.SectionXIIB)

	row, err := serviceFor(f).Publish(f.ctx, timetable.PublishRequest{TimetableID: other})
	if err != nil {
		t.Fatalf("two timetables that share no section may overlap in time: %v", err)
	}
	if row.Status != enttimetable.StatusPublished {
		t.Fatalf("want published, got %s", row.Status)
	}
	if row.PublishedAt == nil {
		t.Fatal("publishing must record when it happened")
	}
}

func TestPublishClosesAndRetiresTheTimetableItSupersedes(t *testing.T) {
	f := newFixture(t)

	f.coverWith(f.TimetableID, f.SectionXIA)

	from := date(2026, time.May, 1)
	successor := f.draft("Term Two", from, nil)
	f.coverWith(successor, f.SectionXIA)

	row, err := serviceFor(f).Publish(f.ctx, timetable.PublishRequest{
		TimetableID:  successor,
		SupersedesID: &f.TimetableID,
	})
	if err != nil {
		t.Fatalf("a successor naming what it replaces must publish: %v", err)
	}
	if row.SupersedesID == nil || *row.SupersedesID != f.TimetableID {
		t.Fatalf("the successor must record what it superseded, got %v", row.SupersedesID)
	}

	retired := f.db.Timetable.GetX(f.ctx, f.TimetableID)
	if retired.Status != enttimetable.StatusSuperseded {
		t.Fatalf("the predecessor must be superseded, got %s", retired.Status)
	}
	if retired.EffectiveTo == nil {
		t.Fatal("the predecessor must be closed so the two do not both run")
	}
	if want := from.AddDate(0, 0, -1); !timetable.Day(*retired.EffectiveTo).Equal(want) {
		t.Fatalf("the predecessor must end the day before its successor starts (%s), got %s",
			want.Format("2006-01-02"), timetable.Day(*retired.EffectiveTo).Format("2006-01-02"))
	}
}

func TestPublishRefusesASuccessorThatStartsNoLaterThanItsPredecessor(t *testing.T) {
	f := newFixture(t)

	f.coverWith(f.TimetableID, f.SectionXIA)
	successor := f.draft("Same Day", date(2026, time.April, 1), nil)
	f.coverWith(successor, f.SectionXIA)

	_, err := serviceFor(f).Publish(f.ctx, timetable.PublishRequest{
		TimetableID:  successor,
		SupersedesID: &f.TimetableID,
	})
	if !errors.Is(err, timetable.ErrSupersedesNotEarlier) {
		t.Fatalf("a successor starting on its predecessor's own first day cannot close it, got %v", err)
	}
}

func TestPublishRefusesATimetableThatIsAlreadyPublished(t *testing.T) {
	f := newFixture(t)

	_, err := serviceFor(f).Publish(f.ctx, timetable.PublishRequest{TimetableID: f.TimetableID})
	if !errors.Is(err, timetable.ErrAlreadyPublished) {
		t.Fatalf("want ErrAlreadyPublished, got %v", err)
	}
}

func TestPublishRefusesATimetableCoveringNothing(t *testing.T) {
	f := newFixture(t)

	empty := f.draft("Empty", date(2026, time.May, 1), nil)

	_, err := serviceFor(f).Publish(f.ctx, timetable.PublishRequest{TimetableID: empty})
	if !errors.Is(err, timetable.ErrPublishCoversNothing) {
		t.Fatalf("want ErrPublishCoversNothing, got %v", err)
	}
}

func TestATimetableWithNoJoinRowsIsCoveredByTheSectionsItsSlotsName(t *testing.T) {
	f := newFixture(t)

	cover, err := serviceFor(f).CoveredSections(f.ctx, f.TimetableID)
	if err != nil {
		t.Fatalf("covered sections: %v", err)
	}
	held := map[uuid.UUID]bool{}
	for _, id := range cover {
		held[id] = true
	}
	for _, want := range []uuid.UUID{f.SectionXIA, f.SectionXIIA, f.SectionXIIB} {
		if !held[want] {
			t.Fatalf("a timetable with no join rows must still be read as covering %s, got %v", want, cover)
		}
	}
}

func TestDeclaredCoverReplacesRatherThanWidensTheSlotCover(t *testing.T) {
	f := newFixture(t)

	f.coverWith(f.TimetableID, f.SectionXIA)

	cover, err := serviceFor(f).CoveredSections(f.ctx, f.TimetableID)
	if err != nil {
		t.Fatalf("covered sections: %v", err)
	}
	if len(cover) != 1 || cover[0] != f.SectionXIA {
		t.Fatalf("once a cover is declared it is the whole answer, got %v", cover)
	}
}

func TestADayOutsideTheWeekIsRefused(t *testing.T) {
	for _, bad := range []int{0, 8, -1} {
		f := newFixture(t)
		day := f.dayOf(f.Sat)

		if _, err := f.db.CalendarDaySectionPattern.Create().
			SetCalendarDayID(day).
			SetSectionID(f.SectionXIIA).
			SetSubstituteDayOfWeek(3).
			Save(f.ctx); err != nil {
			t.Fatalf("a weekday inside the week must be accepted, or the refusal below proves "+
				"only that the write was broken for some other reason: %v", err)
		}

		if _, err := f.db.CalendarDaySectionPattern.Create().
			SetCalendarDayID(day).
			SetSectionID(f.SectionXIA).
			SetSubstituteDayOfWeek(bad).
			Save(f.ctx); err == nil {
			t.Fatalf("substitute_day_of_week %d was accepted; the resolver selects slots by this "+
				"value, so an impossible weekday returns an empty day that reads as a holiday", bad)
		}
	}
}

func TestADayWideSubstitutionOutsideTheWeekIsRefused(t *testing.T) {
	for _, bad := range []int{0, 8, -1} {
		f := newFixture(t)
		day := f.dayOf(f.Sat)

		if _, err := f.db.CalendarDay.UpdateOneID(day).
			SetSubstituteDayOfWeek(4).
			Save(f.ctx); err != nil {
			t.Fatalf("a weekday inside the week must be accepted: %v", err)
		}
		if _, err := f.db.CalendarDay.UpdateOneID(day).
			SetSubstituteDayOfWeek(bad).
			Save(f.ctx); err == nil {
			t.Fatalf("a day-wide substitution of %d was accepted", bad)
		}
	}
}
