# ai-events.yaml

The plan the setup writes at the repository root and the user commits. `rudder-ai-events-instrument` implements only what it says, and `rudder-ai-events-verify` checks against it.

Two halves:

- `spec.config` holds source-level settings with no file paths, so it can later be synced to RudderStack source settings and read by every SDK. Most keys are `configure()` options; `intents` and `outcomes` are the label lists the classifier uses (and the vocabulary for app-set `intent` / `outcome`): with the classifier off they only document the taxonomy.
- Everything else (`surfaces`, `identity`, `tracing`, `legacy_events`, `client_events`, `mcp`, `known_limits`) is repo-local: where things are and how they are wired.

Never put secrets in this file: environment variable names only, never values. Omit a section that does not apply (no browser: no `client_events`; no MCP server: no `mcp`; no hand-built events: `legacy_events: []`).

## Schema

```yaml
version: rudder/ai-events/v1alpha1   # plan format version
kind: ai-events-plan
metadata:
  name: support-app                  # app or service name
  status: draft                      # draft | approved; only an explicit user approval sets approved
  approved_on: null                  # YYYY-MM-DD, set together with status: approved
  spec_version: "0.3.0"              # AI events spec the SDKs send
  time_to_integrate:                 # UTC timestamps, each written by the skill that reaches it; never estimated
    started_at: "2026-10-16T09:12Z"  # setup, discovery starts
    approved_at: null                # setup, plan approved
    instrumented_at: null            # instrument, done
    verified_at: null                # verify, first PASS
    hours_spent: null                # filled in by the user only: hands-on time, not wall-clock
    notes: null                      # what slowed it down, for the onboarding owner

spec:
  sdks:                              # one entry per package root that gets the SDK
    - language: node                 # node | python | go
      path: .                        # directory holding package.json / pyproject.toml / go.mod
      package: "@rudderstack/ai"     # or rudderstack-ai, github.com/rudderlabs/ai-sdk-go
      version: "0.5.0"               # exact release on spec v0.3, looked up in setup step 2.3: 0.5.0 or later
                                     # for Node.js and Python, v0.1.0 or later for Go (never 0.4.0, spec v0.2)
      extras: []                     # Python extras, e.g. [anthropic, langchain, mcp];
                                     # Go integration modules, e.g. [rudderopenai, rudderotel]
      package_manager: npm           # npm | pnpm | yarn | bun | uv | poetry | pip | go
      runtime: ">=24 (package.json engines)"   # where the runtime version came from

  rudderstack:
    client: existing                 # existing | new (new: add rudder-sdk-node / rudder-sdk-python)
    client_path: src/analytics.ts    # where the existing client is created
    write_key_env: RUDDERSTACK_WRITE_KEY        # NAME only
    data_plane_url_env: RUDDERSTACK_DATA_PLANE_URL
    source_id: null                  # optional, for a later sync to source settings

  config:                            # language-neutral snake_case; Node.js uses camelCase
    capture_content: false           # configure captureContent; true sends prompt/answer/feedback text, score
                                     # explanations, MCP call_reason and capability_detail (masked)
    tool_breakdown: false            # configure toolBreakdown
    emit_llm_calls: false            # configure emitLlmCalls; rarely needed
    identity_from_cookies: true      # configure identityFromCookies; false for apps with no browser
    intents: [refund_request, order_status, product_question, other]   # always ends with other
    outcomes: [resolved, partial, unresolved, escalated, unclear]      # SDK default list
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
    scores:                          # ai_interaction_scored; off unless the app already computes scores
      evaluator: none                # none | hook (configure evaluator, the app's own judge) | manual (trackScore calls)
      evaluations: []                # e.g. [groundedness]; manual: where each score comes from
    server_feedback: true            # configure serverFeedback; false only with client_events.opt_out: [server_feedback]
    prices: []                       # USD per 1M tokens, only rates the user gives:
                                     # - { model: gpt-4.1-mini, provider: null, input_per_mtok: 0.4, output_per_mtok: 1.6, cached_input_per_mtok: 0.1,
                                     #     cache_write_1h_per_mtok: null, tier_multipliers: { batch: 0.5, fast: 2 },
                                     #     long_context: { threshold_tokens: 200000, input_per_mtok: 0.8, output_per_mtok: 3.2 },
                                     #     server_tool_per_call: { web_search: 0.01 } }
                                     # provider: only to price one provider (gcp.gemini and gcp.vertex_ai are
                                     # priced separately; google / google.vertex are aliases)

  surfaces:
    - id: support-chat
      type: chat                     # chat | background | client | mcp
      status: instrument             # instrument | skipped | blocked | unsupported
      reason: null                   # required unless status is instrument
      feature: support_bot           # snake_case product surface, sent as feature
      surface: web                   # channel: web | mobile | slack | teams | email | chatgpt_app | claude_app | ide | api | other
                                     # or "per request: <expression>" when one route serves several
      attachments: false             # true: pass attachment_count / attachment_types (kinds only)
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
                                     # trackedRun | recordCall | instrument_litellm | (Python: snake_case names) |
                                     # Go: rudderopenai | rudderanthropic | ruddergenai | rudderbedrock | RecordCall
      unit: interaction              # interaction (one per user turn) | task (one per run)
      streaming: false
      conversation_id_source: req.body.conversationId   # expression, or "minted by the SDK"
      interaction_id_source: client  # sdk | client (browser-minted, validated) | app (an existing per-answer ID)
      flush: shutdown                # shutdown | task (aiTask flushes itself) | per-run (scripts, Lambda)
      client_disconnect: middleware  # middleware (Node.js, Python ASGI, Go Middleware) | bound-stream | none (Django/Flask: known limit)
      feedback:                      # actions that already hit a server endpoint: the server's trackAction copy
        - path: src/routes/feedback.ts
          symbol: POST /api/feedback
          action_type: feedback_given  # also accepted | rejected | edited for drafts and other artifacts
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
      trigger_source: schedule       # schedule | webhook | queue | slack | agent | api | user | mcp_event
      trigger_event_id_source: null  # with mcp_event: the update's event_id
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

    - id: docs-mcp                   # MCP server surface: details under mcp.servers (surface_id: docs-mcp)
      type: mcp
      status: instrument
      feature: docs_mcp
      entry_points:
        - path: src/mcp/server.ts
          symbol: server.connect (streamable HTTP, /mcp)

  identity:
    user_id: { source: "req.user.id (src/middleware/auth.ts)", confirmed: true }
    anonymous_id: { source: "cookie rl_anonymous_id", confirmed: true }
    session_id: { source: "cookie rl_session", confirmed: true }
    account_id: { source: null, confirmed: true }
    browser_sdk: { present: true, version: "3", path: public/index.html, identifies_user: false, resets_on_logout: false }
    background_actor: ai_system      # background runs: userId unset; see each surface's *_source fields
    open_questions: []               # must be empty before approval

  tracing:                           # optional link to an existing tracing tool
    tool: none                       # none | langfuse | langsmith | opentelemetry
    trace_id_source: null            # e.g. "langfuse.getCurrentTraceId() (src/tracing.ts)"; opentelemetry:
                                     # "SDK span processor, linkTraceId: true" (Node.js; Python link_trace_id=True;
                                     # opt-in, off by default) or "rudderotel.TraceID" (Go)

  client_events:                     # browser, through the existing RudderStack JavaScript SDK
    sdk_path: public/app.js
    interaction_id_minted_by: client # same as the chat surface's interaction_id_source: client (crypto.randomUUID()
                                     # per prompt, sent to the server) | app | sdk (read from the chat response)
    events:                          # every browser-sent event; all carry source: client, never sampled
      - event: ai_user_prompt_created  # client copies of the prompt and answer: on by default
        handler: public/app.js (chat form submit)
      - event: ai_response_received
        handler: public/app.js (answer rendered, failed or stopped)
      - event: ai_user_action          # feedback: on by default, alongside the server's copy in surfaces[].feedback
        action_type: feedback_given
        handler: public/app.js (thumbs buttons)
      - event: ai_user_action
        action_type: copied_response
        handler: public/app.js (copy button)
      - event: ai_user_action          # browser only; card_kind and target_type, never a URL
        action_type: clicked_through
        handler: public/app.js (source card click)
      - event: ai_user_action          # a draft or artifact kept, discarded or changed
        action_type: accepted          # accepted | rejected | edited
        handler: public/app.js (insert draft button)
      - event: ai_assistant_opened
        handler: public/app.js (launcher click)
    opt_out: []                      # copies the user turned off: client_prompt | client_response |
                                     # client_feedback | server_feedback; [] keeps both sides
                                     # (server_feedback -> config.server_feedback: false)

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
    servers:                         # one entry per MCP server the repo serves; also listed in surfaces as type: mcp
      - surface_id: docs-mcp         # the matching surfaces[].id
        path: src/mcp/server.ts
        symbol: 'new McpServer({ name: "docs-server" })'
        name: docs-server            # sent as server_name
        sdk: "@modelcontextprotocol/sdk"   # or @modelcontextprotocol/server, mcp, github.com/modelcontextprotocol/go-sdk,
                                     # github.com/mark3labs/mcp-go
        sdk_version: "1.31.0"        # checked against the supported range
        language: node               # node | python | go
        integration: wrapMcpServer   # wrapMcpServer | wrap_mcp_server | WrapMCPServer | ruddermcpgo.WrapServer
        transport: streamable_http   # stdio | streamable_http | sse
        processes: several           # one | several (per-process state: known limit); name must be unique per distinct server
        identify:                    # from the server's auth; empty for stdio without auth (ai_system)
          auth: "requireBearerAuth (src/mcp/auth.ts)"
          user_id: "auth.extra.sub"  # the OAuth subject
          account_id: "auth.extra.workspace_id"
        request_context:
          enabled: true              # adds request_context (intent, user_sentiment) to every tool schema
          intents: [search_docs, read_page, other]   # from tool names and descriptions; ends with other
          user_sentiment: true
        tools: [search_docs, get_page]
        resources: []                # names or templates only, never URIs
        prompts: []
        event_rules:                 # MCP declared tool events: never ai_ or mcp_ names
          - tool: create_page
            event: page_created
            properties: [space]
            when: always
        capability_requests:         # injected request_capability tool; off by default
          enabled: false
          capabilities: []           # known gaps, e.g. [bulk_export]; the agent may also send other
        mcp_events: false            # experimental MCP Events helpers
        legacy_events: []            # hand-built mcp_<method>_* events, mapped like legacy_events below
    agent_meta: []                   # agents in this repo that call these servers and pass _meta:
                                     # - { path: src/agent.ts, symbol: MCPServerStreamableHttp, helper: rudderStackMcpToolMeta }

  known_limits: []                   # the setup skill's Known limits that apply, e.g.
                                     # [intent_lists_manual_review, wsgi_no_client_disconnect, mcp_state_per_process,
                                     #  go_private_install, agents_mcp_server_needs_tracing, requested_model_false_positive]
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
- `surfaces[].status`: `skipped` (user chose not to, or no browser SDK), `blocked` (runtime or library version, or an MCP SDK the wrapper does not support), `unsupported` (no SDK for the language or framework, e.g. a Rust service, or a Go agent framework with no `RecordCall` hook).
- `surfaces[]` with `type: mcp` carry only `id`, `type`, `status`, `reason`, `feature` and `entry_points`; the rest is under `mcp.servers[]` with the same `surface_id`.
- `mcp.servers[].request_context.intents`: drafted like chat intents, from tool names and descriptions, ending with `other`; instrumentation passes the list without `other`. The list is published in every tool's schema, so a rename changes what agents send: keep it short and free of sensitive categories.
- `mcp.servers[].identify`: expressions over the verified token, never a token value. Without auth the server's events go out as `ai_system`.
- `metadata.time_to_integrate`: each skill writes only its own timestamp, with `date -u`; `hours_spent` and `notes` are the user's. Updating these never needs re-approval.
- Background `child_tasks`: one entry per nested step that should report its own usage. The parent task then reports only calls made outside the children (often none: an envelope with zero tokens); per-run totals come from summing the tree by `parent_interaction_id`. Children default to `trigger_source: agent`; set it in the child only when the user wants otherwise.
- `client_events.events[].event`: only names from the client-event schema in the `rudder-ai-events-instrument` skill (`references/client-events.md`). Browser-sent actions live here; server-sent ones under `surfaces[].feedback`.
- Client copies: with a `client` surface to instrument, the browser sends its own `ai_user_prompt_created` and `ai_response_received` (`source: client`) alongside the server's, and feedback goes from both sides: the server endpoint under `surfaces[].feedback` and the browser handler under `client_events.events`. They measure the client/server gap per `interaction_id` and are never sampled. Either side opts out only when the user asks: record it in `client_events.opt_out` and drop that side's entry. Feedback with no server endpoint is browser-only; do not add an endpoint for it. Click-through (`clicked_through`) is browser-only.
- `legacy_events[].migration`: the old event keeps sending behind a flag that defaults on until `remove_after`, so dashboards and destinations can move first. Removing it is a separate, later change.

## Mapping hand-built events

| Old event looks like | Standard event |
|---|---|
| one event per answer with model/tokens/latency/cost | `ai_response_received` (totals: `total_input_tokens`, `total_output_tokens`, `total_tokens`, `total_cost_usd`, `latency_ms`, `primary_model`, `response_status`) |
| a per-answer ID the client holds (`messageId`, `turnId`) | `interaction_id` (`interaction_id_source: app`) |
| one event per model call | `ai_llm_response_received` only if the user needs per-call rows (`emit_llm_calls: true`); otherwise `ai_response_received` totals |
| "user sent a message" | `ai_user_prompt_created` |
| thumbs/rating/copy/share/report/retry | `ai_user_action` with `action_type` `feedback_given`, `feedback_retracted`, `copied_response`, `shared`, `reported`, `regenerated` |
| a draft, code change or artifact inserted, discarded or edited | `ai_user_action` with `action_type` `accepted`, `rejected`, `edited` |
| an eval or review score per answer | `ai_interaction_scored` (`config.scores`) |
| MCP `mcp_<method>_success` / `_error` with raw requests or results | `mcp_tool_called`, `mcp_resource_read`, `mcp_prompt_used` (names and sizes only; the raw payload is not carried over) |
| a card, resource or doc opened from an answer | browser `ai_user_action` with `action_type: clicked_through` (`card_kind`, `target_type`; never the URL) |
| tool-specific product events ("ticket created by bot") | a declared tool event in `config.event_rules` |
| chat opened/closed, new/switched/renamed/deleted conversation | client events (`ai_assistant_opened`, ...) |

Properties with no standard counterpart either ride on `ai_response_received` as extra properties (`extraProperties` / `extra_properties` on `end()`), or are dropped; list them under `unmapped` and ask.

## Syncing later

`spec.config` uses snake_case. Node.js instrumentation translates to camelCase (`capture_content` -> `captureContent`, `identity_from_cookies` -> `identityFromCookies`, `event_rules` -> `eventRules`, `tool_breakdown` -> `toolBreakdown`, `intent_summary` -> `intentSummary`, `timeout_ms` -> `timeoutMs`, `server_feedback` -> `serverFeedback`, `input_per_mtok` -> `inputPerMtok`, `tier_multipliers` -> `tierMultipliers`, `long_context` -> `longContext`, `server_tool_per_call` -> `serverToolPerCall`); Go uses `With*` options for `Configure` (`WithCaptureContent`, `WithToolBreakdown`, `WithServerFeedback`, `WithEventRules`, `WithPrices`) and exported field names for MCP (`RequestContext`, `CapabilityRequests`). Keep values literal (no env interpolation) so a sync job can read the block as is.
