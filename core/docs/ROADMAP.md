# Roadmap — what is left, in the order it should be done

**Verified against the code on 2026-09-25.** Every claim about what exists carries a
`file:line`. Claims that the repository cannot settle are marked UNVERIFIABLE and say what
would settle them.

The previous edition of this document described shipped code as "proposed", diagnosed a
400 as a permissions failure, and omitted two complete modules. A plan that is wrong about
the present is worse than no plan, because it reads as a specification. What follows
replaces it rather than appending to it.

---

## 0. CAS — nothing is blocked, and this section was wrong

**Checked against production CAS on 2026-09-25 with a superadmin token. Every claim below
is a live query, not a reading of a document.**

This section previously listed three blockers and called one of them "the highest-value
unblock available". All three were false. They came from `docs/CAS-KEYS-TO-REGISTER.md`,
which says twice that 42 classroom and recognition keys are unregistered. They are
registered. So is everything else.

```
GET /v1/admin/entities?service_id=<Emerge Core>   ->  209 entities
core.stream_posts.write            REGISTERED
core.stream_comments.read          REGISTERED
core.assignments.write             REGISTERED
core.assignment_submissions.write  REGISTERED
core.achievements.read             REGISTERED
core.student_achievements.write    REGISTERED
core.praises.read                  REGISTERED
core.praise_reactions.write        REGISTERED
core.timetable.generate            REGISTERED
core.teachers.read                 REGISTERED
```

And the principal holds all of it:

```
scripts/cas-principal-grants.py  ->  GAP: 0 of 175 entities the principal
                                     cannot exercise school-wide
core.teachers.read       via All staff - read [reach=tenant]
core.timetable.generate  via Principal - everything in this school [reach=tenant]
```

### What the three entries actually were

**0.1, "the principal cannot read the teacher directory".** The grant exists. The symptom —
"This account cannot read the teacher directory" — was the same misattribution as §0.2:
`sections-board.tsx:71` rendered that sentence on *any* error from the directory query, not
only a 403. Fixed 2026-09-24 in the fourteen-site sweep that made permission wording
reachable only on a 403. If the message is still seen, it now means what it says.

**0.3, "`core.timetable.generate` is unregistered".** Registered, and granted.

**0.5, "forty-two capability keys are declared and unregistered".** All registered. The
classroom and recognition modules are reachable. They are still undocumented (§1.2) but they
are not dead.

### The lesson, which is the durable part

`docs/CAS-KEYS-TO-REGISTER.md` is a *plan* someone wrote before doing the work. It was never
updated after the work was done, and three separate entries in this roadmap inherited its
claims without anyone querying CAS. A document describing an intention reads exactly like a
document describing a state.

**Any claim in this repository about what production CAS contains is a hypothesis until a
live query settles it.** The query takes thirty seconds:

```bash
CAS_SERVICE="Emerge Core" python scripts/cas-register-entities.py      # dry run, lists gaps
CAS_SERVICE="Emerge Core" python scripts/cas-principal-grants.py       # dry run, prints GAP: n of m
```

Both are read-only without `--apply`. Run them before writing anything here about CAS.

`docs/CAS-KEYS-TO-REGISTER.md` should be deleted or re-headed as a historical record; leaving
it as-is guarantees this happens a fourth time.

---

## 1. What is already built

### 1.1 Examinations — BUILT, and the previous roadmap called it "proposed"

- `internal/ent/schema/exam.go:13-161` — `Exam`, `ExamSubject`, `ExamSitting`, including the
  `(calendar_day_id, period_id, section_id)` binding.
- `internal/transport/http/exams.go:47-71` — full CRUD on all three, gated on
  `TimetableRead/Write/Delete(+All)`.
- Clash checking reuses the existing engine rather than a second one:
  `createExamSitting` (`exams.go:1333`) → `settleSittingClash` (`exams.go:1267`) →
  `timetablesvc.AllRules()` (`exams.go:1317`).

