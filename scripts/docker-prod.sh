#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${OPEN_ANALYST_ENV_FILE:-$ROOT_DIR/.env}"

database_url="${DATABASE_URL:-}"
if [[ -z "$database_url" && -f "$ENV_FILE" ]]; then
  database_url="$(
    ENV_FILE="$ENV_FILE" python - <<'PY'
import os
from pathlib import Path

env_file = Path(os.environ["ENV_FILE"])
value = ""
for raw_line in env_file.read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, raw_value = line.split("=", 1)
    if key != "DATABASE_URL":
        continue
    value = raw_value.strip().strip('"').strip("'")
    break
print(value)
PY
  )"
fi

compose_args=()
if [[ -f "$ENV_FILE" ]]; then
  compose_args+=(--env-file "$ENV_FILE")
fi
compose_args+=(-f "$ROOT_DIR/docker-compose.prod.yml")

if [[ -z "$database_url" ]]; then
  echo "DATABASE_URL not set; including bundled Postgres service." >&2
  compose_args+=(-f "$ROOT_DIR/docker-compose.prod.local-db.yml")
else
  echo "DATABASE_URL detected; using external Postgres backend." >&2
fi

cd "$ROOT_DIR"
exec docker compose "${compose_args[@]}" "$@"
