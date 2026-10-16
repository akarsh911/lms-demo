package blob

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	smithyhttp "github.com/aws/smithy-go/transport/http"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
)

const theSecret = "wJalrXUtnFEMI-K7MDENG-bPxRfiCYEXAMPLEKEY"

const emptyDigestHex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

const emptyDigestB64 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="

func testCredentials() tenancy.S3Credentials {
	return tenancy.S3Credentials{
		Region:          "ap-south-1",
		Bucket:          "harbour-assets",
		AccessKeyID:     "AKIAEXAMPLE",
		SecretAccessKey: theSecret,
	}
}

func newTestClient(t *testing.T, creds tenancy.S3Credentials) *Client {
	t.Helper()
	c, err := New(creds)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func samplePut() PutRequest {
	return PutRequest{
		Key:           "schools/hp/assets/2026/syllabus.pdf",
		ContentType:   "application/pdf",
		ContentLength: 91234,
		SHA256Hex:     emptyDigestHex,
		Expires:       10 * time.Minute,
	}
}

func signedHeadersOf(t *testing.T, raw string) map[string]bool {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("the presigned url does not parse: %v", err)
	}
	out := map[string]bool{}
	list := u.Query().Get("X-Amz-SignedHeaders")
	if list == "" {
		return out
	}
	for _, h := range strings.Split(list, ";") {
		out[strings.ToLower(h)] = true
	}
	return out
}

