package http

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/predicate"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/school"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/schoolprofile"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/transport/http/middleware"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

func timeout(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), 10*time.Second)
}

type createSchoolRequest struct {
	Name        string  `json:"name"`
	LegalName   *string `json:"legal_name"`
	Code        string  `json:"code"`
	CASTenantID *string `json:"cas_tenant_id"`
	Timezone    string  `json:"timezone"`
	Country     string  `json:"country"`
	State       *string `json:"state"`
	City        *string `json:"city"`
	Phone       *string `json:"phone"`
	Email       *string `json:"email"`
	Website     *string `json:"website"`
}

func (s *Server) listSchools(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}

	q := s.control.Client.School.Query()
	if status := r.URL.Query().Get("status"); status != "" {
		if err := school.StatusValidator(school.Status(status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be one of active, suspended, closed")
			return
		}
		q = q.Where(school.StatusEQ(school.Status(status)))
	}

	rows, err := q.Order(controlent.Desc(school.FieldCreatedAt)).Limit(limit).Offset(offset).All(ctx)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{"schools": rows, "count": len(rows)})
}

func (s *Server) createSchool(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	var in createSchoolRequest
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	in.Name = strings.TrimSpace(in.Name)
	in.Code = strings.ToUpper(strings.TrimSpace(in.Code))
	if in.Name == "" || in.Code == "" {
		response.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}
	slug, ok := tenantSlug(in.CASTenantID)
	if !ok {
		response.Error(w, http.StatusBadRequest, badSlug(in.CASTenantID))
		return
	}
	in.CASTenantID = slug
	if in.Timezone == "" {
		in.Timezone = "Asia/Kolkata"
	}
	if _, err := time.LoadLocation(in.Timezone); err != nil {
		response.Error(w, http.StatusBadRequest, "timezone is not a known IANA timezone")
		return
	}
	if in.Country == "" {
		in.Country = "IN"
	}

	clash, err := addressingClash(ctx, s.control.Client, uuid.Nil, in.Code, slug)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	if clash != "" {
		response.Error(w, http.StatusConflict, clash)
		return
	}

	create := s.control.Client.School.Create().
		SetName(in.Name).
		SetCode(in.Code).
		SetTimezone(in.Timezone).
		SetCountry(strings.ToUpper(in.Country)).
		SetNillableLegalName(in.LegalName).
		SetNillableCasTenantID(in.CASTenantID).
		SetNillableState(in.State).
		SetNillableCity(in.City).
		SetNillablePhone(in.Phone).
		SetNillableEmail(in.Email).
		SetNillableWebsite(in.Website)

	row, err := create.Save(ctx)
	if err != nil {
		if controlent.IsConstraintError(err) {
			response.Error(w, http.StatusConflict, "a school with that name, code or CAS tenant already exists")
			return
		}
		response.ServerError(w, err)
		return
	}

	w.Header().Set("Location", "/api/v1/schools/"+row.ID.String())
	response.JSON(w, http.StatusCreated, response.Envelope{
		"school":     row,
		"cas_tenant": s.ensureTenant(ctx, row),
	})
}

