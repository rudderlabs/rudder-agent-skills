# Verification kit

Everything here runs locally, without provider keys and without sending anything to RudderStack. Put the scripts and captures in a scratch directory outside the repo (for example `$TMPDIR/ai-events-verify/`), never in the user's source tree.

## 1. Schemas

The AI events schema ships inside the npm package (the Python wheel does not include it):

| App | Get `ai-events-v0.2.schema.json` |
|---|---|
| Node.js, after install | `node_modules/@rudderstack/ai/spec/ai-events-v0.2.schema.json` |
| Any (no Node.js needed) | download `https://registry.npmjs.org/@rudderstack/ai/-/ai-0.4.0.tgz` and extract `package/spec/ai-events-v0.2.schema.json` (`tar -xzf ai-0.4.0.tgz package/spec/ai-events-v0.2.schema.json`) |

Client events: copy the JSON block under "Schema" in the `rudder-ai-instrument` skill's `references/client-events.md` into `ai-client-events.schema.json`.

## 2. Capture events

Pick the first option that fits; record which one in the report.

### A. Stub client in a test (fastest)

Point `configure()` at an in-memory client in a test or a small harness script, run one chat turn, one feedback call and one background run, then write the captured messages as JSON lines.

Node.js:

```ts
import { writeFileSync } from 'node:fs';
import { configure, flush } from '@rudderstack/ai';

const events: unknown[] = [];
configure({ analytics: { track: (message: unknown) => void events.push(message), flush: async () => {} } });
// ...drive the app: call the route handler (supertest) or the functions behind it...
await flush();
writeFileSync(process.env.CAPTURE_FILE ?? 'events.jsonl', events.map((e) => JSON.stringify(e)).join('\n') + '\n');
```

Python:

```python
import json
import rudderstack.ai


class StubClient:
    def __init__(self) -> None:
        self.events: list[dict] = []

    def track(self, **message) -> None:  # the rudder-sdk-python track() keyword arguments
        self.events.append(message)

    def flush(self) -> None:
        pass


stub = StubClient()
rudderstack.ai.configure(analytics=stub)
# ...drive the app: TestClient / Django test client, or call the job function...
rudderstack.ai.flush()
with open("events.jsonl", "w") as f:
    for e in stub.events:
        f.write(json.dumps(e, default=str) + "\n")
```

The app's `configure()` call may run at import and replace the stub: call the stub `configure()` after importing the app module (it changes only the keys passed).

### B. Local mock data plane and mock model (no code changes)

Runs the app as is, with its real RudderStack client and real provider SDK pointed at localhost. Save as `mock_server.py` and run it with any Python 3.9+ (stdlib only):

```python
"""Mock RudderStack data plane and OpenAI/Anthropic endpoints. Writes every tracked message to events.jsonl."""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OUT = sys.argv[2] if len(sys.argv) > 2 else "events.jsonl"


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("content-length") or 0))
        body = json.loads(raw or b"{}")
        if self.path.endswith("/v1/batch"):  # RudderStack data plane
            with open(OUT, "a") as f:
                for message in body.get("batch", []):
                    f.write(json.dumps(message) + "\n")
            return self._json(200, {})
        if self.path.endswith("/chat/completions"):  # OpenAI Chat Completions (non-streaming)
            return self._json(200, {
                "id": "chatcmpl-mock", "object": "chat.completion", "created": 0, "model": body.get("model", "mock"),
                "choices": [{"index": 0, "finish_reason": "stop",
                             "message": {"role": "assistant", "content": "Mock answer."}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15},
            })
        if self.path.endswith("/v1/messages"):  # Anthropic Messages (non-streaming)
            return self._json(200, {
                "id": "msg_mock", "type": "message", "role": "assistant", "model": body.get("model", "mock"),
                "content": [{"type": "text", "text": "Mock answer."}], "stop_reason": "end_turn",
                "stop_sequence": None, "usage": {"input_tokens": 12, "output_tokens": 3},
            })
        return self._json(404, {"error": f"mock has no route {self.path}"})

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8787), Handler).serve_forever()
```

