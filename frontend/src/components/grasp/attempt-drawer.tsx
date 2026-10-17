'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Check, Clock, FileImage, Keyboard, X } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import type { GraspAttempt, GraspCheck, ReadbackItem } from '@/types/grasp';

import { BAND, seconds, STAGE } from './band-meta';

function ItemEvidence({ item, attempt, n }: { item: ReadbackItem; attempt: GraspAttempt; n: number }): React.ReactElement {
  const response = attempt.responses.find((r) => r.itemId === item.id);
  const answered = response !== undefined;
  const right = response?.choice === item.answer;
  return (
    <Box sx={(t) => ({ border: `1px solid ${t.brand.line}`, borderRadius: `${t.band.radius.md}px`, p: 1.75 })}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
        <EmergeChip label={item.kind === 'fast' ? `Timed ${n}` : 'Untimed twin'} tone={item.kind === 'fast' ? 'rose' : 'indigo'} />
        <Typography variant="caption" color="text.secondary">
          {item.topic}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {answered ? (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Clock size={13} />
            <Typography variant="caption">{response.choice === null ? 'ran out' : seconds(response.ms)}</Typography>
          </Stack>
        ) : null}
      </Stack>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
        {item.prompt}
      </Typography>
      <Stack spacing={0.5}>
        {item.options.map((o, i) => {
          const picked = response?.choice === i;
          const correct = i === item.answer;
          return (
            <Stack key={o} direction="row" spacing={1} sx={(t) => ({ alignItems: 'center', px: 1, py: 0.5, borderRadius: 1, bgcolor: picked ? (right ? t.tints.green : t.tints.coral) : 'transparent' })}>
              <Box sx={{ width: 16, display: 'flex', color: 'success.main' }}>{correct ? <Check size={14} /> : null}</Box>
              <Typography variant="body2" sx={{ fontWeight: picked ? 600 : 400 }}>
                {o}
              </Typography>
              {picked ? (
                <Typography variant="caption" color="text.secondary">
                  their pick
                </Typography>
              ) : null}
            </Stack>
          );
        })}
      </Stack>
      {item.source ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontStyle: 'italic' }}>
          Built from: “{item.source}”
        </Typography>
      ) : null}
    </Box>
  );
}

export function AttemptDrawer({ check, attempt, onClose }: { check: GraspCheck; attempt: GraspAttempt | null; onClose: () => void }): React.ReactElement {
  const v = attempt?.verdict ?? null;
  return (
    <Drawer anchor="right" open={attempt !== null} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 } } } }}>
      {attempt ? (
        <Stack spacing={2.5} sx={{ p: 3 }}>
          <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <Typography variant="h3" component="h2">
                {attempt.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Roll {attempt.roll || '—'} · {attempt.via === 'sheet' ? 'uploaded an answer sheet' : 'typed answers'}
              </Typography>
            </div>
            <IconButton aria-label="Close" onClick={onClose}>
              <X />
            </IconButton>
          </Stack>

          {v ? (
            <Box sx={(t) => ({ bgcolor: t.tints[BAND[v.band].tone], borderRadius: `${t.band.radius.md}px`, p: 2 })}>
              <Typography variant="h4" component="p" sx={(t) => ({ color: t.onTint[BAND[v.band].tone] })}>
                {BAND[v.band].label}
              </Typography>
              <Typography variant="body2" sx={(t) => ({ color: t.onTint[BAND[v.band].tone], mt: 0.5 })}>
                {v.fastCorrect} of {v.fastTotal} timed right · untimed twin {v.slowOk ? 'right' : 'wrong'} · typical answer in {seconds(v.medianMs)}
                {v.timeouts > 0 ? ` · ran out of time ${v.timeouts}×` : ''}
              </Typography>
              <Typography variant="body2" sx={(t) => ({ color: t.onTint[BAND[v.band].tone], mt: 1, fontWeight: 600 })}>
                {BAND[v.band].action}
              </Typography>
            </Box>
          ) : (
            <EmergeChip label={STAGE[attempt.stage].label} tone={STAGE[attempt.stage].tone} dot />
          )}

          {attempt.items.length > 0 ? (
            <Stack spacing={1.25}>
              <Typography variant="h5" component="h3">
                The readback
              </Typography>
              {attempt.items.map((item, i) => (
                <ItemEvidence key={item.id} item={item} attempt={attempt} n={i + 1} />
              ))}
            </Stack>
          ) : null}

          <Divider />
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {attempt.via === 'sheet' ? <FileImage size={16} /> : <Keyboard size={16} />}
              <Typography variant="h5" component="h3">
                What they handed in
              </Typography>
            </Stack>
            {check.questions.map((q) => (
              <div key={q.id}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Q{q.number}. {q.text}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                  {attempt.answers.find((a) => a.questionId === q.id)?.text || 'No answer yet.'}
                </Typography>
              </div>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Drawer>
  );
}
