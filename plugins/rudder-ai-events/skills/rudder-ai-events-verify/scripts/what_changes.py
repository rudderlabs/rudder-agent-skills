"""Draft the Events part of `## What changes` from two captures of the same driven traffic.

Usage: what_changes.py before.jsonl after.jsonl
before: AI events switched off (the app as it was); after: AI events on.
Prints the event table (counts per capture) and, per changed event, a redacted before/after JSON pair
with the differing fields and values listed. Every occurrence is compared in capture order; the pair shown
is the first that differs. Fields that differ on every run (IDs, timestamps, durations) count by presence
and type only, inside lists too. IDs, user and account IDs, on_behalf_of, emails, traits and timestamps
are redacted; check the rest before sharing.
"""
import collections
import json
import re
import sys

SDK_NAMES = {"@rudderstack/ai", "rudderstack-ai", "ai-sdk-go"}  # context.wrapperLibrary.name, as in check_events.py
DROP = {"messageId", "timestamp", "originalTimestamp", "sentAt", "receivedAt", "_metadata"}
ID_KEY = re.compile(r"(^|_)id$|Id$|^on_behalf_of$|[eE]mail")
PERSONAL = {"traits"}  # identify() traits (email, name, ...) ride along in context
EMAIL = re.compile(r"[^\s@\"]+@[^\s@\"]+\.\w+")
VARY = re.compile(r"^(interaction_id|conversation_id|parent_interaction_id|trace_id|anonymousId|anonymous_id|sessionId)$"
                  r"|_ms$|[Ll]atency|[Dd]uration|At$|[Tt]imestamp")


def load(path):
    msgs = [json.loads(line) for line in open(path) if line.strip()]
    return [m for m in msgs if m.get("type", "track") == "track" and m.get("event")]


def row_key(m):  # browser copies are their own rows, and so is a legacy event that uses an AI SDK name
    if (m.get("properties") or {}).get("source") == "client":
        return m["event"] + " (browser)"
    sdk = ((m.get("context") or {}).get("wrapperLibrary") or {}).get("name") in SDK_NAMES
    return m["event"] + (" (legacy)" if not sdk and m["event"].startswith(("ai_", "mcp_")) else "")


def redact(value, key=""):
    if key in PERSONAL or (value is not None and not isinstance(value, (dict, list)) and ID_KEY.search(key)):
        return f"<{key}>"
    if isinstance(value, dict):
        return {k: redact(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v, key) for v in value]
    if isinstance(value, str):
        return EMAIL.sub("<email>", value)
    return value


def shown(message):  # envelope fields are per send; nested ones are payload and stay
    return redact({k: v for k, v in message.items() if k not in DROP})


def norm(value, key=""):
    """Comparable form: run-varying and redacted fields keep only their type, at any depth (lists included)."""
    if VARY.search(key) or ID_KEY.search(key) or key in PERSONAL:
        return type(value).__name__
    if isinstance(value, dict):
        return {k: norm(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [norm(v, key) for v in value]
    return redact(value, key)


def fields(message, prefix=""):
    out = {}
    for k, v in message.items():
        if not prefix and k in DROP:  # envelope only: a payload's own messageId or timestamp is compared by type
            continue
        path = f"{prefix}{k}"
        if isinstance(v, dict) and v and k not in PERSONAL:
            out.update(fields(v, path + "."))
        else:
            out[path] = json.dumps(norm(v, k), sort_keys=True)
    return out


def diff_of(fb, fa):
    return ([f"+ {k}" for k in sorted(fa.keys() - fb.keys())] + [f"- {k}" for k in sorted(fb.keys() - fa.keys())]
            + [f"~ {k} ({fb[k]} -> {fa[k]})" for k in sorted(fb.keys() & fa.keys()) if fb[k] != fa[k]])


before, after = load(sys.argv[1]), load(sys.argv[2])
by_b, by_a = collections.defaultdict(list), collections.defaultdict(list)
for m in before:
    by_b[row_key(m)].append(m)
for m in after:
    by_a[row_key(m)].append(m)

print("| Event | Status | Before | After |\n|---|---|---|---|")
changed = []
for name in sorted(by_b.keys() | by_a.keys()):
    nb, na = len(by_b[name]), len(by_a[name])
    if not nb:
        status = "new"
    elif not na:
        status = "removed"
    else:
        # Compare every occurrence in capture order; a change in a later turn counts too.
        diff, pair = [], (by_b[name][0], by_a[name][0])
        for mb, ma in zip(by_b[name], by_a[name]):
            d = diff_of(fields(mb), fields(ma))
            if d and not diff:
                pair = (mb, ma)  # show the first pair that actually differs
            diff += [line for line in d if line not in diff]
        status = "changed" if diff or nb != na else "unchanged"
        if status == "changed":
            changed.append((name, diff, pair))
    print(f"| `{name}` | {status} | {nb} | {na} |")

for name, diff, (mb, ma) in changed:
    print(f"\n#### `{name}`\n\nDiffering fields: {', '.join(diff) or 'count only'}\n")
    print("Before:\n```json\n" + json.dumps(shown(mb), indent=2, sort_keys=True) + "\n```")
    print("After:\n```json\n" + json.dumps(shown(ma), indent=2, sort_keys=True) + "\n```")
