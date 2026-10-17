'use client';

import * as React from 'react';

import { EmergeChip } from '@/components/ui/chip';
import type { GapStatus } from '@/types/gap-analyzer';

import { STATUS_META } from './status';

export function StatusChip({ status }: { status: GapStatus }): React.ReactElement {
  const meta = STATUS_META[status];
  return <EmergeChip label={meta.label} tone={meta.tone} dot />;
}
