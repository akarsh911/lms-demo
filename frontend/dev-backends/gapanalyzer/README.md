# gapanalyzer dev backend

A bare-minimum real backend for the Gap Analyzer: FastAPI + SQLite on port 8510. It serves the four routes `src/services/gap-analyzer.ts` calls (`scope`, `learners/{id}`, `sections/{id}/subjects/{code}`, `grades/{n}/subjects/{code}`) with the shapes in `src/types/gap-analyzer.ts`. The engine in `engine.py` and `normalise.py` is a port of `src/lib/gap-analyzer/`.

```sh
pip install -r requirements.txt
python -m uvicorn app:create_app --factory --port 8510
python -m pytest -q
```

Every request needs `x-school-id`. Evidence events are stored per school in `gapanalyzer.db`; a school is seeded with the fixture evidence on its first request. `POST /evidence` appends or replaces events, either already-normalised `events` (`GapEvidence`) or raw `records` (`exam_mark`, `answer_sheet`, `omr`, `practice`, `mastery`, `flashcards`, `debate`, each wrapped as `{grade, subject_code, record}`) that the backend normalises itself.

Each request answers as the fixture persona in its `x-dev-user` header (`admin`, `teacher`, `student`, `parent`, `dev`), which the dev proxy sends under the bypass. Without the header it falls back to `GAPANALYZER_USER`, and then to `teacher`.

`seed/seed.json` and `tests/golden.json` are generated from the TS fixtures and engine, never edited by hand. Regenerate both after a fixture or engine change, from this folder:

```sh
cd seed && node --experimental-transform-types --no-warnings --import ./register.mjs export_seed.mjs
```

Delete `gapanalyzer.db` to start over. `GAPANALYZER_DB` and `GAPANALYZER_SEED` override the two paths.
