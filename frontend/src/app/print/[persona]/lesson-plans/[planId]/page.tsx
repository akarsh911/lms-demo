import * as React from 'react';
import type { Metadata } from 'next';

import { PlanPrintView } from '@/components/lesson-planner/plan-print-view';
import { requireFeature } from '@/server/dal';

export const metadata: Metadata = { title: 'Lesson plan' };

export default async function LessonPlanPrintPage({
  params,
}: {
  params: Promise<{ persona: string; planId: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug, planId } = await params;
  await requireFeature(slug, 'emerge.learning.lessonplanner');

  return <PlanPrintView planId={planId} personaSlug={slug} />;
}
