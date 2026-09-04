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
MIN_CLI="0.22.0"      # oldest CLI whose output this app can consume
PINNED_CLI="0.24.0"   # exact version the committed client was generated with

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
  # The generator SKIPS an event type the platform doesn't support -- `page` is
  # web-only, `screen` is mobile-only -- with a warning on STDOUT and exit 0. One plan
  # often serves both a web and a mobile source, so this is routine. Redirecting
  # stdout would throw away the only signal that a method is silently missing, so
  # capture it and treat any warning as fatal.
  local out
  mkdir -p node_modules/.cache
  out="$(
  TMPDIR="$PWD/node_modules/.cache" \
  RUDDERSTACK_CLI_EXPERIMENTAL=true \
  RUDDERSTACK_X_LOCAL_TYPER=true \
    rudder-cli typer generate \
      --local \
      --location "$CATALOG_PATH" \
      --tracking-plan-id "$TRACKING_PLAN_ID" \
      --platform typescript \
      --output "$1" \
      --option outputFileName=index.ts 2>&1
  )" || { echo "$out" >&2; return 1; }

  echo "$out"
  if grep -q "Warning:" <<<"$out"; then
    echo >&2
    echo "error: the generator skipped part of the plan (see the warning above)." >&2
    echo "       An unsupported event type is dropped silently — the method will be" >&2
    echo "       missing from the client. Fix the plan or the target platform." >&2
    return 1
  fi
}

if $check_only; then
  # Keep this temp beside the repo too -- mktemp here runs before generate() sets
  # TMPDIR, so without this the --check temp lands on the system volume, which is
  # the very split the redirect below is meant to avoid.
  mkdir -p node_modules/.cache
  tmp="$(TMPDIR="$PWD/node_modules/.cache" mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  generate "$tmp" >/dev/null || exit 1   # stderr (incl. skip warnings) still surfaces

  # The generated header embeds the CLI version, so CI must pin the same rudder-cli
  # the client was committed with or this diff is noise. See ci/typed-client-drift.yml.
  # The generated header embeds the CLI version, so a *different* permitted version
  # produces a two-line diff that is not drift. Say so rather than sending the reader
  # off to commit a regeneration that breaks everyone else's pinned CI.
  if [ "$cli_version" != "$PINNED_CLI" ]; then
    echo "error: rudder-cli $cli_version does not match the pinned $PINNED_CLI." >&2
    echo "       The committed client embeds its generator version, so any other" >&2
    echo "       version reports a false diff. Install $PINNED_CLI, or bump" >&2
    echo "       PINNED_CLI here in the same commit as a regenerated client." >&2
    exit 1
  fi

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
# Only claim "clean" when git actually said so. Defaulting to clean and overwriting
# on non-empty output makes a non-git catalog (vendored, tarball) assert a
# cleanliness nothing established — provenance a reviewer would read as evidence.
if ! git -C "$CATALOG_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  catalog_state="UNKNOWN — not a git checkout, provenance cannot be established"
elif [ -n "$(git -C "$CATALOG_PATH" status --porcelain -- .)" ]; then
  catalog_state="DIRTY — uncommitted catalog changes, this client is not reproducible from a commit"
else
  catalog_state="clean"
fi

generate "$OUT_DIR"

# Provenance only means something when the catalog is a SEPARATE repository: the
# commit it names is already final, so the record is exact and a reviewer can check
# the client against the catalog change it claims to come from.
#
# In a single repo the record cannot be honest. Writing the hash changes the file,
# which changes the hash, so it always names the previous commit -- and a mid-session
# regeneration records DIRTY. Committing that is worse than committing nothing: it
# reads as evidence while asserting something untrue. Here the provenance *is* the
# commit, because both sides land in it.
consumer_root="$(git rev-parse --show-toplevel 2>/dev/null || echo 'no-git')"
catalog_root="$(git -C "$CATALOG_PATH" rev-parse --show-toplevel 2>/dev/null || echo 'no-catalog-git')"
if [ "$consumer_root" = "$catalog_root" ]; then
  rm -f "$OUT_DIR/SOURCE.md"
  echo "✅ typed client regenerated (catalog is in this repository — provenance is this commit)"
  exit 0
fi

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
