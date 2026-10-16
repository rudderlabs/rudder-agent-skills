# Client (browser) events

Browser events go through the app's EXISTING RudderStack JavaScript SDK (v3 `rudderanalytics`, script tag or `@rudderstack/analytics-js`). There is no browser AI SDK and none is added. When the page has no RudderStack JavaScript SDK, skip the client surface.

## Who sends what

The server SDK sends the prompt, the answer and feedback. The browser sends its own copies of them by default, with `source: "client"`, so matching rows per `interaction_id` measure the gap between what the server produced and what the user saw:

| Event | Sender | Notes |
|---|---|---|
| `ai_user_prompt_created`, `ai_response_received` | server SDK | the counted rows: dashboards count answers with `source` absent or `server` |
| `ai_user_prompt_created`, `ai_response_received` with `source: "client"` | browser, by default | one of each per `interaction_id`, alongside the server's; only what the browser observed |
| `ai_user_action` feedback (`feedback_given`, `feedback_retracted`) | both, by default: server (`trackAction`) in the feedback endpoint, browser with `source: "client"` in the click handler | dashboards take the client row per `interaction_id` as the final state and fall back to the server row; with no server feedback endpoint, the browser copy is the only one (do not add an endpoint for it) |
| `ai_user_action` other actions (`copied_response`, `shared`, `reported`, `regenerated`) | the browser; also the server when the action already hits a server endpoint | |
| `ai_user_action` with `action_type: "clicked_through"` | browser only | the user opened a card, resource or doc from the answer: `action_details.card_kind`, `action_details.target_type`; never a URL |
| `ai_assistant_opened`, `ai_assistant_closed`, `ai_conversation_started`, `ai_conversation_switched`, `ai_conversation_renamed`, `ai_conversation_deleted` | browser | engagement; no server counterpart |

Either side can opt out of a copy: the plan then omits it (the browser simply does not call `track`; the server endpoint does not call `trackAction`). Client copies are never sampled: if the app samples its browser analytics, send them outside that sampling, since the per-interaction gap needs every row.

Gaps, matched per `interaction_id`: a client prompt with no server prompt means the request never reached the SDK; a server answer with no client answer means it was produced but not shown, or the client event was lost (ad blocker, failed render). The spec's server-side `client_disconnected` flag separates the user leaving from a lost client event; SDK 0.4.0 does not send it yet.

Each side reports what it saw: never forward model, provider, tokens, cost, tool counts, `finish_reason` or `trace_id` from the server to the browser to re-send. They stay on the server event; join on `interaction_id`.

`interaction_id`: the browser mints one per prompt (`crypto.randomUUID()`), sends it with the chat request (`x-interaction-id` header or a body field), and uses it for later actions on that answer. The server validates it is a UUID and passes it as `interactionId` / `interaction_id`; if invalid it lets the SDK mint one and returns that. When the plan says `interaction_id_source: sdk` or `app`, the browser instead reads the ID from the chat response.

Identity: the JavaScript SDK supplies `userId` / `anonymousId` itself; `userId` only after the page calls `rudderanalytics.identify(userId)`. Without it, browser events carry only `anonymousId` and join the server's events through that and the cookies; adding `identify()` on login is a separate change the user decides. Its cookies (`rl_anonymous_id`, `rl_session`) reach same-origin server routes, which is how the server's events join the same profile and session. Cross-origin chat APIs need `credentials: 'include'` and a cookie domain the API can read.

## Code

One helper, so every client AI event carries `source` and `feature`, and unknown IDs are left out rather than sent as `null`. Put it in the app's browser analytics module (exported), or at the top of the page script when there is none:

```js
const AI_FEATURE = 'support_bot'; // the surface's feature from ai-events.yaml

function trackAi(event, properties = {}) {
  const defined = Object.fromEntries(Object.entries(properties).filter(([, v]) => v != null));
  window.rudderanalytics?.track(event, { source: 'client', feature: AI_FEATURE, ...defined });
}
```

