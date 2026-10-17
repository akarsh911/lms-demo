import type {
  LessonBlock,
  LessonBlockKind,
  LessonPeriod,
  LessonResource,
  LessonResourceKind,
  TextbookCitation,
} from '@/types/lesson-planner';
import { LESSON_BLOCK_KINDS } from '@/types/lesson-planner';

import { CHAPTER_GUIDES, type ChapterGuide, type Segment } from './data/lesson-planner';

export interface ChapterSources {
  title: string;
  topics: readonly string[];
  citations: readonly TextbookCitation[];
  resources: readonly LessonResource[];
}

interface Draft {
  title: string;
  summary: string;
  steps: string[];
  resources: readonly LessonResourceKind[];
}

type Template = (segment: Segment, sources: ChapterSources) => Draft;

const SHARE: Readonly<Record<LessonBlockKind, number>> = {
  warm_up: 5,
  explanation: 12,
  activity: 13,
  check: 7,
  homework: 3,
};

const TEMPLATES: Readonly<Record<LessonBlockKind, readonly Template[]>> = {
  warm_up: [
    (s) => ({
      title: 'Hook question',
      summary: s.hook,
      steps: ['Pose the question and take three quick answers.', 'Write the predictions on the board to revisit at the end.'],
      resources: ['playground'],
    }),
    (s) => ({
      title: 'Recall starter',
      summary: `Three quick recall questions from the last lesson, leading into ${s.focus.toLowerCase()}.`,
      steps: ['Pupils answer on mini whiteboards.', 'Correct one common slip aloud before moving on.'],
      resources: [],
    }),
    (s) => ({
      title: 'Think, pair, share',
      summary: s.hook,
      steps: ['One minute alone, one minute with a partner.', 'Two pairs share; keep their wording for the explanation.'],
      resources: ['playground'],
    }),
  ],
  explanation: [
    (s) => ({
      title: `Teach: ${s.focus}`,
      summary: s.idea,
      steps: [`Model it: ${s.example}`, 'Pause for two checking questions before going on.', 'Pupils copy the key statement in their own words.'],
      resources: ['mindmap', 'playground_tool'],
    }),
    (s) => ({
      title: 'Example first, then the idea',
      summary: `Start from the example and name the idea only once pupils have seen it work: ${s.example}`,
      steps: [s.idea, 'Ask pupils which step of the example the idea explains.'],
      resources: ['mindmap', 'playground_tool'],
    }),
    (s, sources) => ({
      title: 'Build the concept map',
      summary: `Build the map of ${sources.title} live, adding ${s.focus.toLowerCase()} as the new branch.`,
      steps: [s.idea, `Anchor it with: ${s.example}`, 'Pupils add one link of their own to the map.'],
      resources: ['mindmap'],
    }),
  ],
  activity: [
    (s) => ({
      title: 'Group task',
      summary: s.task,
      steps: ['Groups of four, roles assigned: reader, recorder, checker, reporter.', 'Circulate and ask each group one why question.'],
      resources: ['playground', 'debate'],
    }),
    (s) => ({
      title: 'Explore in the playground',
      summary: `Pupils explore ${s.focus.toLowerCase()} interactively, recording one observation that surprised them.`,
      steps: ['Pairs share a screen and take turns at the controls.', s.task],
      resources: ['playground', 'playground_tool'],
    }),
    (s) => ({
      title: 'Gallery walk',
      summary: `Each group posts a worked answer on ${s.focus.toLowerCase()}; groups rotate and leave a sticky-note comment.`,
      steps: [s.task, 'Finish with the best comment read aloud.'],
      resources: ['debate'],
    }),
  ],
  check: [
    (s) => ({
      title: 'Exit questions',
      summary: 'Three short questions; collect answers to plan the next lesson.',
      steps: [...s.questions],
      resources: ['paper_setter'],
    }),
    (s) => ({
      title: 'Quick quiz',
      summary: `A five-question quiz on ${s.focus.toLowerCase()}, set in the Paper setter and marked in class.`,
      steps: [...s.questions.slice(0, 2), 'Pupils swap and mark against the key.'],
      resources: ['paper_setter', 'flashcards'],
    }),
    (s) => ({
      title: 'Traffic-light check',
      summary: 'Pupils hold up green, amber or red against each objective, then answer one question at their level.',
      steps: [s.questions[0] ?? 'Explain the idea in one sentence.', 'Reds sit together for a two-minute reteach next lesson.'],
      resources: [],
    }),
  ],
  homework: [
    (s) => ({ title: 'Practice from the textbook', summary: s.homework, steps: [], resources: ['flashcards'] }),
    (s) => ({
      title: 'Flashcard revision',
      summary: `Study the flashcard deck for this chapter and mark the cards on ${s.focus.toLowerCase()} you got wrong.`,
      steps: [s.homework],
      resources: ['flashcards'],
    }),
    (s) => ({
      title: 'Reflect and explain',
      summary: `Write five lines explaining ${s.focus.toLowerCase()} to a classmate who was absent.`,
      steps: ['Include one example and one common mistake.'],
      resources: [],
    }),
  ],
};