**So class-test scheduling largely exists.** A sitting already occupies specific periods on
a specific day for a specific section, and cannot be placed where it would clash. What is
missing is everything after the bell: the displaced lesson, the marks, the result.

### 1.2 Classroom and recognition — BUILT, reachable, undocumented

A complete classroom module (stream posts, stream comments, assignments, assignment
submissions) and a separate recognition module (achievements, student achievements,
praises, praise reactions). The previous roadmap did not mention either as done, pending,
or out of scope — they were simply absent from it.

An earlier edition said both were unreachable behind unregistered CAS keys. **That was
false** — see §0. All 42 keys are registered and the principal holds them. What these
modules lack is documentation and, in places, a screen; not permission.

### 1.3 Library, curriculum and retrieval — BUILT and in production

Assets, content items, curricula, curriculum nodes, placements; upload through core rather
than to the object store; inline preview; deferred (GPU) versus immediate ingest; scope
stamping so a 9A note is not visible to 9B; a 200 MB ceiling enforced at four layers.

Known live state: the retrieval engine's confirm gate is off for this deployment
(`RE_REQUIRE_CHAPTER_CONFIRMATION=false`), because a parked upload is terminal — emerge-core
has no way to confirm one. If that gate is ever switched back on, restricted PDFs break
again unless the engine has by then learned to carry gate labels through park → confirm.

**Scoped retrieval is BROKEN downstream as of 2026-09-25, in the retrieval engine, not
here.** Upload, tagging, stamping and indexing all work: core stamps `restricted_to` on
every school-scoped ingest and the engine stores it. But the engine's search paths call
`build_filter(...)` without the caller's held labels — `_held_labels` has exactly one call
site, `/whoami` — so the fail-closed default "this caller holds nothing" applies to every
search. Measured against the deployed engine:

```
document              restricted_to   /retrieve
doc_0e52489df385      non-empty       0 passages   (232 chunks)
doc_7b34b17ec332      non-empty       0 passages
doc_c65707009107      non-empty       0 passages
doc_751e5031871a      []              returns
doc_ecdc295c08e8      []              returns
```

So **every** school-scoped document is invisible to everyone, admins included — the
admin bypass lives in `_visible`, and the search path builds a Filter directly without
passing through it. This is the opposite of a leak and it is worse than it sounds: the
feature reports healthy at every checkpoint and returns nothing.

Do not read "scope stamping works" as "scoped search works". It is fixed at a seam in
`lms-retrieval-engine`, owned by that repo's session; an admin-only fix would restore an
operator's console and leave every teacher seeing nothing.

### 1.4 Grading schemes — BUILT and wired

`internal/ent/schema/grading.go:15-80`, with `supersedes_id` / `superseded_by` (line 37,
56-59) so a scheme is superseded rather than edited in place.
`subject_offerings.grading_scheme_id` is wired both ways: `internal/ent/schema/subject.go:77`,
and the write path at `internal/transport/http/subjects.go:318, 425-426, 505-509` including
an explicit clear.

---

## 2. Assessment: evaluative and non-evaluative — THE NEW WORK

### 2.1 What exists, precisely

**There is no notion anywhere in the schema of an assessment counting or not counting
toward a final mark.** No weight, no flag, no type serving that purpose. Confirmed by
exhaustive grep.

`ExamSubject.maximum_marks` (`exam.go:77`) is `Positive()` and **required**;
`pass_marks` (`exam.go:78`) is optional. So "an assessment with no marks" is not a
representable state today, and any design must either keep marks mandatory or make them
optional deliberately.

### 2.2 The second marks concept, which is the trap

`AssignmentSubmission.marks_obtained` (`assignment.go:173`) and
`AssignmentSubmissionItem.marks_obtained` (`assignment.go:224`) already exist, with a check
constraint forcing marks once status is `graded` (`assignment.go:206`).

