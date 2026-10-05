#!/bin/bash
# Get a fresh cloud session ready to run the platform and its tests.
set -euo pipefail

# Only needed in Claude Code cloud sessions; on your own computer you install once.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
npm install --no-audit --no-fund
