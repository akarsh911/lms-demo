import { SESSION_ENDED } from '@/lib/api-failure';
import type { CasActionResult } from '@/types/account';

const LAST_SIGN_IN_METHOD = 'last_sign_in_method';
const REQUIRED_BY_POLICY = 'required_by_policy';
const NO_DESTINATION = 'no_destination';

export function failureMessage(result: Exclude<CasActionResult<unknown>, { status: 'ok' }>): string {
  switch (result.status) {
    case 'signed_out':
      return SESSION_ENDED;
    case 'step_up_required':
      return 'This change needs you to confirm it is you. Try again and complete the verification.';
    case 'refused':
      if (result.code === LAST_SIGN_IN_METHOD) return 'This is your only way to sign in. Set a password before unlinking it.';
      if (result.code === REQUIRED_BY_POLICY) return 'Two-step verification has to stay on: your school requires it, or your authenticator app keeps it on. Remove the authenticator first.';
      if (result.code === NO_DESTINATION) return 'Your account has no email address to send a code to.';
      return result.message || 'That could not be done. Try again.';
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}
