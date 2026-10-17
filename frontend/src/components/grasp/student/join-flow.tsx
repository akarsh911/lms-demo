'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { Check, EyeOff, Timer } from 'lucide-react';

import { useGraspJoinView } from '@/hooks/query/use-grasp';
import { graspService, type HandIn, type Student } from '@/services/grasp';
import type { GraspJoinView, ReadbackPrompt, ReadbackResponse, StudentAnswer } from '@/types/grasp';

import { ScanPreview } from '../scan-preview';
import { AnswerStep, type Handed } from './answer-step';
import { ReadbackRun } from './readback-run';
import { StudentFrame } from './student-frame';

type Phase =
  | { kind: 'name' }
  | { kind: 'answer'; attemptId: string }
  | { kind: 'reading'; attemptId: string; files: File[] }
  | { kind: 'review'; attemptId: string; answers: StudentAnswer[]; sheetNames: string[] }
  | { kind: 'brief'; attemptId: string; prompts: ReadbackPrompt[]; hand: HandIn }
  | { kind: 'run'; attemptId: string; prompts: ReadbackPrompt[]; hand: HandIn }
  | { kind: 'sending' }
  | { kind: 'done' };

const draw = keyframes`
  from { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  to { transform: scale(1); }
`;

function Header({ view }: { view: GraspJoinView }): React.ReactElement {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="eyebrow" color="text.secondary">
        {view.subject} · {view.section} · {view.teacher}
      </Typography>
      <Typography variant="h2" component="h1" sx={{ mt: 0.5 }}>
        {view.title}
      </Typography>
    </Box>
  );
}

function Rule({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <Box sx={(t) => ({ width: 36, height: 36, borderRadius: '50%', bgcolor: t.tints.rose, color: t.onTint.rose, display: 'grid', placeItems: 'center', flex: 'none' })}>{icon}</Box>
      <Typography sx={{ pt: 0.75 }}>{children}</Typography>
    </Stack>
  );
}

