import { BANK } from '@/server/grasp/bank';
import { handle, requireTeacher } from '@/server/grasp/http';
import { SAMPLE_DIR, SAMPLE_FILES } from '@/server/grasp/samples';

export const dynamic = 'force-dynamic';

export const GET = (): Promise<Response> =>
  handle(async () => {
    await requireTeacher();
    return { sets: BANK, samples: SAMPLE_FILES.map((s) => ({ ...s, file: `${SAMPLE_DIR}/${s.file}` })) };
  });
