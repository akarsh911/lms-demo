import { config } from '@/config';
import { isSampleSource, sampleSheets, sampleSources } from '@/fixtures/online-test';
import type { OnlineSource, TypedSheet } from '@/types/answer-checker';
import type { GraspCheckSummary } from '@/types/grasp';
import type { Paper } from '@/types/papersetter';
import { setQuestions } from '@/lib/answer-checker/paper';

import { dev } from './dev-bypass';
import { graspService } from './grasp';

const GRASP_PREFIX = 'grasp:';

function sectionLabel(paper: Paper, sectionCode: string | null): string {
  const klass = paper.class_id ?? '';
  const fromCode = sectionCode?.replace(/^G?\d+/, '') ?? '';
  const fromPaper = paper.section_id && !paper.section_id.includes('-') ? paper.section_id.replace(klass, '') : '';
  return `Class ${klass} ${fromCode || fromPaper}`.trim();
}

const fits = (paper: Paper, sectionCode: string | null, check: GraspCheckSummary): boolean =>
  check.subject.toLowerCase() === (paper.subject ?? '').toLowerCase() && check.section.toLowerCase() === sectionLabel(paper, sectionCode).toLowerCase() && check.finished > 0;

const MATCHING_SHARE = 0.6;

const normalised = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function asksThisPaper(paper: Paper, check: GraspCheckSummary): Promise<boolean> {
  const asked = new Set(setQuestions(paper).map((question) => normalised(question.text)));
  if (asked.size === 0) return false;
  const detail = await graspService.detail(check.id).catch(() => null);
  if (!detail) return false;
  const shared = detail.questions.filter((question) => asked.has(normalised(question.text))).length;
  return shared / asked.size >= MATCHING_SHARE;
}

export const onlineTestService = {
  sources: async (paper: Paper, sectionCode: string | null): Promise<OnlineSource[]> => {
    const checks = await graspService.list().catch(() => [] as GraspCheckSummary[]);
    const candidates = checks.filter((check) => fits(paper, sectionCode, check));
    const matching = await Promise.all(candidates.map(async (check) => ((await asksThisPaper(paper, check)) ? [check] : [])));
    const grasp = matching.flat().map<OnlineSource>((check) => ({ id: `${GRASP_PREFIX}${check.id}`, label: `GRASP · ${check.title}`, detail: `Code ${check.code} · ${check.section}`, responses: check.finished }));
    return config.devBypass ? [...sampleSources(paper, sectionCode), ...grasp] : grasp;
  },

  sheets: async (paper: Paper, sourceId: string): Promise<TypedSheet[]> => {
    if (isSampleSource(sourceId)) return dev(() => sampleSheets(paper));
    const check = await graspService.detail(sourceId.slice(GRASP_PREFIX.length));
    const numberOf = new Map(check.questions.map((question) => [question.id, question.number]));
    return check.attempts
      .filter((attempt) => attempt.answers.some((answer) => answer.text.trim() !== ''))
      .map((attempt) => ({
        name: attempt.name,
        roll: attempt.roll,
        answers: attempt.answers.flatMap((answer) => {
          const n = numberOf.get(answer.questionId);
          return n === undefined ? [] : [{ n, text: answer.text }];
        }),
      }));
  },
};
