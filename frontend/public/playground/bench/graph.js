/* ============================================================================
   bench/graph.js — the grapher. The first INSTRUMENT, as opposed to a primitive.

   play.js holds primitives: drag, clock, tween, sound, voice, track. It holds no
   instruments, and that is why 25 pages each grew their own axes. `motion/modeller`
   has `niceStep` and `drawAxes`; so do `light/theorist`, `circuits/tinkerer`,
   `vectors/theorist` and twenty-two others, each a little different and none of
   them zoomable. This file is that code written once, properly.

   WHAT "PROPERLY" MEANS HERE, and why each part is not optional:

     * An expression PARSER, not a menu of function families. A Theorist band page
       whose promise is "set the law yourself" cannot offer a dropdown of laws.
       `y = a·sin(bx + c)` has to be something a learner types.
     * SLIDERS FOUND, not declared. The free variables in what they typed become
       the sliders. A page that must declare its own sliders would have to parse
       the expression to know them — so the parser owns that answer.
     * PAN AND ZOOM with ticks that relabel at every scale. A fixed axis range is
       a teacher's answer to "where should we look", and the whole point of an
       instrument is that the learner gets to ask it themselves.
     * NUMERICS OVER ALGEBRA. Roots, extrema and intersections are found by
       scanning and bisecting the curve that is actually on screen. That is the
       repo's rule — SIMULATE THE THING, NOT THE ANSWER — applied to mathematics:
       the root appears because the sampled curve crossed zero, never because a
       quadratic formula was hard-coded next to a quadratic.

   NO DEPENDENCIES, because this repo has none and must keep none: every page is
   plain HTML over `play.js`, there is no build step, and nothing is fetched from
   a CDN. So the parser, the plotter and the 2-D projection are all hand-written.
   That also makes every one of these features cost nothing per use, forever —
   it is arithmetic in the learner's browser, not a call to a service.

   LOAD ORDER — `play.js` first, then this:
       <link rel="stylesheet" href="../../bench/graph.css">
       <script src="../../play.js"></script>
       <script src="../../bench/graph.js"></script>

   USE
       const g = Bench.graph({
         mount: document.getElementById('grapher'),
         view: {x0: -10, x1: 10, y0: -6.5, y1: 6.5},
         curves: [{expr: 'a*sin(b*x + c)'}, {fn: x => x * x, name: 'x²'}],
         xUnit: 'pi',                       // trig pages want π/2, not 1.5708
         features: {table: false},          // everything is on unless named off
         onChange: st => { ... },
       });
       g.setView({x0: 0, x1: 2 * Math.PI}); g.home(); g.state(); g.load(st);

   The maths layer is reachable on its own, with no DOM, as `Bench.graph.math`.
   `tests/bench-graph.test.js` asserts against it directly, and a page that only
   needs a root or a derivative should use it rather than mounting a grapher.
   ========================================================================== */
