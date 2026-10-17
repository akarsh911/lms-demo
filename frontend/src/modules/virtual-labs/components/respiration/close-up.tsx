'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { EmergeChip, RichText } from '@/components/ui';
import {
  DIP_ML,
  RISE_CAP,
  SEED,
  SETUPS,
  SETUP_KOH,
  dips,
  look,
  milkiness,
  type Appearance,
  type Flask,
} from '@labs/lib/respiration/biology';
import { APPEARANCE_WORD } from '@labs/lib/respiration/marking';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, motionSx, useBenchMotion } from '../bench-motion';

import { LIME_REFERENCE, LimeGlass, ReferenceTube } from './lime-tube';

/**
 * The close-up, docked beside the observation input.
 *
 * Judging how milky the lime water is IS the reading this practical is marked
 * on, and on the bench the tube is 38 units wide inside a drawing that scales
 * to fit — far too small to tell "just turning milky" from "milky". So the
 * selected tube is magnified here, and beside it stand three REFERENCE tubes
 * at known milkiness, drawn by the same component from the same ramp. That is
 * how the comparison is made with a real colour card: hold yours against the
 * printed one, and pick the square it matches.
 *
 * The panel says what is IN the apparatus — grams, millilitres, whether the
 * tube dips, whether the cork is sealed — and what has changed since the
 * student last stopped the clock. It never says what to write down.
 */

function Line({ children }: { children: React.ReactNode }): React.ReactElement {
  const theme = useTheme();
  return (
    <Box component="li" sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, textWrap: 'pretty' }}>
      {children}
    </Box>
  );
}

