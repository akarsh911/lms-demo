# Held to indexed: learning that a deferred book was built (2026-10-02)

This is gap G1 of `docs/MINDMAP-INTEGRATION-PLAN.md`, and it continues "Per-document ingest mode:
`now` and `defer`" in `docs/DESIGN-NOTES.md`. That section made `held` a fifth index status and made
it terminal, which was right for the day it was written: nothing could tell emerge-core that a held
upload had been built. It was also the whole problem. A book uploaded with `ingest_mode=defer` is
the only kind of book the GPU pipeline builds, the GPU pipeline is the only producer of a concept
graph, and `held` never became anything else. So the only books with concepts were exactly the
books with no `engine_document_id`, and nothing downstream could be linked to them.

The code is in `internal/service/indexing`: `reconcile.go` is new, and `client.go`, `indexer.go`,
`sweeper.go` and `dispatcher.go` each changed a little. The engine was read at
`lms-retrieval-engine` `main` @ 6c2e710 (`retrieval_engine/api.py`, `held_uploads.py`, `digest.py`).

## The promised id gets its own column

The engine answers a held upload with the `document_id` the document will have once it is
published. `content_items.held_engine_document_id` keeps it: nullable, 128 characters, one
`ADD COLUMN` in `20261001212745_add_content_item_held_engine_document_id`.

It does not go in `engine_document_id`, for the reason the earlier note gives and which is worth
restating because the temptation returns every time someone reads the two column names together.
Search builds its document filter from `engine_document_id IS NOT NULL AND indexed_sha256 IS NOT
NULL`, and the resolver reports `current` from the same pair. An id written there before the
document exists makes a book that answers every search with nothing while every surface says it is
indexed. A second column costs a migration; a wrong `current` costs a teacher's trust in search.

The migration is additive and needs no backfill: every existing row reads `NULL`, which is the
honest value for a row nobody recorded a promise for. A binary rolled back to before this change
never selects the column and behaves as it did. Dropping the column loses only the promises, and
the section on older rows below says how they come back.

The column is cleared by every write that takes a row out of `held`: `MarkPending`, `Abandon`,
`markFailed`, every branch of `record` other than `held`, and the promotion itself. A promised id
that outlived the held state would be a second, unguarded copy of `engine_document_id`.

## The fake had the wire shape wrong, and the real one loses the id

`POST /ingest/file?mode=defer` is synchronous. It answers
`{"job_id", "status": "held", "document_id", "collect_with", ...}` — the id is at the top level and
there is no `result` object. The fixture in `ingestmode_test.go` answers with the shape
`GET /ingest/{job_id}` uses, where the id sits under `result`, so the tests passed while the real
path could never have read the id: `held` is terminal, `await` returns the first answer without
polling, and `Job.DocumentID()` looked only under `result`. Nobody noticed because nothing used the
id.

`Job` now decodes the top-level `document_id` and `state`, and `DocumentID()` falls back to the
top-level value. The new tests in `reconcile_test.go` answer with the synchronous shape. The old
fixture is left as it is; it still pins that the polled shape is understood.

## A duplicate of a held upload is held, and a deferred duplicate finally names its document

Reading the top-level id changes what a `duplicate` answer means, and the three cases are different
enough to state separately.

A deferred item that is pushed again — a book that was archived and republished, say — collides with
its own held record or with the document that record became. The engine says `duplicate` with the
id and a `state`, synchronously. Before this change `DocumentID()` returned nothing for that answer,
`outcomeOf` called it "success but named no document id", the row went to `failed`, and the sweeper
then uploaded the whole textbook again on every backoff window for ever, to be told the same thing.
That is the opposite of "a held book is never retried as an upload", and it would also have undone
a promotion the first time anyone republished a promoted book. So:

- `duplicate` with state `indexed` adopts the id and is `indexed`, as a polled duplicate always was.
- `duplicate` with state `held` is `held`, and the id is kept as the promised id.

The second rule also applies to an item ingested with `mode=now` whose bytes another item already
has on hold. That case used to be recorded as `indexed` with the held id in `engine_document_id`,
which is precisely the state the first section forbids. It was reachable before this change and
nobody had hit it. Now both items wait and both are promoted by the same sweep.

