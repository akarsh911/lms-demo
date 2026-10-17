import type { BookletPage, Box, TextLine, Word } from '@/types/answer-checker';

export const PAGE_WIDTH = 1240;
export const PAGE_HEIGHT = 1754;

const TEXT_X = 150;
const FIRST_LINE_Y = 150;
const LINE_HEIGHT = 66;
const LINE_BOX_HEIGHT = 52;
const CHAR_WIDTH = 15;
const LAST_LINE_Y = 1650;
const WRAP_AT = 52;
const RULE_COLOUR = '#c7d7ef';
const INK = '#1b2a6b';
const HAND = "'Segoe Print', 'Comic Sans MS', 'Bradley Hand', cursive";

export interface WrittenLine {
  question: string;
  text: string;
  pointIndex: number | null;
}

export interface PlacedLine extends WrittenLine {
  page: number;
  line: TextLine;
  words: Word[];
}

export interface LaidOutBooklet {
  pages: BookletPage[];
  placed: PlacedLine[];
}

export function wrap(text: string): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (current && current.length + word.length + 1 > WRAP_AT) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}

function blankPage(index: number, role: BookletPage['role'], source: string): BookletPage {
  return { index, source_path: source, width: PAGE_WIDTH, height: PAGE_HEIGHT, role, lines: [], words: [] };
}

export function layOut(written: readonly WrittenLine[], source: (index: number) => string): LaidOutBooklet {
  const pages: BookletPage[] = [blankPage(0, 'cover', source(0)), blankPage(1, 'answer', source(1))];
  const placed: PlacedLine[] = [];
  let y = FIRST_LINE_Y;
  let previousQuestion: string | null = null;

  for (const entry of written) {
    if (previousQuestion !== null && entry.question !== previousQuestion) y += LINE_HEIGHT;
    previousQuestion = entry.question;
    if (y > LAST_LINE_Y) {
      pages.push(blankPage(pages.length, 'answer', source(pages.length)));
      y = FIRST_LINE_Y;
    }
    const page = pages[pages.length - 1];
    if (!page) continue;

    const box: Box = { x: TEXT_X, y: y - 40, w: Math.max(CHAR_WIDTH * 4, entry.text.length * CHAR_WIDTH), h: LINE_BOX_HEIGHT };
    const words: Word[] = [];
    let offset = 0;
    for (const token of entry.text.split(' ')) {
      words.push({
        index: page.words.length + words.length,
        box: { x: TEXT_X + offset * CHAR_WIDTH, y: box.y, w: token.length * CHAR_WIDTH, h: LINE_BOX_HEIGHT },
        line_index: page.lines.length,
        is_struck: false,
        is_scribbled: false,
      });
      offset += token.length + 1;
    }
    const line: TextLine = { index: page.lines.length, box, word_indices: words.map((word) => word.index), is_struck: false };
    page.lines.push(line);
    page.words.push(...words);
    placed.push({ ...entry, page: page.index, line, words });
    y += LINE_HEIGHT;
  }
  return { pages, placed };
}

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function svgPage(body: string, ruled: boolean): string {
  const rules = (ruled ? Array.from({ length: 24 }, (_, i) => FIRST_LINE_Y + 12 + i * LINE_HEIGHT)
    .map((y) => `<line x1="40" y1="${y}" x2="${PAGE_WIDTH - 40}" y2="${y}" stroke="${RULE_COLOUR}" stroke-width="2"/>`)
    .join('') : '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">` +
    `<rect width="100%" height="100%" fill="#fbfaf4"/>${rules}` +
    (ruled ? `<line x1="${TEXT_X - 24}" y1="0" x2="${TEXT_X - 24}" y2="${PAGE_HEIGHT}" stroke="#e8a3a3" stroke-width="2"/>` : '') +
    `${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function answerPageImage(page: BookletPage, placed: readonly PlacedLine[]): string {
  const ink = placed
    .filter((entry) => entry.page === page.index)
    .map((entry, index, rows) => {
      const first = rows[index - 1]?.question !== entry.question;
      const number = first
        ? `<text x="${TEXT_X - 90}" y="${entry.line.box.y + 40}" font-family="${HAND}" font-size="30" fill="${INK}">${escapeXml(entry.question)}.</text>`
        : '';
      return `${number}<text x="${TEXT_X}" y="${entry.line.box.y + 40}" font-family="${HAND}" font-size="27" fill="${INK}">${escapeXml(entry.text)}</text>`;
    })
    .join('');
  return svgPage(ink, true);
}

export function coverPageImage(fields: readonly (readonly [string, string])[]): string {
  const form = fields
    .map(([label, value], index) => {
      const y = 520 + index * 120;
      return (
        `<text x="160" y="${y}" font-family="Georgia, serif" font-size="30" fill="#333">${escapeXml(label)}</text>` +
        `<line x1="420" y1="${y + 10}" x2="1080" y2="${y + 10}" stroke="#555" stroke-width="2"/>` +
        `<text x="440" y="${y - 6}" font-family="${HAND}" font-size="38" fill="${INK}">${escapeXml(value)}</text>`
      );
    })
    .join('');
  const title =
    `<rect x="120" y="180" width="1000" height="200" fill="none" stroke="#333" stroke-width="3"/>` +
    `<text x="620" y="270" text-anchor="middle" font-family="Georgia, serif" font-size="52" fill="#222">ANSWER BOOKLET</text>` +
    `<text x="620" y="330" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#555">Write your name and roll number clearly</text>`;
  return svgPage(title + form, false);
}
