# ai-events.md

The plan the setup writes at the repository root and commits with the instrumentation change. It is both the document the user reviews and the record the other skills read: `rudder-ai-events-instrument` implements only what it says, and `rudder-ai-events-verify` checks against it.

Layout, a contract the other skills rely on:

- **Front matter** between `---` lines: `spec_version`, `status` (`draft` | `approved`) and `time_to_integrate`.
- **Ten H2 sections**, exactly these headings in this order: `## Summary`, `## Breaking and semantic changes`, `## Intents and outcomes`, `## Surfaces`, `## Identity`, `## Cost`, `## Dependencies and blockers`, `## Known limits`, `## Files to change`, `## Config`. Instrument and verify locate content by heading: never rename, reorder, merge or drop one. A section that does not apply says "None" and why.
- **`## Config`** holds one fenced `yaml` block with every machine value. It is authoritative: when a section and Config disagree, fix the section. Instrument copies values from it; verify checks against it.

Never put secrets in the file: environment variable names only, never values.

## Example

````markdown
---
spec_version: "0.3.0"
status: draft                      # draft | approved; only an explicit user approval sets approved
time_to_integrate:                 # UTC, each written by the skill that reaches it; never estimated
  started_at: "2026-10-16T09:12Z"  # setup, discovery starts
  approved_at: null                # setup, plan approved
  instrumented_at: null            # instrument, after the full test suite passes
  verified_at: null                # verify, first PASS
  hours_spent: null                # the user only: hands-on time, not wall-clock
  notes: null                      # the user only: what slowed it down
---

# AI events plan: support-app

## Summary

| Surface | Route | Status |
|---|---|---|
| support-chat (chat) | `wrapOpenAI`, one interaction per turn | instrument |
| nightly-digest (background) | `wrap_anthropic`, one task per run, child task per workspace | instrument |
| support-widget (client) | client copies through `rudderanalytics` | instrument |
| docs-mcp (mcp) | `wrapMcpServer` with `identify` | instrument |

Branch: `feat/ai-events` (given by the user). Plan file: committed with the change, so instrument and verify can resume from it and a later sync can read Config.

Needs a decision: legacy `costUsd` is cumulative per conversation and `total_cost_usd` is per turn; confirm dashboards move to the new meaning (see Breaking and semantic changes).

## Breaking and semantic changes

