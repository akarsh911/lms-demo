import type { BookletRef } from '@/types/answer-checker';

export interface RosterStudent {
  studentId: string;
  name: string;
  roll: string | null;
}

export type MatchBasis = 'roll_and_name' | 'roll' | 'name' | 'likely_name' | 'teacher';

export interface BookletMatch {
  student: RosterStudent;
  basis: MatchBasis;
}

const NEAR_NAME_DISTANCE = 2;

export function normalisedRoll(roll: string | null | undefined): string | null {
  const digits = roll?.trim().replace(/^0+(?=\d)/, '') ?? '';
  return digits === '' ? null : digits;
}

export function normalisedName(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function distance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j] ?? 0;
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(above + 1, (previous[j - 1] ?? 0) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[right.length] ?? 0;
}

export function matchBooklet(ref: BookletRef, roster: readonly RosterStudent[]): BookletMatch | null {
  const roll = normalisedRoll(ref.student.roll_number);
  const name = normalisedName(ref.student.name);

  const byRoll = roll ? roster.find((student) => normalisedRoll(student.roll) === roll) : undefined;
  if (byRoll) {
    return { student: byRoll, basis: normalisedName(byRoll.name) === name ? 'roll_and_name' : 'roll' };
  }
  if (name === '') return null;

  const byName = roster.filter((student) => normalisedName(student.name) === name);
  if (byName.length === 1 && byName[0]) return { student: byName[0], basis: 'name' };

  const near = roster.filter((student) => distance(normalisedName(student.name), name) <= NEAR_NAME_DISTANCE);
  if (near.length === 1 && near[0]) return { student: near[0], basis: 'likely_name' };
  return null;
}

export function confidentMatch(match: BookletMatch | null): boolean {
  return match?.basis === 'roll_and_name';
}

export const MATCH_LABELS: Record<MatchBasis, string> = {
  roll_and_name: 'Roll and name agree',
  roll: 'Roll number only',
  name: 'Name only',
  likely_name: 'Name is close',
  teacher: 'Chosen by you',
};
