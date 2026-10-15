# ai-events.yaml

The plan the setup writes at the repository root and the user commits. `rudder-ai-instrument` implements only what it says, and `rudder-ai-verify` checks against it.

Two halves:

- `spec.config` holds source-level settings with no file paths, so it can later be synced to RudderStack source settings and read by both SDKs. Most keys are `configure()` options; `intents` and `outcomes` are the label lists the classifier uses (and the vocabulary for app-set `intent` / `outcome`): with the classifier off they only document the taxonomy.
- Everything else (`surfaces`, `identity`, `tracing`, `legacy_events`, `client_events`, `mcp`) is repo-local: where things are and how they are wired.

Never put secrets in this file: environment variable names only, never values. Omit a section that does not apply (no browser: no `client_events`; no hand-built events: `legacy_events: []`).

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
      extras: []                     # Python extras, e.g. [anthropic, langchain]
      package_manager: npm           # npm | pnpm | yarn | bun | uv | poetry | pip
      runtime: ">=24 (package.json engines)"   # where the runtime version came from

  rudderstack:
    client: existing                 # existing | new (new: add rudder-sdk-node / rudder-sdk-python)
    client_path: src/analytics.ts    # where the existing client is created
    write_key_env: RUDDERSTACK_WRITE_KEY        # NAME only
    data_plane_url_env: RUDDERSTACK_DATA_PLANE_URL
    source_id: null                  # optional, for a later sync to source settings

  config:                            # language-neutral snake_case; Node.js uses camelCase
    capture_content: false           # configure captureContent; true sends prompt/answer/feedback text (masked)
    tool_breakdown: false            # configure toolBreakdown
    emit_llm_calls: false            # configure emitLlmCalls; rarely needed
    identity_from_cookies: true      # configure identityFromCookies; false for apps with no browser
    intents: [refund_request, order_status, product_question, other]   # always ends with other
    outcomes: [resolved, partial, unresolved, unclear]                 # SDK default list
    classifier:
      enabled: false                 # when false, omit the other classifier keys
      provider: anthropic            # anthropic | openai | custom; the app's own client and key
      model: claude-haiku-4-5
      intent_summary: false          # free text: treat as personal data
      timeout_ms: 5000
    event_rules:                     # tool call -> your own product event (never ai_*); [] when none
      - tool: create_ticket
        event: ticket_created
        properties: [priority]       # argument keys copied into the event; never whole args/results
        when: always                 # always | result_seen (only after the app sent the tool result back)
    prices: []                       # USD per 1M tokens, only rates the user gives:
                                     # - { model: gpt-4.1-mini, input_per_mtok: 0.4, output_per_mtok: 1.6, cached_input_per_mtok: 0.1 }

  surfaces:
    - id: support-chat
      type: chat                     # chat | background | client | mcp
      status: instrument             # instrument | skipped | blocked | unsupported | discovered-only
      reason: null                   # required unless status is instrument
      feature: support_bot           # snake_case product surface, sent as feature
      entry_points:
        - path: src/routes/chat.ts
          symbol: POST /api/chat     # symbols survive edits; line numbers do not
      llm_calls:
        - path: src/llm.ts
          symbol: openai
          library: openai
          version: "7.34.0"
      integration: wrapOpenAI        # wrapOpenAI | wrapAnthropic | wrapGoogleGenAI | wrapBedrock |
                                     # rudderstackMiddleware | RudderStackCallbackHandler | trackedQuery |
                                     # trackedRun | recordCall | instrument_litellm | (Python: snake_case names)
      unit: interaction              # interaction (one per user turn) | task (one per run)
      streaming: false
      conversation_id_source: req.body.conversationId   # expression, or "minted by the SDK"
      interaction_id_source: client  # sdk | client (browser-minted, validated) | app (an existing per-answer ID)
      flush: shutdown                # shutdown | task (aiTask flushes itself) | per-run (scripts, Lambda)
      feedback:                      # actions that already hit a server endpoint (sender: server)
        - path: src/routes/feedback.ts
          symbol: POST /api/feedback
          action_type: feedback_given
          request_changes: [interaction_id, conversation_id]   # IDs the endpoint must start receiving; [] if it has them

    - id: nightly-digest             # background surface: no feedback, cookies or interaction_id_source
      type: background
      status: instrument
      feature: digest
      entry_points:
        - path: jobs/digest.py
          symbol: main (deploy/crontab)
      integration: wrap_anthropic
      unit: task
      task_name: nightly-digest      # stable job name
      trigger_source: schedule       # schedule | webhook | queue | slack | agent | api | user
      conversation_id_source: '"nightly-digest:" + run date'
      account_id_source: null        # set here when one run serves one customer
      on_behalf_of_source: null
      anonymous_id_source: null      # stable per-tenant ID for multi-tenant jobs; null keeps ai_system
      child_tasks:                   # nested steps, one task each, chained by parent_interaction_id
        - task_name: workspace-digest
          scope: per workspace (send_digest, thread pool)
          conversation_id_source: '"nightly-digest:" + workspace.id'
          account_id_source: workspace.id
          on_behalf_of_source: workspace.owner_id
      flush: task

    - id: support-widget             # client surface: id, type, status, feature, entry_points only;
      type: client                   # its events are listed in client_events
      status: instrument
      feature: support_bot           # the same feature as the chat surface it belongs to
      entry_points:
        - path: public/app.js
          symbol: chat form submit

  identity:
    user_id: { source: "req.user.id (src/middleware/auth.ts)", confirmed: true }
    anonymous_id: { source: "cookie rl_anonymous_id", confirmed: true }
    session_id: { source: "cookie rl_session", confirmed: true }
    account_id: { source: null, confirmed: true }
    browser_sdk: { present: true, version: "3", path: public/index.html, identifies_user: false, resets_on_logout: false }
    background_actor: ai_system      # background runs: userId unset; see each surface's *_source fields
    open_questions: []               # must be empty before approval

  tracing:
    tool: langfuse                   # langfuse | langsmith | opentelemetry | none
    trace_id_source: "langfuse.getCurrentTraceId() (src/tracing.ts)"

  client_events:                     # browser, through the existing RudderStack JavaScript SDK
    sdk_path: public/app.js
    interaction_id_minted_by: client # same as the chat surface's interaction_id_source: client (crypto.randomUUID()
                                     # per prompt, sent to the server) | app | sdk (read from the chat response)
    events:                          # every browser-sent event, including browser-sent ai_user_action
      - event: ai_assistant_opened
        handler: public/app.js (launcher click)
      - event: ai_user_action
        action_type: copied_response
        handler: public/app.js (copy button)

  legacy_events:
    - event: chatTurnCompleted
      path: src/routes/chat.ts
      sender: server
      mapping:                       # old property -> standard event property
        model: ai_response_received.primary_model
        promptTokens: ai_response_received.total_input_tokens
        completionTokens: ai_response_received.total_output_tokens
        latencyMs: ai_response_received.latency_ms
        chatId: ai_response_received.conversation_id
      unmapped: [promptLength]       # kept as extra properties on ai_response_received, or dropped
                                     # (a per-answer ID such as messageId maps to interaction_id when the
                                     # surface uses interaction_id_source: app)
      migration:
        flag_env: AI_EVENTS_LEGACY_EVENT   # default on: old event keeps sending
        remove_after: "2026-12-31"   # a date the user picks; consumers move to the new events first

  mcp:
    status: discovered-only          # MCP instrumentation comes later
    servers:
      - path: src/mcp/server.ts
        name: docs-server
        sdk: "@modelcontextprotocol/sdk"
        transport: stdio
        tools: [search_docs, get_page]
