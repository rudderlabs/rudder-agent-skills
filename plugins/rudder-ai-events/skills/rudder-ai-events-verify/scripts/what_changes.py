"""Draft the Events part of `## What changes` from two captures of the same driven traffic.

Usage: what_changes.py before.jsonl after.jsonl
before: AI events switched off (the app as it was); after: AI events on.
Prints the event table (counts per capture) and, per changed event, a redacted before/after JSON pair
with the differing fields and values listed. Equal occurrences pair first, whatever their order; the rest pair in
capture order, an unmatched one with the other capture's first; the pair shown is the first that differs. Fields that differ on every run (IDs, timestamps, durations) count by presence
and type only, inside lists too. IDs, user and account IDs, on_behalf_of, emails, traits and timestamps
are redacted; check the rest before sharing.
"""
import collections
import json
import re
import sys

SDK_NAMES = {"@rudderstack/ai", "rudderstack-ai", "ai-sdk-go"}  # context.wrapperLibrary.name, as in check_events.py
BROWSER = {"ai_user_prompt_created", "ai_response_received", "ai_user_action", "ai_assistant_opened",
           "ai_assistant_closed", "ai_conversation_started", "ai_conversation_switched", "ai_conversation_renamed",
           "ai_conversation_deleted"}  # check_events.py CLIENT_COPIES | CLIENT_ONLY
DROP = {"messageId", "timestamp", "originalTimestamp", "sentAt", "receivedAt", "_metadata"}
# \Z, not $: $ also matches before a final newline
# user_id, userId, userID, ID; not isValid or VALID
ID_KEY = re.compile(r"(^|_)(id|ID)\Z|Id\Z|[a-z0-9]ID\Z|^on_behalf_of\Z|[eE]mail")
PERSONAL = {"traits"}  # identify() traits (email, name, ...) ride along in context
EMAIL = re.compile(r'[^ \t\n\r\f\v@"]+@[^ \t\n\r\f\v@"]+\.[A-Za-z0-9_]+')  # ASCII classes, as in the SDKs
VARY = re.compile(r"^(interaction_id|conversation_id|parent_interaction_id|trace_id|anonymousId|anonymous_id|sessionId)\Z"
                  # start_time, end_time (ai_otel_span) and OTLP's startTimeUnixNano vary on every run too
                  r"|_ms\Z|[Ll]atency|[Dd]uration|At\Z|_at\Z|[Tt]imestamp|(^|_)time\Z|Time(UnixNano)?\Z")


def without_otlp(m):  # OTLP attributes hold identities as key/value pairs the name-based redaction misses
    props = m.get("properties")
    if isinstance(props, dict) and "otlp" in props:
        m = {**m, "properties": {k: v for k, v in props.items() if k != "otlp"}}
    return m


def load(path):
    msgs = [json.loads(line) for line in open(path) if line.strip()]
    return [without_otlp(m) for m in msgs if m.get("type", "track") == "track" and m.get("event")]


def row_key(m):
    """Own rows for browser AI copies, legacy events with AI names, and SDK events with customer names."""
    name = m["event"]
    if (m.get("properties") or {}).get("source") == "client" and name in BROWSER:
        return name + " (browser)"
    sdk = ((m.get("context") or {}).get("wrapperLibrary") or {}).get("name") in SDK_NAMES
    reserved = name.startswith(("ai_", "mcp_"))
    if sdk and not reserved:  # a declared tool event may share a legacy event's name
        return name + " (AI SDK)"
    return name + (" (legacy)" if not sdk and reserved else "")


TIME_KEY = re.compile(r"At\Z|_at\Z|[Tt]imestamp|(^|_)time\Z|Time(UnixNano)?\Z")  # the timestamp part of VARY


def redact(value, key=""):
    scalar = value is not None and not isinstance(value, (dict, list))
    if key in PERSONAL or (scalar and (ID_KEY.search(key) or TIME_KEY.search(key))):
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
        path = prefix + k.replace("\\", "\\\\").replace(".", "\\.")  # a literal dot is not nesting
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
        # Compare every occurrence; a change in a later turn counts too.
        diff, pair = [], (by_b[name][0], by_a[name][0])
        # equal occurrences pair first, whatever their order (concurrent jobs finish in any order);
        # the rest pair in capture order, and unmatched ones with the other side's first occurrence
        rest_b, rest_a = list(by_b[name]), []
        for m in by_a[name]:
            twin = next((i for i, o in enumerate(rest_b) if fields(o) == fields(m)), None)
            if twin is None:
                rest_a.append(m)
            else:
                rest_b.pop(twin)
        pairs = list(zip(rest_b, rest_a)) + [(by_b[name][0], m) for m in rest_a[len(rest_b):]] \
            + [(m, by_a[name][0]) for m in rest_b[len(rest_a):]]
        for mb, ma in pairs:
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
