# Node.js recipes (`@rudderstack/ai`, spec v0.3)

Node.js 24+. ESM shown; CommonJS works the same with `require('@rudderstack/ai')` and `require('@rudderstack/ai/openai')`. Every entry point: `@rudderstack/ai`, `/openai`, `/anthropic`, `/google-genai`, `/bedrock`, `/vercel-ai-sdk`, `/langchain`, `/claude-agent-sdk`, `/openai-agents`, `/middleware`, `/mcp`, `/tracing` and `/tracing/vercel-ai-sdk` (advanced OpenTelemetry export, not needed for AI events).

`<VERSION>` below is the release that ships spec v0.3: `0.5.0`, the first `@rudderstack/ai` version whose tarball has `spec/ai-events-v0.3.schema.json` (check with `npm view @rudderstack/ai version` and section 1 of the verify skill's `references/verification.md`). 0.4.0 ships spec v0.2 and has no `/mcp`: never install it or a branch build for a v0.3 plan.

Runnable references in the SDK repository's `examples/`: `openai`, `openai-responses`, `anthropic`, `google-genai`, `bedrock-converse`, `vercel-ai-sdk`, `langchain`, `claude-agent-sdk`, `openai-agents`, `background-agent`, `manual-interaction` (`recordCall`), `scores-evaluator`, `cost-estimation`, `mcp-server`, `mcp-server-lowlevel`, `mcp-server-v2`, `openai-agents-mcp`.

## 1. Install (exact pins)

| Manager | Command |
|---|---|
| npm | `npm install --save-exact @rudderstack/ai@<VERSION>` |
| pnpm | `pnpm add --save-exact @rudderstack/ai@<VERSION>` |
| yarn | `yarn add --exact @rudderstack/ai@<VERSION>` |
| bun | `bun add --exact @rudderstack/ai@<VERSION>` |

Only when the plan says `rudderstack.client: new`, add the client too: `@rudderstack/rudder-sdk-node@3.0.16`. The provider and framework packages (`openai`, `@anthropic-ai/sdk`, `ai`, `@langchain/core`, ...) are optional peer dependencies the app already has; do not add or bump them. The same holds for the MCP SDK on MCP servers (supported: `@modelcontextprotocol/sdk` `>=1.31.0 <2.0.0` and `@modelcontextprotocol/server` `>=2.0.0 <3.0.0`). Run the install from the `sdks[].path` directory; the lockfile change belongs in the same diff.

## 2. Configure once at startup

Put this in the module that creates the app's RudderStack client (`rudderstack.client_path`), at module level, right after the client: it then runs once per process, as soon as the server imports the client, before any request. If nothing imports that module at startup, call it from the server's entry file instead. Snippets use `.js` import suffixes; match the repo's convention (`.ts`, none).

```ts
import { configure } from '@rudderstack/ai';
import { analytics } from './analytics.js'; // or, in the client module itself, the client defined just above

configure({
  analytics,
  captureContent: false, // spec.config.capture_content
  // toolBreakdown: true,  // spec.config.tool_breakdown
  // serverFeedback: false, // only when client_events.opt_out lists server_feedback
  // eventRules / classifier / evaluator / prices: sections 8-10, only when the plan has them
});
```

No existing client (`client: new`):

```ts
import Analytics from '@rudderstack/rudder-sdk-node';

export const analytics = new Analytics(process.env.RUDDERSTACK_WRITE_KEY!, {
  dataPlaneUrl: process.env.RUDDERSTACK_DATA_PLANE_URL!,
});
```

Use the env var names from the plan. Do not create or edit `.env` files: list the variable names for the user to set.

## 3. Wrap the model client (or add the framework integration)

Wrap where the client is constructed; the wrapped object has the same type and API, so call sites do not change:

```ts
import OpenAI from 'openai';
import { wrapOpenAI } from '@rudderstack/ai/openai';

export const openai = wrapOpenAI(new OpenAI());
// Gateways: wrapOpenAI(new OpenAI({ baseURL }), { provider: 'openrouter' | 'litellm' | 'azure.ai.openai' })
```

| Integration | Change |
|---|---|
| Anthropic | `wrapAnthropic(new Anthropic())` from `@rudderstack/ai/anthropic`; `AnthropicBedrock`: `{ provider: 'aws.bedrock' }`, `AnthropicVertex`: `{ provider: 'gcp.vertex_ai' }` |
| Google Gen AI | `wrapGoogleGenAI(new GoogleGenAI({ ... }))` from `@rudderstack/ai/google-genai` |
| Bedrock | `wrapBedrock(new BedrockRuntimeClient({ region }))` from `@rudderstack/ai/bedrock` |
| Vercel AI SDK | `wrapLanguageModel({ model, middleware: rudderstackMiddleware({ agentName }) })` from `ai` + `@rudderstack/ai/vercel-ai-sdk` |
| LangChain / LangGraph | `const handler = new RudderStackCallbackHandler({ agentName: 'support_agent' })` from `@rudderstack/ai/langchain`; pass it in the `invoke` / `stream` config (`{ callbacks: [handler] }`), never in a model constructor |
| Claude Agent SDK | replace `query(params)` with `trackedQuery(params, { userId, conversationId })` from `@rudderstack/ai/claude-agent-sdk` (same messages) |
| OpenAI Agents SDK | `trackedRun(runner, agent, input, runOptions, { userId, feature })` from `@rudderstack/ai/openai-agents` |
| Anything else | inside the interaction: `interaction.recordCall({ provider, model, inputTokens, outputTokens, responseId })` (example `manual-interaction`) |

One integration per call path: do not add a LangChain handler around a wrapped client on purpose.

`requested_model` needs no code: the OpenAI, Anthropic, Google Gen AI and Vercel AI SDK integrations send it, streamed or not, when a router or fallback served another model than the one requested; a dated snapshot of the requested model (`claude-haiku-4-5` served as `claude-haiku-4-5-20251001`) is the same model and sends none.

## 4. Chat surface: one `aiInteraction` per user turn

Identity from browser cookies, once for the whole app (Express / Connect):

```ts
import { aiContextMiddleware } from '@rudderstack/ai/middleware';

app.use(aiContextMiddleware()); // before the chat and feedback routes
```

Next.js App Router: `export const POST = withAiContext(async (request: Request) => handle(request));`. Hono or any Fetch handler: `serve({ fetch: withAiContext(app.fetch) })`. Without middleware, pass `request: req` (or `cookies`) to `aiInteraction`.

Smallest change to an existing route: wrap only the model call, keep everything else as it is, and return the ID used.

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// inside the existing handler, replacing `const completion = await openai.chat.completions.create(...)`
const clientId = req.get('x-interaction-id'); // interaction_id_source: client
let interactionId: string | undefined;
const completion = await aiInteraction(
  {
    userId: req.user?.id, // identity.user_id; no placeholder fallback
    conversationId,
    interactionId: clientId && UUID.test(clientId) ? clientId : undefined,
    feature: 'support_bot',
    surface: 'web', // the surface's channel from the plan
    inputMethod: 'text',
  },
  (interaction) => {
    interactionId = interaction.id;
    return openai.chat.completions.create({ model, messages, tools });
  },
);
// ...existing code (history, legacy event) unchanged...
res.json({ answer, conversationId, interactionId }); // the ID the server actually used
```

`interaction_id_source: app`: mint or read the app's per-answer ID before the interaction (move its existing `randomUUID()` up if it is minted after the model call), pass it as `interactionId`, and keep returning it as the app already does:

```ts
const messageId = randomUUID(); // the app's per-answer ID, now minted before the call
const completion = await aiInteraction(
  { userId: req.user?.id, conversationId, interactionId: messageId, feature: 'support_bot', inputMethod: 'text' },
  () => openai.chat.completions.create({ model, messages, tools }),
);
```

A route written from scratch (non-streaming):

```ts
import { aiInteraction } from '@rudderstack/ai';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.post('/api/chat', async (req, res) => {
  const { message, conversationId } = req.body;
  const clientId = req.get('x-interaction-id'); // interaction_id_source: client
  const { answer, interactionId } = await aiInteraction(
    {
      userId: req.user?.id, // identity.user_id from the plan
      conversationId, // conversation_id_source
      interactionId: clientId && UUID.test(clientId) ? clientId : undefined,
      feature: 'support_bot',
      inputMethod: 'text',
      promptText: message, // sent only when captureContent is on
    },
    async (interaction) => {
      const completion = await openai.chat.completions.create({ model, messages });
      return { answer: completion.choices[0].message.content, interactionId: interaction.id };
    },
  );
  res.json({ answer, interactionId, conversationId });
});
```

- Keep the route's existing error handling: `aiInteraction` rethrows the original error after recording it.
- Always return the ID the interaction used (body field or `x-interaction-id` header): with `sdk` the client learns it, with `client` an invalid browser ID was replaced and the client must switch to the returned one.
- `surface` (`web`, `mobile`, `slack`, `teams`, `email`, `chatgpt_app`, `claude_app`, `ide`, `api`, `other`) comes from the plan; the SDK cannot tell. A route used by several channels passes the one the request came from. Set it once with `aiContext({ surface })` when every event in a request shares it.
- Attachments: when the prompt carries files, pass `attachmentCount` and `attachmentTypes` (`image`, `audio`, `video`, `pdf`, `file`); never names or content.
- `trace_id` is opt-in: it is sent only when the app passes one or links spans. OpenTelemetry as the plan's tracing tool: register the SDK's span processor with `linkTraceId: true` (`registerTracing({ linkTraceId: true })` / `createSpanProcessor({ linkTraceId: true })` from `@rudderstack/ai/tracing`); it is then filled from the first span started inside the interaction. Without `linkTraceId` the processor still tags spans with `interaction_id` but sets no `trace_id`. Another tracing tool (`tracing.trace_id_source`): pass `traceId` or call `interaction.setTraceId(id)`; a value the app sets always wins. Do not add tracing the plan does not list.
- `client_disconnected: true` is sent automatically when the request closes under `aiContextMiddleware()` / `withAiContext()` or a bound stream is cancelled before the answer ends; elsewhere pass `interaction.end({ clientDisconnected: true })` from the app's own close handler, if it has one.
- Statuses need no code: the integrations report `paused` with `pause_reason` (tool approval, LangGraph `interrupt()`, Claude Agent SDK defer), `incomplete` with `error_type` (`max_turns`, `max_budget_usd`, `length`: a last call cut off at the token limit, including Anthropic `stop_reason: max_tokens`) and `content_filter` as an error.
- Business-specific extras ride on the answer: `interaction.end({ extraProperties: { ... } })`; SDK-owned names are ignored.

Streaming: return the stream from the callback, or bind the one you pipe after the callback returns.

```ts
const stream = await aiInteraction({ userId, conversationId }, () =>
  openai.chat.completions.create({ model, messages, stream: true }),
);
for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content ?? '');
res.end();
// Express + Vercel AI SDK: stream: interaction.bind(toUIMessageStream({ stream: result.stream }))
```

Claude Agent SDK with resumed sessions: store `usageSnapshot(resultMessage)` with the session and pass it back as `usageBaseline`, or each resumed turn re-counts the whole session.

## 5. Feedback and other actions (server copy)

The server copy of each action in `surfaces[].feedback`. By default the browser sends its own copy of feedback too (`references/client-events.md`); dashboards use the client row per `interaction_id` and fall back to this one.

```ts
import { trackAction } from '@rudderstack/ai';

