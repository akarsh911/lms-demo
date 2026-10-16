# CAS entity keys to register

Generated 2026-09-14 from `internal/authorization`, revised 2026-10-02. **204 keys across 39 areas.**

`docs/TODO.md` said 87 keys with twelve `write_all` and twelve `delete_all`. Both figures were
stale — library, curriculum and content_placements were added after it was written. The real counts
are **28 `read_all`, 27 `write_all`, 26 `delete_all`, 10 `create`**, verified two ways: the repo's own
`go/ast` registration test (`TestEveryDeclaredEntityIsRegistered`) and a distinct-key grep, which agree.

This header said 174 keys across 33 areas until 2026-10-02. That figure was already stale: the
question bank, blueprints and papers surface of 2026-09-30 added 26 keys in four areas and appended
its sections below without touching the count, so the true figure before mind maps was 200 across 37.
`mindmaps` adds one key and one area, and `concept_mastery` three keys and one area, which is the
204 across 39 above.

The 2026-09-14 figures were themselves stale twice over. They said 111 keys across 20 areas, but
`core.student_guardians.write` was already registered and had no section here, so the true figure that
day was 112 across 21. The timetable, attendance, rooms and calendar surface adds 18 more. The classroom surface — `stream_posts`, `stream_comments`, `assignments` and `assignment_submissions` — adds 24 more again, and none of them are registered yet.

The four classroom areas have **no `create` key** and, deliberately, **no key that names a target level**. There is no `write_grade` and no `write_school`. Breadth on the class stream is carried by the scope the grant is issued at, exactly as the CAS group tree `dps-ngp -> branch-... -> grade-g8 -> section-...` expresses it: `core.stream_posts.write` at `reach=teacher_assignment` reaches the offerings a teacher teaches and the sections they are class teacher of; the same key at `reach=tenant` pinned to `grade_level=G8` reaches everything under Grade 8, which is what a subject head holds; unpinned tenant reach with `core.stream_posts.write_all` reaches the school. The entity says what, the scope says where. A `create` key would add nothing, because creating a post is scoped by exactly the targets that govern editing it.

`branch` is the one target level the predicates cannot narrow today. `internal/authorization/constraint.go` registers `section`, `grade_level` and `subject` as row fields, so a branch-scoped grant has no constraint to translate. A `branch` target is therefore writable and readable only at unpinned tenant reach; a narrowed viewer matches nothing for it, which fails closed. Adding `branch` to `rowFields` is a cross-cutting change to every area and is not made here. The classroom surface — announcements, assignments and assignment_submissions — adds 18 more again, and none of them are registered yet.

The three classroom areas have **no `create` key**. That is deliberate rather than an omission: a separate `create` earns its place only where creating is meaningfully different from editing, as it is for a curriculum that may be imported by someone who cannot edit the school's own. An announcement or a piece of homework is created against exactly the same offering or section that governs editing it, so a `create` key would grant nothing a `write` does not already grant and would be a second thing to keep in step. `core.assignment_submissions.write` is the one key a pupil needs; the predicate, not the key, is what stops them writing anybody else's row or their own marks.

The recognition surface — `achievements`, `student_achievements`, `praises` and `praise_reactions` — adds 18 more again, and none of them are registered yet. `achievements` and `praise_reactions` have **no breadth key**, for two different reasons. A badge definition is school-wide reference data like `rooms` and `calendar`: there is nothing to narrow it by, so `core.achievements.write` is refused unless the grant reaches the tenant unpinned, and the breadth probe borrows the matching `student_achievements` breadth key because someone who reaches every award in the school plainly reaches the catalog behind it. A reaction inherits its scope entirely from the praise it hangs off — `PraiseReactionsFor` is `HasPraiseWith(PraisesFor(...))` — so a breadth key on reactions would be a second, silently divergent way of saying what `core.praises.read_all` already says. The three reaction keys exist only so that reactions can be switched off without switching off praise.

