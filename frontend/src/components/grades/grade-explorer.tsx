'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, UserRound } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { Avatar } from '@/components/ui/row';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useClassmates, useStudentGrades, useStudentSearch } from '@/hooks/query/use-grades';
import { paths } from '@/paths';
import type { StudentOption } from '@/types/grades';

import { ClassmatesPanel } from './classmates-panel';
import { StudentGradesView } from './student-grades';

// One pupil's grades with every lever on the page: who, which year, which examination, which subject. The URL carries all four, so a link reopens the same view.
export function GradeExplorer({ studentId, personaSlug }: { studentId: string; personaSlug: string }): React.ReactElement {
  const router = useRouter();
  const { get, put } = useUrlState();
  const sessionId = get('session') ?? '';
  const examId = get('exam') ?? '';
  const subject = get('subject') ?? '';
  const [query, setQuery] = React.useState('');
  const scope = get('scope') === 'class' ? 'class' : 'section';
  const rosterClass = get('rclass') ?? undefined;
  const rosterSection = get('rsection') ?? undefined;
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useStudentGrades(studentId, sessionId || undefined);
  const search = useStudentSearch(query);
  const roster = useClassmates(studentId, sessionId || undefined, scope, rosterClass, rosterSection);

  // A pupil change keeps the year, examination, subject and scope, and replaces history so the arrows do not bury the back button.
  const go = React.useCallback(
    (id: string): void => {
      if (id === studentId) return;
      const params = new URLSearchParams(window.location.search);
      router.replace(paths.personaSection(personaSlug, `grades/students/${id}${params.toString() ? `?${params.toString()}` : ''}`), { scroll: false });
    },
    [router, personaSlug, studentId],
  );
  const peers = roster.data?.students ?? [];
  const index = peers.findIndex((p) => p.id === studentId);
  const prev = index > 0 ? peers[index - 1] : undefined;
  // Outside the roster being browsed, the next arrow starts it.
  const next = index === -1 ? peers[0] : index < peers.length - 1 ? peers[index + 1] : undefined;

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof Element && event.target.closest('input, textarea, [role="listbox"], [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' && prev) go(prev.id);
      if (event.key === 'ArrowRight' && next) go(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, go]);

  if (isPending) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const current: StudentOption = { id: studentId, name: data.name, admission_number: data.admission_number, where: data.class_name ? `${data.class_name}${data.section_name ? ` ${data.section_name}` : ''}` : '' };
  const options = [current, ...(search.data ?? []).filter((option) => option.id !== studentId)];
  const exam = data.exams.find((e) => e.exam_id === examId);
  const subjects = data.subjects.map((s) => s.subject);
  const switchStudent = (option: StudentOption | null): void => {
    if (option) go(option.id);
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <Button component={NextLink} href={exam ? paths.personaSection(personaSlug, `grades/exams/${exam.exam_id}`) : paths.personaSection(personaSlug, 'grades')} size="small" startIcon={<ArrowLeft size={14} />} sx={{ ml: -1, mb: 1 }}>
            {exam ? exam.name : 'Examinations'}
          </Button>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Avatar name={data.name} size={52} />
            <div>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Typography variant="h2" component="h1">
                  {data.name}
                </Typography>
                <Tooltip title={prev ? `Previous · ${prev.name}` : 'First in the list'}>
                  <span>
                    <IconButton size="small" aria-label="Previous pupil" disabled={!prev} onClick={() => prev && go(prev.id)} sx={{ ml: 1 }}>
                      <ChevronLeft size={18} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'center' }}>
                  {index >= 0 ? `${index + 1} of ${peers.length}` : peers.length > 0 ? `– of ${peers.length}` : ''}
                </Typography>
                <Tooltip title={next ? `Next · ${next.name}` : 'Last in the list'}>
                  <span>
                    <IconButton size="small" aria-label="Next pupil" disabled={!next} onClick={() => next && go(next.id)}>
                      <ChevronRight size={18} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
              <Typography variant="body1" color="text.secondary">
                {data.admission_number}
                {current.where ? ` · ${current.where}` : ''}
                {data.sessions.length > 1 ? ` · ${data.sessions.length} academic years on record` : ''}
              </Typography>
            </div>
          </Stack>
        </div>
        <Button component={NextLink} href={paths.personaSection(personaSlug, `people/students/${studentId}`)} variant="outlined" startIcon={<UserRound size={16} />}>
          Student record
        </Button>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
            <Autocomplete
              size="small"
              options={options}
              value={current}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={(x) => x}
              onInputChange={(_, value, reason) => {
                if (reason === 'input') setQuery(value);
              }}
              onChange={(_, option) => switchStudent(option)}
              renderOption={(props, option) => {
                const { key, ...rest } = props;
                return (
                  <li key={key} {...rest}>
                    <Stack sx={{ minWidth: 0 }}>
                      <Typography variant="body2">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.admission_number}
                        {option.where ? ` · ${option.where}` : ''}
                      </Typography>
                    </Stack>
                  </li>
                );
              }}
              renderInput={(params) => <TextField {...params} label="Student" placeholder="Name or admission number" />}
              sx={{ flex: '1 1 280px', minWidth: 240 }}
            />
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

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '280px minmax(0, 1fr)' }, alignItems: 'start' }}>
        <ClassmatesPanel
          list={roster.data}
          currentId={studentId}
          onRoster={(gradeId, sectionId) => put({ rclass: gradeId || null, rsection: sectionId || null, scope: sectionId ? null : 'class' })}
          onPick={go}
        />
        <Stack sx={{ minWidth: 0, opacity: isPlaceholderData ? 0.55 : 1, transition: 'opacity 160ms' }}>
          <StudentGradesView data={data} examId={exam ? examId : ''} subject={subjects.includes(subject) ? subject : ''} onExam={(nextExam) => put({ exam: nextExam || null })} />
        </Stack>
      </Box>
    </Stack>
  );
}
