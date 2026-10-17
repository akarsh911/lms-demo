import type {
  AnswerEvaluation,
  AnswerVerdict,
  CardStyle,
  CatalogResponse,
  DeckAttempt,
  DeckReport,
  DeckRetrievalPlan,
  DocumentPageText,
  Flashcard,
  FlashcardDeck,
  GenerateFromRetrievalRequest,
  ReportTopic,
  RevisionStyle,
} from '@/types/flashcards';

import { CHEMICAL_REACTIONS } from './data/mindmap-chemical-reactions';
import { CONTROL_AND_COORDINATION } from './data/mindmap-control';
import { LIGHT } from './data/mindmap-light';
import type { AtomCode, ChapterSeed } from './data/mindmap-seed';
import { fail } from './rows';

const DOC = 'doc_dev_science_10';
const DOC_TITLE = 'NCERT Science, Class 10';
const LIFE_PROCESSES = 'sec_dev_life_processes';
const CONTROL = 'sec_dev_control';
const LIGHT_CHAPTER = 'sec_dev_light';
const REACTIONS_CHAPTER = 'sec_dev_chemical_reactions';

const DEFAULT_COUNT = 12;
const PARAGRAPH_BREAK = '\n';
const MIN_TOP_K = 8;
const MAX_TOP_K = 60;
const PASSAGES_PER_CARD = 2;
const MIN_CARDS_FOR_A_CLAIM = 2;
const NEEDS_PRACTICE_BELOW = 0.6;
const MAX_LISTED = 4;

interface Passage {
  page: number;
  sourceRole: 'definition' | 'explanation' | 'worked_example';
  style: CardStyle;
  front: string;
  back: string;
  examined: boolean;
  before: string;
  after: string;
  topic?: string;
}

interface Chapter {
  id: string;
  title: string;
  passages: Passage[];
}

const NERVOUS_SYSTEM = 'Nervous system';
const HORMONES = 'Hormones';
const REFRACTION_AND_LENSES = 'Refraction and lenses';

type CardPick = readonly [mapTopic: string, concepts: readonly string[], cardTopic?: string];

interface DerivedChapter {
  id: string;
  title: string;
  seed: ChapterSeed;
  picks: readonly CardPick[];
}

const STYLE_OF: Readonly<Record<AtomCode, CardStyle>> = {
  d: 'definition',
  p: 'process',
  c: 'concept',
  x: 'compare',
  e: 'cause_effect',
  a: 'application',
  g: 'concept',
  f: 'formula',
  l: 'concept',
  n: 'recall',
  w: 'application',
};

const keepsCapital = (label: string): boolean => /^[A-Z]{2}|^\S+'s\b/.test(label);
const phrase = (label: string): string => (keepsCapital(label) ? label : label.charAt(0).toLowerCase() + label.slice(1));

const QUESTION: Readonly<Record<AtomCode, (label: string) => string>> = {
  d: (label) => `What is meant by ${phrase(label)}?`,
  p: (label) => `Describe ${phrase(label)}.`,
  c: (label) => `How is ${phrase(label)} classified?`,
  x: (label) => `Explain the comparison in ${phrase(label)}.`,
  e: (label) => `Explain ${phrase(label)}: what causes it and what follows?`,
  a: (label) => `What does ${phrase(label)} show in real life?`,
  g: (label) => `What does the figure of ${phrase(label)} show?`,
  f: (label) => `Write ${phrase(label)}.`,
  l: (label) => `State ${phrase(label)}.`,
  n: (label) => `What value does the book give for ${phrase(label)}?`,
  w: (label) => `Work through ${phrase(label)}.`,
};

function passagesOf(chapter: DerivedChapter): Passage[] {
  return chapter.picks.flatMap(([mapTopic, concepts, cardTopic]) => {
    const topic = chapter.seed.topics.find((t) => t.label === mapTopic);
    if (!topic) return [];
    const atoms = topic.subs.flatMap((sub) => sub.atoms);
    return concepts.flatMap((label) => {
      const at = atoms.findIndex((atom) => atom.label === label);
      const atom = atoms[at];
      if (!atom) return [];
      return [
        {
          page: topic.page,
          sourceRole: atom.code === 'd' ? 'definition' : atom.code === 'w' ? 'worked_example' : 'explanation',
          style: STYLE_OF[atom.code],
          front: QUESTION[atom.code](atom.label),
          back: atom.text,
          examined: (atom.extras.pyq?.length ?? 0) > 0,
          before: atoms[at - 1]?.text ?? '',
          after: atoms[at + 1]?.text ?? '',
          topic: cardTopic ?? mapTopic,
        } satisfies Passage,
      ];
    });
  });
}

