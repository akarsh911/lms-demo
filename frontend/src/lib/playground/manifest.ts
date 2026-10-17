import { PLAYGROUND_BASE } from '@/constants/playground';
import type {
  PlaygroundBand,
  PlaygroundManifest,
  PlaygroundPage,
  PlaygroundSpot,
  PlaygroundThread,
  PlaygroundTool,
  PlaygroundView,
} from '@/types/playground';

type Fields = Record<string, unknown>;

const HUB_PATH = /^[\w-]+\.html$/;
const PAGE_PATH = /^threads\/([\w-]+)\/([a-z]+)\.html$/;
const TOOL_PATH = /^(?:bench\/)?[\w-]+\.html$/;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function listOf<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(parse).filter((item): item is T => item !== null);
}

function integers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((c): c is number => Number.isInteger(c)) : [];
}

function parseBand(value: unknown): PlaygroundBand | null {
  if (!isFields(value)) return null;
  const id = text(value.id);
  const name = text(value.name);
  const classes = integers(value.classes);
  if (!id || !name || classes.length === 0) return null;
  return { id, name, classes, feel: text(value.feel) ?? '' };
}

function parsePage(value: unknown): PlaygroundPage | null {
  if (!isFields(value)) return null;
  const band = text(value.band);
  const title = text(value.title);
  const path = text(value.path);
  if (!band || !title || !path || !PAGE_PATH.test(path)) return null;
  return { band, title, blurb: text(value.blurb), path };
}

function parseThread(value: unknown): PlaygroundThread | null {
  if (!isFields(value)) return null;
  const id = text(value.id);
  const name = text(value.name);
  const pages = listOf(value.pages, parsePage);
  if (!id || !name || pages.length === 0) return null;
  return { id, name, subject: text(value.subject), tagline: text(value.tagline), pages };
}

function parseTool(value: unknown): PlaygroundTool | null {
  if (!isFields(value)) return null;
  const id = text(value.id);
  const title = text(value.title);
  const path = text(value.path);
  const kind = text(value.kind);
  if (!id || !title || !kind || !path || !TOOL_PATH.test(path)) return null;
  return {
    id,
    title,
    path,
    kind,
    subjects: listOf(value.subjects, text),
    classes: integers(value.classes),
    description: text(value.description),
  };
}

export function parsePlaygroundManifest(value: unknown): PlaygroundManifest | null {
  if (!isFields(value)) return null;
  const hub = text(value.hub);
  const bands = listOf(value.bands, parseBand);
  const threads = listOf(value.threads, parseThread);
  if (!hub || !HUB_PATH.test(hub) || bands.length === 0) return null;
  const tools = listOf(value.tools, parseTool).filter((tool) => tool.path !== hub);
  return { hub, bands, threads, tools };
}

export function playgroundUrl(path: string): string {
  return `${PLAYGROUND_BASE}/${path}`;
}

export function bandOfClass(manifest: PlaygroundManifest, cls: number | null): PlaygroundBand | null {
  if (cls === null) return null;
  return manifest.bands.find((band) => band.classes.includes(cls)) ?? null;
}

export function pageIn(thread: PlaygroundThread, band: string): PlaygroundPage | null {
  return thread.pages.find((page) => page.band === band) ?? null;
}

export function threadsInBand(manifest: PlaygroundManifest, band: string): PlaygroundThread[] {
  return manifest.threads
    .filter((thread) => pageIn(thread, band) !== null)
    .sort(
      (a, b) =>
        (a.subject ?? '').localeCompare(b.subject ?? '') || a.name.localeCompare(b.name),
    );
}

export function classSpan(classes: readonly number[]): string {
  if (classes.length === 0) return 'Any class';
  const low = Math.min(...classes);
  const high = Math.max(...classes);
  return low === high ? `Class ${low}` : `Class ${low}–${high}`;
}

export function toolsFor(manifest: PlaygroundManifest, cls: number | null): PlaygroundTool[] {
  return cls === null ? [...manifest.tools] : manifest.tools.filter((tool) => tool.classes.length === 0 || tool.classes.includes(cls));
}

export interface PlaygroundChoice {
  view: PlaygroundView;
  cls: number | null;
  threadId: string | null;
  toolId: string | null;
}

export interface PlaygroundSelection {
  view: PlaygroundView;
  cls: number | null;
  band: PlaygroundBand | null;
  threads: readonly PlaygroundThread[];
  thread: PlaygroundThread | null;
  page: PlaygroundPage | null;
  tool: PlaygroundTool | null;
  url: string | null;
}

export function resolveSelection(manifest: PlaygroundManifest, choice: PlaygroundChoice): PlaygroundSelection {
  const band = bandOfClass(manifest, choice.cls);
  const cls = band ? choice.cls : null;
  const threads = band ? threadsInBand(manifest, band.id) : [];
  const thread = threads.find((t) => t.id === choice.threadId) ?? null;
  const page = thread && band ? pageIn(thread, band.id) : null;
  const found = manifest.tools.find((t) => t.id === choice.toolId) ?? null;
  const view: PlaygroundView = found ? 'tools' : choice.view;
  const tool = view === 'tools' ? found : null;
  const url = view === 'tools' ? (tool ? playgroundUrl(tool.path) : null) : playgroundUrl(page ? page.path : manifest.hub);
  return { view, cls, band, threads, thread, page, tool, url };
}

export function classParam(raw: string | null): number | null {
  const value = Number(raw);
  return raw !== null && Number.isInteger(value) ? value : null;
}

export function spotOf(manifest: PlaygroundManifest, pathname: string): PlaygroundSpot | null {
  const prefix = `${PLAYGROUND_BASE}/`;
  if (!pathname.startsWith(prefix)) return null;
  const path = pathname.slice(prefix.length);
  if (path === '' || path === manifest.hub) return { kind: 'hub' };
  const tool = manifest.tools.find((t) => t.path === path);
  if (tool) return { kind: 'tool', toolId: tool.id };
  const [, threadId, band] = PAGE_PATH.exec(path) ?? [];
  return threadId && band ? { kind: 'thread', threadId, band } : null;
}
