#!/usr/bin/env bash
# Open a tunnel to the deployed CAS on the demo box.
#
#   ./scripts/cas-tunnel.sh
#
# CAS publishes on LOOPBACK ONLY (127.0.0.1:8071 on the box), deliberately: it
# is a sidecar that other services ask about permissions, and nothing from the
# internet should reach it. So a local emerge-core cannot talk to it directly --
# it needs this tunnel, and CAS_BASE_URL then points at localhost.
#
# Leave it running in its own terminal. Ctrl-C closes it.
set -euo pipefail

HOST="${CAS_SSH_HOST:-lms}"
PORT="${CAS_PORT:-8071}"

if curl -sf -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null; then
    echo "something already answers on $PORT -- a tunnel is probably up"
    exit 0
fi

echo "tunnelling localhost:$PORT -> $HOST:127.0.0.1:$PORT"
echo "leave this running; Ctrl-C to close"
exec ssh -N -o ExitOnForwardFailure=yes -L "$PORT:127.0.0.1:$PORT" "$HOST"
