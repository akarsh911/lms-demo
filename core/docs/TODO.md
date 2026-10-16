# Outstanding work

Decisions already taken that are not yet fully built. Ordered by what blocks
what, not by size.

---

## 1. Keep the migrations honest

Generated and applied. `migrations/control` and `migrations/tenant` each hold
an `initial` and a `cascade_owned_rows`, and the whole stack has been exercised
against real Postgres.

Two things to remember rather than rediscover:

- **`entsql.OnDelete` is silently ignored on an inverse `edge.From`.** It must
  go on the owning `edge.To`. Placed wrongly it compiles, warns about nothing,
  and emits `ON DELETE NO ACTION` — the opposite of the intent. That is how
  seven cascades were wrong at once.
- **`migrate make` replays every migration against `DEV_DATABASE_URL` and
  diffs.** Hand-editing a migration, or altering the database outside one, will
  be reverted by the next diff. The ent schema is the source of truth.

```bash
docker compose up -d control-db dev-db tenant-db
go run ./cmd/migrate make <name>
go run ./cmd/migrate apply
```

---

## 2. Remaining authorization gaps

A second adversarial pass took the count to thirteen findings. Twelve are
fixed. What is left:

- **`getSection`, `getOffering`, `getBranch`, `getSession` apply no viewer
  narrowing.** School-wide reference data rather than per-person, so it is
  defensible -- but by argument rather than by construction, which is worth
  revisiting if any of them ever carries personal data.
- **Field enforcement is still missing on several writes.** They decode with
  `response.Decode` rather than `DecodeFields`, so no field policy is
  consulted. `linkGuardianToStudent` is the notable one: `student_guardians`
  has no entity of its own, and borrowing the guardian policy for it would
  repeat exactly the mistake finding 6 was.
- **Reach and write are not atomic.** Every update and delete checks
  reachability and then mutates in a second statement. Between the two the row
  can move out of the caller's scope -- a guardian link deactivated, an
  enrolment transferred -- and the write still lands. Folding the predicate
  into the mutation (`Update().Where(id, predicate)`, `n == 0` means 404) would
  close it and drop a round trip, but each handler would then have to re-read
  the row it returns, so it is a real refactor across a dozen handlers rather
  than a rename. Worth doing before the pattern spreads further; the race
  itself is narrow.
  A test reads the entity constants out of the package with `go/ast` and
  asserts each one reaches `AllEntities`, because the two drifting apart fails
  quietly: an unregistered key is a grant nobody can hold, so it surfaces as
  people seeing less than they should and reads like a CAS misconfiguration
  rather than a missing line in a slice.
- **CAS must register 87 entity keys**: twelve `write_all` and twelve
  `delete_all` alongside the rest. Until they are registered nobody holds a
  school-wide write or delete, which fails closed and is the right way round
  to be wrong.

### Reads were narrowed; writes were not

The largest of the thirteen was that **every** mutating handler resolved by
path id alone. Reads dispatched carefully on the granted scope, and then a
`PATCH` walked straight past all of it: a guardian scoped to their own
children could withdraw any pupil in the school by guessing a UUID.

Three shapes, all now closed:

- **No row narrowing on update or delete.** Each one now asks a `reach` first,
  and a reach goes through the same query API the listing uses, so the read
  rule and the write rule cannot drift apart. An unreachable row is a **404**,
  never a 403 -- a 403 confirms the row is real, and probing by id is the
  attack the narrowing exists to stop.
- **Delete has its own breadth key.** It first borrowed `write_all`, which
  meant granting school-wide edit silently handed over school-wide deletion
  too. That is breadth arriving by omission of a key, which is the shape of
  every other bug on this list, so `delete_all` was minted rather than the
  consequence documented.
- **A caller could widen their own viewer.** `Resolve` reads
  `teacher_assignments` to decide what a teacher sees, and anyone holding
  `teacher_assignments.write` could write one. Creating a teaching assignment
  now needs the school-wide grant. Linking a guardian to a pupil is the same
  shape -- the link *is* what `StudentsOfGuardian` reads -- so the caller must
  already be able to see that child.
- **Attribution fell back to the request body.** `verified_by`,
  `author_person_id` and `assigned_by` all took the payload's word when the
  caller had no person row. A supplied value is now refused outright rather
  than overwritten, so the caller learns their claim did not stand; a nullable
  column stays null when the caller cannot be identified, and a required one
  refuses the write.

### The pattern worth remembering

Every hole found in this service was **fail-open**, and not one was caught by
the build, the unit tests or the end-to-end run -- because each returned a
*wider* answer rather than a wrong one. Nothing errored, no assertion tripped,
and the response looked entirely reasonable.

