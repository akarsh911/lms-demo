# Mind map integration plan

Written 2026-10-02, revised the same day after Akarsh's decisions. **Plan only — nothing in this
document is built.** It covers six repos: `lms-mind-map` (cloned to `D:\lms-mind-map`),
`lms-retrieval-engine`, `emerge-gpu-ingest` (`D:\emerge-ingest-app`), `emerge-core`, `CAS` and
`emerge-frontend`.

Every claim in section 2 was read in code on that date unless it says otherwise. Three things could
not be checked from this machine and are marked where they matter: the live CAS database, the
production deployment, and whether any ingested book has concepts.

---

## 1. Decisions

| # | Question | Decision | By |
|---|---|---|---|
| D1 | How the engine is called | **emerge-core forwards the user's token** through the mind-map service to the engine. No admin token on this path. | Akarsh |
| D2 | Who extracts concepts | **The retrieval engine's pipeline, run by the GPU ingest app.** Not emerge-core, not the mind-map service, not the shared server. | Akarsh |
| D3 | Does `unit` exist above `chapter` | **Optional.** A chapter sits at the root or under a unit; a topic must sit under a chapter. Being enforced now by session `emerge-core-e0`. See 3.2. | Akarsh, via `emerge-core-e0` |
| D4 | Inbound secret on the mind-map service | **No. Network isolation only.** | Akarsh |
| D5 | Retention of mastery rows | Not answered. Working default in 5.4; still Akarsh's call. | open |
| D6 | Pupils and grade-wide books | Not known. Does not block; working answer in 3.4. | open |

---

## 2. What exists today

### 2.1 lms-mind-map

A stateless FastAPI service (port 8200, one commit). It compiles the engine's concept graph for one
chapter into a laid-out map and serves recall drills.

- Routes: `/chapters`, `/map/{section_id}`, `/map/{section_id}/node/{node_id}`,
  `/map/{section_id}/trace`, `/map/{section_id}/drill`, `POST /map/{section_id}/drill/grade`.
- One upstream, two calls: `GET /syllabus/tree` and `GET /syllabus/nodes/{id}/graph`.
- **No authentication.** It forwards `X-School-Id` and an optional configured `X-Admin-Token`.
  **It does not forward `Authorization`** (`client.py:64-73`), so D1 cannot work through it today.
- It holds no learner state. A graded drill returns `node_scores` for the caller to persist.
- The upstream is called on every request before the cache is consulted (`api.py:108-113`), so a
  cached map never bypasses the engine's access check. Nothing pins this with a test.
- `pytest -q`: 23 passed here, against the synthetic corpus. The real snapshot the README quotes
  numbers from is not on this machine.

| # | Defect | Where |
|---|---|---|
| M1 | `with_answers=false` blanks `answer` but still returns `prompt`, the unmasked sentence containing it | `recall.py:197-198`, `:277` |
| M2 | The canvas defaults the tenant to `S_42`, against the repo's own rule | `web/index.html:327` |
| M3 | The docs name an `MM_ALLOW_SNAPSHOT_CLIENT` setting that does not exist | `client.py:112` |
| M4 | The docs say mastery is handed back on the next map request; `/map` takes no such parameter | `api.py:183` |

### 2.2 lms-retrieval-engine (`main` @ 6c2e710)

- `GET /syllabus/nodes/{section_id}/graph` exists (`api.py:2957-3059`). **No test references it.**
- **It never resolves the caller's labels.** `_visible_section` (`api.py:2399`) calls `_visible`
  without `held_labels`, which defaults to empty and fails closed. `/syllabus/tree` has the same
  gap. `/figures` and `/syllabus/nodes/{id}/chunks` do it correctly (`api.py:2161`, `:2204`). So
  under D1 every gated school book is a 404 until this is fixed. Read, not run.
- Labels come from the user's bearer via emerge-core's `GET /api/v1/library/scopes`, cached 60s per
  token and school (`api.py:984-1040`, `scopes_client.py`). emerge-core resolves the slug the
  engine sends (`middleware/tenant.go:60-78`).
- A token is verified only when `RE_JWT_ISSUER` and `RE_JWT_AUDIENCE` are set. The token must name
  the engine's audience (`config.py:410-420`).
