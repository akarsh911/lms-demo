import { SVC_PROXY_PREFIX, type ServiceName } from '@/constants/services';
import { requestStepUp } from '@/services/step-up-gate';
import { leaveForSignIn, SESSION_INVALID } from '@/lib/auth/session-channel';

/**
 * The browser-side API client.
 *
 * Deliberately `fetch` and not axios. The sibling console uses axios purely for
 * its interceptors — to attach a bearer token and to refresh on 401. Neither job
 * exists here: the token is attached server-side by the proxy, and refresh
 * happens in `proxy.ts`. An interceptor stack with nothing to intercept is
 * ceremony, and the console's version of it carries a known session-destroying
 * bug (a module-scoped refresh latch). There is nothing to inherit.
 *
 * Every call goes to the same origin, so the session cookie rides along
 * automatically and no CORS configuration is involved anywhere.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /**
   * The refusal's own body, when it carried one beyond `code` and `message`.
   *
   * Some refusals are reports. `POST /timetables/{id}/slots` answers a clash
   * with 409, `code: "timetable_clash"` AND the clashing parties, and a UI that
   * kept only the code would have to ask a second time to say who collided
   * with what. Typed `unknown`, so a caller narrows it to the shape that
   * endpoint documents instead of this file knowing about any of them.
   */
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** A 403 from a service means CAS denied it — the real authorization answer. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isStepUpRequired(): boolean {
    return this.status === 403 && this.code === STEP_UP_REQUIRED;
  }
}

export const STEP_UP_REQUIRED = 'step_up_required';

export function apiErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'request_failed';
  const { code, error } = payload as { code?: unknown; error?: unknown };
  if (typeof code === 'string' && code !== '') return code;
  if (typeof error === 'string' && error !== '') return error;
  return 'request_failed';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export function serviceUrl(service: ServiceName, path: string): string {
  return `${SVC_PROXY_PREFIX}/${service}/${path.replace(/^\//, '')}`;
}

function buildUrl(
  service: ServiceName,
  path: string,
  query?: RequestOptions['query'],
): string {
  const url = new URL(serviceUrl(service, path), window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

const OCTET_STREAM = 'application/octet-stream';

interface EncodedBody {
  init: BodyInit | undefined;
  headers: Record<string, string>;
}

function encodeBody(body: unknown): EncodedBody {
  if (body === undefined) return { init: undefined, headers: {} };
  if (body instanceof Blob) {
    return {
      init: body,
      headers: { 'content-type': body.type === '' ? OCTET_STREAM : body.type },
    };
  }
  return {
    init: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  };
}

export async function apiRequest<T>(
  service: ServiceName,
  path: string,
  options: RequestOptions = {},
  steppedUp = false,
): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const payload = encodeBody(body);

  const res = await fetch(buildUrl(service, path, query), {
    method,
    headers: payload.headers,
    body: payload.init,
    signal,
    // Same origin, so the HttpOnly session cookie is sent without any special
    // handling. This is the payoff of the BFF: no token juggling in the client.
    credentials: 'same-origin',
  });

  if (!res.ok) {
    // A service may answer with plain text or an empty body; do not assume JSON.
    const payload: unknown = await res.json().catch(() => null);
    const message = (payload as { message?: unknown } | null)?.message;
    const error = new ApiError(
      res.status,
      apiErrorCode(payload),
      typeof message === 'string' ? message : `Request failed with status ${res.status}`,
      payload,
    );
    if (error.status === 401 && error.code === SESSION_INVALID && typeof window !== 'undefined') {
      leaveForSignIn();
    }
    if (error.isStepUpRequired && !steppedUp && (await requestStepUp())) {
      return apiRequest<T>(service, path, options, true);
    }
    throw error;
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text === '' ? undefined : JSON.parse(text)) as T;
}

/** Bind a service so call sites read `attendanceApi.get('summary')`. */
export function createServiceApi(service: ServiceName) {
  return {
    get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
      apiRequest<T>(service, path, { method: 'GET', query, signal }),
    post: <T>(path: string, body?: unknown) =>
      apiRequest<T>(service, path, { method: 'POST', body }),
    put: <T>(path: string, body?: unknown) =>
      apiRequest<T>(service, path, { method: 'PUT', body }),
    patch: <T>(path: string, body?: unknown) =>
      apiRequest<T>(service, path, { method: 'PATCH', body }),
    delete: <T>(path: string) => apiRequest<T>(service, path, { method: 'DELETE' }),
  };
}

export const attendanceApi = createServiceApi('attendance');
export const timetableApi = createServiceApi('timetable');
export const academicsApi = createServiceApi('academics');
export const labsApi = createServiceApi('labs');
export const retrievalApi = createServiceApi('retrieval');
export const flashcardsApi = createServiceApi('flashcards');
export const coreApi = createServiceApi('core');
export const papersApi = createServiceApi('papersetter');
