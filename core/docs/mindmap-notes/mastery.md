# Mind maps: mastery

Written 2026-10-02. This is phase 4 of `docs/MINDMAP-INTEGRATION-PLAN.md`: one table, three keys,
two routes, and the storing half of the grade route. It builds on `read-path.md` and does not repeat
it. The code carries no comments; this file is where the reasoning lives.

## What was built

```
GET  /learning/mindmaps/{item_id}/chapters/{section_id}/mastery     ?student_id=
PUT  /learning/mindmaps/{item_id}/chapters/{section_id}/mastery     {"states":{node_id:"read"}}
POST /learning/mindmaps/{item_id}/chapters/{section_id}/drill/grade  (now also records)
```

| Piece | Where |
|---|---|
| Table and its checks | `internal/ent/schema/conceptmastery.go`, `migrations/tenant/20261002021627_add_concept_mastery.sql` |
| Keys | `internal/authorization/entities.go` (`ConceptMasteryRead`, `ConceptMasteryReadAll`, `ConceptMasteryWrite`) |
| Row predicates | `internal/data/access/mastery.go` |
| Routes, seat resolution, the upsert | `internal/transport/http/mindmapmastery.go` |
| The grade hook | `gradeMindmapDrill` in `internal/transport/http/mindmapproxy.go` |
| Structure digest, cached | `internal/service/mindmap/structure.go`, `PublishedDocument.StructureDigest` in `internal/service/indexing/client.go` |
| Wiring | `cmd/api/main.go` (`newMasteryStructures`, `transport.UseMasteryStructures`), `mountLearning` |

Both mastery bodies are the same shape:

```
{"section_id", "content_item_id", "student_id", "tracked", "states": {node_id: state}}
```

`states` is always an object. `student_id` is null when nobody is tracked and no pupil was named.

## The table

`concept_mastery`, in the tenant plane, with no `school_id`.

- Unique on `(student_id, academic_session_id, content_item_id, node_id)`. The chapter is not in the
  key: a node belongs to one chapter, and a key that included the chapter would let one node carry
  two states.
- `student_id` and `academic_session_id` are immutable. `ON DELETE CASCADE` from the student, so the
  rows go when the student goes.
- **`ON DELETE CASCADE` from the book as well, and that was a choice.** `DELETE /library/{id}` is a
  hard delete. With the default `NO ACTION` a book that any pupil had opened could no longer be
  deleted, the refusal would be the generic 409 about a referenced row, and the teacher would have
  no route to clear the blocker because this cut has no delete route for mastery. A pupil reading
  must not make a book undeletable. The cost is that deleting a book discards what was learned from
  it; that is the same thing as discarding the book.
- `academic_sessions` stays `NO ACTION`, as every other session-scoped table here does.
- Three CHECK constraints: `state` is one of the four, `score` is null or within 0 and 1, `attempts`
  is not negative. ent's enum and range validators emit no DDL, and the upsert builds its `state`
  with a SQL expression rather than through a validated setter, so the database is the only thing
  that would notice a fifth state.
- `engine_section_id` and `node_id` are strings exactly as the engine named them when the row was
  written. Neither is a durable key: both re-mint when a book is re-ingested after a rename.

The migration is one `CREATE TABLE` and three `CREATE INDEX`. It touches no existing table and is
undone by dropping the table.

## Who is "tracked"

A viewer is tracked when one of their own student records has an **active enrolment in a session
marked current**. `masterySeatOf` asks exactly that and returns the pair `(student, session)` that
every row is filed under. When a person holds more than one such enrolment the earliest created is
used, deterministically; nothing in this server lets a caller pick, and a mastery write is not the
place to add that choice.

An untracked viewer is answered, not refused: `tracked: false`, empty `states`, and a PUT or a grade
that stores nothing. A teacher previewing a map is the ordinary case.

## The order of checks

Read (`GET`):

1. Switched on, or 503.
2. `core.concept_mastery.read` then `core.mindmaps.read`, in the route middleware, in that order so
   the 403 names the mastery key.