A suite that only asserts what should be visible cannot see any of them. The
tests that catch this shape assert what must **not** be visible: that a caller
with no role matches nothing, that a grant scoped to `self` does not reach the
sections the caller teaches, that an unresolvable scope denies rather than
falling back, that a write against an id the caller cannot reach is a 404.

The same reasoning closed the last one. A query parameter nobody consumed used
to be ignored, so `?studentid=` -- a typo for `student_id` -- returned the
whole page with a 200. A dropped filter and a dropped predicate fail the same
way, and both arrive looking like success.

---

## 3. Translate policy conditions into Ent predicates

**Done for row fields.** A policy can pin a grant to particular rows:

```json
{"field": "section", "operator": "=", "values": ["9A"]}
```

That becomes a predicate ANDed onto the already-authorized, already-scoped
query, so a teacher pinned to 9A sees 9A everywhere -- listings, reads by id,
and the reach check in front of every write.

`section` and `grade_level` are registered as row fields, both matched against
the `code` column. Adding another means one line in `rowFields` and one arm in
`sectionsMatching`; adding one without the arm narrows to nothing rather than
widening, which is the right way round.

Four things worth keeping:

- **A row field is not a caller attribute.** It is lifted out of the boolean
  before evaluation, exactly like `scope`. Left in, it names an attribute
  nobody supplies, `Satisfiable` skips the alternative, and pinning a teacher
  to a section silently revokes their access instead of narrowing it.
- **An untranslatable condition denies the alternative.** Not the request --
  another alternative may still admit -- but that alternative cannot admit on
  the strength of the conditions that did translate. Honouring half a policy
  widens it.
- **Only `=` and `IN` translate.** Negations are refused rather than
  approximated: CAS holds them when *every* value of a multi-valued attribute
  satisfies, and holds them vacuously when the attribute is absent, and a
  `NOT IN` across a join reproduces neither. Ordering and substring operators
  have no absent-value story at all.
- **A row field under a mixed OR is refused.** The branch it sits in may not
  be the branch that admitted, so applying the pin would filter rows the other
  branch allowed. An OR whose every leaf pins the same field is the exception:
  it collapses to the `IN` it means.

### Two policies, two sections, different fields

Every admitting alternative contributes. A caller granted 9A by one policy and
10B by another gets both: the groups are ORed, because alternatives are ORed.
Within one group the pins are ANDed, so a policy naming a section *and* a grade
level means rows in both. An alternative that pins nothing wins outright -- it
already covers everything its scope reaches, and ORed grants can only add.

**Each grant keeps its own fields.** This is the case that motivated it:

```json
{"rule": "9A in full",  "expression": {"op":"AND","children":[
  {"field":"section","operator":"=","values":["9A"]}]}},
{"rule": "9B limited", "expression": {"op":"AND","children":[
  {"field":"section","operator":"=","values":["9B"]}]},
 "fields": {"mode":"include","keys":["name","roll_number","phone"]}}
```

One response, two projections: the 9A pupils arrive whole, the 9B pupils with
three fields. The same pair on `students.write` with `keys: ["roll_number"]`
means the caller may edit anything on a 9A pupil and only the roll number on a
9B one.

- **A row no grant covers is dropped**, not shown bare. SQL already narrowed
  the result to rows some grant admits, so an uncovered row here means its
  section could not be read back -- and a row whose policy is unknown is a row
  with no policy. By id that is a 404, which is the same answer said
  differently; on a write it is a refusal.
- **Rows covered by two grants get the union of their fields**, because both
  grants genuinely cover that row. Across *different* rows the fields are never
  merged, which is the whole point.
- **Ordinary policies pay nothing.** One grant, or several agreeing on fields,
  takes the old path: `Decision.Fields` already says everything true of every
  row, and no extra query runs.
- `Decision.Fields` stays the intersection, for the domains that still project
  a whole response at once. It never shows a field some admitting grant
  withheld, so those remain correct, only blunter.

Wired for students (listing, read by id, write) and for enrolments. Extending
it to another domain is a `RowValues` lookup for that table plus the call in
its projection. Domains without one keep the intersection, which is safe and
needs no coordination.

Also still open: a pinned `*_all` grant is no longer treated as school-wide,
which is right, but it means `read_all` pinned to 9A falls back to the narrow
entity's scope rather than meaning "all of 9A". Nobody has written that policy;
it wants a decision before somebody does.

## 4. Field enforcement for the remaining domains

**Done for students.** Reads project through the admitting alternative's field
policy, so an unauthorized column never leaves the process. Writes refuse a
payload touching a field the caller may not write, naming every one of them
rather than stripping them — silently dropping a field turns a refusal into a
partial success the caller never learns about.

Two decisions worth keeping:

