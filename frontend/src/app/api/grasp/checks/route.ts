import { body, handle, parseSettings, requireTeacher } from '@/server/grasp/http';
import { createCheck, listChecks } from '@/server/grasp/store';

export const dynamic = 'force-dynamic';

export const GET = (): Promise<Response> => handle(async () => (await requireTeacher(), listChecks()));

export const POST = (request: Request): Promise<Response> =>
  handle(async () => {
    await requireTeacher();
    return createCheck(parseSettings(await body(request)));
  });
