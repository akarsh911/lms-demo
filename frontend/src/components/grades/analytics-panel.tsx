'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';

import { EmergeChip } from '@/components/ui/chip';
import type { MarksAnalytics, NamedAverage } from '@/types/grades';

import { pct1, pctTone } from './mark-states';

const count = (n: number): string => n.toLocaleString('en-IN');

// The five numbers a selection comes down to, in one strip.
export function AnalyticsStrip({ analytics }: { analytics: MarksAnalytics }): React.ReactElement {
  const facts = [
    { label: 'Appeared', value: count(analytics.appeared), note: analytics.absent > 0 ? `${analytics.absent} absent or exempt` : 'Everyone marked' },
    { label: 'Average', value: pct1(analytics.average_pct), tone: pctTone(analytics.average_pct) },
    { label: 'Median', value: pct1(analytics.median_pct) },
    { label: 'Pass rate', value: pct1(analytics.pass_pct), note: 'At 33% and above', tone: pctTone(analytics.pass_pct === null ? null : analytics.pass_pct >= 90 ? 90 : analytics.pass_pct >= 70 ? 50 : 10) },
    { label: 'Highest', value: pct1(analytics.highest?.pct), note: analytics.highest ? `${analytics.highest.name} · ${analytics.highest.where}` : undefined },
  ];
  return (
    <Card>
      <Box
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' },
          '& > * + *': { borderLeft: { md: `1px solid ${theme.brand.line}` } },
        })}
      >
        {facts.map((fact) => (
          <Box key={fact.label} sx={{ px: 2.5, py: 2, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {fact.label}
            </Typography>
            <Typography variant="h2" component="p" sx={(theme) => ({ mt: 0.5, color: fact.tone === 'red' ? theme.hues.red : fact.tone === 'green' ? theme.hues.green : 'text.primary' })}>
              {fact.value}
            </Typography>
            {fact.note ? (
              <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
                {fact.note}
              </Typography>
            ) : null}
          </Box>
        ))}
      </Box>
    </Card>
  );
}

// How the marks spread: one bar per band, the fail band in the error colour.
export function BandsChart({ analytics, height = 220 }: { analytics: MarksAnalytics; height?: number }): React.ReactElement {
  const theme = useTheme();
  return (
    <BarChart
      height={height}
      xAxis={[{ data: analytics.bands.map((band) => band.label), colorMap: { type: 'ordinal', colors: [theme.hues.red, theme.hues.amber, theme.palette.primary.light, theme.palette.primary.main, theme.hues.green] } }]}
      series={[{ data: analytics.bands.map((band) => band.count), label: 'Students' }]}
      hideLegend
      borderRadius={6}
      margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
      grid={{ horizontal: true }}
    />
  );
}

// Averages across a set of groups, drawn sideways so names stay readable.
export function AveragesChart({ rows, height }: { rows: readonly NamedAverage[]; height?: number }): React.ReactElement {
  const theme = useTheme();
  const shown = rows.filter((row) => row.average_pct !== null);
  return (
    <BarChart
      height={height ?? Math.max(160, shown.length * 34 + 40)}
      layout="horizontal"
      yAxis={[{ data: shown.map((row) => row.name), width: 120 }]}
      xAxis={[{ min: 0, max: 100, tickNumber: 5, valueFormatter: (v: number) => `${v}%` }]}
      series={[{ data: shown.map((row) => row.average_pct ?? 0), label: 'Average', color: theme.palette.primary.main, valueFormatter: (v: number | null) => pct1(v) }]}
      hideLegend
      borderRadius={6}
      margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
      grid={{ vertical: true }}
    />
  );
}

export function TopStudents({ analytics, onOpen }: { analytics: MarksAnalytics; onOpen?: (studentId: string) => void }): React.ReactElement {
  return (
    <List disablePadding>
      {analytics.top.map((student, index) => (
        <ListItem
          key={student.student_id}
          disableGutters
          divider={index < analytics.top.length - 1}
          sx={{ gap: 1.5, cursor: onOpen ? 'pointer' : undefined }}
          onClick={onOpen ? () => onOpen(student.student_id) : undefined}
        >
          <Typography variant="h4" component="span" sx={{ width: 28, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {index + 1}
          </Typography>
          <ListItemText primary={student.name} secondary={student.where} slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'body2' } }} sx={{ my: 0 }} />
          <EmergeChip label={pct1(student.pct)} tone={pctTone(student.pct)} />
        </ListItem>
      ))}
    </List>
  );
}

// The analytics of whatever is selected: distribution always, then the comparison that still has something to compare.
export function AnalyticsPanel({ analytics, subjectChosen, classChosen, onOpenStudent }: { analytics: MarksAnalytics; subjectChosen: boolean; classChosen: boolean; onOpenStudent?: (studentId: string) => void }): React.ReactElement {
  const compare = classChosen && analytics.by_section.length > 1 ? { title: 'By section', rows: analytics.by_section } : !classChosen && analytics.by_class.length > 1 ? { title: 'By class', rows: analytics.by_class } : null;
  const subjects = !subjectChosen && analytics.by_subject.length > 1 ? analytics.by_subject : null;
  return (
    <Stack spacing={2}>
      <AnalyticsStrip analytics={analytics} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, alignItems: 'stretch' }}>
        <Card>
          <CardHeader title="Spread of marks" subheader={`${count(analytics.marked)} marked · ${analytics.bands[0]?.count ?? 0} below the pass mark`} />
          <CardContent>
            <BandsChart analytics={analytics} />
          </CardContent>
        </Card>
        {subjects ? (
          <Card>
            <CardHeader title="By subject" subheader="Average across the selection" />
            <CardContent>
              <AveragesChart rows={subjects} height={220} />
            </CardContent>
          </Card>
        ) : compare ? (
          <Card>
            <CardHeader title={compare.title} subheader="Average across the selection" />
            <CardContent>
              <AveragesChart rows={compare.rows} height={220} />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Top of the selection" subheader="By overall percentage" />
          <CardContent sx={{ pt: 0 }}>
            <TopStudents analytics={analytics} onOpen={onOpenStudent} />
          </CardContent>
        </Card>
      </Box>
      {subjects && compare ? (
        <Card>
          <CardHeader title={compare.title} subheader="Average across the selection" />
          <CardContent>
            <AveragesChart rows={compare.rows} />
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}
