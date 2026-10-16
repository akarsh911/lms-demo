package authorization

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type Attributes map[string]any

type Node struct {
	Op       string `json:"op,omitempty"`
	Children []Node `json:"children,omitempty"`
	Field    string `json:"field,omitempty"`
	Operator string `json:"operator,omitempty"`
	Values   []any  `json:"values,omitempty"`
}

type Alternative struct {
	Rule       string       `json:"rule"`
	RuleKey    string       `json:"rule_key"`
	Expression *Node        `json:"expression,omitempty"`
	Fields     *FieldPolicy `json:"fields,omitempty"`
}

var negatedOperators = map[string]bool{
	"!=":           true,
	"NOT_IN":       true,
	"NOT_CONTAINS": true,
	"NOT_EXISTS":   true,
}

func (n *Node) Eval(attrs Attributes) bool {
	if n == nil {
		return true
	}
	if op := strings.ToUpper(n.Op); op == "AND" || op == "OR" {
		if len(n.Children) == 0 {
			return true
		}
		if op == "AND" {
			for i := range n.Children {
				if !n.Children[i].Eval(attrs) {
					return false
				}
			}
			return true
		}
		for i := range n.Children {
			if n.Children[i].Eval(attrs) {
				return true
			}
		}
		return false
	}
	if n.Field == "" || nonAttribute(n.Field) {
		return true
	}
	return evalLeaf(n, attrs)
}

func evalLeaf(n *Node, attrs Attributes) bool {
	op := strings.ToUpper(n.Operator)
	value, present := attrs[n.Field]

	switch op {
	case "EXISTS":
		return present && !isEmpty(value)
	case "NOT_EXISTS":
		return !present || isEmpty(value)
	}

	if !present {
		return negatedOperators[op]
	}

	values := toSlice(value)
	if len(values) == 0 {
		return negatedOperators[op]
	}

	if negatedOperators[op] {
		for _, v := range values {
			if !matches(op, v, n.Values) {
				return false
			}
		}
		return true
	}
	for _, v := range values {
		if matches(op, v, n.Values) {
			return true
		}
	}
	return false
}

func matches(op string, value any, want []any) bool {
	switch op {
	case "=":
		return len(want) > 0 && equal(value, want[0])
	case "!=":
		return len(want) == 0 || !equal(value, want[0])
	case "IN":
		return containsAny(want, value)
	case "NOT_IN":
		return !containsAny(want, value)
	case "CONTAINS":
		return len(want) > 0 && strings.Contains(str(value), str(want[0]))
	case "NOT_CONTAINS":
		return len(want) == 0 || !strings.Contains(str(value), str(want[0]))
	case "STARTS_WITH":
		return len(want) > 0 && strings.HasPrefix(str(value), str(want[0]))
	case "ENDS_WITH":
		return len(want) > 0 && strings.HasSuffix(str(value), str(want[0]))
	case ">", ">=", "<", "<=":
		if len(want) == 0 {
			return false
		}
		cmp, ok := compare(value, want[0])
		if !ok {
			return false
		}
		switch op {
		case ">":
			return cmp > 0
		case ">=":
			return cmp >= 0
		case "<":
			return cmp < 0
		default:
			return cmp <= 0
		}
	case "BETWEEN":
		if len(want) < 2 {
			return false
		}
		lo, okLo := compare(value, want[0])
		hi, okHi := compare(value, want[1])
		return okLo && okHi && lo >= 0 && hi <= 0
	default:
		return false
	}
}

func containsAny(want []any, value any) bool {
	for _, w := range want {
		if equal(value, w) {
			return true
		}
	}
	return false
}

func equal(a, b any) bool {
	if cmp, ok := compare(a, b); ok {
		return cmp == 0
	}
	return str(a) == str(b)
}

func compare(a, b any) (int, bool) {
	af, aok := toFloat(a)
	bf, bok := toFloat(b)
	if aok && bok {
		switch {
		case af < bf:
			return -1, true
		case af > bf:
			return 1, true
		default:
			return 0, true
		}
	}
	as, bs := str(a), str(b)
	return strings.Compare(as, bs), true
}

func toFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(t, 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func str(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case fmt.Stringer:
		return t.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(t)
	}
}

func toSlice(v any) []any {
	switch t := v.(type) {
	case nil:
		return nil
	case []any:
		return t
	case []string:
		out := make([]any, len(t))
		for i := range t {
			out[i] = t[i]
		}
		return out
	default:
		return []any{v}
	}
}

func isEmpty(v any) bool {
	switch t := v.(type) {
	case nil:
		return true
	case string:
		return t == ""
	case []any:
		return len(t) == 0
	default:
		return false
	}
}

func (n *Node) Fields() []string {
	if n == nil {
		return nil
	}
	var out []string
	var walk func(*Node)
	walk = func(node *Node) {
		if node == nil {
			return
		}
		if node.Field != "" && !nonAttribute(node.Field) {
			out = append(out, node.Field)
		}
		for i := range node.Children {
			walk(&node.Children[i])
		}
	}
	walk(n)
	return out
}

func (n *Node) Satisfiable(attrs Attributes) bool {
	for _, f := range n.Fields() {
		if _, ok := attrs[f]; !ok {
			return false
		}
	}
	return true
}
