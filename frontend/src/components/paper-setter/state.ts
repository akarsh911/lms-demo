import type {
  BlueprintRef,
  ComposeOverrides,
  ComposeRequest,
  ComposeSource,
  WeightMap,
} from './contract';

export type PatternKind = 'none' | 'preset' | 'template' | 'mix' | 'new';

export interface ComposeConfig {
  curriculumId: string;
  nodeIds: string[];
  weights: WeightMap;
  weightsEnabled: boolean;
  pattern: PatternKind;
  preset: string;
  templateId: string;
  mix: string;
  paperKind: string;
  classId: string;
  sectionId: string;
  title: string;
  focus: string[];
}

export const EMPTY_CONFIG: ComposeConfig = {
  curriculumId: '',
  nodeIds: [],
  weights: {},
  weightsEnabled: false,
  pattern: 'none',
  preset: '',
  templateId: '',
  mix: '',
  paperKind: 'assignment',
  classId: '',
  sectionId: '',
  title: '',
  focus: [],
};

export const PAPER_KINDS = ['assignment', 'unit_test', 'class_exam'] as const;

export type PaperKind = (typeof PAPER_KINDS)[number];

export const CLASS_WIDE_KIND: PaperKind = 'class_exam';

export type ComposeEvent =
  | { type: 'curriculum'; curriculumId: string }
  | { type: 'toggleNode'; nodeId: string; descendantIds?: readonly string[] }
  | { type: 'setNodes'; nodeIds: string[] }
  | { type: 'weightsEnabled'; enabled: boolean }
  | { type: 'weight'; nodeId: string; share: number }
  | { type: 'pattern'; kind: PatternKind }
  | { type: 'preset'; preset: string }
  | { type: 'template'; templateId: string }
  | { type: 'mix'; mix: string }
  | { type: 'paperKind'; paperKind: string }
  | { type: 'class'; classId: string; sectionId: string }
  | { type: 'title'; title: string }
  | { type: 'prefill'; curriculumId: string; nodeIds: string[]; paperKind: string; title: string; focus: string[] };

const EQUAL_SHARE_SCALE = 100;

export function equalWeights(nodeIds: readonly string[]): WeightMap {
  if (nodeIds.length === 0) return {};
  const each = Math.round(EQUAL_SHARE_SCALE / nodeIds.length);
  return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, each]));
}

function keptFor(weights: WeightMap, nodeIds: readonly string[]): WeightMap {
  const kept: WeightMap = {};
  for (const nodeId of nodeIds) {
    const share = weights[nodeId];
    if (share !== undefined) kept[nodeId] = share;
  }
  return kept;
}

export function composeReducer(
  state: ComposeConfig,
  event: ComposeEvent,
): ComposeConfig {
  switch (event.type) {
    case 'curriculum':
      if (event.curriculumId === state.curriculumId) return state;
      return {
        ...state,
        curriculumId: event.curriculumId,
        nodeIds: [],
        weights: {},
        weightsEnabled: false,
      };

    case 'toggleNode': {
      const selected = state.nodeIds.includes(event.nodeId);
      const beneath = new Set(event.descendantIds ?? []);
      const nodeIds = selected
        ? state.nodeIds.filter((nodeId) => nodeId !== event.nodeId)
        : [...state.nodeIds.filter((nodeId) => !beneath.has(nodeId)), event.nodeId];
      const inScope = new Set(nodeIds);
      return {
        ...state,
        nodeIds,
        weights: state.weightsEnabled
          ? selected
            ? keptFor(state.weights, nodeIds)
            : { ...keptFor(state.weights, nodeIds), [event.nodeId]: state.weights[event.nodeId] ?? 0 }
          : state.weights,
      };
    }

    case 'setNodes':
      return {
        ...state,
        nodeIds: [...event.nodeIds],
        weights: state.weightsEnabled
          ? equalWeights(event.nodeIds)
          : keptFor(state.weights, event.nodeIds),
      };

    case 'weightsEnabled':
      return {
        ...state,
        weightsEnabled: event.enabled,
        weights: event.enabled ? equalWeights(state.nodeIds) : {},
      };

    case 'weight':
      return {
        ...state,
        weights: { ...state.weights, [event.nodeId]: Math.max(0, event.share) },
      };

    case 'pattern':
      return {
        ...state,
        pattern: event.kind,
        preset: event.kind === 'preset' ? state.preset : '',
        templateId: event.kind === 'template' ? state.templateId : '',
        mix: event.kind === 'mix' ? state.mix : '',
      };

    case 'preset':
      return {
        ...state,
        pattern: 'preset',
        preset: event.preset,
        templateId: '',
        mix: '',
      };

    case 'template':
      return {
        ...state,
        pattern: 'template',
        templateId: event.templateId,
        preset: '',
        mix: '',
      };

    case 'mix':
      return { ...state, pattern: 'mix', mix: event.mix, preset: '', templateId: '' };

    case 'paperKind':
      return { ...state, paperKind: event.paperKind };

    case 'class':
      return { ...state, classId: event.classId, sectionId: event.sectionId };

    case 'title':
      return { ...state, title: event.title };

    case 'prefill':
      return {
        ...state,
        curriculumId: event.curriculumId,
        nodeIds: [...event.nodeIds],
        weights: {},
        weightsEnabled: false,
        paperKind: event.paperKind,
        title: event.title,
        focus: [...event.focus],
      };
  }
}

