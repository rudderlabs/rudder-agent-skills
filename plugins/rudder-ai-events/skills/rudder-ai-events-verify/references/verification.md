# Verification kit

Plan values below (surfaces, `capture_content`, `switches`, legacy events, event rules, MCP servers, `prices`, `unpriced_models`) come from the fenced `yaml` block under `## Config` in `ai-events.md`.

Everything runs locally, without provider keys and without sending anything to RudderStack. Work in a scratch directory outside the repo (for example `$TMPDIR/ai-events-verify/`), never in the user's source tree. The kit ships with this skill:

| File | Use |
|---|---|
| `scripts/check_events.py` | validates a capture (section 3) |
| `scripts/what_changes.py` | drafts the `## What changes` events table and before/after pairs (section 5) |
| `scripts/mock_server.py` | mock data plane and mock OpenAI / Anthropic (option B) |
| `scripts/recorder.mjs`, `scripts/recorder.py`, `scripts/recorder.go` | stub RudderStack clients that append every message to a JSONL file (option A) |
| `assets/ai-client-events.schema.json` | client-event schema, the single source of truth (`rudder-ai-events-instrument` points here) |

Copy `scripts/` and `assets/` into the scratch directory. Create the checker's environment with uv (system `python3` with `pip` is often missing or externally managed):

```text
uv venv -p 3.12 $TMPDIR/ai-events-verify/.venv
uv pip install -p $TMPDIR/ai-events-verify/.venv/bin/python jsonschema==4.26.0
```

Without uv, any Python 3.10 or later `-m venv` works. `mock_server.py` and `what_changes.py` need only the standard library.

## 1. Schemas

`ai-events-v0.3.schema.json` ships in the npm package and the Go module (not in the Python wheel). Read it as a file; it is not an importable export. It covers the chat, background and `mcp_*` events and the client copies' fields. `<VERSION>` is the version the plan pins (`spec.sdks[].version`); without a Node.js or Go app, resolve the latest from a scratch directory (`npm view @rudderstack/ai version`; inside a repo, `devEngines` can fail it with `EBADDEVENGINES`). A version without `spec/ai-events-v0.3.schema.json` is too old.

| App | Get the schema |
|---|---|
| Node.js, after install | copy `node_modules/@rudderstack/ai/spec/ai-events-v0.3.schema.json` |
| Go, after `go get` | copy `$(go env GOMODCACHE)/github.com/rudderlabs/ai-sdk-go@<VERSION>/spec/ai-events-v0.3.schema.json` |
| Python, or any app (one download from the public npm registry; use the `@rudderstack/ai` release with the same spec version, 0.6.0 or later) | `curl -sSLo ai.tgz https://registry.npmjs.org/@rudderstack/ai/-/ai-<VERSION>.tgz`, then `tar -xzf ai.tgz --strip-components=2 package/spec/ai-events-v0.3.schema.json` |

## 2. Capture events

Choose one and record it in the report:

| App has | Use |
|---|---|
| A test runner that can call its routes or job functions (supertest, `TestClient`, Django test client, pytest, `go test`) | A, as a new test or a harness |
| No tests, or a script/cron job, or routes that are hard to call in-process | B |
| A RudderStack development source | C, after A or B passes |

Drive, per planned surface (skip what the app does not have):

- chat: one turn, a second turn in the same conversation, one feedback action, and with `interaction_id_source: client` one turn with an invalid `x-interaction-id`;
- an app-detected failure: one turn or run the app catches itself and returns normally from (empty stream, deadline, lost lease, a job runner that swallows errors). Note its interaction ID for `--failed-interaction`;
- background: one full run;
- client: the planned browser events, driven with the interaction ID the server returned (below);
- event rules: one turn that calls each ruled tool; scores: one `trackScore` / `track_score` or an evaluator run;
- MCP servers: section D;
- switches: the same traffic again with `spec.switches.ai_events_env` off (`before.jsonl`), and once with `legacy_events_env` off. Set them for that command only.

### A. Stub client

Make the recorder the app's own RudderStack client before the app wires it: replace the client where the app builds it (its factory, module or dependency injection; in tests, the existing mock or override for that client), so the app's `configure()`, its switches and its legacy calls all go through the recorder. Calling `configure()` with a recorder after the app starts would replace the AI switch's no-op client and miss legacy calls. Drive the surfaces, then flush. The recorders write each message as it arrives, so a crash still leaves a capture. The model still needs a stand-in: the app's existing test doubles, or the mock model in option B through the provider's base URL variable.

