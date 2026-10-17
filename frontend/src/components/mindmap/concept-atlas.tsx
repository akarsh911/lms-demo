'use client';

import * as React from 'react';

import {
  CSIZE,
  KIND,
  chapterProgress,
  topicState,
  TSIZE,
  VERB,
  XC,
  ancestorsOf,
  clip,
  hue,
  indexMap,
  isDense,
  layout,
  litSet,
  pageFocus,
  plural,
  pyqCount,
  relationsFor,
  rootBox,
  ties,
  topicIdOf,
  width,
  wrap,
  type AtlasGraph,
  type PageRange,
  type Placed,
} from '@/lib/mindmap/atlas-layout';
import { locateExcerpt } from '@/components/flashcards/source-drawer';
import { useSourcePage } from '@/hooks/query/use-flashcards';
import { pageRangeLabel } from '@/lib/mindmap/deep-link';
import { SOURCE_LABEL, sourceMeta, sourcesOf } from '@/lib/mindmap/sources';
import type { MasteryMap } from '@/types/mastery';
import type { MapNode, MapSource, MindMapResponse } from '@/types/mindmap';

import './concept-atlas.css';

const TRAIL = 120;
const HUD_ROOM = 56;
const SHEET_W = 400;
const SHEET_BESIDE_FROM = 700;

function countText(counted: boolean, childCount: number, doneCount: number): string {
  if (!counted) return '';
  return doneCount ? `${doneCount}/${childCount}` : String(childCount);
}

function chipText(isTopic: boolean, pyq: number): string | null {
  if (pyq === 0) return null;
  if (isTopic) return `${pyq} PYQ`;
  return pyq > 1 ? `PYQ ×${pyq}` : 'PYQ';
}

const chipWidth = (chip: string | null): number => (chip ? chip.length * 6.1 + 12 : 0);

const countGap = (count: string): number => (count ? width(count, 11.5) + 12 : 9);

const tailOf = (count: string, chip: string | null): number => countGap(count) + chipWidth(chip) + 4;

/**
 * The Concept Atlas map, ported from the mind-map engine's own web UI
 * (`lms-mind-map/web/index.html`) rather than reinvented.
 *
 * The three rules it is built on are the engine's, and each one is a decision
 * that reads as a bug if you do not know it:
 *
 *   DRAWN, NOT BOXED. Labels sit on coloured rules the way a hand-drawn mind
 *   map works. No rectangles around words.
 *
 *   THE WHOLE CHAPTER STAYS ON SCREEN. Tapping a topic opens it IN PLACE and
 *   closes the previous one. The earlier version re-centred on the topic, which
 *   threw the chapter away and left three items on an empty canvas, so the map
 *   felt like it ended immediately.
 *
 *   LINES ONLY WHEN ASKED. At rest this is a pure tree and nothing crosses.
 *   Select a concept and only its stated links draw in, with everything
 *   unrelated dimmed rather than removed.
 *
 * The port is faithful: same constants, same layout, same interaction. What
 * changed is imperative DOM building becoming declarative JSX, and the module
 * globals becoming component state. Camera work is still done by writing a
 * transform straight onto the viewport group, because putting it in React state
 * would re-render the whole tree on every pointermove of a drag.
 */
