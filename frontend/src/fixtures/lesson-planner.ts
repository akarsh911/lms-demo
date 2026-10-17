import { sectionLabel } from '@/lib/school/names';
import type {
  DraftPlan,
  GenerateRequest,
  LessonBlock,
  LessonPeriod,
  LessonPlan,
  LessonPlanCreate,
  LessonPlanPatch,
  LessonPlanStatus,
  LessonResource,
  PlannerChapter,
  PlannerContext,
  PlannerOffering,
  PlannerOutline,
  PlannerWeek,
  RegenerateBlockRequest,
  ScheduledSlot,
  TextbookCitation,
  WeekLesson,
} from '@/types/lesson-planner';

import { curriculumNodeMindmaps } from './engines';
import { DEBATE_CATALOG } from './debate-catalog';
import { DEBATE_MOTIONS, FLASHCARD_CHAPTERS, PLAYGROUND_THREADS, TOOLS_BY_CHAPTER, TOOLS_BY_SUBJECT } from './data/lesson-planner';
import { CONTENT_ITEMS, CURRICULA, CURRICULUM_NODES, PLACEMENTS } from './data/library';
import { STAFF, TEACHERS } from './data/people';
import { CURRENT_SECTIONS, CURRENT_SESSION, GRADE_LEVELS, OFFERINGS } from './data/structure';
import { BELL_PERIODS, BELLS, CALENDAR_DAYS, PERIODS, SLOTS, TEACHER_ASSIGNMENTS, TIMETABLE } from './data/timetable';
import { buildBlock, buildPeriods, guideFor, minutesFor, segmentByFocus, type ChapterSources } from './lesson-generator';
import { caller, identity } from './identity';
import { fail, must } from './rows';

const QUIZ_QUESTIONS = 5;
const MAX_PERIODS = 8;
const DAY_MS = 86_400_000;

export const isoOf = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const addDays = (iso: string, days: number): string => isoOf(new Date(new Date(`${iso}T00:00:00`).getTime() + days * DAY_MS));

export const weekdayOf = (iso: string): number => ((new Date(`${iso}T00:00:00`).getDay() + 6) % 7) + 1;

const regularBell = BELLS.find((bell) => bell.is_default);
export const bellOf = new Map(BELL_PERIODS.filter((row) => row.bell_schedule_id === regularBell?.id).map((row) => [row.period_id ?? '', row]));
const periodOf = new Map(PERIODS.map((period) => [period.id, period]));
const sectionOf = new Map(CURRENT_SECTIONS.map((section) => [section.id, section]));
const gradeOf = new Map(GRADE_LEVELS.map((grade) => [grade.id, grade.sequence ?? 0]));
export const calendarOf = new Map(CALENDAR_DAYS.map((day) => [(day.calendar_date ?? '').slice(0, 10), day]));
const itemOf = new Map(CONTENT_ITEMS.map((item) => [item.id, item]));

const slotsByOffering = SLOTS.filter((slot) => slot.timetable_id === TIMETABLE.id).reduce((index, slot) => {
  const key = slot.subject_offering_id ?? '';
  index.set(key, [...(index.get(key) ?? []), slot]);
  return index;
}, new Map<string, typeof SLOTS>());

function weekOf(offeringId: string): PlannerOffering['week'] {
  return (slotsByOffering.get(offeringId) ?? [])
    .map((slot) => {
      const bell = bellOf.get(slot.period_id ?? '');
      return {
        slot_id: slot.id,
        day_of_week: slot.day_of_week ?? 0,
        period_id: slot.period_id ?? '',
        period_name: periodOf.get(slot.period_id ?? '')?.name ?? 'Period',
        start_minute: bell?.start_minute ?? 0,
        end_minute: bell?.end_minute ?? 0,
      };
    })
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_minute - b.start_minute);
}

let offeringsCache: PlannerOffering[] | null = null;

