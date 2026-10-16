package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entguardian "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/guardian"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entteacher "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacher"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
)

var forenames = []string{
	"Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Krishna", "Ishaan",
	"Ananya", "Diya", "Aadhya", "Saanvi", "Myra", "Anika", "Riya", "Kiara",
	"Kabir", "Rudra", "Advik", "Meera", "Navya", "Ira", "Kavya", "Aarohi",
}

var surnames = []string{
	"Sharma", "Iyer", "Patel", "Reddy", "Nair", "Desai", "Kulkarni", "Banerjee",
	"Chauhan", "Mehta", "Joshi", "Gupta", "Rao", "Verma", "Singh", "Bhat",
}

func nameFor(i int) (string, string) {
	return forenames[i%len(forenames)], surnames[(i/len(forenames)+i)%len(surnames)]
}

func (s *seeder) person(ctx context.Context, key, first, last, email, phone string) (*tenantent.Person, error) {
	found, err := s.client.Person.Query().
		Where(entperson.EmailEQ(email)).Only(ctx)
	if err == nil {
		return found, nil
	}
	if !tenantent.IsNotFound(err) {
		return nil, err
	}
	if s.o.dryRun {
		return &tenantent.Person{}, nil
	}

	casID := uuid.New()
	if s.cas.enabled() {
		id, err := s.cas.createUser(ctx, key, first+" "+last, email)
		if err != nil {
			return nil, fmt.Errorf("cas user %s: %w", email, err)
		}
		casID = id
		s.note("cas_user", 1)
	}

	row, err := s.client.Person.Create().
		SetCasUserID(casID).
		SetFirstName(first).
		SetLastName(last).
		SetDisplayName(first + " " + last).
		SetEmail(email).
		SetPhone(phone).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	s.note("person", 1)
	return row, nil
}

