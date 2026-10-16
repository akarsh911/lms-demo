package main

import (
	"context"
	"io"
	"testing"
	"time"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entconstraint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprintconstraint"
	entbpsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprintsection"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subject"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

const testSession = "2026-2027"

func quietSeeder(client *tenantent.Client) *seeder {
	return &seeder{
		o:      options{school: "test", session: testSession},
		client: client,
		tenant: &tenancy.Tenant{Code: "TEST", Name: "Test School"},
		out:    io.Discard,
	}
}

func reference(ctx context.Context, t *testing.T, client *tenantent.Client) {
	t.Helper()

	if _, err := client.AcademicSession.Query().
		Where(entsession.Code(testSession)).Only(ctx); tenantent.IsNotFound(err) {
		start := time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)
		_, err = client.AcademicSession.Create().
			SetName(testSession).SetCode(testSession).
			SetStartDate(start).SetEndDate(start.AddDate(1, 0, -1)).
			SetStatus(entsession.StatusActive).
			Save(ctx)
		if err != nil {
			t.Fatalf("could not make the academic session the samples hang off: %v", err)
		}
	} else if err != nil {
		t.Fatalf("academic session %s: %v", testSession, err)
	}

	for _, plan := range blueprintPlans {
		_, err := client.Subject.Query().Where(entsubject.Code(plan.subject)).Only(ctx)
		if tenantent.IsNotFound(err) {
			if _, err := client.Subject.Create().
				SetCode(plan.subject).SetName(plan.subject).SetSubjectType("academic").
				Save(ctx); err != nil {
				t.Fatalf("subject %s: %v", plan.subject, err)
			}
		} else if err != nil {
			t.Fatalf("subject %s: %v", plan.subject, err)
		}

		_, err = client.GradeLevel.Query().Where(entgrade.Code(plan.grade)).Only(ctx)
		if tenantent.IsNotFound(err) {
			if _, err := client.GradeLevel.Create().
				SetCode(plan.grade).SetName(plan.grade).SetSequence(len(plan.grade)).
				Save(ctx); err != nil {
				t.Fatalf("grade level %s: %v", plan.grade, err)
			}
		} else if err != nil {
			t.Fatalf("grade level %s: %v", plan.grade, err)
		}
	}
}

func distinct(prefix string) []blueprintPlan {
	out := make([]blueprintPlan, 0, len(blueprintPlans))
	for _, plan := range blueprintPlans {
		plan.code = prefix + plan.code
		out = append(out, plan)
	}
	return out
}

func wanted() (blueprints, sections, constraints int) {
	for _, plan := range blueprintPlans {
		blueprints++
		for _, section := range plan.sections {
			sections++
			constraints += len(section.constraints)
		}
	}
	return blueprints, sections, constraints
}

func TestASecondRunWritesNothing(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	reference(ctx, t, db.Client)

	fresh := distinct("TEST-")

	first := quietSeeder(db.Client)
	if err := first.seed(ctx, fresh); err != nil {
		t.Fatalf("the first run failed: %v", err)
	}

	blueprints, sections, constraints := wanted()
	for kind, want := range map[string]int{
		"blueprint":            blueprints,
		"blueprint_section":    sections,
		"blueprint_constraint": constraints,
	} {
		if first.made[kind] != want {
			t.Errorf("the first run made %d %s, and the plan has %d",
				first.made[kind], kind, want)
		}
	}
	if len(first.warns) > 0 {
		t.Errorf("these codes are the test's own and existed nowhere, so there was nothing "+
			"to leave alone, yet the run reported %v", first.warns)
	}

	second := quietSeeder(db.Client)
	if err := second.seed(ctx, fresh); err != nil {
		t.Fatalf("the second run failed: %v", err)
	}
	if len(second.made) > 0 {
		t.Fatalf("a second run has to be a no-op, and it wrote %v; a seeder that duplicates "+
			"is a seeder nobody can safely re-run after a half-finished one", second.made)
	}
	if len(second.warns) > 0 {
		t.Fatalf("the second run read back rows it had just written and thought they differed "+
			"from the plan: %v", second.warns)
	}
}

