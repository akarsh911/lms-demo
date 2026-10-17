import * as fixtures from '@/fixtures/debate';
import type {
  CreateDebateRequest,
  DebateCatalog,
  DebateHealth,
  DebateReportEnvelope,
  DebateSegment,
  DebateSession,
  SegmentMetrics,
} from '@/types/debate';

import { ApiError, apiRequest, serviceUrl } from './api';
import { dev, liveOrFixture } from './dev-bypass';

export interface DebateStatus {
  health: DebateHealth;
  scripted: boolean;
}

const THINKING_MS = 1400;

const session = (id: string, rest = ''): string => `sessions/${encodeURIComponent(id)}${rest}`;

const post = <T>(path: string, body?: unknown): Promise<T> => apiRequest<T>('debate', path, { method: 'POST', body });

async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(serviceUrl('debate', path), { method: 'POST', body: form, credentials: 'same-origin' });
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (payload as { error?: unknown; code?: unknown } | null)?.error ?? (payload as { code?: unknown } | null)?.code;
    throw new ApiError(res.status, typeof code === 'string' ? code : 'request_failed', `Request failed with status ${res.status}`, payload);
  }
  return payload as T;
}

export const debateService = {
  status: (signal?: AbortSignal): Promise<DebateStatus> =>
    liveOrFixture<DebateStatus>(
      'debate',
      'health',
      async () => ({ health: await apiRequest<DebateHealth>('debate', 'health', { signal }), scripted: false }),
      () => dev(() => ({ health: fixtures.debateHealth, scripted: true })),
    ),

  catalog: (scripted: boolean, signal?: AbortSignal): Promise<DebateCatalog> =>
    scripted ? dev(() => fixtures.debateCatalog) : apiRequest<DebateCatalog>('debate', 'catalog', { signal }),

  create: (request: CreateDebateRequest, scripted: boolean): Promise<DebateSession> =>
    scripted ? dev(() => fixtures.createSession(request)) : post<DebateSession>('sessions', request),

  get: (id: string, signal?: AbortSignal): Promise<DebateSession> =>
    fixtures.ownsSession(id)
      ? dev(() => fixtures.getSession(id), 40)
      : apiRequest<DebateSession>('debate', session(id), { signal }),

  cancel: (id: string): Promise<DebateSession> =>
    fixtures.ownsSession(id)
      ? dev(() => fixtures.cancelSession(id))
      : apiRequest<DebateSession>('debate', session(id), { method: 'DELETE' }),

  intro: (id: string): Promise<DebateSession> =>
    fixtures.ownsSession(id) ? dev(() => fixtures.startIntro(id)) : post<DebateSession>(session(id, '/intro')),

  begin: (id: string): Promise<DebateSession> =>
    fixtures.ownsSession(id) ? dev(() => fixtures.begin(id), THINKING_MS) : post<DebateSession>(session(id, '/begin')),

  addSegment: (
    id: string,
    turn: number,
    seq: number,
    wav: Blob,
    durationMs: number,
    metrics: SegmentMetrics,
  ): Promise<DebateSegment> => {
    if (fixtures.ownsSession(id)) {
      return dev(() => fixtures.addRecordedSegment(id, turn, seq, durationMs, metrics), 500);
    }
    const form = new FormData();
    form.append('audio', wav, `turn-${turn}-${seq}.wav`);
    form.append('seq', String(seq));
    form.append('voiced_ms', String(metrics.voiced_ms));
    form.append('pause_before_ms', String(metrics.pause_before_ms));
    form.append('long_pauses', String(metrics.long_pauses));
    form.append('longest_pause_ms', String(metrics.longest_pause_ms));
    return upload<DebateSegment>(session(id, `/turns/${turn}/segments`), form);
  },

  acceptsTypedTurns: (id: string): boolean => fixtures.ownsSession(id),

  addTypedSegment: (id: string, turn: number, seq: number, text: string): Promise<DebateSegment> =>
    dev(() => fixtures.addTypedSegment(id, turn, seq, text)),

  finishTurn: (id: string, turn: number, seqs: readonly number[]): Promise<DebateSession> =>
    fixtures.ownsSession(id)
      ? dev(() => fixtures.finishTurn(id, turn, seqs), THINKING_MS)
      : post<DebateSession>(session(id, `/turns/${turn}/finish`), { seqs }),

  aiTurnPlayed: (id: string, turn: number): Promise<DebateSession> =>
    fixtures.ownsSession(id)
      ? dev(() => fixtures.ackAiTurn(id, turn))
      : post<DebateSession>(session(id, `/turns/${turn}/played`)),

  retryAiTurn: (id: string): Promise<DebateSession> =>
    fixtures.ownsSession(id)
      ? dev(() => fixtures.retryAiTurn(id), THINKING_MS)
      : post<DebateSession>(session(id, '/ai-turn/retry')),

  end: (id: string, reason: 'manual' | 'time_limit'): Promise<DebateSession> =>
    fixtures.ownsSession(id)
      ? dev(() => fixtures.endDebate(id, reason))
      : post<DebateSession>(session(id, '/end'), { reason }),

  report: (id: string, signal?: AbortSignal): Promise<DebateReportEnvelope> =>
    fixtures.ownsSession(id)
      ? dev(() => fixtures.getReport(id))
      : apiRequest<DebateReportEnvelope>('debate', session(id, '/report'), { signal }),

  retryReport: (id: string): Promise<DebateReportEnvelope> =>
    fixtures.ownsSession(id)
      ? dev(() => fixtures.retryReport(id))
      : post<DebateReportEnvelope>(session(id, '/report/retry')),

  clipUrl: (id: string, clipId: string): string | null =>
    fixtures.ownsSession(id) ? null : serviceUrl('debate', session(id, `/audio/${encodeURIComponent(clipId)}`)),
};