func (s *seeder) teachers(ctx context.Context) ([]*tenantent.Teacher, error) {
	out := make([]*tenantent.Teacher, 0, s.o.teachers)

	for i := 0; i < s.o.teachers; i++ {
		first, last := nameFor(i * 3)
		code := fmt.Sprintf("EMP-%s-%03d", s.o.session, i+1)
		email := fmt.Sprintf("teacher%02d@%s.demo", i+1, strings.ToLower(s.tenant.Code))

		var p *tenantent.Person
		if !s.api.enabled() {
			created, err := s.person(ctx, code, first, last, email, fmt.Sprintf("90000000%02d", i+1))
			if err != nil {
				return nil, err
			}
			p = created
		}
		if s.o.dryRun {
			out = append(out, &tenantent.Teacher{})
			continue
		}

		st, err := s.client.Staff.Query().Where(entstaff.EmployeeCode(code)).Only(ctx)
		if tenantent.IsNotFound(err) {
			if s.api.enabled() {
				if _, err := s.api.post(ctx, "/api/v1/staff", map[string]any{
					"person":        s.api.person(code, first, last, email, fmt.Sprintf("90000000%02d", i+1)),
					"employee_code": code,
					"designation":   "Teacher",
					"joining_date":  time.Now().AddDate(-2, 0, 0).Format("2006-01-02"),
				}); err != nil {
					return nil, err
				}
				s.note("person", 1)
				s.note("cas_user", 1)
				s.note("staff", 1)
				st, err = s.client.Staff.Query().Where(entstaff.EmployeeCode(code)).Only(ctx)
				if err != nil {
					return nil, fmt.Errorf("created %s through the API but it is not in this database: %w", code, err)
				}
			} else {
				st, err = s.client.Staff.Create().
					SetPersonID(p.ID).
					SetEmployeeCode(code).
					SetDesignation("Teacher").
					SetJoiningDate(time.Now().AddDate(-2, 0, 0)).
					Save(ctx)
				if err != nil {
					return nil, err
				}
				s.note("staff", 1)
			}
		} else if err != nil {
			return nil, err
		}

		t, err := s.client.Teacher.Query().Where(entteacher.StaffID(st.ID)).Only(ctx)
		if tenantent.IsNotFound(err) && s.api.enabled() {
			if _, err := s.api.post(ctx, "/api/v1/teachers", map[string]any{
				"staff_id":       st.ID.String(),
				"teacher_code":   fmt.Sprintf("TCH-%03d", i+1),
				"specialization": subjectNames[i%len(subjectNames)].name,
			}); err != nil {
				return nil, err
			}
			s.note("teacher", 1)
			t, err = s.client.Teacher.Query().Where(entteacher.StaffID(st.ID)).Only(ctx)
			if err != nil {
				return nil, err
			}
		} else if tenantent.IsNotFound(err) {
			t, err = s.client.Teacher.Create().
				SetStaffID(st.ID).
				SetTeacherCode(fmt.Sprintf("TCH-%03d", i+1)).
				SetSpecialization(subjectNames[i%len(subjectNames)].name).
				Save(ctx)
			if err != nil {
				return nil, err
			}
			s.note("teacher", 1)
		} else if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

func (s *seeder) assignments(ctx context.Context, session *tenantent.AcademicSession,
	sections []*tenantent.Section, offerings []*tenantent.SubjectOffering,
	teachers []*tenantent.Teacher) error {
	if s.o.dryRun || len(teachers) == 0 {
		return nil
	}

	for i, sec := range sections {
		t := teachers[i%len(teachers)]
		if err := s.assign(ctx, session.ID, t.ID, sec.ID, nil, "class_teacher"); err != nil {
			return err
		}
		if _, err := s.client.Section.UpdateOneID(sec.ID).SetClassTeacherID(t.ID).Save(ctx); err != nil {
			return err
		}
	}

	for i, off := range offerings {
		t := teachers[(i+1)%len(teachers)]
		id := off.ID
		if err := s.assign(ctx, session.ID, t.ID, off.SectionID, &id, "subject_teacher"); err != nil {
			return err
		}
	}
	return nil
}

func (s *seeder) assign(ctx context.Context, sessionID, teacherID, sectionID uuid.UUID,
	offeringID *uuid.UUID, role string) error {
	q := s.client.TeacherAssignment.Query().Where(
		entassignment.TeacherID(teacherID),
		entassignment.SectionID(sectionID),
		entassignment.RoleType(role),
	)
	if offeringID == nil {
		q = q.Where(entassignment.SubjectOfferingIDIsNil())
	} else {
		q = q.Where(entassignment.SubjectOfferingID(*offeringID))
	}
	if n, err := q.Count(ctx); err != nil {
		return err
	} else if n > 0 {
		return nil
	}

	c := s.client.TeacherAssignment.Create().
		SetAcademicSessionID(sessionID).
		SetTeacherID(teacherID).
		SetSectionID(sectionID).
		SetRoleType(role)
	if offeringID != nil {
		c = c.SetSubjectOfferingID(*offeringID)
	}
	if _, err := c.Save(ctx); err != nil {
		return err
	}
	s.note("assignment", 1)
	return nil
}

func (s *seeder) students(ctx context.Context, session *tenantent.AcademicSession,
	sections []*tenantent.Section) error {
	if len(sections) == 0 {
		return nil
	}

	for i := 0; i < s.o.students; i++ {
		first, last := nameFor(i)
		admission := fmt.Sprintf("ADM-%s-%04d", s.o.session, i+1)
		email := fmt.Sprintf("pupil%03d@%s.demo", i+1, strings.ToLower(s.tenant.Code))

		var p *tenantent.Person
		if !s.api.enabled() {
			created, err := s.person(ctx, admission, first, last, email, fmt.Sprintf("80000000%03d", i+1))
			if err != nil {
				return err
			}
			p = created
		}
		if s.o.dryRun {
			continue
		}

		st, err := s.client.Student.Query().Where(entstudent.AdmissionNumber(admission)).Only(ctx)
		if tenantent.IsNotFound(err) {
			if s.api.enabled() {
				if _, err := s.api.post(ctx, "/api/v1/students", map[string]any{
					"person":           s.api.person(admission, first, last, email, fmt.Sprintf("80000000%03d", i+1)),
					"admission_number": admission,
					"student_code":     fmt.Sprintf("STU-%04d", i+1),
					"admission_date":   time.Now().AddDate(0, -6, 0).Format("2006-01-02"),
				}); err != nil {
					return err
				}
				st, err = s.client.Student.Query().Where(entstudent.AdmissionNumber(admission)).Only(ctx)
				if err != nil {
					return fmt.Errorf("created %s through the API but it is not in this database: %w", admission, err)
				}
				s.note("person", 1)
				s.note("cas_user", 1)
				s.note("student", 1)
			} else {
				st, err = s.client.Student.Create().
					SetPersonID(p.ID).
					SetAdmissionNumber(admission).
					SetStudentCode(fmt.Sprintf("STU-%04d", i+1)).
					SetAdmissionDate(time.Now().AddDate(0, -6, 0)).
					Save(ctx)
				if err != nil {
					return err
				}
				s.note("student", 1)
			}
		} else if err != nil {
			return err
		}

		sec := sections[i%len(sections)]
		n, err := s.client.StudentEnrollment.Query().Where(
			entenrollment.StudentID(st.ID),
			entenrollment.AcademicSessionID(session.ID),
		).Count(ctx)
		if err != nil {
			return err
		}
		if n == 0 {
			if _, err := s.client.StudentEnrollment.Create().
				SetStudentID(st.ID).
				SetAcademicSessionID(session.ID).
				SetSectionID(sec.ID).
				SetRollNumber(fmt.Sprintf("%02d", i/len(sections)+1)).
				SetEnrollmentNumber(fmt.Sprintf("ENR-%s-%04d", s.o.session, i+1)).
				SetEnrollmentDate(time.Now().AddDate(0, -6, 0)).
				Save(ctx); err != nil {
				return err
			}
			s.note("enrollment", 1)
		}

		if i >= s.o.students-s.o.noGuardian {
			continue
		}
		if err := s.guardianFor(ctx, i, st, last); err != nil {
			return err
		}
	}
	return nil
}

func (s *seeder) guardianFor(ctx context.Context, i int, st *tenantent.Student, surname string) error {
	first, _ := nameFor(i + 7)
	email := fmt.Sprintf("guardian%03d@%s.demo", i+1, strings.ToLower(s.tenant.Code))

	var g *tenantent.Guardian
	if s.api.enabled() {
		found, err := s.client.Person.Query().Where(entperson.EmailEQ(email)).Only(ctx)
		if tenantent.IsNotFound(err) {
			if _, err := s.api.post(ctx, "/api/v1/guardians", map[string]any{
				"person": s.api.person("GRD-"+st.AdmissionNumber, first, surname, email,
					fmt.Sprintf("70000000%03d", i+1)),
				"occupation": "Engineer",
			}); err != nil {
				return err
			}
			s.note("person", 1)
			s.note("cas_user", 1)
			s.note("guardian", 1)
			found, err = s.client.Person.Query().Where(entperson.EmailEQ(email)).Only(ctx)
			if err != nil {
				return fmt.Errorf("created %s through the API but it is not in this database: %w", email, err)
			}
		} else if err != nil {
			return err
		}
		g, err = s.client.Guardian.Query().Where(entguardian.PersonID(found.ID)).Only(ctx)
		if err != nil {
			return err
		}
	} else {
		p, err := s.person(ctx, "GRD-"+st.AdmissionNumber, first, surname, email,
			fmt.Sprintf("70000000%03d", i+1))
		if err != nil {
			return err
		}
		g, err = s.client.Guardian.Query().Where(entguardian.PersonID(p.ID)).Only(ctx)
		if tenantent.IsNotFound(err) {
			g, err = s.client.Guardian.Create().
				SetPersonID(p.ID).
				SetOccupation("Engineer").
				Save(ctx)
			if err != nil {
				return err
			}
			s.note("guardian", 1)
		} else if err != nil {
			return err
		}
	}

	n, err := s.client.StudentGuardian.Query().Where(
		entlink.StudentID(st.ID),
		entlink.GuardianID(g.ID),
	).Count(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	if _, err := s.client.StudentGuardian.Create().
		SetStudentID(st.ID).
		SetGuardianID(g.ID).
		SetRelationshipType(map[bool]string{true: "father", false: "mother"}[i%2 == 0]).
		SetIsPrimary(true).
		SetIsEmergencyContact(true).
		SetCanPickup(true).
		Save(ctx); err != nil {
		return err
	}
	s.note("guardian_link", 1)
	return nil
}

func (s *seeder) subjectEnrollments(ctx context.Context, session *tenantent.AcademicSession,
	offerings []*tenantent.SubjectOffering) error {
	if s.o.dryRun || len(offerings) == 0 {
		return nil
	}

	bySection := map[uuid.UUID][]*tenantent.SubjectOffering{}
	for _, off := range offerings {
		bySection[off.SectionID] = append(bySection[off.SectionID], off)
	}

	rows, err := s.client.StudentEnrollment.Query().
		Where(entenrollment.AcademicSessionID(session.ID)).
		All(ctx)
	if err != nil {
		return err
	}

	for _, e := range rows {
		for _, off := range bySection[e.SectionID] {
			n, err := s.client.StudentSubjectEnrollment.Query().Where(
				entsubjenroll.StudentEnrollmentID(e.ID),
				entsubjenroll.SubjectOfferingID(off.ID),
			).Count(ctx)
			if err != nil {
				return err
			}
			if n > 0 {
				continue
			}
			if _, err := s.client.StudentSubjectEnrollment.Create().
				SetStudentEnrollmentID(e.ID).
				SetSubjectOfferingID(off.ID).
				SetStudentID(e.StudentID).
				SetAcademicSessionID(session.ID).
				Save(ctx); err != nil {
				return err
			}
			s.note("subject_enrollment", 1)
		}
	}
	return nil
}
