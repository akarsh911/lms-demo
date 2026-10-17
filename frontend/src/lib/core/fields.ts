import type { Capability, CapabilityFields } from '@/types/core';

/**
 * Reading emerge-core's field policy, in one place.
 *
 * Pure: no React, no fetch. `GET /capabilities` answers each capability with a
 * three-valued `fields` object and every one of the three values means
 * something different. Interpreting it at each call site is how two of them get
 * collapsed into "permitted is the list", which is wrong in both directions.
 */

/**
 * What the policy is actually able to tell us.
 *
 *   all         no field policy applies, so EVERY field is permitted. The
 *               absence of a policy permits; it does not deny.
 *   enumerated  a policy applies and the catalogue can name the columns, so
 *               `permitted` is exactly the set.
 *   unnameable  a policy applies and the catalogue cannot name this area's
 *               columns at all (`enumerated: false`). This is "we cannot say",
 *               NOT "nothing is permitted", and the two must not be merged:
 *               treating it as a denial hides inputs the caller could have
 *               used and fields the caller was shown.
 */
export type FieldMode = 'all' | 'enumerated' | 'unnameable';

export function fieldMode(fields: CapabilityFields): FieldMode {
  if (fields.all) return 'all';
  return fields.enumerated ? 'enumerated' : 'unnameable';
}

/** The capability with this key, or undefined — which means it is not held. */
export function capabilityFor(
  capabilities: readonly Capability[] | undefined,
  key: string,
): Capability | undefined {
  return capabilities?.find((c) => c.key === key);
}

/**
 * May this field be WRITTEN?
 *
 * `unnameable` answers yes, deliberately. The endpoint is the authority and it
 * refuses by naming the denied columns in a 403, so offering an input that may
 * be refused costs one clear error message. Withholding it costs the user a
 * field they were entitled to edit, silently and permanently.
 *
 * No capability at all is a genuine no: `getCapabilities` omits anything the
 * guard denied, so an absent `core.persons.write` means the write itself is
 * denied and there is nothing to offer.
 */
export function mayWriteField(
  capability: Capability | undefined,
  field: string,
): boolean {
  if (!capability) return false;
  switch (fieldMode(capability.fields)) {
    case 'all':
    case 'unnameable':
      return true;
    case 'enumerated':
      return capability.fields.permitted.some((f) => f.key === field);
  }
}

/**
 * Why a field is not on screen. Absent is not the same as empty.
 *
 *   shown     a value arrived
 *   empty     no value, and the policy says we would have been shown one
 *   withheld  no value, and the policy did not permit this column
 *
 * emerge-core DELETES a denied field from the JSON rather than nulling it, and
 * `omitempty` deletes a null one too, so the response alone cannot tell the two
 * apart. The read capability's own field policy is what separates them: it is
 * the same policy the projection used, so if it permits the column then the
 * absence is genuinely an empty value.
 *
 * `unnameable` reports `withheld`. Of the two possible mistakes, telling
 * someone their school holds no email for them when it is merely hidden is the
 * worse one.
 */
export type FieldVisibility = 'shown' | 'empty' | 'withheld';

export function readVisibility(
  capability: Capability | undefined,
  field: string,
  value: string | undefined,
): FieldVisibility {
  if (value !== undefined && value !== '') return 'shown';
  // No `core.persons.read` grant: `/auth/me` falls back to a floor policy that
  // permits nothing, so everything but `id` was stripped.
  if (!capability) return 'withheld';
  switch (fieldMode(capability.fields)) {
    case 'all':
      return 'empty';
    case 'enumerated':
      return capability.fields.permitted.some((f) => f.key === field)
        ? 'empty'
        : 'withheld';
    case 'unnameable':
      return 'withheld';
  }
}

/** The values an enum column accepts, when the catalogue names them. */
export function enumValuesFor(
  capability: Capability | undefined,
  field: string,
): readonly string[] {
  return capability?.fields.permitted.find((f) => f.key === field)?.enum_values ?? [];
}

/**
 * The columns a 403 named. emerge-core answers
 * `not permitted to write: email, phone` and that list is the whole point of
 * the refusal — a generic "something went wrong" throws away the one piece of
 * information the user needs to fix their submission.
 */
const DENIED_PREFIX = 'not permitted to write: ';

export function deniedFieldsFrom(message: string | undefined): string[] {
  if (!message) return [];
  const at = message.indexOf(DENIED_PREFIX);
  if (at < 0) return [];
  return message
    .slice(at + DENIED_PREFIX.length)
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Does this grant cover the whole school, or only part of it?
 *
 * `breadth` is derived from whether the caller ALSO holds the area's `_all`
 * entity (`breadthOf` in `internal/transport/http/capabilities.go`), and it has
 * three values rather than two for a reason that is easy to get backwards:
 *
 *   school_wide      they hold the `_all` key with no row constraints
 *   narrowed         the `_all` key exists and they do not hold it, so what
 *                    they see is a subset
 *   not_applicable   THE AREA HAS NO `_all` KEY AT ALL. Five do not —
 *                    `schools`, `academic_sessions`, `reference`, `sections`
 *                    and `subject_offerings`, none of which is scoped per
 *                    person. There is nothing to be narrowed against, so this
 *                    is "the question does not apply", NOT "restricted".
 *
 * This returns true only for `narrowed`, so a screen cannot accidentally tell
 * someone they are seeing a restricted view of the timetable structure when
 * every caller sees the same one.
 */
export function showsSubsetOfSchool(capability: Capability | undefined): boolean {
  return capability?.breadth === 'narrowed';
}
