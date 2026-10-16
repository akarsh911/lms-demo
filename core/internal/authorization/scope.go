package authorization

import "strings"

type Reach string

const (
	ReachTenant            Reach = "tenant"
	ReachSelf              Reach = "self"
	ReachGuardianWard      Reach = "guardian_ward"
	ReachTeacherAssignment Reach = "teacher_assignment"
)

const ReachField = "reach"

var AllReaches = []Reach{ReachTenant, ReachSelf, ReachGuardianWard, ReachTeacherAssignment}

func (r Reach) Valid() bool {
	for _, known := range AllReaches {
		if r == known {
			return true
		}
	}
	return false
}

func ReachValues() []string {
	out := make([]string, 0, len(AllReaches))
	for _, r := range AllReaches {
		out = append(out, string(r))
	}
	return out
}

var reservedFields = map[string]bool{
	ReachField: true,
}

func nonAttribute(name string) bool { return reservedFields[name] || rowFields[name] }

func (a Alternative) Reach() (Reach, bool) {
	found, ok := a.Expression.reservedValue(ReachField)
	if !ok {
		return "", false
	}
	return Reach(strings.TrimSpace(found)), true
}

func (n *Node) reservedValue(field string) (string, bool) {
	if n == nil {
		return "", false
	}
	if n.Field == field {
		if strings.ToUpper(n.Operator) != "=" || len(n.Values) != 1 {
			return "", false
		}
		return str(n.Values[0]), true
	}
	for i := range n.Children {
		if v, ok := n.Children[i].reservedValue(field); ok {
			return v, true
		}
	}
	return "", false
}
