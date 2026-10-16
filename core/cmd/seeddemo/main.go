package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"

	_ "time/tzdata"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const usage = `emerge-core seeddemo

Fills one school with a realistic year: classes, sections, subjects, teachers,
pupils and their guardians, then the period grid, the calendar, a published
timetable and a stretch of marked attendance. Safe to run repeatedly -- every
row is looked up before it is made, keyed on a stable code, so a second run
changes nothing and a partial run can be finished by running it again.

  seeddemo -school DPS-NGP

Flags:
  -school        school code or id, as it appears in the control plane
  -session       academic session code                  (default 2026-2027)
  -classes       how many grade levels                  (default 3)
  -sections      sections per grade level               (default 2)
  -teachers      how many teachers                      (default 10)
  -students      how many pupils, spread over sections  (default 100)
  -no-guardian   how many pupils get no guardian        (default 4)
  -timetable     build rooms, periods, bells, calendar, slots  (default true)
  -periods-per-week fill periods_per_week and minutes_per_week where unset (default true)
  -attendance    mark past session days from the timetable     (default true)
  -exams         class tests, a half-yearly, an annual, a practice test,
                 their sittings and the result schemes that compose them (default true)
  -calendar-from first calendar day, YYYY-MM-DD  (default: Monday, 8 weeks back)
  -calendar-weeks how many weeks of calendar            (default 16)
  -attendance-days how many past session days get marked (default 20)
  -cas-token     superadmin CAS token; mints a CAS identity per person
  -cas-password  password for every seeded identity  (default Emerge#Demo2026)
  -cas-url       CAS base url                           (default $CAS_BASE_URL)
  -dry-run       report what would be made, write nothing
  -backfill-cas  mint a CAS identity for every person already seeded, and stop

The timetable is one published version per period scheme, not one per section:
a slot carries the section, so the whole branch shares a version. Occurrences
are never written -- a date resolves through the calendar day, its bell
schedule and the weekly pattern, and only a departure from that pattern earns a
timetable_deviations row. Attendance is taken from those resolved occurrences,
so the register agrees with the calendar rather than repeating it.

Backfill is for the ordinary case: the school was seeded first without CAS, and
CAS identities are wanted afterwards. It matches on email, so a person who
already has the right identity is left alone.

Without -cas-token every person is given a random cas_user_id, which is enough
for emerge-core but means nobody can log in. Pass the token to have each person
created in CAS too, so the seeded school is one people can actually sign in to.

That token must be a superadmin's own USER token. A client_credentials service
token cannot call /v1/admin/*: those routes read a session id from the claims
and a service token deliberately has none.

Run the migrations first:

  go run ./cmd/migrate apply
`

