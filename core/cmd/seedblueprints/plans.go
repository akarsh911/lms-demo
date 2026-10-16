package main

import (
	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entconstraint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprintconstraint"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
)

const (
	unitPercent   = "percent"
	unitMarks     = "marks"
	unitQuestions = "questions"
)

type constraintPlan struct {
	key   string
	kind  entconstraint.ConstraintType
	level string
	band  string
	topic string
	qtype string
	note  string
	min   *float64
	max   *float64
	unit  string
}

type sectionPlan struct {
	code        string
	name        string
	questions   int
	perQuestion *float64
	total       float64
	duration    *int
	constraints []constraintPlan
}

type blueprintPlan struct {
	code        string
	version     int
	name        string
	description string
	subject     string
	grade       string
	reusable    bool
	total       float64
	duration    int
	status      entblueprint.Status
	cognitive   schema.CognitiveScheme
	units       *schema.UnitWeightage
	sections    []sectionPlan
}

func num(v float64) *float64 { return &v }

func mins(v int) *int { return &v }

func band(key, label string, weight float64) schema.CognitiveBand {
	return schema.CognitiveBand{Key: key, Label: label, WeightPercent: num(weight)}
}

func bandRange(key, label string, weight, low, high float64) schema.CognitiveBand {
	return schema.CognitiveBand{
		Key: key, Label: label,
		WeightPercent: num(weight), MinPercent: num(low), MaxPercent: num(high),
	}
}

func unitMarksOf(key, label string, marks float64) schema.UnitWeight {
	return schema.UnitWeight{Key: key, Label: label, Marks: num(marks)}
}

func unitPercentOf(key, label string, weight float64) schema.UnitWeight {
	return schema.UnitWeight{Key: key, Label: label, WeightPercent: num(weight)}
}

var mathsTypology = schema.CognitiveScheme{
	Name: "CBSE Mathematics Typology",
	Bands: []schema.CognitiveBand{
		bandRange("remember_understand", "Remembering and Understanding", 55, 50, 60),
		band("apply", "Applying", 20),
		bandRange("analyse_evaluate_create", "Analysing, Evaluating and Creating", 25, 20, 30),
	},
}

var scienceCompetency = schema.CognitiveScheme{
	Name: "CBSE Science Competency Typology",
	Bands: []schema.CognitiveBand{
		band("remembering", "Remembering", 20),
		bandRange("understanding", "Understanding", 25, 20, 30),
		band("application", "Application", 25),
		bandRange("hots", "Higher Order Thinking Skills", 20, 15, 25),
		band("evaluation", "Evaluation and Multidisciplinary", 10),
	},
}

var objectiveBloom = schema.CognitiveScheme{
	Name: "Objective Quiz Bands",
	Bands: []schema.CognitiveBand{
		band("remembering", "Remembering", 40),
		band("understanding", "Understanding", 40),
		band("application", "Application", 20),
	},
}

var englishSkills = schema.CognitiveScheme{
	Name: "CBSE English Language and Literature Skills",
	Bands: []schema.CognitiveBand{
		band("reading", "Reading Comprehension", 25),
		band("grammar", "Grammar", 12.5),
		band("writing", "Writing Skills", 12.5),
		band("literature", "Literature", 50),
	},
}

var hindiSkills = schema.CognitiveScheme{
	Name: "CBSE Hindi Course B Skills",
	Bands: []schema.CognitiveBand{
		band("reading", "Apathit Bodh (Unseen Comprehension)", 12.5),
		band("grammar", "Vyakaran (Grammar)", 20),
		band("writing", "Rachnatmak Lekhan (Composition)", 25),
		band("literature", "Pathya Pustak (Prescribed Texts)", 42.5),
	},
}

var socialScienceTypology = schema.CognitiveScheme{
	Name: "CBSE Social Science Typology",
	Bands: []schema.CognitiveBand{
		band("remembering", "Remembering", 20),
		band("understanding", "Understanding", 30),
		band("application", "Application", 20),
		band("analyse_evaluate", "Analysing and Evaluating", 20),
		band("map_skill", "Map and Source Skills", 10),
	},
}

const cbseFiveSectionNote = "The five-section pattern: an objective section, " +
	"very short, short and long answer sections, and case-based questions at the end."

