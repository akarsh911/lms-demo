'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { trimNumber } from '@/lib/exams/exam';
import {
  combinesLine,
  compositionGaps,
  gapName,
  marksOf,
  outcomeLabel,
  outcomeNote,
  outcomeTone,
  scoreScale,
  sourceMarkText,
  sourceName,
  standingChips,
  type CompositionGaps,
} from '@/lib/results/outcome';
import type { PupilResult, ResultComponentOutcome } from '@/types/results';

export function ResultScore({
  pupil,
  gaps,
}: {
  pupil: PupilResult;
  gaps: CompositionGaps;
}): React.ReactElement {
  const scale = scoreScale(pupil.result);
  const chips = standingChips(pupil, gaps.whole);

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.5 }}
    >
      <Typography
        variant="body2"
        sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
      >
        {marksOf(pupil.result.score, scale.assessed)}
      </Typography>
      {chips.map((chip) => (
        <EmergeChip key={chip.key} label={chip.label} tone={chip.tone} dot />
      ))}
    </Stack>
  );
}

export function ResultBreakdown({
  pupil,
  composition,
  showGaps = true,
}: {
  pupil: PupilResult;
  composition: CompositionGaps | undefined;
  showGaps?: boolean;
}): React.ReactElement {
  const gaps = composition ?? compositionGaps(undefined);
  const result = pupil.result;
  const scale = scoreScale(result);
  const chips = standingChips(pupil, gaps.whole);
  const components = [...result.components].sort((a, b) => a.position - b.position);

  return (
    <Stack spacing={2}>
      <Stack spacing={0.75}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <Typography
            variant="h3"
            component="p"
            sx={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {trimNumber(result.score)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            out of {trimNumber(scale.assessed)}
          </Typography>
          {chips.map((chip) => (
            <EmergeChip key={chip.key} label={chip.label} tone={chip.tone} dot />
          ))}
        </Stack>

        {chips.map((chip) => (
          <Typography key={chip.key} variant="body2" color="text.secondary">
            {chip.note}
          </Typography>
        ))}

        {scale.short ? (
          <Typography variant="body2" color="text.secondary">
            The scheme behind this subject is out of {trimNumber(scale.scheme)}, and{' '}
            {trimNumber(result.component_total)} of it is set for this subject.
          </Typography>
        ) : null}

        {scale.excused ? (
          <Typography variant="body2" color="text.secondary">
            Parts of this scheme are excused for this pupil, so the total above is out
            of {trimNumber(scale.assessed)} rather than{' '}
            {trimNumber(result.component_total)}.
          </Typography>
        ) : null}
      </Stack>

      <Stack component="ul" spacing={0} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {components.map((component) => (
          <ComponentBlock key={component.id} component={component} />
        ))}
      </Stack>

      {showGaps && gaps.components.length > 0 ? (
        <Alert severity="warning" variant="outlined">
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
            {gaps.components.map((gap) => (
              <Typography component="li" variant="body2" key={gap.id}>
                <strong>{gap.name}</strong> carries {trimNumber(gap.weight)} and was
                left out of this subject: {gap.reason}
              </Typography>
            ))}
          </Stack>
        </Alert>
      ) : null}

      {showGaps && gaps.sources.length > 0 ? (
        <Alert severity="info" variant="outlined">
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
            {gaps.sources.map((gap) => (
              <Typography
                component="li"
                variant="body2"
                key={`${gap.result_component_id}:${gap.ref.id}`}
              >
                <strong>{gapName(gap)}</strong> feeds {gap.component}: {gap.reason}
              </Typography>
            ))}
          </Stack>
        </Alert>
      ) : null}
    </Stack>
  );
}

function ComponentBlock({
  component,
}: {
  component: ResultComponentOutcome;
}): React.ReactElement {
  return (
    <Box
      component="li"
      sx={{
        py: 1.5,
        borderTop: '1px solid',
        borderTopColor: 'divider',
      }}
    >
      <Stack spacing={1}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {component.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {combinesLine(component)}
          </Typography>
          {component.provisional ? (
            <EmergeChip label="Provisional" tone="amber" dot />
          ) : null}
          {component.capped ? <EmergeChip label="Capped at full marks" tone="blue" /> : null}
          {component.excused ? <EmergeChip label="Excused" tone="teal" /> : null}
        </Stack>

        {component.excused ? (
          <Typography variant="body2" color="text.secondary">
            Every sitting this part draws on is excused for this pupil, so its{' '}
            {trimNumber(component.weight)} is left out rather than scored as a zero.
          </Typography>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontVariantNumeric: 'tabular-nums' }}
          >
            Scored {marksOf(component.obtained_marks, component.maximum_marks)} · counts
            as {marksOf(component.contribution, component.weight)}
          </Typography>
        )}

        <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {component.sources.map((source) => (
            <Box component="li" key={`${source.ref.kind}:${source.ref.id}`}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.5 }}
              >
                <Typography variant="body2">{sourceName(source)}</Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {sourceMarkText(source)}
                </Typography>
                <EmergeChip
                  label={outcomeLabel(source.outcome)}
                  tone={outcomeTone(source.outcome)}
                />
                {source.provisional ? (
                  <EmergeChip label="Provisional" tone="amber" dot />
                ) : null}
              </Stack>
              {source.outcome === 'counted' ? null : (
                <Typography variant="caption" color="text.secondary">
                  {outcomeNote(source.outcome)}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
