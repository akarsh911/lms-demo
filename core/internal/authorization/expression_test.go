package authorization

import "testing"

func node(field, op string, values ...any) *Node {
	return &Node{Field: field, Operator: op, Values: values}
}

func TestEmptyGroupGrantsOutright(t *testing.T) {
	for _, n := range []*Node{
		nil,
		{Op: "AND"},
		{Op: "OR"},
	} {
		if !n.Eval(Attributes{}) {
			t.Fatalf("empty group must evaluate true, got false for %+v", n)
		}
	}
}

func TestAbsentAttribute(t *testing.T) {
	attrs := Attributes{}

	for _, n := range []*Node{
		node("branch_id", "=", "b1"),
		node("branch_id", "IN", "b1", "b2"),
		node("branch_id", "CONTAINS", "b"),
		node("branch_id", "EXISTS"),
	} {
		if n.Eval(attrs) {
			t.Fatalf("absent attribute must not satisfy %s", n.Operator)
		}
	}

	for _, n := range []*Node{
		node("branch_id", "!=", "b1"),
		node("branch_id", "NOT_IN", "b1"),
		node("branch_id", "NOT_CONTAINS", "b"),
		node("branch_id", "NOT_EXISTS"),
	} {
		if !n.Eval(attrs) {
			t.Fatalf("absent attribute must satisfy %s", n.Operator)
		}
	}
}

func TestMultiValuedNegationNeedsEveryValue(t *testing.T) {
	attrs := Attributes{"section_id": []any{"s1", "s2"}}

	if !node("section_id", "IN", "s2", "s9").Eval(attrs) {
		t.Fatal("IN must hold when any value matches")
	}

	if node("section_id", "NOT_IN", "s1").Eval(attrs) {
		t.Fatal("NOT_IN must fail when one value matches the exclusion")
	}
	if !node("section_id", "NOT_IN", "s9").Eval(attrs) {
		t.Fatal("NOT_IN must hold when no value matches the exclusion")
	}
}

func TestComparisonAndBetween(t *testing.T) {
	attrs := Attributes{"marks": 72}

	if !node("marks", ">=", 70).Eval(attrs) {
		t.Fatal("72 >= 70")
	}
	if node("marks", "<", 70).Eval(attrs) {
		t.Fatal("72 < 70 must be false")
	}
	if !node("marks", "BETWEEN", 70, 80).Eval(attrs) {
		t.Fatal("72 between 70 and 80")
	}
	if node("marks", "BETWEEN", 80, 90).Eval(attrs) {
		t.Fatal("72 is not between 80 and 90")
	}
}

func TestUnknownOperatorDenies(t *testing.T) {
	if node("branch_id", "REGEX", ".*").Eval(Attributes{"branch_id": "b1"}) {
		t.Fatal("unknown operator must deny")
	}
}

func TestPolicySetAbsenceIsDenial(t *testing.T) {
	body := []byte(`{
		"entities": [
			{"entity":"core.students.read","service":"core","alternatives":[
				{"rule":"North branch","rule_key":"core.north",
				 "expression":{"op":"AND","children":[
					{"field":"branch_id","operator":"IN","values":["b1"]}]}}]}
		],
		"policy_epoch": 12
	}`)

	set, err := ParsePolicySet(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if !set.Holds(StudentsRead) {
		t.Fatal("granted entity must be held")
	}
	if set.Holds(StudentsWrite) {
		t.Fatal("ungranted entity must not be held")
	}

	if d, ok := set.Allows(StudentsRead, Attributes{"branch_id": "b1"}); !ok || !d.Allowed {
		t.Fatal("matching attributes must be allowed")
	}
	if _, ok := set.Allows(StudentsRead, Attributes{"branch_id": "b9"}); ok {
		t.Fatal("non-matching attributes must be denied")
	}
	if _, ok := set.Allows(StudentsWrite, nil); ok {
		t.Fatal("an entity absent from the set must be denied")
	}
	if set.PolicyEpoch != 12 {
		t.Fatalf("policy epoch = %d, want 12", set.PolicyEpoch)
	}
}

func TestAlternativesAreOred(t *testing.T) {
	body := []byte(`{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"A","expression":{"op":"AND","children":[
			{"field":"branch_id","operator":"=","values":["b1"]}]}},
		{"rule":"B","expression":{"op":"AND","children":[
			{"field":"branch_id","operator":"=","values":["b2"]}]}}
	]}]}`)

	set, err := ParsePolicySet(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	d, ok := set.Allows(StudentsRead, Attributes{"branch_id": "b2"})
	if !ok || d.Rule != "B" {
		t.Fatalf("second alternative must admit, got %+v ok=%v", d, ok)
	}
}

func TestMissingAttributeMustNotGrant(t *testing.T) {
	body := []byte(`{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Not the north branch","expression":{"op":"AND","children":[
			{"field":"branch_id","operator":"NOT_IN","values":["north"]}]}}
	]}]}`)

	set, err := ParsePolicySet(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if d, ok := set.Allows(StudentsRead, nil); ok || d.Allowed {
		t.Fatalf("nil attributes must not satisfy a conditional grant, got %+v", d)
	}
	if d, ok := set.Allows(StudentsRead, Attributes{}); ok || d.Allowed {
		t.Fatalf("empty attributes must not satisfy a conditional grant, got %+v", d)
	}
	if d, ok := set.Allows(StudentsRead, Attributes{"branch_id": "south"}); !ok || !d.Allowed {
		t.Fatalf("supplied attributes must be evaluated, got %+v ok=%v", d, ok)
	}
	if _, ok := set.Allows(StudentsRead, Attributes{"branch_id": "north"}); ok {
		t.Fatal("the exclusion must still apply when the attribute is present")
	}
}

func TestUnconditionalGrantStillPassesWithoutAttributes(t *testing.T) {
	body := []byte(`{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Everything","expression":{"op":"AND","children":[]}}]}]}`)

	set, err := ParsePolicySet(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if d, ok := set.Allows(StudentsRead, nil); !ok || !d.Allowed {
		t.Fatalf("an unconditional grant must pass the coarse gate, got %+v", d)
	}
}

func TestNodeFields(t *testing.T) {
	n := &Node{Op: "AND", Children: []Node{
		{Field: "branch_id", Operator: "IN", Values: []any{"b1"}},
		{Op: "OR", Children: []Node{
			{Field: "year", Operator: ">=", Values: []any{2024}},
		}},
	}}
	got := n.Fields()
	if len(got) != 2 {
		t.Fatalf("expected 2 fields, got %v", got)
	}
}
