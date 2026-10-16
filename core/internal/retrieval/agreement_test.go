package retrieval

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entschema "github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type agreementRow struct {
	name string
	id   uuid.UUID
	item Item
}

type agreementViewer struct {
	name string
	v    *access.Viewer
}

type agreementCase struct {
	name string
	d    authorization.Decision
}

type agreementWorld struct {
	t      *testing.T
	ctx    context.Context
	client *tenantent.Client

	schoolID uuid.UUID

	rows     []agreementRow
	ids      []uuid.UUID
	covered  map[entcontent.Audience]int
	statuses []entcontent.Status
	states   map[entcontent.Status]int

	viewers []agreementViewer
	cases   []agreementCase

	homeSectionCode string
	homeGradeCode   string
}

type agreementReach struct {
	name  string
	reach authorization.Reach
	has   bool
}

type agreementPin struct {
	name   string
	groups [][]authorization.Constraint
}

func agreementAudienceValues(t *testing.T) []entcontent.Audience {
	t.Helper()

	var out []entcontent.Audience
	for _, f := range (entschema.ContentItem{}).Fields() {
		d := f.Descriptor()
		if d.Name != entcontent.FieldAudience {
			continue
		}
		for _, e := range d.Enums {
			a := entcontent.Audience(e.V)
			if err := entcontent.AudienceValidator(a); err != nil {
				t.Fatalf("the content item schema declares audience %q but the generated validator "+
					"rejects it: %v", e.V, err)
			}
			out = append(out, a)
		}
	}
	if len(out) == 0 {
		t.Fatal("the content item schema declares no audience enum, so this matrix would cover no row shape")
	}
	return out
}

func agreementStatusValues(t *testing.T) []entcontent.Status {
	t.Helper()

	var out []entcontent.Status
	for _, f := range (entschema.ContentItem{}).Fields() {
		d := f.Descriptor()
		if d.Name != entcontent.FieldStatus {
			continue
		}
		for _, e := range d.Enums {
			st := entcontent.Status(e.V)
			if err := entcontent.StatusValidator(st); err != nil {
				t.Fatalf("the content item schema declares status %q but the generated validator "+
					"rejects it: %v", e.V, err)
			}
			out = append(out, st)
		}
	}
	if len(out) == 0 {
		t.Fatal("the content item schema declares no status enum, so this matrix would cover no row state")
	}
	return out
}

func agreementReaches() []agreementReach {
	return []agreementReach{
		{"no_reach", "", false},
		{"tenant", authorization.ReachTenant, true},
		{"self", authorization.ReachSelf, true},
		{"guardian_ward", authorization.ReachGuardianWard, true},
		{"teacher_assignment", authorization.ReachTeacherAssignment, true},
		{"unknown_reach", authorization.Reach("branch_head"), true},
	}
}

func agreementPinKinds(homeSection, foreignSection, homeGrade string) []agreementPin {
	return []agreementPin{
		{"unpinned", nil},
		{"pin_home_section", [][]authorization.Constraint{{{Field: "section", Values: []string{homeSection}}}}},
		{"pin_foreign_section", [][]authorization.Constraint{{{Field: "section", Values: []string{foreignSection}}}}},
		{"pin_home_grade", [][]authorization.Constraint{{{Field: "grade_level", Values: []string{homeGrade}}}}},
		{"pin_empty_group", [][]authorization.Constraint{{}}},
		{"pin_unsatisfied", [][]authorization.Constraint{{{Field: "section"}}}},
		{"pin_unknown_field", [][]authorization.Constraint{{{Field: "house", Values: []string{"blue"}}}}},
		{"pin_misspelled_field", agreementMisspelledPin(homeSection)},
	}
}

func agreementMisspelledPin(homeSection string) [][]authorization.Constraint {
	return [][]authorization.Constraint{{{Field: "section_id", Values: []string{homeSection}}}}
}

var agreementRefusingPins = []string{
	"pin_home_section",
	"pin_foreign_section",
	"pin_home_grade",
	"pin_empty_group",
}

var agreementRefusingViewers = map[string][]string{
	"tenant":             {"class_teacher", "subject_teacher", "pupil", "guardian", "pupil_and_guardian", "stranger"},
	"teacher_assignment": {"class_teacher", "subject_teacher"},
	"no_reach":           {"class_teacher", "subject_teacher"},
}

func agreementExpectedRefusals() map[string]bool {
	out := map[string]bool{}
	for reach, viewers := range agreementRefusingViewers {
		for _, viewer := range viewers {
			for _, pin := range agreementRefusingPins {
				out[viewer+" / "+reach+"+"+pin] = true
			}
		}
	}
	return out
}

