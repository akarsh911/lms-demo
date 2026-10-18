# Emerge front end, working context

**Verified 2026-09-14 by reading the source**, after the `feat/virtual-labs`
merge (PR #1, `594baad`). Next **16.3.4**, React **19.2**, MUI **9.4**,
TanStack Query **5.102**, `jose` for the sealed cookie, `server-only`.
**421 source files, 96,937 lines.** No longer a scaffold: fifteen CBSE Class 10
virtual practicals, a guided-tour trainer, a textbook retrieval surface and a
dev bypass now sit on top of the entitlement machinery.

> `AGENTS.md` here is written by `next dev`. It is the framework's file.

Runs on **:3005**, which must be in CAS's `CAS_CORS_ORIGINS` (not needed at all
under the dev bypass, which never calls CAS).

---

## 0. Working rules, hard, every change

Sources: the Next 16 docs bundled in `node_modules/next/dist/docs/` (read them
before writing framework code, per `AGENTS.md`), the `mui-nextjs` skill in
`~/.claude/skills/`, and the comment policy below. When a rule here and the
older prose in this file disagree, this section wins.

### Process

- **No subagents, no Workflow.** Work in the main session, one step at a time.
  Finish and verify a step before starting the next.
- Read the surrounding code and copy its idiom before adding a pattern.
- Before saying done: `npx tsc --noEmit` and `npm run lint` clean on what was
  touched. UI changes are looked at in a headless browser (global CLAUDE.md).
- No abstraction without two real callers, no speculative config, no refactor of
  code the task does not touch.

### Comments

- **One line. Two only in an emergency.** Only where logic is genuinely
  non-obvious: heavy data processing, complex queries, complex functions.
- Never narrate what the code says, never explain a snippet, never write a
  rationale essay or a JSDoc that restates the signature.
- If a comment needs a paragraph, the code needs a better name or a smaller
  function. Decisions and history go in `docs/DECISIONS.md`, not in source.
- Applies to scripts and generated files too. Long comment blocks already in the
  repo are legacy: trim them when the surrounding code is being changed, not in
  a sweep.

### Server and client components

- **Server by default.** `'use client'` only for state, effects, event handlers,
  browser APIs, context consumers, or a component that uses a client-only hook.
- The directive goes on the smallest interactive leaf, **weighed against cost**.
  Every MUI component is already a client component, so pulling MUI markup out
  of a client file only to keep it "on the server" saves nothing. Split when the
  server side does real work (data access, a secret, a heavy dependency, or
  about 30+ lines of static markup or logic); keep one file when the server
  remainder would be a few lines.
- The directive is inherited through the import graph. Do not add it to a file
  that only client files import.
- Server → client: serializable props, or server components passed as `children`
  or a slot prop. **Never import a server component into a client file.**
- Providers wrap `{children}` and sit as deep in the tree as they can.
- Every server-only module starts `import 'server-only'` (already the rule).
- A page stays thin: call a gate, fetch on the server, render a component.
- A Server Function (`'use server'`) is a public endpoint. It re-reads the
  session and validates every argument itself; the form that calls it proves
  nothing.

### Directory structure

- Layer order is fixed and one-way: `lib` ← `services` ← `hooks` ← `components`
  ← `app`. `lib` has no React and no I/O. `server/` is never imported by client
  code.
- One component per file, kebab-case, named for what it is. A component's
  private helpers, types and hooks live beside it in its feature folder, and are
  promoted to a shared layer only when a second feature needs them.
- A feature large enough to bury the shared layers becomes a `modules/<feature>/`
  with the same layering inside.
- No new barrel `index.ts` files. Import from the file. Imports use `@/`, never
  `../../..`.
- A file over about 300 lines is doing two jobs: split it by responsibility, not
  by size.

### Fixtures come with the feature

- Local development runs on the dev bypass (section 2), so **a new `services/`
  function ships with its bypass branch in the same change**: rows in
  `src/fixtures/data/`, and `config.devBypass ? <fixture> : <real call>` in the
  service. Nothing else: no mock server, no router.
- A fixture answers in the shape the real handler does. Shapes come from the Go
  handlers or a recorded response, never from what the screen wants.
- `dev_bypass_no_fixture` in the dev log means the change is not finished.
- Real people's data stays in gitignored `.fixtures-raw/`. Committed fixtures
  keep structure and ids and replace names, emails and phone numbers.

### TypeScript

- `strict` and `noUncheckedIndexedAccess` stay on. No `any`. No `!` non-null
  assertion. No `as` cast except directly after validation at a trust boundary.
- Untrusted data (responses, cookies, params, storage) enters as `unknown` and
  is narrowed once, at the edge.
- State is a discriminated union, handled with an exhaustive `never` default.
  No enums: use a union of literals or an `as const` object.
- `satisfies` for tables and config, `as const` for literal data, `import type`
  for types, `readonly` for props arrays.
- Exported functions declare their return type. Derive a type from the data
  rather than restating it.
- Named exports. A default export only where Next requires one (`page`,
  `layout`, `route`, `loading`, `error`, `not-found`).

### MUI

Follow `~/.claude/skills/mui-nextjs/SKILL.md`. The load-bearing parts:

- The component that exists comes before hand-built markup. `Box` is for SVG,
  canvas and surfaces with no MUI primitive, not a `div` factory. `Typography`,
  `Stack`, `Button`, `Chip`, `Skeleton`, `Dialog` and `TextField` cover the rest.
- Styling order: theme `components` overrides, then `sx`, then `styled()`.
- Colour and spacing come from theme tokens (`text.secondary`, `theme.vars`),
  never raw hex or a raw `var(--…)`. Dark branches use `theme.applyStyles`.
- v9: no system props (`mt={2}`), `slotProps` not the deprecated props, `variants`
  arrays not `ownerState` callbacks.
- Default per-component imports, `@mui/material/Button`, never the barrel.

---

## 1. The one idea

- Every route, section and panel is gated by a **CAS feature key**.
- Key present, it renders. Key absent, it **does not exist in the DOM**.
- **No roles anywhere.** The four-role model (teacher / student / parent /
  principal) is replaced, not extended. CAS has no roles:
  `grep -rniE '\brole\b' --include="*.go"` over CAS returns one hit and it is
  prose in a comment. A person is in many groups and features are a union, so a
  `switch` on role cannot represent it. `if (role === '…')` is a lint error.
- The frontend decides what is **offered**. CAS decides what is **permitted**.
  A 403 is normal.

**Key shape**: `emerge.<section>[.<child>...]`. Depth says where a key sits in
the tree; **placement** says what it is. A `sidebar` key is a nav row with a URL
at any depth, so `emerge.learning.mindmap` is a NESTED row serving
`/p/{persona}/learning/mindmap`. A `widget` key is a panel on the page its
parent owns, with no URL. Placement is declared, route registry for sidebar and
widget registry for widget, because CAS returns `features.placement` only from
the admin catalog, which no Emerge user can read. `check-routes.mjs` refuses a
key claiming both.

---

## 2. The dev bypass, which is how you run it with nothing else up

**`DEV_BYPASS=1` in `.env.local` runs the whole front end with no CAS and no
microservices.** It is NOT set by default, so a fresh `.env.local` still needs a
real CAS on :8080 and a real sign-in.