- **A token with no `tenant_id` is a 403** (`api.py:806-828`). CAS omits the claim for anyone who
  reaches more than one school, so superadmins cannot open a map on this path. The engine calls
  this a known gap.
- Curriculum tags are document-level only (`Document.curriculum_node_ids`). Sections and topics
  carry no curriculum id.
- Section ids hash the document id and the chapter's display path (`ingest.py:138`). **A chapter
  rename re-mints the id.**

### 2.3 Concept extraction and the GPU pipeline

D2 is mostly how the system already works.

- `scripts/ingest_local.py` extracts topics, atoms and relations **by default** whenever a local
  model is configured (`:1156-1163`). The bundle carries them (`bundle.py:189-192`, `:277-286`) and
  the server's bundle and complete-held routes store them (`api.py:254-256`, `:4694`).
- The GPU app's BUILD stage runs exactly that script. Server-side `RE_AUTO_EXTRACT` is off by
  default and should stay off.
- The road for a book is: emerge-core upload with `ingest_mode=defer` -> the engine holds the bytes
  -> the GPU app fetches, proposes chapters, a person reviews, it builds and publishes.

Two gaps on that road:

- **G1. emerge-core never learns a held book was published.** A deferred upload is recorded
  `index_status=held` with `engine_document_id` cleared (`indexer.go:302-306`, `:351-353`). `held`
  is terminal and the sweeper re-drives only `failed`, `pending` and `none`
  (`sweeper.go:311-324`). So the only books that have concepts are exactly the books emerge-core
  cannot link to an engine document. **This blocks everything else.**
- **G2. A build can finish with no concepts and say nothing.** Without Ollama, or with
  `--no-topics`, the bundle publishes with chapters and passages only. The GPU app lists Ollama as
  advisory.

