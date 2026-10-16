package results_test

import (
	"errors"
	"math"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/service/results"
)

func idFor(label string) uuid.UUID {
	return uuid.NewSHA1(uuid.Nil, []byte(label))
}

func exam(label string, maximum float64) results.Source {
	return results.Source{Ref: results.ExamSource(idFor(label)), Label: label, MaximumMarks: maximum}
}

func assignment(label string, maximum float64) results.Source {
	return results.Source{Ref: results.AssignmentSource(idFor(label)), Label: label, MaximumMarks: maximum}
}

func scoredAt(source results.Source, obtained float64) results.Mark {
	return results.Scored(source.Ref, obtained)
}

func outcomes(component results.ComponentResult) []results.Outcome {
	got := make([]results.Outcome, len(component.Sources))
	for i, source := range component.Sources {
		got[i] = source.Outcome
	}
	return got
}

func sameOutcomes(a, b []results.Outcome) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func oneComponent(component results.Component) results.Scheme {
	return results.Scheme{
		ID:         idFor("scheme"),
		TotalMarks: component.Weight,
		Components: []results.Component{component},
	}
}

func computeOne(t *testing.T, component results.Component, marks []results.Mark) results.ComponentResult {
	t.Helper()
	out, err := results.Compute(oneComponent(component), marks)
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if len(out.Components) != 1 {
		t.Fatalf("expected one component result, got %d", len(out.Components))
	}
	return out.Components[0]
}

func TestAggregationOfFractions(t *testing.T) {
	a, b, c, d := exam("a", 10), exam("b", 20), exam("c", 50), exam("d", 10)

	cases := []struct {
		name         string
		component    results.Component
		marks        []results.Mark
		wantFraction float64
		wantMarks    float64
		wantCapped   bool
	}{
		{
			name: "single takes the one fraction",
			component: results.Component{
				Name: "Half-yearly", MaximumMarks: 40, Weight: 20,
				Aggregation: results.AggregationSingle, Sources: []results.Source{exam("hy", 40)},
			},
			marks:        []results.Mark{results.Scored(results.ExamSource(idFor("hy")), 30)},
			wantFraction: 0.75,
			wantMarks:    30,
		},
		{
			name: "average is the mean of the fractions and not of the marks",
			component: results.Component{
				Name: "Class work", MaximumMarks: 10, Weight: 10,
				Aggregation: results.AggregationAverage, Sources: []results.Source{a, b, c},
			},
			marks:        []results.Mark{scoredAt(a, 8), scoredAt(b, 12), scoredAt(c, 20)},
			wantFraction: 0.6,
			wantMarks:    6,
		},
		{
			name: "sum adds the fractions",
			component: results.Component{
				Name: "Portfolio", MaximumMarks: 25, Weight: 25,
				Aggregation: results.AggregationSum, Sources: []results.Source{a, b, c},
			},
			marks:        []results.Mark{scoredAt(a, 2), scoredAt(b, 6), scoredAt(c, 20)},
			wantFraction: 0.9,
			wantMarks:    22.5,
		},
		{
			name: "sum caps at one",
			component: results.Component{
				Name: "Portfolio", MaximumMarks: 25, Weight: 25,
				Aggregation: results.AggregationSum, Sources: []results.Source{a, b, c},
			},
			marks:        []results.Mark{scoredAt(a, 5), scoredAt(b, 12), scoredAt(c, 40)},
			wantFraction: 1,
			wantMarks:    25,
			wantCapped:   true,
		},
		{
			name: "best of two averages the two highest",
			component: results.Component{
				Name: "Class tests", MaximumMarks: 10, Weight: 20, TakeBest: 2,
				Aggregation: results.AggregationBestOf, Sources: []results.Source{a, b, c, d},
			},
			marks:        []results.Mark{scoredAt(a, 9), scoredAt(b, 4), scoredAt(c, 40), scoredAt(d, 1)},
			wantFraction: 0.85,
			wantMarks:    8.5,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := computeOne(t, tc.component, tc.marks)
			if got.Fraction != tc.wantFraction {
				t.Errorf("fraction %v, want %v", got.Fraction, tc.wantFraction)
			}
			if got.ObtainedMarks != tc.wantMarks {
				t.Errorf("obtained marks %v, want %v", got.ObtainedMarks, tc.wantMarks)
			}
			if got.Capped != tc.wantCapped {
				t.Errorf("capped %v, want %v", got.Capped, tc.wantCapped)
			}
			want := math.Round(tc.wantFraction*tc.component.Weight*100) / 100
			if got.Contribution != want {
				t.Errorf("contribution %v, want %v", got.Contribution, want)
			}
		})
	}
}

