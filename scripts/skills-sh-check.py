#!/usr/bin/env python3
# skills-sh-check.py — run skills.sh's REAL discovery against this repo and assert
# every plugin skill is found.
#
# skills.sh is powered by the published `skills` CLI (github.com/vercel-labs/skills),
# so — unlike cursor.directory, which has no package and is vendored under
# scripts/cursor-preview/ — we don't vendor source here: we run the pinned official
# package. `skills add <repo> --list` reproduces exactly what the skills.sh leaderboard
# crawler discovers.
#
# The CLI has no machine-readable mode for the discovery path, so we derive the
# EXPECTED set from the same manifest the CLI reads (.claude-plugin/marketplace.json:
# each plugin.source + "/skills/<skill>/SKILL.md") and assert every expected skill
# appears in the CLI's output. A missing one means the CLI silently dropped it
# (e.g. an unquoted "key: value" colon in a description breaks its YAML parse).
#
# Usage:  scripts/skills-sh-check.py [repo_root]
# Needs:  Node >= 18 (the `skills` CLI engine) and network (to fetch the pinned package).
# Exit:   0 all expected skills discovered; 1 any missing / can't run.

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

# Pinned for reproducibility — refresh deliberately. Mirrors the pinned commit in
# scripts/cursor-preview/parse.ts. Latest: `npm view skills version`.
SKILLS_CLI_VERSION = "1.5.12"

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


def expected_skills(root: Path) -> set[str]:
    """Skill dir names the CLI SHOULD discover: for each plugin.source in the
    Claude marketplace manifest (the file skills.sh reads), <source>/skills/*/SKILL.md."""
    manifest = root / ".claude-plugin" / "marketplace.json"
    data = json.loads(manifest.read_text())
    names: set[str] = set()
    for plugin in data.get("plugins", []):
        src = plugin.get("source")
        if not isinstance(src, str):
            continue
        src = src.lstrip("./").rstrip("/")
        for skill_md in (root / src / "skills").glob("*/SKILL.md"):
            names.add(skill_md.parent.name)
    return names


def discovered_skills(root: Path, expected: set[str]) -> set[str]:
    """Run the pinned `skills` CLI and return which expected names it lists.
    Matches against the known expected set so we don't have to distinguish
    name lines from description lines in the pretty (ANSI) output."""
    proc = subprocess.run(
        ["npx", "--yes", f"skills@{SKILLS_CLI_VERSION}", "add", str(root), "--list"],
        capture_output=True, text=True,
    )
    out = ANSI.sub("", proc.stdout + proc.stderr)
    found: set[str] = set()
    for line in out.splitlines():
        token = line.lstrip(" │").strip()
        if token in expected:
            found.add(token)
    return found


def main(argv=None) -> int:
    root = Path(argv[0] if argv else ".").resolve()

    try:
        expected = expected_skills(root)
    except FileNotFoundError:
        print("skills-sh-check: no .claude-plugin/marketplace.json found", file=sys.stderr)
        return 1
    if not expected:
        print("skills-sh-check: no skills found under manifest plugin sources", file=sys.stderr)
        return 1

    try:
        found = discovered_skills(root, expected)
    except FileNotFoundError:
        print("skills-sh-check: `npx` not found — Node >= 18 is required to run the skills CLI.",
              file=sys.stderr)
        return 1

    missing = sorted(expected - found)
    print(f"skills.sh (skills@{SKILLS_CLI_VERSION}): {len(found)}/{len(expected)} expected skills discovered")
    if missing:
        print("\nMISSING — skills.sh would silently drop these:", file=sys.stderr)
        for name in missing:
            print(f"  - {name}", file=sys.stderr)
        print("\nCommon cause: an unquoted ': ' (colon-space) in the SKILL.md description "
              "breaks the CLI's YAML parse. Quote the description.", file=sys.stderr)
        return 1
    print("all manifest-declared skills are discoverable by skills.sh ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
