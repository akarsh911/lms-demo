package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcurriculum "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculum"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradingscheme"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
)

type chapterPlan struct {
	title  string
	topics []string
}

type unitPlan struct {
	title    string
	chapters []chapterPlan
}

var curriculumPlans = map[string][]unitPlan{
	"MATH": {
		{title: "Number Systems", chapters: []chapterPlan{
			{title: "Real Numbers", topics: []string{
				"Euclid's division lemma", "Fundamental theorem of arithmetic",
				"Irrational numbers", "Decimal expansions"}},
			{title: "Polynomials", topics: []string{
				"Zeroes of a polynomial", "Relationship between zeroes and coefficients",
				"Division algorithm"}},
		}},
		{title: "Algebra", chapters: []chapterPlan{
			{title: "Pair of Linear Equations", topics: []string{
				"Graphical method", "Substitution method", "Elimination method",
				"Cross-multiplication"}},
			{title: "Quadratic Equations", topics: []string{
				"Standard form", "Factorisation", "Completing the square", "The discriminant"}},
		}},
		{title: "Geometry", chapters: []chapterPlan{
			{title: "Triangles", topics: []string{
				"Similar figures", "Criteria for similarity", "Areas of similar triangles",
				"Pythagoras theorem"}},
			{title: "Circles", topics: []string{"Tangent to a circle", "Number of tangents"}},
		}},
	},
	"SCI": {
		{title: "Chemical Substances", chapters: []chapterPlan{
			{title: "Chemical Reactions and Equations", topics: []string{
				"Writing a chemical equation", "Balancing equations", "Types of reactions",
				"Corrosion and rancidity"}},
			{title: "Acids, Bases and Salts", topics: []string{
				"Chemical properties", "The pH scale", "Common salts"}},
		}},
		{title: "World of Living", chapters: []chapterPlan{
			{title: "Life Processes", topics: []string{
				"Nutrition", "Respiration", "Transportation", "Excretion"}},
			{title: "Control and Coordination", topics: []string{
				"Nervous system", "Reflex action", "Hormones in animals"}},
		}},
		{title: "Natural Phenomena", chapters: []chapterPlan{
			{title: "Light: Reflection and Refraction", topics: []string{
				"Spherical mirrors", "Mirror formula", "Refraction through a lens",
				"Lens formula and power"}},
		}},
	},
	"ENG": {
		{title: "Reading", chapters: []chapterPlan{
			{title: "Comprehension", topics: []string{
				"Factual passages", "Discursive passages", "Inference and vocabulary"}},
		}},
		{title: "Writing and Grammar", chapters: []chapterPlan{
			{title: "Writing Skills", topics: []string{
				"Formal letter", "Analytical paragraph", "Article writing"}},
			{title: "Grammar", topics: []string{
				"Tenses", "Modals", "Subject-verb concord", "Reported speech"}},
		}},
		{title: "Literature", chapters: []chapterPlan{
			{title: "Prose", topics: []string{"A Letter to God", "Nelson Mandela", "Two Stories about Flying"}},
			{title: "Poetry", topics: []string{"Dust of Snow", "Fire and Ice", "A Tiger in the Zoo"}},
		}},
	},
	"SST": {
		{title: "History", chapters: []chapterPlan{
			{title: "The Rise of Nationalism in Europe", topics: []string{
				"The French Revolution", "The making of nationalism", "Unification of Germany and Italy"}},
			{title: "Nationalism in India", topics: []string{
				"The Rowlatt Act", "Non-Cooperation Movement", "Civil Disobedience"}},
		}},
		{title: "Geography", chapters: []chapterPlan{
			{title: "Resources and Development", topics: []string{
				"Types of resources", "Land utilisation", "Soil types and conservation"}},
			{title: "Water Resources", topics: []string{"Water scarcity", "Multi-purpose projects", "Rainwater harvesting"}},
		}},
		{title: "Civics", chapters: []chapterPlan{
			{title: "Power Sharing", topics: []string{"Belgium and Sri Lanka", "Forms of power sharing"}},
		}},
	},
	"HIN": {
		{title: "गद्य खंड", chapters: []chapterPlan{
			{title: "क्षितिज गद्य", topics: []string{"नेताजी का चश्मा", "बालगोबिन भगत", "लखनवी अंदाज़"}},
		}},
		{title: "काव्य खंड", chapters: []chapterPlan{
			{title: "क्षितिज काव्य", topics: []string{"सूरदास के पद", "राम-लक्ष्मण-परशुराम संवाद", "आत्मकथ्य"}},
		}},
		{title: "व्याकरण", chapters: []chapterPlan{
			{title: "रचना", topics: []string{"रचना के आधार पर वाक्य भेद", "वाच्य", "पद परिचय", "रस"}},
		}},
	},
}

