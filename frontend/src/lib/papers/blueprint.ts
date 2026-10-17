import { readVisibility } from '@/lib/core/fields';
import { trimNumber } from '@/lib/exams/exam';
import { durationLabel } from '@/lib/school/time';
import type { Capability } from '@/types/core';
import type {
  BlueprintConstraintRow,
  BlueprintRow,
  BlueprintSectionRow,
  BlueprintStatus,
  CognitiveBand,
  CognitiveScheme,
  ConstraintType,
  UnitWeight,
  UnitWeightage,
} from '@/types/blueprints';
import type { ChipTone } from '@/components/ui/chip';

export const BLUEPRINT_STATUS_LABELS: Record<BlueprintStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export const BLUEPRINT_STATUS_TONES: Record<BlueprintStatus, ChipTone> = {
  draft: 'grey',
  published: 'green',
  archived: 'amber',
};

export const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  difficulty: 'Difficulty',
  bloom: 'Cognitive band',
  topic: 'Topic',
  outcome: 'Learning outcome',
  type: 'Question type',
};

export const REUSABLE_TEMPLATE = 'Reusable template';

export const REUSABLE_TEMPLATE_EXPLAINED =
  'This pattern belongs to no academic year, so it can be used again next ' +
  'year without being copied. That is a deliberate choice and not a missing ' +
  'value.';

export const SESSION_CHOICE_HINT =
  'Bind this pattern to one year, or leave it reusable so it carries across years.';

export const REUSABLE_SESSION_VALUE = '';

export type SessionBinding = 'bound' | 'reusable' | 'withheld';

export function sessionBinding(
  blueprint: BlueprintRow,
  capability: Capability | undefined,
): SessionBinding {
  const visibility = readVisibility(
    capability,
    'academic_session_id',
    blueprint.academic_session_id,
  );
  if (visibility === 'shown') return 'bound';
  return visibility === 'empty' ? 'reusable' : 'withheld';
}

export type WeightageState = 'listed' | 'empty' | 'unset' | 'withheld';

export const WEIGHTAGE_LABELS: Record<WeightageState, string> = {
  listed: 'Weighted by unit',
  empty: 'A weighting that lists no unit',
  unset: 'No per-unit target',
  withheld: 'Not shown to this account',
};

export const WEIGHTAGE_CAPTIONS: Record<WeightageState, string> = {
  listed: 'Each unit below carries its own share of the paper.',
  empty:
    'A weighting document exists for this pattern and names no unit. That is ' +
    'not the same as having no weighting: somebody started one and left it empty.',
  unset:
    'No weighting document at all, so the pattern covers every chapter with no ' +
    'per-unit target.',
  withheld:
    'This account may not read the unit weighting, so whether one exists cannot ' +
    'be shown here.',
};

export function weightageState(
  blueprint: BlueprintRow,
  capability: Capability | undefined,
): WeightageState {
  const weightage = blueprint.unit_weightage;
  if (weightage) return weightage.units?.length ? 'listed' : 'empty';
  return readVisibility(capability, 'unit_weightage', undefined) === 'empty'
    ? 'unset'
    : 'withheld';
}

export function unitsOf(weightage: UnitWeightage | undefined): UnitWeight[] {
  return weightage?.units ?? [];
}

export function blueprintLabel(blueprint: BlueprintRow): string {
  return blueprint.name ?? blueprint.code ?? 'Untitled pattern';
}

