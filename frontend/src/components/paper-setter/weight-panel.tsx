'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { formatShare } from './availability';
import { WizardPanel, PanelNote } from './panel';
import type { TreeNode } from './node-tree';
import {
  countedWeightTotal,
  weightContainment,
  weightConflicts,
} from './selection';
import {
  normalisedWeights,
  omittedNodeIds,
  type ComposeConfig,
} from './state';

const SHARE_STEP = 5;
const SHARE_MAX = 100;

export const SOFT_TARGET_NOTE =
  'A weighting is a soft target. It joins the objective beside difficulty, the page ' +
  'budget and the spread of topics, and the solver gets as close to it as the material ' +
  'allows. Only the question type and the marks per question are satisfied exactly.';

export const NORMALISED_NOTE =
  'The shares are divided by their total, so 40/30/30 asks for exactly what 4/3/3 asks ' +
  'for. A total of 100 is a habit, not a requirement.';

export const OMISSION_NOTE =
  'A topic left at zero is unweighted, not excluded: nothing is asked of it, and its ' +
  'material still goes into the pool the paper draws from. To keep a topic out of the ' +
  'paper altogether, exclude it on the emphasis step.';

export const CONTAINMENT_NOTE =
  'A share on a chapter already covers the topics inside it, so the two are never added ' +
  'together. Weighting a chapter and one of its own topics would be asking for the same ' +
  'marks twice, which is why the topic’s own slider is held shut while its chapter ' +
  'carries a share.';

export function WeightPanel({
  config,
  tree,
  nodesById,
  weightingProblem,
  onToggle,
  onWeight,
}: {
  config: ComposeConfig;
  tree: readonly TreeNode[];
  nodesById: ReadonlyMap<string, TreeNode>;
  weightingProblem: string | null;
  onToggle: (enabled: boolean) => void;
  onWeight: (nodeId: string, share: number) => void;
}): React.ReactElement {
  const theme = useTheme();
  const live = config.weightsEnabled ? config.weights : {};
  const total = countedWeightTotal(tree, config.nodeIds, live);
  const normalised = normalisedWeights(config);
  const omitted = omittedNodeIds(config);
  const covered = weightContainment(tree, live);
  const conflicts = weightConflicts(tree, live);

  const titleOf = (nodeId: string): string => nodesById.get(nodeId)?.title ?? nodeId;

  return (
    <WizardPanel
      title="Weighting"
      subheader="How much of the paper each topic should account for"
    >
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={config.weightsEnabled}
            disabled={config.nodeIds.length === 0}
            onChange={(event) => onToggle(event.target.checked)}
          />
        }
        label="Ask for a share per topic"
      />

      {config.nodeIds.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No topics are ticked, so there is nothing to weight. Tick some topics first.
        </Typography>
      ) : null}

      {config.weightsEnabled && config.nodeIds.length > 0 ? (
        <>
          <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {config.nodeIds.map((nodeId) => {
              const share = config.weights[nodeId] ?? 0;
              const label = titleOf(nodeId);
              const holderId = covered.get(nodeId);
              const isCovered = holderId !== undefined;
              return (
                <Box component="li" key={nodeId} sx={{ minWidth: 0 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}
                  >
                    <Typography variant="body2" sx={{ minWidth: 0 }}>
                      {label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}
                    >
                      {isCovered ? null : share}
                      <Box component="span" sx={{ color: theme.brand.tert, fontWeight: 500 }}>
                        {isCovered
                          ? `covered by ${titleOf(holderId!)}`
                          : share > 0
                            ? ` → ${formatShare(normalised[nodeId] ?? 0)} of the paper`
                            : ' → unweighted'}
                      </Box>
                    </Typography>
                  </Stack>
                  <Slider
                    size="small"
                    value={isCovered ? 0 : share}
                    disabled={isCovered}
                    min={0}
                    max={SHARE_MAX}
                    step={SHARE_STEP}
                    onChange={(_event, next) =>
                      onWeight(nodeId, Array.isArray(next) ? (next[0] ?? 0) : next)
                    }
                    aria-label={`Share of the paper for ${label}`}
                    valueLabelDisplay="auto"
                  />
                </Box>
              );
            })}
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'baseline',
              justifyContent: 'space-between',
              borderTop: `1px solid ${theme.brand.line}`,
              pt: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Running total
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}
            >
              {total}
            </Typography>
          </Stack>

          {weightingProblem ? (
            <Alert severity="error" variant="outlined">
              <AlertTitle>Part of this weighting names something unknown</AlertTitle>
              {weightingProblem}
            </Alert>
          ) : null}

          {conflicts.length > 0 ? (
            <Alert severity="error" variant="outlined">
              <AlertTitle>Two shares are asking for the same marks</AlertTitle>
              <Stack spacing={1}>
                {conflicts.map((conflict) => (
                  <Typography variant="body2" key={conflict.containedId}>
                    {conflict.containedTitle} sits inside {conflict.holderTitle}, which already
                    carries a share. Only {conflict.holderTitle} is counted.
                  </Typography>
                ))}
              </Stack>
            </Alert>
          ) : null}

          {total === 0 ? (
            <Alert severity="warning" variant="outlined">
              Every topic is at zero, so no weighting is being asked for at all. The paper
              will be set with no per-topic target, which is the same as switching this off.
            </Alert>
          ) : null}

          {omitted.length > 0 ? (
            <Alert severity="info" variant="outlined">
              {omitted.length === 1
                ? 'One topic is unweighted: '
                : `${omitted.length} topics are unweighted: `}
              {omitted.map(titleOf).join(', ')}. {OMISSION_NOTE}
            </Alert>
          ) : null}

          <PanelNote>{NORMALISED_NOTE}</PanelNote>
          <PanelNote>{CONTAINMENT_NOTE}</PanelNote>
        </>
      ) : null}

      <PanelNote>{SOFT_TARGET_NOTE}</PanelNote>
    </WizardPanel>
  );
}
