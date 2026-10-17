'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Lightbulb, Target, TrendingUp, Users } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { ProgressBar } from '@/components/ui/progress';
import { chapterMarks } from '@/lib/gap-analyzer/board-marks';
import { rootOf } from '@/lib/gap-analyzer/prerequisites';
import { percent } from '@/lib/gap-analyzer/model';
import type { ClassAnalysis, ClassTopicSummary } from '@/types/gap-analyzer';


interface Ranked {
  topic: ClassTopicSummary;
  marks: number;
  atStake: number;
}

// Weakness times what the chapter is worth in the board exam, so a weak 9-mark chapter outranks a weak 4-mark one.
export function rank(analysis: ClassAnalysis): Ranked[] {
  const perChapter = new Map<string, number>();
  for (const topic of analysis.topics) perChapter.set(topic.chapter_id, (perChapter.get(topic.chapter_id) ?? 0) + 1);
  return analysis.topics
    .filter((t) => t.coverage !== 'not_taught' && t.learners_with_data > 0 && t.weak > 0)
    .map((topic) => {
      const marks = chapterMarks(topic.chapter_title) / (perChapter.get(topic.chapter_id) ?? 1);
      return { topic, marks, atStake: marks * topic.weak_share };
    })
    .sort((a, b) => b.atStake - a.atStake);
}

function strugglers(analysis: ClassAnalysis): { name: string; gaps: number }[] {
  const gaps = new Map<string, number>();
  for (const cell of analysis.cells) if (cell.status === 'gap') gaps.set(cell.student_id, (gaps.get(cell.student_id) ?? 0) + 1);
  return analysis.learners
    .map((l) => ({ name: l.name, gaps: gaps.get(l.student_id) ?? 0 }))
    .filter((l) => l.gaps > 0)
    .sort((a, b) => b.gaps - a.gaps);
}

const round = (n: number): string => (n >= 1 ? n.toFixed(1).replace(/\.0$/, '') : n.toFixed(1));

function Insight({ icon, tone, children }: { icon: React.ReactNode; tone: 'rose' | 'amber' | 'green' | 'violet'; children: React.ReactNode }): React.ReactElement {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <Box sx={(t) => ({ width: 34, height: 34, flex: 'none', borderRadius: `${t.band.radius.sm}px`, bgcolor: t.tints[tone], color: t.onTint[tone], display: 'grid', placeItems: 'center' })}>{icon}</Box>
      <Typography variant="body2" sx={{ pt: 0.75 }}>
        {children}
      </Typography>
    </Stack>
  );
}

export function ClassInsights({ analysis }: { analysis: ClassAnalysis }): React.ReactElement | null {
  const ranked = rank(analysis);
  const top = ranked[0];
  if (!top) return null;
  const help = strugglers(analysis);
  const chapters = new Map<string, { title: string; weak: number; data: number }>();
  for (const t of analysis.topics) {
    if (t.learners_with_data === 0 || t.coverage === 'not_taught') continue;
    const c = chapters.get(t.chapter_id) ?? { title: t.chapter_title, weak: 0, data: 0 };
    c.weak += t.weak;
    c.data += t.learners_with_data;
    chapters.set(t.chapter_id, c);
  }
  const strongest = [...chapters.values()].filter((c) => c.data > 0 && c.weak / c.data < 0.25).sort((a, b) => a.weak / a.data - b.weak / b.data)[0];
  const marksAtStake = ranked.slice(0, 5).reduce((sum, r) => sum + r.atStake, 0);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' }, gap: 2 }}>
      <Card>
        <CardHeader title="What this class needs" subheader={`${analysis.subject.name} · read from every record we hold`} />
        <Stack spacing={1.75} sx={{ p: 2.5 }}>
          <Insight icon={<Target size={17} />} tone="rose">
            <b>{top.topic.title}</b> is the biggest gap: {top.topic.weak} of {top.topic.learners_with_data} weak, about <b>{round(top.atStake)} board marks</b> at stake for an average student.
          </Insight>
          {help.length > 0 ? (
            <Insight icon={<Users size={17} />} tone="amber">
              <b>{help.slice(0, 3).map((h) => h.name.split(' ')[0]).join(', ')}</b> need the most help, with {help[0]?.gaps}+ gaps each. {help.filter((h) => h.gaps >= 3).length} students have 3 or more.
            </Insight>
          ) : null}
          {strongest ? (
            <Insight icon={<TrendingUp size={17} />} tone="green">
              <b>{strongest.title}</b> has landed: only {percent(strongest.weak / strongest.data)} of results there are weak.
            </Insight>
          ) : null}
          <Insight icon={<Lightbulb size={17} />} tone="violet">
            Closing the top {Math.min(5, ranked.length)} gaps below is worth roughly <b>{round(marksAtStake)} marks</b> per student in the board exam.
          </Insight>
        </Stack>
      </Card>

      <Card>
        <CardHeader title="Fix these first" subheader="Ranked by how many are weak × what the chapter is worth in the board exam" />
        <Stack spacing={0} sx={{ px: 2.5, pb: 1.5 }}>
          {ranked.slice(0, 5).map((r, i) => (
            <Stack key={r.topic.topic_id} direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={(t) => ({ py: 1.5, alignItems: { md: 'center' }, borderTop: i === 0 ? 'none' : `1px solid ${t.brand.line}` })}>
              <Typography sx={(t) => ({ fontFamily: t.typography.display.fontFamily, fontWeight: 800, fontSize: 20, width: 28, color: i === 0 ? t.palette.primary.main : t.brand.sub })}>{i + 1}</Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="subtitle2" noWrap>
                    {r.topic.title}{' '}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {r.topic.chapter_title}
                    </Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 'none' }}>
                    {r.topic.weak} of {r.topic.learners_with_data} weak
                  </Typography>
                </Stack>
                <Box sx={{ mt: 0.75 }}>
                  <ProgressBar value={r.topic.weak_share * 100} tone={r.topic.weak_share >= 0.45 ? 'coral' : r.topic.weak_share >= 0.3 ? 'amber' : 'gold'} />
                </Box>
                {(() => {
                  const pattern = rootOf(r.topic.title);
                  const root = pattern ? analysis.topics.find((t) => t.topic_id !== r.topic.topic_id && pattern.test(t.title) && t.weak_share >= 0.2) : undefined;
                  return root ? (
                    <Typography variant="caption" sx={(t) => ({ display: 'block', mt: 0.5, color: t.onTint.violet })}>
                      Likely root cause: {root.title} is weak for {root.weak} students too. Fix it first.
                    </Typography>
                  ) : null;
                })()}
              </Box>
              <EmergeChip label={`≈${round(r.atStake)} marks at stake`} tone={i === 0 ? 'rose' : 'grey'} />
            </Stack>
          ))}
        </Stack>
      </Card>
    </Box>
  );
}
