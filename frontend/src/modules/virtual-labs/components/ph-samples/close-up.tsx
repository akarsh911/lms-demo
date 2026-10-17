'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { EmergeChip } from '@/components/ui';
import { PAPER_DEVELOP_SECONDS, SAMPLE_BY_ID, volume } from '@labs/lib/ph-samples/chemistry';
import { LAY_ON_TILE_SECONDS } from '@labs/lib/ph-samples/gestures';
import type { PhState } from '@labs/lib/ph-samples/state';

import { apparatus } from '../apparatus-palette';
import { benchMotionSx, motionSx, useBenchMotion } from '../bench-motion';

import { StripArt, TubeArt } from './tube-art';

/**
 * The tube the student is looking at, magnified, with its strip beside it.
 *
 * In the rack a tube is 34 units across, which is below the size at which a
 * green at pH 7 and a green at pH 8 can honestly be told apart — and telling
 * them apart IS this practical. So the same drawing is repeated here four times
 * larger, from the same state, with the strip that came out of this tube laid
 * beside it at the size a hand would hold it at against the chart.
 *
 * WHAT IT MAY SAY, AND WHAT IT MAY NOT. Everything written here is something a
 * student could establish without reading the colour: how much is in the tube,
 * which bottles went into it, whether the tube was spoiled, and which of the two
 * tests was used. A tube spoiled by the wrong bottle is announced once by the
 * assistant and then scrolls away; this is the only place on the bench that goes
 * on saying so, which is most of the reason it exists.
 *
 * It NAMES no colour, no pH and no nature. Those three are what the student is
 * marked on, and a magnifying glass that reads the answer out is not a
 * magnifying glass. The only exception is after the table has been submitted,
 * when the measured pH is already printed in the observation table beside it and
 * withholding it here would be a pretence.
 */
export function TubeCloseUp({
  state,
  maxWidth,
  heading = 'Close-up',
}: {
  state: PhState;
  maxWidth?: number;
  heading?: string;
}): React.ReactElement | null {
  const theme = useTheme();
  const moving = useBenchMotion();
  const index = state.sel;
  const tube = state.tubes[index];
  if (!tube) return null;

  const sample = SAMPLE_BY_ID[tube.sample];
  const v = volume(tube);
  const spoiled = tube.added.some((a) => a !== tube.sample);
  const marked = state.graded?.cells[index];
  // The glass takes about a third of whatever the console can spare, and the
  // strip stands beside it as it would on the tile.
  const plate = Math.round(Math.min(104, Math.max(74, (maxWidth ?? 280) * 0.36)));

  const facts: React.ReactNode[] = [];
  facts.push(
    v > 0 ? (
      <>
        <b>{v} mL</b> in the tube
        {tube.added.length > 1 ? ` — ${tube.added.length} pours` : ''}
      </>
    ) : (
      <>Empty — this tube takes {sample.label}</>
    ),
  );
  if (spoiled) {
    facts.push(
      <>
        poured in: {tube.added.map((a) => SAMPLE_BY_ID[a].short).join(' + ')}
      </>,
    );
  }
  facts.push(
    tube.tested === 'paper' ? (
      <>a strip of pH paper was dipped in it and laid on the tile</>
    ) : tube.tested === 'ui' ? (
      <>universal indicator is in the solution itself</>
    ) : v > 0 ? (
      <>not tested yet — dip a strip, or add indicator</>
    ) : (
      <>nothing to test until it is poured</>
    ),
  );
  if (marked && marked.truePh !== null) {
    facts.push(
      <>
        measured pH: <b>{marked.truePh.toFixed(1)}</b>
      </>,
    );
  }

  return (
    <Box sx={{ maxWidth, mx: 'auto', width: '100%' }}>
      <Typography
        sx={{
          fontSize: theme.band.type.min,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: theme.brand.tert,
        }}
      >
        {heading}
      </Typography>
      <Box sx={{ mt: 0.75, display: 'flex', gap: 1.25, alignItems: 'stretch' }}>
        <Box
          sx={{
            flex: 'none',
            width: plate,
            borderRadius: `${theme.band.radius.sm}px`,
            backgroundColor: apparatus.bench,
            p: 0.75,
            // The strip on the tile develops here exactly as it does on the
            // bench: same rules, same seconds, one drawing seen twice.
            ...benchMotionSx,
            ...motionSx(moving),
          }}
        >
          {/*
            KEYED ON THE TUBE, and it has to be. Everything inside carries the
            state across time — the level rises, the strip develops — and two
            different tubes are not a change in one tube. Without this, tapping
            along the rack slid each tube's liquid to the next tube's level and
            cross-faded one strip's colour into the next, so for a second and a
            half the glass showed a colour belonging to neither: the reading
            being marked, drawn wrong. A new tube starts where it stands.
          */}
          <svg
            key={index}
            viewBox="0 0 116 250"
            role="img"
            aria-label={`Close-up of tube ${index + 1}, for ${sample.name}${v ? `, holding ${v} mL` : ', empty'}`}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          >
            {/* The same component as the rack, at four times the scale in both
                axes — so 5 mL is still 5 mL and the colour is still the one the
                chemistry computed, only large enough to judge. */}
            <TubeArt
              tube={tube}
              geometry={{ cx: 76, top: 16, bottom: 236, w: 52, mlPx: 20 }}
              clipId={`ph-closeup-${index}`}
            />
            {tube.strip !== null ? (
              <>
                <StripArt
                  ph={tube.strip}
                  x={8}
                  y={64}
                  width={32}
                  height={84}
                  delay={LAY_ON_TILE_SECONDS}
                  develop={PAPER_DEVELOP_SECONDS}
                />
                <text x={24} y={166} fontSize={11} textAnchor="middle" fill={apparatus.benchInk}>
                  strip
                </text>
              </>
            ) : null}
          </svg>
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: theme.band.type.base - 0.5, color: theme.brand.ink }}>
            Tube {index + 1} · {sample.name}
          </Typography>
          {spoiled ? (
            <Box sx={{ mt: 0.5 }}>
              <EmergeChip tone="red" label="wrong sample added" />
            </Box>
          ) : null}
          <Box
            component="ul"
            sx={{
              m: 0,
              mt: 0.5,
              pl: 2,
              color: theme.brand.sub,
              fontSize: theme.band.type.base - 1.5,
              lineHeight: 1.45,
              '& b': { color: theme.brand.ink, fontWeight: 700 },
            }}
          >
            {facts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
