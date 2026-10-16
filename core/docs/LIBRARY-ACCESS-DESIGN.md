# Library access control design: content visibility for the Library and RAG retrieval

Drafted 2026-09-08 by the access-control design agent. Design only; no code in either
repository has been changed by it. Every `file:line` was opened and read against the
working trees of `D:\emerge-core` (branch `main`, HEAD `1b91a10`) and
`D:\lms-retrieval-engine` (HEAD `f722fb8`). Where a claim could not be verified from this
machine it is marked as such.

> ## VERIFIED WRONG IN THREE PLACES — read this before §3
>
> An adversarial verification pass on 2026-09-08 applied §3.2 to a copy of the engine
> and ran the suite. Three findings, all confirmed independently by two agents:
>
> **1. The change is a no-op at the document level.** `store.document_meta`
> (`store.py:52-61`) does not emit `scope_ids` at all. So `meta.get("scope_ids")` is
> `None`, `not None` is `True`, the tenant-equality disjunct fires, and the document is
> admitted. Measured on the patched copy, same document and caller, `scope_ids=["section_9A"]`:
>
>     PATCHED chunk admitted to same-school caller with no labels : False   (restricted)
>     PATCHED DOC   admitted to same-school caller with no labels : True    (NOT restricted)
>
> Thirteen call sites gate on `document_meta`, including **`GET /documents/{id}/page/{page}`
> (`api.py:3247`), which serves verbatim page text**. A 9B teacher who knows the document id
> reads all of 9A's note. §5's claim that such a caller "gets nothing emerge-core owns" is
> **false**. The string `document_meta` appears zero times in this document.
>
> **Fix:** add `"scope_ids": doc.scope_ids` to `store.document_meta`, and give `_visible`
> (`api.py:437-440`, which hard-codes `build_filter(tenant_id=tenant)`) a scopes parameter —
> both in the same commit as §3.2. Neither is in §3's change list or §8's E1 criteria.
>
> **2. The inertness argument in §3.4 is worthless as written.** It is true but vacuous:
> every document on the box is `scope="global"` / `tenant_id="_global"`, so the disjunct
> being changed never fires for any document that exists. "Provably inert on today's corpus"
> is therefore the same statement as "the corpus cannot distinguish this change from deleting
> the disjunct entirely". It is evidence of nothing.
>
> **3. The change breaks 23 of 65 existing tests**, three of which assert the old polarity as
> an invariant. §3.5's claim that the differential "already accepts" old-ADMITS/new-REFUSES is
> wrong. Those tests are a deliberate contract and must be renegotiated with the engine's
> owners, not silently updated.
>
> Sections 4 through 9 were not invalidated by this pass. §3 must not be implemented as
> written.

## A correction to the build plan, stated first

The build plan recorded that the 9A/9B mechanism already existed in the retrieval engine
and needed only wiring. That is wrong, and the next reader of the plan should not carry it
forward.

The engine's hard boundary at `D:\lms-retrieval-engine\retrieval_engine\scope.py:232-238`
is an OR-chain:

    all_tenants
    OR scope == "global"
    OR meta.tenant_id == caller.tenant_id
    OR scope in extra_scopes
    OR (visible_scopes admits scope_ids)

Because the clauses are ORed, the third one admits every document owned by a school to
every caller who presents that school's `X-School-Id`, whatever they hold. `scope_ids`
sits in the fifth clause and can therefore only ADD readers on top of the whole school; it
cannot remove the school's own users from a document. The engine's own design says this
as a feature: "the new clause can only ADD, never subtract"
(`D:\lms-retrieval-engine\docs\PHASE-SCOPE-ISOLATION-DESIGN.md`, section 1, property 3).

The user's requirement is that a 9A teacher must not see 9B's notes when both are in one
school. That is restriction WITHIN a tenant, which the boundary as written cannot express.
Wiring the engine's Phase SI tasks T0-T6 to the letter ships the requirement unmet with
every happy-path test green. What is needed is a semantic change to one disjunct of the
boundary, specified verbatim in section 3, plus the wiring. The change is inert for every
document on the box today.

---

## 0. Verified facts the design rests on

### emerge-core

- A decision carries `Reach` (tenant, self, guardian_ward, teacher_assignment),
  `Constraints` (OR-of-AND groups over the `section` and `grade_level` row fields) and a
  field policy: `D:\emerge-core\internal\authorization\authorization.go:86-99`.
- `access.Viewer` is resolved per request from the tenant database. `SectionIDs` are the
  sections where the caller is `class_teacher_id` or holds an assignment whose
  `subject_offering_id` is null; `SubjectOfferingIDs` are the assignments with an
  offering. Current session and `status=active` only:
  `D:\emerge-core\internal\data\access\viewer.go:95-141`.
- Every predicate builder returns a usable predicate and denies in its default arm, so
  there is no second return value a caller can forget to check:
  `D:\emerge-core\internal\data\access\predicate.go:82-110`.
- A pin that cannot be translated narrows to nothing rather than being dropped:
  `D:\emerge-core\internal\data\access\constraint.go:26-58`. A row that cannot answer a
  pinned field is not covered by that grant:
  `D:\emerge-core\internal\authorization\constraint.go:237-245`.
- The policy cache is keyed by `(user, cas_tenant)` with a 60 second TTL, and serves a
  stale set for up to twice the TTL when the fetch fails:
  `D:\emerge-core\internal\infrastructure\cas\policies.go:88-104`.
- `scopeFor(narrow, wide)` with `wide == narrow` makes every caller unrestricted:
  `D:\emerge-core\internal\transport\http\viewer.go:20-24`.
- A `SubjectOffering` is (session, section, subject): `D:\emerge-core\internal\ent\schema\subject.go`.
  `Subject` itself has no edge to `Section`. A section is immutable in
  `academic_session_id` and `grade_level_id`: `D:\emerge-core\internal\ent\schema\academic.go:111-113`.
