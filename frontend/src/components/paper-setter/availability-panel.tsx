'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import { WidgetEmpty, WidgetLoading } from '@/components/widgets/widget-states';

import {
  ATTRIBUTION_RULE,
  MAPPING_NOT_BUILT,
  NO_DOUBLE_COUNTING,
  NO_DOWNWARD_ROLL_UP,
  UNDERSTATED_CHAPTER,
  VERDICT_SENTENCE,
  formatShare,
  mappingNotBuilt,
  reasonCounts,
  reasonsPresent,
  SHARE_DENOMINATOR,
  supplyStateOf,
  supplyStatesPresent,
  thinReasons,
  underTargetNodes,
  unplaceableReasons,
  unplaceableSentence,
  verdictOf,
  type AvailabilityVerdict,
  type SupplyState,
  type ThinReason,
  type ThinReasonKey,
} from './availability';
import {
  bookKey,
  bookLabel,
  bookSetOf,
  bookTroubleOf,
  bookTroubles,
  unresolvedBookSentence,
} from './books';
import type { BookTrouble } from './books';
import type { ComposeBook, NodeAvailability } from './contract';
import type { TreeNode } from './node-tree';
import { WizardPanel, PanelNote } from './panel';
import { RefusalNotice } from './refusal-notice';
import { availabilityGroups, understatedChapters } from './selection';

export const NEVER_A_BLOCK =
  'A topic with less material than it was asked for is a warning, never a refusal. The ' +
  'paper still generates, and the preview says how close the solver got.';

export const UNITS_ARE_SEPARATE_BOOKS =
  'Each unit stands for its own book, so two chapters with the same name under different ' +
  'units are different material and are counted separately. They are never pooled.';

const REASON_HEADER: Record<ThinReasonKey, string> = {
  not_indexed: 'Not indexed',
  stale: 'Source changed',
  unpublished: 'Draft you can read',
  unreadable: 'Not yours',
  source_deleted: 'Removed',
};

const REASON_ORDER: readonly ThinReasonKey[] = [
  'not_indexed',
  'stale',
  'unpublished',
  'unreadable',
  'source_deleted',
];

const VERDICT_TONE: Record<AvailabilityVerdict, ChipTone> = {
  not_measurable: 'blue',
  under_target: 'amber',
  met: 'green',
  unweighted: 'grey',
};

const VERDICT_LABEL: Record<AvailabilityVerdict, string> = {
  not_measurable: 'Nothing to measure yet',
  under_target: 'Under its target',
  met: 'Enough material',
  unweighted: 'Unweighted',
};

const WHOSE_LABEL: Record<SupplyState['whose'], string> = {
  teacher: 'Yours to fix',
  school: 'An administrator decides this',
  platform: 'Ask for those books to be indexed',
  nobody: 'Nothing to act on',
};

