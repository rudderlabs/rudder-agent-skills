# ai-events.md

The plan the setup writes at the repository root, untracked unless the user asks to commit it. It is both the document the user reviews and the record the other skills read: `rudder-ai-events-instrument` implements only what it says, and `rudder-ai-events-verify` checks against it.

Layout, a contract the other skills rely on:

- **Front matter** between `---` lines: `spec_version` and `status` (`draft` | `approved`).
- **Eleven H2 sections**, exactly these headings in this order: `## What changes`, `## Summary`, `## Breaking and semantic changes`, `## Intents and outcomes`, `## Surfaces`, `## Identity`, `## Cost`, `## Dependencies and blockers`, `## Known limits`, `## Files to change`, `## Config`. Instrument and verify locate content by heading: never rename, reorder, merge or drop one. A section that does not apply says "None" and why.
- **`## Config`** holds one fenced `yaml` block with every machine value. It is authoritative: when a section and Config disagree, fix the section. Instrument copies values from it; verify checks against it.

Never put secrets in the file: environment variable names only, never values. No effort estimates, owners, team names or ticket links: nothing the instrumentation does not need.

## What changes

The customer-facing summary: first in the file, a screen or less, plain language. Setup drafts it from discovery and shows it first at approval. Instrument repeats it in its final message. Verify regenerates it from captured payloads, adding one redacted before/after JSON pair per changed event with the differing fields marked, as a block ready to paste into a PR body. Six parts, in this order:

1. **Events**: table of event, `new` / `changed` / `unchanged` / `removed`, when it fires, count per turn (or per job run).
2. **Code touched**: one line per file or entry point.
3. **Identity**: where `userId` / `anonymousId` come from per entry point; the account (`account_id`, and `context.groupId` if legacy carried it); `ai_system` plus `on_behalf_of` for background work.
4. **Data that leaves the app**: the property groups sent; prompt and answer text not sent unless content capture is on, and what masking covers when it is.
5. **Impact**: extra events per turn or job, extra model calls (classifier), flush points and their time bounds.
6. **Switch off and roll back**: the switch that stops the AI events, the legacy-events switch, and the revert path.

## Example

````markdown
---
spec_version: "0.3.0"
status: draft                      # draft | approved; only an explicit user approval sets approved
---

# AI events plan: support-app

## What changes

| Event | Change | When it fires | Count |
|---|---|---|---|
| `ai_user_prompt_created` | new | a user sends a chat message | 1 server + 1 browser copy per turn |
| `ai_response_received` | new | an answer finishes, fails or is stopped; each digest run and workspace step | 1 server + 1 browser copy per turn; 1 per run + 1 per workspace |
| `ai_user_action` | new | thumbs or copy on an answer | 1 server + 1 browser copy per click |
| `mcp_client_seen`, `mcp_tool_called` | new | docs-mcp: a client connects; each tool call | 1 per client and user per day; 1 per call |
| `ticket_created` | new | the `create_ticket` tool runs | 1 per call |
| `chatTurnCompleted` | unchanged | as today | 1 per turn |

- Code touched: `src/analytics.ts` (configure, switches, flush), `src/llm.ts` (wrapper), `src/routes/chat.ts` and `src/routes/feedback.ts` (interaction, feedback IDs), `src/mcp/server.ts` (wrap), `jobs/digest.py` (task), `public/app.js` (browser copies), manifests and lockfiles.
- Identity: chat and feedback use `req.user.id`, cookies give `anonymousId` and session; MCP uses the token `sub`; digest runs send `ai_system` with `on_behalf_of` the workspace owner and `account_id` the workspace.
- Data that leaves the app: IDs, model, token counts, latency, status, tool names and counts, intent label, MCP tool and argument names (never values). Prompt and answer text: not sent (`capture_content: false`).
- Impact: +4 events per chat turn beside `chatTurnCompleted`; +1 per digest run and per workspace; no extra model calls; flush on shutdown (up to 10 s) and at the end of each digest task (up to 2 s).
- Switch off: `AI_EVENTS_ENABLED=false` stops every AI event, browser copies included; `AI_EVENTS_LEGACY_EVENT=false` stops `chatTurnCompleted`; roll back by reverting the instrumentation commit.

## Summary

