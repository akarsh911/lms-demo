'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BookMarked, Check, Paperclip, Undo2, Upload } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { INDEX_STATUS_MEANING } from '@/constants/library';
import { statusTone } from '@/constants/classroom';
import {
  useApplyPlacements,
  useRemovePlacement,
  type PlacementDecision,
} from '@/hooks/mutation/use-library';
import { useFiledContent } from '@/hooks/query/use-classroom';
import { usePlacements } from '@/hooks/query/use-library';
import { useOffering } from '@/hooks/query/use-section';
import { postedLine } from '@/lib/classroom/labels';
import type {
  ContentItem,
  ContentPlacement,
  LibraryPage,
  PlacementStatus,
} from '@/types/library';

import { AssetOpenBlock } from './asset-open';
import type { ScopeState } from './scope-state';
import { MaterialDialog } from './material-dialog';
import {
  PlacementDialog,
  PlacementReport,
  decidePlan,
  mayChangePlacement,
  placementLine,
  placementsByItem,
  planAllowed,
  planRefusal,
  rejectedByItem,
  usePlacementRights,
  useSubjectCurriculum,
  type PlacementRights,
  type SubjectCurriculum,
} from './placement-picker';

const PLACEMENT_STATUS_LABEL: Record<string, string> = {
  proposed: 'awaiting confirmation',
  confirmed: 'confirmed',
  rejected: 'rejected',
};

const AWAITING_HINT =
  'Material is handed to search only once its place in the syllabus is ' +
  'confirmed, so a proposal on its own does not make this findable.';

interface PlacementSurface {
  curriculumId: string | undefined;
  labelOf: SubjectCurriculum['labelOf'];
  rights: PlacementRights;
  byItem: Map<string, ContentPlacement[]>;
  rejected: Map<string, ContentPlacement[]>;
  pending: boolean;
  unreadable: boolean;
  removingId: string | null;
  deciding: PlacementDecision | null;
  onPlace: (item: ContentItem) => void;
  onRemove: (placement: ContentPlacement) => void;
  onDecide: (placement: ContentPlacement, status: PlacementStatus) => void;
}

export function ContentTab({
  offeringId,
  subjectId,
  gradeLevelId,
  scopeState,
  subjectName,
  mayFile,
}: {
  offeringId: string;
  subjectId: string | undefined;
  gradeLevelId: string | undefined;
  scopeState: ScopeState;
  subjectName: string;
  mayFile: boolean;
}): React.ReactElement {
  const [adding, setAdding] = React.useState(false);
  const [placing, setPlacing] = React.useState<ContentItem | null>(null);

  const offering = useOffering(offeringId);
  const forThisClass = useFiledContent({ subject_offering_id: offeringId }, true);
  const forTheSubject = useFiledContent(
    { subject_id: subjectId, grade_level_id: gradeLevelId },
    Boolean(subjectId && gradeLevelId),
  );

  const syllabus = useSubjectCurriculum({
    subjectId,
    gradeLevelId,
    sessionId: offering.data?.academic_session_id,
  });
  const rights = usePlacementRights();
  const placements = usePlacements(syllabus.curriculum?.id ?? null, rights.mayRead);
  const remove = useRemovePlacement();
  const decide = useApplyPlacements();

  const byItem = React.useMemo(
    () => placementsByItem(placements.data?.rows),
    [placements.data],
  );
  const rejected = React.useMemo(
    () => rejectedByItem(placements.data?.rows),
    [placements.data],
  );

  const settle = (placement: ContentPlacement, status: PlacementStatus): void => {
    const plan = decidePlan(placement, status);
    if (!planAllowed(plan, rights)) return;
    decide.mutate(plan);
  };

  const surface: PlacementSurface = {
    curriculumId: syllabus.curriculum?.id,
    labelOf: syllabus.labelOf,
    rights,
    byItem,
    rejected,
    pending: Boolean(syllabus.curriculum) && rights.mayRead && placements.isPending,
    unreadable: !rights.mayRead || placements.isError,
    removingId: remove.isPending ? (remove.variables ?? null) : null,
    deciding: decide.isPending ? (decide.variables?.decides[0] ?? null) : null,
    onPlace: (item) => setPlacing(item),
    onRemove: (placement) => remove.mutate(placement.id),
    onDecide: settle,
  };

  return (
    <Stack spacing={3}>
      {remove.isError ? (
        <Alert severity="error" variant="outlined">
          {remove.error.status === 403
            ? `Your school does not let this account take material out of the syllabus. ${remove.error.message}`
            : remove.error.message}
        </Alert>
      ) : null}

      {decide.isError ? (
        <Alert severity="error" variant="outlined">
          {decide.error.status === 403
            ? `Your school does not let this account settle what has been placed in the syllabus. ${decide.error.message}`
            : decide.error.message}
        </Alert>
      ) : null}

      {decide.data ? (
        <PlacementReport result={decide.data} options={syllabus.options} />
      ) : null}

      {syllabus.curriculum && placements.isError ? (
        <Alert severity="info" variant="outlined">
          {placements.error.status === 403
            ? `Where this material sits in the syllabus is not something this account may read, so it is not shown. ${placements.error.message}`
            : 'Where this material sits in the syllabus could not be read, so it is not shown. The material itself is unaffected.'}
        </Alert>
      ) : null}

      <ContentGroup
        title="Filed against this class"
        query={forThisClass}
        surface={surface}
        empty="Nothing has been filed against this class in particular."
        action={
          mayFile ? (
            <Button
              variant="contained"
              size="small"
              startIcon={<Upload size={16} />}
              onClick={() => setAdding(true)}
            >
              Add material
            </Button>
          ) : undefined
        }
      />

      {subjectId && gradeLevelId ? (
        <ContentGroup
          title="Filed against the subject and grade"
          query={forTheSubject}
          surface={surface}
          empty="Nothing has been filed against this subject at this grade."
        />
      ) : (
        <Box>
          <SectionHeader title="Filed against the subject and grade" />
          {scopeState === 'pending' ? (
            <WidgetLoading rows={3} />
          ) : (
            <WidgetEmpty
              message={
                scopeState === 'failed'
                  ? 'The subject or the grade of this class could not be loaded, so material filed against them cannot be asked for.'
                  : 'The subject or the grade of this class is not one you may read, so material filed against them cannot be asked for.'
              }
            />
          )}
        </Box>
      )}

      {mayFile ? (
        <MaterialDialog
          open={adding}
          onClose={() => setAdding(false)}
          offeringId={offeringId}
          subjectId={subjectId}
          subjectName={subjectName}
          curriculumId={syllabus.curriculum?.id}
          options={syllabus.options}
          syllabusPending={syllabus.isPending}
          syllabusFailed={syllabus.isError}
          mayPlace={rights.mayPlace}
        />
      ) : null}

      {placing ? (
        <PlacementDialog
          open
          onClose={() => setPlacing(null)}
          itemId={placing.id}
          itemTitle={placing.title ?? 'this material'}
          curriculumId={syllabus.curriculum?.id}
          options={syllabus.options}
          loading={syllabus.isPending}
          failed={syllabus.isError}
          existing={byItem.get(placing.id) ?? []}
        />
      ) : null}
    </Stack>
  );
}

