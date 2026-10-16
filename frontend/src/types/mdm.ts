import type { AcademicSessionRow, BranchRow, GradeLevelRef } from './school';
import type { SectionRow } from './academic';
import type { SchoolOfferingRow } from './school';

export type RowStatus = 'active' | 'inactive';

export const ROW_STATUSES: readonly RowStatus[] = ['active', 'inactive'];

export type SessionStatus = 'upcoming' | 'active' | 'closed';

export const SESSION_STATUSES: readonly SessionStatus[] = [
  'upcoming',
  'active',
  'closed',
];

export interface PostalAddress {
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  district?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface Branch extends BranchRow {
  address_json?: PostalAddress;
  phone?: string;
  email?: string;
}

export interface BranchWrite {
  name?: string;
  code?: string;
  address_json?: PostalAddress;
  phone?: string;
  email?: string;
  status?: RowStatus;
}

export interface AcademicSession extends AcademicSessionRow {
  previous_session_id?: string;
}

export interface AcademicSessionWrite {
  name?: string;
  code?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  status?: SessionStatus;
}

export interface GradeLevel extends GradeLevelRef {
  education_stage?: string;
  status?: RowStatus;
}

export interface GradeLevelWrite {
  name?: string;
  code?: string;
  sequence?: number;
  education_stage?: string;
  status?: RowStatus;
}

export interface SchoolHouse {
  id: string;
  name?: string;
  code?: string;
  display_config_json?: Record<string, unknown>;
  status?: RowStatus;
}

export interface SchoolHouseWrite {
  name?: string;
  code?: string;
  status?: RowStatus;
}

export interface Subject {
  id: string;
  name?: string;
  short_name?: string;
  code?: string;
  description?: string;
  subject_type?: string;
  is_elective?: boolean;
  status?: RowStatus;
}

export interface SubjectWrite {
  name?: string;
  code?: string;
  short_name?: string;
  description?: string;
  subject_type?: string;
  is_elective?: boolean;
  status?: RowStatus;
}

export interface SubjectGroup {
  id: string;
  name?: string;
  description?: string;
  status?: RowStatus;
}

export interface SubjectGroupWrite {
  name?: string;
  description?: string;
  status?: RowStatus;
}

export interface SectionWrite {
  academic_session_id?: string;
  branch_id?: string;
  grade_level_id?: string;
  name?: string;
  code?: string;
  capacity?: number | null;
  room_id?: string | null;
  class_teacher_id?: string | null;
  status?: RowStatus;
}

export interface OfferingWrite {
  academic_session_id?: string;
  section_id?: string;
  subject_id?: string;
  subject_group_id?: string | null;
  periods_per_week?: number | null;
  maximum_marks?: number | null;
  pass_marks?: number | null;
  grading_scheme_id?: string | null;
  status?: RowStatus;
}

export type { AcademicSessionRow, BranchRow, GradeLevelRef, SectionRow, SchoolOfferingRow };
