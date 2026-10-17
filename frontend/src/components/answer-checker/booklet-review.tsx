'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import { FileDown, Gauge, MessageSquareText } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useRemarkBooklet, useSignOff } from '@/hooks/mutation/use-answer-checker';
import { useCheckerHealth, useMarkedBooklet } from '@/hooks/query/use-answer-checker';
import { effectiveAnnotations } from '@/lib/answer-checker/marks';
import type { SetQuestion } from '@/lib/answer-checker/paper';
import { failureText, trimNumber } from '@/lib/exams/exam';
import { answerCheckerService } from '@/services/answer-checker';
import type { Annotation, PresetStrictness } from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';
import type { EnrichedPassage } from '@/types/retrieval';

import { ActionIcon } from './action-icon';
import { BookletPageView } from './booklet-page';
import { QuestionReview } from './question-review';
import { TypedAnswers } from './typed-answers';

type References = readonly ({ data?: EnrichedPassage[]; isPending: boolean; isError: boolean } | undefined)[];

const LEVELS: readonly PresetStrictness[] = ['easy', 'medium', 'strict'];

export function BookletReview({
  examId,
  bookletId,
  questions,
  references,
  paper,
}: {
  paper: Paper;
  examId: string;
  bookletId: string;
  questions: readonly SetQuestion[];
  references: References;
}): React.ReactElement {
  const marked = useMarkedBooklet(examId, bookletId);
  const health = useCheckerHealth();
  const remark = useRemarkBooklet(examId, bookletId);
  const signOff = useSignOff(examId, bookletId);
  const [pageIndex, setPageIndex] = React.useState(1);
  const [menu, setMenu] = React.useState<HTMLElement | null>(null);

  if (marked.isPending) return <WidgetLoading rows={8} />;
  if (marked.isError) return <WidgetError error={marked.error} onRetry={() => void marked.refetch()} />;

  const { ref, booklet, result, review } = marked.data;
  const pages = booklet.pages;
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const annotations: Annotation[] = result ? effectiveAnnotations(result) : [];
  const signed = ref.state === 'signed_off';
  const pdf = answerCheckerService.pdfUrl(examId, bookletId);
  const label = (level: string): string => health.data?.strictness[level as PresetStrictness]?.label ?? level;

  const primary = signed ? (
    <EmergeChip label="Signed off" tone="green" dot />
  ) : (
    <Button size="small" variant="contained" disabled={!result || signOff.isPending} onClick={() => signOff.mutate()}>
      Sign off
    </Button>
  );

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 300px', lg: 'minmax(0, 1fr) 340px' }, alignItems: 'start' }}>
      {ref.page_count === 0 ? (
        <TypedAnswers paper={paper} questions={questions} booklet={ref} />
      ) : (
        <Card>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
            <Tabs value={Math.min(pageIndex, pages.length - 1)} onChange={(_, next: number) => setPageIndex(next)} variant="scrollable" allowScrollButtonsMobile aria-label="Pages">
              {pages.map((entry) => (
                <Tab key={entry.index} value={entry.index} label={entry.index === 0 ? 'Cover' : `Page ${entry.index}`} />
              ))}
            </Tabs>
          </Box>
          <CardContent>
            {page ? (
              <BookletPageView
                page={page}
                src={answerCheckerService.pageImageUrl(examId, bookletId, page.index)}
                annotations={annotations}
                label={`${ref.student.name ?? 'Booklet'}, ${page.index === 0 ? 'cover' : `page ${page.index}`}`}
              />
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card sx={{ position: { md: 'sticky' }, top: { md: 16 }, maxHeight: { md: 'calc(100vh - 32px)' }, overflowY: { md: 'auto' } }}>
        <CardHeader
          title={result ? `${trimNumber(result.total_marks)} / ${trimNumber(result.total_possible)}` : '—'}
          subheader={`${ref.student.name ?? 'Unnamed'} · ${result ? label(result.strictness) : 'not marked'}`}
          action={primary}
        />
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', px: 2, pb: 1 }}>
          {review.length > 0 ? (
            <Tooltip title={review.join(' · ')}>
              <span>
                <EmergeChip label={`${review.length} to check`} tone="orange" dot />
              </span>
            </Tooltip>
          ) : null}
          <Box sx={{ flex: 1 }} />
          {result?.overall_comment ? (
            <Tooltip title={result.overall_comment}>
              <Box component="span" sx={{ display: 'inline-flex', color: 'text.secondary', p: 0.75 }} aria-label="Overall remark">
                <MessageSquareText size={15} />
              </Box>
            </Tooltip>
          ) : null}
          <ActionIcon label="Re-mark at…" disabled={!result || remark.isPending} onClick={(event) => setMenu(event.currentTarget)}>
            <Gauge size={15} />
          </ActionIcon>
          {pdf && marked.data.pdf_available ? (
            <ActionIcon label="Checked PDF" href={pdf}>
              <FileDown size={15} />
            </ActionIcon>
          ) : null}
        </Stack>
        <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
          {LEVELS.map((option) => (
            <MenuItem
              key={option}
              selected={result?.strictness === option}
              onClick={() => {
                setMenu(null);
                remark.mutate(option);
              }}
            >
              {label(option)}
            </MenuItem>
          ))}
        </Menu>
        <Box sx={{ px: 2 }}>
          {remark.data ? (
            <Alert severity="info" variant="outlined" onClose={() => remark.reset()} sx={{ py: 0, mb: 1 }}>
              {trimNumber(remark.data.total_before ?? 0)} → {trimNumber(remark.data.total_after)}
            </Alert>
          ) : null}
          {remark.isError || signOff.isError ? (
            <Alert severity="error" variant="outlined" sx={{ py: 0, mb: 1 }}>
              {failureText(remark.error ?? signOff.error)}
            </Alert>
          ) : null}
        </Box>
        <Divider />
        {result ? (
          <Stack divider={<Divider flexItem />} sx={{ px: 2, pb: 1 }}>
            {result.results.map((row) => {
              const index = questions.findIndex((question) => String(question.n) === row.question_number);
              return (
                <QuestionReview
                  key={row.question_number}
                  examId={examId}
                  bookletId={bookletId}
                  result={row}
                  text={questions[index]?.text ?? null}
                  references={index >= 0 ? references[index] : undefined}
                />
              );
            })}
          </Stack>
        ) : null}
      </Card>
    </Box>
  );
}