var casTenantSlug = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,62}$`)

func tenantSlug(in *string) (*string, bool) {
	if in == nil {
		return nil, true
	}
	trimmed := strings.TrimSpace(*in)
	if !casTenantSlug.MatchString(trimmed) {
		return nil, false
	}
	return &trimmed, true
}

func badSlug(in *string) string {
	return "cas_tenant_id " + strconv.Quote(strings.TrimSpace(*in)) +
		" is not a CAS tenant slug; it must match ^[a-z0-9][a-z0-9_-]{0,62}$, " +
		"which is the shape CAS itself accepts and the shape " + middleware.SchoolHeader +
		" relies on to tell a slug apart from a school code"
}

func addressingClash(ctx context.Context, client *controlent.Client, self uuid.UUID, code string, slug *string) (string, error) {
	if slug != nil {
		other, err := otherSchool(ctx, client, self, school.CodeEqualFold(*slug))
		if err != nil {
			return "", err
		}
		if other != nil {
			return "cas_tenant_id " + strconv.Quote(*slug) + " is already the code of school " +
				strconv.Quote(other.Code) + ", and " + middleware.SchoolHeader +
				" tries codes before CAS slugs, so that header would reach the other school; " +
				"choose a slug that is not also a school code", nil
		}
	}
	if code != "" {
		other, err := otherSchool(ctx, client, self, school.CasTenantIDEqualFold(code))
		if err != nil {
			return "", err
		}
		if other != nil {
			taken := ""
			if other.CasTenantID != nil {
				taken = *other.CasTenantID
			}
			return "code " + strconv.Quote(code) + " is already the CAS tenant slug " + strconv.Quote(taken) +
				" of school " + strconv.Quote(other.Code) + ", and " + middleware.SchoolHeader +
				" tries codes before CAS slugs, so that header would stop reaching the other school; " +
				"choose a code that is not also a CAS tenant slug", nil
		}
	}
	return "", nil
}

func otherSchool(ctx context.Context, client *controlent.Client, self uuid.UUID, where predicate.School) (*controlent.School, error) {
	q := client.School.Query().Where(where)
	if self != uuid.Nil {
		q = q.Where(school.IDNEQ(self))
	}
	rows, err := q.Limit(1).All(ctx)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return rows[0], nil
}

func (s *Server) getSchool(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "school id must be a UUID")
		return
	}

	row, err := s.control.Client.School.Get(ctx, id)
	if err != nil {
		if controlent.IsNotFound(err) {
			response.Error(w, http.StatusNotFound, "school not found")
			return
		}
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

const credentialProbeTimeout = 3 * time.Second

func (s *Server) putSchoolProfile(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "school id must be a UUID")
		return
	}

	kind := schoolprofile.ProfileType(strings.ToLower(chi.URLParam(r, "type")))
	if err := schoolprofile.ProfileTypeValidator(kind); err != nil {
		response.Error(w, http.StatusBadRequest, "profile type must be one of postgres, mysql, s3, smtp")
		return
	}

	if _, err := s.control.Client.School.Get(ctx, id); err != nil {
		if controlent.IsNotFound(err) {
			response.Error(w, http.StatusNotFound, "school not found")
			return
		}
		response.ServerError(w, err)
		return
	}

	creds, ok := decodeCredentials(w, r, kind)
	if !ok {
		return
	}
	if !reachable(ctx, w, creds) {
		return
	}

	nonce, ciphertext, version, err := s.registry.EncryptCredentials(id, creds)
	if err != nil {
		response.ServerError(w, err)
		return
	}

	err = s.control.Client.SchoolProfile.Create().
		SetSchoolID(id).
		SetProfileType(kind).
		SetName("primary").
		SetKeyVersion(version).
		SetNonce(nonce).
		SetCiphertext(ciphertext).
		SetRotatedAt(time.Now()).
		OnConflictColumns(schoolprofile.FieldSchoolID, schoolprofile.FieldProfileType, schoolprofile.FieldName).
		UpdateNewValues().
		Exec(ctx)
	if err != nil {
		response.ServerError(w, err)
		return
	}

	s.registry.Evict(id)

	response.JSON(w, http.StatusOK, response.Envelope{
		"school_id":    id,
		"profile_type": kind,
		"key_version":  version,
		"stored":       true,
	})
}

func decodeCredentials(w http.ResponseWriter, r *http.Request, kind schoolprofile.ProfileType) (any, bool) {
	switch kind {
	case schoolprofile.ProfileTypePostgres:
		var creds tenancy.PostgresCredentials
		if !decodeInto(w, r, kind, &creds) {
			return nil, false
		}
		if creds.DSN == "" {
			if gaps := blanks("host", creds.Host, "database", creds.Database, "user", creds.User); len(gaps) > 0 {
				response.Error(w, http.StatusUnprocessableEntity,
					"postgres credentials need "+strings.Join(gaps, ", ")+", or a dsn instead")
				return nil, false
			}
		}
		return creds, true

	case schoolprofile.ProfileTypeMysql:
		var creds tenancy.MySQLCredentials
		if !decodeInto(w, r, kind, &creds) {
			return nil, false
		}
		if gaps := blanks("host", creds.Host, "database", creds.Database, "user", creds.User); len(gaps) > 0 {
			response.Error(w, http.StatusUnprocessableEntity,
				"mysql credentials need "+strings.Join(gaps, ", "))
			return nil, false
		}
		return creds, true

	case schoolprofile.ProfileTypeS3:
		var creds tenancy.S3Credentials
		if !decodeInto(w, r, kind, &creds) {
			return nil, false
		}
		if _, err := blob.New(creds); err != nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"the s3 credentials were not stored: "+err.Error())
			return nil, false
		}
		return creds, true

	case schoolprofile.ProfileTypeSMTP:
		var creds tenancy.SMTPCredentials
		if !decodeInto(w, r, kind, &creds) {
			return nil, false
		}
		if gaps := blanks("host", creds.Host, "username", creds.Username,
			"password", creds.Password, "from_address", creds.FromAddress); len(gaps) > 0 {
			response.Error(w, http.StatusUnprocessableEntity,
				"smtp credentials need "+strings.Join(gaps, ", "))
			return nil, false
		}
		if _, err := creds.Security(); err != nil {
			response.Error(w, http.StatusUnprocessableEntity,
				"the smtp credentials were not stored: "+err.Error())
			return nil, false
		}
		if creds.Port < 0 || creds.Port > 65535 {
			response.Error(w, http.StatusUnprocessableEntity,
				"smtp port must be between 1 and 65535")
			return nil, false
		}
		if field, why := senders(creds); why != "" {
			response.Error(w, http.StatusUnprocessableEntity, "smtp "+field+" "+why)
			return nil, false
		}
		return creds, true

	default:
		response.Error(w, http.StatusBadRequest, "profile type must be one of postgres, mysql, s3, smtp")
		return nil, false
	}
}

func decodeInto(w http.ResponseWriter, r *http.Request, kind schoolprofile.ProfileType, dst any) bool {
	err := response.Decode(r, dst)
	switch {
	case err == nil:
		return true
	case malformed(err):
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
	default:
		response.Error(w, http.StatusUnprocessableEntity,
			"the body does not match the "+string(kind)+" credential shape: "+err.Error())
	}
	return false
}

func malformed(err error) bool {
	var syntax *json.SyntaxError
	if errors.As(err, &syntax) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return true
	}
	var typeErr *json.UnmarshalTypeError
	return !errors.As(err, &typeErr) && !strings.Contains(err.Error(), "unknown field")
}

func blanks(pairs ...string) []string {
	var out []string
	for i := 0; i+1 < len(pairs); i += 2 {
		if strings.TrimSpace(pairs[i+1]) == "" {
			out = append(out, pairs[i])
		}
	}
	return out
}

func reachable(ctx context.Context, w http.ResponseWriter, creds any) bool {
	switch c := creds.(type) {
	case tenancy.PostgresCredentials:
		dsn, err := c.ConnString()
		if err != nil {
			response.Error(w, http.StatusUnprocessableEntity, refusal("postgres", target(c), err, c.Password))
			return false
		}
		probe, cancel := context.WithTimeout(ctx, credentialProbeTimeout)
		defer cancel()
		_, db, err := postgres.Open(probe, dsn, postgres.Options{
			MaxOpenConns:   1,
			MaxIdleConns:   1,
			ConnectTimeout: credentialProbeTimeout,
		})
		if err != nil {
			response.Error(w, http.StatusUnprocessableEntity, refusal("postgres", target(c), err, c.Password))
			return false
		}
		_ = db.Close()
		return true

	case tenancy.MySQLCredentials:
		port := c.Port
		if port == 0 {
			port = 3306
		}
		probe, cancel := context.WithTimeout(ctx, credentialProbeTimeout)
		defer cancel()
		conn, err := (&net.Dialer{}).DialContext(probe, "tcp", net.JoinHostPort(c.Host, strconv.Itoa(port)))
		if err != nil {
			response.Error(w, http.StatusUnprocessableEntity, refusal("mysql", c.String(), err, c.Password))
			return false
		}
		_ = conn.Close()
		return true

	case tenancy.SMTPCredentials:
		probe, cancel := context.WithTimeout(ctx, credentialProbeTimeout)
		defer cancel()
		if err := smtpProbe(probe, c); err != nil {
			response.Error(w, http.StatusUnprocessableEntity,
				refused("smtp", c.String(), "did not accept them", err, c.Password))
			return false
		}
		return true
	}
	return true
}

func senders(c tenancy.SMTPCredentials) (string, string) {
	for _, pair := range [][2]string{{"from_address", c.FromAddress}, {"envelope_from", c.EnvelopeFrom}} {
		if pair[1] == "" {
			continue
		}
		parsed, err := mail.ParseAddress(pair[1])
		if err != nil {
			return pair[0], "must be a single email address"
		}
		if parsed.Name != "" {
			return pair[0], "must be a bare address; put the display name in from_name"
		}
	}
	return "", ""
}

func smtpProbe(ctx context.Context, c tenancy.SMTPCredentials) error {
	mode, err := c.Security()
	if err != nil {
		return err
	}
	if mode == tenancy.SMTPNone && !loopback(c.Host) {
		return errors.New("it asks for no encryption, and a password may not cross the network in the clear; " +
			"set encryption to starttls or tls")
	}

	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", c.Address())
	if err != nil {
		return err
	}
	defer conn.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}

	if mode == tenancy.SMTPTLS {
		secure := tls.Client(conn, &tls.Config{ServerName: c.Host})
		if err := secure.HandshakeContext(ctx); err != nil {
			return err
		}
		conn = secure
	}

	client, err := smtp.NewClient(conn, c.Host)
	if err != nil {
		return err
	}
	defer client.Close()

	if c.HeloName != "" {
		if err := client.Hello(c.HeloName); err != nil {
			return smtpFailure(err, c.Password)
		}
	}
	if mode == tenancy.SMTPStartTLS {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return errors.New("it does not offer STARTTLS, so the password would cross the network in the clear")
		}
		if err := client.StartTLS(&tls.Config{ServerName: c.Host}); err != nil {
			return err
		}
	}

	auth, err := smtpAuth(client, c)
	if err != nil {
		return err
	}
	if err := client.Auth(auth); err != nil {
		return smtpFailure(err, c.Password)
	}
	_ = client.Quit()
	return nil
}

func smtpAuth(client *smtp.Client, c tenancy.SMTPCredentials) (smtp.Auth, error) {
	ok, mechanisms := client.Extension("AUTH")
	if !ok {
		return nil, errors.New("it does not offer AUTH, so these credentials cannot be verified")
	}
	switch mechanisms = strings.ToUpper(mechanisms); {
	case strings.Contains(mechanisms, "PLAIN"):
		return smtp.PlainAuth("", c.Username, c.Password, c.Host), nil
	case strings.Contains(mechanisms, "LOGIN"):
		return smtpLogin{username: c.Username, password: c.Password, host: c.Host}, nil
	case strings.Contains(mechanisms, "CRAM-MD5"):
		return smtp.CRAMMD5Auth(c.Username, c.Password), nil
	}
	return nil, errors.New("it offers only " + mechanisms + ", none of which can be checked from here")
}

type smtpLogin struct {
	username string
	password string
	host     string
}

func (a smtpLogin) Start(server *smtp.ServerInfo) (string, []byte, error) {
	if !server.TLS && !loopback(server.Name) {
		return "", nil, errors.New("unencrypted connection")
	}
	if server.Name != a.host {
		return "", nil, errors.New("wrong host name")
	}
	return "LOGIN", nil, nil
}

func (a smtpLogin) Next(fromServer []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(string(fromServer))) {
	case "username:":
		return []byte(a.username), nil
	case "password:":
		return []byte(a.password), nil
	}
	return nil, errors.New("unexpected challenge during LOGIN")
}

func loopback(host string) bool {
	switch strings.ToLower(host) {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}

func smtpFailure(err error, password string) error {
	message := redactAuthPayload(err.Error(), password)
	var reply *textproto.Error
	if errors.As(err, &reply) && reply.Code >= 400 && reply.Code < 500 {
		return errors.New(message + " (a 4xx reply is usually a throttle rather than a wrong password, so try again shortly)")
	}
	return errors.New(message)
}

var authPayload = regexp.MustCompile(`(?i)\bAUTH\s+(PLAIN|LOGIN|CRAM-MD5)(\s+\S+)?`)

func redactAuthPayload(message, password string) string {
	message = authPayload.ReplaceAllString(message, "AUTH $1 REDACTED")
	if password == "" {
		return message
	}
	for _, token := range strings.Fields(message) {
		decoded, err := base64.StdEncoding.DecodeString(strings.Trim(token, `"'.,;:`))
		if err != nil {
			continue
		}
		if strings.Contains(string(decoded), password) {
			message = strings.ReplaceAll(message, token, "REDACTED")
		}
	}
	return message
}