Start it (`python3 mock_server.py 8787 events.jsonl`), then start the app with, for this shell only: the plan's data plane URL variable set to `http://127.0.0.1:8787`, its write key variable set to any placeholder such as `local-test`, `OPENAI_BASE_URL=http://127.0.0.1:8787/v1` or `ANTHROPIC_BASE_URL=http://127.0.0.1:8787`, and the provider key variable set to a placeholder such as `test`. Never put these in `.env`. Streaming routes, tool loops and other providers need the app's own test doubles (option A).

Send a sample request (`curl -s -X POST localhost:<port>/api/chat -H 'content-type: application/json' -H 'x-interaction-id: <uuid>' -d '{...}'`), a feedback request, and trigger a background run. Stop the app gracefully (SIGTERM) so its shutdown flush runs; the RudderStack clients batch for a few seconds.

### C. RudderStack Live Events (end to end)

Point the app at a development source, trigger the same requests, and inspect them in the source's Live Events view, or through the RudderStack MCP server (`rudder-mcp-workflow`). Use a dev workspace or source, never production.

## 3. Validate

Save as `check_events.py`; run it with Python 3.10+ in a throwaway virtualenv that has `jsonschema==4.26.0`:

```python
"""Check captured AI events: spec schema, client schema, joins, counts, content and identity."""
import argparse
import collections
import json
import sys

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SPEC_EVENTS = {"ai_user_prompt_created", "ai_response_received", "ai_user_action",
               "ai_interaction_classified", "ai_llm_response_received"}
CLIENT_ONLY = {"ai_assistant_opened", "ai_assistant_closed", "ai_conversation_started",
               "ai_conversation_switched", "ai_conversation_renamed", "ai_conversation_deleted"}
CONTENT = {"prompt_text", "response_text", "intent_summary"}

p = argparse.ArgumentParser()
p.add_argument("events")
p.add_argument("--spec", required=True)
p.add_argument("--client-schema")
p.add_argument("--capture-content", action="store_true", help="the plan sets capture_content: true")
p.add_argument("--expect-legacy", action="append", default=[], help="legacy event names that must still be sent")
args = p.parse_args()

spec = json.load(open(args.spec))
registry = Registry().with_resource(spec["$id"], Resource.from_contents(spec))
client = json.load(open(args.client_schema)) if args.client_schema else None
if client:
    registry = registry.with_resource(client["$id"], Resource.from_contents(client))


def validator(schema, name):
    return Draft202012Validator({"$ref": f"{schema['$id']}#/$defs/{name}"}, registry=registry)


problems, notes = [], []
messages = [json.loads(line) for line in open(args.events) if line.strip()]
tracks = [m for m in messages if m.get("type", "track") == "track" and m.get("event")]
by_interaction = collections.defaultdict(lambda: collections.Counter())
conversations = collections.defaultdict(set)
names = collections.Counter(m["event"] for m in tracks)

for i, m in enumerate(tracks):
    name, props = m["event"], m.get("properties") or {}
    user = m.get("userId") or m.get("user_id")
    anon = m.get("anonymousId") or m.get("anonymous_id")
    is_client = props.get("source") == "client"
    is_declared = not name.startswith("ai_") and "tool_status" in props
    where = f"#{i} {name}"
    if not (name.startswith("ai_") or is_declared):
        continue  # not an AI event (legacy or other analytics)
    if not user and not anon and not is_client:
        problems.append(f"{where}: no userId or anonymousId")
    if name in CLIENT_ONLY and not is_client:
        problems.append(f"{where}: client-only event without source: client")
    if is_client and client:
        problems += [f"{where} (client schema): {e.message}" for e in validator(client, name).iter_errors(props)] \
            if name in client["$defs"] else [f"{where}: not a client event name"]
    if name in SPEC_EVENTS or is_declared:
        problems += [f"{where} (spec): {e.message}" for e in
                     validator(spec, "declared_tool_event" if is_declared else name).iter_errors(props)]
        if not is_client:
            w = (m.get("context") or {}).get("wrapperLibrary") or {}
            if w.get("specVersion") != "0.2.0":
                problems.append(f"{where}: context.wrapperLibrary.specVersion is {w.get('specVersion')!r}")
    if not args.capture_content:
        leaked = CONTENT & props.keys() | ({"feedback_text"} & (props.get("action_details") or {}).keys())
        if leaked:
            problems.append(f"{where}: content sent with capture off: {sorted(leaked)}")
    if props.get("trigger") == "system" and user:
        problems.append(f"{where}: system-triggered event carries userId {user!r}")
    iid = props.get("interaction_id")
    if iid:
        by_interaction[iid][(name, "client" if is_client else "server")] += 1
        if props.get("conversation_id"):
            conversations[iid].add(props["conversation_id"])

for iid, c in by_interaction.items():
    responses = c[("ai_response_received", "server")] + c[("ai_response_received", "client")]
    prompts = c[("ai_user_prompt_created", "server")] + c[("ai_user_prompt_created", "client")]
    if responses > 1:
        problems.append(f"interaction {iid}: {responses} ai_response_received (expected 1)")
    if prompts > 1:
        problems.append(f"interaction {iid}: {prompts} ai_user_prompt_created (expected at most 1)")
    if prompts and not responses:
        problems.append(f"interaction {iid}: prompt without ai_response_received")
    for action in ("ai_user_action",):
        if c[(action, "server")] and c[(action, "client")]:
            notes.append(f"interaction {iid}: ai_user_action from both server and client; check they are different actions")
    if (c[("ai_user_action", "server")] or c[("ai_user_action", "client")]) and not responses:
        notes.append(f"interaction {iid}: ai_user_action for an answer not in this capture")
    if len(conversations[iid]) > 1:
        problems.append(f"interaction {iid}: several conversation_id values {sorted(conversations[iid])}")

for legacy in args.expect_legacy:
    if not names[legacy]:
        problems.append(f"legacy event {legacy} was not sent (it must keep sending during migration)")

print("events:", dict(names))
print("interactions:", len(by_interaction))
for n in notes:
    print("note:", n)
for pr in problems:
    print("FAIL:", pr)
print("RESULT:", "FAIL" if problems else "PASS")
sys.exit(1 if problems else 0)
```

