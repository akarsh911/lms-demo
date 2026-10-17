'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { Plus } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useExams } from '@/hooks/query/use-exams';
import {
  EXAM_STATUS_LABELS,
  EXAM_TYPE_LABELS,
  examLabel,
  examWindowLabel,
  practiceCount,
  resultsStance,
  type ResultsStance,
} from '@/lib/exams/exam';
import { ExamDialog } from './exam-dialog';
import { SchoolScopeBar, useSchoolScope } from './school-scope';
import { useTimetableGrants } from './timetable-grants';
import { useUrlState } from './url-state';
import type { ExamRow } from '@/types/exams';

const STANCE_CHIP: Record<ResultsStance, string> = {
  counts: 'Counts',
  practice: 'Practice · counts for nothing',
  unstated: 'Not stated',
};

const STANCE_TONE: Record<ResultsStance, 'green' | 'amber' | 'grey'> = {
  counts: 'green',
  practice: 'amber',
  unstated: 'grey',
};

const STANCE_CAPTION: Record<ResultsStance, string> = {
  counts: 'Counts toward the report card',
  practice: 'Does not count toward the report card',
  unstated: 'This account was not shown whether it counts',
};

export function ExamsBoard(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();
  const grants = useTimetableGrants();

  const exams = useExams(scope.branchId, scope.sessionId);
  const rows = exams.data ?? [];
  const selected = get('exam');

  const [editing, setEditing] = React.useState<ExamRow | 'new' | null>(null);

  const practice = practiceCount(rows);
  const ready = Boolean(scope.branchId) && Boolean(scope.sessionId);

  return (
    <Stack spacing={2.5}>
      <SchoolScopeBar scope={scope} showScheme={false} />

      <CardToolbar
        summary={
          <>
            {rows.length} {rows.length === 1 ? 'assessment' : 'assessments'} in{' '}
            {scope.session?.name ?? scope.session?.code ?? 'this academic year'}
          </>
        }
      >
        {grants.mayWrite ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={() => setEditing('new')}
            disabled={!ready}
          >
            New assessment
          </Button>
        ) : null}
      </CardToolbar>

      {practice > 0 ? (
        <Alert severity="warning" variant="outlined">
          <AlertTitle>
            {practice} of these {practice === 1 ? 'is a practice assessment' : 'are practice assessments'}
          </AlertTitle>
          A practice assessment is set, sat and marked like any other, and not one of
          its marks reaches a report card. The rows below say which are which.
        </Alert>
      ) : null}

      {exams.isPending && ready ? <WidgetLoading rows={5} /> : null}
      {exams.isError ? (
        <WidgetError error={exams.error} onRetry={() => void exams.refetch()} />
      ) : null}
      {exams.data && rows.length === 0 ? (
        <WidgetEmpty message="No assessments in this year yet. Create one, add a paper for each subject, then say when each class sits it." />
      ) : null}

      {rows.length > 0 ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Assessment</TableCell>
                <TableCell>Counts toward results</TableCell>
                <TableCell>Paper</TableCell>
                <TableCell>When</TableCell>
                <TableCell>Status</TableCell>
                {grants.mayWrite ? <TableCell align="right">Edit</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((exam) => {
                const stance = resultsStance(exam);
                const window = examWindowLabel(exam);
                return (
                  <TableRow
                    key={exam.id}
                    hover
                    selected={exam.id === selected}
                    sx={{
                      borderLeft: '4px solid',
                      borderLeftColor:
                        stance === 'practice' ? 'warning.main' : 'transparent',
                    }}
                  >
                    <TableCell>
                      <Button
                        size="small"
                        sx={{ justifyContent: 'flex-start', textAlign: 'left', px: 0.5 }}
                        onClick={() => put({ exam: exam.id })}
                      >
                        {examLabel(exam)}
                      </Button>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', pl: 0.5 }}
                      >
                        {exam.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                        <EmergeChip dot tone={STANCE_TONE[stance]} label={STANCE_CHIP[stance]} />
                        <Typography variant="caption" color="text.secondary">
                          {STANCE_CAPTION[stance]}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {exam.exam_type ? EXAM_TYPE_LABELS[exam.exam_type] : '—'}
                    </TableCell>
                    <TableCell>{window ?? 'No dates set'}</TableCell>
                    <TableCell>
                      <EmergeChip
                        label={exam.status ? EXAM_STATUS_LABELS[exam.status] : '—'}
                        tone={exam.status === 'published' ? 'green' : 'grey'}
                      />
                    </TableCell>
                    {grants.mayWrite ? (
                      <TableCell align="right">
                        <Button size="small" onClick={() => setEditing(exam)}>
                          Edit
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      <ExamDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        branchId={scope.branchId}
        sessionId={scope.sessionId}
        exam={editing === 'new' ? undefined : (editing ?? undefined)}
        mayDelete={grants.mayDelete}
        onCreated={(id) => put({ exam: id })}
      />
    </Stack>
  );
}
