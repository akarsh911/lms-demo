package results

import (
	"github.com/google/uuid"
)

type Aggregation string

const (
	AggregationSingle  Aggregation = "single"
	AggregationSum     Aggregation = "sum"
	AggregationBestOf  Aggregation = "best_of"
	AggregationAverage Aggregation = "average"
)

type SourceKind string

const (
	SourceKindExam       SourceKind = "exam"
	SourceKindAssignment SourceKind = "assignment"
)

type SourceRef struct {
	Kind SourceKind `json:"kind"`
	ID   uuid.UUID  `json:"id"`
}

func ExamSource(id uuid.UUID) SourceRef {
	return SourceRef{Kind: SourceKindExam, ID: id}
}

func AssignmentSource(id uuid.UUID) SourceRef {
	return SourceRef{Kind: SourceKindAssignment, ID: id}
}

type Source struct {
	Ref          SourceRef `json:"ref"`
	Label        string    `json:"label,omitempty"`
	MaximumMarks float64   `json:"maximum_marks"`
}

type Component struct {
	ID           uuid.UUID   `json:"id"`
	Name         string      `json:"name"`
	Position     int         `json:"position"`
	MaximumMarks float64     `json:"maximum_marks"`
	Weight       float64     `json:"weight"`
	Aggregation  Aggregation `json:"aggregation"`
	TakeBest     int         `json:"take_best,omitempty"`
	Sources      []Source    `json:"sources"`
}

type Scheme struct {
	ID         uuid.UUID   `json:"id"`
	Name       string      `json:"name,omitempty"`
	TotalMarks float64     `json:"total_marks"`
	Components []Component `json:"components"`
}

type MarkStatus string

const (
	MarkStatusScored MarkStatus = "scored"
	MarkStatusAbsent MarkStatus = "absent"
	MarkStatusExempt MarkStatus = "exempt"
)

type Mark struct {
	Source      SourceRef  `json:"source"`
	Status      MarkStatus `json:"status"`
	Obtained    float64    `json:"obtained"`
	Provisional bool       `json:"provisional,omitempty"`
}

func Scored(source SourceRef, obtained float64) Mark {
	return Mark{Source: source, Status: MarkStatusScored, Obtained: obtained}
}

func ScoredProvisionally(source SourceRef, obtained float64) Mark {
	return Mark{Source: source, Status: MarkStatusScored, Obtained: obtained, Provisional: true}
}

func Absent(source SourceRef) Mark {
	return Mark{Source: source, Status: MarkStatusAbsent}
}

func Exempt(source SourceRef) Mark {
	return Mark{Source: source, Status: MarkStatusExempt}
}
