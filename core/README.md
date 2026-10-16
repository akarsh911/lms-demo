# emerge-core

The Go backend for Emerge. It serves a JSON API for schools, people, students,
staff, teachers and guardians.

Repo: <https://github.com/Harbour-Emerge/emerge-core>

---

> **The source carries no comments.** Why the code is the way it is lives in
> [`docs/DESIGN-NOTES.md`](docs/DESIGN-NOTES.md) — the reasoning behind the
> authorization model, the fail-closed rules, and the decisions that were taken
> after something turned out to be wrong. Read it before changing anything in
> `internal/authorization` or `internal/data/access`.


## The two big ideas

Before the folder tour, there are only two things that make this project
unusual. Everything else is ordinary.

### 1. Every school gets its own database

Most apps put all customers in one database and add a `company_id` column to
every table. This project does not do that.

There is **one small shared database** (we call it the *control plane*). It
holds a list of schools, and for each school, the encrypted username/password
needed to reach that school's **own separate database**.

```
                    control-plane database
                    ┌──────────────────────┐
                    │ schools              │  the list of schools
                    │ school_profiles      │  encrypted DB / S3 passwords
                    └──────────┬───────────┘
                               │  look up + decrypt
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
      DPS Nagpur DB      St Xavier DB      Ryan Intl DB
      persons            persons           persons
      students           students          students
      staff              staff             staff
      ...                ...               ...
```

Every request must send a header saying which school it is for:

```
X-School-Id: DPS-NGP
```

Middleware reads that header, looks the school up, decrypts its database
password, connects, and hands the right database to your handler. You never
think about it again.

**The rule that follows from this:** tables inside a school's database never
have a `school_id` column. They do not need one — the whole database belongs to
one school. Adding `school_id` to `students` would be a mistake.

(`branch_id` is fine and different. One school can have several campuses inside
its one database.)

### 2. Anything that changes each year does not go on the main record

A student's class and section change every academic year. So they are **not**
columns on `students`. If they were, promoting a student in July would erase
what class they were in last year, and you could never print last year's report
card again.

Instead, anything year-dependent lives on its own row that says which year it
belongs to. `students` holds only the permanent facts: admission number, name
link, admission date, status.

---

## Folder tour

```
emerge-core/
├── cmd/                  programs you can actually run
│   ├── api/              the web server
│   ├── migrate/          the database migration tool
│   └── seed/             bootstraps a school and its first administrator
│
├── internal/             all the app code
│   ├── config/           reads settings from environment variables
│   ├── ent/              database models
│   ├── data/             queries and relationships
│   ├── authorization/    permission checking
│   ├── service/          logic that spans more than one system
│   ├── infrastructure/   database connections, encryption, CAS client
│   ├── domain/           small shared types
│   └── transport/http/   routes, handlers, middleware
│
├── api/                  Bruno collection: the API exercised end to end
├── docs/TODO.md          decisions taken but not yet fully built
├── migrations/           generated .sql files
├── pkg/response/         helpers for writing JSON responses
├── scripts/              dev helpers, including the curl end-to-end run
└── docker-compose.yml    local databases
```

Now the same thing, but "what do I put where".

---

### `internal/ent/schema/` — your models

**This is where you define a table.** One file per table.

If you have used Eloquent models with migrations, or Sequelize/Prisma models —
this is that. You describe the columns and relationships in Go, and a code
generator turns it into a working query builder.

```go
// internal/ent/schema/student.go
func (Student) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("person_id", uuid.UUID{}).Immutable(),
        field.String("admission_number").NotEmpty().MaxLen(64).Unique(),
        field.Enum("status").Values("active", "alumni", "withdrawn").Default("active"),
    }
}

func (Student) Edges() []ent.Edge {   // "Edges" means relationships
    return []ent.Edge{
        edge.From("person", Person.Type).Ref("students").Field("person_id").Unique(),
        edge.To("addresses", StudentAddress.Type),
    }
}
```

There are **two** schema folders because there are two databases:

