import { capabilityFor, showsSubsetOfSchool } from '@/lib/core/fields';
import type { Capability } from '@/types/core';

export type ReadReach = 'unknown' | 'denied' | 'school_wide' | 'narrowed';

export function readReach(
  capabilities: readonly Capability[] | undefined,
  key: string,
): ReadReach {
  if (!capabilities) return 'unknown';
  const held = capabilityFor(capabilities, key);
  if (!held) return 'denied';
  return showsSubsetOfSchool(held) ? 'narrowed' : 'school_wide';
}

export interface EmptyReadings {
  school_wide: string;
  narrowed: string;
  unknown: string;
  denied: string;
}

export function emptyListMessage(reach: ReadReach, readings: EmptyReadings): string {
  return readings[reach];
}

export function partialListMessage(
  reach: ReadReach,
  shown: number,
  narrowed: string,
): string | null {
  return reach === 'narrowed' && shown > 0 ? narrowed : null;
}