func target(c tenancy.PostgresCredentials) string {
	if c.Host == "" && c.DSN != "" {
		return "the supplied dsn"
	}
	return c.String()
}

func refusal(kind, where string, err error, password string) string {
	return refused(kind, where, "did not accept a connection", err, password)
}

func refused(kind, where, why string, err error, password string) string {
	return "the " + kind + " credentials were not stored because " + where + " " + why + ": " +
		scrub(err.Error(), password) + ". The profile already on file is unchanged."
}

var (
	inlinePassword  = regexp.MustCompile(`(://[^:/@\s]+):[^@\s]*@`)
	keywordPassword = regexp.MustCompile(`(?i)password=\S+`)
)

func scrub(message, password string) string {
	if password != "" {
		message = strings.ReplaceAll(message, password, "REDACTED")
		if escaped := url.QueryEscape(password); escaped != password {
			message = strings.ReplaceAll(message, escaped, "REDACTED")
		}
	}
	message = inlinePassword.ReplaceAllString(message, "$1:REDACTED@")
	return keywordPassword.ReplaceAllString(message, "password=REDACTED")
}

func writeTenancyErr(w http.ResponseWriter, err error) {
	switch {
	case err == tenancy.ErrNoTenant:
		response.Error(w, http.StatusBadRequest, "X-School-Id header is required")
	default:
		response.ServerError(w, err)
	}
}

