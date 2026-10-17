import type { AssignmentRow, AssignmentSubmissionRow } from '@/types/classroom';
import type { GradeWrite, HandIn, Homework, HomeworkDetail, HomeworkOptions, HomeworkState, HomeworkSummary, HomeworkWrite, MyWork, StudentWork, WorkStatus } from '@/types/homework';

import { ASSIGNMENT_ITEMS, ASSIGNMENTS, SUBMISSIONS } from './data/classroom';
import { ENROLLMENTS } from './data/enrollment';
import { ASSIGNMENT_TARGETS, HOMEWORK_META, WORK_FEEDBACK, WORK_FILES } from './data/homework';
import { PERSONS, STUDENTS, TEACHERS } from './data/people';
import { CURRENT_SECTIONS, CURRENT_SESSION, GRADE_LEVELS, OFFERINGS } from './data/structure';
import { TEACHER_ASSIGNMENTS } from './data/timetable';
import { caller } from './identity';
import { newId } from './ids';
import { reachNow } from './reach';
import { fail, must } from './rows';

const active = ENROLLMENTS.filter((e) => e.status === 'active' && e.section_id);
const offeringById = new Map(OFFERINGS.map((o) => [o.id, o]));
const sectionById = new Map(CURRENT_SECTIONS.map((s) => [s.id, s]));
const gradeName = (id: string | undefined): string => GRADE_LEVELS.find((g) => g.id === id)?.name ?? 'Class';
const shortName = (sectionId: string | undefined): string => {
  const s = sectionById.get(sectionId ?? '');
  return s ? `${gradeName(s.grade_level_id).replace('Class ', '')}${s.name ?? ''}` : 'Section';
};
const personName = (id: string | undefined): string => PERSONS.find((p) => p.id === id)?.display_name ?? 'Unknown';
const teacherName = (id: string | undefined): string => TEACHERS.find((t) => t.id === id)?.edges?.staff?.edges?.person?.display_name ?? 'No teacher';
const studentName = (id: string | undefined): string => personName(STUDENTS.find((s) => s.id === id)?.person_id);

// The offerings the caller teaches, or null for someone who is not a teacher and sees every class.
function taught(): Set<string> | null {
  const { teacherId } = caller();
  return teacherId ? new Set(TEACHER_ASSIGNMENTS.filter((a) => a.teacher_id === teacherId).map((a) => a.subject_offering_id ?? '')) : null;
}

function stateOf(a: AssignmentRow, now: string): HomeworkState {
  if (a.status === 'draft') return 'draft';
  if (a.status === 'closed') return 'closed';
  if (a.available_from && a.available_from > now) return 'scheduled';
  return (a.due_at ?? '') > now ? 'open' : 'due';
}

const groupBy = <T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const list = out.get(key(row));
    if (list) list.push(row);
    else out.set(key(row), [row]);
  }
  return out;
};

// Rows looked up per assignment, built once per answer rather than scanned per row.
interface Index {
  subs: Map<string, AssignmentSubmissionRow[]>;
  targets: Map<string, typeof ASSIGNMENT_TARGETS>;
  pupils: Map<string, typeof active>;
}
const indexNow = (): Index => ({
  subs: groupBy(SUBMISSIONS, (s) => s.assignment_id ?? ''),
  targets: groupBy(ASSIGNMENT_TARGETS, (t) => t.assignment_id ?? ''),
  pupils: groupBy(active, (e) => e.section_id ?? ''),
});

// Who has the assignment: the named students when there are any, otherwise the whole section today.
function assignedTo(a: AssignmentRow, ix: Index = indexNow()): typeof active {
  const named = new Set((ix.targets.get(a.id) ?? []).filter((t) => t.target_type === 'student').map((t) => t.target_id));
  const section = ix.pupils.get(offeringById.get(a.subject_offering_id ?? '')?.section_id ?? '') ?? [];
  return named.size > 0 ? section.filter((e) => named.has(e.student_id ?? '')) : section;
}

function statusOf(sub: AssignmentSubmissionRow | undefined, state: HomeworkState, excused: boolean): WorkStatus {
  if (excused) return 'excused';
  if (!sub || sub.status === 'draft') return state === 'due' || state === 'closed' ? 'missing' : 'pending';
  if (sub.status === 'returned') return 'returned';
  if (sub.status === 'graded') return 'graded';
  return sub.late ? 'late' : 'submitted';
}

const EXCUSED = new Set<string>();

const studentNames = new Map(STUDENTS.map((s) => [s.id, personName(s.person_id)]));

