'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { EmergeChip } from '@/components/ui/chip';
import { Divider } from '@/components/ui/layout';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useCreatePaperQuestion } from '@/hooks/mutation/use-papers';
import { useQuestionBank, useQuestionVersions } from '@/hooks/query/use-questions';
import { useGradeLevels } from '@/hooks/query/use-school';
import { useMdmSubjects } from '@/hooks/query/use-mdm';
import {
  NO_ANSWERS_IN_THE_PICKER,
  QUESTION_STATUS_LABELS,
  QUESTION_STATUS_TONES,
  matchesSearch,
  questionFacts,
  questionHeadline,
  versionHeadline,
  versionStem,
} from '@/lib/papers/question';
import type { QuestionRow } from '@/types/questions';
import { PaperFormError } from './form-failure';

const ANY = '';

interface QuestionPickerDialogProps {
  open: boolean;
  onClose: () => void;
  sectionId: string | null;
  sectionName: string;
  nextPosition: number;
  nextNumber: string;
}

export function QuestionPickerDialog(
  props: QuestionPickerDialogProps,
): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="md">
      {props.open ? <QuestionPicker key={props.sectionId ?? 'none'} {...props} /> : null}
    </Dialog>
  );
}

function QuestionPicker({
  onClose,
  sectionId,
  sectionName,
  nextPosition,
  nextNumber,
}: QuestionPickerDialogProps): React.ReactElement {
  const create = useCreatePaperQuestion(sectionId);
  const subjects = useMdmSubjects();
  const grades = useGradeLevels();

  const [subjectId, setSubjectId] = React.useState(ANY);
  const [gradeId, setGradeId] = React.useState(ANY);
  const [search, setSearch] = React.useState('');
  const [chosen, setChosen] = React.useState<QuestionRow | null>(null);
  const [versionId, setVersionId] = React.useState(ANY);

  const [number, setNumber] = React.useState(nextNumber);
  const [marks, setMarks] = React.useState('');
  const [position, setPosition] = React.useState(String(nextPosition));
  const [variant, setVariant] = React.useState('');

  const bank = useQuestionBank({
    subjectId: subjectId === ANY ? undefined : subjectId,
    gradeLevelId: gradeId === ANY ? undefined : gradeId,
    search,
  });
  const versions = useQuestionVersions(chosen?.id ?? null);

  const listed = (bank.data?.rows ?? []).filter((row) => matchesSearch(row, search));
  const versionRows = versions.data ?? [];

  const marksValue = Number(marks);
  const positionValue = Number(position);
  const marksUsable = marks.trim() !== '' && Number.isFinite(marksValue) && marksValue > 0;
  const positionUsable = Number.isInteger(positionValue) && positionValue > 0;

  const usable =
    chosen !== null &&
    versionId !== ANY &&
    number.trim() !== '' &&
    marksUsable &&
    positionUsable;

  const save = (): void => {
    if (!chosen || versionId === ANY) return;
    create.mutate(
      {
        question_id: chosen.id,
        question_version_id: versionId,
        question_number: number.trim(),
        marks: marksValue,
        position: positionValue,
        ...(variant.trim() === '' ? {} : { variant_group: variant.trim() }),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>Put a question on {sectionName}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Alert severity="info" variant="outlined">
            {NO_ANSWERS_IN_THE_PICKER}
          </Alert>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Subject"
              size="small"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              fullWidth
            >
              <MenuItem value={ANY}>Every subject</MenuItem>
              {(subjects.data?.rows ?? []).map((subject) => (
                <MenuItem key={subject.id} value={subject.id}>
                  {subject.name ?? subject.code ?? subject.id}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Grade"
              size="small"
              value={gradeId}
              onChange={(event) => setGradeId(event.target.value)}
              fullWidth
            >
              <MenuItem value={ANY}>Every grade</MenuItem>
              {(grades.data?.rows ?? []).map((grade) => (
                <MenuItem key={grade.id} value={grade.id}>
                  {grade.name ?? grade.code ?? grade.id}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Search"
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              helperText="By key, cognitive band or language"
              fullWidth
            />
          </Stack>

          {bank.isPending ? <WidgetLoading rows={4} /> : null}

          {bank.isError ? (
            <WidgetError error={bank.error} onRetry={() => void bank.refetch()} />
          ) : null}

          {bank.data && listed.length === 0 ? (
            <WidgetEmpty
              message={
                search.trim() === ''
                  ? 'The question bank holds nothing your account can read under these filters.'
                  : 'Nothing in the bank matches that.'
              }
            />
          ) : null}

          {listed.length > 0 ? (
            <QuestionList
              questions={listed}
              chosenId={chosen?.id ?? null}
              onChoose={(question) => {
                setChosen(question);
                setVersionId(ANY);
              }}
            />
          ) : null}

          {chosen ? (
            <>
              <Divider />

              <Typography component="h4" variant="body2" sx={{ fontWeight: 700 }}>
                Which version it prints
              </Typography>
              <Typography variant="caption" color="text.secondary">
                A paper records the question and the exact version it printed, so a
                later edit to the bank cannot change what candidates sat.
              </Typography>

              {versions.isPending ? <WidgetLoading rows={2} /> : null}

              {versions.isError ? (
                <WidgetError
                  error={versions.error}
                  onRetry={() => void versions.refetch()}
                />
              ) : null}

              {versions.data && versionRows.length === 0 ? (
                <WidgetEmpty message="This question has no versions, so there is nothing a paper could print." />
              ) : null}

              {versionRows.length > 0 ? (
                <TextField
                  select
                  label="Version"
                  size="small"
                  value={versionId}
                  onChange={(event) => setVersionId(event.target.value)}
                  required
                >
                  <MenuItem value={ANY}>Choose a version</MenuItem>
                  {versionRows.map((version) => (
                    <MenuItem key={version.id} value={version.id}>
                      {versionHeadline(version)}
                      {version.status
                        ? ` · ${QUESTION_STATUS_LABELS[version.status]}`
                        : ''}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}

              {versionId !== ANY ? (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {versionStem(
                    versionRows.find((version) => version.id === versionId) ?? {
                      id: versionId,
                    },
                  )}
                </Typography>
              ) : null}

              <Divider />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Printed as"
                  size="small"
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  required
                  helperText="The number a candidate sees, such as 4 or 4(a)."
                  fullWidth
                />
                <TextField
                  label="Marks"
                  size="small"
                  type="number"
                  value={marks}
                  onChange={(event) => setMarks(event.target.value)}
                  required
                  error={marks.trim() !== '' && !marksUsable}
                  helperText={
                    marks.trim() !== '' && !marksUsable
                      ? 'Marks have to be above zero.'
                      : 'What this question is worth on this paper.'
                  }
                  fullWidth
                />
                <TextField
                  label="Position"
                  size="small"
                  type="number"
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  required
                  error={position.trim() !== '' && !positionUsable}
                  helperText={
                    position.trim() !== '' && !positionUsable
                      ? 'A position is a whole number above zero.'
                      : 'Free positions left by a removed question can be used again.'
                  }
                  fullWidth
                />
              </Stack>

              <TextField
                label="Variant group"
                size="small"
                value={variant}
                onChange={(event) => setVariant(event.target.value)}
                helperText="Optional. Name a group to make this one of several interchangeable questions."
              />
            </>
          ) : null}

          <PaperFormError error={create.error} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={create.isPending || !usable || !sectionId}
        >
          Put it on
        </Button>
      </DialogActions>
    </>
  );
}

function QuestionList({
  questions,
  chosenId,
  onChoose,
}: {
  questions: readonly QuestionRow[];
  chosenId: string | null;
  onChoose: (question: QuestionRow) => void;
}): React.ReactElement {
  const theme = useTheme();

  return (
    <Box
      component="ul"
      sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: 260, overflowY: 'auto' }}
    >
      {questions.map((question) => (
        <Box component="li" key={question.id}>
          <Button
            fullWidth
            onClick={() => onChoose(question)}
            aria-pressed={question.id === chosenId}
            sx={{
              justifyContent: 'flex-start',
              textAlign: 'left',
              px: 1,
              py: 1,
              backgroundColor:
                question.id === chosenId ? theme.brand.subtle : undefined,
            }}
          >
            <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {questionHeadline(question)}
                </Typography>
                {question.status ? (
                  <EmergeChip
                    tone={QUESTION_STATUS_TONES[question.status]}
                    label={QUESTION_STATUS_LABELS[question.status]}
                  />
                ) : null}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {questionFacts(question)}
              </Typography>
            </Stack>
          </Button>
        </Box>
      ))}
    </Box>
  );
}
