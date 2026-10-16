package authorization

import "testing"

func sharma(entity string, ninebFields string) *PolicySet {
	return &PolicySet{Entities: []EntityPolicy{{
		Entity: Entity(entity),
		Alternatives: []Alternative{
			{Rule: "9A in full", Expression: &Node{Op: "AND", Children: []Node{
				{Field: "section", Operator: "=", Values: []any{"9A"}}}}},
			{Rule: "9B limited", Expression: &Node{Op: "AND", Children: []Node{
				{Field: "section", Operator: "=", Values: []any{"9B"}}}},
				Fields: mustFields(ninebFields)},
		},
	}}}
}

func mustFields(keys string) *FieldPolicy {
	if keys == "" {
		return nil
	}
	out := &FieldPolicy{Mode: FieldModeInclude}
	for _, k := range splitKeys(keys) {
		out.Keys = append(out.Keys, k)
	}
	return out
}

func splitKeys(s string) []string {
	var out []string
	cur := ""
	for _, r := range s {
		if r == ',' {
			out = append(out, cur)
			cur = ""
			continue
		}
		cur += string(r)
	}
	return append(out, cur)
}

func TestOneCallerSeesTwoSectionsDifferently(t *testing.T) {
	set := sharma("core.students.read", "name,roll_number,phone")
	set.build()

	d, ok := set.Allows(StudentsRead, nil)
	if !ok || !d.Allowed {
		t.Fatalf("both grants admit, got %+v", d)
	}
	if !d.PerRow() {
		t.Fatal("differing fields on differing rows is exactly the per-row case")
	}

	nineA, covered := d.FieldsForRow(RowValues{"section": "9A"})
	if !covered {
		t.Fatal("9A must be covered")
	}
	for _, f := range []string{"name", "roll_number", "phone", "address", "medical_notes"} {
		if !nineA.Permits(f) {
			t.Fatalf("9A is granted in full, but %s was withheld", f)
		}
	}

	nineB, covered := d.FieldsForRow(RowValues{"section": "9B"})
	if !covered {
		t.Fatal("9B must be covered")
	}
	for _, f := range []string{"name", "roll_number", "phone"} {
		if !nineB.Permits(f) {
			t.Fatalf("9B grants %s", f)
		}
	}
	for _, f := range []string{"address", "medical_notes"} {
		if nineB.Permits(f) {
			t.Fatalf("a 9B pupil must not expose %s, which only the 9A grant opened", f)
		}
	}

	if _, covered := d.FieldsForRow(RowValues{"section": "10C"}); covered {
		t.Fatal("a row no grant covers must not be projected at all")
	}
	if _, covered := d.FieldsForRow(nil); covered {
		t.Fatal("a row that answers nothing matches no pinned grant")
	}
}

func TestWritableFieldsFollowTheRowToo(t *testing.T) {
	set := sharma("core.students.write", "roll_number")
	set.build()

	d, _ := set.Allows(StudentsWrite, nil)

	nineB, _ := d.FieldsForRow(RowValues{"section": "9B"})
	if len(nineB.Denied([]string{"roll_number", "phone"}, []string{"roll_number"})) != 0 {
		t.Fatal("roll_number is writable on 9B")
	}
	if len(nineB.Denied([]string{"roll_number", "phone"}, []string{"phone"})) == 0 {
		t.Fatal("phone must be refused on 9B: it is readable there, not writable")
	}

	nineA, _ := d.FieldsForRow(RowValues{"section": "9A"})
	if len(nineA.Denied([]string{"roll_number", "phone"}, []string{"phone"})) != 0 {
		t.Fatal("9A is unrestricted, so phone is writable there")
	}
}

func TestTheWholeResponseFallbackStaysSafe(t *testing.T) {
	set := sharma("core.students.read", "name,roll_number,phone")
	set.build()

	d, _ := set.Allows(StudentsRead, nil)
	if d.Fields.Permits("address") {
		t.Fatal("the response-wide policy must not open a field 9B withheld")
	}
	if !d.Fields.Permits("name") {
		t.Fatal("a field both grants open stays open")
	}
}

func TestAgreeingGrantsAreNotPerRow(t *testing.T) {
	set := sharma("core.students.read", "")
	set.build()

	d, _ := set.Allows(StudentsRead, nil)
	if d.PerRow() {
		t.Fatal("two grants that agree on fields project the ordinary way")
	}
}
