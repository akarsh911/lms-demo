'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  WIDGET TEMPLATE — copy this file, do not import it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Copy to `src/components/widgets/<section>/<name>-widget.tsx`, rename, and
 * work through the numbered steps. Everything below is deliberate; if you
 * delete a piece, know what it was doing.
 *
 * This file is excluded from the widget registry, so it never renders.
 * `docs/ONBOARDING.md` is the short version of these comments.
 */

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// ── STEP 3 ── your query hook. One hook per endpoint, in hooks/query/.
// import { useThing } from '@/hooks/query/use-thing';

import { useActiveClass } from '@/hooks/use-active-class';
import type { WidgetProps } from '@/types/widget';

import { WidgetEmpty, WidgetError, WidgetLoading } from '../widget-states';

export function ExampleWidget({ title }: WidgetProps): React.ReactElement {
  // ── STEP 1 ── URL state, not component state.
  // Which class / date / filter is being viewed lives in the URL so it can be
  // shared, bookmarked and stepped through with Back. Every widget on the page
  // reads the same value, so they stay in sync for free.
  const { classId, date } = useActiveClass();

  // ── STEP 2 ── the query.
  // `enabled` guards the params here — a hook cannot be called conditionally,
  // so the condition belongs inside it.
  // const { data, isPending, isError, error, refetch } = useThing(classId, date);
  const data = null as unknown as { items: string[] } | null;
  const isPending = false;
  const isError = false;
  const error: unknown = null;
  const refetch = (): void => {};

  return (
    <Card sx={{ height: '100%' }}>
      {/* ── STEP 3 ── header. `title` comes from the registry, never hardcoded
          here, so the registry stays the single source of truth. */}
      <CardHeader title={title} subheader={date} slotProps={{ title: { variant: 'h4' } }} />

      <CardContent>
        {/* ── STEP 4 ── ALL FOUR STATES. Every one. Skipping a state is what
            produces a card that sits blank forever and nobody can explain. */}

        {/* 4a. no params yet — not an error, just nothing to ask about */}
        {!classId ? <WidgetEmpty message="Choose a class to see this." /> : null}

        {/* 4b. loading — same footprint as the loaded card, so nothing reflows */}
        {classId && isPending ? <WidgetLoading rows={3} /> : null}

        {/* 4c. error — WidgetError renders a 403 as "you do not have access"
            rather than a retryable failure. A 403 is CAS's real authorization
            answer and a legitimate outcome, not a malfunction. */}
        {isError ? <WidgetError error={error} onRetry={() => refetch()} /> : null}

        {/* 4d. loaded but empty — genuinely different from loading */}
        {data && data.items.length === 0 ? (
          <WidgetEmpty message="Nothing here yet." />
        ) : null}

        {/* 4e. data */}
        {data && data.items.length > 0 ? (
          <Stack spacing={1}>
            {data.items.map((item) => (
              <Typography key={item} variant="body2">
                {item}
              </Typography>
            ))}
          </Stack>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * ── STEP 5 ── register it. In `src/components/widgets/registry.ts`:
 *
 *   {
 *     key: 'attendance-example',            // unique within the section
 *     feature: 'emerge.attendance.example', // MUST nest under a real section
 *     title: 'Example',
 *     span: 6,                              // of 12 columns
 *     order: 30,                            // lower renders first
 *     Component: ExampleWidget,
 *   }
 *
 * and add the key to `FEATURE_KEYS` in `src/constants/features.ts`.
 *
 * ── STEP 6 ── decide how it is gated.
 *
 *   Leave the key OUT of `CAS_REGISTERED_KEYS` and it inherits its section:
 *   visible whenever Attendance is. Good while a section is being built out.
 *
 *   To gate it independently, create the key in CAS and add it to
 *   `CAS_REGISTERED_KEYS`. CAS's answer then wins and inheritance stops.
 *
 * ── STEP 7 ── run `npm run check:routes`. It fails the build on a key that is
 * not nested under a real section, a typo, or an unregistered section key.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THINGS THIS WIDGET MUST NEVER DO
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ✗ Check entitlement.  WidgetGrid already decided you may render. A second
 *    check is redundant and gives two answers that can disagree.
 *
 *  ✗ Branch on role or persona.  `if (role === 'teacher')` is a lint error and
 *    a build failure. Gate on a feature key.
 *
 *  ✗ Branch on the grade band.  Ask the theme for a radius or a duration; it
 *    already knows the band. `theme.band` exists for genuine ornament choices
 *    (whether to draw a mascot) and is the escape hatch, not the front door.
 *
 *  ✗ Call a microservice directly.  Go through hooks/query -> services ->
 *    /api/svc/*. The access token is HttpOnly and unreachable from here.
 *
 *  ✗ Hardcode a colour, radius, or spacing value.  Use the theme. A hardcoded
 *    18px corner is the one that stays round on the senior band.
 *
 *  ✗ Own a route.  A panel is not a page. If it needs a URL it is a section —
 *    see docs/ONBOARDING.md §11.
 *
 *  ✗ Swallow errors.  Let them reach TanStack Query; the boundary renders them.
 *    A try/catch here produces a card stuck on "loading" forever.
 */
