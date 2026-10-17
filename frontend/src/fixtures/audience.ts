import type { AudienceRule, AudienceStaff, AudienceStudent, Delivery, NoticeAudience, NoticeReach } from '@/types/notices';
import { isStaffTarget } from '@/types/notices';

import { ENROLLMENTS } from './data/enrollment';
import { PERSONS, STAFF, STUDENTS, TEACHERS } from './data/people';
import { CURRENT_SECTIONS, CURRENT_SESSION, GRADE_LEVELS, OFFERINGS } from './data/structure';
import { TEACHER_ASSIGNMENTS } from './data/timetable';
import { caller } from './identity';
import { fail } from './rows';

export const active = ENROLLMENTS.filter((e) => e.status === 'active' && e.section_id);
const sections = CURRENT_SECTIONS.filter((s) => s.academic_session_id === CURRENT_SESSION.id && s.status !== 'archived');
const sectionById = new Map(sections.map((s) => [s.id, s]));
const offerings = OFFERINGS.filter((o) => o.academic_session_id === CURRENT_SESSION.id && sectionById.has(o.section_id ?? ''));
const offeringById = new Map(offerings.map((o) => [o.id, o]));
const teacherStaff = new Map(TEACHERS.map((t) => [t.id, t.staff_id ?? '']));
const personName = (id: string | undefined): string => PERSONS.find((p) => p.id === id)?.display_name ?? 'Staff';
const staffName = new Map(STAFF.map((s) => [s.id, personName(s.person_id)]));
const studentName = new Map(STUDENTS.map((s) => [s.id, personName(s.person_id)]));
const studentIndex = new Map(STUDENTS.map((s, i) => [s.id, i]));
const subjectName = new Map(offerings.map((o) => [o.subject_id ?? '', o.edges?.subject?.name ?? 'Subject']));

export const gradeName = (id: string | undefined): string => GRADE_LEVELS.find((g) => g.id === id)?.name ?? 'Class';
export const shortSection = (sectionId: string | undefined): string => {
  const s = sectionById.get(sectionId ?? '');
  return s ? `${gradeName(s.grade_level_id).replace('Class ', '')}${s.name ?? ''}` : 'Section';
};

// The teachers of a set of offerings and the class teachers of a set of sections, as staff ids.
const teachersOf = (offeringIds: ReadonlySet<string>, classOf: ReadonlySet<string>): string[] => [
  ...TEACHER_ASSIGNMENTS.filter((a) => offeringIds.has(a.subject_offering_id ?? '')).map((a) => teacherStaff.get(a.teacher_id ?? '') ?? ''),
  ...sections.filter((s) => classOf.has(s.id) && s.class_teacher_id).map((s) => teacherStaff.get(s.class_teacher_id ?? '') ?? ''),
];
const inGrade = (gradeId: string): Set<string> => new Set(sections.filter((s) => s.grade_level_id === gradeId).map((s) => s.id));
const offeringsIn = (sectionIds: ReadonlySet<string>): Set<string> => new Set(offerings.filter((o) => sectionIds.has(o.section_id ?? '')).map((o) => o.id));

export function labelOf(rule: AudienceRule): string {
  switch (rule.type) {
    case 'school':
    case 'branch':
      return 'All students';
    case 'grade':
      return gradeName(rule.id);
    case 'section':
      return shortSection(rule.id);
    case 'offering': {
      const o = offeringById.get(rule.id);
      return `${o?.edges?.subject?.name ?? 'Subject'} · ${shortSection(o?.section_id)}`;
    }
    case 'student':
      return studentName.get(rule.id) ?? 'Student';
    case 'staff_all':
      return 'All staff';
    case 'teachers_all':
      return 'All teachers';
    case 'teachers_grade':
      return `${gradeName(rule.id)} teachers`;
    case 'teachers_section':
      return `${shortSection(rule.id)} teachers`;
    case 'teachers_subject':
      return `${subjectName.get(rule.id) ?? 'Subject'} teachers`;
    case 'class_teachers':
      return rule.id === 'all' ? 'All class teachers' : `${gradeName(rule.id)} class teachers`;
    case 'staff':
      return staffName.get(rule.id) ?? 'Staff member';
    default: {
      const never: never = rule.type;
      return never;
    }
  }
}

// The enrolments the student-side rules reach, each once.
export function pupilsOf(rules: readonly AudienceRule[]): typeof active {
  const seen = new Set<string>();
  const out: typeof active = [];
  for (const r of rules) {
    if (isStaffTarget(r.type)) continue;
    const section = r.type === 'offering' ? offeringById.get(r.id)?.section_id : undefined;
    for (const e of active) {
      const hit = r.type === 'school' || r.type === 'branch' ? true : r.type === 'grade' ? e.grade_level_id === r.id : r.type === 'section' ? e.section_id === r.id : r.type === 'offering' ? e.section_id === section : e.student_id === r.id;
      if (hit && !seen.has(e.id)) (seen.add(e.id), out.push(e));
    }
  }
  return out;
}