**They have no relationship to `grading_schemes` or to the exam surface, and nothing
aggregates them.** The only reads are validation against the assignment's own maximum
(`assignments.go:1367-1369`). Homework marks currently count for nothing, anywhere.

Designing an evaluative flag on exams while classroom homework carries its own disconnected
marks produces two half-truths about a child's performance and a reconciliation migration
later. This is the decision to make consciously now — see §7.1.

### 2.3 The design

Add to `exams`:

- `assessment_kind` enum `evaluative | practice`, default `evaluative`.
- `result_weight` numeric, nullable. Refused unless `assessment_kind = evaluative`; a
  weight on a practice test is a contradiction and must fail loudly rather than be ignored.

The distinction sits on the **exam**, not on `exam_subjects`. A school schedules "Unit Test
1" or "Class test — chapter 4" as a whole; an exam where some subjects count and others do
not has no plausible reading. If one ever appears, it is a new exam.

**A practice test is not "weight zero".** Weight zero still produces a row in a report card
— a zero-weighted line for a practice test a child did badly on, in a document a parent
reads. The distinction must reach the document, not only the arithmetic:

- `student_results` rows are created **only** for sittings of an evaluative exam.
- Report-card generation filters on `assessment_kind = 'evaluative'` and can never be
  configured to include practice results.
- A practice result remains fully visible to the teacher, to the pupil, and in the section
  calendar. It is excluded from the record, not hidden from the people it is for.

`maximum_marks` stays required for both kinds. A practice test out of 20 is still out of
20, and making marks optional to express "practice" would conflate two different things.

### 2.5 Result composition — how the hundred is assembled

**`grading_schemes` is the wrong tool for this and always was.** It maps a finished score to
a band (`GradeBand`, `grading.go:42-48`): 91-100 is A1. It says nothing about where the
score came from. What a school actually configures is the composition:

> Half-yearly is out of 40 and carries 20 of the final 100. There are four class tests of
> 10 each and the best two count. The annual exam carries the rest.

`exams.result_weight`, added 2026-09-25, cannot express that and **must be removed**:

- A weight on the exam is global, but the half-yearly weighs differently in Science than in
  Art. Weight is a property of a subject's scheme, not of the exam.
- "Best two of four" has no per-exam weight at all. The four tests share one weight between
  them, and which two count is not known until the marks are in.

Leaving it would give two places to say what a component is worth, which is the same
two-half-truths trap as §2.2. It goes.

#### The three tables

**`result_schemes`** — a named composition, scoped to an academic session, carrying
`total_marks` (100 by default), `supersedes_id` and `status`, exactly the shape
`grading_schemes` already uses. A scheme is superseded, never edited once results exist.

**`result_components`** — the parts of that total:

| | |
|---|---|
| `name` | "Half-yearly", "Class tests" |
| `maximum_marks` | what the component is marked out of — 40 |
| `weight` | what it contributes to `total_marks` — 20 |
| `aggregation` | `single` / `sum` / `best_of` / `average` |
| `take_best` | N, required iff `aggregation = best_of`, forbidden otherwise |
| `position` | display order |

**`result_component_exams`** — which exams feed a component, unique on
(component, exam). Four rows for the four class tests; one for the half-yearly.

#### How a component scores, and why it normalises

Each linked exam contributes a **fraction** — the pupil's mark divided by that exam's
`maximum_marks`. The component aggregates fractions, then multiplies by its own
`maximum_marks`:

```
best_of(2): take the two highest fractions, average them
sum:        add the fractions, cap at 1
average:    mean of all fractions
single:     the one fraction
final    =  Σ over components of (component fraction × component weight)
```

Fractions rather than raw marks, deliberately: it means four class tests do **not** have to
be out of the same number. A school that sets one test out of 15 by accident gets a correct
result instead of a silently skewed one, and no cross-exam equality constraint has to be
invented or enforced.

