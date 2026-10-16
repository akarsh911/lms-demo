package filter

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

type Error struct {
	Param  string
	Reason string
}

func (e *Error) Error() string { return e.Param + " " + e.Reason }

type Params struct {
	values url.Values
	seen   map[string]bool
	err    error
}

func New(values url.Values) *Params {
	return &Params{values: values, seen: map[string]bool{}}
}

func (p *Params) Allow(names ...string) *Params {
	for _, name := range names {
		p.seen[name] = true
	}
	return p
}

func (p *Params) Err() error {
	if p.err != nil {
		return p.err
	}
	for name := range p.values {
		if !p.seen[name] {
			return &Error{Param: name, Reason: "is not a recognised parameter"}
		}
	}
	return nil
}

func (p *Params) fail(param, reason string) {
	if p.err == nil {
		p.err = &Error{Param: param, Reason: reason}
	}
}

func (p *Params) String(name string) string {
	p.seen[name] = true
	return strings.TrimSpace(p.values.Get(name))
}

func (p *Params) Bool(name string) bool {
	p.seen[name] = true
	return p.values.Get(name) == "true"
}

func (p *Params) UUID(name string) *uuid.UUID {
	raw := p.String(name)
	if raw == "" {
		return nil
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		p.fail(name, "must be a UUID")
		return nil
	}
	return &id
}

func (p *Params) Int(name string, fallback int) int {
	raw := p.String(name)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		p.fail(name, "must be a whole number")
		return fallback
	}
	return n
}

func (p *Params) Enum(name string, valid func(string) error) *string {
	raw := p.String(name)
	if raw == "" {
		return nil
	}
	if err := valid(raw); err != nil {
		p.fail(name, fmt.Sprintf("is not a recognised value: %v", err))
		return nil
	}
	return &raw
}

func (p *Params) Page(defaultLimit, maxLimit int) (limit, offset int) {
	limit = p.Int("limit", defaultLimit)
	offset = p.Int("offset", 0)

	if limit <= 0 || limit > maxLimit {
		limit = defaultLimit
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}
