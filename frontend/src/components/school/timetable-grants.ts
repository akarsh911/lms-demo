'use client';

import { useCapabilities } from '@/hooks/query/use-capabilities';
import { capabilityFor } from '@/lib/core/fields';

export interface TimetableGrants {
  mayWrite: boolean;
  mayDelete: boolean;
  mayGenerate: boolean;
}

export function useTimetableGrants(): TimetableGrants {
  const capabilities = useCapabilities();
  const held = (key: string): boolean =>
    !capabilities.data ||
    capabilityFor(capabilities.data.capabilities, key) !== undefined;

  return {
    mayWrite: held('core.timetable.write'),
    mayDelete: held('core.timetable.delete'),
    mayGenerate: held('core.timetable.generate'),
  };
}
