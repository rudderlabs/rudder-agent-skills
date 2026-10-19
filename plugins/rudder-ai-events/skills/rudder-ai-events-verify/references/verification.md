# Verification kit

Plan values below (surfaces, `capture_content`, legacy events, event rules, MCP servers) come from the fenced `yaml` block under `## Config` in `ai-events.md`.

Everything here runs locally, without provider keys and without sending anything to RudderStack. Put the scripts and captures in a scratch directory outside the repo (for example `$TMPDIR/ai-events-verify/`), never in the user's source tree. Python: the mock server runs on 3.9+, `check_events.py` needs 3.10+ (use any such interpreter; it does not have to be the app's).

## 1. Schemas

The AI events schema ships inside the npm package and the Go module (the Python wheel does not include it). Read it as a file; it is not an importable export. It covers the chat, background and `mcp_*` events and the client copies' fields.

`<VERSION>` is `@rudderstack/ai` 0.5.0 or later, the same one the plan pins for Node.js (any language's app can use it here); for Go, the plan's `ai-sdk-go` version (v0.1.0 or later). The schema is byte-identical in all three SDKs' repositories. 0.4.0 ships `ai-events-v0.2.schema.json` only; a missing v0.3 file means that version is too old.

| App | Get `ai-events-v0.3.schema.json` |
|---|---|
| Node.js, after install | copy `node_modules/@rudderstack/ai/spec/ai-events-v0.3.schema.json` |
| Go, after `go get` | copy `$(go env GOMODCACHE)/github.com/rudderlabs/ai-sdk-go@<VERSION>/spec/ai-events-v0.3.schema.json` |
| Any (no Node.js needed; one download from the npm registry) | `curl -sSLo ai.tgz https://registry.npmjs.org/@rudderstack/ai/-/ai-<VERSION>.tgz`, then `tar -xzf ai.tgz package/spec/ai-events-v0.3.schema.json` |

Client events: copy the JSON block under "Schema" in the `rudder-ai-events-instrument` skill's `references/client-events.md` into `ai-client-events.schema.json`.

## 2. Capture events

Choose one and record it in the report:

| App has | Use |
|---|---|
| A test runner that can call its routes or job functions (supertest, `TestClient`, Django test client, pytest) | A, as a new test or a harness |
| No tests, or a script/cron job, or routes that are hard to call in-process | B |
| A RudderStack development source and permission to use it | C, after A or B passes |

What to drive, per planned surface: chat: one turn (and a second turn in the same conversation), one feedback action, and with `interaction_id_source: client` one turn with an invalid `x-interaction-id`; background: one full run; client: the planned browser events, including the client copies of a turn and its feedback; event rules: one turn that calls each ruled tool; scores: one `trackScore` / `track_score` or an evaluator run; MCP servers: section D. Skip what the app does not have.

### A. Stub client

Point `configure()` at an in-memory client after importing the app (its own `configure()` may run at import; a later call changes only the keys passed), drive the surfaces, then write the messages as JSON lines. The model still needs a stand-in: the app's existing test doubles, or the mock model in option B through the provider's base URL variable.

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

Python (run from the scratch directory with the app's environment, for example `env PYTHONPATH=<repo> uv --directory <repo> run python <scratch>/harness.py`):

```python
import json
import rudderstack.ai


class StubClient:
    def __init__(self) -> None:
        self.events: list[dict] = []

    def track(self, **message) -> None:  # rudder-sdk-python keyword arguments: user_id, anonymous_id, event, ...
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

Go: implement `analytics.Client` (`Enqueue(msg analytics.Message) error` collecting `analytics.Track` values, `Close() error`) and pass it to `rudderstackai.Configure(rudderstackai.WithAnalytics(stub))` or the MCP wrapper's `Analytics`; write each `Track` as JSON with `userId`, `anonymousId`, `event`, `properties` and `context`. Easier for most Go apps: option B, since `analytics-go` posts to the mock data plane unchanged.

Stub messages use `user_id` / `anonymous_id` (Python) or the SDK's message shape (Node.js); `check_events.py` reads both, and the data plane shape.

### B. Local mock data plane and mock model (no code changes)

Runs the app as is, with its real RudderStack client and real provider SDK pointed at localhost. Save as `mock_server.py`:

```python
"""Mock RudderStack data plane and OpenAI/Anthropic endpoints. Writes every tracked message to events.jsonl."""
import gzip
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
        try:
            if self.headers.get("content-encoding") == "gzip":  # both RudderStack server SDKs gzip batches
                raw = gzip.decompress(raw)
            body = json.loads(raw or b"{}")
        except Exception as exc:  # always answer, so a bad body never leaves the app retrying
            print(f"mock: unreadable body on {self.path}: {exc}", file=sys.stderr)
            return self._json(200, {})
        if self.path.endswith("/v1/batch"):  # RudderStack data plane
            with open(OUT, "a") as f:
                for message in body.get("batch", []):
                    f.write(json.dumps(message) + "\n")
            return self._json(200, {})
        if self.path.endswith("/chat/completions"):  # OpenAI Chat Completions (non-streaming)
            tools = [t["function"]["name"] for t in body.get("tools", []) if t.get("type") == "function"]
            last = str((body.get("messages") or [{}])[-1].get("content", ""))
            call = next((name for name in tools if f"call:{name}" in last), None)
            if call:  # a prompt containing "call:<tool>" gets a tool call, to exercise event_rules
                return self._json(200, {
                    "id": "chatcmpl-mock-tool", "object": "chat.completion", "created": 0,
                    "model": body.get("model", "mock"),
                    "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {
                        "role": "assistant", "content": None, "tool_calls": [{
                            "id": "call_mock_1", "type": "function",
                            "function": {"name": call, "arguments": json.dumps({"priority": "high"})}}]}}],
                    "usage": {"prompt_tokens": 12, "completion_tokens": 5, "total_tokens": 17},
                })
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

