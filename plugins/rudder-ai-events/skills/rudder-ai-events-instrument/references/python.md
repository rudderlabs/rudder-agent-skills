# Python recipes (`rudderstack-ai`, spec v0.3)

Python 3.12+. The package has no dependencies of its own; the extra for each library the app uses (`openai`, `anthropic`, `google-genai`, `bedrock`, `langchain`, `openai-agents`, `claude-agent-sdk`, `litellm`, `mcp`, `tracing`) only declares the supported version of that library, which the app already has. `tracing` is only for exporting OpenTelemetry spans; AI events do not need it.

`<VERSION>` below is the plan's `sdks[].version`: `0.5.0` or a later release. 0.5.0 is the first `rudderstack-ai` release with spec v0.3 (`rudderstack.ai.SPEC_VERSION == "0.3.0"`) and the `mcp` extra; 0.4.0 ships spec v0.2 and has no `rudderstack.ai.mcp`. Never install 0.4.0 or a branch build for a v0.3 plan.

Runnable references in the SDK repository's `examples/`: `openai-quickstart`, `openai-responses`, `azure-openai`, `openrouter-quickstart`, `litellm-proxy`, `anthropic-quickstart`, `anthropic-cloud`, `google-genai-quickstart`, `bedrock-converse-tools-streaming`, `langchain-agent`, `langgraph-checkpoint`, `deep-agents`, `openai-agents`, `claude-agent-sdk-quickstart`, `claude-agent-sdk-subagents`, `litellm-quickstart`, `record-call`, `chat-app` (FastAPI), `django-middleware`, `flask-middleware`, `background-agent`, `cookieless-bot`, `lambda-handler`, `scores-evaluator`, `cost-estimation`, `mcp-server`, `mcp-server-lowlevel`, `mcp-server-fastmcp-v1`, `openai-agents-mcp`.

## 1. Install (exact pins)

| Manager | Command or line |
|---|---|
| uv | `uv add "rudderstack-ai[openai]==<VERSION>"` |
| poetry | `poetry add "rudderstack-ai[openai]==<VERSION>"` |
| pip + requirements file | add `rudderstack-ai[openai]==<VERSION>` to `requirements.txt`, then `pip install -r requirements.txt` |
| pyproject without a lock tool | add `"rudderstack-ai[openai]==<VERSION>"` to `[project] dependencies` |

Replace `openai` with the plan's `extras`, comma-separated (`rudderstack-ai[anthropic,langchain]==<VERSION>`). The `mcp` extra declares `mcp>=1.30.0,<3` (1.x and 2.x); an MCP server on the standalone `fastmcp` package is `blocked` in the plan, not migrated here. Only when the plan says `rudderstack.client: new`, also add `rudder-sdk-python==2.1.9`. If the resolver tries to move an existing library (for example LiteLLM needs `openai<3`), stop and ask.

## 2. Configure once at startup

