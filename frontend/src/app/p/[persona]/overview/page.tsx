import { redirect } from 'next/navigation';

import { paths } from '@/paths';
import { requireFeature } from '@/server/dal';

// The overview is drawn on Home, so its own address only ever leads there.
export default async function OverviewPage({ params }: { params: Promise<{ persona: string }> }): Promise<never> {
  const { persona: slug } = await params;
  await requireFeature(slug, 'emerge.home.overview');
  redirect(paths.persona(slug));
}