app.post('/api/feedback', (req, res) => {
  const { interactionId, conversationId, helpful } = req.body;
  trackAction({
    userId: req.user?.id,
    interactionId,
    conversationId,
    actionType: 'feedback_given', // feedback_retracted | copied_response | shared | reported | regenerated | accepted | rejected | edited | clicked_through
    surface: 'web',
    actionDetails: { feedback_type: 'thumbs', feedback_value: helpful ? 1 : -1 },
  });
  // ...the endpoint's existing work
  res.sendStatus(204);
});
```

`interactionId` and `conversationId` are required (else dropped with a warning). When the endpoint does not receive them today (`request_changes` in the plan), add them to the client's request body and read them here; skip `trackAction` when they are missing or the ID is not a UUID, and keep the endpoint's existing response. Pass the real user ID or nothing, never a legacy placeholder such as `'anonymous'`. Cookies come from the middleware's context; without middleware, wrap the call in `aiContext({ cookies: req.headers.cookie }, () => trackAction(...))`. When the plan opts the server copy out (`client_events.opt_out: [server_feedback]`), do not remove the endpoint's `trackAction`: set `configure({ serverFeedback: false })` once instead.

## 6. Background surface: one `aiTask` per run

```ts
import { aiContext, aiTask } from '@rudderstack/ai';