**Production, as reported by session `emerge-core-e0` on 2026-10-02 (its query, not verified
here):** 22 library items are `held` — 20 books, one document, one note, about 850 MB — and one
book is indexed. Every held row was written once and never touched again. **No GPU build has ever
been run on any of them**, so no production book has a concept graph and none can have a mind map
until builds are run. It also means the reconciliation's legacy path has no unrecoverable rows
today: the engine should still be holding all 22, so their promised ids can be recovered by
checksum. A build completed before the reconciliation ships would create the unrecoverable case
(the engine's document list carries no checksum), so the sweep should ship before builds start.

A side finding, not on this path: emerge-core refuses `defer` together with confirmed chapter
placements (409), because the engine used to. The engine now carries tags on a held upload
(`api.py:4134`, `:4202`). That refusal is stale.

### 2.4 emerge-core

- No mind-map code, no learner-state table.
- Curriculum: `curricula` keyed by `(academic_session_id, subject_id, grade_level_id)`;
  `curriculum_nodes` with `kind` in `unit | chapter | topic`.
- Books: `content_items` with `engine_document_id` and `index_status`.
- Curriculum-to-book link: `content_placements` — a node placed on a content item with a page
  range and a `proposed | confirmed | rejected` status. Resolver: `GET /curriculum-nodes/{id}/content`.
- Book visibility is one predicate, `access.LibraryItemsFor` (`access/library.go:129`), mirrored as
  engine labels by `retrieval/labels.go`.
- No per-school plugin or entitlement table, by design.

### 2.5 emerge-frontend (`main` @ 8bd77b3)

**The mind-map UI is already built.**

- `Learning -> Mind maps` is a registered route gated by the feature key `emerge.learning.mindmap`.
- A React port of the canvas exists (`components/mindmap/`), with drill, trace and node detail.
- It calls the mind-map service directly through the BFF. **In real mode every call fails**: the
  proxy sends the study engines no `X-School-Id` (`constants/services.ts:95-105`).
- Mastery calls `academics/mastery/{section}`, which has no backend.
- Chapters come from the engine. Nothing links them to emerge-core's curriculum.

### 2.6 CAS

- No code change in `D:\CAS` or `D:\Internal-Admin-Console`.
- An entity key is a registered row. An unregistered key can be held by nobody and fails closed.
- Features control visibility only. They authorise nothing.
- **No script in `emerge-core/scripts` mentions `library`.** Whether pupils hold
  `core.library.read` in the live CAS is unverified.

---

## 3. Curriculum

### 3.1 The requirement

A curriculum is chapters, and topics sit inside chapters.

**The data follows this; the API does not enforce it.**

- Local demo tenant, counted 2026-10-02: 45 units at the root, 72 chapters each under a unit, 237
  topics each under a chapter. No exceptions.
- The handlers check only same-curriculum and no-cycle (`curriculum.go:451-497`). `kind` defaults
  to `topic`. A topic at the root or a topic under a topic is accepted.

**This enforcement is not this plan's work.** It is being built by session `emerge-core-e0`
(agent `w5-shape`), which reported the following on 2026-10-02. None of it was verified here.

### 3.2 The shape being enforced (D3), as reported by `emerge-core-e0`

| level | parent | binds to | page range |
|---|---|---|---|
| `unit` | none | a whole book | none |
| `chapter` | none, or a unit | an ingested book chapter | required |
| `topic` | must be a chapter | its chapter's material | inherited |

- Units are optional; nothing may require one.
- **Landed as `cd3cd85` on `main`.** Refusals are 422. The database enforces only "a unit has no
  parent" and "a topic has a parent"; topic-under-chapter and chapter-under-unit are enforced in
  the handler only, so a raw INSERT of a topic under a unit still succeeds. The migration
  (`20261001205404_add_curriculum_node_shape_checks`) had not been applied to any shared database
  when it was reported.
- That session owns `internal/ent/schema/curriculumnode.go`,
  `internal/transport/http/curriculum.go`, its test, one new tenant migration, and an appended
  section of `docs/DESIGN-NOTES.md`. **Do not edit those for mind-map work until it has landed.**
- Its survey: production `emerge_tenant_dps_ngp` and both local databases hold 45 units, 72
  chapters and 237 topics with no violations.
- **Production has no working curriculum-to-book mapping.** `content_placements` holds 7
  smoke-test rows with NULL page ranges, bound to unrelated documents; `content_nodes` is empty.

What this plan takes from it:

- The mind-map link reads chapter and topic nodes only, so an optional unit changes nothing here.
- A chapter with a required page range is exactly what the join in 3.3 needs.
- The curriculum link (phase 5) has **no data to run on** until real chapter placements with page
  ranges exist. That is a content task, not a code task, and it is a prerequisite.
- **The page range stays on `content_placements`**, confirmed by that session: a curriculum
  chapter maps to different pages in different books, so the range belongs to the mapping. A
  chapter placement requires a range and a unit placement must not have one, which depends on the
  node's kind, so it is an application rule at the write path. `page_start` stays nullable.
- The frontend already sends `kind` on every create (`curriculum-tab.tsx:56-60`, `:118`, `:224`,
  verified), so the rule breaks nothing there. One gap: its root-level add always creates a
  `unit`, so a chapter at the root — legal now that units are optional — cannot be made from the UI.
- `held` means material exists and the index is pending. It must never read as "no material".

### 3.3 How the two hierarchies line up

| emerge-core curriculum | retrieval engine | join |
|---|---|---|
| chapter node | `Section` (`sec_`) | the placement's page range overlapping the section's pages |
| topic node | `Topic` (`top_`) | the placement's page range containing the topic's first page |
| — | `ConceptAtom` (`atm_`) | none; atoms exist only on the engine |

The join is **computed on request, never stored**. Engine topic titles are written by the
extractor and section ids re-mint on re-ingest after a rename, so neither is a durable key.

**Known hole: repagination.** A re-parse that moves pages while keeping titles leaves a page-range
join pointing at the wrong pages, with no second identifier to disagree. The link response
therefore carries the document's `structure_digest`, so a caller can see the document moved since
a placement was confirmed. Detecting it properly is the job of the stored content-node binding
that `emerge-core-e0` is building, which keeps both keys and the digest. A topic node with no
placement of its own resolves through its chapter (`include_ancestors`, `resolve.go:446`).

### 3.4 Pupils and grade-wide books (D6)

Pupils see a book shared to the school, to themselves, or to a subject offering they are enrolled
in. They do not see books shared to a section or a grade (`access/library.go:43-80`). The design
doc records why: the model has no "for whom" dimension, so a section-wide item may be teacher-facing
(`LIBRARY-ACCESS-DESIGN.md` failure 19, decision 9.1).

**Working answer: do not change the rule in this work.** Publish a textbook that pupils should map
at `offering` or `school` audience. Maps inherit whatever the library rule is, so if the rule
changes later, maps follow with no change here.

---

## 4. Target architecture

```
browser
  -> emerge-frontend BFF   /api/svc/core/learning/mindmaps/...      bearer + school
       -> emerge-core      core.mindmaps.read, book visibility, tenant slug, mastery
            -> lms-mind-map      forwards Authorization + X-School-Id, decides nothing
                 -> lms-retrieval-engine   verifies the token, resolves labels
                      -> emerge-core  GET /library/scopes   (cached 60s)
```

- **emerge-core fronts the mind-map service.** A CAS entity key needs an enforcement point and the
  mind-map service verifies nothing.
- **The user's token travels the whole way.** emerge-core checks the book with `LibraryItemsFor`;
  the engine checks it again with the labels that mirror the same predicate. Two checks, one rule.
- **The mind-map service is on the service network only**, with no published port and no
  `MM_ADMIN_TOKEN`.
- **"Plugin" is two CAS keys**: the feature `emerge.learning.mindmap` for per-school visibility,
  and the `core.*` entity keys for authorisation. No plugin mechanism is added.

### Routes, keyed by the library item

```
GET  /api/v1/learning/mindmaps                                    mappable books the viewer can read
GET  /api/v1/learning/mindmaps/{item_id}/chapters
GET  /api/v1/learning/mindmaps/{item_id}/chapters/{section_id}
GET  /api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/nodes/{node_id}
GET  /api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/trace
GET  /api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/drill
POST /api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/drill/grade
GET  /api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/mastery
PUT  /api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/mastery
GET  /api/v1/curriculum-nodes/{id}/mindmaps
```

Each request:

1. `core.mindmaps.read`.
2. Load `{item_id}` through `LibraryItemsFor`. Not readable -> 404.
3. Take `engine_document_id`. Missing -> 409 naming the index state.
4. Confirm `{section_id}` belongs to that document, so a mastery row can never be filed against
   the wrong book.
5. Close the database transaction, then call the mind-map service with the user's bearer and
   `X-School-Id` = the CAS slug. The engine calls back into emerge-core during this request; a
   transaction held open across it is a pool slot held for the whole round trip.

### Wire contract between emerge-frontend and emerge-core

All paths are under `/api/v1`, reached by the frontend as `/api/svc/core/<path>`. This section is
the single source both sides build against; change it here first.

**Built (read path):**

| Route | Request | 200 body |
|---|---|---|
| `GET learning/mindmaps` | library list filters (`kind`, `subject_id`, `grade_level_id`, `limit`, `offset`) | `{"mindmaps":[{id,title,kind,subject_id,grade_level_id,index_status,mindmap_state}],"count","page"}` |
| `GET learning/mindmaps/{item_id}/chapters` | no query | the mind-map service's `/chapters` body, unchanged: `{documents:[{document_id,title,subject,grade,structure,sections:[…]}],total_sections}` |
| `GET …/chapters/{section_id}` | **no query parameters** | the map payload, unchanged |
| `GET …/chapters/{section_id}/nodes/{node_id}` | no query | node detail, unchanged |
| `GET …/chapters/{section_id}/trace` | `from`, `to`, optional `max_hops` | trace path, unchanged |
| `GET …/chapters/{section_id}/drill` | optional `kind`, `n`, `seed`, `topic_id` | drill, always without answers |
| `POST …/chapters/{section_id}/drill/grade` | body `{kind,n,seed,topic_id?,answers}` — **no other field** | drill result, unchanged |

- `mindmap_state` is one of `available`, `held`, `parked`, `pending`, `failed`, `not_indexed`.
- `include_descendants` is **not accepted** anywhere: an unknown query parameter or body field is
  a 400.
- Errors are `{"error","message"}`, with a `code` only on the mind-map-specific refusals below.
  emerge-core's ordinary 400s and 404s (bad parameter, item not found, chapter not in this book)
  carry no `code`. Codes: `mindmap_disabled` (503),
  `mindmap_tenant_unmapped` (503), `mindmap_not_indexed` (409, with `index_status` and
  `mindmap_state`), `mindmap_upstream_refused` (the relayed 400/401/403/404/409/422),
  `mindmap_engine_unavailable` (503), `mindmap_service_unavailable` (502).

**To build (mastery):**

| Route | Key | Request | 200 body |
|---|---|---|---|
| `GET …/chapters/{section_id}/mastery` | `core.concept_mastery.read` | optional `student_id` | `{"section_id","content_item_id","student_id","tracked","states":{node_id:state}}` |
| `PUT …/chapters/{section_id}/mastery` | `core.concept_mastery.write` | `{"states":{node_id:"read"}}` | same shape as GET |

- `state` is `read`, `missed`, `shaky` or `known`, and only ever rises.
- `tracked` is false when the viewer has no student record in the current session; `states` is
  then empty and a PUT stores nothing and still answers 200.
- A PUT may set only `read`. Any other state is a 422.
- `POST …/drill/grade` keeps its response body. When the viewer is tracked and holds
  `core.concept_mastery.write`, the server also records the result: score 1 is `known`, 0.5 is
  `shaky`, 0 is `missed`. The frontend refetches mastery after grading and writes nothing itself.
- Without `student_id`, GET answers for the caller's own student record. With it, the row
  predicate decides: a guardian's ward, a teacher's pupil, or anyone under `read_all`.
- Both mastery routes also require `core.mindmaps.read` and the library read scope, like every map
  route. The mastery key is checked first, so a 403 names it.
- `student_id` in the body is null when the caller is untracked and named nobody. Naming a pupil
  the caller cannot reach is a 404. A reachable pupil with no enrolment in the current session is
  a 200 with `tracked:false` and empty `states`.
- `POST …/drill/grade` adds one response header, `X-Mastery-Recorded: true|false`, only when a
  write was attempted. If recording fails the grade is still returned with a 200.

**To build (curriculum link):**

`GET curriculum-nodes/{id}/mindmaps` — keys `core.mindmaps.read` and
`core.content_placements.read`, plus the library read scope.

```
{"curriculum_node_id","kind",
 "mindmaps":[{"content_item_id","title","placement_id","inherited",
              "page_start","page_end","mindmap_state","match_basis",
              "sections":[{"section_id","display","page_start","page_end","overlap_pages"}]}],
 "count"}
```

- Only confirmed placements on books the viewer can read.
- `inherited` is true when the placement belongs to an ancestor node (a topic with none of its own
  resolves through its chapter).
- `match_basis` is `page_overlap`, `whole_item` (the placement has no page range) or `none`.
- `sections` is empty unless `mindmap_state` is `available`. Sections come best match first. Each
  section's `page_start`, `page_end` and `overlap_pages` are `number | null`; null appears only
  under `whole_item`.
- At most 8 available books get a chapter lookup per request. Past that the route answers 409 with
  code `mindmap_link_unbounded`, on the precedent of `placements_unbounded`, instead of a 200 that
  silently omits sections.
- A topic is opened as its chapter's map focused on the placement's page range; every map node
  carries a `page`. No engine topic id is joined or stored.
- The `structure_digest` in this response is deferred; it needs a second engine call per book.

### Known consequences of D1

- **Superadmins and multi-school users get a 403** from the engine. emerge-core passes the
  engine's message through rather than rewording it as an outage.
- **The user's token must name the engine's audience.** Unverified for the deployed CAS.
- **An engine that cannot reach emerge-core's scopes route answers 503**, not an empty library.
  emerge-core passes that through as a 503 naming the engine.

---

## 5. Changes by repo

### 5.1 lms-retrieval-engine

1. Pass `_held_labels(None, tenant, admin)` in `_visible_section` and in `/syllabus/tree`.
   **Required** — without it D1 serves nothing gated.
2. Tests for `/syllabus/nodes/{id}/graph`: shape, cross-tenant 404, a gated book with and without
   the label, no dangling relation, truncation.
3. Fix the `_visible` docstring, which still says nothing passes `held_labels`.
4. Leave `RE_AUTO_EXTRACT` off. Extraction is the GPU pipeline's job (D2).

### 5.2 emerge-gpu-ingest and the engine's ingest scripts

1. **G2:** when a build produces no extraction report, or an incomplete one, say so at BUILD and
   again at PUBLISH: "this book will have no mind map". Publishing is still allowed.
2. Promote Ollama from advisory to required-unless-`--no-topics` in `--check`.
3. Later: seed the chapter proposal from emerge-core's curriculum chapter titles, so the reviewed
   split and the curriculum start aligned.

### 5.3 lms-mind-map

1. Accept `Authorization` on every route and forward it upstream unchanged. Never log it.
2. Test that a cached map is still refused to a caller the engine refuses.
3. Fix M1 to M4.
4. Compose service: no host port, `MM_RETRIEVAL_BASE_URL` set to the engine's service name,
   `MM_ADMIN_TOKEN` unset. **On the production box emerge-core and the engine share no Docker
   network** (reported by session `emerge-core-e0` from the box on 2026-10-02, not verified here):
   emerge-core is on `emerge-db_default`, the engine on `retrieval`, and only `papersetter` is on
   both. So the mind-map service joins both as external networks, as papersetter does:
   `MM_RETRIEVAL_BASE_URL=http://retrieval:8000`, and emerge-core gets
   `MINDMAP_ENGINE_BASE_URL=http://<service>:8200` with no network change of its own.
   "Isolated" then means reachable by emerge-core, papersetter and the engine — three services,
   not one — and anything later added to either network inherits that reach.
   The engine's callback to emerge-core's `/library/scopes` (`RE_SCOPES_BASE_URL`) also has to
   cross that gap, by a route that exists today or a network join.
5. Add CI: `pytest -q`.
6. Still no database, no token verifier, no access rule.

### 5.4 emerge-core

**Held-to-indexed reconciliation (G1), first:**

- Keep the document id the engine promises when it holds an upload, in a new nullable column.
  Not in `engine_document_id`: search joins on that column, and filling it early makes an
  unindexed book answer searches with nothing.
- A sweep step asks the engine whether that document now exists. When it does, the item becomes
  `indexed` and `engine_document_id` is set.
- A held book that is never built stays `held`. It is not retried and not failed.

**Mind maps:**

- Config: `MINDMAP_ENABLED` (default false), `MINDMAP_ENGINE_BASE_URL`, `MINDMAP_ENGINE_TIMEOUT`.
  Unconfigured -> 503 naming the variable.
- `internal/service/mindmap/` — the HTTP client. It needs the caller's raw bearer; confirm the auth
  middleware keeps it in the request context before designing around it.
- `internal/transport/http/mindmap.go` — the routes in section 4.
- `GET /learning/mindmaps` reports a state per book: `ready`, `held`, `not_indexed`,
  `no_structure`, `not_extracted`, `partial`. "Never extracted" and "extracted, found nothing"
  stay distinct.
- The drill route always asks for `with_answers=false`.
- `GET /curriculum-nodes/{id}/mindmaps` — for each readable, confirmed, indexed placement: the
  book and the engine chapters and topics its page range selects, with `match_basis` stated.

**Mastery — one new tenant table, `concept_mastery`:**

| Column | Notes |
|---|---|
| `student_id` | immutable; rows go when the student row goes |
| `academic_session_id` | immutable |
| `content_item_id` | the book |
| `engine_section_id`, `node_id` | strings, as the engine named them when the row was written |
| `state` | `read`, `missed`, `shaky`, `known`; only ever raised |
| `score`, `attempts`, `last_attempt_at` | from graded drills |

- Unique on `(student_id, academic_session_id, content_item_id, node_id)`. No `school_id`.
- Each row also stores the document's `structure_digest` and chunk count at write time (engine
  `GET /documents/{doc_id}/digest`). A stored section or node id goes stale silently when the book
  is re-ingested; a moved digest is what says so. A match at zero chunks means nothing.
