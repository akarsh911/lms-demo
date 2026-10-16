package timetable

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entperiodscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
)

const DefaultClashStudents = 25

type Rule string

const (
	RuleTeacher    Rule = "teacher"
	RuleRoom       Rule = "room"
	RuleStudentSet Rule = "student_set"
)

func (r Rule) Known() bool {
	switch r {
	case RuleTeacher, RuleRoom, RuleStudentSet:
		return true
	}
	return false
}

func AllRules() []Rule { return []Rule{RuleTeacher, RuleRoom, RuleStudentSet} }

type Scope string

const (
	ScopePattern Scope = "pattern"
	ScopeDate    Scope = "date"
)

type Party struct {
	Ref               string     `json:"ref,omitempty"`
	SlotID            *uuid.UUID `json:"timetable_slot_id,omitempty"`
	DeviationID       *uuid.UUID `json:"timetable_deviation_id,omitempty"`
	TimetableID       *uuid.UUID `json:"timetable_id,omitempty"`
	SectionID         uuid.UUID  `json:"section_id"`
	PeriodID          uuid.UUID  `json:"period_id"`
	SubjectOfferingID *uuid.UUID `json:"subject_offering_id,omitempty"`
	TeacherID         *uuid.UUID `json:"teacher_id,omitempty"`
	RoomID            *uuid.UUID `json:"room_id,omitempty"`
	StartMinute       int        `json:"start_minute,omitempty"`
	EndMinute         int        `json:"end_minute,omitempty"`
}

type Clash struct {
	Rule      Rule       `json:"rule"`
	Scope     Scope      `json:"scope"`
	DayOfWeek int        `json:"day_of_week"`
	PeriodID  *uuid.UUID `json:"period_id,omitempty"`
	Date      *time.Time `json:"date,omitempty"`
	From      *time.Time `json:"effective_from,omitempty"`
	To        *time.Time `json:"effective_to,omitempty"`

	TeacherID    *uuid.UUID  `json:"teacher_id,omitempty"`
	RoomID       *uuid.UUID  `json:"room_id,omitempty"`
	StudentIDs   []uuid.UUID `json:"student_ids,omitempty"`
	StudentCount int         `json:"student_count,omitempty"`

	Overridable bool      `json:"overridable"`
	Overridden  bool      `json:"overridden,omitempty"`
	Override    *Override `json:"override,omitempty"`

	Left  Party `json:"left"`
	Right Party `json:"right"`
}

type Proposal struct {
	Ref               string
	ReplacesSlotID    *uuid.UUID
	SectionID         uuid.UUID
	PeriodID          uuid.UUID
	DayOfWeek         int
	SubjectOfferingID *uuid.UUID
	TeacherID         *uuid.UUID
	RoomID            *uuid.UUID
	Override          *Override
}

type ClashQuery struct {
	BranchID       uuid.UUID
	TimetableID    uuid.UUID
	Proposed       []Proposal
	ExcludeSlotIDs []uuid.UUID
	From           time.Time
	To             time.Time
	Rules          []Rule
	MaxStudents    int
}

type ClashReport struct {
	Clashes      []Clash     `json:"clashes"`
	DatesChecked []time.Time `json:"dates_checked,omitempty"`
}

func (r *ClashReport) Clear() bool { return r == nil || len(r.Clashes) == 0 }

type engagement struct {
	ident     string
	party     Party
	dayOfWeek int
	periodID  uuid.UUID
	from      time.Time
	to        *time.Time
	target    bool
}

