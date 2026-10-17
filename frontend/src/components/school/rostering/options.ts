import type {
  EnrolmentStatus,
  PromotionStatus,
  SubjectEnrolmentStatus,
  TeachingStatus,
} from '@/types/rostering';

export const ENROLMENT_STATUSES: readonly EnrolmentStatus[] = [
  'active',
  'completed',
  'withdrawn',
];

export const ENROLMENT_STATUS_LABELS: Record<string, string> = {
  active: 'Enrolled',
  completed: 'Finished the year',
  withdrawn: 'Withdrawn',
};

export const PROMOTION_STATUSES: readonly PromotionStatus[] = [
  'promoted',
  'retained',
  'withdrawn',
];

export const PROMOTION_STATUS_LABELS: Record<string, string> = {
  promoted: 'Promoted',
  retained: 'Retained',
  withdrawn: 'Withdrawn',
};

export const TEACHING_STATUSES: readonly TeachingStatus[] = [
  'active',
  'revoked',
  'completed',
];

export const TEACHING_STATUS_LABELS: Record<string, string> = {
  active: 'Teaching',
  revoked: 'Revoked',
  completed: 'Finished',
};

export const SUBJECT_ENROLMENT_STATUSES: readonly SubjectEnrolmentStatus[] = [
  'active',
  'dropped',
  'completed',
];

export const SUBJECT_ENROLMENT_STATUS_LABELS: Record<string, string> = {
  active: 'Taking it',
  dropped: 'Dropped',
  completed: 'Finished',
};

export const TEACHING_ROLE_TYPES: readonly string[] = [
  'class_teacher',
  'subject_teacher',
  'section_head',
  'head_of_department',
];

export const TEACHING_ROLE_LABELS: Record<string, string> = {
  class_teacher: 'Class teacher',
  subject_teacher: 'Subject teacher',
  section_head: 'Section head',
  head_of_department: 'Head of department',
};
