import { effectiveAnnotations } from '@/lib/answer-checker/marks';
import type { Annotation, AnnotationColour } from '@/types/answer-checker';

import * as checker from './answer-checker';

const INK: Record<AnnotationColour, string> = { red: '#c62828', green: '#2e7d32', blue: '#1565c0', amber: '#ef6c00' };
const SVG_PREFIX = 'data:image/svg+xml;charset=utf-8,';

const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tick(x: number, y: number, size: number): string {
  return `M ${x} ${y + size * 0.55} L ${x + size * 0.35} ${y + size * 0.9} L ${x + size * 0.9} ${y + size * 0.1}`;
}

function shape(annotation: Annotation): string {
  const box = annotation.target.box;
  if (!box) return '';
  const stroke = `stroke="${INK[annotation.colour]}" stroke-width="3" fill="none" stroke-linecap="round"`;
  const size = Math.min(box.w, box.h);
  switch (annotation.kind) {
    case 'circle':
    case 'question_number':
      return `<ellipse ${stroke} cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2}" rx="${box.w / 2 + 4}" ry="${box.h / 2 + 3}"/>`;
    case 'tick':
      return `<path ${stroke} d="${tick(box.x, box.y, size)}"/>`;
    case 'double_tick':
      return `<path ${stroke} d="${tick(box.x, box.y, size)} ${tick(box.x + size * 0.45, box.y, size)}"/>`;
    case 'cross':
      return `<path ${stroke} d="M ${box.x} ${box.y} L ${box.x + box.h} ${box.y + box.h} M ${box.x + box.h} ${box.y} L ${box.x} ${box.y + box.h}"/>`;
    case 'underline':
    case 'wavy_underline':
      return `<line ${stroke} x1="${box.x}" y1="${box.y + box.h}" x2="${box.x + box.w}" y2="${box.y + box.h}"/>`;
    default:
      return `<text x="${box.x}" y="${box.y + box.h * 0.78}" fill="${INK[annotation.colour]}" font-size="${Math.max(18, box.h * 0.7)}" font-family="'Segoe Print', cursive">${escapeXml(annotation.text)}</text>`;
  }
}

function checkedPage(image: string, annotations: readonly Annotation[]): string {
  const svg = decodeURIComponent(image.startsWith(SVG_PREFIX) ? image.slice(SVG_PREFIX.length) : '');
  return svg.replace('</svg>', `${annotations.map(shape).join('')}</svg>`);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function storeZip(files: readonly { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    [0x04034b50, 20, 0, 0, 0, 0, crc, file.data.length, file.data.length, name.length, 0].reduce((at, value, index) => {
      const wide = index === 0 || index === 6 || index === 7 || index === 8;
      if (wide) local.setUint32(at, value, true);
      else local.setUint16(at, value, true);
      return at + (wide ? 4 : 2);
    }, 0);
    const header = new DataView(new ArrayBuffer(46));
    [0x02014b50, 20, 20, 0, 0, 0, 0, crc, file.data.length, file.data.length, name.length, 0, 0, 0, 0, 0, offset].reduce((at, value, index) => {
      const wide = index === 0 || index === 7 || index === 8 || index === 9 || index === 15 || index === 16;
      if (wide) header.setUint32(at, value, true);
      else header.setUint16(at, value, true);
      return at + (wide ? 4 : 2);
    }, 0);
    parts.push(new Uint8Array(local.buffer), name, file.data);
    central.push(new Uint8Array(header.buffer), name);
    offset += 30 + name.length + file.data.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)].map((part) => part.slice().buffer), { type: 'application/zip' });
}

export function exportZip(examId: string): Blob {
  const encoder = new TextEncoder();
  const files = [{ name: 'marks.csv', data: encoder.encode(checker.exportCsv(examId)) }];
  for (const ref of checker.listBooklets(examId)) {
    const marked = checker.getBooklet(examId, ref.id);
    if (!marked.result) continue;
    const annotations = effectiveAnnotations(marked.result).filter((row) => !row.deleted);
    const label = `${(ref.student.name ?? 'Unnamed').replace(/\s+/g, '')}_${ref.student.roll_number ?? 'NoRoll'}`;
    marked.booklet.pages.forEach((page) => {
      if (page.index === 0) return;
      const svg = checkedPage(checker.pageImage(examId, ref.id, page.index), annotations.filter((row) => row.target.page_index === page.index));
      files.push({ name: `${label}_p${page.index}.svg`, data: encoder.encode(svg) });
    });
  }
  return storeZip(files);
}
