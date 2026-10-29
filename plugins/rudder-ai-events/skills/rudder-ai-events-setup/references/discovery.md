# Discovery heuristics

Read-only. Use Glob and Grep (or `rg` / `grep -rn`) over source files; skip `node_modules/`, `.venv/`, `venv/`, `dist/`, `build/`, `.next/`, `vendor/` and lockfiles except to read resolved versions. Never open `.env*`, `*.pem`, `*.key`, secrets files or credential stores. Every finding goes into `ai-events.md` (its Config block) as a `path` plus a `symbol` (route, function, variable).

## 1. Runtimes and manifests

| Check | Where | Blocks the surface when |
|---|---|---|
| Node.js version | `engines.node` in `package.json`, `.nvmrc`, `.node-version`, `Dockerfile` `FROM node:` | below 24 (`@rudderstack/ai` needs Node.js 24+) |
| Deno version | `deno.json` / `deno.jsonc`, `.dvmrc`, `Dockerfile` `FROM denoland/deno:`; `deno --version` | Node.js floor does not apply; first instrumented PR must prove the SDK under the repo's own `deno test` |
| Python version | `requires-python` in `pyproject.toml`, `.python-version`, `runtime.txt`, `Dockerfile` `FROM python:` | below 3.12 (`rudderstack-ai` needs 3.12+) |
| Go version | the `go` line in `go.mod`, `Dockerfile` `FROM golang:` | below the `go` line of the chosen `ai-sdk-go` version's `go.mod` (v0.2.0: `go 1.26.10`); read it, never assume |
| Package manager | `package-lock.json` (npm), `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `deno.lock` (deno); `uv.lock`, `poetry.lock`, `Pipfile.lock`, `requirements*.txt`; `go.sum` | |

Manifests give a floor; the interpreter in use comes from `node --version`, `deno --version`, `.venv/bin/python --version`, `uv run python --version` or `go version` (read-only commands). Record where the version came from. For Deno, discover the selected manifest and lock settings, including a custom lockfile path or disabled locking; list only the actual files under Files to change. A blocked surface stays in the plan with `status: blocked` and the reason; do not upgrade the runtime yourself. Deno uses the Node SDK (`language: node`, `package_manager: deno`): it relies on `AsyncLocalStorage` and `node:` builtins, which Deno supports; record the exact Deno version and the repo's `deno test` command under Dependencies and blockers.

### LLM and agent libraries

Search every manifest (`package.json`, `deno.json`, `deno.jsonc`, `pyproject.toml`, `requirements*.txt`, `Pipfile`, `setup.cfg`, `go.mod`) and Deno `npm:` imports for these names. Read the resolved version from the lockfile and compare it with the supported range.

| Library | Node.js package (supported) | Python package (supported) | Integration |
|---|---|---|---|
| OpenAI | `openai` (`>=7.0.0 <8.0.0`) | `openai` (`>=2.0.0,<4`) | `wrapOpenAI` / `wrap_openai` |
| Anthropic | `@anthropic-ai/sdk` (`>=0.100.0 <1.0.0`) | `anthropic` (`>=1.0.0,<2`) | `wrapAnthropic` / `wrap_anthropic` |
| Vercel AI SDK | `ai` (`>=5.0.0 <8.0.0`) | n/a | `rudderstackMiddleware` (Node.js only) |
| LangChain, LangGraph, Deep Agents | `@langchain/core` (`>=1.2.14 <2.0.0`), `@langchain/langgraph`, `deepagents` | `langchain-core` (`>=1.2.0,<2`), `langgraph`, `deepagents` | `RudderStackCallbackHandler` |
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` (`>=0.3.142 <0.4.0`) | `claude-agent-sdk` (`>=0.2.82,<0.3`) | `trackedQuery` / `tracked_query` |
| OpenAI Agents SDK | `@openai/agents` (`>=0.20.0 <0.21.0`) | `openai-agents` (`>=0.8.4,<0.25`) | `trackedRun` / `tracked_run` |
| Google Gen AI | `@google/genai` (`>=2.0.0 <3.0.0`) | `google-genai` (`>=2.0.0,<3`) | `wrapGoogleGenAI` / `wrap_google_genai` |
| Amazon Bedrock | `@aws-sdk/client-bedrock-runtime` (`>=3.779.0 <4.0.0`) | `boto3` `bedrock-runtime` client (`>=1.37.24,<2`) | `wrapBedrock` / `wrap_bedrock` |
| LiteLLM | proxy only: `openai` client with a LiteLLM `baseURL` | `litellm` (`>=1.88.6,<2`; needs `openai<3`) | `wrapOpenAI(..., { provider: 'litellm' })` / `instrument_litellm()` |
| OpenRouter / gateways | `openai` client with a gateway `baseURL` | same | `wrapOpenAI` / `wrap_openai` with `provider` |
| MCP servers | `@modelcontextprotocol/sdk` (`>=1.31.0 <2.0.0`) or `@modelcontextprotocol/server` (`>=2.0.0 <3.0.0`) | `mcp` (`>=1.30.0,<3`: 1.x and 2.x; the standalone `fastmcp` package is not supported) | `wrapMcpServer` / `wrap_mcp_server` (section 5) |
| Anything else (Mistral, Cohere, Ollama clients, a home-grown HTTP client) | | | `interaction.recordCall()` / `record_call()` |

