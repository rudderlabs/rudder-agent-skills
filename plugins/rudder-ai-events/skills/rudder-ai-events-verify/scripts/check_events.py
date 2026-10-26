"""Check captured AI events: spec schema, client schema, joins, counts, identity, background, MCP and content.

Usage: check_events.py events.jsonl --spec ai-events-v0.3.schema.json [flags]; see references/verification.md.
Server events without context.wrapperLibrary are not from the AI SDK: they are skipped, or counted as
legacy events when named with --expect-legacy.
"""
import argparse
import collections
import json
import sys

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

SPEC_VERSION = "0.3.0"
SDK_NAMES = {"@rudderstack/ai", "rudderstack-ai", "ai-sdk-go"}  # context.wrapperLibrary.name: Node.js, Python, Go
SPEC_EVENTS = {"ai_user_prompt_created", "ai_response_received", "ai_user_action", "ai_interaction_classified",
               "ai_interaction_scored", "ai_llm_response_received"}
CLIENT_COPIES = {"ai_user_prompt_created", "ai_response_received", "ai_user_action"}
FAILURE_STATUSES = {"error", "timeout", "cancelled", "incomplete"}  # what an app-caught failure may report
CLIENT_ONLY = {"ai_assistant_opened", "ai_assistant_closed", "ai_conversation_started",
               "ai_conversation_switched", "ai_conversation_renamed", "ai_conversation_deleted"}
MCP_EVENTS = {"mcp_client_seen", "mcp_tool_called", "mcp_elicitation_completed", "mcp_capability_requested",
              "mcp_resource_read", "mcp_prompt_used", "mcp_event_subscription_changed", "mcp_event_delivered"}
CONTENT = {"prompt_text", "response_text", "intent_summary", "explanation", "call_reason", "capability_detail"}
RAW_MCP = {"arguments", "args", "params", "result", "results", "content", "structuredContent", "uri", "request"}

p = argparse.ArgumentParser()
p.add_argument("events")
p.add_argument("--spec", required=True, help="ai-events-v0.3.schema.json")
p.add_argument("--client-schema", help="assets/ai-client-events.schema.json")
p.add_argument("--capture-content", action="store_true", help="the plan sets capture_content: true")
p.add_argument("--expect-legacy", action="append", default=[], help="legacy event that must still be sent")
p.add_argument("--no-ai-events", action="store_true",
               help="captured with the AI events switch off: no SDK event and no browser AI event may appear")
p.add_argument("--absent", action="append", default=[],
               help="legacy event that must not appear (its switch is off); AI SDK events and browser AI copies "
                    "of the same name do not count")
p.add_argument("--feature", action="append", default=[], help="allowed feature values (the plan's surfaces)")
p.add_argument("--surface", action="append", default=[], help="allowed surface values (the plan's surfaces)")
p.add_argument("--user-id", help="userId expected on user-triggered server events that carry one")
p.add_argument("--expect-session", action="store_true", help="user-triggered server events carry context.sessionId")
p.add_argument("--expect-joins", action="store_true",
               help="the client side was driven with the server's interaction IDs: every gap between sides fails")
p.add_argument("--client-surface", action="append", default=[],
               help="a surface with a browser client (the plan's client surfaces): only its turns need client copies")
p.add_argument("--client-opt-out", action="append", default=[],
               choices=["client_prompt", "client_response", "client_feedback", "server_feedback"],
               help="a copy the plan's client_events.opt_out drops: not expected, and fails if sent")
p.add_argument("--feedback-endpoint", action="append", default=[],
               help="action_type of a planned feedback endpoint (surfaces[].feedback): its browser copy needs a server one")
p.add_argument("--failed-interaction", action="append", default=[],
               help="interaction_id of a turn the app failed and caught itself: its answer must not be success")
p.add_argument("--mcp-server", action="append", default=[], help="allowed server_name values (the plan's MCP servers)")
p.add_argument("--mcp-intent", action="append", default=[], help="allowed request_context intents (other is implied)")
args = p.parse_args()