func TestBestOfTakesTheHighestFractionsAndSaysWhichOnes(t *testing.T) {
	a, b, c, d := exam("t1", 10), exam("t2", 10), exam("t3", 20), exam("t4", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20, TakeBest: 2,
		Aggregation: results.AggregationBestOf, Sources: []results.Source{a, b, c, d},
	}

	got := computeOne(t, component, []results.Mark{
		scoredAt(a, 9), scoredAt(b, 2), scoredAt(c, 16), scoredAt(d, 1),
	})

	if got.Fraction != 0.85 {
		t.Fatalf("best two of 0.9, 0.2, 0.8, 0.1 is 0.85, got %v; the lowest two would be 0.15", got.Fraction)
	}
	want := []results.Outcome{
		results.OutcomeCounted,
		results.OutcomeNotAmongBest,
		results.OutcomeCounted,
		results.OutcomeNotAmongBest,
	}
	if !sameOutcomes(outcomes(got), want) {
		t.Errorf("outcomes %v, want %v: a teacher must be able to see which two tests counted", outcomes(got), want)
	}
	if got.Counted != 2 {
		t.Errorf("counted %d sources, want 2", got.Counted)
	}
}

func TestBestOfBreaksTiesByLinkOrderSoTheBreakdownIsStable(t *testing.T) {
	a, b, c, d := exam("t1", 10), exam("t2", 10), exam("t3", 10), exam("t4", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20, TakeBest: 2,
		Aggregation: results.AggregationBestOf, Sources: []results.Source{a, b, c, d},
	}
	marks := []results.Mark{scoredAt(a, 7), scoredAt(b, 7), scoredAt(c, 7), scoredAt(d, 2)}

	first := computeOne(t, component, marks)
	if first.Fraction != 0.7 {
		t.Fatalf("three tied fractions of 0.7 average to 0.7, got %v", first.Fraction)
	}
	want := []results.Outcome{
		results.OutcomeCounted,
		results.OutcomeCounted,
		results.OutcomeNotAmongBest,
		results.OutcomeNotAmongBest,
	}
	if !sameOutcomes(outcomes(first), want) {
		t.Errorf("outcomes %v, want %v: a tie must resolve to the earlier linked source", outcomes(first), want)
	}
	for i := 0; i < 20; i++ {
		again := computeOne(t, component, marks)
		if !sameOutcomes(outcomes(again), outcomes(first)) {
			t.Fatalf("run %d produced %v after %v; a breakdown that flips between runs is a report card that flips",
				i, outcomes(again), outcomes(first))
		}
	}
}

func TestBestOfFallsBackToWhatThePupilActuallySat(t *testing.T) {
	a, b, c, d := exam("t1", 10), exam("t2", 10), exam("t3", 10), exam("t4", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20, TakeBest: 2,
		Aggregation: results.AggregationBestOf, Sources: []results.Source{a, b, c, d},
	}

	got := computeOne(t, component, []results.Mark{
		scoredAt(a, 6), results.Absent(b.Ref), results.Absent(c.Ref), results.Absent(d.Ref),
	})

	if got.Fraction != 0.6 {
		t.Fatalf("one sat test of 0.6 under best-of-two is 0.6, got %v; averaging over two would invent an absence as a zero", got.Fraction)
	}
	if got.Counted != 1 || got.Linked != 4 {
		t.Errorf("counted %d of %d linked, want 1 of 4", got.Counted, got.Linked)
	}
}

func TestAnAbsenceIsNotAZero(t *testing.T) {
	a, b, c, d := exam("t1", 10), exam("t2", 10), exam("t3", 10), exam("t4", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b, c, d},
	}

	absent := computeOne(t, component, []results.Mark{
		scoredAt(a, 8), scoredAt(b, 6), results.Absent(c.Ref), results.Absent(d.Ref),
	})
	if absent.Fraction != 0.7 {
		t.Errorf("average over the two sat tests is 0.7, got %v; counting an absence as a zero gives 0.35", absent.Fraction)
	}
	if absent.Counted != 2 {
		t.Errorf("counted %d, want 2", absent.Counted)
	}

	zeroed := computeOne(t, component, []results.Mark{
		scoredAt(a, 8), scoredAt(b, 6), scoredAt(c, 0), scoredAt(d, 0),
	})
	if zeroed.Fraction != 0.35 {
		t.Errorf("a sat test scored zero drags the average to 0.35, got %v", zeroed.Fraction)
	}
	if zeroed.Counted != 4 {
		t.Errorf("counted %d, want 4: a zero is a sat test", zeroed.Counted)
	}
	if absent.Fraction == zeroed.Fraction {
		t.Fatal("absent and zero produced the same number; they are different facts about a child")
	}
}