`duplicate` with state `pending_confirmation` is deliberately **not** changed. It is still recorded
as `indexed` with the pending id, which is wrong for the same reason, but the honest alternative is
`parked`, and nothing reconciles a parked row yet. Moving it would trade a row that starts working
when a person confirms the chapter split for a row that never does. It wants the same treatment
`held` just got, and it is listed under open items rather than half-fixed here.

## The question, and why it is the digest

The sweep has to be able to tell "the engine is holding these bytes" from "the engine has published
this document". The engine keeps those in separate namespaces on purpose — a held upload is not in
its document store, and its own comment says a `/documents/*` route answering 200 for a held id
would be an existence oracle. So any per-document read answers the question. What each candidate
says for one promised id:

| route | still held | published | neither |
|---|---|---|---|
| `GET /documents/{id}/digest` | 404 | 200 | 404 |
| `GET /held/{id}` | 200 | 404 | 404 |
| `GET /syllabus/tree?document_id=` | 404 | 200 | 404 |

There is no `GET /documents/{id}`; the plan assumed one.

`GET /documents/{id}/digest` is the one used, through `Client.PublishedDocument`. It is 200 only
for a document in the store. Its body is small and fixed in size, and it carries the three things
worth checking before believing the answer: the `document_id`, the `tenant_id`, and
`counts.chunks`.

Rejected:

- **`GET /held/{id}` alone.** Its 404 means "published" and "discarded by an operator" alike, and
  promoting a discarded upload would write an id that names nothing. It is the right route for a
  different question — whether the wait is hopeless — which nothing asks yet.
- **`GET /held/{id}` followed by the digest.** Two requests to learn what one already says. A
  requeued rebuild is both held and published; the digest answers 200 for it, which is correct,
  because the old document is still serving.
- **`GET /syllabus/tree?document_id=`.** Same three answers, but the body is the whole section
  tree, and `Client.send` reads at most one mebibyte. A long book would be truncated into invalid
  JSON and read as a refusal for ever.
- **`GET /documents` or `GET /books`.** One request for every held item at once, but each walks the
  whole corpus and loads every document's blocks, every tick, to answer a question about a handful
  of ids. `/books` also omits anything that is not a book.

The digest is not free when it answers 200 — it hashes every chunk and vector of the document under
the engine's index lock — but it answers 404 before doing any of that, and a 200 is followed by a
promotion, so the expensive path runs about once per book.

### What a 200 must also say

`PublishedDocument` refuses an answer about a different id, and refuses a document filed under a
different tenant. The second is not paranoia: `X-Admin-Token` bypasses tenancy on the engine, so
with it `X-School-Id` is a label on the request and not a boundary. Both refusals are
`ErrEngineRejected`, logged, and change nothing.

A document published with a counted zero chunks is not promoted either. `outcomeOf` already refuses
to call an empty ingest `indexed` ("An index with no chunks is not an index" in DESIGN-NOTES), and a
GPU build that produced nothing deserves the same answer. That note chose `failed` over `held` for
an empty `mode=now` parse, because `held` would sit for ever "wearing an instruction that does not
apply to it". Here the instruction does apply. The remedy for an empty GPU build is a rebuild on
the GPU pipeline, after which the digest counts chunks and the item is promoted; `failed` would
re-drive an upload, the engine would answer `duplicate` with no counts, and the empty document
would be adopted as `indexed` through the one door the chunk guard cannot see. So it stays `held`
and says so in the log. The count is a pointer and only a counted zero refuses, as it does there.

A republish of such an item still reaches that door, because a `duplicate` answer carries no
counts. That hole predates this work and is the one the earlier note accepts.

### It needs the admin token

Neither the digest nor the held list resolves a caller's labels. Every item emerge-core indexes
carries a gate — at least the wildcard and the school label — so without
`RETRIEVAL_ENGINE_ADMIN_TOKEN` a published gated document is a 404, indistinguishable from one not
yet built. That fails closed: nothing is promoted, nothing is damaged, and nothing ever becomes
`indexed`. `cmd/api` warns at startup when the token is empty.