1. Start it in the background: `python3 mock_server.py 8787 events.jsonl`.
2. Run the app from its usual working directory (static files and relative paths depend on it), with variables set for that command only, never in `.env`. Without a `cd`, use the package manager's directory flag: `env NAME=value ... npm --prefix <repo> start`, `env NAME=value ... uv --directory <repo> run python -m <module>`. Variables:
   - the plan's data plane URL variable: `http://127.0.0.1:8787`; its write key variable: `local-test`
   - OpenAI: `OPENAI_BASE_URL=http://127.0.0.1:8787/v1`, `OPENAI_API_KEY=test`; Anthropic: `ANTHROPIC_BASE_URL=http://127.0.0.1:8787`, `ANTHROPIC_API_KEY=test`
   - `RUDDERSTACK_AI_DEBUG=1` (Node.js) to log anything the SDK drops; Python: `PYTHONUNBUFFERED=1` so output survives a background run
3. Drive it:
   - Server: send requests with a user, an interaction ID and browser cookies. The SDK reads cookies only in the JavaScript SDK's encoding (URL-encoded JSON or `RS_ENC_v3_`), so use, for example:
     `curl -s -X POST http://localhost:<port>/api/chat -H 'content-type: application/json' -H 'x-interaction-id: 3b9e5d0a-7c2f-4e18-9a6b-2c4d6e8f0a1b' -H 'cookie: rl_anonymous_id=%22anon-123%22; rl_session=%7B%22id%22%3A1760500000000%2C%22expiresAt%22%3A4102444800000%7D' -d '{"message":"Where is my order?"}'`
   - Script or cron job: run it to completion; a top-level task flushes before exit.
4. Stop a server gracefully so its shutdown flush runs: `kill -TERM <pid>` (find it with `lsof -ti tcp:<port> -sTCP:LISTEN`), then wait a few seconds; the RudderStack clients send in batches.

To exercise an OpenAI event rule, send a prompt containing `call:<tool name>` (for example `call:create_ticket`): the mock answers with that tool call when the request lists the tool. Streaming routes, multi-step tool loops and other providers need the app's own test doubles (option A).

