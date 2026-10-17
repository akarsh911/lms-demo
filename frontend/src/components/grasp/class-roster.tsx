'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';

import { EmergeChip } from '@/components/ui/chip';
import { formatRelativeTime } from '@/lib/dates';
import type { Band, GraspAttempt } from '@/types/grasp';

import { BAND, seconds, STAGE } from './band-meta';

const flash = keyframes`
  0% { background-color: rgba(181, 83, 94, 0.18); }
  100% { background-color: transparent; }
`;

export function ClassRoster({ attempts, band, onOpen, freshIds }: { attempts: readonly GraspAttempt[]; band: Band | null; onOpen: (id: string) => void; freshIds: ReadonlySet<string> }): React.ReactElement {
  const rows = [...attempts]
    .filter((a) => band === null || a.verdict?.band === band)
    .sort((a, b) => (b.submittedAt ?? b.joinedAt).localeCompare(a.submittedAt ?? a.joinedAt));
  return (
    <Card>
      <CardHeader title={band ? `${BAND[band].label} · ${rows.length}` : `Students · ${rows.length}`} subheader="Open a student to see each question they were asked, what they picked and how long it took." />
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Student</TableCell>
              <TableCell>Result</TableCell>
              <TableCell align="center">Timed</TableCell>
              <TableCell align="center">Untimed</TableCell>
              <TableCell align="right">Typical answer</TableCell>
              <TableCell align="right">When</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((a) => {
              const v = a.verdict;
              return (
                <TableRow key={a.id} hover onClick={() => onOpen(a.id)} sx={{ cursor: 'pointer', animation: freshIds.has(a.id) ? `${flash} 2.4s ease-out` : 'none' }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {a.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Roll {a.roll || '—'} · {a.via === 'sheet' ? 'answer sheet' : 'typed'}
                    </Typography>
                  </TableCell>
                  <TableCell>{v ? <EmergeChip label={BAND[v.band].label} tone={BAND[v.band].tone} /> : <EmergeChip label={STAGE[a.stage].label} tone={STAGE[a.stage].tone} dot />}</TableCell>
                  <TableCell align="center">{v ? `${v.fastCorrect}/${v.fastTotal}` : '—'}</TableCell>
                  <TableCell align="center">{v ? (v.slowOk ? '✓' : '✗') : '—'}</TableCell>
                  <TableCell align="right">{seconds(v?.medianMs ?? null)}</TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" color="text.secondary">
                      {formatRelativeTime(a.submittedAt ?? a.joinedAt)}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    {band ? 'Nobody here yet.' : 'Share the code. Students appear here the moment they join.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
