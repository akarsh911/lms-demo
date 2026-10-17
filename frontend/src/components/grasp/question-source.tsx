'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { BookMarked, Keyboard, Plus, Trash2, Upload } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { Segmented } from '@/components/ui/segmented';
import { useReadPaper } from '@/hooks/mutation/use-grasp';
import { useGraspBank } from '@/hooks/query/use-grasp';
import type { BankSet } from '@/types/grasp';

import { ScanPreview } from './scan-preview';

export interface DraftQuestion {
  id: string;
  text: string;
  marks: number;
}

type Source = 'bank' | 'upload' | 'type';

let nextId = 0;
export const blankQuestion = (): DraftQuestion => ({ id: `new-${(nextId += 1)}`, text: '', marks: 2 });

export async function sampleAsFile(url: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], url.split('/').pop() ?? 'sample', { type: blob.type });
}

export function QuestionSource({
  questions,
  setId,
  onLoad,
  onEdit,
}: {
  questions: readonly DraftQuestion[];
  setId: string | null;
  onLoad: (load: { questions: DraftQuestion[]; setId: string | null; title?: string; subject?: string; note?: string }) => void;
  onEdit: (questions: DraftQuestion[]) => void;
}): React.ReactElement {
  const [source, setSource] = React.useState<Source>('upload');
  const [reading, setReading] = React.useState<File[] | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const bank = useGraspBank();
  const readPaper = useReadPaper();
  const papers = bank.data?.samples.filter((s) => s.kind === 'paper') ?? [];

  const fromSet = (s: BankSet, why: string): void => {
    onLoad({ questions: s.questions.map((q) => ({ id: q.id, text: q.text, marks: q.marks })), setId: s.id, title: s.title, subject: s.subject });
    setNote(why);
  };

  const read = (file: File): void => {
    setReading([file]);
    setNote(null);
    readPaper.mutate(file, {
      onSuccess: (p) => {
        onLoad({ questions: p.questions.map((q) => ({ id: q.id, text: q.text, marks: q.marks })), setId: p.setId, title: p.title, subject: p.subject });
        setNote(`Read ${p.questions.length} questions from ${file.name}. Check them below.`);
      },
      onSettled: () => setReading(null),
    });
  };

  return (
    <Stack spacing={2}>
      <Segmented<Source>
        ariaLabel="Where the questions come from"
        value={source}
        onChange={setSource}
        options={[
          { value: 'upload', label: <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Upload size={15} /><span>Upload a paper</span></Stack> },
          { value: 'bank', label: <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><BookMarked size={15} /><span>Question bank</span></Stack> },
          { value: 'type', label: <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Keyboard size={15} /><span>Type them</span></Stack> },
        ]}
      />

      {source === 'upload' ? (
        reading ? (
          <Box sx={{ py: 2 }}>
            <ScanPreview files={reading} active label="Reading the paper and finding each question…" />
          </Box>
        ) : (
          <Stack spacing={1.5}>
            <Box
              component="label"
              onDragOver={(e: React.DragEvent) => e.preventDefault()}
              onDrop={(e: React.DragEvent) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) read(f);
              }}
              sx={(t) => ({ border: `2px dashed ${t.brand.line2}`, borderRadius: `${t.band.radius.md}px`, p: 4, textAlign: 'center', cursor: 'pointer', bgcolor: t.brand.subtle, '&:hover': { borderColor: t.palette.primary.main } })}
            >
              <input
                hidden
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) read(f);
                  e.target.value = '';
                }}
              />
              <Upload size={28} />
              <Typography variant="h6" component="p" sx={{ mt: 1 }}>
                Drop a question paper, or click to choose
              </Typography>
              <Typography variant="body2" color="text.secondary">
                PDF, a phone photo, a scan or a handwritten sheet. Nobody retypes anything.
              </Typography>
            </Box>
            {papers.length > 0 ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Sample papers:
                </Typography>
                {papers.map((p) => (
                  <Chip key={p.file} label={p.label} size="small" variant="outlined" onClick={() => void sampleAsFile(p.file).then(read)} />
                ))}
              </Stack>
            ) : null}
          </Stack>
        )
      ) : null}

      {source === 'bank' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {bank.data?.sets.map((s) => (
            <ButtonBase
              key={s.id}
              onClick={() => fromSet(s, `Loaded ${s.questions.length} questions from the bank.`)}
              sx={(t) => ({ display: 'block', textAlign: 'left', p: 2, borderRadius: `${t.band.radius.md}px`, border: `${setId === s.id ? 2 : 1}px solid ${setId === s.id ? t.palette.primary.main : t.brand.line}`, bgcolor: t.brand.surface })}
            >
              <EmergeChip label={`${s.subject} · ${s.grade}`} tone={s.kind === 'problem-set' ? 'indigo' : 'teal'} />
              <Typography variant="h6" component="p" sx={{ mt: 1 }}>
                {s.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {s.questions.length} {s.kind === 'problem-set' ? 'problems' : 'questions'}
              </Typography>
            </ButtonBase>
          ))}
        </Box>
      ) : null}

      {note ? (
        <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
          {note}
        </Typography>
      ) : null}

      {questions.length > 0 || source === 'type' ? (
        <Stack spacing={1.25}>
          {questions.map((q, i) => (
            <Stack key={q.id} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Typography sx={{ fontWeight: 700, pt: 1, width: 28, flex: 'none' }}>Q{i + 1}</Typography>
              <TextField
                fullWidth
                multiline
                minRows={1}
                size="small"
                placeholder="Write the question"
                value={q.text}
                onChange={(e) => onEdit(questions.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)))}
              />
              <TextField
                size="small"
                type="number"
                label="Marks"
                value={q.marks}
                onChange={(e) => onEdit(questions.map((x) => (x.id === q.id ? { ...x, marks: Number(e.target.value) || 1 } : x)))}
                sx={{ width: 84, flex: 'none' }}
              />
              <IconButton aria-label={`Remove question ${i + 1}`} onClick={() => onEdit(questions.filter((x) => x.id !== q.id))}>
                <Trash2 size={16} />
              </IconButton>
            </Stack>
          ))}
          <Button variant="text" startIcon={<Plus size={16} />} sx={{ alignSelf: 'flex-start' }} onClick={() => onEdit([...questions, blankQuestion()])}>
            Add a question
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
