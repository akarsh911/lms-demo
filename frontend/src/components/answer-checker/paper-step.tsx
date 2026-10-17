'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ArrowRight, BookOpen } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { Segmented } from '@/components/ui/segmented';
import { useQuestionReferences } from '@/hooks/query/use-answer-checker';
import { questionTotal, type CheckingMode, type SetQuestion } from '@/lib/answer-checker/paper';
import { trimNumber } from '@/lib/exams/exam';
import type { Paper } from '@/types/papersetter';

import { ActionIcon } from './action-icon';
import { ReferencePassages } from './reference-passage';

const MODE_LABELS: Record<CheckingMode, string> = {
  scan: 'Booklets',
  omr: 'Bubble Sheets',
};

export function PaperStep({
  paper,
  questions,
  mode,
  modes,
  onMode,
  onNext,
}: {
  paper: Paper;
  questions: readonly SetQuestion[];
  mode: CheckingMode;
  modes: readonly CheckingMode[];
  onMode: (mode: CheckingMode) => void;
  onNext: () => void;
}): React.ReactElement {
  const references = useQuestionReferences(paper, questions);
  const [open, setOpen] = React.useState<number | null>(null);
  const total = questionTotal(questions);
  const mismatch = typeof paper.marks === 'number' && paper.marks !== total;

  const facts = [
    { label: 'Questions', value: questions.length },
    { label: 'Marks', value: trimNumber(total), note: mismatch ? `Labelled ${trimNumber(paper.marks ?? 0)}` : undefined },
    { label: 'Answered on', value: MODE_LABELS[mode] },
  ];

  return (
    <Stack spacing={2}>
      <FactStrip facts={facts} />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CardToolbar
              start={modes.length > 1 ? <Segmented ariaLabel="Answered on" value={mode} onChange={onMode} options={modes.map((option) => ({ value: option, label: MODE_LABELS[option] }))} /> : undefined}
              summary={modes.length > 1 ? undefined : 'Questions from the paper setter'}
            >
              <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={onNext}>
                Next
              </Button>
            </CardToolbar>
            <Stack divider={<Divider flexItem />}>
              {questions.map((question, index) => {
                const reference = references[index];
                const shown = open === question.n;
                return (
                  <Box key={question.n} sx={{ py: 1.25 }}>
                    <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
                      <Typography variant="subtitle2" component="h3" sx={{ minWidth: 32 }}>
                        Q{question.n}
                      </Typography>
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                        {question.text}
                      </Typography>
                      <EmergeChip label={`${trimNumber(question.marks)} ${question.marks === 1 ? 'mark' : 'marks'}`} />
                      <ActionIcon label={shown ? 'Hide source' : 'Textbook source'} onClick={() => setOpen(shown ? null : question.n)}>
                        <BookOpen size={15} />
                      </ActionIcon>
                    </Stack>
                    <Collapse in={shown} unmountOnExit>
                      <Box sx={{ pl: 6, pt: 1 }}>
                        <ReferencePassages passages={reference?.data} pending={Boolean(reference?.isPending)} failed={Boolean(reference?.isError)} />
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
