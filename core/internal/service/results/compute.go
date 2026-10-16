package results

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

var (
	ErrSchemeTotal          = errors.New("results: a scheme's total marks must be positive")
	ErrNoComponents         = errors.New("results: a scheme must have at least one component")
	ErrComponentMaximum     = errors.New("results: a component's maximum marks must be positive")
	ErrComponentWeight      = errors.New("results: a component's weight must be positive")
	ErrAggregationUnknown   = errors.New("results: unknown aggregation")
	ErrTakeBest             = errors.New("results: take_best is required for best_of and forbidden otherwise")
	ErrTakeBestTooLarge     = errors.New("results: a best_of component must link at least take_best sources")
	ErrNoSources            = errors.New("results: a component must link at least one source")
	ErrSingleSource         = errors.New("results: a single component must link exactly one source")
	ErrSourceMaximum        = errors.New("results: a source's maximum marks must be positive")
	ErrSourceDuplicated     = errors.New("results: a source is linked to the same component twice")
	ErrMarkDuplicated       = errors.New("results: a source carries more than one mark")
	ErrMarkStatusUnknown    = errors.New("results: unknown mark status")
	ErrMarkNegative         = errors.New("results: a mark may not be negative")
	ErrMarkAboveMaximum     = errors.New("results: a mark exceeds its source's maximum")
	ErrMarkNotScored        = errors.New("results: an absent or exempt mark may not carry marks")
	ErrProvisionalNotScored = errors.New("results: an absent or exempt mark may not be provisional")
)

const capEpsilon = 1e-9

func Compute(scheme Scheme, marks []Mark) (Result, error) {
	if err := scheme.Validate(); err != nil {
		return Result{}, err
	}
	bySource, err := indexMarks(marks)
	if err != nil {
		return Result{}, err
	}

	components := append([]Component(nil), scheme.Components...)
	sort.SliceStable(components, func(i, j int) bool { return components[i].Position < components[j].Position })

	out := Result{
		SchemeID:   scheme.ID,
		TotalMarks: scheme.TotalMarks,
		Complete:   true,
		Components: make([]ComponentResult, 0, len(components)),
	}
	score := 0.0
	for _, component := range components {
		scored, err := scoreComponent(component, bySource)
		if err != nil {
			return Result{}, err
		}
		out.ComponentTotal += component.Weight
		out.Provisional = out.Provisional || scored.Provisional
		if !scored.Excused {
			out.AssessedTotal += component.Weight
			score += scored.Contribution
			for _, source := range scored.Sources {
				if source.Outcome == OutcomeNotEntered {
					out.Complete = false
				}
			}
		}
		out.Components = append(out.Components, scored)
	}
	out.ComponentTotal = round(out.ComponentTotal, 2)
	out.AssessedTotal = round(out.AssessedTotal, 2)
	out.Score = round(score, 2)
	return out, nil
}

func indexMarks(marks []Mark) (map[SourceRef]Mark, error) {
	bySource := make(map[SourceRef]Mark, len(marks))
	for _, mark := range marks {
		switch mark.Status {
		case MarkStatusScored:
			if mark.Obtained < 0 {
				return nil, fmt.Errorf("%w: %s %s has %v", ErrMarkNegative, mark.Source.Kind, mark.Source.ID, mark.Obtained)
			}
		case MarkStatusAbsent, MarkStatusExempt:
			if mark.Obtained != 0 {
				return nil, fmt.Errorf("%w: %s %s is %s with %v", ErrMarkNotScored, mark.Source.Kind, mark.Source.ID, mark.Status, mark.Obtained)
			}
			if mark.Provisional {
				return nil, fmt.Errorf("%w: %s %s is %s", ErrProvisionalNotScored, mark.Source.Kind, mark.Source.ID, mark.Status)
			}
		default:
			return nil, fmt.Errorf("%w: %q on %s %s", ErrMarkStatusUnknown, mark.Status, mark.Source.Kind, mark.Source.ID)
		}
		if _, seen := bySource[mark.Source]; seen {
			return nil, fmt.Errorf("%w: %s %s", ErrMarkDuplicated, mark.Source.Kind, mark.Source.ID)
		}
		bySource[mark.Source] = mark
	}
	return bySource, nil
}

type contribution struct {
	index    int
	fraction float64
}