func TestAZeroIsCountedAsASource(t *testing.T) {
	a, b := exam("t1", 10), exam("t2", 10)
	component := results.Component{
		Name: "Tests", MaximumMarks: 10, Weight: 10, TakeBest: 1,
		Aggregation: results.AggregationBestOf, Sources: []results.Source{a, b},
	}

	got := computeOne(t, component, []results.Mark{scoredAt(a, 0), scoredAt(b, 0)})
	if got.Fraction != 0 {
		t.Errorf("fraction %v, want 0", got.Fraction)
	}
	if got.Sources[0].Fraction == nil || *got.Sources[0].Fraction != 0 {
		t.Errorf("a zero must report a fraction of 0, got %v", got.Sources[0].Fraction)
	}
	if got.Sources[0].Obtained == nil || *got.Sources[0].Obtained != 0 {
		t.Errorf("a zero must report its mark, got %v", got.Sources[0].Obtained)
	}
}

func TestUnderSumAnAbsenceCostsThoseMarks(t *testing.T) {
	a, b := exam("part1", 10), exam("part2", 10)
	component := results.Component{
		Name: "Portfolio", MaximumMarks: 20, Weight: 20,
		Aggregation: results.AggregationSum, Sources: []results.Source{a, b},
	}

	got := computeOne(t, component, []results.Mark{scoredAt(a, 4), results.Absent(b.Ref)})
	if got.Fraction != 0.4 {
		t.Fatalf("fraction %v, want 0.4: under sum there is no denominator to shrink, so an unsat part is simply unearned", got.Fraction)
	}
	if got.Excused {
		t.Error("a component with one sat source is not excused")
	}
}

func TestEveryLinkedSourceExemptExcusesTheComponent(t *testing.T) {
	a, b := exam("t1", 10), exam("t2", 10)
	tests := results.Component{
		ID: idFor("tests"), Name: "Class tests", Position: 1, MaximumMarks: 10, Weight: 40,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b},
	}
	annual := results.Component{
		ID: idFor("annual"), Name: "Annual", Position: 2, MaximumMarks: 60, Weight: 60,
		Aggregation: results.AggregationSingle, Sources: []results.Source{exam("annual", 60)},
	}
	scheme := results.Scheme{
		ID: idFor("scheme"), TotalMarks: 100,
		Components: []results.Component{tests, annual},
	}

	out, err := results.Compute(scheme, []results.Mark{
		results.Exempt(a.Ref), results.Exempt(b.Ref), results.Scored(results.ExamSource(idFor("annual")), 45),
	})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if !out.Components[0].Excused {
		t.Fatal("a component every source of which the pupil is exempt from must be excused, not scored zero")
	}
	if out.AssessedTotal != 60 {
		t.Errorf("assessed total %v, want 60: an exemption removes the weight it excused", out.AssessedTotal)
	}
	if out.ComponentTotal != 100 || !out.Balanced() {
		t.Errorf("component total %v balanced=%v, want 100 and true: the scheme itself still adds up",
			out.ComponentTotal, out.Balanced())
	}
	if !out.Excused() {
		t.Error("the result must report that something was excused")
	}
	if out.Score != 45 {
		t.Errorf("score %v, want 45", out.Score)
	}
	if out.Percentage() != 75 {
		t.Errorf("percentage %v, want 75: 45 of the 60 that applied to this pupil", out.Percentage())
	}
	if !out.Complete {
		t.Error("an exempt pupil's result is complete; nothing is outstanding")
	}
}

func TestEveryLinkedSourceAbsentScoresZeroRatherThanVanishing(t *testing.T) {
	a, b := exam("t1", 10), exam("t2", 10)
	tests := results.Component{
		ID: idFor("tests"), Name: "Class tests", Position: 1, MaximumMarks: 10, Weight: 40,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b},
	}
	annual := results.Component{
		ID: idFor("annual"), Name: "Annual", Position: 2, MaximumMarks: 60, Weight: 60,
		Aggregation: results.AggregationSingle, Sources: []results.Source{exam("annual", 60)},
	}
	scheme := results.Scheme{ID: idFor("scheme"), TotalMarks: 100, Components: []results.Component{tests, annual}}

	out, err := results.Compute(scheme, []results.Mark{
		results.Absent(a.Ref), results.Absent(b.Ref), results.Scored(results.ExamSource(idFor("annual")), 45),
	})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if out.Components[0].Excused {
		t.Fatal("a pupil who sat nothing is not a pupil excused from it; the component must still be scored")
	}
	if out.Components[0].Contribution != 0 {
		t.Errorf("contribution %v, want 0", out.Components[0].Contribution)
	}
	if out.AssessedTotal != 100 {
		t.Errorf("assessed total %v, want 100: the weight was assessed and not earned", out.AssessedTotal)
	}
	if out.Score != 45 || out.Percentage() != 45 {
		t.Errorf("score %v (%v%%), want 45 and 45%%", out.Score, out.Percentage())
	}
	if !out.Complete {
		t.Error("an absence is a recorded fact, so the result is complete")
	}
}

