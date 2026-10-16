package http

import (
	nethttp "net/http"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/service"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const personKey = "person"

func withoutPerson(sent []string) []string {
	out := make([]string, 0, len(sent))
	for _, field := range sent {
		if field != personKey {
			out = append(out, field)
		}
	}
	return out
}

type newPersonPayload struct {
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

func rejectInlinePerson(w nethttp.ResponseWriter, in *newPersonPayload) bool {
	if in == nil {
		return true
	}
	response.Error(w, nethttp.StatusBadRequest,
		"person may only be sent when creating; PATCH the person record directly")
	return false
}

func (s *Server) personIDFor(w nethttp.ResponseWriter, r *nethttp.Request,
	client *tenantent.Client, id *uuid.UUID, in *newPersonPayload) (uuid.UUID, bool) {
	if id != nil {
		return *id, true
	}
	if in == nil {
		response.Error(w, nethttp.StatusBadRequest,
			"person_id is required, or send a person object to create one")
		return uuid.Nil, false
	}
	if !s.provisioner.Available() {
		response.Error(w, nethttp.StatusNotImplemented,
			"identity provisioning is not configured; create the person first and send person_id")
		return uuid.Nil, false
	}

	out, err := s.provisioner.Provision(r.Context(), client, service.Request{
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
		return uuid.Nil, false
	}
	return out.Person.ID, true
}
