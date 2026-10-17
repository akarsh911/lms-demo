import * as React from 'react';
import type { Metadata } from 'next';

import { StudentReportCardView } from '@/components/grades/report-card';
import { requireFeature } from '@/server/dal';

export const metadata: Metadata = { title: 'Report card' };

export default async function StudentReportCardPage({
  params,
}: {
  params: Promise<{ persona: string; studentId: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug, studentId } = await params;
  await requireFeature(slug, 'emerge.home.people');

  return (
    <React.Suspense fallback={null}>
      <StudentReportCardView studentId={studentId} personaSlug={slug} />
    </React.Suspense>
  );
}
