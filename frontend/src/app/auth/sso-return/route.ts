import { NextResponse, type NextRequest } from 'next/server';

import { NEXT_PARAM, safeNextPath } from '@/lib/auth/next-path';
import { logger } from '@/lib/logger';
import { paths } from '@/paths';

export function GET(request: NextRequest): NextResponse {
  const params = request.nextUrl.searchParams;
  const error = params.get('sso_error');
  if (error) logger.info('SSO hand-off was not adopted; staying signed in locally', { error });
  return NextResponse.redirect(new URL(safeNextPath(params.get(NEXT_PARAM), paths.root), request.nextUrl.origin));
}