const DERIVED: readonly DerivedChapter[] = [
  {
    id: LIGHT_CHAPTER,
    title: '10. Light: Reflection and Refraction',
    seed: LIGHT,
    picks: [
      ['Reflection of light', ['Laws of reflection', 'Reflection']],
      ['Spherical mirrors', ['Concave mirror', 'Convex mirror']],
      ['Mirror formula and magnification', ['Mirror formula', 'Magnification']],
      ['Refraction of light', ['Refraction', 'Bending towards normal'], REFRACTION_AND_LENSES],
      ['Refractive index', ['Refractive index', 'Optical density'], REFRACTION_AND_LENSES],
      ['Power of a lens', ['Power of a lens', 'Dioptre'], REFRACTION_AND_LENSES],
    ],
  },
  {
    id: REACTIONS_CHAPTER,
    title: '1. Chemical Reactions and Equations',
    seed: CHEMICAL_REACTIONS,
    picks: [
      ['Balancing equations', ['Law of conservation of mass', 'Balanced equation']],
      ['Combination reaction', ['Combination reaction', 'Quicklime and water']],
      ['Decomposition reaction', ['Decomposition reaction', 'Electrolysis of water']],
      ['Displacement reaction', ['Displacement reaction', 'Iron nail in copper sulphate']],
      ['Oxidation and reduction', ['Oxidation', 'Redox reaction']],
      ['Corrosion', ['Corrosion', 'Silver tarnish']],
    ],
  },
];

const CONTROL_PICKS: readonly CardPick[] = [
  ['Nervous system', ['Neuron', 'Reflex arc'], NERVOUS_SYSTEM],
  ['Human brain', ['Forebrain'], NERVOUS_SYSTEM],
  ['Parts of the hindbrain', ['Cerebellum'], NERVOUS_SYSTEM],
  ['Hormones', ['Insulin', 'Adrenaline'], HORMONES],
  ['Tropic movements', ['Phototropism'], HORMONES],
  ['Feedback mechanism', ['Feedback mechanism'], HORMONES],
];

const CONTROL_DERIVED: DerivedChapter = {
  id: CONTROL,
  title: '7. Control and Coordination',
  seed: CONTROL_AND_COORDINATION,
  picks: CONTROL_PICKS,
};

