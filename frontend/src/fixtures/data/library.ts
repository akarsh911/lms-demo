import type { AssetRow, ContentItem, ContentPlacement, Curriculum, CurriculumNode } from '@/types/library';

import { seedId } from '../ids';
import { STAFF_PEOPLE } from './people';
import { CURRENT_SESSION, GRADE_LEVELS, subjectByCode } from './structure';

const MATHS_X = [
  'Real Numbers', 'Polynomials', 'Pair of Linear Equations in Two Variables', 'Quadratic Equations',
  'Arithmetic Progressions', 'Triangles', 'Coordinate Geometry', 'Introduction to Trigonometry',
  'Some Applications of Trigonometry', 'Circles', 'Areas Related to Circles', 'Surface Areas and Volumes',
  'Statistics', 'Probability',
];

const SCIENCE_X = [
  'Chemical Reactions and Equations', 'Acids, Bases and Salts', 'Metals and Non-metals', 'Carbon and its Compounds',
  'Life Processes', 'Control and Coordination', 'How do Organisms Reproduce?', 'Heredity',
  'Light: Reflection and Refraction', 'The Human Eye and the Colourful World', 'Electricity',
  'Magnetic Effects of Electric Current', 'Our Environment',
];

const SOCIAL_SCIENCE_X = [
  'The Rise of Nationalism in Europe', 'Nationalism in India', 'Resources and Development', 'Power-sharing', 'Federalism', 'Development',
];

const ENGLISH_X = [
  'A Letter to God', 'Nelson Mandela: Long Walk to Freedom', 'Two Stories about Flying', 'From the Diary of Anne Frank', 'Glimpses of India', 'Grammar and Writing',
];

const HINDI_X = [
  'Surdas ke Pad (सूरदास के पद)', 'Ram-Lakshman-Parshuram Samvad (राम-लक्ष्मण-परशुराम संवाद)', 'Netaji ka Chashma (नेताजी का चश्मा)',
  'Balgobin Bhagat (बालगोबिन भगत)', 'Lakhnavi Andaz (लखनवी अंदाज़)', 'Vyakaran (व्याकरण)',
];

const CHAPTER_TOPICS: Readonly<Record<string, readonly string[]>> = {
  'Metals and Non-metals': ['Physical properties', 'The reactivity series', 'Corrosion'],
  'Carbon and its Compounds': ['Covalent bonding', 'Homologous series', 'Ethanol and ethanoic acid'],
  'Life Processes': ['Modes of nutrition', 'Respiration', 'Transportation', 'Excretion'],
  'Control and Coordination': ['Nervous system', 'Hormones'],
  'How do Organisms Reproduce?': ['Asexual reproduction', 'Sexual reproduction in plants', 'Human reproduction'],
  Heredity: ['Inherited traits', 'Sex determination'],
  'Light: Reflection and Refraction': ['Spherical mirrors', 'Refraction and lenses'],
  'The Human Eye and the Colourful World': ['Defects of vision', 'Dispersion and scattering'],
  Electricity: ['Current and potential difference', "Ohm's law", 'Resistance and resistivity', 'Resistors in series and parallel', 'Heating effect and power'],
  'Magnetic Effects of Electric Current': ['Magnetic field lines', 'Motors and generators'],
  'Our Environment': ['Ecosystems and food chains', 'Ozone and waste'],
  'Pair of Linear Equations in Two Variables': ['Graphical method', 'Algebraic methods'],
  'Quadratic Equations': ['Standard form', 'Solving by factorisation', 'Completing the square and the formula', 'Nature of roots'],
  'Arithmetic Progressions': ['The nth term', 'Sum of n terms'],
  Triangles: ['Similarity criteria', 'Basic proportionality theorem'],
  'Coordinate Geometry': ['Distance formula', 'Section formula'],
  'Introduction to Trigonometry': ['Trigonometric ratios', 'Trigonometric identities'],
  'The Rise of Nationalism in Europe': ['The French Revolution and the idea of the nation', 'The making of Germany and Italy'],
  'Nationalism in India': ['The Non-Cooperation Movement', 'Civil Disobedience and the Salt March'],
  'Resources and Development': ['Types of resources', 'Land use and soil conservation'],
  'Power-sharing': ['Belgium and Sri Lanka', 'Forms of power-sharing'],
  Federalism: ['What makes India federal', 'Decentralisation and local government'],
  Development: ['Income and other goals', 'Comparing countries and states'],
  'A Letter to God': ['Lencho and the hailstorm', 'Faith and irony'],
  'Nelson Mandela: Long Walk to Freedom': ['The inauguration', 'Courage and freedom'],
  'Two Stories about Flying': ['His First Flight', 'The Black Aeroplane'],
  'From the Diary of Anne Frank': ['Diary writing', 'Mr Keesing and the essays'],
  'Glimpses of India': ['A Baker from Goa', 'Coorg', 'Tea from Assam'],
  'Grammar and Writing': ['Tenses and reported speech', 'Formal letter writing'],
  'Surdas ke Pad (सूरदास के पद)': ['Bhav: the meaning of the pads', "Gopiyon ka vyangya: the gopis' irony"],
  'Ram-Lakshman-Parshuram Samvad (राम-लक्ष्मण-परशुराम संवाद)': ['Samvad ka prasang: the context', 'Veer ras aur vyangya'],
  'Netaji ka Chashma (नेताजी का चश्मा)': ['Kahani ka kathya: the story', 'Deshbhakti ka bhav: patriotism'],
  'Balgobin Bhagat (बालगोबिन भगत)': ['Charitra-chitran: character sketch', 'Lekhak ki shaili: the style'],
  'Lakhnavi Andaz (लखनवी अंदाज़)': ['Vyangya: the satire', 'Patra aur parivesh: characters and setting'],
  'Vyakaran (व्याकरण)': ['Vachya: voice', 'Pad-parichay: parts of speech'],
};

