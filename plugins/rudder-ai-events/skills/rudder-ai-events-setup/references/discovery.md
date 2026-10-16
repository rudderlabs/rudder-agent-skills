# Discovery heuristics

Read-only. Use Glob and Grep (or `rg` / `grep -rn`) over source files; skip `node_modules/`, `.venv/`, `venv/`, `dist/`, `build/`, `.next/`, `vendor/` and lockfiles except to read resolved versions. Never open `.env*`, `*.pem`, `*.key`, secrets files or credential stores. Every finding goes into `ai-events.yaml` as a `path` plus a `symbol` (route, function, variable).

## 1. Runtimes and manifests

| Check | Where | Blocks the surface when |
|---|---|---|
| Node.js version | `engines.node` in `package.json`, `.nvmrc`, `.node-version`, `Dockerfile` `FROM node:` | below 24 (`@rudderstack/ai` needs Node.js 24+) |
| Python version | `requires-python` in `pyproject.toml`, `.python-version`, `runtime.txt`, `Dockerfile` `FROM python:` | below 3.12 (`rudderstack-ai` needs 3.12+) |
| Go version (MCP servers only) | the `go` line in `go.mod`, `Dockerfile` `FROM golang:` | below 1.27 (`github.com/rudderlabs/ai-sdk-go` needs 1.27+) |
| Package manager | `package-lock.json` (npm), `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`; `uv.lock`, `poetry.lock`, `Pipfile.lock`, `requirements*.txt`; `go.sum` | |

Manifests give a floor; the interpreter in use comes from `node --version`, `.venv/bin/python --version`, `uv run python --version` or `go version` (read-only commands). Record where the version came from. A blocked surface stays in the plan with `status: blocked` and the reason; do not upgrade the runtime yourself.

### LLM and agent libraries

Search every manifest (`package.json`, `pyproject.toml`, `requirements*.txt`, `Pipfile`, `setup.cfg`, `go.mod`) for these names. Read the resolved version from the lockfile and compare it with the supported range.