func TestTheWrittenRowsAddUpInTheDatabase(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	reference(ctx, t, db.Client)

	if err := quietSeeder(db.Client).seed(ctx, blueprintPlans); err != nil {
		t.Fatalf("seeding failed: %v", err)
	}

	codes := map[string]bool{}
	for _, plan := range blueprintPlans {
		codes[plan.code] = true
	}
	rows, err := db.Client.Blueprint.Query().
		Where(entblueprint.CodeIn(sorted(codes)...)).All(ctx)
	if err != nil {
		t.Fatalf("reading the samples back: %v", err)
	}
	blueprints, sections, constraints := wanted()
	if len(rows) != blueprints {
		t.Fatalf("wrote %d blueprints and read %d back", blueprints, len(rows))
	}

	readSections, readConstraints := 0, 0
	for _, row := range rows {
		held, err := db.Client.BlueprintSection.Query().
			Where(entbpsection.BlueprintID(row.ID)).All(ctx)
		if err != nil {
			t.Fatalf("%s v%d sections: %v", row.Code, row.Version, err)
		}
		readSections += len(held)

		marks, positions := 0.0, map[int]bool{}
		for _, section := range held {
			marks += section.TotalMarks
			if positions[section.Position] {
				t.Errorf("%s v%d has two sections at position %d, and the pair is UNIQUE",
					row.Code, row.Version, section.Position)
			}
			positions[section.Position] = true

			if section.MarksPerQuestion != nil {
				want := float64(section.QuestionCount) * *section.MarksPerQuestion
				if !near(want, section.TotalMarks) {
					t.Errorf("%s v%d section %s holds %d questions of %g but %g marks",
						row.Code, row.Version, section.SectionCode,
						section.QuestionCount, *section.MarksPerQuestion, section.TotalMarks)
				}
			}

			n, err := db.Client.BlueprintConstraint.Query().
				Where(entconstraint.BlueprintSectionID(section.ID)).Count(ctx)
			if err != nil {
				t.Fatalf("%s v%d constraints: %v", row.Code, row.Version, err)
			}
			readConstraints += n
		}

		if !near(marks, row.TotalMarks) {
			t.Errorf("%s v%d is out of %g and its sections carry %g; the numeric(8,2) column "+
				"is where a rounding slip would show, so this is read from the database and "+
				"not from the plan", row.Code, row.Version, row.TotalMarks, marks)
		}
		if len(positions) != len(held) {
			t.Errorf("%s v%d has %d sections over %d positions",
				row.Code, row.Version, len(held), len(positions))
		}
	}
	if readSections != sections || readConstraints != constraints {
		t.Errorf("the plan has %d sections and %d constraints; the database has %d and %d",
			sections, constraints, readSections, readConstraints)
	}
}

func TestNullsSurviveTheWrite(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	reference(ctx, t, db.Client)

	if err := quietSeeder(db.Client).seed(ctx, blueprintPlans); err != nil {
		t.Fatalf("seeding failed: %v", err)
	}

	for _, plan := range blueprintPlans {
		row, err := db.Client.Blueprint.Query().
			Where(entblueprint.Code(plan.code), entblueprint.Version(plan.version)).
			Only(ctx)
		if err != nil {
			t.Fatalf("%s v%d: %v", plan.code, plan.version, err)
		}

		switch {
		case plan.reusable && row.AcademicSessionID != nil:
			t.Errorf("%s v%d is a reusable template and came back bound to a session; null "+
				"there is what ?reusable=true reads", plan.code, plan.version)
		case !plan.reusable && row.AcademicSessionID == nil:
			t.Errorf("%s v%d belongs to one session and came back reusable",
				plan.code, plan.version)
		}
		switch {
		case plan.units == nil && row.UnitWeightage != nil:
			t.Errorf("%s v%d has no unit weightage and came back with %v; null is not {} here",
				plan.code, plan.version, row.UnitWeightage)
		case plan.units != nil && row.UnitWeightage == nil:
			t.Errorf("%s v%d carries %d units and came back with none",
				plan.code, plan.version, len(plan.units.Units))
		}

		if row.CognitiveScheme.Name == "" || len(row.CognitiveScheme.Bands) == 0 {
			t.Errorf("%s v%d came back with an unnamed or bandless cognitive scheme, which no "+
				"reader can interpret", plan.code, plan.version)
		}

		for _, want := range plan.sections {
			section, err := db.Client.BlueprintSection.Query().
				Where(entbpsection.BlueprintID(row.ID),
					entbpsection.SectionCode(want.code)).Only(ctx)
			if err != nil {
				t.Fatalf("%s v%d section %s: %v", plan.code, plan.version, want.code, err)
			}
			if (want.perQuestion == nil) != (section.MarksPerQuestion == nil) {
				t.Errorf("%s v%d section %s disagrees with the plan about whether every "+
					"question is worth the same", plan.code, plan.version, want.code)
			}
			if (want.duration == nil) != (section.DurationMinutes == nil) {
				t.Errorf("%s v%d section %s disagrees with the plan about being timed on its own",
					plan.code, plan.version, want.code)
			}
		}
	}
}

