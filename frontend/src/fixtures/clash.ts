import type { Clash, ClashProposal, ClashReport } from '@/types/school';
import { ENROLLMENTS } from './data/enrollment';
import { SLOTS } from './data/timetable';


const OVERRIDABLE = { teacher: true, room: true, student_set: false } as const;

export function detectClashes(
  timetableId: string,
  proposed: readonly ClashProposal[],
  exclude: ReadonlySet<string>,
): Clash[] {
  const existing = SLOTS.filter((s) => s.timetable_id === timetableId && !exclude.has(s.id));
  const clashes: Clash[] = [];

  for (const p of proposed) {
    const left = {
      ref: p.ref,
      section_id: p.section_id,
      period_id: p.period_id,
      subject_offering_id: p.subject_offering_id,
      teacher_id: p.teacher_id,
      room_id: p.room_id,
    };

    for (const e of existing) {
      if (e.id === p.replaces_timetable_slot_id) continue;
      if (e.day_of_week !== p.day_of_week || e.period_id !== p.period_id) continue;

      const right = {
        timetable_slot_id: e.id,
        timetable_id: e.timetable_id,
        section_id: e.section_id,
        period_id: e.period_id,
        subject_offering_id: e.subject_offering_id,
        teacher_id: e.teacher_id,
        room_id: e.room_id,
      };
      const base = { scope: 'pattern' as const, day_of_week: p.day_of_week, period_id: p.period_id, overridden: false, left, right };

      if (p.teacher_id && p.teacher_id === e.teacher_id) {
        clashes.push({ ...base, rule: 'teacher', teacher_id: p.teacher_id, overridable: OVERRIDABLE.teacher });
      }
      if (p.room_id && p.room_id === e.room_id) {
        clashes.push({ ...base, rule: 'room', room_id: p.room_id, overridable: OVERRIDABLE.room });
      }
      if (p.section_id === e.section_id) {
        const studentCount = ENROLLMENTS.filter((en) => en.section_id === p.section_id).length;
        clashes.push({ ...base, rule: 'student_set', student_count: studentCount, overridable: OVERRIDABLE.student_set });
      }
    }
  }
  return clashes;
}

export function clashReport(clashes: readonly Clash[]): ClashReport {
  const overridden = clashes.filter((c) => c.overridden).length;
  return {
    clashes: [...clashes],
    count: clashes.length,
    clear: clashes.length === 0,
    blocking: clashes.length - overridden,
    overridden,
  };
}
