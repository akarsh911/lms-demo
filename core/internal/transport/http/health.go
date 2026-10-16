package http

import (
	"net/http"
	"time"

	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

func (s *Server) liveness(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, response.Envelope{
		"status":  "ok",
		"service": "emerge-core",
		"version": s.version,
	})
}

func (s *Server) index(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, response.Envelope{
		"service": "emerge-core",
		"version": s.version,
		"env":     s.cfg.Env,
		"routes": response.Envelope{
			"control": []string{"/api/v1/schools"},
			"tenant":  []string{"/api/v1/students"},
		},
		"tenant_header": "X-School-Id",
	})
}

func (s *Server) readiness(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	controlStatus, status := "ok", http.StatusOK
	if err := s.control.Ping(ctx); err != nil {
		controlStatus, status = err.Error(), http.StatusServiceUnavailable
	}

	body := response.Envelope{
		"status":        map[bool]string{true: "ok", false: "degraded"}[status == http.StatusOK],
		"service":       "emerge-core",
		"version":       s.version,
		"control_plane": controlStatus,
		"time":          time.Now().UTC().Format(time.RFC3339),
	}
	body["mail"] = s.mailHealth(time.Now())

	response.JSON(w, status, body)
}

func (s *Server) mailHealth(now time.Time) response.Envelope {
	if s.mail == nil {
		return response.Envelope{
			"running": false,
			"state":   s.mailAbsence,
			"reason":  mailAbsenceReason(s.mailAbsence),
		}
	}
	stats := s.mail.Stats()
	report := response.Envelope{
		"state":             "running",
		"running":           s.mail.Healthy(now),
		"platform_fallback": s.mail.PlatformConfigured(),
		"stale_after":       s.mail.StaleAfter().String(),
		"ticks":             stats.Ticks,
		"sent":              stats.Sent,
		"failed":            stats.Failed,
		"retried":           stats.Retried,
		"in_flight":         stats.InFlight,
		"open_breakers":     stats.OpenBreakers,
	}
	if !stats.LastTickAt.IsZero() {
		report["last_tick_at"] = stats.LastTickAt.UTC().Format(time.RFC3339)
	}
	return report
}

func mailAbsenceReason(state string) string {
	switch state {
	case MailDisabled:
		return "MAIL_SENDER_ENABLED is off, so nothing drains the outbox in this process; " +
			"anything enqueued waits until it passes expires_at and then fails as expired"
	default:
		return "the sender could not be built, so nothing drains the outbox in this process; " +
			"anything enqueued waits until it passes expires_at and then fails as expired"
	}
}
