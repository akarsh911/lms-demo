'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useFeeOverview } from '@/hooks/query/use-school-life';

import { rupees } from './my-fees';

// The office's fee book: billed and collected so far, and every family behind, the longest first.
export function FeesOverview(): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useFeeOverview();
  if (isPending) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;
  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Billed, Terms 1 and 2', value: rupees(data.billed), note: 'Every enrolled pupil' },
          { label: 'Collected', value: rupees(data.collected), note: `${Math.round((data.collected / Math.max(1, data.billed)) * 100)}% of billed` },
          { label: 'Outstanding', value: rupees(data.outstanding), note: 'With late fees' },
          { label: 'Families behind', value: data.families_behind, note: `${data.over_60} more than 60 days` },
        ]}
      />
      <Card>
        <CardHeader title="Families behind on fees" subheader="Longest overdue first; reminders are sent from Actions" />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Pupil</TableCell>
                <TableCell>Class</TableCell>
                <TableCell>Owed for</TableCell>
                <TableCell align="right">Days overdue</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Late fee</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.defaulters.map((d) => (
                <TableRow key={d.student_id}>
                  <TableCell sx={{ fontWeight: 500 }}>{d.student}</TableCell>
                  <TableCell>{d.section}</TableCell>
                  <TableCell>{d.term}</TableCell>
                  <TableCell align="right">
                    <EmergeChip label={String(d.days_overdue)} tone={d.days_overdue > 60 ? 'red' : d.days_overdue > 30 ? 'amber' : 'grey'} />
                  </TableCell>
                  <TableCell align="right">{rupees(d.amount)}</TableCell>
                  <TableCell align="right">{d.late_fee > 0 ? rupees(d.late_fee) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
}
