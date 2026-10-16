package results

import (
	"errors"
	"testing"

	"github.com/google/uuid"
)

func internalID(label string) uuid.UUID {
	return uuid.NewSHA1(uuid.Nil, []byte(label))
}

func TestAggregateRefusesAnAggregationValidationDidNotCatch(t *testing.T) {
	component := Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: "median",
		Sources:     []Source{{Ref: ExamSource(internalID("t1")), MaximumMarks: 10}},
	}

	got, counted, capped, err := aggregate(component, []contribution{{index: 0, fraction: 0.9}})
	if !errors.Is(err, ErrAggregationUnknown) {
		t.Fatalf("error %v, want %v: an aggregation added to the enum but not to the switch must fail, not score zero",
			err, ErrAggregationUnknown)
	}
	if got != 0 || counted != nil || capped {
		t.Errorf("returned %v / %v / %v alongside the error", got, counted, capped)
	}
}

func TestScoreComponentPropagatesTheAggregationError(t *testing.T) {
	source := Source{Ref: ExamSource(internalID("t1")), MaximumMarks: 10}
	component := Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: "median", Sources: []Source{source},
	}

	_, err := scoreComponent(component, map[SourceRef]Mark{source.Ref: Scored(source.Ref, 9)})
	if !errors.Is(err, ErrAggregationUnknown) {
		t.Fatalf("error %v, want %v", err, ErrAggregationUnknown)
	}
}
