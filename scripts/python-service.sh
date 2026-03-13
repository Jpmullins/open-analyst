#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$repo_root/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$repo_root/.env"
  set +a
fi

usage() {
  cat <<'EOF'
Usage: scripts/python-service.sh <setup|run|test> <agent|analyst-mcp>
EOF
}

command_name="${1:-}"
service_name="${2:-}"

if [[ -z "$command_name" || -z "$service_name" ]]; then
  usage
  exit 1
fi

case "$service_name" in
  agent)
    service_dir="$repo_root/services/strands-agent"
    venv_dir="${OPEN_ANALYST_AGENT_VENV:-$HOME/.venvs/open-analyst-strands-agent}"
    run_args=("python" "src/main.py")
    test_args=("pytest" "tests/" "-v")
    ;;
  analyst-mcp)
    service_dir="$repo_root/services/analyst-mcp"
    venv_dir="${OPEN_ANALYST_ANALYST_MCP_VENV:-$HOME/.venvs/open-analyst-analyst-mcp}"
    run_args=("analyst-mcp" "serve")
    test_args=("pytest" "tests/" "-v")
    ;;
  *)
    echo "Unknown service: $service_name" >&2
    usage
    exit 1
    ;;
esac

ensure_synced() {
  mkdir -p "$(dirname "$venv_dir")"
  (
    cd "$service_dir"
    UV_PROJECT_ENVIRONMENT="$venv_dir" uv sync --extra dev
  )
}

ensure_executable() {
  local bin_name="$1"
  if [[ ! -x "$venv_dir/bin/$bin_name" ]]; then
    echo "Missing $venv_dir/bin/$bin_name. Run: pnpm setup:${service_name}" >&2
    exit 1
  fi
}

case "$command_name" in
  setup)
    ensure_synced
    ;;
  run)
    ensure_executable "${run_args[0]}"
    (
      cd "$service_dir"
      exec "$venv_dir/bin/${run_args[0]}" "${run_args[@]:1}"
    )
    ;;
  test)
    ensure_executable "${test_args[0]}"
    (
      cd "$service_dir"
      exec "$venv_dir/bin/${test_args[0]}" "${test_args[@]:1}"
    )
    ;;
  *)
    echo "Unknown command: $command_name" >&2
    usage
    exit 1
    ;;
esac
