import { config } from '@/config';
import { liveUnderBypass } from '@/services/dev-bypass';

const API_V1 = 'api/v1';

export const PAPER_SETTER_ROUTES = {
  settings: `${API_V1}/settings`,
  templates: `${API_V1}/templates`,
  preview: `${API_V1}/compose/preview`,
  compose: `${API_V1}/compose`,
} as const;

export function templateRoute(templateId: string): string {
  return `${PAPER_SETTER_ROUTES.templates}/${encodeURIComponent(templateId)}`;
}

export type PaperSetterSource = 'mock' | 'live';

export const DEFAULT_PAPER_SETTER_SOURCE: PaperSetterSource = 'mock';

export function paperSetterSource(): PaperSetterSource {
  if (config.devBypass) return liveUnderBypass('papersetter') ? 'live' : 'mock';
  const configured = process.env.NEXT_PUBLIC_PAPER_SETTER_SOURCE;
  return configured === 'live' || configured === 'mock'
    ? configured
    : DEFAULT_PAPER_SETTER_SOURCE;
}
