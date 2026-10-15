# Client (browser) events

Browser events go through the app's EXISTING RudderStack JavaScript SDK (v3 `rudderanalytics`, script tag or `@rudderstack/analytics-js`). There is no browser AI SDK and none is added. When the page has no RudderStack JavaScript SDK, skip the client surface.

## Who sends what

Every event is sent once, by one side:

| Event | Sender | Notes |
|---|---|---|
| `ai_user_prompt_created`, `ai_response_received` | server SDK | the browser never sends these for an answer the server SDK tracks |
| `ai_user_prompt_created`, `ai_response_received` with `source: "client"` | browser | only for answers produced without the server SDK on the path (a model called from the browser, a third-party widget); one of each per `interaction_id` |
| `ai_user_action` | server (`trackAction`) when the action already hits a server endpoint (feedback POST); otherwise the browser with `source: "client"` | never both for the same action |
| `ai_assistant_opened`, `ai_assistant_closed`, `ai_conversation_started`, `ai_conversation_switched`, `ai_conversation_renamed`, `ai_conversation_deleted` | browser | engagement; no server counterpart |

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

Chat submit: mint the ID and send it; send no prompt event from the browser when the server SDK tracks the answer. Then use the ID the server returns (it differs only if the server rejected yours).

```js
let interactionId = crypto.randomUUID();
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-interaction-id': interactionId },
  body: JSON.stringify({ message, conversationId }), // same-origin requests send cookies by default
});
const data = await response.json();
interactionId = data.interactionId ?? interactionId;
```

A chat API on another origin needs `credentials: 'include'` (and CORS that allows credentials) for the cookies to arrive.

Actions the browser sends (only those the plan assigns to `sender: client`):

```js
// copy button
trackAi('ai_user_action', {
  interaction_id: interactionId,
  conversation_id: conversationId,
  action_type: 'copied_response',
});

// thumbs, when there is no server feedback endpoint
trackAi('ai_user_action', {
  interaction_id: interactionId,
  conversation_id: conversationId,
  action_type: 'feedback_given',
  action_details: { feedback_type: 'thumbs', feedback_value: 1 },
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

Browser-only answer (no server SDK on the path):

```js
trackAi('ai_user_prompt_created', { interaction_id: id, conversation_id: cid, input_method: 'text' });
// ...after the answer is shown or fails
trackAi('ai_response_received', {
  interaction_id: id,
  conversation_id: cid,
  response_status: 'success', // success | error | timeout | cancelled
  latency_ms: Math.round(performance.now() - startedAt),
});
```

Never send prompt, answer, feedback text or conversation titles from the browser.

## Schema

Client events are not part of AI events spec v0.2: this schema defines them for the plugin, and the spec's custom-properties rule allows `source` on the spec events. `ai_user_action`, `ai_user_prompt_created` and `ai_response_received` from the browser must also pass the matching definition in `spec/ai-events-v0.2.schema.json`.

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
      "properties": { "action_details": { "not": { "required": ["feedback_text"] } } }
    },
    "ai_user_prompt_created": {
      "allOf": [{ "$ref": "#/$defs/with_interaction" }],
      "not": { "required": ["prompt_text"] }
    },
    "ai_response_received": {
      "allOf": [{ "$ref": "#/$defs/with_interaction" }],
      "required": ["response_status"],
      "not": { "required": ["response_text"] }
    }
  }
}
```
