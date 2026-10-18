# Emerge front end, onboarding

Read this once. Then `CONVENTIONS.md` when you write code.

---

## 1. The one idea

- Every route, section and panel is gated by a **CAS feature key**.
- Key present → it renders. Key absent → it does not exist in the DOM.
- **No roles anywhere.** `if (role === 'teacher')` is a lint error *and* a build failure.
- The frontend decides what is **offered**. CAS decides what is **permitted**. A `403` is normal.

---

## 2. Key shape and placement

A key has a **depth** and a **placement**, and they are different things.

```
emerge.attendance                 sidebar  → nav row + URL
emerge.attendance.summary         widget   → a panel on that page, no URL
emerge.learning                   sidebar  → nav row + URL, and a parent
emerge.learning.mindmap           sidebar  → NESTED nav row + /learning/mindmap
emerge.learning.mindmap.canvas    widget   → a panel on the Mind maps page
```

- **Depth** says where a key sits in the tree. `parentOf` gives the key above it.
- **Placement** says what it is. `sidebar` → an entry in `routes/registry.ts`.
  `widget` → an entry in `components/widgets/registry.ts`. A key in both fails
  the build.
- Placement is **declared here, not fetched**. CAS stores `features.placement`
  but returns it only from the admin catalog, which no Emerge user can read.
- Depth used to imply placement (2 = section, 3+ = widget). It no longer does,
  which is what makes a nested sidebar entry expressible.

**Nesting rules**, both enforced by `check-routes.mjs`:

1. A child's `path` is ONE segment relative to its parent. The full URL is
   composed by the registry, so a nav row and its URL cannot disagree.
2. A child's feature key must descend from its parent's. The URL tree and the
   key tree are then the same tree, which is what lets inheritance work.

**Does a group have a page?** Derived, never declared:

| the node | what the sidebar draws |
|---|---|
| a leaf | a link |
| a group whose every child is a sidebar route | a toggle. No href, no route, the URL 404s |
| a group that also owns a widget key | a link plus a separate chevron |

`emerge.learning` above is the middle row: both its children are sidebar routes,
so it owns nothing to put on a page. Add one `emerge.learning.<widget>` key and
it becomes the bottom row.

---

## 3. What a widget is

- A card on a page. Owns **one query**. No route of its own.
- Registered in `src/components/widgets/registry.ts` with `feature`, `span` (of 12), `order`.
- `WidgetGrid` picks which ones render. A widget **never checks its own entitlement**.
- Must render **4 states**: loading · error · empty · data. Use `widget-states.tsx`.
- Each is wrapped in its own error boundary, one failing panel can't blank the page.

---

## 4. Two key lists (this is the bit people get wrong)

| List | Meaning |
|---|---|
| `CAS_REGISTERED_KEYS` | CAS has a row. CAS decides. Final. |
| `FEATURE_KEYS` | Everything the UI names, including keys CAS lacks |

- Not in `CAS_REGISTERED_KEYS` → **inherits its nearest registered ancestor**.
- Why: CAS answers an unknown key with `200 no_grant`, same as a *deliberate* denial. Indistinguishable. So the list is explicit.
- To gate a widget independently: create the key in CAS **+** add it to `CAS_REGISTERED_KEYS`.
- **Top-level keys must always be registered**, no ancestor to inherit from.
- A **nested sidebar** key that is not registered inherits its parent, so it
  appears for everyone who holds the parent and cannot be denied on its own.
  Legal, and `check-routes.mjs` warns about it rather than failing.

---

## 5. How data flows

```
browser → /api/svc/<service>/<path> → [handler adds Bearer] → microservice
```

- Browser **cannot** call a service directly, the token is in an HttpOnly cookie.
- Service *name* is looked up in a fixed registry. Never a caller-supplied URL (SSRF).
- Same origin → cookie rides along → **no CORS anywhere**.

Entitlements (server-side only):

```
GET /v1/me            → candidate keys (availability only, scope-blind)
POST /v1/features/evaluate → the authority (scope, and the reason)
```

- Never render from `/v1/me`.
- **Never send the user's own group keys as `context`**, a parent holds attendance for their child's class without being in it, so that returns `out_of_scope` and hides real access.

---

## 6. Four layers, one job each

| Layer | File | Job |
|---|---|---|
| Client | `services/api.ts` | fetch + error shape |
| Service | `services/<domain>.ts` | endpoints + types. No React, no caching |
| Query | `hooks/query/use-*.ts` | caching, `enabled`, abort signal |
| Mutation | `hooks/mutation/use-*.ts` | optimistic → rollback → invalidate |