`grading_schemes` still applies, unchanged, to the number that falls out. The two are
complementary and neither replaces the other: **`result_scheme` computes the score,
`grading_scheme` names it.**

#### Where it attaches

`subject_offerings.result_scheme_id`, beside the existing `grading_scheme_id`. "How this
subject is marked" is both of them.

#### Validation, at publish rather than at insert

A scheme under construction does not add up, so the sum is checked when it is activated,
not on every row:

- Σ `weight` over a scheme's components **=** `total_marks`. Not ≤, not ≈.
- A `best_of` component must link at least `take_best` exams. Best two of one is not a rule,
  it is a mistake.
- `take_best` present iff `aggregation = best_of`.
- **A `practice` exam may not be linked to a result component.** §2.3 says a practice
  assessment does not count; a link would say it does. The two must not be able to disagree,
  so the link is refused rather than ignored.

#### What this does not do yet

Nothing computes a result — that is §4, and it needs marks entry first. These tables are the
*configuration*; the arithmetic above is specified here so that whoever builds §4 implements
the stated rule rather than inventing one.

Whether assignment marks can be a component source is **§7.1, still open**. The
`result_component_exams` table is named for exams deliberately: if assignments become a
source, that is a second link table, not a nullable column pretending to be two things.

### 2.4 Deny paths, stated up front

- A `result_weight` on a practice exam: 422, naming the contradiction.
- Changing `assessment_kind` on an exam that already has results: refused. The alternative
  silently rewrites a child's record.
- A report card asked to include a practice result: there is no such request to make. The
  filter is not a parameter.

---

## 3. The section calendar

**DONE, with one stated limit on the 150 sittings that predate it.**

`GET /api/v1/sections/{id}/calendar` ships (`internal/transport/http/sectioncalendar.go`) and
composes the branch calendar, the section's slots, its deviations and its exam sittings into
one date-indexed answer.

**A sitting now cancels the lesson it displaces.** `createExamSitting`
(`internal/transport/http/exams.go:1375`) writes a `cancelled` `TimetableDeviation` for each
lesson the fresh placement displaces, on the same `unitOfWork` as the sitting row. The
deviation names the sitting that wrote it through `timetable_deviations.exam_sitting_id`
(`20260927172349_add_deviation_exam_sitting.sql`), which is `ON DELETE CASCADE`, so deleting
a sitting — or the exam subject or exam above it — removes exactly the cancellations that
sitting made and nothing else. The set of lessons cancelled is the set `settleSittingClash`
already excluded from `timetablesvc.AllRules()`; there is no second clash checker.

Decisions worth knowing before touching this, in full in docs/DESIGN-NOTES.md under "A sitting
cancels the lesson it displaces, and owns only what it wrote":

- A deviation the system wrote carries `created_by = NULL`, like an auto-marked response. The
  non-null `exam_sitting_id` is what says the system wrote it.
- If a human has already cancelled that lesson on that day, the sitting writes nothing for that
  slot and claims nothing. `(timetable_slot_id, deviation_date)` is unique, and adopting their
  row would mean deleting the exam deletes their decision.
- There is no `PATCH` on a sitting and its placement fields are `Immutable()`. A move is a
  delete and a re-create, which the cascade already handles. Adding a real update path is a
  contract change and should be asked for, not assumed.

**The 150 sittings that predate this are unlinked, and there is no back-fill.** Every sitting
created before 2026-09-27 has no deviation behind it, so the lesson it displaces still shows as
scheduled, and deleting one of them releases nothing — it cannot, because nothing points at it.
That is the state that already existed; it is not made worse. A back-fill would have to infer
which deviation belongs to which sitting from date and period, which is exactly the inference
the `exam_sitting_id` column exists to avoid. If those sittings matter, the honest repair is to
delete and re-create them through the API, which writes the cancellations properly.

Still owed: the global calendar stays the branch calendar. It is not a different thing.

---

## 4. Marks, results and report cards