| variable | |
|---|---|
| `DEV_BYPASS=1` | the one switch. No CAS, no backend calls, straight to the dashboard on fixtures. |
| `DEV_BYPASS_USER` | optional. Which fixture user everything is served as: `admin` (default), `teacher`, `student`, `parent`. |
| `DEV_SCHOOL_ID` | the tenant sent as `X-School-Id` with any call the bypass forwards live (`DEV_LIVE_SERVICES`, and the public demo's retrieval). Defaults to `S_42`. |
| `DEV_LIVE_SERVICES` | optional, comma list of service keys from `constants/services.ts`, e.g. `papersetter`. Those go to the real backend while everything else stays on fixtures. See below. |
| `RECORD_FIXTURES=1` | real mode only: saves each JSON response the proxy relays, and CAS `/v1/me` and evaluate, to gitignored `.fixtures-raw/`. It holds real people's data and is never committed. |

**It works the way the marketplace front end's bypass does.** The data is plain
files in `src/fixtures/`, and every function in `src/services/` chooses on the
spot:

```ts
listRooms: (query: ListQuery, signal?: AbortSignal) =>
  config.devBypass ? devList(ROOMS, query) : list<Room>('rooms', 'rooms', query, signal),
```

There is no mock server, router or store. `config.devBypass` is a build-time
constant: `next.config.mjs` hands the server's `DEV_BYPASS` to the browser
bundle, so there is still one variable to set.

What the switch changes:

- **Every `services/` call returns a fixture** after a short delay, in the
  browser. Nothing is requested from `/api/svc/*`.
- `getSession()` returns a fixture session instead of opening a cookie, and
  `proxy.ts` stops redirecting, so nobody signs in. CAS is never called.
- `getEntitlements()` returns that user's feature decisions from
  `server/dev/fixtures.ts`. These two stay on the server because sign-in and
  feature access are decided there.
- `/api/svc/*` answers `404 dev_bypass_no_fixture` and logs the path. A call
  that reaches it is a service function with no bypass branch yet. The
  exception is a service named in `DEV_LIVE_SERVICES`, which is forwarded.
- **Sign-in is real under the bypass.** Signed out, every app page sends you to
  `/sign-in`, which lists three demo accounts (`constants/demo-accounts.ts`):
  `principal@demo.school` / `Principal@2026`, `teacher@demo.school` /
  `Teacher@2026`, `student@demo.school` / `Student@2026`. A correct pair sets
  the `emerge_demo_session` cookie (readable by the page, because the
  browser-side fixtures need to know who is signed in: sample data, not a
  secure session); a wrong one is refused; Sign out clears it. There is no
  View as switch: who you are comes only from how you signed in. The top bar
  reads `Demo · <account>`. `PUBLIC_DEMO` stays open with no sign-in.
- There is no sign-up page: accounts are created by the school.

| fixture user | what it is |
|---|---|
| `admin` | the principal, **recorded from the live `dps-ngp` tenant** (`server/dev/recorded.ts`): every screen, school-wide capabilities. `principal` is accepted as an alias. |
| `teacher` | the classroom screens, capabilities narrowed to what they teach, no school administration |
| `student` | the same screens without People, capabilities narrowed to their own record and class |
| `parent` | attendance scoped to a class they are not in |

Two more exist for edge cases: `dev` (teacher and student at once, the only way
to see the persona switcher, and who the public demo serves) and `superadmin`
(zero feature keys).

**`src/fixtures/`**

| | |
|---|---|
| `data/*.ts` | the rows: people, structure, timetable, classroom, exams, library, papers. One school of 48 sections and 1,906 pupils (sized in `data/cohort.ts`), a clash-free week. Plain exported arrays, edited in place by writes. |
| `rows.ts` | `page`, `where`, `insert`, `patch`, `remove`, and `fail` for a refusal. |
| the rest | the few answers that are computed rather than looked up: `identity`, `capabilities`, `roster`, `week` (slot clashes, generation), `classroom`, `exams` and `results`, `library`, `papers`, `daily` (attendance, today's timetable, labs), `retrieval`, `engines`. |

- **Writes live in the browser tab.** They show up across screens and are gone
  on a full reload, exactly as in marketplace.
- Refusals are kept where a screen depends on one: a timetable clash, a person
  column the caller may not write, an unenrolled student in a marks batch, a
  published paper. `fail(status, code, message)` in a fixture reaches the screen
  as the same `ApiError` a real refusal would.
- **Files are not kept.** A library upload records the asset; opening or
  downloading one says it needs the real backend.
- **Adding an endpoint:** put the rows in `src/fixtures/data/`, then branch in
  the service: `config.devBypass ? devList(ROWS, query) : coreApi.get(...)`.
  `services/dev-bypass.ts` has `devList`, `devGet`, `devCreate`, `devPatch`,
  `devDelete`, and `dev(() => ...)` for anything else.

**Every gate still runs for real.** The fixture is a list of CAS-shaped
decisions, mapped by the SAME `entriesFromDecisions` the live answer goes
through, so `uiStateFor`, `buildNav`, the persona lens and `WidgetGrid` all
execute unchanged. It replaces the source of the answer, never the logic.

**`DEV_BYPASS` is honoured in every build** (since 2026-10-03; before that a
production build refused it, which is why it did nothing on Vercel). `DEV_BYPASS=1`
on any host means fixtures and no sign-in; unset or `0` means the real services.
It has to be present **at build time as well as at run time**, because the
services' choice is compiled into the browser bundle, so a change on a deployed
host needs a rebuild. **A host with `DEV_BYPASS=1` has sign-in switched off for
everyone who reaches it**: a test or demo deployment, never one with real users.

### `DEV_LIVE_SERVICES`, some backends real and the rest fixtures

For a demo that should show one real service while everything around it stays
on fixtures. Ignored unless the bypass is on, and baked into the bundle like
`DEV_BYPASS`, so changing it needs a restart of `next dev` or a rebuild.

| variable | |
|---|---|
| `DEV_LIVE_SERVICES=papersetter` | those services take the real branch in `services/` and the proxy forwards them, with `X-School-Id` from `DEV_<SERVICE>_SCHOOL_ID` or `DEV_SCHOOL_ID`. The fixture session's token is never sent. |
| `debate`, always | every bypass build adds `debate` to the list (`next.config.mjs`), and its base URL falls back to the demo engine at `https://core.tryemerge.in/demo/debate` instead of `localhost:8700`. `DEBATE_API_URL` still wins. |
| `DEV_<SERVICE>_TOKEN`, `DEV_SERVICE_TOKEN` | server-only bearer for a listed service that needs one (the paper setter does). Per-service wins. |
| `DEV_LIVE_FALLBACK=0` | turns off the fallback, which is ON by default under the bypass: a listed call that fails to connect or answers 5xx is answered by its fixture instead, with a `dev bypass: <service> <call> fell back to its fixture` console warning. A 4xx refusal is always shown as it came. |

A service honours the list only where its functions go through
`liveOrFixture` / `fixtureServed` in `services/dev-bypass.ts`: today the paper
setter wizard (`components/paper-setter/data/fallback-transport.ts`),
`services/papersetter.ts` and `services/retrieval.ts`. Listing `core` opens the
proxy for it, but its service functions still branch on `config.devBypass`, so
nothing calls it yet. `PUBLIC_DEMO=1` is the same mechanism with `retrieval`
always listed.

The paper setter has no auth-off mode, so `scripts/dev-papersetter.py` runs it
behind an in-process fake CAS that grants every `papersetter.*` key and mints a
30-day token: `D:\lms-paper-setter-school\.venv\Scripts\python.exe
scripts/dev-papersetter.py` (port 8400), then `PAPERSETTER_API_URL=http://127.0.0.1:8400`
and `DEV_PAPERSETTER_TOKEN` from `--print-token`. Settings and patterns are
real; preview and compose need emerge-core and a published bank, so they fall
back to the fixtures.

### `PUBLIC_DEMO`, the labs demo

`PUBLIC_DEMO=1` is the same bypass with two differences for `labs.tryemerge.in`:
the top bar reads `Demo · sample data` rather than `Dev bypass · <user>`, the
user defaults to `dev`, and textbook retrieval is forwarded to the live engine
instead of a fixture. `deploy/Dockerfile` sets it for that build only.

It exists for **`labs.tryemerge.in`**, a fixture-only public demo, deployed from
`deploy/`: a standalone Next build in Docker behind a shared nginx, which is what
`output: 'standalone'` in `next.config.mjs` is for. Every visitor is served the
same fixture session, nobody signs in, nothing is persisted, and the only live
backend it calls is the retrieval engine. **It must not become the deploy path
for a host that holds real users or real per-school data**, because it turns
sign-in off for everyone by construction.

The fixtures are written as CAS answers AFTER the `registry ∩ /v1/me`
intersection, which is the detail most likely to rot. `teacher`, `student` and
`parent` are modelled on the seeded `mentis` estate: `emerge.analytics` (kill-switched) and
`emerge.announcements` (inactive) are simply absent, because they never reach
evaluate. `admin` is the live answer instead, where every key is
`scope_match` on `emerge-leadership` and a key with no CAS row is absent and
inherits.

---

## 3. It is a BFF, and that is forced

**CAS never sends `Access-Control-Allow-Credentials`, so a cross-origin cookie
session is impossible.** The Next server is the only place a session can live.

- Tokens live in an **HttpOnly sealed cookie** (AES-256-GCM, server-side key).
  Client JS never holds one, so there is no client entitlement store to tamper
  with.
- Encrypting a client cache was considered and rejected: a key shipped in the
  bundle is available to whoever would forge the payload.
- The browser **cannot** call a microservice directly. It goes
  `browser → /api/svc/<service>/<path> → [handler attaches Bearer] → service`.
  The service name is looked up in `constants/services.ts`, **never a
  caller-supplied URL**, which is what keeps it from being an SSRF hole. Unknown
  name is a 404, not a fetch.

---

## 4. Layers, fewest dependencies at the bottom

```
app/         routes only, no logic     ← thinnest
components/  ui/ widgets/ navbars/ brand/ auth/ labs/ guided-tour/ textbook/
hooks/       query/ mutation/          when to fetch
services/    how to fetch (plain fetch, no axios)
server/      server-only, every file starts import 'server-only'
lib/         pure logic, no React, no fetch, no cookies
types/  constants/  routes/  styles/
```

| File | What it is |
|---|---|
| `src/proxy.ts` | Runs on **every request**. Next 16's name for `middleware.ts`. Redirects anonymous users, refreshes and persists tokens. |
| `server/dal.ts` | **The gates**: `requireSession`, `requirePersona`, `requireFeature`. Every page calls one. |
| `server/cas/client.ts` | The only place CAS is called. |
| `server/entitlement/resolve.ts` | `/v1/me` → intersect → evaluate → snapshot. |
| `server/entitlement/entries.ts` | Decisions → entries. The ONE mapping, shared by the live CAS answer and the dev fixture, so a fixture cannot drift from CAS. |
| `server/dev/bypass.ts` | The server half of the switch: the fixture session and the top-bar label. |
| `server/dev/fixtures.ts` | Fixture users, written as CAS answers post-intersection. |
| `server/dev/recorded.ts` | The live principal's decided keys, recorded from the `dps-ngp` tenant. |
| `src/fixtures/` | The bypass data and the few computed answers. Section 2. |
| `services/dev-bypass.ts` | `dev`, `devList`, `devGet`, `devCreate`, `devPatch`, `devDelete`: a fixture served as if it were a request. |
| `server/dev/record.ts` | `RECORD_FIXTURES=1`: writes relayed responses to `.fixtures-raw/` in real mode. |
| `lib/entitlement/decide.ts` | CAS reason → UI state. The only place that mapping lives. |
| `lib/entitlement/resolve-key.ts` | Registered key → CAS decides; unregistered → inherits its nearest registered ancestor. |
| `lib/nav/build-nav.ts` | `registry ∩ entitlements` → the sidebar TREE. `navTrail` finds the branch holding the current page. |
| `components/navbars/nav-tree.tsx` | The recursive nested list: collapse groups, disclosure chevrons, active branch. |
| `components/navbars/side-nav.tsx` | Two frames over that one tree: permanent from `lg`, a Drawer below it. |
| `components/navbars/nav-drawer-context.tsx` | The drawer's open state, shared by the hamburger in the top bar and the sidebar. |
| `lib/persona/select.ts` | Groups → personas. A lens that can only narrow. |
| `routes/registry.ts` | **Single source of truth for routes.** A TREE: path ↔ feature key ↔ nav, with full paths composed from the nesting. |
| `constants/layout.ts` | `CONTENT_MAX_WIDTH`, `MAIN_PADDING`. The frame's numbers, in one place. |
| `lib/labs/` | Bench physics, marking, viva, session records. Pure, no React. |
| `lib/retrieval/` | Textbook passage retrieval. |
| `lib/mindmap/` | `atlas-layout.ts` (the Atlas's own deterministic layout, and the page-range focus), `deep-link.ts` (`?item=&section=&from=&to=`), `failure.ts` (emerge-core's mind-map error codes → what to say). |
| `components/mindmap/` | Book picker, chapter workspace, canvas, trace, recall drill, the curriculum "Mind map" action, and `mindmap-grants.ts` (the three `core.*` capabilities the screen gates on). |
| `components/flashcards/` | Deck builder, study flow, report. |
| `src/fixtures/engines.ts` | Fixtures for mind maps and concept mastery as emerge-core serves them (`core` → `learning/mindmaps/...`, `curriculum-nodes/{id}/mindmaps`). Mind maps are wired for real mode too; this is what the bypass serves. |
| `src/fixtures/flashcards.ts` | Fixtures for the flashcard engine, the only mode it runs in today. |
| `components/labs/` | Fifteen practical benches plus the shared runner, console and resume dock. |
| `components/guided-tour/` | The tour and trainer overlay a bench runs inside. |
| `scripts/check-routes.mjs` | Build gate. Fails on a bad key, an ungated page, a bad persona table, a child key that does not descend from its parent, a multi-segment `path`, or a key claiming both placements. |

`app/p/[persona]/[...section]/` serves **every** route from the registry at any
depth, `learning/mindmap` included; `layout.tsx` is the shell and is deliberately
**not a gate**, because layouts do not re-run on navigation.

---

## 5. Entitlement, the part that is easy to get wrong

- **`/v1/me` is a candidate set, never a render source.** Its last clause is
  `WHERE f.is_active = TRUE AND f.kill_switch = FALSE`
  (`CAS/internal/repo/authz.go:145`), so it applies two of a feature's three
  axes and NOT the third: `is_enabled = false` still appears there. That is
  deliberate, a disabled feature is meant to be drawn and inert, so it has to
  reach the client. It is also **scope-blind**, so a scoped grant reads as
  global.
- **`POST /v1/features/evaluate` is the authority.** Capped at **64 keys**, so
  `registry ∩ me.features` is intersected first and `lib/entitlement/chunk.ts`
  batches.
- **Nav-level evaluate sends NO `context`.** Scope runs *downward* from the
  granted group; membership is a different set. `emerge.parent` holds attendance
  for `emerge-class-10` without being in it, so passing their own groups returns
  `out_of_scope` and hides real access. **Do not "fix" this.**
- **`scoped_grant_needs_context` renders as reachable, not disabled.** The user
  genuinely holds the feature; what is missing is which class they mean, and that
  is a question the destination screen asks.
- **Unknown keys return `200 no_grant`, identical to a deliberate denial.** That
  is why `CAS_REGISTERED_KEYS` is an explicit list and why `check-routes.mjs`
  exists: a typo is otherwise silent forever. A key **not** in that list is never
  sent and inherits its nearest registered ancestor. **Top-level keys must
  always be registered**, having no ancestor to inherit from. A nested SIDEBAR
  key that is unregistered inherits its parent and so cannot be denied on its
  own: legal, and `check-routes.mjs` warns rather than fails.
- **A superadmin holds zero feature keys** (`"features": []`,
  `"super_admin": true`). CAS declines to special-case them.
- **Every gate RESOLVES a key, it does not look one up.** `requireFeature` and
  `buildNav` both go through `resolveFeature`, so an unregistered nested key
  inherits its nearest registered ancestor exactly as a widget does. Reading
  `snapshot.entries` directly 404'd every unregistered nested page and made its
  sidebar row vanish, which contradicted the documented inheritance and stayed
  invisible only while every nested key happened to be registered.
  `emerge.learning.labs` is the key that exposed it.

### The reason list is complete, and cross-checked

`constants/cas.ts` `FEATURE_REASONS` now lists all **ten** CAS emits
(`CAS/internal/service/entitlement.go`): `unscoped_grant`, `scope_match`,
`out_of_scope`, `no_grant`, `retired`, `kill_switch`,
`scoped_grant_needs_context`, and the three that used to be missing:
`grant_off`, `feature_group_off`, `disabled`. `uiStateFor` has an exhaustive
`never` default that throws, so while they were absent a real CAS answer
carrying one was a runtime error. `disabled` is reachable whenever a feature has
`is_enabled = false`, `grant_off` whenever a grant carries
`feature_enabled = false`, and `emerge.learning.flashcards` in the seeded estate
is exactly the first case.

All three render as **`disabled`**: held, drawn, inert, with a hint the user can
read. Hiding them would throw away the only thing that separates
`is_enabled = false` from `is_active = false`.

`state` (`on`/`disabled`/`off`) and `visible` are now read too, as a **cross-check**
rather than a source: `resolveEntitlements` compares CAS's `visible` against what
`uiStateFor` produced and logs a drift error when they disagree. Two divergences
are deliberate and named in `DELIBERATE_VISIBILITY_DIVERGENCE`:

| reason | CAS | here | why |
|---|---|---|---|
| `scoped_grant_needs_context` | off | reachable | The user holds it; what is missing is which class, and the destination screen asks. |
| `kill_switch` | off | disabled | An incident should not look like a revocation. |

Anything else disagreeing means `decide.ts` has fallen behind CAS.

---

## 6. Personas

- **A persona is a lens, not a permission.** It intersects with what the user
  holds and can only narrow. A forged persona in the URL shows *less*.
- **The preset orders; CAS decides existence.** An earlier version filtered by
  the preset, which made it a hardcoded allowlist a real grant could not get
  past: the principal held `emerge.grades` and it rendered nowhere.
- **Only leaf groups confer a persona.** `/v1/me.groups` is the **ancestor
  closure**, so every user contains `emerge-school`; mapping it would give one
  persona to the whole tenant. Asserted at startup.
- `role_name` lives in the frontend for now, because CAS cannot attribute a
  feature to the group that granted it (`SELECT DISTINCT f.key`). The swap point
  is `selectPersonas()`.

---

## 7. Session

- **Refresh happens in `proxy.ts` only.** CAS rotates the refresh token and
  revokes the whole session on replay. A Server Component cannot set a cookie, so
  a refresh there could not be persisted, and an unpersisted rotation is exactly
  what triggers theft detection.
- **A 429 on refresh must NOT sign out and must NOT rotate.** CAS throttles
  *before* the token lookup, so the token is unspent. Treating it like any other
  failure turns a rate limit into a mass logout.
- Rotation is recorded per session **before** the latch clears. The latch alone
  only covers requests overlapping in time; the dangerous one arrives just after.
- The refresh latch is **per-process**, so this needs a single instance or sticky
  sessions.
- **The session records how it began** (`origin`). `sso` refreshes at CAS
  `/oauth/token`; `password` uses `/v1/auth/refresh`. **Every** sign-out, of
  either origin, revokes the refresh token at `/v1/auth/logout` and then ends
  with a top-level redirect to CAS `/logout`, which clears the
  `auth.tryemerge.in` cookie and so signs out every Emerge app in the browser. `CAS_SSO_MODE=popup` opens CAS in a window
  (`display=popup`); the callback answers the popup with a page that posts
  `cas:signed-in` to the opener and a same-origin BroadcastChannel, then
  closes. SSO is behind `CAS_SSO_ENABLED` with `CAS_CLIENT_ID`,
  `CAS_CLIENT_SECRET` and `APP_URL`; see `docs/DECISIONS.md`.
- **Step-up** (403 `step_up_required`) is answered by one `StepUpDialog` in
  `Providers`. It reseals the cookie with the re-minted access token and the
  request is retried once. Account security lives at
  `/p/{persona}/account/security`.
- **The 2FA prompt** (`TwoFactorPrompt` in the persona layout) reads
  `GET /v1/me/mfa` at most once per browser session (a `sessionStorage` flag) and
  shows "Protect your account" only when `prompt.show` is true. It renders
  whatever `methods[]` CAS sends; a missing `prompt` or `methods` (an older CAS)
  hides it and the security page's two-step panel entirely
  (`lib/auth/two-factor.ts`, `toTwoFactorView`).
- **`session_invalid` means signed out, never refresh.** `SessionWatch` asks CAS
  `GET /v1/auth/session` on focus, on becoming visible and every 60s while
  visible; the BFF clears the cookie when a service answers 401
  `session_invalid`; and `apiRequest` sends the browser to sign-in on it. Other
  tabs hear `cas:signed-out` on `BroadcastChannel('cas-session')`
  (`lib/auth/session-channel.ts`). A 404 from an older CAS is ignored.

---

## 8. The sidebar

- Built on the server by `buildNav` from `registry ∩ entitlements`, ordered by
  the persona lens. A feature the user does not hold produces no NavItem, so it
  is **absent from the DOM**, not hidden with CSS and not drawn disabled.
- `disabled` and `needs_scope` items ARE emitted: both mean the user genuinely
  holds the feature and is better served by seeing it.
- **Nesting comes from the registry tree.** A row is a link, a disclosure, or
  both, and which one is **derived** rather than declared:

  | the node | it is |
  |---|---|
  | a leaf | a link. A page. |
  | a group whose every child is a sidebar route | a **disclosure only**. The whole row toggles, it has no href and no route, and `/p/{persona}/learning` 404s. Its page would list links the sidebar is already showing. |
  | a group that also owns a widget key | **both**: the row navigates, and a separate chevron button expands. |

  In the second case the row is not drawn `disabled` even when CAS says the
  feature is, because there is no destination to withhold and greying it out
  would strand the live children under it. In the third the chevron is its own
  control for the same reason: the parent can be inert while the children are
  not.
- **A disabled row carries no explanatory text.** It is drawn disabled and that
  is the whole signal. A second line of prose per row is noise in a menu; the
  `hintFor` mapping still exists and is still used by the widget grid, where a
  whole greyed card does need to say something.
- **A parent the user has lost does not orphan its children.** `buildNav` hoists
  visible children to the parent's level, and the breadcrumb on the child page
  renders the unreachable ancestor as text rather than a link.
- **The open branch is derived, not stored.** A group is open when the current
  page is inside it. What IS stored is the user's toggles, scoped to the branch
  they were made on, so a deep link opens the right group and navigating away
  does not leave stale overrides behind. No effect, no second render pass.
- **Two frames, one tree.** `side-nav.tsx` renders `NavTree` permanently from
  `lg` and inside a temporary `Drawer` below it, opened by the hamburger in the
  top bar. `keepMounted` is deliberately off, so the drawer's copy of the nav
  does not sit in the DOM of every desktop page. The drawer closes on a nav
  **link** click, not on any click, so a chevron does not dismiss the menu it is
  expanding.
- The open state lives in `NavDrawerProvider`, a client component wrapping
  server-rendered children. That is what lets the persona layout, where
  `requirePersona` runs, stay a Server Component.
- **The app frame is fixed height; the CONTENT COLUMN scrolls, not the window.**
  The top bar and the sidebar used to scroll away with the page, leaving a tall
  screen with no navigation. It also gives an `immersive` widget an exact known
  height to fill instead of guessing at the viewport. Content is capped at
  `CONTENT_MAX_WIDTH` so a line of text never runs the full width of a 27" screen.
- `ResumeDock` is pinned to the viewport OUTSIDE the scrolling column, so it
  stays put while a student reads. It draws nothing unless this browser holds an
  unfinished practical, so every other page pays one `localStorage` read.

---

## 9. Widgets

- A card on a page. Owns **one query**. No route of its own.
- Registered in `components/widgets/registry.ts` with `feature`, `order` and a
  layout. `WidgetGrid` picks which render; **a widget never checks its own
  entitlement**.
- **Layout is declared, like placement.** `presentation` is `card` (the default,
  `span` columns of 12 from `md` up), `wide` (the full row) or `immersive` (full
  row AND full height under the top bar, its own scrolling, a fullscreen
  control, for a workspace like a lab bench). The type forbids `span` on the
  two full-row kinds, so a silently ignored number cannot be written.
- A panel is bound to its page by `parentOf(key)`, the key one level up, NOT by
  the first two segments. That is what puts `emerge.learning.mindmap.canvas` on
  the Mind maps page rather than on Learning.
- Must render **four states**: loading, error, empty, data. Use
  `widget-states.tsx`.
- Each is wrapped in its own error boundary, so one failing panel cannot blank
  the page.
- `widgets/_template/` is the thing to copy and is never imported.

---

## 10. The study engines

Three separate repos in `Mentis/`, one chain. All are Python, all require
`X-School-Id`, and none of them authors anything a student reads.

| repo | port | what it serves |
|---|---|---|
| `lms-retrieval-engine` | :8000 | the corpus: cited passages, the syllabus tree, figures |
| `lms-mind-map` | :8200 | compiles the retrieval graph into a laid-out map |
| `lms-flashcard-engine` | :8300 | grounded decks, and marking free-text answers |

Retrieval and flashcards are wired as ordinary services: a row in
`constants/services.ts`, a client in `services/`, hooks in
`hooks/query|mutation/`, types transcribed from the engines' own models.
**The mind-map engine is not.** It has no row in `SERVICES`, so nothing outside
the service network can address it; see the next section.

### Mind maps go through emerge-core (2026-10-02)

```
browser -> /api/svc/core/learning/mindmaps/...   bearer + school, like any core call
             -> emerge-core   core.mindmaps.read, book visibility, tenant slug, mastery
                  -> lms-mind-map -> lms-retrieval-engine
```

Every route is keyed by the LIBRARY ITEM, then the engine's section id:
`learning/mindmaps` (the books the viewer can read, each with a
`mindmap_state`), `…/{item}/chapters`, `…/chapters/{section}`, `…/nodes/{node}`,
`…/trace`, `…/drill`, `…/drill/grade`, `…/mastery`, and
`curriculum-nodes/{id}/mindmaps`. The wire contract is in emerge-core's
`docs/MINDMAP-INTEGRATION-PLAN.md`, section 4, and it is the thing to read
before changing `services/mindmap.ts`, `services/mastery.ts` or the mocks.

Seven things that read as bugs if you do not know them:

- **An unknown query parameter or body field is a 400.** `include_descendants`
  is gone everywhere, and `with_answers` is never sent: emerge-core always asks
  for a drill without its marking key. Under the bypass the service functions
  take typed arguments, so neither can be sent to the fixtures at all.
- **`mindmap_state` is shown per book, never flattened into "nothing here".**
  `held` is material that exists and is waiting for its GPU build to be
  published; `parked`, `pending`, `failed` and `not_indexed` each say what they
  are (`constants/mindmap.ts`). Only `available` opens.
- **Outages are not empty states.** `mindmap_disabled`, `mindmap_tenant_unmapped`,
  `mindmap_engine_unavailable` and `mindmap_service_unavailable` say so;
  `mindmap_not_indexed` (409) names the state; `mindmap_upstream_refused` shows
  the server's own message, because that is what a user who reaches more than
  one school gets (the engine's 403) and it must not read as a malfunction.
  `lib/mindmap/failure.ts` is the one place that mapping lives.
- **The client writes only `read`.** Graded states are recorded by emerge-core
  while it relays a grade; the client invalidates the mastery query and writes
  nothing. `tracked: false` (no student record in the current session) draws
  the map with no ring, no ticks and no PUT. Under the bypass only `student` and
  `dev` have a student record, so the default `admin` sees the map untracked;
  the mind-map capabilities each fixture user holds are in
  `src/fixtures/capabilities.ts`.
- **The grade says whether it was saved.** `POST …/drill/grade` carries
  `X-Mastery-Recorded: true|false` only when the server attempted a write, and
  the proxy passes it through. The review claims a tick ONLY on an explicit
  `true`. `false` is a grade that stands and was NOT saved, and the review says
  so. No header means no write was attempted (nothing answered, an untracked
  viewer, or no write key), and the review says nothing was recorded. That
  header is why `mindmapService.grade` is a plain `fetch` rather than
  `coreApi.post`.
- **Three `core.*` capabilities gate the screen**, read from `GET /capabilities`
  by `components/mindmap/mindmap-grants.ts`: maps on `core.mindmaps.read`,
  mastery reads on `core.concept_mastery.read` AND `core.mindmaps.read`, and
  the `read` PUT on `core.concept_mastery.write` AND `core.mindmaps.read`,
  because both mastery routes need both keys. The CAS feature key `emerge.learning.mindmap` still
  decides whether the page exists at all, and the curriculum widget's "Mind
  map" action obeys it too: the widget's registry entry declares
  `linksTo: ['emerge.learning.mindmap']`, `WidgetGrid` resolves that against
  the snapshot on the server and hands the widget `reachableLinks`, and without
  the key the action is absent from the DOM. Nothing about entitlement is
  fetched or held client-side.
- **The URL is the state.** `?item=&section=&from=&to=` opens a book, a chapter
  and a page-range focus, and it is what the Library page's curriculum widget
  links to from a chapter or topic node. A topic is its chapter's map dimmed to
  the placement's pages; no engine topic id is joined. The link opens the FIRST
  section emerge-core lists for a book, which is its best match, and
  `mindmap_link_unbounded` (409, more than 8 books on one node) reads as "too
  many books to list", not as an outage.

### The real shapes, checked against captured payloads (2026-10-02)

A verifier ran the real engine and mind-map service; the first mocks were kinder
than either, and five defects hid behind that. What is true on the wire:

- **The chapter tree is FLAT and its first entry is the book's own root
  section**: `parent_id: null`, no pages, `children: N` (a COUNT, not a list),
  and a map with zero topics. Chapters are the root's children, sub-sections
  nest by `parent_id`, and the label is `display_label` ("6. Life Processes").
  `lib/mindmap/chapters.ts` builds the list; a zero-topic map says so instead of
  drawing an empty canvas.
- **Drill kinds are `label`, `placement` and `relation`. There is no `cloze`.**
  `label` is free recall with no options; `placement` is the same sentence with
  four options; `relation` puts the book's sentence in `prompt`, the pair in
  `masked_prompt`, and raw relation types in `options`, which are said with the
  map's `relation_grammar` verbs and sent back as the raw key.
- **Trace is `{found, steps, note}`.** No `hops`, no `from_id`/`to_id` at the
  top. `note` is the engine's own reason an absent path is absent.
- **Edge kind is `contains`; node kind `cluster` exists** (its id is the topic's
  prefixed `clu_`); node-detail neighbours are flat rows; `meta.subject` and
  `meta.grade` are null, so the subject and grade shown come from the chapters
  document.
- **A FastAPI 422 `detail` is an ARRAY**, and emerge-core relays it as a JSON
  string in `message`. `lib/mindmap/failure.ts` never prints one: it shows the
  innermost plain `detail` sentence when there is one and a fixed sentence
  otherwise.
- **A skipped drill item is omitted from `answers`**, never sent as `""`.

`src/fixtures/engines.ts` reproduces every one of these, including a root
section, a sub-section and a cluster. Keep it no kinder than the real service.

### The tenant gap, which is why retrieval and flashcards only run bypassed

Both refuse a default identity: a missing `X-School-Id` is a **400**, not a
fallback. This proxy states that header **only under the dev bypass** for these
two, so in real mode every call to them still fails and
`src/fixtures/flashcards.ts` remains the only way flashcards run.

**What changed 2026-09-23: the gap is now emerge-core-shaped, not universal.**
`constants/services.ts` names a `SCHOOL_TENANT_SERVICES` set, and the proxy
attaches a real tenant in real mode to the services in it. `core` is in it; the
two engines deliberately are NOT. Their tenant vocabulary is a different one —
`DEV_SCHOOL_ID` is `S_42`, and the CAS tenant the deployed engine compares
against is a slug — and emerge-core's school UUID is neither, so sending it
would swap one unusable tenant for another while looking like a fix. Establish
what the engines actually expect, then add them to that set. Mind maps no
longer have this problem: emerge-core sends the engine the school's CAS slug.

### The map is the engine's own UI, ported

`lms-mind-map/web/index.html` is a 1,473-line single-file app called **Concept
Atlas**. It was ported, not reinterpreted: same constants, same layout, same
interaction, and `concept-atlas.css` is its stylesheet with the values untouched.

**Run the engine before changing any of this.** It takes five dependencies and a
snapshot file, and reading the Python was not enough: four wire types were wrong
until a real response contradicted them (the root node's kind is `chapter`, not
`section`; `position` carries `angle` and `radius`; `bounds` carries `width` and
`height`; `relation_grammar` is glyph-and-verb, not stroke-and-dash). To run it:

```bash
python3 -m venv /tmp/mmvenv && /tmp/mmvenv/bin/pip install -r requirements.txt
MM_ALLOW_SNAPSHOT_CLIENT=1  # then api.use_snapshot(<snapshot.json>) and uvicorn :8200
open http://localhost:8200/     # it serves its own UI, same origin, no CORS
```

Three rules it is built on, each of which reads as a bug if you do not know it:

| rule | what it means in the code |
|---|---|
| **Drawn, not boxed** | Labels sit on coloured rules, hand-drawn style. No rectangles around words. |
| **The whole chapter stays on screen** | Tapping a topic opens it IN PLACE and closes the last. An earlier upstream build re-centred on the topic, which threw the chapter away and left three items on an empty canvas. |
| **Lines only when asked** | At rest it is a pure tree and nothing crosses. Select a concept and only its stated links draw in; everything unrelated dims rather than disappearing. |

Three changes were forced by the host and are marked in the files: selectors
prefixed `.atlas` (the original's `:root`/`body` rules would restyle all of
Emerge), dark mode made opt-in via `data-theme` rather than
`prefers-color-scheme` (following the OS dropped a black slab into a light
application), and `.atlas` taking its height from the frame.

### What is BETTER here than in the engine's own UI

- **Learned state is server-side, not `localStorage`.** The original's `atlas.v7`
  key is right for a single-file demo and wrong for a school: progress in a
  browser is one device, lost on a cleared cache, invisible to a teacher. The
  same four states live in emerge-core, at
  `learning/mindmaps/{item}/chapters/{section}/mastery`.
- **The mastery seam is closed, by the server.** A drill's `node_scores` are
  recorded by emerge-core as it relays the grade, so answering correctly ticks
  the concept on the map and moves the ring. The engine hands those scores to
  an LMS and deliberately forgets them; Emerge is the LMS. Score 1 is `known`,
  0.5 `shaky`, 0 `missed`, and that mapping is emerge-core's, not this app's.
- **A state never moves down**, enforced on BOTH sides. The original's `RANK`
  rule lives in `raise()` for the optimistic `read`, and the server (and the
  mock) enforce it too, so a client that forgot cannot un-learn a concept.
- **An opened branch cannot fall off the edge.** Concepts sit at 560 units where
  their topic sat at 250, and the original holds zoom fixed on open, so a wide
  chapter pushes them out of view. Zoom is now held UNLESS the branch genuinely
  does not fit. Note the subtlety: this has to run in an effect keyed on the open
  branch, because a tap handler closes over the layout from before the open.

### Not ported yet

The engine ships **three** views and only **Map** is here. `Connections` is a
second canvas (topic columns of cards, elbow connectors, verb labels, a minimap,
Tidy/Fit) and `Outline` is a text view with the chapter's stats and an atom-type
mix bar. Both are real screens, both are missing, and neither is stubbed.

**The Atlas does its own layout and ignores the server's `position`.** So does
the engine's UI: a two-level tree gives an open topic's concepts real vertical
room and moves its neighbours apart, which a radial layout cannot do at this
size. Both are deterministic, which is the property that actually matters.

**The flashcard engine ships no UI**, so `components/flashcards/` is ours. The
retrieval engine's `web_admin/` is an operator tool, not a student surface.

### Three properties of the mind-map engine that shape the UI

- **The spine is containment, not relations.** Measured on the Class-10 NCERT
  Science corpus: containment reaches 1,195 of 1,195 atoms; typed relations touch
  541, leaving **654 atoms (55%) with none at all**. `relation_count: 0` is the
  common case. Nothing may dim, hide or de-rank a node for it, and no view may
  discover nodes by walking relations, which would silently lose most of the book.
- **Layout must be deterministic.** A force simulation draws the same chapter
  differently on every load, so a teacher and a student on a call see two
  different pictures and the spatial memory a mind map exists to build is gone.
  The engine ships positions for that reason; the Atlas computes its own, also
  deterministically. Either is fine. A simulation is not.
- **`found: false` on a trace is an answer, not an error.** Most pairs have no
  stated link. The UI renders the absence and manufactures no bridge, which is
  the same refusal the engine makes.

### Two flags the flashcard UI is required to read

- **`grounding.no_good_match` arrives WITH a populated deck.** It means nothing
  in the library grounds this selection. Rendering the cards and ignoring it
  shows a student confident cards built from irrelevant material.
- **`judged_by: "lexical"` is a weaker instrument.** It is word overlap with no
  judge available: it may say correct, it never says incorrect. `StudyDeck`
  labels the verdict with the instrument rather than presenting it as a model's
  reading. `needs_review` is likewise not a fourth grade on the same scale, it is
  "could not decide", and showing it as wrong tells a student they failed a
  coin-flip.

### When a drill is NOT recorded

A drill returns `node_scores` (`node_id -> 0.0 | 0.5 | 1.0`) and the engine
holds no learner state by design. emerge-core records them only for a viewer
who is `tracked` and holds `core.concept_mastery.write`, and only when at least
one item was answered. Anyone else can still sit the drill, and `RecallDrill`
says on screen that nothing was recorded rather than implying progress.

---

## 11. Theme

- **Colour never rotates.** One school, one brand. Only radius, density,
  ornament and motion change across grade bands.
- The band axis was **measured** from the portal's own Junior and Senior sets:
  36px → 18px radius, 10.5px → 9.5px type, 31 → 17 illustrations.
- **Band resolves server-side** so the first paint is correct. Client-side would
  paint the default and visibly re-skin.
- `styles/theme/` is `colors` (raw ramps), `tokens` (what they mean), `typography`,
  `components/` (MUI overrides, one file per group), `bands` (rotatable), a
  factory and a provider. `docs/THEMING.md` has the values.
- **The palette is Slate Rose** (2026-10-03): paper beige ground `#F5F1EE`,
  soft white cards `#FBF9F7` with stone hairlines, ink `#17181C`, **rose
  `#B5535E` as the primary** (buttons, the selected nav row, tab indicator,
  focus ring) and **warm grey as the secondary** (muted text, borders). Error is
  a separate true red. Bricolage Grotesque / Inter / JetBrains Mono, cut-paper
  artwork in `public/ground/`. Values in `docs/THEMING.md`.
- **A component is restyled in the theme, not at the call site.** `sx` is for
  one instance. Titles and numbers use `Typography` variants (`h1`–`h6`,
  `display`, `figure`, `eyebrow`), never a hand-set `fontWeight: 800`.
- **Glass is chrome, cards are solid.** `variant="glass"` only where the paper
  artwork is behind it (sidebar, top-bar pill). The artwork is a CSS background
  on the frame, so it creates no stacking context for a fullscreen widget to lose to.
- **A card has a fixed anatomy, and the pieces exist.** `CardHeader` (title,
  one-line subheader, the card's action or switch in `action`) over a hairline;
  `CardToolbar` (`components/ui/`) for search, a count and the add button;
  rows in a `RecordList` when a row is a link or a button, or a `Table` inside
  `TableContainer` when it is not; `CardActions` as the footer strip holding
  `Pager`. Label and value pairs are `Field` inside a `dl`. A bare `ul` of rows,
  a `Box` with `overflowX`, or a count line beside a lone button is the old way.
- **At most one ink tile per page** (`variant="ink"`), and the rose marks one
  primary action. A text button is ink. Home's attention band is a light card
  with a rose icon tile, not an ink tile.

---

## 12. Deliberately not built

Client-side entitlement cache, encryption, integrity checks, refetch budgets,
circuit breakers, epoch polling: all solve problems the BFF removed. Also no
OpenFeature or flag vendor, no extra state library, no axios (nothing to
intercept), and **no committed tests** by house rule. `src/lib/` is pure so it
can be driven from plain Node.

## 12b. The emerge-core screens

Nested pages under Home — **My profile**, **Classes**, **Library** — reading
the school's own record through `/api/svc/core/*`. **People** started here and
moved to the top level on 2026-10-04 (section 12c), keeping its key.

They are nested under `emerge.home` for one reason, and it is the same reason
each time: `check-routes.mjs` FAILS a top-level route whose key is not in
`CAS_REGISTERED_KEYS`, and registering a key CAS has no row for makes it answer
`no_grant` and vanish with nothing in any log. Nesting makes them inherit
`emerge.home`, which every user with a dashboard holds, so they work today and
`check-routes.mjs` warns rather than fails. **Migrating each is one line in
`routes/registry.ts` plus one in `constants/features.ts`** once CAS has keys —
note the `emerge` shelf already carries a real `emerge.library` row (section
14), granted to nobody, which is what `emerge.home.library` should become.

The consequence on screen: **Home is now a link AND a disclosure**, with four
rows under it. That is the derived behaviour of a group that owns both widgets
and sidebar children, not a special case.

Six properties of emerge-core shape every one of these screens, and all six are
in `docs/DECISIONS.md` under "emerge-core, reading lists". The two that bite
hardest: `page.has_more` is derived from a full page rather than counted, so
there is no total and an exactly-full last page is followed by an empty one;
and `count` precedes per-row projection, so it is not the length of the array.

## 12c. The school foundation (admin group 1)

Built 2026-10-02 from the school-admin specification, whose screens and layouts
are final: **the screen is the contract, and the data is made to fit it.**

| screen | route | data |
|---|---|---|
| Home for an administrator | `/p/{persona}` | fixture-only overview |
| School Setup | `school/setup` | fixture-only checklist; every row is a link to the page that resolves it |
| School Profile | `school/profile` | fixture-only |
| Academic Years, one year, and its setup | `school/years`, `school/years/{id}`, `school/years/{id}/setup` | years, holidays and bell schedules are REAL; terms, the working week and the whole year register (below) are fixture-only |
| Rooms & Spaces, and one room | `school/rooms`, `school/rooms/{id}` | rooms are REAL; facilities, notes, the unavailable window and "who uses it" are fixture-only |

- **Home is chosen by a key, not a role.** `emerge.home.overview` is a
  registered key with a hidden route (`inNav: false`). `app/p/[persona]/page.tsx`
  draws the overview widgets in place of the default Home for whoever holds it.
  It has no CAS row yet, so in real mode nobody holds it and Home is unchanged;
  the admin fixture grants it through `AWAITING_CAS` in `server/dev/fixtures.ts`.
- **Fixture-only means refused outside the bypass.** `services/foundation.ts`
  answers from `src/fixtures/foundation.ts` under the bypass and otherwise rejects
  with `501 not_built`. It calls no invented route.
- **The simple screen sits on the real model where one exists.** A bell
  "schedule" is a backend bell schedule; a "slot" is a period (name and type,
  shared by every schedule of the day) plus that schedule's time for it
  (`lib/school/bell-slots.ts`). A "holiday" is a run of closed calendar days
  sharing a name (`lib/school/holidays.ts`), written one date at a time.
- **Pieces every later group should reuse:** `PageActions` (a widget puts the
  page's primary button in the page header), `description` on a route node,
  `FormDialog`, `ConfirmDialog`, `RowMenu`, `useToast`, `crumbsFor` for a detail
  page, and MUI X `DataGrid` (left unstyled) for a table that needs selection.
- A detail page lights the sidebar row above it (`activeHref`).

### An academic year is the school's register for that session

Reworked 2026-10-02 (the group 1 patch). A year is not a calendar with a name:
it is who was enrolled, where they sat, who taught them and what is still open.

- **Three lifecycles, mapped from the backend's own fields**
  (`lib/school/years.ts` `yearLifecycle`): `upcoming` is **Draft**, `is_current`
  is **Active**, anything else is **Closed**. One year is active at a time.
- **A draft year opens into a setup workspace**, not a form. `Add Academic Year`
  asks for a name and two dates, creates the draft and lands on
  `school/years/{id}/setup`: twelve areas, every one reachable in any order,
  resumable through `?step=`. Basic Setup embeds the year's own calendar
  editors and Bring Forward copies labels and calendar from another year
  (never pupils, teaching, rooms or the timetable). The other areas show where
  they stand and link to the page that exists today; their own workspaces
  belong to later groups.
- **Activation refuses until Basic Setup, Classes & Sections and Students &
  Promotion are ready**, and closes the outgoing year in the same step. There
  is no promotion run yet, so in the fixtures that third area never becomes
  ready and the success path has not been exercised on screen. Deliberate: a
  year activated without promotion would be an empty school.
- **The year page has six tabs**, addressed as `?tab=` and `?view=`:
  Overview (with the hand-over to next year folded in), Students, Classes &
  Sections, Teachers & Assignments, Calendar, and Actions on an active year
  only, with the pending count as a badge. Admissions and withdrawals are
  filters of Students, not a tab. **The year is for starting the session and
  reading its record, not for management**: a tab says where things stand and
  links to the page that changes them.
- **A student opens inside the year** at `school/years/{id}/students/{sid}`:
  this enrolment, the guardians, and every examination they sat, each mark
  opening to its remarks and answer sheet (`MarkDetailDialog`). The permanent
  record stays under People.
- **Teachers & Assignments reads from both sides** (`fixtures/year-teaching.ts`):
  a section × subject matrix per class, a per-teacher load, and a change log of
  joins, leaves and moves written as what they did to classes
  (`fixtures/data/staffing.ts`).
- **The Calendar is events, not configuration**: examinations, holidays,
  internals, PTMs, trips and camps on a month grid or a list
  (`fixtures/year-events.ts`, `fixtures/data/events.ts`). Working days,
  holidays and bell schedules are edited in the setup workspace (`YearShape`)
  and on Periods and bells. **Terms were removed**: nothing needed them.
- **Grades is an examinations module** (`components/grades/`, `fixtures/grades.ts`,
  `types/grades.ts`, MUI X Charts): a catalogue of examinations with how each
  went; an examination page (`grades/exams/{id}`) with the schedule and a
  question paper per class, class / section / subject filters in the URL, the
  analytics of whatever is selected (spread, averages by subject or by class or
  by section, top pupils) and the ranked marks table; a pupil page
  (`grades/students/{id}?session=`) with the trend against the section, the
  subject picture, and every paper against the section average. A mark opens
  to its remarks and the checked sheet question by question; a paper previews
  and downloads. Marks come from one fixed standing per pupil plus a lean per
  subject and the paper's difficulty, so trends and rankings are real.
- **The grade explorer** (`components/grades/grade-explorer.tsx`,
  `grades/students/{id}?session=&exam=&subject=`) is where a pupil's grades are
  read: student, year, examination and subject are switchable on the page and
  carried in the URL, so a link from an examination row opens prefilled and the
  administrator can move to any other pupil without going back. It reads three
  ways: the whole year, one subject across it, or one examination. The People
  record and the in-year student page carry a button to it, not the section.
  A **classmates roster** sits beside it with Class and Section pickers (any
  class of the year, a section or all of it, in roll order, each pupil's
  session average), with previous/next by the name and ← → keys; moving keeps
  the year, examination, subject and roster, and replaces history.
- **The student record is tabbed** (`?tab=`): Overview (figures, the grades
  link, class and identifiers, and the year's attendance: a compact month
  calendar beside a bar per month (a bar's column opens its month), an absent
  or half day opening its reason in a popover),
  Profile, Subjects & results (the explorer's reading of the pupil, then
  subjects and the report card; the old per-subject Results panel is gone, the
  examinations say it), Assignments, Posts. A pupil's whole-year attendance is
  generated on request (`attendanceOf`); the school-wide table keeps twenty days. A tab's count is
  drawn inline by `TabLabel`; a floating `Badge` is clipped by the tab scroller.
  `FactStrip` (`components/ui/fact-strip.tsx`) is the shared figures row.
- **An examination page has a date sheet per class** (`DateSheet`): each paper's
  date, time and maximum, with the question paper and the answer key where one
  was uploaded (about two in three, fixed per paper). Subjects filter as a
  multi-select; the analytics and the ranked table follow the selection.
- **The year has an Examinations tab** listing each examination with its dates,
  the classes it was set for and how it went; a row opens the examination with
  the year as its way back (`?from=year`).
- **The year Overview is a dashboard**: the roll as one composition bar,
  pupils per class, the examinations with their averages, next year's plans,
  the next events and staffing. Students opens on **By class**; the Calendar on
  **List** with search, and its month view draws events as bars across their days.
- **Buildings are added and removed on Rooms & Spaces** (`building-dialogs.tsx`). A building exists only through its rooms, so adding one creates its rooms floor by floor; removing one moves its rooms to another building or archives them, deleting nothing.
- **Subject offerings is the one subjects page.** The Subjects page and its two panels were removed. The class and section are chosen from an explorer (`section-explorer.tsx`), each subject shows Core or Elective (`is_elective`), a new subject can be created from the offering form, and a subject opens its subject browser.
- **Rooms & Spaces opens by building** (`components/school/rooms/rooms-buildings.tsx`,
  `?building=`): a card per building with its floors drawn as a small stack,
  then the chosen building floor by floor, each floor a row of compact room
  cards. The searchable, bulk-editable table is the second view (`?view=list`).
- **A branch is never a feature; only leaves are** (the user's rule, 2026-10-04).
  A sidebar group is a disclosure with no page and owns no widgets: any
  non-route key under it in `FEATURE_KEYS` makes `ownsWidgets` give it a page.
  Still breaking the rule: Home (owns `emerge.home.timetable` and
  `.announcements`) and Timetable builder (owns `.builder`).
- **People is a top-level group** on its existing key `emerge.home.people`
  (a registered CAS row, so it can gate at the top with no ancestor). It has no
  page; admissions sits on the Students and Teachers pages. Its children are **Students**
  (class outline + list, the same pattern as the year and the grade explorer),
  **Teachers** (one list with search and filters for class, section, subject,
  class-teacher duty, status and load; `fixtures/directory.ts`) and **Staff &
  others** (the emerge-core roster limited to staff and guardians: the one
  people list that reads the live API). Students and Teachers read fixture-only
  services and refuse with 501 outside the bypass. The children's keys are not
  in CAS and inherit `emerge.home.people`.
- **One enrolment list per year, and every student view is a filter of it.**
  `fixtures/data/enrollment.ts` holds `ENROLLMENTS` and `PAST_ENROLLMENTS`;
  status chips, grouping, admissions, withdrawals and pending documents all
  read `useYearEnrollments`. **Unassigned is a placement, not a status**: an
  enrolled pupil with no `section_id`, counted and listed everywhere.
- **A withdrawal ends the enrolment and keeps the person.** The row stays in
  the year with its leaving date, reason and the documents still owed.
- **Pending work is derived, never stored.** `pendingTasks(yearId)` in
  `fixtures/year-register.ts` is the one source; the year Overview, the School
  Setup row and Home's needs list all read it, so placing a pupil moves all
  three.
- **A closed year is read, not edited.** `YearModeProvider` puts the year in
  read-only mode and each part drops its controls rather than disabling them;
  the fixture refuses a write with `409 year_closed` as well.
- **The fixture school is sized by arithmetic** in `fixtures/data/cohort.ts`:
  48 sections, 1,906 active pupils (6 unassigned), 18 withdrawn, 96 teachers.
  Change the constants there, not the generated rows.

## 12d. Classes & Sections (admin group 2)

Built 2026-10-04. **Two doors, one component.** A principal runs the current
year from the sidebar, and sets up or reads any year from inside it:

| door | routes | gate |
|---|---|---|
| sidebar **Classes & Sections** (top level, always the current year) | `sections`, `sections/{class}`, `sections/{class}/{section}`, `sections/{class}/arrange` | `emerge.school.sections` (registered: the live tenant grants it) |
| the year's **Classes & Sections** tab, and its setup step | `school/years/{id}/classes/…`, same three below | `emerge.school.years` |

Both render `components/school/classes/`, told where they live by a
`StructureBase` path and what they may do by `StructureMode`
(`setup` for a draft, `active`, `readOnly` for a closed year, where every
control is dropped and the fixture refuses with `409 year_closed`). The old
School → Classes list and its two widgets are gone; Home → Classes (a
teacher's own classroom) is a different thing and stays.

- **The landing** is a card per class: section chips with counts (amber when
  the section has a gap), the unplaced, three readiness bars, and a
  timetable-readiness card at the foot. A draft year lists every class the
  school runs, so a class with no sections yet is visible and fixable.
- **A class** has Overview (readiness and every gap, each a link to its fix),
  Sections (table plus a row menu: edit, room, class teacher, roll numbers,
  split, merge), Students (the class in one grid, filtered by section),
  Subjects and Teachers (the year's matrix narrowed to the class).
- **A section** has a set-up card where each line carries its own button,
  streams and batches for Classes 11 and 12 (or any section that has groups),
  the moves made this year, and a student grid with multi-select move.
  `?act=room|teacher|rolls|edit|split|merge` opens that dialog on arrival, which
  is how every Actions card and Home's needs list lands on the fix.
- **The arrangement board** is an Unassigned tray and one lane per section.
  Drag one student, or click several and drag any of them; "Move selected to"
  does the same without a pointer. Built on **dnd-kit**, not HTML drag and
  drop, which flickered over child cards, could not scroll the content column,
  bound the ghost or run on touch. Drops resolve by `pointerWithin`; the card
  under the pointer is clamped to the visible board below the toolbar; only
  `<main>` auto-scrolls (a lane's own list is excluded by `data-lane-scroll`).
  A staged move reads "from 7A" in blue, sorts to the top of its lane, counts
  as +n / −n on both lanes and is listed under Changes with its own undo. Everything is staged; Review groups the
  changes by from → to before one save, and leaving with changes asks first.
  "Suggest a placement" and, in a draft year, last year's pupils (6A to 7A)
  are **proposals from the fixture**: the screen shows and applies them and
  computes nothing.
- **Rules the fixture enforces, not the screen**: a teacher leads one section a
  year (naming them elsewhere releases the old one); a moved pupil loses the
  roll number of the section they left, and in a running year the move is kept
  on their enrolment with date and reason; a merge moves the pupils and archives
  the section, deleting nothing; a new section takes a sibling's subjects, or
  last year's for its class, with no teachers.
- **Gaps are one list.** `yearStructure().classes[].issues` feeds the class
  overview, the cards, Actions (`pendingTasks`, with a `target`) and Home. A gap
  shared by three or more sections of a class folds into one line.
  `lib/school/structure.ts` `fixPath` is the one place a gap becomes a URL.
- Fixture-only: `fixtures/year-structure.ts`, `fixtures/data/groups.ts`,
  `services/structure.ts` (501 `not_built` outside the bypass).
- **Reworked 2026-10-06** (the user's patch list):
  - **A class is undivided or in two or more sections, never one.** An
    undivided class keeps exactly one section record, which the screens never
    call a section: `StructureClass.undivided` and `.whole`. Its pupils are
    simply in the class (`settle`), so it has nobody unassigned. Dividing
    (`createSection` on 0 or 1 records) makes A and B together; merging down to
    one record makes the class undivided again. A class not set up yet asks
    "as one class" (`keepAsOneClass`) or "in sections". The draft year's
    Class 10 is seeded undivided.
  - **A class page is its sections first**: cards that open each section, a
    folded "needs attention" strip, then Students and Subjects. The Overview
    and Teachers tabs and the readiness bars are gone. An undivided class shows
    its one group's tabs directly.
  - **A section has Overview, Students, Timetable, Attendance, Subjects**
    (`section-body.tsx`, shared by sections and undivided classes): tiles for
    teacher, room, students and today's register; today's lessons; the
    section's real timetable (`CalendarTab`); a register for any day.
  - **Subjects are managed in one place**: core or elective per subject, a
    teacher chip per section that changes the teacher (`setSubjectTeacher`) and
    links to the subject browser, and Add Subject that can create a new
    subject (`addSubject`). The class's Subjects tab is a section × subject
    matrix (core or elective and periods in each header, a teacher cell that
    changes the teacher, an amber Assign where none); a section's is a table
    with Change teacher and Open subject on every row.
  - **The subject page** (`subject-page.tsx`, `sections/{class}/{section}/subjects/{offering}`)
    reuses the Announcements and Assignments boards with a fixed `scope`
    (`NoticeScope`, `HomeworkScope`): the feed and the composer are limited to
    that subject in that section, nothing school-wide. Content and Curriculum
    are the classroom tabs.
  - Outlined buttons have a solid surface in the theme, and grid checkboxes
    stay visible at rest: controls that only appeared on hover read as missing.

## 12e. Announcements and Assignments

Built 2026-10-05. Both sit on emerge-core's classroom model (stream posts with
targets; assignments per subject offering, with targets and submissions) and
add what it does not carry yet in the fixtures only: `services/notices.ts` and
`services/homework.ts` answer 501 `not_built` outside the bypass. The empty
top-level **Timetable** (`emerge.timetable`, no widgets) was removed from the
registry; the key stays registered because the live tenant grants it.

- **Scope is what the caller teaches, never a role.** No `teacher_id` means the
  whole school; a teacher addresses, sees and sets work only for the sections
  and offerings in `TEACHER_ASSIGNMENTS` (plus what they wrote). Enforced in the
  fixture as well as the pickers.
- **Announcements** (`components/notices/`, `fixtures/notices.ts`,
  `fixtures/data/notices.ts`): a feed in four states derived from status and
  dates (Live, Scheduled, Drafts, Expired; Archived leaves every feed), with
  category, audience and "written by me" filters. **The audience is a pool**
  built from any mix of rules (`fixtures/audience.ts` resolves them): all
  students, classes, sections, named students; all staff, all teachers, class
  teachers (all or of a class), teachers of a class, of a section or of a
  subject, and named staff. Student-side rules go **to students, students and
  parents, or parents only** (`delivery`), and parent-only groups are named as
  parents ("Class 9 parents"). Reach counts each person once, a family once
  across its children. Student-side rules are stream-post targets; staff rules
  have no backend target type and live in `NOTICE_META.staff`. A teacher may
  add their own sections, the teachers of their classes or sections and any one
  colleague; school-wide and subject groups belong to the office. The composer
  also takes acknowledgement, pin, schedule and expiry, with live reach and a
  preview. The drawer (`?open=`) shows the audience, the share seen by group
  (each section's recipients, and the staff as one line), least read first,
  acknowledgements and replies. Category, parents,
  acknowledgement and reading figures are fixture-only (`NOTICE_META`).
  Reading starts at zero and climbs over a few days. Home's Announcements panel
  shows the latest four; the admin Home gets it as a quick action.
- **Assignments** (`components/homework/`, `fixtures/homework.ts`,
  `fixtures/data/homework.ts`): about four per section across subjects and
  states. The list filters by class, section, subject, teacher and "needs
  grading" in the URL. `assignments/{id}` has Submissions (status filter, a
  grading dialog that walks the filtered queue, excuse), Brief and Results
  (spread of marks, where everyone stands). States are derived: Draft,
  Scheduled, Open, Due date passed (still in Open until closed), Closed.
  Setting work for several sections creates **one assignment per section**, so
  each section's own teacher grades it; "chosen students" narrows each one with
  student targets. Marks are fixed once work has come in; marking work that
  was never handed in records it as given on paper.
- The fixture indexes submissions, targets and pupils once per answer
  (`indexNow`): scanning them per assignment cost half a second per list.

## 12f. GRASP (built 2026-10-06, demo)

A comprehension check at hand-in, Menti-shaped: a teacher sets homework under
**Learning → GRASP**, shares a six-digit code / QR, and students open
`/g/{code}` with no account, answer (typed or a photographed sheet), then read
their own answer back in 3–4 timed questions plus one untimed twin. Timed miss
+ untimed hit = "not in their words"; both missed = "didn't land".

- **It has its own backend in this app**: `src/app/api/grasp/*`, because phones
  and the teacher's laptop must share state, which browser-tab fixtures cannot
  do. Works the same with or without the dev bypass. Storage
  (`server/grasp/persistence.ts`) is **Upstash Redis** when
  `UPSTASH_REDIS_REST_URL`/`_TOKEN` (or Vercel's `KV_REST_API_URL`/`_TOKEN`)
  are set, which Vercel needs because its instances share nothing; otherwise a
  JSON file in the first writable of `GRASP_DATA_DIR`, `.grasp-data/`
  (gitignored) or the temp dir, else memory. Either way an empty store is
  seeded from `server/grasp/seed.ts`.
- **The student flow needs no shared store.** The phone sends its code, name,
  answers (and the QR's `?c=` carried check, `lib/grasp/carry.ts`) with every
  step, and the readback is rebuilt deterministically from the attempt id, so
  any instance can serve any step. On Vercel without Redis the phone side always
  works; only the teacher's live dashboard can miss hand-ins served elsewhere.
- **No live AI.** Readback items come from hand-written material per bank set
  (`server/grasp/bank.ts`); questions outside the bank get gap-fill items from
  the student's own sentences (`lib/grasp/readback.ts`). Sheet and paper
  "reading" recognise the sample files in `public/grasp-samples/` by content hash
  and fall back to a stand-in transcript. Swap point for a real model:
  `server/grasp/samples.ts` and `buildReadback`.
- Answer keys never leave the server; scoring is `lib/grasp/score.ts`.
- `/g` and the student API are in `OPEN_PATHS` in `proxy.ts` and exempt in
  `check-routes.mjs`. Samples are regenerated by a PIL script, not committed code.

## 12f. Actions (on the analytics key)

Built 2026-10-06. The sidebar's **Analytics** became **Actions**, the
principal's inbox, at `actions`, straight after Home. It keeps
`emerge.analytics` because the live tenant grants that key; the widget is
`emerge.analytics.inbox`.

- **One list of everything that needs a decision**, in ten areas: students
  (silent absences, chronic absentees, unplaced, missing roll numbers), fees
  (over 60 days, 30 to 60, recent, late fees accrued, concessions), discipline
  (serious incidents one by one, minor violations grouped, repeat offenders),
  staff (lessons uncovered today, leave requests, teachers with no classes,
  sections without a class teacher, subjects without a teacher, expiring staff
  documents), academics (grading backlog by teacher, missing work, marks not
  entered, syllabus behind plan), feedback and reports (parent complaints,
  class teachers' reports), admissions and records (applications, TC requests,
  leaver documents), facilities and transport, compliance deadlines, and
  communication (announcements short of acknowledgements).
- **Items are derived on every read, never stored.** `raiseAll()` builds them
  from their sources: pending tasks and section gaps from the year and
  Classes & Sections, assignments, announcements and attendance where those
  exist, and the seeds otherwise. Fix the source and the item disappears.
  Only what someone did to an item is kept (`STATE`: owner, snooze, done with a
  note, history).
- Order is urgent, high, normal, then soonest due, then oldest. Each item has
  a one-click step (recorded as a note, the item stays open), a link to the
  screen that fixes it, a hand-over to any member of staff, snooze until
  tomorrow or next week, and done with what was done. The drawer (`?open=`)
  lists who it concerns. Home's Needs attention card links to the inbox.
- **Teachers and students have their own inbox on the same key** (`fixtures/actions-mine.ts`,
  chosen by reach in `raiseAll`). A teacher's: the register for the class they
  lead, unexplained absences, monitor not chosen, incidents and parent
  complaints in that class, covers today, grading backlog and missing work on
  their own assignments, marks not entered after an exam, syllabus behind,
  unacknowledged notices they wrote, their leave and expiring documents. A
  pupil's (titled **To do**): work due in three days, late work still
  accepted, returned feedback, absences without a reason, tests and extra
  classes this week, their class duty, urgent notices and fees. Only the
  office hands an item to someone else.

## 12g. Jerry AI (built 2026-10-06, demo)

**Jerry AI** (top level at `jerry`, on its own key `emerge.jerry`, for students and the office; a teacher does not get it): an animated study-buddy dog (`components/jerry/`). No
backend and no model: `lib/jerry/brain.ts` matches what the student says
(English, Hindi or Gujarati) to scripted replies with rich cards (what's due, explain,
quiz, homework hints, progress, the day, a focus timer). Voice is the browser's
own speech recognition and synthesis (`use-voice.ts`; replies are spoken in short
pieces with the best installed voice, and Gujarati stays text-only when the
browser has no Gujarati voice), **scoped to the page**:
leaving it, hiding the tab, Esc or the Stop button cancels speech and the mic,
and nothing speaks once the page is gone. The mic needs a secure page
(localhost or https; a LAN IP is refused by the browser), and every failure is
shown in words. The dog is a vector illustration with six moods
(`jerry-dog.tsx`).

## 12h. Role views: teacher and student (built 2026-10-08, round two 2026-10-10)

One set of screens, two dials. **The CAS key decides whether a screen exists;
the caller's reach decides how much of the school it shows.** No component
reads the persona to decide data.

- **Reach** (`lib/reach/reach.ts`): `school` | `teaching` (sections taught and
  led, offerings taught) | `self` (one pupil) | `none`, built from `/auth/me`
  roles and `core.enrollments.read_all`. `useReach()` on screen, `reachNow()`
  in the fixtures, so a fixture narrows its answer exactly as emerge-core will.
  `seesSection`, `leadsSection`, `teachesOffering` are the three questions.
- **Class teacher is data**: `CoreRoles.class_teacher_section_ids`, which only
  the fixtures carry yet. A class teacher marks their section's register and
  owns its roll numbers and groups; everything structural (sections, rooms,
  teachers, subjects, moves, the arrangement board) is the office's.
  `useStructureRights(mode)` gives `structure` and `lead(section)`; the
  fixture refuses the same writes (`officeOnly`, `leadOnly`).
- **Grants** (`server/dev/fixtures.ts`) are explicit lists, not prefix rules:
  `CLASSROOM` for both, plus `TEACHING` or `LEARNING`. New registered keys:
  `emerge.home.teaching`, `emerge.home.learner` (Home variants, hidden routes
  like the overview; Home picks the first held, in the persona's order) and
  `emerge.subjects` (**My subjects**). Tools are kept off a persona by
  `lib/nav/persona-hidden.ts` rather than by registering keys, which would
  hide them from the real principal until CAS has rows: teacher tools from
  students and parents, study tools from teachers, My timetable from the
  principal. A route can be **titled per persona** (`titles`, `titleFor`):
  Learning is **AI plugins** for a teacher and the principal.
- **Teacher**: Home is My day (their timetable, a cover marked, the register
  they owe, work to mark, their classes). Classes & Sections opens on their
  sections (`TeachingClasses`); a section shows its other subjects only to its
  class teacher; a subject page writes only for the subject's own teacher.
  Attendance lists the sections they teach and marks only the one they lead.
  Grades narrows exams, marks entry, results, pupil search and the explorer to
  their sections (emerge-core's offerings read is flat, so that narrowing is on
  screen; marks writes are still the server's to refuse).
- **Student**: Home is Today (timetable, work to hand in, latest results,
  announcements). My subjects opens each subject's stream, My work and
  content. Assignments is **My work** (`myWork`, `handIn`: late only where
  allowed, never once closed or marked). Grades is **My results** without the
  classmates roster, which a pupil is refused. Attendance is their own year.
  Announcements shows what reached them, without reading figures or audiences.
- **Round two (2026-10-10)**, each fixture-only (501 `not_built` outside the bypass):
  - **The timetable rule**: a class teacher takes their section's first period
    every day and marks the register then; one teacher per subject per
    section; stand-ins are free specialists, load-balanced
    (`fixtures/data/timetable.ts`, audited at zero clashes).
  - **My timetable** (`emerge.timetable`, top level, both personas): a day as a
    timeline (`fixtures/my-week.ts`, `components/timetable/`), each lesson
    opening its subject, the register button on the lead's first period, leave
    and covers marked, `?week=&day=` in the URL. **Extra classes**
    (`fixtures/extra-classes.ts`) are booked from it for a whole section or
    chosen pupils, refused on a clash, and drawn on the pupils' timelines too;
    a Saturday shows only its extras.
  - **Leave** (`emerge.home.leave`, `fixtures/leave.ts`): apply with a reason,
    balances by kind, cancel while pending; the principal decides it in
    Actions, and approved leave marks the timetable.
  - **My students** (`emerge.students`): the student explorer and record
    narrowed to reach; a pupil outside it is a 404.
  - **Class roles** (`fixtures/class-roles.ts`): monitor, vice-monitor and up
    to four pupils per duty, set by the class teacher on the section page; a
    pupil sees theirs on Home (My class).
  - **Section announcements**: a tab on the section, written by its class
    teacher, read by its other teachers.
  - **Set a Test** on Grades: a unit test, sessional or class test across the
    teacher's own sections, created as a draft exam with one paper each.
  - **Shared with chosen pupils** (`fixtures/material-shares.ts`), on a
    subject's Content tab: the subject's teacher hands material to named
    pupils; each pupil sees only what was handed to them.
  - **My house** (`emerge.house`, `fixtures/houses.ts`): for the teacher who
    heads one, standings (ties share a place), captain and vice-captain,
    members, and a points log they award to.
- **Round three (2026-10-11)**, each fixture-only (`services/school-life.ts`):
  - **Calendar** (`emerge.calendar`, teacher and student, `fixtures/my-calendar.ts`):
    the year's events whose audience includes their classes, their own leave
    and extra classes as `personal` events, a PTM naming the class they lead,
    and a **Date sheet** tab; a paper that has been sat opens its question
    paper. The calendar card is `CalendarBoard`, shared with the year page.
  - **Leave notes** (the `home/leave` route, titled per persona,
    `fixtures/pupil-leave.ts`): a pupil sends a note, the class teacher
    approves it from Actions, and approval marks those absences as leave.
  - **Report an incident** on a pupil record, for teaching reach; it raises in
    the class teacher's and the office's Actions with the note attached.
  - **My house** for a pupil: their house read-only, their classmates listed.
  - **Fees** (`emerge.fees`, registered; the live tenant grants it): My fees
    for a pupil (instalments, receipts), the fee book for the office.
- **View-as reloads the page**, so it also wipes the tab's fixture writes.
- Not in this round: the parent view, a coordinator tier, teachers seeing each
  other's timetables.
- **The fixtures' today is the school's date** (`TODAY` in `fixtures/data/classroom.ts`,
  Asia/Kolkata). It was UTC, which put every screen a day behind from midnight
  to 05:30 in India.

## 13. Open
- **Announcements and Assignments have no school-wide backend.** Stream posts,
  assignments, targets and submissions exist in emerge-core; categories,
  parents, acknowledgement, reading figures, reminders, excusal, feedback and
  the cross-class views are fixture-only. Attachments keep only their names.
- **The role views need CAS rows and one emerge-core field.** Rows for
  `emerge.home.teaching`, `emerge.home.learner` and `emerge.subjects`, grants of
  `emerge.school.sections` and `emerge.announcements` to teachers and students,
  and `class_teacher_section_ids` in `/auth/me` roles. Until then real mode
  keeps today's Home and no teacher reaches Classes & Sections.
- **A pupil cannot acknowledge an announcement yet**; there is no action for it.
- **Actions has no backend.** Everything it lists is gathered by `fixtures/actions-sources.ts`; fees, conduct, complaints, staff leave and absence, admissions, maintenance, deadlines, marks entry and syllabus pace are seeded in `fixtures/data/actions.ts` because nothing else records them. Its state (owner, snooze, done, notes) lives in the tab.
- **The fixture's attendance clusters absences on a minority of pupils**, so the attendance items use high bars (eight of twenty days; six unexplained days still running).
- **Classes & Sections has no backend.** Sections, rooms and class teachers
  exist in emerge-core; the structure answer, moves with history, roll
  assignment, merge, streams, the suggestion and the next-year proposal are
  answered by `fixtures/year-structure.ts` only.
- **Group 1 runs on the bypass only for its new parts.** Terms, the working
  week, the setup checklist, the school profile, the overview and room insights
  have no backend. So does the `activity` slot type, which emerge-core would refuse.
- **The year register has no backend.** Lifecycle beyond the three stored
  fields, enrolment entry and exit detail, leaver documents, next-year plans,
  setup areas, pending tasks, bring-forward and activation are answered by
  `fixtures/year-register.ts` only. emerge-core has enrolments and
  `promotion_status`; the rest is a contract waiting for a service.
- **Nothing records a promotion decision or runs a promotion**, so a draft year
  cannot yet be activated from the screen. That arrives with the Students group.
- **`Add New Admission` on a year links to People.** There is no admission form.
- **No answer sheet or question paper file exists.** Both are generated from
  the mark and the paper's shape; the download is that page as HTML.
- **Three older pages now overlap the year page**: Calendar, Periods and bells,
  and the Academic years table on Structure. They are still in the sidebar,
  awaiting a decision to remove them.
- **The working week is not tied to the calendar.** Saving it changes the
  fixture's weekly pattern and nothing else; calendar days are still per date.
- **One branch is assumed** by the year page and the rooms page (the first one).
- **`emerge.home.overview` needs a CAS row** before a real principal sees the
  new Home.

- **The live `dps-ngp` tenant and this app disagree about which keys CAS has.**
  Recorded 2026-10-01: `/v1/me` for the principal carries 64 keys, including
  `emerge.learning.papers`, `emerge.school.exams`, `.structure`, `.sections`,
  `.subjects` and `.offerings`, which `CAS_REGISTERED_KEYS` still lacks (so they
  inherit and `check-routes.mjs` warns). `emerge.school.timetable.generate`,
  its `.solver` widget and `emerge.learning.papers.blueprints` have no CAS row
  at all. `emerge.analytics` and `emerge.announcements` are live there, unlike
  the seeded estate in section 14.
- **Dates are formatted in whatever locale each side defaults to.** Fifteen call
  sites pass `undefined` as the locale, so the server writes `Friday, 2 October`
  and the browser `Friday 2 October`, and the Attendance page fails hydration.
  One fixed locale in one helper is the fix.
- **Only the principal has been recorded.** No teacher, student or parent answer
  from the live tenant exists yet, so those three users are still modelled on
  the seeded estate, and no emerge-core list has been compared with its mock.

- **`CAS_TRUSTED_PROXIES` is unset.** Behind a BFF, CAS's per-IP throttle becomes
  tenant-wide. **Blocking for shared deployment.**
- **The `emerge` shelf and the route registry describe different sidebars.** See
  section 14. Nothing on the new shelf is granted or registered.
- **`emerge.learning.labs` is unregistered in CAS**, so Labs cannot be denied
  independently of Learning.
- Persona switcher: exercised only under the dev bypass, where the `dev` fixture
  user deliberately holds two designations. No seeded CAS user has two.
- **Retrieval and flashcards are unreachable in real mode.** No `X-School-Id`,
  so both answer 400. Section 10. **Blocking for anything but the dev bypass.**
  emerge-core is not in this group (`SCHOOL_TENANT_SERVICES`,
  `server/core/tenant.ts`), and neither are mind maps, which now travel through
  it.
- **Mind maps in real mode are verified against the dev mocks and the wire
  contract, not a live emerge-core.** The mastery and curriculum-link routes
  were still being built when this side was written.
- **`useMindMapNode` has no caller.** The concept sheet reads relations off the
  map's own edges, so `…/nodes/{node}` is wired and unused.
- **`CORE_SCHOOL_ID` is one school per deployment**, which is what a one-school
  front end needs and nothing more. The value is a candidate that emerge-core
  then confirms against the session's token before anything carries it, and the
  confirmation is worth exactly what the CAS token carries: with no `tenant_id`
  claim, `RequireTenant` skips the comparison and the configured school stands
  alone. Serving several schools from one host means resolving it per session,
  and `configuredSchool()` is the one function that changes.
- **emerge-core in real mode is verified against a stub, not a live backend.**
  The proxy's four tenant outcomes were exercised end to end; every response
  shape was transcribed from the Go handlers and reproduced in the dev mocks.
- **The four emerge-core pages are gated by `emerge.home`, not by keys of their
  own.** Nobody can be given People without Home, or Library without People.
  Section 12b; the fix is CAS rows plus two lines per route.
- **Nothing in the library uploads or downloads.** `POST /library/assets` needs
  an object store and answers 503 without one. The presigned PUT binds three
  headers into the signature, so a client that sends only the URL fails; that
  is the larger half of the work and none of it is done.
- **Status is displayed everywhere and filterable nowhere.** Every area
  validates its own enum and `catalog.columnFields` emits every column as
  `data_type: "string"` with no `enum_values`, so a dropdown would have to
  hardcode a list belonging to the API.
- **`emerge.learning.flashcards` is `is_enabled = false` in CAS**, which was
  right while the key led nowhere and is now wrong: it has a real screen behind
  it. The dev fixture deliberately diverges to keep the feature reachable. Flip
  the CAS row and the divergence goes away.
- **The mind map's `Connections` and `Outline` views are not ported.** Section 10.
- Three levels of nesting is untested. Everything is depth-agnostic and two
  levels are verified; a third would indent and work but has not been looked at.
- **Placement is declared, not fetched.** If CAS ever exposes
  `features.placement` to a non-admin caller, the route/widget split becomes
  derivable and the build-time conflict check turns into a runtime one.

## 14. The seeded estate

Two things live in `mentis` now and they do NOT describe each other yet.

### What the registry actually renders

`routes/registry.ts` has **12 routes, 3 nested, 1 group with no page**:

```
Home · Attendance · Assignments
Learning            (group, no page of its own)
  ↳ Mind maps · Flashcards · Labs
Grades · Announcements · Fees · Actions (on emerge.analytics)
```

`emerge.learning.labs` is **not** in `CAS_REGISTERED_KEYS`, so it inherits
`emerge.learning` and cannot be granted, killed or switched off on its own.
`check-routes.mjs` warns about exactly this and does not fail, because the
permissive default is deliberate while a branch is being built out.

The eight original `emerge.*` feature rows are unchanged:

| key | active | enabled | kill_switch |
|---|---|---|---|
| `emerge.analytics` | yes | yes | **yes** |
| `emerge.announcements` | **no** | yes | no |
| `emerge.learning.flashcards` | yes | **no** | no |
| `emerge.assignments`, `emerge.attendance`, `emerge.fees`, `emerge.grades`, `emerge.home`, `emerge.learning`, `emerge.learning.mindmap`, `emerge.timetable` | yes | yes | no |

The killed, the inactive and the disabled rows are there on purpose: each
produces a different CAS reason, and they are what a naive build gets wrong.

### The `emerge` shelf, built 2026-09-08, NOT yet wired up

A second, fuller sidebar design was created in CAS as **19 keys in 8 folders**,
every one active + enabled + sidebar:

```
emerge/
├── learning/       Learning, My learning, My courses
├── study-tools/    Study tools, Mind maps, Flashcards, Notes
├── ai-hub/         AI Hub, Jerry AI, AI explain, Gap analysis
├── assessments/    Assessments, Assignments, Test, Exam prep
├── library/        Library
├── progress/       Progress
├── calendar/       Calendar
└── messages/       Messages
```

Shelf rule: a key's folder is `emerge/<its top-level entry>`, so
`emerge.study-tools.mind-maps` sits in `emerge/study-tools` and that folder is
where its widgets go.

**None of it is granted and none of it is in the registry**, so none of it
renders. It supersedes `emerge.learning.mindmap` and `emerge.learning.flashcards`
(now under Study tools), which are still on the `academics` shelf, and it
duplicates `emerge.assignments` as `emerge.assessments.assignments`. Reconciling
the two trees is the open piece of work.
