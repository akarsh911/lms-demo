import { bankFor, type QuestionBank } from '@/fixtures/data/question-banks';
import type { BankQuestion } from '@/fixtures/data/science-10-bank';
import type { PaperSection } from '@/types/papersetter';

import type { BlueprintShape } from '../contract';

export interface DrawnQuestion {
  n: number;
  marks: number;
  type: string;
  text: string;
  chapter: string;
  source: BankQuestion | null;
}

const STEMS: Record<string, readonly ((topic: string) => string)[]> = {
  mcq: [
    (topic) => `Which of the following statements about ${topic} is correct?`,
    (topic) => `Which term best describes the central idea of ${topic}?`,
    (topic) => `Which example is most closely linked to ${topic}?`,
    (topic) => `Which of these is NOT true of ${topic}?`,
  ],
  assertion_reason: [
    (topic) => `Assertion and reason: read both statements on ${topic} and choose the right option.`,
    (topic) => `Assertion and reason on ${topic}: decide whether the reason explains the assertion.`,
  ],
  true_false: [(topic) => `True or false: a statement about ${topic}. Give a reason.`],
  fill_blank: [(topic) => `Fill in the blank with the correct term from ${topic}.`],
  one_word: [(topic) => `Name the term described in ${topic}.`],
  very_short: [
    (topic) => `Define one key term from ${topic}.`,
    (topic) => `State one fact you learnt in ${topic} and why it matters.`,
    (topic) => `Give one everyday example of ${topic}.`,
  ],
  short: [
    (topic) => `Explain briefly, with an example, one idea from ${topic}.`,
    (topic) => `Compare two ideas from ${topic} under three headings.`,
    (topic) => `Describe the steps of one process from ${topic}.`,
  ],
  long: [
    (topic) => `Describe ${topic} in detail, with a labelled diagram where it helps.`,
    (topic) => `Explain the main ideas of ${topic} and how they connect, with examples.`,
  ],
  numerical: [
    (topic) => `Solve a numerical problem set on ${topic}, showing each step.`,
    (topic) => `Work out a value from the data given on ${topic}, with units.`,
  ],
  case_based: [(topic) => `Read the case on ${topic} and answer the questions that follow.`],
  differentiate: [(topic) => `Differentiate between two ideas from ${topic}.`],
};

const FALLBACK_STEMS = STEMS.short!;

const SUBSTITUTES: Readonly<Record<string, readonly string[]>> = {
  mcq: ['assertion_reason'],
  assertion_reason: ['mcq'],
  numerical: ['short', 'very_short', 'long', 'case_based'],
  very_short: ['numerical', 'short'],
  short: ['numerical', 'case_based', 'very_short'],
  long: ['numerical', 'case_based', 'short'],
  case_based: ['long', 'numerical', 'short'],
};

const chapterKey = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '');

const optionLetter = (index: number): string => String.fromCharCode(97 + index);

export const printedQuestion = (question: BankQuestion): string =>
  question.options ? `${question.text} ${question.options.map((option, index) => `(${optionLetter(index)}) ${option}`).join('  ')}` : question.text;

function focusScore(question: BankQuestion, focus: readonly string[]): number {
  const text = question.text.toLowerCase();
  return focus.filter((word) => text.includes(word)).length;
}

function focusWords(focus: readonly string[]): string[] {
  return focus
    .flatMap((phrase) => phrase.toLowerCase().split(/[^a-z0-9]+/))
    .filter((word) => word.length > 3);
}

class Drawer {
  private readonly used = new Set<BankQuestion>();
  private readonly templateTurns = new Map<string, number>();
  private readonly templated = new Set<string>();
  private readonly bank: ReadonlyMap<string, readonly BankQuestion[]>;
  private chapterTurn = 0;

  constructor(
    bank: QuestionBank | null,
    private readonly chapters: readonly string[],
    private readonly topics: readonly string[],
    private readonly focus: readonly string[],
  ) {
    this.bank = new Map(Object.entries(bank ?? {}).map(([chapter, questions]) => [chapterKey(chapter), questions]));
  }

  draw(type: string): { text: string; chapter: string; source: BankQuestion | null } {
    for (const candidate of [type, ...(SUBSTITUTES[type] ?? [])]) {
      const banked = this.fromBank(candidate);
      if (banked) return banked;
    }
    return this.fromTemplate(type);
  }

  private fromBank(type: string): { text: string; chapter: string; source: BankQuestion } | null {
    if (this.bank.size === 0 || this.chapters.length === 0) return null;
    for (let offset = 0; offset < this.chapters.length; offset += 1) {
      const chapter = this.chapters[(this.chapterTurn + offset) % this.chapters.length]!;
      const ranked = (this.bank.get(chapterKey(chapter)) ?? [])
        .filter((question) => question.type === type && !this.used.has(question))
        .sort((left, right) => focusScore(right, this.focus) - focusScore(left, this.focus));
      const found = ranked[0];
      if (found) {
        this.used.add(found);
        this.chapterTurn = (this.chapterTurn + offset + 1) % this.chapters.length;
        return { text: printedQuestion(found), chapter, source: found };
      }
    }
    return null;
  }

  private fromTemplate(type: string): { text: string; chapter: string; source: null } {
    const stems = STEMS[type] ?? FALLBACK_STEMS;
    const topicCount = Math.max(this.topics.length, 1);
    const variety = stems.length * topicCount;
    let turn = this.templateTurns.get(type) ?? 0;
    let text = '';
    for (let tries = 0; tries <= variety; tries += 1, turn += 1) {
      const topic = this.topics[turn % topicCount] ?? 'the chosen topics';
      const stem = stems[Math.floor(turn / topicCount) % stems.length] ?? FALLBACK_STEMS[0]!;
      const round = Math.floor(turn / variety);
      text = round > 0 ? `${stem(topic)} Use an example not used elsewhere on this paper.` : stem(topic);
      if (!this.templated.has(text)) break;
    }
    this.templateTurns.set(type, turn + 1);
    this.templated.add(text);
    return { text, chapter: this.chapters[turn % Math.max(this.chapters.length, 1)] ?? '', source: null };
  }
}

export interface DrawScope {
  subject: string;
  classLabel: string;
  chapters: readonly string[];
  topics: readonly string[];
  focus: readonly string[];
}

export function drawQuestions(blueprint: BlueprintShape, scope: DrawScope): { sections: PaperSection[]; drawn: DrawnQuestion[] } {
  const drawer = new Drawer(bankFor(scope.subject, scope.classLabel), scope.chapters, scope.topics, focusWords(scope.focus));
  const drawn: DrawnQuestion[] = [];
  const sections: PaperSection[] = (blueprint.sections ?? []).map((section) => ({
    title: `Section ${section.id} — ${section.title}`,
    questions: section.items.flatMap((item) =>
      Array.from({ length: item.count }, () => {
        const pick = drawer.draw(item.question_type);
        const question: DrawnQuestion = { n: drawn.length + 1, marks: item.marks, type: item.question_type, ...pick };
        drawn.push(question);
        return { n: question.n, text: question.text, marks: question.marks, type: question.type };
      }),
    ),
  }));
  return { sections, drawn };
}
