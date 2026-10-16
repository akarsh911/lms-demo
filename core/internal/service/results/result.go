package results

import (
	"github.com/google/uuid"
)

type Outcome string

const (
	OutcomeCounted      Outcome = "counted"
	OutcomeNotAmongBest Outcome = "not_among_best"
	OutcomeAbsent       Outcome = "absent"
	OutcomeExempt       Outcome = "exempt"
	OutcomeNotEntered   Outcome = "not_entered"
)

type SourceResult struct {
	Ref          SourceRef `json:"ref"`
	Label        string    `json:"label,omitempty"`
	MaximumMarks float64   `json:"maximum_marks"`
	Obtained     *float64  `json:"obtained,omitempty"`
	Fraction     *float64  `json:"fraction,omitempty"`
	Outcome      Outcome   `json:"outcome"`
	Provisional  bool      `json:"provisional"`
}

type ComponentResult struct {
	ID            uuid.UUID      `json:"id"`
	Name          string         `json:"name"`
	Position      int            `json:"position"`
	Aggregation   Aggregation    `json:"aggregation"`
	TakeBest      int            `json:"take_best,omitempty"`
	MaximumMarks  float64        `json:"maximum_marks"`
	Weight        float64        `json:"weight"`
	Fraction      float64        `json:"fraction"`
	ObtainedMarks float64        `json:"obtained_marks"`
	Contribution  float64        `json:"contribution"`
	Linked        int            `json:"linked_sources"`
	Counted       int            `json:"counted_sources"`
	Excused       bool           `json:"excused"`
	Capped        bool           `json:"capped,omitempty"`
	Provisional   bool           `json:"provisional"`
	Sources       []SourceResult `json:"sources"`
}

type Result struct {
	SchemeID       uuid.UUID         `json:"result_scheme_id"`
	TotalMarks     float64           `json:"total_marks"`
	ComponentTotal float64           `json:"component_total"`
	AssessedTotal  float64           `json:"assessed_total"`
	Score          float64           `json:"score"`
	Complete       bool              `json:"complete"`
	Provisional    bool              `json:"provisional"`
	Components     []ComponentResult `json:"components"`
}

func (r Result) Final() bool {
	return r.Complete && !r.Provisional
}

func (r Result) Percentage() float64 {
	if r.AssessedTotal <= 0 {
		return 0
	}
	return round(r.Score/r.AssessedTotal*100, 2)
}

func (r Result) Balanced() bool {
	return round(r.ComponentTotal, 2) == round(r.TotalMarks, 2)
}

func (r Result) Excused() bool {
	return round(r.AssessedTotal, 2) != round(r.ComponentTotal, 2)
}
