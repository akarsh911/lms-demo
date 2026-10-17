'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Check } from 'lucide-react';

import { isLitmusTest, REAGENTS } from '@labs/lib/acid-base/chemistry';
import {
  FIZZ_OPTIONS,
  FIZZ_WORDS,
  GAS_OPTIONS,
  GAS_WORDS,
  LITMUS_OPTIONS,
  LITMUS_WORDS,
} from '@labs/lib/acid-base/marking';
import type { AcidBaseAction } from '@labs/lib/acid-base/reducer';
import { rowFilled, tableComplete, type AcidBaseState } from '@labs/lib/acid-base/state';

/**
 * The observation table, written ONE ROW AT A TIME.
 *
 * The standalone bench put all eight rows on screen as sixteen dropdowns. That
 * is a form, not an observation: it invites filling the column down from the
 * textbook, which is precisely the habit this practical exists to break. Here
 * the console asks about one tube, that tube is magnified beside the question,
 * and the strip along the top says how many are left. The student can still go
 * back to any row before submitting, because changing your mind about what you
 * saw is not cheating.
 */

/** One observation, chosen from the words the marking uses. */
function Choice<T extends string>({
  legend,
  options,
  words,
  value,
  onPick,
}: {
  legend: string;
  options: readonly T[];
  words: Readonly<Record<T, string>>;
  value: T | null;
  onPick: (value: T) => void;
}): React.ReactElement {
  const theme = useTheme();
  const id = React.useId();
  return (
    <Box sx={{ mt: 1.25 }}>
      <Typography
        id={id}
        sx={{
          fontSize: theme.band.type.min,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: theme.brand.tert,
        }}
      >
        {legend}
      </Typography>
      <Box role="radiogroup" aria-labelledby={id} sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {options.map((option) => {
          const picked = option === value;
          return (
            <ButtonBase
              key={option}
              role="radio"
              aria-checked={picked}
              onClick={() => onPick(option)}
              sx={{
                justifyContent: 'flex-start',
                textAlign: 'left',
                px: 1.25,
                py: 0.75,
                borderRadius: `${theme.band.radius.sm}px`,
                border: '1px solid',
                borderColor: picked ? theme.brand.orange : theme.brand.line2,
                backgroundColor: picked ? theme.tints.orange : theme.brand.subtle,
                color: theme.brand.text,
                fontWeight: picked ? 700 : 400,
                fontSize: theme.band.type.base - 1,
                '&:hover': { borderColor: theme.brand.orange },
                '&.Mui-focusVisible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: 2 },
              }}
            >
              {words[option]}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

export function RecordRow({
  state,
  dispatch,
  now,
}: {
  state: AcidBaseState;
  dispatch: (action: AcidBaseAction) => AcidBaseState;
  now: () => number;
}): React.ReactElement {
  const theme = useTheme();
  const i = state.row;
  const spec = state.layout[i]!;
  const written = state.rec[i]!;
  const filled = state.rec.filter((_, k) => rowFilled(state, k)).length;
  const ready = tableComplete(state);

  return (
    <>
      <Typography component="h3" sx={{ fontWeight: 800, fontSize: theme.band.type.h4, color: theme.brand.ink, lineHeight: 1.25 }}>
        Tube {spec.id} · {REAGENTS[spec.reagent].label} + {spec.what}
      </Typography>
      <Typography sx={{ mt: 0.5, color: theme.brand.sub, fontSize: theme.band.type.base - 1, textWrap: 'pretty' }}>
        Write down what <b>this</b> tube showed you. Every row is marked against the real state of that tube, so an
        observation you did not obtain costs the mark even when the textbook predicts it.
      </Typography>

      {/* Which rows are done, and a way back to any of them. */}
      <Box component="ol" aria-label="Rows of the observation table" sx={{ display: 'flex', gap: 0.5, listStyle: 'none', m: 0, mt: 1.25, p: 0, flexWrap: 'wrap' }}>
        {state.layout.map((row, k) => {
          const done = rowFilled(state, k);
          const here = k === i;
          return (
            <Box component="li" key={row.id} sx={{ display: 'flex' }}>
              <ButtonBase
                aria-current={here ? 'step' : undefined}
                aria-label={`Row ${k + 1}, tube ${row.id}${done ? ', written' : ', still blank'}`}
                onClick={() => dispatch({ type: 'goToRow', row: k })}
                sx={{
                  width: 30,
                  height: 26,
                  gap: '2px',
                  borderRadius: `${theme.band.radius.sm}px`,
                  border: '1.5px solid',
                  borderColor: here ? theme.brand.orange : done ? theme.hues.green : theme.brand.line2,
                  backgroundColor: here ? theme.tints.orange : done ? theme.tints.green : 'transparent',
                  color: here ? theme.brand.orange : done ? theme.onTint.green : theme.brand.tert,
                  fontSize: theme.band.type.min,
                  fontWeight: 800,
                }}
              >
                {row.id}
                {done ? <Check size={10} strokeWidth={3} /> : null}
              </ButtonBase>
            </Box>
          );
        })}
      </Box>

      {isLitmusTest(spec) ? (
        <Choice
          legend="What the litmus did"
          options={LITMUS_OPTIONS}
          words={LITMUS_WORDS}
          value={written.lit}
          onPick={(value) => dispatch({ type: 'writeLitmus', row: i, value, now: now() })}
        />
      ) : (
        <>
          <Choice
            legend="Effervescence"
            options={FIZZ_OPTIONS}
            words={FIZZ_WORDS}
            value={written.eff}
            onPick={(value) => dispatch({ type: 'writeFizz', row: i, value, now: now() })}
          />
          <Choice
            legend="The gas"
            options={GAS_OPTIONS}
            words={GAS_WORDS}
            value={written.gas}
            onPick={(value) => dispatch({ type: 'writeGas', row: i, value, now: now() })}
          />
        </>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }}>
        <Button size="small" variant="outlined" color="inherit" disabled={i === 0} onClick={() => dispatch({ type: 'goToRow', row: i - 1 })}>
          Previous tube
        </Button>
        <Button size="small" variant="outlined" color="inherit" disabled={i === 7} onClick={() => dispatch({ type: 'goToRow', row: i + 1 })}>
          Next tube
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={!ready} onClick={() => dispatch({ type: 'submitTable', now: now() })}>
          {ready ? 'Submit the table' : `${filled}/8 rows written`}
        </Button>
      </Box>
    </>
  );
}
