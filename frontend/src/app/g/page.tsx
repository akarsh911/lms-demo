import type { Metadata } from 'next';
import * as React from 'react';

import { EnterCode } from '@/components/grasp/student/enter-code';

export const metadata: Metadata = { title: 'Hand in · GRASP' };

export default function GraspCodePage(): React.ReactElement {
  return <EnterCode />;
}
