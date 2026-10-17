'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ChevronRight } from 'lucide-react';

import { RichText } from '@/components/ui';

import { ObservationTable } from './observation-table';

/**
 * HOW A TEACHING PANEL IS SET.
 *
 * The panels themselves are DATA — one pure module per bench under
 * `@labs/lib/<id>/teach.ts` whose whole input is a single boolean. That is what
 * makes them leak-proof rather than carefully-worded: a file with no apparatus
 * in scope cannot print an observation, and no later edit can make it.
 *
 * Keeping the rendering here rather than beside each of those modules is the
 * other half of it. Fifteen benches would otherwise write out the same forty
 * lines of JSX; one copy drifting from the rest is how a badge or a caption
 * quietly stops matching, and a student reading two panels should not be able
 * to tell which was written first.
 *
 * ── WHY IT IS A LIST OF QUESTIONS AND NOT AN ESSAY ────────────────────────
 *
 * These panels are long, and they are long on purpose: "why does the ammeter go
 * in the line" deserves a paragraph, not a caption. But a dozen paragraphs
 * arriving at once reads as homework, and a student halfway through a practical
 * closes it and gets on. Measured on this build, the Ohm's law panel is 2,657px
 * of prose in a 320px window — thirteen scrolls deep with no way to tell what is
 * further down.
 *
 * So the same words are set as a CONTENTS LIST that answers itself. Every
 * section is a question with its answer in one sentence, always visible; the
 * explanation behind it opens when it is asked for. The panel then costs a
 * student eight short answers to skim, and the essay is still there in full for
 * the one who wants it — nothing is cut, and nothing is hidden that was not
 * already three screens down.
 *
 * The `kind` on a section is the other half of that: a student who wants to know
 * what to DO should not have to read past four paragraphs of theory to find it,
 * so the chips filter the list to one intent at a time.
 *
 * A section that carries no explicit `lead` falls back to its first paragraph,
 * which is where these panels already put their answer. That is deliberate — it
 * means a bench gets the new reading experience without its prose being
 * rewritten, and a lead is an improvement on the fallback rather than a
 * precondition for it.
 */

/** What a section is FOR, which is what a student is usually filtering by. */
export type TeachKind = 'why' | 'how' | 'watch' | 'after';

export interface TeachSection {
  /**
   * The question this section answers. Phrase it as a student would ask it —
   * it is the line they scan, and "Why the key comes out between readings"
   * finds its reader where "Thermal effects" does not.
   */
  heading: string;
  /**
   * The answer in one sentence, shown under the heading whether or not the
   * section is open. Omitted, the first paragraph of `body` serves instead.
   */
  lead?: string;
  kind?: TeachKind;
  /** Paragraphs in `RichText` markup: `**bold**`, `_italic_`. */
  body: readonly string[];
  /**
   * A drawing to set under the prose, named rather than supplied.
   *
   * The panels are pure data modules, so a section cannot hold a component
   * without dragging React into `lib/`. It holds a KEY instead, and the bench's
   * own `Teach` wrapper passes the drawings it has under `figures`. An unknown
   * key draws nothing, which is the right failure: a figure is an illustration
   * of the words above it, never the thing being said.
   */
  figure?: string;
  /** Equations, set apart from the prose. */
  equations?: readonly string[];
  /** An optional plain table, header labels then rows of cells. */
  table?: {
    caption: string;
    columns: readonly string[];
    rows: readonly (readonly string[])[];
  };
}

const KIND_LABEL: Record<TeachKind, string> = {
  why: 'Why it works',
  how: 'How to do it',
  watch: 'Watch out',
  after: 'After marking',
};

const KIND_ORDER: readonly TeachKind[] = ['why', 'how', 'watch', 'after'];

/** Roughly what a Class 10 reader gets through, and deliberately conservative. */
const WORDS_PER_MINUTE = 170;

function readingSeconds(section: TeachSection): number {
  const words = [...section.body, ...(section.equations ?? [])]
    .join(' ')
    .trim()
    .split(/\s+/).length;
  return Math.max(15, Math.round((words / WORDS_PER_MINUTE) * 60));
}

function readingLabel(seconds: number): string {
  return seconds < 60 ? `${Math.round(seconds / 5) * 5} sec` : `${Math.round(seconds / 60)} min`;
}

/** The answer line, and what is left to open behind it. */
function split(section: TeachSection): { lead: string; rest: readonly string[] } {
  if (section.lead) return { lead: section.lead, rest: section.body };
  const [first, ...rest] = section.body;
  return { lead: first ?? '', rest };
}

/** Whether opening this section would show anything the lead did not. */
function hasMore(section: TeachSection): boolean {
  const { rest } = split(section);
  return rest.length > 0 || Boolean(section.equations?.length) || Boolean(section.table) || Boolean(section.figure);
}

