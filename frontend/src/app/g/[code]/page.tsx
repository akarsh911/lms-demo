import type { Metadata } from 'next';
import * as React from 'react';

import { JoinFlow } from '@/components/grasp/student/join-flow';

export const metadata: Metadata = { title: 'Hand in · GRASP' };

// Opened by students with no account: the code is the only key, and the page reads nothing but the public view of the check.
export default async function GraspJoinPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ c?: string | string[] }> }): Promise<React.ReactElement> {
  const { code } = await params;
  const { c } = await searchParams;
  return <JoinFlow code={code.replace(/\D/g, '')} carry={typeof c === 'string' ? c : ''} />;
}
