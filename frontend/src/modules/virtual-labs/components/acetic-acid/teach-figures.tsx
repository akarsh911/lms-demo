'use client';

import * as React from 'react';

import { brand, hues } from '@/styles/theme/tokens';

import { LABEL_FONT } from '../apparatus-palette';

/**
 * THE TWO DRAWINGS THE ACETIC-ACID TEACHING PANEL SETS UNDER ITS PROSE.
 *
 * THE RULE THEY ARE UNDER, WHICH IS THE PANEL'S OWN. A teaching figure is
 * subject to exactly the constraint the words beside it are: it is not handed
 * the bench, and it may not draw a thing the student is marked for recording.
 * Neither of these takes a tube, a reading or a state — the panel's whole input
 * is `revealed`, and only one of the two looks at even that.
 *
 * WHAT THIS BENCH MARKS, AND SO WHAT IS KEPT OUT OF THESE (`@labs/lib/
 * acetic-acid/observations.ts`): the smell of tubes 1 and 2, **how many layers
 * tubes 2 and 3 settle into**, what each litmus strip did, the effervescence,
 * whether the lime water went milky, and the two conclusions — the nature of
 * the acid and the name of the gas. So nothing here carries a pH, a colour, a
 * gas or a count of layers.
 *
 * The ionisation drawing is state-free outright: it is the structure of the
 * molecule and where its equilibrium sits, which is the same before the rack is
 * filled as after it is marked, and which the prose above it already states in
 * words. The mixing drawing is state-free in the part that teaches the
 * mechanism — hydrogen bonding at the molecular scale — and holds its
 * BULK-SCALE half back until `revealed`, because two liquids standing in two
 * layers is precisely row `solC`. The panel says out loud that it will give "no
 * count of layers"; this figure keeps that promise rather than quietly breaking
 * it in a picture.
 */

// ---------------------------------------------------------------------------
// The drawing kit
// ---------------------------------------------------------------------------

const INK = brand.ink;
const NOTE = brand.sub;
const FAINT = brand.tert;
const RULE = brand.line2;
/** Oxygen, by the convention every chemistry book draws it in. */
const OXY = hues.red;
/** The one hydrogen the whole practical is about. */
const PROTON = brand.orange;
const WATER = hues.blue;
const HBOND = hues.violet;

interface Pt {
  readonly x: number;
  readonly y: number;
}

const P = (x: number, y: number): Pt => ({ x, y });

/**
 * A bond, drawn short of the atom letters at each end.
 *
 * `half` is the one-and-a-half bond of a carboxylate: a whole bond plus a
 * dashed one, which is how the delocalisation is drawn without an arc over the
 * top of an already busy structure.
 */
function Bond({
  from,
  to,
  gap = 9,
  gapTo,
  kind = 'single',
}: {
  from: Pt;
  to: Pt;
  gap?: number;
  gapTo?: number;
  kind?: 'single' | 'double' | 'half';
}): React.ReactElement {
  const g2 = gapTo ?? gap;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const x1 = from.x + ux * gap;
  const y1 = from.y + uy * gap;
  const x2 = to.x - ux * g2;
  const y2 = to.y - uy * g2;
  if (kind === 'single') {
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={1.7} strokeLinecap="round" />;
  }
  const nx = -uy * 2.4;
  const ny = ux * 2.4;
  return (
    <>
      <line
        x1={x1 + nx}
        y1={y1 + ny}
        x2={x2 + nx}
        y2={y2 + ny}
        stroke={INK}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <line
        x1={x1 - nx}
        y1={y1 - ny}
        x2={x2 - nx}
        y2={y2 - ny}
        stroke={INK}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeDasharray={kind === 'half' ? '3 2.6' : undefined}
      />
    </>
  );
}

function Atom({
  at,
  text,
  fill = INK,
  size = 11,
}: {
  at: Pt;
  text: string;
  fill?: string;
  size?: number;
}): React.ReactElement {
  return (
    <text
      x={at.x}
      y={at.y}
      fontSize={size}
      fontWeight={700}
      fill={fill}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={LABEL_FONT}
    >
      {text}
    </text>
  );
}