func TestNewRefusesCredentialsThatWouldFailAtEveryCall(t *testing.T) {
	cases := []struct {
		name  string
		creds tenancy.S3Credentials
		want  error
	}{
		{"no region", tenancy.S3Credentials{Bucket: "b", AccessKeyID: "k", SecretAccessKey: "s"}, ErrNoRegion},
		{"no bucket", tenancy.S3Credentials{Region: "r", AccessKeyID: "k", SecretAccessKey: "s"}, ErrNoBucket},
		{"no access key", tenancy.S3Credentials{Region: "r", Bucket: "b", SecretAccessKey: "s"}, ErrNoAccessKey},
		{"no secret", tenancy.S3Credentials{Region: "r", Bucket: "b", AccessKeyID: "k"}, ErrNoAccessKey},
		{"blank region", tenancy.S3Credentials{Region: "  ", Bucket: "b", AccessKeyID: "k", SecretAccessKey: "s"}, ErrNoRegion},
		{"endpoint without a scheme", tenancy.S3Credentials{
			Region: "r", Bucket: "b", AccessKeyID: "k", SecretAccessKey: "s", Endpoint: "minio.internal:9000",
		}, ErrNoEndpoint},
		{"endpoint with the wrong scheme", tenancy.S3Credentials{
			Region: "r", Bucket: "b", AccessKeyID: "k", SecretAccessKey: "s", Endpoint: "s3://minio.internal",
		}, ErrNoEndpoint},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, err := New(tc.creds)
			if err == nil {
				t.Fatalf("New accepted %s and returned %v", tc.name, c)
			}
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestPresignedPutBindsTheChecksumLengthAndType(t *testing.T) {
	c := newTestClient(t, testCredentials())
	r := samplePut()

	grant, err := c.PresignPut(context.Background(), r)
	if err != nil {
		t.Fatalf("PresignPut: %v", err)
	}
	t.Logf("put url: %s", grant.URL)

	signed := signedHeadersOf(t, grant.URL)
	for _, want := range []string{HeaderChecksum, HeaderContentLength, HeaderContentType} {
		if !signed[want] {
			t.Fatalf("%s is not among the signed headers %v", want, signed)
		}
	}
	if !signed["host"] {
		t.Fatalf("host is not signed: %v", signed)
	}
}

func TestPresignedPutCarriesTheDigestAsBase64NotHex(t *testing.T) {
	c := newTestClient(t, testCredentials())

	grant, err := c.PresignPut(context.Background(), samplePut())
	if err != nil {
		t.Fatalf("PresignPut: %v", err)
	}
	if strings.Contains(grant.URL, emptyDigestHex) {
		t.Fatal("the hex digest reached the wire where base64 is required")
	}
	if got := grant.Headers[HeaderChecksum]; got != emptyDigestB64 {
		t.Fatalf("the grant asks the client to send %q, want the base64 digest %q", got, emptyDigestB64)
	}
}

func TestPresignedPutRefusesAMalformedDigestRatherThanDroppingTheCheck(t *testing.T) {
	c := newTestClient(t, testCredentials())

	bad := []struct {
		name  string
		value string
	}{
		{"empty", ""},
		{"base64 where hex belongs", emptyDigestB64},
		{"too short", emptyDigestHex[:63]},
		{"too long", emptyDigestHex + "aa"},
		{"non hexadecimal", strings.Repeat("z", 64)},
	}

	for _, tc := range bad {
		t.Run(tc.name, func(t *testing.T) {
			r := samplePut()
			r.SHA256Hex = tc.value
			got, err := c.PresignPut(context.Background(), r)
			if err == nil {
				t.Fatalf("a %s digest produced a url: %s", tc.name, got.URL)
			}
			if !errors.Is(err, ErrChecksum) {
				t.Fatalf("err = %v, want %v", err, ErrChecksum)
			}
			if got.URL != "" || got.Headers != nil {
				t.Fatalf("a rejected request still returned %+v", got)
			}
		})
	}
}

func TestChecksumBase64MatchesAKnownDigest(t *testing.T) {
	got, err := ChecksumBase64(emptyDigestHex)
	if err != nil {
		t.Fatalf("ChecksumBase64: %v", err)
	}
	if got != emptyDigestB64 {
		t.Fatalf("ChecksumBase64 = %q, want %q", got, emptyDigestB64)
	}

	sum := sha256.Sum256([]byte("a teacher uploads a pdf"))
	again, err := ChecksumBase64(hex.EncodeToString(sum[:]))
	if err != nil {
		t.Fatalf("ChecksumBase64: %v", err)
	}
	back, err := base64.StdEncoding.DecodeString(again)
	if err != nil {
		t.Fatalf("the result is not base64: %v", err)
	}
	if !bytes.Equal(back, sum[:]) {
		t.Fatalf("decoding %q gave %x, want %x", again, back, sum[:])
	}

	upper, err := ChecksumBase64(strings.ToUpper(hex.EncodeToString(sum[:])))
	if err != nil {
		t.Fatalf("uppercase hex is the same digest: %v", err)
	}
	if upper != again {
		t.Fatalf("uppercase hex gave %q, lowercase gave %q", upper, again)
	}
}

func TestPresignedGetGrantsNoWriteBindings(t *testing.T) {
	c := newTestClient(t, testCredentials())

	raw, err := c.PresignGet(context.Background(), samplePut().Key, 5*time.Minute)
	if err != nil {
		t.Fatalf("PresignGet: %v", err)
	}
	t.Logf("get url: %s", raw)

	signed := signedHeadersOf(t, raw)
	for _, forbidden := range []string{HeaderChecksum, HeaderContentLength, HeaderContentType} {
		if signed[forbidden] {
			t.Fatalf("a read url signed the write binding %s: %v", forbidden, signed)
		}
	}
	if len(signed) != 1 || !signed["host"] {
		t.Fatalf("a read url should sign host and nothing else, got %v", signed)
	}

	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if id := u.Query().Get("x-id"); id != "GetObject" {
		t.Fatalf("x-id = %q, want GetObject", id)
	}
}

func TestTheHTTPMethodIsPartOfTheSignature(t *testing.T) {
	signer := v4.NewSigner()
	creds := aws.Credentials{AccessKeyID: "AKIAEXAMPLE", SecretAccessKey: theSecret}
	at := time.Date(2026, 9, 8, 12, 0, 0, 0, time.UTC)

	sign := func(method string) string {
		req, err := http.NewRequest(method, "https://harbour-assets.s3.ap-south-1.amazonaws.com/a/b.pdf", nil)
		if err != nil {
			t.Fatalf("new request: %v", err)
		}
		raw, _, err := signer.PresignHTTP(context.Background(), creds, req,
			"UNSIGNED-PAYLOAD", "s3", "ap-south-1", at)
		if err != nil {
			t.Fatalf("presign %s: %v", method, err)
		}
		u, err := url.Parse(raw)
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		return u.Query().Get("X-Amz-Signature")
	}

	get := sign(http.MethodGet)
	put := sign(http.MethodPut)
	if get == "" || put == "" {
		t.Fatal("the presigner returned no signature")
	}
	if get == put {
		t.Fatal("a read url and a write url over the same request signed identically, so the verb is not bound")
	}
}

func headersFromGrant(g PutGrant) http.Header {
	h := http.Header{}
	for name, value := range g.Headers {
		h.Set(name, value)
	}
	return h
}

func recompute(t *testing.T, rawURL, method string, headers http.Header, length int64) string {
	t.Helper()

	u, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	q := u.Query()
	at, err := time.Parse("20060102T150405Z", q.Get("X-Amz-Date"))
	if err != nil {
		t.Fatalf("X-Amz-Date %q: %v", q.Get("X-Amz-Date"), err)
	}
	q.Del("X-Amz-Signature")
	u.RawQuery = q.Encode()

	req, err := http.NewRequest(method, u.String(), nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header = headers.Clone()
	req.ContentLength = length

	creds := aws.Credentials{AccessKeyID: "AKIAEXAMPLE", SecretAccessKey: theSecret}
	out, _, err := v4.NewSigner().PresignHTTP(context.Background(), creds, req,
		"UNSIGNED-PAYLOAD", "s3", "ap-south-1", at)
	if err != nil {
		t.Fatalf("presign: %v", err)
	}
	parsed, err := url.Parse(out)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	return parsed.Query().Get("X-Amz-Signature")
}

func TestChangingTheDeclaredBytesInvalidatesTheSignature(t *testing.T) {
	c := newTestClient(t, testCredentials())
	r := samplePut()

	grant, err := c.PresignPut(context.Background(), r)
	if err != nil {
		t.Fatalf("PresignPut: %v", err)
	}
	raw := grant.URL
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	issued := u.Query().Get("X-Amz-Signature")

	honest := headersFromGrant(grant)
	if got := recompute(t, raw, http.MethodPut, honest, r.ContentLength); got != issued {
		t.Fatalf("recomputing the signature over the grant headers gave %s, the url carries %s", got, issued)
	}

	tampered := []struct {
		name   string
		mutate func(http.Header) int64
	}{
		{"a different size", func(h http.Header) int64 {
			h.Set("Content-Length", "91235")
			return 91235
		}},
		{"a different type", func(h http.Header) int64 {
			h.Set("Content-Type", "text/html")
			return 91234
		}},
		{"a different digest", func(h http.Header) int64 {
			h.Set("X-Amz-Checksum-Sha256", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
			return 91234
		}},
		{"no digest at all", func(h http.Header) int64 {
			h.Del("X-Amz-Checksum-Sha256")
			return 91234
		}},
		{"no declared type", func(h http.Header) int64 {
			h.Del("Content-Type")
			return 91234
		}},
	}

	for _, tc := range tampered {
		t.Run(tc.name, func(t *testing.T) {
			h := honest.Clone()
			length := tc.mutate(h)
			if got := recompute(t, raw, http.MethodPut, h, length); got == issued {
				t.Fatalf("%s still signed as %s, so the url does not bind it", tc.name, got)
			}
		})
	}

	if got := recompute(t, raw, http.MethodGet, honest, r.ContentLength); got == issued {
		t.Fatal("the same url signed identically for GET, so the verb is not bound")
	}
}

func TestTheGrantCarriesExactlyWhatTheSignatureBinds(t *testing.T) {
	c := newTestClient(t, testCredentials())
	r := samplePut()

	grant, err := c.PresignPut(context.Background(), r)
	if err != nil {
		t.Fatalf("PresignPut: %v", err)
	}
	t.Logf("grant headers: %v", grant.Headers)

	want := map[string]string{
		HeaderContentLength: "91234",
		HeaderContentType:   "application/pdf",
		HeaderChecksum:      emptyDigestB64,
	}
	if len(grant.Headers) != len(want) {
		t.Fatalf("the grant carries %d headers, want %d: %v", len(grant.Headers), len(want), grant.Headers)
	}
	for name, value := range want {
		if got := grant.Headers[name]; got != value {
			t.Fatalf("grant header %s = %q, want %q", name, got, value)
		}
	}
	if _, ok := grant.Headers["host"]; ok {
		t.Fatal("the grant asks the client to set host, which the transport owns")
	}

	signed := signedHeadersOf(t, grant.URL)
	delete(signed, "host")
	if len(signed) != len(grant.Headers) {
		t.Fatalf("the url signs %v but the grant lists %v", signed, grant.Headers)
	}
	for name := range signed {
		if _, ok := grant.Headers[name]; !ok {
			t.Fatalf("%s is signed but the grant does not ask the client to send it", name)
		}
	}

	u, err := url.Parse(grant.URL)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	issued := u.Query().Get("X-Amz-Signature")
	if got := recompute(t, grant.URL, http.MethodPut, headersFromGrant(grant), r.ContentLength); got != issued {
		t.Fatalf("sending exactly the grant headers signs as %s, but the url carries %s", got, issued)
	}

	for name := range grant.Headers {
		partial := headersFromGrant(grant)
		partial.Del(name)
		length := r.ContentLength
		if name == HeaderContentLength {
			length = 0
		}
		if got := recompute(t, grant.URL, http.MethodPut, partial, length); got == issued {
			t.Fatalf("dropping %s left the signature intact, so the grant lists a header that is not bound", name)
		}
	}
}

func TestChecksumHexReversesTheStoredDigest(t *testing.T) {
	got, err := ChecksumHex(emptyDigestB64)
	if err != nil {
		t.Fatalf("ChecksumHex: %v", err)
	}
	if got != emptyDigestHex {
		t.Fatalf("ChecksumHex = %q, want %q", got, emptyDigestHex)
	}

	sum := sha256.Sum256([]byte("a teacher uploads a pdf"))
	b64, err := ChecksumBase64(hex.EncodeToString(sum[:]))
	if err != nil {
		t.Fatalf("ChecksumBase64: %v", err)
	}
	back, err := ChecksumHex(b64)
	if err != nil {
		t.Fatalf("ChecksumHex: %v", err)
	}
	if back != hex.EncodeToString(sum[:]) {
		t.Fatalf("the round trip gave %q, want %q", back, hex.EncodeToString(sum[:]))
	}
}

func TestChecksumHexReportsAnUncomparableDigestAsAbsent(t *testing.T) {
	for _, value := range []string{"", "   ", emptyDigestB64 + "-4", "somethingelse-12"} {
		got, err := ChecksumHex(value)
		if err != nil {
			t.Fatalf("ChecksumHex(%q) errored: %v", value, err)
		}
		if got != "" {
			t.Fatalf("ChecksumHex(%q) = %q, want an empty string", value, got)
		}
	}
}

func TestChecksumHexRefusesAReplyThatIsNotADigest(t *testing.T) {
	for _, value := range []string{"not base64 at all!", "YWJj", "AAAA", emptyDigestB64 + emptyDigestB64} {
		if got, err := ChecksumHex(value); !errors.Is(err, ErrChecksumReply) {
			t.Fatalf("ChecksumHex(%q) = %q, %v, want %v", value, got, err, ErrChecksumReply)
		}
	}
}

func fakeStore(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	return newTestClient(t, tenancy.S3Credentials{
		Region:          "us-east-1",
		Bucket:          "harbour-assets",
		Endpoint:        srv.URL,
		AccessKeyID:     "AKIAEXAMPLE",
		SecretAccessKey: theSecret,
		UsePathStyle:    true,
	})
}

func TestHeadReportsTheStoredDigestAsHex(t *testing.T) {
	var seen *http.Request
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		seen = r
		w.Header().Set("Content-Length", "91234")
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("x-amz-checksum-sha256", emptyDigestB64)
		w.WriteHeader(http.StatusOK)
	})

	info, err := c.Head(context.Background(), "schools/hp/assets/2026/syllabus.pdf")
	if err != nil {
		t.Fatalf("Head: %v", err)
	}
	if !info.Exists {
		t.Fatal("a 200 should read as present")
	}
	if info.ContentLength != 91234 {
		t.Fatalf("ContentLength = %d, want 91234", info.ContentLength)
	}
	if info.ContentType != "application/pdf" {
		t.Fatalf("ContentType = %q, want application/pdf", info.ContentType)
	}
	if info.SHA256Hex != emptyDigestHex {
		t.Fatalf("SHA256Hex = %q, want %q", info.SHA256Hex, emptyDigestHex)
	}

	if seen == nil {
		t.Fatal("the store was never called")
	}
	if seen.Method != http.MethodHead {
		t.Fatalf("method = %s, want HEAD", seen.Method)
	}
	if got := seen.Header.Get("x-amz-checksum-mode"); !strings.EqualFold(got, "ENABLED") {
		t.Fatalf("x-amz-checksum-mode = %q, want ENABLED, so the store never returns a digest", got)
	}
	if got := seen.URL.Path; got != "/harbour-assets/schools/hp/assets/2026/syllabus.pdf" {
		t.Fatalf("path = %q", got)
	}
}

func TestHeadLeavesTheDigestEmptyWhenTheStoreOffersNone(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "91234")
		w.Header().Set("Content-Type", "application/pdf")
		w.WriteHeader(http.StatusOK)
	})

	info, err := c.Head(context.Background(), "schools/hp/assets/2026/syllabus.pdf")
	if err != nil {
		t.Fatalf("a store that returns no checksum must not be an error: %v", err)
	}
	if !info.Exists || info.ContentLength != 91234 {
		t.Fatalf("info = %+v", info)
	}
	if info.SHA256Hex != "" {
		t.Fatalf("SHA256Hex = %q, want an empty string", info.SHA256Hex)
	}
}

