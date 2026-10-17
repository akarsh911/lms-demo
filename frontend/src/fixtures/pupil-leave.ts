import type { MyPupilLeave, PupilLeave, PupilLeaveWrite } from '@/types/pupil-leave';

import { ATTENDANCE_DAYS } from './data/classroom';
import { dayFrom } from './data/actions';
import { ENROLLMENTS } from './data/enrollment';
import { PERSONS, STUDENTS, TEACHERS } from './data/people';
import { CURRENT_SECTIONS, GRADE_LEVELS } from './data/structure';
import { CALENDAR_DAYS } from './data/timetable';
import { PERSONA_STUDENT } from './identity';
import { newId, seedId } from './ids';
import { reachNow } from './reach';
import { fail, must } from './rows';

interface NoteRow {
  id: string;
  student_id: string;
  section_id: string;
  from: string;
  to: string;
  reason: string;
  status: PupilLeave['status'];
  applied_at: string;
  decided_by: string | null;
}

const name = (studentId: string): string => PERSONS.find((p) => p.id === STUDENTS.find((s) => s.id === studentId)?.person_id)?.display_name ?? 'Student';
const label = (sectionId: string): string => {
  const s = CURRENT_SECTIONS.find((x) => x.id === sectionId);
  return `${(GRADE_LEVELS.find((g) => g.id === s?.grade_level_id)?.name ?? '').replace('Class ', '')}${s?.name ?? ''}`;
};
const sectionOf = (studentId: string): string => ENROLLMENTS.find((e) => e.student_id === studentId && e.status === 'active')?.section_id ?? '';
const schoolDays = (from: string, to: string): number => CALENDAR_DAYS.filter((d) => d.forenoon_open && (d.calendar_date ?? '').slice(0, 10) >= from && (d.calendar_date ?? '').slice(0, 10) <= to).length;

// The demo pupil's earlier note, and two waiting with the demo teacher's own class.
const NOTES: NoteRow[] = (() => {
  const pupil = STUDENTS[PERSONA_STUDENT]?.id ?? '';
  const led = CURRENT_SECTIONS.find((s) => s.class_teacher_id === TEACHERS[0]?.id)?.id ?? '';
  const classmates = ENROLLMENTS.filter((e) => e.section_id === led && e.status === 'active').slice(3, 5);
  return [
    { id: seedId('pupil-leave', 'seed', 0), student_id: pupil, section_id: sectionOf(pupil), from: dayFrom(-21), to: dayFrom(-20), reason: 'Fever; doctor advised two days of rest', status: 'approved', applied_at: `${dayFrom(-21)}T07:30:00Z`, decided_by: null },
    ...classmates.map((e, i): NoteRow => ({ id: seedId('pupil-leave', 'seed', i + 1), student_id: e.student_id ?? '', section_id: led, from: dayFrom(i === 0 ? -2 : 1), to: dayFrom(i === 0 ? -2 : 2), reason: i === 0 ? 'Family wedding out of town' : 'Inter-school swimming trials', status: 'pending', applied_at: `${dayFrom(-1)}T08:10:00Z`, decided_by: null })),
  ];
})();

const toNote = (r: NoteRow): PupilLeave => ({ ...r, student: name(r.student_id), section: label(r.section_id), days: schoolDays(r.from, r.to) });
const classTeacher = (sectionId: string): string | null => {
  const id = CURRENT_SECTIONS.find((s) => s.id === sectionId)?.class_teacher_id;
  return id ? (TEACHERS.find((t) => t.id === id)?.edges?.staff?.edges?.person?.display_name ?? null) : null;
};

// An approved note explains every absence inside its dates.
function explain(r: NoteRow): void {
  for (const d of ATTENDANCE_DAYS) if (d.student_id === r.student_id && (d.attendance_date ?? '') >= r.from && (d.attendance_date ?? '') <= r.to && d.forenoon_status === 'absent' && !d.reason_code) d.reason_code = 'leave';
}
for (const r of NOTES) if (r.status === 'approved') explain(r);

function self(): { studentId: string; sectionId: string } {
  const reach = reachNow();
  if (reach.kind !== 'self') fail(403, 'forbidden', 'Leave notes are sent for a pupil, from their own account.');
  return { studentId: reach.studentId, sectionId: reach.sectionId ?? sectionOf(reach.studentId) };
}

export function myPupilLeave(): MyPupilLeave {
  const { studentId, sectionId } = self();
  const unexplained = ATTENDANCE_DAYS.filter((d) => d.student_id === studentId && d.forenoon_status === 'absent' && !d.reason_code && (d.attendance_date ?? '') >= dayFrom(-28))
    .map((d) => d.attendance_date ?? '')
    .filter((d) => !NOTES.some((n) => n.student_id === studentId && n.status === 'pending' && d >= n.from && d <= n.to))
    .sort();
  return { notes: NOTES.filter((n) => n.student_id === studentId).map(toNote).sort((a, b) => b.from.localeCompare(a.from)), unexplained, class_teacher: classTeacher(sectionId) };
}

export function applyPupilLeave(body: PupilLeaveWrite): PupilLeave {
  const { studentId, sectionId } = self();
  if (!body.from || !body.to || body.to < body.from) fail(422, 'validation_failed', 'The last day cannot be before the first.');
  if (body.from < dayFrom(-28)) fail(422, 'validation_failed', 'A note can explain absences up to four weeks back.');
  if (body.reason.trim().length < 4) fail(422, 'validation_failed', 'Say why, in a few words.');
  if (NOTES.some((n) => n.student_id === studentId && n.status !== 'declined' && n.from <= body.to && body.from <= n.to)) fail(409, 'overlap', 'A note already covers some of these days.');
  const row: NoteRow = { id: newId(), student_id: studentId, section_id: sectionId, from: body.from, to: body.to, reason: body.reason.trim(), status: 'pending', applied_at: new Date().toISOString(), decided_by: null };
  NOTES.unshift(row);
  return toNote(row);
}

export function cancelPupilLeave(id: string): void {
  const { studentId } = self();
  const row = must(NOTES, id, 'leave note');
  if (row.student_id !== studentId || row.status !== 'pending') fail(409, 'decided', 'Only a note still waiting can be withdrawn.');
  NOTES.splice(NOTES.indexOf(row), 1);
}

// The class teacher, or the office, decides a note.
export function decidePupilLeave(id: string, approve: boolean): PupilLeave {
  const reach = reachNow();
  const row = must(NOTES, id, 'leave note');
  if (!(reach.kind === 'school' || (reach.kind === 'teaching' && reach.led.has(row.section_id)))) fail(403, 'forbidden', 'The class teacher decides leave notes for their class.');
  if (row.status !== 'pending') fail(409, 'decided', 'This note has been decided already.');
  row.status = approve ? 'approved' : 'declined';
  row.decided_by = classTeacher(row.section_id);
  if (approve) explain(row);
  return toNote(row);
}

export const pendingPupilLeave = (sectionIds: ReadonlySet<string>): PupilLeave[] => NOTES.filter((n) => n.status === 'pending' && sectionIds.has(n.section_id)).map(toNote);

