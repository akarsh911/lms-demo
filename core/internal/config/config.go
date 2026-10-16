package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env  string
	Port string

	ControlDatabaseURL string

	SecretsMasterKey string

	CASBaseURL      string
	CASIssuer       string
	CASAudience     string
	CASServiceKey   string
	CASClientID     string
	CASClientSecret string
	CASPolicyTTL    time.Duration

	CASAuthProxy bool

	AuthDisabled bool

	PlatformSMTPHost       string
	PlatformSMTPPort       int
	PlatformSMTPUsername   string
	PlatformSMTPPassword   string
	PlatformSMTPEncryption string
	PlatformSMTPFromName   string
	PlatformSMTPFrom       string
	PlatformSMTPReplyTo    string

	RecipientHashPepper  string
	RecipientHashVersion int

	MailSenderEnabled  bool
	MailSenderInterval time.Duration
	MailSenderInstance string

	RetrievalIndexEnabled      bool
	RetrievalEngineBaseURL     string
	RetrievalEngineAdminToken  string
	RetrievalEngineTimeout     time.Duration
	RetrievalIndexPollInterval time.Duration
	RetrievalIndexPollTimeout  time.Duration
	RetrievalIndexWorkers      int

	RetrievalSearchEnabled bool

	RetrievalSweepEnabled    bool
	RetrievalSweepInterval   time.Duration
	RetrievalSweepPendingAge time.Duration
	RetrievalSweepRetryBase  time.Duration
	RetrievalSweepRetryCap   time.Duration
	RetrievalSweepBatch      int
	RetrievalSweepPerTenant  int

	TimetableSolverEnabled    bool
	TimetableSolverBaseURL    string
	TimetableSolverToken      string
	TimetableSolverTimeout    time.Duration
	TimetableSolverMaxSeconds int
	TimetableSolverWorkers    int
	TimetableSolverQueue      int

	MindmapEnabled       bool
	MindmapEngineBaseURL string
	MindmapEngineTimeout time.Duration

	LogLevel  string
	LogFormat string

	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	IdleTimeout     time.Duration
	ShutdownTimeout time.Duration
}

