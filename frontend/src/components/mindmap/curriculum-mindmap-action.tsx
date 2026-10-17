'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Network } from 'lucide-react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';

import { SectionHeader } from '@/components/ui/layout';
import { WidgetEmpty } from '@/components/widgets/widget-states';
import { meaningOf } from '@/constants/library';
import {
  MATCH_BASIS_MEANING,
  MINDMAP_AVAILABLE,
  MINDMAP_STATE_MEANING,
} from '@/constants/mindmap';
import { useCurriculumMindmaps } from '@/hooks/query/use-mindmap';
import type { PageRange } from '@/lib/mindmap/atlas-layout';
import { mindmapQuery, pageRangeLabel } from '@/lib/mindmap/deep-link';
import type { CurriculumMindmap, CurriculumMindmapsResponse } from '@/types/mindmap';

import { MindmapError } from './mindmap-error';
import { useMindmapGrants } from './mindmap-grants';

const TOPIC_KIND = 'topic';
const WHOLE_ITEM_BASIS = 'whole_item';
const MAPPABLE_KINDS: ReadonlySet<string> = new Set(['chapter', TOPIC_KIND]);

export function isMindmapNodeKind(kind: string | undefined): boolean {
  return kind !== undefined && MAPPABLE_KINDS.has(kind);
}

interface MindmapChoice {
  key: string;
  label: string;
  detail: string | null;
  href: string;
}

function rangeOf(mindmap: CurriculumMindmap, kind: string): PageRange | null {
  if (kind !== TOPIC_KIND || typeof mindmap.page_start !== 'number') return null;
  const end = typeof mindmap.page_end === 'number' ? mindmap.page_end : mindmap.page_start;
  return { from: mindmap.page_start, to: end };
}

function detailOf(mindmap: CurriculumMindmap, range: PageRange | null): string | null {
  const parts: string[] = [];
  if (range) parts.push(pageRangeLabel(range));
  if (mindmap.inherited) parts.push('Mapped through its chapter');
  return parts.length > 0 ? parts.join(' · ') : null;
}

function choicesOf(data: CurriculumMindmapsResponse, base: string): MindmapChoice[] {
  return data.mindmaps
    .filter((mindmap) => mindmap.mindmap_state === MINDMAP_AVAILABLE)
    .flatMap((mindmap) => {
      const book = mindmap.title ?? 'Untitled book';
      const range = rangeOf(mindmap, data.kind);
      const detail = detailOf(mindmap, range);

      const best = mindmap.sections[0];

      if (mindmap.match_basis === WHOLE_ITEM_BASIS) {
        return [
          {
            key: mindmap.placement_id,
            label: book,
            detail: [meaningOf(MATCH_BASIS_MEANING, mindmap.match_basis), detail]
              .filter(Boolean)
              .join(' '),
            href: `${base}?${mindmapQuery({
              itemId: mindmap.content_item_id,
              sectionId: best?.section_id,
            })}`,
          },
        ];
      }

      if (!best) return [];

      return [
        {
          key: mindmap.placement_id,
          label: `${book} · ${best.display}`,
          detail,
          href: `${base}?${mindmapQuery({
            itemId: mindmap.content_item_id,
            sectionId: best.section_id,
            range,
          })}`,
        },
      ];
    });
}

function reasonOf(mindmap: CurriculumMindmap): string {
  const book = mindmap.title ?? 'Untitled book';
  const reason =
    mindmap.mindmap_state === MINDMAP_AVAILABLE
      ? meaningOf(MATCH_BASIS_MEANING, mindmap.match_basis)
      : meaningOf(MINDMAP_STATE_MEANING, mindmap.mindmap_state);
  return `${book}: ${reason}`;
}

export function CurriculumMindmapAction({
  nodeId,
  mindmapHref,
}: {
  nodeId: string;
  mindmapHref: string;
}): React.ReactElement | null {
  const router = useRouter();
  const grants = useMindmapGrants();
  const lookup = useCurriculumMindmaps(nodeId);

  if (!grants.settled || !grants.mayReadMaps) return null;

  const base = mindmapHref;
  const choices = lookup.data ? choicesOf(lookup.data, base) : [];

  const find = (): void => {
    void lookup.refetch().then((result) => {
      if (!result.data) return;
      const found = choicesOf(result.data, base);
      if (found.length === 1) router.push(found[0]!.href);
    });
  };

  return (
    <div>
      <SectionHeader title="Mind map" />
      <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Network size={16} />}
          disabled={lookup.isFetching}
          onClick={find}
        >
          {lookup.isFetching ? 'Finding the mind map…' : 'Mind map'}
        </Button>

        {lookup.isError && !lookup.isFetching ? (
          <MindmapError error={lookup.error} onRetry={find} />
        ) : null}

        {lookup.data && choices.length > 1 ? (
          <Typography variant="body2" color="text.secondary">
            More than one mind map covers this. Choose one to open.
          </Typography>
        ) : null}

        {choices.map((choice) => (
          <Stack key={choice.key} spacing={0.25} sx={{ alignItems: 'flex-start' }}>
            <Button component={NextLink} href={choice.href} size="small">
              {choice.label}
            </Button>
            {choice.detail ? (
              <Typography variant="caption" color="text.secondary">
                {choice.detail}
              </Typography>
            ) : null}
          </Stack>
        ))}

        {lookup.data && choices.length === 0 ? (
          lookup.data.mindmaps.length === 0 ? (
            <WidgetEmpty message="No book that you can read has a confirmed mapping here, so there is no mind map to open." />
          ) : (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                No mind map can be opened from here yet.
              </Typography>
              {lookup.data.mindmaps.map((mindmap) => (
                <Typography key={mindmap.placement_id} variant="body2" color="text.secondary">
                  {reasonOf(mindmap)}
                </Typography>
              ))}
            </Stack>
          )
        ) : null}
      </Stack>
    </div>
  );
}
