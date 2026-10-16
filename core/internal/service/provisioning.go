package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
)

type IdentityProvider interface {
	CreateUser(ctx context.Context, in cas.NewUser) (*cas.User, error)
	FindUser(ctx context.Context, identifier string) (*cas.User, error)
	FindGroup(ctx context.Context, key string) (uuid.UUID, error)
	AddUserToGroup(ctx context.Context, groupKey string, userID uuid.UUID) error
}

var (
	ErrNoIdentityProvider = errors.New("provisioning: CAS is not configured")
	ErrUnrecoverable      = errors.New("provisioning: the identity exists in CAS but could not be resolved")
)

type Provisioner struct {
	identities IdentityProvider
}

func NewProvisioner(identities IdentityProvider) *Provisioner {
	return &Provisioner{identities: identities}
}

func (p *Provisioner) Available() bool { return p != nil && p.identities != nil }

type Request struct {
	Username string
	Email    string
	Phone    string
	Password string

	GroupKeys []string

	FirstName   string
	MiddleName  string
	LastName    string
	DisplayName string
}

type Result struct {
	Person            *tenantent.Person
	CASUserID         uuid.UUID
	CreatedInCAS      bool
	LinkedToExist     bool
	GeneratedPassword string
	Groups            []string
}

func (p *Provisioner) Provision(ctx context.Context, client *tenantent.Client, req Request) (*Result, error) {
	if !p.Available() {
		return nil, ErrNoIdentityProvider
	}
	if strings.TrimSpace(req.Username) == "" {
		return nil, errors.New("provisioning: username is required")
	}
	if strings.TrimSpace(req.FirstName) == "" {
		return nil, errors.New("provisioning: first_name is required")
	}

	full := strings.TrimSpace(req.FirstName + " " + req.LastName)
	display := req.DisplayName
	if display == "" {
		display = full
	}

	result := &Result{}

	password := req.Password
	if password == "" {
		generated, err := newPassword()
		if err != nil {
			return nil, err
		}
		password, result.GeneratedPassword = generated, generated
	}

	primary, rest := splitGroups(req.GroupKeys)
	newUser := cas.NewUser{
		Username: req.Username,
		Email:    req.Email,
		Phone:    req.Phone,
		FullName: full,
		Password: password,
	}
	if primary != "" {
		id, groupErr := p.identities.FindGroup(ctx, primary)
		if groupErr != nil {
			return nil, fmt.Errorf("%w: group %q could not be resolved: %w",
				ErrUnrecoverable, primary, groupErr)
		}
		newUser.GroupID = id.String()
	}

	user, err := p.identities.CreateUser(ctx, newUser)
	switch {
	case err == nil:
		result.CASUserID = user.ID
		result.CreatedInCAS = true
		if primary != "" {
			result.Groups = append(result.Groups, primary)
		}

	case errors.Is(err, cas.ErrEmailTaken):
		existing, lookupErr := p.identities.FindUser(ctx, req.Email)
		if lookupErr != nil {
			return nil, fmt.Errorf("%w: email %q is registered but the lookup failed: %w",
				ErrUnrecoverable, req.Email, lookupErr)
		}
		if existing == nil {
			return nil, fmt.Errorf("%w: email %q is registered to an identity this caller cannot see",
				ErrUnrecoverable, req.Email)
		}
		result.CASUserID = existing.ID
		result.LinkedToExist = true

	case errors.Is(err, cas.ErrUsernameTaken), errors.Is(err, cas.ErrUserExists):
		existing, lookupErr := p.identities.FindUser(ctx, req.Username)
		if lookupErr != nil && req.Email != "" {
			existing, lookupErr = p.identities.FindUser(ctx, req.Email)
		}
		if lookupErr != nil {
			return nil, fmt.Errorf("%w: username %q is taken but the lookup failed: %w",
				ErrUnrecoverable, req.Username, lookupErr)
		}
		if existing == nil {
			return nil, fmt.Errorf("%w: username %q is taken by an identity this caller cannot see",
				ErrUnrecoverable, req.Username)
		}
		result.CASUserID = existing.ID
		result.LinkedToExist = true

	default:
		return nil, err
	}

	if result.LinkedToExist && primary != "" {
		rest = append([]string{primary}, rest...)
	}
	for _, key := range rest {
		if err := p.identities.AddUserToGroup(ctx, key, result.CASUserID); err != nil {
			return nil, fmt.Errorf("%w: identity %s exists but joining group %q failed: %w",
				ErrUnrecoverable, result.CASUserID, key, err)
		}
		result.Groups = append(result.Groups, key)
	}

	person, err := upsertPerson(ctx, client, result.CASUserID, req, display)
	if err != nil {
		return nil, err
	}
	result.Person = person
	return result, nil
}

func splitGroups(keys []string) (string, []string) {
	var clean []string
	for _, k := range keys {
		if k = strings.TrimSpace(k); k != "" {
			clean = append(clean, k)
		}
	}
	if len(clean) == 0 {
		return "", nil
	}
	return clean[0], clean[1:]
}

func newPassword() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
	buf := make([]byte, 20)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, len(buf))
	for i, b := range buf {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return "Eg#" + string(out), nil
}

func upsertPerson(ctx context.Context, client *tenantent.Client, casUserID uuid.UUID,
	req Request, display string) (*tenantent.Person, error) {
	existing, err := client.Person.Query().Where(entperson.CasUserID(casUserID)).Only(ctx)
	if err == nil {
		return existing, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}

	create := client.Person.Create().
		SetCasUserID(casUserID).
		SetFirstName(req.FirstName).
		SetDisplayName(display)

	if req.MiddleName != "" {
		create = create.SetMiddleName(req.MiddleName)
	}
	if req.LastName != "" {
		create = create.SetLastName(req.LastName)
	}
	if req.Email != "" {
		create = create.SetEmail(req.Email)
	}
	if req.Phone != "" {
		create = create.SetPhone(req.Phone)
	}
	return create.Save(ctx)
}

func (p *Provisioner) Link(ctx context.Context, client *tenantent.Client,
	identifier string, req Request) (*Result, error) {
	if !p.Available() {
		return nil, ErrNoIdentityProvider
	}
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil, errors.New("provisioning: a username or email is required")
	}

	user, err := p.identities.FindUser(ctx, identifier)
	if err != nil {
		return nil, err
	}
	if user == nil || user.ID == uuid.Nil {
		return nil, fmt.Errorf("%w: no CAS identity matches %q", ErrUnrecoverable, identifier)
	}

	if req.FirstName == "" {
		first, last := splitFullName(user.FullName)
		req.FirstName, req.LastName = first, last
	}
	if req.FirstName == "" {
		req.FirstName = user.Username
	}
	if req.Email == "" {
		req.Email = user.Email
	}
	if req.Phone == "" {
		req.Phone = user.Phone
	}

	display := req.DisplayName
	if display == "" {
		display = strings.TrimSpace(req.FirstName + " " + req.LastName)
	}

	person, err := upsertPerson(ctx, client, user.ID, req, display)
	if err != nil {
		return nil, err
	}
	return &Result{Person: person, CASUserID: user.ID, LinkedToExist: true}, nil
}

func splitFullName(full string) (first, last string) {
	full = strings.TrimSpace(full)
	if full == "" {
		return "", ""
	}
	parts := strings.Fields(full)
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], strings.Join(parts[1:], " ")
}
