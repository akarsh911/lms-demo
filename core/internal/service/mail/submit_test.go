package mail

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	controlent "github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/control/generated/outboxmessage"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
)

func TestSubmitBindsThePayloadToTheMessageIDAndNotToTheSchool(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "AAD")
	sub := submitter(t, f)

	first := queue(ctx, t, f, sub, Message{SchoolID: &school.ID, Body: "first"})
	second := queue(ctx, t, f, sub, Message{SchoolID: &school.ID, Body: "second"})
	platform := queue(ctx, t, f, sub, Message{Body: "platform"})

	for _, row := range []*controlent.OutboxMessage{first, second, platform} {
		if !strings.Contains(string(payloadAAD(row.ID)), row.ID.String()) {
			t.Fatalf("the aad for %s does not name the message it belongs to", row.ID)
		}
	}

	plaintext, err := f.Keyring.Decrypt(*first.PayloadKeyVersion, first.PayloadNonce, first.PayloadCiphertext,
		payloadAAD(first.ID))
	if err != nil {
		t.Fatalf("the payload would not open under its own message id: %v", err)
	}
	var decoded payload
	if err := json.Unmarshal(plaintext, &decoded); err != nil {
		t.Fatalf("the payload is not the JSON the sender expects: %v", err)
	}
	if decoded.Body != "first" || decoded.Address != "parent@example.com" {
		t.Fatalf("the payload round-tripped wrong: %+v", decoded)
	}

	if _, err := f.Keyring.Decrypt(*first.PayloadKeyVersion, first.PayloadNonce, first.PayloadCiphertext,
		payloadAAD(second.ID)); err == nil {
		t.Fatal("one message's ciphertext opened under another message's id; the aad is not distinguishing them")
	}
	if _, err := f.Keyring.Decrypt(*first.PayloadKeyVersion, first.PayloadNonce, first.PayloadCiphertext,
		school.ID[:]); err == nil {
		t.Fatal("the payload opened under the school id, which is the aad shape the credentials use")
	}
	if _, err := f.Keyring.Decrypt(*platform.PayloadKeyVersion, platform.PayloadNonce, platform.PayloadCiphertext,
		payloadAAD(first.ID)); err == nil {
		t.Fatal("platform mail shares an aad with other messages; a zero uuid fallback would do exactly this")
	}

	opened, err := (&Sender{keyring: f.Keyring}).decrypt(platform)
	if err != nil {
		t.Fatalf("the sender could not open a platform message that belongs to no school: %v", err)
	}
	if opened.decoded.Body != "platform" {
		t.Fatalf("body = %q, want the platform body", opened.decoded.Body)
	}
}

func TestSubmitDeduplicatesOnTheIdempotencyKey(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Idempotent")
	sub := submitter(t, f)

	key := "otp:" + school.ID.String() + ":1"
	first := queue(ctx, t, f, sub, Message{SchoolID: &school.ID, IdempotencyKey: key, Body: "code 111111"})
	second := queue(ctx, t, f, sub, Message{SchoolID: &school.ID, IdempotencyKey: key, Body: "code 222222"})

	if first.ID != second.ID {
		t.Fatalf("the same idempotency key produced two rows, %s and %s", first.ID, second.ID)
	}

	n, err := f.Client.OutboxMessage.Query().
		Where(outboxmessage.IdempotencyKeyEQ(key)).
		Count(ctx)
	if err != nil {
		t.Fatalf("could not count the queued rows: %v", err)
	}
	if n != 1 {
		t.Fatalf("%d rows carry the key, want 1", n)
	}

	unkeyed := queue(ctx, t, f, sub, Message{SchoolID: &school.ID})
	also := queue(ctx, t, f, sub, Message{SchoolID: &school.ID})
	if unkeyed.ID == also.ID {
		t.Fatal("two messages with no key were folded together; nulls do not collide in a unique index")
	}
}

func TestSubmitKeysTheRecipientHashWithThePepper(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	sub := submitter(t, f)

	row := queue(ctx, t, f, sub, Message{Recipient: "Parent@Example.COM"})

	bare := sha256.Sum256([]byte("parent@example.com"))
	if row.RecipientHash == hex.EncodeToString(bare[:]) {
		t.Fatal("recipient_hash is a bare sha256, which a dictionary of every address in the school reverses")
	}
	if row.RecipientHash != sub.Hash("Parent@example.com") {
		t.Fatalf("the stored hash does not match the pepper: %s", row.RecipientHash)
	}
	if row.RecipientHashVersion != 1 {
		t.Fatalf("recipient_hash_version = %d, want 1", row.RecipientHashVersion)
	}

	rotated, err := NewSubmitter(f.Client, f.Keyring, "a-different-pepper", 2)
	if err != nil {
		t.Fatalf("could not build the rotated submitter: %v", err)
	}
	if rotated.Hash("Parent@example.com") == row.RecipientHash {
		t.Fatal("rotating the pepper did not change the hash, so the version would be meaningless")
	}

	same := queue(ctx, t, f, sub, Message{Recipient: " Parent@EXAMPLE.com "})
	if same.RecipientHash != row.RecipientHash {
		t.Fatal("the same mailbox in a different domain case hashed differently, so nothing correlates")
	}
	other := queue(ctx, t, f, sub, Message{Recipient: "parent@example.com"})
	if other.RecipientHash == row.RecipientHash {
		t.Fatal("the local part was lowercased; RFC 5321 leaves its case to the receiving host")
	}
}