- Node.js: `import { recorder } from '<scratch>/scripts/recorder.mjs'`, then `configure({ analytics: recorder('<scratch>/events.jsonl') })`; `await flush()` at the end.
- Python: run from the scratch directory with the app's environment (`env PYTHONPATH=<repo>:<scratch>/scripts uv --directory <repo> run python <scratch>/harness.py`), then `from recorder import Recorder` and `rudderstack.ai.configure(analytics=Recorder("<scratch>/events.jsonl"))`; `rudderstack.ai.flush()` at the end.
- Go: copy `scripts/recorder.go` into the harness or test package, change its `package` clause, then `rec, _ := NewRecorder("<scratch>/events.jsonl")`, `rudderstackai.Configure(rudderstackai.WithAnalytics(rec))` (MCP: the wrapper's `Analytics` option); `rudderstackai.Flush(ctx)` and `rec.Close()` at the end. Remove the copied file afterwards. It needs `github.com/rudderlabs/analytics-go/v4`, already in the module graph through `ai-sdk-go`.

`check_events.py` reads the Node.js, Python (`user_id` / `anonymous_id`) and data plane message shapes.

### B. Mock data plane and mock model (no code changes)

Runs the app as is, with its real RudderStack client and real provider SDK pointed at localhost.

1. Start it in the background: `python3 <scratch>/scripts/mock_server.py 8787 <scratch>/events.jsonl`.
2. Run the app from its usual working directory (static files and relative paths depend on it), with variables set for that command only, never in `.env`. Without a `cd`, use the package manager's directory flag: `env NAME=value ... npm --prefix <repo> start`, `env NAME=value ... uv --directory <repo> run python -m <module>`, `env NAME=value ... go -C <repo> run ./cmd/<app>`. Variables:
   - the plan's data plane URL variable: `http://127.0.0.1:8787`; its write key variable: `local-test`
   - OpenAI: `OPENAI_BASE_URL=http://127.0.0.1:8787/v1`, `OPENAI_API_KEY=test`; Anthropic: `ANTHROPIC_BASE_URL=http://127.0.0.1:8787`, `ANTHROPIC_API_KEY=test`
   - `RUDDERSTACK_AI_DEBUG=1` to log anything the SDK drops; Python: `PYTHONUNBUFFERED=1` so output survives a background run
3. Drive it:
   - Server: send requests with a user, an interaction ID and browser cookies. The SDK reads cookies only in the JavaScript SDK's encoding (URL-encoded JSON or `RS_ENC_v3_`), for example:
     `curl -s -X POST http://localhost:<port>/api/chat -H 'content-type: application/json' -H 'x-interaction-id: 3b9e5d0a-7c2f-4e18-9a6b-2c4d6e8f0a1b' -H 'cookie: rl_anonymous_id=%22anon-123%22; rl_session=%7B%22id%22%3A1760500000000%2C%22expiresAt%22%3A4102444800000%7D' -d '{"message":"Where is my order?"}'`
   - Script or cron job: run it to completion; a top-level task flushes before exit.
4. Stop a server gracefully so its shutdown flush runs: `kill -TERM <pid>` (find it with `lsof -ti tcp:<port> -sTCP:LISTEN`), then wait a few seconds; the RudderStack clients send in batches.

To exercise an OpenAI event rule, send a prompt containing `call:<tool name>` (for example `call:create_ticket`): the mock answers with that tool call when the request lists the tool. Streaming routes, multi-step tool loops and other providers need the app's own test doubles (option A).

### C. Live Events (end to end)

Point the app at a development source in the user's RudderStack workspace, send the same requests, and watch them arrive in that source's Live Events view. A RudderStack MCP server or workflow skill, if the user has one installed, can read the same events. Never a production source.

### D. MCP servers

Capture with A (the recorder as the wrapper's `analytics`) or B (the server's real RudderStack client pointed at the mock). Drive the server with a real MCP client, over the transport and session mode it runs in production (`mcp.servers[].transport`, `session_mode`; stateless included): an in-process test transport hides what a real client sends. Use the client SDK the repo already has, from the scratch directory:

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

Python servers: the same with `mcp.ClientSession` over `stdio_client` / `streamablehttp_client`, passing `meta=` on `call_tool`. Go servers (go-sdk or mcp-go): either client against the built binary or the HTTP endpoint. Drive: one `tools/list`, one valid call per planned declared tool event, one invalid call, a second client name if the plan expects several, and (when planned) a `request_capability` call, a resource read, a prompt get and an elicitation. Stop the server so it flushes.

Protocol: 2026-07-28 needs a client and a server that speak it (Node.js `@modelcontextprotocol/server` 2.x, Python `mcp` 2.x, go-sdk v1.8, mcp-go v1.x); with Node.js `@modelcontextprotocol/sdk` 1.x or Python `mcp` 1.x on either side, only the handshake revisions (2025-06-18, 2025-11-25) can be checked. On 2026-07-28 each request carries its client in `_meta`, `mcp_client_seen` follows the first successful request, and there is no `mcp_session_id`. On a stateless endpoint (or a server built per request) with a handshake revision, `client_name`, `client_version` and `mcp_session_id` are absent: known limit `mcp_stateless_no_client`, reported, not failed. Report the `mcp client_name:` line either way.

### Browser events

Record what the page sends by replacing the SDK with a recorder before the page script runs (a browser test, or Node.js with stubbed `window`/`document` globals importing the page script):

```js
const captured = [];
window.rudderanalytics = { track: (event, properties) => captured.push({ type: 'track', event, properties }) };
// ...click through: open the assistant, send a message, copy, give feedback, open a card, close...
// then write captured as JSON lines and append them to events.jsonl
```

Drive the page against the server that answers it, so the browser's actions use the interaction ID the server returned. A stubbed `fetch` that invents IDs hides join bugs; use one only for pages with no server turn. In Node.js the page's `fetch` sends no browser cookies: wrap it to add the test `cookie` header so turns pass `--expect-session`, or check sessions on the curl turns only.

## 3. Validate

```text
$TMPDIR/ai-events-verify/.venv/bin/python scripts/check_events.py events.jsonl \
  --spec ai-events-v0.3.schema.json --client-schema assets/ai-client-events.schema.json \
  --feature support_bot --surface web --user-id demo_user_1 --expect-session --expect-joins \
  --feedback-endpoint web:feedback_given --expect-legacy chatTurnCompleted \
  --failed-interaction <id of the app-detected failure> \
  --mcp-server docs-server --mcp-intent search_docs --mcp-intent read_page
```

Pass only the flags that apply:

| Flag | When |
|---|---|
| `--capture-content` | the plan turns capture on |
| `--feature`, `--surface` | once per planned feature and channel |
| `--user-id`, `--expect-session` | the requests carried a user and cookies: prompts and answers carry that `userId` and a session; server feedback that carries a `userId` carries that one |
| `--mcp-user-id <id>` | the MCP client was driven as a known authenticated subject: every MCP event carries it as `userId`; no session is expected |
| `--mcp-anonymous` | the MCP server runs without auth (stdio): every MCP event carries no `userId` and `anonymousId: ai_system`. Not with `--mcp-user-id` |
| `--expect-joins` | the browser was driven with the server's IDs: every client/server gap, either way (a prompt, answer or feedback `ai_user_action` on one side only), and every action, score, classification, per-call `ai_llm_response_received` or declared tool event with no captured answer, fails instead of being a note; background runs are exempt |
| `--client-surface <surface>` | once per surface with a browser client: only its turns need client copies, so a server-only surface (API, mobile backend) in the same capture is not reported for missing ones |
| `--client-opt-out <copy>` | `client_prompt`, `client_response`, `client_feedback` or `server_feedback` listed in the plan's `client_events.opt_out`: that copy is not expected, and fails if sent. Pass one per opted-out copy so only approved omissions are exempt |
| `--feedback-endpoint [<surface>:]<action_type>` | per `action_type` in the plan's `surfaces[].feedback`, prefixed with that surface's `surface` value when the capture has several: each browser copy of it on that surface's turns needs a server copy. An action type the server sends on a surface's turns is checked the same way there; others (`clicked_through`, browser-only `copied_response`) need no server copy. With both copies expected, each turn needs as many client as server copies of each action |
| `--failed-interaction <id>` | per app-detected failure driven: its server answer must not be `success` |
| `--expect-legacy <event>` | per planned legacy event; also names a legacy event that uses an `ai_*` name |
| `--mcp-server`, `--mcp-intent` | per planned server name, and per entry of its `request_context.intents` (without `other`) |
| `--no-ai-events` | the capture with `ai_events_env` off: no AI SDK event and no browser AI event (`source: client`, names from the client schema) may appear (pair it with `--expect-legacy`) |
| `--absent <event>` | the capture with `legacy_events_env` off: per legacy event; counts only legacy sends (no `context.wrapperLibrary`, not a browser AI copy), so an AI event with the same name does not fail it |

Server events without `context.wrapperLibrary` were not sent by the AI SDK: the checker skips them, counts them as legacy, and fails one that uses an AI event name unless `--expect-legacy` names it. An SDK-sent event with a customer name is checked as a declared tool event (`tool_name` and `tool_status` required); an SDK-sent `ai_*` or `mcp_*` name outside the spec fails as misspelled. The `run:` lines list each background answer; compare them with the plan's `task_name`, `trigger_source`, `conversation_id_source`, `account_id_source`, `on_behalf_of_source` and `child_tasks`. The `mcp call:` lines list each tool call, marked `joined` when its `interaction_id` matches a captured answer.

## 4. Cost check

List every model ID constant the app can send (grep the source and config; include each Bedrock geo-prefixed form it builds) and call the SDK's estimator after `configure()` with the plan's `prices`. No prices ship with the SDKs. For each ID in `unpriced_models` (known limit `prices_missing`), register a dummy price first (`inputPerMtok: 1, outputPerMtok: 1`), so the cost path is checked without real rates; never fail it for the missing rate. Node.js, from the app's environment:

```ts
import { estimateCost, registerPrice } from '@rudderstack/ai';
registerPrice('claude-haiku-4-5', { inputPerMtok: 1, outputPerMtok: 1 }); // dummy, per unpriced_models entry
// provider as captured in usage_breakdown[].provider, e.g. aws.bedrock, anthropic, openai
const ids: [string, string][] = [['aws.bedrock', 'us.anthropic.claude-haiku-4-5-20251001-v1:0'] /* , ... */];
for (const [provider, model] of ids) console.log(provider, model, estimateCost(provider, model, 1000, 100) ?? 'UNPRICED');
```

Python: `register_price(model, input_per_mtok=1, output_per_mtok=1)`, then `estimate_cost(provider, model, 1000, 100)` returns `None` when unpriced; Go: `WithPrices` on `Configure`, then `EstimateCost(provider, model, 1000, 100, 0, 0)` returns `ok == false`. Any `UNPRICED` ID is a FAIL. For `aws.bedrock` the SDKs strip the cross-region inference profile prefix (`us.`, `us-gov.`, `eu.`, `apac.`, `jp.`, `au.`, `in.`, `global.`) and then the vendor prefix before matching; versions before 0.6.0 miss some of these, so an unpriced geo-prefixed ID there means upgrading.

## 5. What changes

After the first PASS, rebuild the plan's `## What changes` from what was captured, as a block for the PR body:

```text
python3 scripts/what_changes.py before.jsonl events.jsonl
```

`before.jsonl` is the same traffic with `ai_events_env` off. The script prints the events table (`new`, `changed`, `unchanged`, `removed`, with counts; browser copies, legacy events that use an `ai_*` or `mcp_*` name (`(legacy)`), and AI SDK events with a customer name (`(AI SDK)`, declared tool events) on their own rows) and, per changed event, one redacted before/after JSON pair with the differing fields and their before and after values listed. A value change counts (status, model, cost); fields that differ on every run (interaction, conversation and session IDs, `anonymousId`, timestamps, durations and latency) count only when added, removed or retyped. IDs, user and account IDs, `on_behalf_of`, emails, `traits` and timestamps are redacted; check the remaining values before sharing. Add the "When it fires" column and the other five parts (code touched, identity, data that leaves the app, impact, switch off and roll back) from the plan, corrected by what the capture showed.

## 6. Checklist

| Check | Pass when |
|---|---|
| Schema | every AI and MCP event passes its v0.3 definition and carries `specVersion: 0.3.0` and a `context.wrapperLibrary.name` of `@rudderstack/ai`, `rudderstack-ai` or `ai-sdk-go`; client events also pass the client schema |
| One answer per turn | each `interaction_id` has exactly one server `ai_response_received` and at most one server `ai_user_prompt_created`; with a client surface, at most one client copy of each |
| Joins | prompt, answer, actions and declared tool events of a turn share `interaction_id` and `conversation_id`; the browser, driven with the server's returned ID, uses it for its copies and actions (`--expect-joins`) |
| Identity | chat events carry the planned `userId` and, with cookies, `anonymousId` and `context.sessionId`; background events have no `userId` and carry `account_id` / `on_behalf_of` where planned |
| Content | no `prompt_text`, `response_text` or `feedback_text` unless the plan turns capture on; `intent_summary` only when the plan's classifier sets `intent_summary: true` (the checker does not gate it on capture) |
| Counted once | no call reported by two integrations (one final answer per turn, not one per model call; a `paused` answer may precede the resumed one under the same `interaction_id`); browser copies carry `source: client` and no generation details (model, tokens, cost, `trace_id`) |
| Client copies | unless the plan opts out: each driven turn has a client prompt and answer copy, and each feedback click both a server and a client `ai_user_action`; a click-through is a client `ai_user_action` with `clicked_through` and no URL |
| Background | one `ai_response_received` per run and per planned child task, with `trigger: system`, `task_name`, `trigger_source`; children carry the parent's ID as `parent_interaction_id`; a parent with zero tokens is expected when all calls happen in children |
| App-detected failures | a failure the app catches and returns from reports `error`, `timeout`, `cancelled` or `incomplete` with an `error_type`, never `success` (`--failed-interaction`) |
| Flush | a script or job run delivers its events before exit |
| Switches | `ai_events_env` off: no AI event, server or browser, legacy events unchanged (`--no-ai-events`); `legacy_events_env` off: no legacy event, AI events unchanged (`--absent`) |
| Legacy | each legacy event still sends, unchanged unless `## Breaking and semantic changes` says otherwise, while its switch is on |
| Scoping | `surface` on chat and client events matches the plan; `feature` too, except server `ai_user_action` |
| MCP | driven by a real client in the production session mode; one `mcp_client_seen` per client per run; one `mcp_tool_called` per call with `server_name`, `tool_status` and, on errors, `error_type`; `client_name` present, or absent as known limit `mcp_stateless_no_client`; `call_index` from 0 with no gaps per `mcp_session_id`, else `interaction_id` (a 2026-07-28 elicitation retry keeps its leg's index); `request_context` in each listed tool schema but never in `argument_keys` of a call that records `intent`, `user_sentiment` or `call_reason` (a tool that declares its own `request_context` keeps it: a note), compared as a set; `intent` from the plan's list or `other`; no argument values, results, URIs or tokens; `identify` puts the authenticated subject in `userId` and the workspace in `account_id` (stdio without auth: no `userId`, `anonymousId: ai_system`); a call sent with `_meta` `com.rudderstack/interaction_id` carries that ID; declared tool events per the server's `event_rules`, also for a call that failed validation (`tool_status: error`) |
| Statuses | a stopped or cut-off run reports `cancelled`, `paused` with `pause_reason`, or `incomplete` with `error_type` as planned; a closed request reports `client_disconnected: true` where the plan's `client_disconnect` is not `none` |
| Models | `primary_provider` and `usage_breakdown[].provider` use `openai`, `anthropic`, `aws.bedrock`, `gcp.gemini`, `gcp.vertex_ai`, `azure.ai.openai` or the gateway's vendor; `requested_model` only where the served model differs (a dated snapshot is the same model) and only from integrations that set it (OpenAI, Anthropic, Google Gen AI, the Vercel AI SDK, LiteLLM, manual calls); on Anthropic models through Bedrock or Vertex AI IDs it is a known false positive, not a failure |
| Cost | every model ID the app can send is priced, `unpriced_models` with dummy prices (section 4); captured answers carry `total_cost_usd` where the plan has prices |
| New tests | the server-side tests `rudder-ai-events-instrument` added exist, assert the captured AI events, and pass with the full suite |
| Breaking and semantic changes | what was captured matches `## Breaking and semantic changes`: event volume and coverage (which turns emit, background vs user), casing and request or response changes as stated; anything unlisted is a FAIL |
| Page-load calls | a call that fires on page load or render without a typed prompt is a background run (`trigger: system`, no `ai_user_prompt_created`), not a user prompt |
| Optional | `trace_id` only when tracing is planned (span processor with `linkTraceId: true` / `link_trace_id=True` in Node.js/Python, `rudderotel` in Go, or the app's own value); declared tool events per `event_rules`; `ai_interaction_classified` when the classifier is on; `ai_interaction_scored` when scores are planned |

A row is `n/a` only when the app has no surface it applies to. Page-load is `n/a` only when no surface is triggered from a UI; with a UI, load the page without typing and capture what it sends.

## 7. Common failures

| Finding | Usual cause |
|---|---|
| Several `ai_response_received` for one turn | model calls outside `aiInteraction` / `ai_interaction` / `RunInteraction` (Go: a call made with a context that is not the interaction's), a stream not returned or bound, a Python thread pool without `propagate`, a LangChain handler on the model constructor |
| `ai_user_action` without a matching answer | the client sent a different ID than the server used; check the `x-interaction-id` hand-off |
| App-detected failure reported as `success` | the entry point catches the failure and returns normally without `end({ status, errorType })` (Python `end(status=..., error_type=...)`, Go `End(EndOptions{...})`) inside the callback |
| AI events with the AI switch off | the switch is read after `configure()`, or one entry point builds its own client; browser AI events: `trackAi` does not read the switch the server exposes to the page |
| `prompt_text` / `response_text` present | `captureContent` on, globally or per interaction |
| `userId` on a background run | `aiTask` / `ai_task` / `RunTask` not used, or a plain interaction opened inside the job |
| No events from a script or job | no flush before exit: Node.js / Python `flush()` or `shutdown()`, Go `Flush(ctx)` or `Shutdown(ctx)` and then `client.Close()`; a `false` result means a client did not finish in time (10 s by default) |
| No `total_cost_usd` | expected without prices or a provider-reported cost; with prices, one call in the turn used a model ID with no price (often a Bedrock geo-prefixed ID, see section 4) |
| `estimateCost` returns nothing for a model ID | no registered price for it, even after the SDK strips the Bedrock profile and vendor prefix; or the check used a different provider name than the events carry |
| `ai_user_prompt_created` with no typed prompt | a suggestion or summary call that fires on page load is wrapped as a chat interaction instead of a background task |
| Legacy and AI events disagree beyond the plan | a field compared by name, not meaning (cumulative vs per-turn cost, requested vs served model, latency start, status vocabulary); add the row to `## Breaking and semantic changes` |
| Legacy event missing | its switch defaulting to off, or the old call was removed |
| Hand-built `ai_*` event without `wrapperLibrary` | a legacy event with an AI event name: pass `--expect-legacy` for it and list it in the plan |
| Server answer with no client copy | the answer copy is not sent on every final state (error, stop), or a sampling wrapper or ad blocker dropped it; in production it can also mean the user left: the server answer then has `client_disconnected: true` (not detectable on Django or Flask) |
| `specVersion` is `0.2.0` or `provider` is `google` / `google.vertex` | an SDK older than the plan pins: reinstall at the planned version |
| `trace_id` missing | expected without a tracing source; with OpenTelemetry planned: the SDK's span processor is not registered, or registered without `linkTraceId: true` / `link_trace_id=True` (Node.js, Python), `WithTraceIDFrom(rudderotel.TraceID)` is missing (Go), or no span started inside the interaction |
| `response_text` or breakdown entries missing on a large answer | the event exceeded 30,000 bytes of properties: the SDK drops captured text first, then `tool_breakdown` / `usage_breakdown` entries |
| No `mcp_*` events | `wrapMcpServer` / `wrap_mcp_server` / `WrapMCPServer` / `ruddermcpgo.WrapServer` called after the server connected, a server factory returning unwrapped servers, a different server instance wrapped, or the process exited before its client flushed |
| No `client_name` on MCP events | a stateless endpoint or per-request server on a handshake revision (known limit `mcp_stateless_no_client`); on 2026-07-28 each request carries its client |
| `request_context` in `argument_keys`, or a tool fails on it | the tool already declares a `request_context` argument (the wrapper then leaves it alone), or the server is on an unsupported MCP SDK |
| `tool_breakdown` MCP entries without `mcp_server` | OpenAI Agents SDK tracing is off: the server name comes from its function spans |
| No `mcp_event_delivered` | the delivery had no `subscription_id` or `event_id` and was dropped (one warning per process); Node.js and Python send a missing `event_name` as `unknown`, Go drops it too |
| `mcp_tool_called` not joined to an answer | the calling agent sends no `_meta` `com.rudderstack/interaction_id` (expected for hosted MCP tools) |
| Several `mcp_client_seen` for one client | several server processes or a restart (state is per server name, per process) |
| MCP counters or `mcp_client_seen` shared across endpoints | two endpoints wrapped with the same server name: give each its own |
| Feedback on one side only | the browser handler or the endpoint's `trackAction` is missing, and the plan does not opt that side out |
| Mock data plane captures nothing, app logs connection resets | the mock cannot read the gzip batch (use `mock_server.py` as shipped), or the app exited before its batch was sent |
| No `anonymousId` / `context.sessionId` from test cookies | cookie values not in the JavaScript SDK's encoding (`RUDDERSTACK_AI_DEBUG=1` logs "unreadable cookie"); Go: the request not passed to `WithValues` / `InteractionOptions.Request` |
