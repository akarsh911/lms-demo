import type { ReportCard, ReportGrade, ReportSubjectLine, ReportSubjectStatus } from '@/types/report-card';
import type { ResultComponent } from '@/types/result-scheme';
import type {
  ComputedResult,
  ResultComponentGap,
  ResultComponentOutcome,
  ResultComposition,
  ResultSourceGap,
  ResultSourceOutcome,
} from '@/types/results';
import type { SchoolOfferingRow } from '@/types/school';
import { byId } from './rows';
import { ASSIGNMENTS, SUBJECT_ENROLLMENTS, SUBMISSIONS } from './data/classroom';
import { ENROLLMENTS } from './data/enrollment';
import { COMPONENT_ASSIGNMENTS, COMPONENT_EXAMS, EXAMS, EXAM_MARKS, EXAM_SUBJECTS, RESULT_COMPONENTS, RESULT_SCHEMES } from './data/exams';
import { GRADING_SCHEMES, OFFERINGS, SUBJECTS } from './data/structure';


interface Lookups {
  marks: Map<string, (typeof EXAM_MARKS)[number]>;
  subjects: Map<string, (typeof EXAM_SUBJECTS)[number]>;
  submissions: Map<string, (typeof SUBMISSIONS)[number]>;
}

function lookups(): Lookups {
  return {
    marks: new Map(EXAM_MARKS.map((m) => [`${m.exam_subject_id}|${m.student_id}`, m])),
    subjects: new Map(EXAM_SUBJECTS.map((s) => [`${s.exam_id}|${s.subject_offering_id}`, s])),
    submissions: new Map(SUBMISSIONS.map((s) => [`${s.assignment_id}|${s.student_id}`, s])),
  };
}

function aggregate(component: ResultComponent, sources: ResultSourceOutcome[]): number {
  const counted = sources.filter((s) => s.outcome === 'counted');
  if (counted.length === 0) return 0;

  if (component.aggregation === 'best_of') {
    const keep = Math.max(component.take_best ?? 1, 1);
    const ranked = [...counted].sort((a, b) => (b.fraction ?? 0) - (a.fraction ?? 0));
    for (const source of ranked.slice(keep)) source.outcome = 'not_among_best';
    const best = ranked.slice(0, keep);
    return best.reduce((n, s) => n + (s.fraction ?? 0), 0) / best.length;
  }
  if (component.aggregation === 'sum') {
    const max = counted.reduce((n, s) => n + s.maximum_marks, 0);
    return counted.reduce((n, s) => n + (s.obtained ?? 0), 0) / max;
  }
  if (component.aggregation === 'average') {
    return counted.reduce((n, s) => n + (s.fraction ?? 0), 0) / counted.length;
  }
  return counted[0]?.fraction ?? 0;
}

export interface Computed {
  result: ComputedResult | null;
  composition: ResultComposition;
}

