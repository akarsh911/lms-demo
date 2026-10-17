import { body, handle, parseCarried, parseStudent } from '@/server/grasp/http';
import { joinCheck, joinView } from '@/server/grasp/store';

type Ctx = { params: Promise<{ code: string }> };

export const dynamic = 'force-dynamic';

export const GET = (request: Request, { params }: Ctx): Promise<Response> =>
  handle(async () => {
    const code = (await params).code.replace(/\D/g, '');
    return joinView(code, parseCarried(new URL(request.url).searchParams.get('c'), code));
  });

export const POST = (request: Request, { params }: Ctx): Promise<Response> =>
  handle(async () => joinCheck(parseStudent({ ...(await body(request)), code: (await params).code })));
