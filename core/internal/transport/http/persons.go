package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/person"
	"github.com/Harbour-Emerge/emerge-core/internal/data/school"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
	"github.com/Harbour-Emerge/emerge-core/internal/service"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type personPayload struct {
	CASUserID           *uuid.UUID      `json:"cas_user_id"`
	FirstName           *string         `json:"first_name"`
	MiddleName          *string         `json:"middle_name"`
	LastName            *string         `json:"last_name"`
	DisplayName         *string         `json:"display_name"`
	DateOfBirth         *string         `json:"date_of_birth"`
	Gender              *string         `json:"gender"`
	Email               *string         `json:"email"`
	Phone               *string         `json:"phone"`
	ProfilePhotoAssetID *uuid.UUID      `json:"profile_photo_asset_id"`
	Status              *string         `json:"status"`
	Metadata            shared.Metadata `json:"metadata_json"`
}

func (s *Server) listPersons(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	sc, err := school.From(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := person.ParseFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.PersonsRead, authorization.PersonsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := sc.People(ctx).ForViewer(viewer, decision).ApplyFilters(filters).Newest().All()
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}

	response.JSON(w, http.StatusOK, response.Envelope{
		"school":  sc.Tenant.Code,
		"persons": projected,
		"count":   len(rows),
		"page":    pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getPerson(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	sc, err := school.From(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	viewer, decision, err := s.scopeFor(ctx,
		authorization.PersonsRead, authorization.PersonsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := sc.People(ctx).ByID(id).ForViewer(viewer, decision).Only()
	if err != nil {
		writeTenantEntErr(w, err, "person not found")
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) createPerson(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in personPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.PersonsWrite, authorization.PersonsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entperson.Columns, sent) {
		return
	}

	if in.CASUserID == nil {
		response.Error(w, http.StatusBadRequest, "cas_user_id is required: mint the CAS identity first")
		return
	}
	if in.FirstName == nil || *in.FirstName == "" {
		response.Error(w, http.StatusBadRequest, "first_name is required")
		return
	}

	display := ""
	if in.DisplayName != nil {
		display = *in.DisplayName
	}
	if display == "" {
		display = *in.FirstName
		if in.LastName != nil && *in.LastName != "" {
			display += " " + *in.LastName
		}
	}

	dob, err := parseDate(in.DateOfBirth)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "date_of_birth must be YYYY-MM-DD")
		return
	}

	create := client.Person.Create().
		SetCasUserID(*in.CASUserID).
		SetFirstName(*in.FirstName).
		SetDisplayName(display).
		SetNillableMiddleName(in.MiddleName).
		SetNillableLastName(in.LastName).
		SetNillableGender(in.Gender).
		SetNillableEmail(in.Email).
		SetNillablePhone(in.Phone)

	if dob != nil {
		create = create.SetDateOfBirth(*dob)
	}
	if in.ProfilePhotoAssetID != nil {
		create = create.SetProfilePhotoAssetID(*in.ProfilePhotoAssetID)
	}
	if in.Metadata != nil {
		create = create.SetMetadataJSON(in.Metadata)
	}
	if in.Status != nil {
		if err := entperson.StatusValidator(entperson.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		create = create.SetStatus(entperson.Status(*in.Status))
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "person not found")
		return
	}
	w.Header().Set("Location", "/api/v1/persons/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updatePerson(w http.ResponseWriter, r *http.Request) {
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

	var in personPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.PersonsWrite, authorization.PersonsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := reachPerson(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "person not found") {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entperson.Columns, sent) {
		return
	}

	dob, err := parseDate(in.DateOfBirth)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "date_of_birth must be YYYY-MM-DD")
		return
	}

	update := client.Person.Update().
		Where(entperson.ID(id), person.For(viewer, decision)).
		SetNillableFirstName(in.FirstName).
		SetNillableMiddleName(in.MiddleName).
		SetNillableLastName(in.LastName).
		SetNillableDisplayName(in.DisplayName).
		SetNillableGender(in.Gender).
		SetNillableEmail(in.Email).
		SetNillablePhone(in.Phone)

	if dob != nil {
		update = update.SetDateOfBirth(*dob)
	}
	if in.ProfilePhotoAssetID != nil {
		update = update.SetProfilePhotoAssetID(*in.ProfilePhotoAssetID)
	}
	if in.Metadata != nil {
		update = update.SetMetadataJSON(in.Metadata)
	}
	if in.Status != nil {
		if err := entperson.StatusValidator(entperson.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active or inactive")
			return
		}
		update = update.SetStatus(entperson.Status(*in.Status))
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "person not found") {
		return
	}

	row, err := client.Person.Query().Where(entperson.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "person not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deletePerson(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "person not found",
		authorization.PersonsDelete, authorization.PersonsDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.Person.Delete().
				Where(entperson.ID(id), person.For(v, d)).
				Exec(ctx)
		})
}

type provisionPayload struct {
	Username    string   `json:"username"`
	Email       string   `json:"email"`
	Phone       string   `json:"phone"`
	Password    string   `json:"password"`
	FirstName   string   `json:"first_name"`
	MiddleName  string   `json:"middle_name"`
	LastName    string   `json:"last_name"`
	DisplayName string   `json:"display_name"`
	GroupKeys   []string `json:"group_keys"`
}

type linkPersonPayload struct {
	Identifier  string `json:"identifier"`
	FirstName   string `json:"first_name"`
	MiddleName  string `json:"middle_name"`
	LastName    string `json:"last_name"`
	DisplayName string `json:"display_name"`
}

func (s *Server) provisionPerson(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	if !s.provisioner.Available() {
		response.Error(w, http.StatusNotImplemented,
			"identity provisioning is not configured; create the person in CAS and POST /api/v1/persons with their cas_user_id")
		return
	}

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in provisionPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entperson.Columns, columnsSent(sent, entperson.ValidColumn)) {
		return
	}

	out, err := s.provisioner.Provision(ctx, client, service.Request{
		Username:    in.Username,
		Email:       in.Email,
		Phone:       in.Phone,
		Password:    in.Password,
		FirstName:   in.FirstName,
		MiddleName:  in.MiddleName,
		LastName:    in.LastName,
		DisplayName: in.DisplayName,
		GroupKeys:   in.GroupKeys,
	})
	if err != nil {
		s.writeProvisioningErr(w, err)
		return
	}

	status := http.StatusCreated
	if !out.CreatedInCAS && !out.LinkedToExist {
		status = http.StatusOK
	}
	envelope := response.Envelope{
		"person":          out.Person,
		"cas_user_id":     out.CASUserID,
		"created_in_cas":  out.CreatedInCAS,
		"linked_existing": out.LinkedToExist,
	}
	if len(out.Groups) > 0 {
		envelope["groups"] = out.Groups
	}
	if out.GeneratedPassword != "" && out.CreatedInCAS {
		envelope["password"] = out.GeneratedPassword
	}
	response.JSON(w, status, envelope)
}

