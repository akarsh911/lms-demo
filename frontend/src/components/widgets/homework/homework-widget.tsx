'use client';

import * as React from 'react';

import { HomeworkBoard } from '@/components/homework/homework-board';
import { MyWork } from '@/components/homework/my-work';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { useReach } from '@/hooks/query/use-reach';
import type { WidgetProps } from '@/types/widget';

// Teachers and the office run assignments; a pupil does their own.
export function HomeworkWidget({ personaSlug }: WidgetProps): React.ReactElement {
  const reach = useReach();
  if (!reach) return <WidgetLoading rows={8} />;
  return reach.kind === 'self' ? <MyWork /> : <HomeworkBoard personaSlug={personaSlug} />;
}
