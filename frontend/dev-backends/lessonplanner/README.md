# lessonplanner dev backend

A bare-minimum real backend for the Lesson Planner: FastAPI + SQLite on port 8500, implementing the contract in `src/types/lesson-planner.ts`. Every request needs an `x-school-id` header; plans and term-plan settings are stored per school in `lessonplanner.db`.

```sh
pip install -r requirements.txt
python -m uvicorn app:create_app --factory --port 8500
python -m pytest -q
```

Run the frontend against it with `DEV_BYPASS=1 DEV_LIVE_SERVICES=lessonplanner` (the proxy sends `x-school-id` from `DEV_SCHOOL_ID`, default `S_42`).

`seed/seed.json` and `tests/golden.json` are generated from the TS fixtures, never edited by hand. Regenerate both after a fixture change, from this folder:

```sh
cd seed && node --experimental-transform-types --no-warnings --import ./register.mjs export_seed.mjs
```

Each request answers as the fixture persona in its `x-dev-user` header (`admin`, `teacher`, `student`, `parent`, `dev`), falling back to `LESSONPLANNER_USER` and then `teacher`. As in the fixture, a teacher sees only the plans they wrote, other staff see every plan, and pupils and parents see none; `mine` on each offering follows the persona too.

Each school is seeded with the fixture's two teacher plans on its first request. Delete `lessonplanner.db` to start over. `LESSONPLANNER_DB` and `LESSONPLANNER_SEED` override the two paths.
