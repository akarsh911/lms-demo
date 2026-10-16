# Status — where the build actually is

Written 2026-09-09. Re-verified against the tree on **2026-09-23**, when the timetable, attendance and
rooms surface landed. Supersedes the "plan only, nothing here is built" header in
`LIBRARY-CURRICULUM-PLAN.md`, which is stale.

The short version: **everything that is ours is built. Almost everything that remains is in the
retrieval engine's repo**, and the largest single gap is that the engine is integrated with none of
the platform.

The 2026-09-23 addition does not change that sentence, but it adds a second kind of gap that is ours:
a feature can be complete in this repo and still be uncallable in a deployment, because its capability
keys are not registered in production CAS. Eighteen keys are now in that state. **"Built and tested"
and "registered in production CAS" are different claims and this document keeps them apart.**

---

## Phase status at a glance

| Phase | Whose | State |
|---|---|---|
| 0 — decisions before code | ours | **done**, bar the smaller open questions in §0.3 |
| 1 — assets and the catalogue | ours | **built and applied** |
| 2 — curriculum and placement | ours | **built and applied** |
| 3 — retrieval scoping | **theirs** | our half built; theirs agreed, **not deployed** |
| 3.5 — engine integration (CAS, S3, Postgres) | **theirs** | **unbuilt — the largest remaining gap** |
| 4 — curriculum-topic retrieval | split | our half **built**; theirs waiting |
| 5 — question papers | split | our half **built**; their ingest unbuilt |
| Mail outbox | ours | **built and wired** (not in the original plan) |
| Timetable, attendance, rooms | ours | **built, applied and green — CAS keys unregistered** (not in the original plan) |

---

## Phase 1 — assets and the catalogue · BUILT

Tables `assets` and `content_items`, migration `20260907201531_add_library_tables.sql`, applied to
DPS-NGP.

Routes under `/api/v1/library`: list, create, get, update, delete, plus the full asset lifecycle —
`POST /assets` (presigned PUT), `GET /assets/{id}`, `POST /assets/{id}/ready`, `GET /assets/{id}/link`,
`DELETE /assets/{id}`. Six asset refusal codes.

The presigned PUT binds **three** headers into the signature — `x-amz-checksum-sha256`,
`Content-Length` and `Content-Type` — so `PresignPut` returns a `PutGrant{URL, Headers}`, not a bare
string. A client that sends only the URL gets `SignatureDoesNotMatch`. This was frozen wrongly once as a
bare string and had to be unfrozen; do not re-simplify it.

`assets` is the tenant's first file registry, and deliberately has **no** FK from
`student_documents.asset_id` or `persons.profile_photo_asset_id` — existing rows hold ids with no
matching asset, so the migration would fail on apply.

## Phase 2 — curriculum and placement · BUILT

Tables `curricula`, `curriculum_nodes`, `content_placements`, `content_nodes`, migration
`20260908094321_add_curriculum_tables.sql`, applied. `content_bindings` remains deferred.

Routes: `/api/v1/curricula` (+ `/{id}/nodes`), `/api/v1/curriculum-nodes/{id}`, `/api/v1/placements`.

The two axes — **curriculum placement** and **audience** — are separate by construction. Nothing in the
model lets them be conflated, which was the thing most worth getting right.

## Phase 3 — retrieval scoping · OURS BUILT, THEIRS AGREED BUT NOT DEPLOYED

Ours: `internal/retrieval/labels.go` — `LabelFor`, `LabelsFor`, `ScopesFor` — mirroring
`access.LibraryItemsFor` arm for arm, plus `GET /api/v1/library/scopes`.

The scope-label vocabulary is **frozen and flat**: `unrestricted_<school>`, `school_<id>`, `grade_<id>`,
`section_<id>`, `offering_<id>`, `person_<id>`. Single segment, UUID-bearing, deliberately **not** the
engine's dotted hierarchy — containment widens downward while the requirement narrows upward.

Restriction rides on `scope_ids` stamped per chunk on every ingest path (including OCR and A/V), **not**
on the engine's `section_id`. That is why a scanned 9A note is covered.

The engine's `restricted_to` gate replaced our earlier proposal to invert the polarity of one disjunct;
their design is better and is the one agreed.

