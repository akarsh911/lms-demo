'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, CheckCircle2, ClipboardCheck, Coffee, Flag } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { clockOf } from '@/lib/dates';
import { paths } from '@/paths';
import type { TimelineSlot } from '@/types/timetable';

const TIME_COL = 64;

function Rail({ tone, last }: { tone: 'accent' | 'line' | 'none'; last: boolean }): React.ReactElement {
  return (
    <Box sx={{ position: 'relative', width: 20, flexShrink: 0, alignSelf: 'stretch' }}>
      <Box sx={(theme) => ({ position: 'absolute', left: 9, top: 0, bottom: last ? '50%' : 0, width: 2, bgcolor: theme.brand.line2 })} />
      {tone === 'none' ? null : (
        <Box sx={(theme) => ({ position: 'absolute', left: 4, top: 18, width: 12, height: 12, borderRadius: '50%', bgcolor: tone === 'accent' ? theme.brand.accent : theme.brand.surface, border: `2px solid ${tone === 'accent' ? theme.brand.accent : theme.brand.line2}` })} />
      )}
    </Box>
  );
}

// One school day as a timeline: every period in order, each lesson saying where to be and opening its subject.
export function TimelineDay({ slots, date, now, teaching, personaSlug, onCancelExtra }: { slots: readonly TimelineSlot[]; date: string; now: number | null; teaching: boolean; personaSlug: string; onCancelExtra?: (id: string) => void }): React.ReactElement {
  return (
    <Stack component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {slots.map((slot, i) => {
        const current = now !== null && now >= slot.start && now < slot.end;
        const past = now !== null && now >= slot.end;
        const last = i === slots.length - 1;
        const time = (
          <Stack sx={{ width: TIME_COL, flexShrink: 0, pt: slot.kind === 'break' ? 0.75 : 1.75, alignItems: 'flex-end', opacity: past ? 0.55 : 1 }}>
            <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {clockOf(slot.start)}
            </Typography>
            {slot.kind === 'break' ? null : (
              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {clockOf(slot.end)}
              </Typography>
            )}
          </Stack>
        );

        if (slot.kind === 'break') {
          return (
            <Stack component="li" key={slot.id} direction="row" spacing={1.5}>
              {time}
              <Rail tone="none" last={last} />
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 1, color: 'text.secondary', opacity: past ? 0.55 : 1 }}>
                {slot.name === 'Lunch' ? <Coffee size={14} aria-hidden /> : <Flag size={14} aria-hidden />}
                <Typography variant="body2" sx={{ color: 'inherit' }}>
                  {slot.name}
                </Typography>
              </Stack>
            </Stack>
          );
        }

        if (slot.kind === 'free') {
          return (
            <Stack component="li" key={slot.id} direction="row" spacing={1.5}>
              {time}
              <Rail tone="line" last={last} />
              <Box sx={(theme) => ({ flex: 1, my: 0.75, px: 2, py: 1.25, borderRadius: `${theme.band.radius.sm}px`, border: `1px dashed ${theme.brand.line2}`, opacity: past ? 0.55 : 1 })}>
                <Typography variant="body2" color="text.secondary">
                  {slot.name}
                </Typography>
              </Box>
            </Stack>
          );
        }

        const subjectHref = slot.offering_id
          ? paths.personaSection(personaSlug, teaching && slot.grade_level_id && slot.section_id ? `sections/${slot.grade_level_id}/${slot.section_id}/subjects/${slot.offering_id}` : `subjects/${slot.offering_id}`)
          : null;
        const registerHref = paths.personaSection(personaSlug, `attendance?section=${slot.section_id ?? ''}&day=${date}`);

        return (
          <Stack component="li" key={slot.id} direction="row" spacing={1.5}>
            {time}
            <Rail tone={current ? 'accent' : 'line'} last={last} />
            <Box
              sx={(theme) => ({
                flex: 1,
                minWidth: 0,
                my: 0.75,
                p: 2,
                borderRadius: `${theme.band.radius.sm}px`,
                border: `1px solid ${current ? theme.brand.accent : theme.brand.line}`,
                bgcolor: slot.register ? theme.tints.rose : theme.brand.surface,
                boxShadow: current ? `0 0 0 3px ${theme.tints.rose}` : 'none',
                opacity: past || slot.cancelled ? 0.6 : 1,
              })}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Typography variant="subtitle1" sx={{ textDecoration: slot.cancelled ? 'line-through' : 'none' }}>
                      {slot.subject ?? slot.name}
                    </Typography>
                    {current ? <EmergeChip label="Now" tone="rose" dot /> : null}
                    {slot.register ? <EmergeChip label="Class teacher period" tone="rose" /> : null}
                    {slot.cover ? <EmergeChip label="Covering" tone="amber" /> : null}
                    {slot.kind === 'extra' ? <EmergeChip label="Extra class" tone="violet" /> : null}
                    {slot.cancelled ? <EmergeChip label="Cancelled" tone="grey" /> : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {[teaching ? slot.label : slot.teacher, slot.room, slot.kind === 'extra' ? null : slot.name].filter(Boolean).join(' · ')}
                    {slot.note ? ` · ${slot.note}` : ''}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                  {slot.register ? (
                    <Button component={NextLink} href={registerHref} size="small" variant={slot.taken ? 'outlined' : 'contained'} startIcon={slot.taken ? <CheckCircle2 size={14} /> : <ClipboardCheck size={14} />}>
                      {slot.taken ? 'Register Taken' : 'Take Register'}
                    </Button>
                  ) : null}
                  {slot.kind === 'extra' && onCancelExtra ? (
                    <Button size="small" color="error" onClick={() => onCancelExtra(slot.id)}>
                      Cancel
                    </Button>
                  ) : null}
                  {subjectHref && !slot.cancelled ? (
                    <Button component={NextLink} href={subjectHref} size="small" variant="outlined" endIcon={<ArrowRight size={14} />}>
                      Open Subject
                    </Button>
                  ) : null}
                </Stack>
              </Stack>
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}
