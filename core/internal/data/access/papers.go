package access

import (
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entexamsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examsubject"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	entpaper "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/paper"
	entrun "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/papergenerationrun"
	enttarget "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/papertargetsection"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entquestion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/question"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
)

func NoBlueprint() predicate.Blueprint  { return entblueprint.IDIn() }
func AnyBlueprint() predicate.Blueprint { return func(*sql.Selector) {} }

func NoQuestion() predicate.Question  { return entquestion.IDIn() }
func AnyQuestion() predicate.Question { return func(*sql.Selector) {} }

func NoPaper() predicate.Paper  { return entpaper.IDIn() }
func AnyPaper() predicate.Paper { return func(*sql.Selector) {} }

func NoPaperGenerationRun() predicate.PaperGenerationRun  { return entrun.IDIn() }
func AnyPaperGenerationRun() predicate.PaperGenerationRun { return func(*sql.Selector) {} }

func NoSection() predicate.Section  { return entsection.IDIn() }
func AnySection() predicate.Section { return func(*sql.Selector) {} }

func NoGradeLevel() predicate.GradeLevel  { return entgrade.IDIn() }
func AnyGradeLevel() predicate.GradeLevel { return func(*sql.Selector) {} }

type bankReach struct {
	pairs     []SubjectGrade
	sections  []uuid.UUID
	offerings []uuid.UUID
	taught    []uuid.UUID
	places    map[uuid.UUID]SubjectGrade
}

func (r bankReach) empty() bool {
	return len(r.pairs) == 0 && len(r.sections) == 0 && len(r.offerings) == 0
}

func (r bankReach) merge(other bankReach) bankReach {
	places := make(map[uuid.UUID]SubjectGrade, len(r.places)+len(other.places))
	for id, place := range r.places {
		places[id] = place
	}
	for id, place := range other.places {
		places[id] = place
	}
	return bankReach{
		pairs:     append(append([]SubjectGrade{}, r.pairs...), other.pairs...),
		sections:  append(append([]uuid.UUID{}, r.sections...), other.sections...),
		offerings: append(append([]uuid.UUID{}, r.offerings...), other.offerings...),
		taught:    append(append([]uuid.UUID{}, r.taught...), other.taught...),
		places:    places,
	}
}

func (r bankReach) subjectIDs() []uuid.UUID {
	seen := map[uuid.UUID]struct{}{}
	var out []uuid.UUID
	add := func(subject uuid.UUID) {
		if subject == uuid.Nil {
			return
		}
		if _, dup := seen[subject]; dup {
			return
		}
		seen[subject] = struct{}{}
		out = append(out, subject)
	}

	for _, pair := range r.pairs {
		add(pair.SubjectID)
	}
	for _, id := range r.offerings {
		add(r.places[id].SubjectID)
	}
	for _, id := range r.taught {
		add(r.places[id].SubjectID)
	}
	return out
}

func (r bankReach) forSubject(subject uuid.UUID) bankReach {
	out := bankReach{places: r.places}
	for _, pair := range r.pairs {
		if pair.SubjectID == subject {
			out.pairs = append(out.pairs, pair)
		}
	}
	for _, id := range r.offerings {
		if r.places[id].SubjectID == subject {
			out.offerings = append(out.offerings, id)
		}
	}
	for _, id := range r.taught {
		if r.places[id].SubjectID == subject {
			out.taught = append(out.taught, id)
		}
	}
	return out
}

func bankTeachingReach(v *Viewer) bankReach {
	return bankReach{
		pairs:     v.TaughtSubjectGrades,
		sections:  v.SectionIDs,
		offerings: v.SubjectOfferingIDs,
		taught:    v.SubjectOfferingIDs,
		places:    v.SubjectGradeByOffering,
	}
}

func bankStudiedReach(v *Viewer) bankReach {
	return bankReach{
		pairs:     v.StudiedSubjectGrades,
		offerings: v.EnrolledOfferingIDs,
		places:    v.SubjectGradeByOffering,
	}
}