await aiContext({ accountId: job.workspaceId, onBehalfOf: job.requestedBy }, () =>
  aiTask(
    'nightly-digest', // task_name
    { triggerSource: 'schedule', conversationId: `nightly-digest:${job.workspaceId}`, feature: 'digest' },
    async (task) => {
      const summary = await anthropic.messages.create({ model, max_tokens: 500, messages });
      task.setOutcome('resolved');
      return summary;
    },
  ),
);
```

- No `userId`: the actor is the system (`anonymousId: 'ai_system'`). The person goes in `onBehalfOf`, the customer in `accountId`. Always pass a stable, scoped `conversationId`.
- A top-level `aiTask` flushes when it ends, so a cron script or Lambda can exit. A nested `aiTask` (a sub-step inside another task) chains with `parent_interaction_id` and does not flush.
- Long-running workers that run many tasks: pass `flush: false` and flush at shutdown (section 7) so a slow data plane never stalls the job loop.
- A run started by an MCP Events update: `triggerSource: 'mcp_event'` and `triggerEventId` set to the update's `event_id`.

## 7. Flush

| Process | Do |
|---|---|
| Long-running server | `await flush()` in the existing shutdown hook (SIGTERM handler, `server.close` callback), before the app's own client flush, which stays; add a hook only if none exists |
| Serverless handler, script, CLI | `await flush()` before returning or exiting (a top-level `aiTask` already does it) |

```ts
import { flush } from '@rudderstack/ai';

