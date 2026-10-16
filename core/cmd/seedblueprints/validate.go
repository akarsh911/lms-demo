package main

import (
	"errors"
	"fmt"
	"math"
	"unicode/utf8"

	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entconstraint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprintconstraint"
	entquestion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/question"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
)

const (
	marksEpsilon   = 0.001
	codeMaxLen     = 64
	nameMaxRunes   = 200
	sectionCodeMax = 32
)

func near(a, b float64) bool { return math.Abs(a-b) < marksEpsilon }

func validate(plans []blueprintPlan) error {
	if len(plans) == 0 {
		return errors.New("there is nothing to seed")
	}

	seen := map[string]bool{}
	for _, plan := range plans {
		key := fmt.Sprintf("%s v%d", plan.code, plan.version)
		if seen[key] {
			return fmt.Errorf("%s appears twice, and (code, version) is unique", key)
		}
		seen[key] = true

		if err := validatePlan(plan); err != nil {
			return fmt.Errorf("%s: %w", key, err)
		}
	}
	return nil
}

func validatePlan(plan blueprintPlan) error {
	switch {
	case plan.code == "":
		return errors.New("code is empty")
	case len(plan.code) > codeMaxLen:
		return fmt.Errorf("code is %d bytes, over the %d the column allows",
			len(plan.code), codeMaxLen)
	case plan.version < 1:
		return fmt.Errorf("version %d is not positive", plan.version)
	case plan.name == "":
		return errors.New("name is empty")
	case utf8.RuneCountInString(plan.name) > nameMaxRunes:
		return fmt.Errorf("name is %d runes, over the %d the column allows",
			utf8.RuneCountInString(plan.name), nameMaxRunes)
	case plan.subject == "":
		return errors.New("no subject code")
	case plan.grade == "":
		return errors.New("no grade level code")
	case plan.total <= 0:
		return fmt.Errorf("total_marks %g is not positive", plan.total)
	case plan.duration <= 0:
		return fmt.Errorf("duration_minutes %d is not positive", plan.duration)
	case len(plan.sections) == 0:
		return errors.New("no sections; a blueprint that divides a paper into nothing " +
			"cannot say what the paper looks like")
	}
	if err := entblueprint.StatusValidator(plan.status); err != nil {
		return err
	}
	if err := validateScheme(plan.cognitive); err != nil {
		return err
	}
	if err := validateUnits(plan.units, plan.total); err != nil {
		return err
	}
	return validateSections(plan)
}

func validateScheme(scheme schema.CognitiveScheme) error {
	if scheme.Name == "" {
		return errors.New("cognitive_scheme has no name, so nobody can say whose band 1 it means")
	}
	if len(scheme.Bands) == 0 {
		return errors.New("cognitive_scheme has no bands, so it constrains nothing")
	}

	seen := map[string]bool{}
	weighted, weight := 0, 0.0
	for _, b := range scheme.Bands {
		if b.Key == "" {
			return fmt.Errorf("a band of %q has no key", scheme.Name)
		}
		if seen[b.Key] {
			return fmt.Errorf("band %q of %q appears twice", b.Key, scheme.Name)
		}
		seen[b.Key] = true

		for name, value := range map[string]*float64{
			"weight_percent": b.WeightPercent,
			"min_percent":    b.MinPercent,
			"max_percent":    b.MaxPercent,
		} {
			if value != nil && (*value < 0 || *value > 100) {
				return fmt.Errorf("band %q has a %s of %g, outside 0 to 100", b.Key, name, *value)
			}
		}
		if b.MinPercent != nil && b.MaxPercent != nil && *b.MaxPercent < *b.MinPercent {
			return fmt.Errorf("band %q has a max_percent below its min_percent", b.Key)
		}
		if b.WeightPercent != nil {
			if b.MinPercent != nil && *b.WeightPercent < *b.MinPercent {
				return fmt.Errorf("band %q weighs less than its own min_percent", b.Key)
			}
			if b.MaxPercent != nil && *b.WeightPercent > *b.MaxPercent {
				return fmt.Errorf("band %q weighs more than its own max_percent", b.Key)
			}
			weighted++
			weight += *b.WeightPercent
		}
	}

	if weighted == len(scheme.Bands) && !near(weight, 100) {
		return fmt.Errorf("every band of %q carries a weight_percent and they come to %g, not 100",
			scheme.Name, weight)
	}
	return nil
}