`core.student_achievements.write` is the key a teacher needs to award a badge, and the same key is what a pupil needs to pin one of their own badges to their profile. The two are separated by route and by predicate, not by key: `POST /student-achievements` resolves `StudentsForAwarding`, which subtracts the caller's own pupil records and their wards at every reach including an unrestricted grant, while `PUT /student-achievements/{id}/showcase` resolves `StudentAchievementsShowcasableBy`, which adds the caller's own rows back and nothing else. Minting a separate `showcase` verb would let an operator grant showcasing without awarding, which is harmless, and awarding without showcasing, which is not — a teacher who can award must be able to unpin what they awarded.

**Until a key is registered in CAS, nobody can hold it.** That fails closed — a caller is denied rather
than admitted — which is the right way round to be wrong, but it means an unregistered `*_all` key
presents as "this person cannot see the whole school" and reads like a policy misconfiguration rather
than a missing registration.

Seven areas have **no breadth key at all** — `schools`, `academic_sessions`, `reference`, `sections`,
`subject_offerings`, `rooms`, `calendar`. They are read/write/delete only. That is deliberate: they are
school-wide reference data with no per-person narrowing, so there is no narrow/wide split to express.
Minting breadth keys for them is a design change, not a registration gap. `student_guardians` has
neither a breadth key nor a read or delete key; it is a single `write` over the link table.

## The keys

### academic_sessions (3)
```
core.academic_sessions.delete
core.academic_sessions.read
core.academic_sessions.write
```

### achievements (3)
```
core.achievements.delete
core.achievements.read
core.achievements.write
```

### assignment_submissions (6)
```
core.assignment_submissions.delete
core.assignment_submissions.delete_all
core.assignment_submissions.read
core.assignment_submissions.read_all
core.assignment_submissions.write
core.assignment_submissions.write_all
```

### assignments (6)
```
core.assignments.delete
core.assignments.delete_all
core.assignments.read
core.assignments.read_all
core.assignments.write
core.assignments.write_all
```

### attendance (6)
```
core.attendance.delete
core.attendance.delete_all
core.attendance.read
core.attendance.read_all
core.attendance.write
core.attendance.write_all
```

### blueprints (7)
```
core.blueprints.create
core.blueprints.delete
core.blueprints.delete_all
core.blueprints.read
core.blueprints.read_all
core.blueprints.write
core.blueprints.write_all
```

### calendar (3)
```
core.calendar.delete
core.calendar.read
core.calendar.write
```

### concept_mastery (3)
```
core.concept_mastery.read
core.concept_mastery.read_all
core.concept_mastery.write
```

### content_placements (7)
```
core.content_placements.create
core.content_placements.delete
core.content_placements.delete_all
core.content_placements.read
core.content_placements.read_all
core.content_placements.write
core.content_placements.write_all
```

### curriculum (7)
```
core.curriculum.create
core.curriculum.delete
core.curriculum.delete_all
core.curriculum.read
core.curriculum.read_all
core.curriculum.write
core.curriculum.write_all
```

### enrollments (6)
```
core.enrollments.delete
core.enrollments.delete_all
core.enrollments.read
core.enrollments.read_all
core.enrollments.write
core.enrollments.write_all
```

### guardians (7)
```
core.guardians.create
core.guardians.delete
core.guardians.delete_all
core.guardians.read
core.guardians.read_all
core.guardians.write
core.guardians.write_all
```

### library (7)
```
core.library.create
core.library.delete
core.library.delete_all
core.library.read
core.library.read_all
core.library.write
core.library.write_all
```

### mindmaps (1)
```
core.mindmaps.read
```

### paper_generation (5)
```
core.paper_generation.create
core.paper_generation.read
core.paper_generation.read_all
core.paper_generation.write
core.paper_generation.write_all
```

### papers (7)
```
core.papers.create
core.papers.delete
core.papers.delete_all
core.papers.read
core.papers.read_all
core.papers.write
core.papers.write_all
```

### persons (6)
```
core.persons.delete
core.persons.delete_all
core.persons.read
core.persons.read_all
core.persons.write
core.persons.write_all
```

### praise_reactions (3)
```
core.praise_reactions.delete
core.praise_reactions.read
core.praise_reactions.write
```

### praises (6)
```
core.praises.delete
core.praises.delete_all
core.praises.read
core.praises.read_all
core.praises.write
core.praises.write_all
```

### question_bank (7)
```
core.question_bank.create
core.question_bank.delete
core.question_bank.delete_all
core.question_bank.read
core.question_bank.read_all
core.question_bank.write
core.question_bank.write_all
```

