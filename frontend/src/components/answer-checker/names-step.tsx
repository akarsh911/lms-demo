'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Check, CircleCheck } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useConfirmBooklets } from '@/hooks/mutation/use-answer-checker';
import { useCheckerBooklets } from '@/hooks/query/use-answer-checker';
import { failureText } from '@/lib/exams/exam';
import { confidentMatch, MATCH_LABELS, matchBooklet, type BookletMatch, type RosterStudent } from '@/lib/answer-checker/roster-match';
import { answerCheckerService } from '@/services/answer-checker';
import type { BookletRef, CheckerExamDetail, IdentityIn } from '@/types/answer-checker';

import { ActionIcon } from './action-icon';
import { MarkBar } from './mark-step';
import { SchemeCallout } from './scheme-step';

const UNCONFIRMED = new Set(['pending', 'identified']);
const AUTO_CONFIRM_FROM = 0.9;

function confidenceTone(confidence: number): ChipTone {
  if (confidence >= 0.9) return 'green';
  return confidence >= 0.7 ? 'amber' : 'red';
}

function identityFor(student: RosterStudent, ref: BookletRef): IdentityIn {
  const name = student.name || ref.student.name || '';
  return student.roll ? { name, roll_number: student.roll, confirm: true } : { name, confirm: true };
}