def load_schema(path):
    """A schema file with an $id and an object $defs; exits 2 otherwise."""
    try:
        schema = json.load(open(path))
    except (OSError, ValueError):
        schema = None
    if not isinstance(schema, dict) or not isinstance(schema.get("$id"), str) or not isinstance(schema.get("$defs"), dict):
        print(f"{path}: cannot read schema (needs a string $id and an object $defs)", file=sys.stderr)
        sys.exit(2)
    return schema


def resource(schema):
    return Resource.from_contents(schema, default_specification=DRAFT202012)


spec = load_schema(args.spec)
registry = Registry().with_resource(spec["$id"], resource(spec))
client = load_schema(args.client_schema) if args.client_schema else None
# browser AI event names: only these count as AI traffic when they carry source: client
client_names = {n for n in client["$defs"] if n.startswith("ai_")} if client else CLIENT_COPIES | CLIENT_ONLY
if client:
    registry = registry.with_resource(client["$id"], resource(client))


def validator(schema, name):
    return Draft202012Validator({"$ref": f"{schema['$id']}#/$defs/{name}"}, registry=registry)


problems, notes = [], []
messages = [json.loads(line) for line in open(args.events) if line.strip()]
tracks = [m for m in messages if m.get("type", "track") == "track" and m.get("event")]
by_interaction = collections.defaultdict(collections.Counter)
conversations = collections.defaultdict(set)
names = collections.Counter()
legacy = collections.Counter()
clients_seen = collections.Counter()
answers, surfaces = {}, {}
declared = collections.Counter()  # non-MCP declared tool events per interaction_id
actions = collections.defaultdict(lambda: {"server": collections.Counter(), "client": collections.Counter()})
runs, tool_calls = [], []

