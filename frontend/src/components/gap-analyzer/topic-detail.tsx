'use client';

import * as React from 'react';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Info } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { percent } from '@/lib/gap-analyzer/model';
import type { TopicAnalysis } from '@/types/gap-analyzer';

import { EvidenceList } from './evidence-list';
import { MoreActions } from './more-actions';
import { PrimaryAction } from './primary-action';
import { TREND_LABEL } from './status';
import { StatusChip } from './status-chip';
import { TrendSparkline } from './trend-sparkline';
import type { GapLinks } from './use-gap-links';

function Reasons({ reasons }: { reasons: readonly string[] }): React.ReactElement {
  return (
    <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
      {reasons.map((reason) => (
        <Typography key={reason} component="li" variant="caption">
          {reason}
        </Typography>
      ))}
    </Stack>
  );
}

export function TopicDetail({ topic, chapterTitle, links, headingId }: { topic: TopicAnalysis; chapterTitle: string; links: GapLinks; headingId: string }): React.ReactElement {
  const [headline, ...why] = topic.reasons;
  const [first, ...rest] = topic.actions;
  return (
    <>
      <CardHeader
        title={
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <span id={headingId}>{topic.title}</span>
            <StatusChip status={topic.status} />
          </Stack>
        }
        subheader={`${chapterTitle} · ${headline ?? ''}`}
        action={<PrimaryAction action={first} links={links} />}
      />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <Typography variant="h2" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {percent(topic.score)}
            </Typography>
            <TrendSparkline points={topic.trend_points} trend={topic.trend} status={topic.status} width={160} height={40} tooltip />
            <Tooltip title={<Reasons reasons={why} />}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }} tabIndex={0} aria-label={why.join(' ')}>
                <EmergeChip label={`${topic.confidence_band} confidence · ${TREND_LABEL[topic.trend].toLowerCase()}`} tone="grey" />
                <Info size={16} aria-hidden />
              </Stack>
            </Tooltip>
          </Stack>
          <MoreActions actions={rest} links={links} />
          <EvidenceList evidence={topic.evidence} actions={topic.actions} links={links} />
        </Stack>
      </CardContent>
    </>
  );
}
