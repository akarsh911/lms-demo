# What remains — decisions first, then the work

Written 2026-09-14, after the wind-up pass. Companion to `STATUS.md` (what is built) and
`CAS-KEYS-TO-REGISTER.md` (the key list).

**The single most important fact in this document:** a file uploaded today is stored, catalogued and
correctly scope-labelled in emerge-core, and **the retrieval engine never sees it**. Both halves of the
class-wise design are built. The bridge between them does not exist, and it is blocked on decision D1.

---

## FINAL STATE 2026-09-15 — everything emerge-core owns is built

The plan's ours-side is complete. Verified on a settled tree: 18 packages green, race-clean, gofmt and
vet clean, 197 Go files with zero comments, migrations applied (control 4, tenant 6).

> **Stale as of 2026-09-23, on the counts only.** The timetable, attendance and rooms surface landed
> after this was written and moved two of these numbers: the tree is now **19 packages green and
> race-clean** (`internal/service/timetable` is the new one) and migrations are **control 4, tenant 8**
> for DPS-NGP. The sentence's claim — that everything *this plan* covers is built — still holds; the
> timetable work is outside its scope. See `STATUS.md` for that surface and for the eighteen CAS keys it
> declares that production CAS does not yet have.

**Closed in the second wave:** the index sweeper (re-drives `failed` rows and `pending` rows orphaned by
a dead process); `index_attempts` so backoff survives a restart; a `parked` status so a parked upload is
no longer indistinguishable from an orphan; 16 of 17 update handlers made atomic, matching the 16
deletes; and the document scope unified into one predicate with four callers.

`linkGuardianToStudent` is the one update not folded, and deliberately: an ent `Create` carries no
`WHERE`, so no single statement can both check and insert — a link's scope is a property of the guardian
and student it points at, not of the row being inserted.

### Three items are refusals, not omissions

- **F13, narrowing the eight structure listings.** Those five areas have **no breadth key at all**, so
  narrowing would deny everyone rather than narrow anyone. Closing it means minting `*_all` keys — a
  design change plus production CAS registration. The trigger to revisit is the day one of those tables
  carries personal data.
- **F14, deleting our JWT verifier.** Needs a tagged CAS release.
- **F15, `/persons/provision` and `/persons/link`.** Need `cas.v1.UserService`, which does not exist.

### The honest headline

**Ingest is complete. Retrieval is not built at all.**

The bridge is one-way. `IngestFile` and `Job` push a document in and poll until it is indexed; the client
has no search method, emerge-core has no search route, and nothing re-checks engine results against
`LibraryItemsFor`.

So the library↔curriculum-chapter integration is **complete on our side and does not reach the engine** —
by design, not omission. The engine was never meant to learn our curriculum vocabulary. The join happens
here: `resolveCurriculumNodeContent` already turns a syllabus point into content-item ids and page ranges,
and a search endpoint would filter the engine query by those ids and re-check what comes back. Every
component of the join exists except the join.

**That is the next feature, and it is blocked behind the engine's resolver for the same reason the bridge
is** — `gate_is_enforceable()` is false without `RE_SCOPES_BASE_URL`, so a scoped push is refused 409
today. Correctly, and uselessly.

### Two things needed from outside this repo

1. **A CAS token** to register `core.student_guardians.write` — the only key in the code that CAS lacks.
   Until it exists the guardian-link `PATCH` denies everyone.
2. **Keep `RETRIEVAL_INDEX_ENABLED` off** until the engine has a scopes authorizer configured.

---

## BUILT 2026-09-15 — the first feature wave

| Feature | State |
|---|---|
| **F1 ingest bridge** | **BUILT, flag off.** `internal/service/indexing/` — client, indexer, dispatcher. `RETRIEVAL_INDEX_ENABLED` defaults false AND requires a base URL, so it is off by construction, not by configuration. emerge-core now calls the retrieval engine for the first time. |
| **F2 indexing producer** | **BUILT.** `engine_document_id`, `index_status`, `indexed_at`, `indexed_sha256` are finally written by something. `retrieval_state` will stop reporting `not_indexed` for everything. |
| **F10 outbox retention** | **BUILT.** `cmd/mailpurge`, 30-day window, dry-run default, 7-day floor. Prints no recipient data — those columns *are* the trail. |
| **Guardian link `PATCH`** | **BUILT.** The academic gate is now revocable without destroying the link. Atomic fold, `n == 0` → 404. |
| **F9 link governance** | **PARTLY.** `core.student_guardians.write` declared and the catalogue area added; **the CAS key is not yet registered**, so the endpoint denies everyone in a deployment. |

