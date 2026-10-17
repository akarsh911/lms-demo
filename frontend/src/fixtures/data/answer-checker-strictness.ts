import type { CheckerHealth } from '@/types/answer-checker';

export const STRICTNESS_PROFILES: CheckerHealth['strictness'] = {
  easy: {
    label: 'Lenient',
    description: 'Marks the idea, not the execution. Suitable for a class test, a weak cohort, or a first attempt at a new topic.',
    levers: [
      { name: 'Spelling', value: 'ignored' },
      { name: 'Grammar', value: 'ignored' },
      { name: 'Key points', value: 'credited if the idea is present in any form' },
      { name: 'Partial credit', value: "rounded up in the student's favour" },
      { name: 'Numericals', value: 'a correct final answer carries the question' },
      { name: 'Units', value: 'not required' },
      { name: 'Word limit', value: 'not enforced' },
      { name: 'Choice questions', value: 'count the best attempts' },
      { name: 'Illegible writing', value: 'given the benefit of the doubt' },
      { name: 'Mechanics cap', value: 'at most 0% of a question may be lost to spelling, grammar, units and format' },
    ],
  },
  medium: {
    label: 'Balanced',
    description: 'How a fair board examiner marks. Content decides the marks; mechanics cost something only when they change the meaning.',
    levers: [
      { name: 'Spelling', value: 'marked only where the meaning changes' },
      { name: 'Grammar', value: 'marked only where the meaning changes' },
      { name: 'Key points', value: 'credited if the substance is there, whatever the wording' },
      { name: 'Partial credit', value: 'half marks where a point is partly made' },
      { name: 'Numericals', value: 'method marks itemised; working must be shown' },
      { name: 'Units', value: 'required' },
      { name: 'Word limit', value: 'not enforced' },
      { name: 'Choice questions', value: 'count the best attempts' },
      { name: 'Illegible writing', value: 'left unmarked and sent to you' },
      { name: 'Mechanics cap', value: 'at most 25% of a question may be lost to spelling, grammar, units and format' },
    ],
  },
  strict: {
    label: 'Strict',
    description:
      'Board-exam severity. The terminology in the key is required, working must be shown, format instructions are enforced, and only the first N attempts of a choice question are read.',
    levers: [
      { name: 'Spelling', value: '0.5 mark deducted per error' },
      { name: 'Grammar', value: '0.5 mark deducted per error' },
      { name: 'Key points', value: 'the term named in the key is required' },
      { name: 'Partial credit', value: 'only points explicitly present are awarded' },
      { name: 'Numericals', value: 'method marks itemised; working must be shown' },
      { name: 'Units', value: 'required' },
      { name: 'Word limit', value: 'enforced with 15% tolerance, 0.5 mark penalty' },
      { name: 'Choice questions', value: 'count the first attempts' },
      { name: 'Illegible writing', value: 'no marks, and flagged' },
      { name: 'Mechanics cap', value: 'at most 35% of a question may be lost to spelling, grammar, units and format' },
    ],
  },
};
