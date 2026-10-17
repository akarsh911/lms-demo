'use client';

import * as React from 'react';

import { useExamSubjects, useReachableExams } from '@/hooks/query/use-exams';
import { usePaperRoster, type PaperRoster } from '@/hooks/query/use-paper-roster';
import { useAllOfferings } from '@/hooks/query/use-school';
import { sectionLetter } from '@/lib/answer-checker/paper';
import type { RosterStudent } from '@/lib/answer-checker/roster-match';
import { nameOf, personOf } from '@/lib/core/roster';
import type { ExamRow, ExamSubjectRow } from '@/types/exams';
import type { Paper } from '@/types/papersetter';
import type { SchoolOfferingRow } from '@/types/school';

export interface CheckingTarget {
  exams: ReturnType<typeof useReachableExams>;
  subjects: ReturnType<typeof useExamSubjects>;
  offerings: ReturnType<typeof useAllOfferings>;
  examOptions: ExamRow[];
  assessmentId: string | null;
  targetId: string | null;
  target: ExamSubjectRow | undefined;
  offering: SchoolOfferingRow | undefined;
  sectionId: string | null;
  sittingSections: string[] | undefined;
  sectionCode: string | null;
  roster: PaperRoster;
  students: RosterStudent[];
}

const EXAM_TYPE_OF_KIND: Readonly<Record<string, string>> = { class_exam: 'term', annual: 'term', half_yearly: 'term', class_test: 'unit_test', quiz: 'practice' };

const byNewest = (left: ExamRow, right: ExamRow): number => (right.start_at ?? '').localeCompare(left.start_at ?? '');

function suggestedAssessment(paper: Paper | undefined, exams: readonly ExamRow[]): string | null {
  if (!paper) return null;
  const title = paper.title?.trim().toLowerCase() ?? '';
  const nameOf = (row: ExamRow): string => (row.name ?? '').trim().toLowerCase();
  const named = exams.find((row) => title !== '' && nameOf(row) === title) ?? exams.find((row) => title !== '' && nameOf(row) !== '' && title.includes(nameOf(row)));
  const examType = EXAM_TYPE_OF_KIND[paper.kind ?? ''] ?? paper.kind;
  const kinded = exams.find((row) => row.exam_type === examType && row.status === 'published') ?? exams.find((row) => row.exam_type === examType);
  return (named ?? kinded)?.id ?? null;
}

const sectionIdOf = (offering: SchoolOfferingRow | undefined): string | null => offering?.section_id ?? offering?.edges?.section?.id ?? null;

function subjectFits(paper: Paper, offering: SchoolOfferingRow | undefined): offering is SchoolOfferingRow {
  const subject = offering?.edges?.subject?.name?.toLowerCase();
  return Boolean(paper.subject) && subject === paper.subject?.toLowerCase();
}

function offeringFits(paper: Paper, offering: SchoolOfferingRow | undefined): boolean {
  if (!subjectFits(paper, offering)) return false;
  const section = offering.edges?.section;
  if (paper.section_id && (offering.section_id === paper.section_id || section?.id === paper.section_id)) return true;
  const letter = sectionLetter(paper);
  const sameLetter = !letter || section?.name === letter;
  const sameClass = !paper.class_id || (section?.code ?? '').includes(paper.class_id);
  return sameLetter && sameClass;
}

export function rosterStudents(rows: PaperRoster['rows']): RosterStudent[] {
  return rows.map(({ studentId, entry }) => {
    const person = entry.student ? personOf('students', entry.student) : null;
    const name = person?.status === 'present' ? (nameOf(person.person) ?? '') : '';
    return { studentId, name, roll: entry.enrollment?.roll_number ?? null };
  });
}

export function useCheckingTarget(
  paper: Paper | undefined,
  chosenAssessment: string | null,
  scopedSection: string | null,
  legacyTarget: string | null,
  startedFor: string | null,
): CheckingTarget {
  const exams = useReachableExams();
  const examOptions = React.useMemo(() => [...(exams.data ?? [])].sort(byNewest), [exams.data]);
  const assessmentId = chosenAssessment ?? suggestedAssessment(paper, examOptions);

  const subjects = useExamSubjects(assessmentId);
  const offerings = useAllOfferings(Boolean(assessmentId));
  const offeringById = React.useMemo(() => new Map((offerings.data ?? []).map((row) => [row.id, row])), [offerings.data]);

  const rows = subjects.data ?? [];
  const offeringOf = (row: ExamSubjectRow): SchoolOfferingRow | undefined => offeringById.get(row.subject_offering_id ?? '');
  const started = startedFor && paper ? rows.find((row) => subjectFits(paper, offeringOf(row)) && offeringOf(row)?.edges?.section?.code === startedFor) : undefined;
  const scoped = !startedFor && scopedSection && paper ? rows.find((row) => subjectFits(paper, offeringOf(row)) && sectionIdOf(offeringOf(row)) === scopedSection) : undefined;
  const legacy = scopedSection || startedFor ? undefined : rows.find((row) => row.id === legacyTarget);
  const suggested = scopedSection || startedFor || !paper ? undefined : rows.find((row) => offeringFits(paper, offeringOf(row)));
  const target = started ?? scoped ?? legacy ?? suggested;
  const sittingSections = React.useMemo(
    () =>
      paper && subjects.data && offerings.data
        ? subjects.data.flatMap((row) => {
            const offering = offeringById.get(row.subject_offering_id ?? '');
            const id = subjectFits(paper, offering) ? sectionIdOf(offering) : null;
            return id ? [id] : [];
          })
        : undefined,
    [paper, subjects.data, offerings.data, offeringById],
  );
  const targetId = target?.id ?? null;
  const offering = target ? offeringOf(target) : undefined;
  const section = offering?.edges?.section;

  const roster = usePaperRoster(offering?.id ?? null, offering?.section_id ?? section?.id ?? null);
  const students = React.useMemo(() => rosterStudents(roster.rows), [roster.rows]);

  return {
    exams,
    subjects,
    offerings,
    examOptions,
    assessmentId,
    targetId,
    target,
    offering,
    sectionId: sectionIdOf(offering) ?? scopedSection,
    sittingSections,
    sectionCode: section?.code ?? null,
    roster,
    students,
  };
}
