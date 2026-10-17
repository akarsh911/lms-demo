import type { PersonUpdate } from '@/types/core';

/**
 * The person columns this screen draws, in reading order.
 *
 * PRESENTATION ONLY. Nothing here decides what may be edited — that is the
 * caller's `core.persons.write` field policy, read through
 * `lib/core/fields.ts`. This table says what a column is CALLED, what kind of
 * input suits it and whether clearing it means null or an empty string, which
 * are all things no API can tell us.
 *
 * Two columns deliberately have no input, and neither is an authorization
 * decision:
 *
 *   `status`                   an enum the API validates (`active` / `inactive`)
 *                              and does NOT enumerate: `catalog.columnFields`
 *                              emits every column as `data_type: "string"` with
 *                              no `enum_values`. A free-text box for a validated
 *                              enum answers 400 for anything but two magic
 *                              strings, and writing those two strings in here
 *                              would be hardcoding a value that belongs to the
 *                              API. Shown, not offered, until the catalogue
 *                              names them.
 *   `profile_photo_asset_id`   a UUID pointing at the asset registry. Editing it
 *                              means uploading a file through
 *                              `POST /library/assets`, which this screen does
 *                              not do; a text box for a raw UUID is worse than
 *                              no control at all.
 *
 * `cas_user_id` is not in this table and not in `PersonUpdate`. `updatePerson`
 * accepts the key and never applies it, so an input for it would appear to work
 * and change nothing — and if the caller's policy excludes that column, sending
 * it turns a silent no-op into a 403 that names it.
 */
export const PROFILE_GROUPS = [
  { key: 'name', title: 'Name', hint: 'How you appear across the school.' },
  { key: 'contact', title: 'Contact', hint: 'Where your school reaches you.' },
  { key: 'account', title: 'Account', hint: 'Kept by your school office.' },
] as const;

export type ProfileGroupKey = (typeof PROFILE_GROUPS)[number]['key'];

export interface ProfileField {
  key: keyof PersonUpdate | 'profile_photo_asset_id';
  label: string;
  group: ProfileGroupKey;
  /** Whether this screen has an input for it at all. See above. */
  editable: boolean;
  /** Clearing a nullable column sends `null`; clearing the others sends `''`. */
  nullable: boolean;
  type?: 'text' | 'email' | 'tel';
  autoComplete?: string;
}

export const PROFILE_FIELDS: readonly ProfileField[] = [
  {
    key: 'first_name',
    group: 'name',
    label: 'First name',
    editable: true,
    nullable: false,
    autoComplete: 'given-name',
  },
  {
    key: 'middle_name',
    group: 'name',
    label: 'Middle name',
    editable: true,
    nullable: true,
    autoComplete: 'additional-name',
  },
  {
    key: 'last_name',
    group: 'name',
    label: 'Last name',
    editable: true,
    nullable: true,
    autoComplete: 'family-name',
  },
  {
    key: 'display_name',
    group: 'name',
    label: 'Display name',
    editable: true,
    nullable: false,
    autoComplete: 'nickname',
  },
  {
    key: 'email',
    group: 'contact',
    label: 'Email',
    editable: true,
    nullable: true,
    type: 'email',
    autoComplete: 'email',
  },
  {
    key: 'phone',
    group: 'contact',
    label: 'Phone',
    editable: true,
    nullable: true,
    type: 'tel',
    autoComplete: 'tel',
  },
  { key: 'status', label: 'Account status', group: 'account', editable: false, nullable: false },
  { key: 'profile_photo_asset_id', label: 'Profile photo', group: 'account', editable: false, nullable: false },
];

/**
 * The patch to send: only what actually changed.
 *
 * Diffing rather than submitting the whole form is load-bearing twice over.
 *
 *   It cannot clobber. A field the caller may READ but not see — withheld by
 *   the field policy — starts blank in the form. Submitting the form wholesale
 *   would send that blank and erase a value the user was never shown.
 *
 *   It cannot provoke a refusal it did not earn. emerge-core checks the fields
 *   a request CARRIES (`DecodeFields` returns exactly the keys present), so
 *   sending an untouched column the caller may not write turns a successful
 *   edit into a 403 naming a field the user never touched.
 */
export function changedFields(
  initial: Readonly<Record<string, string>>,
  draft: Readonly<Record<string, string>>,
  fields: readonly ProfileField[],
): PersonUpdate {
  const patch: Record<string, string | null> = {};
  for (const field of fields) {
    if (!field.editable) continue;
    const next = draft[field.key] ?? '';
    if (next === (initial[field.key] ?? '')) continue;
    patch[field.key] = next === '' && field.nullable ? null : next;
  }
  return patch as PersonUpdate;
}