func scoreComponent(component Component, bySource map[SourceRef]Mark) (ComponentResult, error) {
	out := ComponentResult{
		ID:           component.ID,
		Name:         component.Name,
		Position:     component.Position,
		Aggregation:  component.Aggregation,
		TakeBest:     component.TakeBest,
		MaximumMarks: component.MaximumMarks,
		Weight:       component.Weight,
		Linked:       len(component.Sources),
		Sources:      make([]SourceResult, len(component.Sources)),
	}

	eligible := make([]contribution, 0, len(component.Sources))
	exempted := 0
	for i, source := range component.Sources {
		result := SourceResult{Ref: source.Ref, Label: source.Label, MaximumMarks: source.MaximumMarks}
		mark, ok := bySource[source.Ref]
		switch {
		case !ok:
			result.Outcome = OutcomeNotEntered
		case mark.Status == MarkStatusExempt:
			result.Outcome = OutcomeExempt
			exempted++
		case mark.Status == MarkStatusAbsent:
			result.Outcome = OutcomeAbsent
		default:
			if mark.Obtained > source.MaximumMarks {
				return ComponentResult{}, fmt.Errorf("%w: %v of %v on %s %s in %q",
					ErrMarkAboveMaximum, mark.Obtained, source.MaximumMarks, source.Ref.Kind, source.Ref.ID, component.Name)
			}
			fraction := mark.Obtained / source.MaximumMarks
			obtained := mark.Obtained
			result.Obtained = &obtained
			result.Fraction = fractionOf(fraction)
			result.Outcome = OutcomeCounted
			result.Provisional = mark.Provisional
			out.Provisional = out.Provisional || mark.Provisional
			eligible = append(eligible, contribution{index: i, fraction: fraction})
		}
		out.Sources[i] = result
	}

	if len(eligible) == 0 {
		out.Excused = exempted == len(component.Sources)
		return out, nil
	}

	fraction, counted, capped, err := aggregate(component, eligible)
	if err != nil {
		return ComponentResult{}, err
	}
	for i, source := range out.Sources {
		if source.Outcome == OutcomeCounted && !counted[i] {
			out.Sources[i].Outcome = OutcomeNotAmongBest
		}
	}

	out.Fraction = round(fraction, 6)
	out.ObtainedMarks = round(fraction*component.MaximumMarks, 2)
	out.Contribution = round(fraction*component.Weight, 2)
	out.Capped = capped
	out.Counted = len(counted)
	return out, nil
}

func aggregate(component Component, eligible []contribution) (float64, map[int]bool, bool, error) {
	counted := make(map[int]bool, len(eligible))
	switch component.Aggregation {
	case AggregationSingle, AggregationAverage:
		total := 0.0
		for _, e := range eligible {
			total += e.fraction
			counted[e.index] = true
		}
		return total / float64(len(eligible)), counted, false, nil

	case AggregationSum:
		total := 0.0
		for _, e := range eligible {
			total += e.fraction
			counted[e.index] = true
		}
		if total > 1 {
			return 1, counted, total > 1+capEpsilon, nil
		}
		return total, counted, false, nil

	case AggregationBestOf:
		ranked := append([]contribution(nil), eligible...)
		sort.SliceStable(ranked, func(i, j int) bool { return ranked[i].fraction > ranked[j].fraction })
		take := component.TakeBest
		if take > len(ranked) {
			take = len(ranked)
		}
		total := 0.0
		for _, e := range ranked[:take] {
			total += e.fraction
			counted[e.index] = true
		}
		return total / float64(take), counted, false, nil
	}
	return 0, nil, false, fmt.Errorf("%w: %q in %q", ErrAggregationUnknown, component.Aggregation, component.Name)
}

func (s Scheme) Validate() error {
	if !(s.TotalMarks > 0) {
		return fmt.Errorf("%w: %v", ErrSchemeTotal, s.TotalMarks)
	}
	if len(s.Components) == 0 {
		return ErrNoComponents
	}
	for _, component := range s.Components {
		if err := component.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func (c Component) Validate() error {
	if !(c.MaximumMarks > 0) {
		return fmt.Errorf("%w: %q has %v", ErrComponentMaximum, c.Name, c.MaximumMarks)
	}
	if !(c.Weight > 0) {
		return fmt.Errorf("%w: %q has %v", ErrComponentWeight, c.Name, c.Weight)
	}
	switch c.Aggregation {
	case AggregationSingle, AggregationSum, AggregationAverage:
		if c.TakeBest != 0 {
			return fmt.Errorf("%w: %q is %s with take_best %d", ErrTakeBest, c.Name, c.Aggregation, c.TakeBest)
		}
	case AggregationBestOf:
		if c.TakeBest <= 0 {
			return fmt.Errorf("%w: %q is best_of with take_best %d", ErrTakeBest, c.Name, c.TakeBest)
		}
	default:
		return fmt.Errorf("%w: %q in %q", ErrAggregationUnknown, c.Aggregation, c.Name)
	}
	if len(c.Sources) == 0 {
		return fmt.Errorf("%w: %q", ErrNoSources, c.Name)
	}
	if c.Aggregation == AggregationSingle && len(c.Sources) != 1 {
		return fmt.Errorf("%w: %q links %d", ErrSingleSource, c.Name, len(c.Sources))
	}
	if c.Aggregation == AggregationBestOf && c.TakeBest > len(c.Sources) {
		return fmt.Errorf("%w: %q takes %d of %d", ErrTakeBestTooLarge, c.Name, c.TakeBest, len(c.Sources))
	}
	seen := make(map[SourceRef]struct{}, len(c.Sources))
	for _, source := range c.Sources {
		if !(source.MaximumMarks > 0) {
			return fmt.Errorf("%w: %s %s in %q has %v", ErrSourceMaximum, source.Ref.Kind, source.Ref.ID, c.Name, source.MaximumMarks)
		}
		if _, dup := seen[source.Ref]; dup {
			return fmt.Errorf("%w: %s %s in %q", ErrSourceDuplicated, source.Ref.Kind, source.Ref.ID, c.Name)
		}
		seen[source.Ref] = struct{}{}
	}
	return nil
}

func fractionOf(f float64) *float64 {
	rounded := round(f, 6)
	return &rounded
}

func round(value float64, places int) float64 {
	scale := math.Pow(10, float64(places))
	return math.Round(value*scale) / scale
}