func agreementHolds(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func agreementSameID(got, want *uuid.UUID) bool {
	switch {
	case got == nil && want == nil:
		return true
	case got == nil || want == nil:
		return false
	default:
		return *got == *want
	}
}

func (w *agreementWorld) place(name string, audience entcontent.Audience, anchor, owner uuid.UUID) {
	w.t.Helper()

	for _, status := range w.statuses {
		w.placeOne(name+"/"+string(status), audience, anchor, owner, status)
	}
}

func (w *agreementWorld) placeOne(name string, audience entcontent.Audience, anchor, owner uuid.UUID, status entcontent.Status) {
	w.t.Helper()

	create := w.client.ContentItem.Create().
		SetTitle("Agreement " + name).
		SetAudience(audience).
		SetStatus(status).
		SetOwnerPersonID(owner)

	item := Item{SchoolID: w.schoolID, Audience: audience, Status: status, OwnerPersonID: owner}

	switch audience {
	case entcontent.AudienceSchool, entcontent.AudienceOwner:
		if anchor != uuid.Nil {
			w.t.Fatalf("%s: audience %q carries no anchor column", name, audience)
		}
	case entcontent.AudienceGrade:
		create = create.SetGradeLevelID(anchor)
		item.GradeLevelID = &anchor
	case entcontent.AudienceSection:
		create = create.SetSectionID(anchor)
		item.SectionID = &anchor
	case entcontent.AudienceOffering:
		create = create.SetSubjectOfferingID(anchor)
		item.SubjectOfferingID = &anchor
	default:
		w.t.Fatalf("audience %q has no anchor column in this test. The enum grew and the matrix would "+
			"have skipped the new row shape in silence; add it here and to the fixture", audience)
	}

	row, err := create.Save(w.ctx)
	if err != nil {
		w.t.Fatalf("%s: could not write a %q content item: %v", name, audience, err)
	}

	w.rows = append(w.rows, agreementRow{name: name, id: row.ID, item: item})
	w.ids = append(w.ids, row.ID)
	w.covered[audience]++
	w.states[status]++
}

func (w *agreementWorld) rowNamed(name string) agreementRow {
	w.t.Helper()

	for _, row := range w.rows {
		if row.name == name {
			return row
		}
	}
	w.t.Fatalf("the fixture holds no row named %q", name)
	return agreementRow{}
}

func (w *agreementWorld) viewerNamed(name string) *access.Viewer {
	w.t.Helper()

	for _, av := range w.viewers {
		if av.name == name {
			return av.v
		}
	}
	w.t.Fatalf("the fixture holds no viewer named %q", name)
	return nil
}

func (w *agreementWorld) confirmRowsMatchPostgres() {
	w.t.Helper()

	rows, err := w.client.ContentItem.Query().Where(entcontent.IDIn(w.ids...)).All(w.ctx)
	if err != nil {
		w.t.Fatalf("could not read the fixture rows back: %v", err)
	}
	if len(rows) != len(w.rows) {
		w.t.Fatalf("wrote %d fixture rows, read %d back", len(w.rows), len(rows))
	}

	stored := make(map[uuid.UUID]*tenantent.ContentItem, len(rows))
	for _, row := range rows {
		stored[row.ID] = row
	}

	for _, row := range w.rows {
		db, ok := stored[row.id]
		if !ok {
			w.t.Fatalf("%s: the row is not in the tenant database", row.name)
		}
		if db.Audience != row.item.Audience {
			w.t.Fatalf("%s: Postgres holds audience %q, the label input says %q",
				row.name, db.Audience, row.item.Audience)
		}
		if db.Status != row.item.Status {
			w.t.Fatalf("%s: Postgres holds status %q, the label input says %q. The predicate would be "+
				"answering about a row the labels describe differently", row.name, db.Status, row.item.Status)
		}
		if !agreementSameID(db.GradeLevelID, row.item.GradeLevelID) ||
			!agreementSameID(db.SectionID, row.item.SectionID) ||
			!agreementSameID(db.SubjectOfferingID, row.item.SubjectOfferingID) ||
			db.OwnerPersonID != row.item.OwnerPersonID {
			w.t.Fatalf("%s: the anchors in Postgres (grade %v, section %v, offering %v, owner %v) are not "+
				"the anchors handed to LabelFor (grade %v, section %v, offering %v, owner %v); the two "+
				"sides would be answering about different rows",
				row.name, db.GradeLevelID, db.SectionID, db.SubjectOfferingID, db.OwnerPersonID,
				row.item.GradeLevelID, row.item.SectionID, row.item.SubjectOfferingID, row.item.OwnerPersonID)
		}
	}
}

func (w *agreementWorld) resolve(name string, cas uuid.UUID, unrestricted bool) *access.Viewer {
	w.t.Helper()

	v, err := access.Resolve(w.ctx, &authorization.Subject{CASUserID: cas}, unrestricted)
	if err != nil {
		w.t.Fatalf("%s: the viewer could not be resolved against the tenant database: %v", name, err)
	}
	w.viewers = append(w.viewers, agreementViewer{name: name, v: v})
	return v
}

func newAgreementWorld(t *testing.T) *agreementWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	w := &agreementWorld{
		t:        t,
		client:   client,
		schoolID: uuid.New(),
		covered:  map[entcontent.Audience]int{},
		statuses: agreementStatusValues(t),
		states:   map[entcontent.Status]int{},
	}
	w.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	today := time.Now().UTC()
	branch := client.Branch.Create().
		SetName("Agreement Branch " + tag).
		SetCode("ABR-" + tag).
		SaveX(ctx)
	session := client.AcademicSession.Create().
		SetName("Agreement Session " + tag).
		SetCode("ASE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)

	gradeA := client.GradeLevel.Create().
		SetName("Agreement Grade A " + tag).
		SetCode("AGA-" + tag).
		SetSequence(1).
		SaveX(ctx)
	gradeB := client.GradeLevel.Create().
		SetName("Agreement Grade B " + tag).
		SetCode("AGB-" + tag).
		SetSequence(2).
		SaveX(ctx)

	newSection := func(name, code string, grade uuid.UUID) *tenantent.Section {
		return client.Section.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetGradeLevelID(grade).
			SetName(name).
			SetCode(code + "-" + tag).
			SaveX(ctx)
	}
	sectionA1 := newSection("A1", "ASA1", gradeA.ID)
	sectionA2 := newSection("A2", "ASA2", gradeA.ID)
	sectionB1 := newSection("B1", "ASB1", gradeB.ID)

	subject := client.Subject.Create().
		SetName("Agreement Subject " + tag).
		SetCode("ASU-" + tag).
		SaveX(ctx)

	newOffering := func(section uuid.UUID) *tenantent.SubjectOffering {
		return client.SubjectOffering.Create().
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetSubjectID(subject.ID).
			SaveX(ctx)
	}
	offeringA1 := newOffering(sectionA1.ID)
	offeringA2 := newOffering(sectionA2.ID)
	offeringB1 := newOffering(sectionB1.ID)

	type agreementPerson struct {
		id  uuid.UUID
		cas uuid.UUID
	}
	newPerson := func(label string) agreementPerson {
		cas := uuid.New()
		row := client.Person.Create().
			SetCasUserID(cas).
			SetFirstName("Agreement").
			SetDisplayName(label + " " + tag).
			SaveX(ctx)
		return agreementPerson{id: row.ID, cas: cas}
	}

	classPerson := newPerson("Class Teacher")
	subjectPerson := newPerson("Subject Teacher")
	pupilPerson := newPerson("Pupil")
	guardianPerson := newPerson("Guardian")
	bothPerson := newPerson("Pupil And Guardian")
	wardPerson := newPerson("Ward")
	secondWardPerson := newPerson("Second Ward")
	authorPerson := newPerson("Author")

	newTeacher := func(person agreementPerson, code string) uuid.UUID {
		staff := client.Staff.Create().
			SetPersonID(person.id).
			SetEmployeeCode(code + "-" + tag).
			SaveX(ctx)
		return client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx).ID
	}
	classTeacher := newTeacher(classPerson, "AEC")
	subjectTeacher := newTeacher(subjectPerson, "AES")

	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(classTeacher).
		SetSectionID(sectionA1.ID).
		SetRoleType("class_teacher").
		SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(subjectTeacher).
		SetSectionID(sectionA2.ID).
		SetSubjectOfferingID(offeringA2.ID).
		SetRoleType("subject_teacher").
		SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(subjectTeacher).
		SetSectionID(sectionB1.ID).
		SetSubjectOfferingID(offeringB1.ID).
		SetRoleType("subject_teacher").
		SaveX(ctx)

	newStudent := func(person agreementPerson, code string, section, offering uuid.UUID) uuid.UUID {
		student := client.Student.Create().
			SetPersonID(person.id).
			SetAdmissionNumber(code + "-" + tag).
			SaveX(ctx)
		enrollment := client.StudentEnrollment.Create().
			SetStudentID(student.ID).
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetEnrollmentDate(today).
			SaveX(ctx)
		client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrollment.ID).
			SetSubjectOfferingID(offering).
			SetStudentID(student.ID).
			SetAcademicSessionID(session.ID).
			SaveX(ctx)
		return student.ID
	}

	newStudent(pupilPerson, "AAP", sectionA1.ID, offeringA1.ID)
	wardStudent := newStudent(wardPerson, "AAW", sectionA2.ID, offeringA2.ID)
	newStudent(bothPerson, "AAB", sectionB1.ID, offeringB1.ID)
	secondWardStudent := newStudent(secondWardPerson, "AAS", sectionA1.ID, offeringA1.ID)

	newGuardian := func(person agreementPerson, student uuid.UUID) {
		guardian := client.Guardian.Create().SetPersonID(person.id).SaveX(ctx)
		client.StudentGuardian.Create().
			SetStudentID(student).
			SetGuardianID(guardian.ID).
			SetRelationshipType("mother").
			SaveX(ctx)
	}
	newGuardian(guardianPerson, wardStudent)
	newGuardian(bothPerson, secondWardStudent)

	w.place("school_wide", entcontent.AudienceSchool, uuid.Nil, authorPerson.id)
	w.place("grade_A", entcontent.AudienceGrade, gradeA.ID, authorPerson.id)
	w.place("grade_B", entcontent.AudienceGrade, gradeB.ID, authorPerson.id)
	w.place("section_A1", entcontent.AudienceSection, sectionA1.ID, authorPerson.id)
	w.place("section_A2", entcontent.AudienceSection, sectionA2.ID, authorPerson.id)
	w.place("section_B1", entcontent.AudienceSection, sectionB1.ID, authorPerson.id)
	w.place("offering_A1", entcontent.AudienceOffering, offeringA1.ID, authorPerson.id)
	w.place("offering_A2", entcontent.AudienceOffering, offeringA2.ID, authorPerson.id)
	w.place("offering_B1", entcontent.AudienceOffering, offeringB1.ID, authorPerson.id)
	w.place("owned_by_class_teacher", entcontent.AudienceOwner, uuid.Nil, classPerson.id)
	w.place("owned_by_subject_teacher", entcontent.AudienceOwner, uuid.Nil, subjectPerson.id)
	w.place("owned_by_pupil", entcontent.AudienceOwner, uuid.Nil, pupilPerson.id)
	w.place("owned_by_guardian", entcontent.AudienceOwner, uuid.Nil, guardianPerson.id)
	w.place("owned_by_pupil_and_guardian", entcontent.AudienceOwner, uuid.Nil, bothPerson.id)
	w.place("owned_by_author", entcontent.AudienceOwner, uuid.Nil, authorPerson.id)
	w.place("school_by_class_teacher", entcontent.AudienceSchool, uuid.Nil, classPerson.id)

	for _, audience := range agreementAudienceValues(t) {
		if w.covered[audience] == 0 {
			t.Fatalf("the audience enum declares %q and this fixture has no row for it, so the matrix "+
				"would report agreement it never tested", audience)
		}
	}
	for _, status := range w.statuses {
		if w.states[status] == 0 {
			t.Fatalf("the status enum declares %q and this fixture has no row in it, so the matrix "+
				"would report agreement it never tested", status)
		}
	}

	w.confirmRowsMatchPostgres()

	classViewer := w.resolve("class_teacher", classPerson.cas, false)
	subjectViewer := w.resolve("subject_teacher", subjectPerson.cas, false)
	pupilViewer := w.resolve("pupil", pupilPerson.cas, false)
	guardianViewer := w.resolve("guardian", guardianPerson.cas, false)
	bothViewer := w.resolve("pupil_and_guardian", bothPerson.cas, false)
	openViewer := w.resolve("unrestricted", authorPerson.cas, true)
	strangerViewer := w.resolve("stranger", uuid.New(), false)

	switch {
	case classViewer.PersonID == nil || !agreementHolds(classViewer.SectionIDs, sectionA1.ID):
		t.Fatalf("the class teacher must hold section A1; the viewer holds %v", classViewer.SectionIDs)
	case len(classViewer.SubjectOfferingIDs) != 0:
		t.Fatalf("the class teacher must hold no offering of their own; the viewer holds %v",
			classViewer.SubjectOfferingIDs)
	case classViewer.SectionGradeIDs[sectionA1.ID] != gradeA.ID:
		t.Fatal("the class teacher's section must carry grade A, otherwise every scope set below is a refusal")
	case len(subjectViewer.SectionIDs) != 0:
		t.Fatalf("the subject teacher must hold no section; the viewer holds %v", subjectViewer.SectionIDs)
	case !agreementHolds(subjectViewer.SubjectOfferingIDs, offeringA2.ID),
		!agreementHolds(subjectViewer.SubjectOfferingIDs, offeringB1.ID):
		t.Fatalf("the subject teacher must hold offerings A2 and B1; the viewer holds %v",
			subjectViewer.SubjectOfferingIDs)
	case len(pupilViewer.StudentIDs) == 0 || !agreementHolds(pupilViewer.EnrolledOfferingIDs, offeringA1.ID):
		t.Fatalf("the pupil must be enrolled in offering A1; the viewer holds %v",
			pupilViewer.EnrolledOfferingIDs)
	case len(pupilViewer.WardOfferingIDs) != 0:
		t.Fatalf("the pupil must have no wards; the viewer holds %v", pupilViewer.WardOfferingIDs)
	case guardianViewer.GuardianID == nil || !agreementHolds(guardianViewer.WardOfferingIDs, offeringA2.ID):
		t.Fatalf("the guardian must reach offering A2 through their ward; the viewer holds %v",
			guardianViewer.WardOfferingIDs)
	case len(guardianViewer.EnrolledOfferingIDs) != 0:
		t.Fatalf("the guardian must not be enrolled themselves; the viewer holds %v",
			guardianViewer.EnrolledOfferingIDs)
	case !agreementHolds(bothViewer.EnrolledOfferingIDs, offeringB1.ID),
		!agreementHolds(bothViewer.WardOfferingIDs, offeringA1.ID):
		t.Fatalf("the pupil-and-guardian must be enrolled in B1 and reach A1 through a ward; the viewer "+
			"holds own %v and ward %v", bothViewer.EnrolledOfferingIDs, bothViewer.WardOfferingIDs)
	case !openViewer.Unrestricted:
		t.Fatal("the unrestricted viewer resolved as restricted")
	case strangerViewer.PersonID != nil || strangerViewer.Unrestricted:
		t.Fatalf("the stranger must resolve to no person and stay restricted; got person %v unrestricted %v",
			strangerViewer.PersonID, strangerViewer.Unrestricted)
	}

	declared := map[authorization.Reach]bool{}
	for _, r := range authorization.AllReaches {
		declared[r] = true
	}
	for _, r := range agreementReaches() {
		delete(declared, r.reach)
	}
	if len(declared) > 0 {
		t.Fatalf("the authorization package declares reaches this matrix never exercises: %v", declared)
	}

	w.homeSectionCode = sectionA1.Code
	w.homeGradeCode = gradeA.Code

	for _, reach := range agreementReaches() {
		for _, pin := range agreementPinKinds(sectionA1.Code, sectionB1.Code, gradeA.Code) {
			w.cases = append(w.cases, agreementCase{
				name: reach.name + "+" + pin.name,
				d: authorization.Decision{
					Allowed:     true,
					Rule:        reach.name + "+" + pin.name,
					Reach:       reach.reach,
					HasReach:    reach.has,
					Constraints: pin.groups,
				},
			})
		}
	}

	db.Forget()
	return w
}

