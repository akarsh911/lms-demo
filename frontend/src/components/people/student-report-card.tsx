'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import NextLink from 'next/link';

import { useResultGrants } from '@/components/school/results/result-grants';
import { EmergeChip } from '@/components/ui/chip';
import { useReportCard } from '@/hooks/query/use-report-card';
import { reportStatusTally } from '@/lib/results/report-card';
import { paths } from '@/paths';

import { Panel, PanelNote } from './panel';

const PROVISIONAL_NOTE =
  'A mark behind one of these subjects is auto-marked and still waiting for a teacher, so a total on the card can still move.';

export function StudentReportCard({
  studentId,
  personaSlug,
}: {
  studentId: string;
  personaSlug: string;
}): React.ReactElement | null {
  const grants = useResultGrants();
  const card = useReportCard(studentId, null, grants.mayReadExams);

  if (!grants.mayReadExams) return null;

  const tally = reportStatusTally(card.data?.subjects_by_status);
  const noSession = card.error?.status === 400 ? card.error.message : undefined;

  return (
    <Panel
      title="Report card"
      note="Every subject this pupil takes this session on one page, with each subject's grade named only where it can be."
      blocked={noSession}
      isPending={card.isPending}
      error={card.error}
      isEmpty={card.data?.count === 0}
      empty={
        card.data?.reason ??
        'This pupil takes no subject you can read for this session, so there is nothing to report.'
      }
      denied="You do not have permission to read this pupil's results, so no report card can be assembled."
      onRetry={() => void card.refetch()}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
          {tally.map((entry) => (
            <EmergeChip
              key={entry.status}
              label={`${entry.label} ${entry.count}`}
              tone={entry.tone}
              dot
            />
          ))}
        </Stack>

        {card.data?.provisional ? <PanelNote>{PROVISIONAL_NOTE}</PanelNote> : null}

        {card.data && !card.data.covers_every_subject && card.data.coverage_reason ? (
          <PanelNote>{card.data.coverage_reason}</PanelNote>
        ) : null}

        <Box>
          <Button
            component={NextLink}
            href={paths.studentReportCard(personaSlug, studentId)}
            variant="outlined"
            size="small"
          >
            Open the report card
          </Button>
        </Box>
      </Stack>
    </Panel>
  );
}
