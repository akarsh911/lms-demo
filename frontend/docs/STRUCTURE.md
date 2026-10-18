# Structure, what every folder is for

Top to bottom. One line each.

---

## Root

| | |
|---|---|
| `src/proxy.ts` | Runs on **every request**. Redirects anonymous users, refreshes + persists tokens. Next 16's name for `middleware.ts`. |
| `next.config.mjs` | Turbopack, security headers, CSP. |
| `eslint.config.mjs` | Includes the rule banning `role === '…'`. |
| `scripts/check-routes.mjs` | Build gate. Fails on a bad key, an ungated page, a bad persona table. |
| `public/brand/` | Logo files for email / OG / favicons. |

---

## `src/`, the layers

Rule of thumb: **the further down, the fewer dependencies.**

```
app/         routes only          ← thinnest
components/  what you see
hooks/       when to fetch
services/    how to fetch
server/      server-only
lib/         pure logic           ← no React, no I/O
types/  constants/  routes/  styles/

modules/     a feature that owns its own copy of those layers
```

`modules/<feature>/` cuts ACROSS the stack instead of sitting in it. A folder
earns one when a feature is large enough that scattering it through the shared
layers buries them: virtual labs is 290-odd files, and spread out it was most
of `components/` and most of `lib/`. Inside a module the same layering applies,
one level down.

---

## `src/app/`, routes, nothing else

- **No logic here.** Pages call a gate, then render a component.

| | |
|---|---|
| `layout.tsx` | Root. Loads the font, resolves the grade band, mounts providers. |
| `providers.tsx` | Theme + React Query. **No entitlement context**, that never reaches the client. |
| `page.tsx` | `/` → redirects to the user's default persona. |
| `sign-in/` | OTP form. The only public page. |
| `p/[persona]/layout.tsx` | The shell: top bar + sidebar. **Not a gate**, layouts don't re-run on navigation. |
| `p/[persona]/page.tsx` | Dashboard = the `emerge.home` section. |
| `p/[persona]/[...section]/` | **Every other route, at any depth**, resolved from the route registry. `learning/mindmap` lands here too. One file serves all. |
| `api/svc/[service]/[...path]/` | The authenticated proxy to microservices. |
| `design/` | Living design reference. Dev tool. |
| `icon.svg` | Favicon. Next picks it up automatically. |

---

## `src/server/`, server-only

- Every file starts `import 'server-only'` → importing one client-side is a **build error**.

| | |
|---|---|
| `dal.ts` | **The gates.** `requireSession` · `requirePersona` · `requireFeature`. Every page calls one. |
| `session/cookie.ts` | Seals/opens the session cookie (AES-256-GCM, server-side key). |
| `session/store.ts` | Per-process: refresh single-flight, rotation record, snapshot cache. |
| `cas/client.ts` | The only place CAS is called. |
| `cas/errors.ts` | Classifies failures → sign out / refresh / throttled / unavailable. |
| `entitlement/resolve.ts` | `/v1/me` → intersect → evaluate → snapshot. |
| `actions/auth.ts` | Server Actions: OTP start, verify, sign out. Can set cookies. |
| `band.ts` | Which grade band this user renders in. |
| `core/tenant.ts` | Which school this session is. The `X-School-Id` emerge-core confirmed for this token — never anything a client can set. |
| `request-ip.ts` | Derives a trustworthy client IP. Never echoes a client header. |

---

## `src/lib/`, pure logic

- **No React. No fetch. No cookies.** That's what makes it testable from plain Node.

| | |
|---|---|
| `entitlement/decide.ts` | CAS reason → UI state. The only place that mapping lives. |
| `entitlement/resolve-key.ts` | Nested keys: registered → CAS decides; unregistered → inherits its nearest registered ancestor. |
| `entitlement/chunk.ts` | Splits keys into ≤64 batches. |
| `core/fields.ts` | emerge-core's three-valued field policy. `all` / `enumerated` / `permitted`, and why an absent field is withheld rather than empty. Also `breadth`, where `not_applicable` is not a restriction. |
| `core/roster.ts` | Finding the person on a roster row, and knowing when a name is withheld rather than absent. |
| `nav/build-nav.ts` | `registry ∩ entitlements` → the sidebar TREE, ordered by the persona lens. `navTrail` finds the branch holding the current page. |
| `persona/select.ts` | Groups → personas. The lens that can only narrow. |
| `logger.ts` | |

---

## `src/components/`