func TestPartialExemptionDoesNotExcuseTheComponent(t *testing.T) {
	a, b := exam("t1", 10), exam("t2", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 40,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b},
	}

	got := computeOne(t, component, []results.Mark{results.Exempt(a.Ref), results.Absent(b.Ref)})
	if got.Excused {
		t.Fatal("an exemption excuses a component only when it accounts for every source; one absence is lost evidence, not an excuse")
	}
	if got.Contribution != 0 {
		t.Errorf("contribution %v, want 0", got.Contribution)
	}
}

func TestExemptionShrinksTheDenominatorLikeAnAbsence(t *testing.T) {
	a, b, c := exam("t1", 10), exam("t2", 10), exam("t3", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 30,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b, c},
	}

	got := computeOne(t, component, []results.Mark{scoredAt(a, 9), scoredAt(b, 7), results.Exempt(c.Ref)})
	if got.Fraction != 0.8 {
		t.Errorf("fraction %v, want 0.8: the exempt test is not part of the average", got.Fraction)
	}
	if got.Sources[2].Outcome != results.OutcomeExempt {
		t.Errorf("outcome %v, want exempt", got.Sources[2].Outcome)
	}
}

func TestAMarkThatWasNeverEnteredLeavesTheResultIncomplete(t *testing.T) {
	a, b := exam("t1", 10), exam("t2", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b},
	}

	out, err := results.Compute(oneComponent(component), []results.Mark{scoredAt(a, 9)})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if out.Complete {
		t.Fatal("a source with no mark at all is outstanding work, not a decided fact; the result may not read as complete")
	}
	if out.Components[0].Sources[1].Outcome != results.OutcomeNotEntered {
		t.Errorf("outcome %v, want not_entered", out.Components[0].Sources[1].Outcome)
	}
	if out.Components[0].Fraction != 0.9 {
		t.Errorf("fraction %v, want 0.9: what is entered is still averaged", out.Components[0].Fraction)
	}
}

func TestAComponentWithNothingEnteredIsIncompleteAndZero(t *testing.T) {
	a := exam("t1", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationSingle, Sources: []results.Source{a},
	}

	out, err := results.Compute(oneComponent(component), nil)
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if out.Complete {
		t.Error("nothing was entered; the result is not complete")
	}
	if out.Components[0].Excused {
		t.Error("an unmarked component is not an excused one")
	}
	if out.Score != 0 {
		t.Errorf("score %v, want 0", out.Score)
	}
}

func TestMarksForSourcesTheSchemeDoesNotLinkAreIgnored(t *testing.T) {
	a, stray := exam("t1", 10), exam("stray", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationSingle, Sources: []results.Source{a},
	}

	got := computeOne(t, component, []results.Mark{scoredAt(a, 8), scoredAt(stray, 1)})
	if got.Fraction != 0.8 {
		t.Errorf("fraction %v, want 0.8", got.Fraction)
	}
	if len(got.Sources) != 1 {
		t.Errorf("breakdown lists %d sources, want the 1 the component links", len(got.Sources))
	}
}

func TestAComponentMayDrawFromExamsAndAssignmentsTogether(t *testing.T) {
	paper, homework := exam("unit-1", 25), assignment("worksheet-3", 5)
	component := results.Component{
		Name: "Internal", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationAverage, Sources: []results.Source{paper, homework},
	}

	got := computeOne(t, component, []results.Mark{scoredAt(paper, 20), scoredAt(homework, 3)})
	if got.Fraction != 0.7 {
		t.Errorf("fraction %v, want 0.7: 0.8 and 0.6 averaged, whatever kind the source is", got.Fraction)
	}
	if got.Sources[1].Ref.Kind != results.SourceKindAssignment {
		t.Errorf("source kind %v, want assignment", got.Sources[1].Ref.Kind)
	}
}

