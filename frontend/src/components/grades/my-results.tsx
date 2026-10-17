'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { useUrlState } from '@/components/school/url-state';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useStudentGrades } from '@/hooks/query/use-grades';

import { StudentGradesView } from './student-grades';

// A pupil's own results: the year, one examination or one subject, read without anyone else's names beside them.
export function MyResults({ studentId }: { studentId: string }): React.ReactElement {
  const { get, put } = useUrlState();
  const sessionId = get('session') ?? '';
  const examId = get('exam') ?? '';
  const subject = get('subject') ?? '';
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useStudentGrades(studentId, sessionId || undefined);

  if (isPending) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const exam = data.exams.find((e) => e.exam_id === examId);
  const subjects = data.subjects.map((s) => s.subject);

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField select size="small" label="Academic year" value={data.session_id} onChange={(event) => put({ session: event.target.value, exam: null })} sx={{ minWidth: 180 }}>
              {data.sessions.map((session) => (
                <MenuItem key={session.id} value={session.id}>
                  {session.name}
                  {session.current ? ' · current' : ''}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Examination" value={exam ? examId : ''} onChange={(event) => put({ exam: event.target.value || null })} sx={{ minWidth: 200 }}>
              <MenuItem value="">Whole year</MenuItem>
              {data.exams.map((e) => (
                <MenuItem key={e.exam_id} value={e.exam_id}>
                  {e.name}
                  {e.published ? '' : ' · upcoming'}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Subject" value={subjects.includes(subject) ? subject : ''} onChange={(event) => put({ subject: event.target.value || null })} sx={{ minWidth: 170 }}>
              <MenuItem value="">All subjects</MenuItem>
              {subjects.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>
      <Stack sx={{ minWidth: 0, opacity: isPlaceholderData ? 0.55 : 1, transition: 'opacity 160ms' }}>
        <StudentGradesView data={data} examId={exam ? examId : ''} subject={subjects.includes(subject) ? subject : ''} onExam={(next) => put({ exam: next || null })} />
      </Stack>
    </Stack>
  );
}
