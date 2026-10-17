'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Atom, FlaskRound, Leaf } from 'lucide-react';

import { EmergeChip, Segmented } from '@/components/ui';
import { WidgetFrame } from '@/components/widgets/widget-frame';
import type { BenchMeta, BenchSubject } from '@labs/types/lab-bench';

import { BENCH_METAS } from './bench-registry';
import { PastExperiments } from './past-experiments';

/**
 * The practical file: every bench on the syllabus, grouped as a student's
 * course is, with the CBSE number they will see on their exam list.
 *
 * It fills the workspace while no practical is open, so the space a bench
 * would take is spent on choosing one instead of on an empty card. Once a
 * practical is open the switcher in the bench's own header takes over.
 *
 * # The two halves
 *
 * What is on the syllabus, and what this student has actually done. They are
 * the same object seen twice, so they are one card with a switch in its header
 * rather than two: a separate route would need a registry entry and a feature
 * key, and a second card below would push whichever half is wanted off the
 * screen. The switch is local state on purpose — which half you were looking
 * at is not worth a URL, and putting it in one would collide with `?practical`
 * the moment a bench opens.
 */
type CatalogueView = 'practicals' | 'history';

const VIEWS: readonly { value: CatalogueView; label: string }[] = [
  { value: 'practicals', label: 'Practicals' },
  { value: 'history', label: 'My file' },
];

const SUBJECT_ICON: Record<BenchSubject, typeof Atom> = {
  Physics: Atom,
  Chemistry: FlaskRound,
  Biology: Leaf,
};

const SUBJECT_TONE: Record<BenchSubject, 'violet' | 'teal' | 'green'> = {
  Physics: 'violet',
  Chemistry: 'teal',
  Biology: 'green',
};

const SUBJECT_ORDER: BenchSubject[] = ['Physics', 'Chemistry', 'Biology'];

export function BenchCatalogue({
  onOpen,
  unknownId,
}: {
  onOpen: (id: string) => void;
  /** Set when a link named a practical that is not here. */
  unknownId?: string | null;
}): React.ReactElement {
  const [view, setView] = React.useState<CatalogueView>('practicals');

  return (
    <WidgetFrame
      // Not "Virtual labs" again: that is the page's own heading directly above.
      title={view === 'practicals' ? 'Choose a practical' : 'Past experiments'}
      eyebrow="Class 10 Science · CBSE practical file"
      allowFullscreen={false}
      actions={
        <Segmented
          options={VIEWS}
          value={view}
          onChange={setView}
          ariaLabel="Show the practicals, or what I have done"
        />
      }
      bodySx={{ backgroundColor: (t) => t.brand.canvas, overflowY: 'auto', p: 2.5 }}
    >
      {view === 'history' ? (
        <PastExperiments
          onBrowse={() => setView('practicals')}
          totalPracticals={BENCH_METAS.length}
        />
      ) : (
        <PracticalList onOpen={onOpen} unknownId={unknownId} />
      )}
    </WidgetFrame>
  );
}

/** The syllabus half: every bench there is, grouped by subject. */
function PracticalList({
  onOpen,
  unknownId,
}: {
  onOpen: (id: string) => void;
  unknownId?: string | null;
}): React.ReactElement {
  const theme = useTheme();
  const bySubject = SUBJECT_ORDER.map((subject) => ({
    subject,
    benches: BENCH_METAS.filter((m) => m.subject === subject),
  })).filter((group) => group.benches.length > 0);

  return (
    <Box>
      <Typography sx={{ color: theme.brand.sub, fontSize: theme.band.type.base - 0.5, maxWidth: '68ch' }}>
        Each one is the real procedure: set the apparatus up yourself, take your own readings, and answer the viva.
        Nothing is scripted — wire it wrong, or skip a step, and it behaves exactly as it would on the bench.
      </Typography>

      {unknownId ? (
        <Typography sx={{ mt: 1.5, color: theme.onTint.red, fontSize: theme.band.type.base - 1 }}>
          The link you followed named “{unknownId}”, which isn’t one of these.
        </Typography>
      ) : null}

      {bySubject.map(({ subject, benches }) => (
        <Box key={subject} sx={{ mt: 3 }}>
          <Typography
            component="h3"
            sx={{
              fontSize: theme.band.type.min + 1,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: theme.brand.tert,
              mb: 1.25,
            }}
          >
            {subject}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                lg: 'repeat(3, minmax(0, 1fr))',
                xl: 'repeat(4, minmax(0, 1fr))',
              },
            }}
          >
            {benches.map((meta) => (
              <BenchCard key={meta.id} meta={meta} onOpen={() => onOpen(meta.id)} />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function BenchCard({ meta, onOpen }: { meta: BenchMeta; onOpen: () => void }): React.ReactElement {
  const theme = useTheme();
  const Icon = SUBJECT_ICON[meta.subject];

  return (
    <ButtonBase
      onClick={onOpen}
      sx={{
        display: 'block',
        textAlign: 'left',
        height: '100%',
        p: 1.75,
        borderRadius: `${theme.band.radius.md}px`,
        border: `1px solid ${theme.brand.line}`,
        backgroundColor: theme.brand.surface,
        transition: `border-color ${theme.band.motion.fast}ms, transform ${theme.band.motion.base}ms, box-shadow ${theme.band.motion.base}ms`,
        '&:hover': { borderColor: theme.brand.orange, transform: 'translateY(-2px)', boxShadow: theme.shadows[2] },
        '&.Mui-focusVisible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 30,
            height: 30,
            flex: 'none',
            borderRadius: `${theme.band.radius.sm}px`,
            display: 'grid',
            placeItems: 'center',
            backgroundColor: theme.tints[SUBJECT_TONE[meta.subject]],
            color: theme.brand.ink,
          }}
        >
          <Icon size={16} />
        </Box>
        <EmergeChip tone={SUBJECT_TONE[meta.subject]} label={`Practical ${meta.cbse}`} />
      </Box>
      <Typography sx={{ fontWeight: 800, fontSize: theme.band.type.base, color: theme.brand.ink, lineHeight: 1.25 }}>
        {meta.title}
      </Typography>
      <Typography sx={{ fontSize: theme.band.type.min + 1, color: theme.brand.sub, mt: 0.5 }}>{meta.blurb}</Typography>
    </ButtonBase>
  );
}