func TestTheWorkedExample(t *testing.T) {
	half := exam("half-yearly", 40)
	t1, t2, t3, t4 := exam("ct1", 10), exam("ct2", 10), exam("ct3", 10), exam("ct4", 10)
	annual := exam("annual", 80)

	scheme := results.Scheme{
		ID:         idFor("scheme"),
		Name:       "Science, Class IX",
		TotalMarks: 100,
		Components: []results.Component{
			{
				ID: idFor("c-annual"), Name: "Annual", Position: 3, MaximumMarks: 80, Weight: 60,
				Aggregation: results.AggregationSingle, Sources: []results.Source{annual},
			},
			{
				ID: idFor("c-half"), Name: "Half-yearly", Position: 1, MaximumMarks: 40, Weight: 20,
				Aggregation: results.AggregationSingle, Sources: []results.Source{half},
			},
			{
				ID: idFor("c-tests"), Name: "Class tests", Position: 2, MaximumMarks: 10, Weight: 20,
				TakeBest: 2, Aggregation: results.AggregationBestOf,
				Sources: []results.Source{t1, t2, t3, t4},
			},
		},
	}

	out, err := results.Compute(scheme, []results.Mark{
		scoredAt(half, 30),
		scoredAt(t1, 9), scoredAt(t2, 6), scoredAt(t3, 8), scoredAt(t4, 7),
		scoredAt(annual, 70),
	})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}

	if got := []string{out.Components[0].Name, out.Components[1].Name, out.Components[2].Name}; got[0] != "Half-yearly" || got[1] != "Class tests" || got[2] != "Annual" {
		t.Fatalf("components came back as %v, want them ordered by position", got)
	}

	wants := []struct {
		name         string
		fraction     float64
		obtained     float64
		contribution float64
	}{
		{"Half-yearly", 0.75, 30, 15},
		{"Class tests", 0.85, 8.5, 17},
		{"Annual", 0.875, 70, 52.5},
	}
	for i, want := range wants {
		got := out.Components[i]
		if got.Fraction != want.fraction || got.ObtainedMarks != want.obtained || got.Contribution != want.contribution {
			t.Errorf("%s: fraction %v marks %v contribution %v, want %v / %v / %v",
				want.name, got.Fraction, got.ObtainedMarks, got.Contribution,
				want.fraction, want.obtained, want.contribution)
		}
	}
	if out.Score != 84.5 {
		t.Errorf("score %v, want 84.5", out.Score)
	}
	if out.Percentage() != 84.5 {
		t.Errorf("percentage %v, want 84.5", out.Percentage())
	}
	if !out.Balanced() || out.Excused() || !out.Complete {
		t.Errorf("balanced=%v excused=%v complete=%v, want true/false/true",
			out.Balanced(), out.Excused(), out.Complete)
	}
	if out.Components[1].Sources[1].Outcome != results.OutcomeNotAmongBest {
		t.Errorf("the 6 of 10 must read as not among the best two, got %v", out.Components[1].Sources[1].Outcome)
	}
}

func TestTheBreakdownAlwaysAddsUpToTheScore(t *testing.T) {
	cases := []struct {
		name      string
		weights   []float64
		total     float64
		maxima    float64
		obtained  float64
		wantScore float64
	}{
		{
			name:      "thirds of a hundred",
			weights:   []float64{33.33, 33.33, 33.34},
			total:     100,
			maxima:    10,
			obtained:  10,
			wantScore: 100,
		},
		{
			name:      "a third of each of three tens",
			weights:   []float64{10, 10, 10},
			total:     30,
			maxima:    3,
			obtained:  1,
			wantScore: 9.99,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			scheme := results.Scheme{ID: idFor("scheme"), TotalMarks: tc.total}
			var marks []results.Mark
			for i, weight := range tc.weights {
				source := exam(tc.name+string(rune('a'+i)), tc.maxima)
				scheme.Components = append(scheme.Components, results.Component{
					ID: idFor(source.Label), Name: source.Label, Position: i,
					MaximumMarks: tc.maxima, Weight: weight,
					Aggregation: results.AggregationSingle, Sources: []results.Source{source},
				})
				marks = append(marks, scoredAt(source, tc.obtained))
			}

			out, err := results.Compute(scheme, marks)
			if err != nil {
				t.Fatalf("compute: %v", err)
			}
			if out.Score != tc.wantScore {
				t.Errorf("score %v, want %v", out.Score, tc.wantScore)
			}
			summed := 0.0
			for _, component := range out.Components {
				summed += component.Contribution
			}
			if math.Round(summed*100)/100 != out.Score {
				t.Errorf("the printed components add to %v against a printed score of %v; a parent adding the column must get the total",
					summed, out.Score)
			}
		})
	}
}

