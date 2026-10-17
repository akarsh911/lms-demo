'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { formatDay } from '@/lib/dates';
import { monthLabel, monthWeeks, monthsOf } from '@/lib/school/events';
import type { AttendanceDayRow } from '@/types/people-detail';

type DayMark = 'present' | 'half' | 'absent' | 'none';

const MARK = {
  present: { label: 'Present', tone: 'green' },
  half: { label: 'Half day', tone: 'amber' },
  absent: { label: 'Absent', tone: 'red' },
  none: { label: 'No school', tone: 'grey' },
} as const satisfies Record<DayMark, { label: string; tone: string }>;

const markOf = (row: AttendanceDayRow | undefined): DayMark => {
  if (!row) return 'none';
  const halves = [row.forenoon_status, row.afternoon_status].filter(Boolean);
  if (halves.length === 0) return 'none';
  const away = halves.filter((h) => h === 'absent').length;
  return away === 0 ? 'present' : away === halves.length ? 'absent' : 'half';
};

interface Tally {
  school: number;
  present: number;
  half: number;
  absent: number;
  pct: number | null;
}

const tally = (marks: readonly DayMark[]): Tally => {
  const school = marks.filter((m) => m !== 'none').length;
  const present = marks.filter((m) => m === 'present').length;
  const half = marks.filter((m) => m === 'half').length;
  const absent = marks.filter((m) => m === 'absent').length;
  return { school, present, half, absent, pct: school === 0 ? null : Math.round(((present + half / 2) / school) * 1000) / 10 };
};

const pctColour = (pct: number | null) => (pct === null ? 'text.disabled' : pct < 75 ? 'error.main' : pct < 90 ? 'warning.dark' : 'success.main');
const shortMonth = (month: string): string => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

