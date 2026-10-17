import type { ResultComponent } from '@/types/result-scheme';

export interface ComponentSources {
  exams: number;
  assignments: number;
}

export interface Composition {
  total: number;
  allocated: number;
  remaining: number;
  balanced: boolean;
}

export const NO_SOURCES: ComponentSources = { exams: 0, assignments: 0 };

export function formatMarks(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function sameMarks(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function compose(
  totalMarks: number | undefined,
  components: readonly ResultComponent[],
): Composition {
  const total = totalMarks ?? 100;
  const allocated = components.reduce((sum, row) => sum + (row.weight ?? 0), 0);
  return {
    total,
    allocated,
    remaining: total - allocated,
    balanced: sameMarks(allocated, total),
  };
}

export function compositionLine(composition: Composition): string {
  const { total, allocated, remaining, balanced } = composition;
  if (balanced) {
    return `All ${formatMarks(total)} marks are accounted for.`;
  }
  if (remaining > 0) {
    return `${formatMarks(allocated)} of ${formatMarks(total)} accounted for — you are ${formatMarks(remaining)} short.`;
  }
  return `${formatMarks(allocated)} of ${formatMarks(total)} accounted for — that is ${formatMarks(-remaining)} too many.`;
}

export function sourceCount(sources: ComponentSources): number {
  return sources.exams + sources.assignments;
}

export function sourcesLine(sources: ComponentSources): string {
  const parts: string[] = [];
  if (sources.exams > 0) {
    parts.push(`${sources.exams} ${sources.exams === 1 ? 'exam' : 'exams'}`);
  }
  if (sources.assignments > 0) {
    parts.push(
      `${sources.assignments} ${sources.assignments === 1 ? 'assignment' : 'assignments'}`,
    );
  }
  return parts.length === 0 ? 'nothing linked' : parts.join(', ');
}

export function componentBlocker(
  component: ResultComponent,
  sources: ComponentSources,
): string | null {
  const name = component.name ?? 'This component';
  const linked = sourceCount(sources);

  if (linked === 0) {
    return `"${name}" has nothing linked to it, so it can never be scored.`;
  }
  if (component.aggregation !== 'best_of') return null;

  const takeBest = component.take_best;
  if (takeBest === undefined) {
    return `"${name}" takes the best of some number, but the number is missing.`;
  }
  if (linked < takeBest) {
    return `"${name}" takes the best ${takeBest} but only ${linked} ${linked === 1 ? 'source is' : 'sources are'} linked (${sourcesLine(sources)}).`;
  }
  return null;
}

export function activationBlockers(
  composition: Composition,
  components: readonly ResultComponent[],
  sourcesOf: (componentId: string) => ComponentSources,
): string[] {
  if (components.length === 0) {
    return [
      `This scheme has no components, so there is nothing for its ${formatMarks(composition.total)} marks to be made of.`,
    ];
  }

  const blockers: string[] = [];
  if (!composition.balanced) blockers.push(compositionLine(composition));

  for (const row of components) {
    const blocker = componentBlocker(row, sourcesOf(row.id));
    if (blocker) blockers.push(blocker);
  }
  return blockers;
}

export function nextPosition(components: readonly ResultComponent[]): number {
  return components.reduce((top, row) => Math.max(top, (row.position ?? 0) + 1), 0);
}

export const AGGREGATION_LABELS: Record<string, string> = {
  single: 'One sitting',
  sum: 'Added up',
  best_of: 'Best of',
  average: 'Averaged',
};

export const AGGREGATION_HINTS: Record<string, string> = {
  single: 'One exam or one assignment fills this part.',
  sum: 'Every linked source adds up, capped at full marks.',
  best_of: 'Only the best few of the linked sources count.',
  average: 'The mean of every linked source.',
};
