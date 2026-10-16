package http

import (
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func mountedPatterns(t *testing.T) map[string]bool {
	t.Helper()

	router, _ := offlineRouter(t)
	routes, ok := router.(chi.Routes)
	if !ok {
		t.Fatal("the router is no longer a chi.Routes, so its shape cannot be walked")
	}

	found := map[string]bool{}
	err := chi.Walk(routes, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		found[method+" "+route] = true
		return nil
	})
	if err != nil {
		t.Fatalf("walking the router: %v", err)
	}
	return found
}

func TestTimetableAndAttendanceAreMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	want := []string{
		"GET /api/v1/timetables",
		"POST /api/v1/timetables",
		"GET /api/v1/timetable-occurrences",
		"POST /api/v1/timetables/{id}/clash-check",
		"POST /api/v1/timetables/{id}/generate",
		"GET /api/v1/timetables/{id}/generate/{job}",
		"GET /api/v1/rooms",
		"GET /api/v1/calendar-days",
		"GET /api/v1/attendance/register",
		"POST /api/v1/attendance/register",
		"GET /api/v1/attendance/periods",
		"GET /api/v1/attendance/days",
	}

	for _, pattern := range want {
		if !found[pattern] && !found[pattern+"/"] {
			var near []string
			verb := strings.Fields(pattern)[0]
			for got := range found {
				if strings.HasPrefix(got, verb) && strings.Contains(got, strings.Split(pattern, "/")[3]) {
					near = append(near, got)
				}
			}
			t.Errorf("%s is not mounted on the real router, so the handler is unreachable however well it is tested; nearest mounted: %v",
				pattern, near)
		}
	}
}