Go (`github.com/rudderlabs/ai-sdk-go`, one module per integration; read the version from `go.mod` / `go.sum`):

| Library | Go module (tested) | Integration |
|---|---|---|
| OpenAI (Chat Completions, Responses; gateways) | `github.com/openai/openai-go/v3` (v3.70.0) | `rudderopenai.WithTracking()` |
| Anthropic (also its Bedrock and Vertex AI clients) | `github.com/anthropics/anthropic-sdk-go` (v1.78.0) | `rudderanthropic.WithTracking()` |
| Google Gen AI (Gemini API and Vertex AI) | `google.golang.org/genai` (v1.72.0) | `ruddergenai.HTTPClient(nil)` |
| Amazon Bedrock (`Converse`, `ConverseStream`) | `github.com/aws/aws-sdk-go-v2/service/bedrockruntime` (v1.63.1) | `rudderbedrock.WithTracking()` |
| MCP servers, official SDK | `github.com/modelcontextprotocol/go-sdk` (v1.8.0) | `rudderstackai.WrapMCPServer` (section 5) |
| MCP servers, mcp-go | `github.com/mark3labs/mcp-go` (v0.55.1 or later; tested to v1.2.1) | `ruddermcpgo.WrapServer` (section 5) |
| Anything else, including the older `github.com/openai/openai-go` v1/v2, LangChainGo, agent frameworks | | `Interaction.RecordCall()` |

### Install preflight

Find what would stop the install before any code is written; record each under Dependencies and blockers and raise it before approval.

| Check | Where |
|---|---|
| Release-age gates | pnpm `minimumReleaseAge` (in minutes: `10080` is 7 days) / `minimumReleaseAgeExclude` (`pnpm-workspace.yaml`, `.npmrc`); npm `min-release-age` / `before` (`.npmrc`); uv `exclude-newer` (`pyproject.toml` `[tool.uv]`, `uv.toml`). An SDK release newer than the gate needs an exemption with a removal date. |
| Private registries and auth | `registry=` / `@scope:registry=` in `.npmrc`, `.yarnrc.yml` `npmRegistryServer`, `[[tool.uv.index]]`, `pip.conf` `index-url`, CodeArtifact login scripts (`aws codeartifact login`, `codeartifact` in `package.json` scripts or CI); Go `GOPROXY` in CI and `go env` files. The SDKs are public (npm, PyPI, proxy.golang.org); a mirror or proxy the app forces must serve them. Record the registry and how auth is obtained, never a token. |
| Peer ranges | the chosen SDK version's `peerDependencies` (`npm view @rudderstack/ai@<VERSION> peerDependencies`, from a scratch directory) against the app's resolved versions; a conflict is a blocker. Node.js 0.7.0 declares `@rudderstack/rudder-sdk-node >=3.0.16`: an older core SDK fails `npm install` with `ERESOLVE`, so plan its upgrade. For every planned framework upgrade, also read that exact version's own peers (`npm view <package>@<VERSION> peerDependencies`), then each forced dependency upgrade's peers: schema-library majors, provider SDK and MCP SDK floors can cascade. List every forced bump with its current and exact target version under Dependencies and blockers. |

