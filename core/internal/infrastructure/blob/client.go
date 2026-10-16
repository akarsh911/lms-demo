package blob

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	"github.com/aws/smithy-go/middleware"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
)

const (
	MaxExpiry  = time.Hour
	MaxKeySize = 1024
)

const (
	HeaderChecksum      = "x-amz-checksum-sha256"
	HeaderContentLength = "content-length"
	HeaderContentType   = "content-type"
)

var (
	ErrNoRegion      = errors.New("blob: the s3 credentials carry no region")
	ErrNoBucket      = errors.New("blob: the s3 credentials carry no bucket")
	ErrNoAccessKey   = errors.New("blob: the s3 credentials carry no access key")
	ErrNoEndpoint    = errors.New("blob: the endpoint must be an http or https url with a host")
	ErrNoKey         = errors.New("blob: an object key is required")
	ErrKeyRejected   = errors.New("blob: that object key is not addressable")
	ErrNoContentType = errors.New("blob: an upload must declare its content type")
	ErrNoLength      = errors.New("blob: an upload may not declare a negative content length")
	ErrNoBody        = errors.New("blob: an upload must carry a body")
	ErrChecksum      = errors.New("blob: the sha256 must be 64 hexadecimal characters")
	ErrChecksumReply = errors.New("blob: the store answered with a sha256 that is not a 32 byte digest")
	ErrExpiry        = errors.New("blob: an expiry must be positive and no longer than an hour")
	ErrNoObject      = errors.New("blob: the store holds no object at that key")
	ErrRangeRefused  = errors.New("blob: the store will not serve that byte range")
	ErrUnbound       = errors.New("blob: the store would not bind the upload to its checksum, length and type")
	ErrZeroLength    = errors.New("blob: sigv4 signs content-length only when it is positive, so a zero byte upload cannot be bound to its length")
	ErrWithheld      = errors.New("blob: the underlying failure was withheld because its text carried signed url material")
)

type Client struct {
	api     *s3.Client
	presign *s3.PresignClient
	bucket  string
	region  string
	keyID   string
	secret  string
}

type PutRequest struct {
	Key           string
	ContentType   string
	ContentLength int64
	SHA256Hex     string
	Expires       time.Duration
}

type PutStream struct {
	Key           string
	ContentType   string
	ContentLength int64
	SHA256Hex     string
	Body          io.Reader
}

type PutGrant struct {
	URL     string
	Headers map[string]string
}

type ObjectInfo struct {
	Exists        bool
	ContentLength int64
	ContentType   string
	SHA256Hex     string
}

type GetRequest struct {
	Key   string
	Range string
}

type ObjectStream struct {
	Body          io.ReadCloser
	ContentLength int64
	ContentType   string
	ContentRange  string
	Partial       bool
}

func New(creds tenancy.S3Credentials) (*Client, error) {
	region := strings.TrimSpace(creds.Region)
	if region == "" {
		return nil, ErrNoRegion
	}
	bucket := strings.TrimSpace(creds.Bucket)
	if bucket == "" {
		return nil, ErrNoBucket
	}
	if strings.TrimSpace(creds.AccessKeyID) == "" || creds.SecretAccessKey == "" {
		return nil, ErrNoAccessKey
	}

	opts := s3.Options{
		Region:                     region,
		UsePathStyle:               creds.UsePathStyle,
		Credentials:                staticCredentials(creds),
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
	}

	if endpoint := strings.TrimSpace(creds.Endpoint); endpoint != "" {
		u, err := url.Parse(endpoint)
		if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
			return nil, ErrNoEndpoint
		}
		opts.BaseEndpoint = aws.String(strings.TrimRight(endpoint, "/"))
	}

	api := s3.New(opts)
	return &Client{
		api:     api,
		presign: s3.NewPresignClient(api),
		bucket:  bucket,
		region:  region,
		keyID:   creds.AccessKeyID,
		secret:  creds.SecretAccessKey,
	}, nil
}

func (c *Client) String() string {
	if c == nil {
		return "blob: no client"
	}
	return fmt.Sprintf("s3://%s (region=%s, key=%s, secret=REDACTED)", c.bucket, c.region, c.keyID)
}

func (c *Client) Bucket() string {
	if c == nil {
		return ""
	}
	return c.bucket
}

