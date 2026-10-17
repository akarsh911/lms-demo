import {
  GENERATION_WEIGHT_NAMES,
  MAX_SOLVE_SECONDS,
  MINUTES_BASES,
  MIN_SOLVE_SECONDS,
  type GenerationJob,
  type GenerationRequest,
  type SolverViolation,
} from '@/types/timetable-generation';
import type { Timetable } from '@/types/school';

import { newId } from './ids';
import { TEACHING_DAYS } from './data/timetable';
import { byId, insert, remove } from './rows';
import { ENROLLMENTS } from './data/enrollment';
import { OFFERINGS, ROOMS, SECTIONS } from './data/structure';
import { PERIODS, SLOTS, TIMETABLES } from './data/timetable';

export const DEFAULT_SECONDS = 60;

export type Outcome = Partial<GenerationJob> & Pick<GenerationJob, 'status'>;

// `?dev_fail=` on the POST forces a failure the solver cannot be talked into, so those screens can be reached.
export const FORCED: Readonly<Record<string, Outcome>> = {
  unreachable: {
    status: 'failed',
    failure_reason: 'unreachable',
    detail:
      'timetablegen: the timetable solver is unreachable: Post "http://timetable-solver:8500/v1/feasibility": dial tcp: connect: connection refused',
  },
  refused: {
    status: 'failed',
    failure_reason: 'refused',
    detail: 'timetablegen: the timetable solver refused the request: 422 config.heavy_subjects must be a list of subject codes',
  },
  internal: {
    status: 'failed',
    failure_reason: 'internal',
    detail: 'timetablegen: the solver answered with something this service cannot read: slot s41 names period "none"',
  },
  clash: {
    status: 'failed',
    failure_reason: 'clash',
    detail: 'timetablegen: the solver returned a week the clash checker refuses: 4 blocking (2 teacher, 2 room)',
  },
};

const lessons = (count: number): string => `${count} ${count === 1 ? 'lesson' : 'lessons'}`;

const sectionCode = (sectionId: string): string => byId(SECTIONS, sectionId)?.code ?? sectionId;

const subjectOf = (offeringId: string): string => byId(OFFERINGS, offeringId)?.edges?.subject?.name ?? offeringId;

const subjectsOf = (rule: { offering_ids?: string[]; class_teacher?: boolean }): string =>
  rule.class_teacher ? 'whatever its class teacher teaches' : (rule.offering_ids ?? []).map(subjectOf).join(', ');

const infeasible = (coreKey: string, detail: string): Outcome => ({
  status: 'infeasible',
  solver_status: 'INFEASIBLE',
  verdict: 'infeasible',
  core_keys: [coreKey],
  detail: `This requirement cannot be met: ${detail}`,
});

const violation = (kind: string, key: string, target: number, actual: number, message: string): SolverViolation => ({
  kind,
  key,
  target,
  actual,
  amount: target - actual,
  message,
});

const slotsOf = (timetableId: string) => SLOTS.filter((slot) => slot.timetable_id === timetableId);

// The "solved" week is the published one for the same scheme, which the seed already laid out clash-free.
function writeWeek(draft: Timetable): number {
  const source = TIMETABLES.find((t) => t.status === 'published' && t.period_scheme_id === draft.period_scheme_id);
  for (const slot of slotsOf(draft.id)) remove(SLOTS, slot.id);
  const week = source ? slotsOf(source.id) : [];
  for (const slot of week) insert(SLOTS, { ...slot, id: newId(), timetable_id: draft.id });
  return week.filter((slot) => slot.subject_offering_id).length;
}