func TestFloatingPointNoiseIsNotReportedAsACap(t *testing.T) {
	a, b, c := exam("p1", 10), exam("p2", 10), exam("p3", 10)
	component := results.Component{
		Name: "Portfolio", MaximumMarks: 20, Weight: 20,
		Aggregation: results.AggregationSum, Sources: []results.Source{a, b, c},
	}

	got := computeOne(t, component, []results.Mark{scoredAt(a, 1), scoredAt(b, 2), scoredAt(c, 7)})
	if got.Fraction != 1 {
		t.Errorf("fraction %v, want 1", got.Fraction)
	}
	if got.ObtainedMarks != 20 || got.Contribution != 20 {
		t.Errorf("marks %v contribution %v, want 20 and 20", got.ObtainedMarks, got.Contribution)
	}
	if got.Capped {
		t.Error("0.1 + 0.2 + 0.7 is one; reporting it as capped would tell a teacher marks were discarded when none were")
	}
}

func TestFractionsAreRoundedOnlyForDisplay(t *testing.T) {
	a := exam("t1", 3)
	component := results.Component{
		Name: "Test", MaximumMarks: 30, Weight: 30,
		Aggregation: results.AggregationSingle, Sources: []results.Source{a},
	}

	got := computeOne(t, component, []results.Mark{scoredAt(a, 1)})
	if got.Fraction != 0.333333 {
		t.Errorf("fraction %v, want 0.333333", got.Fraction)
	}
	if got.ObtainedMarks != 10 {
		t.Errorf("obtained %v, want 10: the marks come from the unrounded third, not from 0.333333 x 30", got.ObtainedMarks)
	}
	if got.Sources[0].Fraction == nil || *got.Sources[0].Fraction != 0.333333 {
		t.Errorf("source fraction %v, want 0.333333", got.Sources[0].Fraction)
	}
}

func TestRefusedInput(t *testing.T) {
	a, b := exam("t1", 10), exam("t2", 10)
	good := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b},
	}
	schemeOf := func(components ...results.Component) results.Scheme {
		return results.Scheme{ID: idFor("scheme"), TotalMarks: 100, Components: components}
	}
	with := func(mutate func(*results.Component)) results.Component {
		c := good
		c.Sources = append([]results.Source(nil), good.Sources...)
		mutate(&c)
		return c
	}

	cases := []struct {
		name   string
		scheme results.Scheme
		marks  []results.Mark
		want   error
	}{
		{
			name:   "a mark above its maximum",
			scheme: schemeOf(good),
			marks:  []results.Mark{scoredAt(a, 11), scoredAt(b, 5)},
			want:   results.ErrMarkAboveMaximum,
		},
		{
			name:   "a negative mark",
			scheme: schemeOf(good),
			marks:  []results.Mark{scoredAt(a, -1)},
			want:   results.ErrMarkNegative,
		},
		{
			name:   "an absence carrying marks",
			scheme: schemeOf(good),
			marks:  []results.Mark{{Source: a.Ref, Status: results.MarkStatusAbsent, Obtained: 7}},
			want:   results.ErrMarkNotScored,
		},
		{
			name:   "an absence that is provisional",
			scheme: schemeOf(good),
			marks:  []results.Mark{{Source: a.Ref, Status: results.MarkStatusAbsent, Provisional: true}},
			want:   results.ErrProvisionalNotScored,
		},
		{
			name:   "a mark with no status",
			scheme: schemeOf(good),
			marks:  []results.Mark{{Source: a.Ref, Obtained: 7}},
			want:   results.ErrMarkStatusUnknown,
		},
		{
			name:   "two marks for one source",
			scheme: schemeOf(good),
			marks:  []results.Mark{scoredAt(a, 7), scoredAt(a, 8)},
			want:   results.ErrMarkDuplicated,
		},
		{
			name:   "a source with no maximum",
			scheme: schemeOf(with(func(c *results.Component) { c.Sources[0].MaximumMarks = 0 })),
			want:   results.ErrSourceMaximum,
		},
		{
			name:   "a source with a negative maximum",
			scheme: schemeOf(with(func(c *results.Component) { c.Sources[0].MaximumMarks = -10 })),
			want:   results.ErrSourceMaximum,
		},
		{
			name:   "the same source linked twice",
			scheme: schemeOf(with(func(c *results.Component) { c.Sources[1] = a })),
			want:   results.ErrSourceDuplicated,
		},
		{
			name:   "a component with no sources",
			scheme: schemeOf(with(func(c *results.Component) { c.Sources = nil })),
			want:   results.ErrNoSources,
		},
		{
			name:   "a component with no maximum",
			scheme: schemeOf(with(func(c *results.Component) { c.MaximumMarks = 0 })),
			want:   results.ErrComponentMaximum,
		},
		{
			name:   "a component with no weight",
			scheme: schemeOf(with(func(c *results.Component) { c.Weight = 0 })),
			want:   results.ErrComponentWeight,
		},
		{
			name:   "an unknown aggregation",
			scheme: schemeOf(with(func(c *results.Component) { c.Aggregation = "median" })),
			want:   results.ErrAggregationUnknown,
		},
		{
			name: "best_of without take_best",
			scheme: schemeOf(with(func(c *results.Component) {
				c.Aggregation = results.AggregationBestOf
			})),
			want: results.ErrTakeBest,
		},
		{
			name:   "take_best on an average",
			scheme: schemeOf(with(func(c *results.Component) { c.TakeBest = 2 })),
			want:   results.ErrTakeBest,
		},
		{
			name: "best two of one",
			scheme: schemeOf(with(func(c *results.Component) {
				c.Aggregation = results.AggregationBestOf
				c.TakeBest = 2
				c.Sources = c.Sources[:1]
			})),
			want: results.ErrTakeBestTooLarge,
		},
		{
			name: "single over two sources",
			scheme: schemeOf(with(func(c *results.Component) {
				c.Aggregation = results.AggregationSingle
			})),
			want: results.ErrSingleSource,
		},
		{
			name:   "a scheme with no components",
			scheme: schemeOf(),
			want:   results.ErrNoComponents,
		},
		{
			name:   "a scheme out of nothing",
			scheme: results.Scheme{ID: idFor("scheme"), TotalMarks: 0, Components: []results.Component{good}},
			want:   results.ErrSchemeTotal,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out, err := results.Compute(tc.scheme, tc.marks)
			if !errors.Is(err, tc.want) {
				t.Fatalf("error %v, want %v", err, tc.want)
			}
			if out.Score != 0 || len(out.Components) != 0 {
				t.Errorf("a refused input returned a result anyway: %+v", out)
			}
		})
	}
}

