'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { EmergeChip, RichText } from '@/components/ui';
import {
  analyse,
  layersOf,
  type Liquids,
  type LiquidId,
  MLGAS,
  SMELL_TEXT,
  volume,
} from '@labs/lib/acetic-acid/chemistry';
import { RACK, tubeSpoiled, wantedIds } from '@labs/lib/acetic-acid/rack';
import type { TubeState } from '@labs/lib/acetic-acid/state';

import { apparatus } from '../apparatus-palette';

import { TubeGlass } from './tube-view';

/**
 * The magnified tube, docked beside the console.
 *
 * A litmus strip on the rack is four pixels wide and the difference between
 * milky and clear is a shade: both are judgements the practical is actually
 * about, so the tube the student is working on is drawn large beside the box
 * they type into, from the same component that draws it on the bench.
 *
 * While the observation table is being written up, `verdicts` is off. The
 * close-up then reports only what was DONE — a strip was dipped, gas was
 * bubbled through — and never what it looked like, because reading that off a
 * caption instead of the glass is exactly the habit the 32 marks for the table
 * exist to prevent. Anything that cannot be seen in the drawing (what it
 * smelled of, how fast it fizzed, what the pH paper read) stays, since hiding
 * it would only test memory.
 */
export function TubeCloseUp({
  tube,
  liquids,
  verdicts = true,
  maxWidth = 320,
  title,
}: {
  tube: TubeState;
  liquids: Liquids;
  verdicts?: boolean;
  maxWidth?: number;
  /** Overrides the default "Tube 3 · a liquid that does not dissolve". */
  title?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  const uid = `cu${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const slot = RACK[tube.i]!;
  const a = analyse(tube, liquids);
  const v = volume(tube);
  const layers = layersOf(tube, liquids);
  const spoiled = tubeSpoiled(tube.i, tube);

  const facts: React.ReactNode[] = [];
  const ids = (Object.keys(tube.liq) as LiquidId[]).filter((id) => (tube.liq[id] ?? 0) > 0);

  if (v > 0) {
    const mix = ids.map((id) => `${tube.liq[id]} mL ${liquids[id].short}`).join(' + ');
    facts.push(`${mix}${ids.length > 1 ? ` = ${v} mL` : ''}`);
  } else {
    facts.push(
      `Empty — this tube takes **${wantedIds(tube.i)
        .map((id) => `${slot.want[id]} mL ${liquids[id].short}`)
        .join(' + ')}**`,
    );
  }

  if (v > 0 && verdicts) {
    facts.push(
      layers.length > 1
        ? `**${layers.length} layers** — ${layers
            .map((l) => (l.id === 'aq' ? 'water layer' : liquids[l.id].short))
            .reverse()
            .join(' above ')}`
        : 'A single clear layer',
    );
  } else if (v > 0 && tube.stirs > 0) {
    facts.push(`Shaken ${tube.stirs === 1 ? 'once' : `${tube.stirs} times`} — look for a boundary`);
  }

  if (tube.solid > 0.02) facts.push(`${tube.solid.toFixed(2)} mmol of solid NaHCO₃ still in the tube`);
  if (tube.rate > 0.004) facts.push(`Effervescing at ${(tube.rate * 60).toFixed(1)} mmol of gas a minute`);
  if (tube.gasMade > 1e-4) facts.push(`${(tube.gasMade * MLGAS).toFixed(0)} mL of gas given off so far`);
  if (tube.head > 1) facts.push(`About ${tube.head.toFixed(0)} mL of gas standing above the liquid`);
  if (tube.gasIn > 0) {
    const milky = a.milky > 0.6 ? 'milky' : a.milky > 0.15 ? 'faintly milky' : 'clear';
    facts.push(
      `${(tube.gasIn * MLGAS).toFixed(0)} mL of gas bubbled in` +
        (a.caM && verdicts ? ` · lime water **${milky}**` : ''),
    );
  }
  if (tube.smelled) {
    facts.push(
      `Smelled by ${tube.smelled === 'waft' ? 'wafting' : 'sniffing directly'} — ${SMELL_TEXT[tube.smellSeen ?? 'none']}`,
    );
  }
  if (tube.strips.blue) facts.push(verdicts ? `Blue litmus → **${tube.strips.blue.hue}**` : 'A blue strip was dipped');
  if (tube.strips.red) facts.push(verdicts ? `Red litmus → **${tube.strips.red.hue}**` : 'A red strip was dipped');
  if (tube.phPaper !== null) facts.push(`pH paper reads **${tube.phPaper.toFixed(1)}**`);
  if (tube.splinter) {
    facts.push(`Burning splinter: **${tube.splinter === 'out' ? 'went out at once' : 'kept burning'}**`);
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 700, fontSize: theme.band.type.base - 1 }}>
          {title ?? `Tube ${tube.i + 1} · ${slot.job}`}
        </Typography>
        {spoiled ? <EmergeChip tone="red" label="Does not belong here" /> : null}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(64px, 88px) minmax(0, 1fr)',
          gap: 1.5,
          alignItems: 'center',
          mt: 0.75,
          maxWidth,
        }}
      >
        <Box sx={{ backgroundColor: apparatus.bench, borderRadius: `${theme.band.radius.md}px`, p: 0.75 }}>
          <svg
            viewBox="0 0 120 250"
            role="img"
            aria-label={`Close-up of test tube ${tube.i + 1}`}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          >
            <TubeGlass
              tube={tube}
              liquids={liquids}
              cx={60}
              top={20}
              bottom={234}
              width={44}
              mlPx={11}
              uid={uid}
            />
          </svg>
        </Box>

        <Box
          component="ul"
          sx={{
            m: 0,
            pl: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.4,
            fontSize: theme.band.type.min + 1,
            color: theme.brand.sub,
          }}
        >
          {facts.map((fact, i) => (
            <li key={i}>{typeof fact === 'string' ? <RichText text={fact} /> : fact}</li>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
