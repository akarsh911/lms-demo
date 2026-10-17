import { linkedPaperId, setQuestions } from '@/lib/answer-checker/paper';
import { chaptersInRange, resolvePath, type CatalogSubject, type CatalogTopic } from '@/lib/gap-analyzer/catalog';
import { clamp01 } from '@/lib/gap-analyzer/model';
import {
  fromAnswerSheet,
  fromDebate,
  fromExamMark,
  fromFlashcards,
  fromMastery,
  fromOmr,
  fromPractice,
  type AnswerSheetRecord,
  type ExamMarkRecord,
  type MasteryRecord,
  type OmrRecord,
} from '@/lib/gap-analyzer/normalise';
import type { GapEvidence } from '@/types/gap-analyzer';
import type { MasteryMap, MasteryState } from '@/types/mastery';
import type { Paper } from '@/types/papersetter';

import { getBooklet, listBooklets, listExams } from './answer-checker';
import { chance, quantise } from './answer-checker-marking';
import { classRoster } from './answer-checker-paper';
import { seedCheckerFixtures } from './answer-checker-seed';
import { CHECKER_PAPERS, MARKING_SCHEMES } from './data/answer-checker';
import { EXAM_MARKS, EXAM_SUBJECTS, EXAMS } from './data/exams';
import {
  CONTROL_WINDOW,
  DEBATE_CLAIMS,
  DEBATE_DATE,
  DEBATE_SESSION_MOTION,
  DEMO_STUDENTS,
  ERP_EXAM_CODES,
  EVIDENCE_PAPERS,
  FLASHCARD_WINDOW,
  GAP_SYLLABUS,
  MASTERY_WINDOW,
  PERSONAL_LEANS,
  PRACTICE_SITTINGS,
  type PracticeSitting,
  SECTION_LEANS,
  SEEDED_CHECKER_PAPERS,
  SEEDED_OMR,
  SHARE,
  TOPIC_DIFFICULTY,
} from './data/gap-analyzer';
import { SYLLABUS_RULES } from './data/lesson-term';
import { SETTER_PAPERS } from './data/papersetter';
import { CURRENT_SESSION, OFFERINGS } from './data/structure';
import { readMastery } from './engines';
import { debateMotionById, mindmapTopics, type MindmapTopic } from './gap-analyzer-catalog';
import { hasEvidence, type Pupil } from './gap-analyzer-pupils';
import { seedId } from './ids';
import { scoreSheet } from './omr';
import { demoOmrSeed } from './omr-seed';


const LIFE_PROCESSES = 'Life Processes';
const CONTROL = 'Control and Coordination';
const NOISE = 0.24;
const PRACTICE_UPLIFT = 0.08;
const DEFAULT_ABILITY = 0.55;
const DAY_MS = 86_400_000;
const MINDMAP_DRAW = 'mindmap';

const markByKey = new Map(EXAM_MARKS.map((mark) => [`${mark.exam_subject_id}|${mark.student_id}`, mark]));
const DEMO: ReadonlySet<number> = new Set(DEMO_STUDENTS);

const shiftDate = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const within = (window: { from: string; days: number }, ...parts: (string | number)[]): string => shiftDate(window.from, Math.floor(chance(...parts) * window.days));

const offeringOf = (pupil: Pupil, code: string) =>
  OFFERINGS.find((row) => row.section_id === pupil.section.id && row.academic_session_id === CURRENT_SESSION.id && row.edges?.subject?.code === code);

function examRecords(pupil: Pupil, subject: CatalogSubject): ExamMarkRecord[] {
  const offering = offeringOf(pupil, subject.code);
  const key = `${pupil.grade}-${subject.code}`;
  const rules = SYLLABUS_RULES[key] ?? GAP_SYLLABUS[key];
  if (!offering || !rules) return [];
  return ERP_EXAM_CODES.flatMap((code) => {
    const exam = EXAMS.find((row) => row.code === code && row.academic_session_id === CURRENT_SESSION.id);
    const sitting = EXAM_SUBJECTS.find((row) => row.exam_id === exam?.id && row.subject_offering_id === offering.id);
    const mark = markByKey.get(`${sitting?.id ?? ''}|${pupil.student_id}`);
    const rule = rules[code];
    if (!exam || !sitting || !mark || mark.status !== 'marked' || mark.marks_obtained === undefined || !rule) return [];
    return [
      {
        mark_id: mark.id,
        student_id: pupil.student_id,
        exam_id: exam.id,
        exam_name: exam.name ?? code,
        subject_name: subject.name,
        marks: mark.marks_obtained,
        max: sitting.maximum_marks ?? 100,
        date: (exam.end_at ?? '').slice(0, 10),
        syllabus: chaptersInRange(subject, rule.from, rule.to),
      },
    ];
  });
}

