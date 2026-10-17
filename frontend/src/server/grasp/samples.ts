import 'server-only';

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { BankSet, PaperReading, SampleFile, SheetReading, StudentAnswer } from '@/types/grasp';

import { BANK } from './bank';

export const SAMPLE_DIR = '/grasp-samples';

type Transcript = Readonly<Record<string, string>>;

// What the demo reader "reads" off each sample answer sheet, keyed by file stem.
export const TRANSCRIPTS: Readonly<Record<string, { setId: string; answers: Transcript }>> = {
  'science-answer-sheet-aarav': {
    setId: 'sci-life',
    answers: {
      'sci-q1': 'Photosynthesis needs carbon dioxide and water as raw materials. CO2 enters the leaf through the stomata and water is absorbed by the roots. Chlorophyll absorbs light energy from the sun, which is used to convert them into glucose. Oxygen is released as a by-product.',
      'sci-q2': 'Aerobic respiration takes place in the presence of oxygen and breaks glucose completely into carbon dioxide and water, releasing a lot of energy, e.g. in the mitochondria of our cells. Anaerobic respiration happens without oxygen and releases less energy. Example: yeast makes ethanol and CO2 during fermentation; our muscles make lactic acid during heavy exercise.',
      'sci-q3': 'Alveoli are tiny balloon-like sacs that give a very large surface area. They are wrapped in a network of blood capillaries so that oxygen can diffuse into the blood and carbon dioxide can diffuse out quickly. This makes the exchange of gases efficient.',
    },
  },
  'science-answer-sheet-meera': {
    setId: 'sci-life',
    answers: {
      'sci-q1': 'Plants make their food using sunlight, CO2 and water. Chlorophyll is the green pigment that traps sunlight. Glucose is made and oxygen comes out.',
      'sci-q2': 'Aerobic uses oxygen, anaerobic does not use oxygen. Example of anaerobic is yeast which makes alcohol. Aerobic happens in our body.',
      'sci-q3': 'Because exchange of gases happens in the alveoli, so blood has to be close to take the oxygen.',
    },
  },
  'science-answers-typed': {
    setId: 'sci-life',
    answers: {
      'sci-q1': 'Photosynthesis is the process by which green plants synthesise carbohydrates. The raw materials are carbon dioxide, which diffuses in through the stomata, and water, which is absorbed by the roots. Chlorophyll captures light energy and converts it into chemical energy, enabling the reduction of carbon dioxide to glucose. Oxygen is liberated as a by-product. Thus sunlight provides the energy that drives the entire process.',
      'sci-q2': 'Aerobic respiration occurs in the presence of oxygen; glucose is completely oxidised to carbon dioxide and water, yielding a large amount of energy (ATP). Example: cellular respiration in the mitochondria of human cells. Anaerobic respiration occurs in the absence of oxygen; glucose is only partially broken down, releasing less energy. Example: fermentation by yeast, which produces ethanol and carbon dioxide. Furthermore, muscle cells produce lactic acid during strenuous activity.',
      'sci-q3': 'The alveoli provide an enormous, thin surface area for gaseous exchange. A dense capillary network ensures that oxygen diffuses rapidly into the blood while carbon dioxide diffuses out, maintaining a steep concentration gradient and maximising the efficiency of the exchange of gases.',
    },
  },
  'maths-working-kabir': {
    setId: 'math-quad',
    answers: {
      'math-p1': '2x² − 7x + 3 = 0. Split middle term: −6x and −x (product 6x²). 2x² − 6x − x + 3 = 0, so 2x(x − 3) − 1(x − 3) = 0, (2x − 1)(x − 3) = 0. x = 1/2 or x = 3.',
      'math-p2': 'a = 3, b = 2, c = 5. D = b² − 4ac = 4 − 60 = −56. D < 0 so no real roots.',
      'math-p3': 'Let breadth = x m, length = x + 3 m. x(x + 3) = 40, x² + 3x − 40 = 0, (x + 8)(x − 5) = 0. x = 5, reject −8 as length cannot be negative. Breadth 5 m, length 8 m.',
      'math-p4': 'x² + 6x = −5. Add 9 to both sides: x² + 6x + 9 = 4, so (x + 3)² = 4, x + 3 = ±2. x = −1 or x = −5.',
    },
  },
  'sst-answer-sheet-ananya': {
    setId: 'sst-nation',
    answers: {
      'sst-q1': 'In February 1922 a peaceful demonstration at Chauri Chaura in Gorakhpur turned violent and a police station was set on fire. Gandhiji felt the movement was turning violent and that satyagrahis needed proper training before a mass struggle, so he withdrew it.',
      'sst-q2': "The Simon Commission came in 1928 to look into the functioning of the constitutional system in India and suggest changes. It did not have a single Indian member; all were British. So Indians greeted it with 'Go back Simon'.",
      'sst-q3': 'Salt was used by the rich and the poor alike and was an essential item of food. The tax on salt hurt everyone. Gandhiji marched 240 miles from Sabarmati to Dandi and broke the salt law by making salt from sea water.',
    },
  },
};

