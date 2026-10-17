'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { Divider, EmergeChip, Row } from '@/components/ui';
import { useLabAttempts } from '@labs/hooks/query/use-lab-attempts';
import { formatRelativeTime } from '@/lib/dates';
import type { WidgetProps } from '@/types/widget';

import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';

/**
 * The student's recent attempts at the Ohm's law bench.
 *
 * A card beside an immersive widget on the same page: the bench saves an
 * attempt through `useSubmitLabAttempt`, which invalidates the labs cache, so a
 * row appears here the moment the viva ends.
 */
/** How a score reads to a student, as a share of what was available. */
function verdict(score: number, max: number): { tone: 'green' | 'amber' | 'red'; label: string } {
  const share = max > 0 ? score / max : 0;
  if (share >= 0.85) return { tone: 'green', label: 'Excellent' };
  if (share >= 0.65) return { tone: 'amber', label: 'Good' };
  return { tone: 'red', label: 'Practise again' };
}

export function LabAttemptsWidget({ title }: WidgetProps): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useLabAttempts('ohms-law');
  const attempts = data?.attempts.slice(0, 5) ?? [];

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title={title} subheader="Verification of Ohm’s Law" slotProps={{ title: { variant: 'h4' } }} />
      <CardContent>
        {isPending ? <WidgetLoading rows={3} /> : null}
        {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}
        {data && attempts.length === 0 ? (
          <WidgetEmpty message="No attempts yet. Finish the viva on the bench above and your score appears here." />
        ) : null}
        {attempts.map((a, i) => (
          <React.Fragment key={a.id}>
            {i > 0 ? <Divider /> : null}
            <Row
              title={`${a.score} / ${a.max}`}
              subtitle={`${formatRelativeTime(a.submittedAt)} · took ${a.time} · bench #${a.benchSeed}`}
              trailing={
                // Graded on the PROPORTION scored: comparing a raw score to 85
                // would mis-grade the moment a bench is marked out of anything
                // but 100.
                <EmergeChip
                  tone={verdict(a.score, a.max).tone}
                  label={verdict(a.score, a.max).label}
                />
              }
            />
          </React.Fragment>
        ))}
      </CardContent>
    </Card>
  );
}