func validateUnits(units *schema.UnitWeightage, total float64) error {
	if units == nil {
		return nil
	}
	if len(units.Units) == 0 {
		return errors.New("unit_weightage lists no units; leave it null to mean " +
			"\"every chapter, no per-unit target\"")
	}

	seen := map[string]bool{}
	weighted, weight := 0, 0.0
	marked, marks := 0, 0.0
	for _, u := range units.Units {
		if u.Key == "" {
			return errors.New("a unit of unit_weightage has no key")
		}
		if seen[u.Key] {
			return fmt.Errorf("unit %q appears twice in unit_weightage", u.Key)
		}
		seen[u.Key] = true

		if u.WeightPercent != nil {
			if *u.WeightPercent < 0 || *u.WeightPercent > 100 {
				return fmt.Errorf("unit %q has a weight_percent of %g, outside 0 to 100",
					u.Key, *u.WeightPercent)
			}
			weighted++
			weight += *u.WeightPercent
		}
		if u.Marks != nil {
			if *u.Marks < 0 {
				return fmt.Errorf("unit %q has %g marks", u.Key, *u.Marks)
			}
			marked++
			marks += *u.Marks
		}
	}

	if weighted == len(units.Units) && !near(weight, 100) {
		return fmt.Errorf("every unit carries a weight_percent and they come to %g, not 100", weight)
	}
	if marked == len(units.Units) && !near(marks, total) {
		return fmt.Errorf("the units carry %g marks between them, and the paper is out of %g",
			marks, total)
	}
	return nil
}

func validateSections(plan blueprintPlan) error {
	codes := map[string]bool{}
	marks, timed, duration := 0.0, 0, 0

	for at, section := range plan.sections {
		position := at + 1
		switch {
		case section.code == "":
			return fmt.Errorf("section %d has no section_code", position)
		case len(section.code) > sectionCodeMax:
			return fmt.Errorf("section_code %q is %d bytes, over the %d the column allows",
				section.code, len(section.code), sectionCodeMax)
		case section.name == "":
			return fmt.Errorf("section %q has no name", section.code)
		case utf8.RuneCountInString(section.name) > nameMaxRunes:
			return fmt.Errorf("section %q has a name of %d runes, over the %d the column allows",
				section.code, utf8.RuneCountInString(section.name), nameMaxRunes)
		case codes[section.code]:
			return fmt.Errorf("section_code %q appears twice, and it is unique per blueprint",
				section.code)
		case section.questions <= 0:
			return fmt.Errorf("section %q asks %d questions", section.code, section.questions)
		case section.total <= 0:
			return fmt.Errorf("section %q is worth %g marks", section.code, section.total)
		}
		codes[section.code] = true

		if section.perQuestion != nil {
			if *section.perQuestion <= 0 {
				return fmt.Errorf("section %q pays %g a question", section.code, *section.perQuestion)
			}
			if want := float64(section.questions) * *section.perQuestion; !near(want, section.total) {
				return fmt.Errorf("section %q is %d questions of %g, which is %g, but claims %g",
					section.code, section.questions, *section.perQuestion, want, section.total)
			}
		}
		marks += section.total

		if section.duration != nil {
			if *section.duration <= 0 {
				return fmt.Errorf("section %q runs for %d minutes", section.code, *section.duration)
			}
			timed++
			duration += *section.duration
		}

		if err := validateConstraints(plan, section); err != nil {
			return fmt.Errorf("section %q: %w", section.code, err)
		}
	}

	if !near(marks, plan.total) {
		return fmt.Errorf("the sections are worth %g between them, and the paper claims %g",
			marks, plan.total)
	}
	if timed == len(plan.sections) && duration != plan.duration {
		return fmt.Errorf("every section is timed and they come to %d minutes, "+
			"and the paper claims %d", duration, plan.duration)
	}
	if timed != 0 && timed != len(plan.sections) {
		return fmt.Errorf("%d of %d sections are timed; either the paper is timed section by "+
			"section or it is one sitting", timed, len(plan.sections))
	}
	return nil
}