With `@rudderstack/analytics-js`, call `.track` on the app's existing `RudderAnalytics` instance instead of `window.rudderanalytics`. With the script-tag snippet, check its method stub list includes `track` (calls made before the SDK loads are queued only for stubbed methods).

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
  if (!response.ok) {
    status = 'error';
    errorKind = response.status >= 500 ? 'http_5xx' : 'http_4xx';
  } else {
    const data = await response.json();
    render(data); // the app's existing rendering
    conversationId = data.conversationId ?? conversationId;
    interactionId = data.interactionId ?? interactionId;
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

Fit this into the app's existing submit handler; do not restructure it. With `interaction_id_source: sdk` or `app` the browser learns the ID only from the response: send the prompt copy then, just before the answer copy. An error reported inside a successful HTTP response or stream is `client_error_kind: 'agent_error'`.

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
```

Engagement:

```js
trackAi('ai_assistant_opened', { entry_point: 'launcher', conversation_id: conversationId }); // null before the first chat: dropped by trackAi
trackAi('ai_assistant_closed', { conversation_id: conversationId, open_duration_ms: Date.now() - openedAt });
trackAi('ai_conversation_started', { conversation_id: newConversationId });
trackAi('ai_conversation_switched', { conversation_id: nextId, previous_conversation_id: currentId });
trackAi('ai_conversation_renamed', { conversation_id: conversationId }); // never the title text
trackAi('ai_conversation_deleted', { conversation_id: conversationId });
```

Never send prompt, answer, feedback text or conversation titles from the browser.

## Schema

The AI events v0.2 JSON Schema shipped with SDK 0.4.0 covers server events only: client events, including the client copies, are validated against this schema instead. It follows the spec's client section: copies carry `source: client`, the server's enums (plus `clicked_through` and `client_error_kind`), no text, and no generation details.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://rudderstack.com/schemas/ai-client-events/0.1.0",
  "title": "RudderStack AI client events v0.1.0 (draft)",
  "$defs": {
    "common": {
      "type": "object",
      "required": ["source"],
      "properties": {
        "source": { "const": "client" },
        "feature": { "type": "string", "minLength": 1 },
        "conversation_id": { "type": "string", "minLength": 1 }
      }
    },
    "with_conversation": {
      "allOf": [{ "$ref": "#/$defs/common" }],
      "required": ["conversation_id"]
    },
    "with_interaction": {
      "allOf": [{ "$ref": "#/$defs/with_conversation" }],
      "required": ["interaction_id"],
      "properties": { "interaction_id": { "type": "string", "minLength": 1 } }
    },
    "ai_assistant_opened": {
      "allOf": [{ "$ref": "#/$defs/common" }],
      "properties": { "entry_point": { "type": "string", "examples": ["launcher", "shortcut", "deep_link", "auto"] } }
    },
    "ai_assistant_closed": {
      "allOf": [{ "$ref": "#/$defs/common" }],
      "properties": { "open_duration_ms": { "type": "integer", "minimum": 0 } }
    },
    "ai_conversation_started": { "allOf": [{ "$ref": "#/$defs/with_conversation" }] },
    "ai_conversation_switched": {
      "allOf": [{ "$ref": "#/$defs/with_conversation" }],
      "properties": { "previous_conversation_id": { "type": "string", "minLength": 1 } }
    },
    "ai_conversation_renamed": {
      "allOf": [{ "$ref": "#/$defs/with_conversation" }],
      "not": { "anyOf": [{ "required": ["title"] }, { "required": ["name"] }] }
    },
    "ai_conversation_deleted": { "allOf": [{ "$ref": "#/$defs/with_conversation" }] },
    "ai_user_action": {
      "allOf": [{ "$ref": "#/$defs/with_interaction" }],
      "required": ["action_type"],
      "properties": {
        "action_type": {
          "enum": ["feedback_given", "feedback_retracted", "copied_response", "shared", "reported", "regenerated", "clicked_through"]
        },
        "action_details": {
          "type": "object",
          "properties": {
            "feedback_type": { "type": "string" },
            "card_kind": { "type": "string" },
            "target_type": { "type": "string", "not": { "pattern": "[/?=]" } }
          },
          "not": { "anyOf": [{ "required": ["feedback_text"] }, { "required": ["url"] }, { "required": ["target_url"] }] }
        }
      }
    },
    "ai_user_prompt_created": {
      "allOf": [{ "$ref": "#/$defs/common" }],
      "required": ["interaction_id"],
      "properties": {
        "interaction_id": { "type": "string", "minLength": 1 },
        "prompt_source": { "enum": ["composer", "starter_suggestion", "follow_up_action", "retry"] },
        "suggestion_id": { "type": "string", "minLength": 1 },
        "prompt_length": { "type": "integer", "minimum": 0 }
      },
      "not": { "required": ["prompt_text"] }
    },
    "ai_response_received": {
      "allOf": [{ "$ref": "#/$defs/with_interaction" }],
      "required": ["response_status"],
      "properties": {
        "response_status": { "enum": ["success", "error", "timeout", "cancelled"] },
        "client_error_kind": { "enum": ["offline", "interrupted", "http_4xx", "http_5xx", "agent_error", "unknown"] },
        "time_to_first_render_ms": { "type": "integer", "minimum": 0 }
      },
      "not": {
        "anyOf": [
          { "required": ["response_text"] }, { "required": ["primary_model"] }, { "required": ["primary_provider"] },
          { "required": ["total_tokens"] }, { "required": ["total_cost_usd"] }, { "required": ["llm_call_count"] },
          { "required": ["tool_call_count"] }, { "required": ["usage_breakdown"] }, { "required": ["tool_breakdown"] },
          { "required": ["finish_reason"] }, { "required": ["trace_id"] }
        ]
      }
    }
  }
}
```
