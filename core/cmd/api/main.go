package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	_ "time/tzdata"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/config"
	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/service"
	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mail"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mindmap"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetablegen"
	transport "github.com/Harbour-Emerge/emerge-core/internal/transport/http"
)

var version = "dev"

func main() {
	if err := run(); err != nil {
		slog.Error("startup failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := newLogger(cfg)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.ControlDatabaseURL == "" {
		return errors.New("CONTROL_DATABASE_URL is required")
	}
	control, err := postgres.NewControl(ctx, cfg.ControlDatabaseURL, postgres.Options{})
	if err != nil {
		return err
	}
	defer control.Close()
	logger.Info("control plane connected")

	keyring, err := crypto.ParseKeyring(cfg.SecretsMasterKey)
	if err != nil {
		return err
	}

	registry := postgres.NewRegistry(control, keyring, postgres.Options{}, logger)
	defer registry.Close()

	verifier, guard, err := newAuth(ctx, cfg, logger)
	if err != nil {
		return err
	}
	logger.Info("authorization guard selected", "guard", guard.Name())

	authProxy, err := newAuthProxy(cfg, logger)
	if err != nil {
		return err
	}

	provisioner := newProvisioner(cfg, guard, logger)
	tenants := newTenantProvisioner(cfg, logger)

	sender, mailAbsence := newMailSender(cfg, control.Client, keyring, logger)
	if sender != nil {
		defer sender.Close()
		go func() {
			if err := sender.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
				logger.Error("mail outbox sender stopped", "error", err)
			}
		}()
	}

	if searcher := newSearchClient(cfg, logger); searcher != nil {
		transport.UseSearcher(searcher)
	}

	if mindmaps := newMindmapClient(cfg, logger); mindmaps != nil {
		transport.UseMindmaps(mindmaps)
		transport.UseMasteryStructures(newMasteryStructures(cfg, logger))
	}

	if generator := timetablegen.DispatcherFor(cfg, logger); generator != nil {
		defer generator.Close()
		transport.UseTimetableSolver(generator)
	} else if !cfg.TimetableSolverEnabled {
		logger.Info("automatic timetable generation disabled by TIMETABLE_SOLVER_ENABLED; " +
			"POST /timetables/{id}/generate refuses and a week is arranged by hand")
	}

	if dispatcher := newIndexDispatcher(cfg, logger); dispatcher != nil {
		defer dispatcher.Close()
		transport.UseIndexer(dispatcher)

		if sweeper := newIndexSweeper(cfg, control, registry, dispatcher, logger); sweeper != nil {
			go func() {
				if err := sweeper.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
					logger.Error("index sweeper stopped", "error", err)
				}
			}()
		}
	}

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: transport.NewServer(cfg, logger, control, registry, verifier, guard, authProxy, provisioner, tenants, version).
			WithMail(sender, mailAbsence).Router(),
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("http server listening", "addr", srv.Addr, "env", cfg.Env, "version", version)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	logger.Info("shutdown complete")
	return nil
}

func newAuth(ctx context.Context, cfg *config.Config, logger *slog.Logger) (*cas.Verifier, authorization.Guard, error) {
	if !cfg.AuthEnabled() {
		logger.Warn("AUTH_DISABLED is set: every request runs unauthenticated with full access")
		return nil, authorization.AllowAll{}, nil
	}

	verifier, err := cas.NewVerifier(cas.Config{
		BaseURL:  cfg.CASBaseURL,
		Issuer:   cfg.CASIssuer,
		Audience: cfg.CASAudience,
	})
	if err != nil {
		return nil, nil, err
	}
	if err := verifier.Warm(ctx); err != nil {
		logger.Warn("could not preload CAS JWKS", "error", err)
	}

	if cfg.CASClientID == "" || cfg.CASClientSecret == "" {
		logger.Warn("no CAS client credentials: policies cannot be fetched, so every request will be denied")
		return verifier, authorization.DenyAll{}, nil
	}

	policies, err := cas.NewPolicyClient(cas.PolicyConfig{
		BaseURL:         cfg.CASBaseURL,
		ClientID:        cfg.CASClientID,
		ClientSecret:    cfg.CASClientSecret,
		Audience:        cfg.CASServiceKey,
		SubjectAudience: cfg.CASAudience,
		CacheTTL:        cfg.CASPolicyTTL,
	})
	if err != nil {
		return nil, nil, err
	}
	return verifier, cas.NewGuard(policies), nil
}

