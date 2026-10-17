// Approximate CBSE Class 10 board weightage per chapter (2024–25 blueprints), used to rank which gaps cost the most marks.
const CHAPTER_MARKS: readonly [RegExp, number][] = [
  [/real numbers/i, 6],
  [/polynomial/i, 4],
  [/pair of linear|linear equations/i, 6],
  [/quadratic/i, 7],
  [/arithmetic progression/i, 6],
  [/triangle/i, 8],
  [/coordinate/i, 6],
  [/trigonometr/i, 8],
  [/circle/i, 6],
  [/area/i, 4],
  [/surface|volume/i, 6],
  [/statistic/i, 6],
  [/probability/i, 4],
  [/chemical reactions/i, 5],
  [/acids|bases|salts/i, 7],
  [/metals/i, 6],
  [/carbon/i, 7],
  [/life processes/i, 9],
  [/control and coordination/i, 6],
  [/reproduc/i, 6],
  [/heredity/i, 4],
  [/light/i, 9],
  [/human eye/i, 3],
  [/electricity/i, 8],
  [/magnetic/i, 5],
  [/environment/i, 5],
];

export const DEFAULT_CHAPTER_MARKS = 5;

export function chapterMarks(chapterTitle: string): number {
  return CHAPTER_MARKS.find(([pattern]) => pattern.test(chapterTitle))?.[1] ?? DEFAULT_CHAPTER_MARKS;
}
