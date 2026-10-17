import type { MapEdge, MapNode, MindMapResponse } from '@/types/mindmap';

/**
 * The Concept Atlas layout, ported from `lms-mind-map/web/index.html`.
 *
 * # Why this ignores the server's positions
 *
 * The engine ships a `position` per node, computed as a radial sunburst. The
 * engine's OWN web UI does not use it for this view, and neither does this: the
 * Atlas draws a tidy two-level tree instead, because an open topic's concepts
 * need real vertical room and its neighbours have to move apart rather than
 * overlap. A radial layout cannot give that at this size, which is the note the
 * original leaves on `layout()`.
 *
 * Both layouts are deterministic, which is the property that actually matters:
 * the map is identical on every load and every machine, so a student's spatial
 * memory of a chapter survives, and a teacher and a student on a call are
 * looking at the same picture.
 *
 * Every constant below is the original's, apart from the sub-topic column and
 * the dense rows for a chapter with many topics. They are not arbitrary: `width()`
 * approximates Inter's advance so a label's underline rule ends where the text
 * does, and changing one without the others makes rules overshoot their words.
 */

/** The root pill. */
export const RW = 214;
export const RH = 62;
/** Where topic and concept text begins, left and right of the root. */
export const XT = 250;
export const XC = 560;
/** Row heights and the gap between topics. */
export const ROWT = 44;
export const ROWC = 32;
export const PAD = 10;
export const TSIZE = 15.5;
export const CSIZE = 14;

export const XA = 890;
export const DENSE_FROM = 17;
const ROWT_DENSE = 34;
const PAD_DENSE = 4;
const RW_DENSE = 264;
const RH_DENSE = 86;

export const isDense = (graph: AtlasGraph): boolean => graph.topics.length >= DENSE_FROM;

const TOPIC_TAIL = 90;
const SUB_TAIL = 70;

function columns(graph: AtlasGraph): { xc: number; xa: number } {
  const widest = (nodes: MapNode[], n: number, px: number): number =>
    Math.max(0, ...nodes.map((node) => width(clip(node.label || node.text, n), px)));
  const subs = graph.topics.flatMap((t) => graph.kids.get(t.id) ?? []).filter((n) => n.kind === 'subtopic');
  const xc = Math.max(XC, XT + widest(graph.topics, 30, TSIZE) + TOPIC_TAIL);
  return { xc, xa: Math.max(XA, xc + widest(subs, 34, CSIZE) + SUB_TAIL) };
}

export const rootBox = (graph: AtlasGraph, lines = 1): { w: number; h: number } =>
  isDense(graph) ? { w: RW_DENSE, h: RH_DENSE } : { w: RW, h: RH + (lines - 1) * 18 };

/** Inter's advance, close enough to seat a rule under a label. */
export const width = (s: string, px: number): number => s.length * px * 0.545 + 8;

export const clip = (s: string, n: number): string =>
  String(s || '').length > n ? `${String(s || '').slice(0, n - 1)}…` : String(s || '');

export const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The seven relation types, said the way a student would say them. */
export const VERB: Record<string, string> = {
  part_of: 'is part of',
  kind_of: 'is a kind of',
  causes: 'causes',
  requires: 'needs',
  follows: 'comes after',
  defined_by: 'is defined by',
  contrasts_with: 'is the opposite of',
};

/** Atom types, said the same way. */
export const KIND: Record<string, string> = {
  definition: 'Definition',
  formula: 'Formula',
  derivation: 'Derivation',
  worked_example: 'Example',
  numerical_data: 'Data',
  process_or_cycle: 'Process',
  classification: 'Types',
  comparison_pair: 'Comparison',
  diagram: 'Figure',
  table: 'Table',
  dated_event: 'Date',
  law_or_principle: 'Law',
  cause_effect: 'Cause',
  application_case: 'In real life',
};

export const hue = (i: number): string => `var(--b${i % 8})`;

/**
 * A topic's state, rolled up from its concepts. The original's `tState`.
 *
 * `missed` wins over everything, because a topic with one concept a student got
 * wrong is not a topic they are done with. `known` requires ALL of them.
 */
export function topicState(
  graph: AtlasGraph,
  topicId: string,
  states: Record<string, string | undefined>,
): 'known' | 'missed' | 'read' | null {
  const kids = graph.atoms.get(topicId) ?? [];
  if (!kids.length) return null;
  if (kids.every((c) => states[c.id] === 'known')) return 'known';
  if (kids.some((c) => states[c.id] === 'missed')) return 'missed';
  if (kids.some((c) => states[c.id])) return 'read';
  return null;
}