func (s *Service) Check(ctx context.Context, q ClashQuery) (*ClashReport, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	if q.BranchID == uuid.Nil {
		return nil, ErrBranchRequired
	}
	rules, err := ruleSet(q.Rules)
	if err != nil {
		return nil, err
	}
	for _, proposal := range q.Proposed {
		if proposal.SectionID == uuid.Nil {
			return nil, ErrSectionRequired
		}
		if proposal.PeriodID == uuid.Nil {
			return nil, ErrPeriodRequired
		}
		if proposal.DayOfWeek < 1 || proposal.DayOfWeek > 7 {
			return nil, ErrDayOfWeekInvalid
		}
	}

	target, err := s.client.Timetable.Query().
		Where(
			enttimetable.ID(q.TimetableID),
			enttimetable.HasPeriodSchemeWith(entperiodscheme.BranchID(q.BranchID)),
		).
		Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	excluded := map[uuid.UUID]struct{}{}
	for _, id := range q.ExcludeSlotIDs {
		excluded[id] = struct{}{}
	}
	for _, proposal := range q.Proposed {
		if proposal.ReplacesSlotID != nil {
			excluded[*proposal.ReplacesSlotID] = struct{}{}
		}
	}

	report := &ClashReport{Clashes: []Clash{}}
	seen := map[string]struct{}{}

	patternClashes, err := s.patternPass(ctx, target, q, rules, excluded, seen)
	if err != nil {
		return nil, err
	}
	report.Clashes = append(report.Clashes, patternClashes...)

	datedClashes, dates, err := s.datedPass(ctx, target, q, rules, excluded, seen)
	if err != nil {
		return nil, err
	}
	report.Clashes = append(report.Clashes, datedClashes...)
	report.DatesChecked = dates

	if err := s.markOverrides(ctx, report, q.Proposed); err != nil {
		return nil, err
	}

	sortClashes(report.Clashes)
	return report, nil
}

func ruleSet(in []Rule) (map[Rule]bool, error) {
	if len(in) == 0 {
		in = AllRules()
	}
	out := map[Rule]bool{}
	for _, rule := range in {
		if !rule.Known() {
			return nil, ErrRuleUnknown
		}
		out[rule] = true
	}
	return out, nil
}

