/**
 * Turning a retrieved passage's verbatim text into something readable.
 *
 * `verbatim_text` is exactly what the PDF extractor saw: the printed page's
 * hard line wraps, and a lone `n` wherever the book printed a bullet glyph from
 * a symbol font. Both are layout, not content. This removes them and nothing
 * else, so what a student reads is still the book's own words, and the
 * citation beside it still points at the page they came from.
 */
export function readableVerbatim(verbatim: string, pages: readonly (number | null)[] = []): string {
  const lines = verbatim
    .split('\n')
    .map((line) => line.trim())
    // A bullet glyph from a symbol font arrives as the letter n on its own line.
    .filter((line) => line !== '' && line !== 'n');

  const joined = dropRepeats(lines)
    .join(' ')
    // Rejoin words hyphenated across a line break: "conduc- tor" -> "conductor".
    .replace(/(\p{L})- (\p{Ll})/gu, '$1$2');

  const clean = stripRunningHead(stripPrintFurniture(joinLetterSpaced(joined)), pages);
  return collapsePhrases(clean).replace(/\s{2,}/g, ' ').trim();
}

/**
 * A heading set with wide letter-spacing is extracted one glyph at a time, so
 * NCERT's section rule arrives as "Q U E S T I O N S". Four or more single
 * capitals in a row is the signature; "I" and "A" alone never make one.
 */
function joinLetterSpaced(text: string): string {
  return text.replace(/\b(?:\p{Lu}\s+){3,}\p{Lu}\b/gu, (run) => run.replace(/\s+/gu, ''));
}

/**
 * The page number printed in the running head, which reaches the extractor
 * wedged between the chapter title and the first sentence: "Metals and
 * Non-metals 55 In which cases…".
 *
 * Only the pages this passage was actually cited from are removed, and only
 * where the number stands alone before a capital — so a quantity in the prose
 * ("55 mL of acid") is left exactly as the book set it.
 */
function stripRunningHead(text: string, pages: readonly (number | null)[]): string {
  let out = text;
  for (const page of pages) {
    if (page === null || !Number.isInteger(page)) continue;
    out = out.replace(new RegExp(`(?<![\\d.,'’\\u2013-])\\b${page}\\b(?=\\s+\\p{Lu})`, 'gu'), ' ');
  }
  return out;
}

/**
 * Printer's marks that are on the page but not in the book: the reprint stamp
 * NCERT carries in its running foot, and the running head's page number beside
 * the subject.
 */
function stripPrintFurniture(text: string): string {
  return text.replace(/\bReprint\s+\d{4}(?:[-–]\d{2,4})?\b/gi, ' ');
}

/**
 * Collapse a phrase that is immediately repeated: "Figure 11.6 Figure 11.6
 * Resistors in series" -> "Figure 11.6 Resistors in series".
 *
 * A figure caption is set twice on the page — once in the block and once in the
 * margin — and the extractor faithfully reports both. Two or more words are
 * required before a repeat counts, so genuine doubles ("had had") survive.
 */
function collapsePhrases(text: string): string {
  const repeated = /\b([\p{L}\p{N}][\p{L}\p{N}.,'’-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}.,'’-]*){1,7})\s+\1\b/giu;
  let out = text;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = out.replace(repeated, '$1');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Drop a line that simply repeats the one before it.
 *
 * A heading set in a display face is extracted once per glyph layer, so a
 * chapter section arrives as "2.3 How strong are acid or base solutions?" four
 * times over before its first sentence. It is the page's typography, not the
 * book's words.
 */
function dropRepeats(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const previous = out[out.length - 1];
    if (previous && normalise(previous) === normalise(line)) continue;
    // The same heading can also arrive concatenated onto one line.
    out.push(collapseSelfRepeat(line));
  }
  return out;
}

const normalise = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** "A? A? A? We know…" -> "A? We know…" */
function collapseSelfRepeat(line: string): string {
  const phrase = /^(.{12,80}?[?.!])\s*(?:\1\s*)+/i.exec(line);
  if (!phrase) return line;
  // Rebuilt rather than sliced: the match swallows the space after each repeat,
  // so an index computed from the lengths lands one character in.
  return `${phrase[1]!} ${line.slice(phrase[0].length)}`.trim();
}

/** The passage cut to a readable length at a sentence end where there is one. */
export function excerpt(text: string, maxChars = 420): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return stop > maxChars * 0.5 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}
