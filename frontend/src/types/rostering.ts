import type { EnrollmentRow, TeacherAssignmentRow } from './academic';
import type { SubjectEnrollmentRow } from './people-detail';

export type EnrolmentStatus = 'active' | 'completed' | 'withdrawn';

export type PromotionStatus = 'promoted' | 'retained' | 'withdrawn';

export type TeachingStatus = 'active' | 'revoked' | 'completed';

export type SubjectEnrolmentStatus = 'active' | 'dropped' | 'completed';

export interface EnrollmentWrite {
  student_id?: string;
  academic_session_id?: string;
  section_id?: string;
  roll_number?: string;
  enrollment_number?: string;
  enrollment_date?: string;
  exit_date?: string;
  promotion_status?: PromotionStatus;
  status?: EnrolmentStatus;
}

export interface TeacherAssignmentWrite {
  academic_session_id?: string;
  teacher_id?: string;
  section_id?: string;
  subject_offering_id?: string;
  role_type?: string;
  is_primary?: boolean;
  valid_from?: string;
  valid_to?: string;
  status?: TeachingStatus;
}

export interface SubjectEnrollmentWrite {
  student_enrollment_id?: string;
  subject_offering_id?: string;
  is_elective_choice?: boolean;
  enrolled_on?: string;
  dropped_on?: string;
  status?: SubjectEnrolmentStatus;
}

export type { EnrollmentRow, SubjectEnrollmentRow, TeacherAssignmentRow };
