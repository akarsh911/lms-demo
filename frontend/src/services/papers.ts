import { config } from '@/config';
import { PAPER_RUNS } from '@/fixtures/data/papers';
import * as fixtures from '@/fixtures/papers';

import { coreApi } from './api';
import { dev, devGet, devList } from './dev-bypass';
import { MAX_PAGE, type ListQuery } from './school';
import type { PageInfo } from '@/types/roster';
import type { SchoolPage } from '@/types/school';
import type {
  GenerationRunRow,
  PaperCreate,
  PaperDetail,
  PaperPatch,
  PaperQuestionCreate,
  PaperQuestionRow,
  PaperSectionCreate,
  PaperSectionRow,
  PaperRow,
} from '@/types/papers';

interface ListEnvelope {
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

async function list<T>(
  path: string,
  key: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<SchoolPage<T>> {
  const body = await coreApi.get<ListEnvelope>(
    path,
    { limit: MAX_PAGE, offset: 0, ...query },
    signal,
  );
  const rows = body[key];
  return {
    rows: Array.isArray(rows) ? (rows as T[]) : [],
    count: typeof body.count === 'number' ? body.count : 0,
    page: body.page ?? { limit: MAX_PAGE, offset: 0, has_more: false },
  };
}

interface PaperDetailEnvelope {
  paper?: PaperRow;
  sections?: unknown;
}

function sectionBlocks(sections: unknown): PaperDetail['sections'] {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const block = entry as { section?: PaperSectionRow; questions?: unknown };
    if (!block.section?.id) return [];
    return [
      {
        section: block.section,
        questions: Array.isArray(block.questions) ? block.questions : [],
      },
    ];
  });
}

export const paperService = {
  listPapers: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass ? dev(() => fixtures.listPapers(query)) : list<PaperRow>('papers', 'papers', query, signal),

  getPaper: async (id: string, signal?: AbortSignal): Promise<PaperDetail> => {
    if (config.devBypass) return dev(() => fixtures.paperDetail(id));
    const body = await coreApi.get<PaperDetailEnvelope>(`papers/${id}`, undefined, signal);
    return {
      paper: body.paper ?? { id },
      sections: sectionBlocks(body.sections),
    };
  },

  createPaper: async (body: PaperCreate): Promise<PaperRow> =>
    config.devBypass
      ? dev(() => fixtures.createPaper(body))
      : (await coreApi.post<{ paper: PaperRow }>('papers', body)).paper,

  updatePaper: async (id: string, patch: PaperPatch): Promise<PaperRow> =>
    config.devBypass
      ? dev(() => fixtures.updatePaper(id, patch))
      : (await coreApi.patch<{ paper: PaperRow }>(`papers/${id}`, patch)).paper,

  deletePaper: (id: string) =>
    config.devBypass ? dev(() => fixtures.deletePaper(id)) : coreApi.delete<void>(`papers/${id}`),

  createSection: async (
    paperId: string,
    body: PaperSectionCreate,
  ): Promise<PaperSectionRow> =>
    config.devBypass
      ? dev(() => fixtures.createPaperSection(paperId, body))
      : (await coreApi.post<{ paper_section: PaperSectionRow }>(
          `papers/${paperId}/sections`,
          body,
        )).paper_section,

  deleteSection: (sectionId: string) =>
    config.devBypass
      ? dev(() => fixtures.deletePaperSection(sectionId))
      : coreApi.delete<void>(`paper-sections/${sectionId}`),

  createQuestion: async (
    sectionId: string,
    body: PaperQuestionCreate,
  ): Promise<PaperQuestionRow> =>
    config.devBypass
      ? dev(() => fixtures.createPaperQuestion(sectionId, body))
      : (await coreApi.post<{ paper_question: PaperQuestionRow }>(
          `paper-sections/${sectionId}/questions`,
          body,
        )).paper_question,

  deleteQuestion: (questionId: string) =>
    config.devBypass
      ? dev(() => fixtures.deletePaperQuestion(questionId))
      : coreApi.delete<void>(`paper-questions/${questionId}`),

  listGenerationRuns: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(PAPER_RUNS, query)
      : list<GenerationRunRow>('paper-generation-runs', 'paper_generation_runs', query, signal),

  getGenerationRun: async (
    id: string,
    signal?: AbortSignal,
  ): Promise<GenerationRunRow> =>
    config.devBypass
      ? devGet(PAPER_RUNS, id)
      : (await coreApi.get<{ paper_generation_run: GenerationRunRow }>(
          `paper-generation-runs/${id}`,
          undefined,
          signal,
        )).paper_generation_run,
};