type updateSchoolRequest struct {
	Name        *string `json:"name"`
	LegalName   *string `json:"legal_name"`
	CASTenantID *string `json:"cas_tenant_id"`
	Timezone    *string `json:"timezone"`
	Country     *string `json:"country"`
	State       *string `json:"state"`
	City        *string `json:"city"`
	Phone       *string `json:"phone"`
	Email       *string `json:"email"`
	Website     *string `json:"website"`
	Status      *string `json:"status"`
}

func (s *Server) updateSchool(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "school id must be a UUID")
		return
	}

	var in updateSchoolRequest
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if in.Timezone != nil {
		if _, err := time.LoadLocation(*in.Timezone); err != nil {
			response.Error(w, http.StatusBadRequest, "timezone is not a known IANA timezone")
			return
		}
	}
	slug, ok := tenantSlug(in.CASTenantID)
	if !ok {
		response.Error(w, http.StatusBadRequest, badSlug(in.CASTenantID))
		return
	}
	in.CASTenantID = slug
	clash, err := addressingClash(ctx, s.control.Client, id, "", slug)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	if clash != "" {
		response.Error(w, http.StatusConflict, clash)
		return
	}

	update := s.control.Client.School.UpdateOneID(id).
		SetNillableName(in.Name).
		SetNillableLegalName(in.LegalName).
		SetNillableCasTenantID(in.CASTenantID).
		SetNillableTimezone(in.Timezone).
		SetNillableState(in.State).
		SetNillableCity(in.City).
		SetNillablePhone(in.Phone).
		SetNillableEmail(in.Email).
		SetNillableWebsite(in.Website)

	if in.Country != nil {
		update = update.SetCountry(strings.ToUpper(*in.Country))
	}
	if in.Status != nil {
		if err := school.StatusValidator(school.Status(*in.Status)); err != nil {
			response.Error(w, http.StatusBadRequest, "status must be active, suspended or closed")
			return
		}
		update = update.SetStatus(school.Status(*in.Status))
	}

	row, err := update.Save(ctx)
	if err != nil {
		writeControlEntErr(w, err)
		return
	}

	s.registry.Evict(id)
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteSchool(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "school id must be a UUID")
		return
	}

	tx, err := s.control.Client.Tx(ctx)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	if _, err := tx.SchoolProfile.Delete().
		Where(schoolprofile.SchoolID(id)).Exec(ctx); err != nil {
		_ = tx.Rollback()
		writeControlEntErrFor(w, err, "this school's credentials could not be removed")
		return
	}
	if err := tx.School.DeleteOneID(id).Exec(ctx); err != nil {
		_ = tx.Rollback()
		writeControlEntErrFor(w, err, "something still references this school")
		return
	}
	if err := tx.Commit(); err != nil {
		response.ServerError(w, err)
		return
	}
	s.registry.Evict(id)
	response.NoContent(w)
}