| Folder | Database | Tables |
|---|---|---|
| `internal/ent/control/schema/` | shared control plane | `schools`, `school_profiles` |
| `internal/ent/schema/` | each school's own | the other 21 — see the entity list below |

**`mixin.go`** in each folder is not a table. It is the three columns every
table has — `id`, `created_at`, `updated_at` — written once instead of
twenty-one times.

After changing anything here, run:

```bash
go generate ./internal/ent/...
```

### `internal/ent/generated/` — do not touch

Machine-written. Deleted and rebuilt every time you run `go generate`. Never
edit these files; your changes will vanish.

---

### `internal/data/` — queries and relationships

**This is where `school.Students()` lives.**

The generated code works, but it is verbose. This folder wraps it in something
pleasant, so the rest of the app never writes raw query builder code:

```go
sc, _ := school.From(ctx)          // the school this request is for

students, err := sc.Students(ctx).
    Active().
    Search("sharma").
    WithGuardians().               // load guardians in the same query
    Paginate(50, 0).
    All()
```

Each entity has a folder with a `Query` type and chainable methods. Adding a
new filter means adding one small method there — and then everyone gets it,
instead of five developers writing five slightly different versions.

- `data/school/school.go` — the entry point: `sc.Students()`, `sc.Staff()`, `sc.Teachers()`, `sc.Guardians()`, `sc.People()`
- `data/student/`, `data/person/`, `data/staff/`, `data/teacher/`, `data/guardian/` — the query builders
- `data/access/` — works out who the caller is and what rows they are allowed to see

**One rule:** never load a relationship inside a loop. Use `WithX()` so it is
one query instead of a hundred.

```go
// wrong
for _, s := range students { s.QueryGuardians().All(ctx) }

// right
sc.Students(ctx).WithGuardians().All()
```

---

### How a listing is built

Every list endpoint follows the same four steps, and the order is the point:

```go
filters, err := student.ParseFilters(r.URL.Query())   // typed, validated
viewer, decision, err := s.scopeFor(ctx,              // what CAS granted
    authorization.StudentsRead, authorization.StudentsReadAll)

rows, err := sc.Students(ctx).
    ForViewer(viewer, decision).  // authorization  -- decides the rows
    ApplyFilters(filters).        // client filters -- can only remove rows
    Basic().
    All()
```

The decision says **how wide**. CAS names an abstract scope — `tenant`,
`self`, `guardian_ward`, `teacher_assignment` — and emerge-core works out
which concrete rows satisfy it. Breadth is never inferred from whichever roles
the caller happens to hold, because the scope is CAS's answer to give. A scope
emerge-core cannot resolve matches nothing rather than falling through.

`getStudent` calls the identical `ForViewer`, so reading by id cannot reach a
row a listing would have hidden.

Authorization first, filters second, and filters are only ever ANDed on. A
teacher authorized for 9A who asks for `?house_id=123` gets *9A and house 123*
— they cannot use a filter to get out of 9A.

Filters are typed per domain (`internal/data/student/filters.go`), not a
generic `map[string]string`, so an unparseable id or an unknown status is a
400 that names the parameter rather than a filter silently dropped. Dropping
one would widen the result the caller asked to narrow.

`internal/data/filter` holds only the parsing helpers; the fields themselves
belong to each domain.

### `internal/transport/http/` — your routes and controllers

**This is where API endpoints are defined.**

- `server.go` — the route list. This is your `routes/api.php` or `app.use(...)`.
- `students.go`, `persons.go`, `staff.go`, `teachers.go`, `guardians.go`, `schools.go` — the handlers. These are your controllers.
- `middleware/` — middleware.

The route list reads like this:

```go
r.Route("/students", func(r chi.Router) {
    r.With(s.can(authorization.StudentsRead)).Get("/", s.listStudents)
    r.With(s.can(authorization.StudentsWrite)).Post("/", s.createStudent)
    r.With(s.can(authorization.StudentsRead)).Get("/{id}", s.getStudent)
    r.With(s.can(authorization.StudentsWrite)).Patch("/{id}", s.updateStudent)
    r.With(s.can(authorization.StudentsDelete)).Delete("/{id}", s.deleteStudent)
})
```