func (w *agreementWorld) admittedByPredicate(v *access.Viewer, d authorization.Decision) map[uuid.UUID]bool {
	w.t.Helper()

	ids, err := w.client.ContentItem.Query().
		Where(entcontent.IDIn(w.ids...), access.LibraryItemsFor(v, d)).
		IDs(w.ctx)
	if err != nil {
		w.t.Fatalf("Postgres refused the library predicate: %v", err)
	}

	out := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		out[id] = true
	}
	return out
}

func (w *agreementWorld) admittedByWritePredicate(v *access.Viewer, d authorization.Decision) map[uuid.UUID]bool {
	w.t.Helper()

	ids, err := w.client.ContentItem.Query().
		Where(entcontent.IDIn(w.ids...), access.LibraryItemsWritableBy(v, d)).
		IDs(w.ctx)
	if err != nil {
		w.t.Fatalf("Postgres refused the library write predicate: %v", err)
	}

	out := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		out[id] = true
	}
	return out
}

func (w *agreementWorld) admittedByLabels(s Scopes, row agreementRow) bool {
	w.t.Helper()

	labels, err := LabelsFor(row.item)
	if row.item.Status != entcontent.StatusPublished {
		if !errors.Is(err, ErrNotPublished) {
			w.t.Fatalf("%s: LabelsFor stamped a %q row %v with %v. An unpublished item must not be in "+
				"the retrieval corpus at all, so the two sides cannot agree by both admitting it",
				row.name, row.item.Status, labels, err)
		}
		return false
	}
	if err != nil {
		w.t.Fatalf("%s: a row Postgres accepted cannot be stamped: %v", row.name, err)
	}
	for _, label := range labels {
		if s.Contains(label) {
			return true
		}
	}
	return false
}

