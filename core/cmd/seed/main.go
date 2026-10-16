package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	_ "time/tzdata"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/school"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const usage = `emerge-core seed

Creates a school, stores its database credentials, and gives it a first
administrator. Safe to run twice: everything it makes is looked up first.

  seed -school-name "DPS Nagpur" -school-code DPS-NGP \
       -tenant-dsn "postgres://emerge:emerge@localhost:5434/emerge_tenant_demo?sslmode=disable" \
       -admin-cas-user-id 11111111-1111-4111-8111-111111111111 \
       -admin-first-name Priya -admin-last-name Desai -admin-email priya@example.com

The administrator needs a CAS identity. Either pass one that already exists
with -admin-cas-user-id, or have this command create it by passing
-cas-admin-token, which is used once against CAS's admin API and never stored.

That token must be a superadmin's own USER token. A client_credentials
service token cannot call /v1/admin/*: those routes parse a session id from
the claims, and a service token deliberately has none, so it is rejected
before authorization is considered. emerge-core therefore cannot mint CAS
identities by itself at runtime.

Getting the first superadmin, on a fresh CAS: set CAS_SUPERADMIN_PASSWORD in
CAS's environment and leave CAS_SUPERADMIN_EMAIL unset. Setting the email
makes the account passwordless and you will need a working mail provider to
sign in at all. The seeded superadmin is forced to change its password on
first login, and that change revokes the session it just used, so log in
again afterwards to get the token you pass here.

Run the migrations first, or there will be no tables to write into:

  go run ./cmd/migrate apply -plane control
  # then, after this command has stored the credentials:
  go run ./cmd/migrate apply -plane tenant

Environment:
  CONTROL_DATABASE_URL   control-plane DSN
  SECRETS_MASTER_KEY     master key used to encrypt the stored credentials
  CAS_BASE_URL           only needed when minting a CAS identity
`

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

type options struct {
	schoolName  string
	schoolCode  string
	casTenant   string
	timezone    string
	country     string
	tenantDSN   string
	casUserID   string
	firstName   string
	lastName    string
	email       string
	phone       string
	employee    string
	designation string

	casAdminToken string
	casUsername   string
	casPassword   string
}

func run() error {
	config.LoadDotEnv()

	var o options
	fs := flag.NewFlagSet("seed", flag.ExitOnError)
	fs.Usage = func() { fmt.Print(usage) }

	fs.StringVar(&o.schoolName, "school-name", "", "display name of the school")
	fs.StringVar(&o.schoolCode, "school-code", "", "short uppercase code, used as X-School-Id")
	fs.StringVar(&o.casTenant, "cas-tenant", "", "CAS tenant slug, if the school is registered there")
	fs.StringVar(&o.timezone, "timezone", "Asia/Kolkata", "IANA timezone")
	fs.StringVar(&o.country, "country", "IN", "ISO 3166-1 alpha-2")
	fs.StringVar(&o.tenantDSN, "tenant-dsn", "", "postgres DSN for this school's own database")

	fs.StringVar(&o.casUserID, "admin-cas-user-id", "", "existing CAS user id for the administrator")
	fs.StringVar(&o.firstName, "admin-first-name", "", "administrator's given name")
	fs.StringVar(&o.lastName, "admin-last-name", "", "administrator's family name")
	fs.StringVar(&o.email, "admin-email", "", "administrator's contact email")
	fs.StringVar(&o.phone, "admin-phone", "", "administrator's contact phone")
	fs.StringVar(&o.employee, "admin-employee-code", "ADMIN-0001", "administrator's employee code")
	fs.StringVar(&o.designation, "admin-designation", "Administrator", "administrator's designation")

	fs.StringVar(&o.casAdminToken, "cas-admin-token", "", "CAS admin bearer, used once to mint the identity")
	fs.StringVar(&o.casUsername, "admin-username", "", "CAS username, when minting")
	fs.StringVar(&o.casPassword, "admin-password", "", "CAS password, when minting")

	if err := fs.Parse(os.Args[1:]); err != nil {
		return err
	}

	if o.schoolName == "" || o.schoolCode == "" {
		fs.Usage()
		return errors.New("-school-name and -school-code are required")
	}
	o.schoolCode = strings.ToUpper(strings.TrimSpace(o.schoolCode))
	if o.tenantDSN == "" {
		return errors.New("-tenant-dsn is required: a school needs its own database")
	}
	if o.firstName == "" {
		return errors.New("-admin-first-name is required")
	}
	if o.casUserID == "" && o.casAdminToken == "" {
		return errors.New("pass -admin-cas-user-id for an existing CAS identity, or -cas-admin-token to create one")
	}

	ctx := context.Background()

	controlDSN := os.Getenv("CONTROL_DATABASE_URL")
	if controlDSN == "" {
		return errors.New("CONTROL_DATABASE_URL is required")
	}
	keyring, err := crypto.ParseKeyring(os.Getenv("SECRETS_MASTER_KEY"))
	if err != nil {
		return fmt.Errorf("SECRETS_MASTER_KEY: %w", err)
	}

	control, err := postgres.NewControl(ctx, controlDSN, postgres.Options{})
	if err != nil {
		return err
	}
	defer control.Close()

	registry := postgres.NewRegistry(control, keyring, postgres.Options{}, postgres.Discard())

	row, err := upsertSchool(ctx, control, o)
	if err != nil {
		return err
	}
	fmt.Printf("school     %s  %s\n", row.Code, row.ID)

	if err := storeProfile(ctx, control, registry, row.ID, o.tenantDSN); err != nil {
		return err
	}
	fmt.Printf("profile    postgres credentials stored (key version %d)\n", keyring.CurrentVersion())

	casUserID, err := resolveCASUser(ctx, o)
	if err != nil {
		return err
	}
	fmt.Printf("identity   %s\n", casUserID)

	conn, err := registry.Get(ctx, row.ID)
	if err != nil {
		return fmt.Errorf("%w\n\nHint: run `go run ./cmd/migrate apply -plane tenant` first", err)
	}

	person, err := upsertPerson(ctx, conn.Client, casUserID, o)
	if err != nil {
		return err
	}
	fmt.Printf("person     %s  %s\n", person.DisplayName, person.ID)

	staff, err := upsertStaff(ctx, conn.Client, person.ID, o)
	if err != nil {
		return err
	}
	fmt.Printf("staff      %s  %s\n", staff.EmployeeCode, staff.ID)

	fmt.Printf("\nDone. Use this school with:  X-School-Id: %s\n", row.Code)
	fmt.Printf("The administrator can act once CAS grants them policies.\n")
	return nil
}

func upsertSchool(ctx context.Context, control *postgres.Control, o options) (*controlent.School, error) {
	existing, err := control.Client.School.Query().Where(school.Code(o.schoolCode)).Only(ctx)
	if err == nil {
		return existing, nil
	}
	if !controlent.IsNotFound(err) {
		return nil, err
	}

	if _, err := time.LoadLocation(o.timezone); err != nil {
		return nil, fmt.Errorf("timezone %q is not a known IANA timezone", o.timezone)
	}

	create := control.Client.School.Create().
		SetName(o.schoolName).
		SetCode(o.schoolCode).
		SetTimezone(o.timezone).
		SetCountry(strings.ToUpper(o.country))
	if o.casTenant != "" {
		create = create.SetCasTenantID(o.casTenant)
	}
	return create.Save(ctx)
}

func storeProfile(ctx context.Context, control *postgres.Control, registry *postgres.Registry,
	schoolID uuid.UUID, dsn string) error {
	creds := tenancy.PostgresCredentials{DSN: dsn}
	nonce, ciphertext, version, err := registry.EncryptCredentials(schoolID, creds)
	if err != nil {
		return err
	}

	err = control.Client.SchoolProfile.Create().
		SetSchoolID(schoolID).
		SetProfileType("postgres").
		SetName("primary").
		SetKeyVersion(version).
		SetNonce(nonce).
		SetCiphertext(ciphertext).
		SetRotatedAt(time.Now()).
		OnConflictColumns("school_id", "profile_type", "name").
		UpdateNewValues().
		Exec(ctx)
	if err != nil {
		return err
	}
	registry.Evict(schoolID)
	return nil
}

func resolveCASUser(ctx context.Context, o options) (uuid.UUID, error) {
	if o.casUserID != "" {
		id, err := uuid.Parse(o.casUserID)
		if err != nil {
			return uuid.Nil, fmt.Errorf("-admin-cas-user-id is not a UUID: %w", err)
		}
		return id, nil
	}

	base := strings.TrimRight(os.Getenv("CAS_BASE_URL"), "/")
	if base == "" {
		return uuid.Nil, errors.New("CAS_BASE_URL is required to mint an identity")
	}
	if o.casUsername == "" || o.casPassword == "" {
		return uuid.Nil, errors.New("-admin-username and -admin-password are required when minting")
	}

	payload := map[string]any{
		"username":  o.casUsername,
		"password":  o.casPassword,
		"full_name": strings.TrimSpace(o.firstName + " " + o.lastName),
	}
	if o.email != "" {
		payload["email"] = o.email
	}
	if o.phone != "" {
		payload["phone"] = o.phone
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return uuid.Nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1/admin/users", bytes.NewReader(body))
	if err != nil {
		return uuid.Nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+o.casAdminToken)

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return uuid.Nil, fmt.Errorf("cas: create user: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode == http.StatusConflict {
		return uuid.Nil, errors.New("cas: that username or email already exists; pass -admin-cas-user-id instead")
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return uuid.Nil, fmt.Errorf("cas: create user returned %s", resp.Status)
	}

	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.ID == "" {
		return uuid.Nil, errors.New("cas: could not read the created user's id from the response")
	}
	return uuid.Parse(out.ID)
}

func upsertPerson(ctx context.Context, client *tenantent.Client, casUserID uuid.UUID,
	o options) (*tenantent.Person, error) {
	existing, err := client.Person.Query().Where(entperson.CasUserID(casUserID)).Only(ctx)
	if err == nil {
		return existing, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}

	display := strings.TrimSpace(o.firstName + " " + o.lastName)
	create := client.Person.Create().
		SetCasUserID(casUserID).
		SetFirstName(o.firstName).
		SetDisplayName(display)
	if o.lastName != "" {
		create = create.SetLastName(o.lastName)
	}
	if o.email != "" {
		create = create.SetEmail(o.email)
	}
	if o.phone != "" {
		create = create.SetPhone(o.phone)
	}
	return create.Save(ctx)
}

func upsertStaff(ctx context.Context, client *tenantent.Client, personID uuid.UUID,
	o options) (*tenantent.Staff, error) {
	existing, err := client.Staff.Query().Where(entstaff.PersonID(personID)).First(ctx)
	if err == nil {
		return existing, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}

	return client.Staff.Create().
		SetPersonID(personID).
		SetEmployeeCode(o.employee).
		SetDesignation(o.designation).
		SetEmploymentType(entstaff.EmploymentTypeFullTime).
		Save(ctx)
}
