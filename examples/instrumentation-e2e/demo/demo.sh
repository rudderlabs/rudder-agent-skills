#!/usr/bin/env bash
#
# Scripted walkthrough of the typed-instrumentation loop, for presenting.
#
#   ./demo.sh            present it (simulated typing; needs `pv`)
#   ./demo.sh -d         no typing simulation, no `pv` needed
#   ./demo.sh -n         don't wait for ENTER between steps
#   ./demo.sh -w5        auto-advance after 5s
#
# The demo edits the catalog to show the loop reacting. Everything it touches is
# backed up first and restored on exit, including on Ctrl-C.

set -o pipefail   # deliberately not -e or -u: two steps are *meant* to fail on
                  # camera, and demo-magic unsets TYPE_SPEED under -d

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
APP="$ROOT/app"
CATALOG="$ROOT/catalog"

. "$HERE/demo-magic.sh"

# demo-magic's -d works by unsetting TYPE_SPEED, so only override it when it
# survived the option parsing — otherwise -d would still reach for `pv`.
[[ -n "${TYPE_SPEED-}" ]] && TYPE_SPEED=28
DEMO_PROMPT="${GREEN}➜ ${CYAN}storefront ${COLOR_RESET}$ "

# ── narration helpers ────────────────────────────────────────────────────────
say()  { echo -e "\n${BOLD}$*${COLOR_RESET}"; }
note() { echo -e "${GREY}$*${COLOR_RESET}"; }
beat() { echo; }

# ── preflight ────────────────────────────────────────────────────────────────
fail() { echo -e "${RED}error:${COLOR_RESET} $*" >&2; exit 1; }

command -v rudder-cli >/dev/null 2>&1 \
  || fail "rudder-cli not on PATH (>= 0.22.0). https://github.com/rudderlabs/rudder-iac/releases"
cli="$(rudder-cli --version | awk '{print $NF}')"
[ "$(printf '0.22.0\n%s\n' "$cli" | sort -V | head -n1)" = "0.22.0" ] \
  || fail "rudder-cli $cli is too old; >= 0.22.0 required."
command -v node >/dev/null 2>&1 || fail "node not on PATH (20+ required)."
node_major="$(node --version | sed 's/^v\([0-9]*\).*/\1/')"
[ "$node_major" -ge 20 ] || fail "node $(node --version) is too old; 20+ required."
[ -d "$APP/node_modules" ] \
  || fail "dependencies not installed. Run: (cd $APP && npm install)"

# ── restore whatever we touch, however we exit ───────────────────────────────
BACKUP="$(mktemp -d)"
cp -R "$CATALOG" "$BACKUP/catalog"
cp -R "$APP/src/analytics/generated" "$BACKUP/generated"
restore() {
  # Guarded and idempotent: if the backup is already gone, a second invocation
  # must do nothing. Without this, deleting the originals and then failing to
  # copy them back loses them outright.
  [ -d "$BACKUP/catalog" ] && [ -d "$BACKUP/generated" ] || return 0
  rm -rf "$CATALOG" "$APP/src/analytics/generated"
  cp -R "$BACKUP/catalog" "$CATALOG"
  cp -R "$BACKUP/generated" "$APP/src/analytics/generated"
  rm -rf "$BACKUP"
  echo -e "\n${GREY}(catalog and generated client restored)${COLOR_RESET}"
}
# Only EXIT restores. Signals just exit, which fires EXIT exactly once — trapping
# restore on INT/TERM *and* EXIT runs it twice, and the second pass has no backup.
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$APP"
clear

# ─────────────────────────────────────────────────────────────────────────────
say "Typed instrumentation, end to end"
note "A storefront app whose analytics client is generated from YAML on disk."
note "No workspace. No apply. No auth. No network."
beat
wait

say "1 — The contract lives in the catalog, not in the code"
pe "cat ../catalog/data-catalog/events/checkout.yaml"
note "Events declare identity only. What they must carry is the plan's decision:"
pe "sed -n '/- event: \"#event:checkout_started\"/,/type: \"event_rule\"/p' ../catalog/tracking-plans/storefront.yaml"

say "2 — Generate the client from those files"
pe "npm run tp:sync"
note "'Fetching' is the CLI's wording — nothing was fetched. It read the directory."

say "3 — What came out"
pe "sed -n '/export interface CheckoutStarted/,/^}/p' src/analytics/generated/index.ts"
note "couponCode is optional because the plan says required: false."
pe "grep -n 'constructor(resolveAnalytics' src/analytics/generated/index.ts"
note "A resolver, not an instance — re-resolved per call, so the SDK swap is survived."

say "4 — Now break the contract"
note "Make couponCode required — one line, in the catalog."
pe "sed -i '' '/#property:coupon_code/{n;s/required: false/required: true/;}' ../catalog/tracking-plans/storefront.yaml"
pe "npm run tp:sync && npm run typecheck"
note "Every call site that no longer complies — production code and tests alike,"
note "from one line of YAML, and with nothing published anywhere."
note "The compiler just enumerated the blast radius of a governance decision."

say "5 — The wrong fix, and the right one"
note "Wrong: couponCode: '' at the call site. Build goes green, catalog now lies."
note "Right: the storefront genuinely doesn't know the coupon yet. Revert."
pe "sed -i '' '/#property:coupon_code/{n;s/required: true/required: false/;}' ../catalog/tracking-plans/storefront.yaml"
pe "npm run tp:sync && npm run typecheck && npm test"

say "6 — The failure mode CI exists for"
note "Change only a description. Don't regenerate. This is what really happens."
pe "sed -i '' 's/drawer with a non-empty cart/drawer/' ../catalog/data-catalog/events/checkout.yaml"
pe "npm run typecheck && npm test && npm run build"
note "All green. The committed client is stale and nothing noticed."
pe "npm run tp:check"
note "Only the drift check sees it. That's the job worth adding to CI."

say "Done"
note "catalog on disk  ->  typed client  ->  call sites, enforced by the compiler."
note "Full guide: ../README.md"
beat
