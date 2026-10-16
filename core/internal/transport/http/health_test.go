package http

import (
	"strings"
	"testing"
	"time"

	"github.com/Harbour-Emerge/emerge-core/internal/service/mail"
)

type stubMail struct {
	healthy   bool
	platform  bool
	stale     time.Duration
	stats     mail.Stats
	askedWith time.Time
}

func (s *stubMail) Healthy(now time.Time) bool {
	s.askedWith = now
	return s.healthy
}

func (s *stubMail) StaleAfter() time.Duration { return s.stale }

func (s *stubMail) Stats() mail.Stats { return s.stats }

func (s *stubMail) PlatformConfigured() bool { return s.platform }

func TestAServerWithNoSenderSaysSoRatherThanClaimingHealth(t *testing.T) {
	report := (&Server{}).WithMail(nil, MailUnavailable).mailHealth(time.Now())

	if running, _ := report["running"].(bool); running {
		t.Fatalf("a process running no sender reported running=true: %v", report)
	}
	if _, stated := report["reason"]; !stated {
		t.Fatalf("no sender runs and no reason was given: %v", report)
	}
	if _, leaked := report["ticks"]; leaked {
		t.Fatalf("stats were reported for a sender that does not exist: %v", report)
	}
}

func TestADisabledSenderIsDistinguishedFromOneThatFailedToBuild(t *testing.T) {
	off := (&Server{}).WithMail(nil, MailDisabled).mailHealth(time.Now())
	broken := (&Server{}).WithMail(nil, MailUnavailable).mailHealth(time.Now())

	if off["state"] != MailDisabled {
		t.Errorf("state = %v, want %q for a sender switched off", off["state"], MailDisabled)
	}
	if broken["state"] != MailUnavailable {
		t.Errorf("state = %v, want %q for a sender that could not be built", broken["state"], MailUnavailable)
	}
	if off["state"] == broken["state"] || off["reason"] == broken["reason"] {
		t.Fatal("a deployment choice and a construction failure report identically; an operator " +
			"seeing an empty outbox cannot tell which of the two they are looking at")
	}
	for _, report := range []map[string]any{off, broken} {
		reason, _ := report["reason"].(string)
		if !strings.Contains(reason, "expire") {
			t.Errorf("reason %q does not say that queued mail eventually expires, which is the "+
				"consequence the operator needs to know", reason)
		}
	}
}

func TestAnAbsentSenderWithNoStatedReasonIsTreatedAsBrokenNotChosen(t *testing.T) {
	report := (&Server{}).WithMail(nil, "").mailHealth(time.Now())

	if report["state"] != MailUnavailable {
		t.Fatalf("state = %v, want %q: an unexplained absence is a fault until something says "+
			"otherwise, and defaulting it to a deliberate choice hides a broken sender",
			report["state"], MailUnavailable)
	}
}

func TestATypedNilSenderIsNotMistakenForARunningOne(t *testing.T) {
	var absent *mail.Sender

	srv := (&Server{}).WithMail(absent, MailUnavailable)

	if srv.mail != nil {
		t.Fatal("a nil *mail.Sender was stored as a live sender; every readiness probe would " +
			"then call Healthy on nil and the interface would report a sender that is not there")
	}
	if running, _ := srv.mailHealth(time.Now())["running"].(bool); running {
		t.Fatal("readiness claimed the mail sender was running when no sender was constructed")
	}
}

func TestAnUnhealthySenderIsReportedRatherThanHidden(t *testing.T) {
	stub := &stubMail{healthy: false, platform: true}
	stub.stats = mail.Stats{Ticks: 9, Sent: 4, Failed: 2, Retried: 1, OpenBreakers: 3}
	srv := (&Server{}).WithMail(stub, "")

	report := srv.mailHealth(time.Now())

	if running, _ := report["running"].(bool); running {
		t.Fatalf("an unhealthy sender reported running=true: %v", report)
	}
	for field, want := range map[string]any{
		"sent": int64(4), "failed": int64(2), "retried": int64(1), "open_breakers": 3,
	} {
		if report[field] != want {
			t.Errorf("%s = %v, want %v", field, report[field], want)
		}
	}
	if report["platform_fallback"] != true {
		t.Errorf("platform_fallback = %v, want true", report["platform_fallback"])
	}
}

func TestASenderThatHasNeverTickedReportsNoTickTime(t *testing.T) {
	srv := (&Server{}).WithMail(&stubMail{healthy: false}, "")

	report := srv.mailHealth(time.Now())

	if _, present := report["last_tick_at"]; present {
		t.Fatalf("a zero tick time was formatted and reported as a real timestamp: %v", report["last_tick_at"])
	}
}

func TestTheHealthProbeAsksAboutTheMomentItWasCalled(t *testing.T) {
	stub := &stubMail{healthy: true}
	at := time.Date(2026, 9, 9, 4, 30, 0, 0, time.UTC)

	(&Server{}).WithMail(stub, "").mailHealth(at)

	if !stub.askedWith.Equal(at) {
		t.Fatalf("Healthy was asked about %v, not the instant the probe ran (%v); a staleness "+
			"check against the wrong clock never reports a stalled sender", stub.askedWith, at)
	}
}

func TestTheStalenessWindowIsPublishedSoARaisedIntervalIsNotSilent(t *testing.T) {
	slow := &stubMail{healthy: true, stale: 3 * time.Hour}

	report := (&Server{}).WithMail(slow, "").mailHealth(time.Now())

	if report["stale_after"] != "3h0m0s" {
		t.Fatalf("stale_after = %v, want the sender's own window; the window scales with the tick "+
			"interval, so an operator who cannot see it cannot tell a healthy slow sender from a "+
			"check that stopped being able to fail", report["stale_after"])
	}
}
