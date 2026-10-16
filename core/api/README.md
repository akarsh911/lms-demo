# API collection

An end-to-end run of emerge-core, in order: register a school, give it a
database, build a year of academic structure, check who can see what, then
delete everything it created.

## Bruno

[Bruno](https://usebruno.com) is a file-based API client, so these requests
live in git and diff like code.

1. Open Bruno, **Open Collection**, pick this `api/` folder.
2. Select the **local** environment (top right).
3. Run the folders in order, `01` to `14`. Each request saves the ids the next
   one needs, so order matters.

Or run the whole thing headless:

```bash
npm install -g @usebruno/cli
cd api && bru run --env local
```

## curl

`../scripts/e2e.sh` does the same flow with curl and jq, asserts on the
results, and cleans up after itself even if it fails partway. That is the one
to use in CI.

```bash
./scripts/e2e.sh                          # against localhost:8081
./scripts/e2e.sh https://api.example.com  # against anything else
```

## Before you run either

```bash
docker compose up -d control-db tenant-db object-store-bucket
go run ./cmd/migrate apply -plane control
go run ./cmd/api
```

`object-store-bucket` is the one to name, not `object-store`: it starts the
store, waits for it, creates the bucket and exits. Bring the store up on its
own and you get a healthy container with an empty namespace, which fails later
and names the wrong thing -- the asset row is written, the presigned PUT is
minted, and the first complaint comes from the store itself.

The tenant database has no tables until a school exists to point at it, so the
first run goes: create the school, store its credentials, then

```bash
go run ./cmd/migrate apply -plane tenant
```

and only then will the tenant requests work. The collection says the same thing
in the docs of request `02/02`.

Folders `12` and `13` build a timetable and take a register against it, and
they are one unit: folder 12 leaves everything it makes in place because
folder 13 needs it, and folder 13's second half tears the whole lot down
again before folder 14 removes the section and the pupil underneath. Running
13 without 12 fails on the first request; running 12 without 13 leaves rows
behind that make the next run answer 409 on `12/01`.

Folder `10` needs one more: request `02/06` stores the school's S3 credentials,
and they point at the compose object store. Skip it and every asset request
answers 503 -- an asset is a promise about bytes, and with nowhere to put them
no row is written either. The bytes themselves are the one step Bruno cannot
take: the presigned PUT binds three headers into its signature, so the upload
has to be done with curl. `10/02` shows the command.

## Auth

With `CAS_BASE_URL` empty the API runs with a development subject and needs no
token, which is what these requests assume. With CAS configured, put an access
token in the `token` environment variable and every request will send it.

Note what this collection cannot check on its own: the row-level narrowing. It
runs as one unrestricted caller, so `03/08` asks "which students is this
guardian linked to" with an explicit filter rather than by logging in as the
guardian. Testing that a guardian's *token* sees only their children needs real
CAS tokens for a guardian, a class teacher and a subject teacher.
