import type {
  AcademicGroup,
  ClassSubject,
  DistributionProposal,
  GroupKind,
  MergePreview,
  ProposedMove,
  RollAssignment,
  RoomOption,
  SectionMove,
  SectionWrite,
  SubjectAdd,
  StructureClass,
  StructureIssue,
  StructureSection,
  TeacherOption,
  YearStructure,
} from '@/types/structure';
import type { SectionRow } from '@/types/academic';

import { GROUPS } from './data/groups';
import { STUDENTS, TEACHERS } from './data/people';
import { GRADE_LEVELS, NEXT_SESSION, OFFERINGS, ROOMS, SECTIONS, SESSIONS, SUBJECTS } from './data/structure';
import { TEACHER_ASSIGNMENTS, teacherAssignmentsOf } from './data/timetable';
import { TODAY } from './data/classroom';
import { seedId } from './ids';
import { reachNow } from './reach';
import { fail, insert, must } from './rows';
import { leadsSection, seesSection, teachesOffering } from '@/lib/reach/reach';
import { roomGroup, roomPlace } from '@/lib/school/rooms';

import { lifecycleOf, rowsOf } from './year-register';

const grades = new Map(GRADE_LEVELS.map((grade) => [grade.id, grade]));
const className = (gradeId: string | undefined): string => grades.get(gradeId ?? '')?.name ?? 'Class';
const shortName = (section: SectionRow | undefined): string => `${className(section?.grade_level_id).replace('Class ', '')}${section?.name ?? ''}`;
const teacherName = (id: string | undefined): string | null => TEACHERS.find((t) => t.id === id)?.edges?.staff?.edges?.person?.display_name ?? null;
const studentName = (id: string | undefined): string => STUDENTS.find((s) => s.id === id)?.edges?.person?.display_name ?? 'Student';
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const active = (yearId: string) => rowsOf(yearId).filter((row) => row.status !== 'withdrawn');
const isArchived = (section: SectionRow): boolean => section.status === 'archived';

// Writes are refused on a closed year, here as well as on screen.
function editableYear(yearId: string | undefined): void {
  const year = must(SESSIONS, yearId ?? '', 'academic year');
  if (lifecycleOf(year) === 'closed') fail(409, 'year_closed', `${year.name} is closed and kept for reference only.`);
}

// The school office changes the shape of the year; a class teacher looks after their own section's pupils.
function officeOnly(): void {
  if (reachNow().kind !== 'school') fail(403, 'forbidden', 'Only the school office can change classes, sections and who teaches them.');
}

function leadOnly(section: SectionRow): void {
  if (!leadsSection(reachNow(), section.id)) fail(403, 'forbidden', `Only the class teacher of ${shortName(section)} can change this.`);
}

function teachingOf(section: SectionRow): { value: number; total: number; missing: string[] } {
  const offerings = OFFERINGS.filter((o) => o.section_id === section.id);
  const taught = new Set(teacherAssignmentsOf(section.academic_session_id ?? '').map((a) => a.subject_offering_id));
  const missing = offerings.filter((o) => !taught.has(o.id)).map((o) => o.edges?.subject?.name ?? 'Subject');
  return { value: offerings.length - missing.length, total: offerings.length, missing };
}

function sectionOf(section: SectionRow): StructureSection {
  const pupils = active(section.academic_session_id ?? '').filter((row) => row.section_id === section.id);
  const room = ROOMS.find((r) => r.id === section.room_id);
  const teacher = teacherName(section.class_teacher_id);
  const teaching = teachingOf(section);
  return {
    id: section.id,
    name: section.name ?? '',
    grade_level_id: section.grade_level_id ?? '',
    class_name: className(section.grade_level_id),
    capacity: section.capacity ?? null,
    students: pupils.length,
    archived: isArchived(section),
    room: room ? { id: room.id, name: room.name ?? room.code ?? 'Room', capacity: room.capacity ?? null } : null,
    class_teacher: section.class_teacher_id && teacher ? { id: section.class_teacher_id, name: teacher } : null,
    rolls: { assigned: pupils.filter((row) => row.roll_number).length, missing: pupils.filter((row) => !row.roll_number).length },
    teaching: { value: teaching.value, total: teaching.total },
    groups: GROUPS.filter((g) => g.section_id === section.id),
  };
}

