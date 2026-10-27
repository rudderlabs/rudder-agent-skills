# Client (browser) events

Browser events go through the app's EXISTING RudderStack JavaScript SDK (v3 `rudderanalytics`, script tag or `@rudderstack/analytics-js`). There is no browser AI SDK and none is added. When the page has no RudderStack JavaScript SDK, skip the client surface.

## Who sends what

The server SDK sends the prompt, the answer and feedback. The browser sends its own copies of them by default, with `source: "client"`, so matching rows per `interaction_id` measure the gap between what the server produced and what the user saw:

| Event | Sender | Notes |
|---|---|---|
| `ai_user_prompt_created`, `ai_response_received` | server SDK | the counted rows: dashboards count answers with `source` absent or `server` |
| `ai_user_prompt_created`, `ai_response_received` with `source: "client"` | browser, by default | one of each per `interaction_id`, alongside the server's; only what the browser observed |
| `ai_user_action` feedback (`feedback_given`, `feedback_retracted`) | both, by default: server (`trackAction`) in the feedback endpoint, browser with `source: "client"` in the click handler | dashboards take the client row per `interaction_id` as the final state and fall back to the server row; with no server feedback endpoint, the browser copy is the only one (do not add an endpoint for it) |
| `ai_user_action` other actions (`copied_response`, `shared`, `reported`, `regenerated`, and `accepted`, `rejected`, `edited` for a draft, code change or other artifact the AI produced) | the browser; also the server when the action already hits a server endpoint | |
| `ai_user_action` with `action_type: "clicked_through"` | browser only | the user opened a card, resource or doc from the answer, or used a component the AI rendered (a chart, an MCP Apps widget): `action_details.card_kind` names it, `action_details.target_type` the kind of object opened; never a URL. A form the AI rendered that the user submits is tracked by the business action it triggers, not here; nothing is sent just for rendering |
| `ai_assistant_opened`, `ai_assistant_closed`, `ai_conversation_started`, `ai_conversation_switched`, `ai_conversation_renamed`, `ai_conversation_deleted` | browser | engagement; no server counterpart |

Either side can opt out of a copy: the plan then omits it (the browser simply does not call `track`; the server endpoint does not call `trackAction`). Client copies are never sampled: if the app samples its browser analytics, send them outside that sampling, since the per-interaction gap needs every row.

Gaps, matched per `interaction_id`: a client prompt with no server prompt means the request never reached the SDK; a server answer with no client answer means it was produced but not shown, or the client event was lost (ad blocker, failed render). The server's `client_disconnected: true` on its answer separates the user leaving from a lost client event. The spec v0.3 SDKs set it when the request closes under their middleware (Node.js middleware, Python ASGI, Go `rudderstackai.Middleware`) or a bound stream is cancelled; Django and Flask (WSGI) cannot see a disconnect, so there a missing client copy stays ambiguous.

Each side reports what it saw: never forward model, provider, tokens, cost, tool counts, `finish_reason` or `trace_id` from the server to the browser to re-send. They stay on the server event; join on `interaction_id`.

`interaction_id`: the browser mints one per prompt (`crypto.randomUUID()`), sends it with the chat request (`x-interaction-id` header or a body field), and uses it for later actions on that answer. The server validates it is a UUID and passes it as `interactionId` / `interaction_id`; if invalid it lets the SDK mint one and returns that. When the plan says `interaction_id_source: sdk` or `app`, the browser instead reads the ID from the chat response.

Identity: the JavaScript SDK supplies `userId` / `anonymousId` itself; `userId` only after the page calls `rudderanalytics.identify(userId)`. Without it, browser events carry only `anonymousId` and join the server's events through that and the cookies; adding `identify()` on login is a separate change, out of scope here. Its cookies (`rl_anonymous_id`, `rl_session`) reach same-origin server routes, which is how the server's events join the same profile and session. Cross-origin chat APIs need `credentials: 'include'` and a cookie domain the API can read.

## Code

One helper, so every client AI event carries `source`, `feature` and `surface`, unknown IDs are left out rather than sent as `null`, and nothing is sent when the AI events switch is off. Put it in the app's browser analytics module (exported), or at the top of the page script when there is none:

```js
const AI_FEATURE = 'support_bot'; // the surface's feature from the plan's ## Config
const AI_SURFACE = 'web'; // the surface's channel from the plan's ## Config (web | mobile | ...)
// ai_events_env as the server evaluated it, read from wherever the app already exposes config or flags to the page
const AI_EVENTS_ON = appConfig.aiEventsEnabled !== false;

function trackAi(event, properties = {}) {
  if (!AI_EVENTS_ON) return; // configure() never reaches the browser, so the switch must
  const defined = Object.fromEntries(Object.entries(properties).filter(([, v]) => v != null));
  window.rudderanalytics?.track(event, { source: 'client', feature: AI_FEATURE, surface: AI_SURFACE, ...defined });
}
```

With `@rudderstack/analytics-js`, call `.track` on the app's existing `RudderAnalytics` instance instead of `window.rudderanalytics`. With the script-tag snippet, check its method stub list includes `track` (calls made before the SDK loads are queued only for stubbed methods).

