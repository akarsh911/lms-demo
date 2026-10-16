package retrieval

import (
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	entcontent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
)

const SegmentSeparator = "."

const (
	prefixUnrestricted = "unrestricted_"
	prefixSchool       = "school_"
	prefixGrade        = "grade_"
	prefixSection      = "section_"
	prefixOffering     = "offering_"
	prefixPerson       = "person_"
)

var (
	ErrUnknownAudience = errors.New("retrieval: unknown content audience")
	ErrMissingAnchor   = errors.New("retrieval: content audience has no anchor id")
	ErrInvalidLabel    = errors.New("retrieval: invalid scope label")
	ErrNotPublished    = errors.New("retrieval: content item is not published")
)

var (
	ErrUnresolved            = errors.New("retrieval: scope set unresolved")
	ErrNoViewer              = fmt.Errorf("%w: no viewer", ErrUnresolved)
	ErrNoSchool              = fmt.Errorf("%w: no school", ErrUnresolved)
	ErrSectionGradesUnknown  = fmt.Errorf("%w: section grade levels unavailable", ErrUnresolved)
	ErrPinnedScopeUnresolved = fmt.Errorf("%w: constrained grant not expressible as labels", ErrUnresolved)
)

type Item struct {
	SchoolID          uuid.UUID
	Audience          entcontent.Audience
	Status            entcontent.Status
	GradeLevelID      *uuid.UUID
	SectionID         *uuid.UUID
	SubjectOfferingID *uuid.UUID
	OwnerPersonID     uuid.UUID
}

type anchor struct {
	prefix string
	id     func(Item) uuid.UUID
}

var audienceAnchors = map[entcontent.Audience]anchor{
	entcontent.AudienceSchool:   {prefix: prefixSchool, id: func(i Item) uuid.UUID { return i.SchoolID }},
	entcontent.AudienceGrade:    {prefix: prefixGrade, id: func(i Item) uuid.UUID { return value(i.GradeLevelID) }},
	entcontent.AudienceSection:  {prefix: prefixSection, id: func(i Item) uuid.UUID { return value(i.SectionID) }},
	entcontent.AudienceOffering: {prefix: prefixOffering, id: func(i Item) uuid.UUID { return value(i.SubjectOfferingID) }},
	entcontent.AudienceOwner:    {prefix: prefixPerson, id: func(i Item) uuid.UUID { return i.OwnerPersonID }},
}

func value(id *uuid.UUID) uuid.UUID {
	if id == nil {
		return uuid.Nil
	}
	return *id
}

func mint(prefix string, id uuid.UUID) (string, error) {
	if id == uuid.Nil {
		return "", ErrMissingAnchor
	}
	label := prefix + id.String()
	if err := validate(label); err != nil {
		return "", err
	}
	return label, nil
}

func validate(label string) error {
	switch {
	case label == "":
		return fmt.Errorf("%w: empty", ErrInvalidLabel)
	case strings.Contains(label, SegmentSeparator):
		return fmt.Errorf("%w: %q spans segments", ErrInvalidLabel, label)
	case strings.HasPrefix(label, "_"):
		return fmt.Errorf("%w: %q is reserved", ErrInvalidLabel, label)
	case strings.ContainsAny(label, " \t\r\n"):
		return fmt.Errorf("%w: %q carries whitespace", ErrInvalidLabel, label)
	}
	return nil
}

func UnrestrictedLabel(schoolID uuid.UUID) (string, error) {
	return mint(prefixUnrestricted, schoolID)
}

func LabelFor(item Item) (string, error) {
	a, known := audienceAnchors[item.Audience]
	if !known {
		return "", fmt.Errorf("%w: %q", ErrUnknownAudience, item.Audience)
	}
	label, err := mint(a.prefix, a.id(item))
	if err != nil {
		return "", fmt.Errorf("%w: audience %q", err, item.Audience)
	}
	return label, nil
}

func LabelsFor(item Item) ([]string, error) {
	if item.Status != entcontent.StatusPublished {
		return nil, fmt.Errorf("%w: %q", ErrNotPublished, item.Status)
	}
	wildcard, err := UnrestrictedLabel(item.SchoolID)
	if err != nil {
		return nil, fmt.Errorf("%w: school", err)
	}
	own, err := LabelFor(item)
	if err != nil {
		return nil, err
	}
	return []string{wildcard, own}, nil
}

type Scopes struct {
	resolved     bool
	unrestricted bool
	labels       []string
}

func (s Scopes) Resolved() bool { return s.resolved }

func (s Scopes) Unrestricted() bool { return s.resolved && s.unrestricted }

func (s Scopes) Labels() ([]string, error) {
	if !s.resolved {
		return nil, ErrUnresolved
	}
	out := make([]string, len(s.labels))
	copy(out, s.labels)
	return out, nil
}

func (s Scopes) Contains(label string) bool {
	if !s.resolved {
		return false
	}
	for _, held := range s.labels {
		if held == label {
			return true
		}
	}
	return false
}

type SectionGrades map[uuid.UUID]uuid.UUID

type labelSet struct {
	seen map[string]struct{}
	out  []string
	err  error
}

func newLabelSet() *labelSet {
	return &labelSet{seen: map[string]struct{}{}}
}

