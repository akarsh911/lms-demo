'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { ONLINE_SOURCE_PREFIX } from '@/fixtures/online-test';
import type { SetQuestion } from '@/lib/answer-checker/paper';
import { normalisedRoll } from '@/lib/answer-checker/roster-match';
import type { ApiError } from '@/services/api';
import { onlineTestService } from '@/services/online-test';
import type { BookletRef, TypedSheet } from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';

export function TypedAnswers({ paper, questions, booklet }: { paper: Paper; questions: readonly SetQuestion[]; booklet: BookletRef }): React.ReactElement {
  const sourceId = booklet.source.startsWith(ONLINE_SOURCE_PREFIX) ? booklet.source.slice(ONLINE_SOURCE_PREFIX.length) : '';
  const sheets = useQuery<TypedSheet[], ApiError>({
    queryKey: ['answer-checker', 'online-sheets', paper.paper_id, sourceId],
    queryFn: () => onlineTestService.sheets(paper, sourceId),
    enabled: sourceId !== '',
    staleTime: Infinity,
  });
  const roll = normalisedRoll(booklet.student.roll_number);
  const sheet = sheets.data?.find((row) => normalisedRoll(row.roll) === roll);

  return (
    <Card>
      <CardHeader title="Typed answers" subheader="Submitted online, so there is no scan" />
      <CardContent>
        {sheets.isPending && sourceId ? <WidgetLoading rows={4} /> : null}
        {sheets.isError ? <WidgetError error={sheets.error} onRetry={() => void sheets.refetch()} /> : null}
        <Stack divider={<Divider flexItem />}>
          {questions.map((question) => {
            const text = sheet?.answers.find((answer) => answer.n === question.n)?.text.trim() ?? '';
            return (
              <Stack key={question.n} direction="row" spacing={2} sx={{ py: 1.5, alignItems: 'flex-start' }}>
                <Typography variant="subtitle2" sx={{ minWidth: 32 }}>
                  Q{question.n}
                </Typography>
                <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">
                    {question.text}
                  </Typography>
                  <Typography variant="body1" color={text ? 'text.primary' : 'text.secondary'}>
                    {text || 'No answer typed'}
                  </Typography>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
