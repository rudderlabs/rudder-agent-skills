# Discovery heuristics

Read-only. Use Glob and Grep (or `rg` / `grep -rn`) over source files; skip `node_modules/`, `.venv/`, `venv/`, `dist/`, `build/`, `.next/`, `vendor/` and lockfiles except to read resolved versions. Never open `.env*`, `*.pem`, `*.key`, secrets files or credential stores. Every finding goes into `ai-events.yaml` with a `path:line`.

## 1. Runtimes and manifests

| Check | Where | Blocks the surface when |
|---|---|---|
| Node.js version | `engines.node` in `package.json`, `.nvmrc`, `.node-version`, `Dockerfile` `FROM node:` | below 24 (`@rudderstack/ai` needs Node.js 24+) |
| Python version | `requires-python` in `pyproject.toml`, `.python-version`, `runtime.txt`, `Dockerfile` `FROM python:` | below 3.12 (`rudderstack-ai` needs 3.12+) |
| Package manager | `package-lock.json` (npm), `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`; `uv.lock`, `poetry.lock`, `Pipfile.lock`, `requirements*.txt` | |

A blocked surface stays in the plan with `status: blocked` and the reason; do not upgrade the runtime yourself.

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
| MCP servers | `@modelcontextprotocol/sdk` | `mcp`, `fastmcp` | discovery only (see section 5) |
| Go | `github.com/openai/openai-go`, `github.com/anthropics/anthropic-sdk-go`, `github.com/mark3labs/mcp-go`, `github.com/modelcontextprotocol/go-sdk` | | no SDK: record, mark `status: unsupported` |
| Anything else (Mistral, Cohere, Ollama clients, a home-grown HTTP client) | | | `interaction.recordCall()` / `record_call()` |

A library outside its supported range is a blocker for that integration: record it and ask the user whether to upgrade the library or use `recordCall` / `record_call` instead. These ranges are for SDK 0.4.0; for a newer SDK, re-read its README compatibility table.

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

## 3. Browser client

| Look for | Pattern |
|---|---|
| RudderStack JavaScript SDK (the only browser SDK this plugin instruments) | `@rudderstack/analytics-js` in `package.json`, `rudderanalytics.load(`, `cdn.rudderlabs.com/v3`, `new RudderAnalytics(` |
| Legacy browser SDK v1.1 | `rudder-sdk-js`, `cdn.rudderlabs.com/v1.1` (cookies unsupported by the server SDKs: note it, suggest a v3 upgrade, do not do it) |
| Other analytics | `analytics.load(` (Segment), `posthog.init(`, `mixpanel.init(`, `amplitude.init(`, `gtag(` |
| Chat UI | components or templates with `chat`, `assistant`, `copilot`, `message`, `prompt` in names; `useChat(` (Vercel AI SDK UI); `fetch('/api/chat'` / EventSource / WebSocket calls to the chat route |
| Feedback and actions | thumbs up/down, `rating`, `feedback`, copy-to-clipboard (`navigator.clipboard.writeText`), share, report, regenerate/retry buttons, and the endpoints they call |
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

For a tracing tool, find how the current trace ID is read (`langfuse.getCurrentTraceId()`, `get_current_trace_id()`, `trace.getActiveSpan()?.spanContext().traceId`, LangSmith run tree `trace_id`) and record it as `tracing.trace_id_source`. With OpenTelemetry already set up, the SDK's tracing module joins on its own; still record it.

## 5. MCP servers (discovery only)

| SDK | Server constructor | Tool registration |
|---|---|---|
| `@modelcontextprotocol/sdk` | `new McpServer(`, `new Server(` | `server.tool("name"`, `server.registerTool("name"`, `setRequestHandler(CallToolRequestSchema` |
| Python `mcp` / `fastmcp` | `FastMCP(`, `Server(` from `mcp.server` | `@mcp.tool()` decorated functions (name = function name unless `name=`) |
| `mcp-go` | `server.NewMCPServer(` | `s.AddTool(mcp.NewTool("name"` |

Record each server's file, name, transport (`stdio`, `StreamableHTTPServerTransport`, `SSEServerTransport`, `streamable-http`) and tool names. The plan marks MCP `status: discovered-only`: MCP traffic is not covered by AI events spec v0.2, and MCP instrumentation comes later. An app that is an MCP *client* (an agent calling MCP tools) is covered: those tool calls appear in `tool_breakdown` with `mcp_server`.

## 6. Identity

| Need | Where to look |
|---|---|
| Server `userId` | auth middleware and handlers: `req.user`, `req.auth`, `res.locals.user`, `getServerSession(`, `auth()` (NextAuth / Clerk), `currentUser(`, `jwt.verify(`, `passport`; Python `request.user`, `Depends(get_current_user)`, `current_user` (Flask-Login), `request.state.user` |
| Account / tenant | `workspaceId`, `orgId`, `tenantId`, `accountId` on the user or request |
| Browser `anonymousId` / session | RudderStack JavaScript SDK v3 cookies `rl_anonymous_id`, `rl_session`, `rl_user_id`; same-origin requests carry them, cross-origin ones need `credentials: 'include'` and a proxy or same parent domain |
| Background jobs | who the job is for (`on_behalf_of`), which customer (`account_id`), a stable per-job or per-thread conversation key |
| Logout | does the page call `rudderanalytics.reset()` on logout? If not, `rl_user_id` can name the previous user: prefer the server's own user ID |

Identity is ambiguous when: there are two plausible user IDs (internal DB id vs auth-provider id), the chat route has no auth, the browser SDK `identify()` uses a different ID than the server, or a background job has no clear tenant. Ask the user, one question at a time; never guess.

## 7. Intent sources

Read, never execute: system prompts (`system:` / `role: "system"` / `SystemMessage(` / prompt template files), tool and function names and their descriptions, route names, feature flags, README and docs pages describing what the assistant does, existing support categories or enums. Never query production data, logs, transcripts or analytics to infer intents.