func (c *Client) PresignPut(ctx context.Context, r PutRequest) (grant PutGrant, err error) {
	defer func() { err = c.guard(err) }()

	if c == nil {
		return PutGrant{}, ErrNoBucket
	}
	if err := checkKey(r.Key); err != nil {
		return PutGrant{}, err
	}
	contentType := strings.TrimSpace(r.ContentType)
	if contentType == "" {
		return PutGrant{}, ErrNoContentType
	}
	if r.ContentLength < 0 {
		return PutGrant{}, fmt.Errorf("%w: got %d", ErrNoLength, r.ContentLength)
	}
	checksum, err := ChecksumBase64(r.SHA256Hex)
	if err != nil {
		return PutGrant{}, err
	}
	if err := checkExpiry(r.Expires); err != nil {
		return PutGrant{}, err
	}

	signed, err := c.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:         aws.String(c.bucket),
		Key:            aws.String(r.Key),
		ContentType:    aws.String(contentType),
		ContentLength:  aws.Int64(r.ContentLength),
		ChecksumSHA256: aws.String(checksum),
	}, s3.WithPresignExpires(r.Expires))
	if err != nil {
		return PutGrant{}, fmt.Errorf("blob: presign put: %w", err)
	}

	bindings := map[string]string{
		HeaderContentLength: strconv.FormatInt(r.ContentLength, 10),
		HeaderContentType:   contentType,
		HeaderChecksum:      checksum,
	}
	if err := assertBound(signed.URL, signed.SignedHeader, bindings); err != nil {
		if r.ContentLength == 0 {
			return PutGrant{}, fmt.Errorf("%w: %w", err, ErrZeroLength)
		}
		return PutGrant{}, err
	}

	headers, err := requiredHeaders(signed.URL, signed.SignedHeader)
	if err != nil {
		return PutGrant{}, err
	}
	return PutGrant{URL: signed.URL, Headers: headers}, nil
}

func (c *Client) Put(ctx context.Context, r PutStream) (err error) {
	defer func() { err = c.guard(err) }()

	if c == nil {
		return ErrNoBucket
	}
	if err := checkKey(r.Key); err != nil {
		return err
	}
	contentType := strings.TrimSpace(r.ContentType)
	if contentType == "" {
		return ErrNoContentType
	}
	if r.ContentLength < 0 {
		return fmt.Errorf("%w: got %d", ErrNoLength, r.ContentLength)
	}
	if r.Body == nil {
		return ErrNoBody
	}
	checksum, err := ChecksumBase64(r.SHA256Hex)
	if err != nil {
		return err
	}

	if _, err := c.api.PutObject(ctx, &s3.PutObjectInput{
		Bucket:         aws.String(c.bucket),
		Key:            aws.String(r.Key),
		ContentType:    aws.String(contentType),
		ContentLength:  aws.Int64(r.ContentLength),
		ChecksumSHA256: aws.String(checksum),
		Body:           declaredLength{Reader: r.Body, size: r.ContentLength},
	}, withoutReplay, signingKnownPayload(strings.ToLower(strings.TrimSpace(r.SHA256Hex)))); err != nil {
		return fmt.Errorf("blob: put %q: %w", r.Key, err)
	}
	return nil
}

func withoutReplay(o *s3.Options) { o.RetryMaxAttempts = 1 }

const payloadHashStep = "ComputePayloadHash"

func signingKnownPayload(sha256Hex string) func(*s3.Options) {
	declare := middleware.FinalizeMiddlewareFunc("blob:DeclaredPayloadHash",
		func(ctx context.Context, in middleware.FinalizeInput, next middleware.FinalizeHandler) (
			middleware.FinalizeOutput, middleware.Metadata, error) {
			return next.HandleFinalize(v4.SetPayloadHash(ctx, sha256Hex), in)
		})

	return func(o *s3.Options) {
		o.APIOptions = append(o.APIOptions, func(stack *middleware.Stack) error {
			return stack.Finalize.Insert(declare, payloadHashStep, middleware.Before)
		})
	}
}

type declaredLength struct {
	io.Reader
	size int64
}

func (d declaredLength) Len() int { return int(d.size) }

func (c *Client) PresignGet(ctx context.Context, key string, expires time.Duration) (raw string, err error) {
	defer func() { err = c.guard(err) }()

	if c == nil {
		return "", ErrNoBucket
	}
	if err := checkKey(key); err != nil {
		return "", err
	}
	if err := checkExpiry(expires); err != nil {
		return "", err
	}

	signed, err := c.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(expires))
	if err != nil {
		return "", fmt.Errorf("blob: presign get: %w", err)
	}
	return signed.URL, nil
}