A library outside its supported range is a blocker for that integration: record it and, in the one batched round, ask whether to upgrade the library or use `recordCall` / `record_call` instead. These ranges are from `@rudderstack/ai` 0.7.0, `rudderstack-ai` 0.7.0 and `ai-sdk-go` v0.3.0; for a later release, re-read its README compatibility table and trust it over this one.

## 2. Call sites to entry points

Find where clients are constructed and called:

| Pattern (regex) | Meaning |
|---|---|
| `new OpenAI\(` `new AzureOpenAI\(` `OpenAI\(` `AsyncOpenAI\(` | OpenAI client |
| `new Anthropic\(` `Anthropic\(` `AsyncAnthropic\(` `AnthropicBedrock` `AnthropicVertex` | Anthropic client |
| `streamText\(` `generateText\(` `generateObject\(` `streamObject\(` `wrapLanguageModel\(` | Vercel AI SDK |
| `ChatOpenAI\|ChatAnthropic\|ChatGoogleGenerativeAI\|init_chat_model\|createReactAgent\|create_react_agent\|StateGraph\|create_deep_agent\|createDeepAgent` | LangChain / LangGraph / Deep Agents |
| `query\(\{` with an import from `@anthropic-ai/claude-agent-sdk`; `claude_agent_sdk.query\|ClaudeSDKClient` | Claude Agent SDK |
| `new Runner\(\|Runner.run\|run\(agent` with `@openai/agents` / `agents` imports | OpenAI Agents SDK |
| `new GoogleGenAI\(\|genai.Client\(` | Google Gen AI |
| `BedrockRuntimeClient\|ConverseCommand\|client\("bedrock-runtime"\|converse\(` | Bedrock |
| `litellm.completion\|litellm.acompletion` | LiteLLM |
| Go: `openai.NewClient(` (openai-go), `anthropic.NewClient(`, `genai.NewClient(`, `bedrockruntime.NewFromConfig(\|bedrockruntime.New(` | Go provider clients |

Then walk callers up to the entry point and classify the surface:

| Entry point found | Surface | Unit |
|---|---|---|
| HTTP route that a person's UI calls: `app.post(`, `router.post(`, Next.js `route.ts` `export async function POST`, Hono/Fastify routes, FastAPI `@app.post`, Django views, Flask `@app.route`, Go `http.HandleFunc(` / `mux.HandleFunc(` / chi, gin, echo routes, WebSocket/SSE handlers | `chat` | one interaction per user turn |
| Slack bot handler answering a person who waits for the answer | `chat` | one interaction per user turn |
| Cron or scheduler (`node-cron`, `cron.schedule`, `@Cron`, `APScheduler`, `celery beat`, `schedule.every`, GitHub Actions `schedule:`), queue consumer (`bullmq Worker`, `sqs`, `kafka` consumer, `celery @task`, `rq`), webhook route called by another system, Lambda / Cloud Function `handler`, CLI script `if __name__ == "__main__"` / `bin/` scripts / Go `cmd/` binaries, Slack messages from other bots or workflow automations with no person waiting | `background` | one task per job or run (`aiTask` / `ai_task`) |
| A UI call that fires on page load or render without a typed prompt (suggestions, summaries, auto-titles) | `background` | one task per call (`trigger_source: user`) |
| A one-shot feature a person triggers with a click: generate, suggest, autofill or prefill, summarize, rewrite, translate, fix, and the structured-output routes behind them (`generateObject(`, `response_format`, `.parse(`, `with_structured_output(`, tool-forced JSON) | `chat` (one-shot) | one interaction per click, `input_method: button`, `conversation_id` = the interaction ID; plus its accept, edit, reject, regenerate and stop handlers |
| An HTTP route used by another service rather than a person | chat if a person waits for the answer, else background; ask in the one batched round (SKILL.md step 2.5) only when the code cannot tell | |

