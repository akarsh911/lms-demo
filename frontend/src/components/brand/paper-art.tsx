import * as React from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

// Cut-paper artwork shared with the Emerge marketplace. Transparent, so each piece sits on any ground.
const ART = {
  shelf: { src: '/ground/niche-shelf.webp', ratio: '1200 / 694' },
  lamp: { src: '/ground/niche-lamp.webp', ratio: '1200 / 827' },
} as const;

export type PaperArtName = keyof typeof ART;

// Decoration only: a background, hidden from assistive tech, never the carrier of meaning.
export function PaperArt({
  name,
  width,
  sx,
}: {
  name: PaperArtName;
  width: number | string | Record<string, number | string>;
  sx?: SxProps<Theme>;
}): React.ReactElement {
  const art = ART[name];
  return (
    <Box
      aria-hidden="true"
      sx={[
        {
          width,
          maxWidth: '100%',
          aspectRatio: art.ratio,
          flex: 'none',
          backgroundImage: `url(${art.src})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          pointerEvents: 'none',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
