import { PLAYGROUND_MANIFEST } from '@/constants/playground';
import { parsePlaygroundManifest } from '@/lib/playground/manifest';
import type { PlaygroundManifest } from '@/types/playground';

export const playgroundService = {
  manifest: async (signal?: AbortSignal): Promise<PlaygroundManifest> => {
    const response = await fetch(PLAYGROUND_MANIFEST, { signal, cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`The playground manifest answered ${response.status}. Run npm run sync:playground.`);
    }
    const manifest = parsePlaygroundManifest(await response.json());
    if (!manifest) throw new Error('The playground manifest is not in the shape sync-playground writes.');
    return manifest;
  },
};
