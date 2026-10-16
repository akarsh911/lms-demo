import type { ChipTone } from '@/components/ui/chip';

export const PLAYGROUND_BASE = '/playground';
export const PLAYGROUND_MANIFEST = `${PLAYGROUND_BASE}/manifest.json`;
export const PLAYGROUND_TIMELINE_PAGE = `${PLAYGROUND_BASE}/timeline.html`;
export const PLAYGROUND_HUB_CLASS_KEY = 'pg:hub:class';
export const PLAYGROUND_TIMELINE_PARAMS = { class: 'cls', query: 'q' } as const;
export const PLAYGROUND_PARAMS = { class: 'class', thread: 'thread', tool: 'tool', view: 'view' } as const;

export const TOOL_KINDS: Readonly<Record<string, { label: string; tone: ChipTone }>> = {
  grapher: { label: 'Grapher', tone: 'blue' },
  bench: { label: 'Bench', tone: 'green' },
};

export const OTHER_TOOL_KIND = { label: 'Tool', tone: 'grey' } as const satisfies { label: string; tone: ChipTone };
