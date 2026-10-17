'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  CurriculumMindmapAction,
  isMindmapNodeKind,
} from '@/components/mindmap/curriculum-mindmap-action';
import { buildNodeTree, flattenTree } from '@/components/paper-setter/node-tree';
import { EmergeChip } from '@/components/ui/chip';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/layout';
import {
  RESOLUTION_MEANING,
  RETRIEVAL_STATE_MEANING,
  meaningOf,
} from '@/constants/library';
import { MINDMAP_ROUTE_KEY } from '@/constants/mindmap';
import {
  useCurricula,
  useCurriculumNodes,
  useNodeContent,
} from '@/hooks/query/use-library';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { CurriculumNode, NodeContent } from '@/types/library';
import type { WidgetProps } from '@/types/widget';

import { WidgetEmpty, WidgetError, WidgetLoading } from '../widget-states';

/**
 * The curriculum, and what material is mapped to each topic.
 *
 * Three steps, each a real request: choose a curriculum, choose a topic in it,
 * read what is mapped there.
 *
 * ## The answer is six-valued, and "unindexed" is the usual one
 *
 * `resolveCurriculumNodeContent` reports exactly one `resolution`, and the
 * precedence is deliberate: `unmapped` first, then `restricted`, then
 * `resolved`, then `unindexed`. Today almost every mapped topic answers
 * **`unindexed`**, because handing material to the retrieval engine sits behind
 * a flag that is off.
 *
 * That is the case most likely to be mis-drawn. `unindexed` means the material
 * IS mapped and IS readable and simply cannot be searched inside — so the
 * placements are still listed, and the note above them describes a missing step
 * rather than missing content. Treating it as an empty result would hide every
 * mapping in the school.
 *
 * `restricted` is the one that genuinely withholds: placements exist and none
 * of their content items are this caller to read. It is reported as that, not
 * as "nothing here", because the difference is what a teacher would ask about.
 */
