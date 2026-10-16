# Library and Curriculum — build plan

Status: **superseded in part — see `STATUS.md`.** Phases 1, 2, 4 and 5 are built on our side; 3 and
3.5 are the retrieval engine's and 3.5 is unbuilt. The phase descriptions below still stand as the
design; only this status line was stale.
Sources: audits of `D:\emerge-core` and `D:\lms-retrieval-engine` (main, `f722fb8`), plus two design passes.

**Companion document: [`LIBRARY-ACCESS-DESIGN.md`](LIBRARY-ACCESS-DESIGN.md)** — the access-control
model in full, with `file:line` citations. Read it before implementing Phase 3: it carries the
verbatim engine boundary change (§3), the caller scope derivation and the Mr Sharma acceptance case
(§4), the enforcement seam (§5), and the complete failure enumeration (§7).

---

> ## REVISED AFTER VERIFICATION — 2026-09-08
>
> An adversarial pass (5 agents, Opus) verified this plan against the repos. Ten decisions
> changed. Full report: `D:\emerge-architecture6-09-08gentsdvise-schema.md` (1015 lines).
>
> **Phase one is 5 tables, not 8:** `assets`, `content_items`, `curricula`, `curriculum_nodes`,
> `content_placements`.
>
> | Change | Why |
> |---|---|
> | **Drop `content_nodes`** | Storing the engine's `section_id` caches a *hash of a display string*. A chapter rename re-mints it, Postgres keeps a valid-looking dead value, and the filter returns empty. Silent. |
> | **Defer `content_bindings`** | "Attach to subject/grade/section" is fully served by `audience` + its FK. Trigger to bring it back: *a class must use a book its grade's curriculum does not place.* |
> | **Phase 0.1 answer is C′ (page ranges), not C (section ids)** | The pending verification is answered in the engine source, and the answer is no. |
> | **`content_items.asset_id` becomes `Immutable()`; `supersedes_id` un-defers** | The versioning deferral breaks citations and empties placements in month one. |
> | **`content_placements` gains a `grain` enum**, NOT NULL, no default, CHECK-paired with the node FK | The NULL currently carries two contradictory meanings. |
> | **Staleness detector replaced** | `indexed_sha256 != assets.sha256` cannot fire once `asset_id` is immutable. Use *a placement resolving to zero chunks* — the only fail-closed monitor in either design. |
> | **`curricula` gains an immutability rule** | Any recorded usage freezes it; edits fork via `supersedes_id`. Not yet violated, but armed: rename a node in 2027 and you rewrite what 2026 taught. |
> | **One table named `content_items`** | `library_items` in the access design is the same row. Delete the duplicate. |
> | **`internal/authorization/catalog/catalog.go` joins task C1** | New at `edd8d66`. A missing `areaColumns` entry silently produces a catalogue entity with no fields. |
>
> ## BLOCKER 1 — a parent can retrieve a teacher's note about another child
>
> **This is not a bug. It is the design working exactly as written**, which is why it beats every
> other failure in this document. Nobody has to spoof a header, miss an ingest path, or forget a
> parameter.
>
> §4 of the access design emits, for `ReachSelf` and `ReachGuardianWard`, the pupil's *section* and
> *grade*. So a 9A pupil holds `section_9A`. So does that pupil's guardian. Both are live principals
> — `Viewer` carries `GuardianID` and `StudentIDs`, wired through `predicate.go:101-104`.
>
> A teacher publishes a note at `audience=section, section_id=9A`. The publish gate permits it.
> Then:
>
> - **engine**, after the boundary change: caller holds `section_9A`, document carries `section_9A` → admitted
> - **emerge-core layer 2**: `audience=section AND section_id IN SectionIDs`, and the pupil's set contains 9A → admitted
>
> **Both layers agree, because both correctly implement a model with no teacher/pupil axis.** The
> defence-in-depth that saves us from every other item in the 22-item list does nothing here.
>
> The design does name it — failure 19, open decision 1 — but frames it as *"not more than the model
> says, possibly more than the user means"*, as if the reader were browsing a file list. They are
> not. This is RAG. A parent types "how is fractions going in 9A" and gets back the trailing
> sentence of a worksheet: *"revisit with Aarav — spoke to his mother Thursday."* A class-wide
> teaching note is precisely the artefact that carries an individual child's name.
>
> It beats the cross-school leak because that is between two customers who have never met. This is
> between two parents in the same WhatsApp group — child data, in India, disclosed to the wrong
> parent, by our design, at the one school we have.
>
> **Consequence for the plan: the "for whom" axis is not an open decision. It is a precondition.**
> Either content carries an audience-role dimension (staff-only vs pupil-visible), or pupils and
> guardians must not receive section or grade labels at all in phase one.
>
> ## BLOCKER 2 — the 32-label cap. `_validated_scope_ids` (`scope.py:400-403`) applies the
> 32-entry bound to the *caller's* held set, not just the document's. Measured for a real Indian
> secondary school (6 grades x 3 sections, 11 subjects):
>
> | Role | Labels | |
> |---|---|---|
> | class teacher, one section | ~20 | safe |
> | subject teacher, no class | 26 | safe |
> | **HoD who is also a class teacher** | **37** | **422 on every library search** |
>
> Class-teachership drags in every offering of the section, so it is the multiplier. The
> combination is entirely ordinary. Failure is loud and closed — a `ValueError` inside
> `build_filter`, not a truncation or a leak — but total: library search does not work at all for
> that user. At 5 sections per grade even a non-class-teacher specialist hits 38; a K-12 3-form
> school reaches 50.
>
> The design asks for the cap to be raised to 256, but as one bullet in a change list. **It is a
> precondition, not a tuning note.**
>
> **The failure neither document anticipated:** `Filter.matches` fails **closed and quiet**
> (`ingest.py:152`). A stale filter raises nothing, matches zero chunks, and the user reads
> "this chapter has no content". A broken mapping, a partial stamp and an empty library are
> indistinguishable.