- **No axios.** Nothing to intercept, the proxy attaches the token, `proxy.ts` refreshes.

---

## 7. Query vs mutation

- **Query** = reading. `useQuery`. Cached. Safe to re-run.
- **Mutation** = changing. `useMutation`. Never cached.
- Rule of thumb: GET → query. POST/PATCH/DELETE → mutation.

Query template:
```ts
useQuery({
  queryKey: queryKeys.attendance.summary(classId, date),
  queryFn: ({ signal }) => attendanceService.getSummary(classId, date, signal),
  enabled: Boolean(classId),
});
```
- Forward `signal`, else abandoned requests run to completion.
- `enabled` guards params *inside* the hook (hooks can't be called conditionally).
- No `try/catch`. Let it reach TanStack; the boundary renders it.

Mutation template, all four callbacks or none:
```ts
onMutate   → cancelQueries, snapshot, apply optimistic
onError    → roll back to snapshot
onSettled  → invalidateQueries
```
- `cancelQueries` is **not optional**, an in-flight refetch will overwrite your optimistic write and it'll look like the change silently reverted.
- Invalidate the **prefix** (`queryKeys.attendance.all`), not one key, marking a roster changes the summary too.
- Cache keys live in `constants/query-keys.ts`. A typo'd key doesn't error; it just silently invalidates nothing.

---

## 8. File structure

```
src/
  constants/   features, personas, services, session, query-keys
  types/       wire + domain types
  routes/      registry.ts  ← single source of truth for routes
  lib/         pure logic. No React, no I/O.
  server/      server-only: dal, session, cas, actions
  services/    browser → BFF transport
  hooks/       query/ · mutation/
  components/  ui/ (primitives) · widgets/<section>/ · navbars/ · brand/
  styles/      theme/, tokens (fixed) + bands (rotatable)
  app/         routes only. Logic lives above.
```

- One hook per file, named after the hook.
- `server/*` starts `import 'server-only'` → importing it client-side is a build error.
- Widgets go in `components/widgets/<section>/`.

---

## 9. Theme

- `tokens.ts` = brand. **Fixed.** Colour never rotates.
- `bands.ts` = Foundation (N–4) · Middle (5–8) · Senior (9–12). **Rotates** radius, type, density, ornament, motion.
- Band resolves **server-side** from CAS class groups.
- Ask the theme for a value; never branch on the band.
- Never hardcode a colour, radius or spacing.
- `/design` = every primitive, live, band-switchable.

---

## 10. Adding things

**Widget** → key in `FEATURE_KEYS` → component in `widgets/<owner>/` → entry in `registry.ts`

**Nested section** → child node in `routes/registry.ts` (`path` = one segment,
feature key nested under the parent's) → key in CAS → `CAS_REGISTERED_KEYS`

**Section** → key in CAS **+** `CAS_REGISTERED_KEYS` **+** `FEATURE_KEYS` → `RouteNode` in `routes/registry.ts` → icon in `nav-icons.tsx`

**Service** → row in `constants/services.ts` + env var

Then: `npm run check:routes`

---

## 11. URL state

- Path segment = a **place**. Search param = **which slice** of that place.
- `?classId=…&date=…` → `hooks/use-active-class.ts`. Shareable, Back works, survives refresh.
- Widgets never get URLs.

---

## 12. Before you push

```sh
npm run typecheck && npm run lint && npm run check:routes && npm run build
```

- **No test files** (house rule). Verify in real Chrome, or a throwaway Node harness.
- `next lint` was removed in Next 16, use `eslint .`.

---

## 13. Gotchas already paid for

- `proxy.ts`, not `middleware.ts`. Both present = build error.
- Turbopack is default, a `webpack` key in `next.config.mjs` fails the build.
- MUI: import `@mui/material-nextjs/v16-appRouter` (docs still say v15).
- MUI `sx`: `borderRadius: 999` becomes **19980px** (it multiplies). Write `'999px'`.
- MUI 9 `Stack`: `alignItems`/`justifyContent` moved into `sx`.
- CAS `expires_at` is an **RFC3339 string**, not epoch seconds.
- CSP: omitting `script-src` does **not** relax it, it falls back to `default-src`.
- The product is **Emerge**. `mentis` in a DB name or email is a legacy system name.