func TestHeadRefusesADigestTheStoreMangles(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "91234")
		w.Header().Set("x-amz-checksum-sha256", "YWJj")
		w.WriteHeader(http.StatusOK)
	})

	if info, err := c.Head(context.Background(), "k"); !errors.Is(err, ErrChecksumReply) {
		t.Fatalf("Head = %+v, %v, want %v", info, err, ErrChecksumReply)
	}
}

func TestHeadReadsAMissingObjectAsAbsentOverTheWire(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})

	info, err := c.Head(context.Background(), "schools/hp/assets/2026/gone.pdf")
	if err != nil {
		t.Fatalf("a 404 must not be an error: %v", err)
	}
	if info.Exists {
		t.Fatal("a 404 should read as absent")
	}
	if info.SHA256Hex != "" || info.ContentLength != 0 {
		t.Fatalf("an absent object reported %+v", info)
	}
}

func TestHeadKeepsAStoreFailureAsAnError(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})

	info, err := c.Head(context.Background(), "schools/hp/assets/2026/syllabus.pdf")
	if err == nil {
		t.Fatalf("a 403 must not read as absent: %+v", info)
	}
	if strings.Contains(err.Error(), theSecret) {
		t.Fatalf("the failure carries the secret: %v", err)
	}
}

func TestDeleteRemovesTheObjectOverTheWire(t *testing.T) {
	var seen *http.Request
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		seen = r
		w.WriteHeader(http.StatusNoContent)
	})

	if err := c.Delete(context.Background(), "schools/hp/assets/2026/syllabus.pdf"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if seen == nil {
		t.Fatal("the store was never called")
	}
	if seen.Method != http.MethodDelete {
		t.Fatalf("method = %s, want DELETE", seen.Method)
	}
	if got := seen.URL.Path; got != "/harbour-assets/schools/hp/assets/2026/syllabus.pdf" {
		t.Fatalf("path = %q", got)
	}
}

