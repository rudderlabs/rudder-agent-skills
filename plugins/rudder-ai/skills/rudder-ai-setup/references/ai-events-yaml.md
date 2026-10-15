# ai-events.yaml

The plan the setup writes at the repository root and the user commits. `rudder-ai-instrument` implements only what it says, and `rudder-ai-verify` checks against it.

Two halves:

- `spec.config` holds source-level settings that map one-to-one to the SDKs' `configure()` options (intents, outcomes, classifier, content capture, event rules, prices). It contains no file paths, so it can later be synced to RudderStack source settings and read by both SDKs.
- Everything else (`surfaces`, `identity`, `tracing`, `legacy_events`, `client_events`, `mcp`) is repo-local: where things are and how they are wired.

Never put secrets in this file: environment variable names only, never values.

## Schema

```yaml
version: rudder/ai-events/v1alpha1   # plan format version
kind: ai-events-plan
metadata:
  name: support-app                  # app or service name
  status: draft                      # draft | approved; only an explicit user approval sets approved
  approved_on: null                  # YYYY-MM-DD, set together with status: approved
  spec_version: "0.2.0"              # AI events spec the SDKs send

spec:
  sdks:                              # one entry per package root that gets the SDK
    - language: node                 # node | python
      path: .                        # directory holding package.json / pyproject.toml
      package: "@rudderstack/ai"     # or rudderstack-ai
      version: "0.4.0"               # exact; never a range
      extras: []                     # Python extras, e.g. [openai, langchain]
      package_manager: npm           # npm | pnpm | yarn | bun | uv | poetry | pip
      runtime: "24.x"                # found runtime; blocked below Node.js 24 / Python 3.12

  rudderstack:
    client: existing                 # existing | new (new: add rudder-sdk-node / rudder-sdk-python)
    client_path: src/analytics.ts:4  # where the existing client is created
    write_key_env: RUDDERSTACK_WRITE_KEY        # NAME only
    data_plane_url_env: RUDDERSTACK_DATA_PLANE_URL
    source_id: null                  # optional, for a later sync to source settings

  config:                            # maps to configure(); language-neutral snake_case
    capture_content: false           # true sends prompt/answer/feedback text (masked); default false
    tool_breakdown: false            # per-tool calls/errors/durations on ai_response_received
    emit_llm_calls: false            # per-call ai_llm_response_received; rarely needed
    identity_from_cookies: true      # read rl_anonymous_id / rl_session / rl_user_id from requests
    intents: [refund_request, order_status, product_question, other]   # always ends with other
    outcomes: [resolved, partial, unresolved, unclear]                 # SDK default list
    classifier:
      enabled: false
      provider: anthropic            # anthropic | openai | custom; the app's own client and key
      model: claude-haiku-4-5
      intent_summary: false          # free text: treat as personal data
      timeout_ms: 5000
    event_rules:                     # tool call -> your own product event (never ai_*)
      - tool: create_ticket
        event: ticket_created
        properties: [priority]       # argument keys copied into the event; never whole args/results
        when: success                # always | success
    prices:                          # USD per 1M tokens; only the app's real rates, else omit
      - model: gpt-4.1-mini
        input_per_mtok: 0.4
        output_per_mtok: 1.6
        cached_input_per_mtok: 0.1

  surfaces:
    - id: support-chat
      type: chat                     # chat | background | client | mcp
      status: instrument             # instrument | skipped | blocked | unsupported | discovered-only
      reason: null                   # required unless status is instrument
      feature: support_bot           # snake_case product surface, sent as feature
      entry_points:
        - path: src/routes/chat.ts:21
          symbol: POST /api/chat
      llm_calls:
        - path: src/llm.ts:9
          library: openai
          version: "7.34.0"
      integration: wrapOpenAI        # wrapOpenAI | wrapAnthropic | wrapGoogleGenAI | wrapBedrock |
                                     # rudderstackMiddleware | RudderStackCallbackHandler | trackedQuery |
                                     # trackedRun | recordCall | instrument_litellm | (Python: snake_case names)
      unit: interaction              # interaction (aiInteraction per user turn) | task (aiTask per run)
      streaming: false
      conversation_id_source: req.body.conversationId   # expression or "minted by the SDK"
      interaction_id_source: client  # sdk | client (browser-minted, validated) | app (an existing turn ID)
      task_name: null                # background: stable job name, e.g. nightly-digest
      trigger_source: null           # background: schedule | webhook | queue | slack | agent | api
      flush: shutdown                # shutdown | per-run (scripts, Lambda) | task (aiTask flushes itself)
      feedback:
        - path: src/routes/feedback.ts:8
          action_type: feedback_given
          sender: server             # server (trackAction) | client (browser ai_user_action)

  identity:
    user_id: { source: "req.user.id (src/middleware/auth.ts:14)", confirmed: true }
    anonymous_id: { source: "cookie rl_anonymous_id", confirmed: true }
    session_id: { source: "cookie rl_session", confirmed: true }
    account_id: { source: null, confirmed: true }
    browser_sdk: { present: true, version: "3", path: public/index.html:12, resets_on_logout: false }
    background_actor: ai_system      # background runs: userId unset, person in on_behalf_of
    open_questions: []               # must be empty before approval

  tracing:
    tool: langfuse                   # langfuse | langsmith | opentelemetry | none
    trace_id_source: "langfuse.getCurrentTraceId() (src/tracing.ts:30)"

  client_events:                     # browser, through the existing RudderStack JavaScript SDK
    sdk_path: public/app.js
    interaction_id_minted_by: client # client: crypto.randomUUID() per prompt, sent to the server
    events:
      - event: ai_assistant_opened
        handler: public/app.js:40
      - event: ai_user_action
        action_type: copied_response
        handler: public/app.js:88

  legacy_events:
    - event: chatTurnCompleted
      path: src/routes/chat.ts:48
      sender: server
      mapping:                       # old property -> standard event property
        model: ai_response_received.primary_model
        tokens: ai_response_received.total_tokens
        latencyMs: ai_response_received.latency_ms
        chatId: ai_response_received.conversation_id
      unmapped: [promptLength]       # kept as extra properties on ai_response_received, or dropped
      migration:
        flag_env: AI_EVENTS_LEGACY_EVENT   # default on: old event keeps sending
        remove_after: "2026-12-31"   # a date the user picks; consumers move to the new events first

  mcp:
    status: discovered-only          # MCP instrumentation comes later
    servers:
      - path: src/mcp/server.ts:5
        name: docs-server
        sdk: "@modelcontextprotocol/sdk"
        transport: stdio
        tools: [search_docs, get_page]
```

