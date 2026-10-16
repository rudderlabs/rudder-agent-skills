# Python recipes (`rudderstack-ai`, spec v0.3)

Python 3.12+. The package has no dependencies of its own; the extra for each library the app uses (`openai`, `anthropic`, `google-genai`, `bedrock`, `langchain`, `openai-agents`, `claude-agent-sdk`, `litellm`, `mcp`, `tracing`) only declares the supported version of that library, which the app already has. `tracing` is only for exporting OpenTelemetry spans; AI events do not need it.

`<VERSION>` below is the release that ships spec v0.3: the first `rudderstack-ai` version on PyPI after 0.4.0 whose changelog names spec v0.3 (and, for MCP servers, has the `mcp` extra). 0.4.0 ships spec v0.2 and has no `rudderstack.ai.mcp`; if no v0.3 release exists yet, stop and tell the user instead of installing 0.4.0 or a branch build.

## 1. Install (exact pins)

| Manager | Command or line |
|---|---|
| uv | `uv add "rudderstack-ai[openai]==<VERSION>"` |
| poetry | `poetry add "rudderstack-ai[openai]==<VERSION>"` |
| pip + requirements file | add `rudderstack-ai[openai]==<VERSION>` to `requirements.txt`, then `pip install -r requirements.txt` |
| pyproject without a lock tool | add `"rudderstack-ai[openai]==<VERSION>"` to `[project] dependencies` |

Replace `openai` with the plan's `extras`, comma-separated (`rudderstack-ai[anthropic,langchain]==<VERSION>`). The `mcp` extra pins the `mcp` package exactly (v2): an MCP server on `mcp` 1.x or the standalone `fastmcp` package is `blocked` in the plan, not upgraded here. Only when the plan says `rudderstack.client: new`, also add `rudder-sdk-python==2.1.9`. If the resolver tries to move an existing library (for example LiteLLM needs `openai<3`), stop and ask.

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

## 3. Wrap the model client (or add the framework integration)

```python
from openai import OpenAI
from rudderstack.ai.openai import wrap_openai

client = wrap_openai(OpenAI())  # a proxy: isinstance(client, OpenAI) is False; rudderstack.ai.unwrap(client) returns the original
```

| Integration | Change |
|---|---|
| Anthropic | `wrap_anthropic(Anthropic())` from `rudderstack.ai.anthropic` (`AnthropicBedrock`: `provider="aws.bedrock"`; `AnthropicVertex`: `provider="gcp.vertex_ai"`) |
| Google Gen AI | `wrap_google_genai(genai.Client(...))` from `rudderstack.ai.google_genai` |
| Bedrock | `wrap_bedrock(boto3.client("bedrock-runtime", region_name=...))` from `rudderstack.ai.bedrock` |
| LangChain / LangGraph / Deep Agents | `handler = RudderStackCallbackHandler(agent_name="support_agent")` from `rudderstack.ai.langchain`; add it to the run's `config={"callbacks": [handler]}`, never to a model constructor; tag agents with `"tags": ["agent:<name>"]` |
| Claude Agent SDK | `tracked_query(prompt=..., options=..., user_id=..., conversation_id=...)` from `rudderstack.ai.claude_agent_sdk` instead of `query()`; `ClaudeSDKClient`: `async for m in tracked_messages(client.receive_response())` |
| OpenAI Agents SDK | `await tracked_run(agent, input, tracking={"user_id": ..., "feature": ...})` from `rudderstack.ai.openai_agents` |
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
- `trace_id` is never set automatically in spec v0.3: pass `trace_id=` (or `interaction.set_trace_id(...)`) only when the plan has a tracing source, or `register_tracing(link_trace_id=True)` with the SDK's span export. Extras via `interaction.end(extra_properties={...})`.
- `client_disconnected: true` comes from `AIContextMiddleware` (ASGI: FastAPI, Starlette) or a bound stream closed early. Django and Flask (WSGI) report no disconnect: only a bound streaming generator closed by the server sets it; pass `interaction.end(client_disconnected=True)` where the app detects it itself.
- Statuses need no code: the integrations report `paused` with `pause_reason`, `incomplete` with `max_turns`, `max_budget_usd` or `length`, and `content_filter` as an error. A run the app pauses itself: `interaction.end(pause_reason="approval")`.
- Async routes: `async with ai_interaction(...)` works the same.

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
    "feedback_given",  # feedback_retracted | copied_response | shared | reported | regenerated | accepted | rejected | edited
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

The client's own `shutdown()` blocks until its queue drains, retries included: in a daemon, bound it (run it in a thread and join with a timeout) so an outage cannot hold up exit.

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

Only the keys the plan enables. Event names starting with `ai_` or `mcp_` are reserved. Price options the plan may list, through `rudderstack.ai.register_price(model, ...)`: `tier_multipliers={"batch": 0.5, "flex": 0.5, "fast": 2}`, `long_context={"threshold_tokens": 200_000, "input_per_mtok": ..., "output_per_mtok": ...}`, `server_tool_per_call={"web_search": 0.01}`, `cache_write_1h_per_mtok=`. Service tier, 1-hour cache writes and hosted tool calls are read from responses automatically.

A score computed elsewhere (a human review, an offline judge):

```python
from rudderstack.ai import track_score

track_score(interaction_id=iid, conversation_id=cid, evaluation_name="groundedness", score_value=0.82, evaluator="model")
```

`explanation=` is content: sent only with `capture_content`.

## 9. Legacy event behind a flag

```python
# Old hand-built event, kept for the migration window (ai-events.yaml legacy_events).
if os.environ.get("AI_EVENTS_LEGACY_EVENT", "true").lower() != "false":
    rudder_client.track(user_id=user.id, event="chatTurnCompleted", properties={...})  # unchanged
```

## 10. MCP server: `wrap_mcp_server`

Needs the `mcp` extra and an `mcp` v2 server (`mcp.server.mcpserver.MCPServer` or the low-level `mcp.server.lowlevel.Server`). One call, before serving:

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

`identify` defaults to the token's `subject`, `client_id` and `scopes`; if it raises, the request goes out as `ai_system`. `call_reason` and `capability_detail` are sent only with `capture_content`. MCP Events helpers (`mcp_events=True`, `track_mcp_event_subscription`, `wrap_mcp_event_sender`) only when the plan turns them on: experimental.

An agent on the OpenAI Agents SDK passes its `interaction_id` to MCP servers with `tool_meta_resolver=rudderstack_mcp_tool_meta()` (from `rudderstack.ai.openai_agents`) on `MCPServerStdio` / `MCPServerStreamableHttp` / `MCPServerSse`, so `mcp_tool_called` joins the answer that made it.

## Troubleshooting

Logs: `logging.getLogger("rudderstack.ai").setLevel(logging.DEBUG)`.

| Symptom | Fix |
|---|---|
| Warning "no RudderStack client" | `configure(analytics=...)` did not run before the first event |
| Every model call is its own answer | calls outside `ai_interaction`, in a thread pool without `propagate`, a stream without `bind()`, or a LangChain handler on a model |
| Events missing in a script | `flush()` before exit |