func bankWardReach(v *Viewer) bankReach {
	if v.GuardianID == nil {
		return bankReach{}
	}
	return bankReach{
		pairs:     v.WardSubjectGrades,
		offerings: v.WardOfferingIDs,
		places:    v.SubjectGradeByOffering,
	}
}

func bankAnyRoleReach(v *Viewer) bankReach {
	return bankTeachingReach(v).merge(bankStudiedReach(v)).merge(bankWardReach(v))
}

func bankReadReach(v *Viewer, d authorization.Decision) (bankReach, bool) {
	if !d.HasReach {
		return bankAnyRoleReach(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return bankReach{}, true
	case authorization.ReachSelf:
		return bankStudiedReach(v), false
	case authorization.ReachGuardianWard:
		return bankWardReach(v), false
	case authorization.ReachTeacherAssignment:
		return bankTeachingReach(v), false
	default:
		return bankReach{}, false
	}
}

func bankWriteReach(v *Viewer, d authorization.Decision) (bankReach, bool) {
	if !d.HasReach {
		return bankTeachingReach(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return bankReach{}, true
	case authorization.ReachTeacherAssignment:
		return bankTeachingReach(v), false
	default:
		return bankReach{}, false
	}
}

func bankGradesMatching(c authorization.Constraint) predicate.GradeLevel {
	switch c.Field {
	case "section":
		return entgrade.HasSectionsWith(entsection.CodeIn(c.Values...))
	case "grade_level":
		return entgrade.CodeIn(c.Values...)
	case "subject":
		return entgrade.HasSectionsWith(sectionsOfferingSubject(c))
	default:
		return entgrade.IDIn()
	}
}

func sectionsOfferingSubject(c authorization.Constraint) predicate.Section {
	return entsection.HasSubjectOfferingsWith(entoffering.HasSubjectWith(subjectsMatching(c)))
}

func paperSectionsMatching(c authorization.Constraint) predicate.Section {
	if c.Field == "subject" {
		return sectionsOfferingSubject(c)
	}
	return sectionsMatching(c)
}

func bankPinsUsable(groups [][]authorization.Constraint) bool {
	for _, group := range groups {
		if translatable(group) {
			return true
		}
	}
	return len(groups) == 0
}

type sqlPredicate interface{ ~func(*sql.Selector) }

type predicateOps[T sqlPredicate] struct {
	and        func(...T) T
	or         func(...T) T
	none       T
	unfiltered T
}

func bankNarrowed[T sqlPredicate](ops predicateOps[T], d authorization.Decision,
	arms []T, pinned T, all bool) T {
	if !bankPinsUsable(d.Constraints) {
		return ops.none
	}
	if !all && len(arms) == 0 {
		return ops.none
	}
	if len(d.Constraints) == 0 {
		if all {
			return ops.unfiltered
		}
		return ops.or(arms...)
	}
	if all {
		return pinned
	}
	return ops.and(ops.or(arms...), pinned)
}

var blueprintOps = predicateOps[predicate.Blueprint]{
	and: entblueprint.And, or: entblueprint.Or,
	none: NoBlueprint(), unfiltered: AnyBlueprint(),
}

var questionOps = predicateOps[predicate.Question]{
	and: entquestion.And, or: entquestion.Or,
	none: NoQuestion(), unfiltered: AnyQuestion(),
}

var paperOps = predicateOps[predicate.Paper]{
	and: entpaper.And, or: entpaper.Or,
	none: NoPaper(), unfiltered: AnyPaper(),
}

var sectionOps = predicateOps[predicate.Section]{
	and: entsection.And, or: entsection.Or,
	none: NoSection(), unfiltered: AnySection(),
}

var gradeOps = predicateOps[predicate.GradeLevel]{
	and: entgrade.And, or: entgrade.Or,
	none: NoGradeLevel(), unfiltered: AnyGradeLevel(),
}

var runOps = predicateOps[predicate.PaperGenerationRun]{
	and: entrun.And, or: entrun.Or,
	none: NoPaperGenerationRun(), unfiltered: AnyPaperGenerationRun(),
}

func blueprintArms(r bankReach) []predicate.Blueprint {
	var ors []predicate.Blueprint
	if len(r.sections) > 0 {
		ors = append(ors, entblueprint.HasGradeLevelWith(
			entgrade.HasSectionsWith(entsection.IDIn(r.sections...))))
	}
	for _, pair := range r.pairs {
		ors = append(ors, entblueprint.And(
			entblueprint.SubjectIDEQ(pair.SubjectID),
			entblueprint.GradeLevelIDEQ(pair.GradeLevelID)))
	}
	return ors
}

func blueprintsMatching(c authorization.Constraint) predicate.Blueprint {
	if c.Field == "subject" {
		return entblueprint.HasSubjectWith(subjectsMatching(c))
	}
	return entblueprint.HasGradeLevelWith(bankGradesMatching(c))
}

func blueprintsPinnedBy(groups [][]authorization.Constraint) predicate.Blueprint {
	if len(groups) == 0 {
		return AnyBlueprint()
	}

	ors := make([]predicate.Blueprint, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.Blueprint, 0, len(group))
		for _, c := range group {
			ands = append(ands, blueprintsMatching(c))
		}
		ors = append(ors, entblueprint.And(ands...))
	}
	if len(ors) == 0 {
		return NoBlueprint()
	}
	return entblueprint.Or(ors...)
}

func blueprintScope(v *Viewer, d authorization.Decision, write bool) predicate.Blueprint {
	if v == nil {
		return NoBlueprint()
	}
	if v.Unrestricted {
		return AnyBlueprint()
	}
	reach, all := bankReadReach(v, d)
	if write {
		reach, all = bankWriteReach(v, d)
	}
	return bankNarrowed(blueprintOps, d, blueprintArms(reach), blueprintsPinnedBy(d.Constraints), all)
}

func BlueprintsFor(v *Viewer, d authorization.Decision) predicate.Blueprint {
	return blueprintScope(v, d, false)
}

func BlueprintsWritableBy(v *Viewer, d authorization.Decision) predicate.Blueprint {
	return blueprintScope(v, d, true)
}

func BlueprintsWritableForPaperSubject(v *Viewer, d authorization.Decision,
	subject uuid.UUID) predicate.Blueprint {
	if v == nil {
		return NoBlueprint()
	}
	if v.Unrestricted {
		return AnyBlueprint()
	}
	reach, all := bankWriteReach(v, d)
	return bankNarrowed(blueprintOps, d, blueprintArms(reach.forSubject(subject)),
		blueprintsPinnedBy(d.Constraints), all)
}

func questionArms(r bankReach) []predicate.Question {
	var ors []predicate.Question
	if len(r.sections) > 0 {
		ors = append(ors, entquestion.HasGradeLevelWith(
			entgrade.HasSectionsWith(entsection.IDIn(r.sections...))))
	}
	for _, pair := range r.pairs {
		ors = append(ors, entquestion.And(
			entquestion.SubjectIDEQ(pair.SubjectID),
			entquestion.GradeLevelIDEQ(pair.GradeLevelID)))
	}
	return ors
}

func questionsMatching(c authorization.Constraint) predicate.Question {
	if c.Field == "subject" {
		return entquestion.HasSubjectWith(subjectsMatching(c))
	}
	return entquestion.HasGradeLevelWith(bankGradesMatching(c))
}

func questionsPinnedBy(groups [][]authorization.Constraint) predicate.Question {
	if len(groups) == 0 {
		return AnyQuestion()
	}

	ors := make([]predicate.Question, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.Question, 0, len(group))
		for _, c := range group {
			ands = append(ands, questionsMatching(c))
		}
		ors = append(ors, entquestion.And(ands...))
	}
	if len(ors) == 0 {
		return NoQuestion()
	}
	return entquestion.Or(ors...)
}

