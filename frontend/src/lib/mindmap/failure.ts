import { meaningOf } from '@/constants/library';
import { MINDMAP_ERROR_CODES, MINDMAP_STATE_MEANING } from '@/constants/mindmap';
import { ApiError } from '@/services/api';
import type { MindmapNotIndexedDetails } from '@/types/mindmap';

export type MindmapFailureKind =
  | 'outage'
  | 'not_indexed'
  | 'refused'
  | 'unbounded'
  | 'not_found';

export interface MindmapFailure {
  kind: MindmapFailureKind;
  message: string;
}

const OUTAGE_MESSAGE: Record<string, string> = {
  [MINDMAP_ERROR_CODES.disabled]:
    'Mind maps are switched off on this server, so no book can be opened. This is an ' +
    'outage, not an empty library.',
  [MINDMAP_ERROR_CODES.tenantUnmapped]:
    'Your school is not connected to the textbook engine yet, so no map can be drawn. ' +
    'An administrator has to connect it. Your books are not missing.',
  [MINDMAP_ERROR_CODES.engineUnavailable]:
    'The textbook engine behind mind maps is not responding, so no map could be drawn. ' +
    'This is an outage, not an empty book.',
  [MINDMAP_ERROR_CODES.serviceUnavailable]:
    'The mind-map service is not responding, so no map could be drawn. This is an ' +
    'outage, not an empty book.',
};

const UNBOUNDED_MESSAGE =
  'Too many books are placed on this node to list their mind maps here. Open the book ' +
  'you want from the Mind maps page instead.';

const NOT_FOUND_MESSAGE =
  'That book or chapter could not be found. It may have been removed, it may not be ' +
  'yours to read, or the link may be out of date.';

const REFUSED_MESSAGE =
  'The mind-map service did not accept this request, so there is nothing to show for ' +
  'it. Nothing you entered is wrong; this is a fault in the application.';

const DECLINED_MESSAGE =
  'The textbook engine declined this request for your account, and gave no reason ' +
  'this screen can show.';

function plainSentenceOf(message: string): string | null {
  const text = message.trim();
  if (text === '') return null;

  const structured = text.search(/[[{]/);
  if (structured < 0) return text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(structured));
  } catch {
    return text;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const detail = (parsed as { detail?: unknown }).detail;
  return typeof detail === 'string' ? plainSentenceOf(detail) : null;
}

function refusalOf(error: ApiError): string {
  const stated = plainSentenceOf(error.message);
  if (stated) return stated;
  return error.status === 401 || error.status === 403 ? DECLINED_MESSAGE : REFUSED_MESSAGE;
}

function notIndexedStateOf(details: unknown): string | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  const state = (details as MindmapNotIndexedDetails).mindmap_state;
  return typeof state === 'string' && state !== '' ? state : undefined;
}

export function mindmapFailure(error: unknown): MindmapFailure | null {
  if (!(error instanceof ApiError)) return null;

  const outage = OUTAGE_MESSAGE[error.code];
  if (outage) return { kind: 'outage', message: outage };

  if (error.code === MINDMAP_ERROR_CODES.notIndexed) {
    const state = notIndexedStateOf(error.details);
    return {
      kind: 'not_indexed',
      message: state ? meaningOf(MINDMAP_STATE_MEANING, state) : refusalOf(error),
    };
  }

  if (error.code === MINDMAP_ERROR_CODES.upstreamRefused) {
    if (error.status === 404) return { kind: 'not_found', message: NOT_FOUND_MESSAGE };
    return { kind: 'refused', message: refusalOf(error) };
  }

  if (error.code === MINDMAP_ERROR_CODES.linkUnbounded) {
    return { kind: 'unbounded', message: UNBOUNDED_MESSAGE };
  }

  if (error.status === 404) return { kind: 'not_found', message: NOT_FOUND_MESSAGE };

  return null;
}