One code path can serve both (a function called from a route and from a cron): record both entry points; the interaction or task is opened at the entry point, not in the shared function.

A new chat's first message often takes another path than follow-ups: a welcome or empty-state component, a "new chat" or starter-suggestion handler, or a route that creates the conversation and answers in one call. Trace where the first message of a new chat is sent, as well as where follow-ups go, and list both entry points (and both browser handlers) under Files to change; the first turn is also where `conversation_id` may not exist yet.

One-shot features: search handler, route and component names for `generate`, `suggest`, `autofill`, `prefill`, `summari[sz]e`, `rewrite`, `translate`, `fix`, `improve`, and trace each to its model call. A person clicked and waits for the output, so it is a user turn, not `background`, even with no thread. There is no conversation: mint the ID before the interaction opens (the browser's UUID, the app's own request or output ID, or a UUID minted in the route) and plan it as both `interaction_id` and `conversation_id` (`conversation_id_source: interaction_id`); the SDKs send app-supplied IDs unchanged. Return it to the client, and list the handlers that keep, edit, discard, regenerate or stop the output (`accepted`, `edited`, `rejected`, `regenerated` actions; stop is `cancelled`) with that ID.

Human-in-the-loop: search LangGraph `interrupt(` and `Command(resume`; Claude Agent SDK `canUseTool` / `can_use_tool` permission callbacks and `PreToolUse` hooks that defer; OpenAI Agents SDK `needsApproval` / `needs_approval`, `interruptions` and `state.approve(` / `state.reject(`; Vercel AI SDK tool approval (`needsApproval`); app-built `ask_human`, `hitl` or approval tools. The integrations end these answers `paused` with `pause_reason` themselves (LangGraph `human_input`, OpenAI Agents SDK and Vercel AI SDK `approval`, a Claude Agent SDK deferred tool `deferred_tool`). A permission callback that waits in-process keeps the turn open (the wait counts in `latency_ms`); one that stops the run to ask later, an app-built pause, and every Go pause need an explicit `paused` end with `pause_reason` (`approval`, `human_input`, `auth_required`, `other`). Trace how the run resumes and plan the same `interaction_id` for it (LangGraph `interaction_id` metadata, an app-supplied ID), so the resume reports the same turn. Known limit `hitl_multi_pause` applies.

Streaming: note whether the route returns a stream (`stream: true`, `.stream(`, `streamText`, `StreamingResponse`, `res.write`, SSE). Streams need `bind()` or returning the stream from the interaction callback; in Go the stream must be read inside `RunInteraction`.

Claude Agent SDK session resume: search `resume:` / `resume=`, `continue:` / `continue_conversation`, and stored session IDs; trace the session store and whether usage snapshots survive pods or restarts. Raise one plan question: persist snapshot (recommended), mark resumed with no durable baseline (cost needs registered prices when no cached baseline exists), or in-memory only. Record the choice and sources in `surfaces[].usage_baseline_source` and the Cost section; in-memory state cannot cover another pod or a restart.

Thread pools (Python): `ThreadPoolExecutor`, `run_in_executor` inside a background job need `propagate()`.

Tool loops: when requests pass `tools`, check whether the app executes the returned tool calls and sends results back (a `role: "tool"` / `tool_result` message in a follow-up call, or a framework agent loop). If it only passes `tools` and ignores the calls, an event rule can fire only with `when: always`.

Background granularity: note what one run is (the whole cron invocation, one queue message) and whether it fans out per item (per workspace, per document). Per-item steps that report their own usage (separate tenant or `on_behalf_of`) become `child_tasks`; propose the level from the code.