export function JoinFlow({ code, carry }: { code: string; carry: string }): React.ReactElement {
  const query = useGraspJoinView(code, carry);
  const [phase, setPhase] = React.useState<Phase>({ kind: 'name' });
  const [name, setName] = React.useState('');
  const [roll, setRoll] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const student: Student = { code, carry, name: name.trim(), roll: roll.trim() };

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitAnswers = (attemptId: string, answers: StudentAnswer[], via: 'typed' | 'sheet', sheetNames: string[]): Promise<void> =>
    run(async () => {
      const hand: HandIn = { answers, via, sheetNames };
      setPhase({ kind: 'brief', attemptId, prompts: await graspService.submitAnswers(attemptId, student, hand), hand });
    });

  const handIn = (attemptId: string, h: Handed): void => {
    if (h.via === 'typed') {
      void submitAnswers(attemptId, h.answers, 'typed', []);
      return;
    }
    setPhase({ kind: 'reading', attemptId, files: h.files });
    void run(async () => {
      const reading = await graspService.readSheet(attemptId, h.files, student);
      setPhase({ kind: 'review', attemptId, answers: [...reading.answers], sheetNames: h.files.map((f) => f.name) });
    }).then(() => setPhase((p) => (p.kind === 'reading' ? { kind: 'answer', attemptId } : p)));
  };

  const finish = (attemptId: string, hand: HandIn, responses: ReadbackResponse[]): void => {
    setPhase({ kind: 'sending' });
    void graspService
      .submitResponses(attemptId, student, hand, responses)
      .then(() => setPhase({ kind: 'done' }))
      .catch((e: unknown) => (setError(e instanceof Error ? e.message : 'Could not send. Check your connection.'), setPhase({ kind: 'done' })));
  };

  if (query.isPending)
    return (
      <StudentFrame>
        <Typography sx={{ m: 'auto' }} color="text.secondary">
          Opening…
        </Typography>
      </StudentFrame>
    );
  if (query.isError)
    return (
      <StudentFrame>
        <Stack spacing={1} sx={{ m: 'auto', textAlign: 'center' }}>
          <Typography variant="h3">Code not found</Typography>
          <Typography color="text.secondary">{query.error.message}</Typography>
        </Stack>
      </StudentFrame>
    );
  const view = query.data;

  if (view.status === 'closed' && phase.kind === 'name')
    return (
      <StudentFrame>
        <Header view={view} />
        <Typography color="text.secondary">Your teacher has closed this homework. It no longer takes work.</Typography>
      </StudentFrame>
    );

  switch (phase.kind) {
    case 'name':
      return (
        <StudentFrame>
          <Header view={view} />
          <Stack component="form" spacing={2} onSubmit={(e) => (e.preventDefault(), void run(async () => setPhase({ kind: 'answer', attemptId: (await graspService.join(student)).attemptId })))}>
            <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" />
            <TextField label="Roll number" value={roll} onChange={(e) => setRoll(e.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            <Button type="submit" variant="contained" size="large" disabled={name.trim().length < 2 || busy} loading={busy}>
              Start
            </Button>
            {error ? <Typography color="error">{error}</Typography> : null}
            <Typography variant="caption" color="text.secondary">
              No account needed. {view.questions.length} questions, then a quick readback of {view.checkCount} × {view.seconds} seconds.
            </Typography>
          </Stack>
        </StudentFrame>
      );
    case 'answer':
      return (
        <StudentFrame>
          <Header view={view} />
          <AnswerStep view={view} busy={busy} onHandIn={(h) => handIn(phase.attemptId, h)} />
          {error ? <Typography color="error" sx={{ mt: 2 }}>{error}</Typography> : null}
        </StudentFrame>
      );
    case 'reading':
      return (
        <StudentFrame>
          <Stack spacing={3} sx={{ my: 'auto' }}>
            <ScanPreview files={phase.files} active label="Reading your handwriting…" />
          </Stack>
        </StudentFrame>
      );
    case 'review':
      return (
        <StudentFrame>
          <Header view={view} />
          <Typography variant="h4" component="h2">
            Is this what you wrote?
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            We read your sheet. Fix anything we misread, then hand in.
          </Typography>
          <Stack spacing={2}>
            {view.questions.map((q) => (
              <TextField
                key={q.id}
                label={`Q${q.number}`}
                multiline
                minRows={2}
                value={phase.answers.find((a) => a.questionId === q.id)?.text ?? ''}
                onChange={(e) => setPhase({ ...phase, answers: phase.answers.map((a) => (a.questionId === q.id ? { ...a, text: e.target.value } : a)) })}
              />
            ))}
            <Button variant="contained" size="large" loading={busy} onClick={() => void submitAnswers(phase.attemptId, phase.answers, 'sheet', phase.sheetNames)}>
              Looks right · hand in
            </Button>
            {error ? <Typography color="error">{error}</Typography> : null}
          </Stack>
        </StudentFrame>
      );
    case 'brief':
      return (
        <StudentFrame>
          <Stack spacing={3} sx={{ my: 'auto' }}>
            <div>
              <Typography variant="eyebrow" color="primary">
                One last step
              </Typography>
              <Typography variant="h2" component="h2" sx={{ mt: 0.5 }}>
                Read it back
              </Typography>
            </div>
            <Rule icon={<Timer size={18} />}>
              {view.checkCount} quick questions about <b>your own answer</b>, {view.seconds} seconds each. Then one with no clock.
            </Rule>
            <Rule icon={<EyeOff size={18} />}>Your answers are hidden while the clock runs. The options fade, so go with what you remember.</Rule>
            <Rule icon={<Check size={18} />}>If you wrote it, you will know it. There is nothing to revise.</Rule>
            <Button variant="contained" size="large" onClick={() => setPhase({ kind: 'run', attemptId: phase.attemptId, prompts: phase.prompts, hand: phase.hand })}>
              I&apos;m ready
            </Button>
          </Stack>
        </StudentFrame>
      );
    case 'run':
      return (
        <StudentFrame>
          <ReadbackRun prompts={phase.prompts} onFinish={(r) => finish(phase.attemptId, phase.hand, r)} />
        </StudentFrame>
      );
    case 'sending':
      return (
        <StudentFrame>
          <Typography sx={{ m: 'auto' }} color="text.secondary">
            Handing in…
          </Typography>
        </StudentFrame>
      );
    case 'done':
      return (
        <StudentFrame>
          <Stack spacing={2} sx={{ m: 'auto', alignItems: 'center', textAlign: 'center' }}>
            <Box sx={(t) => ({ width: 96, height: 96, borderRadius: '50%', bgcolor: t.tints.green, color: t.onTint.green, display: 'grid', placeItems: 'center', animation: `${draw} 600ms cubic-bezier(.34,1.4,.64,1) both` })}>
              <Check size={48} strokeWidth={3} />
            </Box>
            <Typography variant="h2" component="h2">
              Handed in
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: '36ch' }}>
              {error ?? `${view.teacher} has your work and your readback. Nice one, ${name.split(' ')[0] || 'there'}.`}
            </Typography>
          </Stack>
        </StudentFrame>
      );
    default: {
      const never: never = phase;
      return never;
    }
  }
}
