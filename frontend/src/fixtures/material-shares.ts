import type { MaterialShare, MaterialShareWrite } from '@/types/material-share';

import { TODAY } from './data/classroom';
import { ENROLLMENTS } from './data/enrollment';
import { PERSONS, STAFF, STUDENTS, TEACHERS } from './data/people';
import { OFFERINGS } from './data/structure';
import { TEACHER_ASSIGNMENTS } from './data/timetable';
import { PERSONA_STUDENT } from './identity';
import { newId, seedId } from './ids';
import { reachNow } from './reach';
import { fail, must } from './rows';

interface ShareRow {
  id: string;
  offering_id: string;
  teacher_id: string;
  title: string;
  note: string;
  link: string | null;
  files: string[];
  student_ids: string[];
  shared_at: string;
}

const pupilName = (id: string): string => PERSONS.find((p) => p.id === STUDENTS.find((s) => s.id === id)?.person_id)?.display_name ?? 'Student';
const teacherName = (id: string): string => PERSONS.find((p) => p.id === STAFF.find((st) => st.id === TEACHERS.find((t) => t.id === id)?.staff_id)?.person_id)?.display_name ?? 'A teacher';
const sectionOf = (offeringId: string): string => OFFERINGS.find((o) => o.id === offeringId)?.section_id ?? '';

// One worksheet already handed to the fixture pupil and two classmates, so their subject has something shared with them.
const SHARES: ShareRow[] = (() => {
  const pupil = STUDENTS[PERSONA_STUDENT]?.id;
  const section = ENROLLMENTS.find((e) => e.student_id === pupil && e.status === 'active')?.section_id;
  const maths = OFFERINGS.find((o) => o.section_id === section && o.edges?.subject?.name === 'Mathematics');
  const teacher = TEACHER_ASSIGNMENTS.find((a) => a.subject_offering_id === maths?.id)?.teacher_id;
  if (!pupil || !maths || !teacher) return [];
  const others = ENROLLMENTS.filter((e) => e.section_id === section && e.student_id !== pupil && e.status === 'active').slice(2, 4).map((e) => e.student_id ?? '');
  return [{ id: seedId('share', 'seed'), offering_id: maths.id, teacher_id: teacher, title: 'Extra practice: quadratic equations', note: 'Try questions 4 to 12 before Friday. Bring your working to the extra class.', link: null, files: ['quadratics-practice.pdf'], student_ids: [pupil, ...others], shared_at: `${TODAY}T09:30:00Z` }];
})();

const toShare = (row: ShareRow): MaterialShare => ({ ...row, teacher: teacherName(row.teacher_id), pupils: row.student_ids.map((id) => ({ student_id: id, name: pupilName(id) })) });

// A subject's teacher sees everything shared in it; a pupil only what was shared with them.
export function sharesFor(offeringId: string): MaterialShare[] {
  const reach = reachNow();
  const rows = SHARES.filter((s) => s.offering_id === offeringId);
  if (reach.kind === 'school' || (reach.kind === 'teaching' && reach.offerings.has(offeringId))) return rows.map(toShare);
  if (reach.kind === 'self') return rows.filter((s) => s.student_ids.includes(reach.studentId)).map((s) => ({ ...toShare(s), pupils: [] }));
  return [];
}

export function shareMaterial(body: MaterialShareWrite): MaterialShare {
  const reach = reachNow();
  if (reach.kind !== 'teaching' || !reach.offerings.has(body.offering_id)) fail(403, 'forbidden', 'Only the teacher of the subject can share material in it.');
  must(OFFERINGS, body.offering_id, 'subject');
  if (body.title.trim().length < 3) fail(422, 'validation_failed', 'Give it a title.');
  if (!body.note.trim() && !body.link.trim() && body.files.length === 0) fail(422, 'validation_failed', 'Attach a file, a link or a note.');
  if (body.student_ids.length === 0) fail(422, 'validation_failed', 'Choose at least one pupil.');
  const pupils = new Set(ENROLLMENTS.filter((e) => e.section_id === sectionOf(body.offering_id) && e.status === 'active').map((e) => e.student_id));
  if (body.student_ids.some((id) => !pupils.has(id))) fail(422, 'not_in_section', 'Choose pupils who take this subject.');
  const row: ShareRow = { id: newId(), offering_id: body.offering_id, teacher_id: reach.teacherId, title: body.title.trim(), note: body.note.trim(), link: body.link.trim() || null, files: [...body.files], student_ids: [...body.student_ids], shared_at: new Date().toISOString() };
  SHARES.unshift(row);
  return toShare(row);
}

export function removeShare(id: string): void {
  const reach = reachNow();
  const row = must(SHARES, id, 'shared material');
  if (!(reach.kind === 'school' || (reach.kind === 'teaching' && row.teacher_id === reach.teacherId))) fail(403, 'forbidden', 'Only the teacher who shared it can take it back.');
  SHARES.splice(SHARES.indexOf(row), 1);
}
