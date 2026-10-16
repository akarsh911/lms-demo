package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entconstraint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprintconstraint"
	entbpsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprintsection"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subject"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const usage = `emerge-core seedblueprints

Fills one school with sample paper formats: blueprints, their sections and the
constraints on those sections. Nothing else is touched, so it is safe to run
against a school that is already live -- unlike seeddemo, which builds a whole
demo year of classes, pupils and timetables around them.

  seedblueprints -school DPS-NGP

Safe to run repeatedly. Every blueprint is looked up on (code, version), every
section on (blueprint, section_code) and every constraint on its type and the
"key" it carries in value_json, so a second run writes nothing and a run that
died halfway is finished by running it again. A row that already exists with
different numbers is reported and left alone: the school may have edited it.

The samples go through ent rather than SQL on purpose. total_marks, version,
duration_minutes, question_count and the name lengths are validated in Go and
emit no DDL, so a raw INSERT can write a blueprint that no API response can
describe. Running through the client applies all of them.

The arithmetic is checked before anything is written: each blueprint's
total_marks equals the sum of its sections', each section's equals its
question_count times its marks_per_question where that is set, a fully weighted
cognitive scheme comes to 100 percent, and a unit weightage given in marks
comes to the paper's total. A sample whose own numbers disagree would teach
whoever reads it the wrong thing.

Flags:
  -school    school code or id, as it appears in the control plane
  -session   academic session code for the session-scoped samples (default 2026-2027)
  -list      read the sample set back and print it; writes nothing
  -dry-run   report what would be written, write nothing

Subjects and grade levels are resolved by code at run time and must already
exist: ENG, HIN, MATH, SCI and SST, and G6, G7 and G8. The command names what
is missing rather than inventing it, because a blueprint is immutably bound to
the subject and grade it is written for.

Environment:
  CONTROL_DATABASE_URL   control-plane DSN
  SECRETS_MASTER_KEY     master key the stored credentials are encrypted with
`