var gradingPlans = []struct {
	code, name, kind, description string
	maximum, pass                 float64
	bands                         []schema.GradeBand
}{
	{
		code: "CBSE-SCH", name: "CBSE Scholastic (100 marks)", kind: "marks",
		description: "Board pattern: 80 marks theory plus 20 internal, pass at 33 per cent.",
		maximum:     100, pass: 33,
		bands: []schema.GradeBand{
			{Label: "A1", MinPercent: 91, MaxPercent: 100, Points: points(10)},
			{Label: "A2", MinPercent: 81, MaxPercent: 90, Points: points(9)},
			{Label: "B1", MinPercent: 71, MaxPercent: 80, Points: points(8)},
			{Label: "B2", MinPercent: 61, MaxPercent: 70, Points: points(7)},
			{Label: "C1", MinPercent: 51, MaxPercent: 60, Points: points(6)},
			{Label: "C2", MinPercent: 41, MaxPercent: 50, Points: points(5)},
			{Label: "D", MinPercent: 33, MaxPercent: 40, Points: points(4)},
			{Label: "E", MinPercent: 0, MaxPercent: 32, Points: points(0)},
		},
	},
	{
		code: "CBSE-COSCH", name: "CBSE Co-scholastic (A to E)", kind: "grade",
		description: "Five-point descriptive grade for work education, art and health.",
		bands: []schema.GradeBand{
			{Label: "A", MinPercent: 81, MaxPercent: 100, Description: text("Outstanding")},
			{Label: "B", MinPercent: 61, MaxPercent: 80, Description: text("Very good")},
			{Label: "C", MinPercent: 41, MaxPercent: 60, Description: text("Fair")},
			{Label: "D", MinPercent: 21, MaxPercent: 40, Description: text("Needs improvement")},
			{Label: "E", MinPercent: 0, MaxPercent: 20, Description: text("Needs much improvement")},
		},
	},
	{
		code: "UT-20", name: "Unit test (20 marks)", kind: "marks",
		description: "Short periodic class test used for the internal component.",
		maximum:     20, pass: 7,
	},
}

func points(v float64) *float64 { return &v }

func text(v string) *string { return &v }

func (s *seeder) curriculum(ctx context.Context, a *academics) error {
	schemes, err := s.gradingSchemes(ctx, a)
	if err != nil {
		return fmt.Errorf("grading schemes: %w", err)
	}
	if err := s.attachGrading(ctx, a, schemes); err != nil {
		return fmt.Errorf("attaching grading: %w", err)
	}

	for _, subject := range a.subjects {
		plan, known := curriculumPlans[subject.Code]
		if !known {
			continue
		}
		for _, grade := range a.grades {
			if err := s.curriculumFor(ctx, a, subject, grade, plan); err != nil {
				return fmt.Errorf("curriculum %s %s: %w", subject.Code, grade.Code, err)
			}
		}
	}
	return nil
}

