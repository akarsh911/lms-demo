import type { CorePerson } from './core';
import type { Qualification } from './people-detail';

export interface ProvisionRequest {
  username: string;
  email?: string;
  phone?: string;
  password?: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  display_name?: string;
  group_keys?: string[];
}

export interface ProvisionResult {
  person?: CorePerson;
  cas_user_id?: string;
  created_in_cas?: boolean;
  linked_existing?: boolean;
  groups?: string[];
  password?: string;
}

export type StudentStatus = 'active' | 'alumni' | 'withdrawn';

export const STUDENT_STATUSES: readonly StudentStatus[] = [
  'active',
  'alumni',
  'withdrawn',
];

export interface StudentWrite {
  person_id?: string;
  admission_number?: string;
  student_code?: string;
  admission_date?: string;
  house_id?: string;
  status?: StudentStatus;
}

export type StaffStatus = 'active' | 'inactive';

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'visiting'
  | 'intern';

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
  'full_time',
  'part_time',
  'contract',
  'visiting',
  'intern',
];

export interface StaffWrite {
  person_id?: string;
  employee_code?: string;
  department_id?: string;
  branch_id?: string;
  designation?: string;
  employment_type?: EmploymentType;
  joining_date?: string;
  status?: StaffStatus;
}

export type TeacherStatus = 'active' | 'inactive';

export interface TeacherWrite {
  staff_id?: string;
  teacher_code?: string;
  qualification_json?: Qualification[];
  specialization?: string;
  status?: TeacherStatus;
}
