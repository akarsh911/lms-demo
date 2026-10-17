'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import visuallyHidden from '@mui/utils/visuallyHidden';
import { BellRing, Copy, Pencil, Plus, Star, Trash2 } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { RowMenu } from '@/components/ui/row-menu';
import { useToast } from '@/components/ui/toast';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { PERIOD_KIND_LABELS } from '@/constants/school';
import { useDeleteSchedule, useRemoveBellSlot, useSetDefaultSchedule } from '@/hooks/mutation/use-foundation';
import { useBellPeriods, useBellSchedules, useBranches, usePeriodSchemes, usePeriods } from '@/hooks/query/use-school';
import { clockOf } from '@/lib/dates';
import { durationOf, slotsOf, type BellSlot } from '@/lib/school/bell-slots';
import type { AcademicSession } from '@/types/mdm';
import type { BellSchedule } from '@/types/school';

import { BellSlotDialog } from './bell-slot-dialog';
import { ScheduleDialog } from './schedule-dialog';
import { ScheduleListItem } from './schedule-list-item';
import { useYearReadOnly } from './year-mode';

type ScheduleForm = { mode: 'add' } | { mode: 'rename' | 'copy'; bell: BellSchedule };

// Bell schedules for one year: pick a schedule on the left, edit its slots on the right. Every change saves as it is made.
export function BellSchedulesTab({ year }: { year: AcademicSession }): React.ReactElement {
  const branches = useBranches();
  const branchId = branches.data?.rows[0]?.id ?? null;
  const schemes = usePeriodSchemes(branchId);
  // A year has one shape of day here; a second scheme in the same year is a class-level matter for a later screen.
  const scheme = schemes.data?.rows.find((row) => row.academic_session_id === year.id);
  const schemeId = scheme?.id ?? null;
  const bells = useBellSchedules(schemeId);
  const periods = usePeriods(schemeId);

  const [picked, setPicked] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<ScheduleForm | null>(null);
  const [slotForm, setSlotForm] = React.useState<BellSlot | 'new' | null>(null);
  const [deleting, setDeleting] = React.useState<BellSchedule | null>(null);

  const schedules = bells.data?.rows ?? [];
  const current = schedules.find((bell) => bell.id === picked) ?? schedules.find((bell) => bell.is_default) ?? schedules[0];
  const times = useBellPeriods(current?.id ?? null);
  const periodRows = periods.data?.rows ?? [];
  const slots = slotsOf(periodRows, times.data?.rows ?? []);

  const setDefault = useSetDefaultSchedule();
  const removeSlot = useRemoveBellSlot();
  const removeSchedule = useDeleteSchedule();
  const notify = useToast();
  const readOnly = useYearReadOnly();

  const pending = branches.isPending || (Boolean(branchId) && schemes.isPending) || (Boolean(schemeId) && bells.isPending);
  const failed = branches.error ?? schemes.error ?? bells.error;
  if (pending) return <WidgetLoading rows={6} />;
  if (failed) return <WidgetError error={failed} onRetry={() => void bells.refetch()} />;

  const dialogs = (
    <>
      {form && branchId ? (
        <ScheduleDialog
          yearId={year.id}
          branchId={branchId}
          schemeId={schemeId}
          schedules={schedules}
          rename={form.mode === 'rename' ? form.bell : undefined}
          copyOf={form.mode === 'copy' ? form.bell : undefined}
          onClose={() => setForm(null)}
          onCreated={(bell) => setPicked(bell.id)}
        />
      ) : null}
    </>
  );

  if (schedules.length === 0 || !current) {
    return (
      <Card>
        <EmptyState
          art={<BellRing size={40} aria-hidden />}
          title="No bell schedule yet"
          body={readOnly ? 'No bell schedule was recorded for this year.' : 'Define the school day before building a timetable.'}
          action={
            readOnly ? undefined : (
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setForm({ mode: 'add' })} disabled={!branchId}>
                Create Bell Schedule
              </Button>
            )
          }
        />
        {dialogs}
      </Card>
    );
  }

  const isDefault = Boolean(current.is_default);

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '300px minmax(0, 1fr)' }, alignItems: 'start' }}>
      <Card>
        <CardHeader title="Schedules" />
        <List disablePadding sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }} aria-label="Bell schedules">
          {schedules.map((bell) => (
            <ScheduleListItem key={bell.id} bell={bell} periods={periodRows} selected={bell.id === current.id} onSelect={() => setPicked(bell.id)} />
          ))}
        </List>
        {readOnly ? null : (
          <Box sx={{ p: 2, pt: 1 }}>
            <Button fullWidth variant="outlined" startIcon={<Plus size={16} />} onClick={() => setForm({ mode: 'add' })}>
              Add Schedule
            </Button>
          </Box>
        )}
      </Card>

      <Card>
        <CardHeader
          title={
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <span>{current.name ?? current.code}</span>
              {isDefault ? <EmergeChip label="Default" tone="green" /> : null}
            </Stack>
          }
          subheader={isDefault ? 'Used on every working day unless another is chosen' : 'Used only on the days it is chosen for'}
          action={
            readOnly ? undefined : (
            <>
              <Button variant="contained" size="small" startIcon={<Plus size={16} />} onClick={() => setSlotForm('new')}>
                Add Slot
              </Button>
              <RowMenu
                label={`More actions for ${current.name}`}
                actions={[
                  {
                    label: 'Set as default',
                    icon: <Star size={16} />,
                    disabled: isDefault,
                    hint: 'This is already the default',
                    onSelect: () =>
                      setDefault.mutate(
                        { id: current.id, previousId: schedules.find((bell) => bell.is_default)?.id },
                        { onSuccess: () => notify(`${current.name} is now the default schedule`) },
                      ),
                  },
                  { label: 'Rename', icon: <Pencil size={16} />, onSelect: () => setForm({ mode: 'rename', bell: current }) },
                  { label: 'Duplicate', icon: <Copy size={16} />, onSelect: () => setForm({ mode: 'copy', bell: current }) },
                  {
                    label: 'Delete',
                    icon: <Trash2 size={16} />,
                    destructive: true,
                    disabled: isDefault && schedules.length > 1,
                    hint: 'Make another schedule the default first',
                    onSelect: () => setDeleting(current),
                  },
                ]}
              />
            </>
            )
          }
        />
        <CardContent>
          {times.isPending ? <WidgetLoading rows={6} /> : null}
          {times.isError ? <WidgetError error={times.error} onRetry={() => void times.refetch()} /> : null}
          {removeSlot.isError ? <WidgetError error={removeSlot.error} /> : null}
          {times.data && slots.length === 0 ? <WidgetEmpty message="This schedule has no slots yet. Add the first one, usually assembly or period 1." /> : null}

          {slots.length > 0 ? (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Label</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Start</TableCell>
                    <TableCell>End</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Duration</TableCell>
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
                  {slots.map((slot) => (
                    <TableRow key={slot.bellPeriodId} hover={!readOnly} onClick={readOnly ? undefined : () => setSlotForm(slot)} sx={{ cursor: readOnly ? 'default' : 'pointer' }}>
                      <TableCell>
                        <Typography variant="subtitle1" component="span">
                          {slot.label}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <EmergeChip label={slot.kind === 'teaching' ? 'Teaching Period' : (PERIOD_KIND_LABELS[slot.kind] ?? slot.kind)} tone={slot.kind === 'teaching' ? 'blue' : 'grey'} />
                      </TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{clockOf(slot.start)}</TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{clockOf(slot.end)}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>{durationOf(slot)}</TableCell>
                      {readOnly ? null : (
                      <TableCell align="right">
                        <RowMenu
                          label={`More actions for ${slot.label}`}
                          actions={[
                            { label: 'Edit slot', icon: <Pencil size={16} />, onSelect: () => setSlotForm(slot) },
                            {
                              label: 'Remove from this schedule',
                              icon: <Trash2 size={16} />,
                              destructive: true,
                              onSelect: () => removeSlot.mutate(slot.bellPeriodId, { onSuccess: () => notify('Bell schedule updated') }),
                            },
                          ]}
                        />
                      </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}
        </CardContent>
      </Card>

      {dialogs}

      {slotForm && schemeId ? (
        <BellSlotDialog
          schemeId={schemeId}
          bellId={current.id}
          scheduleName={current.name ?? 'This'}
          slot={slotForm === 'new' ? undefined : slotForm}
          slots={slots}
          periods={periodRows}
          onClose={() => setSlotForm(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          body="The schedule and its times are removed. Days that used it fall back to the default schedule."
          confirmLabel="Delete schedule"
          pending={removeSchedule.isPending}
          error={removeSchedule.error}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            removeSchedule.mutate(deleting.id, {
              onSuccess: () => {
                notify('Bell schedule deleted');
                setPicked(null);
                setDeleting(null);
              },
            })
          }
        />
      ) : null}
    </Box>
  );
}
