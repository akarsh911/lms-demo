package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/data/academic"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbranch "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/branch"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type branchPayload struct {
	Name    *string         `json:"name"`
	Code    *string         `json:"code"`
	Address *shared.Address `json:"address_json"`
	Phone   *string         `json:"phone"`
	Email   *string         `json:"email"`
	Status  *string         `json:"status"`
}

func (s *Server) listBranches(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := academic.ParseBranchFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	q := filters.Apply(client.Branch.Query())
	rows, err := q.Order(tenantent.Asc(entbranch.FieldName)).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"branches": rows,
		"count":    len(rows),
		"page":     pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getBranch(w http.ResponseWriter, r *http.Request) {
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

	row, err := client.Branch.Get(ctx, id)
	if err != nil {
		writeTenantEntErr(w, err, "branch not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) createBranch(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in branchPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entbranch.Columns, sent) {
		return
	}
	if in.Name == nil || *in.Name == "" || in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}

	create := client.Branch.Create().
		SetName(*in.Name).
		SetCode(*in.Code).
		SetNillablePhone(in.Phone).
		SetNillableEmail(in.Email)

	if in.Address != nil {
		create = create.SetAddressJSON(in.Address)
	}
	if in.Status != nil {
		if err := entbranch.StatusValidator(entbranch.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entbranch.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "branch not found")
		return
	}
	w.Header().Set("Location", "/api/v1/branches/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateBranch(w http.ResponseWriter, r *http.Request) {
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

	var in branchPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entbranch.Columns, sent) {
		return
	}
	if !rejectImmutable(w, sent, "branch", entbranch.FieldCode) {
		return
	}

	update := client.Branch.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillablePhone(in.Phone).
		SetNillableEmail(in.Email)

	if in.Address != nil {
		update = update.SetAddressJSON(in.Address)
	}
	if in.Status != nil {
		if err := entbranch.StatusValidator(entbranch.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entbranch.Status(*in.Status))
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "branch not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteBranch(w http.ResponseWriter, r *http.Request) {
	deleteRow(w, r, "branch not found",
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID) error {
			return c.Branch.DeleteOneID(id).Exec(ctx)
		})
}