func TestTheScopeLabelsAndTheLibraryPredicateAdmitTheSameRows(t *testing.T) {
	w := newAgreementWorld(t)

	expected := agreementExpectedRefusals()
	seen := map[string]bool{}

	var wider, narrower []string
	triples := 0
	refused := 0
	admits := map[string]int{}
	denials := map[string]int{}
	answering := map[string]int{}
	withheld := map[string]int{}

	for _, av := range w.viewers {
		for _, ac := range w.cases {
			key := av.name + " / " + ac.name

			scopes, err := ScopesFor(av.v, ac.d, w.schoolID)
			if err != nil {
				if !errors.Is(err, ErrUnresolved) {
					t.Errorf("%s: ScopesFor failed with an error the transport does not recognise: %v", key, err)
				}
				if !errors.Is(err, ErrPinnedScopeUnresolved) {
					t.Errorf("%s: expected a pinned-scope refusal, got %v", key, err)
				}
				if scopes.Resolved() || scopes.Unrestricted() {
					t.Errorf("%s: a refusal handed back a usable scope set", key)
				}
				seen[key] = true
			}

			admitted := w.admittedByPredicate(av.v, ac.d)

			for _, row := range w.rows {
				triples++

				byLabel := err == nil && w.admittedByLabels(scopes, row)
				byPredicate := admitted[row.id]

				switch {
				case byLabel && byPredicate:
					admits[row.name]++
					answering[av.name]++
				case !byLabel && !byPredicate:
					denials[row.name]++
				case byLabel:
					wider = append(wider, fmt.Sprintf("%s / %s: the label set admits the row, "+
						"LibraryItemsFor does not", key, row.name))
				case err != nil:
					refused++
				case row.item.Status != entcontent.StatusPublished:
					withheld[row.name]++
				default:
					narrower = append(narrower, fmt.Sprintf("%s / %s: LibraryItemsFor admits the row, "+
						"the label set does not", key, row.name))
				}
			}
		}
	}

	sort.Strings(wider)
	sort.Strings(narrower)

	if len(wider) > 0 {
		t.Errorf("the retrieval engine would serve %d (viewer, decision, row) triples that emerge-core "+
			"refuses. This is the 9A/9B requirement failing:\n%s", len(wider), strings.Join(wider, "\n"))
	}
	if len(narrower) > 0 {
		t.Errorf("emerge-core serves %d (viewer, decision, row) triples that the retrieval engine would "+
			"not, and no refusal was reported, so the loss is silent:\n%s",
			len(narrower), strings.Join(narrower, "\n"))
	}

	for key := range seen {
		if !expected[key] {
			t.Errorf("%s: ScopesFor refuses to answer and this test did not expect it to. Either the "+
				"resolver got narrower or the fixture changed shape", key)
		}
	}
	for key := range expected {
		if !seen[key] {
			t.Errorf("%s: ScopesFor was expected to refuse and answered instead. A refusal that turned "+
				"into a grant is the dangerous direction", key)
		}
	}

	for _, row := range w.rows {
		published := row.item.Status == entcontent.StatusPublished

		if published && admits[row.name] == 0 {
			t.Errorf("%s was never admitted by either side across the whole matrix; agreement on a row "+
				"nobody can read is agreement about nothing", row.name)
		}
		if !published && admits[row.name] != 0 {
			t.Errorf("%s is not published and the label side admitted it %d times; an unpublished item "+
				"must not be in the corpus", row.name, admits[row.name])
		}
		if !published && withheld[row.name] == 0 {
			t.Errorf("%s is not published and no viewer was ever served it by LibraryItemsFor while the "+
				"label side withheld it. That divergence is the intended one -- an owner reads their own "+
				"draft on the human path and it is still absent from the corpus -- and a matrix that "+
				"never sees it is not recording it", row.name)
		}
		if denials[row.name] == 0 {
			t.Errorf("%s was admitted to every viewer under every decision, so no refusal of it was "+
				"ever compared", row.name)
		}
	}
	for _, av := range w.viewers {
		if answering[av.name] == 0 {
			t.Errorf("%s was never admitted a single row by both sides; that viewer contributed only "+
				"mutual denials and cannot distinguish a working policy from a broken one", av.name)
		}
	}

	want := len(w.viewers) * len(w.cases) * len(w.rows)
	if triples != want {
		t.Fatalf("the matrix checked %d triples, the fixture describes %d", triples, want)
	}

	t.Logf("checked %d (viewer, decision, row) triples: %d viewers x %d decisions x %d rows in %d "+
		"statuses. %d of the %d (viewer, decision) pairs were refusals. Both sides admitted %d triples "+
		"and denied %d; %d were admitted by the predicate while the label side refused to answer, and "+
		"%d were an owner reading an unpublished row the corpus deliberately does not hold",
		triples, len(w.viewers), len(w.cases), len(w.rows), len(w.statuses), len(seen),
		len(w.viewers)*len(w.cases), agreementTotal(admits), agreementTotal(denials), refused,
		agreementTotal(withheld))
}

