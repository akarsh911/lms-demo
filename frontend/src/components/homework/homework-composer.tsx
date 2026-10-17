'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { Theme } from '@mui/material/styles';
import { Link2, Paperclip } from 'lucide-react';

import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { useSaveHomework } from '@/hooks/mutation/use-homework';
import { useHomeworkOptions } from '@/hooks/query/use-homework';
import { formatMoment } from '@/lib/dates';
import type { AssignmentType } from '@/types/classroom';
import { HOMEWORK_TYPES, type HomeworkAttachment, type HomeworkDetail, type HomeworkScope } from '@/types/homework';

import { AttachmentsField } from './attachments-field';
import { TYPE } from './homework-meta';
import { StudentPicker } from './student-picker';

const local = (iso: string): string => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
// A week from today at five in the evening, the usual due time.
const nextWeek = (): string => {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setHours(17, 0, 0, 0);
  return local(d.toISOString());
};
const PICKED = { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } } as const;

// Setting an assignment: class, subject, the sections or the named students it is for, and when it is due.
export function HomeworkComposer({ homework, scope, onClose, onSaved }: { homework: HomeworkDetail | null; scope?: HomeworkScope; onClose: () => void; onSaved?: (ids: string[]) => void }): React.ReactElement {
  const notify = useToast();
  const options = useHomeworkOptions(true);
  const save = useSaveHomework();
  const phone = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'));
  const set = homework !== null && homework.state !== 'draft';

  const [title, setTitle] = React.useState(homework?.title ?? '');
  const [type, setType] = React.useState<AssignmentType>(homework?.type ?? 'worksheet');
  const [gradeId, setGradeId] = React.useState(homework?.grade_level_id ?? scope?.grade_level_id ?? '');
  const [subjectId, setSubjectId] = React.useState(homework?.subject_id ?? scope?.subject_id ?? '');
  const [sectionIds, setSectionIds] = React.useState<string[]>(homework ? [homework.section_id] : scope ? [scope.section_id] : []);
  const [some, setSome] = React.useState(homework?.students_only != null);
  const [studentIds, setStudentIds] = React.useState<string[]>(homework?.students_only != null ? homework.work.map((w) => w.student_id) : []);
  const [description, setDescription] = React.useState(homework?.description ?? '');
  const [instructions, setInstructions] = React.useState(homework?.instructions ?? '');
  const [files, setFiles] = React.useState<HomeworkAttachment[]>(homework?.attachments ?? []);
  const [opensLater, setOpensLater] = React.useState(homework?.state === 'scheduled');
  const [opens, setOpens] = React.useState(() => local(homework?.available_from ?? new Date(Date.now() + 86_400_000).toISOString()));
  const [due, setDue] = React.useState(() => (homework ? local(homework.due_at) : nextWeek()));
  const [max, setMax] = React.useState(String(homework?.max_marks ?? 20));
  const [late, setLate] = React.useState(homework?.late_allowed ?? true);
  const [attempts, setAttempts] = React.useState('1');

  const classes = options.data?.classes ?? [];
  const klass = classes.find((c) => c.id === gradeId);
  const subject = klass?.subjects.find((s) => s.subject_id === subjectId);
  const chosen = subject?.sections.filter((s) => sectionIds.includes(s.section_id)) ?? [];
  const pool = chosen.flatMap((s) => s.students.map((st) => ({ ...st, section: s.section })));
  const reach = some ? studentIds.filter((id) => pool.some((p) => p.student_id === id)).length : pool.length;
  const dueIso = due ? new Date(due).toISOString() : '';
  const opensIso = opensLater ? new Date(opens).toISOString() : null;
  const marks = Number(max);

  const problem = !title.trim()
    ? 'Give it a title.'
    : !subject
      ? 'Choose the class and subject.'
      : chosen.length === 0
        ? 'Choose at least one section.'
        : some && reach === 0
          ? 'Tick the students it is for.'
          : !dueIso
            ? 'Set when it is due.'
            : opensIso && opensIso >= dueIso
              ? 'It has to open before it is due.'
              : !Number.isFinite(marks) || marks < 0
                ? 'Maximum marks must be a number.'
                : null;

  const submit = (draft: boolean): void =>
    save.mutate(
      {
        id: homework?.id ?? null,
        body: {
          title,
          type,
          description,
          instructions,
          grade_level_id: gradeId,
          subject_id: subjectId,
          section_ids: sectionIds,
          student_ids: some ? studentIds : [],
          attachments: files,
          available_from: opensIso,
          due_at: dueIso,
          max_marks: marks,
          late_allowed: late,
          max_attempts: Number(attempts),
          draft,
        },
      },
      {
        onSuccess: (saved) => {
          notify(draft ? 'Saved as a draft' : homework ? 'Assignment updated' : `Set for ${saved.map((h) => h.section).join(', ')}, due ${formatMoment(dueIso)}`);
          onSaved?.(saved.map((h) => h.id));
          onClose();
        },
      },
    );

  return (
    <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="lg" fullScreen={phone}>
      <DialogTitle>{homework ? 'Edit assignment' : 'New assignment'}</DialogTitle>
      <DialogContent dividers>
        {options.isPending ? (
          <Skeleton variant="rounded" height={420} />
        ) : (
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'start' }}>
            <Stack spacing={2.5}>
              {save.error ? (
                <Alert severity="error" variant="outlined" role="alert">
                  {save.error.message}
                </Alert>
              ) : null}
              <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} required autoFocus placeholder="Worksheet: Linear equations" />
              <ToggleButtonGroup exclusive size="small" value={type} onChange={(_, next: AssignmentType | null) => next && setType(next)} aria-label="Kind of work" sx={{ flexWrap: 'wrap' }}>
                {HOMEWORK_TYPES.map((t) => (
                  <ToggleButton key={t} value={t} sx={{ gap: 0.75 }}>
                    {TYPE[t].icon}
                    {TYPE[t].label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                <TextField
                  select
                  label="Class"
                  value={gradeId}
                  disabled={homework !== null || Boolean(scope)}
                  onChange={(e) => {
                    setGradeId(e.target.value);
                    setSubjectId('');
                    setSectionIds([]);
                    setStudentIds([]);
                  }}
                >
                  {classes.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Subject"
                  value={subjectId}
                  disabled={!klass || homework !== null || Boolean(scope)}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setSectionIds([]);
                    setStudentIds([]);
                  }}
                >
                  {(klass?.subjects ?? []).map((s) => (
                    <MenuItem key={s.subject_id} value={s.subject_id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              {subject ? (
                <Stack spacing={1}>
                  <Typography variant="subtitle2">Sections</Typography>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {homework || scope ? null : (
                      <Chip
                        label="All sections"
                        variant="outlined"
                        sx={chosen.length === subject.sections.length ? PICKED : undefined}
                        onClick={() => setSectionIds(chosen.length === subject.sections.length ? [] : subject.sections.map((s) => s.section_id))}
                      />
                    )}
                    {subject.sections.map((s) => (
                      <Chip
                        key={s.section_id}
                        label={`${s.section} · ${s.teacher ?? 'no teacher'}`}
                        variant="outlined"
                        disabled={homework !== null || Boolean(scope)}
                        sx={sectionIds.includes(s.section_id) ? PICKED : undefined}
                        onClick={() => setSectionIds((prev) => (prev.includes(s.section_id) ? prev.filter((x) => x !== s.section_id) : [...prev, s.section_id]))}
                        aria-pressed={sectionIds.includes(s.section_id)}
                      />
                    ))}
                  </Stack>
                </Stack>
              ) : null}

              {chosen.length > 0 ? (
                <Stack spacing={1}>
                  <Segmented
                    ariaLabel="Who it is for"
                    value={some ? 'some' : 'all'}
                    onChange={(next) => setSome(next === 'some')}
                    options={[
                      { value: 'all', label: 'Everyone in these sections' },
                      { value: 'some', label: 'Chosen students' },
                    ]}
                  />
                  {some ? <StudentPicker sections={chosen} value={studentIds} onChange={setStudentIds} /> : null}
                </Stack>
              ) : null}

              <TextField label="What to do" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={3} placeholder="Answer questions 1 to 12 on page 84." />
              <TextField label="How to hand it in" value={instructions} onChange={(e) => setInstructions(e.target.value)} multiline minRows={2} placeholder="Upload one PDF or clear photos." />

              <AttachmentsField value={files} onChange={setFiles} />
            </Stack>

            <Stack spacing={2} sx={{ position: { md: 'sticky' }, top: 0 }}>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">Timing and marks</Typography>
                    {set ? null : (
                      <Stack spacing={1}>
                        <Segmented
                          ariaLabel="When students can see it"
                          value={opensLater ? 'later' : 'now'}
                          onChange={(next) => setOpensLater(next === 'later')}
                          options={[
                            { value: 'now', label: 'Open now' },
                            { value: 'later', label: 'Open later' },
                          ]}
                        />
                        {opensLater ? <TextField size="small" type="datetime-local" label="Opens" value={opens} onChange={(e) => setOpens(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /> : null}
                      </Stack>
                    )}
                    <TextField size="small" type="datetime-local" label="Due" value={due} onChange={(e) => setDue(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
                    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
                      <TextField size="small" type="number" label="Maximum marks" value={max} onChange={(e) => setMax(e.target.value)} slotProps={{ htmlInput: { min: 0, max: 500 } }} />
                      <TextField select size="small" label="Attempts" value={attempts} onChange={(e) => setAttempts(e.target.value)}>
                        {['1', '2', '3'].map((n) => (
                          <MenuItem key={n} value={n}>
                            {n === '1' ? 'One' : n === '2' ? 'Two' : 'Three'}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>
                    <FormControlLabel control={<Switch checked={late} onChange={(e) => setLate(e.target.checked)} />} label="Accept late work, marked as late" />
                  </Stack>
                </CardContent>
              </Card>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="subtitle1">What gets set</Typography>
                    {chosen.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        Choose a class, a subject and its sections.
                      </Typography>
                    ) : (
                      <>
                        <Typography variant="figure">{reach}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {some ? 'chosen students' : 'students'} in {chosen.map((s) => s.section).join(', ')}
                          {dueIso ? `, due ${formatMoment(dueIso)}` : ''}
                        </Typography>
                        {chosen.length > 1 && !homework ? (
                          <Typography variant="body2" color="text.secondary">
                            One assignment per section, so each is graded by its own teacher: {chosen.map((s) => `${s.section} by ${s.teacher ?? 'nobody yet'}`).join(' · ')}.
                          </Typography>
                        ) : null}
                      </>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ gap: 1, flexWrap: 'wrap' }}>
        {problem ? (
          <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto', pl: 1, width: { xs: '100%', sm: 'auto' } }}>
            {problem}
          </Typography>
        ) : null}
        <Button variant="outlined" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        {set ? null : (
          <Button variant="outlined" onClick={() => submit(true)} disabled={save.isPending || !title.trim() || chosen.length === 0}>
            Save Draft
          </Button>
        )}
        <Button variant="contained" onClick={() => submit(false)} disabled={Boolean(problem)} loading={save.isPending}>
          {set ? 'Save Changes' : opensLater ? 'Schedule' : 'Set Assignment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
