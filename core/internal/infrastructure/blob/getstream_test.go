package blob

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

func TestGetStreamsTheObjectWithoutBufferingIt(t *testing.T) {
	payload := strings.Repeat("syllabus", 4096)

	var seen *http.Request
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		seen = r
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, payload)
	})

	stream, err := c.Get(context.Background(), GetRequest{Key: "library/atlas"})
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	defer stream.Body.Close()

	if stream.ContentLength != int64(len(payload)) {
		t.Fatalf("ContentLength = %d, want %d", stream.ContentLength, len(payload))
	}
	if stream.ContentType != "application/pdf" {
		t.Fatalf("ContentType = %q", stream.ContentType)
	}
	if stream.Partial || stream.ContentRange != "" {
		t.Fatalf("an unranged read must not read as partial: %+v", stream)
	}

	got, err := io.ReadAll(stream.Body)
	if err != nil {
		t.Fatalf("reading the body: %v", err)
	}
	if string(got) != payload {
		t.Fatalf("the body is %d bytes, want %d", len(got), len(payload))
	}

	if seen == nil || seen.Method != http.MethodGet {
		t.Fatalf("the store saw %v", seen)
	}
	if got := seen.Header.Get("Range"); got != "" {
		t.Fatalf("an unranged read must send no Range header, got %q", got)
	}
	if got := seen.URL.Path; got != "/harbour-assets/library/atlas" {
		t.Fatalf("path = %q", got)
	}
}

func TestGetPassesTheRangeThroughAndReportsTheContentRange(t *testing.T) {
	var seen *http.Request
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		seen = r
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Range", "bytes 10-19/1024")
		w.Header().Set("Content-Length", "10")
		w.WriteHeader(http.StatusPartialContent)
		_, _ = io.WriteString(w, "0123456789")
	})

	stream, err := c.Get(context.Background(), GetRequest{
		Key:   "library/atlas",
		Range: "bytes=10-19",
	})
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	defer stream.Body.Close()

	if got := seen.Header.Get("Range"); got != "bytes=10-19" {
		t.Fatalf("the store saw Range %q, want bytes=10-19", got)
	}
	if !stream.Partial {
		t.Fatal("a reply carrying a content range must read as partial")
	}
	if stream.ContentRange != "bytes 10-19/1024" {
		t.Fatalf("ContentRange = %q", stream.ContentRange)
	}
	if stream.ContentLength != 10 {
		t.Fatalf("ContentLength = %d, want 10", stream.ContentLength)
	}

	got, err := io.ReadAll(stream.Body)
	if err != nil || string(got) != "0123456789" {
		t.Fatalf("body = %q, %v", got, err)
	}
}

func TestGetReadsAMissingObjectAsAbsentOverTheWire(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})

	stream, err := c.Get(context.Background(), GetRequest{Key: "library/gone"})
	if !errors.Is(err, ErrNoObject) {
		t.Fatalf("Get = %+v, %v, want %v", stream, err, ErrNoObject)
	}
	if stream.Body != nil {
		t.Fatal("a refused read must hand back no body to close")
	}
}

func TestGetReadsARefusedRangeAsARangeFailure(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
	})

	stream, err := c.Get(context.Background(), GetRequest{
		Key:   "library/atlas",
		Range: "bytes=9999-",
	})
	if !errors.Is(err, ErrRangeRefused) {
		t.Fatalf("Get = %+v, %v, want %v", stream, err, ErrRangeRefused)
	}
}

func TestGetKeepsAStoreFailureAsAnError(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})

	stream, err := c.Get(context.Background(), GetRequest{Key: "library/atlas"})
	if err == nil {
		t.Fatalf("a 403 must not read as a readable object: %+v", stream)
	}
	if errors.Is(err, ErrNoObject) {
		t.Fatalf("a 403 must not read as a missing object: %v", err)
	}
	if strings.Contains(err.Error(), theSecret) {
		t.Fatalf("the failure carries the secret: %v", err)
	}
}

func TestGetRefusesAnUnaddressableKeyBeforeItReachesTheStore(t *testing.T) {
	called := false
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	if _, err := c.Get(context.Background(), GetRequest{Key: "/leading-slash"}); !errors.Is(err, ErrKeyRejected) {
		t.Fatalf("Get = %v, want %v", err, ErrKeyRejected)
	}
	if called {
		t.Fatal("an unaddressable key must never reach the store")
	}
}
