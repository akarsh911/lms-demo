import type { FeatureReason, FeatureState } from '@/constants/cas';

/**
 * CAS wire types, shaped from live captures rather than from the docs.
 * Where a field's nullability is surprising, the comment says why.
 */

export interface GroupRef {
  id: string;
  /** 75 of 94 groups in the estate have a NULL key. Do not assume it is set. */
  key: string | null;
  name: string;
}

export interface RuleRef {
  id: string;
  name: string;
  key?: string;
}

export interface CasUser {
  id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  status: string;
  passwordless_login: boolean;
  /**
   * True for every seeded Emerge user, and never enforced for passwordless
   * accounts (`CAS/internal/service/auth.go:545`). Gating on this alone sends
   * every fixture user to a password screen they cannot satisfy — it must be
   * read as `must_change_password && !passwordless_login`.
   */
  must_change_password: boolean;
}

/**
 * `GET /v1/me`. The CANDIDATE set, never a render source.
 *
 * `features` comes from `EffectiveFeatureKeys`, whose final clause is
 * `WHERE f.is_active = TRUE AND f.kill_switch = FALSE`
 * (`CAS/internal/repo/authz.go:145`). So of the three axes a feature carries,
 * this list applies two and ignores the third:
 *
 *   active / inactive   applied: an inactive key is absent
 *   kill switch         applied: a killed key is absent
 *   enabled / disabled  NOT applied: `is_enabled = false` still appears here
 *
 * The `is_enabled` gap is not a defect; it is the point of the flag. A disabled
 * feature is meant to be DRAWN and inert, so it has to reach the client, and it
 * is `POST /v1/features/evaluate` that reports it as `disabled`.
 *
 * The list is also scope-blind: a grant scoped to one class reads as global
 * here. That is why this is used for exactly one thing, narrowing the set of
 * keys sent to evaluate, and never as a render source.
 *
 * Note it is `rules` (RuleRef[]), not `rule_keys`.
 */
export interface ResolvedIdentity {
  user: CasUser;
  groups: GroupRef[];
  features: string[];
  rules: RuleRef[] | null;
  super_admin: boolean;
  policy_epoch: number;
  issued_at: string;
}

/** One answer from `POST /v1/features/evaluate`. This IS the authority. */
export interface FeatureDecision {
  feature: string;
  /** "draw it AND let them use it". False for visible-but-inert. */
  enabled: boolean;
  /**
   * The three-valued answer: `on`, `disabled` (drawn, refuses to act) or `off`
   * (not drawn). Carried so the reason mapping can be cross-checked against
   * what CAS itself concluded. See `resolveEntitlements`. It is a check, not
   * the source: `state` cannot say why, and why is what the user reads.
   */
  state: FeatureState;
  /** `state !== "off"`, said plainly so a nav need not know the vocabulary. */
  visible: boolean;
  reason: FeatureReason;
  matched_scope?: string;
  context?: string[];
  policy_epoch: number;
}

export interface EvaluateResponse {
  decisions: FeatureDecision[];
}

/**
 * Token pair. NOTE `expires_at` is an **RFC3339 string**, not epoch seconds.
 * Treating it as a number yields NaN, which makes every skew comparison false,
 * which triggers a refresh on every single request.
 */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface LoginResult {
  requires_2fa: boolean;
  otp?: OtpChallenge;
  tokens?: TokenPair;
  identity?: ResolvedIdentity;
  must_change_password?: boolean;
}

export interface OtpChallenge {
  challenge_id: string;
  channel: string;
  destination: string;
  expires_at: string;
  next_resend_at?: string;
  alternatives?: string[];
  /** Present only when CAS_DEV_OTP=true. Never under CAS_ENV=production. */
  dev_otp?: string;
}

export interface SsoTicket {
  ticket?: string;
  adopt_url?: string;
  expires_in?: number;
  linked?: boolean;
}

export interface SessionStatus {
  active: boolean;
  sid?: string;
  expires_at?: string;
}

export interface CasErrorBody {
  code?: string;
  message?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface StepUpChallenge {
  challenge_id: string;
  method: string;
  destination: string;
  expires_at: string;
  next_resend_at?: string;
  alternatives?: string[];
}

export interface StepUpResult {
  access_token: string;
  token_type: string;
  expires_at: string | number;
  auth_time?: number;
}

export interface MfaMethodStatus {
  method: string;
  available: boolean;
  enrolled: boolean;
  verified?: boolean;
  destination?: string | null;
  reason?: string;
}

export interface MfaPrompt {
  show: boolean;
  reason: string;
  snoozed_until?: string | null;
}

export interface MfaStatus {
  totp: { enrolled: boolean; confirmed_at?: string | null };
  recovery_codes_remaining: number;
  email?: string;
  sms?: string;
  enabled?: boolean;
  source?: string | null;
  can_disable?: boolean;
  preferred?: string | null;
  required_by?: { type?: string; id?: string; name?: string } | null;
  methods?: MfaMethodStatus[];
  prompt?: MfaPrompt;
}

export interface TotpEnrollment {
  factor_id: string;
  secret: string;
  otpauth_uri: string;
}

export interface RecoveryCodes {
  recovery_codes: string[];
}

export interface LinkedIdentity {
  provider: string;
  email: string;
  created_at: string;
  last_used_at?: string | null;
}