func newProvisioner(cfg *config.Config, guard authorization.Guard, logger *slog.Logger) *service.Provisioner {
	if !cfg.AuthEnabled() {
		logger.Info("identity provisioning disabled; people must exist in CAS already")
		return service.NewProvisioner(nil)
	}

	admin, err := cas.NewAdminClient(cfg.CASBaseURL)
	if err != nil {
		logger.Warn("identity provisioning unavailable", "error", err)
		return service.NewProvisioner(nil)
	}
	return service.NewProvisioner(admin)
}

func newAuthProxy(cfg *config.Config, logger *slog.Logger) (*cas.AuthProxy, error) {
	if !cfg.AuthEnabled() || !cfg.CASAuthProxy {
		logger.Info("login relay disabled; clients authenticate against CAS directly")
		return nil, nil
	}

	proxy, err := cas.NewAuthProxy(cas.ProxyConfig{BaseURL: cfg.CASBaseURL})
	if err != nil {
		return nil, err
	}
	logger.Info("login relay enabled", "upstream", cfg.CASBaseURL)
	logger.Warn("login relay requires this service's IP in CAS_TRUSTED_PROXIES, " +
		"otherwise CAS throttles every user of a school as one client")
	return proxy, nil
}

func newLogger(cfg *config.Config) *slog.Logger {
	level := slog.LevelInfo
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}

	json := cfg.IsProduction()
	switch cfg.LogFormat {
	case "json":
		json = true
	case "text":
		json = false
	}

	opts := &slog.HandlerOptions{Level: level}
	if json {
		return slog.New(slog.NewJSONHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, opts))
}

func newTenantProvisioner(cfg *config.Config, logger *slog.Logger) *service.TenantProvisioner {
	if !cfg.AuthEnabled() {
		logger.Info("tenant provisioning disabled; create the CAS root group by hand")
		return service.NewTenantProvisioner(nil)
	}
	admin, err := cas.NewAdminClient(cfg.CASBaseURL)
	if err != nil {
		logger.Warn("tenant provisioning unavailable", "error", err)
		return service.NewTenantProvisioner(nil)
	}
	return service.NewTenantProvisioner(admin)
}

func newMailSender(cfg *config.Config, control *controlent.Client, keyring *crypto.Keyring, logger *slog.Logger) (*mail.Sender, string) {
	if !cfg.MailSenderEnabled {
		logger.Info("mail outbox sender disabled by MAIL_SENDER_ENABLED; anything enqueued waits " +
			"in the outbox until it expires")
		return nil, transport.MailDisabled
	}
	sender, err := mail.NewSender(control, keyring, mail.FromConfig(cfg), logger)
	if err != nil {
		logger.Error("mail outbox sender could not be built; anything enqueued waits in the outbox "+
			"until it expires", "error", err)
		return nil, transport.MailUnavailable
	}
	return sender, ""
}

func newEngineClient(cfg *config.Config) (*indexing.Client, error) {
	return indexing.NewClient(indexing.ClientConfig{
		BaseURL:    cfg.RetrievalEngineBaseURL,
		AdminToken: cfg.RetrievalEngineAdminToken,
		Timeout:    cfg.RetrievalEngineTimeout,
	})
}

func newIndexDispatcher(cfg *config.Config, logger *slog.Logger) *indexing.Dispatcher {
	if !cfg.RetrievalIndexing() {
		logger.Info("retrieval indexing disabled by RETRIEVAL_INDEX_ENABLED; published " +
			"library items are catalogued but never sent to the retrieval engine")
		return nil
	}

	client, err := newEngineClient(cfg)
	if err != nil {
		logger.Error("retrieval indexing unavailable; published items stay unindexed", "error", err)
		return nil
	}

	indexer, err := indexing.NewIndexer(client, indexing.Options{
		PollInterval: cfg.RetrievalIndexPollInterval,
		PollTimeout:  cfg.RetrievalIndexPollTimeout,
	})
	if err != nil {
		logger.Error("retrieval indexing unavailable; published items stay unindexed", "error", err)
		return nil
	}

	logger.Info("retrieval indexing enabled",
		"engine", client.String(), "workers", cfg.RetrievalIndexWorkers)
	return indexing.NewDispatcher(indexer, cfg.RetrievalIndexWorkers, logger)
}

