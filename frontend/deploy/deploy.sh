#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"
SERVICE="emerge-labs"
HEALTH_URL="http://127.0.0.1:8076/"
HEALTH_ATTEMPTS=45
HEALTH_DELAY=2

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

fail() {
  echo "deploy.sh: $*" >&2
  exit 1
}

[ -f "$COMPOSE_FILE" ] || fail "no compose file at $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "no $ENV_FILE — copy .env.example to .env and fill it in"

grep -q '^SESSION_SECRET=.\{32,\}$' "$ENV_FILE" \
  || fail "SESSION_SECRET in $ENV_FILE is missing or shorter than 32 characters"

grep -q '^RETRIEVAL_API_URL=https://' "$ENV_FILE" \
  || fail "RETRIEVAL_API_URL in $ENV_FILE must be an https:// URL"

echo "==> building $SERVICE"
compose build

echo "==> starting $SERVICE"
compose up -d "$SERVICE"

echo "==> waiting for $HEALTH_URL"
for _ in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if curl -fsSL -o /dev/null --max-time 5 "$HEALTH_URL"; then
    echo "==> $SERVICE is up on $HEALTH_URL"
    compose ps
    exit 0
  fi
  sleep "$HEALTH_DELAY"
done

echo "deploy.sh: $SERVICE did not answer within $((HEALTH_ATTEMPTS * HEALTH_DELAY))s" >&2
compose ps >&2
compose logs --tail 80 "$SERVICE" >&2
exit 1
