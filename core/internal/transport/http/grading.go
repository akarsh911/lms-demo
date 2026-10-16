package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradingscheme"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const gradingSchemeNotFound = "grading scheme not found"

type gradingSchemePayload struct {
	AcademicSessionID *uuid.UUID         `json:"academic_session_id"`
	Name              *string            `json:"name"`
	Code              *string            `json:"code"`
	Description       *string            `json:"description"`
	Kind              *string            `json:"kind"`
	MaximumMarks      *float64           `json:"maximum_marks"`
	PassMarks         *float64           `json:"pass_marks"`
	Scale             []schema.GradeBand `json:"scale_json"`
	PassRule          map[string]any     `json:"pass_rule_json"`
	Status            *string            `json:"status"`
}

func (s *Server) listGradingSchemes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.SubjectOfferingsRead, authorization.CurriculumReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	p := filter.New(r.URL.Query())
	sessionID := p.UUID("academic_session_id")
	status := p.Enum("status", func(v string) error {
		return entscheme.StatusValidator(entscheme.Status(v))
	})
	limit, offset := p.Page(DefaultPageSize, MaxPageSize)
	if err := p.Err(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := client.GradingScheme.Query()
	if sessionID != nil {
		q = q.Where(entscheme.AcademicSessionID(*sessionID))
	}
	if status != nil {
		q = q.Where(entscheme.StatusEQ(entscheme.Status(*status)))
	}

	rows, err := q.
		Order(tenantent.Asc(entscheme.FieldCode), tenantent.Asc(entscheme.FieldID)).
		Limit(limit).Offset(offset).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"grading_schemes": projected,
		"count":           len(rows),
		"page":            pageOf(limit, offset, len(rows)),
	})
}

func (s *Server) createGradingScheme(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in gradingSchemePayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.SubjectOfferingsWrite, authorization.CurriculumWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if in.AcademicSessionID == nil || in.Name == nil || *in.Name == "" ||
		in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id, name and code are required")
		return
	}

	create := client.GradingScheme.Create().
		SetAcademicSessionID(*in.AcademicSessionID).
		SetName(*in.Name).
		SetCode(*in.Code)
	if in.Description != nil {
		create = create.SetDescription(*in.Description)
	}
	if in.Kind != nil {
		if err := entscheme.KindValidator(entscheme.Kind(*in.Kind)); err != nil {
			response.Error(w, http.StatusBadRequest, "unknown kind: "+*in.Kind)
			return
		}
		create = create.SetKind(entscheme.Kind(*in.Kind))
	}
	if in.MaximumMarks != nil {
		create = create.SetMaximumMarks(*in.MaximumMarks)
	}
	if in.PassMarks != nil {
		create = create.SetPassMarks(*in.PassMarks)
	}
	if in.Scale != nil {
		create = create.SetScaleJSON(in.Scale)
	}
	if in.PassRule != nil {
		create = create.SetPassRuleJSON(in.PassRule)
	}

	row, err := create.Save(ctx)
	if err != nil {
		if tenantent.IsConstraintError(err) {
			response.Error(w, http.StatusConflict,
				"a grading scheme with that code already exists in this session")
			return
		}
		writeTenancyErr(w, err)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/grading-schemes/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"grading_scheme": projected})
}

func (s *Server) reviseGradingScheme(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in gradingSchemePayload
	if _, err := response.DecodeFields(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.SubjectOfferingsWrite, authorization.CurriculumWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.GradingScheme.Query().Where(entscheme.ID(id)).Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			response.Error(w, http.StatusNotFound, gradingSchemeNotFound)
			return
		}
		writeTenancyErr(w, err)
		return
	}

	used, err := client.SubjectOffering.Query().
		Where(entoffering.GradingSchemeID(id)).Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	if !used {
		row, err := applyGradingEdit(ctx, client.GradingScheme.UpdateOneID(id), in)
		if err != nil {
			writeTenantEntErr(w, err, gradingSchemeNotFound)
			return
		}
		projected, err := project(row, decision.Fields)
		if err != nil {
			response.ServerError(w, err)
			return
		}
		response.JSON(w, http.StatusOK, response.Envelope{"grading_scheme": projected})
		return
	}

	if in.Code == nil || *in.Code == "" || *in.Code == current.Code {
		response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
			"error": "grading_scheme_in_use",
			"message": "this scheme already marks a subject offering, so editing it would " +
				"change what past results mean; send a new code to supersede it instead",
		})
		return
	}

	successor, err := supersedeGradingScheme(ctx, client, current, in)
	if err != nil {
		if tenantent.IsConstraintError(err) {
			response.Error(w, http.StatusConflict,
				"a grading scheme with that code already exists in this session")
			return
		}
		writeTenancyErr(w, err)
		return
	}

	projected, err := project(successor, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/grading-schemes/"+successor.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{"grading_scheme": projected})
}

func applyGradingEdit(ctx context.Context, update *tenantent.GradingSchemeUpdateOne,
	in gradingSchemePayload) (*tenantent.GradingScheme, error) {

	if in.Name != nil {
		update = update.SetName(*in.Name)
	}
	if in.Code != nil {
		update = update.SetCode(*in.Code)
	}
	if in.Description != nil {
		update = update.SetDescription(*in.Description)
	}
	if in.MaximumMarks != nil {
		update = update.SetMaximumMarks(*in.MaximumMarks)
	}
	if in.PassMarks != nil {
		update = update.SetPassMarks(*in.PassMarks)
	}
	if in.Scale != nil {
		update = update.SetScaleJSON(in.Scale)
	}
	if in.PassRule != nil {
		update = update.SetPassRuleJSON(in.PassRule)
	}
	if in.Status != nil {
		update = update.SetStatus(entscheme.Status(*in.Status))
	}
	return update.Save(ctx)
}

func supersedeGradingScheme(ctx context.Context, client *tenantent.Client,
	current *tenantent.GradingScheme, in gradingSchemePayload) (*tenantent.GradingScheme, error) {

	create := client.GradingScheme.Create().
		SetAcademicSessionID(current.AcademicSessionID).
		SetKind(current.Kind).
		SetSupersedesID(current.ID).
		SetName(current.Name).
		SetCode(*in.Code)

	if in.Name != nil {
		create = create.SetName(*in.Name)
	}
	if in.Description != nil {
		create = create.SetDescription(*in.Description)
	} else if current.Description != nil {
		create = create.SetDescription(*current.Description)
	}
	if in.MaximumMarks != nil {
		create = create.SetMaximumMarks(*in.MaximumMarks)
	} else if current.MaximumMarks != nil {
		create = create.SetMaximumMarks(*current.MaximumMarks)
	}
	if in.PassMarks != nil {
		create = create.SetPassMarks(*in.PassMarks)
	} else if current.PassMarks != nil {
		create = create.SetPassMarks(*current.PassMarks)
	}
	if in.Scale != nil {
		create = create.SetScaleJSON(in.Scale)
	} else if current.ScaleJSON != nil {
		create = create.SetScaleJSON(current.ScaleJSON)
	}
	if in.PassRule != nil {
		create = create.SetPassRuleJSON(in.PassRule)
	} else if current.PassRuleJSON != nil {
		create = create.SetPassRuleJSON(current.PassRuleJSON)
	}
	return create.Save(ctx)
}