/** A label, set away from the drawing and joined to it by a line. */
function Note({
  x,
  y,
  lines,
  anchor = 'start',
  size = 8,
  fill = NOTE,
  strongFirst = false,
}: {
  x: number;
  y: number;
  lines: readonly string[];
  anchor?: 'start' | 'middle' | 'end';
  size?: number;
  fill?: string;
  strongFirst?: boolean;
}): React.ReactElement {
  return (
    <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontFamily={LABEL_FONT}>
      {lines.map((line, i) => (
        <tspan
          key={`${i}-${line}`}
          x={x}
          dy={i === 0 ? 0 : size * 1.3}
          fontWeight={strongFirst && i === 0 ? 700 : 400}
          fill={strongFirst && i === 0 ? INK : fill}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function Leader({ d }: { d: string }): React.ReactElement {
  return <path d={d} fill="none" stroke={FAINT} strokeWidth={0.9} strokeLinecap="round" />;
}

// ---------------------------------------------------------------------------
// 1. Ionisation
// ---------------------------------------------------------------------------

const ION_DESC =
  'Ethanoic acid drawn as a structure. A methyl carbon carries three hydrogens and joins a carboxyl ' +
  'carbon, which is double bonded to one oxygen and single bonded to a second oxygen carrying the acidic ' +
  'hydrogen, ringed. Two unequal equilibrium arrows lead to the ethanoate ion, in which both carbon to ' +
  'oxygen bonds are drawn as one and a half bonds with a part negative charge on each oxygen, plus a ' +
  'separate hydrogen ion. The forward arrow is short and faint and the back arrow long and heavy: the ' +
  'balance sits far to the left, and only the carboxyl hydrogen ever leaves.';

/**
 * WHY ETHANOIC ACID IS A WEAK ACID, drawn.
 *
 * Three things a sentence says poorly and a structure says at once: that the
 * hydrogen which leaves is the one on the carboxyl oxygen and NOT one of the
 * three on the methyl carbon, which no amount of water will touch; that what is
 * left behind spreads its charge across both oxygens, which is the reason the
 * proton can go at all; and that the balance sits far to the left, drawn as two
 * arrows of different weight rather than said again in words.
 *
 * STATE-FREE. It takes no props. It is the molecule, not the tube: there is no
 * pH on it, no litmus colour, no layer and no gas, so it reads the same before
 * the rack is filled as it does after the table is marked. The one number on it
 * — about one molecule in a hundred — is the figure the prose above it already
 * prints, and it is not a thing anyone is marked for recording.
 */
export function IonisationFigure(): React.ReactElement {
  const C1 = P(38, 82);
  const Ha = P(38, 56);
  const Hb = P(14, 68);
  const Hc = P(20, 106);
  const C2 = P(72, 82);
  const Od = P(72, 52);
  const Os = P(94, 100);
  const Hp = P(112, 90);

  const Me = P(198, 82);
  const C2b = P(214, 82);
  const Odb = P(214, 50);
  const Osb = P(238, 100);

  return (
    <svg viewBox="0 0 300 184" role="img" aria-label={ION_DESC}>
      <title>{ION_DESC}</title>

      {/* ---- the acid ---- */}
      <Bond from={C1} to={Ha} gap={8} gapTo={7} />
      <Bond from={C1} to={Hb} gap={8} gapTo={7} />
      <Bond from={C1} to={Hc} gap={8} gapTo={7} />
      <Bond from={C1} to={C2} />
      <Bond from={C2} to={Od} kind="double" />
      <Bond from={C2} to={Os} />
      <Bond from={Os} to={Hp} gap={8} gapTo={7} />
      <Atom at={Ha} text="H" size={9} fill={FAINT} />
      <Atom at={Hb} text="H" size={9} fill={FAINT} />
      <Atom at={Hc} text="H" size={9} fill={FAINT} />
      <Atom at={C1} text="C" />
      <Atom at={C2} text="C" />
      <Atom at={Od} text="O" fill={OXY} />
      <Atom at={Os} text="O" fill={OXY} />
      <circle cx={Hp.x} cy={Hp.y} r={9.5} fill="none" stroke={PROTON} strokeWidth={1.1} strokeDasharray="2.5 2.5" />
      <Atom at={Hp} text="H" fill={PROTON} size={10} />

      {/* ---- the equilibrium, drawn unequal ---- */}
      <line x1={130} y1={74} x2={152} y2={74} stroke={FAINT} strokeWidth={1.3} strokeLinecap="round" />
      <line x1={152} y1={74} x2={146} y2={70.6} stroke={FAINT} strokeWidth={1.3} strokeLinecap="round" />
      <line x1={166} y1={86} x2={128} y2={86} stroke={INK} strokeWidth={1.9} strokeLinecap="round" />
      <line x1={128} y1={86} x2={134} y2={89.4} stroke={INK} strokeWidth={1.9} strokeLinecap="round" />
      <Note x={141} y={66} lines={['1 in 100']} anchor="middle" size={7} fill={FAINT} />
      <Note x={147} y={102} lines={['99 in 100']} anchor="middle" size={7} fill={INK} />

      {/* ---- the ethanoate ion, charge spread over both oxygens ---- */}
      <Atom at={P(184, 82)} text="H₃C" size={10.5} />
      <Bond from={Me} to={C2b} gap={2} gapTo={9} />
      <Bond from={C2b} to={Odb} kind="half" />
      <Bond from={C2b} to={Osb} kind="half" />
      <Atom at={C2b} text="C" />
      <Atom at={Odb} text="O" fill={OXY} />
      <Atom at={Osb} text="O" fill={OXY} />
      <Note x={214} y={36} lines={['δ−']} anchor="middle" size={7.5} fill={OXY} />
      <Note x={238} y={116} lines={['δ−']} anchor="middle" size={7.5} fill={OXY} />
      <Atom at={P(256, 82)} text="+" size={10} fill={FAINT} />
      <Atom at={P(274, 82)} text="H⁺" size={11} fill={PROTON} />

      {/* ---- what the drawing is for ---- */}
      <Leader d="M134 27 L120 83" />
      <Note
        x={132}
        y={20}
        lines={['the −COOH proton is the only one that leaves']}
        anchor="middle"
        size={7.8}
        fill={INK}
      />

      <Leader d="M26 131 L21 115" />
      <circle cx={21} cy={114} r={1.6} fill={FAINT} />
      <Note x={8} y={140} lines={['three C–H hydrogens —', 'none of them ionise']} size={7.5} />

      <Leader d="M196 132 C210 124 220 110 226 99" />
      <circle cx={227} cy={98} r={1.6} fill={FAINT} />
      <Note
        x={292}
        y={140}
        lines={['the charge is spread over both oxygens,', 'which is what lets the proton go at all']}
        anchor="end"
        size={7.5}
      />

      <Note
        x={150}
        y={168}
        lines={['the balance sits far to the left — which is all that “a weak acid” means']}
        anchor="middle"
        size={7.5}
        fill={FAINT}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 2. Mixing
// ---------------------------------------------------------------------------

/** One water molecule: an oxygen with its two hydrogens, pointing `rot` degrees. */
function WaterMolecule({ at, rot }: { at: Pt; rot: number }): React.ReactElement {
  const arm = (deg: number): Pt => {
    const r = ((rot + deg) * Math.PI) / 180;
    return P(at.x + Math.cos(r) * 8.6, at.y + Math.sin(r) * 8.6);
  };
  const h1 = arm(-52);
  const h2 = arm(52);
  return (
    <g>
      <line x1={at.x} y1={at.y} x2={h1.x} y2={h1.y} stroke={WATER} strokeWidth={1.7} opacity={0.55} />
      <line x1={at.x} y1={at.y} x2={h2.x} y2={h2.y} stroke={WATER} strokeWidth={1.7} opacity={0.55} />
      <circle cx={h1.x} cy={h1.y} r={3} fill={WATER} opacity={0.4} />
      <circle cx={h2.x} cy={h2.y} r={3} fill={WATER} opacity={0.4} />
      <circle cx={at.x} cy={at.y} r={5.2} fill={WATER} opacity={0.85} />
    </g>
  );
}

function HydrogenBond({ from, to }: { from: Pt; to: Pt }): React.ReactElement {
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={HBOND}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeDasharray="2.4 2.6"
    />
  );
}

const MIX_DESC_BASE =
  'Two molecular scenes side by side. On the left, an ethanoic acid molecule: its carbonyl oxygen and its ' +
  'hydroxyl hydrogen are each joined by a dashed hydrogen bond to a nearby water molecule, so the acid ' +
  'joins the water network and the two mix. On the right, a zig-zag chain of carbon and hydrogen with no ' +
  'charged or lopsided part; the water molecules below it hydrogen bond only to one another, and a dashed ' +
  'stub reaching towards the chain ends in a small cross.';

const MIX_DESC_REVEALED =
  ' Beneath, once the marks are settled, two jars: a liquid that mixes stands as one uniform column, and a ' +
  'hydrocarbon with water stands as two layers with a sharp boundary between them.';

/**
 * WHAT DECIDES WHETHER TWO LIQUIDS MIX, drawn at the scale where it is decided.
 *
 * A tube of something cloudy teaches nothing about why. This draws the actual
 * reason: the −COOH end is as lopsided as water itself and offers a hydrogen
 * bond BOTH ways — its carbonyl oxygen takes one of water's hydrogens, its own
 * hydroxyl hydrogen is taken by a water oxygen — so an acid molecule can pay for
 * the water–water bonds it breaks. A chain of carbon and hydrogen has nothing to
 * offer anywhere along it, so the water closes ranks and bonds to itself.
 *
 * STATE-FREE, AND GATED WHERE IT HAS TO BE. It is handed no tube: not which
 * liquids are in the rack, not whether anything has been shaken, not what
 * anything settled into. The molecular half above is therefore safe at any
 * point in the practical and is always drawn.
 *
 * The BULK half — one uniform liquid against two layers — is exactly the answer
 * to the two solubility rows this bench marks (`solB` and `solC`), and the
 * panel's own "what this panel will not tell you" promises no count of layers.
 * So it waits on `revealed`, which is the single boolean the panel already
 * runs on, and not on anything that could tell it about a particular tube.
 */
export function MixingFigure({ revealed }: { revealed: boolean }): React.ReactElement {
  const height = revealed ? 290 : 172;
  // The layered jar is drawn as flat bands inside a rounded outline, so the
  // boundary between them is a straight line and not two rounded corners.
  const jarClip = `mix-jar-${React.useId().replace(/:/g, '')}`;

  // Left: the acid, hydrogen-bonded into the water around it.
  const Me = P(34, 62);
  const C = P(66, 62);
  const Od = P(66, 38);
  const Os = P(88, 78);
  const Hp = P(106, 70);
  const w1 = P(96, 28);
  const w2 = P(122, 92);
  const w3 = P(34, 102);

  // Right: a chain with nothing to offer, and water keeping its own company.
  const chain = [P(164, 58), P(184, 44), P(204, 58), P(224, 44), P(244, 58), P(264, 44), P(284, 58)];
  const pack = [P(176, 96), P(206, 104), P(236, 96), P(266, 104)];

  return (
    <svg viewBox={`0 0 300 ${height}`} role="img" aria-label={MIX_DESC_BASE + (revealed ? MIX_DESC_REVEALED : '')}>
      <title>{MIX_DESC_BASE + (revealed ? MIX_DESC_REVEALED : '')}</title>

      <line x1={150} y1={14} x2={150} y2={126} stroke={RULE} strokeWidth={1} />

      {/* ---- the acid in water ---- */}
      <Bond from={Me} to={C} gap={14} />
      <Bond from={C} to={Od} kind="double" />
      <Bond from={C} to={Os} />
      <Bond from={Os} to={Hp} gap={8} gapTo={7} />
      <Atom at={Me} text="H₃C" size={10} />
      <Atom at={C} text="C" />
      <Atom at={Od} text="O" fill={OXY} />
      <Atom at={Os} text="O" fill={OXY} />
      <Atom at={Hp} text="H" size={9} />

      <HydrogenBond from={P(70, 46)} to={P(90, 34)} />
      <HydrogenBond from={P(112, 74)} to={P(116, 86)} />
      <HydrogenBond from={P(42, 98)} to={P(82, 84)} />
      <WaterMolecule at={w1} rot={140} />
      <WaterMolecule at={w2} rot={210} />
      <WaterMolecule at={w3} rot={-40} />

      <Note
        x={76}
        y={140}
        lines={['the −COOH end bonds to water', 'both ways — so it mixes right in']}
        anchor="middle"
        size={7.5}
      />

      {/* ---- a hydrocarbon chain among the same water ---- */}
      <path
        d={chain.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')}
        fill="none"
        stroke={INK}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Note x={224} y={30} lines={['a chain of C and H — nothing lopsided']} anchor="middle" size={7} fill={FAINT} />

      {pack.map((p, i) => {
        const next = pack[i + 1];
        return (
          <React.Fragment key={`w${p.x}`}>
            {next ? <HydrogenBond from={P(p.x + 7, p.y + 2)} to={P(next.x - 7, next.y - 2)} /> : null}
            <WaterMolecule at={p} rot={i % 2 === 0 ? -30 : 200} />
          </React.Fragment>
        );
      })}
      <HydrogenBond from={P(210, 92)} to={P(214, 74)} />
      <g stroke={FAINT} strokeWidth={1.3} strokeLinecap="round">
        <line x1={211} y1={66} x2={219} y2={74} />
        <line x1={219} y1={66} x2={211} y2={74} />
      </g>
      <Note x={226} y={72} lines={['nothing to hold']} size={7} fill={FAINT} />

      <Note
        x={224}
        y={140}
        lines={['so water keeps to its own', 'company, and the chain is shut out']}
        anchor="middle"
        size={7.5}
      />

      <line x1={104} y1={159} x2={122} y2={159} stroke={HBOND} strokeWidth={1.4} strokeDasharray="2.4 2.6" />
      <Note x={127} y={162} lines={['hydrogen bond']} size={7} fill={FAINT} />

      {/* ---- and only once the rows are marked, what that looks like in a jar ---- */}
      {revealed ? (
        <>
          <line x1={8} y1={178} x2={292} y2={178} stroke={RULE} strokeWidth={1} />
          <Note
            x={150}
            y={188}
            lines={['now your table is in — what each kind of', 'mixture looks like once it has stood']}
            anchor="middle"
            size={7.5}
            fill={FAINT}
          />
          <defs>
            <clipPath id={jarClip}>
              <rect x={194} y={206} width={44} height={54} rx={7} />
            </clipPath>
          </defs>
          <g>
            <rect x={62} y={206} width={44} height={54} rx={7} fill={WATER} opacity={0.18} />
            <rect x={62} y={206} width={44} height={54} rx={7} fill="none" stroke={INK} strokeWidth={1.4} />
            <Note x={84} y={272} lines={['acid + water', 'one clear layer']} anchor="middle" size={7.5} strongFirst />
          </g>
          <g>
            <g clipPath={`url(#${jarClip})`}>
              <rect x={194} y={206} width={44} height={24} fill={hues.amber} opacity={0.32} />
              <rect x={194} y={230} width={44} height={30} fill={WATER} opacity={0.18} />
              <line x1={194} y1={230} x2={238} y2={230} stroke={INK} strokeWidth={1.6} />
            </g>
            <rect x={194} y={206} width={44} height={54} rx={7} fill="none" stroke={INK} strokeWidth={1.4} />
            <Note
              x={216}
              y={272}
              lines={['a hydrocarbon + water', 'two layers, and a boundary']}
              anchor="middle"
              size={7.5}
              strongFirst
            />
          </g>
        </>
      ) : null}
    </svg>
  );
}
