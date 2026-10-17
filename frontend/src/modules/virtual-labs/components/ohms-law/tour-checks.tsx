'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { NumberField } from '@/components/ui/number-field';
import { RichText } from '@/components/ui/rich-text';
import { parseDecimal, within } from '@labs/lib/numbers';
import { P, PRACTICE_DIAL } from '@labs/lib/ohms-law/apparatus';
import type { BenchReading } from '@labs/lib/ohms-law/solve';

import { apparatus } from '../apparatus-palette';
import { DialFace, DialNeedle, dialAngle } from '../analog-dial';

/**
 * The two interactive checks inside the tours. Each allows two tries, then
 * shows the answer and lets the student move on: a tour teaches, it does not
 * gate on getting it right.
 */

function Verdict({ text }: { text: string }): React.ReactElement | null {
  const theme = useTheme();
  if (!text) return null;
  return (
    <Typography component="div" sx={{ fontSize: theme.band.type.base - 1, mt: 1.25, color: theme.brand.text }}>
      <RichText text={text} />
    </Typography>
  );
}

/** Tutorial: read a practice voltmeter, a different meter from the bench's own. */
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
        <svg viewBox="0 0 200 130" role="img" aria-label={`Practice voltmeter, 0 to ${fs} volt`} style={{ display: 'block', width: '100%', height: 'auto' }}>
          <DialFace fullScale={fs} divs={divs} letter="V" />
          <DialNeedle angle={dialAngle(truth / fs)} />
        </svg>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <NumberField
          id="tour-practice"
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
      <Verdict text={message} />
    </>
  );
}

/** What the guided build remembers from reading the meters, to compare with later. */
export interface FirstReading {
  I: number;
  V: number;
}

/** Guided build: read both real meters once, within one least count. */
export function MeterReadingCheck({
  keyIn,
  reading,
  completed,
  complete,
  onRead,
}: {
  keyIn: boolean;
  reading: BenchReading;
  completed: boolean;
  complete: () => void;
  /** Receives what the needles really showed, whether or not the student was right. */
  onRead: (r: FirstReading) => void;
}): React.ReactElement {
  const [I, setI] = React.useState('');
  const [V, setV] = React.useState('');
  const [tries, setTries] = React.useState(0);
  const [ok, setOk] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const check = (): void => {
    const i = parseDecimal(I);
    const v = parseDecimal(V);
    if (Number.isNaN(i) || Number.isNaN(v)) {
      setMessage('Type both readings — ammeter in ampere, voltmeter in volt.');
      return;
    }
    if (!keyIn || Math.abs(reading.Iam) < 0.01) {
      setMessage('Insert the plug key first — with no current there is nothing to read.');
      return;
    }
    const tI = Math.abs(reading.Iam);
    const tV = Math.abs(reading.Vvm);
    const okI = within(i, tI, P.lcA);
    const okV = within(v, tV, P.lcV);
    onRead({ I: tI, V: tV });
    if (okI && okV) {
      setOk(true);
      setMessage('Both readings are right. Write them down — you will compare them in a moment.');
      complete();
    } else if (tries === 0) {
      setTries(1);
      setMessage(
        `${okI ? '' : 'The ammeter reading is off. '}${okV ? '' : 'The voltmeter reading is off. '}` +
          'Open the close-up, count the small lines between two labelled numbers to find what one is worth, and try again.',
      );
    } else {
      setTries(2);
      setMessage(
        `The needles were at about **${tI.toFixed(2)} A** and **${tV.toFixed(1)} V**. Reading takes practice — the practical gives you four more goes.`,
      );
      complete();
    }
  };

  const status = ok ? 'ok' : tries ? 'error' : null;
  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1.25 }}>
        <NumberField id="tour-read-i" label="Ammeter" unit="A" value={I} onChange={setI} onEnter={check} disabled={completed} placeholder="0.00" status={status} />
        <NumberField id="tour-read-v" label="Voltmeter" unit="V" value={V} onChange={setV} onEnter={check} disabled={completed} placeholder="0.0" status={status} />
        <Button variant="outlined" onClick={check} disabled={completed}>
          Check
        </Button>
      </Box>
      <Verdict text={message} />
    </>
  );
}
