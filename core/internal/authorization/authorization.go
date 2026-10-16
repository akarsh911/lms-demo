package authorization

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

var (
	ErrNoSubject = errors.New("authorization: no authenticated subject")
	ErrForbidden = errors.New("authorization: forbidden")
	ErrUpstream  = errors.New("authorization: policy source unavailable")
)

const Service = "core"

type Entity string

const (
	SchoolsRead   Entity = "core.schools.read"
	SchoolsWrite  Entity = "core.schools.write"
	SchoolsDelete Entity = "core.schools.delete"

	PersonsRead   Entity = "core.persons.read"
	PersonsWrite  Entity = "core.persons.write"
	PersonsDelete Entity = "core.persons.delete"

	StudentsReadAll  Entity = "core.students.read_all"
	PersonsReadAll   Entity = "core.persons.read_all"
	GuardiansReadAll Entity = "core.guardians.read_all"

	StudentsWriteAll  Entity = "core.students.write_all"
	PersonsWriteAll   Entity = "core.persons.write_all"
	GuardiansWriteAll Entity = "core.guardians.write_all"
	StaffWriteAll     Entity = "core.staff.write_all"
	TeachersWriteAll  Entity = "core.teachers.write_all"

	StudentsDeleteAll  Entity = "core.students.delete_all"
	PersonsDeleteAll   Entity = "core.persons.delete_all"
	GuardiansDeleteAll Entity = "core.guardians.delete_all"
	StaffDeleteAll     Entity = "core.staff.delete_all"
	TeachersDeleteAll  Entity = "core.teachers.delete_all"

	StudentsCreate  Entity = "core.students.create"
	TeachersCreate  Entity = "core.teachers.create"
	GuardiansCreate Entity = "core.guardians.create"

	StudentsRead   Entity = "core.students.read"
	StudentsWrite  Entity = "core.students.write"
	StudentsDelete Entity = "core.students.delete"

	StaffRead    Entity = "core.staff.read"
	StaffReadAll Entity = "core.staff.read_all"
	StaffWrite   Entity = "core.staff.write"
	StaffDelete  Entity = "core.staff.delete"

	TeachersRead    Entity = "core.teachers.read"
	TeachersReadAll Entity = "core.teachers.read_all"
	TeachersWrite   Entity = "core.teachers.write"
	TeachersDelete  Entity = "core.teachers.delete"

	GuardiansRead   Entity = "core.guardians.read"
	GuardiansWrite  Entity = "core.guardians.write"
	GuardiansDelete Entity = "core.guardians.delete"
)

var AllEntities = []Entity{
	SchoolsRead, SchoolsWrite, SchoolsDelete,
	PersonsRead, PersonsReadAll, PersonsWrite, PersonsWriteAll, PersonsDelete, PersonsDeleteAll,
	StudentsCreate, StudentsRead, StudentsReadAll, StudentsWrite, StudentsWriteAll, StudentsDelete, StudentsDeleteAll,
	StaffRead, StaffReadAll, StaffWrite, StaffWriteAll, StaffDelete, StaffDeleteAll,
	TeachersCreate, TeachersRead, TeachersReadAll, TeachersWrite, TeachersWriteAll, TeachersDelete, TeachersDeleteAll,
	GuardiansCreate, GuardiansRead, GuardiansReadAll, GuardiansWrite, GuardiansWriteAll, GuardiansDelete, GuardiansDeleteAll,
}

type Subject struct {
	CASUserID uuid.UUID `json:"cas_user_id"`
	SessionID string    `json:"session_id,omitempty"`
	TenantID  string    `json:"tenant_id,omitempty"`
	ClientID  string    `json:"client_id,omitempty"`
	Scopes    []string  `json:"scopes,omitempty"`
	RawToken  string    `json:"-"`
}

type Decision struct {
	Allowed bool
	Rule    string
	Reason  string

	Reach    Reach
	HasReach bool

	Fields *FieldPolicy

	Grants []Grant

	Constraints [][]Constraint
}

type Grant struct {
	Rule        string
	Constraints []Constraint
	Fields      *FieldPolicy
}

func (g Grant) Pinned() bool { return len(g.Constraints) > 0 }

type Guard interface {
	Allow(ctx context.Context, sub *Subject, entity Entity, attrs Attributes) (Decision, error)
	Name() string
}

type AllowAll struct{}

func (AllowAll) Allow(context.Context, *Subject, Entity, Attributes) (Decision, error) {
	return Decision{Allowed: true, Reason: "development guard"}, nil
}

func (AllowAll) Name() string { return "allow-all (development)" }

type DenyAll struct{}

func (DenyAll) Allow(context.Context, *Subject, Entity, Attributes) (Decision, error) {
	return Decision{Allowed: false, Reason: "no policy source configured"}, nil
}

func (DenyAll) Name() string { return "deny-all" }
