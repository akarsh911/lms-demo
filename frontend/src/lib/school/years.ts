import type { YearLifecycle } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

// Being prepared, running, or over. The backend's three statuses, in the words a principal uses.
export function yearLifecycle(year: Pick<AcademicSession, 'is_current' | 'status'>): YearLifecycle {
  if (year.is_current) return 'active';
  return year.status === 'closed' ? 'closed' : 'draft';
}

export const LIFECYCLE_LABEL: Readonly<Record<YearLifecycle, string>> = { draft: 'Draft', active: 'Active', closed: 'Closed' };

export const LIFECYCLE_TONE = { draft: 'amber', active: 'green', closed: 'grey' } as const satisfies Record<YearLifecycle, string>;

// "2027 to 2028" from a start date, the way the school's existing years are named.
export function suggestedYearName(startDate: string): string {
  const year = Number(startDate.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? `${year} to ${year + 1}` : '';
}

export const yearCode = (startDate: string, endDate: string): string => `AY${startDate.slice(2, 4)}${endDate.slice(2, 4)}`;
