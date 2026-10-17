'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { Award, Pencil, Trophy } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { FormDialog } from '@/components/ui/form-dialog';
import { Avatar } from '@/components/ui/row';
import { SearchField } from '@/components/ui/search-field';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useHouseWrite, useMyHouse } from '@/hooks/query/use-my-house';
import { useReach } from '@/hooks/query/use-reach';
import { formatShortDate } from '@/lib/dates';
import type { HouseMember } from '@/types/house';

const ordinal = (n: number): string => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function AwardDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const write = useHouseWrite();
  const [sign, setSign] = React.useState<1 | -1>(1);
  const [points, setPoints] = React.useState('10');
  const [reason, setReason] = React.useState('');
  const n = Math.round(Number(points) || 0);
  return (
    <FormDialog
      open
      title={sign > 0 ? 'Award house points' : 'Deduct house points'}
      description="The log keeps every entry with its reason."
      submitLabel={sign > 0 ? `Award ${n}` : `Deduct ${n}`}
      pending={write.isPending}
      error={write.error}
      canSubmit={n > 0 && n <= 100 && reason.trim().length >= 4}
      onClose={onClose}
      onSubmit={() => write.mutate({ award: { points: sign * n, reason } }, { onSuccess: () => (notify(`${sign > 0 ? 'Awarded' : 'Deducted'} ${n} points`), onClose()) })}
    >
      <ToggleButtonGroup exclusive size="small" value={sign} onChange={(_, v: 1 | -1 | null) => v && setSign(v)} aria-label="Award or deduct">
        <ToggleButton value={1}>Award</ToggleButton>
        <ToggleButton value={-1}>Deduct</ToggleButton>
      </ToggleButtonGroup>
      <TextField label="Points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 100 } }} />
      <TextField label="For" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Inter-house football, second place" required />
    </FormDialog>
  );
}

