import 'server-only';

import { buildReadback, seededRandom } from '@/lib/grasp/readback';
import { judge } from '@/lib/grasp/score';
import type { Band, GraspAttempt, GraspCheck, ReadbackItem, ReadbackResponse, StudentAnswer } from '@/types/grasp';

import { BANK, claimsFor } from './bank';
import { TRANSCRIPTS } from './samples';

export const TEACHER = 'Ms. Kavya Iyer';

const NAMES = [
  'Aarav Sharma', 'Diya Patel', 'Vihaan Reddy', 'Ananya Iyer', 'Kabir Singh', 'Ishita Nair', 'Arjun Mehta', 'Saanvi Gupta',
  'Reyansh Joshi', 'Myra Kapoor', 'Advik Rao', 'Kiara Menon', 'Dhruv Bansal', 'Aditi Kulkarni', 'Rohan Verma', 'Meera Pillai',
  'Atharv Desai', 'Navya Chatterjee', 'Krish Malhotra', 'Tara Bhat', 'Yash Agarwal', 'Riya Saxena', 'Neel Banerjee', 'Pari Thakur',
  'Om Mishra', 'Zara Khan', 'Ayaan Qureshi', 'Siya Jain', 'Laksh Chauhan', 'Avni Hegde',
];

// Which sample transcript a seeded student "wrote", by band: the polished one goes to those whose readback says it is not theirs.
const SOURCE: Readonly<Record<Band, readonly string[]>> = {
  understood: ['science-answer-sheet-aarav', 'science-answer-sheet-meera'],
  unclear: ['science-answer-sheet-meera', 'science-answer-sheet-aarav'],
  not_written: ['science-answers-typed'],
  not_learnt: ['science-answer-sheet-meera'],
};

const between = (rand: () => number, lo: number, hi: number): number => Math.round(lo + rand() * (hi - lo));

function respond(items: readonly ReadbackItem[], band: Band, rand: () => number): ReadbackResponse[] {
  const fast = items.filter((i) => i.kind === 'fast');
  const right = band === 'understood' ? fast.length - (rand() < 0.3 ? 1 : 0) : band === 'unclear' ? fast.length - 1 : between(rand, 0, Math.max(0, fast.length - 2));
  const order = fast.map((_, i) => i).sort(() => rand() - 0.5);
  // The timed twin of the untimed question is missed by those whose slow answer is the tell.
  const wrongFirst = band === 'not_written' ? order.filter((i) => i !== 0).concat(0).reverse() : order;
  const correctSet = new Set(wrongFirst.slice(fast.length - right));
  const speed: Readonly<Record<Band, [number, number]>> = { understood: [1400, 3600], unclear: [2400, 5200], not_written: [4600, 6900], not_learnt: [3000, 6600] };
  const fastResponses = fast.map((item, i): ReadbackResponse => {
    if (correctSet.has(i)) return { itemId: item.id, choice: item.answer, ms: between(rand, ...speed[band]) };
    const timedOut = band === 'not_written' && rand() < 0.35;
    return { itemId: item.id, choice: timedOut ? null : (item.answer + 1 + Math.floor(rand() * (item.options.length - 1))) % item.options.length, ms: timedOut ? 7000 : between(rand, ...speed[band]) };
  });
  const slowOk = band === 'understood' || band === 'not_written';
  const slow = items.filter((i) => i.kind === 'slow').map((item): ReadbackResponse => ({ itemId: item.id, choice: slowOk ? item.answer : (item.answer + 1) % item.options.length, ms: between(rand, 5200, 16000) }));
  return [...fastResponses, ...slow];
}

function seededCheck(input: {
  id: string;
  code: string;
  setId: string;
  section: string;
  hoursAgo: number;
  status: 'live' | 'closed';
  mix: Readonly<Record<Band, number>>;
  sources?: Readonly<Record<Band, readonly string[]>>;
}): GraspCheck {
  const set = BANK.find((s) => s.id === input.setId);
  if (!set) throw new Error(`Unknown bank set ${input.setId}`);
  const rand = seededRandom(input.id);
  const created = Date.now() - input.hoursAgo * 3_600_000;
  const bands = (Object.entries(input.mix) as [Band, number][]).flatMap(([band, n]) => Array.from({ length: n }, () => band)).sort(() => rand() - 0.5);
  const transcripts = Object.entries(TRANSCRIPTS).filter(([, t]) => t.setId === input.setId);
  const attempts = bands.map((band, n): GraspAttempt => {
    const wanted = (input.sources ?? SOURCE)[band] ?? [];
    const pool = transcripts.filter(([k]) => wanted.includes(k));
    const [, t] = (pool.length > 0 ? pool : transcripts)[n % Math.max(1, (pool.length > 0 ? pool : transcripts).length)] ?? ['', { setId: '', answers: {} }];
    const answers: StudentAnswer[] = set.questions.map((q) => ({ questionId: q.id, text: t.answers[q.id] ?? '' }));
    const items = buildReadback({ questions: set.questions, answers, claims: claimsFor(set.id), count: 4, seed: `${input.id}-${n}` });
    const responses = respond(items, band, rand);
    const joined = created + between(rand, 10, 90) * 60_000;
    return {
      id: `${input.id}-a${n + 1}`,
      name: NAMES[n % NAMES.length] ?? `Student ${n + 1}`,
      roll: String(n + 1).padStart(2, '0'),
      stage: 'done',
      joinedAt: new Date(joined).toISOString(),
      submittedAt: new Date(joined + between(rand, 4, 25) * 60_000).toISOString(),
      via: rand() < 0.55 ? 'sheet' : 'typed',
      sheetNames: [],
      answers,
      items,
      responses,
      verdict: judge(items, responses),
    };
  });
  return {
    id: input.id,
    code: input.code,
    title: set.title,
    subject: set.subject,
    section: input.section,
    teacher: TEACHER,
    createdAt: new Date(created).toISOString(),
    status: input.status,
    answerMode: 'either',
    checkCount: 4,
    seconds: 7,
    questions: set.questions,
    setId: set.id,
    attempts: attempts.map((a) => (a.via === 'sheet' ? { ...a, sheetNames: ['answer-sheet.jpg'] } : a)),
  };
}

export function seedChecks(): GraspCheck[] {
  return [
    seededCheck({ id: 'g-life-10a', code: '418207', setId: 'sci-life', section: 'Class 10 A', hoursAgo: 26, status: 'live', mix: { understood: 15, unclear: 3, not_written: 4, not_learnt: 4 } }),
    seededCheck({ id: 'g-quad-10b', code: '730962', setId: 'math-quad', section: 'Class 10 B', hoursAgo: 50, status: 'live', mix: { understood: 9, unclear: 2, not_written: 2, not_learnt: 3 }, sources: { understood: ['maths-working-kabir'], unclear: ['maths-working-kabir'], not_written: ['maths-working-kabir'], not_learnt: ['maths-working-kabir'] } }),
    seededCheck({ id: 'g-nation-10a', code: '264815', setId: 'sst-nation', section: 'Class 10 A', hoursAgo: 120, status: 'closed', mix: { understood: 20, unclear: 2, not_written: 3, not_learnt: 3 }, sources: { understood: ['sst-answer-sheet-ananya'], unclear: ['sst-answer-sheet-ananya'], not_written: ['sst-answer-sheet-ananya'], not_learnt: ['sst-answer-sheet-ananya'] } }),
  ];
}
