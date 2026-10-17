'use client';

import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ExternalLink } from 'lucide-react';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import type { FactAssessment, FactCheck } from '@/types/debate';

const VERDICT: Record<FactAssessment, { label: string; tone: ChipTone }> = {
  correct: { label: 'Correct', tone: 'green' },
  mostly_correct: { label: 'Mostly correct', tone: 'teal' },
  partially_correct: { label: 'Partly correct', tone: 'amber' },
  incorrect: { label: 'Incorrect', tone: 'red' },
  unverified: { label: 'Unverified', tone: 'grey' },
};

const EMPTY: Record<FactCheck['status'], string> = {
  complete: 'No claims to check.',
  no_claims: 'No checkable claims were made.',
  skipped: 'Skipped: not enough was said.',
  unavailable: 'The reference source could not be reached.',
};

export function factSummary(factCheck: FactCheck): string {
  const n = factCheck.items.length;
  if (n === 0) return EMPTY[factCheck.status];
  const right = factCheck.items.filter((i) => i.assessment === 'correct' || i.assessment === 'mostly_correct').length;
  return `${right} of ${n} claims held up`;
}

export function ReportFactChecks({ factCheck }: { factCheck: FactCheck }): React.ReactElement {
  if (factCheck.items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 2 }}>
        {EMPTY[factCheck.status]}
      </Typography>
    );
  }
  return (
    <List disablePadding sx={{ px: 3, py: 1 }}>
      {factCheck.items.map((item, index) => {
        const verdict = VERDICT[item.assessment];
        const source = item.sources[0];
        return (
          <ListItem key={`${item.turn}-${index}`} disableGutters divider={index < factCheck.items.length - 1} sx={{ gap: 1.5 }}>
            <Tooltip title={[`“${item.quote}”`, item.better_formulation && `Better: ${item.better_formulation}`].filter(Boolean).join('  ')} placement="top-start">
              <ListItemText
                tabIndex={0}
                primary={item.claim}
                secondary={item.explanation}
                slotProps={{ primary: { variant: 'subtitle2', noWrap: true }, secondary: { variant: 'body2', noWrap: true } }}
                sx={{ my: 0, minWidth: 0 }}
              />
            </Tooltip>
            <EmergeChip label={verdict.label} tone={verdict.tone} />
            {source ? (
              <Tooltip title={`${source.title} · ${source.publisher}`}>
                <IconButton size="small" component="a" href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`Source: ${source.title}`}>
                  <ExternalLink size={16} />
                </IconButton>
              </Tooltip>
            ) : null}
          </ListItem>
        );
      })}
    </List>
  );
}
