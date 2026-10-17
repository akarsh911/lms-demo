'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { FileText, KeyRound } from 'lucide-react';

import { formatDay } from '@/lib/dates';
import type { ExamDetail } from '@/types/grades';

import { AnswerKeyDialog } from './answer-key-dialog';
import { QuestionPaperDialog } from './question-paper-dialog';

// One class's date sheet: the papers it sat, when, and each paper with its key. Change the class and the sheet changes.
export function DateSheet({ detail, gradeId }: { detail: ExamDetail; gradeId: string }): React.ReactElement {
  const [chosen, setChosen] = React.useState('');
  const [paper, setPaper] = React.useState<string | null>(null);
  const [key, setKey] = React.useState<string | null>(null);
  const classId = detail.classes.some((cls) => cls.id === chosen) ? chosen : gradeId || detail.classes[0]?.id || '';
  const rows = detail.schedule
    .flatMap((row) => {
      const qp = row.question_papers.find((p) => p.grade_level_id === classId);
      return qp ? [{ ...row, paper: qp }] : [];
    })
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const first = rows[0]?.date;
  const last = rows[rows.length - 1]?.date;
  const keys = rows.filter((row) => row.paper.answer_key).length;

  return (
    <Card>
      <CardHeader
        title="Date sheet"
        subheader={rows.length > 0 ? `${rows.length} papers${first && last ? `, ${formatDay(first)} to ${formatDay(last)}` : ''} · ${keys} answer keys uploaded` : 'No papers for this class'}
        action={
          <TextField select size="small" label="Class" value={classId} onChange={(event) => setChosen(event.target.value)} sx={{ minWidth: 140 }}>
            {detail.classes.map((cls) => (
              <MenuItem key={cls.id} value={cls.id}>
                {cls.name}
              </MenuItem>
            ))}
          </TextField>
        }
      />
      <TableContainer sx={{ border: 0, borderRadius: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Subject</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Time</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                Max
              </TableCell>
              <TableCell>Paper and key</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.subject} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.date ? formatDay(row.date) : 'Not set'}</TableCell>
                <TableCell>
                  <Typography variant="subtitle2" component="span">
                    {row.subject}
                  </Typography>
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary', whiteSpace: 'nowrap' }}>{row.time}</TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' }, fontVariantNumeric: 'tabular-nums' }}>
                  {row.max}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.75}>
                    <Button size="small" variant="outlined" color="inherit" startIcon={<FileText size={13} />} onClick={() => setPaper(row.paper.exam_subject_id)} sx={{ px: 1, py: 0.25, minHeight: 0 }}>
                      Paper
                    </Button>
                    {row.paper.answer_key ? (
                      <Button size="small" variant="outlined" color="inherit" startIcon={<KeyRound size={13} />} onClick={() => setKey(row.paper.exam_subject_id)} sx={{ px: 1, py: 0.25, minHeight: 0 }}>
                        Key
                      </Button>
                    ) : (
                      <Typography component="span" variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>
                        No key yet
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {paper ? <QuestionPaperDialog examSubjectId={paper} onClose={() => setPaper(null)} /> : null}
      {key ? <AnswerKeyDialog examSubjectId={key} onClose={() => setKey(null)} /> : null}
    </Card>
  );
}