process.on('SIGTERM', async () => {
  await flush(); // waits for classifications, then flushes every RudderStack client the SDK used
  process.exit(0);
});
```

`flush()` is bounded: pending classifications and evaluations wait up to the classifier timeout plus 1 s (or `flush({ timeoutMs })`), and each client flush up to 10 s. It never throws and resolves `false` when something did not finish in time, so a slow data plane cannot hold up shutdown.

## 8. Declared tool events (`spec.config.event_rules`)

```ts
configure({
  eventRules: {
    tools: {
      save_memory: 'memory_captured',
      create_ticket: {
        event: 'ticket_created',
        properties: (args) => ({ priority: (args as { priority?: string })?.priority }),
        // when: result_seen in the plan -> add: when: (_args, result) => result !== undefined,
      },
    },
  },
});
```

Names starting with `ai_` or `mcp_` throw. If `properties()` throws or its output takes the event over 30,000 bytes, the event is sent without it. `when: always` needs no `when` function. Results reach a rule only when the app sends the tool result back to the model inside the same `aiInteraction`; an app that never executes the tool gets the event with `tool_status: "unknown"`.

## 9. Classifier (`spec.config.classifier.enabled: true`)

```ts
import Anthropic from '@anthropic-ai/sdk';

configure({
  classifier: {
    client: new Anthropic(), // the app's own provider client and key; its calls are never tracked
    model: 'claude-haiku-4-5',
    intents: ['refund_request', 'order_status', 'product_question'], // plan intents without "other"
    // outcomes: ['resolved', 'partial', 'unresolved', 'escalated', 'unclear'],
  },
});
```

Classification needs prompt or answer text: pass `promptText` to `aiInteraction` (it is used for classification even with capture off). The intent list is fixed in code: changing it needs a deploy, and labels are not back-filled.

Scores (`spec.config.scores`), only when the plan has them. A score the app already computes elsewhere (a human review, an offline judge):

```ts
import { trackScore } from '@rudderstack/ai';