3. The field policy on the read key: `node_id` and `state` must both be permitted, or 403.
4. With `student_id`: the pupil must be within the caller's reach, or 404. The body is identical for
   a pupil who is out of reach and one who does not exist.
5. The seat, then the rows, under `access.ConceptMasteryFor`.
6. The book and the chapter, by `mindmapChapterFor`: library key, `LibraryItemsFor`, engine document,
   slug, and the section-membership check.

Step 5 runs before step 6 on purpose. Step 6 ends in an outbound call, and every database statement
of a read is finished before it. The rows are loaded for a book that has not been checked yet and
are simply not answered if the check fails.

Write (`PUT`): the body is validated first, so a non-`read` state is a 422 before the database or
the mind-map service is touched. Then the write key and the seat, the per-chapter row count, the
book and chapter check, the structure digest, one `INSERT`, one read-back.

Grade (`POST`): everything the read path already did, plus the write key and the seat resolved
before the chapter check. After the mind-map service answers 200 with JSON: the digest, then one
`INSERT`.

## Decisions

### Two gates on a named pupil, and what each mutation shows

`GET ?student_id=` is guarded twice. `masteryReaders` asks whether the pupil is within the caller's
reach (`access.StudentsForAcademic`), which is where the 404 comes from. The rows are then read
under `access.ConceptMasteryFor`, which is `HasStudentWith` over the same student predicate.

The second gate is redundant today and is kept anyway: it is what stands between a caller and
another pupil's rows if the seat resolution is ever changed. Because of the redundancy a single
mutation behaves differently at the two levels, and both were run:

| Mutation | Result |
|---|---|
| `ConceptMasteryFor` returns everything | `TestConceptMasteryForAdmitsOnlyTheRowsOfPupilsTheViewerReaches` fails on four of five viewers: the predicate returns the classmate's and the outsider's rows. The handler tests still pass, because the reach gate refused first. |
| The handler's reach gate opened, predicate intact | Two handler tests fail on the lost 404s; no row leaks, the predicate filtered them. |
| Both | The handler answers a classmate's states with a 200; three tests fail. |

Rejected: a single gate. Dropping the reach check would turn the route into an oracle for whether a
student id exists and is enrolled. Dropping the predicate from the row query would leave one line
between a refactor and a leak.

### The write key does not say whose row

The write path takes no `student_id`. The learner is `access.MasteryLearners`: the caller's own
student records, narrowed by any row pin on the grant. `reach` on the write key is not read, and an
unrestricted viewer gets no wider: nobody records mastery for somebody else. A `student_id` on a
PUT is a 400 as an unknown parameter and a 400 as an unknown body field.

### Rise-only is one SQL expression

`read < missed < shaky < known`. The grade upsert is a single multi-row
`INSERT ... ON CONFLICT (student, session, item, node) DO UPDATE` whose `state` is

```
CASE WHEN rank(excluded.state) > rank(concept_mastery.state)
     THEN excluded.state ELSE concept_mastery.state END
```

so the comparison happens inside the statement that holds the row lock. A read-then-write in Go
would lose under two concurrent grades. `attempts` is `attempts + 1`; `score`, `last_attempt_at`,
`engine_section_id` and the digest take the new values, so a row whose state did not rise still
records that the attempt happened and what it scored.

**`state` and `score` answer different questions, deliberately, so a row can read `state = known`
with `score = 0`:** `state` is the best the pupil has ever shown on the node and only rises, `score`
is what the latest attempt scored and moves both ways.

A `read` mark is `ON CONFLICT DO NOTHING`. `read` is the floor, so a mark never changes a row that
exists, and it is not an attempt.

Rows in one statement are sorted by node id. Two grades that touch the same nodes therefore take
their row locks in the same order and cannot deadlock.

