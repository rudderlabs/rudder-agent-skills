# Node.js recipes (`@rudderstack/ai` 0.4.0)

Node.js 24+. ESM shown; CommonJS works the same with `require('@rudderstack/ai')` and `require('@rudderstack/ai/openai')`. Every entry point: `@rudderstack/ai`, `/openai`, `/anthropic`, `/google-genai`, `/bedrock`, `/vercel-ai-sdk`, `/langchain`, `/claude-agent-sdk`, `/openai-agents`, `/middleware`, `/tracing`.

## 1. Install (exact pins)

| Manager | Command |
|---|---|
| npm | `npm install --save-exact @rudderstack/ai@0.4.0` |
| pnpm | `pnpm add --save-exact @rudderstack/ai@0.4.0` |
| yarn | `yarn add --exact @rudderstack/ai@0.4.0` |
| bun | `bun add --exact @rudderstack/ai@0.4.0` |

Only when the plan says `rudderstack.client: new`, add the client too: `@rudderstack/rudder-sdk-node@3.0.16`. The provider and framework packages (`openai`, `@anthropic-ai/sdk`, `ai`, `@langchain/core`, ...) are optional peer dependencies the app already has; do not add or bump them. Run the install from the `sdks[].path` directory. Commit the lockfile change.

## 2. Configure once at startup

Put this next to where the app's RudderStack client is created (`rudderstack.client_path`), so it runs once per process before any request:

```ts
import { configure } from '@rudderstack/ai';
import { analytics } from './analytics.js'; // the app's existing @rudderstack/rudder-sdk-node client

configure({
  analytics,
  captureContent: false, // spec.config.capture_content
  // toolBreakdown: true,  // spec.config.tool_breakdown
  // eventRules / classifier / prices: sections 8-10, only when the plan has them
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
| Anything else | inside the interaction: `interaction.recordCall({ provider, model, inputTokens, outputTokens, responseId })` |

One integration per call path: do not add a LangChain handler around a wrapped client on purpose.

## 4. Chat surface: one `aiInteraction` per user turn

Identity from browser cookies, once for the whole app (Express / Connect):

```ts
import { aiContextMiddleware } from '@rudderstack/ai/middleware';

app.use(aiContextMiddleware()); // before the chat and feedback routes
```

Next.js App Router: `export const POST = withAiContext(async (request: Request) => handle(request));`. Hono or any Fetch handler: `serve({ fetch: withAiContext(app.fetch) })`. Without middleware, pass `request: req` (or `cookies`) to `aiInteraction`.

The route (non-streaming):

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
- Return `interaction.id` to the client (body field or `x-interaction-id` header) when the plan's `interaction_id_source` is `sdk`, so feedback can reference it.
- Pass `traceId` (or call `interaction.setTraceId(id)`) when the plan has `tracing.trace_id_source`.
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

## 5. Feedback and other actions (server sender)

```ts
import { trackAction } from '@rudderstack/ai';

app.post('/api/feedback', (req, res) => {
  const { interactionId, conversationId, helpful } = req.body;
  trackAction({
    userId: req.user?.id,
    interactionId,
    conversationId,
    actionType: 'feedback_given', // feedback_retracted | copied_response | shared | reported | regenerated
    actionDetails: { feedback_type: 'thumbs', feedback_value: helpful ? 1 : 0 },
  });
  // ...the endpoint's existing work
  res.sendStatus(204);
});
```

`interactionId` and `conversationId` are required (else dropped with a warning). Cookies come from the middleware's context; without middleware, wrap the call in `aiContext({ cookies: req.headers.cookie }, () => trackAction(...))`.

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

## 7. Flush

| Process | Do |
|---|---|
| Long-running server | `await flush()` in the existing shutdown hook (SIGTERM handler, `server.close` callback); add one only if none exists |
| Serverless handler, script, CLI | `await flush()` before returning or exiting (a top-level `aiTask` already does it) |

```ts
import { flush } from '@rudderstack/ai';

process.on('SIGTERM', async () => {
  await flush(); // waits for classifications, then flushes every RudderStack client the SDK used
  process.exit(0);
});
```

## 8. Declared tool events (`spec.config.event_rules`)

```ts
configure({
  eventRules: {
    tools: {
      save_memory: 'memory_captured',
      create_ticket: {
        event: 'ticket_created',
        properties: (args) => ({ priority: (args as { priority?: string })?.priority }),
        when: (_args, result) => result !== undefined, // when: success
      },
    },
  },
});
```

Names starting with `ai_` throw. Results reach the rule only when the whole tool loop runs inside one `aiInteraction`.

## 9. Classifier (`spec.config.classifier.enabled: true`)

```ts
import Anthropic from '@anthropic-ai/sdk';

configure({
  classifier: {
    client: new Anthropic(), // the app's own provider client and key; its calls are never tracked
    model: 'claude-haiku-4-5',
    intents: ['refund_request', 'order_status', 'product_question'], // plan intents without "other"
    // outcomes: ['resolved', 'partial', 'unresolved', 'unclear'],
  },
});
```

Classification needs prompt or answer text: pass `promptText` to `aiInteraction` (it is used for classification even with capture off).

## 10. Prices (`spec.config.prices`)

```ts
configure({ prices: { 'gpt-4.1-mini': { inputPerMtok: 0.4, outputPerMtok: 1.6, cachedInputPerMtok: 0.1 } } });
```

Register each model the app uses; a family name never prices another model (`gpt-4o` does not price `gpt-4o-mini`).

## 11. Legacy event behind a flag

```ts
// Old hand-built event, kept for the migration window (ai-events.yaml legacy_events).
if (process.env.AI_EVENTS_LEGACY_EVENT !== 'false') {
  analytics.track({ userId, event: 'chatTurnCompleted', properties: { ... } }); // unchanged
}
```

Leave the old call's properties as they are; only wrap it in the flag.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Warning `no RudderStack client` | `configure({ analytics })` did not run before the first call |
| One answer split into several `ai_response_received` | calls outside `aiInteraction`, a stream read after the callback returned without `bind`, or a LangChain handler on a model constructor |
| Events missing from a script or Lambda | `await flush()` before exit |
| No `total_cost_usd` | no registered price for the model and no provider-reported cost |

`RUDDERSTACK_AI_DEBUG=1` logs everything the SDK drops or ignores.
