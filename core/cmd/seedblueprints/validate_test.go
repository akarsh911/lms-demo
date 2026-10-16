package main

import (
	"strings"
	"testing"

	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entconstraint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprintconstraint"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
)

func TestTheSampleSetAddsUp(t *testing.T) {
	if err := validate(blueprintPlans); err != nil {
		t.Fatalf("the samples this command writes are what a reader learns the shape of a "+
			"paper from, so their own arithmetic has to hold: %v", err)
	}
}

func TestTheSampleSetShowsEveryDistinctionTheSchemaMakes(t *testing.T) {
	var reusable, scoped, nullWeightage, setWeightage, nullPerQuestion, timedSections bool
	versions := map[string]map[int]bool{}
	statuses := map[entblueprint.Status]bool{}
	kinds := map[entconstraint.ConstraintType]bool{}

	for _, plan := range blueprintPlans {
		if plan.reusable {
			reusable = true
		} else {
			scoped = true
		}
		if plan.units == nil {
			nullWeightage = true
		} else {
			setWeightage = true
		}
		statuses[plan.status] = true
		if versions[plan.code] == nil {
			versions[plan.code] = map[int]bool{}
		}
		versions[plan.code][plan.version] = true

		for _, section := range plan.sections {
			if section.perQuestion == nil {
				nullPerQuestion = true
			}
			if section.duration != nil {
				timedSections = true
			}
			for _, c := range section.constraints {
				kinds[c.kind] = true
			}
		}
	}

	for what, held := range map[string]bool{
		"a reusable template, with no academic session": reusable,
		"a blueprint bound to one academic session":     scoped,
		"a null unit_weightage":                         nullWeightage,
		"a populated unit_weightage":                    setWeightage,
		"a section with no marks_per_question":          nullPerQuestion,
		"a section timed separately from its paper":     timedSections,
		"a draft":               statuses[entblueprint.StatusDraft],
		"a published blueprint": statuses[entblueprint.StatusPublished],
		"an archived blueprint": statuses[entblueprint.StatusArchived],
	} {
		if !held {
			t.Errorf("the sample set no longer contains %s, so nothing in the UI shows "+
				"that the schema allows it", what)
		}
	}

	for _, kind := range []entconstraint.ConstraintType{
		entconstraint.ConstraintTypeDifficulty, entconstraint.ConstraintTypeBloom,
		entconstraint.ConstraintTypeTopic, entconstraint.ConstraintTypeOutcome,
		entconstraint.ConstraintTypeType,
	} {
		if !kinds[kind] {
			t.Errorf("no sample constrains by %s, and it is one of the five types the "+
				"column allows", kind)
		}
	}

	versioned := false
	for _, seen := range versions {
		if len(seen) > 1 {
			versioned = true
		}
	}
	if !versioned {
		t.Error("every sample code has exactly one version, so nothing shows what version is for")
	}
}

func TestALanguagePaperIsNotBandedLikeAScienceOne(t *testing.T) {
	schemes := map[string]map[string]bool{}
	for _, plan := range blueprintPlans {
		if schemes[plan.cognitive.Name] == nil {
			schemes[plan.cognitive.Name] = map[string]bool{}
		}
		for _, b := range plan.cognitive.Bands {
			schemes[plan.cognitive.Name][b.Key] = true
		}
	}

	language := 0
	for name, bands := range schemes {
		if bands["reading"] && bands["writing"] && bands["grammar"] && bands["literature"] {
			language++
			for _, rung := range []string{"remembering", "understanding", "application", "apply"} {
				if bands[rung] {
					t.Errorf("%q bands a language paper by %q as well, which is the mixture "+
						"the named scheme exists to avoid", name, rung)
				}
			}
		}
	}
	if language == 0 {
		t.Fatal("no sample bands a paper by reading, writing, grammar and literature; a " +
			"language paper banded by remember and apply is the thing cognitive_scheme " +
			"being a named N-band scheme is for, so the set has to show one")
	}
}

