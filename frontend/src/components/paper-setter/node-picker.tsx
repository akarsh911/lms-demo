'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';

import { WizardPanel, PanelNote } from './panel';
import {
  SHAPE_FAULT_SENTENCE,
  duplicateTitles,
  flattenTree,
  type MalformedNode,
  type TreeNode,
} from './node-tree';
import { chapterSelections, selectionSummary, type SelectionSummary } from './selection';
import type { CurriculumTree } from './hooks';

const ID_TAIL = 6;

export const CHAPTER_TICK_MEANING =
  'Ticking a chapter asks for the chapter, and its topics come with it. Ticking some of ' +
  'a chapter’s topics asks for those topics, not the chapter. The label on each ' +
  'chapter says which of the two you have done.';

function shortId(nodeId: string): string {
  return nodeId.slice(-ID_TAIL);
}

interface ChapterPickView {
  pick: string;
  topicCount: number;
  pickedTopicIds: string[];
}

export function NodePicker({
  curriculum,
  selected,
  onToggle,
  onSetAll,
}: {
  curriculum: CurriculumTree;
  selected: readonly string[];
  onToggle: (nodeId: string) => void;
  onSetAll: (nodeIds: string[]) => void;
}): React.ReactElement {
  const { tree, malformed, hasUnits } = curriculum;

  const flat = React.useMemo(() => flattenTree(tree), [tree]);
  const repeated = React.useMemo(() => duplicateTitles(tree), [tree]);
  const chapters = React.useMemo(() => chapterSelections(tree, selected), [tree, selected]);
  const summary = React.useMemo(() => selectionSummary(tree, selected), [tree, selected]);
  const faultById = React.useMemo(
    () => new Map(malformed.map((node) => [node.id, node])),
    [malformed],
  );
  const pickByChapter = React.useMemo<ReadonlyMap<string, ChapterPickView>>(
    () => new Map(chapters.map((chapter) => [chapter.chapterId, chapter])),
    [chapters],
  );

  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = React.useCallback((nodeId: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const chosen = new Set(selected);
  const topicless = chapters.filter((chapter) => chapter.topicCount === 0).length;

  return (
    <WizardPanel
      title="Chapters and topics"
      subheader="A curriculum is chapters, and topics sit inside them. Tick whole chapters, or open a chapter and tick the topics you want from it."
      meta={flat.length > 0 ? <EmergeChip label={`${selected.length} selected`} /> : undefined}
    >
      {curriculum.isPending ? <WidgetLoading rows={5} /> : null}

      {curriculum.isError ? (
        <WidgetError error={curriculum.error} onRetry={curriculum.refetch} />
      ) : null}

      {curriculum.isEmpty ? (
        <WidgetEmpty message="This curriculum has no chapters in it yet, so there is nothing to narrow the paper to." />
      ) : null}

      {malformed.length > 0 ? <MalformedNotice malformed={malformed} /> : null}

      {flat.length > 0 ? (
        <>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              size="small"
              variant="text"
              onClick={() => onSetAll(chapters.map((chapter) => chapter.chapterId))}
              disabled={chapters.length === 0}
            >
              Every chapter
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => setExpanded(new Set(chapters.map((chapter) => chapter.chapterId)))}
              disabled={chapters.length === 0}
            >
              Open every chapter
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => onSetAll([])}
              disabled={selected.length === 0}
            >
              Clear the selection
            </Button>
          </Stack>

          {topicless > 0 ? (
            <Typography variant="caption" color="text.secondary">
              {topicless === chapters.length
                ? 'No chapter lists its topics yet, so each one is asked for whole.'
                : `${topicless} of ${chapters.length} chapters list no topics yet, so those are asked for whole.`}
            </Typography>
          ) : null}

          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {tree.map((node) => (
              <TopLevelBranch
                key={node.id}
                node={node}
                chosen={chosen}
                repeated={repeated}
                faultById={faultById}
                pickByChapter={pickByChapter}
                expanded={expanded}
                onToggle={onToggle}
                onToggleExpanded={toggleExpanded}
              />
            ))}
          </Box>

          <SelectionReadout
            summary={summary}
            selectedCount={selected.length}
            hasUnits={hasUnits}
          />

          <PanelNote>{CHAPTER_TICK_MEANING}</PanelNote>
          <PanelNote>
            Two topics in one chapter may share a name and a number, so nothing here is
            matched on a name. Where two rows read the same, the end of each one&rsquo;s id
            is shown beside it.
          </PanelNote>
        </>
      ) : null}
    </WizardPanel>
  );
}

