export function normalizeMotion(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function motionLength(text: string): number {
  return [...normalizeMotion(text)].length;
}

export function motionProblem(text: string, minChars: number, maxChars: number): string | null {
  const length = motionLength(text);
  if (length === 0) return 'Write the motion you want to debate.';
  if (length < minChars) return `Too short. A motion needs at least ${minChars} characters.`;
  if (length > maxChars) return `Too long. Keep it to ${maxChars} characters.`;
  return null;
}
