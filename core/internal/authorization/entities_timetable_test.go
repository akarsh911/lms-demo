package authorization_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/authorization/catalog"
)

var timetableSurface = map[string][]string{
	"timetable":  {"read", "read_all", "write", "write_all", "delete", "delete_all", "override", "generate"},
	"attendance": {"read", "read_all", "write", "write_all", "delete", "delete_all"},
	"rooms":      {"read", "write", "delete"},
	"calendar":   {"read", "write", "delete"},
}

func verbsOfArea(area string) []string {
	var out []string
	for _, e := range authorization.AllEntities {
		if a, verb, ok := catalog.Split(string(e)); ok && a == area {
			out = append(out, verb)
		}
	}
	sort.Strings(out)
	return out
}

func TestTimetableSurfaceCarriesExactlyTheVerbsItWasGiven(t *testing.T) {
	for area, want := range timetableSurface {
		got := verbsOfArea(area)
		sort.Strings(want)
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("area %q registers verbs %v, want %v; a verb added here must be registered in CAS before anyone can hold it", area, got, want)
		}
	}
}

func TestRoomsAndCalendarHaveNoBreadthKey(t *testing.T) {
	for _, area := range []string{"rooms", "calendar"} {
		for _, verb := range verbsOfArea(area) {
			if strings.HasSuffix(verb, "_all") {
				t.Errorf("core.%s.%s exists, but a room and a calendar day belong to a branch and not to a person, so there is no narrow reading for the wide one to widen", area, verb)
			}
		}
	}
}

func catalogEntity(t *testing.T, key string) catalog.Entity {
	t.Helper()
	for _, e := range catalog.Build().Entities {
		if e.Key == key {
			return e
		}
	}
	t.Fatalf("the catalogue does not carry %q, so this test asserts about nothing", key)
	return catalog.Entity{}
}

func hasColumn(e catalog.Entity, key string) bool {
	for _, f := range e.ColumnFields() {
		if f.Key == key {
			return true
		}
	}
	return false
}

func TestAttendanceMarkIsAConstrainableField(t *testing.T) {
	for _, key := range []string{"core.attendance.read", "core.attendance.write"} {
		e := catalogEntity(t, key)
		if !hasColumn(e, "status") {
			t.Errorf("%s offers no %q field, so a CAS rule cannot say which marks a caller may set or see", key, "status")
		}
		for _, column := range []string{"student_id", "subject_offering_id", "period_id", "attendance_date", "teacher_id"} {
			if !hasColumn(e, column) {
				t.Errorf("%s offers no %q field", key, column)
			}
		}
	}
}

func TestTimetableOffersNoStatusColumn(t *testing.T) {
	for _, key := range []string{"core.timetable.read", "core.timetable.write"} {
		if hasColumn(catalogEntity(t, key), "status") {
			t.Errorf("%s offers a %q field, but status means active/inactive on period schemes, periods and bell schedules "+
				"and draft/published/superseded/archived on timetables; one rule naming it would silently govern four different value domains", key, "status")
		}
	}
}

func TestTimetableAndAttendanceAreNarrowable(t *testing.T) {
	for _, key := range []string{"core.timetable.read", "core.attendance.read"} {
		e := catalogEntity(t, key)
		var keys []string
		for _, f := range e.Fields {
			keys = append(keys, f.Key)
		}
		joined := strings.Join(keys, ",")
		if !strings.Contains(joined, authorization.ReachField) {
			t.Errorf("%s carries no %q field, so a rule author cannot pick a reach for it", key, authorization.ReachField)
		}
		if len(e.ColumnFields()) == 0 {
			t.Errorf("%s carries no columns at all", key)
		}
	}
}
