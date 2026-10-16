package http

import (
	"context"
	"strings"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
)

func (s *Server) scopeFor(ctx context.Context, narrow, wide authorization.Entity) (
	*access.Viewer, authorization.Decision, error) {
	subject, err := authorization.SubjectFrom(ctx)
	if err != nil {
		return nil, authorization.Decision{}, err
	}

	unrestricted := false
	if wide != narrow {
		if d, err := s.guard.Allow(ctx, subject, wide, nil); err == nil && d.Allowed && len(d.Constraints) == 0 {
			unrestricted = true
		}
	}

	decision, err := s.guard.Allow(ctx, subject, narrow, nil)
	if err != nil {
		return nil, authorization.Decision{}, err
	}

	viewer, err := access.Resolve(ctx, subject, unrestricted)
	if err != nil {
		return nil, authorization.Decision{}, err
	}

	observability.Step(ctx, observability.ComponentAuthz, "scope resolved",
		"entity", string(narrow),
		"unrestricted", viewer.Unrestricted,
		"scope", string(decision.Reach), "has_scope", decision.HasReach,
		"constraints", constraintNames(decision.Constraints),
		"is_guardian", viewer.GuardianID != nil,
		"is_staff", viewer.StaffID != nil,
		"is_teacher", viewer.TeacherID != nil,
		"sections", len(viewer.SectionIDs),
		"subject_offerings", len(viewer.SubjectOfferingIDs),
		"own_student_records", len(viewer.StudentIDs))

	return viewer, decision, nil
}

func (s *Server) viewerFor(ctx context.Context, wide authorization.Entity) (*access.Viewer, error) {
	subject, err := authorization.SubjectFrom(ctx)
	if err != nil {
		return nil, err
	}

	unrestricted := false
	if d, err := s.guard.Allow(ctx, subject, wide, nil); err == nil && d.Allowed && len(d.Constraints) == 0 {
		unrestricted = true
	}
	return access.Resolve(ctx, subject, unrestricted)
}

func constraintNames(groups [][]authorization.Constraint) []string {
	if len(groups) == 0 {
		return nil
	}
	out := make([]string, 0, len(groups))
	for _, group := range groups {
		parts := make([]string, 0, len(group))
		for _, c := range group {
			parts = append(parts, c.Field+"="+strings.Join(c.Values, "|"))
		}
		out = append(out, strings.Join(parts, " AND "))
	}
	return out
}