export function blueprintSubtitle(blueprint: BlueprintRow): string | undefined {
  const parts: string[] = [];
  if (blueprint.name && blueprint.code) parts.push(blueprint.code);
  if (typeof blueprint.version === 'number') parts.push(`Version ${blueprint.version}`);
  if (typeof blueprint.total_marks === 'number') {
    parts.push(`${trimNumber(blueprint.total_marks)} marks`);
  }
  if (typeof blueprint.duration_minutes === 'number') {
    parts.push(durationLabel(blueprint.duration_minutes));
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function schemeSummary(scheme: CognitiveScheme | undefined): string | null {
  if (!scheme?.name) return null;
  const count = scheme.bands?.length ?? 0;
  return `${scheme.name} · ${count === 1 ? '1 band' : `${count} bands`}`;
}

export function bandRange(band: CognitiveBand): string | null {
  if (typeof band.weight_percent === 'number') return `${trimNumber(band.weight_percent)}%`;
  const from = band.min_percent;
  const to = band.max_percent;
  if (typeof from === 'number' && typeof to === 'number') {
    return `${trimNumber(from)}–${trimNumber(to)}%`;
  }
  if (typeof from === 'number') return `at least ${trimNumber(from)}%`;
  if (typeof to === 'number') return `at most ${trimNumber(to)}%`;
  return null;
}

export function unitShare(unit: UnitWeight): string | null {
  const parts: string[] = [];
  if (typeof unit.weight_percent === 'number') {
    parts.push(`${trimNumber(unit.weight_percent)}%`);
  }
  if (typeof unit.marks === 'number') parts.push(`${trimNumber(unit.marks)} marks`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function sectionTally(section: BlueprintSectionRow): string {
  const parts: string[] = [];
  const count = section.question_count;
  if (typeof count === 'number') {
    parts.push(count === 1 ? '1 question' : `${count} questions`);
  }
  if (typeof section.marks_per_question === 'number') {
    parts.push(`${trimNumber(section.marks_per_question)} each`);
  }
  if (typeof section.total_marks === 'number') {
    parts.push(`${trimNumber(section.total_marks)} marks`);
  }
  if (typeof section.duration_minutes === 'number') {
    parts.push(durationLabel(section.duration_minutes));
  }
  return parts.length > 0 ? parts.join(' · ') : 'Nothing stated';
}

export function constraintBound(constraint: BlueprintConstraintRow): string | null {
  const from = constraint.min_value;
  const to = constraint.max_value;
  if (typeof from === 'number' && typeof to === 'number') {
    return `${trimNumber(from)} to ${trimNumber(to)}`;
  }
  if (typeof from === 'number') return `at least ${trimNumber(from)}`;
  if (typeof to === 'number') return `at most ${trimNumber(to)}`;
  return null;
}

export function constraintValues(constraint: BlueprintConstraintRow): string | null {
  const value = constraint.value_json;
  if (!value || Object.keys(value).length === 0) return null;
  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${describe(entry)}`)
    .join(' · ');
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return value.map(describe).join(', ');
  if (value === null) return 'none';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function schemeProblem(scheme: CognitiveScheme): string | null {
  if (scheme.name.trim() === '') {
    return 'Name the scheme these bands belong to. A board ships more than one and they are not interchangeable.';
  }
  if (scheme.bands.length === 0) {
    return 'Add at least one band. A scheme with no bands constrains nothing.';
  }
  const seen = new Set<string>();
  for (const band of scheme.bands) {
    const key = band.key.trim();
    if (key === '') return 'Every band needs a key.';
    if (seen.has(key)) return `The band "${key}" appears twice.`;
    seen.add(key);

    for (const percent of [band.weight_percent, band.min_percent, band.max_percent]) {
      if (typeof percent === 'number' && (percent < 0 || percent > 100)) {
        return `The band "${key}" has a percentage outside 0 to 100.`;
      }
    }
    if (
      typeof band.min_percent === 'number' &&
      typeof band.max_percent === 'number' &&
      band.max_percent < band.min_percent
    ) {
      return `The band "${key}" has a maximum below its minimum.`;
    }
  }
  return null;
}

export function weightageProblem(units: readonly UnitWeight[]): string | null {
  const seen = new Set<string>();
  for (const unit of units) {
    const key = unit.key.trim();
    if (key === '') return 'Every unit needs a key.';
    if (seen.has(key)) return `The unit "${key}" appears twice.`;
    seen.add(key);

    if (
      typeof unit.weight_percent === 'number' &&
      (unit.weight_percent < 0 || unit.weight_percent > 100)
    ) {
      return `The unit "${key}" has a share outside 0 to 100.`;
    }
    if (typeof unit.marks === 'number' && unit.marks < 0) {
      return `The unit "${key}" has negative marks.`;
    }
  }
  return null;
}