> **The claim "the engine verifies tokens" is true of the code and NOT of any deployment.** The rollout
> is two-stage and the unsigned `X-School-Id` header still decides. Do not repeat this claim without
> checking what is actually deployed.
>
> **Re-confirmed 2026-09-14 by the engine's own session.** CAS is now configured on the deployed engine
> and console sign-in works end to end (`cas_configured: true`, `cas_login_ready: true`, issuer
> `mentis-cas`, audience `retrieval-engine`) — but **`jwt_required` is `false`**, so a verified token's
> tenant is compared and logged, never enforced. Configured is not enforced; sign-in working is not the
> boundary closing.

## Phase 3.5 — engine integration · PARTLY BUILT (corrected 2026-09-09)

**An earlier version of this section said the engine was integrated with none of the platform. That was
already out of date when written.** Verified against their `fix/audit-findings` branch:

- **CAS — verifier BUILT.** `jwt_verify.py` does RS256 against JWKS with algorithm, issuer and audience
  pinned and a bounded refetch; `_caller` reads `tenant_id` from the verified claim under
  `RE_JWT_REQUIRED`. **Corrected 2026-09-14: `_visible` ALREADY takes `held_labels` as a keyword-only
  parameter and passes it to `Filter.matches` (`api.py:735`).** The remainder is only the **resolver** —
  `identity.py` does not exist, so nothing decides *which* labels a caller holds. Size it as the
  resolver alone, not the resolver plus a `_visible` change.
- **S3 — per-tenant destinations BUILT.** `blobstore.py` resolves a store by the tenant that **owns the
  document, never by the caller**, against named profiles with credentials structurally excluded; an
  unmapped tenant is an error, not a fallback to another school's bucket. What remains is a decision,
  not a build.
- **The gate is `restricted_to`, and it is stamped.** `_stamp_gate` enforces the mirroring invariant
  inside `index()` as a single funnel, not five per-path stamps. `restricted_to` (subtractive, the gate)
  and `scope_ids` (additive, the audience) are separate fields and must stay separate.
- **Postgres — the "never run against a live database" caveat is RETIRED (2026-09-14).** pgvector has
  now executed against Postgres 18.6 / pgvector 0.8.6: `vector_index: PgVectorIndex/PgVectorIndex`,
  `degraded_providers: []`, 568 chunks, and the gate clause confirmed enforcing **in-database**. One
  guard came out of a real incident worth knowing: `CREATE TABLE IF NOT EXISTS` bakes the vector
  dimension in at creation and is a no-op ever after, so a `re_chunks` table created at the wrong width
  was adopted in silence — a `dim=3` smoke test polluted the production table and took the service down.
  `_assert_dimension` now reads the column's real width and raises at build time, so the deployment comes
  up degraded-and-visible rather than crash-looping with a message naming the snapshot instead of the
  column.
- **The silent pgvector fallback is FIXED** — `build_vector_index` no longer swallows; the reason is
  recorded in `vector_store.BUILD_FAILURES` and served as `detail` on `/health/providers`, with the DSN
  deliberately excluded because that endpoint is anonymous. This was our top-priority recommendation and
  it is closed.
- **Per-school isolation remains the open half.** One global `re_chunks` table, and the tenancy models
  are still incompatible.

The tenancy models remain incompatible, and content crossing into the engine **inherits the weaker
promise**. Only the Postgres work changes that.

Rate limiting, when it lands, keys on the **verified subject**, not the resolved tenant: the engine is a
*transport* for the user's token, not a principal.

## Phase 4 — curriculum-topic retrieval · OUR HALF BUILT

`GET /api/v1/curriculum-nodes/{id}/content` (`resolveCurriculumNodeContent`) resolves a syllabus point
into `(content_item_id, content_node_id, page_start, page_end)`, double-gated by `ContentPlacementsFor`
and `LibraryItemsFor`, with `?include_proposed` and `?include_ancestors`.

The response carries `retrieval_state` (`current | stale | not_indexed | unpublished | source_deleted`),
`index_state` and `content_status`. It is a **spot-check along the curriculum path, not a corpus
inventory** — an earlier draft overstated this.

## Phase 5 — question papers · OUR HALF BUILT

Most of it was already built by Phase 2 and nobody noticed: "past papers scoped per subject per session,
carried forward each year" is exactly what `content_placements` does, and `copied_from_placement_id`
carries a paper into the next session with everything else. No paper-specific copy-forward, no session
column on the paper.

Genuinely new and **done**: `content_items.kind` gains `paper`; the `question_papers` sidecar (1:1 —
exam_type, board, exam_year, total_marks, duration_minutes, paper_set, attempt); routes inline on the
four existing library handlers rather than new ones; migration `20260908174612_add_question_papers.sql`
applied.