var cbseFiveSections = []sectionPlan{
	{code: "A", name: "Objective Type", questions: 20, perQuestion: num(1), total: 20},
	{code: "B", name: "Very Short Answer", questions: 6, perQuestion: num(2), total: 12},
	{code: "C", name: "Short Answer", questions: 7, perQuestion: num(3), total: 21},
	{code: "D", name: "Long Answer", questions: 3, perQuestion: num(5), total: 15},
	{code: "E", name: "Case Based", questions: 3, perQuestion: num(4), total: 12},
}

func fiveSections(extra map[string][]constraintPlan) []sectionPlan {
	out := make([]sectionPlan, 0, len(cbseFiveSections))
	for _, section := range cbseFiveSections {
		section.constraints = extra[section.code]
		out = append(out, section)
	}
	return out
}

var blueprintPlans = []blueprintPlan{
	{
		code: "BP-MATH-G6-UT", version: 1,
		name:    "Mathematics Unit Test I",
		subject: "MATH", grade: "G6",
		description: "The first unit test of the year, forty minutes over the number-system " +
			"chapters. Superseded by version 2, which moved three marks from long answers to " +
			"the objective section.",
		total: 20, duration: 40,
		status:    entblueprint.StatusArchived,
		cognitive: mathsTypology,
		units: &schema.UnitWeightage{Units: []schema.UnitWeight{
			unitMarksOf("M6-U1", "Knowing Our Numbers", 8),
			unitMarksOf("M6-U2", "Whole Numbers", 6),
			unitMarksOf("M6-U3", "Playing with Numbers", 6),
		}},
		sections: []sectionPlan{
			{
				code: "A", name: "Very Short Answer", questions: 5, perQuestion: num(1),
				total: 5, duration: mins(8),
				constraints: []constraintPlan{{
					key: "easy-share", kind: entconstraint.ConstraintTypeDifficulty,
					level: "easy", unit: unitPercent, min: num(60), max: num(100),
					note: "The opening marks are there to be earned by everyone in the room.",
				}},
			},
			{
				code: "B", name: "Short Answer", questions: 3, perQuestion: num(2),
				total: 6, duration: mins(12),
			},
			{
				code: "C", name: "Long Answer", questions: 3, perQuestion: num(3),
				total: 9, duration: mins(20),
			},
		},
	},
	{
		code: "BP-MATH-G6-UT", version: 2,
		name:    "Mathematics Unit Test I",
		subject: "MATH", grade: "G6",
		description: "Forty minutes over the number-system chapters, in three sections of " +
			"rising weight. The live version.",
		total: 20, duration: 40,
		status:    entblueprint.StatusPublished,
		cognitive: mathsTypology,
		units: &schema.UnitWeightage{Units: []schema.UnitWeight{
			unitPercentOf("M6-U1", "Knowing Our Numbers", 40),
			unitPercentOf("M6-U2", "Whole Numbers", 30),
			unitPercentOf("M6-U3", "Playing with Numbers", 30),
		}},
		sections: []sectionPlan{
			{
				code: "A", name: "Objective Type", questions: 6, perQuestion: num(1),
				total: 6, duration: mins(10),
				constraints: []constraintPlan{{
					key: "easy-share", kind: entconstraint.ConstraintTypeDifficulty,
					level: "easy", unit: unitPercent, min: num(60), max: num(100),
					note: "The opening marks are there to be earned by everyone in the room.",
				}},
			},
			{
				code: "B", name: "Short Answer", questions: 4, perQuestion: num(2),
				total: 8, duration: mins(12),
				constraints: []constraintPlan{{
					key: "whole-numbers", kind: entconstraint.ConstraintTypeTopic,
					topic: "M6-U2", unit: unitMarks, min: num(2), max: num(4),
					note: "Whole numbers carry at least one short answer.",
				}},
			},
			{
				code: "C", name: "Long Answer", questions: 2, perQuestion: num(3),
				total: 6, duration: mins(18),
				constraints: []constraintPlan{{
					key: "apply-share", kind: entconstraint.ConstraintTypeBloom,
					band: "apply", unit: unitPercent, min: num(50), max: num(100),
					note: "The long answers are where application is tested.",
				}},
			},
		},
	},
	{
		code: "BP-SCI-G7-HY", version: 1,
		name:    "Science Half-Yearly Examination",
		subject: "SCI", grade: "G7",
		description: "Two and a half hours, eighty marks, the first half of the syllabus. " +
			cbseFiveSectionNote,
		total: 80, duration: 150,
		status:    entblueprint.StatusPublished,
		cognitive: scienceCompetency,
		units: &schema.UnitWeightage{Units: []schema.UnitWeight{
			unitMarksOf("S7-U1", "Nutrition in Plants and Animals", 14),
			unitMarksOf("S7-U2", "Heat", 12),
			unitMarksOf("S7-U3", "Acids, Bases and Salts", 12),
			unitMarksOf("S7-U4", "Physical and Chemical Changes", 12),
			unitMarksOf("S7-U5", "Weather, Climate and Adaptation", 15),
			unitMarksOf("S7-U6", "Winds, Storms and Cyclones", 15),
		}},
		sections: fiveSections(map[string][]constraintPlan{
			"A": {{
				key: "objective-only", kind: entconstraint.ConstraintTypeType,
				qtype: "mcq", unit: unitPercent, min: num(80), max: num(100),
				note: "Section A is read by an optical sheet, so it is multiple choice.",
			}},
			"C": {{
				key: "understanding-share", kind: entconstraint.ConstraintTypeBloom,
				band: "understanding", unit: unitPercent, min: num(30), max: num(60),
				note: "Understanding is carried by the short answers rather than the objective section.",
			}},
			"D": {{
				key: "hard-share", kind: entconstraint.ConstraintTypeDifficulty,
				level: "hard", unit: unitPercent, min: num(20), max: num(40),
				note: "At least one long answer has to separate the top of the class.",
			}},
			"E": {{
				key: "nutrition-outcome", kind: entconstraint.ConstraintTypeOutcome,
				topic: "SCI.7.1.2", unit: unitQuestions, min: num(1), max: num(1),
				note: "One case study reads a nutrition label, which is the outcome this term is judged on.",
			}},
		}),
	},
	{
		code: "BP-SCI-G7-ANN", version: 1,
		name:    "Science Annual Examination",
		subject: "SCI", grade: "G7",
		description: "Three hours, eighty marks, the whole syllabus. Same five sections as the " +
			"half-yearly, half an hour longer, and every unit in scope.",
		total: 80, duration: 180,
		status:    entblueprint.StatusPublished,
		cognitive: scienceCompetency,
		units: &schema.UnitWeightage{Units: []schema.UnitWeight{
			unitMarksOf("S7-U1", "Nutrition in Plants and Animals", 8),
			unitMarksOf("S7-U2", "Heat", 6),
			unitMarksOf("S7-U3", "Acids, Bases and Salts", 6),
			unitMarksOf("S7-U4", "Physical and Chemical Changes", 6),
			unitMarksOf("S7-U5", "Weather, Climate and Adaptation", 8),
			unitMarksOf("S7-U6", "Winds, Storms and Cyclones", 6),
			unitMarksOf("S7-U7", "Soil", 8),
			unitMarksOf("S7-U8", "Respiration in Organisms", 8),
			unitMarksOf("S7-U9", "Transportation in Animals and Plants", 8),
			unitMarksOf("S7-U10", "Reproduction in Plants", 8),
			unitMarksOf("S7-U11", "Light", 8),
		}},
		sections: fiveSections(map[string][]constraintPlan{
			"A": {{
				key: "objective-only", kind: entconstraint.ConstraintTypeType,
				qtype: "mcq", unit: unitPercent, min: num(80), max: num(100),
				note: "Section A is read by an optical sheet, so it is multiple choice.",
			}},
			"C": {{
				key: "first-half-share", kind: entconstraint.ConstraintTypeTopic,
				topic: "S7-U1", unit: unitMarks, min: num(3), max: num(6),
				note: "The annual paper still reaches back into the first term.",
			}},
			"D": {{
				key: "hots-share", kind: entconstraint.ConstraintTypeBloom,
				band: "hots", unit: unitPercent, min: num(30), max: num(70),
				note: "Higher order thinking lives in the long answers.",
			}},
			"E": {{
				key: "case-study-only", kind: entconstraint.ConstraintTypeType,
				qtype: "case_study", unit: unitPercent, min: num(100), max: num(100),
				note: "Section E is case based by definition.",
			}},
		}),
	},
	{
		code: "BP-MATH-G8-MCQ", version: 1,
		name:    "Mathematics Objective Quiz",
		subject: "MATH", grade: "G8", reusable: true,
		description: "Half an hour, twenty-five multiple-choice questions, one mark each. " +
			"A reusable template: it carries no academic session, because the pattern does " +
			"not change with the year, and no unit weightage, because the chapter it covers " +
			"is chosen when the quiz is set.",
		total: 25, duration: 30,
		status:    entblueprint.StatusPublished,
		cognitive: objectiveBloom,
		sections: []sectionPlan{{
			code: "A", name: "Multiple Choice", questions: 25, perQuestion: num(1),
			total: 25, duration: mins(30),
			constraints: []constraintPlan{
				{
					key: "mcq-only", kind: entconstraint.ConstraintTypeType,
					qtype: "mcq", unit: unitPercent, min: num(100), max: num(100),
					note: "Every question is multiple choice; that is what makes this a quiz.",
				},
				{
					key: "easy-share", kind: entconstraint.ConstraintTypeDifficulty,
					level: "easy", unit: unitPercent, min: num(40), max: num(60),
					note: "Roughly half the quiz is recall, so a class that revised scores well.",
				},
				{
					key: "medium-share", kind: entconstraint.ConstraintTypeDifficulty,
					level: "medium", unit: unitPercent, min: num(30), max: num(50),
					note: "Two constraints of one type on one section: the shares are separate questions.",
				},
			},
		}},
	},
	{
		code: "BP-ENG-G8-ANN", version: 1,
		name:    "English Language and Literature Annual Examination",
		subject: "ENG", grade: "G8",
		description: "Three hours, eighty marks. The bands are reading, grammar, writing and " +
			"literature, not remember and apply: a language paper is not banded by a Bloom " +
			"ladder, which is why the scheme is named.",
		total: 80, duration: 180,
		status:    entblueprint.StatusPublished,
		cognitive: englishSkills,
		units: &schema.UnitWeightage{Units: []schema.UnitWeight{
			unitMarksOf("ENG8-LANG", "Language, Grammar and Writing Skills", 40),
			unitMarksOf("ENG8-PROSE", "Honeydew: Prose", 20),
			unitMarksOf("ENG8-POETRY", "Honeydew: Poetry", 10),
			unitMarksOf("ENG8-SUPP", "It So Happened: Supplementary Reader", 10),
		}},
		sections: []sectionPlan{
			{
				code: "A", name: "Reading Comprehension", questions: 2, perQuestion: num(10),
				total: 20,
				constraints: []constraintPlan{{
					key: "unseen-passages", kind: entconstraint.ConstraintTypeTopic,
					topic: "ENG8-LANG", unit: unitMarks, min: num(20), max: num(20),
					note: "Both passages are unseen, so they are drawn from the language unit, not the texts.",
				}},
			},
			{
				code: "B", name: "Grammar", questions: 10, perQuestion: num(1),
				total: 10,
				constraints: []constraintPlan{{
					key: "gap-fill-share", kind: entconstraint.ConstraintTypeType,
					qtype: "fill_blank", unit: unitPercent, min: num(50), max: num(100),
					note: "Grammar is tested by editing and filling, not by asking for definitions.",
				}},
			},
			{
				code: "C", name: "Writing", questions: 2, perQuestion: num(5),
				total: 10,
				constraints: []constraintPlan{{
					key: "writing-band", kind: entconstraint.ConstraintTypeBloom,
					band: "writing", unit: unitPercent, min: num(100), max: num(100),
					note: "A bloom constraint names a band of the paper's own scheme, " +
						"which here is a skill rather than a rung of a ladder.",
				}},
			},
			{
				code: "D", name: "Literature", questions: 8, perQuestion: num(5),
				total: 40,
				constraints: []constraintPlan{
					{
						key: "prose-share", kind: entconstraint.ConstraintTypeTopic,
						topic: "ENG8-PROSE", unit: unitMarks, min: num(15), max: num(25),
						note: "Prose carries the largest share of the literature section.",
					},
					{
						key: "poetry-present", kind: entconstraint.ConstraintTypeTopic,
						topic: "ENG8-POETRY", unit: unitMarks, min: num(10), max: num(10),
						note: "Poetry is never left out, however the rest of the section falls.",
					},
				},
			},
		},
	},
	{
		code: "BP-HIN-G7-HY", version: 1,
		name:    "Hindi Half-Yearly Examination",
		subject: "HIN", grade: "G7", reusable: true,
		description: "Two and a half hours, eighty marks, in four skill sections. A reusable " +
			"template: the pattern is fixed by the board, while the prescribed chapters are " +
			"chosen each year, which is why it carries no session and no unit weightage.",
		total: 80, duration: 150,
		status:    entblueprint.StatusPublished,
		cognitive: hindiSkills,
		sections: []sectionPlan{
			{
				code: "A", name: "Apathit Bodh (Unseen Comprehension)", questions: 2,
				perQuestion: num(5), total: 10,
			},
			{
				code: "B", name: "Vyakaran (Grammar)", questions: 16, perQuestion: num(1),
				total: 16,
				constraints: []constraintPlan{{
					key: "grammar-band", kind: entconstraint.ConstraintTypeBloom,
					band: "grammar", unit: unitPercent, min: num(100), max: num(100),
					note: "The whole section sits in the grammar band of this paper's scheme.",
				}},
			},
			{
				code: "C", name: "Rachnatmak Lekhan (Composition)", questions: 4,
				perQuestion: num(5), total: 20,
			},
			{
				code: "D", name: "Pathya Pustak (Prescribed Texts)", questions: 17,
				perQuestion: num(2), total: 34,
				constraints: []constraintPlan{{
					key: "literature-band", kind: entconstraint.ConstraintTypeBloom,
					band: "literature", unit: unitPercent, min: num(100), max: num(100),
					note: "The texts section is the literature band, whichever chapters are prescribed.",
				}},
			},
		},
	},
	{
		code: "BP-SST-G8-ANN", version: 1,
		name:    "Social Science Annual Examination",
		subject: "SST", grade: "G8",
		description: "Three hours, eighty marks. Still a draft: the map and source-based " +
			"section is being rewritten, so no paper should be generated from it yet.",
		total: 80, duration: 180,
		status:    entblueprint.StatusDraft,
		cognitive: socialScienceTypology,
		units: &schema.UnitWeightage{Units: []schema.UnitWeight{
			unitMarksOf("SST8-HIST", "Our Pasts III", 30),
			unitMarksOf("SST8-GEO", "Resources and Development", 25),
			unitMarksOf("SST8-CIVICS", "Social and Political Life III", 25),
		}},
		sections: []sectionPlan{
			{code: "A", name: "Objective Type", questions: 20, perQuestion: num(1), total: 20,
				constraints: []constraintPlan{{
					key: "objective-only", kind: entconstraint.ConstraintTypeType,
					qtype: "mcq", unit: unitPercent, min: num(80), max: num(100),
					note: "Section A is read by an optical sheet, so it is multiple choice.",
				}},
			},
			{code: "B", name: "Very Short Answer", questions: 6, perQuestion: num(2), total: 12},
			{code: "C", name: "Short Answer", questions: 7, perQuestion: num(3), total: 21},
			{code: "D", name: "Long Answer", questions: 3, perQuestion: num(5), total: 15},
			{
				code: "E", name: "Map Work and Source Based", questions: 5, total: 12,
				constraints: []constraintPlan{
					{
						key: "map-marks", kind: entconstraint.ConstraintTypeTopic,
						topic: "SST8-GEO", unit: unitMarks, min: num(5), max: num(5),
						note: "Five of the twelve marks are the map itself.",
					},
					{
						key: "map-skill-band", kind: entconstraint.ConstraintTypeBloom,
						band: "map_skill", unit: unitPercent, min: num(40), max: num(60),
						note: "Map skill is a band of the Social Science typology, not of any Bloom ladder.",
					},
				},
			},
		},
	},
}
