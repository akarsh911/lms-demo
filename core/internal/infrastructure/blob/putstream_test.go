package blob

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

type storedObject struct {
	body        []byte
	contentType string
	digest      string
}

type recordingBucket struct {
	mu      sync.Mutex
	objects map[string]storedObject
	puts    []*http.Request
}

func newRecordingBucket() *recordingBucket {
	return &recordingBucket{objects: map[string]storedObject{}}
}

func (b *recordingBucket) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := strings.TrimPrefix(r.URL.Path, "/harbour-assets/")
		switch r.Method {
		case http.MethodPut:
			b.serveWrite(w, r, key)
		case http.MethodHead, http.MethodGet:
			b.serveRead(w, r, key)
		case http.MethodDelete:
			b.mu.Lock()
			delete(b.objects, key)
			b.mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}
}

func (b *recordingBucket) serveWrite(w http.ResponseWriter, r *http.Request, key string) {
	body, err := io.ReadAll(r.Body)

	b.mu.Lock()
	b.puts = append(b.puts, r.Clone(context.Background()))
	b.mu.Unlock()

	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	sum := sha256.Sum256(body)
	digest := base64.StdEncoding.EncodeToString(sum[:])
	if declared := r.Header.Get(HeaderChecksum); declared != "" && declared != digest {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if signed := r.Header.Get("X-Amz-Content-Sha256"); signed != "" &&
		!strings.EqualFold(signed, hex.EncodeToString(sum[:])) {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	b.mu.Lock()
	b.objects[key] = storedObject{
		body:        body,
		contentType: r.Header.Get(HeaderContentType),
		digest:      digest,
	}
	b.mu.Unlock()

	w.Header().Set(HeaderChecksum, digest)
	w.WriteHeader(http.StatusOK)
}

func (b *recordingBucket) serveRead(w http.ResponseWriter, r *http.Request, key string) {
	b.mu.Lock()
	object, ok := b.objects[key]
	b.mu.Unlock()

	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Length", fmt.Sprint(len(object.body)))
	w.Header().Set(HeaderContentType, object.contentType)
	w.Header().Set(HeaderChecksum, object.digest)
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodGet {
		_, _ = w.Write(object.body)
	}
}

func (b *recordingBucket) lastPut(t *testing.T) *http.Request {
	t.Helper()
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.puts) == 0 {
		t.Fatal("the store was never written to")
	}
	return b.puts[len(b.puts)-1]
}

func bucketClient(t *testing.T) (*Client, *recordingBucket) {
	t.Helper()
	bucket := newRecordingBucket()
	return fakeStore(t, bucket.handler()), bucket
}

func TestPutStoresTheBytesAndTheObjectReadsBackOverTheWire(t *testing.T) {
	c, _ := bucketClient(t)
	ctx := context.Background()

	payload := []byte("a teacher uploads a textbook chapter")
	sum := sha256.Sum256(payload)
	key := "library/" + emptyDigestHex[:8]

	if err := c.Put(ctx, PutStream{
		Key:           key,
		ContentType:   "application/pdf",
		ContentLength: int64(len(payload)),
		SHA256Hex:     hex.EncodeToString(sum[:]),
		Body:          unseekable(payload),
	}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	info, err := c.Head(ctx, key)
	if err != nil {
		t.Fatalf("Head: %v", err)
	}
	if !info.Exists {
		t.Fatal("the object is not there after a successful put")
	}
	if info.ContentLength != int64(len(payload)) {
		t.Fatalf("ContentLength = %d, want %d", info.ContentLength, len(payload))
	}
	if info.ContentType != "application/pdf" {
		t.Fatalf("ContentType = %q, want application/pdf", info.ContentType)
	}
	if info.SHA256Hex != hex.EncodeToString(sum[:]) {
		t.Fatalf("SHA256Hex = %q, want %q", info.SHA256Hex, hex.EncodeToString(sum[:]))
	}

	link, err := c.PresignGet(ctx, key, time.Minute)
	if err != nil {
		t.Fatalf("PresignGet: %v", err)
	}
	resp, err := http.Get(link)
	if err != nil {
		t.Fatalf("fetching the object back: %v", err)
	}
	defer resp.Body.Close()
	back, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading the object back: %v", err)
	}
	if !bytes.Equal(back, payload) {
		t.Fatalf("the object reads back as %q, want %q", back, payload)
	}
}

func TestPutDeclaresItsLengthRatherThanFallingBackToChunking(t *testing.T) {
	c, bucket := bucketClient(t)

	payload := bytes.Repeat([]byte("x"), 4096)
	sum := sha256.Sum256(payload)

	if err := c.Put(context.Background(), PutStream{
		Key:           "library/lengths",
		ContentType:   "application/pdf",
		ContentLength: int64(len(payload)),
		SHA256Hex:     hex.EncodeToString(sum[:]),
		Body:          unseekable(payload),
	}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	seen := bucket.lastPut(t)
	if len(seen.TransferEncoding) != 0 {
		t.Fatalf("the upload fell back to %v, which sigv4 stores reject; "+
			"the reader must declare its length", seen.TransferEncoding)
	}
	if seen.ContentLength != int64(len(payload)) {
		t.Fatalf("ContentLength = %d, want %d", seen.ContentLength, len(payload))
	}
	if got := seen.Header.Get(HeaderChecksum); got != base64.StdEncoding.EncodeToString(sum[:]) {
		t.Fatalf("%s = %q, want the base64 digest; markAssetReady reads it back off the object",
			HeaderChecksum, got)
	}
	if got := seen.Header.Get("X-Amz-Content-Sha256"); !strings.EqualFold(got, hex.EncodeToString(sum[:])) {
		t.Fatalf("X-Amz-Content-Sha256 = %q, want the real digest so the signature itself "+
			"binds the bytes", got)
	}
}

func TestPutStreamsWithoutSeekingOrBufferingTheWholeBody(t *testing.T) {
	c, bucket := bucketClient(t)

	const size = 1 << 20
	digest := sha256.New()
	_, _ = io.Copy(digest, io.LimitReader(repeating('q'), size))

	counter := &readCounter{Reader: io.LimitReader(repeating('q'), size)}
	if err := c.Put(context.Background(), PutStream{
		Key:           "library/streamed",
		ContentType:   "application/pdf",
		ContentLength: size,
		SHA256Hex:     hex.EncodeToString(digest.Sum(nil)),
		Body:          counter,
	}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	if counter.calls < 2 {
		t.Fatalf("the body was drained in %d read(s); a streaming upload reads it in chunks",
			counter.calls)
	}
	bucket.mu.Lock()
	stored := len(bucket.objects["library/streamed"].body)
	bucket.mu.Unlock()
	if stored != size {
		t.Fatalf("the store received %d bytes, want %d", stored, size)
	}
}

func TestPutSurfacesTheBodysOwnFailureRatherThanStoringAPartialObject(t *testing.T) {
	c, bucket := bucketClient(t)

	payload := bytes.Repeat([]byte("y"), 64<<10)
	sum := sha256.Sum256(payload)
	broken := &failingReader{
		Reader: bytes.NewReader(payload),
		after:  1024,
		err:    errors.New("the client hung up"),
	}

	err := c.Put(context.Background(), PutStream{
		Key:           "library/torn",
		ContentType:   "application/pdf",
		ContentLength: int64(len(payload)),
		SHA256Hex:     hex.EncodeToString(sum[:]),
		Body:          broken,
	})
	if err == nil {
		t.Fatal("a body that fails mid-stream must not be reported as a stored object")
	}

	bucket.mu.Lock()
	_, stored := bucket.objects["library/torn"]
	bucket.mu.Unlock()
	if stored {
		t.Fatal("a torn upload left an object behind")
	}
}

func TestPutRefusesAnIncompleteDeclaration(t *testing.T) {
	c, _ := bucketClient(t)
	ctx := context.Background()

	good := func() PutStream {
		return PutStream{
			Key:           "library/declaration",
			ContentType:   "application/pdf",
			ContentLength: 3,
			SHA256Hex:     emptyDigestHex,
			Body:          strings.NewReader("abc"),
		}
	}

	cases := []struct {
		name string
		with func(*PutStream)
		want error
	}{
		{"no key", func(r *PutStream) { r.Key = "" }, ErrNoKey},
		{"an unaddressable key", func(r *PutStream) { r.Key = "/leading" }, ErrKeyRejected},
		{"no content type", func(r *PutStream) { r.ContentType = "" }, ErrNoContentType},
		{"a negative length", func(r *PutStream) { r.ContentLength = -1 }, ErrNoLength},
		{"no body", func(r *PutStream) { r.Body = nil }, ErrNoBody},
		{"a mangled digest", func(r *PutStream) { r.SHA256Hex = "nope" }, ErrChecksum},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := good()
			tc.with(&r)
			if err := c.Put(ctx, r); !errors.Is(err, tc.want) {
				t.Fatalf("Put = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestPutOnANilClientFailsClosed(t *testing.T) {
	var c *Client
	if err := c.Put(context.Background(), PutStream{}); !errors.Is(err, ErrNoBucket) {
		t.Fatalf("Put = %v, want %v", err, ErrNoBucket)
	}
}

type opaqueReader struct {
	io.Reader
}

func unseekable(b []byte) io.Reader { return opaqueReader{Reader: bytes.NewReader(b)} }

type readCounter struct {
	io.Reader
	calls int
}

func (r *readCounter) Read(p []byte) (int, error) {
	r.calls++
	return r.Reader.Read(p)
}

type repeatingReader byte

func repeating(b byte) io.Reader { return repeatingReader(b) }

func (r repeatingReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = byte(r)
	}
	return len(p), nil
}

type failingReader struct {
	io.Reader
	after int64
	read  int64
	err   error
}

func (r *failingReader) Read(p []byte) (int, error) {
	if r.read >= r.after {
		return 0, r.err
	}
	if int64(len(p)) > r.after-r.read {
		p = p[:r.after-r.read]
	}
	n, err := r.Reader.Read(p)
	r.read += int64(n)
	return n, err
}
