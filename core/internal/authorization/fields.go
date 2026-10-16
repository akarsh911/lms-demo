package authorization

import "strings"

type FieldMode string

const (
	FieldModeAll       FieldMode = "all"
	FieldModeInclude   FieldMode = "include"
	FieldModeAllExcept FieldMode = "all_except"
)

type FieldPolicy struct {
	Mode    FieldMode `json:"mode"`
	Keys    []string  `json:"keys,omitempty"`
	Profile string    `json:"profile,omitempty"`
}

func (f *FieldPolicy) Permits(field string) bool {
	if f == nil || f.Mode == "" || f.Mode == FieldModeAll {
		return true
	}

	if len(f.Keys) == 0 {
		return false
	}

	field = strings.TrimSpace(field)
	switch f.Mode {
	case FieldModeInclude:
		return contains(f.Keys, field)
	case FieldModeAllExcept:
		return !contains(f.Keys, field)
	default:
		return false
	}
}

var ServerOwnedFields = []string{"id", "created_at", "updated_at"}

func ServerOwned(field string) bool { return contains(ServerOwnedFields, field) }

func contains(keys []string, field string) bool {
	for _, k := range keys {
		if k == field {
			return true
		}
	}
	return false
}

func (p *PolicySet) AllowsField(entity Entity, field string, attrs Attributes) bool {
	for _, alt := range p.matchingAlternatives(entity, attrs) {
		if alt.Fields.Permits(field) {
			return true
		}
	}
	return false
}

func (p *PolicySet) DeniedFields(entity Entity, registered, requested []string, attrs Attributes) []string {
	var denied []string
	for _, field := range requested {
		if !contains(registered, field) || !p.AllowsField(entity, field, attrs) {
			denied = append(denied, field)
		}
	}
	return denied
}

func (p *PolicySet) PermittedFields(entity Entity, registered []string, attrs Attributes) []string {
	permitted := make([]string, 0, len(registered))
	for _, field := range registered {
		if p.AllowsField(entity, field, attrs) {
			permitted = append(permitted, field)
		}
	}
	return permitted
}

func (p *PolicySet) matchingAlternatives(entity Entity, attrs Attributes) []Alternative {
	if p == nil {
		return nil
	}
	if p.index == nil {
		p.build()
	}

	alternatives, ok := p.index[entity]
	if !ok {
		return nil
	}
	if len(alternatives) == 0 {
		return []Alternative{{Rule: "unconditional"}}
	}

	var matched []Alternative
	for _, alt := range alternatives {
		if constraints, ok := alt.Constraints(); !ok || len(constraints) > 0 {
			continue
		}
		if !alt.Expression.Satisfiable(attrs) {
			continue
		}
		if alt.Expression.Eval(attrs) {
			matched = append(matched, alt)
		}
	}
	return matched
}

func (f *FieldPolicy) Denied(registered, requested []string) []string {
	var denied []string
	for _, field := range requested {
		if !contains(registered, field) || !f.Permits(field) {
			denied = append(denied, field)
		}
	}
	return denied
}

func (f *FieldPolicy) Permitted(registered []string) []string {
	permitted := make([]string, 0, len(registered))
	for _, field := range registered {
		if f.Permits(field) {
			permitted = append(permitted, field)
		}
	}
	return permitted
}

func (f *FieldPolicy) Unrestricted() bool {
	return f == nil || f.Mode == "" || f.Mode == FieldModeAll
}
