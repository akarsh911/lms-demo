'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { PageSourceDrawer } from '@/components/flashcards/source-drawer';
import { EmergeChip } from '@/components/ui';
import { WidgetEmpty, WidgetLoading } from '@/components/widgets/widget-states';
import { MINDMAP_LINK_PARAMS } from '@/constants/mindmap';
import { useMarkRead, useMastery } from '@/hooks/query/use-mastery';
import { useMindMap } from '@/hooks/query/use-mindmap';
import type { PageRange } from '@/lib/mindmap/atlas-layout';
import type { MapNode, MapSource } from '@/types/mindmap';

import { ConceptAtlas } from './concept-atlas';
import { MindmapError } from './mindmap-error';
import type { MindmapGrants } from './mindmap-grants';
import { RecallDrill } from './recall-drill';
import { TracePanel } from './trace-panel';

const MAP_TAB = 0;
const TRACE_TAB = 1;
const RECALL_TAB = 2;
const VIEWS = ['map', 'trace', 'recall'] as const;

export function ChapterWorkspace({
  itemId,
  sectionId,
  range,
  grants,
  onClearRange,
}: {
  itemId: string;
  sectionId: string;
  range: PageRange | null;
  grants: MindmapGrants;
  onClearRange: () => void;
}): React.ReactElement {
  const map = useMindMap(itemId, sectionId);
  const mastery = useMastery(itemId, sectionId, grants.mayReadMastery);
  const markRead = useMarkRead(itemId, sectionId);

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = Math.max(0, VIEWS.indexOf(params.get(MINDMAP_LINK_PARAMS.view) as (typeof VIEWS)[number]));
  const studyTopicId = tab === RECALL_TAB ? params.get(MINDMAP_LINK_PARAMS.topic) : null;

  const showView = (next: number, topicId: string | null = null): void => {
    const query = new URLSearchParams(params.toString());
    if (next === MAP_TAB) query.delete(MINDMAP_LINK_PARAMS.view);
    else query.set(MINDMAP_LINK_PARAMS.view, VIEWS[next]!);
    if (topicId) query.set(MINDMAP_LINK_PARAMS.topic, topicId);
    else query.delete(MINDMAP_LINK_PARAMS.topic);
    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };
  const [trace, setTrace] = React.useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [opened, setOpened] = React.useState<{ node: MapNode; source: MapSource } | null>(null);

  const tracked = mastery.data?.tracked === true;
  const recorded = tracked && grants.mayRecordMastery;
  const states = tracked ? (mastery.data?.states ?? null) : null;

  if (map.isPending) return <WidgetLoading rows={5} />;
  if (map.error) return <MindmapError error={map.error} onRetry={() => void map.refetch()} />;

  const { meta, nodes } = map.data;
  const studyNode = studyTopicId ? nodes.find((n) => n.id === studyTopicId && n.kind === 'topic') : undefined;
  const studyTopic = studyNode ? { id: studyNode.id, label: studyNode.label } : null;

  if (meta.topics === 0) {
    return (
      <WidgetEmpty
        message={`"${meta.section_display}" has no concepts of its own to map. Choose a chapter from the list above.`}
      />
    );
  }

  return (
    <>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        <Tabs value={tab} onChange={(_, next: number) => showView(next)} sx={{ minHeight: 40 }}>
          <Tab label="Map" sx={{ minHeight: 40 }} />
          <Tab label="Trace" sx={{ minHeight: 40 }} />
          <Tab label="Recall" sx={{ minHeight: 40 }} />
        </Tabs>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <EmergeChip tone="grey" label={`${meta.topics} topics`} />
          <EmergeChip tone="grey" label={`${meta.atoms} concepts`} />
          <EmergeChip tone="violet" label={`${meta.relations} links`} />
        </Stack>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: tab === MAP_TAB ? 'hidden' : 'auto' }}>
        {tab === MAP_TAB ? (
          <Stack spacing={1} sx={{ height: '100%' }}>
            {meta.truncated ? (
              <Alert severity="warning" variant="outlined">
                This chapter&apos;s graph was capped upstream, so the map shows part of
                it rather than all of it.
              </Alert>
            ) : null}
            {grants.mayReadMastery && mastery.isError ? (
              <Typography variant="caption" color="text.secondary">
                Your progress could not be loaded, so the map is drawn without it.
              </Typography>
            ) : null}

            <Box sx={{ flex: 1, minHeight: 320 }}>
              <ConceptAtlas
                map={map.data}
                mastery={states}
                range={range}
                onOpenConcept={recorded ? (nodeId) => markRead.mutate([nodeId]) : undefined}
                onClearRange={onClearRange}
                onStudyTopic={(topicId) => showView(RECALL_TAB, topicId)}
                onOpenSource={(node, source) => setOpened({ node, source })}
              />
            </Box>
          </Stack>
        ) : null}

        {tab === TRACE_TAB ? (
          <TracePanel
            itemId={itemId}
            sectionId={sectionId}
            nodes={nodes}
            edges={map.data.edges}
            from={trace.from}
            to={trace.to}
            onChange={setTrace}
          />
        ) : null}

        {tab === RECALL_TAB ? (
          <RecallDrill
            key={studyTopic?.id ?? 'chapter'}
            itemId={itemId}
            sectionId={sectionId}
            grammar={map.data.relation_grammar}
            topic={studyTopic}
            onWholeChapter={() => showView(RECALL_TAB)}
          />
        ) : null}
      </Box>

      <PageSourceDrawer
        source={
          opened
            ? {
                documentId: opened.node.citation?.document_id ?? null,
                documentTitle: opened.source.title,
                chapterTitle: meta.section_display,
                pageRange: opened.source.page ? [opened.source.page, opened.source.page] : null,
                excerpt: opened.source.quote,
                subheader: `Where "${opened.node.label}" comes from`,
                fallbackNote: 'Only the quoted line is available for this concept.',
                notice: opened.source.sample
                  ? 'This wording is a sample written for the demo, not the NCERT text.'
                  : undefined,
              }
            : null
        }
        onClose={() => setOpened(null)}
      />
    </>
  );
}
