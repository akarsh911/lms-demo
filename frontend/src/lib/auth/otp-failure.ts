export type OtpFailure =
  | 'wrong_code'
  | 'expired'
  | 'consumed'
  | 'too_many_attempts'
  | 'resend_too_soon'
  | 'resend_limit'
  | 'daily_limit'
  | 'not_found'
  | 'no_destination'
  | 'unknown';

const BY_MESSAGE: ReadonlyArray<readonly [string, OtpFailure]> = [
  ['incorrect code', 'wrong_code'],
  ['otp expired', 'expired'],
  ['otp already used', 'consumed'],
  ['too many incorrect attempts', 'too_many_attempts'],
  ['resend requested too soon', 'resend_too_soon'],
  ['resend limit reached', 'resend_limit'],
  ['daily code limit reached', 'daily_limit'],
  ['otp challenge not found', 'not_found'],
  ['no destination for channel', 'no_destination'],
];

export function otpFailureFrom(message: string): OtpFailure {
  const text = message.trim().toLowerCase();
  for (const [needle, failure] of BY_MESSAGE) {
    if (text.includes(needle)) return failure;
  }
  return 'unknown';
}

export function isChallengeDead(failure: OtpFailure): boolean {
  return (
    failure === 'expired' ||
    failure === 'consumed' ||
    failure === 'not_found' ||
    failure === 'too_many_attempts'
  );
}