export function toComposeSource(config: ComposeConfig): ComposeSource {
  return {
    curriculum_id: config.curriculumId,
    node_ids: [...config.nodeIds],
  };
}

export function isWholeCurriculum(config: ComposeConfig): boolean {
  return config.nodeIds.length === 0;
}

export function weightTotal(config: ComposeConfig): number {
  return config.nodeIds.reduce(
    (sum, nodeId) => sum + (config.weights[nodeId] ?? 0),
    0,
  );
}

export function weightedNodeIds(config: ComposeConfig): string[] {
  if (!config.weightsEnabled) return [];
  return config.nodeIds.filter((nodeId) => (config.weights[nodeId] ?? 0) > 0);
}

export function omittedNodeIds(config: ComposeConfig): string[] {
  if (!config.weightsEnabled) return [];
  return config.nodeIds.filter((nodeId) => (config.weights[nodeId] ?? 0) <= 0);
}

export function weightMap(config: ComposeConfig): WeightMap | null {
  if (!config.weightsEnabled) return null;
  const map: WeightMap = {};
  for (const nodeId of config.nodeIds) {
    const share = config.weights[nodeId] ?? 0;
    if (share > 0) map[nodeId] = share;
  }
  return Object.keys(map).length > 0 ? map : null;
}

export function normaliseShares(map: WeightMap | null | undefined): WeightMap {
  if (!map) return {};
  const positive = Object.entries(map).filter(([, share]) => share > 0);
  const total = positive.reduce((sum, [, share]) => sum + share, 0);
  if (total <= 0) return {};
  return Object.fromEntries(positive.map(([nodeId, share]) => [nodeId, share / total]));
}

export function normalisedWeights(config: ComposeConfig): WeightMap {
  return normaliseShares(weightMap(config));
}

export function targetShareOf(config: ComposeConfig, nodeId: string): number {
  return normalisedWeights(config)[nodeId] ?? 0;
}

export function blueprintRef(config: ComposeConfig): BlueprintRef {
  if (config.pattern === 'preset' && config.preset !== '') return { preset: config.preset };
  if (config.pattern === 'template' && config.templateId !== '') {
    return { template_id: config.templateId };
  }
  if (config.pattern === 'mix' && config.mix.trim() !== '') return { mix: config.mix.trim() };
  return {};
}

export function paperShapeChosen(config: ComposeConfig): boolean {
  return Object.keys(blueprintRef(config)).length === 1;
}

export function toComposeRequest(config: ComposeConfig, named = true): ComposeRequest | null {
  if (config.curriculumId === '') return null;
  if (config.classId === '') return null;

  const weights = weightMap(config);
  const title = config.title.trim();
  const overrides: ComposeOverrides = {
    kind: config.paperKind,
    class_id: config.classId,
    ...(config.sectionId === '' ? {} : { section_id: config.sectionId }),
    ...(named && title !== '' ? { exam_name: title } : {}),
    ...(config.focus.length > 0 ? { focus: [...config.focus] } : {}),
  };

  const request: ComposeRequest = {
    source: toComposeSource(config),
    blueprint: blueprintRef(config),
    overrides,
  };
  if (weights) request.weights = weights;
  return request;
}