func questionScope(v *Viewer, d authorization.Decision, write bool) predicate.Question {
	if v == nil {
		return NoQuestion()
	}
	if v.Unrestricted {
		return AnyQuestion()
	}
	reach, all := bankReadReach(v, d)
	if write {
		reach, all = bankWriteReach(v, d)
	}
	return bankNarrowed(questionOps, d, questionArms(reach), questionsPinnedBy(d.Constraints), all)
}

func QuestionsFor(v *Viewer, d authorization.Decision) predicate.Question {
	return questionScope(v, d, false)
}

func QuestionsWritableBy(v *Viewer, d authorization.Decision) predicate.Question {
	return questionScope(v, d, true)
}

func bankOfferingArms(r bankReach) []predicate.SubjectOffering {
	var ors []predicate.SubjectOffering
	if len(r.offerings) > 0 {
		ors = append(ors, entoffering.IDIn(r.offerings...))
	}
	if len(r.sections) > 0 {
		ors = append(ors, entoffering.SectionIDIn(r.sections...))
	}
	return ors
}

func paperExamArm(r bankReach) (predicate.Paper, bool) {
	arms := bankOfferingArms(r)
	if len(arms) == 0 {
		return nil, false
	}
	return entpaper.HasExamWith(entexam.HasExamSubjectsWith(
		entexamsubject.HasSubjectOfferingWith(entoffering.Or(arms...)))), true
}

