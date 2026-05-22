#!/usr/bin/env bash
# setup.sh — one-time setup for contributors
#
# Run after cloning:
#   ./scripts/setup.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "Setting up rudder-agent-skills development environment..."

# Enable git hooks
git config core.hooksPath .githooks
echo "✓ Git hooks enabled:"
echo "    .githooks/pre-commit  — JSON manifest + skills review + conflict markers"
echo "    .githooks/pre-push    — strict skills review (matches CI)"

# Verify Python is available for the linter
if command -v python3 >/dev/null 2>&1; then
    echo "✓ Python 3 found (required for skills review)"
else
    echo "⚠ Python 3 not found — install it to enable pre-push validation"
fi

echo ""
echo "Setup complete. You can now:"
echo "  - Edit skills in plugins/*/skills/*/"
echo "  - Run 'python3 scripts/review-skills.py .' to lint locally"
echo "  - Push changes (pre-push hook will validate automatically)"