function issuesOf(gradeId: string, unassigned: number, sections: readonly StructureSection[], undivided: boolean): StructureIssue[] {
  const name = className(gradeId).replace('Class ', '');
  const labelOf = (s: StructureSection): string => (undivided ? className(gradeId) : `${name}${s.name}`);
  const issue = (fix: StructureIssue['fix'], section: StructureSection | null, count: number, title: string, detail: string): StructureIssue => ({
    id: seedId('structure-issue', gradeId, section?.id ?? 'class', fix),
    fix,
    title,
    detail,
    grade_level_id: gradeId,
    section_id: section?.id ?? null,
    count,
  });
  const out: StructureIssue[] = [];
  if (sections.length === 0) out.push(issue('sections', null, 1, `${className(gradeId)} is not set up yet`, 'Keep it as one class, or divide it into sections'));
  if (unassigned > 0) out.push(issue('arrange', null, unassigned, `${plural(unassigned, 'student')} in ${className(gradeId)} ${unassigned === 1 ? 'needs' : 'need'} a section`, 'Enrolled in the class with no section yet'));
  for (const s of sections) {
    const label = labelOf(s);
    if (!s.class_teacher) out.push(issue('teacher', s, 1, `${label} has no class teacher`, 'Choose one of the school’s teachers'));
    if (!s.room) out.push(issue('room', s, 1, `${label} has no room`, 'Choose a room from Rooms & Spaces'));
    else if (s.room.capacity !== null && s.students > s.room.capacity) out.push(issue('capacity', s, 1, `${label} has outgrown ${s.room.name}`, `${s.students} students for ${s.room.capacity} seats`));
    if (s.rolls.missing > 0) out.push(issue('rolls', s, s.rolls.missing, `Roll numbers missing in ${label}`, `${plural(s.rolls.missing, 'student')} without one`));
    if (s.teaching.total > s.teaching.value) {
      const section = SECTIONS.find((row) => row.id === s.id);
      const missing = section ? teachingOf(section).missing : [];
      const title =
        missing.length === s.teaching.total ? `No subject teachers for ${label} yet` : missing.length > 2 ? `${missing.length} subjects without a teacher in ${label}` : `${missing.join(' and ')} teacher missing for ${label}`;
      out.push(issue('teaching', s, missing.length, title, missing.length > 2 ? missing.join(' · ') : 'Assigned under Teachers & Assignments'));
    }
  }
  // Three or more sections with the same gap read as one line for the class.
  const GAP: Partial<Record<StructureIssue['fix'], string>> = { teacher: 'have no class teacher', room: 'have no room', rolls: 'have students without roll numbers', teaching: 'have subjects without a teacher' };
  return out.flatMap((one, i) => {
    const same = out.filter((other) => other.fix === one.fix && other.section_id);
    const gap = GAP[one.fix];
    if (!gap || same.length < 3) return [one];
    if (out.findIndex((other) => other.fix === one.fix && other.section_id) !== i) return [];
    const labels = same.map((other) => `${name}${sections.find((s) => s.id === other.section_id)?.name ?? ''}`);
    return [issue(one.fix, null, same.reduce((t, other) => t + other.count, 0), `${same.length} sections ${gap}`, labels.join(', '))];
  });
}

// A smaller class in the year being set up is taught as one group, so that case has something to show. Run on first read: a module-load call meets the year register half-initialised.
let seeded = false;
function seedOnce(): void {
  if (seeded) return;
  seeded = true;
  const ten = GRADE_LEVELS.find((g) => g.sequence === 10);
  if (ten && recordsOf(NEXT_SESSION.id, ten.id).length === 0) keepAsOneClass(NEXT_SESSION.id, ten.id);
}