const CHAPTERS: readonly Chapter[] = [
  {
    id: LIFE_PROCESSES,
    title: '6. Life Processes',
    passages: [
      {
        page: 93,
        sourceRole: 'definition',
        style: 'definition',
        front: 'What is nutrition?',
        back: 'Nutrition is the process by which an organism takes in food and uses it to obtain energy and materials for growth and repair.',
        before:
          'We have seen that living organisms need energy to maintain their structures and carry out life processes. The energy they need comes from outside the body.',
        after:
          'Different organisms obtain their food in different ways, and so there are different modes of nutrition. In this section we look at how plants and animals meet this need.',
        examined: false,
      },
      {
        page: 94,
        sourceRole: 'definition',
        style: 'definition',
        front: 'What is autotrophic nutrition?',
        back: 'Autotrophic nutrition is the mode of nutrition in which organisms make their own food from simple inorganic substances such as carbon dioxide and water.',
        before:
          'Carbon and energy requirements of the autotrophic organism are fulfilled by photosynthesis. Green plants and some bacteria are autotrophs.',
        after:
          'They use the food they make to build the materials their bodies need. Heterotrophs, in contrast, depend directly or indirectly on these autotrophs for their survival.',
        examined: true,
      },
      {
        page: 95,
        sourceRole: 'explanation',
        style: 'process',
        front: 'What happens in the chloroplasts during photosynthesis?',
        back: 'Chlorophyll absorbs light energy and converts it to chemical energy, and water is split into hydrogen and oxygen.',
        before:
          'Let us now see what actually happens during the process of photosynthesis. The following events occur as part of this process.',
        after:
          'Carbon dioxide is then reduced to carbohydrates. These steps need not take place one after the other immediately; desert plants, for example, take up carbon dioxide at night.',
        examined: true,
      },
      {
        page: 96,
        sourceRole: 'explanation',
        style: 'concept',
        front: 'Why do leaves have stomata?',
        back: 'Stomata are tiny pores through which gaseous exchange takes place; guard cells open and close them to control water loss.',
        before:
          'Let us see how the other raw material, carbon dioxide, is obtained by plants. If we look at a leaf under the microscope we find many small openings on its surface.',
        after:
          'Since large amounts of water can also be lost through these pores, the plant closes them when it does not need carbon dioxide for photosynthesis.',
        examined: false,
      },
      {
        page: 100,
        sourceRole: 'definition',
        style: 'recall',
        front: 'In what form do cells store the energy released by respiration?',
        back: 'The energy released by breaking down glucose is stored as ATP.',
        before:
          'The food material taken in during nutrition is used in cells to provide energy for various life processes. Diverse organisms do this in different ways.',
        after:
          'ATP is the energy currency for most cellular processes. The energy released during respiration is used to make an ATP molecule from ADP and inorganic phosphate.',
        examined: false,
      },
      {
        page: 101,
        sourceRole: 'explanation',
        style: 'cause_effect',
        front: 'What does yeast produce when it respires without oxygen?',
        back: 'Anaerobic respiration in yeast breaks pyruvate down into ethanol and carbon dioxide.',
        before:
          'The first step is the break-down of glucose, a six-carbon molecule, into a three-carbon molecule called pyruvate. This process takes place in the cytoplasm.',
        after:
          'This process takes place during fermentation. The breakdown of pyruvate using oxygen, in contrast, happens in the mitochondria and releases far more energy.',
        examined: true,
      },
      {
        page: 106,
        sourceRole: 'definition',
        style: 'definition',
        front: 'What is the nephron?',
        back: "The nephron is the basic filtering unit of the kidney, a cluster of thin-walled capillaries called the glomerulus inside Bowman's capsule.",
        before:
          'The excretory system of human beings includes a pair of kidneys, a pair of ureters, a urinary bladder and a urethra. Urine produced in the kidneys passes through the ureters.',
        after:
          'Some substances in the initial filtrate, such as glucose, amino acids, salts and a major amount of water, are selectively reabsorbed as the urine flows along the tube.',
        examined: false,
      },
      {
        page: 107,
        sourceRole: 'worked_example',
        style: 'application',
        front: 'A patient’s kidneys have stopped filtering blood. How is the waste removed?',
        back: 'By dialysis: an artificial kidney filters nitrogenous waste out of the blood, which is then returned to the body.',
        before:
          'Kidneys are vital organs for survival. Several factors such as infections, injury or restricted blood flow reduce the activity of the kidneys and lead to accumulation of poisonous wastes.',
        after:
          'Dialysis works in the same way as the kidney, except that there is no reabsorption involved. Kidney transplants are another option when the kidneys fail completely.',
        examined: false,
      },
    ],
  },
  {
    id: CONTROL,
    title: '7. Control and Coordination',
    passages: [
      {
        page: 114,
        sourceRole: 'definition',
        style: 'definition',
        topic: NERVOUS_SYSTEM,
        front: 'What is a reflex action?',
        back: 'A reflex action is a sudden response to a stimulus that happens without conscious thought, controlled by the spinal cord.',
        before:
          'We have all had the experience of touching a hot object and jerking our hand away without thinking about it. How do we detect the heat and respond to it?',
        after:
          'Reflex arcs have evolved in animals because the thinking process of the brain is not fast enough. Many animals have very little or none of the complex neuron network needed for thinking.',
        examined: true,
      },
      {
        page: 115,
        sourceRole: 'definition',
        style: 'definition',
        topic: NERVOUS_SYSTEM,
        front: 'What is a synapse?',
        back: 'A synapse is the gap between the nerve ending of one neuron and the dendrite of the next, across which a chemical signal travels.',
        before:
          'Information acquired at the end of the dendritic tip of a nerve cell sets off a chemical reaction that creates an electrical impulse. This impulse travels to the end of the axon.',
        after:
          'A similar synapse allows delivery of such impulses from neurons to other cells, such as muscle cells or glands. Nervous tissue is made up of an organised network of these neurons.',
        examined: false,
      },
      {
        page: 118,
        sourceRole: 'explanation',
        style: 'cause_effect',
        topic: HORMONES,
        front: 'Why does a shoot bend towards light?',
        back: 'Auxin, made at the shoot tip, diffuses to the shaded side and makes those cells grow longer, so the shoot bends towards light.',
        before:
          'Plants detect light and respond to it slowly by growing in a particular direction. When growing plants detect light, a hormone is synthesised at the shoot tip.',
        after:
          'This is an example of chemical coordination in plants. Gibberellins also help in the growth of the stem, while cytokinins promote cell division.',
        examined: true,
      },
      ...passagesOf(CONTROL_DERIVED),
    ],
  },
  ...DERIVED.map((chapter) => ({ id: chapter.id, title: chapter.title, passages: passagesOf(chapter) })),
];