### C. RudderStack Live Events (end to end)

Point the app at a development source, trigger the same requests, and inspect them in the source's Live Events view, or through the RudderStack MCP server (`rudder-mcp-workflow`). Use a dev workspace or source, never production.

### D. MCP servers

Capture with A (pass the stub as `analytics` to `wrapMcpServer` / `wrap_mcp_server`) or B (the server's real RudderStack client pointed at the mock; Go's `analytics-go` posts gzip batches to `/v1/batch` like the others). Then drive the server with an MCP client from the SDK the repo already has, in the scratch directory:

```ts
// Node.js, @modelcontextprotocol/sdk client; stdio shown, StreamableHTTPClientTransport for HTTP servers
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'ai-events-verify', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['<repo>/dist/mcp/server.js'], env: { ...process.env } }));
const { tools } = await client.listTools(); // request_context must appear in each tool's input schema
await client.callTool({
  name: tools[0].name,
  arguments: { /* valid arguments */ request_context: { intent: 'other', user_sentiment: 'neutral' } },
  _meta: { 'com.rudderstack/interaction_id': '3b9e5d0a-7c2f-4e18-9a6b-2c4d6e8f0a1b' }, // joins a captured answer
});
await client.callTool({ name: tools[0].name, arguments: {} }); // invalid arguments: error, invalid_arguments names only
await client.close();
```

Python servers: the same with `mcp.ClientSession` over `stdio_client` / `streamablehttp_client`, passing `meta=` on `call_tool`. Go servers (go-sdk or mcp-go): either client against the built binary or the HTTP endpoint. Drive: one `tools/list`, one valid call per planned declared tool event, one invalid call, a second client name if the plan expects several, and (when planned) a `request_capability` call, a resource read, a prompt get and an elicitation. Stop the server so it flushes. The 2026-07-28 protocol needs a client and a server that speak it: Node.js `@modelcontextprotocol/server` 2.x, Python `mcp` 2.x, go-sdk v1.8 or mcp-go v1.x; with Node.js `@modelcontextprotocol/sdk` 1.x or Python `mcp` 1.x on either side, only the handshake revisions (2025-06-18, 2025-11-25) can be checked (setup skill, Known limits). On 2026-07-28 `mcp_client_seen` follows the first successful request, and there is no `mcp_session_id`.

### Browser events

Record what the page sends by replacing the SDK with a recorder before the page script runs (a browser test, or Node.js with stubbed `window`/`document` globals importing the page script):

```js
const captured = [];
window.rudderanalytics = { track: (event, properties) => captured.push({ event, properties }) };
// ...click through: open the assistant, send a message, copy, give feedback, open a card, close...
// then write captured as JSON lines and append them to events.jsonl
```

In Node.js the page's `fetch` sends no browser cookies: either stub `fetch` (then the harness's actions refer to answers not in the capture, which `check_events.py` notes as expected), or wrap it to add the test `cookie` header so harness turns pass `--expect-session`. Otherwise run `check_events.py` without `--expect-session` for harness turns and check sessions on the curl turns.

## 3. Validate

Save as `check_events.py`; run it in a throwaway virtualenv that has `jsonschema==4.26.0`:

