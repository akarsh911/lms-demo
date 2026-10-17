import * as React from 'react';

import type { ObjectId } from '@labs/lib/focal-length/optics';

/**
 * What the mirror or the lens is looking at, drawn in OBJECT centimetres with
 * the principal axis at y = 0.
 *
 * The same drawing is used three times: through the window at the back of the
 * room, on the screen (scaled by the magnification v/u and turned upside down,
 * because that is what a real image does), and in the magnified close-up of the
 * screen. One drawing means the tiny inverted smudge on the card is visibly the
 * same tree, which is the whole lesson of a real image.
 */

/** A tree in a field, with a building and a water tank behind it. */
export function FarScene(): React.ReactElement {
  return (
    <g>
      <rect x={-900} y={-650} width={1800} height={1300} fill="#bcd6ea" />
      <rect x={-900} y={440} width={1800} height={210} fill="#7f9760" />
      <rect x={400} y={-160} width={400} height={600} fill="#9aa7b4" />
      <rect x={470} y={-260} width={260} height={110} rx={22} fill="#8894a1" />
      <g fill="#5d6b79">
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2].map((col) => (
            <rect key={`${row}-${col}`} x={440 + col * 130} y={-90 + row * 140} width={84} height={96} />
          )),
        )}
      </g>
      <rect x={-32} y={100} width={64} height={340} fill="#6b4f33" />
      <g fill="#3c6b39">
        <circle cx={0} cy={-80} r={260} />
        <circle cx={-185} cy={70} r={190} />
        <circle cx={190} cy={60} r={200} />
      </g>
    </g>
  );
}

/** The candle on the bench: a small, near object, and the wrong one to use. */
export function NearScene(): React.ReactElement {
  return (
    <g>
      <rect x={-30} y={-22} width={60} height={44} fill="#111417" />
      <rect x={-2.4} y={0.5} width={4.8} height={18} fill="#efe7d2" />
      <ellipse cx={0} cy={-4.2} rx={2.4} ry={5.6} fill="#ffc95e" />
      <ellipse cx={0} cy={-3} rx={1.1} ry={3.1} fill="#fff8e0" />
    </g>
  );
}

export function Scene({ objId }: { objId: ObjectId | null }): React.ReactElement {
  return objId === 'candle' ? <NearScene /> : <FarScene />;
}