export const variantCount = (kind: LessonBlockKind): number => TEMPLATES[kind].length;

function genericSegment(chapter: string, focus: string): Segment {
  return {
    focus,
    hook: `Open with a real-life question about ${focus.toLowerCase()} and take a show of hands on the answer.`,
    idea: `Introduce the key terms of ${focus.toLowerCase()} and how they connect to what the class already knows from ${chapter}.`,
    example: `one worked example of ${focus.toLowerCase()} from the textbook.`,
    task: `Pairs solve two textbook problems on ${focus.toLowerCase()} and explain one solution to the class.`,
    questions: [`State the main idea of ${focus.toLowerCase()} in one sentence.`, 'Solve one short textbook problem.', 'Name one place this idea is used outside school.'],
    homework: `Textbook exercise on ${focus.toLowerCase()}.`,
  };
}

export function guideFor(chapter: string, topics: readonly string[]): ChapterGuide {
  const authored = CHAPTER_GUIDES[chapter];
  if (authored) return authored;
  const foci = topics.length > 0 ? topics : [`Core ideas of ${chapter}`, `Working with ${chapter}`, `Applying ${chapter}`];
  return {
    objectives: [
      `Explain the key ideas of ${chapter} in their own words.`,
      `Solve textbook problems on ${chapter} with correct working.`,
      `Apply ${chapter} to an unfamiliar situation.`,
    ],
    segments: foci.map((focus) => genericSegment(chapter, focus)),
  };
}

function consolidation(chapter: string, round: number): Segment {
  const focus = round % 2 === 0 ? 'Practice and consolidation' : 'Review and assessment';
  return genericSegment(chapter, `${focus}: ${chapter}`);
}

export function segmentsFor(sources: ChapterSources, periodCount: number): Segment[] {
  const segments = sources.topics.length > 0 ? sources.topics.map((topic) => genericSegment(sources.title, topic)) : guideFor(sources.title, sources.topics).segments;
  return Array.from({ length: periodCount }, (_, i) => segments[i] ?? consolidation(sources.title, i - segments.length));
}

export function minutesFor(kind: LessonBlockKind, periodMinutes: number): number {
  const total = Object.values(SHARE).reduce((sum, share) => sum + share, 0);
  return Math.max(2, Math.round((SHARE[kind] * periodMinutes) / total));
}

function pagesFor(citation: TextbookCitation, part: number, parts: number): TextbookCitation {
  const span = citation.page_end - citation.page_start + 1;
  const size = Math.max(1, Math.floor(span / Math.max(parts, 1)));
  const start = Math.min(citation.page_end, citation.page_start + part * size);
  const end = part === parts - 1 ? citation.page_end : Math.min(citation.page_end, start + size - 1);
  return { ...citation, page_start: start, page_end: end };
}

function citationsFor(kind: LessonBlockKind, sources: ChapterSources, part: number, parts: number): TextbookCitation[] {
  const [primary, secondary] = sources.citations;
  if (!primary) return [];
  const share = pagesFor(primary, part % parts, parts);
  if (kind === 'explanation') return [share];
  if (kind === 'activity') return [secondary ?? share];
  if (kind === 'homework') return [{ ...share, page_start: share.page_end, page_end: share.page_end }];
  return [];
}

function resourcesFor(wanted: readonly LessonResourceKind[], sources: ChapterSources, part: number): LessonResource[] {
  return wanted.flatMap((kind) => {
    const matching = sources.resources.filter((resource) => resource.kind === kind);
    const chosen = matching[part % Math.max(matching.length, 1)];
    return chosen ? [chosen] : [];
  });
}

export function buildBlock(
  kind: LessonBlockKind,
  variant: number,
  segment: Segment,
  sources: ChapterSources,
  position: { part: number; parts: number; minutes: number },
): LessonBlock {
  const templates = TEMPLATES[kind];
  const index = ((variant % templates.length) + templates.length) % templates.length;
  const template = templates[index] ?? templates[0];
  const draft = template ? template(segment, sources) : { title: kind, summary: '', steps: [], resources: [] };
  return {
    id: crypto.randomUUID(),
    kind,
    title: draft.title,
    minutes: position.minutes,
    summary: draft.summary,
    steps: draft.steps,
    citations: citationsFor(kind, sources, position.part, position.parts),
    resources: resourcesFor(draft.resources, sources, position.part),
    variant: index,
  };
}

export function buildPeriods(sources: ChapterSources, periodCount: number, periodMinutes: number): LessonPeriod[] {
  const segments = segmentsFor(sources, periodCount);
  return segments.map((segment, part) => ({
    id: crypto.randomUUID(),
    sequence: part + 1,
    focus: segment.focus,
    slot: null,
    taught: null,
    blocks: LESSON_BLOCK_KINDS.map((kind) =>
      buildBlock(kind, 0, segment, sources, { part, parts: periodCount, minutes: minutesFor(kind, periodMinutes) }),
    ),
  }));
}

export function segmentByFocus(sources: ChapterSources, focus: string): Segment {
  const { segments } = guideFor(sources.title, sources.topics);
  return segments.find((segment) => segment.focus === focus) ?? genericSegment(sources.title, focus);
}