export const catalog: CatalogResponse = {
  subjects: [
    {
      subject: 'Science',
      chapters: CHAPTERS.map((c) => ({
        id: c.id,
        title: c.title,
        document_id: DOC,
        document_title: DOC_TITLE,
        source_type: 'book',
        grade: 10,
        cards_available: c.passages.length,
      })),
    },
  ],
};

const STYLES_FOR: Record<RevisionStyle, CardStyle[]> = {
  mixed: [],
  conceptual: ['concept', 'reasoning', 'cause_effect'],
  definitions: ['definition', 'recall'],
  formulas: ['formula', 'application'],
  application: ['application', 'process', 'compare'],
  exam: ['exam', 'application', 'recall'],
};

const deckStore = globalThis as unknown as { __emergeFlashcardDecks?: Map<string, FlashcardDeck> };
const decks: Map<string, FlashcardDeck> = (deckStore.__emergeFlashcardDecks ??= new Map());

const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

const STOPWORDS = new Set(
  'the a an and or of in on to is are was be by as it its for from with into that this which their such then'.split(' '),
);

const conceptWords = (text: string): string[] =>
  [...new Set(words(text))].filter((w) => w.length > 2 && !STOPWORDS.has(w));

const engineError = (status: number, error: string, detail: string): never =>
  fail(status, error, detail, { error, detail });

function chapterOf(chapter: string | undefined): Chapter {
  const found = CHAPTERS.find((c) => c.id === chapter || c.title === chapter);
  return found ?? engineError(404, 'no_grounded_source', 'retrieval returned no passages for this selection');
}

function planFor(request: GenerateFromRetrievalRequest, count: number): DeckRetrievalPlan {
  const { spec, locator } = request;
  const rationale: string[] = [];
  const sourceTypes = ['book', 'workbook'];
  if (spec.use_notes) {
    sourceTypes.push('notes');
    rationale.push('Included your class notes, so cards reflect what was actually taught.');
  }
  const wantsPyq = Boolean(spec.use_pyq) || spec.focus === 'important';
  if (wantsPyq) {
    rationale.push(
      'Looked at previous-year questions to find what is actually examined — the cards are still written from the book, not copied from the paper.',
    );
  }

  const documentId = locator.document_id ?? null;
  const sectionIds = spec.chapter?.startsWith('sec_') ? [spec.chapter] : [];
  const topK = Math.max(MIN_TOP_K, Math.min(MAX_TOP_K, count * PASSAGES_PER_CARD));
  let mode: DeckRetrievalPlan['mode'];
  let query: string | null = null;
  if (spec.topic) {
    mode = 'SEARCH';
    query = spec.topic;
    rationale.push(`Searched within the chapter for “${spec.topic}”.`);
  } else if (documentId || locator.concept_ids?.length) {
    mode = 'FETCH';
    rationale.push('Took the chapter in order rather than searching, because no topic was named.');
  } else {
    mode = 'SEARCH';
    query = spec.chapter ?? spec.subject ?? 'key ideas';
    rationale.push('Searched the chapter by name, because no single document was specified.');
  }
  if (spec.focus === 'important') {
    rationale.push('Prioritised the parts of the chapter that past papers examine.');
  }

  return {
    mode,
    document_id: documentId,
    section_ids: sectionIds,
    query,
    source_types: sourceTypes,
    concept_ids: locator.concept_ids ?? [],
    top_k: topK,
    rationale,
  };
}

