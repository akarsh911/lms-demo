package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
)

var deniedLinkGrants = []string{
	entlink.FieldIsPrimary,
	entlink.FieldIsEmergencyContact,
	entlink.FieldCanPickup,
	entlink.FieldCanViewAcademic,
	entlink.FieldCanViewFinance,
}

func linkKeys(t *testing.T, raw []byte) map[string]json.RawMessage {
	t.Helper()

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatalf("the guardian link did not marshal to an object: %v (%q)", err, raw)
	}
	return fields
}

func assertDeniedGrantsVisible(t *testing.T, where string, fields map[string]json.RawMessage) {
	t.Helper()

	for _, key := range deniedLinkGrants {
		value, present := fields[key]
		if !present {
			t.Fatalf("%s: %q is missing, so a client cannot tell a withheld grant from a "+
				"field this response never carried", where, key)
		}
		if string(value) != "false" {
			t.Fatalf("%s: %q came back as %s, want false", where, key, value)
		}
	}
}

func TestAGuardianLinkCarriesItsWithheldGrantsInsteadOfOmittingThem(t *testing.T) {
	row := &tenantent.StudentGuardian{
		ID:                 uuid.New(),
		StudentID:          uuid.New(),
		GuardianID:         uuid.New(),
		RelationshipType:   "mother",
		IsPrimary:          false,
		IsEmergencyContact: false,
		CanPickup:          false,
		CanViewAcademic:    false,
		CanViewFinance:     false,
	}

	raw, err := json.Marshal(row)
	if err != nil {
		t.Fatalf("the guardian link did not marshal: %v", err)
	}
	assertDeniedGrantsVisible(t, "marshalled row", linkKeys(t, raw))
}

func TestProjectingAGuardianLinkKeepsTheWithheldAcademicGate(t *testing.T) {
	row := &tenantent.StudentGuardian{
		ID:               uuid.New(),
		StudentID:        uuid.New(),
		GuardianID:       uuid.New(),
		RelationshipType: "father",
	}

	projected, err := project(row, linkFields)
	if err != nil {
		t.Fatalf("the guardian link did not project: %v", err)
	}
	fields, ok := projected.(map[string]json.RawMessage)
	if !ok {
		t.Fatalf("the field policy was expected to project to a map, got %T", projected)
	}
	assertDeniedGrantsVisible(t, "projected row", fields)
}

func TestProjectingAGuardianLinkUnderANarrowerPolicyStillCarriesTheAcademicGate(t *testing.T) {
	row := &tenantent.StudentGuardian{ID: uuid.New(), RelationshipType: "guardian"}

	policy := &authorization.FieldPolicy{
		Mode: authorization.FieldModeInclude,
		Keys: []string{entlink.FieldCanViewAcademic},
	}
	projected, err := project(row, policy)
	if err != nil {
		t.Fatalf("the guardian link did not project: %v", err)
	}
	fields, ok := projected.(map[string]json.RawMessage)
	if !ok {
		t.Fatalf("the field policy was expected to project to a map, got %T", projected)
	}
	value, present := fields[entlink.FieldCanViewAcademic]
	if !present || string(value) != "false" {
		t.Fatalf("a policy that grants only the academic gate must still state it: %v", fields)
	}
	if _, leaked := fields[entlink.FieldCanViewFinance]; leaked {
		t.Fatalf("dropping omitempty widened the projection beyond the policy: %v", fields)
	}
}

func TestTheEditThatRevokesAcademicAccessEchoesTheGateAsFalse(t *testing.T) {
	w := newLinkPatchWorld(t)

	rec := w.patch(w.adminCtx, nil, w.taughtStudent, `{"can_view_academic":false}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 from the edit, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	fields := linkKeys(t, rec.Body.Bytes())
	value, present := fields[entlink.FieldCanViewAcademic]
	if !present {
		t.Fatalf("the edit that revoked academic access answered without %q, so the caller "+
			"cannot confirm the revocation: %s", entlink.FieldCanViewAcademic,
			strings.TrimSpace(rec.Body.String()))
	}
	if string(value) != "false" {
		t.Fatalf("the edit set the gate to false and echoed %s", value)
	}
	if w.storedGate(w.taughtStudent) {
		t.Fatal("the response said false but the row still reads true")
	}
}