export function ConceptAtlas({
  map,
  mastery,
  range,
  onOpenConcept,
  onClearRange,
  onStudyTopic,
  onOpenSource,
}: {
  map: MindMapResponse;
  mastery: MasteryMap | null;
  range: PageRange | null;
  onOpenConcept?: (nodeId: string) => void;
  onClearRange?: () => void;
  onStudyTopic?: (topicId: string) => void;
  onOpenSource?: (node: MapNode, source: MapSource) => void;
}): React.ReactElement {
  const graph = React.useMemo<AtlasGraph>(() => indexMap(map), [map]);
  const focus = React.useMemo(() => pageFocus(graph, range), [graph, range]);

  /**
   * What this student has learned. The engine's UI keeps this in `localStorage`;
   * here it is server-side, so it follows the student between devices and can be
   * written by the drill as well as by reading. See `types/mastery.ts`.
   */
  const tracked = mastery !== null;
  // Memoised because the `?? {}` fallback is a fresh object on every render, and
  // every derived `useMemo` below would recompute for a value that never changed.
  const states = React.useMemo(() => mastery ?? {}, [mastery]);
  const progress = React.useMemo(() => chapterProgress(graph, states), [graph, states]);

  const firstSubOf = React.useCallback(
    (topicId: string | null): string | null =>
      topicId ? ((graph.kids.get(topicId) ?? []).find((n) => n.kind === 'subtopic')?.id ?? null) : null,
    [graph],
  );

  const [openId, setOpenId] = React.useState<string | null>(focus?.firstTopic ?? null);
  const [openSub, setOpenSub] = React.useState<string | null>(() => firstSubOf(focus?.firstTopic ?? null));
  const [sel, setSel] = React.useState<string | null>(null);

  const openTopic = (topicId: string | null, subId: string | null = firstSubOf(topicId)): void => {
    setOpenId(topicId);
    setOpenSub(subId);
  };

  // A chapter change resets the branch and the selection: both name nodes that
  // no longer exist.
  const view = `${map.meta.section_id}|${range?.from ?? ''}|${range?.to ?? ''}`;
  const [seen, setSeen] = React.useState(view);
  if (seen !== view) {
    setSeen(view);
    openTopic(focus?.firstTopic ?? null);
    setSel(null);
  }

  const pos = React.useMemo(() => layout(graph, openId, openSub), [graph, openId, openSub]);
  const rootLines = React.useMemo(() => wrap(map.meta.section_display, 21, 2), [map.meta.section_display]);
  const root = React.useMemo(() => rootBox(graph, rootLines.length), [graph, rootLines.length]);
  const selLit = React.useMemo(() => litSet(graph, pos, sel), [graph, pos, sel]);
  const lit = selLit ?? (focus && focus.lit.size > 0 ? focus.lit : null);
  const tieList = React.useMemo(() => (sel ? ties(graph, pos) : []), [graph, pos, sel]);

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const vpRef = React.useRef<SVGGElement | null>(null);
  const cam = React.useRef({ x: 0, y: 0, k: 1 });
  const dragged = React.useRef(false);

  const camApply = React.useCallback(() => {
    vpRef.current?.setAttribute(
      'transform',
      `translate(${cam.current.x},${cam.current.y}) scale(${cam.current.k})`,
    );
  }, []);

  /** The viewBox is recentred on the element's own box, as `units()` does. */
  const units = React.useCallback((): DOMRect | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    svg.setAttribute('viewBox', `${-r.width / 2} ${-r.height / 2} ${r.width} ${r.height}`);
    return r;
  }, []);

  const zoomBy = React.useCallback(
    (f: number) => {
      cam.current.k = Math.min(2.4, Math.max(0.18, cam.current.k * f));
      camApply();
    },
    [camApply],
  );

  const fit = React.useCallback(() => {
    const r = units();
    if (!r) return;
    let ex = root.w / 2 + 40;
    let ey = root.h / 2 + 30;
    for (const p of pos.values()) {
      ex = Math.max(ex, Math.abs(p.x) + p.w + TRAIL);
      ey = Math.max(ey, Math.abs(p.y) + 30);
    }
    cam.current = {
      x: 0,
      y: HUD_ROOM / 2,
      k: Math.min(1.1, Math.max(0.18, Math.min(r.width / (ex * 2), (r.height - HUD_ROOM) / (ey * 2)))),
    };
    camApply();
  }, [camApply, pos, root.h, root.w, units]);

  /**
   * Keep the branch just opened in view. The map is tall, and a student should
   * never have to hunt for what they tapped.
   *
   * The original holds zoom fixed here on purpose: re-zooming on every tap is
   * jarring. It also means an opened branch can fall off the edge, because
   * concepts sit at 560 units where their topic sat at 250, and that is what
   * actually happens on a wide chapter.
   *
   * So zoom is held UNLESS the branch genuinely does not fit, and then it is
   * reduced by exactly enough. Nothing moves when nothing needs to, which keeps
   * the original's intent, and the thing you just tapped is always on screen.
   */
  const centreOn = React.useCallback(
    (id: string) => {
      const p = pos.get(id);
      if (!p) return;
      const r = svgRef.current?.getBoundingClientRect();
      let shift = 0;
      if (r) {
        let needed = 0;
        let far = root.w / 2;
        for (const q of pos.values()) {
          needed = Math.max(needed, Math.abs(q.x) + q.w + TRAIL);
          if (q.dir === p.dir) far = Math.max(far, Math.abs(q.x) + q.w + TRAIL);
        }
        const near = root.w / 2 + 40;
        const whole = cam.current.k * needed * 2 <= r.width;
        if (!whole) {
          const maxK = r.width / (far + near);
          if (cam.current.k > maxK) cam.current.k = Math.max(0.18, maxK);
          shift = (p.dir * (far - near)) / 2;
        }
      }
      cam.current.x = -shift * cam.current.k;
      cam.current.y = -p.y * cam.current.k;
      camApply();
    },
    [camApply, pos, root.w],
  );

  /**
   * Centre the branch that just opened, AFTER the layout that includes it.
   *
   * This has to be an effect rather than a call inside the tap handler. The
   * handler closes over the `pos` of the render it was created in, which is the
   * layout with the branch still CLOSED, so it measured a tree 300 units
   * narrower than the one about to be drawn and left the concepts off the edge.
   */
  React.useEffect(() => {
    if (openId) centreOn(openSub ?? openId);
    else fit();
    // `centreOn`/`fit` are recreated whenever `pos` is, which is exactly when
    // this should re-run, so listing them would be the same thing said twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, openSub, pos]);

  const latest = React.useRef({ fit, open: openId !== null });
  React.useEffect(() => {
    latest.current = { fit, open: openId !== null };
  });

  React.useEffect(() => {
    const p = sel ? pos.get(sel) : undefined;
    const r = svgRef.current?.getBoundingClientRect();
    if (!p || !r || window.innerWidth <= SHEET_BESIDE_FROM) return;
    const { k } = cam.current;
    const edge = r.width / 2 - Math.min(SHEET_W, window.innerWidth * 0.92) - 24;
    const right = cam.current.x + (p.dir > 0 ? p.x + p.w + 60 : p.x) * k;
    const left = cam.current.x + (p.dir > 0 ? p.x : p.x - p.w) * k;
    const overflow = Math.min(right - edge, left + r.width / 2 - 24);
    if (overflow <= 0) return;
    cam.current.x -= overflow;
    camApply();
  }, [camApply, pos, sel]);

  // Fit on the first paint of each chapter, and whenever the element resizes.
  const sectionId = map.meta.section_id;
  React.useEffect(() => {
    fit();
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      units();
      if (latest.current.open) camApply();
      else latest.current.fit();
    });
    ro.observe(svg);
    return () => ro.disconnect();
    // Deliberately keyed on the chapter alone. `fit`, `units` and `camApply`
    // change identity whenever `pos` does, and refitting on every branch open
    // would undo the `centreOn` that is the whole point of opening one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  /**
   * Pan, capturing only after real travel.
   *
   * `setPointerCapture` on press retargets the click to the `<svg>` and
   * silently eats every tap on a label, which is the bug the original's comment
   * records. The 4px slop is what separates a tap from a drag.
   */
  const dragRef = React.useRef<{ x: number; y: number; cx: number; cy: number; id: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      cx: cam.current.x,
      cy: cam.current.y,
      id: e.pointerId,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
      d.moved = true;
      svgRef.current?.classList.add('grabbing');
      try {
        svgRef.current?.setPointerCapture(d.id);
      } catch {
        /* capture is best-effort */
      }
    }
    cam.current.x = d.cx + (e.clientX - d.x);
    cam.current.y = d.cy + (e.clientY - d.y);
    camApply();
  };

  const stopDrag = (): void => {
    const d = dragRef.current;
    if (d?.moved) {
      try {
        svgRef.current?.releasePointerCapture(d.id);
      } catch {
        /* capture is best-effort */
      }
      dragged.current = true;
      setTimeout(() => {
        dragged.current = false;
      }, 0);
    }
    dragRef.current = null;
    svgRef.current?.classList.remove('grabbing');
  };

  /** Accordion: one branch at a time keeps the chapter readable. */
  const tap = (n: MapNode): void => {
    if (n.kind === 'topic') {
      openTopic(openId === n.id ? null : n.id);
      setSel(null);
      return;
    }
    if (n.kind === 'subtopic') {
      setOpenSub(openSub === n.id ? null : n.id);
      setSel(null);
      return;
    }
    // Opening a concept is reading it. `raise` on both sides means this can
    // never pull a concept back down from `known`.
    if (states[n.id] === undefined) onOpenConcept?.(n.id);
    setSel(n.id);
  };

  const tops = graph.topics;
  const selected = sel ? graph.nodes.get(sel) : null;
  const openNode = openId ? graph.nodes.get(openId) : null;

  return (
    <div className="atlas">
      <div className="stage">
        <svg
          ref={svgRef}
          className="map"
          role="img"
          aria-label="Chapter mind map"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1)}
          onClick={() => {
            if (dragged.current) return;
            if (sel) setSel(null);
          }}
        >
          <g ref={vpRef}>
            {/* branches */}
            <g>
              {tops.map((t, i) => {
                const p = pos.get(t.id);
                if (!p) return null;
                const col = hue(i);
                const dim = lit && !lit.has(t.id);
                const x0 = p.dir * (root.w / 2 - 2);
                const x1 = p.x - p.dir * 10;
                const children = openId === t.id ? (graph.kids.get(t.id) ?? []) : [];
                const grandchildren = openSub && children.some((c) => c.id === openSub) ? (graph.kids.get(openSub) ?? []) : [];
                const sub = openSub ? pos.get(openSub) : undefined;
                const topicAtoms = graph.atoms.get(t.id) ?? [];
                const topicTail = tailOf(
                  countText(true, topicAtoms.length, topicAtoms.filter((a) => states[a.id] === 'known').length),
                  chipText(true, topicAtoms.filter((a) => pyqCount(a) > 0).length),
                );
                const subAtoms = openSub ? (graph.atoms.get(openSub) ?? []) : [];
                const subTail = tailOf(countText(true, subAtoms.length, subAtoms.filter((a) => states[a.id] === 'known').length), null);

                return (
                  <g key={t.id}>
                    {/* trunk: root edge to the start of the label's rule */}
                    <path
                      d={`M${x0},0 C${x0 + p.dir * 95},0 ${x1 - p.dir * 95},${p.y} ${x1},${p.y}`}
                      className={`branch t${dim ? ' dim' : ''}`}
                      stroke={col}
                    />
                    {/* the rule the label sits on */}
                    <line
                      x1={p.dir > 0 ? p.x : p.x - p.w}
                      y1={p.y + 11}
                      x2={p.dir > 0 ? p.x + p.w : p.x}
                      y2={p.y + 11}
                      className={`rule t${dim ? ' dim' : ''}`}
                      stroke={col}
                      opacity={dim ? 0.1 : 0.75}
                    />
                    {children.map((c) => (
                      <Twig key={c.id} from={p} fromRule={11} tail={topicTail} to={pos.get(c.id)} col={col} dim={Boolean(lit && !lit.has(c.id))} />
                    ))}
                    {sub
                      ? grandchildren.map((g) => (
                          <Twig key={g.id} from={sub} fromRule={9} tail={subTail} to={pos.get(g.id)} col={col} dim={Boolean(lit && !lit.has(g.id))} />
                        ))
                      : null}
                  </g>
                );
              })}
            </g>

            {/* ties: only the selected concept's, and only when one is selected */}
            <g>
              {tieList
                .filter((tie) => tie.a === sel || tie.b === sel)
                .map((tie) => {
                  const a = pos.get(tie.a);
                  const b = pos.get(tie.b);
                  if (!a || !b) return null;
                  const ax = a.dir > 0 ? a.x + a.w : a.x - a.w;
                  const bx = b.dir > 0 ? b.x + b.w : b.x - b.w;
                  const same = a.dir === b.dir;
                  const cx = same ? a.dir * (XC + 210) : 0;
                  return (
                    <path
                      key={`${tie.a}|${tie.b}|${tie.type}`}
                      d={`M${ax},${a.y + 9} Q${cx},${(a.y + b.y) / 2} ${bx},${b.y + 9}`}
                      className={`tie${tie.agg ? ' agg' : ''}`}
                      stroke={`var(--r-${tie.type})`}
                    />
                  );
                })}
            </g>

            {/* labels, and the root pill */}
            <g>
              <g className={isDense(graph) ? 'root dense' : 'root'}>
                <rect x={-root.w / 2} y={-root.h / 2} width={root.w} height={root.h} rx={20} className="root-pill" />
                {rootLines.map((l, i) => (
                  <text
                    key={l}
                    className="root-tx"
                    textAnchor="middle"
                    y={(i - (rootLines.length - 1) / 2) * (isDense(graph) ? 24 : 20) - 3}
                  >
                    {l}
                  </text>
                ))}
                <text className="root-sb" textAnchor="middle" y={root.h / 2 - 11}>
                  {plural(tops.length, 'topic')} · {plural(map.meta.atoms, 'concept')}
                </text>
              </g>

              {tops.map((t) => {
                const atoms = graph.atoms.get(t.id) ?? [];
                return (
                  <Label
                    key={t.id}
                    node={t}
                    p={pos.get(t.id)}
                    lit={lit}
                    sel={sel}
                    open={openId === t.id}
                    childCount={atoms.length}
                    doneCount={atoms.filter((c) => states[c.id] === 'known').length}
                    topicState={topicState(graph, t.id, states)}
                    pyq={atoms.filter((c) => pyqCount(c) > 0).length}
                    learned={false}
                    onTap={tap}
                  />
                );
              })}
              {[...(openId ? (graph.kids.get(openId) ?? []) : []), ...(openSub ? (graph.kids.get(openSub) ?? []) : [])].map((c) => {
                const atoms = graph.atoms.get(c.id) ?? [];
                const isAtom = c.kind === 'atom';
                return (
                  <Label
                    key={c.id}
                    node={c}
                    p={pos.get(c.id)}
                    lit={lit}
                    sel={sel}
                    open={openSub === c.id}
                    childCount={atoms.length}
                    doneCount={atoms.filter((a) => states[a.id] === 'known').length}
                    topicState={null}
                    pyq={isAtom ? pyqCount(c) : 0}
                    learned={isAtom && states[c.id] === 'known'}
                    onTap={tap}
                  />
                );
              })}
            </g>
          </g>
        </svg>

        <div className="hud">
          <div className="pod">
            <span className="lvl">{plural(tops.length, 'topic')}</span>
            {/*
              Learned out of all, with evidence rather than a percentage: "3 of
              33" and "1 of 1" are different claims and the same percentage.
            */}
            {tracked ? (
              <span className="lvl ring">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" className="ring-track" />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    className="ring-fill"
                    strokeDasharray={`${(progress.known / Math.max(progress.all, 1)) * 56.5} 56.5`}
                  />
                </svg>
                {progress.known} of {progress.all} learned
              </span>
            ) : null}
            {range && focus ? (
              <>
                <span className="lvl">
                  {focus.concepts > 0
                    ? `${pageRangeLabel(range)} · ${plural(focus.concepts, 'concept')}`
                    : `Nothing here is on ${pageRangeLabel(range).toLowerCase()}`}
                </span>
                {onClearRange ? (
                  <button type="button" onClick={onClearRange}>
                    Show whole chapter
                  </button>
                ) : null}
              </>
            ) : null}
            {openNode ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    openTopic(null);
                    setSel(null);
                  }}
                >
                  Close {clip(openNode.label, 18)}
                </button>
                {onStudyTopic && !selected ? (
                  <button type="button" onClick={() => onStudyTopic(openNode.id)}>
                    Study &amp; test
                  </button>
                ) : null}
              </>
            ) : (
              <span className="lvl" style={{ color: 'var(--ink-3)' }}>
                tap one to open it
              </span>
            )}
          </div>
        </div>

        <div className="zoom">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>
            ＋
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
            −
          </button>
          <button type="button" aria-label="Fit" onClick={fit}>
            ⤢
          </button>
        </div>

        {selected ? (
          <Sheet
            graph={graph}
            node={selected}
            onClose={() => setSel(null)}
            onPick={(id) => {
              if (!graph.nodes.has(id)) return;
              const chain = ancestorsOf(graph, id);
              const topic = chain.at(-1) ?? null;
              const holder = chain.find((up) => graph.nodes.get(up)?.kind === 'subtopic') ?? null;
              if (topic !== openId || holder !== openSub) openTopic(topic, holder);
              setSel(id);
            }}
            onStudyTopic={onStudyTopic}
            onOpenSource={onOpenSource}
          />
        ) : null}
      </div>
    </div>
  );
}

