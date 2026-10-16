package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type roleAssignmentPayload struct {
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	TeacherID         *uuid.UUID `json:"teacher_id"`
	StudentID         *uuid.UUID `json:"student_id"`
	SectionID         *uuid.UUID `json:"section_id"`
	SubjectOfferingID *uuid.UUID `json:"subject_offering_id"`
	RoleType          *string    `json:"role_type"`
	IsPrimary         *bool      `json:"is_primary"`
	ValidFrom         *string    `json:"valid_from"`
	ValidTo           *string    `json:"valid_to"`
	Status            *string    `json:"status"`
	AssignedBy        *uuid.UUID `json:"assigned_by"`
}

func roleAssignmentDates(w http.ResponseWriter, in roleAssignmentPayload) (from, to *time.Time, ok bool) {
	f, err := parseDate(in.ValidFrom)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "valid_from must be YYYY-MM-DD")
		return nil, nil, false
	}
	t, err := parseDate(in.ValidTo)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "valid_to must be YYYY-MM-DD")
		return nil, nil, false
	}
	if f != nil && t != nil && t.Before(*f) {
		response.Error(w, http.StatusUnprocessableEntity, "valid_to cannot be before valid_from")
		return nil, nil, false
	}
	return f, t, true
}

var teacherOnlyRoles = map[string]bool{
	"class_teacher":      true,
	"subject_teacher":    true,
	"section_head":       true,
	"head_of_department": true,
}

func studentRoleAllowed(w http.ResponseWriter, role string) bool {
	if teacherOnlyRoles[strings.ToLower(strings.TrimSpace(role))] {
		response.Error(w, http.StatusBadRequest,
			"role_type "+role+" describes a teacher; use /api/v1/teacher-assignments instead")
		return false
	}
	return true
}
