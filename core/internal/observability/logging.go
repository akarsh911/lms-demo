package observability

import (
	"context"
	"log/slog"
	"time"
)

const (
	ComponentHTTP    = "http"
	ComponentTenancy = "tenancy"
	ComponentCAS     = "cas"
	ComponentAuthz   = "authz"
	ComponentData    = "data"
	ComponentFields  = "fields"
)

type loggerKey struct{}

type startKey struct{}

func WithLogger(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, loggerKey{}, logger)
}

func From(ctx context.Context) *slog.Logger {
	if logger, ok := ctx.Value(loggerKey{}).(*slog.Logger); ok && logger != nil {
		return logger
	}
	return slog.Default()
}

func With(ctx context.Context, args ...any) context.Context {
	return WithLogger(ctx, From(ctx).With(args...))
}

func WithStart(ctx context.Context, at time.Time) context.Context {
	return context.WithValue(ctx, startKey{}, at)
}

func Elapsed(ctx context.Context) time.Duration {
	if at, ok := ctx.Value(startKey{}).(time.Time); ok {
		return time.Since(at)
	}
	return 0
}

func Step(ctx context.Context, component, op string, args ...any) {
	From(ctx).LogAttrs(ctx, slog.LevelDebug, op,
		attrs(component, ctx, args)...)
}

func Decision(ctx context.Context, allowed bool, op string, args ...any) {
	level := slog.LevelInfo
	if allowed {
		level = slog.LevelDebug
	}
	From(ctx).LogAttrs(ctx, level, op, attrs(ComponentAuthz, ctx, args)...)
}

func Problem(ctx context.Context, component, op string, err error, args ...any) {
	From(ctx).LogAttrs(ctx, slog.LevelWarn, op,
		attrs(component, ctx, append(args, "error", err.Error()))...)
}

func attrs(component string, ctx context.Context, args []any) []slog.Attr {
	out := make([]slog.Attr, 0, len(args)/2+2)
	out = append(out, slog.String("component", component))
	if elapsed := Elapsed(ctx); elapsed > 0 {
		out = append(out, slog.Int64("at_ms", elapsed.Milliseconds()))
	}
	for i := 0; i+1 < len(args); i += 2 {
		key, ok := args[i].(string)
		if !ok {
			continue
		}
		out = append(out, slog.Any(key, args[i+1]))
	}
	return out
}