function Label({
  node,
  p,
  lit,
  sel,
  open,
  childCount,
  doneCount,
  topicState: tState,
  pyq,
  learned,
  onTap,
}: {
  node: MapNode;
  p: Placed | undefined;
  lit: Set<string> | null;
  sel: string | null;
  open: boolean;
  childCount: number;
  /** Concepts in this topic the student has learned. */
  doneCount: number;
  topicState: 'known' | 'missed' | 'read' | null;
  pyq: number;
  /** This concept itself is learned. Only meaningful for an atom. */
  learned: boolean;
  onTap: (n: MapNode) => void;
}): React.ReactElement | null {
  if (!p) return null;

  const isTopic = node.kind === 'topic';
  const counted = node.kind !== 'atom';
  const txt = clip(node.label || node.text, isTopic ? 30 : 34);
  const w = p.w;
  const x0 = p.dir > 0 ? p.x : p.x - w;
  const after = (gap: number): number => (p.dir > 0 ? p.x + w + gap : p.x - w - gap);
  const cls =
    'lab' +
    (sel === node.id ? ' on' : '') +
    (counted && open ? ' open' : '') +
    (isTopic && tState === 'known' ? ' done' : '') +
    (lit && !lit.has(node.id) ? ' dim' : '');
  const count = countText(counted, childCount, doneCount) || (learned ? '✓' : '');
  const chip = chipText(isTopic, pyq);
  const chipW = chipWidth(chip);
  const chipX = after(countGap(count));

  return (
    <g
      className={cls}
      onClick={(e) => {
        e.stopPropagation();
        onTap(node);
      }}
    >
      <rect
        x={x0 - 8}
        y={p.y - (isTopic ? 16 : 14)}
        width={w + 16}
        height={isTopic ? 30 : 26}
        rx={9}
        className="halo"
      />
      <text
        x={p.x}
        y={p.y}
        textAnchor={p.dir > 0 ? 'start' : 'end'}
        className={isTopic ? 't' : node.kind === 'subtopic' ? 's' : 'c'}
      >
        {txt}
      </text>
      {/*
        A topic shows `done/total` once anything in it is learned and a bare
        count before that, so the number only becomes a score when there is a
        score to show. A learned concept gets a tick instead. Both are the
        original's.
      */}
      {counted ? (
        <text x={after(9)} y={p.y} textAnchor={p.dir > 0 ? 'start' : 'end'} className="n">
          {count}
        </text>
      ) : learned ? (
        <text x={after(9)} y={p.y} textAnchor={p.dir > 0 ? 'start' : 'end'} className="tick">
          ✓
        </text>
      ) : null}
      {chip ? (
        <g className="pyq">
          <title>{isTopic ? `${pyq} concepts here were asked in past board papers` : 'Asked in past board papers'}</title>
          <rect x={p.dir > 0 ? chipX : chipX - chipW} y={p.y - 11.5} width={chipW} height={15} rx={7.5} />
          <text x={p.dir > 0 ? chipX + chipW / 2 : chipX - chipW / 2} y={p.y} textAnchor="middle">
            {chip}
          </text>
        </g>
      ) : null}
      {/* A generous invisible hit area: the text itself is a thin target. */}
      <rect
        x={x0 - 14}
        y={p.y - (isTopic ? 18 : 16)}
        width={w + 46}
        height={isTopic ? 34 : 30}
        className="hit"
      />
    </g>
  );
}

