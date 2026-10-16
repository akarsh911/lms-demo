# Landing the mind map in production

Everything needed to make the mind map **work** for a real pupil, in order, with
what is already done and what is not. Written 2026-10-02 from the state of the
boxes and the repos on that date.

Hand this to one agent. It is six pieces, and the last takes hours of machine
time, so do not start at the top and hope.

## The one fact that decides the order

**No production book has a concept graph.** DPS-NGP holds 21 real NCERT
textbooks and one indexed document; 22 content items are `index_status='held'`
with `engine_document_id` NULL, `updated_at` within a minute of `created_at`,
and no metadata. Measured, not inferred: nothing has ever written back to those
rows, so **the GPU build has never run on any of them**.

So with every step below done perfectly, every book still reads "waiting for its
GPU build" and no map can be drawn. **Step 6 is the one that makes the feature
exist**, and it depends on step 2. Everything between is plumbing that cannot be
demonstrated until then.

## What is already live

- `emerge-core` at `892fc94`: the curriculum shape rule enforced in the database
  (`curriculum_nodes_unit_is_root`, `curriculum_nodes_topic_has_parent`),
  `content_nodes` writable for the first time, migration `20261001205404`
  applied. 354 curriculum nodes across 15 curricula, zero shape violations.
- `papersetter` at `05494e6`, serving `/api/v1`.
- The frontend's paper-setter wizard.
- `emerge.learning.mindmap` is already in `CAS_REGISTERED_KEYS`, and the
  mind-map page pre-exists this work. It fails in real mode today.

## Step 1 — commit what exists

All of it is written and verified and **none of it is committed**. It lives in
worktrees and in one shared working tree.

| what | where |
|---|---|
| mind-map frontend, rewired to emerge-core | uncommitted in `D:\emerge-frontend` |
| `concept_mastery` table, mastery routes, `GET /curriculum-nodes/{id}/mindmaps` | an emerge-core worktree |
| held-to-indexed reconciliation | an emerge-core worktree |
| engine patch | a `lms-retrieval-engine` worktree |

Two migrations, both additive:
`20261001212745_add_content_item_held_engine_document_id` (one nullable column)
and `20261002021627_add_concept_mastery` (one table, three indexes). The
worktree's `atlas.sum` already covers them plus `20261001205404`.

Verification as reported: emerge-core worktree 3,245 tests, 0 failed, 0 skipped;
frontend typecheck, lint, route check and build clean; mind-map service 101
passed; and a round-two run against a real engine, the real mind-map service and
a live emerge-core on throwaway databases, with the frontend's exact requests
replayed. **Eight defects were found in round one and fixed.**

**The limit on all of it: the live run used `AUTH_DISABLED=true`.** Shapes,
status codes and stored rows are proven. Permissions, restricted-viewer row
predicates, bearer forwarding to the engine and a real CAS login are **not**.

## Step 2 — the held-to-indexed reconciliation, before any GPU build

Do this early and separately. A `held` content item has its
`engine_document_id` **cleared** by `indexer.go`, and `sweeper.go` re-drives only
`failed`, `pending` and `none` — never `held`. So a GPU-built book never becomes
`indexed`, and the id is lost.

The reconciliation recovers ids from the engine's held-uploads list by checksum,
which works only while the engine is **still holding** the upload. A book
published before this ships cannot be recovered that way, because the engine's
document list carries no checksum, and the only remedy is a republish.

**Today there are zero such rows** — none of the 22 has been built. That is why
this goes before step 6: every GPU build run before this lands creates a row
that needs a re-upload.

## Step 3 — deploy `lms-mind-map`, which has never run anywhere

`Harbour-Emerge/lms-mind-map`, at `D:\lms-mind-map`. It has a Dockerfile
(`python:3.11-slim`, `uvicorn mindmap_engine.api:app` on 8200, a `/health`
healthcheck) and **no compose file, no CI, no deploy bundle**. It has never run
on any box.

The network constraint, measured on the box:

```
retrieval      retrieval
emerge-core    emerge-db_default
papersetter    cas_cas  emerge-db_default  emerge-labs_default  papersetter_default  retrieval
emerge-labs    emerge-labs_default
```

**emerge-core and the retrieval engine share no network.** `papersetter` is the
only container bridging them, which is why its scoped retrieval client works.

So the mind-map service must join **both** `emerge-db_default` (so emerge-core
reaches it) and `retrieval` (so it reaches the engine), as **external**
networks. That is the papersetter pattern, and it means emerge-core's own
compose needs no network change — only env.

- `MM_RETRIEVAL_BASE_URL=http://retrieval:8000` — service name, **container**
  port, not the 806x host port.
- **No published port.** The service has no authentication of its own; network
  isolation is the whole control.
- `MM_ADMIN_TOKEN` unset.
- On emerge-core: `MINDMAP_ENABLED=true` and
  `MINDMAP_ENGINE_BASE_URL=http://<service>:8200`.

**Write down what "isolated" means here**: reachable by emerge-core, papersetter
and the engine — three services, not one. The next person to add a container to
`emerge-db_default` inherits that reach without being told.

## Step 4 — the token audience, which does NOT work today

**This is no longer "set three env vars". It is a design decision, and it blocks
the chain.** Verified 2026-10-02, not assumed:

**A real user's CAS token cannot satisfy the engine and emerge-core at once.**

- CAS mints a **single-valued** `aud`: `jwt.ClaimStrings{aud}`
  (`D:\CAS\internal\service	oken.go:247`). There is no code path to a
  multi-audience token.
- A user token carries `aud: "mentis"` — the deployment default
  (`internal/config/constants.go:188`), and the only audience `SeedAudiences`
  registers (`internal/platform/bootstrap.go:290-297`).
