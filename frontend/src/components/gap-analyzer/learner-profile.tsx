'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Dog, Send, Sparkles, X } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { useToast } from '@/components/ui/toast';
import { percent } from '@/lib/gap-analyzer/model';
import { paths } from '@/paths';
import type { ClassAnalysis, ClassCell } from '@/types/gap-analyzer';

const mean = (values: readonly number[]): number | null => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function Bars({ mine, cls }: { mine: number | null; cls: number | null }): React.ReactElement {
  return (
    <Stack spacing={0.5} sx={{ flex: 1 }}>
      <Box sx={(t) => ({ height: 8, borderRadius: 99, bgcolor: t.brand.sunken, overflow: 'hidden' })}>
        <Box sx={(t) => ({ height: '100%', width: `${(mine ?? 0) * 100}%`, bgcolor: (mine ?? 0) < 0.5 ? t.onTint.coral : (mine ?? 0) < 0.7 ? t.onTint.amber : t.onTint.green })} />
      </Box>
      <Box sx={(t) => ({ height: 4, borderRadius: 99, bgcolor: t.brand.sunken, overflow: 'hidden' })}>
        <Box sx={(t) => ({ height: '100%', width: `${(cls ?? 0) * 100}%`, bgcolor: t.brand.line2 })} />
      </Box>
    </Stack>
  );
}

// One learner in one subject: where they stand against the class, chapter by chapter, and what to do next.
export function LearnerProfile({ analysis, studentId, onClose }: { analysis: ClassAnalysis; studentId: string | null; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const slug = usePathname().split('/')[2] ?? '';
  const learner = analysis.learners.find((l) => l.student_id === studentId) ?? null;
  const scored = (c: ClassCell): c is ClassCell & { score: number } => c.topic_specific && c.score !== null && c.status !== 'not_taught';
  const all = analysis.cells.filter(scored);
  const mine = all.filter((c) => c.student_id === studentId);
  const title = new Map(analysis.topics.map((t) => [t.topic_id, t]));
  const avg = mean(mine.map((c) => c.score));
  const classAvg = mean(all.map((c) => c.score));
  const gaps = mine.filter((c) => c.status === 'gap');
  const risk = mine.filter((c) => c.status === 'at_risk');
  const weakest = [...mine].sort((a, b) => a.score - b.score).slice(0, 3);
  const strongest = [...mine].sort((a, b) => b.score - a.score).slice(0, 3);
  const chapters = analysis.chapters.map((ch) => {
    const ids = new Set(ch.topic_ids);
    return { title: ch.title, mine: mean(mine.filter((c) => ids.has(c.topic_id)).map((c) => c.score)), cls: mean(all.filter((c) => ids.has(c.topic_id)).map((c) => c.score)) };
  }).filter((ch) => ch.mine !== null);
  const first = learner?.name.split(' ')[0] ?? '';

  return (
    <Drawer anchor="right" open={learner !== null} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 } } } }}>
      {learner ? (
        <Stack spacing={2.5} sx={{ p: 3, pr: 3.5 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Typography variant="h3" component="h2">
                {learner.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {analysis.section.label} · Roll {learner.roll_number ?? '—'} · {analysis.subject.name}
              </Typography>
            </div>
            <IconButton aria-label="Close" onClick={onClose}>
              <X />
            </IconButton>
          </Stack>

          <FactStrip
            facts={[
              { label: 'Average', value: percent(avg), note: `Class ${percent(classAvg)}` },
              { label: 'Gaps', value: gaps.length, note: `${risk.length} at risk` },
              { label: 'Topics seen', value: mine.length, note: 'With evidence' },
            ]}
          />

          <Box sx={(t) => ({ p: 2, borderRadius: `${t.band.radius.md}px`, bgcolor: t.tints.violet })}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Sparkles size={16} />
              <Typography variant="subtitle2">In one line</Typography>
            </Stack>
            <Typography variant="body2">
              {gaps.length === 0
                ? `${first} is secure across ${analysis.subject.name}. Stretch them with harder problems.`
                : `${first} is ${avg !== null && classAvg !== null && avg >= classAvg ? 'above' : 'below'} the class average. Start with ${title.get(weakest[0]?.topic_id ?? '')?.title ?? 'the weakest topic'}; it is the lowest score and drags the chapter down.`}
            </Typography>
          </Box>

          <div>
            <Typography variant="h5" component="h3" sx={{ mb: 1 }}>
              Chapter by chapter
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Thick bar: {first}. Thin bar: class average.
            </Typography>
            <Stack spacing={1.25} sx={{ mt: 1 }}>
              {chapters.map((ch) => (
                <Stack key={ch.title} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ width: 170, flex: 'none' }} noWrap title={ch.title}>
                    {ch.title}
                  </Typography>
                  <Bars mine={ch.mine} cls={ch.cls} />
                  <Typography variant="caption" sx={{ width: 36, textAlign: 'right' }}>
                    {percent(ch.mine)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </div>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 3 }}>
            <div>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Needs work
              </Typography>
              <Stack spacing={0.75}>
                {weakest.map((c) => (
                  <Stack key={c.topic_id} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="body2" noWrap>
                      {title.get(c.topic_id)?.title}
                    </Typography>
                    <EmergeChip label={percent(c.score)} tone={c.score < 0.5 ? 'red' : 'amber'} />
                  </Stack>
                ))}
              </Stack>
            </div>
            <div>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Strongest
              </Typography>
              <Stack spacing={0.75}>
                {strongest.map((c) => (
                  <Stack key={c.topic_id} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="body2" noWrap>
                      {title.get(c.topic_id)?.title}
                    </Typography>
                    <EmergeChip label={percent(c.score)} tone="green" />
                  </Stack>
                ))}
              </Stack>
            </div>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" startIcon={<Sparkles size={16} />} onClick={() => notify(`Practice on ${title.get(weakest[0]?.topic_id ?? '')?.title ?? 'weak topics'} assigned to ${first}`)}>
              Assign practice
            </Button>
            <Button variant="outlined" component={NextLink} href={paths.personaSection(slug, 'jerry')} startIcon={<Dog size={16} />}>
              Ask Jerry to help
            </Button>
            <Button variant="outlined" startIcon={<Send size={16} />} onClick={() => notify(`Progress note sent to ${first}'s parents`)}>
              Share with parents
            </Button>
          </Stack>
        </Stack>
      ) : null}
    </Drawer>
  );
}