function workOf(a: AssignmentRow, now: string, ix: Index = indexNow()): StudentWork[] {
  const state = stateOf(a, now);
  const subs = new Map((ix.subs.get(a.id) ?? []).map((s) => [s.student_id, s]));
  return assignedTo(a, ix)
    .map((e) => {
      const sub = subs.get(e.student_id);
      return {
        enrollment_id: e.id,
        student_id: e.student_id ?? '',
        name: studentNames.get(e.student_id ?? '') ?? 'Student',
        roll: e.roll_number ?? null,
        status: statusOf(sub, state, EXCUSED.has(`${a.id}:${e.student_id}`)),
        submitted_at: sub?.submitted_at ?? null,
        attempt: sub?.attempt_number ?? 0,
        marks: sub?.marks_obtained ?? null,
        feedback: sub ? (WORK_FEEDBACK.get(sub.id) ?? null) : null,
        files: sub ? (WORK_FILES.get(sub.id) ?? []) : [],
      };
    })
    .sort((x, y) => Number(x.roll ?? 999) - Number(y.roll ?? 999) || x.name.localeCompare(y.name));
}

function toHomework(a: AssignmentRow, now: string, ix: Index = indexNow()): Homework {
  const offering = offeringById.get(a.subject_offering_id ?? '');
  const section = sectionById.get(offering?.section_id ?? '');
  const work = workOf(a, now, ix);
  const named = (ix.targets.get(a.id) ?? []).some((t) => t.target_type === 'student');
  const graded = work.filter((w) => w.status === 'graded' || w.status === 'returned');
  const max = a.maximum_marks ?? 0;
  return {
    id: a.id,
    title: a.title ?? 'Untitled',
    type: a.assignment_type ?? 'worksheet',
    subject: offering?.edges?.subject?.name ?? 'Subject',
    subject_id: offering?.subject_id ?? '',
    class_name: gradeName(section?.grade_level_id),
    grade_level_id: section?.grade_level_id ?? '',
    section_id: section?.id ?? '',
    section: shortName(section?.id),
    offering_id: offering?.id ?? '',
    teacher: teacherName(a.teacher_id),
    teacher_id: a.teacher_id ?? '',
    mine: Boolean(caller().teacherId) && a.teacher_id === caller().teacherId,
    state: stateOf(a, now),
    available_from: a.available_from ?? null,
    due_at: a.due_at ?? '',
    max_marks: max,
    late_allowed: a.late_submission_allowed ?? false,
    students_only: named ? work.length : null,
    assigned: work.filter((w) => w.status !== 'excused').length,
    submitted: work.filter((w) => ['submitted', 'late', 'graded', 'returned'].includes(w.status)).length,
    late: work.filter((w) => w.status === 'late').length,
    graded: graded.length,
    missing: work.filter((w) => w.status === 'missing').length,
    average: graded.length === 0 || max === 0 ? null : Math.round((graded.reduce((t, w) => t + (w.marks ?? 0), 0) / (graded.length * max)) * 100),
  };
}

// A pupil is never answered with the class's work; they read their own through `myWork`.
const inYear = (): AssignmentRow[] => {
  if (reachNow().kind === 'self') return [];
  const mine = taught();
  return ASSIGNMENTS.filter((a) => a.academic_session_id === CURRENT_SESSION.id && (!mine || mine.has(a.subject_offering_id ?? '')));
};

export function listHomework(): Homework[] {
  const now = new Date().toISOString();
  const ix = indexNow();
  return inYear()
    .map((a) => toHomework(a, now, ix))
    .sort((x, y) => x.due_at.localeCompare(y.due_at));
}

export function homeworkSummary(): HomeworkSummary {
  const all = listHomework();
  const week = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const now = new Date().toISOString();
  return {
    open: all.filter((h) => h.state === 'open' || h.state === 'due').length,
    past_due: all.filter((h) => h.state === 'due').length,
    average: (() => {
      const graded = all.filter((h) => h.average !== null);
      const weight = graded.reduce((t, h) => t + h.graded, 0);
      return weight === 0 ? null : Math.round(graded.reduce((t, h) => t + (h.average ?? 0) * h.graded, 0) / weight);
    })(),
    due_this_week: all.filter((h) => h.state === 'open' && h.due_at <= week && h.due_at > now).length,
    to_grade: all.reduce((t, h) => t + (h.submitted - h.graded), 0),
    missing: all.filter((h) => h.state === 'due').reduce((t, h) => t + h.missing, 0),
  };
}

