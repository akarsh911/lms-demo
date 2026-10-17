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

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { Pager } from '@/components/ui/pager';
import { RecordList, type RecordColumn } from '@/components/ui/record-list';
import { Avatar } from '@/components/ui/row';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import {
  ROSTER_KINDS,
  ROSTER_KIND_NAMES,
  ROSTER_PAGE_SIZE,
  type RosterKind,
} from '@/constants/roster';
import { useRoster } from '@/hooks/query/use-roster';
import { useRosterParams } from '@/hooks/use-roster-params';
import { codeOf, nameOf, personOf, withheldOnPage } from '@/lib/core/roster';
import { paths } from '@/paths';
import type { RosterRow } from '@/types/roster';
import type { WidgetProps } from '@/types/widget';

import { WidgetEmpty, WidgetError, WidgetLoading } from '../widget-states';
import { RosterDetail } from './roster-detail';

/**
 * The roster: students, staff, teachers and guardians.
 *
 * Four lists behind one switch, because they answer the same envelope and
 * differ only in a noun and a secondary line. Kind, search, offset and the open
 * row all live in the URL (`hooks/use-roster-params.ts`), so a particular page
 * of a particular list is a link.
 *
 * ## Paging against a backend that reports no total
 *
 * `has_more` is `returned === limit`, derived rather than counted
 * (`pageOf` in `internal/transport/http/common.go`). Two consequences are built
 * into the controls below rather than worked around:
 *
 *   - there is no "page 3 of 9". The pager is Previous and Next, and the count
 *     line says which rows are on screen, never how many exist.
 *   - a final page that is exactly full reports `has_more: true`, so Next can
 *     land on an empty page. At a non-zero offset that is the END of the list,
 *     not a failure, and it says so with a way back rather than an error.
 *
 * ## `count` is not the number of rows on screen
 *
 * It is taken before per-row projection drops rows the caller may not see, so
 * the difference is the number withheld and is reported as such. A list showing
 * three of twelve with no explanation reads as a broken query.
 */
export function RosterWidget({ title, personaSlug, kinds = ROSTER_KIND_NAMES }: WidgetProps & { kinds?: readonly RosterKind[] }): React.ReactElement {
  const params = useRosterParams();
  const { q, offset, selectedId, setKind, setQuery, setOffset, select } = params;
  // A page that offers only some kinds opens on its first when the URL names another.
  const kind: RosterKind = kinds.includes(params.kind) ? params.kind : (kinds[0] ?? params.kind);
  const spec = ROSTER_KINDS[kind];

  const { data, isPending, isError, error, refetch, isPlaceholderData } =
    useRoster<RosterRow>(kind, q, offset);

  const rows = data?.rows ?? [];
  const withheld = data ? withheldOnPage(data.count, rows.length) : 0;
  const hasMore = data?.page.has_more ?? false;

  const columns: readonly RecordColumn<RosterRow>[] = [
    { key: 'name', label: spec.label, width: 'minmax(0, 1fr)', cell: (row) => <RosterName kind={kind} row={row} /> },
    {
      key: 'code',
      label: spec.codeLabel,
      width: 'minmax(120px, 220px)',
      cell: (row) => (
        <Typography variant="body2" color="text.secondary" noWrap>
          {codeOf(row, spec.codeFields) ?? 'Not set'}
        </Typography>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '96px',
      align: 'end',
      // The value the row carries, not one this application chose: no endpoint enumerates these.
      cell: (row) => (row.status ? <EmergeChip label={row.status} /> : null),
    },
  ];

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title={title}
        subheader="Everyone the school holds a record for"
        action={
          <Segmented
            ariaLabel="Which people to list"
            value={kind}
            onChange={(next) => setKind(next as RosterKind)}
            options={kinds.map((name) => ({ value: name, label: ROSTER_KINDS[name].label }))}
          />
        }
      />

      <CardContent>
        <Stack spacing={2}>
          <CardToolbar
            start={spec.searchable ? <SearchField label={`Search ${spec.label.toLowerCase()}`} value={q} onChange={setQuery} /> : undefined}
            // `/teachers` parses no `q`: a box there would appear to search and return everything.
            summary={spec.searchable ? undefined : 'Teachers cannot be searched by name. This list is filtered by specialisation, status and branch.'}
          />

          {isPending ? <WidgetLoading rows={5} /> : null}

          {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}

          {data && rows.length === 0 ? (
            offset > 0 ? (
              // Not an error: the previous page was exactly full, so `has_more` was true with nothing after it.
              <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                <WidgetEmpty message="That is the end of the list." />
                <Button size="small" variant="outlined" onClick={() => setOffset(offset - ROSTER_PAGE_SIZE)}>
                  Back a page
                </Button>
              </Stack>
            ) : (
              <WidgetEmpty message={withheld > 0 ? 'None of the records here are ones you may see.' : spec.notFound} />
            )
          ) : null}

          {rows.length > 0 ? (
            <RecordList
              ariaLabel={spec.label}
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              dimmed={isPlaceholderData}
              hrefOf={
                spec.detailSegment
                  ? (row) => paths.personaSection(personaSlug, `people/${spec.detailSegment}/${row.id}`)
                  : undefined
              }
              onSelect={spec.detailSegment ? undefined : (row) => select(row.id === selectedId ? null : row.id)}
              isSelected={(row) => row.id === selectedId}
            />
          ) : null}

          {withheld > 0 && rows.length > 0 ? (
            <Alert severity="info" variant="outlined">
              {withheld === 1
                ? 'One more record on this page is not one you may see.'
                : `${withheld} more records on this page are not ones you may see.`}
            </Alert>
          ) : null}

          {selectedId && !spec.detailSegment ? (
            <RosterDetail kind={kind} id={selectedId} onClose={() => select(null)} />
          ) : null}
        </Stack>
      </CardContent>

      {data ? (
        <CardActions>
          <Pager
            offset={offset}
            shown={rows.length}
            pageSize={ROSTER_PAGE_SIZE}
            hasMore={hasMore}
            busy={isPlaceholderData}
            onChange={setOffset}
          />
        </CardActions>
      ) : null}
    </Card>
  );
}

// A name is withheld, not blank: a field-restricted row arrives with ids and codes and no person attached.
function RosterName({ kind, row }: { kind: RosterKind; row: RosterRow }): React.ReactElement {
  const person = personOf(kind, row);
  const name =
    person.status === 'present'
      ? (nameOf(person.person) ?? 'Name not shown to you')
      : person.status === 'withheld'
        ? 'Name not shown to you'
        : 'No person record';

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Avatar name={person.status === 'present' ? name : '?'} />
      <Typography variant="subtitle1" component="span" noWrap>
        {name}
      </Typography>
    </Stack>
  );
}