func ExamsWritableForPapers(v *Viewer, d authorization.Decision) (predicate.Exam, bool) {
	return examsWritableForPapers(v, d, nil)
}

func ExamsWritableForPaperSubject(v *Viewer, d authorization.Decision,
	subject uuid.UUID) (predicate.Exam, bool) {
	return examsWritableForPapers(v, d, &subject)
}

func examsWritableForPapers(v *Viewer, d authorization.Decision,
	subject *uuid.UUID) (predicate.Exam, bool) {
	if v == nil {
		return entexam.IDIn(), false
	}
	if v.Unrestricted {
		return func(*sql.Selector) {}, true
	}
	reach, all := bankWriteReach(v, d)
	if all && len(d.Constraints) == 0 {
		return func(*sql.Selector) {}, true
	}
	if subject != nil {
		reach = reach.forSubject(*subject)
	}
	arms := bankOfferingArms(reach)
	if len(arms) == 0 {
		return entexam.IDIn(), false
	}
	return entexam.HasExamSubjectsWith(
		entexamsubject.HasSubjectOfferingWith(entoffering.Or(arms...))), false
}

func paperTargetArm(r bankReach) (predicate.Paper, bool) {
	arms := sectionArms(r)
	if len(arms) == 0 {
		return nil, false
	}
	return entpaper.HasTargetSectionsWith(
		enttarget.HasSectionWith(entsection.Or(arms...))), true
}

func paperArms(r bankReach) []predicate.Paper {
	var ors []predicate.Paper
	if blueprints := blueprintArms(r); len(blueprints) > 0 {
		ors = append(ors, entpaper.HasBlueprintWith(entblueprint.Or(blueprints...)))
	}
	if arm, ok := paperExamArm(r); ok {
		ors = append(ors, arm)
	}
	if arm, ok := paperTargetArm(r); ok {
		ors = append(ors, arm)
	}
	return ors
}

func sectionArms(r bankReach) []predicate.Section {
	var ors []predicate.Section
	if len(r.sections) > 0 {
		ors = append(ors, entsection.IDIn(r.sections...))
	}
	if len(r.taught) > 0 {
		ors = append(ors, entsection.HasSubjectOfferingsWith(entoffering.IDIn(r.taught...)))
	}
	return ors
}

func sectionsPinnedBy(groups [][]authorization.Constraint) predicate.Section {
	if len(groups) == 0 {
		return AnySection()
	}

	ors := make([]predicate.Section, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.Section, 0, len(group))
		for _, c := range group {
			ands = append(ands, paperSectionsMatching(c))
		}
		ors = append(ors, entsection.And(ands...))
	}
	if len(ors) == 0 {
		return NoSection()
	}
	return entsection.Or(ors...)
}

func SectionsWritableForPapers(v *Viewer, d authorization.Decision) predicate.Section {
	if v == nil {
		return NoSection()
	}
	if v.Unrestricted {
		return AnySection()
	}
	reach, all := bankWriteReach(v, d)
	return bankNarrowed(sectionOps, d, sectionArms(reach), sectionsPinnedBy(d.Constraints), all)
}