Volume: estimate the AI events per turn and per run from the code: prompt and answer, browser copies, one declared tool event per matching tool call (tool loops repeat them), one child task per fanned-out item, one `ai_llm_response_received` per model call when per-call events are planned, and one `mcp_tool_called` per call on each MCP server. Flag the high-volume sources (MCP servers, fan-out, per-call events, tools called in loops) and compare with the legacy events they sit beside. The SDKs do not sample (known limit `no_sampling`): every event planned is sent.

Failures the app handles itself: for each entry point, note where it catches a failure and returns normally (empty stream, deadline, lost lease, a job runner that swallows errors) and where it already records it (log, metric, legacy `status`, app error codes). Those turns must end as failed, not `success`. Note turns that can fail before the interaction would open (validation, auth, rate limit): they send no AI event. Flag best-effort generators (titles, summaries, suggestions, structured extraction) that catch an unparseable or empty model reply and return an empty result: the model call succeeded, so without an explicit failure status the answer reports `success`; they must end with `status: error` (and an `error_type` such as `empty_response`) where they give up.

## 3. Browser client

| Look for | Pattern |
|---|---|
| RudderStack JavaScript SDK (the only browser SDK this plugin instruments) | `@rudderstack/analytics-js` in `package.json`, `rudderanalytics.load(`, `cdn.rudderlabs.com/v3`, `new RudderAnalytics(` |
| Legacy browser SDK v1.1 | `rudder-sdk-js`, `cdn.rudderlabs.com/v1.1` (cookies unsupported by the server SDKs: note it, suggest a v3 upgrade, do not do it) |
| Other analytics | `analytics.load(` (Segment), `posthog.init(`, `mixpanel.init(`, `amplitude.init(`, `gtag(` |
| Chat UI | components or templates with `chat`, `assistant`, `copilot`, `message`, `prompt` in names; `useChat(` (Vercel AI SDK UI); `fetch('/api/chat'` / EventSource / WebSocket calls to the chat route |
| Feedback and actions | thumbs up/down, `rating`, `feedback`, copy-to-clipboard (`navigator.clipboard.writeText`), share, report, regenerate/retry buttons, approval or interactive blocks the user accepts or rejects (`ai_user_action` `accepted` / `rejected`), cards, sources or links opened from an answer (click-through), and the endpoints they call; for each endpoint, whether its request already carries the answer's ID and the conversation ID (`trackAction` needs both) |
| Browser event sampling | a sample rate or `Math.random()` gate around `rudderanalytics.track` in the app's analytics module; client copies of AI events must bypass it |
| Typed tracking | RudderTyper or similar generated calls, tracking-plan catalogs, `ruddertyper.yml`, repo rules forbidding raw `track` calls; raise catalog + generated client versus raw helper in the batched questions |
| Separate backend | chat API origin, existing response/config fields and flags client; a browser-only repo names its server repo/plan dependency, `client_events.switch_source` and needed `response_changes`, with the server PR first |
| Assistant open/close, conversation list | launcher/toggle handlers, new-chat, switch, rename, delete conversation handlers |

No RudderStack JavaScript SDK on the page: the `client` surface is `status: skipped` with the reason. Do not add a browser SDK; server events still work.

Mobile apps: search `Podfile`, `Package.swift`, `build.gradle*`, `pubspec.yaml` and React Native `package.json` for RudderStack SDKs (`rudder` in the dependency name, e.g. `@rudderstack/rudder-sdk-react-native`, `rudder_sdk_flutter`) and their AI-related `track` calls. Each is a `client` surface with `status: unsupported`, reason "mobile client: no client-events recipe"; its legacy events still go under Existing AI events, and the spec-only path (SKILL.md step 2.7) applies.

## 4. Existing RudderStack clients, legacy AI events and tracing

