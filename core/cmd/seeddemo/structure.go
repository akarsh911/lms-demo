package main

import (
	"context"
	"fmt"
	"time"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entbranch "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/branch"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subject"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
)

var subjectNames = []struct{ code, name, kind string }{
	{"MATH", "Mathematics", "academic"},
	{"ENG", "English", "academic"},
	{"SCI", "Science", "academic"},
	{"SST", "Social Studies", "academic"},
	{"HIN", "Hindi", "academic"},
}

func (s *seeder) branch(ctx context.Context) (*tenantent.Branch, error) {
	code := s.tenant.Code + "-MAIN"
	found, err := s.client.Branch.Query().Where(entbranch.Code(code)).Only(ctx)
	if err == nil {
		return found, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}
	if s.o.dryRun {
		return &tenantent.Branch{}, nil
	}
	row, err := s.client.Branch.Create().
		SetName(s.tenant.Name + " Main Campus").
		SetCode(code).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	s.note("branch", 1)
	return row, nil
}

func (s *seeder) session(ctx context.Context) (*tenantent.AcademicSession, error) {
	found, err := s.client.AcademicSession.Query().
		Where(entsession.Code(s.o.session)).Only(ctx)
	if err == nil {
		return found, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}
	if s.o.dryRun {
		return &tenantent.AcademicSession{}, nil
	}

	var startYear int
	if _, err := fmt.Sscanf(s.o.session, "%d", &startYear); err != nil {
		return nil, fmt.Errorf("session code must start with a year, got %q", s.o.session)
	}
	start := time.Date(startYear, time.April, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(startYear+1, time.March, 31, 0, 0, 0, 0, time.UTC)

	row, err := s.client.AcademicSession.Create().
		SetName(s.o.session).
		SetCode(s.o.session).
		SetStartDate(start).
		SetEndDate(end).
		SetStatus(entsession.StatusActive).
		SetIsCurrent(true).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	s.note("session", 1)
	return row, nil
}

func (s *seeder) grades(ctx context.Context) ([]*tenantent.GradeLevel, error) {
	out := make([]*tenantent.GradeLevel, 0, s.o.classes)
	for i := 1; i <= s.o.classes; i++ {
		code := fmt.Sprintf("G%d", i+5)
		name := fmt.Sprintf("Class %d", i+5)

		found, err := s.client.GradeLevel.Query().Where(entgrade.Code(code)).Only(ctx)
		if err == nil {
			out = append(out, found)
			continue
		}
		if !tenantent.IsNotFound(err) {
			return nil, err
		}
		if s.o.dryRun {
			out = append(out, &tenantent.GradeLevel{})
			continue
		}
		row, err := s.client.GradeLevel.Create().
			SetName(name).SetCode(code).SetSequence(i + 5).
			Save(ctx)
		if err != nil {
			return nil, err
		}
		s.note("grade_level", 1)
		out = append(out, row)
	}
	return out, nil
}

func (s *seeder) sections(ctx context.Context, session *tenantent.AcademicSession,
	branch *tenantent.Branch, grades []*tenantent.GradeLevel) ([]*tenantent.Section, error) {
	letters := "ABCDEFGH"
	out := make([]*tenantent.Section, 0, len(grades)*s.o.sections)

	for _, g := range grades {
		for j := 0; j < s.o.sections; j++ {
			letter := string(letters[j])
			code := fmt.Sprintf("%s-%s-%s", s.o.session, g.Code, letter)

			found, err := s.client.Section.Query().Where(entsection.Code(code)).Only(ctx)
			if err == nil {
				out = append(out, found)
				continue
			}
			if !tenantent.IsNotFound(err) {
				return nil, err
			}
			if s.o.dryRun {
				out = append(out, &tenantent.Section{})
				continue
			}
			row, err := s.client.Section.Create().
				SetAcademicSessionID(session.ID).
				SetBranchID(branch.ID).
				SetGradeLevelID(g.ID).
				SetName(letter).
				SetCode(code).
				Save(ctx)
			if err != nil {
				return nil, err
			}
			s.note("section", 1)
			out = append(out, row)
		}
	}
	return out, nil
}

func (s *seeder) subjects(ctx context.Context) ([]*tenantent.Subject, error) {
	out := make([]*tenantent.Subject, 0, len(subjectNames))
	for _, sub := range subjectNames {
		found, err := s.client.Subject.Query().Where(entsubject.Code(sub.code)).Only(ctx)
		if err == nil {
			out = append(out, found)
			continue
		}
		if !tenantent.IsNotFound(err) {
			return nil, err
		}
		if s.o.dryRun {
			out = append(out, &tenantent.Subject{})
			continue
		}
		row, err := s.client.Subject.Create().
			SetName(sub.name).SetCode(sub.code).SetSubjectType(sub.kind).
			Save(ctx)
		if err != nil {
			return nil, err
		}
		s.note("subject", 1)
		out = append(out, row)
	}
	return out, nil
}

func (s *seeder) offerings(ctx context.Context, session *tenantent.AcademicSession,
	sections []*tenantent.Section, subjects []*tenantent.Subject) ([]*tenantent.SubjectOffering, error) {
	out := make([]*tenantent.SubjectOffering, 0, len(sections)*len(subjects))

	for _, sec := range sections {
		for _, sub := range subjects {
			found, err := s.client.SubjectOffering.Query().Where(
				entoffering.SectionID(sec.ID),
				entoffering.SubjectID(sub.ID),
			).Only(ctx)
			if err == nil {
				out = append(out, found)
				continue
			}
			if !tenantent.IsNotFound(err) {
				return nil, err
			}
			if s.o.dryRun {
				out = append(out, &tenantent.SubjectOffering{})
				continue
			}
			row, err := s.client.SubjectOffering.Create().
				SetAcademicSessionID(session.ID).
				SetSectionID(sec.ID).
				SetSubjectID(sub.ID).
				Save(ctx)
			if err != nil {
				return nil, err
			}
			s.note("offering", 1)
			out = append(out, row)
		}
	}
	return out, nil
}