func TestDeleteReadsAMissingObjectAsDoneOverTheWire(t *testing.T) {
	for _, status := range []int{http.StatusNoContent, http.StatusOK, http.StatusNotFound} {
		called := false
		c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(status)
		})

		if err := c.Delete(context.Background(), "schools/hp/assets/2026/gone.pdf"); err != nil {
			t.Fatalf("a %d answer must read as deleted, not as a failure: %v", status, err)
		}
		if !called {
			t.Fatalf("the store was never called for %d", status)
		}
	}
}

func TestDeleteIsIdempotentAcrossRepeatedCalls(t *testing.T) {
	calls := 0
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})

	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if err := c.Delete(ctx, "schools/hp/assets/2026/syllabus.pdf"); err != nil {
			t.Fatalf("Delete call %d: %v", i+1, err)
		}
	}
	if calls != 3 {
		t.Fatalf("calls = %d, want 3", calls)
	}
}

func TestDeleteKeepsAStoreFailureAsAnError(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})

	err := c.Delete(context.Background(), "schools/hp/assets/2026/syllabus.pdf")
	if err == nil {
		t.Fatal("a 403 must not read as a successful delete")
	}
	if strings.Contains(err.Error(), theSecret) {
		t.Fatalf("the failure carries the secret: %v", err)
	}
}

func TestDeleteWithholdsAKeyThatPoisonsItsError(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})

	poisoned := "schools/hp/X-Amz-Signature=deadbeefcafe.pdf"
	err := c.Delete(context.Background(), poisoned)
	if !errors.Is(err, ErrWithheld) {
		t.Fatalf("Delete = %v, want %v", err, ErrWithheld)
	}
	if strings.Contains(err.Error(), "deadbeefcafe") {
		t.Fatalf("the poisoned key survived: %v", err)
	}
}

func TestExpiriesOutsideTheCeilingAreRefused(t *testing.T) {
	c := newTestClient(t, testCredentials())
	ctx := context.Background()

	bad := []time.Duration{0, -time.Second, -time.Hour, MaxExpiry + time.Second, 24 * time.Hour, 7 * 24 * time.Hour}
	for _, d := range bad {
		r := samplePut()
		r.Expires = d
		if got, err := c.PresignPut(ctx, r); err == nil {
			t.Fatalf("PresignPut accepted an expiry of %s: %s", d, got.URL)
		} else if !errors.Is(err, ErrExpiry) {
			t.Fatalf("PresignPut err = %v, want %v", err, ErrExpiry)
		}
		if got, err := c.PresignGet(ctx, r.Key, d); err == nil {
			t.Fatalf("PresignGet accepted an expiry of %s: %s", d, got)
		} else if !errors.Is(err, ErrExpiry) {
			t.Fatalf("PresignGet err = %v, want %v", err, ErrExpiry)
		}
	}

	for _, d := range []time.Duration{time.Second, 15 * time.Minute, MaxExpiry} {
		r := samplePut()
		r.Expires = d
		if _, err := c.PresignPut(ctx, r); err != nil {
			t.Fatalf("an expiry of %s should be allowed: %v", d, err)
		}
	}
}