export const SAMPLE_FILES: readonly SampleFile[] = [
  { file: 'science-question-paper.pdf', label: 'Science question paper (PDF)', kind: 'paper', setId: 'sci-life' },
  { file: 'science-question-paper-photo.jpg', label: 'Science question paper (phone photo)', kind: 'paper', setId: 'sci-life' },
  { file: 'maths-problem-set.pdf', label: 'Maths problem set (PDF)', kind: 'paper', setId: 'math-quad' },
  { file: 'sst-question-paper.pdf', label: 'Social Science question paper (PDF)', kind: 'paper', setId: 'sst-nation' },
  { file: 'science-answer-sheet-aarav.jpg', label: 'Science, handwritten (Aarav)', kind: 'sheet', setId: 'sci-life' },
  { file: 'science-answer-sheet-meera.jpg', label: 'Science, handwritten (Meera)', kind: 'sheet', setId: 'sci-life' },
  { file: 'science-answers-typed.pdf', label: 'Science, typed and polished', kind: 'sheet', setId: 'sci-life' },
  { file: 'maths-working-kabir.jpg', label: 'Maths working, handwritten (Kabir)', kind: 'sheet', setId: 'math-quad' },
  { file: 'sst-answer-sheet-ananya.jpg', label: 'Social Science, handwritten (Ananya)', kind: 'sheet', setId: 'sst-nation' },
];

const stem = (name: string): string => name.toLowerCase().replace(/\.[a-z0-9]+$/, '');

let hashes: Promise<Map<string, string>> | null = null;

// Sample files are recognised by content, so a renamed copy or a re-download still reads.
function sampleHashes(): Promise<Map<string, string>> {
  hashes ??= (async () => {
    const dir = path.join(process.cwd(), 'public', SAMPLE_DIR);
    const map = new Map<string, string>();
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      const bytes = await readFile(path.join(dir, name));
      map.set(createHash('sha256').update(bytes).digest('hex'), stem(name));
    }
    return map;
  })();
  return hashes;
}

async function identify(bytes: Buffer, name: string): Promise<string | null> {
  const known = (await sampleHashes()).get(createHash('sha256').update(bytes).digest('hex'));
  if (known) return known;
  const s = stem(name);
  return SAMPLE_FILES.map((f) => stem(f.file)).find((k) => s.includes(k)) ?? null;
}

const SUBJECT_HINTS: readonly [RegExp, string][] = [
  [/math|quad|algebra|equation/i, 'math-quad'],
  [/sst|social|history|nation|civics/i, 'sst-nation'],
  [/sci|bio|life|photo|resp/i, 'sci-life'],
];

export async function readPaper(bytes: Buffer, name: string): Promise<PaperReading> {
  const known = await identify(bytes, name);
  const setId = SAMPLE_FILES.find((f) => stem(f.file) === known)?.setId ?? SUBJECT_HINTS.find(([re]) => re.test(name))?.[1] ?? 'sci-life';
  const set = BANK.find((s) => s.id === setId) ?? (BANK[0] as BankSet);
  return { setId: set.id, title: set.title, subject: set.subject, questions: set.questions };
}

export async function readSheet(files: readonly { bytes: Buffer; name: string }[], setId: string | null, questionIds: readonly string[], fallbackIndex: number): Promise<SheetReading> {
  const pages: Transcript[] = [];
  let recognised = true;
  for (const f of files) {
    const known = await identify(f.bytes, f.name);
    const t = known ? TRANSCRIPTS[known] : undefined;
    if (t && t.setId === setId) pages.push(t.answers);
    else recognised = false;
  }
  if (pages.length === 0) {
    const stand = Object.values(TRANSCRIPTS).filter((t) => t.setId === setId);
    const pick = stand[fallbackIndex % Math.max(1, stand.length)];
    if (pick) pages.push(pick.answers);
  }
  const answers: StudentAnswer[] = questionIds.map((questionId) => ({
    questionId,
    text: pages.map((p) => p[questionId] ?? '').filter(Boolean).join('\n'),
  }));
  return { answers, recognised };
}
