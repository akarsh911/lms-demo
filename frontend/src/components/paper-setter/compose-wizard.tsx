'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowLeft, ArrowRight, CircleHelp } from 'lucide-react';

import { useCheckingReach } from '@/components/answer-checker/use-checking-reach';
import { LearningScopeGate } from '@/components/learning-scope/learning-scope-gate';
import type { GradeHead } from '@/components/learning-scope/scope-model';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { useMdmSubjects } from '@/hooks/query/use-mdm';

import { bookSetOf, bookTroubles, unresolvedBookSentence } from './books';
import { ComposeAction } from './compose-action';
import { CurriculumPicker } from './curriculum-picker';
import { usingMockedPaperSetter } from './data/paper-setter-api';
import { defaultPresetId } from './default-pattern';
import {
  useComposePreview,
  useCurriculumTree,
  usePaperSetterSettings,
  usePaperSetterTemplates,
} from './hooks';
import { descendantIds, nodeIndex, unitsOf, type TreeNode } from './node-tree';
import { NodePicker } from './node-picker';
import { ExplainProvider, PanelNote } from './panel';
import { PaperBasics, KIND_LABEL } from './paper-basics';
import { PatternPicker } from './pattern-picker';
import { PreviewHeadline, PreviewPanel } from './preview-panel';
import { foreignWeightKeys, selectedUnitIds } from './selection';
import { StepNav, type WizardStep } from './step-nav';
import {
  EMPTY_CONFIG,
  PAPER_KINDS,
  composeReducer,
  paperShapeChosen,
  toComposeRequest,
  weightMap,
  type ComposeConfig,
  type PaperKind,
} from './state';
import { useComposePrefill, usePrefillAsk, type Prefill } from './use-prefill';
import { WeightPanel } from './weight-panel';

const PAPER_STEP = 0;
const CHAPTERS_STEP = 1;
const SET_STEP = 2;

export const FOREIGN_WEIGHT_KEY =
  'Part of this weighting names something that is not a chapter or topic in this ' +
  'curriculum, so the paper service will refuse it. Clear the weighting and set it again ' +
  'from the chapters step.';

export const HOW_THIS_WORKS =
  'A paper is set from your curriculum: pick the subject and who sits it, tick the chapters, ' +
  'then choose a pattern. The preview is free and runs on every change; only “Set the paper” ' +
  'writes anything, and it picks questions already written and approved for your school.';

const SAMPLE_DATA =
  'The paper service did not answer, so this preview and paper are made from sample questions. ' +
  'Nothing here was written to the paper service.';

export function ComposeWizard(): React.ReactElement {
  const reach = useCheckingReach();
  if (reach.status === 'pending') return <WidgetLoading rows={6} />;
  if (reach.status === 'learner') {
    return (
      <Card>
        <EmptyState title="The paper setter is for teachers" body="Papers your teachers set reach you through your class, and their marks through Grades." />
      </Card>
    );
  }
  return (
    <LearningScopeGate mode="grade-only" prompt="The paper is set from this class's curriculum and sat by its pupils." ungated={<PrefilledSteps grade={null} />}>
      {(scope) => <PrefilledSteps key={scope.grade.id} grade={scope.grade} />}
    </LearningScopeGate>
  );
}

function PrefilledSteps({ grade }: { grade: GradeHead | null }): React.ReactElement {
  const ask = usePrefillAsk();
  const prefill = useComposePrefill(ask, grade?.id ?? '');
  if (prefill.status === 'pending') return <WidgetLoading rows={6} />;
  return <ComposeSteps grade={grade} prefill={prefill.status === 'ready' ? prefill.prefill : null} />;
}

function initialConfig(grade: GradeHead | null, prefill: Prefill | null): ComposeConfig {
  const base: ComposeConfig = { ...EMPTY_CONFIG, classId: grade?.id ?? '', sectionId: prefill?.sectionId ?? '' };
  if (!prefill) return base;
  return composeReducer(base, {
    type: 'prefill',
    curriculumId: prefill.curriculumId,
    nodeIds: prefill.nodeIds,
    paperKind: prefill.paperKind,
    title: prefill.title,
    focus: prefill.focus,
  });
}

function chapterCount(nodeIds: readonly string[], nodesById: ReadonlyMap<string, TreeNode>): number {
  const chapters = new Set(
    nodeIds.map((nodeId) => {
      const node = nodesById.get(nodeId);
      return node?.kind === 'topic' && node.parentId ? node.parentId : nodeId;
    }),
  );
  return chapters.size;
}

function titleHint(subject: string, kind: PaperKind, className: string): string {
  return [subject, KIND_LABEL[kind].toLowerCase(), className ? `for ${className}` : ''].filter(Boolean).join(' ').replace(/^./, (first) => first.toUpperCase());
}