- Attribution comes from the token, never the body: `D:\emerge-core\internal\transport\http\reach.go:117-147`.

### lms-retrieval-engine

- The hard boundary is the OR-chain quoted above, `scope.py:232-238`. pgvector compiles
  the same chain: `D:\lms-retrieval-engine\retrieval_engine\vector_store.py:271-276`.
- `visible_scopes` and `scope_ids` are unwired. There are zero occurrences of either in
  `api.py`. `retrieve` and `coverage` call `build_filter` without them
  (`retriever.py:308-320` and `:595`); only `list_books` threads them
  (`retriever.py:801,839`) and nothing supplies them. No ingest path stamps `scope_ids`.
  `DocEdit` has no `scope_ids` field, so a document's audience cannot be changed after
  upload. `identity.py`, which Phase SI names as the single producer, does not exist.
- The filter is applied inside both first-stage indexes before ranking
  (`sparse_index.py:61-62`, `vector_store.py:71`), and BM25 normalises over the
  survivors. The correct shape exists; the input does not.
- `_scopes_admit` is segment-boundary prefix containment on `.` (`scope.py:79-98`). It
  does not AND with `tenant_id` (`scope.py:101-115`).
- `_validated_scope_ids` applies the 32-entry per-document bound to the caller's held set
  as well (`scope.py:400-403`).
- `scope.py:130-138` says of `visible_scopes`: "THIS IS A FILTER, NOT A BOUNDARY ... The
  set is supplied by the CALLER ... nothing here verifies that they hold any of them."
- `X-School-Id` is an unsigned header and the engine says so in its own source
  (`api.py:367-370`). The engine has no per-user identity, no token verification and no
  auth middleware; only the tenant header and a shared admin secret.
- Admin (`X-Admin-Token`) bypasses `_visible` for every listing (`api.py:440`) and is
  the gate for `all_tenants` (`scope.py:496-500`).
- `build_vector_index` falls back silently to `InMemoryVectorIndex` when Postgres cannot
  be reached (`vector_store.py:208-214`, and the engine's own CLAUDE.md, gotcha 1).
  `PgVectorIndex` has never executed against a live Postgres (`vector_store.py:136-142`),
  and its `upsert` does not update facet columns on conflict (Phase SI, section 5.2).
- `Document.scope == "global"` means readable by every tenant on the box; ingest maps the
  word "global" to the reserved owner `_global` (`api.py:461-466`).
- `Document.scope_ids` and `Chunk.scope_ids` exist on the models with the invariant
  `chunk.scope_ids == doc.scope_ids` (`models.py:198`, `:364`), and `Chunk.metadata()`
  emits the key (`models.py:402`).
- OCR and audio/video ingest have no chapter concept: there are no references to a
  section id in `ocr_ingest.py` or `av_ingest.py`. A scanned note or a video yields a root
  and at most a fallback chapter.
- Naming: the engine's `section_id` and `section_ids` mean a chapter of a book (a ToC
  node), and `roles.py` classifies chunks pedagogically (exercise, definition, example).
  Neither has anything to do with 9A or with access. This document uses "audience" and
  "reach" throughout, and never "section" unqualified when speaking of the engine.

---

## 1. Two independent axes, and the trap

A content item has two settings that share a vocabulary and nothing else.

