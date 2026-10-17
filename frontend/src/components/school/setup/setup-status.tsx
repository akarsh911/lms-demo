import * as React from 'react';
import { CheckCircle2, Circle, CircleAlert } from 'lucide-react';

import type { SetupStatus } from '@/types/foundation';

// The mark differs in shape as well as colour, so the status reads without colour.
export function SetupStatusIcon({ status }: { status: SetupStatus }): React.ReactElement {
  if (status === 'complete') return <CheckCircle2 size={22} aria-hidden />;
  if (status === 'attention') return <CircleAlert size={22} aria-hidden />;
  return <Circle size={22} aria-hidden />;
}
