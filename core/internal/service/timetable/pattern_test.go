package timetable

import (
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
)

type patternWorld struct {
	plan *plan

	schemeID  uuid.UUID
	saturday  time.Time
	sectionA  uuid.UUID
	sectionB  uuid.UUID
	dayIDOfSA uuid.UUID
}

func newPatternWorld(t *testing.T) *patternWorld {
	t.Helper()

	scheme := uuid.New()
	bell := uuid.New()
	branch := uuid.New()
	version := &tenantent.Timetable{ID: uuid.New(), Name: "Senior", Version: 1}

	saturday := time.Date(2026, time.April, 11, 0, 0, 0, 0, time.UTC)
	if got := ISODayOfWeek(saturday); got != 6 {
		t.Fatalf("the fixture date must be a Saturday for these assertions to mean anything, got day %d", got)
	}

	w := &patternWorld{
		schemeID: scheme,
		saturday: saturday,
		sectionA: uuid.New(),
		sectionB: uuid.New(),
	}

	day := SessionDay{
		ID:           uuid.New(),
		BranchID:     branch,
		Date:         saturday,
		DayType:      "instructional",
		ForenoonOpen: true,
	}
	w.dayIDOfSA = day.ID

	periods := map[uuid.UUID]*tenantent.Period{}
	period := func(code string, sequence int) uuid.UUID {
		id := uuid.New()
		periods[id] = &tenantent.Period{ID: id, Code: code, Name: code, Sequence: sequence}
		return id
	}
	p1 := period("P1", 1)

	slot := func(section uuid.UUID, dayOfWeek int, label string) *tenantent.TimetableSlot {
		text := label
		return &tenantent.TimetableSlot{
			ID:          uuid.New(),
			TimetableID: version.ID,
			SectionID:   section,
			PeriodID:    p1,
			DayOfWeek:   dayOfWeek,
			Label:       &text,
		}
	}

	w.plan = &plan{
		branchID:  branch,
		days:      []SessionDay{day},
		dayByKey:  map[string]SessionDay{dayKey(saturday): day},
		schedules: map[string][]scheduleRef{dayKey(saturday): {{PeriodSchemeID: scheme, BellScheduleID: bell}}},
		periods:   periods,
		bell:      map[bellKey]minuteSpan{},
		inForce:   map[string]*tenantent.Timetable{schemeDateKey(scheme, saturday): version},
		slots: map[uuid.UUID][]*tenantent.TimetableSlot{
			version.ID: {
				slot(w.sectionA, 1, "A-monday"),
				slot(w.sectionA, 2, "A-tuesday"),
				slot(w.sectionA, 6, "A-saturday"),
				slot(w.sectionB, 1, "B-monday"),
				slot(w.sectionB, 2, "B-tuesday"),
				slot(w.sectionB, 6, "B-saturday"),
			},
		},
		slotByID:       map[uuid.UUID]*tenantent.TimetableSlot{},
		devBySlot:      map[string]*tenantent.TimetableDeviation{},
		additions:      map[string][]*tenantent.TimetableDeviation{},
		dayPattern:     map[string]int{},
		sectionPattern: map[string]int{},
	}
	return w
}

func (w *patternWorld) labelsFor(section uuid.UUID) []string {
	var out []string
	for _, occ := range w.plan.occurrencesOn(w.saturday, HalfAny, false) {
		if occ.SectionID != section || occ.Label == nil {
			continue
		}
		out = append(out, *occ.Label)
	}
	sort.Strings(out)
	return out
}

