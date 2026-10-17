'use client';

import * as React from 'react';

import { hues, brand } from '@/styles/theme/tokens';

/**
 * THE POTENTIAL LADDER — a staircase of potential taken once round a circuit.
 *
 * Two things about a series circuit are hard to hold in the head at the same
 * time: the current is the same everywhere, and the potential is not. A student
 * who has only seen a circuit DIAGRAM has no picture of the second at all,
 * because a diagram draws position and says nothing about level. This draws the
 * level: height is potential, left-to-right is how far round the loop you have
 * walked, and every element you pass is a step down.
 *
 * WHY IT CARRIES NO NUMBERS. It is set inside a teaching panel, and those
 * panels are blind to the bench by construction — they cannot see a reading and
 * so cannot print one. The shares below are therefore PROPORTIONS chosen by the
 * caller to show which drop is large and which is negligible, and the drawing
 * labels them by name only. A ladder with volts on it would be an answer; a
 * ladder with shapes on it is an explanation.
 *
 * Two paths may be drawn on the same axes. That is what a parallel branch needs:
 * both branches leave the same point and arrive at the same point, so they start
 * and finish at the same two levels however differently they get there.
 */

export interface LadderStep {
  /** Printed under the run, in up to two lines split on `|`. */
  label: string;
  /** Share of the whole rise this element takes, 0–1. A rise is negative. */
  share: number;
}

export interface LadderPath {
  /** Named in the key when there is more than one path. */
  name?: string;
  steps: readonly LadderStep[];
  hue?: string;
  /**
   * Draw this path broken rather than solid. Two parallel branches fall through
   * exactly the same potentials — that is what parallel MEANS — so their
   * staircases coincide, and the only way to show both is to let one be dashed
   * and sit on top of the other.
   */
  dash?: boolean;
}

const W = 340;
const H = 196;
const LEFT = 52;
const RIGHT = 330;
const TOP = 34;
const BASE = 142;

function stair(steps: readonly LadderStep[]): { d: string; marks: { x: number; label: string }[] } {
  const width = (RIGHT - LEFT) / steps.length;
  const height = BASE - TOP;
  let level = BASE;
  let x = LEFT;
  let d = `M${LEFT} ${BASE}`;
  const marks: { x: number; label: string }[] = [];
  for (const step of steps) {
    // Each element gets a run of its own and its step happens in the MIDDLE of
    // that run, so the name printed under the run sits directly beneath the
    // step it names. Put the step at the end of the run instead and every drop
    // lands on the boundary between two labels, which is the one place a
    // reader cannot tell which of the two it belongs to.
    x += width / 2;
    d += ` L${x.toFixed(1)} ${level.toFixed(1)}`;
    level += step.share * height;
    d += ` L${x.toFixed(1)} ${level.toFixed(1)}`;
    marks.push({ x, label: step.label });
    x += width / 2;
    d += ` L${x.toFixed(1)} ${level.toFixed(1)}`;
  }
  return { d, marks };
}

export function PotentialLadder({
  paths,
  caption,
  desc,
}: {
  paths: readonly LadderPath[];
  /** The line printed under the drawing. */
  caption: string;
  /** The whole of it in words, for a reader who cannot see it. */
  desc: string;
}): React.ReactElement {
  const many = paths.length > 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc}>
      <title>{desc}</title>

      {/* The two levels the whole story happens between. */}
      <line x1={LEFT - 8} y1={TOP} x2={RIGHT} y2={TOP} stroke={brand.line2} strokeDasharray="3 3" />
      <line x1={LEFT - 8} y1={BASE} x2={RIGHT} y2={BASE} stroke={brand.line2} strokeDasharray="3 3" />
      <line x1={LEFT - 8} y1={TOP - 8} x2={LEFT - 8} y2={BASE + 4} stroke={brand.sub} strokeWidth={0.9} />
      <path d={`M${LEFT - 8} ${TOP - 12} l-3 6 h6 z`} fill={brand.sub} />
      <text x={LEFT - 13} y={TOP + 2} fontSize={8.5} textAnchor="end" fill={brand.sub}>
        full emf
      </text>
      <text x={LEFT - 13} y={BASE + 2} fontSize={8.5} textAnchor="end" fill={brand.sub}>
        0
      </text>
      <text
        x={10}
        y={(TOP + BASE) / 2}
        fontSize={8.5}
        textAnchor="middle"
        fill={brand.tert}
        transform={`rotate(-90 10 ${(TOP + BASE) / 2})`}
      >
        potential
      </text>

      {paths.map((path, i) => {
        const { d, marks } = stair(path.steps);
        const hue = path.hue ?? (i === 0 ? hues.indigo : hues.teal);
        return (
          <g key={path.name ?? `p${i}`}>
            {/* Only the first path labels the runs, and its hairlines go down
                first so the staircase is drawn over them: two sets of labels
                under one axis is unreadable, and in a parallel pair the
                elements line up anyway. */}
            {i === 0
              ? marks.map((mark) => (
                  <line
                    key={`g-${mark.label}`}
                    x1={mark.x}
                    y1={TOP - 4}
                    x2={mark.x}
                    y2={BASE + 6}
                    stroke={brand.line2}
                    strokeWidth={0.7}
                    strokeDasharray="2 3"
                  />
                ))
              : null}
            <path
              d={d}
              fill="none"
              stroke={hue}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeDasharray={path.dash ? '5 4' : undefined}
            />
            {i === 0
              ? marks.map((mark) => (
                  <text
                    key={mark.label}
                    x={mark.x}
                    y={BASE + 15}
                    fontSize={8}
                    textAnchor="middle"
                    fill={brand.sub}
                  >
                    {mark.label.split('|').map((line, k) => (
                      <tspan key={line} x={mark.x} dy={k === 0 ? 0 : 8.5}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                ))
              : null}
          </g>
        );
      })}

      {many ? (
        <g>
          {paths.map((path, i) => (
            <g key={path.name ?? `k${i}`} transform={`translate(${LEFT + i * 100} ${H - 20})`}>
              <line
                x1={0}
                y1={-3}
                x2={12}
                y2={-3}
                stroke={path.hue ?? (i === 0 ? hues.indigo : hues.teal)}
                strokeWidth={2}
                strokeDasharray={path.dash ? '4 3' : undefined}
              />
              <text x={16} y={0} fontSize={8.5} fill={brand.sub}>
                {path.name}
              </text>
            </g>
          ))}
        </g>
      ) : null}
      <text x={W / 2} y={H - 5} fontSize={8.5} textAnchor="middle" fill={brand.tert}>
        {caption}
      </text>
    </svg>
  );
}