function ComposeSteps({ grade, prefill }: { grade: GradeHead | null; prefill: Prefill | null }): React.ReactElement {
  const [config, dispatch] = React.useReducer(composeReducer, initialConfig(grade, prefill));
  const [step, setStep] = React.useState(prefill?.complete ? SET_STEP : PAPER_STEP);
  const [subjectId, setSubjectId] = React.useState(prefill?.subjectId ?? '');
  const [pickedName, setPickedName] = React.useState('');
  const [explain, setExplain] = React.useState(false);
  const [patternByHand, setPatternByHand] = React.useState(false);
  const [paperSet, setPaperSet] = React.useState(false);
  const className = grade?.name ?? pickedName;

  const onGradeLevel = React.useCallback((gradeLevelId: string, name: string) => {
    setPickedName(name);
    dispatch({ type: 'class', classId: gradeLevelId, sectionId: '' });
    dispatch({ type: 'curriculum', curriculumId: '' });
  }, []);
  const onCurriculum = React.useCallback((next: string) => dispatch({ type: 'curriculum', curriculumId: next }), []);
  const onSection = React.useCallback((sectionId: string) => dispatch({ type: 'class', classId: config.classId, sectionId }), [config.classId]);

  const subjects = useMdmSubjects();
  const subjectName = (subjects.data?.rows ?? []).find((row) => row.id === subjectId)?.name ?? '';

  const settings = usePaperSetterSettings();
  const templates = usePaperSetterTemplates(config.pattern === 'template' || config.pattern === 'new');
  const curriculum = useCurriculumTree(config.curriculumId || null);
  const nodesById = React.useMemo(() => nodeIndex(curriculum.tree), [curriculum.tree]);

  const presets = React.useMemo(() => settings.data?.presets ?? [], [settings.data]);
  const kind = PAPER_KINDS.find((option) => option === config.paperKind) ?? PAPER_KINDS[0];
  const level = grade?.level ?? null;
  const suggested = React.useMemo(
    () => defaultPresetId(presets, kind, chapterCount(config.nodeIds, nodesById), subjectName, level),
    [presets, kind, config.nodeIds, nodesById, subjectName, level],
  );

  const shaped = React.useMemo<ComposeConfig>(
    () => (patternByHand || !suggested ? config : { ...config, pattern: 'preset', preset: suggested, templateId: '', mix: '' }),
    [config, patternByHand, suggested],
  );

  const previewRequest = React.useMemo(() => toComposeRequest(shaped, false), [shaped]);
  const hint = titleHint(subjectName, kind, className);
  const composeRequest = React.useMemo(() => toComposeRequest({ ...shaped, title: shaped.title.trim() || hint }), [shaped, hint]);
  const preview = useComposePreview(previewRequest);

  const books = preview.data?.books;
  const bookSet = React.useMemo(() => bookSetOf(books, curriculum.hasUnits), [books, curriculum.hasUnits]);
  const bookProblem = React.useMemo(() => {
    const sentence = unresolvedBookSentence(bookSet.unresolved);
    if (!sentence) return null;
    const why = bookTroubles(bookSet.unresolved)
      .map((trouble) => trouble.sentence)
      .join(' ');
    return why === '' ? sentence : `${sentence} ${why}`;
  }, [bookSet.unresolved]);

  const spannedUnits = React.useMemo(() => selectedUnitIds(curriculum.tree, config.nodeIds), [curriculum.tree, config.nodeIds]);
  const strayKeys = React.useMemo(() => foreignWeightKeys(curriculum.tree, weightMap(config) ?? {}), [curriculum.tree, config]);
  const weightingProblem = strayKeys.length > 0 ? FOREIGN_WEIGHT_KEY : null;

  const toggleNode = React.useCallback(
    (nodeId: string) => {
      const node = nodesById.get(nodeId);
      dispatch({ type: 'toggleNode', nodeId, descendantIds: node ? descendantIds(node) : [] });
    },
    [nodesById],
  );

  const byHand =
    <T,>(apply: (value: T) => void) =>
    (value: T): void => {
      setPatternByHand(true);
      apply(value);
    };

  const unlocked = config.curriculumId !== '';
  const patternsLoading = settings.isLoading || templates.isLoading;
  const sample = usingMockedPaperSetter() || Boolean(preview.data?.sample);

  const steps: WizardStep[] = [
    { id: 'paper', title: 'Paper', lead: 'The subject, a title, the kind of paper and who sits it.', done: unlocked },
    { id: 'chapters', title: 'Chapters', lead: 'Tick what the paper covers. Leave everything unticked to cover the whole curriculum.', done: config.nodeIds.length > 0, optional: true },
    { id: 'set', title: 'Pattern and set', lead: 'Check the pattern and the preview, then set the paper.', done: paperSet && paperShapeChosen(shaped) },
  ];

  const active = steps[step] ?? steps[0]!;

  return (
    <ExplainProvider explain={explain}>
      <Stack spacing={2.5}>
        <StepNav steps={steps} current={step} unlocked={unlocked} locked={paperSet} onJump={setStep} />

        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
          <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant="h3" component="h2">
                {active.title}
              </Typography>
              {sample ? (
                <Tooltip title={SAMPLE_DATA}>
                  <span>
                    <EmergeChip label="Sample data" tone="blue" />
                  </span>
                </Tooltip>
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {active.lead}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="text"
            startIcon={<CircleHelp size={16} />}
            aria-expanded={explain}
            aria-controls="paper-setter-how"
            onClick={() => setExplain((current) => !current)}
          >
            {explain ? 'Hide how this works' : 'How this works'}
          </Button>
        </Stack>

        {explain ? (
          <Box id="paper-setter-how">
            <PanelNote>{HOW_THIS_WORKS}</PanelNote>
          </Box>
        ) : null}

        {step === PAPER_STEP ? (
          <Stack spacing={2.5}>
            <CurriculumPicker
              subjectId={subjectId}
              gradeLevelId={config.classId}
              curriculumId={config.curriculumId}
              onSubject={(next) => {
                setSubjectId(next);
                dispatch({ type: 'curriculum', curriculumId: '' });
              }}
              onCurriculum={onCurriculum}
              {...(grade === null ? { onGradeLevel } : {})}
            />
            <PaperBasics
              title={config.title}
              titleHint={hint}
              paperKind={config.paperKind}
              classId={config.classId}
              sectionId={config.sectionId}
              onTitle={(title) => dispatch({ type: 'title', title })}
              onPaperKind={(paperKind) => dispatch({ type: 'paperKind', paperKind })}
              onSection={onSection}
            />
          </Stack>
        ) : null}

        {step === CHAPTERS_STEP ? (
          <Stack spacing={2.5}>
            <NodePicker
              curriculum={curriculum}
              selected={config.nodeIds}
              onToggle={toggleNode}
              onSetAll={(nodeIds) => dispatch({ type: 'setNodes', nodeIds })}
            />
            <WeightPanel
              config={config}
              tree={curriculum.tree}
              nodesById={nodesById}
              weightingProblem={weightingProblem}
              onToggle={(enabled) => dispatch({ type: 'weightsEnabled', enabled })}
              onWeight={(nodeId, share) => dispatch({ type: 'weight', nodeId, share })}
            />
          </Stack>
        ) : null}

        {step === SET_STEP ? (
          <Stack spacing={2.5}>
            {paperSet ? null : (
              <PatternPicker
                config={shaped}
                presets={presets}
                templates={templates.data ?? []}
                classLabel={className}
                isPending={patternsLoading}
                error={settings.error ?? templates.error}
                onRetry={() => void settings.refetch()}
                onKind={byHand((pattern) => dispatch({ type: 'pattern', kind: pattern }))}
                onPreset={byHand((preset) => dispatch({ type: 'preset', preset }))}
                onTemplate={byHand((templateId) => dispatch({ type: 'template', templateId }))}
                onMix={byHand((mix) => dispatch({ type: 'mix', mix }))}
              />
            )}
            {paperSet ? null : (
              <PreviewPanel
                preview={preview.data}
                isPending={preview.isPending}
                isFetching={preview.isFetching}
                error={preview.error}
                onRetry={() => void preview.refetch()}
                idle={previewRequest === null}
                tree={curriculum.tree}
                nodesById={nodesById}
                hasUnits={curriculum.hasUnits}
              />
            )}
            <ComposeAction
              request={composeRequest}
              title={shaped.title.trim() || hint}
              previewError={preview.error}
              bookProblem={bookProblem}
              weightingProblem={weightingProblem}
              onPaperSet={() => setPaperSet(true)}
            />
          </Stack>
        ) : null}

        {paperSet ? null : (
          <Card
            sx={(theme) => ({
              position: 'sticky',
              bottom: 16,
              zIndex: 2,
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 1, sm: 2 },
              flexWrap: 'wrap',
              backgroundColor: theme.palette.background.paper,
              boxShadow: theme.shadows[6],
            })}
          >
            <Button
              size="small"
              startIcon={<ArrowLeft size={14} />}
              disabled={step === PAPER_STEP}
              onClick={() => setStep((current) => Math.max(PAPER_STEP, current - 1))}
            >
              Back
            </Button>

            <Typography variant="caption" color="text.secondary">
              Step {step + 1} of {steps.length}
            </Typography>

            {!unlocked && step === PAPER_STEP ? (
              <Typography variant="caption" color="text.secondary">
                Choose a subject to go on.
              </Typography>
            ) : null}

            {unitsOf(curriculum.tree).length > 1 && spannedUnits.length > 1 ? (
              <Typography variant="caption" color="text.secondary">
                Spanning {spannedUnits.length} units
              </Typography>
            ) : null}

            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, minWidth: 0 }}>
              {step > PAPER_STEP ? (
                <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                  <PreviewHeadline preview={preview.data} />
                </Box>
              ) : null}
              {step < SET_STEP ? (
                <Button
                  variant="contained"
                  size="small"
                  endIcon={<ArrowRight size={14} />}
                  disabled={!unlocked}
                  onClick={() => setStep((current) => Math.min(SET_STEP, current + 1))}
                >
                  Next
                </Button>
              ) : null}
            </Box>
          </Card>
        )}
      </Stack>
    </ExplainProvider>
  );
}
