#!/usr/bin/env bash
set -euo pipefail

mkdir -p /var/open-analyst/workspaces /var/open-analyst/config
chown -R appuser:appuser /var/open-analyst

exec su -s /bin/sh appuser -c "pnpm start"