type options struct {
	school      string
	session     string
	classes     int
	sections    int
	teachers    int
	students    int
	noGuardian  int
	withGrid    bool
	withMarks   bool
	withPeriods bool
	withExams   bool

	calendarFrom   string
	calendarWeeks  int
	attendanceDays int

	casToken    string
	casURL      string
	casPassword string
	apiURL      string
	apiToken    string
	casGroup    string
	dryRun      bool
	backfill    bool
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	config.LoadDotEnv()

	fs := flag.NewFlagSet("seeddemo", flag.ExitOnError)
	fs.Usage = func() { fmt.Fprint(os.Stderr, usage) }

	var o options
	fs.StringVar(&o.school, "school", "", "school code or id")
	fs.StringVar(&o.session, "session", "2026-2027", "academic session code")
	fs.IntVar(&o.classes, "classes", 3, "grade levels")
	fs.IntVar(&o.sections, "sections", 2, "sections per grade level")
	fs.IntVar(&o.teachers, "teachers", 10, "teachers")
	fs.IntVar(&o.students, "students", 100, "students")
	fs.IntVar(&o.noGuardian, "no-guardian", 4, "students left without a guardian")
	fs.BoolVar(&o.withGrid, "timetable", true, "build the period grid, calendar and published timetable")
	fs.BoolVar(&o.withMarks, "attendance", true, "mark attendance for past session days")
	fs.BoolVar(&o.withPeriods, "periods-per-week", true,
		"give every offering that has no periods_per_week or minutes_per_week a realistic one")
	fs.BoolVar(&o.withExams, "exams", true,
		"place a year of exams, their papers and sittings, and the result schemes they compose")
	fs.StringVar(&o.calendarFrom, "calendar-from", "", "first calendar day, YYYY-MM-DD")
	fs.IntVar(&o.calendarWeeks, "calendar-weeks", 16, "how many weeks of calendar days")
	fs.IntVar(&o.attendanceDays, "attendance-days", 20, "how many past session days get marked")
	fs.StringVar(&o.casToken, "cas-token", "", "superadmin CAS token")
	fs.StringVar(&o.casURL, "cas-url", os.Getenv("CAS_BASE_URL"), "CAS base url")
	fs.StringVar(&o.casPassword, "cas-password", "Emerge#Demo2026", "password given to every seeded CAS identity")
	fs.StringVar(&o.apiURL, "api-url", "", "emerge-core base url; people are provisioned through it instead of written directly")
	fs.StringVar(&o.apiToken, "api-token", "", "bearer token for -api-url, needs core.persons.write")
	fs.StringVar(&o.casGroup, "cas-group", "", "CAS group every provisioned person joins")
	fs.BoolVar(&o.dryRun, "dry-run", false, "write nothing")
	fs.BoolVar(&o.backfill, "backfill-cas", false, "give existing seeded people a CAS identity and stop")
	if err := fs.Parse(os.Args[1:]); err != nil {
		return err
	}
	if o.school == "" {
		fs.Usage()
		return errors.New("-school is required")
	}
	if o.students < o.classes*o.sections {
		return fmt.Errorf("need at least one pupil per section: %d pupils, %d sections",
			o.students, o.classes*o.sections)
	}
	if o.noGuardian > o.students {
		return errors.New("-no-guardian cannot exceed -students")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
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

	s := &seeder{
		o: o, client: conn.Client, tenant: conn.Tenant,
		cas: newCASClient(o.casURL, o.casToken, o.casPassword),
		api: newAPIClient(o.apiURL, o.apiToken, o.school, o.casGroup, o.casPassword),
	}
	if o.backfill {
		return s.backfillCAS(ctx)
	}
	return s.seed(ctx)
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
	cas    *casClient
	api    *apiClient

	made map[string]int
}

func (s *seeder) note(kind string, n int) {
	if s.made == nil {
		s.made = map[string]int{}
	}
	s.made[kind] += n
}

func (s *seeder) seed(ctx context.Context) error {
	fmt.Printf("school %s (%s)\n", s.tenant.Code, s.tenant.Name)
	if s.o.dryRun {
		fmt.Println("dry run: nothing will be written")
	}

	branch, err := s.branch(ctx)
	if err != nil {
		return fmt.Errorf("branch: %w", err)
	}
	session, err := s.session(ctx)
	if err != nil {
		return fmt.Errorf("session: %w", err)
	}
	grades, err := s.grades(ctx)
	if err != nil {
		return fmt.Errorf("grade levels: %w", err)
	}
	sections, err := s.sections(ctx, session, branch, grades)
	if err != nil {
		return fmt.Errorf("sections: %w", err)
	}
	subjects, err := s.subjects(ctx)
	if err != nil {
		return fmt.Errorf("subjects: %w", err)
	}
	offerings, err := s.offerings(ctx, session, sections, subjects)
	if err != nil {
		return fmt.Errorf("offerings: %w", err)
	}
	teachers, err := s.teachers(ctx)
	if err != nil {
		return fmt.Errorf("teachers: %w", err)
	}
	if err := s.assignments(ctx, session, sections, offerings, teachers); err != nil {
		return fmt.Errorf("teacher assignments: %w", err)
	}
	if err := s.students(ctx, session, sections); err != nil {
		return fmt.Errorf("students: %w", err)
	}
	if err := s.subjectEnrollments(ctx, session, offerings); err != nil {
		return fmt.Errorf("subject enrollments: %w", err)
	}

	a := &academics{
		branch: branch, session: session, grades: grades, sections: sections,
		subjects: subjects, offerings: offerings, teachers: teachers,
	}
	if s.o.withGrid {
		if err := s.timetable(ctx, a); err != nil {
			return fmt.Errorf("timetable: %w", err)
		}
	}
	if err := s.periodsPerWeek(ctx, a); err != nil {
		return fmt.Errorf("periods per week: %w", err)
	}
	if err := s.curriculum(ctx, a); err != nil {
		return fmt.Errorf("curriculum: %w", err)
	}
	if s.o.withExams {
		if err := s.exams(ctx, a); err != nil {
			return fmt.Errorf("exams: %w", err)
		}
	}
	if s.o.withMarks {
		if err := s.attendance(ctx, a); err != nil {
			return fmt.Errorf("attendance: %w", err)
		}
	}

	fmt.Println()
	fmt.Println("made:")
	for _, k := range []string{"branch", "session", "grade_level", "section", "subject",
		"offering", "person", "staff", "teacher", "assignment", "student", "enrollment",
		"guardian", "guardian_link", "subject_enrollment", "cas_user",
		"room", "period_scheme", "scheme_grade", "period", "bell_schedule", "bell_period",
		"calendar_day", "day_schedule", "timetable", "slot", "elective_choice", "deviation",
		"attendance_period", "attendance_day", "periods_per_week", "minutes_per_week",
		"grading_scheme", "offering_grading", "curriculum", "curriculum_node",
		"exam", "exam_subject", "exam_sitting", "homework", "homework_target",
		"result_scheme", "result_component", "result_component_exam",
		"result_component_assignment", "result_scheme_activated", "offering_result_scheme"} {
		if n := s.made[k]; n > 0 {
			fmt.Printf("  %-14s %d\n", k, n)
		}
	}
	if len(s.made) == 0 {
		fmt.Println("  nothing: everything already existed")
	}
	return nil
}