function SelectionReadout({
  summary,
  selectedCount,
  hasUnits,
}: {
  summary: SelectionSummary;
  selectedCount: number;
  hasUnits: boolean;
}): React.ReactElement {
  if (selectedCount === 0) {
    return (
      <Alert severity="info" variant="outlined">
        Nothing is ticked, so the whole curriculum is in scope. That is a real request and
        it is probably not the one you meant.
      </Alert>
    );
  }

  const parts: string[] = [];
  if (summary.wholeChapters > 0) {
    parts.push(
      summary.wholeChapters === 1
        ? 'one whole chapter'
        : `${summary.wholeChapters} whole chapters`,
    );
  }
  if (summary.pickedTopics > 0) {
    parts.push(
      `${summary.pickedTopics === 1 ? 'one topic' : `${summary.pickedTopics} topics`} from ${
        summary.partialChapters === 1
          ? 'one other chapter'
          : `${summary.partialChapters} other chapters`
      }`,
    );
  }

  return (
    <Alert severity="success" variant="outlined">
      <AlertTitle>
        {parts.length > 0
          ? `This paper covers ${parts.join(', and ')}`
          : 'This paper covers what you have ticked'}
      </AlertTitle>
      {hasUnits && summary.units.length > 0 ? (
        <Typography variant="body2">
          Your selection spans{' '}
          {summary.units.length === 1
            ? `the ${summary.units[0]!.title} unit`
            : `the ${summary.units.map((unit) => unit.title).join(' and ')} units`}
          . A unit stands for a book, so this paper draws on{' '}
          {summary.units.length === 1 ? 'one book' : `${summary.units.length} books`}, which
          is ordinary rather than unusual.
        </Typography>
      ) : null}
    </Alert>
  );
}

function MalformedNotice({
  malformed,
}: {
  malformed: readonly MalformedNode[];
}): React.ReactElement {
  const faults = [...new Set(malformed.map((node) => node.fault))];

  return (
    <Alert severity="warning" variant="outlined">
      <AlertTitle>
        {malformed.length === 1
          ? 'One row in this curriculum is not shaped the way a curriculum should be'
          : `${malformed.length} rows in this curriculum are not shaped the way a curriculum should be`}
      </AlertTitle>
      <Stack spacing={1}>
        {faults.map((fault) => (
          <Box key={fault}>
            <Typography variant="body2">{SHAPE_FAULT_SENTENCE[fault]}</Typography>
            <Typography variant="caption" color="text.secondary">
              {malformed
                .filter((node) => node.fault === fault)
                .map((node) => node.title)
                .join(', ')}
            </Typography>
          </Box>
        ))}
        <Typography variant="body2">
          Every one of them is still listed below and can still be ticked. They are shown
          because a row quietly left out reads as a syllabus somebody shortened.
        </Typography>
      </Stack>
    </Alert>
  );
}

interface BranchProps {
  node: TreeNode;
  chosen: ReadonlySet<string>;
  repeated: ReadonlySet<string>;
  faultById: ReadonlyMap<string, MalformedNode>;
  pickByChapter: ReadonlyMap<string, ChapterPickView>;
  expanded: ReadonlySet<string>;
  onToggle: (nodeId: string) => void;
  onToggleExpanded: (nodeId: string) => void;
}