| Look for | Pattern |
|---|---|
| Server RudderStack client (Node.js) | `@rudderstack/rudder-sdk-node`, `new Analytics(` with a write key |
| Server RudderStack client (Python) | `rudder-sdk-python`, `rudderstack.analytics`, `rudder_analytics.write_key`, `Client(write_key=` |
| Server RudderStack client (Go) | `github.com/rudderlabs/analytics-go/v4`, `analytics.NewWithConfig(` / `analytics.New(` |
| Env var names for the key and URL | the identifier passed to the client (`process.env.X`, `os.environ["X"]`, `os.Getenv("X")`): record the variable NAME only |
| Privacy or data-handling doc | `PRIVACY*`, `docs/*privacy*`, `docs/*data*`, a telemetry or analytics section in README: it must list the new fields |
| Config and flags library | how the app reads flags (env, `config`, `convict`, LaunchDarkly, `pydantic-settings`, `viper`) and whether it reloads at runtime: the two switches use it |
| Hand-built AI events | `track(` / `.track(` calls whose event name or properties mention `ai`, `llm`, `gpt`, `chat`, `prompt`, `completion`, `answer`, `assistant`, `turn`, `message`, `tokens`, `model`, `cost`, `feedback`, `agent`, `tool`, `run`, `job`, `executor`, `handoff`, `hitl`, `ask_human`, `credit`, `billing`, `instruction`, `generate`, `suggestion`, `confidence`; Segment/PostHog `capture(` calls with the same. Drop matches with no model behind them (auth tokens, payroll runs, CI jobs) |
| Generated emitters | schema-first events built from protobuf, JSON Schema, Avro or a tracking-plan catalog (versioned names such as `message.CompletedV1`, generated `track*` / `emit*` functions or event classes): search the schema files and the generated module, not only `track(` calls |
| AI events sent without a supported SDK | RudderStack Java, Ruby or PHP SDKs (`rudder` in `pom.xml`, `build.gradle*`, `Gemfile`, `composer.json`) and raw HTTP posts to the data plane (`/v1/track`, `/v1/batch`) that carry the names above: each sender is a surface with `status: unsupported` and the reason (language or raw HTTP); the spec-only path (SKILL.md step 2.7) applies |
| Tracing tools | `langfuse` (`@langfuse/*`, `langfuse`), `langsmith` (`LANGCHAIN_TRACING_V2`, `langsmith`), OpenTelemetry (`@opentelemetry/*`, `opentelemetry-*`, `NodeSDK`, `TracerProvider`), `traceloop`, `openinference`, `braintrust`, `helicone`, `@vercel/otel` |

For each hand-built AI event, record the event name, `path:line`, its properties, its `context` (a workspace in `context.groupId`, the `userId` it uses for background work, `'anonymous'` placeholders), and propose a mapping to the standard events (see `ai-events-md.md`, "Mapping hand-built events" and "Field aliases"). List every legacy field that carries raw prompts, answers, feedback text, emails or file names (`event.field`, `path:line`) as a privacy finding under Breaking and semantic changes: none of them maps to an AI event while content capture is off. Then run every check in `ai-events-md.md` ("Breaking-change checks") and read how each field is computed, not just its name. Note tracking-plan codegen (RudderTyper output, a generated `analytics` module, `ruddertyper.yml`) and the repo's event-name casing.

Cost: when a legacy event carries cost, or the app calls several models in one turn, list every model ID constant the app can send (config, env defaults, constants), Bedrock cross-region IDs with their prefix (`us.`, `us-gov.`, `eu.`, `apac.`, `jp.`, `au.`, `in.`, `global.`) included. A rate table the app already uses to compute cost supplies prices; any model without one gets a `TODO` (see `ai-events-md.md`, `spec.config.prices`). Never look rates up.

