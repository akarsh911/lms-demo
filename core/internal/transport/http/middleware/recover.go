package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

func Recoverer(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				rec := recover()
				if rec == nil {
					return
				}
				if err, ok := rec.(error); ok && err == http.ErrAbortHandler {
					panic(rec)
				}
				logger.Error("panic recovered",
					"error", rec,
					"path", r.URL.Path,
					"request_id", chimw.GetReqID(r.Context()),
					"stack", string(debug.Stack()),
				)
				response.Error(w, http.StatusInternalServerError, "something went wrong")
			}()
			next.ServeHTTP(w, r)
		})
	}
}
