'use client';

import * as React from 'react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import Button from '@mui/material/Button';

import { paths } from '@/paths';

export function CheckAnswerSheetsAction({ paperId, variant = 'outlined' }: { paperId: string; variant?: 'outlined' | 'contained' }): React.ReactElement | null {
  const params = useParams<{ persona?: string }>();
  const persona = params?.persona;
  if (!persona) return null;
  const href = paths.personaSection(persona, `learning/answer-sheets?paper=${encodeURIComponent(paperId)}`);
  return (
    <Button component={NextLink} href={href} size="small" variant={variant} sx={{ alignSelf: 'flex-start' }}>
      Check answer sheets
    </Button>
  );
}
