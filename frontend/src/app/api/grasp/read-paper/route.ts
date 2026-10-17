import { handle, requireTeacher, uploadedFiles } from '@/server/grasp/http';
import { readPaper } from '@/server/grasp/samples';

export const POST = (request: Request): Promise<Response> =>
  handle(async () => {
    await requireTeacher();
    const [first] = await uploadedFiles(request);
    if (!first) return null;
    await new Promise((r) => setTimeout(r, 1400));
    return readPaper(first.bytes, first.name);
  });
