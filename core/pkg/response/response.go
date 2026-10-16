package response

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"strings"
)

type Envelope map[string]any

type ErrorBody struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("response: encode failed", "error", err)
	}
}

func NoContent(w http.ResponseWriter) { w.WriteHeader(http.StatusNoContent) }

func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, ErrorBody{Error: http.StatusText(status), Message: message})
}

func Decode(r *http.Request, dst any) error {
	_, err := DecodeFields(r, dst)
	return err
}

func DecodeFields(r *http.Request, dst any) ([]string, error) {
	raw, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return nil, blame(raw, dst, err)
	}

	var present []string
	seen := map[string]bool{}
	keys := json.NewDecoder(bytes.NewReader(raw))
	tok, err := keys.Token()
	if err != nil || tok != json.Delim('{') {
		return nil, nil
	}
	for keys.More() {
		name, err := keys.Token()
		if err != nil {
			break
		}
		key, ok := name.(string)
		if !ok {
			break
		}
		if !seen[key] {
			seen[key] = true
			present = append(present, key)
		}
		var skip json.RawMessage
		if err := keys.Decode(&skip); err != nil {
			break
		}
	}
	return present, nil
}

func ServerError(w http.ResponseWriter, err error) {
	slog.Error("unhandled server error", "error", err)
	Error(w, http.StatusInternalServerError, "something went wrong")
}

func blame(raw []byte, dst any, err error) error {
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return err
	}
	v := reflect.ValueOf(dst)
	if v.Kind() != reflect.Pointer || v.IsNil() || v.Elem().Kind() != reflect.Struct {
		return err
	}

	t := v.Elem().Type()
	for i := 0; i < t.NumField(); i++ {
		name := jsonName(t.Field(i))
		value, sent := fields[name]
		if name == "" || !sent {
			continue
		}
		probe := reflect.New(t.Field(i).Type)
		if bad := json.Unmarshal(value, probe.Interface()); bad != nil {
			return fmt.Errorf("%s: %w", name, bad)
		}
	}
	return err
}

func jsonName(f reflect.StructField) string {
	tag := f.Tag.Get("json")
	if tag == "" || tag == "-" {
		return ""
	}
	if comma := strings.Index(tag, ","); comma >= 0 {
		tag = tag[:comma]
	}
	return tag
}
