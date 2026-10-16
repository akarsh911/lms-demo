#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${TT_CONTAINER:-emerge-core-tenant-db-1}"
DB="${TT_DB:-emerge_tenant_demo}"
USER="${TT_USER:-emerge}"
BRANCH="${1:-62dda72a-03b6-4731-99a9-b39a6dd3f9b5}"
OUT="${2:-school.json}"

here="$(cd "$(dirname "$0")" && pwd)"

docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" -At -v branch="$BRANCH" -f - \
  < "$here/export.sql" > "$OUT"

python - "$OUT" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as fh:
    doc = json.load(fh)
with open(path, 'w') as fh:
    json.dump(doc, fh, indent=2, sort_keys=True)
    fh.write('\n')
print('%s: %d offerings, %d cells, %d cohorts, %d teachers, %d rooms' % (
    path, len(doc['offerings']), len(doc['cells']), len(doc['cohorts']),
    len(doc['teachers']), len(doc['rooms'])))
PY
