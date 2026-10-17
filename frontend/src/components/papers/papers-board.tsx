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
import { ArrowLeft, Plus, X } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Divider, SectionHeader } from '@/components/ui/layout';
import { useUrlState } from '@/components/school/url-state';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { usePaper, usePapers } from '@/hooks/query/use-papers';
import {
  useDeletePaperQuestion,
  useDeletePaperSection,
} from '@/hooks/mutation/use-papers';
import { readVisibility } from '@/lib/core/fields';
import { durationLabel } from '@/lib/school/time';
import { trimNumber } from '@/lib/exams/exam';
import { ANSWER_KEY_IS_A_DEFECT, answerKeyFieldsIn } from '@/lib/papers/answer-key';
import {
  PAPER_STATUS_LABELS,
  PAPER_STATUS_TONES,
  POSITION_GAP_EXPLAINED,
  PUBLISHED_PAPER_IS_SETTLED,
  approvalLine,
  gapsIn,
  isPublished,
  markLabel,
  nextFreePosition,
  paperSubtitle,
  paperTitle,
  questionLabel,
  sectionTally,
} from '@/lib/papers/paper';
import { logger } from '@/lib/logger';
import { ApiError } from '@/services/api';
import { GenerationRunPanel } from './generation-run-panel';
import { PaperDialog } from './paper-dialog';
import { useBlueprintLevel, usePaperGrade } from './paper-grade';
import { PaperSectionDialog } from './paper-section-dialog';
import { QuestionPickerDialog } from './question-picker-dialog';
import { PaperReadFailure } from './form-failure';
import { PartRemoval } from './part-removal';
import { usePaperGrants, type PaperGrants } from './papers-grants';
import {
  PAPER_YEAR_VIEWS,
  PaperYearBar,
  sessionLabel,
  usePaperSessions,
  useViewState,
  type PaperYearView,
} from './paper-scope';
import type { PaperQuestionRow, PaperRow, PaperSectionBlock } from '@/types/papers';

const NO_ANSWERS_HERE =
  'A paper record holds its numbering, marks and the question versions it ' +
  'printed. It never holds the answers, so none are shown.';