(function (root) {
'use strict';

const P = root.Play || {};
const clamp = P.clamp || ((v, a, b) => v < a ? a : v > b ? b : v);
const svgPoint = P.svgPoint || ((svg, e) => {
  const m = svg.getScreenCTM();
  if (!m) return {x: 0, y: 0};
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  const q = p.matrixTransform(m.inverse());
  return {x: q.x, y: q.y};
});
const esc = P.esc || (s => String(s).replace(/[&<>"]/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])));
const reduced = P.reduced || (() => false);

/* U+2212. The UI shows a real minus sign; the parser only ever reads ASCII. */
const MINUS = '−';
const neg = s => String(s).replace(/-/g, MINUS);

const SUP = {'-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴',
             5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};
const sup = n => String(n).split('').map(c => SUP[c] || c).join('');
const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);


/* ══════════════════════════════════════════════════════════════════════════
   1. The error. It carries a POSITION, because an expression row shows a caret
      under the offending character and "syntax error" alone cannot place one.
   ══════════════════════════════════════════════════════════════════════════ */
class GraphError extends Error {
  constructor(message, at){ super(message); this.name = 'GraphError'; this.at = at == null ? -1 : at; }
}


/* ══════════════════════════════════════════════════════════════════════════
   2. What a name can mean.

   `arity: -1` is variadic (min, max). Everything trigonometric is in RADIANS,
   which is not a preference: the Theorist band differentiates sin, and d/dx sin
   is cos only in radians. A degrees mode would silently break the calculus
   layer, so there is not one — a page that wants degrees converts in its own
   expression (`sin(x*pi/180)`).
   ══════════════════════════════════════════════════════════════════════════ */
const FUNCS = {
  sin:    {arity: 1, fn: Math.sin},
  cos:    {arity: 1, fn: Math.cos},
  tan:    {arity: 1, fn: Math.tan},
  sec:    {arity: 1, fn: x => 1 / Math.cos(x)},
  csc:    {arity: 1, fn: x => 1 / Math.sin(x)},
  cosec:  {arity: 1, fn: x => 1 / Math.sin(x)},
  cot:    {arity: 1, fn: x => 1 / Math.tan(x)},
  asin:   {arity: 1, fn: Math.asin},   arcsin: {arity: 1, fn: Math.asin},
  acos:   {arity: 1, fn: Math.acos},   arccos: {arity: 1, fn: Math.acos},
  atan:   {arity: 1, fn: Math.atan},   arctan: {arity: 1, fn: Math.atan},
  sinh:   {arity: 1, fn: Math.sinh},
  cosh:   {arity: 1, fn: Math.cosh},
  tanh:   {arity: 1, fn: Math.tanh},
  sqrt:   {arity: 1, fn: Math.sqrt},
  cbrt:   {arity: 1, fn: Math.cbrt},
  abs:    {arity: 1, fn: Math.abs},
  exp:    {arity: 1, fn: Math.exp},
  ln:     {arity: 1, fn: Math.log},
  log:    {arity: 1, fn: Math.log10},          // school "log" is base 10
  log10:  {arity: 1, fn: Math.log10},
  log2:   {arity: 1, fn: Math.log2},
  logb:   {arity: 2, fn: (b, x) => Math.log(x) / Math.log(b)},
  sign:   {arity: 1, fn: Math.sign},
  floor:  {arity: 1, fn: Math.floor},
  ceil:   {arity: 1, fn: Math.ceil},
  round:  {arity: 1, fn: Math.round},
  mod:    {arity: 2, fn: (a, b) => ((a % b) + b) % b},
  atan2:  {arity: 2, fn: Math.atan2},
  min:    {arity: -1, fn: (...a) => Math.min(...a)},
  max:    {arity: -1, fn: (...a) => Math.max(...a)},
};

const CONSTS = {pi: Math.PI, 'π': Math.PI, tau: 2 * Math.PI, 'τ': 2 * Math.PI, e: Math.E};

/* The plot variable. Anything else free becomes a slider — except these. */
const RESERVED = new Set(['x'].concat(Object.keys(CONSTS)));


/* ══════════════════════════════════════════════════════════════════════════
   3. Lexer.

   One decision worth naming: a run of letters that is NOT a known function or
   constant is SPLIT INTO SINGLE LETTERS, so `xy` is x·y and `2ab` is 2·a·b.
   This is what a learner writing algebra means, and it is what makes `sin` work
   at all — without the greedy match against FUNCS first, `sin(x)` would lex as
   s·i·n·(x). The two rules have to be in that order or neither is right.
   ══════════════════════════════════════════════════════════════════════════ */
const KNOWN = () => new Set(Object.keys(FUNCS).concat(Object.keys(CONSTS)));

function lex(src, declared){
  const s = String(src);
  const known = KNOWN();
  for (const d of declared || []) known.add(d);
  /* Longest known name first, so `log10` is not read as `log` then `10`. */
  const names = Array.from(known).sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;

  while (i < s.length) {
    const c = s[i];
    if (/[\s,]/.test(c)) { if (c === ',') out.push({t: ',', at: i}); i++; continue; }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      if (s[j] === '.') { j++; while (j < s.length && /[0-9]/.test(s[j])) j++; }
      if (s[j] === 'e' || s[j] === 'E') {               // 1e-3, and only when it parses
        let k = j + 1;
        if (s[k] === '+' || s[k] === '-') k++;
        if (/[0-9]/.test(s[k] || '')) { j = k; while (j < s.length && /[0-9]/.test(s[j])) j++; }
      }
      const text = s.slice(i, j);
      const v = +text;
      if (!isFinite(v)) throw new GraphError(`${text} is not a number`, i);
      out.push({t: 'num', v, at: i}); i = j; continue;
    }

    if (/[A-Za-z_Ͱ-Ͽ]/.test(c)) {
      const hit = names.find(n => s.startsWith(n, i) &&
        !/[A-Za-z_0-9Ͱ-Ͽ]/.test(s[i + n.length] || ''));
      if (hit) { out.push({t: 'name', v: hit, at: i}); i += hit.length; continue; }
      /* Not a known name: one letter, one variable. A trailing digit subscripts
         it, so `a1` and `a2` are two different sliders rather than a·1 and a·2. */
      let j = i + 1;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      out.push({t: 'name', v: s.slice(i, j), at: i}); i = j; continue;
    }

    if ('+-*/^()|'.includes(c)) { out.push({t: c, at: i}); i++; continue; }
    if (c === '×' || c === '·') { out.push({t: '*', at: i}); i++; continue; }
    if (c === '÷') { out.push({t: '/', at: i}); i++; continue; }
    if (c === '−') { out.push({t: '-', at: i}); i++; continue; }
    if (c === '[' || c === '{') { out.push({t: '(', at: i}); i++; continue; }
    if (c === ']' || c === '}') { out.push({t: ')', at: i}); i++; continue; }
    if (c === '√') { out.push({t: 'name', v: 'sqrt', at: i}); i++; continue; }

    throw new GraphError(`I do not know what to do with "${c}"`, i);
  }
  out.push({t: 'end', at: s.length});
  return out;
}


/* ══════════════════════════════════════════════════════════════════════════
   4. Parser — recursive descent.

       expr    := term (('+' | '-') term)*
       term    := unary ( ('*' | '/') unary | IMPLICIT unary )*
       unary   := ('-' | '+') unary | power
       power   := primary ('^' unary)?            right-associative
       primary := num | const | var | fn '(' args ')' | fn power
                | '(' expr ')' | '|' expr '|'

   Two precedence facts this shape gets right, and which a flatter parser gets
   wrong in a way a learner will notice:

     * `2x^2` is 2·(x²), not (2x)². Implicit multiplication happens in `term`,
       one level LOOSER than `^`, which lives in `power`.
     * `-x^2` is -(x²), because unary minus wraps a whole `power`.

   And `sin x` with no brackets takes a `power`, so `sin x^2` is sin(x²) and
   `sin x + 1` is sin(x) + 1 — which is how it reads aloud.
   ══════════════════════════════════════════════════════════════════════════ */
function parse(src, declared){
  const T = lex(src, declared);
  let i = 0, bars = 0;
  /* Every bracket still waiting for its partner, innermost last. Running out of
     tokens inside one is not "the expression stops here" — the useful answer is
     WHICH bracket was left open, and the caret goes under that. */
  const open = [];
  const peek = () => T[i];
  const at = () => T[i].at;
  const eat = t => { if (T[i].t !== t) return false; i++; return true; };
  /* `where` overrides the position, because the caret for "this bracket is never
     closed" belongs under the bracket that was left open and not under the end of
     the line, which is merely where we ran out of tokens looking for its partner. */
  const need = (t, what, where) => {
    if (T[i].t !== t) throw new GraphError(what || `expected ${t}`, where == null ? T[i].at : where);
    return T[i++];
  };

  /* Does the token at `i` begin a factor, with no operator in front of it?
     A '|' only opens a factor when we are not inside one — otherwise it is the
     closing bar of the |…| we are already in, and must be left for `primary`. */
  const startsFactor = () => {
    const t = T[i].t;
    return t === 'num' || t === 'name' || t === '(' || (t === '|' && bars === 0);
  };

  function expr(){
    let n = term();
    for (;;) {
      if (eat('+')) n = {t: 'add', a: n, b: term()};
      else if (eat('-')) n = {t: 'sub', a: n, b: term()};
      else return n;
    }
  }
  function term(){
    let n = unary();
    for (;;) {
      if (eat('*')) n = {t: 'mul', a: n, b: unary()};
      else if (eat('/')) n = {t: 'div', a: n, b: unary()};
      else if (startsFactor()) n = {t: 'mul', a: n, b: unary(), implicit: true};
      else return n;
    }
  }
  function unary(){
    const p = at();
    if (eat('-')) return {t: 'neg', a: unary(), at: p};
    if (eat('+')) return unary();
    return power();
  }
  function power(){
    const b = primary();
    if (eat('^')) return {t: 'pow', a: b, b: unary()};
    return b;
  }
  function primary(){
    const tok = peek();

    if (tok.t === 'num') { i++; return {t: 'num', v: tok.v, at: tok.at}; }

    if (tok.t === '(') {
      i++;
      open.push({at: tok.at, what: 'this bracket is never closed'});
      const n = expr();
      need(')', 'this bracket is never closed', tok.at);
      open.pop();
      return n;
    }

    if (tok.t === '|') {
      i++; bars++;
      open.push({at: tok.at, what: 'this | is never closed'});
      const n = expr();
      bars--;
      need('|', 'this | is never closed', tok.at);
      open.pop();
      return {t: 'call', f: 'abs', args: [n], at: tok.at};
    }

    if (tok.t === 'name') {
      i++;
      const name = tok.v;
      if (Object.prototype.hasOwnProperty.call(CONSTS, name))
        return {t: 'num', v: CONSTS[name], at: tok.at, konst: name};

      const f = FUNCS[name];
      if (f) {
        if (peek().t === '(') {
          const lp = peek().at;
          i++;
          open.push({at: lp, what: `${name}( is never closed`});
          const args = [];
          if (peek().t !== ')') { args.push(expr()); while (eat(',')) args.push(expr()); }
          need(')', `${name}( is never closed`, lp);
          open.pop();
          if (f.arity >= 0 && args.length !== f.arity)
            throw new GraphError(`${name} takes ${f.arity} ${f.arity === 1 ? 'number' : 'numbers'}, not ${args.length}`, tok.at);
          if (f.arity < 0 && !args.length)
            throw new GraphError(`${name} needs at least one number`, tok.at);
          return {t: 'call', f: name, args, at: tok.at};
        }
        if (f.arity !== 1)
          throw new GraphError(`${name} needs brackets: ${name}(…)`, tok.at);
        if (T[i].t === 'end' || T[i].t === ')' || T[i].t === '|')
          throw new GraphError(`${name} of what?`, tok.at);
        return {t: 'call', f: name, args: [power()], at: tok.at};
      }
      return {t: 'var', k: name, at: tok.at};
    }

    if (tok.t === 'end') {
      const o = open[open.length - 1];
      throw new GraphError(o ? o.what : 'the expression stops here', o ? o.at : tok.at);
    }
    throw new GraphError(`"${tok.t}" cannot start a value`, tok.at);
  }

  const ast = expr();
  if (T[i].t !== 'end') throw new GraphError('I cannot read past here', T[i].at);
  return ast;
}


/* ══════════════════════════════════════════════════════════════════════════
   5. Compile — AST to a closure tree.

   A closure tree and not `new Function`: a page may be served under a Content
   Security Policy that forbids eval, and a grapher that dies under CSP is a
   grapher that dies in the deployment and not on the laptop. The tree is built
   once per edit and called a few thousand times per repaint, so the cost that
   matters is the CALL, and a closure call is as cheap as the generated one.
   ══════════════════════════════════════════════════════════════════════════ */
function compile(ast){
  const build = n => {
    switch (n.t) {
      case 'num': { const v = n.v; return () => v; }
      case 'var': { const k = n.k; return s => { const v = s[k]; return v == null ? NaN : v; }; }
      case 'neg': { const a = build(n.a); return s => -a(s); }
      case 'add': { const a = build(n.a), b = build(n.b); return s => a(s) + b(s); }
      case 'sub': { const a = build(n.a), b = build(n.b); return s => a(s) - b(s); }
      case 'mul': { const a = build(n.a), b = build(n.b); return s => a(s) * b(s); }
      case 'div': { const a = build(n.a), b = build(n.b); return s => a(s) / b(s); }
      case 'pow': {
        const a = build(n.a), b = build(n.b);
        /* Math.pow(-8, 1/3) is NaN, but a learner who types x^(1/3) means the
           cube root and expects the left half of the curve to exist. An odd
           integer denominator is the one case where the real root is defined. */
        return s => {
          const x = a(s), y = b(s);
          if (x >= 0 || Number.isInteger(y)) return Math.pow(x, y);
          const inv = 1 / y;
          if (Math.abs(inv - Math.round(inv)) < 1e-9 && Math.round(inv) % 2 !== 0)
            return -Math.pow(-x, y);
          return NaN;
        };
      }
      case 'call': {
        const f = FUNCS[n.f].fn, as = n.args.map(build);
        if (as.length === 1) { const a = as[0]; return s => f(a(s)); }
        if (as.length === 2) { const a = as[0], b = as[1]; return s => f(a(s), b(s)); }
        return s => f(...as.map(g => g(s)));
      }
      default: throw new GraphError(`cannot compile ${n.t}`);
    }
  };
  return build(ast);
}

/* Every free name in the AST, in the order it was first written — so sliders
   appear left to right as they do in the expression. */
function freeVars(ast){
  const out = [];
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (n.t === 'var') { if (!RESERVED.has(n.k) && !out.includes(n.k)) out.push(n.k); return; }
    if (n.args) n.args.forEach(walk);
    walk(n.a); walk(n.b);
  };
  walk(ast);
  return out;
}

/* `y = …`, `f(x) = …` and a bare expression all mean the same thing. */
function stripLHS(src){
  const m = String(src).match(/^\s*(?:y|f\s*\(\s*x\s*\)|[a-z]\s*\(\s*x\s*\))\s*=\s*(.*)$/i);
  return m ? m[1] : String(src);
}

/** Parse + compile + find the sliders, in one call. Throws GraphError. */
function fn(src, declared){
  const body = stripLHS(src);
  if (!body.trim()) throw new GraphError('nothing to plot', 0);
  const ast = parse(body, declared);
  const f = compile(ast);
  const vars = freeVars(ast);
  const at = (x, scope) => { const s = Object.assign({x}, scope); const v = f(s); return typeof v === 'number' ? v : NaN; };
  return {ast, vars, body, eval: f, at};
}


/* ══════════════════════════════════════════════════════════════════════════
   6. Numerics. Every answer below is found on the sampled curve.
   ══════════════════════════════════════════════════════════════════════════ */

/* A step small enough to differentiate on, but never so small that
   (f(x+h) − f(x−h)) loses all its significant digits to cancellation. */
const hFor = (x, span) => Math.max(1e-7, (span || 1) * 1e-6, Math.abs(x) * 1e-7);

function deriv(g, x, span){
  const h = hFor(x, span);
  const a = g(x - h), b = g(x + h);
  if (!isFinite(a) || !isFinite(b)) {                 // one-sided at a domain edge
    const f0 = g(x);
    if (!isFinite(f0)) return NaN;
    if (isFinite(b)) return (b - f0) / h;
    if (isFinite(a)) return (f0 - a) / h;
    return NaN;
  }
  return (b - a) / (2 * h);
}

function deriv2(g, x, span){
  const h = Math.max(hFor(x, span), (span || 1) * 1e-4);
  const a = g(x - h), m = g(x), b = g(x + h);
  if (![a, m, b].every(isFinite)) return NaN;
  return (b - 2 * m + a) / (h * h);
}

/* Bisection, not Newton: the bracket is already known from the scan, bisection
   cannot diverge, and 80 halvings is exact to double precision. Newton would be
   faster and would also wander off a discontinuity into another root. */
function bisect(g, a, b, iter = 80){
  let fa = g(a), fb = g(b);
  if (!isFinite(fa) || !isFinite(fb) || fa === 0) return fa === 0 ? a : NaN;
  if (fb === 0) return b;
  if (fa > 0 === fb > 0) return NaN;
  for (let k = 0; k < iter; k++) {
    const m = (a + b) / 2, fm = g(m);
    if (!isFinite(fm)) return NaN;
    if (fm === 0) return m;
    if (fa > 0 === fm > 0) { a = m; fa = fm; } else { b = m; fb = fm; }
  }
  return (a + b) / 2;
}

/* A sign change between two samples is a root; a sign change ACROSS a
   discontinuity is not. `jump` rejects the second: if |f| grows without bound
   toward the crossing, it is a pole, not a zero. */
function roots(g, x0, x1, n = 2000, cap = 60){
  const out = [];
  const step = (x1 - x0) / n;
  let px = x0, pf = g(x0);
  for (let k = 1; k <= n && out.length < cap; k++) {
    const x = x0 + k * step, f = g(x);
    if (isFinite(pf) && isFinite(f) && pf !== 0 && (pf > 0) !== (f > 0)) {
      const r = bisect(g, px, x);
      /* THE POLE TEST, and it is a consequence of how bisection works rather than a
         heuristic with a magic number. Bisection keeps the sign-change bracket, so on
         a real root it drives |g| to zero, and on a pole it converges INTO the pole and
         |g| grows without bound. So a candidate is a root only if |g| there is no bigger
         than |g| at the NEARER end of the bracket.

         THE NEARER END, AND NOT THE FARTHER ONE, and the difference is not pedantic:
         when a sample lands on the pole itself that endpoint is already ~1e16, so a
         bound taken from the larger end is satisfied by anything and every asymptote
         reports a root. tan x over [-2pi, 2pi] at 1400 samples puts sample 875 exactly
         on pi/2 and is precisely that case — it is what this line was written against. */
      if (isFinite(r)) {
        const fr = g(r);
        const near = Math.min(Math.abs(pf), Math.abs(f));
        const real = isFinite(fr) && Math.abs(fr) <= near;
        if (real && !out.some(v => Math.abs(v - r) < Math.abs(step) * 0.5)) out.push(r);
      }
    } else if (f === 0 && !out.some(v => Math.abs(v - x) < Math.abs(step) * 0.5)) {
      out.push(x);
    }
    px = x; pf = f;
  }
  return out.sort((a, b) => a - b);
}

/* Extrema are the roots of the derivative, classified by the second. Sampling
   the derivative more coarsely than the function is deliberate: a numeric
   derivative is noisy, and a fine scan finds hundreds of fictitious turns. */
function extrema(g, x0, x1, n = 700, cap = 40){
  const span = x1 - x0;
  const d = x => deriv(g, x, span);
  return roots(d, x0, x1, n, cap).map(x => {
    const y = g(x), dd = deriv2(g, x, span);
    if (!isFinite(y)) return null;
    return {x, y, kind: !isFinite(dd) || Math.abs(dd) < 1e-9 ? 'flat' : dd < 0 ? 'max' : 'min'};
  }).filter(Boolean);
}

function intersections(g, h, x0, x1, n = 2000, cap = 40){
  const d = x => g(x) - h(x);
  return roots(d, x0, x1, n, cap)
    .map(x => ({x, y: g(x)}))
    .filter(p => isFinite(p.y));
}

/* Riemann sums as well as the closed answer, because the Theorist page teaches
   the limit: the learner watches `mid` at n = 4 become `mid` at n = 400. */
const RULES = {
  left:  (g, a, w, k) => g(a + k * w),
  right: (g, a, w, k) => g(a + (k + 1) * w),
  mid:   (g, a, w, k) => g(a + (k + 0.5) * w),
  trap:  (g, a, w, k) => (g(a + k * w) + g(a + (k + 1) * w)) / 2,
};

function integral(g, a, b, n = 400, rule = 'mid'){
  if (b < a) { const q = integral(g, b, a, n, rule); return q == null ? q : -q; }
  const w = (b - a) / n, pick = RULES[rule] || RULES.mid;
  let sum = 0, used = 0;
  for (let k = 0; k < n; k++) {
    const v = pick(g, a, w, k);
    if (isFinite(v)) { sum += v; used++; }
  }
  if (!used) return NaN;
  return sum * w * (n / used);          // rescale if part of the strip is undefined
}

/* Simpson, for the "exact" readout the Riemann sum is compared against. */
function simpson(g, a, b, n = 2000){
  if (b < a) { const q = simpson(g, b, a, n); return q == null ? q : -q; }
  const m = n % 2 ? n + 1 : n, w = (b - a) / m;
  let sum = 0;
  for (let k = 0; k <= m; k++) {
    const v = g(a + k * w);
    if (!isFinite(v)) return integral(g, a, b, 4000, 'mid');
    sum += v * (k === 0 || k === m ? 1 : k % 2 ? 4 : 2);
  }
  return sum * w / 3;
}


/* ══════════════════════════════════════════════════════════════════════════
   7. Ticks.

   `niceStep` is the one piece lifted verbatim in spirit from the pages that had
   it (`motion/modeller.html:263`), because it was right: a step from
   {1, 2, 2.5, 5} × 10^k is the set a reader can do arithmetic in.

   The π mode is not decoration. On `trig/modeller` the interesting x values ARE
   π/6, π/4, π/2 — and a tick labelled 1.5708 hides the very fact the page is
   about. So in that mode the step is a RATIONAL MULTIPLE OF π and the label is
   printed as that fraction.
   ══════════════════════════════════════════════════════════════════════════ */
const STEPS = [1, 2, 2.5, 5, 10];

function niceStep(span, target = 8){
  if (!(span > 0)) return 1;
  const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const k of STEPS) if (k * p >= raw - 1e-12) return k * p;
  return 10 * p;
}

/* π steps as {num, den}: π/12 … 4π. */
const PI_STEPS = [[1, 12], [1, 6], [1, 4], [1, 3], [1, 2], [1, 1], [2, 1], [4, 1]];

function piStep(span, target = 8){
  const want = span / Math.PI / target;
  for (const [n, d] of PI_STEPS) if (n / d >= want - 1e-12) return {num: n, den: d};
  const k = Math.pow(2, Math.ceil(Math.log2(Math.max(want, 1))));
  return {num: k, den: 1};
}

function piLabel(m, step){
  let n = m * step.num, d = step.den;
  if (n === 0) return '0';
  const s = n < 0 ? MINUS : '';
  n = Math.abs(n);
  const g = gcd(n, d) || 1;
  n /= g; d /= g;
  const head = n === 1 ? 'π' : n + 'π';
  return s + (d === 1 ? head : head + '/' + d);
}

/** A number for an axis label: never more decimals than the step justifies. */
function label(v, step){
  if (!isFinite(v)) return v > 0 ? '∞' : MINUS + '∞';
  if (Math.abs(v) < step * 1e-6) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-5) {
    const ex = Math.floor(Math.log10(a));
    const man = +(v / Math.pow(10, ex)).toFixed(2);
    return neg(String(man === 1 ? '' : man === -1 ? MINUS : man)) + '10' + sup(ex);
  }
  /* A 2.5 step needs one more decimal than its size suggests, or 2.5 and 5.0 both
     print as "3" and "5". Detected from the mantissa so it holds at every scale —
     0.025 is the same case as 2.5 and a text match for "2.5" misses it. */
  const man = step / Math.pow(10, Math.floor(Math.log10(step)));
  const dp = clamp(Math.ceil(-Math.log10(step)) + (Math.abs(man - 2.5) < 1e-9 ? 1 : 0), 0, 8);
  let s = v.toFixed(dp);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return neg(s);
}

