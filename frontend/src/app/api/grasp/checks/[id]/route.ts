import { body, handle, requireTeacher } from '@/server/grasp/http';
import { getCheck, GraspError, setStatus } from '@/server/grasp/store';

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export const GET = (_request: Request, { params }: Ctx): Promise<Response> =>
  handle(async () => {
    await requireTeacher();
    return getCheck((await params).id);
  });

export const PATCH = (request: Request, { params }: Ctx): Promise<Response> =>
  handle(async () => {
    await requireTeacher();
    const { status } = await body(request);
    if (status !== 'live' && status !== 'closed') throw new GraspError(400, 'invalid', 'status must be live or closed.');
    return setStatus((await params).id, status);
  });
