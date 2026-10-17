import type {
  CognitiveBand,
  CognitiveScheme,
  UnitWeight,
  UnitWeightage,
} from '@/types/blueprints';

export interface BandDraft {
  id: string;
  key: string;
  label: string;
  weight: string;
  min: string;
  max: string;
}

export interface SchemeDraft {
  name: string;
  bands: BandDraft[];
}

export interface UnitDraft {
  id: string;
  key: string;
  label: string;
  weight: string;
  marks: string;
}

export type WeightageChoice = 'none' | 'document';

let counter = 0;

export function draftId(): string {
  counter += 1;
  return `draft-${counter}`;
}

function text(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function emptyBand(): BandDraft {
  return { id: draftId(), key: '', label: '', weight: '', min: '', max: '' };
}

export function emptyUnit(): UnitDraft {
  return { id: draftId(), key: '', label: '', weight: '', marks: '' };
}

export function schemeDraftFrom(scheme: CognitiveScheme | undefined): SchemeDraft {
  const bands = scheme?.bands ?? [];
  return {
    name: scheme?.name ?? '',
    bands:
      bands.length > 0
        ? bands.map((band) => ({
            id: draftId(),
            key: band.key,
            label: band.label ?? '',
            weight: text(band.weight_percent),
            min: text(band.min_percent),
            max: text(band.max_percent),
          }))
        : [emptyBand()],
  };
}

export function schemeFromDraft(draft: SchemeDraft): CognitiveScheme {
  return {
    name: draft.name.trim(),
    bands: draft.bands.map((band): CognitiveBand => {
      const weight = numberOrUndefined(band.weight);
      const min = numberOrUndefined(band.min);
      const max = numberOrUndefined(band.max);
      return {
        key: band.key.trim(),
        label: band.label.trim() === '' ? band.key.trim() : band.label.trim(),
        ...(weight === undefined ? {} : { weight_percent: weight }),
        ...(min === undefined ? {} : { min_percent: min }),
        ...(max === undefined ? {} : { max_percent: max }),
      };
    }),
  };
}

export function weightageChoiceFor(
  weightage: UnitWeightage | undefined,
): WeightageChoice {
  return weightage ? 'document' : 'none';
}

export function unitDraftsFrom(weightage: UnitWeightage | undefined): UnitDraft[] {
  return (weightage?.units ?? []).map((unit) => ({
    id: draftId(),
    key: unit.key,
    label: unit.label ?? '',
    weight: text(unit.weight_percent),
    marks: text(unit.marks),
  }));
}

export function unitsFromDrafts(drafts: readonly UnitDraft[]): UnitWeight[] {
  return drafts.map((unit): UnitWeight => {
    const weight = numberOrUndefined(unit.weight);
    const marks = numberOrUndefined(unit.marks);
    return {
      key: unit.key.trim(),
      ...(unit.label.trim() === '' ? {} : { label: unit.label.trim() }),
      ...(weight === undefined ? {} : { weight_percent: weight }),
      ...(marks === undefined ? {} : { marks }),
    };
  });
}
