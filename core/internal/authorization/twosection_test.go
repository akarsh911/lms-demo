package authorization

import "testing"

func twoSectionPolicies() *PolicySet {
	set := &PolicySet{Entities: []EntityPolicy{
		{
			Entity: StudentsRead,
			Alternatives: []Alternative{
				{Rule: "9A", Expression: pin("9A"),
					Fields: &FieldPolicy{Mode: FieldModeInclude, Keys: []string{"name", "email"}}},
				{Rule: "9B", Expression: pin("9B"),
					Fields: &FieldPolicy{Mode: FieldModeInclude, Keys: []string{"name", "email", "roll_number"}}},
			},
		},
		{
			Entity: StudentsWrite,
			Alternatives: []Alternative{
				{Rule: "9A email only", Expression: pin("9A"),
					Fields: &FieldPolicy{Mode: FieldModeInclude, Keys: []string{"email"}}},
			},
		},
	}}
	set.build()
	return set
}

func pin(section string) *Node {
	return &Node{Op: "AND", Children: []Node{
		{Field: "reach", Operator: "=", Values: []any{"teacher_assignment"}},
		{Field: "section", Operator: "=", Values: []any{section}},
	}}
}

func TestTwoSectionsWithDifferentRights(t *testing.T) {
	set := twoSectionPolicies()

	read, ok := set.Allows(StudentsRead, nil)
	if !ok || !read.Allowed {
		t.Fatalf("the read grant admits, got %+v", read)
	}
	if !read.PerRow() {
		t.Fatal("different fields per section is the per-row case")
	}
	if read.Reach != ReachTeacherAssignment {
		t.Fatalf("scope = %q, want teacher_assignment", read.Reach)
	}

	nineA, covered := read.FieldsForRow(RowValues{"section": "9A"})
	if !covered {
		t.Fatal("9A is covered")
	}
	for _, f := range []string{"name", "email"} {
		if !nineA.Permits(f) {
			t.Fatalf("9A reads %s", f)
		}
	}
	if nineA.Permits("roll_number") {
		t.Fatal("9A must NOT read roll_number: only the 9B grant opened it")
	}

	nineB, covered := read.FieldsForRow(RowValues{"section": "9B"})
	if !covered {
		t.Fatal("9B is covered")
	}
	for _, f := range []string{"name", "email", "roll_number"} {
		if !nineB.Permits(f) {
			t.Fatalf("9B reads %s", f)
		}
	}
	if nineB.Permits("phone") {
		t.Fatal("9B reads three fields and no more")
	}
}

func TestWriteReachesOnlyTheSectionItWasGrantedFor(t *testing.T) {
	set := twoSectionPolicies()

	write, ok := set.Allows(StudentsWrite, nil)
	if !ok || !write.Allowed {
		t.Fatalf("the write grant admits for 9A, got %+v", write)
	}

	nineA, covered := write.FieldsForRow(RowValues{"section": "9A"})
	if !covered {
		t.Fatal("9A is covered for writing")
	}
	if len(nineA.Denied([]string{"name", "email"}, []string{"email"})) != 0 {
		t.Fatal("email is writable on 9A")
	}
	if len(nineA.Denied([]string{"name", "email"}, []string{"name"})) == 0 {
		t.Fatal("name is readable on 9A, not writable")
	}

	if _, covered := write.FieldsForRow(RowValues{"section": "9B"}); covered {
		t.Fatal("9B must be covered by no write grant")
	}
	if len(write.Constraints) != 1 || write.Constraints[0][0].Values[0] != "9A" {
		t.Fatalf("the write query is pinned to 9A alone, got %+v", write.Constraints)
	}
}
