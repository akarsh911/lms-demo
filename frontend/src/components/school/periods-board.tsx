'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Plus } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { Grid, SectionHeader } from '@/components/ui/layout';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { PERIOD_KIND_LABELS } from '@/constants/school';
import { useSaveBellPeriod, useDeleteBellPeriod } from '@/hooks/mutation/use-school';
import { useBellPeriods, useBellSchedules, usePeriods } from '@/hooks/query/use-school';
import { bellByPeriod, periodsInOrder } from '@/lib/school/grid';
import { clockToMinutes, durationLabel, minutesToClock, spanLength } from '@/lib/school/time';
import { BellDialog } from './bell-dialog';
import { PeriodDialog } from './period-dialog';
import { useTimetableGrants } from './timetable-grants';
import type { BellSchedulePeriod, Period } from '@/types/school';

/**
 * The shape of a school day: the pattern of periods, and the clocks that are
 * laid over it.
 *
 * Two panels because they are two different things, and conflating them is the
 * mistake the schema exists to prevent. The PATTERN — assembly, six lessons,
 * two breaks — is abstract and has no times. A BELL SCHEDULE gives that pattern
 * times, and a school has more than one: Regular and Saturday run the same nine
 * periods at different clocks, and a school with an examination timetable has a
 * third. Times on the pattern would need a second pattern to say that.
 */
