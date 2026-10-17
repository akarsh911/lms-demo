import type { ExtraClass, ExtraClassWrite } from '@/types/extra-class';

import { TODAY } from './data/classroom';
import { ENROLLMENTS } from './data/enrollment';
import { TEACHERS } from './data/people';
import { GRADE_LEVELS, OFFERINGS, SECTIONS } from './data/structure';
import { TEACHER_ASSIGNMENTS } from './data/timetable';
import { newId, seedId } from './ids';
import { resolveOccurrences } from './occurrences';
import { reachNow } from './reach';
import { fail, must } from './rows';

const DAY = 86_400_000;
const shift = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const nextSaturday = (): string => shift(TODAY, ((6 - new Date(`${TODAY}T00:00:00Z`).getUTCDay() + 7) % 7) || 7);

const labelOf = (sectionId: string): string => {
  const s = SECTIONS.find((x) => x.id === sectionId);
  return `${(GRADE_LEVELS.find((g) => g.id === s?.grade_level_id)?.name ?? '').replace('Class ', '')}${s?.name ?? ''}`;
};

const build = (teacherId: string, offeringId: string, date: string, start: number, end: number, room: string | null, topic: string, studentIds: string[], id = newId()): ExtraClass => {
  const offering = must(OFFERINGS, offeringId, 'subject');
  return { id, teacher_id: teacherId, offering_id: offeringId, section_id: offering.section_id ?? '', subject: offering.edges?.subject?.name ?? 'Subject', label: labelOf(offering.section_id ?? ''), date, start, end, room, topic, student_ids: studentIds };
};

// A Saturday revision class by the fixture teacher, in 10C where the fixture pupil sits, so both weeks show one.
export const EXTRA_CLASSES: ExtraClass[] = (() => {
  const mine = TEACHER_ASSIGNMENTS.filter((a) => a.teacher_id === TEACHERS[0]?.id);
  const pick = mine.find((a) => labelOf(a.section_id ?? '') === '10C') ?? mine[0];
  return pick?.teacher_id && pick.subject_offering_id ? [build(pick.teacher_id, pick.subject_offering_id, nextSaturday(), 540, 600, 'Room 10C', 'Revision before the unit test', [], seedId('extra-class', 'seed'))] : [];
})();

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }): boolean => a.start < b.end && b.start < a.end;

export function scheduleExtra(body: ExtraClassWrite): ExtraClass {
  const reach = reachNow();
  if (reach.kind !== 'teaching') fail(403, 'forbidden', 'Extra classes are booked by the teacher of the subject.');
  if (!reach.offerings.has(body.offering_id)) fail(403, 'forbidden', 'You can book extra classes only for subjects you teach.');
  if (body.date < TODAY) fail(422, 'validation_failed', 'Choose today or a day ahead.');
  if (body.end <= body.start) fail(422, 'validation_failed', 'The class has to end after it starts.');
  if (body.topic.trim().length < 3) fail(422, 'validation_failed', 'Say what the class is for.');
  const sectionId = must(OFFERINGS, body.offering_id, 'subject').section_id ?? '';
  const pupils = new Set(ENROLLMENTS.filter((e) => e.section_id === sectionId).map((e) => e.student_id));
  if (body.student_ids.some((id) => !pupils.has(id))) fail(422, 'not_in_section', 'Choose pupils of that section.');
  const busy = [...resolveOccurrences({ teacherId: reach.teacherId, from: body.date, to: body.date }), ...resolveOccurrences({ sectionId, from: body.date, to: body.date })]
    .filter((o) => o.period_kind === 'teaching')
    .map((o) => ({ start: o.start_minute, end: o.end_minute }));
  const extra = EXTRA_CLASSES.filter((x) => x.date === body.date && (x.teacher_id === reach.teacherId || x.section_id === sectionId));
  if ([...busy, ...extra].some((b) => overlaps(b, body))) fail(409, 'clash', 'That time clashes with a lesson you or the class already have.');
  const row = build(reach.teacherId, body.offering_id, body.date, body.start, body.end, body.room.trim() || null, body.topic.trim(), [...body.student_ids]);
  EXTRA_CLASSES.push(row);
  return row;
}

export function cancelExtra(id: string): void {
  const reach = reachNow();
  const i = EXTRA_CLASSES.findIndex((x) => x.id === id);
  if (i === -1) fail(404, 'not_found', 'extra class not found');
  if (reach.kind !== 'school' && !(reach.kind === 'teaching' && EXTRA_CLASSES[i]?.teacher_id === reach.teacherId)) fail(403, 'forbidden', 'Only the teacher who booked it can cancel it.');
  EXTRA_CLASSES.splice(i, 1);
}

// The extra classes on a day for a teacher, or for a pupil when they are in the group.
export function extrasOn(date: string): ExtraClass[] {
  const reach = reachNow();
  return EXTRA_CLASSES.filter(
    (x) => x.date === date && (reach.kind === 'teaching' ? x.teacher_id === reach.teacherId : reach.kind === 'self' && x.section_id === reach.sectionId && (x.student_ids.length === 0 || x.student_ids.includes(reach.studentId))),
  );
}
