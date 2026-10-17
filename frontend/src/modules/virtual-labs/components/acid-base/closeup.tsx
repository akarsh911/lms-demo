'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { EmergeChip, RichText } from '@/components/ui';
import {
  fizzLevel,
  gasRate,
  litmusObs,
  pHof,
  REAGENTS,
  solutionVol,
  tubeVol,
  type Tube,
  type TubeSpec,
} from '@labs/lib/acid-base/chemistry';
import { FIZZ_WORDS, LITMUS_WORDS, SPLINTER_WORDS } from '@labs/lib/acid-base/marking';

import { apparatus } from '../apparatus-palette';

import { TubeArt } from './tube-art';

/**
 * The tube the student is judging, magnified and docked beside the box they
 * type the judgement into.
 *
 * In the rack a tube is ~44 units wide, which puts a purple-versus-blue litmus
 * decision and the difference between "a few slow bubbles" and "brisk
 * effervescence" below the size at which anyone can honestly call them. The
 * close-up is the same drawing from the same state, four times the size, with
 * what is actually in the tube written out beside it — including the things a
 * student cannot see, like how much acid is left, which is what makes it a
 * teaching instrument rather than a magnifying glass.
 */
export function TubeCloseup({
  spec,
  tube,
  lime,
  maxWidth = 320,
  heading,
}: {
  spec: TubeSpec;
  tube: Tube;
  /** What the lime water showed, when it was this tube's gas that went through it. */
  lime: { from: string; milky: boolean } | null;
  maxWidth?: number;
  heading?: string;
}): React.ReactElement {
  const theme = useTheme();
  const ph = pHof(tube);
  const v = tubeVol(tube);
  const obs = litmusObs(tube);
  const fizz = fizzLevel(tube.rateNow);
  const gasML = tube.gas.H2 + tube.gas.CO2;
  const wrongSolution = tube.poured.some((id) => id !== spec.reagent);

  const bits: React.ReactNode[] = [];
  bits.push(
    v ? (
      <>
        {solutionVol(tube).toFixed(0)} mL{' '}
        {(['HCl', 'NaOH'] as const)
          .filter((id) => tube.liq[id] > 0)
          .map((id) => REAGENTS[id].label)
          .join(' + ')}
      </>
    ) : (
      <>Empty — this tube takes {REAGENTS[spec.reagent].label}</>
    ),
  );
  if (ph !== null) {
    bits.push(
      <>
        pH of what is in it: <b>{ph.toFixed(1)}</b>
      </>,
    );
  }
  if (obs !== 'none') {
    bits.push(
      <>
        {tube.drops.blue + tube.drops.red} drops of litmus — <b>{LITMUS_WORDS[obs]}</b>
      </>,
    );
  }
  if (tube.put.Zn) {
    bits.push(
      <>
        zinc: {tube.solid.Zn.toFixed(2)} g left of {tube.put.Zn.toFixed(1)} g
      </>,
    );
  }
  if (tube.put.Na2CO3) {
    bits.push(
      <>
        solid Na₂CO₃: {tube.solid.Na2CO3.toFixed(2)} g left of {tube.put.Na2CO3.toFixed(1)} g
      </>,
    );
  }
  if (tube.put.Zn || tube.put.Na2CO3) {
    bits.push(
      fizz === 'none' ? (
        tube.peakRate > 0 ? (
          <>the fizzing has stopped</>
        ) : (
          <>no bubbles at all</>
        )
      ) : (
        <>
          <b>{FIZZ_WORDS[fizz]}</b> right now
        </>
      ),
    );
  }
  if (gasML > 0.02) bits.push(<>about {gasML.toFixed(1)} mL of gas in the tube</>);
  if (tube.tests.splinter) {
    bits.push(
      <>
        burning splinter: <RichText text={SPLINTER_WORDS[tube.tests.splinter]} />
      </>,
    );
  }
  if (tube.tests.lime) {
    bits.push(
      <>
        lime water: <b>{tube.tests.lime === 'milky' ? 'turned milky' : 'stayed clear'}</b>
      </>,
    );
  }

  return (
    <Box sx={{ maxWidth, mx: 'auto' }}>
      <Typography
        sx={{
          fontSize: theme.band.type.min,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: theme.brand.tert,
        }}
      >
        {heading ?? 'Close-up'}
      </Typography>
      <Box sx={{ mt: 0.75, display: 'flex', gap: 1.25, alignItems: 'stretch' }}>
        <Box
          sx={{
            flex: 'none',
            width: 86,
            borderRadius: `${theme.band.radius.sm}px`,
            backgroundColor: apparatus.bench,
            p: 0.75,
          }}
        >
          <svg
            viewBox="0 0 72 250"
            role="img"
            aria-label={`Close-up of tube ${spec.id}`}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          >
            <TubeArt
              tube={tube}
              geometry={{ cx: 36, top: 14, bottom: 236, w: 50, mlPx: 17 }}
              clipId={`closeup-${spec.id}`}
            />
          </svg>
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: theme.band.type.base - 0.5, color: theme.brand.ink }}>
            Tube {spec.id} · {REAGENTS[spec.reagent].label} + {spec.what}
          </Typography>
          {wrongSolution ? (
            <Box sx={{ mt: 0.5 }}>
              <EmergeChip tone="red" label="wrong solution added" />
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
            {bits.map((bit, i) => (
              <li key={i}>{bit}</li>
            ))}
          </Box>
          {lime && lime.from === spec.id ? (
            <Box sx={{ mt: 0.75 }}>
              <EmergeChip
                tone={lime.milky ? 'green' : 'grey'}
                dot
                label={lime.milky ? 'lime water went milky' : 'lime water stayed clear'}
              />
            </Box>
          ) : null}
          {gasRate(tube) > 0 && !tube.tests.splinter && !tube.tests.lime ? (
            <Typography sx={{ mt: 0.75, fontSize: theme.band.type.min, color: theme.brand.tert }}>
              Still fizzing — test the gas while there is some to test.
            </Typography>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
