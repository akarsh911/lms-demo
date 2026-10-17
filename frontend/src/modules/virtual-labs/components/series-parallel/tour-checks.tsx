'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { NumberField, RichText } from '@/components/ui';
import { parseDecimal } from '@labs/lib/numbers';
import { PRACTICE_DIAL } from '@labs/lib/series-parallel/apparatus';

import { DialFace, DialNeedle, dialAngle } from '../analog-dial';
import { apparatus } from '../apparatus-palette';

/**
 * The interactive check inside the tutorial: read a practice meter.
 *
 * Two tries, then the answer, and the student moves on either way — a tour
 * teaches, it does not gate on getting it right. The dial is deliberately NOT
 * one of the bench's own, so practising the method does not hand over the
 * answer to step 1 of the marked practical.
 */
export function PracticeDialCheck({
  completed,
  complete,
}: {
  completed: boolean;
  complete: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const [value, setValue] = React.useState('');
  const [tries, setTries] = React.useState(0);
  const [ok, setOk] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const { fs, divs, value: truth } = PRACTICE_DIAL;

  const step = fs / divs;
  const labelled = Math.round(truth - step);
  const why =
    `${divs} divisions over ${fs} V makes each division **${step} V** — that is this meter’s least count. ` +
    `The needle is one division past ${labelled}, so it reads ${labelled} + ${step} = **${truth} V**. Use exactly this method on the real meters.`;

  const check = (): void => {
    const v = parseDecimal(value);
    if (Number.isNaN(v)) return;
    if (Math.abs(v - truth) < 0.01) {
      setOk(true);
      setMessage(`Right. ${why}`);
      complete();
    } else if (tries === 0) {
      setTries(1);
      setMessage(
        `Not ${v} V. First count the small divisions between 0 and ${fs} and work out what one is worth — then count from the labelled ${labelled}.`,
      );
    } else {
      setTries(2);
      setMessage(`It reads ${truth} V. ${why}`);
      complete();
    }
  };

  return (
    <>
      <Box sx={{ backgroundColor: apparatus.bench, borderRadius: `${theme.band.radius.sm}px`, p: 1, my: 1 }}>
        <svg
          viewBox="0 0 200 130"
          role="img"
          aria-label={`Practice voltmeter, 0 to ${fs} volt`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <DialFace fullScale={fs} divs={divs} letter="V" />
          <DialNeedle angle={dialAngle(truth / fs)} />
        </svg>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <NumberField
          id="sp-tour-practice"
          label="This voltmeter reads"
          unit="V"
          value={ok ? String(truth) : value}
          onChange={setValue}
          onEnter={check}
          disabled={completed}
          placeholder="?"
          status={ok ? 'ok' : tries ? 'error' : null}
        />
        <Button variant="outlined" onClick={check} disabled={completed}>
          Check
        </Button>
      </Box>
      {message ? (
        <Typography component="div" sx={{ fontSize: theme.band.type.base - 1, mt: 1.25, color: theme.brand.text }}>
          <RichText text={message} />
        </Typography>
      ) : null}
    </>
  );
}
