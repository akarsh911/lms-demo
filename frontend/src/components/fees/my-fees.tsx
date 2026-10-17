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
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMyFees } from '@/hooks/query/use-school-life';
import { formatDay } from '@/lib/dates';
import type { FeeStatus } from '@/types/fees';

export const rupees = (n: number): string => `₹${n.toLocaleString('en-IN')}`;
const STATUS: Readonly<Record<FeeStatus, { label: string; tone: 'green' | 'red' | 'grey' }>> = {
  paid: { label: 'Paid', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
  upcoming: { label: 'Not due yet', tone: 'grey' },
};

// A pupil's fees for the year: each instalment, what is paid with its receipt, and what is still owed.
export function MyFees(): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useMyFees();
  if (isPending) return <WidgetLoading rows={4} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;
  const next = data.instalments.find((x) => x.status !== 'paid');

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Paid this year', value: rupees(data.paid), note: `${data.instalments.filter((x) => x.status === 'paid').length} of ${data.instalments.length} instalments` },
          { label: 'Owed now', value: rupees(data.outstanding), note: data.outstanding > 0 ? 'Including late fees' : 'Nothing overdue' },
          { label: 'Next due', value: next ? formatDay(next.due) : 'All paid', note: next ? `${next.term}, ${rupees(next.amount)}` : data.year },
        ]}
      />
      <Card>
        <CardHeader title="Fee instalments" subheader={`${data.student} · ${data.section} · ${data.year}`} />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Instalment</TableCell>
                <TableCell>Due</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Receipt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.instalments.map((x) => (
                <TableRow key={x.term}>
                  <TableCell sx={{ fontWeight: 500 }}>{x.term}</TableCell>
                  <TableCell>{formatDay(x.due)}</TableCell>
                  <TableCell align="right">
                    {rupees(x.amount)}
                    {x.late_fee > 0 ? (
                      <Typography variant="caption" color="error" component="div">
                        + {rupees(x.late_fee)} late fee
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <EmergeChip label={STATUS[x.status].label} tone={STATUS[x.status].tone} />
                  </TableCell>
                  <TableCell>
                    {x.receipt ? (
                      <Typography variant="body2">
                        {x.receipt}
                        <Typography variant="caption" color="text.secondary" component="span">
                          {' '}
                          · {formatDay(x.paid_on ?? '')}
                        </Typography>
                      </Typography>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <Typography variant="caption" color="text.secondary">
        Fees are paid at the accounts office or by the link the school sends home. A late fee of ₹50 a day applies after fifteen days, up to ₹2,000.
      </Typography>
    </Stack>
  );
}
