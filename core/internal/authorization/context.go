package authorization

import "context"

type subjectCtxKey struct{}

type decisionCtxKey struct{}

var (
	subjectKey  subjectCtxKey
	decisionKey decisionCtxKey
)

func WithSubject(ctx context.Context, s *Subject) context.Context {
	return context.WithValue(ctx, subjectKey, s)
}

func SubjectFrom(ctx context.Context) (*Subject, error) {
	s, ok := ctx.Value(subjectKey).(*Subject)
	if !ok || s == nil {
		return nil, ErrNoSubject
	}
	return s, nil
}

func WithDecision(ctx context.Context, d Decision) context.Context {
	return context.WithValue(ctx, decisionKey, d)
}

func DecisionFrom(ctx context.Context) (Decision, bool) {
	d, ok := ctx.Value(decisionKey).(Decision)
	return d, ok
}
