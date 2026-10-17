'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import visuallyHidden from '@mui/utils/visuallyHidden';
import { Pencil, Plus, TreePalm, Trash2 } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { RowMenu } from '@/components/ui/row-menu';
import { SearchField } from '@/components/ui/search-field';
import { useToast } from '@/components/ui/toast';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useRemoveHoliday } from '@/hooks/mutation/use-foundation';
import { useWorkingWeek } from '@/hooks/query/use-foundation';
import { useBranches, useCalendarDays } from '@/hooks/query/use-school';
import { dateInput, formatDay } from '@/lib/dates';
import { groupHolidays, type Holiday } from '@/lib/school/holidays';
import { weekdayOf } from '@/lib/school/working-week';
import type { AcademicSession } from '@/types/mdm';

import { HolidayDialog } from './holiday-dialog';
import { useYearReadOnly } from './year-mode';

const span = (holiday: Holiday): string =>
  holiday.from === holiday.to ? formatDay(holiday.from) : `${formatDay(holiday.from)} to ${formatDay(holiday.to)}`;

export function HolidaysTab({ year }: { year: AcademicSession }): React.ReactElement {
  const branches = useBranches();
  const branchId = branches.data?.rows[0]?.id ?? null;
  const calendar = useCalendarDays(branchId, dateInput(year.start_date), dateInput(year.end_date));
  const week = useWorkingWeek(year.id);
  const remove = useRemoveHoliday();
  const notify = useToast();
  const readOnly = useYearReadOnly();

  const [search, setSearch] = React.useState('');
  const [editing, setEditing] = React.useState<Holiday | 'new' | null>(null);
  const [removing, setRemoving] = React.useState<Holiday | null>(null);

  const days = React.useMemo(() => calendar.data ?? [], [calendar.data]);
  const holidays = React.useMemo(() => groupHolidays(days), [days]);
  const needle = search.trim().toLowerCase();
  const shown = needle === '' ? holidays : holidays.filter((holiday) => holiday.name.toLowerCase().includes(needle));
  const total = holidays.reduce((sum, holiday) => sum + holiday.days.length, 0);

  const add = (
    <Button variant="outlined" size="small" startIcon={<Plus size={16} />} onClick={() => setEditing('new')} disabled={!branchId}>
      Add Holiday
    </Button>
  );
  const pending = branches.isPending || (Boolean(branchId) && calendar.isPending);
  const failed = branches.error ?? calendar.error;

  return (
    <Card>
      <CardHeader title="Holidays" subheader="Days the whole school is closed" />
      <CardContent>
        <Stack spacing={2}>
          {pending ? <WidgetLoading rows={5} /> : null}
          {failed ? <WidgetError error={failed} onRetry={() => void calendar.refetch()} /> : null}

          {!pending && !failed && holidays.length === 0 ? (
            <EmptyState
              art={<TreePalm size={40} aria-hidden />}
              title="No holidays yet"
              body={readOnly ? 'No holidays were recorded for this year.' : 'Add the days the school is closed so attendance and the timetable skip them.'}
              action={readOnly ? undefined : add}
            />
          ) : null}

          {holidays.length > 0 ? (
            <>
              <CardToolbar
                start={<SearchField label="Search holidays" value={search} onChange={setSearch} />}
                summary={`${holidays.length} ${holidays.length === 1 ? 'holiday' : 'holidays'} · ${total} days closed`}
              >
                {readOnly ? null : add}
              </CardToolbar>

              {shown.length === 0 ? (
                <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <WidgetEmpty message="No holidays match your search." />
                  <Button size="small" variant="outlined" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                </Stack>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Holiday</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Applies to</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Notes</TableCell>
                        {readOnly ? null : (
                          <TableCell align="right">
                            <Box component="span" sx={visuallyHidden}>
                              More
                            </Box>
                          </TableCell>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {shown.map((holiday) => (
                        <TableRow key={holiday.key} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {span(holiday)}
                            {holiday.days.length > 1 ? (
                              <Typography variant="body2" color="text.secondary">
                                {holiday.days.length} days
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Typography variant="subtitle1" component="span">
                              {holiday.name}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Whole school</TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: holiday.notes ? 'text.primary' : 'text.secondary' }}>
                            {holiday.notes || 'None'}
                          </TableCell>
                          {readOnly ? null : (
                            <TableCell align="right">
                              <RowMenu
                                label={`More actions for ${holiday.name}`}
                                actions={[
                                  { label: 'Edit holiday', icon: <Pencil size={16} />, onSelect: () => setEditing(holiday) },
                                  { label: 'Remove holiday', icon: <Trash2 size={16} />, destructive: true, onSelect: () => setRemoving(holiday) },
                                ]}
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          ) : null}
        </Stack>
      </CardContent>

      {editing && branchId ? (
        <HolidayDialog
          year={year}
          branchId={branchId}
          holiday={editing === 'new' ? undefined : editing}
          holidays={holidays}
          calendar={days}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          body={
            removing.days.length === 1
              ? 'That date follows the working week again.'
              : `Those ${removing.days.length} dates follow the working week again.`
          }
          confirmLabel="Remove holiday"
          pending={remove.isPending}
          error={remove.error}
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            remove.mutate(
              // A date the working week does not cover goes back to being a day off, not a school day.
              removing.days.map((day) => ({ id: day.id, working: week.data?.days[weekdayOf(day.calendar_date ?? '')] ?? true })),
              {
                onSuccess: () => {
                  notify('Holiday removed');
                  setRemoving(null);
                },
              },
            )
          }
        />
      ) : null}
    </Card>
  );
}