/** Concepts learned, out of all of them, for the progress ring. */
export function chapterProgress(
  graph: AtlasGraph,
  states: Record<string, string | undefined>,
): { all: number; known: number } {
  const atoms = graph.map.nodes.filter((n) => n.kind === 'atom');
  return { all: atoms.length, known: atoms.filter((a) => states[a.id] === 'known').length };
}

export interface Placed {
  x: number;
  y: number;
  dir: 1 | -1;
  lvl: 1 | 2 | 3;
  w: number;
  open?: boolean;
}

/** A fold is never a level: `clu_` prefixes are stripped when reading a parent. */
export const ownerOf = (n: { parent_id?: string | null } | undefined): string =>
  (n?.parent_id || '').replace(/^clu_/, '');

export interface AtlasGraph {
  map: MindMapResponse;
  nodes: Map<string, MapNode>;
  kids: Map<string, MapNode[]>;
  atoms: Map<string, MapNode[]>;
  topics: MapNode[];
}

/** Index a compiled map the way `useChapter()` does upstream. */
export function indexMap(map: MindMapResponse): AtlasGraph {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  const kids = new Map<string, MapNode[]>();
  for (const n of map.nodes) {
    if (!n.parent_id || n.kind === 'cluster') continue;
    const p = ownerOf(n);
    const list = kids.get(p) ?? [];
    list.push(n);
    kids.set(p, list);
  }
  for (const a of kids.values()) {
    a.sort((x, y) => x.order - y.order || (x.id < y.id ? -1 : 1));
  }
  const atoms = new Map<string, MapNode[]>();
  const collect = (id: string): MapNode[] => {
    const known = atoms.get(id);
    if (known) return known;
    const found = (kids.get(id) ?? []).flatMap((n) => (n.kind === 'atom' ? [n] : collect(n.id)));
    atoms.set(id, found);
    return found;
  };
  for (const id of kids.keys()) collect(id);
  return { map, nodes, kids, atoms, topics: kids.get(map.meta.section_id) ?? [] };
}

export function ancestorsOf(graph: AtlasGraph, id: string): string[] {
  const chain: string[] = [];
  let current = graph.nodes.get(id);
  while (current) {
    const up = ownerOf(current);
    if (!up || up === graph.map.meta.section_id) break;
    chain.push(up);
    current = graph.nodes.get(up);
  }
  return chain;
}

export function topicIdOf(graph: AtlasGraph, id: string): string {
  return ancestorsOf(graph, id).at(-1) ?? id;
}

export function pyqCount(node: MapNode): number {
  const asked = node.sources?.filter((source) => source.kind === 'pyq').length ?? 0;
  if (asked > 0) return asked;
  return node.examinability.basis === 'observed:pyq' ? 1 : 0;
}

/**
 * A tidy tree, split left and right of the root: topics, then the open topic's
 * children, then the open sub-topic's concepts when the map has that level.
 *
 * The open topic's concepts take real vertical room, so its neighbours move
 * apart rather than being overlapped.
 */
export function layout(graph: AtlasGraph, openId: string | null, openSub: string | null = null): Map<string, Placed> {
  const tops = graph.topics;
  const half = Math.ceil(tops.length / 2);
  const pos = new Map<string, Placed>();
  const rowT = isDense(graph) ? ROWT_DENSE : ROWT;
  const pad = isDense(graph) ? PAD_DENSE : PAD;
  const { xc, xa } = columns(graph);

  const sides: [MapNode[], 1 | -1][] = [
    [tops.slice(0, half), 1],
    [tops.slice(half), -1],
  ];

  for (const [list, dir] of sides) {
    let y = 0;
    const local: [string, Placed][] = [];

    for (const t of list) {
      const open = openId === t.id;
      const cs = open ? (graph.kids.get(t.id) ?? []) : [];

      if (cs.length) {
        const y0 = y;
        for (const c of cs) {
          const gs = c.id === openSub ? (graph.kids.get(c.id) ?? []) : [];
          const c0 = y;
          for (const g of gs) {
            local.push([
              g.id,
              { x: dir * xa, y: y + ROWC / 2, dir, lvl: 3, w: width(clip(g.label || g.text, 34), CSIZE) },
            ]);
            y += ROWC;
          }
          local.push([
            c.id,
            {
              x: dir * xc,
              y: gs.length ? (c0 + y) / 2 : y + ROWC / 2,
              dir,
              lvl: 2,
              open: gs.length > 0,
              w: width(clip(c.label || c.text, 34), CSIZE),
            },
          ]);
          if (!gs.length) y += ROWC;
        }
        local.push([
          t.id,
          { x: dir * XT, y: (y0 + y) / 2, dir, lvl: 1, open: true, w: width(clip(t.label, 30), TSIZE) },
        ]);
      } else {
        local.push([
          t.id,
          { x: dir * XT, y: y + rowT / 2, dir, lvl: 1, open: false, w: width(clip(t.label, 30), TSIZE) },
        ]);
        y += rowT;
      }
      y += pad;
    }

    const off = -(y - pad) / 2;
    for (const [id, p] of local) {
      p.y += off;
      pos.set(id, p);
    }
  }
  return pos;
}