trackScore({ interactionId, conversationId, evaluationName: 'groundedness', scoreValue: 0.82, evaluator: 'model' }); // or scoreLabel; evaluator: model | code | human
```

Both are shown in example `scores-evaluator`.

The app's own evaluator on every successful answer (runs after the answer, 5 s timeout, never blocks it; `flush()` waits for it):

```ts
configure({ evaluator: async (turn) => ({ evaluationName: 'groundedness', scoreValue: await judge(turn), evaluator: 'model' }) });
```

`explanation` is content: sent only with `captureContent`.

## 10. Prices (`spec.config.prices`)

```ts
configure({
  prices: {
    'gpt-4.1-mini': {
      inputPerMtok: 0.4,
      outputPerMtok: 1.6,
      cachedInputPerMtok: 0.1,
      // per model, only the options the plan lists:
      // tierMultipliers: { batch: 0.5, flex: 0.5, fast: 2 },
      // longContext: { thresholdTokens: 200000, inputPerMtok: 6, outputPerMtok: 22.5 },
      // serverToolPerCall: { web_search: 0.01 },
      // cacheWrite1hPerMtok: 6,
    },
  },
});
```

Register each model the app uses; a family name never prices another model (`gpt-4o` does not price `gpt-4o-mini`). Gemini API calls report provider `gcp.gemini`, Vertex AI calls `gcp.vertex_ai`, and they are priced separately: register each one the app calls with its `provider` (`registerPrice(model, { ..., provider: 'gcp.vertex_ai' })`); a price with no `provider` covers both. `google` and `google.vertex` (the labels before 0.5.0) still work as aliases of `gcp.gemini` and `gcp.vertex_ai`. Example `cost-estimation` shows `registerPrices` and `estimateCost`. Service tier, 1-hour cache writes and provider-hosted tool calls are read from responses automatically; the price options above only turn them into cost.

## 11. Legacy event behind a flag

```ts
// Old hand-built event, kept for the migration window (ai-events.yaml legacy_events).
if (process.env.AI_EVENTS_LEGACY_EVENT !== 'false') {
  analytics.track({ userId, event: 'chatTurnCompleted', properties: { ... } }); // unchanged
}
```

Leave the old call's properties as they are; only wrap it in the flag.

## 12. MCP server: `wrapMcpServer`

One call per server, before `connect()`, where the `McpServer` (or low-level `Server`) is created. The same call covers `@modelcontextprotocol/sdk` 1.x (`McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`, low-level `Server`) and `@modelcontextprotocol/server` 2.x. Tools, resources and prompts stay as written.

```ts
import { wrapMcpServer } from '@rudderstack/ai/mcp';

wrapMcpServer(server, {
  analytics, // or omit to use configure()'s client
  identify: (auth) => ({ userId: auth?.extra?.sub as string, accountId: auth?.extra?.workspace_id as string }), // plan mcp.servers[].identify
  requestContext: { intents: ['debug_delivery', 'build_audience'] }, // plan request_context.intents, without other; false turns it off
  // eventRules: { tools: { create_audience: 'audience_created' } },   // plan declared tool events
  // capabilityRequests: { capabilities: ['bulk_export'] },            // plan capability_requests
});
await server.connect(transport);
```

`@modelcontextprotocol/server` 2.x builds servers in a factory (`createMcpHandler`, `serveStdio`): wrap inside it, so every server it returns is wrapped.

```ts
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';