| Surface | Route | Status |
|---|---|---|
| support-chat (chat) | `wrapOpenAI`, one interaction per turn | instrument |
| nightly-digest (background) | `wrap_anthropic`, one task per run, child task per workspace | instrument |
| support-widget (client) | client copies through `rudderanalytics` | instrument |
| docs-mcp (mcp) | `wrapMcpServer` with `identify` | instrument |

Branch: `feat/ai-events` (the repo was on `main`). Plan file: kept local in `.git/info/exclude`; instrument and verify resume from it.

Decided from code (override any): legacy `chatTurnCompleted` keeps sending; prices from the rate table in `src/billing/rates.ts`; the chat tool `create_ticket` is a declared tool event (it changes data); intents reuse `ticket.category`.

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
| chatTurnCompleted.promptLength | ai_response_received.prompt_length (extra property) | Same | carried with `extraProperties` on `end()` |

- Volume and coverage: legacy fires for user turns only; `ai_response_received` also fires for each nightly-digest run and workspace child task (`trigger: system`).
- Casing and codegen: the repo names events in camelCase and generates typed tracking calls from its tracking plan; AI events are snake_case and sent by the SDK, outside the generated client.
- Request and response changes: `POST /api/feedback` starts receiving `interaction_id` and `conversation_id`; `POST /api/chat` returns `x-interaction-id`.
- Browser copies: the browser sends its own prompt, answer and feedback events (`source: client`) alongside the server's.
- Background actor: digest runs send `ai_system` with `on_behalf_of`, never a user ID.
- Failures before the interaction opens (auth, validation) send no AI event; `chatTurnCompleted` never fired for them either.
- Privacy: `docs/privacy.md` lists analytics fields; add the AI event property groups.
- Switches: `AI_EVENTS_ENABLED` and `AI_EVENTS_LEGACY_EVENT`, both default on, independent; no removal date for the legacy event.

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
| gpt-4.1-mini | 0.4 / 1.6 / 0.1 | `src/billing/rates.ts` |
| claude-haiku-4-5 | TODO | none in the repo |

Every model ID constant in the repo, Bedrock geo-prefixed IDs included. claude-haiku-4-5 has no rate: its calls record tokens without `total_cost_usd` until the customer fills the `TODO` instrument leaves at the price config (known limit `prices_missing`); verify checks the cost path with dummy prices.

## Dependencies and blockers

- `@rudderstack/ai` 0.6.0 (npm, exact pin); `rudderstack-ai` 0.6.0 (uv, exact pin): the latest when this plan was written.
- Registry and auth: public npm and PyPI; no private registry.
- Release-age gates: pnpm `minimumReleaseAge: 10080`; `@rudderstack/ai` 0.6.0 is newer, so it needs a `minimumReleaseAgeExclude` entry until it ages past the gate.
- Peer ranges: `openai` 7.34.0 is inside `>=7.0.0 <8.0.0`; `@rudderstack/rudder-sdk-node` 3.0.14 is below `>=3.0.16`: upgrade it to 3.0.16 in the same change.
- Blockers: none.

## Known limits

- Intent lists are static: review them before launch and again once `other` grows.
- Missing prices: claude-haiku-4-5 sends no `total_cost_usd` until its rate is added.
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
    - { language: node, path: ., package: "@rudderstack/ai", version: "0.6.0", extras: [], package_manager: pnpm,
        runtime: ">=24 (package.json engines)" }
    - { language: python, path: ., package: rudderstack-ai, version: "0.6.0", extras: [anthropic], package_manager: uv,
        runtime: "3.12 (.python-version)" }
  rudderstack:
    client: existing
    client_path: src/analytics.ts
    write_key_env: RUDDERSTACK_WRITE_KEY
    data_plane_url_env: RUDDERSTACK_DATA_PLANE_URL
  switches:                          # both default on, independent
    ai_events_env: AI_EVENTS_ENABLED
    legacy_events_env: AI_EVENTS_LEGACY_EVENT
    reloadable: false                # true when the app's config library reloads at runtime
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
    unpriced_models: [claude-haiku-4-5]   # TODO at the price config; verify uses dummy prices
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
      migration: { remove_after: null }
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
        session_mode: stateful
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
  known_limits: [intent_lists_manual_review, prices_missing, mcp_state_per_process]