func TestTheExpiryReachesTheURL(t *testing.T) {
	c := newTestClient(t, testCredentials())
	r := samplePut()
	r.Expires = 7 * time.Minute

	grant, err := c.PresignPut(context.Background(), r)
	if err != nil {
		t.Fatalf("PresignPut: %v", err)
	}
	u, err := url.Parse(grant.URL)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got := u.Query().Get("X-Amz-Expires"); got != "420" {
		t.Fatalf("X-Amz-Expires = %q, want 420", got)
	}
}

func TestNoSecretMaterialLeavesThePackage(t *testing.T) {
	creds := testCredentials()
	c := newTestClient(t, creds)
	ctx := context.Background()

	grant, err := c.PresignPut(ctx, samplePut())
	if err != nil {
		t.Fatalf("PresignPut: %v", err)
	}
	get, err := c.PresignGet(ctx, samplePut().Key, time.Minute)
	if err != nil {
		t.Fatalf("PresignGet: %v", err)
	}

	for name, value := range grant.Headers {
		if strings.Contains(value, theSecret) {
			t.Fatalf("the secret key is in the grant header %s", name)
		}
	}

	for _, raw := range []string{grant.URL, get} {
		if strings.Contains(raw, theSecret) {
			t.Fatalf("the secret key is in a presigned url: %s", raw)
		}
		unescaped, err := url.QueryUnescape(raw)
		if err != nil {
			t.Fatalf("unescape: %v", err)
		}
		if strings.Contains(unescaped, theSecret) {
			t.Fatalf("the secret key is in a presigned url once unescaped: %s", unescaped)
		}
		if !strings.Contains(raw, creds.AccessKeyID) {
			t.Fatalf("the access key id is absent, so this is not a signed url: %s", raw)
		}
	}

	var failures []error
	bad := samplePut()
	bad.SHA256Hex = "nope"
	if _, err := c.PresignPut(ctx, bad); err != nil {
		failures = append(failures, err)
	}
	bad = samplePut()
	bad.Expires = 0
	if _, err := c.PresignPut(ctx, bad); err != nil {
		failures = append(failures, err)
	}
	bad = samplePut()
	bad.Key = ""
	if _, err := c.PresignPut(ctx, bad); err != nil {
		failures = append(failures, err)
	}
	bad = samplePut()
	bad.ContentType = ""
	if _, err := c.PresignPut(ctx, bad); err != nil {
		failures = append(failures, err)
	}
	bad = samplePut()
	bad.ContentLength = 0
	if _, err := c.PresignPut(ctx, bad); err != nil {
		failures = append(failures, err)
	}
	if _, err := c.PresignGet(ctx, "", time.Minute); err != nil {
		failures = append(failures, err)
	}
	if _, err := c.Head(ctx, ""); err != nil {
		failures = append(failures, err)
	}
	if err := c.Delete(ctx, ""); err != nil {
		failures = append(failures, err)
	}
	if _, err := New(tenancy.S3Credentials{SecretAccessKey: theSecret}); err != nil {
		failures = append(failures, err)
	}
	if len(failures) != 9 {
		t.Fatalf("expected nine rejections, got %d", len(failures))
	}
	for _, err := range failures {
		if strings.Contains(err.Error(), theSecret) {
			t.Fatalf("an error string carries the secret: %v", err)
		}
	}

	if s := c.String(); strings.Contains(s, theSecret) || !strings.Contains(s, "REDACTED") {
		t.Fatalf("String = %q, it must redact the secret", s)
	}
}

func TestGuardScrubsASecretThatReachesAnError(t *testing.T) {
	c := newTestClient(t, testCredentials())

	leaky := errors.New("blob: head failed for account " + theSecret + " tail")
	scrubbed := c.guard(leaky)
	if strings.Contains(scrubbed.Error(), theSecret) {
		t.Fatalf("guard left the secret in place: %v", scrubbed)
	}
	if !strings.Contains(scrubbed.Error(), "REDACTED") {
		t.Fatalf("guard = %v, want a REDACTED marker", scrubbed)
	}
	if c.guard(nil) != nil {
		t.Fatal("guard turned a nil error into something")
	}

	clean := errors.New("blob: head failed")
	if got := c.guard(clean); got != clean {
		t.Fatalf("guard rewrapped a clean error: %v", got)
	}
}

