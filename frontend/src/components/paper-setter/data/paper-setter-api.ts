import { config } from '@/config';

import { fallbackTransport } from './fallback-transport';
import { mockTransport } from './mock-transport';
import { paperSetterSource } from './routes';
import { liveTransport, type PaperSetterTransport } from './transport';

export function paperSetterApi(): PaperSetterTransport {
  if (paperSetterSource() === 'mock') return mockTransport;
  return config.devBypass ? fallbackTransport : liveTransport;
}

export function usingMockedPaperSetter(): boolean {
  return paperSetterSource() === 'mock';
}

export type { PaperSetterTransport };