for i, m in enumerate(tracks):
    name, props = m["event"], m.get("properties") or {}
    user = m.get("userId") or m.get("user_id")
    anon = m.get("anonymousId") or m.get("anonymous_id")
    context = m.get("context") or {}
    w = context.get("wrapperLibrary") or {}
    is_client = props.get("source") == "client" and name in client_names  # a legacy event may use source too
    where = f"#{i} {name}"
    # Provenance: only the AI SDKs' wrapperLibrary marks an AI send; another adapter's tag is still legacy,
    # unless the event uses an AI name (then it falls through and fails the SDK-name check).
    foreign = w and w.get("name") not in SDK_NAMES and name not in SPEC_EVENTS | MCP_EVENTS | CLIENT_ONLY
    if (not w or foreign) and not is_client:  # not sent through the AI SDK: legacy or other analytics
        legacy[name] += 1
        if name in CLIENT_ONLY and name not in args.expect_legacy:  # browser-only: a missing source is the bug
            problems.append(f"{where}: client-only event without source: client "
                            f"(pass --expect-legacy {name} if it is a legacy event)")
        elif name in SPEC_EVENTS | MCP_EVENTS and name not in args.expect_legacy:
            problems.append(f"{where}: no context.wrapperLibrary (not sent by the AI SDK; "
                            f"pass --expect-legacy {name} if it is a legacy event)")
        continue
    names[name] += 1
    is_mcp = name in MCP_EVENTS or w.get("integration") == "mcp"
    is_declared = not name.startswith(("ai_", "mcp_")) and "tool_status" in props
    if not (name.startswith(("ai_", "mcp_")) or is_declared):
        continue
    if not user and not anon and not is_client:
        problems.append(f"{where}: no userId or anonymousId")
    if name in CLIENT_ONLY and not is_client:
        problems.append(f"{where}: client-only event without source: client")
    if is_client and client:
        problems += [f"{where} (client schema): {e.message}" for e in validator(client, name).iter_errors(props)] \
            if name in client["$defs"] else [f"{where}: not a client event name"]
    definition = ("mcp_declared_tool_event" if is_mcp else "declared_tool_event") if is_declared else name
    if name in SPEC_EVENTS | MCP_EVENTS or is_declared:  # client copies: spec and client schema
        if is_client and name not in CLIENT_COPIES:
            problems.append(f"{where}: source: client on an event the browser never sends")
        problems += [f"{where} (spec): {e.message}" for e in validator(spec, definition).iter_errors(props)]
        if not is_client and w.get("specVersion") != SPEC_VERSION:
            problems.append(f"{where}: context.wrapperLibrary.specVersion is {w.get('specVersion')!r}")
        if not is_client and w.get("name") not in SDK_NAMES:
            problems.append(f"{where}: context.wrapperLibrary.name is {w.get('name')!r}, not one of {sorted(SDK_NAMES)}")
    # trackAction takes no feature, so server ai_user_action has none; MCP events have none either;
    # a standalone score carries one only when given, and ai_otel_span (tracing) none by default:
    # check it only when present
    optional_feature = name in {"ai_interaction_scored", "ai_otel_span"} and "feature" not in props
    if args.feature and not is_mcp and not optional_feature and (is_client or name != "ai_user_action") \
            and props.get("feature") not in args.feature:
        problems.append(f"{where}: feature {props.get('feature')!r} not in {args.feature}")
    system = props.get("trigger") == "system"
    optional_surface = name == "ai_user_action" and not is_client and "surface" not in props  # trackAction: optional
    if args.surface and not system and not optional_surface and (is_client or name in CLIENT_COPIES) \
            and props.get("surface") not in args.surface:
        problems.append(f"{where}: surface {props.get('surface')!r} not in {args.surface}")
    if not args.capture_content:
        leaked = CONTENT & props.keys() | ({"feedback_text"} & (props.get("action_details") or {}).keys())
        if leaked:
            problems.append(f"{where}: content sent with capture off: {sorted(leaked)}")
    if system and user:
        problems.append(f"{where}: system-triggered event carries userId {user!r}")
    if not system and not is_client and name in {"ai_user_prompt_created", "ai_response_received"}:
        if args.user_id and not user:  # an anonymousId fallback hides broken user wiring
            problems.append(f"{where}: no userId, expected {args.user_id!r}")
        elif args.user_id and user != args.user_id:
            problems.append(f"{where}: userId {user!r}, expected {args.user_id!r}")
        if args.expect_session and not context.get("sessionId"):
            problems.append(f"{where}: no context.sessionId (cookies not read?)")
    if system and name == "ai_response_received":
        if not props.get("task_name"):
            notes.append(f"{where}: system answer without task_name (a call outside any interaction or task?)")
        runs.append(props)
    if is_mcp:
        leaked = RAW_MCP & props.keys()
        if leaked:
            problems.append(f"{where}: raw MCP payload keys {sorted(leaked)}")
        if args.mcp_server and props.get("server_name") not in args.mcp_server:
            problems.append(f"{where}: server_name {props.get('server_name')!r} not in {args.mcp_server}")
        if "request_context" in (props.get("argument_keys") or []):
            # a tool declaring its own request_context gets it untouched, and the SDK records none of its fields
            if {"intent", "user_sentiment", "call_reason"} & props.keys():
                problems.append(f"{where}: request_context reached the tool (argument_keys)")
            else:
                notes.append(f"{where}: request_context in argument_keys (fine if the tool declares its own)")
        if args.mcp_intent and "intent" in props and props["intent"] not in args.mcp_intent + ["other"]:
            problems.append(f"{where}: intent {props['intent']!r} not in the server's list")
        if name == "mcp_client_seen":
            clients_seen[(props.get("server_name"), props.get("client_name"), props.get("oauth_client_id"), user)] += 1
        if name == "mcp_tool_called":
            tool_calls.append(props)
        continue  # MCP interaction_id joins the calling answer; it is not an answer of its own
    iid = props.get("interaction_id")
    if iid:
        # a paused run resumes under the same interaction_id: count only final answers
        paused = name == "ai_response_received" and props.get("response_status") == "paused"
        by_interaction[iid][(name + (" (paused)" if paused else ""), "client" if is_client else "server")] += 1
        if props.get("conversation_id"):
            conversations[iid].add(props["conversation_id"])
        if is_declared:
            declared[iid] += 1
        if name == "ai_user_action":
            actions[iid]["client" if is_client else "server"][props.get("action_type")] += 1
        if not is_client and props.get("surface") and name in CLIENT_COPIES:
            surfaces[iid] = props["surface"]
        if name == "ai_response_received" and not is_client and (not paused or iid not in answers):
            answers[iid] = props

