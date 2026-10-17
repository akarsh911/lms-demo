import { addDays, daysBetween, datesBetween } from '@/lib/lesson-planner/dates';
import type { TermDay, TermDayKind, TermExam, TermPlanSettings } from '@/types/lesson-planner';

import { EXAMS } from './data/exams';
import { SCHOOL_EVENTS } from './data/events';
import { EVENT_EXAM_CODES, REVISION_PERIODS, SYLLABUS_FRACTIONS, SYLLABUS_RULES, type SyllabusRule } from './data/lesson-term';
import { CURRENT_SESSION } from './data/structure';
import { CALENDAR_DAYS } from './data/timetable';

export interface ExamWindow {
  id: string;
  code: string;
  name: string;
  start: string;
  end: string;
}

const BLOCKING_EVENTS: ReadonlySet<string> = new Set(['event', 'ptm', 'trip', 'camp']);
const NOT_BLOCKING = /^First day/;

export function gradesOf(audience: string | null): number[] | 'all' {
  if (!audience || /whole school/i.test(audience)) return 'all';
  const range = /Classes? (\d+) to (\d+)/i.exec(audience);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  return [...audience.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

const reaches = (audience: string | null, grade: number): boolean => {
  const grades = gradesOf(audience);
  return grades === 'all' || grades.includes(grade);
};

const currentEvents = SCHOOL_EVENTS.filter((event) => event.academic_session_id === CURRENT_SESSION.id);

export function examWindows(grade: number): ExamWindow[] {
  const formal = EXAMS.filter((exam) => exam.academic_session_id === CURRENT_SESSION.id && exam.assessment_kind !== 'practice').map((exam) => ({
    id: exam.id,
    code: exam.code ?? '',
    name: exam.name ?? 'Examination',
    start: (exam.start_at ?? '').slice(0, 10),
    end: (exam.end_at ?? '').slice(0, 10),
  }));
  const internal = currentEvents.flatMap((event) => {
    const code = EVENT_EXAM_CODES[event.title];
    if (event.kind !== 'internal' || !code || !reaches(event.audience, grade)) return [];
    return [{ id: event.id, code, name: event.title, start: event.start, end: event.end }];
  });
  return [...formal, ...internal].sort((a, b) => a.start.localeCompare(b.start));
}

function ruleFor(window: ExamWindow, grade: number, subjectCode: string, chapterCount: number): SyllabusRule {
  const authored = SYLLABUS_RULES[`${grade}-${subjectCode}`]?.[window.code];
  if (authored) return authored;
  const [from, to] = SYLLABUS_FRACTIONS[window.code] ?? [0, 1];
  return { from: Math.floor(from * chapterCount) + 1, to: Math.max(1, Math.round(to * chapterCount)), deferrable: [] };
}

export function termExams(grade: number, subjectCode: string, chapters: readonly { id: string; sequence: number }[]): TermExam[] {
  const idOf = (sequence: number): string | null => chapters.find((c) => c.sequence === sequence)?.id ?? null;
  return examWindows(grade).map((window) => {
    const rule = ruleFor(window, grade, subjectCode, chapters.length);
    return {
      id: window.id,
      name: window.name,
      start: window.start,
      end: window.end,
      syllabus: chapters.filter((c) => c.sequence >= rule.from && c.sequence <= rule.to).map((c) => c.id),
      deferrable: rule.deferrable.flatMap((sequence) => idOf(sequence) ?? []),
      revision_periods: REVISION_PERIODS[window.code] ?? 2,
    };
  });
}

const KIND_OF: Readonly<Record<string, TermDayKind>> = { holiday: 'holiday', vacation: 'vacation', weekend: 'weekend' };

export function termDays(grade: number): TermDay[] {
  const events = new Map<string, string>();
  for (const event of currentEvents) {
    if (!BLOCKING_EVENTS.has(event.kind) || NOT_BLOCKING.test(event.title) || !reaches(event.audience, grade)) continue;
    for (const date of datesBetween(event.start, event.end)) events.set(date, event.title);
  }
  return CALENDAR_DAYS.map((day) => {
    const date = (day.calendar_date ?? '').slice(0, 10);
    const kind = KIND_OF[day.day_type ?? ''];
    if (kind) return { date, kind, label: day.name ?? null };
    const event = events.get(date);
    return event ? { date, kind: 'event', label: event } : { date, kind: 'teaching', label: null };
  });
}

const settingsStore = globalThis as unknown as { __emergeTermPlans?: Map<string, TermPlanSettings> };

export const savedSettings = (): Map<string, TermPlanSettings> => (settingsStore.__emergeTermPlans ??= new Map());

export function blockedForPlacement(grade: number, offeringId: string): Map<string, string> {
  const settings = savedSettings().get(offeringId);
  const blocked = new Map(termDays(grade).filter((d) => d.kind !== 'teaching').map((d) => [d.date, d.label ?? d.kind]));
  for (const window of examWindows(grade)) {
    const start = settings?.exam_starts[window.id] ?? window.start;
    const end = addDays(start, daysBetween(window.start, window.end));
    for (const date of datesBetween(start, end)) blocked.set(date, window.name);
  }
  for (const closure of settings?.closures ?? []) blocked.set(closure.date, closure.label);
  return blocked;
}