const abilityCache = new Map<string, number>();

function ability(pupil: Pupil, subject: CatalogSubject): number {
  const key = `${pupil.student_id}|${subject.code}`;
  const cached = abilityCache.get(key);
  if (cached !== undefined) return cached;
  const marks = examRecords(pupil, subject);
  const value = marks.length > 0 ? marks.reduce((sum, row) => sum + row.marks / row.max, 0) / marks.length : DEFAULT_ABILITY;
  abilityCache.set(key, value);
  return value;
}

export function signalFor(pupil: Pupil, subject: CatalogSubject, topic: CatalogTopic, ...draw: (string | number)[]): number {
  const personal = PERSONAL_LEANS[pupil.index];
  const lean =
    (TOPIC_DIFFICULTY[topic.title] ?? 0) +
    (SECTION_LEANS[pupil.section_code]?.[topic.title] ?? 0) +
    (personal?.subjects[subject.code] ?? 0) +
    (personal?.topics[topic.title] ?? 0) +
    (personal?.byDraw?.[String(draw[0])]?.[topic.title] ?? 0);
  return clamp01(ability(pupil, subject) + PRACTICE_UPLIFT + lean + (chance(pupil.student_id, topic.id, ...draw) - 0.5) * NOISE);
}

const paperById = (paperId: string): Paper | undefined =>
  CHECKER_PAPERS.find((row) => row.paper_id === paperId) ?? SETTER_PAPERS.find((row) => row.paper_id === paperId);

const pathOf = (paperId: string, n: number): string =>
  MARKING_SCHEMES.find((row) => row.paper_id === paperId)?.questions.find((row) => row.n === n)?.reference?.section_path ?? '';

function answerSheet(pupil: Pupil, subject: CatalogSubject): GapEvidence[] {
  const spec = EVIDENCE_PAPERS.mathsSheet;
  const paper = paperById(spec.paperId);
  if (!paper || spec.subject !== subject.code || chance('absent', spec.paperId, pupil.student_id) < SHARE.absent) return [];
  const questions = setQuestions(paper).map((question) => {
    const section_path = pathOf(paper.paper_id, question.n);
    const topic = resolvePath(subject, section_path);
    const level = topic ? signalFor(pupil, subject, topic, 'sheet', question.n) : ability(pupil, subject);
    return { n: question.n, max: question.marks, awarded: Math.min(question.marks, quantise(question.marks * level)), section_path };
  });
  return fromAnswerSheet({ sheet_id: seedId('gap-sheet', paper.paper_id, pupil.student_id), student_id: pupil.student_id, paper_id: paper.paper_id, paper_title: paper.title ?? 'Answer sheet', date: spec.date, questions }, subject);
}

const chapterTopics = (subject: CatalogSubject, title: string): readonly CatalogTopic[] => subject.chapters.find((chapter) => chapter.title === title)?.topics ?? [];

function sat(pupil: Pupil, sitting: PracticeSitting): boolean {
  if (DEMO.has(pupil.index)) return true;
  return chance(sitting.draw, pupil.student_id) < sitting.share;
}

function practice(pupil: Pupil, subject: CatalogSubject): GapEvidence[] {
  return PRACTICE_SITTINGS.filter((sitting) => sitting.subject === subject.code && sat(pupil, sitting)).flatMap((sitting) => {
    const topics = chapterTopics(subject, sitting.chapter).map((topic) => ({
      section_path: `${sitting.chapter} > ${topic.title}`,
      max: sitting.marksPerTopic,
      awarded: Math.round(sitting.marksPerTopic * signalFor(pupil, subject, topic, sitting.draw)),
    }));
    const attemptId = sitting.attempt === 1 ? seedId('gap-practice', sitting.paperId, pupil.student_id) : seedId('gap-practice', sitting.paperId, pupil.student_id, sitting.attempt);
    return fromPractice({ attempt_id: attemptId, student_id: pupil.student_id, paper_id: sitting.paperId, paper_title: sitting.title, date: sitting.date, topics }, subject);
  });
}

function drilledState(level: number, roll: number): MasteryState {
  if (roll < level - 0.2) return 'known';
  return roll < level + 0.1 ? 'shaky' : 'missed';
}

function masteryRecord(pupil: Pupil, subject: CatalogSubject, topics: readonly MindmapTopic[], date: string, states: MasteryMap, recordId: string): MasteryRecord {
  const first = topics[0];
  return {
    record_id: recordId,
    student_id: pupil.student_id,
    item_id: first?.item_id ?? '',
    section_id: first?.section_id ?? '',
    map_title: first?.section_title ?? 'Mind map',
    date,
    states,
    topic_of: new Map(topics.flatMap((topic) => topic.atoms.map((atom) => [atom.id, topic.id] as const))),
    label_of: new Map(topics.flatMap((topic) => topic.atoms.map((atom) => [atom.id, atom.label] as const))),
  };
}