`s.can(...)` is the permission middleware. `r.With(...)` attaches middleware to
one route only.

A handler does four things and nothing else: read the input, validate it, call
the data layer, write the response.

### `internal/transport/http/middleware/`

| File | What it does |
|---|---|
| `logging.go` | logs one line per request |
| `recover.go` | turns a crash into a clean 500 instead of a dropped connection |
| `auth.go` | checks the login token, then checks permissions |
| `tenant.go` | reads `X-School-Id` and connects to that school's database |

---

### `internal/authorization/` — permissions

Emerge does not store its own roles table. Login and permissions come from a
separate service called **CAS**.

Permission names look like `core.students.read`. A request is allowed only if
CAS says the user holds that permission. If CAS does not mention it, the answer
is no.

Two layers, and it matters that you understand both:

1. **CAS answers "may this user read students at all?"** — yes or no.
2. **This codebase answers "which students?"** — because CAS genuinely cannot.
   It has no way to express "the students whose guardian is this person".

So a guardian logging in gets `core.students.read` from CAS, and then
`data/access` looks up their guardian record and narrows the query to their own
children. A class teacher gets their whole section; a subject teacher gets only
the pupils taking their subject. A staff member who also holds
`core.students.read_all` skips the narrowing and sees the whole school.

emerge-core declares **87** permission keys, all registered with CAS. Reading
one row by id is narrowed exactly like a listing, so a guardian cannot reach
another family's child by guessing a UUID.

**If in doubt, the code shows less, not more.** A user with no matching role
sees zero rows, never all rows.

---

### `internal/infrastructure/` — the plumbing

| Folder | What it does |
|---|---|
| `postgres/` | opens database connections; holds the map of school → its database |
| `crypto/` | encrypts and decrypts the stored database passwords (AES-256-GCM) |
| `cas/` | talks to CAS: verifies login tokens, fetches permissions |

You will rarely edit these. They are the wiring, not the features.

### `internal/domain/`

Small shared types that several packages need — a postal address, a
qualification, the tenant description. No database code lives here.

### `pkg/response/`

`response.JSON(w, 200, thing)` and `response.Error(w, 400, "message")`. That is
the whole package.

---

## Migrations

Same idea as `php artisan make:migration` and `php artisan migrate`.

You do **not** hand-write SQL. You edit the model, and the tool works out the
SQL difference for you.

```bash
# 1. edit a file in internal/ent/schema/
# 2. regenerate the query code
go generate ./internal/ent/...

# 3. write the migration file (like make:migration)
go run ./cmd/migrate make add_student_house

# 4. run it (like migrate)
go run ./cmd/migrate apply

# see what is pending without running it
go run ./cmd/migrate status
```

`apply` does something important: it runs the migration against the control
database **and against every registered school's database**, one after another.
That is the part you would otherwise have to remember by hand.

Two things worth knowing:

- `make` needs a scratch database (`DEV_DATABASE_URL`) that it wipes to work out
  the difference. `docker compose up -d dev-db` gives you one.
- Every applied migration is recorded with a checksum. If you edit a migration
  after it has run somewhere, the tool refuses instead of silently drifting.

---

## Running it

```bash
cp .env.example .env
./scripts/genkey.sh          # paste the output into SECRETS_MASTER_KEY
./scripts/dev.sh             # starts databases, migrates, runs the server
```

Server runs on **:8081**. (CAS uses :8080.)

```bash
./scripts/smoke.sh           # quick check that the endpoints answer
```

To work locally without CAS, set **`AUTH_DISABLED=true`**. Leaving
`CAS_BASE_URL` empty is not enough — the server refuses to start, on purpose.

That is a house rule, not an inconvenience. Running unauthenticated has to be
asked for, never inferred, because the earlier version inferred it from an
empty `CAS_BASE_URL` plus an `APP_ENV` that was not exactly `production`. A
deploy that said `prod`, or `staging`, or `Production`, started the server with
every route wide open and one line in the log to say so.

