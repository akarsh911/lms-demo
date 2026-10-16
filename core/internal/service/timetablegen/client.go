package timetablegen

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
)

var (
	ErrNoBaseURL = errors.New("timetablegen: a solver base URL is required")

	ErrNoToken = errors.New("timetablegen: a solver bearer token is required")

	ErrSolverUnreachable = errors.New("timetablegen: the timetable solver is unreachable")

	ErrSolverRejected = errors.New("timetablegen: the timetable solver refused the request")

	ErrSolverUnreadable = errors.New("timetablegen: the timetable solver answered with something this service cannot read")
)

const (
	StatusOptimal    = "OPTIMAL"
	StatusFeasible   = "FEASIBLE"
	StatusInfeasible = "INFEASIBLE"
	StatusUnknown    = "UNKNOWN"
)

const (
	MinimumSolveSeconds = 1
	MaximumSolveSeconds = 120
)

var WeightNames = []string{"stack", "last_period", "teacher_gap", "room_move",
	"minutes_short", "daily_contact"}

var MinutesBases = []string{"nominal", "realised"}

type ClientConfig struct {
	BaseURL string
	Token   string
	Timeout time.Duration
}

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func NewClient(cfg ClientConfig) (*Client, error) {
	base := strings.TrimSpace(cfg.BaseURL)
	if base == "" {
		return nil, ErrNoBaseURL
	}
	if _, err := url.Parse(base); err != nil {
		return nil, fmt.Errorf("timetablegen: unusable base URL %q: %w", base, err)
	}
	token := strings.TrimSpace(cfg.Token)
	if token == "" {
		return nil, ErrNoToken
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Minute
	}
	return &Client{
		baseURL: strings.TrimRight(base, "/"),
		token:   token,
		http:    &http.Client{Timeout: timeout},
	}, nil
}

func (c *Client) String() string { return "timetable solver at " + c.baseURL }

type BlockedCell struct {
	DayOfWeek int
	PeriodID  string
}

func (b BlockedCell) MarshalJSON() ([]byte, error) {
	return json.Marshal([2]any{b.DayOfWeek, b.PeriodID})
}

type DailyContact struct {
	SectionID   string   `json:"section_id"`
	OfferingIDs []string `json:"offering_ids"`
	MinPerDay   int      `json:"min_per_day"`
}

type Config struct {
	MaxSeconds       float64                   `json:"max_seconds,omitempty"`
	NumWorkers       int                       `json:"num_workers,omitempty"`
	Demand           map[string]int            `json:"demand,omitempty"`
	Pins             map[string]map[string]int `json:"pins,omitempty"`
	Unavailable      map[string][]BlockedCell  `json:"unavailable,omitempty"`
	RequiredRoomType map[string]string         `json:"required_room_type,omitempty"`
	HeavySubjects    []string                  `json:"heavy_subjects,omitempty"`
	MinutesBasis     string                    `json:"minutes_basis,omitempty"`
	Weights          map[string]int            `json:"weights,omitempty"`
	DailyContact     []DailyContact            `json:"daily_contact,omitempty"`
}

type Slot struct {
	Ref               string  `json:"ref,omitempty"`
	SectionID         string  `json:"section_id"`
	DayOfWeek         int     `json:"day_of_week"`
	PeriodID          string  `json:"period_id"`
	SubjectOfferingID string  `json:"subject_offering_id"`
	TeacherID         *string `json:"teacher_id,omitempty"`
	RoomID            *string `json:"room_id,omitempty"`
}

type Request struct {
	RequestID string `json:"request_id,omitempty"`
	School    School `json:"school"`
	Config    Config `json:"config"`
	Hint      []Slot `json:"hint,omitempty"`
}

type Answer struct {
	RequestID         string                   `json:"request_id"`
	Status            string                   `json:"status"`
	Verdict           string                   `json:"verdict"`
	ProvenOptimal     bool                     `json:"proven_optimal"`
	Objective         *float64                 `json:"objective"`
	WallTimeS         float64                  `json:"wall_time_s"`
	Slots             []Slot                   `json:"slots"`
	SoftViolations    []shared.SolverViolation `json:"soft_violations"`
	InfeasibilityCore []string                 `json:"infeasibility_core"`
	CoreExplanation   string                   `json:"core_explanation"`
}

func (a *Answer) Solved() bool {
	return a != nil && (a.Status == StatusOptimal || a.Status == StatusFeasible)
}

type Feasibility struct {
	RequestID         string   `json:"request_id"`
	Feasible          bool     `json:"feasible"`
	Cells             int      `json:"cells"`
	Offerings         int      `json:"offerings"`
	Cohorts           int      `json:"cohorts"`
	Demand            int      `json:"demand"`
	InfeasibilityCore []string `json:"infeasibility_core"`
	CoreExplanation   string   `json:"core_explanation"`
}

type Health struct {
	Status  string `json:"status"`
	ORTools string `json:"ortools"`
}

func (c *Client) Solve(ctx context.Context, in Request) (*Answer, error) {
	status, raw, err := c.post(ctx, "/v1/solve", in)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK && status != http.StatusUnprocessableEntity {
		return nil, refusal(status, raw)
	}
	var out Answer
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSolverUnreadable, err)
	}
	if out.Status == "" {
		return nil, fmt.Errorf("%w: the answer names no solver status", ErrSolverUnreadable)
	}
	return &out, nil
}

func (c *Client) Feasibility(ctx context.Context, in Request) (*Feasibility, error) {
	status, raw, err := c.post(ctx, "/v1/feasibility", in)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, refusal(status, raw)
	}
	var out Feasibility
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSolverUnreadable, err)
	}
	return &out, nil
}

func (c *Client) Health(ctx context.Context) (*Health, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/healthz", nil)
	if err != nil {
		return nil, err
	}
	status, raw, err := c.send(req)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, refusal(status, raw)
	}
	var out Health
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSolverUnreadable, err)
	}
	return &out, nil
}

func (c *Client) post(ctx context.Context, path string, in Request) (int, []byte, error) {
	encoded, err := json.Marshal(in)
	if err != nil {
		return 0, nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path,
		bytes.NewReader(encoded))
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return c.send(req)
}

func (c *Client) send(req *http.Request) (int, []byte, error) {
	req.Header.Set("Authorization", "Bearer "+c.token)
	res, err := c.http.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("%w: %v", ErrSolverUnreachable, err)
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 32<<20))
	if err != nil {
		return res.StatusCode, nil, fmt.Errorf("%w: %v", ErrSolverUnreachable, err)
	}
	return res.StatusCode, raw, nil
}

func refusal(status int, raw []byte) error {
	var body struct {
		Message string `json:"message"`
		Error   string `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)
	detail := strings.TrimSpace(body.Message)
	if detail == "" {
		detail = strings.TrimSpace(body.Error)
	}
	if detail == "" {
		detail = strings.TrimSpace(string(raw))
	}
	if len(detail) > 500 {
		detail = detail[:500]
	}
	return fmt.Errorf("%w: %d %s", ErrSolverRejected, status, detail)
}