func (s *seeder) gradingSchemes(ctx context.Context,
	a *academics) (map[string]*tenantent.GradingScheme, error) {

	out := make(map[string]*tenantent.GradingScheme, len(gradingPlans))
	for _, plan := range gradingPlans {
		found, err := s.client.GradingScheme.Query().
			Where(entscheme.AcademicSessionID(a.session.ID), entscheme.Code(plan.code)).
			Only(ctx)
		if err == nil {
			out[plan.code] = found
			continue
		}
		if !tenantent.IsNotFound(err) {
			return nil, err
		}
		if s.o.dryRun {
			continue
		}

		create := s.client.GradingScheme.Create().
			SetAcademicSessionID(a.session.ID).
			SetName(plan.name).
			SetCode(plan.code).
			SetKind(entscheme.Kind(plan.kind)).
			SetDescription(plan.description)
		if plan.maximum > 0 {
			create = create.SetMaximumMarks(plan.maximum).SetPassMarks(plan.pass)
		}
		if len(plan.bands) > 0 {
			create = create.SetScaleJSON(plan.bands)
		}
		row, err := create.Save(ctx)
		if err != nil {
			return nil, err
		}
		s.note("grading_scheme", 1)
		out[plan.code] = row
	}
	return out, nil
}

func (s *seeder) attachGrading(ctx context.Context, a *academics,
	schemes map[string]*tenantent.GradingScheme) error {

	scholastic, known := schemes["CBSE-SCH"]
	if !known || s.o.dryRun {
		return nil
	}
	for _, offering := range a.offerings {
		if offering.GradingSchemeID != nil {
			continue
		}
		if err := s.client.SubjectOffering.UpdateOneID(offering.ID).
			SetGradingSchemeID(scholastic.ID).
			Exec(ctx); err != nil {
			return err
		}
		s.note("offering_grading", 1)
	}
	return nil
}

func (s *seeder) curriculumFor(ctx context.Context, a *academics,
	subject *tenantent.Subject, grade *tenantent.GradeLevel, plan []unitPlan) error {

	code := fmt.Sprintf("%s-%s-%s", a.session.Code, grade.Code, subject.Code)

	found, err := s.client.Curriculum.Query().Where(entcurriculum.Code(code)).Only(ctx)
	if err != nil && !tenantent.IsNotFound(err) {
		return err
	}
	if err == nil {
		return s.curriculumNodes(ctx, found, plan)
	}
	if s.o.dryRun {
		return nil
	}

	row, err := s.client.Curriculum.Create().
		SetName(fmt.Sprintf("%s — %s", grade.Name, subject.Name)).
		SetCode(code).
		SetAcademicSessionID(a.session.ID).
		SetSubjectID(subject.ID).
		SetGradeLevelID(grade.ID).
		SetBoard("CBSE").
		SetDescription(fmt.Sprintf("Syllabus followed for %s in %s.", subject.Name, grade.Name)).
		SetStatus(entcurriculum.StatusActive).
		Save(ctx)
	if err != nil {
		return err
	}
	s.note("curriculum", 1)
	return s.curriculumNodes(ctx, row, plan)
}

func (s *seeder) curriculumNodes(ctx context.Context,
	curriculum *tenantent.Curriculum, plan []unitPlan) error {

	existing, err := s.client.CurriculumNode.Query().
		Where(entnode.CurriculumID(curriculum.ID)).Count(ctx)
	if err != nil {
		return err
	}
	if existing > 0 || s.o.dryRun {
		return nil
	}

	for unitAt, unit := range plan {
		unitID, err := s.node(ctx, curriculum.ID, nil, entnode.KindUnit, unit.title, unitAt)
		if err != nil {
			return err
		}
		for chapterAt, chapter := range unit.chapters {
			chapterID, err := s.node(ctx, curriculum.ID, &unitID, entnode.KindChapter,
				chapter.title, chapterAt)
			if err != nil {
				return err
			}
			for topicAt, topic := range chapter.topics {
				if _, err := s.node(ctx, curriculum.ID, &chapterID, entnode.KindTopic,
					topic, topicAt); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (s *seeder) node(ctx context.Context, curriculumID uuid.UUID, parent *uuid.UUID,
	kind entnode.Kind, title string, sequence int) (uuid.UUID, error) {

	create := s.client.CurriculumNode.Create().
		SetCurriculumID(curriculumID).
		SetKind(kind).
		SetTitle(title).
		SetSequence(sequence)
	if parent != nil {
		create = create.SetParentID(*parent)
	}
	row, err := create.Save(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	s.note("curriculum_node", 1)
	return row.ID, nil
}