type options struct {
	school  string
	session string
	list    bool
	dryRun  bool
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	config.LoadDotEnv()

	fs := flag.NewFlagSet("seedblueprints", flag.ExitOnError)
	fs.Usage = func() { fmt.Fprint(os.Stderr, usage) }

	var o options
	fs.StringVar(&o.school, "school", "", "school code or id")
	fs.StringVar(&o.session, "session", "2026-2027", "academic session code")
	fs.BoolVar(&o.list, "list", false, "print the sample set as it stands and write nothing")
	fs.BoolVar(&o.dryRun, "dry-run", false, "write nothing")
	if err := fs.Parse(os.Args[1:]); err != nil {
		return err
	}
	if o.school == "" {
		fs.Usage()
		return errors.New("-school is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	controlDSN := os.Getenv("CONTROL_DATABASE_URL")
	if controlDSN == "" {
		return errors.New("CONTROL_DATABASE_URL is required")
	}
	keyring, err := crypto.ParseKeyring(os.Getenv("SECRETS_MASTER_KEY"))
	if err != nil {
		return fmt.Errorf("SECRETS_MASTER_KEY: %w", err)
	}

	control, err := postgres.NewControl(ctx, controlDSN, postgres.Options{})
	if err != nil {
		return err
	}
	defer control.Close()

	registry := postgres.NewRegistry(control, keyring, postgres.Options{}, postgres.Discard())

	conn, err := resolveSchool(ctx, registry, o.school)
	if err != nil {
		return err
	}

	s := &seeder{o: o, client: conn.Client, tenant: conn.Tenant, out: os.Stdout}
	if o.list {
		return s.print(ctx, blueprintPlans)
	}
	if err := s.seed(ctx, blueprintPlans); err != nil {
		return err
	}
	return s.print(ctx, blueprintPlans)
}

func resolveSchool(ctx context.Context, registry *postgres.Registry, ref string) (*postgres.TenantConn, error) {
	if id, err := uuid.Parse(ref); err == nil {
		return registry.Get(ctx, id)
	}
	return registry.GetByCode(ctx, ref)
}

type seeder struct {
	o      options
	client *tenantent.Client
	tenant *tenancy.Tenant
	out    io.Writer

	made  map[string]int
	warns []string
}

func (s *seeder) note(kind string, n int) {
	if s.made == nil {
		s.made = map[string]int{}
	}
	s.made[kind] += n
}

func (s *seeder) warn(format string, args ...any) {
	s.warns = append(s.warns, fmt.Sprintf(format, args...))
}

type refs struct {
	session  *tenantent.AcademicSession
	grades   map[string]uuid.UUID
	subjects map[string]uuid.UUID
}

func (s *seeder) seed(ctx context.Context, plans []blueprintPlan) error {
	if err := validate(plans); err != nil {
		return fmt.Errorf("the sample set does not add up, so nothing was written: %w", err)
	}
	fmt.Fprintf(s.out, "school %s (%s)\n", s.tenant.Code, s.tenant.Name)
	if s.o.dryRun {
		fmt.Fprintln(s.out, "dry run: nothing will be written")
	}

	found, err := s.resolve(ctx, plans)
	if err != nil {
		return err
	}
	for _, plan := range plans {
		if err := s.blueprint(ctx, found, plan); err != nil {
			return fmt.Errorf("%s v%d: %w", plan.code, plan.version, err)
		}
	}

	fmt.Fprintln(s.out)
	fmt.Fprintln(s.out, "made:")
	for _, kind := range []string{"blueprint", "blueprint_section", "blueprint_constraint"} {
		if n := s.made[kind]; n > 0 {
			fmt.Fprintf(s.out, "  %-21s %d\n", kind, n)
		}
	}
	if len(s.made) == 0 {
		fmt.Fprintln(s.out, "  nothing: every sample already existed")
	}
	if len(s.warns) > 0 {
		fmt.Fprintln(s.out)
		fmt.Fprintln(s.out, "left alone:")
		for _, w := range s.warns {
			fmt.Fprintf(s.out, "  %s\n", w)
		}
	}
	return nil
}

func (s *seeder) resolve(ctx context.Context, plans []blueprintPlan) (refs, error) {
	var out refs

	subjectCodes, gradeCodes, scoped := map[string]bool{}, map[string]bool{}, false
	for _, plan := range plans {
		subjectCodes[plan.subject] = true
		gradeCodes[plan.grade] = true
		if !plan.reusable {
			scoped = true
		}
	}

	subjects, err := s.client.Subject.Query().
		Where(entsubject.CodeIn(sorted(subjectCodes)...)).All(ctx)
	if err != nil {
		return out, err
	}
	out.subjects = map[string]uuid.UUID{}
	for _, row := range subjects {
		out.subjects[row.Code] = row.ID
	}
	if missing := absent(subjectCodes, out.subjects); len(missing) > 0 {
		return out, fmt.Errorf("%s has no subject %s; a blueprint is immutably bound to its "+
			"subject, so there is nothing to bind these to",
			s.tenant.Code, strings.Join(missing, ", "))
	}

	grades, err := s.client.GradeLevel.Query().
		Where(entgrade.CodeIn(sorted(gradeCodes)...)).All(ctx)
	if err != nil {
		return out, err
	}
	out.grades = map[string]uuid.UUID{}
	for _, row := range grades {
		out.grades[row.Code] = row.ID
	}
	if missing := absent(gradeCodes, out.grades); len(missing) > 0 {
		return out, fmt.Errorf("%s has no grade level %s; a blueprint is immutably bound to its "+
			"grade, so there is nothing to bind these to",
			s.tenant.Code, strings.Join(missing, ", "))
	}

	if !scoped {
		return out, nil
	}
	session, err := s.client.AcademicSession.Query().
		Where(entsession.Code(s.o.session)).Only(ctx)
	if err != nil {
		if tenantent.IsNotFound(err) {
			return out, fmt.Errorf("%s has no academic session %q; pass -session, or seed the "+
				"session first", s.tenant.Code, s.o.session)
		}
		return out, err
	}
	out.session = session
	return out, nil
}

func sorted(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for key := range set {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

func absent(wanted map[string]bool, found map[string]uuid.UUID) []string {
	var out []string
	for _, code := range sorted(wanted) {
		if _, ok := found[code]; !ok {
			out = append(out, code)
		}
	}
	return out
}

func (s *seeder) blueprint(ctx context.Context, found refs, plan blueprintPlan) error {
	row, err := s.client.Blueprint.Query().
		Where(entblueprint.Code(plan.code), entblueprint.Version(plan.version)).
		Only(ctx)
	if err != nil && !tenantent.IsNotFound(err) {
		return err
	}
	if err == nil {
		s.compare(row, plan)
		return s.sections(ctx, row, plan)
	}

	if s.o.dryRun {
		s.note("blueprint", 1)
		s.note("blueprint_section", len(plan.sections))
		for _, section := range plan.sections {
			s.note("blueprint_constraint", len(section.constraints))
		}
		return nil
	}

	create := s.client.Blueprint.Create().
		SetGradeLevelID(found.grades[plan.grade]).
		SetSubjectID(found.subjects[plan.subject]).
		SetCode(plan.code).
		SetVersion(plan.version).
		SetName(plan.name).
		SetTotalMarks(plan.total).
		SetDurationMinutes(plan.duration).
		SetStatus(plan.status).
		SetCognitiveScheme(plan.cognitive)
	if plan.description != "" {
		create = create.SetDescription(plan.description)
	}
	if !plan.reusable {
		create = create.SetAcademicSessionID(found.session.ID)
	}
	if plan.units != nil {
		create = create.SetUnitWeightage(plan.units)
	}

	row, err = create.Save(ctx)
	if err != nil {
		return err
	}
	s.note("blueprint", 1)
	return s.sections(ctx, row, plan)
}

func (s *seeder) compare(row *tenantent.Blueprint, plan blueprintPlan) {
	var differs []string
	if !near(row.TotalMarks, plan.total) {
		differs = append(differs, fmt.Sprintf("total_marks %g, sample says %g",
			row.TotalMarks, plan.total))
	}
	if row.DurationMinutes != plan.duration {
		differs = append(differs, fmt.Sprintf("duration_minutes %d, sample says %d",
			row.DurationMinutes, plan.duration))
	}
	if row.Status != plan.status {
		differs = append(differs, fmt.Sprintf("status %s, sample says %s",
			row.Status, plan.status))
	}
	if len(differs) > 0 {
		s.warn("%s v%d exists with %s", plan.code, plan.version, strings.Join(differs, "; "))
	}
}

func (s *seeder) sections(ctx context.Context, row *tenantent.Blueprint, plan blueprintPlan) error {
	existing, err := s.client.BlueprintSection.Query().
		Where(entbpsection.BlueprintID(row.ID)).All(ctx)
	if err != nil {
		return err
	}
	byCode := make(map[string]*tenantent.BlueprintSection, len(existing))
	for _, section := range existing {
		byCode[section.SectionCode] = section
	}

	for at, plans := range plan.sections {
		section, known := byCode[plans.code]
		if known {
			s.compareSection(plan, plans, section)
		} else {
			if s.o.dryRun {
				s.note("blueprint_section", 1)
				s.note("blueprint_constraint", len(plans.constraints))
				continue
			}
			create := s.client.BlueprintSection.Create().
				SetBlueprintID(row.ID).
				SetSectionCode(plans.code).
				SetName(plans.name).
				SetPosition(at + 1).
				SetQuestionCount(plans.questions).
				SetTotalMarks(plans.total).
				SetNillableMarksPerQuestion(plans.perQuestion).
				SetNillableDurationMinutes(plans.duration)
			section, err = create.Save(ctx)
			if err != nil {
				return fmt.Errorf("section %s: %w", plans.code, err)
			}
			s.note("blueprint_section", 1)
		}
		if err := s.constraints(ctx, section, plans); err != nil {
			return fmt.Errorf("section %s: %w", plans.code, err)
		}
	}
	return nil
}

func (s *seeder) compareSection(plan blueprintPlan, want sectionPlan,
	row *tenantent.BlueprintSection) {

	var differs []string
	if !near(row.TotalMarks, want.total) {
		differs = append(differs, fmt.Sprintf("total_marks %g, sample says %g",
			row.TotalMarks, want.total))
	}
	if row.QuestionCount != want.questions {
		differs = append(differs, fmt.Sprintf("question_count %d, sample says %d",
			row.QuestionCount, want.questions))
	}
	if len(differs) > 0 {
		s.warn("%s v%d section %s exists with %s",
			plan.code, plan.version, want.code, strings.Join(differs, "; "))
	}
}

func (s *seeder) constraints(ctx context.Context, section *tenantent.BlueprintSection,
	plan sectionPlan) error {

	if len(plan.constraints) == 0 {
		return nil
	}
	existing, err := s.client.BlueprintConstraint.Query().
		Where(entconstraint.BlueprintSectionID(section.ID)).All(ctx)
	if err != nil {
		return err
	}
	held := map[string]bool{}
	for _, row := range existing {
		held[constraintKey(row.ConstraintType, row.ValueJSON)] = true
	}

	for _, want := range plan.constraints {
		if held[constraintKey(want.kind, want.value())] {
			continue
		}
		if s.o.dryRun {
			s.note("blueprint_constraint", 1)
			continue
		}
		_, err := s.client.BlueprintConstraint.Create().
			SetBlueprintSectionID(section.ID).
			SetConstraintType(want.kind).
			SetValueJSON(want.value()).
			SetNillableMinValue(want.min).
			SetNillableMaxValue(want.max).
			Save(ctx)
		if err != nil {
			return fmt.Errorf("constraint %s: %w", want.key, err)
		}
		s.note("blueprint_constraint", 1)
	}
	return nil
}

func (c constraintPlan) value() shared.Metadata {
	out := shared.Metadata{"key": c.key, "measure": c.unit}
	if c.level != "" {
		out["level"] = c.level
	}
	if c.band != "" {
		out["band"] = c.band
	}
	if c.qtype != "" {
		out["question_type"] = c.qtype
	}
	if c.note != "" {
		out["note"] = c.note
	}
	switch c.kind {
	case entconstraint.ConstraintTypeTopic:
		out["unit_code"] = c.topic
	case entconstraint.ConstraintTypeOutcome:
		out["outcome_code"] = c.topic
	}
	return out
}

func constraintKey(kind entconstraint.ConstraintType, value shared.Metadata) string {
	key, _ := value["key"].(string)
	return string(kind) + "/" + key
}

func (s *seeder) print(ctx context.Context, plans []blueprintPlan) error {
	codes := map[string]bool{}
	for _, plan := range plans {
		codes[plan.code] = true
	}

	rows, err := s.client.Blueprint.Query().
		Where(entblueprint.CodeIn(sorted(codes)...)).
		Order(tenantent.Asc(entblueprint.FieldCode), tenantent.Asc(entblueprint.FieldVersion)).
		All(ctx)
	if err != nil {
		return err
	}

	sessions, err := s.client.AcademicSession.Query().All(ctx)
	if err != nil {
		return err
	}
	sessionOf := make(map[uuid.UUID]string, len(sessions))
	for _, row := range sessions {
		sessionOf[row.ID] = row.Code
	}

	fmt.Fprintln(s.out)
	fmt.Fprintf(s.out, "%-15s %3s %-9s %6s %5s %-11s %-10s %4s %4s %7s\n",
		"code", "ver", "status", "marks", "mins", "session", "weightage",
		"sect", "cons", "sums to")
	for _, row := range rows {
		session := "reusable"
		if row.AcademicSessionID != nil {
			session = sessionOf[*row.AcademicSessionID]
		}
		weightage := "null"
		if row.UnitWeightage != nil {
			weightage = fmt.Sprintf("%d units", len(row.UnitWeightage.Units))
		}

		sections, err := s.client.BlueprintSection.Query().
			Where(entbpsection.BlueprintID(row.ID)).All(ctx)
		if err != nil {
			return err
		}
		marks, constraints := 0.0, 0
		for _, section := range sections {
			marks += section.TotalMarks
			n, err := s.client.BlueprintConstraint.Query().
				Where(entconstraint.BlueprintSectionID(section.ID)).Count(ctx)
			if err != nil {
				return err
			}
			constraints += n
		}

		sums := fmt.Sprintf("%g", marks)
		if !near(marks, row.TotalMarks) {
			sums += " WRONG"
		}
		fmt.Fprintf(s.out, "%-15s %3d %-9s %6g %5d %-11s %-10s %4d %4d %7s\n",
			row.Code, row.Version, row.Status, row.TotalMarks, row.DurationMinutes,
			session, weightage, len(sections), constraints, sums)
	}
	fmt.Fprintf(s.out, "%d blueprints\n", len(rows))
	return nil
}
