'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useStudentGrades } from '@/hooks/query/use-grades';
import { paths } from '@/paths';

import { StudentGradesView } from './student-grades';

// The explorer's reading of one pupil, inside their record: year and examination to choose, the explorer one click away.
export function StudentGradesPanel({ studentId, personaSlug, sessionId }: { studentId: string; personaSlug: string; sessionId?: string }): React.ReactElement {
  const [session, setSession] = React.useState(sessionId ?? '');
  const [examId, setExamId] = React.useState('');
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useStudentGrades(studentId, session || undefined);

  if (isPending) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const explorer = paths.personaSection(personaSlug, `grades/students/${studentId}?session=${data.session_id}${examId ? `&exam=${examId}` : ''}`);
  return (
    <Stack spacing={2} sx={{ opacity: isPlaceholderData ? 0.55 : 1, transition: 'opacity 160ms' }}>
      <CardToolbar summary={data.class_name ? `${data.class_name}${data.section_name ? ` ${data.section_name}` : ''} · ${data.exams.filter((e) => e.pct !== null).length} of ${data.exams.length} examinations held` : undefined}>
        <TextField
          select
          size="small"
          label="Academic year"
          value={data.session_id}
          onChange={(event) => {
            setSession(event.target.value);
            setExamId('');
          }}
          sx={{ minWidth: 180 }}
        >
          {data.sessions.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
              {s.current ? ' · current' : ''}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Examination" value={examId} onChange={(event) => setExamId(event.target.value)} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} sx={{ minWidth: 200 }}>
          <MenuItem value="">Whole year</MenuItem>
          {data.exams.map((e) => (
            <MenuItem key={e.exam_id} value={e.exam_id}>
              {e.name}
            </MenuItem>
          ))}
        </TextField>
        <Button component={NextLink} href={explorer} variant="outlined" endIcon={<ArrowRight size={16} />}>
          Open in grade explorer
        </Button>
      </CardToolbar>
      <StudentGradesView data={data} examId={examId} subject="" onExam={setExamId} />
    </Stack>
  );
}