export function AvailabilityPanel({
  rows,
  unplaceableShare,
  unplaceableReasonCodes,
  books,
  tree,
  nodesById,
  hasUnits,
  isPending,
  error,
  onRetry,
}: {
  rows: readonly NodeAvailability[];
  unplaceableShare: number | undefined;
  unplaceableReasonCodes: readonly string[] | undefined;
  books: readonly ComposeBook[] | undefined;
  tree: readonly TreeNode[];
  nodesById: ReadonlyMap<string, TreeNode>;
  hasUnits: boolean;
  isPending: boolean;
  error: unknown;
  onRetry?: () => void;
}): React.ReactElement {
  const titleOf = (row: NodeAvailability): string =>
    nodesById.get(row.node_id)?.title ?? (row.title === '' ? row.node_id : row.title);

  const groups = React.useMemo(() => availabilityGroups(tree, rows), [tree, rows]);
  const bookSet = React.useMemo(() => bookSetOf(books, hasUnits), [books, hasUnits]);
  const unmatched = React.useMemo(() => mappingNotBuilt(rows), [rows]);
  const understated = React.useMemo(() => understatedChapters(tree, rows), [tree, rows]);

  const reasonCards = React.useMemo(() => {
    const seen = new Map<ThinReasonKey, ThinReason>();
    for (const row of rows) {
      for (const reason of thinReasons(row)) {
        const running = seen.get(reason.key);
        seen.set(
          reason.key,
          running ? { ...running, count: running.count + reason.count } : reason,
        );
      }
    }
    return [...seen.values()];
  }, [rows]);

  const columns = React.useMemo(() => {
    const present = new Set(reasonsPresent(rows));
    return REASON_ORDER.filter((key) => present.has(key));
  }, [rows]);

  const supplyCards = React.useMemo(() => supplyStatesPresent(rows), [rows]);

  const needingAttention = React.useMemo(
    () => (unmatched ? [] : underTargetNodes(rows)),
    [rows, unmatched],
  );

  const unplaceable = unplaceableSentence(unplaceableShare);
  const unplaceableWhy = React.useMemo(
    () => unplaceableReasons(unplaceableReasonCodes),
    [unplaceableReasonCodes],
  );

  const unresolved = unresolvedBookSentence(bookSet.unresolved);
  const troubles = bookTroubles(bookSet.unresolved);

  return (
    <WizardPanel
      title="What the material can supply"
      subheader="Which books this paper draws from, what each chapter has been asked for, and what there is to draw on"
    >
      {error ? (
        <RefusalNotice
          error={error}
          title="The material behind these chapters could not be checked"
          onRetry={onRetry}
        />
      ) : null}

      {isPending && rows.length === 0 ? <WidgetLoading rows={4} /> : null}

      {!isPending && !error && rows.length === 0 ? (
        <WidgetEmpty message="Tick some chapters and this panel says which books the paper draws from and what material stands behind each one." />
      ) : null}

      {rows.length > 0 ? (
        <>
          <BookSetNotice
            sentence={bookSet.sentence}
            unresolved={unresolved}
            troubles={troubles}
            books={bookSet.books}
          />

          {unmatched ? (
            <Alert severity="info" variant="outlined">
              <AlertTitle>Nothing has been matched to a book yet</AlertTitle>
              {MAPPING_NOT_BUILT}
            </Alert>
          ) : null}

          {understated.length > 0 ? (
            <Alert severity="info" variant="outlined">
              <AlertTitle>
                {understated.length === 1
                  ? `${understated[0]!.title} shows nothing, but its topics do`
                  : `${understated.length} chapters show nothing, but their topics do`}
              </AlertTitle>
              {UNDERSTATED_CHAPTER}
            </Alert>
          ) : null}

          {needingAttention.length > 0 ? (
            <Alert severity="warning" variant="outlined">
              <AlertTitle>
                {needingAttention.length === 1
                  ? 'One chapter has less material than it was asked for'
                  : `${needingAttention.length} chapters have less material than they were asked for`}
              </AlertTitle>
              {NEVER_A_BLOCK}
            </Alert>
          ) : null}

          {groups.map((group) => (
            <Box key={group.unitId ?? 'no-unit'}>
              {group.unitTitle ? (
                <SectionHeader
                  title={group.unitTitle}
                  subtitle="This unit's own book. Its chapters are counted against it and nothing else."
                />
              ) : null}
              <AvailabilityTable rows={group.rows} titleOf={titleOf} columns={columns} />
            </Box>
          ))}

          {unplaceable ? (
            <Alert severity="warning" variant="outlined">
              <AlertTitle>
                {unplaceableShare !== undefined && unplaceableShare >= 1
                  ? 'None of your weighting could be placed'
                  : 'Part of your weighting could not be placed'}
              </AlertTitle>
              <Stack spacing={1}>
                <Typography variant="body2">{unplaceable}</Typography>
                {unplaceableWhy.map((reason) => (
                  <Box key={reason.code}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {reason.label}
                      </Typography>
                      <EmergeChip label={WHOSE_LABEL[reason.whose]} tone="lilac" />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {reason.sentence}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Alert>
          ) : null}

          {unmatched ? null : (
            <Stack spacing={1.5}>
              {rows.map((row) => {
                const verdict = verdictOf(row);
                if (verdict === 'met' || verdict === 'unweighted') return null;
                return (
                  <Alert
                    key={row.node_id}
                    severity={verdict === 'not_measurable' ? 'info' : 'warning'}
                    variant="outlined"
                  >
                    <AlertTitle>{titleOf(row)}</AlertTitle>
                    {VERDICT_SENTENCE[verdict]}
                  </Alert>
                );
              })}
            </Stack>
          )}

          {unmatched || supplyCards.length === 0 ? null : (
            <Stack spacing={1.5}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Why a figure reads as nothing
              </Typography>
              {supplyCards.map((supply) => (
                <SupplyCard key={supply.code} supply={supply} />
              ))}
            </Stack>
          )}

          {reasonCards.length > 0 ? (
            <Stack spacing={1.5}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Why there is less to draw on than you might expect
              </Typography>
              {reasonCards.map((reason) => (
                <ReasonCard key={reason.key} reason={reason} />
              ))}
            </Stack>
          ) : null}

          <PanelNote>{SHARE_DENOMINATOR}</PanelNote>
          <PanelNote>{ATTRIBUTION_RULE}</PanelNote>
          <PanelNote>{NO_DOWNWARD_ROLL_UP}</PanelNote>
          <PanelNote>{NO_DOUBLE_COUNTING}</PanelNote>
          {groups.length > 1 ? <PanelNote>{UNITS_ARE_SEPARATE_BOOKS}</PanelNote> : null}
          <PanelNote>{NEVER_A_BLOCK}</PanelNote>
        </>
      ) : null}
    </WizardPanel>
  );
}

function BookSetNotice({
  sentence,
  unresolved,
  troubles,
  books,
}: {
  sentence: string;
  unresolved: string | null;
  troubles: readonly BookTrouble[];
  books: readonly ComposeBook[];
}): React.ReactElement {
  return (
    <Alert severity={unresolved ? 'warning' : 'info'} variant="outlined">
      <AlertTitle>The books behind this paper</AlertTitle>
      <Stack spacing={1}>
        <Typography variant="body2">{sentence}</Typography>
        {books.length > 0 ? (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {books.map((book) => (
              <EmergeChip
                key={bookKey(book)}
                label={
                  book.resolved
                    ? `${book.unit_title}: ${bookLabel(book)}`
                    : `${book.unit_title}: ${bookLabel(book)} — ${bookTroubleOf(book).label}`
                }
                tone={book.resolved ? 'indigo' : TROUBLE_TONE[bookTroubleOf(book).whose]}
              />
            ))}
          </Stack>
        ) : null}
        {unresolved ? <Typography variant="body2">{unresolved}</Typography> : null}
        {troubles.map((trouble) => (
          <Box key={trouble.code}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {trouble.label}
              </Typography>
              <EmergeChip label={WHOSE_LABEL[trouble.whose]} tone="lilac" />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {trouble.sentence}
            </Typography>
          </Box>
        ))}
        <Typography variant="caption" color="text.secondary">
          You never choose a book here. The books follow from the units your chapters sit
          in, which is how one paper takes questions from two of them.
        </Typography>
      </Stack>
    </Alert>
  );
}

const TROUBLE_TONE: Record<BookTrouble['whose'], ChipTone> = {
  teacher: 'amber',
  school: 'red',
  platform: 'blue',
  nobody: 'grey',
};

function SupplyCard({ supply }: { supply: SupplyState }): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      sx={{
        border: `1px solid ${theme.brand.line}`,
        borderRadius: `${theme.band.radius.sm}px`,
        p: 1.5,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {supply.label}
        </Typography>
        <EmergeChip label={WHOSE_LABEL[supply.whose]} tone="lilac" />
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {supply.sentence}
      </Typography>
    </Box>
  );
}

function ReasonCard({ reason }: { reason: ThinReason }): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      sx={{
        border: `1px solid ${theme.brand.line}`,
        borderRadius: `${theme.band.radius.sm}px`,
        p: 1.5,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {reason.label}
        </Typography>
        <EmergeChip label={`${reason.count} page ranges`} />
        <EmergeChip label={WHOSE_LABEL[reason.whose]} tone="lilac" />
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {reason.sentence}
      </Typography>
    </Box>
  );
}

function AvailabilityTable({
  rows,
  titleOf,
  columns,
}: {
  rows: readonly NodeAvailability[];
  titleOf: (row: NodeAvailability) => string;
  columns: readonly ThinReasonKey[];
}): React.ReactElement {
  const theme = useTheme();

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Chapter or topic</TableCell>
            <TableCell align="right">Asked for</TableCell>
            <TableCell align="right">Available</TableCell>
            <TableCell align="right">Page ranges</TableCell>
            {columns.map((key) => (
              <TableCell key={key} align="right">
                {REASON_HEADER[key]}
              </TableCell>
            ))}
            <TableCell>Reading</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const verdict = verdictOf(row);
            const counts = reasonCounts(row);
            const supply = supplyStateOf(row);
            const thin = verdict === 'under_target';
            return (
              <TableRow key={row.node_id}>
                <TableCell>
                  <Typography variant="body2">{titleOf(row)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.kind}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={NUMERIC}>
                  {formatShare(row.target_share)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...NUMERIC,
                    color: thin ? theme.hues.red : undefined,
                    fontWeight: thin ? 700 : undefined,
                  }}
                >
                  {verdict === 'not_measurable' ? 'not measured' : formatShare(row.available_share)}
                </TableCell>
                <TableCell align="right" sx={NUMERIC}>
                  {row.placements === 0 ? 'none yet' : row.placements}
                </TableCell>
                {columns.map((key) => (
                  <TableCell key={key} align="right" sx={NUMERIC}>
                    {counts[key] === 0 ? (
                      <Box component="span" sx={{ color: theme.brand.tert }}>
                        —
                      </Box>
                    ) : (
                      counts[key]
                    )}
                  </TableCell>
                ))}
                <TableCell>
                  <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                    <EmergeChip label={VERDICT_LABEL[verdict]} tone={VERDICT_TONE[verdict]} />
                    {verdict === 'not_measurable' ? (
                      <Typography variant="caption" color="text.secondary">
                        {supply.label}
                      </Typography>
                    ) : null}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const NUMERIC = { fontVariantNumeric: 'tabular-nums' } as const;