```python
"""Check captured AI events: spec schema, client schema, joins, counts, identity, background, MCP and content."""
import argparse
import collections
import json
import sys

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SPEC_VERSION = "0.3.0"
SDK_NAMES = {"@rudderstack/ai", "rudderstack-ai", "ai-sdk-go"}  # context.wrapperLibrary.name: Node.js, Python, Go
SPEC_EVENTS = {"ai_user_prompt_created", "ai_response_received", "ai_user_action", "ai_interaction_classified",
               "ai_interaction_scored", "ai_llm_response_received"}
CLIENT_COPIES = {"ai_user_prompt_created", "ai_response_received", "ai_user_action"}
CLIENT_ONLY = {"ai_assistant_opened", "ai_assistant_closed", "ai_conversation_started",
               "ai_conversation_switched", "ai_conversation_renamed", "ai_conversation_deleted"}
MCP_EVENTS = {"mcp_client_seen", "mcp_tool_called", "mcp_elicitation_completed", "mcp_capability_requested",
              "mcp_resource_read", "mcp_prompt_used", "mcp_event_subscription_changed", "mcp_event_delivered"}
CONTENT = {"prompt_text", "response_text", "intent_summary", "explanation", "call_reason", "capability_detail"}
RAW_MCP = {"arguments", "args", "params", "result", "results", "content", "structuredContent", "uri", "request"}

p = argparse.ArgumentParser()
p.add_argument("events")
p.add_argument("--spec", required=True, help="ai-events-v0.3.schema.json")
p.add_argument("--client-schema")
p.add_argument("--capture-content", action="store_true", help="the plan sets capture_content: true")
p.add_argument("--expect-legacy", action="append", default=[], help="legacy event that must still be sent")
p.add_argument("--feature", action="append", default=[], help="allowed feature values (the plan's surfaces)")
p.add_argument("--surface", action="append", default=[], help="allowed surface values (the plan's surfaces)")
p.add_argument("--user-id", help="userId expected on user-triggered server events that carry one")
p.add_argument("--expect-session", action="store_true", help="user-triggered server events carry context.sessionId")
p.add_argument("--mcp-server", action="append", default=[], help="allowed server_name values (the plan's MCP servers)")
p.add_argument("--mcp-intent", action="append", default=[], help="allowed request_context intents (other is implied)")
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
by_interaction = collections.defaultdict(collections.Counter)
conversations = collections.defaultdict(set)
names = collections.Counter(m["event"] for m in tracks)
clients_seen = collections.Counter()
runs, tool_calls = [], []

for i, m in enumerate(tracks):
    name, props = m["event"], m.get("properties") or {}
    user = m.get("userId") or m.get("user_id")
    anon = m.get("anonymousId") or m.get("anonymous_id")
    context = m.get("context") or {}
    w = context.get("wrapperLibrary") or {}
    is_client = props.get("source") == "client"
    is_mcp = name in MCP_EVENTS or w.get("integration") == "mcp"
    is_declared = not name.startswith(("ai_", "mcp_")) and "tool_status" in props
    where = f"#{i} {name}"
    if not (name.startswith(("ai_", "mcp_")) or is_declared):
        continue  # not an AI event (legacy or other analytics)
    if not user and not anon and not is_client:
        problems.append(f"{where}: no userId or anonymousId")
    if name in CLIENT_ONLY and not is_client:
        problems.append(f"{where}: client-only event without source: client")
    if is_client and client:
        problems += [f"{where} (client schema): {e.message}" for e in validator(client, name).iter_errors(props)] \
            if name in client["$defs"] else [f"{where}: not a client event name"]
    definition = ("mcp_declared_tool_event" if is_mcp else "declared_tool_event") if is_declared else name
    if name in SPEC_EVENTS | MCP_EVENTS or is_declared:  # client copies: spec and client schema
        if is_client and name not in CLIENT_COPIES:
            problems.append(f"{where}: source: client on an event the browser never sends")
        problems += [f"{where} (spec): {e.message}" for e in validator(spec, definition).iter_errors(props)]
        if not is_client and w.get("specVersion") != SPEC_VERSION:
            problems.append(f"{where}: context.wrapperLibrary.specVersion is {w.get('specVersion')!r}")
        if not is_client and w.get("name") not in SDK_NAMES:
            problems.append(f"{where}: context.wrapperLibrary.name is {w.get('name')!r}, not one of {sorted(SDK_NAMES)}")
    # trackAction takes no feature, so server ai_user_action has none; MCP events have none either
    if args.feature and not is_mcp and (is_client or name != "ai_user_action") and props.get("feature") not in args.feature:
        problems.append(f"{where}: feature {props.get('feature')!r} not in {args.feature}")
    system = props.get("trigger") == "system"
    if args.surface and not system and (is_client or name in CLIENT_COPIES) and props.get("surface") not in args.surface:
        problems.append(f"{where}: surface {props.get('surface')!r} not in {args.surface}")
    if not args.capture_content:
        leaked = CONTENT & props.keys() | ({"feedback_text"} & (props.get("action_details") or {}).keys())
        if leaked:
            problems.append(f"{where}: content sent with capture off: {sorted(leaked)}")
    if system and user:
        problems.append(f"{where}: system-triggered event carries userId {user!r}")
    if not system and not is_client and name in {"ai_user_prompt_created", "ai_response_received"}:
        if args.user_id and user and user != args.user_id:
            problems.append(f"{where}: userId {user!r}, expected {args.user_id!r}")
        if args.expect_session and not context.get("sessionId"):
            problems.append(f"{where}: no context.sessionId (cookies not read?)")
    if system and name == "ai_response_received":
        if not props.get("task_name"):
            notes.append(f"{where}: system answer without task_name (a call outside any interaction or task?)")
        runs.append(props)
    if is_mcp:
        leaked = RAW_MCP & props.keys()
        if leaked:
            problems.append(f"{where}: raw MCP payload keys {sorted(leaked)}")
        if args.mcp_server and props.get("server_name") not in args.mcp_server:
            problems.append(f"{where}: server_name {props.get('server_name')!r} not in {args.mcp_server}")
        if "request_context" in (props.get("argument_keys") or []):
            problems.append(f"{where}: request_context reached the tool (argument_keys)")
        if args.mcp_intent and "intent" in props and props["intent"] not in args.mcp_intent + ["other"]:
            problems.append(f"{where}: intent {props['intent']!r} not in the server's list")
        if name == "mcp_client_seen":
            clients_seen[(props.get("server_name"), props.get("client_name"), props.get("oauth_client_id"), user)] += 1
        if name == "mcp_tool_called":
            tool_calls.append(props)
        continue  # MCP interaction_id joins the calling answer; it is not an answer of its own
    iid = props.get("interaction_id")
    if iid:
        by_interaction[iid][(name, "client" if is_client else "server")] += 1
        if props.get("conversation_id"):
            conversations[iid].add(props["conversation_id"])

# Server rows are the counted ones; client copies (source: client) sit alongside them, one per side.
has_client_copies = any(c[("ai_response_received", "client")] or c[("ai_user_prompt_created", "client")]
                        for c in by_interaction.values())
for iid, c in by_interaction.items():
    for side in ("server", "client"):
        if c[("ai_response_received", side)] > 1:
            problems.append(f"interaction {iid}: {c[('ai_response_received', side)]} {side} ai_response_received (expected 1)")
        if c[("ai_user_prompt_created", side)] > 1:
            problems.append(f"interaction {iid}: {c[('ai_user_prompt_created', side)]} {side} ai_user_prompt_created (expected at most 1)")
    if c[("ai_user_prompt_created", "server")] and not c[("ai_response_received", "server")]:
        problems.append(f"interaction {iid}: server prompt without a server ai_response_received")
    if has_client_copies and iid not in {r.get("interaction_id") for r in runs}:  # gaps: expected only where the harness skipped a side, else a lost event
        if c[("ai_user_prompt_created", "client")] and not c[("ai_user_prompt_created", "server")]:
            notes.append(f"interaction {iid}: client prompt with no server prompt (request never reached the SDK)")
        if c[("ai_response_received", "server")] and not c[("ai_response_received", "client")]:
            notes.append(f"interaction {iid}: server answer with no client copy (not shown, client left, or client event lost)")
    responses = c[("ai_response_received", "server")] + c[("ai_response_received", "client")]
    for event in ("ai_user_action", "ai_interaction_scored"):
        if (c[(event, "server")] or c[(event, "client")]) and not responses:
            notes.append(f"interaction {iid}: {event} for an answer not in this capture")
    if len(conversations[iid]) > 1:
        problems.append(f"interaction {iid}: several conversation_id values {sorted(conversations[iid])}")

for r in runs:
    parent = r.get("parent_interaction_id")
    if parent and parent not in by_interaction:
        notes.append(f"task {r.get('task_name')}: parent_interaction_id {parent} not in this capture")
    print("run:", {k: r.get(k) for k in ("task_name", "trigger_source", "trigger_event_id", "conversation_id", "account_id",
                                          "on_behalf_of", "parent_interaction_id", "llm_call_count", "total_tokens")})

for key, count in clients_seen.items():
    if count > 1:
        notes.append(f"mcp_client_seen {key}: {count} times in one window (several processes, or a restart?)")
for t in tool_calls:
    joined = t.get("interaction_id") in by_interaction
    print("mcp call:", {k: t.get(k) for k in ("server_name", "client_name", "protocol_version", "tool_name", "tool_status",
                                               "error_type", "intent", "user_sentiment")}, "joined" if joined else "")

for legacy in args.expect_legacy:
    if not names[legacy]:
        problems.append(f"legacy event {legacy} was not sent (it must keep sending during migration)")

print("events:", dict(names))
print("sdks:", dict(collections.Counter((m.get("context") or {}).get("wrapperLibrary", {}).get("name") for m in tracks
                                       if (m.get("properties") or {}).get("source") != "client" and (m.get("context") or {}).get("wrapperLibrary"))))
print("interactions:", len(by_interaction))
for n in notes:
    print("note:", n)
for pr in problems:
    print("FAIL:", pr)
print("RESULT:", "FAIL" if problems else "PASS")
sys.exit(1 if problems else 0)
```

