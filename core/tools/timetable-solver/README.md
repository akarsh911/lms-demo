# timetable-solver

A CP-SAT timetable generator for Emerge, and the internal HTTP service that wraps it. emerge-core
calls it from `POST /api/v1/timetables/{id}/generate`; the design, the model, the placement
argument and the HTTP contract are in `docs/DESIGN-NOTES.md` under *Automatic timetable
generation*.

Python, because Go cannot do CP-SAT. `ortools==9.15.6755`, matching
`D:\lms-paper-orchestrator`, which is the precedent this follows.

## Layout

    export.sql            one query, one JSON document: the shape of a school
    export.sh             runs it through the tenant container and pretty-prints
    run.py                solve, print the week, audit it independently
    server.py             the three-endpoint HTTP service, standard library only
    timetable_solver/
      dto.py              frozen records, units documented on every number
      school.py           export JSON -> DTOs, plus the minute arithmetic
      preflight.py        arithmetic impossibilities, no solver
      verify.py           an independent audit of a week, no solver, no model
      wire.py             request and response shapes; validation; no solver
      render.py           printing
      solver.py           CP-SAT.  THE ONLY MODULE THAT IMPORTS ORTOOLS.
    tests/                pytest; only tests/test_model.py and half of
                          tests/test_service.py need a solver

The purity rule is not tidiness. Auditing a published week, checking that a tenant's demand is
arithmetically possible, and exporting a school all have to work where no solver is installed.
`tests/test_purity.py` enforces it, transitively - a relative import from a pure module into
`solver` fails the suite, which is how it was caught the one time it happened.

## Running it as a service

    TIMETABLE_SOLVER_TOKEN=... python server.py

    POST /v1/feasibility   200 always - preflight only, no solver, milliseconds
    POST /v1/solve         200 a week - 422 no week - 400 malformed
    GET  /healthz          200 {"status": "ok", "ortools": "9.15.6755"}

`/healthz` needs no token, because a container probe holds none and the only thing it discloses
is the solver version. Everything under `/v1` needs `Authorization: Bearer <token>`, and the
service **refuses to start** without `TIMETABLE_SOLVER_TOKEN`.

| variable | default | what it is |
|---|---|---|
| `TIMETABLE_SOLVER_TOKEN` | *none, required* | the bearer token every `/v1` call must carry |
| `TIMETABLE_SOLVER_BIND` | `127.0.0.1` | the container image overrides this to `0.0.0.0` |
| `TIMETABLE_SOLVER_PORT` | `8099` | |
| `TIMETABLE_SOLVER_CONCURRENCY` | `2` | solves at once; the rest get 503 and a `Retry-After` |
| `TIMETABLE_SOLVER_MAX_BODY` | 8 MiB | the seeded school exports at about 120 KB |
| `TIMETABLE_SOLVER_LOG_LEVEL` | `INFO` | |

It holds **no database**, no cache and no state between requests: everything it answers with
arrived in the body it is answering, which is the whole of the placement argument. The deploy
bundle is `deploy/Dockerfile.timetable-solver` and
`deploy/docker-compose.timetable-solver.yml`.

`max_seconds` is a caller input clamped to a 120-second service ceiling, and diagnosis of an
infeasible school gets one budget of its own rather than one per candidate solve - see the
module docstring in `server.py` for why that distinction is load-bearing.

## Running it by hand

    ./export.sh                                  # writes school.json from emerge-core-tenant-db-1
    python run.py school.json --hint-current

    python -m pytest tests -q                    # 58 tests, ~10 s

`export.sh` takes an optional branch id and output path; the container, database and user come
from `TT_CONTAINER`, `TT_DB` and `TT_USER`.

`--hint-current` seeds the search with the published week. CP-SAT is stateless between solves, so
hinting the last answer is the only way a re-solve benefits from it, and a school that has
published a week wants the next version to look like it.

## Useful flags

    --set CODE=N                   demand for every offering of a subject
    --minutes CODE=N               a weekly minutes obligation to report against
    --pin "CODE[@SECTION]:DAY=N"   N periods of a subject on an ISO weekday
    --room-type CODE=TYPE          require a room type, e.g. SCI=laboratory
    --unavailable "NAME=1,2,3"     block a teacher on those ISO days
    --minutes-basis nominal|realised
    --seconds N --workers N --json-out FILE

`--demand-from-current` takes `periods_per_week` from the published week. It was needed when the
column was NULL on all 42 offerings; the seeder now fills it, so this is a fallback and is named
for what it is.

## Four worked infeasibility cases

Each prints the sentence rather than a bare UNSAT.

    # arithmetic, caught with no solver at all
    python run.py school.json --set MATH=10
    python run.py school.json --set MATH=8
      -> Vihaan Reddy is required for 36 periods a week and has 34 available.

    # a day-level requirement the day cannot hold
    python run.py school.json --pin "SST@2026-2027-G6-A:2=5" --pin "SST@2026-2027-G7-A:2=5"
      -> Myra Rao is required for 10 periods on Tuesday and there are 6.

    # beyond arithmetic: preflight is clean, CP-SAT proves it, the core explains it
    python run.py school.json --room-type SCI=laboratory --room-type FRE=laboratory \
                              --pin SCI:6=1 --pin FRE:6=1
      -> Language Laboratory cannot hold two classes at once; Science Laboratory
         cannot hold two classes at once; ... nine lessons into eight laboratory cells.

## What "verified" means here

`run.py` always finishes by re-reading `school.json` and checking the week with `verify.py`, which
never sees the model and does not know cohorts exist. It applies the three rules of
`internal/service/timetable/clash.go` pairwise from raw `student_subject_enrollments` rows. The
solver's own claim that its constraints hold is not evidence of anything.
