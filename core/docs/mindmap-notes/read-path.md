# Mind maps: the read path

Written 2026-10-02. This is phase 3 of `docs/MINDMAP-INTEGRATION-PLAN.md` — the read path and
`core.mindmaps.read` — without mastery and without the curriculum link. The code carries no
comments; this file is where the reasoning lives.

## What was built

Seven routes under the tenant-scoped `/api/v1`, all gated by `core.mindmaps.read`:

```
GET  /learning/mindmaps
GET  /learning/mindmaps/{item_id}/chapters
GET  /learning/mindmaps/{item_id}/chapters/{section_id}
GET  /learning/mindmaps/{item_id}/chapters/{section_id}/nodes/{node_id}
GET  /learning/mindmaps/{item_id}/chapters/{section_id}/trace        ?from=&to=&max_hops=
GET  /learning/mindmaps/{item_id}/chapters/{section_id}/drill        ?kind=&n=&seed=&topic_id=
POST /learning/mindmaps/{item_id}/chapters/{section_id}/drill/grade
```

| Piece | Where |
|---|---|
| Entity key | `internal/authorization/entities.go` (`MindmapsRead`) |
| Outbound client and section cache | `internal/service/mindmap/` |
| Routes, book loading, the list, the 409 | `internal/transport/http/mindmap.go` |
| The six proxied handlers and the status mapping | `internal/transport/http/mindmapproxy.go` |
| Config | `MINDMAP_ENABLED`, `MINDMAP_ENGINE_BASE_URL`, `MINDMAP_ENGINE_TIMEOUT` |
| Wiring | `cmd/api/main.go` (`newMindmapClient`, `transport.UseMindmaps`), `server.go` (`mountLearning`) |

No ent schema change, no migration, no write to any table.

## The order of checks, and why that order

1. **Switched on?** `MINDMAP_ENABLED` and `MINDMAP_ENGINE_BASE_URL` and a built client, or a 503
   naming both variables. This applies to the list too, although the list calls nobody: a list
   that answers while every map behind it refuses would read as a school whose books are all broken.
   The route's `s.can` middleware runs before the handler, so a caller without the key gets the 403
   first and learns nothing about the deployment.
2. **`core.mindmaps.read`**, in the route middleware.
3. **The library decision.** `scopeFor(LibraryRead, LibraryReadAll)`, then a 403 naming
   `core.library.read` when that decision is not allowed. This check is not optional:
   `LibraryItemsFor` does not look at `Decision.Allowed`, and a refused decision carries no reach,
   which falls into `LibraryItemsAnyRole` — everything the caller relates to as a pupil, a guardian
   or a teacher. Without the check, a caller refused the library would read it through this route.
   `resolveCurriculumNodeContent` and `searchLibrary` make the same explicit check for the same
   reason.
4. **The item**, through `access.LibraryItemsFor`. Unreadable and absent are the same 404 with the
   same body as `GET /library/{id}`. There is no second visibility rule. Mutation-tested: with the
   predicate replaced by `AnyLibraryItem` at both call sites,
   `TestMindmapsFromPostgresRefuseABookOfAnotherOffering` fails on all six routes with a 200 and
   `TestMindmapListFromPostgresCarriesOnlyReadableBooksEachWithItsState` fails on the listed book.
   Both run against a real tenant database, because the stub drivers return rows without
   evaluating `WHERE`.
5. **An engine document**, or a 409 naming the item's `index_status`.
6. **A CAS tenant slug**, or a 503 saying the school has none.
7. **The section belongs to that document**, or a 404.
8. **The outbound call.**

Query strings and the grade body are validated before step 3, as every other handler here parses
before it resolves a scope.

## Decisions

### Any indexed kind, not only `kind=book`

`content_items.kind` is `book | note | document | paper` and **defaults to `document`**. Nothing in
indexing reads it to decide whether to index: `indexOnPublish` sends any published item with an
asset. A textbook uploaded without naming a kind is therefore a `document`, and a `kind=book` gate
would hide exactly the books that went through the GPU pipeline and have concepts. The retrieval
engine also already answers the real question per document — `structure` is `toc`, `flat` or
`none` — and the mind-map service forwards that answer rather than deciding itself.

So the gate is the engine document, not the label. The list accepts the library's own `kind`
filter, so a client that wants only books asks for `?kind=book`.

Rejected: restricting to `book`. It would be this server's second opinion about what is mappable,
resting on a column whose default is something else.

### `mindmap_state` and the 409 use one function

`mindmapStateOf` is used by the list and by the 409, so the list can never say `available` for an
item the routes refuse, or the reverse.