/** The ticks for one axis. `unit: 'pi'` switches to rational multiples of π. */
function ticks(lo, hi, target = 8, unit = 'plain'){
  const out = [];
  if (!(hi > lo)) return out;
  if (unit === 'pi') {
    const st = piStep(hi - lo, target), w = Math.PI * st.num / st.den;
    const m0 = Math.ceil(lo / w - 1e-9), m1 = Math.floor(hi / w + 1e-9);
    for (let m = m0; m <= m1; m++) out.push({v: m * w, text: piLabel(m, st), zero: m === 0, step: w});
    return out;
  }
  const st = niceStep(hi - lo, target);
  const k0 = Math.ceil(lo / st - 1e-9), k1 = Math.floor(hi / st + 1e-9);
  for (let k = k0; k <= k1; k++) {
    const v = k * st;
    out.push({v, text: label(v, st), zero: k === 0, step: st});
  }
  return out;
}


/* ══════════════════════════════════════════════════════════════════════════
   8. Sampling a curve into an SVG path.

   The part that is easy to get wrong is tan and 1/x. A plotter that joins every
   consecutive sample draws a vertical line up the asymptote, and a learner reads
   that line as part of the function — it is the single most common lie a school
   grapher tells. So: a step whose screen rise exceeds the plot height AND whose
   sign flips is a POLE, the path breaks there, and four bisections walk each end
   in toward the pole so the two branches reach for it instead of stopping short.
   ══════════════════════════════════════════════════════════════════════════ */
