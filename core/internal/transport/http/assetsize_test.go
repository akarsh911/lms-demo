package http

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
)

func TestMaxAssetBytesIsTwoHundredBinaryMegabytes(t *testing.T) {
	if MaxAssetBytes != 209715200 {
		t.Fatalf("the cap must be the 200m nginx and the Next proxy enforce, got %d", MaxAssetBytes)
	}
}

func TestCreateAssetAcceptsEverythingUpToTheCap(t *testing.T) {
	cases := []struct {
		name string
		size int64
	}{
		{"comfortably under the cap", 5 << 20},
		{"one byte under the cap", MaxAssetBytes - 1},
		{"exactly at the cap", MaxAssetBytes},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			createdAsset(t, fx, assetUpload(map[string]any{"size_bytes": tc.size}))

			if insert := fx.onlyWrite("assets"); !insert.carries(tc.size) {
				t.Fatalf("the stored row must keep the declared %d bytes, got %v",
					tc.size, insert.args)
			}
			if fx.store.put.ContentLength != tc.size {
				t.Fatalf("the upload link must be signed for %d bytes, got %d",
					tc.size, fx.store.put.ContentLength)
			}
		})
	}
}

func TestCreateAssetRefusesAnAssetOverTheCap(t *testing.T) {
	cases := []struct {
		name    string
		size    int64
		declare string
	}{
		{"one byte over the cap", MaxAssetBytes + 1, "209715201 bytes"},
		{"a file a person would actually try", 350 << 20, "350 MB"},
		{"a file that is absurd", 12 << 30, "12 GB"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)

			w := fx.call(fx.server.createAsset, "POST", "/api/v1/library/assets",
				libraryBody(assetUpload(map[string]any{"size_bytes": tc.size})), uuid.Nil)

			wantLibraryRefusal(t, w, http.StatusUnprocessableEntity,
				"200 MB", tc.declare, "create the asset again")
			if got := refusalCode(t, w); got != AssetTooLargeCode {
				t.Fatalf("want code %q, got %q", AssetTooLargeCode, got)
			}
			fx.refusedBefore("assets")
			if fx.store.put.Key != "" {
				t.Fatalf("nothing may be signed for an asset that is refused, got %q",
					fx.store.put.Key)
			}
		})
	}
}

func TestUploadRefusesARowRecordedBeforeTheCapWithoutReadingItsBody(t *testing.T) {
	fx := newLibraryFixture(t)

	id := uuid.New()
	row := libraryAssetRowIn(id, fx.person, entasset.StatusPending)
	row["size_bytes"] = MaxAssetBytes + 1
	fx.driver.tables["assets"] = []map[string]any{row}

	body := &countingReader{src: strings.NewReader("the first chunk of a very large file")}
	w := fx.upload(id, body, -1)

	wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, "200 MB", "209715201 bytes")
	if got := refusalCode(t, w); got != AssetTooLargeCode {
		t.Fatalf("want code %q, got %q", AssetTooLargeCode, got)
	}
	if body.read != 0 {
		t.Fatalf("the refusal must land before any byte is read, got %d bytes", body.read)
	}
	if len(fx.store.written) != 0 {
		t.Fatalf("nothing may reach the object store, got %d writes", len(fx.store.written))
	}
}

type countingReader struct {
	src  *strings.Reader
	read int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.src.Read(p)
	c.read += int64(n)
	return n, err
}

func TestHumanBytesReadsTheWayAPersonWouldSayIt(t *testing.T) {
	cases := []struct {
		size int64
		want string
	}{
		{0, "0 bytes"},
		{1, "1 bytes"},
		{1023, "1023 bytes"},
		{1024, "1 KB"},
		{1536, "1.5 KB"},
		{MaxAssetBytes, "200 MB"},
		{MaxAssetBytes + 1, "200 MB"},
		{350 << 20, "350 MB"},
		{367462400, "350.4 MB"},
		{1 << 30, "1 GB"},
		{1 << 40, "1 TB"},
		{1 << 50, "1024 TB"},
	}

	for _, tc := range cases {
		if got := humanBytes(tc.size); got != tc.want {
			t.Fatalf("humanBytes(%d) = %q, want %q", tc.size, got, tc.want)
		}
	}
}

func TestTheRefusalNamesBothTheCapAndTheExactSizeAsked(t *testing.T) {
	msg := assetTooLarge(MaxAssetBytes + 1)

	for _, want := range []string{"at most 200 MB", "209715201 bytes", "under 200 MB"} {
		if !strings.Contains(msg, want) {
			t.Fatalf("the refusal must carry %q, got %q", want, msg)
		}
	}
}
