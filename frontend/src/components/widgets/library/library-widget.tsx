'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { EmergeChip } from '@/components/ui/chip';
import { Pager } from '@/components/ui/pager';
import { RecordList, type RecordColumn } from '@/components/ui/record-list';
import { INDEX_STATUS_MEANING, LIBRARY_PAGE_SIZE, meaningOf } from '@/constants/library';
import { useLibraryItems } from '@/hooks/query/use-library';
import type { ContentItem } from '@/types/library';
import type { WidgetProps } from '@/types/widget';

import { WidgetEmpty, WidgetError, WidgetLoading } from '../widget-states';

/**
 * The catalogue: what the school holds.
 *
 * ## Indexing is off, and this says so once rather than per row
 *
 * Every item reports `index_status: "none"` today, because handing material to
 * the retrieval engine sits behind a flag that is off. The important thing is
 * that this changes NOTHING about whether the material exists or may be read —
 * it is listed, its metadata is complete, and only search is unavailable. A
 * red mark per row would read as a catalogue full of broken records.
 *
 * So: one note at the top when nothing on the page is indexed, and a per-row
 * chip only where a row differs from that. When indexing is switched on, the
 * note disappears on its own and the chips start meaning something.
 *
 * ## Nothing here opens a file
 *
 * An item points at an asset, and fetching one needs an object store the
 * deployment may not have — `POST /library/assets` answers 503 without one and
 * no link can be minted either. A download button that fails for a reason the
 * user cannot see is worse than none, so the asset is named and not offered.
 */
export function LibraryWidget({ title }: WidgetProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const rawOffset = Number.parseInt(params.get('items') ?? '', 10);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  const setOffset = (next: number): void => {
    const query = new URLSearchParams(params);
    if (next > 0) query.set('items', String(next));
    else query.delete('items');
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  const { data, isPending, isError, error, refetch, isPlaceholderData } =
    useLibraryItems(offset);

  const rows = data?.rows ?? [];
  // Only worth saying when it is true of the whole page. One indexed row makes
  // the per-row chips the better signal.
  const noneIndexed =
    rows.length > 0 && rows.every((row) => !row.index_status || row.index_status === 'none');

  const columns: readonly RecordColumn<ContentItem>[] = [
    {
      key: 'title',
      label: 'Title',
      width: 'minmax(0, 1fr)',
      cell: (item) => (
        <>
          <Typography variant="subtitle1" component="p" noWrap>
            {item.title ?? 'Untitled'}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {subtitleOf(item) ?? ' '}
          </Typography>
        </>
      ),
    },
    {
      key: 'kind',
      label: 'Kind',
      width: '120px',
      cell: (item) => (
        <Typography variant="eyebrow" component="span" color="text.secondary">
          {item.kind ?? 'item'}
        </Typography>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 'minmax(96px, auto)',
      align: 'end',
      cell: (item) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          {item.status ? <EmergeChip label={item.status} /> : null}
          {/* Only where this row differs from the banner, so a uniformly unindexed catalogue is not a wall of marks. */}
          {!noneIndexed && item.index_status ? (
            <EmergeChip label={meaningOf(INDEX_STATUS_MEANING, item.index_status)} />
          ) : null}
        </Stack>
      ),
    },
  ];

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title={title} subheader="Everything the school holds, listed flat" />

      <CardContent>
        <Stack spacing={2}>
          {noneIndexed ? (
            <Alert severity="info" variant="outlined">
              Nothing here has been indexed for search yet. The material itself is
              available; only searching inside it is switched off.
            </Alert>
          ) : null}

          {isPending ? <WidgetLoading rows={5} /> : null}
          {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}

          {data && rows.length === 0 ? (
            offset > 0 ? (
              <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                <WidgetEmpty message="That is the end of the catalogue." />
                <Button
                  size="small"
                  onClick={() => setOffset(Math.max(0, offset - LIBRARY_PAGE_SIZE))}
                >
                  Back a page
                </Button>
              </Stack>
            ) : (
              <WidgetEmpty message="Your school has not added anything to the library yet." />
            )
          ) : null}

          {rows.length > 0 ? (
            <RecordList
              ariaLabel="Library catalogue"
              columns={columns}
              rows={rows}
              rowKey={(item) => item.id}
              dimmed={isPlaceholderData}
            />
          ) : null}
        </Stack>
      </CardContent>

      {data ? (
        <CardActions>
          <Pager
            offset={offset}
            shown={rows.length}
            pageSize={LIBRARY_PAGE_SIZE}
            hasMore={data.page.has_more}
            busy={isPlaceholderData}
            onChange={setOffset}
          />
        </CardActions>
      ) : null}
    </Card>
  );
}

function subtitleOf(item: ContentItem): string | undefined {
  const parts: string[] = [];
  if (item.author) parts.push(item.author);
  if (item.publisher) parts.push(item.publisher);
  // Named, not offered: there is nothing this application can do with it yet.
  if (item.asset_id) parts.push('Has an attached file');
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