/** The magnified test tube, with the delivery tube coming into it. */
function TubeCloseUp({ flask }: { flask: Flask }): React.ReactElement {
  const uid = `close${flask.index}`;
  const submerged = dips(flask);
  return (
    <svg
      viewBox="0 0 120 250"
      role="img"
      // Volume only, like the tube on the bench. How milky it has gone is the
      // marked reading; putting it in the accessible name would answer the
      // question for one student and not another.
      aria-label={`Close-up of the test tube: ${flask.lime.ml} mL of lime water`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <rect width={120} height={250} rx={10} fill={apparatus.bench} />
      <LimeGlass m={milkiness(flask)} ml={flask.lime.ml} cx={60} top={16} bottom={236} w={52} mlPx={11.6} floor={232} uid={uid} />
      <path
        d={`M44 4 V96 Q44 110 60 110 V${submerged ? 150 : 110}`}
        fill="none"
        stroke="rgba(210,238,255,.8)"
        strokeWidth={7}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The method 2 flask, where the reading is a column of water, not a colour. */
function MethodTwoCloseUp({ flask }: { flask: Flask }): React.ReactElement {
  const top = 212 - flask.rise;
  return (
    <svg
      viewBox="0 0 120 250"
      role="img"
      aria-label={`Close-up of the method 2 flask: water risen ${Math.round(flask.rise)} of ${RISE_CAP}`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <rect width={120} height={250} rx={10} fill={apparatus.bench} />
      <path
        d="M47 84 V130 L16 200 Q16 210 26 210 H94 Q104 210 104 200 L73 130 V84 Z"
        fill="rgba(255,255,255,.05)"
        stroke="rgba(255,255,255,.55)"
        strokeWidth={1.5}
      />
      {flask.koh ? (
        <>
          <rect x={51} y={130} width={18} height={46} rx={9} fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.5)" />
          <rect x={53} y={148} width={14} height={26} rx={6} fill="rgba(190,226,164,.5)" />
        </>
      ) : null}
      {flask.cork ? (
        <>
          <rect x={40} y={66} width={40} height={20} rx={3} fill="#c08a4e" stroke="#8a5f30" />
          <path d={`M60 66 V30 H104 V${top}`} fill="none" stroke="rgba(210,238,255,.8)" strokeWidth={5} />
          <rect x={101.5} y={top} width={5} height={Math.max(0, flask.rise)} fill="rgba(90,160,220,.85)" />
        </>
      ) : null}
      <rect x={86} y={212} width={34} height={34} fill="rgba(90,160,220,.45)" stroke="rgba(255,255,255,.4)" />
      <text x={12} y={244} fontSize={9} fill={apparatus.benchLabel} fontFamily={LABEL_FONT} fontWeight={600}>
        rise {Math.round(flask.rise)}/{RISE_CAP}
      </text>
    </svg>
  );
}

export function SetupCloseUp({
  flask,
  index,
  labMinutes,
  tempC,
  picked,
  onPick,
  revealed = false,
  maxWidth,
}: {
  flask: Flask;
  index: number;
  labMinutes: number;
  tempC: number;
  /** What the student has written for this tube, so the strip shows the choice. */
  picked: Appearance | '';
  /** Only at the record step: tapping a reference tube fills the row. */
  onPick?: (app: Appearance) => void;
  /**
   * True once this row has been submitted and marked. Until then the change
   * notice says THAT a tube moved and never WHAT it moved to, because the words
   * for what it moved to are the options the row is marked on.
   */
  revealed?: boolean;
  maxWidth?: number;
}): React.ReactElement {
  const theme = useTheme();
  const moving = useBenchMotion();
  const setup = SETUPS[index];
  const method2 = index === SETUP_KOH;
  const seen = flask.seen;
  const nowApp: Appearance = look(flask);

  return (
    <Box data-tour="respiration-closeup" sx={{ maxWidth, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1 }}>
        {/*
          The magnified tube IS this practical's reading, so it has to cloud the
          same way the one on the bench does — same rules, same `animation` flag,
          or a student judging "just turning milky" here would be judging
          something the bench never showed them.
        */}
        <Box sx={{ flex: 'none', width: 74, ...benchMotionSx, ...motionSx(moving) }}>
          {method2 ? <MethodTwoCloseUp flask={flask} /> : <TubeCloseUp flask={flask} />}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: theme.band.type.base - 1, fontWeight: 800, color: theme.brand.ink }}>
            {setup ? `${setup.name} · ${setup.sub}` : 'Method 2 · KOH set-up'}
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2 }}>
            <Line>{flask.seeds ? `${flask.seeds.g} g of ${SEED[flask.seeds.kind].name}` : 'No seeds in the flask yet'}</Line>
            {method2 ? (
              <Line>
                {flask.koh ? 'KOH tube inside — it soaks up the CO₂ the seeds release' : 'No KOH tube inside, so nothing will rise'}
              </Line>
            ) : (
              <Line>
                {flask.lime.ml
                  ? `${flask.lime.ml} mL of lime water${
                      dips(flask) ? ' — the delivery tube dips below the surface' : ''
                    }`
                  : 'No lime water in the test tube yet'}
                {flask.lime.ml && !dips(flask) ? (
                  <Box component="span" sx={{ ml: 0.5 }}>
                    <EmergeChip tone="red" label={`the tube does not reach the liquid — ${DIP_ML} mL`} />
                  </Box>
                ) : null}
              </Line>
            )}
            <Line>
              {flask.cork
                ? flask.sealed
                  ? 'Cork fitted and sealed with vaseline'
                  : 'Cork resting in the neck — not sealed'
                : 'No cork or delivery tube yet'}
            </Line>
            <Line>
              {flask.runMin > 0
                ? `Standing for ${Math.round(flask.runMin)} min at ${tempC} °C`
                : `Clock not started for this flask · ${tempC} °C`}
            </Line>
            {flask.sealTest ? <Line>{flask.sealTest}</Line> : null}
          </Box>
        </Box>
      </Box>

      {/* The three references are a comparison, so they appear when there is
          something to compare: while the flasks are being built they are three
          pictures of nothing, and they cost more of the console than the
          magnified tube they sit under. */}
      {method2 || !(onPick || seen) ? null : (
        <>
          <Box
            role={onPick ? 'group' : undefined}
            aria-label={onPick ? 'Hold the tube against these three and pick the one it matches' : undefined}
            sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75 }}
          >
            {LIME_REFERENCE.map((ref) => {
              const isPicked = picked === ref.app;
              return (
                <Box
                  key={ref.app}
                  component={onPick ? 'button' : 'div'}
                  type={onPick ? 'button' : undefined}
                  onClick={onPick ? () => onPick(ref.app) : undefined}
                  aria-label={onPick ? ref.label : undefined}
                  aria-pressed={onPick ? isPicked : undefined}
                  sx={{
                    p: 0.5,
                    border: `1.5px solid ${isPicked ? theme.brand.ink : 'transparent'}`,
                    borderRadius: `${theme.band.radius.sm}px`,
                    backgroundColor: isPicked ? theme.brand.sunken : 'transparent',
                    cursor: onPick ? 'pointer' : 'default',
                    textAlign: 'center',
                    '&:focus-visible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: 2 },
                  }}
                >
                  <ReferenceTube m={ref.m} uid={`ref-${ref.app}`} />
                  <Box
                    component="span"
                    sx={{
                      display: 'block',
                      mt: 0.25,
                      fontSize: theme.band.type.min - 1,
                      fontWeight: isPicked ? 800 : 600,
                      color: isPicked ? theme.brand.ink : theme.brand.tert,
                      lineHeight: 1.2,
                    }}
                  >
                    {ref.label}
                  </Box>
                </Box>
              );
            })}
          </Box>

          <Typography sx={{ mt: 0.75, fontSize: theme.band.type.min, color: theme.brand.tert, textWrap: 'pretty' }}>
            {seen ? (
              <RichText
                text={
                  /*
                    WHAT CHANGED, NOT WHAT IT IS. Reporting what a tube has done
                    since the student last stopped the clock is the point of a
                    five-minute wait, and worth keeping. Naming the state it has
                    arrived at is not: "still clear" / "plainly milky" is the
                    row the appearance marks are for, and the CO₂ row follows
                    straight out of it. So until it is marked, the notice says
                    only that the tube moved — which tells a student to look
                    again, and tells them nothing about what they will see.
                  */
                  seen.app === nowApp
                    ? `Since you last looked at ${Math.round(seen.min)} min: **no change** after ${Math.round(labMinutes)} min${
                        revealed ? ` — ${APPEARANCE_WORD[nowApp]}` : ''
                      }.`
                    : revealed
                      ? `Since you last looked at ${Math.round(seen.min)} min: **${APPEARANCE_WORD[seen.app]} → ${APPEARANCE_WORD[nowApp]}**.`
                      : `**It has changed** since you last looked at ${Math.round(seen.min)} min — hold it against the three above again.`
                }
              />
            ) : (
              'Hold the tube against the three above.'
            )}
            {onPick ? ' Tapping one writes it in your table.' : null}
          </Typography>
        </>
      )}
    </Box>
  );
}