func SectionsWritableForPaperSubject(v *Viewer, d authorization.Decision,
	subject uuid.UUID) predicate.Section {
	if v == nil {
		return NoSection()
	}
	if v.Unrestricted {
		return AnySection()
	}
	reach, all := bankWriteReach(v, d)
	return bankNarrowed(sectionOps, d, sectionArms(reach.forSubject(subject)),
		sectionsPinnedBy(d.Constraints), all)
}

func ownedGradeIDs(v *Viewer) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(v.SectionGradeIDs))
	for _, grade := range v.SectionGradeIDs {
		out = append(out, grade)
	}
	return dedupe(out)
}

func gradeArms(v *Viewer, r bankReach) []predicate.GradeLevel {
	var ors []predicate.GradeLevel
	if grades := ownedGradeIDs(v); len(grades) > 0 {
		ors = append(ors, entgrade.IDIn(grades...))
	}
	for _, pair := range r.pairs {
		ors = append(ors, entgrade.ID(pair.GradeLevelID))
	}
	if arms := sectionArms(r); len(arms) > 0 {
		ors = append(ors, entgrade.HasSectionsWith(entsection.Or(arms...)))
	}
	return ors
}

func gradesPinnedBy(groups [][]authorization.Constraint) predicate.GradeLevel {
	if len(groups) == 0 {
		return AnyGradeLevel()
	}

	ors := make([]predicate.GradeLevel, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.GradeLevel, 0, len(group))
		for _, c := range group {
			ands = append(ands, bankGradesMatching(c))
		}
		ors = append(ors, entgrade.And(ands...))
	}
	if len(ors) == 0 {
		return NoGradeLevel()
	}
	return entgrade.Or(ors...)
}

func GradeLevelsWritableForPapers(v *Viewer, d authorization.Decision) predicate.GradeLevel {
	if v == nil {
		return NoGradeLevel()
	}
	if v.Unrestricted {
		return AnyGradeLevel()
	}
	reach, all := bankWriteReach(v, d)
	return bankNarrowed(gradeOps, d, gradeArms(v, reach), gradesPinnedBy(d.Constraints), all)
}

func paperSubjectMatching(c authorization.Constraint) predicate.Paper {
	return entpaper.Or(
		entpaper.HasSubjectWith(subjectsMatching(c)),
		entpaper.HasBlueprintWith(entblueprint.HasSubjectWith(subjectsMatching(c))))
}

func paperPlaceArms(group []authorization.Constraint) []predicate.Paper {
	blueprintAnds := make([]predicate.Blueprint, 0, len(group))
	examAnds := make([]predicate.Exam, 0, len(group))
	gradeAnds := make([]predicate.GradeLevel, 0, len(group))
	targetAnds := make([]predicate.Section, 0, len(group))
	for _, c := range group {
		blueprintAnds = append(blueprintAnds, entblueprint.HasGradeLevelWith(bankGradesMatching(c)))
		examAnds = append(examAnds, entexam.HasExamSubjectsWith(
			entexamsubject.HasSubjectOfferingWith(
				entoffering.HasSectionWith(sectionsMatching(c)))))
		gradeAnds = append(gradeAnds, bankGradesMatching(c))
		targetAnds = append(targetAnds, sectionsMatching(c))
	}
	return []predicate.Paper{
		entpaper.HasBlueprintWith(entblueprint.And(blueprintAnds...)),
		entpaper.HasExamWith(entexam.And(examAnds...)),
		entpaper.HasGradeLevelWith(entgrade.And(gradeAnds...)),
		entpaper.HasTargetSectionsWith(
			enttarget.HasSectionWith(entsection.And(targetAnds...))),
	}
}