func TestGuardRefusesToEmitABearerCredential(t *testing.T) {
	c := newTestClient(t, testCredentials())

	grant, err := c.PresignPut(context.Background(), samplePut())
	if err != nil {
		t.Fatalf("PresignPut: %v", err)
	}
	get, err := c.PresignGet(context.Background(), samplePut().Key, time.Minute)
	if err != nil {
		t.Fatalf("PresignGet: %v", err)
	}

	u, err := url.Parse(grant.URL)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	signature := u.Query().Get("X-Amz-Signature")
	if signature == "" {
		t.Fatal("the test needs a real signature to try to leak")
	}

	leaks := []struct {
		name string
		err  error
	}{
		{"a presigned put in a wrapped error", fmt.Errorf("blob: presign put: %w", errors.New(grant.URL))},
		{"a presigned get quoted in a message", fmt.Errorf("blob: head %q failed", get)},
		{"a url mid sentence", errors.New("blob: the store rejected " + grant.URL + " outright")},
		{"a bare signature parameter", errors.New("blob: X-Amz-Signature=" + signature + " did not verify")},
		{"a credential parameter", errors.New("blob: X-Amz-Credential=AKIAEXAMPLE/20260908/ap-south-1/s3/aws4_request stale")},
		{"a session token", errors.New("blob: X-Amz-Security-Token=FQoDYXdzEPT// rejected")},
		{"a lowercase signature parameter", errors.New("blob: x-amz-signature=" + signature)},
	}

	for _, tc := range leaks {
		t.Run(tc.name, func(t *testing.T) {
			got := c.guard(tc.err)
			if got == nil {
				t.Fatal("guard dropped the error entirely")
			}
			text := got.Error()
			if strings.Contains(text, signature) {
				t.Fatalf("the signature survived the guard: %s", text)
			}
			for _, marker := range bearerMarkers {
				if strings.Contains(strings.ToLower(text), marker) {
					t.Fatalf("%s survived the guard: %s", marker, text)
				}
			}
			t.Logf("%s -> %v", tc.name, got)
		})
	}
}

func TestGuardKeepsNothingOfAWithheldError(t *testing.T) {
	c := newTestClient(t, testCredentials())

	original := errors.New("blob: X-Amz-Signature=deadbeef did not verify")
	got := c.guard(original)

	if !errors.Is(got, ErrWithheld) {
		t.Fatalf("guard = %v, want %v", got, ErrWithheld)
	}
	if errors.Unwrap(got) != nil {
		t.Fatalf("the withheld error still unwraps to %v, so the leak is one call away", errors.Unwrap(got))
	}
	if errors.Is(got, original) {
		t.Fatal("the withheld error still matches the original")
	}
}

func TestGuardKeepsTheHostAndPathOfAURLItStrips(t *testing.T) {
	c := newTestClient(t, testCredentials())

	grant, err := c.PresignPut(context.Background(), samplePut())
	if err != nil {
		t.Fatalf("PresignPut: %v", err)
	}
	got := c.guard(errors.New("blob: the store rejected " + grant.URL + " outright"))
	text := got.Error()

	if !strings.Contains(text, "harbour-assets.s3.ap-south-1.amazonaws.com/schools/hp/assets/2026/syllabus.pdf") {
		t.Fatalf("the guard threw away the diagnosable part of the url: %s", text)
	}
	if !strings.Contains(text, "outright") {
		t.Fatalf("the guard ate the rest of the sentence: %s", text)
	}
	if strings.Contains(text, "X-Amz-") {
		t.Fatalf("query material survived: %s", text)
	}
}

func TestEveryExportedMethodRoutesItsErrorThroughTheGuard(t *testing.T) {
	const marker = "is not addressable"

	c := newTestClient(t, testCredentials())
	c.secret = marker
	ctx := context.Background()

	r := samplePut()
	r.Key = ""

	errs := map[string]error{}
	_, errs["PresignPut"] = c.PresignPut(ctx, r)
	_, errs["PresignGet"] = c.PresignGet(ctx, "/leading-slash", time.Minute)
	_, errs["Head"] = c.Head(ctx, "/leading-slash")
	_, errs["Get"] = c.Get(ctx, GetRequest{Key: "/leading-slash"})
	errs["Delete"] = c.Delete(ctx, "/leading-slash")
	errs["Put"] = c.Put(ctx, PutStream{
		Key:           "/leading-slash",
		ContentType:   "application/pdf",
		ContentLength: 3,
		SHA256Hex:     emptyDigestHex,
		Body:          strings.NewReader("abc"),
	})

	r.Key = "/leading-slash"
	_, errs["PresignPut key"] = c.PresignPut(ctx, r)

	for name, err := range errs {
		if err == nil {
			t.Fatalf("%s did not fail, so this test proves nothing", name)
		}
		if strings.Contains(err.Error(), marker) {
			t.Fatalf("%s returned %q without passing through the guard", name, err)
		}
	}
	if !strings.Contains(errs["PresignGet"].Error(), "REDACTED") {
		t.Fatalf("PresignGet = %q, want the guard's REDACTED marker", errs["PresignGet"])
	}
}

func TestAKeyThatPoisonsAnErrorIsWithheldOverTheWire(t *testing.T) {
	c := fakeStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})

	poisoned := "schools/hp/X-Amz-Signature=deadbeefcafe.pdf"
	info, err := c.Head(context.Background(), poisoned)
	if !errors.Is(err, ErrWithheld) {
		t.Fatalf("Head = %+v, %v, want %v", info, err, ErrWithheld)
	}
	if strings.Contains(err.Error(), "deadbeefcafe") {
		t.Fatalf("the poisoned key survived: %v", err)
	}
}

