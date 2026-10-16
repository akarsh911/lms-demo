package timetable

import (
	"context"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
)

type Override struct {
	Reason   string                 `json:"reason"`
	By       *uuid.UUID             `json:"overridden_by,omitempty"`
	At       *time.Time             `json:"overridden_at,omitempty"`
	SlotID   *uuid.UUID             `json:"timetable_slot_id,omitempty"`
	Accepted []shared.AcceptedClash `json:"-"`
}

func (r Rule) Overridable() bool {
	switch r {
	case RuleTeacher, RuleRoom:
		return true
	}
	return false
}

func OverridableRules() []Rule {
	out := make([]Rule, 0, len(AllRules()))
	for _, rule := range AllRules() {
		if rule.Overridable() {
			out = append(out, rule)
		}
	}
	return out
}

func (r *ClashReport) Blocking() []Clash {
	if r == nil {
		return nil
	}
	out := make([]Clash, 0, len(r.Clashes))
	for _, clash := range r.Clashes {
		if clash.Overridden {
			continue
		}
		out = append(out, clash)
	}
	return out
}

func (r *ClashReport) Overridden() []Clash {
	if r == nil {
		return nil
	}
	out := make([]Clash, 0, len(r.Clashes))
	for _, clash := range r.Clashes {
		if clash.Overridden {
			out = append(out, clash)
		}
	}
	return out
}

func AcceptedFor(report *ClashReport, ref string) []shared.AcceptedClash {
	if report == nil || ref == "" {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]shared.AcceptedClash, 0, len(report.Clashes))
	for _, clash := range report.Clashes {
		if !clash.Rule.Overridable() {
			continue
		}
		other, ok := counterpartOf(clash, ref)
		if !ok {
			continue
		}
		record := acceptedClash(clash, other)
		if recordKey(record) == "" {
			continue
		}
		key := matchKey(record)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, record)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func counterpartOf(clash Clash, ref string) (Party, bool) {
	switch {
	case clash.Left.Ref == ref:
		return clash.Right, true
	case clash.Right.Ref == ref:
		return clash.Left, true
	}
	return Party{}, false
}

func acceptedClash(clash Clash, other Party) shared.AcceptedClash {
	section := other.SectionID
	record := shared.AcceptedClash{
		Rule:                   string(clash.Rule),
		Scope:                  string(clash.Scope),
		DayOfWeek:              clash.DayOfWeek,
		PeriodID:               clash.PeriodID,
		CounterpartSlotID:      other.SlotID,
		CounterpartDeviationID: other.DeviationID,
		TeacherID:              clash.TeacherID,
		RoomID:                 clash.RoomID,
		StudentCount:           clash.StudentCount,
	}
	if section != uuid.Nil {
		record.CounterpartSectionID = &section
	}
	if clash.Date != nil {
		record.Date = clash.Date.Format(dateLayout)
	}
	return record
}

func recordKey(record shared.AcceptedClash) string {
	switch {
	case record.CounterpartSlotID != nil:
		return "slot:" + record.CounterpartSlotID.String()
	case record.CounterpartDeviationID != nil:
		return "dev:" + record.CounterpartDeviationID.String()
	}
	return ""
}

func partyKey(party Party) string {
	switch {
	case party.SlotID != nil:
		return "slot:" + party.SlotID.String()
	case party.DeviationID != nil:
		return "dev:" + party.DeviationID.String()
	}
	return ""
}

func matchKey(record shared.AcceptedClash) string {
	period := ""
	if record.PeriodID != nil {
		period = record.PeriodID.String()
	}
	return record.Rule + "|" + strconv.Itoa(record.DayOfWeek) + "|" + period + "|" + recordKey(record)
}

func clashMatchKey(clash Clash, other Party) string {
	period := ""
	if clash.PeriodID != nil {
		period = clash.PeriodID.String()
	}
	return string(clash.Rule) + "|" + strconv.Itoa(clash.DayOfWeek) + "|" + period + "|" + partyKey(other)
}

func accepts(override *Override, clash Clash, other Party) bool {
	if override == nil || len(override.Accepted) == 0 {
		return false
	}
	want := clashMatchKey(clash, other)
	if partyKey(other) == "" {
		return false
	}
	for _, record := range override.Accepted {
		if matchKey(record) == want {
			return true
		}
	}
	return false
}

func (s *Service) markOverrides(ctx context.Context, report *ClashReport, proposals []Proposal) error {
	if report == nil || len(report.Clashes) == 0 {
		return nil
	}

	held, err := s.storedOverrides(ctx, report.Clashes)
	if err != nil {
		return err
	}

	asserted := map[string]*Override{}
	for _, proposal := range proposals {
		if proposal.Ref == "" || proposal.Override == nil {
			continue
		}
		asserted[proposal.Ref] = proposal.Override
	}

	for i := range report.Clashes {
		clash := report.Clashes[i]
		if !clash.Rule.Overridable() {
			continue
		}
		if note := acceptedBy(held, asserted, clash); note != nil {
			report.Clashes[i].Overridden = true
			report.Clashes[i].Override = note
		}
	}
	return nil
}

func (s *Service) storedOverrides(ctx context.Context,
	clashes []Clash) (map[uuid.UUID]*Override, error) {
	var ids []uuid.UUID
	for _, clash := range clashes {
		for _, party := range []Party{clash.Left, clash.Right} {
			if party.SlotID != nil {
				ids = append(ids, *party.SlotID)
			}
		}
	}
	ids = uniqueIDs(ids)
	if len(ids) == 0 {
		return nil, nil
	}

	rows, err := s.client.TimetableSlot.Query().
		Where(entslot.IDIn(ids...), entslot.ClashOverride(true)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	out := make(map[uuid.UUID]*Override, len(rows))
	for _, row := range rows {
		if len(row.ClashOverrideJSON) == 0 {
			continue
		}
		id := row.ID
		note := &Override{SlotID: &id, Accepted: row.ClashOverrideJSON}
		if row.ClashOverrideReason != nil {
			note.Reason = *row.ClashOverrideReason
		}
		note.By = row.ClashOverriddenBy
		note.At = row.ClashOverriddenAt
		out[id] = note
	}
	return out, nil
}

func acceptedBy(held map[uuid.UUID]*Override, asserted map[string]*Override, clash Clash) *Override {
	for _, pair := range [2][2]Party{{clash.Left, clash.Right}, {clash.Right, clash.Left}} {
		holder, other := pair[0], pair[1]

		var note *Override
		switch {
		case holder.SlotID != nil:
			note = held[*holder.SlotID]
		case holder.Ref != "":
			note = asserted[holder.Ref]
		}
		if accepts(note, clash, other) {
			return note
		}
	}
	return nil
}