export function NamesStep({
  exam,
  students,
  onMarked,
  onReviewScheme,
}: {
  exam: CheckerExamDetail;
  students: readonly RosterStudent[];
  onMarked: (jobId: string) => void;
  onReviewScheme: () => void;
}): React.ReactElement {
  const examId = exam.id;
  const booklets = useCheckerBooklets(examId);
  const autoSent = React.useRef(new Set<string>());
  const confirm = useConfirmBooklets(examId);
  const [chosen, setChosen] = React.useState<Record<string, string>>({});

  const rows = React.useMemo(
    () =>
      (booklets.data ?? []).map((ref) => {
        const picked = students.find((student) => student.studentId === chosen[ref.id]);
        const match: BookletMatch | null = picked ? { student: picked, basis: 'teacher' } : matchBooklet(ref, students);
        return { ref, match };
      }),
    [booklets.data, chosen, students],
  );

  const claims = new Map<string, number>();
  for (const { match } of rows) if (match) claims.set(match.student.studentId, (claims.get(match.student.studentId) ?? 0) + 1);
  const clash = (row: { match: BookletMatch | null }): boolean => Boolean(row.match && (claims.get(row.match.student.studentId) ?? 0) > 1);

  const waiting = rows.filter((row) => UNCONFIRMED.has(row.ref.state));
  const online = (ref: BookletRef): boolean => ref.page_count === 0;
  const sure = waiting.filter((row) => (confidentMatch(row.match) || (online(row.ref) && row.match?.basis === 'roll')) && !clash(row) && Boolean(row.match?.student.name));
  const automatic = sure.filter((row) => row.ref.student.confidence >= AUTO_CONFIRM_FROM);
  const manual = sure.filter((row) => row.ref.student.confidence < AUTO_CONFIRM_FROM);
  const needYou = waiting.length - sure.length;
  const absent = students.filter((student) => !claims.has(student.studentId));
  const confirmed = rows.length - waiting.length;
  const ordered = [...rows].sort((left, right) => Number(needsYou(right)) - Number(needsYou(left)));

  function needsYou(row: { ref: BookletRef; match: BookletMatch | null }): boolean {
    return UNCONFIRMED.has(row.ref.state) && !sure.includes(row as (typeof sure)[number]);
  }

  const confirmRows = (list: readonly { ref: BookletRef; match: BookletMatch | null }[]): void => {
    const batch = list.flatMap(({ ref, match }) => (match ? [{ bookletId: ref.id, identity: identityFor(match.student, ref) }] : []));
    if (batch.length > 0) confirm.mutate(batch);
  };

  const automaticKey = automatic.map((row) => row.ref.id).join(',');
  React.useEffect(() => {
    if (automaticKey === '' || confirm.isPending) return;
    const ids = new Set(automaticKey.split(',').filter((id) => !autoSent.current.has(id)));
    if (ids.size === 0) return;
    ids.forEach((id) => autoSent.current.add(id));
    confirmRows(rows.filter((row) => ids.has(row.ref.id)));
  });

  if (booklets.isPending) return <WidgetLoading rows={6} />;
  if (booklets.isError) return <WidgetError error={booklets.error} onRetry={() => void booklets.refetch()} />;
  if (rows.length === 0) return <WidgetEmpty message="No booklets yet." />;

  const absentNames = absent.map((student) => `${student.roll ?? ''} ${student.name || '—'}`.trim()).join(', ');

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Booklets', value: rows.length },
          { label: 'Confirmed', value: `${confirmed} of ${rows.length}`, note: `Matches of ${Math.round(AUTO_CONFIRM_FROM * 100)}% or more confirm themselves` },
          { label: 'Without a sheet', value: absent.length, note: absent.length > 0 ? 'Can be marked absent' : undefined },
        ]}
      />
      <SchemeCallout exam={exam} onReview={onReviewScheme} />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CardToolbar summary={needYou > 0 ? `${needYou} need you` : waiting.length > 0 ? 'Confirming…' : 'Every booklet has a pupil'}>
              {absent.length > 0 ? (
                <Tooltip title={absentNames}>
                  <span>
                    <EmergeChip label={`${absent.length} absent`} tone="amber" />
                  </span>
                </Tooltip>
              ) : null}
              {manual.length > 0 ? (
                <Tooltip title="Roll and name agree, but the cover was harder to read.">
                  <span>
                    <Button size="small" variant="outlined" disabled={confirm.isPending} onClick={() => confirmRows(manual)}>
                      Confirm {manual.length} matched
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
            </CardToolbar>

            {confirm.isError ? (
              <Alert severity="error" variant="outlined">
                {failureText(confirm.error)}
              </Alert>
            ) : null}

      <TableContainer>
        <Table size="small" aria-label="Booklets">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 56, display: { xs: 'none', sm: 'table-cell' } }} />
              <TableCell>Cover</TableCell>
              <TableCell sx={{ minWidth: 200 }}>Pupil</TableCell>
              <TableCell sx={{ width: 56 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {ordered.map((row, index) => {
              const { ref, match } = row;
              const open = UNCONFIRMED.has(ref.state);
              const clashes = clash(row);
              return (
                <TableRow key={ref.id} hover>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {online(ref) ? (
                      <EmergeChip label="Online" tone="blue" />
                    ) : (
                      <Box
                        component="img"
                        src={answerCheckerService.pageImageUrl(examId, ref.id, 0)}
                        alt={`Cover ${index + 1}`}
                        sx={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 0.5, border: 1, borderColor: 'divider', display: 'block' }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {ref.student.name ?? '—'}
                    </Typography>
                    <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: 'center' }}>
                      <Typography variant="caption" color="text.secondary">
                        {ref.student.roll_number ?? '?'}
                      </Typography>
                      <Tooltip title={ref.warnings.join('; ') || 'Read from the cover'}>
                        <span>
                          <EmergeChip label={`${Math.round(ref.student.confidence * 100)}%`} tone={confidenceTone(ref.student.confidence)} />
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={match ? `${MATCH_LABELS[match.basis]}${clashes ? ' · claimed twice' : ''}` : 'No match: choose the pupil'}>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={match?.student.studentId ?? ''}
                        disabled={!open}
                        onChange={(event) => setChosen((current) => ({ ...current, [ref.id]: event.target.value }))}
                        error={clashes || (!match && open)}
                        slotProps={{ htmlInput: { 'aria-label': `Pupil for booklet ${index + 1}` } }}
                      >
                        {students.map((student) => (
                          <MenuItem key={student.studentId} value={student.studentId}>
                            {student.roll ? `${student.roll} · ` : ''}
                            {student.name || 'Name hidden from you'}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Tooltip>
                    {match && !match.student.name && open ? (
                      <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                        {`The roster hides this name from you. The cover reads ${ref.student.name ?? 'no name'}; confirm only if that is right.`}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell align="right">
                    {open ? (
                      <ActionIcon label="Confirm" disabled={!match || clashes || confirm.isPending} onClick={() => confirmRows([row])}>
                        <Check size={16} />
                      </ActionIcon>
                    ) : (
                      <Tooltip title="Confirmed">
                        <Box component="span" sx={{ color: 'success.main', display: 'inline-flex', px: 1 }} aria-label="Confirmed">
                          <CircleCheck size={16} />
                        </Box>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
            <MarkBar exam={exam} onStarted={onMarked} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
