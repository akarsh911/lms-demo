import * as React from 'react';
import Stack from '@mui/material/Stack';

import { RoomDetail } from '@/components/school/rooms/room-detail';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ persona: string; roomId: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug, roomId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.rooms');

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['school', 'school-rooms'])} current="Room" />
      <RoomDetail roomId={roomId} personaSlug={slug} />
    </Stack>
  );
}
