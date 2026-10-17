'use client';

import * as React from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Theme } from '@mui/material/styles';
import { CheckCheck, ChevronLeft, ChevronRight, Save } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMarkAttendance } from '@/hooks/mutation/use-mark-attendance';
import { useStudentLeaves } from '@/hooks/query/use-attendance-day';
import { useAttendanceRoster } from '@/hooks/query/use-attendance-roster';
import { formatLongDate } from '@/lib/dates';
import type { AttendanceStatus } from '@/types/attendance';

import { LeavePanel } from './leave-panel';

const STATUSES: readonly AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];
const LABEL: Readonly<Record<AttendanceStatus, string>> = { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' };
const TINT = { present: 'green', absent: 'red', late: 'amber', excused: 'blue' } as const satisfies Record<AttendanceStatus, string>;
const FILTERS = [
  { value: 'all', label: 'Everyone' },
  { value: 'unmarked', label: 'Not marked' },
  { value: 'absent', label: 'Absent' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

const shift = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const initials = (name: string): string =>
  name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2);

// The register for one section on one day: one tap per student, the leave already known beside it, saved together.
export function AttendanceRegister({ sectionId, label, date, today, onDate, editable }: { sectionId: string; label: string; date: string; today: string; onDate: (next: string) => void; editable: boolean }): React.ReactElement {
  const notify = useToast();
  const roster = useAttendanceRoster(sectionId, date);
  const leaves = useStudentLeaves(sectionId, date);
  const mark = useMarkAttendance(sectionId, date);
  const [draft, setDraft] = React.useState<Record<string, AttendanceStatus>>({});
  const [filter, setFilter] = React.useState<Filter>('all');
  const [search, setSearch] = React.useState('');
  const [scope, setScope] = React.useState(`${sectionId}|${date}`);
  if (scope !== `${sectionId}|${date}`) {
    setScope(`${sectionId}|${date}`);
    setDraft({});
  }

  if (roster.isPending) return <WidgetLoading rows={8} />;
  if (roster.isError) return <WidgetError error={roster.error} onRetry={() => void roster.refetch()} />;

  const entries = roster.data.entries;
  const away = new Map((leaves.data ?? []).map((l) => [l.student_id, l]));
  const statusOf = (id: string, saved: AttendanceStatus | null): AttendanceStatus | null => draft[id] ?? saved;
  const count = (s: AttendanceStatus): number => entries.filter((e) => statusOf(e.studentId, e.status) === s).length;
  const unmarked = entries.filter((e) => !statusOf(e.studentId, e.status));
  const changes = Object.keys(draft).length;
  const q = search.trim().toLowerCase();
  const shown = entries.filter((e, i) => {
    const st = statusOf(e.studentId, e.status);
    return (filter === 'all' || (filter === 'unmarked' ? !st : st === 'absent')) && (!q || e.studentName.toLowerCase().includes(q) || String(i + 1).padStart(2, '0') === q.padStart(2, '0'));
  });
  const set = (id: string, status: AttendanceStatus): void => setDraft((prev) => ({ ...prev, [id]: status }));
  const restPresent = (): void => setDraft((prev) => ({ ...prev, ...Object.fromEntries(unmarked.map((e) => [e.studentId, away.get(e.studentId)?.approved ? 'excused' : 'present'] as const)) }));
  const save = (): void =>
    mark.mutate(
      { classId: sectionId, date, marks: Object.entries(draft).map(([studentId, status]) => ({ studentId, status })) },
      { onSuccess: () => (notify(`Register saved for ${label}`), setDraft({})) },
    );
  const segments = [...STATUSES.map((s) => ({ key: s, n: count(s), tint: TINT[s] })), { key: 'unmarked', n: unmarked.length, tint: 'grey' as const }];

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: away.size > 0 ? 'minmax(0, 1fr) 290px' : '1fr' }, alignItems: 'start' }}>
      <Card>
        <CardHeader
          title={`${label} register`}
          subheader={`${formatLongDate(date)}${date === today ? ' · today' : ''}${editable ? '' : ' · marked by the class teacher'}`}
          action={
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <IconButton aria-label="Previous day" onClick={() => onDate(shift(date, -1))}>
                <ChevronLeft size={18} />
              </IconButton>
              <TextField size="small" type="date" value={date} onChange={(e) => onDate(e.target.value || today)} slotProps={{ htmlInput: { max: today, 'aria-label': 'Day' } }} sx={{ width: 160 }} />
              <IconButton aria-label="Next day" disabled={date >= today} onClick={() => onDate(shift(date, 1))}>
                <ChevronRight size={18} />
              </IconButton>
              {date !== today ? (
                <Button size="small" variant="outlined" onClick={() => onDate(today)}>
                  Today
                </Button>
              ) : null}
            </Stack>
          }
        />

        <Stack spacing={1.25} sx={{ px: 3, py: 2 }}>
          <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: (theme: Theme) => theme.brand.sunken }}>
            {segments.map((s) => (s.n > 0 ? <Box key={s.key} sx={(theme) => ({ width: `${(s.n / Math.max(1, entries.length)) * 100}%`, bgcolor: s.key === 'unmarked' ? 'transparent' : theme.onTint[s.tint], opacity: 0.8 })} /> : null))}
          </Box>
          <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2.5, rowGap: 0.5 }}>
            {segments.map((s) => (
              <Stack key={s.key} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Box sx={(theme) => ({ width: 8, height: 8, borderRadius: '50%', bgcolor: s.key === 'unmarked' ? theme.brand.line2 : theme.onTint[s.tint] })} />
                <Typography variant="body2" color="text.secondary">
                  {s.key === 'unmarked' ? 'Not marked' : LABEL[s.key as AttendanceStatus]}
                </Typography>
                <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {s.n}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>

        <CardToolbar start={<Segmented<Filter> ariaLabel="Show" value={filter} onChange={setFilter} options={FILTERS} />} summary={`${shown.length} of ${entries.length}`}>
          <SearchField label="Name or roll number" value={search} onChange={setSearch} width={200} />
          {editable ? (
            <Button size="small" variant="outlined" startIcon={<CheckCheck size={14} />} disabled={unmarked.length === 0} onClick={restPresent}>
              Mark the rest present
            </Button>
          ) : null}
        </CardToolbar>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: away.size > 0 ? '1fr' : '1fr 1fr' } }}>
          {shown.map((e) => {
            const index = entries.indexOf(e);
            const status = statusOf(e.studentId, e.status);
            const leave = away.get(e.studentId);
            const changed = draft[e.studentId] !== undefined;
            return (
              <Stack
                key={e.studentId}
                direction="row"
                spacing={1.5}
                sx={(theme) => ({ alignItems: 'center', pl: 3, pr: 2, py: 1.1, borderBottom: `1px solid ${theme.brand.line}`, boxShadow: changed ? `inset 3px 0 0 ${theme.palette.primary.main}` : 'none' })}
              >
                <Typography variant="caption" color="text.secondary" sx={{ width: 22, fontVariantNumeric: 'tabular-nums' }}>
                  {String(index + 1).padStart(2, '0')}
                </Typography>
                <Avatar sx={(theme) => ({ width: 30, height: 30, fontSize: 11, bgcolor: status ? theme.tints[TINT[status]] : theme.brand.sunken, color: status ? theme.onTint[TINT[status]] : 'text.secondary' })}>{initials(e.studentName)}</Avatar>
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {e.studentName}
                  </Typography>
                  {leave ? (
                    <Tooltip title={`${leave.reason} · ${leave.from} to ${leave.to}`}>
                      <Typography variant="caption" color="info.main" noWrap>
                        On leave{leave.approved ? '' : ' (not approved yet)'}: {leave.reason}
                      </Typography>
                    </Tooltip>
                  ) : null}
                </Stack>
                {editable ? (
                  <ToggleButtonGroup exclusive size="small" value={status} onChange={(_, next: AttendanceStatus | null) => next && set(e.studentId, next)} aria-label={`Attendance for ${e.studentName}`}>
                    {STATUSES.map((s) => (
                      <ToggleButton
                        key={s}
                        value={s}
                        aria-label={LABEL[s]}
                        sx={(theme) => ({ width: 34, px: 0, fontWeight: 700, '&.Mui-selected, &.Mui-selected:hover': { bgcolor: theme.tints[TINT[s]], color: theme.onTint[TINT[s]] } })}
                      >
                        {LABEL[s][0]}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                ) : (
                  <EmergeChip label={status ? LABEL[status] : 'Not marked'} tone={status ? TINT[status] : 'grey'} />
                )}
              </Stack>
            );
          })}
          {shown.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
              {filter === 'unmarked' ? 'Everyone is marked.' : filter === 'absent' ? 'Nobody is absent.' : 'Nobody matches.'}
            </Typography>
          ) : null}
        </Box>

        {editable ? (
          <Stack direction="row" spacing={1} sx={(theme) => ({ position: 'sticky', bottom: 0, zIndex: 1, alignItems: 'center', px: 3, py: 1.5, bgcolor: theme.brand.surface, borderTop: `1px solid ${theme.brand.line}` })}>
            <Typography variant="body2" color={changes > 0 ? 'text.primary' : 'text.secondary'} sx={{ flex: 1, fontWeight: changes > 0 ? 600 : 400 }}>
              {changes === 0 ? (unmarked.length === 0 ? 'Register complete' : `${unmarked.length} still to mark`) : `${changes} unsaved ${changes === 1 ? 'change' : 'changes'}`}
            </Typography>
            <Button variant="outlined" disabled={changes === 0} onClick={() => setDraft({})}>
              Discard
            </Button>
            <Button variant="contained" startIcon={<Save size={16} />} disabled={changes === 0} loading={mark.isPending} onClick={save}>
              Save Register
            </Button>
          </Stack>
        ) : null}
      </Card>

      {away.size > 0 ? (
        <LeavePanel
          leaves={leaves.data ?? []}
          statusOf={(id) => statusOf(id, entries.find((e) => e.studentId === id)?.status ?? null)}
          editable={editable}
          onExcuse={(ids) => setDraft((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, 'excused' as const])) }))}
        />
      ) : null}
    </Box>
  );
}