## The shape in one paragraph

Three structures and two join axes. `curriculum_nodes` is what must be taught, a tree under a
curriculum that belongs to a **subject** and a grade, session-free and reusable across years.
`assets` are the files. (`content_nodes` — a mirror of the book's own structure — was dropped after
verification: it caches a hash of a display string. See the revision block.) Between them, **placement** says "this book covers this curriculum node" (session-free,
shared by every class following that syllabus) and **usage** says "this class uses this book this
year" (session-scoped, per subject offering). The two axes never touch, and that separation is the
design.

---

## The decisions that shaped it

| Decision | Consequence |
|---|---|
| Curriculum is per **subject** | `curricula` hangs off `subjects` + `grade_levels`, not off offerings |
| Content is chapter-scoped **or** global | One mechanism: a NULL curriculum node means "whole syllabus" |
| Book topics ≠ curriculum topics | Two separate trees, never one table with a discriminator |
| Books must match curriculum topics | `content_placements` is the map, many-to-many, authored or inferred |

"Which curriculum does 9A Science follow" is **resolved, not stored**: `offering.subject_id` +
`section.grade_level_id` → the one active curriculum for that pair. A partial unique index on
`(subject_id, grade_level_id) WHERE status = 'active'` makes that a single-row lookup. No column on
`subject_offerings`, no plans table.

---

## Phase 0 — decisions before code

These are open. Building before they are settled means building twice.

### 0.1 The curriculum-topic retrieval path — **the one real trade-off**

The engine has exactly one topic-shaped field on a chunk, `concept_ids: list[str]`, untyped and
unnamespaced. `Filter.matches` does a flat set intersection on it (`scope.py:248`). Curriculum
UUIDs pushed into that list would be indistinguishable from the book's own extracted topic ids.

Three options:

| | Engine change | Depends on | Granularity |
|---|---|---|---|
| **A** new `curriculum_topic_ids` field + Filter facet | yes, plus a metadata-only update path | nothing | topic |
| **B** external map → engine `topic_id`s | none | Phase F concept extraction, **never run on real content** | topic |
| **C** external map → engine `section_id`s | none | confirmed chapter splits | chapter |

`ANCHOR-DESIGN.md` §6 names B as the intended integration — it refuses an `in_syllabus` flag on the
grounds that "the consumer keeps its own mapping, keyed on the stable `topic_id`". But
`Chunk.concept_ids` is *"empty on every byte of real content"*, so B depends on an LLM extraction
pass that has never run at real cost.

