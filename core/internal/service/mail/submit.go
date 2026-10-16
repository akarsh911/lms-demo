package mail

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	netmail "net/mail"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/outboxmessage"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
)

var (
	ErrNoRecipient   = errors.New("mail: a message needs a recipient address")
	ErrBadRecipient  = errors.New("mail: recipient must be a single email address")
	ErrNoTemplateKey = errors.New("mail: a message needs a template key")
	ErrNoBody        = errors.New("mail: a message needs a rendered body")
	ErrNoPepper      = errors.New("mail: RECIPIENT_HASH_PEPPER is empty, and an unkeyed recipient hash is reversible over a known population")
	ErrNoKeyring     = errors.New("mail: no keyring, and the payload may not be queued in the clear")
)

const (
	DefaultMaxAttempts = 5
	DefaultTTL         = 72 * time.Hour
)

type Message struct {
	SchoolID       *uuid.UUID
	TemplateKey    string
	Recipient      string
	Subject        string
	Body           string
	Variables      map[string]string
	MaxAttempts    int
	NotBefore      time.Time
	ExpiresAt      *time.Time
	IdempotencyKey string
}

type payload struct {
	Address   string            `json:"address"`
	Subject   string            `json:"subject"`
	Body      string            `json:"body"`
	Variables map[string]string `json:"variables,omitempty"`
}

type Submitter struct {
	control      *controlent.Client
	keyring      *crypto.Keyring
	pepper       []byte
	version      int
	now          func() time.Time
	beforeInsert func()
}

func NewSubmitter(control *controlent.Client, keyring *crypto.Keyring, pepper string, version int) (*Submitter, error) {
	if control == nil {
		return nil, errors.New("mail: no control plane client")
	}
	if keyring == nil {
		return nil, ErrNoKeyring
	}
	if strings.TrimSpace(pepper) == "" {
		return nil, ErrNoPepper
	}
	if version < 1 {
		version = 1
	}
	return &Submitter{
		control: control,
		keyring: keyring,
		pepper:  []byte(pepper),
		version: version,
		now:     time.Now,
	}, nil
}

func SubmitterFromConfig(control *controlent.Client, keyring *crypto.Keyring, cfg *config.Config) (*Submitter, error) {
	return NewSubmitter(control, keyring, cfg.RecipientHashPepper, cfg.RecipientHashVersion)
}

func (s *Submitter) Submit(ctx context.Context, msg Message) (*controlent.OutboxMessage, error) {
	address, err := normalise(msg.Recipient)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(msg.TemplateKey) == "" {
		return nil, ErrNoTemplateKey
	}
	if strings.TrimSpace(msg.Body) == "" {
		return nil, ErrNoBody
	}

	key := strings.TrimSpace(msg.IdempotencyKey)
	if key != "" {
		existing, err := s.control.OutboxMessage.Query().
			Where(outboxmessage.IdempotencyKeyEQ(key)).
			Only(ctx)
		switch {
		case err == nil:
			return existing, nil
		case controlent.IsNotFound(err):
		default:
			return nil, err
		}
	}

	now := s.now()
	id := uuid.New()

	blob, err := json.Marshal(payload{
		Address:   address,
		Subject:   msg.Subject,
		Body:      msg.Body,
		Variables: msg.Variables,
	})
	if err != nil {
		return nil, err
	}
	defer wipe(blob)

	nonce, ciphertext, keyVersion, err := s.keyring.Encrypt(blob, payloadAAD(id))
	if err != nil {
		return nil, err
	}

	attempts := msg.MaxAttempts
	if attempts < 1 {
		attempts = DefaultMaxAttempts
	}
	notBefore := msg.NotBefore
	if notBefore.IsZero() {
		notBefore = now
	}
	expires := msg.ExpiresAt
	if expires == nil {
		at := now.Add(DefaultTTL)
		expires = &at
	}

	create := s.control.OutboxMessage.Create().
		SetID(id).
		SetNillableSchoolID(msg.SchoolID).
		SetChannel(outboxmessage.ChannelEmail).
		SetTemplateKey(strings.TrimSpace(msg.TemplateKey)).
		SetRecipientHash(s.Hash(address)).
		SetRecipientHashVersion(s.version).
		SetRecipientRedacted(redact(address)).
		SetPayloadKeyVersion(keyVersion).
		SetPayloadNonce(nonce).
		SetPayloadCiphertext(ciphertext).
		SetStatus(outboxmessage.StatusPending).
		SetAttemptCount(0).
		SetMaxAttempts(attempts).
		SetNextAttemptAt(notBefore).
		SetNillableExpiresAt(expires)
	if key != "" {
		create = create.SetIdempotencyKey(key)
	}

	if s.beforeInsert != nil {
		s.beforeInsert()
	}

	row, err := create.Save(ctx)
	if err == nil {
		return row, nil
	}
	if key == "" || !controlent.IsConstraintError(err) {
		return nil, err
	}

	existing, lookupErr := s.control.OutboxMessage.Query().
		Where(outboxmessage.IdempotencyKeyEQ(key)).
		Only(ctx)
	if lookupErr != nil {
		return nil, err
	}
	return existing, nil
}

func (s *Submitter) Hash(address string) string {
	mac := hmac.New(sha256.New, s.pepper)
	mac.Write([]byte(address))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Submitter) HashVersion() int { return s.version }

func payloadAAD(id uuid.UUID) []byte {
	return []byte("outbox_message:" + id.String())
}

func normalise(recipient string) (string, error) {
	recipient = strings.TrimSpace(recipient)
	if recipient == "" {
		return "", ErrNoRecipient
	}
	parsed, err := netmail.ParseAddress(recipient)
	if err != nil {
		return "", fmt.Errorf("%w: %q", ErrBadRecipient, recipient)
	}
	if parsed.Name != "" {
		return "", fmt.Errorf("%w: %q carries a display name", ErrBadRecipient, recipient)
	}
	local, domain, ok := strings.Cut(parsed.Address, "@")
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrBadRecipient, recipient)
	}
	return local + "@" + strings.ToLower(domain), nil
}

func redact(address string) string {
	local, domain, ok := strings.Cut(address, "@")
	if !ok || local == "" {
		return "***"
	}
	out := local[:1] + "***@" + domain
	if len(out) > 320 {
		out = out[:320]
	}
	return out
}

func wipe(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
