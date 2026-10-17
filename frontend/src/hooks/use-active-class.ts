'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Today, as the calendar on the wall has it.
 *
 * `new Date().toISOString()` is UTC: east of Greenwich it rolls over early and
 * west of it late, so a teacher in India opening attendance in the morning was
 * shown YESTERDAY and marked the wrong register.
 */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The class and date a section is currently showing.
 *
 * Both live in the URL as search params, not in React state. That is a
 * deliberate routing decision, not an accident:
 *
 *   - a teacher can bookmark or share "Class 10, last Tuesday"
 *   - browser Back steps through the classes they looked at
 *   - a refresh keeps the view instead of resetting to today
 *   - two tabs can sit on different classes without fighting
 *
 * Held in a search param rather than a path segment because a class is a FILTER
 * over a section, not a different section. Path segments are for things that
 * are their own place; params are for which slice of a place you are looking at.
 *
 * This is also where a `scoped_grant_needs_context` feature gets its context:
 * the class id chosen here is what would be sent to CAS as `context` when
 * asking about a scoped grant.
 */
export function useActiveClass(): { classId: string | null; date: string } {
  const params = useSearchParams();
  return {
    classId: params.get('classId'),
    date: params.get('date') ?? todayIso(),
  };
}
