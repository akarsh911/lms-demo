'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { FileText } from 'lucide-react';

import { QuestionPaperDialog } from '@/components/grades/question-paper-dialog';
import { CalendarBoard } from '@/components/school/years/year-calendar';
import { useUrlState } from '@/components/school/url-state';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMyCalendar } from '@/hooks/query/use-school-life';
import { useReach } from '@/hooks/query/use-reach';
import { formatDay } from '@/lib/dates';
import type { DateSheetExam } from '@/types/my-calendar';

function ExamSheet({ exam, teaching, onPaper }: { exam: DateSheetExam; teaching: boolean; onPaper: (id: string) => void }): React.ReactElement {
  const done = exam.papers.every((p) => p.held);
  return (
    <Card>
      <CardHeader
        title={exam.name}
        subheader={`${formatDay(exam.start)}${exam.end !== exam.start ? ` to ${formatDay(exam.end)}` : ''} · ${exam.papers.length} ${exam.papers.length === 1 ? 'paper' : 'papers'}`}
        action={<EmergeChip label={done ? 'Over' : exam.start <= new Date().toISOString().slice(0, 10) ? 'Under way' : 'Coming up'} tone={done ? 'grey' : 'rose'} />}
        sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
      />
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Subject</TableCell>
              {teaching ? <TableCell>Class</TableCell> : null}
              <TableCell>Time</TableCell>
              <TableCell align="right">Marks</TableCell>
              <TableCell align="right">Question paper</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {exam.papers.map((p) => (
              <TableRow key={p.exam_subject_id} sx={{ opacity: p.held ? 0.75 : 1 }}>
                <TableCell>{formatDay(p.date)}</TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{p.subject}</TableCell>
                {teaching ? <TableCell>{p.section}</TableCell> : null}
                <TableCell>
                  {p.start} to {p.end}
                </TableCell>
                <TableCell align="right">{p.max_marks}</TableCell>
                <TableCell align="right">
                  {p.held ? (
                    <Button size="small" startIcon={<FileText size={14} />} onClick={() => onPaper(p.exam_subject_id)}>
                      View
                    </Button>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      After the paper
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

// A teacher's or a pupil's own year: the school's events for their classes, their own plans, and the date sheet.
export function MyCalendar(): React.ReactElement {
  const { get, put } = useUrlState();
  const { data, isPending, isError, error, refetch } = useMyCalendar();
  const teaching = useReach()?.kind === 'teaching';
  const [paper, setPaper] = React.useState<string | null>(null);
  const tab = get('tab') === 'dates' ? 'dates' : 'calendar';
  if (isPending) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  return (
    <Stack spacing={2}>
      <Tabs value={tab} onChange={(_, v: string) => put({ tab: v === 'dates' ? 'dates' : null })} aria-label="Calendar views">
        <Tab value="calendar" label="Calendar" />
        <Tab value="dates" label="Date sheet" />
      </Tabs>
      {tab === 'calendar' ? (
        <CalendarBoard events={data.events} from={data.year.start} to={data.year.end} yearName={data.year.name} />
      ) : data.date_sheet.length === 0 ? (
        <Card>
          <EmptyState title="No examinations yet" body={teaching ? 'Papers for the classes you teach appear here once an examination is set.' : 'Your papers appear here once an examination is set for your class.'} />
        </Card>
      ) : (
        data.date_sheet.map((exam) => <ExamSheet key={exam.exam_id} exam={exam} teaching={teaching} onPaper={setPaper} />)
      )}
      {paper ? <QuestionPaperDialog examSubjectId={paper} onClose={() => setPaper(null)} /> : null}
    </Stack>
  );
}