```
````

## Config keys

Values not shown in the example:

- `sdks[].version`: the exact latest release resolved in setup step 2.3 (0.6.0 / v0.2.0 or later). `runtime` for Go: the `go` line of that version's `go.mod`. `extras`: Python extras, or Go integration modules (`[rudderopenai, rudderotel]`). `package_manager`: `npm | pnpm | yarn | bun | uv | poetry | pip | go`.
- `rudderstack.client`: `existing | new` (new adds `rudder-sdk-node` / `rudder-sdk-python`).
- `config.capture_content: true` sends prompt, answer and feedback text, score explanations and MCP `call_reason` / `capability_detail` (masked).
- `config.labels_set_by`: `classifier` (`classifier.enabled: true`), `app` (the app calls `setIntent` / `setOutcome` or `trackScore`; the Intents and outcomes section names where), `none` (never populated).
- `config.classifier`, when enabled: `{ enabled: true, provider: anthropic | openai | custom, model, intent_summary: false, timeout_ms: 5000 }`, run on the app's own client and key. `intent_summary` is free text: personal data.
- `config.event_rules[]`: tool call to the app's own product event (never `ai_*`); `when: always | result_seen`. `[]` when none.
- `config.scores.evaluator`: `none | hook` (configure `evaluator`, the app's own judge) `| manual` (`trackScore` calls).
- `config.server_feedback: false` only with `client_events.opt_out: [server_feedback]`.
- `config.prices[]`: USD per 1M tokens, one entry per model ID the app sends. `config.unpriced_models[]`: model IDs with no rate yet. Optional keys: `cache_write_1h_per_mtok`, `tier_multipliers: { batch: 0.5, fast: 2 }`, `long_context: { threshold_tokens, input_per_mtok, output_per_mtok }`, `server_tool_per_call: { web_search: 0.01 }`, `provider` (only to price one provider; `gcp.gemini` and `gcp.vertex_ai` are priced separately, `google` / `google.vertex` are aliases).
- `surfaces[].type`: `chat | background | client | mcp`, also used for Kind in the Surfaces section. `status`: `instrument | skipped | blocked | unsupported`; `reason` required unless `instrument`.
- `surfaces[].surface`: `web | mobile | slack | teams | email | chatgpt_app | claude_app | ide | api | other`, or `per request: <expression>`.
- `surfaces[].integration`: `wrapOpenAI | wrapAnthropic | wrapGoogleGenAI | wrapBedrock | rudderstackMiddleware | RudderStackCallbackHandler | trackMessages | trackedQuery | trackedRun | recordCall | instrument_litellm` (Python: snake_case names); Go: `rudderopenai | rudderanthropic | ruddergenai | rudderbedrock | RecordCall`.
- `surfaces[].unit`: `interaction` (one per user turn) `| task` (one per run). `flush`: `shutdown | task | per-run`. `client_disconnect`: `middleware | bound-stream | none` (Django/Flask: known limit). `attachments: true` passes `attachment_count` / `attachment_types` (kinds only).
- `surfaces[].trigger_source`: `schedule | webhook | queue | slack | agent | api | user | mcp_event`; with `mcp_event`, `trigger_event_id_source` is the update's `event_id`. `anonymous_id_source`: a stable per-tenant ID for multi-tenant jobs; `null` keeps `ai_system`.
- `surfaces[].feedback[].action_type`: `feedback_given`, or `accepted | rejected | edited` for drafts and other artifacts.
- `tracing.tool`: `none | langfuse | langsmith | opentelemetry`; `trace_id_source` e.g. `langfuse.getCurrentTraceId() (src/tracing.ts)`, `SDK span processor, linkTraceId: true` (Node.js; Python `link_trace_id=True`), `rudderotel.TraceID` (Go).
- `client_events.interaction_id_minted_by`: `client` (`crypto.randomUUID()` per prompt, sent to the server) `| app | sdk` (read from the chat response); matches the chat surface's `interaction_id_source`. `events[]` may also list `ai_user_action` with `clicked_through` (browser only; `card_kind` and `target_type`, never a URL), `accepted | rejected | edited`, and `ai_assistant_opened`. `opt_out`: `client_prompt | client_response | client_feedback | server_feedback`.
- `mcp.servers[].sdk`: `@modelcontextprotocol/sdk | @modelcontextprotocol/server | mcp | github.com/modelcontextprotocol/go-sdk | github.com/mark3labs/mcp-go`. `integration`: `wrapMcpServer | wrap_mcp_server | WrapMCPServer | ruddermcpgo.WrapServer`. `transport`: `stdio | streamable_http | sse`. `session_mode`: `stateful | stateless` (stateless also covers a server built per request). `processes`: `one | several`. One entry per endpoint, each with a distinct `name`. `identify` is empty for stdio without auth (`ai_system`). `event_rules`: declared tool events, never `ai_` or `mcp_` names. `legacy_events`: hand-built `mcp_<method>_*` events, mapped like `legacy_events`. `agent_meta[]`: `{ path, symbol, helper: rudderStackMcpToolMeta }` for agents in the repo that call these servers.
- `known_limits`: ids from "Known limit ids" below, only those that apply.

Omit a block that does not apply (no browser: no `client_events`; no MCP server: no `mcp`; no hand-built events: `legacy_events: []`).

## Known limit ids

Ids for Config `known_limits`; the plan's Known limits section names each one that applies in a line about this app.

| Id | Limit |
|---|---|
| `intent_lists_manual_review` | Intents and outcomes (and MCP `request_context` intents) are a static list set in code. Review them before launch and once `other` grows; changes need a deploy, and past answers are never relabelled. |
| `prices_missing` | A model with no registered price sends tokens but no `total_cost_usd`, and one unpriced call drops it for the whole turn, until the customer adds rates at the `TODO`. |
| `wsgi_no_client_disconnect` | `client_disconnected` is detected under the Node.js middleware, Python ASGI middleware, Go `rudderstackai.Middleware` and bound streams. Django and Flask (WSGI) cannot see a disconnect. |
| `mcp_sdk_support` | Supported: Node.js `@modelcontextprotocol/sdk` 1.x (`>=1.31.0`) and `@modelcontextprotocol/server` 2.x; Python `mcp` 1.x (`>=1.30.0`) and 2.x; Go the official go-sdk v1.8.0 and `mark3labs/mcp-go` v0.55.1 or later. The stateless 2026-07-28 revision is tracked only on Node.js 2.x, Python 2.x, go-sdk v1.8.0 and mcp-go v1.x. The standalone `fastmcp` package is not supported. |
| `mcp_stateless_no_client` | On an endpoint without sessions (stateless streamable HTTP, or a server built per request) on a protocol before 2026-07-28, tool calls carry no `client_name`, `client_version` or `mcp_session_id`: Claude Code and Cursor look alike. `mcp_client_seen` still fires once per server, client and user per window; `call_index` counts per session, else per calling interaction, else is absent. |
| `mcp_state_per_process` | Client-seen windows, call counters and pending elicitations live in memory, keyed by server name: distinct endpoints need distinct names, each replica reports a client once per window, counters reset on restart. |
| `mcp_clients_not_tracked` | Only servers send `mcp_*`. An agent's outbound MCP calls join by `interaction_id` only from integrations that can set `_meta` (OpenAI Agents SDK); hosted MCP tools cannot. |
| `agents_mcp_server_needs_tracing` | `tool_breakdown` entries for an OpenAI Agents SDK agent's MCP tools carry `mcp_server` only with Agents SDK tracing on. |
| `go_integrations` | Go covers OpenAI, Anthropic, Google Gen AI and Bedrock clients plus `RecordCall`; no LangChain, agent-framework or Vercel AI SDK integrations; Google Gen AI retries, and openai-go / anthropic-sdk-go connection-error retries outside an interaction, are recorded per attempt; streams must be read inside the interaction. |
| `trace_id_opt_in` | `trace_id` is sent only when the app passes it, or with the SDK's span processor and `linkTraceId: true` / `link_trace_id=True` (Go: `WithTraceIDFrom(rudderotel.TraceID)`). Go MCP servers always take it from the request `_meta` `traceparent` / `com.rudderstack/trace_id`. |
| `requested_model_false_positive` | `requested_model` is sent only by the OpenAI, Anthropic and Google Gen AI integrations, the Vercel AI SDK, LiteLLM and `recordCall` when the app passes it; Anthropic models through Bedrock or Vertex AI IDs can carry it although the same model served the call (Node.js 0.6.0 normalises these IDs and sends none). |
| `argument_keys_unordered` | `argument_keys` order is unspecified: compare as a set. |
| `large_events_trimmed` | Properties are capped at 30,000 bytes: captured text goes first, then `tool_breakdown` / `usage_breakdown` entries. |
| `masking_fixed_shapes` | With capture on, emails, phones, cards, IPs, US SSNs, IBANs, keys, tokens, PEM keys and passwords are masked in captured text; names and postal addresses are not. |

## Field rules

- `status` is `draft` until approval (setup SKILL.md step 2.6); then `approved`. After approval, a route change, a file outside Files to change, or any other change to what gets instrumented (surfaces, identity, config, events, legacy migration) sets `status: draft` and needs a new approval before commit. Refreshing `path` / `symbol` references after code moves does not.
- References use `path` plus `symbol` (route, function, variable). Use `path:line` only in chat; lines go stale.
- `spec.config.intents`: for chat surfaces, 3 to 10 snake_case labels drafted from system prompts, tool descriptions, routes and docs, never from production data, plus `other` last. Background-only apps with the classifier off: `[other]`. The SDK adds `other` itself, so instrumentation passes the list without it.
- `spec.config.event_rules[].when`: `result_seen` fires only after the app sends the tool's result back to the model in the same interaction; use it when the app runs the tool loop, else `always`.
- `spec.config.prices`: rates from the app's own code or given by the user; never looked up, never from an internal list. Every other model ID goes in `unpriced_models`: events carry tokens and no `total_cost_usd` (unless a gateway or the Claude Agent SDK reports cost), an unpriced call drops it for the whole turn, instrument leaves a `TODO` at the price config, and verify uses dummy prices. Never a blocker.
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
- Background `child_tasks`: one entry per nested step that should report its own usage. The parent task then reports only calls made outside the children; per-run totals come from summing the tree by `parent_interaction_id`. Children default to `trigger_source: agent`.
- `client_events.events[].event`: only the browser events listed in `rudder-ai-events-instrument` `references/client-events.md` ("Who sends what"). Browser-sent actions live here; server-sent ones under `surfaces[].feedback`.
- Client copies: with a `client` surface to instrument, the browser sends its own `ai_user_prompt_created` and `ai_response_received` (`source: client`) alongside the server's, and feedback goes from both sides. They measure the client/server gap per `interaction_id` and are never sampled. Either side opts out only when the user asks: record it in `client_events.opt_out` and drop that side's entry. Feedback with no server endpoint is browser-only; do not add an endpoint for it.
- `switches`: instrumentation adds both. `ai_events_env` off stops every AI event, server and browser (the server exposes it to the page); `legacy_events_env` off stops the legacy events; each works without the other. They use the app's config library, reloadable when it supports that.
- `legacy_events[].migration.remove_after`: `null` by default; the legacy event keeps sending. Removing it is a separate, later change.

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
| Workspace | legacy events carry the workspace in `context.groupId`; AI events carry `account_id`: say which, and what dashboards keyed on `groupId` need |
| Background actor | legacy background events use the caller's `userId` or `'anonymous'`; AI events use `ai_system` plus `on_behalf_of` |
| App error codes | legacy `status` or error fields carry app-only codes; pass them with `end({ extraProperties })` (Python `extra_properties`) |
| Early failures | turns that fail before the interaction opens (auth, validation, rate limit) send no AI event |
| Privacy doc | the repo's privacy or data-handling doc lists analytics fields; it must list the new ones |
| Volume | extra events per turn or run (browser copies, background runs, MCP calls); state the increase in `## What changes` |

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

Properties with no standard counterpart ride on `ai_response_received` as extra properties (`extraProperties` / `extra_properties` on `end()`) by default; list them under `unmapped`. Drop one only when it is free text or duplicates a standard field.

## Config names in code

`spec.config` uses snake_case and holds no file paths. Node.js instrumentation translates to camelCase (`capture_content` -> `captureContent`, `identity_from_cookies` -> `identityFromCookies`, `event_rules` -> `eventRules`, `tool_breakdown` -> `toolBreakdown`, `intent_summary` -> `intentSummary`, `timeout_ms` -> `timeoutMs`, `server_feedback` -> `serverFeedback`, `input_per_mtok` -> `inputPerMtok`, `tier_multipliers` -> `tierMultipliers`, `long_context` -> `longContext`, `server_tool_per_call` -> `serverToolPerCall`); Go uses `With*` options for `Configure` (`WithCaptureContent`, `WithToolBreakdown`, `WithServerFeedback`, `WithEventRules`, `WithPrices`) and exported field names for MCP (`RequestContext`, `CapabilityRequests`). Keep values literal (no env interpolation).