func agreementTotal(counts map[string]int) int {
	sum := 0
	for _, n := range counts {
		sum += n
	}
	return sum
}

func TestNoPinnedDecisionEverWidensTheLabelSetPastThePredicate(t *testing.T) {
	w := newAgreementWorld(t)

	pinned := 0
	var wider []string

	for _, av := range w.viewers {
		for _, ac := range w.cases {
			if len(ac.d.Constraints) == 0 {
				continue
			}
			pinned++

			scopes, err := ScopesFor(av.v, ac.d, w.schoolID)
			if err != nil {
				continue
			}
			admitted := w.admittedByPredicate(av.v, ac.d)

			for _, row := range w.rows {
				if w.admittedByLabels(scopes, row) && !admitted[row.id] {
					wider = append(wider, fmt.Sprintf("%s / %s / %s", av.name, ac.name, row.name))
				}
			}
		}
	}

	if pinned == 0 {
		t.Fatal("no pinned decision was exercised, so nothing here constrains the pinned path")
	}
	sort.Strings(wider)
	if len(wider) > 0 {
		t.Fatalf("a pinned grant produced a label set wider than the predicate it must mirror. "+
			"LibraryItemsFor ANDs against section and grade codes, which labels cannot express, so any "+
			"label the resolver keeps here is a grant nobody checked:\n%s", strings.Join(wider, "\n"))
	}

	t.Logf("%d pinned (viewer, decision) pairs were checked against Postgres", pinned)
}

