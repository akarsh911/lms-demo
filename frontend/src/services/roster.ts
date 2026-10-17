import { config } from '@/config';
import { ROSTER_KINDS, type RosterKind } from '@/constants/roster';
import { createStaff, createStudent, createTeacher, provisionPerson, rosterPage, rosterRow } from '@/fixtures/roster';

import { coreApi } from './api';
import { dev } from './dev-bypass';
import type {
  PageInfo,
  RosterPage,
  RosterRow,
  StaffRow,
  StudentRow,
  TeacherRow,
} from '@/types/roster';
import type {
  ProvisionRequest,
  ProvisionResult,
  StaffWrite,
  StudentWrite,
  TeacherWrite,
} from '@/types/people-write';

/**
 * The roster endpoints.
 *
 * Transport only. The one thing it does beyond naming a URL is lift the
 * per-endpoint array key (`students`, `staff`, `teachers`, `guardians`) into a
 * uniform `rows`, so a caller never has to know which noun this list used —
 * everything above this point reads `rows`, `count` and `page`.
 *
 * `count` and `page` are passed through UNCHANGED and are not reconciled with
 * `rows.length`. They genuinely differ: `count` precedes per-row projection.
 * Papering over that here would hide it from every screen at once.
 */
interface RosterEnvelope {
  school?: string;
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

export interface RosterQuery {
  limit: number;
  offset: number;
  /** Ignored by `/teachers`, which parses no `q`. See `ROSTER_KINDS`. */
  q?: string;
  /**
   * Extra filters the route parses, passed through as they are named there —
   * `section_id`, `house_id`, `guardian_id` and so on.
   *
   * A malformed one is REFUSED with a 400 rather than dropped
   * (`filter.Params.fail`), which is why nothing here invents a value: an empty
   * string would be sent as `section_id=` and, for that particular parameter,
   * read as absent, while `house_id=` would not be. Only defined values go.
   */
  filters?: Record<string, string | undefined>;
}

export const rosterService = {
  list: async <T extends RosterRow>(
    kind: RosterKind,
    query: RosterQuery,
    signal?: AbortSignal,
  ): Promise<RosterPage<T>> => {
    if (config.devBypass) {
      return dev(() => rosterPage<T>(kind, { limit: query.limit, offset: query.offset, q: query.q, ...query.filters }));
    }
    const spec = ROSTER_KINDS[kind];
    const body = await coreApi.get<RosterEnvelope>(
      spec.path,
      {
        limit: query.limit,
        offset: query.offset,
        // Undefined is dropped by `buildUrl`, so an empty search sends no `q`
        // at all rather than `q=`, which the parser would read as a filter.
        q: spec.searchable && query.q ? query.q : undefined,
        ...(query.filters ?? {}),
      },
      signal,
    );

    const rows = body[spec.envelopeKey];
    return {
      school: body.school,
      rows: Array.isArray(rows) ? (rows as T[]) : [],
      count: typeof body.count === 'number' ? body.count : 0,
      page: body.page ?? { limit: query.limit, offset: query.offset, has_more: false },
    };
  },

  /**
   * One row. `GET /{kind}/{id}` applies the same reach and the same field
   * policy as the list, and answers 404 — never 403 — for a row outside the
   * caller reach, so an id cannot be probed for existence.
   */
  get: <T extends RosterRow>(kind: RosterKind, id: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => rosterRow<T>(kind, id))
      : coreApi.get<T>(`${ROSTER_KINDS[kind].path}/${id}`, undefined, signal),
};

export const rosterWriteService = {
  provisionPerson: (body: ProvisionRequest) =>
    config.devBypass ? dev(() => provisionPerson(body)) : coreApi.post<ProvisionResult>('persons/provision', body),

  createStudent: (body: StudentWrite) =>
    config.devBypass ? dev(() => createStudent(body)) : coreApi.post<StudentRow>('students', body),

  createStaff: (body: StaffWrite) =>
    config.devBypass ? dev(() => createStaff(body)) : coreApi.post<StaffRow>('staff', body),

  createTeacher: (body: TeacherWrite) =>
    config.devBypass ? dev(() => createTeacher(body)) : coreApi.post<TeacherRow>('teachers', body),
};
