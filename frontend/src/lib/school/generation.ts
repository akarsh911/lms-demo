import { DAY_NAMES } from '@/constants/school';
import {
  DEFAULT_SOLVE_SECONDS,
  GENERATION_WEIGHT_NAMES,
  MAX_SOLVE_SECONDS,
  MIN_SOLVE_SECONDS,
  type GenerationCell,
  type GenerationFailureReason,
  type GenerationJob,
  type GenerationRequest,
  type GenerationWeightName,
  type MinutesBasis,
  type SolverViolation,
} from '@/types/timetable-generation';

export interface ContactRuleDraft {
  id: string;
  sectionId: string;
  basis: 'class_teacher' | 'offerings';
  offeringIds: readonly string[];
  minPerDay: number;
}

export interface GenerationForm {
  maxSeconds: number;
  replaceExisting: boolean;
  hint: boolean;
  minutesBasis: MinutesBasis;
  demand: Record<string, string>;
  pins: Record<string, Record<string, string>>;
  unavailable: Record<string, readonly GenerationCell[]>;
  requiredRoomType: Record<string, string>;
  heavySubjects: readonly string[];
  weights: Partial<Record<GenerationWeightName, string>>;
  dailyContact: readonly ContactRuleDraft[];
}

export function emptyGenerationForm(): GenerationForm {
  return {
    maxSeconds: DEFAULT_SOLVE_SECONDS,
    replaceExisting: false,
    hint: true,
    minutesBasis: 'nominal',
    demand: {},
    pins: {},
    unavailable: {},
    requiredRoomType: {},
    heavySubjects: [],
    weights: {},
    dailyContact: [],
  };
}