```

## Field rules

- `metadata.status` is `draft` until the user explicitly approves (an unambiguous yes: "yes", "approved", "go ahead"); then `approved` with `approved_on`. Recording the user's answers before approval is part of drafting. After approval, any change to what gets instrumented (surfaces, identity, config, events, legacy migration) sets it back to `draft` and needs a new approval; refreshing `path` / `symbol` references after code moves does not.
- References use `path` plus `symbol` (route, function, variable). Use `path:line` only in chat while discussing; lines go stale as soon as the code changes.
- `spec.config.intents`: for chat surfaces, 3 to 10 snake_case labels drafted from system prompts, tool descriptions, routes and docs, never from production data, plus `other` last. Background-only apps with the classifier off: `[other]`. The SDK adds `other` itself, so instrumentation passes the list without it.
- `spec.config.event_rules[].when`: `result_seen` fires only after the app sends the tool's result back to the model in the same interaction. If the app never executes the tool (it passes `tools` but ignores tool calls), only `always` fires; ask which the user wants.
- `spec.config.prices`: only rates the user gives or confirms. No prices ship with the SDKs; without them events carry tokens and no `total_cost_usd` (unless a gateway or the Claude Agent SDK reports cost).
- `surfaces[].interaction_id_source`:
  - `sdk`: the SDK mints it.
  - `client`: the browser mints a UUID v4 per prompt and sends it (header `x-interaction-id` or a body field); the server validates it is a UUID before passing it, else lets the SDK mint one.
  - `app`: an ID the app already mints per answer and the client already holds (a turn or message ID). Prefer it when it exists: a legacy event's per-answer ID (`messageId`, `turnId`) then maps to `interaction_id`.
  - In every case the server returns the ID it used (response field or `x-interaction-id` header), so the client always references the right answer.
- `surfaces[].feedback[].request_changes`: `trackAction` needs `interaction_id` and `conversation_id`; when the endpoint does not receive them today, list them here so the plan states that the client request and the endpoint change.
- `surfaces[].status`: `skipped` (user chose not to, or no browser SDK), `blocked` (runtime or library version), `unsupported` (no SDK for the language), `discovered-only` (MCP).
- Background `child_tasks`: one entry per nested step that should report its own usage. The parent task then reports only calls made outside the children (often none: an envelope with zero tokens); per-run totals come from summing the tree by `parent_interaction_id`. Children default to `trigger_source: agent`; set it in the child only when the user wants otherwise.
- `client_events.events[].event`: only names from the client-event schema in the `rudder-ai-instrument` skill (`references/client-events.md`). Browser-sent actions live here, not under `surfaces[].feedback`.
- `legacy_events[].migration`: the old event keeps sending behind a flag that defaults on until `remove_after`, so dashboards and destinations can move first. Removing it is a separate, later change.

## Mapping hand-built events

| Old event looks like | Standard event |
|---|---|
| one event per answer with model/tokens/latency/cost | `ai_response_received` (totals: `total_input_tokens`, `total_output_tokens`, `total_tokens`, `total_cost_usd`, `latency_ms`, `primary_model`, `response_status`) |
| a per-answer ID the client holds (`messageId`, `turnId`) | `interaction_id` (`interaction_id_source: app`) |
| one event per model call | `ai_llm_response_received` only if the user needs per-call rows (`emit_llm_calls: true`); otherwise `ai_response_received` totals |
| "user sent a message" | `ai_user_prompt_created` |
| thumbs/rating/copy/share/report/retry | `ai_user_action` with `action_type` `feedback_given`, `feedback_retracted`, `copied_response`, `shared`, `reported`, `regenerated` |
| tool-specific product events ("ticket created by bot") | a declared tool event in `config.event_rules` |
| chat opened/closed, new/switched/renamed/deleted conversation | client events (`ai_assistant_opened`, ...) |

Properties with no standard counterpart either ride on `ai_response_received` as extra properties (`extraProperties` / `extra_properties` on `end()`), or are dropped; list them under `unmapped` and ask.

## Syncing later

`spec.config` uses snake_case. Node.js instrumentation translates to camelCase (`capture_content` -> `captureContent`, `identity_from_cookies` -> `identityFromCookies`, `event_rules` -> `eventRules`, `tool_breakdown` -> `toolBreakdown`, `intent_summary` -> `intentSummary`, `timeout_ms` -> `timeoutMs`, `input_per_mtok` -> `inputPerMtok`). Keep values literal (no env interpolation) so a sync job can read the block as is.
