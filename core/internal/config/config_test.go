package config

import (
	"strings"
	"testing"
)

func base() *Config {
	return &Config{
		Env:                "development",
		Port:               "8081",
		ControlDatabaseURL: "postgres://x",
		SecretsMasterKey:   "1:" + strings.Repeat("0", 64),
		CASBaseURL:         "https://cas.example",
		CASClientID:        "emerge-core-svc",
		CASClientSecret:    "secret",
	}
}

func TestMissingCASRefusesToStart(t *testing.T) {
	for _, env := range []string{"development", "staging", "prod", "Production", "test"} {
		cfg := base()
		cfg.Env = env
		cfg.CASBaseURL = ""

		if err := cfg.validate(); err == nil {
			t.Fatalf("APP_ENV=%q with no CAS must refuse to start", env)
		}
	}
}

func TestUnauthenticatedMustBeExplicit(t *testing.T) {
	cfg := base()
	cfg.CASBaseURL = ""
	cfg.AuthDisabled = true

	if err := cfg.validate(); err != nil {
		t.Fatalf("an explicit opt-out should be allowed outside production: %v", err)
	}
	if cfg.AuthEnabled() {
		t.Fatal("AuthEnabled must be false when authentication is disabled")
	}
}

func TestAuthCannotBeDisabledInProduction(t *testing.T) {
	cfg := base()
	cfg.Env = "production"
	cfg.AuthDisabled = true

	if err := cfg.validate(); err == nil {
		t.Fatal("AUTH_DISABLED must be refused in production")
	}
}

func TestAuthDisabledOverridesAConfiguredCAS(t *testing.T) {
	cfg := base()
	cfg.AuthDisabled = true

	if cfg.AuthEnabled() {
		t.Fatal("AUTH_DISABLED must win over a configured CAS_BASE_URL")
	}
}

func TestProductionIsMatchedAfterNormalising(t *testing.T) {
	cfg := base()
	cfg.Env = "production"
	if !cfg.IsProduction() {
		t.Fatal("production must be recognised")
	}
}

func TestMindmapsNeedBothTheFlagAndABaseURL(t *testing.T) {
	cfg := base()
	if cfg.Mindmapping() {
		t.Fatal("mind maps must be off until MINDMAP_ENABLED says otherwise")
	}

	cfg.MindmapEngineBaseURL = "http://mindmap:8200"
	if cfg.Mindmapping() {
		t.Fatal("a base URL alone must not switch mind maps on")
	}

	cfg.MindmapEnabled = true
	if err := cfg.validate(); err != nil {
		t.Fatalf("the flag with a base URL is the supported configuration: %v", err)
	}
	if !cfg.Mindmapping() {
		t.Fatal("the flag with a base URL must switch mind maps on")
	}

	cfg.MindmapEngineBaseURL = "   "
	if cfg.Mindmapping() {
		t.Fatal("a blank base URL must leave mind maps off")
	}
	err := cfg.validate()
	if err == nil {
		t.Fatal("MINDMAP_ENABLED with no base URL must refuse to start")
	}
	if !strings.Contains(err.Error(), "MINDMAP_ENGINE_BASE_URL") {
		t.Fatalf("the refusal must name the missing variable, got %v", err)
	}
}
