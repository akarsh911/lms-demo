import { MINDMAP_CAPABILITIES } from '@/constants/mindmap';
import { analyzeSubject, byTopic, type ChapterCoverageRecord } from '@/lib/gap-analyzer/analyze';
import type { CatalogChapter, CatalogSubject } from '@/lib/gap-analyzer/catalog';
import { classAnalysis, schoolAnalysis, type LearnerSubject } from '@/lib/gap-analyzer/cohort';
import type { Capability } from '@/types/core';
import type { ChapterCoverage } from '@/types/lesson-planner';
import type { ClassAnalysis, GapScope, LearnerAnalysis, LearnerRef, SchoolAnalysis, ScopeSection, SubjectAnalysis } from '@/types/gap-analyzer';

import { TERM_COVERAGE, type TermCoverage } from './data/gap-analyzer';
import { CURRENT_SECTIONS, gradeSequenceOf } from './data/structure';
import { capabilities, identity } from './identity';
import { catalogFor, gradesWithCurriculum, subjectCodesFor } from './gap-analyzer-catalog';
import { liveMastery, recordedEvidence } from './gap-analyzer-evidence';
import { hasEvidence, pupilById, pupilsOf, type Pupil } from './gap-analyzer-pupils';
import { isoOf, offerings } from './lesson-planner';
import { chapterCoverage } from './lesson-plans';
import { fail } from './rows';

type Reach = 'self' | 'guardian_ward' | 'teacher_assignment' | 'school';

const today = (): string => isoOf(new Date());

function reaches(): Set<Reach> {
  const held: readonly Capability[] = capabilities().capabilities.filter((row) => row.key.startsWith(MINDMAP_CAPABILITIES.masteryRead));
  const out = new Set<Reach>();
  for (const row of held) {
    if (row.action === 'read_all') out.add('school');
    else if (row.reach === 'self' || row.reach === 'guardian_ward' || row.reach === 'teacher_assignment') out.add(row.reach);
  }
  return out;
}

const sectionLabelOf = (pupil: Pupil): string => `Class ${pupil.grade} ${pupil.section.name ?? ''}`.trim();

const learnerRef = (pupil: Pupil): LearnerRef => ({
  student_id: pupil.student_id,
  name: pupil.name,
  section_id: pupil.section.id,
  section_label: sectionLabelOf(pupil),
  grade: pupil.grade,
  roll_number: pupil.roll,
});

function individuals(reach: ReadonlySet<Reach>): { self: Pupil | null; wards: Pupil[] } {
  const ids = identity().roles?.student_ids ?? [];
  const self = reach.has('self') && ids[0] ? pupilById(ids[0]) : null;
  const wards = reach.has('guardian_ward') ? ids.flatMap((id) => pupilById(id) ?? []) : [];
  return { self, wards };
}

function taughtSections(): ScopeSection[] {
  const rows = offerings();
  const sections = [...new Set(rows.filter((row) => row.mine).map((row) => row.section_id))];
  return sections.flatMap((sectionId) => {
    const own = rows.filter((row) => row.section_id === sectionId && row.curriculum_id);
    const first = own[0];
    if (!first) return [];
    const pupils = pupilsOf(sectionId);
    return [
      {
        section_id: sectionId,
        label: first.section_label,
        grade: first.grade,
        subjects: own.map((row) => ({ code: row.subject_code, name: row.subject_name, mine: row.mine, offering_id: row.offering_id })).sort((a, b) => Number(b.mine) - Number(a.mine)),
        learners_with_evidence: pupils.filter((pupil) => own.some((row) => hasEvidence(pupil, row.subject_code))).length,
      },
    ];
  });
}

export function scope(): GapScope {
  const reach = reaches();
  const { self, wards } = individuals(reach);
  return {
    as_of: today(),
    self: self ? learnerRef(self) : null,
    wards: wards.map(learnerRef),
    sections: reach.has('teacher_assignment') ? taughtSections().sort((a, b) => b.learners_with_evidence - a.learners_with_evidence) : [],
    school: reach.has('school') ? { grades: gradesWithCurriculum() } : null,
  };
}

function baseline(chapter: CatalogChapter, plan: TermCoverage | undefined): ChapterCoverageRecord {
  const partly = plan?.in_progress[chapter.sequence];
  if (plan?.taught.includes(chapter.sequence)) return { chapter_id: chapter.id, state: 'taught', taught_topic_ids: [] };
  if (partly) return { chapter_id: chapter.id, state: 'in_progress', taught_topic_ids: chapter.topics.filter((topic) => partly.includes(topic.title)).map((topic) => topic.id) };
  return { chapter_id: chapter.id, state: 'not_taught', taught_topic_ids: [] };
}

function withPlanner(chapter: CatalogChapter, base: ChapterCoverageRecord, planned: ChapterCoverage | undefined): ChapterCoverageRecord {
  if (!planned || base.state === 'taught') return base;
  if (planned.state === 'taught') return { chapter_id: chapter.id, state: 'taught', taught_topic_ids: [] };
  const topics = [...new Set([...base.taught_topic_ids, ...planned.taught_topic_ids])];
  return { chapter_id: chapter.id, state: 'in_progress', taught_topic_ids: topics.length > 0 ? topics : chapter.topics.slice(0, 1).map((topic) => topic.id) };
}

