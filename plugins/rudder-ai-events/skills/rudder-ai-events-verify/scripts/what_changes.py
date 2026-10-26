"""Draft the Events part of `## What changes` from two captures of the same driven traffic.

Usage: what_changes.py before.jsonl after.jsonl
before: AI events switched off (the app as it was); after: AI events on.
Prints the event table (counts per capture) and, per changed event, a redacted before/after JSON pair
with the differing fields and values listed. Fields that differ on every run (IDs, timestamps, durations)
count by presence and type only. IDs, user and account IDs, on_behalf_of, emails, traits and timestamps
are redacted; check the rest before sharing.
"""
import collections
import json
import re
import sys

DROP = {"messageId", "timestamp", "originalTimestamp", "sentAt", "receivedAt", "_metadata"}
ID_KEY = re.compile(r"(^|_)id$|Id$|^on_behalf_of$|[eE]mail")
PERSONAL = {"traits"}  # identify() traits (email, name, ...) ride along in context
EMAIL = re.compile(r"[^\s@\"]+@[^\s@\"]+\.\w+")
VARY = re.compile(r"^(interaction_id|conversation_id|parent_interaction_id|trace_id|anonymousId|anonymous_id|sessionId)$"
                  r"|_ms$|[Ll]atency|[Dd]uration|At$")


def load(path):
    msgs = [json.loads(line) for line in open(path) if line.strip()]
    return [m for m in msgs if m.get("type", "track") == "track" and m.get("event")]


def row_key(m):  # browser copies are their own rows
    return m["event"] + (" (browser)" if (m.get("properties") or {}).get("source") == "client" else "")


def redact(value, key=""):
    if key in PERSONAL or (value is not None and not isinstance(value, (dict, list)) and ID_KEY.search(key)):
        return f"<{key}>"
    if isinstance(value, dict):
        return {k: redact(v, k) for k, v in value.items() if k not in DROP}
    if isinstance(value, list):
        return [redact(v, key) for v in value]
    if isinstance(value, str):
        return EMAIL.sub("<email>", value)
    return value


def fields(message, prefix=""):
    out = {}
    for k, v in message.items():
        if k in DROP:
            continue
        path = f"{prefix}{k}"
        if isinstance(v, dict) and v and k not in PERSONAL:
            out.update(fields(v, path + "."))
        elif VARY.search(k) or ID_KEY.search(k) or k in PERSONAL:  # differs per run, or redacted: type only
            out[path] = type(v).__name__
        else:
            out[path] = json.dumps(redact(v, k), sort_keys=True)
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