func writeControlEntErr(w http.ResponseWriter, err error) {
	writeControlEntErrFor(w, err, "that name, code or CAS tenant is already taken")
}

func writeControlEntErrFor(w http.ResponseWriter, err error, conflict string) {
	switch {
	case controlent.IsNotFound(err):
		response.Error(w, http.StatusNotFound, "school not found")
	case controlent.IsConstraintError(err):
		response.Error(w, http.StatusConflict, conflict)
	case controlent.IsValidationError(err):
		response.Error(w, http.StatusBadRequest, err.Error())
	default:
		response.ServerError(w, err)
	}
}

func (s *Server) ensureTenant(ctx context.Context, row *controlent.School) any {
	tenant := ""
	if row.CasTenantID != nil {
		tenant = *row.CasTenantID
	}
	if tenant == "" {
		return map[string]any{
			"status": "skipped",
			"detail": "the school carries no cas_tenant_id, so there is no tenant to provision; " +
				"PATCH one on and re-run, or nobody can be granted anything in this school",
		}
	}

	if !s.tenants.Available() {
		return map[string]any{
			"status": "skipped",
			"tenant": tenant,
			"detail": "CAS is not configured here; create a ROOT group keyed " + tenant +
				" and tag it with tenant_id " + tenant,
		}
	}

	out, err := s.tenants.Ensure(ctx, tenant, row.Name)
	if err != nil {
		s.logger.Warn("cas tenant not provisioned", "school", row.Code, "tenant", tenant, "error", err)
		return map[string]any{
			"status": "failed",
			"tenant": tenant,
			"detail": err.Error(),
			"finish": "POST /v1/admin/groups {\"key\":\"" + tenant + "\",\"name\":\"" + row.Name +
				"\"} then PUT /v1/admin/groups/{id}/tenant {\"tenant_id\":\"" + tenant + "\"}",
		}
	}

	s.logger.Info("cas tenant provisioned",
		"school", row.Code, "tenant", out.Tenant, "group", out.GroupID, "outcome", string(out.Outcome))
	return out
}
