#!/usr/bin/env bash
# Bring up the databases, apply migrations and run the API.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { cp .env.example .env; echo "created .env - set SECRETS_MASTER_KEY"; }

docker compose up -d control-db dev-db tenant-db
until docker compose exec -T control-db pg_isready -q; do sleep 1; done

go run ./cmd/migrate apply -plane control

# No CAS locally, so say so outright rather than relying on an empty variable.
AUTH_DISABLED="${AUTH_DISABLED:-true}" go run ./cmd/api
