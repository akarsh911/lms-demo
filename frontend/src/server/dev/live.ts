import 'server-only';

import { config } from '@/config';
import type { ServiceName } from '@/constants/services';

import { devSchoolId, devUserOf } from './bypass';
import type { DevForward } from './forward-headers';

export function forwardedUnderBypass(service: ServiceName): boolean {
  return config.devLiveServices.includes(service);
}

function envName(service: ServiceName, suffix: string): string {
  return `DEV_${service.toUpperCase()}_${suffix}`;
}

export function devServiceTenant(service: ServiceName): string {
  return process.env[envName(service, 'SCHOOL_ID')]?.trim() || devSchoolId();
}

export function devServiceToken(service: ServiceName): string | null {
  return process.env[envName(service, 'TOKEN')]?.trim() || process.env.DEV_SERVICE_TOKEN?.trim() || null;
}

export function devForwardFor(service: ServiceName, uid: string): DevForward {
  return { tenant: devServiceTenant(service), token: devServiceToken(service), user: devUserOf(uid) };
}