func (c *Client) Get(ctx context.Context, r GetRequest) (stream ObjectStream, err error) {
	defer func() { err = c.guard(err) }()

	if c == nil {
		return ObjectStream{}, ErrNoBucket
	}
	if err := checkKey(r.Key); err != nil {
		return ObjectStream{}, err
	}

	in := &s3.GetObjectInput{Bucket: aws.String(c.bucket), Key: aws.String(r.Key)}
	if span := strings.TrimSpace(r.Range); span != "" {
		in.Range = aws.String(span)
	}

	out, err := c.api.GetObject(ctx, in)
	if err != nil {
		if isNotFound(err) {
			return ObjectStream{}, fmt.Errorf("%w: %q", ErrNoObject, r.Key)
		}
		if isRangeRefused(err) {
			return ObjectStream{}, fmt.Errorf("%w: %q", ErrRangeRefused, r.Range)
		}
		return ObjectStream{}, fmt.Errorf("blob: get %q: %w", r.Key, err)
	}

	stream = ObjectStream{Body: out.Body}
	if out.ContentLength != nil {
		stream.ContentLength = *out.ContentLength
	}
	if out.ContentType != nil {
		stream.ContentType = *out.ContentType
	}
	if out.ContentRange != nil {
		stream.ContentRange = *out.ContentRange
		stream.Partial = true
	}
	return stream, nil
}

func (c *Client) Head(ctx context.Context, key string) (info ObjectInfo, err error) {
	defer func() { err = c.guard(err) }()

	if c == nil {
		return ObjectInfo{}, ErrNoBucket
	}
	if err := checkKey(key); err != nil {
		return ObjectInfo{}, err
	}

	out, err := c.api.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket:       aws.String(c.bucket),
		Key:          aws.String(key),
		ChecksumMode: types.ChecksumModeEnabled,
	})
	if err != nil {
		if isNotFound(err) {
			return ObjectInfo{}, nil
		}
		return ObjectInfo{}, fmt.Errorf("blob: head %q: %w", key, err)
	}

	info = ObjectInfo{Exists: true}
	if out.ContentLength != nil {
		info.ContentLength = *out.ContentLength
	}
	if out.ContentType != nil {
		info.ContentType = *out.ContentType
	}
	if out.ChecksumSHA256 != nil {
		info.SHA256Hex, err = ChecksumHex(*out.ChecksumSHA256)
		if err != nil {
			return ObjectInfo{}, fmt.Errorf("blob: head %q: %w", key, err)
		}
	}
	return info, nil
}

func (c *Client) Delete(ctx context.Context, key string) (err error) {
	defer func() { err = c.guard(err) }()

	if c == nil {
		return ErrNoBucket
	}
	if err := checkKey(key); err != nil {
		return err
	}

	if _, err := c.api.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}); err != nil {
		if isNotFound(err) {
			return nil
		}
		return fmt.Errorf("blob: delete %q: %w", key, err)
	}
	return nil
}

func ChecksumBase64(sha256Hex string) (string, error) {
	if len(sha256Hex) != 64 {
		return "", fmt.Errorf("%w: got %d characters", ErrChecksum, len(sha256Hex))
	}
	raw, err := hex.DecodeString(sha256Hex)
	if err != nil {
		return "", fmt.Errorf("%w: it is not hexadecimal", ErrChecksum)
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}

func ChecksumHex(sha256Base64 string) (string, error) {
	value := strings.TrimSpace(sha256Base64)
	if value == "" || isCompositeChecksum(value) {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return "", fmt.Errorf("%w: it is not base64", ErrChecksumReply)
	}
	if len(raw) != sha256.Size {
		return "", fmt.Errorf("%w: it decodes to %d bytes, not %d", ErrChecksumReply, len(raw), sha256.Size)
	}
	return hex.EncodeToString(raw), nil
}

func isCompositeChecksum(sha256Base64 string) bool {
	return strings.Contains(sha256Base64, "-")
}

func staticCredentials(creds tenancy.S3Credentials) aws.CredentialsProvider {
	keyID := creds.AccessKeyID
	secret := creds.SecretAccessKey
	return aws.CredentialsProviderFunc(func(context.Context) (aws.Credentials, error) {
		return aws.Credentials{
			AccessKeyID:     keyID,
			SecretAccessKey: secret,
			Source:          "emerge-core/tenancy",
		}, nil
	})
}

func checkKey(key string) error {
	if key == "" {
		return ErrNoKey
	}
	if len(key) > MaxKeySize {
		return fmt.Errorf("%w: %d bytes is over the %d byte limit", ErrKeyRejected, len(key), MaxKeySize)
	}
	if strings.HasPrefix(key, "/") {
		return fmt.Errorf("%w: it may not start with a slash", ErrKeyRejected)
	}
	if strings.Contains(key, "\x00") {
		return fmt.Errorf("%w: it contains a null byte", ErrKeyRejected)
	}
	return nil
}

func checkExpiry(d time.Duration) error {
	if d <= 0 || d > MaxExpiry {
		return fmt.Errorf("%w: got %s", ErrExpiry, d)
	}
	return nil
}

func signedHeaderNames(rawURL string) ([]string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("%w: the presigned url does not parse", ErrUnbound)
	}
	list := u.Query().Get("X-Amz-SignedHeaders")
	if list == "" {
		return nil, fmt.Errorf("%w: the url signs no headers at all", ErrUnbound)
	}

	names := make([]string, 0, 8)
	for _, h := range strings.Split(list, ";") {
		if h = strings.ToLower(strings.TrimSpace(h)); h != "" {
			names = append(names, h)
		}
	}
	return names, nil
}