`appConfig.aiEventsEnabled` stands for the app's own channel: a server-rendered value, the config or flags endpoint the page already fetches, or the flags client it already uses. The server sets it from the same `ai_events_env` value it passes to `configure()`; the page's legacy `track` calls do not read it. With a reloadable switch, the page picks up a change on its next load.

Chat submit: mint the ID, send the client prompt copy, send the request, then send the client answer copy when the turn reaches its final state on screen (completed, failed, or stopped by the user). From the response on, use the ID the server returns (it differs only if the server rejected yours).

```js
let interactionId = crypto.randomUUID();
const submittedAt = performance.now();
trackAi('ai_user_prompt_created', {
  interaction_id: interactionId,
  conversation_id: conversationId, // absent on the first message of a new thread
  prompt_source: 'composer', // composer | starter_suggestion | follow_up_action | retry
  prompt_length: message.length,
});
let status = 'success';
let errorKind;
try {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-interaction-id': interactionId },
    body: JSON.stringify({ message, conversationId }), // same-origin requests send cookies by default
  });
  // error bodies carry the IDs too; only they may be unreadable (a stop mid-body still throws: cancelled)
  const data = response.ok ? await response.json() : await response.json().catch(() => ({}));
  conversationId = data.conversationId ?? conversationId;
  interactionId = data.interactionId ?? interactionId;
  if (!response.ok) {
    status = 'error';
    errorKind = response.status >= 500 ? 'http_5xx' : 'http_4xx';
  } else {
    render(data); // the app's existing rendering
  }
} catch (err) {
  status = err?.name === 'AbortError' ? 'cancelled' : 'error'; // the user pressed stop
  if (status === 'error') errorKind = navigator.onLine ? 'interrupted' : 'offline';
}
trackAi('ai_response_received', {
  interaction_id: interactionId,
  conversation_id: conversationId,
  response_status: status, // success | error | cancelled
  client_error_kind: errorKind, // offline | interrupted | http_4xx | http_5xx | agent_error | unknown
  time_to_first_render_ms: Math.round(performance.now() - submittedAt), // streams: at the first chunk shown
});
```

Fit this into the app's existing submit handler; do not restructure it. With `interaction_id_source: sdk` or `app` the browser learns the ID only from the response: send the prompt copy then, just before the answer copy. An error reported inside a successful HTTP response or stream is `client_error_kind: 'agent_error'`. The server returns `conversationId` and `interactionId` on its error responses too, once the interaction has opened (a failed answer has a server row to join): extend the route's error path if it returns neither. When the first message of a new thread fails before the server returns a `conversation_id` (the request never reached it, or failed before the interaction opened), skip the answer copy: both schemas require `conversation_id` on `ai_response_received`, and there is no server answer to join.

A chat API on another origin needs `credentials: 'include'` (and CORS that allows credentials) for the cookies to arrive.

Actions the browser sends (those listed in the plan's `client_events`):

```js
// thumbs: also sent by the server's feedback endpoint, by default
trackAi('ai_user_action', {
  interaction_id: interactionId,
  conversation_id: conversationId,
  action_type: 'feedback_given', // feedback_retracted when the user takes it back, same feedback_type
  action_details: { feedback_type: 'thumbs', feedback_value: helpful ? 1 : -1 },
});

// copy button
trackAi('ai_user_action', {
  interaction_id: interactionId,
  conversation_id: conversationId,
  action_type: 'copied_response',
});

// a card, resource or doc opened from the answer
trackAi('ai_user_action', {
  interaction_id: interactionId,
  conversation_id: conversationId,
  action_type: 'clicked_through',
  action_details: { card_kind: 'source_card', target_type: 'doc' }, // kinds only: never a URL, ID or query string
});

// a draft, code change or other artifact the AI produced: kept, discarded, or kept after editing
trackAi('ai_user_action', {
  interaction_id: interactionId,
  conversation_id: conversationId,
  action_type: 'accepted', // rejected | edited; never the artifact or the edit itself
});
```

Engagement:

```js
trackAi('ai_assistant_opened', { entry_point: 'launcher', conversation_id: conversationId }); // null before the first chat: dropped by trackAi
trackAi('ai_assistant_closed', { conversation_id: conversationId, open_duration_ms: Date.now() - openedAt });
trackAi('ai_conversation_started', { conversation_id: newConversationId });
trackAi('ai_conversation_switched', { conversation_id: nextId, from_conversation_id: currentId });
trackAi('ai_conversation_renamed', { conversation_id: conversationId }); // never the title text
trackAi('ai_conversation_deleted', { conversation_id: conversationId });
```

Never send prompt, answer, feedback text or conversation titles from the browser.

## Schema

The AI events v0.3 JSON Schema (`ai-events-v0.3.schema.json`) defines the client copies' fields (`source`, `prompt_source`, `client_error_kind`, `clicked_through`, `card_kind`) but not the engagement events, and it cannot tell a client copy that carries generation details from a server row. The client-only rules (`source: client`, no text, no generation details, the engagement events) are in `assets/ai-client-events.schema.json` of the sibling `rudder-ai-events-verify` skill (`../rudder-ai-events-verify/assets/ai-client-events.schema.json` from this skill's directory); verify validates client events against both.