function fullStructure(yearId: string): YearStructure {
  seedOnce();
  const year = must(SESSIONS, yearId, 'academic year');
  const rows = active(yearId);
  const inYear = SECTIONS.filter((s) => s.academic_session_id === yearId);
  // Every class the school runs, so a year being set up shows the classes it has not given sections yet.
  const gradeIds = [...GRADE_LEVELS].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((g) => g.id);

  const classes: StructureClass[] = gradeIds.map((gradeId) => {
    const records = inYear.filter((s) => s.grade_level_id === gradeId && !isArchived(s)).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map(sectionOf);
    const undivided = records.length < 2;
    const whole = undivided ? (records[0] ?? null) : null;
    // A class taught as one group has nobody unplaced: every pupil is simply in the class.
    const sections = undivided ? (whole ? [whole] : []) : records;
    const pupils = rows.filter((r) => r.grade_level_id === gradeId);
    const unassigned = undivided ? 0 : pupils.filter((r) => !r.section_id).length;
    return {
      grade_level_id: gradeId,
      name: className(gradeId),
      order: grades.get(gradeId)?.sequence ?? 0,
      students: pupils.length,
      unassigned,
      undivided,
      whole,
      sections: undivided ? [] : records,
      class_teachers: { value: sections.filter((s) => s.class_teacher).length, total: sections.length },
      rooms: { value: sections.filter((s) => s.room).length, total: sections.length },
      teaching: { value: sections.reduce((t, s) => t + s.teaching.value, 0), total: sections.reduce((t, s) => t + s.teaching.total, 0) },
      issues: issuesOf(gradeId, unassigned, sections, undivided),
    };
  });
  const all = classes.flatMap((c) => (c.whole ? [c.whole] : c.sections));
  const offerings = OFFERINGS.filter((o) => o.academic_session_id === yearId && all.some((s) => s.id === o.section_id));
  return {
    academic_session_id: yearId,
    lifecycle: lifecycleOf(year),
    classes,
    timetable: {
      sections: all.length,
      subjects_configured: { value: all.filter((s) => s.teaching.total > 0).length, total: all.length },
      periods_set: { value: offerings.filter((o) => (o.periods_per_week ?? 0) > 0).length, total: offerings.length },
      teachers_assigned: { value: all.reduce((t, s) => t + s.teaching.value, 0), total: all.reduce((t, s) => t + s.teaching.total, 0) },
      rooms_assigned: { value: all.filter((s) => s.room).length, total: all.length },
    },
  };
}

// A teacher is answered with the classes they teach or lead, and only the gaps that are theirs to close.
export function yearStructure(yearId: string): YearStructure {
  const full = fullStructure(yearId);
  const reach = reachNow();
  if (reach.kind === 'school') return full;
  const classes = full.classes.flatMap((c) => {
    const sections = c.sections.filter((s) => seesSection(reach, s.id));
    const whole = c.whole && seesSection(reach, c.whole.id) ? c.whole : null;
    const kept = whole ? [whole] : sections;
    if (kept.length === 0) return [];
    const ids = new Set(kept.map((s) => s.id));
    const issues = c.issues.filter((i) => i.fix === 'rolls' && i.section_id !== null && ids.has(i.section_id) && leadsSection(reach, i.section_id));
    return [{ ...c, sections, whole, students: kept.reduce((t, s) => t + s.students, 0), unassigned: 0, issues }];
  });
  return { ...full, classes };
}

