import type {
  DraftPlan,
  LessonPeriod,
  LessonPlan,
  LessonPlanCreate,
  LessonPlanPatch,
  LessonPlanStatus,
  PlannerOffering,
  PlannerWeek,
  ScheduledSlot,
  ChapterCoverage,
  TaughtPeriod,
  WeekLesson,
} from '@/types/lesson-planner';

import { CURRICULUM_NODES } from './data/library';
import { STAFF, TEACHERS } from './data/people';
import { PERIODS, TEACHER_ASSIGNMENTS } from './data/timetable';
import { seedId } from './ids';
import { identity } from './identity';
import { blockedForPlacement } from './lesson-calendar';
import { addDays, bellOf, calendarOf, generate, offeringById, offerings, outline, weekdayOf } from './lesson-planner';
import { fail } from './rows';

const SCHEDULE_HORIZON_DAYS = 120;

interface StoredPlan extends LessonPlan {
  author_id: string;
}

const store = globalThis as unknown as { __emergeLessonPlans?: StoredPlan[] };

const statusOf = (periods: readonly LessonPeriod[]): LessonPlanStatus => {
  const taught = periods.filter((period) => period.taught !== null).length;
  if (taught === 0) return 'scheduled';
  return taught === periods.length ? 'taught' : 'in_progress';
};

function freeSlots(offering: PlannerOffering, from: string, plans: readonly StoredPlan[], needed: number): ScheduledSlot[] {
  const taken = new Set(
    plans.filter((plan) => plan.offering_id === offering.offering_id).flatMap((plan) => plan.periods.flatMap((p) => (p.slot ? [`${p.slot.date}|${p.slot.period_id}`] : []))),
  );
  const blocked = blockedForPlacement(offering.grade, offering.offering_id);
  const found: ScheduledSlot[] = [];
  for (let day = 0; day < SCHEDULE_HORIZON_DAYS && found.length < needed; day += 1) {
    const date = addDays(from, day);
    if (blocked.has(date)) continue;
    const weekday = weekdayOf(date);
    for (const slot of offering.week.filter((s) => s.day_of_week === weekday)) {
      if (found.length < needed && !taken.has(`${date}|${slot.period_id}`)) found.push({ ...slot, date });
    }
  }
  return found;
}

function schedule(draft: DraftPlan, from: string, plans: readonly StoredPlan[]): LessonPeriod[] {
  const slots = freeSlots(offeringById(draft.offering_id), from, plans, draft.periods.length);
  return draft.periods.map((period, i) => ({ ...period, slot: slots[i] ?? null }));
}

const authorName = (personId: string | undefined): string =>
  STAFF.find((row) => row.person_id === personId)?.edges?.person?.display_name ?? 'You';

function stored(draft: DraftPlan, title: string, from: string, plans: StoredPlan[], authorId: string, fixed?: { id: string; at: string }): StoredPlan {
  const now = fixed?.at ?? new Date().toISOString();
  const periods = schedule(draft, from, plans);
  const plan: StoredPlan = { ...draft, periods, id: fixed?.id ?? crypto.randomUUID(), title, author_id: authorId, author_name: authorName(authorId), status: statusOf(periods), created_at: now, updated_at: now };
  plans.push(plan);
  return plan;
}

function taughtSeed(plan: StoredPlan, notes: readonly string[]): void {
  plan.periods = plan.periods.map((period, i) => {
    const note = notes[i];
    return note && period.slot ? { ...period, taught: { taught_at: `${period.slot.date}T09:00:00.000Z`, reflection: note } } : period;
  });
  plan.status = statusOf(plan.periods);
}

const REFLECTIONS = [
  'Covered as planned; most of the class kept up.',
  'Ran short on the activity; finished it as homework.',
  'Good questions from the front rows; recap the key terms next time.',
  'Exit questions showed the idea landed for most.',
];

const notesFor = (count: number): string[] => Array.from({ length: count }, (_, i) => REFLECTIONS[i % REFLECTIONS.length] ?? '');

function authorOf(offeringId: string): string {
  const teacherId = TEACHER_ASSIGNMENTS.find((row) => row.subject_offering_id === offeringId)?.teacher_id;
  const staffId = TEACHERS.find((row) => row.id === teacherId)?.staff_id;
  return STAFF.find((row) => row.id === staffId)?.person_id ?? STAFF[0]?.person_id ?? '';
}

interface SeedPlan {
  grade: number;
  subject: string;
  section: string;
  chapter: string;
  periods: number;
  title: string;
  start: string;
  notes: readonly string[];
}