## The bytes that might differ

The brief for this work asked what happens if the published document was built from bytes other
than the item's current asset. It cannot be detected from emerge-core, and it does not need to be.

On this side the digest cannot move: `content_items.asset_id` and `assets.sha256` are both
immutable, so the asset an item has at promotion is byte for byte the asset it had when it was
held. On the engine's side the promised id is derived from the tenant and the checksum of the bytes
that were held, and `POST /held/{id}/complete` refuses a bundle whose own source checksum derives a
different id (`held_upload_mismatch`), while `POST /ingest/bundle` refuses to publish over a held
record at all (`held_collision`). A document under the promised id is therefore, by the engine's
own identity rule, a document built from the bytes we sent.

So promotion writes `indexed_sha256` from the asset row and makes no comparison of its own. The
alternative was to recompute the id from the slug and the digest and compare. That is a second
implementation of `stable_document_id` in a second repository; the day the engine changes its
recipe every held book in every school would stop being promoted, silently, and the two schemes
would agree in every test written against today's recipe. The engine's digest route also does not
return the source checksum, so there is nothing to compare against without that derivation.

## Promotion is one conditional statement

`Sweeper.promote` is the claim's shape: one `UPDATE` matching the id, `status = published`,
`index_status = held`, the promised id that was asked about, and the `updated_at` that was read. It
sets `indexed`, `engine_document_id`, `indexed_sha256`, `indexed_at`, zero attempts, and clears the
promised id. Two sweepers that read the same row both ask the engine and one of them matches no
row. Each of the four predicates has a test that moves only the thing it guards.

Every refusal is decided before that statement: the engine's answer, the id, the tenant, the chunk
count. Nothing is written and then taken back, because under `testsupport.TenantTx` a rollback
inside the code under test cannot be observed.

## What never happens to a held row

A held book that is never built stays `held`. The reconcile step reads it and, unless it promotes
it, writes nothing at all: `index_attempts` and `updated_at` do not move. It is never handed to the
dispatcher, so it is never uploaded again, and no branch marks it `failed`.

An engine outage — a transport error, or any 5xx including the digest's 501 — ends the reconcile
step for the tick with one warning. It is not put in `SweepReport.Err`, which is for faults of the
sweep itself, and the re-drive of `failed` rows carries on in the same tick. Stopping rather than
continuing is deliberate: the next row would ask the same dead engine.

Only published items that carry an asset are looked at, for the reasons the sweeper already gives.
An archived held item waits; when it is republished the push answers `duplicate` and the section
above settles it.

## The budget, without a new setting

A check is one `GET` and no upload, so it does not draw on the dispatcher's queue and does not
share the re-drive budget; a full queue stops re-drives and leaves reconciliation running. It has
the same two bounds, though: at most `RETRIEVAL_SWEEP_BATCH` checks a tick and
`RETRIEVAL_SWEEP_PER_TENANT` per school. No new variable seemed worth an operator's attention for a
request that costs the engine one dictionary lookup in the common case.

A school with more held books than its per-tick share is walked in id order from an in-memory
cursor that wraps. The alternative the claim uses — order by `updated_at` and stamp each row as it
is taken — would have meant a write per unbuilt book per tick, which is exactly what the previous
section rules out. A restart forgets the cursor and starts from the first row again, which costs
nothing.

Two per-item problems, an answer the engine refused and a document published empty, are logged at
warn once an hour per item and at debug in between. A row that is wrong on every five-minute tick
would otherwise write a hundred thousand lines a year.

## Rows that were held before the column existed

They have no promised id and the sweep cannot ask about a document it cannot name. The engine
offers one cheap way to find out: `GET /held` lists each held upload with its `document_id`,
`tenant_id` and `checksum`, and the checksum is the SHA-256 of the file, which is what
`assets.sha256` already holds. `recoverPromised` matches the two and writes the id the engine
reports. Nothing is derived here; the id is read off the engine's own record. The list is filtered
to the school's slug, because the admin token is shown every school's uploads and two schools can
hold the same publisher PDF.

It runs at most once an hour per school and makes no request at all when no row needs it.

