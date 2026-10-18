#!/usr/bin/env node
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(
  process.argv[2] ?? process.env.PLAYGROUND_SOURCE ?? join(root, '..', 'lms-visual-playground', 'web'),
);
const target = join(root, 'public', 'playground');

if (!existsSync(join(source, 'play.js')) || !existsSync(join(source, 'index.html'))) {
  console.error(`sync-playground: ${source} is not the playground's web/ folder (no play.js or index.html).`);
  process.exit(1);
}

function loadRuntime(dir) {
  const noop = () => {};
  const sandbox = {
    URLSearchParams,
    location: { search: '', pathname: '/index.html' },
    addEventListener: noop,
    navigator: {},
    matchMedia: () => ({ matches: false, addEventListener: noop }),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(dir, 'play.js'), 'utf8'), sandbox, { filename: 'play.js' });
  if (!sandbox.Play?.THREADS || !sandbox.Play?.BANDS) {
    console.error('sync-playground: play.js did not expose Play.THREADS and Play.BANDS.');
    process.exit(1);
  }
  return sandbox.Play;
}

function buildManifest(play, dir) {
  const bands = play.BANDS.map(({ id, name, classes, feel }) => ({ id, name, classes: [...classes], feel }));
  const threads = play.THREADS.map((thread) => ({
    id: thread.id,
    name: thread.name,
    subject: thread.subject ?? null,
    hue: thread.hue ?? null,
    tagline: thread.tagline ?? null,
    pages: bands
      .filter((band) => thread.steps[band.id] && existsSync(join(dir, play.pageOf(thread.id, band.id))))
      .map((band) => ({
        band: band.id,
        title: thread.steps[band.id].title,
        blurb: thread.steps[band.id].blurb ?? null,
        path: play.pageOf(thread.id, band.id),
      })),
  })).filter((thread) => thread.pages.length > 0);
  return { hub: HUB, bands, threads, tools: buildTools(dir, bands) };
}

const HUB = 'index.html';

const TOOL_PROFILES = {
  'graph.html': {
    id: 'graph',
    kind: 'grapher',
    subjects: ['Mathematics'],
    title: 'Graphing calculator',
    description: 'Plot any function, equation or inequality and read it off: sliders, tables, roots and intersections. A scratchpad for every maths chapter.',
  },
  'bench/graph.html': {
    id: 'grapher',
    kind: 'bench',
    subjects: ['Mathematics', 'Physics'],
    classesLike: 'graph.html',
    title: 'Slope and area bench',
    description: 'Type a law, then trace it: drag a tangent to read the slope, and fill the area under the curve as a Riemann sum. For calculus and physics graphs.',
  },
  'molecules.html': { id: 'molecules', kind: 'bench', subjects: ['Chemistry'] },
};

const OWN_LEARNING_PAGES = new Set(['timeline.html']);
const PROTOTYPES = ['tl-grid.html'];

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (text) => text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity]).trim();

function hubToolClasses(dir) {
  const hub = readFileSync(join(dir, HUB), 'utf8');
  const entries = hub.matchAll(/\{id: '[\w-]+', href: '([^']+)'[^\n]*?classes: \[([\d,\s]+)\]/g);
  return new Map([...entries].map(([, href, classes]) => [href, classes.split(',').map(Number)]));
}

function toolPages(dir) {
  const html = (folder) =>
    readdirSync(join(dir, folder))
      .filter((name) => name.endsWith('.html'))
      .map((name) => (folder ? `${folder}/${name}` : name));
  return [...html(''), ...(existsSync(join(dir, 'bench')) ? html('bench') : [])].filter(
    (path) => path !== HUB && !OWN_LEARNING_PAGES.has(path) && !PROTOTYPES.includes(path),
  );
}

function buildTools(dir, bands) {
  const hubClasses = hubToolClasses(dir);
  const everyClass = bands.flatMap((band) => band.classes);
  return toolPages(dir).map((path) => {
    const page = readFileSync(join(dir, path), 'utf8');
    const profile = TOOL_PROFILES[path];
    if (!profile) console.warn(`sync-playground: ${path} has no tool profile; listed as a general tool for every class.`);
    const title = decode(/<title>([^<]*)<\/title>/i.exec(page)?.[1] ?? path);
    const description = decode(/<meta\s+name="description"\s+content="([^"]*)"/i.exec(page)?.[1] ?? '');
    return {
      id: profile?.id ?? path.replace(/\.html$/, '').replace(/\//g, '-'),
      title: profile?.title ?? title,
      path,
      kind: profile?.kind ?? 'tool',
      subjects: profile?.subjects ?? [],
      classes: hubClasses.get(path) ?? hubClasses.get(profile?.classesLike) ?? everyClass,
      description: profile?.description ?? (description || null),
    };
  });
}

const manifest = buildManifest(loadRuntime(source), source);

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
for (const path of PROTOTYPES) rmSync(join(target, path), { force: true });
writeFileSync(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const pages = manifest.threads.reduce((sum, thread) => sum + thread.pages.length, 0);
console.log(`sync-playground: ${source} -> ${target}`);
console.log(`sync-playground: ${manifest.threads.length} threads, ${pages} pages across ${manifest.bands.length} bands`);
console.log(`sync-playground: ${manifest.tools.length} tools: ${manifest.tools.map((tool) => tool.id).join(', ')}`);