### The sequencing fact this wave established

**Do not turn `RETRIEVAL_INDEX_ENABLED` on until the engine has a scopes authorizer configured.**

The engine refuses to stamp a scoped document while `gate_is_enforceable()` is false, which is
`_scopes() is not None`, which needs `RE_SCOPES_BASE_URL` — the resolver (F3, `identity.py`) that does
not exist yet. Their reasoning, which is the clearest statement of the fail-open problem in either repo:

> *"With no authorizer configured every caller holds the empty set, so a stamped document is invisible to
> EVERYONE — not to the wrong people, to all of them. Without that guard the natural first step — stamp
> something — is also the step that takes the library dark."*

So turning the flag on today would 409 every scoped push. Correctly, and uselessly. **F3 genuinely gates
F1's usefulness and the order cannot be swapped.** That 409 maps to `failed`, never to a quiet
unrestricted ingest — treating it as success would give the whole school a document emerge-core reports
as scoped, which is a leak rather than an inconvenience.

### Named gaps from this wave, not hidden

- **Nothing re-drives a `failed` index row**, and a restart orphans `pending` because the queue is in
  memory. The fix is a sweeper over `index_status IN ('pending','failed')` — which is why that column is
  indexed — needing per-tenant iteration and cross-instance coordination that could not be tested against
  a stub. Deliberately not invented.
- **No failure strands an item in `pending`**, which is the sharper half of the rule: `failed` is a state
  someone can act on, `pending` reads as "in progress" forever.
- **No way to sever a guardian link entirely** — no unlink route, no `DELETE`. `can_view_academic=false`
  revokes academic records; severing every arm is a different decision and wants its own endpoint.
- **Purging an outbox row frees its `idempotency_key`**, so the same key resubmitted later sends again.
  The outbox is a send queue with a short dedupe window, not a durable once-only ledger.

## RESOLVED 2026-09-14 — read this before Part 1

Eight of the eleven decisions are closed. **Three of them were never open** — the documents were stale,
not the system. Verified against production CAS with an admin token and against a live boot.

| | Decision | Outcome |
|---|---|---|
| D1 | S3 at ingest | **emerge-core pushes the bytes.** The engine's reason carried it: its blob store resolves by the document's owning tenant precisely to keep a spoofable header out of the write path. Revisit under signed tenancy. |
| D2 | Section identity | **The engine resolves against emerge-core.** No section claim; CAS stays domain-agnostic. Task B sizes as the resolver alone. |
| D3 | CAS service registration | **Already done — the doc was wrong.** Service `core` registered, client `core-svc` with audience `core`, secret set, `AUTH_DISABLED=false`. Booted the API and watched it select `guard=cas`, not deny-all. `TODO.md` §9 was stale. |
| D4 | 111 entity keys | **Done, and 21 were genuinely missing** — the whole of `core.library.*`, `core.curriculum.*` and `core.content_placements.*`. Registered with their three parent folders; the diff against the code is now **zero missing**. Until today that entire content surface denied. |
| D5 | `cms` escalation | **Left open, knowingly.** Every member of `cms` remains a global CAS admin. |
| D6 | Outbox retention | **30 days**, then the per-recipient trail is purged. Not yet built — see F10. |
| D7 | Console audience | **Already correct.** `retrieval-console` carries `audiences=['retrieval-engine']`; the engine's fallback is not being exercised. |
| D9 | Guardian flags | **`can_view_academic` wired**; it now gates enrollments, subject enrollments, student assignments and student documents. **`can_view_finance` deliberately left dormant** — no finance, fee, invoice, payment or billing entity exists, so it has nothing to gate. |
| D10 | Orphan schools | **Both deleted.** `DPS-NGP1` and `QA-TEN-CA5F7190` had zero dependent rows; `migrate` now reports no skips. |
| — | Catalogue publisher | **Deliberately left manual.** `catalog.Build()` generates exactly the names CAS carries and nothing publishes it, which is why the three newest areas were missing. **It will drift again when an area is added.** Accepted knowingly. |

