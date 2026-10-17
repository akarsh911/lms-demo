'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { NotebookPen } from 'lucide-react';
import NextLink from 'next/link';

const LABEL = 'Plan a re-teach';

export function PlanReteach({ href, topics, contained = false }: { href: string | null; topics: readonly string[]; contained?: boolean }): React.ReactElement | null {
  if (!href) return null;
  const named = topics.join(', ');
  return (
    <Tooltip title={`A new lesson focused on ${named}`}>
      <Button component={NextLink} href={href} aria-label={`${LABEL}: ${named}`} variant={contained ? 'contained' : 'outlined'} size="small" startIcon={<NotebookPen size={16} aria-hidden />} sx={{ flexShrink: 0 }}>
        {LABEL}
      </Button>
    </Tooltip>
  );
}
