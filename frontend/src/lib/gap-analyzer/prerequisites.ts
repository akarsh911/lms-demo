// Which earlier topic a weak topic usually rests on, so a gap can point at its likely root cause.
const ROOTS: readonly [RegExp, RegExp][] = [
  [/completing the square|quadratic formula/i, /real numbers|factori/i],
  [/real numbers, part 2/i, /real numbers, part 1/i],
  [/refraction and lenses/i, /spherical mirrors/i],
  [/resistors in series|resistance and resistivity/i, /ohm'?s law/i],
  [/heating effect|power/i, /current and potential|ohm'?s law/i],
  [/ohm'?s law/i, /current and potential/i],
  [/excretion/i, /transportation/i],
  [/respiration/i, /modes of nutrition/i],
  [/transportation/i, /respiration/i],
  [/hormones/i, /nervous system/i],
  [/acids, bases and salts, part 2/i, /acids, bases and salts, part 1/i],
  [/sex determination/i, /inherited traits/i],
];

export function rootOf(title: string): RegExp | null {
  return ROOTS.find(([topic]) => topic.test(title))?.[1] ?? null;
}