- The engine requires exact membership of one configured string
  (`retrieval_engine/jwt_verify.py:414-420`), and production is set to
  `RE_JWT_AUDIENCE=retrieval-engine`.
- emerge-core pins `mentis`.

So the two requirements are **mutually exclusive** for one forwarded token. And
`retrieval-engine` **is not registered in CAS at all** — a repo-wide grep finds
it only in `lms-retrieval-engine/docs/SETUP-CAS-LOGIN.md:118-124`, as a manual
runbook step nobody has performed. No client is pre-registered either
(`SETUP-CAS-LOGIN.md:69-72`).

**Production state today:** `RE_JWT_REQUIRED=false`, so the engine neither
verifies nor refuses a token — it **ignores** it (`api.py:708-709`, `:726-727`)
and takes tenancy from the **unsigned `X-School-Id` header**
(`api.py:835-843`). That is the documented pre-cutover state, not a regression,
but it means the engine currently has no authentication at all.

One reassurance: an empty `RE_JWT_AUDIENCE` does **not** mean "accept any
audience". `configured` requires all three settings and `_require_configured`
raises otherwise (`jwt_verify.py:368-379`). So the audience check fails closed.

**Pick one before deploying anything that depends on it:**

| option | cost |
|---|---|
| point the engine at `mentis` (`RE_JWT_AUDIENCE=mentis`) | one env change; but any estate token then reaches the engine, so audience stops being a boundary and network isolation plus `X-School-Id` carry it alone |
| register `retrieval-engine` in CAS and mint per-audience tokens | needs a second token per request, or a token exchange; CAS cannot put both in one `aud` |
| exchange the token server-side, in emerge-core or the mind-map service | a new trust boundary, and the mind-map service has no authentication of its own |
| keep `RE_JWT_REQUIRED=false` | works today, and the engine stays unauthenticated behind an unsigned header |

**My reading:** `mentis` is what the estate's user tokens actually carry, and the
engine is already network-isolated and school-scoped, so pointing it at `mentis`
is the honest one-line fix — provided someone writes down that audience is no
longer the boundary there. The others are real work, and the last is the status
quo.

The rest of this step stands:

- `RE_SCOPES_BASE_URL` is set in production (`http://172.17.0.1:8077`).
- **The engine patch is uncommitted and unreviewed by the session that owns that
  repo, and it changes seven more routes than the two it set out to fix.** It
  needs that session's review, not a merge by whoever is deploying.

## Step 5 — CAS, including the part no script does

Four entity keys, service `core`:

| key | gates |
|---|---|
| `core.mindmaps.read` | every mind-map route |
| `core.concept_mastery.read` | a pupil's own, a ward's, a taught pupil's |
| `core.concept_mastery.read_all` | school-wide breadth |
| `core.concept_mastery.write` | recording read marks and graded results |

They are listed in `docs/CAS-KEYS-TO-REGISTER.md` in a worktree, so
`cas-register-entities.py` picks them up **once committed**. Fields then need
`catalogdump` plus `cas-sync-entity-fields.py`.

**Not done, and no script does it:** the rules and role bundles.
`cas-core-roles.py` is untouched, and the bundles must **also** carry
`core.library.read`, `core.curriculum.read` and `core.content_placements.read`,
which nothing grants today. Plus a grant of the feature key
`emerge.learning.mindmap`.

Registration is a production CAS change. Run every script dry first. CAS refuses
fields declared on a folder entity rather than an action entity, which has
caught two people already.

## Step 6 — run a GPU build, and only now does anything work

Pick one book and build it. `10_English_FirstFlight` or `jemh1ps_merged` are the
obvious candidates. Until a book has a concept graph there is nothing to draw,
and until step 2 is live the build loses the document id it earns.

## What is still unproven after all six

- **Nobody has logged in as a real pupil through this chain.** Every
  verification used `AUTH_DISABLED`.
- Bearer forwarding to the engine, restricted-viewer row predicates and the
  token audience are all untested against a real CAS login.

So the definition of done is not "six steps applied". It is **one real pupil,
signed in, opening one book's mind map** — and that is the test to run before
telling anyone it works.

## Two cautions for whoever deploys the frontend

- The box builds the frontend **from the synced tree**, not from a tagged image:
  `/opt/emerge/emerge-labs`, `deploy/docker-compose.yml` has a `build:` section,
  service `emerge-labs`, health on 8076, `labs.tryemerge.in`. So **anything
  committed to `emerge-frontend` ships on the next deploy**, including work in
  progress.
- That file used to pin `image: emerge-frontend:<sha>`, and the pin was lost when
  the tree was synced over it on 2026-10-02. Restoring it is worth deciding
  before the next deploy rather than after.

## A method worth reusing, because it found eight defects and then six more

Both the mind-map UI and the paper-setter wizard were wrong against their real
services in ways their own tests could not see. The mind-map round one found
four; applying the same method to paper-setter found **two of three paper-kind
radio buttons sending values the service answers 400 to**, a refusal field read
with the wrong vocabulary, a prose hint rendered as a copyable id, and four
mock-invented values including a preset id that does not exist.

The method: **run the real upstream, capture real bodies, then diff them field by
field against what the UI READS and against what the mocks serve.** Every defect
was a field the mock had and reality did not, or a value the mock invented.

Where a service has typed responses, derive the contract from it rather than
transcribing: `scratchpad/ps-derive-contract.py` imports the app, reads
`app.openapi()`, pulls the real enums and constants, and AST-walks every
`APIError(...)` for the real refusal codes. Where a service takes `dict` bodies
and returns plain dicts — as `lms-mind-map` does — its OpenAPI says nothing, and
capturing real responses is the substitute.
