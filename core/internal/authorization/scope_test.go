package authorization

import "testing"

func firstAlternative(t *testing.T, body string, entity Entity) Alternative {
	t.Helper()
	set := mustParse(t, body)
	alts := set.index[entity]
	if len(alts) == 0 {
		t.Fatalf("no alternatives for %s", entity)
	}
	return alts[0]
}

func TestScopeIsReadFromTheExpression(t *testing.T) {
	alt := firstAlternative(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Teacher","expression":{"op":"AND","children":[
			{"field":"reach","operator":"=","values":["teacher_assignment"]}]}}]}]}`,
		StudentsRead)

	scope, ok := alt.Reach()
	if !ok || scope != ReachTeacherAssignment || !scope.Valid() {
		t.Fatalf("scope = %q ok=%v, want teacher_assignment", scope, ok)
	}
}

func TestDeclaringAScopeDoesNotRevokeTheGrant(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Teacher","expression":{"op":"AND","children":[
			{"field":"reach","operator":"=","values":["teacher_assignment"]}]}}]}]}`)

	if d, ok := set.Allows(StudentsRead, nil); !ok || !d.Allowed {
		t.Fatalf("a scoped grant must still be allowed, got %+v ok=%v", d, ok)
	}
	if !set.AllowsField(StudentsRead, "name", nil) {
		t.Fatal("a scoped grant with no field policy must still permit fields")
	}
}

func TestScopeCoexistsWithRealConditions(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Teacher in science","expression":{"op":"AND","children":[
			{"field":"reach","operator":"=","values":["teacher_assignment"]},
			{"field":"department","operator":"=","values":["science"]}]}}]}]}`)

	if _, ok := set.Allows(StudentsRead, Attributes{"department": "science"}); !ok {
		t.Fatal("science must be allowed")
	}
	if _, ok := set.Allows(StudentsRead, Attributes{"department": "arts"}); ok {
		t.Fatal("arts must be refused: the real condition still applies")
	}
	if _, ok := set.Allows(StudentsRead, nil); ok {
		t.Fatal("a missing department must not be satisfied by the scope leaf")
	}
}

func TestUnknownScopeReachesTheCallerAsDeclared(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Odd","expression":{"op":"AND","children":[
			{"field":"reach","operator":"=","values":["whole_district"]}]}}]}]}`)

	d, ok := set.Allows(StudentsRead, nil)
	if !ok || !d.Allowed {
		t.Fatalf("the grant itself still stands, got %+v ok=%v", d, ok)
	}
	if !d.HasReach {
		t.Fatal("an unresolvable scope must reach the caller as declared, not as absent")
	}
	if d.Reach != Reach("whole_district") {
		t.Fatalf("scope = %q, want it carried through verbatim", d.Reach)
	}
	if d.Reach.Valid() {
		t.Fatal("a scope emerge-core cannot resolve must not be valid")
	}
}

func TestScopeOnlyTravelsByEquality(t *testing.T) {
	for _, op := range []string{"IN", "NOT_IN", "!=", "CONTAINS"} {
		alt := firstAlternative(t, `{"entities":[{"entity":"core.students.read","alternatives":[
			{"rule":"X","expression":{"op":"AND","children":[
				{"field":"reach","operator":"`+op+`","values":["self"]}]}}]}]}`,
			StudentsRead)

		if _, ok := alt.Reach(); ok {
			t.Fatalf("operator %s must not carry a scope", op)
		}
	}
}

func TestAbsentScopeIsNotTenantWide(t *testing.T) {
	alt := firstAlternative(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Plain","expression":{"op":"AND","children":[]}}]}]}`,
		StudentsRead)

	if scope, ok := alt.Reach(); ok {
		t.Fatalf("absence must not yield a scope, got %q", scope)
	}
}

func TestDecisionCarriesScopeAndFields(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Guardian","expression":{"op":"AND","children":[
			{"field":"reach","operator":"=","values":["guardian_ward"]},
			{"field":"branch","operator":"=","values":["north"]}]},
		 "fields":{"mode":"include","keys":["name"]}},
		{"rule":"Teacher","expression":{"op":"AND","children":[
			{"field":"reach","operator":"=","values":["teacher_assignment"]},
			{"field":"branch","operator":"=","values":["south"]}]},
		 "fields":{"mode":"include","keys":["name","marks"]}}
	]}]}`)

	d, ok := set.Allows(StudentsRead, Attributes{"branch": "south"})
	if !ok || !d.Allowed {
		t.Fatalf("south must be allowed, got %+v", d)
	}
	if !d.HasReach || d.Reach != ReachTeacherAssignment {
		t.Fatalf("scope = %q has=%v, want teacher_assignment", d.Reach, d.HasReach)
	}
	if d.Fields == nil || !d.Fields.Permits("marks") {
		t.Fatal("the admitting alternative's field policy must travel with it")
	}
	if d.Fields.Permits("phone") {
		t.Fatal("field policy must not leak from the other alternative")
	}
}

func TestDecisionWithoutScopeSaysSo(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Plain","expression":{"op":"AND","children":[]}}]}]}`)

	d, _ := set.Allows(StudentsRead, nil)
	if d.HasReach {
		t.Fatalf("no scope was declared, got %q", d.Reach)
	}
}

func TestUnresolvableScopeReachesTheDenyArm(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Odd","expression":{"op":"AND","children":[
			{"field":"reach","operator":"=","values":["whole_district"]}]}}]}]}`)

	d, ok := set.Allows(StudentsRead, nil)
	if !ok || !d.Allowed {
		t.Fatalf("the grant itself is still allowed, got %+v", d)
	}
	if !d.HasReach {
		t.Fatal("a declared scope must be carried even when unresolvable, or it falls back to the permissive path")
	}
	if d.Reach.Valid() {
		t.Fatalf("scope %q should not be resolvable", d.Reach)
	}
}

func TestNoScopeStillMeansNoScope(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Plain","expression":{"op":"AND","children":[]}}]}]}`)

	d, _ := set.Allows(StudentsRead, nil)
	if d.HasReach {
		t.Fatalf("nothing was declared, got %q", d.Reach)
	}
}
