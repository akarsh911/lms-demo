'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';

import { seededRandom } from '@/lib/grasp/readback';
import type { Band, GraspAttempt } from '@/types/grasp';

import { BAND, seconds } from './band-meta';

const land = keyframes`
  0% { opacity: 0; transform: translate(-50%, -50%) scale(2.4); }
  55% { opacity: 1; transform: translate(-50%, -50%) scale(0.85); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
`;

const ring = keyframes`
  0% { box-shadow: 0 0 0 0 currentColor; }
  100% { box-shadow: 0 0 0 14px transparent; }
`;

// Timed result runs left to right, the untimed twin bottom to top: each student lands in the cell their pair puts them in.
const CELLS: readonly { band: Band; col: 0 | 1; row: 0 | 1 }[] = [
  { band: 'not_written', col: 0, row: 0 },
  { band: 'understood', col: 1, row: 0 },
  { band: 'not_learnt', col: 0, row: 1 },
  { band: 'unclear', col: 1, row: 1 },
];

// Dots sit in the right half of their cell, clear of its label; more timed answers right puts a dot further right.
function place(a: GraspAttempt, col: number, row: number): { left: number; top: number } {
  const rand = seededRandom(a.id);
  const v = a.verdict;
  const share = v && v.fastTotal > 0 ? v.fastCorrect / v.fastTotal : 0;
  return { left: col * 50 + 24 + share * 12 + rand() * 11, top: row * 50 + 9 + rand() * 34 };
}

export function BandBoard({
  attempts,
  selected,
  onSelectBand,
  onOpen,
  freshIds,
}: {
  attempts: readonly GraspAttempt[];
  selected: Band | null;
  onSelectBand: (band: Band | null) => void;
  onOpen: (id: string) => void;
  freshIds: ReadonlySet<string>;
}): React.ReactElement {
  const done = attempts.filter((a) => a.verdict);
  return (
    <Card>
      <CardHeader title="Where the class landed" subheader="Each dot is one student. Timed questions left to right; the slow, untimed twin bottom to top." />
      <Box sx={{ p: { xs: 1.5, md: 2.5 }, pt: 0 }}>
        <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'minmax(150px, 1fr) minmax(150px, 1fr)', gap: 1, aspectRatio: { md: '16 / 8' } }}>
          {CELLS.map(({ band, col, row }) => {
            const meta = BAND[band];
            const n = done.filter((a) => a.verdict?.band === band).length;
            const dim = selected !== null && selected !== band;
            return (
              <ButtonBase
                key={band}
                onClick={() => onSelectBand(selected === band ? null : band)}
                aria-pressed={selected === band}
                sx={(t) => ({
                  gridColumn: col + 1,
                  gridRow: row + 1,
                  borderRadius: `${t.band.radius.md}px`,
                  bgcolor: t.tints[meta.tone],
                  outline: selected === band ? `2px solid ${t.onTint[meta.tone]}` : 'none',
                  opacity: dim ? 0.45 : 1,
                  transition: 'opacity 200ms',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  p: 1.75,
                })}
              >
                <Stack spacing={0.25} sx={{ maxWidth: '62%' }}>
                  <Typography variant="eyebrow" sx={(t) => ({ color: t.onTint[meta.tone] })}>
                    {meta.label}
                  </Typography>
                  <Typography sx={(t) => ({ fontFamily: t.typography.display.fontFamily, fontWeight: 800, fontSize: 34, lineHeight: 1.05, color: t.onTint[meta.tone] })}>{n}</Typography>
                  <Typography variant="caption" sx={(t) => ({ color: t.onTint[meta.tone], display: { xs: 'none', sm: 'block' } })}>
                    {meta.action}
                  </Typography>
                </Stack>
              </ButtonBase>
            );
          })}
          {done.map((a) => {
            const band = a.verdict?.band ?? 'unclear';
            const cell = CELLS.find((c) => c.band === band) ?? CELLS[3];
            if (!cell) return null;
            const { left, top } = place(a, cell.col, cell.row);
            const tone = BAND[band].tone;
            const fresh = freshIds.has(a.id);
            return (
              <Tooltip key={a.id} title={`${a.name} · ${a.verdict?.fastCorrect}/${a.verdict?.fastTotal} timed · ${a.verdict?.slowOk ? 'slow right' : 'slow wrong'} · ${seconds(a.verdict?.medianMs ?? null)}`}>
                <ButtonBase
                  aria-label={a.name}
                  onClick={() => onOpen(a.id)}
                  sx={(t) => ({
                    position: 'absolute',
                    left: `${left}%`,
                    top: `${top}%`,
                    width: fresh ? 18 : 14,
                    height: fresh ? 18 : 14,
                    borderRadius: '50%',
                    bgcolor: t.onTint[tone],
                    color: t.onTint[tone],
                    border: `2px solid ${t.brand.surface}`,
                    transform: 'translate(-50%, -50%)',
                    opacity: selected !== null && selected !== band ? 0.25 : 1,
                    animation: fresh ? `${land} 700ms cubic-bezier(.34,1.4,.64,1) both, ${ring} 1.4s ease-out 700ms 3` : 'none',
                    transition: 'opacity 200ms',
                    '&:hover': { transform: 'translate(-50%, -50%) scale(1.4)' },
                  })}
                />
              </Tooltip>
            );
          })}
        </Box>
        <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1, px: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            ← missed the timed questions
          </Typography>
          <Typography variant="caption" color="text.secondary">
            read them back in time →
          </Typography>
        </Stack>
      </Box>
    </Card>
  );
}