func TestASubjectTeachersOnlyTieToAGradeIsNotAGrant(t *testing.T) {
	w := newAgreementWorld(t)

	var subject *access.Viewer
	for _, av := range w.viewers {
		if av.name == "subject_teacher" {
			subject = av.v
		}
	}
	if subject == nil {
		t.Fatal("the fixture has no subject teacher")
	}

	d := authorization.Decision{Allowed: true, Reach: authorization.ReachTeacherAssignment, HasReach: true}

	scopes, err := ScopesFor(subject, d, w.schoolID)
	if err != nil {
		t.Fatalf("ScopesFor: %v", err)
	}
	admitted := w.admittedByPredicate(subject, d)

	grades := 0
	for _, row := range w.rows {
		if row.item.Audience != entcontent.AudienceGrade {
			continue
		}
		grades++

		byLabel := w.admittedByLabels(scopes, row)
		byPredicate := admitted[row.id]
		if byLabel != byPredicate {
			t.Fatalf("%s: labels say %v, Postgres says %v", row.name, byLabel, byPredicate)
		}
		if byLabel {
			t.Fatalf("%s: a teacher whose only tie to the grade is a subject offering was granted the "+
				"grade. docs/LIBRARY-ACCESS-DESIGN.md 4.1 asks for exactly that; both implementations "+
				"refuse it today and the code is the spec. If this now passes, check that both sides "+
				"were changed and not just one", row.name)
		}
	}
	if grades == 0 {
		t.Fatal("the fixture holds no grade-audience row, so this proved nothing")
	}
}

