'use client';

import { useCapabilities } from '@/hooks/query/use-capabilities';
import { capabilityFor } from '@/lib/core/fields';

export interface ResultGrants {
  mayWrite: boolean;
  mayDelete: boolean;
  mayReadExams: boolean;
  mayReadAssignments: boolean;
}

export function useResultGrants(): ResultGrants {
  const capabilities = useCapabilities();
  const held = (key: string): boolean =>
    !capabilities.data ||
    capabilityFor(capabilities.data.capabilities, key) !== undefined;

  return {
    mayWrite: held('core.subject_offerings.write'),
    mayDelete: held('core.subject_offerings.delete'),
    mayReadExams: held('core.timetable.read'),
    mayReadAssignments: held('core.assignments.read'),
  };
}