function mastery(pupil: Pupil, subject: CatalogSubject): GapEvidence[] {
  const bySection = new Map<string, MindmapTopic[]>();
  for (const topic of mindmapTopics()) bySection.set(topic.section_id, [...(bySection.get(topic.section_id) ?? []), topic]);
  return [...bySection.entries()].flatMap(([sectionId, topics]) => {
    const control = topics[0]?.chapter_title === CONTROL;
    const share = control ? SHARE.control : SHARE.mastery;
    if (!DEMO.has(pupil.index) && chance('mastery', sectionId, pupil.student_id) >= share) return [];
    const states: MasteryMap = {};
    for (const topic of topics) {
      const catalogTopic = chapterTopics(subject, topic.chapter_title).find((row) => row.id === topic.id);
      if (!catalogTopic) continue;
      for (const atom of topic.atoms) {
        const readOnly = chance('read-only', pupil.student_id, atom.id) < 0.2;
        states[atom.id] = readOnly ? 'read' : drilledState(signalFor(pupil, subject, catalogTopic, MINDMAP_DRAW), chance('atom', pupil.student_id, atom.id));
      }
    }
    const date = within(control ? CONTROL_WINDOW : MASTERY_WINDOW, 'mastery-day', sectionId, pupil.student_id);
    return fromMastery(masteryRecord(pupil, subject, topics, date, states, seedId('gap-mastery', sectionId, pupil.student_id)), subject);
  });
}

export function liveMastery(pupil: Pupil, subject: CatalogSubject, today: string): GapEvidence[] {
  const bySection = new Map<string, MindmapTopic[]>();
  for (const topic of mindmapTopics()) bySection.set(topic.section_id, [...(bySection.get(topic.section_id) ?? []), topic]);
  return [...bySection.entries()].flatMap(([sectionId, topics]) => {
    const states = readMastery(topics[0]?.item_id ?? '', sectionId).states;
    if (Object.keys(states).length === 0) return [];
    return fromMastery(masteryRecord(pupil, subject, topics, today, states, `live-${sectionId}`), subject);
  });
}

function flashcards(pupil: Pupil, subject: CatalogSubject): GapEvidence[] {
  const topics = chapterTopics(subject, LIFE_PROCESSES);
  if (topics.length === 0) return [];
  const demo = DEMO.has(pupil.index);
  if (!demo && chance('flashcards', pupil.student_id) >= SHARE.flashcards) return [];
  const picked = demo
    ? topics.filter((topic) => topic.title === 'Respiration' || topic.title === 'Transportation')
    : [topics[Math.floor(chance('deck-topic', pupil.student_id) * topics.length)]].filter((topic): topic is CatalogTopic => Boolean(topic));
  return picked.flatMap((topic) => {
    const cards = 3 + Math.floor(chance('deck-size', pupil.student_id, topic.id) * 2);
    const level = signalFor(pupil, subject, topic, 'flashcards');
    const correct = Array.from({ length: cards }, (_, card) => chance('card', pupil.student_id, topic.id, card) < level).filter(Boolean).length;
    return fromFlashcards(
      {
        deck_id: seedId('gap-deck', pupil.student_id, topic.id),
        student_id: pupil.student_id,
        date: within(FLASHCARD_WINDOW, 'deck-day', pupil.student_id, topic.id),
        title: `${LIFE_PROCESSES} · ${topic.title}`,
        chapter_title: LIFE_PROCESSES,
        standings: [{ label: topic.title, cards, correct }],
      },
      subject,
    );
  });
}

function debate(pupil: Pupil, subject: CatalogSubject): GapEvidence[] {
  const topics = chapterTopics(subject, LIFE_PROCESSES);
  const motion = debateMotionById(DEBATE_SESSION_MOTION);
  if (!motion || (!DEMO.has(pupil.index) && chance('debate', pupil.student_id) >= SHARE.debate)) return [];
  const fact_checks = DEBATE_CLAIMS.flatMap((pair) => {
    const topic = topics.find((row) => row.title === pair.topic);
    if (!topic) return [];
    const held = chance('claim', pupil.student_id, pair.topic) < signalFor(pupil, subject, topic, 'debate');
    return [{ claim: held ? pair.right : pair.wrong, assessment: held ? ('correct' as const) : pair.wrongAs, topic: pair.topic }];
  });
  return fromDebate({ session_id: seedId('gap-debate', pupil.student_id), student_id: pupil.student_id, date: DEBATE_DATE, motion: motion.text, chapter_title: LIFE_PROCESSES, fact_checks }, subject);
}

