'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';

import { useToast } from '@/components/ui/toast';
import { useApplyNextYearProposal } from '@/hooks/mutation/use-structure';
import { useNextYearProposal } from '@/hooks/query/use-structure';

// A year being set up: last year's pupils who are moving up, proposed into the section of the same letter.
export function NextYearPanel({ yearId, gradeId, className }: { yearId: string; gradeId: string; className: string }): React.ReactElement | null {
  const notify = useToast();
  const proposal = useNextYearProposal(yearId, gradeId, true);
  const apply = useApplyNextYearProposal(yearId, gradeId);
  if (!proposal.data || proposal.data.moves.length === 0) return null;
  const into = new Map<string, number>();
  for (const move of proposal.data.moves) into.set(move.to_section ?? 'Unassigned', (into.get(move.to_section ?? 'Unassigned') ?? 0) + 1);

  return (
    <Alert
      severity="info"
      variant="outlined"
      action={
        <Button
          variant="contained"
          size="small"
          loading={apply.isPending}
          onClick={() =>
            apply.mutate(
              proposal.data.moves.map((m) => ({ enrollment_id: m.enrollment_id, to_section_id: m.to_section_id })),
              { onSuccess: (made) => notify(`${made} students enrolled in ${className}`) },
            )
          }
        >
          Enrol Them
        </Button>
      }
    >
      <AlertTitle>{proposal.data.moves.length} students from last year are waiting for {className}</AlertTitle>
      {proposal.data.summary} {[...into].map(([section, n]) => `${section} ${n}`).join(' · ')}. They land on the board below, where any can be moved before the year begins.
    </Alert>
  );
}