const MINDMAP_TOPIC_IDS: Readonly<Record<string, string>> = {
  'Modes of nutrition': 'top_dev_modes_of_nutrition',
  Respiration: 'top_dev_respiration',
  Transportation: 'top_dev_transportation',
  Excretion: 'top_dev_excretion',
  'Nervous system': 'top_dev_nervous_system',
  Hormones: 'top_dev_hormones',
};

const OPENING_PARTS = 2;

const topicTitlesOf = (chapter: string, index: number): readonly string[] =>
  CHAPTER_TOPICS[chapter] ?? (index < OPENING_PARTS ? Array.from({ length: OPENING_PARTS }, (_, part) => `${chapter}, part ${part + 1}`) : []);

const gradeId = (n: number): string => GRADE_LEVELS.find((g) => g.sequence === n)?.id ?? '';

const PLAN: readonly { grade: number; codes: readonly string[] }[] = [
  { grade: 9, codes: ['MATH', 'SCI', 'SST', 'ENG', 'HIN'] },
  { grade: 10, codes: ['MATH', 'SCI', 'SST', 'ENG', 'HIN'] },
  { grade: 11, codes: ['MATH', 'PHY', 'CHE', 'BIO', 'ENG'] },
  { grade: 12, codes: ['MATH', 'PHY', 'CHE', 'BIO', 'ENG'] },
];

export const CURRICULA: Curriculum[] = PLAN.flatMap(({ grade, codes }) =>
  codes.map((code) => {
    const subject = subjectByCode(code);
    return {
      id: seedId('curriculum', grade, code),
      name: `${subject.name}, Class ${grade}`,
      code: `${code}-${grade}`,
      academic_session_id: CURRENT_SESSION.id,
      subject_id: subject.id,
      grade_level_id: gradeId(grade),
      board: 'CBSE',
      origin: 'adopted',
      status: 'active',
      created_at: '2026-03-01T00:00:00Z',
    };
  }),
);

const chaptersOf = (grade: number, code: string): string[] => {
  if (grade === 10 && code === 'MATH') return MATHS_X;
  if (grade === 10 && code === 'SCI') return SCIENCE_X;
  if (grade === 10 && code === 'SST') return SOCIAL_SCIENCE_X;
  if (grade === 10 && code === 'ENG') return ENGLISH_X;
  if (grade === 10 && code === 'HIN') return HINDI_X;
  return Array.from({ length: 6 }, (_, i) => `${subjectByCode(code).name}: chapter ${i + 1}`);
};

export const CURRICULUM_NODES: CurriculumNode[] = PLAN.flatMap(({ grade, codes }) =>
  codes.flatMap((code) => {
    const curriculum = seedId('curriculum', grade, code);
    return chaptersOf(grade, code).flatMap((title, i) => {
      const chapter: CurriculumNode = { id: seedId('node', curriculum, i), curriculum_id: curriculum, kind: 'chapter', title, sequence: i + 1, status: 'active' };
      const topics: CurriculumNode[] = topicTitlesOf(title, i).map((name, k) => ({
        id: MINDMAP_TOPIC_IDS[name] ?? seedId('node', curriculum, i, k + 1),
        curriculum_id: curriculum,
        parent_id: chapter.id,
        kind: 'topic',
        title: name,
        sequence: k + 1,
        status: 'active',
      }));
      return [chapter, ...topics];
    });
  }),
);