export function settle(draft: Timetable, request: GenerationRequest, forced: string | null): Outcome {
  const forcedOutcome = forced ? FORCED[forced] : undefined;
  if (forcedOutcome) return forcedOutcome;

  const days = TEACHING_DAYS.length;
  const cellsPerDay = PERIODS.filter((p) => p.period_scheme_id === draft.period_scheme_id && p.kind === 'teaching').length;
  const weekCells = cellsPerDay * days;
  const demand = request.demand ?? {};

  const placed = slotsOf(draft.id).filter((slot) => slot.subject_offering_id).length;
  if (placed > 0 && !request.replace_existing) {
    return {
      status: 'failed',
      failure_reason: 'invalid',
      detail: `timetablegen: this draft already carries lessons: ${placed} lessons are already placed; ask again with replace_existing so the generated week may take their place`,
    };
  }

  const roomTypes = new Set(ROOMS.map((room) => room.room_type));
  for (const [code, roomType] of Object.entries(request.required_room_type ?? {})) {
    if (!roomTypes.has(roomType)) {
      return infeasible(`no_room:${code}`, `${code} must be taught in a ${roomType} and the branch has none.`);
    }
  }

  const rules = request.daily_contact ?? [];
  for (const [index, rule] of rules.entries()) {
    const perDay = rule.min_per_day ?? 1;
    const owed = `${sectionCode(rule.section_id)} is owed ${lessons(perDay)} a day of ${subjectsOf(rule)}`;
    if (perDay > cellsPerDay) {
      return infeasible(`daily_contact_day:${index}:${rule.section_id}`, `${owed} and Monday has only ${cellsPerDay}.`);
    }
    const named = rule.offering_ids ?? [];
    const supply = named.reduce((total, id) => total + (demand[id] ?? byId(OFFERINGS, id)?.periods_per_week ?? 5), 0);
    if (named.length > 0 && supply < days * perDay) {
      return infeasible(
        `daily_contact:${index}:${rule.section_id}`,
        `${owed} across ${days} teaching days, which is ${days * perDay} a week, and those are asked for only ${supply}.`,
      );
    }
  }

  const wantedBySection = new Map<string, number>();
  for (const [offeringId, count] of Object.entries(demand)) {
    const sectionId = byId(OFFERINGS, offeringId)?.section_id ?? offeringId;
    wantedBySection.set(sectionId, (wantedBySection.get(sectionId) ?? 0) + count);
  }
  for (const [sectionId, wanted] of wantedBySection) {
    if (wanted <= weekCells) continue;
    const pupils = ENROLLMENTS.filter((e) => e.section_id === sectionId).length;
    return infeasible(
      `cohort_capacity:${sectionId}`,
      `the ${pupils} pupils of ${sectionCode(sectionId)} taking that combination of subjects are owed ${wanted} periods a week and the week has ${weekCells}.`,
    );
  }

  const seconds = request.max_seconds ?? DEFAULT_SECONDS;
  if (seconds <= 2) {
    return {
      status: 'failed',
      failure_reason: 'timeout',
      solver_status: 'UNKNOWN',
      verdict: 'unknown',
      wall_time_ms: seconds * 1000,
      detail: `the solver ran for ${seconds}s without finding a week and without proving there is none; ask again with a larger max_seconds`,
    };
  }

  const violations: SolverViolation[] = [];
  for (const code of request.heavy_subjects ?? []) {
    const offering = OFFERINGS.find((o) => o.edges?.subject?.code === code);
    if (!offering) continue;
    violations.push(
      violation('last_period', offering.id, 0, 1, `${sectionCode(offering.section_id ?? '')} takes ${code} in the last period of Thursday`),
    );
  }
  for (const rule of rules) {
    const perDay = rule.min_per_day ?? 1;
    violations.push(
      violation(
        'daily_contact',
        `0:${rule.section_id}:3`,
        perDay,
        perDay - 1,
        `${sectionCode(rule.section_id)} is owed ${lessons(perDay)} from ${subjectsOf(rule)} on Wednesday and has ${perDay - 1}`,
      ),
    );
  }
  for (const [offeringId, count] of Object.entries(demand)) {
    if (count <= days) continue;
    const extra = count - days;
    const section = sectionCode(byId(OFFERINGS, offeringId)?.section_id ?? '');
    violations.push(
      violation('stacked', offeringId, 0, extra, `${section} takes ${subjectOf(offeringId)} twice on ${extra === 1 ? 'one day' : `${extra} days`}`),
    );
  }

  const written = writeWeek(draft);
  return {
    status: 'succeeded',
    slots_written: written,
    wall_time_ms: Math.min(seconds, 9) * 1000 + 240,
    solver_status: violations.length > 0 ? 'FEASIBLE' : 'OPTIMAL',
    verdict: violations.length > 0 ? 'optimal_with_violations' : 'optimal_clean',
    objective: violations.length * 40,
    soft_violations: violations,
    warnings:
      request.minutes_basis === 'realised'
        ? ['Period 6 and Period 7 do not run under the Saturday bell schedule, so a lesson placed in them counts as zero minutes under realised measurement.']
        : [],
    detail: `wrote ${written} lessons into draft version ${draft.version ?? 1}; publish it to put the week in force`,
  };
}

export function validate(request: GenerationRequest): string | null {
  const seconds = request.max_seconds;
  if (seconds !== undefined && (seconds < MIN_SOLVE_SECONDS || seconds > MAX_SOLVE_SECONDS)) {
    return `max_seconds must be between ${MIN_SOLVE_SECONDS} and ${MAX_SOLVE_SECONDS}`;
  }
  if (request.minutes_basis !== undefined && !MINUTES_BASES.includes(request.minutes_basis)) {
    return `minutes_basis must be one of ${MINUTES_BASES.join(', ')}`;
  }
  for (const [key, count] of Object.entries(request.demand ?? {})) {
    if (count < 0) return `demand cannot be negative: ${key}`;
  }
  for (const [key, days] of Object.entries(request.pins ?? {})) {
    for (const [day, count] of Object.entries(days)) {
      const value = Number(day);
      if (!Number.isInteger(value) || value < 1 || value > 7) return `pins takes an ISO day of week, 1 through 7, not ${day}`;
      if (count < 0) return `a pinned count cannot be negative: ${key}`;
    }
  }
  for (const cells of Object.values(request.unavailable ?? {})) {
    for (const cell of cells) {
      if (cell.day_of_week < 1 || cell.day_of_week > 7) return 'unavailable takes an ISO day of week, 1 through 7';
      if (!cell.period_id) return 'unavailable needs a period_id on every cell';
    }
  }
  const known: readonly string[] = GENERATION_WEIGHT_NAMES;
  for (const [name, weight] of Object.entries(request.weights ?? {})) {
    if (!known.includes(name)) return `weights has no ${name}; the penalties are ${known.join(', ')}`;
    if (typeof weight === 'number' && weight < 0) return `a weight is a penalty and cannot be negative: ${name}`;
  }
  for (const rule of request.daily_contact ?? []) {
    if (Boolean(rule.class_teacher) === (rule.offering_ids ?? []).length > 0) {
      return 'a daily_contact rule either names offering_ids or sets class_teacher so this service resolves them, and it must do exactly one of the two';
    }
    if (rule.min_per_day !== undefined && rule.min_per_day < 1) {
      return 'daily_contact.min_per_day is a floor of at least one lesson a day; leave the rule out to ask for nothing';
    }
  }
  return null;
}
