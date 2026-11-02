# Node.js recipes (`@rudderstack/ai`, spec v0.4)

Node.js 24+, or Deno with npm compatibility. The SDK relies on `AsyncLocalStorage` and `node:` builtins, which Deno supports; the first instrumented PR must prove context propagation and captured events under the repo's own `deno test`. ESM shown; CommonJS works the same with `require('@rudderstack/ai')` and `require('@rudderstack/ai/openai')`. Every entry point: `@rudderstack/ai`, `/openai`, `/anthropic`, `/google-genai`, `/bedrock`, `/vercel-ai-sdk`, `/langchain`, `/claude-agent-sdk`, `/openai-agents`, `/middleware`, `/mcp`, `/tracing` and `/tracing/vercel-ai-sdk` (advanced OpenTelemetry export, not needed for AI events).

`<VERSION>` below is the plan's `sdks[].version`: 0.8.0 or later.

Full API reference: the package README, shipped at `node_modules/@rudderstack/ai/README.md` and shown on npmjs.com.

## 1. Install (exact pins)

| Manager | Command |
|---|---|
| npm | `npm install --save-exact @rudderstack/ai@<VERSION>` |
| pnpm | `pnpm add --save-exact @rudderstack/ai@<VERSION>` |
| yarn | `yarn add --exact @rudderstack/ai@<VERSION>` |
| bun | `bun add --exact @rudderstack/ai@<VERSION>` |
| deno | `deno add npm:@rudderstack/ai@<VERSION>` |