# Server rows are the counted ones; client copies (source: client) sit alongside them, one per side.
has_client_copies = any(c[("ai_response_received", "client")] or c[("ai_user_prompt_created", "client")]
                        for c in by_interaction.values())
gap = problems.append if args.expect_joins else notes.append
# feedback types with a server endpoint: planned, or sent by the server in this capture; others are browser-only
server_actions = set(args.feedback_endpoint) | {a for sides in actions.values() for a in sides["server"]}
for iid, c in by_interaction.items():
    for side in ("server", "client"):
        if c[("ai_response_received", side)] > 1:
            problems.append(f"interaction {iid}: {c[('ai_response_received', side)]} {side} ai_response_received (expected 1)")
        if c[("ai_user_prompt_created", side)] > 1:
            problems.append(f"interaction {iid}: {c[('ai_user_prompt_created', side)]} {side} ai_user_prompt_created (expected at most 1)")
    if c[("ai_user_prompt_created", "server")] and not (c[("ai_response_received", "server")]
                                                        or c[("ai_response_received (paused)", "server")]):
        problems.append(f"interaction {iid}: server prompt without a server ai_response_received")
    # exempt only a known server-only surface; an ID with no server event (stale browser ID) is still checked
    server_only = args.client_surface and iid in surfaces and surfaces[iid] not in args.client_surface
    if (has_client_copies or args.expect_joins) and iid not in {r.get("interaction_id") for r in runs} and not server_only:
        if c[("ai_user_prompt_created", "client")] and not c[("ai_user_prompt_created", "server")]:
            gap(f"interaction {iid}: client prompt with no server prompt (request never reached the SDK, or a different ID)")
        if c[("ai_user_prompt_created", "server")] and not c[("ai_user_prompt_created", "client")] \
                and "client_prompt" not in args.client_opt_out:
            gap(f"interaction {iid}: server prompt with no client copy (browser copy not sent, or a different ID)")
        if c[("ai_response_received", "server")] and not c[("ai_response_received", "client")] \
                and "client_response" not in args.client_opt_out:
            gap(f"interaction {iid}: server answer with no client copy (not shown, client left, or client event lost)")
        if c[("ai_response_received", "client")] and not c[("ai_response_received", "server")]:
            gap(f"interaction {iid}: client answer with no server answer (request never reached the SDK, or a different ID)")
        for action in sorted(server_actions):
            server, browser = actions[iid]["server"][action], actions[iid]["client"][action]
            if server and not browser and "client_feedback" not in args.client_opt_out:
                gap(f"interaction {iid}: server ai_user_action {action} with no client copy (browser handler not wired?)")
            if browser and not server and "server_feedback" not in args.client_opt_out:
                gap(f"interaction {iid}: client ai_user_action {action} with no server copy (endpoint not wired, or a different ID)")
    # An opted-out copy was dropped from the plan, so sending it is a regression, not a gap.
    if "client_prompt" in args.client_opt_out and c[("ai_user_prompt_created", "client")]:
        problems.append(f"interaction {iid}: client prompt copy sent, but the plan opts it out")
    if "client_response" in args.client_opt_out and c[("ai_response_received", "client")]:
        problems.append(f"interaction {iid}: client answer copy sent, but the plan opts it out")
    if "client_feedback" in args.client_opt_out and any(actions[iid]["client"][a] for a in server_actions):
        problems.append(f"interaction {iid}: client feedback copy sent, but the plan opts it out")
    if "server_feedback" in args.client_opt_out and sum(actions[iid]["server"].values()):
        problems.append(f"interaction {iid}: server ai_user_action sent, but the plan opts it out (server_feedback)")
    responses = sum(c[(e, side)] for e in ("ai_response_received", "ai_response_received (paused)")
                    for side in ("server", "client"))
    for event in ("ai_user_action", "ai_interaction_scored"):
        if (c[(event, "server")] or c[(event, "client")]) and not responses:
            gap(f"interaction {iid}: {event} for an answer not in this capture")
    if declared[iid] and not responses:
        gap(f"interaction {iid}: declared tool event {sorted(n for (n, _) in c if n not in SPEC_EVENTS)} "
            f"for an answer not in this capture")
    if len(conversations[iid]) > 1:
        problems.append(f"interaction {iid}: several conversation_id values {sorted(conversations[iid])}")