func (s *Server) writeProvisioningErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, cas.ErrCallerRejected):
		response.Error(w, http.StatusUnauthorized,
			"CAS rejected your token when creating the identity: "+err.Error())
	case errors.Is(err, cas.ErrCallerForbidden):
		response.Error(w, http.StatusForbidden,
			"CAS refused you permission to create this identity: "+err.Error())
	case errors.Is(err, cas.ErrProvisioningUnavailable):
		response.Error(w, http.StatusNotImplemented,
			"CAS does not accept identity creation from this service; a person must be created in the CAS console for now")
	case errors.Is(err, service.ErrNoIdentityProvider):
		response.Error(w, http.StatusNotImplemented, "CAS is not configured")
	case errors.Is(err, cas.ErrLookupUnsupported):
		response.Error(w, http.StatusNotImplemented,
			"CAS offers this service no way to look up an identity; supply cas_user_id directly")
	case errors.Is(err, service.ErrUnrecoverable):
		response.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, cas.ErrUsernameTaken):
		response.Error(w, http.StatusConflict, "that username is already taken in CAS")
	case errors.Is(err, cas.ErrEmailTaken):
		response.Error(w, http.StatusConflict, "that email address is already registered in CAS")
	case errors.Is(err, cas.ErrUserExists):
		response.Error(w, http.StatusConflict, "that username or email is already taken in CAS")
	default:
		s.logger.Error("provisioning failed", "error", err)
		response.Error(w, http.StatusBadGateway, "the identity service could not create that person")
	}
}

func (s *Server) linkPerson(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	if !s.provisioner.Available() {
		response.Error(w, http.StatusNotImplemented,
			"CAS is not configured; POST /api/v1/persons with a cas_user_id instead")
		return
	}

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in linkPersonPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	decision, ok := routeDecision(w, r)
	if !ok {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entperson.Columns, columnsSent(sent, entperson.ValidColumn)) {
		return
	}
	if in.Identifier == "" {
		response.Error(w, http.StatusBadRequest, "identifier is required: a CAS username or email")
		return
	}

	out, err := s.provisioner.Link(ctx, client, in.Identifier, service.Request{
		FirstName:   in.FirstName,
		MiddleName:  in.MiddleName,
		LastName:    in.LastName,
		DisplayName: in.DisplayName,
	})
	if err != nil {
		s.writeProvisioningErr(w, err)
		return
	}

	response.JSON(w, http.StatusCreated, response.Envelope{
		"person":          out.Person,
		"cas_user_id":     out.CASUserID,
		"linked_existing": true,
	})
}