For a tracing tool, find how the current trace ID is read (`langfuse.getCurrentTraceId()`, `get_current_trace_id()`, `trace.getActiveSpan()?.spanContext().traceId`, LangSmith run tree `trace_id`) and who registers the global tracer provider (`NodeSDK`, `registerOTel`, Langfuse's own setup, `trace.set_tracer_provider`). Plan that ID as `tracing.trace_id_source`; when another exporter owns the provider, pass it directly rather than registering the SDK's span processor. It is optional and opt-in. OpenTelemetry apps: Node.js and Python fill `trace_id` from the first span inside the interaction only when the SDK's span processor is registered with `linkTraceId: true` / `link_trace_id=True` (`registerTracing` / `register_tracing`, `createSpanProcessor` / `create_span_processor`), Go with `WithTraceIDFrom(rudderotel.TraceID)`. Other tools: the app passes it (`traceId` / `trace_id` / `TraceID`), and that value always wins. No tracing tool: `tracing.tool: none`, and do not suggest adding one.

## 5. MCP servers

| SDK | Server constructor | Tools, resources, prompts | Supported |
|---|---|---|---|
| `@modelcontextprotocol/sdk` 1.x | `new McpServer(`, `new Server(` (imports from `@modelcontextprotocol/sdk/server/...`) | `server.tool("name"`, `server.registerTool("name"`, `registerResource(`, `registerPrompt(`, `setRequestHandler(CallToolRequestSchema` | `>=1.31.0 <2.0.0`; protocol up to 2025-11-25 |
| `@modelcontextprotocol/server` 2.x | `new McpServer(` from `@modelcontextprotocol/server`, often in a factory passed to `createMcpHandler(` / `serveStdio(` | as above | `>=2.0.0 <3.0.0`; also 2026-07-28 |
| Python `mcp` 2.x | `MCPServer(` from `mcp.server.mcpserver`, `Server(` from `mcp.server.lowlevel` | `@server.tool()`, `@server.resource(`, `@server.prompt(` | yes; also 2026-07-28 |
| Python `mcp` 1.x | `FastMCP(` from `mcp.server.fastmcp`, the 1.x `Server(` from `mcp.server.lowlevel` | `@mcp.tool()` (name = function name unless `name=`) | `>=1.30.0`; protocol up to 2025-11-25 |
| Python standalone `fastmcp` | `FastMCP(` from `fastmcp` | `@mcp.tool()` | no: `blocked` |
| Go `github.com/modelcontextprotocol/go-sdk` | `mcp.NewServer(` | `mcp.AddTool(server, &mcp.Tool{Name: "name"`, `server.AddResource(`, `server.AddPrompt(` | v1.8.0; also 2026-07-28 |
| Go `github.com/mark3labs/mcp-go` | `server.NewMCPServer(` | `s.AddTool(mcp.NewTool("name"` | v0.55.1 or later; 2026-07-28 on v1.x only |

For each server record, as `path` plus `symbol`:

- every endpoint that serves it (`/mcp`, `/mcp/admin`, a stdio binary), each with its own wrap and a distinct server name; name and version (the `Implementation` / constructor arguments), file, and where it connects (`server.connect(`, `server.run(`, `server.Run(`, `NewStreamableHTTPHandler`).
- session mode per endpoint: stateful (session IDs: `sessionIdGenerator`, an `Mcp-Session-Id` store) or stateless (`sessionIdGenerator: undefined`, `stateless_http=True`, go-sdk `StreamableHTTPOptions{Stateless: true}`, mcp-go `WithStateLess(true)`, or a server built per request). Stateless endpoints lose client details (Known limits).
- transport: `stdio` (`StdioServerTransport`, `run("stdio")`, `mcp.StdioTransport`), `streamable_http` (`StreamableHTTPServerTransport`, `streamable-http`, `NewStreamableHTTPHandler`), or `sse` (deprecated HTTP+SSE). Several processes or replicas behind a load balancer: note it (per-process state, see Known limits). Several distinct servers built with the same name in one process: note it; each needs a unique name (state is per server name).
- auth: the OAuth or API-key verifier (`requireBearerAuth`, `authInfo`, `TokenVerifier`, `auth.RequireBearerToken`; mcp-go: the app's own check, often `server.WithHTTPContextFunc`), which claim holds the user (usually `sub`) and which the workspace or tenant. No auth (typical for stdio): events go out as `ai_system`.
- tool, resource and prompt names, and their descriptions (inputs for the server's intent list).
- tools whose call changes data (creates, updates, sends; no `readOnlyHint: true` annotation): the default declared tool events.
- hand-built analytics already sent from handlers (`mcp_<method>_success`, raw request or result properties): legacy events to map and flag.
- elicitation calls (`elicitInput(`, `ctx.elicit(`, `session.Elicit(`, mcp-go `RequestElicitation(`), and MCP Events subscription or webhook code (experimental, off unless asked).

An app that is an MCP *client* (an agent calling MCP tools) is covered by its chat or background integration: those calls appear in `tool_breakdown` with `mcp_server` (OpenAI Agents SDK: only with its tracing on). When the agent uses the OpenAI Agents SDK and the server is also tracked, plan `rudderStackMcpToolMeta()` / `rudderstack_mcp_tool_meta()` so `mcp_tool_called` joins the calling answer. A Go agent sends `Interaction.ID()` as `com.rudderstack/interaction_id` in the request `_meta` itself.

## 6. Identity

Build this table for every entry point and endpoint, and show it before asking anything about identity:

| Entry point | Caller | Auth | `userId` today (`path:line`) | Proposed source | Tradeoff |
|---|---|---|---|---|---|
| `POST /api/chat` | web app user | session cookie | `req.user.id` (`src/middleware/auth.ts:42`) | same | none |
| `/mcp` | MCP client (IDE agent) | OAuth bearer | none: legacy sends `'anonymous'` | token `sub` | needs `identify`; stateless: no `client_name` |

Where to look:

| Need | Where to look |
|---|---|
| Server `userId` | auth middleware and handlers: `req.user`, `req.auth`, `res.locals.user`, `getServerSession(`, `auth()` (NextAuth / Clerk), `currentUser(`, `jwt.verify(`, `passport`; Python `request.user`, `Depends(get_current_user)`, `current_user` (Flask-Login), `request.state.user`; Go values the auth middleware puts on `r.Context()` |
| Account / tenant | `workspaceId`, `orgId`, `tenantId`, `accountId` on the user or request |
| Browser `anonymousId` / session | RudderStack JavaScript SDK v3 cookies `rl_anonymous_id`, `rl_session`, `rl_user_id`; same-origin requests carry them, cross-origin ones need `credentials: 'include'` and a proxy or same parent domain |
| Background jobs | who the job is for (`on_behalf_of`), which customer (`account_id`), a stable per-job or per-thread conversation key |
| Logout | does the page call `rudderanalytics.reset()` on logout? If not, `rl_user_id` can name the previous user: prefer the server's own user ID |

Identity is ambiguous when: there are two plausible user IDs (internal DB id vs auth-provider id), the chat route has no auth, the browser SDK `identify()` uses a different ID than the server or is never called (browser events then carry only `anonymousId` while server events carry `userId`; note an `identify()` call on login under Identity as a separate follow-up, do not ask), a legacy event falls back to a placeholder user (`'anonymous'`: do not carry it over; the SDK uses cookies or `ai_system`), or a background job has no clear tenant. Each ambiguity is a row in the table and a question in the one batched round (SKILL.md step 2.5); never guess.

## 7. Intent and surface sources

Channel (`surface`): web or mobile UI, Slack or Teams bot handlers, email ingestion, an app inside ChatGPT or Claude, an IDE extension, or a plain API. One route serving several channels needs the channel per request; take it from the request (header, client ID, route prefix) when the code shows one.

Attachments: upload handlers or multimodal message parts (`image_url`, `input_image`, `document`, `file` content blocks) on the chat route: plan `attachment_count` / `attachment_types`.

Intents: read, never execute: system prompts (`system:` / `role: "system"` / `SystemMessage(` / prompt template files), tool and function names and their descriptions, route names, feature flags, README and docs pages describing what the assistant does, existing support categories or enums. When the app already computes a per-turn category or outcome (a classifier call, a ticket category, a resolution flag), record where and propose reusing it (`setIntent` / `setOutcome`, or `trackScore`) as a decision from code; the classifier stays off. Never query production data, logs, transcripts or analytics to infer intents.