export function computeResult(offering: SchoolOfferingRow, studentId: string, l: Lookups = lookups()): Computed {
  const scheme = byId(RESULT_SCHEMES, offering.result_scheme_id ?? '');
  const empty: ResultComposition = { sources_not_set: null, components_not_scored: null };
  if (!scheme) return { result: null, composition: empty };

  const gaps: ResultSourceGap[] = [];
  const components = RESULT_COMPONENTS
    .filter((c) => c.result_scheme_id === scheme.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const outcomes: ResultComponentOutcome[] = components.map((component) => {
    const sources: ResultSourceOutcome[] = [];

    for (const link of COMPONENT_EXAMS.filter((x) => x.result_component_id === component.id)) {
      const exam = byId(EXAMS, link.exam_id ?? '');
      const subject = exam && l.subjects.get(`${exam.id}|${offering.id}`);
      if (!exam || !subject) {
        gaps.push({ result_component_id: component.id, component: component.name ?? '', ref: { kind: 'exam', id: link.exam_id ?? '' }, label: exam?.name, reason: 'the exam has no subject for this offering' });
        continue;
      }
      const mark = l.marks.get(`${subject.id}|${studentId}`);
      const max = subject.maximum_marks ?? 0;
      const counted = mark?.status === 'marked' && mark.marks_obtained !== undefined;
      sources.push({
        ref: { kind: 'exam', id: exam.id },
        label: exam.name,
        maximum_marks: max,
        obtained: counted ? mark.marks_obtained : undefined,
        fraction: counted && max > 0 ? (mark.marks_obtained ?? 0) / max : undefined,
        outcome: !mark ? 'not_entered' : mark.status === 'marked' ? 'counted' : (mark.status ?? 'not_entered'),
        provisional: mark?.provisional ?? false,
      });
    }

    for (const link of COMPONENT_ASSIGNMENTS.filter((x) => x.result_component_id === component.id)) {
      const assignment = byId(ASSIGNMENTS, link.assignment_id ?? '');
      if (!assignment || assignment.subject_offering_id !== offering.id) continue;
      const submission = l.submissions.get(`${assignment.id}|${studentId}`);
      const max = assignment.maximum_marks ?? 0;
      const counted = submission?.status === 'graded' && submission.marks_obtained !== undefined;
      sources.push({
        ref: { kind: 'assignment', id: assignment.id },
        label: assignment.title,
        maximum_marks: max,
        obtained: counted ? submission.marks_obtained : undefined,
        fraction: counted && max > 0 ? (submission.marks_obtained ?? 0) / max : undefined,
        outcome: counted ? 'counted' : 'not_entered',
        provisional: false,
      });
    }

    const fraction = aggregate(component, sources);
    const countedSources = sources.filter((s) => s.outcome === 'counted').length;
    return {
      id: component.id,
      name: component.name ?? '',
      position: component.position ?? 0,
      aggregation: component.aggregation ?? 'single',
      take_best: component.take_best,
      maximum_marks: component.maximum_marks ?? 0,
      weight: component.weight ?? 0,
      fraction,
      obtained_marks: fraction * (component.maximum_marks ?? 0),
      contribution: fraction * (component.weight ?? 0),
      linked_sources: sources.length,
      counted_sources: countedSources,
      excused: sources.length > 0 && sources.every((s) => s.outcome === 'exempt'),
      provisional: sources.some((s) => s.outcome === 'counted' && s.provisional),
      sources,
    };
  });

  const scored = outcomes.filter((c) => c.counted_sources > 0);
  const notScored: ResultComponentGap[] = outcomes
    .filter((c) => c.counted_sources === 0 && !c.excused)
    .map((c) => ({ id: c.id, name: c.name, weight: c.weight, reason: 'no counted marks yet' }));
  const complete = notScored.length === 0 && gaps.length === 0;
  const componentTotal = outcomes.reduce((n, c) => n + c.weight, 0);

  return {
    result: {
      result_scheme_id: scheme.id,
      total_marks: scheme.total_marks ?? componentTotal,
      component_total: componentTotal,
      assessed_total: scored.reduce((n, c) => n + c.weight, 0),
      score: scored.reduce((n, c) => n + c.contribution, 0),
      complete,
      provisional: !complete || outcomes.some((c) => c.provisional),
      components: outcomes,
    },
    composition: { sources_not_set: gaps.length > 0 ? gaps : null, components_not_scored: notScored.length > 0 ? notScored : null },
  };
}

export const resultLookups = lookups;

function gradeFor(offering: SchoolOfferingRow, result: ComputedResult): ReportGrade | null {
  const gs = byId(GRADING_SCHEMES, offering.grading_scheme_id ?? '');
  const basis = result.complete ? result.total_marks : result.assessed_total;
  if (!gs || basis <= 0) return null;
  const percentage = Math.round((result.score / basis) * 1000) / 10;
  const band = (gs.scale_json ?? []).find((b) => percentage >= b.min_percent && percentage <= b.max_percent);
  if (!band) return null;
  return {
    grading_scheme_id: gs.id,
    grading_scheme: gs.name ?? '',
    kind: gs.kind ?? 'grade',
    percentage,
    label: band.label,
    points: band.points,
    min_percent: band.min_percent,
    max_percent: band.max_percent,
    description: band.description,
    provisional: !result.complete || result.provisional,
  };
}

function statusOf(computed: Computed): ReportSubjectStatus {
  const { result, composition } = computed;
  if (!result) return 'not_composed';
  if (result.components.length > 0 && result.components.every((c) => c.excused)) return 'exempt';
  if (result.complete) return result.provisional ? 'provisional' : 'final';
  if (result.assessed_total === 0) return 'awaiting_marks';
  return composition.sources_not_set ? 'partly_composed' : 'in_progress';
}

export function reportCard(studentId: string, sessionId: string): ReportCard | null {
  const enrollment = ENROLLMENTS.find((e) => e.student_id === studentId && e.academic_session_id === sessionId);
  if (!enrollment) return null;

  const l = lookups();
  const taking = new Set(SUBJECT_ENROLLMENTS.filter((s) => s.student_id === studentId).map((s) => s.subject_offering_id));
  const subjects: ReportSubjectLine[] = OFFERINGS
    .filter((o) => taking.has(o.id))
    .map((offering) => {
      const computed = computeResult(offering, studentId, l);
      const status = statusOf(computed);
      const subject = byId(SUBJECTS, offering.subject_id ?? '');
      return {
        subject_offering_id: offering.id,
        subject_id: offering.subject_id ?? '',
        subject: subject?.name ?? '',
        subject_code: subject?.code ?? '',
        status,
        reason: status === 'not_composed' ? 'no result scheme is set for this offering' : undefined,
        final: status === 'final',
        result_scheme_id: offering.result_scheme_id ?? null,
        result_scheme: byId(RESULT_SCHEMES, offering.result_scheme_id ?? '')?.name,
        result: computed.result,
        composition: computed.composition,
        grade: computed.result ? gradeFor(offering, computed.result) : null,
      };
    });

  const byStatus: Record<string, number> = {};
  for (const s of subjects) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  const final = subjects.length > 0 && subjects.every((s) => s.final);

  return {
    student_id: studentId,
    academic_session_id: sessionId,
    subjects,
    count: subjects.length,
    covers_every_subject: true,
    final,
    provisional: !final,
    subjects_by_status: byStatus,
    aggregate: null,
    aggregate_reason: 'no aggregate rule is defined for this school',
  };
}