**Answer after verification: C-prime — page ranges, not section ids.** The recommendation here was
originally C (map to the engine's `section_id`). That was wrong: `Section.id` is a hash of the
chapter's display title, so a rename re-mints it and our stored value dies silently. Placements carry
page ranges instead, and `content_nodes` is dropped.

Option A also carries a hidden cost: there is no metadata-only update path. `RetrieveEngine.index()`
**unconditionally re-embeds every chunk** (`retriever.py:264`), so each mapping change re-embeds the
whole book until `update_metadata()` exists on both index interfaces.

### 0.2 The engine trust boundary

The engine has **no user identity at all** — no JWT, no session, no auth middleware. Only
`X-School-Id`, which its own source calls spoofable (`api.py:367-370`), and a shared admin secret.

`scope.py:130-138` is explicit: *"THIS IS A FILTER, NOT A BOUNDARY... nothing here verifies that
they hold any of them."* So populating `visible_scopes` from a request field moves the spoofing
surface down one level rather than closing it.

**Open: is the engine reachable except through emerge-core?** If yes, an unsigned header is the
entire boundary and no amount of filtering fixes it. This is a deployment question, and it gates
Phase 3.

### 0.3 Smaller open questions

- **Ancestor placements.** Asking for a topic: return chapter-level material too? Proposed answer is
  exact-match with explicit opt-in, so that an empty answer stays visible.
- **One active curriculum per (subject, grade)** may be too tight for a grade running two boards.
  Cheap fix is two subject codes; honest fix is a `curriculum_adoptions` table, additive.
- **`content_items.kind = note`** collides in vocabulary with the existing pastoral `student_notes`.
  No data collision. Rename to `handout` costs nothing (varchar-backed enum).

---

## Phase 1 — assets and the catalogue

Upload a file, record it, list it. No curriculum, no retrieval.

**Tables:** `assets`, `content_items`.

`assets` is the tenant's **first file registry**. `student_documents.asset_id`,
`persons.profile_photo_asset_id` and `schools.logo_asset_id` all point at a table that does not
exist. This is it. Do **not** add those FKs now — existing rows hold ids with no matching asset and
the migration would fail on apply. From phase one on, the service writes an asset row before any
`*_asset_id`, so the backfill only shrinks.

Load-bearing and worth getting right in this migration: `storage_key`, `sha256` (the engine keys its
index on it), `size_bytes`, `mime_type`, and the `pending | ready | deleted` lifecycle. `deleted`
keeps the row after the S3 object goes, so dangling references stay explicable.

**Exit:** a teacher uploads a PDF; it appears in a catalogue; nothing is searchable yet.

---

## Phase 2 — curriculum and placement

**Tables:** `curricula`, `curriculum_nodes`, `content_placements`. (`content_bindings` deferred.)

The two axes arrive together because neither is useful alone.

`content_placements` grain is `(curriculum, node?, item, content_node?, pages?)`. NULL node means
whole syllabus; NULL content node means whole item. One mechanism, four granularities.

`content_bindings` is **deferred to phase two** (trigger: a class must use a book its grade's
curriculum does not place). When it returns, its grain is `(session, offering, item)` and it answers
**"which class uses this book this year"** — a pedagogy fact, used for relevance narrowing and a "my books" view.

**It is NOT the scoping hop, and must never appear in `internal/data/access`.** An earlier draft of
this plan said it was. That was wrong, and it contradicted the access design, which puts audience on
the item. Two coherent documents merged into one contradiction, and an implementer holding both would
have built the predicate on bindings — because this plan said so and because `predicate.go:82-110`
already has that shape to copy. It is wrong in **both** directions at once:

- a 9A note with `audience=section(9A)` that nobody bound is **invisible to its own author's section**
- a school-wide textbook mis-bound to 9B's offering becomes **readable by 9B's teacher**

Visibility is decided by `audience` + its one FK on the item. Nothing else.

**The empty-means-empty rule.** A curriculum node with no confirmed placements answers with
*nothing*. No fallback to the subject, the book, or the school. Proposed rows do not count.
Syllabus-global rows do not count. This is deliberate: an empty answer says the map is missing,
where a fallback would quietly hand 9B pages from a book it does not use.

**Exit:** a teacher binds a book to 9A Science and maps its chapters to syllabus topics. Asking for
"material for Photosynthesis in 9A" returns the right rows from Postgres alone.

---

## Delivery paths — decided 2026-09-08, governs Phase 3

Full detail: `D:\emerge-architecture6-09-08\ADR-010-two-delivery-paths.md`.

**Two paths, different consumers, different transports. The retrieval engine is not on the human
path at all.**

| | Humans | AI engines |
|---|---|---|
| Route | emerge-core authorizes, returns a signed S3/CDN link | gRPC to the retrieval engine |
| Bytes served by | S3 / `cdn.emerge…` proxy | never — passages only |
| Identity | CAS JWT at emerge-core | the end user's token, carried on the RPC |
| Scope | `LibraryItemsFor` before the link is minted | tenant from the token, plus the user's section |

Consequences for what was written below:

- **`GET /documents/{id}/page/{page}` is not how a person reads a document.** That reduces the
  exposure the verification pass found, but does not close it — the route still exists and is still
  reachable. Network isolation of the engine becomes load-bearing, not hygiene, and
  `store.document_meta` must still emit `scope_ids` because AI engines hit the same document gates.
- **The engine now needs to read a token.** The earlier position — that it should not verify tokens
  because policy lives in emerge-core — holds for *policy* but not for *identity*. This is a change
  of position and must be put to the engine's owners as one.
- **Signed URLs are a new authorization surface**, and nothing yet covers link lifetime or
  revocation. A teacher removed from 9A cannot be un-issued a link already in a browser.
- **New work not previously scoped:** an S3 client in emerge-core (none exists, no SDK in `go.mod`),
  signed-URL minting from per-school credentials, a token field on the proto, and token verification
  in the engine.

**The question to settle before any proto change:** does the JWT carry the section, or does the
engine resolve the token against emerge-core? A section claim means CAS knows about sections, which
breaks the standing invariant that CAS stays domain-agnostic. Resolving against emerge-core keeps
assignments in one place at the cost of a round trip. This decides whether the token is sufficient
alone or is only an identity to resolve.

---

## Phase 3 — retrieval scoping *(their repo, needs their agreement)*

**Corrected.** An earlier draft of this plan said the 9A/9B mechanism already existed and needed only
wiring. That was wrong, and the error mattered.

The engine's boundary (`scope.py:232-238`) is a chain of ORs:

    all_tenants OR scope == "global" OR meta.tenant_id == caller.tenant_id
                OR scope in extra_scopes OR visible_scopes admits scope_ids

Because `tenant_id == caller.tenant_id` sits in that OR, **every document in a school is already
admitted to every caller in that school.** `scope_ids` can only ADD readers — the engine's own design
doc states it as a property: *"can only ADD, never subtract."* Intra-tenant restriction, which is the
entire requirement, is not expressible. Wiring their T0–T6 to the letter ships the requirement unmet
with every happy-path test green.

### VERIFIED INCOMPLETE — do not implement §3 as written

A verification pass applied the change to a copy of the engine and ran the suite. Three findings:

1. **It is a no-op at the document level.** `store.document_meta` (`store.py:52-61`) never emits
   `scope_ids`, so the tenant-equality disjunct still fires and the document is admitted. Thirteen
   call sites gate on it, including **`GET /documents/{id}/page/{page}`, which serves verbatim page
   text.** A 9B teacher with the document id reads all of 9A's note. The claim below that such a
   caller "gets nothing emerge-core owns" is **false** until this is fixed.
   *Fix, same commit:* add `"scope_ids": doc.scope_ids` to `store.document_meta`, and give `_visible`
   (`api.py:437-440`) a scopes parameter.
2. **The inertness argument is vacuous.** Every document on the box is `scope="global"` /
   `tenant_id="_global"`, so the disjunct being changed never fires for anything that exists.
   "Inert on today's corpus" is the same statement as "the corpus cannot tell this apart from
   deleting the disjunct".
3. **23 of 65 tests fail**, and the three that matter are deliberate contracts, not incidental
   coverage. `test_the_hard_clause_can_only_ever_add` (`tests/test_scope_differential.py:1090`)
   names our exact edit in its own docstring as the thing it exists to catch:

   > *"rewriting the fourth clause into a conjunction, or folding it into the tenant equality,
   > reads like a tidy-up and turns a 200-with-content into a 200-with-nothing."*

   The engine's authors anticipated this change and wrote a test to stop it. Alongside
   `test_stamping_a_document_with_scope_ids_changes_nothing_for_a_caller_who_names_none` (:1024),
   which asserts the very inertness property our §3 removes. Five mutation-harness cases also fail
   because they string-match the current `scope.py` text.

   **This is not a suite to update. It is a design disagreement to have with the engine's owners,
   and they have already written down their side of it.**

### The change: one disjunct becomes conditional

    - or meta.get("tenant_id") == self.tenant_id
    + or (meta.get("tenant_id") == self.tenant_id and not meta.get("scope_ids"))

Plus its SQL twin in `_filter_to_sql` (`vector_store.py:271-276`), in the same commit, with
`COALESCE(scope_ids, '{}') = '{}'` so NULL reads as empty.

**New meaning:** a document carrying labels is visible only to a holder of one of them. A document
carrying none keeps today's tenant-wide reading. `scope_ids` stops being "extra audiences on top of
the school" and becomes "the audience, full stop".

**Provably inert today — re-verified 2026-09-09 and still true.** Measured across both data roots:
4 distinct documents, 297 distinct chunks, distinct `(tenant_id, scope)` = `[('_global','global')]`
only, and **zero** non-empty `scope_ids` and **zero** non-empty `restricted_to` anywhere.

The corollary matters more than the claim: **every per-school path in the engine is exercised only by
fixtures.** The single real corpus is global, so a bug in the tenant branch would not show up on it.
That is a reason to ingest one real document under a real school id early, not late.

Every live document has `scope_ids == []`, so the third disjunct reduces to exactly the old expression,
and `visible_scopes` is empty for every caller so the fourth never fires.
Every (document, caller) pair that exists evaluates identically. The only pairs that change are
`(labelled document, tenant-equal caller, no matching label)` — ADMIT → REFUSE, the narrowing
direction — and none exist yet.

### Labels are flat, not paths

The engine's `.` containment widens **downward**: holding `g9` admits `g9.sec_9A`. The requirement is
the reverse — a narrow holder (9A's teacher) must read **wide** documents (grade 9, school-wide).
Paths solve the wrong direction and leave every `.` as a latent over-grant. So labels are single
segments embedding a UUID:

    unrestricted_<school>   school_<school>   grade_<id>
    section_<id>            offering_<id>     person_<id>

A document carries exactly two: the wildcard and its audience label.

### This is why notes are covered

Restriction rides on `scope_ids`, stamped on the `Document` and mirrored to every `Chunk`. It does
**not** ride on the engine's `section_id` (a book chapter). So a scanned note or a video — which have
no chapter structure at all — still carry their labels on every chunk.

That corrects the section-based fallback proposed in Phase 0.1: it would have missed exactly the
content the requirement names, a teacher's 9A note. Section ids remain useful for *curriculum
placement* precision, never for access.

**Corrected 2026-09-09 — two things in the paragraph this replaces were wrong.**

*The field is `restricted_to`, not `scope_ids`, and the two must not be merged.* `scope_ids` is
**additive** — the audience, who may *additionally* see a document. `restricted_to` is **subtractive**
— the gate, who *alone* may. Both exist in the engine and are deliberately separate. Collapsing them
recreates precisely the bug the gate was built to fix: a term that reads as a restriction but can only
widen. Our own earlier polarity-inversion proposal was that bug, and their gate replaced it.

*The stamping is built, and it is one funnel rather than five paths.* The reasoning above — that a
missed path yields unlabelled chunks and therefore silent tenant-wide widening — is right, and it is
exactly **why** it was not done per-path. `RetrievalEngine._stamp_gate` (`retriever.py:249`, called at
`:324`) enforces the invariant inside `index()`, and every route into the store passes through it: four
API ingest paths, the confirm gate, snapshot loading, the sample corpus and all three scripts.

The requirement that the test name the OCR and A/V paths specifically is therefore met differently, and
better: the test asserts the **funnel property**, so it cannot be satisfied by a path that bypasses the
funnel. A per-path test enumerates the paths that existed when it was written; a funnel test constrains
the ones added afterwards.

### The trusted channel

emerge-core computes the label set per request and sends it. The engine gains an **asserter
credential** — its own header, `hmac.compare_digest`, empty means nobody. A request carrying it may
supply `visible_scopes`. A request without it that supplies `visible_scopes` is **403, never
ignored**: silently dropping it is an under-grant the caller never learns about. An asserter is not an
admin — no `_visible` bypass, no `all_tenants`.

The engine is not given its own CAS verification for this phase. A policy set says
`reach=teacher_assignment`, and teacher assignments live in emerge-core, so the engine would have to
call emerge-core anyway. A second CAS client buys no decision.

### What stops a direct call

With the boundary change: a caller presenting only a spoofed `X-School-Id` gets global content and
*unlabelled* tenant documents, and **nothing emerge-core owns**. Every emerge-core document is
labelled; label admission needs `visible_scopes`; supplying that needs the asserter credential; the
credential lives only in emerge-core.

Under today's additive boundary the same spoofed header yields every document in the school. That is
why this change is load-bearing and not a refinement.

Residual, stated plainly: a direct caller with a spoofed header still reads that school's *unlabelled*
documents — orchestrator content, scripts, publisher material. That is today's exposure, unchanged.

### Two layers, not one

After the engine answers, emerge-core re-checks the returned document ids against
`LibraryItemsFor(v, d)` and **drops** passages whose document does not survive, counting drops into
the trace. A drop means the engine was wider than the DB — stale stamp, missed route, backend
disagreement — and the user gets the safe page while the count makes it visible.

A post-filter alone was rejected and is worth recording why: it is **wrong even when remembered**.
Top-k is computed over passages the caller cannot see, so the page is eaten by 9B's notes, relevance
thresholds shift with them, and forbidden text crosses the wire on every query.

---

## Phase 3.5 — engine integration: CAS, S3, Postgres *(their repo)*

The engine is integrated with **none** of the platform. This is three separate gaps, and together
they are larger than everything above.

### The tenancy models are incompatible

This is the deepest issue in the project and it is not a small one.

| | emerge-core | retrieval engine |
|---|---|---|
| Isolation | **physical** — one Postgres per school | **logical** — one store, filtered at query time |
| Credentials | per-school, encrypted in the control plane | one process-wide `RE_DATA_DIR` |
| Identity | CAS JWT, verified against JWKS | unsigned `X-School-Id` header |
| Storage | per-school S3 bucket | local disk |

emerge-core's guarantee is that School A's rows are in a database School B has no credentials for.
The engine's guarantee is that a filter matched. Those are different promises, and content crossing
between them inherits the weaker one.

### 3.5a — CAS

**Corrected 2026-09-09 — the paragraph this replaces said "nothing exists", and that has not been true
since the engine's `fix/audit-findings` work landed.** `retrieval_engine/jwt_verify.py` verifies RS256
against `/.well-known/jwks.json` with algorithm, issuer and audience pinned and JWKS cached behind a
bounded refetch, and `_caller` takes `tenant_id` from the verified claim under `RE_JWT_REQUIRED` — a
deliberate two-stage rollout.

**The remainder is the resolver, not the verifier.** There is no `identity.py`, and no route passes
`held_labels` into `_visible`. Verified: the file is absent. That gap, not JWT handling, is what
Phase 3 waits on.

Only then can `visible_scopes` be a boundary rather than a filter. **Phase 3 depends on this** — the
scope wiring is meaningless while the caller is unauthenticated.

### 3.5b — S3

emerge-core holds `S3Credentials` per school (endpoint, region, bucket, key, secret, path-style) in
`internal/domain/tenancy/tenant.go:75`, encrypted at rest, decrypted per request. The engine writes
to local disk: `RE_DATA_DIR/uploads`, `figures`, `frames`.

So a book uploaded through emerge-core lands in the school's bucket, and the engine cannot read it.

**Corrected 2026-09-09: per-school destinations already exist on the engine side.**
`retrieval_engine/blobstore.py` carries a per-tenant profile map (local/gcs/s3) resolved **by the
tenant that owns the document, never by the caller**, against a validated registry of named profiles,
with an unmapped tenant an error rather than a fallback to somebody else's bucket, and credentials
structurally excluded — profile *name* only, credential-shaped keys refused by name and substring.
So this is a **decision, not a build**.

The decision stands as recommended: **emerge-core streams bytes to the engine at ingest.** Our reason
was that one credential holder beats two. The engine's reason is better and is the one to record: its
blob store resolves by the owning tenant of the document *specifically to keep a spoofable header out
of the write path*, and pulling from a per-school bucket would force it to choose the bucket from
request context — reintroducing exactly that. The "copied twice" cost is the right trade **while
`X-School-Id` is unsigned**, and is worth revisiting if signed tenancy is ever fully deployed.

### 3.5c — Postgres

Today: JSON files under `RE_DATA_DIR/snapshots/{doc_id}.json`, loaded wholesale into memory at boot.
Vectors are ephemeral — every chunk is re-embedded on every restart. `PgVectorIndex` exists but is
**vector-search-only** (it stores embeddings and filter columns, not the canonical model), is one
global `re_chunks` table for the whole deployment, and **has never executed against a live Postgres**.

Three things follow. Restart cost grows with the corpus. There is no per-school database, so
enabling pgvector puts every school's chunks in one table — logical isolation again, in a place
emerge-core deliberately does not use it. And the untested path fails *silently*: `build_vector_index`
falls back to in-memory on any connect error with only a warning, so a deployment can believe it is
enforcing in-DB filtering while it is not.

**Sequencing:** 3.5a gates Phase 3. 3.5b gates Phase 1 being useful end to end. 3.5c is the largest
and least urgent — the JSON store works, it just does not scale or isolate.

---

## Phase 4 — curriculum-topic retrieval

**emerge-core's half is BUILT — 2026-09-08.** `GET /api/v1/curriculum-nodes/{id}/content`
(`resolveCurriculumNodeContent`) resolves a syllabus point into
`(content_item_id, content_node_id, page_start, page_end)` tuples, double-gated by
`ContentPlacementsFor` and `LibraryItemsFor`, with `?include_proposed` and `?include_ancestors`.
The engine half waits on E15 and is a sign-off item there.

**The response distinguishes four situations that would otherwise all read as "no content".** This is
the point of the endpoint, not a nicety — an empty answer has four causes that need four different
people to act:

    unmapped     nothing is placed here            a human maps something
    unindexed    placed, never indexed             an ingestion runs
    restricted   placed and indexed, not for you   authorization
    (owner draft) readable by you, deliberately outside the corpus   publish it

The fourth arrived from the status gate landing the same day: `LibraryItemsFor` admits an owner's own
draft, `LabelsFor` refuses to stamp it. Deliberately asymmetric, and the endpoint has to say so or a
teacher reports it as a bug and someone "fixes" it by stamping drafts.

**Index state is four conditions, not three.** `indexed_sha256 IS NULL` is never-indexed; equal to the
asset's digest is current; unequal is STALE; and **a matching digest with a NULL `engine_document_id`
is also never-indexed**, because it is not searchable. Binding on ingestion when it lands: it must
write BOTH fields or every item reports never-indexed regardless of its digest.

**Curriculum-grain placements count as ancestors** under the opt-in flag — they are the root of the
tree, and excluding them would make the flag miss the commonest real mapping, "this textbook covers
this syllabus". Phase 0.3's concern about an empty topic looking populated is preserved differently:
every tuple carries `exact` and the node it was actually placed on, and `counts.exact` is the number
placed on the node asked for.

**No pagination, deliberately.** A partial filter is a WRONG filter — the engine would silently search
a subset, which is the failure this endpoint exists to prevent. Hard cap of 500 placements per node,
then 409 `placements_unbounded` and nothing resolves. Every other list endpoint pages; this one
refuses.

---

## Phase 4 — the original analysis

Whichever of A/B/C survives Phase 0. emerge-core resolves a curriculum query into
`(content_item_id, content_node_id, page range)` tuples and passes them as a filter. **It never
stores chunk ids.**

Contract with the engine — every chunk carries: tenant, `content_item_id`, `content_node_id`,
`page`, asset `sha256`. It never stores curriculum ids; the placement map changes independently of
the text.

A stale index is detectable in Postgres: `indexed_sha256 != assets.sha256`.

---

## Phase 5 — question papers *(added 2026-09-08)*

Previous-year question papers are ordinary library content: global, visible, catalogued like a
textbook, and additionally handed to the exam setter as grounding context.

**Most of this phase was already built by Phase 2 and nobody noticed.** "Past papers scoped per
subject per session, carried forward each year" is exactly what `content_placements` does. A paper is
a `content_item`; placing it against a curriculum associates it with that curriculum's subject, grade
and `academic_session_id`; and `copied_from_placement_id` carries it into next session with everything
else. No new association table, no paper-specific copy-forward, no session column on the paper itself.

### What is genuinely new

| | |
|---|---|
| `content_items.kind` gains `paper` | done — one line, and it emitted no SQL (see below) |
| `question_papers` sidecar, 1:1 with the item | done — exam_type, board, exam_year, total_marks, duration_minutes, paper_set, attempt |
| routes for the sidecar | done — inline on the four existing library handlers, no new routes |
| `migrate apply` | done — applied to DPS-NGP |
| ingest with `source_type=pyq` | engine side, unbuilt |

### Why a sidecar and not columns

`content_items` is shared by every kind and already carries a CHECK constraint at the limit of
readability. Paper columns there would be null for every book and note, and any future paper-specific
constraint would have to be a disjunction over `kind` — the same shape as the existing one, worse.

### `exam_year` is a calendar year, not a session

A 2019 paper predates every `academic_sessions` row we hold, so `exam_year` cannot be a session FK.
The session association lives on the placement, which is the thing that is actually session-scoped.
Those are two different questions — *when was this paper set* and *which year's syllabus are we using
it for* — and conflating them would break the second the school uses a 2019 paper in 2027.

### What the engine needs, and what it cannot do

Four fields matter on ingest: `source_type=pyq`, `subject` and `grade` (the only filterable paper
attributes), `checksum` (the document id is `sha1(tenant + NUL + checksum)`, so it is what makes
re-ingest idempotent rather than duplicating), and `title` (it roots every section path and feeds
`stable_section_id`). Everything else stays in our sidecar — `Document` has 18 fields and no metadata
dict, and encoding `exam_year` into `title` would create a parsing dependency nothing can filter on.

**There is no year facet and the engine's owners decline to add one**, because it would put our
vocabulary inside their predicate. "2019 papers for class 10 maths" resolves on OUR side into a
`document_ids` filter — the same boundary Phase 4 draws.

**Per-question retrieval is not available**, measured rather than assumed: chunking targets ~320
tokens, so seven questions came out as one chunk with `role=unknown`; and the role classifier encodes
printed textbook vocabulary, so eight of ten realistic paper lines score 0.00 against a threshold of
1.5. The one decisive rule, `BlockType.QUESTION`, has zero producers anywhere. Questions as
addressable objects live in `lms-paper-orchestrator` as `Item` rows, which is their proper owner; the
engine supplies grounding context, cited to page and paragraph.

### Deliberately not built

Answer keys (their own item plus a relationship — a separate decision), marks distribution and section
structure (the orchestrator owns `Blueprint`/`PaperSlot`; two sources of truth would be worse than
one), and any staff-only or embargo dimension — see open decision 1, which papers made concrete
without making urgent, because a released past paper is meant to be read.

---

## Deferred, with the trigger that brings each back

| | Comes back when |
|---|---|
| `curriculum_adoptions` | two syllabi live for one subject+grade |
| per-binding placement override | one section must deviate from the shared map |
| `content_items.supersedes_id` | editions need lineage |
| `content_versions` | a binding must survive an edition with page remapping |
| `session_curriculum_items` | pacing and taught/untaught tracking |
| collections, inline note body | phase two of the product |
| `learning_outcomes`, `exercises` | assessment |
| `skills`, `topic_prerequisites` | adaptive learning |

Dropped and folded in: `boards` → a column; `chapters` + `topics` → one tree; `books` → `kind`;
`book_chapters` → page ranges on `content_placements`; `content_subjects`/`content_grades` → columns; `content_topics` →
`content_placements`; `content_assets` → `assets`; `content_chunks` → the engine.

---

## Cost and reversibility

**Expensive once school databases hold rows:** `assets`; the `content_placements` identity and its
NULL semantics; `curriculum_nodes` as one tree, **and its mutability**; the one-active-curriculum
partial index (relaxing later is cheap, tightening is not).

**Cheap:** every enum (varchar-backed,
extend without migration); catalogue columns; everything in `metadata_json`; all deferred additions
(`ADD COLUMN NULL` or `CREATE TABLE`).

**Irreversible:** only deleting the S3 object. `assets.status = deleted` keeps the row.

---

## Cross-cutting

- **Authorization entity keys** — `core.curriculum.*`, `core.content.*`,
  following the existing `core.<resource>.<verb>` convention with the usual verb set. A HoD authoring
  a syllabus should not need to be a school administrator. Binding content into an offering the
  caller does not teach widens what a class sees — the same shape as `teacher_assignments.write`.
  **Access model still pending the last design pass.**
- **Migrations** — one tenant migration, through `go run ./cmd/migrate make <name> -plane tenant`.
  No hand edits. Phase one touches **no existing table**.
- **No comments in code.** Reasoning goes in `docs/DESIGN-NOTES.md`.

---

## Fail-open checklist

Twenty-one ways this returns MORE than it should. Every one is "if X is forgotten". Treat as a
review gate, not prose.

### Kills the requirement outright

1. **The boundary change not made.** Their T0–T6 wired to the letter, every teacher sees every
   document in the school, every happy-path test green. *The single most likely way this ships
   broken.* Test: `(tenant-equal caller, doc scope_ids=[section_X], held={})` must refuse — in
   memory **and** in emitted SQL.
2. **Changed in `scope.py` but not `_filter_to_sql`, or the reverse.** One backend admits by tenant
   equality, the other does not. Both in one commit; pin the emitted SQL string and its parameter
   list together.

   **CONFIRMED PRESENT ALREADY, 2026-09-08.** The two backends already disagree, though not where we
   expected: `Filter.matches` has five boundary terms (`scope.py:233-238`), `_filter_to_sql` emits
   four (`vector_store.py:258-276`), and `extra_scopes` is neither compiled to SQL nor in the
   raise-list (`:313-321`) — it is dropped in silence, violating that repo's own rule that a facet
   which cannot be honoured must be an error. pgvector is the NARROWER backend there, so it
   under-returns rather than leaking, and it is latent today because `build_filter` has no
   `extra_scopes` parameter. It is a live demonstration that this failure mode is real rather than
   theoretical. Their `test_pgvector_scope_ids.py:418` shows the house defence: differentially compare
   the emitted SQL against `Filter.matches` over the whole scope domain.
3. **Silent pgvector fallback** picks which of those two a deployment runs, with a printed line as
   the only evidence — and that path has never run against a real Postgres.

   **CORRECTED 2026-09-08 — the mitigation first written here was insufficient.** It said to assert
   `/health/providers?strict=true`. That probe does not catch the case we care about: `degraded` is
   guarded by `bool(expected)` (`api.py:609-613`), so an UNRECOGNISED `RE_VECTOR_INDEX` value yields
   `expected: null`, which makes `degraded` false, which makes strict return **200** — while
   `build_vector_index` has already fallen through to `InMemoryVectorIndex`. A genuine connect failure
   is caught correctly (503, `live: InMemoryVectorIndex`, `expected: PgVectorIndex`); it is the typo or
   unknown-value case that sails through.

   **Assert the positive identity, not the absence of degradation:** require
   `providers.vector_index.live == "PgVectorIndex"` directly, and the same shape for any other
   provider we depend on. Refusing to serve `/library/search` unless that holds is still right; the
   predicate just has to be stronger than `degraded == false`.

   Related, and the same shape: `RE_DEV_OPEN_ADMIN` is counted in `degraded_providers` but
   `RE_BLOB_SIGNED_URLS` is not — documentation says leave it off, and nothing notices when you do
   not. Also `RE_DEV_OPEN_ADMIN=true` makes `GET /documents` return 200 with no headers at all, so
   "nothing is reachable anonymously" holds only while that flag is off, and it is a laptop
   convenience someone can leave on.

### Unlabelled means tenant-wide

4. **A document ingested with `scope_ids=[]`.** Closed by `audience NOT NULL` with **no default**, a
   total `labelFor` that errors rather than returning `""`, a client that refuses empty stamps before
   HTTP, and a test asserting two labels per document.
5. **One ingest path not stamping** — and the OCR and A/V paths are the note-shaped ones. Chunks
   unlabelled and tenant-wide while the document row says otherwise. Split-brain, widening direction.

### Conflation and vocabulary

6. **One field for curriculum placement and visibility.** "Global" written for editorial reasons read
   as "everyone may read". Two columns, two vocabularies. And **no value may map to engine
   `scope: "global"`** — that means every tenant *on the box*. Hard-code `school`.
7. **The wildcard label emitted from a non-unrestricted arm** — school-wide bypass. Exactly one arm
   emits it; test every other arm's output for the prefix.
11. **A label containing `.`** — prefix containment makes a held `section` admit every section in
    every tenant. Test that no emitted label contains the separator; never emit a bare kind.
12. **Label collision across tenants** — the engine's scope disjunct does **not** AND with tenant.
    UUID-bearing labels make it impossible from us; any second minter reopens it.

### Our own machinery

8. **`scopeFor(X, X)`** — CORRECTED 2026-09-08 during implementation. The original claim here was
   that wide equals narrow makes everyone *unrestricted*. It is the opposite: `viewer.go:20` reads
   `if wide != narrow`, so the probe never runs and `unrestricted` stays **false**. That is
   fail-CLOSED, not fail-open — but it is still a bug, because a legitimately unrestricted caller
   (a school admin) is treated as restricted. It was hit for real: `createLibraryItem` used
   `scopeFor(LibraryCreate, LibraryCreate)` and the publish gate then refused `audience=school` to
   everyone. Fixed by probing `LibraryWriteAll` as the wide entity.
9. **New entities not appended to `AllEntities`** — quiet under-grant that reads as CAS
   misconfiguration. `count_test.go` catches it; do not skip it.
10. **Unknown reach, or an untranslatable pin, landing on a fallback arm** instead of the deny arm.
    Default arm returns the zero value; `translatable == false` returns the zero value, not "no pins".
16. **The publish gate omitted** — any holder of `core.library.create` publishes school-wide.

### The channel

13. **Given the admin token instead of an asserter credential** — `/documents` and `/syllabus/tree`
    list every tenant, and `all_tenants` becomes requestable. The client type must have no field for
    an admin token.
14. **`visible_scopes` accepted from a client body and forwarded** — caller-controlled widening.
    Refuse unknown top-level keys.
15. **Engine accepts body `visible_scopes` without the credential, or ignores it silently.** The
    first moves the spoofing surface down a level; the second is a silent under-grant. **403 is the
    only correct answer.**
17. **One engine route not threaded.** Every authenticated read must pass `visible_scopes` to
    `build_filter`; on our side every call goes through one client and one scope resolver.

### Staleness

18. **Narrowing written DB-first with the engine step failing** — a permanent over-grant the record
    denies. Rule: **narrowing = engine first, then DB; widening = DB first, then engine.**
19. **Pupils and guardians receiving section labels** read teacher-facing 9A material. Not more than
    the model says — possibly more than you mean. See open decision 1.
20. **Two sessions marked current** — labels from both.
21. **The 2×TTL stale policy serve** during a CAS outage keeps a revoked `core.library.read` alive
    for up to 120s.

---

## Open decisions — yours, not the design's

1. **A "for whom" dimension** (teacher-facing vs pupil-facing) on items. Without it, a pupil in 9A
   can read teacher-facing 9A material. Failure 19 is the cost of omitting it.

   **STILL OPEN, and now concrete — 2026-09-08.** Question papers arrived as a content kind and made
   this specific rather than theoretical. The decision taken was to build PREVIOUS-YEAR papers only:
   global, visible library content like a textbook, which is what they are for. No for-whom dimension
   was added, because a released past paper is revision material and adding one would have solved
   nothing it needed.

   What that leaves, stated so nobody rediscovers it under pressure. A LIVE unreleased paper is a
   different object with the same shape, and today:

   - stamped `audience=section`, it does NOT reach that section's pupils — but only because pupils and
     guardians deliberately hold no section or grade labels, a decision made for an unrelated reason
     (Blocker 1, a parent retrieving a teacher's note about another child). We are covered here by
     luck, not by a control.
   - stamped `audience=offering`, it DOES reach every pupil enrolled in that offering, because pupils
     hold offering labels at reach `self`. A maths paper for 9A-Maths would be readable by the pupils
     sitting it.
   - **Neither implementation would flag it.** Our audience vocabulary says which class a thing is
     for, not who may see it; and the retrieval engine's `Filter` has no staff-versus-pupil notion at
     any layer — its facets are tenant, scope, subject, grades, source_types, document, sections,
     pages, roles, extraction_sources, concept_ids.

   The engine's `source_types` facet lets a caller exclude `pyq`, which is a correct cheap default for
   a pupil-facing consumer but is a caller-side convention, not a boundary: it narrows an honest caller
   and stops nobody.

   **And no embargo is expressible anywhere.** Confirmed rather than assumed: the engine has no date
   field on `Document` or `Chunk` and no temporal `Filter` facet. So "staff-only until the exam, then
   released" cannot be represented by either system — a release would be a manual change to the item.

   The rejected shape, recorded because it is the obvious one and it is wrong: making assessment KINDS
   staff-only regardless of audience. `SourceType.PYQ` means *previous-year* question paper, so that
   rule blocks the main legitimate use of the exact content type it protects, and the workaround is
   people mis-labelling papers as documents. Sensitivity belongs on the item rather than the audience —
   it is the "always" that does not hold.
2. **Does a class teacher see subject-specific items in their own section?** Currently yes. One clause
   to remove.
3. **Pins exclude school-wide items.** A library grant pinned to 9A hides the textbooks from that
   teacher, because a school-wide item cannot answer a `section` pin. Follows existing row-value
   semantics; will surprise policy authors.
4. **The engine tenant-id spelling** must be agreed with the orchestrator and tutor owners *before the
   first ingest*. A mismatch is two engine tenants for one school and **cannot be fixed by
   re-stamping.**
5. **Keep or drop the 2×TTL stale policy serve** (`policies.go:99-104`). The engine's own CAS client
   refuses stale sets on principle; ours serves them.
6. **Shared secret versus HMAC** for the asserter channel. Label contract is identical either way.

---

## Revocation works, and here is why

Document-side labels are baked into the index. **Caller-side labels are never persisted anywhere** —
they are recomputed per request from `teacher_assignments`, `sections.class_teacher_id`, enrollments
and the current session.

That asymmetry is the whole answer. When a teacher stops teaching 9A, the next request's viewer omits
9A, the label set omits `section_9A`, and the engine refuses every 9A chunk. No index write, no cache
flush, **lag zero from the DB write**.

The risk to guard: someone later caches the resolved viewer or the label list "because it costs four
queries". That silently converts revocation lag into that cache's TTL. A test revokes an assignment
and asserts the next call drops the label.