Only when the plan says `rudderstack.client: new`, add the client too, `@rudderstack/rudder-sdk-node` at its latest release (`>=3.0.16` is the SDK's peer range). An existing older client fails `npm install` with `ERESOLVE`: when `## Dependencies and blockers` approves its upgrade, install that exact pin in the same command (`npm install --save-exact @rudderstack/ai@<VERSION> @rudderstack/rudder-sdk-node@<approved version>`); otherwise stop, it is a plan change. The provider and framework packages (`openai`, `@anthropic-ai/sdk`, `ai`, `@langchain/core`, ...) are optional peer dependencies the app already has; add or bump them only to exact pins approved under Dependencies and blockers, including any cascaded peers. The same holds for the MCP SDK on MCP servers (supported: `@modelcontextprotocol/sdk` `>=1.31.0 <2.0.0` and `@modelcontextprotocol/server` `>=2.0.0 <3.0.0`). Run the install from the `sdks[].path` directory; the lockfile change belongs in the same diff. Deno updates the selected manifest (`deno.json`, `deno.jsonc` or `package.json`) and configured lockfile, if locking is enabled; discover and list those actual paths under Files to change; add approved peers the same way (`deno add npm:@rudderstack/rudder-sdk-node@<approved exact version>`). Use the repo's npm import aliases or `npm:` specifiers.

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

A separate transport client created for AI events must use the same `errorHandler` as the app's existing client, so delivery failures reach its logs; the transport may swallow failures in `flush()`. SDK `onError` does not replace the transport's delivery handler.

No existing client (`client: new`):

```ts
import Analytics from '@rudderstack/rudder-sdk-node';

export const analytics = new Analytics(process.env.RUDDERSTACK_WRITE_KEY!, {
  dataPlaneUrl: process.env.RUDDERSTACK_DATA_PLANE_URL!,
});
```

Use the env var names from the plan. Do not create or edit `.env` files: list the variable names for the user to set.

A client created on first use (or events that must carry the app's own message context, such as `context.groupId`): pass an adapter. `aiTask` and `flush()` call its `flush`.

```ts
import { configure, type AnalyticsClient } from '@rudderstack/ai';

const lazyAnalytics: AnalyticsClient = {
  track: (message) =>
    getAnalytics().track({ ...message, context: { ...message.context, groupId: currentGroupId() } }), // the app's getter; same context its own track() calls set
  flush: (callback) => getAnalytics().flush(callback),
};
configure({ analytics: lazyAnalytics });
```

Only the v0.4 options the plan enables:

```ts
configure({
  emitLlmCalls: true, // per-call rows
  sampleRates: { ai_llm_response_received: 0.1, mcp_tool_called: 0.05 },
  credits: (call) => call.costUsd === undefined ? undefined : call.costUsd * 1000, // app's rate
  emitTaskStarted: true, // optional ai_task_started on new tasks, never resume
});
```

Unlisted events are unsampled; leave answers out for exact counts and cost. Kept sampled events carry `sample_rate`. The credits hook runs after USD pricing for successful calls with known usage; `recordCall({ credits })` overrides it. `total_credits` is absent if any successful call is unpriced in credits.

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
| Bedrock | `wrapBedrock(new BedrockRuntimeClient({ region }))` from `@rudderstack/ai/bedrock`: tracks `Converse` / `ConverseStream`; `InvokeModel` passes through untracked (`recordCall` below) |
| Vercel AI SDK | `wrapLanguageModel({ model, middleware: rudderstackMiddleware({ agentName }) })` from `ai` + `@rudderstack/ai/vercel-ai-sdk` |
| LangChain / LangGraph | `const handler = new RudderStackCallbackHandler({ agentName: 'support_agent' })` from `@rudderstack/ai/langchain`; pass it in the `invoke` / `stream` config (`{ callbacks: [handler] }`), never in a model constructor |
| Claude Agent SDK | replace `query(params)` with `trackedQuery(params, { userId, conversationId })` from `@rudderstack/ai/claude-agent-sdk` (same messages); when the app has its own `query()` chokepoint or its tests mock `query`, wrap the stream instead: `trackMessages(query(params), { userId, conversationId, resumed })` (`trackedQuery` calls the SDK's `query()` inside the package, where a `vi.mock` of the SDK does not reach). A turn that ends without a `result` message (it threw, was cancelled, or the CLI exited) keeps the calls and usage its assistant messages showed |
| OpenAI Agents SDK | `trackedRun(runner, agent, input, runOptions, { userId, feature })` from `@rudderstack/ai/openai-agents` |
| Anything else | inside the interaction: `interaction.recordCall({ provider, model, inputTokens, outputTokens, responseId })` |

One integration per call path: do not add a LangChain handler around a wrapped client on purpose.

Bedrock `InvokeModel` with an Anthropic model: report the call from the response body. `model` is the `modelId` sent (an inference-profile ID such as `us.anthropic.claude-...` prices once its prefix is stripped); leave `requestedModel` unset, or every call reports a routed model.

```ts
const res = await bedrock.send(new InvokeModelCommand({ modelId, body: JSON.stringify(request) }));
const body = JSON.parse(new TextDecoder().decode(res.body));
const u = body.usage ?? {};
const cached = u.cache_read_input_tokens ?? 0;
const written = u.cache_creation_input_tokens ?? 0;
interaction.recordCall({ // the aiInteraction / aiTask callback's interaction, or currentInteraction()
  provider: 'aws.bedrock',
  model: modelId,
  inputTokens: (u.input_tokens ?? 0) + cached + written, // includes cache reads and writes
  outputTokens: u.output_tokens ?? 0,
  cachedInputTokens: cached,
  cacheWriteTokens: written,
  responseId: body.id,
  finishReason: body.stop_reason,
});
```

Claude Agent SDK: construct `query()` inside the `aiInteraction` / `aiTask` callback, not before it, or in-process MCP tools and hooks are counted outside the interaction. A loop the app starts without awaiting: section 4.

`requested_model` needs no code: the OpenAI, Anthropic, Google Gen AI and Vercel AI SDK integrations send it, streamed or not, when a router or fallback served another model than the one requested; a dated snapshot of the requested model (`claude-haiku-4-5` served as `claude-haiku-4-5-20251001`) is the same model and sends none.

Per-call metadata: `wrapOpenAI(client, { callPurpose: 'summarize', fallbackUsed: false, byok: true })` (also `wrapAnthropic`, `wrapGoogleGenAI`, `wrapBedrock`), or the same fields on `interaction.recordCall(...)`. Wrappers measure `latency_ms` and streaming `time_to_first_token_ms`; manual calls pass `startedAt`, `endedAt`, `firstTokenAt` (epoch ms). Unknown boundaries stay absent.

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

An agent loop the route starts without awaiting (it answers `202` and the loop posts results later, often with `query()` built in a factory): open the interaction around the factory call and return the loop's promise from the callback. The interaction then stays open until the loop settles, and the model calls made in the factory and the loop land in the turn. The callback runs before `aiInteraction` returns, so the ID is set for the response:

```ts
// before: const q = buildAgentQuery(params); void runAgentLoop(q); res.status(202).json({ conversationId });
let interactionId: string | undefined;
void aiInteraction(
  { userId: req.user?.id, conversationId, feature: 'support_bot', surface: 'web', inputMethod: 'text' },
  (interaction) => {
    interactionId = interaction.id;
    const q = buildAgentQuery(params); // the factory runs inside: in-process MCP tools and hooks count too
    return runAgentLoop(q); // the loop's promise: the answer ends when it settles, an error fails it
  },
).catch((err) => logger.error(err)); // the app's existing handler for the detached loop
res.status(202).json({ conversationId, interactionId });
```

Never end the interaction when the route responds: calls the loop makes after the end are reported as separate answers. A loop still open at `shutdown()`, or past `limits.interactionTtlMs` (1 hour by default), ends as `incomplete`.

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
- Always return the ID the interaction used (body field or `x-interaction-id` header), on error responses too once the interaction opened, so the browser can send its failure copy: with `sdk` the client learns it, with `client` an invalid browser ID was replaced and the client must switch to the returned one.
- `surface` (`web`, `mobile`, `slack`, `teams`, `email`, `chatgpt_app`, `claude_app`, `ide`, `api`, `other`) comes from the plan; the SDK cannot tell. A route used by several channels passes the one the request came from. Set it once with `aiContext({ surface })` when every event in a request shares it.
- Attachments: when the prompt carries files, pass `attachmentCount` and `attachmentTypes` (`image`, `audio`, `video`, `pdf`, `file`); never names or content.
- `trace_id` is opt-in: it is sent only when the app passes one or links spans. OpenTelemetry as the plan's tracing tool: register the SDK's span processor with `linkTraceId: true` (`registerTracing({ linkTraceId: true })` / `createSpanProcessor({ linkTraceId: true })` from `@rudderstack/ai/tracing`); it is then filled from the first span started inside the interaction. Without `linkTraceId` the processor still tags spans with `interaction_id` but sets no `trace_id`. Another tracing tool (`tracing.trace_id_source`): pass `traceId` or call `interaction.setTraceId(id)`; a value the app sets always wins. Do not add tracing the plan does not list.
- `client_disconnected: true` is sent automatically when the request closes under `aiContextMiddleware()` / `withAiContext()` or a bound stream is cancelled before the answer ends; elsewhere pass `interaction.end({ clientDisconnected: true })` from the app's own close handler, if it has one.
- Statuses need no code: the integrations report `paused` with `pause_reason` (tool approval, LangGraph `interrupt()`, Claude Agent SDK defer), `incomplete` with `error_type` (`max_turns`, `max_budget_usd`, `length`: a last call cut off at the token limit, including Anthropic `stop_reason: max_tokens`) and `content_filter` as an error.
- Planned `surfaces[].extra_properties` ride on successful and failed answers: evaluate their sources and pass `interaction.end({ extraProperties: { ... } })` inside the callback or stream at finalization, before the automatic end; preserve failure status and error type. SDK-owned names are ignored.
- App-detected failures: without planned extras, an error thrown out of the callback already sets the status (an abort: `cancelled`) and the error type: the failed call's own when a wrapped call failed with it, else `app_error` for an error of the app's own code with no provider signal (no HTTP status, provider error code or provider SDK error class). When the app catches its own failure and returns normally (stop button, empty stream, its own deadline, a lost lease), end the answer there, inside the callback: `interaction.end({ status: 'cancelled' })`, or `interaction.end({ status: 'error', errorType: 'empty_response' })` (`timeout`, `incomplete` likewise). App-only error codes go in `extraProperties`. The callback's own end afterwards is a no-op.
- Tracing side effects: `registerTracing()` / `createSpanProcessor()` also export AI spans as `ai_otel_span` events and add `user.id`, `gen_ai.conversation.id` and the interaction ID to AI spans, which every other exporter on that provider (Langfuse, ...) then receives. When another tool owns tracing, register neither: pass `traceId: trace.getActiveSpan()?.spanContext().traceId` (from `@opentelemetry/api`).

Streaming: return the stream from the callback, or bind the one you pipe after the callback returns.

```ts
const stream = await aiInteraction({ userId, conversationId }, () =>
  openai.chat.completions.create({ model, messages, stream: true }),
);
for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content ?? '');
res.end();
// Express + Vercel AI SDK: stream: interaction.bind(toUIMessageStream({ stream: result.stream }))
```

Claude Agent SDK with resumed sessions: follow `surfaces[].usage_baseline_source`. A session already seen in-process uses its cached baseline for per-turn usage and reported cost, even with `resumed: true`. Across pods/restarts, persist `usageSnapshot(resultMessage)` per session and pass it back as `usageBaseline`. Without either baseline, the resumed fallback uses per-turn main-loop usage and subagent messages, ignores cumulative SDK cost and uses only registered prices (section 10); it can undercount subagent usage. `trackedQuery` detects resume/continue itself; for `trackMessages`, pass `resumed: !!options.resume || options.continue === true`.

For persisted usage snapshots, acquire the session's execution slot before reading the baseline and hold it through snapshot save or cleanup. Use `try/finally` with a flag set only after a fresh result snapshot was durably saved: clear the persisted snapshot in `finally` if the run threw, stopped, had no result or the snapshot write failed. Clear it too when crash recovery settles a dangling turn. Apply the lifecycle to every channel using that session store. Keep cleanup failures in the app's existing logging/recovery path so tracking does not change request behaviour; do not release a session for reuse with a known stale baseline.

`CLAUDE_CODE_TERMINAL_MCP_TOOLS` matches tool names, not actions inside a tool. Give each visible-output action its own tool; a tool serving both cards and title changes can make a title-only turn look answered. Where splitting is outside the plan, guard zero-card turns in the app and end them with the planned failure status.

- One-shot: `aiInteraction({ oneShot: true, inputMethod: 'button', feature }, fn)` defaults `conversation_id` to the interaction ID when no explicit or context conversation ID exists; return that ID for copies and actions.
- Agent release / experiment: pass `agentVersion` and `variant` on `aiContext`, `aiInteraction` or `aiTask` options (actions and scores accept them too).
- Refusal: `interaction.end({ status: 'blocked', blockReason: 'policy' })` (`guardrail`, `unsupported`, `skipped`, `other` too), without `errorType`. OpenAI Agents SDK tripwire failures still report `guardrail_trip`; context overflow is `context_limit`.
- Confidence / compaction: `interaction.setConfidence('high')` (`low`, `medium`, `high`), `interaction.recordCompaction()`; standard fields, not extra properties. Declared tool events carry observed `mcp_server` and `result_size_bytes`; a denied tool uses `tool_status: denied`.

## 5. Feedback and other actions (server copy)

The server copy of each action in `surfaces[].feedback`. Gate it on a stored AI-backed reply marker, and emit retractions only when deletion removed a stored rating. Slack button payloads carry the answer's workspace (`team.id`); in Slack Connect the rater's home team can differ. For an error reply sent by an outer catch after the interaction unwinds, use a turn-local marker set inside the callback rather than `currentInteraction()`. By default the browser sends its own copy of feedback too (`references/client-events.md`); dashboards use the client row per `interaction_id` and fall back to this one.

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

App-enforced limits: `trackLimitReached` from `@rudderstack/ai` emits `ai_limit_reached` with required `limit_type` and planned `feature`; provider rate limits remain answer errors. Preset feedback choices go in `actionDetails.feedback_reasons`, scope in `actionDetails.feedback_scope` (`interaction`, `conversation`, `feature`).

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

Repeated approvals, with the app's own run store (configure each worker with the same sampling rates):

```ts
await aiTask('refund-approval', { triggerSource: 'queue', resume: await db.loadRun(job.id) }, async (task) => {
  await anthropic.messages.create(params);
  if (needsApproval) await db.saveRun(job.id, task.pause({ reason: 'approval' })); // JSON snapshot
});
```

In process: `task.pause({ reason: 'approval' })`, then `task.resume()`, repeated as needed. Each pause emits a segment's totals; a normal callback return leaves it paused. JSON restore keeps IDs and identity, sends no new prompt or task-started event; the final answer adds `pause_count` and `total_paused_ms`. Paused runs survive TTL and shutdown.

A paused run keeps its `limits.maxOpenInteractions` slot until it ends; resuming it in process, or restoring its snapshot in the process that paused it, always succeeds, while a snapshot from another process goes through normal admission. End abandoned waits (e.g. on approval timeout) rather than leaving them paused.

## 7. Flush

| Process | Do |
|---|---|
| Long-running server | `await shutdown()` in the existing shutdown hook (SIGTERM handler, `server.close` callback), before the app's own client flush, which stays; add a hook only if none exists |
| Serverless handler, script, CLI | `await flush()` before returning or exiting (a top-level `aiTask` already does it, within 2 s: `aiTask(name, { flush: { timeoutMs } }, fn)`) |

```ts
import { shutdown } from '@rudderstack/ai';

process.on('SIGTERM', async () => {
  await shutdown(); // ends open interactions as incomplete, then flushes every client the SDK used
  process.exit(0);
});
```

`flush()` and `shutdown()` share one deadline for classifications and every client (10 s, or `{ timeoutMs }`), never throw, never close the client, and resolve `false` when time ran out (`flush_timeout`). `configure({ flushOnExit })` (on by default) also flushes for up to 2 s when the event loop empties; it installs no signal handler.

From 0.7.0, `flush()` and `shutdown()` drain the app's own client too, so its `flush()` afterwards has nothing left to fail on: when the client's flush throws or rejects, they resolve `false` and pass that first error, unchanged, to `onError` with `kind: 'flush_failed'`. A timeout does not hide it (both `flush_timeout` and `flush_failed` are reported), and an error the client raises after the deadline is still reported once. If the app logs or alerts on its client's flush errors, move that into `configure({ onError: (err, info) => { if (info.kind === 'flush_failed') ... } })` (called at most once per kind per minute) instead of around its own `client.flush()`.

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

## 9. Classifier (`spec.config.labels_set_by: classifier`)

`labels_set_by: app` needs no classifier: inside the interaction, `interaction.setIntent(label)` / `interaction.setOutcome(label)` with the app's own per-turn category or outcome, mapped to the plan's lists.

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
      // cacheWritePerMtok: 3.75, // cache writes; without it they are priced at inputPerMtok
      // cacheWrite1hPerMtok: 6,
    },
  },
});
```

Register each model the app uses; a family name never prices another model (`gpt-4o` does not price `gpt-4o-mini`). Gemini API calls report provider `gcp.gemini`, Vertex AI calls `gcp.vertex_ai`, and they are priced separately: register each one the app calls with its `provider` (`registerPrice(model, { ..., provider: 'gcp.vertex_ai' })`); a price with no `provider` covers both. `google` and `google.vertex` still work as aliases of `gcp.gemini` and `gcp.vertex_ai`. Service tier, 1-hour cache writes and provider-hosted tool calls are read from responses automatically; the price options above only turn them into cost.

## 11. Switches (`spec.switches`)

Read both through the app's config library when it has one; env names from the plan.

```ts
const aiEventsOn = process.env.AI_EVENTS_ENABLED !== 'false'; // ai_events_env, default on

