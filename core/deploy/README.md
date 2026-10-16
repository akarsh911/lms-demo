# Deploying emerge-core

Records the deployment that put `https://core.tryemerge.in` on the shared VPS
`editone-prod` (200.141.15.77) on 2026-09-23, and the Jenkins pipeline that has
deployed it since 2026-10-15. The hand procedure further down is still correct
and is what the pipeline automates.

## The pipeline

`Jenkinsfile` at the repo root is one `emergeDeploy(...)` call against the shared
`emerge` library (see `D:\emerge-devops\library\README.md`). A push to `main`
runs three test stages in toolchain containers (build/vet/gofmt, the no-comments
check, and the database-backed `go test` with two Postgres 16 sidecars, the
seed/migrate sequence and the `TENANT-DB-TEST-SKIPPED` assertion, plus the same
suite under `-race`), then overlays the commit into `/opt/emerge/core/src`,
writes `src/DEPLOYED_COMMIT`, and runs `src/deploy/deploy.sh` on the box as
root with `DEPLOY_REF=<sha>`. Pull requests run the tests only.

`deploy/deploy.sh` does, in order: preflight (`.env` present and mode 600,
production config keys set, no `AUTH_DISABLED`, the compose file references
`emerge-core:${CORE_TAG:-current}` and loads `.env`, docker up, network
`emerge-db_default` up, port 8077 ours or free), tag the running container's
image `emerge-core:rollback`, `docker build --build-arg VERSION=<sha7>` tagged
`emerge-core:current` and `emerge-core:<sha7>`, then migrations as two
one-shot containers **before** anything is rolled:

```
docker run --rm --env-file /opt/emerge/core/.env --network emerge-db_default      --entrypoint /usr/local/bin/migrate emerge-core:current apply -plane control
docker run --rm --env-file /opt/emerge/core/.env --network emerge-db_default      --entrypoint /usr/local/bin/migrate emerge-core:current apply -plane tenant
```

Only then `CORE_TAG=current docker compose -f /opt/emerge/core/docker-compose.yml up -d`,
a poll of `http://127.0.0.1:8077/health` for 200 within 120 s, an assertion that
the reported `version` equals the deployed sha, and the 401 check on
`/api/v1/students`. A failure anywhere leaves the previous container running and
prints the rollback line:

```
docker tag emerge-core:rollback emerge-core:current && CORE_TAG=current docker compose -f /opt/emerge/core/docker-compose.yml --project-directory /opt/emerge/core up -d
```

`-plane tenant` migrates every registered school's database in one pass. With no
schools registered it prints `tenant   no schools registered` and exits 0.

### Switching the box to the pipeline (one-time, by hand)

The live compose file hardcodes the image tag of whichever build was last
shipped by hand (`image: emerge-core:892fc94` as of 2026-10-15). The script
refuses to run against that, because it has to move the tag on every deploy.
Two edits on the box, once, and both are reversible:

1. In `/opt/emerge/core/docker-compose.yml` change the `image:` line to
   `image: emerge-core:${CORE_TAG:-current}`. Nothing else in the file changes;
   `env_file: .env`, the two port bindings and the external `emerge-db_default`
   network stay as they are.
2. Give the running image the tag the compose file now expects, so the stack is
   unchanged until the first pipeline run:
   `docker tag emerge-core:892fc94 emerge-core:current`.

`docker compose -f /opt/emerge/core/docker-compose.yml config | grep image:`
must then print `emerge-core:current`, and `docker compose up -d` from that
directory must report the container as up-to-date rather than recreating it.

The first pipeline run tags `emerge-core:892fc94` as `emerge-core:rollback`
itself; nothing further is needed. `deploy.sh` is also runnable by hand from
the box: `DEPLOY_REF=<sha> /opt/emerge/core/src/deploy/deploy.sh` after the
source has been placed in `/opt/emerge/core/src`.

## The shared-host rule

That box runs roughly twenty unrelated containers: CAS, Exam Studio, CleverClass,
emerge-forms, Guacamole and others. **Do not touch what you did not create.**
Two specific traps were hit while doing this and are recorded here so the next
person does not hit them again.

### certbot will try to hijack another service's certificate

`certbot --nginx -d core.tryemerge.in` refuses and offers `--expand` against the
`aira-studio-ip` lineage, which belongs to a different service. Expanding it
would replace that certificate. Always pass an explicit lineage:

```
certbot --nginx -d core.tryemerge.in --cert-name core.tryemerge.in \
        --non-interactive --agree-tos --redirect --keep-until-expiring
```