- **A moved digest means "the stored structure differs from when this row was written", never
  "someone edited the book".** The engine pins the digest over identical stored state only; it has
  no parse-level determinism test, so a parser change could move digests with no human cause. A
  moved digest marks a row as unverified against the current structure. It is not grounds to
  discard a mastery estimate, and the UI must not say the book was edited.
- Graded states are written by the server from the grade response. The client may write only `read`.
- A viewer with no student record gets the map and an empty mastery set; nothing is stored.
- **D5 working default:** no delete route and no retention job in the first cut; rows are bounded
  by the session column and removed with the student. This is a default, not a policy.

**Authorisation — four new keys:**

```
core.mindmaps.read
core.concept_mastery.read
core.concept_mastery.read_all
core.concept_mastery.write
```

- `core.mindmaps` has no breadth key: its scope is inherited from the book, on the
  `praise_reactions` precedent.
- Files, following commit `10235ae`: `internal/authorization/entities.go`,
  `internal/authorization/catalog/catalog.go`, `internal/data/access/mastery.go`,
  `docs/CAS-KEYS-TO-REGISTER.md`, `docs/DESIGN-NOTES.md`, `docs/STATUS.md`.

Tests: real tenant database, an `httptest` stand-in for the mind-map service, each refusal proved
by mutation, and a call-site search for every new exported function.