- `id`, `created_at` and `updated_at` always survive projection. A row whose
  id you cannot see is a row you cannot act on, and none of them is personal
  data.
- `response.DecodeFields` reports which keys the client actually **sent**,
  because a field omitted and a field set to null are different requests and a
  zero value cannot tell them apart.

Still to do: the same two calls in persons, staff, teachers, guardians and the
student sub-resources. `entX.Columns` is the registered list to pass.

## 5. Pagination

Every listing is bounded and the five reference listings that returned every
row no longer do. The primary listings return a `page` object with the window
and `has_more`, derived from whether the page came back full rather than from
a second counting query.

Still to do: the same `page` object on the reference, enrolment, assignment
and student-record listings. They are bounded, so this is about telling the
client what it got rather than about safety.

---

## 6. Filters for the remaining domains

`internal/data/filter` plus a typed `Filters` per domain now covers students,
persons, staff, teachers and guardians. The same treatment is still wanted for
sections, enrolments, subject offerings, assignments and the student
sub-resources, which still parse query parameters inline in their handlers.

The pipeline, which should not vary:

```
ParseFilters -> ForViewer -> ApplyFilters -> Paginate -> Projection
```

Filters narrow and only narrow. They are ANDed onto an already-authorized
query, so `?house_id=…` can never let a teacher out of their own sections.

---

## 7. Smaller things

- **Two JWT verifiers in the estate.** `pkg/casauth` in CAS is importable, but
  a `replace` breaks the Docker build and CI cannot authenticate to a private
  untagged repo. Ours lacks CAS's strict `kid` resolution and its refetch
  floor. Delete ours the day a release is tagged.
- **Provisioning is refused by CAS** until a `cas.v1.UserService` lands.
  `/persons/provision` and `/persons/link` answer 501 meanwhile, and the client
  is an interface so only the transport changes.

  **STALE (corrected 2026-09-16).** That sentence is about a *gRPC* service. The
  client does not use gRPC: `internal/infrastructure/cas/admin.go:92` posts to
  the REST endpoint `/v1/admin/users`, and that call was later extended to send
  `group_id` so CAS writes the user and their group membership in one
  transaction -- work done against production CAS. So the REST provisioning path
  very likely **exists and succeeds**, and `/persons/provision` may answer 201.

  `provisionPerson` returns 501 only when `provisioner.Available()` is false,
  which needs `AUTH_DISABLED=true`; with CAS configured it reaches `CreateUser`,
  and a non-2xx that is not 401/403/409 falls through to the default branch as
  **502**. So three outcomes are possible and nobody has observed which is real.

  `/persons/link` is the one clean 501: `FindUser` maps every non-2xx to
  `ErrLookupUnsupported`. That expectation is a property of **our** code and is
  verifiable by reading it; the provision expectation is a property of **CAS's**
  behaviour and is not. Those deserve different confidence.
- **`student_assignments` role vocabulary** is free text with a guard against
  teacher roles. If schools converge on a set, it could become an enum.

---

## 9. Connecting to the deployed CAS

CAS runs on the demo box, published on **loopback only** and deliberately so:
it is a sidecar other services ask about permissions, and nothing from the
internet should reach it. A local emerge-core therefore needs a tunnel.

```bash
./scripts/cas-tunnel.sh          # localhost:8071 -> box 127.0.0.1:8071
```

Verified working: `/healthz` and the JWKS answer through the tunnel, the API
boots against it, and the login relay round-trips to CAS and returns CAS's own
`invalid_credentials`. `CAS_BASE_URL` and `CAS_ISSUER` (`mentis-cas`) are set.

**Blocked on one thing: this service is not registered with CAS**, so it has no
`client_id` / `client_secret` and cannot fetch policies. The guard notices and
selects `deny-all`, which is right and says so at boot -- but it means nothing
is authorized until that is fixed. Registering needs a superadmin bearer:

```http
POST /v1/admin/services   {"key": "core", "name": "Emerge Core"}
```

and the superadmin cannot currently sign in. `CAS_SUPERADMIN_EMAIL` is **empty**
in the deployed `.env`, 2FA is on globally, so the password step answers
`no destination for channel`: there is nowhere to send the OTP. The dev
`X-Internal-Key` bypass is refused because `CAS_ENV=production`.

The fix is on the CAS side and is somebody's decision, not a detail to route
around -- set the superadmin's email and restart CAS, or add a bootstrap path
for service registration. Once the credentials exist, two lines in `.env` and
`AUTH_DISABLED=false`.

One more thing to settle at the same time: CAS sets
`CAS_TRUSTED_PROXIES=172.17.0.0/16`, the box's docker bridge. A tunnelled local
instance arrives as `127.0.0.1` and is not in that range, so every relayed
login from a developer machine shares one throttle bucket.