function Twig({
  from,
  fromRule,
  tail,
  to,
  col,
  dim,
}: {
  from: Placed;
  fromRule: number;
  tail: number;
  to: Placed | undefined;
  col: string;
  dim: boolean;
}): React.ReactElement | null {
  if (!to) return null;
  const a = from.dir > 0 ? from.x + from.w + tail : from.x - from.w - tail;
  const b = to.x - to.dir * 8;
  return (
    <g>
      <path
        d={`M${a},${from.y + fromRule} C${a + from.dir * 55},${from.y + fromRule} ${b - from.dir * 55},${to.y + 9} ${b},${to.y + 9}`}
        className={`branch c${dim ? ' dim' : ''}`}
        stroke={col}
      />
      <line
        x1={to.dir > 0 ? to.x : to.x - to.w}
        y1={to.y + 9}
        x2={to.dir > 0 ? to.x + to.w : to.x}
        y2={to.y + 9}
        className="rule c"
        stroke={col}
        opacity={dim ? 0.1 : 0.55}
      />
    </g>
  );
}

/**
 * The concept sheet.
 *
 * `blockquote` carries the book's own characters, and `pageLine` is where the
 * engine's honesty about quotation lives: a `match_ratio` below 1.0 means the
 * atom is a normalised version of the sentence, not the sentence, and it says
 * so rather than presenting a partial match inside quotation marks.
 */