function samplePath(at, scope, view, box, opts){
  const o = opts || {};
  const N = Math.max(240, Math.round(box.w * (o.density || 2)));
  const xs = view.x1 - view.x0, ys = view.y1 - view.y0;
  const sx = x => box.x + (x - view.x0) / xs * box.w;
  const sy = y => box.y + box.h - (y - view.y0) / ys * box.h;
  /* Draw a band outside the box so a steep line leaves the frame at the right
     angle, then let SVG clip it. Clamping to the box itself would bend it. */
  const guard = ys * 3;
  const yLo = view.y0 - guard, yHi = view.y1 + guard;

  let d = '', pen = false, n = 0;
  const g = x => at(x, scope);

  const moveTo = (x, y) => { d += `M${sx(x).toFixed(2)} ${sy(clamp(y, yLo, yHi)).toFixed(2)}`; pen = true; n++; };
  const lineTo = (x, y) => { d += `L${sx(x).toFixed(2)} ${sy(clamp(y, yLo, yHi)).toFixed(2)}`; n++; };

  /* Walk from a good sample toward a bad one, to get as close to the pole as
     the eye can tell. Returns the last x that still evaluated sanely. */
  const creep = (good, bad) => {
    let a = good, b = bad;
    for (let k = 0; k < 4; k++) {
      const m = (a + b) / 2, v = g(m);
      if (isFinite(v) && Math.abs(v) < guard * 40) a = m; else b = m;
    }
    return a;
  };

  let px = null, pf = NaN;
  for (let i = 0; i <= N; i++) {
    const x = view.x0 + xs * i / N;
    const f = g(x);
    const okNow = isFinite(f), okPrev = isFinite(pf);

    if (!okNow) {
      if (okPrev && pen) { const xe = creep(px, x); const fe = g(xe); if (isFinite(fe)) lineTo(xe, fe); }
      pen = false; px = x; pf = f; continue;
    }
    if (!okPrev) {
      const xs0 = px == null ? x : creep(x, px);
      const f0 = g(xs0);
      if (isFinite(f0)) moveTo(xs0, f0); else moveTo(x, f);
      if (xs0 !== x) lineTo(x, f);
      px = x; pf = f; continue;
    }

    const rise = Math.abs(sy(clamp(f, yLo, yHi)) - sy(clamp(pf, yLo, yHi)));
    const flipped = (pf > 0) !== (f > 0);
    const huge = Math.abs(f) > ys * 8 && Math.abs(pf) > ys * 8;
    if (pen && rise > box.h * 1.2 && flipped && huge) {
      const xa = creep(px, x), fa = g(xa);
      if (isFinite(fa)) lineTo(xa, fa);
      const xb = creep(x, px), fb = g(xb);
      pen = false;
      if (isFinite(fb)) { moveTo(xb, fb); lineTo(x, f); }
      else moveTo(x, f);
      px = x; pf = f; continue;
    }

    if (!pen) moveTo(x, f); else lineTo(x, f);
    px = x; pf = f;
  }
  return {d, points: n};
}


/* ══════════════════════════════════════════════════════════════════════════
   9. Colours. Enough to tell six curves apart, and distinguishable without
      relying on hue alone — each has a different lightness too, so the legend
      still works for a red–green colour-blind reader and in a photocopy.
   ══════════════════════════════════════════════════════════════════════════ */
const INK = ['#2563a8', '#c0392b', '#1e8449', '#8e44ad', '#b9770e', '#117a8b'];

