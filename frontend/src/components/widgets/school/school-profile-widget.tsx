'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Pencil } from 'lucide-react';

import { SchoolProfileDialog } from '@/components/school/setup/school-profile-dialog';
import { Field } from '@/components/ui/field';
import { PageActions } from '@/components/ui/page-actions';
import { Avatar } from '@/components/ui/row';
import { SettingsSection } from '@/components/ui/settings-section';
import { useSchoolProfile } from '@/hooks/query/use-foundation';
import type { WidgetProps } from '@/types/widget';

import { WidgetError, WidgetLoading } from '../widget-states';

const GRID = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 3, rowGap: 2.5, m: 0 } as const;

// The school as people see it: its name, how to reach it, and the year it is in.
export function SchoolProfileWidget(_: WidgetProps): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useSchoolProfile();
  const [editing, setEditing] = React.useState(false);

  if (isPending || isError) {
    return (
      <Card>
        <CardContent>
          {isPending ? <WidgetLoading rows={5} /> : <WidgetError error={error} onRetry={() => void refetch()} />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <PageActions>
        <Button variant="contained" startIcon={<Pencil size={16} />} onClick={() => setEditing(true)}>
          Edit profile
        </Button>
      </PageActions>

      <Stack
        direction="row"
        spacing={2.5}
        sx={(theme) => ({ alignItems: 'center', px: 3, py: 3, backgroundColor: theme.brand.subtle, borderBottom: `1px solid ${theme.brand.line}` })}
      >
        <Avatar name={data.short_name || data.name} size={72} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h2" component="p" sx={{ overflowWrap: 'anywhere' }}>
            {data.name}
          </Typography>
          {/* Each fact is said once on this page: the name lives here, not in a section below as well. */}
          <Typography variant="body1" color="text.secondary">
            {data.short_name ? `Short name: ${data.short_name}` : 'No short name set'}
          </Typography>
        </Box>
      </Stack>

      <SettingsSection title="Contact" hint="Where parents and staff reach the office.">
        <Box component="dl" sx={GRID}>
          <Field label="Phone" quiet={!data.phone}>{data.phone || 'Not set'}</Field>
          <Field label="Email" quiet={!data.email}>{data.email || 'Not set'}</Field>
          <Field label="Address" quiet={!data.address}>{data.address || 'Not set'}</Field>
        </Box>
      </SettingsSection>
      <SettingsSection title="Academic year" hint="Changed from Academic Years, not here.">
        <Box component="dl" sx={GRID}>
          <Field label="Currently active" quiet={!data.current_year}>{data.current_year ?? 'No year is active'}</Field>
        </Box>
      </SettingsSection>

      {editing ? <SchoolProfileDialog profile={data} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}
