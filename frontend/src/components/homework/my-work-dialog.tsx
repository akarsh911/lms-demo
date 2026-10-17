'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { FileText, Paperclip, Upload, X } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { useToast } from '@/components/ui/toast';
import { useHandIn } from '@/hooks/mutation/use-homework';
import { formatMoment } from '@/lib/dates';
import type { MyWork } from '@/types/homework';

import { TYPE } from './homework-meta';
import { MY_STATUS } from './my-work-status';

// What may still be handed in: open work, or late work where the assignment takes it, never once marked or closed.
export const canHandIn = (w: MyWork): boolean =>
  w.status !== 'graded' && w.status !== 'returned' && w.status !== 'excused' && (w.state === 'open' || (w.state === 'due' && w.late_allowed));

export function MyWorkDialog({ work, onClose }: { work: MyWork; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const handIn = useHandIn(work.id);
  const [files, setFiles] = React.useState<string[]>(work.files);
  const open = canHandIn(work);
  const marked = work.status === 'graded' || work.status === 'returned';
  const late = work.state === 'due';

  const add = (list: FileList | null): void => setFiles((prev) => [...new Set([...prev, ...[...(list ?? [])].map((f) => f.name)])]);

  return (
    <Dialog open onClose={handIn.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack spacing={0.75}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <EmergeChip label={TYPE[work.type].label} tone={TYPE[work.type].tone} />
            <EmergeChip label={MY_STATUS[work.status].label} tone={MY_STATUS[work.status].tone} dot />
          </Stack>
          <Typography variant="h4" component="span">
            {work.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {work.subject} · {work.teacher} · due {formatMoment(work.due_at)}
            {work.max_marks > 0 ? ` · ${work.max_marks} marks` : ''}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {marked ? (
            <Box sx={(theme) => ({ p: 2, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints.violet, color: theme.onTint.violet })}>
              <Typography variant="eyebrow" sx={{ color: 'inherit' }}>
                Marked
              </Typography>
              <Typography variant="figure" component="p" sx={{ color: 'inherit' }}>
                {work.marks ?? '—'}
                {work.max_marks > 0 ? ` / ${work.max_marks}` : ''}
              </Typography>
              {work.feedback ? (
                <Typography variant="body2" sx={{ color: 'inherit', mt: 0.5 }}>
                  “{work.feedback}”
                </Typography>
              ) : null}
            </Box>
          ) : null}

          {work.instructions || work.description ? (
            <Stack spacing={0.75}>
              <Typography variant="subtitle2">What to do</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {work.instructions || work.description}
              </Typography>
            </Stack>
          ) : null}

          {work.attachments.length > 0 ? (
            <Stack spacing={0.75}>
              <Typography variant="subtitle2">From your teacher</Typography>
              {work.attachments.map((a) => (
                <Stack key={a.name} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Paperclip size={14} aria-hidden />
                  <Typography variant="body2">{a.name}</Typography>
                </Stack>
              ))}
            </Stack>
          ) : null}

          <Stack spacing={1}>
            <Typography variant="subtitle2">Your work</Typography>
            {files.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {open ? 'Nothing attached yet.' : 'Nothing was handed in.'}
              </Typography>
            ) : (
              files.map((name) => (
                <Stack key={name} direction="row" spacing={1} sx={(theme) => ({ alignItems: 'center', px: 1.5, py: 0.75, borderRadius: `${theme.band.radius.sm}px`, border: `1px solid ${theme.brand.line2}` })}>
                  <FileText size={16} aria-hidden />
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                    {name}
                  </Typography>
                  {open ? (
                    <IconButton size="small" aria-label={`Remove ${name}`} onClick={() => setFiles((prev) => prev.filter((f) => f !== name))}>
                      <X size={14} />
                    </IconButton>
                  ) : null}
                </Stack>
              ))
            )}
            {work.submitted_at ? (
              <Typography variant="caption" color="text.secondary">
                Handed in {formatMoment(work.submitted_at)}
              </Typography>
            ) : null}
            {open ? (
              <Button component="label" variant="outlined" startIcon={<Upload size={16} />} sx={{ alignSelf: 'flex-start' }}>
                Attach Files
                <input hidden type="file" multiple onChange={(e) => add(e.target.files)} />
              </Button>
            ) : null}
          </Stack>

          {open && late ? <Alert severity="warning" variant="outlined">The due date has passed. Your teacher will see this was handed in late.</Alert> : null}
          {!open && !marked && work.state !== 'open' ? <Alert severity="info" variant="outlined">This assignment no longer takes work.</Alert> : null}
          {handIn.error ? <Alert severity="error">{handIn.error.message}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={handIn.isPending}>
          Close
        </Button>
        {open ? (
          <Button
            variant="contained"
            loading={handIn.isPending}
            disabled={files.length === 0}
            onClick={() =>
              handIn.mutate(
                { files },
                {
                  onSuccess: () => {
                    notify(`${work.title} handed in`);
                    onClose();
                  },
                },
              )
            }
          >
            {work.submitted_at ? 'Hand In Again' : 'Hand In'}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
