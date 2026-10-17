'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { Camera, Keyboard, Link2, Shuffle } from 'lucide-react';

import { Segmented } from '@/components/ui/segmented';
import { useCreateGraspCheck } from '@/hooks/mutation/use-grasp';
import { paths } from '@/paths';
import type { AnswerMode } from '@/types/grasp';

import { type DraftQuestion, QuestionSource } from './question-source';

const SECTIONS = ['Class 10 A', 'Class 10 B', 'Class 10 C', 'Class 9 A', 'Class 9 B'] as const;

const MODES: readonly { value: AnswerMode; icon: React.ReactNode; title: string; body: string }[] = [
  { value: 'either', icon: <Shuffle size={18} />, title: 'Either', body: 'Each student types, or photographs their sheet.' },
  { value: 'typed', icon: <Keyboard size={18} />, title: 'Type each answer', body: 'A box per question.' },
  { value: 'sheet', icon: <Camera size={18} />, title: 'Upload the answer sheet', body: 'Photo or PDF of written work.' },
];

function Step({ n, title, subheader, children }: { n: number; title: string; subheader: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Card>
      <CardHeader
        avatar={<Box sx={(t) => ({ width: 30, height: 30, borderRadius: '50%', bgcolor: t.tints.rose, color: t.onTint.rose, display: 'grid', placeItems: 'center', fontWeight: 700 })}>{n}</Box>}
        title={title}
        subheader={subheader}
      />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function GraspComposer({ personaSlug }: { personaSlug: string }): React.ReactElement {
  const router = useRouter();
  const create = useCreateGraspCheck();
  const [questions, setQuestions] = React.useState<DraftQuestion[]>([]);
  const [setId, setSetId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [section, setSection] = React.useState<string>(SECTIONS[0]);
  const [answerMode, setAnswerMode] = React.useState<AnswerMode>('either');
  const [checkCount, setCheckCount] = React.useState<'3' | '4'>('4');
  const [seconds, setSeconds] = React.useState(7);

  const ready = questions.length > 0 && questions.every((q) => q.text.trim().length > 0) && title.trim() && subject.trim();

  const submit = (): void =>
    create.mutate(
      { title: title.trim(), subject: subject.trim(), section, answerMode, checkCount: checkCount === '3' ? 3 : 4, seconds, setId, questions: questions.map((q, i) => ({ id: q.id, number: i + 1, text: q.text.trim(), marks: q.marks })) },
      { onSuccess: (c) => router.push(`${paths.personaSection(personaSlug, `grasp/${c.id}`)}?share=1`) },
    );

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 3, alignItems: 'start' }}>
      <Stack spacing={2.5}>
        <Step n={1} title="The homework" subheader="Bring the questions in however you have them.">
          <QuestionSource
            questions={questions}
            setId={setId}
            onEdit={setQuestions}
            onLoad={(l) => {
              setQuestions(l.questions);
              setSetId(l.setId);
              if (l.title) setTitle(l.title);
              if (l.subject) setSubject(l.subject);
            }}
          />
        </Step>

        <Step n={2} title="How students answer" subheader="They never sign in. A name and roll number is enough.">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
            {MODES.map((m) => (
              <ButtonBase
                key={m.value}
                onClick={() => setAnswerMode(m.value)}
                aria-pressed={answerMode === m.value}
                sx={(t) => ({ display: 'block', textAlign: 'left', p: 2, borderRadius: `${t.band.radius.md}px`, border: `${answerMode === m.value ? 2 : 1}px solid ${answerMode === m.value ? t.palette.primary.main : t.brand.line}`, bgcolor: answerMode === m.value ? t.tints.rose : t.brand.surface })}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  {m.icon}
                  <Typography variant="h6" component="span">
                    {m.title}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {m.body}
                </Typography>
              </ButtonBase>
            ))}
          </Box>
        </Step>

        <Step n={3} title="The readback" subheader="Asked from each student's own answer, right after they hand in.">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4}>
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Timed questions
              </Typography>
              <Segmented<'3' | '4'> ariaLabel="Timed questions" value={checkCount} onChange={setCheckCount} options={[{ value: '3', label: '3' }, { value: '4', label: '4' }]} />
              <Typography variant="caption" color="text.secondary">
                Plus one untimed twin.
              </Typography>
            </Stack>
            <Stack spacing={1} sx={{ flex: 1, maxWidth: 360 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Seconds per question: {seconds}
              </Typography>
              <Slider value={seconds} min={5} max={12} step={1} marks onChange={(_, v) => setSeconds(typeof v === 'number' ? v : 7)} aria-label="Seconds per question" />
              <Typography variant="caption" color="text.secondary">
                Long enough to recall what you wrote. Too short to look it up.
              </Typography>
            </Stack>
          </Stack>
        </Step>

        <Step n={4} title="Details" subheader="What students see when they open the link.">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
            <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} sx={{ minWidth: 180 }} />
            <TextField select label="Class" value={section} onChange={(e) => setSection(e.target.value)} sx={{ minWidth: 160 }}>
              {SECTIONS.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Step>
      </Stack>

      <Card sx={{ position: { lg: 'sticky' }, top: { lg: 16 } }}>
        <CardHeader title="Ready to share" subheader="One link, one code, live results." />
        <CardContent>
          <Stack spacing={1.25}>
            <Typography variant="body2">
              <b>{questions.length || 'No'}</b> {questions.length === 1 ? 'question' : 'questions'}
              {setId ? ' · readback material ready' : questions.length ? ' · readback built from each answer' : ''}
            </Typography>
            <Typography variant="body2">Students {MODES.find((m) => m.value === answerMode)?.title.toLowerCase()}</Typography>
            <Typography variant="body2">
              {checkCount} × {seconds}s readback + 1 untimed · about {Number(checkCount) * seconds + 15} seconds
            </Typography>
            <Typography variant="body2">{section}</Typography>
            <Button variant="contained" size="large" startIcon={<Link2 size={18} />} disabled={!ready} loading={create.isPending} onClick={submit} sx={{ mt: 1 }}>
              Create GRASP link
            </Button>
            {create.error ? (
              <Typography variant="body2" color="error">
                {create.error.message}
              </Typography>
            ) : null}
            {!ready ? (
              <Typography variant="caption" color="text.secondary">
                Add the questions and a title to continue.
              </Typography>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
