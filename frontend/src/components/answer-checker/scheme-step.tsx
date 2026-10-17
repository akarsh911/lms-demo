'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowRight, Info } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useApproveRubric } from '@/hooks/mutation/use-answer-checker';
import { useCheckerRubric } from '@/hooks/query/use-answer-checker';
import { failureText, trimNumber } from '@/lib/exams/exam';
import type { CheckerExamDetail } from '@/types/answer-checker';

export function SchemeStep({ exam, onNext }: { exam: CheckerExamDetail; onNext: () => void }): React.ReactElement {
  const rubric = useCheckerRubric(exam.id, exam.has_rubric);
  const approve = useApproveRubric(exam.id);

  if (!exam.has_rubric) return <WidgetEmpty message="Reading the answer key…" />;
  if (rubric.isPending) return <WidgetLoading rows={6} />;
  if (rubric.isError) return <WidgetError error={rubric.error} onRetry={() => void rubric.refetch()} />;

  const scheme = rubric.data;
  const approved = scheme.teacher_approved || exam.rubric_approved;

  const primary = approved ? (
    <Button variant="contained" size="small" endIcon={<ArrowRight size={16} />} onClick={onNext}>
      Next
    </Button>
  ) : (
    <Button variant="contained" size="small" disabled={approve.isPending} onClick={() => void approve.mutateAsync().then(onNext, () => undefined)}>
      {approve.isPending ? 'Approving…' : 'Approve scheme'}
    </Button>
  );

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Questions', value: scheme.questions.length },
          { label: 'Marks', value: trimNumber(scheme.total_marks) },
          { label: 'Status', value: approved ? 'Approved' : 'To approve', note: scheme.audit.length > 0 ? `${scheme.audit.length} to check` : undefined },
        ]}
      />
      <Card>
        <CardHeader title="Marking scheme" subheader="Compiled from the answer key" action={primary} />
        <CardContent>
          <Stack spacing={2}>
            {scheme.audit.length > 0 ? (
              <Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
                <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2 }}>
                  {scheme.audit.map((line) => (
                    <Typography component="li" variant="body2" key={line}>
                      {line}
                    </Typography>
                  ))}
                </Stack>
              </Alert>
            ) : null}
            {approve.isError ? (
              <Alert severity="error" variant="outlined">
                {failureText(approve.error)}
              </Alert>
            ) : null}
            <Stack divider={<Divider flexItem />}>
              {scheme.questions.map((question) => (
                <Stack key={question.number} direction="row" spacing={2} sx={{ py: 1.25, alignItems: 'flex-start' }}>
                  <Typography variant="subtitle2" component="h3" sx={{ minWidth: 32 }}>
                    Q{question.number}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {question.key_points.length > 0 ? (
                      <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2 }}>
                        {question.key_points.map((point) => (
                          <Typography component="li" variant="body2" key={point.id}>
                            {point.text}
                            <Box component="span" sx={{ color: 'text.secondary' }}>
                              {' '}
                              · {trimNumber(point.marks)}
                            </Box>
                          </Typography>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No points
                      </Typography>
                    )}
                  </Box>
                  <EmergeChip label={`${trimNumber(question.max_marks)} ${question.max_marks === 1 ? 'mark' : 'marks'}`} />
                  <Tooltip title={question.model_answer ? `${question.text} — ${question.model_answer}` : question.text}>
                    <Box component="span" sx={{ color: 'text.secondary', display: 'inline-flex', pt: 0.5 }} aria-label={`Question ${question.number} text`}>
                      <Info size={15} />
                    </Box>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export function SchemeCallout({ exam, onReview }: { exam: CheckerExamDetail; onReview: () => void }): React.ReactElement | null {
  const rubric = useCheckerRubric(exam.id, exam.has_rubric && !exam.rubric_approved);
  const approve = useApproveRubric(exam.id);
  if (exam.rubric_approved) return null;
  if (!exam.has_rubric) {
    return (
      <Alert severity="info" variant="outlined">
        Reading the answer key into a marking scheme…
      </Alert>
    );
  }
  const facts = rubric.data ? `${rubric.data.questions.length} questions, ${trimNumber(rubric.data.total_marks)} marks` : 'Compiled from the answer key';
  return (
    <Alert
      severity="warning"
      variant="outlined"
      action={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button size="small" onClick={onReview}>
            Review scheme
          </Button>
          <Button size="small" variant="contained" disabled={approve.isPending} onClick={() => approve.mutate()}>
            {approve.isPending ? 'Approving…' : 'Approve scheme'}
          </Button>
        </Stack>
      }
    >
      {`Marking scheme to approve before marking: ${facts}.`}
      {approve.isError ? ` ${failureText(approve.error)}` : ''}
    </Alert>
  );
}
