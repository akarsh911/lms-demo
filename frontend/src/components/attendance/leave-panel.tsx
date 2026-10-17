'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { HeartPulse, House, Plane, Trophy } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { formatDay } from '@/lib/dates';
import type { AttendanceStatus, LeaveKind, StudentLeave } from '@/types/attendance';

const KIND: Readonly<Record<LeaveKind, { icon: React.ReactElement; label: string }>> = {
  medical: { icon: <HeartPulse size={16} />, label: 'Medical' },
  family: { icon: <House size={16} />, label: 'Family' },
  travel: { icon: <Plane size={16} />, label: 'Travel' },
  event: { icon: <Trophy size={16} />, label: 'School event' },
};

// Who is away with the school's knowledge on this day, and why, so the register can be marked without asking.
export function LeavePanel({ leaves, statusOf, editable, onExcuse }: { leaves: readonly StudentLeave[]; statusOf: (studentId: string) => AttendanceStatus | null; editable: boolean; onExcuse: (studentIds: string[]) => void }): React.ReactElement {
  const pending = leaves.filter((l) => l.approved && statusOf(l.student_id) !== 'excused').map((l) => l.student_id);
  return (
    <Card sx={{ position: { lg: 'sticky' }, top: { lg: 0 } }}>
      <CardHeader title="On leave" subheader={`${leaves.length} ${leaves.length === 1 ? 'student' : 'students'} away with notice`} />
      <Stack>
        {leaves.map((l) => {
          const marked = statusOf(l.student_id);
          return (
            <Stack key={l.id} direction="row" spacing={1.5} sx={(theme) => ({ px: 2.5, py: 1.75, borderBottom: `1px solid ${theme.brand.line}` })}>
              <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 32, height: 32, flexShrink: 0, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints.blue, color: theme.onTint.blue })}>{KIND[l.kind].icon}</Box>
              <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" noWrap>
                    {l.name}
                  </Typography>
                  {l.roll ? (
                    <Typography variant="caption" color="text.secondary">
                      Roll {l.roll}
                    </Typography>
                  ) : null}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {l.reason}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {l.from === l.to ? formatDay(l.from) : `${formatDay(l.from)} – ${formatDay(l.to)}`}
                  </Typography>
                  <EmergeChip label={l.approved ? 'Approved' : 'Awaiting approval'} tone={l.approved ? 'green' : 'amber'} />
                  {marked === 'excused' ? <EmergeChip label="Marked excused" tone="blue" /> : null}
                </Stack>
              </Stack>
            </Stack>
          );
        })}
      </Stack>
      {editable && pending.length > 0 ? (
        <Box sx={{ p: 2 }}>
          <Button fullWidth variant="outlined" onClick={() => onExcuse(pending)}>
            Mark {pending.length} approved {pending.length === 1 ? 'leave' : 'leaves'} as excused
          </Button>
        </Box>
      ) : null}
    </Card>
  );
}
