import { attemptIdOf, body, handle, parseAnswers, parseStudent } from '@/server/grasp/http';
import { submitAnswers } from '@/server/grasp/store';
import type { ReadbackPrompt } from '@/types/grasp';

type Ctx = { params: Promise<{ id: string }> };

// The answer index stays on the server; the phone gets prompts and options only.
export const POST = (request: Request, { params }: Ctx): Promise<Response> =>
  handle(async () => {
    const id = attemptIdOf((await params).id);
    const raw = await body(request);
    const { items, seconds } = await submitAnswers(id, parseStudent(raw), parseAnswers(raw));
    return items.map((i): ReadbackPrompt => ({ id: i.id, kind: i.kind, prompt: i.prompt, options: i.options, seconds: i.kind === 'fast' ? seconds : null }));
  });
