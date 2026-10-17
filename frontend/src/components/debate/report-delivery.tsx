'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { CircleCheck, CircleDashed } from 'lucide-react';

import type { DebateReport } from '@/types/debate';

import { ReportSection } from './report-section';

const STRUCTURE: readonly [keyof NonNullable<DebateReport['structure']>, string][] = [
  ['made_clear_claims', 'Made clear claims'],
  ['gave_reasons', 'Gave reasons'],
  ['used_evidence_or_examples', 'Used evidence or examples'],
  ['drew_conclusions', 'Drew conclusions'],
];

export function ReportDelivery({ report }: { report: DebateReport }): React.ReactElement {
  const theme = useTheme();
  const { metrics, observed, interpretation, suggestion } = report.delivery;

  return (
    <Stack spacing={3}>
      {metrics.measured ? (
        <ReportSection title="Delivery notes">
          <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, m: 0 }}>
            {observed.map((line) => (
              <Typography component="li" variant="body2" key={line}>
                {line}
              </Typography>
            ))}
          </Stack>
          {interpretation ? <Typography variant="body2">{interpretation}</Typography> : null}
          {suggestion ? (
            <Typography variant="body2">
              <strong>Try this:</strong> {suggestion}
            </Typography>
          ) : null}
        </ReportSection>
      ) : null}

      {report.structure ? (
        <ReportSection title="Structure">
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 2 }}>
            {STRUCTURE.map(([key, label]) => {
              const met = report.structure?.[key] === true;
              return (
                <Stack key={key} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  {met ? <CircleCheck size={18} color={theme.hues.green} /> : <CircleDashed size={18} color={theme.brand.tert} />}
                  <Typography variant="body2" color={met ? 'text.primary' : 'text.secondary'}>
                    {label}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
          {report.structure.note ? (
            <Typography variant="body2" color="text.secondary">
              {report.structure.note}
            </Typography>
          ) : null}
        </ReportSection>
      ) : null}

      <ReportSection title="Practice plan">
        <Stack component="ol" spacing={0.75} sx={{ pl: 2.5, m: 0 }}>
          {report.practice_plan.map((step) => (
            <Typography component="li" variant="body2" key={step}>
              {step}
            </Typography>
          ))}
        </Stack>
      </ReportSection>

      <ReportSection title="Your next challenge">
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          {report.next_challenge.topic}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {report.next_challenge.duration_minutes} minutes · focus on {report.next_challenge.focus.toLowerCase()}
        </Typography>
      </ReportSection>
    </Stack>
  );
}
