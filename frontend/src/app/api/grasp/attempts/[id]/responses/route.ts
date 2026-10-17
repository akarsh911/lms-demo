import { attemptIdOf, body, handle, parseAnswers, parseResponses, parseStudent } from '@/server/grasp/http';
import { submitResponses } from '@/server/grasp/store';

type Ctx = { params: Promise<{ id: string }> };

// The student is told only that the work is in; the verdict is for the teacher.
export const POST = (request: Request, { params }: Ctx): Promise<Response> =>
  handle(async () => {
    const raw = await body(request);
    await submitResponses(attemptIdOf((await params).id), parseStudent(raw), parseAnswers(raw), parseResponses(raw));
    return { ok: true };
  });
