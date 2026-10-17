'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import NextLink from 'next/link';

import { EmergeChip } from '@/components/ui/chip';
import type { GapAction } from '@/types/gap-analyzer';

import { ACTION_ICONS, ACTION_LABELS } from './actions';
import type { GapLinks } from './use-gap-links';

export function MoreActions({ actions, links }: { actions: readonly GapAction[]; links: GapLinks }): React.ReactElement | null {
  if (actions.length === 0) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
      {actions.map((action) => {
        const Icon = ACTION_ICONS[action.kind];
        const href = links.action(action);
        const tip = `${action.title}: ${action.reason}`;
        return (
          <Tooltip key={`${action.kind}-${action.title}`} title={tip}>
            {href ? (
              <Button component={NextLink} href={href} size="small" variant="outlined" aria-label={action.title} startIcon={<Icon size={15} aria-hidden />} sx={{ whiteSpace: 'nowrap' }}>
                {ACTION_LABELS[action.kind]}
              </Button>
            ) : (
              <span tabIndex={0} aria-label={tip}>
                <EmergeChip label={ACTION_LABELS[action.kind]} tone="grey" icon={<Icon size={14} aria-hidden />} />
              </span>
            )}
          </Tooltip>
        );
      })}
    </Stack>
  );
}