// Off: a client that sends nothing, and no classifier, evaluator or other options.
configure(aiEventsOn ? { analytics, captureContent: false /* , ... */ } : { analytics: { track() {} } });
if (aiEventsOn) wrapMcpServer(server, { identify /* , ... */ }); // also gate registerTracing()

// legacy_events_env, default on: the old call, unchanged
if (process.env.AI_EVENTS_LEGACY_EVENT !== 'false') {
  analytics.track({ userId, event: 'chatTurnCompleted', properties: { ... } });
}
```

`configure()` changes only the keys passed, so a reloadable config calls it again on change (pass `classifier: null` / `evaluator: null` when turning off). Wrapped clients and `aiInteraction` stay in place either way. MCP wrappers and the SDK's tracing follow the switch only on restart: a wrapper keeps the client it was given, so after an on-to-off reload `mcp_*` events stop only once the process restarts; say so in the plan's switch-off and rollback text.

`configure()` does not reach the browser: expose `aiEventsOn` to the page the way the app exposes its other config, and gate `trackAi` on it (`client-events.md`, "Code").

## 12. MCP server: `wrapMcpServer`

One call per server, before `connect()`, where the `McpServer` (or low-level `Server`) is created. An app that serves several MCP endpoints wraps each, with a distinct name in each server's constructor, and an `identify` that reads what that endpoint's auth put on the request. The same call covers `@modelcontextprotocol/sdk` 1.x (`McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`, low-level `Server`) and `@modelcontextprotocol/server` 2.x. Tools, resources and prompts stay as written.

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
- Supported: `@modelcontextprotocol/sdk` `>=1.31.0 <2.0.0` (protocol up to 2025-11-25) and `@modelcontextprotocol/server` `>=2.0.0 <3.0.0` (also the stateless 2026-07-28, with elicitation through `input_required`), on stdio and Streamable HTTP, plus the deprecated HTTP+SSE on 1.x only.
- State (`mcp_client_seen` window, call counters, retry hashes, pending elicitations) is in memory per server name, per process: servers rebuilt per request under one name share it, so give each distinct server a unique name. Each replica reports its own `mcp_client_seen`.
- Flush when the process stops (section 7): the existing shutdown hook for HTTP servers; for stdio, on stdin `end` and `SIGTERM`.
- `call_index` counts reported calls with no gaps: on 2026-07-28 the `input_required` leg sends no `mcp_tool_called`, and the elicitation retry keeps that leg's `call_index`.
- A declared tool event follows its `mcp_tool_called` on success and on failure, including a call whose arguments failed validation (`tool_status: error`).
- An agent built with this SDK and the OpenAI Agents SDK passes its `interaction_id` to MCP servers with `toolMetaResolver: rudderStackMcpToolMeta()` (from `@rudderstack/ai/openai-agents`) on `MCPServerStdio` / `MCPServerStreamableHttp` / `MCPServerSSE`, so each `mcp_tool_called` joins the answer that made it. It adds `com.rudderstack/trace_id` only when the interaction has a `trace_id`, and `traceparent` only with `linkTraceId: true`. The agent's `tool_breakdown` entries for those tools carry `mcp_server`, read from the Agents SDK function span: keep Agents SDK tracing on (no `tracingDisabled`, no `OPENAI_AGENTS_DISABLE_TRACING`).
- MCP Events (`mcpEvents: true`, `trackMcpEventSubscription`, `wrapMcpEventSender`) only when the plan turns it on: experimental. A delivery without `subscriptionId` or `eventId` is dropped with one warning per process; a missing `eventName` is sent as `unknown`.

## 13. Tests

Per surface, a server-side test that drives the entry point with the app's existing model mock and asserts the captured events through a stub client:

```ts
import { configure, flush, type TrackMessage } from '@rudderstack/ai';

