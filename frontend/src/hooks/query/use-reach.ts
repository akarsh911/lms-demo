'use client';

import * as React from 'react';

import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useIdentity } from '@/hooks/query/use-identity';
import { reachFrom, type Reach } from '@/lib/reach/reach';

// School-wide when the caller reads every enrolment; otherwise what their roles reach. Undefined while either answer loads.
export function useReach(): Reach | undefined {
  const identity = useIdentity();
  const capabilities = useCapabilities();
  return React.useMemo(() => {
    if (!identity.data || !capabilities.data) return undefined;
    const schoolWide = capabilities.data.capabilities.some((c) => c.key === 'core.enrollments.read_all');
    return reachFrom(identity.data.roles, schoolWide);
  }, [identity.data, capabilities.data]);
}
