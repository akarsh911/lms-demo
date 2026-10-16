/**
 * The CAS wire contract, as measured against a live server — not as documented.
 * `CAS/docs/ONBOARDING.md` disagrees with reality in several places and the
 * differences are load-bearing; see `docs/DECISIONS.md`.
 */

export const CAS_PATHS = {
  login: 'v1/auth/login',
  otpStart: 'v1/auth/otp/start',
  otpResend: 'v1/auth/otp/resend',
  loginVerify: 'v1/auth/login/verify',
  loginAlternate: 'v1/auth/login/alternate',
  passwordChange: 'v1/auth/password/change',
  refresh: 'v1/auth/refresh',
  logout: 'v1/auth/logout',
  session: 'v1/auth/session',
  ssoTicket: 'v1/auth/sso/ticket',
  me: 'v1/me',
  evaluateFeatures: 'v1/features/evaluate',
  stepUpStart: 'v1/auth/step-up/start',
  stepUpVerify: 'v1/auth/step-up/verify',
  mfa: 'v1/me/mfa',
  mfaTotp: 'v1/me/mfa/totp',
  mfaTotpConfirm: 'v1/me/mfa/totp/confirm',
  mfaRecoveryCodes: 'v1/me/mfa/recovery-codes',
  mfaEmailEnable: 'v1/me/mfa/email/enable',
  mfaEmailConfirm: 'v1/me/mfa/email/confirm',
  mfaPreferred: 'v1/me/mfa/preferred',
  mfaOptIn: 'v1/me/mfa/opt-in',
  mfaPromptSnooze: 'v1/me/mfa/prompt/snooze',
  identities: 'v1/me/identities',
  identityGoogleLink: 'v1/me/identities/google/link',
  oauthAuthorize: 'oauth/authorize',
  oauthToken: 'oauth/token',
  ssoLogout: 'logout',
} as const;

/**
 * CAS error codes, as returned in the JSON envelope `{code, message}`.
 *
 * Two things here are not obvious and both bite:
 *
 * 1. `invalid_token` is byte-identical for an expired token, a tampered token,
 *    an `alg:none` forgery and a token signed by a foreign key. The client
 *    CANNOT tell them apart from the response, so it must not try. This is why
 *    refresh is driven proactively from the token's own expiry rather than
 *    reactively from a 401.
 *
 * 2. `session_invalid` means the session is gone — revoked, or destroyed by
 *    refresh-replay theft detection. Refreshing on it is pointless and, worse,
 *    a replay attempt is itself what CAS treats as theft. It must sign out.
 */
export const CAS_ERROR_CODES = {
  invalidToken: 'invalid_token',
  missingToken: 'missing_token',
  sessionInvalid: 'session_invalid',
  userInactive: 'user_inactive',
  passwordChangeRequired: 'password_change_required',
  tooManyAttempts: 'too_many_attempts',
  invalidInput: 'invalid_input',
  invalidCredentials: 'invalid_credentials',
  accountLocked: 'account_locked',
  accountBlocked: 'account_blocked',
  missingFields: 'missing_fields',
  invalidChallenge: 'invalid_challenge',
  noOtpDestination: 'no_otp_destination',
  otpError: 'otp_error',
  passwordPolicy: 'password_policy',
  stepUpRequired: 'step_up_required',
  enrollRequired: 'enroll_required',
  invalidCode: 'invalid_code',
  lastSignInMethod: 'last_sign_in_method',
  requiredByPolicy: 'required_by_policy',
  noDestination: 'no_destination',
  methodNotAllowed: 'method_not_allowed',
  methodUnavailable: 'method_unavailable',
} as const;

export const HTTP = {
  ok: 200,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  tooManyRequests: 429,
} as const;

/**
 * The TEN entitlement reasons CAS can emit
 * (`CAS/internal/service/entitlement.go`).
 *
 * Two traps, both of which have already been walked into once:
 *
 * 1. `scoped_grant` is NOT one of them. `CAS/docs/ONBOARDING.md:434` says it is,
 *    and a client typed off that doc silently fails to match every scoped grant.
 *    The scoped hit is `scope_match`.
 *
 * 2. This list used to stop at seven. `grant_off`, `feature_group_off` and
 *    `disabled` were missing, and because `uiStateFor` ends in an exhaustive
 *    `never`, a real CAS answer carrying one of them threw at runtime rather
 *    than mis-rendering. `disabled` is reachable the moment a feature has
 *    `is_enabled = false`, and `grant_off` the moment a grant carries
 *    `feature_enabled = false`. Neither is exotic.
 */
export const FEATURE_REASONS = [
  'unscoped_grant',
  'scope_match',
  'out_of_scope',
  'no_grant',
  'retired',
  'kill_switch',
  'scoped_grant_needs_context',
  'grant_off',
  'feature_group_off',
  'disabled',
] as const;

export type FeatureReason = (typeof FEATURE_REASONS)[number];

/**
 * The three-valued answer that rides alongside the reason. Read as a
 * cross-check on the reason mapping, never as a replacement for it: `state`
 * cannot say WHY, and the why is what the user is shown.
 */
export const FEATURE_STATES = ['on', 'disabled', 'off'] as const;

export type FeatureState = (typeof FEATURE_STATES)[number];

/**
 * Where a front end draws a feature. Mirrors CAS's own closed vocabulary
 * (`CAS/internal/handler/admin.go`, `featurePlacements`).
 *
 * CAS stores this on the feature row, but it does NOT return it to an ordinary
 * caller: `GET /v1/me` returns bare key strings and `POST /v1/features/evaluate`
 * returns no placement field. `GET /v1/admin/features` has it and requires the
 * `features.list` admin permission, which no Emerge user holds.
 *
 * So placement is DECLARED on this side, in the route registry for `sidebar`
 * and the widget registry for `widget`, and `scripts/check-routes.mjs` stops a
 * key claiming both. CAS still decides whether the thing is drawn at all; this
 * only decides where.
 */
export const FEATURE_PLACEMENTS = ['sidebar', 'widget'] as const;

export type FeaturePlacement = (typeof FEATURE_PLACEMENTS)[number];

export const SCOPE_GROUP_PREFIXES = ['section-', 'grade-', 'branch-'] as const;

export type ScopeGroupPrefix = (typeof SCOPE_GROUP_PREFIXES)[number];

export const SECTION_PREFIX: ScopeGroupPrefix = 'section-';
export const GRADE_PREFIX: ScopeGroupPrefix = 'grade-';
export const BRANCH_PREFIX: ScopeGroupPrefix = 'branch-';
