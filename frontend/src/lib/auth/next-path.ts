export const NEXT_PARAM = 'next';

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || hasControlCharacter(raw)) return fallback;
  return raw;
}

export function withNext(path: string, next: string | null): string {
  if (!next || next === '/') return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}${new URLSearchParams({ [NEXT_PARAM]: next }).toString()}`;
}
