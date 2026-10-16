/**
 * `emerge-core` wire types, transcribed from the handlers rather than from a
 * spec: `internal/transport/http/auth.go` for identity and
 * `internal/transport/http/capabilities.go` for capabilities.
 *
 * # Almost everything is optional, and that is the contract
 *
 * emerge-core projects a response through the caller's FIELD POLICY before it
 * serialises it (`project()` in `internal/transport/http/fields.go`): a field
 * the caller may not read is DELETED from the JSON, not nulled. Every field
 * below is therefore optional, and an absent one means "not permitted to see"
 * rather than "empty".
 *
 * Only `id`, `created_at` and `updated_at` are always readable, which is why
 * `CorePerson.id` is the one required property here.
 */

/** `internal/domain/tenancy/tenant.go`. The tenant this session resolved to. */
export interface CoreSchool {
  school_id: string;
  code: string;
  name: string;
  /** The CAS tenant slug. Absent when the school is not registered in CAS. */
  cas_tenant_id?: string;
  timezone: string;
}

/**
 * Which endpoints this caller should be ADDRESSING. Not what may be rendered.
 *
 * These booleans exist so a screen asks `/students/{id}` rather than
 * `/staff/{id}`, and for nothing else. Visibility in this application comes
 * from CAS feature keys, which is why there is no `role` here and could not
 * be: a person is a student and a guardian at once, and often is.
 */
export interface CoreRoles {
  is_student: boolean;
  is_staff: boolean;
  is_teacher: boolean;
  is_guardian: boolean;
  staff_id?: string;
  teacher_id?: string;
  guardian_id?: string;
  section_ids?: string[];
  // The sections this teacher is class teacher of. Asked of emerge-core; only the fixtures carry it so far.
  class_teacher_section_ids?: string[];
  subject_offering_ids?: string[];
  student_ids?: string[];
}

/**
 * The caller's own person row.
 *
 * NOTE what is NOT here, changed 2026-09-22: `created_at`, `cas_user_id`,
 * `date_of_birth`, `gender` and `metadata_json` were removed from this
 * projection. `PATCH /persons/{id}` still accepts some of them; this response
 * no longer returns them, so the profile screen cannot show them back.
 */
export interface CorePerson {
  /** Always present: `id` is readable regardless of the field policy. */
  id: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  display_name?: string;
  date_of_birth?: string;
  gender?: string;
  email?: string;
  phone?: string;
  profile_photo_asset_id?: string;
  status?: string;
}

/**
 * `GET /auth/me`.
 *
 * `school`, `person` and `roles` appear only once a tenant has been resolved —
 * the route is mounted behind `OptionalTenant`, so without `X-School-Id` it
 * answers with the token's claims alone. The BFF always sends the header, so
 * in this application their absence means the tenant database had nothing to
 * say about this caller, not that the header was missing.
 */
export interface CoreIdentity {
  cas_user_id: string;
  session_id?: string;
  /** The CAS tenant slug from the access token. NOT an `X-School-Id` value. */
  tenant_id?: string;
  client_id?: string;
  school?: CoreSchool;
  person?: CorePerson;
  roles?: CoreRoles;
}

/** One column the authorization catalogue can name. */
export interface CapabilityField {
  key: string;
  name: string;
  data_type: string;
  enum_values?: string[];
  operators?: string[];
}

/**
 * THE THREE-VALUED FIELD ANSWER. All three values mean different things and
 * collapsing any two of them hides inputs the caller could have used.
 *
 *   all: true          every field is permitted. A caller with NO field policy
 *                      may write everything, so the absence of a policy PERMITS.
 *                      `permitted` is then not the whole story and must not be
 *                      read as the whole story.
 *   enumerated: false  the catalogue cannot name this area's columns at all.
 *                      NOT "no fields are permitted" — it is "we cannot say",
 *                      and the honest response is to offer the field and let
 *                      the endpoint refuse.
 *   permitted          meaningful only when `all` is false AND `enumerated` is
 *                      true. Then it is exactly the set.
 *
 * `lib/core/fields.ts` is the one place this is interpreted.
 */
export interface CapabilityFields {
  all: boolean;
  enumerated: boolean;
  permitted: CapabilityField[];
}

/** How much of the school one capability reaches. */
export type CapabilityBreadth = 'school_wide' | 'narrowed' | 'not_applicable';

/**
 * One entry from `GET /capabilities`, already narrowed to what the caller
 * actually holds: the endpoint omits anything the guard denied.
 *
 * IT DESCRIBES, IT NEVER DECIDES. Every endpoint authorizes independently, so
 * this is only ever used to decide what to OFFER — exactly the same division
 * as CAS feature keys, one level down. A capability present here is not
 * permission; a refusal from the endpoint is still the answer.
 */
export interface Capability {
  /** `core.<area>.<action>`, e.g. `core.persons.write`. */
  key: string;
  area: string;
  action: string;
  name: string;
  description?: string;
  /** Empty when the decision carries no reach. */
  reach?: string;
  breadth: CapabilityBreadth;
  /** True when the grant is pinned to particular rows. */
  row_pinned: boolean;
  fields: CapabilityFields;
}

export interface CapabilitiesResponse {
  service: string;
  capabilities: Capability[];
  count: number;
}

/**
 * `PATCH /persons/{id}`.
 *
 * `cas_user_id` is deliberately absent. The handler accepts the key and never
 * applies it, so offering it would be an input that silently does nothing —
 * and if the caller's policy does not permit that column, sending it turns a
 * no-op into a 403 that names it.
 */
export interface PersonUpdate {
  first_name?: string;
  middle_name?: string | null;
  last_name?: string | null;
  display_name?: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
}

export interface CoreStructureRef {
  id: string;
  name?: string;
  code?: string;
  status?: string;
}

export interface CoreSection {
  id: string;
  name?: string;
  code?: string;
  status?: string;
  branch_id?: string;
  grade_level_id?: string;
  edges?: {
    branch?: CoreStructureRef;
    grade_level?: CoreStructureRef;
  };
}
