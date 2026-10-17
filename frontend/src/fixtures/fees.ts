import type { FeeInstalment, FeeOverview, MyFees } from '@/types/fees';

import { FEES_DUE, LATE_FEE_CAP, LATE_FEE_PER_DAY, dayFrom } from './data/actions';
import { TODAY } from './data/classroom';
import { SEATED } from './data/enrollment';
import { PERSONS, STUDENTS } from './data/people';
import { CURRENT_SECTIONS, CURRENT_SESSION, GRADE_LEVELS } from './data/structure';
import { seedId } from './ids';
import { reachNow } from './reach';
import { fail } from './rows';

const TERM = 24_300;
const TERMS = [
  { term: 'Term 1', due: '2026-04-15' },
  { term: 'Term 2', due: '2026-07-15' },
  { term: 'Term 3', due: '2027-01-15' },
] as const;

const lateFee = (days: number): number => Math.min(LATE_FEE_CAP, Math.max(0, days - 15) * LATE_FEE_PER_DAY);
const name = (studentId: string): string => PERSONS.find((p) => p.id === STUDENTS.find((s) => s.id === studentId)?.person_id)?.display_name ?? 'Student';
const label = (sectionId: string): string => {
  const s = CURRENT_SECTIONS.find((x) => x.id === sectionId);
  return `${(GRADE_LEVELS.find((g) => g.id === s?.grade_level_id)?.name ?? '').replace('Class ', '')}${s?.name ?? ''}`;
};

// A pupil's three instalments: paid unless the accounts office lists them as owed, the last still to come.
export function myFees(): MyFees {
  const reach = reachNow();
  if (reach.kind !== 'self') fail(403, 'forbidden', 'Fees are shown to the pupil they belong to.');
  const owed = FEES_DUE.find((f) => f.student_id === reach.studentId);
  const instalments: FeeInstalment[] = TERMS.map(({ term, due }, i) => {
    const unpaid = owed !== undefined && owed.term.includes(term);
    if (unpaid) return { term, amount: TERM, due: dayFrom(-owed.days_overdue), status: 'overdue', late_fee: lateFee(owed.days_overdue), paid_on: null, receipt: null };
    if (due > TODAY) return { term, amount: TERM, due, status: 'upcoming', late_fee: 0, paid_on: null, receipt: null };
    return { term, amount: TERM, due, status: 'paid', late_fee: 0, paid_on: dayFrom(-Math.round((Date.parse(TODAY) - Date.parse(due)) / 86_400_000) - 3 - i), receipt: `RCPT-${seedId('receipt', reach.studentId, term).slice(0, 8).toUpperCase()}` };
  });
  return {
    student: name(reach.studentId),
    section: label(reach.sectionId ?? ''),
    year: CURRENT_SESSION.name ?? 'This year',
    instalments,
    paid: instalments.filter((x) => x.status === 'paid').reduce((t, x) => t + x.amount, 0),
    outstanding: instalments.filter((x) => x.status === 'overdue').reduce((t, x) => t + x.amount + x.late_fee, 0),
  };
}

// The office's view: what was billed for the two terms so far, what came in, and who is behind.
export function feeOverview(): FeeOverview {
  if (reachNow().kind !== 'school') fail(403, 'forbidden', 'The fee book is the office’s.');
  const billed = SEATED.length * TERM * 2;
  const outstanding = FEES_DUE.reduce((t, f) => t + f.amount, 0);
  return {
    billed,
    collected: billed - outstanding,
    outstanding: outstanding + FEES_DUE.reduce((t, f) => t + lateFee(f.days_overdue), 0),
    families_behind: FEES_DUE.length,
    over_60: FEES_DUE.filter((f) => f.days_overdue > 60).length,
    defaulters: FEES_DUE.map((f) => ({ student_id: f.student_id, student: name(f.student_id), section: label(f.section_id), term: f.term, amount: f.amount, days_overdue: f.days_overdue, late_fee: lateFee(f.days_overdue) })).sort((a, b) => b.days_overdue - a.days_overdue),
  };
}