function Sheet({
  graph,
  node,
  onClose,
  onPick,
  onStudyTopic,
  onOpenSource,
}: {
  graph: AtlasGraph;
  node: MapNode;
  onClose: () => void;
  onPick: (id: string) => void;
  onStudyTopic?: (topicId: string) => void;
  onOpenSource?: (node: MapNode, source: MapSource) => void;
}): React.ReactElement {
  const list = relationsFor(graph, node.id);
  const topicId = topicIdOf(graph, node.id);
  const sources = sourcesOf(node);

  return (
    <aside className="sheet">
      <button type="button" className="x" aria-label="Close" onClick={onClose}>
        ✕
      </button>
      <div className="pad">
        <span className="tag">{KIND[node.atom_type ?? ''] ?? 'Concept'}</span>
        <h2>{node.label}</h2>
        <blockquote>{node.text}</blockquote>
        <PageLine citation={node.citation} />

        {sources.length ? <SourceList node={node} sources={sources} onOpenSource={onOpenSource} /> : null}

        {onStudyTopic ? (
          <div className="actions">
            <button type="button" className="go sm quiet" onClick={() => onStudyTopic(topicId)}>
              Study &amp; test this topic
            </button>
          </div>
        ) : null}

        {list.length ? (
          <>
            <div className="kicker" style={{ marginTop: 22 }}>
              What the book connects this to
            </div>
            <div className="ties">
              {list.map((t) => {
                const o = graph.nodes.get(t.id);
                const away = topicIdOf(graph, t.id) !== topicId;
                return (
                  <button
                    type="button"
                    className="tierow"
                    key={`${t.id}-${t.rel}-${t.out ? 'out' : 'in'}`}
                    onClick={() => onPick(t.id)}
                  >
                    <div className="rl" style={{ color: `var(--r-${t.rel})` }}>
                      {t.out ? `${VERB[t.rel ?? ''] ?? t.rel} →` : `← ${VERB[t.rel ?? ''] ?? t.rel}`}
                    </div>
                    <div className="nm">{o?.label ?? ''}</div>
                    {/* The book's sentence. This is what lets the map explain a
                        connection without a language model. */}
                    <div className="ev">{t.ev}</div>
                    <div className="page">
                      Page {t.edge.citation?.page ?? '?'}
                      {away ? ' · in another topic' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="hintline">
            The book states no connection from this concept, which is normal.{' '}
            {graph.map.meta.orphan_atoms} of {graph.map.meta.atoms} concepts in this chapter
            stand on their own.
          </p>
        )}
      </div>
    </aside>
  );
}

function SourceList({
  node,
  sources,
  onOpenSource,
}: {
  node: MapNode;
  sources: MapSource[];
  onOpenSource?: (node: MapNode, source: MapSource) => void;
}): React.ReactElement {
  const textbook = sources.find((source) => source.kind === 'textbook');
  const page = useSourcePage(onOpenSource ? node.citation?.document_id : null, textbook?.page ?? null);
  const showsMore = Boolean(page.data && textbook && locateExcerpt(page.data.text, textbook.quote));
  const sampled = sources.some((source) => source.sample);
  return (
    <>
      <div className="kicker" style={{ marginTop: 22 }}>
        Where this comes from
      </div>
      <ul className="sources" aria-label="Sources for this concept">
        {sources.map((source, i) => {
          const body = (
            <>
              <div className="src-head">
                <span className={`src-kind ${source.kind}`}>{SOURCE_LABEL[source.kind]}</span>
                {source.sample ? <span className="src-sample">Sample</span> : null}
              </div>
              <div className="src-quote">“{source.quote}”</div>
              <div className="src-meta">{sourceMeta(source)}</div>
            </>
          );
          const opens = source.kind === 'textbook' && showsMore && onOpenSource;
          return (
            <li key={`${source.kind}-${i}`}>
              {opens ? (
                <button type="button" className="srcrow link" onClick={() => onOpenSource(node, source)}>
                  {body}
                  <div className="src-open">Show it on the page →</div>
                </button>
              ) : (
                <div className="srcrow">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {sampled ? (
        <p className="hintline">
          Entries marked Sample were written for this demo. They are not quoted from NCERT or from CBSE papers.
        </p>
      ) : null}
    </>
  );
}

function PageLine({ citation }: { citation: MapNode['citation'] }): React.ReactElement | null {
  if (!citation) return null;
  const partial = citation.match_ratio != null && citation.match_ratio < 1;
  return (
    <div className="page">
      {citation.page != null ? <span>Page {citation.page} of the book</span> : null}
      {partial ? (
        <span className="partial">{(citation.match_ratio * 100).toFixed(0)}% of the sentence</span>
      ) : null}
    </div>
  );
}

/** Re-exported so the widget can size its shell to the same scale. */
export { TSIZE, CSIZE };
