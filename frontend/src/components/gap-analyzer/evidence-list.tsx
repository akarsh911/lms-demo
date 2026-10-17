'use client';

import * as React from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import NextLink from 'next/link';

import { pctTone } from '@/components/grades/mark-states';
import { EmergeChip } from '@/components/ui/chip';
import { formatShortDate } from '@/lib/dates';
import { SOURCE_LABELS, percent } from '@/lib/gap-analyzer/model';
import type { GapAction, WeighedEvidence } from '@/types/gap-analyzer';

import type { GapLinks } from './use-gap-links';

export function EvidenceList({ evidence, actions, links }: { evidence: readonly WeighedEvidence[]; actions: readonly GapAction[]; links: GapLinks }): React.ReactElement | null {
  if (evidence.length === 0) return null;
  return (
    <List disablePadding aria-label="Evidence">
      {evidence.map((row, index) => {
        const href = links.evidence(row.ref, actions);
        const text = (
          <ListItemText
            primary={row.ref.title}
            secondary={`${SOURCE_LABELS[row.source]} · ${row.label} · ${formatShortDate(row.date)}`}
            slotProps={{ primary: { variant: 'subtitle2', noWrap: true }, secondary: { variant: 'body2', noWrap: true } }}
            sx={{ my: 0, minWidth: 0 }}
          />
        );
        const signal = <EmergeChip label={percent(row.signal)} tone={pctTone(row.signal * 100)} />;
        return (
          <Tooltip key={row.id} title={row.detail} placement="left">
            {href ? (
              <ListItemButton component={NextLink} href={href} divider={index < evidence.length - 1} sx={{ gap: 1.5, px: 1, borderRadius: 2 }}>
                {text}
                {signal}
              </ListItemButton>
            ) : (
              <ListItem divider={index < evidence.length - 1} sx={{ gap: 1.5, px: 1 }} tabIndex={0}>
                {text}
                {signal}
              </ListItem>
            )}
          </Tooltip>
        );
      })}
    </List>
  );
}