```text
<python3.10+> -m venv $TMPDIR/ai-events-verify/.venv
$TMPDIR/ai-events-verify/.venv/bin/pip install jsonschema==4.26.0
$TMPDIR/ai-events-verify/.venv/bin/python check_events.py events.jsonl \
  --spec ai-events-v0.3.schema.json --client-schema ai-client-events.schema.json \
  --feature support_bot --surface web --user-id demo_user_1 --expect-session --expect-legacy chatTurnCompleted \
  --mcp-server docs-server --mcp-intent search_docs --mcp-intent read_page
```

Pass only the flags that apply: `--capture-content` when the plan turns capture on; `--feature` once per planned feature; `--surface` once per planned channel; `--mcp-server` per planned server name and `--mcp-intent` per entry of its `request_context.intents` (without `other`); `--user-id` / `--expect-session` when the test requests carried a user and cookies; `--expect-legacy` per planned legacy event. The `run:` lines list each background answer; compare them with the plan's `task_name`, `trigger_source`, `conversation_id_source`, `account_id_source`, `on_behalf_of_source` and `child_tasks`. The `mcp call:` lines list each tool call, marked `joined` when its `interaction_id` matches a captured answer.

## 4. Cost check

When `## Cost` lists prices or legacy events carried cost: list every model ID constant the app can send (grep the source and config; include each Bedrock geo-prefixed form it builds) and call the SDK's estimator after `configure()` with the app's prices. Node.js, from the app's environment:

```ts
import { estimateCost } from '@rudderstack/ai';
// provider as captured in usage_breakdown[].provider, e.g. aws.bedrock, anthropic, openai
const ids: [string, string][] = [['aws.bedrock', 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'] /* , ... */];
for (const [provider, model] of ids) console.log(provider, model, estimateCost(provider, model, 1000, 100) ?? 'UNPRICED');
```

Python: `rudderstack.ai.estimate_cost(provider, model, 1000, 100)` returns `None` when unpriced; Go: `rudderstackai.EstimateCost(provider, model, 1000, 100, 0, 0)` returns `ok == false`. Any `UNPRICED` ID is a FAIL.

## 5. Checklist

| Check | Pass when |
|---|---|
| Schema | every AI and MCP event passes its v0.3 definition and carries `specVersion: 0.3.0` and a `context.wrapperLibrary.name` of `@rudderstack/ai`, `rudderstack-ai` or `ai-sdk-go`; client events also pass the client schema |
| One answer per turn | each `interaction_id` has exactly one server `ai_response_received` and at most one server `ai_user_prompt_created`; with a client surface, at most one client copy of each |
| Joins | prompt, answer, actions and declared tool events of a turn share `interaction_id` and `conversation_id`; the ID the client uses for actions equals the server's (`client`: the browser-minted one, an invalid one replaced by the returned ID; `app`: the app's per-answer ID; `sdk`: the returned ID) |
| Identity | chat events carry the planned `userId` and, with cookies, `anonymousId` and `context.sessionId`; background events have no `userId` and carry `account_id` / `on_behalf_of` where planned |
| Content | no `prompt_text`, `response_text`, `feedback_text` or `intent_summary` unless the plan turns capture on |
| Counted once | no call reported by two integrations (one answer per turn, not one per model call); browser copies carry `source: client` and no generation details (model, tokens, cost, `trace_id`) |
| Client copies | unless the plan opts out: each driven turn has a client prompt and answer copy, and each feedback click both a server and a client `ai_user_action`; a click-through is a client `ai_user_action` with `clicked_through` and no URL |
| Background | one `ai_response_received` per run and per planned child task, with `trigger: system`, `task_name`, `trigger_source`; children carry the parent's ID as `parent_interaction_id`; a parent with zero tokens is expected when all calls happen in children |
| Flush | a script or job run delivers its events before exit |
| Legacy | each legacy event still sends, unchanged, while its flag is on |
| Scoping | `surface` on chat and client events matches the plan; `feature` too, except server `ai_user_action` |
| MCP | one `mcp_client_seen` per client per run; one `mcp_tool_called` per call with `server_name`, `tool_status` and, on errors, `error_type`; `call_index` from 0 with no gaps per `mcp_session_id`, else `interaction_id` (a 2026-07-28 elicitation retry keeps its leg's index); `request_context` in each listed tool schema but never in `argument_keys`, compared as a set (order is unspecified); `intent` from the plan's list or `other`; no argument values, results, URIs or tokens; `identify` puts the OAuth subject in `userId` and the workspace in `account_id` (stdio without auth: `ai_system`); a call sent with `_meta` `com.rudderstack/interaction_id` carries that ID; declared tool events per the server's `event_rules`, also for a call that failed validation (`tool_status: error`) |
| Statuses | a stopped or cut-off run reports `cancelled`, `paused` with `pause_reason`, or `incomplete` with `error_type` as planned; a closed request reports `client_disconnected: true` where the plan's `client_disconnect` is not `none` |
| Models | `primary_provider` and `usage_breakdown[].provider` use `openai`, `anthropic`, `aws.bedrock`, `gcp.gemini`, `gcp.vertex_ai`, `azure.ai.openai` or the gateway's vendor; `requested_model` only where the served model differs (a dated snapshot is the same model) and only from integrations that set it (OpenAI, Anthropic, Google Gen AI, the Vercel AI SDK, LiteLLM, manual calls); on Anthropic models through Bedrock or Vertex AI IDs it is a known false positive, not a failure |
| Cost | every model ID the app can send has a price (section 4); captured answers carry `total_cost_usd` where the plan expects cost |
| New tests | the server-side tests `rudder-ai-events-instrument` added exist, assert the captured AI events, and pass with the full suite |
| Breaking and semantic changes | what was captured matches `## Breaking and semantic changes`: legacy events still flow with the legacy flag on, event volume and coverage (which turns emit, background vs user), casing and request or response changes as stated; anything unlisted is a FAIL |
| Page-load calls | a call that fires on page load or render without a typed prompt is a background run (`trigger: system`, no `ai_user_prompt_created`), not a user prompt |
| Optional | `trace_id` only when tracing is planned (span processor with `linkTraceId: true` / `link_trace_id=True` in Node.js/Python, `rudderotel` in Go, or the app's own value); declared tool events per `event_rules`; `ai_interaction_classified` when the classifier is on; `ai_interaction_scored` when scores are planned |

Rows for surfaces the app does not have are `n/a` in the report.