func paperPinnedByGroup(group []authorization.Constraint) predicate.Paper {
	var ands []predicate.Paper
	var placed []authorization.Constraint
	for _, c := range group {
		if c.Field == "subject" {
			ands = append(ands, paperSubjectMatching(c))
			continue
		}
		placed = append(placed, c)
	}
	if len(placed) > 0 {
		ands = append(ands, entpaper.Or(paperPlaceArms(placed)...))
	}
	if len(ands) == 0 {
		return AnyPaper()
	}
	return entpaper.And(ands...)
}

func papersPinnedBy(groups [][]authorization.Constraint) predicate.Paper {
	if len(groups) == 0 {
		return AnyPaper()
	}

	ors := make([]predicate.Paper, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ors = append(ors, paperPinnedByGroup(group))
	}
	if len(ors) == 0 {
		return NoPaper()
	}
	return entpaper.Or(ors...)
}

func paperSubjectArms(r bankReach) []predicate.Paper {
	var ors []predicate.Paper
	for _, subject := range r.subjectIDs() {
		arms := paperArms(r.forSubject(subject))
		if len(arms) == 0 {
			continue
		}
		ors = append(ors, entpaper.And(
			entpaper.SubjectIDEQ(subject), entpaper.Or(arms...)))
	}
	return ors
}

func paperReachArms(r bankReach) []predicate.Paper {
	var ors []predicate.Paper
	if arms := paperArms(r); len(arms) > 0 {
		ors = append(ors, entpaper.And(entpaper.SubjectIDIsNil(), entpaper.Or(arms...)))
	}
	return append(ors, paperSubjectArms(r)...)
}

func paperScope(v *Viewer, d authorization.Decision, write bool) predicate.Paper {
	if v == nil {
		return NoPaper()
	}
	if v.Unrestricted {
		return AnyPaper()
	}
	reach, all := bankReadReach(v, d)
	if write {
		reach, all = bankWriteReach(v, d)
	}
	return bankNarrowed(paperOps, d, paperReachArms(reach), papersPinnedBy(d.Constraints), all)
}

func PapersFor(v *Viewer, d authorization.Decision) predicate.Paper {
	return paperScope(v, d, false)
}

func PapersWritableBy(v *Viewer, d authorization.Decision) predicate.Paper {
	return paperScope(v, d, true)
}

func runScope(v *Viewer, d authorization.Decision, write bool) predicate.PaperGenerationRun {
	if v == nil {
		return NoPaperGenerationRun()
	}
	if v.Unrestricted {
		return AnyPaperGenerationRun()
	}
	reach, all := bankReadReach(v, d)
	if write {
		reach, all = bankWriteReach(v, d)
	}

	var arms []predicate.PaperGenerationRun
	if blueprints := blueprintArms(reach); len(blueprints) > 0 {
		arms = append(arms, entrun.HasBlueprintWith(entblueprint.Or(blueprints...)))
	}
	pinned := entrun.HasBlueprintWith(blueprintsPinnedBy(d.Constraints))
	if len(d.Constraints) == 0 {
		pinned = AnyPaperGenerationRun()
	}
	return bankNarrowed(runOps, d, arms, pinned, all)
}

func PaperGenerationRunsFor(v *Viewer, d authorization.Decision) predicate.PaperGenerationRun {
	return runScope(v, d, false)
}

func PaperGenerationRunsWritableBy(v *Viewer, d authorization.Decision) predicate.PaperGenerationRun {
	return runScope(v, d, true)
}

func (r bankReach) reachesSubjectGrade(subject, grade uuid.UUID) bool {
	for _, pair := range r.pairs {
		if pair.SubjectID == subject && pair.GradeLevelID == grade {
			return true
		}
	}
	return false
}

func BankWriteReaches(v *Viewer, d authorization.Decision, subject, grade uuid.UUID) (bool, bool) {
	if v == nil {
		return false, false
	}
	if v.Unrestricted {
		return true, true
	}
	reach, all := bankWriteReach(v, d)
	if all {
		return true, true
	}
	if reach.empty() {
		return false, false
	}
	if reach.reachesSubjectGrade(subject, grade) {
		return true, false
	}
	for _, sectionGrade := range v.SectionGradeIDs {
		if sectionGrade == grade {
			return true, false
		}
	}
	return false, false
}