| State | When |
|---|---|
| `available` | `engine_document_id` is set |
| `held` | no document, `index_status=held` |
| `parked` | no document, `index_status=parked` |
| `pending` | no document, `index_status=pending` |
| `failed` | no document, `index_status=failed` |
| `not_indexed` | no document, and `index_status` is `none` or (inconsistently) `indexed` |

`available` follows the document id and not `index_status=indexed`, deliberately. `MarkPending`
sets `pending` on a republish **without** clearing `engine_document_id`, so an item being re-indexed
still has the document its last index produced. The brief's gate for the routes is "no
`engine_document_id` -> 409", so such an item opens; calling it `pending` in the list would have the
list and the routes disagree. `index_status` is on the row as well, so a client that cares can see
both.

`held` reads "the material exists and its map can be drawn once that build is published". It never
reads as missing material, and a test pins the wording.

These are states this server can know from its own columns. The plan's finer states
(`no_structure`, `not_extracted`, `partial`) need the engine's answer and are not in this slice:
the list makes no outbound call.

### The list honours the library's field policy

The list row is `id`, `title`, `kind`, `subject_id`, `grade_level_id`, `index_status`,
`mindmap_state`. Each column is included only when the caller's `core.library.read` field policy
permits it, because otherwise this route would be a way around a policy the library enforces.
`id` and `mindmap_state` are always present: the first is always readable everywhere, and the
second is the reason the route exists. `engine_document_id` is never on the row.

### Relay, not wrap

A 200 from the mind-map service is relayed byte for byte with `Content-Type: application/json`.
It is not decoded into a Go type and not nested inside an envelope.

