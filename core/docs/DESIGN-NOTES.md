# Design notes

Why the code is the way it is. The source carries no comments, so the
reasoning lives here.

Most of these are not preferences. They are decisions taken after something
was found to be wrong, and the wrong version is usually the one that reads
more naturally. That is the point of writing them down.

---

## Authorization: policy, scope and fields

### `internal/authorization/authorization.go`

Service is emerge-core's key in the CAS entity tree, and the first segment
of every entity key.

CAS derives the key rather than accepting one: its API takes a segment at a
time and computes service.area.action, and entities.key is UNIQUE across
every service, so the prefix is the namespace that keeps this service's
students.read from colliding with another's. A hyphen is illegal in a
segment, which is why the service is "core" and not "emerge-core".

The *_all entities lift row-level narrowing to the whole school; without
one, a caller sees only rows they own. CAS cannot express the narrow
case itself, so this pair is how the two halves meet.

read_all and write_all are separate questions. A reporting account given
school-wide sight must not thereby be able to edit every pupil, so
breadth is asked once per direction rather than once per domain.
Delete has its own breadth key rather than borrowing write_all. It is
the same principle applied to itself: breadth that arrives by omission
of a key is breadth nobody granted, and granting school-wide edit should
not silently hand over school-wide deletion.

Creating is its own grant, separate from editing. Enrolling a new pupil,
hiring a teacher or registering a guardian brings a person into the
school; correcting a spelling does not. An office that may do the second
is not thereby allowed the first, and read/write/delete had no way to
say so -- write covered both.

There is no create_all. Row breadth answers "which existing rows may you
reach", and a row being created is not one of them.

Reach is how far the grant extends WITHIN a school: the caller's own
rows, their wards, their sections, or all of it. It is the abstract
breadth CAS granted; working out which concrete rows satisfy it is
emerge-core's job.

Not to be confused with the grant's scope, which says which school the
grant applies IN. CAS renamed the wire field to "reach" for exactly that
reason -- both had "tenant" as a legal value meaning different things.

Fields is the field policy safe to apply to every row this decision
admits: the intersection across the alternatives that admitted, since
their rows are unioned. Callers that can tell which grant covers a
given row should ask FieldsForRow instead and get the exact answer.

Grants are the alternatives that admitted, each keeping its own pins
with its own field policy. Splitting them is what makes "9A in full,
9B by name and roll number" expressible: the pairing of rows to fields
is the policy, and merging it away loses the policy.

Constraints are the row fields the admitting alternatives pinned, such
as a teacher fixed to section 9A. They narrow the query and only narrow
it: they are ANDed onto an already-authorized, already-scoped one.

Each inner group is one alternative's pins, ANDed together; the groups
are ORed, because alternatives are ORed. Two policies pinning 9A and 10B
give a caller both, which is what granting somebody two sections means.
An empty outer slice pins nothing.

### `internal/authorization/constraint.go`

A row field names a column of the data, not a value of the request.

CAS has one condition mechanism, so a policy pinning a teacher to 9A is
written the same way as one testing a caller attribute:

{"field": "section", "operator": "=", "values": ["9A"]}

The difference is who can answer it. A caller attribute is supplied with the
request and evaluated to a yes or no; a row field is a property of every row
the query might return, so it has to become part of the query instead. CAS
cannot evaluate it -- it has never seen this school's sections -- and nor can
the boolean evaluator here, which is handed one request and not a table.

So row fields are lifted out of the expression and travel on the decision as
constraints, for the data layer to translate into predicates. They are
excluded from Eval and from Fields for the same reason scope is: left in,
they would name an attribute nobody supplies, Satisfiable would skip the
alternative, and pinning a teacher to a section would silently revoke their
access instead of narrowing it.

Constraint is one row field the policy pins, ready to become a predicate.

Values are strings because that is what a policy author writes: "9A" is a
section code, and the data layer resolves it against this school's own
tables. Nothing here knows what a section is.

constrainedOperators are the only ones that translate to a predicate.

Equality and membership become an IN and mean the same thing in SQL as they
do in CAS. Nothing else does. A negation is the dangerous one: CAS holds it
when EVERY value of a multi-valued attribute satisfies, and holds it
vacuously when the attribute is absent, neither of which a NOT IN across a
join reproduces. Ordering and substring operators have no absent-value story
at all. Refusing them costs a policy nobody has written yet; approximating
one would silently return rows the policy meant to exclude.

Constraints lifts the row fields out of an alternative's expression.

The second return is false when the expression uses a row field in a way
that cannot be turned into a narrowing predicate. That refuses the
alternative rather than honouring half of it, because a condition dropped on
the way to the query is a condition that widened it.

collect walks the tree, gathering row fields that sit in conjunctive
position. conjunctive is true while every group above this node is an AND,
which is what makes an extra predicate a narrowing rather than a change of
meaning.

Any other OR: a row field inside it is not a narrowing. The
branch it sits in might not be the branch that admitted, so
applying it would filter rows the other branch allowed.

Satisfied reports whether this constraint can match anything at all.

A constraint with no usable values is a policy that failed to resolve, and
an empty IN matches nothing -- which is the right answer, but the caller
should be able to say so rather than return a mute empty page.

anyUnpinned reports whether some alternative constrains no rows at all.

Such an alternative covers everything the scope reaches on its own, so
applying the others' pins on top would subtract rows this one already
grants -- ORed grants can only add.

mergeFields combines the field policies of every alternative that admitted.

Rows are unioned across alternatives, so the fields must be intersected. A
caller granted "9A with phone" and "10B with address" gets both sets of rows,
and showing address on all of them would expose a 9A pupil's address that
only the 10B policy allowed -- the pairing CAS warned about.

Intersecting is the safe half of that trade: it never shows a field some
admitting alternative withheld. It is also lossy, and deliberately so --
pairing fields to rows properly means projecting each row against the
alternative that admitted it, which is a per-row decision this service does
not make. When the policies agree, which is the ordinary case, nothing is
lost at all.

RowValues is what one row answers for the row fields a policy can pin.

A row that cannot answer for a field the policy pins is not covered by that
grant. Absence is never a match: it is the one reading that would hand a row
the fields of a grant it may not fall under.

FieldsForRow returns the fields readable on one specific row.

Where Decision.Fields is the intersection safe for every row at once, this
is the exact answer for one: the union of the grants that actually cover it.
Union is right here for the same reason intersection was right there -- a
row covered by two grants is covered by both, so either may open a field,
whereas a row covered by only one must not inherit the other's.

The second return is false when no grant covers the row at all. That row
should not have been in the result, so the caller drops it rather than
guessing a policy for it.

PerRow reports whether this decision pairs different fields to different
rows, and therefore needs projecting a row at a time.

One grant, or several that agree, is the ordinary case and needs no such
thing: Decision.Fields already says everything true of every row.

### `internal/authorization/constraint_test.go`

A pinned alternative still admits. Left in the boolean it would name an
attribute nobody supplies, Satisfiable would skip it, and pinning a teacher
to a section would revoke their access rather than narrow it.

Negations are refused rather than approximated. CAS holds them when EVERY
value satisfies and holds them vacuously when the attribute is absent, and a
NOT IN across a join reproduces neither -- so translating one would silently
return rows the policy meant to exclude.

A row field under a mixed OR is not a narrowing: the branch it sits in may
not be the branch that admitted, so applying it would filter rows the other
branch allowed, and not applying it would return rows this one forbade.

### `internal/authorization/count_test.go`

Every declared entity must be registered.

AllEntities is what `migrate` hands CAS on onboarding, so a constant that
never reaches that slice is a grant nobody can hold -- and the failure is
quiet: guard.Allow answers "not granted", scopeFor leaves every caller
restricted, and it reads like a CAS policy misconfiguration rather than a
missing line in a slice. An unregistered *_all is the worst version, because
the symptom is only that some people see less than they should.

The constants are the source of truth, so this reads them out of the package
itself rather than repeating a list that would need the same maintenance the
slice does.

### `internal/authorization/entities.go`

Entities for the academic tables. Pure configuration tables share
core.reference.* rather than minting a key each: grade levels, houses,
subjects and subject groups are school-wide settings, not per-person data,
and an administrator who may edit one may edit all of them.

### `internal/authorization/entities_test.go`

The service prefix is not decoration and not ours to drop. CAS
stores entities.key UNIQUE across every service, so the prefix is
the namespace -- without it this service's students.read collides
with any other service's. CAS also derives the key from the service
rather than accepting one, taking a segment at a time, so a short
key is not a value it can be given: sending one would silently
register core.students.read and nothing would ever match.

### `internal/authorization/expression.go`

Scope says which school this grant applies in. CAS sends it on every
alternative as a value, so it cannot be absent -- and a zero value
denies, which is what makes a field we failed to parse safe.

Satisfiable reports whether attrs supplies every field this node references.

CAS evaluates a missing attribute as satisfying every negative operator, so
an incomplete attribute map turns a restricting policy into a granting one.
Callers must therefore refuse to decide on fields they did not supply.

### `internal/authorization/expression_test.go`

A policy written to RESTRICT must not grant when the attribute the
expression names was never supplied. CAS's own evaluator would say
true here, because absent attributes satisfy negative operators.

### `internal/authorization/fields.go`

FieldPolicy narrows which fields one alternative covers.

Absent means unrestricted, not "no fields": every policy authored before
field policy existed carries none, and reading absence as an empty include
list would revoke access from all of them at once.

A stated mode with nothing to state is a policy that failed to resolve,
not a policy that permits everything. Absence means no policy was ever
written; an empty list under a mode means one exists and did not arrive.
Reading the second like the first is how a restriction becomes a grant,
and an empty all_except grants every field.

AllowsField reports whether the caller may touch one field of one row.

This is the raw primitive and it does NOT check that the field is a real
column. Used directly on a name taken from a request payload it inherits a
bypass: field keys are compared exactly, so under all_except a mis-cased
name misses the exclusion list and is admitted. Prefer DeniedFields for
anything derived from a client.

The row and the field must come from the SAME alternative. Holding "rows in
9A, field phone" and "rows in 10B, field address" must not combine into
permission to read a 9A row's address, so an alternative only contributes
its fields when its own expression admits that row.

Across alternatives it stays additive, which is what makes all_except a
shorthand for a set rather than a deny: a second grant can add a field back.

DeniedFields returns those of requested the caller may not touch, in order.

It exists so a mixed payload can be rejected outright rather than silently
stripped: quietly dropping an unauthorized field turns a refusal into a
partial success and the caller never learns their write did not happen.

registered must be the real columns of the row being written. Anything
outside it is denied before the policy is consulted at all, which closes a
bypass specific to all_except: field keys compare exactly and uppercase is
legal, so "Phone" and "phone" are two distinct valid names. Under include a
mis-cased key matches nothing and is denied, but under all_except it misses
the exclusion list and is therefore admitted � a client could slip past an
exclusion by changing the case of the field it was excluded by.

PermittedFields filters the registered columns down to what the caller may
see, preserving order so a projection keeps its column order.

Safe by construction: it only ever considers names that are real columns, so
the casing bypass DeniedFields guards against cannot arise here.

matchingAlternatives returns the alternatives whose expression admits attrs.

An alternative naming an attribute that was not supplied is skipped rather
than evaluated, for the same reason as in Allows: CAS treats a missing
attribute as satisfying every negation, so evaluating an incomplete map
turns a restricting policy into a granting one.

An alternative pinned to particular rows cannot answer a question
asked without a row. "Rows in 9A show phone" says nothing about
which fields some unnamed row shows, and letting it speak here is
exactly the 9A-row-shows-10B-address trap: the row half of the
pairing would be dropped and the field half kept.

Those pairings travel on the Decision instead, where the constraint
and the field policy come from one alternative and stay together.

Denied returns those of requested this policy refuses, in the order given.

registered must be the real columns of the row being written. Anything
outside it is denied before the mode is consulted, which closes a bypass
specific to all_except: keys compare exactly and uppercase is legal, so
"Phone" is a distinct name from "phone" that misses the exclusion list and
would otherwise be admitted.

### `internal/authorization/fields_test.go`

The trap CAS named: "rows in 9A with phone" plus "rows in 10B with
address" must not authorize a 9A row's address.

section is a row field, so the pairing lives on the decision -- the
constraint and the field policy are read off one alternative and travel
together. What must never happen is one alternative's rows arriving with
another's fields.

And because the rows are unioned, the fields are intersected. Showing
address on the union would expose a 9A pupil's address, which only the
10B policy allowed -- the trap CAS named.

The bypass this signature exists to close. Field keys compare exactly
and uppercase is a legal key, so "Phone" is a distinct name from
"phone". Under all_except it misses the exclusion list and would be
admitted, letting a client evade an exclusion by changing the case of
the very field it was excluded by.

The shape of a real CAS bug: a policy referencing a field profile whose
keys were never resolved arrived as a mode with an empty list. Under
all_except an empty exclusion list excludes nothing, so a policy written
to withhold fields would have granted every one of them.

Absence means no policy was written and is unrestricted. A stated mode
with nothing to state means a policy exists and did not arrive, which is
not the same thing and must not be read as permission.

### `internal/authorization/perrow_test.go`

Mr Sharma: 9A in full, 9B by name, roll number and phone, and only roll
number writable there. This is the policy pair that motivated per-row
fields, written the way an author would write it.

### `internal/authorization/policyset.go`

Alternatives are ORed: any one satisfied is enough. An alternative
referencing a field we did not supply is skipped rather than evaluated,
because CAS treats a missing attribute as satisfying every negative
operator, which would turn a restricting policy into a granting one.
Every admitting alternative contributes. Alternatives are ORed, so
stopping at the first one silently dropped the rest: a caller granted
9A by one policy and 10B by another saw only 9A, and nothing said so.

The grant's own scope first: an alternative for another school, or
one pinned to a CAS group this service cannot resolve, must not
admit on the strength of conditions that happen to hold here.

CAS has already dropped other tenants' grants from the answer, so
this is the residue it cannot resolve for us plus anything whose
kind we do not recognise. Both deny.

Row fields are lifted out before the boolean is evaluated, because
an alternative whose constraints cannot be turned into a predicate
must not admit on the strength of the conditions that can. Honouring
half a policy widens it.

One alternative that pins nothing covers every row on its own, so
the pins of the others would only take rows away that this one
already grants.

Carry whatever scope was declared, resolvable or not. A scope this
service cannot resolve must reach the caller's deny arm; reporting
it as "none declared" sent it to the permissive pre-scope fallback
instead.

### `internal/authorization/scope.go`

ReachField is the reserved condition CAS carries the row reach in.

It rides the condition mechanism rather than being a field of its own:
registered as an entity_field of type enum with the four values above and
only "=" permitted, so a typo is refused when the policy is saved rather
than silently matching nothing.

Named "reach", not "scope". CAS has its own alternative-level scope saying
which tenant a grant applies IN, and this says how far it reaches WITHIN a
school. Both had "tenant" as a legal value meaning different things, which
reads correctly and behaves wrongly.

Valid reports whether this is a scope emerge-core knows how to resolve.

Nothing in the request path calls it: the predicate builders in data/access
switch on the scope and deny in their default arm, so an unknown value is
refused by construction rather than by remembering to ask. It stays as the
canonical list, and the tests hold it to it.

reservedFields ride the condition mechanism but are metadata, not conditions.

They must be excluded from evaluation. Left in, every scoped alternative
would name an attribute the caller never supplies, and Satisfiable would
skip it � so declaring a scope would silently revoke the grant.

nonAttribute reports whether a field is something other than a value the
caller supplies with the request: a reserved pseudo-field like scope, or a
row field the data layer answers with a predicate.

Reach returns the row reach this alternative declares, if it declares one.

Absence is deliberately NOT read as "the whole tenant". A policy written
before scopes existed says nothing about breadth, and inventing the widest
reading for it would turn every existing grant into a school-wide one. The
caller keeps its existing narrowing when this returns false.

Only equality carries a scope. Anything else, in particular a
negation, would inherit semantics that make an absent value
satisfy it, and a scope must never be arrived at by absence.

### `internal/authorization/scope_test.go`

The trap in the convention: scope rides the condition mechanism, so if
it were evaluated as a condition it would name an attribute the caller
never supplies, Satisfiable would skip the alternative, and declaring a
scope would silently deny the grant it was meant to shape.

This asserts the real path, not a helper: an unrecognised scope must
arrive at the predicate builders as a declared scope they do not know,
so their default arm denies it. Reporting it as "no scope" instead is
what let it fall through to the pre-scope union, which is wider.

A declared scope this service cannot resolve was being reported as "no
scope declared", which sent it to the permissive pre-scope fallback
instead of the caller's deny arm. The two are not the same: no scope
means a policy predates scopes, an unknown one means a policy asked for
something this service does not implement.

### `internal/authorization/twosection_test.go`

A teacher assigned to two sections, with different rights in each:

9A  read name and email,   and write email
9B  read name, email and roll number,   and write nothing

Read and write are separate entities, so this is two policy pairs. The read
entity carries both sections; the write entity carries only 9A, and that
omission is what makes 9B read-only -- there is no "deny", just no grant.

On 9B, no grant covers the row at all. The handler never gets as far as
asking which fields: the reach check narrows writes to the pinned rows,
so a 9B pupil is not reachable for writing and answers 404.

---

## Row access: who may see which rows

### `internal/data/access/constraint.go`

A policy can pin a grant to particular rows -- one teacher fixed to 9A --
and this is where that becomes SQL.

Values are matched against the code column, because a code is what a policy
author writes: sections and grade levels both carry one, both required and
unique, so there is nothing to guess about which column "9A" means. A value
that matches no code narrows to nothing, which is the right way to be wrong.

Constraints are ANDed onto a query that is already authorized and already
narrowed by scope. They only ever subtract.

translatable reports whether every constraint names a field this package can
turn into a predicate.

A constraint nobody translates must never be dropped: the policy said "only
9A" and a query that forgot it returns the whole school. So an untranslatable
one narrows to nothing instead, and the caller sees an empty page rather than
somebody else's pupils.

StudentsConstrainedBy narrows students to those whose current enrolment sits
in a pinned section or grade level.

It reads through the active enrolment, which is what ties a pupil to a
section at all -- a student row carries no section of its own, because the
answer changes every academic year.

Groups are ORed because alternatives are: two policies pinning 9A and
10B give the caller both. Within a group the pins are ANDed, so a
policy naming a section and a grade level means rows in both.

### `internal/data/access/constraint_test.go`

The case this exists for: a teacher pinned to 9A sees 9A, and the pin rides
every query that asks which students they may see -- listings, reads by id,
and the reach check in front of every write.

The teacher_assignment scope is untouched by pinning: the pin is ANDed onto
it, not substituted for it. A teacher assigned to 9A and 9B, pinned to 9A,
sees 9A -- the intersection, because both must hold.

### `internal/data/access/predicate.go`

Which students a caller may see is one rule, so it lives in one place.

It was briefly three: the student query, the student sub-resource handlers
and the enrolment query each grew their own copy, and they had already
drifted � one omitted the subject-teacher branch entirely. A security
predicate with several homes converges on the most permissive of them the
first time somebody widens one and misses the others.

StudentsOfGuardian matches the children this guardian is actively linked to.

The relationship is emerge-core's own domain truth; CAS holds no
student_guardians and cannot express it.

StudentsTaughtBy matches the pupils a teacher is responsible for.

A class teacher holds the whole section; a subject teacher holds only the
pupils actually taking that subject, which is not everyone in the section.

StudentsAnyRole is the pre-scope fallback: everything the caller owns, by
whichever role they hold. It is what a policy written before scopes existed
means, and nothing wider.

StudentsFor resolves a decision into the students it covers.

It always returns a usable predicate. An unrestricted viewer gets one that
matches everything and a caller with nothing gets one that matches nothing,
so there is no second return value a caller can forget to check � which is
how the earlier two-value version let a restricted viewer through unfiltered.

Reach first, then whatever rows the policy pinned. Both narrow, so the
order is not a correctness question -- but they are separate ideas and
stay separate: scope says how far the grant reaches, a constraint says
which rows it was written for.

enrollmentsTaughtBy matches the enrolment rows a teacher actually touches.

It is the enrolment, not the student: seeing a pupil this year does not make
their earlier years visible. Withdrawn and transferred-out rows are excluded
because the section grant follows the active roll, not its history.

EnrollmentsFor resolves a decision into the enrolments it covers.

It dispatches on the granted scope for the same reason StudentsFor does: a
grant scoped to "self" must mean self, not self plus every section the
caller happens to teach.

subjectEnrollmentsTaughtBy splits the two teaching roles as everywhere else.

A class teacher holds the section, so every subject row under it; a subject
teacher holds only their own offering, not the rest of the pupil's timetable.

StudentAssignmentsFor resolves a decision into the pupil-role rows it covers.

The rows say who the monitors, prefects and house captains are, so they
follow the same rule as the pupils themselves.

TeacherAssignmentsFor resolves a decision into the teaching rows it covers.

These rows are what Resolve reads to build a viewer, so they decide what
every other caller can see. That makes the scope switch matter more here
than anywhere else, not less: without it a class teacher scoped to their own
rows reached every assignment on their section, and could revoke a
colleague's access to it.

Deliberate: a guardian has no reading of the teaching map. It is
listed rather than left to the default arm so that a policy author
granting it learns it means nothing here, instead of the grant
looking accepted and returning no rows for a reason nobody can find.

### `internal/data/access/predicate_test.go`

A copy of this rule in the enrolment package omitted this branch, so a
subject teacher saw nothing where they should see their own pupils.
That drift is why the rule has one home.

### `internal/data/access/rowvalues.go`

Answering "which grant covers this row" needs the row's own section, and a
student carries none: the answer changes every academic year, so it lives on
the enrolment. These read it back for a page of rows at a time.

The row set is already correct before any of this runs -- SQL narrowed it by
scope and by the union of every grant's pins. What these values decide is
only which fields to show, and a row that answers nothing matches no grant
and is dropped. So a lookup that comes back short shows less, never more.

StudentRowValues maps each student id to what its current enrolment says.

One query for the page, not one per row. Students with no current enrolment
simply have no entry, and a pinned grant will not cover them.

### `internal/data/access/viewer.go`

Package access resolves what rows the calling user may see, from tenant data.

CAS answers only the coarse question ("may this user read students"). It
cannot answer "which students": scoped grants do not reach a downstream
service, and policy expressions carry literals only, so no CAS rule can mean
"students whose guardian is the caller". That narrowing happens here,
against this school's own tables.

SectionIDs are sections the caller sees in full: they are the class
teacher, or hold a whole-section assignment. Every student in them is
visible regardless of which subjects that student takes.

SubjectOfferingIDs are offerings the caller teaches. These grant sight
of only the students actually taking that subject, which is not every
student in the section: electives and second languages differ per pupil.

Resolve maps the authenticated subject onto its roles in this school.

unrestricted comes from a school-wide CAS entity such as
core.students.read_all; without it the caller sees only their own rows.

teachingScope splits a teacher's current assignments into whole-section
access and subject-only access.

A class teacher is responsible for everyone in the section, so they get the
section. A subject teacher gets the offering, and therefore only the pupils
who actually take that subject. Assignments in closed years are excluded:
last year's class is not this year's business.

---

## The query layer

### `internal/data/academic/filters.go`

Package academic holds typed query filters for reference-data entities:
academic sessions, grade levels, school houses, branches, sections,
subjects, subject groups and subject offerings.

These tables carry no viewer narrowing, unlike student and other
person-scoped domains: any authenticated caller for the tenant may list
them. Filters here only ever narrow a query further, never widen it.

sessionPredicate narrows to the session asked for explicitly, or the
current session by default, or nothing at all when all_sessions was
requested. Split out so the current-session default is a single line of
logic a test can exercise without a database.

Apply narrows the query by the client's section filters.

Absent an explicit academic_session_id, a section listing defaults to the
current session unless all_sessions is set: a list spanning every year the
school has ever run is never what the caller meant.

sessionPredicate mirrors SectionFilters.sessionPredicate: the session asked
for explicitly, or the current session by default, or nothing when
all_sessions was requested.

Apply narrows the query by the client's subject offering filters.

Absent an explicit academic_session_id, an offering listing defaults to the
current session unless all_sessions is set, mirroring SectionFilters.

### `internal/data/enrollment/filters.go`

Filters are the narrowings a client may ask for on an enrolment listing.

They are not authorization. They are applied after it and only ever ANDed
on, so a teacher authorized for 9A who asks for status=active gets 9A AND
active � never active instead of 9A.

ApplyFilters narrows the query by the client's filters.

It deliberately knows nothing about authorization: call ForViewer first, and
this can only ever remove rows from what that allowed.

### `internal/data/enrollment/filters_test.go`

TestCurrentSessionDefaultIsPreserved checks the precondition ApplyFilters
relies on: without an explicit academic_session_id, and without
all_sessions=true, a listing must fall back to the current session. That
fallback only fires when both fields carry their zero value, so parsing
must keep producing exactly that shape.

### `internal/data/enrollment/query.go`

ForViewer narrows the query to the rows this caller may see.

The rule lives in access, which dispatches on the scope CAS granted. Doing
it here from the viewer alone meant a grant scoped to "self" still returned
every section the caller taught, and an unrecognised scope landed on the
widest branch instead of on nothing.

ForViewer narrows the query to the rows this caller may see.

Mirrors Query.ForViewer, including the scope dispatch.

### `internal/data/filter/parse.go`

Package filter parses client query parameters into typed domain filters.

It is deliberately generic only in the parsing: each domain declares its own
typed filter struct. A single ApplyFilters(map[string]string) for the whole
application would be loose enough that validation and type safety become
somebody's afternoon.

Filters narrow. They are applied after authorization and can only ever be
ANDed onto an already-authorized query, so a client filter cannot widen what
the caller may see.

Params wraps a query string and accumulates the first parse error.

Collecting the error rather than returning it per call means a parser reads
as a list of fields instead of a ladder of error checks, and the handler
still gets one clear message.

Err returns the first parse failure, or the parameters nobody consumed.

An unrecognised parameter is refused rather than ignored. A typo in a
narrowing filter is indistinguishable from omitting it, so "?studentid=X"
silently returned the whole page instead of one student's rows -- the same
fail-open shape as a dropped predicate, arriving as a 200.

UUID returns a UUID parameter, nil when absent, and records an error when
present but malformed. An unparseable id is never treated as absent, because
silently ignoring it would widen the result the caller asked to narrow.

Enum returns a validated enum parameter, nil when absent.

valid is the domain's own validator, so the set of legal values stays with
the domain rather than being duplicated here. An unrecognised value is an
error, not a silently dropped filter.

### `internal/data/filter/parse_test.go`

A parameter nobody consumed is refused, not ignored.

A typo in a narrowing filter is indistinguishable from omitting it, so
"?studentid=" used to return the whole page with a 200 -- the same shape as
every other hole found here: wider, not wrong, and therefore invisible.

### `internal/data/guardian/query.go`

ForViewer narrows the query to what the caller may see.

The decision says HOW WIDE: CAS names an abstract scope, and this works out
which concrete rows satisfy it. A decision that declares no scope falls
back to the union of the caller's own roles. An unrestricted viewer is left
alone. A scope emerge-core cannot resolve matches nothing rather than
falling through unfiltered.

### `internal/data/person/query.go`

ForViewer narrows the query to what the caller may see.

The decision says HOW WIDE: CAS names an abstract scope, and this works out
which concrete rows satisfy it. A decision that declares no scope falls
back to the union of the caller's own roles. An unrestricted viewer is left
alone. A scope emerge-core cannot resolve matches nothing rather than
falling through unfiltered.

### `internal/data/staff/query.go`

ForViewer narrows the query to what the caller may see.

The decision says how wide; this works out which concrete rows satisfy it.
A decision with no scope falls back to the caller's own record, which is
what every policy authored before scopes existed means. An unrestricted
viewer is left alone. A scope emerge-core cannot resolve matches nothing.

### `internal/data/student/filters.go`

Filters are the narrowings a client may ask for.

They are not authorization. They are applied after it and only ever ANDed
on, so a teacher authorized for 9A who asks for house_id=123 gets 9A AND
house 123 � never house 123 instead of 9A.

ApplyFilters narrows the query by the client's filters.

It deliberately knows nothing about authorization: call ForViewer first, and
this can only ever remove rows from what that allowed.

### `internal/data/student/query.go`

ForViewer narrows the query to what the caller may see.

The decision says how wide; access owns which rows satisfy it, so the rule
has one home rather than a copy per package.

### `internal/data/studentrecord/filters.go`

Package studentrecord holds typed query filters for the student
sub-resources (addresses, documents, notes) and the assignment tables.

Filters narrow. They are applied after authorization and only ever ANDed
onto an already-scoped query, so a client filter can never widen what the
caller is otherwise permitted to see.

NoteFilters are the narrowings a client may ask for on student notes.

Category is a free-form string on the entity, not an enum, so it is taken
as-is like search terms elsewhere in the codebase.

TeacherAssignmentFilters are the narrowings a client may ask for on teacher
assignments.

Session and AllSessions interact: an explicit session id always wins; with
none given, the listing defaults to the current session unless the caller
asks for every session.

StudentAssignmentFilters are the narrowings a client may ask for on student
assignments.

RoleType is a free-form string on the entity, not an enum. SchoolWide
matches a NULL section_id: a role wider than one section, such as a house
captain.

### `internal/data/studentrecord/filters_test.go`

With neither an explicit session nor all_sessions, Apply must fall back
to the current session: that fallback is keyed off Session being nil
and AllSessions being false, so both must survive parsing untouched.

### `internal/data/teacher/query.go`

ForViewer narrows the query to what the caller may see.

The decision says how wide; this works out which concrete rows satisfy it.
A decision with no scope falls back to the caller's own record, which is
what every policy authored before scopes existed means. An unrestricted
viewer is left alone. A scope emerge-core cannot resolve matches nothing.

---

## HTTP transport

### `internal/transport/http/attribution_test.go`

Attribution comes from the token, never the payload. The old code fell back
to the body whenever the caller had no person row here, so a verification or
a pastoral note could be signed with somebody else's name.

### `internal/transport/http/auth.go`

relay forwards one authentication route to CAS and returns its answer
unchanged, so a second factor or a forced password change reaches the client
exactly as CAS phrased it.

me returns the verified identity, and when X-School-Id is supplied, the
caller's roles at that school. It answers "who am I here", which is the one
question CAS cannot answer on its own.

relayAndForget relays a route that revokes sessions in CAS, then drops that
user's cached policy set. Logout, a password change and a password reset all
invalidate everything cached here.

### `internal/transport/http/common.go`

mustReach turns a narrowed existence check into a 404.

It is deliberately not a 403: a 403 confirms the row is real, and walking a
UUID space by id is exactly what the narrowing exists to stop. A caller who
may not reach a row learns only that they cannot see it.

deleteScoped deletes one row, after confirming the caller may reach it.

Every mutating handler used to resolve by path id alone, so a grant narrowed
to a guardian's own children still reached every pupil in the school through
PATCH and DELETE. Reads were narrowed; writes were not, and a write is the
worse half to leave open.

page describes the window a listing returned, so a client can ask for the
next one without guessing what it was given.

There is no total: counting the whole set costs a second query on every
listing to answer a question most callers never ask. HasMore is derived
from whether the page came back full, which is free.

### `internal/transport/http/edges_test.go`

A student response embeds the whole person under "edges": name, email,
phone, cas_user_id. Projection deletes top-level keys, and "edges" is one
key -- so under all_except it survives whole, carrying every field of a
different entity that this policy never mentioned.

A policy author writing all_except:[admission_number] on core.students.read
means "everything but the admission number". What they must not get is that
plus the pupil's email and phone, governed by nothing.

### `internal/transport/http/enrollments.go`

Narrowed exactly like the listing. Without this a guardian could list
their own ward, then walk UUIDs here for any pupil's enrolment, section
and eager-loaded student record.

### `internal/transport/http/fields.go`

alwaysReadable are returned whatever the field policy says.

An id the caller cannot see is a row they cannot act on, and stripping the
audit timestamps would make a projected row indistinguishable from a stale
one. Nothing here is personal data.

project drops the fields a caller may not read.

It runs on the way out, so an unauthorized column never leaves the process.
This is the enforcement; hiding a field in a UI is not.

Embedded rows belong to another entity and are governed by that
entity's field policy, which this one has not consulted. Under
all_except "edges" is a single key nobody thought to exclude, so
it survived whole -- a policy restricting one student column
also handed over the pupil's email, phone and cas_user_id.

Dropped rather than projected recursively: the related rows are
reachable through their own endpoint, under their own policy,
and a restricted response returning only its own columns is
explicable in a way a half-projected graph is not.

rejectUnauthorizedFields refuses a payload that touches a field the caller
may not write, naming every one of them.

It reports rather than strips. Quietly dropping an unauthorized field turns
a refusal into a partial success, and the caller never learns their write
did not happen.

projectPerRow projects each row against the grant that covers it.

This is what makes "9A in full, 9B by name and roll number" work. One field
policy for the whole response cannot express it: the intersection shows the
9A pupils too little and the union would show the 9B pupils their neighbours'
fields, which is the pairing CAS warned about.

A row no grant covers is dropped, not shown bare. SQL already narrowed the
result to rows some grant admits, so a row arriving here uncovered means its
section could not be read back -- and a row whose policy is unknown is a row
with no policy, which is the one case that must show nothing at all.

### `internal/transport/http/guardians.go`

This link is itself a grant: it is what StudentsOfGuardian reads, so
writing one hands the guardian sight of the child. The caller must
therefore already be able to see that child, or anyone holding
core.guardians.write could attach a guardian to any pupil in the school
and read them through it.

### `internal/transport/http/middleware/auth.go`

Attributes are nil here: this is the coarse "may they at all"
check. Row-level narrowing happens in the query layer, because
CAS policies carry only literals and cannot express it.

### `internal/transport/http/middleware/tenant.go`

A token that names exactly one tenant must match the header.
Absence proves nothing: CAS omits the claim when the user
resolves to zero or several tenants.

### `internal/transport/http/persons.go`

linkPerson attaches a CAS identity that already exists to a person here,
found by username or email rather than a pasted UUID.

This needs only a lookup, not the ability to create identities, so it is
expected to work before full provisioning does.

### `internal/transport/http/reach.go`

A reach answers "may this caller act on this row", using the same rule the
listing uses to decide whether they may see it.

It is asked before every update and delete. Without it a handler resolved by
path id alone, so any holder of the entity reached every row of that type
whatever scope their grant declared, and the narrowing on the read side was
a formality anyone could step around with a PATCH.

attributedTo resolves an audit column: always the caller, never the body.

These fields all used to fall back to the payload when the caller had no
person row here, so anyone could sign a verification, a note or a role with
somebody else's name. A wrong attribution is worse than a missing one -- it
is the record somebody gets held to later -- so a supplied value is refused
outright rather than quietly overwritten.

The column is required here, so a caller who cannot be identified cannot
write the row at all.

attributedToOptional is the same rule for a nullable column.

An unidentifiable caller leaves it null rather than being refused: the
schema allows the row to exist without an attributor, and a null one is
honest where a borrowed name would not be.

studentProjection returns the projection for a page of students: per row
when the policy pairs different fields to different sections, and the plain
one otherwise.

The extra lookup only happens when a policy actually pairs them. An ordinary
grant -- one alternative, or several that agree on fields -- costs nothing
new, because Decision.Fields already says everything true of every row.

studentWriteFields returns the fields writable on one specific student.

A write is a single row, so the exact answer is always available and there
is no reason to settle for the intersection: pinned to roll_number on 9B and
unrestricted on 9A, the same caller writing a 9A pupil may write anything.

The reach check already said this row is visible, so an uncovered
row here means its section could not be read back. Refusing is the
only safe reading: an unknown policy is not an absent one.

### `internal/transport/http/roleassignments.go`

teacherOnlyRoles are roles that belong on TeacherAssignment. They are
rejected here because the two tables have identical shapes, which makes
putting a teacher role on a student an easy and silent mistake.

### `internal/transport/http/schools.go`

Deleting a school removes its registry row and credentials, never its
database. Dropping tenant data is a deliberate, separate operation.

The profiles go first and in the same transaction. ent emitted the
foreign key as ON DELETE NO ACTION despite the cascade annotation, so
deleting a school that has credentials would otherwise fail outright.

writeControlEntErrFor lets a caller say what a constraint violation means
for the operation it was doing. On a delete it is a row still referencing
this one, which "already taken" describes exactly backwards.

### `internal/transport/http/staff.go`

Scoped exactly like the listing: the same ForViewer, so reading by id
cannot reach a row a listing would have hidden. WithTeacher matches the
eager load the old unscoped Get performed.

### `internal/transport/http/studentassignments.go`

Rows are about pupils, so they are narrowed by which pupils the caller
may see. Without this any holder of the read entity, a pupil included,
received the whole school's roster of monitors and prefects.

### `internal/transport/http/students.go`

No grant covers this row, so there is no policy under which to
show any of it. The listing drops such a row; by id it is a 404,
which is the same answer said differently.

The create entity's own field policy, not the write entity's. Gating the
route on one entity and reading fields from another is how a policy
written for editing silently governs what may be set at creation.

Which fields are writable depends on which row: pinned to roll_number
on 9B and unrestricted on 9A, the same caller writing a 9A pupil may
write anything. A write is one row, so the exact answer always exists.

### `internal/transport/http/studentsub.go`

Staff see staff- and guardian-visible notes, but only about pupils they are
responsible for. Without the student narrowing a bursar with no teaching
duties read every pastoral note in the school.

visibleNotes narrows notes by who the student is, by the note's own
visibility, and by the scope CAS granted.

The second return is false when the caller may see nothing, which the
handler answers with an empty page rather than an error.

Tenant-wide reads every note, private ones included -- the same
breadth core.student_notes.read_all carries, for the same reason:
this table has a visibility column, so lifting the row narrowing
without lifting the visibility filter would be half a grant.

### `internal/transport/http/studentsub_test.go`

whereFor renders a scope predicate as SQL, so the security property can be
asserted without a database.

These tests assert what must NOT be visible. Every authorization hole found
in this service returned a wider answer rather than an error, so a suite
that only checks what should appear cannot see any of them.

### `internal/transport/http/teacherassignments.go`

Creating a teaching assignment is what decides what a teacher can see:
Resolve reads exactly these rows to build a viewer. A caller who may
only reach their own rows must not be able to write one, because the
first thing they would write is a wider grant for themselves.

### `internal/transport/http/viewer.go`

scopeFor resolves both halves of an authorization answer: how wide the
caller may see, and who they are in this school.

The wide entity is asked first. Holding it means tenant-wide, which is what
core.*.read_all exists to say. Otherwise the narrow entity's decision
carries the scope, and that scope decides which rows � not the roles the
caller happens to hold.

Any error resolving the wide grant leaves the caller restricted, so a
failure narrows rather than widens.

A wide entity identical to the narrow one is not a wide grant. The
route has already required the narrow entity, so asking again always
allows, and treating that as school-wide made every caller unrestricted
and every narrowing below it dead code.

A wide grant pinned to particular rows is not a school-wide one.
Treating it as one would drop the pin: the policy said read_all
within 9A, and unrestricted means no predicate at all.

constraintNames renders the pinned row fields for the request trace, so an
empty page can be explained by the policy that caused it rather than guessed
at. Values are policy literals, not personal data.

### `internal/transport/http/viewer_test.go`

scopeFor treats the wide entity as "may see the whole school". Passing
the narrow entity as both made that question tautological, because the
route had already required it � so every caller came out unrestricted
and every narrowing below was dead code.

---

## Infrastructure: CAS, Postgres, crypto

### `internal/infrastructure/cas/admin.go`

ErrProvisioningUnavailable means CAS refused this service's token on an
admin route. Today that is the normal answer: /v1/admin/* resolves a
session id from the claims and a service token deliberately has none, so
no scope or grant changes it. It needs a change on the CAS side.

NewUser is the identity to create. CAS owns username, email, phone and
full_name; everything else about the person belongs to emerge-core.

There is deliberately no password. A credential must not travel in a request
message, so first contact is an activation token or an OTP instead.

GroupKeys places the user into groups as they are created, because
membership is what confers access: without one, provisioning yields an
account that holds nothing. This is a privilege operation by proxy, so
CAS gates it per client and refuses system groups outright, which is
what stops a machine minting a superadmin.

### `internal/infrastructure/cas/admin_test.go`

The guard is handed to the admin client as a token source. If it stops
satisfying the interface the assertion in main silently disables
provisioning rather than failing, so pin it here.

### `internal/infrastructure/cas/policies.go`

policyKey is the user AND the school the question was asked about.

Keyed by user alone, a set fetched while serving one school would be served
for the next -- which is the cross-tenant leak that asking CAS per tenant
exists to prevent, reintroduced one layer down and invisible, because both
requests succeed and return plausible rows.

Tenant is empty until schools carry a cas_tenant_id, so this is inert today
and correct the moment one is set. That is the point of doing it separately:
a composite key added in the same change as the request parameter is a line
nobody reviews.

tenantFor returns the CAS slug of the school this request is being served
for, or empty when there is none.

It is deliberately the SCHOOL's slug and not the token's tenant claim. CAS
omits that claim whenever a user resolves to several tenants, which is
exactly the multi-school principal a tenant filter most needs to confine --
a claim that disappears when the risk appears is not a control.

Empty narrows CAS to estate-wide grants only, which is the fail-closed
default and not a request for everything.

Asking about one school is what keeps another school's grants out of the
answer entirely, rather than present and waiting to be filtered
correctly here. Omitting it narrows CAS to estate-wide grants, so an
unexpectedly empty answer means this school has no cas_tenant_id set.

Forget drops one user's cached policy sets. Logout, a password change and a
password reset all revoke sessions in CAS, so anything cached here is stale
the moment they succeed.

Every school, not just the one they logged out of: the revocation is of the
person, so leaving another school's set behind would keep a revoked session
working there.

fieldMode names the field policy on a decision, for a trace. It never logs
the keys: which columns a caller may see is not secret, but the list is
noise in every line and the mode is what explains a projection.

### `internal/infrastructure/cas/proxy.go`

AuthProxy relays authentication requests to CAS without interpreting them.

It deliberately does not parse bodies. CAS owns the login contract, including
its unhappy paths � a second factor, a forced password change, a locked
account � and a proxy that understood only the happy path would break the
others at exactly the wrong moment. Relaying verbatim means those keep
working with no code here.

Bodies are never logged. Credentials pass through and are not stored.

The full CAS login surface. Password login answers with a 2FA
challenge at HTTP 200 rather than tokens, so verify is not optional,
and a forced password change makes every protected route 403 until
it is done. Relaying all of them verbatim is what keeps those
journeys working without this service modelling them.

Header carries only the allowlisted response headers. Retry-After is
the one that matters: CAS throttles failed logins, and dropping it
leaves a client no way to know when it may try again.

CAS throttles failed logins per client IP. Behind a proxy every user
arrives from one address, so without a correct X-Forwarded-For one
person's typos would lock out the whole school. CAS only trusts this
header from an address listed in its CAS_TRUSTED_PROXIES.

### `internal/infrastructure/cas/proxy_test.go`

CAS throttles failed logins. Dropping Retry-After leaves a client no way
to know when it may try again, so it turns a temporary refusal into an
apparently permanent one.

---

## Schema

### `internal/ent/schema/enrollment.go`

StudentEnrollment places one student in one section for one session.

This is the row that makes the schema time-aware: promoting a student adds a
new enrollment rather than editing the old one, so last year stays readable.

### `internal/ent/schema/studentassignment.go`

StudentAssignment is a role or duty a student holds during one session:
class monitor, house captain, prefect, sports captain, lab assistant.

It is NOT which subjects the student takes � that is
StudentSubjectEnrollment. The vocabulary here gives it away: role_type,
assigned_by and a status of revoked belong to a responsibility that is
conferred and withdrawn, not to an enrolment.

Optional, because not every student role is section-scoped: a house
captain answers to a house and a head pupil to the whole school.
Null means the role is wider than one section.

Free text, because schools invent their own: class_monitor,
house_captain, prefect, sports_captain, library_monitor, head_boy.
Teacher roles are rejected here; they belong on TeacherAssignment.

### `internal/ent/schema/subject.go`

SubjectOffering is a subject as taught to one section during one session.

Branch scope is inherited through section_id to sections.branch_id; the
session is held directly so an offering can be found without a join.

### `internal/ent/schema/subjectenrollment.go`

StudentSubjectEnrollment is which subjects one student actually takes.

Two students in the same section do not necessarily take the same subjects:
electives, second languages and streams all differ per pupil. Section
membership therefore cannot imply subject membership, and this table is the
separate mapping that says who takes what.

It hangs off the enrollment rather than the student, so the session and the
section come for free and a subject choice can never outlive the year it was
made in.

### `internal/ent/schema/teacherassignment.go`

TeacherAssignment is what a teacher is responsible for in one session.

This is the table the whole authorization story rests on: a teacher's
visible students are derived from here through sections, because CAS cannot
express caller-relative scope.

---

## Observability

### `internal/observability/logging.go`

From returns the request-scoped logger, or the default one outside a request.

It never returns nil, so a caller can log without checking. A missing logger
means the line is uncorrelated, not that it should be dropped.

With adds fields to the request's logger for every later line.

This is how a trace fills in as the request learns things: the school after
the tenant resolves, the subject after the token verifies. Lines logged
before then simply lack those fields rather than being wrong.

Step logs one thing that happened, attributed to a layer.

Steps are debug-level: a full trace is worth having and worth being off by
default, because it is one line per operation and most requests are dull.

---

## Configuration

### `internal/config/config.go`

CASAuthProxy relays login to CAS through this service. It means end-user
passwords transit emerge-core, so it is a deliberate choice: the
alternative is the client talking to CAS directly and sending only the
resulting token.

AuthDisabled runs with no authentication at all. It must be set
explicitly: without CAS the API refuses to start rather than quietly
allowing everything, because the permissive reading must never be
what you get by omission.

Running unauthenticated is a decision, not a default. Inferring it from
an empty CAS_BASE_URL meant a typo in APP_ENV -- "prod", "Production",
"staging" -- started the server with every route open and only a log
line to say so.

### `internal/config/config_test.go`

The whole point: running unauthenticated must be asked for, never
inferred. Previously an empty CAS_BASE_URL plus any APP_ENV that was not
exactly "production" started the server with every route open.

---

## Commands

### `cmd/api/main.go`

newProvisioner wires identity creation, when CAS is configured for it.

Whether CAS will actually accept it is a runtime answer, not a startup one:
/v1/admin/* resolves a session id that a service token does not carry, so
today the call is refused. The endpoint reports that clearly rather than
this service refusing to start over it.

CAS throttles failed logins per client IP. Relayed logins all arrive
from this service's address, so unless CAS trusts our X-Forwarded-For
one user's mistyped password can lock out everyone at the school.

---

## Shared packages

### `pkg/response/response.go`

DecodeFields reads the body into dst and also reports which top-level keys
the client actually sent.

Field authorization needs the keys, not the decoded values: a payload that
omits a field and one that sets it to null are different requests, and a
zero value cannot tell them apart.

### `pkg/response/response_test.go`

Field authorization needs the keys the client sent, not the decoded
values: omitting a field and sending it as null are different requests
and a zero value cannot tell them apart.

---

## Other

### `internal/service/provisioning.go`

IdentityProvider is the part of CAS that provisioning needs. It is an
interface so the transport underneath can change � REST today, gRPC if that
is where CAS puts machine-to-machine user creation � without anything above
this line knowing.

GroupKeys decide what the person can do, because membership is what
confers access. Without one, provisioning yields an account that holds
nothing and still needs a human before it is of any use.

Provision creates the CAS identity and the local person, in that order, and
is safe to call twice with the same input.

The order matters and is not arbitrary. There is no transaction across the
two systems, so one of them has to go first and the other has to be able to
recover. CAS goes first because its identity is the durable, globally unique
thing; the local row can always be rebuilt from it. The reverse would leave
a person with no way to log in and no way to tell that had happened.

Someone already holds this username. That is not a failure: it is
the second run of the same request, or a person who exists in CAS
and needs linking here. Resolve them and carry on.

Link attaches an identity that already exists in CAS to a person here,
resolving it by username or email rather than requiring a pasted UUID.

This needs only FindUser, not CreateUser, so it works as soon as CAS exposes
a lookup to services � which is a strictly smaller thing to permit than
letting a machine mint identities. It is the whole flow when people are
created in the CAS console.

---

## Library and curriculum, phase one (2026-09-08)

### go generate was a silent no-op repo-wide

`internal/ent/generate.go` carried `// go:generate` — with a space — so Go did not recognise the
directive. `go generate ./internal/ent/...` exited 0 and did nothing, for both the tenant and the
control-plane schema. Collateral from `0133fd8` "Remove every comment from the source", which
stripped comments and took the toolchain directives with them.

The failure was invisible in the worst way: a schema change would build, vet and test clean while
never reaching the generated code. Anyone editing a schema since that commit would believe their
change had taken effect.

Restored. Toolchain directives are excepted from the no-comments rule for exactly this reason.

This also invalidated an intermediate conclusion drawn during the same session — that
`entsql.OnDelete` was ignored on optional edges. It is not; codegen simply was not running. With the
directive fixed, `entsql.OnDelete(entsql.Restrict)` on the owning `edge.To` produces
`schema.Restrict` and reaches the migration.

### migrate make takes its flags before the positional

`go run ./cmd/migrate make <name> -plane tenant` does NOT work. Go's `flag` package stops parsing at
the first positional, so `-plane tenant` is swallowed into the migration name and the plane falls
back to `all`. The result is a file named `<name>__plane_tenant.sql` generated against both planes.

Correct: `go run ./cmd/migrate make -plane tenant <name>`.

### Recovering a broken atlas.sum

Deleting a generated but unapplied migration leaves `atlas.sum` invalid, and `migrate make` refuses
both a stale sum and a missing one. There is no atlas CLI in this repo — atlas is driven through the
Go API — so recovery is a throwaway program calling `migrate.NewLocalDir(...).Checksum()` and
`migrate.WriteSumFile(...)`. The per-file hashes are content hashes and survive; only the directory
hash changes.

### assets is the tenant's first file registry

`student_documents.asset_id`, `persons.profile_photo_asset_id` and control-plane
`schools.logo_asset_id` all held UUIDs pointing at a table that did not exist. `assets` is that
table. Those three columns were deliberately NOT given foreign keys in this migration: existing rows
hold ids with no matching asset and the constraint would fail on apply. From now on the service
writes an asset row before any `*_asset_id`, so the backfill only shrinks.

`content_items.asset_id` is `Immutable()` and its FK is `ON DELETE RESTRICT`, so an asset that
content references cannot be deleted out from under it. Assets are retired with `status = deleted`,
which keeps the row and leaves references explicable.

### audience has no default, deliberately

`content_items.audience` is NOT NULL with no default, and a Postgres CHECK pairs it with exactly one
location FK. A row cannot exist without a stated audience, and the shape cannot disagree with the
audience. Verified behaviourally against a throwaway database, not by reading the DDL: omitting
audience fails on not-null; `school` with a `grade_level_id` fails the check; `grade` without one
fails the check.

### Pupils and guardians get school and owner audiences only

`ReachSelf` and `ReachGuardianWard` deliberately emit no section or grade arm. Giving a pupil their
own section means a parent can retrieve a teacher's note about another child in that class — through
RAG, as verbatim text, with a citation. Both enforcement layers would agree, because both would be
correctly implementing a model with no teacher/pupil axis.

The consequence is real and accepted: pupils and guardians cannot see legitimately class-wide
material — a reading list, a year-group notice — through this predicate. That needs an audience-role
dimension (staff-facing versus pupil-facing), which is deferred.

The regression tests use viewers that DO carry `SectionIDs`, so they fail if someone adds the arm
back. A pupil viewer with an empty section list would have passed vacuously.

### A policy pin drops the school and owner arms

When `d.Constraints` is non-empty, `LibraryItemsFor` removes the school- and owner-audience arms
rather than relying on AND plus NULL semantics. A school-audience row cannot answer a `section` pin,
and this repo's rule is that a row which cannot answer a pinned field is not covered. Structural
removal also stops a school row with a stale non-null `section_id` from satisfying a pin.

The visible consequence: a library grant pinned to 9A hides the school's textbooks from that teacher.
That is correct, and it will surprise policy authors.

An untranslatable pin denies, matching `StudentsConstrainedBy`. Before this was written, an
untranslatable pin returned the caller's full role scope — a wider answer arriving silently.

### entsql.OnDelete is positional on a combined self-reference

`docs/TODO.md` records that `entsql.OnDelete` is silently ignored on an inverse `edge.From`. The rule
is narrower and sharper than that, and it bit again while building `curriculum_nodes` and
`content_nodes`:

    edge.To("children", X.Type).From("parent").Unique().Field("parent_id").
        Annotations(entsql.OnDelete(entsql.Cascade))          <- IGNORED

    edge.To("children", X.Type).Annotations(entsql.OnDelete(entsql.Cascade)).
        From("parent").Unique().Field("parent_id")            <- honoured

On a combined self-reference the annotation attaches to whichever descriptor is current when it is
called. Placed at the end of the chain it lands on the inverse side and is dropped; both self-ref FKs
came out `SetNull` and the schema read as if they cascaded.

**The general rule, found later and sharper than the symptom above:** codegen SKIPS INVERSE EDGES
ENTIRELY. `entc/gen/graph.go:673` reads `if e.IsInverse() { continue }` and takes `deleteAction` off
the association edge only. So an `entsql.OnDelete` on any `edge.From` is silently dropped, always —
the self-reference case is merely where it is easiest to end up on the wrong descriptor without
noticing.

The practical consequence for a one-to-one: the annotation must live on the `edge.To` side. For
`ContentItem` -> `QuestionPaper` that means it goes in `contentitem.go`, and an `OnDelete` on
`QuestionPaper`'s `edge.From` would have been ignored. Note the corollary that makes this easy to get
wrong twice: before the inverse edge existed, the same annotation on `QuestionPaper` WAS correct,
because with no inverse edge that edge was itself the association edge. Adding the inverse edge moves
where the annotation has to live, and nothing warns you.

The failure is invisible in Go: it compiles, generates, builds and tests clean. The only place it
shows is the emitted DDL. Read `internal/ent/generated/migrate/schema.go` after any edge annotation
change — that is the only file that tells the truth about `ON DELETE`.

### "no cascade" is not the same as ent's default

Ent's default for a nullable FK is `SET NULL`, not `NO ACTION`. So specifying "no cascade" for
`curriculum_nodes -> content_placements` would have produced exactly the behaviour it was meant to
prevent: deleting a node nulls `curriculum_node_id` on every placement pointing at it, and the
placement silently degrades from "covers this topic" to "covers this whole curriculum".

Worse, `SET NULL` re-evaluates the `content_placements_grain_node` check, so a `grain='node'` row
turns the delete into an opaque check violation rather than a clear refusal.

`RESTRICT` is used instead — the same choice `assets -> content_items` makes. A node with content
mapped to it cannot be deleted until the placements are dealt with, and the refusal names the reason.

### An AND of two EXISTS is not a correlated pair

`curriculaOfOfferings` narrowed the curriculum read by the viewer's subject offerings like this:

    EXISTS (grade_levels ... EXISTS (sections ... EXISTS (subject_offerings WHERE id IN ($1))))
    AND
    EXISTS (subjects ...    EXISTS (subject_offerings WHERE id IN ($2)))

Both halves bind the same offering set, but as `$1` and `$2` — two independent existence tests.
Nothing required the *same* offering to satisfy both. A teacher holding Maths in 9A and Science in
10B therefore matched `Curriculum(subject=Science, grade=9)`: grade 9 contains 9A, which carries
their Maths offering, and Science contains their 10B offering. Two true facts, one false conclusion.

It could not have been caught by any test that asserts a viewer *can* see something, because the
defect only ever widens. It needs a viewer holding two offerings that cross, and an assertion about
what is *not* reachable.

The reason it cannot be fixed in the predicate is that ent cannot correlate the outer row's
`grade_level_id` inside a subquery, so the pairing has to exist before the query is built. `Viewer`
now resolves offerings into `SubjectGrade{SubjectID, GradeLevelID}` pairs in one indexed pass, and
the arm becomes an OR of exact pairs with no subqueries at all:

    ("curricula"."subject_id" = $1 AND "curricula"."grade_level_id" = $2)
    OR ("curricula"."subject_id" = $3 AND "curricula"."grade_level_id" = $4)

This matters beyond curricula: any predicate built from two independent `HasXWith` calls over the
same id set has the same shape, and reads as if it correlates when it does not.

### A subject-teacher assignment contributes no section

`teachingScope` appends to `SectionIDs` only when `SubjectOfferingID` is nil. A teacher assigned to
teach one subject in a section is therefore not in that section's `SectionIDs`, and the section-based
arms do not cover them. The offering arms are genuinely additive, not a subset of the section arm —
which is why the correlation defect above was reachable rather than masked.

### For curricula, a section pin degrades to its grade

A curriculum has a `grade_level_id` and no section: it applies to every section of its grade. So
`section=9A` translates to "the grade that 9A belongs to", and selects the same rows as
`grade_level=9`.

The two still render differently — different join shape, different bound value — so this is not the
byte-identical fail-open that `LibraryItemsFor` had. But a policy author who pins a curriculum grant
to 9A gets grade 9, and a reviewer reading the rule will expect narrower. There is nothing in the
table to narrow further; the only real fix would be section-scoped curricula, which contradicts
copy-forward and the partial unique index on (session, subject, grade).

### Curricula have no owner, so the write gate is a reach gate

The library split read from write by ownership: `LibraryItemsWritableBy` is the read predicate AND
`owner_person_id = me`. `curricula` has no owner column, so that gate is unavailable and faking one
would be decorative.

The read/write split is still real, on a different axis. `CurriculaWritableBy` keeps the tenant and
teacher-assignment arms and denies `self` and `guardian_ward` outright. A pupil may legitimately read
the grade 9 syllabus; reusing the read predicate as the write gate would let them edit it. That is
the same failure as the Phase 1 critical, arriving through a different door.

### Fifteen catalogue entities carry no fields, and that is the safe answer

`core.reference.*`, `core.schools.*`, `core.sections.*`, `core.academic_sessions.*` and
`core.subject_offerings.*` produce entities with an empty field list: none has an `_all` verb, so no
reach field is offered, and none has an `areaColumns` entry, so no column is either.

For `sections` and `subject_offerings` this looks like an omission — both are real tenant tables with
real columns. It is not one. Exposing their columns would let a rule author pin `section=9A` on
`core.sections.read`, and no predicate in emerge-core applies constraints to those areas, so the pin
would be silently ignored. A control that does nothing is worse than an absent one.

`catalog_test.go` pins the set by name with the reason each is empty. A sixteenth cannot appear
without failing a test that names the area and both remedies.

### The stub evaluator cannot see through EXISTS, so Phase 2 tests prove shape, not outcome

Phase 1's critical — a read predicate used as the write gate — survived every test because the driver
stub ignored the WHERE clause entirely. The fix was `gatedDriver`, which parses the emitted WHERE and
evaluates it against the fixture row, so a test can finally prove a refusal.

That fix does not carry to Phase 2. `librarypublish_test.go:315` refuses to evaluate `EXISTS (`:

    case c.accept("EXISTS ("):
        return libraryBeyondTheStub("a correlated subquery"), nil

Refusing is right — guessing would fail open, and the alternative is a stub that quietly answers
questions it cannot answer. But every curriculum and placement predicate is a correlated EXISTS:

    ContentPlacementsFor  ->  EXISTS (SELECT ... FROM curricula WHERE ...)
    CurriculumNodesFor    ->  EXISTS (SELECT ... FROM curricula WHERE ...)

So a placement test can only run a viewer whose predicate renders `FALSE`, or one at `tenant` reach
with no WHERE at all. The middle case — a genuinely scoped viewer who should see exactly one row —
makes the stub error, and the request 500s.

The consequence, stated plainly: **for placements and curricula, the tests prove that the correct
predicate was emitted, not that the correct rows came back.** That is strictly weaker than what the
library tests prove, and it is weaker in exactly the dimension that hid the Phase 1 critical.

It fails closed in the test harness — an unevaluatable predicate errors rather than admitting the
row — and Postgres evaluates these correctly in production, so this is a limit on what is *proven*,
not a defect in the predicates. Closing it needs either an evaluator that resolves correlated
subqueries against fixture tables, or an integration test against a real database.

There is no prior art for the second in this repo. An earlier version of this note cited
`testsupport.DB` as "the repo's existing pattern" — that package does not exist here and never did;
the claim was carried over from a sibling repo and is withdrawn. What exists is `postgres.WithConn`
(`internal/infrastructure/postgres/context.go:14`), the seam the stub-driven tests already use, which
accepts a real driver as readily as a stub. The tenant-resolution assembly around it is written twice,
copy-pasted, in `cmd/seeddemo` and `cmd/migrate`, both `package main` and neither importable.

### reach=self and reach=guardian_ward resolved to the same set

`enrolledScope` built `EnrolledOfferingIDs` as the union of the viewer's own active enrolments and
their wards'. Both `ReachSelf` and `ReachGuardianWard` then read that one field, so the two reaches
returned identical rows.

The harm is not that a guardian sees another family's child — the union is still their own ward. It
is that **`reach=self` could not withhold ward data from a guardian.** A policy author writing `self`
to mean "their own records only" got ward records too, and no rule they could write did what they
intended. The defect was also unfalsifiable from outside: both reaches rendered the same SQL, so
nothing comparing them could detect that they were meant to differ.

`enrolledScope` now returns `(own, ward)` from the same single query, partitioning rows by whether
the row's student is in `v.StudentIDs`. A student who is somehow their own guardian lands in `own`;
self takes priority. `library.go` splits `libraryPersonalArms` into `libraryBaseArms` plus a per-list
offering arm, and `scopedLibraryItems` dispatches `libraryOwnArms` at self and `libraryWardArms` at
guardian_ward. No-reach still gets the union.

**A test asserting on SQL text alone cannot prove this.** Placeholders are positional, so a viewer
with one own offering and one ward offering renders byte-identical SQL for both reaches, differing
only in the bound args. The test gives the fixture one own offering and two ward offerings so the arm
widths differ, and asserts on the `(query, args)` pair.

The behaviour change to sign off: a guardian who is not also a student now has empty
`StudiedSubjectGrades`, so at `reach=self` they match only school-audience and owned library items,
and nothing in curriculum. Checked against the seeded roles before accepting it — `core-guardian-ward`
uses `guardian_ward`, the `core-self-*` atoms are pupil-facing, and no seeded role grants a guardian
`reach=self`. Nothing in `scripts/cas-*.py` relies on the old behaviour.

### Half the EXISTS blind spot closes without a database

The note above says curriculum and placement tests prove shape rather than outcome, because
`gatedDriver` refuses to evaluate `EXISTS (`. That is true of placements. It is only half true of
curricula, and the other half is worth having.

`CurriculaFor` is a disjunction of arms with different shapes:

    section and enrolment arms  ->  EXISTS (... grade_levels ... correlated on grade_level_id)
    subject-grade pair arms     ->  ("curricula"."subject_id" = $1 AND "grade_level_id" = $2)

The pair arms carry no subquery, so the existing evaluator handles them. Isolating them needs a
viewer whose `SectionIDs` is empty — which is the ordinary subject teacher, not a contrivance, since
`teachingScope` populates `SectionIDs` only from assignments with a NULL `subject_offering_id`.

So `TestListCurriculaReturnsTheTaughtPairsAndNotTheCrossedOne` puts three rows in `curricula` —
(Maths, g9), (Science, g10) and the crossed (Science, g9) — and proves the crossed row does not come
back. Rows, not SQL. It is the only Phase 2 test that demonstrates an actual refusal.

**The positive control is the part that matters.** A viewer that resolves to no pairs renders
`WHERE FALSE`, and against that the crossed-row assertion passes for the wrong reason — the endpoint
refused everything. Removing `subject_offerings` from the fixture reproduces it: the crossed subtest
alone would have gone green, and only the "a curriculum the teacher teaches" subtest catches it, at
`want 200, got 404`. A refusal test without a matching admission test proves nothing.

`wantSubjectGradePairsOnly` additionally fails if the emitted SQL contains `EXISTS (`, `IN (SELECT`
or `FALSE`, so the test cannot silently degrade into the shape it was built to escape.

### The sections gate works by AND short-circuit, and that is load-bearing

`curriculumDriver` had to start evaluating the WHERE clause on `sections`, because `teachingScope`
makes two queries against that table needing opposite answers: the class-teacher lookup must return
nothing, and the `WithSection()` eager load must return both rows.

The class-teacher query renders `class_teacher_id = $1 AND EXISTS (... academic_sessions ...)`, and
that `EXISTS` is unevaluatable. It never runs: `libraryBoth` returns before evaluating its right side
when the left is false, and no fixture section carries that class teacher.

So adding a section row whose `class_teacher_id` is the fixture's teacher will make this stop with
`stub: cannot evaluate a correlated subquery` and a 500, some distance from the line that caused it.
It fails closed rather than open, so it is a test-maintenance hazard and not a security one — but the
cause is not local to the change that triggers it.

### The schema as Postgres actually built it

Everything above about `ON DELETE` was verified against the emitted DDL in
`internal/ent/generated/migrate/schema.go`, which is the file that tells the truth about annotations.
It is not the same as verifying what the database built. After applying both migrations to the
DPS-NGP tenant DB, `pg_constraint` reports:

    content_items_assets_content_items                RESTRICT
    content_placements_content_nodes_placements       RESTRICT
    content_placements_curriculum_nodes_placements    RESTRICT
    content_placements_content_placements_copies      SET NULL
    content_placements_persons_creator                SET NULL
    content_placements_persons_confirmer              SET NULL
    content_placements_content_items_content_item     NO ACTION
    content_placements_curricula_placements           NO ACTION

Both CHECK constraints exist under the names the annotations gave them:
`content_items_audience_scope` and `content_placements_grain_node`.

Two notes on the NO ACTION pair. Neither edge carries an `entsql.OnDelete` annotation, and both
columns are NOT NULL, so ent cannot default them to SET NULL and falls through to NO ACTION — which
refuses the delete, the same outcome RESTRICT gives here. So deleting a curriculum or a content item
that still has placements fails, which is what we want. But it holds by ent's default rather than by
a decision recorded in the schema, and it would silently become SET NULL if either column were ever
made nullable. The three RESTRICTs above are explicit and would not move.

### The EXISTS blind spot is closed for placements, by a real database

`internal/testsupport/tenantdb.go` gives a test a `*tenantent.Client` bound to a transaction that is
always rolled back, injected through `postgres.WithConn` — the same seam the stub-driven tests use, so
a real driver drops in where the stub was with no change to the handler under test. The whole FK chain
is built inside the transaction rather than leaning on seeded rows, because a re-seed would otherwise
break the test and the chain is enforced for real.

`internal/transport/http/placementdb_test.go` is the first test in this repo that proves an
authorization refusal at the ROW level through a correlated subquery.

**Two mutations, because the first one caught less than it appeared to.** Replacing
`ContentPlacementsFor` with `AnyContentPlacement` fails — but on the SQL-shape guard, not the row
assertion, because a `curriculum_id` query filter was still narrowing the result. A guard firing is
not the same as the property being tested.

The mutation that settles it keeps the correlated EXISTS and removes only its narrowing:

    entplacement.HasCurriculumWith(access.AnyCurriculum())

Same shape, same subquery, admits every curriculum. Result:

    the unreachable curriculum must yield nothing, got [cad42765-…]

A real row, returned by real Postgres, that should have been filtered. That is the assertion the stub
could never make, and it is why this test exists.

**The skip is loud on purpose.** Every skip carries `TENANT-DB-TEST-SKIPPED`
(`testsupport.SkipMarker`), so a CI job can grep for it, and `TEST_REQUIRE_TENANT_DB=1` turns the skip
into a failure. A DB test that skips silently lets a suite be green while proving nothing, which is a
documented failure mode elsewhere in this estate.

Note what is still NOT covered: curriculum and placement predicates are only exercised for the reaches
the fixture builds. The stub-driven tests remain shape-only for every other path, and closing those
means more fixtures, not a different mechanism.

### The defect that only a database can see

`sectionGradeIndex` leaves a section it cannot map ABSENT from `Viewer.SectionGradeIDs`, rather than
present with a zero value. That absence is load-bearing, not tidiness: it is what makes
`retrieval.ScopesFor` return `ErrSectionGradesUnknown` instead of a partial label set.

Mutating it to pre-fill every requested id with `uuid.Nil` gives:

    internal/data/access    FAIL   a section with no row is present in the index as 00000000-…
    internal/retrieval      ok     25 tests, all green

The retrieval package cannot catch this even in principle. A zero-value entry is a perfectly
well-formed map, so the "is every section mapped?" check passes, `ErrSectionGradesUnknown` stops
firing, and the resolver mints `grade_00000000-0000-0000-0000-000000000000` for every teacher in the
school. Under the engine's boundary that is a label no document carries, so the teacher silently loses
their grade's documents — and no unit test anywhere would have moved.

It is catchable only where the map is built, against a database that can be asked for a section that
does not exist. That is the argument for `internal/data/access/viewer_test.go` existing at all, and
the general shape is worth remembering: a value that is wrong but well-formed is invisible to every
consumer that only checks well-formedness.

`TestSectionGradeIndexAsksPostgresOnceForEverySection` also pins the QUERY COUNT at one. A refactor to
a per-section lookup keeps every correctness assertion green while turning one round trip into N, and
nothing else in the suite would notice.

### An unexpressible pin denies on both paths, and that agreement is deliberate

`retrieval/labels.go` returns a resolved-but-EMPTY scope set when no constraint group is translatable:

    if !pinsUsable(d.Constraints) { return Scopes{resolved: true}, nil }

That looks like the quiet-empty failure this project keeps hitting, and it was reported as one. It is
not, and the reason is the property the whole design rests on. `LibraryItemsFor` does the same thing
for the same input:

    if !libraryPinsUsable(d.Constraints) { return NoLibraryItem() }

Both say "you may see nothing". They AGREE. If the label side errored here instead, the engine would
refuse loudly while the human path silently denied — two different behaviours for one policy, which is
worse than one quiet behaviour on both. Do not "fix" this by making the retrieval side error.

That instruction is enforced, not merely written down. `TestAPinOnAFieldTheVocabularyDoesNotKnow
DeniesOnBothSidesOnPurpose` makes exactly that change fail, with a message that gives the reason
before the assertion. It also asserts the vocabulary it depends on — `RowField("section")` true,
`RowField("section_id")` false — so if `section_id` ever becomes a real field the test says so instead
of quietly testing nothing.

Note the neighbouring case is different and correctly errors: a pin the label channel can PARTIALLY
express returns `ErrPinnedScopeUnresolved`, because emitting the unpinned labels there would be
strictly WIDER than the predicate. Refusing prevents an over-grant; the empty set above mirrors a
denial. Same file, opposite answers, both fail closed.

**The real problem this exposed, which is at neither enforcement point.** A rule author who writes
`section_id` where the vocabulary says `section` gets a grant that silently denies everything, on both
paths, for its whole lifetime, with no signal anywhere. `authorization.RowField` knows only `section`
and `grade_level`; anything else makes the group untranslatable. It was found by accident, in a test,
which is a fair measure of how visible it is in production.

`LibraryItemsFor` and `ScopesFor` are both behaving correctly given a bad input. The place to catch it
is where the pin ENTERS the system — an unknown constraint field should be rejected or surfaced when
the policy is ingested, not silently denied at every query. That is the shared authorization layer,
not the library, so it is recorded here rather than patched into one route.

### The scopes endpoint describes the caller to themselves, and that is the whole safety argument

ADR-012 says the scope oracle should be "reachable only by the engine, not by end users". The route
sits on the ordinary authenticated tenant router instead, and that is safe for a narrower reason worth
stating precisely: `getLibraryScopes` reads NO input except the caller's token and the
middleware-resolved tenant. It takes no user id, no subject, no school id, no query string, and it
does not read the request body. There is no input that selects whose scopes come back, so it can only
ever describe the caller to themselves — and a caller learning their own label set learns nothing they
could not derive from what they can already read.

That makes network isolation defence in depth rather than the confidentiality boundary. It also makes
the no-input property load-bearing: if a `school_id` or `user_id` parameter ever appears on that
handler, the argument collapses. Every label embeds the school uuid, and at tenant reach the only
label returned is `unrestricted_<school>`, so a caller-chosen school id would be a cross-tenant read
primitive against an engine that admits by label match.

Two tests guard it, and they are NOT of equal strength:

- `TestLibraryScopesReadNothingFromTheRequestBody` passes a reader that records whether Read was ever
  called. Complete on its own mechanism: any body read fails it, whatever the handler does with the
  bytes.
- `TestLibraryScopesIgnoreEveryParameterThatNamesAPrincipal` is a TRIPWIRE, not a proof. The
  `school_id` case is genuinely pinned — school labels are minted straight from the uuid, so honouring
  the parameter puts `school_<foreign>` in the body, verified by mutation. The other six are weaker
  than they look: the stub driver ignores query predicates, so a handler that honoured `user_id` by
  resolving a different person through the database would return the same row and a byte-identical
  body, and the test would still pass.

The general property is enforced by the handler being a two-line review, not by the six cases. Recorded
at its real strength rather than its apparent one.

### The two implementations agree, proven against Postgres

`internal/retrieval/agreement_test.go` checks the property the whole design rests on: the SQL predicate
that gates humans and the label set that gates AI retrieval must classify identically.

4410 triples — 7 viewers x 42 decisions x 15 rows — with the predicate side settled by an actual
SELECT against Postgres rather than by re-deriving what the predicate ought to do. Zero disagreements.
780 admitted by both, 3496 denied by both, 134 admitted by the predicate while the label side refused
to answer.

**The formula as originally stated was wrong**, and the fix matters. It was written with `LabelFor`,
the single label. Taken literally it fails on every tenant-reach case: a tenant caller holds exactly
`[unrestricted_S]`, while `LabelFor(school-audience row)` is `school_S`. The stamping function is
`LabelsFor`, which returns both the wildcard and the audience label, and the engine admits on ANY
document label. The property is over the INTERSECTION of `LabelsFor(R)` with `ScopesFor(V,D,S)`.
If anything ever stamps documents with `LabelFor` instead of `LabelsFor`, tenant reach reads nothing.

**One line is load-bearing.** Deleting the guard in `ScopesForWithSectionGrades`:

    if pinned && len(labels) > 0 { return Scopes{}, ErrPinnedScopeUnresolved }

produces 258 triples the engine would serve that emerge-core refuses — the 9A/9B requirement failing,
named triple by triple. The opposite mutation, dropping grade labels from the teaching arm, produces
exactly 2 triples in the silent-loss direction and the test names both.

**A pinned library grant takes AI retrieval to zero, not to a narrower slice.** 134 of the triples are
rows the predicate admits while the label side refuses outright. That is the narrowing direction so it
is not a hole, and it surfaces as a 409 rather than an empty set, but the widest possible grant
(tenant reach) plus a pin produces the emptiest possible label set.

### Things the agreement test deliberately does not prove

- **Nothing stamps a document yet.** `LabelFor` and `LabelsFor` have zero non-test callers in
  emerge-core. "The engine admits on any document label" is taken from `LabelsFor`'s shape, not
  verified against the engine.
- **What an empty label list means to the engine.** Untranslatable pins and pinned personal reaches
  return a resolved-empty set, and the handler answers 200 with `{"labels":[]}`. Whether the engine
  reads zero labels as deny-all or as no-filter decides whether that is a closed door or an open one.
  It is in the other repo and untested.
- **That either side matches what a school actually wants.** Both agree with each other and both
  disagree with `LIBRARY-ACCESS-DESIGN.md` §4.1. The test now LOCKS IN the code's answer, so if §4.1
  is the intended behaviour this test is defending the wrong thing and must be updated alongside
  whichever side is corrected.

### A caller with no person row reads the whole library at tenant reach

Both sides agree, so it is not a divergence: `addReach` adds the wildcard before `addBase` is
consulted, and `LibraryItemsFor` returns `AnyLibraryItem` for `ReachTenant`. A CAS identity holding a
tenant-reach library grant but having no `persons` row in that school reads everything. Defensible —
tenant reach means the whole school — but worth confirming it is intended, because it is the one case
where library access does not require being a person in the school.

### Assert the positive identity, not the absence of degradation

The retrieval engine exposes `/health/providers?strict=true`, and our plan recorded "assert that probe
passes" as the mitigation for a silent pgvector fallback. Its maintainers corrected us: `degraded` is
guarded by `bool(expected)`, so an UNRECOGNISED `RE_VECTOR_INDEX` value yields `expected: null`, which
makes `degraded` false, which makes strict return 200 — while the process has already fallen back to
an in-memory index. A genuine connect failure is caught; a typo is not.

The general form is worth keeping, because it is the third variant of the same mistake found today:

    check "degraded == false"                  -> passes when the system cannot tell it is degraded
    check "live == PgVectorIndex"              -> passes only when the thing you need is the thing running

A health check that asks "is anything wrong?" answers no when the wrong thing is unrecognised. A health
check that asks "is the right thing running?" cannot. Same family as a zero-value map entry being a
well-formed map, and as an empty result set being indistinguishable from a refusal: in each case the
check verifies a SHAPE and the defect preserves the shape.

Related asymmetry in the same service, recorded because it is the shape rather than the instance that
matters: `RE_DEV_OPEN_ADMIN` is counted in `degraded_providers`, `RE_BLOB_SIGNED_URLS` is not.
Documentation says to leave the second off; nothing notices when it is on. A convention that only some
of its instances enforce is worse than none, because the enforced ones teach you to trust it.

### The server mints storage keys, because a client that names an object can name yours

`createAsset` used to accept `storage_key` from the client. It is unique and immutable, so it could
not be overwritten — but it could be SQUATTED: register an asset row whose key names an object someone
else uploaded, attach it to a content_item you own, and read the bytes through whatever link-minting
endpoint arrives later. Uniqueness prevents a collision, not a claim.

The server now mints `library/<uuid>` and a supplied `storage_key` is a 400. A client can only ever
name an object the server chose for it.

This mattered more by the time it was fixed than when it was written down. The S3 design was settled
the same day as per-school buckets reached by a profile name, so a storage key is a live object in a
bucket the whole school shares — not a placeholder in a table.

**A note on the mutation, because the first one misled.** Mutating the INSERT site to honour a
client-supplied key left every test passing, which reads as a vacuous test. It is not: the rejection
happens earlier, at the field guard, so the mutated line was unreachable. Mutating the guard itself
gives `want 400, got 201` and a row carrying `"storage_key": "tenants/other-school/objects/1"`.
**A mutation that does not execute is not evidence in either direction** — the same trap as a mutation
that fails to compile, which bit twice in Phase 1.

### Assets have no audience, so their read scope is derived

`content_items` carry an audience; `assets` do not. So `GET /library/assets/{id}` cannot reuse the
library predicate directly, and the tempting answer — gate on the route entity alone — would let any
holder of `core.library.read` enumerate every asset row in the school, leaking file names, sizes and
sha256 digests.

An asset is readable if it is reachable through a content_item the caller can read
(`HasContentItemsWith(LibraryItemsFor(v, d))`), OR the caller uploaded it (`UploadedBy(*v.PersonID)`).
A nil viewer denies, an unrestricted viewer sees all. The uploader arm exists so a caller can read back
what they just created before it is attached to anything — without it, the create-then-read flow 404s
on the caller's own row.

### Phase 1's exit criterion, and what makes the digest trustworthy

Phase 1 was declared done with the catalogue, the asset registry and the audience model built, and no
bytes ever moving. Its own stated exit was "a teacher uploads a PDF; it appears in a catalogue". That
was recorded as "limitation 2: no file upload" and left, which was the wrong call — a phase's exit
criterion is not a limitation, it is the phase.

The upload is now bound rather than merely permitted. A presigned PUT that names only a key lets the
client upload anything to it: different bytes, different size, different type than the row claims. So
`Content-Length`, `Content-Type` and `x-amz-checksum-sha256` are signed INTO the URL, and the client
verifies its own output — it parses `X-Amz-SignedHeaders` and refuses to return a URL unless all three
are genuinely bound with the values asked for. That check is not paranoia: the SigV4 signer signs
content-length from the request field and skips a header-map entry (`aws/signer/v4/v4.go:427-439`), so
it works today by an SDK implementation detail a version bump could change silently.

**Zero-length uploads are refused, deliberately.** SigV4 signs content-length only when positive, so a
zero-byte presign cannot bind its length. Relaxing the required set to `{content-type, checksum}` at
zero was proposed and declined: on a conforming store the digest already pins the bytes and the length
binding is redundant, but on a store that ACCEPTS `x-amz-checksum-sha256` and ignores it, a two-header
URL constrains nothing while a three-header URL still constrains size. Relaxing removes the defence
exactly where the defence exists. The row remains creatable — `size_bytes` is `NonNegative()` — it is
only the grant that cannot be issued, and the 400 says so.

**Why absence of a digest is a refusal and not a warning**, in the words of the worker who argued it:

> The digest is checked in exactly two places: the store enforcing the checksum binding on PUT, and
> the comparison in `markAssetReady`. A store reporting no checksum on HEAD almost certainly ignored
> the one it accepted on PUT. So on that deployment the digest is verified nowhere, `assets.sha256` is
> a pure client claim, and the retrieval engine indexes on it.

It answers 503 rather than a second 409, because a 409 says "you uploaded the wrong bytes" — which a
caller fixes by re-uploading — while a store that cannot vouch for anything is our infrastructure, and
retrying never helps. A client library that retries 409s would hammer a bucket that structurally
cannot answer.

**The trap left for whoever builds bulk import**, verbatim, because loosening the wrong branch would
undo all of the above:

> Any object that did not arrive through our single presigned PUT — a multipart upload, an `mc cp`, an
> S3 replication copy, a future bulk import — will be refused at ready with `asset_digest_unavailable`,
> and the message will send the operator to look at bucket checksum configuration, which will be a red
> herring. That message is right for the case it was written for and misleading for this one. A
> bulk-import path will need its own verification story — most likely computing the digest server-side
> from the object rather than asking HEAD for it — and it must not be built by loosening this branch,
> because loosening it is indistinguishable from re-admitting the old-MinIO hole.

### A credential in an error string is a credential in whatever logs it

`internal/infrastructure/blob` deliberately logs nothing, because a presigned URL is a bearer
credential and the house `observability.Step` pattern would put it in logs. That was necessary and
insufficient: `response.ServerError` logs the raw error verbatim, so ANY store error whose message
embedded a signed URL would write `X-Amz-Signature` into the log from a call site the blob package
does not control.

**Stated precisely, because the first draft of this note overstated it:** the leak was demonstrated
with a constructed store error, not observed from a real one. Auditing the package afterwards found
that no `PresignPut` or `PresignGet` error path embeds a URL or a key today — only `Head` quotes the
key. So this was a reachable shape, not a live leak, and the fix is defence against future edits and
against SDK error text we do not control rather than the closing of an open hole.

Closed at both ends. The route scrubs the query string from any token containing `://` before the
error reaches the logger, and the blob package now refuses to RETURN any error carrying signature
material at all — the same footing as its binding check, so the property is structural rather than a
habit each caller has to remember.

### A test can only be trusted once you have watched it fail for the right reason

Four instances in one session, each written by someone who understood the property and still got a
fixture that did not exercise it:

- Two HTTP fixtures both wrote a package-level object, so the second one's store served both servers.
  Found because a NEW test failed for the right reason; fixed by repairing the seam rather than
  weakening the test to one-fixture-at-a-time.
- A mutation of the storage-key guard landed on the INSERT site, which is unreachable because the
  rejection happens earlier at the field guard. It passed, which reads as a vacuous test and is not.
- The engine's Ollama truncation test asserted `LLMSchemaError` where the path should raise
  `LLMTruncatedError` — a test encoding the defect, and therefore defending it.
- Two engine fixtures made their tests pass for the wrong cause: a zero-chunk snapshot, and a profile
  map with a wrong key that failed on validation rather than on the guard under test.

The compact statement, from the engine's maintainers: *a test that passes for the wrong reason is the
same shape as a check that cannot fail.* The working rule that follows is that a passing test is not
evidence, and a failing test is not evidence — a test that fails **for the cause you intended** is.

### What an error code should mean, before someone codes everything

The asset routes carry six machine-readable codes. Every one marks a refusal a client CANNOT predict
from its own request — the digest did not match, the store reported none, the object is not there, the
length differs, the asset is deleted, a zero length cannot be signed. A caller has to branch on those.

`file_name is required` is a different thing: the client can see that from its own request before
sending it. Giving it a code for symmetry would dilute the signal that makes the six useful — the
point of a code is that a machine should branch on it, not that every refusal deserves an identifier.

So when the library surface is eventually swept for codes, the sweep should decide which of those two
rules it is applying. Done as "code everything", it removes the distinction it was meant to express.

### A question is not a chunk, and `role=exercise` does not survive an exam paper

Both halves of this were measured by the retrieval engine's maintainers running its own classifier and
chunker, not read off the source, and both correct assumptions we were carrying.

**Chunks pack questions together.** Chunking targets ~320 tokens, so seven questions built as separate
blocks came out as ONE chunk with seven `block_refs` and `role=unknown`. A chunk on a paper is
therefore several questions, not one.

**And the role classifier does not fire on exam-paper text.** Eight of ten realistic paper lines
classified `unknown` at 0.00 against a `MIN_SCORE` of 1.5 — including `1. Define photosynthesis.
(2 marks)` and `Q.3 Explain the process of respiration in plants. (3)`. `roles.py` is a deterministic
rule set built for the printed vocabulary of an Indian school TEXTBOOK — `EXERCISE 3.2`, `Activity
6.4`, `Try These`, `Fill in the blanks`. An exam paper prints none of those, so a bare numbered
question matches no rule at all. The two lines that did fire contained textbook idioms by coincidence.

There is a sharper reason underneath: the one decisive signal, `BlockType.QUESTION` → `EXERCISE` at
0.92, has **zero producers anywhere in that repo**. The strongest rule is unreachable.

**So per-question retrieval from a PYQ is not something the engine does today**, and the exam setter
must not be designed as though it does. What the engine does reliably is retrieve a paper, or a span
of one, with a citation resolving to page and paragraph. Questions as addressable objects already
exist as `Item` rows in `lms-paper-orchestrator`, which is the right owner; the engine's role is
grounding context. Building a paper-shaped ingest path that emits `BlockType.QUESTION` per question is
possible and the classifier is already built to reward it, but it is real work and needs a reason
better than symmetry.

### What a paper must carry into the engine beyond `source_type`

`Document` has 18 fields and no free-form metadata dict, so most of our sidecar has nowhere to live
there. Keep `exam_year`, `board`, `exam_type`, `total_marks`, `duration_minutes`, `paper_set` and
`attempt` on our side, and do NOT encode them into `title` or `publisher` — nothing can filter on them
and it would create a parsing dependency.

Four fields do matter:

- **`source_type = pyq`**, which is what our `kind = paper` maps to.
- **`subject` and `grade`**, the only two paper attributes that are filter facets. Unpopulated, there
  is no way to narrow at all.
- **`checksum`** — load-bearing rather than cosmetic. The PDF path derives the document id as
  `sha1(tenant + NUL + checksum)`, so it is what makes re-ingesting the same paper idempotent instead
  of minting a duplicate. This is the A/V trap in reverse: papers get identity right *because* they
  are PDFs, where a recording gets a random id and duplicates on every re-ingest.
- **`title`** — it is the root of every section `path` and therefore feeds `stable_section_id`, so
  editing it later re-mints every section id under it. Set it once, correctly. We are insulated from
  the consequence by ADR-011 (our uuid is the identity, their section id is a refreshable pointer),
  but it turns a title edit into a reconciliation rather than a no-op.

**There is no year facet and no temporal facet of any kind**, and the engine's maintainers would
decline one if offered — putting `exam_year` in their `Filter` would place our vocabulary inside their
predicate, need a column in `re_chunks` and a clause in `_filter_to_sql`, and otherwise become another
`extra_scopes`: a facet in one backend and not the other. So "2019 papers for class 10 maths" resolves
on OUR side into a `document_ids` filter, which is the same boundary the Phase 4 curriculum contract
draws.

**Caveat on all of the above:** `SourceType.PYQ` has existed since the beginning and nothing has ever
ingested one. Every statement here comes from code paths and direct probes, not from an observed
corpus. Ingesting a single real PYQ would settle the role question empirically and is cheap.

### Every enum in the tenant schema is an unconstrained varchar

`field.Enum` in ent's Postgres dialect renders as plain `character varying`, with no native enum type
and no CHECK constraint. `persons.status` in the initial migration is
`"status" character varying NOT NULL DEFAULT 'active'` — nothing more.

So `INSERT ... kind = 'banana'` succeeds at the database level. The only thing stopping it is
`entcontentitem.KindValidator`, and only when the write goes through ent. Every enum column in the
tenant schema is in this position: `kind`, `status`, `index_status`, `origin`, `grain`, `audience`.

**Two of them are constrained anyway, by accident of something else.** The whole tenant schema contains
exactly two CHECK constraints, both ones we wrote deliberately for a different purpose:

    content_items_audience_scope    (audience='school' AND …) OR (audience='grade' AND …) OR …
    content_placements_grain_node   (grain='curriculum' AND …) OR (grain='node' AND …)

An out-of-vocabulary `audience` or `grain` matches no disjunct and the CHECK rejects it. So those two
columns are pinned at the database level as a side effect of the pairing constraints, and the rest are
not.

**And the accident depends on a second, unrelated decision one layer further down.** It works only
because `audience` and `grain` are NOT NULL. An out-of-vocabulary value makes every disjunct evaluate
to FALSE and the CHECK rejects it — but if either column were NULLABLE, the disjuncts would evaluate
to NULL, Postgres treats a NULL CHECK as PASSING, and the pin evaporates silently. So making one of
those columns optional for some future reason would remove an enum constraint nobody wrote down as
depending on it.

That is worth stating precisely, because "audience is NOT NULL with no default" was decided for a
different reason entirely — a row should not be able to exist without a stated audience — and it is
now load-bearing twice. That is worth knowing precisely, because `retrieval.LabelFor` is required to be TOTAL over the
audience enum and its exhaustiveness test guards the Go side — the database happening to agree is luck
that follows from an unrelated decision, not a second line of defence anyone designed.

Consequence for anything that ever writes outside ent — a bulk import, a repair script, a migration
backfill: the enum vocabulary is a Go-side convention there, not a database guarantee. Adding an enum
value is therefore free in SQL (adding `paper` to `kind` emitted no statement at all), and so is adding
an invalid one.

### The paper sidecar pairing is enforced in the route, not the database

Three gaps stand after the `question_papers` schema landed, and all three are application-layer by
necessity rather than by oversight:

- nothing in the database stops a `question_papers` row pointing at a `kind='book'` item
- nothing requires a `kind='paper'` item to have a sidecar row at all
- the `kind='paper'` -> `SourceType.PYQ` mapping does not exist in code yet; it lands with the ingest
  client, which is unbuilt

The first two are cross-table conditions and a CHECK constraint cannot express them — it would take a
trigger or a deferred constraint, and neither is worth the machinery here. So the pairing is enforced
where the writes go: both directions refused at the HTTP layer, `kind=paper` without a `paper` object
and a `paper` object without `kind=paper`.

The consequence is the same one the enum finding has: a write that does not go through the route — a
repair script, a bulk import, a migration backfill — can create a pair the application would have
refused. That is the general shape to carry: **this schema constrains less than the Go code implies,
and the gap is exactly the set of writers who bypass ent.**

### A third capability that read as present and could not fire

`SourceType.PYQ` has existed in the retrieval engine since the beginning, commented "previous-year
question paper" — and `POST /ingest/file` accepted no `source_type` parameter at all. The pdf branch
hardcoded `BOOK`, the image branch hardcoded `NOTES`. **Nothing in the service could emit `pyq`.**

It was load-bearing rather than cosmetic, which is what makes it worth recording. `source_types` IS a
`Filter` facet, so "give me the previous-year papers" was a perfectly expressible query that would have
matched nothing for ever — and our `kind = paper` had nowhere to map to. Fixed by its maintainers with
an optional, enum-validated `source_type` parameter that 422s on an unknown value naming the valid set,
refuses `av` (the extension decides that), and leaves the default untouched when omitted.

That is the third instance of one shape in a single day, across two repositories:

    BlockType.QUESTION -> EXERCISE at 0.92     the strongest role rule, zero producers anywhere
    /health/providers?strict=true              cannot report an unrecognised provider as degraded
    SourceType.PYQ                             a filter facet nothing could ever stamp

Each reads as a working feature. Each is unreachable. None would fail a test, because there is nothing
to test — the code is correct and simply never runs. The tell they share is that a CONSUMER exists
without a PRODUCER: a rule with no input, a check with no failing case, a filter value nothing writes.
Worth looking for deliberately, because the usual signals — coverage, a failing assertion, an error in
a log — cannot report an absence.

### A/V is not special; it is where the general mechanism cannot run

Confirmed with the engine's maintainers: an image upload takes the OCR path, whose id comes from
`_digest_pages` — a hash of page bytes and page number, never the filename. So a SCANNED question
paper is content-addressed and idempotent exactly as a PDF is, and does not inherit the duplicate-on
-re-ingest problem.

Every ingest path derives its id from content. A/V is the one path that cannot compute a checksum at
ingest, so it falls back to a random uid, and the duplication follows from that absence rather than
from any decision about recordings. That is a better framing than "A/V is the special case", because it
says what to check when a new path appears: can this path hash its content? If not, it inherits the
whole reconciliation problem, and nothing will warn you.

### Run "consumer with no producer" as a sweep, not as a finding

Naming the pattern turned up three instances. Running it as a deliberate enumeration turned up two
more within an hour, in a table nobody had reason to look at:

    BlockType.QUESTION -> EXERCISE at 0.92    decisive alone, no producer anywhere
    BlockType.CAPTION  -> CAPTION  at 0.90    decisive alone, no producer anywhere
    BlockType.HEADING                          dead at both ends

Two of the five rules in that classifier's highest-confidence table can never fire. Which sharpens the
conclusion about question papers considerably: `role=exercise` is unreliable on a paper NOT because the
rules are bad, but because **the one signal that would identify a question with certainty is the one
nothing emits. The rules are correct and starved.**

**The diagnostic, in a form that can be applied rather than admired:** when you add an enum value, a
rule, or a health check, ask what WRITES it. If the answer is "nothing yet", say so in the code. A
capability that reads as present and cannot fire will not fail a test, will not dent coverage, and will
not appear in a log, because there is nothing to observe — the code is correct and never runs.

**And the fix is a producer, not a deletion.** The unreachable enum values are the seam a layout-aware
ingest path would plug into, and the classifier is already built to reward them. Deleting them removes
the affordance and leaves the consumer no better off. That is the same position we took on
per-question retrieval: bring the requirement, not the design.

### Known inconsistencies in the library surface, collected for one coherent pass

Three warts, each deliberately left rather than fixed in passing, because each is a convention question
that should be settled once across the surface instead of locally where it was noticed. The first of the
three has since been settled; the other two are still open.

**Two statuses for immutable-field refusals — settled, now 422.** `rejectImmutableLibraryFields` used to
answer 400 while `rejectImmutableCurriculumFields` and the question-paper `content_item_id` refusal
answered 422. The library one now answers 422 as well, so every immutable-field refusal on this surface
carries the same status. This deliberately changed shipped endpoint behaviour: a client that branched on
400 for `asset_id` or `owner_person_id` on `PATCH /library/{id}` will now see 422. The messages are
unchanged. `TestEveryImmutableFieldRefusalAnswersTheSameStatus` exercises all three paths together so the
convention cannot drift back one endpoint at a time.

**Coded and uncoded refusals side by side.** Six asset refusals carry machine-readable codes; the
create route's plain 400s (`file_name is required`, `storage_key … must not be supplied`) do not. The
rule that produced the six is worth preserving when the sweep happens: **a code means a machine should
branch on this**, not that every refusal deserves an identifier. All six mark refusals a client cannot
predict from its own request. `file_name is required` is visible to the client before it sends.
Swept as "code everything", the pass would erase the distinction it exists to express.

**Explicit null clears on the question-paper sidecar and is dropped everywhere else.** The sidecar is
the correct behaviour and the item is the wart — see the note above. When the repo-wide "null means
clear" versus "null means absent" question is settled, the sidecar is the precedent to move toward, not
the exception to reconcile.

### The paper sidecar cannot be field-gated independently of its item

`question_papers` fields are validated against `entquestionpaper.Columns` under the same
`core.library.*` entity, which is right — a paper's readability is its item's readability, and a second
scoping rule would be a second place for them to disagree.

The consequence is not obvious and someone will meet it eventually, so here it is in the words of the
worker who found it:

> The library field policy is a flat allowlist of column NAMES under `core.library.*`, so it is applied
> to `question_papers` by name, not by table. `metadata_json`, `id`, `created_at` and `updated_at` are
> names the sidecar shares with `content_items`. A policy that denies `metadata_json` on library
> therefore denies it on the paper's sidecar too, and there is no way to field-gate the sidecar
> independently of its item. This is coherent — a paper's readability is its item's readability, and
> that is the rule we wanted — but it is invisible at the call site, so the first person who wants
> `exam_year` visible to a role that cannot see `content_items.metadata_json` will find the two
> decisions welded together. The fix, if it is ever needed, is a per-entity field policy, not a second
> authorization entity for papers.

Only those four shared names are coupled. The eight sidecar-only names — `exam_type`, `board`,
`exam_year`, `total_marks`, `duration_minutes`, `paper_set`, `attempt`, `content_item_id` — gate
independently.

### The unreachable-capability sweep, run on this repo

Six findings. The authorization entities, catalog areas and config came back CLEAN on a full-repo grep
of all 111 entities and every config field — worth stating, because a sweep that finds something
everywhere is usually finding its own method.

**Three trace to one unbuilt feature — content ingestion — and are expected rather than defects:**

- `content_items.index_status` (pending/indexed/failed): zero production writers. Only `none` exists.
  `engine_document_id` and `engine_section_id` are equally unpopulated. Consistent absence.
- `ContentNode`: zero create/update/delete anywhere, and no route. The consequence is bigger than a
  dormant table — `content_placements.content_node_id` is settable through `createPlacement`, but
  `checkPlacedContent` can never find a matching row, so that optional FK and its validation branch can
  never succeed.
- `retrieval.LabelFor` / `LabelsFor` / `Item`: zero production callers. The item-labelling half of the
  design is dead while the viewer half (`ScopesFor`) is live and serving `GET /library/scopes`.

Treat those as ONE finding with three surfaces, not three findings. They all resolve when ingestion is
built and none of them is drift between two live parts.

**One is a genuine gap that reads as protection and is not:**

`content_items.status` (draft/published/archived) is fully writable through the API and **nothing
anywhere branches on it**. `LibraryItemsFor` filters on audience, scope and constraints and never on
status. So an item marked `draft` is exactly as visible as one marked `published`, and archiving an
item does nothing at all. "Publishing" in this codebase means `checkPublishScope`, which is about
audience scope — a different field entirely with a confusingly similar name.

**One is dead code shaped like a working feature:**

`assets.status = "deleted"` has no producer — there is no delete-asset route — yet `markAssetReady` has
a refusal branch for it, `getAssetLink` has a special-cased message, and there is a dedicated
`AssetDeletedCode`. Someone reading those will conclude soft-delete is implemented and handled safely.
It is not implemented at all. The guard logic is correct and unused.

**And one is reachable only by defeating its purpose:** `content_placements.origin = "inferred"` is
settable by any caller, but no automated producer exists, so "inferred" means "a human asserted this
was inferred", which is indistinguishable from a false claim.

### Board strings are three boards, and the fix is on the write side

`question_papers.board` and `curricula.board` are both free strings matched with exact equality. So
`CBSE`, `cbse` and `C.B.S.E.` are three different boards, and a filter for one finds none of the
others.

The tempting fix is `EqualFold` on the read. It was offered and declined: a fold cannot use the index,
and more importantly it MASKS the problem rather than solving it — the rows are still three boards, and
every future consumer that does not remember to fold sees them as three. The fix is normalising on
write, once, for both tables. Neither has been touched.

### content_items.status now gates reads, on both paths

`LibraryItemsFor` built its audience disjunction and never mentioned `status`, so an
`audience = 'school'` arm admitted a row whatever its draft/published/archived state — and `LabelsFor`
stamped the same row into the corpus. **A teacher's draft was published to the whole school the moment
it was saved.**

Note the naming that hid it: "publishing" in this codebase means `checkPublishScope`, which is about
AUDIENCE scope. A different field with a confusingly similar name, whose existence made the surface
look as though publication were already handled.

One clause at the single choke point every audience arm funnels through: published, OR owned by the
viewer. `ReachTenant` returns `AnyLibraryItem` before reaching it, so tenant and unrestricted are
untouched, and `libraryOneOf` still renders the bare deny predicate when there are no arms.

**Both halves had to move together.** `LabelsFor` now refuses with `ErrNotPublished` before minting
anything, because an unpublished item must not be in the corpus at all. Changing only the SQL side
would have left the engine serving drafts that emerge-core refuses — the exact divergence the
agreement matrix exists to catch. The matrix went 5040 -> 16128 triples, varying status across every
fixture shape, and 1776 of those are the intended divergence: an owner reading their own unpublished
row that the corpus deliberately does not hold. That is asserted as intended rather than tolerated —
every unpublished row must be predicate-admitted-and-label-withheld at least once, so a matrix that
stops seeing the divergence fails.

**Three precisions on what the gate does NOT do**, all from the worker who built it:

- "reachable only by their owner" is too strong. An unpublished row is reachable by its owner ONLY
  WHERE AN AUDIENCE ARM ALREADY ADMITS IT. An owner's draft with `audience=section` for a section they
  do not teach stays invisible to them. A bare ownership arm was deliberately NOT added, because it
  would WIDEN — it would newly admit a row no arm ever admitted. That row was already unreadable before
  this change, so nothing regressed, but the phrase promises more than the predicate delivers.
- `reach=tenant` and unrestricted callers read every draft in the school. This is a scoped-reader gate,
  not redaction.
- Archived is behaviourally identical to draft, so an archived item stays writable BY ITS OWNER.
  Archiving is therefore reversible by the author and by tenant reach and by nobody else — a head of
  department at `teacher_assignment` reach cannot un-archive a departed teacher's item. That matches
  who could have archived it, and it is a real operational edge.

### The transition out of published has no un-stamp, and ErrNotPublished must mean "skip"

`LabelsFor` refuses to stamp an unpublished item on the way IN. Nothing removes an item from the
corpus on the way OUT. So `published -> archived` drops the item from `LibraryItemsFor` while the
engine keeps holding it.

Harmless today only because `LabelsFor` has no production callers. Two things bind whoever builds
ingestion:

- the status transition needs an un-stamp — a delete or supersede against the engine — or archiving
  hides an item from the human path while AI retrieval keeps answering from it;
- `ErrNotPublished` must be handled as **skip, do not index**, never as a failed request. Treated as an
  error, every draft save 500s.

### A fourth test that asserted its own bug

`TestLibraryReadsStillReachTheSchoolDocumentsOfOthers` asserted that a narrowed viewer CAN read another
person's school document — and its fixture hardcoded `status: draft`. So the test encoded the exposure
and would have defended it against the fix. Two fixture builders needed one line each; a third,
`placementOwnedItem`, still passes without a status because the owner escape carries it.

That is the fourth instance in one session of a test that passes for the wrong reason, after the
engine's Ollama truncation test asserting `LLMSchemaError`, two shared-fixture collisions, and a
mutation landing on unreachable code. The count matters more than any one of them: it is not
carelessness, it is the default outcome of writing a test from the same understanding that produced the
code.

### Publication and index freshness are independent axes, and separating them found a detector

`GET /curriculum-nodes/{id}/content` was going to carry one `index_state` with a fourth value,
`unpublished`, folded in alongside current / stale / not_indexed. The worker building it refused, and
the reason is the interesting part.

An item that was published, indexed, and then archived reads `index_state: current` AND
`retrieval_state: unpublished` — **the engine is still holding its text while the row is no longer
corpus-eligible.** Folded into one field, that state is indistinguishable from a draft that was never
indexed. Kept apart, it is visible.

That matters more than a response-shape argument, because it is precisely the gap recorded above under
"the transition out of published has no un-stamp": `LabelsFor` refuses on the way in and nothing
removes an item on the way out, so `published -> archived` hides an item from the human path while AI
retrieval keeps answering from it. We cannot fix that until ingestion exists. An operator resolving a node now gets
`index_state: current` with `retrieval_state: unpublished`, which says "this mapping is answering from
text that should not be there". A retraction is a different job from an ingestion, for a different
person, and one field could not have said so.

**BOUNDED, because the first draft of this note overstated it and someone would have built on the
overstatement.** Resolve is a SPOT-CHECK ALONG THE CURRICULUM PATH, not an inventory of the corpus. It
surfaces an orphaned entry only where three things are already true: the item is mapped by a placement,
that placement is confirmed and sits on a curriculum node the caller can reach, and the item survives
`LibraryItemsFor`. Any of those failing hides it:

- an archived item with NO placement is invisible — the endpoint is keyed by curriculum node and reads
  nothing else
- an item whose only placement was rejected is invisible, since rejected never resolves under any flag
- an item on a node outside the caller's reach is invisible to that caller, so WHICH operator asks
  changes the answer
- an archived item owned by someone else drops at the library gate and reads as `restricted` rather
  than as an orphan — correctly, since telling that caller would be the leak

So "resolve returns no unpublished-but-indexed tuples" does NOT mean the corpus is clean, and **an
un-stamp mechanism cannot use this endpoint to find its work.** It needs to enumerate `content_items`
where `engine_document_id IS NOT NULL AND status != 'published'` directly — no placement join, no
viewer scope. That query does not exist and nobody owns it.

What resolve genuinely provides is the human-facing half: the operator already looking at a syllabus
point learns that this particular mapping is answering from text it should not be.

So each tuple carries three:

    retrieval_state   current | stale | not_indexed | unpublished    derived; branch on this
    index_state       current | stale | not_indexed                  the raw index axis
    content_status    draft | published | archived                   the raw publication axis

`retrieval_state` and `index_state` always survive the field policy, because suppressing either
collapses the distinction the endpoint exists for. `content_status` is gated like any other library
field, and its value is what tells a caller whether the action is "publish" or "restore".

**Resolution precedence:** `unpublished` is the summary only when EVERY readable tuple is unpublished.
A node mapped to one draft and one published-but-unindexed item reports `unindexed`, because an
ingestion is genuinely outstanding and reporting "unpublished" would hide it. `counts.unpublished`
still shows the draft. Both rules agree on the case that motivated all this — a teacher resolving their
own chapter where everything readable is their own draft.

**And the ordering falls out correctly for the leak:** unreadable is decided before unpublished,
because the library gate runs first. An unpublished row you cannot read is `restricted`, not
`unpublished` — the caller learns a placement was dropped, not that a draft exists.

### A placement is visible only if BOTH its curriculum and its content item are

`listPlacements` and `getPlacement` scoped through `ContentPlacementsFor` — the curriculum edge — and
never constrained the content-item edge. So a caller holding `core.content_placements.read` and no
library grant learned the id of every content item mapped to a curriculum they could reach, and which
syllabus point each covers. Reproduced against real Postgres before the fix: `content_item_id` for a
stranger-owned `audience=owner` item, served in the body.

The inconsistency was the sharper half. Three sibling paths already gated exactly this —
`createPlacement`, `checkPlacedContent` and `resolveCurriculumNodeContent` — so two of four gated and
two did not, which means a reader would reasonably assume all of them did. Read and write now agree on
one rule: a placement is visible only if both its curriculum and its content item are.

**Why the row VANISHES rather than appearing with the item id omitted**, which was the option I
leaned toward and was wrong about:

- Omitting `content_item_id` does not close the leak. The row also carries `content_node_id` — which
  CHAPTER of the item — plus `page_start`, `page_end` and `copied_from_placement_id`. Blanking all of
  them leaves `{id, curriculum_node_id, grain, status}`, which is a tombstone, not curriculum
  information.
- It would contradict the write path. `createPlacement` refuses an unreadable item with "does not name
  a known content item" — it asserts the item does not exist. A read returning a tombstone says "an
  item exists here, you just cannot see it". The two would disagree about the same fact.
- The signal a curriculum editor actually needs already exists next door. `resolve` returns
  `counts.placements` / `counts.unreadable` and `resolution: "restricted"` — "there are N mappings
  here and you can see none of them" — without naming any of them. If that signal is ever wanted on
  `GET /placements` too, the right shape is a counts field mirroring resolve's, not a half-row.

**A denied library decision is 403 on both routes, decided before any row is queried.** That does not
violate "an unreachable row is 404": the refusal is computed purely from the caller's grants, is
byte-identical for every id including ones that do not exist, and consults no row — the test asserts
that no query reaches `content_placements` on that path. An empty 200 was the alternative and was
rejected for being indistinguishable from "this curriculum has no placements", which is the same lie
this endpoint exists to stop telling.

**And the widening on a denied decision is not hypothetical.** With the `Allowed` check mutated out, a
caller whose library decision was DENIED got their whole default personal scope back — two placements
instead of none. That is the third time today this exact shape has been found: a CAS denial returns
`Decision{Allowed:false}` with a nil error, and feeding it to a predicate yields more than a narrow
grant would.

**None of it could have been settled by the stub driver.** `libraryReachable` refuses correlated
subqueries, so a stub test could only assert SQL text. Every test here is Postgres-backed, including
the one that matters most for the shape of the fix: a `limit=2` page over two visible and two hidden
placements must return a FULL page of two, not a short one — which fails the moment anyone converts
the gate into a Go post-filter.

### Giving a dead state a producer made a live endpoint start lying

`assets.status = "deleted"` had no producer — no delete route existed — while `markAssetReady` and
`getAssetLink` both carried correct refusal branches for it and there was a dedicated
`AssetDeletedCode`. The sweep's recommendation, followed, was to give it a producer rather than delete
the branches: the guard logic was already right, and removing it would have been fixing a cosmetic
problem by discarding a correct affordance.

`DELETE /api/v1/library/assets/{id}` is a SOFT delete — status only, row kept, object untouched. The
row must survive so that a `content_items.asset_id` still pointing at it stays explicable rather than
dangling, and `content_items.asset_id` carries ON DELETE RESTRICT, so a hard delete would be refused
by the database in the common case anyway.

**Ownership, not reachability.** `scopedAsset` grants read reachability — attached to an item I can
read, OR uploaded by me. Using it as the DELETE gate would be the Phase 1 critical again: any pupil who
could read a school-wide item could delete the PDF behind it. `deletableAsset` composes `scopedAsset`
and ANDs `uploaded_by = caller`, short-circuiting for unrestricted and `reach=tenant`, mirroring
`LibraryItemsWritableBy` exactly.

**AND CLOSING IT CREATED A DEFECT SOMEWHERE ELSE.** `placedAssetDigests` in the resolve endpoint
queries assets by id and reachability and never looks at `status`. So a deleted asset still yields its
digest, and resolve reports `index_state: current` / `retrieval_state: current` for content whose bytes
`getAssetLink` refuses with a 409. An active false claim, on the surface clients drive retrieval from.

That code was not wrong an hour earlier — it was correct only by accident of the state being
impossible. **This is the general risk of closing an unreachable-capability finding: other code may be
correct only because the state could not occur, and nothing marks which code that is.** The sweep finds
the dead capability; it does not find the consumers that quietly assumed it stayed dead.

### Two gaps around asset deletion, neither closed

**Nothing in this repo ever removes an S3 object.** `internal/infrastructure/blob` has no delete or
remove method at all. So `deleted` means "the API will not hand you the bytes" and never "the bytes are
gone". `docs/LIBRARY-CURRICULUM-PLAN.md:188` says the status "keeps the row after the S3 object goes",
which describes a reaper that does not exist. Storage grows without bound, and a deleted asset's bytes
remain retrievable by anything holding a presigned link issued before the delete — the link is a bearer
credential and deletion does not revoke it.

**`assets.uploaded_by` is nullable** and `createAsset` uses `attributedToOptional`, so an asset created
by a caller with no person record has a NULL uploader and can then be deleted by nobody below tenant
reach. Correct-safe, and a real consequence of choosing ownership over reachability rather than an
oversight.

### The stripped comments moved the reasoning somewhere nobody looks

A brief quoted "the schema comment says why" about the soft-delete design. There is no such comment:
`0133fd8` stripped every comment in the repo, and the sentence survives only in
`docs/LIBRARY-CURRICULUM-PLAN.md`. The quote was accurate as text and wrong about where it lives.

That is the second cost of that commit, after it silently disabled `go generate` repo-wide by mangling
a `//go:generate` directive into `// go:generate`. The no-comments rule stands — it is a deliberate
house rule and the reasoning genuinely is better off in docs — but it means a schema file states WHAT
without any pointer to WHERE the why is, and a reader looking at `asset.go` has no way to know that
`docs/LIBRARY-CURRICULUM-PLAN.md:188` explains the status enum they are looking at.

### source_deleted, and why the obvious fix was the worst answer

Making `assets.status = "deleted"` reachable made resolve assert something false — it reported
`index_state: current` / `retrieval_state: current` for content whose bytes the API refuses.

The obvious fix, and the one recommended, was to skip deleted rows in the asset query so the digest
falls through. **That produces `stale`**, proven by mutation rather than argued:

    === deleted rows skipped so the digest falls through (the recommended fix) ===
    --- FAIL: TestResolveDoesNotTellAnyoneToReIngestADeletedSource
        neither not_indexed nor stale is the truth here; both invite a re-index

I had worried it would fall to `not_indexed` ("run an ingestion" — wrong action). It falls to `stale`,
which is worse: that is the state that most actively invites a re-index, for a source that cannot be
re-ingested because there are no bytes to fetch.

So the digest is KEPT for a deleted asset and carried with a `deleted` flag, which lets both axes stay
honest: `index_state` remains `current`, because the engine's text genuinely does match the digest we
recorded and that is a true statement about the raw axis, while `retrieval_state` becomes
`source_deleted`. Together they say "the engine holds text matching digest X, and the source behind X
will not be served". Folded into one field that is indistinguishable from never-indexed — the same
argument that made the two axes worth having in the first place.

**Precedence: `source_deleted` outranks `unpublished`.** If a row is both, publishing it would be
actively harmful — `LabelsFor` would start minting labels and the engine's text becomes searchable
again, backed by nothing servable. The caller has to be told about the source first, or the obvious
next action makes things worse.

**The name states what the API did, not what happened to the bytes.** No "gone", "lost" or
"unrecoverable", because no reaper exists: if none ever runs, the bytes are still in S3 and the state
is fully reversible by un-deleting the row. A name that implied otherwise would be a second lie
replacing the first.

**Adding the fifth state exposed a latent hole in the fourth.** `resolutionOf` ended in
`default: unindexed`, so a node whose tuples were all source-deleted or unpublished would have reported
"run an ingestion" with no ingestion pending. The ordering is now explicit — unmapped, restricted,
resolved, unindexed only when a real ingestion is outstanding, then source_deleted, then unpublished —
and both previously pinned behaviours survive unchanged.

**And one case beyond the brief:** a NEVER-INDEXED item whose source is deleted. The asset query only
fetched assets for items that already had `indexed_sha256`, so an unindexed item's deleted source was
invisible. That is where `not_indexed` is worst of all — it says "run an ingestion" for a job that
cannot succeed. Mutating the query back to indexed-only fails the new test.

### A param route beside static siblings swallows them, and the router says nothing

`/library/{id}` matched `GET /library/assets`, `DELETE /library/scopes`, `PATCH /library/scopes` and
`DELETE /library/assets`. Each reached an item handler and was stopped ONLY by `uuid.Parse` returning
400. The router did nothing.

The 400 made it look harmless. It is not, and the reason is ordering: **authorization runs before the
handler.** `DELETE /api/v1/library/scopes` evaluated `core.library.delete` — a real authorization
decision, taken and logged, about a request that could never be a delete. The 400 was cosmetic cover
over a decision already made.

Enumerating where this is structurally possible — a param route with static siblings under one parent
— gives exactly two places:

    /library   {id}  beside  /scopes, /assets, /assets/{id}, /assets/{id}/ready, /assets/{id}/link
    /persons   {id}  beside  /link, /provision

The second was found only by asking the structural question after fixing the first. `/persons/link` and
`/persons/provision` are POST-only, so `DELETE /api/v1/persons/link` was shadowing to `deletePerson`
and evaluating `core.persons.delete`.

Both are now constrained by one shared `uuidParam` constant, so a non-UUID segment cannot match the
item route at all and the router refuses before any entity is consulted.

**The other ~40 `{id}` routes are deliberately NOT constrained**, and the inconsistency is the point
rather than an oversight. None has a static sibling, so no shadow is possible on any of them; the only
cost there is audit noise. Constraining them would replace `400 "id must be a UUID"` with a bare router
404 everywhere — strictly less useful to a client — to fix a cosmetic problem in forty places and a
real one in none.

**So the rule to apply when adding a route:** if you add a STATIC path beside an existing `{id}` route,
that `{id}` route must be constrained, or the static path is silently swallowed for every method it
does not itself register. That is the condition worth checking, not the presence of a param.

### The RAG restriction chain is BUILT ON BOTH SIDES AND INERT

Status confirmed with the engine's maintainers 2026-09-09. Both halves exist. Nothing is connected.

Three independent things each make it inert today, and any one alone would:

1. **Nothing calls the scopes client.** Zero importers of `scopes_client` in the engine outside itself.
   No token is ever exchanged with us.
2. **Nothing populates `held_labels`.** `api._visible` takes it keyword-only defaulting to
   `frozenset()`, and none of its 12 call sites passes it. Every served request runs with zero labels.
   (Reported as 15 first: a substring grep for `_visible(` also matches the definition line and a
   different function, `_job_visible`. The count that answers the question is
   `grep -n "_visible(" api.py | grep -v "def _visible\|_job_visible"`. The finding was unchanged
   either way — zero of them pass it — but the number was wrong.)
3. **Nothing stamps `restricted_to`.** It is `[]` on every row, because stamping (E3) is unstarted.

So the engine answers exactly as it did before any of this existed. That is the intended safe state
while stamping is held for sign-off — but **it fails in the reassuring direction.** Anyone who believes
the chain is live believes something false, and the symptom of being wrong is that everything is
visible rather than that something breaks.

On our side the same is true: `LabelFor` and `LabelsFor` still have no production callers, so we mint
no labels either. Two correct halves, no wire between them.

### What a caller actually gets, measured

The engine's maintainers ran this rather than reasoning it:

    document                    zero labels    holds class_10.sec_a
    unstamped                   visible        visible
    restricted_to: []           visible        visible
    restricted_to: NULL         visible        visible
    stamped class_10.sec_a      REFUSED        visible
    stamped class_10.sec_b      REFUSED        REFUSED

Absent, empty and NULL are one answer: unrestricted. Zero labels means "holds nothing", never "skip the
gate" — there is no value that means not-consulted.

**And one thing we had not assumed: a stamped GLOBAL document is also refused** to a caller without the
label. The gate is not tenant-conditional, so stamping a document restricts it from everyone who does
not hold a matching label, including across the global corpus.

### A search that finds nothing cannot say why, and that is ours to fix

Our status gate means an author can read their own draft while `LabelsFor` refuses to stamp it, so the
draft is deliberately absent from the corpus. We assumed the engine would report that as some kind of
empty answer.

It cannot. From the engine's side there is nothing to find, which is **indistinguishable from a book
that was never ingested, or one whose ingest failed.** `no_good_match` does not fire differently. There
is no signal the engine can give that separates unpublished from never-ingested.

So if "I can see it in the library but search finds nothing" becomes a support burden, the fix is on
OUR side — the library UI has to say it, because retrieval structurally cannot. This is the same shape
as the resolve endpoint's four cases: the distinction has to be made where the information exists.

### The engine now DOES verify tokens — superseded 2026-09-09

The section below was true when written. `jwt_verify.py` landed in the retrieval engine: it verifies a
CAS RS256 token against `/.well-known/jwks.json`, pinning algorithm, issuer and audience, and
`api._caller` can read `tenant_id` from the VERIFIED claim rather than from the unsigned header.

**BUT THE DEPLOYED POSTURE HAS NOT CHANGED, and an earlier version of this note said it had.** The
rollout is two-stage: until `RE_JWT_REQUIRED` is set, the verifier runs and LOGS disagreements while
the unsigned header still decides. So "the engine verifies tokens" is true of the code and not yet of
any running deployment. **Do not carry "forged tokens are rejected at their door" into a threat model
until that switch is on somewhere** — which, at the time of writing, it is not.

That correction came from the engine's maintainers, unprompted, after I had already written the
optimistic version. Worth noting as its own lesson: a capability landing in a repo and a capability
being in force are different facts, and the gap between them is exactly where a threat model goes
stale without anything looking wrong.

Two details of how they shipped it are worth borrowing:

**It is two settings, not one.** With enforcement off, a verified token's tenant is compared against
`X-School-Id` and a disagreement is LOGGED rather than refused. That counter reaching zero is the
evidence that flipping the switch is safe. Promoting the token straight to authoritative is how a whole
deployment starts resolving to the wrong tenant at once — every request, no errors, just the wrong
school's content.

**On a mismatch it refuses rather than picking a side**, and the reasoning is exactly the question our
own `RequireTenant` faces: taking the token hides a confused client, taking the header defeats the point
of having signed anything. Neither source wins; the disagreement is the answer.

**An unreachable JWKS is 503, never 401** — which is the same defect we were fixing in
`cas/verifier.go` on the same day, arrived at independently. Two teams hit the identical conflation;
one built it right the first time.

### (Superseded) The engine does not verify tokens, so we are the only rejection point

Confirmed: zero occurrences of `jwks`, `jwt` or `PyJWT` in the engine or its requirements. Local
signature verification was withdrawn from ADR-012 as "hardening, not a requirement", and it has not been
built.

Two consequences to hold together:

- **Every forged or expired token reaches emerge-core.** We verify against CAS's JWKS and reject, so
  the security outcome is unchanged — but the cost of a forged request is a full round trip to us
  rather than a local signature check at their door.
- **Once E5 is wired, the engine receives and forwards end-user tokens, which it does not do today.**
  That widens what a compromised engine yields: not just its corpus, but live tokens replayable against
  emerge-core and CAS. This is a real cost of the pull decision. Push had worse problems and the
  decision stands, but the cost should be known rather than inherited.

### The blob profile map: the shape, and the tenant nobody thinks of

Corrected twice by the engine's maintainers, both times after they RAN the loader rather than read it.
The verified shape:

    {
      "version": 1,
      "default": null,
      "profiles": {
        "dps_ngp":       {"store": "s3", "bucket": "<per-school>", "aws_profile": "school-dps-ngp"},
        "shared_global": {"store": "s3", "bucket": "<global>",     "aws_profile": "global-media"}
      },
      "tenants": {"DPS-NGP": "dps_ngp", "_global": "shared_global"}
    }

**Tenant ids are NOT top-level keys.** There are exactly four: `version`, `default`, `profiles`,
`tenants`. `profiles` are named destinations; `tenants` maps a tenant onto a profile id. The
indirection is the point — two tenants sharing a destination on purpose is one visible line rather than
two identical blocks. A map with tenant ids at the top level is refused:
`unknown top-level key(s) 'DPS-NGP'`.

`version` is required and must be 1. `default: null` is required and explicit — omitting the key is a
load failure, not a policy. `store`, not `kind`. `region` is optional and s3-only: omitted, boto3 falls
back to the named botocore profile's own region, and it is NOT part of a destination's identity, so two
profiles differing only by region still collide. On a GCS profile `region` is a load error rather than
ignored, because "an ignored key looks exactly like one that worked".

**`_global` IS A TENANT, and a map naming only real schools breaks every global document.** Publisher
and shared content resolves its figures and page images through `_global`'s profile, for every caller —
that is the rule that makes shared content work at all. With `default: null` and only real schools
mapped, every global document's media raises `UnknownTenantProfile`.

It WARNS at load rather than refusing, so the failure lands at the first media request rather than at
startup. Treat the warning as an error: give `_global` its own profile, or set `default` to a profile id
and accept that unmapped tenants then share it silently.

**A map full of placeholders validates.** The reshaped map above was run VERBATIM and loaded clean —
`"bucket": "<per-school bucket>"` passes, and so do `"TODO"`, `"Bucket_With_Caps"` (uppercase is illegal
in S3) and an 80-character name (over S3's 63 limit). The only bucket check is non-empty-after-strip.
So a map with unreplaced placeholders passes every structural check and fails at the FIRST MEDIA
REQUEST — the same late arrival that makes the `_global` omission dangerous. It fails loudly when it
fails, so this is lateness rather than a silent wrong answer, but **"the map validated" is not evidence
the buckets are real.** Grep any map for `<`, `TODO` and uppercase before provisioning.

**And turn profiles on BEFORE the first ingest, not after.** Keys carry no tenant component
(`figure_key`, `frame_key`, `page_key`), so isolation comes entirely from which store a key resolves
against. That is what makes enabling profiles need no data migration — and it is exactly why enabling
them after ingest silently STRANDS the existing objects in the old store. Nothing detects that.

### Reasoning about a validator is not the same as running it

The engine's maintainers were wrong about this file twice: first telling us to omit `default` (omitting
it is a load failure), then confirming three rules while never mentioning `version`, `profiles` or
`tenants` — validating the parts asked about and leaving the frame wrong. Both errors came from reading
the validator instead of executing it. Their conclusion, which is the transferable part: do not answer a
question about a validated format without running the format through it first.

That is the same shape as this session's other recurring finding. A test only counts once you have
watched it fail for the right reason; a format rule only counts once you have watched the loader refuse.

### One PUT could take a school offline, and the credentials were never validated

`putSchoolProfile` decoded the request body into `map[string]any` and pushed whatever arrived through
`EncryptCredentials` into an `UpdateNewValues()` upsert. Three things compounded: no validation of any
kind, an upsert that REPLACED a working profile, and a following `registry.Evict(id)` that dropped the
cached connection. So a single `PUT /api/v1/schools/{id}/profiles/postgres` with `{"foo":"bar"}`
overwrote a live school's database credentials and took it offline, with the previous ciphertext gone.
An unknown school id reached Postgres as an FK violation and surfaced as a 500.

Reproduced and fixed:

    {"foo":"bar"}                     200 stored, row written   ->  422, nothing written
    same, school with working creds   200, ciphertext replaced  ->  422, ciphertext byte-identical
    unknown school id                 500 something went wrong  ->  404 school not found
    valid shape, host 127.0.0.1:1     200, school broken        ->  422, existing profile intact

The handler now runs: parse id, validate `{type}`, **check the school exists**, **decode into the typed
credential struct** with unknown-field rejection, **open a connection and ping it**, and only then
encrypt, upsert and evict. Every refusal returns before both the write and the evict, so a rejected PUT
leaves the pooled connection alone.

**The evict ordering was already correct.** `Evict` was last; the defect was that the write in front of
it was unconditional. Worth noting because "move the evict" would have been the plausible-looking fix
and would have changed nothing.

**A DSN can travel in a driver error.** `sql.Open("pgx", …)` parse failures can contain the whole
connection string, so the error path scrubs the literal password, its URL-escaped form, any
`://user:pass@` in the driver's own message, and `password=…` keyword DSNs — and prints
`PostgresCredentials.String()` (already redacted) rather than the DSN, falling back to "the supplied
dsn" for DSN-only credentials. Same lesson as the presigned-URL leak: a credential in an error string
is a credential in whatever logs that error.

**The validation is NOT symmetric across profile types, and should not be read as such:**

- **postgres** — shape, required fields, and a real connect-and-ping with a 3s timeout.
- **mysql** — shape and required fields, then a TCP dial only. It proves the host resolves and something
  listens; it does NOT prove the credentials authenticate, because there is no MySQL driver in `go.mod`.
- **s3** — shape only, via the blob client's own requirements. No network call, no bucket check.
- **smtp** — nothing beyond "is a non-empty object".

**And `SMTPCredentials` does not exist.** A brief listed it alongside the others; `tenancy` has only
`PostgresCredentials`, `S3Credentials` and `MySQLCredentials`, and nothing in the repo reads an smtp
profile at all. Inventing a shape would have been a product decision wearing a defect fix's clothes, so
it was left free-form and recorded here instead.

### The mail outbox: the purge is a database constraint, not a convention

`outbox_messages` lives in the CONTROL plane, because emerge-core is database-per-tenant and a
per-tenant outbox would mean a sender scanning every school's database on every tick. It is also where
the per-school SMTP credentials already live.

The settled constraint was "never persist the rendered body, the variables, or the token" — which held
while notify was assumed to send immediately. A queue breaks that: a message pending for ten seconds
and surviving a restart has to be somewhere. So the compromise, recorded as a weakening rather than
glossed: **the payload is stored encrypted and purged on reaching a terminal state.** The metadata row
survives for audit; the body does not survive the send.

**Three CHECK constraints make that structural rather than conventional:**

    outbox_messages_payload_absent_when_terminal   status NOT IN ('sent','failed') OR payload IS NULL
    outbox_messages_payload_parts_together         all three payload columns present, or all absent
    outbox_messages_failure_code_when_failed       a terminal failure carries a normalised code

The database will refuse to hold a sent message that still carries its body. You cannot read this table
and wonder whether the purge ran, because a row in that state cannot exist. **Consequence for the
sender: the UPDATE that sets sent or failed must null all three payload columns in the SAME statement**,
and a stuck-row sweeper must supply a failure code.

**A plain hash of an email address is not a hash.** The brief said "hashed where it can be". That is
insufficient and the schema corrects it: an address is low-entropy over a KNOWN population — we hold
every parent's address in the tenant databases — so a bare sha256 outbox is dictionary-reversible in
seconds. `recipient_hash` is HMAC-SHA256 with a pepper, and `recipient_hash_version` records which one.

The honest consequence: **a keyed hash here is effectively unrotatable**, because re-HMACing needs the
plaintext that was deliberately deleted. Rotating the pepper means old rows stop matching new ones. The
version column makes that legible instead of silent.

`recipient_redacted` keeps the domain (`a***@example.com`) on purpose: "all mail to @stjohns.edu is
bouncing" is the common operational question and it is unanswerable from a hash.

**There is deliberately no free-text failure column.** That is exactly where a provider's raw rejection
would land, and provider rejections quote the message they rejected — which would re-persist the token
the purge just removed. `failure_code` is an ENUM, so a provider string cannot be assigned to it in Go
even by accident.

**Two limits stated rather than assumed:**

- `registry.EncryptCredentials` binds AES-GCM AAD to `schoolID[:]`. Platform mail has no school, so
  that shape does not work here — the sender must bind AAD to the outbox MESSAGE ID, which is always
  present and unique. Falling back to a zero UUID would give every platform message the same AAD.
- "Purged" means gone from the live row promptly. Postgres keeps the old tuple until VACUUM and in WAL
  for the retention window, so it is not "unrecoverable from disk within the hour". It is ciphertext
  throughout, so exposure still requires the keyring — but the word should not be over-read, and
  aggressive autovacuum on this table is the lever if it matters.

**The claim index is partial and that is the point.** `(next_attempt_at) WHERE status IN
('pending','retrying')` measured 48 kB against a 92 MB table holding 400,000 sent rows. The sender's
index stays proportional to the BACKLOG rather than to everything ever sent.

### The tenant cross-check looks like a fail-open and is not — read this before tightening it

`RequireTenant` compares the token's tenant against the school's `cas_tenant_id` only when BOTH are
non-empty. Read in isolation that is two guard clauses turning a control off, and it was diagnosed as
exactly that today. It is not. A fix was written, and reverted before it shipped.

**An absent `tenant_id` claim is a signal, not an omission.** CAS carries it *"when the caller resolves
to exactly ONE"* tenant, and — `D:\CAS\internal\service\token.go:31-36` — *"Omitted when a user reaches
two tenants, because a partition key that is sometimes ambiguous is worse than one a service must
always ask for."* So refusing on an empty claim refuses precisely the population the omission exists
for: every superadmin, every cross-school admin, every seeding token.

**And the boundary is already one layer down.** `policies.go`:

    tenantFor(ctx)  reads the SCHOOL's slug from the tenancy context, not the subject's
    :145            the policy request carries it
    :83             the cache is keyed on (user, school)
    :231            "this school has no cas_tenant_id, so CAS was asked without a tenant
                     and answered with estate-wide grants only"

`RequireTenant` puts the school there and `server.go:119` mounts it before every `s.can(...)`, so by
the time the guard runs the policy call is already scoped to the school in `X-School-Id`. A token with
no claim reaches the middleware and is then judged by CAS against that school; a user with no grant
there gets an empty set and is refused. An unregistered school gets estate-wide grants only, which is
the conservative answer.

**So the check is coherent rather than accidentally permissive.** Because CAS omits the claim for
anyone reaching more than one school, the comparison can only ever fire for a SINGLE-tenant caller
addressing a different school — which is exactly the case worth an early cheap refusal. The emptiness
guards are the only correct behaviour given what an absent claim means.

**The mistake, recorded because it is the mirror of everything else in this file.** A middleware was
read in isolation, two emptiness guards were seen skipping a comparison, and fail-open was diagnosed —
without reading the producer of the claim or the layer beneath. **"This guard skips a check" is only a
defect if nothing else performs it**, and that was never established. We have spent a day finding
checks that look present and are not; this was a check that looked absent and was not.

Three tests now defend it rather than pinning it, each opening its failure message by conceding the
appearance — "this looks like a fail-open and is not one, so read this before you tighten it" — and
citing the CAS comment and the policy-call lines. One is a three-case table over a single school (own
slug through, foreign slug 403, empty through) because the coherence is only visible when the cases sit
together; a reader reaching for any one of them alone could still conclude "guard skips check, therefore
hole".

### Flattening an error chain is only fatal when the chain was the only place the distinction lived

The `fmt.Errorf("%w: %v", sentinel, err)` finding generalises, but not as far as "always wrap the
cause". The engine's maintainers ran the Python equivalent — `raise X(str(e))` rather than
`raise X from e` — across their own code with an AST walk and found eight instances, all pre-existing.

**None of them was the same defect**, and the difference is the useful part. Every one raises an
`HTTPException` with a DISTINCT STATUS CODE: 404 unknown section, 400 unsafe URL, 422 unknown source
type, 409 profile conflict. The chain is dropped; the distinction is not, because it survives in the
status.

Ours collapsed expired, wrong issuer, impostor signature, unknown kid and CAS-is-down into one
sentinel with **nothing else carrying the difference**. The seam was destroyed rather than relocated.

So the check is not "is the chain flattened" but **"does the distinction survive anywhere?"** That
also explains why the verifier's instance was worth fixing first: expired-versus-forged is a logging
loss, while unreachable-versus-forged is an outage that tells every user their credentials are bad.

Their explanation of why this recurs is the best one offered: **both answers are failures, so both get
handled by the same `except` or the same `if err != nil`, and the person writing it is thinking about
the happy path.** The distinction only becomes visible when someone asks what the OPERATOR should do
about it — and that question is not usually asked at the moment the error is written.

### A 403 on the tenant plane is three different answers

Verified by the retrieval engine's maintainers against our source, after I told them "403 means no":

    middleware/auth.go:85     "not permitted: <entity>"                the PERMISSION answer
    middleware/tenant.go:51   "token tenant does not match X-School-Id" a single-school token, wrong school
    middleware/tenant.go:72   "school is not active"                    an estate state, nothing about the caller

Only the first answers "may this caller do this here". The second is a real refusal but a different
one, and fires ONLY for a token that carries a `tenant_id` — so it never speaks about a multi-school
caller. The third has nothing to do with the caller at all.

So an integrator branching on the status alone gets the right behaviour for the wrong reason, and will
be wrong the first time a school is deactivated. The message carries which; the status does not.

**Worth stating for any client we hand this to:** if you need "may this user act at this school", the
answer is `auth.go:85`'s 403 specifically, and you have to read the body to know you have it. If that
matters more later, the fix is a machine-readable code on the refusal — the same treatment the asset
and scope routes already have — rather than asking callers to match message text.

### A correct comment beside code that ignores it

Their client's `scopes_client.py:253` says verbatim *"403 — one of three, and the message carries
which"* — and the module collapses all three into one error class anyway, which the layer above maps
to a 401. The knowledge was written down one layer above the code that discards it.

That is a sharper variant of the pattern than the one we had. Not "an answer that arrives and is
discarded by the caller's classification", but **an answer that arrives, is correctly documented by the
caller, and is discarded regardless.** A docstring is not evidence that the code branches on what it
describes.

Pair it with the other shape found the same day — a confident rationale that was exactly backwards,
surviving review because the reader checks code against comment and they agreed. A wrong comment beside
matching code, and a right comment beside code that ignores it, are the same failure: **the comment was
consulted instead of the behaviour.**

### Adding a subsystem must not make the application unbootable — and the rule is recursive

Mail settings were validated at config load, so `emerge-core` refused to START without them. A dev box,
a CI run, anything standing the API up to serve requests would fail over a subsystem it never uses.
Four settings could each do it alone: a `PLATFORM_SMTP_HOST` without a from-address, an unparseable
from-address, an unknown encryption mode, a port outside range.

`validateMail` is deleted rather than narrowed. Config reads the nine mail fields and validates none of
them; the checks moved to where the subsystem is CONSTRUCTED, and are exposed as `PlatformConfigured()`
and `PlatformFault()`.

**The worker then applied the same rule one level down, correctly, against my instruction.** I said a
sender with broken platform settings should refuse to start the loop. That is the identical mistake in
miniature: refusing to run the loop over a bad `PLATFORM_SMTP_*` value stops mail for every school that
has its OWN SMTP profile and never touches the fallback. So instead the fallback disables itself and
school-profile mail keeps flowing.

**The resulting ladder, which is the useful artefact:**

    missing hash version        a shrug      defaults to 1
    missing pepper              a refusal    nothing enqueues; mail stops, the process does not
    absent fallback             a warning    school-profile mail flows; schools without a profile get none
    malformed fallback          an error     names the setting; fallback off; school-profile mail flows
    none of the four            ever a reason to refuse to boot

Absent and malformed are deliberately distinguishable — `errors.Is` on two sentinels, with a test that
fails if they collapse — because one is a deployment CHOICE and the other is a MISTAKE, and an operator
needs to know which they are looking at.

A message needing an unavailable fallback fails RETRYABLE and **keeps its payload**, so fixing the
environment variable and restarting still delivers it rather than having discarded it. That is the
difference between a configuration error and data loss.

**And the pepper stays undefaulted.** A default pepper is not a pepper: every deployment sharing a
hardcoded secret makes the HMAC decorative, which defeats the reason the outbox uses HMAC rather than a
bare digest at all. Missing pepper stops enqueueing, which stops mail — and does not stop the sender
building, the loop running, or the API serving.

### The mail subsystem had no callers at all (2026-09-09)

Both halves of `internal/service/mail` — the `Submitter` that enqueues and the `Sender` that drains —
were referenced by nothing outside their own tests. The package built, vetted, and passed thirty-four
tests, and in a running process no mail would ever have been sent, because no process ever constructed
a sender. This is the third distinct shape of the same recurring defect in this repo: a consumer with
no producer, a producer with no consumer, and now **both, facing each other, with no wiring between
them and a green suite over the top.**

The general lesson, which is now worth stating as a rule: *a package's own tests cannot detect that the
package is unreachable.* Only a call-site search can, and it belongs in the definition of done for any
new subsystem, not in a later audit.

`cmd/api/main.go` now builds the sender and runs it against the signal context. `MAIL_SENDER_ENABLED`
(default true) exists so a process can opt out; `MAIL_SENDER_INTERVAL` defaults to 10s, which is the
cadence asked for, while the package constant stays at 5s so the package's own tests keep their timing.
Neither is validated at load, per the rule above that mail configuration never refuses to boot.

**Readiness reports mail but is not failed by it.** `GET /api/v1/health` grew a `mail` object carrying
`running`, `platform_fallback`, tick and delivery counts and open breaker count. It deliberately does
**not** move the endpoint's status to 503 when the sender is unhealthy: mail is not on the request path,
so a stalled sender that pulls the whole API out of a load balancer converts a delayed email into an
outage. The requirement is that a dead sender be *visible*, not that it be *fatal*.

The trap in that wiring, which a test now covers: a nil `*mail.Sender` stored in a non-nil interface is
not nil, so `WithMail` would have reported a running sender in a process that constructed none, and
called `Healthy` on nil to do it. The guard is a `reflect` nil-pointer check, and the mutation that
inverts it is the one that proves the test is load-bearing.

### ent enums are Go-side only; the database is not a backstop (2026-09-09)

Adding `no_reply_address` to the `failure_code` enum produced a migration containing no enum DDL. The
reason is worth recording, because it changes what a schema enum means here: `failure_code` is
`character varying` in Postgres with **no CHECK enumerating its values**. Verified against the live
control plane — the only CHECKs on `outbox_messages` are the three written by hand
(`payload_absent_when_terminal`, `payload_parts_together`, `failure_code_when_failed`).

So widening an ent enum is a code-only change needing no migration, and the cost of that convenience is
that the database will accept any string in the column. The Go validator is the entire enforcement.
Anything writing an enum column from a non-constant is one typo away from a persisted value no
`errors.Is` will ever match and no CHECK will ever reject.

### A partial index that could never converge (2026-09-09)

`outbox_messages` declared its `next_attempt_at` partial index as `status IN ('pending', 'retrying')`.
Postgres rewrites `IN` into `= ANY (ARRAY[...])` with a cast **per element**; Atlas renders the same
predicate with a cast on the **whole array**. The two are semantically identical and textually
different, so every diff saw a change, and every future control migration would have carried a spurious
`DROP INDEX` / `CREATE INDEX` of that index — forever, and under whatever name the migration happened to
be given, which is how the misleading file that led to this was produced.

Proved pre-existing by generating a diff with no schema change at all and getting byte-identical output.
Fixed by writing the predicate as `status = 'pending' OR status = 'retrying'`, which is exactly the form
Postgres stores; a follow-up diff reports "no changes" on both planes. The two sibling partial indexes
use a plain `=` and never drifted.

The general point: **a migration whose name does not match its contents is worse than no migration.**
Atlas names the file after the change you intended, not the change it computed, so a diff that comes back
carrying only unrelated churn is a signal to stop and find out why — not to apply it because the tool
produced it.

### Three states for the mail sender, not two (2026-09-09)

The health object first had one absence branch, so a sender switched off by `MAIL_SENDER_ENABLED=false`
and a sender that **failed to construct** produced a byte-identical report. That is the same
choice-versus-mistake collapse the SMTP fallback config deliberately avoids one layer down — absent and
malformed are kept distinguishable there precisely because one is a deployment decision and the other is
an error — and it had been reproduced one layer up.

There are now three states: `running`, `disabled`, `unavailable`. Each absence carries a reason naming
the consequence, which is the part an operator actually needs: *anything enqueued waits until it passes
`expires_at` and then fails as expired.* An empty outbox looks identical in all three cases; only the
stated reason separates "nobody sent any mail", "we turned the sender off" and "the sender is broken".

**An absence with no stated reason defaults to `unavailable`, not `disabled`** — an unexplained missing
sender is a fault until something claims otherwise. Defaulting the other way would let a construction
failure present itself as an intentional configuration, which is fail-open in the observability sense.

### The staleness window scales with the tick rate, and says so

`Healthy()` is "last tick within 3 × Interval". The alternative considered was a fixed threshold
independent of the configured interval, and it was rejected: a sender configured to tick hourly is not
unhealthy for having last ticked four minutes ago, and a fixed window would report it permanently
unhealthy. A health check that is always red is a health check nobody reads, which is a worse failure
than the one being guarded against.

The real objection to a multiple is not the coupling but that the window **stretches invisibly** when
someone raises the interval. The answer is to publish the window rather than to decouple it — and the
published number must be computed from the same accessor the check enforces, not from a second inline
`3 *`, or health can advertise one threshold while `Healthy` enforces another.

### The outbox only ever grows

Nothing deletes `sent` or `failed` rows. Aligning the scan to the partial indexes removed the acute cost
— the tick no longer reads the whole table every ten seconds — but the table still grows without bound,
and `recipient_hash` plus timestamps persist indefinitely for every message ever sent. That is a
retention question with a privacy edge and not merely a performance one, so it wants a stated policy
rather than a default: it concerns children's contact data, and the HMAC that protects it is only as
good as the decision about how long the rows survive. Open, and deliberately not resolved by whoever
happened to notice it.

**Built.** `StaleAfter()` lives on the sender and `Healthy()` computes its threshold from that same method,
so the published number and the enforced one cannot drift; health reports it as `stale_after`. Verified
by booting with `MAIL_SENDER_INTERVAL=45s` and reading back `stale_after: 2m15s`. The mutation that
publishes a hardcoded window instead of the sender's own is what makes that test load-bearing.

### A moving tree and a real defect are not mutually exclusive (2026-09-09)

**This section replaces an earlier version of itself that drew the wrong conclusion, and the correction is
the more useful lesson.**

What happened. Two separate incidents in one session began the same way: a package that passed in
isolation failed in the full suite. The first was genuinely a tree read mid-write — mtimes showed the
source rewritten between the failing run and the passing one, and nothing further was wrong.

The second was diagnosed the same way and **that diagnosis was wrong.** A bisection had produced real
signal: the failure survived `-p 1`, it appeared when `internal/service/mail` ran alongside
`internal/transport/http`, and not alongside `internal/transport/http/middleware`. Then the peer's test
file was found to have been edited during that window, and the whole bisection was discarded as computed
against a moving target.

It was not. **This paragraph has now been corrected twice, and the second correction is the honest one —
separating what was measured from what was inferred.**

*Measured, and not in dispute.* Under the old harness the eleven failures reproduced **three times in a
single invocation on a settled tree**, `mail`+`http` reproduced them 1/1, and `mail` alone passed. That
is real, reproducible structure. The bisection was not noise, and dismissing it was wrong.

*Inferred, and never proved.* The explanation offered for it — that the mail harness's long-lived
uncommitted transaction held FK locks on `schools` while `transport/http` committed
`School.Create`/`DeleteOneID` across `outbox_messages.school_id` — was a **hypothesis stated as a root
cause**. It is plausible and it motivated a change that plainly helped, but nobody demonstrated the
mechanism.

*What the numbers actually support.* The old harness failed **consistently**; the new one, over roughly
forty full-suite runs, has failed **once** — on a settled tree, naming three different tests — and
thirty further attempts could not reproduce it. So the harness change was a **real improvement and not a
complete fix**. Something rare remains and its cause is unknown. An independent single failure was seen
from the emerge-core side in the same period and attributed to a settle boundary; against a ~1-in-40
background rate, that attribution is no longer the best explanation either.

**This is recorded as open, not resolved.** The temptation at each stage was to close it: first with "the
tree was moving", then with the FK story. Both were explanations that fit and neither was verified. A
failure that has recurred since the fix does not get written down as fixed.

**The error to learn from is the second one, not the first.** A true fact — the tree was moving — was
used to dismiss evidence that was independently pointing at something real. That is more dangerous than
the original mistake, because it is self-sealing: every subsequent failure gets attributed to the same
harmless cause, and the explanation is always available and never falsifiable. A moving tree explains
*why a result might be unreliable*. It never explains *why a specific failure occurred*, and it is not
grounds to discard reproducible structure in the evidence.

The practical rules that survive:

- **Settle on every file that can affect the result**, sources, tests and fixtures alike — the check that
  failed watched `sender.go` while `sender_test.go` kept changing.
- **Do not let "the tree was moving" close an investigation.** Re-establish the finding on a quiet tree
  instead. If the structure reproduces, it was never noise.
- `SQLSTATE 25P02` masks its own cause: one statement fails and every later statement in the same
  transaction reports only "current transaction is aborted". A wall of identical masked errors is a
  reason to go find the first one, not to theorise about the pattern.
- **Test harnesses that differ from their neighbours are a defect surface of their own.** The mail
  harness was the only one in the repo using long-lived uncommitted transactions; the two packages it
  collided with had already settled on committed fixtures with `t.Cleanup` deletes. Being the odd one
  out was *a* bug — it made the suite fail consistently and its removal made the suite fail rarely —
  but it has not been shown to be the *only* one.
- **A masked error that is also timing-sensitive reads like shared-state corruption twice over.** Every
  attempt to observe this one moved it: raising the log level, a `println` in the driver, even appending
  to a slice under a mutex. The fixture now records the first failing statement on the error path only,
  with no I/O until cleanup — the cheapest observation found that does not perturb the thing observed.
- That harness also gave every worker goroutine a **single shared `sql.Tx`**, which `database/sql` does
  not support for concurrent use — a latent defect in the tests that the race detector would have found
  first, had it been runnable here.

### Heisenbugs are evidence about the mechanism, not an obstacle to it

Every attempt to observe this one made it disappear: raising the log level, adding a `println` to the
driver, even appending to a slice under a mutex. That is itself diagnostic — it says the window is
timing-dependent and narrow, which rules out whole classes of cause. The resolution came from noticing
the harness was the odd one out, not from catching the race in the act. When observation keeps dissolving
the failure, stop trying to observe it and start comparing the suspect against its neighbours.

### The unreachable capability, fourth instance — now a rule (2026-09-09)

`RetrievalEngine.update_document_metadata` exists, accepts `restricted_to` in
`UPDATABLE_METADATA_FIELDS`, and makes a re-stamp **metadata-only with no re-embedding**. It is called
by nothing: no route, no script, and `PATCH /documents/{id}` does not accept the field. Verified — the
only other mentions of the name in the engine are its own comments and docstrings.

The consequence is precisely the one the capability was built to prevent. It was sequenced *before*
stamping on the explicit argument that a wrong stamp must be correctable without a re-embed. Because no
caller was ever wired, **a section re-org today means re-ingesting every affected document** — the cost
the design paid to avoid.

That is now four instances of the same defect class in this project, ordered by how hard each was to
see rather than by when it was found:

1. **The mail subsystem — the sharpest of the four.** Both halves, the `Submitter` and the `Sender`,
   facing each other, thirty-four passing tests over the top, and no process anywhere constructing a
   sender. The engine's own instance had one half missing, **which at least leaves a hole a grep can
   find**. Mail had no hole at all: complete, tested, correct, and inert. That is the version where every
   instinct a careful engineer has says the work is done.
2. `update_document_metadata` — a capability built, tested, documented, argued for in the sequencing,
   and unreachable.
3. a consumer with no producer,
4. a producer with no consumer.

Three different people found these, in two repositories, in two languages. It is not a lapse; it is what
this shape of work produces by default, because **every local signal is green.** The unit tests pass —
they test the thing. The build passes — the code compiles and is imported. Review passes — the code is
correct. Nothing in the ordinary toolchain asks the one question that matters: *who calls this?*

**The rule, applied to any new capability regardless of repo or language: a call-site search is part of
the definition of done.** Not a later audit, not a review checklist item — the same step as running the
tests. "It has no caller yet, that comes next" is exactly what was said each of the four times.

The corollary for sequencing arguments specifically: **"we built X first so that Y would be cheap" is
not honoured until X is reachable.** An unreachable X leaves the expensive path as the only path, while
the plan records the cheap one as available. That gap is invisible until someone needs it under pressure
— a school re-organising sections, which is when the re-embed cost lands.

### A detector's first run should never happen during an incident

The reconciliation report for orphaned stamps — *which stamps name labels no current caller can hold* —
was going to be built after the fix that makes re-stamping cheap. It is being built before it instead,
and the argument that moved it is worth generalising.

Run today, the report returns "no orphans" **trivially**, because the corpus carries zero stamps. That
looks like an argument for deferring it and is the opposite. Its value begins at the first stamp written,
so having it in place before stamping is used in anger buys a **provably clean baseline**. Build it later
and its first-ever execution happens when somebody is already worried — at which point "no orphans" and
"the detector is broken" are indistinguishable, and nobody can tell which they are looking at.

This generalises to any detector for a silent, delayed failure: **commission it while the answer is
known and boring.** The first run is not the useful one; it is the one that establishes that the
instrument works.

**The same failure in mirror image, which is why it is worth naming.** Two people stopped short on this
one in opposite directions. One dismissed independent, reproducible evidence using an explanation that
could not be falsified — the tree was moving. The other accepted a mechanism as root cause because the
symptom improved after acting on it — the failure rate fell, so the hypothesis must have been right.
Neither is carelessness and both feel like diligence from the inside: the first is refusing to be misled
by noise, the second is trusting a result. They are the same error, which is treating a plausible
explanation as an established one, and the tell in both cases is the same — nobody demonstrated the
mechanism. A drop in a failure rate is evidence that a change helped. It is not evidence that you know
why.

### A skip marker nobody checks (2026-09-09)

`internal/testsupport/tenantdb.go:30` defines `SkipMarker = "TENANT-DB-TEST-SKIPPED"`, and four tests in
`internal/service/mail` emit it — three for missing configuration, and one, at `sender_test.go:1140`,
that skips **conditionally on shared database state**: `TestAnIdleTickIsStillAnnounced` cannot observe an
idle tick when the shared control plane has claimable mail, so it stands down when it does.

That conditional skip is correct in itself, and it explains why two people counted 42 and 43 tests on the
same package — a run legitimately reports either 43 PASS, or 42 PASS and 1 SKIP, depending on what is in
the table at that moment. Both counts were right, of different runs.

**The gap is that nothing checks the marker.** emerge-core has no `.github/workflows` at all, so no
process asserts the marker is absent from a run. The marker exists precisely so that a silent skip can be
detected, and the detector was never built — which makes it one more instance of the pattern recorded
above: a capability present, sensible, and unreachable.

The consequence is specific and worth stating. A test that stands down on shared state can stand down
**more often as the suite grows**, because more packages leave rows behind, and the run stays green while
coverage quietly falls. Nothing announces it. When CI is set up for this repo, the cheapest useful check
is that `TENANT-DB-TEST-SKIPPED` does not appear in the output — it is one grep, and without it the whole
skip-marker mechanism is decoration.

Noted also because the neighbouring convention was misattributed earlier in this session: the
"CI asserts the skip message is absent" practice belongs to **Survey-Forms**, not to this repo. It is a
good practice this repo has the marker for and has not adopted.

### A null result from a test that could not have detected the thing (2026-09-09)

Running two `go test` invocations of `internal/service/mail` concurrently breaks the package every time
and produced **zero** instances of the `outbox_message not found` failure under investigation. The
pre-committed reading was that this killed the leading hypothesis — that a `TestMain` fixture sweep in one
process was deleting another's live rows.

It did not, and the reason is worth keeping: **the experiment could not have detected the thing whether or
not it was true.** The sweep fires at two moments per process; the competing mechanism, claim stealing,
runs continuously throughout every test. So the sweep's symptom should be orders of magnitude rarer, and
its absence from six runs is exactly what you would observe either way.

**Pre-committing to a conclusion does not rescue an experiment that cannot distinguish the outcomes.**
Setting the bar before seeing the result is what normally makes a pre-commitment trustworthy, and it did
nothing here, because the flaw was in the power of the test rather than in the honesty of the reasoning.
The corollary belongs next to the one recorded above about failure rates: *a drop in a failure rate is
evidence that a change helped, not that you know why* — and now also, **a null result from an instrument
that could not have registered the effect is not evidence of absence.**

### The defect was in the harness's assumption, not in the thing it tested

The same experiment surfaced cross-process claim stealing: two test processes each run a `Sender` against
one control plane, and each claims any claimable row, including the other's fixtures.

The instinct is to read that as a sender defect. It is the opposite. The stated constraint was that two
senders must never take the same row, and they never did — the conditional claim held, one process won
each row, the lease worked, nothing was double-sent. **Two independent senders draining one shared queue
is the design.** What is wrong is the tests' unstated assumption that a test process owns the queue, which
is invisible because it is true whenever only one process runs.

This decides where a fix may go. **Nothing in `sender.go` should change.** Narrowing `scan()` so the tests
stop interfering would put test isolation into the product — a change that makes the suite green by making
the system worse, and one that would look like a bug fix in the diff. When a test fails because of an
assumption the test made, the assumption is what moves.

### The mail test harness takes an advisory lock so that a second run waits

`TestMain` in `internal/service/mail/sender_test.go` holds a Postgres session-level advisory lock on key
`0x4d41494c54455354` (`5566811206586815316`, the ASCII bytes of `MAILTEST`) for the whole package run. A
second concurrent `go test` of this package blocks on `pg_advisory_lock` until the first finishes, rather
than interleaving with it. Nothing else in the system takes an advisory lock; this key is reserved for the
mail harness and should not be reused.

This covers both ways two runs interfered, in one place, without touching the product. Claim stealing is
one: each process's `Sender` claimed the other's rows, which is `scan()` behaving exactly as specified and
therefore may not be narrowed. The sweep is the other: `sweepFixtures` deletes every school coded `MAILT-`,
so a second process's opening sweep would delete the first's fixtures mid-run. Serialising the runs removes
both at once, because neither process is running while the other holds the lock.

Three details decide whether this actually works.

**The lock lives on one pinned connection.** Advisory locks are scoped to a session, so a pooled handle is
useless — a later statement can land on a different connection and the lock's lifetime becomes undefined.
The harness opens its own `*sql.DB` and pins a single `*sql.Conn` with `db.Conn`, takes the lock on it,
and holds that one connection across `m.Run()`.

**The lock is taken before the first sweep and released after the last.** `TestMain` now delegates to a
function so that `defer` runs at all: `os.Exit` skips deferred calls, so the exit code is computed inside
the wrapper and the process exits only after the deferred release has run. The release is deferred first
and the closing sweep second, which orders them correctly on the way out — sweep, then unlock.

**A panic does not unwind `TestMain`, and does not have to.** An unrecovered panic inside a test crashes
the process from the test's own goroutine; no deferred function in `TestMain` runs. That is safe here for a
reason outside Go: the lock is tied to the session, so when the process dies the connection closes and
Postgres drops the lock. This was verified rather than assumed — a deliberate panic left no advisory lock
behind. Fixtures from such a run are left in the control plane, and the next run's opening sweep, now under
the lock, removes them.

The blocking acquire is deliberate, in preference to `pg_try_advisory_lock`. A try-lock has to choose
between failing the second run, which turns a scheduling accident into a red suite, and proceeding without
the lock, which is the behaviour being fixed. If the control plane is unreachable or unconfigured, the lock
is skipped silently and the package skips as it always did; no database is not turned into a failure.

### The five fieldless areas are not an omission, and an empty field list is the fail-open half

A re-examination of `areaColumns` started from the reading that its 15 entries against 20 areas is a
gap: `schools`, `academic_sessions`, `reference`, `sections` and `subject_offerings` have no entry, and
`fieldsFor` resolves a missing key through a nil map lookup into an empty slice, so the shortfall is
silent. Four of the five are mechanically expressible — `entsection.Columns`, `entsession.Columns`,
`entoffering.Columns` and, for the control-plane area, `controlschool.Columns`, which is an ordinary
`[]string` and needs no special handling. Wiring all four in produces 9, 14 and 9 fields respectively.
They were still not wired in, and the reason is what the catalogue's column fields are *for*.

A column field in this catalogue is the key a CAS author names in a field policy. The enforcement side
is `rejectUnauthorizedFields(w, r, decision, entX.Columns, sent)` in the handler. No handler for any of
the five calls it: `sections.go`, `academic.go`, `subjects.go` and `schools.go` contain no field
enforcement at all, and those routes are gated only at the route level by `s.can(entity)`. Advertising
`sections.capacity` would let an author write `{mode: include, keys: [name, code]}` on
`core.sections.write` and believe `capacity` is now unwritable. It would not be. A control that does
nothing is worse than an absent one, so the pins stay.

`reference` is different in kind and cannot be expressed even if that changed: one area covers branches,
grade levels, houses, subjects and subject groups, and no single `Columns` slice describes five tables.

The direction of the risk is worth stating precisely, because it is the reverse of the intuition. An
absent field policy is not a denial — `FieldPolicy.Permits` returns true for a nil policy and for
`FieldModeAll`. So an area whose columns are missing from the catalogue leads an author to write no
field policy for it, which grants *every* field. That is why a missing entry for an area that **does**
field-gate is fail-open rather than merely under-advertised, and it is why the omission has to fail at
test time rather than be caught by review.

The pins therefore carry an expiry condition, in the reason string next to each: the moment a handler
for one of these areas starts field-gating against that table's `Columns`, the pin becomes a live
fail-open and must be replaced by a real `areaColumns` entry. That transition is not mechanically
enforced — a test in `internal/authorization/catalog` that parses `internal/transport/http` for
`rejectUnauthorizedFields` call sites would couple this package to one under concurrent edit, and the
alias-to-area mapping is not mechanical. It is a documented trigger, not a guard.

### Why `fieldsFor` keeps returning an empty slice for an unknown area

The alternative considered was making `fieldsFor` refuse — panic, or return an error — rather than hand
back an empty slice for an area it does not know. It stays as it is, for three reasons in descending
order of weight.

The empty slice is the *correct* answer for the pinned areas, not a degraded one. (**Corrected
2026-09-23: two areas are pinned, `reference` and `schools`, not five.** `sections`,
`academic_sessions` and `subject_offerings` gained real `areaColumns` entries on 2026-09-14 when field
enforcement was added to them. The *five* is a different fact that got conflated with this one: five
areas have no **breadth key** — `schools`, `academic_sessions`, `reference`, `sections`,
`subject_offerings` — which remains true and is unrelated to whether their fields can be named.) Refusing would
require `fieldsFor` to distinguish "pinned fieldless" from "forgotten", which means moving the pin list
out of the test and into the production map — converting a test fixture that costs nothing at runtime
into a second registry that can itself drift.

`Build` runs to assemble a catalogue served to CAS. A panic there converts a metadata gap into a failed
request, and the gap it would be reacting to is exactly the one the test now catches before the binary
is built. A loud test and a quiet runtime is the right split: the test is where an omission is cheap to
fix and where the person who caused it is still looking.

And `catalog.Build` had no caller when this was written. **It has one as of 2026-09-23:**
`GET /api/v1/capabilities` serves it, narrowed to what the calling user actually holds. The paragraph
below stands as the reasoning for why it stayed unserved for so long, and the sweep it belongs to. Hardening its
runtime behaviour would be hardening a path nothing walks, while the drift it guards against happens at
edit time regardless. That absence is itself a finding and belongs with the unreachable-capability sweep
above: the catalogue is built, tested and unserved.

### What the guard is, and the evidence it fires

`catalog_test.go` derives the area set from `authorization.AllEntities` at runtime and asserts each area
either has an `areaColumns` entry or is pinned in `fieldlessAreas` with a reason. Runtime derivation,
not the `go/ast` walk that `count_test.go` uses: that test parses source because Go cannot enumerate
declared constants at runtime, whereas both sides of this comparison — `AllEntities` and `areaColumns` —
are ordinary package-level values the test can read directly. Same guard shape, and an AST walk here
would be strictly weaker, since it could not resolve `entperson.Columns` to its contents.

Four checks, covering both directions of drift:

- an area with no entry and no pin fails, naming the area and both remedies
- an area that has gained an entry while still pinned fails, telling the author to drop the pin
- a pin for an area no entity declares fails, and an `areaColumns` key no entity declares fails
- an entry that resolves to an empty slice fails, since an entry yielding nothing is the same silence
  as no entry

Both failure paths were watched, not assumed. Renaming the `persons` key to `personsX` produced
`area "persons" resolves to no columns and is not pinned` together with `area "personsX" has an
areaColumns entry but no entity declares it`; deleting the `sections` pin produced
`area "sections" resolves to no columns and is not pinned`. Notably the pre-existing
`TestNonDeleteEntitiesOfKnownAreasCarryColumns` stayed green through the first mutation — it skips
areas absent from `areaColumns`, which is precisely the case that needed covering.

### Create and update disagreed about whether field policy applies (2026-09-14)

`createEnrollment` and `createSubjectEnrollment` decoded their bodies with `response.Decode` and never
consulted a field policy, while `updateEnrollment` and `updateSubjectEnrollment` — same entity, same
`core.*.write` grant, same `Columns` list — called `rejectUnauthorizedFields` on every key the caller
sent. The result was not a missing check in the abstract: it was two handlers on the same table
answering the same question differently. A caller holding a narrowed write grant, say fields limited to
`roll_number`, was refused when it tried to PATCH `enrollment_number` onto an existing row and accepted
when it POSTed the identical value onto a new one. Whatever the field policy was protecting, create
handed it over.

Both creates now do exactly what their update siblings do, in the same order teacher and student
assignment creates already used: `response.DecodeFields` for the key list, `scopeFor(write, write_all)`
for the decision, then `rejectUnauthorizedFields` against `entenrollment.Columns` /
`entsubjenroll.Columns` — before any payload validation, so an unauthorized field is a 403 rather than
a 400 about a missing `student_id`. No second mechanism was introduced; the difference between create
and update on these two entities is now only the fields each one sets.

The deny path is the one `rejectUnauthorizedFields` has always had. `FieldPolicy.Denied` refuses any
requested key that is not in `Columns` as well as any the policy does not permit, so a payload naming a
column that does not exist is refused rather than ignored. If `scopeFor` fails — no subject on the
context, or the tenant database unreachable — the handler returns through `writeTenancyErr` and never
reaches `Save`. There is no branch in which an unresolved policy falls through to a write.

`access.Resolve` is now on the create path where it was not before. It tolerates a subject with no
`persons` row, returning a viewer with nothing set rather than an error, so the additional call cannot
refuse a caller the route already admitted.

### The guardian link has no policy to consult, and the field that matters is the one nobody governs

`linkGuardianToStudent` is not the same problem and could not be fixed the same way. `student_guardians`
has a generated ent entity and a `Columns` list, but no area in `authorization/catalog` and no CAS
entity keys, so no field policy exists for it. Borrowing the guardian entity's policy would apply one
entity's field rules to a different entity's rows, which is the mistake finding 6 was about. It was not
done.

What the endpoint enforces instead is a fixed writable set, `linkFields`, fixed by construction rather
than by grant, checked with the existing `rejectFields` so the refusal shape and the observability line
match every other write. `guardian_id` is excluded because it comes from the request path. `id`,
`created_at` and `updated_at` are excluded as server-owned. `status` is excluded because a link is born
active: the column defaults to `active`, no endpoint exists to change it afterwards, and the only thing
the body could previously express was a link created already dead.

That last exclusion is the only behaviour change. It is also the only one with teeth, because `status`
on this row is load-bearing for access control — `access.StudentsOfGuardian` narrows to
`student_guardians.status = active`, so this column decides which students a guardian may read. With
every column either path-owned, server-owned, server-determined or in `linkFields`, and
`DisallowUnknownFields` rejecting anything outside `linkPayload`, the set a caller can reach is closed.

`Status` stays on `linkPayload` deliberately. Removing it would make `{"status":"inactive"}` a generic
400 from the decoder; leaving it makes the refusal a 403 that names the field, which is what a caller
needs in order to know the difference between a typo and a rule.

BLOCKED, and it should be recorded as blocked rather than as solved: the fixed set cannot distinguish
one caller from another. `can_view_academic` and `can_view_finance` are still settable by anyone
holding `core.guardians.write`, and today nothing in the service reads either flag — they are stored,
named as capabilities, and consulted nowhere. Governing them, or letting some callers set `status` and
not others, needs a `student_guardians` catalog area and CAS entity keys, and registering keys is a
production CAS change. `TestEveryLinkColumnIsAccountedFor` pins the current disposition of every column
so a new one cannot become writable by being added.

### What the advisory lock does not cover

The lock serialises invocations of the mail package against each other, and nothing more. Two residual
exposures are worth naming, because both are the same class of unstated assumption as the one that was
fixed: that nothing else is working the queue.

**Other test packages are not a hazard, and were checked rather than assumed.** `internal/service/mail` is
the only package in the repository with a `TestMain`, so it is the only one with a prefix sweep; nothing
else can delete a fixture out from under a running test. The two other packages that create control-plane
schools — `internal/transport/http/middleware/tenant_test.go` (`QA-TEN-`) and
`internal/transport/http/schools_test.go` (`TEST-PROFILE-`) — use per-test UUID suffixes and their own
cleanup, and neither prefix can be caught by `CodeHasPrefix("MAILT-")`. More to the point, no package
outside `internal/service/mail` constructs a `Submitter` or a `Sender` or writes an `outbox_messages` row,
so no other test can hold a row that mail's sender would claim. The packages are free to run concurrently.

**A locally running API server is a hazard, and the lock cannot stop it.** `cmd/api` starts a real `Sender`
against the control plane, gated by `MAIL_SENDER_ENABLED`, which defaults to *true* and is not set in the
repository `.env`. A developer running `cmd/api` against the same control plane as the tests therefore has
a second sender scanning every ten seconds, and it will claim the tests' fixtures — reproducing the claim
stealing exactly, and doing so even against a single test process, where the shared-queue explanation is
least likely to be reached for. This is not something the harness can lock out: the server is not going to
wait on a test's advisory lock, and it should not. It is a thing to know when a mail test fails alone and
inexplicably. It does not explain a missing row, though: the sender never deletes, so only the sweep and
the fixtures' own cleanup can remove one.

### A locally-run `cmd/api` competes with the mail tests (2026-09-14)

`cmd/api` starts a real `Sender` gated by `MAIL_SENDER_ENABLED`, which **defaults to true**
(`config.go:88`) and is **not set in the repository `.env`**. A developer running the API against
`emerge_control` therefore has a second sender scanning every ten seconds that will claim the test
fixtures' rows.

Two things make this worth recording rather than filing as obvious. First, it reproduces the
claim-stealing symptom family — `status = sending, want sent`, `sender_kind = <nil>` — **even against a
single test process**, which is precisely the case where nobody would reach for a shared-queue
explanation, because there is visibly only one `go test` running. Second, the advisory lock added to
`TestMain` cannot close it and should not try: a server is not going to wait on a test's lock.

**It is a candidate explanation for part of the historical ~1-in-40 failure, and explicitly not for all
of it.** The earlier unexplained one-off named `ARetryableRejection`, `ALapsedLease` and
`ThePlatformFallback` — three tests all asserting on post-delivery row state, which is the claim-stealing
shape. The separate `outbox_message not found` sighting is **not** explained by it, because the sender
never deletes a row: only the `MAILT-` sweep and a fixture's own cleanup can remove one. That asymmetry
is evidence for the two-phenomena reading rather than against it, and it remains a hypothesis.

Verified not to have contaminated any measurement in this session: the `api` container was in a restart
loop throughout (`config: CAS_BASE_URL is required`), so it never constructed a sender, and
`pg_stat_activity` showed no second session during the timing runs. It has been stopped regardless.

**The operational rule: stop `cmd/api` before running the mail tests against the same control plane**, or
run it with `MAIL_SENDER_ENABLED=false`. The default is correct for a deployment and wrong for a
developer box that shares one control database between the server and the suite.

## The asset reaper (2026-09-14)

### Nothing deleted the bytes, and nothing swept the rows

`internal/infrastructure/blob` exposed `PresignPut`, `PresignGet` and `Head`, and nothing else. There was no
delete capability of any kind, so the S3 object behind an asset outlived every path that could retire the row.
The library's `deleteAsset` handler sets `status = deleted` and returns; the object stays in the bucket forever.
Separately, an asset row is created as `pending` when an upload is presigned and only becomes `ready` when the
client comes back to confirm. A client that never comes back leaves the row at `pending` permanently — the
status enum is exactly `pending|ready|deleted` and no loop ever looked at it. Both leaks grow without bound and
neither shows up as an error anywhere.

`Client.Delete` closes the first half. `internal/service/assets` and `cmd/assetreap` close the second.

### Delete is idempotent, and that had to be checked rather than assumed

S3 answers `DeleteObject` for a key that does not exist with `204 No Content`: the operation is defined to be
idempotent and the SDK surfaces no error. Not every S3-compatible store agrees. MinIO and several gateways
answer `404`, and the SDK turns that into an `api error NotFound`, which would make a second reap of the same
key a hard failure and would make the whole command non-restartable. `Delete` therefore routes the error
through the same `isNotFound` funnel `Head` uses and reads "already gone" as success.

This is not speculative defence. Deleting the `isNotFound` branch and re-running the package's tests produces:

```
--- FAIL: TestDeleteReadsAMissingObjectAsDoneOverTheWire (0.02s)
    a 404 answer must read as deleted, not as a failure: blob: delete "...": operation error S3: DeleteObject,
    https response error StatusCode: 404, api error NotFound: Not Found
```

so the branch is live against a store that answers `404`, and the test covers all three answers a store
plausibly gives — `204`, `200` and `404`.

`Delete` sits behind the same `guard` funnel as every other exported method, for the same reason: an error
whose text carries signature material must never leave the package. A key like
`schools/hp/X-Amz-Signature=deadbeef.pdf` is attacker-influenced and lands inside the SDK's error string, so a
failed delete on that key is withheld entirely rather than returned.

### Why the reaper never hard-deletes a row

`Asset.Edges` annotates `content_items` with `entsql.OnDelete(entsql.Restrict)`, so Postgres refuses to delete
an asset row while a content item references it. That FK is the obvious reason not to hard-delete, but it is
not the interesting one — it only prevents the deletions that would corrupt the graph, and says nothing about
the rest.

The reaper does not hard-delete any row, referenced or not. The row is the only record that the asset existed:
who uploaded it, when, what digest, what size. Once the bytes are gone that record is all there is, and it costs
a few hundred bytes to keep. Removing the object while leaving the row is a defensible trade; removing the row
as well buys nothing and destroys the audit trail. So:

- a `deleted` row keeps its row and loses its object,
- a `pending` row loses its object, if it has one, and is moved to `deleted` — a status transition, not a
  deletion, and the same transition the delete handler already performs.

A `pending` row must be moved out of `pending`, or the next sweep scans it again forever. The transition is
written as `UpdateOneID(id).Where(StatusEQ(pending))`, so a row that became `ready` between the scan and the
write fails the update rather than clobbering a live asset; the failure is counted and reported.

### The still-referenced check is separate from the FK, and does more

The FK only blocks row deletion. It does nothing about the object. A content item can point at an asset whose
status is `deleted` — the soft delete is a status change, and no cascade runs — so a reaper that only respected
the FK would happily delete the bytes out from under a live content item and leave a row pointing at nothing.
The scan therefore asks, in a second query over the candidate ids, which of them have content items, and the
reaper keeps every one of those untouched: no object removal, no status change, reported as kept with the
reason.

### The defaults, and why they are these

**A dry run is the default.** `-destroy` is the only thing that makes the command write. This is not a
convenience: the command permanently destroys bytes that are not recoverable from anywhere else in the system,
and the cost of a wrong invocation is unbounded while the cost of an extra flag is one word. `Options.Destroy`
is a bool, so the zero value is the safe one, and a reaper built from `Options{}` is inert.

**The age threshold defaults to 24 hours, with a floor of 1 hour.** The pending window is not a timeout on the
HTTP request; it is a timeout on a human. The flow is: the client asks for a presigned URL, a row appears as
`pending`, and the client uploads and then confirms. Anything in between — a large file on a slow connection, a
tab left open over lunch, a phone that lost signal in a corridor and reconnected — leaves a legitimate row
sitting at `pending`. A threshold measured in minutes reaps live uploads. Twenty-four hours is long enough that
anything still `pending` is genuinely abandoned, and short enough that the bucket does not accumulate a year of
debris. The 1 hour floor exists because the flag is the one input that turns this from a cleanup into a data
loss event, and no plausible operational need justifies a shorter one; `-age 30m` is refused before the command
opens a single tenant connection.

**The same threshold applies to soft-deleted rows, measured from `updated_at`.** A `deleted` row could
defensibly be reaped immediately, since deletion was an explicit act. It is not. The delay is a grace period: a
mistaken delete can be undone by flipping the status back for as long as the bytes survive, and after the reaper
runs it cannot. Measuring from `updated_at` rather than `created_at` means the clock starts when the row was
deleted, not when the file was uploaded — otherwise every asset older than a day would be reaped the instant
someone deleted it, which is exactly the grace period the threshold is supposed to provide.

The reaper re-checks the age of every row it is handed, rather than trusting that the scan's `WHERE` clause
filtered correctly. The SQL predicate and the in-memory guard are two independent statements of the same rule,
and the tests exercise the second one by handing the reaper rows the first would never have returned.

### Where the reaper gets its tenants

`cmd/assetreap` resolves tenants the way `cmd/migrate` does, and for the same reason: this is a
database-per-tenant system, there is no `school_id` column to filter on, and the list of schools lives in the
control plane. It reads every school, asks the registry for the postgres profile and then the S3 profile, and
skips the school with a printed reason if either is missing. Two registered schools have no active postgres
profile and are already skipped by `migrate`; they are skipped here identically rather than treated as an error,
because a school in the registry without a provisioned database is a normal intermediate state, not a fault.

A school with a database but no bucket is skipped too, and the two skips print different text. They used to
print the same text, because `tenancy.ErrNoProfile` formats as "school has no active postgres profile" whichever
profile type it was asked for — an error string that is wrong for three of the four profile types. That is worth
knowing when reading any skip line from any command that reports this error verbatim.

### What is not verified locally

No school in the local control plane has an active S3 profile, so the command cannot complete a sweep on this
machine: every school is skipped for want of a bucket, which is itself the correct behaviour and is what the
command prints. The reaper's own path — the real ent query against a real tenant database, the age and status
predicates, the reference lookup, the dry run and the destructive run — is covered by tests in
`internal/service/assets/live_test.go`, which take their tenant from `testsupport.TenantTx` like every other
database-backed test in the repository. That means one skip site rather than two, carrying `SkipMarker` and
honouring `TEST_REQUIRE_TENANT_DB`, so a silently skipped run is caught by both halves of the CI guard; it also
means the fixtures live inside a transaction that is rolled back, so nothing is deleted and nothing leaks.

These tests used to gate on their own `ASSETREAP_LIVE_SCHOOL` variable and clean up by deleting the rows they
planted, and they had a second skip for "this tenant has no person to own a content item" — which meant the
reference test was quiet unless `cmd/seeddemo` had happened to create people, and quiet in a way neither guard
could see. Both are gone: the school comes from `TEST_SCHOOL_CODE` like everywhere else, and the test plants its
own owner rather than borrowing one. The lesson is the general one — a bespoke skip gate is a gate nobody else
is checking, and the fix is to join the existing one rather than to remember to set a variable.

## Continuous integration

### `.github/workflows/ci.yml`

**Replaced by `Jenkinsfile` on 2026-10-15.** The GitHub Actions workflow was removed once the
shared `emergeDeploy` pipeline reproduced every step of it: the static job (build, vet, gofmt,
`scripts/nocomments.py`), the two-database test job with the seed-twice sequence, the per-run master
key, `-v` teed to a log with the `TENANT-DB-TEST-SKIPPED` grep, the skip listing and the `-race`
pass with its own marker check. `nocomments.py` moved to `scripts/`. Everything below describes why
the workflow was shaped the way it was, and the Jenkinsfile keeps that shape for the same reasons.

The workflow had also been red on every run since 2026-10-01, on exactly one test:
`TestWardOfferingsVanishWhenAcademicAccessIsWithdrawn` picked the first active guardian in the
tenant and linked it to the first enrolled pupil, and `seeddemo` had already linked that pair, so the
insert tripped `studentguardian_student_id_guardian_id`. The test now plants its own guardian inside
the rollback transaction and checks that the ward's offering is among those returned rather than
that it is the only one, since a pupil carries several offerings.


Until this existed there was no CI at all, and one consequence was specific rather than general.
`internal/testsupport/tenantdb.go` exports `SkipMarker = "TENANT-DB-TEST-SKIPPED"` so that a
database-backed test which quietly declined to run could be spotted. Nothing ever looked for it.
That marker had been sitting in the source unread, which is the same failure as an unreachable
capability: the mechanism was built and the call site never was.

**The hole is real and was reproduced before the check was written.** With no tenant database
configured, the placement and tenancy tests skip, the package reports `PASS`, and `go test` exits 0.
A suite that proves nothing is indistinguishable, from the outside, from a suite that proves
everything. The whole point of those tests is that the placement predicate is a correlated `EXISTS`
which the stub driver refuses to evaluate — only a live Postgres can settle whether scoping filters
rows — so when they skip, the thing most worth checking is exactly the thing left unchecked.

**`-v` is load-bearing.** Without it a skip's message never reaches stdout: `go test ./...` prints
`ok` and nothing else. A grep for the marker over quiet output would find nothing and pass, on a run
where every database test had skipped. The workflow therefore runs `go test -v` and tees to a file,
and the marker check reads the file. The check also fails if the file is absent, so that a test step
which died early cannot be mistaken for a clean one.

**Both `TEST_REQUIRE_TENANT_DB=1` and the grep, because they catch different things.** The
environment variable turns the skip into a `t.Fatal` inside `testsupport`, which is the earlier and
clearer failure; the grep catches the case where a future edit drops the variable from this file, and
reports every offending test at once instead of the first. Neither subsumes the other, and both are
nearly free.

**Only the grep misses skips; the require flag catches every one.** The two checks are not equivalent and
it is worth being exact about which covers what, because an earlier version of this paragraph was wrong
in both directions at once.

`viewerWithoutFixture` in `internal/data/access/viewer_test.go` skips when the tenant database has no
sections or teachers, and its message carries no marker — so the **grep** misses it and an empty but
reachable database would satisfy that check while testing very little. The **require flag does catch
it**, because the test switches on `testsupport.RequireEnv` and calls `t.Fatal` before ever reaching
`t.Skip`. The author wired that deliberately. CI still seeds a demo year rather than settling for
migrated tables, which is belt to that braces.

`internal/testsupport/tenantdb.go` only *looks* unmarked to a line-local grep: it is the marker site, and
its message is built with `SkipMarker` eleven lines above the `t.Skip` call.

`internal/service/assets/live_test.go` **was** a genuine gap — it gated on `ASSETREAP_LIVE_SCHOOL`, its
own variable, which neither check reached, and CI worked around it by setting that variable. That gap is
**closed (2026-09-14)**, and closed at the cause: the file now takes its tenant from
`testsupport.TenantTx` like every other database-backed test, so both of its skip sites collapse into
the one `testsupport` already owns, carrying `SkipMarker` and honouring `RequireEnv` for free. Its
second skip — "this tenant has no person to own a content item" — was **removed** rather than marked,
because the test now plants its own owner and no longer depends on `cmd/seeddemo` having created
people. The dead workflow variable has been deleted, and the suite was re-run with it explicitly unset:
1415 pass, **zero skips**, which is the proof the gate is gone rather than merely fed.

**Marking a skip leaves a test able to go quiet; removing the reason to skip means it cannot.** Where
both are available the second is the better fix, and it was available here. A marked skip still does not
run — it only announces that it did not.

**As of this change no skip in the repository escapes both checks.** A step also lists every remaining
`--- SKIP` without failing the build, so the next variable of this kind is visible in a green run rather
than waiting to be noticed.

**Seed runs twice, and the first failure is expected.** `migrate apply -plane tenant` discovers
tenant databases by reading `school_profiles`, so a school must be registered before its database can
be migrated. But `seed` also writes the first administrator, which needs tables that migration has
not yet created. The first pass stores the school and its encrypted credentials and then stops on
`relation "persons" does not exist`; the half that matters is already committed, and because `seed`
looks every row up before making it, the second pass after the tenant migration simply finishes.
The alternative — a flag to migrate a tenant by DSN — would be a change to `cmd/migrate` rather than
to CI, so it is noted here and not taken.

**CI does not set `TEST_TENANT_DATABASE_URL`, deliberately.** Setting it hands the tests the tenant
DSN and the control plane is never consulted. Leaving it unset makes them resolve the school by code
and decrypt its stored credentials, which is what the service itself does, so the run also proves the
two planes agree about where a school's data lives. The seed commands still need a DSN in hand, under
a name `testsupport` does not read.

**The master key is generated per run.** `SECRETS_MASTER_KEY` has no default anywhere, on purpose,
and a committed CI key would be a default in all but name. `openssl rand -hex 32` into `$GITHUB_ENV`
gives every run its own; nothing encrypted under it outlives the job. No CAS credentials are needed
at all — `seed` accepts an existing CAS user id without contacting CAS, `seeddemo` without a token
gives each person a random `cas_user_id`, and `AUTH_DISABLED=true` says outright that this run has no
identity behind it rather than arriving there by forgetting something.

### `.github/workflows/nocomments.py`

The house rule that Go source carries no comments was enforced by people remembering it. A grep for
`//` cannot enforce it: it matches the `//` in every `https://` URL, and any `//` or `/*` inside a
string literal. This walks each file the way Go's scanner does, stepping over interpreted strings,
raw strings and rune literals, and reports only real comments with their line numbers. Toolchain
directives are exempt because they are not commentary — the compiler reads them. Files carrying the
canonical `// Code generated ... DO NOT EDIT.` line are skipped: ent writes those and they are never
hand-edited. Run against the tree it reported nothing across the hand-written files, so the rule as
practised and the rule as checked agree.

### The assets list, the order of the upload grant, and how a board is spelt

Three changes to the library transport, made in one pass because each was a hole the existing tests could
not see.

**`GET /library/assets` exists now.** Until this pass the only read of an asset was
`GET /library/assets/{id}`, so an asset was unreachable unless the caller already held its UUID. The
router test recorded the gap without naming it: it asserted that `GET /api/v1/library/assets` answered
405, which is what a path that only accepts POST looks like from the outside. That expectation is gone
and the route is in the table instead.

The list is mounted under `core.library.read` and is scoped by the same predicate as the single-asset
read. `scopedAsset` now delegates to `scopedAssets`, which takes the query rather than building it, so
there is one expression of "which assets may this viewer see" and a list cannot drift away from the get
that guards the same rows. The test asserts exactly that: it lifts the scoping clause out of both
statements with the placeholder numbers erased and requires the two to be equal, rather than checking
that the list is narrowed somehow. Mutating the handler to query `client.Asset.Query()` directly makes it
fail on the missing `EXISTS` over `content_items`.

It filters on `status`, `mime_type` and `uploaded_by`, orders by `created_at` descending, and pages
through the shared `filter.Params` helper like every other list on this surface.

**The upload grant is signed before the row is written.** `createAsset` used to save the asset row and
then ask the object store for a presigned PUT. A presign failure therefore left a `pending` row with no
object behind it and no way to get one: `storage_key` is minted from the row's own id and there is no
route that re-issues an upload link, so the row was stranded permanently. The order is now mint the id,
sign the key, save the row; nothing is written if the grant cannot be issued.

That order was chosen over "delete the row when the presign fails" because it keeps `storage_key` minted
once and immutable, and needs no compensating write that could itself fail. It moves one failure the
other way: if `Save` fails after a successful presign, a signed URL exists for a key no row references.
That is an unreferenced object rather than a visible half-made asset, and an unreferenced object is what
`cmd/assetreap` sweeps.

One piece of shipped text changed with it. The `asset_zero_length` refusal said "the asset row exists but
no upload link can be issued for it", which described the old order; it now says no asset was recorded.
The status and the code are unchanged, so a client branching on the code is unaffected.

**A board is trimmed and collapsed on write, and matched case-insensitively on read.** `board` is a plain
`field.String` on both `question_papers` and `curricula`, was filtered by exact match, and was never
normalised — so `"CBSE"`, `"cbse"` and `" CBSE "` were three distinct boards and a filter silently missed
rows. Whitespace is now normalised on write on every path that stores a board: leading and trailing
removed, internal runs collapsed to a single space, by `normalizedBoard`, called from the paper decode and
from both curriculum write paths. `checkPaperFields` also length-checks the board now, which it did not
do before, against the same 64-rune limit the curriculum path uses and the schema enforces; the constant
is `boardRunes` rather than `curriculumBoardRunes` because it is now the limit for both.

Case is deliberately NOT folded. Upper-casing is lossy for a board whose real name is mixed case, and the
stored value is what the API hands back and what a school sees printed, so flattening the capitalisation
to make a filter work pays in display fidelity for what is a query problem. The filter pays instead:
`board` is matched with `BoardEqualFold`, which ent renders as `ILIKE` on postgres. The three spellings
above therefore land as two stored values, `"CBSE"` and `"cbse"`, and one filter finds all three.

Two consequences worth knowing before touching this again. The filter argument reaches the driver
lower-cased, because that is what ent's `EqualFold` does, so a test asserting the query "carries CBSE"
will not see it — one existing test had to be corrected for exactly that. And `ILIKE` on an unindexed
column is a sequential comparison: `board` carries no index today so nothing was lost, but an index added
for this filter would have to be an expression index on the folded value to be used at all.

Normalising in the transport layer rather than in an ent hook was deliberate, and it means rows written
before this pass keep whatever spelling they were given; nothing backfills them. The case-insensitive
filter is what makes that survivable — an old `"cbse"` row is found by a search for `"CBSE"` — but an old
`" CBSE "` row is still not, because its stored whitespace is real data. If those rows matter, the
backfill is a one-column update, not a migration.

### Field enforcement reaches the three structure areas, and the catalogue stops lying about them

`core.sections.*`, `core.academic_sessions.*` and `core.subject_offerings.*` were gated only at the
route level by `s.can(entity)`. A CAS author could grant the entity or withhold it, and nothing in
between: no handler consulted `decision.Fields`, so a field policy over those entities did nothing.
The catalogue reported zero fields for them, which was the honest answer while that was true.

Six call sites now field-gate: `createSection`, `updateSection`, `createSession`, `updateSession`,
`createOffering`, `updateOffering`. The three `areaColumns` entries and the three `fieldlessAreas` pins
moved in the same change, because `catalog_test.go` fails by name in both directions — an entry with
the pin still in place, or a pin removed with no entry, each go red.

**This is cheaper than the `updateEnrollment` pattern it mirrors, for two reasons worth recording.**

`updateEnrollment` calls `s.scopeFor(ctx, EnrollmentsWrite, EnrollmentsWriteAll)` because enrollments are
narrowable: the pair resolves whether the caller is unrestricted, and a viewer comes back with it. These
three areas have no `_all` verb, so there is no narrow/wide pair to resolve and no viewer to build. The
decision is already in the request context — `middleware/auth.go` ends with
`next.ServeHTTP(w, r.WithContext(authorization.WithDecision(r.Context(), decision)))` — so the handler
makes no authorization call at all. Before this change `authorization.DecisionFrom` had zero production
callers: the middleware was stashing a decision nothing read.

And `response.Decode` is literally `DecodeFields` discarding its first return
(`pkg/response/response.go:38-41`), so obtaining the list of keys the client actually sent is a one-line
swap with no behavioural difference.

**It is non-breaking, and the reason is worth being precise about.** `FieldPolicy.Permits` returns true
for a nil policy and for `FieldModeAll`, so a caller whose grant carries no field policy is denied
nothing. Until someone authors one, these six handlers behave exactly as before.
`TestStructureWritesAreUnrestrictedWithoutAFieldPolicy` pins that: a decision with `Fields` nil writes
every column it likes.

### `routeDecision` fails closed, unlike the map lookup it replaces

Reading the decision straight out of the context would fail open on a wiring mistake. `DecisionFrom`
returns `ok=false` when the handler was reached without `mw.Authorize`, and the zero `Decision` carries a
nil `Fields`, which permits everything. So a route registered without `s.can(...)` would silently skip
field enforcement rather than refuse — the same shape of silence as the missing `areaColumns` entry.

`routeDecision` refuses with 403 instead, and `TestStructureWritesRefuseWhenNoDecisionReachedTheHandler`
proves it. Note this is the opposite call from the one made for `fieldsFor`, and deliberately: a request
arriving with no decision is a request that was never authorized, so refusing costs a caller nothing they
were entitled to. An unknown catalogue area is a metadata gap in a document, where refusing would turn a
gap into an outage.

It belongs in `fields.go` beside `rejectUnauthorizedFields`, and sits in `sections.go` only because
`fields.go` was owned by another worker at the time. Move it when that file is free.

### The two areas that stayed pinned, and why the second reason is the sharper one

`reference` covers branches, grade levels, houses, subjects and subject groups under one entity. Their
column names collide on `name`, `code` and `status`, so `{mode: all_except, keys: [status]}` written
about branches would silently govern subjects too, and no single `Columns` slice describes five tables.
This is the question-paper-sidecar coupling again, but the justification that made it acceptable there
does not transfer: a paper's readability genuinely is its item's readability, whereas a branch and a
subject are unrelated. The fix is per-table entities, which is an entity-contract change with CAS.

`schools` is the one that reads as a control-plane quirk and is not. `controlschool.Columns` is an
ordinary `[]string` and would work fine. The blocker is `putSchoolProfile`, mounted under the same
`core.schools.write`, which writes `school_profiles` — sharing `name` and `status` with `schools` and
adding `ciphertext`, `nonce` and `key_version`. A policy naming `name` would silently govern a
credential row, and the crypto columns would never appear in the catalogue at all, so no author could
deny them and the default permits. The pin reason in `catalog_test.go` now says this, because the reason
it replaced — "no tenant columns exist to expose" — was false and invited someone to unpin it.

### `create` pairs with `write_all`, and the breadth probe that was never taken (2026-09-14)

`scopeFor(ctx, narrow, wide)` only probes breadth when `wide != narrow`:

	unrestricted := false
	if wide != narrow {
		if d, err := s.guard.Allow(ctx, subject, wide, nil); ...

Five call sites passed the same entity twice, so the probe was skipped and `access.Resolve` was always
called with `unrestricted = false`. `createGuardian` and `createStudent` are fixed to pair `create` with
the matching `write_all`. `createTeacher` and the two asset sites in `library.go` are not mine to touch
this session and are pinned in the guard test with that reason.

`write_all` is the right breadth key, and the absence of a `create_all` is deliberate rather than a gap.
The catalogue published to CAS says so in its own words: `verbNames["write_all"]` is **"Create and edit
any %s"** and `verbDescriptions["write_all"]` is "Every %s in the school, unnarrowed", while `create` is
"Bring a new %s into the school, separate from editing an existing one". So `create` is the narrow key —
may this caller add one at all — and `write_all` is already defined as the school-wide breadth that
covers creating. `narrowableAreas()` derives narrowability from the `_all` suffix, so a `create` key has
no narrowable counterpart by construction; inventing `create_all` would need CAS keys and would
duplicate breadth that `write_all` already publishes.

What this fix does **not** do is change behaviour, and that matters more than the fix. `wide` feeds only
`unrestricted`, which feeds only `access.Resolve(ctx, subject, unrestricted)`, which stores it on
`Viewer.Unrestricted` and short-circuits nothing — every query in `Resolve` runs either way. Both
`createGuardian` and `createStudent` then discard the viewer entirely: `_, decision, err := s.scopeFor(...)`.
`decision` comes from `guard.Allow(ctx, subject, narrow, nil)` and is untouched by `wide`. So no caller
was being narrowed on these create paths, because nothing on them consulted a viewer at all. The value
was computed and thrown away.

The cost is one extra `guard.Allow` round trip per create, to compute a value neither handler reads. It
is still the right change: the pairing is what every other site does, and the trap it removes is the next
person adding a reach check to a create handler and getting a silently restricted viewer. But it should
be recorded as a consistency fix, not as a grant that started working.

That also means the obvious test — a caller with `write_all` resolving as unrestricted through the
handler — cannot be written, because the handler has no output that depends on the viewer. Asserting it
through `scopeFor` directly would only restate `scopeFor`'s own `if`. The guard is therefore a source
walk, `TestScopeForAsksForABreadthKeyItCanActuallyProbe`, in the same shape as
`TestEveryDeclaredEntityIsRegistered`: parse the package, find every three-argument `scopeFor` call,
fail on any that passes one `authorization.` selector as both keys. Both directions fail loudly — an
unpinned same-entity call, and a pin for a site that no longer deviates, so the pins cannot outlive the
sites they excuse.

Both were watched. Reverting the two creates to the same-entity form produced
`students.go:135 passes StudentsCreate as both the narrow and the wide key` and
`guardians.go:147 passes GuardiansCreate as both the narrow and the wide key`; adding a pin for
`guardians.go:GuardiansCreate` after it was fixed produced `is pinned (...) but no longer passes the
same entity twice; drop the pin`.

### `markAssetReady` could not resolve a breadth grant, so the two-step upload had no ending

`scopeFor(ctx, narrow, wide)` only asks the guard about `wide` when `wide != narrow`. Two sites in
`library.go` passed `LibraryCreate` as both keys, so `viewer.Unrestricted` was structurally false at
both — not "false because the caller lacked the grant", but false for every caller, unprobeable.

On `createAsset` that is harmless and was harmless the whole time: its viewer reaches only
`attributedToOptional`, which reads `v.PersonID` and never `v.Unrestricted`. Mutating that site back to
the paired-key bug fails the AST guard and no behavioural test, which is the evidence for the claim
rather than a reading of the code.

`markAssetReady` is the one that mattered. It passes the viewer into `scopedAsset`, and `scopedAssets`
short-circuits on `v.Unrestricted` before applying any predicate. With the short-circuit unreachable,
every caller fell through to `Or(HasContentItemsWith(LibraryItemsFor(v, d)), UploadedBy(*v.PersonID))`,
and the first arm is false for exactly the asset this route exists to operate on: a content item points
at an asset only after the asset exists, so a freshly created one is referenced by nothing. Two
consequences, both now covered by tests that fail on the behaviour rather than on the key pairing:

- A caller holding `core.library.write_all` could not mark ready an upload somebody else made. The grant
  was real and did nothing.
- A subject with **no person record at this school** — a service subject, or an operator whose CAS user
  was never linked to a person — could not complete the upload at all. With `PersonID` nil there is no
  `uploaded_by` arm to fall back to, and the predicate that remains is worse than narrow. This is what
  the route actually emitted:

      WHERE "assets"."id" = $1 AND EXISTS (SELECT "content_items"."asset_id" FROM "content_items"
            WHERE "assets"."id" = "content_items"."asset_id" AND FALSE)

  `LibraryItemsFor` collapses to `FALSE` for a viewer with no person, so the subquery is unsatisfiable
  for **every** asset, not merely for un-referenced ones. `POST /library/assets` handed such a caller a
  working signed URL and `POST /library/assets/{id}/ready` then answered 404 forever. The asset could
  never leave `pending`, and nothing in the flow said why.

Both sites are now paired with `LibraryWriteAll`, matching `createLibraryItem` in the same file and the
curriculum and placement routes elsewhere. `internal/transport/http/scopekeys_test.go` parses the package
and fails on any three-argument `scopeFor` whose two entity arguments are equal, so the shape cannot come
back silently; it fails on a stale pin too.

Worth keeping in mind when reading `scopedAssets`: its three branches are unrestricted, reachable-only
(no person), and reachable-or-own. The middle branch is the one nobody pictures, and it is the one a
non-person caller lands in. A scoping helper whose widest branch is gated on a flag another function has
to opt into is a shape worth checking wherever it recurs — the flag is invisible at the call site.

### A fake driver that ignores WHERE cannot test authorization (2026-09-14)

`markAssetReady` passed `LibraryCreate` as both the narrow and the wide key to `scopeFor`, which only
probes for breadth when `wide != narrow`. So `Viewer.Unrestricted` was structurally false, the
short-circuit at the top of `scopedAssets` never fired, and every caller fell through to
`HasContentItemsWith(access.LibraryItemsFor(v, d))` — a predicate over content items that a **freshly
created asset does not yet have**, because a content item references the asset afterwards.

For a subject with no `PersonID` it is worse than a narrowing. `LibraryItemsFor` collapses to a false
predicate and the emitted SQL becomes:

    WHERE "assets"."id" = $1 AND EXISTS (SELECT "content_items"."asset_id" FROM "content_items"
          WHERE "assets"."id" = "content_items"."asset_id" AND FALSE)

`AND FALSE` inside the subquery is unsatisfiable for **every** asset, referenced or not. Such a caller
received a working signed upload URL from `POST /library/assets` and a permanent 404 from
`POST /library/assets/{id}/ready`. The asset could never leave `pending`. The two-step upload was
uncompletable, in a shipped path, and no test saw it.

**Why no test saw it is the part worth keeping.** The package's fixture drivers — `libraryDriver`,
`curriculumDriver`, `placementDriver` and their siblings — record each statement and return
`d.tables[table]`: the rows of the queried table, **with the `WHERE` clause never evaluated**. A test
written as "this caller lists only their own rows" therefore passes whether the predicate narrows, widens,
or is unsatisfiable. The fake answers the question the test meant to ask by ignoring the mechanism the
answer depends on.

So in this package there are two kinds of test and only one of them tests authorization:

- **Asserting on returned rows against a fake driver** proves nothing about scoping. It is a test of the
  fixture.
- **Asserting on the emitted SQL text**, or running against a real database through
  `testsupport.TenantTx`, does.

The fix here was a driver that evaluates the predicate it was handed — honouring the `id` and
`uploaded_by` placeholders and modelling `EXISTS(...)` over `content_items` as false, which is what a
fresh asset makes it. The general rule: **a fake that cannot fail the way production fails is not a
test double, it is a second implementation that always agrees with you.** When the thing under test is a
predicate, the double must evaluate predicates or the test must read the SQL.

The middle branch of `scopedAssets` — reachable-only, no person — is the one nobody pictures when
reading the function, and it is the branch that was live.

## Structure listings: the page object (2026-09-14)

The eight reference and structure listings — academic sessions, branches, grade levels, school
houses, subjects, subject groups, sections and subject offerings — now return the same `page`
object the primary listings do:

```json
{"sections": [...], "count": 3, "page": {"limit": 2, "offset": 0, "has_more": true}}
```

`has_more` comes from `pageOf(limit, offset, len(rows))` and is true exactly when the page came
back full. It is **not** a second counting query. A full last page therefore reports `has_more`
and the following request returns nothing — one wasted round trip, which is the price of not
running a `COUNT(*)` behind every listing. The alternative, `has_more` derived from a real total,
costs an extra query on every page for a flag the client uses once at the end.

These listings were already bounded; `limit` defaults to 50 and clamps at 200 in
`academic.DefaultLimit` / `MaxLimit`. Adding `page` changed nothing about what comes back, only
about whether the client is told. Before this, a caller receiving exactly 50 sections could not
tell a school with 50 sections from a school with 500.

### The filters were already typed

`internal/data/academic/filters.go` already carried a typed `Filters` per structure domain built
on `internal/data/filter`, and every one of the eight handlers already parsed through it. TODO §6
lists sections and subject offerings as still parsing query parameters inline; that is stale for
these domains.

### These listings have no per-viewer row narrowing, by decision

Unlike students, persons, staff, teachers and guardians, the structure listings do not call
`ForViewer`. The pipeline here is `ParseFilters -> ApplyFilters -> Paginate`, with no scoping
step, because authorization is all-or-nothing at the route: `s.can(ReferenceRead)`,
`s.can(SectionsRead)`, `s.can(AcademicSessionsRead)`, `s.can(SubjectOfferingsRead)`. A caller who
may read sections may read every section in the school. This matches the reasoning already
recorded for `getSection`, `getOffering`, `getBranch` and `getSession`: school-wide reference
data rather than per-person data.

The consequence worth stating plainly: **for these eight listings the filters are the only
predicates on the query.** Everywhere else a filter is ANDed onto an already-narrowed query and
cannot widen anything even if it is dropped. Here a dropped filter does not merely fail to
narrow — it returns the whole table. That is still inside the caller's grant, so it is not an
authorization escape, but it makes the filter path load-bearing for correctness in a way it is
not elsewhere, and it means the argument "filters only narrow" is doing no safety work in these
handlers. If any of these tables ever carries personal data, the narrowing has to arrive before
the filters, not through them.

`section` and `subject_offering` default to the current academic session when neither
`academic_session_id` nor `all_sessions=true` is given. `all_sessions=true` widens the result —
within the caller's grant, which already covers every session — so it is a default, not a
control.

### What the tests assert

`internal/transport/http/structurepage_test.go` runs against a real tenant database through
`testsupport.TenantTx`, for the reason recorded under the asset reaper: a fake driver that does
not evaluate predicates cannot fail the way a dropped filter fails.

The tenant database the suite runs against holds seed rows, so no assertion depends on an
absolute row count. Two shapes instead:

- **Every listing, window echoed.** `?limit=1` must return one row and report `has_more`;
  `?limit=1&offset=100000` must return none and not report it. This holds whatever else is in
  the table.
- **Sections and offerings, paged for real.** Three rows created behind an isolating filter, read
  in windows of two: the windows must be disjoint and their union must be exactly those three
  rows. A window that silently re-returns a row, or loses one, fails here.

Narrowing is asserted the way TODO §2 argues it must be — on what must **not** be visible. A
filter for a branch nothing belongs to returns zero rows, not everything; and `?branchid=` — the
typo for `branch_id` — is a 400 naming the parameter, not a 200 carrying the whole table. Both
failure modes arrive looking like success, which is why each is asserted rather than assumed.

### Where filters are the only predicate, "filters only narrow" does no safety work (2026-09-14)

The house pipeline is `ParseFilters -> ForViewer -> ApplyFilters -> Paginate -> Projection`, and the
invariant that makes it safe is that filters are ANDed onto an **already-authorized, already-scoped**
query. A filter can therefore never widen what a caller sees, and a filter that fails to apply merely
fails to narrow inside a set the caller was already entitled to.

**That reasoning does not hold for the eight structure listings** — sections, subjects, subject groups,
offerings, sessions, grade levels, houses, branches. They apply **no per-viewer row narrowing at all**:
there is no `ForViewer` step, and authorization is all-or-nothing at the route (`s.can(ReferenceRead)`
and its siblings). This is the documented reference-data decision from `TODO.md` §2 — the same one that
leaves `getSection`/`getOffering`/`getBranch`/`getSession` unnarrowed — extended to the listings, and it
is deliberate: these five areas have **no breadth key at all**, so there is no narrow/wide split to
express and narrowing would deny everyone rather than narrow anyone.

The consequence is sharper than the decision's framing suggests, and it was demonstrated rather than
argued: bypassing `filters.Apply` in these handlers returned **10 rows where 3 were expected** — the
whole table, not a wider slice of an authorized set. **For these eight listings the filters are the only
predicates on the query.** Elsewhere a dropped filter is a usability bug; here it is the difference
between a page and the table.

It remains inside the caller's grant, so it is not an escape, and none of these tables carries personal
data. But two things follow. A test of the form "an unauthorized row stays invisible regardless of the
filter" **cannot be written** for these domains, because there is no row-level authorization to bypass —
the meaningful assertions instead are that a stranger's filter value returns zero rather than everything,
and that a misspelled parameter is a 400 rather than a 200 carrying the table. And **if any of these
tables ever carries personal data, the narrowing must arrive before the filters, not alongside them.**
That is the trigger to revisit, and it is worth more than the decision, because the decision is defensible
today and will stop being so silently.

## Record listings: the page object, and what the scope test can actually prove (2026-09-14)

`TODO.md` §5 and §6 were both partly stale when re-read today. §6 in particular was **already done**
for every domain it names here: enrolments, subject enrolments, teacher and student assignments and
the three student sub-resources all parse a typed `Filters` (`internal/data/enrollment/filters.go`,
`internal/data/studentrecord/filters.go`) built on `internal/data/filter`, and all of them already
apply it after scoping. Nothing in §6 was mechanical work waiting to be done; it was work already
finished and not struck off. §5 was half true: `teacherassignments.go` and `studentassignments.go`
carried the `page` object, five listings did not.

Those five — `listEnrollments`, `listSubjectEnrollments`, `listAddresses`, `listDocuments`,
`listNotes` — now carry it, via the same `pageOf(filters.Limit, filters.Offset, len(rows))` the rest
of the surface uses. The window is the one the caller asked for after clamping, and `has_more` is
inferred from a full page rather than a second counting query, as everywhere else.

### The empty answer carries a window too

`listNotes` has a branch the other four do not: when `visibleNotes` resolves to "nothing is visible"
it returns early, without touching `student_notes` at all. That early return now carries
`pageOf(filters.Limit, filters.Offset, 0)`. A client that reads `page` to decide whether to request
the next offset must not have to special-case the shape of an empty answer — an envelope that
sometimes omits `page` is a client-side branch waiting to be written wrong.

### The scope holds, and ent's parenthesisation is why

The invariant to check was whether any filter is applied before or instead of scoping, so that a
filter value could widen what a caller sees. It is not. Every one of these handlers scopes first and
ANDs the filters on, and the emitted SQL was read rather than assumed.

`listNotes` is the one that needed reading, because its scope predicate is an `entnote.Or(...)` of
alternatives rather than a single conjunct. Under SQL precedence `a OR b AND c` binds as
`a OR (b AND c)`, which would have left the first disjunct unfiltered. Ent does not emit that: a
scope of `author = $1 OR (visibility = $2 AND EXISTS(...))` with `student_id` and `category` filters
comes out as

    WHERE (("student_notes"."author_person_id" = $1 OR ("student_notes"."visibility" = $2
           AND EXISTS (...))) AND "student_notes"."student_id" = $4)
          AND "student_notes"."category" = $5

with the whole disjunction parenthesised as a single top-level conjunct. The filters narrow both
branches. This is a property of ent's predicate accumulation, not of the handler, so it is recorded
here rather than relied on silently.

### What the tests assert, given the fixture

Per the note above on fake drivers, `libraryDriver` returns `d.tables[table]` with the `WHERE` clause
never evaluated, so no assertion on returned rows can prove anything about scoping, and
`testsupport.TenantTx` skips when no database is reachable. `TestRecordListingsNeverWidenForAFilter`
therefore asserts on the statement instead, and on two things rather than one:

- the scope's SQL fragment is still present in the query, and
- the **caller's own** student id is still among the bound arguments, while a stranger's id supplied
  as `?student_id=` appears as an *additional* argument.

The second assertion is the one that carries the weight. A handler that replaced the scope with the
filter would still emit a plausible `WHERE "student_id" = $1` and still return rows; what it would
lose is the caller's own id from the argument list. Asserting on the fragment alone would not catch
a scope swapped for a filter over the same column.

Each of these was mutated and watched to fail. Four of the scope mutations first failed to compile —
removing `ForViewer` or the `Where(...HasStudentWith...)` leaves `viewer` unused — which proves
nothing about the test, so they were rewritten to consume `viewer` and run. Only then did the
assertion bite, and for `listEnrollments` the failing query was exactly the feared shape: a filter on
`student_id` for a pupil the caller has no claim to, with no scope predicate anywhere in the
statement.

### What is not covered

These assertions read the SQL that was built. They do not prove the database enforces it, and they
are coupled to the text ent emits — a change to the scope predicate will fail them, which is intended
for a scope guard and irritating for a refactor. The five listings owned here are covered; the
assignment listings already had their `page` and were left alone.

### A scoped delete is one statement, or it is a race

`deleteScoped` used to check reachability and then mutate in a second statement:

    found, err := reach(ctx, client, id, viewer, decision)
    if !mustReach(w, found, err, notFound) { return }
    if err := del(ctx, client, id); err != nil { ... }

Between those two calls the row can leave the caller's scope — a guardian link deactivated, an enrolment
transferred, a teacher unassigned from the section — and the delete still lands, because the DELETE that
followed was narrowed by id alone. Sixteen call sites had the same shape.

All sixteen answer 204 and none re-reads the row, so the check collapses into the mutation:

    Delete().Where(ID(id), scopePredicate) -> (n, error)
    n == 0 -> 404

`n == 0` is the right answer for both "no such row" and "not reachable by you", which is the rule this
surface already had: an unreachable row is a 404 and never a 403, because a 403 confirms the row exists
and probing by id is what the narrowing exists to stop.

**Twelve of the sixteen are converted. Four are not, and the boundary is not arbitrary.** The twelve
whose scope is already a predicate VALUE — `access.CurriculaWritableBy`, `access.StudentsFor`,
`access.LibraryItemsWritableBy` and so on — fold with no new abstraction, and each call site now names
its own predicate where it was previously hidden behind a `reach` closure.

The remaining four are `deletePerson`, `deleteStaff`, `deleteTeacher` and `deleteGuardian`. Their scope
is not a value anywhere: it lives inside `ForViewer` on the query builders in `internal/data/person`,
`internal/data/staff`, `internal/data/teacher` and `internal/data/guardian`, as a switch over `d.Reach`
that calls package-private `selfPredicate` / `teacherAssignmentPredicate` / `anyRolePredicate` helpers
and, for the unrestricted and `ReachTenant` cases, returns the query unchanged rather than any predicate
at all. Folding those four requires each package to export its predicate — roughly

    func Predicate(v *access.Viewer, d authorization.Decision) predicate.Person

with `ForViewer` reduced to `q.where(Predicate(v, d))` and the two "no predicate" branches returning a
no-op `func(*sql.Selector) {}`, the idiom `access.AnyLibraryItem` and `anyNote` already use. That is a
one-function change in each of four packages and is mechanical, but it is a change outside the transport
layer and was not in scope for this pass. Those four keep the old two-step helper, which is now named
`deleteAfterReachCheck` so the shape is legible at the call site rather than hiding under the name of the
good one. The rename also means a fifth site cannot join the old shape by accident: the new
`deleteScoped` takes a different closure type, so a stale call does not compile.

**`deleteAsset` is the same race in a different costume** and is folded the same way, with one
difference. It is a soft delete, so the mutation is an UPDATE, and the UPDATE now carries
`assetsDeletableBy(viewer, decision)` in its WHERE. The scope for assets had the same "it is a query, not
a predicate" problem as the four above, but in a file this pass owned, so `scopedAssets` and
`deletableAsset` are now built from `assetsVisibleTo` and `assetsDeletableBy`, which are predicate values.

The pre-read in `deleteAsset` stays, and it is worth being explicit about why, because it looks like the
two-step shape this note is about. It is no longer load-bearing for authorization — the UPDATE carries
the scope, so a row that leaves scope after the read cannot be written. It survives for two things the
count cannot give: answering 204 to a delete of an already-deleted asset without writing, and the
`storage_key` and `was` fields in the "asset deleted" log line, which are what make a deletion
reconstructable against the object store. A stale `was` in a log line is harmless; a stale decision is not.

### What the fake drivers were quietly asserting, and what had to change with them

Six existing tests broke on the fold, and every one of them broke for the same reason: they asserted
`refusedBefore(table)`, meaning "no write statement touched this table at all". That is a description of
the OLD shape. Under the new one a refused delete always issues exactly one statement — a DELETE that
matches no row. The assertion is now `changedNothing(table)`, which allows that one statement and
requires it to be a DELETE narrowed beyond the id.

The package's fake driver also had to stop lying. `libraryResult.RowsAffected` returned 1
unconditionally, which under the old shape never mattered because nothing read it. Now the status code
depends on it, so the stub reports what it can defend: zero when the table it holds is empty, otherwise
the count from the clause evaluator when the WHERE parses, falling back to the row count when it meets a
correlated subquery it cannot evaluate. That is more honest than "1" but it is still a stub, which is why
the evidence for this change is not row-shaped:

- `TestEveryScopedDeleteCarriesItsScopeInTheDeleteItself` sweeps all twelve handlers and asserts, per
  handler, that no SELECT names the row before the delete, that exactly one statement reaches the table,
  and that its WHERE narrows beyond the id. Reverting one site to `deleteAfterReachCheck` fails it with
  "the delete asked student_documents about this row before deleting it"; dropping the predicate from a
  folded delete fails it with "the delete narrows by id alone".
- `TestWritingAPlacementOutsideTheViewersCurriculaChangesNothingInPostgres` proves it against the real
  database: an out-of-scope delete answers 404, issues no reachability SELECT, and the row is still there
  afterwards. With the predicate removed from the folded delete, that test reports 204 and the row is
  gone. That is the one that would have caught the original race if the race had ever fired.

A note for whoever writes the next scoping test in this package: the fake drivers do not evaluate
`WHERE`, so a test that plants a row and asserts it did not come back proves nothing about scoping.
Assert on the statement, or use `testsupport.TenantTx` and assert against postgres.

### The seventeen updates have the same race, and they are not the same job

Assessed, not built, at the lead's request.

Every update handler on this surface has the shape `mustReach(...)` then `UpdateOneID(id).Save(ctx)`,
which is the same two-step race. The fold is the same in principle — `Update().Where(ID(id), scope)` with
`n == 0 -> 404` — and one risk that would have made it dangerous is absent: no schema in this repo
declares `Hooks()` or `Interceptors()`, so the multi-row builders differ from the `...OneID` builders only
in what they return, not in what they run. That same fact is what made the delete fold safe.

What is not mechanical is the response body. `UpdateOneID(...).Save(ctx)` returns the updated row and
every one of these handlers serialises it as the 200 body. `Update().Where(...).Save(ctx)` returns a
count, so each handler needs a re-read — and the re-read is a real decision, not a keystroke:

- Re-read WITH the scope predicate, and a row that left scope between the UPDATE and the SELECT produces
  a 404 for a write that succeeded. The API would deny something it had just done.
- Re-read BY ID ALONE, and the caller is handed a row they may no longer be permitted to see. Defensible
  — the write was authorised at the instant it happened, and the field policy still projects the body —
  but it is a disclosure decision that should be made once, deliberately, for all seventeen, and written
  down. It is not a decision to make seventeen times inside a refactor.

Two further wrinkles to price in. Four of the seventeen already re-read the row before updating because
they need it for request logic — `updateLibraryItem` for the audience anchors, `updateCurriculum` for the
previous status — so for those the fold is purely "add the predicate to the UPDATE", with the body coming
from a read they already perform. And `updateLibraryItem` writes inside a transaction with the paper
sidecar, where the re-read belongs before the commit, not after.

Estimate: half a day for the twelve whose predicate already exists as a value, once the disclosure
question above is answered; the other five wait on the same `Predicate(v, d)` export that the four
unconverted deletes need. The cost is one extra round trip per update. The right sequencing is to settle
the re-read rule first, in writing, then apply it in one pass with a sweep test in the shape of
`TestEveryScopedDeleteCarriesItsScopeInTheDeleteItself` — that test is the reusable part of this work.

### Closing the fold: one predicate, two callers

The four deletes left open above — person, staff, teacher, guardian — are folded now. Each of the four
data packages exports the predicate its `ForViewer` used to apply inline:

    func For(v *access.Viewer, d authorization.Decision) predicate.Person

and `ForViewer` is reduced to `q.where(For(v, d))`. That is the whole point of the shape: the read path
and the write path are one expression with two callers, so they cannot drift. The alternative — a copy
of the reach switch in the transport layer — would have been two expressions that agree today and
disagree after the first edit to either, and the disagreement would be invisible because each would
still look correct in isolation.

The "no narrowing" cases needed a value. `ForViewer` expressed them by returning the query untouched,
which is not something a predicate can do, so they are now `anyPerson()` and its three siblings —
`func(*sql.Selector) {}`, the same idiom as `access.AnyLibraryItem`, `anyNote` and `anyAsset`. This is
the branch to be careful with, because both ways of getting it wrong are silent: return `IDIn()` and a
tenant-wide admin can delete nobody while every test about narrowing still passes; drop the branch and
the scope is gone. `TestAnUnrestrictedCallerStillReachesEveryScopedDelete` covers the closing direction
for all sixteen handlers, and mutating `anyPerson` to `entperson.IDIn()` fails it with "a caller the
guard does not narrow must still delete; a scope that admits nothing looks exactly like this".

`deleteAfterReachCheck` has no callers and is deleted, as is the `reach` function type that described
its closure — which had in fact been dead at HEAD before this pass began. Keeping either would have left
the old shape available to the next person who needed a delete in a hurry.

Two of the sixteen carry a correlated subquery even for an unrestricted caller: `student_addresses` and
`student_documents` scope through `HasStudentWith(access.StudentsFor(v, d))`, so the edge existence
check survives when the inner predicate admits everything. It is a no-op — `student_id` is NOT NULL, so
every row has a student — and it is the predicate those routes already used, moved rather than changed.
It is the reason the unrestricted test asserts on the number of bound arguments rather than on the shape
of the WHERE: an unrestricted delete binds the id and nothing else, whatever joins the edge adds.

### The stub that returned "one row changed" for everything

Worth recording separately, because the fold depends entirely on a count and the count came from a test
double that had been answering 1 unconditionally.

It mattered more than it first looked. `DeleteOneID(id).Exec(ctx)` — the OLD shape — also consults
`RowsAffected`: ent turns a zero count into `NotFoundError`. So under the old code the stub's constant 1
meant a DELETE could never report "no such row", and every 204 a delete test asserted was guaranteed by
the double rather than by the row. Fixing the count therefore changed what several already-passing tests
prove, all in the strengthening direction:

`TestDeleteLibraryItemRefusesAnItemTheCallerDoesNotOwn` seeds a row for all six of its cases. Its four
204 cases used to pass whatever the delete's WHERE said, because the stub reported 1 regardless. They
now pass only because the clause evaluator matches the seeded row against the predicate the handler
actually emitted — which is the thing the test was always meant to assert.

No assertion moved the other way, and nothing became vacuous: a test that had planted no row and still
expected 204 would now fail loudly rather than silently, and there was none. The pattern is worth stating
plainly, because this is the third test double in one session to be the defect rather than the code:
**a double that always reports success makes the success path unfalsifiable.** The drivers that ignore
`WHERE` are the same failure in a different place — they make a row-returning assertion unfalsifiable —
and the fix is the same one: make the double answer what it can defend, and assert on what it cannot
fake.

### A test double that always says "one row changed" (2026-09-14)

`libraryResult.RowsAffected` in the transport package's fake driver returned **1 unconditionally**. The
consequence is larger than it sounds and was not noticed until a change depended on the count.

Ent turns a zero `RowsAffected` into `NotFoundError`, and it does so for `DeleteOneID(id).Exec(ctx)` —
the **old**, pre-fold shape — as well as for a predicated `Delete().Where(...)`. So under the constant 1
a delete could never report "no such row" in any test using that driver, and **every 204 a delete test
asserted was guaranteed by the double rather than by the row.** The tests were describing the fixture.

Fixing it strengthened the existing assertions rather than breaking them: the four 204 cases in
`TestDeleteLibraryItemRefusesAnItemTheCallerDoesNotOwn` now pass only because the seeded row genuinely
matches the predicate the handler emitted, which is itself evidence the folded predicates admit the rows
they should. Nothing moved the other way — a test planting no row and expecting 204 would now fail
loudly, and there was none.

**This is the third test double to be the defect in one day**, after the fixture drivers that never
evaluate `WHERE` and a mail harness that assumed it owned a shared queue. The common shape: *a double
that cannot produce the failure production can produce will report success forever, and the test that
rests on it is a description of the double.* When a change starts to depend on a value the double
invents — a row count, a predicate, a queue's exclusivity — that value is the first thing to check.

## `can_view_academic` now gates something, and exactly what (2026-09-14)

`can_view_academic` on `student_guardians` had been read by nothing since it was written. A grep outside
generated code found the schema default, the payload struct and the setter — nothing else. It was a
dormant bit *named as a capability*, and it appeared in the catalogue as a writable column of the
`guardians` area, so a policy author could grant field access to it and reasonably believe a guardian had
been barred from something. Nobody had been. It now narrows the guardian arm of the reach.

`can_view_finance` is deliberately untouched and remains dormant. There is no finance, fee, invoice,
payment or billing entity in this system; it has nothing to gate, and inventing a domain to justify a
flag would be backwards. It should be removed or implemented the day a finance domain exists.

### What counts as an academic record

Gated, i.e. unreachable through a link with `can_view_academic = false`:

- `student_enrollments` — which section and session the child is in
- `student_subject_enrollments` — which subjects the child takes
- `student_assignments` — the child's role within a section or subject offering
- `student_documents` — the school's file on the child

Not gated:

- `student_notes`
- `students`, `student_addresses` — the child and the contact details; the flag bars records, not the
  child. A barred guardian is still a guardian, may still be the emergency contact, and must still be
  able to find their own ward.
- curricula, curriculum nodes, content placements and library content

`student_assignments` is in the list for a reason worth stating: it carries `section_id` and
`subject_offering_id`, so leaving it open would have published by one route exactly the enrolment facts
the other three hide. **A gate that a second listing walks around is not a gate.**

`student_documents` is the one where the narrow reading was rejected. `document_type` is free text, so a
report card and a birth certificate are indistinguishable to a predicate, and the table therefore has to
be all in or all out. Out means the transcript — the single most likely thing an administrator means by
"cannot view academic records" — stays visible, which makes the feature a lie in its most visible case.
In means a barred guardian also loses sight of the admission papers. The first is an authorization
failure; the second is a narrowing the school asked for when it unset the flag. Given that the flag may
only ever narrow, the safe error is to include the table.

### Why notes are excluded, explicitly rather than by omission

`student_notes` already carries a purpose-built, per-row, author-controlled guardian gate: `visibility`
is an enum whose third value is literally `guardian`, and a note reaches a guardian only if its author
deliberately marked it so. That is the asymmetry with documents, which have no such control: for
documents this flag is the only gate there will ever be, and for notes it would be a second one layered
over a decision someone already made deliberately.

The category vocabulary is free text and covers pastoral, behavioural and medical notes as well as
academic ones, so gating the table gates all of them. The concrete case that decided it: a safeguarding
or health note marked guardian-visible is exactly the note that must reach a guardian, and
`can_view_academic` is the wrong instrument to withhold it. **A school that wants to withhold notes from
a particular adult should be given `can_view_notes`, or should use the note's own visibility — it should
not get that behaviour as a side effect of an academic flag.** If the argument later runs the other way,
the change is one predicate in `notesGuarded` and this paragraph is the thing to overturn.

Curricula and library content are excluded on the same principle: a syllabus is shared across every child
in a grade and is not a record about anyone. The ward arms in `curriculum.go` and the `WardOfferingIDs`
that `enrolledScope` derives are therefore left ungated, and that is a boundary rather than an oversight
— content reach follows the ward's placement, and the flag governs records. Gating content reach as well
would be a coherent second decision; it is not this one.

### Where the gate lives, and why it only narrows

`StudentsOfGuardianAcademic` is `StudentsOfGuardian` plus `can_view_academic = true` on the link, and
`StudentsForAcademic` is `StudentsFor` with that substituted into the guardian arm alone. Every other arm
— self, taught-by, tenant, unrestricted — is byte-identical to before, so a teacher or an administrator
reaching the same row by a different arm is unaffected. **The flag is a property of the link, not of the
row.** It is ANDed into one disjunct of an OR, which is why it cannot widen anything: an extra conjunct
on one arm can only remove rows from that arm, and a non-guardian never enters that arm at all.

The single-row read in `getEnrollment` scopes with `StudentsFor` rather than `EnrollmentsFor`, so it
needed the substitution separately; without it the listing would hide a row that a direct fetch by id
still returned. `reachDocument` in `reach.go` still uses the ungated `StudentsFor`, deliberately: it
guards `verifyDocument`, a write path reachable only with `student_documents.write`, which no guardian
holds. That file is outside this change; if it ever becomes reachable by a guardian it must be switched
too.

### It changes nothing for existing data, and that was measured

All **96** rows in `student_guardians` are `status = active` with `can_view_academic = true`, and the
column defaults to `true`, so no existing guardian is newly denied anything. The census was run against
the tenant database rather than assumed:

```
student_guardians total=96 active=96 can_view_academic_true=96 can_view_academic_false=0
```

`can_view_finance_true=0`, for what it is worth, in all 96.

### The test, and why it has to be database-backed

`internal/transport/http/guardianacademic_test.go` seeds one guardian with two wards in the same section,
one link permitting academic records and one refusing, and a class teacher over that section. It asserts
that the guardian's listings of enrolments, subject enrolments, student assignments and documents return
the permitted ward and not the refused one; that `getEnrollment` answers 404 for the refused ward and 200
for the permitted one; that **the teacher gets both rows regardless**; that both wards remain readable as
students; and that both wards' notes remain visible, so the notes decision above fails loudly if someone
changes it by accident rather than on purpose.

It runs through `testsupport.TenantTx` against real Postgres because the fake drivers in the transport
package **do not evaluate `WHERE`**. An assertion about which rows come back means nothing against them —
that is how a broken authorization predicate reached production in this codebase this week. The test also
asserts that the emitted SQL on each of the four tables actually contains `can_view_academic`, so a gate
that was quietly evaluated in Go, or not at all, would fail rather than pass.

Removing the two-line gate from `studentsOfGuardian` makes it fail in the intended place — the refused
ward's rows come back in every listing and `getEnrollment` answers 200 — while the teacher-arm and notes
assertions keep passing, which is the shape you want: the mutation breaks only what the gate is for.

### A gate that can only be set once (2026-09-14)

`can_view_academic` now gates real access — enrollments, subject enrollments, student assignments and
student documents are unreachable through a guardian link carrying `false`. Two consequences follow that
did not matter while the flag was dormant, and both are worth stating because they are the difference
between a control and the appearance of one.

**It cannot be changed after the link is created.** `student_guardians` has **no update path** — the only
mutation is `linkGuardianToStudent`, a create. `guardians.go:224` updates the *Guardian* entity, not the
link. So a school that needs to revoke a guardian's academic access must **delete the link and recreate
it**, and the unique index on `(student_id, guardian_id)` means it cannot simply add a corrected one
alongside. That index is also what closes the obvious escalation: a caller cannot mint a second link to
the same student with the flag flipped.

Setting a gate at creation and never again is defensible for a value nobody revises. It is not obviously
right for an access control, because the event that most often motivates revoking academic access — a
custody change, a safeguarding concern — happens *after* the link exists. A `PATCH` on the link is the
obvious answer and is deliberately not built here; it is an API addition, not a wiring change.

**The flag is a writable field of the `guardians` catalogue area.** It always was, but it gated nothing,
so field-write on it was harmless. Now that it gates access, granting field-write over
`can_view_academic` is granting the ability to set the gate at link creation. That is not wrong — an
administrator linking a guardian must choose the value — but it should be a deliberate grant rather than
one that arrives bundled with every other column of the area.

**`can_view_finance` was left dormant on purpose.** There is no finance, fee, invoice, payment or billing
entity anywhere in the system, so it has nothing to gate. Wiring a flag by inventing the domain that
would justify it is backwards. It stays a documented dormant bit until a finance domain exists, at which
point it is implemented or removed — the one thing it should not do is keep appearing in the catalogue as
a grantable field that does nothing.

## Outbox retention: the trail is deleted at 30 days (2026-09-15)

Nothing removed `sent` or `failed` rows from `outbox_messages`. The payload purge that runs in the same
statement as the terminal update was doing its job — a settled row holds no ciphertext, no nonce, no key
version, and a table check enforces it — so this was never a question of what a leaked row would reveal
about the *contents* of school mail. It was a question of what the row reveals by existing.

A terminal row keeps `recipient_hash`, `recipient_redacted`, `template_key`, `school_id`, and five
timestamps. `recipient_redacted` keeps the full domain on purpose, because whole-domain delivery failure
is the operational question people actually ask. `recipient_hash` is keyed with a pepper precisely so it
is not a dictionary-reversible digest. Both of those decisions are right and both were made assuming the
rows do not accumulate forever. Kept forever, the table is a per-recipient activity record for children's
contact data: which template went to which mailbox at which school, on which dates, over years. The HMAC
and the redaction bound what a reader learns from one row; they do nothing about what a reader learns
from ten thousand of them. Retention is the control that was missing, and the pepper is only as strong as
the retention decision standing behind it.

**Thirty days, and the reason is that the operational value is about recent mail.** "Did the fee reminder
go out?", "is this school quietly living on the platform fallback?", "why did every address at this
domain fail on Tuesday?" — all of those are asked days later, not years later. A support question about
mail from last term is not answered from the outbox, and pretending it might be is what keeps the trail
alive. Thirty days costs almost nothing of what those columns are for.

### The floor is seven days, and it is not arbitrary

`ValidatePurge` refuses any window under `MinimumRetention`, one week, before the command opens a
connection. The floor exists because the destructive path is one flag away from a typo, and `-age 1h` on
a tired evening is not a retention policy, it is data loss. Seven days is chosen to sit strictly above
the queue's own lifecycle: `DefaultTTL` for a queued message is 72 hours, so a week guarantees a settled
row always outlives the window in which its siblings could still have been in flight, and guarantees
"did Monday's mail go out?" is answerable on Friday. Anything shorter is a different decision, and it
should be argued rather than typed.

### Delete the row, not the columns

The alternative was keeping the row and nulling the identifying columns, leaving a countable husk. That
was rejected, and not only because "purge the trail" is what was asked for:

- **Nothing references an outbox row.** The only foreign key on the table points outward, to `schools`,
  with `ON DELETE CASCADE`. No table points in. A delete has no referential consequence.
- **A husk still carries `school_id`, `template_key` and the timestamps**, which is most of the shape of
  the trail. Nulling the two recipient columns narrows the harm, it does not end it.
- **Aggregates, if they are ever wanted, belong in a counters table**, written when the row settles, not
  reconstructed by leaving rows behind for a report nobody has asked for yet.

### Deleting a row releases its idempotency key, and that is a real consequence

`idempotency_key` is unique, and `Submit` treats a hit on it as "this message already exists, return the
existing row". A purged key stops colliding: the same key resubmitted after the purge creates a new
message, and the mail is sent again. Today no production caller passes `IdempotencyKey` at all, so
nothing regresses now — but this is the shape of the rule that matters later. **The outbox is a send
queue with a short dedupe window, not a durable once-only ledger.** A caller that needs "this may only
ever be sent once, forever" must record that fact in its own domain table, because the outbox forgets.
Thirty days is far longer than any real dedupe window — the double-click, the retried HTTP call, the
re-run import — all of which resolve in seconds to days. The command reports the count it frees on every
run (`idempotency keys freed N`) so the consequence is visible in the output, not only here.

### What the purge refuses to touch

Only `sent` and `failed` are ever purged. `pending`, `retrying` and `sending` are never touched at any
age, because a row still in flight is not a retention question and deleting one loses mail. A row that is
terminal but somehow still holds ciphertext is also skipped, which the table check should make
impossible and which is cheap to assert anyway.

The guard is written twice, deliberately. `Purger.judge` decides in Go, and `purgeable` puts the same
three conditions — terminal status, null payload, past the cutoff — into the `WHERE` of both the scan and
the `DELETE`. The delete re-asserts them rather than trusting the id the scan produced, so a row that
changed underneath, or a scan that went wrong, cannot widen a delete. Both layers are mutation-tested:
removing the Go status check fails the unit test while the live tests still pass, because the SQL guard
catches it on its own; removing the SQL status filter fails the live test with "the delete removed 1
pending rows; mail in flight was lost".

**Age is measured from `completed_at`, falling back to `created_at` when it is null.** The retention
promise is thirty days after the mail was dealt with, not thirty days after it was queued: a message that
retried for two days and then failed should be kept for thirty days from the failure. The fallback covers
rows written outside the sender, since no check forces `completed_at` to be present on a terminal row.

### The command is control-plane, and it prints no recipient data

`cmd/mailpurge` follows `cmd/assetreap` — dry run by default, the destructive path behind `-destroy`, the
window and the limit validated before any connection opens — with two departures.

**No per-school loop.** `assetreap` iterates schools because assets live in each tenant database.
`outbox_messages` is a single control-plane table with a nullable `school_id`, so this is one scan and
one report; the school code is resolved for display only, and platform mail that belongs to no tenant
shows as `platform`. It follows that the command needs no `SECRETS_MASTER_KEY`: it never opens a tenant
database and never decrypts anything, because the rows it touches hold nothing encrypted. Less privilege
for the same job.

**No `-school` filter.** Retention is a blanket policy. A flag that purges one school's trail early is
not a retention operation, and the obvious misuse of it is worse than the convenience.

**The report never prints `recipient_redacted` or `recipient_hash`.** `assetreap` prints storage keys
because a storage key is an operational handle; the analogous columns here are the trail itself, and a
purge that copies the trail into a terminal scrollback, a CI log or a cron mail has not purged it. The
findings carry the message id, the status, the template key and the age, and a test asserts that neither
the redacted address nor the hash can reach a finding.

## Editing a guardian link, and making its fields governable (2026-09-15)

`can_view_academic` stopped being a dormant bit on 2026-09-14 and now gates enrolments, subject
enrolments, student assignments and student documents. Two gaps followed from that, and both are closed
here: the bit could only be set at creation, and no policy could say who was allowed to set it.

### The link had no update path at all

`student_guardians` had exactly one mutation, `linkGuardianToStudent`, a create. `updateGuardian` edits
the **guardian** row, not the link. So revoking a guardian's academic access meant deleting the link and
making a new one, and the unique index on `(student_id, guardian_id)` forbids putting a corrected link
beside the old one. The events that motivate revocation — a custody order, a safeguarding concern —
all happen after the link exists, which is precisely when there was nothing to edit.

`PATCH /api/v1/guardians/{id}/students/{student_id}` fills that gap. The link is addressed by the pair
that identifies it rather than by its own id, which matches the `POST .../students` beside it and means
no caller has to learn a link id to revoke access.

### Why the write narrows twice, on two different entities

The handler checks reach before writing **and** folds the same predicate into the `UPDATE`:

    client.StudentGuardian.Update().
        Where(entlink.GuardianID(g), entlink.StudentID(s),
              entlink.HasGuardianWith(guardian.For(gv, gd)),
              entlink.HasStudentWith(access.StudentsFor(sv, sd)))

with `n == 0` answering 404. This is the shape the sixteen scoped deletes were moved to on 2026-09-14,
for the same reason: a check followed by an `UpdateOneID` writes on an id that was in scope a moment ago,
and a row can leave scope in between.

The predicate has two arms because the caller must clear two different bars. The guardian arm is the
usual "may this caller write this guardian". The student arm exists because **the link is what
`access.StudentsOfGuardian` reads**: a caller who could point a link at an arbitrary child would be
widening a viewer, their own or someone else's. Creating a link already demands `core.students.read`
reach on the child for exactly this reason, and editing one is no different — moving `can_view_academic`
from false to true on a link is the same grant as minting the link.

The two arms are independently mutation-tested. Dropping either one leaves an `UPDATE` that narrows on
the two ids alone, and `TestThePatchThatEditsALinkCarriesBothArmsOfItsScopeInTheUpdate` names the missing
arm. That test uses a caller narrowed by `reach=self` on guardians and `reach=guardian_ward` on students
so that each arm renders a subquery only it could have produced; with a single reach for both, the
guardian arm nests a `students` subquery of its own and the assertion cannot tell the two apart. An
earlier version of the test did exactly that and passed with the student arm deleted.

An unreachable link is **404, never 403**. A 403 would confirm that a particular guardian is linked to a
particular child, which is the fact the scoping exists to withhold.

### `status` is deliberately not editable here

`linkFields` — the explicit include-list the create path already enforces — omits `status` on purpose, so
a link is always born `active`. The PATCH reuses that same list rather than the guardian entity's field
policy, because `student_guardians` is a different entity and conflating the two is a mistake this
codebase has already made once.

Keeping `status` out means this endpoint revokes **academic** access and nothing wider. That is the right
split: `can_view_academic=false` withdraws the academic records while leaving pickup, emergency contact
and the relationship itself intact, whereas `status=inactive` severs every arm at once, because
`entlink.StatusEQ(active)` sits in `studentsOfGuardian` and in `guardian.For`'s teacher predicate.
Those are different decisions with different consequences and they should not share one request body.
Adding `status` to `linkFields` would also have made it settable at create, undoing "born active" as a
side effect.

**This leaves a real gap, named here rather than papered over: there is still no way to sever a link
entirely.** There is no unlink route and no `DELETE` on `student_guardians`; the only full severance
would be a `status` transition this endpoint declines to offer. That wants its own endpoint under its
own delete-shaped key, not a field on this one.

`student_id` in the body is a 400, not a 403: the path already names the student, and a body that
disagrees with the path is a malformed request rather than a refused one. The `UPDATE` never sets
`student_id` in any case, so the rejection is a clear error and not the defence.

### Why `core.student_guardians` has a `write` key and no `write_all`

`student_guardians` had a generated entity and a `Columns` list but no `areaColumns` entry and no CAS
entity keys, so no rule could be written about `can_view_academic` at all. It now has one key:

    core.student_guardians.write

and `areaColumns["student_guardians"] = entlink.Columns`, which is what turns that key into a field list
a rule author can name `can_view_academic` in. The two have to land together, and `catalog_test.go`
enforces it from both sides: an area with no columns and no fieldless pin fails by name, and an area that
has columns while still pinned as fieldless fails by name too. Both directions were mutation-checked.

The endpoint takes its field policy from `routeDecision`, the decision the route's own `s.can` already
reached, so the governing entity is consulted once and the fields it withholds are refused before any
write. `linkFields` still runs first: policy decides who may write `can_view_academic`, `linkFields`
decides what this endpoint is willing to write at all, and the narrower of the two wins.

**There is no `core.student_guardians.write_all`, and that is a decision, not an omission.** Five areas
already have no breadth key. A `*_all` key earns its place by making a viewer unrestricted for a
predicate that is actually built from it — that is all `scopeFor`'s `wide` argument does. This handler
builds no predicate from a link-shaped viewer: breadth over links follows from breadth over the guardian
(`core.guardians.write_all`) and over the child (`core.students.read_all`), both of which are already
consulted. A `student_guardians.write_all` would therefore be a key nothing reads — the same unreachable
capability that has been found four times in this codebase already.

**The create path is deliberately unchanged.** `POST .../students` still runs under
`core.guardians.write`. Moving it would be a behaviour change to a shipped endpoint that breaks every
policy already written for it, and it would break the moment this key is registered rather than when the
switch was reviewed. Bringing the create under the new key is a follow-up with its own migration of
existing rules.

### What the tests actually establish

Everything here is DB-backed through `testsupport.TenantTx`, or asserts on the SQL the recorder captured.
The package's fake drivers do not evaluate `WHERE` and one of them returns `RowsAffected: 1`
unconditionally, so an assertion on rows returned by those doubles would have proved nothing — that is
how a broken authorization predicate reached a shipped endpoint this week.

The test that ties the two halves together sets `can_view_academic` to false through the new PATCH and
then re-reads enrolments **as the guardian**, asserting the ward's enrolment has left their reach while
the other ward's has not. The write path and the gate have to agree for that to pass, and neither of them
is mocked.

One honest gap in the mutation testing: deleting the `n == 0` check fails no test on its own, because the
read-back that builds the response uses the same predicate and returns not-found too. The check stays —
it is the guard that does not depend on the read-back, and the contract asks for it — but it is covered
by the read-back rather than independently.

## The ingest bridge: emerge-core finally calls the retrieval engine (2026-09-15)

Until now a file uploaded through emerge-core was stored in the school's bucket, catalogued as a
`content_item` and given scope labels, and the retrieval engine never saw it. `content_items` has
carried `engine_document_id`, `index_status`, `indexed_at` and `indexed_sha256` since the library
landed and **nothing wrote any of them**, so `GET /curriculum-nodes/{id}/content` computed
`retrieval_state` from four permanently-null columns and reported `not_indexed` for everything,
for ever, while looking like a working feature. `internal/service/indexing` is the producer those
columns were waiting for.

### It is off, and off means nothing happens

`RETRIEVAL_INDEX_ENABLED` defaults to false and `RETRIEVAL_ENGINE_BASE_URL` defaults to empty;
`Config.RetrievalIndexing()` requires both. With either missing, `indexOnPublish` returns before it
reads a tenant, before it opens an object store and before it writes a column — no call is made and
no field is written. That is asserted directly rather than inferred: the flag-off test fails if any
of the four column names appears in any statement the publish issues, and deleting the flag check
fails it. The engine is a second system with its own failure modes, and switching it on has to be a
deliberate act.

### Publishing does not fail because the engine is unavailable

The catalogue is the source of truth and retrieval is derived from it, so a school that cannot reach
the engine must still be able to publish. A failed push marks `index_status = failed` and leaves the
item `published`; it never rolls the publish back. The engine-down test asserts both halves, because
asserting only the mark would also pass on an implementation that unpublished the item.

The push therefore cannot happen inside the publish request. `POST /ingest/file` streams the file
body and returns a `job_id` immediately — ingest is asynchronous, and the document id exists only
once the job reaches a terminal status. Doing that inline would put an S3 download, a multi-megabyte
upload and a poll that the engine's own docstrings measure in minutes inside a request with a 30
second write timeout. So the publish writes `index_status = pending` in the same request, which is a
durable record of intent, and hands the item to an in-process dispatcher; the worker streams the
bytes, polls to a terminal status, and records the outcome.

### What re-drives a `failed` item: nothing yet, and that is the gap

This is the honest answer, stated here rather than papered over with a retry loop that nothing
exercises. Two states outlive the process:

- `failed` — the engine refused or was unreachable. Nothing retries it.
- `pending` — the item was queued and the process restarted before the worker finished, so the
  in-memory queue entry is gone. Nothing re-drives it.

What the code does guarantee is that **no failure strands an item in `pending`**. Every path that
can fail after the intent is recorded — an item unpublished before the worker reached it, an
unreadable asset, a refused gate, a dead engine, a failed job — marks `failed`, which is a state an
operator or a future sweeper can act on. A dead-end `pending` would be the worse bug, because it
reads as "in progress" for ever. `TestIndexerStrandsNothingInPending` holds that line, and deleting
the failure recording fails it.

The fix, when it comes, is a sweeper over `content_items` where `index_status IN ('pending','failed')`,
which is why `index_status` is indexed. It is not built here because it needs to iterate every tenant
database on a timer and coordinate across instances the way `MAIL_SENDER_INSTANCE_ID` does, and none
of that could be tested against the stub engine this work is verified with.

**A retry is safe, but not for the reason it looks.** The engine derives a document id as
`"doc_" + sha1(tenant + NUL + checksum)[:12]` over the file's sha256 (`ingest.py`,
`stable_document_id`), so the same bytes always name the same document. That is *not* an idempotent
overwrite: `_run_job` holds an `_index_lock` and runs a re-ingest guard that ends the job in the
terminal status `duplicate` with **nothing indexed**. Re-driving is still safe, because
`_duplicate_result` carries the `document_id` of the document that already holds those bytes — so a
retry of something that actually succeeded recovers the id instead of creating a second copy. That
is why `duplicate` is recorded as `indexed` here: the bytes are in the engine under that id.

### What the engine is actually sent

`POST /ingest/file` takes **query parameters and a raw body**, not JSON. The client passes `filename`
(the engine routes on the extension), `title`, `source_type` and a repeated `restricted_to`.

`scope` is hardcoded to `school`. The engine's `_require_admin_for_global` treats `scope=global` as
"one school's material is readable by every school"; nothing in this bridge should ever be able to
ask for that, so it is not a parameter.

Labels come from `retrieval.LabelsFor` and are never constructed here. The vocabulary is frozen and
lives in one place; a second speller of `school_<id>` is a second vocabulary the day one of them
changes. `LabelsFor` returns `ErrNotPublished` for anything unpublished, which is the guard that
keeps a draft out of the engine, and it is re-checked on the worker thread rather than trusted from
the publish request — the item may have been unpublished in between.

**A refused gate is a failure, never a quiet unrestricted ingest.** The engine answers 409 in two
cases: no scopes authorizer is configured, so no caller could hold a label; and a restricted PDF
uploaded while its confirm gate is on, where the stamp would be lost between parking and minting.
Both mean the engine cannot honour the labels, and both are mapped to `failed`. Treating either as
success would produce a document everyone in the school can read while emerge-core reports it as
scoped — a leak, not an inconvenience.

**`pending_confirmation` is not `indexed`.** When the engine parks a PDF for human chapter
confirmation the document is not in its store and no read path can serve it. The job result names a
`pending_id` and deliberately carries no `document_id`. Writing that id into `engine_document_id`
would record a handle that 404s on every documents route, so the item stays `pending` with no
document id. This is the one `pending` that is legitimately waiting on someone else.

### Why `indexed_sha256` is the asset's digest

`indexStateOf` in `resolve.go` reports `current` only when both `engine_document_id` and
`indexed_sha256` are set, and reports `stale` when `indexed_sha256` differs from the asset's
`sha256`. So the column has to hold the digest of the bytes that were sent, which is
`assets.sha256` — the same value the engine hashes into the document id. Writing anything else
would make staleness undetectable. All four columns are written together on success and cleared
together on failure, so no item can read as indexed on the strength of a leftover digest.

### The tenant sent to the engine is the CAS slug

`X-School-Id` carries `Tenant.CASTenantID`, not the school UUID, because the engine partitions on
the tenant CAS signs into a token and a second spelling would split one school's library in two.
A school with no slug is skipped with a log rather than indexed under a guessed identity — the
engine's own `stable_document_id` refuses an empty tenant for the same reason, and here the guess
would be baked into a permanent id.

Note this is a different namespace from the labels, which embed school UUIDs. That is fine: labels
are opaque strings to the engine, compared only against what the authorizer hands it.

### The bytes are streamed, not buffered

The worker presigns a GET and pipes the object's body straight into the ingest request, so a
textbook is never held in memory. `blob.Client` has no byte-download method and that file is not
this work's to change; `PresignGet` is already public and is already how the asset routes hand a
file to a browser.

### A scoped update is one statement too, and it costs a re-read

The deletes were folded first because they were easy: all sixteen answer 204, so the reachability check
collapses into the DELETE and nothing else has to change. The updates are the other half of the same
defect and they were deferred once, because an update answers with the row it wrote and ent's predicated
`Update().Where(...)` hands back a **count, not a row**.

Seventeen handlers had the two-step shape:

    found, err := reachX(ctx, client, id, viewer, decision)
    if !mustReach(w, found, err, notFound) { return }
    ...
    row, err := client.X.UpdateOneID(id).Set...().Save(ctx)

`UpdateOneID(id)` narrows by the primary key and nothing else. Between the check and the `Save` the row
can leave the caller's scope — a guardian link deactivated, an enrolment transferred, a teaching
assignment revoked — and the write still lands on a row the caller may no longer touch. Sixteen of the
seventeen are now:

    n, err := client.X.Update().Where(ID(id), scopePredicate).Set...().Save(ctx)
    n == 0 -> 404
    n == 1 -> re-read the row to answer with it

`wroteScopedRow` in `common.go` is the shared arm of that: it maps the error through `writeTenantEntErr`
and `n == 0` to 404, keeping the 404-never-403 rule the deletes already hold. An unreachable row and a
non-existent row are the same answer, because a 403 confirms the row exists and probing by id is exactly
what the narrowing exists to stop.

**The re-read is deliberately unscoped.** It is `Query().Where(ID(id)).Only(ctx)`, with no scope
predicate, because the predicated UPDATE has already proved the caller could write this row. Scoping the
re-read would be worse than redundant: several of these updates move the row out of the caller's own
scope on purpose — `updateEnrollment` can change `section_id`, `updateStudent` can set a pupil to
`withdrawn`, `updateLibraryItem` can move the audience — and a scoped re-read would then answer 404 for a
write that had already committed. The row would be changed and the caller told it was not found.

**The pre-reads stay.** They are no longer load-bearing for authorization, for the same reason
`deleteAsset`'s pre-read is not, but they still carry work the count cannot: `updateStudent` needs the row
to pick a per-row field policy (`studentWriteFields`), `updateCurriculum`, `updateCurriculumNode`,
`updatePlacement` and `updateLibraryItem` read `current` for the old status, grain, audience and question
paper that their validation compares against, and every one of them fixes the 404-versus-403 ordering of
the field-rejection checks. Removing them would turn a 404 into a 403 on rows that do not exist. The cost
is one extra SELECT per update, which is what atomicity is being bought with here.

**`linkGuardianToStudent` is the seventeenth and it is not folded.** It has the same two-step shape —
reach the guardian, reach the student, then write — but the write is a `Create`, and ent creates carry no
WHERE. There is no single statement that both checks the scope and inserts, because the scope rule for a
link is not a property of the row being inserted: it is a property of the guardian and the student it
points at. The constructions that would close the window are a check-after-write inside a transaction
(create, re-assert `linkWritableBy`, roll back on zero) or an `INSERT ... SELECT ... WHERE EXISTS`, which
ent cannot express. The transaction form was tried and rejected: the create's only coverage is
`TestLinkGuardianRefusesTheFieldsItDoesNotOwn`, which runs against the real database through
`testsupport.TenantTx`, so the handler's `client.Tx(ctx)` would open a transaction inside the fixture's
rollback transaction and fail at `Begin`. Closing this window properly means restructuring how that
handler gets its writer, which is a different change from this one. It is left in the old shape
deliberately rather than half-converted.

**`updateGuardianLink` was already atomic** and is the worked example the sixteen follow. It is absent
from the sweep below only because it is keyed by a pair — guardian id and student id — rather than by an
`id` column, so the "narrows beyond the id" assertion does not describe it.
`TestThePatchThatEditsALinkCarriesBothArmsOfItsScopeInTheUpdate` is its guard.

### No update re-derives a scope rule

Every folded UPDATE takes its predicate from the same expression the matching read takes it from:
`access.StudentsFor`, `access.EnrollmentsFor`, `access.SubjectEnrollmentsFor`,
`access.StudentAssignmentsFor`, `access.TeacherAssignmentsFor`, `access.CurriculaWritableBy`,
`access.CurriculumNodesWritableBy`, `access.ContentPlacementsWritableBy`, `access.LibraryItemsWritableBy`,
`person.For`, `staff.For`, `teacher.For`, `guardian.For`, `notesVisibleTo` and `assetsVisibleTo`. One
expression, two callers. A second spelling of the same rule is the failure mode this is guarding
against: the read rule and the write rule drift apart silently while each looks correct on its own.

`verifyDocument` needed a predicate that had no name — `reachDocument` built
`entdocument.HasStudentWith(access.StudentsFor(v, d))` inline — so it is now `documentsVisibleTo` in
`reach.go` and `reachDocument` consumes it. Nothing new was derived.

One divergence was found and deliberately **not** changed: `reachDocument` narrows with
`access.StudentsFor`, while `deleteDocument` narrows with `access.StudentsForAcademic`, which is stricter
for a guardian. `verifyDocument` follows the reach it already had, so this pass changes no one's
permissions. Whether reading or verifying a document should require the academic gate is a policy
question, and answering it by quietly widening or narrowing a write during a mechanical fold would be the
wrong way to settle it.

### Proving a predicated update, when the fake driver answers `RowsAffected: 1` to anything

The stub driver in `library_test.go` computes rows-affected only for `DELETE`; for anything else it
returns 1. That unconditional 1 is how a broken authorization predicate reached a shipped endpoint, and
it is exactly the number this fold now depends on. So a test that watches one of these handlers answer
200 with a row proves nothing at all about the WHERE clause.

`TestEveryScopedUpdateCarriesItsScopeInTheUpdateItself` therefore asserts on the **emitted SQL**: for all
sixteen it drives the handler with a guard narrowed on every entity, then requires exactly one write
statement on the table, that it is an `UPDATE "<table>"`, and that its WHERE begins with the id term and
does not end there. `narrowedBeyondTheID` is the delete guard's `scopedBeyondID` generalised over the
placeholder number, because an UPDATE binds its id at `$2` or later — `$1` is `updated_at`.
`TestAnUnrestrictedCallerStillReachesEveryScopedUpdate` is the other arm: a predicate that admits nothing
also produces a narrowed statement, so an unnarrowed caller must still get its write.

Two things the stub cannot settle are settled against real Postgres in `placementdb_test.go`.
`TestUpdatingAReachablePlacementCarriesItsScopeInTheUpdateStatementInPostgres` reads the UPDATE the
database was actually sent and requires the correlated `EXISTS` in it.
`TestThePredicatedUpdateCountsOnlyTheRowsTheViewerMayWriteInPostgres` runs the folded statement itself and
asserts the count is 0 for a row outside the viewer's curricula and 1 for a row inside, and that the
refused row is unchanged afterwards — the only place the `n == 0 -> 404` contract is proved rather than
assumed. Both were mutated: dropping `access.ContentPlacementsWritableBy` from `updatePlacement` fails
both, and dropping `access.StudentsFor` from `updateStudent` fails the sweep with "the update narrows by
id alone".

The stub had to learn one thing to make the sweep possible: it answered `COUNT(...)` selects with
"unsupported destination *int64", so seven of the sixteen handlers could not get past their own reach
check under it. `libraryCounted` now answers a single-expression `COUNT(...)` select with the number of
seeded rows. It still does not evaluate `WHERE`, and nothing here relies on it doing so.

## The index sweeper: re-driving failed and orphaned rows (2026-09-15)

The ingest bridge pushes a library item to the retrieval engine the moment it is published, and
records the verdict in `content_items.index_status`. It has one hole, and the bridge's author named
it rather than a reviewer finding it: nothing re-drives a `failed` row, and a restart orphans
`pending`, because the dispatcher's queue lives in memory. If the engine is down for a week, every
item published in that week sits at `failed` and no retrieval covers it until a human republishes
each one by hand. `index_status` was indexed for exactly this sweep.

`internal/service/indexing/sweeper.go` closes it. The sweeper only *finds* rows and hands them to
the dispatcher that already exists; every byte of push, poll and field-recording logic is the same
code the publish path runs, reached through the same `Dispatcher.Submit`. A second implementation
of the push would be a second place for the four index columns to drift out of agreement.

### It runs inside the API process, not as a command

`cmd/assetreap` and `cmd/mailpurge` are operator tools for work that needs a human to decide when
and how much. This is the opposite: the whole point is that nobody has to act. A command would
still leave the gap open until someone remembered to run it, so the sweeper is a goroutine in
`cmd/api`, started only inside the block that already built the dispatcher, and stopped by the same
shutdown context as the mail sender.

### With indexing off it does not exist

`SweeperFor` returns `nil` unless `Config.RetrievalSweeping()` holds, which is
`RETRIEVAL_INDEX_ENABLED` and a base URL — the bridge's own gate — and `RETRIEVAL_SWEEP_ENABLED`.
`Tick` and `Run` are nil-receiver safe, the same shape `Dispatcher.Submit` and `Close` already use,
so a disabled sweeper is not merely quiet: it opens no tenant database and reads no row. The
sweeper is also nested inside the `if dispatcher != nil` block in `main`, so there is no
arrangement of flags that starts a sweeper without the bridge it feeds.

The second switch exists because the sweep and the bridge fail differently. The bridge only ever
touches a school someone is publishing into; the sweep walks every school on a timer. If that walk
ever misbehaves against a particular deployment, an operator needs to stop it without also stopping
new publishes from being indexed.

### Per tenant, through the control plane

`content_items` lives in each school's database, so the sweeper iterates tenants exactly as
`cmd/assetreap` does: list active schools from the control plane, skip any school whose postgres
profile cannot be decoded, skip any school with no bucket, and open the tenant through
`postgres.Registry` so the connection pool is shared with the rest of the process.
`ControlTenants` adds one skip of its own — a school with no CAS tenant slug — for the reason the
bridge already skips it: the engine partitions on the slug and a guess would be baked into a
permanent document id. Skips are logged at debug, because on a five minute timer a school that is
permanently unprovisioned would otherwise produce a hundred thousand warnings a year.

### No lease column, but a real claim

The mail sender coordinates instances with `leased_by` and `lease_expires_at` on `outbox_messages`.
`content_items` has no such columns and this work does not own the tenant schema, so the question
was whether a lease is needed at all.

It is not, for correctness. The engine's re-ingest guard hashes the bytes: a second job for a
document it already holds ends as `duplicate` with nothing re-indexed and the existing
`document_id` returned, which `outcomeOf` already maps to `indexed`. Two instances pushing the same
item burn one upload and settle on the same answer. Wasteful, not corrupting.

It is still worth avoiding, and the existing columns are enough to avoid it. The claim is an
optimistic compare-and-set: set `index_status` to `pending` and `updated_at` to the sweep instant,
where the id matches, the status is still `published`, the index status is still the one that was
read, and `updated_at` is still the value that was read. Whoever wins gets one row back; everyone
else gets zero and moves on.

`updated_at` is maintained by `BaseMixin` on every write, so any other writer — an edit, the
bridge, a concurrent sweep — invalidates a claim that raced it, which is the behaviour we want
rather than a hazard. And because the claim writes `pending` with a fresh `updated_at`, the claimed
row now looks exactly like a freshly pending row to every other instance, so the staleness
threshold below *is* the lease TTL. There is nothing to release: a process that dies mid-push
leaves a `pending` row that goes stale on its own and is swept again.

### `pending` and `failed` are not the same row

A `failed` row is nobody's. It is eligible once `updated_at` is older than
`RETRIEVAL_SWEEP_RETRY_BASE` (default five minutes).

A `pending` row may be a live push in another process right now, and sweeping it eagerly duplicates
work that is about to succeed. The threshold has to exceed how long a legitimate push can take,
which is bounded by `RETRIEVAL_INDEX_POLL_TIMEOUT` (default fifteen minutes) plus the time to
stream the file. `RETRIEVAL_SWEEP_PENDING_AGE` defaults to thirty minutes and is floored at twice
the poll timeout, so raising the poll timeout cannot silently turn live pushes into orphans. The
floor is computed in `withDefaults`, not documented as a rule for operators to remember.

One `pending` is genuinely not ours: the engine parks a restricted PDF awaiting human chapter
confirmation, and `outcomeOf` records that as `pending` with no document id — which is
indistinguishable, in the columns we have, from a row an old process orphaned. The sweeper will
re-push a parked upload once its window elapses, and the engine will park it again. The backoff
below bounds that to a handful of pushes a day rather than one per tick, but the honest fix is a
distinct `index_status` value for parked rows, which needs a tenant migration this work does not
own. It is a known, bounded cost, not an oversight.

### Backoff, and what a restart forgets

A row that fails every time must not be retried every tick forever. Half the spacing is persistent
and free: every attempt ends in a write — `markFailed`, `record`, or the claim itself — so
`updated_at` is the last-attempt time, and the query's cutoff alone guarantees at least
`RETRY_BASE` between attempts across every instance and every restart.

On top of that the sweeper keeps an in-memory attempt count per item and doubles the window to
`RETRIEVAL_SWEEP_RETRY_CAP` (default six hours), with the same halve-and-jitter shape the mail
sender uses, which decorrelates instances that started together. That count is not persisted —
there is no attempt column on `content_items` — so a restart resets a long-failing row to the base
window. It costs at most one early attempt per row per restart, and the persistent floor still
holds. An additive `index_attempts` column would remove the caveat and is the obvious follow-up.

The map is pruned each tick: an entry nothing has re-claimed for a full cap is dropped, since the
row either succeeded or is no longer eligible.

### No circuit breaker, and why that is not the mail sender's answer

The mail sender opens a breaker per school because it holds one SMTP conversation per message
against someone else's server, and hammering it gets the platform blacklisted. Neither half applies
here. The engine is one service, not a hundred schools' servers; and the per-row exponential
backoff already bounds the rate at which any given row can cost an upload, which is the expensive
part. A tenant-level breaker on top would mute a school whose rows are backing off anyway. The
per-tick budget — `RETRIEVAL_SWEEP_BATCH`, default 32, with `RETRIEVAL_SWEEP_PER_TENANT` at 8 —
caps the total, and shares the dispatcher's queue with live publishes rather than starving them:
when the queue refuses a row the sweep marks it `failed` again through the same `Abandon` the
bridge uses, and stops for the tick, leaving the queue to the publishes.

### What the sweeper refuses to look at

The scan takes only published rows that carry an asset. Neither filter is cosmetic. A row that was
published, failed, and then archived was withdrawn on purpose, and re-driving it would put an item
back into retrieval that the school took out — `LabelsForItem` would refuse it anyway, but only
after the claim had already moved the row. A row with no asset has no bytes to send and can only
ever fail again, so without the filter it would cost an attempt every backoff window forever.

### What the tests settle

Against a real tenant database: a `failed` row is re-driven and becomes `indexed` once a stubbed
engine recovers, with the document id and digest written; a `pending` row two hours old is picked
up; a `pending` row one minute old is left alone; a row that failed a minute ago is left alone; an
archived row, an already indexed row, a never-indexed row and a row with no asset are never
scanned; two instances claiming from the same read produce exactly one winner, including the
`pending` case where only `updated_at` distinguishes them; a row claimed this tick is deferred the
next; a row the queue refuses goes back to `failed` rather than sitting in `pending`; one
unreachable school does not stop the others; and a cancelled context ends the tick without
reporting a fault. With the flag off the sweeper is nil, asks for no tenant and submits nothing.

### The document scope is one predicate, and it is the academic one

The fold left `student_documents` with two spellings of its scope: `listDocuments` and `deleteDocument`
narrowed with `access.StudentsForAcademic`, while `reachDocument` — and therefore `verifyDocument` —
narrowed with the wider `access.StudentsFor`. That was reported rather than changed during the fold,
because widening or narrowing a write is a policy decision and not something to settle inside a
mechanical change. It has now been settled: all four consume `documentsVisibleTo`, which is
`entdocument.HasStudentWith(access.StudentsForAcademic(v, d))`.

The reason is the one the table was placed behind the academic gate for in the first place.
`document_type` is free text, so a report card and a birth certificate are indistinguishable to a
predicate; the table is all-in or all-out, and since the flag may only narrow, the safe error is to
include. If documents are academic for reading they are academic for verifying. Two document predicates
is exactly the drift the reach rule exists to prevent — a reach goes through the same query API the
listing uses precisely so the read rule and the write rule cannot come apart.

**No live permission moved, which is why this was safe to do now rather than defer.** `verifyDocument`
requires `core.student_documents.write`, which no guardian holds, and the academic flag only changes the
rendered SQL for a `ReachGuardianWard` viewer — for every other reach `StudentsFor` and
`StudentsForAcademic` are the same predicate. So the change removes a latent disagreement, not a live
one. The latent kind is the dangerous kind: it becomes a bug on the day someone grants that key to a
guardian for a reason that seems fine at the time, and the write path is then quietly wider than the read
path that was reviewed.

`TestEveryDocumentRouteCarriesTheSameScopePredicate` is what makes the two provably one rather than two
that happen to agree today. It drives the listing, the reach that precedes the verify, the verify's own
UPDATE and the delete under a single viewer, strips the leading id term, normalises placeholder numbers
to `$?`, and requires all four scope clauses to be byte-identical.

The fixture is a **guardian-ward** viewer on purpose, and that choice is the whole strength of the test.
Under `ReachSelf` — what the other sweeps use — `StudentsFor` and `StudentsForAcademic` render the same
SQL, so the assertion would have passed against either and proved nothing about which one is in force.
`ReachGuardianWard` is the one reach where `studentsOfGuardian` appends `can_view_academic = true`, so
the two are visibly different statements, and the test additionally requires `"can_view_academic"` to
appear in every one of the four clauses.

Both mutations were run and both bite, for different reasons, which is what the two assertions are for.
Re-inlining `entdocument.HasStudentWith(access.StudentsFor(v, d))` at `deleteDocument` alone fails with
"the delete does not demand the academic gate a guardian's ward documents sit behind"; widening
`documentsVisibleTo` itself fails the same way at the listing, because every caller moves together. The
equality assertion catches a fifth call site that re-derives the rule; the `can_view_academic` assertion
catches the shared expression being changed underneath all of them.

## The sweeper's two schema gaps are closed: `index_attempts` and `parked` (2026-09-15)

"The index sweeper: re-driving failed and orphaned rows" above names two costs it could not pay,
both because they needed a tenant schema change that work did not own: the attempt count behind the
backoff was not persisted, and a parked upload was indistinguishable from an orphan. Both are now
closed by one migration, `20260915175001_add_content_item_index_attempts`. **The two paragraphs
there that describe them as open — the parked-upload paragraph under "`pending` and `failed` are not
the same row", and the last two paragraphs of "Backoff, and what a restart forgets" — are superseded
by this section.**

### One statement of DDL, and why adding an enum value is free

The migration is one line:

    ALTER TABLE "content_items" ADD COLUMN "index_attempts" bigint NOT NULL DEFAULT 0;

There is nothing in it for `index_status`, and that is the fact worth recording rather than the
column. Ent renders an enum on Postgres as `character varying` with **no `CHECK` constraint** — the
value set is enforced by the generated Go validator and nowhere else. `\d content_items` on a live
tenant confirms it: the only check on the table is `content_items_audience_scope`. So adding
`parked` to `index_status` changes no storage, needs no `ALTER TYPE`, cannot renumber or reinterpret
`none`, `pending`, `indexed` or `failed`, and produces no diff for Atlas to emit. The value was
appended to the end of the `Values(...)` list anyway, so the source diff is unambiguously additive
too.

That also settles the rollback question. A binary rolled back to before this change reads a row
written as `parked` without error — ent validates enums on write, not on read — and the string
matches neither arm of the sweep's `failed`-or-`pending` query, so an old sweeper leaves it alone.
The worst case of a rollback is that a parked row is invisible to the old code, which is exactly
what the new code does with it deliberately.

`index_attempts` defaults to 0, so every row that existed before the migration is valid without a
backfill, and a row that has never been swept reads as never attempted rather than as unknown.

### The count is written by the claim, so it cannot drift

`index_attempts` is set in the same optimistic compare-and-set that takes the row — the update that
already required the id, `published`, the index status that was read, and the `updated_at` that was
read. Two consequences fall out of putting it there rather than in a second write. A count can only
advance for an instance that actually won the row, so a race that loses claims no attempt; and the
row the count is derived from is provably current at the moment it is written, because any other
writer would have moved `updated_at` and lost us the claim. That is why `nextAttempt` is
`row.IndexAttempts + 1` and consults nothing else.

The in-memory map survives, holding one thing: the jittered instant at which the sweeper will next
consider a row it has just claimed. It no longer holds a count, because the count on the row is
strictly better information — after another instance drives a row to `indexed` the row says 0 while
memory would still say 5, and backing a freshly failing row off near the cap is the wrong answer.
The map earns its place only through the jitter, which decorrelates instances that started together
and which a value derived from the row alone cannot provide.

So the spacing now has three tiers, each a floor under the next: the query's `RETRY_BASE` cutoff,
which every instance and every restart observes for free; the persistent tier, `updated_at` plus
half the doubled window implied by `index_attempts`, which a process with no memory of the row
applies; and the in-memory jittered instant, which is at least the persistent floor and at most the
full window. `window`, `earliest` and `backoff` are the three names for those, and `earliest` is the
floor `backoff` jitters upwards from — deliberately the same number, so a restart never delays a row
longer than the process it replaced would have.

Reaching `indexed` sets the count back to 0 in `record`, alongside the document id and digest. A row
that succeeds has no history worth holding against it; without the reset, the next time it failed —
a year later, for an unrelated reason — it would start its backoff near the six-hour cap.

A restart still costs a scan: a long-failing row is inside the query's cutoff, so it is read and then
deferred. That shows up as `deferred` in the tick report rather than as a push, which is the whole
point. Pushing the per-row window into SQL would need an expression over `index_attempts` that ent
cannot render portably, and the saving is one row read per backoff window.

### `parked` is a state, not a variety of `pending`

The engine parks a restricted PDF awaiting a human chapter confirmation and reports
`pending_confirmation`. That was recorded as `pending` with no document id, which is precisely what a
row orphaned by a dead process looks like, so the sweeper re-pushed it every window and the engine
parked it again. `outcomeOf` now maps it to `parked`, and `record` clears the document id, digest and
`indexed_at` with it, because nothing of a parked upload is retrievable.

Nothing was added to the sweep query to exclude it. The query is a positive whitelist — `failed`,
stale `pending`, and stale `none` — so any state outside it is excluded by construction, which is the
better property, since a new state has to be opted in deliberately rather than remembered. The test proves the
exclusion by the only means that distinguishes it from an accident: the same fixture, the same age,
the same tick, one row `pending` and one `parked`, asserting that the first is claimed and the second
is not. Adding a `parked` arm to the query fails the parked case while the orphan case still passes.

A parked row now waits indefinitely for a decision at the engine, and nothing in emerge-core polls
for that decision. That is the honest state of it: the sweep's job was to stop re-pushing work that
can never succeed, not to learn when a person confirmed the chapters. Whatever eventually notices a
confirmation will have to move the row out of `parked` itself, and it now has a state to move it out
of.

### `none` is a stranding, not a resting state (2026-09-24)

`index_status = none` means never enqueued. The enqueue fires in the publish handler, so anything
published while retrieval indexing was switched off — or whose handler died between the commit and
`MarkPending` — sat at `none` forever: the sweep re-drove `failed` and stale `pending` only. Two rows
in DPS-NGP were in exactly that state, invisible to search with nothing anywhere reporting a failure,
which is the shape this repository is organised against. `none` is now the third arm of the whitelist.

Its age threshold is `RetryBase`, not `PendingAge`, because the two knobs insure against different
things. `PendingAge` is floored at twice the poll timeout so the sweep cannot steal a row from an
engine job that is still legitimately running. A `none` row has no job in flight; its only competing
writer is the publish handler between the commit and `MarkPending`, which is one store open and one
UPDATE inside a single HTTP request. `RetryBase` clears that by orders of magnitude and makes a
stranded row searchable in minutes rather than half an hour.

The threshold is load-bearing rather than decorative, and the test says so: removing it lets the
sweep claim a row published a minute ago whose enqueue may still be in flight.

Unlike `PendingAge`, `RetryBase` has no configured floor, so a deployment setting it to seconds could
take a row mid-enqueue and push it twice. That was already true of the `failed` arm and is not made
worse here, but it is the reason a floor belongs on that knob too.

### A settle check is only as good as what it does not exclude (2026-09-15)

The rule recorded earlier — *settle on every file that can affect the result before believing a failure* —
was followed and still produced a worthless verification, because of how it was implemented.

The settle loop excluded `internal/ent/generated/**` and `internal/ent/control/generated/**`, on the
entirely reasonable grounds that generated output is noisy and changes for reasons unrelated to the work.
A worker was at that moment running `go generate ./internal/ent/...` after a schema change. The loop
reported "settled", and the verification that followed showed **17 test failures, 2 race findings, and
dozens of unformatted files** — plus, tellingly, `error: size of ...teacher_delete.go changed during
reading`. None of it was real. Re-run without the exclusion, the tree was green.

**The exclusion was the blind spot, and it was chosen deliberately.** That is what makes this worth
recording separately from the original lesson: the failure mode is not forgetting to check, it is
checking everything *except* the one directory you have decided is uninteresting — and a code generator
is precisely the thing that rewrites a hundred uninteresting files at once.

Two practical tells, both present and both ignored at the time. A `size changed during reading` error
from `gofmt` is not a formatting problem, it is a **concurrent writer**. And a failure count that jumps
from zero to seventeen across unrelated packages is a tree-state signal, not seventeen new bugs —
real regressions cluster.

**The rule, tightened: exclude nothing from a settle check.** Noise costs a few extra seconds of waiting;
a blind spot costs a wrong conclusion about whether the work is finished. If a directory is too noisy to
settle on, that is evidence something is writing it, which is the answer the check exists to give.

## `omitempty` on a bool that gates access (2026-09-16)

ent's codegen writes `,omitempty` into every field's JSON tag, bools included. On an informational
bool that is untidy. On `student_guardians.can_view_academic` it was a defect, because that field
gates reads: `access.studentsOfGuardian` adds `entlink.CanViewAcademic(true)` to the predicate, so a
guardian whose link carries `false` cannot reach the ward's enrolments, subject enrolments,
assignments or documents.

The transport layer marshals the ent row itself. `POST /guardians/{id}/students` and the `PATCH`
beside it both answer `response.JSON(w, ..., row)`, and `project()` in `internal/transport/http/fields.go`
builds its map by marshalling that same row. So `omitempty` meant the key vanished from the write
echo at exactly the moment it changed. A client that revoked academic access read back:

```json
{"relationship_type":"mother","is_primary":false,"is_emergency_contact":false,
 "can_pickup":false,"can_view_finance":false,"status":"active"}
```

Every sibling bool present and false; the one the caller had just set, absent. **An access control
whose denied state is invisible over the wire is not observable.** Worse, because `project()` deletes
keys the field policy withholds, an absent key already means "you may not read this" — so the omitted
`false` was ambiguous with a policy denial rather than merely terse.

### Fixed at the schema, not by post-processing

``field.Bool(...).StructTag(`json:"..."`)`` overrides the generated tag, so the fix lives in
`internal/ent/schema/` and survives the next `go generate`. Nothing rewrites generated output.

The change is serialisation only. `go run ./cmd/migrate make ... -plane tenant` answers
`no changes` on both planes and writes no file; the generated footprint is seven struct-tag lines in
`academicsession.go`, `studentaddress.go` and `studentguardian.go`, with no hunk in `migrate/schema.go`.

### Which bools changed, and why the rest did not

The test applied was: **does the system itself produce or enforce this `false` against what the client
asked for?** If so, the `false` is a decision the client must be told about. If the client set it and
can re-read it as the schema default, `omitempty` costs nothing.

Changed:

- `student_guardians.can_view_academic` — gates reads. The whole point of the `PATCH` is to set it false.
- `student_guardians.can_view_finance` — the same kind of grant; it is absent from the predicates only
  because no finance module exists yet. Fixing it alongside its sibling means the field that will gate
  money is not born with the defect.
- `student_guardians.can_pickup` — a safeguarding grant. "This person may not collect the child" is the
  fact a front desk acts on, and "no such setting" is the worst possible reading of it.
- `student_guardians.is_emergency_contact` — "do not call this person" is actionable, and a list where
  nobody carries the flag must be distinguishable from one where the flag was withheld.
- `student_guardians.is_primary` — the weakest of the five on its own merits, changed because the row is
  read as a permission record. A per-field rule inside one object is a trap for whoever parses it.
- `student_addresses.is_primary` — the server demotes the siblings. Creating a primary address issues
  `SetIsPrimary(false)` against rows the client never wrote, and with `omitempty` a refetch of those
  rows is silent about the change.
- `academic_sessions.is_current` — the same shape: `demoteOtherSessions` flips other rows to `false`
  behind the caller's back.

Left omitted:

- `student_assignments.is_primary`, `teacher_assignments.is_primary` — nothing demotes them and nothing
  gates on them. Within a student's or teacher's assignments exactly one carries `true`; "not the primary
  one" follows from the row that is, and nothing acts on it.
- `subjects.is_elective`, `student_subject_enrollments.is_elective_choice` — the client sets these and
  the `false` is the schema default. A consumer wanting one side asks for it (`?elective=true`) or takes
  the complement. The residual doubt is real — "compulsory" is a named state, not an absence — but no
  access decision or server-side mutation turns on the `false`, which is the line drawn above.

### What proves it

`internal/transport/http/guardianlinkjson_test.go` asserts the five grants are present and `false` at
three depths: the marshalled row, `project()` under the route's field policy, and `project()` under a
policy granting only the academic gate (which also checks the tag change did not widen the projection).
A fourth test drives the real `PATCH` against Postgres and asserts the response body echoes
`"can_view_academic": false`.

Restoring `omitempty` on that one field and regenerating fails all four, the last one printing the body
quoted above. No existing test depended on the field being absent — every `can_view_academic` assertion
in the suite is about the SQL text of the scope predicate, not a JSON body.

## A local object store, and the first time the asset lifecycle ran (2026-09-22)

`docker-compose.yml` brought up three Postgres containers and nothing else, while a complete
presigned-upload lifecycle had been built against S3: `POST /library/assets` mints a presigned PUT,
`POST /library/assets/{id}/ready` HEADs the object and checks it against what the row claims,
`GET /library/assets/{id}/link` signs a download, and `cmd/assetreap` removes the objects behind
rows nobody kept. On a stock checkout the first of those answered 503 "this school has no object
store configured" and wrote no row, so the other three had nothing to act on. Every asset request in
the Bruno collection failed, the folder documented the failure as expected, and the whole path had
never been executed once.

### MinIO, pinned, from quay.io

`object-store` runs MinIO rather than LocalStack because the lifecycle leans on two behaviours a
rough S3 impersonation tends to get wrong. The upload binds `x-amz-checksum-sha256`,
`content-length` and `content-type` into the sigv4 signature, so the store has to honour signed
headers rather than merely accept the URL. And `/ready` verifies bytes it never saw by asking the
store for the object's sha256, so `HeadObject` with `ChecksumMode: ENABLED` has to hand back the
digest the upload carried. MinIO does both; it is also one process and one volume, which is the
weight of the three databases already in the file.

It is pinned to `RELEASE.2025-09-07T16-13-09Z` rather than tracking a floating tag, which the
Postgres services do with `16-alpine`. MinIO publishes no stable channel, and the checksum round
trip is precisely the part that moves between releases. A shift there would surface as `/ready`
refusing an upload that worked yesterday, which reads as a defect in our verification rather than
as a change in the store — the most expensive way to be wrong. The images come from quay.io because
MinIO no longer publishes to Docker Hub; `docker pull minio/minio` now fails with "repository does
not exist or may require 'docker login'", which is a misleading way to learn that.

### The bucket is a service, not a step in a README

MinIO creates no bucket on its own, and a store that comes up healthy with an empty namespace is a
worse failure than no store at all. The asset row is written, the presigned PUT is minted and handed
out, and the first thing to complain is the object store itself, answering `NoSuchBucket` to a client
holding a URL it cannot use. The error arrives one hop late and names the wrong thing.

So `object-store-bucket` is its own service: `mc mb --ignore-existing`, gated on the store's
healthcheck, run to completion and exited. It is the service to name when bringing the stack up —
`docker compose up -d control-db tenant-db object-store-bucket` — because it pulls the store in
behind it, and the `api` service depends on it with `service_completed_successfully` so the full
stack cannot reach a state where the bucket is missing. The store's own healthcheck is
`mc ready local`, which the MinIO image can run because it ships `mc` alongside the server.

### One endpoint, two readers

A school's S3 endpoint lives encrypted in the control plane, not in this file, and one value has to
serve two different readers: the API, which calls the store to HEAD and delete objects, and whoever
holds the presigned URL, which is a browser on the host. `http://localhost:9000` is correct from the
host and wrong from inside a container; `http://object-store:9000` is the reverse. Running the API
with `go run` on the host, which is what `api/README.md` says to do, is what lets a single stored
value be right for both. Running the API inside compose would need MinIO reachable under one name
from both sides, and nothing here does that for you.

### `path_style` was never a field

`api/02-control-plane/06-store-s3-credentials.bru` had sent `"path_style": true` since it was
written. The field is `use_path_style` (`internal/domain/tenancy/tenant.go`), and the decoder rejects
unknown fields, so the request answered 422 "the body does not match the s3 credential shape: json:
unknown field \"path_style\"". It had never returned 200. Nothing caught it because the request was
documented as a precondition that could not be met anyway — the missing object store was hiding a
second defect behind it, which is the ordinary way a documented failure goes stale into a covered-up
one.

### What proves it

The sequence below ran against this compose file on 2026-09-22, from an API started with
`PORT=8080 go run ./cmd/api`, for the seeded school `DPS-NGP`.

- `PUT /api/v1/schools/{id}/profiles/s3` with `use_path_style` → 200 `{"stored":true,"key_version":1}`.
- `POST /api/v1/library/assets` for a 55 byte file → 201, `status: pending`, and
  `upload_headers` of `content-length: 55`, `content-type: application/pdf`,
  `x-amz-checksum-sha256: 5H1VzMvOpgqAEugn9kcEL18m+BXAx6Wql/n2dqQ9KOs=` — the digest base64, where
  the request body carried it as hex.
- The presigned PUT with those three headers → 200 from MinIO, echoing
  `X-Amz-Checksum-Sha256` back with `X-Amz-Checksum-Type: FULL_OBJECT`.
- The same PUT with the URL and no headers → refused. Worth recording exactly: MinIO answers 400
  `AccessDenied` "There were headers present in the request which were not signed", not the
  `SignatureDoesNotMatch` real S3 gives. The collection's wording assumed the S3 phrasing.
- `POST /assets/{id}/ready` → 200, `status: ready`, which is the store confirming size and sha256
  against the row.
- `GET /assets/{id}/link` → 200 with a five minute presigned GET; fetching it returned the 55 bytes
  and `sha256sum` matched the digest the asset was created with.
- `DELETE /assets/{id}` → 204, after which `/link` answers 409 "this asset has been deleted" while
  the object is still in the bucket. The tombstone and the object are separate facts.
- `cmd/assetreap -school DPS-NGP -age 1h -destroy` → `REAPED ... deleted object ... while its object
  survived`, `objects 1/1`, and the bucket listed empty afterwards while the row stayed.

One detail the run surfaced about the reaper: `age()` takes `created_at` and only prefers
`updated_at` when it is the later of the two, so backdating `updated_at` alone to force a sweep does
nothing. Both stamps have to move. That is correct — a row cannot have entered `deleted` before it
existed — but it is not obvious from the flag.

## The search half of the bridge: asking the engine, and re-checking its answer (2026-09-22)

The ingest bridge (2026-09-15) was one-way. `IngestFile` and `Job` pushed a document in and polled
until it was indexed, and nothing ever asked a question. A teacher's note could be stored,
catalogued, labelled, indexed — and then nobody could search for it through emerge-core.
`GET /api/v1/library/search` closes that, behind `RETRIEVAL_SEARCH_ENABLED`.

### Read their code first: three things about the engine's API that changed this design

The brief this was built from described a search API that does not exist. The engine's source at
`D:\lms-retrieval-engine` won each disagreement.

**1. No route accepts `visible_scopes`, and a request carrying it is a 422, not a 403.** The plan
was to send the caller's label set with the query and treat a refusal as a hard stop. But
`RetrieveRequest`, `ScopedRequest`, `CoverageRequest` and `api.SearchReq` all set
`ConfigDict(extra="forbid")`, so an undeclared key is a 422 naming it. There is no asserter
credential to hold: it is Task C of `docs/PLAN-EMERGE-CORE-INTEGRATION.md`, a document whose second
line reads "PLAN ONLY — nothing here is implemented".

The direction is in fact inverted. `retrieval_engine/scopes_client.py` is a **pull** client that
calls **our** `GET /api/v1/library/scopes` with the end user's bearer token, and `api._held_labels`
feeds the answer to `api._visible`. So the engine was never going to be told the labels; it was
always going to ask us for them. That client is called by nothing on any query path today
(`_visible` has exactly one caller and no retrieval route passes `held_labels`), so the engine
applies no label gate on a search at all right now.

**2. `/passages/search` and `/retrieve/scoped` do not put a document id on the wire.** `api._serialize`
flattens `Citation` into `document_title`, `render`, `page_range`, `paragraph_range`, `time_start`,
`deeplink`, `confidence` — and drops `document_id`. A re-check keyed on the document is therefore
impossible against those two routes. `POST /retrieve` serializes through `RetrievedPassage`, which
carries the whole `Citation` including `document_id`, and it is the only passage route that also
accepts `document_ids`. That is why this client calls `/retrieve` with `mode: "SEARCH"` rather than
the tutor-facing `/passages/search`. The cost is `_blend_by_document`, which `/passages/search` runs
and `/retrieve` does not: results may be dominated by one book. That is a relevance regression, not
a correctness one, and it is the right trade against not being able to check the answer at all.

**3. `document_ids: []` is not "admit nothing", it is "no filter".** `build_filter` normalises it:
`document_ids=set(document_ids) if document_ids else None`, and `None` is the no-op. So sending an
empty list to say "this caller may reach nothing" would search the entire tenant corpus instead.
`Client.Search` refuses an empty list rather than sending it (`ErrUnscopedSearch`), whole-tenant has
to be named explicitly (`WholeTenant`), and asking for both at once is `ErrScopeContradiction`. The
handler never reaches the client in that case anyway: with nothing reachable it answers zero
passages without a call. `TestSearchNeverAsksTheEngineWhenNothingIsReachable` pins it.

### The pre-filter is document ids, because labels are unsendable

The rejected design was a post-filter alone, and the reasons it was rejected still hold: top-k would
be computed over passages the caller cannot see, so the page is eaten by another section's notes,
relevance thresholds shift with them, and forbidden text crosses the wire on every query. The filter
has to reach the engine *before* ranking.

Since the engine accepts no labels, the caller's visibility goes over in the one term it does
accept: the set of `content_items.engine_document_id` values that `access.LibraryItemsFor(viewer,
decision)` admits. Same predicate, resolved on our side, expressed as ids instead of labels. This is
the curriculum join's own argument (the engine never learns our vocabulary) applied to visibility.

`retrieval.ScopesFor` is still called on every search and is not decoration. It answers a different
question — *is this caller's visibility expressible at all?* — and a `scope_unresolved` or
`scope_pinned_unexpressible` refuses the search through the same `writeScopesErr` that
`GET /library/scopes` uses. A caller whose grants cannot be stated is a caller we must not search
on behalf of. It also decides when no document filter is needed: `Scopes.Unrestricted()` is true
exactly where `LibraryItemsFor` degenerates to `AnyLibraryItem` (unrestricted viewer, or tenant
reach with no pins — a pinned tenant grant raises `ErrPinnedScopeUnresolved` before it can get
here), and `internal/retrieval/agreement_test.go` is what keeps those two in step.

### The second layer, and what a drop means

After the engine answers, every returned `citation.document_id` is looked up again in Postgres under
`LibraryItemsFor`, and a passage whose document does not survive is dropped. The count is on the
response as `dropped.unreachable`.

The re-check cannot be the in-memory set from the pre-filter; it is a second query, and a drop
therefore means the engine returned a document that our database does not admit — a stale stamp, a
tenant partition disagreement, an index that outlived a deletion. The caller gets the safe page and
the count makes the disagreement visible; it is also logged through `observability.Decision` at
`allowed=false`, which is where an operator will see it. `dropped.unidentified` counts passages that
arrived with no document id at all: they are dropped too, because what cannot be identified cannot
be checked.

The layer earns its place on the whole-tenant path as well, where no pre-filter was sent: a document
id that no content item in this tenant claims is dropped there, which is the cross-tenant case.
`TestSearchDropsADocumentNoContentItemClaims` covers it.

### The curriculum join, and the page range

With `curriculum_node_id`, the scope is built from the same machinery
`resolveCurriculumNodeContent` uses — `placementsResolving`, `curriculumNodeLineage`,
`readablePlacedItems`, `placedAssets`, `indexStateOf`, `resolutionOf` — so the search and the
resolution endpoint cannot disagree about what a syllabus point maps to. `include_proposed` and
`include_ancestors` carry the same meaning, including the reason ancestors matter: curriculum-grain
placements are the commonest real mapping.

Stale documents are searched and counted (`scope.stale_documents`), matching `resolutionOf`'s
treatment of stale as resolved; the text may be a revision behind, and saying so beats a silent
omission. Source-deleted and never-indexed placements are skipped.

`RetrieveRequest.page_range` is a single inclusive tuple, but a node resolves to a page range **per
placement**. Sending a merged range would admit the pages between two placements; sending one of
them would hide the others. So the range is sent only when every resolved placement agrees on one,
and page narrowing is always applied here afterwards, counted separately as `dropped.out_of_scope`.
The separation matters: `out_of_scope` is expected narrowing, `unreachable` is a disagreement about
authority, and conflating them would bury the second in the first. A passage with no page at all
(every A/V span has `page_number=None`) is kept, because page narrowing is a relevance filter and
not the security boundary.

**`section_ids` is deliberately not sent.** `content_placements.content_node_id` is our uuid; the
engine's `section_ids` are its own extracted ToC node ids. Asserting the two are the same value is a
guess, and a wrong guess here narrows silently to nothing.

### What the route answers when it cannot search

Four different refusals, four codes, none of them an empty page:

- flag off or no engine configured → **503** `retrieval_disabled`
- the school carries no CAS tenant slug, which the engine partitions on → **409**
  `retrieval_tenant_unmapped`
- the engine is unreachable or 5xx → **503** `retrieval_unavailable`
- the engine refused the request → **502** `retrieval_refused`, and it is never retried

An empty `passages: []` with 200 was the alternative for the first and third, and it is the failure
both repositories keep naming: an outage rendered as "you may see nothing" reads to a teacher as an
empty library and gets reported as an ingest bug. `scopes_client.py` says it about the authorizer;
`_held_labels` says it about a 503; it is the same rule one hop further out. 200 with zero passages
is reserved for the case where it is true — the caller's scope really did resolve to nothing, and
the answer carries `scope.resolution` (`resolved`, `unmapped`, `unindexed`, `restricted`,
`unpublished`, `source_deleted`) so the four causes of an empty answer stay distinguishable.

A 403 from the engine keeps its own error (`indexing.ErrEngineRefusedScope`) and is surfaced rather
than retried. Nothing in this path has a fallback that drops a scope term: a retry without the
filter would answer the caller with a wider corpus than they asked about, which is the one outcome
the two layers exist to prevent.

### A bound rather than a truncation

An unscoped search by a caller who is not unrestricted resolves their reachable documents and caps
at 500, then refuses with **409** `search_scope_unbounded` and a pointer to `curriculum_node_id`.
This is `placements_unbounded`'s argument on a second endpoint: a truncated document filter searches
a subset of the caller's library without saying so, and a wrong filter is worse than no answer.
Unrestricted callers never hit it, because they send no document filter at all.

### Not done, and why

The caller's bearer token is **not** forwarded to the engine. `scopes_client.py` wants the end
user's token so it can call `/library/scopes` back, and that seam is what lands with the engine's
Task B — but forwarding a user credential to another service is its own decision, it buys nothing
today (no retrieval route passes `held_labels`), and a credential sent before it is needed is a
credential exposed for no reason.

## `/auth/me` returns an identity, not a person row (2026-09-22)

Two endpoints served the same row and promised different things about it. `GET /api/v1/persons/{id}`
returns `project(row, decision.Fields)` — the caller's own `core.persons.read` field policy applied
to the row. `GET /api/v1/auth/me` returned `conn.Client.Person.Get(...)`, the raw ent row, with no
policy anywhere near it. A school that redacts `status`, or `metadata_json`, or a guardian-only
field from `core.persons.read` had that redaction honoured on one route and ignored on the other.
The row was the caller's own, so the stakes are lower than a leak about someone else — but a school
is entitled to redact a field from a person's own view, and `/auth/me` was overriding that intent.

### Why the obvious fix does not fit

`/auth/me` is deliberately not behind the authorization guard. `server.go` wires it with
`authenticate()` and `OptionalTenant` only, never `s.can(...)`, because a "who am I" call that 403s
when the caller lacks `core.persons.read` is useless, and it is the first call every client makes.
So there is no `decision` in hand and therefore no `decision.Fields` to project with.

Putting the route behind the guard to get one was the alternative considered and rejected. It keeps
the full row, but it makes the one endpoint that must always answer depend on a policy lookup that
can fail, and it forces a choice for the caller who holds no such grant: answer nothing, which
breaks login, or answer the unprojected row, which is the bug again.

### What it does instead

`/auth/me` stops claiming to return a Person. It returns `personIdentity` — id, first name, middle
name, last name, display name, email, phone, profile photo asset id, status — the fields a client
needs to know who it is talking to, and nothing else. Two rules hold it to the same promise as
`/persons/{id}`:

- Every attribute in that subset is put through the same `project()` the persons route uses, against
  the same `core.persons.read` field policy. A field the school redacts is absent from both routes.
- The policy lookup is best-effort and fails **closed**. If the guard errors, or the caller holds no
  `core.persons.read` grant at all, the policy used is an empty include list — which permits nothing
  and leaves only `alwaysReadable`. The endpoint still answers 200 with `cas_user_id`, `school` and
  `roles`; the person block degrades to its id. That inverts the failure mode of the guarded design:
  a policy source that is down narrows the answer rather than widening it or refusing it.

The invariant the test defends is containment, not equality: every key `/auth/me` returns for the
caller's own row is a key `/persons/{id}` also returns, carrying the same value. It is one-directional
because the identity subset is deliberately narrower than the row.

### Who can see what, stated plainly

`/auth/me` returns, unconditionally, identifiers of the caller's own records — person id, and the
staff, teacher, guardian and student ids it already returned under `roles`, all resolved from the
tenant database with no grant consulted. Those are not governable and never were: they are how a
client addresses itself, and withholding them makes the session unusable. What is now governed is
every *attribute* of the person: names, contact details, photo, status. A school's
`core.persons.read` field policy decides those, on this route exactly as on the persons route.

Row reachability still differs between the two routes, and that is intended rather than an oversight.
`/persons/{id}` applies `person.For(viewer, decision)`, so a caller whose reach does not include
their own row gets a 404 from it while `/auth/me` still answers. The agreement being defended is
about which *fields* are exposed, not about which rows are reachable; you can always see that you
exist.

### The response shape changed

`person` on `/auth/me` no longer carries `created_at`, `updated_at`, `cas_user_id`, `date_of_birth`,
`gender`, `metadata_json` or `edges`. `cas_user_id` is unchanged at the top level of the response,
where it comes from the token rather than the row, so nothing that read it there is affected.
Anything wanting the full record asks `GET /persons/{id}` and gets it properly projected.

### What the test proves

`authme_test.go` seeds one person in a real tenant transaction, points the same caller at both
handlers with one guard supplying one field policy, and compares the two bodies key by key across
four policies: unrestricted, an include list, an all_except list, and an include list that permits
nothing. It also asserts the identity subset is a subset — `/persons/{id}` returns `date_of_birth`
and `metadata_json` where `/auth/me` does not — and that a caller with no `core.persons.read` grant
still gets a 200 carrying `roles` and a person block narrowed to its id. Reverting the projection
fails it on `GET /auth/me leaked "email", which this policy redacts`.

## Counting the tests that prove nothing about scoping (2026-09-22)

The transport package's fixture drivers record every statement and hand back `d.tables[table]` with
the `WHERE` clause never evaluated. A test that asserts "this caller sees only its own rows" against
that driver passes whether the predicate narrows, widens, or admits nothing at all. Nobody knew how
many tests were in that position, so this is the count and the method.

### The method: mutate the predicate, watch what stays green

Four mutants were applied to production code, one at a time, each restored sha256-identical
afterwards:

- `lib-null` — `access.LibraryItemsFor` and `LibraryItemsWritableBy` return `NoLibraryItem()`
- `lib-widen` — both return `AnyLibraryItem()`
- `asset-null` — `assetsVisibleTo` and `assetsDeletableBy` return `entasset.IDIn()`
- `asset-widen` — both return `anyAsset()`

A separate probe build put a `println` in the same four functions and each test was run alone, so
the denominator is not a guess: 75 of the 311 tests executed the library predicate, 39 executed the
asset predicate.

A test is *real* if at least one mutant of the predicate it exercises turns it red. It is *vacuous*
if it executes the predicate and survives both directions.

### The number

Before: 41 of the 75 tests that reach the library predicate survived both library mutants, and 26 of
the 39 that reach the asset predicate survived both asset mutants. Most of those 41 and 26 are not
scoping tests at all — they exercise paper pairing, field policy, upload verification — and merely
pass through the predicate on their way. The dangerous subset is smaller, and it is the subset whose
*subject* is reachability:

- `TestGetAssetTheViewerCannotReachIsNotFound`, `TestDeleteAssetOnAnAssetTheViewerCannotReachIsNotFound`,
  `TestLibraryItemThatTheViewerCannotReachIsNotFound` and `TestPaperOnAnItemTheViewerCannotReachIsNotFound`
  each asserted a 404 with the table left empty. The 404 was produced by the absence of a row, not
  by the predicate, and every one of them passed with the predicate deleted.
- `TestGetAssetReturnsTheRow`, `TestListAssetsAnswersTheAssetsItFound`,
  `TestGetAssetLinkPresignsTheRowsOwnKey` and the `markAssetReady` happy paths assert a 200 on a
  seeded row. They pass with the predicate made unsatisfiable, which is exactly the shape of the
  `markAssetReady` defect that shipped: an endpoint nobody can reach, with a green test beside it.

After the changes below: 31 of 81 and 20 of 45. The mutant kill counts across the package went from
27/16/11/10 to 45/20/23/18.

### Assets are settled against Postgres, not against a cleverer fake

`assetsVisibleTo` is `HasContentItemsWith(...) OR uploaded_by = me`, and the `EXISTS` arm is a
correlated subquery. `libraryReachable` refuses to evaluate `EXISTS` — correctly, because a fake
that evaluates a predicate *wrongly* is worse than one that visibly ignores it. `assetVisibleUnder`
in `library_test.go` is the hand-rolled approximation that fills the gap, and it was unsound in the
one direction that matters: it looks for `EXISTS (` and `uploaded_by = $n` by string search, so a
predicate that had collapsed to `FALSE` read to it as "unscoped" and every row stayed visible. It
now refuses a `WHERE` carrying `FALSE`, and `TestTheAssetGateHonoursTheWhereClause` pins all five
answers it can give; deleting the refusal fails it with `want false for "assets"."id" = $1 AND
FALSE, got true`. That is the general hazard with making a fake cleverer, caught in the fake that
one worker had already written.

So asset reachability is now proved in `assetreachdb_test.go` the way placement reachability is
proved in `placementdb_test.go`: a real tenant transaction, five seeded assets, and a restricted
viewer. The upload behind a school-audience published document is reachable, the one behind a
stranger's private note is not, the one behind no document at all is not, and deleting demands
ownership rather than mere readability. Five of the six die under `asset-null`, all six under
`asset-widen`.

### `RowsAffected` was only half fixed

`libraryResult.RowsAffected` no longer returns a constant 1 for `DELETE`, but `affected` looked only
for `DELETE FROM "`, so every `UPDATE` still reported one row written. `libraryWrittenTable` now
recognises both, which matters because the soft delete of an asset is an `UPDATE` and so is every
scoped patch.

### The scope that admits nothing

Making the fake honest about `UPDATE` turned nine subtests red, and the reason is worth recording.
Under `narrowEverything` the fixture's viewer has no staff, teacher or student row, so the scope for
most tables is legitimately `WHERE "t"."id" = $1 AND FALSE`. `narrowedBeyondTheID` and
`scopedBeyondID` accept that: `FALSE` is, after all, "more than the id". Thirteen of the sixteen
scoped-delete cases and nine of the sixteen scoped-update cases were emitting a predicate that
admits nothing, and the tests called it scoping.

Each case now records whether its scope collapses, and `scopeRefusesEverything` asserts the recorded
answer. The flag is not decoration: a predicate that starts refusing everything — the
`markAssetReady` failure mode — now fails the case that says it should not, and a predicate that
stops refusing fails the case that says it should. `TestEveryScopedDeleteCarriesItsScopeInTheDeleteItself`
and `TestEveryScopedUpdateCarriesItsScopeInTheUpdateItself` previously died under one mutant
direction each; both now die under both.

### What is still vacuous

Thirty-one tests still execute the library predicate and survive both its mutants, and twenty do the
same for assets. The ones worth converting next, in order: the `markAssetReady` and `getAssetLink`
happy paths in `library_test.go`, which assert a 200 on a row the predicate may no longer admit; the
`TestUpdateLibraryItem*` family, whose write scope is never evaluated; and
`TestReadLibraryItemCarriesThePaperInline`. The rest are field-policy, validation and
paper-pairing tests that touch the predicate incidentally and are better left alone than converted.

## The capability endpoint: the catalogue, narrowed to the caller (2026-09-23)

`catalog.Build()` had no caller. The note above records that as a finding of the unreachable-capability
sweep, and `REMAINING-PLAN.md` records leaving it unpublished as a deliberate choice. A dashboard is now
being built against this service, so the information finally has a consumer, and
`GET /api/v1/capabilities` serves it.

### It describes; it never decides

This endpoint answers "what would the guard permit this caller to do". It is not an authorization
decision and nothing may treat it as one. Every route stays gated by `s.can(...)`, every write stays
gated by `rejectUnauthorizedFields`, and every read stays projected through `decision.Fields`. A handler
that consulted the capability list instead of asking the guard would be consulting a *copy* of the
answer, computed with `nil` attributes at a different moment, against a policy set that may have been
refetched since. That is a second authorization system with none of the inputs of the first.

Concretely: the capability list is computed from `guard.Allow(ctx, subject, entity, nil)` — no row
attributes. Handlers that pass attributes (the per-row grants in `FieldsForRow`, anything conditioned on
`section` or `grade_level`) can legitimately reach a different answer for a specific row than this
endpoint reports for the entity. The endpoint tells a UI which forms and fields to draw. Whether a
particular row may be written is still decided, per request, by the guard.

### Narrowed to the caller, not a dump

The response is `catalog.Build()` intersected with the entities the guard actually allows this caller.
An unnarrowed dump would tell a student what a principal may do: the catalogue carries names and
descriptions for all 112 entity keys, including `core.schools.delete` and the whole `_all` breadth
surface.

The narrowing is one line — the `held` lookup in `capabilitiesFrom` — so it was mutated away and
watched. With the lookup removed, `TestTwoCallers...` failed with both callers reporting the same
112 keys and the message "the catalogue is not being narrowed to the caller";
`TestEveryReportedCapabilityWasAllowedByTheGuard` named each leaked key individually
(`teacher was reported "core.guardians.delete_all", which the guard refused`); and
`TestACallerHoldingNothingGetsAnEmptyListNotTheCatalogue` printed a caller with zero grants being
handed the entire catalogue with `"all": true` on every entity. The file was restored
sha256-identical (`010e5537c7045ef9fa082e0d8033d56f08cf33760e2da7a58db645b39486ace2`).

Asking what you may do is not itself a privilege, so the route carries no `s.can(...)`. A caller holding
nothing gets `200` with an empty list. It does sit behind `RequireTenant`, because grants are
tenant-scoped: `policyKey` is `(user, tenant)`, and the same person can hold different grants in two
schools.

### The nil `FieldPolicy` trap, and the shape that avoids lying about it

`(*FieldPolicy).Permits` returns `true` on a nil receiver: no policy means *every* field, not no field.
An endpoint that reported "the fields this caller may write" as a bare list would therefore be at risk
of reporting `[]` where the true answer is "everything" — a control that fails in the safe-looking
direction, and a UI that hides inputs the user was allowed to fill.

So `fields` is three values, not a list:

- `all` — `decision.Fields.Unrestricted()`. True when the grant carries no field policy. When this is
  true the caller may write every field of the entity, *whether or not the list below enumerates them*.
- `enumerated` — whether the catalogue can name this entity's columns at all.
- `permitted` — the catalogued columns this grant permits, computed through `Permits`, so a nil policy
  yields every column rather than none.

`enumerated` exists for the areas pinned fieldless in `catalog_test.go`. `core.schools.read` has no
`areaColumns` entry — deliberately, because `school_profiles` shares `name` and `status` with `schools`
and adds ciphertext columns — so its `permitted` is empty for a caller who may write everything. Without
`enumerated`, that empty list is indistinguishable from "restricted to nothing". With it, a UI reading
`all: true, enumerated: false` knows to draw the form it would have drawn anyway. Delete entities land
in the same state for a different reason: deleting a row names no columns.

The fields reported are the *column* fields only. `catalog.Build` also carries `reach`, `section` and
`grade_level` on every narrowable entity, and those are rule-authoring vocabulary for CAS — what a
policy author may write a condition about — not inputs on a form. `Entity.ColumnFields()` drops them;
`TestTheReportedFieldsAreDataColumnsNotPolicyVocabulary` asserts none of them reach a caller.

### Breadth is three-valued

`scopeFor` decides "unrestricted" by asking whether the caller holds the area's `_all` key with no row
constraints. `breadth` reports the same computation, from the decisions already gathered, so it costs no
extra guard call: `school_wide` when the `_all` key is held unconstrained (or when the entity *is* an
`_all` key), `narrowed` when the area has an `_all` key the caller does not hold that way.

The third value is the point. Five areas — `schools`, `academic_sessions`, `reference`, `sections`,
`subject_offerings` — have no breadth key at all, and neither does `student_guardians` or any `create`
verb. Reporting `narrowed` for `core.sections.write` would tell a UI the caller is limited by something
that does not exist, so those report `not_applicable`.

### Why it asks the guard directly rather than through `scopeFor`

`scopeFor` is how the rest of the package obtains a decision, and this endpoint deliberately does not use
it. `scopeFor` does two things: it asks the guard, and it resolves an `access.Viewer` — a dozen tenant
queries establishing which sections, offerings and wards the caller reaches — so that a query can be
narrowed. This endpoint runs no query. Calling `scopeFor` once per catalogue entity would resolve that
viewer 112 times to use none of it. The decision half is the identical call,
`guard.Allow(ctx, subject, entity, nil)`, which is the line `scopeFor` itself makes.

The 112 `Allow` calls are cheap — the policy set is cached per `(user, tenant)` and each call is an index
lookup plus an expression eval — but each one emits an `observability.Step` line from the guard. A
dashboard polling this endpoint will produce 112 log lines per poll. Silencing that means a quieter
variant of `Guard.Allow` or a batch entry point on the guard, neither of which exists; it is recorded
here rather than worked around.

### What the tests prove

Twelve in `capabilities_test.go`, built on two callers with disjoint-but-overlapping grants. The one that
matters asserts in both directions: the teacher is not told it holds `core.students.write`,
`core.students.read_all`, `core.staff.read_all` or `core.schools.read`; the principal is not told it
holds `core.student_notes.read` or `core.sections.write`; and on the one entity both hold —
`core.students.read` — the teacher sees exactly `admission_number` and `status` while the principal sees
every catalogued column. A single caller getting a plausible answer would have proved none of that.

Three in `narrowing_test.go` cover the two helpers added to the catalogue package: `Split` reassembles
every key it produced and refuses foreign services, and `ColumnFields` drops exactly the reserved
vocabulary from a narrowable entity while leaving an area with no breadth key untouched.

### `X-School-Id` now carries three namespaces, and the resolution order is the safety property

`RequireTenant` resolved `X-School-Id` as a school UUID or, failing that, as a school `code`.
`Registry.GetByCASTenant` (`postgres/tenant.go:86`) had existed all along with **no caller anywhere in
the repo** — the seventh instance in this project of something built, tested and unreachable. It had a
downstream cost: `/auth/me` returns the CAS tenant **slug** and nothing else, so a frontend holding only
what CAS told it could not address its own school and had to be handed a configured school id instead.
The header now falls back to the slug.

**A slug and a code can collide, and nothing prevents it.** This was checked rather than assumed:

- `code` is `NotEmpty` / `MaxLen(32)` / `Unique` / `Immutable`, and every write site — `schools.go:89`
  and `cmd/seed/main.go:131` — passes it through `strings.ToUpper(strings.TrimSpace(...))`. So a code is
  always an uppercase-normalised string, but "uppercase" is a convention of the write sites, not a
  constraint: nothing in the schema or the database rejects a lowercase code.
- `cas_tenant_id` is `Optional` / `Nillable` / `MaxLen(63)` / `Unique`. Its documented shape
  `^[a-z0-9][a-z0-9_-]{0,62}$` lives **only in a column comment**. No validator, no normalisation, no
  trimming: `POST /schools` and `PATCH /schools/{id}` store whatever string arrives, and when CAS
  provisioning fails `ensureTenant` logs a warning and keeps the row (`schools.go:719`).
- The two unique indexes are per-column. Neither is checked against the other.

So `cas_tenant_id = "DPS-NGP"` on one school while another school holds `code = "DPS-NGP"` is a legal
database state, reachable through the public admin API in two calls. `TestACodeThatIsAlsoAnotherSchoolsCASSlugReachesTheCodeOwner`
constructs exactly that and it saves without complaint. Note too that even a
**well-formed** slug can collide: a slug with no letters (`"12345"`) equals its own `ToUpper`, so it is
also a legal code. The uppercase convention is not a partition.

**The order is code-before-slug because that is the only order that is purely additive.** The fallback
runs only when the primary interpretation returned `ErrUnknownSchool`, so:

- Every value that resolved before this change resolves to the **same school** after it. A colliding
  value reached the code owner yesterday and reaches the code owner today; this work does not move it.
- The fallback can only turn a 404 into a hit, never move a hit. And because `cas_tenant_id` is unique,
  the fallback's own resolution is exact — there is no school it could mistake for another.

Slug-first would invert that: a colliding value would silently start reaching a different tenant, which
is a cross-tenant read. The test fails with that reasoning in its message if the order is flipped.

**Why the slug path does not additionally require a matching `tenant_id` claim.** The claim is optional
(CAS omits it for anyone reaching more than one school — see the section above on why that is a signal
rather than an omission), so a guard conditional on it would be no guard at all. It does not need to be
one here: mis-resolution is impossible on the slug path, because the school reached is by construction
the unique owner of the value the caller sent. Gating it would instead lock out every multi-school
caller. Note also that a school reached BY its slug always carries a non-empty `cas_tenant_id`, so on
this path the second emptiness guard at `tenant.go:49` can never be the one that skips.

**What remains open, and it is a write-time problem, not a read-time one.** The residual hazard is
pre-existing and unchanged in mechanism: a caller intending school B's slug is served school A when
`A.code == B.slug` and A carries no `cas_tenant_id` for the cross-check to fire on. What changes is
exposure — callers will now put slugs in this header, so a trap that existed in theory becomes reachable
in practice. The durable fix belongs where the ambiguity is created, not where it is read: reject a
`cas_tenant_id` that equals an existing school's `code` (and vice versa) in `createSchool` /
`updateSchool`, and validate the slug against its own documented regex while there. Doing it at read
time would cost a second control-plane query on every request — `GetByCode` is already uncached and runs
per request — to defend against a state that should never have been storable.

**Failing closed was checked too.** The fallback discards its own answer only when that answer is
`ErrUnknownSchool`, so a value naming nothing keeps the byte-identical 404 it had before, down to the
`unknown school: code %q` in the log line. A school found by slug but suspended or profile-less still
reports `403 school is not active` / `503 no database profile` rather than flattening to 404.

## Closing the code/slug ambiguity at the write, not at the read (2026-09-23)

The section above ends by naming the residual hazard and saying where the fix belongs: `createSchool`
and `updateSchool`. This is that fix.

### The ambiguity, stated as an invariant

`X-School-Id` resolves a UUID, then a school `code`, then a `cas_tenant_id` slug. Two independent
per-column unique indexes made each namespace internally unambiguous and said nothing about the pair.
The invariant the header needs is stronger than either index: **one string must address at most one
school.** Nothing enforced it, so school B could hold `cas_tenant_id = "DPS-NGP"` while school A held
`code = "DPS-NGP"`, and a caller sending that value reached A.

The uppercase convention on `code` is not a partition and was never going to be one. It is a convention
of the write sites (`schools.go`, `cmd/seed/main.go`), not of the schema or the database, and a
letter-free value such as `12345` equals its own uppercase, so it is simultaneously a well-formed code
and a well-formed slug. `TestCreateSchoolRefusesACaseFoldedCollision` is built on exactly that value
class.

### Why the comparison folds case

The resolver compares with SQL `=`, so only an exact byte match can actually mis-resolve today. A
case-sensitive guard would be the minimal guard that closes what is reachable right now. It folds
anyway, for three reasons:

1. **The convention the fold defends is the one that makes the namespaces look separate.** Codes are
   uppercased by convention and slugs are lowercase by convention; a case-sensitive check is green
   precisely when that convention holds, which is to say it never fires on the pairs the convention is
   supposed to be keeping apart. It would only catch the collision after someone had already broken the
   convention — the guard would be strictly downstream of the thing it depends on.
2. **Two spellings of one identifier reaching two different schools is the bug, even when SQL says they
   differ.** With `A.code = "DPS-NGP"` and `B.slug = "dps-ngp"`, `X-School-Id: DPS-NGP` reaches A and
   `X-School-Id: dps-ngp` reaches B. Nothing in the API tells the caller which case it wanted, and no
   error is raised in either direction.
3. **It survives a plausible future change to the resolver.** Case-sensitivity of the lookup is an
   implementation detail. Anyone who later makes the header forgiving — uppercasing `raw`, switching to
   `EqualFold`, moving the column to `citext` — would silently make every one of those pairs live. A
   folded write-time guard means that change stays a usability change rather than becoming a
   cross-tenant read.

The cost is refusing some pairs that are not ambiguous today. That cost is a 409 at creation time with
a message that says which value to change, which is the right side to be wrong on.

**The fold is deliberately not self-exclusive.** A school whose own `code` and `cas_tenant_id` fold
together is fine — both spellings reach the same school, so the invariant holds — and refusing it would
make such a school unsaveable by its own PATCH. `otherSchool` therefore excludes the row being updated,
and `TestUpdateSchoolAllowsASchoolToKeepItsOwnSlug` fails with a 409 if that exclusion is removed.

**`EqualFold` on a slug containing `_` needed checking, not assuming.** ent renders `EqualFold` as
Postgres `ILIKE`, and `_` is a single-character wildcard there. It escapes the pattern before binding
it, so `a_b` does not match `AXB` — but that is a property of ent's builder, not of the predicate's
name, and `_` is inside the documented slug alphabet.
`TestCreateSchoolTreatsAnUnderscoreAsALetterNotAWildcard` pins it: it creates `AXB<tag>` and then a slug
`a_b<tag>`, and expects the second create to succeed.

### The slug shape is now checked, because it was documented and unchecked

`^[a-z0-9][a-z0-9_-]{0,62}$` lived only in the column comment. A documented constraint that nothing
enforces is worse than an undocumented one, because a reader budgets for it. `POST` and `PATCH` now
reject anything that does not match, with a 400 naming the shape.

It trims first, matching what `name` and `code` already do in the same handler, and it does not
normalise beyond that. Lowercasing a mixed-case slug on the caller's behalf would be a silent rewrite of
a foreign key into CAS — the slug has to be the string CAS itself holds, and quietly changing it is how
you end up provisioning against the wrong tenant. Reject and say so.

This also closes a smaller pre-existing oddity: `"cas_tenant_id": ""` used to store an empty string,
which the unique index then reserved for exactly one school. It is now a 400. (Nulling an existing slug
back out is still not expressible through PATCH — a JSON `null` decodes to a nil pointer, which means
"unchanged". That is untouched here.)

### Why this is not in the schema, and what part of it should be

Two separate questions, with different answers.

**The cross-namespace uniqueness cannot go in the schema.** This repo does express invariants as
`entsql.Checks` — `content_items_audience_scope` and the three on `outbox_messages` and
`content_placements_grain_node` — but every one of those constrains a single row against itself. This
one is a statement about *other rows*: "no other school's `code` folds to this school's slug". A CHECK
constraint cannot see other rows, and a single index cannot span two columns with union semantics. The
honest options in Postgres are a trigger or an exclusion constraint over a computed union, and neither
is this codebase's idiom — there are no triggers in `migrations/`, and the migration story is
Atlas-diffed from the ent schema, which has no vocabulary for either. So a write-time check in the
handler is the only place this rule can live today, and the residual is the usual one: a concurrent
insert or a direct SQL write can still create the pair. That is a real limitation and is stated here
rather than papered over. In practice `POST /schools` is an operator action measured in units of one per
school, so the race is theoretical in a way the ambiguity was not.

**The slug regex, by contrast, does belong in the schema** as `field.String("cas_tenant_id").Match(...)`.
That would make it a `ValidationError` on every write path, including `cmd/seed`, which writes
`SetCasTenantID` straight through ent and bypasses the handler entirely; `writeControlEntErrFor` already
maps `IsValidationError` to a 400, so the HTTP behaviour would be unchanged. It is not done in this
change for a mechanical reason: adding `Match` requires regenerating `internal/ent/control/generated`,
whose tree is currently mid-flight. Doing it later is additive and needs no migration — ent validators
run only on fields being set, so existing rows stay saveable, and the one live slug (`cms`) already
matches. Until then, `cmd/seed --cas-tenant` remains an unchecked write path.

**`updateSchool` checks only one direction, and that is complete rather than lazy.** It passes an
empty `code` to `addressingClash`, because `code` is `Immutable` and does not appear in
`updateSchoolRequest` at all — there is no PATCH that can move a code onto another school's slug. The
only way the pair can be created through PATCH is by moving a slug onto an existing code, which is the
direction it does check.

### What the existing rows say

Checked before writing the guard, because a new refusal on `updateSchool` that makes a live row
unsaveable is a migration problem wearing a validation costume. The control plane holds one school:
`code = "DPS-NGP"`, `cas_tenant_id = "cms"`. No collision, and `cms` already matches the documented
shape. Nothing to migrate.

### What the tests prove

Both directions of the collision are constructed through the API and watched being refused —
code-then-slug (`TestCreateSchoolRefusesASlugThatIsAlreadyAnotherSchoolsCode`) and slug-then-code
(`TestCreateSchoolRefusesACodeThatIsAlreadyAnotherSchoolsSlug`) — plus the PATCH route into the same
state, which additionally reads the row back to confirm the refused value was never written.

Each guard was mutated away and the suite rerun: disabling the slug-side check, the code-side check, the
regex, the case-folding (`CodeEqualFold` to `CodeEQ`), and the self-exclusion each turns exactly the
tests that name that guard red, and nothing else. The case-folding mutant is the one worth recording:
with `CodeEQ`, `"COLL-<TAG>"` and `"coll-<tag>"` are accepted as a code/slug pair, which is the
collision this section exists to prevent.

## Timetable, attendance and rooms: a pattern with no dates (2026-09-23)

Twelve new tenant tables, no HTTP and no access predicates yet. The whole design turns on one
decision taken from how PowerSchool, Gibbon, openSIS, Fedena, Arbor and Toddle actually store this:
**nobody materialises period occurrences.** The timetable is a pattern with no dates on it. What gets
materialised instead is the calendar day — one row per date saying whether school is in session — and
that is where holidays and closures live. Every other choice here follows from refusing to create a
row per period per date.

### The tables and their grain

| table | grain |
| --- | --- |
| `rooms` | one physical space in a branch |
| `period_schemes` | the period grid for a band of grades, in one branch and one session |
| `period_scheme_grade_levels` | which grade levels follow that grid |
| `periods` | one abstract column of the grid — "Period 3" — with no times on it |
| `bell_schedules` | one day-shape variant of a scheme: Regular, Saturday, Exam |
| `bell_schedule_periods` | the times a variant gives to a period |
| `calendar_days` | one date in one branch: open or closed, and why |
| `calendar_day_schedules` | which bell schedule a band follows on that date |
| `timetables` | one date-ranged, publishable version of a scheme's timetable |
| `timetable_slots` | one pattern row: day-of-week x period x section |
| `attendance_days` | one student on one date — the authoritative register |
| `attendance_periods` | one student in one period on one date — optional |

### Why `periods` carries no times

The obvious factoring puts start and end on the period, and makes a Saturday variant a second set of
periods. That breaks the timetable: a slot would have to name a period belonging to a specific day
variant, so the Saturday pattern and the weekday pattern become disjoint row sets that cannot share a
subject, a teacher or a room reference.

Splitting the period from its times — PowerSchool's factoring — means a slot names `period_id`
abstractly and the times resolve per date through `calendar_days -> calendar_day_schedules ->
bell_schedules -> bell_schedule_periods`. A Saturday that runs only four periods is then expressed by
the Saturday bell schedule simply having no row for periods five to eight. A slot pointing at period
seven on a Saturday resolves to no time and drops out of the join. That is self-consistent and needs
no extra state.

Verified live: the same `periods` row P1 carries 09:05–09:45 under the Regular schedule and
08:30–09:00 under the Saturday one, with a single pattern above both.

### The grade band is membership, not a label

`grade_levels.education_stage` exists as an optional free-text string, and the brief asked whether
that is the band. **It is not, and it must not become one.** It is `Optional().Nillable()`, so a
required grouping key built on it has no value for some grades; it has no referential integrity, so a
typo silently creates a new band; and this codebase has already been bitten by exactly this with
`role_type`. `education_stage` stays what it is — a descriptive label for reporting.

The alternative usually reached for is a `grade_bands` entity with `grade_levels.grade_band_id`. That
was rejected too, for a reason that is not about tidiness: **grade levels are not session-scoped.** A
band FK hanging off `grade_levels` cannot express a school changing its bell structure next year
without rewriting the grade rows, and it makes the band a global fact when the thing it exists to key
is session- and branch-local.

So the band is the membership set of a `period_scheme`: `period_scheme_grade_levels` joins a scheme to
its grade levels, with `academic_session_id` and `branch_id` denormalised onto the join row so the
real invariant is expressible as a unique index — **within one branch and one session, a grade level
follows exactly one period scheme.** Denormalising the two ancestor keys onto a join row to make a
unique index reachable follows `student_subject_enrollments`, which does the same thing for the same
reason.

### Time of day: minutes from midnight, not `time`, not `timestamptz`

There is no time-of-day column anywhere else in this codebase — every `field.Time` is a Postgres
`date` or a `timestamptz` — so this sets a convention rather than following one.

`timestamptz` is plainly wrong: a period has no date, and the type would invite a UTC instant to be
stored for something that is a wall-clock rule. Postgres `time` is the type-correct answer and was the
first choice, but it reads back into Go as a `time.Time` carrying a meaningless date, which every
consumer then has to know to ignore, and ent has no first-class notion of it. The failure mode is a
driver or a `Format` call quietly applying a location to a value that never had one.

`start_minute` and `end_minute` as `bigint` minutes from midnight are totally ordered, subtract to a
duration without ceremony, express the range invariant as an ordinary CHECK, and are honest about
being a scalar rather than an instant. Rendering is `m/60` and `m%60` at the edge, with no timezone
question to get wrong. The cost is that `SELECT` shows `545` and not `09:05`, which is a real
readability loss and is accepted deliberately. `1440` is the upper bound so a period may end at
midnight.

### What `schools.timezone` now means

`schools.timezone` is stored, defaulted to `Asia/Kolkata`, and read by nothing; there is no
`time.LoadLocation` in the tree. This design is its first real consumer, and it is worth being precise
about where, because the answer is narrower than "everywhere".

Nothing in these twelve tables stores an instant that needs interpreting. Periods are minutes with no
date; attendance and calendar rows are `date`; only `marked_at` is a `timestamptz` and it is
provenance, not meaning. **The timezone is load-bearing in exactly one place: deciding which `date` a
thing belongs to.** The server runs UTC. A register marked at 00:30 IST is 19:00 UTC on the previous
day, so a handler that reaches for `time.Now()` to default today's date will file the mark against
yesterday for the first five and a half hours of every Indian school day, and the unique index on
`(student_id, attendance_date)` will then happily accept a second, contradictory row later that
morning. The same applies to "which period is running now".

It is not wired here — this layer has no clock. The requirement is stated so the layer that does have
one does not have to rediscover it: resolve `time.LoadLocation(school.Timezone)` and take the date in
that location.

### The clash unit is not the section

Grade XI runs Physics, History and Commerce in the same period; a section legitimately has three slots
at once. A unique constraint on `(timetable, section, day, period)` would reject every senior
timetable in India, so there is none. The uniqueness that does exist is
`(timetable_id, section_id, day_of_week, period_id, subject_offering_id)` — which forbids only the
literal duplicate — and it was watched accepting three concurrent electives for one section in one
period, then rejecting the fourth row that repeated one of them.

That index has a hole: `subject_offering_id` is nullable, and Postgres lets NULLs repeat in a unique
index, so two label-only slots ("Assembly") in the same section and period are not refused. Left
unenforced knowingly; it is a cosmetic duplicate, not a correctness one.

**Teacher and room clashes are not enforced in the database at all**, and cannot be. The real
predicate is "no two slots that are in force on the same date share a teacher", and what is in force
depends on `timetables.effective_from`/`effective_to` ranges in another table. That is an exclusion
constraint over a date range, which neither ent nor the Atlas diff has vocabulary for. There are
covering indexes — `(timetable_id, teacher_id, day_of_week, period_id)` and the same for `room_id` —
so the check is one index scan, but the check itself belongs in the service layer and is not written
yet. Stating it rather than implying the schema is safer than it is.

### Attendance does not depend on the pattern for its meaning

Arbor documents the naive design's failure in its own help centre: *"do not change the times of the
current class, as these changes will also affect previous classes and existing attendance marks"*, and
*"You won't be able to delete timetable slots if you've begun to take attendance."* Their workaround —
end-date the slot and make a new one — is date-ranged versioning reinvented as a support article.

So `attendance_periods` carries its own `attendance_date`, its own `subject_offering_id`, its own
`period_id` and its own `status`. `timetable_slot_id` is **nullable and is provenance only**, with
`ON DELETE SET NULL`. Gibbon does exactly this; PowerSchool denormalises the date onto the attendance
record and says in its own documentation that it is for performance; Fedena keys on
`(date, subject, timing)`.

The test that matters: a published timetable with three slots and a period attendance row pointing at
one of them, then `DELETE FROM timetables`. The slots cascade away, and the attendance row survives
with `status = 'present'` and `attendance_date = 2026-04-06` intact and `timetable_slot_id` nulled.
The timetable is editable after attendance exists, which is the entire point.

**One deletion is deliberately blocked, and it is a different one.** `attendance_periods.period_id` is
required, so deleting a `periods` row that has attendance against it raises a foreign key violation.
That is correct and is not the Arbor problem: a *slot* is an editable pattern row and must be freely
deletable, but "Period 3" is the grid column the mark is *about*, and a mark against a deleted period
means nothing. Periods carry a `status` and are deactivated instead. Verified: the delete is refused
by name.

`timetable_slots.subject_offering_id` was moved off ent's default. Ent defaults a nullable FK to
`SET NULL`, which here would null the column and then re-evaluate
`timetable_slots_subject_or_label`, so deleting an offering would surface as a baffling check
violation instead of a foreign key one. It is `NO ACTION` explicitly: an offering that is timetabled
cannot be deleted, it is deactivated. This is the second instance of the trap already recorded under
"no cascade is not the same as ent's default" — that note is about `SET NULL` degrading a row's
meaning; this is the same annotation degrading a row into an unsatisfiable check.

### Half days are two facts

`attendance_days` has `forenoon_status` and `afternoon_status`, both nullable enums, and no fractional
value anywhere. A student present in the morning and absent after lunch is two marks. A school that
only marks once a day sets one column and leaves the other NULL; the CHECK
`attendance_days_half_present` requires at least one to be set, so a row that asserts nothing cannot
exist.

`calendar_days` mirrors it with `forenoon_open` and `afternoon_open` booleans. A half-day holiday is
`forenoon_open = true, afternoon_open = false` — not a `day_type` of its own, and not 0.5 of anything.

There is no separate `is_instructional` column: it is exactly `forenoon_open OR afternoon_open` and a
stored copy would be a second source of truth. `day_type` is a *label* — `instructional`, `exam`,
`event`, `holiday`, `weekend`, `vacation` — and the booleans are authoritative. Only the clearest
contradiction is constrained, `calendar_days_instructional_open`: a day labelled instructional must
have at least one half open. The rest of the label/boolean combinations are left unconstrained on
purpose, because they are all defensible — an `event` day may or may not run classes, and a school
that calls a morning-only Diwali eve a `holiday` is not wrong.

### The register needs neither a timetable nor a calendar row

`attendance_days` has no FK to `calendar_days` and none to anything timetable-shaped. It stores a
plain `attendance_date`. A school that never takes period attendance stores nothing beyond the
register and needs no period scheme, no bell schedule and no timetable to mark it. Making the calendar
a lookup rather than a dependency is the same principle as the nullable slot reference: **the
authoritative record must not borrow its meaning from an editable one.**

The cost is that nothing stops a register row being written against a declared holiday. That belongs
in the service layer as a warning, not in the schema as a refusal — schools do mark attendance on
days they later declare closed, and the register is the thing that wins.

### Versioning, and what the partial index does not cover

`timetables` is the version: `effective_from`, nullable `effective_to`, a `status` of
`draft | published | superseded | archived`, and a `supersedes_id` self-reference following the
`curricula` idiom. Editing a live timetable means publishing a new version that starts tomorrow, not
mutating slots under existing attendance.

`timetables_effective_range` enforces `effective_to >= effective_from`. The unique index on
`(period_scheme_id, effective_from) WHERE status = 'published'` stops two published versions of one
scheme starting on the same day. **It does not stop them overlapping** — non-overlap is a `daterange`
exclusion constraint, which is out of reach here for the same reason the teacher clash is. The partial
index is the largest part of the invariant that is expressible; the remainder is a service-layer
check, and saying so is better than leaving the index looking like it means more than it does.

`bell_schedules` has a partial unique index on `(period_scheme_id) WHERE is_default`, so a scheme has
at most one default variant. Verified by flipping a second schedule's flag and watching it refused.

### `periods_per_week` is demand; slots are supply

`subject_offerings.periods_per_week` already existed and was unused — the schema was reaching for
this. It is left exactly as it is, as the **planning target**: what the offering wants. The count of
`timetable_slots` for that offering in a published timetable is what it actually got. They are not
constrained to agree and must not be — the gap between them is the most useful diagnostic a timetable
builder has ("Physics wants 6, this draft gives it 5"), and collapsing it into an invariant destroys
the report. Reconciling them belongs in the service layer.

### Rooms, and the column that was a placeholder

`sections.room_id` was a bare UUID with no entity and no FK. `rooms` now exists, scoped to a branch,
and `sections.room_id` is a real foreign key with `ON DELETE SET NULL` — deleting a room unassigns it
as a section's home room rather than destroying the section.

Adding an FK to a populated column can fail on existing rows, so it was checked first rather than
assumed: the one live tenant has 7 sections and **0 non-null `room_id` values**, so the constraint
validated against an empty set. A tenant that had been writing arbitrary UUIDs into that column would
have needed those rows cleaned before this migration would apply. The migration is additive — one
`ALTER TABLE ... ADD CONSTRAINT` and one index on `sections`, and twelve `CREATE TABLE`s — and
reversible by dropping them.

`timetable_slots.room_id` is separate and also `SET NULL`: a section's home room and the room a
particular period meets in are different facts, and the lab period should not have to lie about
either.

### Where each invariant lives

Enforced by CHECK: the bell time range, the timetable effective range, a slot having a subject or a
label, an attendance day asserting at least one half, an instructional day being open.

Enforced by unique index: one register row per student per date; one period mark per student per date
per period; one period scheme per grade level per branch per session; one sequence and one code per
period within a scheme; one default bell schedule per scheme; one bell time per period per variant;
one calendar day per branch per date; one bell schedule per band per calendar day; one published
timetable per scheme per start date.

Enforced in Go only, per the house convention that enums are `character varying` with no CHECK:
every enum, and `day_of_week` bounded to 1–7 ISO (single-column, so Go-side).

**Deliberately not enforced:** teacher and room clash (needs a date-range exclusion constraint);
non-overlapping published timetable versions (same); a register row on a declared holiday (the
register must win); duplicate label-only slots (NULLs escape the unique index); band-level closure
differing from branch-level closure, which is expressible only by omitting a `calendar_day_schedules`
row and is not modelled further.

### What was actually run

`go generate ./internal/ent/...`, `go build ./...`, `go vet ./...`, `gofmt -l cmd internal pkg` and
`nocomments.py` all clean. The generated migration was read in full before applying and contains
exactly the twelve tables plus the two intended `sections` changes — no unrelated index churn.
Applied to `DPS-NGP`.

Sixteen invariants were then exercised as SQL against the live tenant inside a rolled-back
transaction, using real seed rows, each one asserted in the direction it should go. Every
must-be-accepted case succeeded and every must-be-rejected case was refused by the constraint named
above. Reading the DDL would not have caught a `SET NULL` that fires a check violation, or the fact
that three concurrent electives survive the unique index; watching the database refuse things is the
only way those were established.

One operational note, since it cost a cycle: **`cmd/migrate make` takes `-plane` before the name.**
`migrate make add_x -plane tenant` parses `-plane` and `tenant` as positional arguments, joins them
into the migration name, and silently writes
`..._add_x__plane_tenant.sql` against both planes. The correct form is
`migrate make -plane tenant add_x`.

### Deviations: the thirteenth table, and the two keys that must differ (2026-09-23)

The section above was written before the full research landed. One thing in it was missing outright
and two were right but under-argued. The correction that matters: **the trigger for materialising an
occurrence is a deviation, not an attachment.**

An earlier framing had occurrences materialising once attendance or a lesson plan bound to one. The
arithmetic kills it: one branch over one session is ~70,400 period occurrences, and since nearly every
occurrence eventually has attendance against it, "materialise on attachment" produces the
fully-materialised table by March — with the added cost of a race between the attendance write and the
occurrence write. `timetable_deviations` therefore holds a row **only where a date departs from the
pattern**: a cancellation, a substitution, a room change, a time change, an added make-up class. For a
40-section branch that is ~1,920 slot rows per version, ~220 calendar day rows per session, and a few
thousand deviations. Read-time resolution is a join, not a problem, and it was run: see below.

**The attachment key is a split, and the split is the whole design.**

- Things *about the pattern* — cancellation, substitution, room change — key on `(slot_id, date)`.
  `timetable_deviations` does exactly this, with a unique index on the pair.
- Things *about the class on a day* — **attendance**, and later lesson plans and homework — key on
  `(subject_offering_id, date, period_id)` and must not require the slot. `attendance_periods` already
  did this; the supporting index was widened from `(subject_offering_id, attendance_date)` to
  `(subject_offering_id, attendance_date, period_id)` so that lookup is exact rather than a scan.

The two sides get **opposite delete semantics, and that is the point rather than an inconsistency**:

    timetable_slots -> timetable_deviations   ON DELETE CASCADE
    timetable_slots -> attendance_periods     ON DELETE SET NULL

A cancellation of a slot that no longer exists asserts nothing, so it dies with the pattern. A mark
that a child was present asserts something that remains true regardless of what happened to the
timetable, so it survives with a nulled provenance pointer. Watched live in one transaction: deleting
one slot took its deviation to zero rows, left the added make-up class (which has no slot) untouched,
and left the attendance row with `status='present'` and `timetable_slot_id` nulled.

The cascade has one operational consequence worth stating plainly: **superseding a timetable version
preserves its deviations, deleting one destroys them.** History survives because the old version is
kept at `status='superseded'` with its slots intact. A version that is genuinely deleted takes its
per-date exceptions with it, which is correct — they were exceptions to a pattern that no longer
exists — but it means "delete the version" is never the right way to revise a live timetable.

**`kind` is discriminated by CHECK, not by hope.** Five constraints, each watched refusing its case:
a substitution with no substitute, a room change with no room, an added class that names a slot, a
cancellation that names none, and a time change whose end is not after its start. The added-class rule
is the ContentPlacement grain idiom again —
`(kind = 'added' AND slot IS NULL AND offering IS NOT NULL) OR (kind <> 'added' AND slot IS NOT NULL)`
— a single constraint enforcing both directions of the same dichotomy.

**Three more nullable FKs had to be moved off ent's `SET NULL` default, and the reason generalises.**
`room_id`, `substitute_teacher_id` and `subject_offering_id` all appear in CHECK constraints on this
table. `SET NULL` would null the column on a parent delete and then re-evaluate the check, turning a
foreign key violation into an unintelligible check violation — and, worse, leaving the row
unsatisfiable. The general rule, now at four instances across this file and `content_placements`:

> **Any nullable FK column that appears in a CHECK constraint must not be `ON DELETE SET NULL`.**
> Ent's default for a nullable FK *is* `SET NULL`, so this always has to be written out explicitly.

Rooms, teachers and offerings referenced by a deviation are consequently undeletable; all three carry
a `status` and are deactivated instead.

**The concurrent-electives lesson applies here too, and nearly got lost.** The natural unique key for
an added class is `(section, date, period)` — and that is wrong for exactly the reason a slot's key is
wrong: Grade XI can legitimately add two make-up classes for two different subjects in the same
period. The partial unique index is
`(section_id, deviation_date, period_id, subject_offering_id) WHERE timetable_slot_id IS NULL`,
and it was watched accepting the second offering and rejecting the repeat of the first.

**Occurrence identity without materialisation.** An occurrence is `(slot_id, date)`. Where the API
wants one opaque handle, derive it as UUIDv5 over that pair rather than storing a column — a stored id
would be redundant state that only exists for rows that happen to deviate. Verified in Go with the
`github.com/google/uuid` already in the tree, so no new dependency:

    var occurrenceNS = uuid.MustParse("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
    uuid.NewSHA1(occurrenceNS, []byte(slot.String()+"|"+date.Format("2006-01-02")))

Stable across calls, distinct per date, `VERSION_5`, and computed for a slot that has **no** deviation
row — which is the property that matters: addressable without materialised. This helper is not written
into the tree here because it belongs to the transport or domain layer, neither of which this change
owns. The namespace constant and the exact `slot|date` byte layout are recorded here so whoever adds
it does not invent a second, incompatible derivation. Postgres cannot check this: `uuid-ossp` is not
installed in the tenant containers, so `uuid_generate_v5` does not exist and the derivation must stay
Go-side.

**Holidays are the absence of an in-session day.** There is no holiday table and there must never be
one; it would be a second source of truth for a fact `calendar_days` already holds. The rule, stated
because the earlier section left it ambiguous:

> A date is in session for a branch **iff** a `calendar_days` row exists for `(branch, date)` **and**
> the relevant half is open. No row means no periods.

A named holiday is therefore a row with both halves false — that is the same fact plus a display
label, not a competing representation. A short Saturday or an assembly Monday is a different
`bell_schedule` on that date, not a branch in code, which is the real argument for the day carrying a
schedule reference at all. This codebase puts that reference on `calendar_day_schedules` rather than
as a column on the day, because the grid is scoped to a **grade band**: one branch-day can have
primary on a short schedule and seniors on the regular one, which a single column cannot express.

That grade-band scoping is the one place this design knowingly departs from the researched shape,
which scopes the grid to branch plus session. The seven-table reference shape was treated as evidence
rather than as a design for that reason.

### Read-time resolution, run

The claim that no occurrence table is needed is only worth what the query is worth, so it was written
and run against the live tenant for Monday 2026-04-06:

    calendar_days
      -> calendar_day_schedules          (which band runs which bell schedule that date)
      -> timetables                      (the published version in force on that date)
      -> timetable_slots                 (day_of_week = EXTRACT(ISODOW FROM date))
      -> bell_schedule_periods           (the times that variant gives that period)
      LEFT JOIN timetable_deviations     (on slot_id AND date)

It returned three rows for the section — one `cancelled`, two `as_patterned` — with times resolved at
545/585 from the bell schedule and the deviation's overrides coalesced over the pattern's. Zero
occurrence rows exist for that date or any other. The date range predicate on `effective_from` /
`effective_to` is what makes a mid-year revision a non-event: the same query on a date after the
revision picks the newer version with no change to the query.

### What was run for this part

`go generate ./internal/ent/...`, `go build ./...`, `go vet ./...`, `gofmt -l cmd internal pkg`,
`nocomments.py` (211 files) — all clean. The migration was read before applying and contained exactly
the new table plus the one intended `attendance_periods` index swap. Applied to `DPS-NGP` as
`20260922195302_add_timetable_deviations`. Fifteen further invariants exercised as SQL in a
rolled-back transaction against real seed rows, each asserted in the direction it should go; every
must-accept succeeded and every must-reject was refused by the constraint named above. Full suite
green under `-race`.

## Four CAS areas for the timetable surface, and why attendance is one of them (2026-09-23)

The requirement was blunt: "attendance mark has to be cas feature like permission wise and so on".
Thirteen new tables landed and none of them were addressable by a policy. A caller either reached the
handler or did not; there was no key an administrator could grant, and no field they could name.

### The partition

Thirteen tables became four areas — `timetable`, `attendance`, `rooms`, `calendar`. The line between
them is not table count. It is what a rule about the area would mean, and whether the same sentence
would still be true of every table inside it.

`timetable` holds period schemes, their grade-level attachments, periods, bell schedules, bell
schedule periods, timetables, slots and deviations. Eight tables, one sentence: this is the pattern of
the school week and the exceptions to it. Nobody grants the right to edit periods but not bell
schedules; a period whose code changes and a bell schedule that no longer references it are the same
edit seen twice. Splitting them would mint keys that always travel together, and a key that is never
granted alone is a key an administrator has to remember to grant twice.

`attendance` is separate, and that separation is the point of the whole change rather than an
accident of it. Attendance could have been a verb on `timetable` — the mark hangs off a period and a
slot, so the join is right there. It is a different area because the two answer different questions
and are held by different people. The timetable is authored once a term by an office, reviewed,
published, and then mostly read. A mark is written daily, by a class teacher, about a named child, and
it is the record a parent disputes. A school that wants its teachers to mark their own classes and
read nobody else's, while the timetable stays read-only to them, cannot say that if attendance is a
verb on `timetable`: `core.timetable.write` would hand them the master pattern along with the
register. The converse is worse — an office that builds timetables would acquire the right to rewrite
attendance history. One key cannot mean both "arrange the week" and "assert this child was absent on
Tuesday".

`rooms` takes read, write and delete with no `_all`, the shape `reference` already has. A `_all` key
exists to widen a narrowed read, and narrowing is only meaningful where a row relates to the caller.
A room relates to a branch. There is no reading of "the rooms this caller is related to" that is
narrower than all of them, so there is no wide key for a narrow key to widen. Minting one would leave
`core.rooms.read` and `core.rooms.read_all` denoting the same set, which is the kind of key that reads
like a misconfiguration when a grant of the narrow one turns out to be sufficient.

`calendar` — calendar days and their schedule attachments — takes the same three verbs for the same
reason. A holiday is a property of a branch and a date. It is not related to a person, so there is
nothing to narrow it by. It is a separate area from `timetable` because a calendar day is what makes
the pattern apply or not apply on a given date, and the people who declare holidays and exam days are
usually not the people who arrange the week's periods.

### Which table each area offers as constrainable fields

`areaColumns` names one ent `Columns` slice per area, and every column in it becomes a field a rule
author can pin in CAS. When one area covers several tables, the choice is a judgement about collision:
a field key offered under an area must mean the same thing whichever of the area's tables the rule
ends up governing. `reference` is pinned fieldless in `fieldlessAreas` for exactly this reason — its
five tables collide on `name`, `code` and `status` while meaning five different things.

`timetable` offers `timetable_slots`. That looks arbitrary among eight tables until the column names
are compared. Slots carry `timetable_id`, `section_id`, `period_id`, `day_of_week`,
`subject_offering_id`, `teacher_id`, `room_id` and `label`. Every one of those names that also appears
elsewhere in the area — `period_id` on bell schedule periods, and `section_id`, `period_id`,
`subject_offering_id`, `room_id` on deviations — refers to the same thing there as it does on a slot.
A rule pinned to `section_id = X` governing both a slot and its deviation is coherent; it is what a
reader of that rule would expect. `timetables`, by contrast, would have offered `status`, and `status`
means `active`/`inactive` on period schemes, periods and bell schedules but
`draft`/`published`/`superseded`/`archived` on a timetable. One rule naming it would silently reach
into four different value domains. `TestTimetableOffersNoStatusColumn` holds that line; pointing the
entry at `timetables` makes it fail with the reason.

`attendance` offers `attendance_periods`, because that is where the per-class mark lives and the
per-class mark is what the requirement was about. It carries `status` — the mark itself — along with
`student_id`, `subject_offering_id`, `period_id`, `teacher_id`, `attendance_date`, `reason_code`,
`source` and `marked_by`. Eight of those names appear on `attendance_days` too and mean the same
thing, so a rule written about the period register reads correctly if it ever governs the daily one.
Three do not carry over: `attendance_days` has `section_id`, `forenoon_status` and `afternoon_status`,
and none of the three can be pinned by a rule today. `section_id` is the notable one — a rule cannot
say "the daily register for this section" by column. The narrowing vocabulary covers the common case,
because `section` is a row field and `attendance` is narrowable, so the pin exists there instead. If
the daily register later needs field-level rules of its own, the honest fix is a fifth area rather
than swapping the entry, since swapping it would take `status` away from the period mark.

`rooms` and `calendar` are each one table plus, in calendar's case, a join table whose only columns
are three foreign keys. `calendar_days` is the one with anything worth pinning — `day_type`,
`calendar_date`, `branch_id`, `forenoon_open`. `calendar_day_schedules` shares no column name with it
beyond the server-owned three, so nothing is silently governed; it is simply not constrainable, which
is the correct answer for a row that holds no facts of its own.

### The stale handoff document

`docs/CAS-KEYS-TO-REGISTER.md` claimed 111 keys across 20 areas. The true figure before this change
was 112 across 21: `core.student_guardians.write` was registered in code and had no section in the
document at all. An unregistered key fails closed, so the effect was that nobody could be granted the
right to link a guardian to a student, and the symptom would have read as a broken endpoint rather
than as a missing registration. The document now lists 130 keys across 25 areas and its key list was
diffed against `AllEntities` rather than counted by hand.

### What was run for this part

`go build ./...` and `go vet ./...` over the whole module, both clean. `gofmt -l` clean on the three
touched Go files. `go test ./internal/authorization/... ./internal/authorization/catalog/...` green,
including the invariants that already existed — every area either has columns or is pinned fieldless,
every `areaColumns` entry belongs to a live area and resolves to something, every narrowable area
exposes the reach and row fields, and the `go/ast` test that every declared constant is registered.
The two new assertions were mutation-tested rather than merely run: pointing `attendance` at
`attendance_days` and `timetable` at `timetables` makes exactly those two tests fail with the reasons
quoted above, and nothing else in the suite notices, which is why they were worth writing.

## `can_view_academic` now gates `WardOfferingIDs` too, reversing an earlier boundary (2026-09-23)

The 2026-09-14 note above drew the flag's boundary at "records, not content" and left
`WardOfferingIDs` ungated on purpose, stating that "the ward arms in `curriculum.go` and the
`WardOfferingIDs` that `enrolledScope` derives are therefore left ungated, and that is a boundary
rather than an oversight". **That paragraph is now overturned.** `enrolledScope` uses
`StudentsOfGuardianAcademic`, and a guardian barred from academic records carries no ward offerings.

### Why the earlier boundary failed on its own terms

The same note gates `student_assignments` with the rule "a gate that a second listing walks around is
not a gate", because that table carries `section_id` and `subject_offering_id` and would republish the
enrolment facts the other three tables hide. `WardOfferingIDs` *is* the ward's active elective set,
and it reached three live consumers:

- `libraryWardArms` and `libraryPersonalArms`, which become `audience = offering AND
  subject_offering_id IN (...)`, reached from nine call sites across `library.go`, `placement.go`,
  `resolve.go` and `search.go`
- `addWard` and `addPersonal` in `internal/retrieval/labels.go`, which push the same ids into the
  retrieval label set

A barred guardian could therefore enumerate their ward's exact subject choices from a library listing
or a search, which is the enrolment fact `student_subject_enrollments` gating exists to withhold. The
timetable work made this legible rather than creating it: its ward arm is
`subject_offering_id IN WardOfferingIDs`, so the response *is* the elective set with no inference step.

### Why curriculum was not the same case

`curriculumWardArms` unions every curriculum at the ward's grade with the curricula of
`WardSubjectGrades`, and `WardSubjectGrades` takes its grade from the offering's section's grade — the
grade the broad arm already admits in full. The second arm is a subset of the first, so the union
discloses the grade, not the picks, and gating it changes nothing observable. The exception is an
offering whose section carries no active enrolment for the ward, where the subset relation breaks.

### What a barred guardian keeps

The flag may only ever narrow, and it narrows one disjunct of an OR. `libraryBaseArms` is
unconditional on `PersonID`, so school-wide content and the guardian's own uploads survive. The self
disjunct in `enrolledScope` is a separate arm, so a guardian who is also a student keeps
`EnrolledOfferingIDs` intact. Retrieval returns fewer hits rather than an error. Curricula, the child,
and the child's contact details are untouched — a barred guardian is still a guardian.

### Evidence

`TestWardOfferingsVanishWhenAcademicAccessIsWithdrawn` builds its own fixture inside the rollback
transaction, because the demo tenant could not supply one: there is exactly one active subject
enrolment in the current session and its student has no guardian link, and `enrolledScope` additionally
requires `HasAcademicSessionWith(IsCurrent(true))`, which the neighbouring attendance fixtures do not.
The first draft of the test passed against a guardian carrying zero offerings either way; it was the
"proves nothing" guard that caught it, not the assertion.

Reverting line 207 to `StudentsOfGuardian` makes the test fail with the offering id it leaked, and
nothing else in the suite notices — the whole `internal/...` tree was green both before and after the
one-line change, which is the measure of how invisible this was.

## The class stream and assignments, built to the architecture document (2026-09-23)

`Emerge_Final_SchoolOS_Database_Architecture_v2.3.pdf` (98 pages, the page headers say v1.0) specifies
both domains. Section 12 gives `stream_posts`, `stream_targets` and `stream_comments`; section 10 gives
`assignments`, `assignment_targets`, `assignment_items`, `assignment_submissions` and
`assignment_submission_items`. Eight tables, one migration, `20260923101649_add_stream_and_assignments`.

An earlier pass built this as `announcements` with a `subject_offering_id` XOR `section_id` pair and a
check constraint enforcing exactly one. That was wrong twice over: wrong names, and wrong shape. The
document is explicit that the audience is a separate table — "the post row itself is school-wide;
audience campus scope is expressed via `stream_targets`" — and the XOR made the thing the multi-target
design exists for, one post reaching 8-A and 8-B, impossible.

### Target rows are a union, never an intersection

Two rows `{grade: 9}` and `{offering: maths-9a}` on one post mean "everyone in grade 9 OR everyone in
that class". They never mean the intersection. Spelling that out because the intersection reading is
the intuitive one and it is nearly the whole school wrong in the other direction.

The read predicate is one correlated `EXISTS` with an `OR` inside it:

    HasTargetsWith(Or(arm, arm, ...))

ent's `HasTargetsWith(p1, p2)` would AND p1 and p2 against the *same* target row, which is a different
thing again; the arms are folded into a single `Or` before they are handed over, so there is exactly
one predicate. No `And` appears anywhere between target rows on the read path. Because it is an
`EXISTS` and not a join, a post matching two of the caller's arms comes back once rather than twice;
`TestTargetRowsAreAUnionNeverAnIntersection` asserts both halves, the union and the absence of the
duplicate.

The **write** path is deliberately the opposite quantifier, and it is the only place a universal
appears:

    HasTargets() AND NOT HasTargetsWith(NOT (Or(arm, arm, ...)))

A post is writable only if there is no target on it the caller could not have addressed. Without that,
a teacher names their own class and 9B in the same row and the whole post becomes theirs to edit.
`HasTargets()` is the other half: a row with no targets has no audience and no owner, so a narrowed
viewer can never write it. Creation is checked the same way, target by target, before the row exists,
and a post naming one unreachable target is refused entirely rather than silently trimmed.

### The final target types

`stream_targets.target_type`:

| value | means |
| --- | --- |
| `school` | every member of the school; matches for any caller holding a person record |
| `branch` | one `branches.id`; see the gap below |
| `grade` | one `grade_levels.id`, every section under it |
| `section` | one `sections.id`, every pupil enrolled in it |
| `offering` | one `subject_offerings.id`, which is (subject x section x session) |
| `student` | one `students.id` |

`assignment_targets.target_type` is `section`, `student`, `offering`, exactly as the document lists it.

### Why `subject` was dropped in favour of `offering`

The document lists `school/branch/section/subject/student` for `stream_targets`. "All students in
class 9 that study maths" spans several offerings — 9-A Maths, 9-B Maths — because an offering is
subject x section x session. So the phrase is neither a bare `subjects` row nor a single offering.

It could have been modelled as `{grade: 9}` plus `{subject: maths}` meaning "grade 9 AND maths", and
that is precisely the implicit intersection the union rule above forbids. Under the union those two
rows mean "everyone in grade 9 OR everyone doing maths anywhere", which is most of the school. A
`subject` type can only be given a useful meaning by reference to the post's *other* rows, and a target
type whose meaning depends on its siblings is not a target type. So it is gone.

"Class 9 Maths" is N `offering` rows on one post. That is what the multi-target join table is for and
it needs no new semantics. The expansion from the phrase to the N ids is the caller's job, not a stored
one, so nothing goes stale when a section is added to grade 9 — the next post simply carries one more
row.

The read side is built for that expansion. `target_id` on the list endpoints takes a comma-separated
list, capped at 200, so a UI that resolved "Class 9 Maths" to nine offering ids asks once rather than
nine times; a malformed id in the list is a 400 rather than a silent drop. `stream_targets` carries
`(target_type, target_id, post_id)` so the offering-to-posts direction is index-only, and the unique
`(post_id, target_type, target_id)` serves the correlated `EXISTS` in the other direction.
`assignment_targets` carries the same pair.

### Two deviations from the document, both requested

The document's list for `stream_targets.target_type` is, verbatim, **`school/branch/section/subject/student`**.
Its sibling `calendar_targets` lists `school/branch/section/student`. Against that baseline:

1. **`grade` added.** Neither table has a grade level. It is the level a subject head actually works
   at; without it "Grade 8 science week" has to be fanned out to every section of grade 8, and that
   fan-out is then what the write quantifier has to police on every edit.
2. **`offering` added, `subject` removed.** Reasoning above. `offering` is not an invention — the
   document already uses that exact value in `assignment_targets` — but it is not in the
   `stream_targets` list, and `subject` being dropped is a removal from it.

Both are deliberate and both were asked for. Anyone diffing the schema against the PDF will find these
two differences and no others in the target enums.

### Posting breadth is the grant's scope, not a role

There is no head-of-department role and none was invented. `core.stream_posts.write` at
`reach=teacher_assignment` resolves to the offerings the caller teaches and the sections they are class
teacher of. The same key at `reach=tenant` carrying a `grade_level` pin resolves to every section under
that grade, every offering under those sections, and the grade row itself — which is "assign them
access to all sections in CAS" expressed as a scope rather than a role name. Unpinned tenant reach plus
`core.stream_posts.write_all` reaches the `school` target. The lever is the constraint machinery that
already exists in `internal/authorization/constraint.go`; nothing was added on either side.

`branch` is the gap. `rowFields` registers only `section` and `grade_level`, so a branch-scoped grant
has no constraint to translate into a predicate. A `branch` target is writable and readable only at
unpinned tenant reach, and a narrowed viewer matches nothing for it, which fails closed. Registering
`branch` as a row field touches every area's constraint translation and was out of scope here.

### Targets are a join table, and that changes the access shape

A predicate of `(*Viewer, Decision)` is pure, has no database handle, and every existing reach resolves
to ids already sitting on the `Viewer`. `target_id` is a bare UUID with no foreign key, because what it
names depends on `target_type`; a pupil's section and grade are not on the `Viewer` (only a teacher's
are); and the pins on a grant are codes such as `grade_level=G8`, not ids. With a real edge you would
join and be done. With `target_id` there is nothing to join, so the ids must be in hand before the
predicate is built.

So the step is split. `access.ReadableAudience(ctx, v, d)` and `access.WritableAudience(ctx, v, d)` do
the impure half — at most three queries — and return an `Audience`: branch, grade, section, offering and
student id sets, an `All` flag for tenant reach, a `School` flag for the school-wide target, and the
caller's own and ward pupil ids kept separately. The predicate builders take only the `Audience` and
stay pure and unit-testable against rendered SQL, exactly like `curriculum.go`.

This is a deliberate deviation from the `XFor(v, d)` signature every other domain uses. It is recorded
rather than hidden: that shape assumed a foreign key the document does not give us.

### How a pupil is stopped from grading themselves

Two layers, and the mutation testing shows they are genuinely independent.

The first is the reach switch in `audienceRoles`. A pupil holding `core.assignment_submissions.write`
at self reach gets a read audience and an empty *write* audience, so `AssignmentSubmissionsGradableBy`
has no target arms, the predicate is `WHERE FALSE`, the update matches zero rows, and the handler
answers 404 — never 403, which would confirm the row exists.

The second is `exceptKinSubmissions`, which ANDs `NOT (student_id IN kin)` onto the gradable predicate
at every reach, including tenant and including an unrestricted grant. `kin` is the caller's own pupil
records plus their academic wards. This layer does not depend on the grant being right: a pupil
mis-issued tenant reach still cannot mark their own work, and — the case that earns it its keep — a
teacher cannot grade their own child. Because it only ever removes rows, it can never widen anything.

The third thing is an absence rather than a layer. The submit route decodes into a struct with one
field, `student_id`. `response.DecodeFields` sets `DisallowUnknownFields`, so a pupil who sends
`marks_obtained` gets a 400 before any predicate runs, and the builders on that path have no marks
setter to reach. Symmetrically the grading payload carries no response text, so a teacher cannot
rewrite the pupil's answer while marking it.

Submissions are their own table rather than a column or a JSON blob on the assignment, and that is what
makes all of the above expressible: the rule has to be a row predicate for `Update().Where(id, pred)`
to enforce it atomically. A blob has no row to narrow, and an assignment duplicated per pupil turns the
teacher's edit into a fan-out.

### Kin is a positive arm on submissions, and that is a deliberate exception to "fail closed"

Read `AssignmentSubmissionsFor` carefully before you trust the fail-closed rule here:

    var ors []predicate.AssignmentSubmission
    if kin := a.Kin(); len(kin) > 0 {
        ors = append(ors, entsubmission.StudentIDIn(kin...))
    }

`Kin()` is the caller's own pupil records plus their academic wards, and `kinOf` resolves it from the
`Viewer` and the guardian link — not from the CAS `Decision`. So a viewer whose reach does not resolve,
an unknown reach or an empty one, still gets `withKin(DenyAudience(), kin)` and still matches their own
and their ward's submissions. It is not `WHERE FALSE`. Everywhere else in these two domains an
unresolvable reach matches nothing, so this one place will look like a bug to the next reader.

It is intended. The entity gate has already passed by the time a predicate is built, so the caller
demonstrably holds `core.assignment_submissions.read`; what failed is only the narrowing. Falling back
to "your own work and your ward's" is the narrowest answer available, not a widening — it is strictly
smaller than any reach the grant could have carried, and a pupil who cannot see their own marks because
an operator mistyped a reach is a support ticket, not a safeguard.

Two things keep it honest. The fallback can only ever admit rows the caller is the subject of, because
`kinOf` is built from `v.StudentIDs` and the guardian link and nothing else. And it is a read arm only:
`AssignmentSubmissionsGradableBy` uses the same `Kin()` set with the opposite sign, subtracting it, so
the fallback can never turn into a grading right.

The guardian half carries the academic gate. `kinOf` filters wards through
`StudentsOfGuardianAcademic`, the `can_view_academic = true` variant, exactly as attendance does — not
the ungated `StudentsOfGuardian`. `TestKinHonoursTheAcademicFlagOnTheGuardianLink` proves it against
Postgres: it asserts the ward is reachable while the flag is set, so the flip is not vacuous, then
clears the flag and requires `WardStudents`, `Kin()` and the rendered submission predicate all to empty
out. Swapping the one call to `StudentsOfGuardian` fails that test with "still resolved 1 ward pupils",
which is the same leak shape that was closed at `viewer.go:207`.

### What the mutation testing showed

Reducing `exceptKinSubmissions` to `return p` fails three assertions in `internal/data/access` — the
tenant-reach pupil, the teacher who is also a pupil, the teacher who is also a parent — and leaves the
HTTP suite green, because layer one still denies a self-reach pupil. Adding `roleStudied` to the write
branch of `audienceRoles` on top of that removes layer one too, and only then does
`TestAPupilCannotGradeTheirOwnSubmissionOverHTTP` fail, 200 instead of 404, with the pupil holding
`marks_obtained: 20` on their own row. Three other HTTP tests fall over in the same run — the pupil can
suddenly post to the stream and moderate their own comment — because that one switch is what separates
reading from writing for every classroom surface at once.

### `migrate make` takes its flags before the name

`go run ./cmd/migrate make <name> -plane tenant` does not do what it looks like. `cmdMake` parses with
a `flag.FlagSet` and then takes `strings.Join(fs.Args(), "_")` as the name, and Go's `flag` package
stops parsing at the first non-flag argument. So the name swallows the flag and you get a migration
called `<name>__plane_tenant`, generated for *both* planes because `-plane` was never seen. Put the
flag first: `go run ./cmd/migrate make -plane tenant <name>`.

### `cmd/migrate` cannot drop a table

Worth knowing before you rename one. ent filters its diff down to `AddTable` and `ModifyTable` before
planning — `dialect/sql/schema/atlas.go` in ent v0.14.6, in `(*Atlas).diff` — so a table that
disappears from the ent schema is ignored rather than dropped. No option changes this: `WithDropColumn`
and `WithDropIndex` do not cover tables, and `DropTable` is not in the default skip set either, it is
discarded further downstream. Renaming `announcements` to `stream_posts` therefore left an orphan that
the tool could not remove. Since nothing here was deployed, the fix was to roll the local tenant back
to 8, delete the two superseded migration files, regenerate `atlas.sum` through
`migrate.WriteSumFile` rather than editing it, and generate one clean migration — which came out
byte-identical in `atlas.sum` terms to the pre-existing state plus one file. Had this been deployed the
drop would have needed a hand-written migration.

### Deliberately left out

`assignment_items.question_id` and `assignment_submission_items.question_response_id` are plain UUID
columns with no foreign key: there is no `questions` table in this repo yet, only `question_papers`.
They are stored so the shape matches the document and can be wired up when assessments land.
`live_sessions`, `live_participants`, `notifications` and `attachments` are in the same section of the
document and are not built here. Per-row field policy (`projectPerRow`) is not applied to any of these
tables; the whole row is projected under the caller's field policy as in every other domain. There is
no `create` entity key for any of the four areas — a separate `create` earns its place only where
creating differs from editing, and a post or a piece of homework is created against exactly the targets
that then govern editing it.

## Achievements, badges and recognition

Section 22 of the architecture document, built as four tables in the migration
`20260923111332_add_achievements_and_recognition`: `achievements`, `student_achievements`, `praises`
and `praise_reactions`. Local tenant goes 9 -> 10.

### Two different mechanisms in one vertical, and why that is not inconsistency

The classroom worker before this one had to invent `Audience` because `stream_targets.target_id` is a
bare UUID with no foreign key, so there was nothing for a pure `(v, d)` predicate to join through. The
obvious reading is that this section has the same shape, because `student_achievements.source_id` is
also described as *"polymorphic evidence reference paired with source_type"*. It does not, and the
document says why in that table's own key constraints:

> source_type/source_id is evidence, not an authorization scope -- do not join through it to resolve
> branch or session.

`student_achievements.student_id` is a real, required foreign key. Every authorization question about
an award — who may read it, who may award it, who may revoke it — is a question about the pupil it
names, and that pupil is one join away. So the awards side uses the house `XFor(v, d)` signature
throughout: `StudentAchievementsFor` is `HasStudentWith(StudentsForAcademic(v, d))`, pure, no context,
no queries, unit-testable against rendered SQL. `source_type` and `source_id` are stored, appear in no
predicate, and are joined through nowhere.

`praises` is the one that genuinely has the `Audience` shape. `recipient_type`/`recipient_id` is
polymorphic over students and staff, the document is explicit that *"application code, not a foreign
key constraint, enforces it points at an existing student or staff row"*, and a pupil's classmates are
not on the `Viewer` at all. So praise gets `Recognition`, resolved impurely by `ReadableRecognition`
and `WritableRecognition`, with `DenyRecognition()` as the zero value — the same split the stream
worker used, for the same reason. It is a separate type from `Audience` rather than a reuse of it
because the two resolve different sets: `Audience` at teacher reach fills sections and offerings and
leaves `Students` empty on the read path, which is precisely the field praise needs, and because
praise needs a staff set that `Audience` has no place for. `Recognition` reuses `kinOf`,
`studentsTaughtBy`, `studentsOfSections` and `pinnedAudience` from `audience.go` rather than restating
them; they are unexported and in the same package.

### Nobody hands recognition to their own household

`StudentsForAwarding` is the whole rule:

    kin := kinStudents(v)
    if kin == nil {
        return awardableStudents(v, d)
    }
    return entstudent.And(awardableStudents(v, d), entstudent.Not(kin))

`awardableStudents` is layer one — the reach switch. Self reach and guardian-ward reach fall to the
`default` arm and return `NoStudent()`, which renders as `FALSE`, so a pupil holding
`core.student_achievements.write` at self reach reaches nothing to award, and a guardian likewise.

`kinStudents` is layer two, and it is the one that earns its keep. It subtracts the caller's own pupil
records and anyone they are a guardian of at **every** reach, including tenant and including an
unrestricted grant — deliberately the same shape and the same sign as `exceptKinSubmissions` in
`assignment.go`. The case it exists for is not the pupil who talks CAS into a tenant grant, though it
catches that; it is the teacher who is also a parent of a pupil in their own class. That teacher
legitimately reaches the child through `teacher_assignment` and would otherwise be able to hand their
own child a gold badge. Because the layer only ever removes rows, it cannot widen anything.

The guardian half uses the **ungated** `StudentsOfGuardian`, not the `can_view_academic` variant the
read path uses. The asymmetry is deliberate: for a positive arm you want the narrow set, for a
subtraction you want the wide one. A parent who cannot see their child's marks should still not be
able to award their child a badge.

### How the `is_featured` tension is resolved

The document says `is_featured` is *"pinned to the student's public profile"*, and the section summary
says the award history *"drives which badges a student showcases on their profile"*. That is the
pupil's own choice. It sits directly against the rule above, which says a pupil must have no write
reach over their own award rows at all.

Resolved by splitting the route and the payload, not by weakening either rule.

`PATCH /student-achievements/{id}` carries the award itself — `status` and `evidence_json` — and is
gated by `StudentAchievementsAwardableBy`, kin subtracted. Its payload struct has no `is_featured` and
no `display_order` field, and `response.DecodeFields` sets `DisallowUnknownFields`, so a pupil who
sends one gets a 400 before any predicate is built. A pupil who sends `{"status":"revoked"}` against
their own award gets a 404, never a 403.

`PUT /student-achievements/{id}/showcase` carries `is_featured` and `display_order` and nothing else,
and is gated by `StudentAchievementsShowcasableBy`, which is the awardable set **plus** the caller's
own rows by `student_id`:

    entaward.Or(
        StudentAchievementsAwardableBy(v, d),
        entaward.StudentIDIn(v.StudentIDs...),
    )

So the pupil curates their own profile and can touch nothing else; a teacher or an admin can unpin
what they awarded; a pupil cannot feature a classmate's badge, and a teacher-parent cannot feature
their own child's, because neither arm admits it. The showcase update also requires
`status = 'awarded'`, so a revoked badge cannot be left sitting on a profile.

The `v.StudentIDs` arm ignores the reach and the pins, exactly as `Kin()` does on submissions and for
the same reason: the entity gate has already passed, so the caller demonstrably holds
`core.student_achievements.write`; what failed is only the narrowing, and "your own badges" is the
narrowest fallback available rather than a widening. It can only ever admit rows the caller is the
subject of, because `v.StudentIDs` comes from `access.Resolve` and nothing else.

Two things keep the pair honest at the database. `student_achievements_order_featured` is a check
constraint, `display_order IS NULL OR is_featured`, so an unfeatured badge cannot carry a position;
the handler clears `display_order` when `is_featured` goes false rather than letting the constraint
fire at the client. And `student_achievements_evidence_paired`,
`(source_type IS NULL) = (source_id IS NULL)`, holds the document's "paired with" to the wall.

### Where peer praise stops

`core.praises.write` at self reach resolves `Recognition.Students` to
`studentsOfSections(kin.sections)` — every pupil with an active enrollment in a section the caller is
actively enrolled in. Not the whole grade, not the whole school, not the caller's subject offerings.
On top of that, `ReachesStudent` subtracts `Kin()` unconditionally, so a pupil cannot praise
themselves, and — since the same method governs every reach — a teacher cannot praise their own child.
The uniform rule across both tables is: **nobody hands recognition to their own household, at any
reach.**

A staff recipient needs `AllStaff`, which is set only by unpinned tenant reach or an unrestricted
grant. That is the document's *"admin-to-staff recognition"*: a pupil cannot praise a teacher, a
teacher cannot praise a colleague at teacher reach, and a head cannot praise themselves. A pinned
tenant grant such as `grade_level=G8` resolves students through `pinnedAudience` and leaves `AllStaff`
false, so pinning to a grade takes staff recognition away with it — correct, because a grade pin says
nothing about which staff the holder speaks for.

`visibility` is enforced on one axis only. `private` praise is readable by its recipient and its giver
and nobody else; `class_only` and `public` are readable by anyone whose `Recognition` reaches the
recipient. There is no separate enforcement of `class_only` against `public`, and that is not an
omission: a narrowed reader's audience is already bounded by the sections they teach or study in, so
for them the two are the same set, and an unpinned tenant reader sees everything either way. The field
is stored so a UI can render the difference and so a future school-wide praise wall has something to
filter on.

`status = 'removed'` is filtered out of every narrowed read. `DELETE /praises/{id}` is a soft removal —
it sets `status` to `removed` and answers 204 — because the document says *"use soft-delete/status
(hidden/removed) rather than deleting; recognition history should survive moderation."*

### One key, two predicates, on the praise edit route

`PATCH /praises/{id}` accepts content (`message`, `visibility`, `related_achievement_id`) and
moderation (`status`) in the same body, and they are not the same right. The predicate is assembled
from what was actually sent and ANDed into the one mutation:

    if in.Message != nil || in.Visibility != nil || in.RelatedAchievementID != nil {
        gates = append(gates, access.PraisesEditableBy(reach))
    }
    if in.Status != nil {
        gates = append(gates, access.PraisesModeratableBy(reach))
    }

`PraisesEditableBy` is `given_by_person_id = caller` and nothing else — the recipient of a praise
cannot rewrite what was said about them. `PraisesModeratableBy` is the giver, or anyone whose writable
`Recognition` reaches the recipient **and carries `Moderator`**. A body that sends both must satisfy
both. Because the gates fold into `Update().Where(...)`, a caller who satisfies neither gets `n == 0`
and a 404.

`Moderator` is the flag that separates the two meanings of `Recognition.Students`. For a teacher it is
the roster they teach; for a pupil at self reach it is their classmates, and a classmate set is a
*giving* set, not a moderating one. Without the flag, `PraisesModeratableBy` and
`PraiseReactionsRemovableBy` both read "recipient is in my reach" and hand every pupil the power to
hide praise about a classmate and to delete a classmate's reaction. The test that found it is
`TestAReactionFollowsTheVisibilityOfItsPraise/a bystander cannot remove somebody else's reaction`,
which returned 204 before the flag existed. `Moderator` is set by `taught || all` — a teaching role or
a tenant grant — and never by the classmate role. A pupil who wants praise about them taken down asks
a teacher; that is the moderation model the document's soft-delete constraint implies.

### What the mutation testing showed

Replacing `StudentsForAwarding` with `return awardableStudents(v, d)` — dropping the kin subtraction,
a strictly widening change — fails three assertions in `internal/data/access` (the tenant-reach pupil,
the unrestricted pupil, the guardian) and two in `internal/transport/http`. The HTTP failures are the
interesting ones: the pupil holding tenant reach gets a 201 carrying a `student_achievements` row with
their own `student_id`, and the teacher-who-is-also-a-parent gets a 201 against their ward. Two
subtests keep passing under the mutation — the pupil at self reach, and the pupil awarding a classmate
— which is the point: `awardableStudents` denies those on its own, so the two layers are independent.

The test world seeds six unawarded badges and hands out one per attempt, because a repeat award trips
`UNIQUE (student_id, achievement_id, academic_session_id)` and returns 409. A 409 fails the assertion
too, but it fails for the wrong reason, and inside the single test transaction it poisons every later
subtest with `SQLSTATE 25P02`. A refusal that only looks like a refusal because a unique index got
there first proves nothing.

### Deviations from the document, with its own words

**Repeat awards are not buildable as specified.** The document's key constraint reads:

> UNIQUE (student_id, achievement_id, academic_session_id) unless the achievement explicitly allows
> repeat awards.

The `achievements` field table defines no column by which an achievement could explicitly allow that,
and a partial unique index cannot consult a row in another table to decide whether to apply. The
unconditional unique index is built; the escape hatch is not. A repeat award returns 409. Where a
school genuinely wants a repeatable award, a second catalog row with its own `code` expresses it
without a schema change.

**`updated_at` on three tables the document gives only `created_at`.** `student_achievements`,
`praises` and `praise_reactions` each list `created_at` alone. They use `BaseMixin` like every other
table in this repo, which carries `updated_at` with an `UpdateDefault`. Diverging from the house mixin
for three tables would cost more than the column does, and `student_achievements.is_featured` and
`praises.status` are both mutable, so it is not dead weight.

**Free-text columns are enums.** The document types `category`, `tier`, `award_mode`, `status`,
`source_type`, `recipient_type`, `visibility` and `reaction_type` as TEXT with an illustrative list
and an "etc.". They are Go enums here, which is the house convention — `assignment_targets.target_type`
is the nearest neighbour — and which Appendix A explicitly permits: *"Status: TEXT or PostgreSQL ENUM
depending on migration strategy."* The cost is that adding a value is a migration; the benefit is that
a typo is a 400 rather than a row nobody can query.

**`achievements.criteria_json` is required when `award_mode = 'auto_rule'`.** A check constraint,
`achievements_auto_rule_has_criteria`, not stated in the document. The document defines
`criteria_json` as *"Auto-award rule definition when award_mode = auto_rule"*, and an auto_rule badge
with no rule is a badge nothing can ever earn.

**No rule engine.** `award_mode = 'auto_rule'`, `criteria_json`, `awarded_by IS NULL` *"when
auto-awarded by rule engine"* and `source_type = 'rule_engine'` are all stored, and nothing in this
repo writes them. Every award made through the API records the caller in `awarded_by`. The columns
exist so that the engine, when it lands, needs no migration.

**`praises.recipient_id` carries no foreign key**, as the document requires. The handler checks
existence against `students` or `staff` before writing and answers 422 naming the row that does not
exist. Nothing joins through it; `PraisesFor` matches on `recipient_type` plus an id set resolved
separately.

**`achievements` and `praise_reactions` have no breadth key.** A badge definition is school-wide
reference data with nothing to narrow it by, like `rooms` and `calendar`, so `core.achievements.write`
is refused unless the grant reaches the tenant unpinned; the breadth probe in `scopeFor` borrows the
matching `student_achievements` key, because someone who reaches every award in the school reaches the
catalog behind it. A reaction inherits its scope entirely from its praise — `PraiseReactionsFor` is
`HasPraiseWith(PraisesFor(...))` — so a breadth key on reactions would be a second, silently divergent
way of saying what `core.praises.read_all` already says. The three reaction keys exist only so that
reactions can be switched off without switching off praise.

**Not built here.** No profile endpoint that assembles a pupil's featured badges and praise into one
payload; `GET /student-achievements?student_id=...&is_featured=true` and
`GET /praises?recipient_type=student&recipient_id=...` are the two calls it would make, both already
narrowed. No points ledger — `achievements.points` is stored and nothing sums it. Per-row field policy
(`projectPerRow`) is not applied to any of these four tables; the whole row is projected under the
caller's field policy, as in every other domain.

## Seeding the timetable and the register (2026-09-23)

The twelve timetable tables shipped empty: `cmd/seeddemo` predates them, so it built a school with
people, sections and offerings and then stopped. The calendar tab, the free-time finder and the
attendance register could only be demonstrated failing safely. This fills them.

### Extended `seeddemo` rather than adding `seedtimetable`

A sibling command would have had to re-resolve the school through the control plane, re-derive which
offering belongs to which section and re-decide which teacher takes it — and then be kept in step with
`seeddemo` forever, because a timetable that disagrees with the teacher assignments is worse than no
timetable. The two commands would also have had to agree on an ordering (`seedtimetable` is
meaningless before `seeddemo`) with nothing to enforce it.

So the work is two new steps inside the same command, behind `-timetable` and `-attendance`, both
defaulting on. The new flags are `-calendar-from` (YYYY-MM-DD, default the Monday eight weeks back),
`-calendar-weeks` (16) and `-attendance-days` (20). `-dry-run` prints that it is skipping both steps
and skips them: the pattern is planned against real section, offering and teacher ids, and a dry run
has none, so the honest answer is to say so rather than to invent a plan against empty structs.

### One timetable for the branch, not one per section

The brief asked for "a timetable per section". The schema does not allow it and should not: a
`timetables` row hangs off `period_scheme_id`, and the section lives on the *slot*. One published
version therefore carries every section's week, which is what makes a cross-section teacher clash a
question that can be asked at all. The seeder writes exactly one published version per scheme,
effective for the whole session, and keys it on `(period_scheme_id, version = 1)`.

### The grid, and what makes the Saturday visible

Nine periods — `ASM P1 P2 BRK P3 P4 LUN P5 P6` — with no times on them, and two bell schedules over
them. Regular runs 08:00 to 13:30; Saturday runs 08:00 to 11:00 and simply **has no rows for `LUN`,
`P5` and `P6`**. That is the whole Saturday mechanism: the same nine `periods` rows and the same
weekly pattern, and the afternoon drops out because no bell gives it a time.

Saturday is also `forenoon_open = true, afternoon_open = false`, so the half-day rule and the bell
rule are exercised separately rather than being two names for one fact. The first Friday of each month
is a Parent-Teacher Meeting — `day_type = event`, afternoon closed — which closes an afternoon
without shortening the bells, the other half of the same distinction. `P5` starts at minute 720
exactly, so the forenoon/afternoon boundary falls on a period edge and never inside one.

Sundays get **no row at all**. Absence of a `calendar_days` row already means not in session, and
writing a `weekend` row for every Sunday would be storing that fact twice. Holidays are the opposite
case and do get a row: a named row with both halves false is the same fact plus a label, and the label
is the reason to store it.

Named holidays come from a fixed list of Indian dates expanded across the years the window touches. A
window short enough to contain none of them gets one synthesised on a Wednesday, so the "holiday
resolves to nothing" behaviour is demonstrable whatever `-calendar-weeks` is set to.

### The pattern is built clash-free, then checked by the service that judges clashes

Subject choice is a Latin square: section *i* on day *d* in teaching slot *p* takes subject
`(i + d - 1 + p) mod len(subjects)`. With the teacher-per-offering mapping `seeddemo` already
produces, two sections collide only if they draw the same subject *and* the same teacher, which that
rotation cannot arrange. That reasoning holds for the default shape and not for every `-sections` and
`-teachers` combination, so it is not relied on: the planner keeps a busy set keyed on
`(day_of_week, period)` and, if an offering's own teacher is already standing somewhere else in that
slot, it takes the first free teacher instead **and writes the matching `teacher_assignments` row**.
A slot whose teacher is not assigned to the offering would be a lie the free-time finder would repeat.

Rooms are the same shape: a home classroom per section, plus a Science and a Language laboratory. One
section per room per period, so room clashes cannot arise from the grid.

Concurrent electives are the case the clash unit exists for. Sanskrit and French offerings are made
per section, the section's enrolments are split between them by enrolment number, and both are placed
in the *same* period on Wednesday — a different period for each section, so the two elective teachers
can be drawn from whoever is free. The academic slot at that cell is skipped rather than added to,
because a whole-section slot beside the two electives would share students with both and would be a
real clash rather than a demonstration of a permitted one.

The seeder then runs `internal/service/timetable.Check` over the written version and prints the
verdict. With no `From`/`To` the dated pass checks exactly the dates that carry a deviation, which is
the cheap and correct default. It printed `clash check: clear` on the seeded school, and the check was
confirmed not to be vacuous: a proposed slot deliberately double-booking a teacher, a room and a
section returned all three rules firing.

### Attendance is read out of the resolved occurrences, not recomputed

The register is marked by asking the service to `Resolve` the attendance window and walking what comes
back, with `OmitCancelled` set. That has three consequences worth having: a cancelled period gets no
marks, an afternoon that the calendar closed gets no marks, and the mark records the teacher who
actually took the class, so a substitution shows up in the register rather than only in the timetable.

Status is a hash of `(student, date, half)`, so a pupil absent in the morning is absent for every
morning period and the `attendance_days` row derives from the same values rather than being invented
alongside them. Roughly 93 present, 4 absent, 2 late, 1 excused per hundred.

`attendance_periods` is unique on `(student_id, attendance_date, period_id)` — **without**
`subject_offering_id` — and the elective block is where that matters: the two concurrent offerings
are in one period, a pupil is enrolled in exactly one of them, and so exactly one row exists. Verified
on a Wednesday: nine Sanskrit marks and eight French marks in period `P1` for a section of seventeen,
and zero duplicate `(student, date, period)` triples across the whole table.

No occurrence rows are written anywhere. `timetable_deviations` gets three rows — a cancellation, a
substitution and a room change, on three consecutive past session days — and nothing else records a
date against the pattern.

### What was actually run

Seeded into the local `DPS-NGP` tenant: 8 rooms, 1 period scheme, 9 periods, 2 bell schedules, 15 bell
times, 96 calendar days over 2026-07-27 to 2026-11-14, 91 day schedules, 1 published timetable, 246
slots, 100 elective choices, 3 deviations, 11183 period marks and 2000 register rows. A second run
reported `nothing: everything already existed` and every count was identical.

The partial-run claim was tested rather than asserted: 600 period marks, 100 register rows, one day
schedule, one bell time and one deviation were deleted, and the next run remade exactly those five
counts and nothing else.

A resolved week showed the Dussehra holiday producing no occurrences at all, the Saturday resolving
08:10 to 11:00 on the Saturday bells and stopping after `P4`, the Parent-Teacher Meeting Friday keeping
its morning and losing `P5` and `P6`, and the three deviations resolving as `cancelled`,
`substituted` and `relocated`. The Saturday carrying the cancellation had 383 period marks where a
full Saturday had 400 — one section of seventeen, one cancelled period.

`go build ./...`, `go vet ./...` and `gofmt -l internal/ cmd/ pkg/` are clean, and
`TEST_REQUIRE_TENANT_DB=1 go test ./... -count=1` is green.

## Overriding a timetable clash

A clash used to be refused outright: slot create and slot update ran `Check` with the proposal and
returned 409 `timetable_clash` on anything it found, with no escape. Schools need the escape -- one
teacher genuinely does cover two rooms in a pinch -- but "allow it" and "allow it and forget who
allowed it" are very different features, and only the first is wanted.

### What an override records

Five columns on `timetable_slots`, one migration, `20260923115847_add_timetable_clash_override`:

- `clash_override` -- the flag, `NOT NULL DEFAULT false`
- `clash_override_reason` -- why, up to 500 characters
- `clash_overridden_by` -- the person, FK to `persons` with `ON DELETE SET NULL`
- `clash_overridden_at` -- when
- `clash_override_json` -- **which** clashes were accepted, as `[]shared.AcceptedClash`

The fifth is the one that earns its place. "This slot has an override" is a much weaker claim than
"this slot double-books Mrs Rao with 8-B on Tuesday P3, accepted by X on date Y because Z". Each
record carries the rule, the scope, the day, the period, the counterpart slot or deviation, the
counterpart section, and whichever of teacher or room the rule turned on. A head reading the row a
term later can reconstruct the decision without re-running the solver against a timetable that has
since moved.

A database check constraint, `timetable_slots_override_reason`, refuses `clash_override = true`
without a non-blank reason. The HTTP layer refuses it first with a 422, so the constraint is a
backstop against a second writer rather than the error path anyone will meet.

### The override does not resolve the clash

`ClashReport` now distinguishes three things: a clash exists, a clash is *overridable*, and a clash is
*overridden*. `Clash.Overridable` is a property of the rule. `Clash.Overridden` and `Clash.Override`
are filled in by a post-pass over the report that looks up the accepted records held by the slots on
either side. An overridden clash is still a clash and is still reported, so a UI can render a
timetable full of overrides as visibly full of overrides. `Clear()` is unchanged -- it means no clashes
at all. `Blocking()` is the new predicate the save path uses: clashes that are not overridden.

An accepted record matches a live clash on rule, day of week, period and the identity of the
counterpart. Scope and date are recorded but are deliberately **not** part of the match. The override
accepts "this slot may double-book Mrs Rao with that slot at Tuesday P3"; whether the engine surfaces
that as a weekly pattern clash or as a dated clash on one particular Tuesday, it is the same accepted
exception. Matching is symmetric: a record held by either side covers the clash, so moving the *other*
slot does not silently re-refuse the arrangement.

The rule is part of the key, which matters. If the counterpart is later edited so it collides on
*room* as well as on teacher, that is a new clash the record does not name, and it blocks.

### The override never outlives the clash

The accepted list is recomputed from the live report on every save, not accumulated. If an edit moves
the slot out of the way, the save clears all five columns -- an override that names a clash nobody can
find any more is worse than no record at all. Conversely, an unrelated edit to a slot that already
carries an override (renaming its label, say) carries the existing override forward, reason and author
and timestamp intact, so a cosmetic change does not demand that the decision be re-justified and does
not re-attribute it to whoever made the edit.

`"clash_override": false` on a PATCH withdraws the override. The carried-forward records are dropped,
the clash is blocking again, and the save is refused with the ordinary 409 -- the slot is left exactly
as it was. Withdrawing an override and resolving the clash are the same act, in that order.

### A student-set clash is not overridable

`teacher` and `room` are overridable. `student_set` is not, at any grant.

A teacher can be in two places by fiction: the school knows it is a split class, or a supervised study,
or a five-minute walk. A room can hold two small groups. A pupil cannot. Overriding a student-set clash
would not record an accepted compromise; it would record a timetable that cannot be executed, and it
would corrupt attendance quietly rather than loudly, because the same pupil would be owed a mark in two
registers for the same period and the register that lost the race would look like absence.

There is a second reason, narrower but harder to argue with. The teacher and room rules compare
*declared* facts -- this slot names that teacher. The student-set rule compares a *derived* set: the
intersection of the enrolments of the two offerings, which is why Grade XI running Physics, History and
Commerce concurrently is not a clash. An override on a derived fact goes stale the moment a pupil
changes an elective, and it goes stale silently, because nothing in the accepted record would notice.
Accepting a clash the school can no longer see is the failure mode the audit trail exists to prevent.

The refusal for an unoverridable clash keeps the 409 and the `timetable_clash` code and differs only in
its message, and every clash in the body now carries `overridable` so the UI knows which ones it may
offer a button for. That boolean is the only change to the refusal body; the envelope is otherwise
byte-identical to what it was.

### `core.timetable.override`

A new CAS entity, declared but not registered -- see `docs/CAS-KEYS-TO-REGISTER.md` for the reasoning
and for the note that nobody can hold it until it is registered, which fails closed.

### What was actually run

The migration takes the tenant plane from 10 to 11; `go run ./cmd/migrate status` reports
`tenant DPS-NGP up to date (11 applied)`.

`go build ./...`, `go vet ./...` and `gofmt -l internal/ cmd/ pkg/` are clean, and
`TEST_REQUIRE_TENANT_DB=1 go test ./... -count=1` is green across all 19 packages that hold tests.

Two widening mutations were run against the new tests. Making the empty-reason check unconditional
(`if false`) turned both `TestOverrideWithoutAReasonIsRefused` and
`TestOverrideWithABlankReasonIsRefused` from 422 into a 201 that wrote a double-booked slot carrying no
override record whatsoever. Pointing the override gate at `core.timetable.write` instead of
`core.timetable.override` turned `TestOverridingWithoutTheOverrideKeyIsForbidden` from 403 into a 201.
Both reverted clean.

One pre-existing bug was fixed on the way, because it made the new behaviour untestable. In
`updateTimetableSlot`, `slotDescribes` was called with `in.Label` -- the label *in the request* --
rather than the label the slot would have after the update, and its refusal was then ignored by
`&& current.Label == nil`. A PATCH that did not resend the label of a label-only slot therefore got a
422 status header followed by a 200 body containing the row it had just, in fact, written. The guard
now computes the resulting label first and returns on refusal.

## Periods per week

`subject_offerings.periods_per_week` existed and was NULL on all 42 offerings of the seeded school, so
auto-scheduling had nothing to solve against. `cmd/seeddemo` now fills it, behind `-periods-per-week`
(default true).

Values are per subject code -- Mathematics, English and Science 6; Social Studies and Hindi 5; Sanskrit
and French 3 -- falling back to 3 for anything else marked elective and 4 otherwise.

### Idempotent is not the property that matters

The seeder writes **only where the column is NULL**. That gives idempotence for free, because a second
run finds no NULLs, but idempotence is the weaker of the two properties and not the one worth having.
The one worth having is that a human edit survives: a value a teacher set by hand is by definition not
NULL, so there is no run of the seeder that can destroy it. A seeder that instead wrote "the value I
would have chosen" on every run would also be idempotent in the narrow sense -- the same input gives
the same output -- and would silently revert somebody's work every night.

This was tested rather than asserted. Mathematics in every A section was hand-edited from 6 to 9 and
three Hindi offerings were set back to NULL. The next run reported `3 of 42 offerings filled in, 39
already carried a value`, refilled exactly the three Hindi rows with 5, left every 9 alone, and the
feasibility table moved from 31/34 to 34/34 for the A sections to match.

### Feasibility

A section week holds 34 teaching periods: six on Monday through Friday and four on Saturday, counting
only periods of kind `teaching`, so Assembly, the short break and lunch are excluded. That figure is
derived from the calendar rather than assumed -- for each weekday the seeder takes the first open
instructional day, follows it to the bell schedule actually in force, and counts the teaching periods
that have a bell time on it.

Required periods are the sum over the active offerings of a section, except that electives are counted
**once, at their maximum** rather than summed. Sanskrit and French are alternatives that occupy the same
slot in the grid; adding them would double-count a period the week only spends once.

All six sections come out at 31 required against 34 available, three spare. The report names any section
that exceeds its week as `INFEASIBLE`, because a timetable that cannot be solved should say so before the
solver is asked.

### Periods and minutes are different questions

`periods_per_week` alone does not state a curriculum obligation, because a period is not a fixed
quantity of time. The seeded grid already proves it:

```
BELL-REG   ASM 15   P1..P6  45 min   BRK 15   LUN 30
BELL-SAT   ASM 10   P1..P4  40 min   BRK 10   (no LUN, no P5/P6)
```

Six periods is 270 minutes if all six land on a weekday and less as soon as one lands on a Saturday.
So `subject_offerings` now carries **both**, side by side, `Optional().Nillable().NonNegative()`,
added by `20260923123523_add_subject_offering_minutes_per_week`:

- `periods_per_week` -- how many slots to place
- `minutes_per_week` -- how much teaching time the curriculum asks for

Both sit on the offering rather than on the subject, following the existing `periods_per_week`. The
obligation is a property of a subject *as taught to a section in a session* -- Grade 6 Mathematics and
Grade 10 Mathematics are not the same obligation -- and splitting the pair across two tables would
guarantee the two halves drift.

### Which one wins

They can disagree, and something has to say what that means, so: **`periods_per_week` is the hard
placement constraint and `minutes_per_week` is the stated obligation reported against.** A school that
sets 6 periods and 300 minutes on a grid that yields 270 gets a timetable with 6 periods placed and a
reported 270 of 300. Neither number is corrected to agree with the other, because both are true
statements about different things.

The reason it falls this way round, rather than making minutes authoritative:

- Minutes are not placeable. A solver places slots. It cannot place two thirds of a period, and
  rounding 300 into "six or seven periods, we will see" is a decision the school should make rather
  than one the solver should make silently.
- Delivered minutes are *derived*, and derived from things that move. Which weekdays the slots land on,
  which bell schedule each calendar day carries, and every later edit to either, all change the answer.
  A hard constraint whose satisfaction flips when somebody edits a bell time is not a constraint, it is
  a tripwire.
- The gap is the interesting number. A school under-delivering Mathematics by 30 minutes a week wants
  to see that, not to have the timetable refuse to save until somebody rounds the obligation down to
  make the refusal go away.

For the same reason nothing derived is stored. Delivered minutes are computed on read from the slots
actually placed and the bell schedule actually in force on each weekday. There is no check constraint
tying the two columns together; a disagreement is a finding, not a corruption.

### Seeding both

The seeder fills `periods_per_week` from the per-subject table as before, then fills
`minutes_per_week` as `periods x nominal`, where nominal is the **modal teaching-period length** of the
grade's own period scheme across the weekdays it runs -- 45 here, because five weekdays of 45-minute
periods outvote one Saturday of 40 -- falling back to 45 when there is no calendar to measure.

Two properties follow from filling them in that order, in one pass over every offering rather than only
over the NULL ones:

- Each column is filled only when it is NULL, so a hand-edited value in either column survives, exactly
  as before.
- Minutes are derived from the **effective** period count, not from the seeder's own table. If a human
  set `periods_per_week = 8` and left minutes NULL, the seeder writes 360, not 270. The pair it creates
  is always self-consistent with what is actually in the row.

### Feasibility in both units

The report is now two tables over the same sections, periods and minutes, each with required,
available, spare and placed.

Available minutes are derived the same way available periods are: for each weekday take the first open
instructional day, follow it to the bell schedule in force, and sum the spans of the periods of kind
`teaching`. That gives 5 x 270 + 160 = **1510 minutes** against **34 periods**.

Required minutes sum over a section's active offerings with electives counted once at their maximum,
identically to periods.

`placed` is what the timetable currently delivers -- every published slot of that section, priced at the
bell schedule of the weekday it sits on. It is reported rather than constrained, and it is the column
that shows a section feasible in periods and short in minutes, which is precisely the case that the
count alone cannot express. A trailing line counts the offerings whose placed minutes fall below their
`minutes_per_week`.

The placement here comes from the seeder's naive round-robin fill, not from a solver, so `placed` says
what this demo timetable happens to deliver rather than what a solved one would.

## Automatic timetable generation: the CP-SAT model and where it should live (2026-09-23)

Prototype, not integrated. The code is `tools/timetable-solver/`, Python, and it is the only
non-Go thing in this repo that executes. It reads a school out of a tenant database as JSON,
solves a week, and audits the answer with code that never saw the model. Nothing in emerge-core
calls it yet, on purpose: the contract below is a proposal.

The precedent is `D:\lms-paper-orchestrator\paper_orchestrator\solver.py`, the estate's existing
CP-SAT solver on `ortools==9.15.6755`. Four things are taken from it deliberately: the hard/soft
split with soft constraints as penalised slacks, integer scaling, the two-solve infeasibility
protocol, and keeping every other module importable with no solver installed. That module is
heavily commented and this prototype follows *its* house style rather than this repo's; the Go in
this repo still carries no comments.

### The unit of decision is a cell, and a cell is not a period

`periods` carry no times. Times live on `bell_schedule_periods` and differ by bell schedule: 45
minutes on `BELL-REG`, 40 on `BELL-SAT`, verified in the demo tenant. So the model's grid is keyed
by the pair (ISO day-of-week, period), and each cell carries its own duration.

Each cell also carries how many dates in the timetable's effective window actually run it, counted
from `calendar_days` joined through `calendar_day_schedules` to the bell schedule in force, with
the half-day flags respected. For the seeded school over 2026-07-27 to 2026-11-14 that gives
**34 cells, not 36**:

    Mon P1..P6  15 occurrences  45 min     Fri P1..P4  15  45 min
    Tue P1..P6  14              45 min     Fri P5, P6  12  45 min   <- 3 event days, afternoon shut
    Wed P1..P6  16              45 min     Sat P1..P4  15  40 min   <- BELL-SAT defines no P5 or P6
    Thu P1..P6  16              45 min     Sun         --           <- no calendar_days row at all

Three of the hard requirements are in that table rather than in any constraint. ASM, BRK and LUN
are not `teaching` periods so they are not cells. Saturday has no fifth period because `BELL-SAT`
does not define one. Sunday is not in session because absence of a `calendar_days` row means not
in session. **All three are enforced by not creating the variable**, which is faster, and which
keeps them out of infeasibility cores. "Sunday does not exist" is not advice.

### The student unit is a cohort, and this is the part that has bitten before

Two slots for the same section in the same period are **not** automatically a clash. The seeded
school proves it: every section runs French and Sanskrit concurrently, and their enrolments are
disjoint, 8 pupils and 9 pupils out of 17, intersection empty.
`internal/service/timetable/clash.go` gets this right by intersecting the two offerings' student
sets, and the model must agree with it rather than reimplement it.

Restating that pairwise in the model would be O(offerings^2) constraints repeating one fact. So
the export groups pupils by their *basket* of active `student_subject_enrollments`, and a
**cohort** is one maximal set of pupils with identical enrolment. "At most one of a cohort's
offerings per cell" is exactly equivalent to the pairwise rule and, on the seeded school, is 12
groups rather than 103 pupils or 861 pairs. It permits French beside Sanskrit and forbids English
beside Mathematics, which is the behaviour `clash.go` already has.

**The trap in that derivation, which is worth naming.** A cohort comes from enrolment, so an
offering nobody is enrolled in belongs to no cohort, and then nothing in the model stops it
landing on top of the rest of its own section's week. A section created for next year, before
anybody has been enrolled into its subjects, is exactly that case, and it is the case a generated
timetable is most likely to be wanted for. `clash.go:setsFor` already has the answer: when a slot
has no subject offering it falls back to the whole section's roll. The loader does the same, into
a synthetic cohort keyed `section:<id>`. It does not merge the un-enrolled offering into the
section's real cohorts, because "these pupils take this" and "we do not know who takes this" are
different claims and collapsing them would assert enrolment that does not exist.

### Decision variables

`x[o, c]` - offering *o* occupies cell *c*. 42 x 34 = 1428 booleans on the seeded school.

`a[o, t]` - offering *o* is taught by teacher *t*. Created **only** when more than one teacher is
eligible; with one eligible teacher the handle is the constant 1. Every offering in the seeded
school has exactly one, so this family vanishes there and the general model costs nothing.

`r[o, k]` - offering *o* is taught in room *k*. Room is chosen **per offering, not per period**: a
class does not move room between its own lessons, the teacher does. That is a modelling decision,
not a fact about the schema. It shrinks the model by a factor of the grid and it is what makes
"keep this class where it already is" one penalty rather than one per period.

The products `w[o,c,t] = x AND a` and `z[o,c,k] = x AND r` are ordinary literals tied down by
`sum_t w = x` and `w <= a`, not by a multiplication constraint. When the choice is degenerate they
collapse onto `x` and no literal is created. The whole model is 3306 variables and 4192
constraints on the seeded school.

### Hard constraints

| group | constraint | tradeable in diagnosis |
|---|---|---|
| `demand:<offering>` | `sum_c x[o,c] == periods_per_week(o)` | yes |
| `day_demand:<offering>:<day>` | `sum_{c on day} x[o,c] == pinned count` | yes |
| `teacher_capacity:<teacher>` | per cell, `sum_o w[o,c,t] <= 1` | yes |
| `room_capacity:<room>` | per cell, `sum_o z[o,c,k] <= 1` | yes |
| `unavailable:<teacher>` | `w[o,c,t] == 0` for blocked cells | yes |
| `cohort:<key>` | per cell, `sum_{o in cohort} x[o,c] <= 1` | **no** |
| `one_teacher:<offering>` | `sum_t a[o,t] == 1` | **no** |
| `one_room:<offering>` | `sum_k r[o,k] == 1` | **no** |

Fixed slots, assembly and anything else the school has pinned, are constants that consume teacher,
room and section capacity in the cells they occupy. An offering with no candidate rooms is legal
and is simply exempt from the room constraint, because `timetable_slots.room_id` is nullable and
`clash.go` skips the room rule when either side is null.

The teacher and room constraints are written across **every section at once**, which is only
possible because a timetable hangs off `period_scheme_id` and the section lives on the slot. One
published version carries the whole school's week, so "Mrs Rao is in 8 A now" is a statement the
model can make. Had the section been on the timetable instead, a cross-section teacher constraint
would not have been expressible at all.

### Soft constraints

Every one is a **penalty on deviation, never a reward for compliance**. The precedent solver
records finding a sign error of exactly that kind in its own build plan: under maximisation a
reward with a negative coefficient is driven to zero and the constraints linearising it go slack
in silence. A penalty cannot fail quietly - a wrong sign produces a visibly perverse timetable.

| term | weight | what it costs |
|---|---|---|
| `stack` | 40 | each period of an offering beyond the first on the same day |
| `last_period` | 25 | each placement of a heavy subject in the day's final teaching period |
| `teacher_gap` | 30 | each idle period between two busy ones, per teacher per day |
| `room_move` | 60 | an offering not in the room it is already taught in |
| `minutes_short` | 8 | per scaled minute below a stated `minutes_per_week` |

The weights are a decision made here, not a finding, and each is a config key wanting calibration
against what a head of timetabling actually rejects. The ordering they encode is: never stack a
subject while a free day exists; do not move a class out of its room to avoid one stack; a
teacher's idle period is worth about three quarters of a stack.

Contiguity is expressed as **span minus load** - `(last busy period - first busy period + 1) -
(periods taught)` - one integer per teacher per day. An empty day leaves `first` above `last`, the
expression goes negative, and the non-negative slack reads zero.

**That term is what makes the model hard, and the measurement is worth recording.** Using the
published week's placement counts as demand (210 periods into 34 cells per cohort, a week with no
free periods at all) and every other soft term unchanged:

    with the contiguity term    FEASIBLE   obj 138000   bound 99000   120 s   28% gap
    without it                  OPTIMAL    obj  96000   bound 96000   0.8 s

The first encoding tried was the obvious one, a boolean per period saying "busy either side of me
and idle myself". Replacing it with span-minus-load improved the incumbent slightly and **did not
move the bound**, so the difficulty is the requirement and not the encoding.
`linearization_level = 2` moved neither materially. That is a product decision rather than a
tuning detail: contiguity is the one preference that costs proven optimality, so it is a weight a
caller can set to zero.

### Integer scaling

CP-SAT is an integer solver and this model has exactly one genuinely fractional quantity, so it is
worth naming: **a weekly pattern slot does not deliver its nominal duration.** Monday P1 runs on
15 of the window's 16 weeks, Friday P5 on 12, and Saturday periods are 40 minutes rather than 45.
Priced by what actually runs, Monday P1 is worth 42.19 minutes a week and Friday P5 is worth
33.75. Those fractions are scaled by 100 and never arrive as floats.

Counting `periods_per_week` needs none of this, which is the arithmetic behind the ruling already
recorded under *Periods per week*: periods is the hard placement constraint, minutes is the stated
obligation reported against.

The solver's default basis is **nominal**, the bell-schedule length of the period, because that is
what this repo reports "placed" minutes as. A solver that optimised against a figure the product
does not display would be quietly right and visibly wrong. The realised basis is available and is
the sharper number; on the seeded school it is about 6% lower, and that gap is holidays and event
days rather than anything a timetable can fix.

### Infeasibility: three stages, in order of cost

**1. Preflight, with no solver.** Arithmetic impossibilities make the model infeasible
*independently of any assumption*, so CP-SAT correctly returns an **empty** core for them, and a
caller that only read the core would report "infeasible, no explanation". Preflight catches them
and does the arithmetic out loud, which is strictly better than a core: a core can say which
requirements are jointly impossible, not by how much. Every check is a valid bound the model
provably implies, so a fault is a proof and never a false alarm. The converse does not hold, which
is what stages 2 and 3 are for.

**2. Production solve** - objective present, 8 workers.

**3. Diagnosis** - only on INFEASIBLE, objective cleared, `num_workers = 1`, every tradeable group
behind one enforcement literal passed as an assumption. Only that configuration yields a reduced
core; with an objective present or more than one worker CP-SAT silently hands back the entire
assumption list, which looks exactly like an answer. A deletion filter then shrinks whatever came
back, because `SufficientAssumptionsForInfeasibility` returns a *sufficient* set and not an
irreducible one - on the laboratory case below it returned 23 groups where 11 were enough.

What counts as tradeable is the judgement that decides whether a core is useful. A school can
change how many periods a subject gets, who teaches it, what rooms exist and when a teacher is
free. A school cannot change that a child is one child, so the cohort rule stays hard even in
diagnosis. Relaxing it would also be expensive in the way the precedent measured for `slot_fill`:
a relaxed "at most one" lets a cohort hold any number of lessons at once, and the search space
that opens turns a fast proof into a timeout with no core at all.

#### A diagnosis model must be no stricter than the model it is explaining

This was got wrong first, and the failure was invisible. The cohort constraint carries a redundant
tightening: when a cohort's demand exactly fills the cells left to it, every "at most one" is
tight and the equality is a valid deduction rather than an extra requirement. It is worth adding -
it is what tells the solver the seeded week has no free periods.

The deduction is valid **only while the demand constraints it was derived from are enforced**, and
diagnosis relaxes exactly those. With the equality left in the diagnosis model, an instance whose
actual conflict was laboratory capacity produced a sufficient *and irreducible* eight-group core
about French on Saturday. Sufficient, irreducible, and about the wrong thing. The tightening is
now applied in the production model only.

#### The sentence the brief asked for needs an input the schema has not got

"Mrs Rao is required for 7 periods on Tuesday and there are 6" was the target, and the first
attempt at deriving it was wrong. The tempting argument is that work which cannot go on any other
day must go on this one:

    forced(t, d)  >=  demand(t) - sum over other days of available(t, d')

but the sum over other days is `total - available(t, d)`, so `forced(t, d) > available(t, d)`
reduces to `demand(t) > total` - the weekly bound, restated. The per-day check could never fire on
its own.

A day-level statement is not derivable from a week-level requirement, and **nothing in the tenant
schema ties an offering to a day of the week**: no column on `subject_offerings`, no teacher
availability table, and `timetable_deviations` pin to a date rather than a weekday. So the
day-level demand is a request input (`pins`), which is a thing schools say anyway - Games on
Friday. With a pin present the bound is real and the sentence appears; without one the honest
strongest statement remains the weekly one.

### Verifying the answer independently of the solver's claim

A solver reporting its own constraints satisfied has proved nothing; it has restated its model.
`tools/timetable-solver/timetable_solver/verify.py` re-reads the export, never sees the model,
does not know cohorts exist, and applies the three rules pairwise from raw
`student_subject_enrollments` rows the way `clash.go` does, including the fallback to the section
roll for a slot with no offering. If the cohort derivation were wrong, the model would be
satisfied and this would still catch it.

Agreeing with the school's own published week is calibration, not proof, so each rule is
mutation-tested: a teacher's lesson moved onto another of their lessons, a room's onto another of
its own, an offering onto one that shares pupils, a lesson into Saturday P5 and into the assembly
period. Each fires only its own rule. One test is a negative control and it is the one that
matters: the French and Sanskrit pair, one section and one period, must produce **no** student-set
clash. A checker that treated "same section, same period" as a clash would fire there and would be
wrong.

### What it does on the seeded school

`periods_per_week` as the seeder now sets it - 204 periods across 42 offerings, 6 sections, 10
teachers, 8 rooms, 12 cohorts, 34 cells:

    status  : OPTIMAL       verdict : optimal_clean      wall : 14.89s    objective : 0
    independent check: 204 placements, 522 concurrent pairs examined
      teacher clashes 0 - room clashes 0 - student-set clashes 0 - off-grid 0 - demand misses 0

Objective zero means every soft preference is met: no subject doubled on a day, no heavy subject
in a last period, no class moved out of its room, no gaps in any teacher's day.

### Where it should live, and why not the other two places

**A new stateless internal service, deployed beside emerge-core. Not inside emerge-core, and not
inside the paper orchestrator.**

*Not inside emerge-core as a subprocess.* Tempting - no network hop, no extra deploy - but a solve
is 15 to 90 seconds of CPU across 8 workers. Inside an API pod that starves request handling, and
a CPU-bound child process cannot be cancelled cleanly, only killed. It would also put a Python
runtime and a ~100 MB ortools wheel into this image, and it would make the solver untestable
without this repo's database.

*Not inside `lms-paper-orchestrator`.* It shares the solver version and the idioms, and that reuse
is real - but it is reuse of the *pattern*, which has been copied, not of the runtime. That
service's stated job is that it owns the paper; its tenancy is an `X-School-Id` header over its own
SQLite while emerge-core is database-per-tenant with CAS slugs; and its stack's dependency arrow
points one way, orchestrator to engines. Adding a second consumer with a different auth model and
a different release cadence means a paper deploy can break timetabling and the reverse.

*The case for its own service.* It is CPU-bound, bursty and long relative to a request, so it wants
its own pod, its own limits and its own scaling. More decisively, **it needs no database at all**:
everything it uses arrives in the request body. A service with no database has no tenancy problem,
no migrations, no backups, and can scale to zero. The database-per-tenant isolation this repo
depends on stays exactly where it is - emerge-core reads the tenant database it already has open
and sends a shape; the solver never holds a connection string and never learns a tenant exists.

### The HTTP contract

Internal only, never exposed. `Authorization: Bearer <token>` from config, and the service refuses
to start without one, following the orchestrator's fail-closed settings precedent.

    POST /v1/solve        200 a week - 422 infeasible, same body shape - 400 malformed
    POST /v1/feasibility  200 always
    GET  /healthz         200 {"status":"ok","ortools":"9.15.6755"}

Two status codes, one body - the orchestrator's `views_solver.py` rule, and the same reasoning.
`/v1/solve` returns 422 when the caller asked for a week and did not get one; the body is the
success body, so `infeasibility_core`, `core_explanation` and `wall_time_s` are all there to read.
`/v1/feasibility` returns 200 even for an impossible school, because the question was "can this be
solved" and "no, and here is why" is a successful answer to it.

Request:

    {
      "request_id": "...",                 // echoed for logging; the service is stateless
      "school": { /* the export shape: window, periods, cells, sections, rooms,
                    teachers, offerings, cohorts, fixed_slots */ },
      "config": {
        "max_seconds": 60, "num_workers": 8,
        "demand":   { "<offering_id>": 6 },
        "pins":     { "<offering_id>": { "5": 1 } },
        "unavailable": { "<teacher_id>": [[1, "<period_id>"]] },
        "required_room_type": { "SCI": "laboratory" },
        "heavy_subjects": ["MATH", "SCI"],
        "minutes_basis": "nominal",
        "weights": { "stack": 40, "last_period": 25, "teacher_gap": 30,
                     "room_move": 60, "minutes_short": 8 }
      },
      "hint": [ /* the published week, in the response's slot shape */ ]
    }

Response:

    {
      "status": "OPTIMAL", "verdict": "optimal_clean", "proven_optimal": true,
      "objective": 0, "wall_time_s": 14.89,
      "slots": [ { "ref": "s001", "section_id": "...", "day_of_week": 1,
                   "period_id": "...", "subject_offering_id": "...",
                   "teacher_id": "...", "room_id": "..." } ],
      "soft_violations": [ { "kind": "minutes_short", "key": "<offering_id>",
                             "target": 300.0, "actual": 265.0, "amount": 35.0,
                             "message": "..." } ],
      "infeasibility_core": [], "core_explanation": ""
    }

Four things about that contract are load-bearing.

**`cohorts` travel, raw enrolments do not.** One `GROUP BY` on the emerge-core side turns 600
enrolment rows into 12 cohorts, and sending baskets rather than pupils keeps pupil identifiers out
of a service that has no business holding them.

**`ref` is `timetable.Proposal.Ref`.** It is not decoration. The returned slots map one to one onto
the `Proposal` struct that already exists - `Ref`, `SectionID`, `PeriodID`, `DayOfWeek`,
`SubjectOfferingID`, `TeacherID`, `RoomID` - so no new Go type is needed and a clash the checker
finds can name the proposal it came from.

**emerge-core must run the returned week through `timetable.Service.Check` before writing it, with
all three rules.** The solver's own claim is not evidence, and emerge-core already owns a clash
checker that is built, tested and mutation-proven against the real schema. A verdict of clear is
the precondition for a write; anything else is a bug in the solver, to be reported as one rather
than persisted. It also means the cohort abstraction is never trusted end to end: it decides the
model, and `clash.go`'s pairwise student-set intersection decides what gets saved.

**Asynchrony stays on this side.** A 6-section school solves in 15 seconds and a 60-section school
will not. When a job record is needed, emerge-core owns it, because emerge-core has a tenant
database to put it in and the solver deliberately does not. The `max_seconds` ceiling is enforced
by the service so a caller cannot ask for an unbounded solve.

### What the schema could not express

Each of these is currently a request input with nowhere to live. None blocked the prototype; each
means a school's stated intent cannot be stored, only re-typed at every solve.

- **No day-of-week pinning.** Nothing ties an offering to a weekday; `timetable_deviations` pin to
  a date. "Games is on Friday" is unstorable, and its absence is why the per-day infeasibility
  sentence needs a request input.
- **No double or consecutive periods.** A `timetable_slot` is one period and two adjacent slots
  are not marked as one lesson. Laboratory doubles cannot be asked for or recorded.
- **No teacher availability or contracted load.** `teachers` has no maximum periods and no
  availability; `staff` has joining and leaving dates only. "Mrs Rao works Monday to Wednesday"
  and "no more than 24 periods a week" are both unstorable, and the second is the one a school
  will ask for first.
- **No room requirement on a subject or offering.** `rooms.room_type` exists and
  `sections.room_id` is a home room, but nothing says Science needs a laboratory.
- **`subject_offerings.subject_group_id` exists and is NULL everywhere.** The French/Sanskrit band
  is discoverable only as an emergent property of disjoint enrolment. That works, and it is the
  truth - but it is only available *after* pupils are enrolled, which is exactly the trap above. A
  populated `subject_group_id` would state the band up front and let a timetable be generated for
  a cohort that does not exist yet.

## Reach and write on UPDATE: the fold was already done, the field policy was not

TODO §2 and STATUS item 7 record three related complaints about the write handlers: that reach and
write are not atomic on UPDATE, that some writes consult no field policy, and that four `get*`
handlers apply no viewer narrowing. Only the second of the three was still true.

### The fold: every update with a reach to carry already carries it

A sweep of every mutating handler in `internal/transport/http` classified each by the shape of the
write it issues. Every handler whose entity has a reach concept - a narrow/`_all` entity pair and
an `access` predicate over it - already carries its scope predicate inside the `UPDATE` itself.
Forty-one of them: six in assignments, three in attendance, two in curriculum, one in enrolments,
two in guardians, two in library, one in persons, one in placements, three in recognition, one in
staff, two in stream, one in student assignments, one in students, two in student submissions, one
in subject enrolments, one in teacher assignments, one in teachers, and ten across timetable. Ten
update handlers write by id alone; none of the ten has a scope to carry.

The entities whose writes still go through `UpdateOneID(id)` with no predicate are exactly the ones
with no reach to carry: `academic_sessions`, `branches`, `grade_levels`, `school_houses`,
`sections`, `subjects`, `subject_groups`, `subject_offerings`, `achievements`, and the control-plane
`schools`. None of these has an `_all` twin in `internal/authorization/entities.go` and none has an
`access` predicate over it, so `scopeFor` would have nothing to narrow with. Folding a predicate
into those updates is not a handler-layer change: it would need new entity constants and new
predicates first, and the widening question would have to be settled before either. They are left
as they are, and the reason is recorded here rather than left to be rediscovered.

Where a handler reads the row before writing it, the read is not what protects the row.
`updateTimetableSlot` needs the current slot to build a clash proposal, `updateLibraryItem` needs
the current audience and the question-paper sidecar, `markAttendanceRegister` needs to know which
marks already exist. In each case the pre-read is narrowed by the same predicate and the `UPDATE`
carries it again. `updateLibraryItem` is the one place a second write is protected by the first:
the `QuestionPaper` sidecar is reached through `UpdateOneID`, but it is written inside the same
transaction as the scoped `ContentItem` update, which rolls that transaction back on `n == 0`.

The writes that genuinely cannot fold are the creates. `linkGuardianToStudent`, `reactToPraise`,
`createAddress` and the rest reach their parent and then `INSERT`, and an `INSERT` has no `WHERE`.
`applyRegister` shows the pattern that replaces the fold there: insert, re-read the inserted ids
through the write predicate, and delete them inside the transaction if any came back unreachable.

Two predicates that are easy to substitute wrongly are spelled correctly at every site.
`gradeSubmission` uses `AssignmentSubmissionsGradableBy` where `submitAssignment` uses
`AssignmentSubmissionsSubmittableBy`; `moderateStreamComment` uses `StreamCommentsModeratableBy`
for a status change and `StreamCommentsWritableBy` for a body edit, chosen per request rather than
once; `updatePraise` ANDs `PraisesEditableBy` and `PraisesModeratableBy` according to which fields
the body carries.

### Proving the fold is what holds the door

`internal/transport/http/studentwritedb_test.go` runs `updateStudent` against a real tenant
database through `testsupport.TenantTx`, with a teacher-assignment reach that admits one seeded
student and not the other. Two of its three tests are satisfied by the pre-read alone: a student in
another section is refused by `reachStudent` before the `UPDATE` is ever built. Replacing
`reachStudent` with a constant `true` leaves both passing, which is the first half of the
measurement - the pre-read is not load-bearing for them, and neither are they evidence for the
fold.

The third test is the one that measures the fold.
`TestUpdateStudentRefusesARowThatLeftScopeAfterTheReachCheck` registers a one-shot ent mutation
hook on `Student` that moves the student's enrolment into a section the caller does not teach. The
hook runs after `reachStudent` has already said yes and before `next.Mutate` issues the `UPDATE`,
which is exactly the window the fold closes. With the predicate in the `UPDATE` the write matches
nothing and the handler answers 404. Widening that predicate to `access.AnyStudent()` while leaving
`reachStudent` completely intact makes the write land: 200, and `student_code` becomes `RACED`. A
deterministic hook is used rather than a concurrent goroutine because the property is about
ordering, not about timing, and a test that depends on a race is a test that gets deleted the first
time it flakes.

### `Decode` versus `DecodeFields`: ten reference handlers and two provisioning ones

`response.Decode` is `DecodeFields` with the list of keys the caller actually sent thrown away, and
that list is the only input to `rejectUnauthorizedFields`. A handler that calls `Decode` therefore
cannot consult a field policy, whatever policy the grant carries. Twelve did.

Ten were the reference-structure writes: `createBranch`/`updateBranch`,
`createGradeLevel`/`updateGradeLevel`, `createHouse`/`updateHouse`, `createSubject`/`updateSubject`
and `createSubjectGroup`/`updateSubjectGroup`. Their siblings `createSection`, `updateSection`,
`createSession`, `updateSession` and `updateOffering` already did the right thing, so a grant that
restricted `core.reference.write` to `name` was honoured on a section and ignored on a subject.
All ten now take `sent` from `DecodeFields`, read the route decision with `routeDecision`, and
refuse through `rejectUnauthorizedFields` before building the mutation.

Two were `provisionPerson` and `linkPerson`. Both sit behind the same `core.persons.write` grant as
`createPerson`, which does enforce the policy, and both end at `upsertPerson`, which writes
`first_name`, `middle_name`, `last_name`, `display_name`, `email` and `phone` onto a `persons` row.
A caller whose grant was restricted to `first_name` could set `email` and `phone` by choosing
`POST /persons/provision` instead of `POST /persons`. This is the same shape as the
`linkGuardianToStudent` case that once put `status` on a guardian link: a field policy that is real
on one route and absent on the route beside it. Both now enforce, using
`columnsSent(sent, entperson.ValidColumn)` so that `username`, `password`, `group_keys` and
`identifier` - which are CAS request fields and not person columns - do not read as denied writes.

The refusal is placed before the provisioner is called, so a denied field costs no CAS round trip
and mints no identity. `Provisioner.Link` still copies CAS's own `email` and `phone` onto the person
when the request omits them; that is not enforced against the caller's policy, because the value is
CAS's record of the identity being linked rather than anything the caller chose, and refusing it
would mean refusing the link outright. What the policy governs is what the caller sent.

`schools.go`'s `createSchool`, `updateSchool` and `decodeInto` keep `Decode`. The first two write
the control-plane `schools` table, which no tenant field policy describes; `decodeInto` decodes
credential profiles, whose keys are not columns of anything. `checkTimetableClashes` keeps it
because it writes nothing.

`internal/transport/http/referencefields_test.go` covers all twelve. It is a sibling of
`structurefields_test.go` and reuses its `routed`, `restrictedTo` and `wantOK` helpers rather than
growing that file. Removing the policy check from `updateBranch` alone turns two of its subtests
red and leaves the other four green, which is the evidence that the table is testing each handler
rather than one shared code path.

### The four unnarrowed `get*` handlers stay unnarrowed

`getSection`, `getOffering`, `getBranch` and `getSession` read by id with no viewer predicate. Each
stays that way, for the reason already recorded under the structure listings: these four are
school-wide reference data, authorized all-or-nothing at the route by `s.can(SectionsRead)`,
`s.can(SubjectOfferingsRead)`, `s.can(ReferenceRead)` and `s.can(AcademicSessionsRead)`.

Taking them one at a time:

- **`getSection`** - narrowing it would contradict `listSections`, which returns every section in
  the school to the same grant. A reader who may list every section gains nothing by being refused
  one of them by id, and `sections` is granted to pupils and guardians precisely so that a
  timetable, an assignment or an enrolment can be rendered with a section name attached. Narrowing
  here would break that and would close nothing the listing leaves open.
- **`getOffering`** - the same argument, and more strongly: `subject_offerings` is the join a pupil
  needs in order to read their own timetable and assignment rows at all.
- **`getBranch`** - a branch is an address and a phone number. It has no per-person dimension to
  narrow on; no viewer attribute makes one branch more theirs than another.
- **`getSession`** - an academic session is a pair of dates. `is_current` is read by nearly every
  other handler to default a session id, so refusing it by id would break callers already entitled
  to the same row through `listSessions`.

The honest statement is not "narrowing was considered and found unnecessary" but "there is nothing
to narrow with": none of the four entities has an `access` predicate or an `_all` entity, and
inventing one for a read would have to start from a decision about whether reference data should be
per-viewer at all. If any of these tables ever carries personal data, that decision comes first and
these four handlers change together with the listings, not before them.

## Housekeeping: the orphan sweeper, 400 versus 422, and clearing a column (2026-09-24)

Three items from `STATUS.md` "What remains" item 8, taken together because two of them are
conventions, and a convention settled in one place is worth nothing.

### The orphan `pending` asset sweeper already existed, and starved

`STATUS.md` listed "orphan `pending` asset sweeper" as open. It is not, and has not been since
2026-09-14: `cmd/assetreap` sweeps `pending` as well as `deleted`, retires the row and removes the
abandoned object, and the three questions worth asking about it were answered then and are recorded
above under "The asset reaper" -- the window is 24 hours with a 1 hour floor because the `pending`
clock is a timeout on a human and not on an HTTP request; bytes that were uploaded but never
confirmed are deleted; the row is never deleted, only moved to `deleted`, because it is the only
record that the asset ever existed. That entry in `STATUS.md` is stale, and the note beside it --
correctly distinguishing the retrieval index sweeper from this one -- is what kept it looking open.

So no second sweeper was built. A background sweeper inside the API process would have been the
wrong shape anyway, for the reason already written down for the index sweeper: this command destroys
bytes that are recoverable from nowhere else, so a human decides when and how much, and the dry run
is the default.

**What was actually broken is the scan, and it defeated the whole feature.** `Sweepable` asked one
query for `pending OR deleted`, ordered by `created_at` ascending, under a single `LIMIT`. A reaped
`pending` row becomes `deleted` and stays `deleted` forever; once it is older than the threshold it
re-enters the candidate set on every subsequent run and never leaves it. Since the ordering is
oldest first, and a freshly orphaned `pending` row is by construction one of the newest rows in the
table, a tenant holding `limit` already-reaped soft deletes older than its newest orphan never
reaches that orphan. The sweep that exists to find abandoned uploads could not find them, and the
failure is silent: the command reports a full scan, all of it `KEEP`.

`Sweepable` now runs two queries. `pending` is asked first with the whole budget, and `deleted` gets
whatever is left. Pending is served first rather than the budget being split evenly because an
abandoned upload is a leak that grows, while a `deleted` row whose object is already gone is a
finding that does nothing. The total still respects `limit`.

`TestAnOrphanedPendingRowIsNotStarvedByTheSoftDeletedBacklog` pins it against a real tenant
database: eight soft deletes older than the orphan, a scan limit of eight, and the orphan must still
come back. It failed before the change with exactly that message.

**A second hole, found by mutation, and worth recording because the tests looked complete.** Deleting
`CreatedAtLT(cutoff)` from the scan entirely left every test in the package passing. The in-memory
re-check in `judge()` catches the young rows a widened query hands over, so behaviour stays correct
and nothing fails -- which means the SQL half of the "two independent statements of the same rule"
had no test of its own, and the independence was a claim rather than a fact.
`TestTheScanItselfRefusesToHandOverAYoungPendingRow` tests the query directly, and asserts that an
old row *is* returned in the same breath, so it cannot pass against a query that returns nothing.

### 400 is "I cannot read this", 422 is "I read it and will not do it"

The rule the code already followed nearly everywhere, now stated so that it stops drifting:

- **400** -- the request cannot be read as what it claims to be. Unparseable JSON, an unknown field,
  a field of the wrong JSON type, a path or query parameter that will not parse, or **one body field
  considered alone** whose shape is wrong: absent when required, empty, outside its enum, not a
  date, outside its numeric range, longer than its column.
- **422** -- every field parses and is individually well shaped, but the request as a whole cannot be
  carried out. A field the server or the path owns, a field fixed when the row was created, **a rule
  relating two or more fields**, a rule about the count or distinctness of a collection in the body,
  a reference to a row that does not exist or that the viewer cannot reach, or the state of the rows
  the request names.

The brief for this pass proposed a different rule -- 400 only for a malformed body, 422 for any
well-formed body whose content is unacceptable -- and said it was the rule visible in the newer
handlers. It is not. `createTimetable`, the newest write in the tree, answers 400 to
`name is required`, `version must be positive` and `effective_from must be a date as YYYY-MM-DD`.
Adopting the proposed rule would have moved roughly 250 refusals and changed the answer of nearly
every write endpoint in the product. The rule above is the one the code, these notes and the Bruno
collection already agree on, and `api/12-timetable/17-scheme-comes-from-the-path.bru` reasons about
the distinction explicitly in its own words. Settling on the majority convention was a judgement, and
this paragraph records that the other reading exists and what following it would cost.

Eleven refusals disagreed with the rule and were changed:

- **`attribution` in `reach.go`, 400 to 422.** A supplied `owner_person_id`, `uploaded_by`,
  `assigned_by`, `verified_by`, `author_person_id`, `created_by`, `published_by` or `confirmed_by`
  is a field the server records from the token. Sixteen of the twenty server-owned, path-owned
  and immutable refusals in the tree already answered 422, and the 2026-09-09 entry above settled
  that class as 422 by name. This one helper sits on eleven call sites, so it was the single largest
  disagreement.
- **`storage_key` and `status` on `POST /library/assets`, 400 to 422**, and **`student_id` on
  `PATCH /student-guardians/{id}`, 400 to 422**, for the same reason.
- **`end_date must be after start_date`, `valid_to cannot be before valid_from` and
  `pass_marks cannot exceed maximum_marks`, 400 to 422.** Rules between two fields, where
  `effective_to must not precede effective_from`, `due_at must not fall before available_from` and
  `expires_at must fall after published_at` were already 422.
- **`forenoon_status or afternoon_status is required`, 400 to 422.** Nothing can be said about either
  field alone; the precedent is `a slot needs either subject_offering_id or label`.
- **`capacity must be positive`, 422 to 400.** A single field's range, where `version must be
  positive`, `sequence must not be negative` and `maximum_marks cannot be negative` are all 400.
- **`ErrDayOfWeekInvalid`, `ErrSectionRequired` and `ErrPeriodRequired`, 422 to 400.**
  `writeTimetableServiceErr` was splitting on which layer raised the error rather than on what kind
  of wrong it was: everything the query parser raised answered 400 and everything the clash body
  raised answered 422, which put `ErrSectionRequired` and `ErrBranchRequired` -- the same check, one
  per field -- on opposite sides of the same switch.

**One deliberate exception, left alone.** `decodeInto` in `schools.go` answers 422, not 400, to an
unknown field or a type mismatch in a credential body. The route is
`PUT /schools/{id}/profiles/{type}` and the body's shape is chosen by a value in the path, so an
unknown field there means "this is not a `{type}` credential" rather than "this is not JSON". It is
also a decision taken deliberately in the 2026-09-09 profile-validation work, where `{"foo":"bar"}`
answering 422 with nothing written is the recorded fix for a defect that took a school offline.
Changing it to 400 would reopen a settled question in order to close an unsettled one.

**Bruno: exactly one assertion breaks, and it is not this repo's to fix.**
`api/09-negative/06-pass-marks-above-maximum.bru` posts `maximum_marks: 50` with `pass_marks: 90`
and asserts `res.status: eq 400`. That refusal is now 422, so the assert must become
`res.status: eq 422`. It is the only request in the collection whose asserted status changes; every
other affected request sends valid values and asserts a 2xx. `api/10-library-curriculum/02-create-asset.bru`
asserts 201, and its `docs` block says `storage_key` and `status` are "refused with 400" -- prose
that is now wrong and should say 422. `api/12-timetable/17-scheme-comes-from-the-path.bru` and
`api/13-attendance/04-the-slot-is-not-yours-to-send.bru` both assert 400 and both stay correct: the
field is not in the payload shape at all, so the decoder refuses it as unknown before any handler
check runs, which is exactly the distinction those two requests already document.

`refusalstatus_test.go` pins all three arms of the rule through the helpers themselves, so a new
handler that reaches for the wrong status has a test to argue with.

### An explicit `null` clears a column; an omitted field does not

`response.DecodeFields` returns the list of keys the body actually carried, which is the only thing
separating "absent" from "present and null" once both have decoded to the same nil pointer. There
was no convention for using it, so no route could clear a nullable column at all: sending `null` and
sending nothing were the same request, and both meant "leave it".

The convention:

1. In a `PATCH`, an explicit `null` on a nullable column **clears it**. An omitted field leaves the
   column alone. `wasCleared(sent, name, value)` is the test.
2. On a `NOT NULL` column, an explicit `null` is **refused with 400**, naming the field -- never
   silently ignored. `rejectNull(w, sent, name, value)`. It is a 400 and not a 422 because it is one
   field's value considered alone, which is the rule above.
3. In a `POST`, `null` means the same as absent. There is no column to clear on a row that does not
   exist yet, and the schema default applies.
4. The payload struct does not change. No `json.RawMessage`, no `Optional[T]` wrapper, no second
   struct: the pointer plus the `sent` list already carries the information, and that same list is
   what `rejectUnauthorizedFields` and `rejectImmutable` already read.

`updateTimetable` had already hand-rolled exactly this for `effective_to`
(`to == nil && wasSent(sent, FieldEffectiveTo)`), which is what makes it the convention the tree was
reaching for rather than an invented one. It now uses the helper, and covers `supersedes_id` too.

**Done on three handlers, chosen to cover every column shape once:** `updateStudent`
(`student_code` a string, `admission_date` and `withdrawal_date` dates, `withdrawal_reason` text,
`house_id` a foreign key, with `status` refusing null), `updateTimetable` (`effective_to`,
`supersedes_id`, with `name`, `version`, `effective_from` and `status` refusing null) and
`updateOffering` (`subject_group_id`, `grading_scheme_id`, `periods_per_week`, `maximum_marks`,
`pass_marks`, with `status` refusing null).

**Deliberately not done: every other update handler.** Rolling the convention across all of them at
once would change the meaning of `null` on every nullable column in the product in a single pass,
and today a client that sends `null` gets a silent no-op rather than an error, so some of them are
being sent `null` already by clients that believe it does nothing. Each remaining handler should move
when someone is working in it, and the Bruno collection should gain a request per handler as it does.
The three above are the pattern to copy.

**A note on the shape of the guard.** `rejectNull` is called once per field in sequence, not gathered
into a slice of results: a slice literal evaluates every element, so four guards against a body
carrying two nulls would write four error bodies onto one response. That mistake was made and caught
here, and it is the ordinary hazard of turning early returns into data.

## Auto-fill: wiring the CP-SAT solver to a button (2026-09-24)

The section above argued where the solver should live and what its contract should be. This one
records building it. Nothing in that argument was revisited; what follows is the part that only
shows up once something has to call it.

    solver        POST /v1/feasibility   200 always, preflight only, ~5 ms
                  POST /v1/solve         200 a week - 422 no week - 400 malformed
                  GET  /healthz          200 {"status":"ok","ortools":"9.15.6755"}

    emerge-core   POST /timetables/{id}/generate        -> 202 + a job id
                  GET  /timetables/{id}/generate/{job}  -> status, and the answer

### The service is `server.py` and the standard library

`http.server.ThreadingHTTPServer`, not Flask and not FastAPI, both of which happen to be installed
on the development box and neither of which earns its place. The image then needs exactly one
dependency - ortools, the one that does the work - and threading is adequate because CP-SAT
releases the GIL while it searches, so `/healthz` answers during a solve.

Two modules were added and the purity rule survived both. `timetable_solver/wire.py` parses a
request and renders an answer and is **pure**: it imports `preflight`, `school` and `dto`, never
`solver`, so the contract can be tested with no ortools installed and `tests/test_purity.py` still
says exactly one module imports a solver. `server.py` sits outside the package, which is what lets
it import the solver without making the package depend on it.

`school.load` was split into `load(path)` and `load_document(doc)`. `export.sql` is no longer the
only producer of that shape - emerge-core builds it in Go - and making the path the special case
keeps both producers on one loader, so a school assembled by Go and a school dumped by psql cannot
drift into being read differently.

**Concurrent solves are counted and refused, not queued.** Two solves on four cores are much worse
than twice as slow, because each one's workers are fighting the other's and the parallel portfolio
is what makes CP-SAT fast. Over the cap the answer is 503 with a `Retry-After`; emerge-core owns
the job and can try again, and a queue here would be state this service has said it does not hold.

**Diagnosis gets one budget, not one per solve.** `solver.diagnose` runs a deletion filter, one
solve per candidate group, to turn a sufficient core into an irreducible one. That is worth the
cost interactively and unbounded for a service: sixty groups at the caller's `max_seconds` is an
hour. So the whole diagnosis is given `max_seconds` once and divides it. A candidate solve that
runs out of time returns UNKNOWN rather than INFEASIBLE and the filter keeps that group, so a tight
budget makes the sentence longer, never wrong.

### The job is a tenant row, and its states say what happened

`timetable_generation_jobs`, one migration, one table, additive. A partial unique index on
`timetable_id where status in ('queued','running')` makes "one run at a time" a database fact, so a
double-press is a 409 rather than two solves racing to write the same draft.

| status | what it means |
|---|---|
| `queued` | the row exists, the in-process worker has not picked it up |
| `running` | claimed, `started_at` set |
| `succeeded` | a draft was written; `slots_written`, `verdict`, `objective` recorded |
| `infeasible` | the solver **proved** no week exists. `failure_reason` is null |
| `failed` | everything else, and `failure_reason` says which |

`infeasible` is deliberately not a failure. "No week exists, and here is which requirements cannot
hold at once" is a correct and useful answer to the question asked, and a check constraint enforces
the distinction: `status <> 'failed' OR failure_reason IS NOT NULL`, and its converse.

The three cases the contract asks about surface differently on purpose. A **timeout** is `failed`
with `failure_reason = timeout` and a detail saying to ask again with a larger `max_seconds`; the
search did not finish, which is the caller's budget rather than the school's arithmetic. An
**infeasible** result is `status = infeasible` with the preflight's or the core's sentence in
`detail` and the keys in `core_keys`. An **UNKNOWN** is the same as a timeout, because it is one:
CP-SAT returning UNKNOWN means it neither found a week nor proved there is none. `FEASIBLE` is a
success, with `verdict = feasible_not_proven` recording that optimality was not proven - on the
seeded school, a one-second budget with no hint returns exactly that.

### Check before write, and the two mutations that prove it

The write is one function, and it runs `Service.Check` with all three rules and refuses on a
non-empty `Blocking()` before opening the transaction. Auto-fill **never** sets a clash override:
the solver's hard constraints are provably equivalent to `clash.go` for the weekly pattern, so a
blocking clash is a solver bug to report, not a collision for a machine to accept on a human's
behalf. `Rule.Overridable()` is never consulted here and no `Proposal.Override` is ever built.

Both halves of that are mutation-proven. Deleting the `Check` call, and separately downgrading the
refusal to a log line, each make `TestAWeekThatFailsTheCheckIsNeverWritten` fail with *"settled as
succeeded, not failed"* - the test feeds a week with one teacher's lesson moved on top of another
of their own, built from the tenant's real published week.

### The export, ported from `export.sql`, and what happened to `limit 1`

emerge-core builds the request body from the tenant it already has open, in
`internal/service/timetablegen/export.go`. Thirteen queries where the SQL was one, which is the
right trade: the shape is now a Go type the compiler checks against the schema it came from.

**There is no `limit 1` to make.** `export.sql` picks a period scheme with `order by code limit 1`
because a standalone script has to pick one. The port does not choose at all: the timetable being
filled names its own `period_scheme_id`, and everything else follows from it. The arbitrary choice
was an artefact of running outside the product, not a decision worth porting.

That does not make the second scheme go away, and the model still cannot see it. Teachers and rooms
are shared across schemes, and a teacher taking a class under `PS-REG` and another under a second
scheme at the same time is **not expressible in the model at all** - the grid is one scheme's
cells. So when the branch runs more than one active scheme the job carries a visible warning saying
so, rather than the export silently scoping to one. `Check`'s dated pass does see across schemes,
because it builds occurrences from the branch rather than the scheme, so the cross-scheme case is
caught on any date it actually bites - but only on dates the dated pass visits, which by default
are the dates carrying deviations. The warning is what covers the rest.

Two more differences from the SQL, both deliberate:

**Cohorts travel and pupils do not.** `export.sql` ships `enrolments` and `section_roll` as pupil
identifiers because `verify.py` re-derives the clash rules from raw rows. The service does not run
`verify.py` - `clash.go` is the authority on this side - so the port sends cohorts and a
`section_roll_counts` map instead. A count is all the fallback cohort's `size` was ever used for,
and it appears in a sentence rather than in anything the model decides. A test asserts no pupil id
from the tenant appears anywhere in the encoded request.

**A nil slice is not an empty list.** Go encodes `nil` as `null` and the loader iterates what it is
given; the first end-to-end run failed with *"'NoneType' object is not iterable"* because an empty
draft has no fixed slots. Every list in the request body is now initialised before it is sent, and
a test asserts each one encodes as `[]`.

### Which week the draft is checked against, and why `supersedes_id` is load-bearing

`Check`'s pattern pass compares a draft against every published or draft version of the same scheme
whose effective range overlaps. On the seeded school the published week spans the whole year and
fills every cell of every section, so a draft over the same dates collides with it on all 204
lessons. That is `Check` being right: two versions both in force is exactly what it is for.

So the draft must say what it replaces. When `supersedes_id` is set, that version's slots go into
`ExcludeSlotIDs` - the facility already exists and already means "these are going away". When it is
not set and something else overlaps, the generate is refused at the POST with a 422 naming the
version and saying to move `effective_from` or set `supersedes_id`, rather than spending a solve to
discover it.

The draft's own rows are treated by kind. A label-only slot - assembly - is exported as an
immovable placement and the solver schedules around it. A slot carrying a subject offering is
either a refusal or, with `replace_existing`, deleted inside the write transaction; it is **never**
exported as fixed. Getting that wrong was caught in the live run: the draft's own 204 lessons were
being sent as fixed placements *and* their demand counted again, so the preflight reported Vihaan
Reddy owing 78 periods a week where the honest figure was 48. The consequence is a stated
limitation: a lesson placed by hand in a draft cannot be worked around, only replaced. Honouring it
would mean subtracting placed lessons from stated demand, which is a second demand semantics and
deserves its own decision rather than being smuggled in here.

The draft also warns when the week it replaces carries label-only slots and it carries none: the
generated week will not have assembly in it, and silently losing assembly is worse than saying so.

### `core.timetable.generate`, and why it is a key

`core.timetable.write` narrows. At `reach=teacher_assignment` it reaches the slots of the offerings
a caller teaches, and auto-fill writes every section's week at once from a solve that read every
teacher, every room and every pupil's enrolment in the branch. There is no honest narrowing of
that, so the capability that widens `write` is named rather than left implicit - the same argument
shape as `core.timetable.override`, reached from the other direction: `override` separates a power,
`generate` separates a breadth.

It is the route's guard, and `core.timetable.write` is still required underneath it: the target is
fetched through `TimetablesWritableBy`, so a caller holding `generate` alone gets a 404. That also
means a narrowed `write` grant cannot reach an *empty* draft at all, because the predicate reaches
drafts through the slots they contain - which is the practical form of the same argument, and why
this key belongs with an unpinned tenant grant.

### What the seeded school does end to end

Draft version 2 superseding the published week, `max_seconds: 45`, contiguity off:

    POST /api/v1/timetables/{draft}/generate   -> 202, Location: .../generate/{job}
    GET  .../generate/{job}                    -> running
                                               -> succeeded, 204 lessons, OPTIMAL,
                                                  verdict optimal_with_violations, 1465 ms

    POST /api/v1/timetables/{draft}/clash-check (superseded week excluded)
      clear=true  clashes=0  blocking=0  overridden=0  dates_checked=3

    204 slots, 0 with clash_override, 10 teachers, 6 sections, 34 cells, status still draft

The eighteen soft violations are all the same shape and all honest: *"Class VI A English delivers
265.0 minutes a week against the 270 it owes"*. Five minutes, because one of that subject's periods
falls on a Saturday and `BELL-SAT` is 40 minutes rather than 45. Nothing a timetable can fix, and
exactly the sort of thing `verdict` exists to keep out of the word "optimal".

Asking the same draft for twelve periods of Mathematics a week returns `infeasible` in 4 ms without
taking a solve slot at all, because `/v1/feasibility` is asked first and arithmetic impossibility is
provable without a solver: *"Vihaan Reddy is required for 48 periods a week and has 34 available;
Classroom G6-A is needed for 37 periods a week and the week has 34..."* The 204 lessons already in
the draft are untouched by that refusal, because the delete lives inside the write that never
happened.

## Exam scheduling: a sitting is a lesson the clash engine has never met (2026-09-24)

`exams`, `exam_subjects` and `exam_sittings` are in `internal/ent/schema/exam.go`; the surface is
`internal/transport/http/exams.go`, mounted from `server.go` beside `mountTimetable`. The load-bearing
decision is in `docs/ROADMAP.md` §1.1 and the schema only records it: a sitting binds to
`(calendar_day, period, section)`, never to a `calendar_days.day_type`, because a unit test occupies
two periods of an otherwise normal teaching day.

### The sitting is fed to the existing checker as a `Proposal`

There is no second clash checker. `createExamSitting` builds a `timetable.Proposal` for the new
sitting and hands it to `timetable.Check` with `AllRules()`, and a non-empty `Blocking()` returns the
report as a 409 carrying `code: timetable_clash` - the same body the slot surface returns. Nothing
overrides: `core.timetable.override` is a power over *slots*, and an exam sitting has no override
column to hold an accepted clash, so the answer to a clash is to move the sitting.

Three things had to be resolved to make `Check` answer a useful question about a one-off dated event:

**Which timetable is the target.** `Check` needs a `TimetableID`. The sitting names a period; the
period names a scheme; the scheme has a published timetable in force on that date. If there is none,
the write is refused rather than written unchecked - a sitting that cannot be clash-checked is
exactly what the contract forbids. The day must also carry a `calendar_day_schedules` row for that
scheme, otherwise `datedPass` would silently drop the proposal and the dated half of the check would
quietly do nothing.

**Sittings clash with each other, and the checker cannot see them.** Every other sitting on the same
calendar day is passed as a `Proposal` too. The engine compares proposals pairwise, so two tests in
one room in one period collide through the ordinary room rule rather than through a bespoke query.
Restricting the set to the same calendar day keeps a pre-existing pair from ever being compared
across dates and blocking an unrelated write.

**A sitting displaces the section's own lesson.** The pupils of 10-A sitting a physics test at
period 3 are not also in their chemistry lesson. Without saying so, every sitting would collide with
the section's own timetabled period on the student-set rule, which is not overridable, and the
feature would be unusable in any school whose week is actually full. So the slots of each proposal's
`(section, period)` on that day-of-week are passed as `ExcludeSlotIDs`, which frees their room and
their teacher as well as their pupils. `TestAnExamSittingDisplacesTheSectionsOwnLessonInThatPeriod`
pins this, and asserts the fixture really does put the same pupil in both offerings, so the test
would fail if the displacement were removed rather than passing for want of an enrolment.

What displacement does *not* yet do is write anything down. The resolver still reports the ordinary
lesson on exam day, because nothing creates a `cancelled` deviation for the slot the sitting takes
over. That is the section calendar's job (§1.2) and it is the one known inconsistency in this piece.

A second, smaller imprecision: `Check` always runs its pattern pass, which treats the proposal as
recurring weekly across the target timetable's whole effective range. For a single-date sitting that
can report a room clash against a lesson which was itself cancelled by a deviation on that exact
date. It over-reports, never under-reports, so it fails closed.

### Authorization borrows the timetable keys

There is no exam CAS area and inventing one would register nothing, which denies everyone - the trap
described under "Four CAS areas for the timetable surface". An exam sitting is a timetable fact, so
the routes gate on `core.timetable.read` / `.write` / `.delete`, and `scopeFor` pairs each with the
matching `*_all` key so the breadth probe can actually resolve. Reads narrow to the offerings and
sections the viewer reaches; creating or editing an exam *campaign* needs an unpinned tenant write,
because the campaign spans the branch, while `exam_subjects` and `exam_sittings` go through
`checkSectionWritable` on the offering's section, which is the narrowing a subject teacher can
honestly hold.

### The date, not the day id

The payload takes `date` and resolves it against the exam's branch. Absence of a `calendar_days` row
means the school is not in session, and the sitting is refused with that sentence - the same rule the
rest of the calendar obeys, said where a caller can see it. `date` is not a column, so it is filtered
out of the write-field check by `columnsSent` and `calendar_day_id` is substituted in its place;
otherwise a field policy denying `calendar_day_id` could be walked around by spelling it `date`.

## Per-document ingest mode: `now` and `defer` (2026-09-24)

`POST /ingest/file` on the retrieval engine has a second door. `mode=now` is what it has always
done: parse, chunk and embed on the retrieval server's own CPU, including OCR for an image and
transcription for an A/V file. `mode=defer` stores the bytes and runs **nothing**, so a GPU machine
can collect the file later and do the chapter-shaped pipeline - propose a chapter split, confirm it,
extract topics per chapter, crop figures, embed. Better output, arrives much later.

Which door a document takes is a property of the document, not of the deployment, so it is a column:
`content_items.ingest_mode`, `now | defer`, defaulting to `now`. A caller who says nothing gets the
behaviour they already had, and the migration
(`20260924131519_add_content_item_ingest_mode__plane_tenant`) is one `ADD COLUMN ... DEFAULT 'now'`,
so every existing row reads as `now` without a backfill.

It is on the item and not on the asset because ingest is per item: the indexer pushes one content
item, with that item's labels and that item's confirmed placements, and an asset may back more than
one item. Two items over the same PDF may legitimately want different doors.

### `held` is a fifth index status, and it had to be

A deferred upload answers `status: "held"` with a `document_id` derived from the tenant and the
checksum. Without a name for that, `outcomeOf` would have fallen through to its `default` and
recorded every held upload as **failed** - and the sweeper re-drives `failed`, so every deferred
upload would have been pushed again on a timer, for ever. `held` is terminal, it is not swept, and
it does not write `engine_document_id`: the id the engine returns is the id the document *will*
have, and search joins on that column. Storing it now would make an unindexed item answer searches
with nothing. The same reasoning already applies to `parked`; the two are kept apart because the
follow-up differs - `parked` waits for a human to confirm a chapter split on the engine, `held`
waits for a GPU machine to collect the file.

### Two conflicts, refused at the API rather than discovered at the engine

The engine enforces both of these itself, with a 422 and a 409. Relying on that would put the
refusal in a background indexing worker, hours after the upload, where the person who uploaded
cannot see it. So emerge-core mirrors both rules at the write that creates the conflict.

**A held upload is PDF-only.** `ingest_mode=defer` on an item whose asset is not a `.pdf` is a 422
that names the file and says OCR and transcription run immediately anyway, so `now` is not a
downgrade for an image or a recording. The test is the file extension, because the extension is what
the engine routes on - `indexing.IsPDF` is that rule in one place, used by both the HTTP refusal and
the indexer. An item with **no** asset is refused the same way: `asset_id` is immutable, so an item
that names no bytes at creation will never name any, and `defer` on it is a preference that can
never fire.

**A held upload cannot carry chapter tags.** The engine refuses `curriculum_node_ids` with
`mode=defer` because a held upload's `Document` is minted later, from a bundle built elsewhere, so
tags passed at upload would be dropped in between. Refusing beats dropping: a document its owner
believes is tagged, and which is not, is a chapter that answers every query with nothing.

### The ordering, which is the part that matters

An item can be placed against a chapter at any time, including long after upload, so the conflict
has two doors and both are shut:

- `PATCH /library/{id}` moving an item to `defer` while a **confirmed** placement with a
  `curriculum_node_id` exists is a 409.
- `PATCH /placements/{id}` confirming a placement that carries a `curriculum_node_id`, on an item
  that is already `defer`, is a 409.

Neither silently wins. The refusal text is the same sentence in both directions, because it is the
same fact.

What is *not* refused is as deliberate:

- A **proposed** placement does not conflict. Nobody has accepted that suggestion and the indexer
  never sends it, so there is nothing to drop.
- A **whole-curriculum** placement (`grain = curriculum`) does not conflict. It carries no
  `curriculum_node_id` and is never sent as one. The predicate in `checkDeferrablePlacements` is
  character for character the predicate in `confirmedNodesForItem`: the refusal fires exactly when
  the ingest would have sent something.
- **Creating** a placement never conflicts, because a placement is created `proposed` and
  `createPlacement` refuses any other status outright. Confirming is a separate request, and that is
  the request that is checked.
- An update that does not mention `ingest_mode` leaves the column alone, so a rename on a deferred
  item is not a re-assertion of the mode and is not re-checked.

`internal/service/indexing` carries the same two checks as a backstop, before the bytes are fetched
from the object store. The API is the door callers come through, but a row seeded or migrated in by
something else would otherwise burn a full upload to earn a 409.

## Uploading through emerge-core rather than straight at the bucket (2026-09-24)

`POST /library/assets` still hands back a presigned `upload_url` and nothing about that changed.
Alongside it there is now `PUT /api/v1/library/assets/{id}/content`, which takes the raw file bytes
and relays them to the object store itself. Both roads end in the same place: an object under the
row's `storage_key` carrying `x-amz-checksum-sha256`, and the row at `ready`.

The reason is that the presigned road cannot be made reliable from a browser. It failed in
production twice on the same day for two unrelated reasons — mixed content, then a
`connect-src 'self'` CSP — and neither is fixable by a build-time allowlist, because the object
store's host comes out of each school's S3 profile. It is tenant data. A second school on a
different bucket host breaks the allowlist again. The browser already talks to emerge-core
successfully, so the bytes go there.

### The bytes are never held

`store.Put` takes an `io.Reader`. The handler hands it `r.Body` wrapped in an `uploadCheck`, and the
AWS SDK copies straight from that onto the wire. A textbook is hundreds of megabytes and this runs
in a shared container, so nothing along that path may materialise the body.

Two things were in the way and both are about the SigV4 signer, not about `io.Copy`.

The SDK decides the payload hash dynamically: over HTTPS it signs `UNSIGNED-PAYLOAD`, but over plain
HTTP — which is how MinIO is reached in development — it computes the SHA-256 by draining the stream
and seeking back to the start. An `http.Request.Body` cannot seek, so that path fails outright
rather than buffering, which at least fails loudly. The answer is that we already know the digest:
it is on the asset row. `signingKnownPayload` inserts one finalize middleware before
`ComputePayloadHash` that calls `v4.SetPayloadHash`, and the existing middleware then skips its
work. The hash has to be set inside the stack, not on the caller's context: it is stored with
`middleware.WithStackValue`, and `invokeOperation` resets those values at the start of every
operation, so a value set outside is silently discarded. Setting it is also strictly stronger than
the HTTPS default — the signature itself now commits to the content hash, so a store that verifies
signatures verifies the bytes.

The second is the content length. `smithyhttp.Request.SetStream` only learns a length from a
`io.Seeker` or from a `Len() int` method; with neither, `ContentLength` stays zero, and net/http
reads a non-nil body with a zero length as "unknown" and switches to chunked transfer encoding,
which SigV4 stores reject. `declaredLength` wraps the reader with the length the asset row already
records. `TestPutDeclaresItsLengthRatherThanFallingBackToChunking` asserts on the request the store
actually received, so a future SDK bump that changes this is a failing test rather than a
production 501.

### The refusals

The asset is fetched through `scopedAsset`, the same predicate every other library handler uses, so
an asset the caller cannot reach is a 404. Never a 403: a 403 would confirm the row exists.

Only a `pending` asset accepts bytes. `ready` is a 409, because overwriting a file other documents
already point at is not an upload, it is a substitution. Two teachers racing on one asset id are
settled at the write, not at the read: the promotion is
`UPDATE ... WHERE id = ? AND status = 'pending'`, and the racer that matches no rows gets the same
409. Without that predicate both would return 200 and one of them would be wrong about whose bytes
are in the bucket.

The SHA-256 and the byte count are verified as the bytes pass, against `sha256` and `size_bytes` on
the row; either mismatch is a 422. This is not belt and braces. The presigned flow bound
`x-amz-checksum-sha256` into the signature and let the object store do the checking, so a relay that
skipped the check would quietly remove an integrity guarantee that existed before it. `uploadCheck`
hashes and counts in `Read`; it never buffers to hash.

### Half objects

A mismatch is discovered at the end of the stream, by which time the bytes are already on the wire.
`uploadCheck` answers the final read with `errUploadRefused` instead of `io.EOF`, which tears the
request down before the store can complete the object — a `PUT` whose body ends early creates
nothing. That is the first line. The second is `discardHalfObject`, which deletes the key on any
refusal after the write began, on a context detached from the request so that a client hanging up
does not also cancel the cleanup. Deleting is safe precisely because the asset is `pending`:
`getAssetLink` refuses anything that is not `ready`, so no reader was entitled to those bytes.

The verdict is read off the `uploadCheck` rather than off the error the store returns. The blob
client's `guard` rewrites any error whose text carries a URL, which drops the wrapped sentinel, so
`errors.Is` through the SDK's error chain is not something to rely on.

### Timeouts

The router caps every request at 30 seconds and `cmd/api` sets `ReadTimeout` to 10. Both would cut
a large upload off mid-body. `requestTimeout` gives the one streaming route a 30 minute ceiling and
leaves every other route on the 30 second one, and the handler calls
`http.ResponseController.SetReadDeadline` to lift the server-level read deadline for its own
connection only. Nothing else in the service changes shape.

## Downloading through emerge-core, and why ranges are not optional (2026-09-24)

`GET /library/assets/{id}/link` stays exactly as it was. Alongside it there is now
`GET /api/v1/library/assets/{id}/content`, which streams the object out of the school's store
through core. It is the read half of the change in the previous note and it exists for the same
reason: the presigned URL points at the object store's origin, the app's CSP is `default-src 'self'`
with `object-src 'none'`, and the object store's host comes out of each school's S3 profile, so it
is tenant data that no build-time allowlist can cover. A teacher could upload a file and then not
look at it. Now the browser only ever talks to its own origin.

`blob.Client` grew a `Get`. `PresignGet` hands back a URL; `Get` hands back an `io.ReadCloser`,
the `Content-Length`, the `Content-Type` and the `Content-Range` the store answered with. The
handler copies that reader straight onto the `ResponseWriter`; nothing on the path materialises the
body, and `TestAssetContentWritesTheFirstBytesBeforeItHasReadTheLast` proves it by refusing to yield
the second chunk of the object until the response has already carried the first. Swapping the
`io.Copy` for an `io.ReadAll` deadlocks that test rather than slowing it down.

### Ranges

A browser PDF viewer does not fetch a document in one request. It reads the trailer, then the
cross-reference table, then the pages it is about to show, each as a `Range` request. Answering
`200` with the whole file to every one of those either downloads hundreds of megabytes before the
first page appears or fails outright, so `Accept-Ranges: bytes` and `206 Partial Content` are part
of the feature, not an optimisation on top of it.

The range is parsed against `size_bytes` on the row before the store is touched, which is what lets
`bytes=5000-6000` over a 1000 byte asset be a `416` that never opens a connection, and what makes
the `Content-Range` exact rather than copied from whatever the store said. `parseByteSpan` follows
RFC 9110 on the two cases that are easy to get backwards: a range that runs past the end is clamped
and answered `206`, while a range that *starts* past the end is a `416` carrying `bytes */<size>`.
A header it cannot use at all — an unknown unit, an unparseable bound, a multi-range set, a
last-byte-pos below the first — is ignored and the whole object is served, because a server is
allowed to ignore `Range` but is not allowed to answer it wrongly.

### The declared length

`Content-Length` comes off the row, and so does the arithmetic behind `Content-Range`. That is only
safe if the store agrees, so the length the store reports is compared against the span before a
single header is written; a disagreement is a `409 asset_size_mismatch`, the same code
`markAssetReady` already uses for the same drift. The alternative is declaring a length the handler
cannot deliver, which hangs the client rather than failing it.

### The filename

`file_name` is user-supplied. `mime.FormatMediaType` does the quoting: a name with spaces comes back
as a quoted string, an embedded `"` is backslash-escaped, and a non-ASCII name — which these are,
often — becomes an RFC 2231 `filename*=utf-8''...`. Control characters are stripped and any path
prefix is dropped before formatting. The tests assert by round-tripping the header back through
`mime.ParseMediaType`, so they fail if the header stops being parseable rather than if it stops
being byte-identical to something a test author typed.

### Serving tenant bytes from our own origin

Moving the bytes onto core's origin moves an uploaded `text/html` file onto core's origin too, where
it would be same-origin script. The response carries `Content-Security-Policy: sandbox` and
`X-Content-Type-Options: nosniff` for that reason. `sandbox` drops the response into an opaque
origin, which costs a PDF preview nothing and costs an uploaded HTML file its access to everything.

### The refusals

The row is fetched through `scopedAsset`, the same predicate every other library handler uses, so an
asset the caller cannot reach is a 404 and never a 403. Anything that is not `ready` is a 409
carrying `unreadableAsset`'s wording, which is the string `getAssetLink` already answers with. A
school with no S3 profile is a 503. The route is gated on `core.library.read`, the same capability
as `getAssetLink`.

`TestAssetContentFromPostgresServesOnlyTheAssetsTheViewerMayReach` runs against a real tenant
database. Dropping the reachability predicate out of `scopedAssets` makes it answer `200` with the
bytes of an asset behind another person's private note — which is the whole reason this route
cannot be trusted to a stub driver.

### Timeouts

`streamsItsBody` now matches the `GET` on `/content` as well as the `PUT`, so a download gets the
same 30 minute ceiling an upload does instead of the router's 30 second one, and the handler lifts
the server's 30 second `WriteTimeout` for its own connection with
`http.ResponseController.SetWriteDeadline`.

### An index with no chunks is not an index

The engine reports `status: "indexed"` for a document it built zero chunks out of. It names a
document id, `outcomeOf` mapped that to `index_status = indexed`, and the item was then searchable
in every sense except the one that matters: retrieval matches chunks, and there were none. A teacher
searching that book gets the same empty result they would get from a query that simply missed, and
nothing anywhere distinguished the two.

`JobResult` now decodes `chunks` and `blocks`, and `outcomeOf` refuses to call a result indexed when
the count is present and zero. The refusal sits after the switch, next to the existing guard on a
success that names no document id, because it is the same condition: the engine said yes and there
is nothing to retrieve. It therefore covers `duplicate` as well as `indexed` — adopting the document
id of a document the engine says holds zero chunks would scope every search of that item to an empty
document.

Both counts are decoded as `*int`, and the guard fires only on a count that is present. This is the
whole difficulty of the change. `_duplicate_result` on the engine side does not carry counts, and
neither did any engine build before the counts were added, so a missing count read as zero would
fail every re-upload of a document the engine already holds and every document an older engine
indexes. Absent and `null` both mean the engine declined to say, which is not a claim that the
document is empty. `TestIndexerReadsAnAbsentChunkCountAsUnknownNotZero`,
`TestIndexerReadsANullChunkCountAsUnknown` and `TestIndexerTreatsADuplicateWithoutCountsAsIndexed`
hold that line; making `Job.Chunks` report `(0, true)` for a nil pointer fails all three plus
`TestIndexerTreatsADuplicateAsIndexed`.

`blocks` is decoded but never guarded on. Chunks are what retrieval matches; blocks are layout, and
a source type that chunks without producing layout blocks would be perfectly searchable with zero of
them. The count is used only to write a better reason: zero blocks means nothing was read out of the
file at all, which reads as a scan or an image-only PDF, while a positive block count with zero
chunks means the file parsed and the text extraction came back empty. Those need different things
done to them, and the person reading the reason is the one who has to do it.

The status is `failed`, not a new one. `parked` and `held` describe the same "nothing retrievable"
condition, but each of them also tells the reader to wait for a specific pipeline step, and neither
is ever swept — a zero-chunk parse borrowing one of those states would sit there forever wearing an
instruction that does not apply to it. `failed` puts the item back in the sweeper's retry loop,
which re-pushes identical bytes and gets an identical empty parse until the backoff reaches its six
hour cap. That cost is accepted deliberately: an empty parse is cheap on the engine side, and the
retry loop is the only path by which the item becomes searchable on its own once the engine's text
extraction improves. A state that never retries would need an enum value on `index_status`, a
migration, and a sweeper exclusion, and it would trade that recovery for nothing the reason string
does not already provide.

### A create that names no ingest mode infers one from the asset

`POST /api/v1/library` used to fall back to the column default, `now`. It now infers: a PDF asset
gets `defer`, everything else gets `now`. The immediate path does none of the work a real textbook
needs — no chapter split, no per-chapter topics, no figure crops — and an image-heavy PDF pushed
through it has already come back as zero chunks from zero blocks and been recorded as a success.
Deferral is how a PDF is actually ingested, so it is what a caller who says nothing should get.

Inference is not the same as a request, and the two paths are now separate functions rather than
one function reading a flag. `explicitIngestMode` validates what the caller wrote and then runs
`checkDeferrableAsset`, which still answers 422 for `ingest_mode=defer` on a non-PDF or on an item
with no asset at all. `inferredIngestMode` never writes a response: it resolves to `defer` only
where deferral is legal and to `now` everywhere else. The distinction is the whole point. A caller
who asked for something impossible must be told, because quietly ingesting now when they asked to
hold would lose them the chapter split they were waiting for. A caller who asked for nothing has
not asked for deferral and must not be refused for it — routing the inferred mode through
`checkDeferrableAsset` would 422 every note and every image upload that works today.

`inferredIngestMode` swallows the asset lookup error and resolves to `now`. It is choosing a
default, not validating input, and `now` is the default it is replacing, so a failed lookup lands
on exactly today's behaviour. An asset id that names nothing still fails at `Save` with the
foreign key error it has always produced.

The column default on `content_items.ingest_mode` stays `now`. The handler at
`internal/transport/http/library.go` is the only non-test writer of a content item and it always
supplies the value, so the column default decides nothing in production. More to the point, a
column cannot see the asset: the legality rule is a property of `assets.file_name`, one join away,
and a column default of `defer` would mark rows deferred with no PDF behind them — held uploads
with nothing to hold, a state this handler refuses to create. It would also silently move the test
fixtures and seeds that insert items directly, none of which are about ingest mode.

`checkDeferrablePlacements` is not reachable on create. It counts confirmed placements against a
curriculum node for an item id, and a create has no item id until the row is written; the payload
carries no placements, so the count is zero by construction. The constraint only has to fall back
on a path where an existing item with existing placements moves to `defer`, and that path — the
PATCH handler — only ever acts on an explicit `ingest_mode`, where a refusal is correct.

## One engine document, several content items

`content_items.engine_document_id` was `UNIQUE` from the migration that created the table. That
encoded an assumption which is simply false about this library: that no two rows ever point at the
same document in the retrieval engine.

The engine derives a document id from `(tenant, checksum)`. Identical bytes always produce the
identical id, and the engine answers `job_status: "duplicate"` naming the document it already
holds rather than erroring — which `outcomeOf` correctly maps to `indexed`, because the bytes are
in the engine and are retrievable under that id. Filing one textbook to 9A and again to 9B is
ordinary work, and both content items *should* carry the one document id. The unique index made
the second `record` fail with `23505`, `Index` then marked the item `failed`, and the sweeper
re-drove it on the retry cadence forever. Two rows in DPS-NGP were in that loop.

The fix is `20260924193701_drop_content_item_engine_document_unique`, generated through
`go run ./cmd/migrate make -plane tenant ...` from the schema change alone: `.Unique()` comes off
the field and `index.Fields("engine_document_id")` goes into `Indexes()`. The column stays indexed
because `reachableDocuments` looks rows up by it on the hot path of every search. `cmd/migrate`
already passes `schema.WithDropIndex(true)`, so the diff comes out as the drop plus the plain
index, with no hand-written SQL and no hand-edited `atlas.sum`.

Dropping a unique index is safe against a table that holds rows using it: the index goes, the
rows do not, and nothing has to be rewritten. It was verified that way rather than assumed — on a
scratch database replayed to the previous migration, with rows stamped, a second row for the same
document refused with `23505` before the migration and accepted after it. `DROP INDEX` carries no
`IF EXISTS` and needs none: every school database reaches this state through this directory and
Atlas's revision table runs each file once.

The two stuck rows recover on their own. They are `failed` and published with an asset, so the
sweeper's `due` query still finds them, and the next attempt records the duplicate's id. No data
migration.

### What losing the guarantee changed, and what it did not

Every other reader of the column keys by content item id — `record`, `markFailed` and `Abandon`
all address `UpdateOneID`, the sweeper claims by row id, and `resolve.go` reads
`item.EngineDocumentID` out of a map that is already keyed by item. None of them could see a
second row and none of them changed.

`internal/transport/http/search.go` was the only place a document id was itself a key, and it is
the place where collapsing several items onto one would be a disclosure. `reachableDocuments`
built a `map[string]uuid.UUID`: with two items behind one document the map kept whichever row the
query returned last. It now returns `map[string][]uuid.UUID`, ordered by item id so the answer is
stable, and a passage carries `content_item_ids` — every filing this caller may reach that holds
those bytes — alongside the existing `content_item_id`, which is the first of them.

The security layer is unchanged and still decides first: the re-check query is
`engine_document_id IN (...) AND LibraryItemsFor(viewer, decision)`, so an item this caller cannot
reach is not in the list whatever document it shares. The same book filed to 9A and to 9B names
only the sections the caller actually reaches, and a passage whose document only a stranger's
filing claims is dropped as `unreachable` exactly as before.

Page narrowing moved from per document to per `(document, item)` for the same reason. The scope
records which item contributed each span, and `searchScope.admit` keeps only items the scope
itself placed and whose spans admit the page. Without that, a curriculum-node search would name a
sibling filing that is placed on no node at all — asserting a mapping the syllabus point does not
have — and two placements of different items on one document would merge their spans into a range
admitting the pages between them, which is the merged-range mistake `sole()` exists to avoid. A
document the scope never named is left alone, so the whole-tenant path, which sends no pre-filter,
narrows on nothing and behaves as it always did.

`reachableSearchScope` still counts rows, not documents, against `MaxSearchDocuments`. Two items
sharing a document now cost two against the cap while sending one id to the engine, so the refusal
fires slightly earlier than it strictly must. That errs towards refusing rather than towards a
silently truncated filter, which is the direction this cap is for.


### Three standing API defects, settled together

`PATCH /branches/{id}` used to take a new `code`, return 200 and change nothing. `code` is
`Immutable()` on the schema, so the update builder has no `SetCode` and the key fell through the
handler unread. The caller had no way to learn its rename had not happened. The refusal now uses
`rejectImmutable`, the helper the timetable, curriculum and placement handlers already share:
422, naming the field, with the same sentence those endpoints produce. 422 rather than 400 because
the body parses and the field is real; what the server declines is the request, not the syntax.
The guard sits after `rejectUnauthorizedFields`, matching `updateCurriculum`, so a caller who may
not write `code` at all still hears 403 first and is not told which fields are immutable.

Sections could be given a room or a class teacher but never have one taken away. Go's
`encoding/json` gives a nil `*T` both for an absent key and for an explicit `null`, so a handler
reading only the pointer cannot tell "leave it alone" from "make it empty". The repository already
solves this: `response.DecodeFields` returns the keys actually present in the body, and
`wasCleared(sent, field, value)` in `common.go` reports the combination nil-pointer-but-key-present.
That is a shared convention, not something `subjects.go` invented locally — `students.go`,
`timetable.go` and the offering handler all use it — so `updateSection` adopts it rather than
growing a second shape. Its counterpart `rejectNull` covers the other half: on `name`, `code` and
`status`, which always hold a value, an explicit null is a 400 that says to omit the key instead of
a 200 that quietly ignores it. `capacity` clears alongside `room_id` and `class_teacher_id`; it is
optional and nillable in exactly the same way, and leaving it out would have made three adjacent
lines of one handler disagree about what null means.

`minutes_per_week` has been on `subject_offerings` and read by the timetable exporter since the
column was added, with nothing able to set it. It belongs to the offering, so it is the offering
handlers that own it, on create and on update, clearable on update like `periods_per_week` beside
it. Validation is split the way `marksValid` splits: a negative week is 400, the same as negative
marks, and it is checked in the handler rather than left to the schema's `NonNegative()` so the
caller gets our sentence and not ent's. More than 10080 minutes is 422 — a well-formed request
naming a week longer than a week is. That bound is absolute arithmetic, not a policy about how
much a school teaches; anything tighter would be a guess, and `periods_per_week` deliberately keeps
no upper bound at all for that reason.

### Evaluative and practice assessments, and the lesson a sitting still does not cancel (2026-09-25)

`exams` gains `assessment_kind` (`evaluative | practice`, default `evaluative`) and a nullable
`result_weight`. The distinction sits on the exam and not on `exam_subjects`: a school schedules
"Unit Test 1" as a whole, and an exam where some subjects count toward the result and others do not
has no plausible reading. `maximum_marks` stays required for both kinds, because a practice test out
of 20 is still out of 20 and making marks optional to express "practice" would conflate two
different things.

**A practice assessment carries no weight at all, and weight zero is not how one is expressed.**
Both halves of that sentence are enforced. `result_weight` on a practice exam is a 422 naming the
contradiction rather than a silently dropped field, because the weight is a statement that the
assessment counts, and dropping it would leave the caller believing something the database does not
say. A weight of zero is a 422 for the same reason from the other side: it is the shape that would
otherwise become the informal way to say "practice", and it would reach a report card as a
zero-weighted line for a test a child did badly on, in a document a parent reads. That second
refusal (`exams_result_weight_positive`) is beyond what the roadmap asked for; it is here because a
permitted zero makes the flag optional in practice, which is the trap §2.3 of the roadmap spends a
paragraph on.

**One check covers both directions, and the update path is where the merging lives.**
`examAssessmentValid(w, kind, weight)` takes the pair that the row will hold after the write.
`createExam` passes what the body asked for. `updateExam` cannot pass the body alone: a request
naming only `assessment_kind` must be judged against the weight the row already carries, and a
request naming only `result_weight` against the kind it already has. So the handler folds the body
over `current` — the enum falls back to `current.AssessmentKind`, the weight to
`current.ResultWeight` unless the body sends a value or an explicit null — and hands the merged pair
to the same function. Setting `practice` on an exam that already carries a weight is refused by
exactly the code that refuses a weight on an exam that is already `practice`; neither direction has
its own rule to drift from the other.

The explicit null is the escape hatch, and it uses the convention already in `subjects.go` and
`sections.go`: `wasCleared(sent, field, value)` distinguishes an absent key from a sent `null`, so
`{"assessment_kind":"practice","result_weight":null}` is accepted in one request. Without it a
weighted exam could never become practice, which is a refusal that teaches nothing — the point is
that the two statements must travel together, not that one of them is permanent.

`exams_practice_has_no_weight` is also a check constraint in the database. It is a backstop, not the
mechanism: dropping the handler refusal turns the contradiction into a 409 carrying
`that value is already taken, or it references a row that does not exist`, which is a sentence about
nothing the caller did. The handler refusal exists so the client is told which two fields disagree.

**What is not enforced, and is owed by §4 rather than forgotten.** The roadmap also says that
`student_results` rows are created only for evaluative exams and that report-card generation filters
on `assessment_kind = 'evaluative'` and can never be configured otherwise. **Neither table exists.**
No guard was written against them, and no placeholder was added: a check against a table that is not
there is a comment pretending to be code. The same applies to "changing `assessment_kind` on an exam
that already has results is refused" — there are no results to detect, so the rule cannot be
approximated by anything honest today. Whoever builds marks entry owns all three, and they are
written down here so that they are found rather than rediscovered.

The migration is `20260925050931_add_exam_assessment_kind.sql`: two columns and two checks on
`exams`, no other churn. It was proved on a throwaway `exam_kind_probe` database built by replaying
every earlier tenant migration, seeding a branch, a session and an `exams` row, and only then
applying the new file — the pre-existing exam came out `evaluative` with a null weight, which is the
correct migration of meaning, because everything scheduled so far was scheduled to count. On that
same database, practice-with-weight, weight-zero and an update flipping a weighted exam to practice
were each refused by the named constraint, and practice-without-weight and evaluative-with-weight
were each accepted. `cmd/migrate apply` then took `DPS-NGP` from 18 to 19 and reports `up to date`
on a second run.

**The lesson a sitting displaces is still not cancelled.**

Investigated and deliberately not built, because it is materially larger than the flag above and a
half-built transactional lifecycle is worse than a documented gap. What it needs, so the next
attempt starts from the findings rather than from the roadmap:

1. **A deviation cannot name the sitting that created it.** `timetable_deviations` carries
   `timetable_slot_id`, `deviation_date`, `kind`, `section_id`, `period_id`, `subject_offering_id`,
   the substitution fields, `reason` and `created_by`. Nothing there is a link to an
   `exam_sittings` row. Matching on date and period would collide with a deviation a human created
   for the same lesson, and deleting on that match would delete their work. The smallest honest
   change is a nullable `exam_sitting_id` on `TimetableDeviation` with an `edge.From` to
   `ExamSitting` annotated `entsql.OnDelete(entsql.Cascade)` — which makes "deleting a sitting
   removes the deviations it created" a property of the foreign key rather than handler code, and
   leaves human deviations untouched because theirs is null.
2. **The unique index decides the collision, and the decision is not obvious.**
   `(timetable_slot_id, deviation_date)` is unique, so if a human has already cancelled that lesson
   on that day, the sitting's own cancellation cannot be inserted. Failing the sitting would be
   wrong — the lesson is already cancelled, which is the state the sitting wanted. Adopting the
   existing row would be worse: deleting the sitting would then delete a human's deviation. The
   defensible reading is that the sitting proceeds, writes no deviation for that slot, and owns
   nothing it did not create.
3. **Moving a sitting is not expressible today.** `calendar_day_id`, `period_id` and `section_id`
   are `Immutable()` on `ExamSitting`, and there is no `PATCH /exam-sittings/{id}` route — only
   POST under the subject, GET and DELETE. "Release the lessons it no longer displaces" therefore
   has no code path to hang on: a move is a delete and a re-create, which the cascade in (1) already
   handles correctly. Supporting a real update means dropping `Immutable()` on three fields and
   adding a route, both of which are contract changes that should be asked for rather than assumed.
4. **The clash helper would have to hand back what it displaced.** `settleSittingClash` returns a
   bool; `displacedSlotIDs` is called inside it with the day's whole set of placements — the fresh
   sitting plus every sitting already on that day — because that is what the clash query must
   exclude. The deviation write needs the slots displaced by the fresh sitting alone, so the helper
   has to return that narrower set rather than discard it.
5. **The pair must commit together**, which `createExamSitting` cannot do as written: it calls
   `client.ExamSitting.Create()` directly. The shape to copy is `attendance.go:747` or
   `periodgrades.go:342`, both of which open `client.Tx(ctx)` in the handler.

Until that exists, a sitting clash-checks against the lesson it displaces and then leaves it showing
as scheduled. That is the current honest gap, and it is worth stating plainly: the calendar is not
wrong yet, it is incomplete, and half of this pair committing would make it wrong.

### The section calendar: one date-indexed answer, and what it deliberately does not subtract

`GET /api/v1/sections/{id}/calendar` (`internal/transport/http/sectioncalendar.go`) exists because a
section's year could previously only be assembled client-side from four reads — the branch calendar,
the section's slots, its deviations and its sittings — which is four chances for a client to
disagree with the server about what a Tuesday holds.

**Shape: dense by date, not sparse by event.** The response is one entry per date in the requested
window, in order, whether or not anything happens on it. A caller rendering a month iterates the
array straight onto the grid; there is no gap to reconcile and no date arithmetic to get wrong. The
alternative — a list of occurrences the caller buckets by date — pushes exactly the reconciliation
this endpoint exists to remove back onto the caller.

**Three states of a date, not two.** `in_session` is a nullable boolean and `calendar_day_id` is
always present as a key:

- `in_session: true` — a readable `calendar_days` row exists and a half is open.
- `in_session: false` with `calendar_day_id` set — the row exists and both halves are shut; the
  `day_type` says why (a holiday reads differently from an exam-only day).
- `in_session: false` with `calendar_day_id: null` — the branch calendar never mentions this date.
- `in_session: null` — the date has a calendar row that this viewer may not read. Saying `false`
  there would be a claim the viewer has not earned.

The open/shut rule is not restated here. `service.Calendar` plus `SessionDay.Open` already own it
(`internal/service/timetable/calendar.go`), and a second copy in the transport layer would be the
one nobody notices drifting.

**Why a period can be empty is answerable without a second call.** Cancelled lessons are returned,
marked `state: "cancelled"`, rather than filtered out: present-and-cancelled and absent-entirely are
different facts and a teacher needs to tell them apart. For the periods that were never scheduled at
all, each date carries its `schedules` — the `(period_scheme_id, bell_schedule_id)` pairs from
`calendar_day_schedules` — so a client can fetch the period roster once per scheme and know every
period that exists that day. Repeating the roster on every date would multiply the payload by the
length of the window for data that is identical across it.

**No `half` parameter, on purpose.** Lessons carry a resolved half; exam sittings do not, and
nothing on `exam_sittings` says which half a period falls in without re-deriving the bell span. An
endpoint that filtered the lessons by half and silently let the sittings through would be answering
two different questions in one payload. Both `forenoon_open` and `afternoon_open` are on every date,
so a half-day caller has the facts to narrow it itself.

**The window is required and capped at `timetablesvc.MaxRangeDays` (400 days).** Required because an
unbounded read over a tenant is a scan that grows with the school's history — the same reason
`/timetable-occurrences` and `/timetable-calendar` require `from` and `to`. Capped at 400 rather
than a fresh number because that constant already governs every other windowed timetable read; a
second cap would be a second thing to keep in step. The handler checks it before any query so the
refusal costs nothing, and `validRange` enforces it again inside the service.

**Reachability is a 404, and it is derived from the row predicate rather than asserted separately.**
A section is reachable when the decision is unfiltered, or when the viewer can read at least one
timetable slot or deviation belonging to it under `access.TimetableSlotsFor` /
`access.TimetableDeviationsFor` — the same predicates that then narrow the lessons. That coupling is
the point: widening the predicate to leak another section's lessons also makes that section
reachable, so one mutation trips both tests. A 403 would confirm the section exists, which is
already more than a pupil asking about 9B should learn. The consequence to know: a restricted viewer
asking for a section that has no timetable at all gets a 404, because there is nothing they can be
shown to have reached it by.

**Two known gaps, stated rather than papered over.**

1. A sitting still writes no cancelling deviation, so the lesson it displaces resolves as `planned`
   and the calendar shows both on the same period. Filtering the lesson out here would hide the
   defect, and would then hide it twice over once the deviation write lands.
2. `CalendarDaysConstrainedBy` returns `NoCalendarDay` for any constraint at all, so a grant pinned
   to a section reads that section's lessons and none of the branch's calendar days. Such a viewer
   gets `in_session: null` on every date with its lessons still listed — coherent, but thin. The fix
   belongs in `internal/data/access/timetable.go`, not here.

### Result composition: three tables, and where "activated" is

`result_schemes`, `result_components` and `result_component_exams` are the configuration behind
roadmap §2.5. They carry no arithmetic: nothing in this repo computes a result, and the aggregation
rule is written in the roadmap so that §4 implements the stated rule rather than inventing one.

`exams.result_weight` is gone, in its own migration
(`20260925053913_drop_exam_result_weight.sql`), together with `exams_practice_has_no_weight` and
`exams_result_weight_positive` and the handler validation that named them. A weight on the exam is
global, but a half-yearly weighs differently in Science than in Art, and "best two of four" has no
per-exam weight at all. **`assessment_kind` stays**, untouched: it says whether an assessment counts,
which is a different question from how much it is worth, and the two refusals are now in two places
rather than one.

**Activation is the transition into `status = active`, and it is the PATCH that does it.** That
forced a deviation from `grading_schemes`, whose status is `active | inactive` defaulting to
`active`: a scheme that is born active would have to pass the composition check at create, when it
has no components and cannot possibly add up, which is precisely what §2.5 forbids. So
`result_schemes.status` is `draft | active | inactive` defaulting to `draft` — the three-state shape
`exams` and `timetables` already use — and `POST` refuses any status but `draft`
(`result_scheme_starts_in_draft`). The check runs on any revision that *leaves* the scheme active,
not only on the crossing, so editing `total_marks` on an active scheme is caught by the same code
path that activated it.

The check itself would be trivially bypassable — activate a valid scheme, then change a weight —
so **a component, and a component's exam links, may only be written while the scheme is draft**
(`result_scheme_not_draft`). An unattached scheme may be returned to draft and reopened; one that
already composes a subject offering may not, and is superseded instead, exactly as
`reviseGradingScheme` does it. The successor copies every component and every exam link and starts in
draft, so `supersedes_id` is reachable rather than decorative.

Two of the five §2.5 validations are enforced at row write rather than at activation, deliberately.
`take_best` present iff `aggregation = best_of`, and `weight`/`maximum_marks` positive, are knowable
the moment the row is sent; there is no state of construction in which a negative weight is a
legitimate intermediate value, the way a sum that has not yet reached 100 is. Checking them at
activation only would also make them unreachable, because both are check constraints
(`result_components_take_best_iff_best_of`, `result_components_marks_positive`) and the database
would have refused the row first — an activation branch that can never be taken is a comment
pretending to be code. The two that genuinely need the whole scheme — Σ `weight` = `total_marks`,
and a `best_of` component linking at least `take_best` exams — are the ones activation checks.

Σ `weight` is compared at the column's own scale rather than with `==`. The weights are
`numeric(8,2)`; summed as float64, `33.33 + 33.33 + 33.34` is `100.00000000000001`, and an exact
comparison would refuse a composition the school entered correctly. `sameMarks` rounds both sides to
two places, which is exactness at the precision the database stores, not a tolerance.

A `practice` exam is refused at link time (`practice_exam_cannot_be_composed`) rather than at
activation, because the contradiction is knowable immediately: §2.3 says a practice assessment does
not count, and a link would say it does. An exam from another academic session is refused there too.
That refusal is not in §2.5; it is here because `result_schemes.academic_session_id` is immutable and
the whole table is session-scoped, so a cross-session link is meaningless and would be discovered by
§4 rather than by the person who made it.

`violates(err, index)` narrows ent's `IsConstraintError` to a named index before claiming a code or a
name is taken. Without it a check-constraint violation reports "this scheme already has a component
with that name", which is a lie that would have been believed — it was the actual output of the
mutation that dropped the `take_best` coupling.

The migrations were proved on a throwaway `result_probe` database built by replaying every earlier
tenant migration and seeding a branch, a session, an offering and two exams, one of them carrying
`result_weight = 20`. After both files: the weighted exam survives as `evaluative`, the column and
its two checks are gone, `subject_offerings.result_scheme_id` exists and is null on the pre-existing
row. On that same database `best_of` without `take_best`, `sum` with `take_best`, a zero weight and a
duplicate `(component, exam)` pair were each refused by the named constraint. `cmd/migrate apply`
then took `DPS-NGP` from 19 to 21 and reports `up to date` on a second run.

**`subject_offerings.result_scheme_id` has no write path yet.** The column, the edge and the
migration are here; `offeringPayload` in `subjects.go` does not carry it, so it can only be set from
the database. That file belongs to another agent.

### The subject a substitution displaced (2026-09-25)

A substitute may teach another subject. That already worked — `applyDeviation` moved
`occ.SubjectOfferingID` to the deviation's offering — but it worked by overwriting, and the
occurrence kept no trace of what had been overwritten. Teacher and room did not behave that way:
`fromSlot` has always set `PlannedTeacherID` and `PlannedRoomID` from the slot and left them alone
while the deviation moved `TeacherID` and `RoomID`. Subject was the one of the three dimensions that
answered "what is happening" without also answering "what was meant to happen". So a Physics period
covered as Maths resolved to an occurrence indistinguishable from a period that was always Maths:
nothing in the row, and nothing in the calendar built from it, said Physics had lost a period. A
lesson planner reading that surface would see no gap and re-plan nothing.

`Occurrence.PlannedSubjectOfferingID` completes the trio. It is set in `fromSlot` from
`slot.SubjectOfferingID` and `applyDeviation` never touches it, exactly as with the planned teacher
and the planned room. The value cannot be taken from the deviation row instead: `createTimetableDeviation`
copies the slot's offering onto the deviation when the caller does not send one, so
`deviation.subject_offering_id` is populated on almost every deviation and says nothing about whether
the subject moved.

**It is reported even when it equals the subject taught.** The alternative — emit it only on a real
substitution — was rejected because it overloads absence. Absence would then mean "unchanged", "there
was no slot", "the slot carried no subject", and "this build predates the field", with no way to tell
them apart. Emitting it always leaves one rule: the field is present exactly when a timetabled slot
stands behind the occurrence and that slot named a subject. It is no noisier than `planned_teacher_id`
and `planned_room_id`, which have always been repeated on every ordinary lesson. `room_change` and
`time_change` therefore report planned and taught subjects that are equal, which is the honest answer:
they displaced nothing.

**`added` carries no planned subject at all.** An added class stands on no slot, so nothing was
displaced, and the field is absent — alongside an equally absent `planned_teacher_id` and
`planned_room_id`, and a `state` of `added` that says why. Absent-with-`state: added` is "nothing was
displaced"; absent on a slot-backed occurrence means that slot named no subject (a slot may carry a
`label` instead). There is no "I do not know" case to distinguish, because the planned value is read
from the slot the occurrence was generated from, never inferred.

**`cancelled` is unaffected and did not need to be.** A cancellation does not overwrite the subject,
so planned and taught both remain the timetabled offering; the lost period is carried by
`State == cancelled`, which was already legible, and which is a different fact from displacement. The
`SubjectDisplaced()` predicate is false on a cancelled occurrence deliberately: the subject was not
replaced by another, it was replaced by nothing. A consumer wanting "this section is a period short in
subject X" reads `state == cancelled` or `SubjectDisplaced()`, and `planned_subject_offering_id` names
X in both cases.

The field reaches the wire without further work at either read surface.
`GET /api/v1/timetable-occurrences` and `GET /api/v1/sections/{id}/calendar` both hand the whole
`Occurrence` to `projectAll`, which marshals the struct and then removes keys a restricted field policy
does not permit; neither endpoint projects a hand-written subset, so a new field appears for every
viewer whose policy is unrestricted, which is the default. Nothing was registered in the field
catalog, consistent with `planned_teacher_id`, which has no entry either.

The widening mutation that proves the tests: restoring the old behaviour by adding
`occ.PlannedSubjectOfferingID = dev.SubjectOfferingID` beside the existing assignment in
`applyDeviation` fails `TestSubstitutionRecordsTheSubjectItDisplaced` at the service layer and
`TestSectionCalendarHandsOverTheSubjectASubstitutionDisplaced` at the endpoint, each reporting the
covering subject where the displaced one belongs.
### A teacher being away is a fact; who covers the lesson is a decision (2026-09-25)

`TimetableDeviation` already records every per-date change to a lesson, including `substitution`. What
it cannot record is *why*: the register of a teacher off sick for three days was, until now, a scatter
of unrelated substitution rows written from memory, with nothing saying they belonged together and
nothing at all saying which of that teacher's lessons had been missed. `teacher_absences` records the
fact — this teacher, this window, this reason, recorded by this person — and `GET
/api/v1/teacher-absences/{id}/lessons` joins the two: every lesson the absent teacher has in the
window, each marked `covered`, `uncovered` or `cancelled`. The uncovered ones are the whole point of
the feature.

**An absence writes no deviations, and that is deliberate.** Who covers a lesson depends on who is
free, who knows the subject and who is already covering three other things; none of that is in this
database, so a rule that auto-assigned cover would be guessing, and a guess written as a substitution
is indistinguishable from a decision a human made. Auto-cancelling is worse: a school covers lessons,
it does not delete a section's Tuesday because a teacher has flu, and a cancellation silently removes
teaching the section is entitled to. So recording an absence is inert — the test named
`TestAnAbsenceRecordsTheFactAndArrangesNoCoverByItself` asserts that zero deviations exist afterwards
— and cover is arranged by the existing `POST /api/v1/timetable-deviations`, unchanged. The two rows
never contradict each other because they state different things: one is about a person, the other
about a lesson. What the pair can do is *disagree in usefulness*, and the endpoint that shows the gap
between them is the answer to that.

**Half days, because the calendar already has them.** `calendar_days` carries `forenoon_open` and
`afternoon_open`, occurrences carry a `half` derived from the bell schedule, and a teacher at a
dentist until noon teaches that afternoon. So the window is bounded at both ends by a half:
`from_date`+`from_half` to `to_date`+`to_half`, defaulting to forenoon→afternoon, which makes a whole
day the thing you get by naming one date. Day-granularity would have forced every half day to be
recorded as a whole one and reported every morning lesson as affected. The bound is enforced in the
database as well as the handler: `teacher_absences_window_ordered` rejects a window that ends before
it starts, including same-day afternoon→forenoon.

**Overlaps are refused, not merged.** Merging rewrites a record a human wrote — two overlapping rows
generally carry different reasons, and the merged row would have to discard one. Allowing them means
every count of "days absent" double-counts. So a second recorded absence intersecting an existing one
is a 409 naming the row it clashes with, and the caller amends that row instead. Touching windows are
not overlaps: an absence starting Tuesday afternoon may sit against one ending Tuesday forenoon, which
is why the comparison is on (date, half) and not on dates alone. Withdrawn rows do not block anything.
A partial unique index on `(teacher_id, from_date, from_half, to_date, to_half) WHERE status =
'recorded'` backs the identical-window case at the database; a general range exclusion would need
`btree_gist`, and adding an extension to every tenant database is a bigger change than this feature
earns. Two concurrent requests recording *differently* overlapping windows can still both land.

**Withdrawal is a state, not a delete.** `DELETE /api/v1/teacher-absences/{id}` sets
`status = withdrawn` with `withdrawn_at`, `withdrawn_by` and an optional `?reason=`; the row stays
readable and the constraint `teacher_absences_withdrawal_dated` keeps the status and the timestamps
from drifting apart. A hard delete would destroy the only explanation for substitutions that are
already on the calendar. The cover itself is never touched — a human arranged it, possibly by
telephone, and the teacher covering may have already turned up — so the withdrawal replies 200 with
`cover_left_in_place`: the substitutions inside the window that now have no absence behind them. That
is the honest answer to "the two can disagree": we keep both and we say so, rather than deleting a
decision to tidy up a fact. A withdrawn absence cannot be amended; record a new one.

**Authorization reuses the timetable keys.** `core.timetable.read` / `.write` / `.delete`, matching
the neighbouring deviation routes, paired with `read_all` / `write_all` / `delete_all` as the breadth
probe. No new capability key was declared: an unregistered key fails exactly like an ungranted one,
and this project already carries 42 in that state. Row narrowing lives in `teacherAbsencesFor`: tenant
reach sees every absence, `self` and `teacher_assignment` reach see only the viewer's own, guardian
reach sees none. A section or grade-level pin cannot be translated into a statement about a person, so
a pinned grant is denied rather than silently widened — the same choice `CalendarDaysConstrainedBy`
makes. An unreachable absence is a 404, never a 403, because 403 would confirm that a named colleague
is off sick. Recording an absence for a teacher the grant does not reach is a 403, since there is no
row to hide.

Lessons are resolved per branch, from the branches the absent teacher actually teaches in, because
`Service.Resolve` is branch-scoped; both the slot and the deviation predicates are narrowed by the
viewer, so a teacher reading their own absence sees their own lessons and a head of department sees
all of them.

### Homework as a second source of a result component (2026-09-25)

`result_component_assignments` links a `result_component` to the assignments that feed it, unique on
(component, assignment), beside the `result_component_exams` that shipped with the composition
tables. It is a second link table rather than a nullable `exam_id`/`assignment_id` pair on one table,
because a row that is sometimes one thing and sometimes another cannot carry a foreign key to either.
A component may now draw from exams, from homework, or from both, and §2.5's arithmetic is untouched:
an assignment contributes `marks_obtained ÷ assignments.maximum_marks`, the same fraction an exam
contributes, so a worksheet out of 10 and a unit test out of 40 still compose without either being
rescaled by hand.

**"At least `take_best` sources" now counts both kinds.** It was stated for exams alone because exams
were the only source. The refusal message names the split — *"Class work" takes the best 2 but only 1
sources are linked to it (1 exams, 0 assignments)* — so a teacher who linked one of each and expected
best-of-two can see that both were counted.

**A component with no source of either kind cannot activate.** Previously only `best_of` was checked,
so a component could carry a weight and be fed by nothing: the scheme would add up to its total on
paper while a slice of every child's result could never be filled. That is a hole in the hundred, not
an empty draft, and the sum check cannot see it because the weights still add up. The refusal names
the component and what it carries. This is deliberately checked at activation rather than at insert,
like every other composition rule — a component is created before its sources are linked.

**There is no assignment analogue of the practice-exam refusal, and none was invented.**
`exams.assessment_kind` is an evaluative flag with consequences elsewhere — it gates `student_results`
and the report card — so a link contradicting it is refused. `assignments.assignment_type` looks
similar (`worksheet | project | reading | practice | test`) but is a taxonomy of the *shape of the
work*; nothing in the codebase reads it except its own validator. Refusing a `practice` worksheet
would invent an evaluative meaning the column has never had, and would overrule exactly the choice
§7.1 puts in the scheme's hands: whether homework counts is the curriculum's decision, and linking it
*is* that decision being recorded. `assignments.status` is not a bar either — a draft assignment may
be composed in advance, the same way a draft exam already may.

**`assignments.maximum_marks` is nullable, and zero passes its check constraint, so the denominator
is not guaranteed.** Reading chapter four is a real assignment with nothing to be marked out of. A
link to such an assignment makes the fraction undefined, so it is refused at link time with 422
`assignment_has_no_maximum` naming the assignment; and because the maximum can be cleared *after* the
link by a PATCH on the assignment itself, activation re-checks every linked assignment and refuses
with the title of the first one that has lost its maximum. Failing loudly in both places is the point:
the alternative is a divide by zero or a silent nought against a child's name. What is *not* closed
here: `PATCH /assignments/{id}` will still let a teacher clear the maximum of an assignment that a
draft scheme links, and only the next activation attempt will say so. Refusing it at the assignment
belongs in `assignments.go`.

**Cross-session is the constraint that transfers; cross-offering is not.** An assignment carries its
own `academic_session_id`, so the exam rule applies unchanged: a component may not be fed by homework
from another year. There is no offering equivalent to enforce — a result scheme is attached to many
`subject_offerings`, and an assignment's `subject_offering_id` is optional, so requiring a match would
refuse both the ordinary case of one scheme serving a whole grade and the ordinary case of homework
set outside any single offering.

The routes mirror the exam ones exactly — `GET`, `POST /result-components/{id}/assignments` and
`DELETE /result-components/{id}/assignments/{assignmentID}` — gated by `core.subject_offerings.read`,
`.write` and `.delete` with the curriculum breadth keys, and refused while the scheme is not in draft.
Supersession copies assignment links alongside exam links, so a scheme that is superseded rather than
edited does not quietly drop half of what fed it. The link's foreign key to `assignments` is
`ON DELETE NO ACTION`, like the exam link: deleting an assignment that composes a result is refused by
the database rather than silently emptying a component.

Nothing here computes anything. These are still only the configuration tables; the arithmetic is §4's,
and marks entry does not exist yet.

### The third door: withdrawing a maximum an assignment is already composed into (2026-09-25)

Linking homework to a result component already refuses an assignment with no usable denominator
(422 `assignment_has_no_maximum`), and activation re-checks every linked assignment. Both doors
guard the *scheme*. The one left open guarded nothing: `PATCH /assignments/{id}` is an assignment
route, it has no idea a result draws on that row, and the damage it does is invisible until someone
tries to activate a scheme weeks later — by which time the person who changed the mark total has
long since forgotten doing it. That is the failure worth designing against, not the arithmetic.

`updateAssignment` now refuses to withdraw a maximum that a component is composed from. Withdrawn
means exactly what the link-time check means — `maximum_marks` sent as `null`, or sent as a value
`<= 0` — because a nought denominator and a missing one are equally unusable. The refusal is 422:
the body is well-formed and the field is the caller's to write, the server declines on a fact about
the row's relationships.

**It fires only when a link exists.** Clearing the maximum of an assignment nothing composes is
ordinary teaching — a reading task that stops being marked — and stays a 200. So does every other
edit to a composed assignment, and so does *raising* its maximum; the only refused change is the one
that leaves the fraction undefined. A blanket "composed assignments are frozen" would have been
cheaper to write and would have broken the common case to protect the rare one.

**The message names what holds it, because the person clearing the mark total does not know.**
It quotes the assignment, then every component that draws on it and the scheme that component
belongs to, then the remedy: unlink it there first. Naming *all* of the holders rather than the
first matters — a single-holder message would be a trail of refusals, one per component, each
looking like the server changing its mind.

> "Fractions worksheet 3" is scored into the component "Homework" of the result scheme "Annual
> composition", which takes the fraction it contributes out of its maximum_marks; marked out of
> nothing that fraction is undefined and the scheme could never be activated. Unlink it there
> first, or leave it a maximum_marks above zero.

The lookup of the assignment is scoped by `AssignmentsWritableBy`, so an assignment the caller
cannot reach still answers 404 and the refusal never leaks the existence of a row, or a scheme's
name, to someone with no business seeing either.

**Create needs no such check, and this was checked rather than assumed.** Only two paths write
`result_component_assignments`: the link route, which requires the assignment to exist and applies
the link-time refusal, and supersession, which copies links between components of existing schemes.
Neither can produce an assignment that is born composed, and `POST /assignments` takes no link
field — it rejects unknown fields outright. An assignment created with no maximum is therefore
still fine: nothing is drawing on it yet.

**One thing found on the way, left alone deliberately.** `PATCH /assignments/{id}` never actually
cleared `maximum_marks`: the builder calls `SetNillableMaximumMarks`, which ignores a nil, and there
is no `ClearMaximumMarks` beside the `ClearDueAt` that `due_at` has. Sending `"maximum_marks": null`
was a silent no-op, so the only live hole was zero. The refusal still covers the null case — telling
a caller the server declines is better than appearing to accept and doing nothing, and it means the
day someone adds the clear, the door does not reopen. Making the null actually clear is a behaviour
change to the write path and was not smuggled in under a guard commit.

This closes the open item recorded at the end of §7.1's note on `maximum_marks`: all three doors —
link, activate, and edit the assignment — now refuse the same undefined fraction.

### The arithmetic of §2.5, as a package that touches nothing (2026-09-25)

`internal/service/results` is the rule from roadmap §2.5 and nothing else: marks and a scheme's
shape in, a score and its breakdown out. No ent client, no context, no transaction. That is not
tidiness — it is what let every case below be decided against a table of numbers instead of against
a seeded database, and it is why marks storage and result persistence can each land without
touching the arithmetic.

The input types describe a composition, not a row. `Scheme` holds `TotalMarks` and `[]Component`;
a `Component` holds `MaximumMarks`, `Weight`, `Aggregation`, `TakeBest` and `[]Source`; a `Source`
is a `SourceRef{Kind, ID}`, a label and a maximum. **`SourceKind` is `exam` or `assignment`**,
because §7.1 already answered that a component draws from both, and a package that knew only about
exams would have to be reopened the day `result_component_assignments` is read. A component mixing
the two aggregates them identically — a fraction is a fraction, whatever produced it.

**A mark is a status and a number, not a nullable number.** `scored`, `absent`, `exempt`. An absent
or exempt mark carrying a figure is refused rather than ignored: a caller that writes
`{status: absent, obtained: 35}` has misread its own row, and silently discarding the 35 is how a
child loses marks invisibly. A mark with no status at all is refused for the same reason — the zero
value of a struct must not be a valid statement about a pupil.

#### Absent, exempt and zero are three facts, and they do three things

A **zero** is a sat assessment. It produces a fraction of 0, counts as a source, and drags an
average down; that is the whole point of it.

An **absence** is the lack of evidence, so it contributes no fraction and is not counted as a
source. Under `average` and `best_of` the denominator shrinks: two sat tests of 0.8 and 0.6 average
to 0.7, not to 0.35. Under `sum` there is no denominator to shrink, so an absence is arithmetically
indistinguishable from a zero and costs the pupil those marks. That asymmetry is not an oversight —
it is what the two aggregations mean. `average` and `best_of` ask how well a pupil performs; `sum`
asks how much of a whole they assembled, and a piece never submitted is a piece not assembled.

An **exemption** removes the source exactly as an absence does, for every aggregation. The
difference is at the component: **a component every source of which is exempt is excused**, and its
weight leaves the denominator of the final score; **a component every source of which was missed is
scored zero**, and its weight stays. So `Result` carries three totals rather than one —
`TotalMarks` as the scheme declares it, `ComponentTotal` as the components actually add up, and
`AssessedTotal` as what applied to this pupil. `Percentage()` is the score over `AssessedTotal`,
which is the number `grading_schemes` should band: a pupil excused from a 40-mark component and
scoring 45 of the remaining 60 is at 75%, not at 45%.

Partial exemption does not excuse. One exempt source beside one absent one leaves the component
scored, at zero. An exemption is a statement that an assessment did not apply; it excuses only what
it wholly accounts for, and mixing it with lost evidence is not an excuse for the lost evidence.

A source with no mark at all is a fourth thing again, and it is not a fact about the pupil but about
the school: nothing has been entered yet. It is excluded from the aggregation like an absence, but
it sets `Result.Complete` to false, so a caller can tell a result that is finished and poor from one
that is not finished. An absence leaves `Complete` true — it is a decided fact, not outstanding work.

#### best_of when the pupil sat fewer than N

Activation guarantees a `best_of` component links at least `take_best` sources. It guarantees
nothing about attendance. Best two of four where three were missed averages **the one fraction that
exists**, not that fraction over two. Dividing by `take_best` regardless would smuggle back in the
absence-as-zero rule that the paragraph above rejects, by arithmetic rather than by decision.
`ComponentResult` reports `Counted` against `Linked` so the shortfall is visible rather than
inferred.

**Ties are broken by link order**, via a stable sort on the fraction alone. The number is unaffected
— tied fractions are interchangeable — but *which* sources read as `counted` and which as
`not_among_best` is not, and a breakdown that names different tests on two viewings of the same
report card is a bug report from a parent. A test asserts the outcome vector is identical across
twenty runs.

#### A mark above its maximum is refused, not clamped and not trusted

Both of the obvious choices are worse. **Trusting** it yields a fraction above 1, which no
aggregation bounds except `sum`: an `average` of 1.1 and 0.9 puts a component above its own weight
and a pupil above 100, silently. **Clamping** repairs the data in the only place anyone would have
noticed it was broken, and the bad row lives forever. Refusing costs a batch of results one bad mark
— fixable in one edit — and is the only option that says so out loud. The same reasoning refuses a
negative mark, a source with a zero or absent maximum (the fraction is undefined, not zero), a
component with no sources at all (returning 0 would silently deflate the final score by that
component's whole weight — a plausible wrong number, the worst kind), and two marks for one source.

The consequence to hold on to: if grace or moderation marks above a paper's maximum ever become a
requirement, this is the decision that has to be revisited, and revisited per aggregation — a
fraction above 1 means something under `sum`, where the cap absorbs it, and nothing coherent under
`average`.

**`single` over more than one linked source is refused** too. §2.5 says "the one fraction"; with two
links, taking the first, the highest or the mean are all inventions. This is a rule the activation
checks do not currently state, and it belongs there as well.

An **unbalanced scheme is computed, not refused.** Σ weight ≠ `total_marks` is activation's business;
a draft under construction must still be previewable, so `Compute` returns the number and
`Balanced()` reports the discrepancy.

#### Where it rounds, and where it must not

Fractions and aggregations are carried at full precision; rounding a fraction to two places and then
multiplying by a weight of 60 injects up to a third of a mark. Rounding happens at exactly two
boundaries, both of them things a person reads:

- each component's `ObtainedMarks` and `Contribution`, to two places, from the **unrounded**
  fraction;
- the final `Score`, to two places, from the **rounded** contributions.

That second choice is deliberate and has a visible cost. Summing unrounded and rounding once is
closer to the true value, but then the printed component lines need not add to the printed total,
and a parent who adds the column and gets a different number has found a bug whatever the
mathematics says. Three components of weight 10 at a fraction of one third print 3.33 each and a
score of 9.99, not 10.00. The breakdown adding up is worth the hundredth.

The `sum` cap is the same class of problem §2.5 already hit with `33.33 + 33.33 + 33.34`. Fractions
of 0.1, 0.2 and 0.7 sum to `1.0000000000000002`; the cap flattens it to 1, but `Capped` is only
reported when the excess exceeds 1e-9, because telling a teacher that marks were discarded when
float noise was the only excess is a lie about a child's paper. Component fractions are published
rounded to six places so a JSON breakdown never shows `0.30000000000000004`, while the arithmetic
behind them uses the full value. Two places is the same precision `sameMarks` already compares
weights at, which is the scale `numeric(8,2)` stores.

#### One thing §2.5 says twice, differently

The prose says a component "aggregates fractions, then multiplies by its own `maximum_marks`";
the code block says `final = Σ (component fraction × component weight)`. Those are different
numbers whenever `maximum_marks ≠ weight`, which is the normal case — the worked example's
half-yearly is out of 40 and carries 20. The package computes **both** and keeps them apart:
`ObtainedMarks` is fraction × `maximum_marks`, the figure a report card prints beside the component
("30 of 40"), and `Contribution` is fraction × `weight`, the figure that adds into the final score.
Only `Contribution` reaches `Score`. Read that way the two sentences describe two columns of the
same row rather than contradicting each other, and no third interpretation was invented.

#### The output is built to answer "why is this 87?"

`Result` carries every component and every component carries every linked source, with the mark, the
fraction and one of five outcomes — `counted`, `not_among_best`, `absent`, `exempt`, `not_entered`.
A teacher asking why a class test does not appear in the total gets `not_among_best` rather than
silence, and a report card generator has the per-component line it needs without recomputing
anything. The types carry JSON tags for that reason: the breakdown is the response body, not a
private intermediate.

#### What the tests are for

Twenty-five of them, no fixtures, 100% of statements. The §2.5 worked example runs end to end —
half-yearly 30/40 weighted 20, best two of four class tests weighted 20, annual 70/80 weighted 60,
giving 15.00 + 17.00 + 52.50 = 84.50. Five widening mutations were run against them and each was
caught: `best_of` taking the lowest N (four tests failed), the `sum` cap dropped (a component
returned a contribution of 47.5 against a weight of 25), an absence counted as a zero (the average
test and the best-of shortfall test), an exemption never excusing, and a mark above its maximum
trusted instead of refused.

### Marks against an exam — `student_exam_marks`

#### The grain is (pupil, exam subject), not (pupil, sitting)

`ExamSubject` is "Science in the half-yearly, out of 40"; `ExamSitting` is "9A sits it on the 14th,
period 3". A mark hangs off the **exam subject**, and `exam_sittings` stays purely scheduling.

Three reasons, in order of weight.

`exam_subjects` is the row that carries `maximum_marks` and `pass_marks`. A mark is meaningless
without its denominator, so hanging it anywhere else means a join before the number can even be
validated. The unique index is `(exam_subject_id, student_id)`: a pupil sits Science in the
half-yearly exactly once, and the database says so.

A sitting is plural and optional. `exam_sittings` is unique on
`(exam_subject_id, calendar_day_id, period_id)`, so one paper can legitimately have several — a
two-period paper, or a re-sit on a later day. Keyed by sitting, a two-period paper would give a
pupil two rows and neither would be "the mark". And an `ExamSubject` with no sitting at all is legal
today, so an unscheduled or take-home paper could not be marked.

A sitting adds nothing about *which pupils*. `exam_subjects.subject_offering_id` already narrows to
one section's worth of pupils, because a subject offering is section-scoped. `exam_sittings.section_id`
restates that.

**What the sitting gives you is the workflow, not the identity.** It names a section and a date,
which is how a teacher finds the thirty papers in front of them, and it is what the section calendar
composes. The mark carries a nullable `exam_sitting_id` to record which sitting the pupil actually
attended — the only way to distinguish the 14th from the re-sit on the 20th — validated at the
handler to belong to the same exam subject, and used for nothing computed.

#### Absent, exempt and zero are three facts, not one

`status` is `marked | absent | exempt`, and `marks_obtained` is nullable:

```
CHECK ((status = 'marked' AND marks_obtained IS NOT NULL)
    OR (status <> 'marked' AND marks_obtained IS NULL))
```

A zero is `marked` carrying `0.00`. An absence and an exemption carry no number at all, and the
constraint makes "absent, 0" unrepresentable rather than merely discouraged. The handler refuses the
same thing at 422 before the database ever sees it, so the error a teacher reads is a sentence and
not a constraint name.

The distinction is not cosmetic and it is not for §4's arithmetic to guess: an absence is a pupil
who did not sit a paper they were meant to sit, and a school may well want it to count against them;
an exemption is a pupil who was never expected to sit it, and its component must be dropped from the
denominator rather than scored as nothing. Collapsing the two produces a report card that is wrong in
the direction nobody audits. **No row at all** is the fourth state — not yet marked — and needs no
enum value, because a mark that has not been entered is an absent row, not an absent pupil.

#### Refusals, not clamps

A mark above `maximum_marks` is 422 and nothing is written, matching `assignments.go:1367-1369`.
A negative mark is 400, matching `assignmentMarks`. Neither is clamped: a teacher who typed 41 out
of 40 made a mistake worth seeing, and silently storing 40 buries it.

#### The bulk write is all-or-nothing

`POST /api/v1/exam-marks/batch` takes one `exam_subject_id` and up to 200 entries, because entering
a whole class is the actual workflow. Every row is validated **before** the transaction opens; one
bad row refuses the batch with the offending `index` and `student_id` in the body, and nothing is
written. Partial acceptance was rejected deliberately: "22 saved, 8 rejected" leaves a teacher
unable to say which eight without re-reading thirty papers, and a half-entered class is exactly the
state that produces a wrong result nobody notices. Naming a pupil twice in one batch is 422 for the
same reason — last-write-wins would silently pick one of two numbers. A second pass amends rather
than duplicating, so re-submitting a corrected class is the same request.

#### Authorization: two narrowings, and an unreachable row is a 404

Reads compose `HasStudentWith(access.StudentsForAcademic(viewer, decision))` with the exam-subject
scope `exams.go` already uses. The student arm is the load-bearing one: a pupil reaches
`StudentsSelf`, a guardian `StudentsOfGuardianAcademic`, a teacher `StudentsTaughtBy`. Dropping it
lets a pupil read every classmate's mark on any paper they sat — that mutation was run and three
tests caught it with a real 200 carrying another pupil's number.

Writes narrow twice: the same student arm, **and** `markableExamSubjects`, which for a restricted
viewer is `SubjectOfferingIDIn(viewer.SubjectOfferingIDs)` — the offerings they actually teach, not
the sections they merely take a register for. A class teacher of 9A may read 9A's Science marks and
may not write them. A pupil or guardian reach resolves to no exam subject at all, so the write path
denies before the student arm is consulted.

Every failure to reach is a 404 with the same body as a row that does not exist. The bulk paths
follow the `attendance.go` idiom instead and answer 422 with the list of pupils, because the request
named those pupils out loud and a row-shaped 404 would say nothing about which of thirty was the
problem.

A pupil not actively enrolled in the paper's subject offering is refused at 422 even for a
tenant-wide grant. That pupil did not sit that paper, and a mark row for them is a data-entry slip,
not a permission question.

#### What this deliberately does not do

No totals, no percentages, no grades, no `student_results`. Marks are the record; everything derived
from them is recomputable and belongs to `internal/service/results` and the later items of §4.
`exam_subjects.grading_scheme_id` is left where it is — resolving a band here would put a second,
staler copy of the grade beside the mark.

`assessment_kind` is not consulted anywhere on this surface. A practice test is marked and shown to
the pupil exactly like any other; §2.3's rule is that it does not *feed a result*, which is a filter
for the result builder, not a refusal at marks entry.

#### The gate reuses `core.timetable.*`

Read is `TimetableRead`/`TimetableReadAll`, write `TimetableWrite`/`TimetableWriteAll`, delete
`TimetableDelete`/`TimetableDeleteAll` — the same keys the whole exam surface already uses, already
registered in CAS and already held. A dedicated `core.exam_marks.*` family would read better, but a
capability key that is declared and unregistered is a dead endpoint, and nothing in this change can
register one.

#### Deleting the paper cannot delete the marks

`student_exam_marks.exam_subject_id` is `ON DELETE NO ACTION`. Deleting an exam subject, or the exam
above it, now fails with a 409 once any mark exists against it. That is the intended behaviour: the
alternative is a cascade that erases a child's record as a side effect of tidying up an exam.
`exam_sitting_id` is `ON DELETE SET NULL` — rescheduling a paper must not destroy the marks — and
`student_id` cascades, because a mark with no pupil is not a fact about anything.


### Seeding a year of assessment that the product itself would have accepted (2026-09-25)

`cmd/seeddemo` filled a school with structure, people, a timetable and attendance, and then stopped
short of everything the school exists to do. `exams`, `exam_subjects`, `exam_sittings` and
`result_schemes` were all empty, so no exam or result screen had ever rendered against real rows and
nobody could tell a working screen from a broken one. `cmd/seeddemo/exams.go` fills them.

#### Seeded rows that the API would have refused are worse than no rows

The seeder writes through the ent client, not through HTTP, so every guard the handlers apply is
bypassed. That is a licence to create a scheme whose weights do not add up, a `best_of` component
with one source, or a practice exam wired into a result — rows that look right on a screen while
testing nothing, because no user action could ever have produced them. So the checks the handlers
make are made again here, in the seeder, against the same rows: `activationRefusal` is the seeder's
own copy of `resultSchemeActivationRefusal`, and a scheme that fails it aborts the run rather than
being written and left inactive. A component's exams are checked for `assessment_kind = practice`
and for session agreement before the link is made; a linked assignment is checked for a
`maximum_marks` above zero. None of these can fire with the plans as written, which is the point:
they are there so that editing a plan into something the product forbids fails loudly.

#### A sitting is placed against the real clash engine, not a hand-rolled imitation

`createExamSitting` runs `timetablesvc.AllRules()` over the day, having first excluded the timetable
slots the sitting displaces. Reimplementing that arithmetic in the seeder would produce a second
definition of "clash" that could drift from the first. Instead the seeder calls the same service the
same way, twice and for different reasons.

Once while placing: each round of papers is proposed as a whole cell — one date, one period, every
section — and if the engine reports anything blocking, the cell moves to the next eligible day. Once
after writing: every sitting in the database is read back, grouped by day, and re-proposed exactly as
`sittingsOfDay` would compose it, with the displaced slots excluded. A blocking clash there aborts
the run with a non-zero exit, because a seeded clash is a seeded bug.

The placement check deliberately ignores sittings already in the database and looks only at the
timetable, its deviations and the cell being proposed. That keeps placement a pure function of the
calendar, so a second run computes the same dates as the first and the query-then-skip guards find
every row where they left it. The verification pass is the one that sees everything.

#### Why a whole-school cell rather than one paper at a time

A sitting displaces only its own section's lesson in that period. Place one section's paper alone and
the subject teacher is still timetabled to teach another section at that hour, which is a teacher
clash the engine correctly refuses. Placing every section in the same period empties that period
across the branch, and the only remaining risk is two sections sitting a subject whose teacher they
share. The round builder handles that directly: it walks the sections in order, rotating each grade's
subject list by the round number, and skips any subject whose teacher is already invigilating in that
cell. A greedy first-fit is not enough: with four teachers over four sections it leaves a section
unseated in a round where a full seating exists, and a section left out keeps its lesson running in
the period the exam takes, which is the teacher clash the engine then refuses. So the round is an
augmenting-path matching over sections and teachers, preferring each grade's rotated subject order
and backtracking when a preferred teacher is already invigilating. `TestEveryRoundSeatsEverySection`
pins that: with the backtracking removed, the four-teacher school fails.

If a day cannot take a cell in the period the rotation prefers, the other teaching periods of that
day are tried before the day is abandoned, which matters on a timetable where one period is busier
than the rest.

#### The worked example, and the one that exercises homework

`RS-STD-100` is the scheme that was asked for: the half-yearly out of 40 carrying 20, the best two of
four class tests of 10 carrying 10, and the annual out of 80 carrying 70. `RS-HW-100` is the same
shape with 10 moved off the annual onto the average of three homework portfolios, because
`result_component_assignments` shipped without ever being exercised. Both are activated; a draft
scheme proves nothing. Only `RS-STD-100` is attached to the subject offerings, which leaves the other
unused and therefore still open to the revise path rather than the supersede path.

The maxima are deliberately uneven — 40, 20, 80, and a practice test out of 25 — because a scheme
whose parts are all out of 100 never exercises the fraction arithmetic of §2.5.

`PRAC-1` carries `assessment_kind = practice`, has papers and sittings like any other exam, and is
linked to no result component at all. An exam surface that has never rendered a practice assessment
has not been tested, and a practice assessment that feeds a result is the one thing the kind exists
to prevent.

#### Idempotence is per row, keyed on what the schema already makes unique

Every row is looked up before it is made, on the key its unique index already enforces: an exam on
`(session, branch, code)`, a paper on `(exam, subject_offering)`, a scheme on `(session, code)`, a
component on `(scheme, name)`, a link on its pair. A sitting is looked up on `exam_subject_id` alone
rather than on the full `(exam_subject, day, period)` index, so that a paper which already has a
sitting is never given a second one somewhere else. Components are only written while the scheme is
still `draft`, which is the rule `resultSchemeIsDraft` applies to the API, so a re-run against an
active scheme leaves its composition alone.

### An online test is an exam with a delivery mode

The requirement was that a teacher can run online tests, that practice ones save marks without
touching the curriculum, and that some online tests do count. Both halves are already answered by
`exams.assessment_kind`, which `internal/service/results` reads to decide whether an assessment can
feed a `result_component`. So an online test is not a new entity: it is an `exam` with
`delivery = online`, added as an enum defaulting to `in_person` so that every exam written by a path
that never mentions the column keeps the meaning it had. A parallel `online_tests` table would have
duplicated marks, duplicated the practice flag, and forced `result_component_exams` to learn about
two kinds of source; auto-marking instead writes `student_exam_marks`, the same table a teacher writes
by hand, and nothing downstream can tell whether a mark came off paper or out of a browser.

**Questions hang off `exam_subject`, not off `exam`.** The invariant worth protecting is that the
questions add up to what the paper is out of, and `maximum_marks` lives on `exam_subject`.
`student_exam_marks` is keyed `(exam_subject_id, student_id)`, so auto-marking must produce exactly
one number per exam subject per pupil, which means an attempt is an attempt at one exam subject. An
exam spans several subject offerings, each with its own maximum and its own roster, so questions on
`exams` would have had no maximum to be checked against and no roster to be sat by.

**Σ question marks is checked at publish, not on every write.** This follows
`resultSchemeActivationRefusal`, which lets a half-built scheme exist as a draft and refuses the
transition to `active` until the component weights account for every mark. `onlinePublishRefusal` is
the same shape: a draft test may be built up a question at a time, and publishing it is where the sum,
the option sanity of every single-choice question, and a window that has not already closed are all
insisted on together. Checking the sum on every write would make it impossible to author a paper at
all, because the first question never adds up to the whole.

**Two question kinds earn their place.** `single_choice` is the one that can be auto-marked, and
`free_text` is the one that cannot; the pair is deliberate, because a paper that is half machine-marked
and half waiting for a teacher is the normal case, not an edge case. `true_false` was left out because
it is `single_choice` with two options: identical marking, identical rendering shape, a synonym rather
than a kind. `multiple_choice` was left out because it needs a scoring policy nobody has chosen —
all-or-nothing, partial credit, or negative marking — and a column whose marks are arbitrary is worse
than no column.

**The window is its own row, and does not reuse `exam_sittings`.** A sitting binds
`(calendar_day, period, section)` and is clash-checked against the published timetable for room and
teacher. An online test consumes no room and no teacher slot, may stay open across several days, and
already knows its roster from the subject offering, so all three of those bindings would be noise.
`exam_online_deliveries` is a 1:1 optional extension of `exam_subject` carrying `opens_at`,
`closes_at`, `duration_minutes`, `attempts_allowed`, `allow_late_submission` and its own
draft/published/closed status — the same shape as `question_papers` extending `content_items`. It is
an extension rather than five nullable columns on `exam_subjects` because those columns would be
meaningless for every paper exam, and a check constraint cannot reach the parent table to say so.

**A pupil must never read the correct answer, and never another pupil's work.** Two independent
barriers, because one is a filter and filters get widened by accident. First, the answer key is
authoring surface: every route that can return `is_correct` is gated on `core.timetable.write` and
scoped by `markableExamSubjects`, which yields the never-true predicate for a viewer with no taught
offerings — a pupil is stopped at the door and again at the query. Second, the pupil-facing paper
builds `sittableQuestion`/`sittableOption`, structs that have no `is_correct` field for a value to be
put into; there is no path from the handler a pupil can reach to the column. Attempts and responses
are scoped by `entattempt.HasStudentWith(access.StudentsForAcademic(...))`, the same predicate
`examMarksFor` uses, so a pupil at self reach reaches their own rows and a teacher reaches the pupils
they teach, from one definition rather than two.

**Re-attempts, time limits and late submission, decided rather than left implicit.**
`attempts_allowed` defaults to one; a pupil who already has an attempt in progress is handed it back
rather than given a second. A deadline is computed once when the attempt starts, as
`min(started_at + duration_minutes, closes_at)`, and stored, so moving the window afterwards does not
move a running clock. With `allow_late_submission` false a hand-in past the deadline is refused and
the attempt stays in progress; with it true the attempt is accepted, marked `expired` and flagged
`submitted_late`, and is marked from whatever was saved, because the pupil did the work. Where more
than one attempt is allowed the best submitted attempt is the one the exam mark follows, recomputed on
every submit and every manual award.

**The mark says which half was machine-marked.** The attempt-level flag is
`exam_attempts.awaiting_review`, set when any response is still `unmarked`; the mark carries a remark
naming how many answers await a teacher, and `marked_by` is left null because no person made it.
`student_exam_marks.provisional` was added afterwards, because a remark is prose and nothing
computing a result reads prose — see *A half-marked paper is a number that is not final yet* below. When the last written answer is awarded, the attempt total, `awaiting_review` and the mark are all
settled again and the provisional remark is cleared. Marks on online tests are machine-owned in this
sense: settling one overwrites the remark a teacher may have typed onto the same row.

---

### A half-marked paper is a number that is not final yet (2026-09-25)

An online test with a `free_text` question is auto-marked for the objective half and waits for a
teacher for the rest. That is the ordinary case, not an edge case, and until this change the
half-marked row in `student_exam_marks` was indistinguishable from a finished one: the only
machine-readable signal lived on `exam_attempts.awaiting_review`, a different table that nothing
computing a result consulted. A result computed in that window would have understated the pupil, and
understatement is the direction nobody queries — a low mark looks like a low mark.

#### The flag is derived from `awaiting_review`, never maintained beside it

`student_exam_marks.provisional` is a boolean defaulting to false. It is written in exactly one
place, `settleOnlineExamMark`, and its value comes from exactly one source: whether any of the
pupil's submitted attempts at that paper carries `awaiting_review`. `onlineStandingOf` makes a single
pass over those attempts and returns both the best attempt, which the number comes from, and the
first attempt still awaiting a teacher, which is what makes the mark provisional. The remark is built
from the same struct, so the prose and the flag cannot disagree either.

Deriving rather than maintaining is the whole point. Two booleans updated in parallel by two handlers
is the failure mode; here the mark is a projection of the attempts, refreshed by the same function
that already refreshes `marks_obtained` from them, and both handlers write the attempt before calling
it, so the projection always reads committed truth.

#### Why any attempt, not just the best one

The obvious rule is "provisional if the attempt the mark came from awaits a teacher". It is wrong
where more than one attempt is allowed. Suppose attempt one is fully marked at 10 and attempt two has
been handed in with an unread written answer worth 4: attempt two currently scores 0, so the mark
follows attempt one, and under the obvious rule the mark would read final. Once the written answer is
read, attempt two may overtake attempt one and the mark may rise. The number is not settled, so it
does not claim to be. The rule is therefore: provisional while any submitted attempt at that paper
still awaits a teacher.

#### A paper exam's marks are never provisional

A teacher typing a number has finished, so nothing on the manual path sets the flag: `createExamMark`
and the bulk create rely on the schema default, and the amend paths do not name the column at all.
That also means a manual correction to a mark that is provisional leaves it provisional, which is the
honest state — the underlying responses are still unread and the next award will recompute the number
anyway. The one manual write is `SetProvisional(false)` when an amendment turns the row `absent` or
`exempt`: a pupil with no number has no unfinished number. The database says the same thing, in
`student_exam_marks_provisional_only_when_marked`, so the invariant does not depend on a handler
remembering it. The migration adds the column with `DEFAULT false`, so every row written before this
change reads as final, which is what it is.

#### `Complete` and `Provisional` are different sentences

`results.Result.Complete` already meant "every linked source has a usable mark". A provisional mark is
a different kind of incomplete: there is a number, it is simply not final. Collapsing the two into
`Complete=false` would tell a teacher asking "why is this 87?" that a mark is *missing* when the true
answer is that a mark is *not finished*, and those are not the same conversation with a parent.

So `Result`, `ComponentResult` and `SourceResult` each carry a `Provisional` boolean alongside
`Complete`, and `Result.Final()` is `Complete && !Provisional` — the one predicate anything presenting
a total should ask. A provisional mark still scores, because showing a pupil what is known so far is
useful; it is the claim of finality that is withheld, not the number. A provisional source that was
dropped by a `best_of` component keeps its flag, because finishing it could lift it into the best set.

`Outcome` gains no new value. `counted | not_among_best | absent | exempt | not_entered` describes how
a mark participated in the arithmetic; provisional describes whether the number is settled. They are
orthogonal, and an outcome of `provisional` would make it impossible to say that a provisional mark
was also not among the best. An absent or exempt mark may not be provisional at all, and `Compute`
refuses one with `ErrProvisionalNotScored` rather than quietly ignoring it.

### Attaching a result scheme to an offering, and why only an active one (2026-09-25)

`subject_offerings.result_scheme_id` had been deployed and populated for a while, but only by the
demo seeder writing through the ent client. The API had no write path at all: the column was absent
from `offeringPayload`, from `createOffering` and from `updateOffering`, while reading worked by
accident because the generated struct carries the JSON tag and the handler projects the whole row.
A client could see which scheme composes a subject and could not choose one. It now mirrors
`grading_scheme_id`, its sibling in §2.5 of the roadmap: the result scheme computes the score, the
grading scheme names it, and "how this subject is marked" is both of them. Set on create, set on
update, cleared with an explicit `null`, untouched when the key is omitted — `wasCleared`, not
`DecodeFields` alone.

Only an `active` scheme may be attached. `active` is the one status the product has ever checked:
`resultSchemeActivationRefusal` runs on the way in and guarantees that the component weights add up
to what the scheme is out of, that every component has an exam or an assignment that can fill it,
and that a `best_of` component has enough sources to take the best of. A `draft` scheme has passed
none of that, so attaching one points a live offering at a composition that need not add up to 100.
Worse, it traps the draft: `reviseResultScheme` checks whether any offering references the scheme
and, if one does, supersedes instead of editing, so a half-built draft that has been attached can
never be finished in place — only copied to a successor. `inactive` is refused for the same reason
rather than by analogy: `reviseResultScheme` permits `draft -> inactive` directly, without the
activation check, so an inactive scheme may never have composed correctly either. And a retired
scheme is retired. The refusal is 422 `result_scheme_not_active`, in the same envelope shape as
`result_scheme_not_draft` and `result_scheme_does_not_compose`. The supersede flow still works end
to end: the successor is born in draft, is edited freely because nothing references it, is activated
through the composition check, and is then pointed at by this very update path.

The scheme must also belong to the offering's own academic session. This is an asymmetry with
`grading_scheme_id`, which is checked nowhere — attaching a grading scheme from another session is
accepted today — and the asymmetry is deliberate rather than an oversight to be copied. A grading
scheme is a pure mapping from a number to a label; borrowing last year's is odd but harmless. A
result scheme's components draw from *exams and assignments*, and `linkResultComponentExam` already
refuses an exam from a different session. A cross-session scheme would therefore compose this
offering's result out of another year's assessments. The check costs nothing extra: the scheme row
has to be read anyway to learn its status, and the offering's `academic_session_id` is immutable, so
the update path can read it once and trust it. Reading the scheme first also means an unknown id is
a 404 naming the result scheme, rather than the generic 409 a foreign key violation would produce.

Two things this deliberately does not do. It does not compare the scheme's `total_marks` with the
offering's `maximum_marks` — both are optional, they are set by different people at different times,
and a refusal there would block a legitimate order of operations. And it does not ask whether marks
have already been computed under the scheme being replaced; there is no recorded computation to
consult yet, and re-pointing an offering mid-session is a policy question, not a handler's.

### A pupil's result, computed on the way out and stored nowhere (2026-09-27)

`internal/service/results` had 100% statement coverage and zero callers. Until something called it a
pupil had no result, so `GET /api/v1/subject-offerings/{id}/results` is the caller. It does the
mapping and the reading; it does no arithmetic. Every number in the response comes out of
`results.Compute`, and the handler's whole job is to turn three link tables and two mark tables into
a `Scheme` and a `[]Mark` and to hand them over.

#### Nothing is persisted, and the endpoint is the cache

§2.5 says a result is derived and recomputable and the marks are the retained evidence. There is no
`student_results` table and this change does not add one. A second store would have to be
invalidated by every mark write, every scheme edit, and every paper whose maximum changes — three
writers, one of which is a bulk path — and the first time one of them forgot, a report card would
print a number the marks no longer support. The read is four queries for the composition and two for
the marks, regardless of how many pupils are asked for, so there is nothing yet worth caching. When
there is, the thing to cache is the rendered report card, which is §4's third step, not this.

#### One route, and it does the class as cheaply as the child

A teacher wants a section; a parent wants a child. Both are the same route:
`GET /subject-offerings/{id}/results`, with `student_id` narrowing it to one pupil. That is not a
compromise between the two readings — it is the shape the arithmetic already has. The composition is
a property of the offering, not of the pupil, so it is loaded once and reported once at the top
level; the marks for the whole roster come back in two `IN` queries keyed by the same source ids. A
class of forty costs the same six round trips as one child. Had the route been per pupil, the
teacher's view would have been forty of those, and somebody would eventually have added a batch
endpoint beside it saying the same thing twice.

With `student_id` an unreachable or unenrolled pupil is **404**, never 403, and the same 404 for
both — telling a caller apart "you may not read this pupil" from "this pupil is not in this class"
hands them a roster they were refused. Without `student_id` the list is simply narrowed, so a pupil
listing their own class sees exactly themselves and learns nothing about who else is in it.

#### The authorization is `core.timetable.read`, the key the marks already use

No capability key was invented; registering one is a production CAS change. A result is the pupil's
marks with the arithmetic done, so the grant that reads the marks reads the total: `listExamMarks`
is gated on `core.timetable.read` / `read_all` and so is this. Gating on
`core.subject_offerings.read` was the other candidate and is wrong — it would let someone who may
configure the curriculum read every child's marks through the back door of the endpoint that adds
them up.

Two predicates narrow the read, both already in the tree, and they are ANDed exactly as
`examMarksFor` ANDs them. The offering must be within `examOfferingScope`, which is taught, enrolled
or warded; and every pupil must satisfy `access.StudentsForAcademic(viewer, decision)`, which is the
single row predicate the whole feature rests on. The marks themselves are **not** filtered a third
time. That is deliberate: a mark row silently dropped by a redundant predicate does not produce a
refusal, it produces a *wrong number* — the source reads `not_entered` and the pupil's score falls —
and a quiet understatement is the direction nobody queries.

The field policy is honoured the way `requireResolvedFields` honours it, with a 403 rather than a
partial answer: a breakdown computed from marks the caller may not read is a number nobody could
check. If the grant denies `status`, `marks_obtained` or `provisional` on `student_exam_marks`, the
result is refused and says which.

#### A source with no mark, and a source with no paper, are different absences

The first is §2.5's `not_entered`, and the mapping's only job is not to lose it. Sources come from
the scheme, marks are looked up against them, and a lookup that misses adds nothing to `[]Mark` —
`Compute` then reports `not_entered` and sets `Complete=false`. Building the source list from the
marks instead would have dropped the row entirely, shrinking the denominator of an `average` and
inflating the score in silence. The same rule covers homework: a pupil who never handed a portfolio
in has no `assignment_submissions` row carrying `marks_obtained`, and that is `not_entered`, not
zero. Normalising to fractions is what makes that distinction expressible, and throwing it away
would waste the reason §2.5 normalises at all.

The second absence is new here and belongs to the school, not to the pupil.
`result_component_exams` links an **exam**; marks hang off an **exam subject**; and the scheme is
attached to offerings one at a time, so a scheme may link an exam for which this subject has no
paper. The seeded school does exactly that — `RS-STD-100` is attached to every offering, and the
class tests are only set for Maths, Science and English. Such a source has no maximum, so no
`results.Source` can be built for it at all: `Component.Validate` refuses a maximum of zero, and
inventing one would be inventing a denominator.

So the source is dropped and **named** in `composition.sources_not_set`, and if that leaves a
component with no sources — or with fewer than its `take_best` — the whole component is dropped and
named in `composition.components_not_scored`, with the weight it was carrying. Its weight leaves
`ComponentTotal` as well as `AssessedTotal`, so `Result.Balanced()` goes false and the response says
in arithmetic what the list says in prose. The alternative, scoring such a component zero, would
charge a pupil for a paper the school never set. If *every* component goes that way there is nothing
to compute and the answer is 422 `result_scheme_unfilled_for_offering` rather than an empty result
that reads like a nought.

#### `final` is one flag and it is stricter than `Result.Final()`

The envelope carries `final` per pupil, and it is `Result.Final() && composition.whole()` —
complete, not provisional, **and** composed of everything the scheme says it is. `Result.Final()`
cannot know about the third clause, because the gap was closed before `Compute` ever saw the scheme.
Nothing presenting a total should have to assemble that predicate itself, and a renderer that asked
only `Result.Final()` would print a settled-looking 16 for a pupil whose annual has no paper.

`Compute`'s errors are 422, not 500. Every one of them — a mark above its maximum, `single` over two
linked sources, a duplicated source — is a statement that the configuration or a row is impossible,
which is a fact about the school's data and not about this server. The messages are already written
in the arithmetic package and are returned verbatim, with the `student_id` the refusal was computing
when it hit one.

#### Homework: the latest attempt that carries a number

`assignment_submissions` is per pupil per assignment per attempt. The mark used is the one on the
**highest `attempt_number` that carries `marks_obtained`**, which is the latest attempt a teacher
has actually graded. An ungraded later attempt does not blank the earlier grade — the known number is
still the best statement available — and an assignment with no graded attempt at all contributes
nothing rather than a zero. Homework marks carry no provisional concept: `provisional` is derived
from `exam_attempts.awaiting_review` and lives only on `student_exam_marks`.

#### Tie-breaks, and why the link rows are ordered

The arithmetic breaks `best_of` ties by link order, and a breakdown that names different class tests
on two viewings of the same report card is a bug report from a parent. Link order therefore has to be
a property of the data and not of the query plan, so `result_component_exams` and
`result_component_assignments` are read ordered by `created_at` then `id` — the order they were
attached in.

#### What the tests are for

Eleven DB-backed tests against a real Postgres, no stub driver. The worked example runs end to end
through the endpoint: half-yearly 30/40 at weight 20, class tests 8, 6, 9 and 7 out of 10 with the
best two counting for 10, annual 70/80 at weight 70, giving 15.00 + 8.50 + 61.25 = **84.75**, with
the nine and the eight reading `counted` and the six and the seven `not_among_best`. The printed
component lines are asserted to add to the printed total, which is the rounding decision §2.5 paid a
hundredth for.

Four widening mutations were run, each against the whole package rather than a filtered subset,
because a filter that misses the relevant test makes a mutation look survivable:

- **the viewer narrowing dropped from the roster** — a pupil listing their own offering received a
  classmate's complete breakdown, score and all. Two tests failed.
- **the offering scope widened to every offering** — a teacher of another section reached an
  offering they do not teach. One test failed. The roster predicate still held the marks back, which
  is the point of ANDing two.
- **the provisional flag not carried from the mark** — a half-marked annual read final. One test
  failed.
- **`final` asking only `Result.Final()`** — a history result composed of one fifth of its scheme
  read final. One test failed.

### A sitting cancels the lesson it displaces, and owns only what it wrote (2026-09-27)

The gap the previous note left open — "the lesson a sitting displaces is still not cancelled" — is
closed. `createExamSitting` now writes a `cancelled` `TimetableDeviation` for each lesson the fresh
sitting displaces, in the same unit of work as the sitting row, and deleting the sitting removes
exactly those deviations and no others.

**The link is a column, because nothing already on the row could carry it.** `timetable_deviations`
gained `exam_sitting_id`, nullable, with `ON DELETE CASCADE` back to `exam_sittings`
(`20260927172349_add_deviation_exam_sitting.sql`, one `ALTER TABLE` and one index). The alternative
the roadmap warned about — finding "the deviation this sitting made" by matching date and period —
is not a weaker version of this, it is a different and wrong thing: a teacher may have cancelled the
same period for their own reason, and a delete that matched on date and period would either
reinstate a lesson they deliberately cancelled or destroy their row. The column makes the question
"did this sitting write this?" answerable by looking at the row.

The edge is declared only on `TimetableDeviation` (`edge.To("exam_sitting", ...).Unique().Field(...)`),
with no back-reference on `ExamSitting`. That is not shyness about touching another schema file: the
deviation is the dependent row, nothing needs to navigate from a sitting to its cancellations, and a
`Ref` would add an unused edge to a type that already has five.

**The cascade is the lifecycle, not handler code.** `deleteExamSitting` is untouched. Deleting a
sitting through it, deleting the exam subject above it, or deleting the exam above that, all drop
the sitting's deviations by the foreign key, because there is no code path that could forget. The
same property is what makes a *move* correct without a `PATCH`: there is no update route on a
sitting, and `calendar_day_id`, `period_id` and `section_id` are `Immutable()` on the schema, so
amending one is a delete and a re-create — the delete releases the lessons the old placement held
and the create cancels the ones the new placement displaces. That was checked before anything was
built rather than assumed; `mountExams` mounts GET, POST under the subject, and DELETE, and no more.

**A sitting owns nothing it did not create.** `(timetable_slot_id, deviation_date)` is unique, so if
a human has already cancelled that lesson on that day the sitting's own row cannot be inserted.
Three readings were available and two are wrong. Failing the sitting is wrong because the lesson is
already in the state the sitting wanted. Adopting the existing row — stamping `exam_sitting_id` onto
it — is worse, because deleting the exam would then delete a decision a teacher made for reasons of
their own. So the sitting proceeds, writes no deviation for that slot, and the teacher's row is
neither claimed nor touched. The cost is a real one and is stated rather than hidden: two sittings
that both displace the same slot leave only the first one owning the cancellation, so deleting that
first sitting restores a lesson the second is still sitting on top of. Two sittings in one section
and period are already a student-set clash unless their rosters are disjoint, which makes this an
electives-shaped edge and not a common one; it is written down here because the alternative readings
are worse in more ordinary cases.

**`created_by` is null, and that is the provenance, not a hole in it.** The precedent is auto-marking:
`ClearMarkedBy()` on an automatically marked `ExamResponse` and on an online test's
`StudentExamMark`, paired with a field — `marking = automatic` — that says the system did it. Here
`exam_sitting_id IS NOT NULL` is that field. Attributing the cancellation to the caller would put a
teacher's name against a decision they did not make and would make it indistinguishable, in any
screen that lists who cancelled what, from the cancellations they did make. The reason text names the
exam instead, which is the sentence a teacher actually wants.

**The clash checker hands back what it displaced.** No second clash checker was written.
`settleSittingClash` already computed the set of slots to exclude from `AllRules()` — the lessons the
day's sittings displace — and threw it away; it now returns the subset belonging to the fresh
placement alone. `displacedSlotIDs` became `displacedSlots` so the rows themselves survive the call,
because the deviation needs the slot's `section_id`, `period_id` and `subject_offering_id` and not
just its id. The set excluded from the clash query and the set cancelled are therefore the same
computation, and cannot drift into disagreeing about which lesson an exam replaces.

**What the tests establish, and the one thing they cannot.** Four tests on the real tenant database:
a sitting cancels the lesson it displaces and the section's day then *resolves* as cancelled through
`Service.Resolve`, not merely carries a row; deleting it puts the lesson back to `planned`; a sitting
over a free period writes nothing; and a teacher's own cancellation survives both the sitting and its
deletion. Three mutations were run over the whole package. Dropping the deviation write — the
mandatory widening of the transaction boundary — fails with `found 0`. Dropping the skip over a
deviation the sitting did not make turns the accepted sitting into a 409 from the unique index.
Dropping `SetExamSittingID` alone leaves the first test failing on `got <nil>` *and* the delete test
reporting `found 1` — the cancellation outliving the exam, which is the failure the link exists to
prevent.

The one thing they cannot establish is atomicity under a mid-write failure. `begin` joins an
already-open transaction rather than nesting (`attendance.go`), and `testsupport.TenantTx` hands the
handler a client that is already inside the fixture's rollback transaction, so the handler's own
`rollback()` is a no-op under test and a failed deviation write would leave the sitting row visible
to the assertion. The pairing is therefore proved by construction — one `unitOfWork`, both writes on
`unit.writer`, a single `commit()` — and by the widening mutation, not by a test that forces the
second write to fail.

**The 150 sittings already in production are unlinked, and were not back-filled.** The migration was
applied over a template copy of the demo tenant carrying all 150: the column arrives null on the five
deviations that already exist, every sitting survives, and `confdeltype` on the new constraint is
`c`. Deleting one of those 150 today removes no deviation, because none is linked to it — the lesson
it displaces is still showing as scheduled, which is the state that predates this work and not a new
one. A back-fill would have to guess which deviation belonged to which sitting from date and period,
which is the inference this whole note exists to refuse.

### A PATCH that demands the fields it was not given is a lost update

Two entries of §8 of the roadmap turned out to be one fault wearing two faces: a write path that
cannot tell *omitted* from *sent as null*, and so answers a request nobody made. On
`bell_schedule_periods` it demanded the two fields it was not given; on `assignments` it accepted a
field it then ignored. Both are `PATCH`, the one verb whose whole contract is "change what I named
and leave the rest".

**The bell span had two call sites and only one of them was wrong.** `bellSpanValid` was called from
`createBellSchedulePeriod` and from `updateBellSchedulePeriod`. On the **create** the demand is
correct and stays: `start_minute` and `end_minute` are not nullable and have no default, so a period
admitted without them would be a bell that never rings, and the 400 is the only honest answer. On the
**update** the same demand meant that toggling `runs` — the "no assembly today" switch, which is the
one field this row exists to be edited for — forced the client to read the row and write both times
back. Between that read and that write, another person's retiming was silently overwritten. The
lost update was not hypothetical: it was the *only* way to use the endpoint.

`runs` three lines below was already doing the right thing — `if in.Runs != nil` — and is now the
model for the span as well. `bellSpanChanged` answers two questions the handler previously conflated:
was a span sent at all, and if one was, is it a span. Neither half may be null, because the columns
are `NOT NULL` and clearing them is not a thing a caller can mean; `rejectNull` says so in the house
wording. Sending only one half is a 400 rather than a merge with the stored other half, because
`{"start_minute": 600}` against a row ending at 585 is a request to invert the period, and the two
readings available — refuse it, or read the row and half-honour it — differ in whether the client
learns it was wrong. A span that *is* sent is still judged whole: `start >= 0`, `end <= 1440`,
`end > start`.

An empty `{}` still answers 200 and changes nothing, rather than 404. `updated_at` carries an
`UpdateDefault`, so the builder is never empty and `wroteScopedRow` still sees the row it matched;
the 404 continues to mean "no such row you may write", not "you asked for nothing".

**Clearing an assignment's maximum had to be added *behind* a refusal that already existed.**
`{"maximum_marks": null}` answered 200 and changed nothing, because `SetNillableMaximumMarks` ignores
a nil and no `ClearMaximumMarks` stood beside `ClearDueAt`. The interesting part is that
`keepsAssignmentMaximum` had been refusing that same request with 422 `assignment_feeds_a_result`
since the day it was written — it treats a sent null as a withdrawal through
`assignmentMaximumWithdrawn`. So the guard was gating a write the builder was never going to make:
a composed assignment got a correct refusal, and an uncomposed one got a lie. Adding
`ClearMaximumMarks` after the guard, not around it, makes the guard the only gate rather than a
second one. Clearing is now possible exactly when it was already permitted.

**The mutations, and the trap they had to avoid.** `bell_schedule_periods` carries a check
constraint, `start_minute >= 0 AND end_minute > start_minute AND end_minute <= 1440`, and the ent
fields carry `Min(0).Max(1440)` besides. A mutation that deletes the range test in `bellSpanValid`
therefore proves nothing: the row is refused anyway, by the database, with a different status. The
widening that does bite is the one the database cannot see — making `bellSpanChanged` treat a
half-sent span as "no change", which fails `TestHalfASpanIsARefusalRatherThanAnEdit` with
`want 400, got 200` and a body showing the span still at 545-585. The assignment mutation is chosen
the same way: `assignments_marks_not_negative` permits a null, so weakening
`assignmentMaximumWithdrawn` to ignore an explicit null fails
`TestTheMaximumAComponentDrawsOnCannotBeWithdrawn` with `want 422, got 200` and a body with no
`maximum_marks` in it at all — the clear, having routed around the guard, unmarking an assignment a
result component draws on. Both were run over the whole package rather than under `-run`.

### Elective choice sets: one group per section, one arm per pupil (2026-09-28)

Hindi or Computer, French or German. Two tables, `elective_groups` and
`elective_group_offerings`, and no third one: the pupil's choice is an ordinary
`student_subject_enrollments` row, because that is what the clash engine reads
(`loadStudentSets`, `internal/service/timetable/students.go:31-47`) and a parallel enrolment
store would be a second truth with nothing to reconcile it.

**The group is scoped to a section, not to a grade.** Both were defensible; the deciding fact
is that an arm *is* a `subject_offering`, and a `subject_offering` is already
`(academic_session_id, section_id, subject_id)`. A grade-scoped group would have to hold
*subjects* as its arms and resolve each to a per-section offering at enrolment time — a
resolution that fails the day 9F has no Hindi offering, and that every reader of the group has
to repeat. A section-scoped group needs no resolution step at all:
`elective_group_offerings.subject_offering_id` is the thing the pupil is enrolled into and the
thing the timetable slot carries.

The cost is honest and small: six sections in a grade means six groups. That is six rows, not
six truths, and it buys the case a grade-scoped model cannot express — 9A offering
Hindi/Computer while 9F offers Hindi/French, which schools do every year. If the repetition
ever hurts, the repair is a template that *creates* six groups, not a group that *means* six.

`academic_session_id` sits on the group but is never accepted from the caller:
`createElectiveGroup` reads it off the section. A column the client cannot set cannot disagree
with the section it belongs to.

**An offering is an arm of at most one group**, enforced by a unique index on
`elective_group_offerings.subject_offering_id` alone rather than on
`(elective_group_id, subject_offering_id)`. The pair-wise index would permit Hindi to be an arm
of "Third language" *and* of "Second language", and "exactly one arm" would then be a question
with two answers for the same pupil. The handler pre-checks and names the group that already
holds it, so the 409 says which group rather than only that there is one.

#### Where "exactly one arm" is enforced, and why it is not a constraint

**It is a handler check**, in `chooseElective`, inside the same `unitOfWork` as the write.

A database constraint cannot express it without a denormalised `elective_group_id` on
`student_subject_enrollments` — group membership lives in `elective_group_offerings`, and a
partial unique index cannot join. That column would be in
`internal/ent/schema/subjectenrollment.go`, and putting it there would record group membership
in two places, which is the trap this whole note is about.

The check reads the truth rather than a ledger: it intersects the pupil's *active*
`student_subject_enrollments` with the group's arms. So it catches a pupil who reached Hindi by
any door, including `POST /subject-enrollments` directly. A ledger table with a unique
`(student_enrollment_id, elective_group_id)` was considered and rejected for exactly that
reason: it would close the concurrency window but would have a permanent blind spot for rows
written outside these endpoints, and a blind spot in a constraint is worse than no constraint,
because it reports healthy.

Two things it does not do, stated rather than left to be discovered:

- **`POST /subject-enrollments` still bypasses it.** That handler validates section and session
  agreement and nothing about elective groups. Closing it means a check in
  `createSubjectEnrollment`, which was not part of this work.
- **Two simultaneous posts of *different* arms for the same pupil can both land.** Under READ
  COMMITTED neither transaction sees the other's uncommitted row. The same arm twice is already
  refused by the existing unique index on `(student_enrollment_id, subject_offering_id)`. A
  `SELECT ... FOR UPDATE` on the group row would close it, but ent is generated here without the
  `sql/lock` feature, so it would mean raw SQL in a codebase that has none — and check-then-insert
  is the posture `createExamSitting` and the other write paths already take.

**A pupil in no arm is legal.** Choices are collected over days and a group has to exist before
anyone has chosen; refusing that state would mean the group cannot be created until the last form
comes back. `GET /elective-groups/{id}/choices` answers with every active enrolment in the
section, its chosen arm or `null`, and a `without_choice` count — so "eleven pupils have not
chosen" is a number on a screen rather than a silence.

#### Changing arm in week six

`student_subject_enrollments.subject_offering_id` is `Immutable()`, so a move was never going to
be an edit. `PATCH /elective-groups/{id}/choices/{enrollmentID}` drops the held arm —
`status = dropped`, `dropped_on = effective_from` — and opens the new one with
`enrolled_on = effective_from`, both on one `unitOfWork`.

What that model does, plainly:

- **The old row survives.** Marks taken in Hindi, attendance marked in Hindi periods and any
  assignment submissions stay attached to the Hindi enrolment. Nothing is migrated and nothing
  is deleted.
- **The clash engine and the roster follow immediately**, because `loadStudentSets` filters on
  `StatusActive`. From the moment of the move the pupil is in the Computer roster and out of the
  Hindi one.
- **A move back reuses the original row** rather than failing on the unique index — `takeArm`
  reactivates the dropped row for that offering and clears `dropped_on`. A pupil who went
  Hindi → Computer → Hindi has two rows, not three, and the Hindi row is the one they started
  with.

What it leaves for later, and does not pretend to solve: **the new subject's result will be
incomplete, and that is correct.** `results.Compute` finds no mark for the Computer papers sat
before week six and reports `Complete=false` with the missing components named. A report card
that reads the envelope's `final` and its `composition` (see "A pupil's result, computed on the
way out and stored nowhere") will say what is not set up rather than print a number that
silently omits a term. Whether a school wants the Hindi marks carried across, pro-rated, or
ignored is a policy decision nobody has made, and inventing one here would bury it in a write
path.

#### Capability keys, borrowed rather than invented

Group and arm CRUD probe `SubjectOfferingsRead/Write/Delete`, with `CurriculumReadAll` /
`CurriculumWriteAll` as the breadth key — the same borrowing `result-schemes` already makes, and
recorded in ROADMAP §8 as a deliberate consequence of `subject_offerings` having no breadth key
of its own. The choice endpoints probe `SubjectEnrollmentsRead/Write` with their real `*_all`
counterparts, because the row they write is a `student_subject_enrollments` row. No key was
invented: registering one is a production CAS change, and a declared-but-unregistered key fails
exactly like an ungranted one.

The two choice handlers do not pass the request's field names to `rejectUnauthorizedFields`.
They pass the **columns they will write** — `electiveChoiceWrites`, plus `dropped_on` for the
change path. The request carries `effective_from`, which is not a column at all, and asking
permission for a field name that does not exist answers a different question than "may this
caller set `dropped_on`". It also stops the handler quietly writing `student_id`,
`academic_session_id` and `is_elective_choice` without having asked about any of them.

#### What the tests establish

Sixteen tests on the real tenant database. The two that matter most:

**Two arms of one group, in one section, in one period, are not a clash** — run against the real
engine through `timetablesvc.Check` with `AllRules()`, not quoted from a document. P1 on Hindi
and P2 on Computer, both at section A period 5: `report.Clear()`. Enrol P1 into Computer as well
*behind the endpoint's back*, through the ent client, and the same query returns exactly one
`RuleStudentSet` clash naming P1. That pairing is the one worth having: the engine catches at
scheduling what the enrolment endpoint refuses outright, months earlier and in the language of
the mistake actually made.

**A slot for an elective arm must carry `subject_offering_id`.**
`TestAnElectiveSlotWithNoOfferingClaimsTheWholeSection` puts two labelled slots with a null
offering in the same section and period and asserts that they *do* clash. That is not a bug
being pinned; it is the fallback in `forEngagement` (`students.go:75-80`) doing what it is
supposed to — a null offering means the whole section. The test exists so that whoever writes an
elective slot generator meets the invariant as a failing assertion rather than as a schedule
refused for a clash that does not exist.

Two widening mutations, both run over the whole package with no `-run` filter:

- Neutering the one-arm refusal (`if held != nil` → `if false && held != nil`) fails
  `TestASecondArmIsRefusedAtEnrolment` with `want 409, got 201` **and a created row in the
  body**. The 201 is the point: nothing in the database objected, which is the evidence that the
  handler is the enforcement and not a decoration over a constraint.
- Dropping the arm-membership check fails `TestAnOfferingOutsideTheGroupIsNotAnArmToChoose` with
  `want 422, got 201`, the body showing a pupil enrolled through an elective group into a
  subject that is not one of its arms.

#### The migration, proved rather than asserted

`20260927185629_add_elective_groups.sql`, generated through `cmd/migrate make -plane tenant`. It
was applied to `elective_probe`, a `TEMPLATE` copy of the demo tenant carrying all 27 prior
migrations, 44 subject offerings and 602 subject enrolments, in the single transaction
`applyOne` uses. The ledger went 27 to 28 and every existing row survived. On that copy, with
real rows:

- deleting a `subject_offering` that is an arm is refused by
  `elective_group_offerings_subject_offerings_subject_offering` — the same `NO ACTION` posture
  `student_subject_enrollments` already takes on that table, so "remove the subject" means
  "unlink the arm first" rather than "silently unmake the choice set";
- a second group claiming the same offering is refused by
  `electivegroupoffering_subject_offering_id`;
- a duplicate code in one section is refused by `electivegroup_section_id_code`;
- deleting the group cascades its arms to zero and leaves the pupils' subject enrolments alone —
  deleting a choice set unmakes the *question*, not the pupils' answers.

`migrate status -plane tenant` then reports `DPS-NGP up to date (28 applied)`.

### Two declared holes closed: the ordinary door onto an elective arm, and a successor born with a link it could not be given (2026-09-28)

Neither fix needed a schema change, and neither existing refusal was loosened by a character.

#### `POST /subject-enrollments` now obeys the one-arm rule, by calling it rather than restating it

`POST /elective-groups/{id}/choices` has always intersected a pupil's *active* subject enrolments
with the group's arms. `createSubjectEnrollment` knew nothing about any of it, so Hindi then
Computer both landed and the clash engine reported it months later as a timetable fault — a
schedule refused for a school whose mistake was made at enrolment, in a screen that said nothing
at the time.

The rule was not written a second time. `electiveArms` and `activeArm` (`electives.go:830-883`)
are the two functions `chooseElective` and `changeElectiveChoice` already use, they are package
level, and `subjectenrollments.go` is in that package; `holdsNoOtherArm` calls both and adds only
the step the elective route gets from its URL — *which* group, looked up from the offering through
`elective_group_offerings`, which is unique on `subject_offering_id` and therefore answers with at
most one group. An offering no group holds returns early and the ordinary enrolment is untouched.
Nothing in `electives.go` was edited. If the two rules are ever made to disagree it will be because
somebody changed `activeArm`, which is the only place worth changing.

The refusal is 409, the same status and the same shape the elective route gives, and it names the
arm held, the group, and the `PATCH .../choices/{enrollmentID}` that moves a pupil properly.

**The update path had the same hole and it is closed too, but only on the transition that opens
it.** Enrolment rows are `Immutable()` on `subject_offering_id`, so the only way `PATCH
/subject-enrollments/{id}` can put a pupil in two arms is by *re-activating* one they left:
dropped Hindi, active Computer, `{"status":"active"}` on the Hindi row. The check therefore runs
only when the request sets `active`, and it excludes the row being written — returning to the one
arm a pupil already holds alone is not a second arm, and stays a 200.

**"Active" means what the elective route means by it.** A dropped or completed row is not a
choice: withdrawing from Hindi frees Computer, and a row may be *created* dropped into the other
arm (recording history that arrived late) without being refused. Had the new check counted any row
rather than active ones, the two would have disagreed about every pupil who ever changed arm.

#### Supersession carries an unusable assignment link, and now says so instead of being silent

`copyResultScheme` copies both kinds of source link. An assignment may only be *linked* if it has
a `maximum_marks` above zero (422 `assignment_has_no_maximum`), and activation re-checks, so a
copied bad link cannot reach an active scheme. The defect was silence: the successor was born
holding a link nobody could create that day, and the person who superseded was told nothing.

**Three behaviours were possible and copy-and-report was chosen.**

- *Refuse the supersession.* Rejected. Supersession is the only door a scheme in use has — it
  exists precisely because the scheme cannot be edited — and the fault is in a row the superseding
  person very likely does not own. A registrar changing a code would be blocked until a teacher
  fixes a mark total on a worksheet. That is an unrelated hostage.
- *Drop the unusable link and name it.* Rejected. It destroys the only record that the component
  was ever meant to draw on that homework, and it converts a precise problem ("this assignment has
  no maximum") into a vaguer one that activation reports differently ("this component has no
  source"). The successor is a draft, and unlinking in a draft is already permitted — dropping it
  for the caller takes away a decision that is theirs and is cheap to make.
- *Copy faithfully and report.* Chosen. Nothing is lost, nothing is newly refused, and the fact
  arrives at the moment it was created instead of weeks later at activation.

The 201 gains three keys **only when there is something to say** — `warning:
"assignment_has_no_maximum"` (the same code the link-time refusal uses, from the same constant, so
a client that knows one knows the other), `carried_without_maximum` listing component and
assignment by id and by name, and a `message` naming every one of them. A supersession with
nothing wrong is byte-for-byte what it was.

The check reuses the activation rule rather than paralleling it:
`resultComponentUnmarkedAssignment` — the function that produces the activation refusal — now
delegates to `resultComponentUnmarkedAssignments(..., most)`, one predicate with a limit.
Activation asks for one, because a refusal names the first offender; the copy asks for all,
because a report should name all. There is no second definition of "unusable" to drift.

**How the state arises at all, stated plainly.** Through the API alone it is now hard to reach:
linking refuses a missing maximum, and since 2026-09-25 `PATCH /assignments/{id}` refuses to
withdraw a maximum a component draws on. What remains are rows that predate those checks, rows
imported or repaired out of band, and a concurrent link-and-withdraw under READ COMMITTED. The
tests reach it the way reality does — `ClearMaximumMarks()` through the ent client, behind the
endpoint's back.

#### Verification

`go build ./...`, `go vet ./internal/transport/http/`, `gofmt -l` clean, and the whole package run
with `TEST_REQUIRE_TENANT_DB=1` and no `-run` filter: eleven new tests, 693 passing and no
`TENANT-DB-TEST-SKIPPED`
anywhere in the output.

Four widening mutations, each read for *what* it printed rather than that it failed:

- `holdsNoOtherArm` returning true before it looks at anything: three tests fail, two with
  `want 409, got 201` **and the created row in the body** — a 201 with the second arm's
  `subject_offering_id` in it, so the handler and not a unique index is the enforcement — and
  `TestReactivatingTheArmAPupilLeftIsRefusedWhileTheOtherIsHeld` with `want 409, got 200` and
  `"status":"active"` on a row that had been dropped.
- Deleting only the update-path guard: exactly one test fails, the re-activation one, with the
  same 200. The create tests stay green, which is what makes the two call sites separately proved.
- The copy collecting nothing: both reporting tests fail with the plain
  `{"result_scheme":{...}}` body printed in full.
- The copy asking for `most = 1` instead of all: `TestTheReplyNamesEveryCarriedLinkThatLostItsMaximum`
  fails naming "Bridge model" alone while "Comprehension sheet" — marked out of zero, the other
  half of what `assignment_has_no_maximum` means — goes unreported.

### A report card is every subject's result and the band that names it (2026-09-28)

`GET /api/v1/students/{id}/report-card` returns one line per subject a pupil is actively enrolled
in for an academic session. It does no arithmetic. Every number on it comes out of
`results.Compute`, reached through the same `planOfferingResult` and `gatherResultMarks` that
`GET /api/v1/subject-offerings/{id}/results` uses; the card is that endpoint's answer, once per
subject, with the grade added. A second implementation of §2.5's arithmetic would have been the
two-sources-of-truth trap this repository has hit repeatedly, and the arithmetic package is at
100% coverage precisely so that nothing has to reimplement it.

#### Data, not a document

The endpoint returns facts; something else renders them. That is not a dodge — it is what lets one
answer serve a screen and a printable page without guessing at either. A screen and a page differ
in layout and wording, not in what is true, so the response carries no prose a renderer would have
to override and no layout it would have to undo. What it does carry, beside the breakdown, is a
per-subject `status` from a closed vocabulary:

`final`, `provisional`, `partly_composed`, `in_progress`, `awaiting_marks`, `exempt`,
`not_composed`, and the two the per-offering endpoint already returns as error codes,
`result_scheme_unfilled_for_offering` and `result_not_computable`.

The vocabulary exists so a renderer switches on one field instead of reassembling a predicate out
of `complete`, `provisional`, `assessed_total` and `composition`. Every renderer that assembled it
itself would assemble it slightly differently, and the one that got it wrong would print a
settled-looking number. `final` per subject is still published beside the status and is still
`Result.Final() && composition.whole()`, unchanged from the endpoint it comes from.

#### The 422 that must not be a 422 here

Per offering, a scheme that composes nothing for this subject is a refusal:
`result_scheme_unfilled_for_offering`, 422. On a card it is a line. One misconfigured subject must
not blank the other nine, and a pupil is not owed a blank card because the office has not set the
Music papers yet. The same holds for `results.Compute` returning an error — a mark above its
maximum is a fact about one subject's rows, so it becomes that subject's status with the message
verbatim, and the other subjects are still computed and returned. The card itself is 200 unless
the *pupil* cannot be reached.

#### The band is named by the grading scheme, and withheld more often than it is named

§2.5: the result scheme computes the score, the grading scheme names it. So the band comes from
`subject_offerings.grading_scheme_id` and `scale_json`, matched against `Result.Percentage()`,
which is `Score / AssessedTotal`. Not from `exam_subjects.grading_scheme_id`: a result spans
several exams and picking one of their schemes to name the total would be arbitrary.

A band is named only when the subject is **complete**, **wholly composed** and **assessed at all**.
Each exclusion is a different way for the percentage to be a number that does not mean what a band
would say it means:

- **Incomplete.** A pupil who has sat the half-yearly and two class tests scores 23.5 of an
  assessed 100, because the unmarked annual contributes its weight to the denominator and nothing
  to the numerator. That figure is a floor, not a score. Naming it prints an **E** for a pupil who
  has not yet sat the paper carrying seventy of the hundred, and understatement is the direction
  nobody queries.
- **Partly composed.** History's scheme links an annual for which the subject has no paper, so the
  annual's eighty leaves both totals and the pupil's 40/50 half-yearly reads 80%. Eighty per cent
  of a fifth of a scheme is a true percentage of a thing nobody meant to measure. `composition`
  names the gap and the weight; a band would paper over it.
- **Nothing assessed.** A pupil exempt from every component has `AssessedTotal = 0` and
  `Percentage()` returns 0 by definition. An E for a pupil who was excused is the exact inversion
  of what happened.

Each withholding is reported rather than left blank: `grade_not_named` carries the scheme it was
withheld from and the reason, so a page can print why instead of a dash the reader has to
interpret.

**Provisional is the one case where the band is named anyway**, flagged. The result is complete and
whole; one mark is auto-marked and waiting for a teacher. Withholding there would make a
mid-session card useless, and the percentage is real. So it is named with
`grade.provisional = true`, the subject reads `provisional`, its `final` is false, and — because
the requirement is that the *card* say so on its face and not only a line — the envelope carries
`provisional: true` at the top. A page header can qualify itself without walking the subjects.

#### Three absences that must not collapse into one dash

`not_entered`, `absent` and `exempt` are three different sentences and the whole model exists to
keep them apart, so the card passes `SourceResult.Outcome` through untouched: nobody has marked it,
the pupil did not sit it, the pupil was excused from it. At subject level the same distinction
drives the status — `awaiting_marks` when *nothing* has been marked, missed or excused (the normal
mid-session case, where the zero is the absence of marks and is labelled as such), `in_progress`
when some of it has, `exempt` when all of it was excused. A subject with no result scheme is
`not_composed` with `result: null`, because showing a zero there would invent a score for a subject
nobody has decided the composition of.

#### It totals nothing across subjects, and says why

`aggregate` is `null` and `aggregate_reason` says that a cross-subject total is a school's policy:
a mean of percentages, a weighting by subject, and the best five of six are all in use and they
disagree. Computing one would be inventing a promotion rule inside a read endpoint, and the first
school whose rule differed would get a number that looked official and was wrong. Pass or fail is
withheld for the same reason, and because `grading_schemes.pass_marks` is in marks out of
`maximum_marks` while a result is in `result_schemes.total_marks` — comparing them requires an
agreement nobody has stated.

What is returned is arithmetic with no policy in it: `subjects_by_status`, a count per status, and
`final`, true when every line shown is final. Those answer "is this card issuable" without
answering "how did this pupil do overall".

#### `covers_every_subject`, and why a teacher's card is not a card

`teachingScope` gives a teacher the *offerings* named on their assignments and only adds a whole
section when an assignment names no offering, or when they are its class teacher. A physics teacher
therefore reaches physics, and a card narrowed to physics that reads `final: true` would be a card
claiming to be finished while four subjects it cannot see are unmarked.

So the envelope carries `covers_every_subject`, computed by counting the pupil's active subject
enrolments for the session and comparing: true for the pupil, their guardian and an unrestricted
viewer, false for the subject teacher. It leaks nothing about the pupil — it is a statement about
the reader's own grant, not about what the pupil studies — and it is what an official card must
assert before it prints. The alternative, dropping the offering narrowing so that reaching a pupil
reached all of their subjects, would have let a physics teacher read a pupil's every mark through
the endpoint that adds them up. The offering predicate is `resultOfferingScope`, the same one the
per-offering endpoint uses, deliberately: two answers to "which offerings may you read" is two
places to get it wrong.

The row predicate is `access.StudentsForAcademic`, the one the whole feature rests on, and an
unreachable pupil is a 404 and never a 403 — the same 404 a pupil who does not exist gets, because
telling those two apart hands the caller a roster they were refused. No capability key was
invented: the card is the pupil's marks with the arithmetic and the band done, so it is gated on
`core.timetable.read` / `read_all`, exactly as the marks and the per-offering result are, and the
field policy is honoured the same way — a breakdown computed from marks the caller may not read is
a number nobody could check, so `requireResultFields` refuses with a 403 naming the denied columns.

#### Nothing is persisted, and the argument for issuance is not an argument for storing a card

There is no `report_cards` table. §2.5 holds that a result is derived and the marks are the
retained evidence, and a stored card goes quietly wrong the moment a mark is corrected — which is
exactly the case where being wrong matters, because a corrected mark is usually a complaint being
answered. The endpoint recomputes; the marks are the record.

The one thing that genuinely is not derivable is **issuance**: that a card was handed to a parent
on a date, and what it said at that moment. That is an event about the school, not a result, and if
it is ever needed it wants a row recording when and to whom alongside the marks as they stood — an
audit fact, not a cache. It is not built here, and it should not be built as a `report_cards` table
with a score column, which would be a cache wearing an audit's clothes.

#### A practice assessment cannot reach a card, and where that rests

Verified rather than reimplemented. Nothing in this handler looks at `exams.assessment_kind`: it
reads what `result_component_exams` links, and a practice exam cannot be linked. Three writers
touch that table and all three hold the line — `linkResultComponentExam` (`resultschemes.go:1028`)
refuses with `practice_exam_cannot_be_composed`, the seeder (`cmd/seeddemo/exams.go:1037`) refuses
with the same sentence, and the supersede path (`resultschemes.go:451`) only copies links that were
already checked. `TestAPracticeExamCannotBeComposedAndSoIsNotOnTheCard` runs the refusal through
the handler, marks the pupil ten out of ten on the practice paper anyway, and asserts the card's
score is unchanged at 84.75 and that no source on it refers to that exam.

Re-checking `assessment_kind` at read time was considered and rejected. If a link to a practice
exam ever existed, dropping it while reading would silently remove a weight the scheme still counts
and hand back a wrong total; the refusal belongs where the link is written, and a quiet wrong total
is worse than a loud one.

**The gap that follows from that, and is not closed here.** `updateExam` (`exams.go:533`) sets
`assessment_kind` without consulting `result_component_exams`, so an exam already composed into a
scheme can be flipped to `practice` afterwards and will keep contributing.
`TestAnExamFlippedToPracticeAfterLinkingStillReachesTheCard` pins it: the PATCH answers 200 and the
half-yearly still contributes its fifteen. The test is written to fail loudly if the gap is ever
closed, and says so in its message. Closing it means refusing the flip in `updateExam`, which is
that file's decision, not this one's.

#### Cost, and what is deliberately not optimised yet

The plan is loaded per subject: four queries for the composition and up to two for the marks, so a
pupil taking ten subjects costs about sixty small indexed round trips against one. Batching the
composition across subjects would cut that to about eight, and would also duplicate the mapping
from three link tables into a `results.Scheme` — a second source of truth for how a scheme is
assembled, to save round trips nobody has measured. The standing posture is keep the marks, compute
the result, cache neither until measured; when it is measured, the thing to batch is
`planOfferingResult`, in one place, for both endpoints.

#### What the tests establish

Sixteen DB-backed tests against a real Postgres. The worked example runs end to end through the
handler on `RS-STD-100`'s shape — half-yearly 30/40 at weight 20, best two of four class tests at
weight 10, annual 70/80 at weight 70 — and asserts **84.75**, that the printed component lines add
to the printed total, and that the band named is **A2**, the 81-90 band, carrying 9 points. The
band and the score are asserted together deliberately: a card that computes correctly and names the
wrong band is wrong in the only place a parent reads.

Beside it: a provisional total named and flagged and never final; an incomplete subject whose 23.5%
is not banded; absent, exempt, counted and not_entered kept apart on one component; a subject with
no result scheme carrying `result: null`; a subject with a result scheme and no grading scheme
scoring 75 and naming nothing; a wholly exempt pupil not graded at nought; a mid-session card of
five subjects that reads as empty rather than as noughts; a dropped enrolment absent from the card;
a pupil enrolled in nothing answering 200 with a reason; the reachability rules, where a classmate,
a guardian of another child and a teacher of another section all get 404; the session defaulting to
the current one, 404 for a session that does not exist and 400 when none is current; and
`mountedPatterns` asserting the route is on the real router, because a handler nobody mounted is a
handler nobody can call.

Three widening mutations, each run over the whole package with no `-run` filter, because a filter
that missed the relevant test has twice made a mutation look survivable on this work:

- **the viewer narrowing dropped from the student row predicate** —
  `TestReportCardReadsOnlyPupilsTheViewerReaches` failed with `a classmate reading another pupil's
  card must get 404, got 200`, and the body was another pupil's complete card: score 84.75, every
  class test's mark, and the band A2.
- **the grade's completeness guard neutered** (`case false && !out.Complete`) — three tests failed,
  the sharpest being `23.5% is the floor of a part-marked subject, and naming it "E" prints an E
  for a pupil who has not sat the annual`, the other two catching a band named for a pupil with no
  marks at all and for one with a paper neither marked nor excused.
- **the offering scope dropped** — `TestACardNarrowedToOneSubjectDoesNotClaimToBeTheWholeCard`
  failed with `a subject teacher reaches the offering they teach and no other, got 5`, the physics
  teacher having read the pupil's art, chemistry, history and music.

### A grading scheme now has to belong to the session it bands, and may still be retired (2026-09-28)

`result_scheme_id` has always been checked for session agreement on attachment and
`grading_scheme_id` never was. The roadmap recorded that asymmetry as deliberate — a grading
scheme is a number-to-label map, so borrowing last year's was called odd and harmless. Akarsh
decided the pair should be symmetric, and the entry said where the fix belonged if it ever
came: on `grading_scheme_id`. So the roadmap entry is rewritten rather than annotated. An entry
that still read "the asymmetry is deliberate" next to code that enforces the check is exactly
how someone later deletes a real check believing they are tidying up.

`gradingSchemeAttachable` mirrors `resultSchemeAttachable` in shape as well as in effect. It
reads the scheme row before comparing anything, and that read is load-bearing rather than
incidental. Without it an unknown scheme id reaches the insert and comes back as a foreign-key
violation, which `writeTenantEntErr` turns into a 409 saying "that value is already taken, or it
references a row that does not exist" — a conflict the caller did not cause, about a row they
asked for by name. With the read it is a 404 saying "grading scheme not found". The widening
mutation for the create call site showed both halves of this at once: removing the call gave
201 for a cross-session scheme *and* turned the unknown-id test's 404 into precisely that 409.

The check sits inside the `in.GradingSchemeID != nil` branch, above the `wasCleared` branch that
follows it, so a detachment is not an attachment with a missing argument. `{"grading_scheme_id":
null}` still clears and an omitted key still leaves the scheme alone; a validation that fired on
a clear would have been the regression worth fearing here. The update path now reads the
offering once for whichever of the two scheme keys were sent, rather than the result branch
reading it for itself, because two sent keys should not be two reads of the same row.

Nothing can drift out of agreement after the fact: `SubjectOffering.academic_session_id` is
`Immutable()` in the schema and on its edge, so the session a pair agreed on is the session it
keeps. That is what makes an attachment-time check sufficient rather than a check that would
also need to run on every later write.

**An inactive grading scheme may still be attached, and that is a decision rather than an
omission.** The symmetry Akarsh asked for is the session check; `resultSchemeAttachable` happens
to carry a status check too, and copying it wholesale would have been mimicry rather than
reasoning. A result scheme's `draft` is an unmet check — it means the composition has not been
verified to account for every mark it is out of, so attaching one attaches something unfinished.
`inactive` on a grading scheme means nothing of the kind. The status is only `active | inactive`,
with no `draft` anywhere in the lifecycle, and schemes supersede rather than edit
(`supersedes_id`), so an inactive scheme is routinely a superseded ancestor that offerings
legitimately still point at. The fact that settles it is that the consumer does not care:
`reportGradingSchemes` in `reportcards.go` fetches the attached scheme by id with no status
predicate, so an inactive scheme already bands report cards wherever one is attached today.
Refusing it at the door while honouring it in rendering would be an inconsistency dressed as a
safeguard. If retiring a scheme is ever meant to stop new attachments, that is a lifecycle
decision to take deliberately, and it should change the rendering path in the same breath.

Two widening mutations, each run over the whole package with no `-run` filter, because a filter
that missed the relevant test has twice made a mutation look survivable on this work:

- **the session comparison dropped from `gradingSchemeAttachable`**, keeping the read so a 409
  could not stand in for a refusal — `TestAGradingSchemeFromAnotherSessionMayNotBandAnOffering`
  failed with `want 422, got 200`, and the body was the offering written with the foreign
  scheme's `grading_scheme_id` on it.
- **the call removed from `createOffering` only**, the helper left intact, because a check with
  one live call site out of two is the unreachable-capability shape this repo keeps finding. The
  same test failed at its create assertion with `want 422, got 201` carrying the foreign scheme,
  and `TestAnUnknownGradingSchemeIsNotFoundRatherThanAConflict` failed with `want 404, got 409`.

The whole package passes with `TEST_REQUIRE_TENANT_DB=1`: 700 tests, none skipped, no
`TENANT-DB-TEST-SKIPPED` in the verbose output.

## The class teacher in front of their class every day (2026-09-30)

A school asked for its class teacher to be in front of their own class every day. The class
teacher of 6A teaches 6A both Maths and Hindi, and either lesson answers the requirement — so
the thing being asked for is not "this subject every day", it is *at least one lesson a day
drawn from this set of the section's offerings*. Modelled that way it covers one subject, two
subjects, and a school that wants two lessons a day rather than one, without a second feature
arriving later to generalise the first.

The option is `daily_contact` on `GenerationOptions`, a list rather than a map because one
section can carry more than one such rule and a map keyed by section could not say so. Each rule
names a `section_id`, a floor `min_per_day` defaulting to 1, and *either* `offering_ids` by hand
*or* `class_teacher: true`. Exactly one of the two, never both: a rule that named both would have
to define whether the sets union or the explicit list wins, and neither answer is obviously right
to a reader of the request. `min_per_day` of 0 is refused rather than read as "no rule" — the
same distinction `wire.py` already draws between a demand of zero and an absent one.

### Resolving a class teacher to offerings

`sections.class_teacher_id` was read nowhere under `internal/service/timetablegen` before this.
It is resolved in the runner rather than at the HTTP door, so the offering set and the export the
solver receives are read from the same database state: resolving at request time would let an
offering be retired between the POST and the solve, and the rule would then name something the
export does not contain.

The resolution is: the section's `class_teacher_id`, then that teacher's `teacher_assignments`
rows for that same section that carry a `subject_offering_id`, active only. **`subject_offering_id`
is optional on that table**, and a row without one is a section-wide assignment — it says this
teacher is attached to this section, and says nothing whatever about which subject. Treating such
a row as an offering would silently build a rule out of a null. The predicate excludes it in SQL
and `classTeachingOf` excludes it again in memory, and it is the in-memory guard that the tests
hold: removing only the SQL predicate is not detectable, because the fold refuses the nil anyway.
That redundancy is deliberate and the mutation result is recorded here so nobody removes the
guard on the grounds that the query already covers it.

Whatever the path, the resolved set is intersected with the section's own offerings in the
export. A rule that resolves to nothing is dropped and *said out loud* in the job's `warnings` —
"6A has no class teacher recorded", "the class teacher of 6A holds no subject in it, only a
section-wide assignment". A daily-contact rule that quietly did nothing would be worse than one
that was refused, because the week would look like an answer to a question nobody had asked.

### Soft in the model, refused in preflight

The rule is a **penalty, not a hard constraint**, at 200 per missing lesson-day — above every
other per-event penalty in the model (`room_move` is 60, `stack` 40, `teacher_gap` 30,
`last_period` 25) so the solver will trade several room moves and a stacked subject to buy a day
of contact, and still a weight a caller can price down or to zero.

Hard would have been wrong for the reason the job model already knows about: `infeasible` is a
terminal status that writes no lessons at all. A week that is over-subscribed for reasons having
nothing to do with the class teacher would come back empty, and the school would have exchanged
its whole timetable for one rule. Soft returns the week with the days it could not reach named
in `soft_violations`, which is a partial answer a head of timetabling can finish by hand. That
was measured on the demo tenant: with Maths and Hindi pinned off Saturday, the same request
returns OPTIMAL with all 210 lessons placed and one violation reading *"2026-2027-G6-A is owed 1
lesson from Hindi, Mathematics on Saturday and has 0"*.

But a rule whose own arithmetic cannot hold is a different answer, and it belongs in
`preflight.py` with the other counting arguments. Two bounds, each provable without a solver:
the group's weekly demand cannot be below `teaching days × min_per_day`, and no day may be
narrower than `min_per_day` periods. Asking for three lessons a day from a group that is asked
for thirteen a week is not a preference the solver can trade away, it is a request that
contradicts itself, and the useful answer is the arithmetic rather than a week with eighteen
violations in it. Live, that reads: *"2026-2027-G6-A is owed 3 lessons a day of Hindi,
Mathematics across 6 teaching days, which is 18 a week, and those are asked for only 13."*

The violations are recomputed from the returned week by `evaluate_soft`, never read off the
model's slack variables, for the reason the module already gives about every other soft term:
if the model and the report disagree, the report is the number a human sees.

### Why the test is not run against the demo tenant

The headline test builds a four-cell school by hand, and that is the point. On the demo tenant
the stacking penalty already spreads a six-period subject across six days, so a rule asking for
one lesson a day holds whether the constraint exists or not — driven against the live solver, the
run with the rule and the control run without it returned *the same* per-day distribution. A test
on that instance would have passed with the constraint deleted and proved nothing.

The synthetic instance is built so the unconstrained optimum provably violates the rule. Three
cells on Monday, one on Tuesday; Art wants two periods, Hindi two, and Hindi is heavy. Only two
shapes of week exist: put both Hindi on Monday for a single stack penalty of 4000, or send one to
Tuesday's only cell, which is by definition Tuesday's last period, and pay 4000 for Art stacking
plus 2500 for a heavy subject last — 6500. The cheap week abandons Tuesday. The rule at 200 makes
abandoning it cost 20000, so the answer flips; at weight 0 it flips back, which is the test that
says this is a penalty and not a hard constraint wearing a weight's clothes.

`test_without_the_rule_the_cheapest_week_abandons_a_day` asserts that premise directly, so if the
instance ever stops being a real test the suite says so rather than going quietly green.

---

## The question bank, blueprints and generated papers

### `internal/ent/schema/questionbank.go`, `blueprint.go`, `paper.go`

Nine tables, built from sections 6 and 7 of
`Emerge_Final_SchoolOS_Database_Architecture_v1.0.docx`. The document was exported 2026-09-23, the
exam vertical landed 2026-09-24/25, and it describes forty-three tables where this needs nine. It was
read as a hypothesis, not a specification. Every place the shipped code and the document disagree,
the code won; every such place is listed below.

**A question is never edited in place.** `question_versions.stem`, `.explanation`,
`.answer_data_json` and `.version_number` are all `Immutable()`, so ent generates no setter for them
on the update builder at all — the prohibition is structural rather than a check a later caller could
forget. `status` is the one mutable column, because draft to reviewed to published is a lifecycle and
not an edit; `PATCH /question-versions/{id}` accepts `status` and refuses every other key by name.
The document's own wording is conditional — "immutable once referenced by a published paper" — and
the conditional version is the weaker one: it would leave a version editable right up until the
moment it mattered, and then need a referential check to notice. Unconditional immutability of the
content needs no check.

`version_number` is assigned by the server from `max + 1` and a supplied value is refused with 422.
The unique index on `(question_id, version_number)` is what makes that safe under a race: two
concurrent version writes both compute the same next number, one loses the insert, and the loser gets
a 409 telling it to read the versions again — not a silently renumbered history.

**`paper_questions` carries both `question_id` and `question_version_id`**, and the handler checks
that the version actually belongs to the question before the insert. This cannot be expressed as a
foreign key without a composite `(id, question_id)` unique on `question_versions` and a two-column
reference, which ent does not model, so it is a read-and-compare in `createPaperQuestion`. The
mutation worth recording: weakening the comparison to `version.QuestionID == uuid.Nil` leaves the row
insertable, and `TestAPaperQuestionRefusesAVersionOfAnotherQuestion` fails with `want 422, got 201`
and the mismatched pair in the body. Without the check the `question_id` column would be decoration —
the version alone already names its question — and a paper could claim to print question A while
rendering the text of question B.

**A published paper takes no further writes.** `writablePaper` refuses section and question writes
into a paper at `status = published`, and `updatePaper` refuses the patch itself, both with
`paper_is_published`. The delete predicate carries `StatusNEQ(published)` in the same breath, so the
delete route cannot be used to get around the check. This is the operational half of the document's
immutability constraint: freezing the version but leaving the paper's question list editable would
let a published paper change what it prints without any version changing. Dropping the guard in
`writablePaper` makes `TestAPublishedPaperTakesNoMoreQuestions` fail with `want 422, got 201`.

**`blueprints.academic_session_id` is nullable and that is load-bearing.** The document says NULL
means a reusable template shared across academic years, and the code honours it: `GET /blueprints`
takes `?reusable=true`, which is `AcademicSessionIDIsNil()`, and is a different question from
`?academic_session_id=...`. The column is `Immutable()`, so a template cannot quietly acquire a year
later on; binding a pattern to a year is a new blueprint version, which is what `version` is for.

**`cognitive_scheme` is a named scheme with an N-band list, not a Bloom-6 tuple**, taken from
`D:/lms-paper-orchestrator/composer/models.py:307-317`, which had already reasoned it out: CBSE alone
ships two incompatible schemas — a Typology table for Mathematics and a Competency table for Science —
so a fixed six-column tuple cannot represent even one board, let alone two. The column is NOT NULL
and the handler refuses a scheme with no name or no bands: an unnamed band list is uninterpretable,
because "40% in band 1" means nothing without knowing whose band 1.

The document instead put a single `bloom_level TEXT` on `questions`. That column is kept, and kept as
free text rather than promoted to an enum the way every other short vocabulary in this repo is,
precisely because of the above: the legal band names depend on the scheme the blueprint names, so an
enum here would have to be the union of every board's vocabulary and would still be wrong for the
next one.

**`unit_weightage` is nullable and `null` is a first-class state** meaning "cover all chapters, no
per-unit target" — CBSE Mathematics XI-XII says exactly that in words. It is distinct from
`{"units": []}`, which is a weightage document that lists no units. The distinction survives the
round trip because the column is a nullable JSONB holding a `*schema.UnitWeightage`, and it survives
the HTTP layer because the patch handler uses `wasCleared`: an omitted key leaves the document alone,
an explicit `null` clears it, an object replaces it. `response.DecodeFields` alone could not tell the
first two apart. `TestNullUnitWeightageIsNotAnEmptyUnitWeightage` asserts all three.

One consequence of ent's generated JSON tags is worth stating rather than discovering: the struct
field carries `json:"unit_weightage,omitempty"`, so a NULL column is *absent* from the response
rather than present as `null`. Absent and `null` mean the same thing here and there is no fourth
state, so nothing is lost, but a client written against the document's column list should not expect
the key to always be there.

**Deviations from the document, and why.**

- *Added `subject_id` and `grade_level_id` to `questions`, both nullable.* The document's `questions`
  table carries no scope columns at all and leans on a `question_mappings` table outside these nine.
  Without a scope column there is nothing to narrow a read by, and the read handlers had to narrow —
  so the alternative was a question bank every caller could see whole. Nullable rather than required
  because a genuinely cross-subject item exists; null then reaches only an unpinned tenant grant,
  which fails closed.
- *Added `code` to `blueprints`, unique with `version`.* The document versions blueprints by `name`
  alone, which is not a stable identity — renaming a blueprint would orphan its version chain. Every
  other versioned table in this repo carries a `code`, and the orchestrator's `blueprint_key` is the
  same idea.
- *Renamed `papers.generated_run_id` to `generation_run_id`.* The document's name is a slip.
- *`blueprints.status` is `draft | published | archived`, not the document's `draft | published`.*
  `exams.status` — the nearest shipped neighbour, by the same authors, in the same vertical — is
  `draft | published | archived`, and a blueprint that is no longer to be used needs somewhere to go
  that is not deletion, because papers reference it.
- *Enums where the document says TEXT*, for `question_type`, `status`, `source_type`,
  `difficulty_label`, `constraint_type`, `generation_method` and paper `status`. The document writes
  "MCQ/SA/LA/TF/code/etc."; this repo's convention is a checked enum, and the alternative is a column
  where `MCQ`, `mcq` and `Mcq` are three kinds of question. `bloom_level` is the one deliberate
  exception, for the reason above.
- *Added provenance and cost columns to `paper_generation_runs`*: `prompt`, `prompt_hash`,
  `input_tokens`, `output_tokens`, `cost_amount`, `cost_currency`, `failure_reason`. The document
  records only the model version. A run that cannot be reproduced or priced is not provenance.
  `cost_amount` and `cost_currency` are paired by a check constraint and by the handler, because an
  amount without its currency cannot be compared to another run later, and the two runs being
  compared are exactly the ones a bursar cares about. `prompt` is refused on PATCH: a run's
  instructions are what it was asked to do, and rewriting them after the fact destroys the only
  record of why the output looks as it does.
- *Dropped `question_options` and `question_rubrics`* from the document's section 6. They are outside
  the nine tables in scope; MCQ options ride in `question_versions.answer_data_json` until a table
  earns its place. Anything reading options today must read them from there.

**`blueprint_constraints.value_json` is a JSON object, not a bare array.** The document says "JSONB,
allowed/target values" and the shape is meant to evolve, so it is `shared.Metadata` like every other
open JSONB in this repo rather than a struct that guesses. The cost is that a caller wanting a list
must send `{"values": [...]}`; the decode failure says so.

**What a paper question does not check.** `createPaperQuestion` verifies that the question and the
version exist and belong together, and does not additionally require the caller to hold
`core.question_bank.read` on that question. That is deliberate: a paper-setter service account holds
paper keys and would otherwise need a second grant to place a question into a paper it already has
write on. The narrowing that matters has already happened at the paper — an unreachable paper is a
404 before any of this runs — and the only thing the looser check reveals is that some row with that
id exists, to a caller who is already writing a paper they own.

### `internal/data/access/papers.go`

The narrowing mirrors `curriculum.go` rather than inventing a shape, because a blueprint is scoped by
exactly what a curriculum is scoped by: a subject and a grade. A teacher reaches the blueprints and
questions for the subject-and-grade pairs they teach, plus anything whose grade level has a section
they are class teacher of. A paper is reached through its blueprint or through its exam's subject
offerings; a paper with neither is reachable only at unpinned tenant reach, and the create handler
refuses to make one unless the caller holds that breadth, so nobody writes a row they cannot read
back. A generation run is reached entirely through its blueprint.

`bankNarrowed` is generic over `~func(*sql.Selector)` because the same five-case assembly — pins
unusable, no arms, unfiltered, arms only, arms AND pins — has to be written for four predicate types,
and four copies of it is four places for the "tenant reach plus a pin means the pin alone" case to
drift. The mutation: replacing `blueprintScope`'s return with `AnyBlueprint()` makes
`TestABlueprintForASubjectYouDoNotTeachIsNotFound` fail with `want 404, got 200` and another
teacher's pattern in the body.

Three checks were deliberately given helpers with more than one call site, because the
unreachable-capability shape keeps recurring in this repo: `bankWriteReaches` is called by
`createQuestion`, `updateQuestion` and `createBlueprint`; `writablePaper` by `createPaperSection` and
`createPaperQuestion`; `runCostValid` by `createGenerationRun` and `updateGenerationRun`. A check
enforced on create and forgotten on update is the same bug as a check with no call site at all.

### The migration

`migrations/tenant/20260929211253_add_question_bank_and_papers.sql` was generated through
`cmd/migrate make` and applied to the local tenant database with `cmd/migrate apply -plane tenant`.
It is **not purely this work**: Atlas diffs the whole schema against the whole tree, and other
agents' uncommitted schema changes were present when it ran, so the file also creates
`timetable_sections` and `calendar_day_section_patterns` and adds
`calendar_days.substitute_day_of_week`. That is an artefact of generating a migration on a tree
several agents are writing to, not a design decision; whoever owns those tables should decide whether
to split the file before it is committed.

### The section set a timetable covers, and the three things that follow from it (2026-09-30)

`timetable_sections` is `(timetable_id, section_id)` unique on the pair. It exists so that
"generate for the whole school" and "generate for these four classes" are one concept with two
arguments rather than two features. Until now the only statement a timetable made about which
classes it governed was implicit in its slots, and an implication cannot be made before the slots
exist — which is exactly when you want to say it.

**The cover falls back to the slots, and that is deliberate.** `Service.CoveredSections` returns
the join rows when there are any and the distinct `section_id` of the slots when there are none.
Every timetable that exists today has no join rows, so a strict reading would give all of them an
empty cover and the publication invariant below would be vacuous on the entire installed base —
enforcement that is switched off for all real data is worse than no enforcement, because it reads
as protection. Once a cover is declared it *replaces* the implied one rather than widening it: a
declared cover is a statement, and a statement that silently grows whenever someone adds a slot is
not one.

**One published timetable per section per date range, enforced in the application and not in the
database.** The old partial unique index `(period_scheme_id, effective_from) WHERE status =
'published'` cannot express this: the sections live across a join, and two published timetables on
one scheme with *different* start dates and overlapping ranges slip past it entirely. Postgres
cannot express "no two rows whose ranges overlap share a row in a third table" as a constraint —
an exclusion constraint works over columns of one table, not over a join — so `Publish` checks it
and returns `PublishConflictError` naming each conflicting timetable and the sections they share.
**This is application-enforced. A direct `UPDATE ... SET status = 'published'` bypasses it, and so
does adding a slot for a new section to an already-published timetable.** The second hole is
narrowed rather than closed: `POST /timetables/{id}/sections` runs the same check when the target
is published, so widening a declared cover is refused, but `POST /timetables/{id}/slots` does not,
and a timetable whose cover is implied by its slots can still drift into conflict after the fact.

**`POST /timetables/{id}/publish` replaces publication as a side effect of `PATCH`.** `PATCH
/timetables/{id}` with `{"status": "published"}` still works and still stamps `published_at` —
breaking it would break every existing caller — but it performs no invariant check, so the
explicit endpoint is the one to reach for. Publish refuses: a timetable already published (409);
one that is superseded or archived (422); one whose cover is empty, because publishing it would
put nothing in force (422); a `supersedes_id` naming an unknown timetable (404), one on another
period scheme (422), one that is not itself published (422), or one that starts on or after the
successor (422, since the predecessor cannot then be closed to a non-empty range); and an overlap
on a shared section (409, naming the conflict). It is gated with the existing
`core.timetable.write` rather than a new key, and additionally requires that grant to reach the
whole school — publishing puts *every* section in the cover in force, so a grant scoped to one
section cannot authorise it. A timetable the caller cannot reach at all is a 404, as everywhere.

Superseding closes the predecessor rather than merely labelling it: `effective_to` is moved back
to the day before the successor's `effective_from` and the status becomes `superseded`, which is
what makes the successor's overlap with it legitimate. The predecessor is therefore exempt from
the conflict scan; nothing else is.

**`pickTimetable` keeps sorting on `effective_from` descending, and version stays the tie-break.**
The reported defect is real — a higher-versioned timetable starting earlier loses to a
lower-versioned one starting later — but the ordering is right and the overlap is the bug. A
school that sets `effective_from` to June is saying "from June, use this"; `version` is a label
with nothing enforcing that it rises with the start date, so promoting it to the primary key would
let a v5 dated April permanently mask a v2 the school deliberately put in force in June. The fix
belongs at publication, where the overlap is now refused, not in the read path where it would
silently re-rank timetables that are already in force.

**A date no timetable covers is now distinguishable from a holiday.** It was not: both returned
200 with zero occurrences. `ResolveCoverage` returns `Uncovered{Date, PeriodSchemeID}` alongside
the occurrences and the endpoint carries them as `uncovered_days` / `uncovered_count`. `Resolve`
keeps its old signature and delegates, so no existing consumer changes. The gap is recorded only
when the calendar day is open — a closed holiday has no timetable in force by design and is not a
hole — which is the whole distinction the field exists to draw.

**Day-pattern substitution is one nullable column plus an override table consulted only when it
has rows.** `calendar_days.substitute_day_of_week` is school-wide by construction, because
`calendar_days` is one row per branch per date. `calendar_day_section_patterns` is
`(calendar_day_id, section_id, substitute_day_of_week)` unique on the first two. The resolver's
weekday was computed once per date at the top of `occurrencesOn`; it is now computed per slot by
`plan.dayOfWeekFor(date, sectionID)`, which consults the section override, then the day-wide
column, then the real weekday. Per slot rather than per day is what lets one section sit out a
school-wide substitution. The same helper is used for proposed slots in the date-scoped pass of
the clash checker, because a proposal that is not moved alongside the real occurrences it is
compared against would stop clashing with them for the wrong reason.

`Occurrence.day_of_week` now names the pattern actually run and a new `calendar_day_of_week` names
the real weekday of the date; where they differ a substitution happened, which `DaySubstituted()`
reports. Without the second field a substituted day is indistinguishable in the response from a
week where the school simply teaches those subjects on Saturday.

Four mutations, each run over the whole `internal/service/timetable` package:

- **`p.dayOfWeekFor(date, slot.SectionID)` reverted to `ISODayOfWeek(date)`** — seven tests failed,
  including `TestASubstitutedDayRunsTheSubstituteWeekdayAndNotItsOwn` with `must return [A-monday],
  got [A-saturday]`.
- **the section-override branch deleted from `dayOfWeekFor`**, leaving the day-wide column — four
  failed; `TestAPerSectionPatternBeatsTheDayWideOneForThatSectionAlone` reported `got [B-monday]`,
  which is the day-wide pattern reaching a section that had opted out of it.
- **`if day.Open(HalfAny)` replaced by `if true` in the gap recorder** —
  `TestAHolidayIsNotReportedAsAnUncoveredDay` failed, reporting the closed Wednesday as a hole.
  That test had to be strengthened first: with the fixture timetable still covering Wednesday the
  guard was never reached and the assertion proved nothing, so the timetable is now closed before
  the holiday is queried.
- the publish refusal and `TestPublishAllowsAnOverlapOnDisjointSections` constrain each other:
  widening the check to any overlapping timetable breaks the second, narrowing it to nothing
  breaks the first.

---

## Downloading the whole school's timetable as a workbook (2026-09-30)

### `internal/service/timetable/export.go`, `workbook.go`, `internal/transport/http/timetableexport.go`

`GET /api/v1/timetable-export.xlsx`, gated by `core.timetable.read` with `core.timetable.read_all`
as the wide variant, returns one worksheet per class section. No new CAS key: the document is the
same fact the timetable reads already return, in a different container, and a second key would let
a school grant the spreadsheet to somebody it had denied the screen.

### The pattern is the document; a range is the option

Two different documents were possible and they are not interchangeable.

The **weekly pattern** is the timetable as published: the days across the top, periods down the
side, one grid that holds all term. It is what a school means by "the school timetable" — the thing
that gets printed, pinned to a noticeboard and handed to a parent in April. It is stable, so a
stale copy is still broadly true.

A **range of occurrences** is the timetable as it actually falls: holidays removed, cancellations
and substitutions applied, substituted days re-patterned. It is a different and more perishable
document — useful for the coming fortnight, meaningless as a wall chart, and wrong the moment a
deviation is recorded after it was downloaded.

So `mode=pattern` is the default and `mode=range` is available, with `from` and `to`. The two are
mutually exclusive in the query rather than one silently winning: `on` with `mode=range`, or
`from`/`to` without it, is 400. A caller who gets the wrong document back has no way to tell, and
the failure mode is a printed wall chart of one particular fortnight.

`mode=range` goes through `ResolveCoverage`, never re-deriving the weekday from the date. That is
the whole reason the range mode is worth having and also the reason it could silently be wrong:
`plan.dayOfWeekFor` is what makes a substituted Saturday run Monday's lessons, and a
`time.Weekday()` call in the exporter would have produced a document that looked right and was not.
`TestRangeExportShowsTheSubstituteDaysLessonsOnASubstitutedDay` holds that: the fixture publishes a
period 3 only on Monday, Saturday substitutes Monday, and the Saturday column must carry Commerce.
Deleting the substitution from the fixture turns the cell empty and the test red.

`MaxExportRangeDays` is 62, not the resolver's 400. Columns are dates in range mode, and a
four-hundred-column sheet is not a document anybody reads; the cap is a readability bound, not a
performance one.

### Which classes get a sheet, and why a hidden class is 404 rather than an empty book

Authorization first: the slot query carries `access.TimetableSlotsFor(viewer, decision)` and the
deviation query `access.TimetableDeviationsFor(viewer, decision)`, exactly as
`/timetable-occurrences` does, and `ErrScopeIncomplete` still refuses a caller who narrows one
without the other. A `section_id` filter is ANDed on top of that, never instead of it.

Deliberately **not** shaped like `core.sections` or `core.subject_offerings`, which have no `_all`
variant and narrow by nothing. That is a known pre-existing fail-open, and an export that copied it
would hand a class teacher the whole school in one file — a far larger leak than the list endpoint
it was copied from.

The set of sheets is `CoveredSections(timetable)` **intersected** with the sections of the slots the
viewer can actually read. The cover bounds the set so a stray slot pointing outside it cannot invent
a sheet; the readable slots admit it. A section the cover declares but for which no slot is readable
gets no sheet — we cannot distinguish "this class has an empty timetable" from "this class was
redacted", and asking the unnarrowed table which of the two it is would be the existence leak the
narrowing exists to prevent. The cover logic itself is `publish.go`'s, reused rather than restated,
including its fallback to the distinct sections of the slots when no join rows exist.

The cover is keyed per timetable, not unioned across them: `allowed` holds `(timetable, section)`
pairs, and a slot is admitted only if *its own* timetable covers its section. A union would let a
section covered by timetable A admit a slot belonging to timetable B that does not cover it. A
section that legitimately sits under two timetables on two period schemes — which
`publishConflicts` prevents for two *published* timetables over the same dates, but not for a draft
read with `status=draft` — therefore gets one grid per timetable rather than one grid missing half
its periods, and the two sheets de-collide by name and carry different captions.
`TestASectionUnderTwoTimetablesGetsASheetForEach` holds it; dropping the timetable from the key
loses every sheet.

Range mode is grouped the same way, keyed on `(period scheme, section)` rather than on section
alone, because that is where the sheet's rows come from. A section whose calendar day schedules two
schemes — a twilight or supplementary scheme alongside the main one — would otherwise have had its
rows built from whichever scheme the first occurrence happened to name, and every lesson in the
other scheme's periods would have been dropped on the floor with nothing said.
`TestRangeExportKeepsBothSchemesWhenASectionSitsUnderTwo` holds it, and keying on section alone
turns two sheets into one with the twilight lesson missing. Where two grids do appear for one
class, the scheme's name goes in the caption so the sheets can be told apart; where there is only
one, the caption stays quiet about it.

A caller who can see nothing gets **404**, not an empty workbook. An `.xlsx` that opens and is blank
reads as *this school has no timetable*, which is a false statement about the school rather than a
true one about the caller. `Export.Workbook()` refuses to write a sheetless file at all —
`ErrExportEmpty` — both because Excel will not open a workbook with no worksheets, and so the
handler cannot accidentally serve 200 on nothing. 404 rather than 403 is the house rule, and the
test asserts the absence of 403 explicitly rather than only the presence of 404.

The field policy is honoured per column rather than after the fact: `subject_offering_id`,
`teacher_id` and `room_id` are read off `decision.Fields` and passed in as `ExportVisibility`, so a
name the caller may not read is never fetched from the database, let alone written into a cell.
Subject, teacher and room names are resolved without their own viewer narrowing, because they label
a row the caller is already authorized to read; the authorization decision is on the slot, and the
name is a denormalisation of it.

### Blank means free, so nothing else may be blank

`periods.kind` is `teaching|break|assembly|other`, and a break is a real row in a real scheme. A
blank cell in a timetable reads as a free period, which is a different fact from "the school is at
assembly" — so non-teaching rows are filled with their kind, and in range mode a closed day's cells
carry the day type and its name ("Holiday – Founder Day") rather than being left empty. A teaching
period with no slot stays blank, because there the reading is correct.

A period the default bell suppresses (`bell_schedule_periods.runs = false`) is dropped from the
sheet entirely unless a slot uses it, and so is an inactive period. Times come from the scheme's
default bell schedule into a Time column; in range mode a cell whose resolved time differs from the
row's — a time-change deviation — carries its own clock span, and cancellations, substitutions,
room changes and added classes carry a word each.

Two slots in one period stack in the cell, divided by an em dash, rather than one overwriting the
other: subject, teacher and room for the first lesson, the divider, then the same three for the
second. An earlier version joined them field by field — `History / Physics`, `t6 / t5` — which lost
which teacher belonged to which subject, and `TestTwoSubjectsInOnePeriodBothReachTheCell` now
asserts the divider is present for exactly that reason.

**A known simplification:** in pattern mode there is one Time column per sheet, filled from the
scheme's *default* bell schedule. A school that rings a different bell on Saturday will see
Saturday's lessons against the weekday times. The pattern is a document about which lessons run on
which day, and a second time column per day would double the width of every sheet to carry a fact
that `mode=range` reports exactly, per date, from the bell the calendar day actually names.

### Sheet names, and why they are not just the section's name

Excel caps a sheet name at 31 characters, forbids `[ ] : * ? / \`, refuses an empty name and
reserves "History". `SanitiseSheetName` replaces the forbidden characters with a space, collapses
the run, trims quotes, truncates to 31 runes, and renames a sheet that would be called "History" to
"History class" — a school with a History set would otherwise fail to open the file at all.

Collisions are then resolved by `sheetNamer` with a `(2)`, `(3)` suffix, and the base is shortened
so the suffixed name still fits in 31. `TestDeCollidedSheetNameStillFitsExcelsLimit` asks for the
same long name twelve times and asserts every answer is distinct and in bounds.

**The sheet name is the grade level's name plus the section's name, not the section's name alone.**
Section names in this schema are "A", "B", "C" — scoped by grade, not unique in a school — so
naming sheets after them alone produces `A` and `A (2)` for XI A and XII A, and a user opening the
workbook cannot tell which is which. The de-collision rule would be satisfied in the letter and
defeated in substance. "XI A" and "XII A" are distinct, mean something to a reader, and still
collide only where two classes genuinely share a name; the section's own `code` is written into the
sheet's caption row so there is an unambiguous identifier on the face of every sheet regardless.

### The dependency

`github.com/xuri/excelize/v2` v2.11.0. It is the maintained pure-Go xlsx writer, and xlsx is what
was asked for. Emitting SpreadsheetML by hand was considered and rejected: `.xml` that Excel opens
is not the file a school will mail to a parent, and the escaping, the styles and the sheet-name
rules above would all have had to be written anyway with nothing checking them.

It pulls in `github.com/richardlehane/mscfb`, `msoleps`, `tiendc/go-deepcopy`, `xuri/efp`,
`xuri/nfp` and `golang.org/x/image`, and `go mod tidy` moved `golang.org/x/crypto` from a 2022
pseudo-version to v0.53.0 and bumped `x/mod`, `x/net`, `x/sync` and `x/text`. None of those five
are imported directly by this repository; the whole suite passes under `-race` after the bump.

### Verifying that the bytes are a workbook

Every export test parses the response body back with `excelize.OpenReader` and asserts on named
cells — the Monday column found by its header text, the row found by its period name. A test that
asserted only `200` and a non-empty body would pass against a zip file full of nothing.

Two mutations, both run against real Postgres:

- **`access.TimetableSlotsFor` / `TimetableDeviationsFor` replaced by `AnyTimetableSlot()` /
  `AnyTimetableDeviation()`** — three tests failed.
  `TestExportedWorkbookHoldsOnlyTheClassesTheViewerMayRead` reported two sheets where the viewer
  teaches one class, the range-mode test reported the same, and
  `TestExportOfAnUnreachableClassIsNotFoundRatherThanForbidden` got 200 and a 6598-byte workbook
  where it wanted 404.
- **the substituted day removed from the fixture** — the Saturday column's period 3 came back
  empty, and with the header-note assertion also deleted it still failed on the cell, so the
  content assertion carries its own weight rather than riding on the note.

One shared helper moved: the newest-first ordering of timetable versions was inline in
`buildPlan` and is now `sortTimetablesNewestFirst` in `plan.go`, called from both there and the
pattern export. `pickTimetable` depends on that order, so a second copy of the comparator was the
one thing in this change that could drift into choosing a different version for the sheet than the
resolver chooses for the day.

## Provenance on a generated paper: what is a column, what is JSON, what anchors reach (2026-10-01)

### `internal/ent/schema/paper.go`, `internal/data/access/papers.go`, `internal/transport/http/papers.go`

The nine paper tables were scoped to a paper **composed from a question bank**: a paper is anchored
by a blueprint or an exam, and its questions come from `questions` rows that already exist. The
paper-setter plugin **generates** a paper from an ingested book for a named class, and it has five
things to record that the composed model has no column for: the document the paper came from, the
class and the sections it is for, and the persona and seed that configured the generation.

Two shapes were on the table — typed columns for all five, or one JSONB payload for all five. Both
are wrong, for the same reason in opposite directions, and the split is decided by one question per
field: **is anything in this database ever going to filter, join or authorize on it?**

**`grade_level_id` is a column.** The approval queue is `GET /papers?grade_level_id=…&status=reviewed`,
and a subject head's grant is `core.papers.read` at tenant reach pinned to `grade_level=G8`. That pin
is translated by `papersPinnedBy`, which now ORs a fourth and fifth arm — the paper's own grade level,
and the grade level of its target sections — alongside the blueprint and exam arms it already had.
A pinned viewer reaching a generated paper depends on a `WHERE` on this column; in JSON it would
depend on the application remembering to filter, which is the difference between a constraint and a
convention. It is named `grade_level_id` and not `class_id` because a class is a `grade_levels` row
everywhere else in this database, and `internal/authorization/constraint.go` registers the row field
under the name `grade_level`. A second word for the same thing would have to be translated at every
pin.

**The sections are a table, `paper_target_sections`, not a text array and not a JSON list.** A paper
targets several sections; the sections are authorized on; and a UUID array cannot be foreign-keyed,
so an array would let a paper name a section that does not exist and make the reach predicate raw
SQL rather than an ent edge. The table is modelled on `elective_group_offerings`: two immutable
columns, `ON DELETE CASCADE` from the paper so deleting a paper takes its targeting with it, and
`ON DELETE NO ACTION` to `sections` so a section cannot be deleted out from under a paper that names
it. The unique index on `(paper_id, section_id)` is what makes a repeated id in the payload a
no-op rather than a duplicate row; the handler folds duplicates before the insert, and the index is
the backstop. Note the name: `paper_sections` was already taken by the paper's own Section A and
Section B, which are a different thing entirely, so these are `target_sections` throughout.

**`engine_document_id` is a column with no foreign key, and it borrows its name deliberately.** The
document is a retrieval-engine document, not a row here, so there is nothing to reference.
`content_items.engine_document_id` is already the estate's name for exactly that — an opaque id in
the engine's id space, indexed, unconstrained — and reusing the name is what keeps the absence of a
foreign key from reading as an oversight. It also buys a real join: given a paper's
`engine_document_id`, the indexed column of the same name on `content_items` finds the local library
row for that book if there is one. The correlation is a query rather than a promise, which is the
honest form for an id this database does not own.

**`persona_id` and `seed` are one JSONB column, `provenance_json`.** Both are ids in paper-setter's
own database, neither is filtered, joined or authorized on, and both are only ever read back whole to
reproduce a generation. They are typed, though — `shared.PaperProvenance` has exactly two string
fields and the handler caps both at 128 runes — because "one plugin's shape" is a reason to keep the
shape out of the schema, not a reason to accept anything at all. `seed` is a string and not an
integer so that a seed that is not a number, or is a 64-bit number JSON would round, round-trips
exactly.

Every one of the five is optional. A paper composed from the bank sets none of them, and
`TestAPaperComposedFromTheBankNeedsNoProvenance` asserts the three columns come back NULL and
`section_ids` comes back empty rather than absent.

### What anchors reach, and the hole the tests found

`paperAnchorsReach` refuses to create a paper that a narrowed viewer could not then read: before this
change a paper with neither `blueprint_id` nor `exam_id` was reachable school-wide only, which is
precisely why paper-setter could not store a paper at all. Target sections are now a third anchor,
and `paperArms` gains a matching read arm — a paper is reachable if one of its target sections is one
the viewer teaches.

**A class alone is not an anchor.** The first version accepted `grade_level_id` on its own, and
`TestRetargetingReplacesTheWholeSet` caught what that meant: drop every target section from a paper
that still names a class, and the creating teacher got 404 on their own paper on the next request.
There is no grade-level read arm, and there deliberately is not one — a Physics teacher in 10-A must
not reach the Chemistry paper for 10-B, and papers carry no `subject_id` to pair a grade with, so a
grade arm could only be as wide as the whole class. So `grade_level_id` says who the paper is *for*
and the target sections say who may *reach* it, and a paper naming a class but no section is refused
for a narrowed viewer exactly as a paper naming nothing is. The grade column still earns its place:
for a viewer at tenant reach pinned to a grade, `papersPinnedBy` is the whole predicate, and the
column is what that pin lands on.

**Targeting is a teaching reach only.** `bankReach` gains a `taught` field, set by
`bankTeachingReach` and by nothing else, and the target-section arm is built from `sections` and
`taught` rather than from `offerings`. Without that, `bankStudiedReach` would hand a pupil their own
section through their enrolled offering, and a pupil in 10-A would reach every draft paper aimed at
10-A including the subjects they do not take — wider than the exam arm, which at least requires
enrolment in the exam's own offering. `TestAPupilDoesNotReachAPaperMerelyTargetedAtTheirSection` and
its guardian twin assert `paper_target_sections` is absent from the rendered SQL at those reaches.

Three checks run before a target is stored, and all three are authorization or integrity rather than
filtering: every named section must satisfy `SectionsWritableForPapers`, must belong to the paper's
own academic session, and must belong to `grade_level_id` when one is given. The third cannot be a
database check — it crosses `sections` — so it is a read-and-compare in `paperTargetsReach`.

Mutations, all run against real Postgres with `TEST_REQUIRE_TENANT_DB=1`:

- **the target-section arm removed from `paperArms`** — three tests failed.
  `TestAGeneratedPaperCarriesItsProvenanceAndStaysReachable` got 404 reading back a paper it had just
  created, `TestTheApprovalQueueNarrowsByClassAndSection` got 404 patching it, and the access-level
  `TestATaughtSectionReachesAPaperTargetedAtIt` printed the rendered SQL with only the exam arm left.
- **`paperTargetsReach` returning true unconditionally** — two tests failed with 201 where they
  wanted 422: a section in another class, and a section the viewer does not teach at all. Both came
  back with the foreign section id sitting in `section_ids`, which is what the gate exists to stop.

## Subject on a paper: what closes the grade-arm leak, and what a null subject still means (2026-10-01)

### `internal/ent/schema/paper.go`, `internal/data/access/papers.go`, `internal/authorization/constraint.go`

The provenance change above reached the right conclusion from an incomplete board. It found that
grade-level reach alone is unsafe, and settled on *"`grade_level_id` says who the paper is for;
target sections say who may reach it"*. That holds. What it could not see is that the target-section
arm it built is itself subject-blind: `sectionArms` hands a viewer every section they teach anything
in, so **a teacher who holds one offering in 10-A reached every paper targeted at 10-A**, including
the subjects they do not teach. The note said as much in passing — "papers carry no `subject_id` to
pair a grade with" — and treated the absence as a constraint. It was a missing column.

So the earlier design should have stood as far as it went, and this is the column it was waiting for.
Subject **narrows** the target-section arm; it does not replace it, and `grade_level_id` stays
descriptive.

**`papers.subject_id` is nullable, and the null case is the whole design.** A paper composed from the
bank across subjects legitimately has none, and every row already in production has none. The
question the reach predicate has to answer is what a null subject means to a narrowed viewer, and
there are only two answers: a null-subject paper falls back to the reach it had before, or it is
refused. Refusing hides every paper that predates the column, including live ones, so the decision is
the fallback — **nothing already reachable becomes unreachable, and only a paper that names a subject
narrows further.** `paperReachArms` is that sentence in code: one arm is
`subject_id IS NULL AND (the arms as they were)`, and beside it one arm per subject the viewer
reaches, each `subject_id = S AND (the arms rebuilt for S alone)`.

**The per-subject arms are the same arms, built from a narrowed reach, not a new predicate.**
`bankReach.forSubject` filters `pairs`, `offerings` and `taught` to one subject and hands the result
to the existing `paperArms`, so the blueprint, exam and target arms are all subject-correlated for
free and there is one narrowing to maintain rather than four. It needs an offering-to-subject map,
which is why `Viewer` now carries `SubjectGradeByOffering` — the same rows `subjectGradeIndex`
already loaded, kept rather than reduced to pairs on the way out.

**`forSubject` drops `sections`, and that is the point.** `subject_offering_id` is optional on
`teacher_assignments`: an assignment with no offering says a teacher is attached to this section and
says nothing whatever about which subject. Letting it through the subject arm would make a
section-wide assignment stand in for every subject, which is the leak again wearing the fix's
clothes. So a section-wide or class-teacher assignment reaches a paper that names no subject and no
paper that names one. A teacher reaches a subject-bearing paper only where they hold an offering of
that subject — which also means teaching physics in 10-A does not reach the physics paper for 10-B,
because the correlation is per section, not per subject-anywhere.

A pupil and a guardian keep their shape: `forSubject` runs on whichever reach they were given, so a
pupil reaches a tagged paper for a subject they take through the exam arm, and still reaches nothing
through targeting, which remains a teaching reach only.

### Registering `subject` as a pin field is not cosmetic, and the alternative is worse than ignoring

`subject` is now a declared, conditionable CAS field on `core.papers.*`, `core.blueprints.*` and
`core.question_bank.*`, so it had to be added to `authorization.rowFields` beside `section` and
`grade_level`. Without that entry a subject condition is not a row pin at all — `collect` walks past
any field the vocabulary does not know, so no `Constraint` is produced, and `Satisfiable` then treats
the condition as a **runtime attribute**.

That fails closed, and it is worth being exact about the direction, because the obvious guess is a
leak. Measured, not assumed: with no `subject` attribute supplied, the alternative is unsatisfiable,
`Allows` returns `conditional grant needs attributes that were not supplied` and admits nothing. All
seven guard call sites in this service — `middleware/auth.go`, `capabilities.go`, `auth.go`,
`viewer.go` (three) and `timetableoverride.go` — pass `nil` attributes, and nothing anywhere
constructs an `Attributes` map. So before registration a policy author who wrote "this teacher,
physics only" did not get an unrestricted grant; they got a grant that **denied every request**, with
their intent lost as an outage rather than as a widening.

This is what makes registering the axis safe without auditing the existing policy estate first:
the only transition it can cause is deny → narrowed. An alternative that was skipped for want of an
attribute now admits and narrows; an entity whose predicates cannot translate subject now admits and
returns no rows. Neither is wider than a denial. (`TestAConditionOnAFieldTheVocabularyDoesNotKnowDeniesRatherThanWidening`
pins the denial so the next person does not have to re-derive it.)

One latent hazard survives and should be named: if anything in this service ever starts supplying
request attributes, a condition on an unregistered field becomes satisfiable and the grant admits
with `Constraints: []` — unpinned, the whole tenant. Verified by probe. That is an argument for
registering every axis CAS can declare, `branch` included, not just this one.

The entry has a blast radius, and it points the safe way. Every other resource's matcher
(`sectionsMatching`, `curriculumMatching`, `attendanceDayMatching`, `timetableSlotMatching`,
`contentMatching`) has a `default` arm that yields no rows, so a subject pin on students,
enrollments, attendance, timetables or the library now returns nothing rather than everything. That
is the house rule — a pin the service cannot translate yields no rows — and it is the honest reading
of `subject` on a student: "pupils in sections where physics is offered" would narrow nothing while
looking like it had.

**A pin value is a code, never an id.** `rowvalues.go` resolves `grade_level` to `grade.Code` and
`section` to `section.Code`, and `bankGradesMatching` translates with `entgrade.CodeIn`, so a subject
pin carries `subjects.code` and `subjectsMatching` is `entsubject.CodeIn`. A translator written
against UUIDs would match nothing and fail closed for every subject-pinned grant, which is the
expensive kind of correct. The code is the right handle for the same reason the grade's is:
`subjects.code` is `NotEmpty().MaxLen(32).Unique().Immutable()`, and `updateSubject` sets `name`,
`short_name`, `description`, `subject_type`, `is_elective` and `status` and has **no `SetCode`** — so
it is the one externally quotable, stable identifier a policy can name, while `name` is free to
change under it. `papers.subject_id` stays a UUID foreign key: the code is how a policy refers to a
subject, the id is what the row is, and the predicate resolves one to the other through the edge
rather than storing a code on `papers`.

Where `subject` **is** translated it lands on a column that means it:

- a paper, on `papers.subject_id`, and on its blueprint's subject, because a paper with no subject of
  its own can still be a physics paper through the blueprint it was composed from. Not through its
  exam's subject list: an exam spans subjects, so that arm would match a chemistry paper attached to
  an exam that happens to include physics.
- a blueprint, on `blueprints.subject_id`; a question, on `questions.subject_id`.
- a section or a class, only in the paper **write** gates, as "a section that offers this subject".
  That is wider than the pin reads, and it is bounded by the read predicate: a subject-pinned viewer
  who creates a paper must give it a subject that matches the pin or lose the paper on the next
  request, because `papersPinnedBy` is evaluated against the paper's own column.

Where it is **not** translated, and therefore returns nothing: `StudentsConstrainedBy` and
`EnrollmentsConstrainedBy` and `TeacherAssignmentsConstrainedBy` (all via `sectionsMatching`),
`LibraryItemsConstrainedBy` (`contentMatching`), `CurriculaConstrainedBy` and its node and placement
siblings (`curriculumMatching`), `AttendancePeriodsConstrainedBy` and `AttendanceDaysConstrainedBy`,
`TimetableSlotsConstrainedBy` and `TimetableDeviationsConstrainedBy`, period schemes, and
`gradeLevelWithinPins` in the curriculum transport. Every one of them already had a `default` arm
answering with an empty id set, so each yields no rows rather than ignoring the pin. Whoever authors
the first subject-pinned rule should read that list as the boundary: the axis narrows papers,
blueprints and the question bank, and closes everything else.

`papersPinnedBy` was restructured rather than extended. A group's constraints are now split: subject
constraints become one `AND` term on the paper itself, and the place constraints keep the four ORed
arms (blueprint, exam, own class, target sections). Extending the old shape would have put
`bankGradesMatching` on a subject pin, which can only answer with "no grade levels", quietly killing
a pin that has a perfectly good column to land on.

**Blueprints were already narrowing by subject, not merely storing it.** `blueprintArms` ORs one
`AND(subject_id = S, grade_level_id = G)` arm per `(S, G)` pair the viewer teaches, so the column has
been load-bearing in the read path since the bank was built; it needed a pin translation and a filter,
which it now has, and no schema change. The one arm that bypasses it is the section arm —
`HasGradeLevelWith(HasSectionsWith(IDIn(sections)))` — which is grade-wide for a section-wide
assignment, the same subject-blind shape this change closed on papers. It is left alone here because
narrowing it would remove reach that live grants have today, and it is the obvious next candidate.

### The write gate, and why it is a pre-check rather than a backstop

A paper whose subject its creator does not teach would be created and then 404 on the next request —
the failure `TestRetargetingReplacesTheWholeSet` was written to stop. The first version of this gate
was a backstop: write the row, re-ask `PapersFor` inside the transaction, roll back if it cannot see
it. It is airtight in production and **unobservable in the test fixture**, because `begin` returns a
unit with no `tx` when a transaction is already open (`ErrTxStarted`) — which is exactly the case
under `testsupport.TenantTx` — so `rollback()` is a no-op there and the test asserting "nothing was
written" could never pass. A gate whose correctness rests on a rollback the tests cannot exercise is
not a gate, so it was replaced by `paperSubjectReaches`, which runs before any write and reuses the
same `forSubject` narrowing through three predicates — `SectionsWritableForPaperSubject`,
`BlueprintsWritableForPaperSubject`, `ExamsWritableForPaperSubject`. They OR, mirroring the read
arms: any one anchor that still reaches under the narrowed reach is enough.

Mutations, all against real Postgres with `TEST_REQUIRE_TENANT_DB=1`:

- **the subject term dropped from the untagged arm** (`entpaper.Or(arms...)` with no
  `SubjectIDIsNil`, so the section reach covers every subject again) — five tests failed, the sharp
  one being `TestThePhysicsTeacherCannotReadTheHistoryPaperForTheirOwnSection`, which got 200 where
  it wanted 404. That is the leak this change exists to close.
- **`paperSubjectMatching` returning `AnyPaper()`** — the pin ignored rather than translated; two
  tests failed, including `TestASubjectAndGradePinNarrowBothAtOnce`, which is there so the subject
  half cannot be dropped while the class half still looks right.
- **`forSubject` keeping `sections`** — a section-wide assignment carrying every subject again. Only
  `TestASubjectTaughtInOneSectionDoesNotReachIntoAnother` failed, which is why that test exists: it
  gives the world's physics teacher a class-teacher assignment in a second section and asserts the
  physics paper *there* is still 404.
- **`subject` removed from `rowFields`** — three access tests and the two new
  `internal/authorization` tests failed; `TestSubjectPinBecomesAConstraintRatherThanBeingDropped`
  printed `got []`, which is the silent drop described above.

## Sample paper formats: a seeder, not an INSERT (2026-10-02)

### `cmd/seedblueprints/`

`blueprints` was empty in every deployment, so the blueprints UI had nothing to show and nobody
could see the shape of a paper this schema can hold. Eight samples now exist, written by a command
of their own.

**Why a command and not SQL.** Every number on a blueprint is validated in Go and emits no DDL:
`total_marks` is `Positive()`, `duration_minutes` is `Positive()`, `version` is `Positive()`, `code`
is `NotEmpty().MaxLen(64)`, `name` goes through `maxRunes(200)`. An `INSERT` bypasses all of them
and can write a blueprint no API response can describe — the same shape of mistake as
`day_of_week`'s `Min(1).Max(7)`, which produced no CHECK and let an 8 through to return an empty
day. Going through `tenantent` applies the lot.

**Why a sibling command and not a flag on `seeddemo`.** `seeddemo` fills a school with a year:
classes, pupils, guardians, a timetable, attendance. Those are exactly the rows nobody wants to risk
creating in a live school, and the samples here are wanted in live schools — that is the point of
them. A `-blueprints-only` flag on `seeddemo` would mean the command whose job is to invent a demo
year is the command an operator runs against a real one, with one boolean between the two outcomes.
`seedblueprints` touches three tables and resolves everything else by code, so there is no
destructive path to guard. `cmd/seed` is the precedent: a small command with one job.

**The arithmetic is checked before anything is written**, by `validate()` over the plan table, and
nothing is written if it fails. A sample whose own numbers disagree is worse than no sample, because
a reader learns the wrong shape from it and the generator that eventually reads these will inherit
it. What `validate()` settles: each blueprint's `total_marks` equals the sum of its sections'; each
section's equals `question_count × marks_per_question` where that is set; a fully weighted cognitive
scheme comes to 100 percent; a unit weightage given in marks comes to the paper's total; a fully
weighted one comes to 100 percent; section codes are unique within a blueprint; `(code, version)` is
unique across the set, because the database says so and a collision would die halfway through.

Two rules are inventions rather than schema facts, and both earn their place. *Either every section
is separately timed or none is* — a paper where three of five sections carry a duration says nothing
useful about the other two, and when all of them are timed they have to come to the paper's
duration. *A `bloom` constraint must name a band of its own blueprint's `cognitive_scheme`, and a
`topic` constraint a unit of its own `unit_weightage` where one is set* — this is the N-band scheme
being load-bearing rather than decorative. A constraint reading `band: "apply"` on a paper banded by
reading, grammar, writing and literature is unsatisfiable, and nothing in Postgres would catch it,
because `value_json` is open JSONB and `bloom_level` on `questions` is deliberately free text.

**`value_json` carries a `key` and a `measure`, and both are conventions this command introduces.**
Nothing consumes `blueprint_constraints` yet, so the shape was still open. `key` exists because
`(blueprint_section_id, constraint_type)` is not unique and should not be: the sample quiz carries
two `difficulty` constraints on one section, an easy share and a medium share, which is the honest
way to write "about half recall, about half not". Idempotency therefore keys on the type and the
`key`, not the type alone. `TestAHalfFinishedRunIsFinishedByRunningItAgain` is what holds this:
dropping `key` from `constraintKey` leaves that test's deleted `medium-share` unrestored forever,
while `TestASecondRunWritesNothing` passes either way — a second full run writes nothing even with a
degenerate key, so only the resume case can tell them apart.

`measure` is `percent`, `marks` or `questions`, and is required. `min_value: 20` means nothing
without it: twenty marks, twenty questions and a fifth of the section are three different
instructions. `validate()` also refuses a `marks` ceiling above the section's own marks and a
`questions` ceiling above its own count, which is the kind of nonsense that only shows up once
something tries to satisfy it.

**The samples cover every distinction the schema makes**, and
`TestTheSampleSetShowsEveryDistinctionTheSchemaMakes` fails if a future edit drops one: a reusable
template with no `academic_session_id` and one bound to a session; a null `unit_weightage` and a
populated one; a section with no `marks_per_question` because its questions differ; separately timed
sections and a single sitting; all three statuses; two versions of one code; all five constraint
types. The pair that matters most is the language paper: `BP-ENG-G8-ANN` and `BP-HIN-G7-HY` are
banded by reading, grammar, writing and literature, not by remember and apply, and
`TestALanguagePaperIsNotBandedLikeAScienceOne` fails if a Bloom rung is mixed into a language scheme.
That difference is the whole reason `cognitive_scheme` is a named N-band scheme rather than a fixed
Bloom tuple, and a sample set that only showed Science and Maths would hide it.

**An existing row is reported, never overwritten.** A second run writes nothing; a run over a
blueprint whose marks, duration or status a school has since edited prints it under "left alone" and
moves on. The seeder has no business deciding that its own sample is more correct than the school's
edit, and a seeder that silently reverted one would be unusable in a live school — which is the only
place these samples are wanted.

**The half-yearly is eighty marks here and forty in `seeddemo`'s exam plans, deliberately.** Nothing
joins the two: a blueprint carries no `exam_id`, and `papers` reaches an exam separately. These are
paper *formats* on the CBSE five-section shape, which is an eighty-mark shape; `seeddemo`'s
half-yearly is a forty-mark sitting. If they are ever meant to agree, the exam plans are the side
that should move, because the shape is the board's and the sitting is the school's.

## Curriculum shape: a unit holds chapters, a chapter holds topics, a topic holds nothing (2026-10-02)

### `internal/ent/schema/curriculumnode.go`, `internal/transport/http/curriculum.go`

A curriculum is chapters, each holding topics, optionally grouped into units. That is what teachers
describe, what every weighting assumes and what availability rolls up over. Until now
`curriculum_nodes` enforced **no nesting rule at all**: `kind` was a free `unit|chapter|topic` on one
self-referencing table, so a unit could be a child of a topic, a topic could hang off the curriculum
root, and the only limits were the traversal guard `maxCurriculumDepth` and the cycle check on
re-parent. The rule is now:

| kind | parent | children |
|---|---|---|
| `unit` | none; a top-level grouping only | chapters |
| `chapter` | none, or a `unit` | topics |
| `topic` | must be a chapter | none |

`unit` stays optional, which is why a chapter at the root is legal: a school that does not group
chapters into units simply has none, and refusing a root chapter would leave that school unable to
describe its own curriculum.

### The survey came first, and it came back empty

A constraint that refuses data already in the table is an outage, so the rows were counted before
anything was written: the live tenant `emerge_tenant_dps_ngp`, the local demo tenant, and the
`sitting_probe` clone. All three hold the same 354 nodes, 45 units, 72 chapters and 237 topics, and
**every violation count is zero**: no parentless topic, no topic under a non-chapter, no parented
unit, no chapter under a chapter or a topic, no topic with children, no unit with a non-chapter
child, no `parent_id` pointing at a row that is gone. `seeddemo` builds the tree top-down with the
parent set at insert time, which is why. Nothing was repaired, because there was nothing to repair.

### Two CHECKs for the half a row can answer, a pre-check for the half it cannot

The rule splits along what one row knows about itself.

**A unit has no parent, and a topic has one.** Both are single-row predicates, so both are real DDL:
`entsql.Checks` on the schema gives `curriculum_nodes_unit_is_root` and
`curriculum_nodes_topic_has_parent`, which `cmd/migrate make` diffs out the way it did the
`day_of_week` checks before them. This matters because **ent field validators emit no DDL at all** —
`field.Enum(...)` and `.Min()` produce no constraint, so a validator alone would leave a raw `INSERT`
free to write a shape no API response can describe. Proven on a `TEMPLATE emerge_tenant_demo` clone:
the `ALTER TABLE` validated against all 354 real rows, and then a raw `INSERT` of a parentless topic,
a raw `INSERT` of a parented unit, and an `UPDATE ... SET parent_id = NULL` over every topic were
each refused by Postgres by constraint name. The `parent_id` foreign key is already
`ON DELETE CASCADE`, so deleting a chapter takes its topics with it rather than orphaning them into
the state the new CHECK would then block the delete over.

**A topic's parent must be a chapter, a chapter's must be a unit, and a node may not hold children
its kind forbids.** None of this is expressible as a CHECK, and that is a property of Postgres rather
than an oversight: a CHECK may not contain a subquery, so it cannot read another row's `kind`. Two
routes would have made it declarative and both were rejected. A trigger cannot be produced by an
Atlas diff from the ent schema, and hand-writing SQL into a generated migration directory is how the
`atlas.sum` ledger gets stranded. Denormalising the parent's kind into a `parent_kind` column with a
composite foreign key `(parent_id, parent_kind) -> (id, kind)`, a unique index on `(id, kind)` and a
CHECK over the legal pairs would genuinely work — it is the standard trick for exactly this — but ent
generates only single-column foreign keys, so that FK could not be generated either, and the column
would then have to be maintained by every writer, `cmd/seeddemo` included. So this half lives in the
handler, and these notes say so plainly rather than approximating the rule with a constraint that
looks like it covers more than it does.

No ent hook was added. A hook would cover `seeddemo` as well as the API, but it would not cover a raw
`INSERT` — which is what the CHECKs are for — and no schema in this repo has `Hooks()`, so it would
buy one writer at the price of a new pattern and a query on every write.

### It is a pre-check, not a backstop, and it fires on re-parent

`TenantTx` makes a handler's `rollback()` a no-op, so a post-write check that tried to undo an
illegal shape would be unverifiable in a test — the same reason the paper write gate is a pre-check.
`checkCurriculumNodeShape` therefore runs before `Save`, and `fx.refusedBefore("curriculum_nodes")`
asserts in every refusal case that nothing was written at all.

The path that would have been forgotten is `PATCH`, and it is the one that turns a valid tree
invalid. Three things can break the shape on update and all three are checked: a new `parent_id`, a
`parent_id` cleared to null, and a change of `kind` with the parent left alone. The effective kind and
effective parent are resolved first — sent, cleared, or current — so the check runs against the state
the row would end up in rather than against the request in isolation. A kind change also has to look
downward, because a node's children can only become illegal when its own kind moves:
`checkCurriculumNodeChildren` asks for one child whose kind the new kind refuses.

**That downward check is only reachable from a valid tree by a request that moves and re-kinds at
once**, which is worth knowing before reading the test. Changing a node to `topic` requires its
parent to be a chapter, and a node under a chapter is already a topic, so from a valid tree the
parent check fires first and "a topic holds no children" would be dead code. The request that reaches
it is `{"kind":"topic","parent_id":<another chapter>}` on a chapter that still has topics, which is a
plausible thing for a wizard to send, and that is the case the test drives.

`kind` and `status` are now parsed before any of the shape queries rather than just before `Save`.
Pure body validation belongs ahead of work that touches the database, and without the move an
unknown `status` on a shape-violating body would have been answered with the shape refusal, which is
what `TestCreateCurriculumNodeRefusesAMalformedBody` caught.

### 422, the same code as the two refusals beside it

A shape violation answers **422** and names both the rule and the node:
`curriculum_shape: a topic may only sit under a chapter, but node <id> names parent_id <id>, which is
a unit`. Never a normalisation to a legal shape — a curriculum quietly re-hung is worse than a
refused write, because the teacher never learns their tree was wrong.

It was written as a 400 first and settled at 422 to match the two refusals it stands next to on the
same endpoints: a parent in another curriculum, and a cycle. The argument for 400 was that a shape
violation is about the `kind` and `parent_id` combination in the request rather than about whether
the referenced row is reachable. The argument that won is simpler and the one a client feels: three
refusals about `parent_id` on one endpoint should not be answered with two different codes, and a
body that parses and names rows that exist is the textbook case for 422. `curriculumShapeRefusal`
and `checkCurriculumNodeChildren` hold all five of these codes, and the three shape tests assert
them.

### What the tests hold, and what the mutants proved

Every illegal combination is driven separately and asserted on its message rather than on "an error
happened": thirteen `(kind, parent kind)` pairs on create, including the default-kind case where
omitting `kind` means `topic` and a topic at the root is refused; eight re-parent cases on update,
including promotion to the root; four kind-change cases. The legal shapes come first in every table
so an aborted case cannot make a positive control look like a failure, and each refusal asserts the
node's own id appears in the message.

Three mutations, each of which turns a test red:

- letting a parentless topic through (`curriculumKindFitsUnder` returning `true` for a nil parent)
  fails the root and default-kind cases on create and the promotion case on update
- letting a unit sit under a topic (adding `unit` to what a topic holds) fails the unit cases
- letting a topic take children (`curriculumKindRefuses` returning nothing for a topic) fails the
  kind-change case, which is the only one that reaches the downward check

Five existing tests changed, and the changes are the rule arriving rather than the tests being bent
to fit it. Four were fixtures that happened to encode the old freedom — a topic parented to a topic,
a root node created with the default kind — and now name a chapter or a unit where the shape needs
one. The fifth is a real narrowing: `TestUpdateCurriculumNodeClearsTheParentWhenToldTo` used to clear
a topic's parent, and a topic can no longer be parentless, so it clears a chapter's instead. Clearing
a `parent_id` is still honoured; it is honoured only for a chapter or a unit, and a topic promoted to
the root is now a 422.

**No existing database row violated the rule, but one existing test wrote one**, and it is worth
recording because it is the shape of problem this kind of migration causes.
`internal/transport/http/resolve_test.go` built its out-of-reach fixture as
`newNode(unreachable.ID, nil, KindTopic, "Out of reach", 1)` — a parentless topic, written straight
to the tenant database. Against a clone with the migration applied it panicked on
`curriculum_nodes_topic_has_parent`, and because the panic took the fixture down with it the rest of
that package never ran, so one illegal fixture row hid the result of every other test beside it. It
is now a `KindChapter` with no parent, which is legal and preserves the fixture's purpose exactly:
the node exists to prove that scoping hides another curriculum's rows, so the curriculum it belongs
to is what matters and its parentage never did.

That was the only one. The only other real-database writers of curriculum nodes are
`indexer_test.go` and `ingestmode_test.go`, and both create a root chapter. The whole DB-backed suite
is green against a clone carrying the migration, which is the check worth repeating before this is
applied to a tenant for real — the survey proves the *rows* fit the rule, and only a test run proves
the *fixtures* do.

## The content node write path: a book's table of contents, and why one key is not enough (2026-10-02)

`content_nodes` has existed for a while, `content_placements.content_node_id` points at it, and
`resolveCurriculumNodeContent` already reads it. Nothing could create a row. A grep for
`ContentNode.Create`, `createContentNode` and a `content-nodes` route returned nothing outside the
generated client, and production held zero rows — the table, its index set and its reader were built
and the writer never was. That is the unreachable-capability pattern from the other direction: not a
producer with no consumer, but a consumer with no producer, which is the half a grep *can* find.

`internal/transport/http/contentnode.go` is the missing half: `POST` and `GET` on
`/api/v1/library/{id}/nodes`, mounted beside the item they describe because a content node has no
life apart from its book.

**The book's vocabulary is not the curriculum's.** `content_nodes.kind` is
`part | chapter | section | topic`; `curriculum_nodes.kind` is `unit | chapter | topic`. The overlap
on `chapter` and `topic` is a coincidence of English and not a shared type. `part` is a publisher's
division and `unit` is a syllabus's, and a handler that validated one against the other would accept
`unit` as a division of a book. So the refusal says so in as many words: *"kind must be part,
chapter, section or topic: these are the book's own divisions, not the curriculum's unit, chapter or
topic"*. Sending `unit` is a 400, and a test pins it.

**Page 0 is refused before ent sees it.** `page_start` and `page_end` are
`Optional().Nillable().Positive()`, and `Positive()` excludes 0 — so an importer sending `0` would
otherwise get ent's own "value out of range", which reads as a bug in the importer's arithmetic
rather than as the real message. Elsewhere in this estate `0/0` is the sentinel for *not recorded*,
which is exactly the mistake a client will make. The pre-check names the sentinel: *"must be 1 or
more; omit it entirely when the page range is not recorded, because 0 reads as page zero rather than
as unrecorded"*. Absent stays absent; nothing substitutes a zero for a null.

**The idempotency key is `(content_item_id, parent_id, sequence)`, and the other candidate is wrong
for a specific reason.** An importer re-runs, so a second `POST` of the same chapter must not fork
the row. The obvious key is `(content_item_id, engine_section_id)` — the machine key, the thing a
placement binds on. It is the wrong choice, and `WIZARD-PLUGIN-PLAN` §C11 says why without saying it
about this: `stable_section_id(document_id, path)` is derived from the breadcrumb, so **retyping a
chapter title re-mints it**. Keying on `engine_section_id` therefore duplicates the row in exactly
the case the two-key design was invented to survive: a re-parse after a title edit arrives with a new
machine key for the same chapter and would be inserted alongside the old one. Position survives a
title edit. So position is the identity and `engine_section_id` is the binding, and a re-run
refreshes the binding in place.

That trade has a cost and it is the honest one to state: a re-run that *reorders* the book writes
each slot's new occupant over the old. A reordering re-import is a replace, not a merge, and this
route does not pretend to be one.

**A drifted `engine_section_id` is a 409, not a second row.** If the supplied `engine_section_id`
already belongs to a different node of the same book, the write is refused: a section cannot sit in
two places, so this is drift rather than a re-run. §C11's whole argument is that holding both
identifiers makes a disagreement *detectable* instead of silent, and answering 200 while quietly
pointing two positions at one engine section would throw that away. There is no unique index behind
this — see the code-only list below — so the check is the only thing enforcing it.

**`resolved_at` is stamped by the server, and only when the binding actually changes.** It records
when `engine_section_id` was bound, so a client supplying it is a 422 the way `confirmed_at` is on a
placement. A re-run with an unchanged `engine_section_id` keeps the original stamp; a re-run with a
new one re-stamps. Re-stamping unconditionally would erase the one fact the column exists to hold —
when this node was resolved — and replace it with the time of the last import, which every row would
then share.

`resolved_at` is null whenever there is no binding, which is what keeps it meaningful: it is never a
second copy of `created_at`. `TestContentNodeWithNoBindingCarriesNoResolvedAtInPostgres` pins both
halves — an unbound node leaves it null, and a re-run that demonstrably rewrites the row (its
`updated_at` moves) leaves `resolved_at` standing still. A column that advanced on every write would
record the import, not the resolution, and the staleness test below would compare an import time
against an ingest time and always look current.

**What `checkEngineSectionIDShape` does, and what it cannot do.** It checks that a caller-supplied
`engine_section_id` is non-empty and within the column's 128 characters. That is all, and the name
says `Shape` for that reason. It is **not** a staleness guard and it cannot become one: validity and
currency are different questions, and only the engine can answer the second.

The engine derives a section id as `sec_` + sha1(document id + the section's display path)[:12]
(`lms-retrieval-engine/retrieval_engine/ingest.py:138`). So a chapter rename, or a re-reviewed split
on the GPU side, **re-mints every affected id**, and nothing notifies emerge-core. A stored id that
has gone stale reads as *"this chapter has no content"* — a narrowing failure, at 200 OK, with
nothing reporting it. The timing hides it further: `PATCH /documents/{id}` carries the stored section
tree across without re-deriving ids, so the churn does not arrive at the rename. It arrives at the
next **re-ingest**, with nothing connecting the two events.

This route therefore **stores what it is given and does not police it**. Core calls nothing outbound
here, so rejecting an id it cannot verify would only refuse correct writes while catching no stale
ones. `TestContentNodeStoresAnEngineSectionIDItCannotVerifyInPostgres` pins that deliberately: a
real `sec_`-shaped id, a value with no `sec_` prefix at all, an over-long hex tail and a non-ASCII
string are all stored verbatim, and the only refusals are the empty string and the column's length.
A future reader who adds a format check here will break ingestion the first time the engine changes
its derivation.

**The detection lives elsewhere, and `resolved_at` is what makes it possible.** `GET
/documents/{doc_id}/digest` returns a `structure_digest` that moves when any `section_id` changes and
is silent on metadata; `w6-mapping` stores it with `counts.chunks` beside the binding. The test is
then: **a binding whose `resolved_at` predates the book's last re-ingest is suspect**, and a digest
that has moved since says which. Nothing in this route policies currency at write time; its job is to
let a correct value be stored and a stale one be recognisable later.

**A drifted id is still refused, and that is a different claim.** The 409 above is a *local*
invariant — one `engine_section_id` per book — not a currency check. It fires when the supplied id
already belongs to a different node of the same book, which cannot be true of a current id and so
needs no outbound call to settle.

**A re-run is a full statement of the row, not a patch.** On the update arm an absent `page_start`
*clears* the stored one rather than leaving it. This differs from `PATCH` elsewhere in the package
and is deliberate: the same body posted twice must leave the same row, and merge semantics would let
a stale page range outlive the re-parse that dropped it. The route is an importer's `PUT` wearing a
`POST`'s name, because the client does not know the row's id.

**Authorization reuses the library keys; no new key was minted.** A content node is the structure of
a content item and has no independent existence, so `LibraryCreate` / `LibraryWriteAll` gates the
write and `LibraryRead` / `LibraryReadAll` the read — the same pair `createAsset` and
`listLibraryItems` use. The parent is then narrowed by `access.LibraryItemsWritableBy` for a write
and `access.LibraryItemsFor` for a read, which is what `updateLibraryItem` does. A separate
`core.content_nodes.*` family would have to be granted everywhere `core.library.*` already is, to
describe the same permission.

The handler also checks `decision.Allowed` itself rather than leaning on the `s.can` middleware. That
is not belt-and-braces: `LibraryItemsFor` does not consult `Allowed`, so a decision with
`Allowed: false` and no reach falls through `scopedLibraryItems` to `libraryRoleScope`, which
*admits* school-audience rows. Without the explicit check a caller who had lost the key would still
read the table of contents. A test covers it.

**An unreachable book is a 404.** Both handlers answer `library item not found` for a content item
the viewer cannot reach, because a 403 would confirm that the book exists.

**What is code-only, because ent validators emit no DDL here.** `field.Enum` and `.Positive()`
produce no `CHECK` in this repo's generated schema, and the natural key has no unique index —
`content_nodes` indexes `(content_item_id, parent_id, sequence)` and `engine_section_id`
non-uniquely. So the following hold *only* through the ent client and this handler, and a raw
`INSERT` bypasses every one of them:

- `kind ∈ part|chapter|section|topic` and `origin ∈ manual|ingested`
- `page_start > 0`, `page_end > 0`, and `page_end >= page_start`
- `title` non-empty and within 255 runes; `engine_section_id` non-empty and within 128 — a length
  and emptiness rule only, never a format one, for the reason given above
- one node per `(content_item_id, parent_id, sequence)` — the idempotency key
- one `engine_section_id` per book

The first four could become CHECK constraints. The last two cannot be added as unique indexes
without first deciding what to do about the rows a reordering re-import would collide, so the route
owns them for now. Any future bulk loader must go through this handler rather than `COPY`.

**What the tests prove, and what the mutants proved about the tests.** Twelve DB-backed tests run
against a real tenant Postgres under `testsupport.TenantTx` with a restricted teacher viewer.
`requireGenuineScope` fails the fixture if the viewer resolves unrestricted, carries no section, or
if the reachable and unreachable books are not actually reachable and unreachable — otherwise every
404 below would pass for the wrong reason, which is the trap recorded under "Counting the tests that
prove nothing about scoping". Three mutations were run through `go test -overlay`, so no file on disk
was edited: replacing both library predicates with `AnyLibraryItem()`, answering 403 instead of 404
on an unreachable book, and making the idempotency lookup always miss. Each turned tests red.

The third initially died on the 409 drift check rather than on a row count, which exposed a real gap
— a re-run of a node with *no* `engine_section_id` was not covered, and that is precisely the manual
table of contents. `TestCreateContentNodeIsIdempotentWithNoEngineSectionIDInPostgres` was added for
it, and the mutant now dies there instead, on a 201 where the re-run must answer 200.

The first mutation was also re-run with the fixture's own premise assertions removed, because
otherwise its kill rested on the premise guard rather than on any behaviour. Without that guard the
create under an unreachable book answered **201** and wrote a row into a stranger's content item,
and the list answered **200** carrying the stranger's node — so the behavioural assertions do catch
a dropped predicate on their own.
