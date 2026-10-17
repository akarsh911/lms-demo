'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BookOpen, CalendarDays, CheckCircle2, Flame, Star } from 'lucide-react';

import { EmergeLogo } from '@/components/brand/emerge-logo';
import { BandSwitcher } from '@/components/brand/band-switcher';
import {
  Avatar,
  Divider,
  EmergeChip,
  EmptyState,
  Grid,
  PageHeader,
  ProgressBar,
  ProgressRing,
  Row,
  SectionHeader,
  Segmented,
  Stat,
  Tile,
} from '@/components/ui';
import { GRADE_BANDS, useBand, type ChipTone } from '@/components/ui/re-exports';

const CHIP_TONES: ChipTone[] = [
  'grey', 'orange', 'amber', 'teal', 'green', 'red', 'violet', 'lilac', 'blue', 'indigo', 'coral',
];

export function DesignReference(): React.ReactElement {
  const theme = useTheme();
  const { band } = useBand();
  const [filter, setFilter] = React.useState<'all' | 'due' | 'done'>('all');
  const spec = GRADE_BANDS[band];

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', p: 4 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <EmergeLogo height={34} inkColor={theme.brand.ink} />
        <BandSwitcher />
      </Stack>

      <PageHeader
        title="Design reference"
        subtitle={`Band: ${spec.label} · Class ${spec.grades} · ornament ${spec.ornament} · radius ${spec.radius.sm}/${spec.radius.md}/${spec.radius.lg}/${spec.radius.xl} · body ${spec.type.base}px`}
        actions={<Button variant="contained">Primary action</Button>}
      />

      <Stack spacing={5}>
        <section>
          <SectionHeader title="Buttons" subtitle="Height and radius follow the band" />
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
            <Button variant="contained">Primary</Button>
            <Button variant="contained" color="secondary">Violet</Button>
            <Button variant="outlined">Ghost</Button>
            <Button variant="text">Quiet</Button>
            <Button variant="contained" size="small">Small</Button>
            <Button variant="contained" size="large">Large</Button>
            <Button variant="contained" disabled>Disabled</Button>
          </Stack>
        </section>

        <section>
          <SectionHeader title="Chips" subtitle="Tone picks a checked tint + foreground pair" />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {CHIP_TONES.map((tone) => (
              <EmergeChip key={tone} tone={tone} label={tone} dot />
            ))}
          </Stack>
        </section>

        <section>
          <SectionHeader title="Stats" />
          <Card>
            <CardContent>
              <Grid cols={4}>
                <Stat value="94%" label="Attendance" tone="green" icon={<CheckCircle2 size={17} />} />
                <Stat value="12" label="Assignments" tone="orange" icon={<BookOpen size={17} />} />
                <Stat value="7" label="Day streak" tone="amber" icon={<Flame size={17} />} />
                <Stat value="A-" label="Average" tone="violet" icon={<Star size={17} />} />
              </Grid>
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionHeader title="Progress" />
          <Grid cols={2}>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.75 }}>Mathematics</Typography>
                    <ProgressBar value={72} tone="green" />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.75 }}>Science</Typography>
                    <ProgressBar value={38} tone="amber" />
                  </Box>
                </Stack>
              </CardContent>
            </Card>
            <Card>
              <CardContent sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <ProgressRing value={72} label="course" />
                <ProgressRing value={41} tone="violet" label="term" />
              </CardContent>
            </Card>
          </Grid>
        </section>

        <section>
          <SectionHeader
            title="Tiles"
            subtitle="Illustration is suppressed on the minimal band"
            actions={
              <Segmented
                ariaLabel="Filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'due', label: 'Due' },
                  { value: 'done', label: 'Done' },
                ]}
              />
            }
          />
          <Grid cols={3}>
            <Tile title="Today's classes" tone="orange" meta={<EmergeChip label="4 periods" tone="orange" />} art={<CalendarDays size={72} strokeWidth={1.2} />} />
            <Tile title="Continue learning" tone="teal" meta={<EmergeChip label="2 in progress" tone="teal" />} art={<BookOpen size={72} strokeWidth={1.2} />} />
            <Tile title="Achievements" tone="violet" meta={<EmergeChip label="7 earned" tone="violet" />} art={<Star size={72} strokeWidth={1.2} />} />
          </Grid>
        </section>

        <section>
          <SectionHeader title="Rows" />
          <Card>
            <CardContent>
              <Row leading={<Avatar name="Aarav Sharma" ring />} title="Aarav Sharma" subtitle="Class 10 · Roll 14" trailing={<EmergeChip label="Present" tone="green" dot />} />
              <Divider />
              <Row leading={<Avatar name="Diya Nair" />} title="Diya Nair" subtitle="Class 10 · Roll 21" trailing={<EmergeChip label="Late" tone="amber" dot />} />
              <Divider />
              <Row leading={<Avatar name="Kabir Patel" />} title="Kabir Patel" subtitle="Class 10 · Roll 09" trailing={<EmergeChip label="Absent" tone="red" dot />} />
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionHeader title="Empty state" />
          <Card>
            <EmptyState
              title="No assignments yet"
              body="New assignments appear here as soon as your teacher sets them. Nothing is due right now."
              art={<BookOpen size={44} strokeWidth={1.2} color={theme.brand.tert} />}
              action={<Button variant="outlined" size="small">Browse library</Button>}
            />
          </Card>
        </section>
      </Stack>
    </Box>
  );
}
