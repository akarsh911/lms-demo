import { config } from '@/config';
import type { PaperArtefacts } from '@/types/answer-checker';

import { ENGLISH_ANNUAL_PAPER_ID } from './data/english-annual-2026';
import { SCIENCE_TERM_PAPER_ID } from './data/science-term-10a';

const ENGLISH_FOLDER = '/demo/papers/english-annual-2026';
const SCIENCE_FOLDER = '/demo/papers/science-term-10a-2026';

const SAMPLE_FILES = [
  { name: 'paper.pdf', label: 'Question paper' },
  { name: 'blueprint.pdf', label: 'Blueprint' },
  { name: 'answer-key.pdf', label: 'Answer key' },
] as const;

const HOLDERS = new Map<string, string>([
  [ENGLISH_ANNUAL_PAPER_ID, ENGLISH_FOLDER],
  [SCIENCE_TERM_PAPER_ID, SCIENCE_FOLDER],
]);

export function fitsSampleFiles(subject: string | null | undefined, classLabel: string | null | undefined): boolean {
  return subject?.trim().toLowerCase() === 'english' && classLabel?.trim() === '10';
}

export function holdSampleFiles(paperId: string): void {
  HOLDERS.set(paperId, ENGLISH_FOLDER);
}

export function sampleArtefacts(paperId: string): PaperArtefacts | null {
  if (!HOLDERS.has(paperId)) return null;
  return {
    paper_id: paperId,
    artefacts: SAMPLE_FILES.map((file) => ({ ...file, url: `/api/v1/papers/${paperId}/files/${file.name}` })),
  };
}

export function sampleFileHref(paperId: string, name: string): string | null {
  const folder = HOLDERS.get(paperId);
  if (!folder || !SAMPLE_FILES.some((file) => file.name === name)) return null;
  return `${folder}/${name}`;
}

export async function sampleFile(href: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(href, { signal });
  if (!response.ok) throw new Error(`The sample file ${href} answered ${response.status}.`);
  return response.blob();
}

export const demoPaperArtefacts = (paperId: string): PaperArtefacts | null => (config.devBypass ? sampleArtefacts(paperId) : null);

export function demoPaperFile(paperId: string, name: string): Promise<Blob> | null {
  const href = config.devBypass ? sampleFileHref(paperId, name) : null;
  return href ? sampleFile(href) : null;
}