func base() blueprintPlan {
	return blueprintPlan{
		code: "BP-TEST", version: 1, name: "Test Paper",
		subject: "MATH", grade: "G6",
		total: 20, duration: 40,
		status: entblueprint.StatusPublished,
		cognitive: schema.CognitiveScheme{
			Name:  "Test Bands",
			Bands: []schema.CognitiveBand{band("recall", "Recall", 60), band("apply", "Apply", 40)},
		},
		units: &schema.UnitWeightage{Units: []schema.UnitWeight{
			unitMarksOf("U1", "One", 12),
			unitMarksOf("U2", "Two", 8),
		}},
		sections: []sectionPlan{
			{
				code: "A", name: "Short", questions: 4, perQuestion: num(2), total: 8,
				duration: mins(15),
				constraints: []constraintPlan{{
					key: "easy-share", kind: entconstraint.ConstraintTypeDifficulty,
					level: "easy", unit: unitPercent, min: num(40), max: num(60),
				}},
			},
			{
				code: "B", name: "Long", questions: 4, perQuestion: num(3), total: 12,
				duration: mins(25),
			},
		},
	}
}

func TestTheBaseOfTheMutationsIsItselfValid(t *testing.T) {
	if err := validate([]blueprintPlan{base()}); err != nil {
		t.Fatalf("every case below starts from this plan and breaks one thing; if the plan is "+
			"already broken they all pass for the wrong reason: %v", err)
	}
}