func assertBound(rawURL string, signed http.Header, want map[string]string) error {
	names, err := signedHeaderNames(rawURL)
	if err != nil {
		return err
	}

	present := make(map[string]bool, len(names))
	for _, name := range names {
		present[name] = true
	}

	for _, name := range []string{HeaderContentLength, HeaderContentType, HeaderChecksum} {
		if !present[name] {
			return fmt.Errorf("%w: %s is not a signed header", ErrUnbound, name)
		}
		if got := signed.Get(name); got != want[name] {
			return fmt.Errorf("%w: %s was signed as %q, not %q", ErrUnbound, name, got, want[name])
		}
	}
	return nil
}

func requiredHeaders(rawURL string, signed http.Header) (map[string]string, error) {
	names, err := signedHeaderNames(rawURL)
	if err != nil {
		return nil, err
	}

	headers := make(map[string]string, len(names))
	for _, name := range names {
		if name == "host" {
			continue
		}
		value := signed.Get(name)
		if value == "" {
			return nil, fmt.Errorf("%w: %s is signed but carries no value", ErrUnbound, name)
		}
		headers[name] = value
	}
	return headers, nil
}

func isRangeRefused(err error) bool {
	var resp *awshttp.ResponseError
	if errors.As(err, &resp) && resp.HTTPStatusCode() == http.StatusRequestedRangeNotSatisfiable {
		return true
	}
	var api smithy.APIError
	return errors.As(err, &api) && api.ErrorCode() == "InvalidRange"
}

func isNotFound(err error) bool {
	var missing *types.NotFound
	if errors.As(err, &missing) {
		return true
	}
	var noSuchKey *types.NoSuchKey
	if errors.As(err, &noSuchKey) {
		return true
	}
	var resp *awshttp.ResponseError
	if errors.As(err, &resp) && resp.HTTPStatusCode() == http.StatusNotFound {
		return true
	}
	var api smithy.APIError
	if errors.As(err, &api) {
		switch api.ErrorCode() {
		case "NotFound", "NoSuchKey":
			return true
		}
	}
	return false
}

var bearerMarkers = []string{
	"x-amz-signature",
	"x-amz-credential",
	"x-amz-security-token",
	"x-amz-signedheaders",
	"x-amz-algorithm",
}

func stripSignedURLs(msg string) string {
	var out strings.Builder
	rest := msg
	for {
		i := strings.Index(rest, "://")
		if i < 0 {
			out.WriteString(rest)
			return out.String()
		}
		out.WriteString(rest[:i+len("://")])
		rest = rest[i+len("://"):]

		end := strings.IndexAny(rest, " \t\r\n\"'")
		if end < 0 {
			end = len(rest)
		}
		token, tail := rest[:end], rest[end:]
		if q := strings.IndexByte(token, '?'); q >= 0 {
			token = token[:q] + "?REDACTED"
		}
		out.WriteString(token)
		rest = tail
	}
}

func carriesBearerMaterial(msg string) bool {
	lower := strings.ToLower(msg)
	for _, marker := range bearerMarkers {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func (c *Client) guard(err error) error {
	if err == nil {
		return nil
	}

	msg := err.Error()
	clean := msg
	if c != nil && c.secret != "" {
		clean = strings.ReplaceAll(clean, c.secret, "REDACTED")
	}
	clean = stripSignedURLs(clean)

	if carriesBearerMaterial(clean) {
		return ErrWithheld
	}
	if clean == msg {
		return err
	}
	return errors.New(clean)
}
