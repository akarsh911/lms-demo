'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import type { DebateReport, ReportArgument } from '@/types/debate';

import { Quote, ReportSection } from './report-section';

const ARGUMENT_FIELDS: readonly [keyof ReportArgument, string][] = [
  ['why_it_worked', 'Why it worked'],
  ['why_strong', 'Why it was strong'],
  ['why_weak', 'Why it was weak'],
  ['what_was_missing', 'What was missing'],
  ['how_to_improve', 'How to improve it'],
  ['how_you_could_have_responded', 'How you could have answered'],
];

function ArgumentCard({ heading, argument, hue }: { heading: string; argument: ReportArgument; hue: string }): React.ReactElement {
  const theme = useTheme();
  return (
    <Box sx={{ border: `1px solid ${theme.brand.line}`, borderTop: `3px solid ${hue}`, borderRadius: `${theme.band.radius.md}px`, p: 2, flex: 1 }}>
      <Typography variant="subtitle2">{heading}</Typography>
      <Quote text={argument.quote} turn={argument.turn} />
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {ARGUMENT_FIELDS.map(([field, label]) => {
          const value = argument[field];
          return typeof value === 'string' && value ? (
            <Typography key={field} variant="body2" color="text.secondary">
              <strong>{label}:</strong> {value}
            </Typography>
          ) : null;
        })}
      </Stack>
    </Box>
  );
}

export function ReportArguments({ report }: { report: DebateReport }): React.ReactElement | null {
  const theme = useTheme();
  const { best_argument: best, weakest_argument: weakest, ai_strongest_counterargument: counter } = report;
  const hasArguments = best || weakest || counter;
  if (!hasArguments && report.improved_arguments.length === 0 && report.fallacies.length === 0) return null;

  return (
    <Stack spacing={3.5}>
      {hasArguments ? (
        <ReportSection title="Arguments">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            {best ? <ArgumentCard heading="Your best argument" argument={best} hue={theme.hues.green} /> : null}
            {weakest ? <ArgumentCard heading="Your weakest argument" argument={weakest} hue={theme.hues.amber} /> : null}
            {counter ? <ArgumentCard heading="Your opponent’s strongest point" argument={counter} hue={theme.hues.violet} /> : null}
          </Stack>
        </ReportSection>
      ) : null}

      {report.improved_arguments.length > 0 ? (
        <ReportSection title="Say it stronger">
          {report.improved_arguments.map((item, i) => (
            <Stack key={`${item.turn}-${i}`} spacing={0.75}>
              <Quote text={item.original} turn={item.turn} />
              <Typography variant="body1" sx={{ borderLeft: `3px solid ${theme.hues.green}`, pl: 1.5 }}>
                {item.stronger_version}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.what_changed}
              </Typography>
            </Stack>
          ))}
        </ReportSection>
      ) : null}

      {report.fallacies.length > 0 ? (
        <ReportSection title="Reasoning to watch">
          {report.fallacies.map((f, i) => (
            <Stack key={`${f.type}-${i}`} spacing={0.5}>
              <Typography variant="subtitle2">{f.label}</Typography>
              <Quote text={f.quote} turn={f.turn} />
              <Typography variant="body2" color="text.secondary">
                {f.why_weak}
              </Typography>
              <Typography variant="body2">
                <strong>Instead:</strong> {f.how_to_improve}
              </Typography>
            </Stack>
          ))}
        </ReportSection>
      ) : null}
    </Stack>
  );
}