// The staff the staff-side rules reach, as staff ids, each once.
export function staffOf(rules: readonly AudienceRule[]): Set<string> {
  const out = new Set<string>();
  const add = (ids: readonly string[]): void => ids.filter(Boolean).forEach((id) => out.add(id));
  for (const r of rules) {
    if (r.type === 'staff_all') add(STAFF.map((s) => s.id));
    else if (r.type === 'teachers_all') add(TEACHERS.map((t) => t.staff_id ?? ''));
    else if (r.type === 'teachers_grade') add(teachersOf(offeringsIn(inGrade(r.id)), inGrade(r.id)));
    else if (r.type === 'teachers_section') add(teachersOf(offeringsIn(new Set([r.id])), new Set([r.id])));
    else if (r.type === 'teachers_subject') add(teachersOf(new Set(offerings.filter((o) => o.subject_id === r.id).map((o) => o.id)), new Set()));
    else if (r.type === 'class_teachers') add(teachersOf(new Set(), r.id === 'all' ? new Set(sectionById.keys()) : inGrade(r.id)));
    else if (r.type === 'staff') add([r.id]);
  }
  return out;
}

// A guardian account looks after two children in the fixture school, so siblings share one.
export const householdOf = (pupil: (typeof active)[number]): number => Math.floor((studentIndex.get(pupil.student_id ?? '') ?? 0) / 2);
export const householdsOf = (pupils: typeof active): number => new Set(pupils.map(householdOf)).size;

export function reachOf(rules: readonly AudienceRule[], delivery: Delivery): NoticeReach {
  const pupils = pupilsOf(rules);
  const students = delivery === 'parents' ? 0 : pupils.length;
  const parents = delivery === 'students' ? 0 : householdsOf(pupils);
  const staff = staffOf(rules).size;
  return { students, parents, staff, sections: new Set(pupils.map((e) => e.section_id)).size, people: students + parents + staff };
}

// What the caller teaches; null means they are not a teacher and may address the whole school.
export function taughtSections(): Set<string> | null {
  const { teacherId } = caller();
  if (!teacherId) return null;
  const mine = new Set(TEACHER_ASSIGNMENTS.filter((a) => a.teacher_id === teacherId).map((a) => a.subject_offering_id));
  return new Set([...offerings.filter((o) => mine.has(o.id)).map((o) => o.section_id ?? ''), ...sections.filter((s) => s.class_teacher_id === teacherId).map((s) => s.id)]);
}

// The caller's own staff id, so a teacher sees what was sent to them.
export const callerStaff = (): string | undefined => teacherStaff.get(caller().teacherId ?? '') ?? STAFF.find((s) => s.person_id === caller().personId)?.id;

// A teacher may address their own sections and the teachers around them, and any one colleague; school-wide groups belong to the office.
export function checkScope(rules: readonly AudienceRule[]): void {
  const mine = taughtSections();
  if (!mine) return;
  const grades = new Set([...mine].map((id) => sectionById.get(id)?.grade_level_id));
  for (const r of rules) {
    if (['school', 'branch', 'staff_all', 'teachers_all', 'teachers_subject', 'class_teachers'].includes(r.type)) fail(403, 'out_of_scope', `Only the school office can address ${labelOf(r).toLowerCase()}.`);
    if (r.type === 'teachers_grade' && !grades.has(r.id)) fail(403, 'out_of_scope', `You do not teach in ${gradeName(r.id)}.`);
    if (r.type === 'teachers_section' && !mine.has(r.id)) fail(403, 'out_of_scope', `You do not teach ${shortSection(r.id)}.`);
  }
  if (pupilsOf(rules).some((e) => !mine.has(e.section_id ?? ''))) fail(403, 'out_of_scope', 'You can address only the sections you teach.');
}

export function noticeAudience(): NoticeAudience {
  const mine = taughtSections();
  const classes = GRADE_LEVELS.map((g) => {
    const list = sections
      .filter((s) => s.grade_level_id === g.id && (!mine || mine.has(s.id)))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      .map((s) => ({ id: s.id, name: s.name ?? '', students: active.filter((e) => e.section_id === s.id).length }));
    return { id: g.id, name: g.name ?? 'Class', students: list.reduce((t, s) => t + s.students, 0), sections: list };
  }).filter((c) => c.sections.length > 0);
  const subjects = mine
    ? []
    : [...subjectName]
        .map(([id, name]) => ({ id, name, teachers: staffOf([{ type: 'teachers_subject', id }]).size }))
        .sort((a, b) => a.name.localeCompare(b.name));
  return { whole_school: !mine, classes, subjects, staff: STAFF.length, teachers: TEACHERS.length };
}

export function searchAudienceStudents(query: string): AudienceStudent[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const mine = taughtSections();
  return active
    .filter((e) => !mine || mine.has(e.section_id ?? ''))
    .map((e) => ({ id: e.student_id ?? '', name: studentName.get(e.student_id ?? '') ?? 'Student', section: shortSection(e.section_id), section_id: e.section_id ?? '' }))
    .filter((s) => s.name.toLowerCase().includes(q) || s.section.toLowerCase() === q)
    .slice(0, 20);
}

// Any member of staff, described by what they teach or what they do.
export function searchAudienceStaff(query: string): AudienceStaff[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return STAFF.map((s) => {
    const teacher = TEACHERS.find((t) => t.staff_id === s.id);
    const led = sections.find((x) => x.class_teacher_id === teacher?.id);
    const detail = teacher ? [teacher.specialization, led ? `class teacher of ${shortSection(led.id)}` : null].filter(Boolean).join(' · ') : (s.designation ?? 'Staff');
    return { id: s.id, name: staffName.get(s.id) ?? 'Staff', detail };
  })
    .filter((s) => s.name.toLowerCase().includes(q) || s.detail.toLowerCase().includes(q))
    .slice(0, 20);
}
