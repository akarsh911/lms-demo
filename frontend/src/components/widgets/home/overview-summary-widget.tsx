'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CalendarDays, ClipboardCheck, GraduationCap, Users } from 'lucide-react';

import { useSchoolOverview } from '@/hooks/query/use-foundation';
import { percentOf } from '@/lib/school/overview';
import type { TintName } from '@/styles/theme/tokens';
import type { WidgetProps } from '@/types/widget';

import { WidgetError } from '../widget-states';

function Cell({
  icon,
  tint,
  label,
  value,
  total,
  context,
}: {
  icon: React.ReactNode;
  tint: TintName;
  label: string;
  value: number;
  total?: number;
  context: string;
}): React.ReactElement {
  return (
    <Stack direction="row" spacing={2} sx={{ px: 3, py: 2.5, minWidth: 0, alignItems: 'center' }}>
      <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 56, height: 56, flex: 'none', borderRadius: `${theme.band.radius.md}px`, bgcolor: theme.tints[tint], color: theme.onTint[tint] })}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary" noWrap>
          {label}
        </Typography>
        <Typography variant="figure" component="p" sx={{ fontSize: 30, mt: 0.25 }}>
          {value.toLocaleString('en-IN')}
          {total === undefined ? null : (
            <Typography component="span" variant="h4" color="text.secondary" sx={{ ml: 0.75 }}>
              / {total.toLocaleString('en-IN')}
            </Typography>
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {context}
        </Typography>
      </Box>
    </Stack>
  );
}

// Four numbers about today, each with what it is out of. No charts: a trend needs history this does not have.
export function OverviewSummaryWidget(_: WidgetProps): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useSchoolOverview();

  if (isPending) return <Skeleton variant="rounded" height={128} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const { students, staff, attendance, events_today: events } = data.summary;
  const pending = attendance.total - attendance.value;

  return (
    <Card>
      <Box
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          '& > * + *': { borderLeft: { lg: `1px solid ${theme.brand.line}` } },
        })}
      >
        <Cell icon={<GraduationCap size={24} aria-hidden />} tint="green" label="Students present today" value={students.value} total={students.total} context={`${percentOf(students.value, students.total)} of the school`} />
        <Cell icon={<Users size={24} aria-hidden />} tint="rose" label="Staff present today" value={staff.value} total={staff.total} context={staff.total === staff.value ? 'Everyone is in' : `${staff.total - staff.value} away`} />
        <Cell icon={<ClipboardCheck size={24} aria-hidden />} tint="blue" label="Attendance submitted" value={attendance.value} total={attendance.total} context={pending === 0 ? 'Every class has submitted' : `${pending} ${pending === 1 ? 'class' : 'classes'} still to submit`} />
        <Cell icon={<CalendarDays size={24} aria-hidden />} tint="orange" label="School events today" value={events} context={events === 0 ? 'Nothing beyond lessons' : 'Listed under Today'} />
      </Box>
    </Card>
  );
}