const SEED_PLANS: readonly SeedPlan[] = [
  {
    grade: 10, subject: 'MATH', section: '', chapter: 'Polynomials', periods: 2, title: 'Polynomials: zeroes and coefficients', start: '2026-09-15',
    notes: ['Graph gallery worked well; three pupils still confuse zeroes with the y-intercept.', 'Reverse puzzles were the highlight. Revisit αβ = c/a with the back row.'],
  },
  {
    grade: 10, subject: 'MATH', section: '', chapter: 'Pair of Linear Equations in Two Variables', periods: 3, title: 'Linear pairs: graphs to elimination', start: '2026-10-02',
    notes: ['Fare-card graphs took longer than planned; cut the second pair next time.'],
  },
  { grade: 10, subject: 'SCI', section: 'A', chapter: 'Control and Coordination', periods: 6, title: 'Control and Coordination', start: '2026-08-17', notes: notesFor(6) },
  { grade: 10, subject: 'SCI', section: 'A', chapter: 'Light: Reflection and Refraction', periods: 8, title: 'Light: mirrors and refraction', start: '2026-09-01', notes: notesFor(8) },
  { grade: 10, subject: 'SCI', section: 'B', chapter: 'Heredity', periods: 5, title: 'Heredity', start: '2026-09-07', notes: notesFor(5) },
  { grade: 10, subject: 'SCI', section: 'A', chapter: 'How do Organisms Reproduce?', periods: 6, title: 'How organisms reproduce', start: '2026-10-01', notes: notesFor(2) },
];

function seedOffering(entry: SeedPlan): PlannerOffering | undefined {
  if (entry.section) return offerings().find((row) => row.grade === entry.grade && row.subject_code === entry.subject && row.section_label.endsWith(`· ${entry.section}`));
  const taught = new Set(TEACHER_ASSIGNMENTS.filter((row) => row.teacher_id === TEACHERS[0]?.id).map((row) => row.subject_offering_id));
  return offerings().find((row) => row.grade === entry.grade && row.subject_code === entry.subject && taught.has(row.offering_id));
}

function seed(): StoredPlan[] {
  const plans: StoredPlan[] = [];
  for (const entry of SEED_PLANS) {
    const offering = seedOffering(entry);
    const chapter = offering?.curriculum_id ? outline(offering.curriculum_id).chapters.find((row) => row.title === entry.chapter) : undefined;
    if (!offering || !chapter) continue;
    const draft = generate({ offering_id: offering.offering_id, curriculum_node_id: chapter.id, topic_ids: [], period_count: entry.periods, objectives: [] });
    const fixed = { id: seedId('lesson-plan', offering.offering_id, chapter.id), at: `${entry.start}T08:00:00.000Z` };
    taughtSeed(stored(draft, entry.title, entry.start, plans, authorOf(offering.offering_id), fixed), entry.notes);
  }
  return plans;
}

const plans = (): StoredPlan[] => (store.__emergeLessonPlans ??= seed());

const visible = (plan: StoredPlan): boolean => {
  const { roles, person } = identity();
  if (roles?.is_teacher) return plan.author_id === person?.id;
  return Boolean(roles?.is_staff);
};

const publicPlan = ({ author_id: _author, ...plan }: StoredPlan): LessonPlan => plan;

const ownPlan = (id: string): StoredPlan => {
  const plan = plans().find((row) => row.id === id && visible(row));
  return plan ?? fail(404, 'not_found', 'lesson plan not found');
};

export const listPlans = (): LessonPlan[] =>
  plans().filter(visible).map(publicPlan).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

export const getPlan = (id: string): LessonPlan => publicPlan(ownPlan(id));

export function createPlan(body: LessonPlanCreate): LessonPlan {
  if (!body.title.trim()) fail(422, 'invalid_title', 'A lesson plan needs a title.');
  if (body.draft.periods.length === 0) fail(422, 'invalid_periods', 'A lesson plan needs at least one period.');
  const author = identity().person?.id ?? '';
  return publicPlan(stored(body.draft, body.title.trim(), body.start_date, plans(), author));
}

function replace(id: string, change: (plan: StoredPlan) => Partial<StoredPlan>): LessonPlan {
  const current = ownPlan(id);
  const next: StoredPlan = { ...current, ...change(current), updated_at: new Date().toISOString() };
  next.status = statusOf(next.periods);
  const all = plans();
  all.splice(all.indexOf(current), 1, next);
  return publicPlan(next);
}

export const updatePlan = (id: string, body: LessonPlanPatch): LessonPlan =>
  replace(id, () => ({
    ...(body.title !== undefined ? { title: body.title.trim() || 'Untitled plan' } : {}),
    ...(body.objectives ? { objectives: body.objectives } : {}),
    ...(body.periods ? { periods: body.periods } : {}),
  }));

export function deletePlan(id: string): void {
  const all = plans();
  all.splice(all.indexOf(ownPlan(id)), 1);
}

export const markTaught = (planId: string, periodId: string, reflection: string): LessonPlan =>
  replace(planId, (plan) => {
    if (!plan.periods.some((period) => period.id === periodId)) fail(404, 'not_found', 'period not found');
    return {
      periods: plan.periods.map((period) =>
        period.id === periodId ? { ...period, taught: { taught_at: new Date().toISOString(), reflection: reflection.trim() } } : period,
      ),
    };
  });

