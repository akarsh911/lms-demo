const ANSWER_KEY_FIELDS: readonly string[] = [
  'answer',
  'answers',
  'answer_key',
  'answer_data',
  'answer_data_json',
  'correct_option',
  'correct_options',
  'solution',
  'marking_scheme',
];

export const ANSWER_KEY_IS_A_DEFECT =
  'This record arrived carrying answer data. A paper surface is not supposed ' +
  'to be given one, so it has not been drawn. Report it: the fields are named ' +
  'in the browser console.';

export function answerKeyFieldsIn(rows: readonly object[]): string[] {
  const found = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (ANSWER_KEY_FIELDS.includes(key.toLowerCase())) found.add(key);
    }
  }
  return [...found];
}

export function withoutAnswerKey<T extends object>(row: T): T {
  const kept = Object.entries(row).filter(
    ([key]) => !ANSWER_KEY_FIELDS.includes(key.toLowerCase()),
  );
  return Object.fromEntries(kept) as T;
}
