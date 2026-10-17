'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { ClipboardPen, Plus, RotateCcw, ScanEye, Timer } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { RowMenu } from '@/components/ui/row-menu';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useResetGraspDemo } from '@/hooks/mutation/use-grasp';
import { useGraspChecks } from '@/hooks/query/use-grasp';
import { formatRelativeTime } from '@/lib/dates';
import { paths } from '@/paths';
import type { GraspCheckSummary } from '@/types/grasp';

import { BAND, BANDS } from './band-meta';
import { spaced } from './share-screen';

const STEPS = [
  { icon: <ClipboardPen size={20} />, title: 'Set the work', body: 'Type questions, pick from the bank, or upload the paper you already have.' },
  { icon: <ScanEye size={20} />, title: 'Students hand in', body: 'One link or code, no accounts. Type each answer or photograph the sheet.' },
  { icon: <Timer size={20} />, title: 'Seven-second readback', body: 'Questions built from their own answer. Whoever wrote it reads it back. Whoever pasted it cannot.' },
];

function BandBar({ s }: { s: GraspCheckSummary }): React.ReactElement {
  const total = BANDS.reduce((n, b) => n + s.bands[b], 0);
  return (
    <Box sx={(t) => ({ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', bgcolor: t.brand.sunken })}>
      {total > 0
        ? BANDS.map((b) => (
            <Tooltip key={b} title={`${BAND[b].label}: ${s.bands[b]}`}>
              <Box sx={(t) => ({ width: `${(s.bands[b] / total) * 100}%`, bgcolor: t.onTint[BAND[b].tone] })} />
            </Tooltip>
          ))
        : null}
    </Box>
  );
}

export function GraspHome({ personaSlug }: { personaSlug: string }): React.ReactElement {
  const notify = useToast();
  const query = useGraspChecks();
  const reset = useResetGraspDemo();
  const base = paths.personaSection(personaSlug, 'grasp');

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <Typography variant="h2" component="h1">
            GRASP
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '68ch', mt: 0.5 }}>
            A captcha for understanding. At hand-in, each student reads back their own answer in a few seven-second questions, and you see who understood what they submitted.
          </Typography>
        </div>
        <Stack direction="row" spacing={1}>
          <RowMenu trigger="button" label="More" actions={[{ label: 'Reset demo data', icon: <RotateCcw size={16} />, onSelect: () => reset.mutate(undefined, { onSuccess: () => notify('Demo data restored') }) }]} />
          <Button component={Link} href={`${base}/new`} variant="contained" startIcon={<Plus size={16} />}>
            New GRASP check
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        {STEPS.map((s, i) => (
          <Card key={s.title} sx={{ p: 2.25 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
              <Box sx={(t) => ({ width: 40, height: 40, borderRadius: `${t.band.radius.sm}px`, bgcolor: t.tints.rose, color: t.onTint.rose, display: 'grid', placeItems: 'center', flex: 'none' })}>{s.icon}</Box>
              <div>
                <Typography variant="h6" component="h2">
                  {i + 1}. {s.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {s.body}
                </Typography>
              </div>
            </Stack>
          </Card>
        ))}
      </Box>

      {query.isPending ? <WidgetLoading rows={4} /> : null}
      {query.isError ? <WidgetError error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.data ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, gap: 2 }}>
          {query.data.map((s) => (
            <Card key={s.id}>
              <CardActionArea component={Link} href={`${base}/${s.id}`} sx={{ p: 2.25, height: '100%', alignItems: 'stretch' }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <EmergeChip label={s.status === 'live' ? 'Live' : 'Closed'} tone={s.status === 'live' ? 'green' : 'grey'} dot={s.status === 'live'} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: (t) => t.typography.display.fontFamily, letterSpacing: '0.06em' }}>
                      {spaced(s.code)}
                    </Typography>
                  </Stack>
                  <div>
                    <Typography variant="h5" component="h2">
                      {s.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {s.subject} · {s.section} · {formatRelativeTime(s.createdAt)}
                    </Typography>
                  </div>
                  <BandBar s={s} />
                  <Typography variant="body2" color="text.secondary">
                    {s.finished} handed in{s.joined > s.finished ? ` · ${s.joined - s.finished} working` : ''} · <b>{s.bands.understood}</b> understood · <b>{s.bands.not_written}</b> worth a conversation
                  </Typography>
                </Stack>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      ) : null}
    </Stack>
  );
}