func TestAPinOnAFieldTheVocabularyDoesNotKnowDeniesOnBothSidesOnPurpose(t *testing.T) {
	if authorization.RowField("section") != true || authorization.RowField("grade_level") != true {
		t.Fatalf("this test assumes the pin vocabulary is section and grade_level; it is now %v",
			authorization.RowFields())
	}
	if authorization.RowField("section_id") {
		t.Fatal("section_id is now a real pin field, so it no longer stands in for an author's typo; " +
			"pick a field the vocabulary still does not know")
	}

	w := newAgreementWorld(t)
	groups := agreementMisspelledPin(w.homeSectionCode)

	for _, av := range w.viewers {
		if av.v.Unrestricted {
			continue
		}
		for _, reach := range agreementReaches() {
			d := authorization.Decision{
				Allowed:     true,
				Reach:       reach.reach,
				HasReach:    reach.has,
				Constraints: groups,
			}

			scopes, err := ScopesFor(av.v, d, w.schoolID)
			if err != nil {
				t.Fatalf("%s / %s: ScopesFor returned %v for a pin naming a field the vocabulary does "+
					"not know. It must return a resolved, empty scope set instead. LibraryItemsFor "+
					"answers NoLibraryItem for the same input, which denies quietly; if this side starts "+
					"erroring, the AI channel refuses loudly while the human channel denies silently and "+
					"one policy has two behaviours. The empty set here mirrors the denial there and that "+
					"is deliberate", av.name, reach.name, err)
			}
			labels, err := scopes.Labels()
			if err != nil {
				t.Fatalf("%s / %s: Labels: %v", av.name, reach.name, err)
			}
			if !scopes.Resolved() || scopes.Unrestricted() || len(labels) != 0 {
				t.Fatalf("%s / %s: an unexpressible pin produced resolved=%v unrestricted=%v labels=%v; "+
					"it must produce a resolved scope set holding nothing",
					av.name, reach.name, scopes.Resolved(), scopes.Unrestricted(), labels)
			}

			for _, row := range w.rows {
				if w.admittedByLabels(scopes, row) {
					t.Fatalf("%s / %s / %s: an empty scope set admitted a row", av.name, reach.name, row.name)
				}
			}
			if admitted := w.admittedByPredicate(av.v, d); len(admitted) != 0 {
				t.Fatalf("%s / %s: LibraryItemsFor admitted %d rows under a pin it cannot translate; "+
					"the label side admits none and the two must match", av.name, reach.name, len(admitted))
			}
		}
	}
}

func TestAPinTheLabelsCanOnlyPartlyExpressRefusesRatherThanNarrows(t *testing.T) {
	w := newAgreementWorld(t)

	groups := [][]authorization.Constraint{{{Field: "section", Values: []string{w.homeSectionCode}}}}
	reaches := []agreementReach{
		{"tenant", authorization.ReachTenant, true},
		{"teacher_assignment", authorization.ReachTeacherAssignment, true},
	}

	var teacher *access.Viewer
	for _, av := range w.viewers {
		if av.name == "class_teacher" {
			teacher = av.v
		}
	}
	if teacher == nil {
		t.Fatal("the fixture has no class teacher")
	}

	for _, reach := range reaches {
		d := authorization.Decision{
			Allowed:     true,
			Reach:       reach.reach,
			HasReach:    reach.has,
			Constraints: groups,
		}

		scopes, err := ScopesFor(teacher, d, w.schoolID)
		if !errors.Is(err, ErrPinnedScopeUnresolved) {
			t.Fatalf("%s: a pin on a real section code left labels the channel cannot narrow, so "+
				"ScopesFor must refuse with ErrPinnedScopeUnresolved; it returned %v with %v. Emitting "+
				"those labels would grant every row carrying them, while LibraryItemsFor ANDs the "+
				"section code on top and grants far fewer. Refusing fails closed; narrowing is not "+
				"available to a label channel", reach.name, err, scopes)
		}
		if scopes.Resolved() || scopes.Unrestricted() {
			t.Fatalf("%s: the refusal handed back a usable scope set", reach.name)
		}
		for _, row := range w.rows {
			if w.admittedByLabels(scopes, row) {
				t.Fatalf("%s / %s: a refused scope set admitted a row", reach.name, row.name)
			}
		}

		if admitted := w.admittedByPredicate(teacher, d); len(admitted) == 0 {
			t.Fatalf("%s: LibraryItemsFor admitted nothing under this pin, so the refusal above is not "+
				"the interesting case it is meant to be. The contrast only holds while the predicate "+
				"still serves rows the labels would have to over-grant to reach", reach.name)
		}
	}
}

