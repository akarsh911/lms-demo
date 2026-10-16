package catalog

import (
	"strings"
	"testing"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

func entityNamed(t *testing.T, key string) Entity {
	t.Helper()

	for _, e := range Build().Entities {
		if e.Key == key {
			return e
		}
	}
	t.Fatalf("the catalogue no longer carries %q, so this test asserts about nothing", key)
	return Entity{}
}

func fieldKeys(fields []Field) []string {
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		out = append(out, f.Key)
	}
	return out
}

func TestColumnFieldsDropsTheRuleAuthoringVocabulary(t *testing.T) {
	students := entityNamed(t, "core.students.read")

	vocabulary := append([]string{authorization.ReachField}, authorization.RowFields()...)
	for _, key := range fieldKeys(students.ColumnFields()) {
		for _, reserved := range vocabulary {
			if key == reserved {
				t.Errorf("%q is a field a rule author picks in CAS, not a column on the students "+
					"table; it must not reach a caller asking which form fields it may fill", key)
			}
		}
	}

	if want := len(students.Fields) - len(vocabulary); len(students.ColumnFields()) != want {
		t.Fatalf("core.students.read carries %d catalogue fields and %d columns, want %d; "+
			"exactly the %d reserved fields should have been dropped (%v)",
			len(students.Fields), len(students.ColumnFields()), want, len(vocabulary),
			fieldKeys(students.Fields))
	}
	if len(students.ColumnFields()) == 0 {
		t.Fatal("every field was dropped, so this test proves nothing")
	}
}

func TestColumnFieldsKeepsEveryFieldOfAnAreaWithNoBreadthKey(t *testing.T) {
	sections := entityNamed(t, "core.sections.write")

	all := strings.Join(fieldKeys(sections.Fields), ",")
	columns := strings.Join(fieldKeys(sections.ColumnFields()), ",")
	if all != columns {
		t.Fatalf("core.sections has no breadth key, so the catalogue adds no scope fields to it; "+
			"all fields are %v but the columns are %v", all, columns)
	}
	if columns == "" {
		t.Fatal("core.sections.write carries no fields at all, so this test proves nothing")
	}
}

func TestSplitReassemblesEveryEntityKeyAndRefusesForeignOnes(t *testing.T) {
	for _, e := range Build().Entities {
		area, verb, ok := Split(e.Key)
		if !ok {
			t.Errorf("Split refused %q, which the catalogue itself produced", e.Key)
			continue
		}
		if got := strings.Join([]string{authorization.Service, area, verb}, "."); got != e.Key {
			t.Errorf("Split(%q) reassembles to %q", e.Key, got)
		}
	}

	for _, foreign := range []string{"", "students.read", "cms.students.read", "core.students"} {
		if _, _, ok := Split(foreign); ok {
			t.Errorf("Split accepted %q, which is not an entity of this service", foreign)
		}
	}
}
