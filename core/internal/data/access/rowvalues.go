package access

import (
	"context"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

func StudentRowValues(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]authorization.RowValues, error) {
	out := make(map[uuid.UUID]authorization.RowValues, len(ids))
	if len(ids) == 0 {
		return out, nil
	}

	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return nil, err
	}

	rows, err := client.StudentEnrollment.Query().
		Where(
			entenrollment.StudentIDIn(ids...),
			entenrollment.StatusEQ(entenrollment.StatusActive),
			entenrollment.HasAcademicSessionWith(entsession.IsCurrent(true)),
		).
		WithSection(func(q *tenantent.SectionQuery) { q.WithGradeLevel() }).
		All(ctx)
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		section := row.Edges.Section
		if section == nil {
			continue
		}
		values := authorization.RowValues{"section": section.Code}
		if grade := section.Edges.GradeLevel; grade != nil {
			values["grade_level"] = grade.Code
		}
		out[row.StudentID] = values
	}
	return out, nil
}

func EnrollmentRowValues(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]authorization.RowValues, error) {
	out := make(map[uuid.UUID]authorization.RowValues, len(ids))
	if len(ids) == 0 {
		return out, nil
	}

	client, err := postgres.ClientFromContext(ctx)
	if err != nil {
		return nil, err
	}

	rows, err := client.StudentEnrollment.Query().
		Where(entenrollment.IDIn(ids...)).
		WithSection(func(q *tenantent.SectionQuery) { q.WithGradeLevel() }).
		All(ctx)
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		section := row.Edges.Section
		if section == nil {
			continue
		}
		values := authorization.RowValues{"section": section.Code}
		if grade := section.Edges.GradeLevel; grade != nil {
			values["grade_level"] = grade.Code
		}
		out[row.ID] = values
	}
	return out, nil
}
