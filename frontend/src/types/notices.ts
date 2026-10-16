import type { StreamTargetType } from './classroom';

export const NOTICE_CATEGORIES = ['general', 'academic', 'exam', 'event', 'holiday', 'urgent'] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];

// Derived from status and the two dates, never stored.
export type NoticeState = 'published' | 'scheduled' | 'draft' | 'expired' | 'archived';

// Staff have no stream-post target yet; these pick them by what they teach or lead.
export const STAFF_TARGETS = ['staff_all', 'teachers_all', 'teachers_grade', 'teachers_section', 'teachers_subject', 'class_teachers', 'staff'] as const;
export type StaffTargetType = (typeof STAFF_TARGETS)[number];
export type AudienceType = StreamTargetType | StaffTargetType;

export const isStaffTarget = (type: AudienceType): type is StaffTargetType => STAFF_TARGETS.some((t) => t === type);

// Who in a student's household receives it.
export const DELIVERIES = ['students', 'students_parents', 'parents'] as const;
export type Delivery = (typeof DELIVERIES)[number];

// An announcement board fixed to one place, such as a subject in one section: its feed and its audience.
export interface NoticeScope {
  label: string;
  rule: NoticeTarget;
  // Shown to someone who reads this subject but does not teach it.
  readOnly?: boolean;
}

export interface AudienceRule {
  type: AudienceType;
  id: string;
}

export interface NoticeTarget extends AudienceRule {
  label: string;
}

// Every person counted once, however many rules reach them.
export interface NoticeReach {
  students: number;
  parents: number;
  staff: number;
  sections: number;
  people: number;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  category: NoticeCategory;
  state: NoticeState;
  pinned: boolean;
  author: string;
  mine: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  audience: NoticeTarget[];
  delivery: Delivery;
  acknowledge: boolean;
  reach: NoticeReach;
  // Everyone it was delivered to, the base for the seen and acknowledged figures.
  recipients: number;
  seen: number;
  acknowledged: number;
  comments: number;
}

// A section's households, or the staff as one line, and how many of them have read it.
export interface NoticeSectionReach {
  section_id: string;
  label: string;
  people: number;
  seen: number;
}

export interface NoticeComment {
  id: string;
  author: string;
  body: string;
  at: string;
}

export interface NoticeDetail extends Notice {
  by_section: NoticeSectionReach[];
  thread: NoticeComment[];
}

export interface NoticeWrite {
  title: string;
  body: string;
  category: NoticeCategory;
  targets: AudienceRule[];
  delivery: Delivery;
  acknowledge: boolean;
  pinned: boolean;
  // Null publishes now; a future time schedules it.
  publish_at: string | null;
  expires_at: string | null;
  draft: boolean;
}

export interface NoticeSummary {
  live: number;
  pinned: number;
  sent_week: number;
  scheduled: number;
  drafts: number;
  seen_rate: number;
  awaiting_ack: number;
}

export interface AudienceClass {
  id: string;
  name: string;
  students: number;
  sections: { id: string; name: string; students: number }[];
}

// What the caller may address: the whole school, or only the sections they teach and the staff around them.
export interface NoticeAudience {
  whole_school: boolean;
  classes: AudienceClass[];
  subjects: { id: string; name: string; teachers: number }[];
  staff: number;
  teachers: number;
}

export interface AudienceStaff {
  id: string;
  name: string;
  detail: string;
}

export interface AudienceStudent {
  id: string;
  name: string;
  section: string;
  section_id: string;
}