export interface Tie {
  a: string;
  b: string;
  type: string | null;
  /** True when one end was rolled up to a branch on screen because the atom is closed. */
  agg: boolean;
  n: number;
}

/**
 * The relations that can actually be drawn right now.
 *
 * An endpoint that is not on screen is rolled up to its nearest branch on screen and the
 * tie is marked `agg`, which the stylesheet draws dashed. Dropping it instead
 * would make a chapter look less connected than it is purely because a branch
 * happens to be closed.
 */
export function ties(graph: AtlasGraph, pos: Map<string, Placed>): Tie[] {
  const out = new Map<string, Tie>();
  const onScreen = (id: string): boolean => pos.has(id);
  const shown = (id: string): string =>
    onScreen(id) ? id : (ancestorsOf(graph, id).find(onScreen) ?? id);

  for (const e of graph.map.edges) {
    if (e.kind !== 'relation') continue;
    const a = shown(e.source);
    const b = shown(e.target);
    const agg = a !== e.source || b !== e.target;
    if (!onScreen(a) || !onScreen(b) || a === b) continue;

    const key = `${a}|${b}|${e.relation_type}`;
    const existing = out.get(key);
    if (existing) {
      existing.n += 1;
      continue;
    }
    out.set(key, { a, b, type: e.relation_type, agg, n: 1 });
  }
  return [...out.values()];
}

/**
 * What stays lit when a concept is selected: itself, whatever the book connects
 * it to, and its own topic. Everything else dims rather than disappearing.
 */
export function litSet(
  graph: AtlasGraph,
  pos: Map<string, Placed>,
  sel: string | null,
): Set<string> | null {
  if (!sel) return null;
  const s = new Set([sel]);
  for (const t of ties(graph, pos)) {
    if (t.a === sel) s.add(t.b);
    if (t.b === sel) s.add(t.a);
  }
  for (const up of ancestorsOf(graph, sel)) s.add(up);
  return s;
}

export interface PageRange {
  from: number;
  to: number;
}

export interface PageFocus {
  lit: Set<string>;
  concepts: number;
  firstTopic: string | null;
}

export function pageFocus(graph: AtlasGraph, range: PageRange | null): PageFocus | null {
  if (!range) return null;
  const lit = new Set<string>();
  let concepts = 0;
  for (const n of graph.map.nodes) {
    if (n.kind === 'chapter' || n.page === null || n.page === undefined) continue;
    if (n.page < range.from || n.page > range.to) continue;
    lit.add(n.id);
    if (n.kind !== 'atom') continue;
    concepts += 1;
    for (const up of ancestorsOf(graph, n.id)) lit.add(up);
  }
  const firstTopic = graph.topics.find((t) => lit.has(t.id))?.id ?? null;
  return { lit, concepts, firstTopic };
}

/** Every typed relation touching one node, in the sheet's order. */
export function relationsFor(
  graph: AtlasGraph,
  nodeId: string,
): { id: string; rel: string | null; out: boolean; ev: string; edge: MapEdge }[] {
  const list: { id: string; rel: string | null; out: boolean; ev: string; edge: MapEdge }[] = [];
  for (const e of graph.map.edges) {
    if (e.kind !== 'relation') continue;
    if (e.source === nodeId) list.push({ id: e.target, rel: e.relation_type, out: true, ev: e.text, edge: e });
    else if (e.target === nodeId) list.push({ id: e.source, rel: e.relation_type, out: false, ev: e.text, edge: e });
  }
  return list;
}

/** Wrap a root title onto at most `max` lines of `per` characters. The original's. */
export function wrap(text: string, per: number, max: number): string[] {
  const words = String(text || '').split(/\s+/);
  const out: string[] = [];
  let ln = '';
  for (const x of words) {
    if (`${ln} ${x}`.trim().length > per && ln) {
      out.push(ln);
      ln = x;
    } else {
      ln = ln ? `${ln} ${x}` : x;
    }
    if (out.length === max) {
      ln = '';
      break;
    }
  }
  if (ln && out.length < max) out.push(ln);
  if (!out.length) out.push(clip(text, per));
  // Anything that did not fit is acknowledged rather than silently dropped.
  if (out.join(' ').length < String(text).length) {
    out[out.length - 1] = clip(`${out[out.length - 1]}…`, per + 1);
  }
  return out;
}