| Current event.field | AI event.field | Same or differs | What changes |
|---|---|---|---|
| chatTurnCompleted.model | ai_response_received.primary_model | Differs | legacy sends the requested model; `primary_model` is the served one (`requested_model` appears only when they differ) |
| chatTurnCompleted.promptTokens | ai_response_received.total_input_tokens | Differs | legacy counts the first model call; the AI event sums every call in the tool loop |
| chatTurnCompleted.completionTokens | ai_response_received.total_output_tokens | Differs | same as above |
| chatTurnCompleted.latencyMs | ai_response_received.latency_ms | Differs | legacy starts at the model call; the AI event starts when the interaction opens in the route |
| chatTurnCompleted.costUsd | ai_response_received.total_cost_usd | Differs | legacy is cumulative per conversation; the AI event is per turn, and absent without prices |
| chatTurnCompleted.status (`ok`, `failed`) | ai_response_received.response_status | Differs | vocabulary is `success`, `error`, `timeout`, `cancelled`, `paused`, `incomplete`; Stop becomes `cancelled` |
| chatTurnCompleted.chatId | ai_response_received.conversation_id | Same | |
| chatTurnCompleted.messageId | ai_response_received.interaction_id | Same | the existing per-answer ID is reused (`interaction_id_source: app`) |
| chatTurnCompleted.promptLength | none | Differs | not carried over; dropped (user's choice) |

- Volume and coverage: legacy fires for user turns only; `ai_response_received` also fires for each nightly-digest run and workspace child task (`trigger: system`).
- Casing and codegen: the repo names events in camelCase and generates typed tracking calls from its tracking plan; AI events are snake_case and sent by the SDK, outside the generated client.
- Request and response changes: `POST /api/feedback` starts receiving `interaction_id` and `conversation_id`; `POST /api/chat` returns `x-interaction-id`.
- Browser copies: the browser sends its own prompt, answer and feedback events (`source: client`) alongside the server's.
- Legacy flag: `AI_EVENTS_LEGACY_EVENT` (default on), remove after 2026-12-31.

## Intents and outcomes

Intents:

| Label | Meaning |
|---|---|
| refund_request | the user asks for money back on an order |
| order_status | where an order is, or when it ships |
| product_question | features, sizing or compatibility of a product |
| other | anything else |

Outcomes:

| Label | Meaning |
|---|---|
| resolved | the answer settled the request |
| partial | part of the request was handled |
| unresolved | the request was not handled |
| escalated | handed to a person |
| unclear | cannot tell from the turn |

Populated: by the app. It already computes `ticket.category` per turn and maps it with `setIntent` (`src/routes/chat.ts`, `POST /api/chat`); outcomes stay empty (classifier off). With the classifier off and no app mapping, both are never populated.

## Surfaces

| Surface | Kind | Entry point | Model calls | Route |
|---|---|---|---|---|
| support-chat | chat | `src/routes/chat.ts:POST /api/chat` | `src/llm.ts:openai` (openai 7.34.0, gpt-4.1-mini) | `wrapOpenAI` |
| nightly-digest | background | `jobs/digest.py:main` (deploy/crontab) | `jobs/digest.py:client` (anthropic 1.4.0, claude-haiku-4-5) | `wrap_anthropic`, `ai_task` |
| support-widget | client | `public/app.js:chat form submit` | none | client events |
| docs-mcp | mcp | `src/mcp/server.ts:server.connect` | none | `wrapMcpServer` |

## Identity

- User: `req.user.id` from `src/middleware/auth.ts`; account: none.
- Browser: RudderStack JavaScript SDK v3 on `public/index.html`, never calls `identify()`; cookies `rl_anonymous_id`, `rl_session` reach `/api/chat` (same origin).
- Background: `ai_system`; each workspace child task sets `account_id` and `on_behalf_of`.
- MCP: OAuth subject `sub` as the user, `workspace_id` as the account.

## Cost

| Model ID | Input / output / cached input per 1M tokens (USD) | Source |
|---|---|---|
| gpt-4.1-mini | 0.4 / 1.6 / 0.1 | the user |
| claude-haiku-4-5 | 1 / 5 / 0.1 | the user |

Legacy events carried cost (`chatTurnCompleted.costUsd`), so prices are required. These are every model ID constant in the repo, Bedrock geo-prefixed IDs (`us.`, `eu.`, `global.`, ...) included; instrument checks each with `estimateCost`. A call without a price drops `total_cost_usd` for its whole turn.

## Dependencies and blockers

- `@rudderstack/ai` 0.5.0 (npm, exact pin); `rudderstack-ai` 0.5.0 (uv, exact pin).
- Registry and auth: public npm and PyPI; no private registry.
- Release-age gates: pnpm `minimumReleaseAge: 10080`; `@rudderstack/ai` 0.5.0 is newer, so it needs a `minimumReleaseAgeExclude` entry removed after 2026-10-30.
- Peer ranges: `openai` 7.34.0 is inside `>=7.0.0 <8.0.0`.
- Blockers: none.

## Known limits

- Intent lists are static: review them before launch and again once `other` grows.
- MCP state is per server name, per process: docs-mcp runs on several replicas.

## Files to change

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- `pyproject.toml`, `uv.lock`
- `src/analytics.ts`
- `src/llm.ts`
- `src/routes/chat.ts`
- `src/routes/feedback.ts`
- `src/mcp/server.ts`
- `jobs/digest.py`
- `public/app.js`

## Config

```yaml
version: rudder/ai-events/v1alpha1
kind: ai-events-plan
metadata:
  name: support-app
spec:
  sdks:
    - { language: node, path: ., package: "@rudderstack/ai", version: "0.5.0", extras: [], package_manager: pnpm,
        runtime: ">=24 (package.json engines)" }
    - { language: python, path: ., package: rudderstack-ai, version: "0.5.0", extras: [anthropic], package_manager: uv,
        runtime: "3.12 (.python-version)" }
  rudderstack:
    client: existing
    client_path: src/analytics.ts
    write_key_env: RUDDERSTACK_WRITE_KEY
    data_plane_url_env: RUDDERSTACK_DATA_PLANE_URL
    source_id: null
  config:
    capture_content: false
    tool_breakdown: false
    emit_llm_calls: false
    identity_from_cookies: true
    intents: [refund_request, order_status, product_question, other]
    outcomes: [resolved, partial, unresolved, escalated, unclear]
    labels_set_by: app               # classifier | app | none (never populated)
    classifier: { enabled: false }
    event_rules:
      - { tool: create_ticket, event: ticket_created, properties: [priority], when: always }
    scores: { evaluator: none, evaluations: [] }
    server_feedback: true
    prices:
      - { model: gpt-4.1-mini, provider: null, input_per_mtok: 0.4, output_per_mtok: 1.6, cached_input_per_mtok: 0.1 }
      - { model: claude-haiku-4-5, provider: null, input_per_mtok: 1, output_per_mtok: 5, cached_input_per_mtok: 0.1 }
  surfaces:
    - id: support-chat
      type: chat
      status: instrument
      reason: null
      feature: support_bot
      surface: web
      attachments: false
      entry_points: [{ path: src/routes/chat.ts, symbol: POST /api/chat }]
      llm_calls: [{ path: src/llm.ts, symbol: openai, library: openai, version: "7.34.0" }]
      integration: wrapOpenAI
      unit: interaction
      streaming: false
      conversation_id_source: req.body.conversationId
      interaction_id_source: app
      flush: shutdown
      client_disconnect: middleware
      feedback:
        - { path: src/routes/feedback.ts, symbol: POST /api/feedback, action_type: feedback_given,
            request_changes: [interaction_id, conversation_id] }
    - id: nightly-digest
      type: background
      status: instrument
      feature: digest
      entry_points: [{ path: jobs/digest.py, symbol: main (deploy/crontab) }]
      integration: wrap_anthropic
      unit: task
      task_name: nightly-digest
      trigger_source: schedule
      trigger_event_id_source: null
      conversation_id_source: '"nightly-digest:" + run date'
      account_id_source: null
      on_behalf_of_source: null
      anonymous_id_source: null
      child_tasks:
        - { task_name: workspace-digest, scope: per workspace (send_digest, thread pool),
            conversation_id_source: '"nightly-digest:" + workspace.id', account_id_source: workspace.id,
            on_behalf_of_source: workspace.owner_id }
      flush: task
    - id: support-widget
      type: client
      status: instrument
      feature: support_bot
      entry_points: [{ path: public/app.js, symbol: chat form submit }]
    - id: docs-mcp
      type: mcp
      status: instrument
      feature: docs_mcp
      entry_points: [{ path: src/mcp/server.ts, symbol: server.connect (streamable HTTP, /mcp) }]
  identity:
    user_id: { source: "req.user.id (src/middleware/auth.ts)", confirmed: true }
    anonymous_id: { source: "cookie rl_anonymous_id", confirmed: true }
    session_id: { source: "cookie rl_session", confirmed: true }
    account_id: { source: null, confirmed: true }
    browser_sdk: { present: true, version: "3", path: public/index.html, identifies_user: false, resets_on_logout: false }
    background_actor: ai_system
    open_questions: []
  tracing: { tool: none, trace_id_source: null }
  client_events:
    sdk_path: public/app.js
    interaction_id_minted_by: app
    events:
      - { event: ai_user_prompt_created, handler: public/app.js (chat form submit) }
      - { event: ai_response_received, handler: public/app.js (answer rendered, failed or stopped) }
      - { event: ai_user_action, action_type: feedback_given, handler: public/app.js (thumbs buttons) }
      - { event: ai_user_action, action_type: copied_response, handler: public/app.js (copy button) }
    opt_out: []
  legacy_events:
    - event: chatTurnCompleted
      path: src/routes/chat.ts
      sender: server
      mapping:
        model: ai_response_received.primary_model
        promptTokens: ai_response_received.total_input_tokens
        completionTokens: ai_response_received.total_output_tokens
        latencyMs: ai_response_received.latency_ms
        costUsd: ai_response_received.total_cost_usd
        status: ai_response_received.response_status
        chatId: ai_response_received.conversation_id
        messageId: ai_response_received.interaction_id
      unmapped: [promptLength]
      migration: { flag_env: AI_EVENTS_LEGACY_EVENT, remove_after: "2026-12-31" }
  mcp:
    servers:
      - surface_id: docs-mcp
        path: src/mcp/server.ts
        symbol: 'new McpServer({ name: "docs-server" })'
        name: docs-server
        sdk: "@modelcontextprotocol/sdk"
        sdk_version: "1.31.0"
        language: node
        integration: wrapMcpServer
        transport: streamable_http
        processes: several
        identify: { auth: "requireBearerAuth (src/mcp/auth.ts)", user_id: auth.extra.sub, account_id: auth.extra.workspace_id }
        request_context: { enabled: true, intents: [search_docs, read_page, other], user_sentiment: true }
        tools: [search_docs, get_page]
        resources: []
        prompts: []
        event_rules: []
        capability_requests: { enabled: false, capabilities: [] }
        mcp_events: false
        legacy_events: []
    agent_meta: []
  known_limits: [intent_lists_manual_review, mcp_state_per_process]
```
````

## Config keys

Values not shown in the example:

- `sdks[].version`: the exact release on spec v0.3 looked up in setup step 2.3 (0.5.0 or later for Node.js and Python, v0.1.0 or later for Go; never 0.4.0). `extras`: Python extras, or Go integration modules (`[rudderopenai, rudderotel]`). `package_manager`: `npm | pnpm | yarn | bun | uv | poetry | pip | go`.
- `rudderstack.client`: `existing | new` (new adds `rudder-sdk-node` / `rudder-sdk-python`).
- `config.capture_content: true` sends prompt, answer and feedback text, score explanations and MCP `call_reason` / `capability_detail` (masked).
- `config.labels_set_by`: `classifier` (`classifier.enabled: true`), `app` (the app calls `setIntent` / `setOutcome` or `trackScore`; the Intents and outcomes section names where), `none` (never populated).
- `config.classifier`, when enabled: `{ enabled: true, provider: anthropic | openai | custom, model, intent_summary: false, timeout_ms: 5000 }`, run on the app's own client and key. `intent_summary` is free text: personal data.
- `config.event_rules[]`: tool call to the app's own product event (never `ai_*`); `when: always | result_seen`. `[]` when none.
- `config.scores.evaluator`: `none | hook` (configure `evaluator`, the app's own judge) `| manual` (`trackScore` calls).
- `config.server_feedback: false` only with `client_events.opt_out: [server_feedback]`.
- `config.prices[]`: USD per 1M tokens, one entry per model ID the app sends. Optional keys: `cache_write_1h_per_mtok`, `tier_multipliers: { batch: 0.5, fast: 2 }`, `long_context: { threshold_tokens, input_per_mtok, output_per_mtok }`, `server_tool_per_call: { web_search: 0.01 }`, `provider` (only to price one provider; `gcp.gemini` and `gcp.vertex_ai` are priced separately, `google` / `google.vertex` are aliases).
- `surfaces[].type`: `chat | background | client | mcp`, also used for Kind in the Surfaces section. `status`: `instrument | skipped | blocked | unsupported`; `reason` required unless `instrument`.
- `surfaces[].surface`: `web | mobile | slack | teams | email | chatgpt_app | claude_app | ide | api | other`, or `per request: <expression>`.
- `surfaces[].integration`: `wrapOpenAI | wrapAnthropic | wrapGoogleGenAI | wrapBedrock | rudderstackMiddleware | RudderStackCallbackHandler | trackMessages | trackedQuery | trackedRun | recordCall | instrument_litellm` (Python: snake_case names); Go: `rudderopenai | rudderanthropic | ruddergenai | rudderbedrock | RecordCall`.
- `surfaces[].unit`: `interaction` (one per user turn) `| task` (one per run). `flush`: `shutdown | task | per-run`. `client_disconnect`: `middleware | bound-stream | none` (Django/Flask: known limit). `attachments: true` passes `attachment_count` / `attachment_types` (kinds only).
- `surfaces[].trigger_source`: `schedule | webhook | queue | slack | agent | api | user | mcp_event`; with `mcp_event`, `trigger_event_id_source` is the update's `event_id`. `anonymous_id_source`: a stable per-tenant ID for multi-tenant jobs; `null` keeps `ai_system`.
- `surfaces[].feedback[].action_type`: `feedback_given`, or `accepted | rejected | edited` for drafts and other artifacts.
- `tracing.tool`: `none | langfuse | langsmith | opentelemetry`; `trace_id_source` e.g. `langfuse.getCurrentTraceId() (src/tracing.ts)`, `SDK span processor, linkTraceId: true` (Node.js; Python `link_trace_id=True`), `rudderotel.TraceID` (Go).
- `client_events.interaction_id_minted_by`: `client` (`crypto.randomUUID()` per prompt, sent to the server) `| app | sdk` (read from the chat response); matches the chat surface's `interaction_id_source`. `events[]` may also list `ai_user_action` with `clicked_through` (browser only; `card_kind` and `target_type`, never a URL), `accepted | rejected | edited`, and `ai_assistant_opened`. `opt_out`: `client_prompt | client_response | client_feedback | server_feedback`.
- `mcp.servers[].sdk`: `@modelcontextprotocol/sdk | @modelcontextprotocol/server | mcp | github.com/modelcontextprotocol/go-sdk | github.com/mark3labs/mcp-go`. `integration`: `wrapMcpServer | wrap_mcp_server | WrapMCPServer | ruddermcpgo.WrapServer`. `transport`: `stdio | streamable_http | sse`. `processes`: `one | several`. `identify` is empty for stdio without auth (`ai_system`). `event_rules`: declared tool events, never `ai_` or `mcp_` names. `legacy_events`: hand-built `mcp_<method>_*` events, mapped like `legacy_events`. `agent_meta[]`: `{ path, symbol, helper: rudderStackMcpToolMeta }` for agents in the repo that call these servers.
- `known_limits`: ids such as `intent_lists_manual_review`, `wsgi_no_client_disconnect`, `mcp_state_per_process`, `go_private_install`, `agents_mcp_server_needs_tracing`, `requested_model_false_positive`.

Omit a block that does not apply (no browser: no `client_events`; no MCP server: no `mcp`; no hand-built events: `legacy_events: []`).

## Field rules

- `status` is `draft` until an unambiguous yes ("yes", "approved", "go ahead") to the plan as presented; then `approved` with `time_to_integrate.approved_at`. A yes given while edits are pending is not approval: apply the edits, show only the diff, ask again. After approval, a route change, a file outside Files to change, or any other change to what gets instrumented (surfaces, identity, config, events, legacy migration) sets `status: draft` and needs a new approval before commit. Refreshing `path` / `symbol` references after code moves does not.
- References use `path` plus `symbol` (route, function, variable). Use `path:line` only in chat; lines go stale.
- `spec.config.intents`: for chat surfaces, 3 to 10 snake_case labels drafted from system prompts, tool descriptions, routes and docs, never from production data, plus `other` last. Background-only apps with the classifier off: `[other]`. The SDK adds `other` itself, so instrumentation passes the list without it.
- `spec.config.event_rules[].when`: `result_seen` fires only after the app sends the tool's result back to the model in the same interaction. If the app never executes the tool, only `always` fires; ask which the user wants.
- `spec.config.prices`: only rates the user gives or confirms; no prices ship with the SDKs. Required when legacy events carried cost, or when one interaction mixes priced and unpriced calls (an unpriced call drops `total_cost_usd` for the whole turn). Without prices, events carry tokens and no `total_cost_usd` (unless a gateway or the Claude Agent SDK reports cost).
- `surfaces[].interaction_id_source`:
  - `sdk`: the SDK mints it.
  - `client`: the browser mints a UUID v4 per prompt and sends it (header `x-interaction-id` or a body field); the server validates it is a UUID before passing it, else lets the SDK mint one.
  - `app`: an ID the app already mints per answer and the client already holds (a turn or message ID). Prefer it when it exists: a legacy per-answer ID (`messageId`, `turnId`) then maps to `interaction_id`.
  - In every case the server returns the ID it used (response field or `x-interaction-id` header).
- `surfaces[].feedback[].request_changes`: `trackAction` needs `interaction_id` and `conversation_id`; list them when the endpoint does not receive them today, and name the request change under Breaking and semantic changes.
- `surfaces[].status`: `skipped` (user chose not to, or no browser SDK), `blocked` (runtime or library version, or an unsupported MCP SDK), `unsupported` (no SDK for the language or framework).
- `surfaces[]` with `type: mcp` carry only `id`, `type`, `status`, `reason`, `feature` and `entry_points`; the rest is under `mcp.servers[]` with the same `surface_id`.
- `mcp.servers[].request_context.intents`: drafted like chat intents from tool names and descriptions, ending with `other`; instrumentation passes the list without `other`. It is published in every tool's schema: keep it short and free of sensitive categories.
- `mcp.servers[].identify`: expressions over the verified token, never a token value. Without auth the server's events go out as `ai_system`.
- `time_to_integrate`: each skill writes only its own timestamp, with `date -u`; `hours_spent` and `notes` are the user's. Updating these never needs re-approval.
- Background `child_tasks`: one entry per nested step that should report its own usage. The parent task then reports only calls made outside the children; per-run totals come from summing the tree by `parent_interaction_id`. Children default to `trigger_source: agent`.
- `client_events.events[].event`: only names from the client-event schema in `rudder-ai-events-instrument` (`references/client-events.md`). Browser-sent actions live here; server-sent ones under `surfaces[].feedback`.
- Client copies: with a `client` surface to instrument, the browser sends its own `ai_user_prompt_created` and `ai_response_received` (`source: client`) alongside the server's, and feedback goes from both sides. They measure the client/server gap per `interaction_id` and are never sampled. Either side opts out only when the user asks: record it in `client_events.opt_out` and drop that side's entry. Feedback with no server endpoint is browser-only; do not add an endpoint for it.
- `legacy_events[].migration`: the old event keeps sending behind a flag that defaults on until `remove_after`. Removing it is a separate, later change.

## Breaking-change checks

Compare each legacy field by meaning, not by name. A row is "Same" only when value, unit and scope match. Check every one of these and say which apply:

| Check | Differs when |
|---|---|
| Cost | legacy cost is cumulative per conversation, or includes calls the AI event does not (or the reverse); the AI event is per turn |
| Status vocabulary | legacy values (`ok`, `failed`, `aborted`) do not map one-to-one onto `response_status` (`success`, `error`, `timeout`, `cancelled`, `paused`, `incomplete`) |
| Model | legacy sends the requested model; `primary_model` is the served one |
| Latency | legacy starts at the model call, the first token or the request; `latency_ms` starts when the interaction opens |
| Tokens | legacy counts one call; totals sum every call in the turn |
| Which turns emit | legacy skips background, retried, cancelled or failed turns, or fires per model call; the AI event fires once per interaction or task |
| Client-only fields | a legacy field only the browser knows (render time, viewport) cannot come from the server event |
| Casing and codegen | event names differ from the repo's convention, or the repo generates typed tracking calls from a tracking plan |

## Mapping hand-built events

| Old event looks like | Standard event |
|---|---|
| one event per answer with model/tokens/latency/cost | `ai_response_received` (totals: `total_input_tokens`, `total_output_tokens`, `total_tokens`, `total_cost_usd`, `latency_ms`, `primary_model`, `response_status`) |
| a per-answer ID the client holds (`messageId`, `turnId`) | `interaction_id` (`interaction_id_source: app`) |
| one event per model call | `ai_llm_response_received` only if the user needs per-call rows (`emit_llm_calls: true`); otherwise `ai_response_received` totals |
| "user sent a message" | `ai_user_prompt_created` |
| thumbs/rating/copy/share/report/retry | `ai_user_action` with `action_type` `feedback_given`, `feedback_retracted`, `copied_response`, `shared`, `reported`, `regenerated` |
| a draft, code change, approval block or artifact accepted, rejected or edited | `ai_user_action` with `action_type` `accepted`, `rejected`, `edited` |
| an eval or review score per answer | `ai_interaction_scored` (`config.scores`) |
| MCP `mcp_<method>_success` / `_error` with raw requests or results | `mcp_tool_called`, `mcp_resource_read`, `mcp_prompt_used` (names and sizes only) |
| a card, resource or doc opened from an answer | browser `ai_user_action` with `action_type: clicked_through` (`card_kind`, `target_type`; never the URL) |
| tool-specific product events ("ticket created by bot") | a declared tool event in `config.event_rules` |
| chat opened/closed, new/switched/renamed/deleted conversation | client events (`ai_assistant_opened`, ...) |

Properties with no standard counterpart either ride on `ai_response_received` as extra properties (`extraProperties` / `extra_properties` on `end()`), or are dropped; list them under `unmapped` and ask.

## Syncing later

`spec.config` uses snake_case and has no file paths, so it can later be synced to RudderStack source settings. Node.js instrumentation translates to camelCase (`capture_content` -> `captureContent`, `identity_from_cookies` -> `identityFromCookies`, `event_rules` -> `eventRules`, `tool_breakdown` -> `toolBreakdown`, `intent_summary` -> `intentSummary`, `timeout_ms` -> `timeoutMs`, `server_feedback` -> `serverFeedback`, `input_per_mtok` -> `inputPerMtok`, `tier_multipliers` -> `tierMultipliers`, `long_context` -> `longContext`, `server_tool_per_call` -> `serverToolPerCall`); Go uses `With*` options for `Configure` (`WithCaptureContent`, `WithToolBreakdown`, `WithServerFeedback`, `WithEventRules`, `WithPrices`) and exported field names for MCP (`RequestContext`, `CapabilityRequests`). Keep values literal (no env interpolation) so a sync job can read the block as is.