| | |
|---|---|
| `ui/` | **Primitives.** Chip, Stat, Progress, Tile, Row, Avatar, Segmented, EmptyState, headers. Use these; don't restyle a `Box`. |
| `widgets/` | Panels. `registry.ts` lists them; `widget-grid.tsx` picks which render. |
| `widgets/<owner>/` | One folder per page that owns panels. |
| `widgets/_template/` | **Copy this** to make a widget. Never imported. |
| `widgets/widget-states.tsx` | The four states every widget must render. |
| `navbars/side-nav.tsx` | Two frames over one tree: permanent from `lg`, a Drawer below it. |
| `navbars/nav-tree.tsx` | The recursive nested list. A leaf is a link, a sidebar-only group is a toggle, a group that owns widgets is both. |
| `navbars/nav-drawer-context.tsx` | The mobile drawer's open state, shared by the top bar and the sidebar. |
| `navbars/nav-menu-button.tsx` | The hamburger. Client island inside the server-rendered top bar. |
| `navbars/` | Top bar, persona switcher, sign out, icons. |
| `brand/` | Logo, band switcher. |
| `auth/` | Sign-in form. |

---

## `src/modules/virtual-labs/`, the practicals

Fifteen CBSE Class 10 practicals: the benches, their physics, their marking,
their tours and their attempt records. Self-contained — it reads the shared
layers, and nothing outside reads into it.

| | |
|---|---|
| `index.ts` | **The public surface.** `ResumeDock`, `LabBenchWidget`, `LabAttemptsWidget`. That is everything the rest of the app may use. |
| `contract.ts` | The second surface, for `server/`: wire types and `isBenchId`, pure, no React. Separate from `index.ts` so a server file can validate a bench id without pulling the whole bench UI into the server bundle. |
| `components/<id>/` | One folder per practical: its apparatus, its stage, its tours, its trainer. |
| `components/` | The shared bench machinery: the runner, the workspace, the console, the catalogue, the resume dock. |
| `components/guided-tour/` | The spotlight tour and the visual trainer a bench runs inside. |
| `lib/<id>/` | That practical's engine: pure, no React, drivable from plain Node. |
| `lib/` | Shared pure logic: the bench list, viva draws, marking, session records. |
| `hooks/` · `services/` · `types/` · `widgets/` | The module's own copies of the shared layers, same rules as the top-level ones. |

**Two rules hold it together.**

- **Inside the module, import through `@labs/*`** (`tsconfig.json`), which maps
  to `src/modules/virtual-labs/*`. Outside it, `@labs/*` must never appear.
- **Outside the module, import `@/modules/virtual-labs` or
  `@/modules/virtual-labs/contract` and nothing deeper.** Needing something
  else means adding a line to one of the two entry points, not a deeper path.

Both are one `grep` each.

Retrieval is NOT in here. `components/textbook/`, `lib/retrieval/` and the
`use-retrieval-*` hooks are the textbook surface over a separate engine; labs is
their only caller today, which is not the same as owning them. Nor are the
generic utilities a bench happens to be the only user of — `hooks/use-interval`,
`use-element-width`, `use-reduced-motion`, `use-store`, `lib/store`,
`lib/safe-storage` and everything in `components/ui/`.

---

## Data layers

| | |
|---|---|
| `services/api.ts` | fetch → `/api/svc/*`. Error shape. No axios. |
| `services/<domain>.ts` | Endpoints + types. **No React, no caching.** |
| `hooks/query/` | Reading. One hook per endpoint. |
| `hooks/mutation/` | Writing. Optimistic → rollback → invalidate. |
| `hooks/use-active-class.ts` | Reads `?classId=&date=` from the URL. |

---

## The rest

| | |
|---|---|
| `routes/registry.ts` | **Single source of truth for routes.** Path ↔ feature key ↔ nav. |
| `constants/features.ts` | The two key lists. `CAS_REGISTERED_KEYS` is the gating switch. |
| `constants/personas.ts` | Group → role name, and each persona's ordering. |
| `constants/services.ts` | Microservice registry. Prevents SSRF. |
| `constants/query-keys.ts` | Cache keys, centralised so invalidation is typo-proof. |
| `constants/cas.ts` · `session.ts` | CAS paths/errors; cookie + TTL settings. |
| `types/` | Wire + domain types. One file per domain. |
| `styles/theme/` | `tokens` (fixed brand) + `bands` (rotatable) + factory + provider. |
| `paths.ts` | URL builders. Client-safe, no keys in it. |
| `config.ts` | Site name, CAS URL. |

---

## Where to put a new file

- A screen → `app/`
- Something visible and reusable → `components/ui/`
- A panel → `components/widgets/<owner>/`
- Anything about a virtual practical → `modules/virtual-labs/`
- A nested sidebar entry → a `children` node in `routes/registry.ts`
- Fetching → `services/` + `hooks/query|mutation/`
- Anything touching the token or CAS → `server/`
- Logic with no React → `lib/`
- A magic string → `constants/`