Mutation-tested: with the `CASE` replaced by `excluded.state`,
`TestMasteryFromPostgresRecordsAGradeAndOnlyEverRaisesIt` fails ("a later, lower grade overwrote
known with missed") and so does `TestConcurrentGradesKeepOneRowPerNode`.

### Scores to states

`1` is `known`, `0.5` is `shaky`, `0` is `missed`, as the contract says. The code reads it as
thresholds: at least 1 is `known`, above 0 is `shaky`, otherwise `missed`. The mind-map service
only produces the three values today; if it ever grades more finely, partial credit is `shaky`
rather than an unrecorded attempt. The stored score is clamped to 0..1.

### A skipped answer is not a miss

The mind-map service grades every item in the drill. An item the pupil never answered comes back
`verdict: incorrect` with a node score of 0, exactly like a wrong answer. Recorded as it stands, a
skip would store `missed`, and under the rise-only rule it would even move a node from `read` up to
`missed`. The interface promises that a skip is not a mistake.

So two things are read out of the grade body, and nothing else: `node_scores`, and from each entry
of `results` its `node_id`, `given` and `verdict`.

- **A node is recorded only when at least one of its items carries a non-empty `given`**, after
  trimming. No answered item, no row: not `missed`, not an attempt, and an existing row is not
  touched.
- **When every item of a node was answered, the score is the service's own `node_scores` value.**
- **When a node has both an answered and a skipped item, the answered one decides.** The service
  keeps one number per node and the last item wins, so that number may be the skipped item's zero.
  In that case, and only then, the score is taken from the last answered item's `verdict`:
  `correct` 1, `partial` 0.5, `incorrect` 0. A verdict this server does not know records nothing.
- A node with a score and no result at all records nothing. There is no evidence it was answered.
  This is the side to fail on: if the service ever stopped sending `results`, mastery would stop
  being recorded, which is visible, rather than every blank being recorded as a miss, which is not.
- **If every item was skipped, no write is attempted and `X-Mastery-Recorded` is absent.** The
  header says a write was attempted, not that a drill was graded.

A body with neither, or with something else under those names, records nothing and is still
relayed. The rest of the result is not modelled here. The fixtures are the grade bodies captured
from the real service (`internal/transport/http/testdata/mindmap/`).

Mutation-tested: with the answered check removed, `TestMasteryFromPostgresDoesNotRecordASkippedAnswerAsMissed`
fails ("a node the pupil had read and then left blank was raised"), and so do three unit tests, one
of them over the captured bodies.

### What the caller sees when recording fails

The grade is answered **200 with the upstream body unchanged**, and the failure is logged.

- The grade is the mind-map service's answer and it is correct whether or not this server managed
  to store it. Turning it into a 5xx would withhold a result the pupil earned because of a fault
  that is not theirs.
- Nothing is lost that cannot be redone: a drill is rebuilt from `kind`, `n` and `seed`, so sending
  the same attempt again grades the same and records it.
- The frontend refetches mastery after grading, so it shows what is actually stored.

So that the outcome is not silent, the response carries `X-Mastery-Recorded: true` or `false`. The
header is present only when a write was attempted: absent for an untracked viewer, a viewer without
the write key, a grade with no node scores, or a drill in which every item was left blank. It is
additive and outside the contract's body.

Tested by deleting the book while the drill is being graded, which makes the insert fail on its
foreign key: `TestMasteryFromPostgresStillAnswersAGradeItCouldNotRecord`.

Rejected: a 502 or 500 on a failed write; adding a field to the grade body (the contract says the
body is the upstream's, unchanged).

### The structure digest

Each write records the document's `structure_digest` and chunk count from the engine's
`GET /documents/{id}/digest`. A stored node id goes stale silently on re-ingest; a moved digest is
what says so. Per the plan, a moved digest means "the stored structure differs from when this row
was written" and nothing more. Nothing in this phase reads it, hides a row by it, or deletes one.

- The engine computes that digest by hashing every chunk and vector of the book under a lock. A
  pupil marks a node as read on every click. So `mindmap.Structures` caches per (slug, document):
  60 seconds for a digest, 10 for a failure, 512 entries, and a 3 second ceiling on the call.
- A cached digest can only be older than the truth. A row written just after a re-ingest may carry
  the previous digest and later read as "unverified" when it is in fact current. That is the safe
  direction; the opposite cannot happen.
- No client, a failed call, a hidden document or an engine that serves no `structure_digest` all
  store NULL, and the mastery is still recorded. A chunk count is not kept without a digest: on its
  own it verifies nothing.
- When a grade updates an existing row and the digest cannot be had, the row's digest becomes NULL.
  The row was just re-confirmed against a structure this server could not name, so the old digest
  would be a claim about the wrong moment.
- The engine call uses the admin token of the indexing client. Without
  `RETRIEVAL_ENGINE_ADMIN_TOKEN` the engine hides a gated book from it and the digest is NULL;
  boot logs a warning.

### Database work and outbound calls

No transaction is opened; `TestMindmapHandlersNeverOpenATransaction` covers the new files because
they match `mindmap*.go`.

- A read finishes every statement before the first outbound call.
- A write cannot: the row may only be filed after the chapter check and the grade, which are
  outbound. The rule kept is that **no statement is in flight during an outbound call and every
  write comes after the last one**: reads, then the mind-map service, then the engine digest, then
  the insert. Tests record the write count at each call to the fake service and at the digest call
  and require zero.

### Bounds

- One PUT marks at most 500 nodes; node ids are at most 255 characters.
- A PUT is refused with a 422 when the chapter already holds 5000 rows for the pupil. Node ids on a
  PUT come from the client and are not checked against the map, which would cost a compile per
  click, so without a cap a pupil could grow their own rows without limit. Sections are bounded by
  the membership check and books by the library.
- A read returns at most 5000 rows for one chapter.

### Refusals are pre-checks

Under `testsupport.TenantTx` a handler-side rollback is a no-op, so nothing here writes and then
undoes. The 422 for a non-`read` state, the 400s, the 403s, the row cap and the 404s all happen
before the first write.

## Tests

Real tenant database (`TenantTx`), in `internal/transport/http/mindmapmastery_test.go`:

- a pupil reads and raises only their own rows; a classmate's rows are invisible, unwritable and
  unchanged by the pupil's marks and grades;
- `student_id` for a ward, for a guardian without academic view, for a taught and an untaught pupil,
  and under `read_all`;
- an untracked viewer; a non-`read` state; a book or chapter the caller cannot open;
- a grade persists, only raises, counts attempts, keeps the latest score; no write key stores
  nothing; a failed write still answers;
- the digest is stored, asked for once, and NULL when it cannot be had;
- the per-chapter cap.

`TestConcurrentGradesKeepOneRowPerNode` is the one test here that **commits**. Two statements
cannot run concurrently inside the single rollback transaction the other tests share, so it uses a
pooled client (`testsupport.TenantPool`), seven goroutines, a person, a student, a session that is
not current and a book, and deletes them in its cleanup. Run under `-race`.

## Whether the mind-map routes can join `routeTable`

`router_test.go`'s `verbFits` allows a POST only on `create`, `write` or `generate`.

- **Joined:** the six GET routes, `GET` and `PUT .../mastery`, and `GET
  /curriculum-nodes/{id}/mindmaps`. Their first guarded key carries the verb the method implies.
- **Still outside:** `POST .../drill/grade`. Its guard is still `core.mindmaps.read`, because a
  caller without the write key must still be graded. The write key is asked inside the handler and
  its absence is not a refusal. Changing the route's guard to the write key would refuse exactly
  the callers the contract says are served; widening `verbFits` would weaken the rule for every
  other route. It stays in `mindmapRoutes()`, where each route is checked against its own first key
  and against `core.mindmaps.read`.

## What was rejected

- **A `student_id` on the write path**, and a `write_all` key.
- **A delete route or a retention job** (plan D5, still open).
- **Using the digest** to hide, flag or delete rows. Not in this phase.
- **Validating client node ids against the map.** A compile per click; bounded by the cap instead.
- **Storing the grade result** beyond state, score, attempts and time.
- **A chapter in the unique key.**

## Open

- D5, retention: rows are bounded by the session column and removed with the student or the book.
- `scripts/cas-core-roles.py` grants none of the three keys to any bundle yet (plan 5.5).
- `docs/STATUS.md` and `docs/DESIGN-NOTES.md` are not updated by this slice.
- A person with two current enrolments is tracked under the earlier one; there is no way to choose.
- `X-Mastery-Recorded` is not in the wire contract. It is additive; the BFF may drop it.
