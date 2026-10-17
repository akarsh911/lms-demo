'use client';

import * as React from 'react';

import { EmergeChip } from '@/components/ui/chip';
import { SOURCE_LABELS } from '@/lib/gap-analyzer/model';
import type { GapSource } from '@/types/gap-analyzer';

import { SOURCE_TONES } from './status';

export function SourceBadge({ source }: { source: GapSource }): React.ReactElement {
  return <EmergeChip label={SOURCE_LABELS[source]} tone={SOURCE_TONES[source]} />;
}
