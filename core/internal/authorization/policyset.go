package authorization

import (
	"encoding/json"
	"time"
)

type PolicySet struct {
	Entities    []EntityPolicy `json:"entities"`
	PolicyEpoch int64          `json:"policy_epoch"`
	IssuedAt    time.Time      `json:"issued_at"`

	index map[Entity][]Alternative
}

type EntityPolicy struct {
	Entity       Entity        `json:"entity"`
	Service      string        `json:"service"`
	Alternatives []Alternative `json:"alternatives"`
}

func ParsePolicySet(body []byte) (*PolicySet, error) {
	var set PolicySet
	if err := json.Unmarshal(body, &set); err != nil {
		return nil, err
	}
	set.build()
	return &set, nil
}

func (p *PolicySet) build() {
	p.index = make(map[Entity][]Alternative, len(p.Entities))
	for _, e := range p.Entities {
		p.index[e.Entity] = e.Alternatives
	}
}

func (p *PolicySet) Holds(entity Entity) bool {
	if p == nil {
		return false
	}
	if p.index == nil {
		p.build()
	}
	_, ok := p.index[entity]
	return ok
}

func (p *PolicySet) Allows(entity Entity, attrs Attributes) (Decision, bool) {
	if p == nil {
		return Decision{Reason: "no policy set"}, false
	}
	if p.index == nil {
		p.build()
	}

	alternatives, ok := p.index[entity]
	if !ok {
		return Decision{Reason: "entity not granted: " + string(entity)}, false
	}
	if len(alternatives) == 0 {
		return Decision{Allowed: true, Rule: "unconditional"}, true
	}
	missing := false
	untranslatable := false
	var admitted []Alternative
	var groups [][]Constraint
	var grants []Grant

	for _, alt := range alternatives {
		constraints, translatable := alt.Constraints()
		if !translatable {
			untranslatable = true
			continue
		}
		if !alt.Expression.Satisfiable(attrs) {
			missing = true
			continue
		}
		if !alt.Expression.Eval(attrs) {
			continue
		}
		admitted = append(admitted, alt)
		groups = append(groups, constraints)
		grants = append(grants, Grant{Rule: alt.Rule, Constraints: constraints, Fields: alt.Fields})
	}

	if len(admitted) > 0 {
		d := Decision{Allowed: true, Rule: rulesOf(admitted)}
		if !anyUnpinned(groups) {
			d.Constraints = groups
		}
		d.Fields = mergeFields(admitted)
		d.Grants = grants
		if reach, declared := admitted[0].Reach(); declared {
			d.Reach, d.HasReach = reach, true
		}
		return d, true
	}

	if missing {
		return Decision{Reason: "conditional grant needs attributes that were not supplied: " + string(entity)}, false
	}
	if untranslatable {
		return Decision{Reason: "grant uses a row condition this service cannot turn into a query: " + string(entity)}, false
	}
	return Decision{Reason: "no alternative matched for " + string(entity)}, false
}