export function homeworkDetail(id: string): HomeworkDetail {
  const a = must(inYear(), id, 'assignment');
  const now = new Date().toISOString();
  const items = ASSIGNMENT_ITEMS.filter((i) => i.assignment_id === id).sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
  const meta = HOMEWORK_META.get(id);
  return {
    ...toHomework(a, now),
    description: a.description ?? '',
    instructions: a.instructions ?? '',
    attachments: meta?.attachments ?? [],
    items: items.map((i) => ({ position: i.position ?? 0, label: `Question ${i.position ?? ''}`, marks: i.marks ?? 0 })),
    work: workOf(a, now),
    reminders_sent: meta?.reminders ?? 0,
  };
}

export function myWork(): MyWork[] {
  const reach = reachNow();
  if (reach.kind !== 'self') return [];
  const now = new Date().toISOString();
  const ix = indexNow();
  return ASSIGNMENTS.filter((a) => a.academic_session_id === CURRENT_SESSION.id && !['draft', 'scheduled'].includes(stateOf(a, now)))
    .flatMap((a) => {
      const work = workOf(a, now, ix).find((w) => w.student_id === reach.studentId);
      if (!work) return [];
      const offering = offeringById.get(a.subject_offering_id ?? '');
      return [
        {
          id: a.id,
          title: a.title ?? 'Untitled',
          type: a.assignment_type ?? 'worksheet',
          subject: offering?.edges?.subject?.name ?? 'Subject',
          offering_id: offering?.id ?? '',
          teacher: teacherName(a.teacher_id),
          state: stateOf(a, now),
          due_at: a.due_at ?? '',
          max_marks: a.maximum_marks ?? 0,
          late_allowed: a.late_submission_allowed ?? false,
          description: a.description ?? '',
          instructions: a.instructions ?? '',
          attachments: HOMEWORK_META.get(a.id)?.attachments ?? [],
          status: work.status,
          submitted_at: work.submitted_at,
          marks: work.marks,
          feedback: work.feedback,
          files: work.files,
        },
      ];
    })
    .sort((x, y) => x.due_at.localeCompare(y.due_at));
}

// A pupil hands in their own work: late only where the assignment takes late work, never once it is closed or marked.
export function handIn(id: string, body: HandIn): MyWork {
  const reach = reachNow();
  if (reach.kind !== 'self') fail(403, 'forbidden', 'Only the student the work was set for can hand it in.');
  const a = must(ASSIGNMENTS, id, 'assignment');
  if (!myWork().some((w) => w.id === id)) fail(404, 'not_found', 'This assignment was not set for you.');
  const now = new Date().toISOString();
  const state = stateOf(a, now);
  if (state === 'closed') fail(409, 'closed', 'This assignment is closed.');
  if (state === 'due' && !a.late_submission_allowed) fail(409, 'past_due', 'The due date has passed and this assignment does not take late work.');
  if (body.files.length === 0) fail(422, 'validation_failed', 'Attach your work before handing it in.');
  const existing = SUBMISSIONS.find((s) => s.assignment_id === id && s.student_id === reach.studentId);
  if (existing && (existing.status === 'graded' || existing.status === 'returned')) fail(409, 'graded', 'Your work has been marked. Ask your teacher if you need to hand it in again.');
  const submission = existing ?? { id: newId(), assignment_id: id, student_id: reach.studentId, total_marks: a.maximum_marks };
  Object.assign(submission, { status: 'submitted', submitted_at: now, late: state === 'due', attempt_number: (existing?.attempt_number ?? 0) + 1 });
  if (!existing) SUBMISSIONS.push(submission);
  WORK_FILES.set(submission.id, [...body.files]);
  return myWork().find((w) => w.id === id) ?? fail(500, 'lost', 'The hand-in was saved but could not be read back.');
}