const events: TrackMessage[] = [];
beforeEach(() => {
  events.length = 0;
  configure({ analytics: { track: (m) => void events.push(m) } });
});

it('sends one answer per chat turn', async () => {
  await request(app).post('/api/chat').send({ message: 'hi', conversationId: 'c1' }); // the app's own test client
  await flush();
  const answers = events.filter((e) => e.event === 'ai_response_received');
  expect(answers).toHaveLength(1);
  expect(answers[0].properties).toMatchObject({ conversation_id: 'c1', feature: 'support_bot', response_status: 'success' });
});
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Warning `no RudderStack client` | `configure({ analytics })` did not run before the first call |
| One answer split into several `ai_response_received` | calls outside `aiInteraction`, a stream read after the callback returned without `bind`, or a LangChain handler on a model constructor |
| Events missing from a script or Lambda | `await flush()` before exit |
| No `total_cost_usd` | no registered price for the model (for Gemini, for its provider `gcp.gemini` / `gcp.vertex_ai`) and no provider-reported cost |
| No `trace_id` | opt-in: pass `traceId` / `setTraceId()`, or register the span processor with `linkTraceId: true` |
| `response_text` / `tool_breakdown` entries missing on a large answer | the event was over 30,000 bytes of properties: captured text is dropped first, then breakdown entries from the end |

`RUDDERSTACK_AI_DEBUG=1` logs everything the SDK drops or ignores.
