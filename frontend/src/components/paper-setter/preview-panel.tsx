'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { Metric } from '@/components/ui/metric';
import { SectionHeader } from '@/components/ui/layout';
import { WidgetEmpty, WidgetLoading } from '@/components/widgets/widget-states';

import { AvailabilityPanel } from './availability-panel';
import { formatShare } from './availability';
import type { BlueprintShape, ChapterTarget, ComposePreview } from './contract';
import { blueprintTotals } from './pattern-draft';
import type { TreeNode } from './node-tree';
import { WizardPanel, PanelNote } from './panel';
import { RefusalNotice } from './refusal-notice';

export const PREVIEW_COSTS_NOTHING =
  'Asking this costs nothing and writes nothing, so it runs on every change. It is the ' +
  'only thing here that answers whether the paper can actually be built from what your ' +
  'school holds.';

export const TARGETS_ARE_BOOK_QUALIFIED =
  'A target names a chapter in a particular book, never a bare chapter number. Every book ' +
  'has a chapter 1, so an unqualified number would merge two different chapters into one ' +
  'share nobody asked for.';

export function PreviewPanel({
  preview,
  isPending,
  isFetching,
  error,
  onRetry,
  idle,
  tree,
  nodesById,
  hasUnits,
}: {
  preview: ComposePreview | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry?: () => void;
  idle: boolean;
  tree: readonly TreeNode[];
  nodesById: ReadonlyMap<string, TreeNode>;
  hasUnits: boolean;
}): React.ReactElement {
  if (idle) {
    return (
      <WizardPanel title="What this paper would be">
        <WidgetEmpty message="Choose a curriculum and a class, and this panel says what the paper would be before anything is written." />
      </WizardPanel>
    );
  }

  return (
    <Stack spacing={2.5}>
      <WizardPanel
        title="What this paper would be"
        subheader="Free to ask, and the only thing here that answers whether the paper can be built"
        meta={isFetching && preview ? <EmergeChip label="Updating" dot /> : undefined}
      >
        {isPending && !preview ? <WidgetLoading rows={5} /> : null}

        {error ? (
          <RefusalNotice
            error={error}
            title="The paper service would not preview this"
            onRetry={onRetry}
          />
        ) : null}

        {preview ? (
          <Stack spacing={2.5} aria-busy={isFetching || undefined}>
            <WarningList warnings={preview.warnings} />
            <ChapterTargetTable targets={preview.chapter_targets} />
            <BudgetFacts blueprint={preview.blueprint} />
            <PanelNote>{PREVIEW_COSTS_NOTHING}</PanelNote>
          </Stack>
        ) : null}
      </WizardPanel>

      {preview ? (
        <AvailabilityPanel
          rows={preview.nodes}
          unplaceableShare={preview.unplaceable_share}
          unplaceableReasonCodes={preview.unplaceable_reasons}
          books={preview.books}
          tree={tree}
          nodesById={nodesById}
          hasUnits={hasUnits}
          isPending={false}
          error={null}
        />
      ) : null}
    </Stack>
  );
}

export function WarningList({
  warnings,
}: {
  warnings: readonly string[];
}): React.ReactElement | null {
  if (warnings.length === 0) return null;

  return (
    <Box>
      <SectionHeader
        title="Read before you set it"
        subtitle="None of these is a refusal. A paper carrying every one of them may still be the paper you wanted."
      />
      <Stack spacing={1.5}>
        {warnings.map((warning) => (
          <Alert key={warning} severity="warning" variant="outlined">
            {warning}
          </Alert>
        ))}
      </Stack>
    </Box>
  );
}

export function ChapterTargetTable({
  targets,
}: {
  targets: readonly ChapterTarget[];
}): React.ReactElement | null {
  if (targets.length === 0) return null;

  const books = [...new Set(targets.map((target) => target.document_title))];

  return (
    <Box>
      <SectionHeader
        title="What each chapter is asked for"
        subtitle={
          books.length > 1
            ? `Across ${books.length} books, each chapter keyed to the book it is in.`
            : undefined
        }
      />
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Book</TableCell>
              <TableCell>Chapter</TableCell>
              <TableCell align="right">Share</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {targets.map((target) => (
              <TableRow key={`${target.document_id}-${target.chapter_index}`}>
                <TableCell>
                  <Typography variant="body2">{target.document_title}</Typography>
                </TableCell>
                <TableCell>{target.chapter_display}</TableCell>
                <TableCell align="right" sx={NUMERIC}>
                  {formatShare(target.share)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: 1.5 }}>
        <PanelNote>{TARGETS_ARE_BOOK_QUALIFIED}</PanelNote>
      </Box>
    </Box>
  );
}

export function BudgetFacts({
  blueprint,
}: {
  blueprint: BlueprintShape;
}): React.ReactElement | null {
  const sections = blueprint.sections ?? [];
  if (sections.length === 0) return null;
  const totals = blueprintTotals(sections);

  return (
    <Box>
      <SectionHeader title="What the pattern asks for" subtitle={blueprint.name} />
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Metric label="Marks" value={totals.marks} />
        <Metric label="Questions" value={totals.questionCount} />
        <Metric label="Minutes" value={blueprint.duration_min ?? 0} />
        <Metric label="Pages asked for" value={blueprint.page_budget ?? 0} />
      </Stack>
      <Box sx={{ mt: 1.5 }}>
        <PanelNote>
          These come from the pattern you chose, not from a measurement. The real page
          count is known only once the paper is rendered.
        </PanelNote>
      </Box>
    </Box>
  );
}

export function PreviewHeadline({
  preview,
}: {
  preview: ComposePreview | undefined;
}): React.ReactElement | null {
  if (!preview) return null;
  const books = preview.books.length;
  return (
    <Typography variant="caption" color="text.secondary">
      {preview.nodes.length} selected · {books === 1 ? 'one book' : `${books} books`}
      {preview.warnings.length > 0 ? ` · ${preview.warnings.length} to read` : ''}
    </Typography>
  );
}

const NUMERIC = { fontVariantNumeric: 'tabular-nums' } as const;
