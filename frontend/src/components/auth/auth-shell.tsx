'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import Image from 'next/image';

import { EmergeLogo } from '@/components/brand/emerge-logo';
import { brand } from '@/styles/theme/tokens';
import { glow, ink, INK_RGB, rose, stone } from '@/styles/theme/colors';

import { HelpLink } from './help-link';

const enter = keyframes`from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none }`;

function Lockup(): React.ReactElement {
  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <EmergeLogo height={52} inkColor={ink[900]} />
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mt: -0.5 }}>
        <Box sx={{ width: 22, height: 2.5, borderRadius: 2, bgcolor: glow[400] }} />
        <Typography sx={{ fontFamily: 'var(--font-mono), monospace', fontSize: 13, letterSpacing: '0.02em', color: ink[700] }}>for the curious</Typography>
        <Box sx={{ width: 22, height: 2.5, borderRadius: 2, bgcolor: glow[400] }} />
      </Stack>
    </Box>
  );
}

// Both edges traced from the design reference, in a 1000 × 600 box stretched to the card.
const FRONT = 'M0 0 H535.1 C535.7 0.9 535.7 0.0 538.4 5.5 C541.2 11.1 548.7 24.0 551.7 33.2 C554.6 42.4 555.7 51.6 556.3 60.8 C556.8 70.0 556.5 79.3 555.0 88.5 C553.4 97.7 550.3 106.9 547.0 116.1 C543.7 125.3 540.2 134.6 535.1 143.8 C530.0 153.0 523.3 162.2 516.6 171.4 C509.8 180.6 501.5 189.9 494.7 199.1 C487.9 208.3 480.8 217.5 475.5 226.7 C470.2 235.9 466.1 245.2 462.9 254.4 C459.7 263.6 457.2 272.8 456.3 282.0 C455.4 291.2 454.0 295.9 457.6 309.7 C461.3 323.5 472.3 346.5 478.1 365.0 C484.0 383.4 490.5 404.1 492.7 420.3 C494.9 436.4 492.7 450.2 491.4 461.8 C490.1 473.3 488.5 480.2 484.8 489.4 C481.0 498.6 475.6 507.8 468.9 517.1 C462.1 526.3 453.4 535.5 444.4 544.7 C435.3 553.9 428.0 563.1 414.6 572.4 C401.1 581.6 372.1 595.4 363.6 600.0 H0 Z';
const BACK = 'M0 0 H582.8 C583.7 1.8 586.3 3.7 588.1 11.1 C589.8 18.4 593.0 34.1 593.4 44.2 C593.7 54.4 591.8 63.6 590.1 71.9 C588.3 80.2 585.9 86.6 582.8 94.0 C579.7 101.4 576.6 108.1 571.5 116.1 C566.4 124.2 559.2 133.2 552.3 142.4 C545.5 151.6 536.5 162.0 530.5 171.4 C524.4 180.9 519.3 188.9 515.9 199.1 C512.5 209.2 510.2 221.2 509.9 232.3 C509.7 243.3 510.4 252.5 514.6 265.4 C518.8 278.3 527.9 293.1 535.1 309.7 C542.3 326.3 554.1 346.5 557.6 365.0 C561.1 383.4 559.2 404.1 556.3 420.3 C553.4 436.4 546.4 450.2 540.4 461.8 C534.4 473.3 528.0 480.2 520.5 489.4 C513.0 498.6 503.5 507.8 495.4 517.1 C487.2 526.3 478.1 535.5 471.5 544.7 C464.9 553.9 459.6 563.1 455.6 572.4 C451.7 581.6 449.0 595.4 447.7 600.0 H0 Z';

// Two sheets of paper across the whole card, scaled to it: a pale one behind and the warm one in front with a rose rim.
function PaperLayers(): React.ReactElement {
  const sheet = (d: string, fill: string, filter: string): React.ReactElement => (
    <Box aria-hidden sx={{ position: 'absolute', inset: 0, filter, pointerEvents: 'none' }}>
      <Box component="svg" viewBox="0 0 1000 600" preserveAspectRatio="none" sx={{ width: 1, height: 1, display: 'block' }}>
        <path d={d} fill={fill} />
      </Box>
    </Box>
  );
  return (
    <Box aria-hidden sx={{ display: { xs: 'none', md: 'block' }, position: 'absolute', inset: 0, zIndex: 0 }}>
      {sheet(BACK, brand.surface, `drop-shadow(4px 2px 4px rgb(${INK_RGB} / 0.09)) drop-shadow(12px 6px 18px rgb(${INK_RGB} / 0.08))`)}
      {sheet(FRONT, stone[50], `drop-shadow(2px 1px 1px ${rose[300]}) drop-shadow(3px 2px 4px ${rose[200]}) drop-shadow(8px 5px 12px rgb(${INK_RGB} / 0.12))`)}
    </Box>
  );
}

