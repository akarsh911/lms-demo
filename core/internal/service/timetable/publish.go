package timetable

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entcover "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetablesection"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
)

var (
	ErrAlreadyPublished = errors.New("timetable: this timetable is already published")
	ErrPublishRetired   = errors.New(
		"timetable: a superseded or archived timetable cannot be published again")
	ErrPublishCoversNothing = errors.New(
		"timetable: this timetable covers no section, so publishing it would put nothing in force")

	ErrSupersedesSelf    = errors.New("timetable: a timetable cannot supersede itself")
	ErrSupersedesUnknown = errors.New("timetable: the superseded timetable does not exist")
	ErrSupersedesScheme  = errors.New(
		"timetable: a timetable may only supersede one on the same period scheme")
	ErrSupersedesUnpublished = errors.New(
		"timetable: only a published timetable can be superseded")
	ErrSupersedesNotEarlier = errors.New(
		"timetable: a successor must take effect after the timetable it supersedes")
)

type PublishRequest struct {
	TimetableID  uuid.UUID
	SupersedesID *uuid.UUID
	PublishedBy  *uuid.UUID
	Now          time.Time
}

type PublishConflict struct {
	TimetableID   uuid.UUID   `json:"timetable_id"`
	Name          string      `json:"name"`
	Version       int         `json:"version"`
	EffectiveFrom time.Time   `json:"effective_from"`
	EffectiveTo   *time.Time  `json:"effective_to,omitempty"`
	SectionIDs    []uuid.UUID `json:"section_ids"`
}

type PublishConflictError struct {
	Conflicts []PublishConflict
}

func (e *PublishConflictError) Error() string {
	named := make([]string, 0, len(e.Conflicts))
	for _, c := range e.Conflicts {
		named = append(named, fmt.Sprintf("%q (version %d, %d section(s) in common)",
			c.Name, c.Version, len(c.SectionIDs)))
	}
	return "timetable: publishing would leave sections under two published timetables " +
		"over the same dates, alongside " + strings.Join(named, ", ")
}

func (s *Service) Publish(ctx context.Context, req PublishRequest) (*tenantent.Timetable, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}

	target, err := s.client.Timetable.Get(ctx, req.TimetableID)
	if err != nil {
		if tenantent.IsNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	switch target.Status {
	case enttimetable.StatusPublished:
		return nil, ErrAlreadyPublished
	case enttimetable.StatusSuperseded, enttimetable.StatusArchived:
		return nil, ErrPublishRetired
	}

	predecessor, err := s.predecessorFor(ctx, target, req.SupersedesID)
	if err != nil {
		return nil, err
	}

	cover, err := s.CoveredSections(ctx, target.ID)
	if err != nil {
		return nil, err
	}
	if len(cover) == 0 {
		return nil, ErrPublishCoversNothing
	}

	exempt := []uuid.UUID{target.ID}
	if predecessor != nil {
		exempt = append(exempt, predecessor.ID)
	}
	conflicts, err := s.publishConflicts(ctx, target, cover, exempt)
	if err != nil {
		return nil, err
	}
	if len(conflicts) > 0 {
		return nil, &PublishConflictError{Conflicts: conflicts}
	}

	at := req.Now
	if at.IsZero() {
		at = time.Now().UTC()
	}

	if predecessor != nil {
		closed := Day(target.EffectiveFrom).AddDate(0, 0, -1)
		retire := s.client.Timetable.UpdateOneID(predecessor.ID).
			SetStatus(enttimetable.StatusSuperseded)
		if predecessor.EffectiveTo == nil || Day(*predecessor.EffectiveTo).After(closed) {
			retire = retire.SetEffectiveTo(closed)
		}
		if _, err := retire.Save(ctx); err != nil {
			return nil, err
		}
	}

	update := s.client.Timetable.UpdateOneID(target.ID).
		SetStatus(enttimetable.StatusPublished).
		SetPublishedAt(at).
		SetNillablePublishedBy(req.PublishedBy)
	if predecessor != nil {
		update = update.SetSupersedesID(predecessor.ID)
	}
	return update.Save(ctx)
}