**ALL THREE STEPS ARE BUILT.**

Order:

1. Marks entry against an `exam_sitting` — per pupil, per exam subject, with the
   `grading_scheme` resolved from `exam_subjects.grading_scheme_id` falling back to
   `subject_offerings.grading_scheme_id`. **BUILT** — `student_exam_marks`, `internal/transport/http/marks.go`.
2. `student_results` — derived, recomputable, and written only for evaluative exams (§2.3).
   **BUILT, and there is no table.** `GET /api/v1/subject-offerings/{id}/results` composes the
   result on the way out of `result_schemes`, `student_exam_marks` and
   `assignment_submissions`, through `results.Compute`, and stores nothing. "Derived and
   recomputable" was read literally: a `student_results` table would be a second source of truth
   with three writers to invalidate it, and nothing needs one until something is slow. A
   `practice` assessment cannot reach it because `linkResultComponentExam` refuses to link one.
3. Report cards — a rendering of a computed result for a session, never a second store of truth.
   **BUILT 2026-09-28, and there is no table.** `GET /api/v1/students/{id}/report-card` returns one
   line per subject the pupil is actively enrolled in for an academic session — the same
   `results.Result` breakdown step 2 returns, plus the band `grading_schemes.scale_json` names it
   with. `internal/transport/http/reportcards.go`. It does no arithmetic of its own: it calls
   `planOfferingResult`, `gatherResultMarks` and `results.Compute`, the same three the
   per-offering endpoint calls. Reasoning in docs/DESIGN-NOTES.md, "A report card is every
   subject's result and the band that names it".

Derived state is recomputable: keep the marks, compute the result, cache neither until measured.

**What a renderer must carry over from the endpoint.** The response's per-pupil `final` is
stricter than `results.Result.Final()`: it is also false when the scheme links an exam for which
this subject has no paper, which `composition.components_not_scored` names along with the weight
that is consequently missing from the total. A report card that asked `Result.Final()` alone would
print a settled-looking number for a result that is a fifth of a scheme. Check the envelope's
`final`, and if `composition` is not empty, say what is not set up rather than printing a score
that silently omits it.

**An offering with no `result_scheme_id` is the normal case, not an error** — the endpoint answers
200 with `composed: false` and a reason. Nothing downstream should treat it as a failure.

**A report card must not present a provisional result as final.** Added 2026-09-25 with
`student_exam_marks.provisional`. An online test with a written question is auto-marked for the
objective half and waits for a teacher for the rest; the mark is real but not settled, and
`results.Compute` carries that through as `Result.Provisional`, `ComponentResult.Provisional` and
`SourceResult.Provisional`. Ask `Result.Final()`, which is `Complete && !Provisional`. Whoever builds
the renderer must decide between refusing to render such a result and rendering it conspicuously
marked, but must not print the total unqualified — an unmarked written answer understates the pupil,
and understatement is the direction nobody queries. Note that `Complete=false` (a mark is missing) and
`Provisional=true` (a mark is not final) are different sentences and deserve different wording on the
page. Reasoning in docs/DESIGN-NOTES.md, "A half-marked paper is a number that is not final yet".

**What the card decided, 2026-09-28.** It renders a provisional total rather than refusing it, and
says so three times: the subject's `status` is `provisional`, its `final` is false, and the card
carries `provisional: true` at the top so a page header can qualify itself without walking the
lines. The two sentences above are kept apart as asked — `in_progress` is a mark missing and
`provisional` is a mark not settled — and `awaiting_marks` is the third, which is neither.
The band is the decision that turns on them: it is named only when the subject is complete and
wholly composed, because `Result.Percentage()` over a part-marked subject is a floor and a band
named from a floor prints an E for a pupil who has not sat the annual. **No total across subjects
is computed** — that is a school's policy and §7 has no answer for it.

---

## 5. Elective choice sets