// The year's attendance: a month calendar beside a bar per month. A bar opens its month; an absent day opens its reason.
export function AttendanceDetail({ rows, from, to, isPending, hasMore }: { rows: readonly AttendanceDayRow[]; from: string; to: string; isPending: boolean; hasMore: boolean }): React.ReactElement {
  const theme = useTheme();
  const byDate = React.useMemo(() => new Map(rows.map((row) => [(row.attendance_date ?? '').slice(0, 10), row])), [rows]);
  const months = React.useMemo(() => monthsOf(from, to), [from, to]);
  const [month, setMonth] = React.useState(() => months[months.length - 1] ?? to.slice(0, 7));
  const [open, setOpen] = React.useState<{ anchor: HTMLElement; date: string } | null>(null);
  const index = months.indexOf(month);

  const year = tally(rows.map((row) => markOf(row)));
  const perMonth = months.map((m) => ({ month: m, ...tally(rows.filter((row) => (row.attendance_date ?? '').startsWith(m)).map((row) => markOf(row))) }));
  const chosen = perMonth.find((m) => m.month === month);
  const toneOf = (pct: number | null): string => (pct === null ? theme.brand.sunken : pct < 75 ? theme.hues.red : pct < 90 ? theme.hues.amber : theme.hues.green);
  const held = perMonth.filter((m): m is typeof m & { pct: number } => m.pct !== null);
  const best = held.reduce<(typeof held)[number] | undefined>((top, m) => (!top || m.pct > top.pct ? m : top), undefined);
  const worst = held.reduce<(typeof held)[number] | undefined>((low, m) => (!low || m.pct < low.pct ? m : low), undefined);
  const closed = perMonth.filter((m) => m.school === 0).map((m) => monthLabel(m.month).split(' ')[0]);
  const unexplained = rows.filter((row) => (row.forenoon_status === 'absent' || row.afternoon_status === 'absent') && !row.reason_code).length;
  const detail = open ? byDate.get(open.date) : undefined;
  const detailMark = markOf(detail);
  const running = month === to.slice(0, 7);

  // When every month scored the same, best and lowest would say the same thing twice.
  const even = best !== undefined && worst !== undefined && best.pct === worst.pct;
  const facts = [
    even
      ? { label: 'Every month', value: `${best.pct}%`, note: `${held.length} months with school` }
      : { label: 'Best month', value: best ? `${shortMonth(best.month)} · ${best.pct}%` : '—' },
    even
      ? { label: 'Days away', value: '0', note: 'Not a single absence' }
      : { label: 'Lowest month', value: worst ? `${shortMonth(worst.month)} · ${worst.pct}%` : '—' },
    { label: 'Unexplained', value: String(unexplained), note: unexplained > 0 ? 'No reason given' : 'All explained' },
  ];

  return (
    <Card>
      <CardHeader
        title="Attendance"
        subheader={`${formatDay(from)} to ${formatDay(to)}${hasMore ? ' · more marks exist than were read' : ''}`}
        action={
          year.pct === null ? undefined : (
            <Stack sx={{ alignItems: 'flex-end' }}>
              <Typography variant="h3" component="p" sx={{ color: pctColour(year.pct) }}>
                {year.pct}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {year.absent + year.half === 0 ? `Never absent in ${year.school} school days` : `${year.absent} absent · ${year.half} half · ${year.school} school days`}
              </Typography>
            </Stack>
          )
        }
      />
      <CardContent>
        {isPending ? (
          <Typography variant="body2" color="text.secondary">
            Reading attendance…
          </Typography>
        ) : year.school === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing has been recorded for this student this year.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', rowGap: 4, columnGap: '12%', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'stretch' }}>
            <Box>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <IconButton size="small" aria-label="Previous month" disabled={index <= 0} onClick={() => setMonth(months[index - 1] ?? month)}>
                  <ChevronLeft size={18} />
                </IconButton>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="subtitle1" component="p">
                    {monthLabel(month)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {chosen && chosen.pct !== null ? (
                      <>
                        <Box component="span" sx={{ fontWeight: 700, color: pctColour(chosen.pct) }}>
                          {chosen.pct}%
                        </Box>{' '}
                        of {chosen.school} {running ? 'days so far' : 'school days'}
                      </>
                    ) : (
                      'No school days'
                    )}
                  </Typography>
                </Box>
                <IconButton size="small" aria-label="Next month" disabled={index >= months.length - 1} onClick={() => setMonth(months[index + 1] ?? month)}>
                  <ChevronRight size={18} />
                </IconButton>
              </Stack>

              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <Typography key={`${d}-${i}`} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontWeight: 600, pb: 0.5 }}>
                    {d}
                  </Typography>
                ))}
                {monthWeeks(month)
                  .flat()
                  .map((date) => {
                    const outside = !date.startsWith(month);
                    const future = date > to;
                    const mark = outside || future ? 'none' : markOf(byDate.get(date));
                    const away = mark === 'absent' || mark === 'half';
                    const sx = {
                      height: 34,
                      borderRadius: '8px',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 12.5,
                      fontWeight: mark === 'none' ? 500 : 600,
                      fontVariantNumeric: 'tabular-nums',
                      bgcolor: mark === 'none' ? 'transparent' : theme.tints[MARK[mark].tone],
                      // Past days with no school are quiet; days not yet come and other months' days are fainter still.
                      color: mark !== 'none' ? theme.onTint[MARK[mark].tone] : outside || future ? 'text.disabled' : 'text.secondary',
                      opacity: outside ? 0.35 : future ? 0.6 : 1,
                      boxShadow: date === to ? `inset 0 0 0 2px ${theme.brand.ink}` : 'none',
                    } as const;
                    return away ? (
                      <ButtonBase key={date} onClick={(event) => setOpen({ anchor: event.currentTarget, date })} aria-label={`${formatDay(date)}, ${MARK[mark].label}: show the reason`} sx={sx}>
                        {Number(date.slice(8, 10))}
                      </ButtonBase>
                    ) : (
                      <Box key={date} sx={sx}>
                        {Number(date.slice(8, 10))}
                      </Box>
                    );
                  })}
              </Box>

              <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, alignItems: 'center' }}>
                {(['present', 'half', 'absent'] as const).map((m) => (
                  <Stack key={m} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: theme.tints[MARK[m].tone], boxShadow: `inset 0 0 0 1px ${theme.onTint[MARK[m].tone]}` }} />
                    <Typography variant="caption" color="text.secondary">
                      {MARK[m].label}
                    </Typography>
                  </Stack>
                ))}
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '3px', boxShadow: `inset 0 0 0 2px ${theme.brand.ink}` }} />
                  <Typography variant="caption" color="text.secondary">
                    Today
                  </Typography>
                </Stack>
              </Stack>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                Click an absent or half day for the reason.
              </Typography>
            </Box>

            <Stack sx={{ minWidth: 0 }}>
              <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 2, minHeight: 50 }}>
                <Typography variant="subtitle1" component="p">
                  By month
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Click a month to open it{closed.length > 0 ? ` · no school in ${closed.join(', ')}` : ''}
                </Typography>
              </Stack>
              <BarChart
                height={210}
                xAxis={[{ data: months.map(shortMonth), categoryGapRatio: 0.5, colorMap: { type: 'ordinal', values: months.map(shortMonth), colors: perMonth.map((m) => (m.month === month ? toneOf(m.pct) : `${toneOf(m.pct)}66`)) } }]}
                yAxis={[{ min: 0, max: 115, position: 'none' }]}
                series={[{ data: perMonth.map((m) => m.pct ?? 0), valueFormatter: (v: number | null) => (v === null ? '' : `${v}%`), barLabel: (item) => (item.value ? `${Math.round(item.value)}%` : ''), barLabelPlacement: 'outside' }]}
                // The whole month's column answers, not only the bar, so a short bar or an empty month is as easy to open.
                onAxisClick={(_, data) => {
                  const next = data ? months[data.dataIndex] : undefined;
                  if (next) setMonth(next);
                }}
                hideLegend
                borderRadius={4}
                margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
                sx={{ cursor: 'pointer', '& .MuiBarChart-label': { fontSize: 11, fontWeight: 700, fill: theme.palette.text.secondary } }}
              />
              <Box component="dl" sx={(t) => ({ m: 0, mt: 2, pt: 1.5, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 2, borderTop: `1px solid ${t.brand.line}` })}>
                {facts.map((fact) => (
                  <Box key={fact.label} sx={{ minWidth: 0 }}>
                    <Typography component="dt" variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {fact.label}
                    </Typography>
                    <Typography component="dd" variant="subtitle1" sx={{ m: 0 }} noWrap>
                      {fact.value}
                    </Typography>
                    {fact.note ? (
                      <Typography variant="caption" color="text.secondary" noWrap component="p">
                        {fact.note}
                      </Typography>
                    ) : null}
                  </Box>
                ))}
              </Box>
            </Stack>
          </Box>
        )}
      </CardContent>

      <Popover open={Boolean(open)} anchorEl={open?.anchor} onClose={() => setOpen(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} transformOrigin={{ vertical: 'top', horizontal: 'center' }}>
        {open ? (
          <Stack spacing={1} sx={{ p: 2, minWidth: 240 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="subtitle2">{formatDay(open.date)}</Typography>
              <EmergeChip label={MARK[detailMark].label} tone={MARK[detailMark].tone} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {detailMark === 'half' ? (detail?.forenoon_status === 'absent' ? 'Away in the morning' : 'Away in the afternoon') : 'Away all day'}
            </Typography>
            <Typography variant="body2">{detail?.reason_code ? `Reason: ${detail.reason_code}` : 'No reason was given.'}</Typography>
            {detail?.remarks ? (
              <Typography variant="body2" color="text.secondary">
                {detail.remarks}
              </Typography>
            ) : null}
          </Stack>
        ) : null}
      </Popover>
    </Card>
  );
}
