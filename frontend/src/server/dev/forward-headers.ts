export const DEV_USER_HEADER = 'x-dev-user';

export interface DevForward {
  tenant: string;
  token: string | null;
  user: string;
}

export function devForwardHeaders(forward: DevForward): Record<string, string> {
  return {
    'x-school-id': forward.tenant,
    [DEV_USER_HEADER]: forward.user,
    ...(forward.token ? { authorization: `Bearer ${forward.token}` } : {}),
  };
}
