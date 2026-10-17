'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ChevronDown } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import type { DraftPlan, LessonPlanStatus } from '@/types/lesson-planner';

import { PLAN_STATUS_META } from './block-kinds';
import { CARD_PAD, INNER_GAP } from './spacing';

export function PlanHeader({
  plan,
  title,
  onTitle,
  status,
  author,
  actions,
  children,
}: {
  plan: DraftPlan;
  title: string;
  onTitle: ((title: string) => void) | null;
  status?: LessonPlanStatus;
  author?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}): React.ReactElement {
  const [showObjectives, setShowObjectives] = React.useState(false);
  return (
    <Card>
      <CardHeader
        title={
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <span>{title.trim() || 'Untitled plan'}</span>
            {status ? <EmergeChip tone={PLAN_STATUS_META[status].tone} dot label={PLAN_STATUS_META[status].label} /> : null}
          </Stack>
        }
        subheader={`${plan.subject_name}, ${plan.section_label} · ${plan.chapter_title} · ${plan.periods.length} × ${plan.period_minutes} min${author ? ` · ${author}` : ''}`}
        action={actions}
      />
      <CardContent>
        <Stack spacing={CARD_PAD}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: INNER_GAP, alignItems: 'center' }}>
            {onTitle ? (
              <TextField size="small" label="Title" value={title} onChange={(event) => onTitle(event.target.value)} error={title.trim() === ''} sx={{ flex: '1 1 280px', maxWidth: 420 }} />
            ) : null}
            {plan.topic_titles.map((topic) => (
              <EmergeChip key={topic} tone="grey" label={topic} />
            ))}
            <Button
              size="small"
              onClick={() => setShowObjectives((open) => !open)}
              aria-expanded={showObjectives}
              endIcon={<ChevronDown size={14} style={{ transform: showObjectives ? 'rotate(180deg)' : 'none' }} />}
            >
              Objectives ({plan.objectives.length})
            </Button>
          </Stack>
          <Collapse in={showObjectives} unmountOnExit>
            <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.5 }}>
              {plan.objectives.map((objective) => (
                <Typography key={objective} component="li" variant="body2">
                  {objective}
                </Typography>
              ))}
            </Box>
          </Collapse>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}
