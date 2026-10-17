'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { FlaskConical, X } from 'lucide-react';

import { useLabSessions } from '@labs/hooks/use-lab-sessions';
import { formatClock } from '@labs/lib/numbers';
import { activeSession, dismissSession } from '@labs/lib/session-store';
import { ROUTE_INDEX } from '@/routes/registry';
import { shadows } from '@/styles/theme/tokens';

/**
 * THE BENCH YOU WALKED AWAY FROM, following you round the app.
 *
 * A student checking their timetable in the middle of a practical should not
 * have to remember which of fifteen it was, or that they were on step four.
 * This is that bookmark: name, how far in, the score so far, the clock, and one
 * button back to it.
 *
 * WHY IT IS A CARD AND NOT A LIVE MINIATURE. A picture-in-picture bench is the
 * obvious answer and the wrong one. The apparatus is a large drawing driven by
 * a ten-times-a-second clock, so a live copy would cost every OTHER page in the
 * product; and shrunk into a corner it is too small to read a meniscus, a
 * needle or a colour off, which is the only reason a student would want to
 * refer to it. What a student actually needs away from the bench is to find
 * their way back to it, which is small, cheap and exact. The apparatus stays
 * where the work is.
 *
 * DISMISSING IS NOT DISCARDING. The × takes the card down and leaves the
 * practical alone: opening it again still offers to pick it up where it was
 * left (`ResumeOffer`). Only finishing, or starting a fresh bench, throws work
 * away — and neither of those is something a student should be able to do by
 * tidying up their screen.
 */
export function ResumeDock(): React.ReactElement | null {
  const theme = useTheme();
  const sessions = useLabSessions();
  const pathname = usePathname();
  const search = useSearchParams();
  const params = useParams<{ persona?: string }>();

  const record = activeSession(sessions);
  if (!record) return null;

  const persona = typeof params?.persona === 'string' ? params.persona : null;
  const labsPath = ROUTE_INDEX.get('learning-labs')?.path;
  if (!persona || !labsPath) return null;

  // Silent whenever a bench is open — not merely THIS bench.
  //
  // A student standing at a practical is at a practical: a card in the corner
  // is either pointing at what is already on screen, or interrupting the work
  // in front of them to advertise different work. Neither is worth covering the
  // console for. The other bench has not gone anywhere; it is in the practical
  // file, and it comes back the moment they leave the labs.
  if (pathname === `/p/${persona}/${labsPath}` && search.has('practical')) return null;

  const href =
    `/p/${persona}/${labsPath}?practical=${encodeURIComponent(record.bench)}` +
    (record.seed !== null ? `&bench=${record.seed}` : '');

  return (
    <Box
      role="complementary"
      aria-label="Unfinished practical"
      sx={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: theme.zIndex.snackbar,
        width: 288,
        maxWidth: 'calc(100vw - 32px)',
        p: 1.25,
        borderRadius: `${theme.band.radius.lg}px`,
        border: `1px solid ${theme.brand.line2}`,
        backgroundColor: theme.brand.surface,
        boxShadow: shadows.raised,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box
          sx={{
            width: 26,
            height: 26,
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            borderRadius: '999px',
            backgroundColor: theme.tints.orange,
          }}
        >
          <FlaskConical size={14} color={theme.brand.orangeLo} aria-hidden />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: theme.band.type.base - 1,
              color: theme.brand.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {record.title}
          </Typography>
          <Typography
            sx={{
              fontSize: theme.band.type.min,
              color: theme.brand.sub,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Step {Math.min(record.step + 1, record.steps)} of {record.steps} ·{' '}
            {Math.round(record.score)}/{Math.round(record.max)} · {formatClock(record.elapsedMs)}
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-label="Hide this until I open the practical again"
          onClick={() => dismissSession(record.bench, Date.now())}
          sx={{ mt: -0.5, mr: -0.5, color: theme.brand.tert }}
        >
          <X size={14} />
        </IconButton>
      </Box>

      {/* A progress rule rather than a number: it is read at a glance from the
          corner of the eye, which is how a card like this is read at all. */}
      <Box
        sx={{
          mt: 1,
          height: 3,
          borderRadius: 999,
          backgroundColor: theme.brand.sunken,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: `${Math.round((Math.min(record.step, record.steps) / Math.max(1, record.steps)) * 100)}%`,
            backgroundColor: theme.brand.orange,
          }}
        />
      </Box>

      <Button
        component={Link}
        href={href}
        size="small"
        variant="contained"
        fullWidth
        sx={{ mt: 1 }}
      >
        Back to the bench
      </Button>
    </Box>
  );
}
