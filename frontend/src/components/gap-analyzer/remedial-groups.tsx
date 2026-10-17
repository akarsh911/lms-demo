'use client';

import * as React from 'react';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChevronDown, Layers, ScanEye, Users, FileCheck } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { useToast } from '@/components/ui/toast';
import type { ClassAnalysis, ClassTopicSummary } from '@/types/gap-analyzer';

import { rank } from './class-insights';

interface Group {
  topic: ClassTopicSummary;
  also: { title: string; count: number } | null;
  members: { id: string; name: string }[];
}

const ASSIGN = [
  { label: 'A GRASP check', icon: <ScanEye size={16} />, verb: 'GRASP check' },
  { label: 'Flashcards', icon: <Layers size={16} />, verb: 'flashcards' },
  { label: 'A 5-question quiz', icon: <FileCheck size={16} />, verb: 'quick quiz' },
] as const;

// Students who share the same weak topics learn best together: one small-group session instead of many one-to-ones.
function groupsOf(analysis: ClassAnalysis): Group[] {
  const weak = new Map<string, Set<string>>();
  for (const c of analysis.cells) {
    if (c.status !== 'gap') continue;
    const set = weak.get(c.topic_id) ?? new Set<string>();
    set.add(c.student_id);
    weak.set(c.topic_id, set);
  }
  const names = new Map(analysis.learners.map((l) => [l.student_id, l.name]));
  const titles = new Map(analysis.topics.map((t) => [t.topic_id, t.title]));
  const used = new Set<string>();
  return rank(analysis)
    .slice(0, 6)
    .map(({ topic }): Group | null => {
      const ids = [...(weak.get(topic.topic_id) ?? [])].filter((id) => !used.has(id));
      if (ids.length < 3) return null;
      ids.forEach((id) => used.add(id));
      let also: Group['also'] = null;
      for (const [other, set] of weak) {
        if (other === topic.topic_id) continue;
        const count = ids.filter((id) => set.has(id)).length;
        if (count >= 2 && (!also || count > also.count)) also = { title: titles.get(other) ?? 'another topic', count };
      }
      return { topic, also, members: ids.map((id) => ({ id, name: names.get(id) ?? 'Learner' })) };
    })
    .filter((g): g is Group => g !== null)
    .slice(0, 3);
}

function GroupCard({ group, n }: { group: Group; n: number }): React.ReactElement {
  const notify = useToast();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  return (
    <Box sx={(t) => ({ p: 2, borderRadius: `${t.band.radius.md}px`, border: `1px solid ${t.brand.line}`, bgcolor: t.brand.surface, display: 'flex', flexDirection: 'column', gap: 1.25 })}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <EmergeChip label={`Group ${n}`} tone={n === 1 ? 'rose' : n === 2 ? 'amber' : 'violet'} />
        <Typography variant="caption" color="text.secondary">
          {group.members.length} students
        </Typography>
      </Stack>
      <div>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {group.topic.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {group.also ? `${group.also.count} of them are also weak in ${group.also.title}.` : group.topic.chapter_title}
        </Typography>
      </div>
      <AvatarGroup max={7} sx={{ justifyContent: 'flex-end', '& .MuiAvatar-root': { width: 30, height: 30, fontSize: 12 } }}>
        {group.members.map((m) => (
          <Avatar key={m.id} title={m.name} alt={m.name}>
            {m.name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 2)}
          </Avatar>
        ))}
      </AvatarGroup>
      <Typography variant="caption" color="text.secondary">
        {group.members
          .slice(0, 6)
          .map((m) => m.name.split(' ')[0])
          .join(', ')}
        {group.members.length > 6 ? ` and ${group.members.length - 6} more` : ''}
      </Typography>
      <Button variant="contained" size="small" endIcon={<ChevronDown size={14} />} onClick={(e) => setAnchor(e.currentTarget)} sx={{ alignSelf: 'flex-start', mt: 'auto' }}>
        Assign to this group
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {ASSIGN.map((a) => (
          <MenuItem
            key={a.label}
            onClick={() => {
              setAnchor(null);
              notify(`Assigned a ${a.verb} on ${group.topic.title} to ${group.members.length} students in Group ${n}`);
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {a.icon}
              <span>{a.label}</span>
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

export function RemedialGroups({ analysis }: { analysis: ClassAnalysis }): React.ReactElement | null {
  const groups = groupsOf(analysis);
  if (groups.length === 0) return null;
  return (
    <Card>
      <CardHeader avatar={<Users size={20} />} title="Smart remedial groups" subheader="Students who share the same gaps, so one 20-minute session reaches all of them" />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${groups.length}, 1fr)` }, gap: 2, p: 2.5, pt: 0 }}>
        {groups.map((g, i) => (
          <GroupCard key={g.topic.topic_id} group={g} n={i + 1} />
        ))}
      </Box>
    </Card>
  );
}
