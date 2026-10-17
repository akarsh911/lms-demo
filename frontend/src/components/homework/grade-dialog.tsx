'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ChevronLeft, ChevronRight, Paperclip } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { useToast } from '@/components/ui/toast';
import { useGradeWork } from '@/hooks/mutation/use-homework';
import { formatMoment } from '@/lib/dates';
import type { HomeworkDetail, StudentWork } from '@/types/homework';

import { WORK } from './homework-meta';

const QUICK = ['Well done.', 'Show your working.', 'Check your units.', 'Revise this chapter before the test.', 'See me after class.'];

// Marking one student's work, then the next: the queue is whatever the table was showing.
export function GradeDialog({ homework, queue, start, onClose }: { homework: HomeworkDetail; queue: readonly StudentWork[]; start: number; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const grade = useGradeWork(homework.id);
  const [index, setIndex] = React.useState(start);
  const work = queue[index];
  const [marks, setMarks] = React.useState(work?.marks === null || work?.marks === undefined ? '' : String(work.marks));
  const [feedback, setFeedback] = React.useState(work?.feedback ?? '');

  const go = (next: number): void => {
    const target = queue[next];
    if (!target) return;
    setIndex(next);
    setMarks(target.marks === null ? '' : String(target.marks));
    setFeedback(target.feedback ?? '');
    grade.reset();
  };

  if (!work) return <Dialog open onClose={onClose} />;
  const value = marks.trim() === '' ? null : Number(marks);
  const bad = value !== null && (!Number.isFinite(value) || value < 0 || value > homework.max_marks);

  const save = (returnNow: boolean): void =>
    grade.mutate(
      { student_id: work.student_id, marks: value, feedback, return_now: returnNow },
      {
        onSuccess: () => {
          notify(`${work.name}: ${value === null ? 'feedback saved' : `${value} / ${homework.max_marks}${returnNow ? ', returned' : ''}`}`);
          if (index + 1 < queue.length) go(index + 1);
          else onClose();
        },
      },
    );

  return (
    <Dialog open onClose={grade.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h4" component="span" noWrap>
              {work.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {work.roll ? `Roll ${work.roll} · ` : ''}
              {index + 1} of {queue.length}
            </Typography>
          </Stack>
          <IconButton aria-label="Previous student" disabled={index === 0 || grade.isPending} onClick={() => go(index - 1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton aria-label="Next student" disabled={index + 1 >= queue.length || grade.isPending} onClick={() => go(index + 1)}>
            <ChevronRight size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {grade.error ? (
            <Alert severity="error" variant="outlined">
              {grade.error.message}
            </Alert>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <EmergeChip label={WORK[work.status].label} tone={WORK[work.status].tone} />
            <Typography variant="body2" color="text.secondary">
              {work.submitted_at ? `Handed in ${formatMoment(work.submitted_at)}${work.status === 'late' ? ', after the due time' : ''}` : 'Nothing handed in. Marks entered here record work given on paper.'}
            </Typography>
          </Stack>
          {work.files.length > 0 ? (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {work.files.map((f) => (
                <Chip key={f} icon={<Paperclip size={14} />} label={f} variant="outlined" />
              ))}
            </Stack>
          ) : null}
          <TextField
            label="Marks"
            value={marks}
            onChange={(e) => setMarks(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
            error={bad}
            helperText={bad ? `Between 0 and ${homework.max_marks}` : 'Leave empty to send feedback without marks'}
            autoFocus
            slotProps={{ input: { endAdornment: <InputAdornment position="end">/ {homework.max_marks}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !bad) save(true);
            }}
          />
          <Stack spacing={1}>
            <TextField label="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} multiline minRows={2} />
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {QUICK.map((q) => (
                <Chip key={q} size="small" label={q} onClick={() => setFeedback(feedback.trim() ? `${feedback.trim()} ${q}` : q)} />
              ))}
            </Stack>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', pl: 1, display: { xs: 'none', sm: 'block' } }}>
          Enter returns it and moves to the next student
        </Typography>
        <Button variant="outlined" onClick={() => save(false)} disabled={bad || grade.isPending}>
          Save
        </Button>
        <Button variant="contained" onClick={() => save(true)} disabled={bad} loading={grade.isPending}>
          Return to Student
        </Button>
      </DialogActions>
    </Dialog>
  );
}