### reference (3)
```
core.reference.delete
core.reference.read
core.reference.write
```

### rooms (3)
```
core.rooms.delete
core.rooms.read
core.rooms.write
```

### schools (3)
```
core.schools.delete
core.schools.read
core.schools.write
```

### sections (3)
```
core.sections.delete
core.sections.read
core.sections.write
```

### staff (6)
```
core.staff.delete
core.staff.delete_all
core.staff.read
core.staff.read_all
core.staff.write
core.staff.write_all
```

### stream_comments (6)
```
core.stream_comments.delete
core.stream_comments.delete_all
core.stream_comments.read
core.stream_comments.read_all
core.stream_comments.write
core.stream_comments.write_all
```

### stream_posts (6)
```
core.stream_posts.delete
core.stream_posts.delete_all
core.stream_posts.read
core.stream_posts.read_all
core.stream_posts.write
core.stream_posts.write_all
```

### student_achievements (6)
```
core.student_achievements.delete
core.student_achievements.delete_all
core.student_achievements.read
core.student_achievements.read_all
core.student_achievements.write
core.student_achievements.write_all
```

### student_addresses (6)
```
core.student_addresses.delete
core.student_addresses.delete_all
core.student_addresses.read
core.student_addresses.read_all
core.student_addresses.write
core.student_addresses.write_all
```

### student_assignments (6)
```
core.student_assignments.delete
core.student_assignments.delete_all
core.student_assignments.read
core.student_assignments.read_all
core.student_assignments.write
core.student_assignments.write_all
```

### student_documents (6)
```
core.student_documents.delete
core.student_documents.delete_all
core.student_documents.read
core.student_documents.read_all
core.student_documents.write
core.student_documents.write_all
```

### student_guardians (1)
```
core.student_guardians.write
```

### student_notes (6)
```
core.student_notes.delete
core.student_notes.delete_all
core.student_notes.read
core.student_notes.read_all
core.student_notes.write
core.student_notes.write_all
```

### students (7)
```
core.students.create
core.students.delete
core.students.delete_all
core.students.read
core.students.read_all
core.students.write
core.students.write_all
```

### subject_enrollments (6)
```
core.subject_enrollments.delete
core.subject_enrollments.delete_all
core.subject_enrollments.read
core.subject_enrollments.read_all
core.subject_enrollments.write
core.subject_enrollments.write_all
```

### subject_offerings (3)
```
core.subject_offerings.delete
core.subject_offerings.read
core.subject_offerings.write
```

### teacher_assignments (6)
```
core.teacher_assignments.delete
core.teacher_assignments.delete_all
core.teacher_assignments.read
core.teacher_assignments.read_all
core.teacher_assignments.write
core.teacher_assignments.write_all
```

### teachers (7)
```
core.teachers.create
core.teachers.delete
core.teachers.delete_all
core.teachers.read
core.teachers.read_all
core.teachers.write
core.teachers.write_all
```

### timetable (8)
```
core.timetable.delete
core.timetable.delete_all
core.timetable.generate
core.timetable.override
core.timetable.read
core.timetable.read_all
core.timetable.write
core.timetable.write_all
```

`core.timetable.override` is the only verb outside read/write/delete/create anywhere in the surface, and
it is deliberate. `core.timetable.write` is the power to arrange a week; `core.timetable.override` is
the power to save a week that cannot physically be run — the same teacher in two rooms at once, or two
classes in one room — against a recorded reason. A school that wants only a head to accept that grants
the second key to one person and the first to every timetabler. Without a separate key the only way to
express "you may arrange the week but not force a double-booking" would be to withhold `write`
altogether, which withholds the job.

The key is a plain capability probe: it is asked with no attributes, and the rows it reaches are already
decided by the `core.timetable.write` grant on the same request. A reach or a row constraint pinned to
this key therefore narrows nothing that `write` has not already narrowed. The catalogue still offers the
reach and column fields for it, because the catalogue derives fields from the area rather than the verb,
and a rule author pinning them gets a rule that is redundant rather than one that is wrong.

A student-set clash is **not** overridable at any grant. See `docs/DESIGN-NOTES.md`.