// The sign-in card: the curious-learner panel on the left, a cut-paper wave, and the form on white.
export function AuthShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: { xs: 0, md: 4 }, bgcolor: 'background.default' }}>
      <Box
        component="main"
        sx={(theme) => ({
          position: 'relative',
          width: 1,
          maxWidth: { md: 1480 },
          minHeight: { xs: '100dvh', md: 'min(880px, calc(100dvh - 64px))' },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.55fr) minmax(400px, 1fr)' },
          borderRadius: { xs: 0, md: '28px' },
          overflow: 'hidden',
          bgcolor: theme.palette.common.white,
          boxShadow: { xs: 'none', md: `0 30px 70px -40px ${theme.palette.divider}, 0 1px 2px ${theme.palette.divider}` },
          animation: `${enter} 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        })}
      >
        <PaperLayers />
        <Box sx={{ position: 'relative', bgcolor: { xs: stone[50], md: 'transparent' }, px: { xs: 3, sm: 5, md: 7 }, pt: { xs: 4, md: 6 }, pb: { xs: 6, md: 5 }, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Lockup />
            <Typography variant="display" component="p" sx={{ mt: { xs: 3, md: 5 }, fontSize: { xs: '2rem', md: 'clamp(1.9rem, 2.9vw, 3.4rem)' }, lineHeight: 1.04, letterSpacing: '-0.035em' }}>
              A little curiosity.
              <br />A world of{' '}
              <Box component="span" sx={{ color: 'primary.main' }}>
                possibility.
              </Box>
            </Typography>
            <Typography variant="body1" component="p" sx={{ mt: 2, color: stone[600], fontSize: { xs: '1.05rem', md: 'clamp(1rem, 1.25vw, 1.4rem)' }, fontWeight: 400 }}>
              Your learning journey continues here.
            </Typography>
          </Box>

          <Box sx={{ display: { xs: 'none', md: 'block' }, position: 'relative', zIndex: 1, flex: 1, minHeight: 220, mt: 2, width: '62%', maxWidth: 560 }}>
            <Image src="/auth/reader.png" alt="" fill priority unoptimized style={{ objectFit: 'contain', objectPosition: 'left center' }} />
          </Box>

          <Stack direction="row" spacing={1.5} sx={{ display: { xs: 'none', md: 'flex' }, position: 'relative', zIndex: 1, alignItems: 'center', mt: 2 }}>
            <Typography variant="body1" color="text.secondary">
              by
            </Typography>
            <Box sx={(theme) => ({ width: '1px', height: 28, bgcolor: theme.palette.divider })} />
            <Image src="/auth/harbour-mark.png" alt="" width={26} height={27} unoptimized />
            <Typography variant="h6" component="p" sx={{ fontWeight: 500 }}>
              Harbour AI
            </Typography>
          </Stack>

          <Box component="svg" aria-hidden viewBox="0 0 900 60" preserveAspectRatio="none" sx={{ display: { xs: 'block', md: 'none' }, position: 'absolute', left: 0, bottom: -1, width: 1, height: 34, pointerEvents: 'none' }}>
            <path d="M0 30 C 160 6 300 50 450 28 S 760 4 900 26 V60 H0 Z" fill="white" />
            <path d="M0 30 C 160 6 300 50 450 28 S 760 4 900 26" fill="none" stroke={rose[300]} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </Box>
        </Box>

        <Stack sx={{ position: 'relative', zIndex: 1, px: { xs: 3, sm: 6, md: 8 }, py: { xs: 4, md: 6 }, justifyContent: 'center' }}>
          <Box sx={{ width: 1, maxWidth: 460, mx: 'auto' }}>{children}</Box>
          <Box sx={{ position: { md: 'absolute' }, right: 48, bottom: 36, mt: { xs: 4, md: 0 }, textAlign: { xs: 'center', md: 'right' } }}>
            <HelpLink />
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