const ITEM_DEFS: readonly { title: string; kind: string; author: string; status: string; grade: number; code: string }[] = [
  { title: 'Mathematics Textbook, Class 10', kind: 'book', author: 'NCERT', status: 'published', grade: 10, code: 'MATH' },
  { title: 'Science Textbook, Class 10', kind: 'book', author: 'NCERT', status: 'published', grade: 10, code: 'SCI' },
  { title: 'Chemical Reactions, chapter notes', kind: 'note', author: 'S. Menon', status: 'published', grade: 10, code: 'SCI' },
  { title: 'Light: Reflection and Refraction, notes', kind: 'note', author: 'S. Menon', status: 'published', grade: 10, code: 'SCI' },
  { title: 'Quadratic Equations, worked examples', kind: 'document', author: 'R. Iyer', status: 'published', grade: 10, code: 'MATH' },
  { title: 'Half-yearly paper, Mathematics', kind: 'paper', author: 'Examinations office', status: 'published', grade: 10, code: 'MATH' },
  { title: 'Half-yearly paper, Science', kind: 'paper', author: 'Examinations office', status: 'draft', grade: 10, code: 'SCI' },
  { title: 'Trigonometry revision sheet', kind: 'document', author: 'R. Iyer', status: 'draft', grade: 10, code: 'MATH' },
  { title: 'Life Processes, chapter notes', kind: 'note', author: 'A. Das', status: 'published', grade: 10, code: 'SCI' },
  { title: 'Carbon and its Compounds, notes', kind: 'note', author: 'S. Menon', status: 'archived', grade: 10, code: 'SCI' },
  { title: 'Physics Textbook, Class 11', kind: 'book', author: 'NCERT', status: 'published', grade: 11, code: 'PHY' },
  { title: 'Chemistry Textbook, Class 11', kind: 'book', author: 'NCERT', status: 'published', grade: 11, code: 'CHE' },
  { title: 'Biology Textbook, Class 12', kind: 'book', author: 'NCERT', status: 'published', grade: 12, code: 'BIO' },
  { title: 'English Reader, Class 9', kind: 'book', author: 'NCERT', status: 'published', grade: 9, code: 'ENG' },
];

export const CONTENT_ITEMS: ContentItem[] = ITEM_DEFS.map((d, i) => ({
  id: seedId('content-item', i),
  kind: d.kind,
  title: d.title,
  author: d.author,
  subject_id: subjectByCode(d.code).id,
  grade_level_id: gradeId(d.grade),
  language: 'English',
  audience: i % 3 === 0 ? 'grade' : 'section',
  owner_person_id: STAFF_PEOPLE[i % STAFF_PEOPLE.length]?.id,
  status: d.status,
  ingest_mode: 'defer' as const,
  // The deployment has not switched retrieval indexing on, so nothing is indexed anywhere.
  index_status: 'none',
  asset_id: i % 2 === 0 ? seedId('asset', i) : undefined,
  created_at: '2026-06-01T00:00:00Z',
}));

export const ASSETS: AssetRow[] = CONTENT_ITEMS.filter((c) => c.asset_id).map((c) => ({
  id: c.asset_id ?? '',
  storage_key: `dev/${c.asset_id}`,
  file_name: `${(c.title ?? 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
  mime_type: 'application/pdf',
  size_bytes: 1_200_000,
  status: 'ready' as const,
  created_at: '2026-06-01T00:00:00Z',
}));

const itemId = (i: number): string => seedId('content-item', i);
const node = (grade: number, code: string, chapter: number): string => seedId('node', seedId('curriculum', grade, code), chapter);
const curriculum = (grade: number, code: string): string => seedId('curriculum', grade, code);

const placement = (key: string, grade: number, code: string, chapter: number, item: number, pages: [number, number]): ContentPlacement => ({
  id: seedId('placement', key),
  curriculum_id: curriculum(grade, code),
  curriculum_node_id: node(grade, code, chapter),
  content_item_id: itemId(item),
  grain: 'node',
  page_start: pages[0],
  page_end: pages[1],
  origin: 'manual',
  status: 'confirmed',
  created_at: '2026-06-02T00:00:00Z',
});

// Class 10 Maths chapter 0 is left unmapped; Science chapter 2 maps only to unreadable material.
export const PLACEMENTS: ContentPlacement[] = [
  placement('m1', 10, 'MATH', 1, 0, [12, 30]),
  placement('m3', 10, 'MATH', 3, 0, [60, 88]),
  placement('m3b', 10, 'MATH', 3, 4, [1, 6]),
  placement('m7', 10, 'MATH', 7, 7, [1, 4]),
  placement('s0', 10, 'SCI', 0, 1, [1, 22]),
  placement('s0b', 10, 'SCI', 0, 2, [1, 5]),
  placement('s2a', 10, 'SCI', 2, 6, [1, 8]),
  placement('s2b', 10, 'SCI', 2, 9, [1, 12]),
  placement('s2c', 10, 'SCI', 2, 7, [1, 3]),
  placement('s4', 10, 'SCI', 4, 8, [1, 10]),
  placement('s8', 10, 'SCI', 8, 3, [1, 9]),
];
