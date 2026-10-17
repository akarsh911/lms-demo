import { EMPLOYMENT_TYPES, STUDENT_STATUSES } from '@/types/people-write';
import { ROLE_BEARING_GROUPS, ADMISSION_GROUP_KEYS } from '@/constants/personas';
import type { AdmissionStep } from '@/hooks/mutation/use-admission';

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'On contract',
  visiting: 'Visiting',
  intern: 'Intern',
};

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  active: 'On the roll',
  alumni: 'Alumnus',
  withdrawn: 'Withdrawn',
};

export const RECORD_STATUSES: readonly string[] = ['active', 'inactive'];

export const RECORD_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

export const STEP_LABELS: Record<AdmissionStep, string> = {
  identity: 'The sign-in identity',
  student: 'The pupil record',
  staff: 'The staff record',
  teacher: 'The teaching record',
  enrolment: 'The class enrolment',
};

export function designationFor(groupKey: string): string {
  return ROLE_BEARING_GROUPS[groupKey] ?? groupKey;
}

export { EMPLOYMENT_TYPES, STUDENT_STATUSES, ADMISSION_GROUP_KEYS };
