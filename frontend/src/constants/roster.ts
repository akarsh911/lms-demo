/**
 * The four roster kinds, as data.
 *
 * Endpoint, envelope key, labels and which filters the route actually parses.
 * One table rather than four near-identical screens: the lists differ in the
 * name of their array and in one secondary line each, and writing that as four
 * components is how they drift.
 *
 * `searchable` is NOT a style choice. `/students`, `/staff` and `/guardians`
 * parse a `q` parameter; `/teachers` does not — its filters are
 * `specialization`, `status` and `branch_id`
 * (`internal/data/teacher/filters.go`). An unparsed parameter is not an error
 * there, it is silently ignored, so a search box over teachers would look like
 * a search that matches everything. Drawing it only where it works says the
 * true thing.
 *
 * Status is deliberately NOT offered as a filter on any of them. Every kind
 * validates its own enum server-side and no endpoint enumerates the values:
 * `catalog.columnFields` emits every column as `data_type: "string"` with no
 * `enum_values`. A dropdown here would have to hardcode a list that belongs to
 * the API. Status is DISPLAYED, from whatever the row carries.
 */
export const ROSTER_KINDS = {
  students: {
    label: 'Students',
    /** Path under `CORE_API_URL`, and the array key in the envelope. */
    path: 'students',
    envelopeKey: 'students',
    searchable: true,
    /** The secondary line under a name, in order of preference. */
    codeFields: ['admission_number', 'student_code'],
    codeLabel: 'Admission no.',
    detailSegment: 'students',
    notFound: 'No students match this.',
  },
  staff: {
    label: 'Staff',
    path: 'staff',
    envelopeKey: 'staff',
    searchable: true,
    codeFields: ['employee_code', 'designation'],
    codeLabel: 'Code or post',
    detailSegment: null,
    notFound: 'No staff match this.',
  },
  teachers: {
    label: 'Teachers',
    path: 'teachers',
    envelopeKey: 'teachers',
    searchable: false,
    codeFields: ['teacher_code', 'specialization'],
    codeLabel: 'Code or subject',
    detailSegment: 'teachers',
    notFound: 'No teachers to show.',
  },
  guardians: {
    label: 'Guardians',
    path: 'guardians',
    envelopeKey: 'guardians',
    searchable: true,
    codeFields: ['occupation', 'employer'],
    codeLabel: 'Occupation',
    detailSegment: null,
    notFound: 'No guardians match this.',
  },
} as const;

export type RosterKind = keyof typeof ROSTER_KINDS;

export const ROSTER_KIND_NAMES = Object.keys(ROSTER_KINDS) as RosterKind[];

export function isRosterKind(value: string | null): value is RosterKind {
  return value !== null && Object.prototype.hasOwnProperty.call(ROSTER_KINDS, value);
}

/**
 * How many rows a page asks for.
 *
 * emerge-core defaults to 50 and caps at 200, and silently substitutes the
 * default for anything outside that range rather than erroring
 * (`filter.Params.Page`). 25 is asked for explicitly so the number in
 * `page.limit` is one this application chose, which matters because `has_more`
 * is derived from it.
 */
export const ROSTER_PAGE_SIZE = 25;
