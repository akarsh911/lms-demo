package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
	"github.com/Harbour-Emerge/emerge-core/internal/service"
)

type takenIdentities struct {
	existing *cas.User
}

func (takenIdentities) CreateUser(context.Context, cas.NewUser) (*cas.User, error) {
	return nil, cas.ErrEmailTaken
}

func (t takenIdentities) FindUser(context.Context, string) (*cas.User, error) {
	return t.existing, nil
}

func (takenIdentities) FindGroup(context.Context, string) (uuid.UUID, error) {
	return uuid.Nil, nil
}

func (takenIdentities) AddUserToGroup(context.Context, string, uuid.UUID) error { return nil }

func provisionEnvelope(t *testing.T, w *writeFieldsWorld, body string) map[string]any {
	t.Helper()

	rec := routed(w, unrestricted(), w.server.provisionPerson, "POST",
		"/api/v1/persons/provision", body, uuid.Nil)
	if rec.Code != http.StatusCreated && rec.Code != http.StatusOK {
		t.Fatalf("provision failed with %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	var envelope map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("the provision envelope did not parse: %v", err)
	}
	return envelope
}

func TestAProvisionThatLinksAnExistingIdentityReturnsNoPassword(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	w.server.provisioner = service.NewProvisioner(takenIdentities{
		existing: &cas.User{
			ID:       uuid.New(),
			Username: "already-here",
			Email:    "colleague@example.test",
		},
	})

	envelope := provisionEnvelope(t, w,
		`{"username":"new-name","email":"colleague@example.test","first_name":"New"}`)

	if envelope["linked_existing"] != true {
		t.Fatalf("a taken email must link rather than create, got linked_existing=%v created_in_cas=%v",
			envelope["linked_existing"], envelope["created_in_cas"])
	}
	if _, present := envelope["password"]; present {
		t.Fatal("a linked identity keeps the password it already had; " +
			"returning one invites an operator to hand over a secret that was never set")
	}
}

func TestAProvisionThatCreatesAnIdentityStillReturnsItsPassword(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	withRecordingCAS(w)

	envelope := provisionEnvelope(t, w,
		`{"username":"fresh-name","email":"fresh@example.test","first_name":"Fresh"}`)

	if envelope["created_in_cas"] != true {
		t.Fatalf("this provision was meant to create, got created_in_cas=%v", envelope["created_in_cas"])
	}
	password, present := envelope["password"]
	if !present || password == "" {
		t.Fatal("a created identity must return its generated password once, " +
			"because nothing can retrieve it afterwards")
	}
}
