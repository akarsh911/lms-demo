package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
)

type TenantDirectory interface {
	LookupGroup(ctx context.Context, key string) (*cas.Group, error)
	CreateGroup(ctx context.Context, key, name string) (*cas.Group, error)
	TagGroupTenant(ctx context.Context, groupID uuid.UUID, tenant string) error
}

var tenantID = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,62}$`)

var (
	ErrTenantIDInvalid = errors.New("tenant: id must match ^[a-z0-9][a-z0-9_-]{0,62}$")
	ErrTenantTaken     = errors.New("tenant: that group already carries a different tenant")
)

type TenantOutcome string

const (
	TenantCreated  TenantOutcome = "created"
	TenantTagged   TenantOutcome = "tagged"
	TenantExisting TenantOutcome = "existing"
)

type TenantResult struct {
	Tenant  string        `json:"tenant"`
	GroupID uuid.UUID     `json:"group_id"`
	Outcome TenantOutcome `json:"outcome"`
}

type TenantProvisioner struct {
	directory TenantDirectory
}

func NewTenantProvisioner(directory TenantDirectory) *TenantProvisioner {
	if directory == nil {
		return &TenantProvisioner{}
	}
	return &TenantProvisioner{directory: directory}
}

func (t *TenantProvisioner) Available() bool { return t != nil && t.directory != nil }

func TenantIDFor(code string) string {
	return strings.ToLower(strings.TrimSpace(code))
}

func ValidTenantID(id string) bool { return tenantID.MatchString(id) }

func (t *TenantProvisioner) Ensure(ctx context.Context, tenant, name string) (*TenantResult, error) {
	if !t.Available() {
		return nil, ErrNoIdentityProvider
	}
	if !ValidTenantID(tenant) {
		return nil, fmt.Errorf("%w: got %q", ErrTenantIDInvalid, tenant)
	}

	group, err := t.directory.LookupGroup(ctx, tenant)
	switch {
	case err == nil:
	case errors.Is(err, cas.ErrGroupNotFound):
		created, createErr := t.directory.CreateGroup(ctx, tenant, name)
		if createErr != nil {
			return nil, createErr
		}
		if tagErr := t.directory.TagGroupTenant(ctx, created.ID, tenant); tagErr != nil {
			return nil, tagErr
		}
		return &TenantResult{Tenant: tenant, GroupID: created.ID, Outcome: TenantCreated}, nil
	default:
		return nil, err
	}

	switch existing := group.Tenant(); {
	case existing == tenant:
		return &TenantResult{Tenant: tenant, GroupID: group.ID, Outcome: TenantExisting}, nil
	case existing == "":
		if err := t.directory.TagGroupTenant(ctx, group.ID, tenant); err != nil {
			return nil, err
		}
		return &TenantResult{Tenant: tenant, GroupID: group.ID, Outcome: TenantTagged}, nil
	default:
		return nil, fmt.Errorf("%w: group %q is tagged %q, refusing to retag it to %q, "+
			"which would re-point every row already partitioned under %q",
			ErrTenantTaken, tenant, existing, tenant, existing)
	}
}