const sameTopic = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function matchesTopic(passage: Passage, topic: string | undefined): boolean {
  if (!topic) return true;
  if (passage.topic && sameTopic(passage.topic, topic)) return true;
  const text = new Set(words(`${passage.front} ${passage.back}`));
  return conceptWords(topic).some((w) => text.has(w));
}

function rankFor(style: RevisionStyle | undefined, focusImportant: boolean) {
  const preferred = STYLES_FOR[style ?? 'mixed'];
  return (p: Passage): number =>
    (preferred.length > 0 && !preferred.includes(p.style) ? 2 : 0) + (focusImportant && !p.examined ? 1 : 0);
}

export function buildDeck(request: GenerateFromRetrievalRequest): FlashcardDeck {
  const { spec } = request;
  const requested = spec.count ?? DEFAULT_COUNT;
  const chapter = chapterOf(spec.chapter);
  const focusImportant = spec.focus === 'important';
  const wantsPyq = Boolean(spec.use_pyq) || focusImportant;
  const rank = rankFor(spec.revision_style, focusImportant);

  const pool = chapter.passages.filter((p) => matchesTopic(p, spec.topic));
  if (pool.length === 0) {
    engineError(404, 'no_grounded_source', 'retrieval returned no passages for this selection');
  }
  const chosen = [...pool].sort((a, b) => rank(a) - rank(b)).slice(0, requested);

  const cards: Flashcard[] = chosen.map((p, i) => {
    const examined = wantsPyq && p.examined;
    const chunkId = `${DOC}::${chapter.id}::c${chapter.passages.indexOf(p)}`;
    return {
      id: `card_${i + 1}`,
      style: p.style,
      difficulty: 'medium',
      front: p.front,
      back: p.back,
      explanation: null,
      hint: null,
      citations: [
        {
          document_title: DOC_TITLE,
          document_id: DOC,
          chunk_id: chunkId,
          page_range: [p.page, p.page],
          paragraph_range: null,
          time_range: null,
          render: null,
          confidence: 1,
          support_score: 0.91,
        },
      ],
      visual: null,
      figure_refs: [],
      subject: spec.subject ?? null,
      chapter: spec.chapter ?? null,
      section_id: chapter.id,
      topic: spec.topic ?? p.topic ?? null,
      importance: examined ? 'high' : p.sourceRole === 'definition' ? 'medium' : 'normal',
      source_role: p.sourceRole,
      source_excerpt: p.back,
      pyq_backed: examined,
      concept_ids: [],
    };
  });

  const styleCounts: Record<string, number> = {};
  for (const card of cards) styleCounts[card.style] = (styleCounts[card.style] ?? 0) + 1;

  const deck: FlashcardDeck = {
    id: `fc_dev_${(decks.size + 1).toString(16).padStart(6, '0')}`,
    title: spec.title ?? 'Flashcard Deck',
    subject: spec.subject ?? null,
    grade: spec.grade ?? null,
    language: spec.language ?? 'en',
    total_cards: cards.length,
    requested_cards: requested,
    chapter: spec.chapter ?? null,
    topic: spec.topic ?? null,
    style_counts: styleCounts,
    generator: 'dev-fixture',
    grounding: {
      checked: cards.length,
      dropped: 0,
      avg_support: 0.91,
      no_good_match: false,
      retrieval_confidence: 0.88,
      passages_used: pool.length,
      passages_dropped_ungroundable: 0,
      dropped_quality: 0,
    },
    retrieval: planFor(request, requested),
    cards,
    warnings:
      cards.length < requested
        ? [`requested ${requested} card(s), produced ${cards.length} (insufficient grounded source)`]
        : [],
    timing_ms: { total: 2.1, retrieval: 38.4 },
  };
  decks.set(deck.id, deck);
  return deck;
}

export function deckById(deckId: string): FlashcardDeck {
  return decks.get(deckId) ?? fail(404, 'not_found', 'unknown deck', { detail: 'unknown deck' });
}

function cardOf(deck: FlashcardDeck, cardId: string): Flashcard {
  return deck.cards.find((c) => c.id === cardId) ?? fail(404, 'not_found', 'unknown card', { detail: 'unknown card' });
}

const LEXICAL_CORRECT_AT = 0.75;
const JUDGE_CORRECT_AT = 0.5;
const JUDGE_ALMOST_AT = 0.25;

