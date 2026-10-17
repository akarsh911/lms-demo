'use client';

import * as React from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { linkedPaperId, setQuestions } from '@/lib/answer-checker/paper';
import type { RosterStudent } from '@/lib/answer-checker/roster-match';
import {
  bookletOfLearner,
  chapterForLabels,
  chapterLevel,
  chapterName,
  drilledStates,
  rosterMatch,
  standingsOf,
  subjectNamed,
  subjectWithTopic,
  topicsOfMap,
  type RecordWrite,
} from '@/lib/gap-analyzer/records';
import { logger } from '@/lib/logger';
import { answerCheckerService, checkingPaperService } from '@/services/answer-checker';
import { gapAnalyzerService } from '@/services/gap-analyzer';
import { mindmapService } from '@/services/mindmap';
import type { AcademicPage, EnrollmentRow } from '@/types/academic';
import type { OmrSheetResult } from '@/types/answer-checker';
import type { ExamMarkBatch } from '@/types/exam-marks';
import type { DeckReport, FlashcardDeck } from '@/types/flashcards';
import type { LearnerAnalysis } from '@/types/gap-analyzer';
import type { DrillGrade } from '@/types/mindmap';
import type { Paper } from '@/types/papersetter';
import type { RosterPage, StudentRow } from '@/types/roster';

const LEARNER_STALE_MS = 60_000;

export interface GapEvidenceReporter {
  drill: (itemId: string, sectionId: string, grade: DrillGrade) => void;
  flashcards: (deckId: string, report: DeckReport) => void;
  omr: (paper: Paper, sheets: readonly OmrSheetResult[]) => void;
  marks: (batch: ExamMarkBatch, source?: CheckerSource) => void;
}

export interface CheckerSource {
  examId: string;
  sectionCode: string | null;
}

const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function cachedRoster(client: QueryClient): RosterStudent[] {
  const people = new Map(
    client
      .getQueriesData<RosterPage<StudentRow>>({ queryKey: [...queryKeys.academic.all, 'class-students'] })
      .flatMap(([, page]) => page?.rows ?? [])
      .map((row) => [row.id, row.edges?.person?.display_name ?? ''] as const),
  );
  return client
    .getQueriesData<AcademicPage<EnrollmentRow>>({ queryKey: [...queryKeys.academic.all, 'class-enrollments'] })
    .flatMap(([, page]) => page?.rows ?? [])
    .flatMap((row) => (row.student_id ? [{ studentId: row.student_id, roll: row.roll_number ?? null, name: people.get(row.student_id) ?? '' }] : []));
}