Afterwards, `certbot certificates` must still show `aira-studio-ip` with its
original domain list.

### the database is shared

`emerge-db` (container, network `emerge-db_default`) also holds `cas-demo` and
`emerge-test`. emerge-core gets its own role rather than reusing the superuser:

```
CREATE ROLE emerge_core LOGIN CREATEDB PASSWORD '...';
CREATE DATABASE emerge_control OWNER emerge_core;
```

`CREATEDB` is not optional — emerge-core creates one database per school.

## Layout on the box

```
/opt/emerge/core/
  docker-compose.yml
  .env              0600 root  the only file with secrets
  .dbpass           0600 root  the emerge_core role password
  .masterkey        0600 root  SECRETS_MASTER_KEY, versioned "1:<64 hex>"
  setup-db.sh       0700 root  idempotent role + control database creation
```

**`.masterkey` is not recoverable.** It encrypts every school's database
credentials and S3 keys at rest. Losing it does not lock you out of the control
plane; it loses access to every tenant's encrypted profile. Back it up.

## Config that must be right

`emerge-core` reaches the retrieval engine as `http://retrieval:8000` on the
external `retrieval` network. Don't use the Docker bridge (`172.17.0.1:8061`):
INFRA-4 removes that listener. The compose file defaults
`RETRIEVAL_ENGINE_BASE_URL` to the network address, so an empty or absent value
in `.env` means the network. `deploy.sh` reads the database network from the
first `name:` under `networks:`, so keep `emerge-db_default` listed first.

`APP_ENV=production` makes four settings mandatory (`internal/config/config.go`):
`CONTROL_DATABASE_URL`, `SECRETS_MASTER_KEY`, `CAS_CLIENT_ID` and
`CAS_CLIENT_SECRET` — and it refuses to boot if `AUTH_DISABLED` is set at all.
That last one is the point: the production guard is a boot failure, not a
warning, so a deployment cannot silently come up unauthenticated.

`CAS_CLIENT_ID` / `CAS_CLIENT_SECRET` are emerge-core's own service credentials
for `POST /v1/policies`. Without them `NewPolicyClient` returns an error and no
authorization decision can be fetched, so every request fails closed.

## Procedure (by hand)

```bash
SHA=$(git rev-parse --short HEAD)
docker build --build-arg VERSION=$SHA -t emerge-core:$SHA .
docker save emerge-core:<sha> | gzip -1 | ssh editone-prod 'gunzip | sudo docker load'

ssh editone-prod
sudo /opt/emerge/core/setup-db.sh                      # idempotent

sudo docker run --rm --env-file /opt/emerge/core/.env \
     --network emerge-db_default \
     --entrypoint /usr/local/bin/migrate \
     emerge-core:<sha> apply -plane control

cd /opt/emerge/core && sudo docker compose up -d
```

`--build-arg VERSION` is not cosmetic: without it the binary reports
`version: dev` at `/health`, and the verification below cannot tell which build
is actually serving. Every deploy before 2026-09-24 omitted it.

Migrations run as a one-shot container before the API starts, deliberately: the
API does not migrate on boot, so a bad migration fails visibly instead of
crash-looping a running service.

## Verifying a deploy

```
curl https://core.tryemerge.in/health                      -> 200, reports the commit sha
curl -o /dev/null -w '%{http_code}' http://core.tryemerge.in/health   -> 301 to https
curl -H 'X-School-Id: X' https://core.tryemerge.in/api/v1/students    -> 401
```

The 401 is the one that matters. A 200 there means the build came up without
authentication and must be taken down.

`/health` is the only liveness path; there is no `/ready` or `/readyz`.

## Known state after the first deploy

The control plane has **no schools registered**, so every tenant-plane route
answers on an empty registry. The service is up and authenticated but serves no
data until a school is created and its tenant database migrated
(`migrate apply -plane tenant`).

The timetable, attendance, rooms and calendar capability keys are **not
registered in production CAS**. Until they are, those routes are reachable and
will deny every caller, because a capability nobody can hold is a capability
nobody is granted. See `docs/CAS-KEYS-TO-REGISTER.md` and
`scripts/cas-register-entities.py`.

## The object store, and why its nginx location looks odd

Browser uploads are a presigned `PUT` straight from the page to MinIO, so MinIO must be reachable
from the browser over **https** — the page is https, and a http upload URL is blocked as mixed
content before a request is even made. MinIO itself listens on `127.0.0.1:9000` and the docker
bridge only, so `core.tryemerge.in` proxies it.

The location is matched on the **bucket name**, and it must not rewrite the path:

