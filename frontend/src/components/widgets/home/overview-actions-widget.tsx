'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { useQuickActions } from '@/components/home/overview/quick-actions';
import type { WidgetProps } from '@/types/widget';

export function OverviewActionsWidget({ title, personaSlug }: WidgetProps): React.ReactElement {
  const { actions, dialogs } = useQuickActions(personaSlug);

  return (
    <Card>
      <CardHeader title={title} />
      <CardContent>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
          {actions.map((action) => (
            <ButtonBase
              key={action.key}
              onClick={action.run}
              disabled={action.disabled}
              sx={(theme) => ({
                display: 'flex',
                justifyContent: 'flex-start',
                gap: 1.5,
                p: 2,
                textAlign: 'left',
                borderRadius: `${theme.band.radius.md}px`,
                border: `1px solid ${theme.brand.line2}`,
                backgroundColor: theme.brand.subtle,
                transition: theme.transitions.create(['background-color', 'border-color'], { duration: theme.band.motion.fast }),
                '&:hover, &.Mui-focusVisible': { backgroundColor: theme.brand.surface, borderColor: theme.brand.ink },
                '&.Mui-disabled': { opacity: 0.55 },
              })}
            >
              <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 40, height: 40, flex: 'none', borderRadius: '999px', backgroundColor: theme.brand.surface, border: `1px solid ${theme.brand.line}` })}>
                {action.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" component="p">
                  {action.label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {action.hint}
                </Typography>
              </Box>
            </ButtonBase>
          ))}
        </Box>
      </CardContent>
      {dialogs}
    </Card>
  );
}
