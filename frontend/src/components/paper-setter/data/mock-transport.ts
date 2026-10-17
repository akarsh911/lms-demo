import { ApiError } from '@/services/api';

import type {
  BlueprintShape,
  BlueprintRef,
  ChapterTarget,
  ComposeBook,
  ComposePreview,
  ComposeRequest,
  ComposeResult,
  NodeAvailability,
  PaperSetterSettings,
  PresetSummary,
  SectionIn,
  SectionItemIn,
  TemplateCreateRequest,
  TemplateDetail,
  TemplateSummary,
} from '../contract';
import { PAPER_SERVICE_PERSONA, QUESTION_TYPES, blueprintTotals } from '../pattern-draft';
import { PAPER_KINDS, normaliseShares } from '../state';
import {
  curriculumMaterial,
  drawnFromSentence,
  materialRows,
  materialTargets,
  setPaperFrom,
  type CurriculumMaterial,
} from './mock-material';
import type { PaperSetterTransport } from './transport';

const MOCK_LATENCY_MS = 220;

function settle<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), MOCK_LATENCY_MS);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

function fingerprint(nodeId: string): number {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i += 1) {
    hash = (hash * 31 + nodeId.charCodeAt(i)) % 100003;
  }
  return hash;
}

interface MaterialProfile {
  placements: number;
  readable: number;
  unreadable: number;
  exact: number;
  indexed: number;
  stale: number;
  not_indexed: number;
  unpublished: number;
  source_deleted: number;
  supply: string;
}

const UNMEASURED_SUPPLY = new Set([
  'unmapped',
  'restricted',
  'curriculum_only',
  'extent_unknown',
  'attributed_to_ancestor',
  'whole_book_unmeasured',
]);

const PROFILES: readonly MaterialProfile[] = [
  { placements: 0, readable: 0, unreadable: 0, exact: 0, indexed: 0, stale: 0, not_indexed: 0, unpublished: 0, source_deleted: 0, supply: 'unmapped' },
  { placements: 6, readable: 6, unreadable: 0, exact: 4, indexed: 6, stale: 0, not_indexed: 0, unpublished: 0, source_deleted: 0, supply: 'located' },
  { placements: 4, readable: 4, unreadable: 0, exact: 1, indexed: 1, stale: 0, not_indexed: 3, unpublished: 0, source_deleted: 0, supply: 'located' },
  { placements: 2, readable: 2, unreadable: 0, exact: 0, indexed: 2, stale: 0, not_indexed: 0, unpublished: 0, source_deleted: 0, supply: 'curriculum_only' },
  { placements: 5, readable: 2, unreadable: 3, exact: 1, indexed: 2, stale: 0, not_indexed: 0, unpublished: 0, source_deleted: 0, supply: 'located' },
  { placements: 4, readable: 4, unreadable: 0, exact: 2, indexed: 1, stale: 2, not_indexed: 0, unpublished: 0, source_deleted: 1, supply: 'located' },
  { placements: 1, readable: 1, unreadable: 0, exact: 0, indexed: 1, stale: 0, not_indexed: 0, unpublished: 0, source_deleted: 0, supply: 'extent_unknown' },
  { placements: 3, readable: 0, unreadable: 3, exact: 0, indexed: 0, stale: 0, not_indexed: 0, unpublished: 0, source_deleted: 0, supply: 'restricted' },
];

function profileFor(nodeId: string): MaterialProfile {
  return PROFILES[fingerprint(nodeId) % PROFILES.length] ?? PROFILES[1]!;
}

function availabilityRows(request: ComposeRequest): NodeAvailability[] {
  const targets = normaliseShares(request.weights);
  const measured = request.source.node_ids.filter(
    (nodeId) => !UNMEASURED_SUPPLY.has(profileFor(nodeId).supply),
  );
  const totalIndexed = measured.reduce(
    (sum, nodeId) => sum + profileFor(nodeId).indexed,
    0,
  );

  return request.source.node_ids.map((nodeId) => {
    const profile = profileFor(nodeId);
    const unmeasured = UNMEASURED_SUPPLY.has(profile.supply);
    return {
      node_id: nodeId,
      title: '',
      kind: 'topic' as const,
      target_share: targets[nodeId] ?? 0,
      available_share:
        unmeasured || totalIndexed === 0 ? 0 : profile.indexed / totalIndexed,
      ...profile,
    };
  });
}

const PRESET_KIND = 'preset';
const PATTERN_KIND = 'pattern';

function mockItem(question_type: string, marks: number, count: number): SectionItemIn {
  return { question_type, marks, count };
}