```text
python3 -m venv $TMPDIR/ai-events-verify/.venv
$TMPDIR/ai-events-verify/.venv/bin/pip install jsonschema==4.26.0
$TMPDIR/ai-events-verify/.venv/bin/python check_events.py events.jsonl \
  --spec ai-events-v0.2.schema.json --client-schema ai-client-events.schema.json \
  --expect-legacy chatTurnCompleted
```

Add `--capture-content` only when the plan turns capture on. Browser events captured from a browser test (stubbing `window.rudderanalytics.track` and recording `{event, properties}`) can be appended to the same file.

## 4. Checklist

| Check | Pass when |
|---|---|
| Schema | every AI event passes its spec definition; client events pass the client schema |
| One answer per turn | each `interaction_id` has exactly one `ai_response_received` and at most one `ai_user_prompt_created` |
| Joins | prompt, answer, actions and declared tool events of a turn share `interaction_id` and `conversation_id`; the browser-minted ID (when used) equals the server's |
| Identity | chat events carry the planned `userId` and, with the browser SDK, the cookie `anonymousId` and `context.sessionId`; background events have no `userId` and carry `account_id` / `on_behalf_of` when planned |
| Content | no `prompt_text`, `response_text`, `feedback_text` or `intent_summary` unless the plan turns capture on |
| Counted once | no call reported by two integrations (one answer per turn, not one per model call); the browser never repeats a server event |
| Background | one `ai_response_received` per run with `trigger: system`, `task_name`, `trigger_source`; nested steps carry `parent_interaction_id` |
| Flush | a script or job run delivers its events before exit |
| Legacy | each legacy event still sends while its flag is on |
| Optional | `trace_id` when tracing is planned; declared tool events per `event_rules`; `ai_interaction_classified` when the classifier is on |