**Still open: D8** (make the 17 update handlers atomic — recommendation stands: not during a wind-up)
and **D11** (call-site rule into `CLAUDE.md`).

**New, arising from D9 and needing an answer:** a guardian link has **no update path**, so
`can_view_academic` can only be set when the link is created. Revoking academic access means deleting
the link and recreating it, and the unique index on `(student_id, guardian_id)` prevents adding a
corrected one alongside. The events that motivate revocation — a custody change, a safeguarding concern —
happen *after* the link exists. A `PATCH` on the link is the obvious answer and is not built.

---

# Part 1 — Decisions. Nothing below Part 2 can be sequenced until these are answered.

Each names what it blocks, the options, a recommendation, and what it costs to be wrong.

## D1. S3 at ingest: does emerge-core push the bytes, or does the engine pull them?

**Blocks:** the entire ingest bridge — feature F1, and therefore every class-wise retrieval feature.

A book uploaded through emerge-core lands in that school's S3 bucket. The engine writes to its own
store and cannot read ours. Per-tenant destinations already exist on the engine side
(`blobstore.py`), so this is a decision, not a build.

- **Push (recommended, and both sides agree).** emerge-core streams bytes to the engine at ingest.
  Costs a second copy of large files.
- **Pull.** The engine reads per-school S3 directly. Fewer copies, but two services then hold the same
  credential.

**Why push, in the engine's words rather than ours:** its blob store resolves by *the owning tenant of
the document, never by the caller*, specifically to keep a spoofable header out of the write path. If
it pulled from a per-school bucket it would have to choose the bucket from request context —
reintroducing exactly that. Our own reason (one credential holder beats two) is weaker.

**Revisit when:** signed tenancy is fully deployed. The double-copy cost is the right trade only while
`X-School-Id` is unsigned.

## D2. Does the JWT carry the section, or does the engine resolve the token against emerge-core?

**Blocks:** the engine's resolver (F3), and any proto change. Sequencing everything else around it is
wasted if this flips.

- **Resolve against emerge-core (recommended).** The engine asks us who the caller is and what they
  hold. Costs a round trip per query.
- **Section claim in the token.** No round trip, but **CAS then knows about sections**, which breaks
  the standing invariant that CAS stays domain-agnostic — no school, no section, no enrolment, ever.

**The argument that should decide it is CAS's own.** CAS carries `tenant_id` only *"when the caller
resolves to exactly one"* and omits it otherwise *"because a partition key that is sometimes ambiguous
is worse than one a service must always ask for."* Sections are many-per-user by construction, so by
CAS's own stated rule they belong to the ask, not the token. A token is also a snapshot, and
assignments change mid-year.

## D3. Register emerge-core as a CAS service — and unblock the superadmin

**Blocks:** *all* authorization in emerge-core. This is the largest single blocker in the estate and it
is not a code change.

emerge-core has no `client_id`/`client_secret`, so it cannot fetch policies. The guard notices and
selects **deny-all**, which is correct and says so at boot — but it means **nothing is authorized**.

Registration needs a superadmin bearer, and the superadmin cannot sign in:
`CAS_SUPERADMIN_EMAIL` is empty in the deployed `.env`, 2FA is on globally, so the password step
answers `no destination for channel` — there is nowhere to send the OTP. The `X-Internal-Key` dev
bypass is refused because `CAS_ENV=production`.

**Two ways out, both CAS-side:** set the superadmin's email and restart CAS, or add a bootstrap path for
service registration. Then two lines in `.env` and `AUTH_DISABLED=false`.

## D4. Register the 111 CAS entity keys

**Blocks:** every grant. Depends on D3.

Full list in `CAS-KEYS-TO-REGISTER.md`: 111 keys across 20 areas, 15 each of `read_all`/`write_all`/
`delete_all`, 6 `create`. Until a key is registered nobody can hold it. **That fails closed** — the safe
direction — but it presents as *"this person cannot see the whole school"* and reads like a policy
misconfiguration, so it gets debugged in the wrong repo.

## D5. The `cms` privilege escalation — live in production CAS

**Blocks nothing. Decide anyway.** Longest-open item.

The `cms` GROUP holds "Users Create" with `scope_id` NULL, and that rule contains a `cas.users.create`
policy. Per CAS's `ScopeRootsForUser`, **every member of `cms` is therefore a global CAS admin.** Found
during the architecture verification pass and deliberately left open. Re-granting changes who can do
what in production, so it needs an explicit decision rather than a quiet fix.

