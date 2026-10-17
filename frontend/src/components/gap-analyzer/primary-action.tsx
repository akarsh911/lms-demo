'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { ArrowRight } from 'lucide-react';
import NextLink from 'next/link';

import { EmergeChip } from '@/components/ui/chip';
import type { GapAction } from '@/types/gap-analyzer';

import { ACTION_ICONS, ACTION_LABELS } from './actions';
import type { GapLinks } from './use-gap-links';

export function PrimaryAction({ action, links, contained = true }: { action: GapAction | undefined; links: GapLinks; contained?: boolean }): React.ReactElement | null {
  if (!action) return null;
  const Icon = ACTION_ICONS[action.kind];
  const href = links.action(action);
  const tip = `${action.title}: ${action.reason}`;
  return (
    <Tooltip title={tip}>
      {href ? (
        <Button component={NextLink} href={href} aria-label={action.title} variant={contained ? 'contained' : 'outlined'} size="small" startIcon={<Icon size={16} aria-hidden />} endIcon={<ArrowRight size={14} aria-hidden />}>
          {ACTION_LABELS[action.kind]}
        </Button>
      ) : (
        <span tabIndex={0} aria-label={tip}>
          <EmergeChip label={ACTION_LABELS[action.kind]} tone="grey" icon={<Icon size={14} aria-hidden />} />
        </span>
      )}
    </Tooltip>
  );
}