### 5.5 CAS (operations only; demo first, then production)

Run by a global admin; every script dry before `--apply`.

1. `python scripts/cas-register-entities.py` — the four keys under service `core`.
2. `go run ./cmd/catalogdump`, then `cas-sync-entity-fields.py`.
3. Rules and bundles, added to `scripts/cas-core-roles.py`:

| Bundle | Gets |
|---|---|
| Student | `core.mindmaps.read`; `core.concept_mastery.read` and `.write` at `reach=self` |
| Guardian | `core.mindmaps.read`; `core.concept_mastery.read` at `reach=guardian_ward` |
| Subject teacher, Class teacher | `core.mindmaps.read`; `core.concept_mastery.read` at `reach=teacher_assignment` |
| Principal | `core.mindmaps.read`; `core.concept_mastery.read_all` |

4. **Prerequisite:** each bundle must also hold `core.library.read` (the engine's scopes callback
   is gated on it), `core.curriculum.read` and `core.content_placements.read`.
5. Confirm `emerge.learning.mindmap` has a CAS row and grant it to the school's tenant root group.
6. Confirm the user access token names the engine's audience.

### 5.6 emerge-frontend

1. `services/mindmap.ts` and `services/mastery.ts` call `core` at `learning/mindmaps/...`. Remove
   the `mindmap` row from `SERVICES`. Move the dev mocks to the new paths.
