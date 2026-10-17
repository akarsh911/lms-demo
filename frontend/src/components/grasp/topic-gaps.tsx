'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ProgressBar } from '@/components/ui/progress';
import type { GraspAttempt, GraspQuestion } from '@/types/grasp';

interface Gap {
  topic: string;
  question: number;
  asked: number;
  missed: number;
}

function gapsOf(attempts: readonly GraspAttempt[], questions: readonly GraspQuestion[]): Gap[] {
  const numberOf = new Map(questions.map((q) => [q.id, q.number]));
  const gaps = new Map<string, Gap>();
  for (const a of attempts) {
    if (!a.verdict) continue;
    for (const item of a.items) {
      if (item.kind !== 'fast') continue;
      const g = gaps.get(item.topic) ?? { topic: item.topic, question: numberOf.get(item.questionId) ?? 0, asked: 0, missed: 0 };
      g.asked += 1;
      if (a.responses.find((r) => r.itemId === item.id)?.choice !== item.answer) g.missed += 1;
      gaps.set(item.topic, g);
    }
  }
  return [...gaps.values()].filter((g) => g.asked >= 2).sort((x, y) => y.missed / y.asked - x.missed / x.asked);
}

export function TopicGaps({ attempts, questions }: { attempts: readonly GraspAttempt[]; questions: readonly GraspQuestion[] }): React.ReactElement {
  const gaps = gapsOf(attempts, questions).slice(0, 6);
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="What to reteach" subheader="Ideas students could not read back from their own answers." />
      <Stack spacing={1.75} sx={{ px: 2.5, pt: 2, pb: 2.5 }}>
        {gaps.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Appears once a few students have handed in.
          </Typography>
        ) : (
          gaps.map((g) => {
            const pct = Math.round((g.missed / g.asked) * 100);
            return (
              <Box key={g.topic}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5, gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {g.topic}{' '}
                    <Typography component="span" variant="caption" color="text.secondary">
                      Q{g.question}
                    </Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 'none' }}>
                    {pct}% missed · {g.asked} asked
                  </Typography>
                </Stack>
                <ProgressBar value={pct} tone={pct >= 50 ? 'coral' : pct >= 30 ? 'amber' : 'green'} />
              </Box>
            );
          })
        )}
      </Stack>
    </Card>
  );
}
