'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import Link from 'next/link';
import { ArrowUpRight, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { ProgressBar } from '@/components/ui/progress';
import type { Card, QuizQuestion, Target } from '@/lib/jerry/brain';
import { paths } from '@/paths';

const rise = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
`;

const hrefOf = (to: Target, slug: string): string => ('path' in to ? to.path : paths.personaSection(slug, to.section));

function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Box sx={(t) => ({ mt: 1.25, p: 1.75, borderRadius: `${t.band.radius.md}px`, bgcolor: t.brand.surface, border: `1px solid ${t.brand.line}`, animation: `${rise} 320ms ease-out both` })}>{children}</Box>;
}

function Quiz({ topic, questions, onDone }: { topic: string; questions: readonly QuizQuestion[]; onDone: (score: number, total: number) => void }): React.ReactElement {
  const [picks, setPicks] = React.useState<(number | null)[]>(() => questions.map(() => null));
  const answered = picks.filter((p) => p !== null).length;
  const score = picks.filter((p, i) => p === questions[i]?.answer).length;
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (answered === questions.length && !reported.current) {
      reported.current = true;
      onDone(score, questions.length);
    }
  }, [answered, onDone, questions.length, score]);

  return (
    <Stack spacing={1.5}>
      <Typography variant="eyebrow" color="text.secondary">
        Quiz · {topic} · {answered}/{questions.length}
      </Typography>
      {questions.map((q, qi) => {
        const pick = picks[qi] ?? null;
        return (
          <div key={q.q}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
              {qi + 1}. {q.q}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              {q.options.map((o, oi) => {
                const right = oi === q.answer;
                const chosen = pick === oi;
                return (
                  <ButtonBase
                    key={o}
                    disabled={pick !== null}
                    onClick={() => setPicks(picks.map((p, i) => (i === qi ? oi : p)))}
                    sx={(t) => ({
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 99,
                      fontSize: 14,
                      fontWeight: 600,
                      border: `1.5px solid ${pick !== null && right ? t.onTint.green : chosen ? t.onTint.coral : t.brand.line2}`,
                      bgcolor: pick !== null && right ? t.tints.green : chosen ? t.tints.coral : t.brand.canvas,
                      color: t.brand.ink,
                    })}
                  >
                    {o}
                  </ButtonBase>
                );
              })}
            </Stack>
            {pick !== null ? (
              <Typography variant="caption" sx={(t) => ({ display: 'block', mt: 0.5, color: pick === q.answer ? t.onTint.green : t.onTint.coral, animation: `${rise} 240ms ease-out both` })}>
                {pick === q.answer ? 'Yes! ' : 'Not quite. '}
                {q.why}
              </Typography>
            ) : null}
          </div>
        );
      })}
    </Stack>
  );
}

function Hints({ question, hints }: { question: string; hints: readonly string[] }): React.ReactElement {
  const [shown, setShown] = React.useState(1);
  return (
    <Stack spacing={1}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {question}
      </Typography>
      {hints.slice(0, shown).map((h, i) => (
        <Stack key={h} direction="row" spacing={1} sx={{ alignItems: 'flex-start', animation: `${rise} 260ms ease-out both` }}>
          <Box sx={(t) => ({ color: t.onTint.amber, mt: 0.25 })}>
            <Lightbulb size={16} />
          </Box>
          <Typography variant="body2">
            <b>Hint {i + 1}.</b> {h}
          </Typography>
        </Stack>
      ))}
      {shown < hints.length ? (
        <Button size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} onClick={() => setShown(shown + 1)}>
          Next hint
        </Button>
      ) : (
        <Typography variant="caption" color="text.secondary">
          That&apos;s all my hints. You&apos;ve got this! 🐾
        </Typography>
      )}
    </Stack>
  );
}

function Timer({ minutes, onRun, onDone }: { minutes: number; onRun: () => void; onDone: () => void }): React.ReactElement {
  const [left, setLeft] = React.useState<number | null>(null);
  const finished = React.useRef(false);
  const done = React.useEffectEvent(onDone);
  React.useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      if (!finished.current) done();
      finished.current = true;
      return;
    }
    const id = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const total = minutes * 60;
  const shown = left ?? total;
  return (
    <Stack spacing={1.25} sx={{ alignItems: 'center' }}>
      <Typography sx={(t) => ({ fontFamily: t.typography.display.fontFamily, fontWeight: 800, fontSize: 44, fontVariantNumeric: 'tabular-nums' })}>
        {String(Math.floor(shown / 60)).padStart(2, '0')}:{String(shown % 60).padStart(2, '0')}
      </Typography>
      <Box sx={{ width: '100%' }}>
        <ProgressBar value={((total - shown) / total) * 100} tone="rose" />
      </Box>
      <Stack direction="row" spacing={1}>
        {left === null ? (
          <Button variant="contained" onClick={() => (setLeft(total), onRun())}>
            Start focus
          </Button>
        ) : (
          <Button variant="outlined" disabled={left <= 0} onClick={() => setLeft(0)}>
            {left > 0 ? 'Finish early' : 'Break time! 🎉'}
          </Button>
        )}
        {left !== null && left > 0 ? (
          <Button variant="text" onClick={() => setLeft(3)}>
            Demo: skip to end
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

export function JerryCard({ card, slug, onQuizDone, onTimerRun, onTimerDone }: { card: Card; slug: string; onQuizDone: (score: number, total: number) => void; onTimerRun: () => void; onTimerDone: () => void }): React.ReactElement {
  switch (card.kind) {
    case 'due':
      return (
        <Shell>
          <Stack spacing={1}>
            {card.items.map((it) => (
              <ButtonBase key={it.title} component={Link} href={hrefOf(it.to, slug)} sx={(t) => ({ justifyContent: 'space-between', p: 1.25, borderRadius: `${t.band.radius.sm}px`, bgcolor: t.brand.canvas, gap: 1, textAlign: 'left' })}>
                <div>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {it.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {it.subject} · due {it.due}
                  </Typography>
                </div>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flex: 'none' }}>
                  <EmergeChip label={it.tag} tone={it.tag === 'GRASP' ? 'rose' : 'blue'} />
                  <ArrowUpRight size={16} />
                </Stack>
              </ButtonBase>
            ))}
          </Stack>
        </Shell>
      );
    case 'explain':
      return (
        <Shell>
          <Typography variant="eyebrow" color="text.secondary">
            {card.topic}, step by step
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {card.steps.map((s, i) => (
              <Stack key={s.text} direction="row" spacing={1.5} sx={{ alignItems: 'center', animation: `${rise} 300ms ease-out ${i * 260}ms both` }}>
                <Box sx={(t) => ({ width: 38, height: 38, flex: 'none', borderRadius: '50%', bgcolor: t.tints.amber, display: 'grid', placeItems: 'center', fontSize: 20 })}>{s.icon}</Box>
                <Typography variant="body2">{s.text}</Typography>
              </Stack>
            ))}
          </Stack>
        </Shell>
      );
    case 'quiz':
      return (
        <Shell>
          <Quiz topic={card.topic} questions={card.questions} onDone={onQuizDone} />
        </Shell>
      );
    case 'hint':
      return (
        <Shell>
          <Hints question={card.question} hints={card.hints} />
        </Shell>
      );
    case 'progress':
      return (
        <Shell>
          <Stack spacing={1.25}>
            {card.subjects.map((s) => (
              <div key={s.name}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {s.name}
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={(t) => ({ alignItems: 'center', color: s.change >= 0 ? t.onTint.green : t.onTint.coral })}>
                    {s.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    <Typography variant="caption">
                      {s.score}% ({s.change >= 0 ? '+' : ''}
                      {s.change})
                    </Typography>
                  </Stack>
                </Stack>
                <ProgressBar value={s.score} tone={s.score >= 80 ? 'green' : 'amber'} />
              </div>
            ))}
            <Typography variant="eyebrow" color="text.secondary" sx={{ pt: 0.5 }}>
              Practise next
            </Typography>
            {card.weak.map((w) => (
              <Button key={w.topic} component={Link} href={hrefOf(w.to, slug)} variant="outlined" size="small" endIcon={<ArrowUpRight size={14} />} sx={{ alignSelf: 'flex-start' }}>
                {w.topic}
              </Button>
            ))}
          </Stack>
        </Shell>
      );
    case 'day':
      return (
        <Shell>
          <Stack spacing={0.75}>
            {card.periods.map((p) => (
              <Stack key={p.time} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography variant="caption" sx={{ width: 44, fontVariantNumeric: 'tabular-nums' }} color="text.secondary">
                  {p.time}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  {p.subject}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {p.room}
                </Typography>
              </Stack>
            ))}
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75, pt: 1 }}>
              {card.bring.map((b) => (
                <EmergeChip key={b} label={`🎒 ${b}`} tone="amber" />
              ))}
            </Stack>
          </Stack>
        </Shell>
      );
    case 'timer':
      return (
        <Shell>
          <Timer minutes={card.minutes} onRun={onTimerRun} onDone={onTimerDone} />
        </Shell>
      );
    default: {
      const never: never = card;
      return never;
    }
  }
}