**BUILT 2026-09-28.** `elective_groups`, `elective_group_offerings`, and enrolment into one arm
through `StudentSubjectEnrollment`. Migration `20260927185629_add_elective_groups.sql`.
Reasoning in docs/DESIGN-NOTES.md under "Elective choice sets: one group per section, one arm
per pupil".

**The clash engine needed no change, and that was re-proved rather than re-quoted.** The
September finding stands — `judge()` (`internal/service/timetable/clash.go:582-626`) never
compares `SectionID`, and `RuleStudentSet` intersects the rosters `forEngagement`
(`internal/service/timetable/students.go:75-80`) returns. But
`TestTwoArmsOfOneGroupInOnePeriodAreNotAClash` now runs the real engine over two real arms of a
real group at one section and period and gets `report.Clear()`, and
`TestAPupilInBothArmsIsTheClashTheEngineFinds` puts one pupil in both and gets exactly one
`RuleStudentSet` clash naming that pupil. Nothing in `clash.go` or `students.go` was touched.

### The shape

- **`elective_groups`** — `(academic_session_id, section_id, name, code, description, position,
  status)`, unique on `(section_id, code)`. **Scoped to a section, not to a grade**, because an
  arm is a `subject_offering` and a `subject_offering` is already section-scoped; a grade-scoped
  group would hold subjects and need a per-section resolution step that fails the day one
  section lacks that offering. `academic_session_id` is read off the section and never accepted
  from the caller.