`core.timetable.generate` is the second such verb, added 2026-09-24 for `POST
/timetables/{id}/generate`, and the argument for it is a reach argument rather than a power
argument. `core.timetable.write` narrows: at `reach=teacher_assignment` it reaches the slots of the
offerings a caller teaches, and the whole point of auto-fill is that it writes every section's week
at once from a solve that read every teacher, every room and every pupil's enrolment in the branch.
There is no honest way to narrow that, so the capability that widens `write` is named rather than
left implicit. It is asked as a plain probe with no attributes, exactly as `override` is, and the
rows it reaches are still decided by the `core.timetable.write` grant on the same request — a
caller holding `generate` alone gets a 404 on the draft, because `TimetablesWritableBy` reaches
nothing for them.

Two consequences worth stating. A caller whose `write` grant is narrowed to their own teaching
cannot reach an *empty* draft at all, because the predicate reaches drafts through the slots they
contain and an empty one contains none — so in practice `generate` belongs with an unpinned tenant
`write`/`write_all` grant. And a school that does not want auto-fill pressed at all simply does not
register or grant this key: the route then denies every caller and the week is arranged by hand,
which is the same fail-closed shape as everything else here.

---

## The question bank, blueprints and papers (2026-09-30)

Four areas, **26 keys**, none of them registered in CAS yet: `question_bank` (7), `blueprints` (7),
`papers` (7) and `paper_generation` (5). They are declared in `internal/authorization/entities.go` so
that the code names them and the catalogue serves their fields; registering them in production CAS is
a separate authorised step.

All four narrow by viewer and all four carry a breadth key. That is the point of saying so: this
surface deliberately does **not** copy the shape of `core.sections.*` and `core.subject_offerings.*`,
which have no `_all` variant and apply no viewer narrowing at all. Those two fail open, and a bank of
question stems and answer keys is the last place to repeat that. A narrowed caller reaches a
blueprint, a question or a paper through the subject-and-grade pairs they teach, exactly as
`core.curriculum.*` does; a row outside that is a 404.

`paper_generation` is a separate area rather than a verb on `papers`, and the argument is the one that
earned `core.timetable.generate` its own key: launching a run spends money at a model provider and
records a prompt, tokens and a cost. A school that wants every teacher to compose papers by hand but
only a head to press the AI button grants `core.papers.write` widely and `core.paper_generation.create`
to one person. It has **no delete key** at all, because a run is the provenance that explains a paper
that already exists: deleting one leaves a paper nobody can account for.

`question_bank` covers both `questions` and `question_versions`, and that is deliberate rather than
lazy. A version has no independent existence — `QuestionVersionsFor` is
`HasQuestionWith(QuestionsFor(...))` — so a separate key would be a second, silently divergent way of
saying what `core.question_bank.read` already says. The same argument applies to `blueprint_sections`
and `blueprint_constraints` under `blueprints`, and to `paper_sections` and `paper_questions` under
`papers`.

A question carries `subject_id` and `grade_level_id` and both are nullable, so a question with neither
is reachable only at unpinned tenant reach. The write handlers refuse to *create* such a question
unless the caller already holds that breadth, rather than letting someone write a row they could not
then read back. The same rule governs a paper carrying neither `blueprint_id` nor `exam_id`.

---

## Mind maps (2026-10-02)

One area, **one key**, not registered in CAS yet: `mindmaps` (1). It gates every route under
`/api/v1/learning/mindmaps`, including `POST .../drill/grade`. That route grades an attempt for
anyone holding this key; whether the result is also stored is decided by `core.concept_mastery.write`,
described under "Concept mastery" below. The reasoning behind the routes is in
`docs/mindmap-notes/read-path.md`.

`mindmaps` has **no breadth key**, and the argument is the one that left `praise_reactions` without
one. A reaction inherits its scope from the praise it hangs off; a mind map inherits its scope from
the library item it is drawn from. Every route loads the item through `access.LibraryItemsFor` under
the caller's own `core.library.read` decision, so whether a caller reaches every book in the school
is already said by `core.library.read_all`. A `core.mindmaps.read_all` would be a second, silently
divergent way of saying it, and the first time the two disagreed a pupil would either see a map of a
book they cannot open or be refused a map of one they can. The key exists only so that mind maps can
be switched off for a group without switching off the library.