func TestAMarkAtItsMaximumIsAllowed(t *testing.T) {
	a := exam("t1", 10)
	component := results.Component{
		Name: "Test", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationSingle, Sources: []results.Source{a},
	}

	got := computeOne(t, component, []results.Mark{scoredAt(a, 10)})
	if got.Fraction != 1 || got.Contribution != 20 {
		t.Errorf("fraction %v contribution %v, want 1 and 20", got.Fraction, got.Contribution)
	}
}

func TestAnUnbalancedSchemeIsComputedAndReportedAsUnbalanced(t *testing.T) {
	a, b := exam("t1", 10), exam("annual", 100)
	scheme := results.Scheme{
		ID: idFor("scheme"), TotalMarks: 100,
		Components: []results.Component{
			{ID: idFor("c1"), Name: "Tests", Position: 1, MaximumMarks: 10, Weight: 20,
				Aggregation: results.AggregationSingle, Sources: []results.Source{a}},
			{ID: idFor("c2"), Name: "Annual", Position: 2, MaximumMarks: 100, Weight: 60,
				Aggregation: results.AggregationSingle, Sources: []results.Source{b}},
		},
	}

	out, err := results.Compute(scheme, []results.Mark{scoredAt(a, 10), scoredAt(b, 80)})
	if err != nil {
		t.Fatalf("a draft scheme under construction must still be previewable: %v", err)
	}
	if out.Score != 68 {
		t.Errorf("score %v, want 68", out.Score)
	}
	if out.ComponentTotal != 80 || out.TotalMarks != 100 {
		t.Errorf("component total %v of declared %v, want 80 of 100", out.ComponentTotal, out.TotalMarks)
	}
	if out.Balanced() {
		t.Error("80 of a declared 100 must not read as balanced; activation is what refuses it")
	}
	if out.Percentage() != 85 {
		t.Errorf("percentage %v, want 85: 68 of the 80 actually configured", out.Percentage())
	}
}

func TestPercentageOfAWhollyExcusedScheme(t *testing.T) {
	a := exam("t1", 10)
	component := results.Component{
		Name: "Test", MaximumMarks: 10, Weight: 100,
		Aggregation: results.AggregationSingle, Sources: []results.Source{a},
	}

	out, err := results.Compute(oneComponent(component), []results.Mark{results.Exempt(a.Ref)})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if out.AssessedTotal != 0 {
		t.Errorf("assessed total %v, want 0", out.AssessedTotal)
	}
	if out.Percentage() != 0 {
		t.Errorf("percentage %v, want 0 rather than a division by zero", out.Percentage())
	}
}

func provisionallyAt(source results.Source, obtained float64) results.Mark {
	return results.ScoredProvisionally(source.Ref, obtained)
}