## D6. Outbox retention

**Blocks:** F10.

Nothing deletes `sent` or `failed` rows. This is **not a table-size question** — a terminal row keeps
`recipient_hash`, `recipient_redacted` (which deliberately preserves the full domain), `template_key`,
`school_id` and five timestamps, **forever**. That is a per-recipient activity trail for children's
contact data, and the HMAC protecting it is only as good as the retention decision.

The operational value of those columns is almost entirely about *recent* mail, so a retention window
costs little of what they are for. **The question is: how long do we keep a record of who was
contacted?**

## D7. Is `retrieval-engine` on the `retrieval-console` client's Audiences in CAS?

**Blocks:** the engine console's sign-in correctness.

CAS resolves `aud` per client and its default is not the engine's audience, so a console that never
requests one gets a token every engine call rejects — which presents as **instant logout**, not as a
misconfiguration. The engine now publishes `cas_audience` and the console asks for exactly that, with a
fallback and a warning. Someone who can see that CAS client needs to confirm the registration.

## D8. Should the 17 update handlers be made atomic?

**Blocks nothing. It is a scope call.**

All 16 scoped *deletes* are now atomic. The 17 update-shaped handlers carry the same race: they check
reachability, then mutate in a second statement, so a row can leave the caller's scope in between. They
cannot collapse into a helper — ent returns a count, not the row — so each needs `n == 0 -> 404` plus a
re-read to answer with the row.

**Recommendation: not now.** It touches every write path in the codebase to close a race the original
notes call "narrow". Ship it as its own pass with its own review.

## D9. What should `can_view_academic` / `can_view_finance` actually gate?

**Blocks:** F9.

Both flags are **read by nothing**. They are dormant bits named as capabilities, and they appear in the
catalogue as writable columns of the `guardians` area — so a policy author can grant field access to
them and reasonably believe something is gated. Either wire them to real behaviour, or remove them.
Leaving them is the worst of the three.

## D10. Two registered schools have no Postgres profile

**Blocks:** nothing, but they silently skip every migration and every reaper run.

`DPS-NGP1` and `QA-TEN-CA5F7190`. The second looks like a test fixture that outlived its run. Provision
them or delete them — a registered school whose migrations never run is a trap.

## D11. Does the call-site rule enter `CLAUDE.md`?

Proposed rule: **a call-site search is part of the definition of done for any new capability.** Five
instances of the same defect were found in this project — code built, tested, correct, and unreachable.
Neither session wrote it into `CLAUDE.md`, because repo conventions are the owner's to set and a rule
arriving because a peer suggested it is the wrong mechanism. Applies to both repos.

---

# Part 2 — The work, sequenced by dependency

Sizes are rough: **S** under a day, **M** a few days, **L** a week or more, **XL** longer.

## The critical path — class-wise retrieval

Nothing else here matters as much. These four, in order, are what make an uploaded 9A note findable by
9A's teacher and nobody else.

### F1. The ingest bridge · **L** · blocked on D1
**Nothing in emerge-core calls the retrieval engine. No client, no ingest call, no configuration.**
Build the producer: on publish, send the document plus its scope labels to the engine.

The labels already exist and are frozen: `unrestricted_<school>`, `school_<id>`, `grade_<id>`,
`section_<id>`, `offering_<id>`, `person_<id>` — flat single segments with embedded UUIDs, deliberately
not the engine's dotted hierarchy, because containment widens downward while the requirement narrows
upward. `LabelsFor` already computes them.

### F2. The indexing producer · **M** · part of F1, listed separately because it is a distinct defect
`content_items` carries `engine_document_id`, `index_status` (`none|pending|indexed|failed`),
`indexed_at` and `indexed_sha256`. **Nothing writes any of them.** `GET /curriculum-nodes/{id}/content`
computes a `retrieval_state` from them and will report `not_indexed` for every item forever, while
looking like it works. This is the fifth instance of the unreachable-capability pattern in this project.

### F3. The engine's resolver — `identity.py` · **M** · theirs · blocked on D2
The engine's JWT verifier is built and `_visible` already accepts `held_labels`. What is missing is the
thing that decides *which* labels a caller holds. Without it a correctly-stamped document has nothing
to match against.