function ContentGroup({
  title,
  query,
  surface,
  empty,
  action,
}: {
  title: string;
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data: LibraryPage | undefined;
    refetch: () => void;
  };
  surface: PlacementSurface;
  empty: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <Box component="section" aria-label={title}>
      <SectionHeader title={title} actions={action} />
      {query.isPending ? <WidgetLoading rows={3} /> : null}
      {query.isError ? (
        <WidgetError error={query.error} onRetry={() => query.refetch()} />
      ) : null}
      {query.data && query.data.rows.length === 0 ? (
        <WidgetEmpty message={empty} />
      ) : null}
      {query.data && query.data.rows.length > 0 ? (
        <>
          <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {query.data.rows.map((item) => (
              <Box component="li" key={item.id}>
                <MaterialCard item={item} surface={surface} />
              </Box>
            ))}
          </Stack>
          {query.data.page.has_more ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              More material exists than is shown here.
            </Typography>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}

function MaterialCard({
  item,
  surface,
}: {
  item: ContentItem;
  surface: PlacementSurface;
}): React.ReactElement {
  const added = postedLine({ created_at: item.created_at });

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', flexWrap: 'wrap' }}
          >
            {item.kind ? <EmergeChip label={item.kind} tone="lilac" /> : null}
            {item.status && item.status !== 'published' ? (
              <EmergeChip label={item.status} tone={statusTone(item.status)} />
            ) : null}
            {item.asset_id ? (
              <EmergeChip
                label="File attached"
                tone="blue"
                icon={<Paperclip size={12} />}
              />
            ) : null}
          </Stack>

          <Typography variant="h4" component="h3">
            {item.title ?? 'Untitled'}
          </Typography>

          {item.description ? (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {item.description}
            </Typography>
          ) : null}

          <Typography variant="body2" color="text.secondary">
            {[added ? `Added ${added}` : null, itemLine(item)]
              .filter(Boolean)
              .join(' · ')}
          </Typography>

          <AssetOpenBlock assetId={item.asset_id} title={item.title ?? 'this file'} />

          <ItemPlacements item={item} surface={surface} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function ItemPlacements({
  item,
  surface,
}: {
  item: ContentItem;
  surface: PlacementSurface;
}): React.ReactElement | null {
  if (!surface.curriculumId || surface.unreadable) return null;

  if (surface.pending) {
    return (
      <Typography variant="body2" color="text.secondary">
        Reading where this sits in the syllabus…
      </Typography>
    );
  }

  const rows = surface.byItem.get(item.id) ?? [];
  const turned = surface.rejected.get(item.id) ?? [];
  const busy = surface.removingId !== null || surface.deciding !== null;

  if (rows.length === 0 && turned.length === 0) {
    if (!surface.rights.mayPlace) return null;
    return <PlaceButton item={item} surface={surface} busy={busy} />;
  }

  const awaiting = rows.some((row) => row.status === 'proposed');

  return (
    <Stack spacing={0.75}>
      {rows.map((placement) => (
        <PlacementRow
          key={placement.id}
          placement={placement}
          surface={surface}
          busy={busy}
        />
      ))}

      {awaiting ? (
        <Typography variant="body2" color="text.secondary">
          {surface.rights.mayDecide
            ? AWAITING_HINT
            : `${AWAITING_HINT} Someone with the right to settle it has to confirm it.`}
        </Typography>
      ) : null}

      {turned.map((placement) => (
        <RejectedRow
          key={placement.id}
          placement={placement}
          surface={surface}
          busy={busy}
        />
      ))}

      {rows.length > 0 && mayChangePlacement(surface.rights) ? (
        <Box>
          <Button
            size="small"
            startIcon={<BookMarked size={15} />}
            disabled={busy}
            onClick={() => surface.onPlace(item)}
          >
            {rows.length === 1 ? 'Change where this sits' : 'Change these'}
          </Button>
        </Box>
      ) : null}

      {rows.length === 0 && surface.rights.mayPlace ? (
        <PlaceButton item={item} surface={surface} busy={busy} />
      ) : null}
    </Stack>
  );
}

function PlaceButton({
  item,
  surface,
  busy,
}: {
  item: ContentItem;
  surface: PlacementSurface;
  busy: boolean;
}): React.ReactElement {
  return (
    <Box>
      <Button
        size="small"
        startIcon={<BookMarked size={15} />}
        disabled={busy}
        onClick={() => surface.onPlace(item)}
      >
        Place in the syllabus
      </Button>
    </Box>
  );
}

function PlacementRow({
  placement,
  surface,
  busy,
}: {
  placement: ContentPlacement;
  surface: PlacementSurface;
  busy: boolean;
}): React.ReactElement {
  const settlingTo =
    surface.deciding?.id === placement.id ? surface.deciding.status : null;
  const refusal = planRefusal(decidePlan(placement, 'confirmed'), surface.rights);

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <EmergeChip
        label={placementLine(placement, surface.labelOf)}
        tone="teal"
        icon={<BookMarked size={12} />}
      />
      {placement.status && placement.status !== 'confirmed' ? (
        <EmergeChip
          label={PLACEMENT_STATUS_LABEL[placement.status] ?? placement.status}
          tone="grey"
        />
      ) : null}

      {placement.status === 'proposed' && refusal === null ? (
        <>
          <Button
            size="small"
            variant="contained"
            startIcon={<Check size={15} />}
            disabled={busy}
            onClick={() => surface.onDecide(placement, 'confirmed')}
          >
            {settlingTo === 'confirmed' ? 'Confirming' : 'Confirm'}
          </Button>
          <Button
            size="small"
            disabled={busy}
            onClick={() => surface.onDecide(placement, 'rejected')}
          >
            {settlingTo === 'rejected' ? 'Rejecting' : 'Reject'}
          </Button>
        </>
      ) : null}

      {surface.rights.mayUnplace ? (
        <Button
          size="small"
          color="error"
          disabled={busy}
          onClick={() => surface.onRemove(placement)}
        >
          {surface.removingId === placement.id ? 'Removing' : 'Remove'}
        </Button>
      ) : null}
    </Stack>
  );
}

function RejectedRow({
  placement,
  surface,
  busy,
}: {
  placement: ContentPlacement;
  surface: PlacementSurface;
  busy: boolean;
}): React.ReactElement {
  const reopening = surface.deciding?.id === placement.id;
  const refusal = planRefusal(decidePlan(placement, 'proposed'), surface.rights);

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <EmergeChip
        label={placementLine(placement, surface.labelOf)}
        tone="grey"
        icon={<BookMarked size={12} />}
      />
      <EmergeChip label={PLACEMENT_STATUS_LABEL.rejected} tone="grey" />
      {refusal === null ? (
        <Button
          size="small"
          startIcon={<Undo2 size={15} />}
          disabled={busy}
          onClick={() => surface.onDecide(placement, 'proposed')}
        >
          {reopening ? 'Putting it back' : 'Put it back'}
        </Button>
      ) : null}
    </Stack>
  );
}

function itemLine(item: ContentItem): string | undefined {
  const parts: string[] = [];
  if (item.author) parts.push(item.author);
  if (item.language) parts.push(item.language);
  const hint = item.index_status ? INDEX_STATUS_MEANING[item.index_status] : undefined;
  if (hint) parts.push(hint);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