func TestValidateRefusesASampleWhoseNumbersDisagree(t *testing.T) {
	cases := []struct {
		name   string
		breaks func(*blueprintPlan)
		says   string
	}{
		{"the sections do not come to the paper's total", func(p *blueprintPlan) {
			p.sections[1].total = 11
			p.sections[1].perQuestion = nil
		}, "and the paper claims"},
		{"a section is not its question count times its marks a question", func(p *blueprintPlan) {
			p.sections[0].perQuestion = num(3)
		}, "but claims"},
		{"the paper's total is changed and the sections are not", func(p *blueprintPlan) {
			p.total = 25
			p.units = nil
		}, "the sections are worth 20 between them, and the paper claims 25"},
		{"a section carries no marks", func(p *blueprintPlan) {
			p.sections[0].total = 0
		}, "is worth 0 marks"},
		{"a section asks no questions", func(p *blueprintPlan) {
			p.sections[0].questions = 0
		}, "asks 0 questions"},
		{"two sections share a code", func(p *blueprintPlan) {
			p.sections[1].code = "A"
		}, "appears twice"},
		{"only one of two sections is timed", func(p *blueprintPlan) {
			p.sections[1].duration = nil
		}, "either the paper is timed section by section"},
		{"the timed sections do not come to the paper's duration", func(p *blueprintPlan) {
			p.sections[1].duration = mins(5)
		}, "and the paper claims 40"},
		{"the paper has no sections", func(p *blueprintPlan) {
			p.sections = nil
		}, "no sections"},
		{"total_marks is not positive", func(p *blueprintPlan) {
			p.total = 0
		}, "is not positive"},
		{"duration_minutes is not positive", func(p *blueprintPlan) {
			p.duration = 0
		}, "is not positive"},
		{"the cognitive weights do not come to 100", func(p *blueprintPlan) {
			p.cognitive.Bands[0].WeightPercent = num(50)
		}, "not 100"},
		{"a cognitive band has no key", func(p *blueprintPlan) {
			p.cognitive.Bands[0].Key = ""
		}, "no key"},
		{"two cognitive bands share a key", func(p *blueprintPlan) {
			p.cognitive.Bands[1].Key = "recall"
		}, "appears twice"},
		{"a band weighs more than its own ceiling", func(p *blueprintPlan) {
			p.cognitive.Bands[0].MaxPercent = num(50)
		}, "weighs more than its own max_percent"},
		{"the cognitive scheme has no name", func(p *blueprintPlan) {
			p.cognitive.Name = ""
		}, "no name"},
		{"the units in marks do not come to the paper's total", func(p *blueprintPlan) {
			p.units.Units[0].Marks = num(20)
		}, "and the paper is out of"},
		{"the unit weightage lists no units", func(p *blueprintPlan) {
			p.units = &schema.UnitWeightage{}
		}, "lists no units"},
		{"two units share a key", func(p *blueprintPlan) {
			p.units.Units[1].Key = "U1"
		}, "appears twice"},
		{"a constraint names a difficulty the bank has no label for", func(p *blueprintPlan) {
			p.sections[0].constraints[0].level = "tricky"
		}, "difficulty_label"},
		{"a constraint names a question type the bank has no enum for", func(p *blueprintPlan) {
			p.sections[0].constraints[0].kind = entconstraint.ConstraintTypeType
			p.sections[0].constraints[0].qtype = "essay"
		}, "question_type"},
		{"a bloom constraint names a band the paper's own scheme has not got", func(p *blueprintPlan) {
			p.sections[0].constraints[0].kind = entconstraint.ConstraintTypeBloom
			p.sections[0].constraints[0].band = "analyse"
		}, "not a band of this paper's own cognitive scheme"},
		{"a topic constraint names a unit the paper's own weightage has not got",
			func(p *blueprintPlan) {
				p.sections[0].constraints[0].kind = entconstraint.ConstraintTypeTopic
				p.sections[0].constraints[0].topic = "U9"
			}, "not a unit of this paper's own unit_weightage"},
		{"a percentage constraint reaches past 100", func(p *blueprintPlan) {
			p.sections[0].constraints[0].max = num(140)
		}, "over the 100"},
		{"a constraint in marks reaches past the section's marks", func(p *blueprintPlan) {
			p.sections[0].constraints[0].unit = unitMarks
			p.sections[0].constraints[0].min = num(1)
			p.sections[0].constraints[0].max = num(9)
		}, "over the 8"},
		{"a constraint in questions reaches past the section's questions",
			func(p *blueprintPlan) {
				p.sections[0].constraints[0].unit = unitQuestions
				p.sections[0].constraints[0].min = num(1)
				p.sections[0].constraints[0].max = num(5)
			}, "over the 4"},
		{"a constraint's max is below its min", func(p *blueprintPlan) {
			p.sections[0].constraints[0].max = num(10)
		}, "below min_value"},
		{"a constraint says neither min nor max", func(p *blueprintPlan) {
			p.sections[0].constraints[0].min = nil
			p.sections[0].constraints[0].max = nil
		}, "constrains nothing"},
		{"a constraint carries no unit of measure", func(p *blueprintPlan) {
			p.sections[0].constraints[0].unit = ""
		}, "is not one of percent"},
		{"a constraint carries no key", func(p *blueprintPlan) {
			p.sections[0].constraints[0].key = ""
		}, "no key"},
		{"two constraints on one section share a key", func(p *blueprintPlan) {
			p.sections[0].constraints = append(p.sections[0].constraints,
				p.sections[0].constraints[0])
		}, "appears twice"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			plan := base()
			tc.breaks(&plan)

			err := validate([]blueprintPlan{plan})
			if err == nil {
				t.Fatalf("validate accepted a sample where %s, so it would have been written "+
					"and read as correct", tc.name)
			}
			if !strings.Contains(err.Error(), tc.says) {
				t.Fatalf("the refusal has to name what is wrong; wanted %q somewhere in %q",
					tc.says, err.Error())
			}
		})
	}
}

func TestValidateRefusesTwoPlansWithTheSameCodeAndVersion(t *testing.T) {
	err := validate([]blueprintPlan{base(), base()})
	if err == nil {
		t.Fatal("(code, version) is UNIQUE in the database, so a set holding the pair twice " +
			"would die halfway through writing and leave a partial sample behind")
	}
	if !strings.Contains(err.Error(), "unique") {
		t.Fatalf("wanted the refusal to say the pair is unique, got %q", err.Error())
	}
}

func TestTwoVersionsOfOneCodeAreFine(t *testing.T) {
	second := base()
	second.version = 2
	if err := validate([]blueprintPlan{base(), second}); err != nil {
		t.Fatalf("a second version of a blueprint is how a pattern is revised: %v", err)
	}
}

func TestANullUnitWeightageIsAccepted(t *testing.T) {
	plan := base()
	plan.units = nil
	plan.sections[0].constraints[0].kind = entconstraint.ConstraintTypeTopic
	plan.sections[0].constraints[0].topic = "U1"

	if err := validate([]blueprintPlan{plan}); err != nil {
		t.Fatalf("null unit_weightage means \"every chapter, no per-unit target\", and a "+
			"template with no weightage may still name a topic: %v", err)
	}
}