function mockSection(
  id: string,
  title: string,
  items: readonly SectionItemIn[],
  extra: Partial<SectionIn> = {},
): SectionIn {
  return {
    id,
    title,
    instruction: '',
    items: [...items],
    two_column: false,
    internal_choice: 0,
    attempt_any: 0,
    ...extra,
  };
}

interface StoredPattern {
  blueprint: BlueprintShape;
  kind: string;
  created_at: string;
}

const MOCK_STORE = new Map<string, StoredPattern>([
  [
    'unit-25',
    {
      kind: PRESET_KIND,
      created_at: '',
      blueprint: {
        name: 'Unit test — 25 marks',
        duration_min: 60,
        pass_mark_pct: 33,
        page_budget: 2,
        persona_id: PAPER_SERVICE_PERSONA,
        sections: [
          mockSection('A', 'Objective', [mockItem('mcq', 1, 5)], { two_column: true }),
          mockSection('B', 'Very Short Answer', [mockItem('very_short', 2, 4)]),
          mockSection('C', 'Short Answer', [mockItem('short', 3, 4)], {
            internal_choice: 1,
          }),
        ],
      },
    },
  ],
  [
    'cbse-x-maths',
    {
      kind: PRESET_KIND,
      created_at: '',
      blueprint: {
        name: 'CBSE Class 10 — Mathematics',
        duration_min: 180,
        pass_mark_pct: 33,
        page_budget: 6,
        persona_id: PAPER_SERVICE_PERSONA,
        sections: [
          mockSection(
            'A',
            'Objective',
            [mockItem('mcq', 1, 16), mockItem('assertion_reason', 1, 4)],
            { two_column: true },
          ),
          mockSection('B', 'Very Short Answer', [mockItem('numerical', 2, 5)], {
            internal_choice: 2,
          }),
          mockSection('C', 'Short Answer', [mockItem('numerical', 3, 6)], {
            internal_choice: 2,
          }),
          mockSection('D', 'Long Answer', [mockItem('numerical', 5, 4)], {
            internal_choice: 2,
          }),
          mockSection('E', 'Case-Based Questions', [mockItem('case_based', 4, 3)]),
        ],
      },
    },
  ],
  [
    'tmpl-half-yearly',
    {
      kind: PATTERN_KIND,
      created_at: '2026-04-11T09:30:00+00:00',
      blueprint: {
        name: 'Half yearly, last year',
        duration_min: 120,
        pass_mark_pct: 33,
        page_budget: 3,
        persona_id: PAPER_SERVICE_PERSONA,
        sections: [
          mockSection('A', 'Objective', [mockItem('mcq', 1, 10)], { two_column: true }),
          mockSection('B', 'Short answer', [mockItem('short', 3, 5)]),
          mockSection('C', 'Long answer', [mockItem('long', 5, 5)], { attempt_any: 4 }),
        ],
      },
    },
  ],
]);

function mockSummary(id: string, stored: StoredPattern): TemplateSummary {
  const totals = blueprintTotals(stored.blueprint.sections ?? []);
  return {
    id,
    name: stored.blueprint.name,
    kind: stored.kind,
    writable: stored.kind === PATTERN_KIND,
    created_at: stored.created_at,
    total_marks: totals.marks,
    question_count: totals.questionCount,
    duration_min: stored.blueprint.duration_min ?? 0,
    subject: stored.blueprint.subject ?? '',
  };
}

function mockDetail(id: string, stored: StoredPattern): TemplateDetail {
  return { ...mockSummary(id, stored), blueprint: stored.blueprint };
}

function mockRows(): TemplateSummary[] {
  return [...MOCK_STORE.entries()]
    .map(([id, stored]) => mockSummary(id, stored))
    .sort(
      (left, right) =>
        (left.total_marks ?? 0) - (right.total_marks ?? 0) ||
        left.name.localeCompare(right.name),
    );
}

function mockPresets(): PresetSummary[] {
  return mockRows()
    .filter((row) => row.kind === PRESET_KIND)
    .map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      writable: row.writable,
      total_marks: row.total_marks ?? 0,
      question_count: row.question_count ?? 0,
      duration_min: row.duration_min ?? 0,
      subject: row.subject ?? '',
    }));
}

function refuse(
  status: number,
  code: string,
  message: string,
  detail: Record<string, unknown> | null = null,
): never {
  throw new ApiError(status, code, message, { error: { code, message, detail } });
}

const NO_NAME = 'A template needs a name — it is what you will pick it by later.';

function mockSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base === '') {
    refuse(400, 'invalid_name', NO_NAME, {
      hint: 'A template is picked by its name later, so it needs one.',
    });
  }
  let candidate = base;
  let suffix = 2;
  while (MOCK_STORE.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

const MOCK_SECTION_TITLE: Record<number, string> = {
  1: 'Objective',
  2: 'Short answer',
  3: 'Short answer',
  4: 'Long answer',
  5: 'Long answer',
};

function mockParseMix(spec: string): SectionIn[] {
  const items: SectionItemIn[] = [];

  for (const chunk of spec.split(',')) {
    const trimmed = chunk.trim();
    if (trimmed === '') continue;
    const parts = trimmed.split(':').map((part) => part.trim());
    if (parts.length !== 3) {
      refuse(
        400,
        'bad_mix',
        `${trimmed} is not TYPE:MARKS:COUNT. Three parts separated by colons, like mcq:1:20.`,
      );
    }
    const [name, marksText, countText] = parts as [string, string, string];
    const questionType = name.toLowerCase();
    if (!(QUESTION_TYPES as readonly string[]).includes(questionType)) {
      refuse(400, 'bad_mix', `Unknown question type ${name}.`, {
        hint: `Valid types: ${QUESTION_TYPES.join(', ')}.`,
      });
    }
    const marks = Number(marksText);
    const count = Number(countText);
    if (!Number.isFinite(marks) || !Number.isInteger(count) || marks <= 0 || count <= 0) {
      refuse(400, 'bad_mix', `${trimmed} — marks and count must be numbers above zero.`);
    }
    items.push(mockItem(questionType, marks, count));
  }

  if (items.length === 0) {
    refuse(400, 'bad_mix', 'That mix described no questions, so there is nothing to save.');
  }

  const byMarks = new Map<number, SectionItemIn[]>();
  for (const item of items) {
    byMarks.set(item.marks, [...(byMarks.get(item.marks) ?? []), item]);
  }

  return [...byMarks.keys()]
    .sort((left, right) => left - right)
    .map((marks, index) =>
      mockSection(
        String.fromCharCode(65 + index),
        MOCK_SECTION_TITLE[marks] ?? `${marks}-Mark Questions`,
        byMarks.get(marks) ?? [],
        {
          instruction: `Each question carries ${marks} mark${marks === 1 ? '.' : 's.'}`,
          two_column: marks <= 1,
        },
      ),
    );
}

function mockFound(templateId: string): StoredPattern {
  const stored = MOCK_STORE.get(templateId);
  if (!stored) {
    refuse(404, 'not_found', `No paper shape called ${templateId}.`, {
      hint: 'List what this school has with GET /api/v1/templates.',
    });
  }
  return stored;
}

function mockRefusePresetWrite(templateId: string, stored: StoredPattern): void {
  if (stored.kind !== PRESET_KIND) return;
  refuse(
    409,
    'preset_not_writable',
    `${templateId} is a shipped board pattern, so it cannot be changed here.`,
    {
      hint:
        'A pattern id means one thing to every paper already set from it. Save your own ' +
        'under a new name instead.',
    },
  );
}

function mockBlueprintFrom(request: TemplateCreateRequest): BlueprintShape {
  const chosen = (['preset', 'mix', 'sections'] as const).filter((field) => {
    const value = request[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  if (chosen.length !== 1) {
    refuse(
      400,
      'bad_request',
      chosen.length === 0
        ? 'No paper shape was given, so there is nothing to save.'
        : `More than one paper shape was given: ${chosen.join(', ')}.`,
    );
  }

  const seeded: BlueprintShape = request.preset
    ? { ...mockFound(request.preset).blueprint }
    : request.mix
      ? { name: request.name, sections: mockParseMix(request.mix) }
      : { name: request.name, sections: request.sections ?? [] };

  return {
    ...seeded,
    name: request.name,
    subject: request.subject ?? seeded.subject ?? '',
    class_label: request.class_label ?? seeded.class_label ?? '',
    duration_min: request.duration_min ?? seeded.duration_min ?? 180,
    page_budget: request.pages ?? seeded.page_budget ?? 4,
    pass_mark_pct: request.pass_mark_pct ?? seeded.pass_mark_pct ?? 33,
    persona_id: request.persona_id ?? seeded.persona_id ?? PAPER_SERVICE_PERSONA,
  };
}

const MOCK_SETTINGS: Omit<PaperSetterSettings, 'presets'> = {
  cooldown_months: 18,
  default_mode: 'bank',
  teacher_may_choose_mode: false,
  oversupply_factor: 1.5,
  quality_gate: 0.75,
  cost_pricing_configured: false,
  core_backed_stores: false,
};

interface MockMaterialView {
  nodes: NodeAvailability[];
  books: ComposeBook[];
  chapterTargets: ChapterTarget[];
}

function materialView(request: ComposeRequest, material: CurriculumMaterial | null): MockMaterialView {
  if (!material) return { nodes: availabilityRows(request), books: [], chapterTargets: [] };
  return {
    nodes: materialRows(request, material),
    books: material.books,
    chapterTargets: materialTargets(request, material),
  };
}

function previewWarnings(request: ComposeRequest, rows: NodeAvailability[]): string[] {
  const warnings: string[] = [];

  const unmapped = rows.filter((row) => row.placements === 0).length;
  if (unmapped > 0) {
    warnings.push(
      `${unmapped} of the chapters you selected have not been matched to a book yet, so nothing records what material stands behind them. The paper is still set from what the rest can supply.`,
    );
  }

  if (request.source.node_ids.length === 0) {
    warnings.push(
      'No chapters are selected, so the whole curriculum is in scope. That is a valid request and it is probably not the one you meant.',
    );
  }

  return warnings;
}

const SHAPE_FIELDS = ['preset', 'template_id', 'mix'] as const;

function mockShapeOf(ref: BlueprintRef): (typeof SHAPE_FIELDS)[number] {
  const named = SHAPE_FIELDS.filter((field) => {
    const value = (ref as Record<string, unknown>)[field];
    return typeof value === 'string' && value.trim() !== '';
  });

  if (named.length === 1) return named[0]!;
  if (named.length === 0) {
    refuse(400, 'no_paper_shape', 'No paper shape was given, so there is nothing to compose.', {
      hint:
        'Set exactly one of blueprint.preset, blueprint.template_id or blueprint.mix. ' +
        'GET /api/v1/templates lists what there is.',
    });
  }
  refuse(
    400,
    'several_paper_shapes',
    `More than one paper shape was given: ${named.join(', ')}.`,
    {
      hint:
        'They describe the same thing three ways and nothing in the printed paper would ' +
        'record which one had been used.',
      given: named,
    },
  );
}

function mockPresetBlueprint(presetId: string): BlueprintShape {
  const stored = MOCK_STORE.get(presetId);
  if (!stored || stored.kind !== PRESET_KIND) {
    refuse(400, 'unknown_preset', `no preset called ${presetId}`, {
      hint: 'GET /api/v1/templates lists the patterns this school has.',
    });
  }
  return stored.blueprint;
}

function mockPreviewBlueprint(request: ComposeRequest): BlueprintShape {
  const ref = request.blueprint as Record<string, string | undefined>;
  const shape = mockShapeOf(request.blueprint);
  if (shape === 'preset') return mockPresetBlueprint(ref.preset ?? '');
  if (shape === 'template_id') return mockFound(ref.template_id ?? '').blueprint;
  return { name: 'Custom', sections: mockParseMix(ref.mix ?? '') };
}

function mockRefuseUnknownKind(request: ComposeRequest): void {
  const kind = request.overrides.kind;
  if ((PAPER_KINDS as readonly string[]).includes(kind)) return;
  refuse(400, 'unknown_kind', `'${kind}' is not a kind of paper this school sets.`, {
    hint: 'One of these.',
    offered: [...PAPER_KINDS],
  });
}

function mockRefuseNoClass(request: ComposeRequest): void {
  if (request.overrides.class_id.trim() !== '') return;
  refuse(400, 'no_class', 'No class was named, so there is nobody for this paper to be set for.', {
    hint:
      'Send overrides.class_id, and overrides.section_id too for anything that is not a ' +
      'class-wide examination.',
  });
}

const NOTHING_CONTRIBUTING = new Set(['unmapped', 'restricted', 'curriculum_only']);

function unplaceableReasonOf(row: NodeAvailability): string | null {
  if (NOTHING_CONTRIBUTING.has(row.supply ?? '')) return 'no_material';
  if (row.supply === 'extent_unknown') return 'no_page_range';
  return null;
}

interface MockUnplaceable {
  share: number;
  nodeIds: string[];
  reasons: string[];
}

function mockUnplaceable(rows: readonly NodeAvailability[]): MockUnplaceable {
  const reasons = new Set<string>();
  const nodeIds: string[] = [];
  let share = 0;

  for (const row of rows) {
    const reason = unplaceableReasonOf(row);
    if (reason === null) continue;
    reasons.add(reason);
    nodeIds.push(row.node_id);
    share += row.target_share;
  }

  return {
    share: Math.min(1, Math.round(share * 1000) / 1000),
    nodeIds,
    reasons: [...reasons].sort(),
  };
}

export const mockTransport: PaperSetterTransport = {
  settings: (signal) => settle({ ...MOCK_SETTINGS, presets: mockPresets() }, signal),

  templates: (signal) => settle(mockRows(), signal),

  template: async (templateId, signal) => {
    await settle(null, signal);
    return mockDetail(templateId, mockFound(templateId));
  },

  createTemplate: async (request) => {
    await settle(null);
    if ((request.name ?? '').trim() === '') {
      refuse(400, 'invalid_name', NO_NAME, {
        hint: "Something like 'Unit test — Light, 25 marks'.",
      });
    }
    const blueprint = mockBlueprintFrom(request);
    const id = mockSlug(request.name);
    const stored: StoredPattern = {
      blueprint,
      kind: PATTERN_KIND,
      created_at: new Date().toISOString(),
    };
    MOCK_STORE.set(id, stored);
    return mockDetail(id, stored);
  },

  updateTemplate: async (templateId, request) => {
    await settle(null);
    const stored = mockFound(templateId);
    mockRefusePresetWrite(templateId, stored);

    if (request.name !== undefined && request.name.trim() === '') {
      refuse(400, 'invalid_name', NO_NAME);
    }
    if (request.sections !== undefined && request.sections.length === 0) {
      refuse(
        400,
        'no_sections',
        'A paper shape with no sections would print an empty paper.',
      );
    }

    const next: StoredPattern = {
      ...stored,
      blueprint: {
        ...stored.blueprint,
        ...(request.name === undefined ? {} : { name: request.name.trim() }),
        ...(request.sections === undefined ? {} : { sections: request.sections }),
        ...(request.subject === undefined ? {} : { subject: request.subject }),
        ...(request.class_label === undefined ? {} : { class_label: request.class_label }),
        ...(request.duration_min === undefined
          ? {}
          : { duration_min: request.duration_min }),
        ...(request.pages === undefined ? {} : { page_budget: request.pages }),
        ...(request.pass_mark_pct === undefined
          ? {}
          : { pass_mark_pct: request.pass_mark_pct }),
        ...(request.persona_id === undefined ? {} : { persona_id: request.persona_id }),
      },
    };
    MOCK_STORE.set(templateId, next);
    return mockDetail(templateId, next);
  },

  deleteTemplate: async (templateId) => {
    await settle(null);
    const stored = mockFound(templateId);
    mockRefusePresetWrite(templateId, stored);
    MOCK_STORE.delete(templateId);
  },

  preview: (request) => mockPreview(request),

  compose: (request) => mockCompose(request),
};

export function mockPreview(
  request: ComposeRequest,
  knownBlueprint?: BlueprintShape,
): Promise<ComposePreview> {
  mockRefuseNoClass(request);
  mockRefuseUnknownKind(request);
  const blueprint = knownBlueprint ?? mockPreviewBlueprint(request);
  const { nodes, books, chapterTargets } = materialView(request, curriculumMaterial(request));
  const unplaceable = mockUnplaceable(nodes);
  const preview: ComposePreview = {
    sample: true,
    blueprint,
    nodes,
    books,
    chapter_targets: chapterTargets,
    warnings: previewWarnings(request, nodes),
    unplaceable_share: unplaceable.share,
    unplaceable_node_ids: unplaceable.nodeIds,
    unplaceable_reasons: unplaceable.reasons,
  };
  return settle(preview);
}

export function mockCompose(
  request: ComposeRequest,
  knownBlueprint?: BlueprintShape,
): Promise<ComposeResult> {
  mockRefuseNoClass(request);
  mockRefuseUnknownKind(request);
  const blueprint = knownBlueprint ?? mockPreviewBlueprint(request);
  const material = curriculumMaterial(request);
  const { nodes, books } = materialView(request, material);
  const paper = setPaperFrom(request, blueprint, material);
  const drawnFrom = drawnFromSentence(material);
  return settle<ComposeResult>({
    paper_id: paper.paper_id,
    sample: true,
    books,
    questions: paper.sections?.reduce((sum, section) => sum + (section.questions?.length ?? 0), 0) ?? 0,
    marks: paper.marks ?? 0,
    status: paper.status ?? 'draft',
    warnings: [...(drawnFrom ? [drawnFrom] : []), ...previewWarnings(request, nodes)],
    unplaceable_share: mockUnplaceable(nodes).share,
  });
}