export const clearTaught = (planId: string, periodId: string): LessonPlan =>
  replace(planId, (plan) => ({ periods: plan.periods.map((period) => (period.id === periodId ? { ...period, taught: null } : period)) }));

function scopeOf(sectionId: string | null): PlannerOffering[] {
  const all = offerings();
  if (sectionId) return all.filter((row) => row.section_id === sectionId);
  const mine = all.filter((row) => row.mine);
  if (mine.length > 0) return mine;
  const planned = new Set(plans().filter(visible).map((plan) => plan.offering_id));
  return all.filter((row) => planned.has(row.offering_id));
}

export function week(from: string, sectionId: string | null): PlannerWeek {
  const monday = addDays(from, 1 - weekdayOf(from));
  const scope = scopeOf(sectionId);
  const scheduled = new Map(
    plans().filter(visible).flatMap((plan) =>
      plan.periods.flatMap((period) => (period.slot ? [[`${plan.offering_id}|${period.slot.date}|${period.slot.period_id}`, { plan, period }] as const] : [])),
    ),
  );
  const blockedOf = new Map(scope.map((offering) => [offering.offering_id, blockedForPlacement(offering.grade, offering.offering_id)]));
  const closedFor = (offering: PlannerOffering, date: string): string | undefined => blockedOf.get(offering.offering_id)?.get(date);
  const days = [0, 1, 2, 3, 4].map((offset) => {
    const date = addDays(monday, offset);
    const reasons = scope.map((offering) => closedFor(offering, date));
    const open = scope.length === 0 ? Boolean(calendarOf.get(date)?.forenoon_open) : reasons.some((reason) => reason === undefined);
    const name = open ? null : (reasons.find(Boolean) ?? calendarOf.get(date)?.name ?? null);
    return { date, day_of_week: offset + 1, open, name };
  });
  const lessons: WeekLesson[] = days.filter((day) => day.open).flatMap((day) =>
    scope.filter((offering) => closedFor(offering, day.date) === undefined).flatMap((offering) =>
      offering.week.filter((slot) => slot.day_of_week === day.day_of_week).map((slot) => {
        const hit = scheduled.get(`${offering.offering_id}|${day.date}|${slot.period_id}`);
        return {
          date: day.date,
          period_id: slot.period_id,
          offering_id: offering.offering_id,
          section_label: offering.section_label,
          subject_name: offering.subject_name,
          plan_id: hit?.plan.id ?? null,
          plan_title: hit?.plan.title ?? null,
          period_sequence: hit?.period.sequence ?? null,
          period_count: hit ? hit.plan.periods.length : null,
          focus: hit?.period.focus ?? null,
          taught: hit ? hit.period.taught !== null : false,
        };
      }),
    ),
  );
  const periods = PERIODS.filter((period) => period.kind === 'teaching').map((period) => {
    const bell = bellOf.get(period.id);
    return { period_id: period.id, period_name: period.name ?? 'Period', start_minute: bell?.start_minute ?? 0, end_minute: bell?.end_minute ?? 0 };
  });
  const sections = new Set(scope.map((row) => row.section_label));
  return { from: monday, to: addDays(monday, 4), section_label: sections.size === 1 ? [...sections][0] ?? null : null, days, periods, lessons };
}

export function taughtPeriods(offeringId: string): TaughtPeriod[] {
  return plans()
    .filter((plan) => plan.offering_id === offeringId)
    .flatMap((plan) =>
      plan.periods.flatMap((period) => (period.taught && period.slot ? [{ date: period.slot.date, period_id: period.slot.period_id, chapter_id: plan.curriculum_node_id }] : [])),
    );
}

export function chapterCoverage(offeringId: string): ChapterCoverage[] {
  const tally = new Map<string, { total: number; taught: number; topics: Set<string> }>();
  for (const plan of plans().filter((row) => row.offering_id === offeringId)) {
    const entry = tally.get(plan.curriculum_node_id) ?? { total: 0, taught: 0, topics: new Set<string>() };
    const taught = plan.periods.filter((period) => period.taught !== null).length;
    entry.total += plan.periods.length;
    entry.taught += taught;
    if (taught > 0) {
      const topics = CURRICULUM_NODES.filter((node) => node.parent_id === plan.curriculum_node_id && plan.topic_titles.includes(node.title ?? ''));
      for (const topic of topics) entry.topics.add(topic.id);
    }
    tally.set(plan.curriculum_node_id, entry);
  }
  return [...tally.entries()].flatMap(([chapterId, entry]) =>
    entry.taught === 0 ? [] : [{ chapter_id: chapterId, state: entry.taught >= entry.total ? 'taught' : 'in_progress', taught_topic_ids: [...entry.topics] }],
  );
}
