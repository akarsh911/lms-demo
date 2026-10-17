'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { X } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import {
  WidgetDegraded,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import {
  useComponentAssignments,
  useComponentExams,
  useSessionAssignments,
  useSessionExams,
} from '@/hooks/query/use-result-schemes';
import {
  useLinkComponentAssignment,
  useLinkComponentExam,
  useUnlinkComponentAssignment,
  useUnlinkComponentExam,
} from '@/hooks/mutation/use-result-schemes';
import { MdmFormError } from '../mdm/mdm-dialog';
import { componentBlocker, sourcesLine } from '@/lib/school/result-composition';
import type { AssignmentRow } from '@/types/classroom';
import type { ExamRow, ResultComponent } from '@/types/result-scheme';

function examLabel(exam: ExamRow): string {
  return exam.name ?? exam.code ?? exam.id;
}

function assignmentLabel(assignment: AssignmentRow): string {
  return assignment.title ?? assignment.id;
}

export function SourcesDialog({
  component,
  sessionId,
  branchId,
  frozen,
  mayWrite,
  mayDelete,
  mayReadExams,
  mayReadAssignments,
  onClose,
}: {
  component: ResultComponent;
  sessionId: string | null;
  branchId: string | null;
  frozen: boolean;
  mayWrite: boolean;
  mayDelete: boolean;
  mayReadExams: boolean;
  mayReadAssignments: boolean;
  onClose: () => void;
}): React.ReactElement {
  const links = useComponentExams(component.id);
  const homework = useComponentAssignments(component.id);
  const exams = useSessionExams(mayReadExams ? sessionId : null, branchId);
  const assignments = useSessionAssignments(mayReadAssignments ? sessionId : null);

  const linkExam = useLinkComponentExam();
  const unlinkExam = useUnlinkComponentExam();
  const linkAssignment = useLinkComponentAssignment();
  const unlinkAssignment = useUnlinkComponentAssignment();

  const [examChoice, setExamChoice] = React.useState('');
  const [assignmentChoice, setAssignmentChoice] = React.useState('');

  const examRows = links.data ?? [];
  const assignmentRows = homework.data ?? [];
  const examsById = new Map((exams.data ?? []).map((row) => [row.id, row]));
  const assignmentsById = new Map((assignments.data ?? []).map((row) => [row.id, row]));

  const linkedExamIds = new Set(examRows.map((row) => row.exam_id));
  const linkedAssignmentIds = new Set(assignmentRows.map((row) => row.assignment_id));

  const tally = { exams: examRows.length, assignments: assignmentRows.length };
  const blocker = componentBlocker(component, tally);

  const failure =
    linkExam.error ?? unlinkExam.error ?? linkAssignment.error ?? unlinkAssignment.error;

  const addExam = (): void => {
    if (examChoice === '') return;
    linkExam.mutate(
      { componentId: component.id, examId: examChoice },
      { onSuccess: () => setExamChoice('') },
    );
  };

  const addAssignment = (): void => {
    if (assignmentChoice === '') return;
    linkAssignment.mutate(
      { componentId: component.id, assignmentId: assignmentChoice },
      { onSuccess: () => setAssignmentChoice('') },
    );
  };

  return (
    <>
      <DialogTitle>{component.name ?? 'This part'} — what fills it</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Each linked exam or assignment contributes the fraction a pupil scored on
            it. {sourcesLine(tally)} so far.
          </Typography>

          {frozen ? (
            <Alert severity="info" variant="outlined">
              This scheme is no longer a draft, so what fills each part is settled.
              Return it to draft, or supersede it, to change the sources.
            </Alert>
          ) : null}

          {blocker ? (
            <Alert severity="warning" variant="outlined">
              {blocker}
            </Alert>
          ) : null}

          <Stack spacing={1.5}>
            <SectionHeader title="Exams" subtitle="Sittings that feed this part" />

            {links.isPending ? <WidgetLoading rows={2} /> : null}
            {links.isError ? (
              <WidgetError error={links.error} onRetry={() => void links.refetch()} />
            ) : null}
            {exams.isError ? (
              <WidgetDegraded
                error={exams.error}
                denied="This account cannot read exams, so a linked exam is named by its id and none can be added here."
                unavailable="The exams could not be loaded, so a linked exam is named by its id and none can be added here."
              />
            ) : null}

            {links.data && examRows.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No exam feeds this part yet.
              </Typography>
            ) : null}

            {examRows.length > 0 ? (
              <List dense disablePadding>
                {examRows.map((row) => {
                  const exam = row.exam_id ? examsById.get(row.exam_id) : undefined;
                  return (
                    <ListItem
                      key={row.id}
                      disableGutters
                      secondaryAction={
                        mayDelete && !frozen && row.exam_id ? (
                          <IconButton
                            edge="end"
                            size="small"
                            aria-label={`Unlink ${exam ? examLabel(exam) : 'this exam'}`}
                            disabled={unlinkExam.isPending}
                            onClick={() =>
                              unlinkExam.mutate({
                                componentId: component.id,
                                examId: row.exam_id!,
                              })
                            }
                          >
                            <X size={16} />
                          </IconButton>
                        ) : undefined
                      }
                    >
                      <ListItemText
                        primary={
                          exam
                            ? examLabel(exam)
                            : 'An exam this account cannot read'
                        }
                        secondary={exam?.code ?? row.exam_id}
                      />
                    </ListItem>
                  );
                })}
              </List>
            ) : null}

            {mayWrite && !frozen && !exams.isError ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  select
                  size="small"
                  label="Add an exam"
                  value={examChoice}
                  onChange={(event) => setExamChoice(event.target.value)}
                  sx={{ minWidth: 260, flexGrow: 1 }}
                  slotProps={{
                    select: {
                      renderValue: (value) => {
                        const exam = examsById.get(value as string);
                        return exam ? examLabel(exam) : '';
                      },
                    },
                  }}
                  helperText={
                    (exams.data ?? []).length === 0 && !exams.isPending
                      ? 'This year has no exams to draw from yet.'
                      : 'A practice exam says it does not count, so it cannot be linked.'
                  }
                >
                  {(exams.data ?? [])
                    .filter((exam) => !linkedExamIds.has(exam.id))
                    .map((exam) => (
                      <MenuItem
                        key={exam.id}
                        value={exam.id}
                        disabled={exam.assessment_kind === 'practice'}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                        >
                          <span>{examLabel(exam)}</span>
                          {exam.assessment_kind === 'practice' ? (
                            <EmergeChip label="practice" tone="grey" />
                          ) : null}
                        </Stack>
                      </MenuItem>
                    ))}
                </TextField>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={addExam}
                  disabled={examChoice === '' || linkExam.isPending}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Link
                </Button>
              </Stack>
            ) : null}
          </Stack>

          <Stack spacing={1.5}>
            <SectionHeader
              title="Assignments"
              subtitle="Set work that feeds this part, marked the same way"
            />

            {homework.isPending ? <WidgetLoading rows={2} /> : null}
            {homework.isError ? (
              <WidgetError
                error={homework.error}
                onRetry={() => void homework.refetch()}
              />
            ) : null}
            {assignments.isError ? (
              <WidgetDegraded
                error={assignments.error}
                denied="This account cannot read assignments, so a linked assignment is named by its id and none can be added here."
                unavailable="The assignments could not be loaded, so a linked assignment is named by its id and none can be added here."
              />
            ) : null}

            {homework.data && assignmentRows.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No assignment feeds this part yet.
              </Typography>
            ) : null}

            {assignmentRows.length > 0 ? (
              <List dense disablePadding>
                {assignmentRows.map((row) => {
                  const assignment = row.assignment_id
                    ? assignmentsById.get(row.assignment_id)
                    : undefined;
                  return (
                    <ListItem
                      key={row.id}
                      disableGutters
                      secondaryAction={
                        mayDelete && !frozen && row.assignment_id ? (
                          <IconButton
                            edge="end"
                            size="small"
                            aria-label={`Unlink ${assignment ? assignmentLabel(assignment) : 'this assignment'}`}
                            disabled={unlinkAssignment.isPending}
                            onClick={() =>
                              unlinkAssignment.mutate({
                                componentId: component.id,
                                assignmentId: row.assignment_id!,
                              })
                            }
                          >
                            <X size={16} />
                          </IconButton>
                        ) : undefined
                      }
                    >
                      <ListItemText
                        primary={
                          assignment
                            ? assignmentLabel(assignment)
                            : 'An assignment this account cannot read'
                        }
                        secondary={
                          assignment?.maximum_marks === undefined
                            ? row.assignment_id
                            : `out of ${assignment.maximum_marks}`
                        }
                      />
                    </ListItem>
                  );
                })}
              </List>
            ) : null}

            {mayWrite && !frozen && !assignments.isError ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  select
                  size="small"
                  label="Add an assignment"
                  value={assignmentChoice}
                  onChange={(event) => setAssignmentChoice(event.target.value)}
                  sx={{ minWidth: 260, flexGrow: 1 }}
                  slotProps={{
                    select: {
                      renderValue: (value) => {
                        const row = assignmentsById.get(value as string);
                        return row ? assignmentLabel(row) : '';
                      },
                    },
                  }}
                  helperText={
                    (assignments.data ?? []).length === 0 && !assignments.isPending
                      ? 'This year has no assignments to draw from yet.'
                      : 'An assignment marked out of nothing has no fraction to contribute.'
                  }
                >
                  {(assignments.data ?? [])
                    .filter((row) => !linkedAssignmentIds.has(row.id))
                    .map((row) => (
                      <MenuItem
                        key={row.id}
                        value={row.id}
                        disabled={
                          row.maximum_marks !== undefined && row.maximum_marks <= 0
                        }
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                        >
                          <span>{assignmentLabel(row)}</span>
                          {row.maximum_marks === undefined ? null : (
                            <EmergeChip
                              label={`out of ${row.maximum_marks}`}
                              tone="grey"
                            />
                          )}
                        </Stack>
                      </MenuItem>
                    ))}
                </TextField>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={addAssignment}
                  disabled={assignmentChoice === '' || linkAssignment.isPending}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Link
                </Button>
              </Stack>
            ) : null}
          </Stack>

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </>
  );
}
