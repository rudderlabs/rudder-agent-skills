"""Draft the Events part of `## What changes` from two captures of the same driven traffic.

Usage: what_changes.py before.jsonl after.jsonl
before: AI events switched off (the app as it was); after: AI events on.
Prints the event table (counts per capture) and, per changed event, a redacted before/after JSON pair
with the differing fields listed. IDs, user IDs and timestamps are redacted; check the rest before sharing.
"""
import collections
import json
import re
import sys

DROP = {"messageId", "timestamp", "originalTimestamp", "sentAt", "receivedAt", "_metadata"}
ID_KEY = re.compile(r"(^|_)id$|Id$")


def load(path):
    msgs = [json.loads(line) for line in open(path) if line.strip()]
    return [m for m in msgs if m.get("type", "track") == "track" and m.get("event")]


def row_key(m):  # browser copies are their own rows
    return m["event"] + (" (browser)" if (m.get("properties") or {}).get("source") == "client" else "")


def redact(value, key=""):
    if isinstance(value, dict):
        return {k: redact(v, k) for k, v in value.items() if k not in DROP}
    if isinstance(value, list):
        return [redact(v, key) for v in value]
    if isinstance(value, str) and ID_KEY.search(key):
        return f"<{key}>"
    return value


def fields(message, prefix=""):
    out = {}
    for k, v in message.items():
        if k in DROP:
            continue
        path = f"{prefix}{k}"
        if isinstance(v, dict) and v:
            out.update(fields(v, path + "."))
        else:
            out[path] = type(v).__name__
    return out


before, after = load(sys.argv[1]), load(sys.argv[2])
nb = collections.Counter(row_key(m) for m in before)
na = collections.Counter(row_key(m) for m in after)
first_b = {row_key(m): m for m in reversed(before)}
first_a = {row_key(m): m for m in reversed(after)}

print("| Event | Status | Before | After |\n|---|---|---|---|")
changed = []
for name in sorted(nb.keys() | na.keys()):
    if not nb[name]:
        status = "new"
    elif not na[name]:
        status = "removed"
    else:
        fb, fa = fields(first_b[name]), fields(first_a[name])
        diff = ([f"+ {k}" for k in sorted(fa.keys() - fb.keys())] + [f"- {k}" for k in sorted(fb.keys() - fa.keys())]
                + [f"~ {k} ({fb[k]} -> {fa[k]})" for k in sorted(fb.keys() & fa.keys()) if fb[k] != fa[k]])
        status = "changed" if diff or nb[name] != na[name] else "unchanged"
        if status == "changed":
            changed.append((name, diff))
    print(f"| `{name}` | {status} | {nb[name]} | {na[name]} |")

for name, diff in changed:
    print(f"\n#### `{name}`\n\nDiffering fields: {', '.join(diff) or 'count only'}\n")
    print("Before:\n```json\n" + json.dumps(redact(first_b[name]), indent=2, sort_keys=True) + "\n```")
    print("After:\n```json\n" + json.dumps(redact(first_a[name]), indent=2, sort_keys=True) + "\n```")