const DEFAULT_FEATURES = {
  expr: true, sliders: true, zoom: true, trace: true,
  marks: true, tangent: true, area: true, table: true, legend: true,
};


/* ══════════════════════════════════════════════════════════════════════════
   10. The instrument.
   ══════════════════════════════════════════════════════════════════════════ */
const VB = {w: 1000, h: 620};
const PAD = {l: 58, r: 16, t: 16, b: 40};
const BOX = {x: PAD.l, y: PAD.t, w: VB.w - PAD.l - PAD.r, h: VB.h - PAD.t - PAD.b};

let SEQ = 0;

function graph(opts){
  const o = opts || {};
  const host = typeof o.mount === 'string' ? document.getElementById(o.mount) : o.mount;
  if (!host) throw new GraphError('graph() needs a mount element');
  const FF = Object.assign({}, DEFAULT_FEATURES, o.features || {});
  const uid = 'bg' + (++SEQ);
  const xUnit = o.xUnit === 'pi' ? 'pi' : 'plain';
  const home = Object.assign({x0: -10, x1: 10, y0: -6.2, y1: 6.2}, o.view || {});

  const S = {
    view: Object.assign({}, home),
    rows: [],                 // {id, src, color, on, f, err, name, fixed}
    sliders: {},              // name -> {min, max, step, value}
    trace: {on: false, row: 0, x: 0},
    tangent: {on: false, x: 1},
    area: {on: false, a: -1, b: 1, n: 8, rule: 'mid'},
    table: {on: false, start: -3, step: 1, rows: 7},
  };

  /* ---- DOM ---------------------------------------------------------------- */
  host.classList.add('bg');
  host.innerHTML = `
    <div class="bg-side">
      <div class="bg-rows" id="${uid}rows"></div>
      ${FF.expr ? `<button class="bg-add" id="${uid}add" type="button">+ add a curve</button>` : ''}
      <div class="bg-sliders" id="${uid}sl"></div>
    </div>
    <div class="bg-main">
      <svg class="bg-stage" id="${uid}svg" viewBox="0 0 ${VB.w} ${VB.h}"
           role="application" tabindex="0"
           aria-label="A graph. Drag to pan, scroll to zoom, arrow keys move the trace.">
        <defs><clipPath id="${uid}clip"><rect x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}"/></clipPath></defs>
        <rect class="bg-paper" x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}"/>
        <g class="bg-grid" id="${uid}grid"></g>
        <g class="bg-axes" id="${uid}axes"></g>
        <g clip-path="url(#${uid}clip)">
          <g class="bg-tools" id="${uid}tools"></g>
          <g class="bg-curves" id="${uid}curves"></g>
          <g class="bg-marks" id="${uid}marks"></g>
          <g class="bg-trace" id="${uid}tr"></g>
        </g>
        <rect class="bg-hit" id="${uid}hit" x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" fill="transparent"/>
      </svg>
      <div class="bg-bar">
        ${FF.zoom ? `<span class="bg-grp">
          <button type="button" data-z="in"  aria-label="Zoom in">+</button>
          <button type="button" data-z="out" aria-label="Zoom out">−</button>
          <button type="button" data-z="sq">square</button>
          <button type="button" data-z="fit">fit</button>
          <button type="button" data-z="home">home</button>
        </span>` : ''}
        <span class="bg-grp">
          ${FF.trace   ? `<button type="button" data-t="trace">trace</button>` : ''}
          ${FF.marks   ? `<button type="button" data-t="marks">points</button>` : ''}
          ${FF.tangent ? `<button type="button" data-t="tangent">tangent</button>` : ''}
          ${FF.area    ? `<button type="button" data-t="area">area</button>` : ''}
          ${FF.table   ? `<button type="button" data-t="table">table</button>` : ''}
        </span>
        <span class="bg-read" id="${uid}read" aria-live="polite"></span>
      </div>
      <div class="bg-panels">
        <div class="bg-panel" id="${uid}pTan" hidden></div>
        <div class="bg-panel" id="${uid}pArea" hidden></div>
        <div class="bg-panel" id="${uid}pTable" hidden></div>
      </div>
    </div>`;

  const $ = id => host.querySelector('#' + uid + id);
  const svg = $('svg');

  /* ---- rows --------------------------------------------------------------- */
  const declared = () => Object.keys(S.sliders);

  function recompile(r){
    r.err = null; r.f = null; r.vars = [];
    if (r.fixed) { r.f = {at: (x) => r.fixed(x), vars: []}; return; }
    const src = String(r.src || '').trim();
    if (!src) return;
    try {
      const c = fn(src, declared());
      r.f = c; r.vars = c.vars;
    } catch (e) {
      if (!(e instanceof GraphError)) throw e;
      r.err = e;
    }
  }

  function syncSliders(){
    const want = [];
    for (const r of S.rows) for (const v of (r.vars || [])) if (!want.includes(v)) want.push(v);
    for (const v of want) if (!S.sliders[v]) {
      const seed = (o.sliders || {})[v] || {};
      S.sliders[v] = {min: seed.min == null ? -5 : +seed.min, max: seed.max == null ? 5 : +seed.max,
                      step: seed.step == null ? 0.1 : +seed.step,
                      value: seed.value == null ? 1 : +seed.value};
    }
    for (const k of Object.keys(S.sliders)) if (!want.includes(k)) delete S.sliders[k];
    return want;
  }

  const scope = () => {
    const s = {};
    for (const k of Object.keys(S.sliders)) s[k] = S.sliders[k].value;
    return s;
  };
  const live = () => S.rows.filter(r => r.on && r.f && !r.err);
  const rowAt = i => S.rows[i] || live()[0] || null;

  function addRow(spec){
    const s = spec || {};
    const r = {
      id: 'r' + (S.rows.length + 1) + '_' + Date.now().toString(36),
      src: s.expr == null ? '' : String(s.expr),
      fixed: typeof s.fn === 'function' ? s.fn : null,
      name: s.name || null,
      color: s.color || INK[S.rows.length % INK.length],
      on: s.on !== false,
      err: null, f: null, vars: [],
    };
    S.rows.push(r);
    recompile(r);
    return r;
  }

  /* ---- geometry ----------------------------------------------------------- */
  const sx = x => BOX.x + (x - S.view.x0) / (S.view.x1 - S.view.x0) * BOX.w;
  const sy = y => BOX.y + BOX.h - (y - S.view.y0) / (S.view.y1 - S.view.y0) * BOX.h;
  const mx = px => S.view.x0 + (px - BOX.x) / BOX.w * (S.view.x1 - S.view.x0);
  const my = py => S.view.y0 + (BOX.y + BOX.h - py) / BOX.h * (S.view.y1 - S.view.y0);
  const spanX = () => S.view.x1 - S.view.x0;
  const spanY = () => S.view.y1 - S.view.y0;

  /* A zoom limit, because double precision runs out: past ~1e-9 of span the
     tick labels start repeating and the curve turns to noise. Better to stop. */
  const MINSPAN = 1e-9, MAXSPAN = 1e9;

  function zoomAt(k, cx, cy, axis){
    const v = S.view;
    if (axis !== 'y') {
      const w = clamp(spanX() * k, MINSPAN, MAXSPAN);
      const t = (cx - v.x0) / spanX();
      v.x0 = cx - t * w; v.x1 = v.x0 + w;
    }
    if (axis !== 'x') {
      const h = clamp(spanY() * k, MINSPAN, MAXSPAN);
      const t = (cy - v.y0) / spanY();
      v.y0 = cy - t * h; v.y1 = v.y0 + h;
    }
    paint();
  }

  function square(){
    const c = (S.view.y0 + S.view.y1) / 2, h = spanX() * (BOX.h / BOX.w);
    S.view.y0 = c - h / 2; S.view.y1 = c + h / 2;
    paint();
  }

  /* "fit" asks the curves where they are, rather than guessing a range — a
     percentile and not the extremes, or one pole sets the scale for everything. */
  function fit(){
    const ys = [];
    const sc = scope();
    for (const r of live()) for (let i = 0; i <= 400; i++) {
      const y = r.f.at(S.view.x0 + spanX() * i / 400, sc);
      if (isFinite(y)) ys.push(y);
    }
    if (ys.length < 8) return;
    ys.sort((a, b) => a - b);
    const lo = ys[Math.floor(ys.length * 0.02)], hi = ys[Math.floor(ys.length * 0.98)];
    const pad = Math.max((hi - lo) * 0.12, 1e-6);
    S.view.y0 = lo - pad; S.view.y1 = hi + pad;
    paint();
  }

  /* ---- paint -------------------------------------------------------------- */
  function paintAxes(){
    const tx = ticks(S.view.x0, S.view.x1, 9, xUnit);
    const ty = ticks(S.view.y0, S.view.y1, 7, 'plain');
    let grid = '', ax = '';
    for (const t of tx) {
      const x = sx(t.v).toFixed(1);
      grid += `<line x1="${x}" y1="${BOX.y}" x2="${x}" y2="${BOX.y + BOX.h}" class="${t.zero ? 'bg-zero' : ''}"/>`;
      ax += `<text x="${x}" y="${BOX.y + BOX.h + 20}" text-anchor="middle">${esc(t.text)}</text>`;
    }
    for (const t of ty) {
      const y = sy(t.v).toFixed(1);
      grid += `<line x1="${BOX.x}" y1="${y}" x2="${BOX.x + BOX.w}" y2="${y}" class="${t.zero ? 'bg-zero' : ''}"/>`;
      if (!(t.zero && S.view.x0 < 0 && S.view.x1 > 0))
        ax += `<text x="${BOX.x - 8}" y="${(+y + 4).toFixed(1)}" text-anchor="end">${esc(t.text)}</text>`;
    }
    /* The axes themselves, drawn only where they are actually in frame. */
    if (S.view.y0 < 0 && S.view.y1 > 0)
      ax += `<line class="bg-axis" x1="${BOX.x}" y1="${sy(0).toFixed(1)}" x2="${BOX.x + BOX.w}" y2="${sy(0).toFixed(1)}"/>`;
    if (S.view.x0 < 0 && S.view.x1 > 0)
      ax += `<line class="bg-axis" x1="${sx(0).toFixed(1)}" y1="${BOX.y}" x2="${sx(0).toFixed(1)}" y2="${BOX.y + BOX.h}"/>`;
    $('grid').innerHTML = grid;
    $('axes').innerHTML = ax;
  }

  function paintCurves(){
    const sc = scope();
    let s = '';
    for (const r of S.rows) {
      if (!r.on || !r.f || r.err) continue;
      const {d} = samplePath(r.f.at, sc, S.view, BOX, {});
      if (d) s += `<path d="${d}" stroke="${r.color}" data-row="${r.id}"/>`;
    }
    $('curves').innerHTML = s;
  }

  function paintMarks(){
    if (!FF.marks || !S.marksOn) { $('marks').innerHTML = ''; return; }
    const sc = scope();
    const L = live();
    let s = '';
    const dot = (x, y, cls, title) =>
      `<circle cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="5" class="${cls}"><title>${esc(title)}</title></circle>`;
    for (const r of L) {
      const g = x => r.f.at(x, sc);
      for (const x of roots(g, S.view.x0, S.view.x1, 1400, 24))
        s += dot(x, 0, 'bg-root', `root at x = ${label(x, spanX() / 1000)}`);
      for (const e of extrema(g, S.view.x0, S.view.x1, 500, 16))
        if (e.y >= S.view.y0 && e.y <= S.view.y1)
          s += dot(e.x, e.y, 'bg-ext bg-' + e.kind,
            `${e.kind === 'max' ? 'maximum' : e.kind === 'min' ? 'minimum' : 'flat'} at (${label(e.x, spanX() / 1000)}, ${label(e.y, spanY() / 1000)})`);
    }
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const g = x => L[i].f.at(x, sc), h = x => L[j].f.at(x, sc);
      for (const p of intersections(g, h, S.view.x0, S.view.x1, 1400, 16))
        if (p.y >= S.view.y0 && p.y <= S.view.y1)
          s += dot(p.x, p.y, 'bg-cross',
            `they meet at (${label(p.x, spanX() / 1000)}, ${label(p.y, spanY() / 1000)})`);
    }
    $('marks').innerHTML = s;
  }

  function paintTools(){
    let s = '';
    const sc = scope();
    if (S.tangent.on) {
      const r = rowAt(S.trace.row);
      if (r && r.f) {
        const x0 = S.tangent.x, y0 = r.f.at(x0, sc), m = deriv(x => r.f.at(x, sc), x0, spanX());
        if (isFinite(y0) && isFinite(m)) {
          const xa = S.view.x0, xb = S.view.x1;
          s += `<line class="bg-tan" x1="${sx(xa).toFixed(1)}" y1="${sy(y0 + m * (xa - x0)).toFixed(1)}"
                     x2="${sx(xb).toFixed(1)}" y2="${sy(y0 + m * (xb - x0)).toFixed(1)}"/>`;
          s += `<circle class="bg-tanpt" cx="${sx(x0).toFixed(1)}" cy="${sy(y0).toFixed(1)}" r="7"/>`;
        }
      }
    }
    if (S.area.on) {
      const r = rowAt(S.trace.row);
      if (r && r.f) {
        const g = x => r.f.at(x, sc);
        const a = Math.min(S.area.a, S.area.b), b = Math.max(S.area.a, S.area.b);
        const w = (b - a) / S.area.n;
        for (let k = 0; k < S.area.n; k++) {
          const h = (RULES[S.area.rule] || RULES.mid)(g, a, w, k);
          if (!isFinite(h)) continue;
          const yTop = sy(Math.max(h, 0)), yBot = sy(Math.min(h, 0));
          s += `<rect class="bg-slice ${h < 0 ? 'bg-negslice' : ''}" x="${sx(a + k * w).toFixed(2)}"
                      y="${yTop.toFixed(2)}" width="${Math.abs(sx(a + w) - sx(a)).toFixed(2)}"
                      height="${Math.abs(yBot - yTop).toFixed(2)}"/>`;
        }
        s += `<line class="bg-edge" x1="${sx(a).toFixed(1)}" y1="${BOX.y}" x2="${sx(a).toFixed(1)}" y2="${BOX.y + BOX.h}"/>`;
        s += `<line class="bg-edge" x1="${sx(b).toFixed(1)}" y1="${BOX.y}" x2="${sx(b).toFixed(1)}" y2="${BOX.y + BOX.h}"/>`;
      }
    }
    $('tools').innerHTML = s;
  }

  function paintTrace(){
    if (!S.trace.on) { $('tr').innerHTML = ''; return; }
    const r = rowAt(S.trace.row);
    if (!r || !r.f) { $('tr').innerHTML = ''; return; }
    const x = clamp(S.trace.x, S.view.x0, S.view.x1), y = r.f.at(x, scope());
    if (!isFinite(y)) {
      $('tr').innerHTML = `<line class="bg-cross-h" x1="${sx(x).toFixed(1)}" y1="${BOX.y}" x2="${sx(x).toFixed(1)}" y2="${BOX.y + BOX.h}"/>`;
      return;
    }
    $('tr').innerHTML =
      `<line class="bg-cross-h" x1="${sx(x).toFixed(1)}" y1="${BOX.y}" x2="${sx(x).toFixed(1)}" y2="${BOX.y + BOX.h}"/>
       <circle class="bg-dot" cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="7" fill="${r.color}"/>`;
  }

  function paintRead(){
    const bits = [];
    const sc = scope();
    if (S.trace.on) {
      const r = rowAt(S.trace.row);
      if (r && r.f) {
        const x = clamp(S.trace.x, S.view.x0, S.view.x1), y = r.f.at(x, sc);
        bits.push(`<b>(${label(x, spanX() / 700)}, ${isFinite(y) ? label(y, spanY() / 700) : 'undefined'})</b>`);
      }
    }
    if (S.tangent.on) {
      const r = rowAt(S.trace.row);
      if (r && r.f) {
        const m = deriv(x => r.f.at(x, sc), S.tangent.x, spanX());
        bits.push(`slope <b>${isFinite(m) ? label(m, 1e-3) : '—'}</b> at x = ${label(S.tangent.x, spanX() / 700)}`);
      }
    }
    if (S.area.on) {
      const r = rowAt(S.trace.row);
      if (r && r.f) {
        const g = x => r.f.at(x, sc);
        const a = Math.min(S.area.a, S.area.b), b = Math.max(S.area.a, S.area.b);
        const approx = integral(g, a, b, S.area.n, S.area.rule), exact = simpson(g, a, b);
        bits.push(`sum <b>${isFinite(approx) ? label(approx, 1e-4) : '—'}</b> vs <b>${isFinite(exact) ? label(exact, 1e-4) : '—'}</b>`);
      }
    }
    $('read').innerHTML = bits.join(' · ');
  }

  function paintRows(){
    if (!FF.expr) { $('rows').innerHTML = ''; return; }
    $('rows').innerHTML = S.rows.map((r, i) => `
      <div class="bg-row ${r.err ? 'bad' : ''} ${i === S.trace.row ? 'sel' : ''}" data-i="${i}">
        <button class="bg-chip" type="button" data-on="${i}" style="--chip:${r.color}"
                aria-pressed="${r.on}" aria-label="${r.on ? 'Hide' : 'Show'} this curve">${r.on ? '' : '✕'}</button>
        ${r.fixed
          ? `<span class="bg-fixed">${esc(r.name || 'the page’s own curve')}</span>`
          : `<input class="bg-in" data-src="${i}" value="${esc(r.src)}" spellcheck="false"
                    autocapitalize="off" autocomplete="off" aria-label="Expression ${i + 1}"
                    placeholder="y = ">`}
        ${r.fixed ? '' : `<button class="bg-del" type="button" data-del="${i}" aria-label="Delete">✕</button>`}
        ${r.err ? `<div class="bg-err">${esc(r.err.message)}</div>` : ''}
      </div>`).join('');
  }

  function paintSliders(){
    const names = syncSliders();
    if (!FF.sliders || !names.length) { $('sl').innerHTML = ''; return; }
    $('sl').innerHTML = names.map(k => {
      const s = S.sliders[k];
      return `<div class="bg-sl">
        <label for="${uid}s_${k}">${esc(k)}</label>
        <input id="${uid}s_${k}" type="range" data-sl="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}">
        <output>${neg(String(+s.value.toFixed(3)))}</output>
      </div>`;
    }).join('');
  }

  function paintPanels(){
    const tan = $('pTan'), ar = $('pArea'), tb = $('pTable');
    if (tan) {
      tan.hidden = !S.tangent.on;
      if (S.tangent.on) tan.innerHTML =
        `<span class="bg-kick">tangent</span>
         <label>at x <input type="number" data-tanx step="0.1" value="${+S.tangent.x.toFixed(4)}"></label>
         <span class="bg-hint">drag the ring on the curve</span>`;
    }
    if (ar) {
      ar.hidden = !S.area.on;
      if (S.area.on) ar.innerHTML =
        `<span class="bg-kick">area</span>
         <label>from <input type="number" data-a step="0.1" value="${+S.area.a.toFixed(4)}"></label>
         <label>to <input type="number" data-b step="0.1" value="${+S.area.b.toFixed(4)}"></label>
         <label>strips <input type="range" data-n min="1" max="200" step="1" value="${S.area.n}"><output>${S.area.n}</output></label>
         <label>rule <select data-rule>${['left', 'right', 'mid', 'trap']
            .map(k => `<option value="${k}"${k === S.area.rule ? ' selected' : ''}>${k}</option>`).join('')}</select></label>`;
    }
    if (tb) {
      tb.hidden = !S.table.on;
      if (S.table.on) {
        const sc = scope(), L = live();
        let head = '<tr><th>x</th>' + L.map(r => `<th style="color:${r.color}">${esc(r.name || r.src || 'y')}</th>`).join('') + '</tr>';
        let body = '';
        for (let k = 0; k < S.table.rows; k++) {
          const x = S.table.start + k * S.table.step;
          body += `<tr><td>${label(x, Math.abs(S.table.step) / 100 || 1e-3)}</td>` +
            L.map(r => { const y = r.f.at(x, sc); return `<td>${isFinite(y) ? label(y, 1e-4) : '—'}</td>`; }).join('') + '</tr>';
        }
        tb.innerHTML =
          `<span class="bg-kick">table</span>
           <label>from <input type="number" data-ts step="0.5" value="${S.table.start}"></label>
           <label>step <input type="number" data-td step="0.5" value="${S.table.step}"></label>
           <label>rows <input type="number" data-tr min="2" max="40" value="${S.table.rows}"></label>
           <table class="bg-table">${head}${body}</table>`;
      }
    }
  }

  function paintBar(){
    for (const b of host.querySelectorAll('.bg-bar [data-t]')) {
      const k = b.getAttribute('data-t');
      const on = k === 'trace' ? S.trace.on : k === 'marks' ? !!S.marksOn
               : k === 'tangent' ? S.tangent.on : k === 'area' ? S.area.on : S.table.on;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('on', !!on);
    }
  }

  let queued = false;
  function paint(){
    paintAxes(); paintCurves(); paintTools(); paintMarks(); paintTrace(); paintRead();
    paintPanels(); paintBar();
    if (o.onChange) o.onChange(state());
  }
  /* One repaint per frame. A slider drag fires far faster than the numerics can
     scan, and without this the marks layer is what makes the drag feel heavy. */
  function soon(){
    if (queued) return;
    queued = true;
    (root.requestAnimationFrame || (f => setTimeout(f, 16)))(() => { queued = false; paint(); });
  }
  function rebuild(){
    for (const r of S.rows) recompile(r);
    paintRows(); paintSliders(); paint();
  }

  /* ---- interaction -------------------------------------------------------- */
  const hit = $('hit');

  if (FF.zoom) {
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const p = svgPoint(svg, e);
      const k = Math.pow(1.0016, e.deltaY);
      /* shift = x only, alt/ctrl = y only. The modifiers are the ones Desmos
         uses, so a learner who already knows one knows this. */
      zoomAt(k, mx(p.x), my(p.y), e.shiftKey ? 'x' : (e.altKey || e.ctrlKey) ? 'y' : null);
    }, {passive: false});

    let pan = null;
    if (P.drag) P.drag(hit, svg, {
      start: p => {
        if (S.trace.on || S.tangent.on || S.area.on) return false;   // those own the drag
        pan = {x: mx(p.x), y: my(p.y)};
      },
      move: p => {
        if (!pan) return;
        const dx = pan.x - mx(p.x), dy = pan.y - my(p.y);
        S.view.x0 += dx; S.view.x1 += dx; S.view.y0 += dy; S.view.y1 += dy;
        soon();
      },
      end: () => { pan = null; },
    });

    host.addEventListener('click', e => {
      const z = e.target.closest('[data-z]');
      if (!z) return;
      const k = z.getAttribute('data-z');
      const cx = (S.view.x0 + S.view.x1) / 2, cy = (S.view.y0 + S.view.y1) / 2;
      if (k === 'in') zoomAt(1 / 1.6, cx, cy);
      else if (k === 'out') zoomAt(1.6, cx, cy);
      else if (k === 'sq') square();
      else if (k === 'fit') fit();
      else if (k === 'home') { S.view = Object.assign({}, home); paint(); }
    });
  }

  /* Trace, tangent and area all grab the same pointer, so one handler decides
     which of them the gesture belongs to — nearest live thing wins. */
  function grabAt(p){
    const x = mx(p.x);
    if (S.tangent.on && Math.abs(sx(S.tangent.x) - p.x) < 22) return 'tan';
    if (S.area.on) {
      if (Math.abs(sx(S.area.a) - p.x) < 16) return 'a';
      if (Math.abs(sx(S.area.b) - p.x) < 16) return 'b';
    }
    if (S.trace.on) return 'trace';
    if (S.tangent.on) return 'tan';
    if (S.area.on) return Math.abs(x - S.area.a) < Math.abs(x - S.area.b) ? 'a' : 'b';
    return null;
  }

  let grab = null;
  if (P.drag) P.drag(hit, svg, {
    start: p => {
      grab = grabAt(p);
      if (!grab) return false;
      /* Pick the curve the pointer is nearest to, so trace follows the one the
         learner is actually looking at rather than always the first row. */
      if (grab === 'trace') {
        const L = live(); const sc = scope();
        let best = -1, bd = Infinity;
        for (const r of L) {
          const y = r.f.at(mx(p.x), sc);
          if (!isFinite(y)) continue;
          const d = Math.abs(sy(y) - p.y);
          if (d < bd) { bd = d; best = S.rows.indexOf(r); }
        }
        if (best >= 0) S.trace.row = best;
      }
      move(p);
    },
    move: p => move(p),
    end: () => { grab = null; },
  });

  function move(p){
    const x = clamp(mx(p.x), S.view.x0, S.view.x1);
    if (grab === 'trace') S.trace.x = x;
    else if (grab === 'tan') S.tangent.x = x;
    else if (grab === 'a') S.area.a = x;
    else if (grab === 'b') S.area.b = x;
    else return;
    soon();
  }

  svg.addEventListener('keydown', e => {
    const step = spanX() / (e.shiftKey ? 200 : 40);
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const d = (k === 'ArrowLeft' ? -1 : 1) * step;
      if (S.trace.on) S.trace.x = clamp(S.trace.x + d, S.view.x0, S.view.x1);
      else if (S.tangent.on) S.tangent.x += d;
      else { S.view.x0 += d; S.view.x1 += d; }
      e.preventDefault(); soon();
    } else if (k === '+' || k === '=' || k === '-' || k === '_') {
      zoomAt(k === '-' || k === '_' ? 1.6 : 1 / 1.6,
             (S.view.x0 + S.view.x1) / 2, (S.view.y0 + S.view.y1) / 2);
      e.preventDefault();
    }
  });

  host.addEventListener('input', e => {
    const t = e.target;
    const g = a => t.getAttribute(a);
    if (g('data-src') != null) {
      const r = S.rows[+g('data-src')];
      if (!r) return;
      r.src = t.value;
      recompile(r);
      /* Re-render the rows only to move the error line, and keep focus and the
         caret where the learner left them — a repaint that steals the caret
         makes the field unusable after the first keystroke. */
      const pos = t.selectionStart;
      paintRows(); paintSliders();
      const again = host.querySelector(`[data-src="${g('data-src')}"]`);
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} }
      paint();
      return;
    }
    if (g('data-sl') != null) {
      const s = S.sliders[g('data-sl')];
      if (s) { s.value = +t.value; const out = t.parentNode.querySelector('output'); if (out) out.textContent = neg(String(+s.value.toFixed(3))); }
      soon(); return;
    }
    if (g('data-tanx') != null) { S.tangent.x = +t.value; soon(); return; }
    if (g('data-a') != null) { S.area.a = +t.value; soon(); return; }
    if (g('data-b') != null) { S.area.b = +t.value; soon(); return; }
    if (g('data-n') != null) { S.area.n = clamp(Math.round(+t.value), 1, 200); const out = t.parentNode.querySelector('output'); if (out) out.textContent = S.area.n; soon(); return; }
    if (g('data-ts') != null) { S.table.start = +t.value; paintPanels(); return; }
    if (g('data-td') != null) { S.table.step = +t.value || 1; paintPanels(); return; }
    if (g('data-tr') != null) { S.table.rows = clamp(Math.round(+t.value), 2, 40); paintPanels(); return; }
  });

  host.addEventListener('change', e => {
    if (e.target.getAttribute('data-rule') != null) { S.area.rule = e.target.value; soon(); }
  });

  host.addEventListener('click', e => {
    const t = e.target;
    const on = t.closest('[data-on]'), del = t.closest('[data-del]'), tool = t.closest('[data-t]');
    if (on) { const r = S.rows[+on.getAttribute('data-on')]; if (r) { r.on = !r.on; paintRows(); paint(); } return; }
    if (del) {
      const i = +del.getAttribute('data-del');
      S.rows.splice(i, 1);
      if (!S.rows.length) addRow({expr: ''});
      S.trace.row = clamp(S.trace.row, 0, S.rows.length - 1);
      rebuild(); return;
    }
    if (tool) {
      const k = tool.getAttribute('data-t');
      if (k === 'trace') { S.trace.on = !S.trace.on; if (S.trace.on) S.trace.x = (S.view.x0 + S.view.x1) / 2; }
      else if (k === 'marks') S.marksOn = !S.marksOn;
      else if (k === 'tangent') { S.tangent.on = !S.tangent.on; if (S.tangent.on) S.tangent.x = (S.view.x0 + S.view.x1) / 2; }
      else if (k === 'area') {
        S.area.on = !S.area.on;
        if (S.area.on) { S.area.a = S.view.x0 + spanX() * 0.3; S.area.b = S.view.x0 + spanX() * 0.7; }
      }
      else if (k === 'table') S.table.on = !S.table.on;
      if (P.track) P.track('graph', {tool: k});
      paint(); return;
    }
    const row = t.closest('.bg-row');
    if (row && !t.closest('input')) { S.trace.row = +row.getAttribute('data-i'); paintRows(); paint(); }
  });

  const add = $('add');
  if (add) add.addEventListener('click', () => { addRow({expr: ''}); rebuild();
    const ins = host.querySelectorAll('.bg-in'); if (ins.length) ins[ins.length - 1].focus(); });

  /* ---- state -------------------------------------------------------------- */
  function state(){
    return {
      view: Object.assign({}, S.view),
      rows: S.rows.filter(r => !r.fixed).map(r => ({expr: r.src, color: r.color, on: r.on})),
      sliders: JSON.parse(JSON.stringify(S.sliders)),
      trace: Object.assign({}, S.trace), tangent: Object.assign({}, S.tangent),
      area: Object.assign({}, S.area), table: Object.assign({}, S.table),
      marks: !!S.marksOn,
    };
  }
  function load(st){
    if (!st) return;
    if (st.view) S.view = Object.assign({}, S.view, st.view);
    if (Array.isArray(st.rows)) {
      const fixed = S.rows.filter(r => r.fixed);
      S.rows = fixed.slice();
      st.rows.forEach(r => addRow(r));
      if (!S.rows.length) addRow({expr: ''});
    }
    if (st.sliders) for (const k of Object.keys(st.sliders)) S.sliders[k] = Object.assign({}, st.sliders[k]);
    for (const k of ['trace', 'tangent', 'area', 'table']) if (st[k]) Object.assign(S[k], st[k]);
    if (st.marks != null) S.marksOn = !!st.marks;
    rebuild();
  }

  /* ---- go ----------------------------------------------------------------- */
  (o.curves && o.curves.length ? o.curves : [{expr: ''}]).forEach(addRow);
  /* No seeding loop here: S.sliders does not exist until syncSliders() runs, and
     syncSliders() already reads o.sliders for each variable's min/max/step/value. */
  S.marksOn = FF.marks && !!o.marks;
  rebuild();

  return {
    svg, host, state, load, paint, home: () => { S.view = Object.assign({}, home); paint(); },
    setView: v => { Object.assign(S.view, v); paint(); },
    get view(){ return Object.assign({}, S.view); },
    setExpr: (i, src) => { const r = S.rows[i]; if (r) { r.src = src; recompile(r); paintRows(); paintSliders(); paint(); } },
    addCurve: spec => { addRow(spec); rebuild(); },
    removeCurve: i => { S.rows.splice(i, 1); rebuild(); },
    setSlider: (k, v) => { if (S.sliders[k]) { S.sliders[k].value = +v; paintSliders(); paint(); } },
    rows: () => S.rows.map(r => ({expr: r.src, on: r.on, color: r.color, error: r.err ? r.err.message : null})),
    valueAt: (x, i) => { const r = rowAt(i == null ? S.trace.row : i); return r && r.f ? r.f.at(x, scope()) : NaN; },
    zoomAt, square, fit,
    S,                     // the tests read the live state; nothing else should
  };
}

/* The maths, with no DOM anywhere near it. */
graph.math = {
  GraphError, FUNCS, CONSTS, RESERVED,
  lex, parse, compile, freeVars, stripLHS, fn,
  deriv, deriv2, bisect, roots, extrema, intersections, integral, simpson, RULES,
  niceStep, piStep, piLabel, label, ticks, samplePath,
  INK, VB, PAD, BOX,
};

root.Bench = root.Bench || {};
root.Bench.graph = graph;
root.Bench.GraphError = GraphError;

})(window);