export function TeachSections({
  sections,
  figures,
}: {
  sections: readonly TeachSection[];
  /** Drawings this bench can set, by the key a section names. */
  figures?: Readonly<Record<string, React.ReactNode>>;
}): React.ReactElement {
  const theme = useTheme();
  const [open, setOpen] = React.useState<readonly string[]>([]);
  const [filter, setFilter] = React.useState<TeachKind | null>(null);

  // Only the intents this bench actually uses, in a fixed order, so the chip
  // row does not reshuffle itself between one practical and the next.
  const kinds = KIND_ORDER.filter((k) => sections.some((s) => s.kind === k));
  const shown = filter ? sections.filter((s) => s.kind === filter) : sections;
  const allOpen = shown.length > 0 && shown.every((s) => open.includes(s.heading));

  const toggle = (heading: string): void =>
    setOpen((was) => (was.includes(heading) ? was.filter((h) => h !== heading) : [...was, heading]));

  return (
    <>
      {(kinds.length > 1 || sections.length > 2) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', mb: 1 }}>
          {kinds.length > 1 ? (
            <>
              <FilterChip label="Everything" on={filter === null} onClick={() => setFilter(null)} />
              {kinds.map((kind) => (
                <FilterChip
                  key={kind}
                  label={KIND_LABEL[kind]}
                  on={filter === kind}
                  onClick={() => setFilter(kind)}
                />
              ))}
            </>
          ) : null}
          <Box
            component="button"
            type="button"
            onClick={() => setOpen(allOpen ? [] : shown.map((s) => s.heading))}
            sx={{
              ml: 'auto',
              border: 0,
              background: 'none',
              cursor: 'pointer',
              p: 0.25,
              fontFamily: 'inherit',
              fontSize: theme.band.type.min,
              color: theme.brand.sub,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            {allOpen ? 'Collapse all' : 'Read it all'}
          </Box>
        </Box>
      )}

      {shown.map((section) => {
        const { lead, rest } = split(section);
        const isOpen = open.includes(section.heading);
        const more = hasMore(section);
        const seconds = readingSeconds(section);
        return (
          <Box
            key={section.heading}
            sx={{
              borderTop: `1px solid ${theme.brand.line}`,
              py: 0.85,
              '&:first-of-type': { borderTop: 0, pt: 0 },
            }}
          >
            <Box
              component={more ? 'button' : 'div'}
              type={more ? 'button' : undefined}
              onClick={more ? () => toggle(section.heading) : undefined}
              aria-expanded={more ? isOpen : undefined}
              sx={{
                display: 'flex',
                width: '100%',
                gap: 0.75,
                alignItems: 'flex-start',
                textAlign: 'left',
                border: 0,
                p: 0,
                background: 'none',
                font: 'inherit',
                color: 'inherit',
                cursor: more ? 'pointer' : 'default',
              }}
            >
              {more ? (
                <Box
                  aria-hidden
                  sx={{
                    flex: 'none',
                    mt: '1px',
                    color: theme.brand.tert,
                    transform: isOpen ? 'rotate(90deg)' : 'none',
                    transition: 'transform .18s ease',
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                  }}
                >
                  <ChevronRight size={14} />
                </Box>
              ) : (
                <Box aria-hidden sx={{ flex: 'none', width: 14 }} />
              )}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  component="h4"
                  sx={{
                    m: 0,
                    fontWeight: 700,
                    fontSize: theme.band.type.base - 1,
                    color: theme.brand.ink,
                  }}
                >
                  {section.heading}
                </Typography>
                {/* The answer, always. A contents list a student has to open to
                    find out whether it was worth opening is not a contents
                    list — it is a row of doors. */}
                {lead ? (
                  <Typography component="p" sx={{ m: 0, mt: 0.25, fontSize: 'inherit', textWrap: 'pretty' }}>
                    <RichText text={lead} />
                  </Typography>
                ) : null}
              </Box>
              {more && !isOpen ? (
                <Box
                  component="span"
                  sx={{
                    flex: 'none',
                    mt: '2px',
                    fontSize: theme.band.type.min,
                    color: theme.brand.tert,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {readingLabel(seconds)}
                </Box>
              ) : null}
            </Box>

            {isOpen ? (
              <Box sx={{ pl: 2.6, pr: 0.5 }}>
                {rest.map((paragraph) => (
                  <Typography
                    key={paragraph}
                    component="p"
                    sx={{ m: 0, mt: 0.75, fontSize: 'inherit', textWrap: 'pretty' }}
                  >
                    <RichText text={paragraph} />
                  </Typography>
                ))}
                {section.figure && figures?.[section.figure] ? (
                  <Box sx={{ mt: 1, '& svg': { display: 'block', width: '100%', height: 'auto' } }}>
                    {figures[section.figure]}
                  </Box>
                ) : null}
                {section.equations?.length ? (
                  <Box
                    sx={{
                      mt: 0.75,
                      px: 1,
                      py: 0.75,
                      borderRadius: `${theme.band.radius.sm}px`,
                      border: `1px solid ${theme.brand.line}`,
                      backgroundColor: theme.brand.canvas,
                    }}
                  >
                    {section.equations.map((equation) => (
                      <Typography
                        key={equation}
                        component="p"
                        sx={{
                          m: 0,
                          fontWeight: 700,
                          textAlign: 'center',
                          fontSize: 'inherit',
                          color: theme.brand.ink,
                        }}
                      >
                        {equation}
                      </Typography>
                    ))}
                  </Box>
                ) : null}
                {section.table ? (
                  <Box sx={{ mt: 1 }}>
                    <ObservationTable
                      caption={section.table.caption}
                      columns={section.table.columns.map((label) => ({ label, align: 'left' as const }))}
                      rows={section.table.rows.map((row) => [...row])}
                    />
                  </Box>
                ) : null}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </>
  );
}

function FilterChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={on}
      onClick={onClick}
      sx={{
        px: 0.85,
        py: 0.25,
        borderRadius: 999,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: theme.band.type.min,
        fontWeight: 700,
        border: `1px solid ${on ? 'transparent' : theme.brand.line2}`,
        backgroundColor: on ? theme.brand.ink : 'transparent',
        color: on ? theme.brand.surface : theme.brand.sub,
      }}
    >
      {label}
    </Box>
  );
}