- This repo answers a single resource as a bare object (`GET /library/{id}`), and wraps only its
  own collections in `{"<plural>": [...], "count", "page"}`. A map, a node, a trace, a drill and a
  grade are single resources. The chapter list is the engine's `{"documents": [...],
  "total_sections": n}`, already a named collection, and it is not paged.
- Modelling the payload here would make this server a second answer to what a map is. The first
  field the mind-map service added would be silently dropped by a Go struct that did not know it.
- The frontend already consumes the mind-map service's shapes, so its rewire is a path change.

The only thing checked is that a 200 body is valid JSON. One that is not becomes a 502 rather than
being served under a JSON content type.

`GET /learning/mindmaps` is this server's own collection and uses the repo's envelope:
`{"mindmaps": [...], "count", "page"}`, with the filters and paging of `GET /library`.

Refusals, whether local or relayed, use this repo's error body with a `code`, as
`GET /library/search` does: `{"error", "message", "code"}`.

### The section-membership check

`{section_id}` comes from the caller. The mind-map service takes a section id alone and the engine
checks only that the caller may see that section's document. So without a check here, a caller
reading book A could name a section of book B in the same school that they can also see, and
receive B's map under A's URL. That is harmless today. It stops being harmless in the mastery
phase, where a score is stored against `(content_item_id, section_id)`: a learner's score would be
filed against the wrong book. The check exists now so that later work cannot forget it.

- Membership is read from `GET /chapters?document_id=<engine_document_id>`. Only documents whose
  `document_id` equals the one asked for are walked, so a service that ignored the filter and
  answered with every document would still not admit another book's section.
- Sections are collected recursively through `children` and `sections`. The engine's tree is flat
  today (`parent_id` on each row); the walk does not depend on that.
- The cache is in process, keyed by (CAS tenant slug, engine document id, a SHA-256 of the caller's
  bearer), 60 seconds, at most 512 entries, evicting expired entries and then the soonest to
  expire. The slug is the key the engine partitions on and maps to one school. The caller is in
  the key since 2026-10-02; `curriculum-link.md` says why.
- **The cache can only confirm.** A section it holds is admitted without a call. A section it does
  not hold is asked for again, every time. A chapter rename re-mints the section id, and a cache
  that answered "no" for a minute would 404 a chapter that had just appeared.
- An empty list is never stored, and a body that is not a chapter list is a 502 and is not stored.
- An entry answers only the caller whose own token earned it. This paragraph used to say the
  cache was filled by whichever caller asked first and then confirmed membership for others in
  the same school, on the argument that the map is fetched afterwards with the caller's own token.
  That argument holds for the map, node, trace, drill and grade routes and not for the mastery
  routes or the curriculum link, which make no further call.
- `GET .../chapters` always calls the service. It refreshes the cache as a side effect and is
  never answered from it.

Mutation-tested: with the check removed, `TestMindmapsFromPostgresRefuseAChapterOfAnotherBook`
fails on all five section routes with a 200 carrying the other book's map.

### No transaction, and no database work across the outbound call

The engine answers a map request by calling back into this server (`GET /library/scopes`) with the
same token. Anything this request holds from the pool is held for that whole round trip, and the
callback needs a connection of its own.

`RequireTenant` puts a pooled `*ent.Client` in the request context. It does not open a
transaction, and each query takes a connection and returns it. So the rule reduces to: open no
transaction, and finish every query before calling out.

- `mindmapBookFor` does all of the database work under its own `timeout(r)` context and returns
  plain values: the document id, the slug and the token. Its `defer cancel()` runs before the
  caller makes any outbound call, so nothing database-side can still be in flight.
- The outbound call runs on `r.Context()`, not on that cancelled context.
- `TestMindmapHandlersNeverOpenATransaction` parses `mindmap*.go` and fails on any `.Tx` or
  `.BeginTx` selector.
- `TestMindmapsFromPostgresRelayTheServiceAsTheCallerHimself` counts recorded statements at the
  moment the fake service is first called and again at the end, and requires them equal.

### The caller's token

The auth middleware needed **no change**. `cas.Verifier.VerifyAccessToken` already stores the raw
token on `authorization.Subject.RawToken` (tagged `json:"-"`), and the policy client and the admin
client already read it from there.

- It travels as `Authorization: Bearer <token>`, unchanged. No admin token is sent (D1), and the
  client has no field for one.
- It is never logged. The client logs nothing; an unreachable-service error carries the URL, which
  holds a section id and no credential.
- A redirect is never followed. The client returns the 3xx, which maps to a 502. A bearer token
  must not follow a `Location` header to wherever it points.
- With `AUTH_DISABLED` there is no token. The client then sends no `Authorization` header at all,
  and the engine decides. It does not invent an identity.

### `with_answers` is forced, in the client

`mindmap.DrillQuery` has no answers field and `Client.Drill` always sends `with_answers=false`, so
no caller of the package can ask otherwise. The route accepts `with_answers` as a known parameter
and ignores its value, because a client written against the mind-map service sends it. Refusing it
would break that client for asking for the safe value.

M1 in the plan still applies: `with_answers=false` blanks `answer` but the service still returns
`prompt`. That is the mind-map service's defect to fix; this layer cannot fix it without reading
and rewriting the drill.

### Query strings and the grade body

- Unknown parameters are a 400 through `filter.Params.Err`, the convention every list here uses.
- `include_descendants` is **not** exposed on any route. It is not in the frozen contract, and the
  grade must rebuild the drill the GET built; exposing it on one and not the other would let them
  disagree. It can be added to both together.
- `kind` is passed through unvalidated. The drill vocabulary belongs to the mind-map service, which
  answers 422 naming the permitted values.
- `n`, `seed` and `max_hops` must be whole numbers. `from` and `to` are required on a trace.
- The grade body is `{kind?, n?, seed?, topic_id?, answers}`. Unknown fields are refused, `answers`
  is required and must be an object of text. What is sent upstream is the validated struct
  re-encoded, not the caller's bytes.

### One key on a POST

`POST .../drill/grade` is gated by a `read` key. Every other POST in this server is gated by
`create`, `write` or `generate`, and `router_test.go`'s `verbFits` says so. The exception is
deliberate: in this phase a grade stores nothing — it is a computation over a chapter the caller
may already read. When grading starts writing mastery rows, that write is gated by
`core.concept_mastery.write` in addition. The mind-map routes are therefore tested by their own
table rather than added to `routeTable`.

Since the mastery phase that table's test is
`TestEveryMindmapRouteIsGuardedByItsOwnKeyAndByTheMindmapKey`, the GET routes have joined
`routeTable`, and only the grade route remains outside it. `mastery.md` says why.

### No `areaColumns` entry

See `docs/CAS-KEYS-TO-REGISTER.md` under "Mind maps". The area has no table and nothing would
honour a field policy on it, so it is pinned in `fieldlessAreas`.

### Config

Declared as `RETRIEVAL_*` is. `MINDMAP_ENABLED` with no `MINDMAP_ENGINE_BASE_URL` is a boot
failure, as `RETRIEVAL_INDEX_ENABLED` with no base URL is. The handlers check `cfg.Mindmapping()`
and the client independently, so a server built without the client still refuses with the 503.

`MINDMAP_ENGINE_TIMEOUT` defaults to 30s. The router's own request ceiling is also 30s
(`requestTimeout` in `server.go`), and the database work comes out of the same budget, so the
effective ceiling on the outbound call is whichever is shorter. Raising the variable above 30s does
nothing unless the router's ceiling is raised for these paths.

`.env.example` lists the three variables with no explanatory block, because the standing rule is no
comments in files this work writes. This section is that block.

## Status mapping

What the mind-map service answered, and what this server answers.

| Upstream | Answer | `code` | Message |
|---|---|---|---|
| 200 | 200 | — | the body, byte for byte |
| 200, not JSON | 502 | `mindmap_service_unavailable` | names the mind-map service |
| 400 | 400 | `mindmap_upstream_refused` | upstream `detail` |
| 401 | 401 | `mindmap_upstream_refused` | upstream `detail` |
| 403 | 403 | `mindmap_upstream_refused` | upstream `detail`, unchanged |
| 404 | 404 | `mindmap_upstream_refused` | upstream `detail` |
| 409 | 409 | `mindmap_upstream_refused` | upstream `detail` |
| 422 | 422 | `mindmap_upstream_refused` | upstream `detail` |
| 503 | 503 | `mindmap_engine_unavailable` | names the retrieval engine, then `detail` |
| anything else, including 3xx and 2xx other than 200 | 502 | `mindmap_service_unavailable` | names the mind-map service and the status |
| unreachable, timeout | 502 | `mindmap_service_unavailable` | names the mind-map service |
| chapter list unreadable | 502 | `mindmap_service_unavailable` | names the mind-map service |

Local refusals:

| Condition | Answer | `code` |
|---|---|---|
| no `core.mindmaps.read` | 403 | — |
| switched off, or no base URL, or no client | 503 | `mindmap_disabled` |
| no `core.library.read` | 403 | — |
| item unreadable or absent | 404 | — |
| no engine document | 409 | `mindmap_not_indexed`, with `index_status` and `mindmap_state` |
| school has no CAS tenant slug | 503 | `mindmap_tenant_unmapped` |
| section not in the item's document | 404 | — |
| unknown parameter, malformed body | 400 | — |

The same mapping applies to the chapter-list call made by the membership check, so a superadmin's
403 arrives as a 403 from whichever call the engine refuses first.

"Upstream `detail`" means a `detail` that is a JSON string. The mind-map service's own request
validation answers a 422 whose `detail` is a list of objects (a drill with an unknown `kind` is
the case found against the real service), and that list used to be relayed as a stringified array
in `message`. Since 2026-10-02 a `detail` that is a list, an object, absent, or in a body that is
not JSON is not relayed at all: `message` is the plain sentence naming the status, "the mind-map
service refused the request with 422". Raw upstream JSON never reaches `message`.

Why each line is what it is:

- **403 is passed through with the engine's own words.** A token that names no school — a
  superadmin, or anyone who reaches more than one school — is refused by the engine with a 403.
  Reworded as a 502 or 503 it would read as an outage and someone would be paged for it.
- **401 is passed through** for the same reason: it is the engine refusing the token (most likely
  its audience), and the message says which.
- **503 names the engine.** It is what the engine answers when it cannot reach this server's scopes
  route. It is an outage, it is not this server's and it is not an empty book.
- **Everything else is a 502 naming the mind-map service.** As of 2026-10-02 the mind-map service
  itself turns every engine failure other than 400, 404 and 422 into a 502, so until plan item 5.3
  lands there, an engine 401, 403 or 503 reaches this server as a 502 and is reported as one.
  The mapping above is what applies once the service passes those through.

## What was rejected

- **A second visibility rule.** Maps inherit `LibraryItemsFor`. If pupils are later allowed
  grade-wide books (D6), maps follow with no change here.
- **An admin token on this path**, and a service-to-service secret (D1, D4).
- **Calling the engine directly.** The mind-map service is the one thing that knows how to compile
  a map; this server fronts it for authorisation and nothing else.
- **A negative cache** for section membership. See above.
- **Persisting anything.** A graded drill returns `node_scores` and this phase drops nothing and
  stores nothing; mastery is the next phase.
- **Holding the item row or a transaction across the call** to "keep the check and the call
  consistent". The engine re-checks the caller's labels itself, with the same predicate mirrored
  as labels; that is the consistency.

## Open

- `docs/STATUS.md` and `docs/DESIGN-NOTES.md` are not updated by this slice.
- `scripts/cas-core-roles.py` does not grant `core.mindmaps.read` to any bundle yet (plan 5.5).
- The mind-map service does not forward `Authorization` yet (plan 5.3), and the engine does not
  resolve labels on the graph route yet (plan 5.1). Until both land, a gated book is a 404 or a
  502 from upstream however correct this layer is.
- Held books cannot become `available` until the held-to-indexed reconciliation (G1) lands.
- `include_descendants` is not exposed.