for iid in args.failed_interaction:
    answer = answers.get(iid)
    if answer is None:
        problems.append(f"failed interaction {iid}: no server ai_response_received")
    elif answer.get("response_status") not in FAILURE_STATUSES:
        problems.append(f"failed interaction {iid}: response_status {answer.get('response_status')!r}, "
                        f"expected one of {sorted(FAILURE_STATUSES)}")
    elif not answer.get("error_type"):
        problems.append(f"failed interaction {iid}: no error_type (end it with a status and error type)")

for r in runs:
    parent = r.get("parent_interaction_id")
    if parent and parent not in by_interaction:
        notes.append(f"task {r.get('task_name')}: parent_interaction_id {parent} not in this capture")
    print("run:", {k: r.get(k) for k in ("task_name", "trigger_source", "trigger_event_id", "conversation_id", "account_id",
                                          "on_behalf_of", "parent_interaction_id", "llm_call_count", "total_tokens")})

for key, count in clients_seen.items():
    if count > 1:
        notes.append(f"mcp_client_seen {key}: {count} times in one window (several processes, or a restart?)")
for t in tool_calls:
    joined = t.get("interaction_id") in answers  # the calling answer, not any event sharing the ID
    print("mcp call:", {k: t.get(k) for k in ("server_name", "client_name", "protocol_version", "tool_name", "tool_status",
                                               "error_type", "intent", "user_sentiment")}, "joined" if joined else "")
if tool_calls:
    named = sum(1 for t in tool_calls if t.get("client_name"))
    print(f"mcp client_name: on {named} of {len(tool_calls)} tool calls")

for name in args.expect_legacy:
    if not legacy[name]:
        problems.append(f"legacy event {name} was not sent (it must keep sending during migration)")
for name in args.absent:  # legacy provenance only: an AI event may share the legacy event's name
    if legacy[name]:
        problems.append(f"legacy {name} sent {legacy[name]} times; its switch is off")
# browser AI events carry no wrapperLibrary: trackAi must follow the switch too
sdk_events = sum(1 for m in tracks if ((m.get("context") or {}).get("wrapperLibrary") or {}).get("name") in SDK_NAMES)
browser_events = sum(1 for m in tracks if (m.get("properties") or {}).get("source") == "client" and m["event"] in client_names)
if args.no_ai_events and sdk_events:
    problems.append(f"{sdk_events} AI SDK events sent with the AI events switch off")
if args.no_ai_events and browser_events:
    problems.append(f"{browser_events} browser AI events sent with the AI events switch off (trackAi not gated on it)")
if not args.no_ai_events and not sdk_events and not browser_events:  # a silent recorder must not pass
    problems.append("no AI events captured (recorder not wired, or the AI events switch is off)")

print("events:", dict(names))
print("legacy or other events (no wrapperLibrary):", dict(legacy))
print("sdks:", dict(collections.Counter((m.get("context") or {}).get("wrapperLibrary", {}).get("name") for m in tracks
                                       if (m.get("properties") or {}).get("source") != "client" and (m.get("context") or {}).get("wrapperLibrary"))))
print("interactions:", len(by_interaction))
for n in notes:
    print("note:", n)
for pr in problems:
    print("FAIL:", pr)
print("RESULT:", "FAIL" if problems else "PASS")
sys.exit(1 if problems else 0)