```
location ~ ^/emerge-[a-z0-9-]+/ {
    proxy_pass http://127.0.0.1:9000;      # NO trailing slash: the path is passed through intact
    proxy_set_header Host $host;
    client_max_body_size 0;
    proxy_request_buffering off;
}
```

The obvious shape — publishing it under `/objects/` and stripping that prefix — **cannot work**, and
it fails in a way that looks like a credentials problem. SigV4 signs the path. emerge-core signs
`/objects/emerge-dps-ngp/library/<id>`; nginx strips `/objects` and MinIO recomputes the signature
over `/emerge-dps-ngp/library/<id>`; the two disagree and MinIO answers `SignatureDoesNotMatch`.
MinIO has no base-path setting, so the only options are a path the proxy passes through byte for
byte, or a dedicated hostname. The bucket-name regex is the former and needs no new DNS record.
`Host` must be forwarded unchanged for the same reason — the host is signed too.

The school's S3 profile therefore names the bare host, path-style:

```
PUT /api/v1/schools/{id}/profiles/s3
{"endpoint":"https://core.tryemerge.in","region":"us-east-1","bucket":"emerge-dps-ngp",
 "access_key_id":"...","secret_access_key":"...","use_path_style":true}
```

`use_path_style` is not optional: virtual-host style would put the bucket in the hostname
(`emerge-dps-ngp.core.tryemerge.in`), which has no DNS record and no certificate.

`client_max_body_size 0` lifts the 32m cap for this location only — a textbook is bigger than that —
and `proxy_request_buffering off` streams the body through rather than spooling it to disk first.

## The timetable solver

A second, much smaller container: `deploy/Dockerfile.timetable-solver` and
`deploy/docker-compose.timetable-solver.yml`. It is **not deployed by the
procedure above** and emerge-core runs perfectly well without it —
`POST /api/v1/timetables/{id}/generate` answers 503 and a week is arranged by
hand, which is the honest failure for an optional capability.

Three things about it are deliberate and should survive any change here.

**It has no database and no volume.** Everything it answers with arrives in the
request body. That is why it needs no `.env` beyond its own token, why it can be
restarted or scaled to zero without consequence, and why the database-per-tenant
isolation stays entirely on the emerge-core side: the solver never holds a
connection string and never learns that a tenant exists. The first line of
config here that names a database is a bug.

**It is never routed from the internet.** It joins `emerge-db_default` so that
the `emerge-core` container can reach it as `http://timetable-solver:8099`, and
publishes its port on `127.0.0.1` only, for `curl` on the box. There is no nginx
server block for it and there should not be one. It authenticates
`Authorization: Bearer` against `TIMETABLE_SOLVER_TOKEN` and refuses to start
without it, but that token is a second lock, not the first.

**A solve is CPU-bound and bursty**, 15 to 90 seconds across its workers, which
is the whole reason it is a separate container rather than a subprocess inside
the API. Give it a CPU limit (`TIMETABLE_SOLVER_CPUS`, default 4) so a
generation cannot starve request handling beside it, and leave
`TIMETABLE_SOLVER_CONCURRENCY` at 2 or below unless the box has cores to spare:
two concurrent solves on four cores are much worse than twice as slow, because
each one's workers are now fighting the other's.

```bash
docker build -f deploy/Dockerfile.timetable-solver \
             -t emerge-timetable-solver:$(git rev-parse --short HEAD) .
docker save emerge-timetable-solver:<sha> | gzip -1 | \
    ssh editone-prod 'gunzip | sudo docker load'

ssh editone-prod
# TIMETABLE_SOLVER_TOKEN=$(openssl rand -hex 32) into /opt/emerge/core/.env,
# and the same value into emerge-core's own TIMETABLE_SOLVER_TOKEN.
sudo docker compose -f /opt/emerge/core/docker-compose.timetable-solver.yml up -d
sudo docker exec timetable-solver python -c \
  "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8099/healthz').read())"
```

Then set on emerge-core and restart it:

```
TIMETABLE_SOLVER_ENABLED=true
TIMETABLE_SOLVER_BASE_URL=http://timetable-solver:8099
TIMETABLE_SOLVER_TOKEN=<the same token>
```

`TIMETABLE_SOLVER_ENABLED=true` without both of the other two is a **boot
failure**, not a warning: a service that knows it cannot reach the solver should
say so at startup rather than at the first press of auto-fill.

`core.timetable.generate` must also be registered in CAS before anyone can
press it; see `docs/CAS-KEYS-TO-REGISTER.md`.