function verdictFor(answer: string, lexical: number, lexicalOnly: boolean): AnswerVerdict {
  if (answer.trim().length === 0) return 'needs_review';
  if (lexicalOnly) return lexical >= LEXICAL_CORRECT_AT ? 'correct' : 'needs_review';
  if (lexical >= JUDGE_CORRECT_AT) return 'correct';
  if (lexical >= JUDGE_ALMOST_AT) return 'almost';
  return 'incorrect';
}

function feedbackFor(verdict: AnswerVerdict, missing: string[]): string {
  if (verdict === 'correct') return 'That covers it.';
  if (missing.length === 0) return 'Worth another look — compare what you wrote with the answer.';
  return `Compare your answer with the card — it also mentions: ${missing.join(', ')}.`;
}

export function evaluateAnswer(deckId: string, cardId: string, answer: string): AnswerEvaluation {
  const deck = deckById(deckId);
  const card = cardOf(deck, cardId);
  const expected = conceptWords(card.back);
  const given = new Set(words(answer));
  const matched = expected.filter((w) => given.has(w));
  const missing = expected.filter((w) => !given.has(w));
  const lexical = expected.length === 0 ? 0 : Math.round((matched.length / expected.length) * 10000) / 10000;
  const lexicalOnly = Number(cardId.replace(/\D/g, '')) % 3 === 0;
  const verdict = verdictFor(answer, lexical, lexicalOnly);

  return {
    verdict,
    score: lexical,
    lexical_score: lexical,
    answer,
    expected: card.back,
    matched_concepts: matched,
    missing_concepts: missing,
    incorrect_claims: [],
    feedback: feedbackFor(verdict, missing.slice(0, 4)),
    judged_by: answer.trim().length === 0 ? 'none' : lexicalOnly ? 'lexical' : 'gemini',
    review_recommended: verdict !== 'correct',
    card_id: cardId,
    deck_id: deckId,
    timing_ms: { evaluate: 0.4 },
  };
}

const labelFor = (card: Flashcard): string => card.topic || card.chapter || card.concept_ids[0] || 'This chapter';

function standings(deck: FlashcardDeck, results: Map<string, AnswerVerdict>): ReportTopic[] {
  const byLabel = new Map<string, ReportTopic>();
  for (const card of deck.cards) {
    const verdict = results.get(card.id);
    if (!verdict) continue;
    const label = labelFor(card);
    const standing = byLabel.get(label) ?? { label, cards: 0, correct: 0 };
    standing.cards += 1;
    if (verdict === 'correct') standing.correct += 1;
    byLabel.set(label, standing);
  }
  return [...byLabel.values()];
}

function biggestMistake(deck: FlashcardDeck, results: Map<string, AnswerVerdict>): string | null {
  const attempted = deck.cards.filter((c) => results.has(c.id));
  const missed = attempted.filter((c) => results.get(c.id) !== 'correct');
  if (missed.length < MIN_CARDS_FOR_A_CLAIM || attempted.length === 0) return null;

  const share = (pred: (c: Flashcard) => boolean): [number, number] => {
    const sel = attempted.filter(pred);
    return [sel.length, sel.filter((c) => results.get(c.id) === 'correct').length];
  };
  const [recallN, recallOk] = share((c) => c.style === 'definition' || c.style === 'recall');
  const [appliedN, appliedOk] = share((c) => ['application', 'process', 'reasoning', 'exam'].includes(c.style));
  if (recallN >= MIN_CARDS_FOR_A_CLAIM && appliedN >= MIN_CARDS_FOR_A_CLAIM) {
    if (recallOk / recallN - appliedOk / appliedN >= 0.34) {
      return 'You recalled the facts well but slipped when you had to apply them — practise the worked examples rather than re-reading the definitions.';
    }
    if (appliedOk / appliedN - recallOk / recallN >= 0.34) {
      return 'You reasoned well but the exact definitions did not stick — those are the quickest marks to secure.';
    }
  }
  const [pyqN, pyqOk] = share((c) => c.pyq_backed);
  if (pyqN >= MIN_CARDS_FOR_A_CLAIM && pyqOk / pyqN <= 0.5) {
    return 'The cards you missed are the ones previous-year papers examine most — worth going back to first.';
  }
  return null;
}

