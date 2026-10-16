package timetable

import (
	"context"
	"sort"

	"github.com/google/uuid"

	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
)

type studentSet map[uuid.UUID]struct{}

type studentSets struct {
	byOffering map[uuid.UUID]studentSet
	bySection  map[uuid.UUID]studentSet
}

func (s *Service) loadStudentSets(ctx context.Context, offerings, sections []uuid.UUID) (*studentSets, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}

	sets := &studentSets{
		byOffering: map[uuid.UUID]studentSet{},
		bySection:  map[uuid.UUID]studentSet{},
	}

	offerings = uniqueIDs(offerings)
	if len(offerings) > 0 {
		rows, err := s.client.StudentSubjectEnrollment.Query().
			Where(
				entsubjenroll.SubjectOfferingIDIn(offerings...),
				entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
			).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			set, ok := sets.byOffering[row.SubjectOfferingID]
			if !ok {
				set = studentSet{}
				sets.byOffering[row.SubjectOfferingID] = set
			}
			set[row.StudentID] = struct{}{}
		}
	}

	sections = uniqueIDs(sections)
	if len(sections) > 0 {
		rows, err := s.client.StudentEnrollment.Query().
			Where(
				entenrollment.SectionIDIn(sections...),
				entenrollment.StatusEQ(entenrollment.StatusActive),
			).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			set, ok := sets.bySection[row.SectionID]
			if !ok {
				set = studentSet{}
				sets.bySection[row.SectionID] = set
			}
			set[row.StudentID] = struct{}{}
		}
	}

	return sets, nil
}

func (s *studentSets) forEngagement(offeringID *uuid.UUID, sectionID uuid.UUID) studentSet {
	if offeringID != nil {
		return s.byOffering[*offeringID]
	}
	return s.bySection[sectionID]
}

func intersect(a, b studentSet) []uuid.UUID {
	if len(a) == 0 || len(b) == 0 {
		return nil
	}
	small, large := a, b
	if len(large) < len(small) {
		small, large = large, small
	}
	var out []uuid.UUID
	for id := range small {
		if _, both := large[id]; both {
			out = append(out, id)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
	return out
}