func same(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

func TestADateWithNoSubstitutionRunsItsOwnWeekday(t *testing.T) {
	w := newPatternWorld(t)

	if got := w.labelsFor(w.sectionA); !same(got, []string{"A-saturday"}) {
		t.Fatalf("an ordinary Saturday must run the Saturday slots, got %v", got)
	}
	if got := w.labelsFor(w.sectionB); !same(got, []string{"B-saturday"}) {
		t.Fatalf("an ordinary Saturday must run the Saturday slots, got %v", got)
	}
}

func TestASubstitutedDayRunsTheSubstituteWeekdayAndNotItsOwn(t *testing.T) {
	w := newPatternWorld(t)
	w.plan.dayPattern[dayKey(w.saturday)] = 1

	for _, section := range []struct {
		name string
		id   uuid.UUID
		want []string
	}{
		{"A", w.sectionA, []string{"A-monday"}},
		{"B", w.sectionB, []string{"B-monday"}},
	} {
		got := w.labelsFor(section.id)
		if !same(got, section.want) {
			t.Fatalf("section %s on a Saturday running the Monday pattern must return %v, got %v",
				section.name, section.want, got)
		}
		for _, label := range got {
			if label == section.name+"-saturday" {
				t.Fatalf("section %s still returned its real Saturday slot on a substituted day", section.name)
			}
		}
	}
}

func TestASubstitutedDayReportsBothWeekdays(t *testing.T) {
	w := newPatternWorld(t)
	w.plan.dayPattern[dayKey(w.saturday)] = 1

	occurrences := w.plan.occurrencesOn(w.saturday, HalfAny, false)
	if len(occurrences) == 0 {
		t.Fatal("a substituted day returned nothing, so the rest of this assertion proves nothing")
	}
	for _, occ := range occurrences {
		if occ.DayOfWeek != 1 {
			t.Fatalf("day_of_week must name the pattern actually run (1), got %d", occ.DayOfWeek)
		}
		if occ.CalendarDayOfWeek != 6 {
			t.Fatalf("calendar_day_of_week must name the real weekday (6), got %d", occ.CalendarDayOfWeek)
		}
		if !occ.DaySubstituted() {
			t.Fatal("an occurrence taken from another weekday does not read as substituted")
		}
	}
}

func TestAPerSectionPatternBeatsTheDayWideOneForThatSectionAlone(t *testing.T) {
	w := newPatternWorld(t)
	w.plan.dayPattern[dayKey(w.saturday)] = 1
	w.plan.sectionPattern[sectionDateKey(w.sectionB, w.saturday)] = 2

	if got := w.labelsFor(w.sectionB); !same(got, []string{"B-tuesday"}) {
		t.Fatalf("the overridden section must run its own substitute weekday, got %v", got)
	}
	if got := w.labelsFor(w.sectionA); !same(got, []string{"A-monday"}) {
		t.Fatalf("a section with no override of its own must keep the day-wide pattern, got %v", got)
	}
}

func TestAPerSectionPatternLeavesOtherSectionsOnTheRealWeekday(t *testing.T) {
	w := newPatternWorld(t)
	w.plan.sectionPattern[sectionDateKey(w.sectionB, w.saturday)] = 2

	if got := w.labelsFor(w.sectionB); !same(got, []string{"B-tuesday"}) {
		t.Fatalf("the overridden section must run the Tuesday pattern, got %v", got)
	}
	if got := w.labelsFor(w.sectionA); !same(got, []string{"A-saturday"}) {
		t.Fatalf("a section nobody overrode must still run the real Saturday, got %v", got)
	}
}

func TestAPatternOnAnotherDateDoesNotReachThisOne(t *testing.T) {
	w := newPatternWorld(t)
	w.plan.dayPattern[dayKey(w.saturday.AddDate(0, 0, -1))] = 1
	w.plan.sectionPattern[sectionDateKey(w.sectionB, w.saturday.AddDate(0, 0, -1))] = 2

	if got := w.labelsFor(w.sectionA); !same(got, []string{"A-saturday"}) {
		t.Fatalf("a pattern set on Friday must not move Saturday, got %v", got)
	}
	if got := w.labelsFor(w.sectionB); !same(got, []string{"B-saturday"}) {
		t.Fatalf("a Friday section override must not move Saturday, got %v", got)
	}
}

func TestPickTimetablePrefersTheLatestStartRatherThanTheHighestVersion(t *testing.T) {
	april := time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)
	june := time.Date(2026, time.June, 1, 0, 0, 0, 0, time.UTC)
	july := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)

	fromApril := &tenantent.Timetable{ID: uuid.New(), Name: "April", Version: 5, EffectiveFrom: april}
	fromJune := &tenantent.Timetable{ID: uuid.New(), Name: "June", Version: 2, EffectiveFrom: june}

	chosen := pickTimetable([]*tenantent.Timetable{fromJune, fromApril}, july)
	if chosen == nil {
		t.Fatal("a date inside both ranges must resolve to one of them")
	}
	if chosen.ID != fromJune.ID {
		t.Fatalf("the timetable the school put in force from June must win in July, got %q version %d",
			chosen.Name, chosen.Version)
	}
}

func TestPickTimetableBreaksATieOnTheSameStartByVersion(t *testing.T) {
	april := time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)

	older := &tenantent.Timetable{ID: uuid.New(), Name: "v1", Version: 1, EffectiveFrom: april}
	newer := &tenantent.Timetable{ID: uuid.New(), Name: "v2", Version: 2, EffectiveFrom: april}

	ordered := []*tenantent.Timetable{newer, older}
	chosen := pickTimetable(ordered, april.AddDate(0, 0, 10))
	if chosen == nil || chosen.ID != newer.ID {
		t.Fatalf("two timetables starting on the same day must resolve to the higher version, got %v", chosen)
	}
}