In the module that creates the RudderStack client, at module level right after it (runs once, on import, before any request or job); or at app startup (FastAPI lifespan, Django `AppConfig.ready()`, Flask app factory, a worker's `main()`) when that module is not imported at startup. Background-only apps: `identity_from_cookies=False`.

```python
import rudderstack.ai

from myapp.analytics import rudder_client  # the app's existing rudder-sdk-python client or module

rudderstack.ai.configure(
    analytics=rudder_client,
    capture_content=False,  # spec.config.capture_content
    # tool_breakdown=True,  # spec.config.tool_breakdown
    # server_feedback=False,  # only when client_events.opt_out lists server_feedback
)
```

No existing client (`client: new`):

```python
import os

from rudderstack.analytics.client import Client

rudder_client = Client(
    write_key=os.environ["RUDDERSTACK_WRITE_KEY"],
    host=os.environ["RUDDERSTACK_DATA_PLANE_URL"],
)
```

The module form also works: `import rudderstack.analytics as rudder_analytics; rudder_analytics.write_key = ...; rudder_analytics.dataPlaneUrl = ...; configure(analytics=rudder_analytics)`. Use the env var names from the plan; never create or edit `.env` files.

A client created on first use (or events that must carry the app's own message context, such as `context.groupId`): pass an adapter. The SDK calls `track(**kwargs)` and, on flush, `flush()`.

```python
class LazyRudder:
    def track(self, **kwargs):
        context = {**(kwargs.pop("context", None) or {}), "groupId": current_group_id()}  # same context the app's own track() calls set
        return get_rudder_client().track(context=context, **kwargs)

    def flush(self):
        return get_rudder_client().flush()


rudderstack.ai.configure(analytics=LazyRudder())
```

## 3. Wrap the model client (or add the framework integration)

```python
from openai import OpenAI
from rudderstack.ai.openai import wrap_openai

client = wrap_openai(OpenAI())  # a proxy: isinstance(client, OpenAI) is False; rudderstack.ai.unwrap(client) returns the original
# AzureOpenAI / gateways: wrap_openai(OpenAI(base_url=...), provider="azure.ai.openai" | "openrouter" | "litellm")
```

When a router or fallback serves another model than the one requested, the OpenAI, Anthropic and Google Gen AI clients and LiteLLM send `requested_model` next to the served `model`, streamed or not (a dated snapshot of the requested model counts as the same model); nothing to add. `record_call(requested_model=...)` follows the same rule.

| Integration | Change |
|---|---|
| Anthropic | `wrap_anthropic(Anthropic())` from `rudderstack.ai.anthropic` (`AnthropicBedrock`: `provider="aws.bedrock"`; `AnthropicVertex`: `provider="gcp.vertex_ai"`) |
| Google Gen AI | `wrap_google_genai(genai.Client(...))` from `rudderstack.ai.google_genai` (provider `gcp.gemini`, or `gcp.vertex_ai` for a `vertexai=True` client) |
| Bedrock | `wrap_bedrock(boto3.client("bedrock-runtime", region_name=...))` from `rudderstack.ai.bedrock` |
| LangChain / LangGraph / Deep Agents | `handler = RudderStackCallbackHandler(agent_name="support_agent")` from `rudderstack.ai.langchain`; add it to the run's `config={"callbacks": [handler]}`, never to a model constructor; tag agents with `"tags": ["agent:<name>"]` |
| Claude Agent SDK | `tracked_query(prompt=..., options=..., user_id=..., conversation_id=...)` from `rudderstack.ai.claude_agent_sdk` instead of `query()`; `ClaudeSDKClient`, an app-owned `query()` chokepoint, or tests that patch `claude_agent_sdk.query` (`tracked_query` imported its own reference): `async for m in tracked_messages(query(...), user_id=..., conversation_id=...)`. Resumed sessions across processes: store `usage_snapshot(result_message)` with the session and pass it back as `usage_baseline=`, or a resumed turn counts the whole session; when it cannot be stored, `tracked_messages(..., resumed=True)` counts the turn from its own messages, with cost only from registered prices. Call `query()` inside the `ai_interaction` / `ai_task`, or in-process MCP tools and hooks are counted outside it |
| OpenAI Agents SDK | `await tracked_run(agent, input, tracking={"user_id": ..., "feature": ...})` from `rudderstack.ai.openai_agents` (`tracked_run_sync`, `tracked_run_streamed` for `Runner.run_sync` / `run_streamed`); keep Agents SDK tracing on (the default): agents used as tools and `tool_breakdown`'s `mcp_server` for an agent's MCP tools come from its trace spans |
| LiteLLM SDK | `instrument_litellm()` once at startup, from `rudderstack.ai.litellm` |
| Anything else | inside the interaction: `interaction.record_call(provider=..., model=..., input_tokens=..., output_tokens=..., response_id=...)` |

Code that checks `isinstance(client, OpenAI)` / `Anthropic`: pass `rudderstack.ai.unwrap(client)` there.

## 4. Chat surface: one `ai_interaction` per user turn

Identity from browser cookies: `app.add_middleware(AIContextMiddleware)` (FastAPI / Starlette), `"rudderstack.ai.middleware.DjangoAIContextMiddleware"` in `MIDDLEWARE`, or `init_flask(app)` after `configure()`; all from `rudderstack.ai.middleware`. Without middleware pass `request=request` or `cookies=...` to `ai_interaction`.

```python
import uuid

from rudderstack.ai import ai_interaction


def _client_interaction_id(value: str | None) -> str | None:
    try:
        return str(uuid.UUID(value)) if value else None
    except ValueError:
        return None


@app.post("/chat")
def chat(body: ChatRequest, request: Request, user: User = Depends(current_user)):
    with ai_interaction(
        user_id=user.id,
        conversation_id=body.conversation_id,
        interaction_id=_client_interaction_id(request.headers.get("x-interaction-id")),
        feature="support_bot",
        surface="web",  # the surface's channel from the plan
        input_method="text",
        prompt_text=body.message,  # sent only when capture_content is on
    ) as interaction:
        reply = client.chat.completions.create(model=MODEL, messages=messages)
    return {"answer": reply.choices[0].message.content, "interaction_id": interaction.id}  # always the ID used
```

- `interaction_id_source: app`: mint or read the app's per-answer ID before `ai_interaction` (move it up if it is minted after the model call) and pass it as `interaction_id`.
- Exceptions propagate unchanged and fail the answer; keep the route's error handling.
- `surface` (`web`, `mobile`, `slack`, `teams`, `email`, `chatgpt_app`, `claude_app`, `ide`, `api`, `other`) comes from the plan; `ai_context(surface=...)` sets it for a whole request.
- Attachments: `attachment_count=` and `attachment_types=[...]` (`image`, `audio`, `video`, `pdf`, `file`); never names or content.
- `trace_id` is sent only when set. Another tracing tool (`tracing.trace_id_source`): pass `trace_id=` or `interaction.set_trace_id(...)`. The SDK's OpenTelemetry span processor (`tracing` extra) takes it from the first span started inside the interaction only with `register_tracing(link_trace_id=True)` / `create_span_processor(link_trace_id=True)` from `rudderstack.ai.tracing`; it is off by default. A value the app sets always wins. Extras via `interaction.end(extra_properties={...})`.
- `client_disconnected: true` comes from `AIContextMiddleware` (ASGI: FastAPI, Starlette) or a bound stream closed early. Django and Flask (WSGI) report no disconnect: only a bound streaming generator closed by the server sets it; pass `interaction.end(client_disconnected=True)` where the app detects it itself.
- Statuses need no code: the integrations report `paused` with `pause_reason` (`approval`, `human_input`, `deferred_tool`, `auth_required`, `other`), `incomplete` with `max_turns`, `max_budget_usd` or `length` (a last call cut off at the token limit, including Anthropic `stop_reason: max_tokens`), and `content_filter` as an error. A run the app pauses itself: `interaction.end(pause_reason="approval")`.
- Async routes: `async with ai_interaction(...)` works the same.
- Stop / abort: `asyncio.CancelledError` (or another cancel) raised out of the block already ends the answer as `cancelled`. When the app's stop handler catches it and returns normally, call `interaction.end(status="cancelled")` there.
- Tracing side effects: `register_tracing()` / `create_span_processor()` also export AI spans as `ai_otel_span` events and add identity, conversation and interaction ID attributes to AI spans, which every other exporter on that provider (Langfuse, ...) then receives. When another tool owns tracing, register neither: pass `trace_id=format(trace.get_current_span().get_span_context().trace_id, "032x")` (from `opentelemetry`).

Streaming responses keep the interaction open until the stream ends:

```python
with ai_interaction(user_id=user.id, conversation_id=body.chat_id) as interaction:
    async def tokens():
        stream = await client.chat.completions.create(model=MODEL, messages=messages, stream=True)
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    body_stream = interaction.bind(tokens())
return StreamingResponse(body_stream, headers={"x-interaction-id": interaction.id})
```

## 5. Feedback and other actions (server copy)

The server copy of each action in `surfaces[].feedback`. By default the browser sends its own copy of feedback too (`references/client-events.md`); dashboards use the client row per `interaction_id` and fall back to this one.

```python
from rudderstack.ai import track_action

track_action(
    "feedback_given",  # feedback_retracted | copied_response | shared | reported | regenerated | accepted | rejected | edited | clicked_through
    interaction_id=body.interaction_id,
    conversation_id=body.conversation_id,
    user_id=user.id,
    action_details={"feedback_type": "thumbs", "feedback_value": 1 if body.helpful else -1},
    surface="web",
)
```

When the plan opts the server copy out (`client_events.opt_out: [server_feedback]`), keep the call and set `configure(server_feedback=False)` once.

## 6. Background surface: one `ai_task` per run

```python
from rudderstack.ai import ai_task


def run_digest(job: Job) -> None:
    with ai_task(
        "nightly-digest",  # task_name
        trigger_source="schedule",
        account_id=job.workspace_id,  # account_id_source
        on_behalf_of=job.requested_by,  # on_behalf_of_source
        conversation_id=f"nightly-digest:{job.workspace_id}",
        feature="digest",
    ) as task:
        summary = summarise(job)  # wrapped clients and the LangChain handler report into the task
        task.set_outcome("resolved")
```

Planned `child_tasks` (a run that fans out per item, here through a thread pool):

```python
import rudderstack.ai
from rudderstack.ai import ai_task


def send_digest(workspace: Workspace) -> None:
    with ai_task(
        "workspace-digest",  # child task_name
        account_id=workspace.id,
        on_behalf_of=workspace.owner_id,
        conversation_id=f"nightly-digest:{workspace.id}",
        feature="digest",
    ):
        ...  # model calls for this item


def main() -> None:
    with ai_task("nightly-digest", trigger_source="schedule", conversation_id=f"nightly-digest:{run_date}", feature="digest"):
        with ThreadPoolExecutor() as pool:
            list(pool.map(rudderstack.ai.propagate(send_digest), workspaces))
```

- Pass identity fields as `ai_task` arguments; `ai_context(account_id=...)` around the task is equivalent and useful only when several tasks share them.
- No `user_id`: the actor is the system (`anonymousId: ai_system`). When the plan has `anonymous_id_source` (multi-tenant jobs), pass `anonymous_id=` with it.
- A child task chains to the running task: `parent_interaction_id` is set and `trigger_source` defaults to `agent`. The parent reports only calls made outside its children, often none (zero tokens, no model): per-run totals come from summing the tree by `parent_interaction_id`.
- Works as `with`, `async with` or a decorator (`@ai_task("nightly-digest")`).
- A run started by an MCP Events update: `trigger_source="mcp_event"` and `trigger_event_id=` the update's `event_id`.
- A non-chained `ai_task` flushes on exit, so a cron script or Lambda can exit; keep the app's own `flush()` call. A long-lived worker: `flush=False` and flush at shutdown, so a slow data plane never stalls the loop.
- Thread pools: `executor.submit(rudderstack.ai.propagate(fn), ...)`; `ThreadPoolExecutor` and `run_in_executor` do not copy context (`asyncio.to_thread` does).

## 7. Flush

| Process | Do |
|---|---|
| Web app, long-lived worker | `rudderstack.ai.flush()` once at shutdown (FastAPI lifespan exit, `atexit.register(rudderstack.ai.flush)`) |
| Script, cron, Lambda | `rudderstack.ai.flush()` in a `finally` before exit (a top-level `ai_task` already does it); inside an event loop `await rudderstack.ai.aflush()` |

`flush(timeout=None)` is bounded: classifications and evaluations wait up to the longer of their timeouts plus 1 s, the client flushes up to 10 s; it never raises and returns `False` when something did not finish in time. The client's own `shutdown()` is not bounded (it blocks until its queue drains, retries included): in a daemon, run it in a thread and join with a timeout so an outage cannot hold up exit. Apps that register the tracing span processor also call `force_flush()` on it (or on the `register_tracing()` handle) at shutdown.

## 8. Declared tool events, classifier, scores, prices

```python
rudderstack.ai.configure(
    event_rules={
        "tools": {
            "save_memory": "memory_captured",
            "create_ticket": rudderstack.ai.ToolRule(
                event="ticket_created",
                properties=lambda args, result: {"priority": (args or {}).get("priority")},
                # when: result_seen in the plan -> add: when=lambda args, result: result is not None,
            ),
        }
    },
    classifier={
        "client": anthropic.Anthropic(),  # the app's own client and key
        "model": "claude-haiku-4-5",
        "intents": ["refund_request", "order_status", "product_question"],  # without "other"
        # default outcomes: resolved, partial, unresolved, escalated, unclear
    },
    evaluator=judge,  # spec.config.scores.evaluator: fn(EvaluationTurn) -> score | [score] | None, after each answer, 5 s timeout
    prices={"gpt-4.1-mini": {"input_per_mtok": 0.4, "output_per_mtok": 1.6, "cached_input_per_mtok": 0.1}},
)
```

Only the keys the plan enables; `classifier` only with `labels_set_by: classifier`. With `labels_set_by: app`, call `interaction.set_intent(label)` / `interaction.set_outcome(label)` inside the interaction with the app's own category or outcome, mapped to the plan's lists. Event names starting with `ai_` or `mcp_` are reserved. Price options the plan may list, through `rudderstack.ai.register_price(model, ...)`: `tier_multipliers={"batch": 0.5, "flex": 0.5, "fast": 2}`, `long_context={"threshold_tokens": 200_000, "input_per_mtok": ..., "output_per_mtok": ...}`, `server_tool_per_call={"web_search": 0.01}`, `cache_write_1h_per_mtok=`. Service tier, 1-hour cache writes and hosted tool calls are read from responses automatically. Gemini API calls report provider `gcp.gemini`, Vertex AI calls `gcp.vertex_ai`, priced separately: register each provider the app calls with `provider=` (`google` / `google.vertex` are accepted aliases). Examples `cost-estimation` (`register_prices`, `estimate_cost`) and `scores-evaluator` (`evaluator=`, `track_score`).

A score computed elsewhere (a human review, an offline judge):

```python
from rudderstack.ai import track_score

track_score(interaction_id=iid, conversation_id=cid, evaluation_name="groundedness", score_value=0.82, evaluator="model")
```

`explanation=` is content: sent only with `capture_content`.

## 9. Legacy event behind a flag

```python
# Old hand-built event, kept for the migration window (the plan's legacy_events).
if os.environ.get("AI_EVENTS_LEGACY_EVENT", "true").lower() != "false":
    rudder_client.track(user_id=user.id, event="chatTurnCompleted", properties={...})  # unchanged
```

## 10. MCP server: `wrap_mcp_server`

Needs the `mcp` extra. One call, before serving, on any of:

| `mcp` | Server | Example |
|---|---|---|
| 2.x | `MCPServer` from `mcp.server.mcpserver`, low-level `Server` from `mcp.server.lowlevel` | `mcp-server`, `mcp-server-lowlevel` |
| 1.x (`>=1.30.0`) | `FastMCP` from `mcp.server.fastmcp`, the 1.x low-level `Server` | `mcp-server-fastmcp-v1` |

The line is detected from the server object; anything else (the standalone `fastmcp` package) raises `TypeError`. Protocol 2026-07-28 (stateless) is served on 2.x only; 1.x serves up to 2025-11-25.


```python
from rudderstack.ai.mcp import wrap_mcp_server


def identify(auth):  # verified AccessToken, or None over stdio / without auth
    return {"user_id": auth.subject, "account_id": workspace_of(auth)} if auth else {}


wrap_mcp_server(
    server,
    analytics=rudder_client,
    identify=identify,
    request_context={"intents": ["debug_delivery", "build_audience"]},  # without other; False turns it off
    # event_rules={"tools": {"create_audience": "audience_created"}},
    # capability_requests={"capabilities": ["bulk_export"]},
)
server.run("stdio")
rudder_client.flush()  # after run() returns; HTTP apps flush in the lifespan shutdown
```

`identify` defaults to the token's `subject`, `client_id` and `scopes`; if it raises, the request goes out as `ai_system`. State (`mcp_client_seen` window, call counters, retry hashes, pending `input_required` items) is in memory per server name, per process: servers wrapped under one name share it, so give each distinct server a unique name; each replica reports its own `mcp_client_seen`. `call_reason` and `capability_detail` are sent only with `capture_content`. MCP Events helpers (`mcp_events=True`, `track_mcp_event_subscription`, `wrap_mcp_event_sender`) only when the plan turns them on: experimental. A delivery passed to the wrapped sender without `subscription_id` or `event_id` is dropped (the sender still runs) with one warning per process; one without `event_name` is sent as `unknown`.

- A declared tool event follows its `mcp_tool_called` with `tool_status` `success` or `error`, also when the call failed argument validation; analyses that count only completed actions filter on `tool_status: success`.
- On 2026-07-28, an elicited call's `input_required` leg sends no `mcp_tool_called`; the retry that completes it does, keeping the leg's `call_index`.

An agent on the OpenAI Agents SDK passes its `interaction_id` to MCP servers with `tool_meta_resolver=rudderstack_mcp_tool_meta()` (from `rudderstack.ai.openai_agents`) on `MCPServerStdio` / `MCPServerStreamableHttp` / `MCPServerSse`, so `mcp_tool_called` joins the answer that made it (example `openai-agents-mcp`). It also sends the interaction's `trace_id` when it has one, and the W3C `traceparent` only under a `link_trace_id=True` span processor; without a `trace_id`, neither side has one.

## 11. Tests

Per surface, a server-side test that drives the entry point with the app's existing model mock and asserts the captured events through a stub client:

```python
import rudderstack.ai


class StubClient:
    def __init__(self):
        self.events = []

    def track(self, **kwargs):
        self.events.append(kwargs)


def test_chat_sends_one_answer(client):  # the app's own test client fixture
    stub = StubClient()
    rudderstack.ai.configure(analytics=stub)
    client.post("/chat", json={"message": "hi", "conversation_id": "c1"})
    rudderstack.ai.flush()
    answers = [e for e in stub.events if e["event"] == "ai_response_received"]
    assert len(answers) == 1
    assert answers[0]["properties"]["conversation_id"] == "c1"
```

## Troubleshooting

Logs: `RUDDERSTACK_AI_DEBUG=1` logs everything the SDK drops or ignores (to the app's logging handlers, else stderr); or `logging.getLogger("rudderstack.ai").setLevel(logging.DEBUG)`.

| Symptom | Fix |
|---|---|
| Warning "no RudderStack client" | `configure(analytics=...)` did not run before the first event |
| Every model call is its own answer | calls outside `ai_interaction`, in a thread pool without `propagate`, a stream without `bind()`, or a LangChain handler on a model |
| Events missing in a script | `flush()` before exit |
| No `trace_id` | the app passed none and the span processor was registered without `link_trace_id=True` |
| No `mcp_server` in an OpenAI Agents `tool_breakdown` | Agents SDK tracing is off (`tracing_disabled=True`, `OPENAI_AGENTS_DISABLE_TRACING`) |
| `response_text` / breakdown entries missing on a large answer | the event was over 30,000 bytes of properties: captured text is dropped first, then `tool_breakdown` and `usage_breakdown` entries from the end; a declared tool event loses its `properties()` output |