func TestAnEditedSampleIsReportedAndNotOverwritten(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	reference(ctx, t, db.Client)

	if err := quietSeeder(db.Client).seed(ctx, blueprintPlans); err != nil {
		t.Fatalf("seeding failed: %v", err)
	}

	plan := blueprintPlans[0]
	row, err := db.Client.Blueprint.Query().
		Where(entblueprint.Code(plan.code), entblueprint.Version(plan.version)).Only(ctx)
	if err != nil {
		t.Fatalf("%s v%d: %v", plan.code, plan.version, err)
	}
	edited, err := db.Client.Blueprint.UpdateOne(row).
		SetDurationMinutes(plan.duration + 5).Save(ctx)
	if err != nil {
		t.Fatalf("standing in for a school editing the sample: %v", err)
	}

	again := quietSeeder(db.Client)
	if err := again.seed(ctx, blueprintPlans); err != nil {
		t.Fatalf("the run over the edited sample failed: %v", err)
	}
	if len(again.warns) == 0 {
		t.Fatal("a sample the school has edited has to be reported, or the run claims to have " +
			"left the school with the set it printed")
	}
	after, err := db.Client.Blueprint.Get(ctx, row.ID)
	if err != nil {
		t.Fatalf("reading the edited sample back: %v", err)
	}
	if after.DurationMinutes != edited.DurationMinutes {
		t.Fatalf("the seeder overwrote an edit: %d minutes became %d",
			edited.DurationMinutes, after.DurationMinutes)
	}
}

func TestAMissingSubjectStopsTheRunBeforeItWritesAnything(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	reference(ctx, t, db.Client)

	impossible := base()
	impossible.code = "BP-NO-SUCH-SUBJECT"
	impossible.subject = "NOSUCHSUBJECT"

	s := quietSeeder(db.Client)
	err := s.seed(ctx, []blueprintPlan{impossible})
	if err == nil {
		t.Fatal("a blueprint is immutably bound to a subject and a grade level, so a school " +
			"without them cannot hold the samples and the run has to say so")
	}

	left, countErr := db.Client.Blueprint.Query().
		Where(entblueprint.Code(impossible.code)).Count(ctx)
	if countErr != nil {
		t.Fatalf("counting what the failed run left behind: %v", countErr)
	}
	if left != 0 {
		t.Fatalf("the run failed on a missing reference and still wrote %d blueprints", left)
	}
	if len(s.made) != 0 {
		t.Fatalf("the failed run reported having made %v", s.made)
	}
}

func sectionOf(ctx context.Context, t *testing.T, client *tenantent.Client,
	code, section string) *tenantent.BlueprintSection {
	t.Helper()

	row, err := client.BlueprintSection.Query().
		Where(
			entbpsection.SectionCode(section),
			entbpsection.HasBlueprintWith(entblueprint.Code(code)),
		).Only(ctx)
	if err != nil {
		t.Fatalf("%s section %s: %v", code, section, err)
	}
	return row
}

func TestAHalfFinishedRunIsFinishedByRunningItAgain(t *testing.T) {
	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	reference(ctx, t, db.Client)

	fresh := distinct("HALF-")
	if err := quietSeeder(db.Client).seed(ctx, fresh); err != nil {
		t.Fatalf("the first run failed: %v", err)
	}

	quiz := sectionOf(ctx, t, db.Client, "HALF-BP-MATH-G8-MCQ", "A")
	held, err := db.Client.BlueprintConstraint.Query().
		Where(entconstraint.BlueprintSectionID(quiz.ID)).All(ctx)
	if err != nil {
		t.Fatalf("the quiz's constraints: %v", err)
	}
	dropped := 0
	for _, row := range held {
		if key, _ := row.ValueJSON["key"].(string); key == "medium-share" {
			if err := db.Client.BlueprintConstraint.DeleteOne(row).Exec(ctx); err != nil {
				t.Fatalf("standing in for a run that died mid-section: %v", err)
			}
			dropped++
		}
	}
	if dropped != 1 {
		t.Fatalf("the quiz section is meant to carry two difficulty constraints that differ "+
			"only by their key, which is what makes this test able to tell a key apart from "+
			"a type; found %d to drop", dropped)
	}

	short := sectionOf(ctx, t, db.Client, "HALF-BP-SCI-G7-HY", "C")
	if err := db.Client.BlueprintSection.DeleteOne(short).Exec(ctx); err != nil {
		t.Fatalf("standing in for a run that died between sections: %v", err)
	}

	again := quietSeeder(db.Client)
	if err := again.seed(ctx, fresh); err != nil {
		t.Fatalf("the finishing run failed: %v", err)
	}
	for kind, want := range map[string]int{
		"blueprint":            0,
		"blueprint_section":    1,
		"blueprint_constraint": 2,
	} {
		if again.made[kind] != want {
			t.Errorf("finishing a half-written set had to make %d %s and made %d; a seeder "+
				"that cannot resume has to be run into an empty school or not at all",
				want, kind, again.made[kind])
		}
	}

	last := quietSeeder(db.Client)
	if err := last.seed(ctx, fresh); err != nil {
		t.Fatalf("the run after the finishing run failed: %v", err)
	}
	if len(last.made) > 0 {
		t.Fatalf("the set was whole again and a further run still wrote %v", last.made)
	}
}
