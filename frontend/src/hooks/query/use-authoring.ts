'use client';

import { useCapabilities } from './use-capabilities';
import { capabilityFor } from '@/lib/core/fields';

export interface Authoring {
  settled: boolean;
  mayPost: boolean;
  mayComment: boolean;
  mayFileMaterial: boolean;
  maySetWork: boolean;
}

export function useAuthoring(): Authoring {
  const capabilities = useCapabilities();
  const held = capabilities.data?.capabilities;
  const holds = (key: string): boolean =>
    held !== undefined && capabilityFor(held, key) !== undefined;

  return {
    settled: !capabilities.isPending,
    mayPost: holds('core.stream_posts.write'),
    mayComment: holds('core.stream_comments.write'),
    mayFileMaterial: holds('core.library.create'),
    maySetWork: holds('core.assignments.write'),
  };
}