| Library | Node.js package (supported) | Python package (supported) | Integration |
|---|---|---|---|
| OpenAI | `openai` (`>=7.0.0 <8.0.0`) | `openai` (`>=2.0.0,<4`) | `wrapOpenAI` / `wrap_openai` |
| Anthropic | `@anthropic-ai/sdk` (`>=0.100.0 <1.0.0`) | `anthropic` (`>=1.0.0,<2`) | `wrapAnthropic` / `wrap_anthropic` |
| Vercel AI SDK | `ai` (`>=5.0.0 <8.0.0`) | n/a | `rudderstackMiddleware` (Node.js only) |
| LangChain, LangGraph, Deep Agents | `@langchain/core` (`>=1.2.14 <2.0.0`), `@langchain/langgraph`, `deepagents` | `langchain-core` (`>=1.2.0,<2`), `langgraph`, `deepagents` | `RudderStackCallbackHandler` |
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` (`>=0.3.142 <0.4.0`) | `claude-agent-sdk` (`>=0.2.82,<0.3`) | `trackedQuery` / `tracked_query` |
| OpenAI Agents SDK | `@openai/agents` (`>=0.20.0 <0.21.0`) | `openai-agents` (`>=0.8.4,<0.24`) | `trackedRun` / `tracked_run` |
| Google Gen AI | `@google/genai` (`>=2.0.0 <3.0.0`) | `google-genai` (`>=2.0.0,<3`) | `wrapGoogleGenAI` / `wrap_google_genai` |
| Amazon Bedrock | `@aws-sdk/client-bedrock-runtime` (`>=3.779.0 <4.0.0`) | `boto3` `bedrock-runtime` client (`>=1.37.24,<2`) | `wrapBedrock` / `wrap_bedrock` |
| LiteLLM | proxy only: `openai` client with a LiteLLM `baseURL` | `litellm` (`>=1.88.6,<2`; needs `openai<3`) | `wrapOpenAI(..., { provider: 'litellm' })` / `instrument_litellm()` |
| OpenRouter / gateways | `openai` client with a gateway `baseURL` | same | `wrapOpenAI` / `wrap_openai` with `provider` |
| MCP servers | `@modelcontextprotocol/sdk` (`>=1.31.0 <2.0.0`; the 2.x `@modelcontextprotocol/server` packages are not supported) | `mcp` v2 (`mcp==2.2.0` in the `mcp` extra; `mcp` 1.x and the standalone `fastmcp` package are not supported) | `wrapMcpServer` / `wrap_mcp_server` (section 5) |
| MCP servers in Go | `github.com/modelcontextprotocol/go-sdk` (v1.8) | | `rudderstackai.WrapMCPServer` (section 5); `github.com/mark3labs/mcp-go` is not supported: `status: blocked` |
| Go model calls | `github.com/openai/openai-go`, `github.com/anthropics/anthropic-sdk-go` | | no chat SDK for Go: record, mark `status: unsupported` |
| Anything else (Mistral, Cohere, Ollama clients, a home-grown HTTP client) | | | `interaction.recordCall()` / `record_call()` |

A library outside its supported range is a blocker for that integration: record it and ask the user whether to upgrade the library or use `recordCall` / `record_call` instead. These ranges are from the spec v0.3 SDK branches; once the release is out, re-read its README compatibility table and trust it over this one.

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

Then walk callers up to the entry point and classify the surface:

| Entry point found | Surface | Unit |
|---|---|---|
| HTTP route that a person's UI calls: `app.post(`, `router.post(`, Next.js `route.ts` `export async function POST`, Hono/Fastify routes, FastAPI `@app.post`, Django views, Flask `@app.route`, WebSocket/SSE handlers | `chat` | one interaction per user turn |
| Cron or scheduler (`node-cron`, `cron.schedule`, `@Cron`, `APScheduler`, `celery beat`, `schedule.every`, GitHub Actions `schedule:`), queue consumer (`bullmq Worker`, `sqs`, `kafka` consumer, `celery @task`, `rq`), webhook route called by another system, Lambda / Cloud Function `handler`, CLI script `if __name__ == "__main__"` / `bin/` scripts, Slack bot event handlers | `background` | one task per job or run (`aiTask` / `ai_task`) |
| An HTTP route used by another service rather than a person | ask the user: chat if a person waits for the answer, else background | |

One code path can serve both (a function called from a route and from a cron): record both entry points; the interaction or task is opened at the entry point, not in the shared function.

Streaming: note whether the route returns a stream (`stream: true`, `.stream(`, `streamText`, `StreamingResponse`, `res.write`, SSE). Streams need `bind()` or returning the stream from the interaction callback.

Thread pools (Python): `ThreadPoolExecutor`, `run_in_executor` inside a background job need `propagate()`.

Tool loops: when requests pass `tools`, check whether the app executes the returned tool calls and sends results back (a `role: "tool"` / `tool_result` message in a follow-up call, or a framework agent loop). If it only passes `tools` and ignores the calls, an event rule can fire only with `when: always`.

Background granularity: note what one run is (the whole cron invocation, one queue message) and whether it fans out per item (per workspace, per document). Per-item steps that should report their own usage become `child_tasks`; ask the user which level they want.

## 3. Browser client

| Look for | Pattern |
|---|---|
| RudderStack JavaScript SDK (the only browser SDK this plugin instruments) | `@rudderstack/analytics-js` in `package.json`, `rudderanalytics.load(`, `cdn.rudderlabs.com/v3`, `new RudderAnalytics(` |
| Legacy browser SDK v1.1 | `rudder-sdk-js`, `cdn.rudderlabs.com/v1.1` (cookies unsupported by the server SDKs: note it, suggest a v3 upgrade, do not do it) |
| Other analytics | `analytics.load(` (Segment), `posthog.init(`, `mixpanel.init(`, `amplitude.init(`, `gtag(` |
| Chat UI | components or templates with `chat`, `assistant`, `copilot`, `message`, `prompt` in names; `useChat(` (Vercel AI SDK UI); `fetch('/api/chat'` / EventSource / WebSocket calls to the chat route |
| Feedback and actions | thumbs up/down, `rating`, `feedback`, copy-to-clipboard (`navigator.clipboard.writeText`), share, report, regenerate/retry buttons, cards, sources or links opened from an answer (click-through), and the endpoints they call; for each endpoint, whether its request already carries the answer's ID and the conversation ID (`trackAction` needs both) |
| Browser event sampling | a sample rate or `Math.random()` gate around `rudderanalytics.track` in the app's analytics module; client copies of AI events must bypass it |
| Assistant open/close, conversation list | launcher/toggle handlers, new-chat, switch, rename, delete conversation handlers |

No RudderStack JavaScript SDK on the page: the `client` surface is `status: skipped` with the reason. Do not add a browser SDK; server events still work.

## 4. Existing RudderStack clients, legacy AI events and tracing

| Look for | Pattern |
|---|---|
| Server RudderStack client (Node.js) | `@rudderstack/rudder-sdk-node`, `new Analytics(` with a write key |
| Server RudderStack client (Python) | `rudder-sdk-python`, `rudderstack.analytics`, `rudder_analytics.write_key`, `Client(write_key=` |
| Env var names for the key and URL | the identifier passed to the client (`process.env.X`, `os.environ["X"]`): record the variable NAME only |
| Hand-built AI events | `track(` / `.track(` calls whose event name or properties mention `ai`, `llm`, `gpt`, `chat`, `prompt`, `completion`, `answer`, `assistant`, `turn`, `message`, `tokens`, `model`, `cost`, `feedback`; Segment/PostHog `capture(` calls with the same |
| Tracing tools | `langfuse` (`@langfuse/*`, `langfuse`), `langsmith` (`LANGCHAIN_TRACING_V2`, `langsmith`), OpenTelemetry (`@opentelemetry/*`, `opentelemetry-*`, `NodeSDK`, `TracerProvider`), `traceloop`, `openinference`, `braintrust`, `helicone`, `@vercel/otel` |

For each hand-built AI event, record the event name, `path:line`, its properties, and propose a mapping to the standard events (see `ai-events-yaml.md`, `legacy_events`).

For a tracing tool, find how the current trace ID is read (`langfuse.getCurrentTraceId()`, `get_current_trace_id()`, `trace.getActiveSpan()?.spanContext().traceId`, LangSmith run tree `trace_id`) and offer it as `tracing.trace_id_source`. It is optional: spec v0.3 never sets `trace_id` automatically, the app passes it (`traceId` / `trace_id`, or `linkTraceId` / `link_trace_id` on the SDK's span processor). No tracing tool: `tracing.tool: none`, and do not suggest adding one.

## 5. MCP servers

| SDK | Server constructor | Tools, resources, prompts | Supported |
|---|---|---|---|
| `@modelcontextprotocol/sdk` 1.x | `new McpServer(`, `new Server(` | `server.tool("name"`, `server.registerTool("name"`, `registerResource(`, `registerPrompt(`, `setRequestHandler(CallToolRequestSchema` | `>=1.31.0 <2.0.0` |
| `@modelcontextprotocol/server` (2.x) | `new McpServer(` | as above | no: `blocked` |
| Python `mcp` v2 | `MCPServer(` from `mcp.server.mcpserver`, `Server(` from `mcp.server.lowlevel` | `@server.tool()`, `@server.resource(`, `@server.prompt(` | yes |
| Python `mcp` 1.x, standalone `fastmcp` | `FastMCP(` from `mcp.server.fastmcp` or `fastmcp` | `@mcp.tool()` (name = function name unless `name=`) | no: `blocked` (upgrade to `mcp` v2 is the user's call) |
| Go `github.com/modelcontextprotocol/go-sdk` | `mcp.NewServer(` | `mcp.AddTool(server, &mcp.Tool{Name: "name"`, `server.AddResource(`, `server.AddPrompt(` | v1.8 |
| Go `github.com/mark3labs/mcp-go` | `server.NewMCPServer(` | `s.AddTool(mcp.NewTool("name"` | no: `blocked` |

For each server record, as `path` plus `symbol`:

- name and version (the `Implementation` / constructor arguments), file, and where it connects (`server.connect(`, `server.run(`, `server.Run(`, `NewStreamableHTTPHandler`).
- transport: `stdio` (`StdioServerTransport`, `run("stdio")`, `mcp.StdioTransport`), `streamable_http` (`StreamableHTTPServerTransport`, `streamable-http`, `NewStreamableHTTPHandler`), or `sse` (deprecated HTTP+SSE). Several processes or replicas behind a load balancer: note it (per-process state, see Known limits).
- auth: the OAuth or API-key verifier (`requireBearerAuth`, `authInfo`, `TokenVerifier`, `auth.RequireBearerToken`), which claim holds the user (usually `sub`) and which the workspace or tenant. No auth (typical for stdio): events go out as `ai_system`.
- tool, resource and prompt names, and their descriptions (inputs for the server's intent list).
- tools whose call is itself a product action (creates, updates, sends): candidates for declared tool events.
- hand-built analytics already sent from handlers (`mcp_<method>_success`, raw request or result properties): legacy events to map and flag.
- elicitation calls (`elicitInput(`, `ctx.elicit(`, `session.Elicit(`), and MCP Events subscription or webhook code (experimental, off unless asked).

An app that is an MCP *client* (an agent calling MCP tools) is covered by its chat or background integration: those calls appear in `tool_breakdown` with `mcp_server`. When the agent uses the OpenAI Agents SDK and the server is also tracked, plan `rudderStackMcpToolMeta()` / `rudderstack_mcp_tool_meta()` so `mcp_tool_called` joins the calling answer.

## 6. Identity

| Need | Where to look |
|---|---|
| Server `userId` | auth middleware and handlers: `req.user`, `req.auth`, `res.locals.user`, `getServerSession(`, `auth()` (NextAuth / Clerk), `currentUser(`, `jwt.verify(`, `passport`; Python `request.user`, `Depends(get_current_user)`, `current_user` (Flask-Login), `request.state.user` |
| Account / tenant | `workspaceId`, `orgId`, `tenantId`, `accountId` on the user or request |
| Browser `anonymousId` / session | RudderStack JavaScript SDK v3 cookies `rl_anonymous_id`, `rl_session`, `rl_user_id`; same-origin requests carry them, cross-origin ones need `credentials: 'include'` and a proxy or same parent domain |
| Background jobs | who the job is for (`on_behalf_of`), which customer (`account_id`), a stable per-job or per-thread conversation key |
| Logout | does the page call `rudderanalytics.reset()` on logout? If not, `rl_user_id` can name the previous user: prefer the server's own user ID |

Identity is ambiguous when: there are two plausible user IDs (internal DB id vs auth-provider id), the chat route has no auth, the browser SDK `identify()` uses a different ID than the server or is never called (browser events then carry only `anonymousId` while server events carry `userId`; ask whether the user wants an `identify()` call on login, as a separate change), a legacy event falls back to a placeholder user (`'anonymous'`: do not carry it over; the SDK uses cookies or `ai_system`), or a background job has no clear tenant. Ask the user, one question at a time; never guess.

## 7. Intent and surface sources

Channel (`surface`): web or mobile UI, Slack or Teams bot handlers, email ingestion, an app inside ChatGPT or Claude, an IDE extension, or a plain API. One route serving several channels needs the channel per request; ask where it comes from.

Attachments: upload handlers or multimodal message parts (`image_url`, `input_image`, `document`, `file` content blocks) on the chat route: plan `attachment_count` / `attachment_types`.

Intents: read, never execute: system prompts (`system:` / `role: "system"` / `SystemMessage(` / prompt template files), tool and function names and their descriptions, route names, feature flags, README and docs pages describing what the assistant does, existing support categories or enums. Never query production data, logs, transcripts or analytics to infer intents.
