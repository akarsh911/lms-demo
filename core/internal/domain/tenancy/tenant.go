package tenancy

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

var (
	ErrNoTenant       = errors.New("tenancy: no tenant in context")
	ErrUnknownSchool  = errors.New("tenancy: unknown school")
	ErrSchoolInactive = errors.New("tenancy: school is not active")
	ErrNoProfile      = errors.New("tenancy: school has no active postgres profile")
)

type ProfileType string

const (
	ProfilePostgres ProfileType = "postgres"
	ProfileMySQL    ProfileType = "mysql"
	ProfileS3       ProfileType = "s3"
	ProfileSMTP     ProfileType = "smtp"
)

type Tenant struct {
	SchoolID    uuid.UUID `json:"school_id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	CASTenantID string    `json:"cas_tenant_id,omitempty"`
	Timezone    string    `json:"timezone"`
}

type PostgresCredentials struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	User     string `json:"user"`
	Password string `json:"password"`
	SSLMode  string `json:"sslmode,omitempty"`
	DSN      string `json:"dsn,omitempty"`
}

func (c PostgresCredentials) String() string {
	return fmt.Sprintf("postgres://%s:REDACTED@%s:%d/%s", c.User, c.Host, c.Port, c.Database)
}

func (c PostgresCredentials) ConnString() (string, error) {
	if c.DSN != "" {
		return c.DSN, nil
	}
	if c.Host == "" || c.Database == "" || c.User == "" {
		return "", errors.New("tenancy: postgres credentials need host, database and user")
	}
	port := c.Port
	if port == 0 {
		port = 5432
	}
	sslMode := c.SSLMode
	if sslMode == "" {
		sslMode = "require"
	}
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(c.User, c.Password),
		Host:     c.Host + ":" + strconv.Itoa(port),
		Path:     "/" + c.Database,
		RawQuery: url.Values{"sslmode": {sslMode}}.Encode(),
	}
	return u.String(), nil
}

type S3Credentials struct {
	Endpoint        string `json:"endpoint,omitempty"`
	Region          string `json:"region"`
	Bucket          string `json:"bucket"`
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	UsePathStyle    bool   `json:"use_path_style,omitempty"`
}

func (c S3Credentials) String() string {
	return fmt.Sprintf("s3://%s (region=%s, key=%s, secret=REDACTED)", c.Bucket, c.Region, c.AccessKeyID)
}

type MySQLCredentials struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	User     string `json:"user"`
	Password string `json:"password"`
	Params   string `json:"params,omitempty"`
}

func (c MySQLCredentials) String() string {
	return fmt.Sprintf("mysql://%s:REDACTED@%s:%d/%s", c.User, c.Host, c.Port, c.Database)
}

func (c MySQLCredentials) DSN() string {
	port := c.Port
	if port == 0 {
		port = 3306
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s", c.User, c.Password, c.Host, port, c.Database)
	if c.Params != "" {
		dsn += "?" + c.Params
	}
	return dsn
}

const (
	SMTPStartTLS = "starttls"
	SMTPTLS      = "tls"
	SMTPNone     = "none"
)

type SMTPCredentials struct {
	Host         string `json:"host"`
	Port         int    `json:"port"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	Encryption   string `json:"encryption,omitempty"`
	FromAddress  string `json:"from_address"`
	FromName     string `json:"from_name,omitempty"`
	EnvelopeFrom string `json:"envelope_from,omitempty"`
	HeloName     string `json:"helo_name,omitempty"`
}

func (c SMTPCredentials) String() string {
	return fmt.Sprintf("smtp://%s:REDACTED@%s (from=%s)", c.Username, c.Address(), c.FromAddress)
}

func (c SMTPCredentials) Address() string {
	return net.JoinHostPort(c.Host, strconv.Itoa(c.EffectivePort()))
}

func (c SMTPCredentials) EffectivePort() int {
	if c.Port != 0 {
		return c.Port
	}
	if strings.EqualFold(strings.TrimSpace(c.Encryption), SMTPTLS) {
		return 465
	}
	return 587
}

func (c SMTPCredentials) Security() (string, error) {
	switch strings.ToLower(strings.TrimSpace(c.Encryption)) {
	case SMTPTLS:
		return SMTPTLS, nil
	case SMTPStartTLS:
		return SMTPStartTLS, nil
	case SMTPNone:
		return SMTPNone, nil
	case "":
		if c.Port == 465 {
			return SMTPTLS, nil
		}
		return SMTPStartTLS, nil
	}
	return "", fmt.Errorf("tenancy: smtp encryption must be %s, %s or %s", SMTPStartTLS, SMTPTLS, SMTPNone)
}

func (c SMTPCredentials) Sender() string {
	if c.EnvelopeFrom != "" {
		return c.EnvelopeFrom
	}
	return c.FromAddress
}