## Field rules

- `metadata.status` is `draft` until the user explicitly approves; then `approved` with `approved_on`. Any later edit to `spec` sets it back to `draft` and needs a new approval.
- `spec.config.intents`: 3 to 10 snake_case labels drafted from system prompts, tool descriptions, routes and docs, never from production data, plus `other` last. The SDK adds `other` itself, so instrumentation passes the list without it.
- `spec.config.prices`: only rates the user gives or confirms. No prices ship with the SDKs; without them events carry tokens and no `total_cost_usd` (unless a gateway or the Claude Agent SDK reports cost).
- `surfaces[].interaction_id_source`:
  - `sdk`: the SDK mints it; the server returns `interaction.id` to the client for feedback.
  - `client`: the browser mints a UUID v4 per prompt and sends it (header `x-interaction-id` or a body field); the server validates it is a UUID before passing `interactionId` / `interaction_id`, else lets the SDK mint one.
  - `app`: an ID the app already has per turn (a turn or message row ID).
- `surfaces[].status`: `skipped` (user chose not to), `blocked` (runtime or library version), `unsupported` (no SDK for the language), `discovered-only` (MCP).
- `client_events.events[].event`: only names from the client-event schema in the `rudder-ai-instrument` skill (`references/client-events.md`).
- `legacy_events[].migration`: the old event keeps sending behind a flag that defaults on until `remove_after`, so dashboards and destinations can move first. Removing it is a separate, later change.

## Mapping hand-built events

| Old event looks like | Standard event |
|---|---|
| one event per answer with model/tokens/latency/cost | `ai_response_received` (totals: `total_input_tokens`, `total_output_tokens`, `total_tokens`, `total_cost_usd`, `latency_ms`, `primary_model`, `response_status`) |
| one event per model call | `ai_llm_response_received` only if the user needs per-call rows (`emit_llm_calls: true`); otherwise `ai_response_received` totals |
| "user sent a message" | `ai_user_prompt_created` |
| thumbs/rating/copy/share/report/retry | `ai_user_action` with `action_type` `feedback_given`, `feedback_retracted`, `copied_response`, `shared`, `reported`, `regenerated` |
| tool-specific product events ("ticket created by bot") | a declared tool event in `config.event_rules` |
| chat opened/closed, new/switched/renamed/deleted conversation | client events (`ai_assistant_opened`, ...) |

Properties with no standard counterpart either ride on `ai_response_received` as extra properties (`extraProperties` / `extra_properties` on `end()`), or are dropped; list them under `unmapped` and ask.

## Syncing later

`spec.config` uses the SDKs' option names in snake_case. Node.js instrumentation translates them to camelCase (`capture_content` -> `captureContent`, `event_rules` -> `eventRules`, `tool_breakdown` -> `toolBreakdown`, `intent_summary` -> `intentSummary`, `timeout_ms` -> `timeoutMs`, `input_per_mtok` -> `inputPerMtok`). Keep values literal (no env interpolation) so a sync job can read the block as is.
