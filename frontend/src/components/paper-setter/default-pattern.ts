import type { PresetSummary } from './contract';
import type { PaperKind } from './state';

const SHORT_TEST_CHAPTERS = 2;
const UNIT_TEST_MARKS = { low: 20, high: 40 } as const;

const classOf = (name: string): number | null => {
  const match = /class\s+(\d{1,2})/i.exec(name);
  return match ? Number.parseInt(match[1]!, 10) : null;
};

function fitsClass(preset: PresetSummary, gradeLevel: number | null): boolean {
  const named = classOf(preset.name);
  return named === null || gradeLevel === null || named === gradeLevel;
}

const generic = (preset: PresetSummary): boolean => preset.subject.trim() === '';

const byMarks = (left: PresetSummary, right: PresetSummary): number => left.total_marks - right.total_marks;

export function defaultPresetId(
  presets: readonly PresetSummary[],
  kind: PaperKind,
  chapterCount: number,
  subject: string,
  gradeLevel: number | null,
): string | null {
  const usable = presets.filter((preset) => fitsClass(preset, gradeLevel));
  const open = usable.filter(generic).sort(byMarks);

  if (kind === 'assignment') {
    const fewest = [...open].sort((left, right) => left.question_count - right.question_count)[0];
    return (fewest ?? usable[0])?.id ?? null;
  }

  if (kind === 'unit_test') {
    const tests = open.filter((preset) => preset.total_marks > UNIT_TEST_MARKS.low && preset.total_marks <= UNIT_TEST_MARKS.high);
    const short = chapterCount > 0 && chapterCount <= SHORT_TEST_CHAPTERS;
    const pick = short ? tests[0] : tests[tests.length - 1];
    return (pick ?? open[0] ?? usable[0])?.id ?? null;
  }

  const wanted = subject.trim().toLowerCase();
  const matching = usable.find((preset) => wanted !== '' && preset.subject.trim().toLowerCase().startsWith(wanted) && classOf(preset.name) !== null);
  return (matching ?? open[open.length - 1] ?? usable[0])?.id ?? null;
}
