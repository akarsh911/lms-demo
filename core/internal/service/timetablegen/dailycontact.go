package timetablegen

import (
	"context"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
)

type classTeaching struct {
	teacher map[string]string
	taught  map[string][]string
}

func resolveDailyContact(ctx context.Context, client *tenantent.Client, export *Export,
	rules []shared.DailyContactRule) ([]DailyContact, error) {

	if len(rules) == 0 {
		return nil, nil
	}
	held := classTeaching{teacher: map[string]string{}, taught: map[string][]string{}}
	if wantsClassTeacher(rules) {
		loaded, err := loadClassTeaching(ctx, client, export, rules)
		if err != nil {
			return nil, err
		}
		held = loaded
	}
	resolved, warnings := dailyContactOf(rules, export, held)
	for _, warning := range warnings {
		export.warn(warning)
	}
	return resolved, nil
}

func wantsClassTeacher(rules []shared.DailyContactRule) bool {
	for _, rule := range rules {
		if rule.ClassTeacher {
			return true
		}
	}
	return false
}

func loadClassTeaching(ctx context.Context, client *tenantent.Client, export *Export,
	rules []shared.DailyContactRule) (classTeaching, error) {

	out := classTeaching{teacher: map[string]string{}, taught: map[string][]string{}}

	known := map[string]bool{}
	for _, section := range export.School.Sections {
		known[section.ID] = true
	}
	wanted := make([]uuid.UUID, 0, len(rules))
	for _, rule := range rules {
		if !rule.ClassTeacher || !known[rule.SectionID] {
			continue
		}
		id, err := uuid.Parse(rule.SectionID)
		if err != nil {
			continue
		}
		wanted = append(wanted, id)
	}
	if len(wanted) == 0 {
		return out, nil
	}

	sections, err := client.Section.Query().
		Where(entsection.IDIn(wanted...), entsection.ClassTeacherIDNotNil()).
		All(ctx)
	if err != nil {
		return out, err
	}
	if len(sections) == 0 {
		return out, nil
	}

	carrying := make([]uuid.UUID, 0, len(sections))
	for _, section := range sections {
		carrying = append(carrying, section.ID)
	}

	assignments, err := client.TeacherAssignment.Query().
		Where(
			entteacherassign.SectionIDIn(carrying...),
			entteacherassign.SubjectOfferingIDNotNil(),
			entteacherassign.StatusEQ(entteacherassign.StatusActive),
		).
		All(ctx)
	if err != nil {
		return out, err
	}
	return classTeachingOf(sections, assignments), nil
}

func classTeachingOf(sections []*tenantent.Section,
	assignments []*tenantent.TeacherAssignment) classTeaching {

	out := classTeaching{teacher: map[string]string{}, taught: map[string][]string{}}
	for _, section := range sections {
		if section.ClassTeacherID == nil {
			continue
		}
		out.teacher[section.ID.String()] = section.ClassTeacherID.String()
	}
	for _, assignment := range assignments {
		if assignment.SubjectOfferingID == nil {
			continue
		}
		if assignment.Status != entteacherassign.StatusActive {
			continue
		}
		section := assignment.SectionID.String()
		if out.teacher[section] != assignment.TeacherID.String() {
			continue
		}
		offering := assignment.SubjectOfferingID.String()
		if !contains(out.taught[section], offering) {
			out.taught[section] = append(out.taught[section], offering)
		}
	}
	return out
}

func dailyContactOf(rules []shared.DailyContactRule, export *Export,
	held classTeaching) ([]DailyContact, []string) {

	sectionOf := map[string]string{}
	for _, offering := range export.School.Offerings {
		sectionOf[offering.ID] = offering.SectionID
	}
	label := map[string]string{}
	for _, section := range export.School.Sections {
		label[section.ID] = section.Code
	}

	out := make([]DailyContact, 0, len(rules))
	warnings := []string{}
	for _, rule := range rules {
		name, known := label[rule.SectionID]
		if !known {
			warnings = append(warnings, "a daily-contact rule names section "+
				rule.SectionID+", which this week's period scheme does not cover, "+
				"so the rule was left out")
			continue
		}

		offerings, warning := contactOfferings(rule, name, sectionOf, held)
		if warning != "" {
			warnings = append(warnings, warning)
		}
		if len(offerings) == 0 {
			continue
		}
		out = append(out, DailyContact{
			SectionID:   rule.SectionID,
			OfferingIDs: sorted(offerings),
			MinPerDay:   minPerDay(rule),
		})
	}
	if len(out) == 0 {
		return nil, warnings
	}
	return out, warnings
}

func contactOfferings(rule shared.DailyContactRule, name string,
	sectionOf map[string]string, held classTeaching) ([]string, string) {

	if rule.ClassTeacher {
		if _, ok := held.teacher[rule.SectionID]; !ok {
			return nil, name + " has no class teacher recorded, so the rule asking " +
				"for that teacher every day was left out"
		}
		taught := held.taught[rule.SectionID]
		if len(taught) == 0 {
			return nil, "the class teacher of " + name + " holds no subject in it, only " +
				"a section-wide assignment, so there is no lesson of theirs to place " +
				"every day and the rule was left out"
		}
		return withinSection(taught, rule.SectionID, sectionOf), ""
	}

	kept := withinSection(rule.OfferingIDs, rule.SectionID, sectionOf)
	if len(kept) == len(rule.OfferingIDs) {
		return kept, ""
	}
	if len(kept) == 0 {
		return nil, "a daily-contact rule for " + name + " named no subject that " +
			"belongs to it, so the rule was left out"
	}
	return kept, "a daily-contact rule for " + name + " named a subject that does not " +
		"belong to it; the rule was kept over the rest"
}

func withinSection(offerings []string, sectionID string, sectionOf map[string]string) []string {
	kept := make([]string, 0, len(offerings))
	for _, offering := range offerings {
		if sectionOf[offering] != sectionID {
			continue
		}
		if !contains(kept, offering) {
			kept = append(kept, offering)
		}
	}
	return kept
}

func minPerDay(rule shared.DailyContactRule) int {
	if rule.MinPerDay < 1 {
		return 1
	}
	return rule.MinPerDay
}