export function useGapEvidence(): GapEvidenceReporter {
  const client = useQueryClient();

  return React.useMemo<GapEvidenceReporter>(() => {
    const fire = (call: string, build: () => Promise<RecordWrite[]>): void => {
      if (!gapAnalyzerService.recordsEvidence()) return;
      void (async () => {
        try {
          const records = await build();
          if (records.length === 0) return;
          await gapAnalyzerService.postEvidence({ records });
          await client.invalidateQueries({ queryKey: queryKeys.gapAnalyzer.all });
        } catch (cause) {
          logger.warn(`gap analyzer: ${call} evidence was not recorded`, cause);
        }
      })();
    };

    const self = async () => (await client.fetchQuery({ queryKey: queryKeys.gapAnalyzer.scope(), queryFn: ({ signal }) => gapAnalyzerService.scope(signal) })).self;

    const learner = (studentId: string): Promise<LearnerAnalysis> =>
      client.fetchQuery({ queryKey: queryKeys.gapAnalyzer.learner(studentId), queryFn: ({ signal }) => gapAnalyzerService.learner(studentId, signal), staleTime: LEARNER_STALE_MS });

    const sectionPaths = async (paper: Paper): Promise<Map<number, string>> => {
      const questions = setQuestions(paper);
      const found = await Promise.all(
        questions.map(async (question) => {
          const passages = await client
            .fetchQuery({
              queryKey: queryKeys.answerChecker.references(paper.paper_id, question.n),
              queryFn: ({ signal }) => checkingPaperService.references(paper, question.n, question.text, signal),
              staleTime: Infinity,
            })
            .catch(() => []);
          return [question.n, passages[0]?.section_path ?? ''] as const;
        }),
      );
      return new Map(found);
    };

    const paperOf = (paperId: string): Promise<Paper> =>
      client.fetchQuery({ queryKey: queryKeys.answerChecker.paper(paperId), queryFn: ({ signal }) => checkingPaperService.getPaper(paperId, signal) });

    return {
      drill: (itemId, sectionId, grade) =>
        fire('drill', async () => {
          const me = await self();
          const states = drilledStates(grade.result);
          if (!me || Object.keys(states).length === 0) return [];
          const map = await client.fetchQuery({ queryKey: queryKeys.mindmap.map(itemId, sectionId), queryFn: ({ signal }) => mindmapService.map(itemId, sectionId, signal) });
          const { topic_of, label_of, title } = topicsOfMap(map);
          const subject = subjectWithTopic(await learner(me.student_id), Object.values(topic_of));
          if (!subject) return [];
          return [
            {
              grade: me.grade,
              subject_code: subject.subject_code,
              record: { type: 'mastery', date: today(), record_id: `drill-${crypto.randomUUID()}`, student_id: me.student_id, item_id: itemId, section_id: sectionId, map_title: title, states, topic_of, label_of },
            },
          ];
        }),

      flashcards: (deckId, report) =>
        fire('flashcards', async () => {
          const me = await self();
          const deck = client.getQueryData<FlashcardDeck>(queryKeys.flashcards.deck(deckId));
          const standings = standingsOf(report, deck ? { topic: deck.topic, chapter: deck.chapter, title: deck.title } : null);
          if (!me || standings.length === 0 || chapterLevel(standings, chapterName(deck?.title ?? report.title))) return [];
          const home = chapterForLabels(await learner(me.student_id), standings.map((row) => row.label), chapterName(deck?.title ?? report.title));
          if (!home) return [];
          return [
            {
              grade: me.grade,
              subject_code: home.subject.subject_code,
              record: { type: 'flashcards', date: today(), deck_id: deckId, student_id: me.student_id, title: report.title, chapter_title: home.chapterTitle, standings },
            },
          ];
        }),

      omr: (paper, sheets) =>
        fire('omr', async () => {
          const roster = cachedRoster(client);
          const paths = await sectionPaths(paper);
          const records: RecordWrite[] = [];
          for (const sheet of sheets) {
            const student = rosterMatch(roster, sheet.roll_number, sheet.name);
            if (!student) continue;
            const analysis = await learner(student.studentId);
            const subject = subjectNamed(analysis, paper.subject);
            if (!subject) continue;
            records.push({
              grade: analysis.learner.grade,
              subject_code: subject.subject_code,
              record: {
                type: 'omr',
                date: today(),
                sheet_id: `omr-${paper.paper_id}-${student.studentId}`,
                student_id: student.studentId,
                paper_id: paper.paper_id,
                paper_title: paper.title ?? 'OMR sheet',
                questions: sheet.result.questions.map((row) => ({ n: row.n, outcome: row.outcome, section_path: paths.get(row.n) ?? '' })),
              },
            });
          }
          return records;
        }),

      marks: (batch, source) =>
        fire('answer sheets', async () => {
          if (!source) return [];
          const exam = await client.fetchQuery({ queryKey: queryKeys.answerChecker.exam(source.examId), queryFn: ({ signal }) => answerCheckerService.getExam(source.examId, signal) });
          const paperId = linkedPaperId(exam.name);
          if (!paperId) return [];
          const roster = new Map(cachedRoster(client).map((row) => [row.studentId, row]));
          const records: RecordWrite[] = [];
          for (const entry of batch.marks.filter((row) => row.status === 'marked')) {
            const student = roster.get(entry.student_id);
            const bookletId = student ? bookletOfLearner(exam, source.sectionCode, student) : null;
            if (!bookletId) continue;
            const [paper, marked, analysis] = await Promise.all([paperOf(paperId), answerCheckerService.getBooklet(exam.id, bookletId), learner(entry.student_id)]);
            const subject = subjectNamed(analysis, paper.subject);
            const results = marked.result?.results.filter((row) => row.counted) ?? [];
            if (!subject || results.length === 0) continue;
            const paths = await sectionPaths(paper);
            records.push({
              grade: analysis.learner.grade,
              subject_code: subject.subject_code,
              record: {
                type: 'answer_sheet',
                date: today(),
                sheet_id: `sheet-${exam.id}-${bookletId}`,
                student_id: entry.student_id,
                paper_id: paperId,
                paper_title: paper.title ?? 'Answer sheet',
                questions: results.map((row) => ({ n: Number(row.question_number), awarded: row.marks, max: row.max_marks, section_path: paths.get(Number(row.question_number)) ?? '' })),
              },
            });
          }
          return records;
        }),
    };
  }, [client]);
}
