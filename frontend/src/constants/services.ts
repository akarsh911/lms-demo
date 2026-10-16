import { config } from '@/config';

/**
 * The microservices this front end talks to.
 *
 * # Why there is a registry instead of a base URL per call
 *
 * The browser cannot call these services directly. The CAS access token lives
 * in an HttpOnly cookie that JavaScript cannot read — that is the whole reason
 * tampering with client state gains an attacker nothing. So a browser request
 * goes:
 *
 *   browser  ->  /api/svc/<service>/<path>   (same origin, cookie sent)
 *                    |
 *                    |  Next route handler opens the sealed cookie,
 *                    |  attaches `Authorization: Bearer <access token>`
 *                    v
 *                <service base URL>/<path>
 *
 * The service name in the URL is looked up HERE. It is never a URL supplied by
 * the caller — that would be a server-side request forgery hole, letting anyone
 * point the proxy at an internal address and have it attach a real bearer token.
 * An unknown service name is a 404, not a fetch.
 *
 * # Adding a service
 * Add a row here and an env var. Nothing else changes.
 */
export const SERVICES = {
  attendance: { env: 'ATTENDANCE_API_URL', fallback: 'http://localhost:8101' },
  timetable: { env: 'TIMETABLE_API_URL', fallback: 'http://localhost:8102' },
  academics: { env: 'ACADEMICS_API_URL', fallback: 'http://localhost:8103' },
  // Persists completed lab practicals. No backend yet; the dev bypass answers it.
  labs: { env: 'LABS_API_URL', fallback: 'http://localhost:8104' },
  // --- the study engines -----------------------------------------------------
  //
  // Three separate repos, one chain: the retrieval engine holds the corpus, the
  // mind-map engine compiles its concept graph, and the flashcard engine builds
  // decks from its passages. Ports follow the engines' own convention.
  //
  // THE MIND-MAP ENGINE HAS NO ROW HERE. It sits on the service network only and
  // emerge-core fronts it, forwarding the user's token and the school's CAS
  // slug, so it is reached as `learning/mindmaps/...` on the `core` row below.
  //
  // THE TWO THAT DO HAVE A ROW REQUIRE `X-School-Id` AND REFUSE A DEFAULT. A
  // missing tenant is a 400, deliberately: "a missing one is a 400, not a
  // default identity". This proxy states that header only under the dev bypass
  // today, so real-mode calls to these two fail until CAS carries tenancy. See
  // the note in the proxy handler and `CLAUDE.md`.

  /** `lms-retrieval-engine`. Cited NCERT passages, the syllabus tree, figures. */
  retrieval: { env: 'RETRIEVAL_API_URL', fallback: 'http://localhost:8000' },

  /**
   * `lms-flashcard-engine`. Generates grounded decks and marks free-text answers.
   * It reaches the retrieval engine itself for `generate/from-retrieval`, so that
   * call is one request from here, not an orchestration.
   */
  flashcards: { env: 'FLASHCARDS_API_URL', fallback: 'http://localhost:8300' },

  // --- the school's own record -----------------------------------------------

  /**
   * `emerge-core`. People, the academic structure, the library and the
   * curriculum: the school's own data, as opposed to the study engines' corpus.
   *
   * THE BASE URL INCLUDES THE VERSION PREFIX — `http://localhost:8081/api/v1`,
   * not `http://localhost:8081`. Every route is under `/api/v1`, so carrying
   * the prefix here keeps it out of all thirty-odd path strings in
   * `services/core.ts` rather than repeating it in each.
   *
   * THERE IS NO FALLBACK, and that is the one difference from every row above.
   * A default would point this at a host by guessing, and the thing on the
   * other end holds one school's real people. An unset `CORE_API_URL` is a 503
   * that names the variable; see `serviceBaseUrl`.
   *
   * It is also the only service so far that needs a TENANT as well as a token —
   * see `SCHOOL_TENANT_SERVICES` below.
   */
  core: { env: 'CORE_API_URL', fallback: '' },

  papersetter: { env: 'PAPERSETTER_API_URL', fallback: '' },

  lessonplanner: { env: 'LESSONPLANNER_API_URL', fallback: 'http://localhost:8500' },

  debate: { env: 'DEBATE_API_URL', fallback: 'http://localhost:8700', bypassFallback: 'https://core.tryemerge.in/demo/debate' },

  answerchecker: { env: 'ANSWER_CHECKER_API_URL', fallback: 'http://localhost:8100/api' },

  omr: { env: 'OMR_API_URL', fallback: 'http://localhost:8610/api' },

  gapanalyzer: { env: 'GAPANALYZER_API_URL', fallback: 'http://localhost:8510' },
} as const;

export type ServiceName = keyof typeof SERVICES;

export function isServiceName(value: string): value is ServiceName {
  return Object.prototype.hasOwnProperty.call(SERVICES, value);
}

/**
 * Services whose `X-School-Id` is an **emerge-core school**: its `school_id`
 * UUID or its `code`, resolved per session by `server/core/tenant.ts`.
 *
 * The two study engines addressed from here, retrieval and flashcards, are
 * deliberately NOT in this set even though they require the same header name.
 * Their tenant vocabulary is a different one —
 * `DEV_SCHOOL_ID` is `S_42`, and the CAS tenant the deployed engine compares
 * against is a slug — and emerge-core's school UUID is neither. Sending it
 * would swap one unusable tenant for another while looking like a fix, so the
 * engines keep the behaviour documented in `CLAUDE.md` §10 until somebody
 * establishes what tenant they actually expect.
 */
export const SCHOOL_TENANT_SERVICES: ReadonlySet<ServiceName> = new Set<ServiceName>([
  'core',
]);

/**
 * Server-side only — these env vars are not exposed to the browser.
 *
 * `null` when the service has no URL configured and no fallback to stand in for
 * one. Nullable rather than an empty string so the call site has to decide what
 * an unconfigured service does: `new URL('x', '/')` would otherwise throw from
 * somewhere that reads like a fetch failure.
 */
export function serviceBaseUrl(name: ServiceName): string | null {
  const entry = SERVICES[name];
  const fallback = config.devBypass && 'bypassFallback' in entry ? entry.bypassFallback : entry.fallback;
  const url = (process.env[entry.env] ?? fallback).trim();
  return url === '' ? null : url.replace(/\/+$/, '');
}

/** The env var a service reads, so an error can name it. */
export function serviceEnvVar(name: ServiceName): string {
  return SERVICES[name].env;
}

/** The single same-origin prefix the browser talks to. */
export const SVC_PROXY_PREFIX = '/api/svc';
