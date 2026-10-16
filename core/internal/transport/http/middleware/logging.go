package middleware

import (
	"log/slog"
	"net/http"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/Harbour-Emerge/emerge-core/internal/observability"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *statusRecorder) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusRecorder) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += n
	return n, err
}

func RequestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

			requestID := chimw.GetReqID(r.Context())
			ctx := observability.WithStart(r.Context(), start)
			ctx = observability.WithLogger(ctx, logger.With(
				"request_id", requestID,
				"method", r.Method,
				"path", r.URL.Path,
			))
			if school := r.Header.Get(SchoolHeader); school != "" {
				ctx = observability.With(ctx, "school", school)
			}
			r = r.WithContext(ctx)

			observability.Step(ctx, observability.ComponentHTTP, "request started",
				"remote_addr", r.RemoteAddr)

			next.ServeHTTP(rec, r)

			attrs := []any{
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"bytes", rec.bytes,
				"duration_ms", time.Since(start).Milliseconds(),
				"request_id", requestID,
				"component", observability.ComponentHTTP,
			}
			if school := r.Header.Get(SchoolHeader); school != "" {
				attrs = append(attrs, "school", school)
			}

			switch {
			case rec.status >= 500:
				logger.Error("request", attrs...)
			case rec.status >= 400:
				logger.Warn("request", attrs...)
			default:
				logger.Info("request", attrs...)
			}
		})
	}
}
