package authorization

import "testing"

func constraintsOf(t *testing.T, body string) ([]Constraint, bool) {
	t.Helper()
	return firstAlternative(t, body, StudentsRead).Constraints()
}

func pinned(expression string) string {
	return `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Pinned","expression":` + expression + `}]}]}`
}

func TestSectionPinBecomesAConstraint(t *testing.T) {
	got, ok := constraintsOf(t, pinned(`{"op":"AND","children":[
		{"field":"section","operator":"=","values":["9A"]}]}`))
	if !ok {
		t.Fatal("a section pin must be translatable")
	}
	if len(got) != 1 || got[0].Field != "section" ||
		len(got[0].Values) != 1 || got[0].Values[0] != "9A" {
		t.Fatalf("want section=9A, got %+v", got)
	}
}

func TestAPinnedAlternativeStillAdmits(t *testing.T) {
	set := mustParse(t, pinned(`{"op":"AND","children":[
		{"field":"section","operator":"=","values":["9A"]}]}`))

	d, ok := set.Allows(StudentsRead, nil)
	if !ok || !d.Allowed {
		t.Fatalf("a pinned grant must admit and narrow, got %+v", d)
	}
	if len(d.Constraints) != 1 {
		t.Fatalf("the pin must reach the caller, got %+v", d.Constraints)
	}
}

func TestSeveralSectionsCollapseToOneConstraint(t *testing.T) {
	for name, expr := range map[string]string{
		"IN": `{"op":"AND","children":[
			{"field":"section","operator":"IN","values":["9A","10B"]}]}`,
		"OR of leaves": `{"op":"AND","children":[{"op":"OR","children":[
			{"field":"section","operator":"=","values":["9A"]},
			{"field":"section","operator":"=","values":["10B"]}]}]}`,
	} {
		got, ok := constraintsOf(t, pinned(expr))
		if !ok {
			t.Fatalf("%s: must be translatable", name)
		}
		if len(got) != 1 || len(got[0].Values) != 2 {
			t.Fatalf("%s: want one constraint with two values, got %+v", name, got)
		}
	}
}

func TestNegatedAndComparisonOperatorsAreRefused(t *testing.T) {
	for _, op := range []string{"!=", "NOT_IN", "NOT_CONTAINS", "NOT_EXISTS",
		"CONTAINS", "STARTS_WITH", ">", "<=", "BETWEEN"} {
		if _, ok := constraintsOf(t, pinned(`{"op":"AND","children":[
			{"field":"section","operator":"`+op+`","values":["9A"]}]}`)); ok {
			t.Fatalf("operator %s must not translate to a predicate", op)
		}
	}
}

func TestARowFieldInAMixedOrIsRefused(t *testing.T) {
	if _, ok := constraintsOf(t, pinned(`{"op":"OR","children":[
		{"field":"section","operator":"=","values":["9A"]},
		{"field":"department","operator":"=","values":["science"]}]}`)); ok {
		t.Fatal("a row field ORed with a caller attribute must be refused")
	}
}

func TestAnUntranslatableAlternativeDeniesRatherThanWidens(t *testing.T) {
	set := mustParse(t, pinned(`{"op":"AND","children":[
		{"field":"section","operator":"NOT_IN","values":["9A"]}]}`))

	d, ok := set.Allows(StudentsRead, nil)
	if ok || d.Allowed {
		t.Fatalf("an untranslatable pin must deny, got %+v", d)
	}
	if d.Reason == "" {
		t.Fatal("the refusal must say why: a policy author has to be able to fix it")
	}
}

func TestAnEmptyGroupConstrainsNothing(t *testing.T) {
	got, ok := constraintsOf(t, pinned(`{"op":"AND","children":[]}`))
	if !ok || len(got) != 0 {
		t.Fatalf("an empty group grants outright, got %+v ok=%v", got, ok)
	}
}

func TestAPinWithNoValuesDoesNotBecomeNoConstraint(t *testing.T) {
	got, ok := constraintsOf(t, pinned(`{"op":"AND","children":[
		{"field":"section","operator":"=","values":[]}]}`))
	if !ok {
		t.Fatal("an empty value list is still a constraint, not a parse failure")
	}
	if len(got) != 1 || got[0].Satisfied() {
		t.Fatalf("an empty pin must report itself unsatisfiable, got %+v", got)
	}
}

func TestOnlyRegisteredRowFieldsAreLifted(t *testing.T) {
	set := mustParse(t, pinned(`{"op":"AND","children":[
		{"field":"department","operator":"=","values":["science"]}]}`))

	if _, ok := set.Allows(StudentsRead, nil); ok {
		t.Fatal("an unsupplied caller attribute must still refuse the alternative")
	}
	if _, ok := set.Allows(StudentsRead, Attributes{"department": "science"}); !ok {
		t.Fatal("a supplied caller attribute must still be evaluated")
	}
}

func TestSubjectPinBecomesAConstraintRatherThanBeingDropped(t *testing.T) {
	got, ok := constraintsOf(t, pinned(`{"op":"AND","children":[
		{"field":"subject","operator":"=","values":["PHY"]}]}`))
	if !ok {
		t.Fatal("a subject pin must be translatable")
	}
	if len(got) != 1 || got[0].Field != "subject" ||
		len(got[0].Values) != 1 || got[0].Values[0] != "PHY" {
		t.Fatalf("a field the vocabulary does not know is silently dropped and the grant stays "+
			"as wide as it was; want subject=PHY, got %+v", got)
	}
}

func TestSubjectAndGradeTogetherBothReachTheCaller(t *testing.T) {
	set := mustParse(t, pinned(`{"op":"AND","children":[
		{"field":"subject","operator":"=","values":["PHY"]},
		{"field":"grade_level","operator":"=","values":["G8"]}]}`))

	d, ok := set.Allows(StudentsRead, nil)
	if !ok || !d.Allowed {
		t.Fatalf("a grant pinned to a subject and a class must still admit, got %+v", d)
	}
	if len(d.Constraints) != 1 || len(d.Constraints[0]) != 2 {
		t.Fatalf("both halves of the pin must reach the caller, got %+v", d.Constraints)
	}
}

func TestAConditionOnAFieldTheVocabularyDoesNotKnowDeniesRatherThanWidening(t *testing.T) {
	set := mustParse(t, pinned(`{"op":"AND","children":[
		{"field":"board","operator":"=","values":["CBSE"]}]}`))

	d, ok := set.Allows(StudentsRead, nil)
	if ok || d.Allowed {
		t.Fatalf("an unregistered field is not a row pin: it becomes an attribute leaf, and every "+
			"guard call site in this service supplies nil attributes, so the alternative must be "+
			"unsatisfiable and admit nothing; got %+v", d)
	}
	if len(d.Constraints) != 0 {
		t.Fatalf("a denial carries no constraints, got %+v", d.Constraints)
	}
}
