'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, LockOpen, MonitorUp } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { RowMenu } from '@/components/ui/row-menu';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useSetGraspStatus } from '@/hooks/mutation/use-grasp';
import { useGraspCheck } from '@/hooks/query/use-grasp';
import { formatMoment } from '@/lib/dates';
import { countBands } from '@/lib/grasp/score';
import type { Band, GraspAttempt } from '@/types/grasp';

import { AttemptDrawer } from './attempt-drawer';
import { BAND } from './band-meta';
import { BandBoard } from './band-board';
import { ClassRoster } from './class-roster';
import { ShareScreen, spaced } from './share-screen';
import { TopicGaps } from './topic-gaps';

// Ids that finished since this screen first loaded, so a new arrival can be shown arriving.
function useFresh(attempts: readonly GraspAttempt[] | undefined, onArrive: (a: GraspAttempt) => void): ReadonlySet<string> {
  const seen = React.useRef<Set<string> | null>(null);
  const [fresh, setFresh] = React.useState<ReadonlySet<string>>(new Set());
  const arrive = React.useEffectEvent(onArrive);
  React.useEffect(() => {
    if (!attempts) return;
    const done = attempts.filter((a) => a.stage === 'done');
    if (seen.current === null) {
      seen.current = new Set(done.map((a) => a.id));
      return;
    }
    const known = seen.current;
    const added = done.filter((a) => !known.has(a.id));
    if (added.length === 0) return;
    for (const a of added) {
      known.add(a.id);
      arrive(a);
    }
    setFresh((prev) => new Set([...prev, ...added.map((a) => a.id)]));
    const timer = setTimeout(() => setFresh((prev) => new Set([...prev].filter((id) => !added.some((a) => a.id === id)))), 6000);
    return () => clearTimeout(timer);
  }, [attempts]);
  return fresh;
}

export function GraspDashboard({ id }: { id: string }): React.ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const notify = useToast();
  const query = useGraspCheck(id);
  const status = useSetGraspStatus(id);
  const [band, setBand] = React.useState<Band | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const sharing = params.get('share') === '1';
  const setSharing = (on: boolean): void => router.replace(on ? `?share=1` : '?', { scroll: false });
  const fresh = useFresh(query.data?.attempts, (a) => a.verdict && notify(`${a.name} handed in · ${BAND[a.verdict.band].label}`));

  if (query.isPending) return <WidgetLoading rows={8} />;
  if (!query.data) return <WidgetError error={query.error} onRetry={() => void query.refetch()} />;
  const c = query.data;
  const finished = c.attempts.filter((a) => a.stage === 'done');
  const working = c.attempts.length - finished.length;
  const bands = countBands(finished.map((a) => a.verdict));
  const pct = (n: number): string => (finished.length === 0 ? '—' : `${Math.round((n / finished.length) * 100)}%`);
  const open = c.attempts.find((a) => a.id === openId) ?? null;

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="h2" component="h1">
              {c.title}
            </Typography>
            <EmergeChip label={c.status === 'live' ? 'Live' : 'Closed'} tone={c.status === 'live' ? 'green' : 'grey'} dot={c.status === 'live'} />
          </Stack>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {c.subject} · {c.section} · {c.questions.length} questions · readback of {c.checkCount} × {c.seconds}s · set {formatMoment(c.createdAt)}
          </Typography>
        </div>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={(t) => ({ px: 1.75, py: 0.75, borderRadius: 99, border: `1px dashed ${t.brand.line2}`, fontFamily: t.typography.display.fontFamily, fontWeight: 700, letterSpacing: '0.06em' })}>{spaced(c.code)}</Box>
          <Button variant="contained" startIcon={<MonitorUp size={16} />} onClick={() => setSharing(true)} disabled={c.status === 'closed'}>
            Show join screen
          </Button>
          <RowMenu
            trigger="button"
            label="More actions"
            actions={[
              c.status === 'live'
                ? { label: 'Close: stop taking work', icon: <Lock size={16} />, onSelect: () => status.mutate('closed', { onSuccess: () => notify('Closed. The link no longer takes work.') }) }
                : { label: 'Reopen', icon: <LockOpen size={16} />, onSelect: () => status.mutate('live', { onSuccess: () => notify('Reopened') }) },
            ]}
          />
        </Stack>
      </Stack>

      <FactStrip
        facts={[
          { label: 'Joined', value: c.attempts.length, note: working > 0 ? `${working} working now` : 'Nobody mid-way' },
          { label: 'Handed in', value: finished.length, note: 'Each with a readback' },
          { label: 'Understood', value: pct(bands.understood), note: `${bands.understood} students` },
          { label: 'Worth a conversation', value: bands.not_written, note: `${bands.not_learnt} more need reteaching` },
        ]}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
        <BandBoard attempts={c.attempts} selected={band} onSelectBand={setBand} onOpen={setOpenId} freshIds={fresh} />
        <TopicGaps attempts={c.attempts} questions={c.questions} />
      </Box>

      <ClassRoster attempts={c.attempts} band={band} onOpen={setOpenId} freshIds={fresh} />

      <AttemptDrawer check={c} attempt={open} onClose={() => setOpenId(null)} />
      {sharing ? <ShareScreen check={c} onClose={() => setSharing(false)} /> : null}
    </Stack>
  );
}
