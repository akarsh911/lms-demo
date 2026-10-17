import type { YearEvent } from '@/types/foundation';
import type { DateSheetExam, MyCalendar } from '@/types/my-calendar';

import { TODAY } from './data/classroom';
import { EXAM_SITTINGS, EXAM_SUBJECTS, EXAMS } from './data/exams';
import { CALENDAR_DAYS } from './data/timetable';
import { CURRENT_SECTIONS, CURRENT_SESSION, GRADE_LEVELS, OFFERINGS } from './data/structure';
import { EXTRA_CLASSES } from './extra-classes';
import { seedId } from './ids';
import { myLeave } from './leave';
import { reachNow } from './reach';
import { fail } from './rows';
import { yearEvents } from './year-events';

const sequenceOf = (sectionId: string): number => GRADE_LEVELS.find((g) => g.id === CURRENT_SECTIONS.find((s) => s.id === sectionId)?.grade_level_id)?.sequence ?? 0;
const label = (sectionId: string): string => {
  const s = CURRENT_SECTIONS.find((x) => x.id === sectionId);
  return `${(GRADE_LEVELS.find((g) => g.id === s?.grade_level_id)?.name ?? '').replace('Class ', '')}${s?.name ?? ''}`;
};

// "Whole school", "Classes 6 to 12", "Classes 9 and 11", "Class 8": whether any of these classes is in it.
function reaches(audience: string | null, grades: ReadonlySet<number>): boolean {
  if (!audience || /whole school/i.test(audience)) return true;
  const range = /Classes (\d+) to (\d+)/i.exec(audience);
  if (range) return [...grades].some((g) => g >= Number(range[1]) && g <= Number(range[2]));
  const nums = [...audience.matchAll(/\d+/g)].map((m) => Number(m[0]));
  return nums.some((n) => grades.has(n));
}

const ymd = (iso: string | undefined): string => (iso ?? '').slice(0, 10);
const schoolDates = new Set(CALENDAR_DAYS.filter((d) => d.forenoon_open).map((d) => ymd(d.calendar_date)));

// Each paper's day: the sitting's own day where one was set, else spread over the exam's school days in subject order.
function dateSheet(offerings: ReadonlySet<string>): DateSheetExam[] {
  return EXAMS.filter((e) => e.academic_session_id === CURRENT_SESSION.id && e.assessment_kind !== 'practice')
    .map((e) => {
      const window = [...schoolDates].filter((d) => d >= ymd(e.start_at) && d <= ymd(e.end_at)).sort();
      const papers = EXAM_SUBJECTS.filter((p) => p.exam_id === e.id && offerings.has(p.subject_offering_id ?? ''))
        .map((p) => {
          const offering = OFFERINGS.find((o) => o.id === p.subject_offering_id);
          return { p, subject: offering?.edges?.subject?.name ?? 'Subject', sectionId: offering?.section_id ?? '' };
        })
        .sort((a, b) => a.sectionId.localeCompare(b.sectionId) || a.subject.localeCompare(b.subject))
        .map(({ p, subject, sectionId }, i, all) => {
          const nth = all.filter((x, j) => j < i && x.sectionId === sectionId).length;
          const sitting = CALENDAR_DAYS.find((d) => d.id === EXAM_SITTINGS.find((s) => s.exam_subject_id === p.id)?.calendar_day_id);
          const date = ymd(sitting?.calendar_date) || window[nth % Math.max(window.length, 1)] || ymd(e.start_at);
          return { exam_subject_id: p.id, subject, section: label(sectionId), date, start: '09:00', end: (p.maximum_marks ?? 80) > 40 ? '12:00' : '10:00', max_marks: p.maximum_marks ?? 80, held: date < TODAY };
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.section.localeCompare(b.section));
      return { exam_id: e.id, name: e.name ?? 'Examination', start: ymd(e.start_at), end: ymd(e.end_at), papers };
    })
    .filter((x) => x.papers.length > 0)
    .sort((a, b) => b.start.localeCompare(a.start));
}

const personal = (key: string, title: string, start: string, end: string, detail: string): YearEvent => ({ id: seedId('my-event', key), kind: 'personal', title, start, end, detail, audience: null });

// A teacher's or a pupil's year: the school's events for their classes, plus their own leave and extra classes.
export function myCalendar(): MyCalendar {
  const reach = reachNow();
  if (reach.kind !== 'teaching' && reach.kind !== 'self') fail(403, 'forbidden', 'The school calendar is on Academic Years.');
  const sections = reach.kind === 'teaching' ? reach.sections : new Set(reach.sectionId ? [reach.sectionId] : []);
  const grades = new Set([...sections].map(sequenceOf));
  const offerings = reach.kind === 'teaching' ? reach.offerings : new Set(OFFERINGS.filter((o) => sections.has(o.section_id ?? '')).map((o) => o.id));
  const led = reach.kind === 'teaching' ? [...reach.led].map(label) : [];

  const school = yearEvents(CURRENT_SESSION.id)
    .filter((e) => reaches(e.audience, grades))
    .map((e) => (e.kind === 'ptm' && led.length > 0 ? { ...e, detail: `${e.detail ?? ''}${e.detail ? '. ' : ''}You meet the parents of ${led.join(', ')}.` } : e));
  const own: YearEvent[] = [];
  if (reach.kind === 'teaching') {
    for (const l of myLeave().requests.filter((x) => x.status !== 'declined')) own.push(personal(l.id, l.status === 'approved' ? 'Your leave' : 'Your leave (awaiting approval)', l.from, l.to, `${l.kind} · ${l.reason}`));
    for (const x of EXTRA_CLASSES.filter((c) => c.teacher_id === reach.teacherId)) own.push(personal(x.id, `Extra class: ${x.subject}, ${x.label}`, x.date, x.date, x.topic));
  } else {
    for (const x of EXTRA_CLASSES.filter((c) => c.section_id === reach.sectionId && (c.student_ids.length === 0 || c.student_ids.includes(reach.studentId)))) own.push(personal(x.id, `Extra class: ${x.subject}`, x.date, x.date, x.topic));
  }
  return {
    year: { id: CURRENT_SESSION.id, name: CURRENT_SESSION.name ?? 'This year', start: ymd(CURRENT_SESSION.start_date), end: ymd(CURRENT_SESSION.end_date) },
    events: [...school, ...own].sort((a, b) => a.start.localeCompare(b.start)),
    date_sheet: dateSheet(offerings),
  };
}