What it cannot recover is a row whose book was already published before this shipped. The held
record is retired on publication and no engine route finds a document by checksum. The only lookup
left is pushing the bytes again and reading the `duplicate` answer, and an automatic re-upload of
every such textbook was not built. Republishing the item by hand does exactly that, once, and now
ends in `indexed`.

## The column is in the field catalogue

`core.library`'s field list is `entcontentitem.Columns`, so `held_engine_document_id` is a governed
field from the moment it exists and appears in a library item's JSON while the item is held. It is
not writable through the API: the request body has no such member. This follows `index_attempts`
and `engine_document_id`, which are exposed the same way.

## What the tests settle

All against a real tenant database through `testsupport.TenantTx`, with the engine faked by
`httptest` and reached through the real `Client`:

- a held item with a promised id is promoted once the engine publishes it, with all five columns
  written, the attempt count reset, no upload, and the question stamped with the CAS slug;
- an item the engine is still holding is unchanged after three ticks and never enters the re-drive;
- with nothing listening, and with a 503, nothing changes, the item is not `failed`, and the tick
  reports no fault; after the first outage answer no second item is asked about;
- two sweepers promoting from one read produce one winner;
- a row that was republished, archived, re-promised or merely edited after it was read is not
  promoted;
- a held item with no promised id is never asked about and never written;
- the promised id is recovered from the held list, only from this school's entry, and the list is
  read once across two ticks and not at all when nothing needs it;
- an empty document and a document under another tenant stay held;
- the per-school limit rotates and wraps;
- the synchronous `held` answer and a `duplicate` of a held upload both record the promised id;
  a deferred `duplicate` of a published document is adopted; six ways out of `held` all clear the
  promised id.

Each of those was watched failing. Fifteen mutants were applied one at a time and every one was
killed by the test written for it, with the message that test was written to give:

| mutant | killed by |
|---|---|
| promotion drops `index_status = held` | the republished row was promoted on the stale read |
| promotion drops `status = published` | the withdrawn row was promoted |
| promotion drops the promised id | the re-promised row was promoted |
| promotion drops `updated_at` | the edited row was promoted |
| promotion matches on the id alone | "two instances promoted the same row from the same read" |
| a 404 from the digest promotes anyway | the still-held item was promoted in round 1 |
| an outage marks the row failed and carries on | `index_status is "failed"`, and a second item was asked |
| an empty document is promoted | "an empty document was promoted" |
| the tenant of the digest is not checked | another school's document was adopted |
| the held branch of `record` does not store the id | the promised id was recorded as `""` |
| a `duplicate` of a held upload is `indexed` | settled as `indexed` promising `""` |
| `MarkPending` keeps the promised id | a `pending` item still carried it |
| the held list is not filtered by school | the other school's upload came back |
| rows with no promised id are scanned | the item with no id was checked |
| the top-level `document_id` is ignored | the promised id was `""`, and the published duplicate was `failed` |

The last line is also the evidence for the section on duplicates: with the top-level id unread, a
deferred re-push of a published book settles as `failed` with "the engine reported success but
named no document id". That is what `main` does today.

One thing the tests cannot show is two processes racing for real. `TenantTx` is a single
transaction, so the two promotions are sequential statements from one stale read, which is the
shape the existing claim test uses. It proves the predicate; Postgres row locking is what makes the
predicate sufficient when the statements overlap.

## Open items

- **Already-published legacy rows** stay `held` until someone republishes them. See above.
- **`duplicate` against a parked upload** is still recorded as `indexed` with a pending id.
- **`parked` has the same gap `held` had.** Nothing learns that a chapter split was confirmed.
- **A discarded held upload** leaves its item `held` for ever. `GET /held/{id}` could tell the
  sweep the wait is hopeless; what the item should become then is a product decision.
- **`checkDeferrable` is untouched.** The engine now carries chapter tags on a held upload, so the
  409 mirrored here is stale. Another session owns that.
- **`atlas.sum` will conflict** with `20261001205404_add_curriculum_node_shape_checks`, which is
  uncommitted in the main checkout. The files order correctly; the sum needs rehashing after both
  land ("Recovering a broken atlas.sum").
