#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"

say()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m  OK\033[0m   %s\n' "$*"; }
warn() { printf '\033[33m!!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31mFATAL\033[0m %s\n' "$*" >&2; exit 1; }

ROOT="${CORE_ROOT:-/opt/emerge/core}"
SRC="$ROOT/src"
ENV_FILE="$ROOT/.env"
COMPOSE_FILE="$ROOT/docker-compose.yml"
IMAGE="emerge-core"
CONTAINER="emerge-core"
PORT="${CORE_HOST_PORT:-8077}"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
HEALTH_DEADLINE="${CORE_HEALTH_DEADLINE:-120}"

compose() { CORE_TAG=current docker compose -f "$COMPOSE_FILE" --project-directory "$ROOT" "$@"; }
ROLLBACK_CMD="docker tag ${IMAGE}:rollback ${IMAGE}:current && CORE_TAG=current docker compose -f ${COMPOSE_FILE} --project-directory ${ROOT} up -d"

trap 'warn "deploy failed at line $LINENO."; warn "Roll back with:  $ROLLBACK_CMD"' ERR

say "preflight"
[[ "$(id -u)" == 0 ]] || die "run as root; the compose files and $ENV_FILE are root-only."
[[ -d "$SRC" && -f "$SRC/Dockerfile" && -f "$SRC/go.mod" ]] || die "$SRC must hold the emerge-core checkout (overlay); nothing to build."
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE is missing; run $ROOT/make-env.sh first."
env_mode="$(stat -c '%a' "$ENV_FILE")"
[[ "$env_mode" == "600" ]] || die "$ENV_FILE is mode $env_mode; it holds secrets and must be 600."
grep -qE '^APP_ENV=production$' "$ENV_FILE" || die "APP_ENV is not production in $ENV_FILE."
grep -qE '^AUTH_DISABLED=' "$ENV_FILE" && die "AUTH_DISABLED is set in $ENV_FILE; the API refuses to boot with it under production, and it must never reach the box."
for key in CONTROL_DATABASE_URL SECRETS_MASTER_KEY CAS_CLIENT_ID CAS_CLIENT_SECRET; do
  grep -qE "^${key}=.+" "$ENV_FILE" || die "$key is not set in $ENV_FILE."
done
[[ -f "$COMPOSE_FILE" ]] || die "$COMPOSE_FILE is missing."
if ! grep -qE "^\s*image:\s*${IMAGE}:\\$\{CORE_TAG:-current\}\s*$" "$COMPOSE_FILE"; then
  current_image_line="$(grep -E '^\s*image:' "$COMPOSE_FILE" | head -1 | sed 's/^\s*//')"
  die "$COMPOSE_FILE must reference 'image: ${IMAGE}:\${CORE_TAG:-current}' (found '${current_image_line}'). See deploy/README.md, 'Switching the box to the pipeline'."
fi
grep -qE 'env_file:\s*\.env' "$COMPOSE_FILE" || die "$COMPOSE_FILE no longer loads .env through env_file; the container would boot without its configuration."
docker info >/dev/null 2>&1 || die "docker is not reachable."
docker compose version >/dev/null 2>&1 || die "docker compose v2 is not installed."
NETWORK="$(sed -n 's/^\s*name:\s*\(\S\+\)\s*$/\1/p' "$COMPOSE_FILE" | head -1)"
NETWORK="${NETWORK:-emerge-db_default}"
docker network inspect "$NETWORK" >/dev/null 2>&1 || die "network $NETWORK is missing; the shared database stack is not up."
if ss -tln 2>/dev/null | grep -qE "(127\.0\.0\.1|172\.17\.0\.1|0\.0\.0\.0|\*|\[::\]):${PORT}\s"; then
  docker ps --filter "name=^${CONTAINER}$" --format '{{.Names}}' | grep -q . \
    || die "port ${PORT} is bound and ${CONTAINER} is not running. Do not take another tenant's port."
fi
ok "port ${PORT} is ours or free"
compose config -q || die "$COMPOSE_FILE does not parse."
ok "compose file parses, network $NETWORK is up"

if [[ -n "${DEPLOY_REF:-}" ]]; then
  COMMIT="${DEPLOY_REF:0:7}"
elif [[ -s "$SRC/DEPLOYED_COMMIT" ]]; then
  COMMIT="$(tr -d '[:space:]' < "$SRC/DEPLOYED_COMMIT")"
  COMMIT="${COMMIT:0:7}"
else
  die "neither DEPLOY_REF nor $SRC/DEPLOYED_COMMIT names the commit being deployed."
fi
[[ "$COMMIT" =~ ^[0-9a-f]{7}$ ]] || die "commit '$COMMIT' is not a 7-character sha."
say "deploying ${IMAGE}:${COMMIT} (target ${DEPLOY_TARGET:-production})"

PREV="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)"
if [[ -n "$PREV" ]]; then
  docker tag "$PREV" "${IMAGE}:rollback"
  ok "tagged the running image ($PREV) as ${IMAGE}:rollback"
else
  warn "no running ${CONTAINER}; nothing tagged as ${IMAGE}:rollback"
fi

say "building"
docker build --build-arg "VERSION=${COMMIT}" -t "${IMAGE}:current" -t "${IMAGE}:${COMMIT}" "$SRC"
ok "built ${IMAGE}:${COMMIT}"

say "migrating the control plane"
docker run --rm --env-file "$ENV_FILE" --network "$NETWORK" \
  --entrypoint /usr/local/bin/migrate "${IMAGE}:current" apply -plane control \
  || die "control-plane migrations failed. Nothing was rolled; ${CONTAINER} is untouched."
say "migrating every tenant"
docker run --rm --env-file "$ENV_FILE" --network "$NETWORK" \
  --entrypoint /usr/local/bin/migrate "${IMAGE}:current" apply -plane tenant \
  || die "tenant migrations failed. Nothing was rolled; ${CONTAINER} is untouched."
ok "migrations applied"

say "rolling"
compose up -d --remove-orphans

say "waiting for health"
deadline=$((SECONDS + HEALTH_DEADLINE))
until curl -fsS -o /dev/null "$HEALTH_URL" 2>/dev/null; do
  if (( SECONDS > deadline )); then
    docker logs "$CONTAINER" --tail=60 || true
    die "no 200 from ${HEALTH_URL} within ${HEALTH_DEADLINE}s. Roll back with: $ROLLBACK_CMD"
  fi
  sleep 3
done
HEALTH="$(curl -fsS "$HEALTH_URL")"
printf '%s' "$HEALTH" | grep -qE '"status":\s*"ok"' || die "unhealthy: $HEALTH"
SERVING="$(printf '%s' "$HEALTH" | sed -n 's/.*"version":\s*"\([^"]*\)".*/\1/p')"
[[ "$SERVING" == "$COMMIT" ]] || die "${HEALTH_URL} reports version '${SERVING}', expected '${COMMIT}'. Roll back with: $ROLLBACK_CMD"
ok "${CONTAINER} answering ${COMMIT} on 127.0.0.1:${PORT}"

denied="$(curl -s -o /dev/null -w '%{http_code}' -H 'X-School-Id: X' "http://127.0.0.1:${PORT}/api/v1/students")"
[[ "$denied" == "401" ]] || die "GET /api/v1/students without a token answered ${denied}, not 401; the build came up unauthenticated. Roll back with: $ROLLBACK_CMD"
ok "unauthenticated request is refused"

printf '%s %s\n' "$(date -u +%FT%TZ)" "$COMMIT" >> "$ROOT/.deploy-history"
say "deployed ${COMMIT}"
cat <<ROLLBACK

Rollback, if this turns out to be bad:
  $ROLLBACK_CMD
ROLLBACK
