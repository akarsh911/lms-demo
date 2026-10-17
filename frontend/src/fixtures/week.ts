import type { ClashProposal, ClashReport, PeriodScheme, PeriodSchemeGradeLevel, SlotWrite, TimetableSlot } from '@/types/school';
import type { GenerationJob, GenerationRequest } from '@/types/timetable-generation';

import { clashReport, detectClashes } from './clash';
import { GRADE_LEVELS } from './data/structure';
import { BELLS, BELL_PERIODS, PERIODS, PERIOD_SCHEMES, SCHEME_GRADES, SLOTS, TIMETABLES } from './data/timetable';
import { newId } from './ids';
import { byId, cleared, fail, insert, must, notFound, patch } from './rows';
import { DEFAULT_SECONDS, FORCED, settle, validate, type Outcome } from './solver';

const QUEUED_FOR_MS = 400;
const RUNNING_FOR_MS = 2200;

function proposal(slot: Partial<TimetableSlot>, replaces?: string): ClashProposal {
  return {
    ref: 'proposed',
    replaces_timetable_slot_id: replaces,
    section_id: slot.section_id ?? '',
    period_id: slot.period_id ?? '',
    day_of_week: slot.day_of_week ?? 0,
    subject_offering_id: slot.subject_offering_id,
    teacher_id: slot.teacher_id,
    room_id: slot.room_id,
  };
}

// A clashing placement is refused with the report unless it is saved as an override, as the real route does.
function writeSlot(timetableId: string, body: SlotWrite, current?: TimetableSlot): TimetableSlot {
  const merged = { ...current, ...cleared(body), id: current?.id ?? newId(), timetable_id: timetableId } as TimetableSlot;
  const clashes = detectClashes(timetableId, [proposal(merged, current?.id)], new Set());
  if (clashes.length > 0 && body.clash_override !== true) {
    fail(409, 'timetable_clash', 'the placement clashes with the existing week', { clashes, count: clashes.length });
  }

  const accepted = clashes.map((c) => ({
    rule: c.rule,
    scope: c.scope,
    day_of_week: c.day_of_week,
    period_id: c.period_id,
    counterpart_timetable_slot_id: c.right.timetable_slot_id,
    teacher_id: c.teacher_id,
    room_id: c.room_id,
    student_count: c.student_count,
  }));
  const row = { ...merged, clash_override: clashes.length > 0, clash_override_json: accepted };
  return current ? (patch(SLOTS, current.id, row) ?? row) : insert(SLOTS, row);
}

export const createSlot = (timetableId: string, body: SlotWrite): TimetableSlot => writeSlot(timetableId, body);

export function updateSlot(id: string, body: SlotWrite): TimetableSlot {
  const current = must(SLOTS, id, 'timetable slot');
  return writeSlot(current.timetable_id ?? '', body, current);
}

export const checkClashes = (
  timetableId: string,
  body: { proposed?: ClashProposal[]; exclude_timetable_slot_ids?: string[] },
): ClashReport => clashReport(detectClashes(timetableId, body.proposed ?? [], new Set(body.exclude_timetable_slot_ids ?? [])));

export const schemeGrades = (schemeId: string): PeriodSchemeGradeLevel[] =>
  SCHEME_GRADES.filter((link) => link.period_scheme_id === schemeId);

export function attachSchemeGrades(schemeId: string, gradeLevelIds: readonly string[]): { attached: number } {
  const linked = new Set(schemeGrades(schemeId).map((link) => link.grade_level_id));
  const fresh = gradeLevelIds.filter((id) => !linked.has(id));
  for (const gradeId of fresh) {
    const grade = byId(GRADE_LEVELS, gradeId);
    insert(SCHEME_GRADES, {
      period_scheme_id: schemeId,
      grade_level_id: gradeId,
      edges: { grade_level: grade && { id: grade.id, name: grade.name, code: grade.code, sequence: grade.sequence } },
    });
  }
  return { attached: fresh.length };
}

// Copies the scheme with its periods and bells, re-pointing each bell period at the copied period.
export function cloneScheme(schemeId: string, body: { name: string; code: string; grade_level_ids?: string[] }): PeriodScheme {
  const source = must(PERIOD_SCHEMES, schemeId, 'period scheme');
  const copy = insert(PERIOD_SCHEMES, { ...source, id: newId(), name: body.name, code: body.code });
  const periodMap = new Map<string, string>();
  for (const period of PERIODS.filter((p) => p.period_scheme_id === source.id)) {
    periodMap.set(period.id, insert(PERIODS, { ...period, id: newId(), period_scheme_id: copy.id }).id);
  }
  for (const bell of BELLS.filter((b) => b.period_scheme_id === source.id)) {
    const madeBell = insert(BELLS, { ...bell, id: newId(), period_scheme_id: copy.id });
    for (const bp of BELL_PERIODS.filter((x) => x.bell_schedule_id === bell.id)) {
      insert(BELL_PERIODS, { ...bp, id: newId(), bell_schedule_id: madeBell.id, period_id: periodMap.get(bp.period_id ?? '') });
    }
  }
  attachSchemeGrades(copy.id, body.grade_level_ids ?? []);
  return copy;
}

interface JobRecord {
  job: GenerationJob;
  requestedAt: number;
  request: GenerationRequest;
  outcome?: Outcome;
}

const JOBS = new Map<string, JobRecord>();

// A job has no worker: its state is a function of its age, and the week is written the first time it is seen settled.
function viewOf(record: JobRecord): GenerationJob {
  const age = Date.now() - record.requestedAt;
  if (age < QUEUED_FOR_MS) return record.job;

  const started = new Date(record.requestedAt + QUEUED_FOR_MS).toISOString();
  if (age < RUNNING_FOR_MS) return { ...record.job, status: 'running', started_at: started };

  const draft = byId(TIMETABLES, record.job.timetable_id);
  record.outcome ??= draft ? settle(draft, record.request, null) : FORCED.internal;
  return {
    ...record.job,
    ...record.outcome,
    started_at: started,
    finished_at: new Date(record.requestedAt + RUNNING_FOR_MS).toISOString(),
    terminal: true,
  };
}

export function startGeneration(timetableId: string, request: GenerationRequest): GenerationJob {
  const draft = must(TIMETABLES, timetableId, 'timetable');
  if (draft.status !== 'draft') {
    fail(
      422,
      'unprocessable_entity',
      `a generated week is written as a draft for a person to publish, so auto-fill only runs on a draft; this one is ${draft.status}`,
    );
  }
  const fault = validate(request);
  if (fault) fail(422, 'unprocessable_entity', fault);

  const running = [...JOBS.values()].some((record) => record.job.timetable_id === draft.id && !viewOf(record).terminal);
  if (running) fail(409, 'conflict', 'this timetable is already being generated; wait for that run to finish');

  const job: GenerationJob = {
    id: newId(),
    timetable_id: draft.id,
    status: 'queued',
    terminal: false,
    max_seconds: request.max_seconds ?? DEFAULT_SECONDS,
    requested_by: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    slots_written: 0,
    wall_time_ms: 0,
    solver_status: null,
    verdict: null,
    objective: null,
    failure_reason: null,
    detail: null,
    core_keys: [],
    warnings: [],
    soft_violations: [],
  };
  JOBS.set(job.id, { job, requestedAt: Date.now(), request });
  return job;
}

export function readGeneration(timetableId: string, jobId: string): GenerationJob {
  const record = JOBS.get(jobId);
  if (!record || record.job.timetable_id !== timetableId) return notFound('timetable generation');
  return viewOf(record);
}
