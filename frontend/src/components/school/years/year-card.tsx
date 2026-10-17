import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, CircleAlert, Lock } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { dayRange } from '@/lib/dates';
import { LIFECYCLE_LABEL, LIFECYCLE_TONE, yearLifecycle } from '@/lib/school/years';
import type { YearRegister } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

const count = (n: number): string => n.toLocaleString('en-IN');

function Fact({ value, label }: { value: React.ReactNode; label: string }): React.ReactElement {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="h3" component="p" noWrap>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" noWrap>
        {label}
      </Typography>
    </Box>
  );
}

const ACTION = { active: 'Open Year', draft: 'Continue Setup', closed: 'View' } as const;

// A year as the state of the school in it: who is enrolled, what is open, what is over. Its calendar is not the headline.
export function YearCard({
  year,
  register,
  href,
}: {
  year: AcademicSession;
  register: YearRegister | undefined;
  href: string;
}): React.ReactElement {
  const life = yearLifecycle(year);
  const compact = life === 'closed';

  const facts =
    register && life === 'active' ? (
      <>
        <Fact value={count(register.active)} label="Students enrolled" />
        <Fact value={count(register.new_admissions)} label="New admissions" />
        <Fact value={count(register.withdrawn)} label="Withdrawals" />
        <Fact value={count(register.sections)} label="Sections" />
        <Fact value={register.teachers === null ? 'None' : count(register.teachers)} label="Teachers assigned" />
      </>
    ) : register && life === 'closed' ? (
      <>
        <Fact value={count(register.enrolled - register.withdrawn)} label="Final enrolments" />
        <Fact value={count(register.graduated)} label="Graduated" />
        <Fact value={count(register.withdrawn)} label="Withdrew" />
      </>
    ) : null;

  return (
    <Card>
      <CardActionArea component={NextLink} href={href} sx={{ p: compact ? 2.5 : 3 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant={compact ? 'h4' : 'h2'} component="h3">
                {year.name ?? year.code}
              </Typography>
              <EmergeChip label={life === 'draft' ? 'Setup' : LIFECYCLE_LABEL[life]} tone={LIFECYCLE_TONE[life]} dot={life === 'active'} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {dayRange(year.start_date, year.end_date)}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flex: 'none', color: 'text.primary' }}>
            <Typography variant="subtitle2" component="span">
              {ACTION[life]}
            </Typography>
            <ArrowRight size={16} aria-hidden />
          </Stack>
        </Stack>

        {facts ? (
          <Box
            sx={(theme) => ({
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${life === 'active' ? 5 : 3}, minmax(0, 1fr))` },
              gap: 2.5,
              mt: compact ? 2 : 3,
              pt: compact ? 2 : 2.5,
              borderTop: `1px solid ${theme.brand.line}`,
            })}
          >
            {facts}
          </Box>
        ) : null}

        {register && life === 'draft' ? (
          <Box sx={(theme) => ({ mt: 3, pt: 2.5, borderTop: `1px solid ${theme.brand.line}` })}>
            <Typography variant="subtitle1" component="p">
              {register.areas_ready} of {register.areas_total} areas ready
            </Typography>
            {register.open_areas.map((line) => (
              <Typography key={line} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {line}
              </Typography>
            ))}
          </Box>
        ) : null}

        {register && life === 'active' && register.pending_items > 0 ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 2.5, color: 'warning.dark' }}>
            <CircleAlert size={16} aria-hidden />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {register.pending_items} {register.pending_items === 1 ? 'item needs' : 'items need'} attention
            </Typography>
          </Stack>
        ) : null}

        {life === 'closed' ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 2, color: 'text.secondary' }}>
            <Lock size={14} aria-hidden />
            <Typography variant="body2">Historical record</Typography>
          </Stack>
        ) : null}
      </CardActionArea>
    </Card>
  );
}
