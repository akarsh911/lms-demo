package response

import (
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestDecodeFieldsReportsWhatWasSent(t *testing.T) {
	var dst struct {
		Name  *string `json:"name"`
		Phone *string `json:"phone"`
		Email *string `json:"email"`
	}

	r := httptest.NewRequest("PATCH", "/", strings.NewReader(
		`{"phone":"999","email":null}`))
	keys, err := DecodeFields(r, &dst)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !reflect.DeepEqual(keys, []string{"phone", "email"}) {
		t.Fatalf("keys = %v, want [phone email] in document order", keys)
	}
	if dst.Name != nil {
		t.Fatal("an absent field must stay nil")
	}
}

func TestDecodeFieldsStillRejectsUnknownFields(t *testing.T) {
	var dst struct {
		Name *string `json:"name"`
	}
	r := httptest.NewRequest("POST", "/", strings.NewReader(`{"nope":1}`))
	if _, err := DecodeFields(r, &dst); err == nil {
		t.Fatal("an unknown field must still be rejected")
	}
}

func TestDecodeFieldsOnEmptyObject(t *testing.T) {
	var dst struct{}
	r := httptest.NewRequest("PATCH", "/", strings.NewReader(`{}`))
	keys, err := DecodeFields(r, &dst)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("an empty object sends no fields, got %v", keys)
	}
}
