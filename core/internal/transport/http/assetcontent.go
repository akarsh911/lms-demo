package http

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const assetDownloadWindow = 30 * time.Minute

const AssetRangeUnsatisfiableCode = "asset_range_unsatisfiable"

type byteSpan struct {
	start int64
	end   int64
}

func (b byteSpan) length() int64 { return b.end - b.start + 1 }

func (b byteSpan) requestHeader() string {
	return fmt.Sprintf("bytes=%d-%d", b.start, b.end)
}

func (b byteSpan) contentRange(size int64) string {
	return fmt.Sprintf("bytes %d-%d/%d", b.start, b.end, size)
}

func parseByteSpan(header string, size int64) (span byteSpan, partial, satisfiable bool) {
	whole := byteSpan{start: 0, end: size - 1}
	unranged := func() (byteSpan, bool, bool) { return whole, false, true }

	spec, found := strings.CutPrefix(strings.TrimSpace(header), "bytes=")
	if !found || strings.Contains(spec, ",") {
		return unranged()
	}
	first, last, found := strings.Cut(strings.TrimSpace(spec), "-")
	if !found {
		return unranged()
	}
	first, last = strings.TrimSpace(first), strings.TrimSpace(last)

	if first == "" {
		if last == "" {
			return unranged()
		}
		suffix, err := strconv.ParseInt(last, 10, 64)
		if err != nil || suffix < 0 {
			return unranged()
		}
		if suffix == 0 || size == 0 {
			return byteSpan{}, true, false
		}
		if suffix > size {
			suffix = size
		}
		return byteSpan{start: size - suffix, end: size - 1}, true, true
	}

	start, err := strconv.ParseInt(first, 10, 64)
	if err != nil || start < 0 {
		return unranged()
	}
	end := size - 1
	if last != "" {
		stated, err := strconv.ParseInt(last, 10, 64)
		if err != nil || stated < start {
			return unranged()
		}
		if stated < end {
			end = stated
		}
	}
	if size == 0 || start > end {
		return byteSpan{}, true, false
	}
	return byteSpan{start: start, end: end}, true, true
}

func assetContentType(declared string) string {
	if trimmed := strings.TrimSpace(declared); trimmed != "" {
		return trimmed
	}
	return "application/octet-stream"
}

func printableFileName(name string) string {
	stripped := strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, name)
	if cut := strings.LastIndexAny(stripped, "/\\"); cut >= 0 {
		stripped = stripped[cut+1:]
	}
	stripped = strings.TrimSpace(stripped)
	if stripped == "." || stripped == ".." {
		return ""
	}
	return stripped
}

var renderableInline = map[string]bool{
	"application/pdf":   true,
	"application/x-pdf": true,
	"image/avif":        true,
	"image/bmp":         true,
	"image/gif":         true,
	"image/jpeg":        true,
	"image/png":         true,
	"image/webp":        true,
}

func servedInline(contentType string) bool {
	base, _, _ := strings.Cut(contentType, ";")
	return renderableInline[strings.ToLower(strings.TrimSpace(base))]
}

func assetDisposition(kind, name string, id uuid.UUID) string {
	shown := printableFileName(name)
	if shown == "" {
		shown = id.String()
	}
	formatted := mime.FormatMediaType(kind, map[string]string{"filename": shown})
	if formatted == "" {
		return kind
	}
	return formatted
}

func holdOpenForDownload(w http.ResponseWriter) {
	until := nowUTC().Add(assetDownloadWindow)
	control := http.NewResponseController(w)
	_ = control.SetWriteDeadline(until)
}

func writeUnsatisfiableRange(w http.ResponseWriter, size int64) {
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Content-Range", "bytes */"+strconv.FormatInt(size, 10))
	writeAssetRefusal(w, http.StatusRequestedRangeNotSatisfiable, AssetRangeUnsatisfiableCode,
		fmt.Sprintf("this asset holds %d bytes, so that byte range cannot be served", size))
}

func writeAssetStreamErr(w http.ResponseWriter, err error, size int64) {
	switch {
	case errors.Is(err, blob.ErrNoObject):
		writeAssetRefusal(w, http.StatusConflict, AssetObjectMissingCode,
			"nothing has been uploaded for this asset yet")
	case errors.Is(err, blob.ErrRangeRefused):
		writeUnsatisfiableRange(w, size)
	default:
		writeObjectStoreErr(w, err)
	}
}

func (s *Server) getAssetContent(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), assetDownloadWindow)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := scopedAsset(client, id, viewer, decision).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "asset not found")
		return
	}
	if row.Status != entasset.StatusReady {
		response.Error(w, http.StatusConflict, unreadableAsset(row.Status))
		return
	}

	span, partial, satisfiable := parseByteSpan(r.Header.Get("Range"), row.SizeBytes)
	if !satisfiable {
		writeUnsatisfiableRange(w, row.SizeBytes)
		return
	}

	store, ok := s.objectStore(ctx, w)
	if !ok {
		return
	}

	ask := blob.GetRequest{Key: row.StorageKey}
	if partial {
		ask.Range = span.requestHeader()
	}
	stream, err := store.Get(ctx, ask)
	if err != nil {
		writeAssetStreamErr(w, err, row.SizeBytes)
		return
	}
	if stream.Body == nil {
		response.ServerError(w, errors.New("the object store returned no body for a readable asset"))
		return
	}
	defer stream.Body.Close()

	if stream.ContentLength != span.length() {
		writeAssetRefusal(w, http.StatusConflict, AssetSizeMismatchCode, fmt.Sprintf(
			"the object store offered %d bytes where this asset records %d",
			stream.ContentLength, span.length()))
		return
	}

	holdOpenForDownload(w)

	contentType := assetContentType(row.MimeType)
	disposition := "attachment"
	if servedInline(contentType) {
		disposition = "inline"
	}

	head := w.Header()
	head.Set("Content-Type", contentType)
	head.Set("Content-Disposition", assetDisposition(disposition, row.FileName, row.ID))
	head.Set("Content-Length", strconv.FormatInt(span.length(), 10))
	head.Set("Accept-Ranges", "bytes")
	head.Set("Cache-Control", "private, no-store")
	head.Set("X-Content-Type-Options", "nosniff")
	if disposition != "inline" {
		head.Set("Content-Security-Policy", "sandbox")
	}
	if partial {
		head.Set("Content-Range", span.contentRange(row.SizeBytes))
		w.WriteHeader(http.StatusPartialContent)
	} else {
		w.WriteHeader(http.StatusOK)
	}

	sent, err := io.Copy(w, stream.Body)
	if err != nil {
		observability.Step(ctx, observability.ComponentData, "asset content stream broke",
			"asset_id", row.ID, "storage_key", row.StorageKey,
			"sent_bytes", sent, "why", withoutSignedURLs(err).Error())
		return
	}
	observability.Step(ctx, observability.ComponentData, "asset content served",
		"asset_id", row.ID, "storage_key", row.StorageKey,
		"sent_bytes", sent, "partial", partial)
}
