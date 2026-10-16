package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

func (s *Server) relay(name string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.authProxy == nil {
			response.Error(w, http.StatusNotImplemented,
				"login is not proxied here; authenticate against CAS directly")
			return
		}

		ctx, cancel := timeout(r)
		defer cancel()

		out, err := s.authProxy.Do(ctx, name, r)
		if err != nil {
			if errors.Is(err, cas.ErrProxyDisabled) {
				response.Error(w, http.StatusNotImplemented, "login is not proxied here")
				return
			}
			s.logger.Error("auth relay failed", "route", name, "error", err)
			response.Error(w, http.StatusBadGateway, "the identity service is unreachable")
			return
		}

		for name, values := range out.Header {
			for _, v := range values {
				w.Header().Add(name, v)
			}
		}
		w.Header().Set("Content-Type", out.ContentType())
		w.WriteHeader(out.Status)
		if len(out.Body) > 0 {
			_, _ = w.Write(out.Body)
		}
	}
}

type meResponse struct {
	CASUserID string `json:"cas_user_id"`
	SessionID string `json:"session_id,omitempty"`
	TenantID  string `json:"tenant_id,omitempty"`
	ClientID  string `json:"client_id,omitempty"`

	School *tenancy.Tenant `json:"school,omitempty"`
	Person any             `json:"person,omitempty"`
	Roles  *rolesResponse  `json:"roles,omitempty"`
}

type personIdentity struct {
	ID                  uuid.UUID  `json:"id"`
	FirstName           string     `json:"first_name,omitempty"`
	MiddleName          *string    `json:"middle_name,omitempty"`
	LastName            *string    `json:"last_name,omitempty"`
	DisplayName         string     `json:"display_name,omitempty"`
	Email               *string    `json:"email,omitempty"`
	Phone               *string    `json:"phone,omitempty"`
	ProfilePhotoAssetID *uuid.UUID `json:"profile_photo_asset_id,omitempty"`
	Status              string     `json:"status,omitempty"`
}

func identityOf(row *tenantent.Person) personIdentity {
	return personIdentity{
		ID:                  row.ID,
		FirstName:           row.FirstName,
		MiddleName:          row.MiddleName,
		LastName:            row.LastName,
		DisplayName:         row.DisplayName,
		Email:               row.Email,
		Phone:               row.Phone,
		ProfilePhotoAssetID: row.ProfilePhotoAssetID,
		Status:              string(row.Status),
	}
}

var identityFloor = &authorization.FieldPolicy{Mode: authorization.FieldModeInclude}

func (s *Server) ownFieldPolicy(ctx context.Context,
	subject *authorization.Subject) *authorization.FieldPolicy {
	if s.guard == nil {
		return identityFloor
	}
	decision, err := s.guard.Allow(ctx, subject, authorization.PersonsRead, nil)
	if err != nil || !decision.Allowed {
		return identityFloor
	}
	return decision.Fields
}

type rolesResponse struct {
	IsStudent  bool `json:"is_student"`
	IsStaff    bool `json:"is_staff"`
	IsTeacher  bool `json:"is_teacher"`
	IsGuardian bool `json:"is_guardian"`

	StaffID    string `json:"staff_id,omitempty"`
	TeacherID  string `json:"teacher_id,omitempty"`
	GuardianID string `json:"guardian_id,omitempty"`

	SectionIDs         []string `json:"section_ids,omitempty"`
	SubjectOfferingIDs []string `json:"subject_offering_ids,omitempty"`
	StudentIDs         []string `json:"student_ids,omitempty"`
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	subject, err := authorization.SubjectFrom(ctx)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "authentication is required")
		return
	}

	out := meResponse{
		CASUserID: subject.CASUserID.String(),
		SessionID: subject.SessionID,
		TenantID:  subject.TenantID,
		ClientID:  subject.ClientID,
	}

	conn, err := postgres.ConnFromContext(ctx)
	if err != nil {
		response.JSON(w, http.StatusOK, out)
		return
	}
	out.School = conn.Tenant

	viewer, err := access.Resolve(ctx, subject, false)
	if err != nil {
		response.ServerError(w, err)
		return
	}

	roles := &rolesResponse{
		IsStudent:  len(viewer.StudentIDs) > 0,
		IsStaff:    viewer.StaffID != nil,
		IsTeacher:  viewer.TeacherID != nil,
		IsGuardian: viewer.GuardianID != nil,
	}
	if viewer.StaffID != nil {
		roles.StaffID = viewer.StaffID.String()
	}
	if viewer.TeacherID != nil {
		roles.TeacherID = viewer.TeacherID.String()
	}
	if viewer.GuardianID != nil {
		roles.GuardianID = viewer.GuardianID.String()
	}
	for _, id := range viewer.SectionIDs {
		roles.SectionIDs = append(roles.SectionIDs, id.String())
	}
	for _, id := range viewer.SubjectOfferingIDs {
		roles.SubjectOfferingIDs = append(roles.SubjectOfferingIDs, id.String())
	}
	for _, id := range viewer.StudentIDs {
		roles.StudentIDs = append(roles.StudentIDs, id.String())
	}
	out.Roles = roles

	if viewer.PersonID != nil {
		if row, err := conn.Client.Person.Get(ctx, *viewer.PersonID); err == nil {
			policy := s.ownFieldPolicy(ctx, subject)
			identity, err := project(identityOf(row), policy)
			if err != nil {
				response.ServerError(w, err)
				return
			}
			traceProjection(r, policy, 1)
			out.Person = identity
		}
	}

	response.JSON(w, http.StatusOK, out)
}

type forgetter interface {
	Forget(userID uuid.UUID)
}

func (s *Server) relayAndForget(name string) http.HandlerFunc {
	inner := s.relay(name)
	return func(w http.ResponseWriter, r *http.Request) {
		var userID uuid.UUID
		if s.verifier != nil {
			if raw := r.Header.Get("Authorization"); raw != "" {
				if sub, err := s.verifier.VerifyAccessToken(r.Context(), raw); err == nil {
					userID = sub.CASUserID
				}
			}
		}

		inner(w, r)

		if userID != uuid.Nil {
			if f, ok := s.guard.(forgetter); ok {
				f.Forget(userID)
			}
		}
	}
}