export function CurriculumWidget({
  title,
  personaSlug,
  reachableLinks,
}: WidgetProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const curriculumId = params.get('curriculum');
  const nodeId = params.get('node');

  const put = (changes: Record<string, string | null>): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const curricula = useCurricula();
  const nodes = useCurriculumNodes(curriculumId);
  const content = useNodeContent(nodeId);

  const available = curricula.data?.rows ?? [];
  // A stale link naming a curriculum that is gone would leave the Select with a
  // value it cannot show. Fall back to the placeholder rather than to the first.
  const selected =
    curriculumId && available.some((c) => c.id === curriculumId) ? curriculumId : '';
  const selectedNode = nodes.data?.rows.find((node) => node.id === nodeId);
  const mindmapRoute = ROUTE_INDEX.get(MINDMAP_ROUTE_KEY);
  const mindmapHref =
    mindmapRoute && reachableLinks?.includes(mindmapRoute.node.feature)
      ? paths.personaSection(personaSlug, mindmapRoute.path)
      : null;
  const depths = React.useMemo(
    () =>
      new Map(
        flattenTree(buildNodeTree(nodes.data?.rows ?? [])).map((node) => [node.id, node.depth]),
      ),
    [nodes.data],
  );
  const outline = React.useMemo(() => {
    const order = [...depths.keys()];
    return [...(nodes.data?.rows ?? [])].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [depths, nodes.data]);

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title={title} slotProps={{ title: { variant: 'h4' } }} />

      <CardContent>
        <Stack spacing={2}>
          {curricula.isPending ? <WidgetLoading rows={2} /> : null}
          {curricula.isError ? (
            <WidgetError error={curricula.error} onRetry={() => void curricula.refetch()} />
          ) : null}

          {curricula.data && available.length === 0 ? (
            <WidgetEmpty message="No curriculum has been set up for your school yet." />
          ) : null}

          {available.length > 0 ? (
            <TextField
              select
              label="Curriculum"
              value={selected}
              onChange={(e) => put({ curriculum: e.target.value, node: null })}
              size="small"
              sx={{ maxWidth: 380 }}
            >
              {available.map((curriculum) => (
                <MenuItem key={curriculum.id} value={curriculum.id}>
                  {curriculum.name ?? curriculum.code ?? curriculum.id}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          {selected ? (
            <div>
              <SectionHeader title="Topics" />
              {nodes.isPending ? <WidgetLoading rows={4} /> : null}
              {nodes.isError ? (
                <WidgetError error={nodes.error} onRetry={() => void nodes.refetch()} />
              ) : null}
              {nodes.data && nodes.data.rows.length === 0 ? (
                <WidgetEmpty message="This curriculum has no topics yet." />
              ) : null}
              {nodes.data && nodes.data.rows.length > 0 ? (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {outline.map((node) => (
                    <Box component="li" key={node.id} sx={{ pl: (depths.get(node.id) ?? 0) * 3 }}>
                      <Row
                        onClick={() => put({ node: node.id === nodeId ? null : node.id })}
                        title={node.title ?? 'Untitled topic'}
                        subtitle={nodeLine(node)}
                        trailing={node.status ? <EmergeChip label={node.status} /> : undefined}
                      />
                    </Box>
                  ))}
                </Box>
              ) : null}
            </div>
          ) : null}

          {nodeId ? (
            <div>
              <SectionHeader title="Material mapped to this topic" />
              {content.isPending ? <WidgetLoading rows={3} /> : null}
              {content.isError ? (
                content.error.isForbidden ? (
                  // The handler needs BOTH `content_placements.read` and
                  // `library.read`, and refuses outright if the caller field
                  // policy denies a column the resolution needs. Its message
                  // names which, and it is more use than a generic denial.
                  <Alert severity="info" variant="outlined">
                    {content.error.message}
                  </Alert>
                ) : (
                  <WidgetError error={content.error} onRetry={() => void content.refetch()} />
                )
              ) : null}
              {content.data ? <NodeResolution content={content.data} /> : null}
            </div>
          ) : null}

          {mindmapHref && selectedNode && isMindmapNodeKind(selectedNode.kind) ? (
            <CurriculumMindmapAction
              key={selectedNode.id}
              nodeId={selectedNode.id}
              mindmapHref={mindmapHref}
            />
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * The resolution, then the placements.
 *
 * The sentence comes first and is always drawn, including for `resolved`:
 * every one of the six states tells a teacher something different about what to
 * do next, and only `unmapped` means there is nothing below it.
 */
function NodeResolution({ content }: { content: NodeContent }): React.ReactElement {
  const { counts } = content;

  return (
    <Stack spacing={1.5}>
      <Alert
        severity={content.resolution === 'resolved' ? 'success' : 'info'}
        variant="outlined"
      >
        {meaningOf(RESOLUTION_MEANING, content.resolution)}
      </Alert>

      {counts.unreadable > 0 ? (
        <Typography variant="body2" color="text.secondary">
          {counts.unreadable === 1
            ? 'One more placement here points at material you may not read.'
            : `${counts.unreadable} more placements here point at material you may not read.`}
        </Typography>
      ) : null}

      {content.content.length === 0 ? (
        <WidgetEmpty message="Nothing is listed for this topic." />
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {content.content.map((placement) => (
            <Box component="li" key={placement.placement_id}>
              <Row
                title={placement.content_item_id}
                subtitle={placementLine(placement.grain, placement.page_start, placement.page_end)}
                trailing={
                  <EmergeChip
                    label={meaningOf(RETRIEVAL_STATE_MEANING, placement.retrieval_state)}
                  />
                }
              />
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}

function nodeLine(node: CurriculumNode): string | undefined {
  const parts: string[] = [];
  if (node.kind) parts.push(node.kind);
  if (typeof node.sequence === 'number') parts.push(`Position ${node.sequence}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function placementLine(
  grain: string,
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  const parts = [grain];
  if (typeof start === 'number') {
    parts.push(typeof end === 'number' ? `pages ${start}–${end}` : `from page ${start}`);
  }
  return parts.join(' · ');
}