func (s *Service) CoverConflicts(ctx context.Context, timetableID uuid.UUID,
	cover []uuid.UUID) ([]PublishConflict, error) {

	if err := s.ready(); err != nil {
		return nil, err
	}
	if len(cover) == 0 {
		return nil, nil
	}

	target, err := s.client.Timetable.Get(ctx, timetableID)
	if err != nil {
		if tenantent.IsNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return s.publishConflicts(ctx, target, cover, []uuid.UUID{target.ID})
}

func (s *Service) predecessorFor(ctx context.Context, target *tenantent.Timetable,
	asked *uuid.UUID) (*tenantent.Timetable, error) {

	id := asked
	if id == nil {
		id = target.SupersedesID
	}
	if id == nil {
		return nil, nil
	}
	if *id == target.ID {
		return nil, ErrSupersedesSelf
	}

	predecessor, err := s.client.Timetable.Get(ctx, *id)
	if err != nil {
		if tenantent.IsNotFound(err) {
			return nil, ErrSupersedesUnknown
		}
		return nil, err
	}
	if predecessor.PeriodSchemeID != target.PeriodSchemeID {
		return nil, ErrSupersedesScheme
	}
	if predecessor.Status != enttimetable.StatusPublished {
		return nil, ErrSupersedesUnpublished
	}
	if !Day(predecessor.EffectiveFrom).Before(Day(target.EffectiveFrom)) {
		return nil, ErrSupersedesNotEarlier
	}
	return predecessor, nil
}

func (s *Service) CoveredSections(ctx context.Context, timetableID uuid.UUID) ([]uuid.UUID, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}

	declared, err := s.client.TimetableSection.Query().
		Where(entcover.TimetableID(timetableID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(declared) > 0 {
		ids := make([]uuid.UUID, 0, len(declared))
		for _, row := range declared {
			ids = append(ids, row.SectionID)
		}
		return sortedIDs(uniqueIDs(ids)), nil
	}

	slots, err := s.client.TimetableSlot.Query().
		Where(entslot.TimetableID(timetableID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, 0, len(slots))
	for _, slot := range slots {
		ids = append(ids, slot.SectionID)
	}
	return sortedIDs(uniqueIDs(ids)), nil
}

func (s *Service) publishConflicts(ctx context.Context, target *tenantent.Timetable,
	cover, exempt []uuid.UUID) ([]PublishConflict, error) {

	preds := []predicate.Timetable{
		enttimetable.StatusEQ(enttimetable.StatusPublished),
		enttimetable.IDNotIn(exempt...),
		enttimetable.Or(
			enttimetable.EffectiveToIsNil(),
			enttimetable.EffectiveToGTE(Day(target.EffectiveFrom)),
		),
	}
	if target.EffectiveTo != nil {
		preds = append(preds, enttimetable.EffectiveFromLTE(Day(*target.EffectiveTo)))
	}

	candidates, err := s.client.Timetable.Query().Where(preds...).All(ctx)
	if err != nil {
		return nil, err
	}
	if len(candidates) == 0 {
		return nil, nil
	}

	ids := make([]uuid.UUID, 0, len(candidates))
	for _, candidate := range candidates {
		ids = append(ids, candidate.ID)
	}

	shared, err := s.sharedSections(ctx, ids, cover)
	if err != nil {
		return nil, err
	}

	out := make([]PublishConflict, 0, len(shared))
	for _, candidate := range candidates {
		sections := shared[candidate.ID]
		if len(sections) == 0 {
			continue
		}
		out = append(out, PublishConflict{
			TimetableID:   candidate.ID,
			Name:          candidate.Name,
			Version:       candidate.Version,
			EffectiveFrom: Day(candidate.EffectiveFrom),
			EffectiveTo:   candidate.EffectiveTo,
			SectionIDs:    sortedIDs(sections),
		})
	}
	return out, nil
}

func (s *Service) sharedSections(ctx context.Context, candidates, cover []uuid.UUID) (
	map[uuid.UUID][]uuid.UUID, error) {

	shared := map[uuid.UUID][]uuid.UUID{}

	declared, err := s.client.TimetableSection.Query().
		Where(entcover.TimetableIDIn(candidates...)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	wanted := make(map[uuid.UUID]struct{}, len(cover))
	for _, id := range cover {
		wanted[id] = struct{}{}
	}

	declares := map[uuid.UUID]struct{}{}
	for _, row := range declared {
		declares[row.TimetableID] = struct{}{}
		if _, hit := wanted[row.SectionID]; hit {
			shared[row.TimetableID] = append(shared[row.TimetableID], row.SectionID)
		}
	}

	implied := make([]uuid.UUID, 0, len(candidates))
	for _, id := range candidates {
		if _, declared := declares[id]; !declared {
			implied = append(implied, id)
		}
	}
	if len(implied) == 0 {
		return dedupeShared(shared), nil
	}

	slots, err := s.client.TimetableSlot.Query().
		Where(
			entslot.TimetableIDIn(implied...),
			entslot.SectionIDIn(cover...),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, slot := range slots {
		shared[slot.TimetableID] = append(shared[slot.TimetableID], slot.SectionID)
	}
	return dedupeShared(shared), nil
}

func dedupeShared(in map[uuid.UUID][]uuid.UUID) map[uuid.UUID][]uuid.UUID {
	for id, sections := range in {
		in[id] = uniqueIDs(sections)
	}
	return in
}

func sortedIDs(in []uuid.UUID) []uuid.UUID {
	out := make([]uuid.UUID, len(in))
	copy(out, in)
	sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
	return out
}