function recommendationFor(
  deck: FlashcardDeck,
  results: Map<string, AnswerVerdict>,
  weak: ReportTopic[],
  retry: string[],
  unanswered: string[],
): string {
  if (results.size === 0) return 'Answer a few cards and the report will show what to revise.';
  if (unanswered.length > 0 && weak.length === 0 && retry.length === 0) {
    return `Everything you answered was right — ${unanswered.length} card${unanswered.length === 1 ? '' : 's'} still to go.`;
  }
  if (weak.length > 0) {
    return `Revise ${weak.slice(0, MAX_LISTED).map((s) => s.label).join(', ')}, then retry ${cardsText(retry.length)} you missed.`;
  }
  if (retry.length > 0) return `Close — retry ${cardsText(retry.length)} you did not get fully right.`;
  const examined = deck.cards.some((c) => results.has(c.id) && c.importance === 'high');
  return examined
    ? 'You have this chapter — including the parts past papers examine.'
    : 'You have this chapter. Try a harder deck next.';
}

function cardsText(count: number): string {
  return count === 1 ? 'the card' : `the ${count} cards`;
}

export function buildReport(deckId: string, attempts: DeckAttempt[]): DeckReport {
  const deck = deckById(deckId);
  const known = new Set(deck.cards.map((c) => c.id));
  const results = new Map(attempts.filter((a) => known.has(a.card_id)).map((a) => [a.card_id, a.verdict]));
  const given = new Map(attempts.filter((a) => known.has(a.card_id)).map((a) => [a.card_id, a.answer ?? '']));
  const count = (v: AnswerVerdict) => [...results.values()].filter((r) => r === v).length;
  const attempted = results.size;
  const correct = count('correct');

  const claimable = standings(deck, results).filter((s) => s.cards >= MIN_CARDS_FOR_A_CLAIM);
  const strong = claimable.filter((s) => s.correct === s.cards).sort((a, b) => b.cards - a.cards);
  const weak = claimable
    .filter((s) => s.correct !== s.cards && s.correct / s.cards < NEEDS_PRACTICE_BELOW)
    .sort((a, b) => a.correct / a.cards - b.correct / b.cards || b.cards - a.cards);

  const retry = [
    ...deck.cards.filter((c) => ['incorrect', 'almost'].includes(results.get(c.id) ?? '')).map((c) => c.id),
    ...deck.cards.filter((c) => results.get(c.id) === 'needs_review').map((c) => c.id),
  ];
  const unanswered = deck.cards.filter((c) => !results.has(c.id)).map((c) => c.id);

  return {
    deck_id: deck.id,
    title: deck.title,
    attempted,
    correct,
    almost: count('almost'),
    incorrect: count('incorrect'),
    needs_review: count('needs_review'),
    accuracy: attempted ? Math.round((correct / attempted) * 10000) / 10000 : 0,
    strong: strong.slice(0, MAX_LISTED),
    needs_practice: weak.slice(0, MAX_LISTED),
    biggest_mistake: biggestMistake(deck, results),
    recommendation: recommendationFor(deck, results, weak, retry, unanswered),
    retry_card_ids: retry,
    unanswered: unanswered.length,
    unanswered_card_ids: unanswered,
    answers: deck.cards.map((c) => ({
      card_id: c.id,
      question: c.front,
      your_answer: given.get(c.id) ?? '',
      correct_answer: c.back,
      verdict: results.get(c.id) ?? null,
      attempted: results.has(c.id),
    })),
  };
}

export function sourcePage(documentId: string, page: number): DocumentPageText {
  const onPage = CHAPTERS.flatMap((c) => c.passages).filter((p) => p.page === page);
  if (documentId !== DOC || onPage.length === 0) {
    fail(404, 'not_found', `document ${documentId} has no blocks on page ${page}`, {
      detail: `document ${documentId} has no blocks on page ${page}`,
    });
  }
  const paragraphs = onPage.map((p) => `${p.before} ${p.back} ${p.after}`);
  return {
    document_id: DOC,
    title: DOC_TITLE,
    page,
    text: paragraphs.join(PARAGRAPH_BREAK),
    blocks: paragraphs.length * 3,
    extraction_sources: ['pdf'],
    excluded_blocks: 0,
    allowed_extraction_sources: ['ocr', 'pdf'],
  };
}