export function PeriodsBoard({ schemeId }: { schemeId: string }): React.ReactElement {
  const grants = useTimetableGrants();

  const periods = usePeriods(schemeId);
  const ordered = periodsInOrder(periods.data?.rows ?? []);

  const bells = useBellSchedules(schemeId);
  const bellRows = bells.data?.rows ?? [];

  const [editingPeriod, setEditingPeriod] = React.useState<Period | 'new' | null>(null);
  const [editingBell, setEditingBell] = React.useState<string | 'new' | null>(null);
  const [chosenBell, setChosenBell] = React.useState<string | null>(null);

  const bellId =
    bellRows.find((row) => row.id === chosenBell)?.id ??
    bellRows.find((row) => row.is_default)?.id ??
    bellRows[0]?.id ??
    null;
  const bell = bellRows.find((row) => row.id === bellId);
  const nextSequence =
    ordered.length === 0 ? 1 : Math.max(...ordered.map((row) => row.sequence ?? 0)) + 1;

  return (
    <Stack spacing={2.5}>
      <Grid cols={2}>
        <Card>
          <CardContent>
            <SectionHeader
              title="Periods"
              subtitle="The pattern of the day. No times live here."
              actions={
                grants.mayWrite ? (
                  <Button
                    size="small"
                    startIcon={<Plus size={16} />}
                    onClick={() => setEditingPeriod('new')}
                  >
                    Add
                  </Button>
                ) : undefined
              }
            />

            {periods.isPending ? <WidgetLoading rows={5} /> : null}
            {periods.isError ? (
              <WidgetError error={periods.error} onRetry={() => void periods.refetch()} />
            ) : null}

            {periods.data && ordered.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No periods yet. Add the first one and the rest follow it in order.
              </Typography>
            ) : null}

            {ordered.length > 0 ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Period</TableCell>
                    <TableCell>Kind</TableCell>
                    <TableCell align="right">Edit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ordered.map((period) => (
                    <TableRow key={period.id} hover>
                      <TableCell>{period.sequence}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {period.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {period.code}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <EmergeChip
                          label={PERIOD_KIND_LABELS[period.kind ?? 'teaching']}
                          tone={period.kind === 'teaching' ? 'teal' : 'grey'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {grants.mayWrite ? (
                          <Button size="small" onClick={() => setEditingPeriod(period)}>
                            Edit
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionHeader
              title="Bell schedules"
              subtitle="Times over that pattern. Minutes from midnight, shown as a clock."
              actions={
                grants.mayWrite ? (
                  <Button
                    size="small"
                    startIcon={<Plus size={16} />}
                    onClick={() => setEditingBell('new')}
                  >
                    Add
                  </Button>
                ) : undefined
              }
            />

            <Stack spacing={2}>
              {bells.isPending ? <WidgetLoading rows={2} /> : null}
              {bells.isError ? (
                <WidgetError error={bells.error} onRetry={() => void bells.refetch()} />
              ) : null}

              {bellRows.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <TextField
                    select
                    size="small"
                    label="Bell schedule"
                    value={bellId ?? ''}
                    onChange={(event) => setChosenBell(event.target.value)}
                    sx={{ flex: 1 }}
                  >
                    {bellRows.map((row) => (
                      <MenuItem key={row.id} value={row.id}>
                        {row.name ?? row.code ?? row.id}
                        {row.is_default ? ' (default)' : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                  {grants.mayWrite ? (
                    <Button
                      size="small"
                      sx={{ mt: 0.5 }}
                      disabled={!bell}
                      onClick={() => bell && setEditingBell(bell.id)}
                    >
                      Edit
                    </Button>
                  ) : null}
                </Stack>
              ) : null}

              {bells.data && bellRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No bell schedules yet. Until one exists the periods have no times, and
                  a timetable built on them cannot say when anything happens.
                </Typography>
              ) : null}

              {bellId ? (
                <BellTimes
                  bellId={bellId}
                  bellName={bell?.name ?? bell?.code ?? 'this schedule'}
                  periods={ordered}
                />
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <PeriodDialog
        open={editingPeriod !== null}
        onClose={() => setEditingPeriod(null)}
        schemeId={schemeId}
        period={editingPeriod === 'new' ? undefined : (editingPeriod ?? undefined)}
        nextSequence={nextSequence}
      />

      <BellDialog
        open={editingBell !== null}
        onClose={() => setEditingBell(null)}
        schemeId={schemeId}
        bell={
          editingBell && editingBell !== 'new'
            ? bellRows.find((row) => row.id === editingBell)
            : undefined
        }
        hasDefault={bellRows.some((row) => row.is_default)}
      />
    </Stack>
  );
}

/**
 * The clocks for one bell schedule.
 *
 * Every period in the pattern gets a row, including the ones this bell has no
 * time for. That is the point: a period with no bell row is not a period at
 * midnight, it is a period this schedule does not ring, and a timetable slot in
 * it resolves with `times_resolved: false`. Drawing the row empty says so;
 * leaving the row out would make a missing time look like a missing period.
 */
function BellTimes({
  bellId,
  bellName,
  periods,
}: {
  bellId: string;
  bellName: string;
  periods: readonly Period[];
}): React.ReactElement {
  const rows = useBellPeriods(bellId);
  const times = bellByPeriod(rows.data?.rows ?? []);
  const { mayWrite } = useTimetableGrants();
  const suppressed = [...times.values()].filter((row) => row.runs === false).length;

  if (rows.isPending) return <WidgetLoading rows={4} />;
  if (rows.isError) {
    return <WidgetError error={rows.error} onRetry={() => void rows.refetch()} />;
  }

  return (
    <Stack spacing={1.5}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Period</TableCell>
              <TableCell>Starts</TableCell>
              <TableCell>Ends</TableCell>
              <TableCell>Length</TableCell>
              <TableCell>Rings</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {periods.map((period) => {
              const row = times.get(period.id);
              return (
                // Keyed on the SERVER's values as well as the period, so a saved
                // change remounts the row with the new times as its initial
                // state. Synchronising them in from an effect would cost a second
                // render on every refetch and would throw away a half-typed time
                // if one landed mid-edit.
                <BellTimeRow
                  key={`${period.id}:${row?.start_minute ?? 'x'}:${row?.end_minute ?? 'x'}`}
                  bellId={bellId}
                  period={period}
                  row={row}
                  mayWrite={mayWrite}
                />
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Alert severity="info" variant="outlined">
        {times.size === 0
          ? `No period has a time in ${bellName} yet, so there is nothing to switch off. `
          : suppressed > 0
            ? `${suppressed} ${suppressed === 1 ? 'period does' : 'periods do'} not ring in ${bellName}. `
            : `Every period with a time rings in ${bellName}. `}
        Switching one off suppresses it on every day that runs {bellName}, and on no
        other day. To drop assembly on Tuesdays only, add a second bell schedule with
        assembly switched off and attach it to those days on the Calendar screen. The
        period stays in the pattern either way, so the timetable built on it is
        untouched.
      </Alert>
    </Stack>
  );
}

function BellTimeRow({
  bellId,
  period,
  row,
  mayWrite,
}: {
  bellId: string;
  period: Period;
  row: BellSchedulePeriod | undefined;
  mayWrite: boolean;
}): React.ReactElement {
  const save = useSaveBellPeriod(bellId);
  const remove = useDeleteBellPeriod();

  const [start, setStart] = React.useState(minutesToClock(row?.start_minute));
  const [end, setEnd] = React.useState(minutesToClock(row?.end_minute));

  const startMinute = clockToMinutes(start);
  const endMinute = clockToMinutes(end);
  const ordered = startMinute !== null && endMinute !== null && endMinute > startMinute;
  const changed =
    startMinute !== (row?.start_minute ?? null) || endMinute !== (row?.end_minute ?? null);
  const length = spanLength(row?.start_minute, row?.end_minute);
  const runs = row?.runs !== false;

  return (
    <TableRow hover>
      <TableCell>
        <Typography
          variant="body2"
          sx={{ textDecoration: runs ? 'none' : 'line-through' }}
          color={runs ? 'text.primary' : 'text.secondary'}
        >
          {period.name}
        </Typography>
      </TableCell>
      <TableCell>
        <TextField
          type="time"
          size="small"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': `${period.name} starts` } }}
          sx={{ width: 130 }}
        />
      </TableCell>
      <TableCell>
        <TextField
          type="time"
          size="small"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': `${period.name} ends` } }}
          sx={{ width: 130 }}
        />
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {length === null ? '—' : durationLabel(length)}
        </Typography>
      </TableCell>
      <TableCell>
        <RunsControl
          period={period}
          row={row}
          mayWrite={mayWrite}
          busy={save.isPending}
          onChange={(next) => {
            if (!row || row.start_minute === undefined || row.end_minute === undefined) return;
            save.mutate({
              id: row.id,
              period_id: period.id,
              start_minute: row.start_minute,
              end_minute: row.end_minute,
              runs: next,
            });
          }}
        />
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          {changed && ordered && startMinute !== null && endMinute !== null ? (
            <Button
              size="small"
              variant="contained"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  id: row?.id,
                  period_id: period.id,
                  start_minute: startMinute,
                  end_minute: endMinute,
                })
              }
            >
              Save
            </Button>
          ) : null}
          {changed && !ordered ? (
            <Typography variant="caption" color="error">
              Ends before it starts
            </Typography>
          ) : null}
          {row && !changed ? (
            <Button
              size="small"
              color="error"
              disabled={remove.isPending}
              onClick={() => remove.mutate(row.id)}
            >
              Clear
            </Button>
          ) : null}
        </Stack>
      </TableCell>
    </TableRow>
  );
}
function RunsControl({
  period,
  row,
  mayWrite,
  busy,
  onChange,
}: {
  period: Period;
  row: BellSchedulePeriod | undefined;
  mayWrite: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}): React.ReactElement {
  if (!row) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  const runs = row.runs !== false;

  if (!mayWrite) {
    return (
      <EmergeChip label={runs ? 'Rings' : 'Suppressed'} tone={runs ? 'green' : 'grey'} />
    );
  }

  return (
    <Switch
      size="small"
      checked={runs}
      disabled={busy}
      onChange={(event) => onChange(event.target.checked)}
      slotProps={{
        input: { 'aria-label': `${period.name} rings in this bell schedule` },
      }}
    />
  );
}
