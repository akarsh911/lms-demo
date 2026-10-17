'use client';

import * as React from 'react';

import { NeedsYou } from '@/components/home/teaching/needs-you';
import type { WidgetProps } from '@/types/widget';

export function NeedsYouWidget({ title, personaSlug }: WidgetProps): React.ReactElement {
  return <NeedsYou title={title} personaSlug={personaSlug} />;
}
