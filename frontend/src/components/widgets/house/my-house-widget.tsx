'use client';

import * as React from 'react';

import { MyHouse } from '@/components/house/my-house';
import type { WidgetProps } from '@/types/widget';

export function MyHouseWidget(_: WidgetProps): React.ReactElement {
  return <MyHouse />;
}