function coverageFor(pupil: Pupil, subject: CatalogSubject): ChapterCoverageRecord[] {
  if (pupil.grade !== subject.grade) return [];
  const plan = TERM_COVERAGE[subject.code];
  const offering = offerings().find((row) => row.section_id === pupil.section.id && row.subject_code === subject.code);
  const planned = new Map((offering ? chapterCoverage(offering.offering_id) : []).map((row) => [row.chapter_id, row]));
  if (!plan && planned.size === 0) return [];
  return subject.chapters.map((chapter) => withPlanner(chapter, baseline(chapter, plan), planned.get(chapter.id)));
}

function subjectFor(pupil: Pupil, subject: CatalogSubject, asOf: string, liveFor: string | null): SubjectAnalysis {
  const evidence = recordedEvidence(pupil, subject);
  const live = liveFor === pupil.student_id && hasEvidence(pupil, subject.code) ? liveMastery(pupil, subject, asOf) : [];
  return analyzeSubject(subject, byTopic([...evidence, ...live]), coverageFor(pupil, subject), asOf, { kind: 'learner' });
}

function visibleLearner(studentId: string): { pupil: Pupil; live: boolean } {
  const reach = reaches();
  const { self, wards } = individuals(reach);
  if (self?.student_id === studentId) return { pupil: self, live: true };
  const ward = wards.find((row) => row.student_id === studentId);
  if (ward) return { pupil: ward, live: false };
  const pupil = pupilById(studentId);
  const teaches = reach.has('teacher_assignment') && taughtSections().some((row) => row.section_id === pupil?.section.id);
  if (pupil && (reach.has('school') || teaches)) return { pupil, live: false };
  return fail(403, 'forbidden', 'this learner is outside what you may read');
}

export function learner(studentId: string): LearnerAnalysis {
  const { pupil, live } = visibleLearner(studentId);
  const asOf = today();
  const subjects = subjectCodesFor(pupil.grade).flatMap((code) => {
    const catalog = catalogFor(pupil.grade, code);
    return catalog ? [subjectFor(pupil, catalog, asOf, live ? pupil.student_id : null)] : [];
  });
  return { learner: learnerRef(pupil), as_of: asOf, subjects: subjects.sort((a, b) => b.counts.gap - a.counts.gap || b.counts.at_risk - a.counts.at_risk) };
}

function sectionScope(sectionId: string): ScopeSection {
  const reach = reaches();
  const taught = reach.has('teacher_assignment') ? taughtSections().find((row) => row.section_id === sectionId) : undefined;
  if (taught) return taught;
  const section = CURRENT_SECTIONS.find((row) => row.id === sectionId);
  if (!section || !reach.has('school')) return fail(403, 'forbidden', 'this class is outside what you may read');
  const grade = gradeSequenceOf(section);
  const rows = offerings().filter((row) => row.section_id === sectionId && row.curriculum_id);
  return {
    section_id: sectionId,
    label: rows[0]?.section_label ?? `Class ${grade} ${section.name ?? ''}`,
    grade,
    subjects: rows.map((row) => ({ code: row.subject_code, name: row.subject_name, mine: false, offering_id: row.offering_id })),
    learners_with_evidence: pupilsOf(sectionId).length,
  };
}

const cohortCache = new Map<string, LearnerSubject[]>();

function learnerSubjects(sectionId: string, catalog: CatalogSubject, asOf: string): LearnerSubject[] {
  const key = `${asOf}|${sectionId}|${catalog.code}`;
  const cached = cohortCache.get(key);
  if (cached) return cached;
  const rows = pupilsOf(sectionId).map((pupil) => ({ learner: learnerRef(pupil), analysis: subjectFor(pupil, catalog, asOf, null) }));
  cohortCache.set(key, rows);
  return rows;
}

export function classView(sectionId: string, subjectCode: string): ClassAnalysis {
  const section = sectionScope(sectionId);
  const subject = section.subjects.find((row) => row.code === subjectCode) ?? section.subjects[0];
  const catalog = subject ? catalogFor(section.grade, subject.code) : null;
  if (!subject || !catalog) return fail(404, 'not_found', 'this class has no subject with a curriculum');
  const asOf = today();
  return classAnalysis(section, subject, catalog, learnerSubjects(sectionId, catalog, asOf), asOf);
}

export function school(grade: number, subjectCode: string): SchoolAnalysis {
  if (!reaches().has('school')) return fail(403, 'forbidden', 'the whole school is outside what you may read');
  const codes = subjectCodesFor(grade);
  const code = codes.includes(subjectCode) ? subjectCode : (codes[0] ?? '');
  const catalog = catalogFor(grade, code);
  if (!catalog) return fail(404, 'not_found', `Class ${grade} has no curriculum`);
  const asOf = today();
  const sections = CURRENT_SECTIONS.filter((section) => gradeSequenceOf(section) === grade)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    .map((section) => ({ section_id: section.id, label: `Class ${grade} ${section.name ?? ''}`, rows: learnerSubjects(section.id, catalog, asOf) }));
  const subjects = codes.flatMap((row) => {
    const named = catalogFor(grade, row);
    return named ? [{ code: row, name: named.name }] : [];
  });
  return schoolAnalysis(grade, catalog, subjects, sections, asOf);
}
