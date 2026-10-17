'use client';

import { MINDMAP_CAPABILITIES } from '@/constants/mindmap';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { capabilityFor } from '@/lib/core/fields';

export interface MindmapGrants {
  settled: boolean;
  mayReadMaps: boolean;
  mayReadMastery: boolean;
  mayRecordMastery: boolean;
}

export function useMindmapGrants(): MindmapGrants {
  const capabilities = useCapabilities();
  const held = (key: string): boolean =>
    capabilities.data
      ? capabilityFor(capabilities.data.capabilities, key) !== undefined
      : capabilities.isError;

  const mayReadMaps = held(MINDMAP_CAPABILITIES.read);

  return {
    settled: !capabilities.isPending,
    mayReadMaps,
    mayReadMastery: mayReadMaps && held(MINDMAP_CAPABILITIES.masteryRead),
    mayRecordMastery: mayReadMaps && held(MINDMAP_CAPABILITIES.masteryWrite),
  };
}