func TestAProvisionalMarkStillScoresButTheTotalIsNotFinal(t *testing.T) {
	a, b := exam("t1", 10), exam("t2", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b},
	}

	out, err := results.Compute(oneComponent(component),
		[]results.Mark{scoredAt(a, 9), provisionallyAt(b, 7)})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if out.Components[0].Fraction != 0.8 {
		t.Errorf("fraction %v, want 0.8: a mark awaiting a teacher is still a number and still scores",
			out.Components[0].Fraction)
	}
	if out.Score != 16 {
		t.Errorf("score %v, want 16", out.Score)
	}
	if !out.Complete {
		t.Error("every source carries a mark, so nothing is missing; complete describes presence, not finality")
	}
	if !out.Provisional {
		t.Error("a mark that still awaits a teacher leaves the total unsettled")
	}
	if out.Final() {
		t.Error("a result holding a provisional mark may not be presented as final")
	}
	if !out.Components[0].Provisional {
		t.Error("the component holding the provisional source must say so")
	}
	if !out.Components[0].Sources[1].Provisional {
		t.Error("the breakdown must name which source is provisional")
	}
	if out.Components[0].Sources[0].Provisional {
		t.Error("the finished source must not be tarred as provisional")
	}
	if out.Components[0].Sources[1].Outcome != results.OutcomeCounted {
		t.Errorf("outcome %v, want counted: provisional is not an outcome, it is a property of the number",
			out.Components[0].Sources[1].Outcome)
	}
}

func TestAMissingMarkAndAProvisionalMarkAreNotTheSameSentence(t *testing.T) {
	a, b := exam("t1", 10), exam("t2", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b},
	}

	missing, err := results.Compute(oneComponent(component), []results.Mark{scoredAt(a, 9)})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if missing.Complete || missing.Provisional {
		t.Errorf("a source with no mark is incomplete and not provisional, got complete=%v provisional=%v",
			missing.Complete, missing.Provisional)
	}
	if missing.Final() {
		t.Error("an incomplete result is not final either")
	}

	pending, err := results.Compute(oneComponent(component),
		[]results.Mark{scoredAt(a, 9), provisionallyAt(b, 5)})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if !pending.Complete || !pending.Provisional {
		t.Errorf("a provisional mark is present but unsettled, got complete=%v provisional=%v",
			pending.Complete, pending.Provisional)
	}
	if missing.Score != 18 {
		t.Errorf("the missing source shrank the denominator, score %v, want 18", missing.Score)
	}
	if pending.Score != 14 {
		t.Errorf("the provisional 5 is averaged in, score %v, want 14", pending.Score)
	}
}

func TestAProvisionalMarkLeftOutOfTheBestStillUnsettlesTheResult(t *testing.T) {
	a, b, c := exam("t1", 10), exam("t2", 10), exam("t3", 10)
	component := results.Component{
		Name: "Best two", MaximumMarks: 10, Weight: 30,
		Aggregation: results.AggregationBestOf, TakeBest: 2,
		Sources: []results.Source{a, b, c},
	}

	out, err := results.Compute(oneComponent(component),
		[]results.Mark{scoredAt(a, 9), scoredAt(b, 8), provisionallyAt(c, 2)})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if out.Components[0].Sources[2].Outcome != results.OutcomeNotAmongBest {
		t.Fatalf("outcome %v, want not_among_best", out.Components[0].Sources[2].Outcome)
	}
	if !out.Provisional {
		t.Error("finishing that paper could lift it into the best two, so the total is not settled yet")
	}
	if !out.Components[0].Sources[2].Provisional {
		t.Error("a dropped source keeps its provisional flag; being dropped is not being finished")
	}
}

func TestAResultWithNothingOutstandingIsFinal(t *testing.T) {
	a, b := exam("t1", 10), exam("t2", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationAverage, Sources: []results.Source{a, b},
	}

	out, err := results.Compute(oneComponent(component),
		[]results.Mark{scoredAt(a, 9), results.Absent(b.Ref)})
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	if out.Provisional {
		t.Error("no mark awaits a teacher here")
	}
	if !out.Final() {
		t.Errorf("a complete result with no provisional mark is final, got complete=%v provisional=%v",
			out.Complete, out.Provisional)
	}
}

func TestAnExcusedComponentCannotCarryAProvisionalMark(t *testing.T) {
	a := exam("t1", 10)
	component := results.Component{
		Name: "Class tests", MaximumMarks: 10, Weight: 20,
		Aggregation: results.AggregationSingle, Sources: []results.Source{a},
	}

	_, err := results.Compute(oneComponent(component),
		[]results.Mark{{Source: a.Ref, Status: results.MarkStatusExempt, Provisional: true}})
	if !errors.Is(err, results.ErrProvisionalNotScored) {
		t.Fatalf("error %v, want ErrProvisionalNotScored: a pupil with no number has no unfinished number", err)
	}
}