func TestStripSignedURLsLeavesOrdinaryTextAlone(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"blob: head failed", "blob: head failed"},
		{"blob: no url here at all", "blob: no url here at all"},
		{"blob: https://a.example.org/k failed", "blob: https://a.example.org/k failed"},
		{"blob: https://a.example.org/k?a=1 failed", "blob: https://a.example.org/k?REDACTED failed"},
		{`blob: head "https://a.example.org/k?a=1" failed`, `blob: head "https://a.example.org/k?REDACTED" failed`},
		{"blob: http://a/1?x and https://b/2?y", "blob: http://a/1?REDACTED and https://b/2?REDACTED"},
		{"blob: trailing https://a.example.org/k?a=1", "blob: trailing https://a.example.org/k?REDACTED"},
	}

	for _, tc := range cases {
		if got := stripSignedURLs(tc.in); got != tc.want {
			t.Fatalf("stripSignedURLs(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPathStyleAndVirtualHostAddressingBothResolve(t *testing.T) {
	cases := []struct {
		name     string
		creds    tenancy.S3Credentials
		wantHost string
		wantPath string
	}{
		{
			name: "aws virtual host",
			creds: tenancy.S3Credentials{
				Region: "ap-south-1", Bucket: "harbour-assets",
				AccessKeyID: "AKIAEXAMPLE", SecretAccessKey: theSecret,
			},
			wantHost: "harbour-assets.s3.ap-south-1.amazonaws.com",
			wantPath: "/schools/hp/assets/2026/syllabus.pdf",
		},
		{
			name: "custom endpoint path style",
			creds: tenancy.S3Credentials{
				Region: "us-east-1", Bucket: "harbour-assets", Endpoint: "http://minio.internal:9000",
				AccessKeyID: "AKIAEXAMPLE", SecretAccessKey: theSecret, UsePathStyle: true,
			},
			wantHost: "minio.internal:9000",
			wantPath: "/harbour-assets/schools/hp/assets/2026/syllabus.pdf",
		},
		{
			name: "custom endpoint virtual host",
			creds: tenancy.S3Credentials{
				Region: "us-east-1", Bucket: "harbour-assets", Endpoint: "https://storage.example.org",
				AccessKeyID: "AKIAEXAMPLE", SecretAccessKey: theSecret,
			},
			wantHost: "harbour-assets.storage.example.org",
			wantPath: "/schools/hp/assets/2026/syllabus.pdf",
		},
		{
			name: "custom endpoint with a trailing slash",
			creds: tenancy.S3Credentials{
				Region: "us-east-1", Bucket: "harbour-assets", Endpoint: "http://minio.internal:9000/",
				AccessKeyID: "AKIAEXAMPLE", SecretAccessKey: theSecret, UsePathStyle: true,
			},
			wantHost: "minio.internal:9000",
			wantPath: "/harbour-assets/schools/hp/assets/2026/syllabus.pdf",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := newTestClient(t, tc.creds)
			grant, err := c.PresignPut(context.Background(), samplePut())
			if err != nil {
				t.Fatalf("PresignPut: %v", err)
			}
			t.Logf("%s: %s", tc.name, grant.URL)

			u, err := url.Parse(grant.URL)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if u.Host != tc.wantHost {
				t.Fatalf("host = %q, want %q", u.Host, tc.wantHost)
			}
			if u.Path != tc.wantPath {
				t.Fatalf("path = %q, want %q", u.Path, tc.wantPath)
			}
			if signed := signedHeadersOf(t, grant.URL); !signed[HeaderChecksum] {
				t.Fatalf("%s lost the checksum binding: %v", tc.name, signed)
			}
		})
	}
}

func TestUnaddressableKeysAreRefused(t *testing.T) {
	c := newTestClient(t, testCredentials())
	ctx := context.Background()

	cases := []struct {
		name string
		key  string
		want error
	}{
		{"empty", "", ErrNoKey},
		{"leading slash", "/schools/hp/a.pdf", ErrKeyRejected},
		{"null byte", "schools/hp/a\x00.pdf", ErrKeyRejected},
		{"over the length limit", strings.Repeat("a", MaxKeySize+1), ErrKeyRejected},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := samplePut()
			r.Key = tc.key
			if _, err := c.PresignPut(ctx, r); !errors.Is(err, tc.want) {
				t.Fatalf("PresignPut err = %v, want %v", err, tc.want)
			}
			if _, err := c.PresignGet(ctx, tc.key, time.Minute); !errors.Is(err, tc.want) {
				t.Fatalf("PresignGet err = %v, want %v", err, tc.want)
			}
			if _, err := c.Head(ctx, tc.key); !errors.Is(err, tc.want) {
				t.Fatalf("Head err = %v, want %v", err, tc.want)
			}
			if err := c.Delete(ctx, tc.key); !errors.Is(err, tc.want) {
				t.Fatalf("Delete err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestAnIncompleteUploadDeclarationIsRefused(t *testing.T) {
	c := newTestClient(t, testCredentials())
	ctx := context.Background()

	r := samplePut()
	r.ContentType = "   "
	if _, err := c.PresignPut(ctx, r); !errors.Is(err, ErrNoContentType) {
		t.Fatalf("err = %v, want %v", err, ErrNoContentType)
	}

	for _, n := range []int64{-1, -4096} {
		r = samplePut()
		r.ContentLength = n
		if _, err := c.PresignPut(ctx, r); !errors.Is(err, ErrNoLength) {
			t.Fatalf("a length of %d gave err = %v, want %v", n, err, ErrNoLength)
		}
	}

	r = samplePut()
	r.ContentLength = 0
	if _, err := c.PresignPut(ctx, r); errors.Is(err, ErrNoLength) {
		t.Fatalf("a zero length asset is representable and must not be refused as malformed: %v", err)
	}
}

func TestAZeroLengthUploadIsNeverSilentlyBoundOnTwoHeaders(t *testing.T) {
	c := newTestClient(t, testCredentials())
	r := samplePut()
	r.ContentLength = 0

	grant, err := c.PresignPut(context.Background(), r)
	t.Logf("zero length presign: err = %v", err)
	t.Logf("zero length presign: headers = %v", grant.Headers)

	if err == nil {
		if got := grant.Headers[HeaderContentLength]; got != "0" {
			t.Fatalf("a zero length grant returned %q for %s, so the url binds only two headers",
				got, HeaderContentLength)
		}
		signed := signedHeadersOf(t, grant.URL)
		if !signed[HeaderContentLength] {
			t.Fatalf("a zero length url does not sign %s: %v", HeaderContentLength, signed)
		}
		return
	}

	if !errors.Is(err, ErrUnbound) {
		t.Fatalf("a zero length upload must either bind its length or fail with %v, got %v", ErrUnbound, err)
	}
	if !errors.Is(err, ErrZeroLength) {
		t.Fatalf("the refusal must name the zero length cause so the route can tell it apart, got %v", err)
	}
	if grant.URL != "" || grant.Headers != nil {
		t.Fatalf("a refused zero length request still returned %+v", grant)
	}
}

func TestAPositiveLengthNeverTakesTheZeroLengthPath(t *testing.T) {
	c := newTestClient(t, testCredentials())

	grant, err := c.PresignPut(context.Background(), samplePut())
	if err != nil {
		t.Fatalf("PresignPut: %v", err)
	}
	if grant.Headers[HeaderContentLength] != "91234" {
		t.Fatalf("content-length = %q, want 91234", grant.Headers[HeaderContentLength])
	}

	r := samplePut()
	r.ContentLength = 1
	grant, err = c.PresignPut(context.Background(), r)
	if err != nil {
		t.Fatalf("a one byte upload must presign: %v", err)
	}
	if grant.Headers[HeaderContentLength] != "1" {
		t.Fatalf("content-length = %q, want 1", grant.Headers[HeaderContentLength])
	}
}

func TestAssertBoundRejectsAURLThatOnlyLooksBound(t *testing.T) {
	want := map[string]string{
		HeaderContentLength: "91234",
		HeaderContentType:   "application/pdf",
		HeaderChecksum:      emptyDigestB64,
	}
	full := http.Header{
		"Content-Length":        {"91234"},
		"Content-Type":          {"application/pdf"},
		"X-Amz-Checksum-Sha256": {emptyDigestB64},
	}

	base := "https://b.s3.amazonaws.com/k?X-Amz-SignedHeaders="

	if err := assertBound(base+url.QueryEscape("content-length;content-type;host;x-amz-checksum-sha256"), full, want); err != nil {
		t.Fatalf("a fully bound url was rejected: %v", err)
	}

	unbound := []string{
		"host",
		"content-length;content-type;host",
		"content-type;host;x-amz-checksum-sha256",
		"content-length;host;x-amz-checksum-sha256",
	}
	for _, list := range unbound {
		if err := assertBound(base+url.QueryEscape(list), full, want); !errors.Is(err, ErrUnbound) {
			t.Fatalf("signed headers %q gave err = %v, want %v", list, err, ErrUnbound)
		}
	}

	if err := assertBound("https://b.s3.amazonaws.com/k", full, want); !errors.Is(err, ErrUnbound) {
		t.Fatalf("a url signing nothing gave err = %v, want %v", err, ErrUnbound)
	}

	rewritten := http.Header{
		"Content-Length":        {"1"},
		"Content-Type":          {"application/pdf"},
		"X-Amz-Checksum-Sha256": {emptyDigestB64},
	}
	err := assertBound(base+url.QueryEscape("content-length;content-type;host;x-amz-checksum-sha256"), rewritten, want)
	if !errors.Is(err, ErrUnbound) {
		t.Fatalf("a rewritten content length gave err = %v, want %v", err, ErrUnbound)
	}
}

func TestANilClientFailsClosed(t *testing.T) {
	var c *Client
	ctx := context.Background()

	if _, err := c.PresignPut(ctx, samplePut()); err == nil {
		t.Fatal("a nil client handed out a write url")
	}
	if _, err := c.PresignGet(ctx, "k", time.Minute); err == nil {
		t.Fatal("a nil client handed out a read url")
	}
	if _, err := c.Head(ctx, "k"); err == nil {
		t.Fatal("a nil client answered a head")
	}
	if err := c.Delete(ctx, "k"); err == nil {
		t.Fatal("a nil client deleted an object")
	}
	if c.Bucket() != "" {
		t.Fatal("a nil client named a bucket")
	}
	if !strings.Contains(c.String(), "no client") {
		t.Fatalf("String = %q", c.String())
	}
}

func TestHeadTreatsAMissingObjectAsAbsentRatherThanAnError(t *testing.T) {
	for _, err := range []error{
		&types.NotFound{},
		&types.NoSuchKey{},
		&smithy.GenericAPIError{Code: "NotFound", Message: "the object is gone"},
		&smithy.GenericAPIError{Code: "NoSuchKey", Message: "the object is gone"},
		&awshttp.ResponseError{
			ResponseError: &smithyhttp.ResponseError{
				Response: &smithyhttp.Response{Response: &http.Response{StatusCode: http.StatusNotFound}},
				Err:      errors.New("not found"),
			},
		},
	} {
		if !isNotFound(err) {
			t.Fatalf("%v should read as absent", err)
		}
	}

	if isNotFound(errors.New("blob: connection refused")) {
		t.Fatal("a transport failure must not read as absent")
	}
	if isNotFound(&smithy.GenericAPIError{Code: "AccessDenied"}) {
		t.Fatal("a denial must not read as absent")
	}
	if isNotFound(&awshttp.ResponseError{
		ResponseError: &smithyhttp.ResponseError{
			Response: &smithyhttp.Response{Response: &http.Response{StatusCode: http.StatusForbidden}},
			Err:      errors.New("forbidden"),
		},
	}) {
		t.Fatal("a 403 must not read as absent")
	}
}