export function homeworkOptions(): HomeworkOptions {
  const mine = taught();
  const pupils = groupBy(active, (e) => e.section_id ?? '');
  const classes = GRADE_LEVELS.map((g) => {
    const offerings = OFFERINGS.filter((o) => o.academic_session_id === CURRENT_SESSION.id && sectionById.get(o.section_id ?? '')?.grade_level_id === g.id && sectionById.get(o.section_id ?? '')?.status !== 'archived' && (!mine || mine.has(o.id)));
    const bySubject = new Map<string, HomeworkOptions['classes'][number]['subjects'][number]>();
    for (const o of offerings) {
      const entry = bySubject.get(o.subject_id ?? '') ?? { subject_id: o.subject_id ?? '', name: o.edges?.subject?.name ?? 'Subject', sections: [] };
      entry.sections.push({
        section_id: o.section_id ?? '',
        section: shortName(o.section_id),
        offering_id: o.id,
        teacher: TEACHER_ASSIGNMENTS.find((t) => t.subject_offering_id === o.id) ? teacherName(TEACHER_ASSIGNMENTS.find((t) => t.subject_offering_id === o.id)?.teacher_id) : null,
        students: (pupils.get(o.section_id ?? '') ?? [])
          .map((e) => ({ student_id: e.student_id ?? '', name: studentNames.get(e.student_id ?? '') ?? 'Student', roll: e.roll_number ?? null }))
          .sort((x, y) => Number(x.roll ?? 999) - Number(y.roll ?? 999)),
      });
      bySubject.set(o.subject_id ?? '', entry);
    }
    const subjects = [...bySubject.values()].map((s) => ({ ...s, sections: s.sections.sort((x, y) => x.section.localeCompare(y.section)) })).sort((x, y) => x.name.localeCompare(y.name));
    return { id: g.id, name: g.name ?? 'Class', subjects };
  }).filter((c) => c.subjects.length > 0);
  return { classes };
}

// --- writes ---------------------------------------------------------------------

function check(body: HomeworkWrite, keptDue?: string): void {
  if (!body.title.trim()) fail(422, 'validation_failed', 'Give the assignment a title.');
  if (body.section_ids.length === 0) fail(422, 'validation_failed', 'Choose at least one section.');
  if (!body.due_at) fail(422, 'validation_failed', 'Set when it is due.');
  if (body.available_from && body.available_from >= body.due_at) fail(422, 'validation_failed', 'It has to open before it is due.');
  if (!body.draft && body.due_at !== keptDue && body.due_at <= new Date().toISOString()) fail(422, 'validation_failed', 'The due time has already passed.');
  if (body.max_marks < 0 || body.max_marks > 500) fail(422, 'validation_failed', 'Maximum marks must be between 0 and 500.');
}

const offeringFor = (sectionId: string, subjectId: string): string => {
  const o = OFFERINGS.find((x) => x.section_id === sectionId && x.subject_id === subjectId);
  if (!o) fail(422, 'not_offered', `${shortName(sectionId)} does not study that subject.`);
  const mine = taught();
  if (mine && !mine.has(o.id)) fail(403, 'out_of_scope', `You do not teach this subject in ${shortName(sectionId)}.`);
  return o.id;
};

const fields = (body: HomeworkWrite) => ({
  title: body.title.trim(),
  description: body.description.trim(),
  instructions: body.instructions.trim(),
  assignment_type: body.type,
  available_from: body.available_from ?? new Date().toISOString(),
  due_at: body.due_at,
  late_submission_allowed: body.late_allowed,
  max_attempts: body.max_attempts,
  maximum_marks: body.max_marks,
  status: body.draft ? ('draft' as const) : ('published' as const),
});

function setTargets(id: string, sectionId: string, studentIds: readonly string[]): void {
  for (let i = ASSIGNMENT_TARGETS.length - 1; i >= 0; i -= 1) if (ASSIGNMENT_TARGETS[i]?.assignment_id === id) ASSIGNMENT_TARGETS.splice(i, 1);
  const here = new Set(active.filter((e) => e.section_id === sectionId).map((e) => e.student_id));
  const named = studentIds.filter((s) => here.has(s));
  if (named.length > 0) named.forEach((s) => ASSIGNMENT_TARGETS.push({ id: newId(), assignment_id: id, target_type: 'student', target_id: s }));
  else ASSIGNMENT_TARGETS.push({ id: newId(), assignment_id: id, target_type: 'section', target_id: sectionId });
}

// One assignment per chosen section, so each section's teacher grades their own; named students narrow each one.
export function createHomework(body: HomeworkWrite): Homework[] {
  check(body);
  const now = new Date().toISOString();
  const offerings = body.section_ids.map((sid) => ({ sid, oid: offeringFor(sid, body.subject_id) }));
  return offerings.map(({ sid, oid }) => {
    const id = newId();
    const teacher = caller().teacherId ?? TEACHER_ASSIGNMENTS.find((t) => t.subject_offering_id === oid)?.teacher_id;
    ASSIGNMENTS.push({ id, academic_session_id: CURRENT_SESSION.id, teacher_id: teacher, subject_offering_id: oid, created_at: now, ...fields(body) });
    setTargets(id, sid, body.student_ids);
    HOMEWORK_META.set(id, { attachments: body.attachments, reminders: 0 });
    return toHomework(must(ASSIGNMENTS, id, 'assignment'), now);
  });
}