export function offerings(): PlannerOffering[] {
  if (offeringsCache) return offeringsCache;
  const { teacherId } = caller();
  const mine = new Set(TEACHER_ASSIGNMENTS.filter((row) => row.teacher_id === teacherId).map((row) => row.subject_offering_id));
  offeringsCache = OFFERINGS.filter((row) => row.academic_session_id === CURRENT_SESSION.id).flatMap((row) => {
    const section = sectionOf.get(row.section_id ?? '');
    if (!section) return [];
    const week = weekOf(row.id);
    const minutes = week[0] ? week[0].end_minute - week[0].start_minute : 40;
    const curriculum = CURRICULA.find((c) => c.subject_id === row.subject_id && c.grade_level_id === section.grade_level_id);
    return [
      {
        offering_id: row.id,
        section_id: section.id,
        section_label: sectionLabel(section),
        grade: gradeOf.get(section.grade_level_id ?? '') ?? 0,
        subject_id: row.subject_id ?? '',
        subject_code: row.edges?.subject?.code ?? '',
        subject_name: row.edges?.subject?.name ?? 'Subject',
        curriculum_id: curriculum?.id ?? null,
        periods_per_week: row.periods_per_week ?? week.length,
        period_minutes: minutes,
        mine: mine.has(row.id),
        week,
      },
    ];
  });
  return offeringsCache;
}

export const offeringById = (id: string): PlannerOffering =>
  offerings().find((row) => row.offering_id === id) ?? fail(404, 'not_found', 'subject offering not found');

export const context = (): PlannerContext => ({ today: isoOf(new Date()), offerings: offerings() });

function citationsOf(nodeId: string): TextbookCitation[] {
  const fromMaps = curriculumNodeMindmaps(nodeId).mindmaps.flatMap((link) =>
    typeof link.page_start === 'number' && typeof link.page_end === 'number'
      ? [{ content_item_id: link.content_item_id, title: link.title ?? 'Textbook', page_start: link.page_start, page_end: link.page_end }]
      : [],
  );
  const fromPlacements = PLACEMENTS.filter((p) => p.curriculum_node_id === nodeId && p.status === 'confirmed').flatMap((p) => {
    const item = itemOf.get(p.content_item_id ?? '');
    const { page_start: start, page_end: end } = p;
    if (item?.status !== 'published' || typeof start !== 'number' || typeof end !== 'number') return [];
    return [{ content_item_id: item.id, title: item.title ?? 'Untitled', page_start: start, page_end: end }];
  });
  const seen = new Set<string>();
  return [...fromMaps, ...fromPlacements]
    .filter((c) => !seen.has(c.content_item_id) && Boolean(seen.add(c.content_item_id)))
    .sort((a, b) => Number(itemOf.get(b.content_item_id)?.kind === 'book') - Number(itemOf.get(a.content_item_id)?.kind === 'book'));
}

function resourcesOf(nodeId: string, title: string, grade: number, subjectCode: string): LessonResource[] {
  const maps: LessonResource[] = curriculumNodeMindmaps(nodeId).mindmaps.flatMap((link) => {
    const best = link.sections[0];
    if (link.mindmap_state !== 'available' || !best) return [];
    return [{ kind: 'mindmap', title: `Mind map · ${link.title ?? best.display}`, item_id: link.content_item_id, section_id: best.section_id, page_start: null, page_end: null }];
  });
  const playground: LessonResource[] = (PLAYGROUND_THREADS[title] ?? []).map((thread) => ({ kind: 'playground', title: 'Visual playground', thread_id: thread, grade }));
  const toolId = TOOLS_BY_CHAPTER[title] ?? TOOLS_BY_SUBJECT[subjectCode];
  const tools: LessonResource[] = toolId ? [{ kind: 'playground_tool', title: 'Playground tool', tool_id: toolId, grade }] : [];
  const deck = FLASHCARD_CHAPTERS[title];
  const flashcards: LessonResource[] = deck ? [{ kind: 'flashcards', title: `Flashcards · ${title}`, chapter_id: deck }] : [];
  const motionId = DEBATE_MOTIONS[title];
  const motion = DEBATE_CATALOG.categories.flatMap((category) => category.topics).find((topic) => topic.id === motionId);
  const debate: LessonResource[] = motion ? [{ kind: 'debate', title: `Debate · ${motion.text}`, motion_id: motion.id }] : [];
  const quiz: LessonResource = { kind: 'paper_setter', title: `Quick quiz · ${title}`, question_count: QUIZ_QUESTIONS };
  return [...maps, ...playground, ...tools, ...flashcards, ...debate, quiz];
}