func (s *labelSet) add(prefix string, id uuid.UUID) {
	if s.err != nil {
		return
	}
	label, err := mint(prefix, id)
	if err != nil {
		s.err = fmt.Errorf("%w: %w", ErrUnresolved, err)
		return
	}
	if _, dup := s.seen[label]; dup {
		return
	}
	s.seen[label] = struct{}{}
	s.out = append(s.out, label)
}

func (s *labelSet) addAll(prefix string, ids []uuid.UUID) {
	for _, id := range ids {
		s.add(prefix, id)
	}
}

func (s *labelSet) fail(err error) {
	if s.err == nil {
		s.err = err
	}
}

func (s *labelSet) labels() ([]string, error) {
	if s.err != nil {
		return nil, s.err
	}
	sort.Strings(s.out)
	return s.out, nil
}

func addBase(s *labelSet, v *access.Viewer, schoolID uuid.UUID) bool {
	if v.PersonID == nil {
		return false
	}
	s.add(prefixSchool, schoolID)
	s.add(prefixPerson, *v.PersonID)
	return true
}

func addOwn(s *labelSet, v *access.Viewer, schoolID uuid.UUID) {
	if !addBase(s, v, schoolID) {
		return
	}
	s.addAll(prefixOffering, v.EnrolledOfferingIDs)
}

func addWard(s *labelSet, v *access.Viewer, schoolID uuid.UUID) {
	if !addBase(s, v, schoolID) {
		return
	}
	s.addAll(prefixOffering, v.WardOfferingIDs)
}

func addPersonal(s *labelSet, v *access.Viewer, schoolID uuid.UUID) {
	if !addBase(s, v, schoolID) {
		return
	}
	s.addAll(prefixOffering, v.EnrolledOfferingIDs)
	s.addAll(prefixOffering, v.WardOfferingIDs)
}

func addTeaching(s *labelSet, v *access.Viewer, grades SectionGrades) {
	if len(v.SectionIDs) > 0 {
		s.addAll(prefixSection, v.SectionIDs)
		for _, id := range v.SectionIDs {
			grade, known := grades[id]
			if !known || grade == uuid.Nil {
				s.fail(ErrSectionGradesUnknown)
				return
			}
			s.add(prefixGrade, grade)
		}
	}
	s.addAll(prefixOffering, v.SubjectOfferingIDs)
}

func addPersonalScope(s *labelSet, v *access.Viewer, schoolID uuid.UUID, add func(*labelSet, *access.Viewer, uuid.UUID), pinned bool) {
	if pinned {
		return
	}
	add(s, v, schoolID)
}

func addRoleScope(s *labelSet, v *access.Viewer, schoolID uuid.UUID, grades SectionGrades, pinned bool) {
	if pinned {
		addTeaching(s, v, grades)
		return
	}
	addPersonal(s, v, schoolID)
	addTeaching(s, v, grades)
}

func pinsUsable(groups [][]authorization.Constraint) bool {
	for _, group := range groups {
		if translatable(group) {
			return true
		}
	}
	return len(groups) == 0
}

func translatable(group []authorization.Constraint) bool {
	for _, c := range group {
		if !c.Satisfied() || !authorization.RowField(c.Field) {
			return false
		}
	}
	return true
}

func ScopesFor(v *access.Viewer, d authorization.Decision, schoolID uuid.UUID) (Scopes, error) {
	if v == nil {
		return Scopes{}, ErrNoViewer
	}
	return ScopesForWithSectionGrades(v, d, schoolID, SectionGrades(v.SectionGradeIDs))
}

func ScopesForWithSectionGrades(v *access.Viewer, d authorization.Decision, schoolID uuid.UUID, grades SectionGrades) (Scopes, error) {
	if v == nil {
		return Scopes{}, ErrNoViewer
	}
	if schoolID == uuid.Nil {
		return Scopes{}, ErrNoSchool
	}

	wildcard, err := UnrestrictedLabel(schoolID)
	if err != nil {
		return Scopes{}, fmt.Errorf("%w: %w", ErrUnresolved, err)
	}

	if v.Unrestricted {
		return Scopes{resolved: true, unrestricted: true, labels: []string{wildcard}}, nil
	}

	if !pinsUsable(d.Constraints) {
		return Scopes{resolved: true}, nil
	}

	pinned := len(d.Constraints) > 0
	s := newLabelSet()
	addReach(s, v, d, schoolID, grades, pinned)

	labels, err := s.labels()
	if err != nil {
		return Scopes{}, err
	}
	if pinned && len(labels) > 0 {
		return Scopes{}, ErrPinnedScopeUnresolved
	}
	return Scopes{resolved: true, unrestricted: slices.Contains(labels, wildcard), labels: labels}, nil
}

func addReach(s *labelSet, v *access.Viewer, d authorization.Decision, schoolID uuid.UUID, grades SectionGrades, pinned bool) {
	if !d.HasReach {
		addRoleScope(s, v, schoolID, grades, pinned)
		return
	}

	switch d.Reach {
	case authorization.ReachTenant:
		s.add(prefixUnrestricted, schoolID)
	case authorization.ReachSelf:
		addPersonalScope(s, v, schoolID, addOwn, pinned)
	case authorization.ReachGuardianWard:
		addPersonalScope(s, v, schoolID, addWard, pinned)
	case authorization.ReachTeacherAssignment:
		addRoleScope(s, v, schoolID, grades, pinned)
	}
}
