import { config } from '@/config';
import * as fixtures from '@/fixtures/papers';

import { coreApi } from './api';
import { dev } from './dev-bypass';
import { MAX_PAGE, type ListQuery } from './school';
import type { PageInfo } from '@/types/roster';
import type { SchoolPage } from '@/types/school';
import type {
  BlueprintConstraintCreate,
  BlueprintConstraintRow,
  BlueprintCreate,
  BlueprintDetail,
  BlueprintPatch,
  BlueprintRow,
  BlueprintSectionCreate,
  BlueprintSectionRow,
} from '@/types/blueprints';

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

interface BlueprintDetailEnvelope {
  blueprint?: BlueprintRow;
  sections?: unknown;
}

function sectionBlocks(sections: unknown): BlueprintDetail['sections'] {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const block = entry as { section?: BlueprintSectionRow; constraints?: unknown };
    if (!block.section?.id) return [];
    return [
      {
        section: block.section,
        constraints: Array.isArray(block.constraints) ? block.constraints : [],
      },
    ];
  });
}

export const blueprintService = {
  listBlueprints: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => fixtures.listBlueprints(query))
      : list<BlueprintRow>('blueprints', 'blueprints', query, signal),

  getBlueprint: async (id: string, signal?: AbortSignal): Promise<BlueprintDetail> => {
    if (config.devBypass) return dev(() => fixtures.blueprintDetail(id));
    const body = await coreApi.get<BlueprintDetailEnvelope>(
      `blueprints/${id}`,
      undefined,
      signal,
    );
    return {
      blueprint: body.blueprint ?? { id },
      sections: sectionBlocks(body.sections),
    };
  },

  createBlueprint: async (body: BlueprintCreate): Promise<BlueprintRow> =>
    config.devBypass
      ? dev(() => fixtures.createBlueprint(body))
      : (await coreApi.post<{ blueprint: BlueprintRow }>('blueprints', body)).blueprint,

  updateBlueprint: async (id: string, patch: BlueprintPatch): Promise<BlueprintRow> =>
    config.devBypass
      ? dev(() => fixtures.updateBlueprint(id, patch))
      : (await coreApi.patch<{ blueprint: BlueprintRow }>(`blueprints/${id}`, patch)).blueprint,

  deleteBlueprint: (id: string) =>
    config.devBypass ? dev(() => fixtures.deleteBlueprint(id)) : coreApi.delete<void>(`blueprints/${id}`),

  createSection: async (
    blueprintId: string,
    body: BlueprintSectionCreate,
  ): Promise<BlueprintSectionRow> =>
    config.devBypass
      ? dev(() => fixtures.createBlueprintSection(blueprintId, body))
      : (await coreApi.post<{ blueprint_section: BlueprintSectionRow }>(
          `blueprints/${blueprintId}/sections`,
          body,
        )).blueprint_section,

  createConstraint: async (
    sectionId: string,
    body: BlueprintConstraintCreate,
  ): Promise<BlueprintConstraintRow> =>
    config.devBypass
      ? dev(() => fixtures.createConstraint(sectionId, body))
      : (await coreApi.post<{ blueprint_constraint: BlueprintConstraintRow }>(
          `blueprint-sections/${sectionId}/constraints`,
          body,
        )).blueprint_constraint,
};
