'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ChevronDown, FlaskConical, Minus, RotateCcw, Shuffle, TrendingDown, TrendingUp } from 'lucide-react';

import { EmergeChip, EmptyState, Metric, ProgressBar, ScoreCard, SectionHeader } from '@/components/ui';
import { useLabSessions } from '@labs/hooks/use-lab-sessions';
import { starsForShare } from '@labs/lib/marking';
import { formatClock } from '@labs/lib/numbers';
import { isResumable, type LabSessionRecord } from '@labs/lib/session-record';
import { readHistory, subscribeSessions, type LabHistoryEntry } from '@labs/lib/session-store';

/**
 * PAST EXPERIMENTS — the student's own practical file.
 *
 * A paper practical file is a record you keep: what you did, when you did it,
 * what the examiner said and what it was marked. This is that, for the benches,
 * and it is deliberately a RECORD rather than a leaderboard — every attempt is
 * a row, including the ones that went badly, because the second attempt at a
 * practical only means anything next to the first.
 *
 * WHY THE COMPARISON IS DRAWN AND NOT LEFT TO THE STUDENT. Doing a practical
 * twice is the whole point of a bench that reseeds: the marks moved, or they
 * did not. A list of bare scores makes the student do that subtraction in their
 * head across rows that may be weeks apart, so each row carries its attempt
 * number and, from the second on, how it went against the one before it.
 *
 * WHY NOTHING IS LOOKED UP IN THE BENCH REGISTRY. An entry carries its own
 * title, subtitle and marks precisely so a row can be drawn for a practical
 * whose code this build no longer has — a bench withdrawn from the syllabus
 * still happened, and a student's file should not quietly lose it.
 *
 * The marks here are FINAL. They were rescaled when the attempt was recorded,
 * to match exactly what the student was shown on the result card; rescaling
 * them again here would make the file disagree with the bench.
 */

/** There is no storage on the server, and the first paint has to agree with it. */
const NO_HISTORY: readonly LabHistoryEntry[] = [];

/**
 * Every finished attempt on this machine, newest first.
 *
 * `readHistory` keeps its own cached array and hands back the SAME one until a
 * write clears it, which is what `useSyncExternalStore` requires — a getter
 * that rebuilt the list per call would never agree with itself and would spin.
 */
function useLabHistory(): readonly LabHistoryEntry[] {
  return React.useSyncExternalStore<readonly LabHistoryEntry[]>(
    subscribeSessions,
    readHistory,
    () => NO_HISTORY,
  );
}

/** Where an attempt sits among the attempts at the same practical. */
interface Standing {
  /** 1-based, oldest first: "attempt 2 of 3". */
  n: number;
  of: number;
  /** The attempt before this one at the same practical, if there was one. */
  prev: LabHistoryEntry | null;
}

function standings(history: readonly LabHistoryEntry[]): Map<string, Standing> {
  const byBench = new Map<string, LabHistoryEntry[]>();
  for (const entry of history) {
    const rows = byBench.get(entry.bench);
    if (rows) rows.push(entry);
    else byBench.set(entry.bench, [entry]);
  }
  const out = new Map<string, Standing>();
  for (const rows of byBench.values()) {
    // `history` is newest first, so index 0 is the LAST attempt at this bench.
    rows.forEach((entry, i) => out.set(entry.id, { n: rows.length - i, of: rows.length, prev: rows[i + 1] ?? null }));
  }
  return out;
}

/** Share of the marks, 0–1. Guarded: a bench with no marks must not divide by zero. */
function shareOf(entry: LabHistoryEntry): number {
  return entry.max > 0 ? Math.max(0, Math.min(1, entry.score / entry.max)) : 0;
}

function toneForShare(share: number): 'green' | 'amber' | 'red' {
  if (share >= 0.65) return 'green';
  if (share >= 0.4) return 'amber';
  return 'red';
}