- **`elective_group_offerings`** — the arms. Unique on `subject_offering_id` **alone**: an
  offering is an arm of at most one group, or "exactly one arm" has two answers for one pupil.
  `NO ACTION` to `subject_offerings` (unlink before you delete the subject), `CASCADE` from the
  group (deleting a choice set unmakes the question, not the pupils' answers).
- **The choice is a `student_subject_enrollments` row** with `is_elective_choice = true`. No
  second enrolment store.

### Routes

`/elective-groups` CRUD and `/{id}/offerings` probe `SubjectOfferingsRead/Write/Delete`, with
`CurriculumReadAll`/`CurriculumWriteAll` as the breadth key — the same borrowing `result-schemes`
makes, and the fourth instance of the pattern §8 records. `/{id}/choices` (GET, POST) and
`/{id}/choices/{enrollmentID}` (PATCH) probe `SubjectEnrollmentsRead/Write` and their `*_all`
counterparts, because the row they write is a subject enrolment. No key was invented.

### The three decisions, and what is still open

**"Exactly one arm" is a handler check, not a constraint.** It intersects the pupil's *active*
subject enrolments with the group's arms, so it catches a pupil who reached the first arm by any
door. A database constraint would need a denormalised `elective_group_id` on
`student_subject_enrollments` — a second place recording group membership. **The ordinary door
is closed as of 2026-09-28**: `createSubjectEnrollment` and the one status transition that can
reopen a withdrawn arm (`{"status":"active"}` on `PATCH /subject-enrollments/{id}`) both call
`holdsNoOtherArm`, which reuses `electiveArms` and `activeArm` from `electives.go` rather than
restating the rule, and answers 409 naming the arm held and the `PATCH .../choices` that moves a
pupil properly. An offering no group holds is untouched, and a dropped row is still not a
choice. One known hole remains, deliberate: two simultaneous posts of *different* arms for one
pupil can both land under READ COMMITTED (the same arm twice is already caught by the existing
unique index).

**A pupil in no arm is legal.** `GET /elective-groups/{id}/choices` lists every active enrolment
in the section with its arm or `null` and a `without_choice` count, so the unchosen are reported
rather than refused.

**Changing arm is a drop and a new enrolment**, because `subject_offering_id` is `Immutable()`.
The old row survives with its marks and attendance; nothing is migrated. The consequence, stated
rather than solved: the new subject's result is `Complete=false` for any component drawing on an
exam sat before the move, and a report card must say what is missing rather than print the
number. What a school wants done with the marks from the arm a pupil left is a policy decision
nobody has made.

### The one invariant a slot generator must hold

`forEngagement` falls back to the whole section roster when `subject_offering_id` is nil:

```go
if offeringID != nil { return s.byOffering[*offeringID] }
return s.bySection[sectionID]
```

So an elective slot left with a null `subject_offering_id` silently claims every pupil in the
section, two such slots intersect completely, and the schedule is refused for a clash that does
not exist. `TestAnElectiveSlotWithNoOfferingClaimsTheWholeSection` pins this as a passing test
so the next person meets it as an assertion rather than as a diagnosis three layers from the
cause. **Every slot generated for an elective offering carries a non-nil `subject_offering_id`.**

Still owed: nothing generates elective slots yet, and there is no screen. The one honest gap
from September remains — no test puts two *same-section* electives on the same teacher or the
same room, and the code path has no section-awareness that could fail, so it is a missing
fixture rather than a risk.

---

## 6. UI owed for backends that already shipped

- Grade ↔ period-scheme mapping.
- Bell-schedule clone across grades.
- The per-day "no assembly" suppression toggle (`BellSchedulePeriod.runs`).

Each of these has a working backend and no screen.

---

## 7. Decisions that need a person

### 7.1 Do assignment marks count toward the final result? — ANSWERED 2026-09-25

**Yes, when the teacher says so, and that depends on the curriculum.** So it is neither
"always internal assessment" nor "never leaves the classroom" — it is a per-scheme
configuration decision, exactly like a weight.

That makes it a **second component source** beside `result_component_exams`, not a change
to the existing one: `result_component_assignments`, linking a component to the assignments
that feed it. A component may then draw from exams, from assignments, or from both, and the
fraction arithmetic of §2.5 is unchanged — an assignment contributes
`marks_obtained ÷ assignment.maximum_marks` exactly as an exam contributes its own fraction.

Two consequences to hold on to:

- **A component with no linked source of either kind cannot activate.** Today the rule is
  stated only for `best_of`; it becomes general.
- **`AssignmentSubmission.marks_obtained` stops being write-only** (§2.2), which was the
  half-truth that made this question worth asking in the first place.

### 7.2 Two accounts can administer every school's retrieval data

`superadmin` and a personal Gmail address. Still open.

### 7.3 Outbox retention

Still open. Do not invent a policy.

---

## 8. Standing debt

- `PATCH /branches/{id}` accepts and silently ignores `code`; the field is `Immutable()` and
  the request should be a 422.
- Sections cannot clear `room_id` or `class_teacher_id` — no JSON-null clearing convention.
  **Fixed 2026-09-24** for sections; the convention (`wasCleared`/`rejectNull` over
  `response.DecodeFields`, `common.go:157-161`) was always general and `sections.go` simply
  was not using it.
- `assignments.maximum_marks` had the same gap. **Fixed 2026-09-28.** `updateAssignment` now
  clears on an explicit null (`wasCleared` over `response.DecodeFields`, beside the existing
  `ClearDueAt`), so `{"maximum_marks": null}` unmarks the assignment instead of answering 200
  and changing nothing. The clear sits **behind** `keepsAssignmentMaximum`, which already
  treated a sent null as a withdrawal and refused it with 422 `assignment_feeds_a_result`:
  a composed assignment is refused exactly as before, an uncomposed one is now honoured.
  Omitting the key still leaves it alone.
- `reviseResultScheme`'s supersession copied assignment links without re-checking that each
  linked assignment still had a usable maximum. Activation re-checks, so a bad link could never
  reach an active scheme — the defect was that the successor was born holding one and nobody was
  told. **Fixed 2026-09-28, by reporting rather than refusing.** The links still all travel, and
  the 201 gains `warning: "assignment_has_no_maximum"`, `carried_without_maximum` and a `message`
  naming each one — only when there is something to say; an ordinary supersession's reply is
  unchanged. Refusing the supersession was rejected because it makes a scheme in use unfixable
  until an assignment that is somebody else's to fix is fixed; dropping the link was rejected
  because it destroys the record and turns a precise problem into a vaguer one. The copy reuses
  the activation predicate (`resultComponentUnmarkedAssignments`, which
  `resultComponentUnmarkedAssignment` now delegates to) so there is no second definition of
  "unusable" to drift.
- `minutes_per_week` has no write path.
- Breadth keys borrowed rather than owned: `grading-schemes` probes with
  `authorization.CurriculumReadAll` (`grading.go:44`); `rooms` and `calendar` probe with
  `TimetableReadAll`/`WriteAll` throughout `timetable.go` (lines 1995, 2075, 2175, 2217,
  2281, 2358, 3588, 3634, 3675, 3748, 3838, 3899, 3958). Seven areas deliberately have no
  breadth key of their own; these borrowings are the documented consequence, not an
  oversight — but they should be recorded where the reader is, not discovered.
- No client-side zero-byte file refusal; an empty upload fails at the object store instead
  of at the picker.
- **`grading_scheme_id` did not check session agreement and `result_scheme_id` did.**
  **Fixed 2026-09-28, on `grading_scheme_id`, as the entry said it should be.**
  `gradingSchemeAttachable` (`subjects.go`) now reads the scheme and refuses one whose
  `academic_session_id` differs from the offering's, with 422 `grading_scheme_other_session`,
  on create and on update alike. Reading the row first is the point of the shape, not an
  extra query: an unknown id is a 404 naming the grading scheme instead of the generic 409 a
  foreign-key violation produces. The offering's `academic_session_id` is `Immutable()`, so a
  pair that agrees at attachment cannot drift apart afterwards. Thirty production offerings
  carry a grading scheme and none of them cross a session, so nothing existing was broken.
  Clearing is untouched: `{"grading_scheme_id": null}` still detaches and an omitted key still
  leaves it alone — the check sits inside the `!= nil` branch, above `wasCleared`.
- **The symmetry stops at the session. An inactive grading scheme may still be attached, and
  that is a decision.** `resultSchemeAttachable` also refuses a scheme that is not `active`,
  and the grading pair deliberately does not. A result scheme's `draft` means the composition
  has not been checked to account for every mark it is out of — an unmet check, so attaching
  it is attaching something unfinished. `inactive` on a grading scheme means no such thing:
  the status is only `active | inactive`, there is no `draft`, and a retired scale is still a
  well-formed number-to-label map. Schemes supersede rather than edit (`supersedes_id`), so an
  inactive scheme is routinely a superseded ancestor that offerings legitimately still point
  at. The deciding fact is that the consumer does not care: `reportGradingSchemes`
  (`reportcards.go`) fetches the attached scheme by id with no status predicate, so an
  inactive scheme already bands report cards wherever one is attached. Refusing it at the door
  while honouring it in rendering would be an inconsistency, not a safeguard.
- `PATCH /bell-schedule-periods/{id}` required `start_minute` and `end_minute` on **every**
  request, so toggling `runs` forced the client to read the row and write both times back,
  losing anyone else's retiming in between. **Fixed 2026-09-28.** The span is optional on the
  update and written only when sent (`bellSpanChanged`, `timetable.go`), the way `runs`
  already behaved three lines below. The other call site, `createBellSchedulePeriod`, still
  demands it: the columns are `NOT NULL` with no default and a period with no times is not a
  representable row. A span that is sent is still judged whole — half a span is a 400, a null
  on either half is a 400, and `start >= 0`, `end <= 1440`, `end > start` still hold.

---

## What is deliberately not being built

- A second clash checker. Exams reuse `timetablesvc.AllRules()`.
- A schema or database per academic year. The session is a scope dimension.
- Editing questions or content in place. Definitions are versioned; history is immutable.
- Report cards as a store of truth. They render `student_results`.