2. `mindmap-widget.tsx`: pick a book from `GET learning/mindmaps`, then a chapter. Show the
   per-book state instead of one generic empty message.
3. `curriculum-widget.tsx`: a "Mind map" action on chapter and topic nodes.
4. Deep link: `/p/{persona}/learning/mindmap?item=&section=&topic=`.
5. Gate on `core.mindmaps.read`; drill controls on `core.concept_mastery.write`.
6. Root-level chapters: being built by `emerge-core-e0`'s agent `w7-optional-units`, which owns
   `src/components/classroom/curriculum-tab.tsx`. Do not edit that file for mind-map work until it
   lands. Every create must name `kind`; a topic is never offered at the root, because emerge-core
   refuses a parentless topic.
7. Show the engine's multi-school 403 as what it is.

---

## 6. Order of work

| Phase | Work | Depends on |
|---|---|---|
| 0 | **Prove the chain on demo, no code:** a pupil token is accepted by the engine; the scopes callback answers; one book goes through the GPU pipeline with topics | — |
| 1 | emerge-core: held-to-indexed reconciliation (G1) | — |
| 2 | Engine: label fix and graph tests. Mind-map: bearer forwarding, M1-M4, CI. GPU app: G2 | — |
| 3 | emerge-core read path and `core.mindmaps.read` | 1, 2 |
| 4 | emerge-core mastery | 3 |
| 5 | Curriculum link: `GET /curriculum-nodes/{id}/mindmaps`. Needs the nesting rule landed by `emerge-core-e0` and real chapter placements with page ranges | 3 |
| 6 | Frontend rewire | 3, 4, 5 |
| 7 | CAS registration, bundles, feature grant on demo; smoke test; production | 3, 4 |
| 8 | Later: teacher class-mastery view; chapter proposals seeded from the curriculum | 4 |

Phases 1 and 2 are independent of each other. Phase 0 can fail, and if it does, it changes D1's
cost before any code is written.

**Smoke test for phase 7:** as a pupil of the demo school, open a book they can read, open a
chapter map, grade a drill, reload and see the mastery ring. A pupil of another offering gets 404
for the same item. A pupil of another school gets 404 for the same section. A superadmin gets the
engine's 403 with its own message.

---

## 7. Still open

- Real chapter placements with page ranges, for at least one book in the demo school.
- **D5** — mastery retention and erasure.
- **D6** — pupils and grade-wide books; not blocking.
- Whether the multi-school 403 is acceptable for superadmins, or the engine's known gap has to be
  closed first.
- The stale `defer` + placements 409 in emerge-core.