interface SeededRecords {
  sheets: AnswerSheetRecord[];
  omr: OmrRecord[];
  sittings: Set<string>;
}

const memberKey = (roll: string | null, name: string | null): string => `${roll ?? ''}|${name ?? ''}`;
const studentsOf = (klass: string): ReadonlyMap<string, string> => new Map(classRoster(klass).map((member) => [memberKey(member.roll, member.name), member.studentId]));

let seededCache: Map<string, SeededRecords> | null = null;

function collectSeeded(): Map<string, SeededRecords> {
  const out = new Map<string, SeededRecords>();
  const entry = (studentId: string, subject: string): SeededRecords => {
    const key = `${studentId}|${subject}`;
    const existing = out.get(key);
    if (existing) return existing;
    const created: SeededRecords = { sheets: [], omr: [], sittings: new Set() };
    out.set(key, created);
    return created;
  };

  seedCheckerFixtures();
  for (const spec of SEEDED_CHECKER_PAPERS) {
    const exam = listExams().find((row) => row.id === spec.examId);
    const paper = exam ? paperById(linkedPaperId(exam.name) ?? '') : undefined;
    if (!exam || !paper) continue;
    const students = studentsOf(exam.klass);
    for (const ref of listBooklets(exam.id)) {
      const studentId = students.get(memberKey(ref.student.roll_number, ref.student.name));
      const result = studentId ? getBooklet(exam.id, ref.id).result : null;
      if (!studentId || !result) continue;
      const questions = result.results
        .filter((row) => row.counted)
        .map((row) => {
          const n = Number(row.question_number);
          return { n, max: row.max_marks, awarded: row.marks, section_path: pathOf(paper.paper_id, n) };
        });
      const record = entry(studentId, spec.subject);
      record.sheets.push({ sheet_id: seedId('gap-checker', paper.paper_id, studentId), student_id: studentId, paper_id: paper.paper_id, paper_title: paper.title ?? exam.name, date: spec.date, questions });
      if (spec.sameSittingAs) record.sittings.add(spec.sameSittingAs);
    }
  }

  const omr = demoOmrSeed();
  const omrPaper = omr ? paperById(omr.paperId) : undefined;
  if (!omr || !omrPaper) return out;
  const students = studentsOf(SEEDED_OMR.klass);
  for (const sheet of omr.sheets) {
    const studentId = students.get(memberKey(sheet.roll_number, sheet.name));
    if (!studentId) continue;
    const result = scoreSheet(omrPaper.paper_id, omr.key, sheet.responses);
    entry(studentId, SEEDED_OMR.subject).omr.push({
      sheet_id: seedId('gap-omr-seed', omrPaper.paper_id, studentId),
      student_id: studentId,
      paper_id: omrPaper.paper_id,
      paper_title: omrPaper.title ?? 'OMR sheet',
      date: SEEDED_OMR.date,
      questions: result.questions.map((row) => ({ n: row.n, outcome: row.outcome, section_path: pathOf(omrPaper.paper_id, row.n) })),
    });
  }
  return out;
}

function seededRecords(pupil: Pupil, subject: CatalogSubject): SeededRecords | undefined {
  seededCache ??= collectSeeded();
  return seededCache.get(`${pupil.student_id}|${subject.code}`);
}

const sittingExamIds = (codes: ReadonlySet<string>): ReadonlySet<string> =>
  new Set(EXAMS.filter((row) => row.academic_session_id === CURRENT_SESSION.id && codes.has(row.code ?? '')).map((row) => row.id));

const evidenceCache = new Map<string, GapEvidence[]>();

export function recordedEvidence(pupil: Pupil, subject: CatalogSubject): GapEvidence[] {
  if (!hasEvidence(pupil, subject.code)) return [];
  const key = `${pupil.student_id}|${subject.code}`;
  const cached = evidenceCache.get(key);
  if (cached) return cached;
  const science = subject.code === 'SCI';
  const seeded = seededRecords(pupil, subject);
  const replaced = sittingExamIds(seeded?.sittings ?? new Set());
  const evidence = [
    ...examRecords(pupil, subject)
      .filter((record) => !replaced.has(record.exam_id))
      .flatMap(fromExamMark),
    ...answerSheet(pupil, subject),
    ...(seeded ? [...seeded.sheets.flatMap((record) => fromAnswerSheet(record, subject)), ...seeded.omr.flatMap((record) => fromOmr(record, subject))] : []),
    ...practice(pupil, subject),
    ...(science ? [...mastery(pupil, subject), ...flashcards(pupil, subject), ...debate(pupil, subject)] : []),
  ];
  evidenceCache.set(key, evidence);
  return evidence;
}