**Corrected 2026-09-14: something HAS now been ingested.** NCERT Mathematics Class 10 is published and
live — `doc_ecdc295c08e8`, 5,311 blocks, 316 chunks, 15 sections, 14 human-confirmed chapters, 277 media
files, verified by server-side digests. A real search returns cited passages ("prove that root 2 is
irrational" → pp. 21-22 at 0.989).

Two things that ingest does **not** settle, and they are the parts that mattered. It is **not a PYQ**, so
`source_type=pyq` is still unexercised. And **every per-school path remains fixture-only**: the live
corpus carries exactly one `(tenant_id, scope)` pair, `('_global','global')`, across both documents. If
the point was to exercise a school-scoped path, this does not do it, and the fixture-only gap is undented.

`exam_year` is a calendar year, not a session.

## Mail outbox · BUILT AND WIRED

Not in the original plan; added this session on request — one mail path for all services, polled on an
interval, later separable into a microservice.

Transactional outbox in the control plane (`outbox_messages`, migration `20260908205817_mail_outbox.sql`)
with three CHECK constraints. AES-GCM payloads with AAD `outbox_message:<id>`; HMAC recipient hashing
with an undefaulted pepper. Per-school worker goroutines, circuit breaker, leases.

**Sender identity: per-school SMTP, falling back to platform SMTP.** A fallback message forces its own
`From` and takes its reply path in order: school SMTP profile → `schools.email` →
`PLATFORM_SMTP_REPLY_TO` → **refused**, retryably, with `failure_code = no_reply_address`. A fallback
message is never sent with no reply path.

Wired into `cmd/api/main.go` — it had **no callers at all** before, neither the submitter nor the sender.
`MAIL_SENDER_ENABLED` (default true), `MAIL_SENDER_INTERVAL` (default 10s), `MAIL_SENDER_INSTANCE_ID`.
No mail setting is validated at load: mail configuration must never stop the process booting.

`GET /api/v1/health` reports a `mail` object — `state` (`running | disabled | unavailable`),
`stale_after`, tick and delivery counts — and deliberately does **not** fail readiness, because mail is
off the request path.

## Timetable, attendance and rooms · BUILT AND MOUNTED, CAS KEYS UNREGISTERED

Not in the original plan; landed 2026-09-23. Schema through mounted HTTP route, green on a live tenant
database.

**Thirteen tenant tables**, in migrations `20260922194449_add_timetable_attendance_rooms.sql` and
`20260922195302_add_timetable_deviations.sql`, both applied — DPS-NGP is now at **8 applied**, control
still at 4:

`rooms`, `period_schemes`, `period_scheme_grade_levels`, `periods`, `bell_schedules`,
`bell_schedule_periods`, `calendar_days`, `calendar_day_schedules`, `timetables`, `timetable_slots`,
`timetable_deviations`, `attendance_days`, `attendance_periods`.

**Eighteen CAS entity keys across four new areas** — `timetable` (6), `attendance` (6), `rooms` (3),
`calendar` (3). `AllEntities` went 112 → **130**, areas 21 → **25**. The key list is in
`CAS-KEYS-TO-REGISTER.md`; the reasoning for the partition, and for attendance being its own area rather
than a verb on timetable, is in DESIGN-NOTES under "Four CAS areas for the timetable surface".

> **None of the eighteen is registered in production CAS.** The code declares them and the tests cover
> them, so the suite is green; a deployed caller is refused at the capability guard before any row is
> read. This is a handoff item, not a build item, and it is the same shape as
> `core.student_guardians.write` below.

**Access predicates:** `internal/data/access/timetable.go` and `attendance.go`.

**Service layer:** `internal/service/timetable/` — occurrence resolution, three clash rules
(`teacher`, `room`, `student_set`), and an in-session helper.

**Occurrences are derived, never materialised.** There is no occurrences table and deliberately so: a
timetable is a pattern plus deviations, and materialising it would mean every calendar edit rewriting
rows that can silently drift from the pattern they came from.

**HTTP:** 51 timetable routes and 11 attendance routes, mounted in `server.go` inside `mountTenantPlane`
via `mountTimetable` and `mountAttendance`.

### A fail-open found and closed

`Resolve`/`ResolveDay` admitted **every** added class in the branch when a caller narrowed slots but not
deviations — a viewer scoped to one section could see make-up classes added anywhere. `buildPlan` now
refuses with `ErrScopeIncomplete`, and the guard is symmetric in both directions rather than checking
only the direction that was found broken:

    if (len(q.slotPreds) == 0) != (len(q.devPreds) == 0) {
            return nil, ErrScopeIncomplete
    }

### `can_view_academic` now gates `WardOfferingIDs`

This reversed a boundary that a 2026-09-14 note had drawn deliberately, and it closed a live leak: a
guardian barred from academic records could still enumerate their ward's exact elective set through
library listing and retrieval search labels. `enrolledScope` now uses `StudentsOfGuardianAcademic`
(`viewer.go:207`). **The full reasoning — why the earlier boundary failed on its own terms, why
curriculum was not the same case, and what a barred guardian keeps — is at the end of DESIGN-NOTES and
is not repeated here.**

The measure of how invisible this was: reverting that one line makes exactly one test fail, and the
whole tree was green both before and after.

### Known limitations, accepted rather than hidden

These are recorded because they are real and were decided, not because they are fine.

- **Bulk attendance marking has a TOCTOU window.** `planRegister` checks `not_enrolled` on the plain
  request client and returns before `begin` opens the transaction (`attendance.go`, the
  `notEnrolledInOffering` call at ~878, the transaction at ~816 in `markAttendanceRegister`). A student
  unenrolled between the check and the commit is still marked.
- **`rooms` and `calendar` have no `*_all` breadth key**, so their routes pair with `TimetableReadAll` /
  `TimetableWriteAll`. Same trade as the five areas in `REMAINING-PLAN.md` F13: minting the keys is a
  design change plus a CAS registration, not a code change.
- **A narrowly-scoped viewer cannot create the first slot of a section that has none.** `sectionWritableBy`
  asks whether any *existing* slot in that section is writable by the viewer, so an empty section admits
  nobody. Admins with tenant reach are unaffected, which is why this has not bitten.
- **An added make-up class still requires the calendar day to exist with the half open.** A deviation
  cannot conjure a teaching day.
- **Pattern-level clash detection is intra-scheme.** `period_id` is scheme-local, so a teacher colliding
  across Grade 6 and Grade 11 is invisible to the pattern pass and caught only on the dated pass, which
  compares resolved minute intervals. A clash that never falls on a resolved date is never reported.
- **Teacher and room clash are not enforced by a database constraint.** Doing it properly needs a
  `daterange` exclusion constraint, which neither ent nor Atlas can express, so the rule lives in the
  service layer — verified absent from both migrations. Anything writing these tables outside the service
  bypasses it.

---

## What remains, ordered by what blocks what

1. **Phase 3.5 — engine integration (CAS, S3, Postgres).** Theirs. Everything downstream of retrieval
   waits on it.
2. **Deploy Phase 3's gate.** Agreed, not deployed; until then the unsigned header still decides.
3. **Ingest one real PYQ.** Phase 5 has never been exercised end to end.
4. **The `cms` CAS re-grant.** A live privilege escalation, deliberately left open — see below.
5. **Register the CAS keys.** Nineteen keys the code declares and production CAS does not have: the
   eighteen timetable/attendance/rooms/calendar keys, plus `core.student_guardians.write`. Every route
   behind them is finished and refused. Needs a CAS token, not a commit here.

   **The repo cannot verify any of this.** `api/04-people/29-update-guardian-link.bru:31` asserts 403 and
   documents that the assert must flip to 200 once the key is registered — deliberately, so it fails
   loudly rather than passing against a route nobody can call. But nothing here can read production CAS,
   so "unregistered" is what the code and that note assume, not something checked. The eighteen new keys
   are in the same position. Whoever holds the CAS token should confirm before treating this item as
   either open or closed.
6. **Outbox retention.** Nothing deletes `sent`/`failed` rows.
7. **Authorization leftovers** in `TODO.md` §2: reach-and-write are not atomic; field enforcement
   missing on several writes; four `get*` handlers apply no viewer narrowing.
8. **Housekeeping: closed 2026-09-24.** All three items are done; see DESIGN-NOTES under "Housekeeping:
   the orphan sweeper, 400 versus 422, and clearing a column".

   - *Orphan `pending` asset sweeper:* **it already existed** and this entry was stale. `cmd/assetreap`
     has swept `pending` as well as `deleted` since 2026-09-14. What was genuinely broken was its scan:
     a single `pending OR deleted` query ordered oldest-first meant already-reaped soft deletes filled
     the limit forever and a freshly orphaned `pending` row was never reached. `Sweepable` now gives
     `pending` first call on the budget. Proven end to end against DPS-NGP and MinIO.
   - *400-vs-422:* eleven refusals disagreed with the convention the rest of the tree follows and were
     changed. **One Bruno assertion must change with it:**
     `api/09-negative/06-pass-marks-above-maximum.bru` asserts 400 and must assert 422.
   - *JSON-null clearing:* an explicit `null` clears a nullable column, an omitted field does not, and a
     `null` on a `NOT NULL` column is a 400. Implemented on `updateStudent`, `updateTimetable` and
     `updateOffering`; every other update handler is deliberately left for whoever next works in it.

   Note that the retrieval index sweeper (`RETRIEVAL_SWEEP_*` in `config.go`) is still a **different**
   sweeper - it re-drives `failed` and orphaned `pending` *index* rows and does not touch assets.

## Wind-up pass, 2026-09-14

Everything below was built and verified this day, each item proven by mutation — the implementation was
broken deliberately and the test watched to fail for the intended reason, then restored and checked
byte-identical. A test nobody has watched fail is not evidence.

| Built | Evidence |
|---|---|
| Mail test harness: Postgres advisory lock in `TestMain` | failure reproduced first, then 8 concurrent processes clean; `sender.go` untouched |
| Field enforcement on `createEnrollment`, `createSubjectEnrollment`, `linkGuardianToStudent` | `status` reached the guardian link from the request body, and `StudentsOfGuardian` narrows on it |
| Field enforcement on sections, sessions, offerings (6 handlers) | plus `routeDecision`, which refuses when no decision reached the handler |
| `GET /library/assets`, `createAsset` leak fix, `board` normalisation, 400→422 | route-shadowing caught by an existing guard |
| `blob.Client.Delete` + `cmd/assetreap` | dry-run default proven live; SDK idempotence probed, not assumed |
| First CI this repo has had | 1464 pass, 0 skips, 0 races, every command executed locally |
| `scopeFor` breadth-key consistency + AST guard | 5 sites; 2 fixed by one worker, 2 by another, 1 pinned |
| `markAssetReady` breadth bug | **a shipped upload path was uncompletable** |
| Skip-marker coverage | both gates removed at the cause, not marked |
| Pagination on 13 remaining listings | `page` object, same idiom, mutation-proven |
| **Reach-and-write made atomic: all 16 scoped deletes** | predicate folded into the DELETE; `n == 0` answers both "no such row" and "not yours", preserving 404-never-403 |

**The delete fold, in detail**, because it was the largest single change. `deleteScoped` previously checked
reachability and then mutated in a **second statement**, so a row could leave the caller's scope between
the two and the delete would still land — sixteen times over. The scope predicate now lives inside the
`DELETE` itself and the separate reach call is gone. Four of the sixteen needed their scope exported from
`internal/data/{person,staff,teacher,guardian}`, where it had lived inside `ForViewer` as a switch rather
than as a value; `ForViewer` now consumes that same exported predicate, so there is **one expression with
two callers** rather than a copy on each path that could drift silently. `deleteAfterReachCheck` has no
callers left and was deleted — a helper kept "just in case" is how the old shape returns — and the new
closure type means a seventeenth site cannot join the old shape without failing to compile.

**Still open by decision, not oversight:** the 17 update-shaped handlers carry the same race. They cannot
collapse into a helper, because ent returns a count rather than the row, so each needs `n == 0 -> 404`
plus a re-read to answer with the row. That is a change to every write path in the codebase and it was
deliberately not made during a wind-up.

**The pattern of the day: every significant find came from a worker questioning its brief rather than
executing it.** The list this pass started from was wrong in three places — the CAS entity count by 36,
the handler count by nearly 3x, and two "still to do" sections already done. Two items I dispatched as
defects turned out to be correct as they were, and refusing them was the right answer. The
`markAssetReady` bug was found by following up a consistency observation a worker made in passing while
doing an unrelated task.

**Four times the test was the problem rather than the code:** a harness assuming it owned a shared
queue; a skip-check that would have passed on a suite that skipped everything; a test file with its own
private gate that neither check reached; and fixture drivers that never evaluate `WHERE`, which is why a
broken authorization predicate survived in a shipped endpoint.

## Handed to the retrieval engine, 2026-09-09

The complete engine-side scope below — items 1, 2, 3, 7, 8 of "what remains", plus all of Phase 3.5 —
was conveyed to the `lms-retrieval-engine` session with an instruction to **plan and save, not
implement**. They are on `fix/audit-findings` with an already-dirty tree and existing
`CAS-CHANGES-REQUIRED.md` / `INGEST-PARITY-AND-CAS-PLAN.md`, so the brief asks them to diff the plan
against their reality and to state deployed-versus-written separately.

Three things were put to them as risks rather than tasks: the incompatible tenancy models (our physical
per-school isolation against their logical filter, where content crossing inherits the weaker promise);
that the deployed boundary is still the unsigned `X-School-Id`; and the open proto question — **does the
JWT carry the section, or does the engine resolve the token against emerge-core?** A section claim would
put school vocabulary inside CAS and break the domain-agnostic invariant. That decision is Akarsh's; the
engine was asked for a recommendation, not a choice.

**Their plan landed the same day: `D:\lms-retrieval-engine\docs\PLAN-EMERGE-CORE-INTEGRATION.md`.**
Nothing implemented, nothing committed, as instructed. It opens with a deployed-versus-written table and
a corrections section, because the diff-against-reality found **five** of our claims stale — all five
verified here and folded into this document and the phase plan.

**One finding from that exchange changes a cost we had assumed away.** Asked what a `restricted_to`
stamp costs to change later, they found `RetrievalEngine.update_document_metadata` — which makes a
re-stamp metadata-only with no re-embedding — is **called by nothing**. Verified here. So today a school
re-organising sections (9A splits, a teacher moves, a cohort rolls over) means **re-ingesting every
affected document**, which is the exact cost that capability was built and sequenced first to avoid. It
is now their Task H. Wired, a re-org should cost `O(chunks in affected documents)` metadata writes and
zero embedding work — roughly 3,750 updates for a 50-document school, seconds against minutes.

The asymmetry is the operational point: **if re-stamping is expensive in practice, people avoid it, and
stale labels persist** — which is the failure the gate exists to prevent. Two related decisions came out
of it: emerge-core triggers re-stamps (the engine has no vocabulary for enrolment and must never parse a
label, or it would invent a grant nobody issued), and a read-only **reconciliation report** — which
stamps name labels no current caller can hold — is cheaper than preventing the drift and answers "did
the re-org leave orphans" in one command.

Their sequencing: pgvector visibility first (small, and it removes a silent-fallback trap), with
ingesting one real PYQ raised in priority alongside it — because every per-school path in the engine is
currently exercised only by fixtures, and a real document under a real school id is the cheapest way to
start eroding that. Then the resolver, then the asserter credential. Postgres last and planned
separately: one database per school is the correct end state but is a rewrite wearing a migration's
clothes.

## Decisions waiting on Akarsh, not on code

- **The `cms` CAS re-grant.** The `cms` group holds "Users Create" with `scope_id` NULL, containing a
  `cas.users.create` policy, which per CAS's `ScopeRootsForUser` makes **every member of `cms` a global
  CAS admin** in production. Found and deliberately left open. Longest-open item.
- **Outbox retention** — a privacy decision about children's contact data, not a performance one.
- **Whether to mint `*_all` breadth keys for `rooms` and `calendar`** — and for the five structure areas
  in `REMAINING-PLAN.md` F13, which is the same decision. Today those routes borrow
  `TimetableReadAll`/`TimetableWriteAll`, which is honest but coarse.
- `schools.email` nullable as the fallback reply path; service-to-service rate-limit exemption; §4.1 of
  the access design vs the code on subject teachers and grade-wide documents.

*Closed since this list was written:* `DPS-NGP1`, whose migrations silently SKIPped for want of an active
postgres profile, **is gone** — `REMAINING-PLAN.md` D10 records it and `QA-TEN-CA5F7190` as deleted with
zero dependent rows, and `migrate status` now lists DPS-NGP alone with no skips.

## Verification state

Build, vet, gofmt and the comment scan clean. Migrations up to date on both planes — control 4, tenant 5
for DPS-NGP — with **no drift**: a follow-up diff reports "no changes".

**Re-run 2026-09-23 on the current tree**, and the numbers have moved:

- `go run ./cmd/migrate status` → `control up to date (4 applied)`, `tenant DPS-NGP up to date
  (8 applied)`. Tenant was 5 when this section was written and 6 when `REMAINING-PLAN.md` was; the two
  timetable migrations account for the difference. **DPS-NGP is the only tenant listed** — the skipping
  orphans are gone.
- `TEST_REQUIRE_TENANT_DB=1 go test ./... -count=1` → **19 packages green, 0 failures, 0 skips**, exit 0.
  The count was 16 here and 18 in `REMAINING-PLAN.md`; `internal/service/timetable` is the new one and
  the rest is drift in how the count was taken. The env flag matters: it turns a silent
  "no tenant database, skipping" into a failure, so exit 0 means the tenant-backed tests **ran** rather
  than that they were absent.
- `CGO_ENABLED=1 CC=gcc go test ./... -race -count=1` → **19 packages, 0 races, exit 0.**

**Known open: the full suite fails roughly once in forty, on a settled tree, cause unknown.** The
sharpest observation so far, from an independent run on 2026-09-09: the failing test was
`TestOneSchoolsBlackHoledServerDoesNotHoldUpAnother` and the error was **`outbox_message not found`** —
that is, the row had been **deleted**, not a masked `25P02`. Six subsequent runs were clean. The same
test is the one that leaks fixture schools when `t.Cleanup` is skipped, and the only one with a
deliberately hanging server and a worker still in flight at teardown. Those are facts that connect;
**no mechanism is asserted here** — three explanations for this failure have already been offered and
none demonstrated.

Four further facts arrived after that sighting, and they should travel together, because two narrow the
search and two widen it.

*It may be two failures, not one.* The emerge-core sighting named a single test
(`TestOneSchoolsBlackHoledServerDoesNotHoldUpAnother`); the earlier one-off named **three different**
tests (`ARetryableRejection`, `ALapsedLease`, `ThePlatformFallback`). It is not established that these
are the same phenomenon. If they are not, the "~1 in 40" rate is **two things being counted as one**,
and any single explanation for it is wrong by construction.

*The `TestMain` sweep cannot be the original cause.* The rare failure was first seen in a three-run loop
**before `TestMain` existed** — the sweep was added later, after the leak discovery, which came after
that failure. So "the sweep did it" is already falsified as an origin story, whatever it may contribute
to later sightings.

*But the sweep has a real failure mode of exactly the observed shape.* It deletes **every** `MAILT-`
school and cascades their outbox rows, bracketing `m.Run()`. Within one process that is safe. **Across
two overlapping `go test` invocations of this package it is not**: one process's opening sweep deletes
the other's live fixtures, and the symptom of that is precisely `outbox_message not found`.

*And the emerge-core sighting occurred during exactly that condition.* The mail package's files were
being written at 20:13:45 and 20:15:36 while the `-race` run that produced the failure was executing
between roughly 20:14 and 20:20 — that is, two sessions were running this package's tests concurrently.
**That is a timing fact, deliberately not a conclusion.** It fits better than anything previously
offered, which is exactly why it should be tested rather than adopted; the last two explanations also
fit, and neither survived.

**The discriminating experiment was run (2026-09-09, 6 processes in 3 concurrent pairs), and it found
something other than what it was looking for.**

Deliberate concurrency breaks this package **every time** — all three pairs, both processes each time,
2-4 failures apiece. But it produced **zero** `outbox_message not found`. The observed symptoms were
instead `status = sending, want sent`, `sender_kind = <nil>, want school_smtp`, and "the school with its
own server is sending, want sent".

Those all point at one mechanism, and it is **not** the sweep: **cross-process claim stealing.** Each
test process runs a `Sender` against the same control plane, and a scan claims any claimable row —
including the *other process's* fixtures. Process A's message is claimed and worked by process B's
sender, so from A's view it is stuck at `sending` with no `sender_kind`. Deletion is not involved.

**And the sender is not misbehaving — this is it working exactly as specified.** Constraint 5 was "two
senders must never take the same row", and they never did: the conditional claim held, one process won
each row, the lease worked, nothing was double-sent. **Two independent senders draining one shared queue
is the design.** What is actually wrong is the *tests'* assumption that a test process owns the queue —
an assumption that is invisible precisely because it is true whenever only one process runs.

That relocates the fix, and the relocation is the important part: **nothing in `sender.go` should
change.** `scan()` claims any claimable row deliberately, and narrowing it so the tests pass would be
putting test isolation into the product — the exact mistake either of us would flag in review. The bug is
in the harness's assumption, not in the thing the harness is testing.

**What this does and does not establish.** It establishes a genuine, previously unnoticed defect: the
mail tests are unsafe to run concurrently with another invocation of themselves, for a reason
independent of the `TestMain` sweep and predating it. It also explains why
`TestAnIdleTickIsStillAnnounced` needs its conditional skip at all — "the shared control plane had
claimable mail" is precisely another process's queue.

It does **not** refute the concurrent-sweep explanation for the `not found` sighting, and reading it that
way would be a mistake. The sweep fires only at process start and end — a narrow window — while claim
stealing runs continuously. So `not found` would be far rarer than `sending` under concurrency, and its
absence from six runs is what you would expect **even if the sweep hypothesis were true**. The
experiment was not powered to kill it.

Two mitigations are described and **neither is built.**

*A per-process prefix* — `MAILT-<8 hex>` generated once in `TestMain` — so a sweep can only delete its
own process's rows. Keeps the self-healing property for aborted runs; leftovers from a genuinely dead
process then need a manual prefix sweep.

*A Postgres advisory lock* taken in `TestMain` for the duration of the package run, so a second
concurrent invocation **waits** rather than interfering. This is the better of the two: it fixes claim
stealing and the sweep hazard **together, in one place, with no product change and no prefix scheme**.
The trade is that a crashed process releases the lock only when its connection drops, and two people
running tests at once serialise rather than parallelise — both acceptable for a package that already
requires a shared live control plane.

**One further hypothesis, explicitly unconfirmed.** The earlier unexplained one-off named
`ARetryableRejection`, `ALapsedLease` and `ThePlatformFallback` — three tests that all assert on
**post-delivery row state**, which is the same symptom shape as the claim-stealing failures above. Those
messages were never captured, so this cannot be checked. If it holds, that one-off was claim stealing,
the `not found` sighting remains a separate thing, and "~1 in 40" was two phenomena counted as one
exactly as suspected — leaving the deletion as the only residual mystery. It names
mail tests and not always the same ones, and thirty deliberate reproduction attempts failed. Do not read
a green run as proof the suite is deterministic, and do not record this as resolved — it has recurred
since the change that was believed to fix it. The mail fixture now records the **first** failing
statement and its cause on the error path, so if it recurs it will name itself rather than presenting as
a wall of `25P02`.

Historical caveat, and the reason that diagnostic exists: `internal/service/mail` was, until 2026-09-09,
the only package whose tests used long-lived uncommitted transactions, and it collided with
`internal/transport/http`, which commits `School.Create`/`DeleteOneID` against the same live control
plane across the `outbox_messages.school_id` foreign key. It produced intermittent `SQLSTATE 25P02`
failures that appeared only when those packages overlapped. The harness now uses committed fixtures with
`t.Cleanup` deletes, matching every other package, which took the failure rate from **consistent** to
about **one in forty**. The FK-lock mechanism was never demonstrated — it is a plausible hypothesis that
motivated a change that helped, not an established root cause. See DESIGN-NOTES for the full separation
of what was measured from what was inferred, and for why neither "a peer was editing the tree" nor the
FK story should be treated as closing this.

Everything is **local and uncommitted** by standing instruction.

**Corrected 2026-09-23: that is no longer true of everything.** The library, curriculum and
retrieval-engine bridge was committed on 2026-09-22 as `f87d94c`, so the sentence above describes the
state at the time it was written, not now. What is currently uncommitted is the timetable, attendance and
rooms work — both migrations, the six ent schemas and their generated packages, the two access
predicates, `internal/service/timetable/`, `timetable.go` and `attendance.go` in the transport layer, and
the modified `server.go`, `entities.go`, `catalog.go` and `viewer.go`. Read a claim about the tree's
cleanliness as dated, and check `git status` rather than this paragraph.

**`go test -race` runs after all — the earlier claim that it could not was wrong.** gcc is present but
off `PATH` (`C:\msys64\mingw64in`, MSYS2 GCC 14.2.0); a single `command -v gcc` produced the false
conclusion, which then stood for most of a day. Run it as:

    export PATH="/c/msys64/mingw64/bin:$PATH"
    CGO_ENABLED=1 CC=gcc go test ./... -race

All sixteen packages were race-clean when that was written, and the mail sender's worker fan-out, breaker
maps, stats and identity cache are exercised concurrently rather than verified by inspection. The
detector was confirmed capable of firing on that path by removing a lock deliberately and watching it
report at the exact line.

**Re-run 2026-09-23: 19 packages, 0 races, exit 0** — the timetable and attendance work did not introduce
one. Note that the deliberate-firing check above has **not** been repeated for the new packages, so
"race-clean" there means the detector reported nothing, not that it was proven able to report.
