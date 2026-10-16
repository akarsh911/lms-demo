#!/usr/bin/env bash
# Hit the endpoints a running instance must answer.
set -euo pipefail
BASE="${1:-http://localhost:8081}"

check() {
    local method="$1" path="$2" expect="$3"; shift 3
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$@" "$BASE$path")"
    if [ "$code" = "$expect" ]; then
        echo "ok      $method $path -> $code"
    else
        echo "FAIL    $method $path -> $code (expected $expect)"
        exit 1
    fi
}

check GET /health 200
check GET /api/v1 200
check GET /api/v1/health 200
check GET /api/v1/schools 200
check GET /api/v1/students 400          # no X-School-Id
check GET /api/v1/nope 404

echo "smoke passed against $BASE"
