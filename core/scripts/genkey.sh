#!/usr/bin/env bash
# Print a new SECRETS_MASTER_KEY value.
set -euo pipefail
echo "1:$(openssl rand -hex 32)"