Three consequences worth stating.

- **The key is necessary and not sufficient.** A caller holding the mind-map key and not
  `core.library.read` is refused with a 403 that names the library key. Every bundle granted the one
  must already hold the other. The retrieval engine's scopes callback, `GET /library/scopes`, is gated
  on `core.library.read` as well, so a caller without it would be refused by the engine anyway.
- **A reach or a row constraint pinned to this key narrows nothing.** The key is asked as a plain
  capability probe with no attributes, exactly as `core.timetable.override` is, and the rows are
  decided by the library grant on the same request. A rule author who pins one gets a rule that is
  redundant rather than one that is wrong.
- **The catalogue offers no fields for it.** The area has no table of its own. The book list is
  projected under the caller's `core.library.read` field policy and every other route relays the
  mind-map service's answer without reading it, so a field policy registered here would be offered
  in CAS and honoured by nothing. The area is pinned in `fieldlessAreas` beside `reference` and
  `schools` for that reason, and has no `areaColumns` entry.

Registration is the same three steps as every other area: `python scripts/cas-register-entities.py`
reads the key out of the section above, `go run ./cmd/catalogdump` followed by
`cas-sync-entity-fields.py` syncs its (empty) field list, and the grant is added to the role bundles.
Until the first step is run nobody can hold the key and every route answers 403, which is the right
way round to be wrong.

---

## Concept mastery (2026-10-02)

One area, **three keys**, none registered in CAS yet: `concept_mastery` (3). It has one table,
`concept_mastery`, so it has an `areaColumns` entry and the catalogue serves its columns. The
reasoning is in `docs/mindmap-notes/mastery.md`.

| Key | Gates | Typical holder |
|---|---|---|
| `core.concept_mastery.read` | `GET /learning/mindmaps/{item_id}/chapters/{section_id}/mastery` | pupil at `reach=self`, guardian at `reach=guardian_ward`, teacher at `reach=teacher_assignment` |
| `core.concept_mastery.read_all` | the same route, unnarrowed | head, academic coordinator |
| `core.concept_mastery.write` | `PUT` on the same path, and the storing half of `POST .../drill/grade` | pupil |

**There is no `write_all`, no `create` and no `delete`, each deliberately.**

- No `write_all`: nobody records mastery on behalf of someone else. The write path takes no
  `student_id`; the row is always filed under the caller's own student record, at every reach and
  for an unrestricted caller too. A breadth key would grant nothing the predicate would honour.
- No `create`: a row is created by the same act that raises it, against the same book and chapter.
- No `delete`: there is no delete route in this cut (plan decision D5 is still open). Rows go when
  the student row goes, and when the book is deleted.

Four consequences worth stating.

- **Both mastery routes also require `core.mindmaps.read` and `core.library.read`.** The mastery
  key is checked first, so its 403 names it. A row is only ever read or filed against a book the
  caller can open and a chapter that is in that book, which is the mind-map routes' own check.
- **The write key does not decide whose row is written; the predicate does.** `reach` on
  `core.concept_mastery.write` is ignored: the learner is `StudentsSelf` narrowed by any row pin on
  the grant (`section`, `grade_level`, `subject`), so a write grant pinned to one grade records
  only for pupils of that grade. A teacher or a head holding the key writes nothing, because they
  have no student record; they are answered `tracked: false`.
- **Withholding the write key does not withhold grading.** A caller with `core.mindmaps.read` and
  no `core.concept_mastery.write` still has their drill graded; nothing is stored. That is how a
  school lets a group practise without keeping a record.
- **A field policy on either key that withholds `node_id` or `state` refuses the request.** A
  mastery state is the pair, so a response or a write with one of them missing says nothing. On the
  grade route the same policy means nothing is stored and the grade is still answered.

Registration is the same three steps as every other area: `python scripts/cas-register-entities.py`
reads the keys out of the section above, `go run ./cmd/catalogdump` followed by
`cas-sync-entity-fields.py` syncs the fields, and the grants are added to the role bundles. Until
the first step is run nobody can hold a key, both mastery routes answer 403 and every grade is
answered and not stored.
