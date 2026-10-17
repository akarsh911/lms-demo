'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Camera, Keyboard } from 'lucide-react';

import { Segmented } from '@/components/ui/segmented';
import type { GraspJoinView, StudentAnswer } from '@/types/grasp';

import { sampleAsFile } from '../question-source';

export type Handed = { via: 'typed'; answers: StudentAnswer[] } | { via: 'sheet'; files: File[] };

export function AnswerStep({ view, onHandIn, busy }: { view: GraspJoinView; onHandIn: (h: Handed) => void; busy: boolean }): React.ReactElement {
  const [via, setVia] = React.useState<'typed' | 'sheet'>(view.answerMode === 'typed' ? 'typed' : 'sheet');
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const [files, setFiles] = React.useState<File[]>([]);
  const filled = view.questions.filter((q) => (typed[q.id] ?? '').trim().split(/\s+/).length >= 4).length;

  return (
    <Stack spacing={2.5}>
      {view.answerMode === 'either' ? (
        <Segmented<'typed' | 'sheet'>
          ariaLabel="How you answer"
          value={via}
          onChange={setVia}
          options={[
            { value: 'sheet', label: <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Camera size={15} /><span>Upload my sheet</span></Stack> },
            { value: 'typed', label: <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Keyboard size={15} /><span>Type answers</span></Stack> },
          ]}
        />
      ) : null}

      {via === 'typed' ? (
        <Stack spacing={2}>
          {view.questions.map((q) => (
            <div key={q.id}>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>
                Q{q.number}. {q.text}{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  ({q.marks} marks)
                </Typography>
              </Typography>
              <TextField fullWidth multiline minRows={3} placeholder="Your answer" value={typed[q.id] ?? ''} onChange={(e) => setTyped({ ...typed, [q.id]: e.target.value })} />
            </div>
          ))}
          <Button variant="contained" size="large" disabled={filled === 0 || busy} loading={busy} onClick={() => onHandIn({ via: 'typed', answers: view.questions.map((q) => ({ questionId: q.id, text: typed[q.id] ?? '' })) })}>
            Hand in
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Box sx={(t) => ({ bgcolor: t.brand.surface, border: `1px solid ${t.brand.line}`, borderRadius: `${t.band.radius.md}px`, p: 2 })}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              The questions
            </Typography>
            {view.questions.map((q) => (
              <Typography key={q.id} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Q{q.number}. {q.text}
              </Typography>
            ))}
          </Box>
          <Box component="label" sx={(t) => ({ border: `2px dashed ${t.brand.line2}`, borderRadius: `${t.band.radius.md}px`, p: 3.5, textAlign: 'center', cursor: 'pointer', bgcolor: t.brand.subtle })}>
            <input hidden type="file" multiple accept="image/*,application/pdf" onChange={(e) => (setFiles([...files, ...Array.from(e.target.files ?? [])]), (e.target.value = ''))} />
            <Camera size={30} />
            <Typography variant="h6" component="p" sx={{ mt: 1 }}>
              {files.length ? `${files.length} page${files.length > 1 ? 's' : ''} added · add another` : 'Photograph your answer sheet'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              A photo of each page, or a PDF.
            </Typography>
          </Box>
          {files.length ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              {files.map((f, i) => (
                <Chip key={`${f.name}-${i}`} label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} />
              ))}
            </Stack>
          ) : null}
          {view.sampleSheets.length > 0 && files.length === 0 ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Demo sheets:
              </Typography>
              {view.sampleSheets.map((s) => (
                <Chip key={s.file} size="small" variant="outlined" label={s.label} onClick={() => void sampleAsFile(s.file).then((f) => setFiles([f]))} />
              ))}
            </Stack>
          ) : null}
          <Button variant="contained" size="large" disabled={files.length === 0 || busy} loading={busy} onClick={() => onHandIn({ via: 'sheet', files })}>
            Hand in
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
