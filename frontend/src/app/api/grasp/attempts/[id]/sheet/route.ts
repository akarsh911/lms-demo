import { attemptIdOf, handle, parseCarried, uploadedFiles } from '@/server/grasp/http';
import { readSheet } from '@/server/grasp/samples';
import { sheetContext } from '@/server/grasp/store';

type Ctx = { params: Promise<{ id: string }> };

export const POST = (request: Request, { params }: Ctx): Promise<Response> =>
  handle(async () => {
    attemptIdOf((await params).id);
    const form = await request.clone().formData();
    const code = String(form.get('code') ?? '').replace(/\D/g, '');
    const check = await sheetContext(code, parseCarried(form.get('carry'), code));
    const files = await uploadedFiles(request);
    const reading = await readSheet(files, check.setId, check.questions.map((q) => q.id), files.length + code.length);
    await new Promise((r) => setTimeout(r, 2200));
    return reading;
  });
