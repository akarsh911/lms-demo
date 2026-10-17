'use client';

import * as React from 'react';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { CheckCircle2, ChevronRight, CircleAlert } from 'lucide-react';

import { fixPath, withQuery, type FixTarget } from '@/lib/school/structure';
import { paths } from '@/paths';
import type { StructureIssue } from '@/types/structure';

import type { StructureBase } from './structure-mode';

export const issueHref = (base: StructureBase, issue: FixTarget): string => {
  const { tail, query } = fixPath(issue);
  return withQuery(`${base.path}/${tail}`, query);
};

export function IssueList({ issues, base, personaSlug, empty }: { issues: readonly StructureIssue[]; base: StructureBase; personaSlug: string; empty: string }): React.ReactElement {
  if (issues.length === 0) {
    return (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 3, color: 'success.main' }}>
        <CheckCircle2 size={20} aria-hidden />
        <Typography variant="body1" color="text.primary">
          {empty}
        </Typography>
      </Stack>
    );
  }
  return (
    <List disablePadding sx={{ p: 1 }}>
      {issues.map((issue) => (
        <ListItemButton key={issue.id} component={NextLink} href={paths.personaSection(personaSlug, issueHref(base, issue))} sx={{ borderRadius: 2, gap: 1.5 }}>
          <ListItemIcon sx={{ minWidth: 0, color: 'warning.main' }}>
            <CircleAlert size={20} aria-hidden />
          </ListItemIcon>
          <ListItemText primary={issue.title} secondary={issue.detail} slotProps={{ primary: { variant: 'subtitle1' }, secondary: { variant: 'body2' } }} />
          <ChevronRight size={16} aria-hidden />
        </ListItemButton>
      ))}
    </List>
  );
}