### F4. The asserter credential · **S–M** · theirs · depends on F3
emerge-core computes the label set and sends it; the engine accepts it only from a caller holding the
asserter credential. **A request without the credential that supplies `visible_scopes` must be 403, never
silently ignored** — dropping it is an under-grant the caller never learns about.

### F5. Deploy the gate · **S** · theirs · depends on F3, F4
`jwt_required` is **false** in the deployment. CAS is configured and console sign-in works
(`cas_configured: true`), but a verified token's tenant is compared and logged, **never enforced** — the
unsigned `X-School-Id` still decides. **Configured is not enforced.** Do not repeat "the engine verifies
tokens" without checking what is deployed.

### F6. Ingest one real school-scoped document end to end · **S** · the proof, not a feature
The live corpus is one `(tenant_id, scope)` pair: `('_global','global')`. **Every per-school path in the
engine is exercised only by fixtures.** NCERT Maths Class 10 is ingested and searchable, but it is
global and it is not a PYQ. Until one real school-scoped document goes in and comes back out to the
right caller and not the wrong one, none of F1–F5 is proven.

## Second tier

### F7. PYQ ingest · **M** · theirs
`source_type=pyq` plus `subject`, `grade`, `checksum` (the document id is `sha1(tenant + NUL + checksum)`,
which is what makes re-ingest idempotent) and `title`. Everything else stays in our `question_papers`
sidecar. Settled and not to be relitigated: **no year facet** — "2019 papers for class 10 maths" resolves
on our side into a `document_ids` filter; and **per-question retrieval is unavailable**, measured rather
than assumed.

### F8. Reconciliation report, then the re-stamp route · **S**, then **S** · theirs
A read-only report of *which stamps name labels no current caller can hold*. **Build it before the fix,
not after** — run today it returns "no orphans" trivially, and that is the point: a detector's first run
should never happen during an incident, because "clean" and "the detector is broken" are then
indistinguishable.

Then Task H: `update_document_metadata` exists, accepts `restricted_to`, and makes a re-stamp
metadata-only with no re-embedding — **and is called by nothing**. So a section re-org today means
re-ingesting every affected document, which is exactly the cost that capability was built to avoid.
emerge-core triggers re-stamps; the engine must never *parse* a label, or it invents a grant nobody
issued.

### F9. Guardian link field governance · **M** · blocked on D3, D4, D9
`student_guardians` has a generated ent entity and `Columns`, but no `areaColumns` entry and **no CAS
entity keys**. Until it has both, `can_view_academic` and `can_view_finance` stay settable by anyone
holding `core.guardians.write`, and a fixed allowlist cannot tell one caller from another.

### F10. Outbox retention · **S** · blocked on D6

### F11. Per-school isolation in the engine · **XL** · theirs
One global `re_chunks` table. Our guarantee is that School A's rows sit in a database School B has no
credentials for; theirs is that a filter matched. **Content crossing between them inherits the weaker
promise.** One database per school is the correct end state but changes the process model — a rewrite
wearing a migration's clothes. Least urgent, largest.

## Third tier — real but not blocking

- **F12. 17 update handlers made atomic** · **M** · see D8.
- **F13. Narrowing on the eight structure listings** · **M** · they apply no per-viewer narrowing, so
  **the filters are the only predicates on the query** — a dropped filter returns the whole table, not a
  wider slice. Inside the caller's grant, so not an escape, and none of those tables holds personal data.
  **The trigger to revisit is the day one of them does.**
- **F14. Delete our JWT verifier** · **S** · blocked on a tagged CAS release. Ours lacks CAS's strict
  `kid` resolution and its refetch floor.
- **F15. `/persons/provision` and `/persons/link`** · **S** · answer 501; blocked on `cas.v1.UserService`.
- **F16. Audit the fixture drivers** · **M** · the transport package's fake drivers do not evaluate
  `WHERE`, and one returned `RowsAffected: 1` unconditionally. A broken authorization predicate survived
  in a shipped endpoint because of this. Assertions on *returned rows* against those doubles prove
  nothing about scoping; only SQL-text assertions or real-database tests do. Unknown how many existing
  tests rest on it.

---

# Part 3 — The shortest path to "class-wise retrieval works"

If only one thing is done next, it is this sequence, and it starts with two answers rather than any code:

1. **Answer D1 and D2.** Neither is a code change; both block everything below.
2. **F1 + F2** — the bridge and the indexing producer (ours).
3. **F3 + F4** — resolver and asserter credential (theirs).
4. **F5** — turn `jwt_required` on.
5. **F6** — ingest one real school-scoped document and prove it reaches the right caller and not the
   wrong one.

**D3 runs in parallel and is independent of all of it** — and until D3 is answered, emerge-core
authorizes nothing at all, so none of this is reachable in a deployment regardless of how much of it is
built.

---

# The dashboard — decisions taken 2026-09-22/23

A dashboard for students, teachers and school staff is being built. Ground truth was established
against `D:\emerge-frontend` and this repo before anything was planned, and it changed the plan twice.

## What the survey found

**CAS already models the three display states.** `FeatureState` is `on | disabled | off`, `Visible` is
`State != off`, and `disabled` is documented as *"the front end draws it inert"*. The frontend already
resolves visibility through `POST /v1/features/evaluate`, mapping ten CAS reason values into
`hidden | enabled | disabled | needs_scope` via one pure function, with **no role-string comparison
anywhere** — that is an eslint error there, matching this repo's own rule.

So "show / hide / show-but-locked" **already works end to end**. The only gap is *why* something is
inert: a feature disabled for maintenance and one a school has not bought both arrive as `disabled`,
so a UI cannot offer "pay to unlock" for one without offering it for the other.

**The existing frontend has never called emerge-core** — zero references. It talks to CAS for auth and
to fixture-backed stubs for attendance, timetable and academics, plus the real LMS engines. Wiring this
backend in is new work, not adaptation.

## Decisions

| | Decision |
|---|---|
| Entitlements | **Extend CAS** with one new reason meaning "inert because unpurchased". No new table here. CAS acquires no notion of money, price, plan or expiry. |
| Commercial record | **Lives outside CAS**, and enabling/disabling is **manual for now**. Consequence, stated: nothing records which school bought what, so a locked feature is unlocked by hand with no audit trail of the purchase that prompted it. |
| Frontend base | **Reconcile the two diverged branches first**, then extend in place. `deploy/public-demo-labs` holds the demo deploy bundle, `origin/main` holds flashcards and mindmap, neither contains the other, and they disagree on a feature key. All dashboard work is blocked behind this. |
| Capability API | **Serve `catalog.Build()` over HTTP.** It has been dead code — the sixth instance in this project of something built, tested, correct and unreachable. A UI needs it to know which *fields* a caller may write, which nothing else can tell it. |
| Scope | **Only what exists.** Profile, roster, classes, sections, enrolments, library and curriculum content, question papers. No attendance, timetable, marks or fees tiles — those domains have no schema and no routes. |

**What that scope honestly makes it:** a school-operations dashboard, not a student learning portal.
The learning surfaces live in the other frontend against the LMS engines.

## `GET /api/v1/auth/me` — the contract changed 2026-09-22

`person` was the **raw ent row**, while `GET /persons/{id}` returned the same row projected through the
caller's CAS field policy. Two endpoints, one row, different promises — so a field a school redacts from
one was still served by the other.

It is now a deliberate identity subset **and** projected through the same policy, so the two agree
*because they consult the same policy* rather than because they stopped overlapping. Returning a fixed
subset alone would have renamed the defect: `display_name`, `email`, `phone` and `status` are exactly
the fields a school redacts.

**`person` now carries** `id, first_name, middle_name, last_name, display_name, email, phone,
profile_photo_asset_id, status`.
**Gone:** `created_at`, `updated_at`, `cas_user_id`, `date_of_birth`, `gender`, `metadata_json`, `edges`.
Top-level `cas_user_id` is **unchanged** — it comes from the token, not the row. The full record is
still available from `GET /persons/{id}`.

**It fails closed.** If the guard errors or the caller holds no `core.persons.read` grant, the policy
used is an include policy with no keys, which permits nothing: the endpoint still answers 200 with
identity, and the person block degrades to its `id`. A dead policy source narrows the answer rather than
widening it or refusing the call — which matters, because this is the first call every client makes.

Row *reachability* still differs deliberately: `/persons/{id}` applies the row predicate and 404s a
caller whose reach excludes their own row; `/auth/me` still answers. The invariant defended here is
about fields, not rows.
