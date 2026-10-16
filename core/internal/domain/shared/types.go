package shared

import "github.com/google/uuid"

type Address struct {
	Line1      string `json:"line1,omitempty"`
	Line2      string `json:"line2,omitempty"`
	Landmark   string `json:"landmark,omitempty"`
	City       string `json:"city,omitempty"`
	District   string `json:"district,omitempty"`
	State      string `json:"state,omitempty"`
	PostalCode string `json:"postal_code,omitempty"`
	Country    string `json:"country,omitempty"`
}

type Qualification struct {
	Degree      string `json:"degree,omitempty"`
	Institution string `json:"institution,omitempty"`
	Field       string `json:"field,omitempty"`
	Year        int    `json:"year,omitempty"`
	GradeOrCGPA string `json:"grade_or_cgpa,omitempty"`
}

type Metadata map[string]any

type PaperProvenance struct {
	PersonaID string `json:"persona_id,omitempty"`
	Seed      string `json:"seed,omitempty"`
}

type AcceptedClash struct {
	Rule                   string     `json:"rule"`
	Scope                  string     `json:"scope,omitempty"`
	DayOfWeek              int        `json:"day_of_week"`
	PeriodID               *uuid.UUID `json:"period_id,omitempty"`
	Date                   string     `json:"date,omitempty"`
	CounterpartSlotID      *uuid.UUID `json:"counterpart_timetable_slot_id,omitempty"`
	CounterpartDeviationID *uuid.UUID `json:"counterpart_timetable_deviation_id,omitempty"`
	CounterpartSectionID   *uuid.UUID `json:"counterpart_section_id,omitempty"`
	TeacherID              *uuid.UUID `json:"teacher_id,omitempty"`
	RoomID                 *uuid.UUID `json:"room_id,omitempty"`
	StudentCount           int        `json:"student_count,omitempty"`
}

type GenerationCell struct {
	DayOfWeek int       `json:"day_of_week"`
	PeriodID  uuid.UUID `json:"period_id"`
}

type DailyContactRule struct {
	SectionID    string   `json:"section_id"`
	OfferingIDs  []string `json:"offering_ids,omitempty"`
	ClassTeacher bool     `json:"class_teacher,omitempty"`
	MinPerDay    int      `json:"min_per_day,omitempty"`
}

type GenerationOptions struct {
	MaxSeconds       int                         `json:"max_seconds,omitempty"`
	ReplaceExisting  bool                        `json:"replace_existing,omitempty"`
	Hint             bool                        `json:"hint,omitempty"`
	MinutesBasis     string                      `json:"minutes_basis,omitempty"`
	Demand           map[string]int              `json:"demand,omitempty"`
	Pins             map[string]map[string]int   `json:"pins,omitempty"`
	Unavailable      map[string][]GenerationCell `json:"unavailable,omitempty"`
	RequiredRoomType map[string]string           `json:"required_room_type,omitempty"`
	HeavySubjects    []string                    `json:"heavy_subjects,omitempty"`
	Weights          map[string]int              `json:"weights,omitempty"`
	DailyContact     []DailyContactRule          `json:"daily_contact,omitempty"`
}

type SolverViolation struct {
	Kind    string  `json:"kind"`
	Key     string  `json:"key"`
	Target  float64 `json:"target"`
	Actual  float64 `json:"actual"`
	Amount  float64 `json:"amount"`
	Message string  `json:"message"`
}
