'use client';

import * as React from 'react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Minus, Plus, SlidersHorizontal, Undo2 } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { ProgressBar } from '@/components/ui/progress';
import type { ExamPace, Verdict } from '@/lib/lesson-planner/feasibility';
import type { Fix } from '@/lib/lesson-planner/fixes';
import type { ResolvedExam, TermPlanView } from '@/lib/lesson-planner/term';

import { CARD_PAD, INNER_GAP } from './spacing';
import { VERDICT_META, examShortName } from './term-palette';

export interface ExamActions {
  onMove: (examId: string, start: string | null) => void;
  onRevision: (examId: string, periods: number) => void;
  onExtra: (examId: string, periods: number) => void;
  onUndefer: (examId: string, chapterId: string) => void;
  onFix: (fix: Fix) => void;
}

const MAX_STEP = 20;

function verdictChip(verdict: Verdict): string {
  switch (verdict.status) {
    case 'over':
      return `Over by ${verdict.by}`;
    case 'tight':
      return 'Tight';
    case 'on_track':
      return 'On track';
    case 'done':
      return 'Held';
    default: {
      const unknown: never = verdict;
      return unknown;
    }
  }
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }): React.ReactElement {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }} role="group" aria-label={label}>
      <Typography variant="body2">{label}</Typography>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <IconButton size="small" aria-label={`${label}: fewer`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
          <Minus size={14} />
        </IconButton>
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
          {value}
        </Typography>
        <IconButton size="small" aria-label={`${label}: more`} disabled={value >= MAX_STEP} onClick={() => onChange(value + 1)}>
          <Plus size={14} />
        </IconButton>
      </Stack>
    </Stack>
  );
}

function ExamSettings({ exam, fixes, titleOf, actions }: { exam: ResolvedExam; fixes: readonly Fix[]; titleOf: (id: string) => string; actions: ExamActions }): React.ReactElement {
  return (
    <Stack spacing={CARD_PAD} sx={{ p: CARD_PAD, width: 320, maxWidth: '100vw' }}>
      <Stack direction="row" spacing={INNER_GAP} sx={{ alignItems: 'center' }}>
        <TextField
          type="date"
          size="small"
          label="Starts"
          value={exam.start}
          onChange={(event) => event.target.value && actions.onMove(exam.id, event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: 1 }}
        />
        {exam.moved ? (
          <Tooltip title="Undo move">
            <IconButton aria-label="Undo move" onClick={() => actions.onMove(exam.id, null)}>
              <Undo2 size={16} />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
      <Stack spacing={0.5}>
        <Stepper label="Revision" value={exam.revision} onChange={(n) => actions.onRevision(exam.id, n)} />
        <Stepper label="Extra periods" value={exam.extra} onChange={(n) => actions.onExtra(exam.id, n)} />
      </Stack>
      {exam.deferred.length > 0 ? (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: INNER_GAP }}>
          {exam.deferred.map((id) => (
            <Button key={id} size="small" variant="outlined" startIcon={<Undo2 size={14} />} onClick={() => actions.onUndefer(exam.id, id)}>
              {titleOf(id)}
            </Button>
          ))}
        </Stack>
      ) : null}
      {fixes.length > 0 ? (
        <Stack spacing={INNER_GAP}>
          <Typography variant="subtitle2">Fixes</Typography>
          {fixes.map((fix) => (
            <Button key={fix.id} size="small" variant="outlined" onClick={() => actions.onFix(fix)} sx={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }}>
              {fix.label}
            </Button>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function DateTile({ iso }: { iso: string }): React.ReactElement {
  return (
    <Box sx={{ width: 44, textAlign: 'center', flex: 'none' }}>
      <Typography variant="h4" component="p" sx={{ lineHeight: 1 }}>
        {Number(iso.slice(8, 10))}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
      </Typography>
    </Box>
  );
}

function ExamRow({ exam, pace, fixes, divider, titleOf, actions }: { exam: ResolvedExam; pace: ExamPace; fixes: readonly Fix[]; divider: boolean; titleOf: (id: string) => string; actions: ExamActions }): React.ReactElement {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const meta = VERDICT_META[pace.verdict.status];
  const held = pace.verdict.status === 'done';
  const label = verdictChip(pace.verdict);

  return (
    <ListItem disableGutters divider={divider} sx={{ gap: 1.5, alignItems: 'center' }} aria-label={`${exam.name}: ${label}`}>
      <DateTile iso={exam.start} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
          <Typography variant="subtitle2" component="h3" noWrap>
            {examShortName(exam)}
          </Typography>
          <EmergeChip tone={meta.tone} dot label={label} />
        </Stack>
        {held ? null : (
          <Tooltip title="Periods needed / periods left" arrow>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75 }}>
              <Box sx={{ flex: 1 }}>
                <ProgressBar value={pace.available > 0 ? (pace.needed / pace.available) * 100 : 100} tone={meta.hue} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {pace.needed}/{pace.available}
              </Typography>
            </Stack>
          </Tooltip>
        )}
      </Box>
      {held ? null : (
        <Tooltip title="Adjust" arrow>
          <IconButton size="small" aria-label={`Adjust ${exam.name}`} aria-haspopup="dialog" onClick={(event) => setAnchor(event.currentTarget)}>
            <Badge variant="dot" color="warning" invisible={fixes.length === 0}>
              <SlidersHorizontal size={16} />
            </Badge>
          </IconButton>
        </Tooltip>
      )}
      <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <ExamSettings exam={exam} fixes={fixes} titleOf={titleOf} actions={actions} />
      </Popover>
    </ListItem>
  );
}

export function TermExams({ view, actions }: { view: TermPlanView; actions: ExamActions }): React.ReactElement {
  const titleOf = (id: string): string => view.chapters.find((c) => c.id === id)?.title ?? 'Chapter';
  const upcoming = view.paces.filter((p) => p.verdict.status !== 'done');
  const onTrack = upcoming.filter((p) => p.verdict.status === 'on_track').length;
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="Examinations" subheader={upcoming.length > 0 ? `${onTrack} of ${upcoming.length} on track` : 'None ahead'} />
      {view.exams.length === 0 ? null : (
        <List disablePadding sx={{ px: 3, py: 1 }}>
          {view.exams.map((exam, index) => {
            const pace = view.paces.find((p) => p.examId === exam.id);
            return pace ? <ExamRow key={exam.id} exam={exam} pace={pace} fixes={view.fixes[exam.id] ?? []} divider={index < view.exams.length - 1} titleOf={titleOf} actions={actions} /> : null;
          })}
        </List>
      )}
    </Card>
  );
}