func validateConstraints(plan blueprintPlan, section sectionPlan) error {
	bands := map[string]bool{}
	for _, b := range plan.cognitive.Bands {
		bands[b.Key] = true
	}
	units := map[string]bool{}
	if plan.units != nil {
		for _, u := range plan.units.Units {
			units[u.Key] = true
		}
	}

	seen := map[string]bool{}
	for _, c := range section.constraints {
		if c.key == "" {
			return errors.New("a constraint has no key, so a second run cannot tell it " +
				"from another of its type")
		}
		if seen[c.key] {
			return fmt.Errorf("constraint key %q appears twice", c.key)
		}
		seen[c.key] = true

		if err := entconstraint.ConstraintTypeValidator(c.kind); err != nil {
			return fmt.Errorf("constraint %q: %w", c.key, err)
		}
		if err := validateConstraintSubject(c, bands, units, plan.units != nil); err != nil {
			return fmt.Errorf("constraint %q: %w", c.key, err)
		}
		if err := validateConstraintRange(c, section); err != nil {
			return fmt.Errorf("constraint %q: %w", c.key, err)
		}
	}
	return nil
}

func validateConstraintSubject(c constraintPlan, bands, units map[string]bool, scoped bool) error {
	switch c.kind {
	case entconstraint.ConstraintTypeDifficulty:
		if c.level == "" {
			return errors.New("a difficulty constraint names no level")
		}
		return entquestion.DifficultyLabelValidator(entquestion.DifficultyLabel(c.level))
	case entconstraint.ConstraintTypeType:
		if c.qtype == "" {
			return errors.New("a type constraint names no question type")
		}
		return entquestion.QuestionTypeValidator(entquestion.QuestionType(c.qtype))
	case entconstraint.ConstraintTypeBloom:
		if c.band == "" {
			return errors.New("a bloom constraint names no band")
		}
		if !bands[c.band] {
			return fmt.Errorf("band %q is not a band of this paper's own cognitive scheme", c.band)
		}
	case entconstraint.ConstraintTypeTopic:
		if c.topic == "" {
			return errors.New("a topic constraint names no unit")
		}
		if scoped && !units[c.topic] {
			return fmt.Errorf("unit %q is not a unit of this paper's own unit_weightage", c.topic)
		}
	case entconstraint.ConstraintTypeOutcome:
		if c.topic == "" {
			return errors.New("an outcome constraint names no outcome")
		}
	}
	return nil
}

func validateConstraintRange(c constraintPlan, section sectionPlan) error {
	switch c.unit {
	case unitPercent, unitMarks, unitQuestions:
	default:
		return fmt.Errorf("unit %q is not one of %s, %s, %s; without one a min of 20 could "+
			"mean twenty marks, twenty questions or a fifth of the section",
			c.unit, unitPercent, unitMarks, unitQuestions)
	}
	if c.min == nil && c.max == nil {
		return errors.New("neither a min_value nor a max_value, so it constrains nothing")
	}
	if c.min != nil && *c.min < 0 {
		return fmt.Errorf("min_value %g is negative", *c.min)
	}
	if c.min != nil && c.max != nil && *c.max < *c.min {
		return fmt.Errorf("max_value %g is below min_value %g", *c.max, *c.min)
	}

	ceiling, what := 0.0, ""
	switch c.unit {
	case unitPercent:
		ceiling, what = 100, "a percentage"
	case unitMarks:
		ceiling, what = section.total, "the marks the section carries"
	case unitQuestions:
		ceiling, what = float64(section.questions), "the questions the section asks"
	}
	for name, value := range map[string]*float64{"min_value": c.min, "max_value": c.max} {
		if value != nil && *value > ceiling+marksEpsilon {
			return fmt.Errorf("%s is %g, over the %g that is %s", name, *value, ceiling, what)
		}
	}
	return nil
}
