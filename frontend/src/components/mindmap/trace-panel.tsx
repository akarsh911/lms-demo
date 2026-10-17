'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { WidgetLoading } from '@/components/widgets/widget-states';
import { useMindMapTrace } from '@/hooks/query/use-mindmap';
import type { MapEdge, MapNode, TraceStep } from '@/types/mindmap';

import { CitationNote } from './citation-note';
import { MindmapError } from './mindmap-error';

/**
 * "How does X relate to Y", answered by the book.
 *
 * This is the feature the mind-map engine exists to prove. Every other study
 * tool answers it by generating prose that may or may not be true of the book in
 * front of the student. Here the answer is a walk over typed edges, quoting the
 * sentence that evidences each hop, page by page. Nothing on this screen is
 * authored.
 *
 * **`found: false` is rendered as the answer, not as a failure.** The book
 * states no link between most pairs, because 55% of atoms carry no typed
 * relation at all. Manufacturing a bridge to fill the gap is exactly what the
 * engine refuses to do, and so does this.
 */
export function TracePanel({
  itemId,
  sectionId,
  nodes,
  edges,
  from,
  to,
  onChange,
}: {
  itemId: string;
  sectionId: string;
  nodes: MapNode[];
  edges: MapEdge[];
  from: string | null;
  to: string | null;
  onChange: (next: { from: string | null; to: string | null }) => void;
}): React.ReactElement {
  // Only atoms carry typed relations, so only atoms can be traced between.
  const options = React.useMemo(() => conceptOptions(nodes), [nodes]);
  const byId = React.useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);

  const { data, error, isPending, isFetching, refetch } = useMindMapTrace(
    itemId,
    sectionId,
    from,
    to,
  );
  const asking = Boolean(from && to && from !== to);
  const example = React.useMemo(() => examplePair(edges, byId), [edges, byId]);

  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <ConceptPicker
          label="From"
          options={options}
          value={from ? (byId.get(from) ?? null) : null}
          onChange={(id) => onChange({ from: id, to })}
        />
        <ConceptPicker
          label="To"
          options={options}
          value={to ? (byId.get(to) ?? null) : null}
          onChange={(id) => onChange({ from, to: id })}
        />
      </Stack>

      {!asking ? (
        <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Typography variant="body2" color="text.secondary">
            Pick two concepts. The answer is built from the chapter&apos;s own sentences, so
            every step shows the line it came from and its page.
          </Typography>
          {example ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => onChange({ from: example.from.id, to: example.to.id })}
              sx={{ textTransform: 'none' }}
            >
              Try an example: {example.from.label} → {example.to.label}
            </Button>
          ) : null}
        </Stack>
      ) : isPending || isFetching ? (
        <WidgetLoading rows={3} />
      ) : error ? (
        <MindmapError error={error} onRetry={() => void refetch()} />
      ) : data && !data.found ? (
        <Alert severity="info" variant="outlined">
          {data.note ? (
            <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>
              {data.note}
            </Typography>
          ) : null}
          This chapter states no connection between these two. That is a real answer
          about the book rather than a gap in the map: most concepts are never related
          to each other in the text.
        </Alert>
      ) : data ? (
        <Stack spacing={2}>
          <Typography variant="caption" color="text.secondary">
            {data.steps.length} step{data.steps.length === 1 ? '' : 's'}, every one quoted from
            the chapter
          </Typography>
          {data.steps.map((step, i) => (
            <Box
              key={`${step.from_id}-${step.to_id}-${i}`}
              sx={{ borderLeft: 3, borderColor: 'primary.main', pl: 1.5 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {stepLine(step, edges)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                “{step.sentence}”
              </Typography>
              <CitationNote citation={step.citation} quoted />
            </Box>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

interface ConceptOption {
  id: string;
  label: string;
  topic: string;
  linked: boolean;
}

function conceptOptions(nodes: MapNode[]): ConceptOption[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const topicOf = (n: MapNode): MapNode | undefined => {
    let current: MapNode | undefined = n;
    while (current && current.kind !== 'topic') current = byId.get((current.parent_id ?? '').replace(/^clu_/, ''));
    return current;
  };
  const topicOrder = (n: MapNode): number => topicOf(n)?.order ?? 0;
  return nodes
    .filter((n) => n.kind === 'atom')
    .sort((a, b) => topicOrder(a) - topicOrder(b) || a.order - b.order)
    .map((n) => ({ id: n.id, label: n.label, topic: topicOf(n)?.label ?? '', linked: n.relation_count > 0 }));
}

function ConceptPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ConceptOption[];
  value: ConceptOption | null;
  onChange: (id: string | null) => void;
}): React.ReactElement {
  return (
    <Autocomplete
      fullWidth
      size="small"
      options={options}
      value={value}
      onChange={(_, option) => onChange(option?.id ?? null)}
      groupBy={(option) => option.topic}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, chosen) => option.id === chosen.id}
      renderOption={({ key, ...props }, option) => (
        <li key={key} {...props}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', width: 1, gap: 1 }}>
            <Typography variant="body2">{option.label}</Typography>
            {option.linked ? null : (
              <Typography variant="caption" color="text.secondary">
                no stated links
              </Typography>
            )}
          </Stack>
        </li>
      )}
      renderInput={(params) => <TextField {...params} label={label} placeholder="Search a concept" />}
    />
  );
}

function walkedBackwards(step: TraceStep, edges: MapEdge[]): boolean {
  const stated = (source: string, target: string): boolean =>
    edges.some(
      (e) => e.kind === 'relation' && e.source === source && e.target === target && (e.relation_type ?? '') === step.relation_type,
    );
  return !stated(step.from_id, step.to_id) && stated(step.to_id, step.from_id);
}

function stepLine(step: TraceStep, edges: MapEdge[]): string {
  const verb = step.verb || step.relation_type;
  return walkedBackwards(step, edges)
    ? `${step.to_label} ${verb} ${step.from_label}`
    : `${step.from_label} ${verb} ${step.to_label}`;
}

function examplePair(
  edges: MapEdge[],
  byId: ReadonlyMap<string, ConceptOption>,
): { from: ConceptOption; to: ConceptOption } | null {
  const stated = edges.filter((e) => e.kind === 'relation' && byId.has(e.source) && byId.has(e.target));
  for (const first of stated) {
    const next = stated.find((e) => e.source === first.target && e.target !== first.source);
    if (next) return { from: byId.get(first.source)!, to: byId.get(next.target)! };
  }
  const only = stated[0];
  return only ? { from: byId.get(only.source)!, to: byId.get(only.target)! } : null;
}