const subjectCodeOf = (curriculumId: string | undefined): string => (CURRICULA.find((c) => c.id === curriculumId)?.code ?? '').split('-')[0] ?? '';

function chapterOf(nodeId: string, grade: number): PlannerChapter {
  const node = must(CURRICULUM_NODES, nodeId, 'curriculum node');
  const title = node.title ?? 'Chapter';
  const topics = CURRICULUM_NODES.filter((child) => child.parent_id === node.id).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const guide = guideFor(title, topics.map((topic) => topic.title ?? ''));
  return {
    id: node.id,
    title,
    sequence: node.sequence ?? 0,
    topics: topics.map((topic) => ({ id: topic.id, title: topic.title ?? 'Topic' })),
    objectives: [...guide.objectives],
    suggested_periods: Math.min(Math.max(guide.segments.length, 1), MAX_PERIODS),
    citations: citationsOf(node.id),
    resources: resourcesOf(node.id, title, grade, subjectCodeOf(node.curriculum_id)),
  };
}

export function outline(curriculumId: string): PlannerOutline {
  const curriculum = must(CURRICULA, curriculumId, 'curriculum');
  const grade = gradeOf.get(curriculum.grade_level_id ?? '') ?? 0;
  const chapters = CURRICULUM_NODES.filter((node) => node.curriculum_id === curriculum.id && node.kind === 'chapter')
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((node) => chapterOf(node.id, grade));
  return { curriculum_id: curriculum.id, chapters };
}

function sourcesOf(offering: PlannerOffering, nodeId: string, topicIds: readonly string[] = []): ChapterSources {
  const chapter = chapterOf(nodeId, offering.grade);
  const chosen = chapter.topics.filter((topic) => topicIds.includes(topic.id));
  return { title: chapter.title, topics: chosen.map((topic) => topic.title), citations: chapter.citations, resources: chapter.resources };
}

export function generate(request: GenerateRequest): DraftPlan {
  const offering = offeringById(request.offering_id);
  if (request.period_count < 1 || request.period_count > MAX_PERIODS) {
    fail(422, 'invalid_period_count', `A plan covers between 1 and ${MAX_PERIODS} periods.`);
  }
  const chapter = chapterOf(request.curriculum_node_id, offering.grade);
  const chosen = chapter.topics.filter((topic) => request.topic_ids.includes(topic.id)).map((topic) => topic.title);
  const topicTitles = [...chosen, ...(request.focus_topics ?? []).filter((title) => !chosen.includes(title))];
  const sources = { ...sourcesOf(offering, chapter.id, request.topic_ids), topics: topicTitles };
  return {
    offering_id: offering.offering_id,
    section_label: offering.section_label,
    grade: offering.grade,
    subject_name: offering.subject_name,
    curriculum_node_id: chapter.id,
    chapter_title: chapter.title,
    topic_titles: topicTitles,
    objectives: request.objectives.length > 0 ? request.objectives : chapter.objectives,
    period_minutes: offering.period_minutes,
    periods: buildPeriods(sources, request.period_count, offering.period_minutes),
  };
}

export function regenerateBlock(request: RegenerateBlockRequest): LessonBlock {
  const offering = offeringById(request.offering_id);
  const sources = sourcesOf(offering, request.curriculum_node_id);
  const segment = segmentByFocus(sources, request.focus);
  return buildBlock(request.kind, request.variant + 1, segment, sources, {
    part: request.period_sequence - 1,
    parts: Math.max(request.period_count, request.period_sequence, 1),
    minutes: request.minutes || minutesFor(request.kind, offering.period_minutes),
  });
}