func TestSubmitRedactsTheRecipientButKeepsTheDomain(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	sub := submitter(t, f)

	row := queue(ctx, t, f, sub, Message{Recipient: "principal@dpsnagpur.edu.in"})

	if row.RecipientRedacted != "p***@dpsnagpur.edu.in" {
		t.Fatalf("recipient_redacted = %q, want p***@dpsnagpur.edu.in", row.RecipientRedacted)
	}
	if strings.Contains(row.RecipientRedacted, "principal") {
		t.Fatal("the local part survived redaction")
	}
}

func TestSubmitQueuesTheMessageWithoutSendingIt(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Queued")
	stub := startSMTP(t, behaviour{})
	sub := submitter(t, f)

	row := queue(ctx, t, f, sub, Message{SchoolID: &school.ID})

	if row.Status != outboxmessage.StatusPending {
		t.Fatalf("status = %s, want pending", row.Status)
	}
	if row.AttemptCount != 0 || row.SenderKind != nil || row.CompletedAt != nil {
		t.Fatalf("submit looks like it tried to deliver: %+v", row)
	}
	if row.PayloadCiphertext == nil || row.PayloadNonce == nil || row.PayloadKeyVersion == nil {
		t.Fatal("the payload was not stored, so there is nothing for the sender to deliver")
	}
	if strings.Contains(string(row.PayloadCiphertext), "parent@example.com") {
		t.Fatal("the recipient address is readable in the stored payload")
	}
	if row.MaxAttempts != DefaultMaxAttempts {
		t.Fatalf("max_attempts = %d, want the default %d", row.MaxAttempts, DefaultMaxAttempts)
	}
	if row.ExpiresAt == nil {
		t.Fatal("a message with no expiry can sit encrypted in the queue forever")
	}
	if n := len(stub.delivered()); n != 0 {
		t.Fatalf("submit delivered %d messages; enqueueing is not sending", n)
	}
}

func TestSubmitHonoursADeferredNotBefore(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	sub := submitter(t, f)

	later := time.Now().Add(time.Hour)
	row := queue(ctx, t, f, sub, Message{NotBefore: later})

	s := sender(t, f, Options{InstanceID: "deferred-sender", Profiles: stubProfiles{}})
	found, err := s.scan(ctx, time.Now())
	if err != nil {
		t.Fatalf("the scan failed: %v", err)
	}
	if containsRow(found, row.ID) {
		t.Fatal("a message scheduled for an hour from now was claimable straight away")
	}
	due, err := s.scan(ctx, later.Add(time.Minute))
	if err != nil || !containsRow(due, row.ID) {
		t.Fatalf("the deferred message never became claimable: %v", err)
	}
}

func TestSubmitRefusesToRunWithoutAPepperOrAKeyring(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	if _, err := NewSubmitter(f.Client, f.Keyring, "   ", 1); !errors.Is(err, ErrNoPepper) {
		t.Fatalf("err = %v, want ErrNoPepper: an unkeyed hash is reversible", err)
	}
	if _, err := NewSubmitter(f.Client, nil, "pepper", 1); !errors.Is(err, ErrNoKeyring) {
		t.Fatalf("err = %v, want ErrNoKeyring: the payload may not be queued in the clear", err)
	}

	keyring, err := crypto.ParseKeyring(testMasterKey)
	if err != nil {
		t.Fatalf("the test keyring is unusable: %v", err)
	}
	sub, err := NewSubmitter(f.Client, keyring, "pepper", 0)
	if err != nil {
		t.Fatalf("a zero version should fall back to 1, got %v", err)
	}
	if sub.HashVersion() != 1 {
		t.Fatalf("hash version = %d, want 1", sub.HashVersion())
	}
}

