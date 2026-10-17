import { handle, requireTeacher } from '@/server/grasp/http';
import { resetDemo } from '@/server/grasp/store';

export const POST = (): Promise<Response> => handle(async () => (await requireTeacher(), resetDemo(), { ok: true }));
