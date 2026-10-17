// Deterministic and UUID-shaped, so a fixture keeps its id across reloads and rows can reference each other.
export function seedId(...parts: readonly (string | number)[]): string {
  const text = parts.join(':');
  let hex = '';
  for (let round = 0; round < 4; round += 1) {
    let h = 0x811c9dc5 ^ (round * 0x9e3779b1);
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    hex += (h >>> 0).toString(16).padStart(8, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const newId = (): string => crypto.randomUUID();