func Load() (*Config, error) {
	LoadDotEnv()

	cfg := &Config{
		Env:                strings.ToLower(strings.TrimSpace(env("APP_ENV", "development"))),
		Port:               env("PORT", "8081"),
		ControlDatabaseURL: env("CONTROL_DATABASE_URL", ""),
		SecretsMasterKey:   env("SECRETS_MASTER_KEY", ""),
		CASBaseURL:         env("CAS_BASE_URL", ""),
		CASIssuer:          env("CAS_ISSUER", ""),
		CASAudience:        env("CAS_AUDIENCE", "mentis"),
		CASServiceKey:      env("CAS_SERVICE_KEY", "core"),
		CASClientID:        env("CAS_CLIENT_ID", ""),
		CASClientSecret:    env("CAS_CLIENT_SECRET", ""),
		CASPolicyTTL:       duration("CAS_POLICY_TTL", 60*time.Second),
		CASAuthProxy:       boolEnv("CAS_AUTH_PROXY", true),
		AuthDisabled:       boolEnv("AUTH_DISABLED", false),

		PlatformSMTPHost:       env("PLATFORM_SMTP_HOST", ""),
		PlatformSMTPPort:       intEnv("PLATFORM_SMTP_PORT", 0),
		PlatformSMTPUsername:   env("PLATFORM_SMTP_USERNAME", ""),
		PlatformSMTPPassword:   env("PLATFORM_SMTP_PASSWORD", ""),
		PlatformSMTPEncryption: strings.ToLower(strings.TrimSpace(env("PLATFORM_SMTP_ENCRYPTION", ""))),
		PlatformSMTPFromName:   env("PLATFORM_SMTP_FROM_NAME", "Emerge"),
		PlatformSMTPFrom:       env("PLATFORM_SMTP_FROM_ADDRESS", ""),
		PlatformSMTPReplyTo:    env("PLATFORM_SMTP_REPLY_TO", ""),

		RecipientHashPepper:  env("RECIPIENT_HASH_PEPPER", ""),
		RecipientHashVersion: intEnv("RECIPIENT_HASH_VERSION", 1),

		MailSenderEnabled:  boolEnv("MAIL_SENDER_ENABLED", true),
		MailSenderInterval: duration("MAIL_SENDER_INTERVAL", 10*time.Second),
		MailSenderInstance: env("MAIL_SENDER_INSTANCE_ID", ""),

		RetrievalIndexEnabled:      boolEnv("RETRIEVAL_INDEX_ENABLED", false),
		RetrievalEngineBaseURL:     env("RETRIEVAL_ENGINE_BASE_URL", ""),
		RetrievalEngineAdminToken:  env("RETRIEVAL_ENGINE_ADMIN_TOKEN", ""),
		RetrievalEngineTimeout:     duration("RETRIEVAL_ENGINE_TIMEOUT", 60*time.Second),
		RetrievalIndexPollInterval: duration("RETRIEVAL_INDEX_POLL_INTERVAL", 2*time.Second),
		RetrievalIndexPollTimeout:  duration("RETRIEVAL_INDEX_POLL_TIMEOUT", 15*time.Minute),
		RetrievalIndexWorkers:      intEnv("RETRIEVAL_INDEX_WORKERS", 2),

		RetrievalSearchEnabled: boolEnv("RETRIEVAL_SEARCH_ENABLED", false),

		RetrievalSweepEnabled:    boolEnv("RETRIEVAL_SWEEP_ENABLED", true),
		RetrievalSweepInterval:   duration("RETRIEVAL_SWEEP_INTERVAL", 5*time.Minute),
		RetrievalSweepPendingAge: duration("RETRIEVAL_SWEEP_PENDING_AGE", 30*time.Minute),
		RetrievalSweepRetryBase:  duration("RETRIEVAL_SWEEP_RETRY_BASE", 5*time.Minute),
		RetrievalSweepRetryCap:   duration("RETRIEVAL_SWEEP_RETRY_CAP", 6*time.Hour),
		RetrievalSweepBatch:      intEnv("RETRIEVAL_SWEEP_BATCH", 32),
		RetrievalSweepPerTenant:  intEnv("RETRIEVAL_SWEEP_PER_TENANT", 8),

		TimetableSolverEnabled:    boolEnv("TIMETABLE_SOLVER_ENABLED", false),
		TimetableSolverBaseURL:    env("TIMETABLE_SOLVER_BASE_URL", ""),
		TimetableSolverToken:      env("TIMETABLE_SOLVER_TOKEN", ""),
		TimetableSolverTimeout:    duration("TIMETABLE_SOLVER_TIMEOUT", 5*time.Minute),
		TimetableSolverMaxSeconds: intEnv("TIMETABLE_SOLVER_MAX_SECONDS", 60),
		TimetableSolverWorkers:    intEnv("TIMETABLE_SOLVER_WORKERS", 1),
		TimetableSolverQueue:      intEnv("TIMETABLE_SOLVER_QUEUE", 16),

		MindmapEnabled:       boolEnv("MINDMAP_ENABLED", false),
		MindmapEngineBaseURL: env("MINDMAP_ENGINE_BASE_URL", ""),
		MindmapEngineTimeout: duration("MINDMAP_ENGINE_TIMEOUT", 30*time.Second),

		LogLevel:        strings.ToLower(env("LOG_LEVEL", "info")),
		LogFormat:       strings.ToLower(env("LOG_FORMAT", "")),
		ReadTimeout:     duration("HTTP_READ_TIMEOUT", 10*time.Second),
		WriteTimeout:    duration("HTTP_WRITE_TIMEOUT", 30*time.Second),
		IdleTimeout:     duration("HTTP_IDLE_TIMEOUT", 120*time.Second),
		ShutdownTimeout: duration("HTTP_SHUTDOWN_TIMEOUT", 15*time.Second),
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *Config) AuthEnabled() bool { return !c.AuthDisabled && c.CASBaseURL != "" }

func (c *Config) RetrievalIndexing() bool {
	return c.RetrievalIndexEnabled && strings.TrimSpace(c.RetrievalEngineBaseURL) != ""
}

func (c *Config) RetrievalSearching() bool {
	return c.RetrievalSearchEnabled && strings.TrimSpace(c.RetrievalEngineBaseURL) != ""
}

func (c *Config) RetrievalSweeping() bool {
	return c.RetrievalIndexing() && c.RetrievalSweepEnabled
}

func (c *Config) TimetableGenerating() bool {
	return c.TimetableSolverEnabled &&
		strings.TrimSpace(c.TimetableSolverBaseURL) != "" &&
		strings.TrimSpace(c.TimetableSolverToken) != ""
}

func (c *Config) Mindmapping() bool {
	return c.MindmapEnabled && strings.TrimSpace(c.MindmapEngineBaseURL) != ""
}

func (c *Config) IsProduction() bool { return c.Env == "production" }

func (c *Config) validate() error {
	if _, err := strconv.Atoi(c.Port); err != nil {
		return fmt.Errorf("config: PORT must be numeric, got %q", c.Port)
	}
	if c.CASBaseURL == "" && !c.AuthDisabled {
		return errors.New("config: CAS_BASE_URL is required; set AUTH_DISABLED=true to run without authentication")
	}
	if c.AuthDisabled && c.IsProduction() {
		return errors.New("config: AUTH_DISABLED must not be set in production")
	}

	if c.RetrievalIndexEnabled && strings.TrimSpace(c.RetrievalEngineBaseURL) == "" {
		return errors.New("config: RETRIEVAL_ENGINE_BASE_URL is required when RETRIEVAL_INDEX_ENABLED is on")
	}
	if c.RetrievalSearchEnabled && strings.TrimSpace(c.RetrievalEngineBaseURL) == "" {
		return errors.New("config: RETRIEVAL_ENGINE_BASE_URL is required when RETRIEVAL_SEARCH_ENABLED is on")
	}
	if c.MindmapEnabled && strings.TrimSpace(c.MindmapEngineBaseURL) == "" {
		return errors.New("config: MINDMAP_ENGINE_BASE_URL is required when MINDMAP_ENABLED is on")
	}
	if c.TimetableSolverEnabled {
		if strings.TrimSpace(c.TimetableSolverBaseURL) == "" {
			return errors.New("config: TIMETABLE_SOLVER_BASE_URL is required when TIMETABLE_SOLVER_ENABLED is on")
		}
		if strings.TrimSpace(c.TimetableSolverToken) == "" {
			return errors.New("config: TIMETABLE_SOLVER_TOKEN is required when TIMETABLE_SOLVER_ENABLED is on; " +
				"the solver refuses an unauthenticated call and a caller that knows it has no token should not start")
		}
	}
	if c.IsProduction() {
		if c.ControlDatabaseURL == "" {
			return errors.New("config: CONTROL_DATABASE_URL is required in production")
		}
		if c.SecretsMasterKey == "" {
			return errors.New("config: SECRETS_MASTER_KEY is required in production")
		}
		if c.CASClientID == "" || c.CASClientSecret == "" {
			return errors.New("config: CAS_CLIENT_ID and CAS_CLIENT_SECRET are required in production")
		}
	}
	return nil
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func intEnv(key string, fallback int) int {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil {
		return fallback
	}
	return parsed
}

func boolEnv(key string, fallback bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return parsed
}

func duration(key string, fallback time.Duration) time.Duration {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

func LoadDotEnv() { loadDotEnv(".env") }

func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(strings.TrimPrefix(key, "export "))
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}