export function PapersBoard(): React.ReactElement {
  const { get, put } = useUrlState();
  const grants = usePaperGrants();
  const sessions = usePaperSessions();
  const { view, setView } = useViewState<PaperYearView>(
    'years',
    'current',
    PAPER_YEAR_VIEWS,
  );

  const sessionId = view === 'current' ? (sessions.current?.id ?? null) : null;
  const papers = usePapers(sessionId);
  const level = usePaperGrade();
  const levelOf = useBlueprintLevel();
  const rows = (papers.data?.rows ?? []).filter((paper) => {
    const paperLevel = levelOf(paper.blueprint_id);
    return level === null || paperLevel === null || paperLevel === level;
  });
  const selected = get('paper');

  const [editing, setEditing] = React.useState<PaperRow | 'new' | null>(null);

  const year = sessionLabel(sessions.sessions, sessions.current?.id);
  const caption =
    view === 'current'
      ? `${countLine(rows.length)} in ${year ?? 'this academic year'}`
      : `${countLine(rows.length)} across every year`;

  return (
    <Stack spacing={2.5}>
      <PaperYearBar
        view={view}
        onChange={setView}
        caption={caption}
        action={
          grants.mayCreatePaper ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Plus size={16} />}
              onClick={() => setEditing('new')}
              disabled={sessions.sessions.length === 0}
            >
              New paper
            </Button>
          ) : undefined
        }
      />

      {papers.isPending ? <WidgetLoading rows={5} /> : null}

      {papers.isError ? (
        <PaperReadFailure error={papers.error} onRetry={() => void papers.refetch()} />
      ) : null}

      {papers.data && rows.length === 0 ? (
        <WidgetEmpty
          message={
            view === 'current'
              ? 'No papers have been set in this year yet. One appears here as soon as somebody sets it.'
              : 'No papers have been set in this school yet.'
          }
        />
      ) : null}

      {rows.length > 0 ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Paper</TableCell>
                <TableCell>Marks</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Status</TableCell>
                {grants.mayWritePaper ? <TableCell align="right">Edit</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((paper) => (
                <TableRow key={paper.id} hover selected={paper.id === selected}>
                  <TableCell>
                    <Button
                      size="small"
                      sx={{ justifyContent: 'flex-start', textAlign: 'left', px: 0.5 }}
                      onClick={() => put({ paper: paper.id })}
                    >
                      {paperTitle(paper)}
                    </Button>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', pl: 0.5 }}
                    >
                      {paperSubtitle(paper) ?? 'No details were recorded'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {typeof paper.total_marks === 'number'
                      ? trimNumber(paper.total_marks)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {typeof paper.duration_minutes === 'number'
                      ? durationLabel(paper.duration_minutes)
                      : 'Not stated'}
                  </TableCell>
                  <TableCell>
                    <EmergeChip
                      label={paper.status ? PAPER_STATUS_LABELS[paper.status] : '—'}
                      tone={paper.status ? PAPER_STATUS_TONES[paper.status] : 'grey'}
                    />
                  </TableCell>
                  {grants.mayWritePaper ? (
                    <TableCell align="right">
                      <Button size="small" onClick={() => setEditing(paper)}>
                        {isPublished(paper) ? 'View' : 'Edit'}
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {selected ? (
        <PaperDetail
          paperId={selected}
          grants={grants}
          onClose={() => put({ paper: null })}
        />
      ) : null}

      <PaperDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        paper={editing === 'new' ? undefined : (editing ?? undefined)}
        sessions={sessions.sessions}
        defaultSessionId={sessions.current?.id ?? null}
        mayDelete={grants.mayDeletePaper}
        onCreated={(id) => put({ paper: id })}
      />
    </Stack>
  );
}

function PaperDetail({
  paperId,
  grants,
  onClose,
}: {
  paperId: string;
  grants: PaperGrants;
  onClose: () => void;
}): React.ReactElement {
  const { data, isPending, isError, error, refetch } = usePaper(paperId);
  const panel = React.useRef<HTMLDivElement>(null);
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    panel.current?.focus();
  }, [paperId]);

  const paper = data?.paper;
  const sections = data?.sections ?? [];
  const nextPosition =
    sections.reduce((top, block) => Math.max(top, block.section.position ?? 0), 0) + 1;

  const leaked = answerKeyFieldsIn([
    ...(paper ? [paper] : []),
    ...sections.map((block) => block.section),
    ...sections.flatMap((block) => block.questions),
  ]).join(', ');

  React.useEffect(() => {
    if (leaked === '') return;
    logger.error('a paper record carried answer data, which it must never do', {
      paperId,
      fields: leaked,
    });
  }, [leaked, paperId]);

  const runVisibility = paper
    ? readVisibility(grants.paperRead, 'generation_run_id', paper.generation_run_id)
    : 'withheld';

  const settled = isPublished(paper);
  const mayEditParts = grants.mayWritePaper && !settled;

  if (isError && error.status === 404) return <PaperNotFound onClose={onClose} />;

  return (
    <Box
      ref={panel}
      tabIndex={-1}
      role="region"
      aria-label="The paper you chose"
      sx={{ outline: 'none' }}
    >
      <Box sx={{ mb: 2 }}>
        <Divider />
      </Box>

      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h4" component="h3">
              {paper ? paperTitle(paper) : 'Question paper'}
            </Typography>
            {paper ? (
              <Typography variant="body2" color="text.secondary">
                {paperSubtitle(paper) ?? 'No details were recorded for this paper.'}
              </Typography>
            ) : null}
            {paper ? (
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                {paper.status ? (
                  <EmergeChip
                    dot
                    tone={PAPER_STATUS_TONES[paper.status]}
                    label={PAPER_STATUS_LABELS[paper.status]}
                  />
                ) : null}
                {approvalLine(paper) ? (
                  <EmergeChip tone="teal" label={approvalLine(paper) ?? ''} />
                ) : null}
              </Stack>
            ) : null}
          </Box>
          <Button size="small" startIcon={<X size={16} />} onClick={onClose}>
            Close
          </Button>
        </Stack>

        {isPending ? <WidgetLoading rows={4} /> : null}

        {isError ? (
          <PaperReadFailure
            error={error}
            onRetry={() => void refetch()}
            missing="That paper is no longer there. It may have been deleted since this list was loaded."
          />
        ) : null}

        {leaked !== '' ? (
          <Alert severity="error" variant="outlined">
            <AlertTitle>This record carries answer data</AlertTitle>
            {ANSWER_KEY_IS_A_DEFECT}
          </Alert>
        ) : null}

        {settled ? (
          <Alert severity="info" variant="outlined">
            {PUBLISHED_PAPER_IS_SETTLED}
          </Alert>
        ) : null}

        {paper && runVisibility === 'shown' && paper.generation_run_id ? (
          grants.mayReadRuns ? (
            <GenerationRunPanel runId={paper.generation_run_id} />
          ) : (
            <Alert severity="info" variant="outlined">
              This paper came out of a generation run, and your account may not read
              generation runs, so what produced it cannot be shown.
            </Alert>
          )
        ) : null}

        {paper && runVisibility === 'empty' ? (
          <Typography variant="body2" color="text.secondary">
            This paper came out of no generation run, so it was assembled rather than
            generated.
          </Typography>
        ) : null}

        {paper && runVisibility === 'withheld' ? (
          <Typography variant="body2" color="text.secondary">
            Whether this paper was generated is not shown to your account.
          </Typography>
        ) : null}

        <Box component="section">
          <SectionHeader
            title="What is on it"
            subtitle={NO_ANSWERS_HERE}
            actions={
              mayEditParts ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Plus size={16} />}
                  onClick={() => setAdding(true)}
                >
                  Add a section
                </Button>
              ) : undefined
            }
          />

          {data && sections.length === 0 ? (
            <WidgetEmpty message="This paper has no sections yet, so nothing has been put on it." />
          ) : null}

          <Stack spacing={2.5}>
            {sections.map((block) => (
              <PaperSectionRows
                key={block.section.id}
                block={block}
                grants={grants}
                mayEditParts={mayEditParts}
                settled={settled}
              />
            ))}
          </Stack>
        </Box>
      </Stack>

      <PaperSectionDialog
        open={adding}
        onClose={() => setAdding(false)}
        paperId={paperId}
        nextPosition={nextPosition}
      />
    </Box>
  );
}

function PaperSectionRows({
  block,
  grants,
  mayEditParts,
  settled,
}: {
  block: PaperSectionBlock;
  grants: PaperGrants;
  mayEditParts: boolean;
  settled: boolean;
}): React.ReactElement {
  const questions = block.questions;
  const removeSection = useDeletePaperSection();
  const removeQuestion = useDeletePaperQuestion();
  const [adding, setAdding] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const gaps = gapsIn(questions);
  const free = nextFreePosition(questions);
  const mayPick = mayEditParts && grants.mayReadQuestionBank;
  const mayRemove = mayEditParts && grants.mayDeletePaper;

  return (
    <Box component="section">
      <SectionHeader
        title={block.section.name ?? block.section.code ?? 'Untitled section'}
        subtitle={sectionTally(questions)}
        actions={
          mayPick ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Plus size={16} />}
              onClick={() => setAdding(true)}
            >
              Add a question
            </Button>
          ) : undefined
        }
      />

      {block.section.instructions ? (
        <Typography variant="body2" sx={{ mb: 1.25 }}>
          {block.section.instructions}
        </Typography>
      ) : null}

      {gaps.length > 0 ? (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.25 }}>
          <AlertTitle>
            {gaps.length === 1
              ? `Position ${gaps[0]} is free`
              : `Positions ${gaps.join(', ')} are free`}
          </AlertTitle>
          {POSITION_GAP_EXPLAINED}
        </Alert>
      ) : null}

      {questions.length === 0 ? (
        <WidgetEmpty message="Nothing has been put in this section yet." />
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>At</TableCell>
                <TableCell>Question</TableCell>
                <TableCell>Marks</TableCell>
                <TableCell>Variant</TableCell>
                {mayRemove ? <TableCell align="right">Take off</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {questions.map((question) => (
                <TableRow key={question.id}>
                  <TableCell>{question.position ?? '—'}</TableCell>
                  <TableCell>
                    {questionLabel(question)}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block' }}
                    >
                      {versionLine(question)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {typeof question.marks === 'number'
                      ? markLabel(question.marks)
                      : '—'}
                  </TableCell>
                  <TableCell>{question.variant_group ?? 'One version for all'}</TableCell>
                  {mayRemove ? (
                    <TableCell align="right">
                      <PartRemoval
                        what="Take off"
                        consequence={freedPositionLine(question)}
                        pending={removeQuestion.isPending && removingId === question.id}
                        error={removingId === question.id ? removeQuestion.error : null}
                        onRemove={() => {
                          setRemovingId(question.id);
                          removeQuestion.mutate(question.id);
                        }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {settled ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1 }}
        >
          {PUBLISHED_PAPER_IS_SETTLED}
        </Typography>
      ) : null}

      {mayRemove ? (
        <Box sx={{ mt: 1.25 }}>
          <PartRemoval
            what="Remove this section"
            consequence="Every question on this section goes with it."
            pending={removeSection.isPending}
            error={removeSection.error}
            onRemove={() => removeSection.mutate(block.section.id)}
          />
        </Box>
      ) : null}

      <QuestionPickerDialog
        open={adding}
        onClose={() => setAdding(false)}
        sectionId={block.section.id}
        sectionName={block.section.name ?? block.section.code ?? 'this section'}
        nextPosition={free}
        nextNumber={String(free)}
      />
    </Box>
  );
}

export function PaperNotFound({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <Box role="region" aria-label="The paper you chose">
      <Box sx={{ mb: 2 }}>
        <Divider />
      </Box>
      <EmptyState
        title="Paper not found"
        body="There is no paper with that link. It may have been deleted, or the link may be from another school."
        action={
          <Button variant="contained" startIcon={<ArrowLeft size={16} />} onClick={onClose}>
            All papers
          </Button>
        }
      />
    </Box>
  );
}

function freedPositionLine(question: PaperQuestionRow): string {
  const at = question.position;
  return typeof at === 'number'
    ? `Position ${at} is left free and the rest keep their numbers.`
    : 'The rest keep the numbers they already had.';
}

function versionLine(question: PaperQuestionRow): string {
  const version = question.question_version_id;
  return version
    ? `Printed version ${version.slice(0, 8)}`
    : 'The version it printed is not shown to your account';
}

function countLine(count: number): string {
  return count === 1 ? '1 paper' : `${count} papers`;
}
