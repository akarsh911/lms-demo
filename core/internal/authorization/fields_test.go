package authorization

import (
	"reflect"
	"testing"
)

func mustParse(t *testing.T, body string) *PolicySet {
	t.Helper()
	set, err := ParsePolicySet([]byte(body))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	return set
}

func TestAbsentFieldPolicyMeansUnrestricted(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Any","expression":{"op":"AND","children":[]}}]}]}`)

	for _, field := range []string{"name", "email", "date_of_birth", "anything"} {
		if !set.AllowsField(StudentsRead, field, nil) {
			t.Fatalf("absent field policy must permit %q", field)
		}
	}
}

func TestIncludeAndAllExcept(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Include","expression":{"op":"AND","children":[]},
		 "fields":{"mode":"include","keys":["name","photo"]}}]}]}`)

	if !set.AllowsField(StudentsRead, "name", nil) {
		t.Fatal("include must permit a listed field")
	}
	if set.AllowsField(StudentsRead, "email", nil) {
		t.Fatal("include must deny an unlisted field")
	}

	set = mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Except","expression":{"op":"AND","children":[]},
		 "fields":{"mode":"all_except","keys":["date_of_birth"]}}]}]}`)

	if !set.AllowsField(StudentsRead, "name", nil) {
		t.Fatal("all_except must permit an unlisted field")
	}
	if set.AllowsField(StudentsRead, "date_of_birth", nil) {
		t.Fatal("all_except must deny a listed field")
	}
}

func TestUnknownModeFailsClosed(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Odd","expression":{"op":"AND","children":[]},
		 "fields":{"mode":"only_on_tuesdays","keys":["name"]}}]}]}`)

	if set.AllowsField(StudentsRead, "name", nil) {
		t.Fatal("an unrecognised mode must not permit anything")
	}
}

func TestRowAndFieldMustComeFromTheSameAlternative(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"9A","expression":{"op":"AND","children":[
			{"field":"section","operator":"=","values":["9A"]}]},
		 "fields":{"mode":"include","keys":["phone"]}},
		{"rule":"10B","expression":{"op":"AND","children":[
			{"field":"section","operator":"=","values":["10B"]}]},
		 "fields":{"mode":"include","keys":["address"]}}
	]}]}`)

	d, ok := set.Allows(StudentsRead, nil)
	if !ok || !d.Allowed {
		t.Fatalf("a row-pinned grant still admits, got %+v", d)
	}
	if len(d.Constraints) != 2 {
		t.Fatalf("both pins must reach the caller, got %+v", d.Constraints)
	}

	if d.Fields.Permits("address") || d.Fields.Permits("phone") {
		t.Fatalf("a union of rows must not carry the union of fields, got %+v", d.Fields)
	}

	if set.AllowsField(StudentsRead, "address", nil) || set.AllowsField(StudentsRead, "phone", nil) {
		t.Fatal("a row-pinned alternative must not grant fields to a row-less question")
	}
}

func TestAllExceptIsNotADeny(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Most","expression":{"op":"AND","children":[]},
		 "fields":{"mode":"all_except","keys":["phone"]}},
		{"rule":"Phone too","expression":{"op":"AND","children":[]},
		 "fields":{"mode":"include","keys":["phone"]}}
	]}]}`)

	if !set.AllowsField(StudentsRead, "phone", nil) {
		t.Fatal("a later grant must be able to add back an excluded field")
	}
}

func TestDeniedFieldsRejectsMixedPayload(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.write","alternatives":[
		{"rule":"Phone only","expression":{"op":"AND","children":[]},
		 "fields":{"mode":"include","keys":["phone"]}}]}]}`)

	registered := []string{"phone", "email", "address"}
	denied := set.DeniedFields(StudentsWrite, registered, []string{"phone", "email"}, nil)
	if !reflect.DeepEqual(denied, []string{"email"}) {
		t.Fatalf("expected email to be denied, got %v", denied)
	}
	if len(set.DeniedFields(StudentsWrite, registered, []string{"phone"}, nil)) != 0 {
		t.Fatal("an authorized payload must not be denied")
	}
}

func TestPermittedFieldsPreservesOrder(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Some","expression":{"op":"AND","children":[]},
		 "fields":{"mode":"include","keys":["photo","name","class"]}}]}]}`)

	got := set.PermittedFields(StudentsRead,
		[]string{"name", "email", "photo", "date_of_birth", "class"}, nil)
	want := []string{"name", "photo", "class"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("projection = %v, want %v in the caller's order", got, want)
	}
}

func TestReadAndWriteAreIndependent(t *testing.T) {
	set := mustParse(t, `{"entities":[
		{"entity":"core.students.read","alternatives":[
			{"rule":"R","expression":{"op":"AND","children":[]},
			 "fields":{"mode":"include","keys":["name","email","phone"]}}]},
		{"entity":"core.students.write","alternatives":[
			{"rule":"W","expression":{"op":"AND","children":[]},
			 "fields":{"mode":"include","keys":["phone"]}}]}
	]}`)

	if !set.AllowsField(StudentsRead, "email", nil) {
		t.Fatal("email must be readable")
	}
	if set.AllowsField(StudentsWrite, "email", nil) {
		t.Fatal("write access must never be inferred from read access")
	}
}

func TestUngrantedEntityPermitsNoField(t *testing.T) {
	set := mustParse(t, `{"entities":[]}`)
	if set.AllowsField(StudentsRead, "name", nil) {
		t.Fatal("an entity absent from the policy set must permit nothing")
	}
	if set.AllowsField(StudentsRead, "", nil) {
		t.Fatal("an empty field name must not be permitted either")
	}
}

func TestFieldsRequireTheirAttributes(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.read","alternatives":[
		{"rule":"Not north","expression":{"op":"AND","children":[
			{"field":"branch_id","operator":"NOT_IN","values":["north"]}]},
		 "fields":{"mode":"include","keys":["name"]}}]}]}`)

	if set.AllowsField(StudentsRead, "name", nil) {
		t.Fatal("a conditional grant must not apply when its attribute is unknown")
	}
	if !set.AllowsField(StudentsRead, "name", Attributes{"branch_id": "south"}) {
		t.Fatal("supplying the attribute must make the grant apply")
	}
}

