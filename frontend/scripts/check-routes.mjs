#!/usr/bin/env node
/**
 * Build-time integrity check for the route and widget registries.
 *
 * This exists because both natural failure modes here are SILENT:
 *
 *   - CAS answers a feature key it has never heard of with 200 + `no_grant`,
 *     never an error. A typo'd key makes a route invisible forever, with
 *     nothing in any log.
 *   - This repo commits no test files by house rule, so there is no unit test
 *     that would otherwise catch it.
 *
 * A failed build is therefore the only place these can be caught before a user
 * notices a missing menu item.
 *
 * Run by `prebuild`. NOTE it does not run for `next dev`, so a broken registry
 * surfaces at build time rather than while developing.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const problems = [];
const fail = (msg) => problems.push(msg);

// Warnings do not fail the build. They name things that are legal and
// deliberate defaults but are wrong often enough to be worth saying out loud.
const warnings = [];
const warn = (msg) => warnings.push(msg);

// Parsed by regex rather than imported: this runs before the build, on
// TypeScript sources, with no compiler available.
const listFrom = (src, name) => {
  const block = src.split(`${name} = [`)[1];
  if (!block) return [];
  return [...block.split('];')[0].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

const featuresSrc = read('src/constants/features.ts');
const registrySrc = read('src/routes/registry.ts');
const widgetSrc = read('src/components/widgets/registry.ts');

// The authoring template lives under `_template/` and must never be registered.
// It compiles, so nothing else would catch it being imported by accident.
if (/_template/.test(widgetSrc)) {
  fail(
    'The widget registry imports from `_template/`. That directory is a copy-me ' +
      'reference, not a widget — copy it into a section folder instead.',
  );
}
const personaSrc = read('src/constants/personas.ts');
const iconsSrc = read('src/components/navbars/nav-icons.tsx');

const casKeys = new Set(listFrom(featuresSrc, 'CAS_REGISTERED_KEYS'));
const featureKeys = new Set([...casKeys, ...listFrom(featuresSrc, 'FEATURE_KEYS')]);
if (featureKeys.size === 0) fail('FEATURE_KEYS is empty or could not be parsed.');
if (casKeys.size === 0) fail('CAS_REGISTERED_KEYS is empty or could not be parsed.');

// --- 1. The route registry, parsed structurally -----------------------------
// Regex could count `feature:` and `key:` occurrences but cannot see NESTING,
// and nesting is now the thing most worth checking: a child whose feature key
// does not descend from its parent's produces a nav tree and a key tree that
// disagree, which is invisible until someone wonders why a grant did nothing.
//
// The ROUTES literal is plain data, strings, booleans, arrays and objects, so it
// is evaluated directly rather than pattern-matched. The widget registry below
// still goes through regex, because it holds component identifiers that would
// not evaluate here.
const routesLiteral = registrySrc.split('export const ROUTES: readonly RouteNode[] = ')[1]?.split('\n];')[0];
let ROUTES = [];
if (!routesLiteral) {
  fail('Could not find the ROUTES literal in src/routes/registry.ts.');
} else {
  try {
    ROUTES = new Function(`return ${routesLiteral}\n];`)();
  } catch (cause) {
    fail(`The ROUTES literal does not evaluate as plain data: ${cause.message}`);
  }
}

const routeRecords = [];
const walkRoutes = (nodes, parent, parentPath) => {
  for (const node of nodes ?? []) {
    const path = [parentPath, node.path].filter(Boolean).join('/');
    routeRecords.push({ node, parent, path });
    if (node.children) walkRoutes(node.children, node, path);
  }
};
walkRoutes(ROUTES, null, '');

const routeKeys = routeRecords.map((r) => r.node.key);
const routeFeatures = routeRecords.map((r) => r.node.feature);
const routeIcons = routeRecords.map((r) => r.node.icon);

// Mirrors `ownsWidgets` in the registry: a key that exists but is claimed by no
// route is a widget placement, so a group owning one has a page and a group
// owning none is a pure disclosure control.
const routeFeatureLookup = new Set(routeFeatures);
const ownsWidgets = (feature) =>
  [...featureKeys].some(
    (k) => k.split('.').slice(0, -1).join('.') === feature && !routeFeatureLookup.has(k),
  );
const hasPage = (node) => !node.children?.length || ownsWidgets(node.feature);

for (const { node, parent } of routeRecords) {
  const where = `Route "${node.key}"`;

  for (const field of ['key', 'feature', 'title', 'icon']) {
    if (typeof node[field] !== 'string' || node[field] === '') {
      fail(`${where} is missing a non-empty "${field}".`);
    }
  }
  if (typeof node.path !== 'string') fail(`${where} is missing "path".`);
  if (typeof node.inNav !== 'boolean') fail(`${where} is missing "inNav".`);

  // A path is ONE segment relative to the parent; the full path is derived.
  // Declaring a full path per child lets a nav item and its URL end up nested
  // under different things.
  if (typeof node.path === 'string' && node.path.includes('/')) {
    fail(
      `${where} declares path "${node.path}". A path is a single segment ` +
        `relative to its parent: the registry composes the full path.`,
    );
  }
  // Only the persona root may have an empty path.
  if (node.path === '' && parent) {
    fail(`${where} has an empty path but is nested under "${parent.key}".`);
  }

  // The persona root is served by `p/[persona]/page.tsx`, not by the catch-all,
  // so it cannot be a pageless group: giving it sidebar-only children would
  // leave that file gating a route the registry says has no page.
  if (node.path === '' && !hasPage(node)) {
    fail(
      `${where} is the persona root but owns no widgets and every child is a ` +
        `sidebar route, which would make it pageless. The root must have a page.`,
    );
  }

  if (!featureKeys.has(node.feature)) {
    fail(
      `${where} references feature "${node.feature}", which is not in FEATURE_KEYS. ` +
        `CAS would answer no_grant and the route would be invisible forever.`,
    );
  }

  if (parent) {
    // The tree of URLs and the tree of keys must be the SAME tree. Inheritance
    // in resolve-key.ts walks the key tree; the sidebar walks the URL tree. If
    // they diverge, an unregistered child inherits from a key that is nowhere
    // near the thing it is drawn under.
    if (!node.feature.startsWith(`${parent.feature}.`)) {
      fail(
        `${where} is nested under "${parent.key}" but its feature "${node.feature}" ` +
          `is not a descendant of "${parent.feature}". Nest the key to match the nav, ` +
          `or move the route.`,
      );
    }
    // A nested SIDEBAR key that CAS does not know cannot be denied on its own:
    // it inherits its parent and appears for everyone who holds the parent.
    // Permissive by design while a branch is being built out, so this warns.
    if (!casKeys.has(node.feature)) {
      warn(
        `${where} is a nested sidebar entry whose key "${node.feature}" is not in ` +
          `CAS_REGISTERED_KEYS. It will inherit "${parent.feature}" and cannot be ` +
          `granted, killed or switched off on its own.`,
      );
    }
  } else if (!casKeys.has(node.feature)) {
    // Unchanged, and still the hard one: a TOP-LEVEL key has no ancestor to
    // inherit from, so an unregistered one is invisible to everybody.
    fail(
      `${where} gates on "${node.feature}", which is not in CAS_REGISTERED_KEYS. ` +
        `A top-level key has no ancestor to inherit from, so the section would be ` +
        `invisible to everyone. Create the key in CAS and add it to CAS_REGISTERED_KEYS.`,
    );
  }
}

// --- 2. Route keys, feature keys and paths are each unique ------------------
const dupe = (list, label) => {
  const seen = new Set();
  const dupes = new Set();
  for (const value of list) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  if (dupes.size) fail(`Duplicate ${label}: ${[...dupes].join(', ')}`);
};
dupe(routeKeys, 'route keys');
dupe(routeFeatures, 'route feature keys');
dupe(routeRecords.map((r) => r.path), 'route paths');

// --- 3. Icons resolve ------------------------------------------------------
const knownIcons = new Set(
  [...iconsSrc.matchAll(/^\s{2}(\w+):\s/gm)].map((m) => m[1]),
);
for (const icon of routeIcons) {
  if (!knownIcons.has(icon)) fail(`Route icon "${icon}" is not defined in nav-icons.tsx.`);
}

// --- 4. Widgets nest under a page that exists, and claim only one placement -
const routeFeatureSet = new Set(routeFeatures);
const widgetFeatures = [...widgetSrc.matchAll(/feature:\s*'([^']+)'/g)].map((m) => m[1]);

for (const f of widgetFeatures) {
  if (!featureKeys.has(f)) {
    fail(`Widget references "${f}", which is not in FEATURE_KEYS.`);
    continue;
  }

  // Placement is declared, not inferred, and a key gets exactly one. A key in
  // both registries would render as a sidebar row AND as a panel, and the two
  // would disagree about what it is the moment either changed.
  if (routeFeatureSet.has(f)) {
    fail(
      `"${f}" is registered as BOTH a sidebar route and a widget. A feature has one ` +
        `placement (CAS: features.placement). Pick routes/registry.ts or ` +
        `components/widgets/registry.ts.`,
    );
    continue;
  }

  const parts = f.split('.');
  if (parts.length < 3) {
    fail(
      `Widget key "${f}" has only ${parts.length} segments. A widget key must nest ` +
        `under the key that owns its page: <owner>.<widget>.`,
    );
    continue;
  }

  // The OWNER is the key one level up, not the first two segments. A widget on
  // a nested page has four segments, and slicing to two would demand a route
  // that does not exist while silently drawing the panel on the wrong page.
  const owner = parts.slice(0, -1).join('.');
  if (!routeFeatureSet.has(owner)) {
    fail(
      `Widget "${f}" nests under "${owner}", which no route declares. It would render ` +
        `nowhere: WidgetGrid only asks for the key of a page that exists.`,
    );
  }
}

// --- 5. Persona presets reference known feature keys -----------------------
const presetBlock = personaSrc.split('PERSONA_PRESETS')[1] ?? '';
for (const f of [...presetBlock.matchAll(/'(emerge\.[a-z_.]+)'/g)].map((m) => m[1])) {
  if (!featureKeys.has(f)) {
    fail(
      `PERSONA_PRESETS references unknown feature key "${f}". It would silently ` +
        `shrink that persona's navigation by one item, forever.`,
    );
  }
}

// --- 6. No structural group may confer a persona ---------------------------
// The C10 invariant: /v1/me.groups is the ANCESTOR closure, so every user's
// groups include emerge-school. Mapping it would give one persona to the whole
// tenant and collapse segregated dashboards into a union.
const roleBlock = personaSrc.split('ROLE_BEARING_GROUPS')[1]?.split('};')[0] ?? '';
for (const structural of ['emerge-school', 'emerge-class-06', 'emerge-class-10']) {
  if (roleBlock.includes(`'${structural}'`)) {
    fail(
      `ROLE_BEARING_GROUPS maps "${structural}", which is a structural group present ` +
        `in EVERY user's ancestor closure. That would give one persona to the entire ` +
        `tenant. See docs/DECISIONS.md.`,
    );
  }
}

// --- 7a. Every page under a persona actually gates itself ------------------
// The comment at the top of registry.ts promises this check; until now it did
// not exist, and the failure it names — a page file that renders without
// calling a gate — was caught by nothing at all.
const walk = (dir) => {
  const out = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel));
    else if (e.name === 'page.tsx') out.push(rel);
  }
  return out;
};
for (const page of walk('src/app')) {
  // Public and terminal pages are exempt by name, deliberately and visibly.
  // `g/` is the GRASP join link, opened by students who have no account.
  if (/\/(sign-in|not-found|g)\//.test(page) || page === 'src/app/page.tsx') continue;
  const src = read(page);
  if (!/require(Feature|Persona|Session|Entitlements)\s*\(/.test(src)) {
    fail(
      `${page} renders without calling a gate (requireFeature/requirePersona/` +
        `requireSession). Every page below a persona must gate itself — a layout ` +
        `does not re-run on navigation and cannot be relied on to stop anything.`,
    );
  }
}

// --- 7b. The catch-all page exists -----------------------------------------
for (const f of [
  'src/app/p/[persona]/page.tsx',
  'src/app/p/[persona]/[...section]/page.tsx',
  'src/app/p/[persona]/layout.tsx',
]) {
  if (!existsSync(join(root, f))) fail(`Missing required route file: ${f}`);
}

// --- 8. No role/persona string comparison in rendering code ----------------
// Belt and braces alongside the ESLint rule.
const suspicious = /\b(role|roleName|persona|personaSlug)\s*===?\s*['"]/;
for (const file of ['src/lib/nav/build-nav.ts', 'src/components/widgets/widget-grid.tsx', 'src/lib/entitlement/resolve-key.ts']) {
  if (suspicious.test(read(file))) {
    fail(`${file} compares a role/persona to a string literal. Gate on a feature key instead.`);
  }
}

if (warnings.length) {
  console.warn('\n  Registry warnings:\n');
  for (const w of warnings) console.warn(`   ! ${w}`);
  console.warn('');
}

if (problems.length) {
  console.error('\n  Registry check FAILED:\n');
  for (const p of problems) console.error(`   • ${p}`);
  console.error('');
  process.exit(1);
}

const nested = routeRecords.filter((r) => r.parent).length;
const groups = routeRecords.filter((r) => !hasPage(r.node)).length;
console.log(
  `  Registry check passed: ${routeKeys.length} routes (${nested} nested, ` +
    `${groups} ${groups === 1 ? 'group' : 'groups'} with no page), ` +
    `${featureKeys.size} feature keys, ${widgetFeatures.length} widgets.`,
);
