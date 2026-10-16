package authorization

import (
	"sort"
	"strings"
)

var rowFields = map[string]bool{
	"section":     true,
	"grade_level": true,
	"subject":     true,
}

func RowField(name string) bool { return rowFields[name] }

func RowFields() []string {
	out := make([]string, 0, len(rowFields))
	for name := range rowFields {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

func ConstraintOperators() []string {
	out := make([]string, 0, len(constrainedOperators))
	for op := range constrainedOperators {
		out = append(out, op)
	}
	sort.Strings(out)
	return out
}

type Constraint struct {
	Field  string
	Values []string
}

var constrainedOperators = map[string]bool{
	"=":  true,
	"IN": true,
}

func (a Alternative) Constraints() ([]Constraint, bool) {
	var out []Constraint
	if !collect(a.Expression, true, &out) {
		return nil, false
	}
	return out, true
}

func collect(n *Node, conjunctive bool, out *[]Constraint) bool {
	if n == nil {
		return true
	}

	if len(n.Children) > 0 || n.Field == "" {
		switch strings.ToUpper(n.Op) {
		case "AND":
			for i := range n.Children {
				if !collect(&n.Children[i], conjunctive, out) {
					return false
				}
			}
			return true
		case "OR":
			if c, ok := collapseOr(n); ok {
				if !conjunctive {
					return false
				}
				*out = append(*out, c)
				return true
			}
			for i := range n.Children {
				if mentionsRowField(&n.Children[i]) {
					return false
				}
			}
			return true
		default:
			return !mentionsRowField(n)
		}
	}

	if !rowFields[n.Field] {
		return true
	}
	if !conjunctive || !constrainedOperators[strings.ToUpper(n.Operator)] {
		return false
	}
	*out = append(*out, Constraint{Field: n.Field, Values: literals(n.Values)})
	return true
}

func collapseOr(n *Node) (Constraint, bool) {
	var field string
	var values []string

	for i := range n.Children {
		child := &n.Children[i]
		if len(child.Children) > 0 || child.Field == "" || !rowFields[child.Field] {
			return Constraint{}, false
		}
		if !constrainedOperators[strings.ToUpper(child.Operator)] {
			return Constraint{}, false
		}
		if field == "" {
			field = child.Field
		} else if child.Field != field {
			return Constraint{}, false
		}
		values = append(values, literals(child.Values)...)
	}
	if field == "" {
		return Constraint{}, false
	}
	return Constraint{Field: field, Values: values}, true
}

func mentionsRowField(n *Node) bool {
	if n == nil {
		return false
	}
	if n.Field != "" && rowFields[n.Field] {
		return true
	}
	for i := range n.Children {
		if mentionsRowField(&n.Children[i]) {
			return true
		}
	}
	return false
}

func literals(values []any) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		if s := strings.TrimSpace(str(v)); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func (c Constraint) Satisfied() bool { return len(c.Values) > 0 }

func rulesOf(alts []Alternative) string {
	names := make([]string, 0, len(alts))
	for _, a := range alts {
		if a.Rule != "" {
			names = append(names, a.Rule)
		}
	}
	if len(names) == 0 {
		return "unnamed"
	}
	return strings.Join(names, " OR ")
}

func anyUnpinned(groups [][]Constraint) bool {
	for _, g := range groups {
		if len(g) == 0 {
			return true
		}
	}
	return false
}

func mergeFields(alts []Alternative) *FieldPolicy {
	if len(alts) == 0 {
		return nil
	}
	merged := alts[0].Fields
	for _, alt := range alts[1:] {
		merged = intersectFields(merged, alt.Fields)
	}
	return merged
}

func intersectFields(a, b *FieldPolicy) *FieldPolicy {
	if a.Unrestricted() {
		return b
	}
	if b.Unrestricted() {
		return a
	}

	if len(a.Keys) == 0 || len(b.Keys) == 0 {
		return &FieldPolicy{Mode: FieldModeInclude}
	}

	switch {
	case a.Mode == FieldModeAllExcept && b.Mode == FieldModeAllExcept:
		return &FieldPolicy{Mode: FieldModeAllExcept, Keys: union(a.Keys, b.Keys)}
	case a.Mode == FieldModeInclude && b.Mode == FieldModeInclude:
		return &FieldPolicy{Mode: FieldModeInclude, Keys: both(a.Keys, b.Keys)}
	case a.Mode == FieldModeInclude:
		return &FieldPolicy{Mode: FieldModeInclude, Keys: without(a.Keys, b.Keys)}
	case b.Mode == FieldModeInclude:
		return &FieldPolicy{Mode: FieldModeInclude, Keys: without(b.Keys, a.Keys)}
	default:
		return &FieldPolicy{Mode: FieldModeInclude}
	}
}

func union(a, b []string) []string {
	out := append([]string{}, a...)
	for _, k := range b {
		if !contains(out, k) {
			out = append(out, k)
		}
	}
	return out
}

func both(a, b []string) []string {
	var out []string
	for _, k := range a {
		if contains(b, k) {
			out = append(out, k)
		}
	}
	return out
}

func without(keys, excluded []string) []string {
	var out []string
	for _, k := range keys {
		if !contains(excluded, k) {
			out = append(out, k)
		}
	}
	return out
}

type RowValues map[string]string

func (g Grant) Covers(values RowValues) bool {
	for _, c := range g.Constraints {
		got, ok := values[c.Field]
		if !ok || !containsString(c.Values, got) {
			return false
		}
	}
	return true
}

func (d Decision) FieldsForRow(values RowValues) (*FieldPolicy, bool) {
	if len(d.Grants) == 0 {
		return d.Fields, true
	}

	var merged *FieldPolicy
	found := false
	for _, g := range d.Grants {
		if !g.Covers(values) {
			continue
		}
		if !found {
			merged, found = g.Fields, true
			continue
		}
		merged = unionFields(merged, g.Fields)
	}
	return merged, found
}

func (d Decision) PerRow() bool {
	if len(d.Grants) < 2 {
		return false
	}
	pinned := false
	for _, g := range d.Grants {
		if g.Pinned() {
			pinned = true
		}
	}
	if !pinned {
		return false
	}
	for _, g := range d.Grants[1:] {
		if !sameFields(g.Fields, d.Grants[0].Fields) {
			return true
		}
	}
	return false
}

func sameFields(a, b *FieldPolicy) bool {
	if a.Unrestricted() != b.Unrestricted() {
		return false
	}
	if a.Unrestricted() {
		return true
	}
	if a.Mode != b.Mode || len(a.Keys) != len(b.Keys) {
		return false
	}
	for _, k := range a.Keys {
		if !contains(b.Keys, k) {
			return false
		}
	}
	return true
}

func unionFields(a, b *FieldPolicy) *FieldPolicy {
	if a.Unrestricted() || b.Unrestricted() {
		return nil
	}
	if len(a.Keys) == 0 {
		return b
	}
	if len(b.Keys) == 0 {
		return a
	}

	switch {
	case a.Mode == FieldModeInclude && b.Mode == FieldModeInclude:
		return &FieldPolicy{Mode: FieldModeInclude, Keys: union(a.Keys, b.Keys)}
	case a.Mode == FieldModeAllExcept && b.Mode == FieldModeAllExcept:
		return &FieldPolicy{Mode: FieldModeAllExcept, Keys: both(a.Keys, b.Keys)}
	case a.Mode == FieldModeAllExcept:
		return &FieldPolicy{Mode: FieldModeAllExcept, Keys: without(a.Keys, b.Keys)}
	case b.Mode == FieldModeAllExcept:
		return &FieldPolicy{Mode: FieldModeAllExcept, Keys: without(b.Keys, a.Keys)}
	default:
		return &FieldPolicy{Mode: FieldModeInclude}
	}
}

func containsString(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}