| Axis | Question it answers | Values | Owner |
|---|---|---|---|
| Curriculum placement | What is this content about? | a chapter or topic of a `Subject`, or unbound (the user's "global": a textbook) | the curriculum model; a nullable FK to the curriculum node on `content_items`, or a binding row that model defines |
| Audience (visibility) | Who may read it? | the whole school, one grade, one section, one subject offering, its author | this design; `content_items.audience` plus one FK |

A textbook is curriculum-unbound and school-visible. A 9A note is curriculum-bound
(Physics chapter 5) and section-visible (9A). Every combination is legal, including a
school-wide item bound to one chapter (a shared worksheet) and a teacher's private draft
bound to nothing.

### 1.1 Why placement can never be the scoping predicate

Curriculum reaches `Subject`. `Subject` has no path to a section or an offering
(`subject.go`). The `Viewer` narrows by `SectionIDs` and `SubjectOfferingIDs`
(`viewer.go:20-29`). So "Physics chapter 5" cannot tell anyone whether the 9B physics
teacher or the 9A class teacher may read a given item. Visibility must be carried on the
item, through a column that reaches a section, and only there. This design does that; it
never infers visibility from placement.

### 1.2 The structural rule

Two columns, two vocabularies, two code paths. `audience` is an enum whose values name
people: `school`, `grade`, `section`, `offering`, `owner`. The curriculum column names
content. No value of either appears in the other, and no function reads one to decide the
other. `LibraryScopesFor` (section 4) never touches the curriculum column; the curriculum
model never touches `internal/data/access`.

### 1.3 What goes wrong with one field

Suppose a single `scope` enum with values like `global`, `subject`, `chapter`, `section`.

- "global" written for editorial reasons ("a general reference book, not tied to a
  chapter") is read by the predicate as "visible to everyone". A teacher's unbound private
  notes become school-wide. That is the fail-open shape this codebase keeps finding,
  arriving through a decision nobody thought was an access decision.
- The reverse also happens: a chapter-bound note, because "chapter" is not in the
  visibility vocabulary, lands either in the deny arm (invisible to its own author) or in a
  fallback arm that reads unrecognised as unrestricted.
- The engine has a third "global". `Document.scope == "global"` means readable by every
  tenant on the box, and `_scope_and_tenant` maps the word to the reserved owner
  `_global` (`api.py:461-466`). A field named `scope` on the emerge-core side is one
  mis-mapped enum away from publishing a school's notes to every school. emerge-core
  documents are always ingested with engine `scope: "school"`; no emerge-core value maps
  to the engine's "global"; the client hard-codes it.

### 1.4 Where `scope_ids` fits: visibility only

The engine's `scope_ids` carries audience labels and nothing else. Three reasons beyond
the conflation above. A `scope_ids` entry is a grant, so `physics.ch5` there would mean
"holders of physics.ch5 may read", and the engine's prefix containment would make holding
`physics` admit every chapter of every class. Placement cannot produce a `Viewer`-shaped
predicate (1.1). And it is the single-field conflation one level down. Placement travels
as ordinary metadata: emerge-core's database, and if the engine wants it for relevance,
its soft facets (`subject`, `grade`, `document_ids`), which can only narrow.

---

## 2. The scope model

### 2.1 The table

`content_items` in the tenant database, ent schema
`D:\emerge-core\internal\ent\schema\libraryitem.go` (new). The columns that exist for
access control:

| Column | Type | Why it is needed and not something else |
|---|---|---|
| `audience` | enum `school`, `grade`, `section`, `offering`, `owner`; NOT NULL; no default | The visibility axis. No default, so a row cannot exist without a stated audience; the predicate switches on it with a deny default arm, exactly like `scopedStudents` (`predicate.go:93-110`). A nullable or defaulted column, or a "no audience rows" state, has a tempting reading of "unrestricted". |
| `grade_level_id` | uuid, nullable, FK `grade_levels` | Required iff `audience=grade`. Grade-wide content is in the requirement and is what the existing `grade_level` row constraint already names. |
| `section_id` | uuid, nullable, FK `sections` | Required iff `audience=section`. Sections are immutable in session and grade (`academic.go:111-113`), so a section-bound item is bound to one year and one grade with no extra columns. |
| `subject_offering_id` | uuid, nullable, FK `subject_offerings` | Required iff `audience=offering`. The only unit that is both "a subject" and reaches a section; it is exactly `Viewer.SubjectOfferingIDs`. A bare `subject_id` here would be the curriculum axis leaking into visibility, and is rejected. |
| `uploaded_by` | uuid, NOT NULL, FK `persons` | The owner. Set from the token via `attributedTo` (`reach.go:117-129`), never from the body. Needed for `audience=owner` and for `reach=self` on write. |
| `engine_document_id` | text, indexed, not unique, nullable | The join to the engine; null until ingest returns. Needed to re-stamp, to delete, and to re-check returned passages against the database predicate (section 5.6). Several items may carry the same id: the engine keys a document on `(tenant, checksum)`, so the same book filed to two sections resolves to one document. |

Exactly-one-FK-per-audience is enforced by an ent hook on create and update (a 400) and
by a Postgres CHECK in the migration (the backstop). The curriculum placement column is
the curriculum model's; the only constraint this design places on it is that it is a
separate nullable FK, not `audience`, and never read by `internal/data/access`.

Non-access columns the engine's ingest contract forces (`title`, `source_type`) are left
to the schema owner and do not affect this design.

### 2.2 Rejected

- A join table `library_item_audiences` for cross-section sharing. Not in the stated
  requirement. Its "zero rows" state needs a meaning, and every candidate meaning is
  either fail-open or makes a freshly created item invisible to its uploader. If sharing
  is needed later it is an additive child table; the label vocabulary already allows
  several labels per document, so nothing here changes.
- `academic_session_id` on the item. Section and offering carry it; grade and school
  items are legitimately cross-year.
- A `published` or `visibility` flag. `audience=owner` is the draft state.
- The engine's `Scope.CLASS` tier or a CAS entity per class
  (`D:\lms-retrieval-engine\docs\CAS-CHANGES-REQUIRED.md`, section 0). Entity-per-class
  copies `teacher_assignments` into CAS groups: two sources of truth for who teaches 9A,
  and revocation becomes a CAS synchronisation problem. The requirement says "as per their
  token from CAS", and the token's answer is `reach=teacher_assignment`, which by design
  means "resolve against emerge-core's tables".

### 2.3 The label vocabulary (frozen; emerge-core is the only minter)

Labels are the engine's opaque `scope_ids`. Every label is one segment, containing no
`.`, so the engine's prefix containment can never apply. Every label embeds a UUID, so two
schools can never mint the same string; this matters because the engine does not AND a
scope match with the tenant.

    unrestricted_<school uuid>         stamped on every emerge-core document; held only by unrestricted callers
    school_<school uuid>               audience=school
    grade_<grade_level uuid>           audience=grade
    section_<section uuid>             audience=section
    offering_<subject_offering uuid>   audience=offering
    person_<person uuid>               audience=owner

`<school uuid>` is `tenancy.Tenant.SchoolID`
(`D:\emerge-core\internal\domain\tenancy\tenant.go:29`) and is also the engine's
`X-School-Id` for that school. A document is stamped with exactly two labels: the
wildcard and its audience label. `labelFor(item)` returns a string or an error; it is
total over the enum and never returns an empty string.

Why flat labels rather than the engine's `.` hierarchy: containment widens downward only
(holding `g9` admits `g9.sec_9A`), but the requirement's shape is the reverse. A narrow
holder, 9A's teacher, must read wide documents, grade 9 and school. Expressing that with
paths needs a `.all` leaf at every level and buys nothing over flat labels, while every
`.` is a latent "held prefix admits everything below" hazard. The engine mechanism is used
as an opaque set, which is the only contract its own docstring claims for it.

Why a wildcard label: after the boundary change in section 3, tenant equality admits only
unlabelled documents, and a school can have more sections than the caller-set bound. One
label that unrestricted callers hold keeps the caller set small and makes "who may see
everything" an explicit emission from exactly one code arm.

### 2.4 The OCR and audio/video gap, answered

The restriction in this design rides on `scope_ids`, not on the engine's section ids.
`scope_ids` is stamped on the engine `Document` and mirrored onto every `Chunk`
(`models.py:364`, invariant `chunk.scope_ids == doc.scope_ids`), and the labels come from
emerge-core's `content_items` row, not from any structure inside the file. The engine's
`section_id` (a ToC chapter) plays no part in admission. A scanned note or a video that
yields one root section and no chapters still has every chunk carrying its two labels.
So a teacher's uploaded 9A note, ingested as an image or as audio, is covered.

What this does require is that every ingest path stamps. Phase SI T3 names `ingest.py`,
`ocr_ingest.py`, `av_ingest.py`, `chunking.py` and `figures.py`. A path that is missed
produces a document whose chunks carry no labels, which under the new boundary is
tenant-wide. The T3 invariant test (`chunk.scope_ids == doc.scope_ids` for every chunk of
every ingest path) is what catches it, and it must include the OCR and AV paths, which are
exactly the note-shaped content the user cares about.

---

## 3. The engine boundary change

This is the load-bearing section. Without it nothing else in this document restricts
anything.

### 3.1 The current expression, verbatim

`D:\lms-retrieval-engine\retrieval_engine\scope.py:232-238`:

```python
scope = meta.get("scope")
if not (self.all_tenants
        or scope == "global" or meta.get("tenant_id") == self.tenant_id
        or scope in self.extra_scopes
        or (self.visible_scopes
            and _scopes_admit(self.visible_scopes, meta.get("scope_ids")))):
    return False
```

### 3.2 The proposed expression

The disjunct that changes is the third, `meta.get("tenant_id") == self.tenant_id`. It
becomes conditional on the document carrying no labels. Nothing else moves;
`extra_scopes` is deleted by Phase SI T1 independently of this design.

```python
scope = meta.get("scope")
if not (self.all_tenants
        or scope == "global"
        or (meta.get("tenant_id") == self.tenant_id and not meta.get("scope_ids"))
        or (self.visible_scopes
            and _scopes_admit(self.visible_scopes, meta.get("scope_ids")))):
    return False
```

Its SQL twin in `_filter_to_sql` (`vector_store.py:271-276`) changes in the same commit.
The boundary clause becomes

    (scope = 'global' OR (tenant_id = %s AND COALESCE(scope_ids, '{}') = '{}') OR <_SCOPE_CONTAINS>)

with the `_SCOPE_CONTAINS` term emitted only when `visible_scopes` is non-empty, as it is
today. `COALESCE` is load-bearing: a NULL array must read as empty, or a row written
before the column existed becomes invisible to its own tenant, which is the safe direction
but a silent one.

### 3.3 New meaning of the boundary

A document that carries labels is visible only to a holder of one of them. A document that
carries none keeps today's tenant-wide reading. `scope_ids` stops meaning "additional
audiences on top of the owning school" and becomes "the audience, full stop".

### 3.4 Why it is inert for every document on the box today

Every live document has `scope_ids == []` (Phase SI section 7.3; T0's inventory script is
the command that re-establishes it). For such a document `not meta.get("scope_ids")` is
true, so the third disjunct reduces to exactly the old `tenant_id == self.tenant_id`. The
fourth disjunct is inert for every caller today because `visible_scopes` is empty
everywhere. So for every (document, caller) pair that exists, the new expression evaluates
identically to the old one.

### 3.5 What breaks if a document already relies on the old polarity

The only pairs whose answer changes are `(labelled document, tenant-equal caller, no
matching held label)`, which go from ADMIT to REFUSE. No such document exists today
because nothing stamps. If one is ever created under the old polarity, meaning a document
published into an extra audience while still relying on tenant equality for its own
school's readers, then applying this change makes that document invisible to its own
school except through `visible_scopes`. That is an under-grant, visible as a shorter list,
and it is the narrowing direction Phase SI's differential test already accepts
(old-admits / new-refuses, section 7.1). It cannot widen anything. The audit script from
T0 lists every `(tenant_id, scope, scope_ids)` triple in the corpus, and must be run
before the change ships so that any such document is known rather than discovered.

### 3.6 Why it is not optional, restated

Without the change, a 9A note stamped `[section_9A]` and owned by school S is admitted to
the 9B teacher by the third disjunct because their `X-School-Id` is S. Every test that
asserts what 9A's teacher CAN see passes; only a test asserting what 9B's teacher CANNOT
see fails, and Phase SI writes none of those for the intra-tenant case because its design
does not claim to restrict within a tenant.

### 3.7 Fallback if the engine team will not touch the boundary

emerge-core could ingest under an owner tenant string that no reader ever presents (for
example `<school uuid>-library`), so the third disjunct never fires for readers. Rejected
as the primary design: it hides the security property in a naming convention across two
repositories, and "forgot the suffix" at ingest is a silent tenant-wide publish.

### 3.8 The other engine changes this design needs, all inside Phase SI's task shapes

- `visible_scopes` on every request model that returns chunk text or lists documents:
  `RetrieveRequest`, `ScopedRequest`, `CoverageRequest`, `/passages/search`,
  `/citation/{id}`, `/figure/{id}`, `/syllabus/*`, `/documents`, `GetSpans`, `ListBooks`,
  `LinkNotes`; threaded into every `build_filter` call (`api.py:440,1024,1363,1405,3188`;
  `retriever.py:308,595`).
- A separate caller-set bound in `_validated_scope_ids` (at least 256). The 32 is a
  per-document bound; a subject teacher with many offerings must not receive a 422.
- `DocEdit.scope_ids` with the chunk re-stamp loop (Phase SI T5).
- pgvector `ON CONFLICT DO UPDATE` carrying every facet column (Phase SI T2).
- Every ingest path stamping, including `ocr_ingest.py` and `av_ingest.py` (Phase SI T3).
- The asserter credential and its 403 rule, section 5.3.

---

## 4. Deriving the caller's scope set from a CAS decision

`LibraryScopesFor(ctx, v, d)` in `D:\emerge-core\internal\data\access\library.go` (new).
One switch, every arm total, default arm empty.

| Condition | Emits |
|---|---|
| `v == nil` | the zero value (nothing) |
| `v.Unrestricted` (`read_all` held unpinned; `scopeFor` already refuses a pinned wide grant, `viewer.go:21`) | `Unrestricted: true`, rendered as `[unrestricted_<school>]` and a match-all predicate |
| `!d.HasReach` (a policy written before reach existed) | base, taught, own and wards together, the `StudentsAnyRole` reading |
| `ReachTenant` | as unrestricted, then pins |
| `ReachTeacherAssignment` | base and taught |
| `ReachSelf` | base and own |
| `ReachGuardianWard` | base and wards |
| any other reach | nothing; an unknown reach must reach the deny arm and not the fallback, the lesson of `scope_test.go` |

- base is `School: true` and `PersonID: v.PersonID`. A school-wide item is visible to
  every holder of `core.library.read` at that school whatever their reach, because the
  school chose the widest audience; reach narrows the audience-restricted items.
- taught is `v.SectionIDs`; `v.SubjectOfferingIDs` together with every offering whose
  section is in `v.SectionIDs` (a class teacher holds the whole section, as
  `subjectEnrollmentsTaughtBy` holds every subject row under it, `predicate.go:189-204`);
  and the grade of every section involved. One query; a query error is returned, never a
  partial set.
- own is, for each of `v.StudentIDs`, the active current enrollment's section, its grade,
  and the active subject enrollments' offerings.
- wards is the same for each student `StudentsOfGuardian(v)` matches.
- pins (`d.Constraints` non-empty): section codes resolve to section ids and grade codes
  to grade ids in the current session; an untranslatable group yields nothing, mirroring
  `StudentsConstrainedBy`. The pinned set is the pinned grades, the sections in pinned
  grades or with pinned codes, and their offerings. The emitted set is the reach set
  intersected with the pinned set, and `School` becomes false: a school-wide item answers
  neither `section` nor `grade_level`, and a row that cannot answer a pinned field is not
  covered (`authorization/constraint.go:237-245`). Consequence to tell policy authors: a
  library grant pinned to 9A hides the textbooks from that teacher. The ordinary teacher
  is `reach=teacher_assignment` with no pins.

### 4.1 The teacher case, precisely

Mr Sharma is class teacher of 9A and maths subject teacher in 9B and 10C, current session,
active. `v.SectionIDs` is `{9A}` and `v.SubjectOfferingIDs` is `{9B-maths, 10C-maths}`.

Emitted: `school_S`, `person_sharma`, `grade_9`, `grade_10`, `section_9A`, `offering_*`
for every offering of 9A, `offering_9B-maths`, `offering_10C-maths`.

Never emitted: `section_9B`, `section_10C`, `offering_9B-physics`, `unrestricted_S`.

He sees school-wide items, grade 9 and grade 10 items, all of 9A's items, only the maths
items of 9B and 10C, and his own drafts. He does not see 9B's class notes or 9B's physics
notes. That is the user's sentence. Whether a class teacher sees subject-specific items in
their own section is one clause to remove if the user disagrees.

---

## 5. The enforcement seam

### 5.1 Options analysed

| Option | Correctness | What happens when the parameter is forgotten |
|---|---|---|
| A. Post-filter in emerge-core: the engine returns the tenant-wide top-k, emerge-core drops what the caller may not see | Wrong even when remembered. The top-k is computed over invisible passages, so a restricted caller's page is eaten by 9B's notes and `no_good_match` shifts with them; forbidden text crosses the wire on every query, and one bug in the drop loop is a leak. | Forgotten filter means every passage in the school. Fail-open. |
| B. Pass the allowed `document_ids` (an existing soft facet) | Correct while remembered, no engine change, scales badly (every visible item id per request). | `None` is the engine's no-op default: forgotten means the whole tenant. Fail-open. |
| C. Per-audience indices, or a distinct engine tenant per audience | One request cannot span the several audiences a teacher holds; `tenant_id` is the engine's mutation identity, so audience would become ownership. | Rejected on shape. |
| D. emerge-core derives the caller's label set per request; the engine hard-filters on it inside both first stages (the Phase SI mechanism, wired) | Correct: the filter precedes ranking, BM25 normalises over survivors, pgvector compiles the same clause. | With the section 3 change, an omitted or empty set admits no labelled document. Fail-closed. |

Recommendation: D, wired per Phase SI T1-T6, plus the section 3 boundary change, plus the
second layer in 5.6. B is kept only as a narrowing emerge-core may add for relevance
(curriculum placement rendered as `document_ids`); it is never the boundary.

### 5.2 Where the hard set is computed

emerge-core computes it per request from the CAS decision plus its own tables (section
4) and hands it to the engine on a trusted channel.

The engine gaining its own CAS token verification is rejected for this phase. The engine
has `cas.py`, but a policy set says `reach=teacher_assignment`, and the teacher
assignments live in emerge-core, so the engine would have to call emerge-core anyway; a
second CAS client buys no decision. If direct callers (lms-tutor) ever need it, the
resolver is `GET /library/scopes` on emerge-core, returning exactly what section 4
computes, called by the engine with the forwarded user token. Same contract, different
transport.

### 5.3 The channel

A dedicated asserter credential in the engine: `RE_SCOPE_ASSERTER_TOKEN`, its own header,
compared with `hmac.compare_digest`, empty meaning nobody, the `RE_ADMIN_TOKEN` polarity
(`api.py:394-410`). A request carrying it may supply `visible_scopes`. A request without
it that supplies `visible_scopes` is a 403, never ignored: ignoring it is a silent
under-grant, which the engine's own `cas.py` decision 2 forbids (`cas.py:98-106`). An
asserter is not an admin: no `_visible` bypass, no `all_tenants`, no cross-tenant
ownership. If a shared secret is judged too weak, emerge-core signs `(tenant, labels,
expiry)` with HMAC and the engine verifies; the label semantics are unchanged.

### 5.4 What stops a direct call to the engine bypassing emerge-core

Two things, and only the second is a security property.

1. Network. The engine stays on `127.0.0.1` or a private network; the unauthenticated
   nginx on `:8055` (engine CLAUDE.md, section 8) must not front it for end users. That
   is deployment hygiene, not a boundary.
2. With the section 3 change, a caller presenting only an `X-School-Id` gets global
   content and unlabelled tenant documents, and nothing emerge-core owns. Every
   emerge-core document is labelled; label admission needs a `visible_scopes` set;
   supplying one needs the asserter credential; the credential lives only in emerge-core.
   A spoofed tenant header yields no library content. Under today's additive boundary the
   same spoofed header yields every document in the school. This is why section 3 is the
   load-bearing change, and why the unsigned header stops being the whole boundary for
   library content.

Residual, stated plainly: a direct caller with a spoofed header still reads that school's
unlabelled documents (anything ingested by the orchestrator or the scripts) and publisher
content. That is today's exposure, unchanged, and outside this design's remit.

### 5.5 emerge-core contracts

Route `POST /library/search` in `D:\emerge-core\internal\transport\http\library.go` (new),
gated `s.can(authorization.LibraryRead)`, then
`scopeFor(ctx, LibraryRead, LibraryReadAll)`.

```go
type LibraryScopes struct {
    Unrestricted       bool
    School             bool
    PersonID           *uuid.UUID
    GradeLevelIDs      []uuid.UUID
    SectionIDs         []uuid.UUID
    SubjectOfferingIDs []uuid.UUID
}

func LibraryScopesFor(ctx context.Context, v *Viewer, d authorization.Decision) (LibraryScopes, error)
func (s LibraryScopes) Labels(schoolID uuid.UUID) []string
func (s LibraryScopes) Predicate() predicate.LibraryItem
func LibraryItemsFor(v *Viewer, d authorization.Decision) predicate.LibraryItem
```

`Labels` renders the vocabulary of 2.3; the zero value renders to an empty list.
`Predicate` renders `Unrestricted` as match-all, otherwise an OR of `audience=school` when
`School` is set, `audience=owner AND uploaded_by = PersonID`, `audience=grade AND
grade_level_id IN GradeLevelIDs`, `audience=section AND section_id IN SectionIDs`, and
`audience=offering AND subject_offering_id IN SubjectOfferingIDs`; an empty OR is
`IDIn()`, which matches nothing. One typed struct rendered two ways is what stops the
label list and the SQL predicate drifting, the drift `predicate.go` was created to end.

```go
type Client interface {
    Search(ctx context.Context, tenant uuid.UUID, scopes access.LibraryScopes, req SearchRequest) (SearchResponse, error)
    Ingest(ctx context.Context, tenant uuid.UUID, labels []string, doc IngestRequest) (string, error)
    Restamp(ctx context.Context, tenant uuid.UUID, engineDocID string, labels []string) error
    Delete(ctx context.Context, tenant uuid.UUID, engineDocID string) error
}
```

`D:\emerge-core\internal\infrastructure\retrieval\client.go` (new). `Search` takes the
struct rather than a slice, so there is no nil-slice-means-nothing ambiguity, and always
sends `visible_scopes`, an empty list included. `Ingest` and `Restamp` return an error
before any HTTP on empty labels, a label containing `.`, or a label starting with `_`.
`Ingest` always sends engine `scope: "school"`.

Entities appended to `D:\emerge-core\internal\authorization\entities.go` and its slice,
or `count_test.go` fails: `core.library.read`, `core.library.read_all`,
`core.library.create`, `core.library.write`, `core.library.write_all`,
`core.library.delete`, `core.library.delete_all`. `read_all` is the wide entity for
`scopeFor`, following the read/write/delete breadth split the rest of the service uses.

### 5.6 The publish gate

Rule, in emerge-core: the audience an item is given at create or update must be within
the caller's write scope set. Concretely, `labelFor(item)` must be an element of
`LibraryScopesFor(v, writeDecision).Labels()`, where `writeDecision` is the create
decision on POST and the write decision on PATCH.

- Unrestricted, or `reach=tenant` unpinned: any audience, including `school`.
- `reach=teacher_assignment`: `owner`, own sections, own offerings, offerings of own
  sections.
- `reach=self`: `owner` only.
- Pinned: intersected as in section 4.
- Anything else: a 403 naming the audience, never a silent downgrade to `owner`. A
  downgrade is a partial success the caller does not learn about, the principle behind
  `rejectUnauthorizedFields` (`fields.go:66-86`).

This is the library's `_require_admin_for_global` (`api.py:450-458`): publishing to the
school needs school-wide write reach.

If the check is omitted: anyone holding `core.library.create` sets `audience=school` and
every holder of `core.library.read` at that school reads it. Intra-tenant fail-open, not
cross-tenant: labels embed this tenant's row UUIDs and the FKs make a foreign section id
fail. Tests: `reach=teacher_assignment` with `audience=school` is 403; with
`audience=section` for a section not in `SectionIDs` is 403.

In the engine: Phase SI's header-mode gate (`set(scope_ids) <= {tenant}`, SI section 2.6)
cannot evaluate emerge-core's rule and must not try. For an asserter the engine checks
ownership only (`doc.tenant_id == X-School-Id`). If that relaxation is forgotten, every
emerge-core ingest is refused: loud, and in the safe direction.

### 5.7 The second layer in emerge-core

After the engine answers, emerge-core queries `content_items WHERE engine_document_id IN
(returned ids) AND LibraryItemsFor(v, d)` and drops every passage whose document is not
returned, counting the drops into the trace in the `tracePerRow` pattern
(`fields.go:117-124`). Drop, not error: a drop means the engine is wider than the
database (a stale stamp, a missed route, a backend disagreement), and the user gets the
safe page while the count makes the discrepancy visible. This layer must never become the
only layer, for option A's reasons.

---

## 6. Revocation and staleness

Document-side labels are baked into the engine: the in-memory index, the snapshot, and
pgvector. Caller-side labels are never persisted anywhere. `LibraryScopesFor` runs per
request from `teacher_assignments`, `sections.class_teacher_id`, enrollments and the
current session, exactly as `access.Resolve` already does (`viewer.go:33-93`). That
asymmetry is the whole answer: revocation changes the caller side, and the caller side is
recomputed on every call.

When Mr Sharma stops teaching 9A (the assignment goes `status=revoked`, or
`class_teacher_id` is reassigned), the next request's `Viewer` omits 9A,
`LibraryScopesFor` omits `section_9A` and 9A's offering labels, and the engine refuses
every 9A chunk. No index write, no cache flush, lag zero from the database write.

The residual lags, named:

1. The CAS policy cache, 60 seconds (`policies.go:88`), and up to 120 seconds during a
   CAS outage because emerge-core serves a stale set then (`policies.go:99-104`). Whether
   he holds `core.library.read` at all, his reach, and his pins lag that long. This is the
   stale-allow the engine's own CAS client refuses on principle (`cas.py:107-114`).
   Existing behaviour; it should be a decision, not something inherited silently.
   `Forget` on logout and the epoch sweep already exist (`policies.go:114-125`, `:263-281`).
2. Session rollover. When `is_current` flips, every last-year section label drops from
   every caller at once; section-bound items from the old year become visible only to
   unrestricted callers. Expected. "No current session" fails closed, because
   `teachingScope` returns nothing.
3. Re-audiencing a document. `DocEdit` has no `scope_ids`, so today an audience cannot be
   changed after upload at all. Operationally, until Phase SI T5 lands, emerge-core treats
   `audience` as immutable and answers an audience PATCH with 409, and never updates the
   database alone: a database saying 9A while the engine says school is a permanent
   over-grant with a record claiming it is fixed. The interim for a narrowing the user
   insists on is `Delete` then `Ingest`, which re-embeds, mints a new document id and
   breaks citations, with the database updated only after both succeed. Once
   `DocEdit.scope_ids` exists: narrowing is engine `Restamp` first, then database;
   widening is database first, then engine. Either way a failed second step leaves the
   engine no wider than the database. Deletion is engine first; on failure the database
   row stays and the request fails. A dry-run-by-default reconciler
   (`D:\emerge-core\cmd\libraryaudit`) diffs database audience against engine
   `scope_ids` per document; it is the only artefact from which a human can see a wrong
   stamp, the same role Phase SI gives `scripts/audit_scopes.py`.
4. The risk to name. A later cache of the resolved `Viewer` or of the label list, in the
   session, in a JWT claim, in the policy-cache entry, "because Resolve runs four queries
   per request", turns revocation lag into that cache's TTL, and nothing in the code says
   so. `LibraryScopesFor` takes only `ctx` and a `Viewer`; a test revokes an assignment
   and asserts the next call drops the label; and the rule goes in
   `D:\emerge-core\docs\DESIGN-NOTES.md`.
5. Engine restart re-embeds from snapshots; `Restamp` goes through
   `PATCH /documents/{id}`, which rewrites the snapshot, so a restart cannot resurrect an
   old audience. The retained-snapshot behaviour of `DELETE` (engine CLAUDE.md, gotcha 13)
   applies only to externally loaded `_global` books, never to emerge-core documents.
6. The pgvector `upsert` bug (Phase SI section 5.2): `ON CONFLICT (id) DO UPDATE` sets
   only the embedding, so a re-indexed document keeps its old `scope_ids` in the table
   while the in-memory index has the new ones. Until fixed, a `Restamp` that narrows does
   so in memory only, on the backend that happens not to be serving.

---

## 7. Failure modes

Every entry has the shape "if X is forgotten or omitted, the system returns MORE than it
should". The list is deliberately not trimmed.

1. If the section 3 boundary change is not made, every teacher sees every document in
   the school. Phase SI wired to the letter ships this, with every happy-path test green.
   The single most likely way this project ships broken. Test: `(tenant-equal caller,
   document scope_ids=[section_X], held set empty)` must refuse, in memory and in the
   emitted SQL.
2. If the change is made in `scope.py` but not in `_filter_to_sql`, or the reverse, one
   backend admits by tenant equality and the other does not. Both in one commit, with the
   Phase SI T2 test that pins the emitted string and the parameter list together.
3. If the silent pgvector fallback (`vector_store.py:208-214`) fires, it decides which of
   the two backends in item 2 a deployment runs, with a printed line as the only
   evidence; and the pgvector path has never executed against a real Postgres. The
   fallback alone is not a leak, since both backends filter; the leak is a disagreement
   between them plus a fallback that chooses silently. Mitigation: emerge-core's readiness
   check asserts the engine's `/health/providers?strict=true` (`expected == live`) and
   refuses to serve `/library/search` otherwise.
4. If a document is ingested with `scope_ids=[]`, it is tenant-wide under the new
   boundary. Closed by `audience NOT NULL` with no default, a total `labelFor` that errors
   rather than returns an empty string, the client refusing empty stamps before any HTTP,
   and a test over every ingest path asserting two labels per document.
5. If one engine ingest path does not stamp (the OCR and AV paths are the note-shaped
   ones), its chunks are unlabelled and tenant-wide while its document row says
   otherwise: the split brain in the widening direction. Phase SI T3's invariant test must
   cover `ocr_ingest.py` and `av_ingest.py`.
6. If curriculum placement and audience share one field (section 1.3), "global" written
   for editorial reasons is read as "everyone may read". Structurally excluded by two
   columns with two vocabularies; and no emerge-core value may map to the engine's
   `scope: "global"`, which means every tenant on the box; the client hard-codes
   `school`.
7. If the wildcard label is emitted from any arm other than the unrestricted one, that is
   a school-wide bypass. Exactly one arm emits it; test every other arm's output for the
   prefix.
8. If the route calls `scopeFor(LibraryRead, LibraryRead)` (wide equals narrow), everyone
   is unrestricted and every narrowing below is dead (`viewer_test.go`).
9. If the new entities are not appended to `AllEntities`, the failure is a quiet
   under-grant that reads as CAS misconfiguration; `count_test.go` catches it, and must
   not be skipped.
10. If an unknown reach, or an untranslatable pin, lands on the fallback arm instead of
    the deny arm, the caller gets the any-role union. The default arm returns the zero
    value; `translatable == false` returns the zero value, not "no pins".
11. If a label ever contains `.`, a held `section` admits every section in every tenant
    through prefix containment (`scope.py:98`). Test: no emitted label contains
    `scope.SCOPE_SEPARATOR`; never emit a bare kind.
12. If a second minter stamps labels, cross-tenant collision becomes possible because the
    engine's scope disjunct does not AND with tenant (`scope.py:101-115`). UUID-bearing
    labels make it impossible from emerge-core alone. Ask the engine to AND `tenant_id`
    unless a document is explicitly flagged for a cross-tenant audience.
13. If emerge-core is given the admin token instead of an asserter credential,
    `/documents` and `/syllabus/tree` list every tenant (`api.py:440`) and `all_tenants`
    becomes requestable. A distinct credential; the client type has no field for an admin
    token.
14. If emerge-core's route decodes `visible_scopes` from a client body and forwards it,
    that is caller-controlled widening. Refuse unknown top-level keys, the `filter/parse.go`
    rule applied to the body through `DecodeFields`.
15. If the engine accepts body `visible_scopes` without the asserter credential, the
    spoofing surface has moved down one level (`scope.py:130-138`); if it ignores it
    silently, that is a silent under-grant. A 403 is the only correct answer.
16. If the publish gate (5.6) is omitted, any holder of `core.library.create` publishes
    school-wide.
17. If one engine route is not threaded (the `syllabus_tree` shape, Phase SI section
    7.4), that route serves unfiltered. Phase SI's route-inventory test, extended to
    "every authenticated read passes `visible_scopes` to `build_filter`". On the
    emerge-core side, every engine call goes through one `Client` and one
    `LibraryScopesFor`.
18. If a narrowing is written database-first and the engine step fails or is forgotten
    (6.3), that is a permanent over-grant which the record denies.
19. If pupils and guardians receive section labels (reach=self, reach=guardian_ward),
    they read teacher-facing 9A material. Not more than the model says, possibly more
    than the user means; the model has no "for whom" dimension (section 9).
20. If two academic sessions are marked current, callers hold labels from both. Wider
    than intended, though every label is a real assignment. A health check, not a code
    path here.
21. If CAS is down, the stale policy serve (`policies.go:99-104`) keeps a revoked
    `core.library.read` alive for up to 120 seconds.
22. If `_scope_and_tenant` is ever reached with an emerge-core value spelled "global"
    (`api.py:461-466`), the document is owned by `_global` and readable by every school.
    The client never sends that word; a test asserts the ingest body's `scope` is
    `school` for every audience.

---

## 8. Partition (exclusive file ownership)

Ordering: the engine boundary change and the emerge-core schema can start now, in
parallel; access and the client follow; the route is last.

| Task | Owns | Depends on | Done when |
|---|---|---|---|
| E1 engine boundary and wire | `D:\lms-retrieval-engine\retrieval_engine\scope.py`, `vector_store.py`, `models.py`, `retriever.py`, `api.py`, `config.py`, and their tests | nothing | the differential shows only old-admits / new-refuses on labelled rows; a body `visible_scopes` without the credential is 403; every authenticated read threads the set; `DocEdit.scope_ids` re-stamps chunks; emitted SQL and parameters are pinned together; every ingest path, OCR and AV included, stamps |
| C1 schema and entities | `D:\emerge-core\internal\ent\schema\libraryitem.go`, `D:\emerge-core\internal\authorization\entities.go`, generated ent code, the migration | the curriculum model's column shape | `count_test.go` green; the CHECK rejects two FKs; `audience` has no default; the curriculum column is a separate nullable FK |
| C2 access and labels | `D:\emerge-core\internal\data\access\library.go` and its test | C1 | the Sharma case emits exactly the set in 4.1; no non-unrestricted arm emits the wildcard; no label contains `.`; revoking an assignment drops the label on the next call |
| C3 engine client | `D:\emerge-core\internal\infrastructure\retrieval\*` | the E1 wire contract | empty labels error before HTTP; `Search` always sends `visible_scopes`; ingest always sends `scope: school` |
| C4 route and write gate | `D:\emerge-core\internal\transport\http\library.go`, the route registration lines in `server.go` | C2, C3 | an audience outside the write set is 403; search drops and counts uncovered passages; unknown body keys are refused; an audience PATCH is 409 until E1's `DocEdit` lands |
| C5 reconciler and notes | `D:\emerge-core\cmd\libraryaudit\*`, `D:\emerge-core\docs\DESIGN-NOTES.md` | C4 | the dry run lists every (item, audience, engine scope_ids) mismatch |

`server.go` is touched by C4 only; `entities.go` by C1 only. No task shares a file.

Nothing here is irreversible. The one schema change on the engine side is pgvector's
`ADD COLUMN IF NOT EXISTS`, on a table that has never held production data. The one act
that is hard to undo is publishing an item to an audience, and that is undone by a
re-audience once `DocEdit.scope_ids` exists, or by delete and re-ingest before then.

---

## 9. Decisions not made here

1. Whether an item needs a "for whom" dimension (teacher-facing versus pupil-facing) in
   addition to "which class". Failure 19 is the cost of leaving it out.
2. Whether a class teacher sees subject-specific items in their own section. This design
   follows the pupil model in `predicate.go:189-204`; it is one clause to remove.
3. Whether pins should exclude school-wide items. This design follows the `RowValues`
   semantics; it may surprise policy authors.
4. The engine tenant-id spelling (`SchoolID` UUID) must be agreed with the orchestrator
   and tutor owners before the first ingest; a mismatch is two engine tenants for one
   school and cannot be fixed by re-stamping.
5. Whether to keep the two-times-TTL stale policy serve in `policies.go:99-104` now that
   content sits behind it.
6. A shared secret versus an HMAC-signed assertion for the asserter channel. The label
   contract is the same either way.
