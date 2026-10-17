import { clockOf } from '@/lib/dates';
import { pageRangeLabel } from '@/lib/mindmap/deep-link';
import type { LessonBlock, LessonPeriod, LessonPlan } from '@/types/lesson-planner';

import { BLOCK_KIND_META } from './block-kinds';

export type ResourceLabel = (resource: LessonBlock['resources'][number]) => string;

export function blockWindows(period: LessonPeriod): { block: LessonBlock; from: number; to: number }[] {
  let elapsed = 0;
  return period.blocks.map((block) => {
    const from = elapsed;
    elapsed += block.minutes;
    return { block, from, to: elapsed };
  });
}

export function slotLine(period: LessonPeriod, formatDate: (iso: string) => string): string | null {
  if (!period.slot) return null;
  return `${formatDate(period.slot.date)}, ${period.slot.period_name} (${clockOf(period.slot.start_minute)}–${clockOf(period.slot.end_minute)})`;
}

const citationLine = (block: LessonBlock): string[] =>
  block.citations.map((c) => `   - Source: ${c.title}, ${pageRangeLabel({ from: c.page_start, to: c.page_end }).toLowerCase()}`);

export function planToText(plan: LessonPlan, labelOf: ResourceLabel, formatDate: (iso: string) => string): string {
  const lines: string[] = [
    `# ${plan.title}`,
    '',
    `${plan.section_label} · ${plan.subject_name} · ${plan.chapter_title}`,
    `${plan.periods.length} periods of ${plan.period_minutes} minutes · ${plan.author_name}`,
    '',
    '## Learning objectives',
    ...plan.objectives.map((objective, i) => `${i + 1}. ${objective}`),
  ];
  for (const period of plan.periods) {
    const when = slotLine(period, formatDate);
    lines.push('', `## Period ${period.sequence}: ${period.focus}`);
    if (when) lines.push(when);
    for (const { block, from, to } of blockWindows(period)) {
      lines.push('', `${from}–${to} min · ${BLOCK_KIND_META[block.kind].label}: ${block.title}`, `   ${block.summary}`);
      lines.push(...block.steps.map((step) => `   - ${step}`), ...citationLine(block));
      lines.push(...block.resources.map((resource) => `   - Resource: ${labelOf(resource)}`));
    }
    if (period.taught) lines.push('', `Taught. Reflection: ${period.taught.reflection || 'none written'}`);
  }
  return `${lines.join('\n')}\n`;
}

export const fileNameOf = (plan: LessonPlan): string =>
  `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lesson-plan'}.txt`;