/** Trailing `.0` is noise on a mark out of 10. */
function mark(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Whole days between two instants BY THE CALENDAR, so 11pm → 1am is yesterday. */
function calendarDays(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * When, in the words a person would use.
 *
 * Rounded DOWN within the day and taken from the calendar beyond it, because
 * "yesterday" is a date and not a number of hours: a practical finished at
 * eleven last night is yesterday's work at nine this morning, whatever the
 * arithmetic says.
 */
function whenPhrase(finishedAt: number, now: number): string {
  const minutes = Math.floor((now - finishedAt) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const days = calendarDays(finishedAt, now);
  if (days <= 0) {
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 61) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** The full stamp, for the panel: a record wants a date on it. */
function exactWhen(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Total time at the bench reads in hours long before it reads in seconds. */
function formatSpan(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function PastExperiments({
  onBrowse,
  totalPracticals,
}: {
  /** Back to the catalogue — what an empty file offers, and nothing else. */
  onBrowse: () => void;
  /** How many practicals exist, for "4 of 15 tried". Passed, not looked up. */
  totalPracticals: number;
}): React.ReactElement {
  const theme = useTheme();
  const history = useLabHistory();
  const sessions = useLabSessions();

  // The clock, read ONCE. A `Date.now()` in the render body is impure — and a
  // file of past work has no business re-timing itself under the reader.
  const [now] = React.useState(() => Date.now());

  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const toggle = React.useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const place = React.useMemo(() => standings(history), [history]);
  const unfinished = React.useMemo(() => sessions.filter(isResumable), [sessions]);

  const benches = new Set(history.map((e) => e.bench));
  const totalMs = history.reduce((sum, e) => sum + e.elapsedMs, 0);
  const averageShare =
    history.length > 0 ? history.reduce((sum, e) => sum + shareOf(e), 0) / history.length : 0;

  return (
    <Box>
      {history.length > 0 ? (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Metric label="Attempts" value={history.length} />
            <Metric label="Practicals" value={`${benches.size}`} suffix={`of ${totalPracticals}`} />
            <Metric label="Average" value={`${Math.round(averageShare * 100)}%`} suffix="of marks" />
            <Metric label="At the bench" value={formatSpan(totalMs)} />
          </Box>
          <Typography sx={{ mt: 1.25, color: theme.brand.sub, fontSize: theme.band.type.base - 1, maxWidth: '64ch' }}>
            Every practical you have finished, newest first — kept in this browser so it opens instantly and reads the
            same when the network does not. Your school’s record is the attempt your teacher marks.
          </Typography>
        </Box>
      ) : null}

      {unfinished.length > 0 ? (
        <Box sx={{ mb: 3 }}>
          <SectionHeader title="In progress" subtitle="Left on the bench, still yours to finish" />
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
            {unfinished.map((record) => (
              <UnfinishedRow key={record.bench} record={record} />
            ))}
          </Box>
        </Box>
      ) : null}

      {history.length === 0 ? (
        <EmptyState
          art={<FlaskConical size={34} color={theme.brand.tert} />}
          title={unfinished.length > 0 ? 'Nothing finished yet' : 'Your practical file is empty'}
          body="Finish a practical and it is written up here: the marks part by part, the examiner’s note on how it went, and the exact bench you used — so you can repeat that bench or take a fresh one."
          action={
            <Button variant="contained" size="small" onClick={onBrowse}>
              Choose a practical
            </Button>
          }
        />
      ) : (
        <Box>
          <SectionHeader
            title="Past experiments"
            subtitle={`${history.length} finished attempt${history.length === 1 ? '' : 's'}`}
          />
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
            {history.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                standing={place.get(entry.id) ?? { n: 1, of: 1, prev: null }}
                now={now}
                expanded={open.has(entry.id)}
                onToggle={() => toggle(entry.id)}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * A bench walked away from.
 *
 * At the top and visually apart, because it is the one row on this page that
 * asks something of the student rather than telling them what they have done.
 */
function UnfinishedRow({ record }: { record: LabSessionRecord }): React.ReactElement {
  const theme = useTheme();
  const href = useBenchHref(record.bench, record.seed);
  const step = Math.min(record.step + 1, record.steps);

  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.25,
        p: 1.5,
        borderRadius: `${theme.band.radius.md}px`,
        border: `1px solid ${theme.brand.line2}`,
        backgroundColor: theme.tints.amber,
      }}
    >
      <Box sx={{ minWidth: 0, flex: '1 1 200px' }}>
        <Typography sx={{ fontWeight: 800, fontSize: theme.band.type.base, color: theme.brand.ink }}>
          {record.title}
        </Typography>
        <Typography
          sx={{ fontSize: theme.band.type.min + 1, color: theme.brand.sub, fontVariantNumeric: 'tabular-nums' }}
        >
          Step {step} of {record.steps} · {formatClock(record.elapsedMs)} on the clock
          {record.seed !== null ? ` · bench #${record.seed}` : ''}
        </Typography>
        <Box sx={{ mt: 0.75, maxWidth: 260 }}>
          <ProgressBar
            value={(Math.min(record.step, record.steps) / Math.max(1, record.steps)) * 100}
            tone="amber"
            height={4}
          />
        </Box>
      </Box>
      <Button
        component={Link}
        href={href}
        replace
        scroll={false}
        size="small"
        variant="contained"
        startIcon={<RotateCcw size={14} />}
        aria-label={`Resume ${record.title}`}
      >
        Resume
      </Button>
    </Box>
  );
}

function HistoryRow({
  entry,
  standing,
  now,
  expanded,
  onToggle,
}: {
  entry: LabHistoryEntry;
  standing: Standing;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const panelId = `practical-file-${entry.id}`;
  const share = shareOf(entry);
  const tone = toneForShare(share);
  const repeatHref = useBenchHref(entry.bench, entry.seed);
  const freshHref = useBenchHref(entry.bench, null);

  const prevShare = standing.prev ? shareOf(standing.prev) : null;
  const delta = prevShare === null ? null : Math.round(share * 100) - Math.round(prevShare * 100);

  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        borderRadius: `${theme.band.radius.md}px`,
        border: `1px solid ${expanded ? theme.brand.line2 : theme.brand.line}`,
        backgroundColor: theme.brand.surface,
        overflow: 'hidden',
        transition: `border-color ${theme.band.motion.fast}ms`,
      }}
    >
      <ButtonBase
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        sx={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          p: 1.5,
          '&:hover': { backgroundColor: theme.brand.subtle },
          '&.Mui-focusVisible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: -2 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0, flex: '1 1 210px' }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 0.75 }}>
              <EmergeChip tone="grey" label={standing.of > 1 ? `Attempt ${standing.n} of ${standing.of}` : 'First go'} />
              {delta !== null ? <DeltaChip delta={delta} /> : null}
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: theme.band.type.base, color: theme.brand.ink, lineHeight: 1.3 }}>
              {entry.title}
            </Typography>
            <Typography
              sx={{
                fontSize: theme.band.type.min + 1,
                color: theme.brand.sub,
                mt: 0.25,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {whenPhrase(entry.finishedAt, now)} · took {formatClock(entry.elapsedMs)}
              {entry.seed !== null ? ` · bench #${entry.seed}` : ''}
            </Typography>
          </Box>

          {/* Grows so the marks sit at the right edge on a laptop AND on a phone,
              where this block wraps under the title rather than beside it. */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.25, flex: '1 0 auto' }}>
            <Box sx={{ width: 116 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 0.5 }}>
                <Typography
                  component="span"
                  sx={{
                    fontWeight: 800,
                    fontSize: theme.band.type.h4,
                    color: theme.brand.ink,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {mark(entry.score)}
                </Typography>
                <Typography component="span" sx={{ color: theme.brand.tert, fontSize: theme.band.type.min + 1 }}>
                  / {mark(entry.max)}
                </Typography>
              </Box>
              <Box sx={{ mt: 0.5 }}>
                <ProgressBar value={share * 100} tone={tone} height={5} />
              </Box>
            </Box>
            <Box
              aria-hidden="true"
              sx={{
                display: 'grid',
                placeItems: 'center',
                color: theme.brand.tert,
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: `transform ${theme.band.motion.base}ms`,
              }}
            >
              <ChevronDown size={18} />
            </Box>
          </Box>
        </Box>
      </ButtonBase>

      <Collapse in={expanded} unmountOnExit>
        <Box
          id={panelId}
          sx={{
            px: 1.75,
            pt: 1.5,
            pb: 1.75,
            borderTop: `1px solid ${theme.brand.line}`,
            backgroundColor: theme.brand.subtle,
          }}
        >
          {/* A mark sheet read across a 1440px row is a ledger. Capped, each
              label and its marks stay a pair the eye can join without a rule —
              and the panel itself still spans the card. */}
          <Box sx={{ maxWidth: 560 }}>
            <ScoreCard
              title={entry.subtitle || entry.title}
              score={+entry.score.toFixed(2)}
              max={+entry.max.toFixed(2)}
              stars={starsForShare(share)}
              summary={entry.summary}
              parts={entry.parts}
              details={
                <Box sx={{ mt: 1.5 }}>
                  <Typography sx={{ fontSize: theme.band.type.min + 1, color: theme.brand.tert }}>
                    Finished {exactWhen(entry.finishedAt)} · {formatClock(entry.elapsedMs)} at the bench
                    {entry.seed !== null ? ` · bench #${entry.seed}` : ''}
                  </Typography>
                  {delta !== null && standing.prev ? (
                    <Typography sx={{ fontSize: theme.band.type.min + 1, color: theme.brand.sub, mt: 0.25 }}>
                      {deltaSentence(delta, standing)}
                    </Typography>
                  ) : null}
                </Box>
              }
              actions={
                <>
                  <Button
                    component={Link}
                    href={repeatHref}
                    replace
                    scroll={false}
                    size="small"
                    variant="contained"
                    startIcon={<RotateCcw size={14} />}
                    aria-label={`Repeat this bench — ${entry.title}${entry.seed !== null ? `, bench ${entry.seed}` : ''}`}
                  >
                    Repeat this bench
                  </Button>
                  <Button
                    component={Link}
                    href={freshHref}
                    replace
                    scroll={false}
                    size="small"
                    variant="outlined"
                    startIcon={<Shuffle size={14} />}
                    aria-label={`New bench for ${entry.title}`}
                  >
                    New bench
                  </Button>
                </>
              }
            />
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * How this attempt went against the last one at the same practical.
 *
 * In percentage points of the marks rather than raw marks: two attempts can be
 * out of different totals when the viva is switched off between them, and a
 * share is the one comparison that survives that.
 */
function DeltaChip({ delta }: { delta: number }): React.ReactElement {
  if (delta === 0) return <EmergeChip tone="grey" icon={<Minus size={12} aria-hidden />} label="Same as last time" />;
  if (delta > 0) {
    return <EmergeChip tone="green" icon={<TrendingUp size={12} aria-hidden />} label={`${delta}% better`} />;
  }
  return <EmergeChip tone="coral" icon={<TrendingDown size={12} aria-hidden />} label={`${-delta}% lower`} />;
}

function deltaSentence(delta: number, standing: Standing): string {
  const before = `attempt ${standing.n - 1}`;
  if (delta === 0) return `The same share of the marks as ${before}.`;
  if (delta > 0) return `${delta} percentage points better than ${before}.`;
  return `${-delta} percentage points below ${before}.`;
}

/**
 * The URL for a bench: this page, with the practical named and — when a seed is
 * given — the very same apparatus, readings and viva the student had.
 *
 * Built from the CURRENT query so nothing else on the page is dropped, and
 * `bench` is deleted rather than left behind for a fresh one: a stale seed
 * would silently hand back the bench they asked to leave.
 */
function useBenchHref(bench: string, seed: number | null): string {
  const pathname = usePathname();
  const params = useSearchParams();
  return React.useMemo(() => {
    const next = new URLSearchParams(params);
    next.set('practical', bench);
    if (seed !== null) next.set('bench', String(seed));
    else next.delete('bench');
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [bench, params, pathname, seed]);
}
