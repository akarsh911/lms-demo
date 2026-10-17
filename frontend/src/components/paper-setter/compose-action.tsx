'use client';

import * as React from 'react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { CheckAnswerSheetsAction } from '@/components/answer-checker/check-answer-sheets-action';
import { EmergeChip } from '@/components/ui/chip';
import { PAPER_BANK_ROUTE_KEY, SETTER_PAPER_PARAM } from '@/constants/paper-setter';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';

import { listSentence } from './books';
import type { ComposeRequest, ComposeResult } from './contract';
import { useComposeRun } from './hooks';
import { PaperFiles } from './paper-files';
import { WizardPanel, PanelNote } from './panel';
import { RefusalNotice } from './refusal-notice';
import { unplaceableSentence } from './availability';

export const SELECTS_FROM_THE_BANK =
  'Setting this paper picks questions that have already been written and approved for ' +
  'your school. It is not drafting anything new, so it costs nothing and takes a moment ' +
  'rather than minutes.';

export const A_REFUSAL_LEAVES_NOTHING =
  'If this is refused, no paper was created. Nothing is left half-made on the server.';

export const A_HUMAN_READS_IT =
  'A set paper is still yours to read before it goes anywhere. Check the questions and ' +
  'the marks against what you actually taught.';

function setPaperSummary(result: ComposeResult): string | null {
  if (!result.questions) return null;
  const size = `${result.questions} question${result.questions === 1 ? '' : 's'}${
    result.marks ? `, ${result.marks} marks` : ''
  }`;
  const titles = (result.books ?? []).map((book) => book.title).filter(Boolean);
  return titles.length > 0 ? `${size}, from ${listSentence(titles)}.` : `${size}.`;
}

const SAMPLE_PAPER =
  'The paper service did not answer, so this paper was made from sample questions for the chapters you chose.';

export function ComposeAction({
  request,
  title,
  previewError,
  bookProblem,
  weightingProblem,
  onPaperSet,
}: {
  request: ComposeRequest | null;
  title: string;
  previewError: unknown;
  bookProblem: string | null;
  weightingProblem: string | null;
  onPaperSet: () => void;
}): React.ReactElement {
  const run = useComposeRun();
  const persona = useParams<{ persona?: string }>()?.persona;
  const bankRoute = ROUTE_INDEX.get(PAPER_BANK_ROUTE_KEY);
  const bank = persona && bankRoute ? paths.personaSection(persona, bankRoute.path) : null;

  const blockers: string[] = [];
  if (request === null) {
    blockers.push(
      'A curriculum and a class are both needed before a paper can be set. Go back to the first step for the curriculum and to "Who this paper is for" for the class.',
    );
  }
  if (previewError) {
    blockers.push(
      'The preview was refused. Setting the paper runs the same checks, so it would be refused for the same reason.',
    );
  }
  if (bookProblem) blockers.push(bookProblem);
  if (weightingProblem) blockers.push(weightingProblem);

  const canRun = blockers.length === 0 && request !== null && !run.isSuccess;
  const unplaceable = unplaceableSentence(run.data?.unplaceable_share);
  const summary = run.data ? setPaperSummary(run.data) : null;

  const start = (): void => {
    if (!request) return;
    run.mutate(request, { onSuccess: () => onPaperSet() });
  };

  return (
    <WizardPanel title="Set the paper" subheader="The last step, and the only one that writes anything">
      {blockers.length > 0 ? (
        <Alert severity="info" variant="outlined">
          <AlertTitle>
            {blockers.length === 1
              ? 'One thing is in the way'
              : `${blockers.length} things are in the way`}
          </AlertTitle>
          <Stack spacing={1}>
            {blockers.map((blocker) => (
              <Typography variant="body2" key={blocker}>
                {blocker}
              </Typography>
            ))}
          </Stack>
        </Alert>
      ) : null}

      {run.isError ? <RefusalNotice error={run.error} title="The paper was not set" /> : null}

      {run.isSuccess && run.data ? (
        <Alert severity="success" variant="outlined">
          <AlertTitle>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              <span>“{title}” has been set</span>
              {run.data.sample ? (
                <Tooltip title={SAMPLE_PAPER}>
                  <span>
                    <EmergeChip label="Sample data" tone="blue" />
                  </span>
                </Tooltip>
              ) : null}
            </Stack>
          </AlertTitle>
          <Stack spacing={1}>
            {summary ? <Typography variant="body2">{summary}</Typography> : null}
            <Typography variant="body2">{A_HUMAN_READS_IT}</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <CheckAnswerSheetsAction paperId={run.data.paper_id} variant="contained" />
              {bank ? (
                <Button component={NextLink} href={`${bank}?${SETTER_PAPER_PARAM}=${encodeURIComponent(run.data.paper_id)}`} size="small">
                  Open in the paper bank
                </Button>
              ) : null}
            </Stack>
            {run.data.warnings && run.data.warnings.length > 0 ? (
              <Stack spacing={0.5}>
                {run.data.warnings.map((warning) => (
                  <Typography variant="body2" key={warning}>
                    {warning}
                  </Typography>
                ))}
              </Stack>
            ) : null}
            {unplaceable ? <Typography variant="body2">{unplaceable}</Typography> : null}
          </Stack>
        </Alert>
      ) : null}

      {run.isSuccess && run.data ? (
        <PaperFiles paperId={run.data.paper_id} />
      ) : (
        <Box>
          <Button variant="contained" disabled={!canRun || run.isPending} onClick={start}>
            {run.isPending ? 'Setting the paper' : 'Set the paper'}
          </Button>
        </Box>
      )}

      <PanelNote>{SELECTS_FROM_THE_BANK}</PanelNote>
      <PanelNote>{A_REFUSAL_LEAVES_NOTHING}</PanelNote>
    </WizardPanel>
  );
}