func TestSubmitRefusesAMessageItCouldNotDeliver(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	sub := submitter(t, f)

	cases := []struct {
		name string
		msg  Message
		want error
	}{
		{"no recipient", Message{TemplateKey: "k", Body: "b"}, ErrNoRecipient},
		{"not an address", Message{TemplateKey: "k", Body: "b", Recipient: "not an address"}, ErrBadRecipient},
		{"a display name", Message{TemplateKey: "k", Body: "b", Recipient: "Parent <p@example.com>"}, ErrBadRecipient},
		{"no template", Message{Body: "b", Recipient: "p@example.com"}, ErrNoTemplateKey},
		{"no body", Message{TemplateKey: "k", Recipient: "p@example.com"}, ErrNoBody},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := sub.Submit(ctx, tc.msg); !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestSubmitDeduplicatesUnderConcurrentSubmits(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Racing")
	sub := submitter(t, f)

	key := "otp:" + school.ID.String() + ":race"
	const racers = 8

	ids := make([]uuid.UUID, racers)
	errs := make([]error, racers)
	var wg sync.WaitGroup
	start := make(chan struct{})

	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(slot int) {
			defer wg.Done()
			<-start
			row, err := sub.Submit(ctx, Message{
				SchoolID:       &school.ID,
				TemplateKey:    "otp.login",
				Recipient:      "parent@example.com",
				Subject:        "Your one-time code",
				Body:           "The code is 123456.",
				IdempotencyKey: key,
			})
			if err != nil {
				errs[slot] = err
				return
			}
			ids[slot] = row.ID
		}(i)
	}
	close(start)
	wg.Wait()

	for slot, err := range errs {
		if err != nil {
			t.Fatalf("submit %d lost the idempotency race and gave up: %v; a caller that retries a "+
				"one-time code must not be told the send failed", slot, err)
		}
	}
	for slot, id := range ids {
		if id != ids[0] {
			t.Fatalf("submit %d returned %s but submit 0 returned %s; the same key produced two messages",
				slot, id, ids[0])
		}
	}
	f.discard(ctx, t, ids[0])

	n, err := f.Client.OutboxMessage.Query().Where(outboxmessage.IdempotencyKeyEQ(key)).Count(ctx)
	if err != nil {
		t.Fatalf("could not count the queued rows: %v", err)
	}
	if n != 1 {
		t.Fatalf("%d rows carry the key after %d concurrent submits, want 1", n, racers)
	}
}

func TestSubmitRecoversWhenItLosesTheIdempotencyRace(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)
	school := newSchool(ctx, t, f, "Lost The Race")
	sub := submitter(t, f)

	key := "otp:" + school.ID.String() + ":lost"
	var winner *controlent.OutboxMessage
	sub.beforeInsert = func() {
		if winner != nil {
			return
		}
		other := submitter(t, f)
		winner = queue(ctx, t, f, other, Message{SchoolID: &school.ID, IdempotencyKey: key, Body: "first"})
	}

	row, err := sub.Submit(ctx, Message{
		SchoolID:       &school.ID,
		TemplateKey:    "otp.login",
		Recipient:      "parent@example.com",
		Subject:        "Your one-time code",
		Body:           "second",
		IdempotencyKey: key,
	})
	if err != nil {
		t.Fatalf("submit gave up after losing the race: %v; a caller retrying a one-time code would "+
			"be told the send failed when the code is already queued", err)
	}
	if winner == nil {
		t.Fatal("the race was never staged, so nothing here exercised the recovery")
	}
	if row.ID != winner.ID {
		t.Fatalf("submit returned %s but the row that won is %s", row.ID, winner.ID)
	}

	n, err := f.Client.OutboxMessage.Query().Where(outboxmessage.IdempotencyKeyEQ(key)).Count(ctx)
	if err != nil {
		t.Fatalf("could not count the queued rows: %v", err)
	}
	if n != 1 {
		t.Fatalf("%d rows carry the key, want 1", n)
	}
}

func TestSubmitDeduplicatesInsideACallerTransaction(t *testing.T) {
	ctx := context.Background()
	f := control(ctx, t)

	tx, err := f.Client.Tx(ctx)
	if err != nil {
		t.Fatalf("could not begin the caller's transaction: %v", err)
	}
	defer func() {
		if err := tx.Rollback(); err != nil {
			t.Errorf("the caller's transaction was not rolled back: %v", err)
		}
	}()

	suffix := strings.ToUpper(uuid.NewString()[:8])
	school, err := tx.Client().School.Create().
		SetName("In A Transaction " + suffix).
		SetCode("MAILT-" + suffix).
		Save(ctx)
	if err != nil {
		t.Fatalf("could not create the fixture school: %v", err)
	}

	sub, err := NewSubmitter(tx.Client(), f.Keyring, "test-pepper", 1)
	if err != nil {
		t.Fatalf("could not build the submitter: %v", err)
	}

	msg := Message{
		SchoolID:       &school.ID,
		TemplateKey:    "otp.login",
		Recipient:      "parent@example.com",
		Subject:        "Your one-time code",
		Body:           "The code is 123456.",
		IdempotencyKey: "otp:" + school.ID.String() + ":tx",
	}

	first, err := sub.Submit(ctx, msg)
	if err != nil {
		t.Fatalf("the first submit failed inside a caller's transaction: %v", err)
	}
	second, err := sub.Submit(ctx, msg)
	if err != nil {
		t.Fatalf("the second submit failed inside a caller's transaction: %v; a unique violation aborts "+
			"the whole transaction, so dedupe must happen before the insert, not after it", err)
	}
	if first.ID != second.ID {
		t.Fatalf("the same key produced %s and %s inside one transaction", first.ID, second.ID)
	}
}