function CaptainDialog({ office, members, onClose }: { office: 'captain' | 'vice'; members: readonly HouseMember[]; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const write = useHouseWrite();
  const [who, setWho] = React.useState<HouseMember | null>(null);
  const title = office === 'captain' ? 'House captain' : 'Vice-captain';
  return (
    <FormDialog open title={`Choose the ${title.toLowerCase()}`} submitLabel="Save" pending={write.isPending} error={write.error} canSubmit={who !== null} onClose={onClose} onSubmit={() => who && write.mutate({ office, studentId: who.student_id }, { onSuccess: () => (notify(`${who.name} is ${title.toLowerCase()}`), onClose()) })}>
      <Autocomplete options={[...members]} value={who} onChange={(_, v) => setWho(v)} getOptionLabel={(m) => `${m.name} · ${m.label}`} isOptionEqualToValue={(a, b) => a.student_id === b.student_id} renderInput={(params) => <TextField {...params} label="Member" placeholder="Name or class" />} />
    </FormDialog>
  );
}

// The house a teacher heads: where it stands, who leads it among the pupils, its members and every point it has earned.
export function MyHouse(): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useMyHouse();
  // A pupil reads their house; only its head awards points and chooses captains.
  const pupil = useReach()?.kind === 'self';
  const [awarding, setAwarding] = React.useState(false);
  const [choosing, setChoosing] = React.useState<'captain' | 'vice' | null>(null);
  const [search, setSearch] = React.useState('');
  if (isPending) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const { house } = data;
  const leader = data.standings[0];
  const q = search.trim().toLowerCase();
  const shown = data.members.filter((m) => !q || m.name.toLowerCase().includes(q) || m.label.toLowerCase().includes(q));
  const office = (kind: 'captain' | 'vice', who: HouseMember | null): React.ReactElement => (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      {who ? <Avatar name={who.name} size={36} /> : null}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          {kind === 'captain' ? 'House captain' : 'Vice-captain'}
        </Typography>
        <Typography variant="subtitle2" noWrap>
          {who ? `${who.name} · ${who.label}` : 'Not chosen'}
        </Typography>
      </Box>
      {pupil ? null : (
        <Button size="small" variant="outlined" startIcon={<Pencil size={13} />} onClick={() => setChoosing(kind)}>
          Change
        </Button>
      )}
    </Stack>
  );

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'House', value: house.name, note: pupil ? `Head of house: ${house.head ?? 'not named'}` : 'You are its head' },
          { label: 'Standing', value: ordinal(house.rank), note: house.rank === 1 ? (data.standings.filter((s) => s.rank === 1).length > 1 ? 'Level at the top' : 'Leading the school') : `${(leader?.points ?? 0) - house.points} behind ${leader?.name ?? ''}` },
          { label: 'Points', value: house.points, note: `${data.log.length} entries this year` },
          { label: 'Members', value: house.members, note: `${data.by_class.length} classes` },
        ]}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 5fr) minmax(0, 7fr)' }, alignItems: 'start' }}>
        <Stack spacing={2}>
          <Card>
            <CardHeader title="Standings" subheader="All four houses, by points" />
            <Stack spacing={1.25} sx={{ px: 3, pt: 2, pb: 2.5 }}>
              {data.standings.map((s) => (
                <Stack key={s.house_id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Typography variant="subtitle2" sx={{ width: 28 }}>
                    {ordinal(s.rank)}
                  </Typography>
                  <Typography variant="body2" sx={{ width: 84, fontWeight: s.house_id === house.house_id ? 700 : 400 }}>
                    {s.name}
                  </Typography>
                  <Box sx={(theme) => ({ flex: 1, height: 10, borderRadius: 5, bgcolor: theme.brand.sunken, overflow: 'hidden' })}>
                    <Box sx={(theme) => ({ width: `${(s.points / Math.max(1, leader?.points ?? 1)) * 100}%`, height: 1, bgcolor: theme.hues[s.colour] })} />
                  </Box>
                  <Typography variant="body2" sx={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {s.points}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Card>
          <Card>
            <CardHeader title="Leaders" subheader={pupil ? 'Chosen by the head of house' : 'Chosen by you from the house'} />
            <Stack spacing={1.5} sx={{ px: 3, pt: 2, pb: 2.5 }}>
              {office('captain', data.captain)}
              {office('vice', data.vice_captain)}
            </Stack>
          </Card>
          <Card>
            <CardHeader
              title="Points log"
              subheader="Newest first"
              action={
                pupil ? undefined : (
                  <Button variant="contained" startIcon={<Award size={15} />} onClick={() => setAwarding(true)}>
                    Award Points
                  </Button>
                )
              }
              sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
            />
            <List disablePadding>
              {data.log.map((e) => (
                <ListItem key={e.id} divider sx={{ px: 3, gap: 1.5 }}>
                  <Trophy size={16} aria-hidden />
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {e.reason}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatShortDate(e.date)} · {e.by}
                    </Typography>
                  </Stack>
                  <EmergeChip label={`${e.points > 0 ? '+' : ''}${e.points}`} tone={e.points > 0 ? 'green' : 'red'} />
                </ListItem>
              ))}
            </List>
          </Card>
        </Stack>
        <Card>
          <CardHeader title={pupil ? 'Your classmates in the house' : 'Members'} subheader={pupil ? `${data.members.length} from your class, of ${house.members} in ${house.name}` : data.by_class.map((c) => `${c.label.replace('Class ', '')}: ${c.count}`).join(' · ')} />
          <Box sx={{ px: 3, pb: 1.5 }}>
            <SearchField label="Name or class" value={search} onChange={setSearch} width="100%" />
          </Box>
          <List disablePadding sx={{ maxHeight: 640, overflowY: 'auto' }}>
            {shown.map((m) => (
              <ListItem key={m.student_id} divider sx={{ px: 3, gap: 1.5 }}>
                <Avatar name={m.name} size={28} />
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {m.name}
                </Typography>
                <EmergeChip label={m.label} tone="grey" />
              </ListItem>
            ))}
          </List>
        </Card>
      </Box>
      {awarding ? <AwardDialog onClose={() => setAwarding(false)} /> : null}
      {choosing ? <CaptainDialog office={choosing} members={data.members.filter((m) => m.student_id !== (choosing === 'captain' ? data.vice_captain : data.captain)?.student_id)} onClose={() => setChoosing(null)} /> : null}
    </Stack>
  );
}