func newSearchClient(cfg *config.Config, logger *slog.Logger) *indexing.Client {
	if !cfg.RetrievalSearching() {
		logger.Info("retrieval search disabled by RETRIEVAL_SEARCH_ENABLED; GET /library/search " +
			"refuses rather than answering with an empty page a caller would read as an empty library")
		return nil
	}

	client, err := newEngineClient(cfg)
	if err != nil {
		logger.Error("retrieval search unavailable; the library cannot be searched", "error", err)
		return nil
	}

	logger.Info("retrieval search enabled", "engine", client.String())
	return client
}

func newMindmapClient(cfg *config.Config, logger *slog.Logger) *mindmap.Client {
	if !cfg.Mindmapping() {
		logger.Info("mind maps disabled by MINDMAP_ENABLED; every /learning/mindmaps route " +
			"refuses rather than answering with an empty list a caller would read as a school with no books")
		return nil
	}

	client, err := mindmap.NewClient(mindmap.ClientConfig{
		BaseURL: cfg.MindmapEngineBaseURL,
		Timeout: cfg.MindmapEngineTimeout,
	})
	if err != nil {
		logger.Error("mind maps unavailable; every /learning/mindmaps route refuses", "error", err)
		return nil
	}

	logger.Info("mind maps enabled", "service", client.String())
	return client
}

func newMasteryStructures(cfg *config.Config, logger *slog.Logger) *mindmap.Structures {
	if strings.TrimSpace(cfg.RetrievalEngineBaseURL) == "" {
		logger.Info("RETRIEVAL_ENGINE_BASE_URL is empty; mastery is recorded without the structure " +
			"digest of the book it was learned from, so a re-ingested book cannot be told from an unchanged one")
		return nil
	}

	client, err := newEngineClient(cfg)
	if err != nil {
		logger.Error("mastery is recorded without a structure digest; the retrieval engine "+
			"client could not be built", "error", err)
		return nil
	}
	if strings.TrimSpace(cfg.RetrievalEngineAdminToken) == "" {
		logger.Warn("RETRIEVAL_ENGINE_ADMIN_TOKEN is empty; the engine hides a gated document from " +
			"a caller with no labels, so mastery on a gated book is recorded without a structure digest")
	}
	return mindmap.NewStructures(client)
}

func newIndexSweeper(cfg *config.Config, control *postgres.Control, registry *postgres.Registry,
	dispatcher *indexing.Dispatcher, logger *slog.Logger) *indexing.Sweeper {

	if !cfg.RetrievalSweeping() {
		logger.Info("index sweeper disabled by RETRIEVAL_SWEEP_ENABLED; an item the engine refused " +
			"stays out of retrieval until someone republishes it")
		return nil
	}

	tenants, err := indexing.NewControlTenants(control.Client, registry, logger)
	if err != nil {
		logger.Error("index sweeper unavailable; a failed or orphaned library item stays out of "+
			"retrieval until someone republishes it", "error", err)
		return nil
	}
	return indexing.SweeperFor(cfg, tenants, dispatcher, newHeldEngine(cfg, logger), logger)
}

func newHeldEngine(cfg *config.Config, logger *slog.Logger) indexing.HeldEngine {
	client, err := newEngineClient(cfg)
	if err != nil {
		logger.Error("held uploads cannot be reconciled; a library item the engine is holding "+
			"stays held after the engine publishes it", "error", err)
		return nil
	}
	if strings.TrimSpace(cfg.RetrievalEngineAdminToken) == "" {
		logger.Warn("RETRIEVAL_ENGINE_ADMIN_TOKEN is empty; the engine hides a gated document from " +
			"a caller with no labels, so a held library item it publishes will read as not yet " +
			"published and stay held")
	}
	return client
}
