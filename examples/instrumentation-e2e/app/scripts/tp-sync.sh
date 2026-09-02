#!/usr/bin/env bash
# Regenerate the typed client from the catalog on disk.
#
#   bash scripts/tp-sync.sh            regenerate in place, rewrite SOURCE.md
#   bash scripts/tp-sync.sh --check    fail if the committed client is stale (CI)
#
# Generation reads YAML off a local checkout. There is no workspace, no auth and no
# network call, and nothing is published — so the committed client is only as
# trustworthy as the checkout it came from. That is what SOURCE.md records and what
# --check enforces.
set -euo pipefail

CATALOG_PATH="${CATALOG_PATH:-../catalog}"
TRACKING_PLAN_ID="${TRACKING_PLAN_ID:-storefront}"
OUT_DIR="src/analytics/generated"
MIN_CLI="0.22.0"

check_only=false
[ "${1:-}" = "--check" ] && check_only=true

die() { echo "error: $*" >&2; exit 1; }

[ -d "$CATALOG_PATH" ] || die "no catalog at '$CATALOG_PATH'. Set CATALOG_PATH=/path/to/catalog."
command -v rudder-cli >/dev/null 2>&1 \
  || die "rudder-cli not on PATH (>= $MIN_CLI required) — https://github.com/rudderlabs/rudder-iac/releases"

# 0.22.0 made the generated constructor resolver-only (rudder-iac#681). An older CLI
# emits a client that captures the analytics instance once, which client.ts no longer
# matches — fail loudly rather than write out an incompatible client.
cli_version="$(rudder-cli --version | awk '{print $NF}')"
[ "$(printf '%s\n%s\n' "$MIN_CLI" "$cli_version" | sort -V | head -n1)" = "$MIN_CLI" ] \
  || die "rudder-cli $cli_version is too old; >= $MIN_CLI required."

generate() {
  # rudder-cli renames a temp file onto the target. Keeping the temp on the same
  # filesystem avoids a cross-device link failure when the repo lives on another
  # volume (rudder-iac#680 moved the temp next to the destination; this keeps the
  # script working on older CLIs too).
  mkdir -p node_modules/.cache
  TMPDIR="$PWD/node_modules/.cache" \
  RUDDERSTACK_CLI_EXPERIMENTAL=true \
  RUDDERSTACK_X_LOCAL_TYPER=true \
    rudder-cli typer generate \
      --local \
      --location "$CATALOG_PATH" \
      --tracking-plan-id "$TRACKING_PLAN_ID" \
      --platform typescript \
      --output "$1" \
      --option outputFileName=index.ts
}

if $check_only; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  generate "$tmp" >/dev/null

  # The generated header embeds the CLI version, so CI must pin the same rudder-cli
  # the client was committed with or this diff is noise. See ci/typed-client-drift.yml.
  if ! diff -u "$OUT_DIR/index.ts" "$tmp/index.ts"; then
    echo >&2
    echo "error: $OUT_DIR/index.ts is not what the catalog produces." >&2
    echo "       Run 'npm run tp:sync' and commit the result." >&2
    exit 1
  fi
  echo "✅ committed client matches the catalog"
  exit 0
fi

catalog_rev="$(git -C "$CATALOG_PATH" rev-parse HEAD 2>/dev/null || echo 'not a git checkout')"
catalog_branch="$(git -C "$CATALOG_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'n/a')"
catalog_state="clean"
if [ -n "$(git -C "$CATALOG_PATH" status --porcelain -- . 2>/dev/null)" ]; then
  catalog_state="DIRTY — uncommitted catalog changes, this client is not reproducible from a commit"
fi

generate "$OUT_DIR"

cat > "$OUT_DIR/SOURCE.md" <<EOF
<!-- Written by \`npm run tp:sync\`. Do not edit by hand. -->

# Typed client provenance

\`index.ts\` in this directory was generated from the catalog below. Regenerate with
\`npm run tp:sync\` after changing the catalog, and commit both files together.

| | |
| --- | --- |
| catalog commit | \`$catalog_rev\` |
| branch at generation | \`$catalog_branch\` |
| catalog working tree | $catalog_state |
| tracking plan | \`$TRACKING_PLAN_ID\` |
| rudder-cli | \`$cli_version\` |
EOF

echo "✅ typed client regenerated from ${catalog_rev:0:9} ($catalog_branch, $catalog_state)"