export function classSubjects(yearId: string, gradeId: string): ClassSubject[] {
  const sections = SECTIONS.filter((s) => s.academic_session_id === yearId && s.grade_level_id === gradeId && !isArchived(s)).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const assignments = teacherAssignmentsOf(yearId);
  const bySubject = new Map<string, ClassSubject>();
  for (const section of sections) {
    for (const offering of OFFERINGS.filter((o) => o.section_id === section.id)) {
      const name = offering.edges?.subject?.name ?? 'Subject';
      const subject = SUBJECTS.find((x) => x.id === offering.subject_id);
      const entry = bySubject.get(name) ?? { subject: name, subject_id: offering.subject_id ?? '', elective: subject?.is_elective ?? false, applies_to: '', periods: offering.periods_per_week ?? 0, sections: [], missing: [] };
      const teacherId = assignments.find((a) => a.subject_offering_id === offering.id)?.teacher_id ?? null;
      const teacher = teacherName(teacherId ?? undefined);
      entry.sections.push({ section_id: section.id, section: section.name ?? '', offering_id: offering.id, teacher, teacher_id: teacher ? teacherId : null });
      if (!teacher) entry.missing.push(section.name ?? '');
      bySubject.set(name, entry);
    }
  }
  // A teacher sees every subject of a section they lead and elsewhere only the ones they teach; a pupil their own section's.
  const reach = reachNow();
  const visible = (x: ClassSubject['sections'][number]): boolean =>
    reach.kind === 'teaching' ? leadsSection(reach, x.section_id) || teachesOffering(reach, x.offering_id) : seesSection(reach, x.section_id);
  return [...bySubject.values()]
    .map((entry) => ({ ...entry, sections: entry.sections.filter(visible) }))
    .filter((entry) => entry.sections.length > 0)
    .map((entry) => ({ ...entry, applies_to: entry.sections.length === sections.length ? 'All sections' : `Sections ${entry.sections.map((s) => s.section).join(', ')}` }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

// Teaching rooms, each with the section of this year already sitting in it.
export function roomOptions(yearId: string): RoomOption[] {
  const inYear = SECTIONS.filter((s) => s.academic_session_id === yearId && !isArchived(s));
  return ROOMS.filter((room) => roomGroup(room.room_type) === 'classroom')
    .map((room) => ({
      id: room.id,
      name: room.name ?? room.code ?? 'Room',
      where: roomPlace(room),
      capacity: room.capacity ?? null,
      used_by: (() => {
        const user = inYear.find((s) => s.room_id === room.id);
        return user ? shortName(user) : null;
      })(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

// The school's teachers, with what they teach this year and any class they already lead.
export function teacherOptions(yearId: string): TeacherOption[] {
  const inYear = SECTIONS.filter((s) => s.academic_session_id === yearId && !isArchived(s));
  const assignments = teacherAssignmentsOf(yearId);
  const subjectOf = new Map(OFFERINGS.map((o) => [o.id, o.edges?.subject?.name ?? '']));
  return TEACHERS.map((teacher) => {
    const led = inYear.find((s) => s.class_teacher_id === teacher.id);
    return {
      id: teacher.id,
      name: teacherName(teacher.id) ?? 'Teacher',
      subjects: [...new Set(assignments.filter((a) => a.teacher_id === teacher.id).map((a) => subjectOf.get(a.subject_offering_id ?? '') ?? '').filter(Boolean))].sort(),
      class_teacher_of: led ? shortName(led) : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// --- subjects and who teaches them ---------------------------------------------

// One teacher per subject in a section: naming a new one ends the old assignment.
export function setSubjectTeacher(offeringId: string, teacherId: string | null): ClassSubject['sections'][number] {
  const offering = must(OFFERINGS, offeringId, 'subject');
  editableYear(offering.academic_session_id);
  officeOnly();
  if (teacherId) must(TEACHERS, teacherId, 'teacher');
  for (let i = TEACHER_ASSIGNMENTS.length - 1; i >= 0; i -= 1) if (TEACHER_ASSIGNMENTS[i]?.subject_offering_id === offeringId) TEACHER_ASSIGNMENTS.splice(i, 1);
  if (teacherId) {
    TEACHER_ASSIGNMENTS.push({ id: seedId('assignment', offeringId, teacherId, String(Date.now())), academic_session_id: offering.academic_session_id, teacher_id: teacherId, section_id: offering.section_id, subject_offering_id: offeringId, role_type: 'subject_teacher', is_primary: true, status: 'active' });
  }
  const section = must(SECTIONS, offering.section_id ?? '', 'section');
  return { section_id: section.id, section: section.name ?? '', offering_id: offeringId, teacher: teacherName(teacherId ?? undefined), teacher_id: teacherId };
}

export function addSubject(yearId: string, body: SubjectAdd): number {
  editableYear(yearId);
  officeOnly();
  if (body.section_ids.length === 0) fail(422, 'validation_failed', 'Choose where it is taught.');
  let subject = body.subject_id ? must(SUBJECTS, body.subject_id, 'subject') : SUBJECTS.find((x) => (x.name ?? '').toLowerCase() === body.name.trim().toLowerCase());
  if (!subject) {
    if (!body.name.trim()) fail(422, 'validation_failed', 'Name the subject.');
    const code = body.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
    subject = insert(SUBJECTS, { id: seedId('subject', code, String(Date.now())), name: body.name.trim(), short_name: code, code, subject_type: 'scholastic', is_elective: body.elective, status: 'active' });
  } else subject.is_elective = body.elective;
  let added = 0;
  for (const sectionId of body.section_ids) {
    const section = must(SECTIONS, sectionId, 'section');
    if (OFFERINGS.some((o) => o.section_id === sectionId && o.subject_id === subject.id)) continue;
    OFFERINGS.push({ id: seedId('offering', sectionId, subject.id, String(Date.now())), academic_session_id: yearId, section_id: sectionId, subject_id: subject.id, periods_per_week: body.periods, maximum_marks: 100, pass_marks: 33, status: 'active', edges: { subject: { id: subject.id, name: subject.name, code: subject.code }, section: { id: section.id, name: section.name } } });
    added += 1;
  }
  if (added === 0) fail(409, 'already_taught', `${subject.name ?? 'That subject'} is already taught there.`);
  return added;
}

// --- writes ------------------------------------------------------------------------

function insertSection(yearId: string, gradeId: string, body: SectionWrite): StructureSection {
  editableYear(yearId);
  const name = (body.name ?? '').trim().toUpperCase();
  if (!name) fail(422, 'validation_failed', 'A section needs a name.');
  const siblings = SECTIONS.filter((s) => s.academic_session_id === yearId && s.grade_level_id === gradeId);
  if (siblings.some((s) => !isArchived(s) && (s.name ?? '').toUpperCase() === name)) fail(409, 'name_taken', `${className(gradeId)} already has a section ${name}.`);
  const grade = must(GRADE_LEVELS, gradeId, 'class');
  const section = insert(SECTIONS, {
    id: seedId('section', yearId, gradeId, name, String(Date.now())),
    academic_session_id: yearId,
    branch_id: siblings[0]?.branch_id,
    grade_level_id: gradeId,
    name,
    code: `${grade.code ?? ''}${name}`,
    capacity: body.capacity ?? undefined,
    room_id: body.room_id ?? undefined,
    class_teacher_id: body.class_teacher_id ?? undefined,
    status: 'active',
    edges: siblings[0]?.edges,
  });
  // A new section studies what its class studies: a sibling's subjects, or last year's for this class, with no teachers yet.
  const previous = must(SESSIONS, yearId, 'academic year').previous_session_id;
  const template = siblings.find((s) => !isArchived(s)) ?? SECTIONS.find((s) => s.academic_session_id === previous && s.grade_level_id === gradeId);
  for (const offering of OFFERINGS.filter((o) => o.section_id === template?.id)) {
    OFFERINGS.push({ ...offering, id: seedId('offering', section.id, offering.edges?.subject?.code ?? offering.id), section_id: section.id, academic_session_id: yearId });
  }
  return sectionOf(section);
}

const recordsOf = (yearId: string, gradeId: string): SectionRow[] => SECTIONS.filter((s) => s.academic_session_id === yearId && s.grade_level_id === gradeId && !isArchived(s));

// Pupils of a class taught as one group belong to its one record.
function settle(yearId: string, gradeId: string): void {
  const records = recordsOf(yearId, gradeId);
  if (records.length !== 1) return;
  for (const row of rowsOf(yearId)) if (row.grade_level_id === gradeId && row.status !== 'withdrawn' && !row.section_id) row.section_id = records[0]?.id;
}

// Keeps a class not set up yet as one group, by giving it its one record.
export function keepAsOneClass(yearId: string, gradeId: string): StructureSection {
  editableYear(yearId);
  officeOnly();
  if (recordsOf(yearId, gradeId).length > 0) fail(409, 'already_set_up', `${className(gradeId)} is already set up.`);
  const made = insertSection(yearId, gradeId, { name: 'A', capacity: 40 });
  settle(yearId, gradeId);
  return made;
}

// A class is never one section: the first division makes two, A and B, and later ones add one at a time.
export function createSection(yearId: string, gradeId: string, body: SectionWrite): StructureSection {
  editableYear(yearId);
  officeOnly();
  const records = recordsOf(yearId, gradeId);
  if (records.length >= 2) return insertSection(yearId, gradeId, body);
  const first = records[0] ?? insertSection(yearId, gradeId, { name: 'A', capacity: body.capacity });
  if (first.name !== 'A') first.name = 'A';
  return insertSection(yearId, gradeId, { ...body, name: (body.name ?? '').trim().toUpperCase() === 'A' || !body.name ? 'B' : body.name });
}

export function updateSection(sectionId: string, body: SectionWrite): StructureSection {
  const section = must(SECTIONS, sectionId, 'section');
  editableYear(section.academic_session_id);
  officeOnly();
  if (body.name !== undefined) {
    const name = body.name.trim().toUpperCase();
    if (!name) fail(422, 'validation_failed', 'A section needs a name.');
    const clash = SECTIONS.find((s) => s.id !== sectionId && s.academic_session_id === section.academic_session_id && s.grade_level_id === section.grade_level_id && !isArchived(s) && (s.name ?? '').toUpperCase() === name);
    if (clash) fail(409, 'name_taken', `${className(section.grade_level_id)} already has a section ${name}.`);
    section.name = name;
  }
  if (body.capacity !== undefined) section.capacity = body.capacity ?? undefined;
  if (body.room_id !== undefined) section.room_id = body.room_id ?? undefined;
  if (body.class_teacher_id !== undefined) {
    // A teacher leads one section a year; naming them here releases the one they led.
    for (const other of SECTIONS) {
      if (body.class_teacher_id && other.id !== sectionId && other.academic_session_id === section.academic_session_id && other.class_teacher_id === body.class_teacher_id) other.class_teacher_id = undefined;
    }
    section.class_teacher_id = body.class_teacher_id ?? undefined;
  }
  return sectionOf(section);
}

// Many pupils at once, as one change. A moved pupil loses their roll number, which belongs to the section they left.
export function applyMoves(yearId: string, moves: readonly SectionMove[], reason = 'Rearranged'): number {
  editableYear(yearId);
  officeOnly();
  const rows = rowsOf(yearId);
  const running = lifecycleOf(must(SESSIONS, yearId, 'academic year')) === 'active';
  const today = TODAY;
  let moved = 0;
  for (const move of moves) {
    const row = rows.find((r) => r.id === move.enrollment_id) ?? fail(404, 'not_found', 'enrolment not found');
    if (row.status === 'withdrawn') fail(422, 'withdrawn', `${studentName(row.student_id)} has left the school and cannot be placed.`);
    if (move.to_section_id) {
      const target = must(SECTIONS, move.to_section_id, 'section');
      if (target.grade_level_id !== row.grade_level_id || isArchived(target)) fail(422, 'wrong_class', `That section is not open in ${className(row.grade_level_id)}.`);
    }
    if ((row.section_id ?? null) === move.to_section_id) continue;
    if (running && row.section_id && move.to_section_id) row.history = [...(row.history ?? []), { date: today, from_section_id: row.section_id, to_section_id: move.to_section_id, reason }];
    row.section_id = move.to_section_id ?? undefined;
    row.roll_number = undefined;
    moved += 1;
  }
  return moved;
}

export function assignRolls(sectionId: string, rolls: readonly RollAssignment[]): number {
  const section = must(SECTIONS, sectionId, 'section');
  editableYear(section.academic_session_id);
  leadOnly(section);
  const seen = new Set<string>();
  for (const r of rolls) {
    const roll = r.roll.trim();
    if (!roll) fail(422, 'validation_failed', 'Every student needs a roll number.');
    if (seen.has(roll)) fail(409, 'roll_taken', `Roll number ${roll} is given twice.`);
    seen.add(roll);
  }
  const rows = rowsOf(section.academic_session_id ?? '');
  for (const r of rolls) {
    const row = rows.find((e) => e.id === r.enrollment_id && e.section_id === sectionId) ?? fail(404, 'not_found', 'That student is not in this section.');
    row.roll_number = r.roll.trim().padStart(2, '0');
  }
  return rolls.length;
}

export function mergePreview(fromId: string, intoId: string): MergePreview {
  const from = must(SECTIONS, fromId, 'section');
  const into = must(SECTIONS, intoId, 'section');
  const summary = sectionOf(from);
  return { from: shortName(from), into: shortName(into), students: summary.students, room: summary.room?.name ?? null, class_teacher: summary.class_teacher?.name ?? null, teaching: summary.teaching.value };
}

// The pupils move, the section is archived with its history, and nothing is deleted.
export function mergeSections(fromId: string, intoId: string): number {
  const from = must(SECTIONS, fromId, 'section');
  const into = must(SECTIONS, intoId, 'section');
  if (from.id === into.id || from.grade_level_id !== into.grade_level_id || from.academic_session_id !== into.academic_session_id) fail(422, 'wrong_class', 'Sections can only merge within one class of one year.');
  const yearId = from.academic_session_id ?? '';
  const moves = active(yearId).filter((r) => r.section_id === from.id).map((r) => ({ enrollment_id: r.id, to_section_id: into.id }));
  const moved = applyMoves(yearId, moves, `Merged ${shortName(from)} into ${shortName(into)}`);
  from.status = 'archived';
  from.room_id = undefined;
  from.class_teacher_id = undefined;
  settle(yearId, from.grade_level_id ?? '');
  return moved;
}

// --- streams and batches -----------------------------------------------------------

export function createGroup(sectionId: string, name: string, kind: GroupKind): AcademicGroup {
  const section = must(SECTIONS, sectionId, 'section');
  editableYear(section.academic_session_id);
  leadOnly(section);
  if (!name.trim()) fail(422, 'validation_failed', 'Give the group a name.');
  return insert(GROUPS, { id: seedId('group', sectionId, name, String(Date.now())), section_id: sectionId, name: name.trim(), kind, student_ids: [] });
}

export function setGroupMembers(groupId: string, studentIds: readonly string[]): AcademicGroup {
  const group = must(GROUPS, groupId, 'group');
  const section = must(SECTIONS, group.section_id, 'section');
  leadOnly(section);
  editableYear(section.academic_session_id);
  const inSection = new Set(active(section.academic_session_id ?? '').filter((r) => r.section_id === section.id).map((r) => r.student_id ?? ''));
  const stray = studentIds.find((id) => !inSection.has(id));
  if (stray) fail(422, 'not_in_section', `${studentName(stray)} is not in this section.`);
  group.student_ids = [...studentIds];
  return group;
}

export function removeGroup(groupId: string): void {
  const index = GROUPS.findIndex((g) => g.id === groupId);
  if (index === -1) fail(404, 'not_found', 'group not found');
  const section = must(SECTIONS, GROUPS[index]?.section_id ?? '', 'section');
  editableYear(section.academic_session_id);
  leadOnly(section);
  GROUPS.splice(index, 1);
}

// --- proposals the school's system makes; the screen only shows and applies them ---

const proposed = (row: { id: string; student_id?: string; section_id?: string }, to: SectionRow | undefined): ProposedMove => ({
  enrollment_id: row.id,
  student_id: row.student_id ?? '',
  name: studentName(row.student_id),
  from_section: row.section_id ? shortName(SECTIONS.find((s) => s.id === row.section_id)) : null,
  to_section_id: to?.id ?? null,
  to_section: to ? shortName(to) : null,
});

// Every unplaced pupil to the least full section, then pupils over a section's target to the least full other one.
export function recommendedDistribution(yearId: string, gradeId: string): DistributionProposal {
  const sections = SECTIONS.filter((s) => s.academic_session_id === yearId && s.grade_level_id === gradeId && !isArchived(s));
  const rows = active(yearId).filter((r) => r.grade_level_id === gradeId);
  const size = new Map(sections.map((s) => [s.id, rows.filter((r) => r.section_id === s.id).length]));
  const smallest = (except?: string): SectionRow | undefined => sections.filter((s) => s.id !== except).sort((a, b) => (size.get(a.id) ?? 0) - (size.get(b.id) ?? 0))[0];
  const moves: ProposedMove[] = [];
  for (const row of rows.filter((r) => !r.section_id)) {
    const to = smallest();
    if (!to) break;
    moves.push(proposed(row, to));
    size.set(to.id, (size.get(to.id) ?? 0) + 1);
  }
  for (const section of sections) {
    const target = section.capacity ?? 40;
    const over = rows.filter((r) => r.section_id === section.id).slice(target);
    for (const row of over) {
      const to = smallest(section.id);
      if (!to || (size.get(to.id) ?? 0) >= (to.capacity ?? 40)) break;
      moves.push(proposed(row, to));
      size.set(to.id, (size.get(to.id) ?? 0) + 1);
      size.set(section.id, (size.get(section.id) ?? 0) - 1);
    }
  }
  const places = sections.reduce((t, s) => t + (s.capacity ?? 40), 0);
  const short = rows.length > places ? ` ${className(gradeId)} has ${rows.length} students for ${places} places, so ${plural(rows.length - places, 'section')} run one over; a new section may be the better answer.` : '';
  return {
    grade_level_id: gradeId,
    summary: moves.length === 0 ? `The class is already balanced.${short}` : `${plural(moves.length, 'student')} into the smallest sections.${short}`,
    moves,
  };
}

// For a draft year: last year's pupils, moving up, into the section of the same letter. Applying it creates their enrolments.
export function nextYearProposal(yearId: string, gradeId: string): DistributionProposal {
  if (yearId !== NEXT_SESSION.id) fail(422, 'not_draft', 'Only a year being set up takes a proposal from the year before.');
  const grade = must(GRADE_LEVELS, gradeId, 'class');
  const lower = GRADE_LEVELS.find((g) => (g.sequence ?? 0) === (grade.sequence ?? 0) - 1);
  const year = must(SESSIONS, yearId, 'academic year');
  const previous = year.previous_session_id ?? '';
  const sections = SECTIONS.filter((s) => s.academic_session_id === yearId && s.grade_level_id === gradeId && !isArchived(s));
  const already = new Set(rowsOf(yearId).map((r) => r.student_id));
  const coming = active(previous).filter(
    (r) => !already.has(r.student_id) && ((r.grade_level_id === lower?.id && r.next_year === 'promote') || (r.grade_level_id === gradeId && r.next_year === 'retain')),
  );
  const moves = coming.map((r) => {
    const letter = SECTIONS.find((s) => s.id === r.section_id)?.name;
    return proposed({ id: r.id, student_id: r.student_id }, sections.find((s) => s.name === letter) ?? sections[0]);
  });
  return { grade_level_id: gradeId, summary: moves.length === 0 ? 'Nobody from last year is waiting for this class.' : 'Each goes into the section of the same letter, as 6A to 7A.', moves };
}

export function applyNextYearProposal(yearId: string, gradeId: string, moves: readonly SectionMove[]): number {
  editableYear(yearId);
  officeOnly();
  const source = new Map(nextYearProposal(yearId, gradeId).moves.map((m) => [m.enrollment_id, m]));
  let made = 0;
  for (const move of moves) {
    const from = source.get(move.enrollment_id);
    if (!from) continue;
    rowsOf(yearId).push({
      id: seedId('enrollment', yearId, from.student_id),
      student_id: from.student_id,
      academic_session_id: yearId,
      section_id: move.to_section_id ?? undefined,
      grade_level_id: gradeId,
      enrollment_date: '2027-04-01',
      status: 'active',
      entry: 'promoted',
      edges: { student: { id: from.student_id, admission_number: STUDENTS.find((s) => s.id === from.student_id)?.admission_number } },
    });
    made += 1;
  }
  return made;
}