export function updateHomework(id: string, body: HomeworkWrite): Homework {
  const a = must(inYear(), id, 'assignment');
  check(body, a.due_at);
  const sectionId = offeringById.get(a.subject_offering_id ?? '')?.section_id ?? '';
  const handedIn = SUBMISSIONS.some((s) => s.assignment_id === id);
  // Once work has come in, the marks it was set out of are fixed.
  if (handedIn && body.max_marks !== a.maximum_marks) fail(409, 'work_submitted', 'Students have already handed work in, so the maximum marks cannot change.');
  Object.assign(a, fields(body), a.status === 'closed' ? { status: 'closed' } : {});
  setTargets(id, sectionId, body.student_ids);
  HOMEWORK_META.set(id, { attachments: body.attachments, reminders: HOMEWORK_META.get(id)?.reminders ?? 0 });
  return toHomework(a, new Date().toISOString());
}

export function setHomeworkDue(id: string, dueAt: string): Homework {
  const a = must(inYear(), id, 'assignment');
  if (dueAt <= new Date().toISOString()) fail(422, 'validation_failed', 'Choose a time in the future.');
  a.due_at = dueAt;
  if (a.status === 'closed') a.status = 'published';
  return toHomework(a, new Date().toISOString());
}

export function closeHomework(id: string, closed: boolean): Homework {
  const a = must(inYear(), id, 'assignment');
  if (a.status === 'draft') fail(409, 'draft', 'A draft has not been set yet.');
  a.status = closed ? 'closed' : 'published';
  return toHomework(a, new Date().toISOString());
}

export function deleteHomework(id: string): void {
  const a = must(inYear(), id, 'assignment');
  if (a.status !== 'draft') fail(409, 'not_draft', 'Only a draft can be deleted; close a set assignment instead.');
  ASSIGNMENTS.splice(ASSIGNMENTS.indexOf(a), 1);
}

export function remindMissing(id: string): number {
  const detail = homeworkDetail(id);
  const waiting = detail.work.filter((w) => w.status === 'missing' || w.status === 'pending').length;
  if (waiting === 0) fail(409, 'nobody_waiting', 'Everyone has handed it in.');
  const meta = HOMEWORK_META.get(id) ?? { attachments: [], reminders: 0 };
  HOMEWORK_META.set(id, { ...meta, reminders: meta.reminders + 1 });
  return waiting;
}

export function gradeWork(id: string, body: GradeWrite): HomeworkDetail {
  const a = must(inYear(), id, 'assignment');
  const max = a.maximum_marks ?? 0;
  if (body.marks !== null && (body.marks < 0 || body.marks > max)) fail(422, 'validation_failed', `Marks must be between 0 and ${max}.`);
  if (!assignedTo(a).some((e) => e.student_id === body.student_id)) fail(404, 'not_found', 'That student does not have this assignment.');
  let sub = SUBMISSIONS.find((s) => s.assignment_id === id && s.student_id === body.student_id);
  // Marking work that never came in records it as handed in on paper.
  if (!sub) {
    sub = { id: newId(), assignment_id: id, student_id: body.student_id, attempt_number: 1, submitted_at: new Date().toISOString(), status: 'submitted', late: (a.due_at ?? '') < new Date().toISOString(), total_marks: max };
    SUBMISSIONS.push(sub);
    WORK_FILES.set(sub.id, ['Handed in on paper']);
  }
  sub.marks_obtained = body.marks ?? undefined;
  sub.status = body.marks === null ? 'submitted' : body.return_now ? 'returned' : 'graded';
  sub.graded_at = body.marks === null ? undefined : new Date().toISOString();
  if (body.feedback.trim()) WORK_FEEDBACK.set(sub.id, body.feedback.trim());
  else WORK_FEEDBACK.delete(sub.id);
  EXCUSED.delete(`${id}:${body.student_id}`);
  return homeworkDetail(id);
}

export function excuseWork(id: string, studentId: string, excused: boolean): HomeworkDetail {
  must(inYear(), id, 'assignment');
  if (excused) EXCUSED.add(`${id}:${studentId}`);
  else EXCUSED.delete(`${id}:${studentId}`);
  return homeworkDetail(id);
}

// Hands back every graded piece of work at once.
export function returnAll(id: string): number {
  must(inYear(), id, 'assignment');
  const ready = SUBMISSIONS.filter((s) => s.assignment_id === id && s.status === 'graded');
  ready.forEach((s) => (s.status = 'returned'));
  return ready.length;
}
