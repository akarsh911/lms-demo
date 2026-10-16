#!/usr/bin/env bash
# Print a superadmin access token for the demo CAS.
#
#   TOKEN=$(./scripts/cas-token.sh)
#
# Handles both shapes: 2FA off returns tokens directly, 2FA on returns a
# challenge with dev_otp, which the demo instance echoes because CAS_DEV_OTP is
# set there. Both are needed, because the preview database is re-cloned from
# production on every redeploy and comes back with production's settings.
#
# Tokens last 15 minutes. Mint one per task rather than keeping it.
set -euo pipefail

CAS="${CAS_BASE_URL:-https://auth-demo.tryemerge.in}"
USER="${CAS_SUPERADMIN:-superadmin}"
PASS="${CAS_SUPERADMIN_PASSWORD:-Premium#119}"

login="$(curl -sS --max-time 25 -X POST "$CAS/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"$USER\",\"password\":\"$PASS\"}")"

token="$(printf '%s' "$login" | python -c '
import json,sys
d = json.load(sys.stdin)
print((d.get("tokens") or {}).get("access_token", ""))
')"

if [ -n "$token" ]; then
    printf '%s' "$token"
    exit 0
fi

challenge="$(printf '%s' "$login" | python -c '
import json,sys
o = (json.load(sys.stdin).get("otp") or {})
print(o.get("challenge_id",""), o.get("dev_otp",""))
')"
id="${challenge%% *}"
code="${challenge##* }"

if [ -z "$id" ] || [ -z "$code" ]; then
    printf 'cannot complete login: %s\n' "$(printf '%s' "$login" | head -c 300)" >&2
    printf 'no dev_otp in the response, so the code went to an inbox this script cannot read\n' >&2
    exit 1
fi

verify="$(curl -sS --max-time 25 -X POST "$CAS/v1/auth/login/verify" \
    -H 'Content-Type: application/json' \
    -d "{\"challenge_id\":\"$id\",\"code\":\"$code\"}")"

printf '%s' "$verify" | python -c '
import json,sys
d = json.load(sys.stdin)
t = (d.get("tokens") or {}).get("access_token", "")
if not t:
    sys.stderr.write("verify failed: " + json.dumps(d)[:300] + "\n")
    sys.exit(1)
print(t)
' | tr -d '\n'