function buildServer(): McpServer {
  const server = new McpServer({ name: 'workspace-mcp', version: '1.4.0' });
  server.registerTool('create_audience', { inputSchema }, createAudience); // unchanged
  return wrapMcpServer(server, { analytics, identify, requestContext: { intents: ['build_audience'] } });
}
const handler = createMcpHandler(buildServer);
```

- `identify(authInfo)` runs per request and returns any of `userId`, `anonymousId`, `accountId`, `oauthClientId`, `tokenScopes`, `authMethod`, `country`. Without auth (stdio) events go out as `ai_system`, attributed to the session.
- `request_context` is added to every tool's input schema and stripped before the tool runs; the model fills `intent` (from the list, or `other`) and `user_sentiment`. `call_reason` and `capability_detail` only with `captureContent`.
- Supported: `@modelcontextprotocol/sdk` `>=1.31.0 <2.0.0` (protocol up to 2025-11-25) and `@modelcontextprotocol/server` `>=2.0.0 <3.0.0` (also the stateless 2026-07-28, with elicitation through `input_required`), on stdio, Streamable HTTP and HTTP+SSE. Examples: `mcp-server` (`McpServer`), `mcp-server-lowlevel` (low-level `Server`), `mcp-server-v2` (2.x, both protocol revisions).
- State (`mcp_client_seen` window, call counters, retry hashes, pending elicitations) is in memory per server name, per process: servers rebuilt per request under one name share it, so give each distinct server a unique name. Each replica reports its own `mcp_client_seen`.
- Flush when the process stops (section 7): the existing shutdown hook for HTTP servers; for stdio, the transport's `onclose`.
- `call_index` counts reported calls with no gaps: on 2026-07-28 the `input_required` leg sends no `mcp_tool_called`, and the elicitation retry keeps that leg's `call_index`.
- A declared tool event follows its `mcp_tool_called` on success and on failure, including a call whose arguments failed validation (`tool_status: error`).
- An agent built with this SDK and the OpenAI Agents SDK passes its `interaction_id` to MCP servers with `toolMetaResolver: rudderStackMcpToolMeta()` (from `@rudderstack/ai/openai-agents`) on `MCPServerStdio` / `MCPServerStreamableHttp` / `MCPServerSSE`, so each `mcp_tool_called` joins the answer that made it (example `openai-agents-mcp`). It adds `com.rudderstack/trace_id` only when the interaction has a `trace_id`, and `traceparent` only with `linkTraceId: true`. The agent's `tool_breakdown` entries for those tools carry `mcp_server`, read from the Agents SDK function span: keep Agents SDK tracing on (no `tracingDisabled`, no `OPENAI_AGENTS_DISABLE_TRACING`).
- MCP Events (`mcpEvents: true`, `trackMcpEventSubscription`, `wrapMcpEventSender`) only when the plan turns it on: experimental. A delivery without `subscriptionId` or `eventId` is dropped with one warning per process; a missing `eventName` is sent as `unknown`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Warning `no RudderStack client` | `configure({ analytics })` did not run before the first call |
| One answer split into several `ai_response_received` | calls outside `aiInteraction`, a stream read after the callback returned without `bind`, or a LangChain handler on a model constructor |
| Events missing from a script or Lambda | `await flush()` before exit |
| No `total_cost_usd` | no registered price for the model (for Gemini, for its provider `gcp.gemini` / `gcp.vertex_ai`) and no provider-reported cost |
| No `trace_id` | opt-in since 0.5.0: pass `traceId` / `setTraceId()`, or register the span processor with `linkTraceId: true` |
| `response_text` / `tool_breakdown` entries missing on a large answer | the event was over 30,000 bytes of properties: captured text is dropped first, then breakdown entries from the end |

`RUDDERSTACK_AI_DEBUG=1` logs everything the SDK drops or ignores.
