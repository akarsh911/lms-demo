export type CasActionResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'step_up_required' }
  | { status: 'signed_out' }
  | { status: 'refused'; code: string; message: string };

export interface AccountSecurityView {
  totpEnrolled: boolean;
  totpConfirmedAt: string | null;
  recoveryCodesRemaining: number;
  email: string | null;
  identities: LinkedIdentityView[];
  twoFactor: TwoFactorView | null;
}

export interface TwoFactorMethodView {
  method: string;
  available: boolean;
  enrolled: boolean;
  destination: string | null;
  reason: string | null;
}

export interface TwoFactorView {
  enabled: boolean;
  source: string | null;
  canDisable: boolean;
  requiredBy: string | null;
  preferred: string | null;
  methods: TwoFactorMethodView[];
  prompt: { show: boolean; reason: string } | null;
}

export interface EmailChallengeView {
  id: string;
  destination: string;
  expiresAt: string;
}

export interface LinkedIdentityView {
  provider: string;
  email: string;
  createdAt: string;
  lastUsedAt: string | null;
}