function wholeNumber(raw: string | undefined): number | null {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function typedButUnusable(raw: string | undefined): boolean {
  return (raw ?? '').trim() !== '' && wholeNumber(raw) === null;
}

export const WEIGHT_LABELS: Record<GenerationWeightName, string> = {
  stack: 'Two lessons of one subject in the same day',
  last_period: 'A heavy subject in the last period of a day',
  teacher_gap: 'A free period in the middle of a teacher’s day',
  room_move: 'A subject taught in more than one room',
  minutes_short: 'A subject placed for fewer minutes than it is owed',
  daily_contact: 'A daily-contact rule left unmet',
};

export const MINUTES_BASIS_LABELS: Record<MinutesBasis, string> = {
  nominal: 'The period’s own length, whichever bell is ringing',
  realised: 'The length the chosen bell schedule actually gives it',
};

export function contactRuleProblem(rule: ContactRuleDraft): string | null {
  if (rule.sectionId === '') return 'Choose the class this rule is about.';
  if (rule.basis === 'offerings' && rule.offeringIds.length === 0) {
    return 'Choose at least one subject, or let the service resolve the class teacher’s.';
  }
  if (!Number.isInteger(rule.minPerDay) || rule.minPerDay < 1) {
    return 'A floor is at least one lesson a day. Remove the rule to ask for nothing.';
  }
  return null;
}

export interface BuiltRequest {
  request: GenerationRequest;
  problems: readonly string[];
}

export function buildGenerationRequest(
  form: GenerationForm,
  supersedes: boolean,
): BuiltRequest {
  const problems: string[] = [];

  if (form.maxSeconds < MIN_SOLVE_SECONDS || form.maxSeconds > MAX_SOLVE_SECONDS) {
    problems.push(
      `A time limit is between ${MIN_SOLVE_SECONDS} and ${MAX_SOLVE_SECONDS} seconds.`,
    );
  }

  const demand: Record<string, number> = {};
  for (const [offeringId, raw] of Object.entries(form.demand)) {
    if (typedButUnusable(raw)) {
      problems.push('Lessons a week is a whole number and cannot be negative.');
      continue;
    }
    const value = wholeNumber(raw);
    if (value !== null) demand[offeringId] = value;
  }

  const pins: Record<string, Record<string, number>> = {};
  for (const [offeringId, days] of Object.entries(form.pins)) {
    const perDay: Record<string, number> = {};
    for (const [day, raw] of Object.entries(days)) {
      if (typedButUnusable(raw)) {
        problems.push('A pinned count is a whole number and cannot be negative.');
        continue;
      }
      const value = wholeNumber(raw);
      if (value !== null) perDay[day] = value;
    }
    if (Object.keys(perDay).length > 0) pins[offeringId] = perDay;
  }

  const unavailable: Record<string, GenerationCell[]> = {};
  for (const [teacherId, cells] of Object.entries(form.unavailable)) {
    if (cells.length > 0) unavailable[teacherId] = [...cells];
  }

  const requiredRoomType: Record<string, string> = {};
  for (const [subjectCode, roomType] of Object.entries(form.requiredRoomType)) {
    if (roomType.trim() !== '') requiredRoomType[subjectCode] = roomType.trim();
  }

  const weights: Partial<Record<GenerationWeightName, number>> = {};
  for (const name of GENERATION_WEIGHT_NAMES) {
    if (typedButUnusable(form.weights[name])) {
      problems.push(`${WEIGHT_LABELS[name]} takes a penalty of zero or more.`);
      continue;
    }
    const value = wholeNumber(form.weights[name]);
    if (value !== null) weights[name] = value;
  }

  for (const rule of form.dailyContact) {
    const problem = contactRuleProblem(rule);
    if (problem) problems.push(problem);
  }
  const dailyContact = form.dailyContact.map((rule) => ({
    section_id: rule.sectionId,
    min_per_day: rule.minPerDay,
    ...(rule.basis === 'class_teacher'
      ? { class_teacher: true }
      : { offering_ids: [...rule.offeringIds] }),
  }));

  const request: GenerationRequest = {
    max_seconds: form.maxSeconds,
    replace_existing: form.replaceExisting,
    minutes_basis: form.minutesBasis,
  };
  if (supersedes) request.hint = form.hint;
  if (Object.keys(demand).length > 0) request.demand = demand;
  if (Object.keys(pins).length > 0) request.pins = pins;
  if (Object.keys(unavailable).length > 0) request.unavailable = unavailable;
  if (Object.keys(requiredRoomType).length > 0) request.required_room_type = requiredRoomType;
  if (form.heavySubjects.length > 0) request.heavy_subjects = [...form.heavySubjects];
  if (Object.keys(weights).length > 0) request.weights = weights;
  if (dailyContact.length > 0) request.daily_contact = dailyContact;

  return { request, problems: [...new Set(problems)] };
}

const CORE_KEY_LABELS: Record<string, string> = {
  cohort_capacity: 'a group of pupils is owed more periods a week than the week holds',
  cohort_day_capacity: 'a group of pupils is owed more periods in one day than the day holds',
  daily_contact: 'a daily-contact rule asks for more than the week supplies',
  daily_contact_day: 'a daily-contact rule asks for more than one of the days holds',
  demand: 'how many lessons a week a subject must get',
  day_demand: 'how many lessons a subject must get on one day',
  no_demand: 'a subject with no lessons a week recorded, so there is nothing to place',
  no_room: 'a subject that must be taught in a kind of room the branch does not have',
  no_teacher: 'a subject with nobody assigned to teach it',
  pin: 'a pinned count that asks for more than the subject is owed',
  room_capacity: 'a room cannot hold two classes at once',
  teacher_capacity: 'a teacher cannot be in two places at once',
  teacher_day_capacity: 'a teacher is asked for more periods in a day than the day holds',
  unavailable: 'the periods a teacher has been marked unavailable for',
  cohort: 'a pupil cannot be in two places at once',
  one_teacher: 'a subject needs exactly one teacher',
  one_room: 'a subject needs exactly one room',
};

const ARITHMETIC_ONLY_KINDS: ReadonlySet<string> = new Set([
  'cohort_capacity',
  'cohort_day_capacity',
  'daily_contact',
  'daily_contact_day',
  'no_demand',
  'no_room',
  'no_teacher',
  'pin',
  'teacher_day_capacity',
]);

export function coreKeyKind(key: string): string {
  const head = key.split(':')[0] ?? key;
  return head in CORE_KEY_LABELS ? head : '';
}

export interface CoreReason {
  key: string;
  kind: string;
  label: string;
}

export function coreReasons(keys: readonly string[] | null | undefined): CoreReason[] {
  const seen = new Set<string>();
  const out: CoreReason[] = [];
  for (const key of keys ?? []) {
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = coreKeyKind(key);
    out.push({
      key,
      kind,
      label: kind === '' ? 'a requirement this screen cannot name' : CORE_KEY_LABELS[kind]!,
    });
  }
  return out;
}

export function refusedByArithmetic(keys: readonly string[] | null | undefined): boolean {
  const kinds = coreReasons(keys).map((reason) => reason.kind);
  if (kinds.length === 0) return false;
  return kinds.every((kind) => ARITHMETIC_ONLY_KINDS.has(kind));
}

const VIOLATION_LABELS: Record<string, string> = {
  stacked: 'Two lessons of one subject in the same day',
  last_period: 'A heavy subject in the last period of a day',
  room_move: 'A subject taught in more than one room',
  minutes_short: 'A subject short of the minutes it is owed',
  daily_contact: 'A daily-contact rule not met',
};

export interface ViolationGroup {
  kind: string;
  label: string;
  rows: readonly SolverViolation[];
}

export function violationGroups(
  violations: readonly SolverViolation[] | null | undefined,
): ViolationGroup[] {
  const byKind = new Map<string, SolverViolation[]>();
  for (const row of violations ?? []) {
    const list = byKind.get(row.kind);
    if (list) list.push(row);
    else byKind.set(row.kind, [row]);
  }
  return [...byKind.entries()].map(([kind, rows]) => ({
    kind,
    label: VIOLATION_LABELS[kind] ?? kind,
    rows,
  }));
}

export interface FailureVoice {
  heading: string;
  advice: string;
  severity: 'warning' | 'error';
}

const FAILURE_VOICE: Record<GenerationFailureReason, FailureVoice> = {
  timeout: {
    heading: 'It ran out of time, not out of options',
    advice:
      'The solver neither found a week nor proved there is none, so nothing was ' +
      'written. A longer limit usually settles it and nothing about the request ' +
      'has to change.',
    severity: 'warning',
  },
  invalid: {
    heading: 'This request cannot be run as it is written',
    advice:
      'Nothing was attempted and nothing was written. Change the request and ask ' +
      'again — the line above says what it objected to.',
    severity: 'warning',
  },
  clash: {
    heading: 'The week it produced collided with lessons already in place',
    advice:
      'Nothing was written. The generated week and the week already there cannot ' +
      'both stand, so either replace what is placed or move this draft off those ' +
      'dates.',
    severity: 'warning',
  },
  unreachable: {
    heading: 'The solver could not be reached',
    advice:
      'Nothing about the request is wrong. The generator runs as a separate ' +
      'service and this deployment could not open a connection to it. Try again, ' +
      'and tell whoever runs this school’s servers if it keeps happening.',
    severity: 'error',
  },
  refused: {
    heading: 'The solver refused the request',
    advice:
      'It was reached and would not take what was sent, or answered something this ' +
      'service could not read. That is a defect rather than a setting: report it ' +
      'with the detail above.',
    severity: 'error',
  },
  internal: {
    heading: 'Something went wrong inside the generator',
    advice:
      'This is not something the request can be changed to avoid. Report it with ' +
      'the detail above.',
    severity: 'error',
  },
};

export function failureVoice(reason: GenerationFailureReason | null | undefined): FailureVoice {
  return reason ? FAILURE_VOICE[reason] : FAILURE_VOICE.internal;
}

export function secondsLabel(milliseconds: number): string {
  if (milliseconds <= 0) return 'no measurable time';
  const seconds = milliseconds / 1000;
  const shown = seconds < 10 ? seconds.toFixed(1) : String(Math.round(seconds));
  return `${shown}s`;
}

export interface SolveQuality {
  label: string;
  proven: boolean;
}

export function solveQuality(job: GenerationJob): SolveQuality | null {
  if (job.solver_status === 'OPTIMAL') {
    return { label: 'The best week these requirements allow, proven', proven: true };
  }
  if (job.solver_status === 'FEASIBLE') {
    return {
      label: `The best week found in ${secondsLabel(job.wall_time_ms)}, not proven best`,
      proven: false,
    };
  }
  return null;
}

export function nextSeconds(current: number): number {
  return Math.min(MAX_SOLVE_SECONDS, Math.max(MIN_SOLVE_SECONDS, current) * 2);
}

export function canRaiseSeconds(current: number): boolean {
  return current < MAX_SOLVE_SECONDS;
}

export function pinnedTotal(days: Record<string, string> | undefined): number {
  let total = 0;
  for (const raw of Object.values(days ?? {})) {
    const value = wholeNumber(raw);
    if (value !== null) total += value;
  }
  return total;
}

export function cellLabel(cell: GenerationCell, periodName: string): string {
  return `${DAY_NAMES[cell.day_of_week] ?? `Day ${cell.day_of_week}`} · ${periodName}`;
}

export function sameCell(a: GenerationCell, b: GenerationCell): boolean {
  return a.day_of_week === b.day_of_week && a.period_id === b.period_id;
}
