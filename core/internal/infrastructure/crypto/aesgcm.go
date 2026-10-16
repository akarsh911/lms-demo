package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
)

var (
	ErrNoKeys        = errors.New("crypto: no master keys configured")
	ErrUnknownKey    = errors.New("crypto: no master key for that version")
	ErrBadKeyLength  = errors.New("crypto: master key must be 32 bytes (64 hex characters)")
	ErrDecryptFailed = errors.New("crypto: decryption failed (wrong key, or ciphertext tampered with)")
)

const NonceSize = 12

type Keyring struct {
	current int
	aeads   map[int]cipher.AEAD
}

func NewKeyring(keys map[int][]byte) (*Keyring, error) {
	if len(keys) == 0 {
		return nil, ErrNoKeys
	}

	kr := &Keyring{aeads: make(map[int]cipher.AEAD, len(keys))}
	versions := make([]int, 0, len(keys))

	for version, key := range keys {
		if len(key) != 32 {
			return nil, fmt.Errorf("%w: version %d has %d bytes", ErrBadKeyLength, version, len(key))
		}
		block, err := aes.NewCipher(key)
		if err != nil {
			return nil, fmt.Errorf("crypto: version %d: %w", version, err)
		}
		aead, err := cipher.NewGCM(block)
		if err != nil {
			return nil, fmt.Errorf("crypto: version %d: %w", version, err)
		}
		kr.aeads[version] = aead
		versions = append(versions, version)
	}

	sort.Ints(versions)
	kr.current = versions[len(versions)-1]
	return kr, nil
}

func ParseKeyring(spec string) (*Keyring, error) {
	spec = strings.TrimSpace(spec)
	if spec == "" {
		return nil, ErrNoKeys
	}

	keys := make(map[int][]byte)
	for _, part := range strings.Split(spec, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		version := 1
		hexKey := part
		if v, rest, ok := strings.Cut(part, ":"); ok {
			parsed, err := strconv.Atoi(strings.TrimSpace(v))
			if err != nil {
				return nil, fmt.Errorf("crypto: bad key version %q", v)
			}
			version, hexKey = parsed, strings.TrimSpace(rest)
		}

		key, err := hex.DecodeString(hexKey)
		if err != nil {
			return nil, fmt.Errorf("crypto: key version %d is not valid hex: %w", version, err)
		}
		keys[version] = key
	}
	return NewKeyring(keys)
}

func (k *Keyring) CurrentVersion() int { return k.current }

func (k *Keyring) Encrypt(plaintext, aad []byte) (nonce, ciphertext []byte, version int, err error) {
	aead, ok := k.aeads[k.current]
	if !ok {
		return nil, nil, 0, ErrNoKeys
	}

	nonce = make([]byte, NonceSize)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, 0, fmt.Errorf("crypto: read nonce: %w", err)
	}

	return nonce, aead.Seal(nil, nonce, plaintext, aad), k.current, nil
}

func (k *Keyring) Decrypt(version int, nonce, ciphertext, aad []byte) ([]byte, error) {
	aead, ok := k.aeads[version]
	if !ok {
		return nil, fmt.Errorf("%w: version %d", ErrUnknownKey, version)
	}
	if len(nonce) != NonceSize {
		return nil, fmt.Errorf("%w: nonce is %d bytes, want %d", ErrDecryptFailed, len(nonce), NonceSize)
	}

	plaintext, err := aead.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return nil, ErrDecryptFailed
	}
	return plaintext, nil
}