function TopLevelBranch(props: BranchProps): React.ReactElement {
  const theme = useTheme();
  const { node } = props;

  if (node.kind !== 'unit') return <ChapterBranch {...props} />;

  const open = props.expanded.has(node.id) || props.expanded.size === 0;

  return (
    <Box component="li" sx={{ borderTop: `1px solid ${theme.brand.line}`, pt: 1, mt: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <IconButton
          size="small"
          onClick={() => props.onToggleExpanded(node.id)}
          aria-expanded={open}
          aria-label={open ? `Hide ${node.title}` : `Show ${node.title}`}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>
          {node.title}
        </Typography>
        <EmergeChip label="unit · one book" tone="indigo" />
        {props.faultById.has(node.id) ? (
          <EmergeChip label="wrongly nested" tone="amber" />
        ) : null}
      </Stack>

      <Collapse in={open}>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {node.children.map((child) => (
            <ChapterBranch key={child.id} {...props} node={child} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function ChapterBranch(props: BranchProps): React.ReactElement {
  const theme = useTheme();
  const {
    node,
    chosen,
    repeated,
    faultById,
    pickByChapter,
    expanded,
    onToggle,
    onToggleExpanded,
  } = props;

  const isChapter = node.kind === 'chapter';
  const pick = pickByChapter.get(node.id);
  const ticked = chosen.has(node.id);
  const open = expanded.has(node.id);
  const topics = node.children;
  const fault = faultById.get(node.id);

  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        {topics.length > 0 ? (
          <IconButton
            size="small"
            onClick={() => onToggleExpanded(node.id)}
            aria-expanded={open}
            aria-label={
              open ? `Hide the topics in ${node.title}` : `Show the topics in ${node.title}`
            }
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </IconButton>
        ) : (
          <Box sx={{ width: 30 }} />
        )}

        <FormControlLabel
          sx={{ flex: 1, minWidth: 0, my: 0.25 }}
          control={
            <Checkbox
              size="small"
              checked={ticked}
              onChange={() => onToggle(node.id)}
              slotProps={{ input: { 'aria-label': `Include ${node.title}` } }}
            />
          }
          label={
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', minWidth: 0, flexWrap: 'wrap' }}
            >
              <Typography variant="body2" sx={{ fontWeight: isChapter ? 700 : 500 }}>
                {node.title}
              </Typography>
              {repeated.has(node.id) ? (
                <Typography variant="caption" color="text.secondary">
                  shares its name with a sibling · id ends {shortId(node.id)}
                </Typography>
              ) : null}
              {node.sequence === null ? null : (
                <Typography variant="caption" color="text.secondary">
                  no. {node.sequence}
                </Typography>
              )}
              {pick?.pick === 'whole' ? <EmergeChip label="whole chapter" tone="green" /> : null}
              {pick?.pick === 'partial' ? (
                <EmergeChip
                  label={`${pick.pickedTopicIds.length} of ${pick.topicCount} topics`}
                  tone="teal"
                />
              ) : null}
              {!isChapter && node.kind !== 'topic' ? <EmergeChip label={node.kind} /> : null}
              {fault ? <EmergeChip label="wrongly nested" tone="amber" /> : null}
            </Stack>
          }
        />
      </Stack>

      {topics.length > 0 ? (
        <Collapse in={open} unmountOnExit>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, pl: 4 }}>
            {topics.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                chapterTicked={ticked}
                chapterTitle={node.title}
                checked={chosen.has(topic.id)}
                repeated={repeated.has(topic.id)}
                fault={faultById.get(topic.id)}
                onToggle={onToggle}
              />
            ))}
          </Box>
        </Collapse>
      ) : null}

      <Box sx={{ borderBottom: `1px solid ${theme.brand.line}`, mt: 0.25 }} />
    </Box>
  );
}

function TopicRow({
  topic,
  chapterTicked,
  chapterTitle,
  checked,
  repeated,
  fault,
  onToggle,
}: {
  topic: TreeNode;
  chapterTicked: boolean;
  chapterTitle: string;
  checked: boolean;
  repeated: boolean;
  fault: MalformedNode | undefined;
  onToggle: (nodeId: string) => void;
}): React.ReactElement {
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <FormControlLabel
        sx={{ my: 0, minWidth: 0 }}
        control={
          <Checkbox
            size="small"
            checked={checked}
            disabled={chapterTicked}
            onChange={() => onToggle(topic.id)}
            slotProps={{ input: { 'aria-label': `Include ${topic.title}` } }}
          />
        }
        label={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2">{topic.title}</Typography>
            {repeated ? (
              <Typography variant="caption" color="text.secondary">
                shares its name with a sibling · id ends {shortId(topic.id)}
              </Typography>
            ) : null}
            {chapterTicked ? (
              <Typography variant="caption" color="text.secondary">
                comes with {chapterTitle}
              </Typography>
            ) : null}
            {fault ? <EmergeChip label="wrongly nested" tone="amber" /> : null}
          </Stack>
        }
      />
    </Box>
  );
}
