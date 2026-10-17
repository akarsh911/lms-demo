import { reachFrom, type Reach } from '@/lib/reach/reach';

import { capabilities, identity } from './identity';

// The caller's reach as emerge-core would apply it, so a fixture answer narrows exactly as the real one will.
export function reachNow(): Reach {
  return reachFrom(identity().roles, capabilities().capabilities.some((c) => c.key === 'core.enrollments.read_all'));
}