func (s *Service) patternPass(
	ctx context.Context,
	target *tenantent.Timetable,
	q ClashQuery,
	rules map[Rule]bool,
	excluded map[uuid.UUID]struct{},
	seen map[string]struct{},
) ([]Clash, error) {
	statuses := []enttimetable.Status{enttimetable.StatusPublished}
	if target.Status != enttimetable.StatusPublished {
		statuses = append(statuses, target.Status)
	}

	versions, err := s.client.Timetable.Query().
		Where(
			enttimetable.PeriodSchemeID(target.PeriodSchemeID),
			enttimetable.StatusIn(statuses...),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	relevant := make([]*tenantent.Timetable, 0, len(versions))
	byID := map[uuid.UUID]*tenantent.Timetable{}
	for _, version := range versions {
		if _, _, ok := overlap(target.EffectiveFrom, target.EffectiveTo, version.EffectiveFrom, version.EffectiveTo); !ok {
			continue
		}
		relevant = append(relevant, version)
		byID[version.ID] = version
	}
	if len(relevant) == 0 {
		return nil, nil
	}

	ids := make([]uuid.UUID, 0, len(relevant))
	for _, version := range relevant {
		ids = append(ids, version.ID)
	}

	slots, err := s.client.TimetableSlot.Query().
		Where(entslot.TimetableIDIn(ids...)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	engagements := make([]engagement, 0, len(slots)+len(q.Proposed))
	for _, slot := range slots {
		if _, skip := excluded[slot.ID]; skip {
			continue
		}
		version := byID[slot.TimetableID]
		slotID := slot.ID
		timetableID := slot.TimetableID
		engagements = append(engagements, engagement{
			ident:     slotID.String(),
			dayOfWeek: slot.DayOfWeek,
			periodID:  slot.PeriodID,
			from:      version.EffectiveFrom,
			to:        version.EffectiveTo,
			target:    slot.TimetableID == target.ID,
			party: Party{
				SlotID:            &slotID,
				TimetableID:       &timetableID,
				SectionID:         slot.SectionID,
				PeriodID:          slot.PeriodID,
				SubjectOfferingID: slot.SubjectOfferingID,
				TeacherID:         slot.TeacherID,
				RoomID:            slot.RoomID,
			},
		})
	}
	for _, proposal := range q.Proposed {
		timetableID := target.ID
		engagements = append(engagements, engagement{
			ident:     "ref:" + proposal.Ref,
			dayOfWeek: proposal.DayOfWeek,
			periodID:  proposal.PeriodID,
			from:      target.EffectiveFrom,
			to:        target.EffectiveTo,
			target:    true,
			party: Party{
				Ref:               proposal.Ref,
				TimetableID:       &timetableID,
				SectionID:         proposal.SectionID,
				PeriodID:          proposal.PeriodID,
				SubjectOfferingID: proposal.SubjectOfferingID,
				TeacherID:         proposal.TeacherID,
				RoomID:            proposal.RoomID,
			},
		})
	}

	sets, err := s.setsFor(ctx, engagements)
	if err != nil {
		return nil, err
	}

	limit := q.MaxStudents
	if limit <= 0 {
		limit = DefaultClashStudents
	}

	var out []Clash
	for i := 0; i < len(engagements); i++ {
		for j := i + 1; j < len(engagements); j++ {
			a, b := engagements[i], engagements[j]
			if !a.target && !b.target {
				continue
			}
			if a.dayOfWeek != b.dayOfWeek || a.periodID != b.periodID {
				continue
			}
			lo, hi, ok := overlap(a.from, a.to, b.from, b.to)
			if !ok {
				continue
			}
			first := firstDayOfWeekOnOrAfter(lo, hi, a.dayOfWeek)
			if first == nil {
				continue
			}
			periodID := a.periodID
			base := Clash{
				Scope:     ScopePattern,
				DayOfWeek: a.dayOfWeek,
				PeriodID:  &periodID,
				From:      &lo,
				To:        hi,
				Left:      a.party,
				Right:     b.party,
			}
			out = append(out, judge(a, b, base, rules, sets, limit, seen)...)
		}
	}
	return out, nil
}

func (s *Service) datedPass(
	ctx context.Context,
	target *tenantent.Timetable,
	q ClashQuery,
	rules map[Rule]bool,
	excluded map[uuid.UUID]struct{},
	seen map[string]struct{},
) ([]Clash, []time.Time, error) {
	dates, err := s.datesToCheck(ctx, target, q)
	if err != nil {
		return nil, nil, err
	}
	if len(dates) == 0 {
		return nil, nil, nil
	}

	p, err := s.buildPlan(ctx, planQuery{
		branchID:  q.BranchID,
		from:      dates[0],
		to:        dates[len(dates)-1],
		statuses:  planStatuses(target),
		skipSlots: excluded,
		wholeDay:  true,
	})
	if err != nil {
		return nil, nil, err
	}

	limit := q.MaxStudents
	if limit <= 0 {
		limit = DefaultClashStudents
	}

	var out []Clash
	for _, date := range dates {
		occurrences := p.occurrencesOn(date, HalfAny, true)
		occurrences = append(occurrences, p.proposalsOn(date, target, q.Proposed)...)
		if len(occurrences) < 2 {
			continue
		}

		engagements := make([]engagement, 0, len(occurrences))
		for _, occ := range occurrences {
			engagements = append(engagements, engagementOf(occ, target.ID))
		}

		sets, err := s.setsFor(ctx, engagements)
		if err != nil {
			return nil, nil, err
		}

		for i := 0; i < len(engagements); i++ {
			for j := i + 1; j < len(engagements); j++ {
				a, b := engagements[i], engagements[j]
				if !a.target && !b.target {
					continue
				}
				if !concurrent(occurrences[i], occurrences[j]) {
					continue
				}
				when := Day(date)
				periodID := a.periodID
				base := Clash{
					Scope:     ScopeDate,
					DayOfWeek: ISODayOfWeek(date),
					PeriodID:  &periodID,
					Date:      &when,
					Left:      a.party,
					Right:     b.party,
				}
				out = append(out, judge(a, b, base, rules, sets, limit, seen)...)
			}
		}
	}
	return out, dates, nil
}

func planStatuses(target *tenantent.Timetable) []enttimetable.Status {
	statuses := []enttimetable.Status{enttimetable.StatusPublished}
	if target.Status != enttimetable.StatusPublished {
		statuses = append(statuses, target.Status)
	}
	return statuses
}

func concurrent(a, b Occurrence) bool {
	if a.TimesResolved && b.TimesResolved {
		return a.StartMinute < b.EndMinute && b.StartMinute < a.EndMinute
	}
	return a.PeriodID == b.PeriodID
}

func engagementOf(occ Occurrence, targetID uuid.UUID) engagement {
	ident := occ.ID.String()
	switch {
	case occ.proposalRef != "":
		ident = "ref:" + occ.proposalRef
	case occ.SlotID != nil:
		ident = occ.SlotID.String()
	case occ.DeviationID != nil:
		ident = "dev:" + occ.DeviationID.String()
	}
	target := occ.proposalRef != "" || (occ.TimetableID != nil && *occ.TimetableID == targetID)
	return engagement{
		ident:     ident,
		dayOfWeek: occ.DayOfWeek,
		periodID:  occ.PeriodID,
		from:      occ.Date,
		to:        &occ.Date,
		target:    target,
		party: Party{
			Ref:               occ.proposalRef,
			SlotID:            occ.SlotID,
			DeviationID:       occ.DeviationID,
			TimetableID:       occ.TimetableID,
			SectionID:         occ.SectionID,
			PeriodID:          occ.PeriodID,
			SubjectOfferingID: occ.SubjectOfferingID,
			TeacherID:         occ.TeacherID,
			RoomID:            occ.RoomID,
			StartMinute:       occ.StartMinute,
			EndMinute:         occ.EndMinute,
		},
	}
}

func (p *plan) proposalsOn(date time.Time, target *tenantent.Timetable, proposals []Proposal) []Occurrence {
	if len(proposals) == 0 {
		return nil
	}
	key := dayKey(date)
	day, ok := p.dayByKey[key]
	if !ok || !day.Open(HalfAny) {
		return nil
	}
	inForce := p.inForce[schemeDateKey(target.PeriodSchemeID, date)]
	if inForce == nil || inForce.ID != target.ID {
		return nil
	}
	var sched *scheduleRef
	for _, candidate := range p.schedules[key] {
		if candidate.PeriodSchemeID == target.PeriodSchemeID {
			found := candidate
			sched = &found
			break
		}
	}
	if sched == nil {
		return nil
	}

	var out []Occurrence
	for _, proposal := range proposals {
		dow := p.dayOfWeekFor(date, proposal.SectionID)
		if proposal.DayOfWeek != dow {
			continue
		}
		timetableID := target.ID
		occ := Occurrence{
			ID:                AddedOccurrenceID(uuid.NewSHA1(NamespaceOccurrence, []byte(proposal.Ref)), date),
			Date:              Day(date),
			DayOfWeek:         dow,
			CalendarDayOfWeek: ISODayOfWeek(date),
			State:             StatePlanned,
			BranchID:          p.branchID,
			CalendarDayID:     day.ID,
			DayType:           day.DayType,
			PeriodSchemeID:    sched.PeriodSchemeID,
			BellScheduleID:    sched.BellScheduleID,
			TimetableID:       &timetableID,
			SectionID:         proposal.SectionID,
			PeriodID:          proposal.PeriodID,
			SubjectOfferingID: proposal.SubjectOfferingID,
			TeacherID:         proposal.TeacherID,
			RoomID:            proposal.RoomID,
			proposalRef:       proposal.Ref,
		}
		p.describePeriod(&occ)
		if span, ok := p.span(sched.BellScheduleID, proposal.PeriodID); ok {
			occ.StartMinute, occ.EndMinute, occ.TimesResolved = span.Start, span.End, true
		}
		occ.Half = halfOf(occ)
		out = append(out, occ)
	}
	return out
}

func (s *Service) datesToCheck(ctx context.Context, target *tenantent.Timetable, q ClashQuery) ([]time.Time, error) {
	if !q.From.IsZero() && !q.To.IsZero() {
		lo, hi, err := validRange(q.BranchID, q.From, q.To, HalfAny)
		if err != nil {
			return nil, err
		}
		return eachDay(lo, hi), nil
	}

	lo := Day(target.EffectiveFrom)
	hi := lo.AddDate(0, 0, MaxRangeDays-1)
	if target.EffectiveTo != nil && Day(*target.EffectiveTo).Before(hi) {
		hi = Day(*target.EffectiveTo)
	}

	rows, err := s.client.TimetableDeviation.Query().
		Where(
			entdeviation.DeviationDateGTE(lo),
			entdeviation.DeviationDateLTE(hi),
			entdeviation.HasSectionWith(entsection.BranchID(q.BranchID)),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	seen := map[string]struct{}{}
	var dates []time.Time
	for _, row := range rows {
		key := dayKey(row.DeviationDate)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		dates = append(dates, Day(row.DeviationDate))
	}
	sort.Slice(dates, func(i, j int) bool { return dates[i].Before(dates[j]) })
	return dates, nil
}

func (s *Service) setsFor(ctx context.Context, engagements []engagement) (*studentSets, error) {
	var offerings, sections []uuid.UUID
	for _, e := range engagements {
		if e.party.SubjectOfferingID != nil {
			offerings = append(offerings, *e.party.SubjectOfferingID)
			continue
		}
		sections = append(sections, e.party.SectionID)
	}
	return s.loadStudentSets(ctx, offerings, sections)
}

func judge(a, b engagement, base Clash, rules map[Rule]bool, sets *studentSets, limit int, seen map[string]struct{}) []Clash {
	var out []Clash

	if rules[RuleTeacher] && a.party.TeacherID != nil && b.party.TeacherID != nil &&
		*a.party.TeacherID == *b.party.TeacherID {
		if record(seen, RuleTeacher, a, b, base) {
			clash := base
			clash.Rule = RuleTeacher
			clash.Overridable = RuleTeacher.Overridable()
			clash.TeacherID = a.party.TeacherID
			out = append(out, clash)
		}
	}

	if rules[RuleRoom] && a.party.RoomID != nil && b.party.RoomID != nil &&
		*a.party.RoomID == *b.party.RoomID {
		if record(seen, RuleRoom, a, b, base) {
			clash := base
			clash.Rule = RuleRoom
			clash.Overridable = RuleRoom.Overridable()
			clash.RoomID = a.party.RoomID
			out = append(out, clash)
		}
	}

	if rules[RuleStudentSet] {
		shared := intersect(
			sets.forEngagement(a.party.SubjectOfferingID, a.party.SectionID),
			sets.forEngagement(b.party.SubjectOfferingID, b.party.SectionID),
		)
		if len(shared) > 0 && record(seen, RuleStudentSet, a, b, base) {
			clash := base
			clash.Rule = RuleStudentSet
			clash.Overridable = RuleStudentSet.Overridable()
			clash.StudentCount = len(shared)
			if len(shared) > limit {
				shared = shared[:limit]
			}
			clash.StudentIDs = shared
			out = append(out, clash)
		}
	}

	return out
}

func record(seen map[string]struct{}, rule Rule, a, b engagement, base Clash) bool {
	lo, hi := a.ident, b.ident
	if hi < lo {
		lo, hi = hi, lo
	}
	key := string(rule) + "|" + lo + "|" + hi + "|" + base.PeriodID.String()
	if base.Scope == ScopeDate {
		if _, already := seen[key]; already {
			return false
		}
		dateKey := key + "|" + dayKey(*base.Date)
		if _, already := seen[dateKey]; already {
			return false
		}
		seen[dateKey] = struct{}{}
		return true
	}
	if _, already := seen[key]; already {
		return false
	}
	seen[key] = struct{}{}
	return true
}

func sortClashes(in []Clash) {
	sort.SliceStable(in, func(i, j int) bool {
		a, b := in[i], in[j]
		if a.Scope != b.Scope {
			return a.Scope == ScopePattern
		}
		if a.Date != nil && b.Date != nil && !a.Date.Equal(*b.Date) {
			return a.Date.Before(*b.Date)
		}
		if a.DayOfWeek != b.DayOfWeek {
			return a.DayOfWeek < b.DayOfWeek
		}
		if a.Rule != b.Rule {
			return a.Rule < b.Rule
		}
		return a.Left.SectionID.String() < b.Left.SectionID.String()
	})
}
