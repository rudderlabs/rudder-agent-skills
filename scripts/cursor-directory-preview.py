#!/usr/bin/env python3
# cursor-directory-preview.py — replay cursor.directory's plugin discovery LOCALLY.
#
# cursor.directory ingests a repo by running the parser at
#   cursor/community-plugins : apps/cursor/src/lib/github-plugin/parse.ts
# against your DEFAULT BRANCH (its parseGitHubUrl ignores any branch in the URL).
# That means you cannot test a feature branch on the live site — you'd have to
# merge to main to find out if discovery works. This script removes that loop:
# it reproduces parse.ts's discovery byte-faithfully against your local working
# tree, so you can iterate on marketplace.json / layout and see exactly what
# cursor.directory would find (or the exact error it would throw) — no network,
# no merge.
#
# Faithfulness notes (keep in sync with parse.ts if it changes):
#   - Marketplace/plugin manifest is read from rootManifestPaths, first hit wins:
#       .plugin/plugin.json, .cursor-plugin/plugin.json, .claude-plugin/plugin.json,
#       .cursor-plugin/marketplace.json
#   - Sub-plugin dirs come from manifest.plugins[].source (stripped of LEADING/
#     TRAILING SLASHES ONLY — NOT "./") plus any <dir>/.cursor-plugin/plugin.json.
#   - prefixes = ["", *subPluginDirs]; the prefix is interpolated RAW into each
#     component regex (so a "./" left in a source becomes a regex wildcard and the
#     skills pattern fails to match — this is the real gotcha this tool surfaces).
#
# Usage:
#   scripts/cursor-directory-preview.py [repo_root]
# Exit codes: 0 = components found, 1 = none found (same condition that makes the
# live submission fail).

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


def tree_paths(root: Path) -> list[str]:
    """Files as they WOULD be committed: tracked + untracked-not-ignored.
    Mirrors the GitHub tree cursor.directory fetches from your default branch."""
    try:
        out = subprocess.check_output(
            ["git", "-C", str(root), "ls-files", "--cached", "--others",
             "--exclude-standard"],
            text=True, stderr=subprocess.DEVNULL,
        )
        return [p for p in out.splitlines() if p]
    except (subprocess.CalledProcessError, FileNotFoundError):
        return [str(p.relative_to(root).as_posix())
                for p in root.rglob("*") if p.is_file()]


def read(root: Path, rel: str) -> str | None:
    p = root / rel
    return p.read_text(encoding="utf-8", errors="replace") if p.is_file() else None


ROOT_MANIFEST_PATHS = [
    ".plugin/plugin.json",
    ".cursor-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".cursor-plugin/marketplace.json",
]


def discover(root: Path):
    tree = set(tree_paths(root))

    manifest: dict = {}
    manifest_path = None
    for mp in ROOT_MANIFEST_PATHS:
        content = read(root, mp)
        if content is not None:
            manifest_path = mp
            try:
                manifest = json.loads(content)
            except json.JSONDecodeError:
                manifest = {}
            break

    # Sub-plugin dirs: from manifest.plugins[].source, and from any
    # <dir>/.cursor-plugin/plugin.json. NOTE the JS strip is slashes-only.
    sub_dirs: list[str] = []
    seen_dirs: set[str] = set()

    def add_dir(d: str):
        if d not in seen_dirs:
            seen_dirs.add(d)
            sub_dirs.append(d)

    if isinstance(manifest.get("plugins"), list):
        for entry in manifest["plugins"]:
            if isinstance(entry, dict):
                source = entry.get("source")
                if isinstance(source, str) and source and ".." not in source:
                    add_dir(re.sub(r"^/+|/+$", "", source) + "/")

    for p in tree:
        m = re.match(r"^(.+)/\.cursor-plugin/plugin\.json$", p)
        if m:
            add_dir(m.group(1) + "/")

    prefixes = [""] + sub_dirs

    # Per-prefix component discovery — regexes match parse.ts exactly, prefix raw.
    found = []  # (prefix, type, path)
    for prefix in prefixes:
        for p in tree:
            if re.match(rf"^{prefix}rules/.*\.mdc$", p):
                found.append((prefix, "rule", p))
            if re.match(rf"^{prefix}skills/[^/]+/SKILL\.md$", p):
                found.append((prefix, "skill", p))
            if re.match(rf"^{prefix}agents/.*\.md$", p):
                found.append((prefix, "agent", p))
            if re.match(rf"^{prefix}commands/.*\.md$", p):
                found.append((prefix, "command", p))
        for exact, typ in [(f"{prefix}.mcp.json", "mcp"), (f"{prefix}mcp.json", "mcp"),
                           (f"{prefix}hooks/hooks.json", "hook"),
                           (f"{prefix}.lsp.json", "lsp")]:
            if exact in tree:
                found.append((prefix, typ, exact))

    return manifest, manifest_path, prefixes, found


HINTS = ["rules/*.mdc", ".mcp.json or mcp.json", "skills/*/SKILL.md",
         "agents/*.md", "commands/*.md", "hooks/hooks.json", ".lsp.json"]


def main(argv=None) -> int:
    root = Path(argv[0] if argv else ".").resolve()
    manifest, manifest_path, prefixes, found = discover(root)

    print(f"cursor.directory preview for: {root}")
    print(f"  marketplace/plugin manifest: {manifest_path or '(none found)'}")
    if manifest.get("name"):
        print(f"  manifest.name: {manifest['name']}")
    shown = [p if p else "repo root" for p in prefixes]
    print(f"  scanned prefixes: {', '.join(shown)}")
    print()

    if not found:
        scanned = ", ".join("repo root" if p == "" else p.rstrip("/") for p in prefixes)
        print("RESULT: submission WOULD FAIL with:")
        print(f"  No plugin components found in: {scanned}. "
              f"We looked for: {', '.join(HINTS)}. "
              f"Make sure your repo follows the Open Plugins standard "
              f"(https://open-plugins.com).")
        return 1

    by_prefix: dict = {}
    for prefix, typ, path in found:
        by_prefix.setdefault(prefix or "repo root", []).append((typ, path))
    print(f"RESULT: submission WOULD SUCCEED — {len(found)} component(s):")
    for prefix in sorted(by_prefix):
        items = by_prefix[prefix]
        print(f"  {prefix}  ({len(items)})")
        for typ, path in items:
            print(f"      [{typ}] {path}")

    # A declared plugin that yields zero components still lets the overall
    # submission pass, but that plugin would silently show no skills. Surface it.
    empty = [p for p in prefixes if p and p not in by_prefix]
    if empty:
        print()
        print("WARNING: declared plugins with NO discoverable components "
              "(they'd be silently empty in the listing):")
        for p in empty:
            print(f"  - {p.rstrip('/')}")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
