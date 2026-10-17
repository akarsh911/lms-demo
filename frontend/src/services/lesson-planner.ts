import * as fixtures from '@/fixtures/lesson-planner';
import * as plans from '@/fixtures/lesson-plans';
import * as term from '@/fixtures/lesson-term';

import { apiRequest } from './api';
import { dev, fixtureServed, liveOrFixture } from './dev-bypass';
import type {
  DraftPlan,
  GenerateRequest,
  LessonBlock,
  LessonPlan,
  LessonPlanCreate,
  LessonPlanPatch,
  PlannerContext,
  PlannerOutline,
  PlannerWeek,
  RegenerateBlockRequest,
  TaughtWrite,
  TermContext,
  TermPlanSettings,
} from '@/types/lesson-planner';

const SERVICE = 'lessonplanner';
const GENERATION_MS = 900;

const get = <T>(path: string, query?: Record<string, string>, signal?: AbortSignal): Promise<T> =>
  apiRequest<T>(SERVICE, path, { method: 'GET', query, signal });

const send = <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> =>
  apiRequest<T>(SERVICE, path, { method, body });

const either = <T>(call: string, live: () => Promise<T>, fixture: () => T, ms?: number): Promise<T> =>
  liveOrFixture(SERVICE, call, live, () => dev(fixture, ms));

const write = <T>(live: () => Promise<T>, fixture: () => T): Promise<T> => (fixtureServed(SERVICE) ? dev(fixture) : live());

const planPath = (id: string): string => `plans/${encodeURIComponent(id)}`;

const termPath = (offeringId: string, leaf: string): string => `offerings/${encodeURIComponent(offeringId)}/${leaf}`;

const periodPath = (planId: string, periodId: string): string =>
  `${planPath(planId)}/periods/${encodeURIComponent(periodId)}/taught`;

export const lessonPlannerService = {
  context: (signal?: AbortSignal) =>
    either('context', () => get<PlannerContext>('context', undefined, signal), fixtures.context),

  outline: (curriculumId: string, signal?: AbortSignal) =>
    either(
      'outline',
      () => get<PlannerOutline>(`curricula/${encodeURIComponent(curriculumId)}/outline`, undefined, signal),
      () => fixtures.outline(curriculumId),
    ),

  generate: (request: GenerateRequest) =>
    either('generate', () => send<DraftPlan>('POST', 'generate', request), () => fixtures.generate(request), GENERATION_MS),

  regenerateBlock: (request: RegenerateBlockRequest) =>
    either(
      'regenerateBlock',
      () => send<LessonBlock>('POST', 'generate/block', request),
      () => fixtures.regenerateBlock(request),
      GENERATION_MS / 2,
    ),

  listPlans: (signal?: AbortSignal) => either('listPlans', () => get<LessonPlan[]>('plans', undefined, signal), plans.listPlans),

  getPlan: (id: string, signal?: AbortSignal) =>
    either('getPlan', () => get<LessonPlan>(planPath(id), undefined, signal), () => plans.getPlan(id)),

  createPlan: (body: LessonPlanCreate) =>
    write(() => send<LessonPlan>('POST', 'plans', body), () => plans.createPlan(body)),

  updatePlan: (id: string, body: LessonPlanPatch) =>
    write(() => send<LessonPlan>('PATCH', planPath(id), body), () => plans.updatePlan(id, body)),

  deletePlan: (id: string) => write(() => send<void>('DELETE', planPath(id)), () => plans.deletePlan(id)),

  markTaught: (planId: string, periodId: string, body: TaughtWrite) =>
    write(() => send<LessonPlan>('POST', periodPath(planId, periodId), body),
      () => plans.markTaught(planId, periodId, body.reflection),
    ),

  clearTaught: (planId: string, periodId: string) =>
    write(() => send<LessonPlan>('DELETE', periodPath(planId, periodId)), () => plans.clearTaught(planId, periodId)),

  week: (from: string, sectionId: string | null, signal?: AbortSignal) =>
    either(
      'week',
      () => get<PlannerWeek>('week', sectionId ? { from, section_id: sectionId } : { from }, signal),
      () => plans.week(from, sectionId),
    ),

  termContext: (offeringId: string, signal?: AbortSignal) =>
    either('termContext', () => get<TermContext>(termPath(offeringId, 'term-context'), undefined, signal), () => term.termContext(offeringId)),

  termPlan: (offeringId: string, signal?: AbortSignal) =>
    either('termPlan', () => get<TermPlanSettings>(termPath(offeringId, 'term-plan'), undefined, signal), () => term.termPlan(offeringId)),

  saveTermPlan: (settings: TermPlanSettings) =>
    write(() => send<TermPlanSettings>('PUT', termPath(settings.offering_id, 'term-plan'), settings),
      () => term.saveTermPlan(settings),
    ),
};