func TestAScopeSetNamesOnlyTheSchoolItWasMintedFor(t *testing.T) {
	person := uuid.New()
	section := uuid.New()
	v := &access.Viewer{
		PersonID:            &person,
		SectionIDs:          []uuid.UUID{section},
		SectionGradeIDs:     map[uuid.UUID]uuid.UUID{section: uuid.New()},
		SubjectOfferingIDs:  []uuid.UUID{uuid.New()},
		EnrolledOfferingIDs: []uuid.UUID{uuid.New()},
		WardOfferingIDs:     []uuid.UUID{uuid.New()},
	}

	home, away := uuid.New(), uuid.New()

	for _, reach := range agreementReaches() {
		d := authorization.Decision{Allowed: true, Reach: reach.reach, HasReach: reach.has}

		scopes, err := ScopesFor(v, d, home)
		if err != nil {
			t.Fatalf("%s: ScopesFor: %v", reach.name, err)
		}
		labels, err := scopes.Labels()
		if err != nil {
			t.Fatalf("%s: Labels: %v", reach.name, err)
		}

		for _, label := range labels {
			if strings.Contains(label, away.String()) {
				t.Fatalf("%s: a scope set minted for school %s names school %s in %q",
					reach.name, home, away, label)
			}
		}

		foreign, err := LabelsFor(Item{
			SchoolID:      away,
			Audience:      entcontent.AudienceSchool,
			Status:        entcontent.StatusPublished,
			OwnerPersonID: uuid.New(),
		})
		if err != nil {
			t.Fatalf("%s: LabelsFor: %v", reach.name, err)
		}
		for _, label := range foreign {
			if scopes.Contains(label) {
				t.Fatalf("%s: a caller scoped to school %s holds %q, a label only school %s stamps. "+
					"Whatever picks the school id handed to ScopesFor decides who reads whose corpus",
					reach.name, home, label, away)
			}
		}
	}
}

func TestAnUnpublishedItemReachesItsOwnerAndNobodyElse(t *testing.T) {
	w := newAgreementWorld(t)

	owner := w.viewerNamed("class_teacher")
	other := w.viewerNamed("subject_teacher")
	d := authorization.Decision{Allowed: true, Reach: authorization.ReachTeacherAssignment, HasReach: true}

	ownerReads := w.admittedByPredicate(owner, d)
	ownerWrites := w.admittedByWritePredicate(owner, d)
	otherReads := w.admittedByPredicate(other, d)

	for _, status := range w.statuses {
		row := w.rowNamed("school_by_class_teacher/" + string(status))
		published := status == entcontent.StatusPublished

		if !ownerReads[row.id] {
			t.Errorf("%s: the owner cannot read their own item. A status gate that hides an author's "+
				"own work is a worse defect than the one it closes", row.name)
		}
		if !ownerWrites[row.id] {
			t.Errorf("%s: LibraryItemsWritableBy refuses the owner their own item, so nobody can ever "+
				"publish it", row.name)
		}
		if otherReads[row.id] != published {
			t.Errorf("%s: a school-audience %q item is %v to a colleague who does not own it; only a "+
				"published item may travel by its audience", row.name, status,
				map[bool]string{true: "visible", false: "hidden"}[otherReads[row.id]])
		}
	}
}

func TestAnOwnersDraftIsReadableByThemAndStillOutsideTheCorpus(t *testing.T) {
	w := newAgreementWorld(t)

	owner := w.viewerNamed("class_teacher")
	d := authorization.Decision{Allowed: true, Reach: authorization.ReachTeacherAssignment, HasReach: true}

	scopes, err := ScopesFor(owner, d, w.schoolID)
	if err != nil {
		t.Fatalf("ScopesFor: %v", err)
	}
	admitted := w.admittedByPredicate(owner, d)

	diverged := 0
	for _, status := range w.statuses {
		row := w.rowNamed("school_by_class_teacher/" + string(status))

		labels, labelErr := LabelsFor(row.item)
		if status == entcontent.StatusPublished {
			if labelErr != nil {
				t.Fatalf("%s: LabelsFor refused a published row: %v", row.name, labelErr)
			}
			if !admitted[row.id] || !w.admittedByLabels(scopes, row) {
				t.Fatalf("%s: the two sides disagree on a published row the owner may read", row.name)
			}
			continue
		}

		if !admitted[row.id] {
			t.Fatalf("%s: the owner cannot read their own unpublished row on the human path", row.name)
		}
		if !errors.Is(labelErr, ErrNotPublished) {
			t.Fatalf("%s: LabelsFor produced %v with %v; an unpublished row must never be stamped",
				row.name, labels, labelErr)
		}
		diverged++
	}

	if diverged == 0 {
		t.Fatal("every fixture row was published, so the intended divergence was never exercised")
	}

	t.Logf("%d unpublished rows are readable by their owner through LibraryItemsFor and absent from "+
		"the retrieval corpus. This is the one place the two sides part company and it is deliberate: "+
		"a draft must not be searchable, not even by its author. Do not close it by stamping drafts",
		diverged)
}
