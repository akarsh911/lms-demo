#!/usr/bin/env bash
set -euo pipefail

FRONTEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$FRONTEND/.." && pwd)"
LOGS="${DEMO_LOGS:-$FRONTEND/.demo-logs}"
PORT="${DEMO_PORT:-3125}"
mkdir -p "$LOGS"

listening() {
  netstat -ano 2>/dev/null | grep -qE "[:.]$1 .*LISTEN"
}

launch() {
  local name="$1" port="$2" dir="$3"
  shift 3
  if listening "$port"; then
    echo "up      $name :$port"
    return
  fi
  (cd "$dir" && nohup "$@" > "$LOGS/$name.log" 2>&1 &)
  echo "started $name :$port  (log $LOGS/$name.log)"
}

launch papersetter 8400 "$ROOT/lms-paper-setter-school" \
  .venv/Scripts/python.exe "$FRONTEND/scripts/dev-papersetter.py" --port 8400

launch lessonplanner 8500 "$FRONTEND/dev-backends/lessonplanner" \
  env LESSONPLANNER_DEMO_RESET=1 python -m uvicorn app:create_app --factory --port 8500

launch gapanalyzer 8510 "$FRONTEND/dev-backends/gapanalyzer" \
  env GAPANALYZER_DEMO_RESET=1 python -m uvicorn app:create_app --factory --port 8510

launch omr 8610 "$FRONTEND/dev-backends/omr" \
  python -m uvicorn app:create_app --factory --port 8610

launch debate 8700 "$ROOT/lms-debate-room" \
  env DR_SPEECH_PROVIDER=stub DR_LLM_PROVIDER=stub DR_KNOWLEDGE_PROVIDER=stub \
  .venv/Scripts/python.exe -m uvicorn debate_engine.api:app --port 8700

TOKEN_FILE="$ROOT/lms-paper-setter-school/backend/storage/dev-bypass/dev-service-token"
for _ in $(seq 1 30); do
  [ -s "$TOKEN_FILE" ] && break
  sleep 1
done

FRONTEND_ENV=(
  DEV_BYPASS=1
  DEV_LIVE_SERVICES="${DEV_LIVE_SERVICES:-papersetter,lessonplanner,omr,gapanalyzer}"
  PAPERSETTER_API_URL=http://127.0.0.1:8400
  DEBATE_API_URL=http://localhost:8700
  DEV_PAPERSETTER_TOKEN="$(cat "$TOKEN_FILE" 2>/dev/null || true)"
)

if [ "${DEMO_PROD:-}" = "1" ]; then
  launch frontend-prod "$PORT" "$FRONTEND" env "${FRONTEND_ENV[@]}" \
    bash -c 'npx next build && exec npx next start -p "$1"' next-prod "$PORT"
else
  launch frontend "$PORT" "$FRONTEND" env "${FRONTEND_ENV[@]}" npx next dev -p "$PORT"
fi

echo "open http://localhost:$PORT/p/principal"