func TestCasingCannotSlipPastAnExclusion(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.write","alternatives":[
		{"rule":"All but phone","expression":{"op":"AND","children":[]},
		 "fields":{"mode":"all_except","keys":["phone"]}}]}]}`)

	registered := []string{"name", "phone", "email"}

	if !set.AllowsField(StudentsWrite, "Phone", nil) {
		t.Fatal("precondition: the raw primitive admits the mis-cased name")
	}

	denied := set.DeniedFields(StudentsWrite, registered, []string{"Phone"}, nil)
	if len(denied) != 1 || denied[0] != "Phone" {
		t.Fatalf("a mis-cased exclusion must be denied, got %v", denied)
	}

	if len(set.DeniedFields(StudentsWrite, registered, []string{"phone"}, nil)) != 1 {
		t.Fatal("the excluded field itself must stay denied")
	}
	if len(set.DeniedFields(StudentsWrite, registered, []string{"name"}, nil)) != 0 {
		t.Fatal("all_except must still permit an unlisted field")
	}
}

func TestUnregisteredFieldIsDeniedBeforePolicy(t *testing.T) {
	set := mustParse(t, `{"entities":[{"entity":"core.students.write","alternatives":[
		{"rule":"Everything","expression":{"op":"AND","children":[]},
		 "fields":{"mode":"all"}}]}]}`)

	denied := set.DeniedFields(StudentsWrite,
		[]string{"name", "phone"}, []string{"name", "salary", "is_admin"}, nil)
	if len(denied) != 2 {
		t.Fatalf("unregistered names must be denied even under mode all, got %v", denied)
	}
}

func TestFieldPolicyDeniedAndPermitted(t *testing.T) {
	registered := []string{"id", "name", "phone", "email"}

	include := &FieldPolicy{Mode: FieldModeInclude, Keys: []string{"name", "phone"}}
	if got := include.Denied(registered, []string{"name", "email"}); len(got) != 1 || got[0] != "email" {
		t.Fatalf("include denied = %v, want [email]", got)
	}
	if got := include.Permitted(registered); !reflect.DeepEqual(got, []string{"name", "phone"}) {
		t.Fatalf("include permitted = %v", got)
	}

	except := &FieldPolicy{Mode: FieldModeAllExcept, Keys: []string{"phone"}}
	if got := except.Denied(registered, []string{"Phone"}); len(got) != 1 {
		t.Fatalf("a mis-cased exclusion must still be denied, got %v", got)
	}
	if got := except.Permitted(registered); !reflect.DeepEqual(got, []string{"id", "name", "email"}) {
		t.Fatalf("all_except permitted = %v", got)
	}

	var absent *FieldPolicy
	if !absent.Unrestricted() {
		t.Fatal("an absent policy must be unrestricted")
	}
	if got := absent.Denied(registered, []string{"email"}); len(got) != 0 {
		t.Fatalf("an absent policy must deny nothing registered, got %v", got)
	}
	if got := absent.Denied(registered, []string{"salary"}); len(got) != 1 {
		t.Fatalf("an unregistered column must be denied even so, got %v", got)
	}
}

func TestEmptyKeyListUnderAModePermitsNothing(t *testing.T) {
	for _, mode := range []FieldMode{FieldModeInclude, FieldModeAllExcept} {
		policy := &FieldPolicy{Mode: mode, Profile: "student.basic"}
		for _, field := range []string{"name", "email", "anything"} {
			if policy.Permits(field) {
				t.Fatalf("mode %q with no keys must permit nothing, admitted %q", mode, field)
			}
		}
	}

	resolved := &FieldPolicy{
		Mode: FieldModeAllExcept, Keys: []string{"phone"}, Profile: "student.basic",
	}
	if !resolved.Permits("name") {
		t.Fatal("a resolved profile must behave like any other key list")
	}
	if resolved.Permits("phone") {
		t.Fatal("a resolved exclusion must still exclude")
	}
}

func TestProfileIsInformationalOnly(t *testing.T) {
	withProfile := &FieldPolicy{
		Mode: FieldModeInclude, Keys: []string{"name"}, Profile: "student.basic",
	}
	withoutProfile := &FieldPolicy{Mode: FieldModeInclude, Keys: []string{"name"}}

	for _, field := range []string{"name", "email"} {
		if withProfile.Permits(field) != withoutProfile.Permits(field) {
			t.Fatalf("profile changed the outcome for %q", field)
		}
	}
}