## Adding a school

A school is not seeded — you register it, then tell it where its database is.

```bash
# 1. add the school to the shared registry
curl -sX POST localhost:8081/api/v1/schools \
  -H 'content-type: application/json' \
  -d '{"name":"Delhi Public School Nagpur","code":"DPS-NGP",
       "timezone":"Asia/Kolkata","country":"IN"}'

# 2. give it its own database credentials (stored encrypted)
curl -sX PUT localhost:8081/api/v1/schools/<id>/profiles/postgres \
  -H 'content-type: application/json' \
  -d '{"host":"localhost","port":5434,"database":"emerge_tenant_demo",
       "user":"emerge","password":"emerge","sslmode":"disable"}'

# 3. create the tables in that database
go run ./cmd/migrate apply -plane tenant -school DPS-NGP

# 4. it works
curl -s localhost:8081/api/v1/students -H 'X-School-Id: DPS-NGP'
```

---

## The endpoints

Everything lives under `/api/v1`.

**No school header needed** (shared registry):

| Method | Path |
|---|---|
| GET | `/schools` |
| POST | `/schools` |
| GET | `/schools/{id}` |
| PATCH | `/schools/{id}` |
| DELETE | `/schools/{id}` |
| PUT | `/schools/{id}/profiles/{type}` |

**`X-School-Id` required.** Each of these has the usual five —
`GET /`, `POST /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`:

```
/persons          /students        /staff              /teachers        /guardians
/branches         /academic-sessions                   /sections        /subject-offerings
/grade-levels     /school-houses   /subjects           /subject-groups
/enrollments      /subject-enrollments                 /teacher-assignments
/student-assignments               /student-notes
/student-addresses                 /student-documents
```

Plus three that are not plain CRUD:

| Method | Path | What it does |
|---|---|---|
| POST | `/guardians/{id}/students` | links a guardian to a child, with the permission flags |
| POST | `/student-documents/{id}/verify` | records a verification, attributed to the caller |
| PUT | `/schools/{id}/profiles/{type}` | stores encrypted credentials (control plane) |

Useful filters: `?academic_session_id=`, `?section_id=`, `?student_id=`,
`?subject_offering_id=`, `?teacher_id=`, `?guardian_id=`, `?status=`, `?q=`,
`?limit=`, `?offset=`. Anything session-scoped defaults to the **current**
session unless you pass `?all_sessions=true`.

Health checks, no auth: `GET /health` (is the process alive) and
`GET /api/v1/health` (can it reach the database).

---

## Where do I put my new thing?

| I want to... | Go to |
|---|---|
| add a table or column | `internal/ent/schema/` then `go generate` then `migrate make` |
| add a filter like "students in a house" | `internal/data/student/query.go` |
| add a relationship shortcut like `sc.Exams()` | `internal/data/school/school.go` |
| add an API endpoint | handler in `internal/transport/http/`, route in `server.go` |
| add middleware | `internal/transport/http/middleware/` |
| add a permission | `internal/authorization/authorization.go` |
| change a setting | `internal/config/config.go` and `.env.example` |
| add a shared type used everywhere | `internal/domain/shared/` |

---

## House rules

- **The permissive reading must never be what you get by omission.** If a
  safety property depends on someone remembering to set a flag, pass an
  argument, or check a second return value, encode it in the types instead.
  This estate has been bitten four times by the same shape: an empty policy
  expression granting outright, an absent attribute satisfying a negation, a
  cached-policy reader verifying only a signature, and a scope helper whose
  "no filter needed" and "sees nothing" answers were the same value.
- Comments are one line. If something needs a paragraph, it belongs here, not in the code.
- Never edit anything under a `generated/` folder.
- Never hand-write a migration; generate it.
- Never load a relationship inside a loop.
- Handlers do not talk to the database directly; they go through `internal/data/`.
- Passwords and keys never get logged — the credential types hide themselves on purpose.
