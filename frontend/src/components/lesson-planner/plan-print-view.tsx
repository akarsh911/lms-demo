'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import GlobalStyles from '@mui/material/GlobalStyles';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import NextLink from 'next/link';

import { EmptyState } from '@/components/ui/empty-state';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { TIMELINE_TOOL_ID } from '@/constants/timeline';
import { useLessonPlan } from '@/hooks/query/use-lesson-planner';
import { usePlaygroundManifest } from '@/hooks/query/use-playground';
import { formatLongDate } from '@/lib/dates';
import { pageRangeLabel } from '@/lib/mindmap/deep-link';
import { bandOfClass, pageIn } from '@/lib/playground/manifest';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { LessonPlan } from '@/types/lesson-planner';

import { BLOCK_KIND_META } from './block-kinds';
import { CARD_PAD, INNER_GAP, SECTION_GAP } from './spacing';
import { blockWindows, fileNameOf, planToText, slotLine, type ResourceLabel } from './plan-export';

const SHEET_WIDTH = 860;
const PLANNER_ROUTE_KEY = 'learning-lesson-planner';

const printStyles = (
  <GlobalStyles
    styles={{
      '@page': { margin: '14mm' },
      '@media print': {
        'html, body': { background: '#fff' },
        '[data-print="hide"]': { display: 'none !important' },
        '[data-print="page"]': { padding: 0, background: '#fff', minHeight: 0 },
        '[data-print="sheet"]': { boxShadow: 'none', border: 'none', borderRadius: 0, padding: 0, maxWidth: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' },
        '[data-print="keep"]': { breakInside: 'avoid', pageBreakInside: 'avoid' },
      },
    }}
  />
);

function download(plan: LessonPlan, labelOf: ResourceLabel): void {
  const blob = new Blob([planToText(plan, labelOf, formatLongDate)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileNameOf(plan);
  anchor.click();
  URL.revokeObjectURL(url);
}

function Sheet({ plan, labelOf }: { plan: LessonPlan; labelOf: ResourceLabel }): React.ReactElement {
  const theme = useTheme();
  return (
    <Stack spacing={SECTION_GAP}>
      <Box>
        <Typography variant="h2" component="h1">
          {plan.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {plan.subject_name}, {plan.section_label}. {plan.chapter_title}. {plan.periods.length} × {plan.period_minutes} min. {plan.author_name}
        </Typography>
      </Box>

      <Box data-print="keep">
        <Typography variant="h4" component="h2" sx={{ mb: 1 }}>
          Objectives
        </Typography>
        <Box component="ol" sx={{ m: 0, pl: 3 }}>
          {plan.objectives.map((objective) => (
            <Typography key={objective} component="li" variant="body2">
              {objective}
            </Typography>
          ))}
        </Box>
      </Box>

      {plan.periods.map((period) => (
        <Box key={period.id} component="section" sx={{ borderTop: `1px solid ${theme.brand.line2}`, pt: 2 }}>
          <Typography variant="h4" component="h2">
            Period {period.sequence}: {period.focus}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {slotLine(period, formatLongDate) ?? 'Not on the timetable'}
            {period.taught ? ' · Taught' : ''}
          </Typography>
          <Stack spacing={1.5}>
            {blockWindows(period).map(({ block, from, to }) => (
              <Stack key={block.id} direction="row" spacing={2} data-print="keep">
                <Typography variant="caption" sx={{ width: 64, flex: 'none', fontWeight: 700, fontVariantNumeric: 'tabular-nums', pt: 0.25 }}>
                  {from}–{to} min
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0, pl: 1.5, borderLeft: `3px solid ${theme.onTint[BLOCK_KIND_META[block.kind].tone]}` }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {BLOCK_KIND_META[block.kind].label}: {block.title}
                  </Typography>
                  <Typography variant="body2">{block.summary}</Typography>
                  {block.steps.length > 0 ? (
                    <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                      {block.steps.map((step, i) => (
                        <Typography key={i} component="li" variant="body2" color="text.secondary">
                          {step}
                        </Typography>
                      ))}
                    </Box>
                  ) : null}
                  {[...block.citations.map((c) => `${c.title}, ${pageRangeLabel({ from: c.page_start, to: c.page_end }).toLowerCase()}`), ...block.resources.map(labelOf)].map((line) => (
                    <Typography key={line} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {line}
                    </Typography>
                  ))}
                </Box>
              </Stack>
            ))}
          </Stack>
          {period.taught ? (
            <Typography variant="body2" sx={{ mt: 1.5, fontStyle: 'italic' }} data-print="keep">
              Reflection: {period.taught.reflection || 'none written.'}
            </Typography>
          ) : null}
        </Box>
      ))}
    </Stack>
  );
}

export function PlanPrintView({ planId, personaSlug }: { planId: string; personaSlug: string }): React.ReactElement {
  const plan = useLessonPlan(planId);
  const manifest = usePlaygroundManifest();
  const route = ROUTE_INDEX.get(PLANNER_ROUTE_KEY);
  const plannerHref = route ? `${paths.personaSection(personaSlug, route.path)}?tab=plans&plan=${encodeURIComponent(planId)}` : paths.persona(personaSlug);

  const labelOf = React.useCallback<ResourceLabel>(
    (resource) => {
      if (resource.kind === 'playground_tool') {
        if (resource.tool_id === TIMELINE_TOOL_ID) return 'Timeline';
        const tool = manifest.data?.tools.find((candidate) => candidate.id === resource.tool_id);
        return tool ? `Visual playground tool: ${tool.title}` : resource.title;
      }
      if (resource.kind !== 'playground' || !manifest.data) return resource.title;
      const thread = manifest.data.threads.find((candidate) => candidate.id === resource.thread_id);
      const band = bandOfClass(manifest.data, resource.grade);
      const page = thread && band ? pageIn(thread, band.id) : null;
      return page ? `Visual playground: ${page.title}` : resource.title;
    },
    [manifest.data],
  );

  return (
    <Box data-print="page" sx={{ minHeight: '100dvh', bgcolor: 'background.default', px: { xs: 2, sm: 3 }, py: 3 }}>
      {printStyles}
      <Stack data-print="hide" direction="row" spacing={INNER_GAP} sx={{ alignItems: 'center', pb: SECTION_GAP, maxWidth: SHEET_WIDTH, mx: 'auto' }}>
        <Tooltip title="Back to the plan">
          <IconButton component={NextLink} href={plannerHref} aria-label="Back to the plan">
            <ArrowLeft size={18} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Download as text">
          <span>
            <IconButton aria-label="Download as text" disabled={!plan.data} onClick={() => plan.data && download(plan.data, labelOf)}>
              <Download size={18} />
            </IconButton>
          </span>
        </Tooltip>
        <Button variant="contained" startIcon={<Printer size={16} />} disabled={!plan.data} onClick={() => window.print()}>
          Print
        </Button>
      </Stack>
      <Paper data-print="sheet" variant="outlined" sx={{ maxWidth: SHEET_WIDTH, mx: 'auto', p: { xs: CARD_PAD, sm: SECTION_GAP * 2 } }}>
        {plan.isPending ? <WidgetLoading rows={8} /> : null}
        {plan.isError ? (
          <EmptyState title="Plan not found" />
        ) : null}
        {plan.data ? <Sheet plan={plan.data} labelOf={labelOf} /> : null}
      </Paper>
    </Box>
  );
}
